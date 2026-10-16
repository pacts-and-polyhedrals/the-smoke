// Selling nicked rides: Pat at The Arches buys anything on two wheels, Bow Breakers buys motors, and the offer
// reaches the rider when they pull up. Reproduces the "scrambler at The Arches, no sell button" report.
import './runtime-stub.mjs';
import assert from 'assert';
import fs from 'fs';
const NS = 'the-smoke';
const root = new URL('..', import.meta.url).pathname;
const J = f => JSON.parse(fs.readFileSync(`${root}data/${f}`, 'utf8'));
const atlas = J('london-street-atlas.json').maps, vehicles = J('london-vehicles.json').vehicles;
const settings = new Map();
game.settings.get = (ns, k) => settings.get(k);
game.users = Object.assign([{id: 'gm', isGM: true, active: true}, {id: 'p1', isGM: false, active: true}], {activeGM: {id: 'gm'}});
const sent = [];
globalThis.ChatMessage = {implementation: {create: async d => { sent.push(d); return d; }}, getSpeaker: () => ({})};

const {fenceHere, quoteFor, unsellable, patOrderNote, offerAtFence, ridingNicked, FENCES, buyerFor} = await import('../module/world/theft.mjs');

function sceneFor(mapId) {
  const m = atlas.find(x => x.id === mapId);
  const tokens = new Map();
  const scene = {id: mapId, grid: {size: m.gridSize}, getFlag: (ns, k) => ({zoneGraph: {zones: m.zones}, streetAtlas: {id: m.id}})[k], tokens: Object.assign(tokens, {find: f => [...tokens.values()].find(f), filter: f => [...tokens.values()].filter(f), some: f => [...tokens.values()].some(f)})};
  return {scene, m};
}
const actorFor = (vid, ownerOk = true) => { const v = vehicles.find(x => x.id === vid); return {type: 'vehicle', system: v.system, getFlag: (ns, k) => k === 'catalogId' ? vid : null, abilities: v.abilities, items: []}; };
function vehicleToken(scene, vid, cx, cy, flags = {}) {
  const v = vehicles.find(x => x.id === vid), g = scene.grid.size;
  const t = {id: `vt-${vid}`, uuid: `Scene.${scene.id}.Token.vt-${vid}`, name: v.name, parent: scene, x: cx - v.token.width * g / 2, y: cy - v.token.height * g / 2, width: v.token.width, height: v.token.height,
    actor: {...actorFor(vid), getFlag: (ns, k) => k === 'catalogId' ? vid : k === 'vehicleAbilities' ? v.abilities : null},
    flags: {[NS]: {...flags}}, getFlag(ns, k) { return this.flags[NS][k]; }, async update(u) { for (const [k, val] of Object.entries(u)) { const key = k.replace(`flags.${NS}.`, ''); this.flags[NS][key] = val; } }};
  scene.tokens.set(t.id, t); return t;
}
const rider = (scene, vt, actorId = 'pc1') => { const t = {id: 'rider', actorId, actor: {id: actorId, type: 'character', testUserPermission: (u) => u.id === 'p1'}, parent: scene}; scene.tokens.set('rider', t); vt.flags[NS].vehicleOccupants = [{seatId: 'pilot', tokenId: 'rider'}]; return t; };

const {scene: hackney, m: hm} = sceneFor('LDN-HACKNEY');
const arches = hm.zones.find(z => z.service === 'gang');
const [ax, ay, aw, ah] = arches.rect, g = hackney.grid.size;

// 1. The scrambler is a two-wheeler: Pat buys it.
assert.equal(buyerFor(actorFor('LV08')), 'gang', 'scrambler goes to Pat');
assert.equal(buyerFor(actorFor('LV10')), 'gang', 'superbike goes to Pat');
assert.equal(buyerFor(actorFor('LV15')), 'chop', 'hot hatch goes to Bow Breakers');

