import assert from 'node:assert/strict';
import {NS,gm,p1,scene,pt,vt,jt,ut,makeCombat} from './chase-harness.mjs';
import {squaresBetween,meterNext,recordJourney} from '../module/vehicles/travel-meter.mjs';
import {chaseOf,pendingResponseDetails,pendingResponses,chaseMode} from '../module/world/chase-state.mjs';
import {installPlayerInteractions,playerContextAllowed,playerActionsFor} from '../module/interaction/player-context.mjs';

assert.equal(squaresBetween([0,0],[300,400],100),5);
assert.throws(()=>squaresBetween([0,0],[30,40],0),/grid/);
assert.equal(meterNext({total:1.25},2.25,'manual').total,3.5);
assert.throws(()=>meterNext(null,-1),/Invalid/);
assert.throws(()=>meterNext(null,Infinity),/Invalid/);
const travelBefore=Number(vt.getFlag(NS,'travel')?.total||0);
await recordJourney(vt,2.5,{source:'player'});
assert.equal(vt.getFlag(NS,'travel').total,travelBefore+2.5);
await recordJourney(vt,2.5,{source:'cop'});
assert.equal(vt.getFlag(NS,'travel').total,travelBefore+5);

const combat=makeCombat();
await combat.createEmbeddedDocuments('Combatant',[{tokenId:jt.id,sceneId:scene.id,actorId:jt.actor.id},{tokenId:ut.id,sceneId:scene.id,actorId:ut.actor.id}]);
assert.equal(chaseOf(scene),null,'ordinary combat must never masquerade as a chase');
await combat.setFlag(NS,'chase',{mode:'full',auto:true});
assert.equal(chaseOf(scene),combat);
assert.equal(chaseMode(combat),'full');
// Old unrelated card on a parked vehicle must not block PCs or police.
await pt.setFlag(NS,'prompts',{old:{kind:'evade',context:{key:'elsewhere:1:1'}}});
assert.deepEqual(pendingResponseDetails(combat),[]);
await vt.setFlag(NS,'prompts',{current:{kind:'evade',context:{key:`${combat.id}:1:0`},status:'review',result:{outcomeKey:'fullSuccess'}}});
assert.equal(pendingResponseDetails(combat).length,1);
assert.equal(pendingResponseDetails(combat)[0].tokenId,vt.id);
assert.match(pendingResponses(combat).join(' '),/Recorded driving outcome/);
await vt.update({[`flags.${NS}.prompts.-=current`]:null},{acVehicleCarry:true});
assert.deepEqual(pendingResponses(combat),[]);
combat.active=false;
await combat.update({[`flags.${NS}.state`]:{phase:'idle',round:1,queue:[],cursor:0}});
assert.equal(chaseOf(scene),null,'stale inactive combat must not freeze free-roam cars');

const npcDoc={id:'street-npc',name:'Passer-by',actor:{type:'npc',isOwner:false},hidden:false,parent:scene};
const visible={document:npcDoc,isOwner:false,isVisible:true,visible:true};
game.user=p1;
assert.equal(playerContextAllowed(visible,p1),true);
assert.equal(playerActionsFor(npcDoc,p1).length,2);
assert.ok(playerActionsFor(npcDoc,p1).some(a=>/pickpocket/i.test(a.title)));
assert.equal(playerContextAllowed({...visible,isVisible:false},p1),false);
assert.equal(playerContextAllowed({...visible,isOwner:true},p1),false);
assert.equal(playerContextAllowed({...visible,document:{...npcDoc,hidden:true}},p1),false);
assert.equal(playerActionsFor({...npcDoc,hidden:true},p1).length,0);
assert.equal(playerContextAllowed(visible,gm),false);
// A player's context intercept must not expose the native owner/GM HUD.
installPlayerInteractions();
const placeable=Object.create(Token.prototype);placeable.document=npcDoc;placeable.isOwner=false;placeable.isVisible=true;placeable.visible=true;
assert.equal(placeable._canHUD(p1),true);
placeable._onClickRight({clientX:10,clientY:20}); // HTML-less fixture: harmless; native HUD is still bypassed
assert.equal(game.user.isGM,false);
game.user=gm;
console.log('recovery contract: authoritative distance ledger, scoped blockers, ghost-chase cleanup, visible nonowned NPC actions and no ownership escalation — ok');
