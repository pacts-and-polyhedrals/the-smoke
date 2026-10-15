// Map-to-map transit for the London Street Atlas (ported from the Altered Carbon Bay City Street Atlas).
// Every road that leaves a street map has an exit strip. A token (or a vehicle together with everyone seated
// in it) standing in that strip crosses to the connecting map: it is recreated at the same spot along the
// opposite edge, combat entries follow it, and the players who own the moved tokens are taken to the new
// scene. The connecting scene is imported from the compendium automatically if the world lacks it.
import {hasAbility} from '../vehicles/vehicle-abilities.mjs';
import {NS, SOCKET} from '../config.mjs';
const PACKS = [`${NS}.london-streets`, `${NS}.london-places`];
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

/** The exit strip this token's centre stands in, or null. */
export function linkAt(scene, token) {
  const links = mapLinks(scene); const g = scene?.grid?.size || 100;
  const cx = Number(token.x || 0) + Number(token.width || 1) * g / 2, cy = Number(token.y || 0) + Number(token.height || 1) * g / 2;
  return links.find(l => l.to && cx >= l.rect[0] && cx < l.rect[0] + l.rect[2] && cy >= l.rect[1] && cy < l.rect[1] + l.rect[3]) || null;
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
export function buildDestinations(atlas, places) {
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
  return out;
}
let destinationCache = null, atlasData = null, placesData = null;
export async function loadAtlas() {
  if (atlasData) return {atlas: atlasData, places: placesData};
  const load = async f => { try { const r = await fetch(`systems/${NS}/data/${f}`); return r.ok ? await r.json() : {maps: []}; } catch (_e) { return {maps: []}; } };
  [atlasData, placesData] = await Promise.all([load('london-street-atlas.json'), load('london-places.json')]);
  return {atlas: atlasData, places: placesData};
}
export async function transitDestinations() {
  if (destinationCache) return destinationCache;
  const {atlas, places} = await loadAtlas();
  destinationCache = buildDestinations(atlas, places); return destinationCache;
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

export async function findOrImportScene(id) {
  let scene = game.scenes.find(s => mapOf(s)?.id === id); if (scene) return scene;
  for (const key of PACKS) {
    const pack = game.packs.get(key); if (!pack) continue;
    const docs = await pack.getDocuments();
    const doc = docs.find(d => { const f = d.flags?.[NS] || {}; return f.streetAtlas?.id === id || f.place?.id === id; });
    if (!doc) continue;
    const data = game.scenes.fromCompendium(doc, {clearFolder: false});
    const folderName = key.endsWith('london-streets') ? 'The Smoke — London Streets' : 'The Smoke — Places';
    let folder = game.folders.find(f => f.type === 'Scene' && f.name === folderName);
    if (!folder) folder = await Folder.implementation.create({name: folderName, type: 'Scene', color: '#ff8a3d'});
    data.folder = folder.id; foundry.utils.setProperty(data, `flags.${NS}.installSource`, doc.uuid);
    [scene] = await getDocumentClass('Scene').createDocuments([data]);
    try { const {repairSceneBackground} = await import('./scene-repair.mjs'); await repairSceneBackground(scene); } catch (_e) {}
    return scene;
  }
  throw new Error(`Map ${id} is not in the London compendiums.`);
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
  const {atlas} = await loadAtlas();
  for (const m of atlas?.maps || []) for (const l of m.links || []) if (l.kind === 'door' && l.to === interiorId) return {mapId: m.id, land: centre(l.rect)};
  return null;
}
async function remapCombat(source, target, idMap) {
  for (const combat of game.combats) {
    const updates = combat.combatants.filter(c => c.sceneId === source.id && idMap[c.tokenId]).map(c => ({_id: c.id, sceneId: target.id, tokenId: idMap[c.tokenId]}));
    if (!updates.length) continue;
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
    foundry.utils.setProperty(d, `flags.${NS}.vehicleSeat`, null); d.x = spots[i].x; d.y = spots[i].y; return d; });
  const created = await target.createEmbeddedDocuments('Token', data, {acVehicleCarry: true, acTransit: true});
  const idMap = {}; people.forEach((t, i) => { idMap[t.id] = created[i].id; });
  await remapCombat(source, target, idMap);
  await source.deleteEmbeddedDocuments('Token', people.map(t => t.id), {acTransit: true});
  Hooks.callAll('smokeTransit', {source, target, idMap});
  return created;
}
async function driveTo(source, target, vehicle, land) {
  try { const {reconcileOccupants} = await import('../vehicles/vehicle-boarding.mjs'); await reconcileOccupants(vehicle); } catch (_e) {}
  const list = occupantList(vehicle).filter(o => source.tokens.get(o.tokenId));
  const riders = list.map(o => ({o, t: source.tokens.get(o.tokenId)}));
  const vData = retarget(vehicle.toObject(), target); vData.x = Math.round(land.x); vData.y = Math.round(land.y);
  const [newToken] = await target.createEmbeddedDocuments('Token', [vData], {acVehicleCarry: true, acTransit: true});
  const idMap = {[vehicle.id]: newToken.id};
  if (riders.length) {
    const {seatLayout, seatPositions} = await import('../vehicles/vehicle-seat-math.mjs');
    const g = target.grid?.size || 100, pos = seatPositions(newToken, seatLayout(newToken.actor || vehicle.actor), g), half = g * 0.5;
    const rData = riders.map(({o, t}) => { const d = retarget(t.toObject(), target); const p = pos[o.seatId] || {x: newToken.x + newToken.width * g / 2 - half / 2, y: newToken.y + newToken.height * g / 2 - half / 2};
      d.x = Math.round(p.x); d.y = Math.round(p.y); d.width = 0.5; d.height = 0.5; d.rotation = newToken.rotation || 0; d.elevation = newToken.elevation || 0; d.sort = (newToken.sort || 0) + 1;
      foundry.utils.setProperty(d, `flags.${NS}.vehicleSeat`, {vehicleTokenId: newToken.id, seatId: o.seatId}); return d; });
    const created = await target.createEmbeddedDocuments('Token', rData, {acVehicleCarry: true, acTransit: true});
    riders.forEach(({t}, i) => { idMap[t.id] = created[i].id; });
    await newToken.update({[`flags.${NS}.vehicleOccupants`]: list.map(o => ({...o, tokenId: idMap[o.tokenId]}))}, {acVehicleCarry: true});
  } else if (occupantList(vehicle).length) await newToken.update({[`flags.${NS}.vehicleOccupants`]: []}, {acVehicleCarry: true});
  await remapCombat(source, target, idMap);
  await source.deleteEmbeddedDocuments('Token', [...riders.map(r => r.t.id), vehicle.id], {acTransit: true});
  Hooks.callAll('smokeTransit', {source, target, idMap});
  return {token: newToken, riders: riders.map(r => target.tokens.get(idMap[r.t.id])).filter(Boolean), riderNames: riders.map(r => r.t.name)};
}
export async function transfer(source, token, link, opts = {}) {
  let serial = null; try { ({serialScene: serial} = await import('../vehicles/vehicle-boarding.mjs')); } catch (_e) {}
  return serial ? serial(source.id, () => transferNow(source, token, link, opts)) : transferNow(source, token, link, opts);
}
async function transferNow(source, token, link, {user = game.user, companions = [], destination = null, quiet = false} = {}) {
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
    const here = linkAt(source, token);
    if (!canChooseDestination(asked, user) && here?.kind !== 'district') throw new Error(`${user?.name || 'That player'} cannot choose where ${token.name} goes.`);
    const d = (await transitDestinations()).find(x => x.key === destination); if (!d) throw new Error('Unknown destination.');
    link = {to: d.mapId, toName: d.label, land: d.land};
  } else {
    if (!user?.isGM && !token.actor?.testUserPermission?.(user, 'OWNER')) {
      const driver = occupantList(token).find(o => o.seatId === 'pilot');
      if (!driver || !source.tokens.get(driver.tokenId)?.actor?.testUserPermission?.(user, 'OWNER')) throw new Error(`${user?.name || 'That player'} does not control ${token.name}.`);
    }
    link = linkAt(source, token); if (!link) throw new Error(`${token.name} is not at a map exit.`);
    // Five stars: roadblocks on every exit (world/heat.mjs). The driver has to run it.
    if (link.kind === 'edge' && token.actor?.type === 'vehicle') {
      const pilot = occupantList(token).find(o => o.seatId === 'pilot'); const driver = pilot && source.tokens.get(pilot.tokenId)?.actor;
      if (driver && game.smoke?.heat?.roadblockCheck) await game.smoke.heat.roadblockCheck(source, token, driver);
    }
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
  const subject = vehicleOf(token) || token, here = linkAt(token.parent, subject);
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
    if (userId !== game.user.id || options?.acTransit || options?.acVehicleCarry || options?.smokeTraffic || !(('x' in changes) || ('y' in changes))) return;
    const link = linkAt(doc.parent, doc); if (!link || link.kind === 'district') return;
    if (shouldAutoEnter(doc, link, options.acFromLink ?? null)) { crossToNextMap(doc).catch(error => ui.notifications.warn(error.message)); return; }
    if (options.acFromLink !== linkId(link)) ui.notifications.info(`${doc.name} is at the way to ${link.toName}. Right-click → Go to ${link.toName}.`);
  });
  Hooks.on('renderTokenHUD', (hud, html) => {
    try {
      const root = html instanceof HTMLElement ? html : html?.[0]; const doc = hud.document ?? hud.object?.document; if (!root || !doc) return;
      let subject = doc; const seat = seatOf(doc); if (seat) subject = doc.parent.tokens.get(seat.vehicleTokenId) || doc;
      if (!mapOf(doc.parent)) return;
      const link = linkAt(doc.parent, subject), choose = canChooseDestination(doc) || link?.kind === 'district';
      const col = root.querySelector('.col.left') || root.querySelector('.left'); if (!col || col.querySelector('.smoke-transit-hud')) return;
      const add = (icon, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'control-icon smoke-transit-hud'; b.title = title; b.dataset.tooltip = title; b.innerHTML = `<i class="${icon}" inert></i>`;
        b.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); fn().catch(error => ui.notifications.warn(error.message)); }); col.append(b); };
      if (link && link.kind !== 'district') add('fa-solid fa-route', `Go to ${link.toName}`, () => crossToNextMap(subject));
      if (choose) add('fa-solid fa-map-location-dot', 'Travel to… (choose a destination)', () => openTravelDialog(doc));
    } catch (error) { console.warn('The Smoke | transit HUD', error); }
  });
}
