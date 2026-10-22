// The campaign venues: 160 interiors and 51 approach insets, their street-map entrance pins, transit between them, the
// Scenes folders they import into, the Mission Board's links to them, and the Campaign Cast.
import './runtime-stub.mjs';
import assert from 'assert/strict';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const J = f => JSON.parse(fs.readFileSync(`${root}data/${f}`, 'utf8'));
const NS = 'the-smoke';
const atlas = J('london-street-atlas.json'), venues = J('london-venues.json'), missions = J('london-missions.json'), cast = J('london-cast.json').cast;
const V = venues.maps.filter(m => m.kind === 'venue'), A = venues.maps.filter(m => m.kind === 'approach');
const byId = new Map([...atlas.maps, ...venues.maps].map(m => [m.id, m]));
const inside = (p, r) => p[0] >= r[0] && p[0] < r[0] + r[2] && p[1] >= r[1] && p[1] < r[1] + r[3];
const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/* ---------------------------------------------------------------- the maps */
assert.equal(V.length, 160); assert.equal(A.length, 51);
assert.equal(new Set(venues.maps.map(m => m.id)).size, 211, 'unique ids');
const LINKS = [[1, 2], [2, 3], [2, 4], [3, 5], [4, 5], [5, 6], [1, 6]];
for (const v of V) {
  const rooms = v.zones.filter(z => z.code);
  assert.equal(rooms.length, 6, `${v.code}: six rooms`);
  assert.deepEqual(rooms.map(z => z.code), [1, 2, 3, 4, 5, 6].map(n => `${v.code}.${n}`), `${v.code}: rooms keyed ${v.code}.1–6`);
  assert.equal(v.zones.length, 7, `${v.code}: six rooms and the way in`);
  for (const [a, b] of LINKS) assert.ok(rooms[a - 1].adjacent.includes(rooms[b - 1].id), `${v.code}: ${a} connects to ${b}`);
  assert.equal(rooms[0].arrival, 'entry'); assert.equal(rooms[5].arrival, 'rear');
  for (const z of v.zones) assert.ok(z.rect[0] >= 0 && z.rect[1] >= 0 && z.rect[0] + z.rect[2] <= v.width && z.rect[1] + z.rect[3] <= v.height, `${v.code} ${z.id} on the map`);
  for (let i = 0; i < v.zones.length; i++) for (let k = i + 1; k < v.zones.length; k++) assert.ok(!overlaps(v.zones[i].rect, v.zones[k].rect), `${v.code}: ${v.zones[i].id} / ${v.zones[k].id} do not overlap`);
  assert.deepEqual(v.links.map(l => l.key), ['STREET', 'REAR'], `${v.code}: a way out at the front and the back`);
  const out = v.approach ?? v.street;
  for (const l of v.links) {
    assert.equal(l.kind, 'exit'); assert.equal(l.to, out, `${v.code} ${l.key} leads to ${out}`);
    const t = byId.get(l.to); assert.ok(l.land[0] > 0 && l.land[1] > 0 && l.land[0] < t.width && l.land[1] < t.height, `${v.code} ${l.key} lands on the map`);
    assert.ok(!t.links.some(x => x.to === v.id && inside(l.land, x.rect)), `${v.code} ${l.key}: you do not land back in the doorway`);
    assert.ok(l.rect[0] >= 0 && l.rect[1] >= 0 && l.rect[0] + l.rect[2] <= v.width && l.rect[1] + l.rect[3] <= v.height);
  }
  assert.ok(fs.statSync(`${root}assets/maps/${v.file}`).size > 40000, `${v.file}`); assert.ok(fs.existsSync(`${root}assets/maps/${v.thumb}`), `${v.thumb}`);
  assert.ok([[32, 24], [40, 28], [44, 28], [48, 32], [40, 24], [36, 16]].some(([w, h]) => v.width === w * 100 && v.height === h * 100), `${v.code}: a brief size`);
}
assert.equal(V.filter(v => v.approach).length, 59, '59 venues sit behind an approach'); assert.equal(V.filter(v => !v.approach).length, 101);
for (const a of A) {
  assert.ok(a.serves.length >= 1 && a.serves.length <= 2);
  assert.deepEqual(a.links.map(l => l.key), ['STREET', ...a.serves.flatMap(() => ['ENTRY', 'SERVICE'])]);
  assert.equal(a.links[0].to, a.street);
  for (const l of a.links.slice(1)) {
    const v = byId.get(l.to); assert.equal(v.kind, 'venue'); assert.equal(v.approach, a.id);
    const back = v.links.find(x => x.key === (l.key === 'ENTRY' ? 'STREET' : 'REAR'));
    assert.ok(!inside(back.land, l.rect), `${a.code}: coming out of ${v.code} you stand outside its pin`);
    assert.ok(!v.links.some(x => inside(l.land, x.rect)), `${a.code} → ${v.code}: you arrive inside, clear of its ways out`);
  }
  assert.ok(fs.statSync(`${root}assets/maps/${a.file}`).size > 40000, a.file);
}
// the entrance pins on the twenty street maps: one per frontage venue and one per approach, clear of each other
const pins = atlas.maps.flatMap(m => m.links.filter(l => l.venue).map(l => ({...l, map: m})));
assert.equal(pins.length, 101 + 51);
assert.deepEqual(new Set(pins.map(p => p.to)), new Set([...V.filter(v => !v.approach), ...A].map(m => m.id)));
for (const p of pins) {
  const t = byId.get(p.to);
  const arrive = t.zones.find(z => z.kind === 'street'); assert.ok(inside(p.land, arrive.rect), `${p.to}: you arrive on its frontage`);
  assert.ok(!t.links.some(l => inside(p.land, l.rect)), `${p.to}: clear of its ways out`);
  assert.ok(p.rect[0] >= 100 && p.rect[1] >= 100 && p.rect[0] + p.rect[2] <= p.map.width - 100 && p.rect[1] + p.rect[3] <= p.map.height - 100, `${p.to} pin on ${p.map.id}`);
  assert.ok(inside(p.land, [0, 0, t.width, t.height]));
  assert.equal(t.street, p.map.id, `${p.to} is pinned on its own street map`);
}
for (const m of atlas.maps) { const ps = m.links.filter(l => l.kind === 'door'); for (let i = 0; i < ps.length; i++) for (let k = i + 1; k < ps.length; k++) assert.ok(!overlaps(ps[i].rect, ps[k].rect), `${m.id}: ${ps[i].to} / ${ps[k].to}`); }
// every venue's way out lands on (or just beside) its own street pin
for (const m of [...V.filter(v => !v.approach), ...A]) { const pin = pins.find(p => p.to === m.id); for (const l of m.links.filter(l => l.to === m.street)) { assert.ok(!inside(l.land, pin.rect) && Math.hypot(l.land[0] - pin.rect[0] - 100, l.land[1] - pin.rect[1] - 100) <= 180, `${m.code} ${l.key}: out beside its pin`); } }

