// Draw the shipped graffiti art from the piece engine: one SVG per preset (assets/graffiti/presets/<id>.svg, at the
// "Sorted" finish) and each tag pack's six quality variants (assets/graffiti/svg/<pack>/<quality>.svg) that
// data/tagging-catalogue.json points at. Usage (system folder): node scripts/graffiti/build-art.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPiece} from '../../module/graffiti/pieces.mjs';
import {GRAFFITI_PRESETS, presetArt} from '../../module/graffiti/presets.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), check = process.argv.includes('--check');
const letters = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/graffiti-letters.json'), 'utf8'));
const QUALITIES = ['severeFailure', 'costlyFailure', 'narrowSuccess', 'fullSuccess', 'strongSuccess', 'exceptionalSuccess'];
const design = (p, quality) => ({...p.design, extras: {...p.design.extras}, quality, blinder: 0, width: 860, height: 420, background: 'transparent'});
const files = new Map();
for (const p of GRAFFITI_PRESETS) files.set(presetArt(p.id), renderPiece(design(p, 'fullSuccess'), letters));
const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tagging-catalogue.json'), 'utf8'));
for (const pack of catalogue.tagPacks) {
  const code = pack.faction ? pack.faction.toLowerCase() : 'street';
  const preset = GRAFFITI_PRESETS.find(p => p.pack === pack.id) ?? GRAFFITI_PRESETS.find(p => p.id === 'street-1');
  for (const q of QUALITIES) {
    const rel = `assets/graffiti/svg/${code}/${q}.svg`;
    if (pack.variants?.[q] && pack.variants[q] !== rel) throw new Error(`${pack.id}: catalogue points at ${pack.variants[q]}`);
    files.set(rel, renderPiece(design(preset, q), letters));
  }
}
let changed = 0, biggest = 0;
for (const [rel, svg] of files) {
  biggest = Math.max(biggest, svg.length);
  const abs = path.join(ROOT, rel), now = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (now === svg) continue; changed++;
  if (check) { console.log('out of date:', rel); continue; }
  fs.mkdirSync(path.dirname(abs), {recursive: true}); fs.writeFileSync(abs, svg);
}
console.log(`graffiti art: ${files.size} files, ${changed} ${check ? 'out of date' : 'written'}, largest ${Math.round(biggest / 1000)}k`);
if (check && changed) process.exit(1);
