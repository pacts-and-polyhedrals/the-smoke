// 0.5.19: when the stars go up during a fight or a chase, the new police go on its combat tracker and act on their own
// speed dice — dealt in at once while dice are being rolled, otherwise from the next round — instead of driving in and
// piling on between turns. In an ordinary fight a police car drives in on its dice, then its officers get out.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {NS, scene, token, vehicle, makeCombat, gm, p1, settings, jaz, jt, ut, vt, chat} from './chase-harness.mjs';
import {fakeActor} from './fakes.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const net = await import('../module/world/net.mjs');
const C = await import('../module/combat/combat.mjs');
const chase = await import('../module/world/chase.mjs');
const heat = await import('../module/world/heat.mjs');
const {outLabel} = await import('../module/apps/combat-console.mjs');
// Officers come from the catalogue: serve the data files and let the scene create tokens.
globalThis.fetch = async url => { const f = path.join(root, 'data', path.basename(String(url))); return fs.existsSync(f) ? {ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8'))} : {ok: false}; };
const officerActor = fakeActor({name: 'PC', type: 'npc', stats: {mov: 6}}); officerActor.system.role = 'police';
officerActor.flags[NS] = {npcKey: 'pc', streetLife: true};
officerActor.getTokenDocument = async () => ({toObject: () => ({name: 'PC', width: 1, height: 1, flags: {}})});
game.actors = Object.assign([jaz, officerActor], {get: id => [jaz, officerActor].find(a => a.id === id), find: f => [jaz, officerActor].find(f), filter: f => [jaz, officerActor].filter(f), some: f => [jaz, officerActor].some(f)});
scene.createEmbeddedDocuments = async (_type, list) => list.map(d => token(officerActor, {x: d.x, y: d.y, flags: d.flags?.[NS] ?? {}, name: d.name}));
jaz.testUserPermission = u => u?.isGM || u?.id === 'p1';
settings.playMode = 'story';
const combatantOf = (combat, t) => combat.combatants.find(c => c.tokenId === t.id);

/* ---------------------------------------------------------------- an ordinary fight on foot */
await jt.setFlag(NS, 'vehicleSeat', null); await vt.setFlag(NS, 'vehicleOccupants', []);
await jt.update({x: 3000, y: 3000}, {smokeFootMove: true});
const thug = fakeActor({name: 'Gang Lad', type: 'npc', stats: {mov: 6}}); const gt = token(thug, {x: 3100, y: 3000});
const fight = makeCombat();
await fight.createEmbeddedDocuments('Combatant', [{tokenId: jt.id, sceneId: scene.id, actorId: jaz.id}, {tokenId: gt.id, sceneId: scene.id, actorId: thug.id}]);
assert.ok(heat.huntingUnits(scene).every(u => u.id !== ut.id), 'with a fight on, the unit hunting Jaz no longer drives in between turns');
await net.dispatch('combat.begin', {combatId: fight.id, userId: gm.id});
assert.ok(combatantOf(fight, ut), 'the unit already hunting her joins the fight when the round begins');
assert.ok(combatantOf(fight, ut).flags[NS].speed.count > 0, 'and is dealt its speed dice for this round');
assert.ok(chat.some(m => /More police join the fight/.test(m.content ?? '')));

// Mid-round the stars go up and more units are dispatched (what respond() places on the map).
await fight.update({[`flags.${NS}.state`]: {phase: 'resolve', round: 1, cursor: 0, queue: [{cid: combatantOf(fight, jt).id, name: 'Jaz', value: 5, die: 0}]}});
await jaz.setHeat(3);
const car2 = token(vehicle('Area Car 2', {perfDie: 10}), {x: 7000, y: 3000, w: 2, h: 3, flags: {police: {unit: 'car', hunting: jaz.id}}});
const heli = token(vehicle('India 99', {perfDie: 12}), {x: 3600, y: 2400, w: 2, h: 2, flags: {police: {unit: 'heli', hunting: jaz.id}}});
const line = await heat.enlistDispatched(scene, jt);
assert.match(line, /1 joins the fight on the combat tracker<\/b> and roll speed dice from the next round/);
assert.ok(combatantOf(fight, car2), 'the new car is on the combat tracker straight away');
assert.equal(outLabel(combatantOf(fight, car2)).outLabel, 'NEXT ROUND', 'shown as joining next round (the dice are already revealed)');
assert.ok(!combatantOf(fight, heli), 'the helicopter is not a combatant');
const roaming = heat.huntingUnits(scene).map(u => u.id);
assert.ok(!roaming.includes(car2.id) && !roaming.includes(heli.id), 'nothing hunting Jaz moves in real time while the fight is on');
assert.equal(await heat.enlistDispatched(scene, jt), '', 'nobody is added twice');

// Next round: everyone, the new car included, gets fresh dice.
await fight.update({[`flags.${NS}.state`]: {phase: 'idle', round: 1, cursor: 0, queue: []}});
await net.dispatch('combat.begin', {combatId: fight.id, userId: gm.id});
assert.ok(combatantOf(fight, car2).flags[NS].speed.count > 0);

// The car's go in a fight: drive in on its dice; once close, the officers get out and join the fight.
const before = Math.hypot(car2.x - jt.x, car2.y - jt.y);
await C.policeTurn(car2);
const after = Math.hypot(car2.x - jt.x, car2.y - jt.y);
assert.ok(after < before, `the car drives in on its own go (${Math.round(before / 100)} → ${Math.round(after / 100)} squares)`);
await car2.update({x: 3300, y: 3200}, {acVehicleCarry: true});
await C.policeTurn(car2);
const officers = fight.combatants.filter(c => c.token?.getFlag(NS, 'police')?.unit === 'officer');
assert.equal(officers.length, 2, 'close in: two officers get out and join the fight');
assert.ok(!combatantOf(fight, car2), 'the car parks up and leaves the tracker');
assert.equal(car2.getFlag(NS, 'police').parked, true);
assert.ok(chat.some(m => /officers out/.test(m.content ?? '')));
await fight.delete();

/* ---------------------------------------------------------------- a chase: dispatched units join while dice are rolled */
await jaz.setHeat(2);
const run = await chase.startChaseNow(scene, {targetId: jt.id});
assert.ok(run && run.getFlag(NS, 'chase'));
await run.update({[`flags.${NS}.state`]: {phase: 'intent', round: 1, queue: [], cursor: 0}});
const car3 = token(vehicle('Area Car 3', {perfDie: 10}), {x: 9000, y: 9000, w: 2, h: 3, flags: {police: {unit: 'car', hunting: jaz.id}}});
assert.ok(!heat.huntingUnits(scene).some(u => u.id === car3.id), 'during a chase a new unit after Jaz does not drive in real time');
assert.match(await heat.enlistDispatched(scene, jt), /joins the chase on the combat tracker<\/b> and roll speed dice this round/);
const c3 = combatantOf(run, car3);
assert.ok(c3, 'a long way off, it is still on the tracker');
await C.dealIn(c3);   // the createCombatant hook does this in Foundry
assert.ok(c3.flags[NS].speed.count > 0 && !c3.flags[NS].speed.rolled, 'dealt in this round: dice to roll');
// A unit after somebody else, outside the chase, carries on in real time and stays off the tracker.
const other = token(vehicle('Area Car 4', {perfDie: 10}), {x: 15000, y: 15000, w: 2, h: 3, flags: {police: {unit: 'car', hunting: 'not-in-this-chase'}}});
assert.ok(heat.huntingUnits(scene).some(u => u.id === other.id));
await chase.joinReinforcements(run);
assert.ok(!combatantOf(run, other));
console.log('police reinforcements: units hunting someone in a fight or chase go on its tracker (now or next round), never drive in between turns, drive in and get out on their own go — ok');
process.exit(0);