/* ---------------------------------------------------------------- transit and the Scenes folders */
let n = 0; const id = () => `id${++n}`;
const folders = [], scenes = [];
const docOf = (m, pack) => ({uuid: `Compendium.${NS}.${pack}.Scene.${m.id}`, name: m.name, flags: {[NS]: pack === 'london-streets' ? {streetAtlas: {id: m.id, code: m.code, col: m.col, row: m.row}} : {place: {id: m.id, code: m.code, kind: m.kind || 'place', districtCode: m.districtCode, district: m.district, approach: m.approach ?? null}}}});
const packs = {[`${NS}.london-streets`]: [...J('london-overview.json').maps, ...atlas.maps].map(m => docOf(m, 'london-streets')), [`${NS}.london-places`]: J('london-places.json').maps.map(m => docOf(m, 'london-places')), [`${NS}.london-venues`]: venues.maps.map(m => docOf(m, 'london-venues'))};
const mkScene = d => { const s = {...d, id: id(), width: 3200, height: 2400, grid: {size: 100}, levels: {contents: [{id: 'lvl', background: {src: 'x'}}]}, initialLevel: {id: 'lvl', background: {src: 'x'}},
  getFlag: (ns, k) => d.flags?.[ns]?.[k], get folder() { return folders.find(f => f.id === this._folder) ?? null; }, async update(u) { if ('folder' in u) this._folder = u.folder; if ('sort' in u) this.sort = u.sort; }};
  s._folder = d.folder ?? null; return s; };
