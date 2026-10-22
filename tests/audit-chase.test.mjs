// 0.5.16 audit fixes around chases (reinforcements updated in 0.5.19: units after someone in the chase join its tracker);
// a chase only holds up the people in it (anyone else on the map walks freely); an unanswered driving card out on the
// street never strands a vehicle, and a late crash result doesn't teleport it back; Self-play players can end the chase
// they started; nobody but the GM sets a healthy motor alight; the GM can clear stuck checks from outside a chase.
import assert from 'node:assert/strict';
import {NS, scene, token, vehicle, gm, p1, settings, jaz, jt, ut, chat} from './chase-harness.mjs';
import {fakeActor} from './fakes.mjs';
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const net = await import('../module/world/net.mjs');
const chase = await import('../module/world/chase.mjs');
const heat = await import('../module/world/heat.mjs');
const inc = await import('../module/world/incidents.mjs'); inc.installIncidents();
const pursuit = await import('../module/world/pursuit.mjs'); pursuit.installPursuit();
const CS = await import('../module/world/chase-state.mjs');
const D = await import('../module/rules/driving.mjs');
game.actors = Object.assign([jaz], {get: id => [jaz].find(a => a.id === id), some: f => [jaz].some(f), filter: f => [jaz].filter(f), find: f => [jaz].find(f)});
jaz.testUserPermission = u => u?.isGM || u?.id === 'p1';

/* ---------------------------------------------------------------- police outside the chase */
const combat = await chase.startChaseNow(scene, {targetId: jt.id, reason: 'Police pursuit'});
assert.ok(combat && CS.chaseOf(scene) === combat);
assert.ok(combat.combatants.some(c => c.tokenId === ut.id), 'the unit that saw her is in it');
const backup = token(vehicle('Area Car 2', {perfDie: 10}), {x: 1600, y: 2200, w: 2, h: 3, flags: {police: {unit: 'car', hunting: jaz.id}}});
const farUnit = token(vehicle('Area Car 3', {perfDie: 10}), {x: 9000, y: 9000, w: 2, h: 3, flags: {police: {unit: 'car', hunting: jaz.id}}});
const heli = token(vehicle('India 99', {perfDie: 12}), {x: 1200, y: 600, w: 2, h: 2, flags: {police: {unit: 'heli', hunting: jaz.id}}});
// 0.5.19: during a chase no unit hunting someone in it drives in between turns; they go on the combat tracker.
const elsewhere = token(vehicle('Area Car 9', {perfDie: 10}), {x: 12000, y: 12000, w: 2, h: 3, flags: {police: {unit: 'car', hunting: 'someone-else'}}});
const roaming = heat.huntingUnits(scene).map(t => t.id);
assert.ok(!roaming.includes(backup.id) && !roaming.includes(farUnit.id), 'units after someone in the chase no longer drive in real time');
assert.ok(roaming.includes(elsewhere.id), 'a unit after someone outside the chase still does');
assert.ok(!roaming.includes(ut.id), 'the unit in the chase waits for its dice');
assert.ok(!roaming.includes(heli.id), 'the helicopter moves once a round in a chase');
const joined = await chase.joinReinforcements(combat);
assert.equal(joined, 2, 'both units hunting her join the chase on the tracker, near or far');
assert.ok(combat.combatants.some(c => c.tokenId === backup.id) && combat.combatants.some(c => c.tokenId === farUnit.id));
assert.ok(!combat.combatants.some(c => c.tokenId === elsewhere.id) && !combat.combatants.some(c => c.tokenId === heli.id));
assert.ok(chat.some(m => /More police join the chase/.test(m.content ?? '')));
await scene.deleteEmbeddedDocuments('Token', [elsewhere.id]);

/* ---------------------------------------------------------------- a chase only holds up the people in it */
const femi = fakeActor({name: 'Femi', stats: {mov: 6}}); femi.hasPlayerOwner = true; femi.testUserPermission = () => true;
const ft = token(femi, {x: 5000, y: 5000});
await ft.update({x: 5300, y: 5000});
assert.equal(ft.x, 5300, 'a character who is not in the chase walks freely');
const before = {x: jt.x, y: jt.y};
await jt.setFlag(NS, 'vehicleSeat', null);   // Jaz on foot, in the chase, and it's not her die
await combat.update({[`flags.${NS}.state`]: {phase: 'resolve', round: 1, cursor: 0, queue: [{cid: combat.combatants.find(c => c.tokenId === ut.id).id, name: ut.name, value: 6, die: 0}]}});
await jt.update({x: before.x + 400, y: before.y});
await tick(30);
assert.equal(jt.x, before.x, 'someone in the chase still moves only on their own die');

