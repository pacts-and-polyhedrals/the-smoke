// Map-to-map transit for the London Street Atlas (ported from the Altered Carbon Bay City Street Atlas).
// Every road that leaves a street map has an exit strip. A token (or a vehicle together with everyone seated
// in it) standing in that strip crosses to the connecting map: it is recreated at the same spot along the
// opposite edge, combat entries follow it, and the players who own the moved tokens are taken to the new
// scene. The connecting scene is imported from the compendium automatically if the world lacks it.
import {hasAbility} from '../vehicles/vehicle-abilities.mjs';
import {NS, SOCKET} from '../config.mjs';
const PACKS = [`${NS}.london-streets`, `${NS}.london-places`, `${NS}.london-venues`];
// "Import all maps" brings in the streets and the four core interiors; the 211 campaign venue maps (160 interiors and
// 51 approaches) come in when someone walks through their door, or a mission's maps are prepared from the Mission Board.
const CORE_PACKS = PACKS.slice(0, 2);
const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
const leaderGM = () => game.users.activeGM ?? game.users.filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
const isLeader = () => leaderGM()?.id === game.user.id;
const atlasOf = scene => scene?.getFlag?.(NS, 'streetAtlas') || null;
export const OVERVIEW_ID = 'LDN-OVERVIEW';
export const mapOf = scene => atlasOf(scene) || scene?.getFlag?.(NS, 'place') || null;
export function mapLinks(scene) { return mapOf(scene)?.links || []; }
export const isStreetMapId = id => String(id || '').startsWith('LDN-');
const seatOf = t => t?.getFlag?.(NS, 'vehicleSeat') || null;
const occupantList = vt => { const raw = vt?.getFlag?.(NS, 'vehicleOccupants'); return Array.isArray(raw) ? raw : []; };

/** The mapped exit occupied by a token. Manual crossings also accept the token's actual
 * footprint or an approach within one grid square, to avoid false "not at an exit" errors
 * with large vehicles and narrow doorway strips. Automatic crossings remain centre-only. */
export function linkAt(scene, token, {near = false} = {}) {
  const links = mapLinks(scene).filter(l => l.to && Array.isArray(l.rect) && l.rect.length === 4);
  const g = Math.max(1, Number(scene?.grid?.size) || 100);
  const x = Number(token?.x) || 0, y = Number(token?.y) || 0;
  const w = Math.max(.25, Number(token?.width) || 1) * g, h = Math.max(.25, Number(token?.height) || 1) * g;
  const cx = x + w / 2, cy = y + h / 2;
  const exact = links.find(l => cx >= l.rect[0] && cx < l.rect[0] + l.rect[2] && cy >= l.rect[1] && cy < l.rect[1] + l.rect[3]);
  if (exact || !near) return exact || null;
  const nearLinks = links.map(l => {
    const [rx,ry,rw,rh] = l.rect;
    const dx = Math.max(rx - (x + w), x - (rx + rw), 0);
    const dy = Math.max(ry - (y + h), y - (ry + rh), 0);
    const distance = Math.hypot(dx, dy);
    const centreDistance = Math.hypot(Math.max(rx-cx,0,cx-(rx+rw)),Math.max(ry-cy,0,cy-(ry+rh)));
    return {link:l, distance, centreDistance};
  }).filter(v => v.distance <= g * 1.05);
  nearLinks.sort((a,b) => a.distance-b.distance || a.centreDistance-b.centreDistance);
  return nearLinks[0]?.link || null;
}
/** Nearest mapped exit for a useful refusal message, without relaxing security limits. */
export function nearestExit(scene, token) {
  const g = Math.max(1, Number(scene?.grid?.size) || 100),
    tx = Number(token?.x) || 0, ty = Number(token?.y) || 0,
    tw = Math.max(.25, Number(token?.width) || 1) * g,
    th = Math.max(.25, Number(token?.height) || 1) * g;
  return mapLinks(scene).filter(l => l.to && Array.isArray(l.rect)).map(link => {
    const [x,y,w,h] = link.rect;
    const dx=Math.max(x-(tx+tw),tx-(x+w),0), dy=Math.max(y-(ty+th),ty-(y+h),0);
    return {link, squares: Math.hypot(dx,dy)/g};
  }).sort((a,b)=>a.squares-b.squares)[0] || null;
}

