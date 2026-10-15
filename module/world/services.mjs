import {NS} from '../config.mjs';
import {arrivedAt,ukPlate} from '../rules/jobs-core.mjs';
import {zonesOf,tokenRect,distanceSquares} from './spawn.mjs';
import {registerHandler,request,card,esc} from './net.mjs';
import {VEHICLE_ACTIONS} from '../vehicles/vehicle-boarding.mjs';

const DEFINITIONS={
 respray:{label:'Respray & new plates',services:['respray'],setting:'resprayCost',price:100,hint:'Clear Heat and replace the plate when police cannot see you.'},
 clothes:{label:'Change clothes',services:['clothes'],setting:'clothesCost',price:25,hint:'Lose one Heat star when police cannot see you.'},
 repair:{label:'Garage repair',services:['respray','chop','gang'],setting:'repairCost',price:10,hint:'Restore missing Body; the price is per Body point.'}
};
export function registerServiceSettings(){
 for(const d of Object.values(DEFINITIONS))game.settings.register(NS,d.setting,{name:`Services: ${d.label} (£)`,hint:d.hint,scope:'world',config:true,type:Number,default:d.price,range:{min:0,max:1000,step:5}});
}
function tokenFor(actor,{sceneId,tokenId}={}){
 if(actor.token)return actor.token;
 const scene=(sceneId&&game.scenes.get(sceneId))||canvas?.scene;
 return scene?.tokens.find(t=>t.actorId===actor.id&&(!tokenId||t.id===tokenId));
}
export function observedByPolice(token,actor=token?.actor){
 if(!token)return false;
 return token.parent.tokens.some(t=>{
  const police=t.getFlag(NS,'police');if(!police)return false;
  if(police.unit==='heli')return Number(actor?.system.heat?.value)>=3&&!token.getFlag(NS,'indoors');
  return distanceSquares(t,token)<=14;
 });
}
function context(actor,options={}){
 const token=tokenFor(actor,options);if(!token)throw new Error('Place your character on the service map first.');
 const seat=token.getFlag(NS,'vehicleSeat'),vehicle=seat&&token.parent.tokens.get(seat.vehicleTokenId);
 return {token,seat,vehicle};
}
function priceFor(kind,vehicle){
 const d=DEFINITIONS[kind],cost=Math.max(0,Math.round(Number(game.settings.get(NS,d.setting))||0));
 return kind==='repair'?cost*Math.max(0,Number(vehicle?.actor.system.vehicle.body.max)-Number(vehicle?.actor.system.vehicle.body.value)):cost;
}
function offerFor(actor,kind,options={}){
 const def=DEFINITIONS[kind];if(!def)throw new Error('Unknown service.');
 const c=context(actor,options),subject=kind==='clothes'?c.token:c.vehicle;
 if(!subject)throw new Error('Take the driver seat in the vehicle you want serviced.');
 if(kind!=='clothes'&&c.seat?.seatId!=='pilot')throw new Error('Only the seated driver can bring a vehicle in.');
 const zone=zonesOf(subject.parent).find(z=>def.services.includes(z.service)&&arrivedAt(zonesOf(subject.parent),z.id,tokenRect(subject)));
 if(!zone)throw new Error(kind==='clothes'?'Go to a clothes marker first.':'Pull up at a suitable garage or The Arches first.');
 if(kind!=='repair'&&observedByPolice(subject,actor))throw new Error('The police can see you. Lose them before using this service.');
 if(kind==='clothes'&&Number(actor.system.heat.value)<=0)throw new Error('Your Heat is already clear.');
 if(kind==='respray'&&subject.actor.system.vehicle.plateless)throw new Error('This vehicle has no plate to replace.');
 if(kind==='repair'&&subject.actor.system.vehicle.destroyed)throw new Error('This vehicle is written off. Ask the GM about recovery or replacement.');
 if(kind==='repair'&&Number(subject.actor.system.vehicle.body.value)>=Number(subject.actor.system.vehicle.body.max))throw new Error('The vehicle is already fully repaired.');
 return {...c,zone,kind,label:def.label,price:priceFor(kind,c.vehicle),hint:def.hint};
}
export async function openServices(actor){
 if(!actor?.isPerson||!actor.isOwner)throw new Error('Choose an owned character.');
 const options={sceneId:actor.token?.parent.id??canvas?.scene?.id,tokenId:actor.token?.id};
 const choices=[];
 for(const kind of Object.keys(DEFINITIONS)){try{choices.push(offerFor(actor,kind,options));}catch(_e){}}
 if(!choices.length)throw new Error('No service is available here. Visit a clothes marker, or drive into a garage out of police sight.');
 const form=await foundry.applications.api.DialogV2.input({window:{title:`Local services · ${actor.name}`},content:`<div class="the-smoke"><p>Cash £${actor.system.cash}. Your stash is protected.</p><select name="kind">${choices.map(c=>`<option value="${c.kind}">${esc(c.label)} · £${c.price} · ${esc(c.zone.name)}</option>`).join('')}</select>${choices.map(c=>`<p><b>${esc(c.label)}:</b> ${esc(c.hint)}</p>`).join('')}</div>`,ok:{label:'Pay & use service'}});
 if(!form)return;
 const chosen=choices.find(c=>c.kind===form.kind);if(!chosen)throw new Error('Choose a listed service.');
 return request('service.use',{actorUuid:actor.uuid,kind:chosen.kind,quote:chosen.price,...options});
}
registerHandler('service.use',async({actorUuid,kind,quote,sceneId,tokenId,userId})=>{
 const doc=await fromUuid(actorUuid),actor=doc?.actor??doc,user=game.users.get(userId);
 if(!actor?.isPerson||!user||(!user.isGM&&!actor.testUserPermission(user,'OWNER')))throw new Error('Not your character.');
 const c=offerFor(actor,kind,{sceneId,tokenId});
 if(Number(quote)!==c.price)throw new Error('The price changed. Open services again to review it.');
 if(Number(actor.system.cash)<c.price)throw new Error(`You need £${c.price} in your pockets. Your stash is protected.`);
 const patch={'system.cash':Number(actor.system.cash)-c.price};
 if(kind==='clothes'){
  patch['system.heat.value']=Math.max(0,Number(actor.system.heat.value)-1);
  patch['system.heat.coolSince']=0;patch[`flags.${NS}.changedClothesAt`]=Date.now();
 }else if(kind==='respray'){
  const old=c.vehicle.getFlag(NS,'plate');let plate;do{plate=ukPlate();}while(plate===old);
  await c.vehicle.update({[`flags.${NS}.plate`]:plate,[`flags.${NS}.previousPlate`]:old??null,[`flags.${NS}.marker`]:null,[`flags.${NS}.resprayed`]:true,[`flags.${NS}.hotUntil`]:0},{acVehicleCarry:true});
  patch['system.heat.value']=0;patch['system.heat.coolSince']=0;
 }else await c.vehicle.actor.update({'system.vehicle.body.value':c.vehicle.actor.system.vehicle.body.max});
 await actor.update(patch);
 await card('LOCAL SERVICE',c.label,`<p>${esc(actor.name)} pays £${c.price} at ${esc(c.zone.name)}. ${kind==='repair'?'Body restored.':kind==='respray'?'Heat cleared; new plates fitted.':'One Heat star removed.'}</p>`,'cash');
 return {kind,price:c.price,heat:actor.system.heat.value};
});
export function installServices(){
 VEHICLE_ACTIONS.push(vt=>{
  const pilot=(vt.getFlag(NS,'vehicleOccupants')??[]).find(o=>o.seatId==='pilot'),actor=pilot&&vt.parent.tokens.get(pilot.tokenId)?.actor;
  if(!actor?.isOwner)return [];
  return [{icon:'fa-solid fa-screwdriver-wrench',title:'Local services',fn:()=>openServices(actor)}];
 });
 Hooks.on('renderTokenHUD',(hud,html)=>{
  const root=html?.querySelector?html:html?.[0],token=hud.document??hud.object?.document;
  if(!root||!token?.actor?.isPerson||!token.actor.isOwner||root.querySelector('.smoke-service-hud'))return;
  const col=root.querySelector('.col.left');if(!col)return;
  const button=document.createElement('button');button.type='button';button.className='control-icon smoke-service-hud';button.dataset.tooltip='Local services';button.innerHTML='<i class="fa-solid fa-shop" inert></i>';
  button.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();openServices(token.actor).catch(e=>ui.notifications.warn(e.message));});col.append(button);
 });
}
