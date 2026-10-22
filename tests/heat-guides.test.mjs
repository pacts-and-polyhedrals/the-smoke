// 0.5.22: the four guide pages that print the Heat tables say what the game now does (crime ceilings, fewer police),
// in the shipped JSON, the guide source and the compendium build, and existing worlds get those pages refreshed once —
// unless the GM has edited them.
import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import './runtime-stub.mjs';
import {setPath} from './fakes.mjs';
const NS = 'the-smoke', root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const {textHash} = await import('../module/text-hash.mjs');
const {CRIMES, HEAT, crimeHeatText} = await import('../module/config.mjs');
const R = await import('../scripts/journals/rules.mjs');

/* ---------------------------------------------------------------- the shipped text */
const content = J('content.json'), guides = J('london-guides.json');
const rows = Object.values(CRIMES).map(c => `<tr><td>${c.label}</td><td>${crimeHeatText(c)}</td></tr>`).join('');
const heatPages = content.journals.flatMap(j => j.pages.filter(p => p.text.content.includes('Witnessed crime')).map(p => ({j, p})));
assert.deepEqual(heatPages.map(({j}) => j.flags[NS].contentKey).sort(), ['gms-book', 'player-guide', 'players-handbook', 'rules-reference']);
for (const {j, p} of heatPages) {
  const html = p.text.content, where = `${j.flags[NS].contentKey} → ${p.name}`;
  assert.ok(html.includes(R.p(R.CRIME_LADDER)), `${where}: the ceiling rule`);
  assert.ok(html.includes(`<tbody>${rows}</tbody>`), `${where}: the crime table matches the game`);
  assert.ok(html.includes(R.p(R.policeSent())), `${where}: how many police come`);
  for (const x of HEAT) assert.ok(html.includes(`<td>${R.esc(x.response)}</td>`), `${where}: ${x.stars}★ row`);
  assert.equal(p.flags[NS].textHash, textHash(html));
  const src = guides.journals.find(g => g.key === j.flags[NS].contentKey).pages.find(s => s.name === p.name);
  assert.equal(textHash(src.html), textHash(html), `${where}: guide source agrees`);
}
for (const s of [JSON.stringify(content), JSON.stringify(guides)]) assert.ok(!/Heat added|A police witness adds another \+1; Heat is capped at 5|Every unit in the borough/.test(s), 'no old Heat text left');
assert.ok(R.policeSent().includes('2 and the helicopter at 3 stars') && R.policeSent().includes('6 at 5 stars'), R.policeSent());

/* ---------------------------------------------------------------- existing worlds */
// One page as shipped (its fingerprint mark), one the GM edited, one from an older release (only in guide history),
// one already current. Only the Heat pages are touched.
const shippedOld = '<p>Witnessed crime — Heat added: Carjacking +2.</p>', olderStill = '<p>Heat in the 0.5.10 days.</p>';
const realFetch = globalThis.fetch;
globalThis.fetch = async url => /guide-history/.test(String(url))
  ? {ok: true, json: async () => ({...J('guide-history.json'), 'players-handbook|Heat and the Police': [textHash(olderStill)]})} : realFetch(url);
let next = 0;
const pg = d => ({id: `p${++next}`, ...structuredClone(d), getFlag(ns, k) { return this.flags?.[ns]?.[k]; }});
const book = (key, pages) => ({name: content.journals.find(j => j.flags[NS].contentKey === key).name, flags: {[NS]: {contentKey: key}}, pages: pages.map(pg), updates: 0,
  getFlag(ns, k) { return this.flags?.[ns]?.[k]; },
  async updateEmbeddedDocuments(type, ups) { assert.equal(type, 'JournalEntryPage'); this.updates++; for (const up of ups) { const p = this.pages.find(x => x.id === up._id); for (const [k, v] of Object.entries(up)) if (k !== '_id') setPath(p, k, v); } }});
const src = key => heatPages.find(({j}) => j.flags[NS].contentKey === key).p;
const other = content.journals.find(j => j.flags[NS].contentKey === 'player-guide').pages.find(p => !p.text.content.includes('Witnessed crime'));
const player = book('player-guide', [
  {name: src('player-guide').name, text: {content: shippedOld}, flags: {[NS]: {sourcePageId: src('player-guide')._id, textHash: textHash(shippedOld)}}},
  {name: other.name, text: {content: '<p>untouched other page</p>'}, flags: {[NS]: {sourcePageId: other._id, textHash: 'x'}}}]);
const rulesRef = book('rules-reference', [{name: src('rules-reference').name, text: {content: '<p>Our table: carjacking is a hanging offence.</p>'}, flags: {[NS]: {sourcePageId: src('rules-reference')._id, textHash: textHash(shippedOld)}}}]);
const handbook = book('players-handbook', [{name: 'Heat and the Police', text: {content: olderStill}, flags: {}}]);
const gmBook = book('gms-book', [{name: src('gms-book').name, text: {content: src('gms-book').text.content}, flags: {[NS]: {sourcePageId: src('gms-book')._id}}}]);
game.journal = [player, rulesRef, handbook, gmBook];
const chat = []; globalThis.ChatMessage.implementation.create = async d => { chat.push(d); return d; };
const C = await import('../module/content.mjs');
for (const [k, v] of Object.entries({worldSetup: true, contentVersion: C.VERSION, migrationVersion: 3})) await game.settings.set(NS, k, v);
await C.migrateWorld();
assert.equal(player.pages[0].text.content, src('player-guide').text.content, 'shipped page refreshed');
assert.equal(player.pages[0].flags[NS].textHash, src('player-guide').flags[NS].textHash);
assert.equal(player.pages[1].text.content, '<p>untouched other page</p>', 'other pages are not touched');
assert.equal(rulesRef.pages[0].text.content, '<p>Our table: carjacking is a hanging offence.</p>', "the GM's edit stays");
assert.equal(handbook.pages[0].text.content, src('players-handbook').text.content, 'a page from an older release is recognised by its history');
assert.equal(gmBook.updates, 0, 'a page already current is left alone');
assert.equal(game.settings.get(NS, 'migrationVersion'), 4);
const note = chat.find(m => /Heat rules updated/.test(m.content));
assert.ok(note && /Refreshed 2 guide page/.test(note.content) && /Rules Reference|Heat and losses/.test(note.content), note?.content);
assert.deepEqual(note.whisper, ['gm']);
// Runs once.
chat.length = 0; player.pages[0].text.content = shippedOld; await C.migrateWorld();
assert.equal(player.pages[0].text.content, shippedOld); assert.equal(chat.length, 0);
console.log('heat guides: four guide pages print the new crime ceilings and police numbers in every store; existing worlds refresh untouched pages once and keep GM edits — ok');
process.exit(0);
