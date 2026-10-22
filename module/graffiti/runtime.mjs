// THE SMOKE — persistent paint spots, map decals, territory and GM-authorised tagging.
// Live tile assets are uploaded to Foundry's system persistent storage, NOT the package directory.
// Every world mutation is handled once on the active GM through module/world/net.mjs.
import {NS} from '../config.mjs';
import {registerHandler,request,isLeader,card,esc} from '../world/net.mjs';
import {mapIdOf,ensureVehicleActor,placeToken} from '../world/spawn.mjs';
import {watchSeconds} from '../rules/watch-clock.mjs';
import {QUALITY,QUALITY_LABEL,QUALITY_SCORE,qualityAtLeast,tagMinutes,witnessedTag,rectDistanceSquares,territoryForMarks,computeTileGeometry} from './core.mjs';
import {buildSvg,sanitiseTagDesign,QUALITY_PRESETS} from '../apps/tag-studio.mjs';
import {missionEvent,missionState,missionData,standing,factionState} from '../world/missions.mjs';
import {nextAutoSpotName,inferredMissionSite,vehicleSurface,isPublicTransportVehicle} from './auto-sites.mjs';
import {activePaintTargets,missionPaintPosition,parkedAlong} from './mission-placements.mjs';
import {paintShortfall} from './paint-choices.mjs';
import {findOrImportScene,loadAtlas} from '../map/map-transit.mjs';

