// 0.5.18: the police "one opening" escape move. The escaper can drag their token straight away — it is never their
// die (the police were acting) — a ring on the map shows how far they can get, a drag past the limit stops at it,
// pressing Done before moving no longer throws the opening away, and using every square ends it by itself.
import assert from 'node:assert/strict';
import {NS, scene, token, gm, p1, settings, jaz, jt, ut, vt, chat} from './chase-harness.mjs';
import {fakeActor} from './fakes.mjs';
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const waitFor = async fn => { for (let i = 0; i < 300; i++) { if (fn()) return; await tick(); } throw new Error('timed out'); };
const net = await import('../module/world/net.mjs');
const chase = await import('../module/world/chase.mjs');
const inc = await import('../module/world/incidents.mjs'); inc.installIncidents();
const pursuit = await import('../module/world/pursuit.mjs'); pursuit.installPursuit();
const CS = await import('../module/world/chase-state.mjs');
const {footReach} = await import('../module/map/drive-gauge.mjs');
game.actors = Object.assign([jaz], {get: id => [jaz].find(a => a.id === id), some: f => [jaz].some(f), filter: f => [jaz].filter(f), find: f => [jaz].find(f)});
jaz.testUserPermission = u => u?.isGM || u?.id === 'p1';
settings.playMode = 'story';

// Jaz on foot in a chase; it is the police unit's die, not hers.
await jt.setFlag(NS, 'vehicleSeat', null); await vt.setFlag(NS, 'vehicleOccupants', []);
const combat = await chase.startChaseNow(scene, {targetId: jt.id});
const unitC = combat.combatants.find(c => c.tokenId === ut.id);
await combat.update({[`flags.${NS}.state`]: {phase: 'resolve', round: 1, cursor: 0, queue: [{cid: unitC.id, name: ut.name, value: 6, die: 0}]}});
const x0 = jt.x;
await jt.update({x: x0 + 300, y: jt.y}); await tick(30);
assert.equal(jt.x, x0, 'normally someone in the chase only moves on their own die');

/* ---------------------------------------------------------------- the opening */
await pursuit.offerStop(jt, ut, combat);
let stop = jt.getFlag(NS, 'policeStop');
jaz.rolls.push({outcomeKey: 'fullSuccess', total: 22, margin: 5});
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'run', userId: p1.id});
assert.equal(jt.getFlag(NS, 'policeStop').status, 'escapeChoice');
assert.ok(chat.some(m => /The officers fumble/.test(m.content ?? '')));
await jt.update({x: jt.x + 100, y: jt.y}); await tick(30);
assert.equal(jt.x, x0, 'not before choosing how to escape');
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'foot', userId: p1.id});
stop = jt.getFlag(NS, 'policeStop');
assert.equal(stop.status, 'escapeMove'); assert.equal(stop.max, 6);
assert.match(chat.at(-1).content, /Drag Jaz now/); assert.match(chat.at(-1).content, /ring on the map/);
assert.match(CS.pendingResponses(combat).join(' '), /take the escape move \(drag up to 6 sq, then Done\)/);

// Done before moving: refused for the player (it used to end the opening on the spot), so the move isn't lost.
await assert.rejects(net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'finish', userId: p1.id}), /Move first/);
assert.equal(jt.getFlag(NS, 'policeStop').status, 'escapeMove');
// The map shows how far she can get.
let reach = footReach(scene, combat);
assert.equal(reach.token.id, jt.id); assert.equal(reach.left, 6); assert.match(reach.text, /Jaz · ESCAPE · 6 sq left/);

// Drag on the map: it moves, even though it is still the police unit's die.
await jt.update({x: x0 + 300, y: jt.y}); await waitFor(() => jt.x !== x0);
assert.equal(jt.x, x0 + 300, 'the escaper moves out of turn');
assert.equal(jt.getFlag(NS, 'policeStop').moved, 3);
reach = footReach(scene, combat); assert.equal(reach.left, 3, 'the ring shrinks as the squares are used');
// A drag past the limit stops at it, and using all six ends the escape without the button.
await jt.update({x: x0 + 1000, y: jt.y}); await waitFor(() => jt.getFlag(NS, 'policeStop') === null);
assert.equal(jt.x, x0 + 600, 'six squares, no more');
assert.match(chat.at(-1).content, /ESCAPE MOVE/); assert.match(chat.at(-1).content, /legs it 6 squares/);
assert.equal(footReach(scene, combat), null, 'the escape ring goes when it is over');
// Back to the dice: she waits for her own die again.
await jt.update({x: jt.x + 100, y: jt.y}); await tick(30);
assert.equal(jt.x, x0 + 600, 'after the escape, the turn order holds again');

/* ---------------------------------------------------------------- Done after a short move; another stop open */
const femi = fakeActor({name: 'Femi', heat: 2}); femi.testUserPermission = () => true; femi.uuid = `Actor.${femi.id}`;
const ft = token(femi, {x: 5000, y: 5000});
await combat.createEmbeddedDocuments('Combatant', [{tokenId: ft.id, sceneId: scene.id, actorId: femi.id}]);
await pursuit.offerStop(ft, ut, combat);   // Femi's own card, still unanswered
assert.equal(ft.getFlag(NS, 'policeStop').status, 'choice');
await jaz.setHeat(3);   // each successful break costs the police a star
await pursuit.offerStop(jt, ut, combat); stop = jt.getFlag(NS, 'policeStop');
jaz.rolls.push({outcomeKey: 'fullSuccess', total: 22, margin: 5});
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'run', userId: p1.id});
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'foot', userId: p1.id});
const x1 = jt.x;
await jt.update({x: x1 + 200, y: jt.y}); await waitFor(() => jt.x !== x1);
assert.equal(jt.x, x1 + 200, "someone else's open police card doesn't stop the escaper (it used to)");
const fx = ft.x; await ft.update({x: fx + 100, y: ft.y}); await tick(30);
assert.equal(ft.x, fx, 'but it does hold everyone else');
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'finish', userId: p1.id});
assert.equal(jt.getFlag(NS, 'policeStop'), null, 'Done after moving ends it');
assert.match(chat.at(-1).content, /legs it 2 squares/);
// The GM can always call it, moved or not.
await jaz.setHeat(3);
await pursuit.offerStop(jt, ut, combat); stop = jt.getFlag(NS, 'policeStop');
jaz.rolls.push({outcomeKey: 'fullSuccess', total: 22, margin: 5});
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'run', userId: p1.id});
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'foot', userId: p1.id});
await net.dispatch('chase.respond', {tokenUuid: jt.uuid, responseId: stop.id, choice: 'finish', userId: gm.id});
assert.equal(jt.getFlag(NS, 'policeStop'), null, 'the GM can end it without a move');
console.log('escape move: the escaper drags out of turn, the ring shows the reach, long drags stop at the limit, Done needs a move, all squares used ends it, other cards hold everyone else — ok');
process.exit(0);
