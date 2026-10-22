// Street Life traffic on the real roads: each street map's driving network (the sat nav's, cut to the map), trips from
// one edge to another kept in the left-hand lane, easing off at corners, queueing, leaving and being replaced, older
// cars and job cars picking up a trip, and police chasing along the same roads.
import assert from 'assert/strict';
import fs from 'fs';
import {hooks} from './runtime-stub.mjs';
const J = f => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url)));
const C = await import('../module/map/satnav-core.mjs');
const T = await import('../module/rules/traffic-core.mjs');
const atlas = J('london-street-atlas.json'), net = C.roadNetwork(atlas);
let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---------------------------------------------------------------- every map's roads */
for (const m of atlas.maps) {
  const local = T.localNetwork(net, C.origin(m), [m.width, m.height]);
  assert.ok(local.exits.length >= 3, `${m.id}: ${local.exits.length} ways in and out`);
  assert.ok(local.edges.every(e => e.cls !== 'P'), `${m.id}: no footpaths for cars`);
  for (let i = 0; i < 12; i++) {
    const trip = T.randomTrip(local, r); assert.ok(trip, `${m.id}: a trip across`);
    const lane = T.lanePath(trip.pts, trip.widths);
    assert.ok(lane.every(([x, y]) => x >= -90 && y >= -90 && x <= m.width + 90 && y <= m.height + 90), `${m.id}: the trip stays on the map`);
    for (const end of [trip.pts[0], trip.pts.at(-1)]) assert.ok(end[0] <= 1 || end[1] <= 1 || end[0] >= m.width - 1 || end[1] >= m.height - 1, `${m.id}: in and out at the edge`);
    assert.notDeepEqual(trip.pts[0], trip.pts.at(-1), 'out somewhere else');
  }
}
/* ---------------------------------------------------------------- keep left, ease off for corners, queue */
const east = T.lanePath([[0, 1000], [2000, 1000]], [250]);
assert.ok(east.every(([, y]) => y < 1000), 'eastbound keeps to the north side: the left');
assert.equal(1000 - east[0][1], T.laneOffset(250));
const west = T.lanePath([[2000, 1000], [0, 1000]], [250]);
assert.ok(west.every(([, y]) => y > 1000), 'westbound: the south side');
const corner = T.lanePath([[0, 1000], [1000, 1000], [1000, 0]], [250, 250]);   // east, then left turn north
assert.equal(corner.length, 3, 'one corner where the two lanes meet');
assert.deepEqual(corner[1], [1000 - T.laneOffset(250), 1000 - T.laneOffset(250)]);
const st = T.stepAlong(corner, 500, 2000, {ease: 0});
assert.ok(st.corner && Math.abs(st.s - (1000 - T.laneOffset(250))) < 1, 'a step ends at the corner');
assert.equal(T.stepAlong(corner, st.s, 300).corner, false, 'then carries on round it');
assert.equal(T.stepAlong(corner, st.s - 60, 300).corner, false, 'a corner just ahead is driven through');
assert.equal(T.rotationOf(1, 0), 270); assert.equal(T.rotationOf(0, 1), 0); assert.equal(T.rotationOf(0, -1), 180);
const p = T.pointAt(corner, st.s, {incoming: true}); assert.equal(T.rotationOf(p.dx, p.dy), 270, 'still facing east at the corner');
const lane = east, mid = T.pointAt(lane, 1000);
const ahead = {x: mid.x + 600, y: mid.y, reach: 34, half: 150};
assert.ok(T.clearAhead(lane, 1000, 500, [ahead], {front: 150, gap: 35}) < 500, 'a car ahead in the lane holds it up');
assert.equal(T.clearAhead(lane, 1000, 500, [{...ahead, y: mid.y + 2 * T.laneOffset(250)}], {front: 150, gap: 35}), 500, 'oncoming traffic does not');
assert.equal(T.clearAhead(lane, 1000, 500, [{...ahead, y: mid.y - 50, reach: 26}], {front: 150, gap: 35}), 500, 'a car parked at the kerb does not');
assert.equal(T.clearAhead(lane, 1000, 500, [{...ahead, x: mid.x - 400}], {front: 150, gap: 35}), 500, 'nor one behind');

