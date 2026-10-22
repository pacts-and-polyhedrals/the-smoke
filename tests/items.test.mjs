// Kit: the library, drugs (high then comedown), food and medicine, outfits and Heat, ammo and reloading.
import assert from 'assert';
import {fakeActor, itemNamed, conditionNames, LIB, chat} from './fakes.mjs';
game.users = Object.assign([{id: 'gm', isGM: true, active: true}], {activeGM: {id: 'gm'}, get: id => ({id, isGM: true})});
game.user = {id: 'gm', isGM: true, targets: new Set()};
game.time = {worldTime: 0};
globalThis.canvas = {scene: null};
const {CONDITION_EFFECTS, CONDITION_LIBRARY, statPenalty} = await import('../module/rules/conditions.mjs');
const items = await import('../module/world/items.mjs');

// 1. The library: counts, every drug/consumable effect is a real Condition, every weapon's ammo type is sold as ammo.
const by = t => LIB.filter(i => i.type === t);
assert.ok(by('weapon').length >= 35 && by('weapon').length <= 45, `35-45 weapons (${by('weapon').length})`);
assert.ok(by('perk').length >= 25, `25+ perks (${by('perk').length})`);
for (const t of ['drug', 'consumable', 'outfit', 'ammo']) assert.ok(by(t).length >= 5, `${t}s present`);
const condNames = new Set(CONDITION_LIBRARY.map(c => c.name));
for (const d of by('drug')) { assert.ok(condNames.has(d.system.high), `${d.name} high ${d.system.high} exists`); if (d.system.comedown) assert.ok(condNames.has(d.system.comedown), `${d.name} comedown exists`); }
for (const c of by('consumable')) for (const x of [c.system.grants, ...String(c.system.removes || '').split(',')].map(s => s?.trim()).filter(Boolean)) assert.ok(condNames.has(x), `${c.name}: ${x} exists`);
const ammoTypes = new Set(by('ammo').map(a => a.system.ammoType));
for (const w of by('weapon').filter(w => w.system.ammoType)) assert.ok(ammoTypes.has(w.system.ammoType), `${w.name} has ammo (${w.system.ammoType})`);
assert.equal(new Set(LIB.map(i => i.name)).size, LIB.length, 'item names are unique');
for (const i of LIB) assert.match(i.img, /assets\/icons\/items\/[a-z0-9-]+\.svg$/, `${i.name} has an icon`);

// 2. Drugs: Charlie -> Wired (+1 Front), then Crashing.
const jaz = fakeActor({items: ['Charlie', 'Kebab', 'Cans of Lager', 'First Aid Kit', 'Polymer Nine', '9mm Rounds', 'Tracksuit', 'Smart Suit']});
await items.takeDrug(jaz, itemNamed(jaz, 'Charlie'));
assert.deepEqual(conditionNames(jaz), ['Wired']);
assert.equal(itemNamed(jaz, 'Charlie'), undefined, 'the only wrap is used up');
assert.equal(statPenalty(new Set(conditionNames(jaz)), 'frt'), 1, 'Wired: +1 Front');
const wired = itemNamed(jaz, 'Wired');
assert.equal(wired.getFlag('the-smoke', 'expiresWorldTime'), 30*60, 'high expires after 30 game-clock minutes');
game.time.worldTime = 30*60+1;
await items.tickTimedConditions(undefined, [jaz]);
assert.deepEqual(conditionNames(jaz), ['Crashing'], 'the high turns into the comedown');
assert.equal(statPenalty(new Set(conditionNames(jaz)), 'btl'), -1, 'Crashing: -1 Bottle');

// 3. Food and drink: kebab heals and clears Mullered; two cans -> Mullered.
jaz.system.resources.health.value = 5;
await jaz.addCondition('Mullered');
await items.consume(jaz, itemNamed(jaz, 'Kebab'));
assert.equal(jaz.system.resources.health.value, 7, 'kebab heals 2');
assert.ok(!conditionNames(jaz).includes('Mullered'), 'kebab sobers you up');
await items.consume(jaz, itemNamed(jaz, 'Cans of Lager'));
assert.ok(conditionNames(jaz).includes('Dutch Courage'));
await items.consume(jaz, itemNamed(jaz, 'Cans of Lager'));
assert.ok(conditionNames(jaz).includes('Mullered'), 'a second can while Dutch Courage: Mullered');
assert.equal(itemNamed(jaz, 'Cans of Lager').system.quantity, 2, 'two cans left of four');
// First aid needs a roll; a failure wastes a use.
await jaz.addCondition('Bleeding'); jaz.rolls.push({outcomeKey: 'costlyFailure'});
await items.consume(jaz, itemNamed(jaz, 'First Aid Kit'));
assert.ok(conditionNames(jaz).includes('Bleeding'), 'failed patch-up: still bleeding');
jaz.rolls.push({outcomeKey: 'fullSuccess'});
await items.consume(jaz, itemNamed(jaz, 'First Aid Kit'));
assert.ok(!conditionNames(jaz).includes('Bleeding'), 'patched up');
assert.equal(itemNamed(jaz, 'First Aid Kit').system.quantity, 1);

// 4. Outfits and Heat.
assert.deepEqual(items.outfitHeatResult({heat: 2, watched: false, heatDrop: 1}), {to: 1, why: ''});
assert.equal(items.outfitHeatResult({heat: 2, watched: true, heatDrop: 1}).to, 2, 'not while the police watch');
assert.equal(items.outfitHeatResult({heat: 3, watched: false, heatDrop: 2}).to, 3, 'not at three stars');
assert.equal(items.outfitHeatResult({heat: 1, watched: false, heatDrop: 2}).to, 0);

// 5. Ammo: firing and reloading.
const gun = itemNamed(jaz, 'Polymer Nine');
await gun.update({'system.ammo.value': 3});
assert.equal(items.ammoFor(jaz, gun), 50, 'a box of fifty spare');
const loaded = await items.reload(jaz, gun);
assert.equal(loaded, 12); assert.equal(gun.system.ammo.value, 15); assert.equal(items.ammoFor(jaz, gun), 38);
await assert.rejects(() => items.reload(jaz, itemNamed(jaz, 'Tracksuit')), /does not take ammo/);

// 6. Street prices by district.
assert.equal(items.priceHere(70, {getFlag: (ns, k) => k === 'streetAtlas' ? {id: 'LDN-STRATFORD'} : null}), 91, 'Stratford pays more');
assert.equal(items.priceHere(70, {getFlag: (ns, k) => k === 'streetAtlas' ? {id: 'LDN-LEYTON'} : null}), 60, 'Leyton pays less');
console.log(`items: ${LIB.length} in the library; drugs, food, first aid, outfits, ammo and street prices — ok`);
process.exit(0);