/** Where a token lands on the connecting map: same position along the edge, one square in. */
export function landingPosition(link, token, {width, height, gridSize}) {
  const g = gridSize || 100, w = Number(token.width || 1) * g, h = Number(token.height || 1) * g;
  if (Array.isArray(link.land)) {
    return {x: Math.min(Math.max(0, link.land[0] - w / 2), width - w), y: Math.min(Math.max(0, link.land[1] - h / 2), height - h)};
  }
  switch (link.edge) {
    case 'E': return {x: g, y: token.y};
    case 'W': return {x: width - g - w, y: token.y};
    case 'N': return {x: token.x, y: height - g - h};
    case 'S': return {x: token.x, y: g};
  }
  return {x: token.x, y: token.y};
}

/* ------------------------------------------------------------------ destinations (travel picker) */
const centre = r => [Math.round(r[0] + r[2] / 2), Math.round(r[1] + r[3] / 2)];
export function buildDestinations(atlas, places, venues = null) {
  const out = [];
  for (const m of atlas?.maps || []) {
    const cx = m.width / 2, cy = m.height / 2;
    const pool = (m.zones || []).filter(z => z.kind === 'junction');
    const hub = pool.slice().sort((a, b) => Math.hypot(...centre(a.rect).map((v, i) => v - [cx, cy][i])) - Math.hypot(...centre(b.rect).map((v, i) => v - [cx, cy][i])))[0];
    if (hub) out.push({key: `${m.id}:centre`, mapId: m.id, group: m.name, short: `Main junction (${hub.name})`, label: `${m.name} · ${hub.name}`, land: centre(hub.rect)});
    for (const z of (m.zones || []).filter(z => z.service || z.landmark)) {
      const road = (m.zones || []).find(r => (r.kind === 'road' || r.kind === 'junction') && (z.adjacent || []).includes(r.id));
      if (road) out.push({key: `${m.id}:${z.id}`, mapId: m.id, group: m.name, short: `Outside ${z.name}`, label: `${m.name} · ${z.name}`, land: centre(road.rect)});
    }
  }
  for (const m of places?.maps || []) {
    const inbound = (atlas?.maps || []).flatMap(o => (o.links || []).filter(l => l.to === m.id && Array.isArray(l.land)))[0];
    if (inbound) out.push({key: `${m.id}:inside`, mapId: m.id, group: 'Inside', short: m.name, label: `${m.name} · inside`, land: inbound.land});
  }
  // the campaign venues, by district: you arrive just inside the public entrance
  const vmaps = venues?.maps || [];
  for (const m of vmaps.filter(v => v.kind === 'venue').sort((a, b) => a.code.localeCompare(b.code, 'en', {numeric: true}))) {
    const inbound = [...(atlas?.maps || []), ...vmaps].flatMap(o => (o.links || []).filter(l => l.to === m.id && Array.isArray(l.land) && l.key !== 'SERVICE'))[0];
    if (inbound) out.push({key: `${m.id}:inside`, mapId: m.id, group: `Venues · ${m.districtCode} ${m.district}`, short: `${m.code} ${m.title}`, label: `${m.title} · inside`, land: inbound.land});
  }
  return out;
}
let destinationCache = null, atlasData = null, placesData = null, venuesData = null;
export async function loadAtlas() {
  if (atlasData) return {atlas: atlasData, places: placesData, venues: venuesData};
  const load = async f => { try { const r = await fetch(`systems/${NS}/data/${f}`); return r.ok ? await r.json() : {maps: []}; } catch (_e) { return {maps: []}; } };
  [atlasData, placesData, venuesData] = await Promise.all([load('london-street-atlas.json'), load('london-places.json'), load('london-venues.json')]);
  return {atlas: atlasData, places: placesData, venues: venuesData};
}
export async function transitDestinations() {
  if (destinationCache) return destinationCache;
  const {atlas, places, venues} = await loadAtlas();
  destinationCache = buildDestinations(atlas, places, venues); return destinationCache;
}
/** The street-map door that leads (directly, or through its approach) to a place: {mapId, link} or null. */
export function streetDoorOf(atlas, venues, id) {
  for (const m of atlas?.maps || []) { const l = (m.links || []).find(x => x.kind === 'door' && x.to === id); if (l) return {mapId: m.id, link: l}; }
  const v = (venues?.maps || []).find(x => x.id === id);
  return v?.approach && v.approach !== id ? streetDoorOf(atlas, venues, v.approach) : null;
}
const vehicleOf = t => { const seat = seatOf(t); return seat ? t.parent?.tokens?.get(seat.vehicleTokenId) || null : (t?.actor?.type === 'vehicle' ? t : null); };
const isAIVehicle = vt => ['ai', 'both'].includes(String(vt?.actor?.system?.vehicle?.control || 'driver')) || hasAbility(vt?.actor, 'autopilot');
/** Who may pick any destination: the GM, or anyone aboard a vehicle its AI drives. */
export function canChooseDestination(token, user = game.user) {
  if (user?.isGM) return true; const vt = vehicleOf(token); if (!vt || !isAIVehicle(vt)) return false;
  if (vt.actor?.testUserPermission?.(user, 'OWNER')) return true;
  return occupantList(vt).some(o => vt.parent?.tokens?.get(o.tokenId)?.actor?.testUserPermission?.(user, 'OWNER'));
}
export function targetLevelId(scene) {
  if (scene?.levels === undefined) return null;
  const lv = scene.initialLevel; if (typeof lv === 'string' && lv) return lv; if (lv?.id) return lv.id;
  const list = scene.levels?.contents ?? (Array.isArray(scene.levels) ? scene.levels : []); const first = list[0];
  return typeof first === 'string' ? first : first?.id ?? null;
}
export function retarget(data, scene) {
  delete data._id; delete data._regions; delete data._movementHistory;
  const level = targetLevelId(scene); if (level) data.level = level; else delete data.level;
  return data;
}

