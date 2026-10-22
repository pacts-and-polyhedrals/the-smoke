// 0.5.16 audit fixes outside the chase: mission state can't be passed (and paid) twice by events arriving together;
// a crew answering one roll request at once all count; remote rolls can't smuggle HTML into a GM card; the request
// queue can't be frozen by one stuck action; cable ties and toolkit repairs are checked by the leader; driven-vehicle
// actors are tidied up; the in-play token is found on the map a player is actually viewing; small UI helpers.
import assert from 'assert/strict';
import {fakeActor, chat, uid} from './fakes.mjs';
const NS = 'the-smoke';
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
const settings = new Map();
game.settings.get = (_ns, k) => settings.get(k); game.settings.set = async (_ns, k, v) => { await tick(2); settings.set(k, v); };
const gm = {id: 'gm', name: 'GM', isGM: true, active: true}, maya = {id: 'u1', name: 'Maya', isGM: false, active: true, viewedScene: null};
game.users = Object.assign([gm, maya], {activeGM: gm, get: id => [gm, maya].find(u => u.id === id), filter: f => [gm, maya].filter(f)});
game.user = gm;

/* ---------------------------------------------------------------- missions: one state, one queue */
const mission = {id: 'zz1', n: 99, group: 'opening', title: 'Two Up', giver: 'Pat', where: 'Hackney', hook: 'x', requires: [], journalKey: 'x', page: 'x',
  objectives: [{id: 'o1', text: 'Get to the Arches', auto: {on: 'map', mapId: 'LDP-ARCHES'}}],
  rewards: {cash: 50, xp: 3, rep: {}}};
globalThis.fetch = async url => ({ok: true, json: async () => String(url).includes('london-missions') ? {missions: [mission], groups: [], factions: {}} : {missions: [], groups: []}});
const jaz = fakeActor({name: 'Jaz', cash: 0}), sal = fakeActor({name: 'Sal', cash: 0});
const actors = new Map([[jaz.id, jaz], [sal.id, sal]]);
game.actors = Object.assign([jaz, sal], {get: id => actors.get(id), filter: f => [jaz, sal].filter(f), find: f => [jaz, sal].find(f), some: f => [jaz, sal].some(f)});
const M = await import('../module/world/missions.mjs');
settings.set('missions', {[mission.id]: {status: 'active', ticks: {}, actorIds: [jaz.id, sal.id], runId: 'r1'}});
// both of the crew walk into the Arches in the same moment: two events, raced
const before = chat.length;
await Promise.all([M.missionEvent({on: 'map', mapId: 'LDP-ARCHES', actorId: jaz.id}), M.missionEvent({on: 'map', mapId: 'LDP-ARCHES', actorId: sal.id})]);
assert.equal(settings.get('missions')[mission.id].status, 'done');
assert.equal(jaz.system.cash, 50, 'paid once, not twice'); assert.equal(sal.system.cash, 50);
assert.equal(chat.slice(before).filter(m => /MISSION PASSED/.test(m.content ?? '')).length, 1, 'one MISSION PASSED card');
// a write made elsewhere in the meantime is kept: the queue always starts from a fresh read
await Promise.all([M.withMissionState(st => { st.other = {status: 'active', ticks: {a: 1}}; }), M.withMissionState(st => { st.third = {status: 'failed'}; })]);
assert.ok(settings.get('missions').other && settings.get('missions').third && settings.get('missions')[mission.id].status === 'done', 'neither write lost');

/* ---------------------------------------------------------------- roll requests: a crew answering at once */
const {postRequest, recordResponse} = await import('../module/gm/requests.mjs');
let card = null;
globalThis.ChatMessage = {implementation: {create: async d => { card = {id: uid(), ...d, flags: JSON.parse(JSON.stringify(d.flags ?? {})), getFlag(ns, k) { return this.flags?.[ns]?.[k]; },
  async update(u) { await tick(3); this.content = u.content; this.flags[NS].request = JSON.parse(JSON.stringify(u[`flags.${NS}.request`])); return this; }}; chat.push(card); return card; }}, getSpeaker: () => ({})};
