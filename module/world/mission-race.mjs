// A physical, ordered course for the Marshes job. A roll by itself never wins it.
// Rival bikes advance on the shared game clock; player results come only from token motion.
import {NS} from '../config.mjs';
import {isLeader,card,esc} from './net.mjs';
import {missionState,missionEvent,withMissionState,missionData} from './missions.mjs';
import {resourcesFor,pointOf,resourceFlag} from './mission-automation.mjs';
import {tokenCentre,mapIdOf,placeToken,actorToken} from './spawn.mjs';
import {moveVehicle} from '../vehicles/vehicle-boarding.mjs';
import {withActionLocks,worldSeconds} from './action-locks.mjs';
const COURSE=[[2850,2250],[3150,1350],[2250,1050],[1800,2250],[2850,2250]];
let installed=false,ticking=false;
export function crossesGate(from,to,gate,radius){
  const [x,y]=from,[a,b]=to,dx=a-x,dy=b-y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((gate[0]-x)*dx+(gate[1]-y)*dy)/d)):0;
  return Math.hypot(x+dx*t-gate[0],y+dy*t-gate[1])<=radius;
}
export async function startMissionRace(m,s,actor,t){
  if(!isLeader())throw new Error('Only the elected GM starts the physical race.');
  if(m.id!=='m10')throw new Error('No authored race course for this mission.');
  const seat=t.getFlag(NS,'vehicleSeat'),bike=seat&&t.parent.tokens.get(seat.vehicleTokenId);
  if(!bike||bike.actor?.system?.vehicle?.kind!=='bicycle'){
    // The catalogue calls pedal vehicles "cycle" in some earlier imports.
    const kind=bike?.actor?.system?.vehicle?.kind;
    if(!bike||!['cycle','bike'].includes(kind)&&!['LV01','LV02','LV03','LV06'].includes(bike.actor.getFlag(NS,'catalogId')))throw new Error('Board a usable bicycle at the start area before starting the race.');
  }
  if(s.race?.status==='active')return {kind:'event',message:'The race is already running. Ride through the numbered course gates in order.'};
  const scene=t.parent,g=scene.grid.size||100,rivals=resourcesFor(m,s,'rivals');if(!rivals.length)throw new Error('Repair this mission to restore its rival racers.');
  const entrants={};
  for(const id of s.actorIds){const pc=actorToken(game.actors.get(id)),vs=pc?.getFlag(NS,'vehicleSeat'),v=vs&&pc.parent.tokens.get(vs.vehicleTokenId);
    if(v&&v.parent.id===scene.id&&Math.hypot(...tokenCentre(v).map((n,i)=>n-COURSE[0][i]))<8*g){entrants[v.id]={actorId:id,next:1,previous:tokenCentre(v),finished:null};}}
  if(!entrants[bike.id])entrants[bike.id]={actorId:actor.id,next:1,previous:tokenCentre(bike),finished:null};
  const old=[...scene.tokens].filter(x=>x.getFlag(NS,'raceGate')?.runId===s.runId);if(old.length)await scene.deleteEmbeddedDocuments('Token',old.map(t=>t.id),{smokeRace:true});
  let base=game.actors.find(a=>a.getFlag(NS,'raceGateBase'));
  base??=await Actor.implementation.create({name:'Race checkpoint',type:'npc',img:`systems/${NS}/assets/ui/vehicle.svg`,ownership:{default:0},flags:{[NS]:{raceGateBase:true}},prototypeToken:{actorLink:false,width:.5,height:.5,sight:{enabled:false}}});
  for(let i=1;i<COURSE.length;i++)await placeToken(scene,base,...COURSE[i],{name:i===COURSE.length-1?'Finish line':`Race gate ${i}`,flags:{raceGate:{missionId:m.id,runId:s.runId,index:i},missionResource:{missionId:m.id,runId:s.runId,group:'race-gates',serial:`gate:${i}`}}});
  await withMissionState(st=>{st[m.id].race={status:'active',sceneId:scene.id,course:COURSE,startedAt:worldSeconds(),lastAt:worldSeconds(),entrants,
    rivals:Object.fromEntries(rivals.map((v,i)=>[resourceFlag(v).serial,{tokenId:v.id,next:1,pace:1.4+i*.08,finished:null}]))};});
  installRace();await card('RACE START',m.title,'<p>Ride through the numbered gates in order, then the finish line. Rival bikes move on the Banana Watch. A crew rider must finish ahead of the rivals; other crew members can perform the mission support tasks.</p>','mission');
  return {kind:'event',message:'Race started: follow the numbered gates in order.'};
}
async function observe(doc,changes,options){
  if(!isLeader()||options?.smokeRace||options?.acTransit||!('x'in changes||'y'in changes))return;
  for(const [id,s]of Object.entries(missionState())){
    const race=s.race;if(s.status!=='active'||race?.status!=='active'||race.sceneId!==doc.parent.id)continue;
    const e=race.entrants[doc.id];if(!e||e.finished)continue;
    const seated=[...doc.parent.tokens].find(t=>t.actorId===e.actorId&&t.getFlag(NS,'vehicleSeat')?.vehicleTokenId===doc.id);
    if(!seated||Number(doc.actor?.system?.vehicle?.body?.value)<=0)continue;
    const end=tokenCentre(doc),g=doc.parent.grid.size||100;
    // One update can cross several nearby gates, but never skip their course order.
    let next=e.next;while(next<race.course.length&&crossesGate(e.previous,end,race.course[next],g*1.7))next++;
    await withMissionState(st=>{const r=st[id]?.race;if(r?.status!=='active')return;r.entrants[doc.id]={...e,previous:end,next,finished:next>=r.course.length?worldSeconds():null};});
    if(next>=race.course.length)await conclude(id,e.actorId,doc);
  }
}
async function conclude(id,actorId,doc){
  const s=missionState()[id],race=s.race;if(race?.status!=='active')return;
  const m=(await missionData()).missions.find(m=>m.id===id),actor=game.actors.get(actorId),t=actorToken(actor);
  if(Object.values(race.rivals).some(r=>r.finished!==null))return;
  await withMissionState(st=>{if(st[id]?.race?.status==='active'){st[id].race.status='won';st[id].race.winner=actorId;}});
  const a=m.objectives.find(o=>o.id==='race').checkpoint.locations[0];
  await missionEvent({on:'checkpoint',missionId:id,missionRunId:s.runId,stepId:'race',actorId,verified:true,success:true,
    proofId:`race:${s.runId}:${race.startedAt}`,sceneId:doc.parent.id,location:pointOf(doc),worldTime:worldSeconds()});
  await card('RACE FINISH',`${actor.name} wins`, '<p>The complete ordered course and finish were recorded.</p>','win');
}
async function tick(){
  if(!isLeader()||ticking||game.paused)return;ticking=true;
  try{for(const [id,s]of Object.entries(missionState())){
    const r=s.race;if(s.status!=='active'||r?.status!=='active')continue;
    const scene=game.scenes.get(r.sceneId);if(!scene)continue;
    // Very large clock jumps are not permission to teleport the racers across the city.
    const elapsed=Math.max(0,Math.min(6,worldSeconds()-r.lastAt));if(!elapsed)continue;
    const rivals={...r.rivals};let anyFinished=false;
    for(const [serial,state]of Object.entries(rivals)){
      if(state.finished!==null){anyFinished=true;continue;}const v=scene.tokens.get(state.tokenId);if(!v)continue;
      let left=elapsed*state.pace*(scene.grid.size||100)/6,p=tokenCentre(v),next=state.next;
      while(left>0&&next<r.course.length){const to=r.course[next],d=Math.hypot(to[0]-p[0],to[1]-p[1]);if(d<=left){p=[...to];left-=d;next++;}else{p=[p[0]+(to[0]-p[0])*left/d,p[1]+(to[1]-p[1])*left/d];left=0;}}
      await moveVehicle(v,{x:Math.round(p[0]-v.width*scene.grid.size/2),y:Math.round(p[1]-v.height*scene.grid.size/2)},{free:true});
      rivals[serial]={...state,next,finished:next>=r.course.length?worldSeconds():null};if(next>=r.course.length)anyFinished=true;
    }
    await withMissionState(st=>{const race=st[id]?.race;if(race?.status==='active'){race.lastAt=worldSeconds();race.rivals=rivals;if(anyFinished)race.status='lost';}});
    if(anyFinished)await card('RACE FINISH','The rivals won','<p>The race checkpoint remains open. Regroup at the start and use the race interaction to try again.</p>','lose');
  }}finally{ticking=false;}
}
export function installRace(){if(installed)return;installed=true;Hooks.on('updateToken',(d,c,o)=>{void observe(d,c,o||{}).catch(console.error);});Hooks.on('updateWorldTime',()=>{void tick().catch(console.error);});}
