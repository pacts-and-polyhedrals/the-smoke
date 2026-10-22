import {NS,STAT_KEYS,STATS,DIE_LADDER} from './config.mjs';
import {CONDITION_EFFECTS,cannotDrive} from './rules/conditions.mjs';
import {request,registerHandler,isLeader,card,esc} from './world/net.mjs';
import {BOARD_GATES} from './vehicles/vehicle-boarding.mjs';
import {zonesOf, tokenRect} from './world/spawn.mjs';
import {arrivedAt} from './rules/jobs-core.mjs';
import {distanceSquares} from './world/spawn.mjs';
import {wasted} from './world/heat.mjs';
import {statCap} from './rules/advancement.mjs';
const {DialogV2}=foundry.applications.api;
// Plain initiative (the core tracker without the Combat Console): exploding d6 plus Moves, or Handling for a vehicle.
export class SmokeCombatant extends (globalThis.Combatant ?? class {}){
  _getInitiativeFormula(){return this.actor?.type==='vehicle'?'1d6x + @vehicle.handling':'1d6x + @statMods.mov';}
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
/** Somewhere safe to sleep: inside a safehouse zone, or anywhere in Your Flat. */
function safeHere(token){
  if(!token)return null;
  if(token.parent?.getFlag?.(NS,'place')?.id==='LDP-FLAT')return {name:'Your Flat'};
  const zones=zonesOf(token.parent);return zones.find(z=>z.service==='safehouse'&&arrivedAt(zones,z.id,tokenRect(token)))??null;
}
const policeInSight=token=>Boolean(token?.parent?.tokens.some(u=>u.getFlag(NS,'police')&&distanceSquares(u,token)<=14));
// Short-term trouble a night in clears. Broken needs A&E and a week; cuffs and holds need someone else.
const REST_KEEPS=['Broken','Cuffed','Restrained','Grabbed'];
export const REST_RULES='A safe night takes eight hours on the Banana Watch, restores Health and Hustle and clears short-term conditions (Bruised, Hurt, Knackered, Shaken, Mullered, Gassed, Prone, Stunned, In Pain, highs and comedowns). Heat of two stars or less dies down overnight. You cannot rest while Bleeding, with three or more stars, or with police in sight. Broken needs A&E and a week of recovery.';
/** Why this person cannot rest here, or null. */
export function restProblem(actor,token,{isGM=false}={}){
  if(!isGM&&!safeHere(token))return 'Get to the flat or a safehouse before resting.';
  if(Number(actor.system.heat?.value)>=3)return 'Lose the Heat before resting: with three stars they will come to the door.';
  if(policeInSight(token))return 'Not with the police outside.';
  if(actor.items.some(i=>i.type==='condition'&&i.name==='Bleeding'))return 'Stop the Bleeding with first aid before resting.';
  return null;
}
export async function rest(actor){
  if(!owns(actor))throw new Error('Not your character.');
  const t=actor.token??canvas?.scene?.tokens.find(x=>x.actorId===actor.id);
  const why=restProblem(actor,t,{isGM:game.user.isGM});if(why)throw new Error(why);
  if(!await DialogV2.confirm({window:{title:`A night off · ${actor.name}`},content:`<p>${REST_RULES}</p>`}))return;
  return request('recovery.rest',{actorUuid:actor.uuid,sceneId:t?.parent.id,tokenId:t?.id});
}
/** The night itself. Runs on the leader. */
export const REST_WATCH_SECONDS = 8 * 60 * 60;
export async function restNow(actor){
  if(typeof game.time?.advance !== 'function')throw new Error('The Banana Watch cannot advance; rest was not applied. Ask the GM to check the world clock.');
  const heat=Number(actor.system.heat?.value||0);
  await actor.update({'system.resources.health.value':actor.system.resources.health.max,'system.resources.hustle.value':actor.system.resources.hustle.max,'system.states.down':false,'system.states.downRounds':0,'system.states.reactionUsed':false,'system.states.surrendered':false,'system.states.offGame':false,'system.states.onARoll':false});
  await actor.deleteEmbeddedDocuments('Item',actor.items.filter(i=>i.type==='condition'&&!REST_KEEPS.includes(i.name)).map(i=>i.id));
  if(heat)await actor.setHeat(0,'A night indoors: the heat dies down.');
  // All rest entry points (sheet, shop, GM screen) use this leader-only routine.
  // World seconds, not real minutes; watch-based conditions move with the same clock.
  await game.time.advance(REST_WATCH_SECONDS);
  await card('OFF THE CLOCK',actor.name,`<p>Eight hours gone on the Banana Watch. A shower, a proper meal and a few hours with the phone on silent. Health and Hustle restored${heat?'; Heat cleared':''}.</p>`,'win');
  return {rested:true,watchSeconds:REST_WATCH_SECONDS};
}
registerHandler('recovery.rest',async({actorUuid,sceneId,tokenId,userId})=>{
  const actor=await fromUuid(actorUuid),user=game.users.get(userId);if(!actor?.isPerson||!owns(actor,user))throw new Error('Not your character.');
  const token=game.scenes.get(sceneId)?.tokens.get(tokenId);
  if(!user.isGM&&(!token||token.actorId!==actor.id))throw new Error('Get to a safehouse before resting.');
  const why=restProblem(actor,token,{isGM:user.isGM});if(why)throw new Error(why);
  return restNow(actor);
});
export async function advance(actor){
  if(!owns(actor))throw new Error('Not your character.');
  const points=Number(actor.system.advancement.available||0);if(points<1)throw new Error('No advances available. The GM awards them after missions.');
  const cap=statCap(actor.system.stage);
  const opts=STAT_KEYS.filter(k=>actor.system.stats[k].die<cap).map(k=>{const d=actor.system.stats[k].die,next=DIE_LADDER[DIE_LADDER.indexOf(d)+1];return `<option value="${k}">${STATS[k].label}: d${d} → d${next}</option>`;});
  if(!opts.length)throw new Error('Your stats have reached this Rep stage’s cap. Raise your Rep stage at a milestone.');
  const f=await DialogV2.input({window:{title:`Advance · ${actor.name}`},content:`<p>${points} advance(s) available. Spend one to raise a stat one step. Rep ${actor.system.stage} cap: d${cap}.</p><select name="stat">${opts.join('')}</select>`,ok:{label:'Spend one advance'}});if(!f)return;
  const die=actor.system.stats[f.stat]?.die,index=DIE_LADDER.indexOf(die),next=DIE_LADDER[index+1];if(!next||next>cap)throw new Error('Invalid advancement.');
  return request('progression.advance',{actorUuid:actor.uuid,stat:f.stat,fromDie:die});
}
registerHandler('progression.advance',async({actorUuid,stat,fromDie,userId})=>{
 const actor=await fromUuid(actorUuid),user=game.users.get(userId);if(!actor?.isPerson||!owns(actor,user))throw new Error('Not your character.');
 const points=Number(actor.system.advancement.available),die=Number(actor.system.stats[stat]?.die),cap=statCap(actor.system.stage),next=DIE_LADDER[DIE_LADDER.indexOf(die)+1];
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
  await msg.update({[`flags.${NS}.resolved`]:true,[`flags.${NS}.resolution`]:'hit'});
  const before=Number(target.system?.resources?.health?.value??0);await target.applyDamage(attack.damage);
  if(attack.lethal&&attack.attacker){const attacker=await fromUuid(attack.attacker);if(attacker){const {reportKill}=await import('./combat/combat.mjs');await reportKill(attacker,doc??target,{before,lethal:true,seen:attack.seen,byPolice:attack.byPolice});}}
  if(target.isPerson)for(const c of attack.effects??[])await target.addCondition(c);
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
 // Speed-dice fights (Combat Console) handle Bleeding, Stunned, reactions and the Down clock at the end of each round.
 if(combat.getFlag?.(NS,'state'))return;
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
/** A surrender belongs to one fight. Up to 0.5.16 it outlived the fight and left the character with no speed dice. */
const STAND_DOWN={'system.states.surrendered':false,[`flags.${NS}.surrenderedIn`]:null};
const standsDown=(actor,combatId)=>Boolean(actor?.system?.states?.surrendered)&&[combatId,null,undefined].includes(actor.getFlag?.(NS,'surrenderedIn'));
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
    if(!isLeader())return;
    // However the fight ends (End Fight, a chase called off, the core tracker), its surrenders end with it.
    for(const c of combat.combatants){const a=c.actor;if(!a?.isPerson)continue;await a.update({'system.states.reactionUsed':false,...(standsDown(a,combat.id)?STAND_DOWN:{})});}
  });
  Hooks.on('deleteCombatant',async c=>{
    const a=c.actor;if(!isLeader()||!a?.isPerson||!c.parent?.id||!standsDown(a,c.parent.id))return;
    await a.update(STAND_DOWN);
  });
  if(isLeader()&&game.user?.isGM)void clearStaleSurrenders().catch(error=>console.warn('The Smoke | stale surrenders',error));
}
/** On load: anyone still marked as surrendered without being in that fight any more stands back up. Runs on the leader. */
export async function clearStaleSurrenders(){
  const live=new Set();
  for(const combat of game.combats??[])for(const c of combat.combatants??[])if(c.actor?.uuid)live.add(`${c.actor.uuid}|${combat.id}`);
  const fixed=[];
  for(const a of game.actors??[]){
    if(!a.isPerson||!a.system?.states?.surrendered)continue;
    const fight=a.getFlag?.(NS,'surrenderedIn');if(fight&&live.has(`${a.uuid}|${fight}`))continue;
    await a.update(STAND_DOWN);fixed.push(a.name);
  }
  if(fixed.length)console.log(`The Smoke | ${fixed.join(', ')}: no longer marked as surrendered from an earlier fight (speed dice restored).`);
  return fixed;
}