game.messages = {get: id => (card?.id === id ? card : null)};
await postRequest({kind: 'teamwork', title: 'Push the van', tn: 10, actorIds: [jaz.id, sal.id], responses: [{label: 'Push', stat: 'mus'}]});
await Promise.all([
  recordResponse(card, {stat: 'mus', total: 8, outcomeKey: 'costlyFailure', actorUuid: jaz.uuid, context: {kind: 'request', actorId: jaz.id}}),
  recordResponse(card, {stat: 'mus', total: 14, outcomeKey: 'strongSuccess', actorUuid: sal.uuid, context: {kind: 'request', actorId: sal.id}})]);
const req = card.flags[NS].request;
assert.ok(req.results[jaz.id] && req.results[sal.id], 'both answers recorded');
assert.equal(req.team.average, 11, 'and the teamwork average is there');
// a roll can only answer for its own character, and only with a stat the GM asked for
await postRequest({kind: 'check', title: 'Spot it', band: 'medium', actorIds: [jaz.id], responses: [{label: 'Look', stat: 'sav'}]});
await recordResponse(card, {stat: 'sav', total: 20, outcomeKey: 'exceptionalSuccess', actorUuid: sal.uuid, context: {kind: 'request', actorId: jaz.id}});
assert.deepEqual(card.flags[NS].request.results, {}, 'Sal\'s roll cannot answer for Jaz');
await recordResponse(card, {stat: 'mus', total: 20, outcomeKey: 'exceptionalSuccess', actorUuid: jaz.uuid, context: {kind: 'request', actorId: jaz.id}});
assert.deepEqual(card.flags[NS].request.results, {}, 'nor with a stat nobody asked for');

/* ---------------------------------------------------------------- remote rolls: what a client may set */
const {remoteRollOptions} = await import('../module/dice/roll.mjs');
const safe = remoteRollOptions({band: 'hard', modifier: 2, label: 'x', cardExtra: '<ul class="smoke-notes"><li>Aimed +1</li></ul>', whisper: ['u9'], consumeState: false, requestedBy: 'gm'}, 'u1');
assert.equal(safe.cardExtra, '<ul class="smoke-notes"><li>Aimed +1</li></ul>', 'the Console\'s escaped notes ride along');
assert.equal(safe.requestedBy, 'u1', 'the leader says who asked'); assert.equal(safe.whisper, undefined); assert.equal(safe.consumeState, undefined);
assert.equal(remoteRollOptions({cardExtra: '<button data-smoke-crime="x">Add Heat</button>'}, 'u1').cardExtra, undefined, 'no buttons or markup smuggled into a GM card');
assert.deepEqual(remoteRollOptions({whisper: ['gm']}, 'gm').whisper, ['gm'], 'a second GM keeps its whisper');

/* ---------------------------------------------------------------- the request queue can't be frozen */
const net = await import('../module/world/net.mjs');
net.setQueueStallMs(60);
net.registerHandler('test.hang', () => new Promise(() => {}));
net.registerHandler('test.ok', async () => 'done');
void net.dispatch('test.hang', {});
const answer = await Promise.race([net.dispatch('test.ok', {}), tick(1500).then(() => 'stuck')]);
assert.equal(answer, 'done', 'a hung action lets the next one through');
net.setQueueStallMs(45000);
const shown = []; const notes = ui.notifications; ui.notifications = {info: t => shown.push(['info', t]), warn: t => shown.push(['warn', t]), error: t => shown.push(['error', t])};
net.notify('hello', {level: 'boom'}); assert.deepEqual(shown.at(-1), ['info', 'hello'], 'an unknown level falls back to info');
ui.notifications = notes;

/* ---------------------------------------------------------------- cable ties and a toolkit, checked by the leader */
await import('../module/world/items.mjs');
const grid = {size: 100};
const sceneA = {id: 'sA', name: 'Hackney', grid, active: true, tokens: []}, sceneB = {id: 'sB', name: 'Dalston', grid, active: false, tokens: []};
sceneA.tokens.get = id => sceneA.tokens.find(t => t.id === id); sceneB.tokens.get = id => sceneB.tokens.find(t => t.id === id);
game.scenes = Object.assign([sceneA, sceneB], {get: id => [sceneA, sceneB].find(s => s.id === id)});
const tok = (scene, actor, x, y, extra = {}) => { const t = {id: uid(), name: actor.name, actor, actorId: actor.id, parent: scene, x, y, width: 1, height: 1, hidden: false, flags: {}, getFlag(ns, k) { return this.flags?.[ns]?.[k]; }, async update(u) { Object.assign(this, u); return this; }, ...extra};
  t.uuid = `Scene.${scene.id}.Token.${t.id}`; scene.tokens.push(t); return t; };
