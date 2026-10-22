// 0.5.23: every graffiti commission, end to end. The GM starts it; a player paints each named site through the real
// graffiti.paint handler, with the surface, commission and tag that Tag Studio picks; every objective must tick and the
// commission pass. The sat nav must point at the next site still to paint after every paint and after every GM tick
// (it used to fall back to the first site when the next one had no venue door to aim at). Then the ways a paint can
// fail to count must say why: too rough, free paint, a character not on the job; and the fixes for each.
import assert from 'node:assert/strict';
import process from 'node:process';
import path from 'node:path'; import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = true;
console.info = () => {};   // "restored n paintable surfaces" on every map
await import(`${ROOT}/tests/runtime-stub.mjs`);
const fs = await import('node:fs');
const NS = 'the-smoke', load = n => JSON.parse(fs.readFileSync(`${ROOT}/data/${n}`, 'utf8'));
const atlas = load('london-street-atlas.json'), catalogue = load('tagging-catalogue.json');
const gm = {id: 'gm', isGM: true, active: true, name: 'GM'}, player = {id: 'p1', isGM: false, active: true, name: 'Player'};
const users = [gm, player];
game.user = gm; game.users = Object.assign(users, {activeGM: gm, get: id => Array.prototype.find.call(users, u => u.id === id), filter: fn => Array.prototype.filter.call(users, fn), find: fn => Array.prototype.find.call(users, fn)});
const settings = new Map();
game.settings.get = (ns, key) => settings.get(key);
game.settings.set = async (ns, key, value) => { settings.set(key, JSON.parse(JSON.stringify(value))); if (key === 'missions' || key === 'factions') Hooks.callAll('smokeMissionsChanged'); return value; };
game.settings.register = (ns, k, o) => { if (!settings.has(k)) settings.set(k, o?.default); };
const chat = []; const messages = new Map();
globalThis.ChatMessage = {implementation: {create: async d => { const m = {...d, id: `m${chat.length}`}; chat.push(m); return m; }}, getSpeaker: () => ({})};
game.messages = {get: id => messages.get(id)};
game.time = {advance: async () => null};
globalThis.File = class { constructor(parts, name) { this.name = name; } };
foundry.applications.apps = {...(foundry.applications.apps || {}), FilePicker: {uploadPersistent: async (ns, dir, file) => ({path: `uploads/${file.name}`})}};
foundry.utils.setProperty ??= (o, k, v) => { const p = k.split('.'); let c = o; for (const x of p.slice(0, -1)) c = c[x] ??= {}; c[p.at(-1)] = v; };
let nextId = 0; const uid = p => `${p}${++nextId}`;
const flagsDoc = (o) => Object.assign(o, {
  getFlag(ns, k) { return this.flags?.[ns]?.[k]; },
  async setFlag(ns, k, v) { this.flags ??= {}; this.flags[ns] ??= {}; this.flags[ns][k] = JSON.parse(JSON.stringify(v)); return this; },
  async unsetFlag(ns, k) { delete this.flags?.[ns]?.[k]; return this; }
});
const actors = [];
const can = flagsDoc({id: 'can1', type: 'gear', name: 'Spray Paint', system: {quantity: 999}, flags: {}, async update(p) { if ('system.quantity' in p) this.system.quantity = p['system.quantity']; }, async delete() {}});
const char = flagsDoc({id: 'char1', uuid: 'Actor.char1', name: 'Patch', type: 'character', hasPlayerOwner: true, flags: {}, system: {rep: {street: 0, xp: 0}, heat: {value: 0}, cash: 0},
  items: [can], testUserPermission: () => true, isOwner: true,
  async update(p) { for (const [k, v] of Object.entries(p)) foundry.utils.setProperty(this, k, v); }, async reportCrime() {}, async changeCash(n) { this.system.cash += n; }});
