import {applyDocumentUpdate, flagDocument} from './foundry-updates.mjs';
// Chases on fake documents: a police unit clocks a wanted player at the wheel → the map goes turn-based, everybody in it
// gets speed dice (the motor's for police and traffic, the better of the two for a driver), the gauge counts each
// action and refuses past red, yellow and red ask for a Wheels check in the chat, losing it is an incident, driving
// over another vehicle asks for an evasive manoeuvre (and a crash is logged on both), 0 Body is a fire, a fire goes up
// at the end of the next round with anyone still in it, the police drive and ram on their go, traffic carries on, a
// spun-out driver loses a die, and getting 30 squares clear of every unit ends it.
import assert from 'assert/strict';
import {fakeActor, chat, uid, setPath} from './fakes.mjs';
import {hooks} from './runtime-stub.mjs';
const NS = 'the-smoke';

/* ---------------------------------------------------------------- a small Foundry */
const clone = o => JSON.parse(JSON.stringify(o ?? {}));
function coll(items = []) {
  const m = new Map(items.map(i => [i.id, i]));
  Object.defineProperty(m, 'contents', {get: () => [...m.values()]});
  return Object.assign(m, {filter: f => [...m.values()].filter(f), find: f => [...m.values()].find(f), some: f => [...m.values()].some(f),
    map: f => [...m.values()].map(f), every: f => [...m.values()].every(f), [Symbol.iterator]: function* () { yield* m.values(); }});
}
const apply = applyDocumentUpdate;
const flagged = flagDocument;
const scene = flagged({id: 's1', name: 'Hackney', grid: {size: 100}, flags: {}, active: true, tokens: coll(),
  async updateEmbeddedDocuments(_t, ups) { for (const u of ups) { const t = this.tokens.get(u._id); if (t) apply(t, u); } return ups; },
  async deleteEmbeddedDocuments(_t, ids) { for (const id of ids) this.tokens.delete(id); return ids; }});
const docs = new Map();
globalThis.fromUuid = async u => docs.get(u) ?? null;
function token(actor, {x, y, w = 1, h = 1, rotation = 0, flags = {}, name = null}) {
  const t = flagged({id: uid(), name: name ?? actor.name, actor, actorId: actor.id, actorLink: actor.type === 'character', parent: scene, x, y, width: w, height: h, rotation, elevation: 0, hidden: false,
    flags: {[NS]: clone(flags)}, light: {}, texture: {src: ''}, testUserPermission: () => true,
    async update(u) { apply(this, u); return this; }});
  t.uuid = `Scene.s1.Token.${t.id}`; docs.set(t.uuid, t); scene.tokens.set(t.id, t); return t;
}
// vehicles get the system's real damage (so 0 Body means fire)
const {SmokeActor} = await import('../module/documents.mjs');
function vehicle(name, {speed = 8, perfDie = 8, body = 12, size = 2, handling = 0} = {}) {
  const a = Object.create(SmokeActor.prototype);
  Object.assign(a, {id: uid(), name, type: 'vehicle', flags: {}, items: Object.assign([], {get: () => null}),
    system: {vehicle: {klass: 'car', size, perfDie, handling, speed, body: {value: body, max: body}, fuel: {value: 10, max: 10}, armour: 0, flats: 0, destroyed: false, crewDie: 0, control: 'driver'}},
    getFlag(ns, k) { return this.flags?.[ns]?.[k]; }, async setFlag(ns, k, v) { (this.flags[ns] ??= {})[k] = v; return this; }, async unsetFlag(ns, k) { delete this.flags?.[ns]?.[k]; },
    async update(u) { apply(this, u); return this; }, testUserPermission: () => true});
  a.uuid = `Actor.${a.id}`; return a;
}
const combats = coll();
function makeCombat() {
  const c = flagged({id: uid(), scene, active: true, round: 0, turn: 0, flags: {}, combatants: coll(), documentName: 'Combat',
    async update(u) { apply(this, u); for (const f of hooks.updateCombat || []) f(this, u); return this; },
    async createEmbeddedDocuments(_t, list) {
      return list.map(d => { const cb = flagged({id: uid(), tokenId: d.tokenId, sceneId: d.sceneId, actorId: d.actorId, flags: {}, parent: c, isOwner: true, initiative: null,
        get token() { return scene.tokens.get(this.tokenId); }, get actor() { return this.token?.actor; }, get name() { return this.token?.name; }, get img() { return ''; },
        get hasPlayerOwner() { return this.actor?.type === 'character'; }, async update(u) { apply(this, u); return this; }}); c.combatants.set(cb.id, cb); return cb; });
    },
    async deleteEmbeddedDocuments(_t, ids) { for (const id of ids) c.combatants.delete(id); },
    async delete() { combats.delete(this.id); for (const f of hooks.deleteCombat || []) f(this); }});
  combats.set(c.id, c); return c;
}
CONFIG.Combat.documentClass = {create: async () => makeCombat()};
game.combats = combats; game.scenes = coll([scene]); game.messages = {get: () => null}; game.paused = false;
const gm = {id: 'gm', name: 'GM', isGM: true, active: true}, p1 = {id: 'p1', name: 'Maya', isGM: false, active: true};
game.users = Object.assign([gm, p1], {activeGM: gm, get: id => [gm, p1].find(u => u.id === id), filter: f => [gm, p1].filter(f)});
game.user = gm; globalThis.canvas = {scene: null};
const settings = {autoChase: true, chaseAuto: false, combatAutoHeat: true, policeResponse: true, autoEvade: false, chaseDelay: 2}; game.settings.get = (_ns, k) => settings[k];
// rolls: Nd6 for speed dice; anything else totals the next queued number
const totals = []; let d6 = 5;
globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { const m = /^(\d+)d6$/.exec(this.formula); this.dice = [{results: m ? Array.from({length: +m[1]}, () => ({result: d6})) : [{result: 3}]}]; this.total = m ? +m[1] * d6 : (totals.shift() ?? 12); return this; } };

