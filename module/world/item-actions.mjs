// Inventory effects run on the leader, against actual owned items and nearby targets.
// Each operation is a resumable saga: inventory, effect and result each have receipts.
// It is NOT a database transaction across Foundry documents.
import {NS} from '../config.mjs';
import {enableItemRules,perkEligible} from '../rules/item-context.mjs';
import {isSuccess} from '../rules/core.mjs';
import {registerHandler,request,card,esc,ownersOf,isLeader} from './net.mjs';
import {actorToken,distanceSquares,mapIdOf} from './spawn.mjs';
import {withActionLocks,worldSeconds} from './action-locks.mjs';
import {newOperationId,opId,receiptFor,sameOperation,beginOperation,stageOperation,completeOperation,consumeOnce,effectOnce,issueOnce,advanceOperationClock} from './transactions.mjs';
import {addTimedCondition,outfitHeatResult,priceHere} from './items.mjs';
let enabled=false;
const rollPermits=new Set();
export const itemActionsReady=()=>enabled;
const own=(a,u)=>Boolean(a&&u&&(u.isGM||a.testUserPermission?.(u,'OWNER')));
const flag=(a,k)=>a?.getFlag?.(NS,k);
const names=a=>new Set(a.items.filter(i=>i.type==='condition').map(i=>i.name));
const qty=i=>Number(i?.system.quantity??1);
const copy=x=>foundry.utils.deepClone(x);
const paused=()=>Boolean(game.paused);
const watched=t=>Boolean(t&&t.parent.tokens.some(p=>flag(p,'police')&&!p.hidden&&distanceSquares(p,t)<=14));
function assertNear(actor,target,{reach=2.2,person=false,vehicle=false}={}){
 const t=actorToken(actor);if(!t||!target||t.parent?.id!==target.parent?.id||target.hidden||distanceSquares(t,target)>reach+Math.max(0,(Number(target.width||1)-1)/2))throw new Error('Stand next to the actual target first.');
 if(vehicle&&target.actor?.type!=='vehicle')throw new Error('Choose a vehicle.');
 if(person&&!['character','npc'].includes(target.actor?.type))throw new Error('Choose a person.');
 return t;
}
function capable(a){if(a.system.states?.down||names(a).has('Down')||names(a).has('Cuffed'))throw new Error('You cannot use this item while Down or Cuffed.');}
export const ITEM_ACTIONS=Object.freeze({
 'Toolkit':['repair'],'Vehicle Repair Kit':['repairKit'],'Spare Plates':['plates'],'Jerry Can':['refuel'],
 'Cable Ties':['restrain'],'Handcuffs':['restrain','releaseCuffs'],'Duct Tape':['gag'],
 'Lock Picks':['unlock'],'Hacksaw':['sawLock'],'Torch':['light','dazzle'],'Pocket Torch':['light'],
 'Police Scanner':['scanner'],'Binoculars':['case'],'Balaclava':['mask'],'Bike Lock':['lockBike','unlockBike'],'D-Lock':['lockBike','unlockBike'],
 'Bike Chain':['lockBike','unlockBike'],'Spare Clothes':['spareClothes'],'Fake ID':['showID'],
 'Oyster Card':['travelBalance'],'Repair Parts':['repairParts'],'Spare Inner Tube':['innerTube']
});
function actionsFor(i){if(i.type==='consumable')return ['consume'];if(i.type==='outfit')return ['wear'];if(i.type==='drug')return ['takeDrug','streetSale'];return ITEM_ACTIONS[i.name]||[];}
function sameTarget(plan,token){return !plan.targetUuid||token?.uuid===plan.targetUuid;}
function safeWorkshop(t){const map=mapIdOf(t?.parent);if(!t||watched(t)||Number(t.actor.system.heat?.value)>=3)return false;
 return map==='LDP-ARCHES'||Boolean((t.parent.getFlag(NS,'zoneGraph')?.zones||[]).some(z=>/workshop|garage|vehicle bay|repair bay/i.test(z.name||'')&&pointIn(t,z.rect)));}