actors.push(char);
game.actors = Object.assign(actors, {get: id => Array.prototype.find.call(actors, a => a.id === id), find: f => Array.prototype.find.call(actors, f), filter: f => Array.prototype.filter.call(actors, f), some: f => Array.prototype.some.call(actors, f)});
const vcat = load('london-vehicles.json').vehicles;
globalThis.Actor.implementation = {create: async data => {
  const a = flagsDoc({id: uid('a'), name: data.name, type: data.type, flags: data.flags || {}, system: data.system || {}, prototypeToken: data.prototypeToken || {},
    async getTokenDocument() { return {toObject: () => ({actorId: a.id, name: a.name, width: a.prototypeToken?.width ?? 1, height: a.prototypeToken?.height ?? 1, flags: {[NS]: {}}})}; }});
  actors.push(a); return a; }};
globalThis.Actor.create = globalThis.Actor.implementation.create;
function makeScene(map) {
  const tokens = [], tiles = [];
  const scene = flagsDoc({id: `sc-${map.id}`, name: map.name, width: map.width, height: map.height, grid: {size: 100}, flags: {[NS]: {streetAtlas: {id: map.id}, zoneGraph: {zones: map.zones}}},
    tokens: Object.assign(tokens, {get: id => tokens.find(t => t.id === id), find: fn => Array.prototype.find.call(tokens, fn), filter: fn => Array.prototype.filter.call(tokens, fn), some: fn => Array.prototype.some.call(tokens, fn)}),
    tiles: Object.assign(tiles, {get: id => Array.prototype.find.call(tiles, t => t.id === id)}),
    async createEmbeddedDocuments(type, data, options = {}) {
      const out = [];
      for (const d of data) {
        if (type === 'Tile') { const t = flagsDoc({...JSON.parse(JSON.stringify(d)), id: uid('tile')}); tiles.push(t); out.push(t); continue; }
        const doc = flagsDoc({rotation: 0, ...JSON.parse(JSON.stringify(d)), id: uid('t'), parent: scene});
        Object.defineProperty(doc, 'actor', {get() { return game.actors.get(this.actorId); }});
        doc.update = async patch => { for (const [k, v] of Object.entries(patch)) foundry.utils.setProperty(doc, k, v); return doc; };
        doc.updateSource = patch => { for (const [k, v] of Object.entries(patch)) foundry.utils.setProperty(doc, k, v); };
        Hooks.call('preCreateToken', doc, d, options, gm.id);
        tokens.push(doc); out.push(doc); Hooks.callAll('createToken', doc, options, gm.id);
      }
      return out;
    },
    async updateEmbeddedDocuments(type, ups) { const list = type === 'Tile' ? tiles : tokens; for (const u of ups) { const d = list.find(x => x.id === u._id); if (d) for (const [k, v] of Object.entries(u)) if (k !== '_id') foundry.utils.setProperty(d, k, v); } return []; },
    async deleteEmbeddedDocuments(type, ids) { const list = type === 'Tile' ? tiles : tokens; for (const id of ids) { const i = list.findIndex(t => t.id === id); if (i >= 0) list.splice(i, 1); } return []; }
  });
  return scene;
}
const scenes = atlas.maps.map(makeScene);
game.scenes = Object.assign(scenes, {get: id => Array.prototype.find.call(scenes, x => x.id === id), find: fn => Array.prototype.find.call(scenes, fn), filter: fn => Array.prototype.filter.call(scenes, fn), some: fn => Array.prototype.some.call(scenes, fn), size: scenes.length});
globalThis.canvas = {scene: scenes[0]};
const M = await import(`${ROOT}/module/world/missions.mjs`);
const G = await import(`${ROOT}/module/graffiti/runtime.mjs`);
const {dispatch} = await import(`${ROOT}/module/world/net.mjs`);
const S = await import(`${ROOT}/module/map/satnav.mjs`);
M.registerMissionSettings(); G.registerGraffitiSettings(); S.registerSatnavSettings();
G.installGraffiti();
const d = await S.satnavData();
const data = await M.missionData();
const tg = data.missions.filter(m => m.group === 'tagging');
const sceneOf = mapId => scenes.find(s => s.getFlag(NS, 'streetAtlas').id === mapId);
const siteOf = id => catalogue.sites.find(s => s.id === id);
const spotFor = siteId => { const site = siteOf(siteId); const sc = sceneOf(site.sceneMapId); return {sc, tok: sc?.tokens.find(t => t.getFlag(NS, 'tagSpot')?.siteId === siteId)}; };
const PC = await import(`${ROOT}/module/graffiti/paint-choices.mjs`);
function studioChoice(sc, tok, prev = {}) {
  const me = sc.tokens.find(t => t.actorId === char.id);
  const spots = sc.tokens.filter(t => !t.hidden && (t.getFlag(NS, 'tagSpot') || (t.actor?.type === 'vehicle' && /bus/i.test(t.actor?.name))));
  const r = PC.paintChoices({catalogue, missions: data.missions, states: M.missionState(), factions: M.factionState(), actor: char, actorToken: me, scene: sc, spots, draft: {...prev, spotTokenId: tok.id}, isGM: false});
  return {missionId: r.missionId, tagPackId: r.tagPackId, available: r.missions.map(m => m.id), hint: r.hint};
}
async function paint(sc, tok, quality, choice) {
  // stand right beside it
  let me = sc.tokens.find(t => t.actorId === char.id);
  for (const s of scenes) { const t = s.tokens.find(x => x.actorId === char.id); if (t && s !== sc) await s.deleteEmbeddedDocuments('Token', [t.id]); }
  if (!me) [me] = await sc.createEmbeddedDocuments('Token', [{actorId: char.id, name: char.name, x: tok.x, y: tok.y, width: 1, height: 1, flags: {}}]);
  Object.assign(me, {x: tok.x, y: tok.y});
  canvas.scene = sc;
  const spec = tok.getFlag(NS, 'tagSpot'), band = G.bandForTagSite({surface: spec.surface, approved: spec.approved === true});
  const attemptId = `att${String(++nextId).padStart(8, '0')}`, msgId = uid('msg');
  const roll = {context: {kind: 'tagPaint', attemptId, sceneId: sc.id, spotTokenId: tok.id, actorId: char.id}, actorUuid: char.uuid, userId: player.id, stat: 'grf', band, outcomeKey: quality};
  messages.set(msgId, flagsDoc({id: msgId, flags: {[NS]: {roll}}}));
  return dispatch('graffiti.paint', {sceneId: sc.id, spotTokenId: tok.id, actorId: char.id, rollMessageId: msgId, attemptId, tagPackId: choice.tagPackId, missionId: choice.missionId || null, design: {text: 'PATCH'}, userId: player.id});
}
const order = ['severeFailure', 'costlyFailure', 'narrowSuccess', 'fullSuccess', 'strongSuccess', 'exceptionalSuccess'];
const problems = []; const navProblems = [];
const navCheck = (m, label) => {
  const st = M.missionState()[m.id]; if (st?.status !== 'active') return;
  const t = S.missionTarget(d, m, st);
  const next = m.objectives.find(o => o.stop != null && !M.objectiveDone(o, st));
  if (next && (!t || t.stop !== m.stops[next.stop].code)) navProblems.push(`${m.id} ${label}: sat nav → ${t?.stop ?? t?.label ?? 'nothing'}, next is ${m.stops[next.stop].code}`);
};
for (const m of tg) {
  try { await dispatch('mission.start', {id: m.id, actorIds: [char.id], userId: gm.id}); } catch (e) { problems.push(`${m.id}: start failed: ${e.message}`); continue; }
  const policy = m.tagging.qualityPolicy || {}; let strongLeft = policy.atLeastOne ? Number(policy.strongMarksAtLeast || 1) : 0;
  let choice = {missionId: '', tagPackId: 'TAG-STREET'};
  for (const o of m.objectives.filter(x => x.stop != null)) {
    const siteId = m.stops[o.stop].code, {sc, tok} = spotFor(siteId);
    if (!sc) { problems.push(`${m.id}/${o.id}: no scene for ${siteId}`); continue; }
    if (!tok) { problems.push(`${m.id}/${o.id}: no paint surface placed for ${siteId} on ${sc.name}`); continue; }
    choice = studioChoice(sc, tok, choice);
    if (choice.missionId !== m.id) { problems.push(`${m.id}/${o.id}: Tag Studio would not select this commission at ${siteId} (offers: ${choice.available.join(',') || 'none'})`); choice.missionId = m.id; }
    const need = o.auto.minQuality || 'narrowSuccess'; let q = need;
    if (strongLeft > 0) { q = order.indexOf('strongSuccess') > order.indexOf(need) ? 'strongSuccess' : need; strongLeft--; }
    try { await paint(sc, tok, q, choice); } catch (e) { problems.push(`${m.id}/${o.id}: paint at ${siteId} (${tok.actor?.type ?? 'marker'}) failed: ${e.message}`); continue; }
    const st = M.missionState()[m.id];
    if (st?.status === 'active' && !M.objectiveDone(o, st)) problems.push(`${m.id}/${o.id}: painted ${siteId} at ${q} with ${choice.tagPackId} but the objective did not tick`);
    navCheck(m, `after painting ${siteId}`);
  }
  const st = M.missionState()[m.id];
  if (st?.status !== 'done') problems.push(`${m.id}: not passed after painting every site (status ${st?.status}; ticks ${JSON.stringify(st?.ticks)})`);
  else if (!QUIET) console.log(`ok ${m.id}`);
}
// GM manual ticks: the sat nav must follow the next unticked site.
for (const m of tg.filter(x => x.objectives.filter(o => o.stop != null).length > 1)) {
  await dispatch('mission.set', {id: m.id, status: 'reset', userId: gm.id});
  await dispatch('mission.start', {id: m.id, actorIds: [char.id], userId: gm.id});
  navCheck(m, 'at start');
  for (const o of m.objectives.filter(x => x.stop != null).slice(0, -1)) { await dispatch('mission.tick', {id: m.id, objId: o.id, userId: gm.id}); navCheck(m, `after GM ticked ${o.id}`); }
  await dispatch('mission.set', {id: m.id, status: 'reset', userId: gm.id});
}
assert.deepEqual(problems, [], 'every commission passes when painted as Tag Studio picks');
assert.deepEqual(navProblems, [], 'the sat nav always points at the next site still to paint');

