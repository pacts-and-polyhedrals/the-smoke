import './runtime-stub.mjs';
import assert from 'node:assert/strict';
import {fakeActor,J,chat} from './fakes.mjs';
const NS='the-smoke',m=J('london-missions.json').missions.find(m=>m.id==='ad1');
const settings=new Map();game.settings.get=(_ns,k)=>settings.get(k);game.settings.set=async(_ns,k,v)=>settings.set(k,JSON.parse(JSON.stringify(v)));
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'player',name:'Player',isGM:false,active:true};
game.user=gm;game.users=Object.assign([gm,p1],{activeGM:gm,get:id=>[gm,p1].find(x=>x.id===id)});
let sn=0;
function makeScene(id,venue=false){
 const v=venue?J('london-venues.json').maps.find(x=>x.id===id):J('london-street-atlas.json').maps.find(x=>x.id===id);
 const flags={[NS]:{[venue?'place':'streetAtlas']:{id,links:v.links},zoneGraph:{zones:v.zones}}};
 const tokens=[];const scene={id:'sc-'+id,name:v.name,width:v.width,height:v.height,grid:{size:100},flags,
  getFlag:(_ns,k)=>flags[NS][k],
  tokens:Object.assign(tokens,{get:id=>tokens.find(t=>t.id===id),get contents(){return tokens;}}),
  async createEmbeddedDocuments(_t,items){return items.map(d=>{
   const t={...d,id:'tok'+ ++sn, parent:scene,actor:game.actors.get(d.actorId),
    getFlag:(ns,key)=>t.flags?.[ns]?.[key],toObject:()=>JSON.parse(JSON.stringify(d)),
    async update(change){Object.assign(t,change);return t;}};tokens.push(t);return t;});},
  async deleteEmbeddedDocuments(_t,ids){for(const id of ids){const at=tokens.findIndex(t=>t.id===id);if(at>=0)tokens.splice(at,1);}}
 };return scene;
}
const hr=makeScene('LDV-HR7',true), hc=makeScene('LDV-HC2',true),other=makeScene('LDV-DA2',true);
game.scenes=Object.assign([hr,hc,other],{get:id=>[hr,hc,other].find(s=>s.id===id)});
const jaz=fakeActor({name:'Jaz',cash:0}),sal=fakeActor({name:'Sal',cash:0});
const props=[];const actorArray=[jaz,sal];game.actors=Object.assign(actorArray,{get:id=>Array.prototype.find.call(actorArray,a=>a.id===id)});
globalThis.Actor.implementation={create:async d=>{
 const a={id:'npc-'+ ++sn,type:d.type, name:d.name, flags:d.flags,system:{},
  getFlag:(ns,k)=>d.flags?.[ns]?.[k],
  async getTokenDocument(){return {toObject:()=>({actorId:a.id,name:a.name,width:1,height:1,flags:{[NS]:{}}})}}};
 actorArray.push(a);props.push(a);return a;
}};
jaz.hasPlayerOwner=sal.hasPlayerOwner=true;
const asToken=(a,scene,x,y)=>{const token={id:'char'+ ++sn,actorId:a.id,actor:a,parent:scene,x,y,width:1,height:1};scene.tokens.push(token);return token;};
// Speaker Hall spans x=100..1700, y=1100..2300.
const j=asToken(jaz,hr,300,1300),s=asToken(sal,hr,390,1300);
const missions=await import('../module/world/missions.mjs'), propsMod=await import('../module/world/mission-props.mjs'), net=await import('../module/world/net.mjs');
const {linkAt,nearestExit}=await import('../module/map/map-transit.mjs');
// Footprint touches 200px edge strip, but its centre does not. Old code rejected.
const edge={grid:{size:100},getFlag:(_ns,k)=> k==='streetAtlas'?{links:[{kind:'edge',to:'second',toName:'Second',rect:[0,600,200,200]}]}:null};
assert.equal(linkAt(edge,{x:175,y:630,width:2,height:1}),null,'automatic transit remains centre strict');
assert.equal(linkAt(edge,{x:175,y:630,width:2,height:1},{near:true})?.to,'second','manual transit sees touching vehicle footprint');
assert.equal(linkAt(edge,{x:275,y:630,width:1,height:1},{near:true})?.to,'second','a door one-square approach is accepted');
assert.equal(linkAt(edge,{x:650,y:630,width:1,height:1},{near:true}),null,'distant exit never accepted');
assert.ok(nearestExit(edge,{x:650,y:630,width:1,height:1}).squares>1);

