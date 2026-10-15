import assert from 'assert';
import fs from 'fs';
import * as C from '../module/rules/core.mjs';
import * as D from '../module/rules/difficulty.mjs';
import * as J from '../module/rules/jobs-core.mjs';
import * as R from '../module/rules/roads-core.mjs';
import {buildFormula} from '../module/dice/formula.mjs';
let n = 0; const t = (name, fn) => { fn(); n++; };
const data = f => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url)));

t('formula: effort + stat + modifier, exploding', () => {
  const f = buildFormula({effortDie: 6, statDie: 8});
  assert.equal(f.formula, '1d6x=6 + 1d8x=8 + 4');
  assert.equal(buildFormula({effortDie: 10, statDie: 4, state: 'offGame'}).formula, '1d10 + 1d4 + 2');
  assert.match(buildFormula({statDie: 6, state: 'onARoll'}).formula, /x>=5/);
  assert.equal(buildFormula({effortDie: 6, statDie: 12, statUpgrades: 1}).staticModifier, 8);   // overflow past d12 = +2
});
t('outcome ladder', () => {
  assert.equal(C.outcomeFromMargin(-5).key, 'severeFailure'); assert.equal(C.outcomeFromMargin(-1).key, 'costlyFailure');
  assert.equal(C.outcomeFromMargin(0).label, 'Just About'); assert.equal(C.outcomeFromMargin(9).label, 'Legendary');
  assert.equal(C.blinderTier(2).label, 'A Blinder');
});
t('starting spread', () => {
  assert.ok(C.validateStartingSpread({a: 8, b: 6, c: 6, d: 6, e: 4, f: 4, g: 4, h: 4, i: 4}).valid);
  assert.ok(!C.validateStartingSpread({a: 8, b: 8, c: 6, d: 6, e: 4, f: 4, g: 4, h: 4, i: 4}).valid);
});
t('difficulty bands solve from the dice, and scale', () => {
  const d4 = D.suggestTN({attributeDie: 4}, 'medium'), d12 = D.suggestTN({attributeDie: 12}, 'medium');
  assert.ok(d12.tn > d4.tn); assert.ok(Math.abs(d4.chance - .6) < .08);
  const car = D.suggestTN({attributeDie: 6, effortDie: 12}, 'medium'), bmx = D.suggestTN({attributeDie: 6, effortDie: 4}, 'medium');
  assert.ok(car.tn > bmx.tn, 'a supercar Performance die raises the Medium number');
});
t('heat', () => {
  assert.equal(C.heatAfterCrime(0, 'nickBike'), 1); assert.equal(C.heatAfterCrime(0, 'nickBike', {witnessed: false}), 0);
  assert.equal(C.heatAfterCrime(4, 'copKiller'), 5); assert.equal(C.policeResponse(3).helicopter, true); assert.equal(C.policeResponse(2).helicopter, false);
  assert.ok(C.coolDownSeconds(5) > C.coolDownSeconds(1));
});
t('money', () => {
  assert.equal(C.fencePrice({value: 120, body: 3, bodyMax: 3, share: .35}), 40);
  assert.ok(C.fencePrice({value: 1800, body: 1, bodyMax: 3}) < C.fencePrice({value: 1800, body: 3, bodyMax: 3}));
  assert.equal(C.wastedCost(40), 40); assert.equal(C.wastedCost(5000), 500); assert.equal(C.bustedCost(5000), 1000);
});
t('jobs: plates, chases, patients, fires, theft', () => {
  for (let i = 0; i < 50; i++) assert.ok(J.isUkPlate(J.ukPlate()));
  assert.ok(J.chaseStep(2, 'strongSuccess').caught); assert.ok(J.chaseStep(4, 'severeFailure').escaped); assert.ok(J.chaseStep(2, 'severeFailure').crash);
  assert.equal(J.patientAfterTreatment('Faltering', 'strongSuccess'), 'Stable'); assert.equal(J.patientWorsens('Passing'), 'Lost');
  let f = {progress: 0, consequences: 0}; for (const o of ['fullSuccess', 'strongSuccess', 'fullSuccess']) f = J.fireStep(f, o); assert.ok(f.out);
  assert.equal(J.lockBandWithTool('hard', 'angle grinder'), 'easy'); assert.equal(J.lockBandWithTool('easy', 'bolt cutters'), 'easy');
  assert.ok(J.theftResult('narrowSuccess').witnessed); assert.ok(!J.theftResult('strongSuccess').witnessed);
  assert.ok(J.taxiPay({hops: 2, timeLeft: 1, rideOutcome: 'strongSuccess'}).total > J.taxiPay({hops: 2, timeLeft: 0, rideOutcome: 'costlyFailure'}).total);
});
t('atlas: 20 street maps, every exit has a partner, every map reachable', () => {
  const atlas = data('london-street-atlas.json'); assert.equal(atlas.maps.length, 20);
  const by = Object.fromEntries(atlas.maps.map(m => [m.id, m]));
  for (const m of atlas.maps) for (const l of m.links.filter(l => l.kind === 'edge')) {
    assert.ok(by[l.to], `${m.id} exit to unknown ${l.to}`);
    assert.ok(by[l.to].links.some(b => b.kind === 'edge' && b.to === m.id), `${m.id} → ${l.to} has no way back`);
  }
  const dist = J.hopDistances(J.mapGraph(atlas), 'LDN-HACKNEY');
  assert.equal(dist.size, 20, 'every map reachable from Hackney Central');
});
t('atlas: doors and interiors link both ways, services exist', () => {
  const atlas = data('london-street-atlas.json'), places = data('london-places.json');
  for (const p of places.maps) {
    const door = atlas.maps.flatMap(m => m.links.filter(l => l.kind === 'door' && l.to === p.id).map(l => ({m, l})))[0];
    assert.ok(door, `no street door into ${p.id}`); assert.ok(Array.isArray(door.l.land), `${p.id} door has no landing`);
    assert.ok(p.links.some(l => l.kind === 'exit' && l.to === door.m.id), `${p.id} exit does not lead back`);
  }
  const services = new Set(atlas.maps.flatMap(m => m.zones.map(z => z.service).filter(Boolean)));
  for (const s of ['hospital', 'police', 'gang', 'safehouse', 'respray', 'chop', 'clothes']) assert.ok(services.has(s), `no ${s} on the atlas`);
  assert.ok(J.nearestService(atlas, 'LDN-LEYTON', 'hospital'));
  assert.ok(J.pickDestination(atlas, 'LDN-DALSTON', {maxHops: 2}));
});
t('roads: lanes keep left, traffic and police move along them', () => {
  const m = data('london-street-atlas.json').maps.find(x => x.id === 'LDN-HACKNEY');
  assert.ok(m.roads.length > 10); const cross = R.crossings(m.roads);
  assert.ok(cross.some(c => c.length), 'roads cross');
  const east = {name: 'x', width: 300, pts: [[0, 100], [1000, 100]]};
  assert.ok(R.lanePosition(east, 500, 1).y < 100, 'eastbound keeps to the north (left) side');
  assert.ok(R.lanePosition(east, 500, -1).y > 100, 'westbound keeps to the south (left) side');
  assert.equal(R.lanePosition(east, 500, 1).rotation, 270);
  const ri = m.roads.findIndex(r => r.name === 'Mare St'), L = R.roadLength(m.roads[ri]); let st = {ri, s: L / 2, dir: 1}, moved = 0;
  assert.ok(R.pointAt(m.roads[ri], L / 2).x > 0); for (let i = 0; i < 40; i++) { const x = R.trafficStep(m.roads, cross, st, 150, {width: m.width, height: m.height}); if (x.despawn) break; st = x; moved++; }
  assert.ok(moved > 0);
  assert.ok(R.huntRoadStep(m.roads, cross, {ri: 0, s: 0}, 200, [m.width / 2, m.height / 2]) !== undefined);
});
t('catalogues', () => {
  const v = data('london-vehicles.json').vehicles; assert.equal(v.length, 29);
  for (const x of v) { assert.ok([4, 6, 8, 10, 12].includes(x.system.vehicle.perfDie), x.name); assert.ok(fs.existsSync(new URL(`..${x.tokenImg.replace('systems/the-smoke', '')}`, import.meta.url)), `token art ${x.name}`); }
  assert.ok(v.some(x => x.jobs.includes('police') && x.abilities.some(a => a.key === 'policeKit')), 'a police car with ANPR');
  const {npcs, peds} = data('london-npcs.json'); assert.ok(npcs.find(n => n.key === 'patient') && npcs.find(n => n.key === 'suspect') && peds.length >= 20);
  for (const p of data('london-pregens.json').pregens) assert.ok(C.validateStartingSpread(Object.fromEntries(Object.entries(p.system.stats).map(([k, s]) => [k, s.die]))).valid, `${p.name} spread`);
  for (const m of data('london-street-atlas.json').maps) assert.ok(fs.existsSync(new URL(`../assets/maps/${m.file}`, import.meta.url)), m.file);
});
console.log(`rules + data: ${n} groups passed`);
