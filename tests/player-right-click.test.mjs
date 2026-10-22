// 0.5.23: a player can right-click any vehicle on the street — including the ones already on the map when the world
// loads (Pat's chained-up order bikes, parked cars) — and gets Nick it / Carjack. Foundry fixes each token's
// right-click handlers when it draws the token; the system used to patch them only at "ready", after the first map
// was drawn, so those tokens kept Foundry's owner-only handlers: the GM could right-click them, a player couldn't.
import assert from 'node:assert/strict';
import process from 'node:process';
import './runtime-stub.mjs';
const NS = 'the-smoke';
const Token = foundry.canvas.placeables.Token;
const native = {right: Token.prototype._onClickRight};
Token.prototype._canHUD = function (user) { return Boolean(this.isOwner); };   // Foundry: the HUD is for owners
const owner = Token.prototype._canHUD;
const gm = {id: 'gm', isGM: true}, player = {id: 'p1', isGM: false};
game.user = player; game.users = Object.assign([gm, player], {get: id => [gm, player].find(u => u.id === id), filter: f => [gm, player].filter(f)});
const getFlag = function (ns, k) { return this.flags?.[ns]?.[k]; };
const scene = {id: 's1', grid: {size: 100}, flags: {}, getFlag, tokens: Object.assign([], {get: id => scene.tokens.find(t => t.id === id)})};
globalThis.canvas = {scene};
const bikeActor = {id: 'a-bmx', name: 'Grit Kid BMX', type: 'vehicle', isOwner: false, system: {vehicle: {size: 0, klass: 'bike'}}, flags: {}, getFlag, testUserPermission: () => false};
const doc = {id: 't-bike', name: 'Grit Kid BMX', actor: bikeActor, hidden: false, parent: scene, flags: {[NS]: {locked: true, parked: true, orderFor: 'call1', traffic: {kind: 'bike'}}}, getFlag};
scene.tokens.push(doc);
// drawn when the world loaded, before the system patched anything: its interaction manager holds Foundry's own handlers
const bike = Object.create(Token.prototype); Object.assign(bike, {document: doc, isOwner: false, visible: true, isVisible: true});
bike.mouseInteractionManager = {permissions: {clickRight: bike._canHUD}, callbacks: {clickRight: bike._onClickRight}};
canvas.tokens = {placeables: [bike], get: id => (id === 't-bike' ? bike : null)};
assert.equal(bike.mouseInteractionManager.permissions.clickRight.call(bike, player), false, 'as it was: a player had no right-click on it');
const {installPlayerInteractions, playerActionsFor} = await import('../module/interaction/player-context.mjs');
const {installTheft} = await import('../module/world/theft.mjs'); installTheft();
installPlayerInteractions();
assert.notEqual(Token.prototype._canHUD, owner, 'patched');
assert.equal(bike.mouseInteractionManager.permissions.clickRight.call(bike, player), true, 'the bike drawn before the patch now takes a player right-click');
assert.equal(bike.mouseInteractionManager.callbacks.clickRight, Token.prototype._onClickRight);
assert.notEqual(bike.mouseInteractionManager.callbacks.clickRight, native.right);
const titles = playerActionsFor(doc, player).map(a => a.title);
assert.ok(titles.includes('Nick it (cut the lock)'), `Pat's order bike: ${titles.join(', ')}`);
// a motor the GM put down with a Londoner at the wheel (not moving traffic): carjack it
const carActor = {id: 'a-car', name: 'Vexa Hatch', type: 'vehicle', isOwner: false, system: {vehicle: {size: 2, klass: 'car'}}, flags: {}, getFlag, testUserPermission: () => false};
const driver = {id: 't-drv', actor: {type: 'npc'}, getFlag, flags: {}};
const car = {id: 't-car', name: 'Vexa Hatch', actor: carActor, hidden: false, parent: scene, getFlag, flags: {[NS]: {vehicleOccupants: [{seatId: 'pilot', tokenId: 't-drv', ambient: true}]}}};
scene.tokens.push(driver, car);
assert.ok(playerActionsFor(car, player).some(a => a.title === 'Carjack'), 'an NPC at the wheel: Carjack');
car.flags[NS].police = {unit: 'car'};
assert.ok(!playerActionsFor(car, player).some(a => a.title === 'Carjack'), 'not a police unit with its crew aboard');
// installing again (at ready, after the first install at init) changes nothing and re-arms freshly drawn tokens
installPlayerInteractions(); assert.equal(bike.mouseInteractionManager.callbacks.clickRight, Token.prototype._onClickRight);
console.log('player right-click: tokens drawn before the patch get the street menu (Pat\'s bikes: Nick it), NPC-driven motors offer Carjack, police units do not, re-install is safe — ok');
process.exit(0);