/* ------------------------------------------------------------------ the Scenes sidebar: folders and order */
// The overview sits at the top of "The Smoke — London Streets"; the 20 street maps follow in four folders, one per
// row of the overview grid, north to south, each ordered west to east. Interiors go in "The Smoke — Places".
export const STREET_FOLDER = 'The Smoke — London Streets';
export const PLACE_FOLDER = 'The Smoke — Places';
export const VENUE_FOLDER = 'The Smoke — Venues';
export const ROW_FOLDERS = Object.freeze(['North · Highbury to Leyton', 'Central · Canonbury to Olympic Park', 'Central South · De Beauvoir to Stratford', 'South · Hoxton to Bow']);
const OURS = new Set([STREET_FOLDER, PLACE_FOLDER, VENUE_FOLDER, ...ROW_FOLDERS]);
const ours = folder => OURS.has(folder?.name) || /^[A-Z]{2} · /.test(folder?.name || '');
const flagsOf = doc => doc?.flags?.[NS] || {};
const mapIdOf = doc => { const f = flagsOf(doc); return f.streetAtlas?.id || f.place?.id || null; };

// districts in the order of the Sandbox Campaign plan (north-west to south-east)
export const DISTRICT_ORDER = Object.freeze(['HB', 'SN', 'CL', 'HM', 'LY', 'CG', 'DA', 'HC', 'WW', 'ON', 'DB', 'LF', 'WS', 'VW', 'ST', 'HX', 'HR', 'BG', 'OF', 'BF']);
async function sceneFolder(name, {parent = null, sort = 0} = {}) {
  const parentId = parent?.id ?? null;
  let folder = game.folders.find(f => f.type === 'Scene' && f.name === name && (f.folder?.id ?? null) === parentId);
  if (!folder) folder = await Folder.implementation.create({name, type: 'Scene', color: '#ff8a3d', sorting: 'm', sort, folder: parentId});
  else if (folder.sorting !== 'm') await folder.update({sorting: 'm'});
  return folder;
}
/** The folder and sort order a London scene belongs at, from its flags. */
export async function sceneHome(doc) {
  const f = flagsOf(doc);
  if (f.place && ['venue', 'approach'].includes(f.place.kind)) {
    // The Smoke — Venues / "HB · Highbury & Albion Rd": each interior, then its approach (HB1, APP-HB1, HB2 …)
    const root = await sceneFolder(VENUE_FOLDER, {sort: 3000}), dc = String(f.place.districtCode || '??');
    const sub = await sceneFolder(`${dc} · ${f.place.district || dc}`, {parent: root, sort: (DISTRICT_ORDER.indexOf(dc) + 1 || 99) * 1000});
    const n = parseInt(String(f.place.code || '').replace(/^APP-/, '').replace(/\D/g, ''), 10) || 99;
    return {folder: sub.id, sort: n * 1000 + (f.place.kind === 'approach' ? 500 : 0)};
  }
  if (f.place) return {folder: (await sceneFolder(PLACE_FOLDER, {sort: 2000})).id, sort: (parseInt(String(f.place.code || '').replace(/\D/g, ''), 10) || 99) * 1000};
  const root = await sceneFolder(STREET_FOLDER, {sort: 1000});
  const a = f.streetAtlas || {}, row = Number(a.row), col = Number(a.col);
  if (a.id === OVERVIEW_ID || !(row >= 0) || !(col >= 0)) return {folder: root.id, sort: 0};
  const band = await sceneFolder(ROW_FOLDERS[row] ?? `Row ${row + 1}`, {parent: root, sort: (row + 1) * 1000});
  return {folder: band.id, sort: (col + 1) * 1000};
}
async function createFromPack(docs) {
  const data = [];
  for (const doc of docs) {
    const d = game.scenes.fromCompendium(doc, {clearFolder: false});
    Object.assign(d, await sceneHome(doc)); foundry.utils.setProperty(d, `flags.${NS}.installSource`, doc.uuid);
    data.push(d);
  }
  if (!data.length) return [];
  const made = await (CONFIG.Scene?.documentClass ?? getDocumentClass('Scene')).createDocuments(data);
  const {repairSceneBackground} = await import('./scene-repair.mjs');
  for (const scene of made) { try { await repairSceneBackground(scene); } catch (_e) {} }
  return made;
}

