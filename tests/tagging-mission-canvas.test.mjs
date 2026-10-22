import './runtime-stub.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const NS='the-smoke',load=name=>JSON.parse(readFileSync(new URL(`../data/${name}`,import.meta.url),'utf8'));
const atlas=load('london-street-atlas.json'),venues=load('london-venues.json'),places=load('london-places.json');
const catalogue=load('tagging-catalogue.json'),missionList=load('tagging-missions.json').missions;
const {activePaintTargets,missionPaintPosition}=await import('../module/graffiti/mission-placements.mjs');
const {registerMissionSettings}=await import('../module/world/missions.mjs');
const {registerGraffitiSettings,installGraffiti,ensureMissionPaintSpotsOnScene,restoreActiveMissionPaintSpots}=await import('../module/graffiti/runtime.mjs');
const {request,dispatch}=await import('../module/world/net.mjs');

assert.equal(missionList.length,42);
assert.equal(catalogue.sites.length,57);
const active=Object.fromEntries(missionList.map(m=>[m.id,{status:'active'}]));
let located=0,approx=0;
const foundSites=new Set();
for(const map of atlas.maps){
 const list=activePaintTargets(map.id,catalogue,missionList,active);
 for(const {site,stop} of list){
  const result=missionPaintPosition(map,site,stop,venues.maps,places.maps,[],100);
  assert.ok(Number.isFinite(result.x)&&Number.isFinite(result.y),`${site.id} has a valid centre`);
  assert.ok(result.x>0&&result.x<map.width&&result.y>0&&result.y<map.height,`${site.id} is inside street-map bounds`);
  const road=map.zones.find(z=>z.id===result.roadZoneId);
  assert.ok(road&&['road','junction'].includes(road.kind),`${site.id} uses an accessible road`);
  const [x,y,w,h]=road.rect;
  assert.ok(result.x>=x&&result.x<=x+w&&result.y>=y&&result.y<=y+h,`${site.id} marker is physically on road`);
  located++;foundSites.add(site.id);if(result.approximate)approx++;
 }
}
assert.equal(located,54,'all 54 actually referenced mission targets have a usable position');
for(const site of catalogue.sites.filter(s=>!foundSites.has(s.id))){
 const map=atlas.maps.find(m=>m.id===site.sceneMapId);
 const r=missionPaintPosition(map,site,null,venues.maps,places.maps,[],100);
 assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));
 assert.ok(r.roadZoneId);
 located++;if(r.approximate)approx++;
}
assert.equal(located,57,'all 57 planned sites are placeable, including three not yet used by the 42 missions');
assert.equal(approx,6,'only six sites without anchors need a GM location refinement');
assert.equal(activePaintTargets('LDN-HACKNEY',catalogue,missionList,{}).length,0,'no unrelated mission spots appear');

const gm={id:'gm',isGM:true,active:true},player={id:'p1',isGM:false,active:true};
game.user=gm;game.users=Object.assign([gm,player],{activeGM:gm,get:id=>[gm,player].find(u=>u.id===id),filter:fn=>[gm,player].filter(fn)});
const settings=new Map();
game.settings.get=(ns,key)=>settings.get(key);
game.settings.set=async(ns,key,value)=>{settings.set(key,JSON.parse(JSON.stringify(value)));Hooks.callAll('smokeMissionsChanged');return value};
registerMissionSettings();registerGraffitiSettings();
let nextToken=0,nextActor=0,creates=0;
const actors=[];
const character={id:'char1',name:'Patch',type:'character',hasPlayerOwner:true,getFlag:()=>null};actors.push(character);
game.actors=Object.assign(actors,{get:id=>actors.find(a=>a.id===id)});
globalThis.Actor.implementation={create:async data=>{
 const actor={id:`paint-actor-${++nextActor}`,name:data.name,type:data.type,flags:data.flags,system:data.system,prototypeToken:data.prototypeToken,getFlag:(ns,k)=>data.flags?.[ns]?.[k],
   async getTokenDocument(){return {toObject:()=>({actorId:actor.id,name:data.name,width:data.prototypeToken?.width??.45,height:data.prototypeToken?.height??.45,flags:{[NS]:{}}})}}};
 actors.push(actor);return actor;
}};
function makeScene(map){
 const flags={[NS]:{streetAtlas:{id:map.id},zoneGraph:{zones:map.zones}}};
 const tokens=[];
 const scene={id:`sc-${map.id}`,name:map.name,width:map.width,height:map.height,grid:{size:100},flags,
  getFlag:(ns,k)=>flags[ns]?.[k],
  tokens:Object.assign(tokens,{get:id=>tokens.find(t=>t.id===id),find:fn=>Array.prototype.find.call(tokens,fn)}),
  async createEmbeddedDocuments(type,data,options={}){
   assert.equal(type,'Token');
   const out=[];
   for(const d of data){
    const doc={...d,id:`t${++nextToken}`,parent:scene,actor:game.actors.get(d.actorId),getFlag(ns,k){return this.flags?.[ns]?.[k]},
      async update(patch){Object.assign(doc,patch);return doc},toObject:()=>JSON.parse(JSON.stringify(d))};
    assert.notEqual(Hooks.call('preCreateToken',doc,d,options,gm.id),false,'mission markers do not cancel token creation');
    tokens.push(doc);out.push(doc);creates++;Hooks.callAll('createToken',doc,options,gm.id);
   }
   return out;
  },
  async deleteEmbeddedDocuments(type,ids){for(const id of ids){let i=tokens.findIndex(t=>t.id===id);if(i>=0)tokens.splice(i,1)}return []}
 };
 return scene;
}
const sceneList=[...atlas.maps.filter(m=>['LDN-HACKNEY','LDN-HAGGERSTON','LDN-HACKNEY-ROAD'].includes(m.id)).map(makeScene)];
game.scenes=Object.assign(sceneList,{get:id=>sceneList.find(x=>x.id===id),find:fn=>Array.prototype.find.call(sceneList,fn)});
globalThis.canvas={scene:sceneList[0]};
installGraffiti();
const byMap=id=>sceneList.find(s=>s.getFlag(NS,'streetAtlas').id===id);
const marks=scene=>scene.tokens.filter(t=>t.getFlag(NS,'tagSpot')?.siteId);
const idOf=t=>t.getFlag(NS,'tagSpot')?.siteId;

