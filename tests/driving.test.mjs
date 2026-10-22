// Driving in a chase: the green / yellow / red gauge, the checks it calls for, losing control, evasive manoeuvres and
// collisions, fire and explosions, chase speed dice, and what police and traffic do with an action.
import assert from 'assert/strict';
const D = await import('../module/rules/driving.mjs');

/* ---------------------------------------------------------------- the gauge */
const car = {speed: 8, body: {value: 10, max: 10}, perfDie: 8};
const b = D.driveBands(car);
assert.deepEqual([b.green, b.yellow, b.red], [8, 12, 16], 'green up to Speed, yellow 1½×, red 2×');
assert.equal(D.bandFor(0, b), 'green'); assert.equal(D.bandFor(8, b), 'green'); assert.equal(D.bandFor(8.2, b), 'green', 'a hair over is still green');
assert.equal(D.bandFor(9, b), 'yellow'); assert.equal(D.bandFor(12, b), 'yellow'); assert.equal(D.bandFor(13, b), 'red');
assert.equal(D.bandFor(16, b), 'red'); assert.equal(D.bandFor(17, b), 'over');
assert.equal(D.bandPenalty('green'), 0); assert.equal(D.bandPenalty('yellow'), -1); assert.equal(D.bandPenalty('red'), -2);
assert.equal(D.bandCheck('green'), null); assert.equal(D.bandCheck('yellow'), 'medium'); assert.equal(D.bandCheck('red'), 'hard');
assert.ok(D.bandRank('red') > D.bandRank('yellow') && D.bandRank('yellow') > D.bandRank('green'));
assert.deepEqual(D.bandsLeft(5, b), {green: 3, yellow: 7, red: 11});
assert.deepEqual(D.bandsLeft(20, b), {green: 0, yellow: 0, red: 0});
// damage and flats slow it down; a wreck can't redline; a burnt-out shell doesn't move
const flat = D.driveBands({...car, flats: 1}); assert.equal(flat.green, 6, 'a flat costs 2 squares');
const battered = D.driveBands({...car, body: {value: 4, max: 10}}); assert.ok(battered.green < 8, 'smoking and rattling');
const wreck = D.driveBands({...car, body: {value: 0, max: 10}}); assert.equal(wreck.red, wreck.yellow, 'a wreck has no red');
assert.equal(D.driveBands({...car, destroyed: true}).red, 0);
assert.equal(D.driveBands({speed: 1, flats: 4}).green, 2, 'never below 2 squares');

/* ---------------------------------------------------------------- chase dice and crew */
assert.equal(D.vehicleSpeedDice({perfDie: 4}), 1); assert.equal(D.vehicleSpeedDice({perfDie: 8}), 2);
assert.equal(D.vehicleSpeedDice({perfDie: 12}), 3); assert.equal(D.vehicleSpeedDice({perfDie: 20}), 4);
assert.equal(D.vehicleSpeedDice({perfDie: 12, flats: 2}), 2, 'two flats: one die fewer');
assert.equal(D.vehicleSpeedDice({perfDie: 4, body: {value: 0}}), 1, 'never below one');
assert.equal(D.vehicleSpeedDice({destroyed: true}), 0);
assert.equal(D.crewDie({}), 6); assert.equal(D.crewDie({}, {police: true}), 8, 'police drivers are trained');
assert.equal(D.crewDie({crewDie: 10}), 10); assert.equal(D.crewDie({crewDie: 7}, {police: true}), 8, 'not a die: automatic');

/* ---------------------------------------------------------------- losing it */
assert.equal(D.lossOfControl({band: 'yellow', outcomeKey: 'narrowSuccess'}).incident, false, 'made it: no incident');
const skid = D.lossOfControl({band: 'yellow', outcomeKey: 'costlyFailure'});
assert.ok(skid.incident && skid.kind === 'skid' && skid.body === 2 && skid.stop);
const spin = D.lossOfControl({band: 'yellow', outcomeKey: 'severeFailure'}); assert.equal(spin.kind, 'spin'); assert.ok(spin.body > skid.body);
const crash = D.lossOfControl({band: 'red', outcomeKey: 'severeFailure', size: 3});
assert.equal(crash.kind, 'crash'); assert.ok(crash.body >= 8 && crash.riders === 2 && crash.conditions.includes('Shaken'));

/* ---------------------------------------------------------------- evasive manoeuvres and collisions */
assert.equal(D.evadeBand('green'), 'easy'); assert.equal(D.evadeBand('yellow'), 'medium'); assert.equal(D.evadeBand('red'), 'hard');
assert.equal(D.collisionResult({outcomeKey: 'fullSuccess'}).hit, false, 'swerved clear');
const scrape = D.collisionResult({outcomeKey: 'narrowSuccess'}); assert.ok(scrape.hit && scrape.scrape && scrape.mine === 1);
const hit = D.collisionResult({outcomeKey: 'costlyFailure', band: 'green', mySize: 2, theirSize: 3});
assert.ok(hit.hit && hit.mine === 5 && hit.theirs === 4, 'the bigger vehicle hurts you more');
const fast = D.collisionResult({outcomeKey: 'costlyFailure', band: 'red', mySize: 2, theirSize: 2});
assert.ok(fast.mine > hit.mine && fast.riders === 1, 'speed makes it worse');
const smash = D.collisionResult({outcomeKey: 'severeFailure', band: 'red', mySize: 2, theirSize: 2});
assert.ok(smash.mine >= 12 && smash.stop && smash.conditions.includes('Shaken'));

