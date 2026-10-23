import './runtime-stub.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileMission,validateContract,requirementsFor,checkpointNeeded,checkpointReady,checkpointDone,contributionMissing,allCheckpointsDone,branchState,canAcceptReceipt,recordReceipt,locationRelaxed} from '../module/rules/mission-contract.mjs';
import {applyEvent} from '../module/world/missions.mjs';
const read=f=>JSON.parse(readFileSync(new URL(`../data/${f}`,import.meta.url),'utf8'));
const catalog=['london-missions.json','tagging-missions.json','radio-war-missions.json'].flatMap(f=>read(f).missions);
const contracts=read('mission-automation.json');
assert.equal(catalog.length,179);
let count=0,scenarios=0;
for(const base of catalog){
 const c=contracts.missions[base.id];assert.deepEqual(validateContract(base,c),[],base.id);
 const m=compileMission(base,c);assert.equal(m.objectives.length,base.objectives.length);count+=m.objectives.length;
 for(const n of [1,2,3,4,5,6]){
  const s={status:'active',automationVersion:1,runId:'test-run',actorIds:Array.from({length:n},(_,i)=>`pc${i}`),ticks:{},requirements:requirementsFor(m,Array(n).fill('x')),contributions:{},choices:{},receipts:{}};
  for(let rounds=0;rounds<m.objectives.length+2;rounds++)for(const o of m.objectives){
   if(checkpointDone(o,s)||!checkpointReady(m,o,s))continue;
   const a=o.checkpoint.locations[0],choice=o.checkpoint.choices?.[0]?.id;
   for(let i=0;i<checkpointNeeded(o,s);i++){
    const ev={verified:true,on:o.auto.on,missionId:m.id,missionRunId:s.runId,actorId:s.actorIds[i%n],stepId:o.id,proofId:`${o.id}:${i}`,success:true,choice,location:{mapId:a.mapId,x:a.x,y:a.y,grid:100,zoneIds:[a.zoneId]},targetGroup:o.checkpoint.targetGroup};
    assert.equal(canAcceptReceipt(m,o,s,ev),true,`${m.id}/${o.id}/${n}`);
    for(const bad of [{missionId:'other'}, {missionRunId:'old'}, {verified:false}, {actorId:'outsider'}, {location:{mapId:'wrong-map',x:a.x,y:a.y}}]){if(bad.location&&locationRelaxed(o,{...ev,...bad}))continue;   // 0.5.27: wheels, target nicks, fence sales, paint/radio/cargo prove their own place
     assert.equal(canAcceptReceipt(m,o,s,{...ev,...bad}),false,`${m.id}/${o.id}: bad proof`);}
    recordReceipt(o,s,ev);s.ticks[o.id]=(s.ticks[o.id]||0)+1;
    assert.equal(canAcceptReceipt(m,o,s,ev),false,'receipt replay');
   }
  }
  assert.ok(m.objectives.every(o=>checkpointDone(o,s)),`${m.id}: every graph checkpoint is reachable for ${n} players`);
  for(const id of s.actorIds){s.contributions[id]??={};s.contributions[id].support={stepId:'support-scout'};}
  assert.deepEqual(contributionMissing(s),[]);assert.equal(allCheckpointsDone(m,s),true);scenarios++;
 }
}
assert.equal(count,894);assert.equal(scenarios,1074);
const m=compileMission(catalog[0],contracts.missions.m01);
assert.equal(requirementsFor(m,['1','2','3','4']).nick,4);assert.equal(requirementsFor(m,['1']).nick,2);
const minimal={id:'first',objectives:[{id:'collect',auto:{on:'cargoCollected',propId:'p1',count:2}}]};
const other={...minimal,id:'second'},state={first:{status:'active',runId:'a',actorIds:['pc'],ticks:{}},second:{status:'active',runId:'b',actorIds:['pc'],ticks:{}}};
const parcel={on:'cargoCollected',missionId:'first',missionRunId:'a',serial:'p1:1',propId:'p1',status:'held',actorId:'pc'};
assert.deepEqual(applyEvent([minimal,other],state,parcel),['first']);assert.equal(state.second.ticks.collect,undefined);
assert.deepEqual(applyEvent([minimal,other],state,parcel),[],'drop/recollect does not pay twice');
assert.deepEqual(applyEvent([minimal,other],state,{...parcel,missionRunId:'old',serial:'p1:2'}),[]);
const m12=compileMission(catalog.find(m=>m.id==='m12'),contracts.missions.m12);
for(const o of m12.objectives.filter(o=>o.id.startsWith('physical-')))assert.equal(branchState(o,{choices:{ending:'stretch'}}),'excluded');
const source=readFileSync(new URL('../templates/actor-sheet.hbs',import.meta.url),'utf8');
assert.equal((source.match(/data-phone/g)||[]).length,1,'one Blower button');
const street=source.slice(source.indexOf('data-tab="street"'),source.indexOf('data-tab="kit"'));
assert.match(street,/system.states.onARoll/);assert.match(street,/system.states.offGame/);
console.log(`mission v2 contracts: ${count} located checkpoints; ${scenarios} crew graph scenarios; run/actor/location/replay safeguards, unique cargo, branches, and sheet layout passed`);
