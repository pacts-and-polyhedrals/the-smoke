// Vehicle boarding (v2.5.1)
// - Vehicle tokens get a footprint from their Size (Size 1 → 1×2, Size 2 → 2×3, ...).
// - Characters choose a seat (Driver/Pilot, Gunner, Operator, Passenger) to enter a vehicle.
//   Their token shrinks into that seat and is carried, with rotation, whenever the vehicle moves.
// - Who drives: the Driver seat's player (they are given control of the vehicle token while
//   seated), the vehicle's AI / the GM, or both — set per vehicle.
// All scene writes are done by one active GM; players send requests over the system socket.
import {seatLayout,seatPositions,vehicleFootprint,exitPositions} from './vehicle-seat-math.mjs';
import {pickVehicleTransform,planVehicleMove} from './vehicle-movement.mjs';
import {hasAbility,isCagedSeat} from './vehicle-abilities.mjs';

const NS='the-smoke',SOCKET=`system.${NS}`,SEAT='vehicleSeat',OCC='vehicleOccupants',GRANT='vehicleDriverGrant';
const esc=v=>foundry.utils.escapeHTML(String(v??''));
const OWNER=()=>CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

const leaderGM=()=>game.users.activeGM??game.users.filter(u=>u.active&&u.isGM).sort((a,b)=>a.id.localeCompare(b.id))[0]??null;
const isLeader=()=>leaderGM()?.id===game.user.id;
const isVehicleToken=t=>t?.actor?.type==='vehicle';
const occupantsOf=vt=>{const raw=vt?.getFlag?.(NS,OCC);const out={};if(Array.isArray(raw))for(const o of raw)if(o?.seatId)out[o.seatId]={...o};return out;};
const saveOccupants=(vt,map)=>vt.update({[`flags.${NS}.${OCC}`]:Object.entries(map).map(([seatId,o])=>({...o,seatId}))},{acVehicleCarry:true});
const grantsOf=vt=>{const raw=vt?.getFlag?.(NS,GRANT);const out={};if(Array.isArray(raw))for(const g of raw)if(g?.userId)out[g.userId]=g.before;return out;};
const seatOf=t=>t?.getFlag?.(NS,SEAT)||null;
const controlMode=vt=>String(vt?.actor?.system?.vehicle?.control||'driver');

export {seatLayout,vehicleFootprint};
/** Async checks run (on the leader GM) before anyone takes a seat; throw to refuse. Theft, carjacking and job rules add theirs. */
export const BOARD_GATES=[];
/** Extra buttons for vehicles. New handlers must opt in explicitly to be shown to non-owning players.
 * For the GM/owner's HUD all registered actions are available as before; the action's handler still
 * validates its own permissions. fn(vehicleToken) -> [{icon,title,fn,playerAllowed:true}]. */
export const VEHICLE_ACTIONS=[];
export function vehicleActions(vt,{playerOnly=false}={}){
  const out=[];
  for(const provider of VEHICLE_ACTIONS){
    try{for(const a of provider(vt)||[])if(!playerOnly||a?.playerAllowed===true)out.push(a);}
    catch(error){console.warn('The Smoke | vehicle action',error);}
  }
  return out;
}

/* ------------------------------------------------------------------ requests */
async function request(type,data){
  if(isLeader())return runQueued(type,{...data,userId:game.user.id});
  if(!leaderGM())throw new Error('A GM must be connected to board or leave vehicles.');
  game.socket.emit(SOCKET,{type:`acVehicle.${type}`,data:{...data,userId:game.user.id}});
  return null;
}
export function boardVehicle(vehicleToken,occupantToken,seatId){return request('board',{sceneId:vehicleToken.parent.id,vehicleTokenId:vehicleToken.id,tokenId:occupantToken.id,seatId});}
export function exitVehicle(occupantToken){return request('exit',{sceneId:occupantToken.parent.id,tokenId:occupantToken.id});}
/** Internal leader entry points retain the requesting player's reach, locks and seat permissions. */
export function boardAsUser(vt,ot,seatId,userId){if(!isLeader())throw new Error('Leader only.');return runQueued('board',{sceneId:vt.parent.id,vehicleTokenId:vt.id,tokenId:ot.id,seatId,userId});}
export function exitAsUser(ot,userId){if(!isLeader())throw new Error('Leader only.');return runQueued('exit',{sceneId:ot.parent.id,tokenId:ot.id,userId});}
export function exitAllFromVehicle(vehicleToken,{keepDriver=true}={}){return request('exitAll',{sceneId:vehicleToken.parent.id,vehicleTokenId:vehicleToken.id,keepDriver});}
export function releaseFromCage(vehicleToken,prisonerToken){return request('release',{sceneId:vehicleToken.parent.id,vehicleTokenId:vehicleToken.id,tokenId:prisonerToken.id});}
export function setVehicleControl(vehicleToken,{control,aiPilot}={}){return request('control',{sceneId:vehicleToken.parent.id,vehicleTokenId:vehicleToken.id,control,aiPilot});}

// One queue per scene for every vehicle change (board, get out, move, map-to-map transit). Two players
// getting out at once, or a drag landing while someone boards, used to overwrite each other's seat list,
// so a rider could be dropped from the list and then left behind when the vehicle moved on.
const movementQueue=new Map();
export function serialScene(sceneId,job){return serialVehicleMove(`scene:${sceneId}`,job);}
function runQueued(type,data){return serialScene(data.sceneId,()=>HANDLERS[type](data));}
function serialVehicleMove(key,job){
  const pending=(movementQueue.get(key)||Promise.resolve()).catch(()=>{}).then(job);
  movementQueue.set(key,pending);
  void pending.finally(()=>{if(movementQueue.get(key)===pending)movementQueue.delete(key);}).catch(()=>{});
  return pending;
}

