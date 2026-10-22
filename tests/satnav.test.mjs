// Sat nav: the road network across all twenty street maps, routes and turn-by-turn steps, job targets, and the route
// drawn on the street map (PIXI v7 and v8 drawing calls).
import assert from 'assert/strict';
import fs from 'fs';
import {hooks} from './runtime-stub.mjs';
const J = f => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url)));
const C = await import('../module/map/satnav-core.mjs');
const atlas = J('london-street-atlas.json'), places = J('london-places.json'), overview = J('london-overview.json'), venues = J('london-venues.json');

/* ---------------------------------------------------------------- one London */
assert.equal(C.overviewScale(atlas, overview), 0.32, 'the overview is the street maps at 0.32 scale');
assert.deepEqual(C.worldSize(atlas), [21000, 10800], 'five maps across, four down');
assert.deepEqual(C.toGlobal(atlas, 'LDN-HACKNEY', 960, -561), [9360, 2139]);
assert.equal(C.toLocal(atlas, 9360, 2900).mapId, 'LDN-HACKNEY'); assert.equal(C.toLocal(atlas, 9360, 2139).mapId, 'LDN-CLAPTON');
assert.ok(Math.abs(C.metresPerPx(atlas) - 0.2412) < 0.001, 'about a quarter of a metre per map pixel');

const net = C.roadNetwork(atlas);
assert.ok(net.nodes.length > 400 && net.edges.length > 500, `${net.nodes.length} junctions, ${net.edges.length} road pieces`);
// one connected network: every junction reachable from every other
const seen = new Set([0]), stack = [0];
while (stack.length) { const v = stack.pop(); for (const id of net.nodes[v].edges) { const e = net.edges[id], o = e.u === v ? e.v : e.u; if (!seen.has(o)) { seen.add(o); stack.push(o); } } }
assert.equal(seen.size, net.nodes.length, 'one connected road network');
const names = new Set(net.edges.map(e => e.name));
for (const r of ['Mare St', 'Morning Ln', 'Homerton High St', 'Kingsland Rd', 'Old Ford Rd', 'East Cross Route (A12)', 'Victoria Park Path']) assert.ok(names.has(r), `${r} is on the network`);
// a side road whose traced end stops short of the main road still joins it (Homerton High St meets Mare St / Lower Clapton Rd)
const at = (name, other) => net.nodes.some(n => { const r = new Set(n.edges.map(id => net.edges[id].name)); return r.has(name) && r.has(other); });
assert.ok(at('Homerton High St', 'Lower Clapton Rd') || at('Homerton High St', 'Mare St'), 'Homerton High St joins the Mare St corridor');
assert.ok(at('Green Lanes', 'Balls Pond Rd') || at('Albion Rd', 'Balls Pond Rd'), 'Green Lanes / Albion Rd reach Balls Pond Rd');

