import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8'),json=f=>JSON.parse(read(f));
const contract=json('tests/merge-input-contract.json'),content=json('data/content.json');
for(const key of ['items','actors','journals'])assert.deepEqual(content[key].map(x=>x._id).sort(),contract.union[key],`${key}: exact three-branch union; no duplicates or omissions`);
assert.deepEqual(content.journals.flatMap(j=>j.pages.map(p=>`${j._id}.${p._id}`)).sort(),contract.union.pages,'all guide page IDs survive');
for(const [file,hash]of Object.entries(contract.fixedBaselines))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,root))).digest('hex'),hash,`immutable baseline ${file}`);
for(const file of contract.union.testFiles)assert.ok(fs.existsSync(new URL(`tests/${file}`,root)),`retained suite ${file}`);
for(const [branch,source]of Object.entries(contract.inputs))for(const [file,sha]of Object.entries(source.assets))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,root))).digest('hex'),sha,`${branch} art retained exactly: ${file}`);
const lib=json('data/london-items.json').items,contentItems=content.items.filter(i=>i.type!=='condition');
assert.equal(lib.length,247);assert.deepEqual(lib.map(i=>i.name).sort(),contentItems.map(i=>i.name).sort());
for(const item of lib){const packed=contentItems.find(i=>i.name===item.name);assert.equal(item.name,packed.name);assert.deepEqual(item.system,packed.system,`${item.name}: source catalogues agree`);}
const venues=json('data/venue-services.json');assert.equal(venues.profiles?.length??Object.keys(venues.venues??{}).length,199);
const missionFiles=['london-missions.json','tagging-missions.json','radio-war-missions.json'],missions=missionFiles.flatMap(f=>json('data/'+f).missions);
assert.equal(missions.length,179);assert.equal(missions.reduce((n,m)=>n+m.objectives.length,0),894);
const pageIndex=new Map(content.journals.flatMap(j=>j.pages.map(p=>[p._id,p])));
let gmPages=0;for(const j of content.journals)for(const p of j.pages)if(p.text?.content?.includes('sj-runtime-contract')){gmPages++;assert.match(p.text.content,/Live mission contract/);}
for(const j of content.journals)for(const p of j.pages){const html=p.text?.content??'';assert.ok(!html.includes('GM / Self-play tick'),'no obsolete manual tick instruction');for(const bad of [/assistance is off by default/i,/Leave automatic chase start and assistance off/i,/every NPC action still waits for Continue/i,/Chase combat does not start itself by default/i,/Assistance starts OFF/i])assert.ok(!bad.test(html),`${p.name}: no stale chase guidance`);}
assert.equal(gmPages,179,'each expanded GM file includes its live automation boundary');
const kits=json('data/token-builder.json');assert.equal(kits.parts.length,109);assert.equal(kits.presets.length,16);
const html=read('templates/actor-sheet.hbs');assert.equal((html.match(/data-phone/g)||[]).length,1);
assert.match(html,/data-token-build/);assert.match(html,/data-token-random/);assert.match(html,/system.guard.base/);
const street=html.slice(html.indexOf('data-tab="street"'),html.indexOf('data-tab="kit"'));
assert.match(street,/system.states.onARoll/);assert.match(street,/system.states.offGame/);
const entry=read('the-smoke.mjs');for(const feature of ['installMissionAutomation','installVenues','tokens','hires'])assert.ok(entry.includes(feature),feature);
const phone=read('module/apps/phone.mjs');for(const feature of ['crewCard','needed','chase'])assert.ok(phone.includes(feature),feature);
const {textHash}=await import('../module/text-hash.mjs');
for(const j of content.journals)for(const p of j.pages)if(p.text?.content){assert.equal(p.flags?.['the-smoke']?.textHash,textHash(p.text.content),`${p.name}: guide text hash`);}
const manifest=json('system.json');assert.equal(manifest.version,'0.5.27-rc.3');assert.equal(content.version,manifest.version);assert.equal(json('data/build-info.json').version,manifest.version);
console.log(`branch preservation: complete item/actor/journal/page union; all ${contract.union.testFiles.length} incoming suites, every incoming asset hash, 179 narrative/runtime guide pairs, catalogue alignment, token builder, sheet and shared bootstrap retained`);
