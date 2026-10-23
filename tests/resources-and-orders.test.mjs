// 0.5.27: cash and kit the GM adds always count; in Self-play players' own money and kit come through play; the GM can
// give and take; the Blower orders high-street stock to the flat.
// The bug: a character dragged out from a "Create Actor" character got an unlinked token. Cash and Spray Paint added on
// that token's own sheet went into the token's copy, while the Tag Studio and the shops used the character itself.
import assert from 'node:assert/strict';
import process from 'node:process';
import {makeWorld} from './world-fixture.mjs';

const w = await makeWorld({players: 2}), NS = 'the-smoke';
const {installCharacterLinks, linkCharacterTokens} = await import('../module/world/characters.mjs');
const {isSprayCan} = await import('../module/graffiti/core.mjs');
const {markCan} = await import('../module/graffiti/runtime.mjs');
const {registerMissionSettings} = await import('../module/world/missions.mjs');
const {registerDeliverySettings, installDeliveries, deliveryState, onlineCatalogue, deliveriesFor} = await import('../module/world/deliveries.mjs');
const net = await import('../module/world/net.mjs');
await import('../module/gm/automation.mjs');
registerMissionSettings(); registerDeliverySettings(); installDeliveries();
const [jaz, femi] = w.pcs, lib = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/london-items.json', import.meta.url), 'utf8')).items;
const can = actor => actor.items.find(i => markCan(i)?.remainingCharges > 0);

// ---- the bug, reproduced: an unlinked token's sheet is a copy
jaz.prototypeToken.actorLink = false;
await jaz.createEmbeddedDocuments('Item', [{name: 'Bike Lock', type: 'gear', system: {quantity: 1}}]);
const scene = w.scenes.find(s => s.getFlag(NS, 'streetAtlas')?.id === 'LDN-HACKNEY');
const [tok] = await scene.createEmbeddedDocuments('Token', [{actorId: jaz.id, actorLink: false, name: jaz.name, x: 1000, y: 1000}]);
assert.notEqual(tok.actor, jaz, 'the token has its own copy of Jaz');
await tok.actor.createEmbeddedDocuments('Item', [{name: 'Spray Paint', type: 'gear', system: {quantity: 10}}]);
await tok.actor.update({'system.cash': 5000});
assert.equal(can(jaz), undefined, 'before: the character the Tag Studio uses has no paint ("buy one from a shop")');
assert.equal(jaz.system.cash, 1000, 'before: the cash went into the copy');

// ---- the fix: fold the copy into the character and link every character token
const out = await linkCharacterTokens();
assert.equal(out.tokens, 1); assert.equal(out.actors, 2, 'both characters\' new tokens were set to come out unlinked');
assert.equal(tok.actorLink, true, 'the token is linked'); assert.equal(jaz.prototypeToken.actorLink, true, 'and so are new ones');
assert.equal(can(jaz)?.system.quantity, 10, 'the ten cans are on the character now');
assert.equal(jaz.system.cash, 5000, 'and the cash');
assert.equal(jaz.items.filter(i => i.name === 'Bike Lock').length, 1, 'kit the character already had is not doubled');
assert.ok(w.chat.some(m => /Characters linked to their tokens/.test(m.content) && /Spray Paint/.test(m.content)), 'the GM is told what moved');
assert.deepEqual(await linkCharacterTokens(), {actors: 0, tokens: 0, moved: []}, 'nothing to do the second time');

// new characters and their tokens are linked from the start
installCharacterLinks();
const fakeDoc = (data) => ({...data, updateSource(ch) { for (const [k, v] of Object.entries(ch)) { const ks = k.split('.'); let o = this; for (const p of ks.slice(0, -1)) o = (o[p] ??= {}); o[ks.at(-1)] = v; } }});
const newPc = fakeDoc({type: 'character', prototypeToken: {actorLink: false}}); Hooks.callAll('preCreateActor', newPc, {}, {}, 'gm');
assert.equal(newPc.prototypeToken.actorLink, true, 'a character made with Create Actor is linked');
const npc = fakeDoc({type: 'npc', prototypeToken: {actorLink: false}}); Hooks.callAll('preCreateActor', npc, {}, {}, 'gm');
assert.equal(npc.prototypeToken.actorLink, false, 'NPCs are left alone');
const newTok = fakeDoc({actorId: femi.id, actorLink: false}); Hooks.callAll('preCreateToken', newTok, {}, {}, 'gm');
assert.equal(newTok.actorLink, true, 'a character token dragged out unlinked is linked');