const RECORD_KEY='graffitiRecords',TERRITORY_KEY='graffitiTerritory';
const canOwn=(a,u)=>u?.isGM||a?.testUserPermission?.(u,'OWNER');
let CATALOGUE=null;
export async function taggingCatalogue(){
  if(CATALOGUE)return CATALOGUE;
  const res=await fetch(`systems/${NS}/data/tagging-catalogue.json`);
  if(!res.ok)throw new Error('Tagging catalogue not found in the installed system.');
  CATALOGUE=await res.json();return CATALOGUE;
}
export const tagRecords=scene=>Array.isArray(scene?.getFlag?.(NS,RECORD_KEY))?scene.getFlag(NS,RECORD_KEY):[];
export const tagTerritory=()=>{try{return game.settings.get(NS,TERRITORY_KEY)||{};}catch(_){return {};}};
export function registerGraffitiSettings(){
  game.settings.register(NS,TERRITORY_KEY,{scope:'world',config:false,type:Object,default:{},onChange:()=>Hooks.callAll('smokeGraffitiChanged')});
}
function sceneSpotToken(scene,spotTokenId){
  const token=scene?.tokens?.get?.(spotTokenId);if(!token)throw new Error('That paint spot is no longer on this map.');
  // Public transport can be tagged by right-click without needing an extra marker
  // or a GM manually assigning a mission location. The unique token document ID
  // is the paintable site's stable key for this scene.
  const autoSurface=vehicleSurface(token);
  const spec=token.getFlag(NS,'tagSpot') || (autoSurface ? {
    siteId:`STREET-${scene.id}-${token.id}`,surface:autoSurface,auto:true,root:token.name||'Transport',number:1,vehicle:true
  } : null);
  if(!spec?.siteId)throw new Error('That is not a paintable surface. Drop a Paintable Surface token on the map first.');
  return {token,spec};
}
function paintingActor(scene,actorId,user){
  const actor=game.actors.get(actorId);
  if(actor?.type!=='character'||!canOwn(actor,user))throw new Error('Paint using your own character.');
  const token=scene.tokens.find(t=>t.actorId===actor.id && !t.hidden && !t.getFlag(NS,'vehicleSeat'));
  if(!token)throw new Error('Your character must be standing on this map, outside a vehicle, to tag.');
  return {actor,token};
}
function nearAndReady(a,spot,scene){
  const d=rectDistanceSquares(a,spot,scene.grid?.size||100);
  if(d>1.6)throw new Error(`Get alongside the paint spot before spraying (${d.toFixed(1)} squares away).`);
}
export function bandForTagSite({surface='wall',approved=false}={}){
  if(approved)return 'easy';
  return ['train','bus','bridge','overpass'].includes(surface)?'hard':'medium';
}
export function markCan(gear){
  if(!gear||gear.type!=='gear'||gear.name!=='Spray Paint'||Number(gear.system?.quantity??1)<1)return null;
  const charges=gear.getFlag(NS,'spray');
  return {capacity:6,remainingCharges:Number.isInteger(charges?.remainingCharges)?charges.remainingCharges:6};
}
function equippedCan(actor){
  const can=actor.items.find(x=>x.type==='gear'&&x.name==='Spray Paint'&&Number(x.system.quantity||0)>=1&&markCan(x)?.remainingCharges>0);
  if(!can)throw new Error('You need a Spray Paint gear item with paint left. Buy one from a shop.');
  return can;
}
async function spendCan(can,attemptId){
  const current=markCan(can);if(!current||current.remainingCharges<1)throw new Error('No paint left.');
  if(current.remainingCharges>1){
    await can.setFlag(NS,'spray',{v:1,capacity:6,remainingCharges:current.remainingCharges-1,lastAttemptId:attemptId});
  } else if(Number(can.system.quantity||0)>1) {
    // Stacked new cans are distinct; finishing the first opens the next with a full six charges.
    await can.update({'system.quantity':Number(can.system.quantity)-1});
    await can.setFlag(NS,'spray',{v:1,capacity:6,remainingCharges:6,lastAttemptId:attemptId});
  } else await can.delete();
}
function spotVisibleToPlayer(doc,user){return !!(doc?.actor&&!doc.hidden&&doc.actor.type!=='character'&&(!user||user.isGM||doc.parent?.id===canvas?.scene?.id));}
export function publicSpotSummary(scene){
  return [...(scene?.tokens||[])].filter(t=>!t.hidden && (t.getFlag(NS,'tagSpot') || isPublicTransportVehicle(t)))
    .map(t=>({...sceneSpotToken(scene,t.id).spec,tokenId:t.id,name:t.name}));
}
/** Active commissions a character is on that this surface counts for. (0.5.23: it read a field nothing ever wrote.) */
export async function missionForSpot(scene,spotTokenId,actorId){
  const {spec}=sceneSpotToken(scene,spotTokenId),cat=await taggingCatalogue(),st=missionState();
  return (await missionData()).missions.filter(m=>m.tagging&&st[m.id]?.status==='active'&&st[m.id].actorIds?.includes(actorId)&&inferredMissionSite(cat,m,spec,mapIdOf(scene))).map(m=>m.id);
}
function authorisedTagIdentity(identity,user,mission,cat){
  const tags=cat.tagPacks||[];
  if(identity==='TAG-STREET')return true;
  const pack=tags.find(p=>p.id===identity);if(!pack)return false;
  if(user?.isGM)return true;
  const gate=pack.unlock||{};
  const done=gate.completeMissionId && missionState()[gate.completeMissionId]?.status==='done';
  const renown=standing(factionState(),pack.faction).renown;
  // An active faction commission itself counts as sponsor permission after its prerequisites have unlocked it.
  return Boolean(done||renown>=Number(gate.minimumRenown||1)||mission?.faction===pack.faction);
}
function validateMissionPainting(m,missionId,actorId,siteId,identity){
  if(!missionId)return null;
  const state=missionState()[missionId];
  if(!m||!m.tagging||state?.status!=='active')throw new Error('That tagging commission is not active.');
  if(!state.actorIds?.includes(actorId))throw new Error('You are not part of that commission.');
  if(!m.tagging.sites.includes(siteId))throw new Error('This surface is not in the selected commission.');
  if(m.tagging.identity!=='ANY_UNLOCKED'&&m.tagging.identity!==identity)throw new Error(`This job requires the ${m.tagging.identity} tag.`);
  return state;
}
function verifiedRoll(msg,{attemptId,sceneId,spotTokenId,actorId,userId},band){
  const roll=msg?.getFlag?.(NS,'roll');
  const ctx=roll?.context;
  if(!roll||ctx?.kind!=='tagPaint'||ctx.attemptId!==attemptId||ctx.sceneId!==sceneId||ctx.spotTokenId!==spotTokenId||ctx.actorId!==actorId)
    throw new Error('The Graft roll does not belong to this exact paint attempt.');
  if(roll.actorUuid!==game.actors.get(actorId)?.uuid||roll.userId!==userId||roll.stat!=='grf'||roll.band!==band||!QUALITY.includes(roll.outcomeKey))
    throw new Error('Roll authorisation or difficulty mismatch. Reopen Tag Studio and roll Graft.');
  if(msg.getFlag(NS,'tagConsumed'))throw new Error('This paint roll was already used.');
  return roll;
}
function validDesignFromUser(input,outcome,blinder=0){
  // Never accept raw client-provided SVG or external URLs. Regenerate trusted geometry on the GM.
  const clean=sanitiseTagDesign(input);
  clean.quality=outcome;
  clean.blinder=blinder;
  clean.extras={...QUALITY_PRESETS[outcome].extras};
  clean.background='transparent';
  return clean;
}
function scoreForMark(mark){return QUALITY_SCORE[mark.outcomeKey]||0;}
function tilePosition(spot,scene){return computeTileGeometry(spot,scene,{vehicle:spot.actor?.type==='vehicle'});}
async function assetUpload(svg,attemptId){
  const fileName=`smoke-tag-${attemptId}.svg`,file=new File([svg],fileName,{type:'image/svg+xml'});
  const FP=foundry?.applications?.apps?.FilePicker??globalThis.FilePicker;
  if(!FP)throw new Error('Foundry FilePicker is not available for saving the decal.');
  if(typeof FP.uploadPersistent==='function'){
    const result=await FP.uploadPersistent(NS,'graffiti',file,{}, {notify:false});
    if(result?.path||result?.url)return result.path||result.url;
  }
  // Older hosts: user data path under the world folder. Never write to the read-only system package.
  const folder=`worlds/${game.world?.id||'world'}/smoke-graffiti`;
  if(typeof FP.createDirectory==='function')await FP.createDirectory('data',folder).catch(()=>null);
  const saved=await FP.upload('data',folder,file,{}, {notify:false});
  if(!saved?.path&&!saved?.url)throw new Error('Foundry rejected the SVG upload. Check Forge file permissions and free storage.');
  return saved.path||saved.url;
}
async function syncTerritory(scene,records){
  const old=tagTerritory(),mapId=mapIdOf(scene)||scene.id;
  const map= {...old,[mapId]:territoryForMarks(records)};
  await game.settings.set(NS,TERRITORY_KEY,map);
  return map[mapId];
}
function policeWitness(scene,spot){
  const g=scene.grid?.size||100;
  for(const t of scene.tokens){
    const police=t.getFlag(NS,'police');if(!police||t.hidden)continue;
    const d=rectDistanceSquares(t,spot,g);
    if(d <= (police.unit==='heli' ? (spot.getFlag(NS,'indoors') ? 0 : 22) : 10))return true;
  }
  return false;
}
async function addTaggedTile(scene,spot,mark){
  const geometry=tilePosition(spot,scene);
  const [tile]=await scene.createEmbeddedDocuments('Tile',[{
    name:`Smoke graffiti · ${mark.identity}`,...geometry,alpha:1,locked:true,hidden:false,overhead:false,occlusion:{mode:0},
    texture:{src:mark.assetPath,scaleX:1,scaleY:1},
    flags:{[NS]:{graffiti:{markId:mark.markId,siteId:mark.siteId,spotTokenId:spot.id,attachedTokenId:spot.actor?.type==='vehicle'?spot.id:null}}}
  }]);
  return tile;
}
export async function repaintMissing(scene){
  if(!isLeader())return 0;
  let count=0,records=foundry.utils.deepClone(tagRecords(scene));
  for(const mark of records){
    if(mark.status!=='visible'||!mark.assetPath)continue;
    if(mark.tileId&&scene.tiles.get(mark.tileId))continue;
    const spot=scene.tokens.get(mark.spotTokenId);if(!spot)continue;
    const tile=await addTaggedTile(scene,spot,mark);
    mark.tileId=tile.id;count++;
  }
  if(count)await scene.setFlag(NS,RECORD_KEY,records);
  return count;
}
async function paintOnLeader({sceneId,spotTokenId,actorId,rollMessageId,attemptId,tagPackId='TAG-STREET',missionId=null,design={},userId}){
  const user=game.users.get(userId),scene=game.scenes.get(sceneId);
  if(!user||!scene)throw new Error('Unknown player or scene.');
  if(!/^[a-zA-Z0-9_-]{8,64}$/.test(String(attemptId||'')))throw new Error('Invalid paint attempt ID.');
  const records=foundry.utils.deepClone(tagRecords(scene));
  const existing=records.find(r=>r.attemptId===attemptId);
  if(existing){if(existing.creatorActorId!==actorId)throw new Error('This attempt belongs to another character.');return {markId:existing.markId,alreadyPainted:true,quality:existing.outcomeKey,assetPath:existing.assetPath};}
  const {token:spot,spec}=sceneSpotToken(scene,spotTokenId),{actor,token}=paintingActor(scene,actorId,user);
  if(spot.hidden&&!user.isGM)throw new Error('That paint spot is not on the map yet.');   // a GM-hidden surface can't be tagged by id
  nearAndReady(token,spot,scene);
  const cat=await taggingCatalogue(),site=cat.sites.find(x=>x.id===spec.siteId);
  if(site && site.sceneMapId!==mapIdOf(scene))throw new Error('That named mission site belongs to another map.');
  if(!site && !spec.auto)throw new Error('This paintable marker has an invalid site identity.');
  const allowedSurface=spec.surface||site?.surface||'wall';
  const band=bandForTagSite({surface:allowedSurface,approved:spec.approved===true});
  const msg=game.messages.get(rollMessageId),roll=verifiedRoll(msg,{attemptId,sceneId,spotTokenId,actorId,userId},band);
  const mission=missionId?(await missionData()).missions.find(m=>m.id===missionId):null;
  const creditSiteId=missionId ? inferredMissionSite(cat,mission,spec,mapIdOf(scene)) : null;
  if(missionId && !creditSiteId)throw new Error('This wall does not match the named street/location for that commission. You can still paint it for crew territory without selecting a mission.');
  validateMissionPainting(mission,missionId,actorId,creditSiteId||spec.siteId,tagPackId);
  if(!authorisedTagIdentity(tagPackId,user,mission,cat))throw new Error('That faction tag is locked. Complete its introduction first.');
  const can=equippedCan(actor);
  const blinder={ordinary:0,niceOne:1,blinder:2,absoluteScenes:3,frontPage:4}[roll.blinder]??0;
  const clean=validDesignFromUser(design,roll.outcomeKey,blinder);
  if(tagPackId!=='TAG-STREET') clean.text=cat.tagPacks.find(p=>p.id===tagPackId).title.slice(0,18); // no spoofing a sponsor with unrelated lettering
  const svg=buildSvg(clean);
  if(!svg.startsWith('<svg')||svg.length>100_000)throw new Error('SVG validation failed.');
  // Perform asset and tile writes before charging the player; absent files don't become mission proof.
  const filePath=await assetUpload(svg,attemptId);
  const oldVisible=records.filter(m=>m.status==='visible'&&m.siteId===spec.siteId);
  const oldForActor=records.some(m=>m.siteId===spec.siteId && m.creatorActorId===actorId);
  const mark={markId:foundry.utils.randomID(16),attemptId,sceneId,sceneMapId:mapIdOf(scene),spotTokenId,siteId:spec.siteId,
    identity:tagPackId,faction:tagPackId==='TAG-STREET'?'CREW':tagPackId.slice(4),
    creatorActorId:actorId,creatorName:actor.name,missionId:missionId||null,creditedSiteId:creditSiteId||null,missionRunId:mission?missionState()[missionId]?.runId:null,
    outcomeKey:roll.outcomeKey,quality:QUALITY.indexOf(roll.outcomeKey),assetPath:filePath,rollMessageId,
    createdAtWorldSeconds:watchSeconds(),approved:Boolean(spec.approved),witnessed:false,status:'visible',coveredMarkIds:oldVisible.map(m=>m.markId),tileId:null};
  const tile=await addTaggedTile(scene,spot,mark);
  mark.tileId=tile.id;
  for(const prev of records)if(oldVisible.some(r=>r.markId===prev.markId))prev.status='covered';
  const revised=[...records.filter(m=>m.status==='visible'),...records.filter(m=>m.status!=='visible').slice(-400),mark]; // never prune active marks
  try{await scene.setFlag(NS,RECORD_KEY,revised);}catch(error){
    await scene.deleteEmbeddedDocuments('Tile',[tile.id]).catch(()=>null);
    throw error;
  }
  // From this point the mark is durable and a repeat attempt must not create a second tile/reward.
  try {await msg.setFlag(NS,'tagConsumed',mark.markId);}catch(err){console.warn('The Smoke | marking graffiti roll consumed',err);}
  try {await spendCan(can,attemptId);}catch(err){console.error('The Smoke | failed to consume paint; GM review required',err);}
  for(const previous of oldVisible)if(previous.tileId && previous.tileId!==tile.id && scene.tiles.get(previous.tileId))await scene.deleteEmbeddedDocuments('Tile',[previous.tileId]).catch(e=>console.warn('The Smoke | old graffiti decal cleanup',e));
  if(spot.actor?.type==='vehicle')await spot.setFlag(NS,'graffitiCarry',{markId:mark.markId,siteId:mark.siteId,identity:mark.identity,assetPath:mark.assetPath,
    creatorActorId:mark.creatorActorId,creatorName:mark.creatorName,outcomeKey:mark.outcomeKey,quality:mark.quality,
    createdAtWorldSeconds:mark.createdAtWorldSeconds,approved:mark.approved}).catch(e=>console.warn('The Smoke | vehicle decal binding',e));
  const factionScores=await syncTerritory(scene,revised).catch(error=>{console.warn('The Smoke | territory update',error);return territoryForMarks(revised);});
  const watched=policeWitness(scene,spot),sense=witnessedTag({approved:Boolean(spec.approved),policeNear:watched,crowded:Boolean(spec.crowded),exposed:Boolean(spec.exposed)});
  mark.witnessed=sense.witnessed;
  if(sense.witnessed){
    await scene.setFlag(NS,RECORD_KEY,revised);
    await actor.reportCrime('graffiti',{witnessed:true,byPolice:sense.byPolice}).catch(e=>console.warn('The Smoke | graffiti Heat review required',e));
  }
  const repGain= !oldForActor && qualityAtLeast(roll.outcomeKey,'strongSuccess') ? 1 : 0;
  if(repGain)await actor.update({'system.rep.street':Number(actor.system.rep?.street||0)+repGain}).catch(e=>console.warn('The Smoke | graffiti Rep review required',e));
  // The Banana Watch advances exactly once on the leader, even if a player reconnects/retries.
  const minutes=tagMinutes(roll.outcomeKey,allowedSurface);
  if(typeof game.time?.advance==='function')await game.time.advance(minutes*60).catch(e=>console.warn('The Smoke | Banana Watch advance review required',e));
  // 0.5.23: say why a paint didn't count (too rough, wrong tag, site already done, not on the job) instead of nothing
  let note='';
  if(missionId){
    const ev={on:'tagPlaced',missionId,markId:mark.markId,siteId:creditSiteId||mark.siteId,identity:tagPackId,sceneMapId:mark.sceneMapId,actorId,outcomeKey:mark.outcomeKey,missionRunId:mark.missionRunId};
    const moved=await missionEvent(ev).catch(e=>{console.warn('The Smoke | graffiti mission proof review required',e);return null;});
    if(Array.isArray(moved)&&!moved.includes(missionId)){const why=paintShortfall(mission,missionState()[missionId],ev,cat.tagPacks);if(why)note=`Doesn't count yet: ${why}`;}
  }else{
    const st=missionState(),jobs=(await missionData()).missions.filter(m=>m.tagging&&st[m.id]?.status==='active'&&inferredMissionSite(cat,m,spec,mapIdOf(scene)));
    const mine=jobs.filter(m=>st[m.id].actorIds?.includes(actorId)),theirs=jobs.filter(m=>!st[m.id].actorIds?.includes(actorId));
    if(mine.length)note=`Painted as free paint, so it doesn't count for ${mine.map(m=>m.code).join(', ')}. Pick the commission in Tag Studio and paint over it.`;
    else if(theirs.length)note=`${actor.name} isn't on ${theirs.map(m=>m.code).join(', ')}, so it only counts for territory. Add them to the job on the Mission Board.`;
  }
  await card('SPRAYED THE CITY',`${actor.name}: ${QUALITY_LABEL[roll.outcomeKey]}`,`<p>${esc(spot.name)} · ${esc(tagPackId)} · ${minutes} Banana Watch min${sense.witnessed?' · witnessed':''}${repGain?' · +1 Street Rep':''}.</p>
    ${note?`<p><b>${esc(note)}</b></p>`:''}<p class="smoke-dim">Territory: ${Object.entries(factionScores).map(([k,v])=>`${esc(k)} ${v}`).join(' · ')||'No quality points yet'}.</p>`,'crew');
  Hooks.callAll('smokeGraffitiChanged',scene,mark);
  return {markId:mark.markId,assetPath:filePath,quality:roll.outcomeKey,territory:factionScores,minutes,repGain,note};
}
registerHandler('graffiti.paint',paintOnLeader);
registerHandler('graffiti.repair',async({sceneId,userId})=>{
  if(!game.users.get(userId)?.isGM)throw new Error('GM only.');
  const scene=game.scenes.get(sceneId);if(!scene)throw new Error('Scene missing.');return repaintMissing(scene);
});