export function moveVehicle(vehicleToken,transform,{animate=true,free=false}={}){
  return request('move',{sceneId:vehicleToken.parent.id,vehicleTokenId:vehicleToken.id,transform:pickVehicleTransform(transform),animate,free:Boolean(free)});
}
/** Checks run (on the leader) before an occupied vehicle moves: fn({vt,scene,user,transform,passengers,free}) → the
 *  transform to use (maybe shortened), or throw to refuse. The chase gauge and turn order add theirs. */
export const MOVE_GATES=[];
/** Run after an occupied vehicle has moved: fn({vt,scene,user,from,to,passengers,free}); centres in px. Collisions and
 *  driving checks watch here. They run outside the scene queue, so they may move the vehicle again. */
export const MOVE_WATCHERS=[];
// Watchers may reposition after a crash, so they run outside the scene queue. Keep a lock until they finish:
// a second drag and the Combat Console's Done must not overtake a gauge check or collision roll.
export const settlingMoves=new Set();

function requireUserCanMove(user,token){
  if(!user)throw new Error('Unknown user.');
  if(user.isGM)return;
  if(!token?.actor?.testUserPermission?.(user,'OWNER'))throw new Error(`${user?.name||'That player'} does not control ${token?.name||'that token'}.`);
}
async function announce(vt,text){
  try{await ChatMessage.implementation.create({speaker:{alias:vt.name},content:`<section class="smoke-chat-card smoke-vehicle-card"><header class="smoke-chat-card-header"><div><span class="smoke-chat-kicker">VEHICLE</span><strong>${esc(vt.name)}</strong></div></header><p>${text}</p></section>`});}catch(error){console.warn('The Smoke | vehicle chat',error);}
}

/* ------------------------------------------------------------------ crew + control */
async function syncCrew(vt,occupants){
  const seats=seatLayout(vt.actor),seen=new Set(),crew=[];
  for(const seat of seats){const o=occupants[seat.id];if(!o||seen.has(o.actorId))continue;seen.add(o.actorId);crew.push({actorId:o.actorId,role:seat.role});}
  try{await vt.actor.update({'system.vehicle.crewAssignments':JSON.stringify(crew)});}catch(error){console.warn('The Smoke | crew sync',error);}
}
function driverUsers(occupants,scene){
  const o=occupants.pilot;if(!o)return [];
  const token=scene.tokens.get(o.tokenId),actor=token?.actor;if(!actor)return [];
  return game.users.filter(u=>!u.isGM&&actor.testUserPermission(u,'OWNER'));
}
// Give the driver's players OWNER on the vehicle Actor so they can drag the token; remember
// what each had before so leaving the seat restores it exactly.
export async function applyDriverControl(vt,occupants){
  if(occupants.pilot && driverUsers(occupants,vt.parent).length && !vt.getFlag(NS,'dedicatedVehicle')){
    const source=vt.actor?.toObject();
    if(source){delete source._id;source.name=vt.name;source.ownership={default:0};
      foundry.utils.setProperty(source,`flags.${NS}.streetLife`,false);foundry.utils.setProperty(source,`flags.${NS}.dedicatedFor`,vt.id);
      // Driven motors get their own actor; keep them together in one folder instead of loose in the Actors directory.
      const folder=await drivenFolder();if(folder)source.folder=folder.id;
      const dedicated=await Actor.implementation.create(source);
      await vt.update({actorId:dedicated.id,actorLink:false,[`flags.${NS}.dedicatedVehicle`]:true,[`flags.${NS}.${GRANT}`]:[]},{acVehicleCarry:true});}
  }
  const base=vt.baseActor??game.actors.get(vt.actorId)??vt.actor;if(!base)return;
  const previous=grantsOf(vt);
  const wanted=controlMode(vt)==='ai'?[]:driverUsers(occupants,vt.parent).map(u=>u.id);
  const update={},nextGrant={};
  for(const [userId,before] of Object.entries(previous)){
    if(wanted.includes(userId)){nextGrant[userId]=before;continue;}
    update[`ownership.${userId}`]=before;
  }
  for(const userId of wanted){
    if(Object.hasOwn(nextGrant,userId))continue;
    const before=base.ownership?.[userId]??base.ownership?.default??CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
    if(before===OWNER())continue; // already an owner: nothing to grant or revoke later
    nextGrant[userId]=before;update[`ownership.${userId}`]=OWNER();
  }
  if(Object.keys(update).length)await base.update(update);
  await vt.update({[`flags.${NS}.${GRANT}`]:Object.entries(nextGrant).map(([userId,before])=>({userId,before}))},{acVehicleCarry:true});
}

const DRIVEN_FOLDER='The Smoke — Driven Vehicles';
async function drivenFolder(){
  try{const found=game.folders?.find?.(f=>f.type==='Actor'&&f.name===DRIVEN_FOLDER);if(found)return found;
    return await Folder.implementation.create({name:DRIVEN_FOLDER,type:'Actor',color:'#5b6470',sorting:'a'});}catch(_e){return null;}
}
/** A driven vehicle's own actor goes when its last token does (a despawned or deleted motor), never on a map change. */
export async function removeOrphanDedicatedActor(actorId){
  const actor=game.actors?.get?.(actorId);if(!actor?.getFlag?.(NS,'dedicatedFor'))return false;
  const inUse=[...(game.scenes??[])].some(s=>s.tokens?.some?.(t=>t.actorId===actorId))
    ||[...(game.actors??[])].some(a=>(a.getFlag?.(NS,'foldedVehicles')||[]).some(f=>f?.data?.actorId===actorId));   // folded up and carried
  if(inUse)return false;
  try{await actor.delete();return true;}catch(error){console.warn('The Smoke | tidy driven vehicle actor',error);return false;}
}

