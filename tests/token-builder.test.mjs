// 0.5.25 token builder: the part library, the compositor and the recipes. Every part file is there and well formed,
// uses only known colour slots, and composes on every build; hats and face coverings hide what they cover; recipes
// survive bad input; random looks and presets are always valid; the output never leaks a placeholder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import * as T from '../module/tokens/compose.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/token-builder.json'), 'utf8'));
const parts = new Map(cat.parts.filter(p => p.file).map(p => [p.file, fs.readFileSync(path.join(ROOT, p.file), 'utf8')]));

// the library the spec asked for: V1 scope at least
const count = k => cat.parts.filter(p => p.category === k).length;
assert.ok(cat.skins.length >= 4 && cat.skins.length <= 12, 'skin tones');
assert.ok(count('top') >= 8, 'tops'); assert.ok(count('legs') + count('shoes') >= 8, 'bottoms and shoes');
assert.ok(count('hair') + count('hat') >= 6, 'hair and hats'); assert.ok(count('neck') + count('back') + count('face') + count('gloves') >= 6, 'accessories');
assert.ok(count('prop') >= 4, 'props'); assert.equal(cat.builds.length, 3);
for (const k of ['rider', 'mechanic', 'roadman', 'smart', 'police', 'paramedic', 'cabbie']) assert.ok(cat.presets.some(p => p.id === k), `preset ${k}`);
for (const dir of ['body', 'legs', 'top', 'hair', 'hat', 'prop']) assert.ok(fs.existsSync(path.join(ROOT, 'assets/tokens/builder', dir)), `assets/tokens/builder/${dir}`);

// every file: present, an SVG on the 512 canvas, balanced groups with a z, only known slots
const SLOTS = new Set(['skin', 'hair', 'top', 'outer', 'legs', 'shoes', 'hat', 'bag', 'acc', 'glove', 'hood'].flatMap(s => [s, `${s}-dark`, `${s}-light`]));
for (const [f, text] of parts) {
  assert.ok(text.startsWith('<svg') && text.trim().endsWith('</svg>'), `${f}: an SVG`);
  assert.match(text, /viewBox="0 0 512 512"/, `${f}: 512 canvas`);
  assert.equal((text.match(/<g\b/g) || []).length, (text.match(/<\/g>/g) || []).length, `${f}: balanced groups`);
  const groups = T.splitGroups(text); assert.ok(groups.length >= 1, `${f}: has z groups`);
  for (const gp of groups) assert.ok(Number.isFinite(gp.z), `${f}: numeric z`);
  for (const m of text.matchAll(/var\(--([a-z-]+)\)/g)) assert.ok(SLOTS.has(m[1]), `${f}: unknown colour slot ${m[1]}`);
  assert.ok(!/NaN|undefined/.test(text), `${f}: no NaN/undefined in the geometry`);
}
for (const p of cat.parts) if (p.file) assert.ok(parts.has(p.file), p.file);

// compose every part on every build: well formed, no placeholders left, the figure faces down (rotated 180)
const well = svg => { const open = (svg.match(/<(g|svg|defs|filter|clipPath|feMerge|feComponentTransfer|text)(?:\s[^>]*[^/])?>/g) || []).length, close = (svg.match(/<\/(g|svg|defs|filter|clipPath|feMerge|feComponentTransfer|text)>/g) || []).length; return open === close; };
let composed = 0;
for (const b of cat.builds) for (const p of cat.parts.filter(x => !x.always)) {
  const r = T.normaliseRecipe({body: b.id, [p.category]: p.id}, cat);
  const svg = T.composeSVG(r, cat, parts, {idPrefix: `t${composed}`});
  assert.ok(well(svg), `${b.id}/${p.category}/${p.id}: well formed`);
  assert.ok(!svg.includes('var(--') && !svg.includes('{{'), `${p.id}: every placeholder filled`);
  assert.match(svg, /rotate\(180 256 256\)/); composed++;
}
assert.ok(composed > 200, `${composed} compositions`);

