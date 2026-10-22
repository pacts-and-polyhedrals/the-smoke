// Believable, real NPCs seated in moving London traffic. This is GM-owned world state, not cosmetic metadata.
// Drivers ride with their motor in the SAME Scene Token batch so they never trail one tick behind.
// Ambient occupants do not take control from a player and never generate a duplicate vehicle Actor.
import {NS} from '../config.mjs';
import {ensurePersonActor, placeToken} from './spawn.mjs';
import {seatLayout, seatPositions} from '../vehicles/vehicle-seat-math.mjs';
import {planVehicleMove} from '../vehicles/vehicle-movement.mjs';

const AMBIENT = 'ambientCrew';
const catalogueId = vt => vt?.actor?.getFlag?.(NS,'catalogId') || vt?.getFlag?.(NS,'catalogId') || '';
const policeKind = vt => vt?.getFlag?.(NS,'police')?.unit || '';
/** Stable assignments by role and motor type, not unrelated characters from the named story cast. */
export function crewPlanFor(vt) {
  const id = catalogueId(vt),police = policeKind(vt);
  if(police){
    const armed = police === 'arv', officerKey = armed?'arv':'pc';
    const names = police === 'heli' ? ['NPAS pilot','NPAS observer'] : police === 'bike' ? ['Motorcycle officer']
      : police === 'van' ? ['Carrier driver','Custody officer','Response officer'] : armed ? ['ARV driver','Armed response officer','Armed response officer']
      : ['Response driver','Response officer'];
    const positions=seatLayout(vt.actor);return names.map((name,i)=>({seatId:positions[i]?.id??(i?'passenger-'+i:'pilot'),key:officerKey,name,role:'police'}));
  }
  const byId = {
    LV12:[['cabbie','Hackney cab driver'],['ped-02','Cab fare']],
    LV13:[['cabbie','Private-hire driver'],['ped-03','Minicab passenger']],
    LV28:[['ped-04','Bus driver'],['ped-05','Bus passenger'],['ped-06','Bus passenger'],['ped-07','Bus passenger']],
    LV21:[['courier','Delivery driver']], LV22:[['ped-08','Ice-cream vendor']],
    LV06:[['courier','Delivery rider']], LV07:[['ped-09','Moped commuter']],LV09:[['ped-10','Motorcycle rider']],
    LV20:[['ped-11','Local van driver']],
    LV23:[['pc','Police driver'],['pc','Police officer']],LV24:[['pc','Carrier driver'],['pc','Police officer'],['pc','Police officer']],
    LV25:[['arv','ARV driver'],['arv','Armed officer'],['arv','Armed officer']],
    LV26:[['paramedic','Ambulance driver'],['paramedic','Ambulance crew']],
    LV27:[['firefighter','Fire appliance driver'],['firefighter','Firefighter']],
    LV29:[['pc','NPAS pilot'],['pc','NPAS observer']]
  };
  const entries=byId[id]??[['ped-01','Local motorist']];
  const positions=seatLayout(vt.actor);
  return entries.map(([key,name],i)=>({seatId:positions[i]?.id??(i?'passenger-'+i:'pilot'),key,name,role: id==='LV28'?'bus':id==='LV12'||id==='LV13'?'taxi':id==='LV26'?'ambulance':id==='LV27'?'fire':id==='LV23'||id==='LV24'||id==='LV25'||id==='LV29'?'police':'civilian'}));
}
export function ambientCrewOf(vt) {
  return (vt?.getFlag?.(NS,'vehicleOccupants') || []).filter(o=>o?.ambient === true);
}
/** An ambient vehicle remains in road traffic; one boarded by a player does not. */
export function isBackgroundTraffic(vt) {
  const crew = vt?.getFlag?.(NS,'vehicleOccupants') || [];
  if(!crew.length)return true;
  if(!vt?.getFlag?.(NS, AMBIENT))return false;
  return crew.every(o=>o?.ambient===true) && crew.some(o=>o.seatId==='pilot');
}
/** Only assigned background NPCs may be removed automatically; PCs and independently boarded riders never are. */
export function ambientTokens(vt) {
  return ambientCrewOf(vt).map(o=>vt.parent?.tokens?.get(o.tokenId)).filter(t=>t&&t.getFlag?.(NS,AMBIENT)?.vehicleTokenId===vt.id);
}
/** Seed existing moving vehicles on upgrade, as well as newly spawned traffic and police. */
const crewCreation=new Map();
export async function ensureAmbientCrew(vt, {createPerson = null} = {}) {
  if(!vt?.actor || vt.actor.type!=='vehicle'||!vt.parent || vt.getFlag(NS,'ambientCrewDisabled'))return [];
  // Traffic tick, map setup and token hooks can meet on one vehicle. Only one creates its occupants.
  const key=`${vt.parent.id}:${vt.id}`;
  if(crewCreation.has(key))return crewCreation.get(key);
  const task=seedAmbientCrew(vt,{createPerson});crewCreation.set(key,task);
  try{return await task;}finally{if(crewCreation.get(key)===task)crewCreation.delete(key);}
}
async function seedAmbientCrew(vt,{createPerson = null}={}){
  const occupants=vt.getFlag(NS,'vehicleOccupants')||[];
  // Never invent people in a player-owned or deliberately altered motor.
  if(occupants.length || vt.getFlag(NS,'stolen') || vt.actor.hasPlayerOwner)return [];
  const seats=seatLayout(vt.actor), allowed=new Set(seats.map(x=>x.id));
  const plan=crewPlanFor(vt).filter(p=>allowed.has(p.seatId));
  const coords=seatPositions(vt,seats,vt.parent.grid?.size||100),made=[];
  const mk=createPerson??(async(p,x,y)=>{
    const actor=await ensurePersonActor(p.key);
    return placeToken(vt.parent,actor,x,y,{name:p.name,flags:{[AMBIENT]:{vehicleTokenId:vt.id,role:p.role},vehicleSeat:{vehicleTokenId:vt.id,seatId:p.seatId}}});
  });
  try {
    for(const p of plan){
      const pt=coords[p.seatId];const doc=await mk(p,pt.x+(vt.parent.grid?.size||100)*0.25,pt.y+(vt.parent.grid?.size||100)*0.25);
      if(!doc)continue;
      if(!doc.getFlag?.(NS,'vehicleSeat'))await doc.update({[`flags.${NS}.vehicleSeat`]:{vehicleTokenId:vt.id,seatId:p.seatId},[`flags.${NS}.${AMBIENT}`]:{vehicleTokenId:vt.id,role:p.role}},{acVehicleCarry:true});
      made.push({seatId:p.seatId,tokenId:doc.id,actorId:doc.actor?.id||doc.actorId,name:p.name,original:{width:1,height:1},ambient:true});
    }
    if(!made.some(o=>o.seatId==='pilot'))throw new Error('No driver could be seated.');
    await vt.update({[`flags.${NS}.vehicleOccupants`]:made,[`flags.${NS}.${AMBIENT}`]:true},{acVehicleCarry:true});
    // One document batch makes everyone actually sit at their projected coordinates.
    await vt.parent.updateEmbeddedDocuments('Token',made.map(o=>{const pt=coords[o.seatId];return {_id:o.tokenId,x:Math.round(pt.x),y:Math.round(pt.y),width:0.5,height:0.5,rotation:vt.rotation||0,sort:(vt.sort||0)+1};}),{acVehicleCarry:true});
    return made;
  } catch(error) {
    if(made.length)await vt.parent.deleteEmbeddedDocuments('Token',made.map(o=>o.tokenId),{smokeDespawn:true,acVehicleCarry:true});
    console.warn('The Smoke | unable to seat ambient NPC crew',vt.name,error);
    return [];
  }
}
/** All real occupants travel in the SAME token batch, for free traffic, cops and combat traffic phases. */
export function carryCrewInBatch(scene, updates) {
  const out=[], seen=new Set();
  for(const up of updates){
    if(!up?._id || seen.has(up._id))continue;
    out.push(up);seen.add(up._id);
    const vt=scene.tokens?.get?.(up._id), occupantList=vt?.getFlag?.(NS,'vehicleOccupants')||[];
    if(!occupantList.length || !['x','y','rotation','elevation'].some(k=>Object.hasOwn(up,k)))continue;
    const move={};for(const k of ['x','y','rotation','elevation','width','height'])if(Object.hasOwn(up,k))move[k]=up[k];
    const bySeat=Object.fromEntries(occupantList.map(o=>[o.seatId,o]));
    for(const rider of planVehicleMove(vt,move,bySeat,scene.grid.size).slice(1))if(!seen.has(rider._id)){out.push(rider);seen.add(rider._id);}
  }
  return out;
}
/** Carjacking pulls out the ACTUAL driver/fare, rather than conjuring a random Londoner beside the motor. */
export async function ejectAmbientCrew(vt, {fleeTokenId = null} = {}) {
  const riders=ambientTokens(vt),scene=vt.parent,g=scene.grid.size;
  if(!riders.length)return [];
  const remaining=(vt.getFlag(NS,'vehicleOccupants')||[]).filter(o=>!riders.some(t=>t.id===o.tokenId));
  await vt.update({[`flags.${NS}.vehicleOccupants`]:remaining,[`flags.${NS}.${AMBIENT}`]:false,[`flags.${NS}.ambientCrewDisabled`]:true},{acVehicleCarry:true});
  await scene.updateEmbeddedDocuments('Token',riders.map((t,i)=>({_id:t.id,x:Math.round(vt.x+(vt.width+0.5+i)*g),y:Math.round(vt.y+(i%2)*g),width:1,height:1,rotation:0,
    [`flags.${NS}.vehicleSeat`]:null,[`flags.${NS}.${AMBIENT}`]:null,[`flags.${NS}.traffic`]:{kind:'ped',flee:fleeTokenId}})),{acVehicleCarry:true});
  return riders;
}
/** When a background vehicle despawns, don't leave its passengers behind on the pavement. */
export async function removeDespawnedCrew(scene, vehicle){
  const ids=ambientTokens(vehicle).map(t=>t.id).filter(id=>scene.tokens?.get?.(id));
  if(ids.length)await scene.deleteEmbeddedDocuments('Token',ids,{smokeDespawn:true,acVehicleCarry:true});
  return ids.length;
}
/** Response units already carry genuine officers. Bring those officers out rather than spawning doubles. */
export async function deployPoliceCrew(vt, target, count=2){
  if(!vt||!policeKind(vt)||!vt.parent)return [];
  if(!ambientCrewOf(vt).length)await ensureAmbientCrew(vt);
  const scene=vt.parent,g=scene.grid.size,all=ambientCrewOf(vt);
  const selected=[...all].sort((a,b)=>Number(a.seatId==='pilot')-Number(b.seatId==='pilot')).slice(0,count);
  const names = selected.map(o=>scene.tokens.get(o.tokenId)).filter(Boolean);
  if(!names.length)return [];
  await vt.update({[`flags.${NS}.vehicleOccupants`]:(vt.getFlag(NS,'vehicleOccupants')||[]).filter(o=>!selected.some(x=>x.tokenId===o.tokenId)),
    [`flags.${NS}.ambientCrewDisabled`]:true,[`flags.${NS}.police.parked`]:true},{acVehicleCarry:true});
  const h = vt.getFlag(NS,'police')?.hunting || target?.actorId;
  await scene.updateEmbeddedDocuments('Token',names.map((t,i)=>({_id:t.id,x:Math.round(vt.x+(i?vt.width+0.6:-0.6)*g),y:Math.round(vt.y+(i%2)*g),width:1,height:1,rotation:vt.rotation||0,
    [`flags.${NS}.vehicleSeat`]:null,[`flags.${NS}.${AMBIENT}`]:null,[`flags.${NS}.police`]:{unit:'officer',hunting:h}})),{acVehicleCarry:true});
  return names;
}