/** GM-created free spots: no mission ID selection, simply drop the marker where needed. */
async function quickSpotOnLeader({sceneId,x,y,surface='wall',userId}){
  if(!game.users.get(userId)?.isGM)throw new Error('Only the GM can put paintable objects on a scene.');
  const scene=game.scenes.get(sceneId);if(!scene)throw new Error('Open a scene before placing a paint spot.');
  if(!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))throw new Error('Choose a map position.');
  const allowed=['wall','shutter','bridge','overpass','bus','train'];
  if(!allowed.includes(surface))throw new Error('Unknown paint surface type.');
  const actor=await ensureSpotActor();
  const doc=await actor.getTokenDocument({}, {parent:scene}),data=doc.toObject(),g=scene.grid?.size||100;
  const width=.5,height=.5;
  const px=Math.round(Number(x)-width*g/2),py=Math.round(Number(y)-height*g/2);
  Object.assign(data,{x:px,y:py,width,height,hidden:false,actorLink:false,displayName:20});
  data.flags={...(data.flags||{}),[NS]:{...(data.flags?.[NS]||{}),tagSurfaceType:surface}};
  const [created]=await scene.createEmbeddedDocuments('Token',[data]);
  // preCreateToken assigns the name + unique site ID from the mapped road/zone.
  return {tokenId:created?.id,siteId:created?.getFlag(NS,'tagSpot')?.siteId,name:created?.name};
}
registerHandler('graffiti.quickSpot',quickSpotOnLeader);
/** Establish the token's identity at creation, including when dragged from Actors. */
export function initialiseAutoPaintToken(doc,data,options,userId){
  if(!game.user?.isGM || userId!==game.user.id)return;
  const actor=doc?.actor || game.actors?.get?.(data?.actorId||doc?.actorId);
  if(!actor?.getFlag?.(NS,'graffitiSpotActor'))return;
  const existing=data?.flags?.[NS]?.tagSpot||doc?.getFlag?.(NS,'tagSpot');
  if(existing?.siteId)return; // honour precisely authored/old mission spots
  const scene=doc.parent;if(!scene)return;
  const g=scene.grid?.size||100,tx=Number(data.x??doc.x)||0,ty=Number(data.y??doc.y)||0;
  const x=tx+(Number(data.width??doc.width)||.5)*g/2,y=ty+(Number(data.height??doc.height)||.5)*g/2;
  const n=nextAutoSpotName(scene,x,y,scene.tokens||[]);
  const surface=String(data.flags?.[NS]?.tagSurfaceType||'wall');
  const siteId=`STREET-${scene.id}-${foundry.utils.randomID(10)}`;
  doc.updateSource({name:n.name,displayName:20,
    [`flags.${NS}.tagSpot`]:{siteId,auto:true,root:n.root,number:n.number,zoneId:n.zoneId,surface,approved:false,crowded:false,exposed:false,createdByGM:true}});
  // Pre-create hooks MUST return undefined. false would cancel ALL normal token drops.
}
/** Renaming follows dragged surfaces as they cross street/zone boundaries. */
export function renameMovedPaintToken(doc,changes,options,userId){
  if(!game.user?.isGM||userId!==game.user.id || !('x' in changes || 'y' in changes))return;
  const spec=doc?.getFlag?.(NS,'tagSpot');if(!spec?.auto || !spec.siteId)return;
  const scene=doc.parent;if(!scene)return;
  const g=scene.grid?.size||100;
  const x=(Number(changes.x??doc.x)||0)+(Number(changes.width??doc.width)||.5)*g/2;
  const y=(Number(changes.y??doc.y)||0)+(Number(changes.height??doc.height)||.5)*g/2;
  const next=nextAutoSpotName(scene,x,y,[...(scene.tokens||[])].filter(t=>t.id!==doc.id));
  if(next.root===spec.root)return;
  changes.name=next.name;
  foundry.utils.setProperty(changes,`flags.${NS}.tagSpot`,{...spec,root:next.root,number:next.number,zoneId:next.zoneId});
  // Pre-update hooks MUST return undefined unless deliberately blocking movement.
}

