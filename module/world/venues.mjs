import {NS} from '../config.mjs';
import {venueStatus,venueProfile,venueProfiles,configureVenues,failVenues,hasVenueAccess,openAt,validateVenueCatalog} from '../rules/venue-contract.mjs';
import {isLeader,registerHandler,request,esc} from './net.mjs';
import {withActionLocks,worldSeconds} from './action-locks.mjs';
import {mapIdOf,tokenCentre,distanceSquares,actorToken,zonesOf,placeToken} from './spawn.mjs';
import {loadAtlas} from '../map/map-transit.mjs';
const FLAG='venueCounter';let installed=false,markerBase=null;
const getSetting=(k,def)=>{try{return game.settings.get(NS,k)??def;}catch(_e){return def;}};
export function registerVenueSettings(){
  game.settings.register(NS,'venueEconomy',{scope:'world',config:false,type:Object,default:{}});
  game.settings.register(NS,'venueHours',{name:'Venue opening hours',hint:'Use fictional campaign opening hours against the Banana Watch. Off preserves unrestricted session scheduling; marked closures and permissions always apply.',scope:'world',config:true,type:Boolean,default:false});
}
function activeMissionCodes(){const states=getSetting('missions',{});const codes=game.smoke?.missionCodes||{};return Object.fromEntries(Object.entries(states).map(([id,s])=>[id,{...s,code:codes[id]||s.code||id.toUpperCase()}]));}
export const counterFor=(scene,key)=>scene?.tokens?.find(t=>t.getFlag?.(NS,FLAG)?.key===key)||null;
export function venueProblem(actor,key,{token=null,ignoreLocation=false}={}){
  const status=venueStatus();if(!status.ready)return status.error||'Venue services are still loading.';
  const p=venueProfile(key);if(!p)return 'Unknown venue counter.';
  token??=actorToken(actor);if(!token&&!ignoreLocation)return 'Place your character beside the counter first.';
  const scene=token?.parent,counter=counterFor(scene,key);
  if(!ignoreLocation){
    if(mapIdOf(scene)!==p.mapId||!counter||counter.hidden)return 'This counter is not on your current map.';
    if(distanceSquares(token,counter)>Number(p.reach||2.4))return `Stand beside ${p.name}'s counter.`;
  }
  const state=getSetting('venueEconomy',{})?.counters?.[key]||{};
  const flags=counter?.getFlag(NS,FLAG)||{};
  if(state.closed||flags.closed||flags.staffed===false)return 'This counter is closed or unstaffed.';
  if(getSetting('venueHours',false)&&!openAt(state.hours||p.hours,worldSeconds()))return 'This counter is closed at this Watch time.';
  if(!hasVenueAccess(p,actor,{time:worldSeconds(),missions:activeMissionCodes(),factions:getSetting('factions',{})}))return 'A recorded invitation, active job or faction access is required here.';
  return null;
}
export function shopsHere(token){
  if(!token)return [];return venueProfiles().filter(p=>p.mapId===mapIdOf(token.parent)&&!venueProblem(token.actor,p.key,{token})).map(p=>p.key);
}
export function checkVenue(actor,key,userId,{override=false,reason=''}={}){
  const user=game.users.get(userId);if(!user||(!user.isGM&&!actor.testUserPermission?.(user,'OWNER')))throw new Error('Choose your own character.');
  if(override){if(!user.isGM||String(reason).trim().length<8)throw new Error('A GM override requires an explanation of at least eight characters.');return {profile:venueProfile(key),token:actorToken(actor),override:true,reason};}
  const problem=venueProblem(actor,key);if(problem)throw new Error(problem);return {profile:venueProfile(key),token:actorToken(actor),override:false};
}
async function baseActor(){
  if(markerBase&&game.actors.get(markerBase.id))return markerBase;
  markerBase=game.actors.find(a=>a.getFlag?.(NS,'venueCounterBase'));
  if(!markerBase)markerBase=await Actor.implementation.create({name:'Venue counter (interaction marker)',type:'npc',img:`systems/${NS}/assets/ui/gear.svg`,ownership:{default:0},prototypeToken:{actorLink:false,width:.6,height:.6,texture:{src:`systems/${NS}/assets/ui/gear.svg`,fit:'contain'},sight:{enabled:false}},flags:{[NS]:{venueCounterBase:true}}});
  return markerBase;
}
function anchor(p,scene){
  const [x,y,w,h]=p.rect,g=scene.grid?.size||100;
  if(!p.street)return [x+w/2,y+h/2];
  // Exterior tills sit on the nearest traversable edge, not inside a building block.
  const roads=zonesOf(scene).filter(z=>['road','path','junction'].includes(z.kind));
  const candidates=roads.map(z=>{const [rx,ry,rw,rh]=z.rect,cx=Math.max(rx+g/2,Math.min(rx+rw-g/2,x+w/2)),cy=Math.max(ry+g/2,Math.min(ry+rh-g/2,y+h/2));return {p:[cx,cy],d:Math.hypot(cx-(x+w/2),cy-(y+h/2))};}).sort((a,b)=>a.d-b.d);
  return candidates[0]?.p||[x+w/2,y+h/2];
}
export async function syncVenueScene(scene){
  if(!isLeader()||!scene||!venueStatus().ready)return;
  return withActionLocks([`venue-scene:${scene.id}`],async()=>{
    for(const p of venueProfiles().filter(v=>v.mapId===mapIdOf(scene))){
      if(counterFor(scene,p.key))continue;
      const a=await baseActor(),[cx,cy]=anchor(p,scene);
      await placeToken(scene,a,cx,cy,{name:`${p.name} - ${p.interactionOnly?'Contact':'Counter'}`,flags:{[FLAG]:{key:p.key,venueId:p.venueId,zoneId:p.zoneId,staffed:true,closed:false,authored:true}},options:{smokeVenue:true}});
    }
  });
}
export async function openVenueCounter(doc){
  const key=doc?.getFlag?.(NS,FLAG)?.key,p=venueProfile(key);if(!p)return;
  const candidates=doc.parent.tokens.filter(t=>t.actor?.type==='character'&&(game.user.isGM||t.actor.testUserPermission?.(game.user,'OWNER'))&&distanceSquares(t,doc)<=Number(p.reach||2.4));
  if(!candidates.length)throw new Error('Bring a character beside this counter.');
  let token=candidates[0];if(candidates.length>1){const f=await foundry.applications.api.DialogV2.input({window:{title:'Who is using the counter?'},content:`<select name="actor">${candidates.map(t=>`<option value="${esc(t.actor.id)}">${esc(t.name)}</option>`).join('')}</select>`});if(!f)return;token=candidates.find(t=>t.actor.id===f.actor)||token;}
  const problem=venueProblem(token.actor,key,{token});if(problem)throw new Error(problem);
  return game.smoke.openShop(token.actor,{shopKey:key});
}
registerHandler('venue.configure',async({key,closed,staffed,hours,actorId,grantMinutes,reason,userId})=>{
  if(!game.users.get(userId)?.isGM||String(reason||'').trim().length<8)throw new Error('Only a GM can change venue access; give an audit reason.');
  const p=venueProfile(key);if(!p)throw new Error('Unknown counter.');
  return withActionLocks(['venue-economy'],async()=>{
    const state=getSetting('venueEconomy',{});state.counters??={};const old=state.counters[key]||{};
    if(hours&&(!Array.isArray(hours)||hours.length!==2||!hours.every(Number.isFinite)||hours[1]<=hours[0]))throw new Error('Choose valid opening and closing hours.');
    state.counters[key]={...old,...(closed==null?{}:{closed:Boolean(closed)}),...(hours?{hours}:{}),reason:String(reason).slice(0,400),by:userId,at:worldSeconds()};
    await game.settings.set(NS,'venueEconomy',state);
    for(const scene of game.scenes){const c=counterFor(scene,key);if(c&&staffed!=null)await c.update({[`flags.${NS}.${FLAG}.staffed`]:Boolean(staffed)});}
    if(actorId){const actor=game.actors.get(actorId);if(!actor)throw new Error('Character not found.');const mins=Math.min(10080,Math.max(1,Number(grantMinutes)||60));await actor.update({[`flags.${NS}.venueAccess.${p.venueId}`]:{issued:true,actorId,venueId:p.venueId,expiresAt:worldSeconds()+mins*60,kind:'invitation',by:userId,reason}});}
    return true;
  });
});
export async function installVenues(baseShops){
  if(installed)return;installed=true;
  try{
    const [data,lib,atlas]=await Promise.all([fetch(`systems/${NS}/data/venue-services.json`).then(r=>{if(!r.ok)throw new Error('Venue catalogue unavailable.');return r.json();}),fetch(`systems/${NS}/data/london-items.json`).then(r=>r.json()),loadAtlas()]);
    const errors=validateVenueCatalog(data,lib.items,[...atlas.atlas.maps,...atlas.places.maps,...atlas.venues.maps]);if(errors.length)throw new Error(errors.join('; '));
    configureVenues(data,baseShops);
    const services=await import('./venue-services.mjs');
    game.smoke.venues={service:services.openVenueService,open:openVenueCounter,sync:syncVenueScene,problem:venueProblem,profiles:venueProfiles,configure:opts=>request('venue.configure',opts)};
    Hooks.on('canvasReady',canvas=>{void syncVenueScene(canvas.scene).catch(console.error);});
    Hooks.on('createScene',scene=>{void syncVenueScene(scene).catch(console.error);});
    // Loaded scenes only; do not import all 160 venues simply to place counters.
    if(isLeader())for(const scene of game.scenes)await syncVenueScene(scene);
  }catch(e){failVenues(e.message);throw e;}
}
