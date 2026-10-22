import assert from 'assert/strict';
import {NS, coll, docs, batches, scene, token, vehicle, combats, flagged, clone, gm, p1, settings, totals, jaz, fiesta, vt, jt, ut, tt, hooks, chat} from './chase-harness.mjs';
import * as CS from '../module/world/chase-state.mjs';
import * as chase from '../module/world/chase.mjs';
import * as inc from '../module/world/incidents.mjs';
import {offerStop, armedCrime} from '../module/world/pursuit.mjs';
import {dispatch, request} from '../module/world/net.mjs';
import {combatAPI} from '../module/combat/combat.mjs';
import {installVehicleBoarding, moveVehicle, settlingMoves} from '../module/vehicles/vehicle-boarding.mjs';
import {installPursuit} from '../module/world/pursuit.mjs';
const tick = () => new Promise(r => setTimeout(r, 15));
const waitFor = async fn => { for (let i=0;i<1000;i++) {if(fn())return;await tick();} throw new Error('timed out'); };
installVehicleBoarding(); inc.installIncidents(); installPursuit();
// Explicit new defaults, plus one-time upgrade of v0.5.0's persisted default-on settings.
const defaults = {}; const oldRegister=game.settings.register;
game.settings.register=(_ns,k,o)=>{defaults[k]=o.default;};chase.registerChaseSettings();game.settings.register=oldRegister;
assert.equal(defaults.autoChase,true);assert.equal(defaults.chaseAuto,true);assert.equal(defaults.chaseMode,'full');assert.equal(defaults.autoEvade,true);
settings.autoChase=true;settings.chaseAuto=true;
await chase.migrateChasePacing();assert.equal(settings.autoChase,true);assert.equal(settings.chaseAuto,true);
settings.chaseAuto=false;await chase.migrateChasePacing();assert.equal(settings.chaseAuto,false,'later intentional preference survives reload');settings.chaseMode='manual';settings.chaseTrafficMode='shared';

