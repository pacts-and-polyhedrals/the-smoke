import assert from 'node:assert/strict';
import './runtime-stub.mjs';
import {autoSpotZone,autoSpotRoot,nextAutoSpotName,isAutoSiteId,inferredMissionSite,isPublicTransportVehicle,vehicleSurface} from '../module/graffiti/auto-sites.mjs';
import {initialiseAutoPaintToken,renameMovedPaintToken} from '../module/graffiti/runtime.mjs';
import {playerActionsFor,playerContextAllowed} from '../module/interaction/player-context.mjs';
import {buildSvg,STYLE_PRESETS,QUALITY_PRESETS} from '../module/apps/tag-studio.mjs';

const NS='the-smoke';
const graph={zones:[{id:'mare-st',name:'Mare Street 1',roads:['Mare Street'],kind:'road',rect:[0,0,1300,900]},{id:'church',name:'Church Path',kind:'land',rect:[1300,0,400,900]}]};
const scene={id:'scene-hackney',name:'Hackney Central',getFlag:(ns,key)=>key==='zoneGraph'?graph:null};
const at=(root,num)=>({name:`${root} ${num}`,getFlag:(ns,key)=>key==='tagSpot'?{auto:true,root,number:num,siteId:`STREET-${num}`}:null});
assert.equal(autoSpotZone(scene,150,150).id,'mare-st');
assert.equal(autoSpotRoot(scene,150,150),'Mare Street');
assert.deepEqual(nextAutoSpotName(scene,150,150,[]),{name:'Mare Street 1',root:'Mare Street',number:1,zoneId:'mare-st'});
assert.equal(nextAutoSpotName(scene,150,150,[at('Mare Street',1),at('Mare Street',2)]).name,'Mare Street 3');
assert.equal(nextAutoSpotName(scene,1450,250,[at('Mare Street',1)]).name,'Church Path 1');
assert.equal(isAutoSiteId('STREET-scene-hackney-Abc99'),true);
const catalog={sites:[{id:'SP-HC-MORNING-WALL',label:'Morning Lane workshop wall',surface:'wall',sceneMapId:'LDN-HACKNEY'},
 {id:'SP-HC-ROUND-SHUTTER',label:'Round Chapel event-load shutter',surface:'shutter',sceneMapId:'LDN-HACKNEY'}]};
const mission={tagging:{sites:['SP-HC-MORNING-WALL']}};
assert.equal(inferredMissionSite(catalog,mission,{siteId:'STREET-scene-test',auto:true,root:'Morning Lane',surface:'wall'},'LDN-HACKNEY'),'SP-HC-MORNING-WALL');
assert.equal(inferredMissionSite(catalog,mission,{siteId:'STREET-scene-test',auto:true,root:'Mare Street',surface:'wall'},'LDN-HACKNEY'),null);
assert.equal(inferredMissionSite(catalog,mission,{siteId:'STREET-scene-test',auto:true,root:'Morning Lane',surface:'wall'},'LDN-DALSTON'),null);
assert.equal(inferredMissionSite(catalog,mission,{siteId:'SP-HC-MORNING-WALL',surface:'wall'},'LDN-HACKNEY'),'SP-HC-MORNING-WALL');
const bus={name:'Clippermaster Bus 38',actor:{type:'vehicle',name:'Clippermaster Bus'}};
assert.equal(isPublicTransportVehicle(bus),true);assert.equal(vehicleSurface(bus),'bus');
assert.equal(vehicleSurface({name:'Rail carriage 3',actor:{type:'vehicle',name:'Train'}}),'train');
assert.equal(vehicleSurface({name:'Vexa Hatch',actor:{type:'vehicle',name:'Vexa Hatch'}}),null);

const markerActor={type:'npc',getFlag:(ns,key)=>key==='graffitiSpotActor'?true:null};
const previousUser=game.user,previousActors=game.actors;
game.user={id:'gm',isGM:true};game.actors={get:id=>id==='paint-actor'?markerActor:null};
let generated=[];
const doc={actor:markerActor,actorId:'paint-actor',x:100,y:100,width:.5,height:.5,parent:{...scene,grid:{size:100},tokens:[at('Mare Street',1),at('Mare Street',2)]},
 updateSource(patch){generated.push(patch)},getFlag:()=>null};
