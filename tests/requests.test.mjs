// GM Screen roll requests: post → players answer → the card fills in; hazards apply harm; teamwork averages.
import assert from 'assert';
import {fakeActor, conditionNames, chat} from './fakes.mjs';
const NS = 'the-smoke';
const jaz = fakeActor({name: 'Jaz', cash: 200, items: ['Stab Vest']}), sal = fakeActor({name: 'Sal', cash: 100});
jaz.system.armour = 2;
const actors = new Map([[jaz.id, jaz], [sal.id, sal]]);
game.actors = Object.assign([jaz, sal], {get: id => actors.get(id)});
game.users = Object.assign([{id: 'gm', isGM: true, active: true}], {activeGM: {id: 'gm'}});
let posted = null;
globalThis.ChatMessage = {implementation: {create: async d => { posted = {id: 'm1', ...d, getFlag: (ns, k) => d.flags?.[ns]?.[k], async update(u) { this.content = u.content; this.flags[NS].request = u[`flags.${NS}.request`]; }}; return posted; }}, getSpeaker: () => ({})};

const {postRequest, recordResponse, hazardFor, describeConsequence, renderRequest} = await import('../module/gm/requests.mjs');
const {quickSpec, hazardSpec, teamSpec, makeNPC, npcLine} = await import('../module/gm/automation.mjs');
const {QUICK_CHECKS, HAZARDS, STREET_EVENTS, TEAMWORK} = await import('../module/gm/catalogue.mjs');

// Catalogue sanity: every response names a real stat; every street automation is runnable.
const STATS = ['mus', 'grt', 'mov', 'whl', 'aim', 'grf', 'sav', 'frt', 'btl'];
for (const q of [...QUICK_CHECKS, ...HAZARDS, ...TEAMWORK]) for (const r of q.responses) assert.ok(STATS.includes(r.stat), `${q.name}: ${r.stat}`);
for (const e of STREET_EVENTS) if (e.auto?.startsWith('quick:')) assert.ok(QUICK_CHECKS.some(q => q.id === e.auto.slice(6)), e.auto); else if (e.auto?.startsWith('hazard:')) assert.ok(HAZARDS.some(h => h.id === e.auto.slice(7)), e.auto);
assert.equal(STREET_EVENTS.length, 20, 'a d20 table');
assert.ok(QUICK_CHECKS.length >= 30 && HAZARDS.length >= 15, `${QUICK_CHECKS.length} checks, ${HAZARDS.length} hazards`);

// Hazard outcome mapping.
const car = HAZARDS.find(h => h.id === 'hit-by-car');
assert.equal(hazardFor(car, 'fullSuccess'), null);
assert.equal(hazardFor(car, 'costlyFailure'), car.costly);
assert.equal(hazardFor(car, 'severeFailure'), car.severe);
assert.match(describeConsequence(car.costly), /6 damage · Prone, Hurt/);

// A hazard posted to both: armour helps against glass.
await postRequest(hazardSpec('glass', {actorIds: [jaz.id, sal.id]}));
assert.match(posted.content, /data-smoke-respond=/); assert.equal(posted.flags[NS].request.kind, 'hazard');
const req = posted.flags[NS].request;
await recordResponse(posted, {stat: 'mov', total: 6, tn: 10, margin: -4, outcomeKey: 'severeFailure', outcome: 'Proper Mess', success: false, context: {kind: 'request', actorId: jaz.id, messageId: 'm1', requestId: req.id}});
assert.equal(jaz.system.resources.health.value, 10 - (5 - 2), 'glass severe: 5 damage less 2 armour');
assert.deepEqual(conditionNames(jaz), ['Bleeding', 'In Pain']);
await recordResponse(posted, {stat: 'grt', total: 12, tn: 10, margin: 2, outcomeKey: 'fullSuccess', outcome: 'Sorted', success: true, context: {kind: 'request', actorId: sal.id}});
assert.equal(sal.system.resources.health.value, 10, 'Sal dodges it');
assert.match(posted.content, /Proper Mess/); assert.match(posted.content, /Sorted/);
assert.doesNotMatch(posted.content, /data-smoke-respond=/, 'no buttons left once everyone has rolled');
await recordResponse(posted, {stat: 'grt', total: 2, outcomeKey: 'severeFailure', context: {kind: 'request', actorId: sal.id}});
assert.equal(sal.system.resources.health.value, 10, 'a second answer is ignored');

// Pickpocket-style cash loss and Heat.
await postRequest({kind: 'hazard', title: 'Dipped', band: 'medium', actorIds: [sal.id], responses: [{label: 'x', stat: 'sav'}], hazard: {costly: {cashPct: 10, heat: 1}}});
await recordResponse(posted, {stat: 'sav', total: 7, tn: 9, outcomeKey: 'costlyFailure', context: {kind: 'request', actorId: sal.id}});
assert.equal(sal.system.cash, 90, 'lost 10%'); assert.equal(sal.system.heat.value, 1, '+1 Heat');
// 0.5.22: a mishap's Heat stops at two stars (only crimes go higher) and never lowers it.
const {applyConsequence} = await import('../module/gm/requests.mjs');
await applyConsequence(sal, {heat: 2}, {reason: 'Recognised'}); assert.equal(sal.system.heat.value, 2, 'severe recognition: 2★, not 3');
await applyConsequence(sal, {heat: 2}, {reason: 'Recognised'}); assert.equal(sal.system.heat.value, 2, 'and again: still 2★');
sal.system.heat.value = 4; await applyConsequence(sal, {heat: 1}, {reason: 'Tip-off'}); assert.equal(sal.system.heat.value, 4, 'never lowers Heat'); sal.system.heat.value = 1;

// Teamwork: the card shows the average once both have rolled.
await postRequest(teamSpec('push-van', {actorIds: [jaz.id, sal.id], tn: 10}));
await recordResponse(posted, {stat: 'mus', total: 7, outcomeKey: 'costlyFailure', context: {kind: 'request', actorId: jaz.id}});
assert.equal(posted.flags[NS].request.team, null, 'no average yet');
await recordResponse(posted, {stat: 'mus', total: 15, outcomeKey: 'strongSuccess', context: {kind: 'request', actorId: sal.id}});
assert.equal(posted.flags[NS].request.team.average, 11); assert.equal(posted.flags[NS].request.team.success, true);
assert.match(posted.content, /Team average 11 vs 10/);

// Quick checks keep the GM's band override; the guide is GM-only.
const spec = quickSpec('lose-police', {band: 'easy', actorIds: [jaz.id]});
assert.equal(spec.band, 'easy');
await postRequest(spec); assert.match(posted.content, /class="gm smoke-dim"/);
await assert.rejects(() => postRequest({...spec, actorIds: []}), /Choose who/);

// Made-up NPCs.
const npc = makeNPC('bouncer'); assert.match(npc.name, /^\S+ \S+/); assert.equal(npc.stats.mus.die, 10); assert.match(npcLine(npc), /MUS d10/);
console.log('requests: hazards apply harm after armour, cash and Heat; teamwork averages; one answer each — ok');
process.exit(0);
