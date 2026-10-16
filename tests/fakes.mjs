// Fake documents for rule tests: an actor with an item collection that behaves like Foundry's closely enough for the
// system's own code (create/update/delete items, conditions, heal, damage, cash, Heat, rolls with chosen results).
import './runtime-stub.mjs';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
export const J = f => JSON.parse(fs.readFileSync(`${root}data/${f}`, 'utf8'));
export const LIB = J('london-items.json').items;
export const libItem = (name, over = {}) => { const i = LIB.find(x => x.name === name); if (!i) throw new Error(`no library item ${name}`); return {...JSON.parse(JSON.stringify(i)), ...over}; };
const NS = 'the-smoke';
let n = 0; export const uid = () => `f${++n}`;
export const chat = [];
globalThis.ChatMessage = {implementation: {create: async d => { chat.push(d); return {id: uid(), ...d, getFlag: () => null}; }}, getSpeaker: () => ({})};
globalThis.fromUuid = async u => fakes.get(u) ?? null;
const fakes = new Map();

function makeItem(parent, data) {
  const item = {id: data._id ?? uid(), name: data.name, type: data.type, img: data.img, parent, system: JSON.parse(JSON.stringify(data.system ?? {})), flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    getFlag(ns, k) { return this.flags?.[ns]?.[k]; },
    async update(u) { for (const [k, v] of Object.entries(u)) { if (k === 'flags') { this.flags = {...this.flags, ...v}; continue; } setPath(this, k, v); } return this; },
    async delete() { parent._items.delete(this.id); return this; },
    async use() { const {useItem} = await import('../module/world/items.mjs'); return useItem(this); }};
  if (item.system.quantity == null && ['ammo', 'drug', 'consumable'].includes(item.type)) item.system.quantity = 1;
  return item;
}
export function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) o = (o[k] ??= {}); o[ks.at(-1)] = v; }

/** A character-like actor. `rolls` is a queue of outcome results the next rollStat/rollDialog calls return. */
export function fakeActor({name = 'Jaz', type = 'character', stats = {}, items = [], cash = 100, heat = 0, stage = 1, xp = 0, health = 10, owner = true} = {}) {
  const st = Object.fromEntries(['mus', 'grt', 'mov', 'whl', 'aim', 'grf', 'sav', 'frt', 'btl'].map(k => [k, {die: stats[k] ?? 4}]));
  const actor = {id: uid(), name, type, img: '', uuid: null, isOwner: owner, flags: {}, rolls: [], rolled: [], get isPerson() { return this.type !== 'vehicle'; },
    async setFlag(ns, k, v) { (this.flags[ns] ??= {})[k] = v; return this; }, async unsetFlag(ns, k) { delete this.flags[ns]?.[k]; return this; },
    system: {stats: st, stage, cash, stash: 0, heat: {value: heat}, rep: {crew: 0, street: 0, police: 0, xp}, resources: {health: {value: health, max: health}, hustle: {value: 3, max: 3}},
      guard: {base: 4, value: 9}, armour: 0, states: {}, creation: {done: false}, identity: {}},
    _items: new Map(),
    get items() { const arr = [...this._items.values()]; return Object.assign(arr, {get: id => this._items.get(id), contents: arr}); },
    getFlag(ns, k) { return this.flags?.[ns]?.[k]; },
    testUserPermission: () => owner,
    async update(u) { for (const [k, v] of Object.entries(u)) setPath(this, k, v); return this; },
    async createEmbeddedDocuments(_t, list) { return list.map(d => { const i = makeItem(this, d); this._items.set(i.id, i); return i; }); },
    async updateEmbeddedDocuments(_t, list) { for (const u of list) { const i = this._items.get(u._id); if (i) await i.update(Object.fromEntries(Object.entries(u).filter(([k]) => k !== '_id'))); } },
    async deleteEmbeddedDocuments(_t, ids) { for (const id of ids) this._items.delete(id); },
    async addCondition(name) { if (this.items.some(i => i.type === 'condition' && i.name === name)) return null; const [i] = await this.createEmbeddedDocuments('Item', [{name, type: 'condition', system: {}}]); return i; },
    async removeCondition(name) { const i = this.items.find(x => x.type === 'condition' && x.name === name); if (i) await i.delete(); },
    async heal(a) { const h = this.system.resources.health; h.value = Math.min(h.max, h.value + a); return h.value; },
    async applyDamage(a) { const h = this.system.resources.health; h.value = Math.max(0, h.value - a); if (!h.value) await this.addCondition('Down'); return h.value; },
    async changeCash(d, reason) { this.system.cash = Math.max(0, this.system.cash + d); chat.push({content: `CASH ${d} ${reason}`}); return this.system.cash; },
    async setHeat(v, reason) { this.system.heat.value = Math.max(0, Math.min(5, v)); chat.push({content: `HEAT ${v} ${reason}`}); return v; },
    changeHeat(d, reason) { return this.setHeat(this.system.heat.value + d, reason); },
    async reportCrime(crime, {witnessed = true, byPolice = false} = {}) { const {heatAfterCrime} = await import('../module/rules/core.mjs'); return this.setHeat(heatAfterCrime(this.system.heat.value, crime, {witnessed, byPolice}), crime); },
    async spendHustle(k) { if (this.system.resources.hustle.value < k) return false; this.system.resources.hustle.value -= k; return true; },
    async rollStat(stat, opts = {}) { const r = this.rolls.shift() ?? {outcomeKey: 'fullSuccess', total: 12, margin: 2}; this.rolled.push({stat, ...opts}); return {message: {id: uid()}, result: {stat, success: ['narrowSuccess', 'fullSuccess', 'strongSuccess', 'exceptionalSuccess'].includes(r.outcomeKey), explosions: 0, ...r}}; },
    rollDialog(stat, opts = {}) { return this.rollStat(stat, opts); }};
  actor.uuid = `Actor.${actor.id}`; fakes.set(actor.uuid, actor);
  for (const it of items) { const i = makeItem(actor, typeof it === 'string' ? libItem(it) : it); actor._items.set(i.id, i); }
  return actor;
}
export const itemNamed = (actor, name) => actor.items.find(i => i.name === name);
export const conditionNames = actor => actor.items.filter(i => i.type === 'condition').map(i => i.name).sort();
