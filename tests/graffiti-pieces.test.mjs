// 0.5.26: the graffiti piece engine, characters and presets. Every style at every finish draws valid SVG; long names
// go on two lines; every character draws; ASMO and 2CB come in every style; every faction and every station on the
// dial has its pieces; the shipped art matches the engine; the Tag Studio and the GM's paint accept only known keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import process from 'node:process';
import './runtime-stub.mjs';
import {PIECE_STYLES, FILL_MODES, renderPiece} from '../module/graffiti/pieces.mjs';
import {CHARACTERS, CHARACTER_GROUPS, drawCharacter} from '../module/graffiti/characters.mjs';
import {GRAFFITI_PRESETS, PRESET_GROUPS, presetArt} from '../module/graffiti/presets.mjs';
import {loadPieceLetters, pieceLetters} from '../module/graffiti/letters.mjs';
import {buildSvg, sanitiseTagDesign} from '../module/apps/tag-studio.mjs';

const root = new URL('../', import.meta.url), read = f => fs.readFileSync(new URL(f, root), 'utf8');
const letters = await loadPieceLetters();
assert.equal(pieceLetters(), letters, 'letters load once through the same loader the GM uses');
const QUALITIES = ['severeFailure', 'costlyFailure', 'narrowSuccess', 'fullSuccess', 'strongSuccess', 'exceptionalSuccess'];
const base = {fill: '#ffd23f', fill2: '#ff4e1a', outline: '#141414', shadow: '#7b2cbf', accent: '#3fd0ff', skin: '#8d5a3b', width: 860, height: 420, blinder: 0, background: 'transparent',
  extras: {underline: true, arrow: true, drips: true, spark: false, halo: false, crown: false}};
/** Well-formed enough for a browser: tags balance, no NaN/undefined/Infinity, one root. */
function wellFormed(svg, what) {
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && svg.endsWith('</svg>'), `${what}: an SVG`);
  assert.ok(!/NaN|undefined|Infinity|\[object/.test(svg), `${what}: no bad numbers`);
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue; if (!m[1]) stack.push(m[2]); else assert.equal(stack.pop(), m[2], `${what}: </${m[2]}> closes the right tag`);
  }
  assert.equal(stack.length, 0, `${what}: every tag closed`);
}

// every style × every finish, short and long names, with and without characters
const charKeys = Object.keys(CHARACTERS);
let n = 0, biggest = 0;
for (const [style, st] of Object.entries(PIECE_STYLES)) {
  assert.ok(letters.fonts[st.font], `${style}: letters for ${st.font}`);
  for (const [qi, quality] of QUALITIES.entries()) {
    for (const text of ['ASMO', '2CB', 'NIGHT MARKET']) {
      const svg = renderPiece({...base, text, style, quality, character: charKeys[(n++) % charKeys.length], charSide: n % 2 ? 'left' : 'right', fillMode: Object.keys(FILL_MODES)[qi % 10]}, letters);
      wellFormed(svg, `${style}/${quality}/${text}`); biggest = Math.max(biggest, svg.length);
    }
  }
}
// the worst case a player can ask for: eighteen characters in the heaviest letters, a character, Legendary, blinder 4
for (const style of Object.keys(PIECE_STYLES)) {
  const svg = renderPiece({...base, text: 'WWWWWWWWW MMMMMMMM', style, quality: 'exceptionalSuccess', blinder: 4, character: 'd20'}, letters);
  wellFormed(svg, `${style} worst case`); assert.ok(svg.length < 400_000, `${style}: worst case ${svg.length} under the GM's 400k limit`);
}
// long two-word names go on two lines (taller than one line of the same words)
const box = svg => { const m = /scale\(([\d.]+)\)/.exec(svg); return Number(m[1]); };
assert.ok(box(renderPiece({...base, text: 'NIGHT MARKET', style: 'throwup', quality: 'fullSuccess'}, letters)) > box(renderPiece({...base, text: 'NIGHTMARKET', style: 'throwup', quality: 'fullSuccess'}, letters)) * 1.1, 'two lines draw bigger letters');
// every glyph the Tag Studio allows exists in every font
for (const [key, font] of Object.entries(letters.fonts)) for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?!&.-_') assert.ok(font.glyphs[ch], `${key}: ${ch}`);
// characters
for (const key of charKeys) { const c = drawCharacter(key, {o: '#111111', p: '#2f6fd6', s: '#ff4f9a', a: '#ffd23f', k: '#8d5a3b'}); assert.ok(c.length > 500 && !/NaN|undefined/.test(c), `${key} draws`); }
assert.ok(charKeys.length >= 23, 'writers, the factions\' own and radio characters');
for (const keys of Object.values(CHARACTER_GROUPS)) for (const k of keys) assert.ok(CHARACTERS[k], `${k} is a character`);