const victim = fakeActor({name: 'Mo', type: 'npc'}); actors.set(victim.id, victim);
const jt = tok(sceneA, jaz, 100, 100), vtok = tok(sceneA, victim, 200, 100);
const docs = new Map([[vtok.uuid, vtok], [victim.uuid, victim], [jt.uuid, jt]]);
const oldFrom = globalThis.fromUuid; globalThis.fromUuid = async u => docs.get(u) ?? oldFrom(u);
jaz.testUserPermission = u => u?.id === 'u1'; victim.testUserPermission = () => false;
await assert.rejects(net.dispatch('items.cuff', {actorUuid: victim.uuid, targetTokenUuid: vtok.uuid, actorId: jaz.id, userId: 'u1'}), /cable ties/, 'no ties, no cuffing');
await jaz.createEmbeddedDocuments('Item', [{name: 'Cable Ties', type: 'gear', system: {quantity: 2}}]);
await assert.rejects(net.dispatch('items.cuff', {actorUuid: victim.uuid, targetTokenUuid: vtok.uuid, actorId: jaz.id, userId: 'u1'}), /Grabbed, Down or surrendered/, 'not while they can still fight you off');
await victim.addCondition('Grabbed');
vtok.x = 900;
await assert.rejects(net.dispatch('items.cuff', {actorUuid: victim.uuid, targetTokenUuid: vtok.uuid, actorId: jaz.id, userId: 'u1'}), /right next to them/);
vtok.x = 200;
await net.dispatch('items.cuff', {actorUuid: victim.uuid, targetTokenUuid: vtok.uuid, actorId: jaz.id, userId: 'u1'});
assert.ok(victim.items.some(i => i.name === 'Cuffed'), 'tied up');
// a toolkit repair reads its own roll, once
const van = {id: uid(), name: 'Van', type: 'vehicle', system: {vehicle: {body: {value: 2, max: 12}, flats: 0}}, async update(u) { for (const [k, v] of Object.entries(u)) { const ks = k.split('.'); let o = this; for (const p of ks.slice(0, -1)) o = o[p]; o[ks.at(-1)] = v; } return this; }};
const vant = tok(sceneA, van, 150, 100, {width: 2, height: 3});
const rollMsg = (r, extra = {}) => { const m = {id: uid(), flags: {[NS]: {roll: r}}, getFlag(ns, k) { return this.flags?.[ns]?.[k]; }, async setFlag(ns, k, v) { this.flags[ns][k] = v; return this; }, ...extra}; return m; };
const good = rollMsg({stat: 'grf', actorUuid: jaz.uuid, outcomeKey: 'fullSuccess', context: {kind: 'repair', vehicleTokenId: vant.id}});
const forged = rollMsg({stat: 'grf', actorUuid: jaz.uuid, outcomeKey: 'exceptionalSuccess', context: {kind: 'theft', vehicleTokenId: vant.id}});
game.messages = {get: id => [good, forged].find(m => m.id === id) ?? null};
await assert.rejects(net.dispatch('items.repair', {sceneId: sceneA.id, vehicleTokenId: vant.id, actorId: jaz.id, outcomeKey: 'exceptionalSuccess', userId: 'u1'}), /Roll the repair first/, 'a client cannot just say it rolled well');
await assert.rejects(net.dispatch('items.repair', {sceneId: sceneA.id, vehicleTokenId: vant.id, actorId: jaz.id, messageId: forged.id, userId: 'u1'}), /does not match/);
await net.dispatch('items.repair', {sceneId: sceneA.id, vehicleTokenId: vant.id, actorId: jaz.id, messageId: good.id, userId: 'u1'});
assert.equal(van.system.vehicle.body.value, 4, 'Full Success: +2 Body');
await assert.rejects(net.dispatch('items.repair', {sceneId: sceneA.id, vehicleTokenId: vant.id, actorId: jaz.id, messageId: good.id, userId: 'u1'}), /already been used/, 'once');