// The very first two commissions must work, and the next should not silently
// fail simply because nobody dragged a paint actor onto the next destination.
await request('mission.start',{id:'tg-intro-01',actorIds:['char1']});
assert.deepEqual(marks(byMap('LDN-HACKNEY')).map(idOf),['SP-HC-MORNING-WALL']);
assert.equal(marks(byMap('LDN-HACKNEY'))[0].getFlag(NS,'tagSpot')?.approved,true,'Pat approves the practice wall');
assert.equal(marks(byMap('LDN-HACKNEY'))[0].hidden,false);
// A pre-existing, manually positioned commission hotspot is never replaced.
const [handPlaced]=await byMap('LDN-HACKNEY-ROAD').createEmbeddedDocuments('Token',[{
  name:'Queensbridge custom placement',actorId:actors.find(a=>a.getFlag(NS,'graffitiSpotActor'))?.id,
  x:444,y:666,width:.45,height:.45,flags:{[NS]:{tagSpot:{siteId:'SP-HR-QUEENSBRIDGE',surface:'shutter',createdByGM:true}}}
}]);
const savedXY=[handPlaced.x,handPlaced.y];
await request('mission.start',{id:'tg-intro-02',actorIds:['char1']});
assert.ok(marks(byMap('LDN-HAGGERSTON')).some(t=>idOf(t)==='SP-LF-KINGSLAND-ARCH'));
assert.equal(marks(byMap('LDN-HACKNEY-ROAD')).filter(t=>idOf(t)==='SP-HR-QUEENSBRIDGE').length,1);
assert.equal(marks(byMap('LDN-HACKNEY-ROAD')).find(t=>idOf(t)==='SP-HR-QUEENSBRIDGE').id,handPlaced.id,'pre-existing GM spot ID retained');
assert.deepEqual([handPlaced.x,handPlaced.y],savedXY,'GM-authored location stays exactly where placed');
let total=creates;
await Promise.all([ensureMissionPaintSpotsOnScene(byMap('LDN-HAGGERSTON')),ensureMissionPaintSpotsOnScene(byMap('LDN-HAGGERSTON'))]);
assert.equal(creates,total,'concurrent arrivals do not duplicate canvas markers');

// A later commission with one site on an existing scene and another scene not
// yet imported: first target spawns at mission start, absent map retries on arrival.
await request('mission.start',{id:'tg-intro-03',actorIds:['char1']});
assert.ok(marks(byMap('LDN-HAGGERSTON')).some(t=>idOf(t)==='SP-LF-LIDO-BUS'),'a third commission gets its bus paint canvas');
// 0.5.22: and that canvas is an actual bus, parked out of service at the kerb, not a marker.
const lido=marks(byMap('LDN-HAGGERSTON')).find(t=>idOf(t)==='SP-LF-LIDO-BUS');
assert.equal(lido.actor?.type,'vehicle','the London Fields site is a real vehicle');
assert.equal(lido.actor?.getFlag(NS,'catalogId'),'LV28','a Clippermaster Bus');
assert.deepEqual([lido.width,lido.height],[2,6]);
assert.equal(lido.getFlag(NS,'parked'),true);assert.equal(lido.getFlag(NS,'locked'),true);assert.equal(lido.getFlag(NS,'traffic'),undefined,'never part of the moving traffic');
assert.equal(lido.name,'London Fields stationary bus');assert.ok([0,90,180,270].includes(lido.rotation),'lined up with the road');
{const map=atlas.maps.find(m=>m.id==='LDN-HAGGERSTON'),cx=lido.x+lido.width*50,cy=lido.y+lido.height*50;
 assert.ok(map.zones.some(z=>['road','junction'].includes(z.kind)&&cx>=z.rect[0]&&cx<=z.rect[0]+z.rect[2]&&cy>=z.rect[1]&&cy<=z.rect[1]+z.rect[3]),'parked on the road');}
