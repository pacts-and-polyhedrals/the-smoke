// Physical campaign property. A mission prop has one persistent serial per unit. The leader
// GM owns its lifecycle: a visible ground token <-> an actual Item carried by a character
// <-> delivered. Any party member can pick up another party member's dropped property.
// Nothing here grants the player control of GM-owned NPCs or writes arbitrary actor Items.
import {NS} from '../config.mjs';
import {request,registerHandler,isLeader,card,esc,ownersOf} from './net.mjs';
import {missionData,missionState,missionEvent,withMissionState} from './missions.mjs';
import {findOrImportScene,loadAtlas} from '../map/map-transit.mjs';
import {tokenCentre,distanceSquares,zonesOf,mapIdOf} from './spawn.mjs';

const FLAG = 'missionProp', ITEM_FLAG = 'missionCargo';
const ICON = `systems/${NS}/assets/ui/gear.svg`;
const locks = new Map();
function serialise(mid,fn) {
  const previous=locks.get(mid)||Promise.resolve();
  const next=previous.catch(()=>{}).then(fn);
  locks.set(mid,next);
  void next.finally(()=>{if(locks.get(mid)===next)locks.delete(mid);}).catch(()=>{});
  return next;
}
export const serialOf = (prop,index=0) => `${prop.id}:${index+1}`;
export const propDestination = (m,point) => typeof point==='number' ? m.stops?.[point] : typeof point==='string' ? {mapId:point,name:point} : null;
export const propMapId = stop => stop?.placeId || stop?.mapId || null;
export const propUnits = m => (m.props||[]).flatMap(p=>Array.from({length:p.quantity||1},(_,i)=>({serial:serialOf(p,i),prop:p,index:i})));
function findProp(m,serial) { return propUnits(m).find(x=>x.serial===serial) || null; }
function parcelState(s, serial) { return s?.parcels?.[serial] || {status:'world'}; }
function matchRun(token,m,serial,runId) { const flag=token?.getFlag?.(NS,FLAG); return flag?.missionId===m.id && flag?.serial===serial && flag?.runId===runId; }
function cargoItem(actor,mid,serial,runId) { return actor?.items?.find?.(i=>{const f=i.getFlag?.(NS,ITEM_FLAG);return f?.missionId===mid&&f?.serial===serial&&f?.runId===runId;}); }
async function cargoActor() {
  let a=game.actors.find(x=>x.getFlag?.(NS,'missionPropBase')===true);
  if(a) return a;
  return Actor.implementation.create({name:'Mission Property (prop token)', type:'npc', img:ICON, ownership:{default:0},
    prototypeToken:{name:'Mission Property',displayName:20,actorLink:false,width:1,height:1,texture:{src:ICON,fit:'contain'},disposition:0,sight:{enabled:false}},
    flags:{[NS]:{missionPropBase:true}}});
}
function sceneZones(scene,atlas=null) {
  const flag=zonesOf(scene);if(flag.length)return flag;
  const id=mapIdOf(scene);
  const list=[...(atlas?.atlas?.maps||[]),...(atlas?.places?.maps||[]),...(atlas?.venues?.maps||[])];
  return list.find(x=>x.id===id)?.zones||[];
}
function zoneFor(scene,zoneCode,atlas=null) {
  const zones=sceneZones(scene,atlas);
  const chosen=zoneCode ? zones.find(z=>z.code===zoneCode||z.id===zoneCode) : null;
  return chosen || zones.find(z=>z.kind==='room'&&z.use==='storage') || zones.find(z=>z.kind==='room') || zones.find(z=>z.kind==='land') || zones[0] || null;
}
function pointAt(scene,zoneCode,atlas=null,offset=0) {
  const z=zoneFor(scene,zoneCode,atlas);const g=scene.grid?.size||100;
  if(!z)return {x:Math.round(scene.width/2),y:Math.round(scene.height/2)};
  const [x,y,w,h]=z.rect;
  const cx=x+w/2 + (offset%3-1)*Math.min(g,w/5),cy=y+h/2+Math.floor(offset/3)*Math.min(g,h/5);
  return {x:Math.min(Math.max(x+g/2,cx),x+w-g/2),y:Math.min(Math.max(y+g/2,cy),y+h-g/2)};
}
async function placeGround(m,p,serial,s,scene,{at=null}={}) {
  const actor=await cargoActor(), pos=at||pointAt(scene,p.pickupZone,await loadAtlas(),Number(serial.split(':')[1])-1);
  const proto=(await actor.getTokenDocument({},{parent:scene})).toObject(),g=scene.grid?.size||100;
  const runId=s.runId;
  delete proto._id;
  proto.name=p.name;proto.x=Math.round(pos.x-g/2);proto.y=Math.round(pos.y-g/2);
  proto.width=1;proto.height=1;proto.hidden=false;proto.actorLink=false;
  proto.texture={...(proto.texture||{}),src:ICON,fit:'contain'};
  proto.flags ??= {};proto.flags[NS]={...(proto.flags[NS]||{}),[FLAG]:{missionId:m.id,serial,runId}};
  const [created]=await scene.createEmbeddedDocuments('Token',[proto],{smokeMissionProps:true});
  return created;
}
/** Leader: materialize missing mission property on the actual destination scenes. Never
 * re-create held or delivered property; only repair the ground item for the active run. */