/** Make a GM-placed, draggable token marker at the GM's chosen scene coordinate. */
let spotActorCreation=null;
async function ensureSpotActor(){
  const found=game.actors.find(a=>a.getFlag(NS,'graffitiSpotActor'));
  if(found)return found;
  if(spotActorCreation)return spotActorCreation;
  // Startup recovery, an arriving player and mission-start may run together.
  // Never create duplicate Paintable Surface world actors in that race.
  const pending=(async()=>{
    const existing=game.actors.find(a=>a.getFlag(NS,'graffitiSpotActor'));
    if(existing)return existing;
    return Actor.implementation.create({name:'Paintable Surface',type:'npc',img:`systems/${NS}/assets/graffiti/paint-spot.svg`,
      ownership:{default:0},prototypeToken:{name:'Paintable Surface',actorLink:false,displayName:20,width:.45,height:.45,
        texture:{src:`systems/${NS}/assets/graffiti/paint-spot.svg`},disposition:0,sight:{enabled:false}},
      flags:{[NS]:{graffitiSpotActor:true}}});
  })();
  spotActorCreation=pending;
  try{return await pending;}finally{if(spotActorCreation===pending)spotActorCreation=null;}
}
// Every active commission gets its real, named paint surface on the mapped street.
// This intentionally mirrors mission cargo placement; arrival must not depend on a
// player or GM dragging a generic Paintable Surface token into the scene first.
const missionSpotLocks=new Map();
function serialiseMissionSpots(scene,fn){
  const id=scene.id,previous=missionSpotLocks.get(id)||Promise.resolve();
  const next=previous.catch(()=>{}).then(fn);
  missionSpotLocks.set(id,next);
  void next.finally(()=>{if(missionSpotLocks.get(id)===next)missionSpotLocks.delete(id);}).catch(()=>{});
  return next;
}
const isCommissionSpot=token=>Boolean(token?.getFlag?.(NS,'tagSpot')?.missionPaint);
function authorisedSurface(site){
  // Only clearly approved or explicitly community-authorised walls are legal
  // by default. An unrelated industrial shutter is never silently legal.
  return site.id==='SP-HC-MORNING-WALL' || /\b(authorised|approved|commissioned|community panel|outreach (?:panel|board)|awareness board)\b/i.test(site.label);
}
/**
 * A bus paint site is a real bus: a Clippermaster parked out of service at the kerb (locked, nobody aboard, never part
 * of the traffic), carrying the site so the tag goes on — and stays on — the bus itself. (0.5.22: it was only a marker.)
 */
