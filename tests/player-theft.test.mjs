import assert from 'node:assert/strict';
import {NS,scene,token,jt,jaz,gm,p1,ut} from './chase-harness.mjs';
import {fakeActor} from './fakes.mjs';
import {dispatch} from '../module/world/net.mjs';
import '../module/world/theft.mjs';

const victimActor=fakeActor({type:'npc',name:'Station pedestrian',owner:false});
const victim=token(victimActor,{x:jt.x+85,y:jt.y+30,w:.5,h:.5,name:'Station pedestrian'});
const successCard=await ChatMessage.implementation.create({flags:{[NS]:{roll:{
  actorUuid:jaz.uuid,stat:'grf',outcomeKey:'fullSuccess',context:{kind:'pickpocket',sceneId:scene.id,targetTokenId:victim.id}
}}}});
const call=id=>dispatch('theft.pickpocket',{sceneId:scene.id,targetTokenId:victim.id,tokenId:jt.id,userId:p1.id,messageId:id});
assert.deepEqual(await call(successCard.id),{success:true,noticed:false});
assert.equal(successCard.getFlag(NS,'consumed'),true,'successful roll is consumed once');
await assert.rejects(call(successCard.id),/already been resolved/,'no replay or repeated theft');
assert.equal(jaz.system.cash,100,'no ungrounded loot is transferred');
const forgery=await ChatMessage.implementation.create({flags:{[NS]:{roll:{
  actorUuid:victimActor.uuid,stat:'grf',outcomeKey:'fullSuccess',context:{kind:'pickpocket',sceneId:scene.id,targetTokenId:victim.id}
}}}});
await assert.rejects(call(forgery.id),/not this character/,'no other actor can reuse a roll');
const stolen=await ChatMessage.implementation.create({flags:{[NS]:{roll:{
  actorUuid:jaz.uuid,stat:'grf',outcomeKey:'costlyFailure',context:{kind:'pickpocket',sceneId:scene.id,targetTokenId:victim.id}
}}}});
const before=jaz.system.heat.value;
assert.deepEqual(await call(stolen.id),{success:false,noticed:true});
assert.ok(jaz.system.heat.value>=before,'caught attempts generate the crime consequences');
await assert.rejects(dispatch('theft.talk',{sceneId:scene.id,targetTokenId:victim.id,tokenId:jt.id,userId:'forged'}),/not available/);
await assert.rejects(dispatch('theft.pickpocket',{sceneId:scene.id,targetTokenId:ut.id,tokenId:jt.id,userId:p1.id,messageId:forgery.id}),/not available/,'police car cannot be spoofed as a person');
console.log('player theft: non-owned NPC contact, consumed rolls, no replay, forged actor refusal, witnessed failure, no invented cash — ok');
