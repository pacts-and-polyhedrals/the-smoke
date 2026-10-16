// Run every test file in its own process: node tests/run-all.mjs
import {readdirSync} from 'fs'; import {spawnSync} from 'child_process'; import {fileURLToPath} from 'url'; import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url)); let failed = 0;
for (const f of readdirSync(dir).filter(x => x.endsWith('.test.mjs')).sort()) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], {encoding: 'utf8', timeout: 60000});
  const last = (r.stdout || '').trim().split('\n').pop();
  if (r.status === 0) console.log(`✓ ${f}: ${last}`); else { failed++; console.log(`✗ ${f}\n${r.stdout}\n${r.stderr}`); }
}
console.log(failed ? `${failed} FAILED` : 'all tests passed'); process.exit(failed ? 1 : 0);