/** One map's document from a pack: through the pack index when Foundry offers it (the venues pack holds 211 scenes). */
async function findInPack(pack, id) {
  if (pack.getIndex && pack.getDocument) {
    try {
      const index = await pack.getIndex({fields: [`flags.${NS}.place.id`, `flags.${NS}.streetAtlas.id`]});
      const hit = [...index].find(e => (e.flags?.[NS]?.place?.id ?? e.flags?.[NS]?.streetAtlas?.id) === id);
      if (hit) return await pack.getDocument(hit._id);
    } catch (_e) { /* fall back to loading the pack */ }
  }
  return (await pack.getDocuments()).find(d => mapIdOf(d) === id) ?? null;
}
async function importSceneNow(id) {
  const scene = game.scenes.find(s => mapOf(s)?.id === id); if (scene) return scene;
  const order = String(id).startsWith('LDV-') || String(id).startsWith('LDA-') ? [...PACKS].reverse() : PACKS;
  for (const key of order) {
    const pack = game.packs.get(key); if (!pack) continue;
    const doc = await findInPack(pack, id);
    if (doc) return (await createFromPack([doc]))[0];
  }
  throw new Error(`Map ${id} is not in the London compendiums.`);
}

/** Bring every London map (overview, 20 street maps, 4 interiors) into the world, and file the ones already there.
 * The campaign venues stay in their compendium until needed (importVenueMaps, or walking through their door). */
async function importAllMapsNow({notify = true, venues = false} = {}) {
  if (!game.user?.isGM) throw new Error('Only the GM can import maps.');
  const have = new Map(game.scenes.filter(s => mapOf(s)?.id).map(s => [mapOf(s).id, s]));
  let created = 0, filed = 0; const missingPacks = [];
  for (const key of venues ? PACKS : CORE_PACKS) {
    const pack = game.packs.get(key); if (!pack) { missingPacks.push(key); continue; }
    const docs = (await pack.getDocuments()).filter(d => mapIdOf(d));
    const fresh = [];
    for (const doc of docs) {
      const existing = have.get(mapIdOf(doc));
      if (!existing) { fresh.push(doc); continue; }
      // Only re-file scenes still in our own folders (or loose); anything the GM moved elsewhere stays put.
      if (existing.folder && !ours(existing.folder)) continue;
      const home = await sceneHome(doc);
      if ((existing.folder?.id ?? null) !== home.folder || existing.sort !== home.sort) { await existing.update(home); filed++; }
    }
    created += (await createFromPack(fresh)).length;
  }
  if (missingPacks.length) ui.notifications.warn(`The Smoke: compendium missing: ${missingPacks.join(', ')}.`);
  if (notify) ui.notifications.info(created ? `The Smoke: imported ${created} London map(s). Every map is now in the Scenes tab.` : 'The Smoke: every London map is already in the Scenes tab.');
  return {created, filed};
}

const importing = new Map();
export async function findOrImportScene(id) {
  if (importing.has(id)) return importing.get(id);
  const pending = importSceneNow(id); importing.set(id, pending);
  try { return await pending; } finally { importing.delete(id); }
}
/** Import the given campaign venue maps (and the approach each one sits behind). Returns the scenes, in order. */
export async function importVenueMaps(ids, {notify = true} = {}) {
  if (!game.user?.isGM) throw new Error('Only the GM can import maps.');
  const {venues} = await loadAtlas(), want = new Set();
  for (const id of ids) { const v = (venues?.maps || []).find(x => x.id === id); if (!v) continue; want.add(v.id); if (v.approach) want.add(v.approach); }
  const before = game.scenes.size, scenes = [];
  for (const id of want) scenes.push(await findOrImportScene(id));
  const made = game.scenes.size - before;
  if (notify) ui.notifications.info(made ? `The Smoke: imported ${made} venue map(s) into "${VENUE_FOLDER}".` : 'The Smoke: those venue maps are already in the Scenes tab.');
  return scenes;
}
let importingAll = null;
export function importAllMaps(options = {}) {
 if (importingAll) return importingAll;
 const pending = importAllMapsNow(options); importingAll = pending;
 void pending.finally(() => { if (importingAll === pending) importingAll = null; }).catch(() => {});
 return pending;
}