// hiding: a hood hides all the hair; a cap only the top of it (a ponytail still shows); a full-face helmet hides the
// face covering; a balaclava hides the hat
const ids = r => T.visibleParts(T.normaliseRecipe(r, cat), cat).map(v => `${v.part.category}:${v.part.id}`);
assert.ok(!ids({hat: 'hood', hair: 'long', top: 'hoodie'}).some(x => x.startsWith('hair:')), 'hood hides hair');
const capped = T.visibleParts(T.normaliseRecipe({hat: 'cap', hair: 'ponytail'}, cat), cat).find(v => v.part.category === 'hair');
assert.ok(capped && capped.hideTags.has('cap'), 'a cap hides only the crown of the hair');
assert.ok(T.composeSVG({hat: 'cap', hair: 'ponytail', colours: {hair: '#a8452c'}}, cat, parts).includes('#a8452c'), 'the ponytail still shows under a cap');
assert.ok(!ids({hat: 'motohelmet', face: 'shades'}).includes('face:shades'), 'a full-face helmet hides shades');
assert.ok(!ids({hat: 'beanie', face: 'balaclava'}).includes('hat:beanie'), 'a balaclava hides the beanie');

// recipes: junk in, valid out; key is stable and changes with the look
const junk = T.normaliseRecipe({body: 'giant', skin: 'blue', top: 'spacesuit', hair: 42, colours: {top: 'red', hair: '#zzzzzz'}, number: '<b>123'}, cat);
assert.equal(junk.body, 'medium'); assert.ok(cat.skins.some(s => s.id === junk.skin)); assert.equal(junk.top, 'tee'); assert.equal(junk.hair, 'none');
assert.match(junk.colours.top, /^#[0-9a-f]{6}$/); assert.equal(junk.number, 'b1');
assert.equal(T.recipeKey(junk), T.recipeKey(structuredClone(junk)));
assert.notEqual(T.recipeKey(junk), T.recipeKey({...junk, top: 'hoodie'}));
// random and preset looks are valid; players never get the police-only pieces at random
for (let i = 0; i < 300; i++) {
  const r = T.randomRecipe(cat, T.seeded(`seed${i}`));
  assert.deepEqual(T.normaliseRecipe(r, cat), r, 'random recipes are already normal');
  for (const k of T.PART_KEYS) if (r[k] !== 'none') assert.ok(!T.partOf(cat, k, r[k]).npc, `random ${k} ${r[k]} is not NPC-only`);
}
assert.deepEqual(T.randomRecipe(cat, T.seeded('same')), T.randomRecipe(cat, T.seeded('same')), 'a seed always gives the same look');
const me = T.randomRecipe(cat, T.seeded('me'));
for (const p of cat.presets) {
  const r = T.applyPreset(me, p, cat);
  assert.equal(r.skin, me.skin, `${p.id} keeps the skin`); assert.equal(r.body, me.body); assert.equal(r.colours.hair, me.colours.hair);
  for (const [k, v] of Object.entries(p.recipe)) if (T.PART_KEYS.includes(k)) assert.equal(r[k], v, `${p.id}: ${k}`);
  if ('ring' in p.recipe) assert.equal(r.ring, p.recipe.ring, `${p.id}: ring`);
}
// colour helpers
assert.equal(T.shade('#808080', 0), '#808080'); assert.equal(T.shade('#000000', 0.5), '#808080'); assert.equal(T.shade('#ffffff', -0.5), '#808080');
const slots = T.slotColours(T.normaliseRecipe({gloves: 'cycling', colours: {acc: '#ff7fb0'}}, cat), cat);
assert.equal(slots.glove, '#ff7fb0', 'cycling gloves take the trim colour');
assert.equal(T.slotColours(T.normaliseRecipe({}, cat), cat).glove, T.slotColours(T.normaliseRecipe({}, cat), cat).skin, 'bare hands are skin');
console.log(`token builder: ${parts.size} part files, ${composed} compositions on three builds, hiding rules, recipes, ${cat.presets.length} presets, 300 random looks — ok`);
process.exit(0);