// ---- a can by any sensible name counts
for (const name of ['Spray Paint', 'spray paint', 'Spray Paint Can', 'Spray can', 'Spray-paint']) assert.ok(isSprayCan({type: 'gear', name}), name);
assert.ok(!isSprayCan({type: 'weapon', name: 'CS Spray'}) && !isSprayCan({type: 'gear', name: 'Paint brush'}), 'CS spray and other kit are not paint');

// ---- Self-play: players' own money and kit come through play; the GM always has full control
const {lockedForUser, earnedOnly} = await import('../module/apps/sheets.mjs');
const player = w.users.get('user1'), gm = w.users.get('gm');
w.settings.set('playMode', 'story');
assert.equal(lockedForUser('system.cash', player), false, 'Story mode: the sheet works as before (the lock setting decides)');
w.settings.set('playMode', 'self');
assert.equal(lockedForUser('system.cash', player), true, 'Self-play: a player cannot type cash in');
assert.equal(lockedForUser('system.stash', player), true);
assert.equal(lockedForUser('system.identity.look', player), false, 'their story fields stay theirs');
assert.equal(lockedForUser('system.cash', gm), false, 'the GM can, in either mode');
assert.equal(earnedOnly(player), true); assert.equal(earnedOnly(gm), false);
w.settings.set('selfPlayEarnedOnly', false);
assert.equal(lockedForUser('system.cash', player), false, 'the GM can switch the rule off');
w.settings.set('selfPlayEarnedOnly', true); w.settings.set('playMode', 'story');

// the GM gives and takes kit and cash from the GM Screen
await net.dispatch('gm.reward', {actorIds: [femi.id], itemName: 'Spray Paint', qty: 3, userId: 'gm'});
assert.equal(femi.items.find(i => i.name === 'Spray Paint')?.system.quantity, 3, 'GM: give three cans');
await net.dispatch('gm.reward', {actorIds: [femi.id], itemName: 'Spray Paint', qty: 2, take: true, userId: 'gm'});
assert.equal(femi.items.find(i => i.name === 'Spray Paint')?.system.quantity, 1, 'GM: take two back');
await net.dispatch('gm.reward', {actorIds: [femi.id], itemName: 'Spray Paint', qty: 5, take: true, userId: 'gm'});
assert.equal(femi.items.find(i => i.name === 'Spray Paint'), undefined, 'GM: take the rest');
await assert.rejects(net.dispatch('gm.reward', {actorIds: [femi.id], cash: 500, userId: 'user2'}), /GM/i, 'players cannot use the GM\'s rewards');