/* ------------------------------------------------------------------ GM handler */
export function formation(n, centrePt, {width, height, gridSize = 100, size = 1} = {}) {
  const g = gridSize, offs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]];
  const out = []; for (let i = 0; i < n; i++) {
    const [dx, dy] = offs[i % offs.length], ring = Math.floor(i / offs.length) * 3;
    out.push({x: Math.round(Math.min(Math.max(0, centrePt[0] - size * g / 2 + (dx + Math.sign(dx) * ring) * g), width - size * g)), y: Math.round(Math.min(Math.max(0, centrePt[1] - size * g / 2 + (dy + Math.sign(dy) * ring) * g), height - size * g))});
  }
  return out;
}
export async function parkingFor(interiorId) {
  const {atlas, venues} = await loadAtlas();
  const door = streetDoorOf(atlas, venues, interiorId);
  return door ? {mapId: door.mapId, land: centre(door.link.rect)} : null;
}
async function remapCombat(source, target, idMap) {
  for (const combat of game.combats) {
    const updates = combat.combatants.filter(c => c.sceneId === source.id && idMap[c.tokenId]).map(c => ({_id: c.id, sceneId: target.id, tokenId: idMap[c.tokenId]}));
    if (!updates.length) continue;
    if (combat.getFlag?.(NS, 'chase')) {
      const chase = combat.getFlag(NS, 'chase');
      for (const up of updates) {
        const fresh = target.tokens.get(up.tokenId);
        if (fresh?.actor?.type === 'character') await fresh.setFlag(NS, 'chaseTransfer', {auto: Boolean(chase.auto), sourceId: combat.id});
      }
      await combat.deleteEmbeddedDocuments('Combatant', updates.map(up => up._id));
      if (!combat.combatants.some(c => c.actor?.type === 'character')) await combat.delete();
      continue; // Chases belong to a scene. Never strand one with scene:null after a map crossing.
    }
    await combat.updateEmbeddedDocuments('Combatant', updates);
    if (target.id !== source.id && combat.scene?.id === source.id) await combat.update({scene: null});
  }
}
function sendOwners(target, tokens, user) {
  const owners = game.users.filter(u => !u.isGM && u.active && tokens.some(t => t?.actor?.testUserPermission?.(u, 'OWNER'))).map(u => u.id);
  game.socket.emit(SOCKET, {type: 'acTransit.view', data: {sceneId: target.id, userIds: owners}});
  if (user?.isGM && user.id === game.user.id) return target.view();
}
async function card(title, text) { try { await ChatMessage.implementation.create({speaker: {alias: 'London Streets'}, content: `<section class="smoke-card transit"><header><span class="kicker">ON THE MOVE</span><strong>${esc(title)}</strong></header><p>${text}</p></section>`}); } catch (_e) {} }

