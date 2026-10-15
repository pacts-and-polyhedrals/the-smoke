import {NS,STAT_KEYS,STATS,DIE_LADDER} from './config.mjs';
import {isSuccess} from './rules/core.mjs';
import {CONDITION_EFFECTS,cannotDrive} from './rules/conditions.mjs';
import {request,registerHandler,isLeader,card,esc} from './world/net.mjs';
import {BOARD_GATES} from './vehicles/vehicle-boarding.mjs';
import {zonesOf,tokenRect,mapIdOf} from './world/spawn.mjs';
import {arrivedAt} from './rules/jobs-core.mjs';
import {distanceSquares} from './world/spawn.mjs';
import {wasted} from './world/heat.mjs';
const {DialogV2}=foundry.applications.api;
export class SmokeCombatant extends Combatant{
  _getInitiativeFormula(){return this.actor?.type==='vehicle'?'1d6 + @vehicle.handling':'1d6 + @statMods.mov';}
}
const owns=(a,u=game.user)=>u?.isGM||a?.testUserPermission(u,'OWNER');
export async function firstAid(healer){
  if(!owns(healer))throw new Error('Use your own character to give first aid.');
  const token=[...game.user.targets][0]?.document,patient=token?.actor??healer;
  if(!patient.isPerson)throw new Error('First aid is for people.');
  const healerToken=healer.token??canvas?.scene?.tokens.find(t=>t.actorId===healer.id),patientToken=token??healerToken;
  if(!game.user.isGM&&(!healerToken||!patientToken||healerToken.parent.id!==patientToken.parent.id||distanceSquares(healerToken,patientToken)>2.2))throw new Error('Get beside the patient first.');
  const out=await healer.rollDialog('sav',{band:'medium',fixedTarget:true,label:`First aid → ${patient.name}`,context:{kind:'firstAid',target:patient.uuid,healerToken:healerToken?.uuid,patientToken:patientToken?.uuid}});if(!out?.result.success)return;
  return request('aid.offer',{messageId:out.message.id});
}
registerHandler('aid.offer',async({messageId,userId})=>{
 const msg=game.messages.get(messageId),r=msg?.getFlag(NS,'roll'),user=game.users.get(userId);
 if(!r?.success||r.stat!=='sav'||r.context?.kind!=='firstAid'||msg.getFlag(NS,'aidOffered'))throw new Error('That treatment roll is unavailable.');
 const healer=await fromUuid(r.actorUuid),patient=await fromUuid(r.context.target);
 if(!owns(healer,user)||!patient?.isPerson)throw new Error('Invalid treatment.');
 const revision=Number(patient.getFlag(NS,'woundRevision')||0);
 if(patient.getFlag(NS,'aidRevision')===revision)throw new Error('This injury has already had first aid.');
 if(patient.system.resources.health.value>=patient.system.resources.health.max&&!patient.items.some(i=>i.type==='condition'&&['Bleeding','Hurt','Down'].includes(i.name)))throw new Error('They do not need first aid.');
 const ht=r.context.healerToken&&await fromUuid(r.context.healerToken),pt=r.context.patientToken&&await fromUuid(r.context.patientToken);
 if(!user.isGM&&(!ht||!pt||ht.parent.id!==pt.parent.id||distanceSquares(ht,pt)>2.2))throw new Error('Get beside the patient first.');
 await msg.setFlag(NS,'aidOffered',true);
 const aidMessage=await card('FIRST AID',`${healer.name} patches up ${patient.name}`,`<p>Restore 2 Health and stop Bleeding and Hurt. The patient or GM applies this once.</p><button type="button" data-smoke-aid="${esc(patient.uuid)}">Apply first aid</button>`,'win',{flags:{[NS]:{aid:{target:patient.uuid,rollId:msg.id,revision}}}});
 return {messageId:aidMessage.id};
});
registerHandler('aid.apply',async({messageId,userId})=>{
  const msg=game.messages.get(messageId),aid=msg?.getFlag(NS,'aid');if(!aid||msg.getFlag(NS,'resolved'))return;
  const a=await fromUuid(aid.target),u=game.users.get(userId);if(!owns(a,u))throw new Error('The patient or GM applies treatment.');
  if(a.getFlag(NS,'aidRevision')===aid.revision)throw new Error('This injury has already had first aid.');
  if(Number(a.getFlag(NS,'woundRevision')||0)!==aid.revision)throw new Error('The patient has been hurt again. Make a fresh treatment roll.');
  await msg.setFlag(NS,'resolved',true);await a.setFlag(NS,'aidRevision',aid.revision);await a.heal(2);await a.removeCondition('Bleeding');await a.removeCondition('Hurt');
});
export async function rest(actor){
  if(!owns(actor))throw new Error('Not your character.');
  const t=actor.token??canvas?.scene?.tokens.find(x=>x.actorId===actor.id);
  const service=zonesOf(t?.parent).find(z=>z.service==='safehouse');
  if(!game.user.isGM&&(!t||!service||!arrivedAt(zonesOf(t.parent),service.id,tokenRect(t))))throw new Error('Get to the flat or a safehouse before resting.');
  if(Number(actor.system.heat.value)>0)throw new Error('Lose the Heat before resting.');
  if(actor.items.some(i=>i.type==='condition'&&i.name==='Bleeding'))throw new Error('Stop the Bleeding with first aid before resting.');
  if(!await DialogV2.confirm({window:{title:`A night off · ${actor.name}`},content:'<p>A safe night restores Health and Hustle and removes Bruised, Hurt, Knackered, Shaken, Mullered, Gassed, Prone, Stunned and In Pain. Broken needs A&E and time.</p>'}))return;
  return request('recovery.rest',{actorUuid:actor.uuid,sceneId:t?.parent.id,tokenId:t?.id});
}
registerHandler('recovery.rest',async({actorUuid,sceneId,tokenId,userId})=>{
  const actor=await fromUuid(actorUuid),user=game.users.get(userId);if(!actor?.isPerson||!owns(actor,user))throw new Error('Not your character.');
 const token=game.scenes.get(sceneId)?.tokens.get(tokenId),zones=zonesOf(token?.parent),safe=token&&zones.find(z=>z.service==='safehouse'&&arrivedAt(zones,z.id,tokenRect(token)));
  if(!user.isGM&&(!token||token.actorId!==actor.id||!safe))throw new Error('Get to a safehouse before resting.');
  if(actor.system.heat.value>0||actor.items.some(i=>i.type==='condition'&&i.name==='Bleeding'))throw new Error('Lose the Heat and stop Bleeding before resting.');
  await actor.update({'system.resources.health.value':actor.system.resources.health.max,'system.resources.hustle.value':actor.system.resources.hustle.max,'system.states.down':false,'system.states.downRounds':0,'system.states.reactionUsed':false,'system.states.offGame':false,'system.states.onARoll':false});
  const remove=['Bruised','Hurt','Knackered','Shaken','Mullered','Gassed','Prone','Stunned','In Pain','Down'];
  await actor.deleteEmbeddedDocuments('Item',actor.items.filter(i=>i.type==='condition'&&remove.includes(i.name)).map(i=>i.id));
  await card('OFF THE CLOCK',actor.name,'<p>A shower, a proper meal, a few hours with the phone on silent. Health and Hustle restored.</p>','win');return {rested:true};
});
export async function advance(actor){
  if(!owns(actor))throw new Error('Not your character.');
  const points=Number(actor.system.advancement.available||0);if(points<1)throw new Error('No advances available. The GM awards them after missions.');
  const cap=[0,8,10,12,12,20][actor.system.stage]??8;
  const opts=STAT_KEYS.filter(k=>actor.system.stats[k].die<cap).map(k=>{const d=actor.system.stats[k].die,next=DIE_LADDER[DIE_LADDER.indexOf(d)+1];return `<option value="${k}">${STATS[k].label}: d${d} → d${next}</option>`;});
  if(!opts.length)throw new Error('Your stats have reached this Rep stage’s cap. Raise your Rep stage at a milestone.');
  const f=await DialogV2.input({window:{title:`Advance · ${actor.name}`},content:`<p>${points} advance(s) available. Spend one to raise a stat one step. Rep ${actor.system.stage} cap: d${cap}.</p><select name="stat">${opts.join('')}</select>`,ok:{label:'Spend one advance'}});if(!f)return;
  const die=actor.system.stats[f.stat]?.die,index=DIE_LADDER.indexOf(die),next=DIE_LADDER[index+1];if(!next||next>cap)throw new Error('Invalid advancement.');
  return request('progression.advance',{actorUuid:actor.uuid,stat:f.stat,fromDie:die});
}
registerHandler('progression.advance',async({actorUuid,stat,fromDie,userId})=>{
 const actor=await fromUuid(actorUuid),user=game.users.get(userId);if(!actor?.isPerson||!owns(actor,user))throw new Error('Not your character.');
 const points=Number(actor.system.advancement.available),die=Number(actor.system.stats[stat]?.die),cap=[0,8,10,12,12,20][actor.system.stage]??8,next=DIE_LADDER[DIE_LADDER.indexOf(die)+1];
 if(points<1||die!==Number(fromDie)||!next||next>cap)throw new Error('That advancement is no longer available. Reopen the dialog.');
 await actor.update({[`system.stats.${stat}.die`]:next,'system.advancement.available':points-1,'system.advancement.spent':Number(actor.system.advancement.spent||0)+1});
 await card('MOVING UP',actor.name,`<p>${esc(STATS[stat].label)} d${die} → d${next}.</p>`,'win');return {stat,die:next};
});
export async function resolveAttack(message,{dodge=false}={}){
  return request('combat.resolve',{messageId:message.id,dodge});
}
registerHandler('combat.resolve',async({messageId,dodge=false,userId})=>{
  const msg=game.messages.get(messageId),attack=msg?.getFlag(NS,'attack');if(!attack)throw new Error('No attack on this card.');
  if(msg.getFlag(NS,'resolved'))throw new Error('That attack has already been resolved.');
  const doc=await fromUuid(attack.target),target=doc?.actor??doc,user=game.users.get(userId);if(!owns(target,user))throw new Error('The target’s owner or GM resolves incoming damage.');
  if(dodge){
    if(!target.isPerson||target.system.states.reactionUsed||target.items.some(i=>i.type==='condition'&&CONDITION_EFFECTS[i.name]?.losesReaction))throw new Error('No reaction available.');
    if(target.system.states.down||target.items.some(i=>i.type==='condition'&&CONDITION_EFFECTS[i.name]?.cannotAct))throw new Error('Cannot react while Down.');
    await target.update({'system.states.reactionUsed':true});
    const out=await target.rollStat('mov',{tn:attack.total,label:`Dodge ${attack.attackerName}'s attack`,sceneId:doc?.parent?.id,tokenId:doc?.id,requestedBy:userId});
    if(out?.result.success){await msg.update({[`flags.${NS}.resolved`]:true,[`flags.${NS}.resolution`]:'dodged'});await card('DODGED',target.name,'<p>The attack misses. Reaction spent until your next turn.</p>','win');return;}
  }
  await msg.update({[`flags.${NS}.resolved`]:true,[`flags.${NS}.resolution`]:'hit'});await target.applyDamage(attack.damage);
  return card('HIT',target.name,`<p>${attack.damage} damage applied${dodge?' after a failed Dodge':''}. ${attack.severity?esc(attack.severity):''}</p>`,'cost');
});
registerHandler('combat.condition',async({messageId,condition,userId})=>{
 const msg=game.messages.get(messageId),attack=msg?.getFlag(NS,'attack');if(!attack)throw new Error('No attack on that card.');
 if(msg.getFlag(NS,'conditionApplied'))throw new Error('A condition has already been chosen for this hit.');
 const doc=await fromUuid(attack.target),a=doc?.actor??doc,u=game.users.get(userId);
 if(!owns(a,u))throw new Error('The target’s owner or GM applies the condition.');
 if(msg.getFlag(NS,'resolution')!=='hit')throw new Error('Resolve this attack as a hit before choosing a condition.');
 if(!attack.conditions?.includes(condition))throw new Error('Choose one of this hit’s listed conditions.');
 await a.addCondition(condition);await msg.setFlag(NS,'conditionApplied',condition);
});
async function finishWasted(actor){
 for(const message of game.messages)if(message.getFlag(NS,'wastedFor')===actor.uuid&&!message.getFlag(NS,'outcomeResolved'))await message.setFlag(NS,'outcomeResolved',true);
 await wasted(actor);
}
const later=(a,b)=>a.round>b.round||(a.round===b.round&&a.turn>b.turn);
export async function processCombatTurn(combat,changes){
 if(!isLeader()||!('turn'in changes||'round'in changes)||Number(combat.round)<1)return;
 const current={round:Number(combat.round),turn:Number(combat.turn??0)},previous=combat.previous;
 if(previous?.round>0&&later(current,previous)){
  const ended=combat.combatants.find(c=>c.id===previous.combatantId||c.tokenId===previous.tokenId)?.actor??combat.turns?.[previous.turn]?.actor;
  if(ended?.isPerson){
   const clock=ended.getFlag(NS,'combatClock')??{},last=clock.combatId===combat.id?clock.end:null;
   if(!last||later(previous,last)){
    await ended.setFlag(NS,'combatClock',{...clock,combatId:combat.id,end:{round:previous.round,turn:previous.turn}});
    if(ended.items.some(i=>i.type==='condition'&&i.name==='Bleeding'))await ended.applyDamage(1);
    await ended.removeCondition('Stunned');
   }
  }
 }
 const actor=combat.combatant?.actor;if(!actor?.isPerson)return;
 const clock=actor.getFlag(NS,'combatClock')??{},last=clock.combatId===combat.id?clock.start:null;
 if(last&&!later(current,last))return;
 await actor.setFlag(NS,'combatClock',{...clock,combatId:combat.id,start:current});
 await actor.update({'system.states.reactionUsed':false});
 if(!actor.system.states.down)return;
 const count=Number(actor.system.states.downRounds||0)+1;await actor.update({'system.states.downRounds':count});
 if(count>=3){await card('WASTED',actor.name,'<p>Three rounds Down without aid. The ambulance takes you to A&E.</p>','wasted');await finishWasted(actor);return;}
 await card('DOWN',actor.name,`<p>Round ${count}/3 without aid. Roll Grit to stay conscious.</p><button type="button" data-smoke-roll="${esc(actor.uuid)}" data-stat="grt" data-band="medium" data-label="Stay Conscious" data-context='${esc(JSON.stringify({kind:'stayUp'}))}'>Stay conscious</button>`,'down');
}
export function installGameplay(){
  Hooks.on('updateActor',async(actor,changes)=>{
    if(!isLeader()||!actor.isPerson||!(Object.hasOwn(changes,'system.resources.health.value')||foundry.utils.hasProperty(changes,'system.resources.health.value')))return;
    if(actor.system.resources.health.value<=0&&!actor.system.states.down)await actor.applyDamage(0);
    else if(actor.system.resources.health.value>0&&actor.system.states.down)await actor.heal(0);
  });
  BOARD_GATES.push(({ot,seat,user})=>{if(!user.isGM&&seat.role==='pilot'&&cannotDrive(ot.actor?.items.filter(i=>i.type==='condition').map(i=>i.name)))throw new Error('Cuffed or Down characters cannot drive.');});
  let turnQueue=Promise.resolve();
  Hooks.on('updateCombat',(combat,changes)=>{turnQueue=turnQueue.catch(()=>{}).then(()=>processCombatTurn(combat,changes));return turnQueue;});
  Hooks.on('createChatMessage',async msg=>{
    if(!isLeader())return;const r=msg.getFlag(NS,'roll');if(r?.context?.kind!=='stayUp'||r.outcomeKey!=='severeFailure')return;
    const actor=await fromUuid(r.actorUuid);if(actor?.system.states.down){await msg.setFlag(NS,'outcomeResolved',true);await finishWasted(actor);}
  });
  Hooks.on('deleteCombat',async combat=>{
    if(!isLeader())return;for(const c of combat.combatants){if(c.actor?.isPerson)await c.actor.update({'system.states.reactionUsed':false});}
  });
}
