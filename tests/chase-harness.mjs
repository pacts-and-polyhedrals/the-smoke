import {applyDocumentUpdate, flagDocument} from './foundry-updates.mjs';
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
  async updateEmbeddedDocuments(_t, ups, options = {}) { batches.push({ups: clone(ups), options: clone(options)}); for (const u of ups) { const t = this.tokens.get(u._id); if (t) { apply(t, u); for (const f of hooks.updateToken || []) f(t, u, options, game.user.id); } } return ups; },
  async deleteEmbeddedDocuments(_t, ids) { for (const id of ids) this.tokens.delete(id); return ids; }});
const batches = [];
const docs = new Map();
globalThis.fromUuid = async u => docs.get(u) ?? null;
function token(actor, {x, y, w = 1, h = 1, rotation = 0, flags = {}, name = null}) {
  const t = flagged({id: uid(), name: name ?? actor.name, actor, actorId: actor.id, actorLink: actor.type === 'character', parent: scene, x, y, width: w, height: h, rotation, elevation: 0, hidden: false,
    flags: {[NS]: clone(flags)}, light: {}, texture: {src: ''}, testUserPermission: () => true,
    async update(u, options = {}) { for (const f of hooks.preUpdateToken || []) if (f(this, u, options, game.user.id) === false) return this; apply(this, u); for (const f of hooks.updateToken || []) f(this, u, options, game.user.id); return this; }});
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
game.combats = combats; game.scenes = coll([scene]); game.messages = coll(); game.paused = false;
const gm = {id: 'gm', name: 'GM', isGM: true, active: true}, p1 = {id: 'p1', name: 'Maya', isGM: false, active: true};
game.users = Object.assign([gm, p1], {activeGM: gm, get: id => [gm, p1].find(u => u.id === id), filter: f => [gm, p1].filter(f)});
game.user = gm; globalThis.canvas = {scene: null};
const settings = {autoChase: true, chaseAuto: false, combatAutoHeat: true, policeResponse: false, autoEvade: true, chaseDelay: 2, chasePacingVersion: 0, playMode: 'story'}; game.settings.get = (_ns, k) => settings[k]; game.settings.set = async (_ns,k,v) => {settings[k]=v;};
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


// Chat messages keep their flags and wake the real chase scheduler when a card is resolved.
ChatMessage.implementation.create = async data => {
 const m = flagged({id: uid(), ...data, flags: data.flags || {}, async update(up) {apply(this,up); for(const f of hooks.updateChatMessage || [])f(this,up);return this;}});
 m.setFlag = async (ns,k,v) => { (m.flags[ns]??={})[k]=v; for(const f of hooks.updateChatMessage || [])f(m,{flags:{[ns]:{[k]:v}}});return m; };
 chat.push(m); game.messages.set(m.id,m); return m;
};
export {NS, clone, coll, apply, flagged, docs, batches, scene, token, vehicle, combats, makeCombat, gm, p1, settings, totals, jaz, fiesta, vt, jt, areaCar, ut, prius, tt, parked, pt, hooks, chat};
