// 0.5's other pieces on fake documents: the crew bar (who's on it, what the hover says), the drug screen effects (which
// look is on, the comedown after), redosing on a comedown, the Banana Watch's clock, story mode vs self-play on the
// Mission Board, and moving old characters onto the 33-level Rep ladder.
import assert from 'assert/strict';
import {fakeActor, itemNamed, chat} from './fakes.mjs';
const NS = 'the-smoke';
const settings = {playMode: 'story', clockMode: 'game', clockStart: '2026-10-12T09:00', clockRate: 1, clockAdvance: true, crewBar: true, crewBarPlayers: true, drugFX: 'full'};
game.settings.get = (_ns, k) => settings[k]; game.settings.set = async (_ns, k, v) => { settings[k] = v; };
const gm = {id: 'gm', name: 'GM', isGM: true, active: true}, maya = {id: 'u1', name: 'Maya', isGM: false, active: true, color: {css: '#ff5a6e'}}, raj = {id: 'u2', name: 'Raj', isGM: false, active: false};
game.users = Object.assign([gm, maya, raj], {activeGM: gm, get: id => [gm, maya, raj].find(u => u.id === id), filter: f => [gm, maya, raj].filter(f)});
game.user = gm; game.paused = false; game.time = {worldTime: 0}; globalThis.canvas = {scene: null};

/* ---------------------------------------------------------------- the crew bar */
const jaz = fakeActor({name: 'Jaz Kaur', heat: 2, cash: 1240}), sal = fakeActor({name: 'Big Sal'}), npc = fakeActor({name: 'Mo', type: 'npc'});
jaz.hasPlayerOwner = true; sal.hasPlayerOwner = true; jaz.testUserPermission = u => u?.id === 'u1'; sal.testUserPermission = u => u?.id === 'u2';
maya.character = jaz;
game.actors = Object.assign([jaz, sal, npc], {get: id => [jaz, sal, npc].find(a => a.id === id), filter: f => [jaz, sal, npc].filter(f), find: f => [jaz, sal, npc].find(f), some: f => [jaz, sal, npc].some(f)});
const scene = {id: 's1', name: 'Hackney Central', active: true, getFlag: () => null, tokens: []};
const t = {id: 't1', actorId: jaz.id, actorLink: true, actor: jaz, parent: scene, hidden: false, x: 0, y: 0, width: 1, height: 1, getFlag: () => null};
scene.tokens.push(t); game.scenes = [scene];
const CB = await import('../module/apps/crew-bar.mjs');
const crew = CB.crewList();
assert.deepEqual(crew.map(c => c.actor.name), ['Jaz Kaur', 'Big Sal'], 'every player character, the assigned ones first; never the NPCs');
assert.equal(crew[0].user.id, 'u1'); assert.equal(crew[1].user.id, 'u2', 'a character a player owns finds its player');
assert.equal(CB.tokenOfPC(jaz, maya), t);
await jaz.addCondition('Bruised');
const info = CB.crewInfo(jaz, maya);
assert.equal(info.where, 'Hackney Central'); assert.equal(info.heat, 2); assert.equal(info.cash, 1240); assert.equal(info.player, 'Maya'); assert.equal(info.online, true);
assert.equal(info.rep, 1); assert.equal(info.title, 'Nobody'); assert.deepEqual(info.conditions, ['Bruised']); assert.equal(info.vehicle, null);
assert.equal(CB.crewInfo(sal, raj).where, 'Not on a map'); assert.equal(CB.crewInfo(sal, raj).online, false);

/* ---------------------------------------------------------------- high, the comedown, and the screen */
const FX = await import('../module/apps/drug-fx.mjs');
const {takeDrug, tickTimedConditions} = await import('../module/world/items.mjs');
game.user = maya;
assert.equal(FX.myCharacter(), jaz, 'the player sees their own character\'s head');
assert.equal(FX.activeFx(jaz), null, 'sober');
const charlie = fakeActor({name: 'x', items: ['Charlie']}).items[0]; charlie.parent = jaz; charlie.system.quantity = 3; jaz._items.set(charlie.id, charlie);
await takeDrug(jaz, charlie);
let fx = FX.activeFx(jaz); assert.equal(fx.name, 'Wired'); assert.equal(fx.kind, 'high'); assert.equal(fx.cls, 'wired'); assert.ok(fx.minutes >= 29 && fx.minutes <= 30);
assert.equal(itemNamed(jaz, 'Wired').getFlag(NS, 'then'), 'Crashing', 'the comedown is queued');
// the high wears off: the comedown is added on its own
game.time.worldTime = 31 * 60;
await tickTimedConditions(undefined, [jaz]);
assert.ok(!itemNamed(jaz, 'Wired') && itemNamed(jaz, 'Crashing'), 'Crashing, automatically');
fx = FX.activeFx(jaz); assert.equal(fx.kind, 'comedown'); assert.equal(fx.cls, 'crashing');
// another line on the comedown: the comedown lifts and the high starts again
await takeDrug(jaz, charlie);
assert.ok(itemNamed(jaz, 'Wired') && !itemNamed(jaz, 'Crashing'), 'chasing it');
assert.ok(chat.at(-1).content.includes('Chasing it'));
// every drug's high and comedown has a look, and every look is a real condition
const LIB = JSON.parse((await import('fs')).readFileSync(new URL('../data/london-items.json', import.meta.url), 'utf8')).items;
const {CONDITION_LIBRARY} = await import('../module/rules/conditions.mjs');
for (const d of LIB.filter(i => i.type === 'drug')) for (const c of [d.system.high, d.system.comedown].filter(Boolean)) {
  assert.ok(FX.DRUG_FX[c], `${d.name}: ${c} has a screen effect`);
  assert.ok(CONDITION_LIBRARY.some(x => x.name === c), `${d.name}: ${c} is a real condition`);
}
for (const k of Object.keys(FX.DRUG_FX)) assert.ok(CONDITION_LIBRARY.some(x => x.name === k), `${k} is a condition`);
assert.equal(FX.activeFx(fakeActor({name: 'y'})), null);
game.user = gm; assert.equal(FX.myCharacter(), null, 'the GM sees nothing (unless they preview)');

