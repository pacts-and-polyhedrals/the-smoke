import assert from 'node:assert/strict';
import './runtime-stub.mjs';
import {registerGraffitiSettings,tagRecords,graffitiAPI} from '../module/graffiti/runtime.mjs';
import {request} from '../module/world/net.mjs';

const NS='the-smoke';
registerGraffitiSettings();
const user={id:'gm',isGM:true,active:true};
game.user=user; game.users=Object.assign([user],{activeGM:user,get:id=>id==='gm'?user:null,filter:fn=>[user].filter(fn)});
let elapsed=0,heat=0,rep=0,uploadCount=0;
game.time={worldTime:2000,advance:async seconds=>{elapsed+=seconds;game.time.worldTime+=seconds;return game.time.worldTime;}};
const getFlag=(flags,key)=>flags?.[key]||null;
const actor={id:'actor-a',uuid:'Actor.actor-a',name:'Hatch',type:'character',isOwner:true,hasPlayerOwner:true,
 system:{rep:{street:0,crew:0,xp:0},stats:{grf:{die:8}},stage:1,resources:{hustle:{value:5}},cash:0},
 testUserPermission:(user,role)=>user.id==='gm',
 update:async changes=>{for(const[k,v]of Object.entries(changes)){if(k==='system.rep.street'){actor.system.rep.street=v;rep=v;}else if(k==='system.cash')actor.system.cash=v;else if(k==='system.rep.xp')actor.system.rep.xp=v;}},
 reportCrime:async()=>heat++, changeCash:async d=>{actor.system.cash+=d;},
};
const spray={id:'spray',type:'gear',name:'Spray Paint',system:{quantity:1},flags:{},
 getFlag(ns,k){return this.flags[k]},async setFlag(ns,k,v){this.flags[k]=v;return this},
 async delete(){this.system.quantity=0;return this},async update(d){if(d['system.quantity'])this.system.quantity=d['system.quantity'];}};
actor.items=[spray];
game.actors=Object.assign([actor],{get:id=>id===actor.id?actor:null});
const tokens=new Map();
function collection(map){return {get:id=>map.get(id),find:fn=>[...map.values()].find(fn),filter:fn=>[...map.values()].filter(fn),some:fn=>[...map.values()].some(fn),[Symbol.iterator]:()=>map.values()};}
const tileDocs=new Map(),scene={id:'scene-haggerston',name:'London Fields',grid:{size:100},flags:{},tiles:collection(tileDocs),
 getFlag(ns,k){return this.flags[k]},async setFlag(ns,k,v){this.flags[k]=v;return v},
 async createEmbeddedDocuments(type,arr){if(type!=='Tile')throw new Error('unexpected '+type);return arr.map((data,i)=>{const tile={...data,id:`tile${++uploadCount}`,getFlag(ns,k){return this.flags?.[ns]?.[k]}};tileDocs.set(tile.id,tile);return tile;});},
 async deleteEmbeddedDocuments(type,ids){for(const id of ids)tileDocs.delete(id);},
 async updateEmbeddedDocuments(type,updates){for(const up of updates){Object.assign(tileDocs.get(up._id),up);}return updates;}
};
const siteId='SP-LF-KINGSLAND-ARCH';
const spot={id:'sp1',actor:{type:'npc'},parent:scene,x:150,y:150,width:1,height:1,name:'Kingsland arch wall',hidden:false,
 getFlag(ns,k){if(k==='tagSpot')return {siteId,surface:'wall',approved:true};return null}};