// Full moveVehicle request, not a direct call to the incident helper: ordinary travel rolls automatically.
await vt.update({x:1000,y:1000},{acVehicleCarry:true}); await ut.update({x:1750,y:1000},{acVehicleCarry:true});
const rolled=jaz.rolled.length, body=fiesta.system.vehicle.body.value;
jaz.rolls.push({outcomeKey:'fullSuccess',total:22,margin:10});
await moveVehicle(vt,{x:2300,y:1000});await waitFor(()=>!settlingMoves.size);
assert.equal(jaz.rolled.length,rolled+1,'a swept collision rolled automatically outside combat');
assert.equal(jaz.rolled.at(-1).stat,'whl');assert.match(jaz.rolled.at(-1).label,/Evasive/);
assert.equal(fiesta.system.vehicle.body.value,body,'a successful swerve does not damage the motor');
assert.equal(inc.openPrompts(vt).length,0);
assert.ok(batches.some(b=>b.ups.some(u=>u._id===vt.id)&&b.ups.some(u=>u._id===jt.id)),'vehicle and driver are committed in the same movement batch');
// With automatic rolls disabled, the original manual card remains and does not silently expire.
settings.autoEvade=false;
await vt.update({x:1000,y:1000},{acVehicleCarry:true});
await moveVehicle(vt,{x:2300,y:1000});await waitFor(()=>!settlingMoves.size);
assert.equal(inc.openPrompts(vt).length,1);const prompt=inc.openPrompts(vt)[0];
await vt.update({[`flags.${NS}.prompts`]:{[prompt.pid]:{...prompt,at:Date.now()-3600000}}},{acVehicleCarry:true});
assert.equal(inc.openPrompts(vt).length,1,'thinking time never silently deletes a response gate');
// 0.5.16: out on the street an open card never strands the motor (it used to, with no way to clear it outside a chase).
await moveVehicle(vt,{x:2500});await waitFor(()=>!settlingMoves.size);
assert.equal(vt.x,2500,'outside a chase the driver can carry on while the card waits');
assert.equal(inc.openPrompts(vt).length,1,'and the card is still there to roll');
await inc._internals.resolve({...prompt.context,fromChat:true,actorUuid:jaz.uuid,outcomeKey:'fullSuccess',driver:jaz.name});
settings.autoEvade=true;
// A real native Token update of a player-owned vehicle also reaches the collision watcher.
await vt.setFlag(NS,'vehicleOccupants',[]);await jt.setFlag(NS,'vehicleSeat',null);fiesta.hasPlayerOwner=true;p1.character=jaz;
await vt.update({x:1000,y:1000},{acVehicleCarry:true});
const nativeRolls=jaz.rolled.length;
await vt.update({x:2300,y:1000});await waitFor(()=>jaz.rolled.length>nativeRolls);await tick();
assert.equal(jaz.rolled.length,nativeRolls+1,'native player-owned vehicle drag triggers the check');
fiesta.hasPlayerOwner=false;
await vt.setFlag(NS,'vehicleOccupants',[{seatId:'pilot',tokenId:jt.id,actorId:jaz.id,name:jaz.name}]);await jt.setFlag(NS,'vehicleSeat',{vehicleTokenId:vt.id,seatId:'pilot'});
await vt.update({x:1000,y:1000},{acVehicleCarry:true});await ut.update({x:2200,y:1000},{acVehicleCarry:true});
const combat=await chase.startChaseNow(scene,{targetId:jt.id});
assert.equal(combat.getFlag(NS,'chase').auto,false);
const pc=combat.combatants.find(c=>c.tokenId===jt.id),cop=combat.combatants.find(c=>c.tokenId===ut.id);
const queue=async(entries)=>combat.update({[`flags.${NS}.state`]:{phase:'resolve',round:1,cursor:0,queue:entries.map((c,i)=>({cid:c?.id??'@traffic',kind:c?'action':'traffic',name:c?.name??'All civilian traffic',value:6-i,die:i}))},[`flags.${NS}.chase.action`]:null});
// In Story mode a player cannot switch on assistance or start rounds; their own response is always allowed.
await assert.rejects(dispatch('chase.auto',{combatId:combat.id,auto:true,userId:p1.id}),/Story/);
settings.playMode='self';
assert.ok(CS.canManageChase(combat,p1));
await dispatch('chase.auto',{combatId:combat.id,auto:true,userId:p1.id});assert.equal(combat.getFlag(NS,'chase').auto,true);
await dispatch('chase.auto',{combatId:combat.id,auto:false,userId:p1.id});
await assert.rejects(dispatch('chase.auto',{combatId:combat.id,auto:true,userId:'stranger'}),/Story/);
await assert.rejects(dispatch('combat.reveal',{combatId:combat.id,force:true,userId:p1.id}),/Not allowed/);
// Reveal includes exactly one shared phase; no civilian speed-die turns are interleaved with PCs/police.
await request('combat.npcSpeed',{combatId:combat.id});await combatAPI.rollSpeed(pc);await request('combat.reveal',{combatId:combat.id});
assert.equal(CS.stateOf(combat).queue.filter(e=>e.kind==='traffic').length,1);
assert.ok(!combat.combatants.some(c=>c.tokenId===tt.id));

