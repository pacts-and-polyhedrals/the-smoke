// The Smoke: one distance ledger for occupied, empty and AI-driven vehicles.
// Store committed travel only; animations update this after the leader has moved a vehicle.
import {NS} from '../config.mjs';
import {tallyOf} from '../world/chase-state.mjs';
export function squaresBetween(from,to,grid){
  const g=Number(grid);if(!Number.isFinite(g)||g<=0)throw new Error('Invalid grid scale');
  return Math.hypot(Number(to?.[0])-Number(from?.[0]),Number(to?.[1])-Number(from?.[1]))/g;
}
export function meterNext(prior,dist,source='driving'){
  const amount=Number(dist);if(!Number.isFinite(amount)||amount<0||amount>5000)throw new Error('Invalid vehicle travel');
  return {total:Math.round((Math.max(0,Number(prior?.total)||0)+amount)*100)/100,
    recent:Math.round(amount*100)/100,source:String(source).slice(0,24),at:Date.now()};
}
/**
 * For the background loops (traffic, police on the hunt): put each moving vehicle's meter into the same batch as its
 * move, instead of one extra write per vehicle after it (0.5.22 — that doubled the token traffic every second).
 */
export function withMeters(scene,updates,source){
  const g=scene?.grid?.size||100;
  return updates.map(up=>{
    const t=scene?.tokens?.get?.(up._id);
    if(t?.actor?.type!=='vehicle'||!Number.isFinite(up.x)||!Number.isFinite(up.y))return up;
    const dist=Math.hypot(up.x-Number(t.x),up.y-Number(t.y))/g;
    if(!(dist>=0.01)||dist>5000)return up;
    return {...up,[`flags.${NS}.travel`]:meterNext(t.getFlag?.(NS,'travel'),dist,source)};
  });
}
/** Must be called once after the movement is committed, from the authoritative move path. */
export async function recordJourney(vt,dist,{key=null,source='driving',tally=null}={}){
  if(!vt?.getFlag||Number(dist)<0.01)return null;
  const meter=meterNext(vt.getFlag(NS,'travel'),dist,source);
  const up={[`flags.${NS}.travel`]:meter};
  if(key) {
    const old=tallyOf(vt,key),now=tally??{...old,key,moved:Math.round((Number(old.moved||0)+Number(dist))*100)/100};
    up[`flags.${NS}.drive`]=now;
  }
  if(typeof vt.update==='function')await vt.update(up,{acVehicleCarry:true,smokeMeter:true});
  else { // Pure in-memory scene fixtures have no TokenDocument.update; Foundry tokens always do.
    const all=(vt.flags??={});const flags=(all[NS]??={});flags.travel=meter;
    if(key)flags.drive=up[`flags.${NS}.drive`];
  }
  return meter;
}