// ---- Banana Basket: order on the Blower, delivered to the flat
const shops = onlineCatalogue(lib, femi.system, []);
const names = shops.flatMap(s => s.lines.flatMap(l => l.items.map(i => i.name)));
assert.ok(names.includes('Spray Paint') && names.includes('Meal Deal') && names.includes('Bandages'), 'high-street stock delivers');
for (const n of ['Crowbar', 'Baseball Bat', 'Skunk', 'Compact Pistol', '9mm Rounds']) assert.ok(!names.includes(n), `${n} does not come by courier`);
assert.ok(!shops.some(s => s.key === 'dealer'), 'Uncle doesn\'t deliver');
femi.system.cash = 200; femi.system.stage = 1;
const sprayPrice = shops.find(s => s.key === 'gang').lines.flatMap(l => l.items).find(i => i.name === 'Spray Paint').price;
const order = (extra = {}) => net.dispatch('delivery.order', {actorId: femi.id, shopKey: 'gang', itemName: 'Spray Paint', qty: 4, userId: 'user2', operationId: 'order-femi-0001', ...extra});
const r = await order();
assert.equal(femi.system.cash, 200 - (sprayPrice * 4 + 5), 'paid from the pocket: four cans plus £5 delivery');
await order();
assert.equal(femi.system.cash, 200 - (sprayPrice * 4 + 5), 'a retried order is charged once');
assert.equal(Object.keys(deliveryState().orders).length, 1);
assert.equal(deliveryState().orders[r.orderId].status, 'on-the-way');
await assert.rejects(net.dispatch('delivery.order', {actorId: femi.id, shopKey: 'gang', itemName: 'Crowbar', qty: 1, userId: 'user2', operationId: 'order-femi-0002'}), /won't deliver/);
await assert.rejects(net.dispatch('delivery.order', {actorId: femi.id, shopKey: 'dealer', itemName: 'Skunk', qty: 1, userId: 'user2', operationId: 'order-femi-0003'}), /deliver/);
await assert.rejects(net.dispatch('delivery.order', {actorId: jaz.id, shopKey: 'gang', itemName: 'Spray Paint', qty: 1, userId: 'user2', operationId: 'order-femi-0004'}), /own character/, 'not for someone else\'s character');
await assert.rejects(net.dispatch('delivery.collect', {actorId: femi.id, userId: 'user2'}), /Nothing waiting/, 'nothing yet');
await game.time.advance(61 * 60); await new Promise(res => setTimeout(res, 20));   // the clock moves; the delivery hook runs
assert.equal(deliveryState().orders[r.orderId].status, 'waiting', 'an hour on the Banana Watch later it is at the flat');
assert.ok(w.chat.some(m => /DELIVERED/.test(m.content)), 'and Femi is told');
await w.put(femi, 'LDN-HACKNEY', [1500, 1500]);
await assert.rejects(net.dispatch('delivery.collect', {actorId: femi.id, userId: 'user2'}), /Your Flat/, 'collect it at the flat');
await w.put(femi, 'LDP-FLAT', [1100, 550]);
assert.equal(deliveriesFor(femi).here, true);
await net.dispatch('delivery.collect', {actorId: femi.id, userId: 'user2'});
assert.equal(femi.items.filter(i => i.name === 'Spray Paint').reduce((n, i) => n + Number(i.system.quantity ?? 1), 0), 4, 'four cans, from the flat');
assert.equal(deliveryState().orders[r.orderId].status, 'collected');
await assert.rejects(net.dispatch('delivery.collect', {actorId: femi.id, userId: 'user2'}), /Nothing waiting/, 'collected once');
// cancel for a refund while it's on the way; the GM can hurry one
const cash = femi.system.cash;
const c = await net.dispatch('delivery.order', {actorId: femi.id, shopKey: 'corner', itemName: 'Meal Deal', qty: 1, userId: 'user2', operationId: 'order-femi-0005'});
await net.dispatch('delivery.cancel', {orderId: c.orderId, userId: 'user2'});
assert.equal(femi.system.cash, cash, 'cancelled: every penny back');
const d = await net.dispatch('delivery.order', {actorId: femi.id, shopKey: 'hospital', itemName: 'Bandages', qty: 2, userId: 'user2', operationId: 'order-femi-0006'});
await assert.rejects(net.dispatch('delivery.now', {orderId: d.orderId, userId: 'user2'}), /GM/);
await net.dispatch('delivery.now', {orderId: d.orderId, userId: 'gm'});
assert.equal(deliveryState().orders[d.orderId].status, 'waiting', 'the GM delivered it now');
await net.dispatch('delivery.collect', {actorId: femi.id, userId: 'user2'});
assert.ok(femi.items.some(i => i.name === 'Bandages'), 'bandages collected');
// the GM's settings: no delivery time, no fee, or no phone orders at all
w.settings.set('deliveryMinutes', 0); w.settings.set('deliveryFee', 0);
const before = femi.system.cash, e = await net.dispatch('delivery.order', {actorId: femi.id, shopKey: 'corner', itemName: 'Meal Deal', qty: 1, userId: 'user2', operationId: 'order-femi-0007'});
assert.equal(deliveryState().orders[e.orderId].status, 'waiting', 'delivery time 0: waiting at once');
assert.equal(before - femi.system.cash, lib.find(i => i.name === 'Meal Deal').system.value, 'no fee');
w.settings.set('phoneOrders', false);
await assert.rejects(net.dispatch('delivery.order', {actorId: femi.id, shopKey: 'corner', itemName: 'Meal Deal', qty: 1, userId: 'user2', operationId: 'order-femi-0008'}), /switched off/);

console.log('resources and orders: unlinked token copies folded into the character and linked (10 cans and £5,000 now count); new characters linked; any spray can counts; Self-play money and kit through play, GM full control, give and take; Blower orders delivered to the flat, paid once, collected there, cancelled with a refund, hurried by the GM — ok');
process.exit(0);