// the swept test: what a move passes over, nearest first, ignoring what you're already on top of
const others = [{id: 'far', x: 900, y: 100, r: 40}, {id: 'near', x: 400, y: 120, r: 40}, {id: 'off', x: 500, y: 600, r: 40}, {id: 'touching', x: 110, y: 100, r: 40}];
const hits = D.sweptHits([100, 100], [1000, 100], 40, others);
assert.deepEqual(hits.map(h => h.id), ['near', 'far'], 'passes over two, nearest first');
assert.ok(hits[0].t0 > 0.25 && hits[0].t0 < 0.33, 'reaches the first one about a third of the way along');
assert.equal(D.sweptHits([100, 100], [100, 100], 40, others).length, 0, 'not moving: nothing');
assert.equal(D.sweptHits([100, 100], [300, 100], 40, others).length, 0, 'stops short');
// real car bodies: a 2×3 car (200×300 px) facing east, in the westbound lane 110 px away, is passed, not driven over
const parked = D.vehicleBody({id: 'car', x: 1000, y: 1000, w: 200, h: 300, rotation: 270});
assert.ok(Math.abs(parked.y1 - 1000) < 1e-6 && Math.abs(parked.x2 - parked.x1 - 100) < 1e-6, 'the body runs along the way it faces');
assert.equal(D.sweptHits([400, 1110], [1600, 1110], 100, [parked]).length, 0, 'passing in the next lane: no incident');
assert.equal(D.sweptHits([400, 1050], [1600, 1050], 100, [parked]).length, 1, 'down the middle of the road, through it: incident');
assert.equal(D.sweptHits([1060, 600], [1060, 1400], 100, [parked]).length, 1, 'across its tail end: incident');
assert.equal(D.sweptHits([1200, 600], [1200, 1400], 100, [parked]).length, 0, 'behind it: clear');

/* ---------------------------------------------------------------- fire */
assert.ok(D.FIRE_SECONDS >= 10);
assert.equal(D.explosionDamage(0, {inside: true}).damage, 10, 'still inside: it goes up with you');
assert.ok(D.explosionDamage(1).conditions.includes('Burning'));
assert.equal(D.explosionDamage(3).damage, 2); assert.equal(D.explosionDamage(6).damage, 0);
assert.equal(D.explosionDamage(2, {vehicle: true}).damage, 5); assert.equal(D.explosionDamage(5, {vehicle: true}).damage, 0);

/* ---------------------------------------------------------------- police and traffic on their turn */
const pb = {green: 10, yellow: 15, red: 20};
assert.equal(D.policeAction({distance: 3, targetOnFoot: true, bands: pb}).act, 'officersOut');
assert.equal(D.policeAction({distance: 3, heat: 2, bands: pb}).act, 'pit');
assert.equal(D.policeAction({distance: 3, heat: 3, bands: pb}).act, 'ram');
assert.equal(D.policeAction({distance: 8, heat: 4, bands: pb, armed: true}).act, 'shoot');
const close = D.policeAction({distance: 8, heat: 2, bands: pb}); assert.equal(close.band, 'green'); assert.equal(close.squares, 5.5, 'pulls up behind, not on top');
const keepUp = D.policeAction({distance: 16, heat: 2, bands: pb}); assert.equal(keepUp.band, 'yellow');
assert.equal(D.policeAction({distance: 30, heat: 2, bands: pb}).band, 'yellow', 'two stars: never redlines');
const flatOut = D.policeAction({distance: 30, heat: 3, bands: pb}); assert.equal(flatOut.band, 'red'); assert.equal(flatOut.squares, 20);
assert.deepEqual(D.trafficAction({bands: {green: 7}}), {act: 'drive', band: 'green', squares: 7, why: 'Carries on its way.'});

/* ---------------------------------------------------------------- who joins, and cutting them off */
const traffic = [{id: 'a', x: 5, y: 0}, {id: 'b', x: 30, y: 0}, {id: 'c', x: 2, y: 1}, {id: 'd', x: 0, y: 12}, {id: 'e', x: 18, y: 3}, {id: 'f', x: 1, y: 19}];
assert.deepEqual(D.pickChaseTraffic(traffic, [{x: 0, y: 0}]).map(t => t.id), ['c', 'a', 'd', 'e'], 'the nearest four within 20 squares');
assert.equal(D.pickChaseTraffic(traffic, []).length, 0);
const ahead = D.interceptPoint({x: 10, y: 10, rotation: 270}, 30, 8);   // facing east
assert.ok(Math.abs(ahead.x - 18) < 1e-9 && Math.abs(ahead.y - 10) < 1e-9, 'aims 8 squares ahead of a car heading east');
assert.equal(D.interceptPoint({x: 0, y: 0, rotation: 0}, 5, 8).ahead, 2, 'close in: only a little ahead');

/* ---------------------------------------------------------------- the end of it */
assert.equal(D.chaseOver({wanted: [], units: [{x: 0, y: 0}]}).over, true);
assert.equal(D.chaseOver({wanted: [{x: 0, y: 0}], units: []}).over, true);
assert.equal(D.chaseOver({wanted: [{x: 0, y: 0}], units: [{x: 10, y: 0}]}).over, false, 'still on them');
const lost = D.chaseOver({wanted: [{x: 0, y: 0}], units: [{x: 40, y: 0}]}); assert.ok(lost.over && lost.escaped);

console.log('driving: gauge, checks, incidents, collisions, fire, chase AI ok');