export async function ensureMissionProps(m) {
  if(!isLeader() || !(m.props||[]).length)return;
  return serialise(m.id,async()=>{
    const state=missionState(),s=state[m.id];if(s?.status!=='active')return;
    const atlas=await loadAtlas();
    let changed=false; s.parcels ??= {};
    if (!s.runId) {s.runId=foundry.utils.randomID(12);changed=true;}
    for(const {serial,prop,index} of propUnits(m)){
      const p=s.parcels[serial];
      if(p?.status==='delivered')continue;
      if(p?.status==='held'){
        // Repair real cargo inventory if it was accidentally deleted by a player or an old update.
        const holder=game.actors.get(p.actorId);
        if(holder && !cargoItem(holder,m.id,serial,s.runId)) {
          await holder.createEmbeddedDocuments('Item',[itemData(m,prop,serial,s)]);
          console.warn(`The Smoke | Restored missing ${m.id} ${serial} to ${holder.name}`);
        }
        continue;
      }
      const pickup=propDestination(m,prop.pickup),id=propMapId(pickup);
      if(!id) {console.warn(`The Smoke | ${m.id} ${serial} has no pickup map`);continue;}
      try{
        const scene=p?.sceneId?game.scenes.get(p.sceneId)||await findOrImportScene(id):await findOrImportScene(id);
        const seen=scene.tokens?.find?.(t=>matchRun(t,m,serial,s.runId));
        if(seen){if(p?.tokenId!==seen.id || p?.sceneId!==scene.id){s.parcels[serial]={status:'world',sceneId:scene.id,tokenId:seen.id};changed=true;}continue;}
        const created=await placeGround(m,prop,serial,s,scene,{at:p?.at??null});
        s.parcels[serial]={status:'world',sceneId:scene.id,tokenId:created.id};changed=true;
      }catch(error){console.warn(`The Smoke | Unable to place ${m.id} ${serial}`,error);}
    }
    // merge just this run's cargo into a fresh copy of the state (other missions may have moved meanwhile)
    if(changed)await withMissionState(st=>{if(st[m.id]?.status!=='active')return;st[m.id]={...st[m.id],runId:st[m.id].runId??s.runId,parcels:{...(st[m.id].parcels||{}),...s.parcels}};});
  });
}
function findActorAndToken(scene,actorId,user,participants){
  const actor=game.actors.get(actorId);
  if(!actor || actor.type!=='character' || !participants.includes(actor.id) || !user || (!user.isGM && !actor.testUserPermission?.(user,'OWNER')))throw new Error('This character is not participating in this mission.');
  const token=scene.tokens.find(t=>t.actor?.id===actor.id || t.actorId===actor.id);
  if(!token)throw new Error(`${actor.name} must be on this map.`);
  return {actor,token};
}
function requiredNear(token,other,reach=2.4){if(distanceSquares(token,other)>reach)throw new Error('Stand next to the property to collect it.');}
function inDeliveryArea(scene,token,p,m){
  const dest=propDestination(m,p.delivery);if(!dest || mapIdOf(scene)!==propMapId(dest))return false;
  const zoneCode=p.deliveryZone;
  if(!zoneCode)return true;
  const zone=zoneFor(scene,zoneCode);
  if(!zone || zone.code!==zoneCode&&zone.id!==zoneCode)return false;
  const [x,y,w,h]=zone.rect,[cx,cy]=tokenCentre(token),g=scene.grid?.size||100;
  return Math.hypot(Math.max(x-cx,0,cx-(x+w)),Math.max(y-cy,0,cy-(y+h)))<=g*1.15;
}
function itemData(m,p,serial,s){return {name:p.name,type:'gear',img:ICON,system:{quantity:1,value:0,description:`<p>${esc(p.description||'Campaign cargo')}</p><p><b>${esc(m.code||m.id)} ${esc(m.title)}</b>. Use this item to drop it or deliver it.</p>`},flags:{[NS]:{[ITEM_FLAG]:{missionId:m.id,serial,runId:s.runId}}}};}
async function partyCard(m,actor,headline,description){
 const participants=missionState()[m.id]?.actorIds||[];
 const whispers=[...new Set([...participants.flatMap(id=>ownersOf(game.actors.get(id))),...game.users.filter(u=>u.isGM).map(u=>u.id)])];
 await card('MISSION PROPERTY',headline,`<p>${esc(actor.name)} ${esc(description)}.</p>`,'mission',{whisper:whispers});
}
async function moveParcel({missionId,serial,action,actorId,sceneId,tokenId,userId}) {
 const data=await missionData(),m=data.missions.find(v=>v.id===missionId),unit=m&&findProp(m,serial),user=game.users.get(userId);
 if(!unit)throw new Error('Not a mission property.');
 return serialise(m.id,async()=>{
  const state=missionState(),s=state[m.id];if(s?.status!=='active')throw new Error('That mission is not active.');
  const p=unit.prop,ps=parcelState(s,serial),scene=game.scenes.get(sceneId);
  if(!scene||!user)throw new Error('The scene or player is missing.');
  const {actor,token}=findActorAndToken(scene,actorId,user,s.actorIds||[]);
  if(action==='collect'){
   if(ps.status!=='world'||ps.sceneId!==scene.id||ps.tokenId!==tokenId)throw new Error('That parcel is not on this map anymore.');
   const ground=scene.tokens.get(tokenId);
   if(!ground||!matchRun(ground,m,serial,s.runId))throw new Error('The property has been moved or collected.');
   requiredNear(token,ground);
   const [item]=await actor.createEmbeddedDocuments('Item',[itemData(m,p,serial,s)]);
   try {await scene.deleteEmbeddedDocuments('Token',[ground.id],{smokeMissionProps:true});}
   catch(e){await item.delete();throw e;}
   ps.status='held';ps.actorId=actor.id;ps.sceneId=null;ps.tokenId=null;delete ps.at;
  }else if(action==='drop'){
   if(ps.status!=='held'||ps.actorId!==actor.id)throw new Error('You are not carrying this parcel.');
   const item=cargoItem(actor,m.id,serial,s.runId);if(!item)throw new Error('Mission cargo item missing from your sheet. Ask the GM to recover it.');
   const [x,y]=tokenCentre(token);
   const ground=await placeGround(m,p,serial,s,scene,{at:{x,y}});
   try {await item.delete();}
   catch(e){await scene.deleteEmbeddedDocuments('Token',[ground.id],{smokeMissionProps:true});throw e;}
   ps.status='world';ps.actorId=null;ps.sceneId=scene.id;ps.tokenId=ground.id;ps.at={x,y};
  }else if(action==='deliver'){
   if(ps.status!=='held'||ps.actorId!==actor.id)throw new Error('You must physically collect this parcel first.');
   if(!inDeliveryArea(scene,token,p,m)){
    const dest=propDestination(m,p.delivery);
    throw new Error(`Deliver ${p.name} at ${dest?.name||dest?.mapId||'the mission destination'}${p.deliveryZone?` (${p.deliveryZone})`:''}. You must be in the correct mapped area.`);
   }
   const item=cargoItem(actor,m.id,serial,s.runId);if(!item)throw new Error('Mission cargo item missing from your sheet. Ask the GM to recover it.');
   await item.delete();ps.status='delivered';ps.actorId=actor.id;ps.sceneId=scene.id;ps.tokenId=null;
  }else throw new Error('Unknown mission cargo action.');
  s.parcels={...(s.parcels||{}),[serial]:ps};
  await withMissionState(st=>{if(!st[m.id])return;st[m.id]={...st[m.id],parcels:{...(st[m.id].parcels||{}),[serial]:ps}};});
  await partyCard(m,actor,`${p.name} · ${action}`,`${action==='collect'?'collected':action==='drop'?'dropped':'delivered'} ${p.name}`);
  if(action==='collect'||action==='deliver'){
   try {await missionEvent({on:action==='collect'?'cargoCollected':'cargoDelivered',propId:p.id,actorId:actor.id});}
   catch(e){console.error('The Smoke | objective update after cargo change',e);ui.notifications.warn('Cargo moved, but its objective could not update. The GM can review Mission Board.');}
  }
  return {status:ps.status,missionId:m.id,serial};
 });
}
registerHandler('missionProp.move',moveParcel);
registerHandler('missionProp.respawn',async({missionId,userId})=>{
 if(!game.users.get(userId)?.isGM)throw new Error('Only a GM can repair mission cargo.');
 const m=(await missionData()).missions.find(x=>x.id===missionId);if(!m)throw new Error('Unknown mission.');
 await ensureMissionProps(m);return true;
});
export function moveCargo(action,{missionId,serial,actorId,sceneId,tokenId=null}){return request('missionProp.move',{action,missionId,serial,actorId,sceneId,tokenId});}
export async function collectParcelToken(doc){
 const info=doc?.getFlag?.(NS,FLAG);if(!info)return;
 const m=(await missionData()).missions.find(x=>x.id===info.missionId);if(!m)return;
 const s=missionState()[m.id];const candidates=(doc.parent.tokens?.contents||Array.from(doc.parent.tokens||[])).filter(t=>t.actor?.type==='character' && (game.user.isGM||t.actor.testUserPermission?.(game.user,'OWNER'))&& (s?.actorIds||[]).includes(t.actor.id)&&distanceSquares(t,doc)<=2.4);
 if(!candidates.length)throw new Error('Stand next to the parcel with a character on this mission.');
 let token=candidates[0];
 if(candidates.length>1){const opt=await foundry.applications.api.DialogV2.input({window:{title:'Who collects this property?'},content:`<select name="actor">${candidates.map(t=>`<option value="${esc(t.actor.id)}">${esc(t.name)}</option>`).join('')}</select>`});token=candidates.find(t=>t.actor.id===opt?.actor)||token;}
 return moveCargo('collect',{missionId:m.id,serial:info.serial,actorId:token.actor.id,sceneId:doc.parent.id,tokenId:doc.id});
}
export function describeParcel(doc){const info=doc?.getFlag?.(NS,FLAG);return info?`Mission property: ${info.missionId}, ${info.serial}. Right-click → Collect. It becomes a real inventory item. You may drop it and collect it again.`:'';}
export async function useMissionCargo(item) {
 const info=item?.getFlag?.(NS,ITEM_FLAG);if(!info)return false;
 const scene=canvas?.scene,actor=item.parent;if(!scene||!actor)throw new Error('Open the map with the character carrying this mission item.');
 const who=scene.tokens.find(t=>t.actor?.id===actor.id);
 if(!who)throw new Error(`${actor.name} must be present on this map to drop or deliver this item.`);
 const action=await foundry.applications.api.DialogV2.wait({window:{title:item.name},content:`<p>${item.system.description||''}</p><p>Drop it on this map for another character to pick up, or deliver it at the job's designated venue.</p>`,buttons:[{action:'deliver',label:'Deliver / hand over',icon:'fa-solid fa-handshake'},{action:'drop',label:'Drop on ground',icon:'fa-solid fa-box-open'}]});
 if(!['deliver','drop'].includes(action))return;
 return moveCargo(action,{missionId:info.missionId,serial:info.serial,actorId:actor.id,sceneId:scene.id});
}
export async function installMissionProps(){
 if(!isLeader())return;
 const data=await missionData();
 for(const m of data.missions)if(m.props?.length&&missionState()[m.id]?.status==='active')
  await ensureMissionProps(m).catch(e=>console.warn('The Smoke | restoring mission property',m.id,e));
 Hooks.on('createScene',scene=>{
  const active=missionState(),id=mapIdOf(scene);
  for(const m of data.missions)if(active[m.id]?.status==='active'&&m.props?.some(p=>propMapId(propDestination(m,p.pickup))===id))
   void ensureMissionProps(m).catch(e=>console.warn('The Smoke | props created scene',e));
 });
}
export const propsAPI = {collect:collectParcelToken,move:moveCargo,repair:missionId=>request('missionProp.respawn',{missionId}),use:useMissionCargo};
/** Remove a cancelled/failed run's property, but do not delete a player's unrelated gear. */
export async function cleanupMissionProps(m,s) {
 for(const {serial} of propUnits(m)){
  const ps=s.parcels?.[serial];if(!ps)continue;
  if(ps.status==='world'){
   const scene=game.scenes.get(ps.sceneId),token=scene?.tokens?.get(ps.tokenId);
   if(token&&matchRun(token,m,serial,s.runId))await scene.deleteEmbeddedDocuments('Token',[token.id],{smokeMissionProps:true});
  }else if(ps.status==='held'){
   const actor=game.actors.get(ps.actorId),item=cargoItem(actor,m.id,serial,s.runId);
   if(item)await item.delete();
  }
 }
}
