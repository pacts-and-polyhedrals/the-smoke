// Every London map is imported into the world and filed north to south; a 0.1.0 world gets the rest added.
import './runtime-stub.mjs';
import assert from 'assert';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const J = f => JSON.parse(fs.readFileSync(`${root}data/${f}`, 'utf8'));
const NS = 'the-smoke';

// Compendium documents shaped as build-packs.mjs writes them.
const atlas = [...J('london-overview.json').maps, ...J('london-street-atlas.json').maps];
const places = J('london-places.json').maps;
const streetDocs = atlas.map(m => ({uuid: `Compendium.${NS}.london-streets.Scene.${m.id}`, name: m.name, flags: {[NS]: {streetAtlas: {id: m.id, code: m.code, col: m.col, row: m.row}}}}));
const placeDocs = places.map(m => ({uuid: `Compendium.${NS}.london-places.Scene.${m.id}`, name: m.name, flags: {[NS]: {place: {id: m.id, code: m.code}}}}));
const packs = {[`${NS}.london-streets`]: streetDocs, [`${NS}.london-places`]: placeDocs};

let n = 0; const id = () => `id${++n}`;
const folders = [], scenes = [];
const mkScene = d => { const s = {...d, id: id(), levels: {contents: [{id: 'lvl', background: {src: 'x'}}]}, initialLevel: {id: 'lvl', background: {src: 'x'}},
  getFlag: (ns, k) => d.flags?.[ns]?.[k], get folder() { return folders.find(f => f.id === this._folder) ?? null; }, async update(u) { if ('folder' in u) this._folder = u.folder; if ('sort' in u) this.sort = u.sort; }};
  s._folder = d.folder ?? null; return s; };
globalThis.Folder = {implementation: {create: async d => { const f = {...d, id: id(), get folder() { return folders.find(x => x.id === d.folder) ?? null; }, async update(u) { Object.assign(this, u); }}; folders.push(f); return f; }}};
game.folders = folders;
game.scenes = Object.assign(scenes, {fromCompendium: doc => ({name: doc.name, flags: JSON.parse(JSON.stringify(doc.flags))})});
game.packs = {get: key => packs[key] ? {getDocuments: async () => packs[key]} : null};
globalThis.getDocumentClass = () => ({createDocuments: async list => { const made = list.map(mkScene); scenes.push(...made); return made; }});

const {importAllMaps, ROW_FOLDERS, STREET_FOLDER, PLACE_FOLDER} = await import('../module/map/map-transit.mjs');

// A world set up with 0.1.0: Hackney loose in the streets folder, the overview, the four interiors.
const oldStreets = await Folder.implementation.create({name: STREET_FOLDER, type: 'Scene', folder: null, sorting: 'a'});
const oldPlaces = await Folder.implementation.create({name: PLACE_FOLDER, type: 'Scene', folder: null, sorting: 'a'});
for (const d of [...streetDocs.filter(d => ['LDN-HACKNEY', 'LDN-OVERVIEW'].includes(d.flags[NS].streetAtlas.id))]) scenes.push(mkScene({...d, folder: oldStreets.id}));
for (const d of placeDocs) scenes.push(mkScene({...d, folder: oldPlaces.id}));
// One scene the GM filed somewhere of their own: it must stay put.
const mine = await Folder.implementation.create({name: 'Session 3', type: 'Scene', folder: null});
const flat = scenes.find(s => s.flags[NS].place?.id === 'LDP-FLAT'); flat._folder = mine.id;

const result = await importAllMaps({notify: false});
assert.equal(result.created, 19, 'the 19 street maps the old world lacked are imported');
assert.equal(scenes.length, 25, 'overview + 20 street maps + 4 interiors');
const ids = new Set(scenes.map(s => (s.flags[NS].streetAtlas || s.flags[NS].place).id));
assert.equal(ids.size, 25, 'no duplicates');

const sceneFolders = folders.filter(f => f.type === 'Scene');
assert.equal(sceneFolders.filter(f => f.name === STREET_FOLDER).length, 1, 'the streets folder is reused, not duplicated');
assert.equal(oldStreets.sorting, 'm', 'streets folder switched to manual order');
const bands = ROW_FOLDERS.map(name => sceneFolders.find(f => f.name === name));
assert.ok(bands.every(b => b && b.folder?.id === oldStreets.id), 'four row folders inside the streets folder');
assert.deepEqual(bands.map(b => b.sort), [1000, 2000, 3000, 4000], 'rows run north to south');

const byId = Object.fromEntries(scenes.map(s => [(s.flags[NS].streetAtlas || s.flags[NS].place).id, s]));
assert.equal(byId['LDN-OVERVIEW']._folder, oldStreets.id, 'overview stays at the top level');
assert.equal(byId['LDN-OVERVIEW'].sort, 0, 'overview first');
for (const m of J('london-street-atlas.json').maps) {
  const s = byId[m.id];
  assert.equal(s._folder, bands[m.row].id, `${m.id} is in row ${m.row + 1}`);
  assert.equal(s.sort, (m.col + 1) * 1000, `${m.id} is ordered west to east`);
}
assert.equal(byId['LDN-HACKNEY']._folder, bands[1].id, 'the existing Hackney scene was re-filed into its row');
assert.equal(flat._folder, mine.id, 'a scene the GM moved elsewhere is left alone');
assert.deepEqual(['LDP-ARCHES', 'LDP-HOSPITAL', 'LDP-CUSTODY'].map(k => byId[k]._folder), [oldPlaces.id, oldPlaces.id, oldPlaces.id], 'interiors stay in Places');

const again = await importAllMaps({notify: false});
assert.equal(again.created, 0, 'running it again imports nothing');
assert.equal(scenes.length, 25);
console.log('maps import: 25 maps, 4 row folders, re-run safe — ok');
process.exit(0);
