import assert from 'node:assert/strict';
import './runtime-stub.mjs';
import {setPath} from './fakes.mjs';
import {textHash} from '../module/text-hash.mjs';
import {updateGuide} from '../module/content.mjs';
const NS='the-smoke';
let next=0, failBackup=false;
function page(d){return {id:d._id||`p${++next}`,...structuredClone(d),getFlag(ns,k){return this.flags?.[ns]?.[k];},toObject(){return structuredClone(Object.fromEntries(Object.entries(this).filter(([k,v])=>typeof v!=='function')));}};}
function journal(d){
  const j={id:`j${++next}`,name:d.name,ownership:d.ownership||{default:2},flags:structuredClone(d.flags||{}),pages:(d.pages||[]).map(page),
    getFlag(ns,k){return this.flags?.[ns]?.[k];},
    async update(up){for(const [k,v]of Object.entries(up))setPath(this,k,v);},
    async createEmbeddedDocuments(type,ds){assert.equal(type,'JournalEntryPage');const ps=ds.map(page);this.pages.push(...ps);return ps;},
    async updateEmbeddedDocuments(type,ups){assert.equal(type,'JournalEntryPage');for(const up of ups){const p=this.pages.find(p=>p.id===up._id);for(const [k,v]of Object.entries(up))if(k!=='_id')setPath(p,k,v);}}
  };j.uuid=`JournalEntry.${j.id}`;return j;
}
globalThis.JournalEntry={implementation:{create:async d=>{if(failBackup)throw new Error('backup blocked');const j=journal(d);game.journal.push(j);return j;}}};
game.users=[{id:'gm',isGM:true},{id:'player',isGM:false}];
const original='<p>Old rules.</p>', edited='<p>GM clues and my own rule edits.</p>', current='<article class="sj-console"><p>Current rules.</p></article>';
const makeSource=(edition='0.5.2')=>({name:'Guide',ownership:{default:2},flags:{[NS]:{contentKey:'journal-test',guideEdition:edition}},pages:[{_id:'stableA',name:'Current title',type:'text',text:{format:1,content:current},flags:{[NS]:{guideEdition:edition,textHash:textHash(current),legacyNames:['Old title']}}},{_id:'stableB',name:'New page',type:'text',text:{format:1,content:'<p>New page.</p>'},flags:{[NS]:{guideEdition:edition}}}]});
const j=journal({name:'Guide',flags:{[NS]:{contentKey:'journal-test'}},pages:[{_id:'worldA',name:'Old title',text:{content:edited},flags:{[NS]:{textHash:textHash(original)}}},{_id:'custom',name:'Our session notes',text:{content:'<p>Do not lose these.</p>'},flags:{}}]});
game.journal=[j];
assert.equal(await updateGuide(j,makeSource()),1);
assert.equal(j.pages.find(p=>p.id==='worldA').name,'Current title','legacy name matches renamed page without duplicate');
assert.equal(j.pages.find(p=>p.id==='worldA').text.content,current);
assert.equal(j.pages.find(p=>p.id==='worldA').flags[NS].sourcePageId,'stableA');
assert.equal(j.pages.find(p=>p.id==='custom').text.content,'<p>Do not lose these.</p>');
assert.equal(j.pages.length,3);
const backup=game.journal.find(b=>b.getFlag(NS,'guideBackupOf')===j.uuid);
assert.ok(backup);assert.equal(backup.pages[0].text.content,edited);assert.equal(backup.ownership.default,0);assert.equal(backup.ownership.player,0);
assert.equal(await updateGuide(j,makeSource()),0,'repeated setup is idempotent');
assert.equal(game.journal.length,2);assert.equal(j.pages.length,3);assert.equal(backup.pages.length,1);
// A subsequent local edit survives ordinary same-edition setup.
j.pages[0].text.content='<p>New GM additions.</p>';
assert.equal(await updateGuide(j,makeSource()),0);assert.equal(j.pages[0].text.content,'<p>New GM additions.</p>');
// A later edition backs it up before refreshing; if backup fails, do not overwrite.
failBackup=true;
await assert.rejects(()=>updateGuide(j,makeSource('0.5.3')),/backup blocked/);
assert.equal(j.pages[0].text.content,'<p>New GM additions.</p>');assert.equal(j.getFlag(NS,'guideEdition'),'0.5.2');
failBackup=false;await updateGuide(j,makeSource('0.5.3'));
assert.equal(game.journal.length,3);assert.equal(j.pages[0].text.content,current);
// An unchanged text hash still receives a style-only update.
const styled=journal({name:'Guide',pages:[{_id:'stableA',name:'Current title',text:{content:'<p>Current rules.</p>'},flags:{[NS]:{textHash:textHash(current)}}}]});
game.journal.push(styled);await updateGuide(styled,makeSource());
assert.equal(styled.pages[0].text.content,current,'same words, new markup');
assert.equal(game.journal.length,4,'unmodified page needs no backup');
// GM-only sources cannot leave explicit player permissions on existing pages.
const restricted=makeSource();restricted.ownership.default=0;await updateGuide(styled,restricted);
assert.equal(styled.ownership.player,0);assert.ok(styled.pages.every(p=>p.ownership.default===-1));
console.log('journal upgrade: edited-page backups, failure safety, stable IDs, renamed pages, style refresh, extra notes and GM ownership — ok');
process.exit(0);