/* ---------------------------------------------------------------- when a paint does not count, say why */
const lastCard = () => chat.filter(c => /SPRAYED THE CITY/.test(c.content ?? '')).at(-1)?.content ?? '';
const fresh = async id => { await dispatch('mission.set', {id, status: 'reset', userId: gm.id}); await dispatch('mission.start', {id, actorIds: [char.id], userId: gm.id}); return data.missions.find(m => m.id === id); };
// too rough: TG-CH-02 needs Sorted at every site
let m = await fresh('tg-ch-02'); let {sc, tok} = spotFor('SP-HB-ODDMENTS'), ch = studioChoice(sc, tok);
assert.equal(ch.missionId, 'tg-ch-02'); assert.equal(ch.tagPackId, 'TAG-CH');
assert.match(ch.hint, /Counts for TG-CH-02 at Sorted or better, with the Chainring Cog tag/);
let out = await paint(sc, tok, 'narrowSuccess', ch);
assert.equal(M.objectiveDone(m.objectives[0], M.missionState()['tg-ch-02']), false, 'Just About does not count on a Sorted job');
assert.match(out.note, /needs Sorted or better here; this one was Just About\. Paint over it/); assert.match(lastCard(), /Doesn't count yet/);
out = await paint(sc, tok, 'fullSuccess', studioChoice(sc, tok)); assert.equal(out.note, '', 'painted over at Sorted: it counts');
assert.equal(M.objectiveDone(m.objectives[0], M.missionState()['tg-ch-02']), true);
assert.match(studioChoice(sc, tok).hint, /already has this site\. Still to paint: .*Lea Bridge/);
// free paint at a commission's site
out = await paint(sc, tok, 'fullSuccess', {missionId: '', tagPackId: 'TAG-STREET'});
assert.match(out.note, /free paint, so it doesn't count for TG-CH-02/);
assert.equal(studioChoice(sc, tok, {missionId: '', missionPicked: true}).missionId, '', 'a player who picks free paint keeps it');
// a character who is not on the job
const pal = flagsDoc({...char, id: 'char2', uuid: 'Actor.char2', name: 'Lou', flags: {}, system: {rep: {street: 0, xp: 0}, heat: {value: 0}, cash: 0}, items: [can]});
actors.push(pal);
const asPal = (sc2, tok2, prev = {}) => PC.paintChoices({catalogue, missions: data.missions, states: M.missionState(), factions: M.factionState(), actor: pal, scene: sc2, spots: [tok2], draft: {...prev, spotTokenId: tok2.id}});
({sc, tok} = spotFor('SP-CL-LEABRIDGE'));
assert.equal(asPal(sc, tok).missionId, ''); assert.match(asPal(sc, tok).hint, /TG-CH-02 needs this surface, but Lou is not on that job/);
await dispatch('mission.crew', {id: 'tg-ch-02', actorIds: [char.id, pal.id], userId: gm.id});
assert.equal(asPal(sc, tok).missionId, 'tg-ch-02', 'added on the Mission Board: the job is offered');
await assert.rejects(() => dispatch('mission.crew', {id: 'tg-ch-02', actorIds: [], userId: gm.id}), /Tick at least one/);
// Tag Studio starts on the surface a job needs, not on whatever bus drove past first
({sc, tok} = spotFor('SP-CL-LEABRIDGE'));
const bus = vcat.find(v => v.id === 'LV28'), busActor = await Actor.implementation.create({name: bus.name, type: 'vehicle', system: bus.system, prototypeToken: bus.token, flags: {[NS]: {catalogId: 'LV28'}}});
const [traffic] = await sc.createEmbeddedDocuments('Token', [{actorId: busActor.id, name: bus.name, x: 0, y: 0, width: 2, height: 6, flags: {[NS]: {traffic: true}}}]);
const meTok = sc.tokens.find(t => t.actorId === char.id) ?? (await sc.createEmbeddedDocuments('Token', [{actorId: char.id, name: char.name, x: 0, y: 0, width: 1, height: 1, flags: {}}]))[0];
Object.assign(meTok, {x: traffic.x, y: traffic.y});
const auto = PC.paintChoices({catalogue, missions: data.missions, states: M.missionState(), factions: M.factionState(), actor: char, actorToken: meTok, scene: sc, spots: [traffic, tok], draft: {}});
assert.equal(auto.spot.id, tok.id, 'the commission site, even with a bus right next to you');
// the job decides the tag: a faction tag left selected doesn't spoil an intro job
m = await fresh('tg-intro-01'); ({sc, tok} = spotFor('SP-HC-MORNING-WALL'));
assert.equal(studioChoice(sc, tok, {tagPackId: 'TAG-CH'}).tagPackId, 'TAG-STREET');
await dispatch('mission.set', {id: 'tg-intro-01', status: 'reset', userId: gm.id});
// standing beside the end of a bus parked side-on is beside it
const {rectDistanceSquares} = await import(`${ROOT}/module/graffiti/core.mjs`);
assert.ok(rectDistanceSquares({x: 720, y: 560, width: 1, height: 1}, {x: 300, y: 300, width: 2, height: 6, rotation: 90}) < 1.6, 'side-on bus: its end is within reach');
assert.ok(rectDistanceSquares({x: 720, y: 560, width: 1, height: 1}, {x: 300, y: 300, width: 2, height: 6, rotation: 0}) > 1.6);
console.log('tagging missions end to end: all 42 commissions pass as Tag Studio picks; sat nav follows every next site after paints and GM ticks; too-rough, free-paint and not-on-the-job paints say why; crew can be changed; the nearest needed surface and the job’s own tag are chosen; side-on buses are in reach — ok');
process.exit(0);
