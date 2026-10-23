import {NS} from '../config.mjs';
import {withActionLocks,boundedInt,worldSeconds} from './action-locks.mjs';
import {opId,newOperationId,receiptFor,sameOperation,beginOperation,completeOperation,issueOnce,consumeOnce} from './transactions.mjs';
import {venueProfile,venueStatus,venueItemContract} from '../rules/venue-contract.mjs';
import {checkVenue} from './venues.mjs';
import {actorToken,mapIdOf,zonesOf,tokenCentre} from './spawn.mjs';
import {card,esc} from './net.mjs';
const copy=x=>foundry.utils.deepClone(x);
function identity(actorId,userId){const a=game.actors.get(actorId),u=game.users.get(userId);if(!a||!u||(!u.isGM&&!a.testUserPermission?.(u,'OWNER')))throw new Error('Not allowed.');return a;}
const requestId=value=>value||(venueStatus().required?opId(value):newOperationId());
export function availableStock(key,name){
  const p=venueProfile(key);if(!p)return Infinity;
  const world=game.settings.get(NS,'venueEconomy')||{},s=world.stock?.[key],day=Math.floor(worldSeconds()/86400);
  const used=s?.day===day?Object.values(s.reservations||{}).filter(x=>x.itemName===name).reduce((n,x)=>n+x.qty,0):0;
  const configured=world.counters?.[key]?.stock?.[name];const limit=Number(configured??p.stockLimits?.[name]??p.stockPerDay??20);
  return Math.max(0,limit-used);
}
async function reserveStock(key,name,qty,id){
  if(!venueProfile(key))return;
  const st=copy(game.settings.get(NS,'venueEconomy')||{});st.stock??={};const day=Math.floor(worldSeconds()/86400);
  let s=st.stock[key];if(!s||s.day!==day)s={day,reservations:{}};
  if(s.reservations[id])return;
  if(availableStock(key,name)<qty)throw new Error('The counter does not have that many in stock today.');
  s.reservations[id]={itemName:name,qty};st.stock[key]=s;await game.settings.set(NS,'venueEconomy',st);
}
async function releaseStock(key,id){
  if(!venueProfile(key))return;const st=copy(game.settings.get(NS,'venueEconomy')||{});const s=st.stock?.[key];
  if(s?.reservations?.[id]){delete s.reservations[id];await game.settings.set(NS,'venueEconomy',st);}
}
function issuedData(lib,qty,actor,p,id){
  const stack=['ammo','drug','consumable'].includes(lib.type)||lib.system.thrown;
  const count=stack?1:qty,units=Number(lib.type==='ammo'?lib.system.perBox||lib.system.quantity||1:lib.system.quantity||1);
  return Array.from({length:count},()=>{
    const d=copy(lib);delete d.price;delete d.unit;delete d._id;d.system.quantity=stack?units*qty:units;
    if(d.type==='outfit')d.system.worn=false;
    if(p){d.flags??={};d.flags[NS]??={};d.flags[NS].provenance={venueId:p.venueId,shopKey:p.key,zoneId:p.zoneId,actorId:actor.id,operationId:id,boughtAt:worldSeconds()};
      const c=venueItemContract(d.name);if(c&&['admission','booking','fare','travelCredit','copy'].includes(c.action))d.flags[NS].credential={issued:true,actorId:actor.id,venueId:p.venueId,shopKey:p.key,kind:c.action,minutes:c.minutes||0,serial:newOperationId(),used:false};
    }
    return d;
  });
}
export async function purchase(args,{definition,stock,at,unit}){
  const {actorId,userId,itemName,qty=1}=args,actor=identity(actorId,userId),id=requestId(args.operationId),n=boundedInt(qty,1,20,'Quantity');
  const signature=JSON.stringify([args.shopKey,itemName,n]);
  return withActionLocks([`actor:${actor.id}`,'venue-economy'],async()=>{
    let old=sameOperation(receiptFor(actor,id),'purchase',signature);if(old?.status==='done')return old.result;
    let shopKey=old?.plan.shopKey||args.shopKey;
    if(!old){
      const ctx=at(userId,actor,shopKey,args);shopKey=ctx?.profile?.key||shopKey;
      const shop=definition(shopKey);if(!shop)throw new Error('Unknown shop.');
      const lib=(await fetch(`systems/${NS}/data/london-items.json`).then(r=>r.json())).items;
      const lines=stock(shopKey,lib,actor.system,actor.items.filter(i=>i.type==='perk').map(i=>i.name));
      const line=lines.find(l=>l.items.some(i=>i.name===itemName));if(!line)throw new Error(`${shop.name} does not sell ${itemName}.`);
      if(line.locked)throw new Error(`${shop.who} won't sell you that until you are Rep ${line.minRep}.`);
      const item=line.items.find(i=>i.name===itemName),cost=item.price*n;
      if(Number(actor.system.cash||0)<cost)throw new Error(`${actor.name} has \u00a3${actor.system.cash}; that is \u00a3${cost}.`);
      if(venueItemContract(itemName)?.issuedOnly)throw new Error('This document can only be issued by its legitimate service.');
      const p=venueProfile(shopKey),t=actorToken(actor),point=t?tokenCentre(t):null;
      const plan={shopKey,itemName,qty:n,cost,documents:issuedData(item,n,actor,p,id),location:t?{mapId:mapIdOf(t.parent),sceneId:t.parent.id,tokenId:t.id,x:point[0],y:point[1],zoneId:p?.zoneId}:null,override:Boolean(ctx?.override),reason:ctx?.reason||null};
      await reserveStock(shopKey,itemName,n,`${actor.id}:${id}`);
      try{old=await beginOperation(actor,id,'purchase',signature,{cost,plan});}catch(e){await releaseStock(shopKey,`${actor.id}:${id}`);throw e;}
    }
    await issueOnce(actor,id,old.plan.documents);
    const result=old.plan.cost;await completeOperation(actor,id,result);
    const token=actorToken(actor),p=venueProfile(old.plan.shopKey);
    if(!old.plan.override)Hooks.callAll('smokeBought',{actor,shop:old.plan.shopKey,venueId:p?.venueId,zoneId:p?.zoneId,itemName,qty:n,proofId:id,operationId:id,actorToken:token,sceneId:old.plan.location?.sceneId,receipt:old.plan});
    await card('PURCHASE',actor.name,`<p>${esc(n)} x ${esc(itemName)} at ${esc(definition(old.plan.shopKey)?.name)}: GBP ${result}.</p>`,'cash');
    return result;
  });
}
export async function sellToDealer(args,{definition,at}){
  const {actorId,userId,itemId,qty=1}=args,actor=identity(actorId,userId),id=requestId(args.operationId),n=boundedInt(qty,1,10000,'Quantity');
  const sig=JSON.stringify([args.shopKey,itemId,n]);
  return withActionLocks([`actor:${actor.id}`],async()=>{
    let rec=sameOperation(receiptFor(actor,id),'dealerSale',sig);if(rec?.status==='done')return rec.result;
    let item=actor.items.get(itemId);
    if(!rec){const ctx=at(userId,actor,args.shopKey,args),key=ctx?.profile?.key||args.shopKey,shop=definition(key);
      if(!item||item.type!=='drug'||!Number(shop?.buysDrugs))throw new Error(`${shop?.who||'That counter'} doesn't buy that.`);
      if(Number(item.system.quantity||0)<n)throw new Error('Not enough to sell.');
      const catalog=(await fetch(`systems/${NS}/data/london-items.json`).then(r=>r.json())).items;
      const canonical=catalog.find(i=>i.name===item.name&&i.type==='drug');if(!canonical)throw new Error('This drug has no approved catalogue price.');
      const pay=Math.round(Number(canonical.system.value||0)*Number(shop.buysDrugs)*n);
      rec=await beginOperation(actor,id,'dealerSale',sig,{plan:{shopKey:key,itemId,qty:n,pay,name:item.name}});
    }
    if(!item)throw new Error('Sale inventory disappeared before completion. GM recovery is required.');
    await consumeOnce(item,id,n);
    await completeOperation(actor,id,rec.plan.pay,{'system.cash':Number(actor.system.cash||0)+rec.plan.pay});
    if(Number(item.system.quantity)===0)await item.delete();return rec.plan.pay;
  });
}