/* ---------------------------------------------------------------- destinations */
const DV = C.satnavDestinations(atlas, places, venues), D = DV.filter(d => !d.group.startsWith('Venues'));
const groups = DV.reduce((o, d) => (o[d.group] = (o[d.group] || 0) + 1, o), {});
const vgroups = Object.keys(groups).filter(g => g.startsWith('Venues'));
assert.deepEqual(Object.keys(groups).filter(g => !g.startsWith('Venues')), ['The Chainring', 'Services', 'Landmarks', 'Districts']);
assert.deepEqual(vgroups.map(g => g.split(' ')[2]), C.DISTRICT_CODES, 'twenty venue groups, in district order, between landmarks and districts');
assert.equal(Object.keys(groups).indexOf(vgroups[0]), 3);
// the campaign venues: every one listed once, at its street entrance (or its approach's)
const VD = DV.filter(d => d.group.startsWith('Venues'));
assert.equal(VD.length, 160); assert.equal(new Set(VD.map(d => d.placeId)).size, 160);
const clissold = VD.find(d => d.placeId === 'LDV-HB1'), app = C.tileOf(atlas, 'LDN-HIGHBURY').links.find(l => l.to === 'LDA-HB1');
assert.deepEqual([clissold.label, clissold.mapId, clissold.goal], ['Clissold House', 'LDN-HIGHBURY', [app.rect[0] + 100, app.rect[1] + 100]], 'a venue in a park: the park gate');
assert.match(clissold.sub, /^HB1 · via Clissold Park · /);
const rio = VD.find(d => d.placeId === 'LDV-DA1'), rioDoor = C.tileOf(atlas, 'LDN-DALSTON').links.find(l => l.to === 'LDV-DA1');
assert.deepEqual(rio.goal, [rioDoor.rect[0] + 100, rioDoor.rect[1] + 100], 'a venue on the street: its own door');
assert.ok(!D.some(d => d.label === 'Round Chapel'), 'a landmark that is now a venue is listed once, as the venue');
const arches = D.find(d => d.label === "The Arches · Pat's Cycles"), flat = D.find(d => d.label === 'Your Flat');
assert.ok(arches && flat && arches.group === 'The Chainring' && arches.placeId === 'LDP-ARCHES', 'the crew’s doors');
assert.equal(D.find(d => d.label === 'Stoke Newington Police Stn').sub, 'Custody Suite · Stoke Newington & Shacklewell', 'doors are named as on the street');
for (const s of ['Homerton Hospital', 'Kwik Spray Bodyshop', 'Lea Valley Motors', 'Ridley Rd Market']) assert.ok(D.some(d => d.label === s && d.group === 'Services'), s);
assert.equal(D.filter(d => d.label === 'Victoria Park').length, 1, 'a park on several maps is listed once');

/* ---------------------------------------------------------------- routes */
const from = C.toGlobal(atlas, 'LDN-BETHNAL-GREEN', 2000, 1500), to = C.toGlobal(atlas, arches.mapId, ...arches.goal);
const route = C.findRoute(net, from, to, {mode: 'drive'});
assert.deepEqual(route.legs.map(l => l.name), ['Old Ford Rd', 'Mare St', 'Lower Clapton Rd', 'Homerton High St']);
assert.ok(route.metres > 1500 && route.metres < 2100, `Bethnal Green → The Arches ${Math.round(route.metres)} m`);
assert.deepEqual(route.points[0], from); assert.deepEqual(route.points.at(-1), to);
const steps = C.routeSteps(route, atlas, {label: arches.label});
assert.deepEqual(steps.map(s => s.text), ['Head west on Old Ford Rd', 'Turn right onto Mare St', 'Leave by the north exit on Mare St into South Hackney & Well Street',
  'Leave by the north exit on Mare St into Hackney Central & Homerton', 'Turn right onto Homerton High St', "Arrive at The Arches · Pat's Cycles"]);