globalThis.Folder = {implementation: {create: async d => { const f = {...d, id: id(), get folder() { return folders.find(x => x.id === d.folder) ?? null; }, async update(u) { Object.assign(this, u); }}; folders.push(f); return f; }}};
game.folders = folders; game.user = {id: 'gm', isGM: true};
game.scenes = Object.assign(scenes, {fromCompendium: doc => ({name: doc.name, flags: JSON.parse(JSON.stringify(doc.flags))})});
game.packs = {get: key => packs[key] ? {getDocuments: async () => packs[key]} : null};
globalThis.getDocumentClass = () => ({createDocuments: async list => { const made = list.map(mkScene); scenes.push(...made); return made; }});
const T = await import('../module/map/map-transit.mjs');
const all = await T.importAllMaps({notify: false});
assert.equal(all.created, 25, 'importing every map brings the streets and the four core interiors, not the 211 venue maps');
const made = await T.importVenueMaps(['LDV-HB1', 'LDV-DA1', 'LDV-HB2'], {notify: false});
assert.deepEqual(made.map(s => s.flags[NS].place.id), ['LDV-HB1', 'LDA-HB1', 'LDV-DA1', 'LDV-HB2'], 'a venue comes with its approach');
const vroot = folders.find(f => f.name === T.VENUE_FOLDER), hb = folders.find(f => f.name === 'HB · Highbury & Albion Rd'), da = folders.find(f => f.name === 'DA · Dalston');
assert.ok(vroot && hb && da && hb.folder?.id === vroot.id && da.folder?.id === vroot.id, 'The Smoke — Venues, a folder per district');
assert.ok(hb.sort < da.sort, 'districts in campaign order');
const sc = id => scenes.find(s => s.flags[NS].place?.id === id);
assert.deepEqual(['LDV-HB1', 'LDA-HB1', 'LDV-HB2'].map(id => sc(id).sort), [1000, 1500, 2000], 'HB1, then its approach, then HB2');
assert.equal((await T.importVenueMaps(['LDV-HB1'], {notify: false})).length, 2); assert.equal(scenes.length, 29, 'nothing imported twice');
const ws5 = await T.findOrImportScene('LDV-WS5'); assert.equal(ws5.flags[NS].place.id, 'LDV-WS5', 'walking through a door imports the venue');
let loadedAll = 0, byIndex = 0; const vdocs = packs[`${NS}.london-venues`].map((d, i) => ({...d, _id: `v${i}`}));
game.packs = {get: key => key === `${NS}.london-venues` ? {getDocuments: async () => (loadedAll++, vdocs), getIndex: async () => vdocs.map(d => ({_id: d._id, flags: d.flags})), getDocument: async id => (byIndex++, vdocs.find(d => d._id === id))} : packs[key] ? {getDocuments: async () => packs[key]} : null};
const st1 = await T.findOrImportScene('LDV-ST1'); assert.equal(st1.flags[NS].place.id, 'LDV-ST1'); assert.deepEqual([byIndex, loadedAll], [1, 0], 'found through the pack index, without loading all 211 scenes');
game.packs = {get: key => packs[key] ? {getDocuments: async () => packs[key]} : null};
// destinations and parking
const {atlas: at2, venues: v2} = await T.loadAtlas(); assert.equal(v2.maps.length, 211);
const dests = await T.transitDestinations(), vd = dests.filter(d => d.group.startsWith('Venues'));
assert.equal(vd.length, 160); assert.ok(vd.some(d => d.group === 'Venues · HB Highbury & Albion Rd' && d.short === 'HB1 Clissold House'));
assert.deepEqual(vd.find(d => d.mapId === 'LDV-HB1').land, byId.get('LDA-HB1').links.find(l => l.to === 'LDV-HB1' && l.key === 'ENTRY').land);
const park = await T.parkingFor('LDV-HB1'), gate = atlas.maps.find(m => m.id === 'LDN-HIGHBURY').links.find(l => l.to === 'LDA-HB1');
assert.deepEqual(park, {mapId: 'LDN-HIGHBURY', land: [gate.rect[0] + 100, gate.rect[1] + 100]}, 'you park at the park gate');
assert.equal(T.streetDoorOf(at2, v2, 'LDV-DA1').link.to, 'LDV-DA1');
// standing in a venue's front way out takes you back to the street
const hb2 = byId.get('LDV-HB2'), front = hb2.links[0];
const link = T.linkAt({grid: {size: 100}, getFlag: (ns, k) => k === 'place' ? hb2 : null}, {x: front.rect[0] + 50, y: front.rect[1] + 50, width: 1, height: 1});
assert.equal(link.to, 'LDN-HIGHBURY');