/* ---------------------------------------------------------------- Street Life on a map */
const NS = 'the-smoke', vehicles = J('london-vehicles.json').vehicles;
let n = 0; const id = () => `t${++n}`;
const flagged = obj => Object.assign(obj, {getFlag(ns, k) { return this.flags?.[ns]?.[k]; }});
const actors = []; game.actors = Object.assign(actors, {get: i => actors.find(a => a.id === i)});
globalThis.Actor = {implementation: {create: async d => { const a = flagged({id: id(), ...d, prototypeToken: d.prototypeToken, async getTokenDocument() { const t = JSON.parse(JSON.stringify(d.prototypeToken)); return {toObject: () => ({...t, actorId: a.id})}; }}); actors.push(a); return a; }}};
game.folders = Object.assign([], {find: () => ({id: 'f'})});
const setPath = (o, path, v) => { const ks = path.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ??= {}); x[ks.at(-1)] = v; };
const sceneOf = mapId => {
  const tokens = Object.assign([], {get(i) { return this.find(t => t.id === i); }});
  const scene = flagged({id: `s-${mapId}`, name: mapId, grid: {size: 100}, width: 4200, height: 2700, tokens, flags: {[NS]: {streetAtlas: {id: mapId}, zoneGraph: {zones: C.tileOf(atlas, mapId).zones}}}, updates: [], options: [],
    async createEmbeddedDocuments(_t, list) { return list.map(d => { const t = flagged({id: id(), ...d, parent: scene, get actor() { return actors.find(a => a.id === this.actorId); },
      async update(up) { for(const [k,v] of Object.entries(up)) setPath(this,k,v); return this; }}); tokens.push(t); return t; }); },
    async updateEmbeddedDocuments(_t, list, options) { scene.updates.push(list); scene.options.push(options); for (const u of list) { const t = tokens.get(u._id); for (const [k, v] of Object.entries(u)) if (k !== '_id') setPath(t, k, v); } },
    async deleteEmbeddedDocuments(_t, ids) { for (const i of ids) tokens.splice(tokens.findIndex(t => t.id === i), 1); }});
  return scene;
};
const hk = sceneOf('LDN-HACKNEY');
game.scenes = Object.assign([hk], {get: i => [hk].find(s => s.id === i)});
game.users = Object.assign([{id: 'gm', isGM: true, active: true, viewedScene: hk.id}], {activeGM: {id: 'gm'}, get: i => ({id: i, isGM: true})});
game.paused = false;
const Tr = await import('../module/world/traffic.mjs');
Tr.registerTrafficSettings();
for (const [k, v] of Object.entries({streetLife: true, trafficCars: 6, parkedCars: 0, lockedBikes: 0, pedestrians: 0, trafficTick: 1, trafficSpeed: 2.5})) await game.settings.set(NS, k, v);
globalThis.fetch = async url => ({ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(`../${String(url).replace(/^systems\/the-smoke\//, '')}`, import.meta.url)))});
assert.equal(await Tr.populate(hk), 6, 'six cars on the move');
const movers = () => hk.tokens.filter(t => t.getFlag(NS, 'traffic')?.kind === 'moving');
for (const v of movers()) {
  const crew=v.getFlag(NS,'vehicleOccupants')||[];
  assert.ok(crew.length>=1, `${v.name} has a real driver before its first traffic step`);
  assert.ok(crew.some(o=>o.seatId==='pilot'),'every moving motor has a pilot');
  assert.ok(crew.every(o=>hk.tokens.get(o.tokenId)?.getFlag(NS,'vehicleSeat')?.vehicleTokenId===v.id),'crew are actual seated NPC tokens');
}
const initialCrew=new Map(movers().map(v=>[v.id,(v.getFlag(NS,'vehicleOccupants')||[]).map(o=>o.tokenId)]));
hk.updates.length=0; hk.options.length=0;
for (const t of movers()) {
  const f = t.getFlag(NS, 'traffic');
  assert.ok(Array.isArray(f.route) && f.route.length >= 2 && Number.isFinite(f.s), 'each has a trip and a place along it');
  const at = T.pointAt(f.route, f.s), [cx, cy] = [t.x + t.width * 50, t.y + t.height * 50];
  assert.ok(Math.hypot(cx - at.x, cy - at.y) < 2, 'sat on its trip');
}
// a move: everyone a little further along their trip, animated over the gap until the next move
const before = new Map(movers().map(t => [t.id, t.getFlag(NS, 'traffic').s]));
await Tr.tick();
assert.equal(hk.updates.length, 1, 'one batched update for the map');
assert.equal(hk.options[0].animation.duration, 1000, 'animated over the second until the next move');
for(const u of hk.updates[0].filter(u=>initialCrew.has(u._id)&&Number.isFinite(u.x))){
  const linked=initialCrew.get(u._id);assert.ok(linked.every(id=>hk.updates[0].some(r=>r._id===id)),'driver and passengers are in same animation batch');
}
const moved = movers().filter(t => t.getFlag(NS, 'traffic').s > before.get(t.id));
assert.ok(moved.length >= 4, `${moved.length} of 6 cars moved on`);
for (const t of moved) {
  const f = t.getFlag(NS, 'traffic'), at = T.pointAt(f.route, f.s, {incoming: true});
  assert.ok(f.s - before.get(t.id) <= 2.5 * 100 * 1.6 * 1.15 + 1, 'no further than its speed');
  assert.ok(Math.hypot(t.x + t.width * 50 - at.x, t.y + t.height * 50 - at.y) < 2, 'still on the road');
  assert.equal(t.rotation, Math.round(T.rotationOf(at.dx, at.dy)), 'facing the way it drives');
}
// at the end of its trip a car leaves the map, and another comes in at an edge
const leaver = movers()[0], lf = leaver.getFlag(NS, 'traffic');
lf.s = T.pathLength(lf.route);
await Tr.tick();
assert.ok(!hk.tokens.includes(leaver), 'gone off the edge');
assert.equal(movers().length, 6, 'replaced');
const newcomer = movers().find(t => !before.has(t.id)), nf = newcomer.getFlag(NS, 'traffic');
assert.ok(nf.s < 200, 'the new car is just coming in');
// a car from an older version (no trip) or a job's car gets a trip from where it is, the way it faces
const old = movers()[1]; old.flags[NS].traffic = {kind: 'moving', dir: 'E', speed: 1};
await Tr.tick();
assert.ok(Array.isArray(old.getFlag(NS, 'traffic').route), 'an old car picks up a trip');
// a player standing in the road: the car stops short of them
const car = movers()[2], cf = car.getFlag(NS, 'traffic'), front = T.pointAt(cf.route, cf.s + 200 + Math.max(car.width, car.height) * 50 - 150);
const jaz = flagged({id: 'jaz', actorId: 'pc', x: front.x - 50, y: front.y - 50, width: 1, height: 1, rotation: 0, parent: hk, flags: {}, actor: {type: 'character', system: {heat: {value: 0}}}});
hk.tokens.push(jaz);
const sBefore = cf.s; await Tr.tick();
assert.ok(car.getFlag(NS, 'traffic').s - sBefore < 1, 'held up by someone in the road');
hk.tokens.splice(hk.tokens.indexOf(jaz), 1);
// blue lights: traffic pulls over
const blue = flagged({id: 'blue', x: car.x + 200, y: car.y, width: 2, height: 3, rotation: 0, parent: hk, flags: {[NS]: {lightsOn: true}}, actor: {type: 'vehicle', system: {vehicle: {}}, getFlag: () => null}});
hk.tokens.push(blue); const sBlue = car.getFlag(NS, 'traffic').s; await Tr.tick();
assert.equal(car.getFlag(NS, 'traffic').s, sBlue, 'pulls over for the blues'); hk.tokens.splice(hk.tokens.indexOf(blue), 1);
const local = await (await import('../module/world/roads.mjs')).drivingNetwork(hk);
// a minute of traffic: every car stays on the roads, and none drives through another in its lane
let worst = 0, tailgates = 0;
for (let i = 0; i < 60; i++) {
  await Tr.tick();
  const ms = movers();
  for (const t of ms) { const c = [t.x + t.width * 50, t.y + t.height * 50]; worst = Math.max(worst, T.nearestEdge(local, c).d); }
  for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) {
    const A = ms[a], B = ms[b], d = Math.hypot(A.x + A.width * 50 - B.x - B.width * 50, A.y + A.height * 50 - B.y - B.height * 50);
    if (d < 120 && Math.abs(((A.rotation - B.rotation) + 540) % 360 - 180) < 10) tailgates++;
  }
}
assert.ok(worst <= T.laneOffset(320) + 25, `always on a road (furthest ${Math.round(worst)} px from a centre line)`);
assert.equal(tailgates, 0, 'no car drives into the one in front');
assert.equal(movers().length, 6, 'still six on the move');
// police chase along the roads toward the wanted character
const H = await import('../module/world/heat.mjs');
assert.ok(local.exits.length >= 3);
const longest = [...local.edges].sort((a, b) => b.len - a.len)[0], A = local.nodes[longest.u], B = local.nodes[longest.v];
const unitStart = {x: (A.x + B.x) / 2, y: (A.y + B.y) / 2};
const unit = flagged({id: 'u1', x: unitStart.x - 100, y: unitStart.y - 150, width: 2, height: 3, rotation: 0, parent: hk, flags: {}});
const goal = [local.nodes[local.exits.at(-1)].x, local.nodes[local.exits.at(-1)].y];
const chase = H.chaseStep(local, unit, goal, {seconds: 1, g: 100, speed: 4});
assert.ok(chase && Math.hypot(chase.x - (unit.x + 100), chase.y - (unit.y + 150)) > 50, 'the unit drives toward the target');
const near = T.nearestEdge(local, [chase.x, chase.y]); assert.ok(near.d < 120, 'along a road');
assert.equal(H.chaseStep(local, unit, [unit.x + 120, unit.y + 160], {g: 100}), null, 'right behind them: it stops');
console.log('traffic: every map has roads in and out; trips edge to edge in the left lane; easing off at corners; queueing; leaving and being replaced; old and job cars pick up a trip; police chase along the roads — ok');
process.exit(0);