/* ---------------------------------------------------------------- driving cards never strand a car on the street */
const loose = token(vehicle('Hire Van'), {x: 3000, y: 3000, w: 2, h: 3});
await loose.setFlag(NS, 'prompts', {p1x: {kind: 'evade', status: 'pending', context: {key: null}}});
await combat.delete();
assert.equal(CS.chaseOf(scene), null);
const {gate} = inc._internals;
assert.deepEqual(await gate({vt: loose, scene, user: p1, transform: {x: 3300, y: 3000}, passengers: {}, free: false}), {x: 3300, y: 3000}, 'out on the street an open card does not stop the motor');
assert.equal(inc.blockingPrompts(loose).length, 0);
// in a chase a check raised in that chase does hold it
const c2 = await chase.startChaseNow(scene, {targetId: jt.id});
await loose.update({[`flags.${NS}.prompts.-=p1x`]: null}, {acVehicleCarry: true});
await loose.setFlag(NS, 'prompts', {p2x: {kind: 'driveCheck', status: 'pending', context: {key: `${c2.id}:1:0`}}});
assert.equal(inc.blockingPrompts(loose).length, 1, 'a check from this chase blocks until it is rolled');
await c2.delete();

/* ---------------------------------------------------------------- a late crash result doesn't teleport the car back */
const bus = token(vehicle('Route 38', {size: 3, body: 20}), {x: 6000, y: 6000, w: 2, h: 4});
const mover = token(vehicle('Golf', {body: 12}), {x: 6800, y: 6000, w: 2, h: 3});   // already driven on past the impact
const res = D.collisionResult({outcomeKey: 'severeFailure', band: 'green', mySize: 2, theirSize: 3});
await inc.collide(mover, bus, res, {impact: [6100, 6150], at: [6400, 6000]});
assert.equal(mover.x, 6800, 'the motor had moved on since the check: it stays where it is');
const parkedUp = token(vehicle('Polo', {body: 12}), {x: 6400, y: 7000, w: 2, h: 3});
await inc.collide(parkedUp, bus, res, {impact: [6100, 7150], at: [6400, 7000]});
await tick(30);
assert.equal(parkedUp.x, 6100 - 100, 'still where the drag left it: stopped dead at the impact');

/* ---------------------------------------------------------------- who ends a chase; who starts fires */
const c3 = await chase.startChaseNow(scene, {targetId: jt.id});
settings.playMode = 'story';
await assert.rejects(net.dispatch('chase.end', {combatId: c3.id, userId: p1.id}), /Story mode the GM ends chases/);
settings.playMode = 'self';
await net.dispatch('chase.end', {combatId: c3.id, userId: p1.id});
assert.equal(CS.chaseOf(scene), null, 'Self-play: the player who could start it can end it');
assert.ok(chat.some(m => /Maya calls it off/.test(m.content ?? '')));
const golf = token(vehicle('Fresh Golf', {body: 12}), {x: 8000, y: 100, w: 2, h: 3});
await assert.rejects(net.dispatch('drive.ignite', {tokenUuid: golf.uuid, userId: p1.id}), /GM only/, 'a player cannot set a healthy car alight');

/* ---------------------------------------------------------------- the GM clears stuck checks outside a chase */
await golf.setFlag(NS, 'prompts', {a: {kind: 'evade', status: 'review', result: {outcomeKey: 'costlyFailure'}, context: {}}, b: {kind: 'evade', status: 'pending', context: {}}});
await assert.rejects(net.dispatch('drive.clearPrompts', {tokenUuid: golf.uuid, userId: p1.id}), /GM only/);
assert.equal(await net.dispatch('drive.clearPrompts', {tokenUuid: golf.uuid, userId: gm.id}), 2);
assert.equal(inc.openPrompts(golf).length, 0, 'both cleared, nothing rerolled');
console.log('audit (chases): units hunting the chase join its tracker (others still drive), only chase people wait their turn, street cards never strand a car, late crashes do not teleport, Self-play can end its chase, fire and stuck-check tools are the GM\'s — ok');
process.exit(0);