/* ------------------------------------------------------------------ handlers (leader GM) */
function rectGap(a,b,g){
  const ax2=a.x+a.width*g,ay2=a.y+a.height*g,bx2=b.x+b.width*g,by2=b.y+b.height*g;
  const dx=Math.max(0,a.x-bx2,b.x-ax2),dy=Math.max(0,a.y-by2,b.y-ay2);return Math.hypot(dx,dy)/g;
}
async function placeOccupants(vt,occupants,{animate=true}={}){
  const scene=vt.parent,g=scene.grid.size,seats=seatLayout(vt.actor),pos=seatPositions(vt,seats,g);
  const updates=[];
  for(const seat of seats){const o=occupants[seat.id];if(!o)continue;const t=scene.tokens.get(o.tokenId);if(!t)continue;
    const p=pos[seat.id];updates.push({_id:t.id,x:Math.round(p.x),y:Math.round(p.y),width:0.5,height:0.5,rotation:vt.rotation||0,elevation:vt.elevation||0,sort:(vt.sort||0)+1});}
  if(updates.length)await scene.updateEmbeddedDocuments('Token',updates,{acVehicleCarry:true,animate});
}
/**
 * Make the vehicle's seat list and its riders' seat flags agree. A rider whose flag names this vehicle but
 * who is missing from the list is put back in their seat (or, if someone else has it, let out beside the
 * vehicle); list entries whose token is gone or sits elsewhere are dropped. Returns the corrected list.
 */
export async function reconcileOccupants(vt){
  const scene=vt?.parent;if(!scene)return {};
  const occ=occupantsOf(vt),before=JSON.stringify(occ),loose=[];
  for(const [seatId,o] of Object.entries(occ)){const t=scene.tokens.get(o.tokenId);const s=seatOf(t);if(!t||!s||s.vehicleTokenId!==vt.id||s.seatId!==seatId)delete occ[seatId];}
  for(const t of scene.tokens){const s=seatOf(t);if(!s||s.vehicleTokenId!==vt.id)continue;
    if(occ[s.seatId]?.tokenId===t.id)continue;
    if(!occ[s.seatId])occ[s.seatId]={tokenId:t.id,actorId:t.actor?.id||t.actorId,name:t.name,original:{width:1,height:1}};
    else loose.push(t);}
  if(JSON.stringify(occ)!==before)await saveOccupants(vt,occ);
  if(loose.length){const g=scene.grid.size;const ups=loose.map((t,i)=>{const p=exitPositions(vt,i,g);return {_id:t.id,x:Math.round(p.x),y:Math.round(p.y),width:1,height:1,rotation:0,[`flags.${NS}.${SEAT}`]:null};});
    await scene.updateEmbeddedDocuments('Token',ups,{acVehicleCarry:true});}
  return occ;
}
/** The vehicle a seated token belongs to: its flag, or any vehicle on the scene that lists it. */
function vehicleOf(scene,ot){
  const seat=seatOf(ot);const direct=seat&&scene.tokens.get(seat.vehicleTokenId);if(direct)return direct;
  return scene.tokens.find(v=>isVehicleToken(v)&&Object.values(occupantsOf(v)).some(o=>o.tokenId===ot.id))||null;
}
async function performExit(scene,ot,{quiet=false}={}){
    const seat=seatOf(ot);if(!seat)throw new Error(`${ot.name} is not in a vehicle.`);    const vt=vehicleOf(scene,ot),occupants=vt?occupantsOf(vt):{};
    for(const [k,o] of Object.entries(occupants))if(o.tokenId===ot.id&&k!==seat.seatId)delete occupants[k];
    const record=occupants[seat.seatId]||{},original=record.original||{width:1,height:1};
    delete occupants[seat.seatId];
    const g=scene.grid.size;let spot={x:ot.x,y:ot.y};
    if(vt){for(let i=0;i<24;i++){const p=exitPositions(vt,i,g);if(!scene.tokens.some(t=>t.id!==ot.id&&!seatOf(t)&&Math.abs(t.x-p.x)<g/2&&Math.abs(t.y-p.y)<g/2)){spot=p;break;}}}
    await ot.update({x:Math.round(spot.x),y:Math.round(spot.y),width:original.width,height:original.height,rotation:0,[`flags.${NS}.${SEAT}`]:null},{acVehicleCarry:true});
    if(vt){
      await saveOccupants(vt,occupants);
      await syncCrew(vt,occupants);await applyDriverControl(vt,occupants);
      if(!quiet)await announce(vt,`<strong>${esc(ot.name)}</strong> gets out.`);
    }
    return true;
  }