function pointIn(t,rect){if(!rect)return false;const g=t.parent.grid.size||100,x=t.x+t.width*g/2,y=t.y+t.height*g/2;return x>=rect[0]&&x<=rect[0]+rect[2]&&y>=rect[1]&&y<=rect[1]+rect[3];}
function targetPlan(actor,item,action,target,choice){
 const s=item.system,t=actorToken(actor),p={itemId:item.id,itemName:item.name,action,targetUuid:target?.uuid||null,sceneId:t?.parent?.id||null,choice:choice||'',quantity:0,seconds:0,roll:null};
 if(!t)throw new Error('Place your character on the map first.');capable(actor);if(paused())throw new Error('Resume the game before using items.');
 if(!actionsFor(item).includes(action))throw new Error('That item cannot perform this action.');
 if(qty(item)<1)throw new Error('None of that item remains.');
 if(flag(item,'attachedTo')&& !['releaseCuffs','unlockBike'].includes(action))throw new Error('That item is attached to something. Retrieve it first.');
 if(['repair','repairKit','plates','refuel','repairParts','innerTube','lockBike','unlockBike'].includes(action)){
  assertNear(actor,target,{vehicle:true});const v=target.actor.system.vehicle;
  if(v.destroyed||Number(v.body.value)<=0)throw new Error('A written-off vehicle needs recovery, not a pocket repair.');
  if(['repair','repairKit','repairParts','innerTube'].includes(action)){if(watched(t)||Number(actor.system.heat?.value)>=3)throw new Error('Get clear of pursuit before repairing.');if(action==='repairKit'&&!safeWorkshop(t))throw new Error('Use the repair kit at a mapped workshop or vehicle bay.');p.roll={stat:'grf',band:'medium'};p.seconds=300;}
  if(action==='repairKit'||action==='repairParts'||action==='innerTube')p.quantity=1;
  if(action==='innerTube'&&(!['bicycle','bike','pedal'].includes(v.klass)||Number(v.flats||0)<1))throw new Error('That bicycle does not need an inner tube.');
  if(action==='plates'){if(v.plateless)throw new Error('This vehicle does not use registration plates.');p.roll={stat:'grf',band:'easy'};p.quantity=1;p.seconds=60;}
  if(action==='refuel'){if(Number(v.fuel?.max||0)<=0||Number(v.fuel.value)>=Number(v.fuel.max))throw new Error('This vehicle does not need fuel.');p.quantity=1;p.seconds=60;}
  if(['lockBike','unlockBike'].includes(action)){
   if(!['bicycle','bike','pedal','motorbike','moped','scooter','motorcycle'].includes(v.klass))throw new Error('Use a cycle lock on a bike.');
   const attached=flag(item,'attachedTo');if(action==='unlockBike'){if(attached!==target.uuid||flag(target,'playerLock')?.itemId!==item.id)throw new Error('This is not your attached lock.');}
   else {if(flag(target,'playerLock'))throw new Error('This bike already has a player lock.');if(flag(target,'missionResource')?.loan!==true&&!flag(target,'unlocked')&&!target.actor.testUserPermission?.(game.users.get(actor.ownership?Object.keys(actor.ownership).find(k=>k!=='default'&&actor.ownership[k]>=3):''),'OWNER'))throw new Error('Unlock or take possession of the bike before locking it.');}
  }
 }
 if(['restrain','releaseCuffs','gag'].includes(action)){
  assertNear(actor,target,{person:true});const cs=names(target.actor);
  if(action==='releaseCuffs'){if(flag(item,'attachedTo')!==target.uuid)throw new Error('Those are not this pair of cuffs.');}
  else {if(!['Grabbed','Down','Stunned','Restrained','Cuffed'].some(k=>cs.has(k))&&!target.actor.system.states?.surrendered)throw new Error('The target must be held, Down or surrendered.');if(action==='restrain'&&cs.has('Cuffed'))throw new Error('Already Cuffed.');p.quantity=item.name==='Handcuffs'?0:1;}
 }
 if(action==='consume'){p.quantity=1;if(item.name==='First Aid Kit'){target??=t;p.targetUuid=target.uuid;assertNear(actor,target,{person:true});p.roll={stat:'sav',band:'medium'};p.seconds=60;}else if(target&&target.actor!==actor)throw new Error('Food and medicines are used on your own character.');}
 if(action==='takeDrug')p.quantity=1;
 if(action==='streetSale'){if(!mapIdOf(t.parent)?.startsWith('LDN-'))throw new Error('Find a street first.');p.roll={stat:'frt',band:Number(actor.system.heat?.value)?'hard':'medium'};p.price=priceHere(s.street||s.value,t.parent);}
 if(action==='wear'){if(s.worn)throw new Error('You are already wearing that outfit.');p.outfitId=item.id;}
 if(action==='spareClothes'){p.quantity=1;p.seconds=60;}
 if(['unlock','sawLock'].includes(action)){
  assertNear(actor,target);if(!flag(target,'lockable'))throw new Error('Target an authored lockable door or prop; this tool does not open arbitrary map scenery.');
  const l=flag(target,'lockable');if(l.locked===false)throw new Error('Already unlocked.');if(action==='sawLock'&&!['padlock','chain','cheapChain'].includes(l.kind))throw new Error('A hacksaw is only for a padlock or cheap chain.');
  p.roll={stat:'grf',band:action==='unlock'?({miracle:'hard',hard:'medium',medium:'easy',easy:'easy'}[l.band||'medium']):l.band||'medium'};p.seconds=action==='sawLock'?60:30;
 }
 if(action==='dazzle'){assertNear(actor,target,{person:true,reach:4});p.roll={stat:'frt',band:'medium'};}
 if(action==='case'){if(!target||target.parent?.id!==t.parent.id||target.hidden||distanceSquares(t,target)>30)throw new Error('Target a visible location or person within 30 squares.');p.roll={stat:'sav',band:'easy'};}
 if(action==='scanner'){const last=Number(flag(actor,'scannerUsedAt')??-1000);if(worldSeconds()-last<30)throw new Error('The scanner has no new report yet.');p.roll={stat:'sav',band:'medium'};}
 if(action==='showID'){assertNear(actor,target,{person:true});if(!flag(target,'police')&&target.actor.system.role!=='police')throw new Error('Present ID to an actual police officer.');p.roll={stat:'frt',band:'medium'};}
 return p;
}
export function validateItemRoll(actor,stat,options){const id=options.context?.operationId;
 if(!rollPermits.has(`${actor.uuid}:${id}`))throw new Error('Use the item action; an ordinary roll cannot impersonate an item result.');
 const p=receiptFor(actor,id)?.plan;if(!p||p.roll?.stat!==stat||p.roll?.band!==options.band)throw new Error('This roll does not match the item action.');
}
async function savedRoll(actor,id,p,userId){
 let rec=receiptFor(actor,id),payload=rec.stages.rollPayload,msg=rec.stages.rollMessageId&&game.messages.get(rec.stages.rollMessageId);
 if(!payload){const permit=`${actor.uuid}:${id}`;rollPermits.add(permit);
  try{const {rollStat}=await import('../dice/roll.mjs');const context={kind:'itemAction',operationId:id,action:p.action,itemId:p.itemId,targetUuid:p.targetUuid};const perk=actor.items.find(i=>perkEligible(actor,i,p.roll.stat,{context}));const out=await rollStat(actor,p.roll.stat,{perk:perk?.id,band:p.roll.band,label:`${p.itemName}: ${p.action}`,requestedBy:userId,context:{kind:'itemAction',operationId:id,action:p.action,itemId:p.itemId,targetUuid:p.targetUuid},_persistRoll:async data=>stageOperation(actor,id,'rollPayload',data)});if(!out?.result)throw new Error('The item roll did not finish.');msg=out.message;payload={flags:{[NS]:{roll:out.result}}};await stageOperation(actor,id,'rollMessageId',msg.id);}
  finally{rollPermits.delete(permit);}
 }else if(!msg){await (await import('../dice/roll.mjs')).consumeRollStateUsage(actor,payload);msg=await ChatMessage.implementation.create({...payload,content:`${payload.content||''}<p class="smoke-dim">Recovered saved result; no reroll.</p>`});await stageOperation(actor,id,'rollMessageId',msg.id);}
 return payload.flags[NS].roll;
}
async function conditionOnce(actor,id,name,{minutes=null,then='',thenMinutes=60}={}){
 const existing=actor.items.find(i=>i.type==='condition'&&i.name===name);
 if(existing&&flag(existing,'itemEffect')===id)return;
 let c;if(minutes!=null)c=await addTimedCondition(actor,name,minutes,{then,thenMinutes});else{await actor.addCondition(name);c=actor.items.find(i=>i.type==='condition'&&i.name===name);}
 if(c)await c.update({[`flags.${NS}.itemEffect`]:id});
}
async function applyAction(actor,item,id,p,result){
 const target=p.targetUuid?await fromUuid(p.targetUuid):null,t=actorToken(actor),ok=!p.roll||isSuccess(result?.outcomeKey),outcome=result?.outcomeKey;
 let effect=receiptFor(actor,id).stages.effectPlan;
 if(!effect){
  const a=target?.actor||actor,v=a.system.vehicle,health=a.system.resources?.health;
  effect={ok,notes:[],actorPatch:{},targetPatch:{},conditions:[],remove:[],consume:p.quantity,seconds:p.seconds};
  if(p.action==='streetSale'){
   if(ok){const n=Math.min(qty(item),outcome==='exceptionalSuccess'?5:outcome==='strongSuccess'?3:outcome==='fullSuccess'?2:1),pay=Math.round(n*p.price*(outcome==='exceptionalSuccess'?1.25:1));effect.consume=n;effect.actorPatch={'system.cash':Number(actor.system.cash||0)+pay,'system.rep.street':Number(actor.system.rep?.street||0)+(n>=3?1:0)};effect.notes.push(`Sold ${n}; GBP ${pay}.`);}
   else if(outcome==='severeFailure')effect.actorPatch['system.heat.value']=Math.min(5,Number(actor.system.heat?.value||0)+2);
  }
  if(ok)switch(p.action){
   case 'repair':case 'repairKit':case 'repairParts':case 'innerTube':{
    const add=p.action==='repair'?({narrowSuccess:1,fullSuccess:2,strongSuccess:4,exceptionalSuccess:99}[outcome]||0):2;
    effect.targetPatch=Number(v.flats||0)>0?{'system.vehicle.flats':Number(v.flats)-1}:{'system.vehicle.body.value':Math.min(Number(v.body.max),Number(v.body.value)+add)};effect.notes.push('Vehicle repaired.');break;}
   case 'refuel':effect.targetPatch={'system.vehicle.fuel.value':Math.min(Number(v.fuel.max),Number(v.fuel.value)+5)};effect.notes.push('+5 fuel, capped at capacity.');break;
   case 'plates':{const r=()=>String.fromCharCode(65+Math.floor(Math.random()*26));effect.tokenPatch={[`flags.${NS}.plate`]:`${r()}${r()}${10+Math.floor(Math.random()*80)} ${r()}${r()}${r()}`,[`flags.${NS}.marker`]:null,[`flags.${NS}.hotUntil`]:0};effect.notes.push('New plates; the old ANPR marker is cleared.');break;}
   case 'consume':effect.remove=String(item.system.removes||'').split(',').map(s=>s.trim()).filter(Boolean);if(Number(item.system.heal))effect.targetPatch={'system.resources.health.value':Math.min(Number(health.max),Number(health.value)+Number(item.system.heal))};if(item.system.grants){let name=item.system.grants,minutes=item.system.minutes||30;if(name==='Dutch Courage'&&names(actor).has(name)){name='Mullered';minutes=240;}effect.conditions.push({name,minutes});}effect.notes.push('Inventory and treatment recorded.');break;
   case 'takeDrug':effect.remove=item.system.comedown?[item.system.comedown]:[];effect.conditions.push({name:item.system.high,minutes:item.system.minutes,then:item.system.comedown,thenMinutes:Math.max(30,item.system.minutes*2)});break;
   case 'restrain':effect.conditions.push({name:'Cuffed'});effect.remove=['Grabbed'];if(item.name==='Handcuffs')effect.itemPatch={[`flags.${NS}.attachedTo`]:target.uuid};break;
   case 'releaseCuffs':effect.remove=['Cuffed'];effect.itemPatch={[`flags.${NS}.attachedTo`]:null};break;
   case 'gag':effect.conditions.push({name:'Gagged'});break;
   case 'wear':case 'spareClothes':{
    const seen=watched(t),heat=Number(actor.system.heat?.value||0),last=flag(actor,'disguiseReceipt'),cool=last&&worldSeconds()-Number(last.at)<3600;
    const h=cool?{to:heat,why:'A recent change already confused the description; no extra Heat reduction this hour.'}:outfitHeatResult({heat,watched:seen,heatDrop:item.system.heatDrop??1});
    effect.actorPatch={'system.heat.value':p.action==='wear'&&item.system.disguise==='police'&&seen?Math.min(5,heat+2):h.to,[`flags.${NS}.disguiseReceipt`]:{at:worldSeconds(),operationId:id,itemId:item.id}};
    effect.outfit=p.action==='wear';effect.notes.push(h.why||'Appearance changed.');break;}
   case 'unlock':case 'sawLock':effect.tokenPatch={[`flags.${NS}.lockable.locked`]:false,[`flags.${NS}.lockable.openedBy`]:actor.id};if(flag(target,'lockable')?.wallId)effect.wallId=flag(target,'lockable').wallId;break;
   case 'light':effect.selfTokenPatch={light:flag(item,'lightOn')?{dim:0,bright:0}:{dim:8,bright:4,angle:360,color:'#fff0cc',alpha:.3}};effect.itemPatch={[`flags.${NS}.lightOn`]:!flag(item,'lightOn')};break;
   case 'dazzle':effect.targetPatch={'system.states.offGame':true};effect.notes.push('Dazzled: Off Your Game on the next roll.');break;
   case 'mask':effect.itemPatch={[`flags.${NS}.wornMask`]:!flag(item,'wornMask')};effect.notes.push(flag(item,'wornMask')?'Mask removed.':'Mask worn: witness identification is reduced, not police recognition.');break;
   case 'scanner':effect.actorPatch={[`flags.${NS}.scannerUsedAt`]:worldSeconds()};effect.notes.push(...t.parent.tokens.filter(x=>flag(x,'police')&&!x.hidden&&distanceSquares(t,x)<=30).map(x=>`${x.name}: about ${Math.round(distanceSquares(t,x))} squares away.`));if(!effect.notes.length)effect.notes.push('No nearby police chatter identified.');break;
   case 'case':effect.notes.push(`${target.name}: ${flag(target,'police')?'Police presence identified.':target.actor?.system.role?`Role: ${target.actor.system.role}.`:'Location observed.'}`);effect.actorPatch={[`flags.${NS}.observations.${target.id}`]:{at:worldSeconds(),targetUuid:target.uuid,result:outcome}};break;
   case 'showID':effect.actorPatch={[`flags.${NS}.identityReceipt`]:{at:worldSeconds(),officerUuid:target.uuid,operationId:id,accepted:true}};effect.notes.push('Identity presentation accepted; this does not erase outstanding crimes.');break;
   case 'lockBike':effect.tokenPatch={[`flags.${NS}.playerLock`]:{actorUuid:actor.uuid,itemUuid:item.uuid,itemId:item.id,previousLock:flag(target,'lock')||v.lock},[`flags.${NS}.lock`]:'hard',[`flags.${NS}.unlocked`]:false};effect.itemPatch={[`flags.${NS}.attachedTo`]:target.uuid};break;
   case 'unlockBike':effect.tokenPatch={[`flags.${NS}.lock`]:flag(target,'playerLock')?.previousLock||v.lock,[`flags.${NS}.playerLock`]:null,[`flags.${NS}.unlocked`]:true};effect.itemPatch={[`flags.${NS}.attachedTo`]:null};break;
   case 'travelBalance':effect.notes.push(`Prepaid travel credit: GBP ${Number(flag(actor,'travelCredit')||0)}. Use a mapped ticket counter to top up or pay a fare.`);break;
  }
  // Failed reusable actions do not spend the tool. First-aid/parts are expended on an attempt;
  // spare plates are only spent when they are successfully fitted.
  if(!ok&&p.action==='plates')effect.consume=0;
  if(!ok)effect.notes.push('The check failed; no success effect was applied.');
  await stageOperation(actor,id,'effectPlan',effect);
 }
 if(effect.consume)await consumeOnce(item,id,effect.consume);
 const a=target?.actor||actor;
 if(p.targetUuid&&!target)throw new Error('The target was removed. A GM must recover the saved operation; it will not reroll or consume twice.');
 if(effect.outfit){await actor.updateEmbeddedDocuments('Item',actor.items.filter(i=>i.type==='outfit').map(i=>({_id:i.id,'system.worn':i.id===item.id})));}
 if(effect.itemPatch)await item.update(effect.itemPatch);
 if(effect.tokenPatch)await effectOnce(target,id,effect.tokenPatch);
 if(effect.selfTokenPatch)await effectOnce(t,id,effect.selfTokenPatch);
 if(effect.wallId){const wall=target.parent.walls.get(effect.wallId);if(!wall)throw new Error('The lock refers to a missing door.');await effectOnce(wall,id,{ds:1});}
 if(effect.targetPatch['system.resources.health.value']>0){effect.targetPatch['system.states.down']=false;effect.targetPatch['system.states.downRounds']=0;effect.remove=[...new Set([...effect.remove,'Down'])];}
 if(Object.keys(effect.targetPatch).length)await effectOnce(a,id,effect.targetPatch);
 for(const name of effect.remove)await a.removeCondition(name);
 for(const c of effect.conditions)await conditionOnce(a,id,c.name,c);
 await advanceOperationClock(actor,id,effect.seconds);
 const answer={operationId:id,success:effect.ok,action:p.action,notes:effect.notes,messageId:receiptFor(actor,id).stages.rollMessageId||null};
 await completeOperation(actor,id,answer,effect.actorPatch);
 Hooks.callAll('smokeItemUsed',{actor,item,action:p.action,target,operationId:id,result,success:effect.ok,location:{sceneId:t?.parent?.id,mapId:mapIdOf(t?.parent),x:t?.x,y:t?.y}});
 await card('ITEM',`${actor.name}: ${p.itemName}`,effect.notes.map(n=>`<p>${esc(n)}</p>`).join('')||'<p>Done.</p>',effect.ok?'win':'lose',{whisper:[...ownersOf(actor),...game.users.filter(u=>u.isGM).map(u=>u.id)]});
 return answer;
}
export async function useItemAction(data){
 const actor=await fromUuid(data.actorUuid),u=game.users.get(data.userId),id=opId(data.operationId);
 if(!own(actor,u))throw new Error('Use an item on your own character.');
 const signature=JSON.stringify({itemId:data.itemId,action:data.action,targetUuid:data.targetUuid||null,choice:data.choice||''});
 const targetDoc=data.targetUuid?await fromUuid(data.targetUuid):null;
 return withActionLocks([`actor:${actor.id}`,targetDoc?.actor?`actor:${targetDoc.actor.id}`:null,`target:${data.targetUuid||actor.uuid}`],async()=>{
  let rec=sameOperation(receiptFor(actor,id),'itemUse',signature);if(rec?.status==='done')return rec.result;
  const item=actor.items.get(data.itemId);if(!item)throw new Error('The carried item is missing; no effect applied.');
  if(!rec){const target=data.targetUuid?await fromUuid(data.targetUuid):null;const plan=targetPlan(actor,item,data.action,target,data.choice);rec=await beginOperation(actor,id,'itemUse',signature,{plan});}
  const p=rec.plan;if(!rec.stages.effectPlan){const target=p.targetUuid?await fromUuid(p.targetUuid):null;if(target)assertNear(actor,target,{reach:['case','scanner'].includes(p.action)?30:p.action==='dazzle'?4:2.2});}
  const result=p.roll?await savedRoll(actor,id,p,data.userId):null;
  return applyAction(actor,item,id,p,result);
 });
}
export async function recoverItemAction(actor,id,userId){const rec=receiptFor(actor,id);if(rec?.kind!=='itemUse')throw new Error('Not an item operation.');return useItemAction({actorUuid:actor.uuid,...JSON.parse(rec.signature),operationId:id,userId});}
export async function itemActionUI(actor,item,action=null){
 let actions=actionsFor(item);if(!actions.length)return null;
 const D=foundry.applications.api.DialogV2;
 if(!action&&actions.length>1)action=await D.wait({window:{title:item.name},content:'<p>Choose what to do with the actual carried item.</p>',buttons:actions.map(a=>({action:a,label:a.replace(/([A-Z])/g,' $1')}))});
 action??=actions[0];if(!actions.includes(action))return null;
 let target=[...(game.user.targets||[])][0]?.document||null;
 const vehicleActions=['repair','repairKit','plates','refuel','repairParts','innerTube','lockBike','unlockBike'];
 if(vehicleActions.includes(action)){const t=actorToken(actor),vehicles=t?.parent.tokens.filter(v=>v.actor?.type==='vehicle'&&distanceSquares(t,v)<=3)||[];
  if(!vehicles.length)throw new Error('Stand beside the vehicle.');if(!target||!vehicles.includes(target)){if(vehicles.length===1)target=vehicles[0];else{const f=await D.input({window:{title:item.name},content:`<label>Vehicle<select name="target">${vehicles.map(v=>`<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>`});if(!f)return null;target=vehicles.find(v=>v.id===f.target);}}}
 if(action==='consume')target=item.name==='First Aid Kit'?(target||actorToken(actor)):null;
 if(![...vehicleActions,'consume','restrain','releaseCuffs','gag','unlock','sawLock','case','dazzle','showID'].includes(action))target=null;
 return request('item.action',{actorUuid:actor.uuid,itemId:item.id,action,targetUuid:target?.uuid||null,operationId:newOperationId()});
}
export function installItemActions(){
 enabled=true;enableItemRules();registerHandler('item.action',useItemAction);
 // Disable the old success-only endpoints: they did not bind a carried item or spend it.
 for(const key of ['repair','plates','refuel','changedClothes','cuff'])registerHandler(`items.${key}`,async()=>{throw new Error('Use the item from your character sheet; the old unverified item endpoint is disabled.');});
 registerHandler('item.approvePerk',async({actorId,perkId,stat,reason,userId})=>{if(!game.users.get(userId)?.isGM||String(reason||'').trim().length<8)throw new Error('A GM and a reason are required.');const actor=game.actors.get(actorId),perk=actor?.items.get(perkId);if(perk?.type!=='perk'||perk.system.stat!==stat)throw new Error('Invalid perk.');await actor.update({[`flags.${NS}.perkApproval`]:{perkId,stat,reason:String(reason).slice(0,400),by:userId,expiresAt:worldSeconds()+600}});await card('PERK APPROVAL',actor.name,`<p>${esc(perk.name)}: ${esc(reason)}. One roll; expires in ten Watch minutes.</p>`);return true;});
 game.smoke??={};game.smoke.approvePerk=(actor,perk,reason)=>request('item.approvePerk',{actorId:actor.id,perkId:perk.id,stat:perk.system.stat,reason});game.smoke.itemActions={use:(actor,item,action)=>itemActionUI(actor,item,action),recover:(actor,id)=>request('transaction.recover',{actorId:actor.id,operationId:id})};
}
