// A whole round on fake documents: begin → private speed rolls → reveal → the queue → hits → end of round.
import assert from 'assert';
import {fakeActor, conditionNames, chat, uid, setPath} from './fakes.mjs';
const NS = 'the-smoke';
game.users = Object.assign([{id: 'gm', isGM: true, active: true}, {id: 'p1', isGM: false, active: true}], {activeGM: {id: 'gm'}, get: id => ({id, isGM: id === 'gm', name: id})});
game.user = {id: 'gm', isGM: true, targets: new Set()};
const settings = new Map(); game.settings.get = (ns, k) => settings.get(k); game.settings.register = () => null;

// Fake scene, tokens, combat.
const scene = {id: 's1', grid: {size: 100}, tokens: null};
const tokens = new Map(); scene.tokens = Object.assign(tokens, {filter: f => [...tokens.values()].filter(f), find: f => [...tokens.values()].find(f), some: f => [...tokens.values()].some(f)});
function tok(actor, x, y, flags = {}) { const t = {id: uid(), uuid: `Scene.s1.Token.${actor.id}`, name: actor.name, actor, actorId: actor.id, parent: scene, x, y, width: 1, height: 1, hidden: false, flags: {[NS]: flags},
  getFlag(ns, k) { return this.flags[NS]?.[k]; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) this.flags[NS][k.slice(NS.length + 7)] = v; else setPath(this, k, v); } }, testUserPermission: () => true};
  tokens.set(t.id, t); return t; }
const jaz = fakeActor({name: 'Jaz', stats: {mov: 8}, items: ['Polymer Nine', 'Bleeding' && 'Fists']}), cop = fakeActor({name: 'PC Officer', type: 'npc', stats: {mov: 6}}), sal = fakeActor({name: 'Sal', stats: {mov: 4}});
cop.system.role = 'police';
const tj = tok(jaz, 0, 0), tc = tok(cop, 500, 0), ts = tok(sal, 100, 0);
const uuids = new Map([[tj.uuid, tj], [tc.uuid, tc], [ts.uuid, ts]]);
const prevFromUuid = globalThis.fromUuid; globalThis.fromUuid = async u => uuids.get(u) ?? prevFromUuid(u);
function combatant(t, pc) { return {id: uid(), name: t.name, actor: t.actor, token: t, tokenId: t.id, hasPlayerOwner: pc, isOwner: true, initiative: null, flags: {},
  getFlag(ns, k) { return this.flags[ns]?.[k]; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) { (this.flags[NS] ??= {})[k.slice(NS.length + 7)] = v; } else this[k] = v; } }}; }
const cs = [combatant(tj, true), combatant(tc, false), combatant(ts, true)];
const combat = {id: 'c1', scene, round: 0, flags: {}, combatants: Object.assign(cs, {get: id => cs.find(c => c.id === id)}),
  getFlag(ns, k) { return this.flags[ns]?.[k]; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) (this.flags[NS] ??= {})[k.slice(NS.length + 7)] = v; else this[k] = v; } }};
for (const c of cs) c.parent = combat;   // as in Foundry: a combatant knows its fight (a surrender is scoped to it)
game.combats = Object.assign([combat], {get: id => id === 'c1' ? combat : null});
const msgs = new Map(); game.messages = {get: id => msgs.get(id)};
const net = await import('../module/world/net.mjs');
const C = await import('../module/combat/combat.mjs');

// Begin: speed dice from Moves (d8 → 2, d6 → 2, d4 → 1).
await net.request('combat.begin', {combatId: 'c1'});
assert.equal(combat.flags[NS].state.phase, 'intent'); assert.equal(combat.flags[NS].state.round, 1);
assert.deepEqual(cs.map(c => c.flags[NS].speed.count), [2, 2, 1]);
// Jaz rolls privately (a whispered message with two d6), the cop's dice are rolled by the GM.
msgs.set('m1', {rolls: [{dice: [{results: [{result: 5}, {result: 2}]}]}]});
await net.request('combat.speed', {combatId: 'c1', combatantId: cs[0].id, messageId: 'm1'});
assert.deepEqual(cs[0].flags[NS].speed.results, [5, 2]);
await assert.rejects(net.request('combat.speed', {combatId: 'c1', combatantId: cs[0].id, messageId: 'm1'}), /does not match/, 'no re-rolls');
await assert.rejects(net.request('combat.reveal', {combatId: 'c1'}), /Still waiting on: PC Officer, Sal/, 'reveal waits for everyone');
cs[1].flags[NS].speed = {...cs[1].flags[NS].speed, results: [6, 1], rolled: true}; cs[2].flags[NS].speed = {...cs[2].flags[NS].speed, results: [5], rolled: true};
await net.request('combat.reveal', {combatId: 'c1'});
const st = combat.flags[NS].state;
assert.deepEqual(st.queue.map(e => `${e.name}:${e.value}`), ['PC Officer:6', 'Jaz:5', 'Sal:5', 'Jaz:2', 'PC Officer:1'], 'Jaz beats Sal on the tie (better Moves)');
assert.equal(cs[1].initiative, 6, 'the core tracker shows the top die');

