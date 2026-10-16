// World setup and upgrades. Set up the world (Street Control or the welcome card): every London map, the pregens
// (assigned to players in the same dialog), the crew, every Londoner and motor, the item library filed by type,
// the guides, and starter job vehicles on Hackney Central. Running it again only adds what is missing.
// Upgrades run once per version on the active GM: edited characters, items, notes, ownership and positions survive.
import {NS} from './config.mjs';
import {isLeader, esc, card} from './world/net.mjs';
import {findOrImportScene, loadAtlas, importAllMaps, STREET_FOLDER} from './map/map-transit.mjs';
import {placeToken, zonesOf, lanePoint} from './world/spawn.mjs';
import {repairAllSceneBackgrounds} from './map/scene-repair.mjs';
import {applyDriverControl, reconcileOccupants} from './vehicles/vehicle-boarding.mjs';
import {textHash} from './text-hash.mjs';

export const VERSION = '0.4.0';
let setupRunning = null;
const guideAliases = {'player-guide': ['The Smoke — Player Guide'], 'gm-guide': ['The Smoke — GM Guide'], 'missions-guide': ['Hackney Missions — On Your Bike']};
const norm = s => String(s ?? '').toLowerCase().trim();
async function folder(name, type = 'Actor', color = '#ff8a3d') {
  return game.folders.find(f => f.type === type && f.name === name && !f.folder) ?? Folder.implementation.create({name, type, color});
}
async function loadJSON(f) { const r = await fetch(`systems/${NS}/data/${f}`); return r.ok ? r.json() : {}; }
async function content() { const response = await fetch(`systems/${NS}/data/content.json`); if (!response.ok) throw new Error('The bundled content file is missing.'); return response.json(); }

/* ------------------------------------------------------------------ the item library, filed by type */
const KIT_FOLDERS = Object.freeze({weapon: 'Weapons', ammo: 'Ammo', armour: 'Armour', outfit: 'Clobber', gear: 'Tools & Gear', consumable: 'Food & Medicine', drug: 'Drugs', perk: 'Perks', condition: 'Conditions'});
async function subfolder(name, parent, sort) {
  return game.folders.find(f => f.type === 'Item' && f.name === name && (f.folder?.id ?? null) === parent.id)
    ?? Folder.implementation.create({name, type: 'Item', color: '#e9cc8c', folder: parent.id, sort, sorting: 'a'});
}
/** Add any library item the world does not have yet (by content key, or by type and name), into The Smoke — Kit / <type>. */
export async function syncItemLibrary(items = null) {
  if (!game.user.isGM) return 0;
  items ??= (await content().catch(() => null))?.items ?? (await loadJSON('london-items.json')).items ?? [];
  const keys = new Set(game.items.map(i => i.getFlag?.(NS, 'contentKey')).filter(Boolean));
  const have = new Set(game.items.map(i => `${i.type}:${norm(i.name)}`));
  const root = await folder('The Smoke — Kit', 'Item', '#e9cc8c'); const out = []; let sort = 0;
  for (const [type, label] of Object.entries(KIT_FOLDERS)) {
    sort += 1000;
    const todo = items.filter(i => i.type === type && !keys.has(i.flags?.[NS]?.contentKey) && !have.has(`${i.type}:${norm(i.name)}`)); if (!todo.length) continue;
    const sub = await subfolder(label, root, sort);
    out.push(...todo.map(i => { const d = foundry.utils.deepClone(i); delete d._id; d.folder = sub.id; return d; }));
  }
  if (out.length) await Item.implementation.createDocuments(out);
  return out.length;
}

/* ------------------------------------------------------------------ bringing existing items and characters up to date */
const SYNC_FIELDS = ['category', 'ammoType', 'effect', 'burst', 'thrown', 'twoHanded', 'restricted'];
/** Items made before 0.2 get the library's new weapon fields and icons; finished characters are marked as made. */
export async function migrateItems(items = null) {
  if (!game.user.isGM) return 0;
  items ??= (await loadJSON('london-items.json')).items ?? [];
  const byName = new Map(items.map(i => [`${i.type}:${i.name}`, i])); let n = 0;
  const fix = async doc => {
    const lib = byName.get(`${doc.type}:${doc.name}`); if (!lib) return;
    const up = {};
    if (doc.type === 'weapon') for (const k of SYNC_FIELDS) if (lib.system[k] !== undefined && doc.system[k] !== lib.system[k] && (!doc.system[k] || k === 'category')) up[`system.${k}`] = lib.system[k];
    const img = String(doc.img || '');
    if ((img.startsWith('icons/svg/') || img.startsWith(`systems/${NS}/assets/ui/`)) && lib.img) up.img = lib.img;
    if (Object.keys(up).length) { await doc.update(up); n++; }
  };
  for (const i of game.items) await fix(i);
  for (const a of game.actors) {
    for (const i of a.items) await fix(i);
    if (a.type === 'character' && !a.system.creation?.done && Object.values(a.system.stats || {}).some(s => Number(s.die) > 4)) { await a.update({'system.creation.done': true}); n++; }
  }
  return n;
}

