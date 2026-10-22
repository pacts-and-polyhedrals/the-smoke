// 0.5.17: speed dice come back every round and in every new fight. Up to 0.5.16 a Surrender stayed on the character
// for good unless the GM pressed End Fight in the Console: a chase called off, the core tracker's End Combat, Busted,
// Wasted or a night's rest all left it on, so the player was OUT of every fight after. Also: the Console says why
// someone is out; late arrivals are dealt in while dice are still being rolled; Stunned mid-round costs a die.
import assert from 'assert';
import {fakeActor, chat, uid, setPath} from './fakes.mjs';
const NS = 'the-smoke';
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
game.users = Object.assign([{id: 'gm', isGM: true, active: true}, {id: 'p1', isGM: false, active: true}], {activeGM: {id: 'gm'}, get: id => ({id, isGM: id === 'gm', name: id}), filter: () => []});
game.user = {id: 'gm', isGM: true, targets: new Set()};
const settings = new Map(); game.settings.get = (ns, k) => settings.get(k); game.settings.register = () => null;
const msgs = new Map(); game.messages = Object.assign([], {get: id => msgs.get(id)});
globalThis.canvas = {scene: null, tokens: {controlled: []}};

const scene = {id: 's1', grid: {size: 100}, tokens: null, getFlag: () => null};
const tokens = new Map(); scene.tokens = Object.assign(tokens, {get: id => tokens.get(id), filter: f => [...tokens.values()].filter(f), find: f => [...tokens.values()].find(f), some: f => [...tokens.values()].some(f)});
function tok(actor, x, y) { const t = {id: uid(), uuid: `Scene.s1.Token.${actor.id}`, name: actor.name, actor, actorId: actor.id, parent: scene, x, y, width: 1, height: 1, hidden: false, flags: {[NS]: {}},
  getFlag(ns, k) { return this.flags[NS]?.[k]; }, async setFlag(ns, k, v) { this.flags[NS][k] = v; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) this.flags[NS][k.slice(NS.length + 7)] = v; else setPath(this, k, v); } }, testUserPermission: () => true};
  tokens.set(t.id, t); return t; }
const jaz = fakeActor({name: 'Jaz', stats: {mov: 8}}), cop = fakeActor({name: 'PC Officer', type: 'npc', stats: {mov: 6}});
cop.system.role = 'police';
const tj = tok(jaz, 0, 0), tc = tok(cop, 300, 0);
const uuids = new Map([[tj.uuid, tj], [tc.uuid, tc]]);
const prevFromUuid = globalThis.fromUuid; globalThis.fromUuid = async u => uuids.get(u) ?? prevFromUuid(u);
game.actors = Object.assign([jaz, cop], {get: id => [jaz, cop].find(a => a.id === id)});

const combats = []; game.combats = Object.assign(combats, {get: id => combats.find(c => c.id === id)});
function newFight(list) {
  const combat = {id: uid(), scene, round: 0, flags: {}, combatants: null,
    getFlag(ns, k) { return this.flags[ns]?.[k]; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) (this.flags[NS] ??= {})[k.slice(NS.length + 7)] = v; else this[k] = v; } }};
  const cs = list.map(([t, pc]) => ({id: uid(), name: t.name, actor: t.actor, token: t, tokenId: t.id, hasPlayerOwner: pc, isOwner: true, initiative: null, flags: {}, parent: combat,
    getFlag(ns, k) { return this.flags[ns]?.[k]; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) (this.flags[NS] ??= {})[k.slice(NS.length + 7)] = v; else this[k] = v; } }}));
  combat.combatants = Object.assign(cs, {get: id => cs.find(c => c.id === id)});
  combats.push(combat); return combat;
}
const endFight = async combat => { combats.splice(combats.indexOf(combat), 1); Hooks.callAll('deleteCombat', combat); await tick(); };   // the core tracker's End Combat
const jazIn = combat => combat.combatants.find(c => c.actor === jaz);
const net = await import('../module/world/net.mjs');
const C = await import('../module/combat/combat.mjs');
const R = await import('../module/combat/rules.mjs');
const G = await import('../module/gameplay.mjs');
const H = await import('../module/world/heat.mjs');
const {outLabel} = await import('../module/apps/combat-console.mjs');

