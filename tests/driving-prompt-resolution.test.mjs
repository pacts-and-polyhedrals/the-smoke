import assert from 'node:assert/strict';
import {NS,vt,jt,jaz,fiesta,ut,settings,scene,chat,hooks,gm,p1,makeCombat} from './chase-harness.mjs';
import {promptCheck,openPrompts,recoverCompletedPrompts,installIncidents,_internals} from '../module/world/incidents.mjs';
import {applyDocumentUpdate} from './foundry-updates.mjs';
import {pendingResponses,actionKey} from '../module/world/chase-state.mjs';
import {combatAPI} from '../module/combat/combat.mjs';
import {SmokeCombatConsole} from '../module/apps/combat-console.mjs';
// This is deliberately the server's merge behaviour, not whole-object replacement.
const example={flags:{[NS]:{prompts:{waiting:{kind:'evade'}}}}};
applyDocumentUpdate(example,{[`flags.${NS}.prompts`]:{}});
assert.ok(example.flags[NS].prompts.waiting,'empty object does not delete a Foundry flag');
applyDocumentUpdate(example,{[`flags.${NS}.prompts.-=waiting`]:null});
assert.deepEqual(example.flags[NS].prompts,{});
const hp=fiesta.system.vehicle.body.value;
settings.autoEvade=true;
jaz.rolls.push({outcomeKey:'fullSuccess',total:25,margin:10});
await promptCheck(vt,{kind:'evade',band:'green',other:ut});
assert.equal(fiesta.system.vehicle.body.value,hp);
assert.equal(openPrompts(vt).length,0,'a successful automatic evasion removes its pending flag under Foundry merging');
settings.autoEvade=false;
await promptCheck(vt,{kind:'evade',band:'green',other:ut});
const pending=openPrompts(vt)[0];
await _internals.resolve({...pending.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'fullSuccess',margin:5});
assert.equal(openPrompts(vt).length,0,'a successful manual evasion also releases movement');
assert.deepEqual(pendingResponses({scene}),[],'the Combat Console response gate releases too');
assert.deepEqual(await _internals.gate({vt,scene,user:gm,transform:{x:2400,y:1000},passengers:{},free:false}),{x:2400,y:1000});
// A manual roll arriving through Foundry's real chat hook resolves the same gate.
installIncidents();await promptCheck(vt,{kind:'pitSave',band:'yellow'});const hookPrompt=openPrompts(vt)[0];
const rolled=await ChatMessage.implementation.create({content:'Successful Wheels',flags:{[NS]:{roll:{stat:'whl',actorUuid:jaz.uuid,actorName:jaz.name,outcomeKey:'fullSuccess',margin:5,context:hookPrompt.context}}}});
Hooks.callAll('createChatMessage',rolled);
for(let i=0;i<100&&openPrompts(vt).length;i++)await new Promise(r=>setTimeout(r,2));
assert.equal(openPrompts(vt).length,0,'a manual roll posted in chat unblocks the vehicle');
// Deleting one answer must not remove a different outstanding check.
await promptCheck(vt,{kind:'driveCheck',band:'yellow'});const drive=openPrompts(vt)[0];
await promptCheck(vt,{kind:'evade',band:'red',other:ut});const evade=openPrompts(vt).find(p=>p.pid!==drive.pid);
await _internals.resolve({...evade.context,fromChat:true,actorUuid:'Actor.wrong',outcomeKey:'fullSuccess'});
assert.equal(openPrompts(vt).length,2,'another actor cannot resolve the driver’s check');
await _internals.resolve({...evade.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'fullSuccess'});
assert.deepEqual(openPrompts(vt).map(p=>p.pid),[drive.pid]);
await _internals.resolve({...drive.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'fullSuccess'});
// Repeated chat hooks / clicks apply a collision once, including after completion.
await promptCheck(vt,{kind:'evade',band:'green',other:ut});const fail=openPrompts(vt)[0];
const failed={...fail.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'costlyFailure',margin:-2};
const before=fiesta.system.vehicle.body.value,otherBefore=ut.actor.system.vehicle.body.value;
await Promise.all([_internals.resolve(failed),_internals.resolve(failed)]);
assert.equal(fiesta.system.vehicle.body.value,before-4);assert.equal(ut.actor.system.vehicle.body.value,otherBefore-4);
await _internals.resolve(failed);assert.equal(fiesta.system.vehicle.body.value,before-4);
// If the final token write fails, dice are not reoffered and recovery only closes it.
settings.autoEvade=true;const update=vt.update;let denyDelete=true;
vt.update=async function(up,options){if(denyDelete&&Object.keys(up).some(k=>k.includes('.prompts.-=')))throw new Error('simulated deletion failure');return update.call(this,up,options);};
jaz.rolls.push({outcomeKey:'fullSuccess',total:25,margin:10});const chatAt=chat.length;
await assert.rejects(()=>promptCheck(vt,{kind:'evade',band:'green',other:ut}),/deletion failure/);
assert.equal(openPrompts(vt)[0].status,'resolved');
assert.ok(!chat.slice(chatAt).some(m=>/data-smoke-roll/.test(m.content)),'a completed roll never falls back to another roll button');
denyDelete=false;vt.update=update;
assert.equal(await recoverCompletedPrompts({scene,notify:false}),1);assert.equal(openPrompts(vt).length,0);
// A partially-applied outcome is held for GM review, rather than silently rerolled.
settings.autoEvade=false;await promptCheck(vt,{kind:'evade',band:'green',other:ut});const review=openPrompts(vt)[0];
const damage=fiesta.applyDamage;fiesta.applyDamage=async()=>{throw new Error('simulated outcome failure');};
await assert.rejects(()=>_internals.resolve({...review.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'costlyFailure'}),/outcome failure/);
fiesta.applyDamage=damage;assert.equal(openPrompts(vt)[0].status,'review');
await assert.rejects(()=>_internals.resolve({...review.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'fullSuccess'}),/already rolled/);
assert.equal(await recoverCompletedPrompts({scene,notify:false}),0,'partial outcomes are not guessed or replayed');
await vt.update({[`flags.${NS}.prompts.-=${review.pid}`]:null},{acVehicleCarry:true});
// Existing 0.5.2 worlds: recover matching saved automatic/manual rolls without
// repeating their success, failure damage, or the actual dice.
const legacy=async(pid,{done=false,outcome='fullSuccess',actorUuid=jaz.uuid,rollPid=pid}={})=>{
 const context={kind:'evade',pid,vt:vt.uuid,band:'green',other:ut.uuid,automatic:true};
 const card=await ChatMessage.implementation.create({content:'Old prompt',flags:{[NS]:{promptDone:done}}});
 await vt.update({[`flags.${NS}.prompts.${pid}`]:{kind:'evade',at:Date.now()-600000,context,actorUuid:jaz.uuid,messageId:card.id}},{acVehicleCarry:true});
 if(outcome)await ChatMessage.implementation.create({content:'Old driving roll',flags:{[NS]:{roll:{stat:'whl',actorUuid,outcomeKey:outcome,context:{...context,pid:rollPid}}}}});
};
await legacy('legacySuccess');await legacy('legacyFailed',{outcome:'costlyFailure'});await legacy('legacyManual',{done:true,outcome:null});
await legacy('unanswered',{outcome:null});await legacy('unrelated',{rollPid:'otherCheck'});await legacy('wrongActor',{actorUuid:'Actor.other'});
const hpBeforeRecovery=fiesta.system.vehicle.body.value,rollCount=jaz.rolled.length;
assert.equal(await recoverCompletedPrompts({scene,notify:false}),1,'only demonstrably completed legacy cards are auto-closed; mere dice do not prove damage was applied');
assert.equal(fiesta.system.vehicle.body.value,hpBeforeRecovery);assert.equal(jaz.rolled.length,rollCount);
assert.deepEqual(openPrompts(vt).map(p=>p.pid).sort(),['legacyFailed','legacySuccess','unanswered','unrelated','wrongActor']);
assert.ok(openPrompts(vt).filter(p=>p.status==='review'&&p.result).map(p=>p.pid).includes('legacyFailed'),'saved dice wait for manual effect certification, never replay impact');
assert.equal(await recoverCompletedPrompts({scene,notify:false}),0,'recovery is idempotent');
game.user=p1;await assert.rejects(()=>recoverCompletedPrompts({scene,notify:false}),/active GM/);game.user=gm;
for(const p of openPrompts(vt))await vt.update({[`flags.${NS}.prompts.-=${p.pid}`]:null},{acVehicleCarry:true});
// Completed UI cards stay disabled and cannot produce another roll.
await promptCheck(vt,{kind:'evade',band:'green',other:ut});const uiPrompt=openPrompts(vt)[0];
const message=game.messages.get(uiPrompt.messageId),oldRoll=jaz.rollStat;let clickedRolls=0;
jaz.rollStat=async(stat,opts)=>{clickedRolls++;await _internals.resolve({...opts.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'fullSuccess'});return {result:{success:true}};};
globalThis.HTMLElement=class {};
const button={dataset:{smokeRoll:jaz.uuid,stat:'whl',band:'easy',context:JSON.stringify(uiPrompt.context)},isConnected:true,addEventListener(_name,fn){this.click=fn;}};
const root=new HTMLElement();root.querySelectorAll=selector=>selector==='button'?[button]:[];
const {installChat}=await import('../module/ui.mjs');installChat();
for(const hook of hooks.renderChatMessageHTML||[])hook(message,root);
await button.click({preventDefault(){}});assert.equal(button.disabled,true);assert.equal(clickedRolls,1);
await button.click({preventDefault(){}});assert.equal(clickedRolls,1,'a stale click cannot reroll a completed card');
jaz.rollStat=oldRoll;
// Chase-wide matrix: all six outcomes release Done/Continue for yellow and red
// checks, evasions, PIT saves and ram defences. A failed check may still stop the
// motor for its current action; that must not prevent ending the action.
const combat=makeCombat();await combat.setFlag(NS,'chase',{auto:false});
const [pc,cop]=await combat.createEmbeddedDocuments('Combatant',[{tokenId:jt.id,sceneId:scene.id,actorId:jaz.id},{tokenId:ut.id,sceneId:scene.id,actorId:ut.actor.id}]);
globalThis.canvas={scene,tokens:{controlled:[]}};const consoleApp=new SmokeCombatConsole();
fiesta.system.vehicle.body={value:1000,max:1000};ut.actor.system.vehicle.body={value:1000,max:1000};jaz.system.resources.health={value:1000,max:1000};
const cases=[['driveCheck','yellow'],['driveCheck','red'],['evade','green'],['evade','red'],['pitSave','yellow'],['ramSave','yellow']];
const outcomes=['severeFailure','costlyFailure','narrowSuccess','fullSuccess','strongSuccess','exceptionalSuccess'];let checks=0;
for(const [kind,band]of cases)for(const outcomeKey of outcomes){
 const policeAction=kind==='pitSave'||kind==='ramSave',order=policeAction?[cop,pc,pc,cop,pc]:[pc,cop,pc,cop,pc];
 await combat.update({[`flags.${NS}.state`]:{phase:'resolve',round:++checks,cursor:0,queue:order.map((c,i)=>({cid:c.id,kind:'action',name:c.name,value:6-i,die:i}))},[`flags.${NS}.chase.action`]:null,[`flags.${NS}.chase.auto`]:policeAction});
 if(policeAction)await combat.update({[`flags.${NS}.chase.action`]:{key:actionKey(combat),status:'review',automatic:true}});
 await promptCheck(vt,{kind,band,other:ut,damage:{target:2,self:1}});const prompt=openPrompts(vt)[0];
 assert.equal((await consoleApp._prepareContext()).hasPending,true,'Console renders Done disabled until answered');
 if(policeAction)assert.equal((await consoleApp._prepareContext()).review,true,'NPC action is waiting on Continue');
 await assert.rejects(()=>combatAPI.next(combat),/Waiting/);
 await _internals.resolve({...prompt.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey,margin:outcomeKey==='severeFailure'?-4:outcomeKey==='costlyFailure'?-1:0});
 assert.equal(openPrompts(vt).length,0,`${kind}/${band}/${outcomeKey}: pending flag cleared`);
 assert.deepEqual(pendingResponses(combat),[],`${kind}/${band}/${outcomeKey}: Console unblocked`);
 assert.equal((await consoleApp._prepareContext()).hasPending,false,'Console renders Done enabled after resolution');
 await combatAPI.next(combat);assert.equal(combat.getFlag(NS,'state').cursor,1,`${kind}/${band}/${outcomeKey}: Done advances`);
 assert.equal((await consoleApp._prepareContext()).current.name,policeAction?jaz.name:ut.name,'the next participant is shown after Done / Continue');
}
await combat.delete();
console.log(`driving prompts: Foundry merge deletion, ${checks} chase outcome cases, duplicate damage protection, saved-world recovery and completed UI cards — ok`);
process.exit(0);