// 2. Pulled up in the junction on the corner (diagonal to the yard, not in its adjacency list): 0.1.x refused this.
const corner = hm.zones.find(z => z.id === 'homerton-high-lower-clapton');
assert.ok(!arches.adjacent.includes(corner.id), 'the corner junction is not listed as adjacent');
const scr = vehicleToken(hackney, 'LV08', corner.rect[0] + corner.rect[2] - 10, corner.rect[1] + corner.rect[3] - 10, {stolen: true, thief: 'pc1'});
assert.ok(fenceHere(scr), 'scrambler on the corner outside The Arches can be sold');
// right in front, on Morning Lane
scr.x = ax + aw / 2 - g; scr.y = ay + ah + 40;
assert.ok(fenceHere(scr), 'scrambler on Morning Lane outside can be sold');
// a long way off
scr.x = 200; scr.y = 200;
assert.equal(fenceHere(scr), null, 'scrambler across the map cannot be sold here');

// 3. Price and reasons.
const q = quoteFor(scr, 'gang');
assert.ok(q.price > 0 && q.price <= 2500 * FENCES.gang.share, `fair price (£${q.price})`);
assert.equal(unsellable(scr), '', 'a nicked scrambler is sellable');
const hire = vehicleToken(hackney, 'LV04', ax, ay + ah + 20, {stolen: true});
assert.match(unsellable(hire), /tracked/, 'docking-station bikes are refused');
const notNicked = vehicleToken(hackney, 'LV07', ax, ay + ah + 20, {});
assert.match(unsellable(notNicked), /not nicked/, 'a vehicle that is not nicked is refused');

// 4. Pat's order: the scrambler order counts; a road-bike order does not.
settings.set('jobState', {calls: {c1: {id: 'c1', type: 'crew', actorId: 'pc1', status: 'active', data: {order: {want: 1, ids: ['LV07', 'LV08'], bonus: 90}, delivered: 0}}}, shifts: {}});
assert.deepEqual(patOrderNote({id: 'pc1'}, scr), {counts: true, delivered: 0, want: 1, bonus: 90}, 'scrambler counts toward the moped/scrambler order');
settings.set('jobState', {calls: {c1: {id: 'c1', type: 'crew', actorId: 'pc1', status: 'active', data: {order: {want: 1, ids: ['LV03'], bonus: 120}, delivered: 0}}}, shifts: {}});
assert.equal(patOrderNote({id: 'pc1'}, scr).counts, false, 'scrambler does not count toward the road-bike order');
settings.set('jobState', {calls: {c1: {id: 'c1', type: 'crew', actorId: 'pc1', status: 'active', data: {order: {want: 2, ids: null, bonus: 40}, delivered: 1}}}, shifts: {}});

// 5. Arriving whispers an offer with a Sell button, once per visit.
rider(hackney, scr);
scr.x = ax + aw / 2 - g; scr.y = ay + ah + 40;
assert.equal(await offerAtFence(scr), true, 'offer made on arrival');
const offer = sent.at(-1);
assert.match(offer.content, /data-smoke-sell=/, 'offer has a Sell button');
assert.match(offer.content, /2 of 2/, 'offer says it completes the order');
assert.ok(offer.whisper.includes('p1') && offer.whisper.includes('gm'), 'whispered to the rider and the GM');
assert.equal(await offerAtFence(scr), false, 'no repeat while parked there');
scr.x = 200; scr.y = 200; await offerAtFence(scr);
assert.equal(scr.flags[NS].atFence, false, 'riding away resets the offer');
scr.x = ax + aw / 2 - g; scr.y = ay + ah + 40;
assert.equal(await offerAtFence(scr), true, 'coming back offers again');

// 6. The phone sees the nicked ride and the price.
const r = ridingNicked({id: 'pc1'}, hackney);
assert.ok(r && r.here && r.price === q.price && r.fence.who === 'Auntie Pat', 'phone shows the sale');

// 7. Cars: Bow Breakers on Old Ford & Bow, not Pat.
const {scene: bow, m: bm} = sceneFor('LDN-OLD-FORD');
const yard = bm.zones.find(z => z.service === 'chop');
const car = vehicleToken(bow, 'LV15', yard.rect[0] + yard.rect[2] / 2, yard.rect[1] + yard.rect[3] + 30, {stolen: true});
assert.equal(fenceHere(car)?.service, 'chop', 'hot hatch sells at Bow Breakers');
const carAtPat = vehicleToken(hackney, 'LV15', ax + aw / 2, ay + ah + 40, {stolen: true});
assert.equal(fenceHere(carAtPat), null, 'Pat does not buy cars');
console.log('fence: scrambler sells at The Arches (corner, Morning Lane), offers on arrival, Pat\'s order counted, cars to Bow Breakers — ok');
process.exit(0);
