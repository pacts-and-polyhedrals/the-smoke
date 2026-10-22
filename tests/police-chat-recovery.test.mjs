import assert from 'node:assert/strict';
import {NS,scene,token,vehicle,makeCombat,gm,p1,jaz,jt,ut,chat} from './chase-harness.mjs';
import {fakeActor} from './fakes.mjs';
import {card,dispatch} from '../module/world/net.mjs';
import {offerStop,installPursuit} from '../module/world/pursuit.mjs';
import {pendingAttacks} from '../module/world/chase-state.mjs';
import '../module/combat/combat.mjs';
import '../module/gameplay.mjs';

// A stale attack from a previous combat cannot poison a fresh police stop on the same person.
const c=makeCombat();const old=await card('HIT','An old hit','<p>Old fight</p>','damage',{flags:{[NS]:{attack:{target:jt.uuid,damage:2,attackerName:'Previous fight'},chaseCombatId:'previous-fight'}}});
const npc=fakeActor({name:'Unrelated Londoner',type:'npc'});const other=token(npc,{x:6400,y:3900});
const unrelated=await card('HIT','Hit on a different character','<p>Different target</p>','damage',{flags:{[NS]:{attack:{target:other.uuid,damage:2,attackerName:'Other combat'},chaseCombatId:c.id}}});
const s=await offerStop(jt,ut,c);assert.ok(jt.getFlag(NS,'policeStop'));
const decide=(choice)=>dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:jt.getFlag(NS,'policeStop').id,choice,userId:p1.id});
let statRolls=0;
const original=jaz.rollStat;
jaz.rollStat=async(stat,opts)=>{statRolls++;assert.equal(stat,'frt');return {result:{success:true,outcomeKey:'fullSuccess'}};};
const next=await decide('talk');
assert.equal(statRolls,1,'Talk your way out actually rolls instead of being blocked by another attack');
assert.equal(jt.getFlag(NS,'policeStop')?.status,'escapeChoice','success advances to escape selection');
assert.equal(old.getFlag(NS,'resolved'),undefined);
assert.equal(unrelated.getFlag(NS,'resolved'),undefined);

// A current attack on THIS character blocks appropriately, and one successful Take Hit unblocks the decision.
await jt.setFlag(NS,'policeStop',null);await offerStop(jt,ut,c);
const hit=await card('HIT','This target','<p>Resolve before moving</p>','damage',{flags:{[NS]:{attack:{target:jt.uuid,damage:2,attackerName:'Officer',effects:[]},chaseCombatId:c.id}}});
await assert.rejects(()=>decide('talk'),/incoming hit on Jaz.*chat card/);
await dispatch('combat.resolve',{messageId:hit.id,userId:p1.id,dodge:false});
assert.equal(hit.getFlag(NS,'resolved'),true);
await decide('talk');assert.equal(statRolls,2);

// An automatic attempt to begin after another request has started the round must not freeze the chase assistant.
const race=makeCombat();
await race.update({[`flags.${NS}.state`]:{phase:'resolve',round:4,cursor:0,queue:[]}});
assert.deepEqual(await dispatch('combat.begin',{combatId:race.id,userId:gm.id,automatic:true}),{skipped:true,phase:'resolve'});
await assert.rejects(()=>dispatch('combat.begin',{combatId:race.id,userId:gm.id}),/Finish this round/);
// Reproduce the reported fix-by-reset: a previous combat still has a HIT card and stop flag.
// The new fight must accept a fresh police choice without requiring the GM to delete chat history.
await jt.setFlag(NS,'policeStop',null);
await jaz.setHeat(3,'Test reset with fresh wanted status');
const abandoned=makeCombat();
await offerStop(jt,ut,abandoned);
const abandonedStop=jt.getFlag(NS,'policeStop');
const abandonedCard=chat.find(m=>m.id===abandonedStop.messageId);
const orphanHit=await card('HIT','Old encounter unfinished hit','<p>Old fight</p>','damage',
  {flags:{[NS]:{attack:{target:jt.uuid,damage:2,attackerName:'Earlier unit'},chaseCombatId:abandoned.id}}});
await abandoned.delete();
assert.equal(pendingAttacks(scene).includes(orphanHit),false,'deleted fight cannot poison future roadside checks');
const fresh=makeCombat();
await offerStop(jt,ut,fresh);
const freshStop=jt.getFlag(NS,'policeStop');
assert.notEqual(freshStop.id,abandonedStop.id,'new encounter gets a new police decision');
assert.equal(freshStop.combatId,fresh.id);
assert.equal(abandonedCard.getFlag(NS,'promptDone'),true,'obsolete card is disabled on the GM-visible chat log');
await decide('talk');
assert.equal(statRolls,3,'fresh choice correctly performs a new Front roll');

// Deleting a combat while a choice exists must also make the obsolete chat button harmless.
await jt.setFlag(NS,'policeStop',null);
installPursuit();
const erased=makeCombat();
await offerStop(jt,ut,erased);
const erasedStop=jt.getFlag(NS,'policeStop');
const erasedCard=game.messages.get(erasedStop.messageId);
await erased.delete();
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(jt.getFlag(NS,'policeStop'),null,'deleteCombat proactively clears the obsolete token stop');
assert.equal(erasedCard.getFlag(NS,'promptDone'),true,'deleteCombat disables old decision buttons');

// A message pressed while its combat has just been deleted cannot roll or resurrect the stopped state.
await jaz.setHeat(3,'Legacy stop scenario');
const legacy=makeCombat();
await offerStop(jt,ut,legacy);
const legacyStop=jt.getFlag(NS,'policeStop');
const legacyCard=game.messages.get(legacyStop.messageId);
game.combats.delete(legacy.id); // mimic a saved-world reset before the new hook was installed
await assert.rejects(()=>dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:legacyStop.id,choice:'talk',userId:p1.id}),/combat which has ended/);
assert.equal(jt.getFlag(NS,'policeStop'),null,'legacy obsolete policeStop clears on click');
assert.equal(legacyCard.getFlag(NS,'promptDone'),true,'legacy obsolete chat card disabled');
assert.equal(statRolls,3,'obsolete police button never produces a phantom roll');

jaz.rollStat=original;
console.log('police chat recovery: unrelated/stale hits filtered, genuine hit must resolve, reset/deleted encounter clears obsolete decisions, fresh Front roll works, automatic round races skip — ok');
process.exit(0);
