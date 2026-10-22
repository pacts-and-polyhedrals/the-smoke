import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const man = JSON.parse(readFileSync(path.join(root, 'system.json'), 'utf8'));
assert.equal(man.version, '0.5.24');
assert.equal(man.id, 'the-smoke');
assert.equal(man.download, 'https://github.com/pacts-and-polyhedrals/the-smoke/releases/download/v0.5.24/the-smoke-v0.5.24.zip');
assert.ok(man.description.includes("You're in Hackney, mate"));
assert.ok(man.description.includes('Auntie Pat'));
assert.ok(man.description.includes('Heat'));
assert.ok(man.description.includes('rival factions')); 
assert.ok(man.description.includes('<img'));
assert.doesNotMatch(man.description, /\b(?:GTA|Altered Carbon|Cyberpunk|Covenant)\b/i, 'The storefront must not name inspiration sources');

const media = man.media ?? [];
const types = media.map(entry => entry.type);
assert.ok(types.includes('setup'));
assert.ok(types.includes('icon'));
assert.ok(types.includes('cover'));
assert.ok(types.filter(t => t === 'screenshot').length >= 3);
const base = 'https://raw.githubusercontent.com/pacts-and-polyhedrals/the-smoke-web/bf186f7a1249e7c5e7234723c0a26eee59ee6074/assets/brand/';
const remoteMedia = media.filter(m => m.type !== 'setup');
assert.ok(remoteMedia.every(m => m.url.startsWith(base)), 'Pre-install Forge media URLs must resolve without installing the system');
assert.ok(man.description.includes(`${base}logos/The-Smoke-Full-Logo-Horizontal-Dark.png`));
assert.ok(man.description.includes(`${base}graphics/01-The-City-Is-The-Board-Landscape.png`));
for (const local of [man.background, ...media.filter(m => m.type === 'setup').flatMap(m => [m.url, m.thumbnail])]) {
  assert.ok(local.startsWith('systems/the-smoke/'), 'Installed media paths must be local system paths');
  assert.ok(existsSync(path.join(root, local.substring('systems/the-smoke/'.length))), `Missing bundled branding asset: ${local}`);
}
for (const [relative, expected] of Object.entries({
  'graphics/city-is-the-board.png': '80f934768c5545a6836914871822f735dbf7b626',
  'graphics/chainring-poster.png': '4f7049b65bc943b33d6ffe5fdf8058d34f5f41bd',
  'graphics/blower-promo.png': '9d4811d7d88acf0982efe3b50692180e74718ceb',
  'logos/favicon.png': 'f012fbdb8d151b3868d13bb059a03c945ab9a14d',
  'logos/logo-horizontal-dark.png': '46c52a7cf8a7cd0626615c7cbb3b4542e4c879b6'
})) {
  const file = path.join(root, 'assets/branding', relative);
  assert.ok(existsSync(file), `Missing brand file: ${relative}`);
  const bytes = readFileSync(file);
  const gitBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitBlob, expected, `Website and package branding assets differ for ${relative}`);
}
console.log('v0.5.24 listing, all original website assets, remote gallery URLs, and spoiler-safe copy validated');