/* ---------------------------------------------------------------- the token in play */
const {actorToken} = await import('../module/world/spawn.mjs');
const stale = tok(sceneB, sal, 0, 0); sal.testUserPermission = u => u?.id === 'u1';
const live = tok(sceneA, sal, 500, 500);
globalThis.canvas = {scene: sceneB};
maya.viewedScene = sceneA.id;
assert.equal(actorToken(sal), live, 'the map the owner is looking at, not the stale token on the GM\'s map');
maya.viewedScene = null;
assert.equal(actorToken(sal), stale, 'otherwise the map the GM is looking at');
assert.equal(actorToken({id: 'x', token: vtok}), vtok, 'an unlinked actor is its token');

/* ---------------------------------------------------------------- driven-vehicle actors are tidied up */
const {removeOrphanDedicatedActor} = await import('../module/vehicles/vehicle-boarding.mjs');
const mkDedicated = () => { const a = {id: uid(), name: 'Nicked Golf', deleted: false, flags: {[NS]: {dedicatedFor: 't1'}}, getFlag(ns, k) { return this.flags?.[ns]?.[k]; }, async delete() { this.deleted = true; actors.delete(this.id); }}; actors.set(a.id, a); return a; };
const used = mkDedicated(); tok(sceneB, used, 0, 0);
assert.equal(await removeOrphanDedicatedActor(used.id), false, 'still on a map: kept');
const folded = mkDedicated(); jaz.flags[NS] = {...(jaz.flags[NS] || {}), foldedVehicles: [{name: 'Scooter', data: {actorId: folded.id}}]};
game.actors = Object.assign([jaz, sal, folded], {get: id => actors.get(id), filter: f => [...actors.values()].filter(f), find: f => [...actors.values()].find(f), some: f => [...actors.values()].some(f)});
assert.equal(await removeOrphanDedicatedActor(folded.id), false, 'folded up and carried: kept');
const gone = mkDedicated();
assert.equal(await removeOrphanDedicatedActor(gone.id), true); assert.equal(gone.deleted, true, 'no token anywhere: deleted');
assert.equal(await removeOrphanDedicatedActor(jaz.id), false, 'never a character');

/* ---------------------------------------------------------------- small helpers */
const {lockedForUser, GM_LOCKED_FIELDS} = await import('../module/apps/sheets.mjs');
settings.set('lockPlayerSheets', false); game.user = maya;
assert.equal(lockedForUser('system.cash'), false, 'off by default: as Foundry normally allows');
settings.set('lockPlayerSheets', true);
assert.equal(lockedForUser('system.cash'), true); assert.equal(lockedForUser('system.stats.whl.die'), true); assert.equal(lockedForUser('system.identity.look'), false, 'the story fields stay theirs');
assert.equal(lockedForUser('system.cash', gm), false, 'never the GM'); assert.ok(GM_LOCKED_FIELDS.includes('system.rep.xp'));
game.user = gm;
const {airTimeLabel} = await import('../module/radio/studio.mjs');
settings.set('clockStart', '2026-10-12T09:00');
assert.equal(airTimeLabel(3600 * 13 + 60 * 5), 'Mon 22:05', 'Banana Watch time, not raw world seconds');
const {chaseRelevantFlags} = await import('../module/world/chase.mjs');
assert.equal(chaseRelevantFlags({[`flags.${NS}.traffic.s`]: 120, [`flags.${NS}.travel`]: {}}), false, 'Street Life ticking is not chase news');
assert.equal(chaseRelevantFlags({flags: {[NS]: {prompts: {}}}}), true); assert.equal(chaseRelevantFlags({[`flags.${NS}.drive`]: {}}), true);
console.log('audit (world): missions paid once, crew answers all count, no HTML in remote rolls, unfreezable queue, checked cuffs and repairs, the token in play, tidy driven actors, sheet lock, studio time — ok');
process.exit(0);
