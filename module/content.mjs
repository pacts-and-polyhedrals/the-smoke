// Content installation: the Hackney starter (scenes, pregens, the crew, a cab, a police car and an ambulance to try
// shifts in) and a welcome card for the GM. Everything is built from the bundled data files, so it works even if a
// compendium is missing; scenes come from the London compendiums.
import {NS} from './config.mjs';
import {loadCatalogs, vehicleActorData, personActorData, placeToken, zonesOf} from './world/spawn.mjs';
import {findOrImportScene} from './map/map-transit.mjs';
import {roadSpawn} from './world/traffic.mjs';
import {card} from './world/net.mjs';

const VERSION = '0.1.0';
async function folder(name, type = 'Actor', color = '#ff8a3d') {
  return game.folders.find(f => f.type === type && f.name === name) ?? Folder.implementation.create({name, type, color});
}
async function loadJSON(f) { const r = await fetch(`systems/${NS}/data/${f}`); return r.ok ? r.json() : {}; }

export async function installStarter() {
  if (!game.user.isGM) throw new Error('GM only.');
  ui.notifications.info('The Smoke: setting up Hackney…');
  const [{pregens = []}, {items = []}] = await Promise.all([loadJSON('london-pregens.json'), loadJSON('london-items.json')]);
  const {npcs, vehicles} = await loadCatalogs();
  // characters
  const pcF = await folder('The Smoke — Player Characters', 'Actor', '#ffc467');
  const made = [];
  for (const p of pregens) {
    let a = game.actors.find(x => x.getFlag(NS, 'npcKey') === p.key && x.type === 'character');
    if (!a) a = await Actor.implementation.create({...personActorData(p, {folder: pcF.id}), type: 'character', prototypeToken: {...personActorData(p).prototypeToken, actorLink: true, disposition: 1, sight: {enabled: true}}});
    made.push(a);
  }
  const crewF = await folder('The Smoke — The Chainring & Hackney', 'Actor', '#ff7fb0');
  for (const key of ['pat', 'spanner', 'kez', 'mo', 'stretch', 'vale']) {
    const rec = npcs.find(n => n.key === key); if (!rec || game.actors.find(x => x.getFlag(NS, 'npcKey') === key && !x.getFlag(NS, 'streetLife'))) continue;
    await Actor.implementation.create({...personActorData(rec, {folder: crewF.id}), prototypeToken: {...personActorData(rec).prototypeToken, actorLink: true}});
  }
  // items library
  const itF = await folder('The Smoke — Kit', 'Item', '#e9cc8c');
  const have = new Set(game.items.map(i => i.name));
  await Item.implementation.createDocuments(items.filter(i => !have.has(i.name)).map(i => ({...i, folder: itF.id})));
  // vehicles library (world copies the GM can drag out)
  const vF = await folder('The Smoke — Vehicles', 'Actor', '#78ecf3');
  for (const v of vehicles) if (!game.actors.find(a => a.getFlag(NS, 'catalogId') === v.id && !a.getFlag(NS, 'streetLife'))) await Actor.implementation.create(vehicleActorData(v, {folder: vF.id}));
  // scenes
  const hackney = await findOrImportScene('LDN-HACKNEY');
  for (const id of ['LDP-FLAT', 'LDP-ARCHES', 'LDP-HOSPITAL', 'LDP-CUSTODY', 'LDN-OVERVIEW']) { try { await findOrImportScene(id); } catch (e) { console.warn('The Smoke | scene', id, e); } }
  // put the crew in the flat, and a few motors outside to try jobs in
  const flat = game.scenes.find(s => s.getFlag(NS, 'place')?.id === 'LDP-FLAT');
  if (flat && !flat.tokens.size) {
    const living = zonesOf(flat).find(z => z.service === 'safehouse') ?? zonesOf(flat)[0];
    const g = flat.grid.size;
    for (const [i, a] of made.entries()) await placeToken(flat, a, living.rect[0] + 150 + (i % 2) * g * 1.5, living.rect[1] + 200 + Math.floor(i / 2) * g * 1.5);
  }
  if (hackney && !hackney.tokens.some(t => t.getFlag(NS, 'starter'))) {
    for (const id of ['LV12', 'LV23', 'LV26', 'LV06', 'LV01']) {
      const a = game.actors.find(x => x.getFlag(NS, 'catalogId') === id && !x.getFlag(NS, 'streetLife')); if (!a) continue;
      const p = await roadSpawn(hackney); if (!p) continue;
      await placeToken(hackney, a, p.x, p.y, {rotation: p.rotation, flags: {starter: true, issued: true}});
    }
  }
  await game.settings.set(NS, 'contentVersion', VERSION);
  await card('THE SMOKE', 'Hackney is ready', `<p>Pregens are in <b>Your Flat</b> above Chicken Palace on Mare Street. Outside on <b>Hackney Central & Homerton</b>: a black cab, a police area car, an ambulance, a courier e-bike and a BMX to try shifts in.</p>
    <p>Give each player a character (User Configuration), then <b>view Your Flat</b>. Walk out through the shop to reach the street. The Arches (Auntie Pat) is round the corner on Morning Lane.</p>`, 'job');
  ui.notifications.info('The Smoke: Hackney is ready.');
  return true;
}

export async function installContent() {
  if (!game.user.isGM) return;
  const leader = game.users.activeGM; if (leader && leader.id !== game.user.id) return;
  if (game.settings.get(NS, 'contentVersion')) return;
  await card('THE SMOKE', 'Welcome to London', `<p>This world has no Smoke content yet.</p><p><button type="button" class="gm" data-smoke-install><i class="fa-solid fa-download"></i> Set up the Hackney starter</button></p>
    <p class="smoke-dim">Or later: scene controls → <i class="fa-solid fa-tower-broadcast"></i> Street Control → Setup. The guides are in the compendium <b>The Smoke — Guides</b>.</p>`, 'job', {whisper: [game.user.id]});
}
Hooks.on('renderChatMessageHTML', (m, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  root?.querySelectorAll('[data-smoke-install]').forEach(b => b.addEventListener('click', ev => { ev.preventDefault(); installStarter().catch(e => ui.notifications.error(e.message)); }));
});
export const contentAPI = {installStarter, version: VERSION};