await net.request('mission.start',{id:m.id,actorIds:[jaz.id,sal.id]});
assert.equal(game.settings.get(NS,'missions')[m.id].status,'active');
assert.equal(hr.tokens.filter(t=>t.getFlag?.(NS,'missionProp')).length,2,'two separate speaker flight-case tokens appear in Speaker Hall');
const state=()=>settings.get('missions').ad1;
const first=hr.tokens.find(t=>t.getFlag?.(NS,'missionProp')?.serial==='p1:1');
const second=hr.tokens.find(t=>t.getFlag?.(NS,'missionProp')?.serial==='p1:2');
assert.ok(first&&second);
const stranger=fakeActor({name:'Stranger'});actorArray.push(stranger);
await assert.rejects(()=>net.dispatch('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'collect',actorId:stranger.id,sceneId:hr.id,tokenId:first.id,userId:'player'}),/not participating/i,'a different user may not collect using another actor or spoofing a mission');
await assert.rejects(()=>net.request('mission.start',{id:m.id,actorIds:[jaz.id,sal.id]}),/already active/i,'restarting an active mission must not orphan its existing cargo');
// Stand alongside cases
const near=t=>{j.x=t.x;j.y=t.y;s.x=t.x;s.y=t.y;};near(first);
await assert.rejects(()=>net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'deliver',actorId:jaz.id,sceneId:hr.id}),/collect/i);
await net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'collect',actorId:jaz.id,sceneId:hr.id,tokenId:first.id});
assert.equal(jaz.items.filter(i=>i.getFlag(NS,'missionCargo')).length,1,'case becomes an actual gear Item');
await assert.rejects(()=>net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'collect',actorId:jaz.id,sceneId:hr.id,tokenId:first.id}),/not on this map/i);
// Dropping puts a visible world token back at the character's feet.
await net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'drop',actorId:jaz.id,sceneId:hr.id});
assert.equal(jaz.items.filter(i=>i.getFlag(NS,'missionCargo')).length,0);
const dropped=hr.tokens.get(state().parcels['p1:1'].tokenId);assert.ok(dropped && dropped.getFlag(NS,'missionProp'));
// Another participant recovers dropped property.
await net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'collect',actorId:sal.id,sceneId:hr.id,tokenId:dropped.id});
assert.equal(sal.items.filter(i=>i.getFlag(NS,'missionCargo')).length,1);
// GM repair detects a cargo item accidentally deleted from the character sheet.
await sal.items.find(i=>i.getFlag(NS,'missionCargo')).delete();
await propsMod.ensureMissionProps(m);
assert.equal(sal.items.filter(i=>i.getFlag(NS,'missionCargo')).length,1,'missing held property is restored to the recorded carrier, never copied onto the ground');
// Collect the second flight-case as well.
near(second);await net.request('missionProp.move',{missionId:'ad1',serial:'p1:2',action:'collect',actorId:jaz.id,sceneId:hr.id,tokenId:second.id});
assert.equal(state().ticks.rig,2,'both units collected and mandatory objective ticks twice');
// Mission cargo moves with characters' actual inventory across map changes.
hr.tokens.splice(hr.tokens.indexOf(j),1);hr.tokens.splice(hr.tokens.indexOf(s),1);
j.parent=hc;s.parent=hc;hc.tokens.push(j,s);
await assert.rejects(()=>net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'deliver',actorId:jaz.id,sceneId:hc.id}),/collect|carrying/i);
// Round Chapel hall: x=100-900 y=100-1900.
s.x=2600;s.y=2200;
await assert.rejects(()=>net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'deliver',actorId:sal.id,sceneId:hc.id}),/correct mapped area/i,'arriving anywhere on the venue map is not sufficient');
s.x=200;s.y=400;j.x=230;j.y=430;
await net.request('missionProp.move',{missionId:'ad1',serial:'p1:1',action:'deliver',actorId:sal.id,sceneId:hc.id});
assert.equal(state().ticks.night,1,'first delivery does not complete a two-unit requirement');
assert.equal(sal.items.filter(i=>i.getFlag(NS,'missionCargo')).length,0);
await net.request('missionProp.move',{missionId:'ad1',serial:'p1:2',action:'deliver',actorId:jaz.id,sceneId:hc.id});
assert.equal(state().ticks.night,2,'two deliveries required');
assert.equal(state().status,'active','booking and live-room stages still required');
// New cargo status cannot be delivered twice, even by the GM.
await assert.rejects(()=>net.request('missionProp.move',{missionId:'ad1',serial:'p1:2',action:'deliver',actorId:jaz.id,sceneId:hc.id}),/collect/i);
await net.request('mission.tick',{id:'ad1',objId:'booking'});
await net.request('mission.tick',{id:'ad1',objId:'live'});
assert.equal(state().status,'done','a fully delivered job now pays out');
assert.ok(chat.some(c=>/MISSION PASSED/.test(c.content||'')));
// Existing vehicle systems use ownership, mission props never grant it.
assert.equal(first.actor?.type,'npc');
console.log('mission property: two real speakers, secure pickup, no dupe, ground drop, crew recovery, venue-required handover, auto ticks, completion; manual exits tolerate footprints — ok');