const MISSION_BUS='LV28';
async function parkMissionBus(scene,street,site,point,spotFlags){
  const actor=await ensureVehicleActor(MISSION_BUS),g=scene.grid?.size||100;
  const zones=street?.zones||[],inside=z=>Array.isArray(z.rect)&&point.x>=z.rect[0]&&point.x<=z.rect[0]+z.rect[2]&&point.y>=z.rect[1]&&point.y<=z.rect[1]+z.rect[3];
  const road=zones.find(z=>z.id===point.roadZoneId)??zones.find(z=>['road','junction'].includes(z.kind)&&inside(z));
  const w=Number(actor.prototypeToken?.width)||2,h=Number(actor.prototypeToken?.height)||6;
  const at=parkedAlong(point,road,{width:w,height:h,grid:g});
  return placeToken(scene,actor,at.cx,at.cy,{rotation:at.rotation,name:site.label,
    flags:{...spotFlags,parked:true,locked:true,missionProp:site.id,keeper:'Clippermaster Buses (out of service)'}});
}
const isSurfaceMarker=t=>Boolean(t?.actor?.getFlag?.(NS,'graffitiSpotActor'));
/** GM-only, idempotent scene reconciliation for active tagging mission sites. */
export async function ensureMissionPaintSpotsOnScene(scene){
  if(!isLeader()||!scene||!game.user?.isGM)return {created:0,existing:0,restored:0};
  return serialiseMissionSpots(scene,async()=>{
    const mapId=mapIdOf(scene);
    if(!mapId)return {created:0,existing:0,restored:0};
    const [catalogue,mData,atlas]=await Promise.all([taggingCatalogue(),missionData(),loadAtlas()]);
    const active=missionState();
    const targets=activePaintTargets(mapId,catalogue,mData.missions,active);
    if(!targets.length)return {created:0,existing:0,restored:0};
    const street=(atlas.atlas?.maps||[]).find(m=>m.id===mapId);
    if(!street){console.warn('The Smoke | tagging commission target has no mapped street',mapId);return {created:0,existing:0,restored:0};}
    const actor=await ensureSpotActor(),grid=scene.grid?.size||100;
    const marked=[];let created=0,existing=0,restored=0;
    const tokens=()=>[...(scene.tokens||[])];
    for(const {site,stop,missionId} of targets){
      // An already-created labelled token, including one positioned manually,
      // is authoritative: don't move it or replace an attached vehicle target.
      let current=tokens().find(t=>t.getFlag?.(NS,'tagSpot')?.siteId===site.id);
      // 0.5.21 put a plain marker where a bus should be. Swap it for the bus, unless it has already been painted.
      if(current&&site.surface==='bus'&&isSurfaceMarker(current)&&isCommissionSpot(current)&&!tagRecords(scene).some(r=>r.siteId===site.id||r.spotTokenId===current.id)){
        const cw=Number(current.width||.45)*grid,ch=Number(current.height||.45)*grid,spec=current.getFlag(NS,'tagSpot');
        const near=missionPaintPosition(street,site,stop,atlas.venues?.maps,atlas.places?.maps,[],grid);
        try{
          const bus=await parkMissionBus(scene,street,site,{x:Number(current.x||0)+cw/2,y:Number(current.y||0)+ch/2,roadZoneId:near.roadZoneId},{tagSpot:{...spec}});
          if(bus){await scene.deleteEmbeddedDocuments('Token',[current.id]);current=bus;restored++;}
        }catch(error){console.warn('The Smoke | could not park the mission bus; keeping the marker',error);}
      }
      if(current){
        existing++;
        if(current.hidden && isCommissionSpot(current)){
          await current.update({hidden:false});restored++;
        }
        const cw=Number(current.width||.45)*grid,ch=Number(current.height||.45)*grid;
        marked.push({x:Number(current.x||0)+cw/2,y:Number(current.y||0)+ch/2});
        continue;
      }
      // A mission may have been cancelled while this map was importing.
      if(missionState()[missionId]?.status!=='active')continue;
      const position=missionPaintPosition(street,site,stop,atlas.venues?.maps,atlas.places?.maps,
        [...marked,...tokens().filter(t=>t.getFlag?.(NS,'tagSpot')).map(t=>({x:Number(t.x||0)+Number(t.width||.45)*grid/2,y:Number(t.y||0)+Number(t.height||.45)*grid/2}))],grid);
      const spotFlags={tagSpot:{siteId:site.id,surface:site.surface,approved:authorisedSurface(site),crowded:false,exposed:false,
        missionPaint:true,createdByGM:true,approximate:position.approximate,anchorZoneId:position.anchorZoneId||null,placement:position.via||'approximate'}};
      if(site.surface==='bus'){
        try{const bus=await parkMissionBus(scene,street,site,position,spotFlags);if(bus){marked.push(position);created++;continue;}}
        catch(error){console.warn('The Smoke | could not park the mission bus; placing a marker instead',error);}
      }
      const proto=(await actor.getTokenDocument({},{parent:scene})).toObject();
      delete proto._id;
      const w=.45,h=.45;
      Object.assign(proto,{actorId:actor.id,name:site.label,x:Math.round(position.x-w*grid/2),y:Math.round(position.y-h*grid/2),
        width:w,height:h,hidden:false,actorLink:false,displayName:20,
        texture:{...(proto.texture||{}),src:`systems/${NS}/assets/graffiti/paint-spot.svg`,fit:'contain'}});
      proto.flags={...(proto.flags||{}),[NS]:{...(proto.flags?.[NS]||{}),tagSpot:{
        siteId:site.id,surface:site.surface,approved:authorisedSurface(site),crowded:false,exposed:false,
        missionPaint:true,createdByGM:true,approximate:position.approximate,
        anchorZoneId:position.anchorZoneId||null,placement:position.via||'approximate'}}};
      const [token]=await scene.createEmbeddedDocuments('Token',[proto],{smokeMissionPaint:true});
      if(!token)throw new Error(`Cannot place ${site.label} on ${scene.name}.`);
      marked.push(position);created++;
    }
    if(created||restored)console.info(`The Smoke | restored ${created} missing paintable mission surface(s) on ${scene.name}${restored?`, revealed ${restored}`:''}`);
    return {created,existing,restored};
  });
}
/** Place all commission targets when their mission begins, even before travel. */
export async function ensureMissionPaintSpotsForMission(mission){
  if(!isLeader()||!mission?.tagging)return {created:0};
  const cat=await taggingCatalogue();
  const mapIds=[...new Set((cat.sites||[]).filter(s=>mission.tagging.sites.includes(s.id)).map(s=>s.sceneMapId))];
  let created=0;
  for(const mapId of mapIds){
    try{
      const scene=await findOrImportScene(mapId);
      if(scene)created+=(await ensureMissionPaintSpotsOnScene(scene)).created;
    }catch(error){console.warn(`The Smoke | commission ${mission.id}, map ${mapId} paint placement failed; will retry on arrival`,error);}
  }
  return {created};
}
/** Restore current active commission markers after upgrading an existing world. */
export async function restoreActiveMissionPaintSpots(){
  if(!isLeader()||!game.user?.isGM)return {created:0};
  const catalogue=await taggingCatalogue(),data=await missionData(),state=missionState();
  const targetMaps=new Set((catalogue.sites||[]).filter(site=>data.missions.some(m=>m.tagging &&
    state[m.id]?.status==='active'&&m.tagging.sites.includes(site.id))).map(site=>site.sceneMapId));
  let created=0;
  for(const scene of game.scenes||[]){
    if(targetMaps.has(mapIdOf(scene)))created+=(await ensureMissionPaintSpotsOnScene(scene)).created;
  }
  return {created};
}
registerHandler('graffiti.repairMissionSpots',async({sceneId=null,userId}={})=>{
  if(!game.users.get(userId)?.isGM)throw new Error('Only a GM can repair mission paint surfaces.');
  return sceneId ? ensureMissionPaintSpotsOnScene(game.scenes.get(sceneId)) : restoreActiveMissionPaintSpots();
});
registerHandler('graffiti.prepareMissionSpots',async({missionId,userId}={})=>{
  if(!game.users.get(userId)?.isGM)throw new Error('Only a GM can prepare mission paint surfaces.');
  const m=(await missionData()).missions.find(x=>x.id===missionId);
  if(!m?.tagging||missionState()[missionId]?.status!=='active')throw new Error('Start this tagging mission first.');
  return ensureMissionPaintSpotsForMission(m);
});