const victoria=makeScene(atlas.maps.find(m=>m.id==='LDN-VICTORIA-PARK'));sceneList.push(victoria);
Hooks.callAll('createScene',victoria);
for(let i=0;i<100&&!marks(victoria).some(t=>idOf(t)==='SP-VW-WATERDEN-BUS');i++)await new Promise(res=>setTimeout(res,5));
assert.ok(marks(victoria).some(t=>idOf(t)==='SP-VW-WATERDEN-BUS'),'later imported map gets missing target');
assert.equal(marks(victoria).filter(t=>idOf(t)==='SP-VW-WATERDEN-BUS').length,1);
// A world upgraded from 0.5.21 has a plain marker where the Waterden Road bus belongs: it becomes the bus.
{const bus=marks(victoria).find(t=>idOf(t)==='SP-VW-WATERDEN-BUS');assert.equal(bus.actor?.type,'vehicle');
 await victoria.deleteEmbeddedDocuments('Token',[bus.id]);
 const paint=actors.find(a=>a.getFlag(NS,'graffitiSpotActor'));
 const [old]=await victoria.createEmbeddedDocuments('Token',[{name:'Waterden Road parked bus',actorId:paint.id,x:bus.x,y:bus.y,width:.45,height:.45,
   flags:{[NS]:{tagSpot:{siteId:'SP-VW-WATERDEN-BUS',surface:'bus',missionPaint:true,createdByGM:true}}}}]);
 await ensureMissionPaintSpotsOnScene(victoria);
 const now=marks(victoria).filter(t=>idOf(t)==='SP-VW-WATERDEN-BUS');
 assert.equal(now.length,1,'one site, one surface');assert.equal(now[0].actor?.type,'vehicle','the old 0.5.21 marker is swapped for a parked bus');
 assert.ok(!victoria.tokens.get(old.id),'and the marker is gone');}
// Two concurrent commissions reuse their common authored wall, and get a
// separate canvas when they require a different target on the same street.
const existingPractice=marks(byMap('LDN-HACKNEY')).find(t=>idOf(t)==='SP-HC-MORNING-WALL');
await request('mission.start',{id:'tg-ch-01',actorIds:['char1']});
assert.equal(marks(byMap('LDN-HACKNEY')).filter(t=>idOf(t)==='SP-HC-MORNING-WALL').length,1);
assert.equal(marks(byMap('LDN-HACKNEY')).find(t=>idOf(t)==='SP-HC-MORNING-WALL').id,existingPractice.id);
const storehouse=marks(byMap('LDN-HACKNEY')).find(t=>idOf(t)==='SP-HC-STOREHOUSE');
assert.ok(storehouse&&storehouse.id!==existingPractice.id);
assert.ok(Math.hypot(storehouse.x-existingPractice.x,storehouse.y-existingPractice.y)>30,'nearby mission markers do not overlap');
assert.equal(actors.filter(a=>a.getFlag(NS,'graffitiSpotActor')).length,1,'all missions share one reusable Paintable Surface actor');
assert.equal(actors.filter(a=>a.getFlag(NS,'catalogId')==='LV28').length,1,'and the buses share one bus actor');


// Existing saved world with markers deleted (or hidden) heals itself, preserving
// unrelated art and previously hand-authored site IDs.
const king=marks(byMap('LDN-HAGGERSTON')).find(t=>idOf(t)==='SP-LF-KINGSLAND-ARCH');
await byMap('LDN-HAGGERSTON').deleteEmbeddedDocuments('Token',[king.id]);
let repair=await request('graffiti.repairMissionSpots',{sceneId:byMap('LDN-HAGGERSTON').id});
assert.equal(repair.created,1,'GM repairs missing scene token without re-running the mission');
const newKing=marks(byMap('LDN-HAGGERSTON')).find(t=>idOf(t)==='SP-LF-KINGSLAND-ARCH');assert.ok(newKing&&newKing.id!==king.id);
newKing.hidden=true;
repair=await request('graffiti.repairMissionSpots',{sceneId:byMap('LDN-HAGGERSTON').id});
assert.equal(repair.restored,1,'hidden auto markers are made visible again');
const count=creates;
Hooks.callAll('smokeTransit',{target:byMap('LDN-HAGGERSTON')});
await restoreActiveMissionPaintSpots();
assert.equal(creates,count,'revisiting map leaves existing markers alone');
await assert.rejects(()=>dispatch('graffiti.repairMissionSpots',{sceneId:victoria.id,userId:player.id}),/Only a GM/,'players cannot forge a placement request');

// The system must not modify arbitrary token hooks or existing GM authored spots.
const generic=await byMap('LDN-HAGGERSTON').createEmbeddedDocuments('Token',[{name:'Not a Graffiti Surface',actorId:'char1',x:100,y:100,width:1,height:1,flags:{}}]);
assert.equal(generic.length,1,'ordinary token creation still works');
console.log('tagging mission canvas: all 57 anchored/road-accessible sites, first and later missions, scene import, arrival, deleted/hidden repair, idempotence and GM authority — ok');
