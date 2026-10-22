import test from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const manifest=JSON.parse(read('system.json'));
test.ok(read('templates/phone.hbs').includes('{{{banana}}} THE BLOWER'),'Blower icon markup must not be escaped');
const prefix='systems/the-smoke/';
test.equal(manifest.version,'0.5.24');
test.equal(manifest.persistentStorage,true);
test.equal(manifest.id,'the-smoke');
test.equal(manifest.download, `https://github.com/pacts-and-polyhedrals/the-smoke/releases/download/v${manifest.version}/the-smoke-v${manifest.version}.zip`);
test.equal(manifest.manifest,'https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json');
test.doesNotMatch(manifest.description,/GTA|Altered Carbon|Cyberpunk|inspired by/i);
test.match(manifest.description,/Hackney|Morning Lane/);
test.match(manifest.description,/Pacts &(?:amp; )?Polyhedrals/);
test.equal(manifest.background,prefix+'assets/branding/graphics/city-is-the-board.png');
test.ok(Array.isArray(manifest.media));
test.equal(manifest.media[0].type,'setup');
const publicUrl='https://raw.githubusercontent.com/pacts-and-polyhedrals/the-smoke-web/bf186f7a1249e7c5e7234723c0a26eee59ee6074/assets/brand/';
for (const asset of [manifest.background, ...manifest.media.flatMap(m=>[m.url,m.thumbnail])]) {
 if(asset.startsWith(publicUrl)) continue;
 test.ok(asset.startsWith(prefix));
 test.ok(existsSync(resolve(root, asset.slice(prefix.length))), 'missing media '+asset);
}
for(const type of ['icon','cover','screenshot'])test.ok(manifest.media.filter(m=>m.type===type).every(m=>m.url.startsWith(publicUrl)));
for(const type of ['setup'])test.ok(manifest.media.filter(m=>m.type===type).every(m=>m.url.startsWith(prefix)));
for (const rel of [
 'assets/branding/logos/logo-horizontal.png','assets/branding/logos/wordmark.png',
 'assets/branding/logos/symbol.png','assets/branding/logos/favicon.png',
 'assets/branding/graphics/city-is-the-board.svg',
 'assets/branding/graphics/chainring-poster.svg',
 'assets/branding/graphics/blower-promo.svg'
])test.ok(existsSync(resolve(root,rel)),'missing asset '+rel);
for(const page of ['templates/gm-screen.hbs','templates/mission-board.hbs','templates/creator.hbs',
 'templates/tag-studio.hbs','templates/phone.hbs','templates/street-control.hbs','module/content.mjs']) {
 const html=read(page);
 const paths=[...html.matchAll(/systems\/the-smoke\/assets\/branding\/[A-Za-z0-9_./-]+/g)].map(m=>m[0]);
 test.ok(paths.length,'missing branding use '+page);
 for(const p of paths)test.ok(existsSync(resolve(root,p.slice(prefix.length))),'missing referenced logo '+p);
}
console.log('branding manifest, supplied art paths, and Foundry UI references valid');
