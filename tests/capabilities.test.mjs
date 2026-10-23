// 0.5.25 capability guard. Upgrades kept losing things (the Blower's chase switches, the yellow/red auto-roll and the
// base Guard box all vanished in merges; three Rep unlocks were promised and never built). This suite fails loudly if
// anything the system has ever been asked for goes missing:
//  1. every capability in tests/capability-manifest.mjs still passes its probes;
//  2. nothing in tests/capability-baseline.json (every handler, setting, hook, export, button, template, API key and
//     content count of the last release) has disappeared — unless it was retired on purpose and listed;
//  3. CAPABILITIES.md lists every capability.
// To add features: add them to the manifest, then `node scripts/capabilities.mjs` to refresh the doc only; baseline proposals require explicit human review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {fingerprint, contentCounts} from './capability-fingerprint.mjs';
import {CAPABILITIES, RETIRED} from './capability-manifest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fp = fingerprint(ROOT), counts = contentCounts(ROOT);
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_e) { return null; } };
const set = k => new Set(fp[k] ?? []);
const handlers = set('handler'), settings = set('setting'), apiKeys = set('api');
function missionPagesProblem() {
  const content = JSON.parse(read('data/content.json')), pages = new Map(content.journals.flatMap(j => j.pages.map(p => [p._id, p])));
  const all = ['london-missions.json', 'tagging-missions.json', 'radio-war-missions.json'].flatMap(f => JSON.parse(read(`data/${f}`)).missions);
  const bad = all.filter(m => { const p = pages.get(String(m.pageUuid || '').split('.').at(-1)); return !p || !/sj-read-aloud/.test(p.text?.content || '') || !/sj-dm-notes/.test(p.text?.content || ''); });
  return bad.length ? `${bad.length} of ${all.length} missions have no DM file (first: ${bad.slice(0, 5).map(m => m.code || m.id).join(', ')})` : '';
}
const lost = [];
for (const c of CAPABILITIES) for (const p of c.probes) {
  let why = '';
  if (p.kind === 'file') why = p.files.filter(f => !fs.existsSync(path.join(ROOT, f))).map(f => `missing file ${f}`).join('; ');
  else if (p.kind === 'has') { const s = read(p.file); why = s == null ? `missing file ${p.file}` : p.needles.filter(n => !s.includes(n)).map(n => `${p.file} no longer has "${n}"`).join('; '); }
  else if (p.kind === 'handler') why = p.names.filter(n => !handlers.has(n)).map(n => `world action "${n}" is gone`).join('; ');
  else if (p.kind === 'setting') why = p.keys.filter(k => !settings.has(k)).map(k => `setting "${k}" is gone`).join('; ');
  else if (p.kind === 'api') why = p.keys.filter(k => !apiKeys.has(k)).map(k => `game.smoke.${k} is gone`).join('; ');
  else if (p.kind === 'count') why = Number(counts[p.key]) >= p.min ? '' : `${p.key}: ${counts[p.key]} (needs ${p.min}+)`;
  else if (p.kind === 'missionPages') why = missionPagesProblem();
  if (why) lost.push(`${c.name} [since ${c.since}]: ${why}`);
}
assert.deepEqual(lost, [], `capabilities lost:\n  ${lost.join('\n  ')}`);

// the baseline: nothing that the last release had may vanish
const base = JSON.parse(read('tests/capability-baseline.json'));
const retiredKeys = new Set(base.retired ?? []);
const gone = [];
for (const [k, list] of Object.entries(base.fingerprint)) { const now = set(k); for (const v of list) if (!now.has(v) && !retiredKeys.has(`${k}:${v}`)) gone.push(`${k}: ${v}`); }
for (const [k, v] of Object.entries(base.counts)) if (Number(counts[k] ?? 0) < Number(v)) gone.push(`count ${k}: ${counts[k]} < ${v}`);
assert.deepEqual(gone, [], `removed since the baseline (${base.version}) — restore them, or list them in the baseline's "retired" with a reason:\n  ${gone.join('\n  ')}`);

// the doc lists everything
const doc = read('CAPABILITIES.md') ?? '';
const undocumented = CAPABILITIES.filter(c => !doc.includes(c.name)).map(c => c.name);
assert.deepEqual(undocumented, [], 'CAPABILITIES.md is out of date: run node scripts/capabilities.mjs');
for (const r of RETIRED) assert.ok(doc.includes(r.name), `CAPABILITIES.md lists the retired ${r.name}`);
const n = Object.values(base.fingerprint).reduce((s, l) => s + l.length, 0);
console.log(`capabilities: ${CAPABILITIES.length} capabilities pass their probes; ${n} baseline traces (${base.version}) all present; ${RETIRED.length} deliberate retirements documented — ok`);
process.exit(0);
