// Radio-war locations and actions: valid authored street sites, non-owned tokens
// do not grant access, mission proof is event-driven and anti-replay, and the
// active GM controls all map writes and rewards.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './runtime-stub.mjs';
import {DEFAULT_STATIONS} from '../module/radio/stations.mjs';
import {radioWarLocations,syncRadioWarLocations,radioWarAtToken,radioWarState} from '../module/radio/war.mjs';
import {RADIO_WAR_ACTIONS,radioWarClaimKey,radioWarDay,selectedRadioSites,radioWarScore,radioWarTotals,radioContactPosition} from '../module/radio/war-core.mjs';
import {missionData,applyEvent} from '../module/world/missions.mjs';
import {playerActionsFor,playerContextAllowed} from '../module/interaction/player-context.mjs';
import {request} from '../module/world/net.mjs';
const NS='the-smoke';
const atlas=JSON.parse(readFileSync(new URL('../data/london-street-atlas.json',import.meta.url))).maps;
const locations=await radioWarLocations();
assert.equal(locations.length,6,'only the six active stations have fictional radio-war contacts');
for(const loc of locations){const map=atlas.find(x=>x.id===loc.mapId);assert.ok(map,loc.stationId+' scene exists');
 const zone=map.zones.find(z=>z.id===loc.zoneId);assert.ok(zone&&zone.rect.length===4,loc.stationId+' real mapped site');}
for(const loc of locations){
 const map=atlas.find(x=>x.id===loc.mapId),zone=map.zones.find(z=>z.id===loc.zoneId),g=map.gridSize||100;
 const pos=radioContactPosition(zone,map.zones,g),roads=map.zones.filter(z=>['road','junction','path'].includes(z.kind));
 const distance=Math.min(...roads.map(z=>{const [x,y,w,h]=z.rect;return Math.hypot(Math.max(x-pos.x,0,pos.x-x-w),Math.max(y-pos.y,0,pos.y-y-h))/g;}));
 assert.ok(distance<=.5,`${loc.stationId}: radio contact is beside a walkable street (distance ${distance})`);
}
const supported=selectedRadioSites(locations,DEFAULT_STATIONS);
assert.equal(supported.length,6,'only tuned/streaming stations appear by default');
assert.ok(!supported.some(x=>['codesouth','esencia-urbana'].includes(x.stationId)), 'unverified feeds do not generate silent map locations');
assert.equal(selectedRadioSites(locations,[...DEFAULT_STATIONS,{id:'codesouth',stream:'https://gm.example/live.mp3'}]).length,6,'retired broadcasters no longer have radio-war contacts');
assert.equal(radioWarScore('exceptionalSuccess'),5);assert.equal(radioWarScore('severeFailure'),-2);
assert.equal(radioWarDay(86399),0);assert.equal(radioWarDay(86400),1);
assert.notEqual(radioWarClaimKey('rude-fm','a',3),radioWarClaimKey('rude-fm','a',4));
assert.deepEqual(radioWarTotals({'point-blank':{influence:3},'vision-radio':{influence:2}},locations),{underground:3,licensed:2});
const missionCatalog=await missionData(),radioMissions=missionCatalog.missions.filter(m=>m.group==='radio');
assert.equal(radioMissions.length,12,'six working stations, two radio war commissions each');
assert.ok(missionCatalog.groups.some(g=>g.key==='radio'),'Mission Board has a Radio Wars group');
for(const loc of supported){
 const missions=radioMissions.filter(m=>m.radioWar.stationId===loc.stationId);
 assert.equal(missions.length,2,loc.stationId+' linked to two radio-war jobs');
 assert.ok(missions.every(m=>m.stops[0].mapId===loc.mapId),'mission route matches actual street map');
}
let st={'rw-point-blank-01':{status:'active',actorIds:['pc'],runId:'mission-run-a',ticks:{}}};
const good={on:'radioWar',missionId:'rw-point-blank-01',stationId:'point-blank',actionId:'promo',actorId:'pc',attemptId:'attempt-1',missionRunId:'mission-run-a'};
assert.deepEqual(applyEvent(radioMissions,st,good),['rw-point-blank-01'],'verified event records mission progress');
assert.equal(st['rw-point-blank-01'].ticks['radio-1'],1);
assert.deepEqual(applyEvent(radioMissions,st,good),[],'replay does not duplicate a mission objective');
const wrong={...good,missionId:'rw-rude-fm-01'};
assert.deepEqual(applyEvent(radioMissions,st,wrong),[],'wrong station/commission cannot credit this mission');
const gm={id:'gm',isGM:true,active:true},player={id:'p1',isGM:false,active:true};
game.user=gm;game.users=Object.assign([gm,player],{activeGM:gm,get:id=>[gm,player].find(x=>x.id===id),filter:fn=>[gm,player].filter(fn)});
const markerActor={id:'radio-contact',type:'npc',name:'Radio War Contact',getFlag:(ns,key)=>key==='radioWarActor'?true:null,
 async getTokenDocument(){return {toObject:()=>({actorId:'radio-contact',name:'Radio War Contact',width:.6,height:.6,texture:{src:'radio-relay.svg'},flags:{}})};}};
const pc={id:'pc',uuid:'Actor.pc',name:'Hatch',type:'character',isOwner:true,hasPlayerOwner:true,system:{rep:{street:0}},
 testUserPermission:(u,level)=>u.id==='p1'||u.isGM,async update(patch){this.system.rep.street=patch['system.rep.street']??this.system.rep.street;}};