/* ------------------------------------------------------------------ guides */
function actorMatches(actor, source) {
  const f = source.flags[NS];
  if (actor.getFlag(NS, 'contentKey') === f.contentKey) return true;
  if (actor.type !== source.type || actor.getFlag(NS, 'streetLife') || actor.getFlag(NS, 'dedicatedFor')) return false;
  return Boolean(f.npcKey && actor.getFlag(NS, 'npcKey') === f.npcKey || f.catalogId && actor.getFlag(NS, 'catalogId') === f.catalogId);
}
let guideHistory = null;
/** Fingerprints of the pages earlier releases shipped (data/guide-history.json). */
async function shippedBefore() {
  if (guideHistory) return guideHistory;
  try { const r = await fetch(`systems/${NS}/data/guide-history.json`); guideHistory = r.ok ? await r.json() : {}; } catch (_e) { guideHistory = {}; }
  return guideHistory;
}
/** Bring a world's copy of a guide up to date: add missing pages, and refresh every page that is still word for word as an
 * earlier release shipped it. A page the GM has edited is left alone. Returns how many pages were refreshed. */
export async function updateGuide(entry, source) {
  const key = source.flags[NS].contentKey, ownership = {...entry.ownership, default: source.ownership.default};
  if (!source.ownership.default) for (const u of game.users) if (!u.isGM) ownership[u.id] = 0;
  await entry.update({ownership, [`flags.${NS}.contentKey`]: key});
  let refreshed = 0;
  if (entry.pages?.contents || Array.isArray(entry.pages)) {
    const pages = Array.from(entry.pages.contents ?? entry.pages), names = new Set(pages.map(p => norm(p.name)));
    const extra = source.pages.filter(p => !names.has(norm(p.name))).map(p => { const d = foundry.utils.deepClone(p); delete d._id; return d; });
    if (extra.length) await entry.createEmbeddedDocuments('JournalEntryPage', extra);
    if (!source.ownership.default && pages.length) await entry.updateEmbeddedDocuments('JournalEntryPage', pages.map(p => ({_id: p.id, ownership: {default: -1}})));
    const history = await shippedBefore(), byName = new Map(source.pages.map(p => [norm(p.name), p])), updates = [];
    for (const page of pages) {
      const src = byName.get(norm(page.name)); if (!src?.text?.content) continue;
      const want = src.flags?.[NS]?.textHash ?? textHash(src.text.content), now = textHash(page.text?.content), mark = page.flags?.[NS]?.textHash;
      if (now === want) { if (mark !== want) updates.push({_id: page.id, [`flags.${NS}.textHash`]: want}); continue; }
      if (now === mark || (history[`${key}|${src.name}`] || []).includes(now)) { updates.push({_id: page.id, 'text.content': src.text.content, [`flags.${NS}.textHash`]: want}); refreshed++; }
    }
    if (updates.length) await entry.updateEmbeddedDocuments('JournalEntryPage', updates);
  }
  return refreshed;
}
const GM_GUIDES = ['gm-guide', 'gms-book', 'missions-guide'];
export async function openGuide(key = 'player-guide') {
  if (!game.user.isGM && GM_GUIDES.includes(key)) throw new Error('This guide is for the GM.');
  let entry = game.journal.find(j => j.getFlag(NS, 'contentKey') === key);
  if (!entry) { const docs = await game.packs.get(`${NS}.guides`)?.getDocuments(); entry = docs?.find(j => j.getFlag(NS, 'contentKey') === key); }
  if (!entry) throw new Error('Guide not found. Ask the GM to run world setup.'); return entry.sheet.render(true);
}