/* ---------------------------------------------------------------- missions */
for (const m of missions.missions) for (const s of m.stops || []) if (s.placeId) {
  assert.ok(byId.get(s.placeId), `${m.id} stop ${s.code}`); assert.equal(byId.get(s.placeId).code, s.code);
  if (s.approach) assert.equal(byId.get(s.placeId).approach, s.approach);
}
assert.ok(missions.missions.every(m => (m.locations || []).every(l => l.mapped)), 'every place a mission visits is mapped');
for (const m of missions.missions) for (const o of m.objectives) for (const id of o.auto?.mapIds || []) assert.ok(byId.get(id), `${m.id} ${o.id} ticks on ${id}`);

/* ---------------------------------------------------------------- the cast */
assert.ok(cast.length >= 110);
assert.equal(new Set(cast.map(c => c.key)).size, cast.length, 'one entry per person');
for (const c of cast) { assert.ok(fs.existsSync(`${root}${c.img.replace(`systems/${NS}/`, '')}`), c.img); assert.ok(c.system.stats.sav.die >= 4 && c.system.resources.health.max >= 8); }
for (const v of V) assert.ok(cast.some(c => c.venues.includes(v.code)), `${v.code} has its contact in the cast`);
const patrons = cast.filter(c => c.patron).map(c => c.key);
for (const k of ['jules-akin', 'owen-pike', 'mara-boyd', 'clement-wren', 'victor-randle', 'pearl-okonkwo', 'rosa-baptiste', 'celia-voss', 'ada-march', 'auntie-pat', 'harriet-vale']) assert.ok(patrons.includes(k), k);
assert.equal(cast.find(c => c.key === 'auntie-pat').existing, 'pat', 'the opening\'s people keep their actors');
const nm7 = missions.missions.find(m => m.code === 'NM7');
assert.deepEqual(nm7.cast.map(c => c.key), ['pearl-okonkwo', 'della-finch', 'malcolm-reed']); assert.match(nm7.img, /cast-pearl-okonkwo/);
assert.match(missions.missions.find(m => m.code === 'LB3').img, /cast-tessa-price/, 'Moth is Tessa "Moth" Price');
// bringing the cast in
const actors = []; const ctx = {created: 0};
game.actors = Object.assign(actors, {fromCompendium: d => JSON.parse(JSON.stringify({name: d.name, type: 'npc', flags: d.flags}))});
globalThis.Actor = {implementation: {create: async d => { ctx.created++; const a = {...d, id: id(), getFlag: (ns, k) => d.flags?.[ns]?.[k]}; actors.push(a); return a; }}};
const castDocs = cast.filter(c => !c.existing).map(c => ({name: c.name, getFlag: (ns, k) => ({castKey: c.key})[k], flags: {[NS]: {castKey: c.key, npcKey: `cast-${c.key}`}}}));
packs[`${NS}.campaign-cast`] = castDocs;
actors.push({id: 'pat', name: 'Auntie Pat', getFlag: (ns, k) => ({npcKey: 'pat'})[k]});
globalThis.fetch = async url => { const p = String(url).replace(/^systems\/the-smoke\//, root); return {ok: fs.existsSync(p), json: async () => JSON.parse(fs.readFileSync(p, 'utf8'))}; };
const C = await import('../module/world/cast.mjs');
const brought = await C.importCast(['pearl-okonkwo', 'della-finch', 'auntie-pat', 'pearl-okonkwo'], {notify: false});
assert.deepEqual(brought.map(a => a.name), ['Pearl Okonkwo', 'Della Finch', 'Auntie Pat']); assert.equal(ctx.created, 2, 'Pat is already in the world');
const castRoot = folders.find(f => f.name === C.CAST_FOLDER), nmf = folders.find(f => f.name === 'The Night Market'), contacts = folders.find(f => f.name === 'Venue contacts');
assert.ok(castRoot && nmf?.folder?.id === castRoot.id && contacts?.folder?.id === castRoot.id, 'filed by faction, contacts together');
await C.importCast(['della-finch'], {notify: false}); assert.equal(ctx.created, 2, 'nobody brought in twice');

/* ---------------------------------------------------------------- an older world's journals catch up */
const {textHash} = await import('../module/text-hash.mjs'), {updateGuide} = await import('../module/content.mjs');
const bundle = J('content.json'), reg = bundle.journals.find(j => j.flags[NS].contentKey === 'venue-register');
const hist = J('guide-history.json');
assert.ok((hist['venue-register|HB · Highbury and Albion Rd'] || []).length >= 1, 'the 0.3.0 Venue Register pages are fingerprinted');
assert.ok(reg.pages.every(p => p.flags[NS].textHash === textHash(p.text.content)), 'shipped pages carry their fingerprint');
assert.equal(textHash('<p>Clissold&nbsp;House  NEED MAP</p>'), textHash('<div>Clissold House — NEED MAP</div>'), 'markup and spacing do not count');
const old = '<div class="smoke-journal"><h2>HB1 · Clissold House <small class="sj-needmap">NEED MAP</small></h2></div>';
const mk = (name, content, flags = {}) => ({id: name, name, text: {content}, flags: {[NS]: flags}});
const pg = [mk('HB · Highbury and Albion Rd', old, {textHash: textHash(old)}), mk('SN · Stoke Newington and Shacklewell', old + '<p>My notes: Della owes the crew.</p>', {textHash: textHash(old)}), mk('How to Use the Register', reg.pages[0].text.content)];
const upd = []; const entry = {flags: {[NS]: {guideEdition: reg.flags[NS].guideEdition}}, ownership: {default: 0}, pages: pg, update: async () => null, createEmbeddedDocuments: async () => null, updateEmbeddedDocuments: async (t, list) => upd.push(...list)};
game.users = []; const refreshed = await updateGuide(entry, reg);
assert.equal(refreshed, 1, 'same-edition setup refreshes an untouched page');
assert.ok(upd.some(u => u._id === 'HB · Highbury and Albion Rd' && u['text.content']?.includes('sj-venue-map')), 'with the maps');
assert.ok(!upd.some(u => u._id === 'SN · Stoke Newington and Shacklewell' && u['text.content']), 'same-edition GM edits are left alone; new-edition backup/refresh is covered separately');

/* ---------------------------------------------------------------- compendium (when the build tools are installed) */
try {
  const {ClassicLevel} = await import('/home/claude/build/node_modules/classic-level/index.js');
  for (const [pack, want] of [['london-venues', 211], ['campaign-cast', cast.filter(c => !c.existing).length]]) {
    // read a copy: opening LevelDB in place would leave lock and log files in the shipped pack
    const os = await import('os'), copy = fs.mkdtempSync(`${os.tmpdir()}/smoke-pack-`); fs.cpSync(`${root}packs/${pack}`, copy, {recursive: true});
    const db = new ClassicLevel(copy, {valueEncoding: 'json'}); let k = 0;
    for await (const key of db.keys()) if (/^!(scenes|actors)![^.]+$/.test(key)) k++;
    await db.close(); fs.rmSync(copy, {recursive: true, force: true}); assert.equal(k, want, pack);
  }
} catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
console.log(`venues: 160 interiors and 51 approaches, ${pins.length} street pins, transit, folders, mission stops and a cast of ${cast.length} — ok`);
process.exit(0);
