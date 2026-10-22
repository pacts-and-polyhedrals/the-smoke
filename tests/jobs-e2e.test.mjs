// 0.5.23: every job on the Blower, end to end through the real handlers — taxi, courier, ambulance, fire, bus, the
// three police callouts (disturbance, ANPR sweep, pursuit) and Auntie Pat's bike order. A character takes the driver's
// seat, starts a shift, gets a callout, accepts it, drives where the job says (on whichever map), rolls what the
// buttons ask for, and gets paid. Before this the 600-line job system had no test of its own.
import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {fakeActor, setPath} from './fakes.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NS = 'the-smoke', load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n), 'utf8'));
const atlas = load('london-street-atlas.json');
console.info = () => {};
/* ---------------------------------------------------------------- a small Foundry */
const gm = {id: 'gm', isGM: true, active: true, name: 'GM'};
const users = [gm];
game.user = gm; game.users = Object.assign(users, {activeGM: gm, get: id => Array.prototype.find.call(users, u => u.id === id), filter: fn => Array.prototype.filter.call(users, fn), find: fn => Array.prototype.find.call(users, fn)});
const settings = new Map(Object.entries({offerEvery: 25, jobClock: 1, jobsPaused: false, pausedAt: 0}));
game.settings.get = (ns, key) => settings.get(key);
game.settings.set = async (ns, key, value) => { settings.set(key, JSON.parse(JSON.stringify(value))); return value; };
game.settings.register = (ns, k, o) => { if (!settings.has(k)) settings.set(k, o?.default); };
game.paused = false;
const chat = [], messages = new Map();
globalThis.ChatMessage = {implementation: {create: async d => { const m = {...d, id: `m${chat.length}`}; chat.push(m); return m; }}, getSpeaker: () => ({})};
game.messages = {get: id => messages.get(id)};
const docs = new Map(); globalThis.fromUuid = async u => docs.get(u) ?? null;
let nextId = 0; const uid = p => `${p}${++nextId}`;
const withFlags = o => Object.assign(o, {
  getFlag(ns, k) { return this.flags?.[ns]?.[k]; },
  async setFlag(ns, k, v) { this.flags ??= {}; this.flags[ns] ??= {}; this.flags[ns][k] = v == null ? v : JSON.parse(JSON.stringify(v)); return this; },
  async unsetFlag(ns, k) { delete this.flags?.[ns]?.[k]; return this; }});
const actors = [];
game.actors = Object.assign(actors, {get: id => Array.prototype.find.call(actors, a => a.id === id), find: f => Array.prototype.find.call(actors, f), filter: f => Array.prototype.filter.call(actors, f), some: f => Array.prototype.some.call(actors, f)});
game.folders = Object.assign([], {find: () => ({id: 'folder'})});
globalThis.Actor.implementation = {create: async data => {
  const a = withFlags({id: uid('a'), name: data.name, type: data.type, flags: JSON.parse(JSON.stringify(data.flags || {})), system: JSON.parse(JSON.stringify(data.system || {})), prototypeToken: data.prototypeToken || {}, items: [],
    hasPlayerOwner: false, isOwner: false, testUserPermission: u => Boolean(u?.isGM), get isPerson() { return this.type !== 'vehicle'; },
    async update(p) { for (const [k, v] of Object.entries(p)) setPath(this, k, v); return this; },
    async applyDamage(n) { if (this.system.vehicle?.body) this.system.vehicle.body.value = Math.max(0, this.system.vehicle.body.value - n); },
    async getTokenDocument() { return {toObject: () => ({actorId: a.id, name: a.name, width: a.prototypeToken?.width ?? 1, height: a.prototypeToken?.height ?? 1, flags: {[NS]: {}}})}; }});
  a.uuid = `Actor.${a.id}`; docs.set(a.uuid, a); actors.push(a); return a; }};
