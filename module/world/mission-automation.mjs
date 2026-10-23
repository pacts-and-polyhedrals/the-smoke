import {authoredPerkTags} from '../rules/item-context.mjs';
// Run-bound mission actions. All state changes and receipts are produced by the elected GM.
// A contract is not proof: tokens, actor ownership, current positions and actual roll messages
// are checked again here, immediately before an objective can advance.
import {NS} from '../config.mjs';
import {isLeader,registerHandler,request,card,esc,ownersOf} from './net.mjs';
import {missionData,missionState,missionEvent,withMissionState,configureMissionContracts,objectiveDone,needed} from './missions.mjs';
import {scaledCount,checkpointReady,branchState,atAnchor,contributionMissing,requirementsFor} from '../rules/mission-contract.mjs';
import {actorToken,tokenCentre,tokenRect,mapIdOf,zonesOf,distanceSquares,ensurePersonActor,ensureVehicleActor,placeToken} from './spawn.mjs';
import {findOrImportScene,transfer,mapLinks} from '../map/map-transit.mjs';
import {loadCast,castActor,importCast} from './cast.mjs';
import {withActionLocks,worldSeconds} from './action-locks.mjs';

const RESOURCE='missionResource',MARKER='missionAction';
let installed=false,refreshing=false,scheduled=null;
const clone=v=>foundry.utils.deepClone(v);
const activeRuns=()=>Object.entries(missionState()).filter(([,s])=>s.status==='active'&&s.automationVersion===1);
export function pointOf(t){
  if(!t)return null;
  // A boarded PC's tiny/hidden seat token is not a second physical location.
  const seat=t.getFlag?.(NS,'vehicleSeat'), vt=seat&&t.parent?.tokens?.get?.(seat.vehicleTokenId);
  const pos=vt||t,[x,y]=tokenCentre(pos);
  return {mapId:mapIdOf(t.parent),x,y,grid:t.parent.grid?.size||100,
    zoneIds:zonesOf(t.parent).filter(z=>{const [a,b,w,h]=z.rect;return x>=a&&x<=a+w&&y>=b&&y<=b+h;}).map(z=>z.id)};
}
function tokens(){return [...(game.scenes||[])].flatMap(s=>[...(s.tokens||[])]);}
export function resourcesFor(m,s,group=null){return tokens().filter(t=>{const f=t.getFlag?.(NS,RESOURCE);return f?.missionId===m.id&&f.runId===s.runId&&(!group||f.group===group);});}
function participant(id,userId,s,sceneId=null){
  const user=game.users.get(userId),actor=game.actors.get(id),t=actorToken(actor,{userId});
  if(!user||!actor||actor.type!=='character'||(!user.isGM&&!actor.testUserPermission?.(user,'OWNER')))throw new Error('Choose your own player character.');
  if(!s.actorIds?.includes(id))throw new Error('Join this mission before taking part.');
  if(!t||sceneId&&t.parent.id!==sceneId)throw new Error('Your character is not on the required map.');
  return {actor,t,user};
}
async function job(id){const m=(await missionData()).missions.find(x=>x.id===id),s=missionState()[id];
  if(!m?.automation||s?.status!=='active'||s.automationVersion!==1)throw new Error('This automated mission is not active.');
  return {m,s};
}
function locationFor(c,t){const point=pointOf(t),a=c.locations?.find(x=>atAnchor(point,x));if(!a)throw new Error(`Go to ${c.locations?.map(x=>x.name).join(' or ')||'the checkpoint'} first.`);return {point,a};}
function receipt(m,s,actor,t,details={}){return {missionId:m.id,missionRunId:s.runId,actorId:actor.id,sceneId:t.parent.id,location:pointOf(t),verified:true,worldTime:worldSeconds(),...details};}
export function resourceFlag(t){return t?.getFlag?.(NS,RESOURCE)||null;}
function recordRef(t){return {sceneId:t.parent.id,tokenId:t.id,serial:resourceFlag(t)?.serial};}
function overlap(a,b){return a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];}
/**
 * Find an unoccupied footprint for a job's vehicle, person or marker. It never overwrites a GM's placement. Search order
 * (0.5.27): the anchor's block; the roads beside it; the same footprint turned sideways; then the nearest clear roads,
 * paths and junctions on the map, then any clear ground. Moving traffic doesn't count as in the way (it drives off).
 * Before, a single busy block (Morning Lane at rush hour) made the whole mission fail to start.
 */