const HANDLERS={
  async board({sceneId,vehicleTokenId,tokenId,seatId,userId}){
    const scene=game.scenes.get(sceneId),vt=scene?.tokens.get(vehicleTokenId),ot=scene?.tokens.get(tokenId),user=game.users.get(userId);
    if(!vt||!ot)throw new Error('Vehicle or character token not found on this scene.');
    if(!isVehicleToken(vt))throw new Error(`${vt.name} is not a vehicle.`);
    if(isVehicleToken(ot))throw new Error('A vehicle cannot board another vehicle.');
    requireUserCanMove(user,ot);
    const seats=seatLayout(vt.actor),seat=seats.find(s=>s.id===seatId);if(!seat)throw new Error('That seat does not exist in this vehicle.');
    const occupants=occupantsOf(vt);
    if(occupants[seatId]&&occupants[seatId].tokenId!==ot.id)throw new Error(`${seat.label} is taken by ${occupants[seatId].name}.`);
    const reach=hasAbility(vt.actor,'openSides')?2.01:1.01;   // Open sides: jump on from 2 squares
    if(!user?.isGM&&!seatOf(ot)&&rectGap(ot,vt,scene.grid.size)>reach)throw new Error(`${ot.name} must be ${reach>2?'within 2 squares of':'next to'} ${vt.name} to get in.`);
    for(const gate of BOARD_GATES)await gate({vt,ot,seat,user,scene});
    const was=seatOf(ot);if(was&&!user?.isGM){const from=scene.tokens.get(was.vehicleTokenId);if(from&&isCagedSeat(from.actor,was.seatId))throw new Error(`${ot.name} is locked in the cage of ${from.name}. Someone outside or the GM has to let them out.`);}
    // Changing seats in the same vehicle, or hopping from another vehicle.
    const current=seatOf(ot);
    let original={width:ot.width,height:ot.height};
    if(current){
      if(current.vehicleTokenId===vt.id){original=occupants[current.seatId]?.original||original;delete occupants[current.seatId];}
      else{await HANDLERS.exit({sceneId,tokenId,userId,quiet:true});original={width:scene.tokens.get(tokenId).width,height:scene.tokens.get(tokenId).height};}
    }
    occupants[seatId]={tokenId:ot.id,actorId:ot.actor?.id||ot.actorId,name:ot.name,original};
    await saveOccupants(vt,occupants);
    await ot.update({[`flags.${NS}.${SEAT}`]:{vehicleTokenId:vt.id,seatId}},{acVehicleCarry:true});
    await placeOccupants(vt,occupants);
    await syncCrew(vt,occupants);
    await applyDriverControl(vt,occupants);
    Hooks.callAll('smokeBoarded',{vt,ot,seat,user,scene});
    await announce(vt,`<strong>${esc(ot.name)}</strong> ${current?.vehicleTokenId===vt.id?'moves to':'gets in and takes'} the <strong>${esc(seat.label)}</strong> seat.${seat.role==='pilot'?(controlMode(vt)==='ai'?' The vehicle AI keeps control.':' They now drive the vehicle.'):''}`);
    return true;
  },
  /** Everyone out except (optionally) the driver, one at a time so nobody lands on the same square. */
  async exitAll({sceneId,vehicleTokenId,userId,keepDriver=true}){
    const scene=game.scenes.get(sceneId),vt=scene?.tokens.get(vehicleTokenId),user=game.users.get(userId);
    if(!vt)throw new Error('Vehicle not found.');
    if(!user?.isGM&&!vt.actor?.testUserPermission?.(user,'OWNER')){const p=occupantsOf(vt).pilot;const d=p&&scene.tokens.get(p.tokenId);if(!d?.actor?.testUserPermission?.(user,'OWNER'))throw new Error('Only the GM, the vehicle\'s owner or its driver can empty it.');}
    const occ=await reconcileOccupants(vt);const out=[];
    for(const [seatId,o] of Object.entries(occ)){
      if(keepDriver&&seatId==='pilot')continue;
      if(!user?.isGM&&isCagedSeat(vt.actor,seatId))continue;
      const t=scene.tokens.get(o.tokenId);if(!t)continue;
      await performExit(scene,t,{quiet:true});out.push(t.name);
    }
    if(out.length)await announce(vt,`Everyone out: <strong>${out.map(esc).join(', ')}</strong>.${keepDriver&&occ.pilot?' The driver stays at the wheel.':''}`);
    return out.length;
  },
  async exit({sceneId,tokenId,userId,quiet=false}){
    const scene=game.scenes.get(sceneId),ot=scene?.tokens.get(tokenId),user=game.users.get(userId);
    if(!ot)throw new Error('Token not found.');requireUserCanMove(user,ot);
    const seat=seatOf(ot);if(!seat)throw new Error(`${ot.name} is not in a vehicle.`);
    const cageOf=scene.tokens.get(seat.vehicleTokenId);
    if(!user?.isGM&&cageOf&&isCagedSeat(cageOf.actor,seat.seatId))throw new Error(`The cage in ${cageOf.name} is locked from outside. Someone in the front, someone beside the vehicle, or the GM has to let ${ot.name} out.`);
    return performExit(scene,ot,{quiet});
  },
  /** Let a caged rider out: the GM, or a character the user controls who is in a non-caged seat of this vehicle or right beside it. */
  async release({sceneId,vehicleTokenId,tokenId,userId}){
    const scene=game.scenes.get(sceneId),vt=scene?.tokens.get(vehicleTokenId),ot=scene?.tokens.get(tokenId),user=game.users.get(userId);
    if(!vt||!ot)throw new Error('Vehicle or rider not found.');
    const seat=seatOf(ot);if(!seat||seat.vehicleTokenId!==vt.id)throw new Error(`${ot.name} is not in ${vt.name}.`);
    if(!user?.isGM){
      const g=scene.grid.size;
      const helper=scene.tokens.find(t=>t.id!==ot.id&&t.actor?.type!=='vehicle'&&t.actor?.testUserPermission?.(user,'OWNER')&&(()=>{const s=seatOf(t);
        if(s)return s.vehicleTokenId===vt.id&&!isCagedSeat(vt.actor,s.seatId);
        return rectGap(t,vt,g)<=1.01;})());
      if(!helper)throw new Error(`To let ${ot.name} out, one of your characters must be in the front of ${vt.name} or standing beside it.`);
      await performExit(scene,ot,{quiet:true});
      await announce(vt,`<strong>${esc(helper.name)}</strong> opens the cage and lets <strong>${esc(ot.name)}</strong> out.`);
      return true;
    }
    await performExit(scene,ot,{quiet:true});
    await announce(vt,`The cage opens: <strong>${esc(ot.name)}</strong> is let out.`);
    return true;
  },
  async move({sceneId,vehicleTokenId,transform,userId,animate=true,free=false}){
    const user=game.users.get(userId);
    if(!user)throw new Error('Unknown user requested vehicle movement.');
    // The socket sender is not trusted to update arbitrary token properties.
    let validated=pickVehicleTransform(transform);
    free=Boolean(free&&user.isGM);   // only the GM can make a free move (Alt-drag): no gauge, no incidents
    return (async()=>{
      const scene=game.scenes.get(sceneId),vt=scene?.tokens.get(vehicleTokenId);
      if(!vt||!isVehicleToken(vt))throw new Error('Vehicle token not found on this scene.');
      if(!free&&settlingMoves.has(vt.uuid))throw new Error('Wait for the previous driving manoeuvre to finish.');
      if(!user.isGM&&vt.actor.system.vehicle.destroyed)throw new Error('This vehicle is written off.');
      const passengers=await reconcileOccupants(vt);
      if(!user.isGM){
        requireUserCanMove(user,vt);
        if(!['driver','both'].includes(controlMode(vt)))throw new Error('This vehicle is currently controlled by its AI.');
        const pilot=passengers.pilot,driver=pilot&&scene.tokens.get(pilot.tokenId);
        if(!driver?.actor?.testUserPermission?.(user,'OWNER'))throw new Error('Only the seated driver or the GM can move an occupied vehicle.');
      }
      for(const gate of MOVE_GATES){const out=await gate({vt,scene,user,transform:validated,passengers,free});if(out)validated=pickVehicleTransform(out);}
      const g=scene.grid.size,centre=()=>[Number(vt.x)+Number(vt.width)*g/2,Number(vt.y)+Number(vt.height)*g/2],from=centre();
      const changes=planVehicleMove(vt,validated,passengers,g);
      if(!free)settlingMoves.add(vt.uuid);
      try{await scene.updateEmbeddedDocuments('Token',changes,{acVehicleCarry:true,animate:animate!==false});}
      catch(error){if(!free)settlingMoves.delete(vt.uuid);throw error;}
      // Use the committed transform rather than a potentially stale TokenDocument instance.
      const to=[Number(validated.x??vt.x)+Number(validated.width??vt.width)*g/2,Number(validated.y??vt.y)+Number(validated.height??vt.height)*g/2];
      void Promise.resolve().then(async()=>{for(const w of MOVE_WATCHERS){await w({vt:scene.tokens.get(vt.id)??vt,scene,user,from,to,passengers,free});}})
        .catch(error=>{console.warn('The Smoke | after a vehicle move',error);ui.notifications.warn(error.message);})
        .finally(()=>{if(!free)settlingMoves.delete(vt.uuid);});
      return true;
    })();
  },
  async control({sceneId,vehicleTokenId,control,aiPilot,userId}){
    const scene=game.scenes.get(sceneId),vt=scene?.tokens.get(vehicleTokenId),user=game.users.get(userId);
    if(!vt)throw new Error('Vehicle token not found.');if(!user?.isGM)throw new Error('Only the GM sets who controls a vehicle.');
    const update={};if(['driver','ai','both'].includes(control))update['system.vehicle.control']=control;if(typeof aiPilot==='string')update['system.vehicle.aiPilot']=aiPilot.slice(0,80);
    await vt.actor.update(update);await applyDriverControl(vt,occupantsOf(vt));
    const label={driver:'the driver',ai:`its AI${vt.actor.system.vehicle.aiPilot?` (${esc(vt.actor.system.vehicle.aiPilot)})`:''}`,both:'the driver and its AI'}[vt.actor.system.vehicle.control];
    await announce(vt,`Now controlled by ${label}.`);return true;
  }
};

