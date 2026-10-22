// Foundry's preCreateToken/preUpdateToken return false to CANCEL a token write.
// The graffiti authoring hooks must not cancel normal drag/drop, police, NPC,
// pedestrian or vehicle movement, even when the system is loaded.
import assert from 'node:assert/strict';
import {hooks} from './runtime-stub.mjs';
import {installGraffiti} from '../module/graffiti/runtime.mjs';
const NS='the-smoke', gm={id:'gm',isGM:true,active:true};
game.user=gm;game.users=Object.assign([gm],{activeGM:gm});
game.actors=Object.assign([],{get:()=>null,find:fn=>({getFlag:(ns,key)=>key==='graffitiSpotActor'?true:null})});
installGraffiti();
const created=hooks.preCreateToken||[], moved=hooks.preUpdateToken||[];
assert.ok(created.length>=1&&moved.length>=1,'graffiti hooks have registered');
const ordinary={id:'pc1',actorId:'player-1',name:'Player Character',x:500,y:300,width:1,height:1,parent:{id:'scene',grid:{size:100},tokens:[]},actor:{type:'character',getFlag:()=>null},getFlag:()=>null};
const npc={...ordinary,id:'npc1',actor:{type:'npc',getFlag:()=>null}};
const vehicle={...ordinary,id:'van1',actor:{type:'vehicle',getFlag:()=>null}};
for(const token of [ordinary,npc,vehicle]){
 for(const hook of created){
  const out=hook(token,{actorId:token.actorId,x:200,y:100},{},'gm');
  assert.notEqual(out,false,`creation must NOT be cancelled: ${token.id}`);
 }
 for(const hook of moved){
  const change={x:700,y:400};
  const out=hook(token,change,{},'gm');
  assert.notEqual(out,false,`drag must NOT be cancelled: ${token.id}`);
  assert.deepEqual(change,{x:700,y:400},'movement coordinates remain untouched');
 }
}
// Correct Foundry signature has options in third position and the user ID fourth.
const authored={id:'spot-1',actor:{type:'npc',getFlag:(ns,k)=>k==='graffitiSpotActor'?true:null},actorId:'spot-actor',x:50,y:50,width:.5,height:.5,
 parent:{id:'scene',grid:{size:100},getFlag:()=>({zones:[{id:'morning',name:'Morning Lane',kind:'road',roads:['Morning Lane'],rect:[0,0,800,800]}]}),tokens:[]},getFlag:()=>null,
 updateSource(patch){this.patch=patch;}};
for(const hook of created)assert.notEqual(hook(authored,{actorId:authored.actorId,x:50,y:50,width:.5,height:.5},{},'gm'),false);
assert.equal(authored.patch?.name,'Morning Lane 1','real markers receive an automatic street label');
assert.ok(authored.patch?.[`flags.${NS}.tagSpot`]?.siteId?.startsWith('STREET-'));
console.log('token hooks: Foundry four-argument signature, PC/NPC/vehicle drops and drag movements never cancelled, graffiti markers still auto-named — ok');