export function placementAt(scene,anchor,width=1,height=1,index=0){
  const g=scene.grid?.size||100,zones=zonesOf(scene),z=zones.find(x=>x.id===anchor.zoneId);
  if(!z)throw new Error(`${mapIdOf(scene)} is missing zone ${anchor.zoneId}; repair the map before starting.`);
  const occupied=[...(scene.tokens||[])].filter(t=>!t.hidden&&t.getFlag?.(NS,'traffic')?.kind!=='moving'&&!t.getFlag?.(NS,'vehicleSeat')).map(tokenRect);
  const axis=(lo,span,foot)=>{if(span<foot)return [];const out=[];for(let v=lo+foot/2;v<=lo+span-foot/2+.01;v+=g/2)out.push(v);out.push(lo+span-foot/2);return [...new Set(out)];};
  const near=(a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y);
  const tryRegions=(regions,w,h,rotation=0)=>{
    const W=w*g,H=h*g,spots=[];
    for(const [x,y,rw,rh]of regions)for(const py of axis(y,rh,H))for(const px of axis(x,rw,W))spots.push({x:px,y:py});
    spots.sort(near);
    const legal=spots.find(p=>!occupied.some(r=>overlap([Math.round(p.x-W/2),Math.round(p.y-H/2),W,H],r)));
    return legal?{...legal,rotation}:null;
  };
  const street=String(mapIdOf(scene)).startsWith('LDN-');
  let own=[z.rect];
  if(street&&!anchor.allowPark&&['land','park'].includes(z.kind)){
    const adjacent=zones.filter(x=>(z.adjacent||[]).includes(x.id)&&['road','path','junction'].includes(x.kind));
    if(adjacent.length)own=adjacent.map(x=>x.rect);
  }
  const beside=zones.filter(x=>(z.adjacent||[]).includes(x.id)&&(!street||['road','path','junction'].includes(x.kind))).map(x=>x.rect);
  const byDistance=list=>list.map(x=>({r:x.rect,d:Math.hypot(x.rect[0]+x.rect[2]/2-anchor.x,x.rect[1]+x.rect[3]/2-anchor.y)})).sort((a,b)=>a.d-b.d).map(x=>x.r);
  const roads=byDistance(zones.filter(x=>x!==z&&(!street||['road','path','junction'].includes(x.kind))));
  const anywhere=[[0,0,Number(scene.width)||z.rect[0]+z.rect[2]+g*20,Number(scene.height)||z.rect[1]+z.rect[3]+g*20]];
  const turn=width!==height;
  for(const regions of [own,beside,roads.slice(0,12),roads,anywhere]){
    const p=tryRegions(regions,width,height)??(turn?tryRegions(regions,height,width,90):null);
    if(p)return p;
  }
  throw new Error(`No clear ${width} x ${height} space anywhere on ${scene.name||mapIdOf(scene)} near ${anchor.name}. Move an obstruction, then repair mission resources.`);
}
async function markerActor(){
  let a=game.actors.find(x=>x.getFlag?.(NS,'missionActionBase'));
  return a||Actor.implementation.create({name:'Mission interaction',type:'npc',img:`systems/${NS}/assets/ui/npc.svg`,ownership:{default:0},
    prototypeToken:{actorLink:false,width:1,height:1,displayName:20,sight:{enabled:false},texture:{src:`systems/${NS}/assets/ui/npc.svg`,fit:'contain'}},flags:{[NS]:{missionActionBase:true}}});
}
async function castAt(m,s,c){
  const scene=await findOrImportScene(c.location.mapId);
  const existing=[...scene.tokens].find(t=>!t.hidden&&(t.actor?.getFlag?.(NS,'castKey')===c.key||c.existing&&t.actor?.getFlag?.(NS,'npcKey')===c.existing));
  if(existing)return existing;
  const cast=(await loadCast()).cast;let actor=castActor(c.key,cast);
  if(!actor){if(c.existing)actor=await ensurePersonActor(c.existing);else actor=(await importCast([c.key],{notify:false}))[0];}
  if(!actor)throw new Error(`Missing campaign actor: ${c.name}.`);
  const p=placementAt(scene,c.location);
  return placeToken(scene,actor,p.x,p.y,{name:c.name,flags:{[RESOURCE]:{missionId:m.id,runId:s.runId,group:'contact',serial:`contact:${c.key}`,castKey:c.key}}});
}
export async function prepareMission(m){
  if(!isLeader()||!m?.automation)return;
  return withActionLocks([`mission-resources:${m.id}`],async()=>{
    let s=missionState()[m.id];if(s?.status!=='active')return;
    const run=s.runId,records={...(s.resourceRecords||{})},problems=[];
    // 0.5.27: each vehicle, person, contact and marker is placed on its own. One that can't be placed is reported to the
    // GM (who can place it by hand or press Repair) and the rest of the job carries on; before, one crowded street
    // stopped every checkpoint of the mission.
    const attempt=async(what,fn)=>{try{return await fn();}catch(e){problems.push(`${what}: ${e.message}`);console.warn(`The Smoke | ${m.id} ${what}`,e);return null;}};
    // Import all required locations, not merely the map that happens to be on the GM canvas.
    const maps=new Set([...Object.values(m.automation.steps).flatMap(c=>c.locations.map(a=>a.mapId)),...m.automation.resources.map(r=>r.location.mapId)]);
    for(const mid of maps)await attempt(`map ${mid}`,()=>findOrImportScene(mid));
    for(const r of m.automation.resources){
      const count=scaledCount(r.scale,s.actorIds.length,r.count||1);
      for(let i=0;i<count;i++){
        const serial=`${r.id}:${i+1}`,old=records[serial];
        if(['sold','delivered','destroyed'].includes(old?.status))continue;
        await attempt(`${r.location?.name||r.id} (${r.id} ${i+1})`,async()=>{
          let t=resourcesFor(m,s,r.id).find(t=>resourceFlag(t)?.serial===serial);
          if(!t){
            const scene=await findOrImportScene(old?.mapId||r.location.mapId);
            const actor=r.kind==='vehicle'?await ensureVehicleActor(r.catalogIds[i%r.catalogIds.length]):await ensurePersonActor(r.npcKey);
            const w=Number(actor.prototypeToken?.width||1),h=Number(actor.prototypeToken?.height||1);
            const p=placementAt(scene,r.location,w,h,i);
            t=await placeToken(scene,actor,p.x,p.y,{...(p.rotation?{rotation:p.rotation}:{}),flags:{parked:true,locked:Boolean(r.locked),missionLoan:Boolean(r.loan),
              [RESOURCE]:{missionId:m.id,runId:run,group:r.id,serial,kind:r.kind,loan:Boolean(r.loan),propId:r.propId||null,escortTo:r.escortTo||null}}});
            if(r.hostile)await t.update({disposition:-1});
            if(r.moving)await startMissionVehicle(m,s,t,r).catch(e=>problems.push(`${t.name} could not start driving (${e.message}); it waits parked`));
            if(r.npcKey&&r.kind==='vehicle')await seedRider(t,r.npcKey);
          }
          records[serial]={...(old||{}),...recordRef(t),mapId:mapIdOf(t.parent),status:old?.status||'world'};
        });
      }
    }
    for(const c of m.automation.contacts||[])await attempt(c.name,()=>castAt(m,s,c));
    // Every interaction gets a physical, named anchor. Future ones exist but cannot be used early.
    const actor=await markerActor(), groups=new Map();
    const list=[...Object.values(m.automation.steps).filter(c=>!['arrival','event'].includes(c.mode)),...(m.automation.support||[])];
    for(const c of list)for(const a of c.locations){const g=groups.get(a.id)||{anchor:a,stepIds:[]};g.stepIds.push(c.id);groups.set(a.id,g);}
    for(const {anchor:a,stepIds} of groups.values())await attempt(`marker at ${a.name}`,async()=>{
      const scene=await findOrImportScene(a.mapId);
      const present=[...scene.tokens].find(t=>{const f=t.getFlag?.(NS,MARKER);return f?.missionId===m.id&&f.runId===run&&f.anchorId===a.id;});
      if(present){await present.setFlag(NS,MARKER,{...present.getFlag(NS,MARKER),stepIds});return;}
      const p=placementAt(scene,a);
      await placeToken(scene,actor,p.x,p.y,{name:`${m.code||m.title}: Work this location`,flags:{[MARKER]:{missionId:m.id,runId:run,stepIds,anchorId:a.id}}});
    });
    const note=problems.length?problems.join('; '):null;
    await withMissionState(st=>{if(st[m.id]?.runId!==run)return;st[m.id].resourceRecords=records;st[m.id].preflightError=note;st[m.id].preparedAt=worldSeconds();});
    if(note&&game.users)await card('MISSION SET-UP',m.title,`<p>Not everything could be put on the map: ${esc(note)}.</p><p class="smoke-dim">The job carries on. Move whatever is in the way and press <b>Review / repair mission resources</b> on the Mission Board, or place it by hand.</p>`,'mission',{whisper:game.users.filter(u=>u.isGM).map(u=>u.id)}).catch(()=>null);
    await sweepMission(m);
    return records;
  });
}
async function seedRider(t,key){
  const {boardVehicle}=await import('../vehicles/vehicle-boarding.mjs');
  const actor=await ensurePersonActor(key),p=tokenCentre(t);
  const rider=await placeToken(t.parent,actor,p[0]+(t.width+1)*(t.parent.grid.size||100),p[1],{flags:{[RESOURCE]:{...resourceFlag(t),group:'driver',serial:`${resourceFlag(t).serial}:driver`}}});
  await boardVehicle(t,rider,'pilot',{force:true});
}
async function startMissionVehicle(m,s,t,r){
  const {drivingNetwork}=await import('./roads.mjs');const {tripForToken}=await import('./traffic.mjs');
  const net=await drivingNetwork(t.parent);if(!net)throw new Error('The mission van needs the traced street road network.');
  const route=tripForToken(net,t,Math.random,{anyWay:true});if(!route)throw new Error('No drivable route for the mission vehicle.');
  await t.update({[`flags.${NS}.parked`]:false,[`flags.${NS}.traffic`]:{kind:'moving',route,s:0,pace:1,keep:true},[`flags.${NS}.missionRoute`]:{missionId:m.id,runId:s.runId,routeIndex:0}});
  const {ensureAmbientCrew}=await import('./traffic-crew.mjs');await ensureAmbientCrew(t);
}
export async function cleanupMissionResources(m,s){
  if(!isLeader())return;
  for(const scene of game.scenes||[]){
    const ids=[...scene.tokens].filter(t=>{const r=t.getFlag?.(NS,RESOURCE)||t.getFlag?.(NS,MARKER);return r?.missionId===m.id&&r.runId===s.runId;}).map(t=>t.id);
    if(ids.length){const {exitAllFromVehicle}=await import('../vehicles/vehicle-boarding.mjs');for(const id of ids){const t=scene.tokens.get(id);if(t?.actor?.type==='vehicle')await exitAllFromVehicle(t,{keepDriver:false});}await scene.deleteEmbeddedDocuments('Token',ids,{smokeMissionCleanup:true});}
  }
}
// These hints are authored/derived on the leader from the fixed mission contract, never accepted from a client.
function trustedActionTags(c){
 const text=String(c.actionLabel||c.label||'').toLowerCase(),tags=new Set([...(c.contextTags||[]),...authoredPerkTags(text)]);
 const patterns={lock:/lock|padlock|shutter/,vehicleWork:/repair|fix.*(?:bike|car|van)|engine|respray/,medicine:/treat|injur|patient|first aid|stabilis/,
 policeIntel:/police|bait bike|unmarked/,sneak:/sneak|unnoticed|quietly|slip past/,case:/inspect|investig|compare|examine|find out|identify|trace|case the/,
 trade:/haggle|bargain|sell|sale|auction|buy/,navigate:/route|navigate|map|directions/,accessBluff:/bluff|blag|gain access|guest list|pass.*cordon/,
 hospitalAccess:/hospital|a&e|medical/,civilianOrder:/order.*civilian|command/,intimidate:/intimidat|threaten/,crowd:/crowd|audience/,alarm:/alarm|panic/,
 climb:/climb|parkour/,findTrader:/find.*(?:dealer|buyer|seller|trader)/,localTalk:/local.*(?:contact|talk)|neighbour/};
 for(const [tag,re]of Object.entries(patterns))if(re.test(text))tags.add(tag);return [...tags];
}
function challenge(m,s,c,actor,t,userId,choice){return {
  id:foundry.utils.randomID(16),missionId:m.id,runId:s.runId,stepId:c.id,actorId:actor.id,actorUuid:actor.uuid,userId,
  sceneId:t.parent.id,tokenId:t.id,location:pointOf(t),stat:choice?.stat||c.stat,band:choice?.band||c.band||'medium',
  contextTags:trustedActionTags(c),minutes:c.minutes||0,choice:choice?.id||choice?.value||null,createdAt:worldSeconds(),status:'open'
};}
registerHandler('mission.action.begin',async({missionId,stepId,actorId,sceneId,choice,userId})=>{
  return withActionLocks([`mission-actions:${missionId}`],async()=>{
    const {m,s}=await job(missionId),o=m.objectives.find(x=>x.id===stepId);
    const c=o?.checkpoint||m.automation.support.find(x=>x.id===stepId);
    if(!c)throw new Error('Unknown mission action.');
    if(o&&(objectiveDone(o,s)||!checkpointReady(m,o,s)))throw new Error('This checkpoint is finished or its earlier steps are not yet complete.');
    if(!o&&s.supportProof?.[stepId])throw new Error('Another participant has already performed this support task. Choose a different task.');
    const {actor,t}=participant(actorId,userId,s,sceneId);locationFor(c,t);
    if(c.mode==='event'||c.mode==='arrival'){await sweepMission(m);return {kind:'event',message:'This objective checks the actual world state. Use the relevant vehicle, parcel, encounter or destination.'};}
    if(c.mode==='race')return startRace(m,s,actor,t);
    const chosen=c.mode==='choice'?(c.choices||[]).find(x=>(x.id||x.value)===choice):null;
    if(c.mode==='choice'&&!chosen)return {kind:'choices',choices:c.choices};
    if(chosen?.cost&&Number(actor.system.cash||0)<chosen.cost)throw new Error(`You need £${chosen.cost} for that option.`);
    const existing=Object.values(s.attempts||{}).find(a=>a.actorId===actorId&&a.stepId===stepId&&['open','rolling','saved','rolled','resolving'].includes(a.status)&&a.choice===(chosen?.id||null)&&a.sceneId===t.parent.id);
    const a=existing||challenge(m,s,c,actor,t,userId,chosen);
    if(!existing)await withMissionState(st=>{st[m.id].attempts={...(st[m.id].attempts||{}),[a.id]:a};});
    if(a.savedRoll&&!a.messageId){await (await import('../dice/roll.mjs')).consumeRollStateUsage(actor,a.savedRoll);const message=game.messages.find(x=>x.getFlag(NS,'roll')?.context?.attemptId===a.id)||await ChatMessage.implementation.create({...a.savedRoll,content:`${a.savedRoll.content}<p>Recovered the saved result; no reroll.</p>`});await commitMissionRoll({missionId,missionRunId:s.runId,attemptId:a.id},message.id);a.messageId=message.id;}
    if(a.messageId)return resolveMissionAction({missionId,attemptId:a.id,userId},{locked:true});
    if(a.status==='rolling')throw new Error('This roll is still being resolved; do not roll again.');
    if(c.mode==='dialogue'||c.mode==='choice'&&!chosen?.stat){
      return resolveMissionAction({missionId,attemptId:a.id,userId}, {locked:true});
    }
    return {kind:'roll',attemptId:a.id,actorId,stat:a.stat,band:a.band,label:c.actionLabel||c.label,
      context:{kind:'mission',missionId:m.id,missionRunId:s.runId,stepId,attemptId:a.id,sceneId:t.parent.id,tokenId:t.id}};
  });
});
export async function validateMissionRoll(actor,stat,options,userId){
  if(options.context?.kind!=='mission')return;
  const {m,s}=await job(options.context.missionId),a=s.attempts?.[options.context.attemptId];
  if(!a||a.status!=='open'||a.actorId!==actor.id||a.userId!==userId||a.runId!==s.runId)throw new Error('That mission roll is not a current, authorised attempt.');
  const c=m.objectives.find(o=>o.id===a.stepId)?.checkpoint||m.automation.support.find(x=>x.id===a.stepId);
  const {t}=participant(actor.id,userId,s,a.sceneId);locationFor(c,t);
  if(stat!==a.stat||options.context.missionRunId!==s.runId||options.context.stepId!==a.stepId||options.band!==a.band||options.tn!=null||Number(options.modifier||0)!==0||Number(options.statUpgrades||0)!==0||Number(options.effortUpgrades||0)!==0||options.effortDie!=null)throw new Error('Mission roll context or difficulty changed.');
  await withMissionState(st=>{const attempt=st[m.id].attempts[a.id];if(attempt.status!=='open')throw new Error('This attempt has already been rolled.');attempt.status='rolling';});
}
export async function cancelMissionRoll(context){await withMissionState(st=>{const a=st[context.missionId]?.attempts?.[context.attemptId];if(a?.runId===context.missionRunId&&a.status==='rolling'&&!a.messageId)a.status='open';});}
export async function persistMissionRoll(context,payload){await withMissionState(st=>{
 const a=st[context.missionId]?.attempts?.[context.attemptId];if(!a||a.runId!==context.missionRunId||a.status!=='rolling')throw new Error('The mission attempt changed before its roll could be saved.');
 a.savedRoll=foundry.utils.deepClone(payload);a.status='saved';
});}
export async function commitMissionRoll(context,messageId){await withMissionState(st=>{const a=st[context.missionId]?.attempts?.[context.attemptId];if(a&&a.runId===context.missionRunId){a.messageId=messageId;a.status='rolled';}});}