/* ------------------------------------------------------------------ dialogs */
function myTokens(){
  const controlled=canvas?.tokens?.controlled?.map(t=>t.document).filter(t=>!isVehicleToken(t))||[];
  if(controlled.length)return controlled;
  const char=game.user.character;const t=char?canvas?.tokens?.placeables?.find(p=>p.actor?.id===char.id)?.document:null;
  return t?[t]:[];
}
/** Available characters for a right-click on a VEHICLE token, even if selecting
 * the vehicle cleared the player's previously selected character token. */
export function boardingCandidates(vehicleToken,user=game.user){
  const scene=vehicleToken?.parent;
  if(!scene)return [];
  const all=Array.from(scene.tokens?.contents||scene.tokens||[]);
  const grid=scene.grid?.size||100;
  return all.filter(t=>{
    if(!t?.actor||isVehicleToken(t)||t.id===vehicleToken.id)return false;
    if(!user?.isGM&&!t.actor.testUserPermission?.(user,'OWNER'))return false;
    const seated=seatOf(t);
    if(seated&&seated.vehicleTokenId!==vehicleToken.id)return false;
    return user.isGM||seated?.vehicleTokenId===vehicleToken.id||rectGap(t,vehicleToken,grid)<=1.01;
  }).sort((a,b)=>{
    const da=rectGap(a,vehicleToken,grid),db=rectGap(b,vehicleToken,grid);
    return da-db||String(a.name).localeCompare(String(b.name));
  });
}

/** Vehicle-HUD entry point: choose any eligible PC/NPC, then its exact seat.
 * A group can board one at a time without selecting/reselecting tokens on canvas. */