/* ---------------------------------------------------------------- the street */
const jaz = fakeActor({name: 'Jaz', stats: {mov: 8, whl: 8}, heat: 2, health: 12}); jaz.hasPlayerOwner = true; jaz.uuid = `Actor.${jaz.id}`;
docs.set(jaz.uuid, jaz);
const fiesta = vehicle('Ford Fiesta', {speed: 8, perfDie: 8, body: 12});
const vt = token(fiesta, {x: 1000, y: 1000, w: 2, h: 3, rotation: 270}); fiesta.token = vt;
const jt = token(jaz, {x: 1050, y: 1050, w: 0.5, h: 0.5, flags: {vehicleSeat: {vehicleTokenId: vt.id, seatId: 'pilot'}}});
await vt.setFlag(NS, 'vehicleOccupants', [{seatId: 'pilot', tokenId: jt.id, actorId: jaz.id, name: 'Jaz'}]);
const areaCar = vehicle('Area Car', {perfDie: 10, speed: 10, body: 12});
const ut = token(areaCar, {x: 2200, y: 1000, w: 2, h: 3, rotation: 90, flags: {police: {unit: 'car', hunting: jaz.id}}}); areaCar.token = ut;
const prius = vehicle('Toyota Prius', {perfDie: 6, speed: 7});
const tt = token(prius, {x: 400, y: 1600, w: 2, h: 3, rotation: 270, flags: {traffic: {kind: 'moving', route: [[500, 1750], [3000, 1750]], s: 0, pace: 1}}}); prius.token = tt;
const parked = vehicle('Parked Golf', {perfDie: 6});
const pt = token(parked, {x: 300, y: 300, w: 2, h: 3, flags: {traffic: {kind: 'parked'}}}); parked.token = pt;
const farCar = vehicle('Far Van', {perfDie: 6});
token(farCar, {x: 9000, y: 9000, w: 2, h: 3, flags: {traffic: {kind: 'moving'}}});