async function walkIn(source, target, people, land, {vehicle = null} = {}) {
  const dims = {width: target.width, height: target.height, gridSize: target.grid?.size || 100};
  const occ = vehicle ? occupantList(vehicle) : [];
  const spots = formation(people.length, land, dims);
  const data = people.map((t, i) => { const d = retarget(t.toObject(), target); const o = occ.find(x => x.tokenId === t.id);
    if (o) { d.width = o.original?.width || 1; d.height = o.original?.height || 1; d.rotation = 0; }
    // A passenger who walks into a venue is no longer attached to the parked motor.
    foundry.utils.setProperty(d, `flags.${NS}.vehicleSeat`, null); foundry.utils.setProperty(d, `flags.${NS}.ambientCrew`, null);
    foundry.utils.setProperty(d,`flags.${NS}.transitAt`,Date.now()); d.x = spots[i].x; d.y = spots[i].y; return d; });
  const created = await target.createEmbeddedDocuments('Token', data, {acVehicleCarry: true, acTransit: true});
  const idMap = {}; people.forEach((t, i) => { idMap[t.id] = created[i].id; });
  await remapCombat(source, target, idMap);
  await source.deleteEmbeddedDocuments('Token', people.map(t => t.id), {acTransit: true});
  await (await import('../world/jobs.mjs')).remapJobsForTransit({source,target,idMap});
  Hooks.callAll('smokeTransit', {source, target, idMap});
  return created;
}
async function driveTo(source, target, vehicle, land) {
  try { const {reconcileOccupants} = await import('../vehicles/vehicle-boarding.mjs'); await reconcileOccupants(vehicle); } catch (_e) {}
  const list = occupantList(vehicle).filter(o => source.tokens.get(o.tokenId));
  const riders = list.map(o => ({o, t: source.tokens.get(o.tokenId)}));
  const vData = retarget(vehicle.toObject(), target); foundry.utils.setProperty(vData,`flags.${NS}.transitAt`,Date.now()); vData.x = Math.round(land.x); vData.y = Math.round(land.y);
  const [newToken] = await target.createEmbeddedDocuments('Token', [vData], {acVehicleCarry: true, acTransit: true});
  const idMap = {[vehicle.id]: newToken.id};
  if (riders.length) {
    const {seatLayout, seatPositions} = await import('../vehicles/vehicle-seat-math.mjs');
    const g = target.grid?.size || 100, pos = seatPositions(newToken, seatLayout(newToken.actor || vehicle.actor), g), half = g * 0.5;
    const rData = riders.map(({o, t}) => { const d = retarget(t.toObject(), target); const p = pos[o.seatId] || {x: newToken.x + newToken.width * g / 2 - half / 2, y: newToken.y + newToken.height * g / 2 - half / 2};
      d.x = Math.round(p.x); d.y = Math.round(p.y); d.width = 0.5; d.height = 0.5; d.rotation = newToken.rotation || 0; d.elevation = newToken.elevation || 0; d.sort = (newToken.sort || 0) + 1;
      foundry.utils.setProperty(d, `flags.${NS}.vehicleSeat`, {vehicleTokenId: newToken.id, seatId: o.seatId});
      // A moved ambient driver must point to the NEW token ID or carjacking/despawn would lose the real NPC.
      if (o.ambient) { const old = foundry.utils.getProperty(d, `flags.${NS}.ambientCrew`) || {};
        foundry.utils.setProperty(d, `flags.${NS}.ambientCrew`, {...old, vehicleTokenId: newToken.id}); }
      return d; });
    const created = await target.createEmbeddedDocuments('Token', rData, {acVehicleCarry: true, acTransit: true});
    riders.forEach(({t}, i) => { idMap[t.id] = created[i].id; });
    await newToken.update({[`flags.${NS}.vehicleOccupants`]: list.map(o => ({...o, tokenId: idMap[o.tokenId]}))}, {acVehicleCarry: true});
  } else if (occupantList(vehicle).length) await newToken.update({[`flags.${NS}.vehicleOccupants`]: []}, {acVehicleCarry: true});
  await remapCombat(source, target, idMap);
  await source.deleteEmbeddedDocuments('Token', [...riders.map(r => r.t.id), vehicle.id], {acTransit: true});
  await (await import('../world/jobs.mjs')).remapJobsForTransit({source,target,idMap});
  Hooks.callAll('smokeTransit', {source, target, idMap});
  return {token: newToken, riders: riders.map(r => target.tokens.get(idMap[r.t.id])).filter(Boolean), riderNames: riders.map(r => r.t.name)};
}
export async function transfer(source, token, link, opts = {}) {
  let serial = null; try { ({serialScene: serial} = await import('../vehicles/vehicle-boarding.mjs')); } catch (_e) {}
  return serial ? serial(source.id, () => transferNow(source, token, link, opts)) : transferNow(source, token, link, opts);
}
async function transferNow(source, token, link, {user = game.user, companions = [], destination = null, quiet = false} = {}) {
  const {chaseOf, pendingResponses} = await import('../world/chase-state.mjs');
  const chase = chaseOf(source), pending = chase ? pendingResponses(chase) : [];
  if (source.tokens.some(t => t.getFlag(NS, 'policeStop')) || pending.length) throw new Error('Resolve the police decision, escape move or incoming hit before changing maps.');
  const stamp = Number(token.getFlag(NS, 'transitAt') || 0);
  if (Date.now() - stamp < 1200) return null;
  const target = await findOrImportScene(link.to);
  const dims = {width: target.width, height: target.height, gridSize: target.grid?.size || 100};
  const vehicle = token.actor?.type === 'vehicle' || occupantList(token).length ? token : null;
  if (vehicle && !isStreetMapId(link.to)) {
    const riders = occupantList(vehicle).map(o => source.tokens.get(o.tokenId)).filter(Boolean);
    if (!riders.length) throw new Error(`${vehicle.name} cannot drive inside ${target.name}; park it and walk in.`);
    const land = Array.isArray(link.land) ? link.land : [target.width / 2, target.height / 2];
    const inside = await walkIn(source, target, riders, land, {vehicle});
    try { const {clearOccupants} = await import('../vehicles/vehicle-boarding.mjs'); await clearOccupants(vehicle); } catch (_e) {}
    await sendOwners(target, inside, user);
    if (!quiet) await card(`${riders.map(r => r.name).join(', ')} → ${target.name}`, `Parked the ${esc(vehicle.name)} outside and went in.`);
    return {scene: target, token: inside[0], tokens: inside};
  }
  if (vehicle) {
    const land = landingPosition(link, vehicle, dims);
    const r = await driveTo(source, target, vehicle, land);
    await sendOwners(target, [r.token, ...r.riders], user);
    if (!quiet) await card(`${vehicle.name} → ${target.name}`, `${r.riderNames.length ? `With ${r.riderNames.map(esc).join(', ')} aboard. ` : ''}${link.edge ? `Crossed from ${esc(source.name)}.` : `Drove from ${esc(source.name)} to ${esc(link.toName)}.`}`);
    return {scene: target, token: r.token, tokens: [r.token, ...r.riders]};
  }
  const people = [token, ...companions.filter(t => t && t.id !== token.id)];
  const first = landingPosition(link, token, dims), g = dims.gridSize;
  const centrePt = [first.x + Number(token.width || 1) * g / 2, first.y + Number(token.height || 1) * g / 2];
  const moved = await walkIn(source, target, people, centrePt);
  await sendOwners(target, moved, user);
  if (!quiet) await card(`${people.map(t => t.name).join(', ')} → ${target.name}`, `${link.edge ? `Crossed from ${esc(source.name)}.` : `Went through from ${esc(source.name)}.`}`);
  return {scene: target, token: moved[0], tokens: moved};
}

