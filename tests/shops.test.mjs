// Shops: stock exists in the library, Rep-locked lines, discounts, buying stacks, selling to Uncle, services.
import assert from 'assert';
import {fakeActor, itemNamed, conditionNames, LIB, J, chat} from './fakes.mjs';
game.users = Object.assign([{id: 'gm', isGM: true, active: true}, {id: 'p1', isGM: false, active: true}], {activeGM: {id: 'gm'}, get: id => ({id, isGM: id === 'gm'})});
game.user = {id: 'gm', isGM: true};
globalThis.canvas = {scene: null};
globalThis.fetch = async () => ({ok: true, json: async () => ({items: LIB})});
const NS = 'the-smoke';
const {SHOPS, stockFor, discountFor, priceFor, shopsAt, giveItem, resprayPrice, repairPrice} = await import('../module/world/shops.mjs');
const net = await import('../module/world/net.mjs');

// Every stocked name is a real, sellable library item.
for (const [key, shop] of Object.entries(SHOPS)) for (const line of shop.stock || []) for (const n of line.items) {
  const i = LIB.find(x => x.name === n); assert.ok(i, `${key}: ${n} is in the library`); assert.ok(!i.system.restricted, `${key}: ${n} is not restricted`);
}
// Every weapon that is for sale somewhere has its ammo for sale somewhere.
const sold = new Set(Object.values(SHOPS).flatMap(s => (s.stock || []).flatMap(l => l.items)));
for (const w of LIB.filter(i => i.type === 'weapon' && sold.has(i.name) && i.system.ammoType)) assert.ok(LIB.some(a => a.type === 'ammo' && a.system.ammoType === w.system.ammoType && sold.has(a.name)), `${w.name}: its ammo is sold`);

// Rep gates and discounts.
const rep1 = {stage: 1, rep: {crew: 0, street: 0}}, rep3 = {stage: 3, rep: {crew: 3, street: 5}}, rep6 = {stage: 6, rep: {crew: 0, street: 0}};
const at1 = stockFor('dealer', LIB, rep1), at3 = stockFor('dealer', LIB, rep3), at6 = stockFor('dealer', LIB, rep6);
assert.equal(at1.find(l => l.minRep === 3).locked, true, 'guns locked at Rep 1');
assert.equal(at3.find(l => l.minRep === 3).locked, false, 'out the back opens at Rep 3');
assert.equal(at3.find(l => l.minRep === 6).locked, true, 'the good stuff still locked at Rep 3');
assert.equal(at6.find(l => l.minRep === 6).locked, false, 'the good stuff at Rep 6');
assert.equal(at6.find(l => l.minRep === 9).locked, true, 'don\'t ask: Rep 9');
assert.equal(discountFor(rep1, 'gang'), 0); assert.equal(discountFor(rep3, 'gang'), .2, 'street + Pat discounts cap at 20%');
assert.equal(discountFor(rep1, 'corner', ['Wide Boy']), .1, 'Wide Boy perk');
const grinder = LIB.find(i => i.name === 'Angle Grinder');
assert.equal(stockFor('gang', LIB, rep3)[0].items.find(i => i.name === 'Angle Grinder').price, priceFor(grinder, .2));

// Buying: ammo comes by the box, cans by the four-pack, petrol bombs stack.
const jaz = fakeActor({cash: 5000, items: ['9mm Rounds']});
const box = itemNamed(jaz, '9mm Rounds');
await giveItem(jaz, LIB.find(i => i.name === '9mm Rounds'), 2);
assert.equal(box.system.quantity, 150, 'two more boxes of fifty stack onto the one you have');
await giveItem(jaz, LIB.find(i => i.name === 'Cans of Lager'), 1); assert.equal(itemNamed(jaz, 'Cans of Lager').system.quantity, 4);
await giveItem(jaz, LIB.find(i => i.name === 'Petrol Bomb'), 2); assert.equal(itemNamed(jaz, 'Petrol Bomb').system.quantity, 4);
await giveItem(jaz, LIB.find(i => i.name === 'Smart Suit'), 1); assert.equal(itemNamed(jaz, 'Smart Suit').system.worn, false);

// The buy handler (as the GM, anywhere).
game.actors = Object.assign([jaz], {get: id => id === jaz.id ? jaz : null});
await net.request('shop.buy', {actorId: jaz.id, shopKey: 'corner', itemName: 'Energy Drink', qty: 3});
assert.equal(itemNamed(jaz, 'Energy Drink').system.quantity, 3); assert.equal(jaz.system.cash, 5000 - 6);
await assert.rejects(net.request('shop.buy', {actorId: jaz.id, shopKey: 'dealer', itemName: 'Kalash'}), /Rep 9/);
await assert.rejects(net.request('shop.buy', {actorId: jaz.id, shopKey: 'corner', itemName: 'Kalash'}), /does not sell/);
const poor = fakeActor({cash: 5}); game.actors = Object.assign([jaz, poor], {get: id => [jaz, poor].find(a => a.id === id)});
await assert.rejects(net.request('shop.buy', {actorId: poor.id, shopKey: 'gang', itemName: 'Angle Grinder'}), /has £5/);

