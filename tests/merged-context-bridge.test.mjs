// Exercise both branches together: the new stat-balancing perks under the audit
// branch's strict context validation. This is a document simulation, not Foundry.
import assert from 'node:assert/strict';
import {makeWorld,collection} from './world-fixture.mjs';
import {J} from './fakes.mjs';
const NS='the-smoke',w=await makeWorld({players:2}),[a,b]=w.pcs;
const {enableItemRules,perkEligible,contextTags,authoredPerkTags,PERK_TAGS}=await import('../module/rules/item-context.mjs');
const {attack}=await import('../module/combat/combat.mjs');
enableItemRules();
const lib=J('london-items.json').items;
const add=async name=>(await a.createEmbeddedDocuments('Item',[structuredClone(lib.find(i=>i.name===name))]))[0];
const at=await w.put(a,'LDP-ARCHES',[350,350]),bt=await w.put(b,'LDP-ARCHES',[450,350]),scene=at.parent;
const added=['Shoulder Charge','Heavy Lifting','Second Wind','Long Shift','Good Arm','Quick Draw','Hotwire Kid','Light Fingers','Poker Face'];
for(const name of added){const perk=await add(name);assert.ok(PERK_TAGS[name]?.length,`${name} has contextual eligibility`);assert.equal(perkEligible(a,perk,perk.system.stat,{}),false,`${name} does not become an unconditional bonus`);}
const perk=name=>a.items.find(i=>i.name===name);
// Authoritative world actions, not arbitrary client tags.
const car=w.createActor({name:'Target car',type:'vehicle',system:{vehicle:{klass:'car'}}});
const ct=await w.addToken(scene,{actorId:car.id,actorLink:true,x:400,y:400});
assert.equal(perkEligible(a,perk('Hotwire Kid'),'grf',{context:{kind:'theft',target:ct.uuid}}),true);
assert.equal(perkEligible(a,perk('Light Fingers'),'grf',{context:{kind:'pickpocket',sceneId:scene.id,targetTokenId:bt.id}}),true);
await bt.update({x:3000});
assert.equal(perkEligible(a,perk('Light Fingers'),'grf',{context:{kind:'pickpocket',sceneId:scene.id,targetTokenId:bt.id}}),false);
await bt.update({x:400});
await at.setFlag(NS,'policeStop',{id:'stop1'});
assert.equal(perkEligible(a,perk('Poker Face'),'btl',{context:{kind:'policeSilent'}}),true);
await at.unsetFlag(NS,'policeStop');
assert.equal(perkEligible(a,perk('Poker Face'),'btl',{context:{kind:'policeSilent'}}),false);
await a.addCondition('Knackered');assert.equal(perkEligible(a,perk('Second Wind'),'grt',{}),true);await a.removeCondition('Knackered');
// GM-authored checks grant the new perks only to the requested actor/stat.
for(const [name,stat,text]of [['Shoulder Charge','mus','Barge through the locked door'],['Heavy Lifting','mus','Lift the engine block'],['Long Shift','grt','Endure hours on a cold stakeout']]){
 const msg=await ChatMessage.implementation.create({flags:{[NS]:{request:{id:`req-${name}`,title:text,text:'',responses:[{stat,label:text}],actorIds:[a.id],results:{}}}}});msg.author=w.gm;
 const context={kind:'request',requestId:`req-${name}`,messageId:msg.id,actorId:a.id};
 assert.equal(perkEligible(a,perk(name),stat,{context}),true,name);
 msg.author=w.users.get('user1');assert.equal(perkEligible(a,perk(name),stat,{context}),false,'player-authored request cannot grant a perk');msg.author=w.gm;
 msg.flags[NS].request.results[a.id]={total:10};assert.equal(perkEligible(a,perk(name),stat,{context}),false,'spent request cannot be reused');
}
assert.ok(authoredPerkTags('Carry a heavy crate for hours').includes('heavyLift'));
const context={kind:'mission',missionId:'mtest',missionRunId:'run1',attemptId:'attempt1'};
await game.settings.set(NS,'missions',{mtest:{attempts:{attempt1:{actorId:a.id,runId:'run1',status:'open',contextTags:['heavyLift']}}}});
assert.equal(perkEligible(a,perk('Heavy Lifting'),'mus',{context}),true);
assert.equal(perkEligible(a,perk('Heavy Lifting'),'mus',{context:{...context,missionRunId:'wrong'}}),false);
assert.equal(perkEligible(a,perk('Heavy Lifting'),'mus',{context:{kind:'madeUp',tags:['heavyLift']}}),false);
// Quick Draw: only the first ranged action in round one, never every Aim roll.
const gun=await add('Polymer Nine');
const combat={id:'fight1',scene,combatants:collection([{id:'fighter1',actor:a}]),flags:{[NS]:{state:{phase:'resolve',round:1,queue:[{cid:'fighter1'}],cursor:0}}},getFlag(ns,k){return this.flags[ns]?.[k];}};
game.combats.push(combat);
const shot={context:{kind:'attack',weaponId:gun.id,target:bt.uuid}};
assert.equal(perkEligible(a,perk('Quick Draw'),'aim',shot),true);
combat.flags[NS].state.cursor=1;assert.equal(perkEligible(a,perk('Quick Draw'),'aim',shot),false);combat.flags[NS].state.cursor=0;
await ChatMessage.implementation.create({flags:{[NS]:{roll:{context:{kind:'attack',combatId:combat.id}}}}});
assert.equal(perkEligible(a,perk('Quick Draw'),'aim',shot),false,'second shot cannot reuse Quick Draw before Done');
// Retain a last thrown item during its actual roll, then delete the spent copy.
const brick=await add('Thrown Brick');await brick.update({'system.quantity':1});
let called=0;a.rollStat=async(stat,options)=>{called++;assert.ok(a.items.get(brick.id),'trusted weapon exists during roll');assert.equal(brick.system.quantity,0,'throw already reserved');assert.equal(perkEligible(a,perk('Good Arm'),'aim',options),true);return null;};
await attack(at,{weapon:brick,target:bt,auto:true});
assert.equal(called,1);assert.equal(a.items.get(brick.id),undefined,'spent throw removed after roll');
console.log('merged contexts: nine new perks retained, conditional authority checks, world theft/pickpocket/interview, GM requests, mission attempts, first-shot deduplication and last thrown-item lifecycle passed');
process.exit(0);