export async function openVehicleBoardDialog(vehicleToken){
  if(!isVehicleToken(vehicleToken))return ui.notifications.warn('Right-click a vehicle token to board.');
  const candidates=boardingCandidates(vehicleToken);
  if(!candidates.length){
    return ui.notifications.warn(game.user.isGM?'There are no character tokens on this scene.':'Move your character next to the vehicle, then right-click the vehicle and select Board.');
  }
  if(candidates.length===1)return openSeatPicker(vehicleToken,candidates[0]);
  const selectedIds=new Set(myTokens().map(t=>t.id));
  const first=candidates.find(t=>selectedIds.has(t.id))||candidates[0];
  const rows=candidates.map(t=>{
    const inside=seatOf(t)?.vehicleTokenId===vehicleToken.id;
    const dist=rectGap(t,vehicleToken,vehicleToken.parent.grid.size);
    return `<label class="smoke-seat-option"><input type="radio" name="tokenId" value="${esc(t.id)}" ${t.id===first.id?'checked':''}><span><b>${esc(t.name)}</b></span><em>${inside?'aboard':dist<=1.01?'next to vehicle':`${dist.toFixed(1)} squares`}</em></label>`;
  });
  const form=await foundry.applications.api.DialogV2.input({window:{title:`${vehicleToken.name}: Who is boarding?`},content:`<p>Choose a character. You will then select their seat.</p><div class="smoke-seat-picker smoke-seat-picker-scroll">${rows.join('')}</div>`,ok:{label:'Choose Seat',icon:'fa-solid fa-chair'}});
  const id=String(form?.tokenId||'');
  const selected=candidates.find(t=>t.id===id);
  if(selected)return openSeatPicker(vehicleToken,selected);
  return null;
}

export async function openSeatPicker(vehicleToken,occupantToken){
  const seats=seatLayout(vehicleToken.actor),occ=occupantsOf(vehicleToken),mine=seatOf(occupantToken);
  const firstFree=(seats.find(s=>occ[s.id]?.tokenId===occupantToken.id)||seats.find(s=>!occ[s.id]))?.id;
  const rows=seats.map(s=>{const o=occ[s.id],own=o?.tokenId===occupantToken.id;return `<label class="smoke-seat-option${o&&!own?' taken':''}"><input type="radio" name="seat" value="${s.id}" ${o&&!own?'disabled':''} ${s.id===firstFree?'checked':''}><span><b>${esc(s.label)}</b>${s.role==='pilot'?` <small>${controlMode(vehicleToken)==='ai'?'AI drives':'drives the vehicle'}</small>`:''}</span><em>${o?esc(own?'you':o.name):'free'}</em></label>`;});
  const free=seats.some(s=>!occ[s.id]||occ[s.id].tokenId===occupantToken.id);
  if(!free)return ui.notifications.warn(`${vehicleToken.name} is full.`);
  const form=await foundry.applications.api.DialogV2.input({window:{title:`${occupantToken.name}: get in ${vehicleToken.name}`},content:`<div class="smoke-seat-picker">${rows.join('')}</div>${mine&&mine.vehicleTokenId===vehicleToken.id?'<p class="hint">Pick another seat to move.</p>':''}`,ok:{label:mine?'Take seat':'Get in',icon:'fa-solid fa-car-side'}});
  if(!form?.seat)return null;
  try{return await boardVehicle(vehicleToken,occupantToken,form.seat);}catch(error){ui.notifications.warn(error.message);}
}
export async function openBoardDialog(occupantToken){
  const vehicles=(canvas?.tokens?.placeables||[]).map(p=>p.document).filter(isVehicleToken);
  if(!vehicles.length)return ui.notifications.info('There are no vehicles on this scene.');
  const g=canvas.grid.size,list=vehicles.map(v=>({v,d:rectGap(occupantToken,v,g)})).sort((a,b)=>a.d-b.d);
  if(list.length===1||list[0].d<=1.01&&(list[1]?.d??99)>1.01)return openSeatPicker(list[0].v,occupantToken);
  const form=await foundry.applications.api.DialogV2.input({window:{title:`${occupantToken.name}: which vehicle?`},content:`<div class="smoke-seat-picker">${list.map(({v,d},i)=>`<label class="smoke-seat-option"><input type="radio" name="vehicle" value="${v.id}" ${i===0?'checked':''}><span><b>${esc(v.name)}</b></span><em>${d<=1.01?'adjacent':`${d.toFixed(1)} squares away`}</em></label>`).join('')}</div>`});
  const v=vehicles.find(x=>x.id===form?.vehicle);return v?openSeatPicker(v,occupantToken):null;
}