/* ---------------------------------------------------------------- it goes turn-based */
const D = await import('../module/rules/driving.mjs');
const chase = await import('../module/world/chase.mjs');
const inc = await import('../module/world/incidents.mjs'); inc.installIncidents();
const CS = await import('../module/world/chase-state.mjs');
const {speedCountFor} = await import('../module/combat/combat.mjs');
const combat = await chase.startChaseNow(scene, {targetId: jt.id, auto: false, reason: 'Police pursuit'});
assert.ok(combat && combat.getFlag(NS, 'chase'), 'a chase is on');
assert.equal(CS.chaseOf(scene), combat);
const inIt = new Set(combat.combatants.map(c => c.tokenId));
assert.ok(inIt.has(jt.id) && inIt.has(ut.id) && !inIt.has(tt.id), 'the driver and the unit; traffic shares a separate phase');
assert.ok(!inIt.has(pt.id), 'not the parked car'); assert.equal(inIt.size, 2, 'traffic is not a separate combatant');
assert.ok(chat.some(m => /IT'S ON/.test(m.content)), 'the chase card');
const cOf = t => combat.combatants.find(c => c.tokenId === t.id) ?? (t === tt ? {id: '@traffic', token: tt, actor: tt.actor, name: 'All civilian traffic', kind: 'traffic'} : null);
// speed dice: the motor's for police and traffic; the better of hers and the car's for Jaz
assert.equal(speedCountFor(cOf(ut)), D.vehicleSpeedDice(areaCar.system.vehicle));
assert.equal(speedCountFor(cOf(jt)), 2);
assert.equal(combat.getFlag(NS, 'state').phase, 'intent', 'round one: roll speed dice');
assert.equal(cOf(ut).getFlag(NS, 'speed').count, 3, 'a d10 motor: three dice');

/* ---------------------------------------------------------------- the gauge: her go, and not past red */
let roundNo = 1;
const setQueue = (entries, cursor = 0) => combat.update({[`flags.${NS}.state`]: {phase: 'resolve', round: roundNo, queue: entries.map((e, i) => ({cid: e.id, name: e.name, die: i, value: 6 - i, ...(e.kind ? {kind: e.kind} : {})})), cursor}});
await setQueue([cOf(jt), cOf(ut), cOf(tt), cOf(jt)]);
const passengers = {pilot: {tokenId: jt.id}};
const {gate, watch, resolve} = inc._internals;
const go = (squares, user = p1) => gate({vt, scene, user, transform: {x: vt.x + squares * 100, y: vt.y}, passengers, free: false});
assert.deepEqual(await go(6), {x: vt.x + 600, y: vt.y}, 'inside the gauge: as dragged');
const clamped = await go(25); assert.equal(clamped.x, vt.x + 1600, 'past red: shortened to the red line (16 squares)');
await combat.update({[`flags.${NS}.state`]: {...combat.getFlag(NS, 'state'), cursor: 1}});
await assert.rejects(go(3), /not your go/, 'the police unit\'s die: she waits');
assert.ok(await go(3, gm), 'the GM can always move it');
await combat.update({[`flags.${NS}.state`]: {...combat.getFlag(NS, 'state'), cursor: 0}});

// drive 10 squares: into yellow, a Medium check in the chat
const key = CS.actionKey(combat);
const before = chat.length;
await watch({vt, scene, user: p1, from: [1100, 1150], to: [2100, 1150], passengers, free: false});
let tally = CS.tallyOf(vt, key); assert.equal(tally.moved, 10); assert.equal(tally.band, 'yellow'); assert.deepEqual(tally.checked, ['yellow']);
const prompt = chat.slice(before).find(m => /DRIVING · YELLOW/.test(m.content)); assert.ok(prompt, 'a yellow-line check card');
assert.match(prompt.content, /data-smoke-roll="Actor\./); assert.match(prompt.content, /data-band="medium"/);
assert.equal(inc.openPrompts(vt).length, 1, 'she can\'t move until she rolls');
await assert.rejects(go(1), /roll the driving check/);
// the yellow penalty is on her Wheels for the rest of the action
const {driverContext} = await import('../module/vehicles/vehicle-abilities.mjs');
const ctx = driverContext(jaz, {sceneId: 's1', tokenId: jt.id});
assert.ok(ctx && ctx.modifier === -1 && ctx.notes.some(n => /Yellow/.test(n)), 'Handling −1 while in yellow');
// she fails it: a skid, Body lost, logged, and that's the end of the action
const ctxOf = html => JSON.parse(html.match(/data-context='([^']+)'/)[1].replace(/&quot;/g, '"'));
const pctx = ctxOf(prompt.content);
for (const f of hooks.createChatMessage) f({getFlag: (_ns, k) => k === 'roll' ? {context: pctx, outcomeKey: 'costlyFailure', margin: -2, actorName: 'Jaz'} : null});
await new Promise(r => setTimeout(r, 30));
assert.equal(fiesta.system.vehicle.body.value, 10, 'a skid: −2 Body');
assert.ok(CS.tallyOf(vt, key).stopped, 'lost it: no more driving this action');
assert.equal(inc.openPrompts(vt).length, 0, 'the check is settled');
assert.ok((fiesta.getFlag(NS, 'incidents') || []).some(i => i.kind === 'skid'), 'logged on the car');
await assert.rejects(go(1), /lost it/);

/* ---------------------------------------------------------------- driving over another vehicle */
await combat.update({[`flags.${NS}.state`]: {...combat.getFlag(NS, 'state'), cursor: 3}});   // her second die
await ut.update({x: 1800, y: 1900});   // the unit drops back, still watching
const bus = vehicle('Route 38 Bus', {size: 3, body: 20}); const bt = token(bus, {x: 2900, y: 950, w: 2, h: 4, rotation: 270}); bus.token = bt;
const b2 = chat.length;
await vt.update({x: 3400, y: 1000}, {acVehicleCarry: true});   // where the drag left it, through the bus
await watch({vt, scene, user: p1, from: [2100, 1150], to: [3500, 1150], passengers, free: false});
const evade = chat.slice(b2).find(m => /INCIDENT · EVASIVE/.test(m.content)); assert.ok(evade, 'an evasive manoeuvre is asked for');
assert.match(evade.content, /Route 38 Bus/); const ectx = ctxOf(evade.content); assert.equal(ectx.other, bt.uuid); assert.ok(ectx.impact[0] < 3000, 'the impact point is short of the bus');
assert.match(evade.content, /data-band="(medium|hard)"/, 'at that speed it is harder than Easy');
// she smashes into it
const jazHP = jaz.system.resources.health.value, jazHeat = jaz.system.heat.value;
await resolve({...ectx, fromChat: true, outcomeKey: 'severeFailure', margin: -5, driver: 'Jaz'});
assert.ok(fiesta.system.vehicle.body.value < 10 && bus.system.vehicle.body.value < 20, 'both vehicles damaged');
assert.ok(jaz.system.resources.health.value < jazHP, 'thrown about inside');
assert.equal(jaz.system.heat.value, Math.max(jazHeat, 1), 'dangerous driving, in front of the police: one star (0.5.22: driving alone never takes you past one)');
assert.ok((bus.getFlag(NS, 'incidents') || []).some(i => i.kind === 'hit'), 'logged on the bus too');
assert.equal(vt.x, Math.round(ectx.impact[0] - 100), 'stopped dead where it hit');
// a swerve that comes off: nothing
const b3 = chat.length; await inc.collide(vt, bt, D.collisionResult({outcomeKey: 'strongSuccess'}), {});
assert.ok(chat.slice(b3).some(m => /coat of paint/.test(m.content)));

assert.equal(fiesta.system.vehicle.body.value, 0, 'a red-line smash into a bus: that\'s the Fiesta done');
assert.ok(vt.getFlag(NS, 'fire'), 'and at 0 Body it\'s on fire');

/* ---------------------------------------------------------------- fire, and getting out */
await vt.update({[`flags.${NS}.fire`]: null}); await fiesta.update({'system.vehicle.body.value': 4});   // run it again from the top
await fiesta.applyDamage(50);
assert.equal(fiesta.system.vehicle.body.value, 0); assert.ok(vt.getFlag(NS, 'fire'), 'at 0 Body it catches fire');
assert.equal(vt.getFlag(NS, 'fire').round, 1, 'in a fight: it goes at the end of the next round');
const fireCard = chat.find(m => /is on fire!/.test(m.content)); assert.ok(fireCard && /data-smoke-exit=/.test(fireCard.content), 'with a Get out button for Jaz');
await inc.fireRoundEnd(combat, {round: 1}); assert.ok(vt.getFlag(NS, 'fire') && !vt.getFlag(NS, 'burnt'), 'not yet: end of the NEXT round');
const hpBefore = jaz.system.resources.health.value;
await inc.fireRoundEnd(combat, {round: 2});
assert.ok(vt.getFlag(NS, 'burnt') && fiesta.system.vehicle.destroyed, 'BOOM: burnt out');
assert.ok(jaz.system.resources.health.value <= Math.max(0, hpBefore - 10), 'she was still inside');
assert.equal(jt.getFlag(NS, 'vehicleSeat') ?? null, null, 'and is thrown clear of the wreck');
assert.ok(chat.some(m => /explodes/.test(m.content)));
assert.ok(!combat.combatants.some(c => c.tokenId === vt.id));

/* ---------------------------------------------------------------- the police and traffic on their go */
await jaz.removeCondition('Down'); jaz.system.resources.health.value = 12;
const jazCar2 = vehicle('Getaway BMW', {speed: 9, perfDie: 10}); const vt2 = token(jazCar2, {x: 800, y: 3000, w: 2, h: 3, rotation: 270}); jazCar2.token = vt2;
await jt.update({[`flags.${NS}.vehicleSeat`]: {vehicleTokenId: vt2.id, seatId: 'pilot'}}); await vt2.setFlag(NS, 'vehicleOccupants', [{seatId: 'pilot', tokenId: jt.id, actorId: jaz.id, name: 'Jaz'}]);
await ut.update({x: 2400, y: 3000});
await setQueue([cOf(ut), cOf(tt), cOf(jt)]);
const startGap = D.driveBands ? Math.hypot(ut.x - vt2.x, ut.y - vt2.y) : 0;
totals.push(30);
await chase.npcTurn(combat, cOf(ut));
assert.ok(Math.hypot(ut.x - vt2.x, ut.y - vt2.y) < startGap, 'the unit closes in');
assert.ok(Math.hypot(ut.x - vt2.x, ut.y - vt2.y) >= 150, 'and pulls up short, not on top of her');
// alongside at three stars: it rams
await jt.setFlag(NS, 'policeResisted', true);
await jaz.update({'system.heat.value': 3}); await ut.update({x: vt2.x + 250, y: vt2.y}); roundNo = 2; await setQueue([cOf(ut), cOf(tt), cOf(jt)]);
totals.push(30);   // a big hit
const bmw = jazCar2.system.vehicle.body.value;
await chase.npcTurn(combat, cOf(ut));
const ramPrompt = inc.openPrompts(vt2).find(p => p.kind === 'ramSave');
assert.ok(ramPrompt, 'the player responds before ram damage');
assert.equal(jazCar2.system.vehicle.body.value, bmw);
await resolve({...ramPrompt.context, fromChat: true, actorUuid: jaz.uuid, outcomeKey: 'costlyFailure', driver: 'Jaz'});
assert.ok(jazCar2.system.vehicle.body.value < bmw, 'rammed after the failed response');
assert.ok((jazCar2.getFlag(NS, 'incidents') || []).some(i => i.kind === 'rammed'));
// traffic carries on along its trip
const s0 = tt.getFlag(NS, 'traffic').s;
await setQueue([cOf(tt)]);
await chase.npcTurn(combat, cOf(tt));
assert.ok(tt.getFlag(NS, 'traffic').s > s0, 'the Prius drives on along its route');
// a spun-out driver loses their next die this round
await setQueue([cOf(ut), cOf(jt), cOf(tt), cOf(jt)]);
assert.ok(await chase.loseNextAction(vt2, 'spun round'));
assert.deepEqual(combat.getFlag(NS, 'state').queue.map(e => e.cid), [cOf(ut).id, cOf(tt).id, cOf(jt).id], 'her next die is gone');

/* ---------------------------------------------------------------- auto mode: the AI takes its own go */
chase.installChase();
await combat.update({[`flags.${NS}.chase`]: {...combat.getFlag(NS, 'chase'), auto: true}});
const s1 = tt.getFlag(NS, 'traffic').s; roundNo = 5; await setQueue([cOf(tt), cOf(jt)]);
await new Promise(r => setTimeout(r, 4900));
assert.ok(tt.getFlag(NS, 'traffic').s > s1, 'auto: the Prius drove itself on its die');
assert.equal(combat.getFlag(NS, 'state').cursor, 0, 'waits for review instead of advancing');
assert.equal(combat.getFlag(NS, 'chase').action.status, 'review');
await (await import('../module/world/net.mjs')).request('combat.next', {combatId: combat.id, key: CS.actionKey(combat)});
assert.equal(combat.getFlag(NS, 'state').cursor, 1, 'the GM explicitly continues to Jaz');
await combat.update({[`flags.${NS}.chase`]: {...combat.getFlag(NS, 'chase'), auto: false}});

/* ---------------------------------------------------------------- lost them */
for (const [t, a] of [[vt2, jazCar2], [ut, areaCar]]) { await t.update({[`flags.${NS}.fire`]: null}); await a.update({'system.vehicle.body.value': 8, 'system.vehicle.destroyed': false}); }   // fire brigade
await jaz.addCondition('Down');
await chase.roundEnd(combat, {round: 2});
assert.ok(!combats.has(combat.id), 'Jaz went down in the fireball: nobody left to chase');
// again, with Jaz back on her feet
combats.set(combat.id, combat); await jaz.removeCondition('Down'); jaz.system.resources.health.value = 12;
await chase.roundEnd(combat, {round: 2});
assert.ok(combats.has(combat.id), 'still on them');
await ut.update({x: 9000, y: 200});
for (let r = 3; r <= 7 && combats.has(combat.id); r++) await chase.roundEnd(combat, {round: r});
assert.ok(!combats.has(combat.id), 'staying thirty squares clear loses stars until zero');
assert.ok(scene.getFlag(NS, 'chaseCooldown')?.until > Date.now(), 'the units search for a minute');
assert.ok(chat.some(m => /Lost them!/.test(m.content)));
console.log('chase: turn-based on sight, speed dice, the gauge and its checks, swerves and crashes, fire and BOOM, police and traffic on their go, losing a die, getting away — ok');
process.exit(0);