/* ------------------------------------------------------------------ setting up the world */
export async function installWorld({assignments = {}, allMaps = true, openStart = false, notify = true} = {}) {
  if (!game.user.isGM || !isLeader()) throw new Error('Use the active GM account to set up the world.');
  if (setupRunning) return setupRunning;
  const pending = installWorldNow({assignments, allMaps, openStart, notify}); setupRunning = pending;
  try { return await pending; } finally { setupRunning = null; }
}
async function installWorldNow({assignments, allMaps, openStart, notify}) {
  const data = await content(), alreadySet = Boolean(game.settings.get(NS, 'worldSetup') || game.settings.get(NS, 'contentVersion'));
  const counts = {actors: 0, items: 0, journals: 0, scenes: 0};
  const pcs = await folder('The Smoke — Player Characters', 'Actor', '#ffc467'), people = await folder('The Smoke — Crew & People'), londoners = await folder('The Smoke — Londoners', 'Actor', '#9fb2b8'), motors = await folder('The Smoke — Motors', 'Actor', '#78ecf3'), journals = await folder('The Smoke — Guides', 'JournalEntry');
  counts.items = await syncItemLibrary(data.items);
  for (const source of data.actors) {
    let actor = game.actors.find(a => actorMatches(a, source));
    if (!actor) {
      const d = foundry.utils.deepClone(source); delete d._id;
      d.folder = d.type === 'vehicle' ? motors.id : d.type === 'character' ? pcs.id : String(source.flags[NS].npcKey || '').startsWith('ped-') ? londoners.id : people.id;
      actor = await Actor.implementation.create(d); counts.actors++;
    } else if (!actor.getFlag(NS, 'contentKey')) await actor.update({[`flags.${NS}.contentKey`]: source.flags[NS].contentKey, ...(actor.type === 'character' ? {[`flags.${NS}.pregen`]: true} : {})});
    if (actor.type === 'character') {
      const user = game.users.get(assignments[source.flags[NS].npcKey]);
      if (user && !user.isGM) { await actor.update({[`ownership.${user.id}`]: 3}); if (!user.character) await user.update({character: actor.id}); }
    }
  }
  for (const source of data.journals) {
    const key = source.flags[NS].contentKey, names = [source.name, ...(guideAliases[key] ?? [])].map(norm);
    const existing = game.journal.find(j => j.getFlag(NS, 'contentKey') === key || names.includes(norm(j.name)));
    if (existing) { await updateGuide(existing, source); continue; }
    const d = foundry.utils.deepClone(source); delete d._id; d.folder = journals.id; await JournalEntry.implementation.create(d); counts.journals++;
  }
  if (allMaps) counts.scenes = (await importAllMaps({notify: false})).created;
  else for (const id of ['LDN-HACKNEY', 'LDN-OVERVIEW', 'LDP-ARCHES', 'LDP-FLAT', 'LDP-HOSPITAL', 'LDP-CUSTODY']) { const before = game.scenes.size; await findOrImportScene(id); counts.scenes += game.scenes.size - before; }
  const flat = await findOrImportScene('LDP-FLAT'), arches = await findOrImportScene('LDP-ARCHES'), hackney = await findOrImportScene('LDN-HACKNEY');
  if (!alreadySet && flat && arches) {
    const crew = game.actors.filter(a => a.type === 'character' && a.getFlag(NS, 'pregen'));
    const living = zonesOf(flat).find(z => z.service === 'safehouse') ?? zonesOf(flat)[0], g = flat.grid.size;
    for (let i = 0; i < crew.length; i++) if (!flat.tokens.some(t => t.actorId === crew[i].id)) await placeToken(flat, crew[i], living.rect[0] + 150 + (i % 2) * g * 1.5, living.rect[1] + 200 + Math.floor(i / 2) * g * 1.5, {flags: {openingCrew: true}});
    for (const [key, x, y] of [['pat', 2250, 1300], ['spanner', 1400, 400], ['kez', 650, 600]]) { const a = game.actors.find(a => a.getFlag(NS, 'npcKey') === key && !a.getFlag(NS, 'streetLife')); if (a && !arches.tokens.some(t => t.actorId === a.id)) await placeToken(arches, a, x, y); }
  }
  if (hackney) for (const id of ['LV12', 'LV23', 'LV26', 'LV06', 'LV01']) {
    if (hackney.tokens.some(t => t.getFlag(NS, 'starter') && (t.getFlag(NS, 'catalogId') ?? t.actor?.getFlag(NS, 'catalogId')) === id)) continue;
    const actor = game.actors.find(a => a.getFlag(NS, 'catalogId') === id && !a.getFlag(NS, 'streetLife') && !a.getFlag(NS, 'dedicatedFor'));
    const road = zonesOf(hackney).find(z => z.kind === 'road'); if (!actor || !road) continue;
    const p = lanePoint(road, Math.random, null, hackney); await placeToken(hackney, actor, p.x, p.y, {rotation: p.rotation, flags: {starter: true, issued: true, catalogId: id}});
  }
  await game.settings.set(NS, 'worldSetup', true); await game.settings.set(NS, 'contentVersion', VERSION);
  await repairAllSceneBackgrounds({notify: false});
  if (notify) ui.notifications.info(`The Smoke: added ${counts.actors} actors, ${counts.items} items, ${counts.journals} guides and ${counts.scenes} scenes.`);
  if (openStart && flat) { await flat.activate(); await flat.view(); }
  return counts;
}
/** Street Control → Set up the world: assign the pregens to players, import London, open Your Flat. */
export async function setupWorld() {
  if (!game.user.isGM || !isLeader()) throw new Error('Use the active GM account to set up the world.');
  const users = game.users.filter(u => !u.isGM), names = [['jaz', 'Jaz Kaur'], ['tealeaf', 'Danny “Tealeaf” Doyle'], ['femi', 'Femi Adebayo'], ['sal', 'Big Sal Moretti']];
  const owners = users.length ? names.map(([key, label]) => `<label>${label}<select name="owner-${key}"><option value="">Keep current assignment</option>${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>`).join('') : '<p>Add player accounts to assign the pregens.</p>';
  const form = await foundry.applications.api.DialogV2.input({window: {title: 'Welcome to the Smoke'}, content: `<div class="the-smoke"><p>Import London, the item library, pregens, the crew and the guides. Existing characters and notes are preserved. New worlds begin in Your Flat.</p>${owners}<label><input type="checkbox" name="allMaps" checked> Import the complete atlas</label><label><input type="checkbox" name="openStart" checked> Open Your Flat</label></div>`, ok: {label: 'Set up the world', icon: 'fa-solid fa-city'}});
  if (!form) return;
  await installWorld({assignments: Object.fromEntries(names.map(([key]) => [key, form['owner-' + key]])), allMaps: form.allMaps !== false, openStart: Boolean(form.openStart)});
  await game.settings.set(NS, 'migrationVersion', 2); return openGuide('gm-guide');
}
/** Old name for setup, kept for macros. */
export const installStarter = () => installWorld({allMaps: true, openStart: false});