/* ---------------------------------------------------------------- the written rule */
assert.deepEqual([4, 6, 8, 10, 12, 20].map(d => R.speedDiceCount({movDie: d})), [1, 2, 2, 3, 3, 4], 'Moves d4 1d6 · d6/d8 2d6 · d10/d12 3d6 · d20 4d6');
assert.equal(R.speedDiceCount({movDie: 4, conditions: ['Stunned', 'Knackered']}), 1, 'Stunned and Knackered each take one, minimum one');
assert.equal(R.speedDiceBlock({conditions: ['Cuffed']}), 'Cuffed'); assert.equal(R.speedDiceBlock({surrendered: true}), 'Surrendered'); assert.equal(R.speedDiceBlock({conditions: ['Down']}), 'Down');

/* ---------------------------------------------------------------- the report: surrender once, out for ever */
G.installGameplay();
const f1 = newFight([[tj, true], [tc, false]]);
await net.request('combat.begin', {combatId: f1.id});
assert.equal(jazIn(f1).flags[NS].speed.count, 2, 'Moves d8: two dice');
await net.request('combat.surrender', {tokenUuid: tj.uuid});
assert.equal(jaz.system.states.surrendered, true); assert.equal(jaz.getFlag(NS, 'surrenderedIn'), f1.id, 'the surrender belongs to this fight');
f1.flags[NS].state.phase = 'idle';
await net.request('combat.begin', {combatId: f1.id});
assert.equal(jazIn(f1).flags[NS].speed.count, 0, 'in the same fight: no more dice');
assert.equal(jazIn(f1).flags[NS].speed.why, 'Surrendered');
assert.deepEqual(outLabel(jazIn(f1)), {outLabel: 'OUT · SURRENDERED', outTitle: 'Surrendered in this fight: no actions until it ends. A new fight, Busted, Wasted or a night\'s rest stands you back up.'}, 'the Console says why');
await endFight(f1);
assert.equal(jaz.system.states.surrendered, false, 'ending the fight any way at all stands her back up (0.5.16: only the Console\'s End Fight did)');
const f2 = newFight([[tj, true], [tc, false]]);
await net.request('combat.begin', {combatId: f2.id});
assert.equal(jazIn(f2).flags[NS].speed.count, 2, 'next fight: her two dice are back');
assert.deepEqual(outLabel(jazIn(f2)), {outLabel: '', outTitle: ''});
await endFight(f2);

/* ---------------------------------------------------------------- worlds already stuck from 0.5.16 */
jaz.system.states.surrendered = true; delete jaz.flags[NS].surrenderedIn;   // saved by 0.5.16: a bare switch, no fight attached
const f3 = newFight([[tj, true], [tc, false]]);
await net.request('combat.begin', {combatId: f3.id});
assert.equal(jazIn(f3).flags[NS].speed.count, 2, 'an old surrender from another fight no longer costs her dice');
assert.deepEqual(await G.clearStaleSurrenders(), ['Jaz'], 'and loading the world clears it');
assert.equal(jaz.system.states.surrendered, false);
await net.request('combat.surrender', {tokenUuid: tj.uuid});
assert.deepEqual(await G.clearStaleSurrenders(), [], 'a surrender in a fight that is still on stays');
Hooks.callAll('deleteCombatant', jazIn(f3)); await tick();
assert.equal(jaz.system.states.surrendered, false, 'taken out of the fight: stands down');
await endFight(f3);

/* ---------------------------------------------------------------- rest, Busted and Wasted clear it too */
game.time = {worldTime: 0, advance: async s => (game.time.worldTime += s)};
for (const [label, fn] of [['a night\'s rest', a => G.restNow(a)], ['Busted', a => H.busted(a)], ['Wasted', a => H.wasted(a)]]) {
  jaz.system.states.surrendered = true; await jaz.setFlag(NS, 'surrenderedIn', 'some-old-fight');
  await fn(jaz);
  assert.equal(jaz.system.states.surrendered, false, `${label} stands you back up`);
}
// Cuffs are different: rest keeps them (by the book, a key, a Hard Graft roll or the custody suite takes them off).
await jaz.addCondition('Cuffed'); await G.restNow(jaz);
const f4 = newFight([[tj, true], [tc, false]]);
await net.request('combat.begin', {combatId: f4.id});
assert.equal(jazIn(f4).flags[NS].speed.count, 0); assert.equal(outLabel(jazIn(f4)).outLabel, 'OUT · CUFFED', 'cuffed: out, and the Console says so');
await jaz.removeCondition('Cuffed');
f4.flags[NS].state.phase = 'idle'; await net.request('combat.begin', {combatId: f4.id});
assert.equal(jazIn(f4).flags[NS].speed.count, 2, 'cuffs off: dice back next round');