assert.ok(steps.every((s, i) => !i || s.dist >= steps[i - 1].dist), 'steps in order along the route');
// every destination reaches every other, by car and on foot
let n = 0;
for (const v of VD) { const r = C.findRoute(net, C.toGlobal(atlas, v.mapId, ...v.goal), C.toGlobal(atlas, arches.mapId, ...arches.goal), {mode: 'walk'}); assert.ok(r, `${v.label} → The Arches`); }
for (const a of D.filter((_, i) => i % 3 === 0)) for (const b of D.filter((_, i) => i % 4 === 1)) {
  if (a === b) continue;
  for (const mode of ['drive', 'walk']) { const r = C.findRoute(net, C.toGlobal(atlas, a.mapId, ...a.goal), C.toGlobal(atlas, b.mapId, ...b.goal), {mode}); assert.ok(r, `${a.label} → ${b.label} (${mode})`); n++; }
}
assert.ok(n > 300);
// drivers keep off footpaths when there is a road; walkers may use them
const vp = D.find(d => d.label === 'Victoria Park');
assert.ok(C.findRoute(net, C.toGlobal(atlas, flat.mapId, ...flat.goal), C.toGlobal(atlas, vp.mapId, ...vp.goal), {mode: 'drive'}).legs.every(l => l.cls !== 'P'), 'no footpaths by car');
// turns
assert.equal(C.turnKind(-90), 'left'); assert.equal(C.turnKind(80), 'right'); assert.equal(C.turnKind(10), 'straight'); assert.equal(C.turnKind(-40), 'slight-left'); assert.equal(C.turnKind(170), 'uturn');
assert.equal(C.compass(C.bearing([0, 0], [0, -10])), 'north'); assert.equal(C.compass(C.bearing([0, 0], [10, 0])), 'east');
// distances, UK style or metric
assert.equal(C.formatDistance(100), '110 yd'); assert.equal(C.formatDistance(1609.344), '1.0 mi'); assert.equal(C.formatDistance(350, 'metric'), '350 m'); assert.equal(C.formatDistance(2500, 'metric'), '2.5 km');
assert.equal(C.formatMinutes(3220, C.SPEED.drive), '10 min'); assert.equal(C.formatMinutes(9600, C.SPEED.walk), '2 h 0 min');
// the part of a route on one street map
const hk = C.tileOf(atlas, 'LDN-HACKNEY'), [ox, oy] = C.origin(hk), parts = C.clipToRect(route.points, [ox, oy, hk.width, hk.height]);
assert.ok(parts.length >= 1 && parts.flat().every(([x, y]) => x >= ox - 1e-6 && x <= ox + hk.width + 1e-6 && y >= oy - 1e-6 && y <= oy + hk.height + 1e-6), 'clipped to Hackney Central');
assert.deepEqual(C.clipToRect([[-10, 5], [20, 5]], [0, 0, 10, 10]), [[[0, 5], [10, 5]]]);

