// Minimal Foundry v14 stand-ins so every module can be imported and the init/ready hooks run outside Foundry.
const hooks = {};
globalThis.Hooks = {on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f), callAll: (n, ...a) => (hooks[n] || []).forEach(f => f(...a)), call: (n, ...a) => (hooks[n] || []).every(f => f(...a) !== false), _all: hooks};
class Field { constructor(...a) { this.args = a; } }
const fields = Object.fromEntries(['ArrayField', 'BooleanField', 'HTMLField', 'NumberField', 'ObjectField', 'SchemaField', 'StringField'].map(n => [n, class extends Field {}]));
class App { static DEFAULT_OPTIONS = {}; render() { return this; } }
globalThis.foundry = {
  data: {fields}, abstract: {TypeDataModel: class {}},
  applications: {api: {ApplicationV2: App, HandlebarsApplicationMixin: c => class extends c {}, DialogV2: {input: async () => null, wait: async () => null}},
    sheets: {ActorSheetV2: App, ItemSheetV2: App}, apps: {DocumentSheetConfig: {registerSheet: () => null}}, ux: {TextEditor: {implementation: {enrichHTML: async s => s}}}, hud: {}},
  documents: {Actor: class {}, Item: class {}},
  utils: {isNewerVersion: (a, b) => String(a).split('.').map(Number).reduce((r, x, i) => r ?? (x > (String(b).split('.').map(Number)[i] ?? 0) ? true : x < (String(b).split('.').map(Number)[i] ?? 0) ? false : null), null) ?? false, escapeHTML: s => String(s), deepClone: o => JSON.parse(JSON.stringify(o)), randomID: () => Math.random().toString(36).slice(2, 12), mergeObject: (a, b) => Object.assign(a, b), setProperty: () => true, getProperty: () => undefined, hasProperty: (o, k) => String(k).split('.').reduce((x, p) => x == null ? undefined : x[p], o) !== undefined},
  canvas: {placeables: {Token: class { _onClickRight() {} }}}
};
globalThis.Actor = class {}; globalThis.Item = class {};
globalThis.Token = class { _onClickRight() {} };
globalThis.CONFIG = {Actor: {dataModels: {}}, Item: {dataModels: {}}, Combat: {}, Combatant: {}, Canvas: {lightAnimations: {}}};
globalThis.Handlebars = {helpers: {}, registerHelper(k, f) { this.helpers[k] = f; }};
const settings = new Map();
globalThis.game = {
  user: {id: 'gm', isGM: true, targets: new Set()}, users: Object.assign([{id: 'gm', isGM: true, active: true}], {activeGM: {id: 'gm'}}),
  settings: {register: (ns, k, o) => settings.set(`${ns}.${k}`, o?.default), registerMenu: () => null, get: (ns, k) => settings.get(`${ns}.${k}`), set: async (ns, k, v) => settings.set(`${ns}.${k}`, v)},
  socket: {on: () => null, emit: () => null}, keybindings: {register: () => null}, journal: [], system: {packs: []}, scenes: [], actors: Object.assign([], {get: () => null}), items: [], folders: [], messages: {get: () => null}, packs: {get: () => null}, combats: []
};
globalThis.ui = {notifications: {info: console.log, warn: console.warn, error: console.error}};
globalThis.fetch = async url => { const fs = await import('fs'); const p = String(url).replace(/^systems\/the-smoke\//, new URL('..', import.meta.url).pathname); return {ok: fs.existsSync(p), json: async () => JSON.parse(fs.readFileSync(p, 'utf8'))}; };
globalThis.document = undefined;
globalThis.ChatMessage = {implementation: {create: async d => d}, getSpeaker: () => ({})};
globalThis.Folder = {implementation: {create: async d => d}};
export {hooks};
