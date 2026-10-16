// Migration from 0.1: old weapons get the new fields, svg icons get the item art, made characters stop seeing the creator.
import assert from 'assert';
import {fakeActor, itemNamed, LIB} from './fakes.mjs';
game.user = {id: 'gm', isGM: true};
const old = fakeActor({name: 'Danny', stats: {grf: 8, sav: 6}, items: [{name: 'Converted Pistol', type: 'weapon', img: 'icons/svg/target.svg', system: {stat: 'aim', impact: 4, range: 'Near', kind: 'firearm', ammo: {value: 8, max: 8}, category: 'melee', ammoType: '', effect: ''}},
  {name: 'Taser', type: 'weapon', img: 'icons/svg/lightning.svg', system: {stat: 'aim', kind: 'firearm', ammo: {value: 2, max: 2}, category: 'melee', ammoType: '', effect: ''}}]});
const blank = fakeActor({name: 'New'});
game.items = [];
game.actors = Object.assign([old, blank], {get: id => [old, blank].find(a => a.id === id)});
const {migrateItems} = await import('../module/content.mjs');
const n = await migrateItems(LIB);
const gun = itemNamed(old, 'Converted Pistol');
assert.equal(gun.system.ammoType, '9mm'); assert.equal(gun.system.category, 'pistol'); assert.match(gun.img, /converted-pistol\.svg$/);
assert.equal(itemNamed(old, 'Taser').system.effect, 'stun'); assert.equal(itemNamed(old, 'Taser').system.restricted, true);
assert.equal(old.system.creation.done, true, 'a character with stats is already made');
assert.equal(blank.system.creation.done, false, 'an all-d4 blank still gets the creator');
assert.equal(n, 3);
assert.equal(await migrateItems(LIB), 0, 'running it again changes nothing');
console.log('migration: old weapons get ammo types, categories, effects and icons; made characters marked — ok');
process.exit(0);