/* ---------------------------------------------------------------- the sat nav in Foundry */
const S = await import('../module/map/satnav.mjs');
S.registerSatnavSettings();
const d = await S.satnavData();
assert.equal(d.k, 0.32); assert.equal(d.destinations.length, DV.length);
// inside a venue, or on its approach, you are at the approach's street entrance
assert.deepEqual(S.doorOf(d, 'LDV-HB1'), S.doorOf(d, 'LDA-HB1')); assert.deepEqual(S.doorOf(d, 'LDA-HB1'), C.toGlobal(atlas, 'LDN-HIGHBURY', app.rect[0] + 100, app.rect[1] + 100));
assert.deepEqual(S.globalOf(d, {x: 500, y: 500, width: 1, height: 1, parent: {id: 'sV', grid: {size: 100}, getFlag: (ns, k) => k === 'place' ? {id: 'LDV-HB1'} : null}}), S.doorOf(d, 'LDV-HB1'));
assert.deepEqual(S.doorOf(d, 'LDV-DA1'), C.toGlobal(atlas, 'LDN-DALSTON', rioDoor.rect[0] + 100, rioDoor.rect[1] + 100));
for (const v of venues.maps) assert.ok(S.doorOf(d, v.id), `${v.code} has a way in from the street`);
// a mission stop at a mapped venue: the sat nav takes you to the venue's entrance
const nm7 = d.missions.find(m => m.code === 'NM7'), t7 = S.missionTarget(d, nm7, null);
assert.deepEqual([t7.placeId, t7.mapId, t7.label], ['LDV-HB1', 'LDN-HIGHBURY', 'Clissold House']);
assert.deepEqual(C.toGlobal(atlas, t7.mapId, t7.x, t7.y), S.doorOf(d, 'LDV-HB1'));
// a Blower turn arrow is drawn at the real angle
assert.match(S.turnGlyph(90), /M24 44V22L40\.0 22\.0/); assert.match(S.turnGlyph(180), /a8 8/);
// what to say next
const say = S.nextInstructions(route, steps, net.scale);
assert.equal(say.next.text, 'Turn right onto Mare St'); assert.ok(say.next.metres > 300 && say.next.metres < 420);
// job targets: pick-up, drop-off, bus stop, the car you're chasing
const flags = f => ({getFlag: (ns, k) => f[k] ?? null});
const tokens = Object.assign([], {get(id) { return this.find(t => t.id === id); }});
const hkScene = {id: 'sHK', name: 'Hackney Central & Homerton', grid: {size: 100}, tokens, ...flags({streetAtlas: {id: 'LDN-HACKNEY'}})};
game.scenes = [hkScene]; game.scenes.get = function (id) { return this.find(s => s.id === id); }; Object.defineProperty(game.scenes, 'contents', {get() { return [...this]; }});
const taxi = {id: 'c1', type: 'taxi', status: 'active', stage: 'pickup', title: 'Fare: Hackney Central Stn → Ridley Rd Market', ping: {sceneId: 'sHK', x: 300, y: 2100}, data: {sceneId: 'sHK', zoneId: 'hackney-central-stn', dest: {mapId: 'LDN-DALSTON', zoneId: 'ridley-rd-market', label: 'Ridley Rd Market'}}};
const pick = S.callTarget(d, taxi);
assert.deepEqual([pick.mapId, pick.label], ['LDN-HACKNEY', 'Hackney Central Stn'], 'the fare’s corner');
const drop = S.callTarget(d, {...taxi, stage: 'dropoff'});
assert.deepEqual([drop.mapId, drop.label, drop.zoneId], ['LDN-DALSTON', 'Ridley Rd Market', 'ridley-rd-market'], 'then the drop-off');
const ridley = C.tileOf(atlas, 'LDN-DALSTON').zones.find(z => z.id === 'ridley-rd-market');
assert.ok((ridley.adjacent || []).some(id => { const z = C.tileOf(atlas, 'LDN-DALSTON').zones.find(q => q.id === id); return z && z.rect[0] + z.rect[2] / 2 === drop.goal[0] && z.rect[1] + z.rect[3] / 2 === drop.goal[1]; }), 'aims for the kerb beside the block');
const bus = S.callTarget(d, {id: 'b', type: 'bus', stage: 'stop', index: 1, data: {stops: [{mapId: 'LDN-HACKNEY', zoneId: 'clarence-rd', label: 'Clarence Rd'}, {mapId: 'LDN-HACKNEY', zoneId: 'pembury-rd-1', label: 'Pembury Rd'}]}});
assert.equal(bus.label, 'Stop: Pembury Rd');
tokens.push({id: 'stolen', actorId: 'x', x: 1000, y: 1000, width: 2, height: 1, parent: hkScene, getFlag: () => null});
const chase = S.callTarget(d, {id: 'p', type: 'police', stage: 'pursuit', data: {stolenTokenId: 'stolen', carName: 'Hatchback', plate: 'LB21 KXT'}});
assert.equal(chase.tokenId, 'stolen'); assert.equal(chase.label, 'Hatchback · LB21 KXT');
assert.equal(S.callTarget(d, {id: 'p', type: 'police', stage: 'search', data: {stolenTokenId: 'stolen'}}), null, 'no tip-off while you are still searching');
// where a token is: on a street map, on the overview, inside a place (at its door)
assert.deepEqual(S.globalOf(d, tokens.get('stolen')), C.toGlobal(atlas, 'LDN-HACKNEY', 1100, 1050));
const ovScene = {id: 'sOV', grid: {size: 100}, ...flags({streetAtlas: {id: 'LDN-OVERVIEW'}})};
assert.deepEqual(S.globalOf(d, {x: 3150, y: 1550, width: 1, height: 1, parent: ovScene}).map(Math.round), [10000, 5000]);
const archesScene = {id: 'sAR', grid: {size: 100}, ...flags({place: {id: 'LDP-ARCHES'}})};
assert.deepEqual(S.globalOf(d, {x: 300, y: 300, width: 1, height: 1, parent: archesScene}), C.toGlobal(atlas, 'LDN-HACKNEY', 1700, 1700), 'inside The Arches = its door on the street');