/* ------------------------------------------------------------------ hooks */
function hudButton(icon,title,onClick){
  const b=document.createElement('button');b.type='button';b.className='control-icon smoke-vehicle-hud';b.title=title;b.dataset.tooltip=title;b.setAttribute('aria-label',title);b.innerHTML=`<i class="${icon}" inert></i>`;
  b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();Promise.resolve(onClick()).catch(error=>ui.notifications.warn(error.message));});return b;
}
export function installVehicleBoarding(){
  game.socket.on(SOCKET,async payload=>{
    if(!payload?.type?.startsWith?.('acVehicle.')||!isLeader())return;
    const type=payload.type.slice(10);if(!HANDLERS[type])return;
    try{await runQueued(type,payload.data||{});}catch(error){console.warn('The Smoke | vehicle request refused',error);
      const user=game.users.get(payload.data?.userId);
      // a refused drag (not your go, past the red line) is a quick note to that player, not a chat message
      if(type==='move'&&user){game.socket.emit(SOCKET,{type:'smokeWorld.notify',data:{text:error.message,userIds:[user.id],level:'warn'}});return;}
      try{await ChatMessage.implementation.create({speaker:{alias:'Vehicle'},whisper:user?[user.id]:[],content:`<p>${esc(error.message)}</p>`});}catch(_e){}
    }
  });

  // Intercept user/GM vehicle drags BEFORE the original Token write. A single
  // GM-authoritative Scene update then commits the vehicle and ALL riders together.
  // preUpdateToken is synchronous and only runs on the initiating client (Foundry v14).
  Hooks.on('preUpdateToken',(doc,changes,options)=>{
    if(options?.acVehicleCarry||!isVehicleToken(doc))return;
    if(!['x','y','rotation','elevation','width','height'].some(k=>Object.hasOwn(changes,k)))return;
    if(!Object.keys(occupantsOf(doc)).length)return; // empty vehicles move natively
    try{
      const transform=pickVehicleTransform(changes);
      // The GM can hold Alt while dropping to reposition a vehicle freely: no movement gauge, no incidents.
      let free=false;try{free=Boolean(game.user.isGM&&game.keyboard?.isModifierActive?.('Alt'));}catch(_e){}
      // Never call a new document update reentrantly from a preUpdate hook.
      void Promise.resolve().then(()=>moveVehicle(doc,transform,{animate:options?.animate!==false,free})).catch(error=>ui.notifications.warn(error.message));
    }catch(error){ui.notifications.warn(`Vehicle movement rejected: ${error.message}`);}
    return false; // don't make the vehicle move one server message ahead of its passengers
  });
  // Another system module might bypass the originating-client hook. Reconcile
  // such exceptional updates on the GM as a compatibility fallback, not the
  // normal vehicle-movement mechanism.
  Hooks.on('updateToken',(doc,changes,options)=>{
    if(!isLeader()||options?.acVehicleCarry||!isVehicleToken(doc))return;
    if(!['x','y','rotation','elevation','width','height'].some(k=>Object.hasOwn(changes,k)))return;
    const occ=occupantsOf(doc);if(!Object.keys(occ).length)return;
    placeOccupants(doc,occ).catch(error=>console.warn('The Smoke | third-party vehicle sync',error));
  });
  // A seated token cannot wander off on its own.
  Hooks.on('preUpdateToken',(doc,changes,options)=>{
    if(options?.acVehicleCarry||!seatOf(doc))return;
    if(['x','y'].some(k=>k in changes)){ui.notifications.info(`${doc.name} is inside a vehicle. Use Get Out first (token HUD).`);return false;}
  });
  // Vehicle footprint from Size when placed, if still the default 1×1.
  Hooks.on('preCreateToken',(doc,data)=>{
    if(doc.actor?.type!=='vehicle')return;
    if(Number(data.width??doc.width)===1&&Number(data.height??doc.height)===1){const f=vehicleFootprint(doc.actor.system.vehicle.size);doc.updateSource({width:f.width,height:f.height,'texture.fit':'contain',lockRotation:false});}
  });
  Hooks.on('preCreateActor',(doc,data)=>{
    if(doc.type!=='vehicle')return;const w=foundry.utils.getProperty(data,'prototypeToken.width'),h=foundry.utils.getProperty(data,'prototypeToken.height');
    if((w??1)===1&&(h??1)===1){const f=vehicleFootprint(foundry.utils.getProperty(data,'system.vehicle.size')??1);doc.updateSource({'prototypeToken.width':f.width,'prototypeToken.height':f.height,'prototypeToken.texture.fit':'contain','prototypeToken.lockRotation':false});}
  });
  // Clean up when a vehicle or occupant token is deleted.
  Hooks.on('deleteToken',(doc,options)=>{
    // A vehicle with its own (dedicated) actor: once no token anywhere uses that actor, delete it. Map-to-map transit
    // recreates the token first and deletes with acTransit, so a crossing never loses the motor's actor.
    if(isLeader()&&!options?.acTransit&&doc.getFlag?.(NS,'dedicatedVehicle')){const id=doc.actorId;setTimeout(()=>{void removeOrphanDedicatedActor(id);},1500);}
    if(options?.smokeDespawn)return;
    // A map-to-map transit recreates the vehicle and riders on the next scene: leave seats and driver grants alone.
    if(!isLeader()||options?.acTransit)return;const scene=doc.parent;
    if(isVehicleToken(doc)){const occ=occupantsOf(doc);const g=scene.grid.size;let i=0;const updates=[];
      for(const o of Object.values(occ)){const t=scene.tokens.get(o.tokenId);if(!t)continue;updates.push({_id:t.id,x:doc.x+(i%2)*g,y:doc.y+Math.floor(i/2)*g,width:o.original?.width||1,height:o.original?.height||1,rotation:0,[`flags.${NS}.${SEAT}`]:null});i++;}
      if(updates.length)scene.updateEmbeddedDocuments('Token',updates,{acVehicleCarry:true});
      const grant=grantsOf(doc),base=game.actors.get(doc.actorId);if(base&&Object.keys(grant).length)base.update(Object.fromEntries(Object.entries(grant).map(([u,b])=>[`ownership.${u}`,b])));
      return;}
    const seat=seatOf(doc);if(seat){const vt=scene.tokens.get(seat.vehicleTokenId);if(vt){const occ=occupantsOf(vt);delete occ[seat.seatId];saveOccupants(vt,occ).then(()=>syncCrew(vt,occ)).then(()=>applyDriverControl(vt,occ));}}
  });
  // Non-owner player right-clicks are installed by module/interaction/player-context.mjs.
  // They do not grant token ownership or open the editable Foundry HUD.
  // Native v14 Token HUD (right click). V14 uses a real HTMLElement, not jQuery.
  // Register both hooks for compatibility with HUD implementations, and dedupe.
  Hooks.on('renderTokenHUD',renderVehicleHUD);
  Hooks.on('renderApplicationV2',(app,html)=>{
    const hudType=foundry.applications?.hud?.TokenHUD;
    if(hudType?app instanceof hudType:app?.constructor?.name==='TokenHUD')renderVehicleHUD(app,html);
  });

}