// Selling to Uncle at 80%.
await giveItem(jaz, LIB.find(i => i.name === 'Charlie'), 3);
const before = jaz.system.cash;
await net.request('shop.sell', {actorId: jaz.id, shopKey: 'dealer', itemId: itemNamed(jaz, 'Charlie').id, qty: 2});
assert.equal(jaz.system.cash - before, 80, '2 wraps × £50 × 80%'); assert.equal(itemNamed(jaz, 'Charlie').system.quantity, 1);

// Services: kip at the flat, the stash, A&E.
jaz.system.resources.health.value = 3; await jaz.addCondition('Hurt'); await jaz.addCondition('Broken'); jaz.system.heat.value = 2; jaz.system.resources.hustle.value = 0;
game.time={worldTime:43200,advance:async seconds=>(game.time.worldTime+=seconds)};
await net.request('shop.service', {actorId: jaz.id, shopKey: 'safehouse', service: 'rest'});
assert.equal(game.time.worldTime,72000,'safehouse shop rest advances the shared Watch by 8 hours');
assert.equal(jaz.system.resources.health.value, 10); assert.equal(jaz.system.resources.hustle.value, 3); assert.equal(jaz.system.heat.value, 0);
assert.deepEqual(conditionNames(jaz), ['Broken'], 'a broken bone needs A&E');
const cash = jaz.system.cash;
await net.request('shop.service', {actorId: jaz.id, shopKey: 'safehouse', service: 'stash', amount: 1000});
assert.equal(jaz.system.stash, 1000); assert.equal(jaz.system.cash, cash - 1000);
await assert.rejects(net.request('shop.service', {actorId: jaz.id, shopKey: 'safehouse', service: 'stash', amount: -5000}), /Only £1000/);
await net.request('shop.service', {actorId: jaz.id, shopKey: 'hospital', service: 'treat'});
assert.deepEqual(conditionNames(jaz), ['Broken'], 'A&E sets the break in a cast: Broken still needs a week (0.1.2 rule)');
assert.match(chat.at(-1)?.content ?? '', /cast/);
jaz.system.heat.value = 2; await assert.rejects(net.request('shop.service', {actorId: jaz.id, shopKey: 'hospital', service: 'treat'}), /police/);

// Prices for the bodyshop.
const veh = J('london-vehicles.json').vehicles;
const v = id => ({system: JSON.parse(JSON.stringify(veh.find(x => x.id === id).system))});
// Local services prices (configurable): respray £100 flat; garage £10 per missing Body, a flat tyre counting as six.
assert.equal(resprayPrice(v('LV01')), 100); assert.equal(resprayPrice(v('LV21')), 100);
const dented = v('LV15'); dented.system.vehicle.body.value = dented.system.vehicle.body.max - 3; dented.system.vehicle.flats = 1;
assert.equal(repairPrice(dented), 10 * (3 + 6));

// Where shops are: a token by The Arches on the Hackney map sees Pat and the corner shop; inside the flat, the safehouse.
const atlas = J('london-street-atlas.json').maps, hm = atlas.find(m => m.id === 'LDN-HACKNEY');
const scene = {grid: {size: hm.gridSize}, width: hm.width, height: hm.height, getFlag: (ns, k) => ({zoneGraph: {zones: hm.zones}, streetAtlas: {id: hm.id}})[k]};
const arches = hm.zones.find(z => z.service === 'gang');
const tok = {parent: scene, x: arches.rect[0] + 20, y: arches.rect[1] + arches.rect[3] + 30, width: 1, height: 1};
assert.deepEqual(shopsAt(tok).sort(), ['corner', 'gang', 'safehouse'], 'Morning Lane: Pat, your flat and the corner shop');
const flat = J('london-places.json').maps.find(m => m.id === 'LDP-FLAT');
assert.deepEqual(shopsAt({parent: {grid: {size: 100}, getFlag: (ns, k) => ({zoneGraph: {zones: flat.zones}, place: {id: 'LDP-FLAT'}})[k]}, x: 700, y: 200, width: 1, height: 1}), ['safehouse']);
console.log('shops: stock, Rep locks, discounts, stacking, Uncle buys, kip/stash/A&E, bodyshop prices, locations — ok');
process.exit(0);