async function resolveMissionAction({missionId,attemptId,messageId,userId},{locked=false}={}){
  const run=async()=>{
    const {m,s}=await job(missionId),a=s.attempts?.[attemptId];
    if(!a||a.runId!==s.runId||a.userId!==userId)throw new Error('Unknown or stale mission attempt.');
    if(['done','failed','encounter'].includes(a.status))return {kind:a.status,success:a.status==='done',replayed:true};
    const o=m.objectives.find(x=>x.id===a.stepId),c=o?.checkpoint||m.automation.support.find(x=>x.id===a.stepId);
    const {actor,t}=participant(a.actorId,userId,s,a.sceneId);locationFor(c,t);
    if(o&&!checkpointReady(m,o,s))throw new Error('This checkpoint is not ready.');
    if(!o&&s.supportProof?.[a.stepId])throw new Error('This support action has already been completed.');
    let success=true,roll=null,msg=null;
    const choice=c.mode==='choice'?(c.choices||[]).find(x=>(x.id||x.value)===a.choice):null;
    if(c.mode==='roll'||choice?.stat){
      msg=game.messages.get(a.messageId||messageId);roll=msg?.getFlag(NS,'roll');
      if(!roll||roll.actorUuid!==actor.uuid||roll.stat!==a.stat||roll.band!==a.band||roll.context?.attemptId!==a.id||roll.context?.missionRunId!==s.runId||roll.context?.kind!=='mission'||roll.userId!==userId)throw new Error('The recorded roll does not match this character, action, location and mission run.');
      const used=msg.getFlag(NS,'missionAttemptUsed');if(used&&used!==a.id)throw new Error('That roll has already been used.');
      success=roll.success===true;
      await msg.setFlag(NS,'missionAttemptUsed',a.id);
    }
    const timeTarget=a.timeTarget??worldSeconds()+Number(a.minutes||0)*60;
    await withMissionState(st=>{const at=st[m.id].attempts[a.id];Object.assign(at,{status:'resolving',messageId:msg?.id||null,success,timeTarget});});
    if(worldSeconds()<timeTarget)await game.time.advance(timeTarget-worldSeconds());
    if(success&&choice)await applyChoice(m,s,a,actor,t,choice);
    if(success){
      const ev=receipt(m,s,actor,t,{on:'checkpoint',stepId:a.stepId,proofId:`action:${a.id}`,messageId:msg?.id||null,success,choice:a.choice});
      if(o&&!choice?.encounter)await missionEvent(ev);
      else if(o&&choice?.encounter){/* the actual defeated NPC emits this checkpoint later */}
      else{
        await withMissionState(st=>{const now=st[m.id];now.supportProof??={};if(now.supportProof[a.stepId])return;
          now.supportProof[a.stepId]={actorId:actor.id,messageId:msg?.id,at:worldSeconds(),attemptId:a.id};
          now.contributions??={};now.contributions[actor.id]??={};now.contributions[actor.id][`support:${a.stepId}`]={stepId:a.stepId,worldTime:worldSeconds()};});
        await missionEvent({...ev,on:'missionContribution'});
      }
    }
    await withMissionState(st=>{if(st[m.id]?.attempts?.[a.id])st[m.id].attempts[a.id]={...st[m.id].attempts[a.id],status:success?(choice?.encounter?'encounter':'done'):'failed',completedAt:worldSeconds()};});
    const words=c.mode==='dialogue'?(m.call||[m.hook]).map(esc).join('<br>'):choice?esc(choice.label):`${esc(c.actionLabel||c.label)}: ${success?'success recorded':'unsuccessful; the checkpoint remains open'}.`;
    await card('MISSION ACTION',m.title,`<p>${esc(actor.name)} · ${words}</p>`,success?'win':'lose');
    scheduleSweep();return {kind:success?'done':'failed',success};
  };return locked?run():withActionLocks([`mission-actions:${missionId}`],run);
}
registerHandler('mission.action.resolve',resolveMissionAction);
async function applyChoice(m,s,a,actor,t,choice){
  // Costs and concrete consequences are separate idempotent receipts, not free narrative ticks.
  const key=`${s.runId}:${a.id}`,done=actor.getFlag?.(NS,'missionChoices')||{};
  if(done[key])return;
  if(choice.cost){if(Number(actor.system.cash||0)<choice.cost)throw new Error('You no longer have enough cash for this choice.');
    await actor.update({'system.cash':Number(actor.system.cash)-choice.cost,[`flags.${NS}.missionChoices.${key}`]:{choice:a.choice,at:worldSeconds()}});
  }else await actor.setFlag(NS,'missionChoices',{...done,[key]:{choice:a.choice,at:worldSeconds()}});
  if(choice.encounter){
    // Picking a fight is not defeating the opponent: this receipt is held until the encounter ends.
    const npc=await ensurePersonActor(choice.encounter),p=placementAt(t.parent,{...m.objectives.find(o=>o.id===a.stepId).checkpoint.locations[0]});
    const target=await placeToken(t.parent,npc,p.x,p.y,{flags:{[RESOURCE]:{missionId:m.id,runId:s.runId,group:`choice-${a.stepId}`,serial:`choice:${a.id}`}}});
    await target.update({disposition:-1});
    await withMissionState(st=>{st[m.id].pendingEncounters={...(st[m.id].pendingEncounters||{}),[a.stepId]:{attemptId:a.id,actorId:actor.id,choice:a.choice,serial:`choice:${a.id}`}};});
  }
  if(m.id==='m12'&&a.choice==='stretch')await attachEscort(m,s,'stretch',t);
}
export async function openMissionAction(missionId,stepId,actor=null){
  const {m,s}=await job(missionId);
  const candidates=game.actors.filter(a=>a.type==='character'&&s.actorIds.includes(a.id)&&(game.user.isGM||a.testUserPermission?.(game.user,'OWNER')));
  actor??=candidates.find(a=>a.id===game.user.character?.id)||candidates[0];
  if(!actor)throw new Error('Join with your character first.');
  if(candidates.length>1){const f=await foundry.applications.api.DialogV2.input({window:{title:'Who takes this action?'},content:`<select name="actorId">${candidates.map(a=>`<option value="${esc(a.id)}" ${a.id===actor.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select>`});if(!f)return;actor=candidates.find(a=>a.id===f.actorId);}
  const t=actorToken(actor,{userId:game.user.id});
  let result=await request('mission.action.begin',{missionId,stepId,actorId:actor.id,sceneId:t?.parent.id});
  if(result.kind==='choices'){
    const f=await foundry.applications.api.DialogV2.input({window:{title:m.title},content:`<label>Choose the crew's decision<select name="choice">${result.choices.map(c=>`<option value="${esc(c.id||c.value)}">${esc(c.label)}${c.cost?` (£${c.cost})`:''}</option>`).join('')}</select></label>`});
    if(!f)return;result=await request('mission.action.begin',{missionId,stepId,actorId:actor.id,sceneId:t?.parent.id,choice:f.choice});
  }
  if(result.kind==='roll'){
    const out=await actor.rollDialog(result.stat,{band:result.band,label:result.label,fixedTarget:true,context:result.context});
    if(!out?.message)return;return request('mission.action.resolve',{missionId,attemptId:result.attemptId,messageId:out.message.id});
  }
  if(result.message)ui.notifications.info(result.message);return result;
}
export async function openMissionMarker(t){
  const f=t.getFlag?.(NS,MARKER);if(!f)return;const {m,s}=await job(f.missionId);if(s.runId!==f.runId)throw new Error('This belongs to an older mission run.');
  const choices=(f.stepIds||[f.stepId]).map(id=>({id,o:m.objectives.find(o=>o.id===id),c:m.automation.steps[id]||m.automation.support.find(x=>x.id===id)})).filter(x=>x.c&&(x.o?!objectiveDone(x.o,s)&&checkpointReady(m,x.o,s):!s.supportProof?.[x.id]));
  if(!choices.length)throw new Error('No open action at this location yet. See prerequisites on Mission Board.');
  if(choices.length===1)return openMissionAction(m.id,choices[0].id);
  const result=await foundry.applications.api.DialogV2.input({window:{title:t.name},content:`<select name="step">${choices.map(x=>`<option value="${esc(x.id)}">${esc(x.c.actionLabel||x.c.label)}</option>`).join('')}</select>`});
  if(result)return openMissionAction(m.id,result.step);
}
async function attachEscort(m,s,group,who){
  const target=resourcesFor(m,s,group)[0];if(!target||target.parent.id!==who.parent.id||distanceSquares(target,who)>3)throw new Error('Get beside the person before escorting them.');
  if(target.actor?.system?.states?.down)throw new Error('Stabilise this person before escorting them.');
  await target.setFlag(NS,'missionEscort',{missionId:m.id,runId:s.runId,actorId:who.actor.id});return target;
}
registerHandler('mission.escort',async({missionId,group,actorId,userId})=>{const {m,s}=await job(missionId),{t}=participant(actorId,userId,s);return attachEscort(m,s,group,t);});
export async function openEscort(t){const f=resourceFlag(t),s=missionState()[f?.missionId];if(!f||s?.runId!==f.runId)return;
  const near=[...t.parent.tokens].find(x=>x.actor?.type==='character'&&s.actorIds.includes(x.actor.id)&&(game.user.isGM||x.actor.testUserPermission?.(game.user,'OWNER'))&&distanceSquares(x,t)<=3);
  if(!near)throw new Error('Get a participating character beside this person.');return request('mission.escort',{missionId:f.missionId,group:f.group,actorId:near.actor.id});}
/**
 * "Nick a car worth having": a car of the right model that the job didn't park counts too (0.5.27). It joins the job
 * as one of its targets, so the sale or delivery later knows it. Only for a step that's open and ready now.
 */
async function adoptTarget(actor,target,data){
  const cid=target?.actor?.getFlag?.(NS,'catalogId');if(!cid||target.actor?.type!=='vehicle')return null;
  for(const m of data.missions){const s=missionState()[m.id];if(s?.status!=='active'||s.automationVersion!==1||!s.actorIds?.includes(actor.id)||!m.automation)continue;
    for(const o of m.objectives){
      const group=o.checkpoint?.targetGroup;if(o.auto?.on!=='vehicleNicked'||!group||objectiveDone(o,s)||!checkpointReady(m,o,s))continue;
      const r=m.automation.resources.find(x=>x.id===group);if(!r?.catalogIds?.includes(cid))continue;
      const flag={missionId:m.id,runId:s.runId,group,serial:`${group}:found-${target.id}`,kind:'vehicle',found:true};
      await target.setFlag(NS,RESOURCE,flag);
      await withMissionState(st=>{if(st[m.id]?.runId===s.runId)st[m.id].resourceRecords={...(st[m.id].resourceRecords||{}),[flag.serial]:{...recordRef(target),mapId:mapIdOf(target.parent),status:'world',found:true}};});
      return flag;
    }
  }
  return null;
}
export async function emitBoundEvent(on,actor,t,target=null,details={}){
  if(!isLeader()||!actor||!t)return;
  const data=await missionData();
  let rf=resourceFlag(target);
  if(!rf&&target&&on==='vehicleNicked')rf=await adoptTarget(actor,target,data);
  for(const m of data.missions){const s=missionState()[m.id];if(s?.status!=='active'||s.automationVersion!==1||!s.actorIds.includes(actor.id))continue;
    if(rf&&(rf.missionId!==m.id||rf.runId!==s.runId))continue;
    const ev=receipt(m,s,actor,t,{on,...details,...(rf?{targetGroup:rf.group,targetSerial:rf.serial}:{})});
    if(rf&&on==='vehicleNicked')await withMissionState(st=>{const r=st[m.id].resourceRecords[rf.serial];if(r){r.stolen=true;r.thief=actor.id;r.theftProof=details.proofId||`theft:${rf.serial}`;}});
    if(rf&&on==='sold'){
      const r=missionState()[m.id].resourceRecords?.[rf.serial];if(!r?.stolen)continue;
      await withMissionState(st=>{Object.assign(st[m.id].resourceRecords[rf.serial],{status:'sold',soldBy:actor.id});});
    }
    await missionEvent(ev);
  }
  scheduleSweep();
}
function down(t){return Boolean(t.actor?.system?.states?.down||t.actor?.system?.states?.surrendered||Number(t.actor?.system?.resources?.health?.value)===0);}
export async function sweepMission(m){
  let s=missionState()[m.id];if(s?.status!=='active'||s.automationVersion!==1)return;
  // Refresh the persisted resource references after cross-map travel. Never spawn a second sold target.
  const rr={};for(const t of resourcesFor(m,s)){const f=resourceFlag(t);rr[f.serial]={...(s.resourceRecords?.[f.serial]||{}),...recordRef(t),mapId:mapIdOf(t.parent)};}
  if(Object.keys(rr).length)await withMissionState(st=>{if(st[m.id]?.runId===s.runId)st[m.id].resourceRecords={...(st[m.id].resourceRecords||{}),...rr};});
  for(const id of s.actorIds){
    const actor=game.actors.get(id),t=actorToken(actor);if(!t)continue;
    for(const o of m.objectives){
      s=missionState()[m.id];if(s?.status!=='active')return;
      const c=o.checkpoint;if(objectiveDone(o,s)||!checkpointReady(m,o,s))continue;
      const p=pointOf(t);
      // Getting some wheels counts wherever you climbed in (0.5.27: it had to be one of the job's own bikes, in Pat's yard).
      if(o.auto.on!=='boarded'&&!c.locations.some(a=>atAnchor(p,a)))continue;
      let on=o.auto.on,target=null,proofId=null,ok=false;
      if(c.mode==='arrival'){ok=true;proofId=`arrival:${o.id}:${actor.id}`;}
      if(on==='boarded'){
        // Any vehicle, and any seat in it: a crew of four in one car is four people with wheels.
        const seat=t.getFlag(NS,'vehicleSeat');target=seat&&t.parent.tokens.get(seat.vehicleTokenId);ok=Boolean(target&&target.actor?.type==='vehicle');proofId=`board:${actor.id}`;
        if(target&&resourceFlag(target)?.missionId!==m.id)target=null;   // only the job's own vehicles carry its serial
      }
      if(['heatClear','safeCargoReturn','safeExit'].includes(on)){
        ok=Number(actor.system.heat?.value||0)===0&&!t.getFlag(NS,'policeStop');
        if(on!=='heatClear')ok&&=Object.values(s.parcels||{}).some(r=>r.status==='held'&&s.actorIds.includes(r.actorId));
        proofId=`safe:${o.id}:${actor.id}`;
      }
      if(['vehicleReturned','vehicleRetained'].includes(on)){
        target=resourcesFor(m,s,c.targetGroup).find(v=>v.parent.id===t.parent.id&&c.locations.some(a=>atAnchor(pointOf(v),a))&&Number(v.actor?.system?.vehicle?.body?.value)>0&&(v.getFlag(NS,'stolen')||v.getFlag(NS,'missionLoan')));
        ok=Boolean(target);proofId=target?`${on}:${resourceFlag(target).serial}`:null;
      }
      if(on==='encounterResolved'){
        const targets=resourcesFor(m,s,c.targetGroup);ok=targets.length>=scaledCount(m.automation.resources.find(r=>r.id===c.targetGroup)?.scale,s.actorIds.length,1)&&targets.every(down);proofId=`encounter:${c.targetGroup}`;
      }
      if(on==='escortArrived'){
        target=resourcesFor(m,s,c.targetGroup).find(v=>v.getFlag(NS,'missionEscort')&&v.parent.id===t.parent.id&&c.locations.some(a=>atAnchor(pointOf(v),a))&&!down(v));ok=Boolean(target);proofId=`escort:${c.targetGroup}`;
      }
      if(on==='crewHome'){
        ok=s.actorIds.every(aid=>{const p=pointOf(actorToken(game.actors.get(aid)));return c.locations.some(a=>atAnchor(p,a));});
        if(c.requireBranchCargo)ok&&=s.choices?.ending==='stock'?Object.values(s.parcels||{}).length>0&&Object.values(s.parcels).every(r=>r.status==='delivered'):s.choices?.ending==='stretch'&&resourcesFor(m,s,'stretch').some(v=>v.parent.id===t.parent.id&&c.locations.some(a=>atAnchor(pointOf(v),a))&&v.getFlag(NS,'missionEscort'));
        proofId=`crew-home:${s.runId}`;
      }
      if(ok)await missionEvent(receipt(m,s,actor,t,{on,stepId:o.id,proofId,targetGroup:c.targetGroup||undefined,targetSerial:resourceFlag(target)?.serial}));
    }
  }
  for(const [stepId,pending]of Object.entries(s.pendingEncounters||{})){
    const target=resourcesFor(m,s,`choice-${stepId}`).find(t=>resourceFlag(t)?.serial===pending.serial);
    const a=game.actors.get(pending.actorId),t=actorToken(a);
    if(target&&down(target)&&t)await missionEvent(receipt(m,s,a,t,{on:'checkpoint',stepId,proofId:`action:${pending.attemptId}`,choice:pending.choice,success:true}));
  }
  await recoverCargoProof(m);
}
async function recoverCargoProof(m){
  const s=missionState()[m.id];if(s?.status!=='active'||s.automationVersion!==1)return;
  for(const [serial,r] of Object.entries(s.parcels||{})){
    const p=m.props.find(x=>x.id===serial.split(':')[0]);if(!p)continue;
    for(const [status,on,actorId,location,time] of [
      ['held','cargoCollected',r.collectedBy,r.collectedLocation,r.collectedAt],
      ['delivered','cargoDelivered',r.deliveredBy,r.deliveredLocation,r.deliveredAt]
    ]){
      if(!actorId||!location||!s.actorIds.includes(actorId)||!game.actors.get(actorId))continue;
      await missionEvent({missionId:m.id,missionRunId:s.runId,verified:true,on,actorId,serial,propId:p.id,status,
        proofId:`cargo:${on}:${serial}`,sceneId:location.sceneId,location,worldTime:time||0});
    }
  }
}
function scheduleSweep(){if(!isLeader()||scheduled)return;scheduled=setTimeout(()=>{scheduled=null;void sweepAll().catch(e=>console.error('The Smoke | mission state checks',e));},150);}
async function sweepAll(){if(refreshing||!isLeader())return;refreshing=true;try{const data=await missionData();for(const m of data.missions)if(missionState()[m.id]?.status==='active')await sweepMission(m);}finally{refreshing=false;}}
async function followEscort(doc,changes,options){
  if(!isLeader()||options?.smokeMissionEscort||options?.acTransit||!('x'in changes||'y'in changes)||doc.actor?.type!=='character')return;
  if(doc.getFlag(NS,'vehicleSeat'))return;
  const g=doc.parent.grid.size||100;
  for(const npc of doc.parent.tokens){const e=npc.getFlag?.(NS,'missionEscort');if(e?.actorId!==doc.actor.id||down(npc))continue;
    if(distanceSquares(npc,doc)>12){ui.notifications.warn(`${npc.name} cannot keep up: return for your escort.`);continue;}
    const [x,y]=tokenCentre(doc);await npc.update({x:Math.round(x-g*1.5),y:Math.round(y-g/2)},{smokeMissionEscort:true,acVehicleCarry:true});
  }
}
registerHandler('mission.repair',async({missionId,userId,acceptProgress=false,reason=''})=>{
  if(!game.users.get(userId)?.isGM)throw new Error('Only the GM can repair mission resources.');
  const m=(await missionData()).missions.find(m=>m.id===missionId);if(!m)throw new Error('Unknown mission.');
  if(acceptProgress){if(String(reason).trim().length<8)throw new Error('Accepting old progress requires a recovery reason.');
    await withMissionState(st=>{const s=st[m.id];s.migrationReview=false;s.recoveryLog=[...(s.recoveryLog||[]),{reason,userId,at:Date.now(),action:'accept-legacy-progress'}];});}
  return prepareMission(m);
});
export async function installMissionAutomation(){
  if(installed)return;installed=true;
  try{const response=await fetch(`systems/${NS}/data/mission-automation.json`);if(!response.ok)throw new Error('Mission automation catalogue is missing.');await configureMissionContracts(await response.json());(await import('./mission-race.mjs')).installRace();}
  catch(e){if(game.smoke)game.smoke.missionAutomationError=`Mission startup blocked: ${e.message}`;throw e;}
  if(game.smoke){game.smoke.missionActions={open:openMissionAction,marker:openMissionMarker,escort:openEscort,repair:(id,options={})=>request('mission.repair',{missionId:id,...options})};}
  Hooks.on('updateToken',(doc,changes,options)=>{void followEscort(doc,changes,options||{}).catch(e=>console.warn('The Smoke | escort',e));if('x'in changes||'y'in changes||changes.flags)scheduleSweep();});
  Hooks.on('createToken',scheduleSweep);Hooks.on('updateActor',scheduleSweep);Hooks.on('smokeMissionsChanged',()=>{if(!refreshing)scheduleSweep();});
  Hooks.on('smokeVehicleNicked',({vt,who,unlocked})=>{if(unlocked)void emitBoundEvent('vehicleNicked',who.actor,who,vt,{proofId:`theft:${resourceFlag(vt)?.serial||vt.id}`}).catch(console.error);});
  Hooks.on('smokeVehicleSold',({seller,service,catalogId,targetToken,sellerToken,proofId})=>{if(targetToken&&sellerToken)void emitBoundEvent('sold',seller,sellerToken,targetToken,{service,catalogId,proofId}).catch(console.error);});
  Hooks.on('smokeService',({actor,service,targetToken,actorToken:at,proofId})=>{if(at)void emitBoundEvent('service',actor,at,targetToken,{service,proofId}).catch(console.error);});
  Hooks.on('smokeBought',({actor,shop,actorToken:token,proofId,...rest})=>{if(token)void emitBoundEvent('buy',actor,token,null,{shop,proofId,...rest}).catch(console.error);});
  Hooks.on('smokeTransit',({source,target,idMap,departure})=>{void transferEscorts(source,target,idMap,departure).then(scheduleSweep).catch(console.error);});
  if(isLeader()){
    const data=await missionData();
    // A job already running from an older build keeps its progress and carries on (0.5.27). Before, it was frozen until
    // the GM wrote a review; any job frozen that way by 0.5.27-rc.1 is released here, with a note in its log.
    await withMissionState(st=>{for(const m of data.missions){const s=st[m.id];if(s?.status!=='active')continue;
      s.runId||=foundry.utils.randomID(12);   // very old runs had none, and cargo, paint and radio proofs need one
      if(s.automationVersion!==1){
        s.automationVersion=1;s.legacyTicks=clone(s.ticks||{});s.contributions??={};s.receipts??={};s.choices??={};
        s.recoveryLog=[...(s.recoveryLog||[]),{at:Date.now(),action:'carried-over',reason:'Progress from an older build kept as it was.'}];
      }
      if(s.migrationReview){s.migrationReview=false;s.recoveryLog=[...(s.recoveryLog||[]),{at:Date.now(),action:'accept-legacy-progress',reason:'Released automatically in 0.5.27: old progress is kept.'}];}
      // what each step needs now (never less than what was already done)
      s.requirements=requirementsFor(m,s.actorIds||[],s);
      // anyone already credited on an older build counts as having taken part
      for(const id of s.actorIds||[])if(Object.values(s.legacyTicks||{}).some(Number))s.contributions[id]??={legacy:{stepId:'legacy',worldTime:0}};
    }});
    for(const m of data.missions){const s=missionState()[m.id];if(s?.status==='active')try{await prepareMission(m);}catch(e){console.warn(`The Smoke | ${m.id} preflight`,e);}}
    scheduleSweep();
  }
}
async function transferEscorts(source,target,idMap,departure=[]){
  if(!isLeader())return;
  for(const npc of [...(source?.tokens||[])]){
    const e=npc.getFlag?.(NS,'missionEscort');if(!e||down(npc)||npc.getFlag(NS,'vehicleSeat'))continue;
    const left=departure.find(d=>d.actorId===e.actorId&&d.walking),g=source.grid.size||100;
    if(!left||Math.hypot(npc.x+npc.width*g/2-left.x-left.width*g/2,npc.y+npc.height*g/2-left.y-left.height*g/2)>g*3)continue;
    const moved=Object.values(idMap||{}).map(id=>target.tokens.get(id)).find(t=>t?.actorId===e.actorId);
    if(!moved)continue;
    const p=tokenCentre(moved);await transfer(source,npc,{to:mapIdOf(target),land:p},{quiet:true});
  }
}
// Race implementation is installed separately to keep the verifier independent of the road AI.
async function startRace(m,s,actor,t){return (await import('./mission-race.mjs')).startMissionRace(m,s,actor,t);}