function makeScene(map) {
  const tokens = [], drawings = [];
  const list = arr => Object.assign(arr, {get: id => Array.prototype.find.call(arr, t => t.id === id), find: fn => Array.prototype.find.call(arr, fn), filter: fn => Array.prototype.filter.call(arr, fn), some: fn => Array.prototype.some.call(arr, fn)});
  const scene = withFlags({id: `sc-${map.id}`, name: map.name, width: map.width, height: map.height, grid: {size: 100}, flags: {[NS]: {streetAtlas: {id: map.id}, zoneGraph: {zones: map.zones}}},
    tokens: list(tokens), drawings: list(drawings),
    async createEmbeddedDocuments(type, data, options = {}) {
      const out = [];
      for (const d of data) {
        if (type === 'Drawing') { const dr = withFlags({...JSON.parse(JSON.stringify(d)), id: uid('d'), async delete() { drawings.splice(drawings.indexOf(this), 1); }}); drawings.push(dr); out.push(dr); continue; }
        const doc = withFlags({rotation: 0, elevation: 0, hidden: false, sort: 0, ...JSON.parse(JSON.stringify(d)), id: uid('t'), parent: scene});
        Object.defineProperty(doc, 'actor', {get() { return game.actors.get(this.actorId); }});
        doc.uuid = `Scene.${scene.id}.Token.${doc.id}`; docs.set(doc.uuid, doc);
        doc.update = async (patch, opts = {}) => { for (const [k, v] of Object.entries(patch)) setPath(doc, k, v); Hooks.callAll('updateToken', doc, patch, opts, gm.id); return doc; };
        doc.delete = async () => { await scene.deleteEmbeddedDocuments('Token', [doc.id]); };
        doc.toObject = () => JSON.parse(JSON.stringify({...doc, parent: undefined}));
        tokens.push(doc); out.push(doc); Hooks.callAll('createToken', doc, options, gm.id);
      }
      return out;
    },
    async updateEmbeddedDocuments(type, ups, opts = {}) { for (const u of ups) { const d = tokens.find(x => x.id === u._id); if (d) { for (const [k, v] of Object.entries(u)) if (k !== '_id') setPath(d, k, v); Hooks.callAll('updateToken', d, u, opts, gm.id); } } return []; },
    async deleteEmbeddedDocuments(type, ids) { for (const id of ids) { const i = tokens.findIndex(t => t.id === id); if (i >= 0) { const [t] = tokens.splice(i, 1); Hooks.callAll('deleteToken', t, {}, gm.id); } } return []; }});
  return scene;
}
const scenes = atlas.maps.map(makeScene);
game.scenes = Object.assign(scenes, {get: id => Array.prototype.find.call(scenes, x => x.id === id), find: fn => Array.prototype.find.call(scenes, fn), filter: fn => Array.prototype.filter.call(scenes, fn), some: fn => Array.prototype.some.call(scenes, fn), size: scenes.length});
globalThis.canvas = {scene: scenes[0]};
const sceneOf = mapId => scenes.find(s => s.getFlag(NS, 'streetAtlas').id === mapId);
/* ---------------------------------------------------------------- the system */
const Jb = await import('../module/world/jobs.mjs');
const {dispatch} = await import('../module/world/net.mjs');
const {ensureVehicleActor, placeToken} = await import('../module/world/spawn.mjs');
Jb.registerJobSettings(); Jb.installJobs();
const hackney = sceneOf('LDN-HACKNEY');
const pc = fakeActor({name: 'Dee', stats: {frt: 8, sav: 8, grt: 8, whl: 8, mus: 8}, cash: 0}); pc.hasPlayerOwner = true; actors.push(pc); docs.set(pc.uuid, pc);
const state = () => Jb.jobsAPI.state();
const shiftOf = () => Object.values(state().shifts)[0];
const callNow = () => { const sh = shiftOf(); return sh ? state().calls[sh.activeCall] : null; };
// Put the vehicle (and whoever is in it) somewhere, moving maps the way a crossing does: same token, new scene.
async function driveTo(vt, scene, x, y) {
  const from = vt.parent, riders = (vt.getFlag(NS, 'vehicleOccupants') || []).map(o => from.tokens.get(o.tokenId)).filter(Boolean);
  if (scene !== from) {
    for (const t of [vt, ...riders]) { from.tokens.splice(from.tokens.indexOf(t), 1); t.parent = scene; scene.tokens.push(t); }
    if (shiftOf()) { const s = state(); s.shifts[shiftOf().id].sceneId = scene.id; await game.settings.set(NS, 'jobState', s); }
  }
  const g = 100, dx = x - (vt.x + vt.width * g / 2), dy = y - (vt.y + vt.height * g / 2);
  vt.x += dx; vt.y += dy; for (const r of riders) { r.x += dx; r.y += dy; }
  return vt;
}
const zoneCentre = (mapId, zoneId) => { const z = atlas.maps.find(m => m.id === mapId).zones.find(q => q.id === zoneId); return [z.rect[0] + z.rect[2] / 2, z.rect[1] + z.rect[3] / 2]; };
const tick = async (n = 1) => { for (let i = 0; i < n; i++) await Jb.clockTick(); };
async function roll(step, outcomeKey = 'strongSuccess') {
  const call = callNow() ?? Object.values(state().calls).find(c => c.status === 'active'), stat = {chat: 'frt', load: 'sav', treat: 'sav', hose: 'grt', chase: 'whl', stop: 'frt', calm: 'frt', cuff: 'mus'}[step];
  const id = uid('msg'); messages.set(id, withFlags({id, flags: {[NS]: {roll: {context: {callId: call.id, step}, userId: gm.id, actorUuid: pc.uuid, stat, outcomeKey}}}}));
  return dispatch('job.roll', {messageId: id, userId: gm.id});
}
async function startShift(catalogId, type) {
  for (const s of scenes) for (const t of [...s.tokens]) await s.deleteEmbeddedDocuments('Token', [t.id]);
  await game.settings.set(NS, 'jobState', {shifts: {}, calls: {}});
  const actor = await ensureVehicleActor(catalogId), [cx, cy] = zoneCentre('LDN-HACKNEY', hackney.getFlag(NS, 'zoneGraph').zones.find(z => z.kind === 'road').id);
  const vt = await placeToken(hackney, actor, cx, cy, {});
  const [me] = await hackney.createEmbeddedDocuments('Token', [{actorId: pc.id, name: pc.name, x: vt.x, y: vt.y, width: 1, height: 1, flags: {}}]);
  await dispatch('board', {sceneId: hackney.id, vehicleTokenId: vt.id, tokenId: me.id, seatId: 'pilot', userId: gm.id}).catch(() => null);
  const {boardVehicle} = await import('../module/vehicles/vehicle-boarding.mjs'); await boardVehicle(vt, me, 'pilot');
  await dispatch('job.start', {sceneId: hackney.id, vehicleTokenId: vt.id, type, userId: gm.id});
  return {vt, me};
}
async function offerAndAccept() {
  const s = state(); s.shifts[shiftOf().id].nextOfferAt = 0; await game.settings.set(NS, 'jobState', s);
  for (let i = 0; i < 10 && !Object.values(state().calls).some(c => c.status === 'offered'); i++) await tick();
  const offer = Object.values(state().calls).find(c => c.status === 'offered'); assert.ok(offer, `${shiftOf().type}: a callout comes in`);
  await dispatch('job.accept', {callId: offer.id, userId: gm.id});
  return callNow();
}
const paid = () => pc.system.cash;
const results = {};
/* ---------------------------------------------------------------- taxi */
{
  const {vt} = await startShift('LV12', 'taxi'); let call = await offerAndAccept();
  assert.equal(call.stage, 'pickup');
  const fare = vt.parent.tokens.get(call.data.fareTokenId); assert.ok(fare, 'the fare is standing at the kerb');
  await driveTo(vt, fare.parent, fare.x + 150, fare.y + 50); await tick();
  call = callNow(); assert.equal(call.stage, 'dropoff', 'fare aboard');
  assert.ok((vt.getFlag(NS, 'vehicleOccupants') || []).some(o => o.tokenId === fare.id), 'in the back of the cab');
  await roll('chat'); assert.equal(callNow().chat, 'strongSuccess', 'the chat roll counts for the tip');
  const [dx, dy] = zoneCentre(call.data.dest.mapId, call.data.dest.zoneId); await driveTo(vt, sceneOf(call.data.dest.mapId), dx, dy);
  const before = paid(); await tick();
  assert.ok(!callNow(), 'fare dropped'); assert.ok(paid() > before, 'paid'); results.taxi = paid() - before;
}
/* ---------------------------------------------------------------- courier */
{
  const {vt} = await startShift('LV21', 'courier'); let call = await offerAndAccept();
  let [x, y] = zoneCentre(call.data.mapId, call.data.zoneId); await driveTo(vt, sceneOf(call.data.mapId), x, y); await tick();
  call = callNow(); assert.equal(call.stage, 'dropoff');
  [x, y] = zoneCentre(call.data.dest.mapId, call.data.dest.zoneId); await driveTo(vt, sceneOf(call.data.dest.mapId), x, y);
  const before = paid(); await tick(); assert.ok(!callNow() && paid() > before, 'parcel delivered and paid'); results.courier = paid() - before;
}
/* ---------------------------------------------------------------- ambulance */
{
  const {vt} = await startShift('LV26', 'ambulance'); let call = await offerAndAccept();
  const patient = vt.parent.tokens.get(call.data.patientTokenId); assert.ok(patient);
  await driveTo(vt, patient.parent, patient.x + 150, patient.y); await tick();
  assert.equal(callNow().stage, 'treat');
  await roll('load'); call = callNow(); assert.equal(call.stage, 'hospital', 'loaded');
  assert.ok((vt.getFlag(NS, 'vehicleOccupants') || []).some(o => o.tokenId === patient.id), 'on the stretcher');
  const [x, y] = zoneCentre(call.dest.mapId, call.dest.zoneId); await driveTo(vt, sceneOf(call.dest.mapId), x, y);
  const before = paid(); await tick(); assert.ok(!callNow() && paid() > before, 'handed over at A&E'); results.ambulance = paid() - before;
}
/* ---------------------------------------------------------------- fire */
{
  const {vt} = await startShift('LV27', 'fire'); const call = await offerAndAccept();
  assert.equal(vt.parent.drawings.length, 1, 'the fire is drawn on the map');
  const [x, y] = zoneCentre(mapOf(call.data.sceneId), call.data.zoneId); await driveTo(vt, game.scenes.get(call.data.sceneId), x, y); await tick();
  assert.equal(callNow().stage, 'fight');
  const before = paid(); for (let i = 0; i < 4 && callNow(); i++) await roll('hose', 'fullSuccess');
  assert.ok(!callNow() && paid() > before, 'fire out, paid'); assert.equal(vt.parent.drawings.length, 0, 'the drawing is cleared'); results.fire = paid() - before;
}
function mapOf(sceneId) { return game.scenes.get(sceneId).getFlag(NS, 'streetAtlas').id; }
/* ---------------------------------------------------------------- bus */
{
  const {vt} = await startShift('LV28', 'bus'); const call = await offerAndAccept();
  const before = paid();
  for (const stop of call.data.stops) { const [x, y] = zoneCentre(stop.mapId, stop.zoneId); await driveTo(vt, sceneOf(stop.mapId), x, y); await tick(); }
  assert.ok(!callNow(), 'end of the line'); assert.ok(paid() > before + 10, 'fares at every stop and the route bonus'); results.bus = paid() - before;
}
/* ---------------------------------------------------------------- police: disturbance, ANPR, pursuit */
const policeCall = async kind => {
  const {vt} = await startShift('LV23', 'police');
  const s = state(); s.shifts[shiftOf().id].nextOfferAt = 0; await game.settings.set(NS, 'jobState', s);
  const real = Math.random; let call = null;
  for (let i = 0; i < 60 && !call; i++) {
    await tick(); const o = Object.values(state().calls).find(c => c.status === 'offered');
    if (o?.data?.kind === kind) call = o; else if (o) { await dispatch('job.decline', {callId: o.id, userId: gm.id}); const s2 = state(); s2.shifts[shiftOf().id].nextOfferAt = 0; await game.settings.set(NS, 'jobState', s2); }
  }
  Math.random = real; assert.ok(call, `a ${kind} callout`);
  await dispatch('job.accept', {callId: call.id, userId: gm.id});
  return {vt, call: callNow()};
};
{
  const {vt, call} = await policeCall('disturbance');
  const brawler = vt.parent.tokens.get(call.data.suspectTokenId); await driveTo(vt, brawler.parent, brawler.x + 150, brawler.y); await tick();
  assert.equal(callNow().stage, 'calm');
  const before = paid(); await roll('calm'); assert.ok(!callNow() && paid() > before, 'calmed down, paid'); results.disturbance = paid() - before;
}
async function arrestAndBook(vt, call) {
  const car = vt.parent.tokens.get(call.data.stolenTokenId);
  const me = vt.parent.tokens.find(t => t.actorId === pc.id);
  const {exitVehicle} = await import('../module/vehicles/vehicle-boarding.mjs'); await exitVehicle(me);
  Object.assign(me, {x: car.x + 250, y: car.y});
  await driveTo(vt, car.parent, car.x + 400, car.y + 50);
  await tick(); assert.ok(callNow().cuffAsked, 'standing by the car: cuff them');
  await roll('cuff'); const c = callNow(); assert.equal(c.stage, 'custody', 'in the cage');
  const [x, y] = zoneCentre(c.dest.mapId, c.dest.zoneId);
  const {boardVehicle} = await import('../module/vehicles/vehicle-boarding.mjs'); await boardVehicle(vt, vt.parent.tokens.find(t => t.actorId === pc.id), 'pilot');
  await driveTo(vt, sceneOf(c.dest.mapId), x, y);
  const before = paid(); await tick(); assert.ok(!callNow() && paid() > before, 'booked in, paid'); return paid() - before;
}
{
  const {vt, call} = await policeCall('anpr');
  const car = vt.parent.tokens.get(call.data.stolenTokenId); assert.ok(car?.getFlag(NS, 'plate'), 'the stolen car is in the traffic, with a plate');
  Hooks.callAll('smokePlateScanned', {policeToken: vt, target: car}); await new Promise(r => setTimeout(r, 20));
  assert.equal(callNow().stage, 'stop', 'ANPR hit');
  await vt.setFlag(NS, 'lightsOn', true);
  await driveTo(vt, car.parent, car.x + 350, car.y); await tick();
  assert.ok(callNow().stopAsked, 'lights on behind it: signal it to stop');
  await roll('stop'); assert.equal(callNow().stage, 'arrest', 'it pulls over');
  assert.equal(car.getFlag(NS, 'traffic')?.kind, 'stopped');
  results.anpr = await arrestAndBook(vt, callNow());
}
{
  const {vt, call} = await policeCall('pursuit');
  for (let i = 0; i < 6 && callNow()?.stage === 'pursuit'; i++) await roll('chase', 'strongSuccess');
  assert.equal(callNow().stage, 'arrest', 'boxed in');
  results.pursuit = await arrestAndBook(vt, call);
}
/* ---------------------------------------------------------------- Auntie Pat's order */
{
  for (const s of scenes) for (const t of [...s.tokens]) await s.deleteEmbeddedDocuments('Token', [t.id]);
  await game.settings.set(NS, 'jobState', {shifts: {}, calls: {}});
  await dispatch('job.crew', {actorId: pc.id, userId: gm.id});
  const call = Object.values(state().calls).find(c => c.type === 'crew'); assert.ok(call?.data.spots.length >= call.data.order.want, 'tip-offs on nearby maps');
  for (const s of new Set(call.data.spots.map(x => x.mapId))) Hooks.callAll('smokeTransit', {target: sceneOf(s)});
  await new Promise(r => setTimeout(r, 50));
  const bikes = scenes.flatMap(s => s.tokens.filter(t => t.getFlag(NS, 'orderFor') === call.id));
  assert.equal(bikes.length, call.data.spots.length, 'every tipped-off bike is chained up where Kez said');
  const before = paid();
  for (const b of bikes.slice(0, call.data.order.want)) Hooks.callAll('smokeVehicleSold', {seller: pc, catalogId: b.actor.getFlag(NS, 'catalogId'), service: 'gang'});
  await new Promise(r => setTimeout(r, 50));
  assert.ok(!state().calls[call.id] && paid() > before, 'order done, bonus paid'); results.pat = paid() - before;
}
console.log(`jobs end to end: taxi £${results.taxi}, courier £${results.courier}, ambulance £${results.ambulance}, fire £${results.fire}, bus £${results.bus}, police disturbance £${results.disturbance}, ANPR £${results.anpr}, pursuit £${results.pursuit}, Pat's order £${results.pat} — ok`);
process.exit(0);