/* ---------------------------------------------------------------- the Banana Watch */
const W = await import('../module/apps/banana-watch.mjs');
game.time = {worldTime: 0};
let c = W.clockNow(); assert.deepEqual([c.day, c.date, c.month, c.year, c.hours, c.minutes], ['MONDAY', 12, 'OCT', 2026, 9, 0], 'world time zero: the start');
game.time.worldTime = 4 * 86400 + 12.5 * 3600;   // four days, twelve and a half hours on
c = W.clockNow(); assert.deepEqual([c.day, c.date, c.hours, c.minutes, c.night], ['FRIDAY', 16, 21, 30, true]);
assert.equal(W.clockText(c), 'FRI 16 OCT · 21:30');
settings.clockStart = '2026-12-31T23:59'; game.time.worldTime = 120; c = W.clockNow(); assert.deepEqual([c.day, c.date, c.month, c.year], ['FRIDAY', 1, 'JAN', 2027], 'into the new year');
settings.clockMode = 'real'; c = W.clockNow(Date.parse('2026-07-01T11:15:00Z')); assert.equal(c.hours, 12, 'real London time: BST in summer'); assert.equal(c.real, true);
assert.match(W.BANANA_SVG, /<svg[^>]*banana-logo/); assert.match(W.BANANA_SVG, /mask/, 'with a bite out of it');

/* ---------------------------------------------------------------- story mode and self-play */
const M = await import('../module/world/missions.mjs');
assert.equal(M.playMode(), 'story');
assert.equal(M.canRunMissions(gm), true); assert.equal(M.canRunMissions(maya), false, 'story mode: the GM runs the missions');
assert.equal(M.visibleToPlayers('available'), false); assert.equal(M.visibleToPlayers('locked'), false); assert.equal(M.visibleToPlayers('active'), true); assert.equal(M.visibleToPlayers('done'), true);
settings.playMode = 'self';
assert.equal(M.canRunMissions(maya), true, 'self-play: a player with a character runs them');
assert.equal(M.canRunMissions({id: 'u9', isGM: false}), false, 'not without a character');
assert.equal(M.visibleToPlayers('available'), true);
const net = await import('../module/world/net.mjs');
game.settings.set = async (_ns, k, v) => { settings[k] = v; };
const data = await M.missionData();
const first = data.missions.find(m => m.id === 'm01'), later = data.missions.find(m => m.id === 'm12');
// Maya asks the leader (the GM's client) to start missions
await assert.rejects(net.dispatch('mission.start', {id: later.id, actorIds: [jaz.id], userId: 'u1'}), /Not open yet/, 'self-play still respects the locks');
settings.missions = {}; game.settings.get = (_ns, k) => settings[k];
await net.dispatch('mission.start', {id: first.id, actorIds: [jaz.id], userId: 'u1'});
assert.equal(settings.missions[first.id]?.status, 'active', 'self-play: Maya starts Mission 1 herself');
await net.dispatch('mission.tick', {id: first.id, objId: first.objectives[0].id, userId: 'u1'});
assert.equal(settings.missions[first.id].ticks[first.objectives[0].id], 1, 'and ticks it off');
settings.playMode = 'story';
await assert.rejects(net.dispatch('mission.start', {id: first.id, actorIds: [jaz.id], userId: 'u1'}), /Story mode/);
await assert.rejects(net.dispatch('mission.tick', {id: first.id, objId: first.objectives[1].id, userId: 'u1'}), /Story mode/);

/* ---------------------------------------------------------------- old characters onto the new ladder */
const {migrateRep} = await import('../module/content.mjs');
const legend = fakeActor({name: 'Old Legend', stage: 5, xp: 72}), runner = fakeActor({name: 'Old Runner', stage: 2, xp: 11}), fresh = fakeActor({name: 'Fresh', stage: 1, xp: 0});
assert.equal(await migrateRep([legend, runner, fresh, npc]), 3);
assert.equal(legend.system.stage, 14); assert.ok(legend.system.rep.xp >= 255, 'with the XP to match');
assert.equal(runner.system.stage, 3); assert.equal(runner.system.rep.xp, 13);
assert.equal(fresh.system.stage, 1); assert.equal(fresh.system.rep.xp, 0);
assert.equal(await migrateRep([legend, runner, fresh]), 0, 'once only');
console.log('0.5 extras: crew bar, drug effects and comedowns, redosing, the Banana Watch, story mode and self-play, Rep migration — ok');
process.exit(0);