const characterToken={id:'pc',actorId:actor.id,parent:scene,x:100,y:100,width:1,height:1,hidden:false,getFlag:()=>null};
tokens.set(spot.id,spot);tokens.set(characterToken.id,characterToken);
scene.tokens=collection(tokens);
game.scenes=Object.assign([scene],{get:id=>id===scene.id?scene:null});
scene.getFlag=(ns,k)=> k==='streetAtlas'?{id:'LDN-HAGGERSTON'}:scene.flags[k];
const messages=new Map();
game.messages={get:id=>messages.get(id),[Symbol.iterator]:()=>messages.values()};
game.settings.get=(ns,k)=>({missions:{'tg-intro-02':{status:'active',runId:'run-2',actorIds:[actor.id],ticks:{}}},factions:{},graffitiTerritory:{}})[k] || null;
const settings={missions:{'tg-intro-02':{status:'active',runId:'run-2',actorIds:[actor.id],ticks:{}}},factions:{},graffitiTerritory:{}};
game.settings.get=(ns,k)=>settings[k];game.settings.set=async(ns,k,v)=>{settings[k]=v;return v};
globalThis.FilePicker={uploadPersistent:async(ns,path,file)=>({path:`storage/${ns}/${path}/${file.name}`})};
function addRoll(id,attemptId,outcomeKey='strongSuccess',stat='grf',band='easy'){
 const flags={roll:{actorUuid:actor.uuid,userId:'gm',stat,band,outcomeKey,blinder:'ordinary',context:{kind:'tagPaint',attemptId,sceneId:scene.id,spotTokenId:'sp1',actorId:actor.id}}};
 const msg={id,getFlag(ns,k){return flags[k]},async setFlag(ns,k,v){flags[k]=v;}};messages.set(id,msg);return msg;
}
const design={text:'HATCH',style:'bubble',fill:'#ffee33',outline:'#111111'};
const req=(rollMessageId,attemptId,missionId='tg-intro-02')=>request('graffiti.paint',{sceneId:scene.id,spotTokenId:'sp1',actorId:actor.id,rollMessageId,attemptId,tagPackId:'TAG-STREET',missionId,design});
addRoll('roll1','paint_123456789','strongSuccess');
const result=await req('roll1','paint_123456789');
assert.equal(result.quality,'strongSuccess');assert.equal(tileDocs.size,1);assert.equal(tagRecords(scene).length,1);
assert.equal(spray.getFlag(NS,'spray').remainingCharges,5);
assert.equal(rep,1);assert.equal(elapsed,360);assert.equal(heat,0);
assert.equal(settings.graffitiTerritory['LDN-HAGGERSTON'].CREW,3);
assert.equal(settings.missions['tg-intro-02'].ticks['tag-1'],1);
const again=await req('roll1','paint_123456789');assert.equal(again.alreadyPainted,true);
assert.equal(spray.getFlag(NS,'spray').remainingCharges,5);assert.equal(tileDocs.size,1);assert.equal(elapsed,360);
addRoll('roll2','paint_223456789','exceptionalSuccess');
await req('roll2','paint_223456789');
assert.equal(tileDocs.size,1,'repaint replaces the old decal');
assert.equal(tagRecords(scene).filter(x=>x.status==='visible').length,1);
assert.equal(settings.graffitiTerritory['LDN-HAGGERSTON'].CREW,5,'better paint improves territory');
assert.equal(rep,1,'same artist/surface earns no repeated rep');
assert.equal(settings.missions['tg-intro-02'].ticks['tag-1'],1,'same spot gets no extra mission tick');
// Forged or unrelated rolls can't create a new world decal.
addRoll('roll3','paint_323456789','strongSuccess','aim');
await assert.rejects(()=>req('roll3','paint_323456789'),/Roll authorisation/);
assert.equal(tileDocs.size,1);assert.equal(spray.getFlag(NS,'spray').remainingCharges,4);
// Repair missing tile without re-rolling or charging.
tileDocs.clear();assert.equal(await graffitiAPI.repair(scene),1);assert.equal(tileDocs.size,1);
assert.equal(spray.getFlag(NS,'spray').remainingCharges,4);assert.equal(settings.graffitiTerritory['LDN-HAGGERSTON'].CREW,5);
// Non-catalogue, auto-named street markers can be painted without a mission
// assignment. They keep their own territory site key and do not tick jobs at
// arbitrary addresses (or introduce fictitious rewards).
spot.name='Mare Street 1';
spot.getFlag=(ns,k)=>k==='tagSpot'?{siteId:'STREET-scene-haggerston-quick1',auto:true,root:'Mare Street',number:1,surface:'wall',approved:false}:null;
addRoll('rollfree','paint_423456789','fullSuccess','grf','medium');
const free=await req('rollfree','paint_423456789',null);
assert.equal(free.quality,'fullSuccess');
assert.equal(tileDocs.size,2,'new auto marker adds a new persistent decal');
assert.equal(tagRecords(scene).filter(m=>m.status==='visible').length,2);
assert.equal(tagRecords(scene).at(-1).siteId,'STREET-scene-haggerston-quick1');
assert.equal(tagRecords(scene).at(-1).missionId,null);
assert.equal(settings.missions['tg-intro-02'].ticks['tag-1'],1,'free paint cannot tick unrelated commission');
assert.equal(settings.graffitiTerritory['LDN-HAGGERSTON'].CREW,7,'free paint still earns district territory');
console.log('graffiti authority: server-matched Graft roll, tile persistence, charges, Watch, mission proof, territory, anti-forgery/replay, repaint and cosmetic repair — ok');