async function openReleaseDialog(vt,caged){
  let pick=caged[0];
  if(caged.length>1){
    const form=await foundry.applications.api.DialogV2.input({window:{title:`${vt.name}: open the cage`},content:`<label><span>Let out</span><select name="tokenId">${caged.map(o=>`<option value="${esc(o.tokenId)}">${esc(o.name)}</option>`).join('')}</select></label>`,ok:{label:'Open the cage',icon:'fa-solid fa-unlock'}});
    if(!form?.tokenId)return;pick=caged.find(o=>o.tokenId===form.tokenId);
  }
  const ot=vt.parent.tokens.get(pick.tokenId);if(ot)await releaseFromCage(vt,ot);
}
function renderVehicleHUD(hud,html){
  try{
    const root=html?.querySelector?html:html?.[0]||hud?.element;
    const doc=hud.document??hud.object?.document;
    if(!root||!doc||root.querySelector('.smoke-vehicle-hud'))return;
    const col=root.querySelector('.col.right')||root.querySelector('.col.left')||root.querySelector('.right');
    if(!col)return;
    if(isVehicleToken(doc)){
      // Always render this action. A non-GM player may have lost character
      // selection when they right-clicked the vehicle.
      col.append(hudButton('fa-solid fa-car-side','Board vehicle / choose seat',()=>openVehicleBoardDialog(doc)));
      for(const a of vehicleActions(doc))col.append(hudButton(a.icon,a.title,()=>a.fn(doc)));
      if(game.user.isGM)col.append(hudButton('fa-solid fa-users','Who is inside / control',()=>openVehicleControl(doc)));
      const occNow=occupantsOf(doc),riders=Object.keys(occNow).filter(k=>k!=='pilot').length;
      if(riders&&(game.user.isGM||doc.actor?.isOwner||doc.parent.tokens.get(occNow.pilot?.tokenId)?.actor?.isOwner))col.append(hudButton('fa-solid fa-people-arrows','Everyone out (the driver stays)',()=>exitAllFromVehicle(doc)));
      // Prisoner cage: anyone in the front, anyone standing beside it, or the GM can let a caged rider out.
      const caged=Object.values(occupantsOf(doc)).filter(o=>isCagedSeat(doc.actor,o.seatId)&&doc.parent.tokens.get(o.tokenId));
      if(caged.length)col.append(hudButton('fa-solid fa-unlock','Let someone out of the cage',()=>openReleaseDialog(doc,caged)));
    }else if(seatOf(doc)){
      if(!(game.user.isGM||doc.actor?.isOwner))return;
      col.append(hudButton('fa-solid fa-person-walking-arrow-right','Get out of the vehicle',()=>exitVehicle(doc)));
      const vt=doc.parent?.tokens?.get(seatOf(doc).vehicleTokenId);
      if(vt)col.append(hudButton('fa-solid fa-arrows-rotate','Change seat',()=>openSeatPicker(vt,doc)));
    }else if((canvas?.tokens?.placeables||[]).some(p=>isVehicleToken(p.document))&&doc.actor?.type!=='vehicle'){
      if(game.user.isGM||doc.actor?.isOwner)col.append(hudButton('fa-solid fa-car-side','Get in a vehicle',()=>openBoardDialog(doc)));
    }
  }catch(error){console.warn('The Smoke | vehicle HUD',error);}
}

/** GM: list occupants, eject anyone, set control mode. */
export async function openVehicleControl(vt){
  const seats=seatLayout(vt.actor),occ=occupantsOf(vt),v=vt.actor.system.vehicle;
  const rows=seats.map(s=>`<li><b>${esc(s.label)}</b>: ${occ[s.id]?`${esc(occ[s.id].name)} <label><input type="checkbox" name="eject-${s.id}"> get out</label>`:'<em>free</em>'}</li>`).join('');
  const form=await foundry.applications.api.DialogV2.input({window:{title:`${vt.name}: seats and control`},content:`<ul class="smoke-seat-list">${rows}</ul>
    <label><span>Who drives</span><select name="control"><option value="driver" ${v.control==='driver'?'selected':''}>The player in the Driver seat</option><option value="ai" ${v.control==='ai'?'selected':''}>The vehicle's AI (GM moves it)</option><option value="both" ${v.control==='both'?'selected':''}>Both: driver and AI</option></select></label>
    <label><span>Vehicle AI name (optional)</span><input type="text" name="aiPilot" value="${esc(v.aiPilot||'')}" maxlength="80"></label>`});
  if(!form)return;
  for(const s of seats)if(form[`eject-${s.id}`]&&occ[s.id]){const t=vt.parent.tokens.get(occ[s.id].tokenId);if(t)await exitVehicle(t);}
  if(form.control!==v.control||String(form.aiPilot||'')!==String(v.aiPilot||''))await setVehicleControl(vt,{control:form.control,aiPilot:String(form.aiPilot||'')});
}
/** Everyone has left this vehicle by other means (e.g. walked into a building): clear seats, crew and driver ownership. */
export async function clearOccupants(vt){const occ={};await saveOccupants(vt,occ);await syncCrew(vt,occ);await applyDriverControl(vt,occ);}
export const _handlers=HANDLERS; // for tests