async function authorSpotOnLeader({sceneId,siteId,x,y,approved=false,crowded=false,exposed=false,vehicleTokenId=null,userId}){
  if(!game.users.get(userId)?.isGM)throw new Error('Only a GM can author a paintable spot.');
  const scene=game.scenes.get(sceneId),catalogue=await taggingCatalogue(),site=catalogue.sites.find(s=>s.id===siteId);
  if(!scene||!site||mapIdOf(scene)!==site.sceneMapId)throw new Error('The requested paint spot does not belong to this map.');
  if(scene.tokens.find(t=>t.getFlag(NS,'tagSpot')?.siteId===siteId))throw new Error('That paint spot already exists on this map. Move its marker instead.');
  if(vehicleTokenId){
    const vehicle=scene.tokens.get(vehicleTokenId);
    if(vehicle?.actor?.type!=='vehicle')throw new Error('Select a vehicle token for a bus/train paint spot.');
    await vehicle.setFlag(NS,'tagSpot',{siteId,surface:site.surface,approved,crowded,exposed});
    return {tokenId:vehicle.id,siteId};
  }
  if(!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))throw new Error('Click a map position or select a token before authoring.');
  const actor=await ensureSpotActor(),g=scene.grid?.size||100,token=await actor.getTokenDocument({}, {parent:scene});
  const data=token.toObject(),width=Math.max(.35,Number(data.width)||.5),height=Math.max(.35,Number(data.height)||.5);
  Object.assign(data,{x:Math.round(Number(x)-width*g/2),y:Math.round(Number(y)-height*g/2),width,height,
    name:site.label,hidden:false,actorLink:false,displayName:20,
    flags:{...(data.flags||{}),[NS]:{tagSpot:{siteId,surface:site.surface,approved,crowded,exposed,createdByGM:true}}}});
  const [created]=await scene.createEmbeddedDocuments('Token',[data]);
  return {tokenId:created.id,siteId};
}
registerHandler('graffiti.authorSpot',authorSpotOnLeader);

