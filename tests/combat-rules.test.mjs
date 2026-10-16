// Combat rules: speed dice, the queue, ranges, cover, ammo, bursts, aiming, drive-bys, effects, ramming, police AI.
import assert from 'assert';
import fs from 'fs';
const R = await import('../module/combat/rules.mjs');
const LIB = JSON.parse(fs.readFileSync(new URL('../data/london-items.json', import.meta.url), 'utf8')).items;
const W = (name, over = {}) => ({...LIB.find(i => i.name === name).system, ...over});

// Speed dice from Moves, and what stops you acting.
assert.equal(R.speedDiceCount({movDie: 4}), 1); assert.equal(R.speedDiceCount({movDie: 8}), 2); assert.equal(R.speedDiceCount({movDie: 12}), 3); assert.equal(R.speedDiceCount({movDie: 20}), 4);
assert.equal(R.speedDiceCount({movDie: 10, conditions: ['Stunned']}), 2);
assert.equal(R.speedDiceCount({movDie: 4, conditions: ['Stunned', 'Knackered']}), 1, 'never below one while you can act');
assert.equal(R.speedDiceCount({movDie: 12, conditions: ['Down']}), 0); assert.equal(R.speedDiceCount({movDie: 12, surrendered: true}), 0); assert.equal(R.speedDiceCount({movDie: 6, conditions: ['Cuffed']}), 0);

// The queue: highest die first; ties to the better Moves die, then characters.
const q = R.buildQueue([{cid: 'a', name: 'Jaz', results: [5, 2], movDie: 6, pc: true}, {cid: 'b', name: 'PC Officer', results: [5], movDie: 6, pc: false}, {cid: 'c', name: 'Sal', results: [6], movDie: 4, pc: true}, {cid: 'd', name: 'Femi', results: [5], movDie: 8, pc: true}]);
assert.deepEqual(q.map(e => `${e.name}:${e.value}`), ['Sal:6', 'Femi:5', 'Jaz:5', 'PC Officer:5', 'Jaz:2']);

// Ranges.
assert.equal(R.rangeBand(1), 'Engaged'); assert.equal(R.rangeBand(6), 'Near'); assert.equal(R.rangeBand(18), 'Far'); assert.equal(R.rangeBand(40), 'Distant');
assert.equal(R.attackPlan({weapon: W('Cricket Bat'), distance: 3}).ok, false, 'a bat needs you Engaged');
assert.equal(R.attackPlan({weapon: W('Polymer Nine'), distance: 18}).reason, 'Far is out of range (Near at most).');
assert.equal(R.attackPlan({weapon: W('Hunting Rifle'), distance: 40}).modifier, -1, 'Distant with a rifle: −1');
assert.equal(R.attackPlan({weapon: W('Kalash'), distance: 1}).modifier, -2, 'a rifle at arm\'s length');

// Cover and the target in a vehicle.
const c = R.attackPlan({weapon: W('Polymer Nine'), distance: 6, cover: 'heavy', targetInVehicle: true});
assert.equal(c.guardBonus, 6); assert.equal(c.armourBonus, 1);
assert.equal(R.attackPlan({weapon: W('Polymer Nine'), distance: 6, cover: 'full'}).ok, false);
assert.equal(R.attackPlan({weapon: W('Frag Grenade'), distance: 6, cover: 'full'}).ok, true, 'grenades find you anyway');

// Ammo, bursts, aiming.
assert.equal(R.attackPlan({weapon: W('Polymer Nine', {ammo: {value: 0, max: 15}}), distance: 5}).needsReload, true);
const burst = R.attackPlan({weapon: W('Machine Pistol', {ammo: {value: 30, max: 30}}), distance: 5, burst: true});
assert.equal(burst.ammoCost, 3); assert.equal(burst.impact, 6);
assert.equal(R.attackPlan({weapon: W('Machine Pistol', {ammo: {value: 2, max: 30}}), distance: 5, burst: true}).ok, false, 'a burst needs 3');
assert.equal(R.attackPlan({weapon: W('Polymer Nine'), distance: 5, burst: true}).ok, false, 'no bursts from a pistol');
assert.equal(R.attackPlan({weapon: W('Polymer Nine'), distance: 5, aimed: true}).effortUpgrades, 1);
assert.equal(R.attackPlan({weapon: W('Sawn-off Shotgun'), distance: 1}).impact, 8, 'sawn-off up close');

// Drive-bys.
assert.equal(R.attackPlan({weapon: W('Polymer Nine'), distance: 5, seat: 'passenger'}).modifier, -1);
assert.equal(R.attackPlan({weapon: W('Polymer Nine'), distance: 5, seat: 'pilot'}).modifier, -2);
assert.equal(R.attackPlan({weapon: W('Kalash'), distance: 5, seat: 'pilot'}).ok, false, 'no rifles one-handed');
assert.equal(R.attackPlan({weapon: W('Polymer Nine'), distance: 5, tyres: true}).modifier, -2);

// Damage and effects.
assert.equal(R.hitDamage({margin: 3, impact: 4, armour: 2}), 5);
assert.deepEqual(R.effectConditions('stun'), ['Stunned', 'Prone']);
assert.deepEqual(R.effectConditions('bleed', {damage: 3, outcomeKey: 'fullSuccess'}), []);
assert.deepEqual(R.effectConditions('bleed', {damage: 3, outcomeKey: 'strongSuccess'}), ['Bleeding']);
assert.equal(R.vehicleGuard(2), 10);
assert.deepEqual(R.ramDamage({margin: 2, size: 2}), {target: 6, self: 2, knockdown: true});
assert.deepEqual(R.ramDamage({margin: 2, size: 3, targetIsVehicle: true}), {target: 8, self: 4, knockdown: false});

// Arrests and the police AI.
assert.equal(R.cuffable({conditions: ['Grabbed']}), true); assert.equal(R.cuffable({surrendered: true}), true); assert.equal(R.cuffable({conditions: ['Hurt']}), false);
const pcKit = [W('Extendable Baton', {name: 'Extendable Baton'}), W('CS Spray', {name: 'CS Spray'}), W('Taser', {name: 'Taser'})].map((w, i) => ({...w, name: ['Extendable Baton', 'CS Spray', 'Taser'][i]}));
assert.equal(R.policeChoice({heat: 1, distance: 1, target: {surrendered: true}, weapons: pcKit}).act, 'cuff');
assert.equal(R.policeChoice({heat: 1, distance: 5, target: {surrendered: true}, weapons: pcKit}).act, 'move');
assert.equal(R.policeChoice({heat: 1, distance: 1, target: {}, weapons: pcKit}).act, 'grab', 'one star: hands on');
assert.equal(R.policeChoice({heat: 2, distance: 6, target: {}, weapons: pcKit}).weapon, 'Taser');
assert.equal(R.policeChoice({heat: 3, distance: 1, target: {}, weapons: pcKit.map(w => w.name === 'Taser' ? {...w, ammo: {value: 0, max: 2}} : w)}).weapon, 'CS Spray', 'taser empty: spray');
const arvKit = [{...W('Police Carbine'), name: 'Police Carbine'}];
assert.equal(R.policeChoice({heat: 4, distance: 15, target: {}, weapons: arvKit}).weapon, 'Police Carbine', 'Trojans shoot');
assert.equal(R.policeChoice({heat: 2, distance: 15, target: {}, weapons: pcKit}).act, 'move', 'too far for the taser');
console.log('combat rules: speed dice, queue, ranges, cover, ammo, bursts, drive-bys, effects, ramming, police AI — ok');
