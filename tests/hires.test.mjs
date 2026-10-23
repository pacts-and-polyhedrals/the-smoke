// 0.5.25: the Rep 13 unlock "your own crew, hire NPCs to work for you" — listed on every sheet since 0.2.0 and never
// built — now works: one hand for each stat, slots by Rep, the fee paid up front, an NPC the employer's player owns,
// and dismissal. Also the "known to police" unlock (0.2.0's label promised it; nothing did it).
import assert from 'node:assert/strict';
import process from 'node:process';
import './runtime-stub.mjs';
import {setPath} from './fakes.mjs';
import {STAT_KEYS} from '../module/config.mjs';
import * as H from '../module/rules/hires-core.mjs';
import {UNLOCKS} from '../module/rules/advancement.mjs';
console.warn = () => {};

// one hand per stat, each with that stat as its d8 and a legal spread
assert.deepEqual(H.HIRE_TYPES.map(t => t.stat).sort(), [...STAT_KEYS].sort(), 'a hand for every stat');
for (const t of H.HIRE_TYPES) {
  const dice = Object.values(t.stats); assert.equal(t.stats[t.stat], 8, `${t.key}: d8 in its stat`);
  assert.equal(dice.filter(d => d === 8).length, 1); assert.equal(dice.filter(d => d === 6).length, 2); assert.equal(dice.length, 9);
  assert.ok(t.fee >= 200 && t.kit.includes('Fists') && t.preset, t.key);
}
assert.deepEqual([12, 13, 19, 20, 27, 33].map(H.hireSlots), [0, 2, 2, 3, 4, 4]);
const sys = (stage, cash) => ({stage, cash});
assert.match(H.hireProblem(sys(12, 9999), H.hireType('muscle')), /Rep 13/);
assert.match(H.hireProblem(sys(13, 10), H.hireType('shooter')), /£600/);
assert.match(H.hireProblem(sys(13, 9999), H.hireType('runner'), 2), /keep 2/);
assert.equal(H.hireProblem(sys(20, 9999), H.hireType('runner'), 2), '');
const names = new Set(); for (let i = 0; i < 40; i++) names.add(H.hireName(Math.random, [...names])); assert.equal(names.size, 40, 'names do not repeat');
const data = H.hireActorData(H.hireType('wheelman'), {name: 'Dele "Nitro"', employer: {id: 'pc1', name: 'Jaz', system: {stage: 15}}, ownership: {p1: 3}});
assert.equal(data.type, 'npc'); assert.equal(data.system.stats.whl.die, 8); assert.equal(data.ownership.p1, 3); assert.equal(data.flags['the-smoke'].hire.employer, 'pc1');
assert.equal(data.system.identity.alias, 'Nitro'); assert.equal(data.prototypeToken.actorLink, true);
assert.ok(UNLOCKS.find(u => u.key === 'ownCrew') && UNLOCKS.find(u => u.key === 'knownToPolice').label.includes('Long Shot'));

// the handlers
const NS = 'the-smoke', gm = {id: 'gm', isGM: true, active: true}, p1 = {id: 'p1', isGM: false, active: true};
game.user = gm; game.users = Object.assign([gm, p1], {activeGM: gm, get: id => [gm, p1].find(u => u.id === id), filter: f => [gm, p1].filter(f)});
const actors = [], getFlag = function (ns, k) { return this.flags?.[ns]?.[k]; };
const A = Array.prototype; game.actors = Object.assign(actors, {get: id => A.find.call(actors, a => a.id === id), filter: f => A.filter.call(actors, f), find: f => A.find.call(actors, f), some: f => A.some.call(actors, f)});
game.folders = Object.assign([], {find: () => ({id: 'f1'})}); game.scenes = []; game.messages = {get: () => null};
let n = 0;
const make = d => { const a = {id: `a${++n}`, items: [], ...structuredClone(d), getFlag, testUserPermission: u => u?.isGM || u?.id === 'p1',
  async update(p) { for (const [k, v] of Object.entries(p)) setPath(this, k, v); return this; },
  async createEmbeddedDocuments(_t, list) { this.items.push(...list); return list; }, async delete() { A.splice.call(actors, A.indexOf.call(actors, this), 1); }}; actors.push(a); return a; };
globalThis.Actor.implementation = {create: async d => make(d)};
const boss = make({name: 'Jaz', type: 'character', system: {stage: 13, cash: 1000}});
const {dispatch} = await import('../module/world/net.mjs');
await import('../module/world/hires.mjs');
const {crewCard} = await import('../module/world/hires.mjs');
assert.equal(crewCard({...boss, type: 'character', system: {stage: 5}}).locked, true, 'before Rep 13: locked');
await assert.rejects(dispatch('hire.take', {actorId: boss.id, type: 'muscle', userId: 'stranger'}), /Not your character/);
const r = await dispatch('hire.take', {actorId: boss.id, type: 'wheelman', userId: p1.id});
const hand = game.actors.get(r.id);
assert.equal(boss.system.cash, 600, 'paid £400 up front'); assert.equal(hand.type, 'npc'); assert.equal(hand.system.stats.whl.die, 8);
assert.equal(hand.ownership.p1, 3, 'the employer\'s player owns the hand'); assert.ok(hand.items.some(i => i.name === 'Slim Jim'), 'kit from the library');
await dispatch('hire.take', {actorId: boss.id, type: 'lookout', userId: p1.id});
await assert.rejects(dispatch('hire.take', {actorId: boss.id, type: 'muscle', userId: p1.id}), /keep 2/);
const card = crewCard(boss); assert.equal(card.used, 2); assert.equal(card.full, true);
await dispatch('hire.dismiss', {handId: hand.id, userId: p1.id});
assert.ok(!game.actors.get(hand.id), 'dismissed: gone'); assert.equal(crewCard(boss).used, 1);
await assert.rejects(dispatch('hire.take', {actorId: boss.id, type: 'shooter', userId: p1.id}), /£600/, 'can\'t afford it');
console.log('hired hands: one per stat, slots 2/3/4 by Rep, fee up front, owned by the employer\'s player, kit, dismissal; known to police — ok');
process.exit(0);
