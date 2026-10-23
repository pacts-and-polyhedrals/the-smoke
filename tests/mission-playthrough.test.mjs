// 0.5.27: every job plays through the way a crew would, following the sat nav, and passes by itself; a run saved by an
// older build carries on; four players in one car count as four; players and the GM can mark a step done by hand.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import process from 'node:process';
import {setup, play, helpers} from './mission-playthrough.mjs';

const quiet = {info: console.info, warn: console.warn, error: console.error};
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const say = (...a) => quiet.info.call(console, ...a);

// The world from the bug report: CH3 started on an older build, then frozen by 0.5.27-rc.1 at "Get some wheels 1/4"
// with "The GM must review the progress retained from the previous build" and "No clear 2 x 4 space in … Morning Ln".
const ctx = await setup({beforeInstall: async w => {
  const ids = w.pcs.slice(0, 4).map(a => a.id);
  w.settings.set('missions', {m03: {status: 'active', ticks: {wheels: 1}, actorIds: ids, startedAt: 1, runId: 'oldrun000001', automationVersion: 1,
    migrationReview: true, preflightError: 'No clear 2 x 4 space in South Hackney & Well Street / Morning Ln. Move an obstruction, then repair mission resources.',
    requirements: {wheels: 4}, contributions: {}, receipts: {}, choices: {}}});
  for (const [i, pc] of w.pcs.slice(0, 4).entries()) await w.put(pc, 'LDP-ARCHES', [700 + i * 60, 1250]);
}});
const {M, A, C, S, net, d, w} = ctx, data = await M.missionData(), ch3 = data.missions.find(m => m.id === 'm03'), crew = w.pcs.slice(0, 4);
let s = M.missionState().m03;
assert.equal(s.migrationReview, false, 'the frozen run is released on load');
assert.ok(s.recoveryLog.some(l => l.action === 'accept-legacy-progress'), 'and the release is logged');
assert.equal(s.ticks.wheels, 1, 'progress already made is kept');
assert.equal(s.preflightError, null, 'the job is set up again (room is found for the van and the car)');

// four players, one car: "Get some wheels" needs everyone aboard, and a shared car counts for everyone in it
assert.equal(A.resourcesFor(ch3, s, 'transport').length, 4, 'Pat\'s loan bikes wait at the Arches, one each');
const estate = await ctx.spawn.ensureVehicleActor('LV16'), car = await ctx.spawn.placeToken(helpers.sceneOf(ctx, 'LDP-ARCHES'), estate, 1200, 1250, {flags: {parked: true}});
await helpers.ride(ctx, crew, car); await A.sweepMission(ch3);   // but they all pile into one estate car instead
s = M.missionState().m03;
assert.ok(C.checkpointDone(ch3.objectives.find(o => o.id === 'wheels'), s), `four in one car: wheels ${s.ticks.wheels}/${C.checkpointNeeded(ch3.objectives.find(o => o.id === 'wheels'), s)}`);
// the sat nav now goes to the van, not to Pat's
const van = A.resourcesFor(ch3, s, 'targets')[0], t = S.missionTarget(d, ch3, s, null, {actor: crew[0]});
assert.equal(t.mapId, ctx.spawn.mapIdOf(van.parent), 'the sat nav heads for the van');

// marking a step done by hand (players can in Self-play; in Story mode the GM runs the missions)
w.settings.set('playMode', 'self');
const tick = (userId, objId, extra = {}) => net.dispatch('mission.tick', {id: 'm03', objId, delta: 1, userId, ...extra});
await assert.rejects(tick('user1', 'stretch', {complete: true}), /earlier steps/, 'a player can\'t skip ahead');
await tick('user1', 'catch', {complete: true});
s = M.missionState().m03;
assert.ok(C.checkpointDone(ch3.objectives.find(o => o.id === 'catch'), s), 'a player on the job can mark a ready step done');
assert.ok(s.recoveryLog.some(l => l.stepId === 'catch' && l.userId === 'user1'), 'and it is logged');
await assert.rejects(tick('user1', 'catch', {delta: -1}), /GM/, 'only the GM reopens a step');
await tick('gm', 'catch', {delta: -1});
assert.equal(M.missionState().m03.ticks.catch, 0, 'the GM can reopen it');
await tick('gm', 'stretch', {complete: true});
assert.ok(C.checkpointDone(ch3.objectives.find(o => o.id === 'stretch'), M.missionState().m03), 'the GM can mark any step done');
w.settings.set('playMode', 'story');
await net.dispatch('mission.set', {id: 'm03', status: 'done', userId: 'gm'});
assert.equal(M.missionState().m03.status, 'done', 'and the GM can pass the job');

// finish what's here first: in S04, with the dog right here at the market, the sat nav says collect it before leaving
const s04 = data.missions.find(m => m.id === 's04');
await net.dispatch('mission.start', {id: 's04', actorIds: [crew[0].id], userId: 'gm', overrideReason: 'test'});
await helpers.putCrew(ctx, [crew[0]], {mapId: 'LDV-HM1', x: 3350, y: 1050}); await helpers.rollAction(ctx, s04, 'carrier', crew[0]);
await helpers.putCrew(ctx, [crew[0]], {mapId: 'LDV-HM2', x: 2350, y: 800}); await helpers.rollAction(ctx, s04, 'trader', crew[0]);
const here = S.stepOrder(s04, M.missionState().s04, crew[0])[0];
assert.equal(here.id, 'physical-p1-collect', `at the market the next step is the dog, not ${here.id}`);
await net.dispatch('mission.set', {id: 's04', status: 'failed', userId: 'gm'});

// the corrections to the jobs' places are in the data
execFileSync(process.execPath, [new URL('../scripts/missions/fix-contracts.mjs', import.meta.url).pathname, '--check'], {stdio: 'pipe'});

// every job, played through: one, four and six players, and four players with every street crowded with parked cars
let n = 0; const problems = [];
for (const [size, crowded] of [[1, false], [4, false], [6, false], [4, true]]) {
  for (const m of data.missions) { n++; const r = await play(ctx, m, size, {crowded}); problems.push(...r.problems.map(p => `${p}${crowded ? ' (crowded)' : ''}`)); }
}
assert.deepEqual(problems, [], `every job passes by itself:\n${problems.join('\n')}`);
say(`mission play-through: ${data.missions.length} jobs × 1/4/6 players and crowded streets (${n} runs) pass from the sat nav alone; an rc.1-frozen run carries on; four in one car count; mark done and reopen work — ok`);
process.exit(0);