// presets: ASMO and 2CB in every style; every faction and station covered; every character used
for (const tag of ['ASMO', '2CB']) for (const style of Object.keys(PIECE_STYLES)) assert.ok(GRAFFITI_PRESETS.some(p => p.group === tag && p.design.text === tag && p.design.style === style), `${tag} in ${style}`);
const factions = Object.keys(JSON.parse(read('data/london-missions.json')).factions);
for (const code of factions) assert.ok(GRAFFITI_PRESETS.filter(p => p.pack === `TAG-${code}`).length >= 3, `${code} has its pieces`);
const stations = [...read('module/radio/stations.mjs').matchAll(/\{id:'([^']+)',name:'([^']+)'/g)].map(m => m[2]);
assert.ok(stations.length >= 6);
for (const name of stations) assert.ok(PRESET_GROUPS.includes(`Radio · ${name}`), `${name} has shout-outs`);
for (const key of charKeys) assert.ok(GRAFFITI_PRESETS.some(p => p.design.character === key), `${key} appears in a preset`);
assert.equal(new Set(GRAFFITI_PRESETS.map(p => p.id)).size, GRAFFITI_PRESETS.length, 'preset ids are unique');
for (const p of GRAFFITI_PRESETS) {
  const clean = sanitiseTagDesign(p.design);
  for (const k of ['text', 'style', 'fill', 'fill2', 'outline', 'shadow', 'accent', 'fillMode', 'character', 'charSide']) assert.equal(clean[k], p.design[k], `${p.id}: ${k} survives the sanitiser`);
  assert.ok(fs.existsSync(new URL(presetArt(p.id), root)), `${p.id}: art shipped`);
}
// the shipped art is what the engine draws now, and every tag pack has its six finishes
execFileSync(process.execPath, [new URL('scripts/graffiti/build-art.mjs', root).pathname, '--check'], {stdio: 'pipe'});
for (const pack of JSON.parse(read('data/tagging-catalogue.json')).tagPacks) for (const q of QUALITIES) assert.ok(fs.existsSync(new URL(pack.variants[q], root)), `${pack.id} ${q}`);

// the Tag Studio and the GM only take known keys
const evil = sanitiseTagDesign({text: '<script>ASMO', style: 'wildstyle', character: '../../x', fillMode: 'url(evil)', fill2: 'red;', charSide: 'up'});
assert.deepEqual([evil.text, evil.style, evil.character, evil.fillMode, evil.fill2, evil.charSide], ['scriptASMO', 'wildstyle', '', '', '#c4451c', 'right']);
assert.equal(sanitiseTagDesign({style: 'nonsense'}).style, 'handstyle');
const piece = buildSvg({...base, text: 'ASMO', style: 'burner', quality: 'strongSuccess', character: 'd20'});
assert.match(piece, /graffiti piece/, 'piece styles go through the piece engine');
assert.match(buildSvg({...base, text: 'ASMO', style: 'handstyle', quality: 'fullSuccess'}), /graffiti tag/, 'classic tags still draw the old way');
const runtime = read('module/graffiti/runtime.mjs');
assert.match(runtime, /if\(isPieceStyle\(clean\.style\)\)await loadPieceLetters\(\)/, 'the GM loads the letters before regenerating a piece');
assert.match(runtime, /spark:false,halo:false,crown:false/, 'a piece\'s crown and glow come from the roll, not the client');
// fonts are credited
const licences = read('GRAFFITI-FONT-LICENCES.md');
for (const c of Object.values(letters.credits)) assert.ok(licences.includes(c.family), `${c.family} credited`);

console.log(`graffiti pieces: ${Object.keys(PIECE_STYLES).length} styles × 6 finishes, ${charKeys.length} characters, ${GRAFFITI_PRESETS.length} presets (ASMO and 2CB in every style, ${factions.length} factions, ${stations.length} stations), art in step, largest ${Math.round(biggest / 1000)}k — ok`);
process.exit(0);
