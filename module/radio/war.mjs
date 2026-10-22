// Fictional radio-war relay/contact locations on London's real Smoke map scenes.
// Every game action is resolved by the active GM; location tokens grant no Actor ownership.
import {NS} from '../config.mjs';
import {registerHandler,request,isLeader,card,esc} from '../world/net.mjs';
import {mapIdOf,placeToken} from '../world/spawn.mjs';
import {rectDistanceSquares} from '../graffiti/core.mjs';
import {stations} from './radio.mjs';
import {RETIRED_STATIONS} from './studio.mjs';
import {missionEvent,missionState,missionData} from '../world/missions.mjs';
import {RADIO_WAR_ACTIONS,radioWarClaimKey,radioWarDay,radioWarScore,radioWarTotals,selectedRadioSites,radioContactPosition} from './war-core.mjs';
const KEY='radioWarState';
let LOCATIONS=null,locationLoading=null,actorLoading=null;
export async function radioWarLocations(){
 if(LOCATIONS)return LOCATIONS;
 if(locationLoading)return locationLoading;
 locationLoading=fetch(`systems/${NS}/data/radio-war-locations.json`).then(r=>{if(!r.ok)throw new Error('Radio war locations are missing.');return r.json();}).then(d=>(LOCATIONS=d.locations||[]));
 try{return await locationLoading;}finally{locationLoading=null;}
}
export const radioWarState=()=>{try{return game.settings.get(NS,KEY)||{};}catch(_){return {};}};
export function registerRadioWarSettings(){game.settings.register(NS,KEY,{scope:'world',config:false,type:Object,default:{},onChange:()=>Hooks.callAll('smokeRadioWarChanged')});}
export const radioWarAtToken=t=>t?.getFlag?.(NS,'radioWarNode')??null;
export const activeRadioWarMissions=(stationId,actorId)=>Object.entries(missionState()).filter(([id,s])=>id.startsWith('rw-')&&s?.status==='active'&&s.actorIds?.includes(actorId)&&id.includes(stationId)).map(([id])=>id);
async function ensureRadioActor(){
 const existing=game.actors.find(a=>a.getFlag?.(NS,'radioWarActor'));if(existing)return existing;
 if(actorLoading)return actorLoading;
 actorLoading=Actor.implementation.create({name:'Radio War Contact',type:'npc',img:`systems/${NS}/assets/ui/radio-relay.svg`,ownership:{default:0},
   prototypeToken:{name:'Radio War Contact',actorLink:false,displayName:20,width:.6,height:.6,
     texture:{src:`systems/${NS}/assets/ui/radio-relay.svg`,fit:'contain'},disposition:0,sight:{enabled:false}},
   flags:{[NS]:{radioWarActor:true}}});
 try{return await actorLoading;}finally{actorLoading=null;}
}
/** Running again updates nothing the GM moved, and never places duplicate tokens. */
export async function syncRadioWarLocations({scene=null}={}){
 if(!isLeader()||!game.user?.isGM)return 0;
 const locations=selectedRadioSites(await radioWarLocations(),stations());if(!locations.length)return 0;
 const active=scene?[scene]:[...game.scenes];let made=0;
 for(const s of active){
   // Remove ONLY auto-generated retired contacts; preserve hand-placed or edited tokens.
   const retired=[...s.tokens].filter(t=>{const flag=radioWarAtToken(t);return flag?.auto===true&&RETIRED_STATIONS.has(flag.stationId);});
   if(retired.length)await s.deleteEmbeddedDocuments('Token',retired.map(t=>t.id));
   const mapId=mapIdOf(s),forMap=locations.filter(l=>l.mapId===mapId);if(!forMap.length)continue;
   const actor=await ensureRadioActor();
   for(const place of forMap){
     if([...s.tokens].some(t=>radioWarAtToken(t)?.stationId===place.stationId))continue;
     const zones=s.getFlag?.(NS,'zoneGraph')?.zones||[];
     const zone=zones.find(z=>z.id===place.zoneId&&Array.isArray(z.rect));
     if(!zone){console.warn('The Smoke | Radio War location missing authored zone',place.stationId,place.mapId,place.zoneId);continue;}
     const position=radioContactPosition(zone,zones,s.grid?.size||100);
     await placeToken(s,actor,position.x,position.y,{name:place.title,flags:{radioWarNode:{stationId:place.stationId,locationId:`radio-${place.stationId}`,role:place.kind,side:place.side,auto:true}}});
     made++;
   }
 }
 if(made)console.info(`The Smoke | ${made} radio-war contacts placed on their street maps.`);
 return made;
}
function stationSite(scene,tokenId){
 const token=scene?.tokens?.get?.(tokenId),node=radioWarAtToken(token);
 if(!token||!node)throw new Error('That radio-war contact is no longer on this map.');
 const station=stations().find(x=>x.id===node.stationId&&x.stream);
 if(!station)throw new Error('This station has no supported direct radio feed.');
 return {token,node,station};
}
function playerAt(scene,actorId,user){
 const actor=game.actors.get(actorId);
 if(actor?.type!=='character'||(!user.isGM&&!actor.testUserPermission?.(user,'OWNER')))throw new Error('Use a character you own.');
 const token=scene.tokens.find(t=>t.actorId===actor.id&&!t.hidden&&!t.getFlag?.(NS,'vehicleSeat'));
 if(!token)throw new Error('Get out of your vehicle and stand beside the radio contact.');
 return {actor,token};
}
function closeTo(near,contact,scene){
 if(rectDistanceSquares(near,contact,scene.grid?.size||100)>2)throw new Error('Get within two squares of the radio contact.');
}
function checkRoll(message,{attemptId,actorId,sceneId,tokenId,actionId,userId}){
 const roll=message?.getFlag?.(NS,'roll'),ctx=roll?.context,act=RADIO_WAR_ACTIONS[actionId];
 if(!act||!roll||ctx?.kind!=='radioWar'||ctx.attemptId!==attemptId||ctx.actorId!==actorId||ctx.sceneId!==sceneId||ctx.tokenId!==tokenId||ctx.actionId!==actionId
   ||roll.userId!==userId||roll.actorUuid!==game.actors.get(actorId)?.uuid||roll.stat!==act.stat||roll.band!==act.band
   ||radioWarScore(roll.outcomeKey)==null)throw new Error('This roll is not a verified radio-war attempt. Roll again using the radio contact.');
 const used=message.getFlag(NS,'radioWarUsed');
 if(used&&used!==attemptId)throw new Error('This radio-war roll was already used by a different attempt.');
 return roll;
}
function missionForAction(stationId,missionId,actionId,actorId){
 if(!missionId)return null;
 const state=missionState()[missionId];
 if(!state||state.status!=='active'||!state.actorIds?.includes(actorId))throw new Error('That radio mission is not active for this character.');
 return missionData().then(data=>{
   const m=data.missions.find(x=>x.id===missionId);
   if(m?.radioWar?.stationId!==stationId||m.radioWar.actionId!==actionId)throw new Error('This radio job needs a different contact or action.');
   return {state,m};
 });
}
async function radioWarOnLeader({sceneId,tokenId,actorId,actionId,missionId=null,rollMessageId,attemptId,userId}){
 const user=game.users.get(userId),scene=game.scenes.get(sceneId);if(!user||!scene)throw new Error('Radio contact or player no longer available.');
 const {token,node,station}=stationSite(scene,tokenId),{actor,token:pc}=playerAt(scene,actorId,user);closeTo(pc,token,scene);
 const action=RADIO_WAR_ACTIONS[actionId];if(!action)throw new Error('Choose a radio-war action.');
 const mission=await missionForAction(station.id,missionId,actionId,actor.id);
 const rollMessage=game.messages.get(rollMessageId),roll=checkRoll(rollMessage,{attemptId,actorId,sceneId,tokenId,actionId,userId});
 const day=radioWarDay(game.time?.worldTime),claim=radioWarClaimKey(station.id,actorId,day),state=foundry.utils.deepClone(radioWarState());
 const record=state[station.id]||{influence:0,history:[],claimed:{}};
 const prior=(record.history||[]).find(h=>h.attemptId===attemptId);
 if(prior){
   // Reconnecting/retrying an already recorded attempt may repair missing mission proof,
   // but never re-awards influence/Rep/Watch time, even if the Watch has crossed midnight.
   if(prior.missionId===missionId&&prior.points>0&&mission&&prior.missionRunId===mission.state.runId)
     await missionEvent({on:'radioWar',missionId,stationId:station.id,actionId,actorId,attemptId,missionRunId:prior.missionRunId});
   return {stationId:station.id,points:prior.points,influence:Number(record.influence||0),repGain:0,minutes:0,alreadyWorked:true};
 }
 if(record.claimed?.[claim])throw new Error('You already worked this station today. Come back after the next Banana Watch day.');
 const points=radioWarScore(roll.outcomeKey),repGain=points>=3?1:0;
 const next={...record,influence:Math.max(0,Number(record.influence||0)+points),
   claimed:{...record.claimed,[claim]:attemptId},history:[...(record.history||[]).slice(-39),{day,actorId,actorName:actor.name,actionId,points,attemptId,missionId,missionRunId:mission?.state.runId??null}]};
 // Persist a durable authorisation record BEFORE rewarding; replays cannot double-pay.
 state[station.id]=next;await game.settings.set(NS,KEY,state);
 await rollMessage.setFlag(NS,'radioWarUsed',attemptId).catch(err=>console.warn('The Smoke | radio roll flag review',err));
 if(repGain)await actor.update({'system.rep.street':Number(actor.system.rep?.street||0)+repGain}).catch(e=>console.warn('The Smoke | radio reputation review',e));
 if(game.time?.advance)await game.time.advance(action.minutes*60).catch(e=>console.warn('The Smoke | radio watch review',e));
 if(mission&&points>0)await missionEvent({on:'radioWar',missionId,stationId:station.id,actionId,actorId,attemptId,missionRunId:mission.state.runId}).catch(e=>console.warn('The Smoke | radio mission update review',e));
 await card('THE DIAL',`${actor.name} · ${station.name}`,`<p>${esc(action.label)}: ${points>0?'+':''}${points} signal influence${repGain?' · +1 Street Rep':''}. ${action.minutes} Banana Watch minutes.</p><p class="smoke-dim">${esc(node.side==='underground'?'Underground dial':'Licensed dial')} · ${esc(token.name)} · influence ${next.influence}</p>`,'crew');
 Hooks.callAll('smokeRadioWarChanged');return {stationId:station.id,points,influence:next.influence,repGain,minutes:action.minutes};
}
registerHandler('radioWar.act',radioWarOnLeader);
export async function openRadioWar(doc){
 const scene=canvas?.scene;if(!scene||doc?.parent?.id!==scene.id)throw new Error('Open the radio contact map first.');
 const {token,node,station}=stationSite(scene,doc.id);
 const actors=game.actors.filter(a=>a.type==='character'&&(game.user.isGM||a.isOwner));
 if(!actors.length)throw new Error('You need your own character to run radio jobs.');
 const actor=game.user.character?.isOwner?game.user.character:actors[0];
 const current=radioWarState()[station.id]||{influence:0,claimed:{}};
 const options=Object.entries(RADIO_WAR_ACTIONS).map(([id,a])=>`<option value="${id}">${esc(a.label)} · ${esc(a.stat.toUpperCase())} ${esc(a.band)}</option>`).join('');
 const data=await missionData(),active=activeRadioWarMissions(station.id,actor.id).map(id=>data.missions.find(m=>m.id===id)).filter(Boolean);
 const choices=[`<option value="">Street hustle (no commission)</option>`,...active.map(m=>`<option value="${esc(m.id)}">${esc(m.code)} · ${esc(m.title)}</option>`)].join('');
 const f=await foundry.applications.api.DialogV2.input({window:{title:`Radio war · ${station.name}`},content:`<div class="the-smoke"><p>${esc(token.name)} · ${esc(station.name)} · signal ${Number(current.influence||0)}</p><p>${esc((await radioWarLocations()).find(l=>l.stationId===station.id)?.pitch||'')}</p><label>Action<select name="actionId">${options}</select></label><label>Commission<select name="missionId">${choices}</select></label><p class="smoke-dim">Once per character per station per Banana Watch day; successful rolls build signal and top results build Street Rep.</p></div>`,ok:{label:'Have a go'}});
 if(!f)return null;
 const action=RADIO_WAR_ACTIONS[f.actionId];if(!action)throw new Error('Choose an action.');
 if(f.missionId){const m=active.find(m=>m.id===f.missionId);if(!m||m.radioWar?.actionId!==f.actionId)throw new Error('This commission requires a different job action.');}
 const pc=scene.tokens.find(t=>t.actorId===actor.id&&!t.hidden&&!t.getFlag(NS,'vehicleSeat'));if(!pc)throw new Error('Get out and stand beside the radio contact.');
 closeTo(pc,token,scene);
 const day=radioWarDay(game.time?.worldTime);
 if(current.claimed?.[radioWarClaimKey(station.id,actor.id,day)])throw new Error('You have already worked this radio contact today.');
 const attemptId=foundry.utils.randomID(20);
 const out=await actor.rollStat(action.stat,{band:action.band,label:`${action.label}: ${station.name}`,
   context:{kind:'radioWar',attemptId,actorId:actor.id,sceneId:scene.id,tokenId:token.id,actionId:f.actionId}});
 if(!out?.result)return null;
 return request('radioWar.act',{sceneId:scene.id,tokenId:token.id,actorId:actor.id,actionId:f.actionId,missionId:f.missionId||null,attemptId,rollMessageId:out.message?.id});
}
export function inspectRadioWar(doc){
 const stationId=radioWarAtToken(doc)?.stationId;if(!stationId)throw new Error('This is not a radio contact.');
 const status=radioWarState()[stationId],station=stations().find(s=>s.id===stationId);
 ui.notifications.info(`${station?.name||stationId}: signal influence ${Number(status?.influence||0)} · ${status?.history?.length||0} crew jobs recorded.`);
}
export function installRadioWar(){
 Hooks.on('createScene',(scene)=>{if(!isLeader())return;Promise.resolve().then(()=>syncRadioWarLocations({scene})).catch(e=>console.warn('The Smoke | radio-war scene pins',e));});
}
export const radioWarAPI={locations:radioWarLocations,sync:syncRadioWarLocations,state:radioWarState,open:openRadioWar,inspect:inspectRadioWar,totals:async()=>radioWarTotals(radioWarState(),await radioWarLocations())};
