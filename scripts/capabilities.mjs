// Refresh capability documentation after adding features. The protected baseline is read only.
// --propose-baseline writes a separate unapproved proposal; CAPABILITIES.md is generated from the manifest.
// Usage: node scripts/capabilities.mjs (docs only); --propose-baseline writes a separate review proposal.
// Never overwrite a protected baseline merely because a candidate exists.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fingerprint, contentCounts} from '../tests/capability-fingerprint.mjs';
import {CAPABILITIES, RETIRED} from '../tests/capability-manifest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8')).version;
const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/capability-baseline.json'), 'utf8')); } catch (_e) { return {}; } })();
const fp = fingerprint(ROOT);
delete fp.module;   // files may be split or renamed; their exports, handlers and buttons are what matter
const counts = contentCounts(ROOT);
if (process.argv.includes('--propose-baseline')) fs.writeFileSync(path.join(ROOT, 'tests/capability-proposal.json'), JSON.stringify({version, approved:false, note:'Review proposal only. Explicit human approval is required before any baseline promotion.', retired:prev.retired??[], counts, fingerprint:fp},null,1)+'\n');
const areas = [...new Set(CAPABILITIES.map(c => c.area))];
const md = [`# The Smoke — capabilities (v${version})`, '',
  'Everything the system has been asked to do, where to find it, and the release it arrived in. `tests/capabilities.test.mjs` checks every line on every build, and also checks that nothing the previous release had (every world action, setting, hook, button, API key and content count) has gone missing. If an upgrade drops something, the tests fail and name it.', '',
  'Adding a feature: add it to `tests/capability-manifest.mjs`, then run `node scripts/capabilities.mjs` to refresh the documentation only. `--propose-baseline` writes a separate unapproved proposal; protected baselines are never overwritten by this command.', '',
  ...areas.flatMap(a => [`## ${a}`, '', '| Capability | Since | Where |', '|---|---|---|', ...CAPABILITIES.filter(c => c.area === a).map(c => `| ${c.name} | ${c.since} | ${c.where} |`), '']),
  '## Retired on purpose', '', '| What | Why |', '|---|---|', ...RETIRED.map(r => `| ${r.name} | ${r.why} |`), '',
  `Content counts at v${version}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.`, ''].join('\n');
fs.writeFileSync(path.join(ROOT, 'CAPABILITIES.md'), md);
console.log(`documentation ${version} (baseline preserved): ${Object.values(fp).reduce((s, l) => s + l.length, 0)} traces; CAPABILITIES.md: ${CAPABILITIES.length} capabilities`);
