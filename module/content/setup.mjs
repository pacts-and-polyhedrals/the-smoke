import {NS} from '../config.mjs';
import {isLeader,esc} from '../world/net.mjs';
import {findOrImportScene,loadAtlas,importAllMaps} from '../map/map-transit.mjs';
import {placeToken,zonesOf,lanePoint} from '../world/spawn.mjs';
import {repairAllSceneBackgrounds} from '../map/scene-repair.mjs';
import {applyDriverControl,reconcileOccupants} from '../vehicles/vehicle-boarding.mjs';

export const VERSION='0.1.2';
let setupRunning=null;
const guideAliases={'player-guide':['The Smoke — Player Guide'],'gm-guide':['The Smoke — GM Guide'],'missions-guide':['Hackney Missions — On Your Bike']};
const norm=s=>String(s??'').toLowerCase().trim();
async function folder(type,name){let f=game.folders.find(f=>f.type===type&&f.name===name);if(!f)f=await Folder.implementation.create({name,type,color:'#d99858'});return f.id;}
async function content(){const response=await fetch(`systems/${NS}/data/content.json`);if(!response.ok)throw new Error('The bundled content file is missing.');return response.json();}
function actorMatches(actor,source){
 const f=source.flags[NS];
 if(actor.getFlag(NS,'contentKey')===f.contentKey)return true;
 if(actor.type!==source.type||actor.getFlag(NS,'streetLife')||actor.getFlag(NS,'dedicatedFor'))return false;
 return Boolean(f.npcKey&&actor.getFlag(NS,'npcKey')===f.npcKey||f.catalogId&&actor.getFlag(NS,'catalogId')===f.catalogId);
}
async function updateGuide(entry,source){
 const key=source.flags[NS].contentKey,ownership={...entry.ownership,default:source.ownership.default};
 if(!source.ownership.default)for(const u of game.users)if(!u.isGM)ownership[u.id]=0;
 await entry.update({ownership,[`flags.${NS}.contentKey`]:key});
 if(entry.pages?.contents||Array.isArray(entry.pages)){
  const pages=Array.from(entry.pages.contents??entry.pages),names=new Set(pages.map(p=>norm(p.name)));
  const extra=source.pages.filter(p=>!names.has(norm(p.name))).map(p=>{const d=foundry.utils.deepClone(p);delete d._id;return d;});
  if(extra.length)await entry.createEmbeddedDocuments('JournalEntryPage',extra);
  if(!source.ownership.default&&pages.length)await entry.updateEmbeddedDocuments('JournalEntryPage',pages.map(p=>({_id:p.id,ownership:{default:-1}})));
 }
}
export async function openGuide(key='player-guide'){
 if(!game.user.isGM&&['gm-guide','missions-guide'].includes(key))throw new Error('This guide is for the GM.');
 let entry=game.journal.find(j=>j.getFlag(NS,'contentKey')===key);
 if(!entry){const docs=await game.packs.get(`${NS}.guides`)?.getDocuments();entry=docs?.find(j=>j.getFlag(NS,'contentKey')===key);}
 if(!entry)throw new Error('Guide not found. Ask the GM to run world setup.');return entry.sheet.render(true);
}
export async function installWorld({assignments={},allMaps=true,openStart=false,notify=true}={}){
 if(!game.user.isGM||!isLeader())throw new Error('Use the active GM account to set up the world.');
 if(setupRunning)return setupRunning;
 const pending=installWorldNow({assignments,allMaps,openStart,notify});setupRunning=pending;
 try{return await pending;}finally{setupRunning=null;}
}
async function installWorldNow({assignments,allMaps,openStart,notify}){
 const data=await content(),alreadySet=Boolean(game.settings.get(NS,'worldSetup')||game.settings.get(NS,'contentVersion'));
 const counts={actors:0,items:0,journals:0,scenes:0};
 const peopleFolder=await folder('Actor','The Smoke — Crew & People'),vehicles=await folder('Actor','The Smoke — Motors'),items=await folder('Item','The Smoke — Equipment'),journals=await folder('JournalEntry','The Smoke — Guides');
 for(const source of data.items){
  const key=source.flags[NS].contentKey,existing=game.items.find(i=>i.getFlag(NS,'contentKey')===key||(i.type===source.type&&norm(i.name)===norm(source.name)));
  if(existing){if(!existing.getFlag(NS,'contentKey'))await existing.setFlag(NS,'contentKey',key);continue;}
  const d=foundry.utils.deepClone(source);delete d._id;d.folder=items;await Item.implementation.create(d);counts.items++;
 }
 for(const source of data.actors){
  let actor=game.actors.find(a=>actorMatches(a,source));
  if(!actor){const d=foundry.utils.deepClone(source);delete d._id;d.folder=d.type==='vehicle'?vehicles:peopleFolder;actor=await Actor.implementation.create(d);counts.actors++;}
  else if(!actor.getFlag(NS,'contentKey'))await actor.update({[`flags.${NS}.contentKey`]:source.flags[NS].contentKey,...(actor.type==='character'?{[`flags.${NS}.pregen`]:true}:{})});
  if(actor.type==='character'){
   const user=game.users.get(assignments[source.flags[NS].npcKey]);
   if(user&&!user.isGM){await actor.update({[`ownership.${user.id}`]:3});if(!user.character)await user.update({character:actor.id});}
  }
 }
 for(const source of data.journals){
  const key=source.flags[NS].contentKey,names=[source.name,...(guideAliases[key]??[])].map(norm);
  const existing=game.journal.find(j=>j.getFlag(NS,'contentKey')===key||names.includes(norm(j.name)));
  if(existing){await updateGuide(existing,source);continue;}
  const d=foundry.utils.deepClone(source);delete d._id;d.folder=journals;await JournalEntry.implementation.create(d);counts.journals++;
 }
 if(allMaps)counts.scenes=(await importAllMaps({notify:false})).created;
 else for(const id of ['LDN-HACKNEY','LDN-OVERVIEW','LDP-ARCHES','LDP-FLAT','LDP-HOSPITAL','LDP-CUSTODY']){const before=game.scenes.size;await findOrImportScene(id);counts.scenes+=game.scenes.size-before;}
 const flat=await findOrImportScene('LDP-FLAT'),arches=await findOrImportScene('LDP-ARCHES'),hackney=await findOrImportScene('LDN-HACKNEY');
 if(!alreadySet){
  const crew=game.actors.filter(a=>a.type==='character'&&a.getFlag(NS,'pregen'));
  const living=zonesOf(flat).find(z=>z.service==='safehouse')??zonesOf(flat)[0],g=flat.grid.size;
  for(let i=0;i<crew.length;i++)if(!flat.tokens.some(t=>t.actorId===crew[i].id))await placeToken(flat,crew[i],living.rect[0]+150+(i%2)*g*1.5,living.rect[1]+200+Math.floor(i/2)*g*1.5,{flags:{openingCrew:true}});
  for(const [key,x,y]of [['pat',2250,1300],['spanner',1400,400],['kez',650,600]]){const a=game.actors.find(a=>a.getFlag(NS,'npcKey')===key&&!a.getFlag(NS,'streetLife'));if(a&&!arches.tokens.some(t=>t.actorId===a.id))await placeToken(arches,a,x,y);}
 }
 for(const id of ['LV12','LV23','LV26','LV06','LV01']){
  if(hackney.tokens.some(t=>t.getFlag(NS,'starter')&&(t.getFlag(NS,'catalogId')??t.actor?.getFlag(NS,'catalogId'))===id))continue;
  const actor=game.actors.find(a=>a.getFlag(NS,'catalogId')===id&&!a.getFlag(NS,'streetLife')&&!a.getFlag(NS,'dedicatedFor'));
  const road=zonesOf(hackney).find(z=>z.kind==='road');if(!actor||!road)continue;
  const p=lanePoint(road,Math.random,null,hackney);await placeToken(hackney,actor,p.x,p.y,{rotation:p.rotation,flags:{starter:true,issued:true,catalogId:id}});
 }
 await game.settings.set(NS,'worldSetup',true);await game.settings.set(NS,'contentVersion',VERSION);
 await repairAllSceneBackgrounds({notify:false});
 if(notify)ui.notifications.info(`The Smoke: added ${counts.actors} actors, ${counts.items} items, ${counts.journals} guides and ${counts.scenes} scenes.`);
 if(openStart){await flat.activate();await flat.view();}
 return counts;
}
export async function setupWorld(){
 if(!game.user.isGM||!isLeader())throw new Error('Use the active GM account to set up the world.');
 const users=game.users.filter(u=>!u.isGM),names=[['jaz','Jaz Kaur'],['tealeaf','Danny “Tealeaf” Doyle'],['femi','Femi Adebayo'],['sal','Big Sal Moretti']];
 const owners=users.length?names.map(([key,label])=>`<label>${label}<select name="owner-${key}"><option value="">Keep current assignment</option>${users.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>`).join(''):'<p>Add player accounts to assign the pregens.</p>';
 const form=await foundry.applications.api.DialogV2.input({window:{title:'Welcome to the Smoke'},content:`<div class="the-smoke"><p>Import London, equipment, pregens and guides. Existing characters and notes are preserved. New worlds begin in Your Flat.</p>${owners}<label><input type="checkbox" name="allMaps" checked> Import the complete atlas</label><label><input type="checkbox" name="openStart" checked> Open Your Flat</label></div>`,ok:{label:'Set up the world',icon:'fa-solid fa-city'}});
 if(!form)return;
 await installWorld({assignments:Object.fromEntries(names.map(([key])=>[key,form['owner-'+key]])),allMaps:form.allMaps!==false,openStart:Boolean(form.openStart)});
 await game.settings.set(NS,'migrationVersion',2);return openGuide('gm-guide');
}
export async function migrateWorld(){
 if(!isLeader()||Number(game.settings.get(NS,'migrationVersion'))>=2)return;
 if(!(game.settings.get(NS,'worldSetup')||game.settings.get(NS,'contentVersion')))return;
 const restore=new Map(),vehicles=[];
 for(const scene of game.scenes)for(const token of scene.tokens){
  if(token.actor?.type!=='vehicle')continue;vehicles.push(token);
  if(token.getFlag(NS,'dedicatedVehicle'))continue;
  for(const grant of token.getFlag(NS,'vehicleDriverGrant')??[]){const key=token.actorId+':'+grant.userId,old=restore.get(key);if(!old||Number(grant.before)<old.before)restore.set(key,{actor:game.actors.get(token.actorId),userId:grant.userId,before:Number(grant.before)||0});}
 }
 for(const {actor,userId,before}of restore.values())if(actor)await actor.update({[`ownership.${userId}`]:before});
 for(const vehicle of vehicles)if((vehicle.getFlag(NS,'vehicleOccupants')??[]).length)await applyDriverControl(vehicle,await reconcileOccupants(vehicle));
 const counts=await installWorld({allMaps:true,notify:false});
 await game.settings.set(NS,'migrationVersion',2);
 ui.notifications.info(`The Smoke upgraded to ${VERSION}. Existing characters preserved; ${counts.scenes} maps and missing reference content added.`);
}
export async function diagnostics(){
 const {atlas,places}=await loadAtlas(),all=[...atlas.maps,...places.maps],by=new Map(all.map(m=>[m.id,m])),issues=[];
 for(const m of all)for(const l of m.links||[]){const to=by.get(l.to);if(!to){issues.push(`Unknown destination ${m.id} → ${l.to}`);continue;}if(l.kind==='edge'&&!to.links.some(b=>b.to===m.id&&b.toEdge===l.edge&&b.road===l.road))issues.push(`Unpaired exit ${m.id} → ${l.to}`);}
 for(const p of game.system.packs??[])if(!game.packs.get(`${NS}.${p.name}`))issues.push(`Compendium not registered: ${p.name}`);
 for(const scene of game.scenes)for(const t of scene.tokens){const seat=t.getFlag(NS,'vehicleSeat');if(seat&&!scene.tokens.get(seat.vehicleTokenId))issues.push(`${scene.name}: ${t.name} has a missing vehicle.`);}
 const checks=[`${atlas.maps.length} street maps`,`${places.maps.length} interiors`,`${game.system.packs?.length??0} compendiums`,`Active GM: ${game.users.activeGM?.name??'none'}`];
 await foundry.applications.api.DialogV2.wait({window:{title:'The Smoke · Diagnostics'},content:`<div class="the-smoke"><h2>${issues.length?'Needs attention':'Structural checks passed'}</h2><ul>${[...checks,...issues].map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>Run the acceptance checks in VALIDATION.md before using the release for a campaign.</p></div>`,buttons:[{action:'close',label:'Close'}]});
 return {ok:!issues.length,issues,checks};
}
