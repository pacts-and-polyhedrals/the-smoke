// Map zones (from Altered Carbon v2.4.8): a token dropped or moved into a zone is assigned to it.
import {NS} from '../config.mjs';

/** Zone id whose rectangle contains the point, or '' when outside every zone. */
export function zoneAt(zones,x,y){
  for(const z of zones||[]){const r=z?.rect;if(!Array.isArray(r)||r.length!==4)continue;
    if(x>=r[0]&&x<r[0]+r[2]&&y>=r[1]&&y<r[1]+r[3])return z.id;}
  return '';
}
function zonesOf(scene){const g=scene?.getFlag?.(NS,'zoneGraph');return Array.isArray(g?.zones)&&g.zones.some(z=>Array.isArray(z.rect))?g.zones:null;}
function centre(scene,data){const size=scene?.grid?.size||100;return {x:Number(data.x||0)+Number(data.width||1)*size/2,y:Number(data.y||0)+Number(data.height||1)*size/2};}
function enabled(){try{return game.settings.get(NS,'autoMapZones')!==false;}catch(_e){return true;}}

export function installMapZones(){
  try{game.settings.register(NS,'autoMapZones',{name:'Assign tokens to map zones automatically',hint:'On zoned maps (London streets and places), a token dropped or moved into a zone is assigned to that zone for range and the Zone Assistant.',scope:'world',config:true,type:Boolean,default:true});}catch(_e){}
  Hooks.on('preCreateToken',(doc,data,options,userId)=>{
    if(userId!==game.user?.id||!enabled())return;const zones=zonesOf(doc.parent);if(!zones)return;
    const c=centre(doc.parent,{x:data.x??doc.x,y:data.y??doc.y,width:data.width??doc.width,height:data.height??doc.height});
    const zone=zoneAt(zones,c.x,c.y);if(zone)doc.updateSource({[`flags.${NS}.zone`]:zone});
  });
  Hooks.on('preUpdateToken',(doc,changes,options,userId)=>{
    if(userId!==game.user?.id||!enabled())return;if(!['x','y','width','height'].some(k=>k in changes))return;
    const zones=zonesOf(doc.parent);if(!zones)return;
    const c=centre(doc.parent,{x:changes.x??doc.x,y:changes.y??doc.y,width:changes.width??doc.width,height:changes.height??doc.height});
    const zone=zoneAt(zones,c.x,c.y);
    if(zone!==(doc.getFlag(NS,'zone')||''))foundry.utils.setProperty(changes,`flags.${NS}.zone`,zone||null);
  });
}
