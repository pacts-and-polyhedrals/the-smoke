// Persistent scene-owned smoke/fire areas. Their position is fixed in the world, not
// attached to a victim; expiry never erases a GM's original cover or unrelated gas.
import {NS} from '../config.mjs';
import {isLeader} from './net.mjs';
import {tokenCentre} from './spawn.mjs';
import {withActionLocks,worldSeconds} from './action-locks.mjs';
const KEY='weaponAreas';let installed=false,ticking=false,overlay=null;
const areas=s=>s?.getFlag?.(NS,KEY)||{};
export function insideArea(t,a){if(!t?.parent)return false;const [x,y]=tokenCentre(t);return Math.hypot(x-a.x,y-a.y)<=a.radius;}
function distancePointSegment(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,k=dx*dx+dy*dy;const f=k?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/k)):0;return Math.hypot(px-(ax+f*dx),py-(ay+f*dy));}
export function smokeBlocks(from,to){if(!from||!to||from.parent?.id!==to.parent?.id)return false;
 const [ax,ay]=tokenCentre(from),[bx,by]=tokenCentre(to);
 return Object.values(areas(from.parent)).some(a=>a.kind==='smoke'&&a.expiresAt>worldSeconds()&&!(insideArea(from,a)&&insideArea(to,a))&&distancePointSegment(a.x,a.y,ax,ay,bx,by)<=a.radius);
}
export async function createWeaponArea(scene,{id,kind,target,miss=false}){
 if(!['smoke','fire'].includes(kind)||!target||target.parent?.id!==scene.id)throw new Error('Invalid weapon area.');
 return withActionLocks([`areas:${scene.id}`],async()=>{
  const all=foundry.utils.deepClone(areas(scene));if(all[id])return all[id];const g=scene.grid.size||100,[x,y]=tokenCentre(target),combat=game.combats?.find(c=>c.scene?.id===scene.id&&c.active);
  all[id]={id,kind,x:Math.min(scene.width-g/2,x+(miss?g:0)),y,radius:g*(kind==='smoke'?2:1),createdAt:worldSeconds(),expiresAt:worldSeconds()+(kind==='smoke'?60:180),combatId:combat?.id||null,untilRound:combat?Number(combat.round||0)+(kind==='smoke'?2:3):null};
  await scene.setFlag(NS,KEY,all);await refreshAreaConditions(scene);drawWeaponAreas();return all[id];
 });
}
async function refreshAreaConditions(scene){
 const active=Object.values(areas(scene)).filter(a=>a.expiresAt>worldSeconds());
 for(const t of scene.tokens||[]){const a=t.actor;if(!a||a.type==='vehicle')continue;
  const clouds=active.filter(x=>x.kind==='smoke'&&insideArea(t,x)).map(x=>x.id),gas=a.items.find(i=>i.type==='condition'&&i.name==='Gassed');
  if(clouds.length){
   if(!gas){const [item]=await a.createEmbeddedDocuments('Item',[{name:'Gassed',type:'condition',img:'icons/svg/aura.svg',system:{category:'head',severity:2,description:'Smoke: -2 Aim and Savvy; clears after fresh air.',removal:'Leave smoke; one round or six Watch seconds in fresh air.'},flags:{[NS]:{weaponAreaGas:true,clouds}}}]);}
   else if(gas.getFlag(NS,'weaponAreaGas'))await gas.update({[`flags.${NS}.clouds`]:clouds,[`flags.${NS}.freshAirAt`]:null});
  }else if(gas?.getFlag(NS,'weaponAreaGas')){
   const at=gas.getFlag(NS,'freshAirAt');if(at==null)await gas.update({[`flags.${NS}.freshAirAt`]:worldSeconds()+6});else if(worldSeconds()>=at)await gas.delete();
  }
  if(active.some(x=>x.kind==='fire'&&insideArea(t,x))&&!a.items.some(i=>i.name==='Burning'))await a.addCondition('Burning');
 }
}
export async function tickWeaponAreas(){if(!isLeader()||ticking)return;ticking=true;try{for(const s of game.scenes||[]){const before=areas(s);if(!Object.keys(before).length&&!s.tokens.some(t=>t.actor?.items.some(i=>i.getFlag?.(NS,'weaponAreaGas'))))continue;const keep={};for(const [id,a]of Object.entries(before)){const combat=a.combatId&&game.combats?.get?.(a.combatId);if(a.expiresAt<=worldSeconds()||(combat&&Number(combat.round)>=a.untilRound))continue;keep[id]=a;}
 if(Object.keys(keep).length!==Object.keys(before).length){const patch={};for(const id of Object.keys(before))if(!keep[id])patch[`flags.${NS}.${KEY}.-=${id}`]=null;await s.update(patch);}
 await refreshAreaConditions(s);
 }drawWeaponAreas();}finally{ticking=false;}}
export function drawWeaponAreas(){
 if(!globalThis.canvas?.ready||!globalThis.PIXI)return;
 try{overlay?.parent?.removeChild(overlay);overlay?.destroy?.({children:true});overlay=null;const parent=canvas.controls||canvas.interface;if(!parent?.addChild)return;overlay=new PIXI.Container();parent.addChild(overlay);
 for(const a of Object.values(areas(canvas.scene)).filter(a=>a.expiresAt>worldSeconds())){const g=new PIXI.Graphics(),color=a.kind==='smoke'?0x82909b:0xf79532;
 if(g.circle){g.circle(a.x,a.y,a.radius).fill({color,alpha:.25}).stroke({color,alpha:.8,width:3});}else{g.lineStyle(3,color,.8);g.beginFill(color,.25);g.drawCircle(a.x,a.y,a.radius);g.endFill();}overlay.addChild(g);}
 }catch(e){console.warn('The Smoke | weapon area overlay',e);}
}
export function installWeaponAreas(){if(installed)return;installed=true;const tick=()=>void tickWeaponAreas().catch(e=>console.warn('The Smoke | weapon area',e));Hooks.on('updateWorldTime',tick);Hooks.on('updateCombat',tick);Hooks.on('canvasReady',()=>{drawWeaponAreas();tick();});Hooks.on('updateScene',(s,ch)=>{if(s.id===canvas?.scene?.id)drawWeaponAreas();});Hooks.on('updateToken',(t,ch)=>{if(Object.hasOwn(ch,'x')||Object.hasOwn(ch,'y'))tick();});tick();}