// A hit: Jaz shoots the officer (margin 3, impact 4, body armour 3) — auto-applies damage, and adds Heat (assault on police).
settings.set('combatAutoDamage', true); settings.set('combatAutoHeat', true);
cop.system.armour = 3;
await net.request('combat.hit', {attackerTokenUuid: tj.uuid, targetTokenUuid: tc.uuid, weaponName: 'Polymer Nine', weaponCrime: 'shooting', effect: '', loud: true, hit: true, margin: 3, outcomeKey: 'fullSuccess', explosions: 0, impact: 4, armourBonus: 0, band: 'Near'});
assert.equal(cop.system.resources.health.value, 10 - 4);
assert.ok(jaz.system.heat.value >= 3, `assaulting a cop with a gun, in front of the police: Heat ${jaz.system.heat.value}`);
// A taser hit stuns and floors.
await net.request('combat.hit', {attackerTokenUuid: tc.uuid, targetTokenUuid: tj.uuid, weaponName: 'Taser', weaponCrime: 'assault', effect: 'stun', hit: true, margin: 1, outcomeKey: 'fullSuccess', impact: 1, armourBonus: 0});
assert.deepEqual(conditionNames(jaz), ['Prone', 'Stunned']);
// A grenade catches Sal too (Engaged with Jaz).
const before = sal.system.resources.health.value;
await net.request('combat.hit', {attackerTokenUuid: tc.uuid, targetTokenUuid: tj.uuid, weaponName: 'Frag Grenade', weaponCrime: 'shooting', effect: 'area', hit: true, margin: 0, outcomeKey: 'narrowSuccess', impact: 3, armourBonus: 0});
assert.ok(sal.system.resources.health.value < before, 'Sal is caught in the blast');
// Cover on a token.
await net.request('combat.flag', {tokenUuid: ts.uuid, key: 'cover', value: 'heavy'});
assert.equal(ts.flags[NS].cover, 'heavy'); assert.equal(C.defenceOf(ts).cover, 'heavy');
// Grab then release.
await net.request('combat.grab', {attackerTokenUuid: tc.uuid, targetTokenUuid: ts.uuid});
assert.ok(conditionNames(sal).includes('Grabbed')); assert.equal(ts.flags[NS].grabbedBy, tc.id);
await net.request('combat.release', {tokenUuid: ts.uuid}); assert.ok(!conditionNames(sal).includes('Grabbed'));
// Surrender: no speed dice next round.
await net.request('combat.surrender', {tokenUuid: ts.uuid}); assert.equal(sal.system.states.surrendered, true);

// Work through the queue; at the end, Bleeding bites and Stunned wears off.
await jaz.addCondition('Bleeding'); const hp = jaz.system.resources.health.value;
for (let i = 0; i < st.queue.length; i++) await net.request('combat.next', {combatId: 'c1'});
assert.equal(combat.flags[NS].state.phase, 'idle');
assert.equal(jaz.system.resources.health.value, hp - 1, 'bled 1');
assert.ok(!conditionNames(jaz).includes('Stunned'), 'stun wears off at the end of the round');
await net.request('combat.begin', {combatId: 'c1'});
assert.equal(cs[2].flags[NS].speed.count, 0, 'surrendered: no dice'); assert.equal(cs[2].flags[NS].speed.rolled, true);
assert.equal(cs[0].flags[NS].speed.count, 2);
// Default (0.1.2 flow): the hit card lets the target Take hit or Dodge, with the weapon's effect and one GM condition.
settings.set('combatAutoDamage', false); jaz.system.states = {reactionUsed: false};
const hpNow = jaz.system.resources.health.value;
await net.request('combat.hit', {attackerTokenUuid: tc.uuid, targetTokenUuid: tj.uuid, weaponName: 'Taser', weaponCrime: 'assault', effect: 'stun', hit: true, margin: 2, total: 14, outcomeKey: 'fullSuccess', impact: 1, armourBonus: 0});
const atk = chat.at(-1).flags?.[NS]?.attack;
assert.ok(atk, 'the card carries the attack'); assert.equal(atk.total, 14); assert.equal(atk.target, tj.uuid); assert.deepEqual(atk.effects, ['Stunned', 'Prone']);
assert.match(chat.at(-1).content, /Take hit/); assert.match(chat.at(-1).content, /Dodge/);
assert.equal(jaz.system.resources.health.value, hpNow, 'nothing applied until the target chooses');
// Down at the end of a round: the clock ticks and a Stay Conscious card goes out; three rounds is Wasted.
jaz.system.resources.health.value = 0; jaz.system.states = {down: true, downRounds: 0};
combat.flags[NS].state = {phase: 'resolve', round: 2, queue: [{cid: cs[1].id, name: 'PC Officer', value: 3}], cursor: 0};
await net.request('combat.next', {combatId: 'c1'});
assert.equal(jaz.system.states.downRounds, 1, 'the Down clock ticks at the end of the round');
assert.ok(chat.some(m => /Round 1\/3 without aid/.test(m.content ?? '')), 'a Stay Conscious card goes out');
console.log('combat flow: begin, private rolls, reveal order, hits with armour/effects/area, Heat, cover, grab, surrender, round end, Take hit/Dodge cards — ok');
process.exit(0);