assert.equal(initialiseAutoPaintToken(doc,{actorId:'paint-actor',x:100,y:100,width:.5,height:.5},{},'gm'),undefined);
assert.equal(generated[0].name,'Mare Street 3');
assert.equal(generated[0][`flags.${NS}.tagSpot`].surface,'wall');
assert.equal(generated[0][`flags.${NS}.tagSpot`].auto,true);
assert.ok(generated[0][`flags.${NS}.tagSpot`].siteId.startsWith('STREET-scene-hackney-'));
assert.equal(initialiseAutoPaintToken(doc,{actorId:'paint-actor',x:100,y:100,flags:{[NS]:{tagSpot:{siteId:'SP-HC-MORNING-WALL'}}}},{},'gm'),undefined,'preserve manual mission hotspot assignment');

const mover={...doc,id:'mover',name:'Mare Street 3',getFlag:(ns,key)=>key==='tagSpot'?{siteId:'STREET-scene-hackney-MOVER',auto:true,root:'Mare Street',number:3,zoneId:'mare-st',surface:'wall'}:null};
const beforeSet=foundry.utils.setProperty;
foundry.utils.setProperty=(data,key,value)=>{data[key]=value;};
const moving={x:1400,y:200};
assert.equal(renameMovedPaintToken(mover,moving,{},'gm'),undefined);
assert.equal(moving.name,'Church Path 1','name updated when marker moved into another road zone');
assert.equal(moving[`flags.${NS}.tagSpot`].siteId,'STREET-scene-hackney-MOVER','identity stays stable when moved');
assert.equal(renameMovedPaintToken(mover,{x:160,y:120},{},'player'),undefined,'players cannot rename markers');
foundry.utils.setProperty=beforeSet;

const tagDoc={id:'sp1',name:'Mare Street 3',actor:markerActor,parent:scene,hidden:false,getFlag:(ns,key)=>key==='tagSpot'?{siteId:'STREET-scene-hackney-123',auto:true,surface:'wall'}:null};
const placeable={document:tagDoc,visible:true,isVisible:true,isOwner:false};
globalThis.canvas={scene};
assert.equal(playerContextAllowed(placeable,game.user),true,'GM can right click to paint');
assert.equal(playerContextAllowed(placeable,{id:'player',isGM:false}),true,'unowned marker accessible to players');
assert.ok(playerActionsFor(tagDoc,{isGM:false}).some(a=>a.title.includes('Tag surface')));
assert.ok(playerActionsFor(tagDoc,game.user).some(a=>a.title.includes('Tag surface')));
const busDoc={...bus,id:'bus1',hidden:false,parent:scene,getFlag:()=>null};
assert.ok(playerActionsFor(busDoc,{isGM:false}).some(a=>a.title.includes('Tag surface')),'real bus is taggable without GM authoring');
game.user=previousUser;game.actors=previousActors;

for(const [style] of Object.entries(STYLE_PRESETS))for(const [quality] of Object.entries(QUALITY_PRESETS)){
  const svg=buildSvg({text:'ASMO 21',style,quality,fill:'#f17dba',outline:'#18232e',accent:'#ffe6a3',shadow:'#f39a44'});
  assert.ok(svg.includes('<path'),'actual vector lettering');
  assert.ok(svg.includes('<use'),'reused glyph outlines');
  assert.ok(!svg.includes('<text'),'no font-dependent decal');
  assert.ok(!svg.includes('http://fonts')&&!svg.includes('font-family='),'no external font fetch');
  assert.ok(svg.length<100000,`${style}/${quality} fits upload size`);
}
assert.notEqual(buildSvg({text:'ASMO',style:'handstyle'}),buildSvg({text:'ASMO',style:'block'}));
console.log('drop-to-paint: named street-zone markers, existing mission linkage, right-click by GM/players, public buses and 5 self-contained SVG font styles across 6 quality outcomes — ok');