await queue([cop,pc]);await offerStop(jt,ut,combat);
assert.match(CS.pendingResponses(combat).join(','),/answer the police/);
await assert.rejects(request('combat.next',{combatId:combat.id}),/Waiting/);
const stop=jt.getFlag(NS,'policeStop'),stars=jaz.system.heat.value;
jaz.rolls.push({outcomeKey:'fullSuccess',total:22,margin:5});
await dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:stop.id,choice:'talk',userId:p1.id});
assert.equal(jaz.system.heat.value,stars-1,'successful talk removes exactly one star');
assert.equal(jt.getFlag(NS,'policeStop').status,'escapeChoice');
const count=jaz.rolled.length;
await assert.rejects(dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:stop.id,choice:'talk',userId:p1.id}),/Finish/);
assert.equal(jaz.rolled.length,count,'repeated card clicks cannot grant a second roll or star reduction');
await dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:stop.id,choice:'vehicle',vehicleId:vt.id,userId:p1.id});
assert.equal(jt.getFlag(NS,'policeStop').status,'escapeMove');
// 0.5.18: the button alone no longer spends the opening; the player has to move first.
await assert.rejects(dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:stop.id,choice:'finish',userId:p1.id}),/Move first/);
await moveVehicle(vt,{x:vt.x+400});await waitFor(()=>!settlingMoves.size);
assert.equal(jt.getFlag(NS,'policeStop').moved,4,'out-of-turn escape movement has its own finite budget');
// A drag past the limit stops at it (it used to be refused outright), and using every square ends the escape by itself.
const escMax=jt.getFlag(NS,'policeStop').max,x0=vt.x;
await moveVehicle(vt,{x:vt.x+3000});await waitFor(()=>!settlingMoves.size);
assert.equal(Math.round((vt.x-x0)/100),Math.floor(escMax-4+0.25),`driven as far as the ${escMax} squares go`);
await waitFor(()=>jt.getFlag(NS,'policeStop')===null);
assert.ok(chat.some(m=>/ESCAPE MOVE/.test(m.content??'')));
await assert.rejects(dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:stop.id,choice:'finish',userId:p1.id}),/no longer active/);
// Incoming attacks gate the next action until Take hit or Dodge is actually resolved.
const incoming=await ChatMessage.implementation.create({content:'Incoming',flags:{[NS]:{attack:{target:jt.uuid,attackerName:'PC',damage:2},chaseCombatId:combat.id}}});
await assert.rejects(request('combat.next',{combatId:combat.id}),/Take hit or Dodge/);
await incoming.setFlag(NS,'resolved',true);
// Delayed AI is cancellable in Assisted/Manual mode; cancellation cannot mark the unperformed action as reviewed.
chase.installChase();await queue([cop,pc]);
await request('chase.auto',{combatId:combat.id,auto:true});
await waitFor(()=>combat.getFlag(NS,'chase').action?.status==='running');
const startX=ut.x,startY=ut.y;await request('chase.auto',{combatId:combat.id,auto:false});
await waitFor(()=>!combat.getFlag(NS,'chase').action);
assert.deepEqual([ut.x,ut.y],[startX,startY],'off during the reading delay cancels movement');
assert.equal(CS.stateOf(combat).cursor,0);
await Promise.all([combatAPI.next(combat),combatAPI.next(combat)]);
assert.equal(CS.stateOf(combat).cursor,1,'two stale Done clicks advance only once');
// Traffic moves as one batch on every animation frame, including a motor outside the original four-car selection.
const extra=vehicle('Civilian van');const xt=token(extra,{x:500,y:4500,w:2,h:3,rotation:270,flags:{traffic:{kind:'moving',route:[[600,4650],[4500,4650]],s:0}}});
await tt.update({x:400,y:2500,[`flags.${NS}.traffic.route`]:[[500,2650],[4500,2650]],[`flags.${NS}.traffic.s`]:0},{acVehicleCarry:true});
await ut.update({x:7000,y:7000},{acVehicleCarry:true});
await queue([null,pc]);const b0=batches.length;
await request('chase.npcTurn',{combatId:combat.id,key:CS.actionKey(combat)});await waitFor(()=>combat.getFlag(NS,'chase').action?.status==='review');
const frames=batches.slice(b0).filter(b=>b.options.smokeTraffic);
assert.equal(frames.length,12);assert.ok(frames.every(b=>[tt.id,xt.id].every(id=>b.ups.some(u=>u._id===id))),'all traffic shares every animation frame');
assert.equal(CS.stateOf(combat).cursor,0,'traffic also waits for human review');
// Police response is crime-aware: high stars alone do not turn a bluff into gunfire.
await jaz.setHeat(4);assert.equal(armedCrime(jaz),false);await jaz.setFlag(NS,'recentCrimes',[{key:'murder'}]);assert.equal(armedCrime(jaz),true);
await queue([cop,pc]);await offerStop(jt,ut,combat);const armedStop=jt.getFlag(NS,'policeStop');
jaz.rolls.push({outcomeKey:'costlyFailure',total:2,margin:-8});totals.push(30);
await dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:armedStop.id,choice:'talk',userId:p1.id});
assert.equal(jt.getFlag(NS,'policeStop').status,'choice');
assert.ok(CS.pendingResponses(combat).some(p=>/Take hit or Dodge/.test(p)),'failed armed-crime bluff produces one answerable gunfire card');
const shots=chat.filter(m=>/SHOTS FIRED · RESPOND/.test(m.content));assert.equal(shots.length,1);
await assert.rejects(request('combat.next',{combatId:combat.id}),/Waiting/);
assert.equal(jaz.system.resources.health.value,12,'gunfire waits for its target to respond');
// Foot escape is also a single finite turn, available even during a police action.
for (const m of shots) await m.setFlag(NS,'resolved',true);
await jt.setFlag(NS,'policeStop',null);await jaz.setHeat(2);await jaz.setFlag(NS,'recentCrimes',[]);
await offerStop(jt,ut,combat);const footStop=jt.getFlag(NS,'policeStop');
jaz.rolls.push({outcomeKey:'fullSuccess',total:25,margin:12});
await dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:footStop.id,choice:'talk',userId:p1.id});
await dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:footStop.id,choice:'foot',userId:p1.id});
assert.equal(CS.vehicleOf(jt),null);
await dispatch('chase.footMove',{tokenUuid:jt.uuid,x:jt.x+400,y:jt.y,userId:p1.id});
const fx=jt.x;await dispatch('chase.footMove',{tokenUuid:jt.uuid,x:jt.x+300,y:jt.y,userId:p1.id});
assert.equal(jt.x,fx+200,'a drag past the six squares stops at the sixth');
assert.equal(jt.getFlag(NS,'policeStop'),null,'all six used: the escape ends without the button');
assert.equal(jaz.system.heat.value,1,'finishing an opening does not award the talk star twice');
// Zero stars actually resolves and deletes the chase.
await offerStop(jt,ut,combat);const finalStop=jt.getFlag(NS,'policeStop');
jaz.rolls.push({outcomeKey:'fullSuccess',total:25,margin:12});
await dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:finalStop.id,choice:'talk',userId:p1.id});
assert.equal(jaz.system.heat.value,0);assert.equal(combats.has(combat.id),false);
// Real arrest handler: failure for a non-violent stop, and voluntary surrender even for a gun crime.
const custody=flagged({id:'custody',name:'Custody',width:1000,height:1000,grid:{size:100},flags:{[NS]:{place:{id:'LDP-CUSTODY'}}},tokens:coll(),view:()=>{}});
custody.createEmbeddedDocuments=async(_type,list)=>list.map(d=>{const fresh=flagged({...d,id:'released-'+Math.random(),parent:custody,actor:jaz,actorId:jaz.id,flags:d.flags??{},async update(up){for(const [k,v] of Object.entries(up))this[k]=v;return this;}});fresh.uuid=`Scene.custody.Token.${fresh.id}`;custody.tokens.set(fresh.id,fresh);docs.set(fresh.uuid,fresh);return fresh;});
game.scenes.set(custody.id,custody);
jt.toObject=()=>({actorId:jaz.id,name:jt.name,x:jt.x,y:jt.y,width:jt.width,height:jt.height,flags:clone(jt.flags)});
await jaz.setHeat(4);await jaz.setFlag(NS,'recentCrimes',[{key:'dangerousDriving'}]);
await offerStop(jt,ut);const arrestStop=jt.getFlag(NS,'policeStop');jaz.rolls.push({outcomeKey:'costlyFailure',total:2,margin:-8});
await dispatch('chase.respond',{tokenUuid:jt.uuid,responseId:arrestStop.id,choice:'talk',userId:p1.id});
assert.equal(jaz.system.heat.value,0);assert.ok(custody.tokens.size,'a failed non-violent bluff actually transfers the PC to custody');
assert.ok(chat.some(m=>/BUSTED/.test(m.content)));
console.log('chase decisions: upgrade defaults, real travel collisions, native drags, non-expiring prompts, mode permissions, shared traffic batches, single escape opportunity, damage gates, cancellation and duplicate-click protection — ok');
process.exit(0);