/* ------------------------------------------------------------------ upgrades */
export async function migrateWorld() {
  if (!isLeader() || !game.user.isGM) return;
  if (!(game.settings.get(NS, 'worldSetup') || game.settings.get(NS, 'contentVersion'))) return welcome();
  const installed = String(game.settings.get(NS, 'contentVersion') || '0.0.0');
  if (Number(game.settings.get(NS, 'migrationVersion')) < 2) {
    // 0.1.0/0.1.1: shared vehicle templates lose temporary driver grants; driven vehicles get their own actor.
    const restore = new Map(), vehicles = [];
    for (const scene of game.scenes) for (const token of scene.tokens) {
      if (token.actor?.type !== 'vehicle') continue; vehicles.push(token);
      if (token.getFlag(NS, 'dedicatedVehicle')) continue;
      for (const grant of token.getFlag(NS, 'vehicleDriverGrant') ?? []) { const key = token.actorId + ':' + grant.userId, old = restore.get(key); if (!old || Number(grant.before) < old.before) restore.set(key, {actor: game.actors.get(token.actorId), userId: grant.userId, before: Number(grant.before) || 0}); }
    }
    for (const {actor, userId, before} of restore.values()) if (actor) await actor.update({[`ownership.${userId}`]: before});
    for (const vehicle of vehicles) if ((vehicle.getFlag(NS, 'vehicleOccupants') ?? []).length) await applyDriverControl(vehicle, await reconcileOccupants(vehicle));
    await game.settings.set(NS, 'migrationVersion', 2);
  }
  if (!foundry.utils.isNewerVersion(VERSION, installed)) return;
  const counts = await installWorld({allMaps: true, notify: false});
  const data = await content();
  let refreshed = 0;
  for (const source of data.journals) { const entry = game.journal.find(j => j.getFlag(NS, 'contentKey') === source.flags[NS].contentKey); if (entry) refreshed += await updateGuide(entry, source); }
  const migrated = await migrateItems();
  await game.settings.set(NS, 'contentVersion', VERSION);
  const lines = [`Existing characters, notes, ownership and positions are preserved.`];
  if (counts.scenes) lines.push(`Added ${counts.scenes} map(s): the overview is at the top of <b>${STREET_FOLDER}</b>, then four folders north to south.`);
  if (counts.items) lines.push(`Added ${counts.items} item(s) to <b>The Smoke — Kit</b>.`);
  if (counts.actors || counts.journals) lines.push(`Added ${counts.actors} actor(s) and ${counts.journals} guide(s).`);
  if (migrated) lines.push(`Brought ${migrated} existing item(s) and character(s) up to date.`);
  if (refreshed) lines.push(`Refreshed ${refreshed} guide page(s) you had not edited (pages you changed are left as they are).`);
  lines.push('New in this version: the Sandbox Campaign — twelve faction careers (96 commissions) and twenty local cases on the Mission Board, with Renown, Influence and stance per faction, and its GM journals (campaign book, faction careers, local cases, venue register). Also: the Blower\'s sat nav, live pirate radio with Message the studio, and everything from 0.2.');
  await card('THE SMOKE', `Upgraded to ${VERSION}`, lines.map(l => `<p>${l}</p>`).join(''), 'job', {whisper: [game.user.id]});
  ui.notifications.info(`The Smoke upgraded to ${VERSION}.`);
}
async function welcome() {
  return card('THE SMOKE', 'Welcome to London', `<p>This world has no Smoke content yet.</p><p><button type="button" class="gm" data-smoke-install><i class="fa-solid fa-city"></i> Set up the world</button></p>
    <p class="smoke-dim">Or: scene controls → <i class="fa-solid fa-city"></i> Street Control → Set up the world. The guides are also in the compendium <b>The Smoke — Guides</b>.</p>`, 'job', {whisper: [game.user.id]});
}