// following a character: start, re-route as they move, draw on the street map (PIXI v7 and v8)
const actor = {id: 'a1', name: 'Jaz', type: 'character', system: {}};
game.actors = Object.assign([actor], {get: id => id === 'a1' ? actor : null, find: f => [actor].find(f)});
const me = {id: 'jaz', actorId: 'a1', actorLink: true, x: 1950, y: 1450, width: 1, height: 1, getFlag: () => null};
const bgScene = {id: 'sBG', name: 'Bethnal Green', grid: {size: 100}, tokens: Object.assign([me], {get(id) { return this.find(t => t.id === id); }}), ...flags({streetAtlas: {id: 'LDN-BETHNAL-GREEN'}})};
me.parent = bgScene; game.scenes.push(bgScene);
const calls = [];
class G7 { clear() { calls.push(['clear']); } lineStyle(o) { calls.push(['lineStyle', o.width]); } moveTo(x, y) { calls.push(['moveTo', x, y]); } lineTo(x, y) { calls.push(['lineTo', x, y]); } drawCircle(x, y, r) { calls.push(['circle', x, y, r]); } }
const layer = []; globalThis.PIXI = {Graphics: G7, LINE_CAP: {ROUND: 'round'}, LINE_JOIN: {ROUND: 'round'}};
globalThis.canvas = {ready: true, scene: bgScene, interface: {addChildAt: g => layer.push(g)}, tokens: {controlled: []}};
S.installSatnav();
await S.startSatNav(actor, {mapId: arches.mapId, x: arches.x, y: arches.y, goal: arches.goal, label: arches.label});
let st = S.satnavState();
assert.equal(st.route.legs[0].name, 'Old Ford Rd'); assert.equal(st.mode, 'walk', 'on foot'); assert.ok(!st.arrived);
assert.equal(layer.length, 1, 'the route layer is added once');
const firstMove = calls.findIndex(c => c[0] === 'moveTo');
assert.ok(firstMove > 0 && calls.slice(firstMove).some(c => c[0] === 'lineTo'), 'the route is drawn on Bethnal Green');
assert.ok(calls.filter(c => c[0] === 'moveTo').every(c => c[1] >= -1 && c[1] <= 4201 && c[2] >= -1 && c[2] <= 2701), 'in Bethnal Green’s own coordinates');
// move along: the sat nav re-routes from the new spot
me.x = 2050; me.y = 300; for (const f of hooks.updateToken) f(me, {x: me.x, y: me.y});
await new Promise(r => setTimeout(r, 250));
st = S.satnavState(); assert.ok(st.route.metres < 1850, 'shorter after moving towards it');
// inside The Arches: arrived
me.parent = archesScene; archesScene.tokens = Object.assign([me], {get(id) { return this.find(t => t.id === id); }}); bgScene.tokens.length = 0; game.scenes.push(archesScene);
await S.refresh(); assert.equal(S.satnavState().arrived, true, 'arrived when you are inside');
// the same drawing through the PIXI v8 calls
calls.length = 0; layer.length = 0;
class G8 extends G7 { setStrokeStyle() {} stroke(o) { calls.push(['stroke', o.width]); } circle(x, y, r) { calls.push(['circle', x, y, r]); } }
globalThis.PIXI.Graphics = G8; me.parent = bgScene; bgScene.tokens.push(me); hooks.canvasReady.forEach(f => f());
await S.refresh();
assert.ok(calls.some(c => c[0] === 'stroke') && !calls.some(c => c[0] === 'lineStyle'), 'PIXI v8 stroke calls');
// looking at the London overview: the whole route, at overview scale
calls.length = 0; globalThis.canvas.scene = ovScene; hooks.canvasReady.forEach(f => f()); await S.refresh();
const ovMoves = calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo');
assert.ok(ovMoves.length > 5 && ovMoves.every(c => c[1] >= 0 && c[1] <= 6720 && c[2] >= 0 && c[2] <= 3456), 'drawn across the overview');
globalThis.canvas.scene = bgScene;
// Pat's order: the nearest tip-off
const crew = {id: 'k', type: 'crew', status: 'active', data: {spots: [{mapId: 'LDN-CLAPTON', zoneId: C.tileOf(atlas, 'LDN-CLAPTON').zones.find(z => z.kind === 'land').id, label: 'Far'}, {mapId: 'LDN-BETHNAL-GREEN', zoneId: C.tileOf(atlas, 'LDN-BETHNAL-GREEN').zones.find(z => z.kind === 'land').id, label: 'Near'}]}};
assert.equal(S.callTarget(d, crew, C.toGlobal(atlas, 'LDN-BETHNAL-GREEN', 500, 500)).label, 'Tip-off: Near');
// a job: the sat nav follows the stage, and ends with the job
const jobState = {calls: {c1: {...taxi}}}; game.smoke = {jobs: {state: () => jobState}};
await S.startCallNav(actor, jobState.calls.c1);
assert.equal(S.satnavState().tgt.label, 'Hackney Central Stn');
jobState.calls.c1.stage = 'dropoff'; await S.refresh(); assert.equal(S.satnavState().tgt.label, 'Ridley Rd Market', 'on to the drop-off');
delete jobState.calls.c1; await S.refresh(); assert.equal(S.satnavState().target, null, 'job over, route over');
// a mission: Directions follows it from place to place as its objectives tick
const md = (await import('../module/world/missions.mjs'));
const ch4 = (await md.missionData()).missions.find(m => m.id === 'ch4');
await game.settings.set('the-smoke', 'missions', {ch4: {status: 'active', ticks: {}, actorIds: ['a1']}});
await S.startMissionNav(actor, ch4);
assert.equal(S.satnavState().tgt.label, 'Oddments Lockup'); assert.equal(S.satnavState().tgt.mapId, 'LDN-HIGHBURY');
assert.equal(S.satnavState().tgt.sub, 'CH4 · The Frame Room');
await game.settings.set('the-smoke', 'missions', {ch4: {status: 'active', ticks: {lockup: 1}, actorIds: ['a1']}}); await S.refresh();
assert.equal(S.satnavState().tgt.label, 'Hackney Marshes Centre', 'on to the next place once the lock-up is done');
await game.settings.set('the-smoke', 'missions', {ch4: {status: 'done'}}); await S.refresh();
assert.equal(S.satnavState().target, null, 'mission passed, route over');
// The right motor: the sat nav only heads for the buyer when what you're driving is what they want.
const vehicle = (id, catalogId, klass, name, at, over = {}) => {
  const f = {catalogId}; const actor = {type: 'vehicle', name, system: {vehicle: {klass, jobs: [], value: 900, body: {value: 10, max: 10}}}, getFlag: (ns, k) => f[k] ?? null};
  const flagsOf = {...over}; return {id, actorId: `act-${id}`, name, actor, x: at[0], y: at[1], width: 1, height: 2, rotation: 0, getFlag: (ns, k) => flagsOf[k] ?? null, _flags: flagsOf};
};
me.parent = bgScene; if (!bgScene.tokens.includes(me)) bgScene.tokens.push(me);
const ride = (v) => { v.parent = bgScene; v._flags.stolen = true; v._flags.vehicleOccupants = [{seatId: 'pilot', tokenId: 'jaz'}]; bgScene.tokens.push(v); me._flags = {vehicleSeat: {vehicleTokenId: v.id, seatId: 'pilot'}}; me.getFlag = (ns, k) => me._flags[k] ?? null; };
const getOff = v => { bgScene.tokens.splice(bgScene.tokens.indexOf(v), 1); me._flags = {}; };
const here = C.toGlobal(atlas, 'LDN-BETHNAL-GREEN', 2000, 1500);
// Pat's order wants a Whippet: on a BMX the sat nav keeps you looking; on a Whippet it's back to Pat's
const order = {id: 'k2', type: 'crew', status: 'active', data: {order: {want: 1, ids: ['LV03']}, delivered: 0, spots: [{mapId: 'LDN-BETHNAL-GREEN', zoneId: C.tileOf(atlas, 'LDN-BETHNAL-GREEN').zones.find(z => z.kind === 'land').id, label: 'Coffee rack'}]}};
const bmx = vehicle('bmx', 'LV01', 'bike', 'Grit Kid BMX', [1990, 1450]); ride(bmx);
let ct = S.callTarget(d, order, here, actor);
assert.notEqual(ct.label, "The Arches · Pat's Cycles", 'a BMX is not on a Whippet order'); assert.match(ct.label, /^Tip-off/); assert.match(ct.sub, /Grit Kid BMX isn't on Pat's order · Pat's order: 0\/1/);
getOff(bmx);
const whippet = vehicle('whip', 'LV03', 'bike', 'Carbon Whippet Road Bike', [1990, 1450]); ride(whippet);
ct = S.callTarget(d, order, here, actor);
assert.equal(ct.label, "The Arches · Pat's Cycles", 'on the Whippet: back to Pat'); assert.equal(ct.sub, 'Carbon Whippet Road Bike for Pat');
getOff(whippet);
// a nicked car is no good to Pat either (she takes bikes)
const hatch = vehicle('hatch', 'LV14', 'car', 'Vexa Hatch', [1990, 1450]); ride(hatch);
assert.notEqual(S.callTarget(d, {...order, data: {...order.data, order: {want: 2, ids: null}}}, here, actor).label, "The Arches · Pat's Cycles", 'a car is not a bike');
// and a tipped-off bike Kez left for this order is where it sends you
getOff(hatch);
const tip = vehicle('tip', 'LV03', 'bike', 'Carbon Whippet Road Bike', [600, 600], {locked: true, parked: true, orderFor: 'k2'}); tip.parent = hkScene; hkScene.tokens.push(tip);
const seeded = {...order, data: {...order.data, spots: order.data.spots.map(x => ({...x, seeded: true}))}};
ct = S.callTarget(d, seeded, here, actor); assert.equal(ct.tokenId, 'tip'); assert.equal(ct.label, 'Tip-off: Carbon Whippet Road Bike');
// missions do the same: Mission 2 wants a Whippet sold to Pat
const m02 = d.missions.find(m => m.id === 'm02'), m02st = {status: 'active', ticks: {market: 1, bait: 1}};
let mt = S.missionTarget(d, m02, m02st, null, {actor, here});
assert.equal(mt.tokenId, 'tip', 'not on one yet: the nearest Whippet to nick');
ride(bmx); mt = S.missionTarget(d, m02, m02st, null, {actor, here});
assert.equal(mt.tokenId, 'tip', 'on a BMX: still the Whippet'); assert.match(mt.sub, /Grit Kid BMX won't do/); getOff(bmx);
ride(whippet); mt = S.missionTarget(d, m02, m02st, null, {actor, here});
assert.equal(mt.label, "The Arches · Pat's Cycles", 'on the Whippet: to Pat'); getOff(whippet);
// Mission 1 starts by sending you to The Arches; Mission 5 wants a car at Bow Breakers, not the bike you're on
assert.equal(S.missionTarget(d, d.missions.find(m => m.id === 'm01'), {status: 'active', ticks: {}}, null, {actor, here}).label, "The Arches · Pat's Cycles");
const m05 = d.missions.find(m => m.id === 'm05'); ride(hatch);
assert.equal(S.missionTarget(d, m05, {status: 'active', ticks: {}}, null, {actor, here}).label, 'Bow Breakers Yard', 'in a nicked car: the crusher'); getOff(hatch);
ride(whippet); assert.notEqual(S.missionTarget(d, m05, {status: 'active', ticks: {}}, null, {actor, here}).label, 'Bow Breakers Yard', 'on a bike: not the crusher'); getOff(whippet);
// Mission 7: the respray only once you're in a nicked motor
const m07 = d.missions.find(m => m.id === 'm07'); ride(hatch);
assert.match(S.missionTarget(d, m07, {status: 'active', ticks: {}}, null, {actor, here}).label, /Kwik Spray|Lea Valley Motors/); getOff(hatch);
console.log('sat nav: one road network, routes and steps, destinations, job targets (to the buyer only in the right vehicle), live re-routing, map drawing (PIXI 7 and 8) — ok');
