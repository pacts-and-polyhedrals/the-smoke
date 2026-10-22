import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {ClassicLevel} from 'classic-level';
import {textHash} from '../../module/text-hash.mjs';
import {CONDITION_LIBRARY} from '../../module/rules/conditions.mjs';
import {REP_LEVELS} from '../../module/rules/advancement.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const data=JSON.parse(await fs.readFile(ROOT+'data/content.json','utf8'));
const source=JSON.parse(await fs.readFile(ROOT+'data/london-guides.json','utf8'));
const manifest=JSON.parse(await fs.readFile(ROOT+'system.json','utf8'));
const missions=JSON.parse(await fs.readFile(ROOT+'data/london-missions.json','utf8'));
assert.equal(data.version,manifest.version);
assert.ok(manifest.styles.includes('styles/journals.css'));
const ids=new Set(data.journals.flatMap(j=>[`JournalEntry.${j._id}`,...j.pages.map(p=>`JournalEntry.${j._id}.JournalEntryPage.${p._id}`)]));
const byPage=new Map(data.journals.flatMap(j=>j.pages.map(p=>[p._id,{j,p}])));
const db=new ClassicLevel(ROOT+'packs/guides',{valueEncoding:'json'});await db.open();
let pages=0,links=0;
for(const j of data.journals){
  const root=await db.get(`!journal!${j._id}`);assert.equal(root.name,j.name);assert.deepEqual(root.flags,j.flags);assert.deepEqual(root.ownership,j.ownership);
  assert.deepEqual(root.pages,j.pages.map(p=>p._id));
  const src=source.journals.find(x=>x.key===j.flags['the-smoke'].contentKey);assert.ok(src);assert.equal(src.pages.length,j.pages.length);
  for(const [i,p]of j.pages.entries()){
    pages++;const html=p.text.content, {document}=parseHTML(`<html><body>${html}</body></html>`);
    const wrapper=document.querySelector('article.smoke-journal.sj-console');assert.ok(wrapper,p.name);
    assert.equal(document.querySelectorAll('.smoke-journal').length,1,`single wrapper: ${p.name}`);
    assert.equal(document.querySelectorAll('.sj-status').length,1);assert.equal(document.querySelectorAll('.sj-nav').length,1);assert.equal(document.querySelectorAll('.sj-footer').length,1);
    assert.ok(wrapper.querySelector('h1'),`page heading: ${p.name}`);assert.equal(wrapper.dataset.smokeEdition,j.flags['the-smoke'].guideEdition);
    assert.equal(p.flags['the-smoke'].textHash,textHash(html));assert.equal(p.flags['the-smoke'].sourcePageId,p._id);assert.equal(p.ownership.default,-1);
    assert.equal(src.pages[i].html,html);
    const packed=await db.get(`!journal.pages!${j._id}.${p._id}`);delete packed._stats;assert.deepEqual(packed,p,'pack page equals canonical source');
    for(const m of html.matchAll(/@UUID\[Compendium\.the-smoke\.guides\.([^\]]+)\]/g)){
      links++;assert.ok(ids.has(m[1]),`broken link on ${p.name}: ${m[1]}`);
      const target=byPage.get(m[1].split('.').at(-1));
      if(j.ownership.default>0&&target)assert.ok(target.j.ownership.default>0,`public guide links to GM secret: ${p.name}`);
    }
    for(const img of document.querySelectorAll('img[src^="systems/the-smoke/"]'))await fs.access(ROOT+img.getAttribute('src').replace('systems/the-smoke/',''));
    for(const t of document.querySelectorAll('table'))assert.ok(t.parentElement.classList.contains('sj-table-scroll'),`scrollable table ${p.name}`);
    assert.ok(!/each player earns one advance|Rep Stage 2|fixed-job bonus|respray costs £400|Track a gap from 2:/i.test(html),`obsolete rule ${p.name}`);
  }
}
let records=0;for await(const _ of db.iterator())records++;await db.close();assert.equal(records,pages+data.journals.length);
const get=(k,n)=>data.journals.find(j=>j.flags['the-smoke'].contentKey===k).pages.find(p=>p.name===n).text.content;
const conditions=get('players-handbook','Harm and Conditions'), rep=get('players-handbook','Rep and Levelling'), kit=get('players-handbook','Kit'), motors=get('players-handbook','Motors');
for(const c of CONDITION_LIBRARY)assert.ok(conditions.includes(c.name),`condition ${c.name}`);
for(const l of REP_LEVELS)assert.ok(rep.includes(`<td>${l.xp}</td>`),`XP ${l.level}`);
for(const i of data.items.filter(i=>i.type!=='condition'))assert.ok(kit.includes(i.name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')),`kit ${i.name}`);
for(const a of data.actors.filter(a=>a.type==='vehicle'))assert.ok(motors.includes(a.name.replaceAll('&','&amp;')),`motor ${a.name}`);
for(const m of missions.missions){const page=byPage.get(m.pageUuid.split('.').at(-1));assert.ok(page,`mission ${m.id}`);assert.ok(page.p.text.content.includes('sj-live-rules'),`current mechanical summary ${m.id}`);}
for(const n of ['Chases and Police Stops','Blower, Radio and Sat Nav','Missions and Faction Standing'])assert.ok(get('players-handbook',n));
console.log(JSON.stringify({journals:data.journals.length,pages,validGuideLinks:links,packRecords:records,conditions:CONDITION_LIBRARY.length,RepLevels:REP_LEVELS.length,missions:missions.missions.length,sourceAndPack:'identical'}));
