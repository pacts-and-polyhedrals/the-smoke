// 0.5.25: the chase and driving switches are back where 0.5.1 had them (Street Control and the Blower), through one
// leader handler. The GM can always change them; in Self-play a player with a character can too; in Story mode a
// player can't. Switching turn-based chases off sends chases the police started by sight back to real time and
// leaves chases started by hand. "Yellow / red checks roll themselves" (0.5.1's driveAutoRoll) rolls the driver's
// Wheels at once when switched on, and leaves a card in chat when off (the default).
import assert from 'assert/strict';
import process from 'node:process';
import {NS, scene, settings, gm, p1, jaz, vt, jt, combats} from './chase-harness.mjs';
import * as chase from '../module/world/chase.mjs';
import * as inc from '../module/world/incidents.mjs';
import {canSetChases} from '../module/world/chase-state.mjs';
import {dispatch} from '../module/world/net.mjs';
inc.installIncidents();
game.actors = Object.assign([jaz], {get: id => [jaz].find(a => a.id === id), some: f => [jaz].some(f), find: f => [jaz].find(f), filter: f => [jaz].filter(f)});
jaz.type = 'character'; jaz.testUserPermission = u => u?.isGM || u?.id === 'p1';
// the defaults: chases on, evasive rolls itself, yellow / red asks (as 0.5.24 behaved)
const defaults = {}; const reg = game.settings.register;
game.settings.register = (_ns, k, o) => { defaults[k] = o.default; }; chase.registerChaseSettings(); game.settings.register = reg;
assert.equal(defaults.autoDriveChecks, false); assert.equal(defaults.autoChase, true); assert.equal(defaults.autoEvade, true);
Object.assign(settings, {autoDriveChecks: false, chaseMode: 'full', chaseTrafficMode: 'shared', playMode: 'story'});

// who may switch
assert.equal(canSetChases(gm), true); assert.equal(canSetChases(p1), false, 'Story mode: not a player');
await assert.rejects(dispatch('chase.settings', {change: {autoChase: false}, userId: p1.id}), /Story mode/);
settings.playMode = 'self'; assert.equal(canSetChases(p1), true, 'Self-play: a player with a character');
await dispatch('chase.settings', {change: {chaseMode: 'assisted'}, userId: p1.id}); assert.equal(settings.chaseMode, 'assisted');
settings.playMode = 'story';
await assert.rejects(dispatch('chase.settings', {change: {chaseMode: 'turbo'}, userId: gm.id}), /Full Auto/);
await assert.rejects(dispatch('chase.settings', {change: {secret: 1}, userId: gm.id}), /Unknown/);
await assert.rejects(dispatch('chase.settings', {change: {autoEvade: 'yes'}, userId: gm.id}), /on or off/);
assert.equal(await dispatch('chase.settings', {change: {chaseMode: 'assisted'}, userId: gm.id}), null, 'no change, no card');
assert.match(chase.chaseSettingsSummary().lines.join(' '), /Assisted/);

// turning chases off: a sighting chase ends, a hand-started one stays
settings.chaseMode = 'manual';
await dispatch('chase.start', {sceneId: scene.id, targetId: jt.id, started: 'sight', userId: gm.id});
let c = [...combats.values()].find(x => x.getFlag(NS, 'chase')); assert.equal(c.getFlag(NS, 'chase').started, 'sight');
await dispatch('chase.settings', {change: {autoChase: false}, userId: gm.id});
assert.equal(settings.autoChase, false); assert.ok(![...combats.values()].some(x => x.getFlag(NS, 'chase')), 'the sighting chase went back to real time');
await dispatch('chase.start', {sceneId: scene.id, targetId: jt.id, userId: gm.id});
c = [...combats.values()].find(x => x.getFlag(NS, 'chase')); assert.equal(c.getFlag(NS, 'chase').started, 'manual');
await dispatch('chase.settings', {change: {autoChase: true}, userId: gm.id}); await dispatch('chase.settings', {change: {autoChase: false}, userId: gm.id});
assert.ok([...combats.values()].some(x => x.getFlag(NS, 'chase')), 'a chase started by hand stays');
await chase.endChase(c, {why: 'test'}); settings.autoChase = true;
// a player asking for a sighting chase only ever gets a hand-started one
settings.playMode = 'self'; jaz.system.heat.value = 2;
await dispatch('chase.start', {sceneId: scene.id, targetId: jt.id, started: 'sight', userId: p1.id});
c = [...combats.values()].find(x => x.getFlag(NS, 'chase')); assert.equal(c.getFlag(NS, 'chase').started, 'manual'); await chase.endChase(c, {why: 'test'});
settings.playMode = 'story';

// yellow / red checks: a card by default, rolled at once when switched on
const before = jaz.rolled.length;
await inc.promptCheck(vt, {kind: 'driveCheck', band: 'yellow'});
assert.equal(jaz.rolled.length, before, 'off: no roll yet'); assert.equal(inc.openPrompts(vt).length, 1, 'off: a card waits in chat');
for (const p of inc.openPrompts(vt)) await vt.update({[`flags.${NS}.prompts.-=${p.pid}`]: null}, {acVehicleCarry: true});
await dispatch('chase.settings', {change: {autoDriveChecks: true}, userId: gm.id});
jaz.rolls.push({outcomeKey: 'fullSuccess', total: 20, margin: 6});
await inc.promptCheck(vt, {kind: 'driveCheck', band: 'red'});
assert.equal(jaz.rolled.length, before + 1, 'on: Wheels rolled for the driver'); assert.equal(jaz.rolled.at(-1).stat, 'whl');
assert.equal(inc.openPrompts(vt).length, 0, 'on: resolved, nothing waiting');
jaz.rolls.push({outcomeKey: 'fullSuccess', total: 20, margin: 6});
await inc.promptCheck(vt, {kind: 'pitSave', band: 'red', difficulty: 'hard'});
assert.equal(jaz.rolled.length, before + 2, 'PIT saves roll too');
console.log('chase settings: GM and Self-play players switch them (Story-mode players can\'t), bad values refused, sighting chases end when switched off (hand-started stay), yellow/red and PIT checks roll themselves when on — ok');
process.exit(0);