game.actors=Object.assign([markerActor,pc],{get:id=>id==='pc'?pc:id==='radio-contact'?markerActor:null,find:fn=>[markerActor,pc].find(fn),filter:fn=>[markerActor,pc].filter(fn)});
const scenes=new Map();let count=0;
for(const loc of supported){const map=atlas.find(m=>m.id===loc.mapId);const docs=new Map();
 const scene={id:'scene-'+loc.stationId,name:map.name,grid:{size:map.gridSize||100},tokens:{get:id=>docs.get(id),find:fn=>[...docs.values()].find(fn),filter:fn=>[...docs.values()].filter(fn),some:fn=>[...docs.values()].some(fn),[Symbol.iterator]:()=>docs.values()},
  getFlag:(ns,key)=>key==='streetAtlas'?{id:map.id}:key==='zoneGraph'?{zones:map.zones}:null,
  async createEmbeddedDocuments(type,items){assert.equal(type,'Token');return items.map(raw=>{
    const tok={...raw,id:'station-'+(++count),parent:scene,actor:markerActor,
       getFlag(ns,key){return this.flags?.[ns]?.[key]??null;}};docs.set(tok.id,tok);return tok;});}};
 scenes.set(scene.id,scene);}
game.scenes=Object.assign([...scenes.values()],{get:id=>scenes.get(id)});
let stored={radioStations:'',radioPresetVersion:514,radioWarState:{},missions:{}};
game.settings.get=(ns,key)=>stored[key];game.settings.set=async(ns,key,val)=>{stored[key]=val;return val;};
assert.equal(await syncRadioWarLocations(),6,'one radio contact appears per working station and street map');
assert.equal(await syncRadioWarLocations(),0,'re-import does not duplicate already placed radio contacts');
let nodes=[...scenes.values()].map(scene=>[scene,[...scene.tokens][0]]);
for(const [scene,t] of nodes){assert.ok(t&&radioWarAtToken(t),'map token is a radio contact');
 assert.ok(playerActionsFor(t,player).some(x=>x.title.includes('Work this radio contact')),'players have a safe right-click action');
 globalThis.canvas={scene};assert.equal(playerContextAllowed({document:t,visible:true,isOwner:false},player),true,'non-owner can right-click contact');}
// Server-authorised task: require one exact real roll for one station, once per Banana Watch day.
const [scene,token]=nodes[0],user=player;
const playerToken={id:'pc-scene',actorId:pc.id,x:token.x+60,y:token.y,width:1,height:1,hidden:false,parent:scene,getFlag:()=>null};
// The fixture collection uses a Map under the hood; expose the character token in the scene.
const oldTokens=scene.tokens;scene.tokens={get:id=>id===playerToken.id?playerToken:oldTokens.get(id),find:fn=>[...oldTokens,playerToken].find(fn),filter:fn=>[...oldTokens,playerToken].filter(fn),some:fn=>[...oldTokens,playerToken].some(fn),[Symbol.iterator]:()=>[...oldTokens,playerToken][Symbol.iterator]()};
let elapsed=0;game.time={worldTime:6000,advance:async n=>{elapsed+=n;game.time.worldTime+=n;}};
const messages=new Map();game.messages={get:id=>messages.get(id)};
function roll(id,attempt,stat='frt',outcome='strongSuccess'){
 const flags={roll:{actorUuid:pc.uuid,userId:'gm',stat,band:'medium',outcomeKey:outcome,context:{kind:'radioWar',attemptId:attempt,actorId:pc.id,sceneId:scene.id,tokenId:token.id,actionId:'promo'}}};
 const msg={id,getFlag:(ns,key)=>flags[key]??null,async setFlag(ns,key,val){flags[key]=val;}};messages.set(id,msg);return msg;}
// GM issuing as themselves is allowed; another connected player's roll is checked by its sender ID.
roll('roll1','attempt-000001');
const input={sceneId:scene.id,tokenId:token.id,actorId:pc.id,actionId:'promo',rollMessageId:'roll1',attemptId:'attempt-000001'};
const win=await request('radioWar.act',input);
assert.equal(win.points,3);assert.equal(win.repGain,1);assert.equal(elapsed,RADIO_WAR_ACTIONS.promo.minutes*60);
assert.equal(radioWarState()['point-blank'].influence,3);assert.equal(pc.system.rep.street,1);
const replay=await request('radioWar.act',input);
assert.equal(replay.alreadyWorked,true,'an interrupted request can safely retry without paying twice');
assert.equal(replay.repGain,0);assert.equal(replay.minutes,0);
assert.equal(radioWarState()['point-blank'].influence,3);assert.equal(pc.system.rep.street,1);assert.equal(elapsed,RADIO_WAR_ACTIONS.promo.minutes*60);
roll('roll2','attempt-000002','aim');
await assert.rejects(request('radioWar.act',{...input,rollMessageId:'roll2',attemptId:'attempt-000002'}),/verified radio-war attempt/,'forged stat refused');
assert.equal(radioWarState()['point-blank'].influence,3,'forgery awards nothing');
game.time.worldTime=86400+1000;
assert.equal((await request('radioWar.act',input)).alreadyWorked,true,'new Watch day cannot reset idempotence for an old roll');
assert.equal(radioWarState()['point-blank'].influence,3,'new-day replay awards nothing');
console.log('radio wars: 6 canonical sites / 6 active relays, 12 missions, real map tokens, player right-click, GM-verified rolls, Watch time, Rep/influence, anti-replay and wrong-station safeguards — ok');