async function cross({sceneId, tokenId, userId, destination}) {
  const source = game.scenes.get(sceneId); let token = source?.tokens.get(tokenId); const user = game.users.get(userId);
  if (!token) throw new Error('Token not found.');
  const asked = token;
  const seat = seatOf(token); if (seat) { const vt = source.tokens.get(seat.vehicleTokenId); if (vt) token = vt; }
  let link;
  if (destination) {
    const here = linkAt(source, token, {near:true});
    if (!canChooseDestination(asked, user) && here?.kind !== 'district') throw new Error(`${user?.name || 'That player'} cannot choose where ${token.name} goes.`);
    const d = (await transitDestinations()).find(x => x.key === destination); if (!d) throw new Error('Unknown destination.');
    link = {to: d.mapId, toName: d.label, land: d.land};
  } else {
    if (!user?.isGM && !token.actor?.testUserPermission?.(user, 'OWNER')) {
      const driver = occupantList(token).find(o => o.seatId === 'pilot');
      if (!driver || !source.tokens.get(driver.tokenId)?.actor?.testUserPermission?.(user, 'OWNER')) throw new Error(`${user?.name || 'That player'} does not control ${token.name}.`);
    }
    link = linkAt(source, token, {near:true});
    if (!link) {
      const nearest = nearestExit(source, token);
      throw new Error(nearest ? `${token.name} is not near enough to a mapped exit. Nearest: ${nearest.link.toName || nearest.link.to} (about ${nearest.squares.toFixed(1)} grid squares from your token footprint). Move closer to its marked doorway or road strip.` : `No mapped exits found on ${source.name}. Ask the GM to repair this scene's map metadata.`);
    }
  }
  if (link.pedestrianOnly && token.actor?.type === 'vehicle' && !hasAbility(token.actor, 'nimble')) throw new Error('That exit is a footpath. Park and walk, or use a bicycle.');
  if (link.kind === 'edge' && token.actor?.type === 'vehicle' && !hasAbility(token.actor, 'flying')) {
    const pilot = occupantList(token).find(o => o.seatId === 'pilot');
    const driver = pilot && source.tokens.get(pilot.tokenId)?.actor;
    const {roadblockCheck} = await import('../world/heat.mjs');
    await roadblockCheck(source, token, driver);
  }
  return transfer(source, token, link, {user, destination});
}

export async function crossToNextMap(token, {destination = null} = {}) {
  const data = {sceneId: token.parent.id, tokenId: token.id, userId: game.user.id, destination};
  if (isLeader()) return cross(data);
  if (!leaderGM()) throw new Error('A GM must be connected to move between maps.');
  game.socket.emit(SOCKET, {type: 'acTransit.cross', data});
  ui.notifications.info(destination ? 'On the way…' : 'Crossing to the next map…');
}