/* ------------------------------------------------------------------ diagnostics */
export async function diagnostics() {
  const {atlas, places} = await loadAtlas(), all = [...atlas.maps, ...places.maps], by = new Map(all.map(m => [m.id, m])), issues = [];
  for (const m of all) for (const l of m.links || []) { const to = by.get(l.to); if (!to) { issues.push(`Unknown destination ${m.id} → ${l.to}`); continue; } if (l.kind === 'edge' && !to.links.some(b => b.to === m.id && b.toEdge === l.edge && b.road === l.road)) issues.push(`Unpaired exit ${m.id} → ${l.to}`); }
  for (const p of game.system.packs ?? []) if (!game.packs.get(`${NS}.${p.name}`)) issues.push(`Compendium not registered: ${p.name}`);
  for (const scene of game.scenes) for (const t of scene.tokens) { const seat = t.getFlag(NS, 'vehicleSeat'); if (seat && !scene.tokens.get(seat.vehicleTokenId)) issues.push(`${scene.name}: ${t.name} has a missing vehicle.`); }
  const checks = [`${atlas.maps.length} street maps`, `${places.maps.length} interiors`, `${game.system.packs?.length ?? 0} compendiums`, `Active GM: ${game.users.activeGM?.name ?? 'none'}`, `Content ${game.settings.get(NS, 'contentVersion') || 'not set up'} · system ${VERSION}`];
  await foundry.applications.api.DialogV2.wait({window: {title: 'The Smoke · Diagnostics'}, content: `<div class="the-smoke"><h2>${issues.length ? 'Needs attention' : 'Structural checks passed'}</h2><ul>${[...checks, ...issues].map(x => `<li>${esc(x)}</li>`).join('')}</ul><p>Run the acceptance checks in VALIDATION.md before using the release for a campaign.</p></div>`, buttons: [{action: 'close', label: 'Close'}]});
  return {ok: !issues.length, issues, checks};
}

export const contentAPI = {setupWorld, installWorld, installStarter, importAllMaps, syncItemLibrary, migrateItems, migrateWorld, diagnostics, openGuide, version: VERSION};