/** UI/Street Actions entry point: roll Graft and submit its real ChatMessage to the GM. */
export async function paintSpot({actor,spotTokenId,missionId=null,identity='TAG-STREET',design={}}){
  if(!actor?.isOwner&&!game.user.isGM)throw new Error('Pick your own character.');
  const scene=canvas?.scene;if(!scene)throw new Error('Open the street map first.');
  const {token:spot,spec}=sceneSpotToken(scene,spotTokenId),here=scene.tokens.find(t=>t.actorId===actor.id&&!t.hidden&&!t.getFlag(NS,'vehicleSeat'));
  if(!here)throw new Error('Get out of the vehicle and stand beside the wall.');
  nearAndReady(here,spot,scene);
  const band=bandForTagSite({surface:spec.surface,approved:spec.approved===true});
  const attemptId=foundry.utils.randomID(20);
  const out=await actor.rollStat('grf',{band,label:`Spray ${spot.name}`,context:{kind:'tagPaint',attemptId,sceneId:scene.id,spotTokenId,actorId:actor.id}});
  if(!out?.result)return null;
  const result=await request('graffiti.paint',{sceneId:scene.id,spotTokenId,actorId:actor.id,
    rollMessageId:out.message?.id,attemptId,tagPackId:identity,missionId,design});
  if(result?.alreadyPainted)ui.notifications.info('That tag was already placed.');
  else ui.notifications.info(`Painted: ${QUALITY_LABEL[result?.quality]||'Tag placed'} · ${result?.minutes||0} Watch minutes.`);
  if(result?.note)ui.notifications.warn(result.note);
  return result;
}
export async function openSpotAuthoring(){
  if(!game.user.isGM)throw new Error('Only the GM can place paintable surfaces.');
  const scene=canvas?.scene;if(!scene)throw new Error('Open a map first.');
  await ensureSpotActor();
  // One step: click the map to drop an automatically named surface.
  const stage=canvas?.stage;
  if(!stage?.on||!stage?.off){
    const p=canvas.mousePosition,selected=canvas.tokens?.controlled?.[0]?.document,g=scene.grid?.size||100;
    const x=selected?selected.x+selected.width*g/2:p?.x,y=selected?selected.y+selected.height*g/2:p?.y;
    if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Point to the location first.');
    const result=await request('graffiti.quickSpot',{sceneId:scene.id,x,y});
    ui.notifications.info(`Dropped: ${result.name}. Right-click it to paint.`);return result;
  }
  ui.notifications.info('Paint Spots: click the map where the surface should go. The street name and number are automatic.');
  return new Promise(resolve=>{
    const clear=()=>{stage.off('pointerdown',onMapClick);document?.removeEventListener?.('keydown',onKey,true);};
    const onKey=e=>{if(e.key==='Escape'){clear();ui.notifications.info('Stopped placing paint spots.');resolve(null);}};
    const onMapClick=ev=>{
      const pos=ev?.getLocalPosition?.(stage)||ev?.data?.getLocalPosition?.(stage)||ev?.global;
      if(!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.y))return;
      clear();
      Promise.resolve(request('graffiti.quickSpot',{sceneId:scene.id,x:pos.x,y:pos.y})).then(result=>{
        ui.notifications.info(`Dropped: ${result.name}. Right-click it to paint.`);resolve(result);
      }).catch(error=>{ui.notifications.warn(error.message);resolve(null);});
    };
    stage.on('pointerdown',onMapClick);
    if(typeof document!=='undefined')document.addEventListener('keydown',onKey,true);
  });
}
export async function openNamedSpotAuthoring(){
  if(!game.user.isGM)throw new Error('Only the GM places paintable hotspots.');
  const scene=canvas?.scene;if(!scene)throw new Error('Open a street map first.');
  const cat=await taggingCatalogue(),mapId=mapIdOf(scene);
  const available=cat.sites.filter(s=>s.sceneMapId===mapId&&!scene.tokens.some(t=>t.getFlag(NS,'tagSpot')?.siteId===s.id));
  if(!available.length){ui.notifications.info('All planned paint spots for this map already exist (or this map has none).');return;}
  const opts=available.map(s=>`<option value="${esc(s.id)}">${esc(s.label)} · ${esc(s.surface)}</option>`).join('');
  const form=await foundry.applications.api.DialogV2.input({window:{title:`Paint hotspots · ${scene.name}`},
    content:`<p>Select the paintable location. Position it using your mouse on the map (or the centre of a selected token) before opening this dialog. The marker can be dragged by the GM afterward.</p>
    <label>Planned site <select name="siteId">${opts}</select></label>
    <label><input type="checkbox" name="approved"> Commission-approved paint wall (no crime Heat)</label>
    <label><input type="checkbox" name="crowded"> Busy / visible to witnesses</label>
    <label><input type="checkbox" name="exposed"> Exposed public position</label>
    <label><input type="checkbox" name="vehicle"> Attach spot directly to selected vehicle token (bus/train)</label>`,ok:{label:'Create spot'}});
  if(!form)return;
  const selected=canvas.tokens?.controlled?.[0]?.document;
  const pointer=canvas.mousePosition,gr=scene.grid?.size||100;
  // Prefer selected token centre for precision when supplied; otherwise the known stage mouse coordinate.
  const x=selected?selected.x+selected.width*gr/2:Number(pointer?.x),y=selected?selected.y+selected.height*gr/2:Number(pointer?.y);
  const result=await request('graffiti.authorSpot',{sceneId:scene.id,siteId:form.siteId,x,y,
    vehicleTokenId:form.vehicle?selected?.id:null,approved:Boolean(form.approved),crowded:Boolean(form.crowded),exposed:Boolean(form.exposed)});
  ui.notifications.info(`Paintable site created: ${form.siteId}. GM: adjust the marker's position if needed.`);
  return result;
}
export function inspectSpot(scene,spotTokenId){
  const {token,spec}=sceneSpotToken(scene,spotTokenId);
  const marks=tagRecords(scene).filter(m=>m.siteId===spec.siteId&&m.status==='visible');
  const summary=marks.length?marks.map(m=>`${m.identity}: ${QUALITY_LABEL[m.outcomeKey]} by ${m.creatorName}`).join(' · '):'No graffiti yet.';
  ui.notifications.info(`${token.name}: ${summary}`);return marks;
}
/** Tokens move under vehicles; graphics stay attached to the vehicle rather than behind it. */
function installFollowHooks(){
  Hooks.on('createToken',token=>{
    if(!isLeader()||token.actor?.type!=='vehicle')return;
    const carried=token.getFlag(NS,'graffitiCarry');
    if(!carried?.markId||!carried.assetPath)return;
    const scene=token.parent;
    if(tagRecords(scene).some(m=>m.markId===carried.markId&&m.status==='visible'&&m.spotTokenId===token.id))return;
    Promise.resolve().then(async()=>{
      const record={...carried,spotTokenId:token.id,sceneId:scene.id,sceneMapId:mapIdOf(scene),status:'visible',
        attemptId:null,missionId:null,missionRunId:null,rollMessageId:null,coveredMarkIds:[],tileId:null};
      const tile=await addTaggedTile(scene,token,record);record.tileId=tile.id;
      const all=foundry.utils.deepClone(tagRecords(scene));all.push(record);
      await scene.setFlag(NS,RECORD_KEY,all);
      await syncTerritory(scene,all);
    }).catch(error=>console.warn('The Smoke | travelling vehicle graffiti',error));
  });
  Hooks.on('deleteToken',token=>{
    if(!isLeader()||token.actor?.type!=='vehicle')return;
    const scene=token.parent,records=foundry.utils.deepClone(tagRecords(scene));
    const departing=records.filter(r=>r.status==='visible'&&r.spotTokenId===token.id);
    if(!departing.length)return;
    Promise.resolve().then(async()=>{
      for(const r of departing){
        const existing=records.find(x=>x.markId===r.markId);if(existing)existing.status='moved';
        if(r.tileId&&scene.tiles.get(r.tileId))await scene.deleteEmbeddedDocuments('Tile',[r.tileId]);
      }
      await scene.setFlag(NS,RECORD_KEY,records);
      await syncTerritory(scene,records);
    }).catch(error=>console.warn('The Smoke | departing vehicle graffiti',error));
  });
  Hooks.on('updateToken',(token,changes)=>{
    if(!isLeader()||!['x','y','rotation'].some(k=>Object.hasOwn(changes,k)))return;
    const scene=token.parent,records=tagRecords(scene).filter(r=>r.status==='visible'&&r.spotTokenId===token.id&&r.tileId);
    if(!records.length)return;
    const geometry=tilePosition(token,scene);
    const updates=records.filter(r=>scene.tiles.get(r.tileId)).map(r=>({_id:r.tileId,...geometry}));
    if(updates.length)void scene.updateEmbeddedDocuments('Tile',updates).catch(err=>console.warn('The Smoke | moving vehicle graffiti',err));
  });
  Hooks.on('deleteTile',tile=>{
    if(!isLeader()||!tile.getFlag(NS,'graffiti'))return;
    // GM deletion is a cosmetic loss, not deletion of ownership/territory; repair can recreate it.
    console.info('The Smoke | graffiti tile removed; GM can repair using game.smoke.graffiti.repair()');
  });
}
export function installGraffiti(){
  Hooks.on('preCreateToken',initialiseAutoPaintToken);
  Hooks.on('preUpdateToken',renameMovedPaintToken);
  installFollowHooks();
  const sync=(scene,reason)=>{
    if(!isLeader()||!game.user?.isGM||!scene)return;
    void ensureMissionPaintSpotsOnScene(scene).catch(e=>console.warn(`The Smoke | tagging mission markers on ${reason}`,scene.name,e));
  };
  // All paths to a scene matter: first import, crossing a map boundary, viewing
  // an existing map, or adding a player token directly to a scene. None of
  // these hooks ever returns false or intercepts normal Foundry token actions.
  Hooks.on('createScene',scene=>sync(scene,'scene import'));
  Hooks.on('smokeTransit',({target}={})=>sync(target,'map crossing'));
  Hooks.on('canvasReady',()=>sync(canvas?.scene,'canvas arrival'));
  Hooks.on('createToken',token=>{if(token.actor?.type==='character')sync(token.parent,'character arrival');});
  Hooks.on('smokeMissionsChanged',()=>sync(canvas?.scene,'mission state changed'));
  if(isLeader()&&game.user?.isGM){
    void ensureSpotActor().catch(e=>console.warn('The Smoke | paintable token setup',e));
    void restoreActiveMissionPaintSpots().catch(e=>console.warn('The Smoke | active tagging commission marker recovery',e));
  }
}
export const graffitiAPI={catalogue:taggingCatalogue,records:tagRecords,territory:tagTerritory,
  paint:paintSpot,inspect:inspectSpot,author:openSpotAuthoring,authorNamed:openNamedSpotAuthoring,authorAt:(data)=>request('graffiti.authorSpot',data),quickSpot:(data)=>request('graffiti.quickSpot',data),
  repair:(scene=canvas.scene)=>request('graffiti.repair',{sceneId:scene.id}),
  repairMissionSpots:(scene=null)=>request('graffiti.repairMissionSpots',{sceneId:scene?.id||null}),
  prepareMissionSpots:missionId=>request('graffiti.prepareMissionSpots',{missionId}),spots:publicSpotSummary};
