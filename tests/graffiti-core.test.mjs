import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import './runtime-stub.mjs';
import {QUALITY,qualityAtLeast,QUALITY_SCORE,tagMinutes,witnessedTag,rectDistanceSquares,territoryForMarks,canCreditPaintObjective,computeTileGeometry} from '../module/graffiti/core.mjs';
import {missionData,applyEvent,needed} from '../module/world/missions.mjs';

const path=resolve(dirname(fileURLToPath(import.meta.url)),'../data');
const cat=JSON.parse(readFileSync(resolve(path,'tagging-catalogue.json')));
const source=JSON.parse(readFileSync(resolve(path,'tagging-missions.json')));
const atlas=JSON.parse(readFileSync(resolve(path,'london-street-atlas.json')));
const mapIds=new Set(atlas.maps.map(m=>m.id));
assert.equal(cat.sites.length,57);
assert.equal(cat.tagPacks.length,13);
assert.equal(source.missions.length,42);
assert.equal(cat.tagPacks.filter(p=>p.faction).length,12);
assert.equal(new Set(cat.sites.map(s=>s.id)).size,57);
assert.equal(new Set(source.missions.map(m=>m.id)).size,42);
assert.equal(new Set(cat.sites.map(s=>s.sceneMapId)).size,20);
for(const site of cat.sites){assert.ok(mapIds.has(site.sceneMapId),`${site.id} map`);assert.equal(site.anchorPx,null,'unpositioned until GM authors geometry');}
const ids=new Set(source.missions.map(m=>m.id));
const oldIds=new Set(JSON.parse(readFileSync(resolve(path,'london-missions.json'))).missions.map(m=>m.id));
for(const m of source.missions){
 assert.ok(m.tagging);assert.ok(m.objectives.length>0);
 assert.ok(m.requires.every(r=>ids.has(r)||oldIds.has(r)));
 assert.ok(m.objectives.every(o=>o.auto?.on==='tagPlaced'),'all objectives require actual physical paint');
 assert.ok(m.stops.every(s=>mapIds.has(s.mapId)));
 const siteIds=new Set(m.tagging.sites);
 assert.ok(m.objectives.every(o=>o.auto.siteId?siteIds.has(o.auto.siteId):o.auto.siteIds?.every(id=>siteIds.has(id))));
}
assert.deepEqual(QUALITY,['severeFailure','costlyFailure','narrowSuccess','fullSuccess','strongSuccess','exceptionalSuccess']);
assert.equal(qualityAtLeast('costlyFailure','narrowSuccess'),false);
assert.equal(qualityAtLeast('fullSuccess','narrowSuccess'),true);
assert.equal(tagMinutes('fullSuccess','train'),7);
assert.equal(witnessedTag({approved:true,policeNear:true}).witnessed,false);
assert.equal(witnessedTag({approved:false,policeNear:true}).byPolice,true);
assert.equal(rectDistanceSquares({x:0,y:0,width:2,height:2},{x:201,y:0,width:1,height:1},100),0.01);
assert.equal(rectDistanceSquares({x:0,y:0,width:2,height:2},{x:400,y:400,width:1,height:1},100)>2,true);
assert.deepEqual(computeTileGeometry({x:100,y:100,width:1,height:1}, {grid:{size:100}}),{x:50,y:101,width:200,height:98,rotation:0});
const rec=(identity,quality,siteId,status='visible')=>({identity,outcomeKey:quality,siteId,status,createdAtWorldSeconds:1});
assert.deepEqual(territoryForMarks([rec('TAG-AD','strongSuccess','site1'),rec('TAG-STREET','fullSuccess','site2'),rec('TAG-AD','exceptionalSuccess','site1','covered')]),{AD:3,CREW:2});
assert.equal(canCreditPaintObjective({on:'tagPlaced',siteId:'A',identity:'TAG-AD',minQuality:'fullSuccess'},{on:'tagPlaced',markId:'m',missionId:'tg-ad-01',siteId:'A',identity:'TAG-AD',outcomeKey:'strongSuccess'}),true);
assert.equal(canCreditPaintObjective({on:'tagPlaced',siteId:'A',identity:'TAG-AD',minQuality:'strongSuccess'},{on:'tagPlaced',markId:'m',missionId:'tg-ad-01',siteId:'A',identity:'TAG-AD',outcomeKey:'fullSuccess'}),false);
// Test complete 42-mission integration via actual missionData() loader; old catalogue is preserved, not rewritten.
const merged=await missionData();
assert.equal(merged.missions.length,179);
assert.equal(merged.missions.filter(m=>m.group==='radio').length,12);
assert.equal(merged.groups.filter(g=>g.key==='tagging').length,1);
const intro=merged.missions.find(m=>m.id==='tg-intro-01');assert.ok(intro);
let state={'tg-intro-01':{status:'active',runId:'run-1',actorIds:['a'],ticks:{}}};
const ev={on:'tagPlaced',missionId:intro.id,markId:'mark-1',missionRunId:'run-1',siteId:intro.tagging.sites[0],identity:'TAG-STREET',outcomeKey:'narrowSuccess',actorId:'a'};
assert.deepEqual(applyEvent([intro],state,{...ev,markId:'failed-mark',outcomeKey:'costlyFailure'}),[],'failed paints do not count');
assert.deepEqual(applyEvent([intro],state,ev),[intro.id]);
assert.equal(state[intro.id].ticks['tag-1'],1);
assert.deepEqual(applyEvent([intro],state,ev),[],'same mark cannot replay');
assert.deepEqual(applyEvent([intro],state,{...ev,markId:'mark-2'}),[],'the same site never double counts');
assert.equal(state[intro.id].ticks['tag-1'],1);
const third=merged.missions.find(m=>m.id==='tg-ch-03');
state={'tg-ch-03':{status:'active',runId:'run-3',actorIds:['a'],ticks:{}}};
for(const [i,siteId] of third.tagging.sites.entries()){
 const event={...ev,missionId:third.id,missionRunId:'run-3',markId:'ch-'+i,siteId,identity:'TAG-CH',outcomeKey:i===0?'strongSuccess':'narrowSuccess'};
 applyEvent([third],state,event);
}
assert.equal(state['tg-ch-03'].ticks['quality-bonus'],1,'bonus only for actually strong sites');
assert.equal(third.objectives.every(o=>(state['tg-ch-03'].ticks[o.id]||0)>=needed(o)),true);
console.log('graffiti core: 42 missions, 57 planned spots/20 maps, SVG quality gates, territory scores, anti-replay and complete mission group integration — ok');