export async function openTravelDialog(token) {
  const list = await transitDestinations(); if (!list.length) throw new Error('No London destinations found.');
  const subject = vehicleOf(token) || token, here = linkAt(token.parent, subject, {near:true});
  const groups = new Map(); for (const d of list) { if (!groups.has(d.group)) groups.set(d.group, []); groups.get(d.group).push(d); }
  const preferred = here?.kind === 'district' ? list.find(d => d.mapId === here.to) : null;
  const options = [...groups].map(([g, ds]) => `<optgroup label="${esc(g)}">${ds.map(d => `<option value="${esc(d.key)}" ${d === preferred ? 'selected' : ''}>${esc(d.short || d.label)}</option>`).join('')}</optgroup>`).join('');
  const who = occupantList(subject).map(o => o.name).filter(Boolean);
  const form = await foundry.applications.api.DialogV2.input({window: {title: `${subject.name}: where to?`, icon: 'fa-solid fa-route'},
    content: `<p>${who.length ? `Aboard: <b>${who.map(esc).join(', ')}</b>. ` : ''}Everyone aboard goes too.</p><label><span>Destination</span><select name="destination">${options}</select></label>`,
    ok: {label: 'Go', icon: 'fa-solid fa-route'}});
  if (!form?.destination) return null;
  return crossToNextMap(subject, {destination: form.destination});
}

export const linkId = l => `${l.to}@${(l.rect || []).join(',')}`;
function autoEnterEnabled() { try { return game.settings.get(NS, 'autoEnterBuildings') === true; } catch (_e) { return false; } }
export function shouldAutoEnter(token, link, fromLinkId, enabled = autoEnterEnabled()) {
  if (!enabled || !link || !['door', 'exit'].includes(link.kind)) return false;
  if (token?.actor?.type === 'vehicle' || seatOf(token)) return false;
  return linkId(link) !== fromLinkId;
}
export function installMapTransit() {
  try { game.settings.register(NS, 'autoEnterBuildings', {name: 'Walk into buildings automatically', hint: 'On: a character walking into a building entrance or a map exit goes straight through. Off: right-click the token → Go to….', scope: 'world', config: true, type: Boolean, default: true}); } catch (_e) {}
  game.socket.on(SOCKET, async payload => {
    if (payload?.type === 'acTransit.view') { if (payload.data?.userIds?.includes(game.user.id)) game.scenes.get(payload.data.sceneId)?.view(); return; }
    if (payload?.type !== 'acTransit.cross' || !isLeader()) return;
    try { await cross(payload.data || {}); } catch (error) {
      console.warn('The Smoke | transit refused', error);
      try { await ChatMessage.implementation.create({speaker: {alias: 'London Streets'}, whisper: [payload.data?.userId].filter(Boolean), content: `<p>${esc(error.message)}</p>`}); } catch (_e) {}
    }
  });
  Hooks.on('preUpdateToken', (doc, changes, options) => {
    if (!('x' in changes) && !('y' in changes)) return;
    const from = linkAt(doc.parent, doc); options.acFromLink = from ? linkId(from) : null;
  });
  Hooks.on('updateToken', (doc, changes, options, userId) => {
    if (userId !== game.user.id || options?.acTransit || options?.smokeTraffic || !(('x' in changes) || ('y' in changes))) return;
    if (Date.now() - Number(doc.getFlag(NS,'transitAt') || 0) < 1200 || seatOf(doc)) return;
    const link = linkAt(doc.parent, doc); if (!link || link.kind === 'district') return;
    if (shouldAutoEnter(doc, link, options.acFromLink ?? null)) { crossToNextMap(doc).catch(error => ui.notifications.warn(error.message)); return; }
    if (options.acFromLink !== linkId(link)) ui.notifications.info(`${doc.name} is at the way to ${link.toName}. Right-click → Go to ${link.toName}.`);
  });
  Hooks.on('renderTokenHUD', (hud, html) => {
    try {
      const root = html instanceof HTMLElement ? html : html?.[0]; const doc = hud.document ?? hud.object?.document; if (!root || !doc) return;
      let subject = doc; const seat = seatOf(doc); if (seat) subject = doc.parent.tokens.get(seat.vehicleTokenId) || doc;
      if (!mapOf(doc.parent)) return;
      const link = linkAt(doc.parent, subject, {near:true}), choose = canChooseDestination(doc) || link?.kind === 'district';
      const col = root.querySelector('.col.left') || root.querySelector('.left'); if (!col || col.querySelector('.smoke-transit-hud')) return;
      const add = (icon, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'control-icon smoke-transit-hud'; b.title = title; b.dataset.tooltip = title; b.innerHTML = `<i class="${icon}" inert></i>`;
        b.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); fn().catch(error => ui.notifications.warn(error.message)); }); col.append(b); };
      if (link && link.kind !== 'district') add('fa-solid fa-route', `Go to ${link.toName}`, () => crossToNextMap(subject));
      if (choose) add('fa-solid fa-map-location-dot', 'Travel to… (choose a destination)', () => openTravelDialog(doc));
    } catch (error) { console.warn('The Smoke | transit HUD', error); }
  });
}