/* ---------------------------------------------------------------- late arrivals and Stunned */
const sal = fakeActor({name: 'Sal', stats: {mov: 10}}), ts = tok(sal, 100, 0); uuids.set(ts.uuid, ts);
const salC = {id: uid(), name: 'Sal', actor: sal, token: ts, tokenId: ts.id, hasPlayerOwner: true, isOwner: true, flags: {}, parent: f4,
  getFlag(ns, k) { return this.flags[ns]?.[k]; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) (this.flags[NS] ??= {})[k.slice(NS.length + 7)] = v; else this[k] = v; } }};
f4.combatants.push(salC);
assert.equal(outLabel(salC).outLabel, 'NEXT ROUND', 'not dealt in yet: not "OUT"');
assert.equal((await C.dealIn(salC)).count, 3, 'joins while dice are still being rolled: dealt in at once');
const late = {...salC, id: uid(), flags: {}}; f4.combatants.push(late);
f4.flags[NS].state.phase = 'resolve';
assert.equal(await C.dealIn(late), null, 'joins after the reveal: next round');
f4.combatants.splice(f4.combatants.indexOf(late), 1);
// Stunned mid-round: the lowest die still to come goes; never the one being acted on, never the last of the round.
const jc = jazIn(f4);
jc.flags[NS].speed = {...jc.flags[NS].speed, results: [5, 2], rolled: true};
salC.flags[NS].speed = {...salC.flags[NS].speed, results: [6, 4, 1], rolled: true};
f4.flags[NS].state = {phase: 'resolve', round: 2, cursor: 0, queue: R.buildQueue([{cid: jc.id, name: 'Jaz', results: [5, 2], movDie: 8, pc: true}, {cid: salC.id, name: 'Sal', results: [6, 4, 1], movDie: 10, pc: true}])};
assert.deepEqual(f4.flags[NS].state.queue.map(e => e.value), [6, 5, 4, 2, 1]);
await sal.addCondition('Stunned'); await net.request('combat.stunned', {actorUuid: sal.uuid});
assert.deepEqual(f4.flags[NS].state.queue.map(e => `${e.name}:${e.value}`), ['Sal:6', 'Jaz:5', 'Sal:4', 'Jaz:2'], 'Sal loses her 1');
assert.deepEqual(salC.flags[NS].speed.lost, [2], 'and the Console marks that die lost');
await net.request('combat.stunned', {actorUuid: sal.uuid});
assert.equal(f4.flags[NS].state.queue.length, 4, 'once a round');
f4.flags[NS].state.cursor = 3;   // Jaz is on her last die
await net.request('combat.stunned', {actorUuid: jaz.uuid});
assert.equal(f4.flags[NS].state.queue.length, 4, 'nothing left to lose this round');
assert.ok(chat.some(m => /Sal loses a die/.test(m.content ?? '')));
// Stunned before anyone has rolled: one fewer to roll.
f4.flags[NS].state = {phase: 'idle', round: 2, queue: [], cursor: 0}; await sal.removeCondition('Stunned');
await net.request('combat.begin', {combatId: f4.id});
assert.equal(salC.flags[NS].speed.count, 3); assert.deepEqual(salC.flags[NS].speed.lost, [], 'last round\'s lost die is forgotten');
await net.request('combat.stunned', {actorUuid: sal.uuid});
assert.equal(salC.flags[NS].speed.count, 2, 'stunned before rolling: 2d6 instead of 3d6');
console.log('speed dice: two dice back in every new fight after a surrender (any ending, rest, Busted, Wasted, stuck 0.5.16 saves), the Console says why someone is out, late arrivals dealt in, Stunned costs a die — ok');
process.exit(0);
