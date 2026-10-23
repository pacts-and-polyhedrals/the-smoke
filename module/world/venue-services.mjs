// Physical-counter services. All mutations run on the leader and retain operation receipts.
import {NS} from '../config.mjs';
import {venueProfile,credentialValid,venueItemContract} from '../rules/venue-contract.mjs';
import {checkVenue,counterFor} from './venues.mjs';
import {withActionLocks,boundedInt,worldSeconds} from './action-locks.mjs';
import {newOperationId,opId,receiptFor,sameOperation,beginOperation,completeOperation,stageOperation,issueOnce,consumeOnce,effectOnce,advanceOperationClock} from './transactions.mjs';
import {registerHandler,request,card,esc,isLeader} from './net.mjs';
import {actorToken,mapIdOf,tokenCentre,distanceSquares,ensureVehicleActor,placeToken} from './spawn.mjs';
import {restProblem} from '../gameplay.mjs';
import {observedByPolice,servicePrice} from './services.mjs';
import {ukPlate} from '../rules/jobs-core.mjs';
import {exitAllFromVehicle} from '../vehicles/vehicle-boarding.mjs';
const copy=x=>foundry.utils.deepClone(x);
export const VENUE_SERVICES=Object.freeze({
 contact:{label:'Talk / mission contacts',text:'See the contact and active mission interactions at this venue.',icon:'fa-solid fa-comments'},
 present:{label:'Present ticket / activate booking',text:'Validate an owned, venue-specific pass. Admission starts on the Banana Watch.',icon:'fa-solid fa-ticket'},
 bookedRest:{label:'Use booked room',text:'Eight-hour rest within a valid room booking; ordinary injury and Heat limits apply.',icon:'fa-solid fa-bed'},
 appraise:{label:'Appraise an item',text:'Free valuation of eligible owned goods; a dated appraisal is not mission evidence.',icon:'fa-solid fa-magnifying-glass'},
 pawn:{label:'Pawn an item',text:'Receive 40% of catalogue value. Original item held for seven Watch days; redeem for loan plus 25%.',icon:'fa-solid fa-box'},
 resell:{label:'Sell an item',text:'Sell eligible owned goods for 50% of catalogue value. No mission property, hired goods or restricted stock.',icon:'fa-solid fa-sterling-sign'},
 redeem:{label:'Redeem pawn ticket',text:'Pay the recorded redemption price and recover the exact deposited item once.',icon:'fa-solid fa-receipt'},
 hire:{label:'Hire equipment / bicycle',text:'Named asset checkout: GBP 15 hire plus refundable deposit. Return the same asset here within one Watch day.',icon:'fa-solid fa-bicycle'},
 returnHire:{label:'Return hire',text:'Return the exact asset; damage and overdue charges reduce the recorded deposit, never create extra cash.',icon:'fa-solid fa-rotate-left'},
 copy:{label:'Photocopy a document',text:'Use one prepaid credit, or pay GBP 1. Copies preserve provenance and cannot duplicate an original mission hand-in or admission.',icon:'fa-solid fa-copy'},
 requestDocument:{label:'Request paperwork',text:'Obtain public forms or request authorised documents. Protected records require a GM-approved request or a recorded source.',icon:'fa-solid fa-file'},
 donate:{label:'Make a donation',text:'Pay a chosen amount and receive a dated, non-transferable receipt. No automatic Renown farming.',icon:'fa-solid fa-hand-holding-heart'},
 payFare:{label:'Pay transit fare',text:'GBP 3 from recorded travel credit or cash; issues a one-use fare receipt. Does not teleport the character.',icon:'fa-solid fa-train'},
 auction:{label:'Listed auction lot',text:'Buy the unique daily catalogue lot through the same stock-checked transaction as other goods.',icon:'fa-solid fa-gavel'},
 bookBet:{label:'Fictional dice book',text:'One GBP 1-20 odd/even bet per Watch day; a recorded die settles it after ten Watch minutes. Even odds; no real-world gambling.',icon:'fa-solid fa-dice'},
 settleBet:{label:'Settle recorded bet',text:'Resolve a due bet once. The persisted result and payout cannot be rerolled.',icon:'fa-solid fa-receipt'}
});
const PAWN_TYPES=new Set(['gear','outfit','armour']);
export function canPawn(item){return Boolean(item&&PAWN_TYPES.has(item.type)&&Number(item.system.value)>0&&Number(item.system.quantity??1)>0&&!item.system.restricted&&!item.system.worn&&!item.system.equipped&&!item.getFlag?.(NS,'missionCargo')&&!item.getFlag?.(NS,'credential')&&!item.getFlag?.(NS,'rental')&&!item.getFlag?.(NS,'venueCopy')&&!['Relay Box','Key Programmer','Fake ID','Spare Plates','Fictional Show Plates','Lock Picks'].includes(item.name));}
const idsOfConditions=(a,names)=>a.items.filter(i=>i.type==='condition'&&names.includes(i.name)).map(i=>i.id);
const pending=(a,id)=>receiptFor(a,id)?.status==='pending';
async function libraryItem(name){const lib=(await fetch(`systems/${NS}/data/london-items.json`).then(r=>r.json())).items;const d=lib.find(i=>i.name===name);if(!d)throw new Error(`Missing item ${name}.`);return copy(d);}
async function receiptItem(actor,id,name,fields){const d=await libraryItem(name);d.flags??={};d.flags[NS]??={};d.flags[NS].venueDocument={issued:true,actorId:actor.id,operationId:id,at:worldSeconds(),...fields};d.system.value=0;return issueOnce(actor,id,[d]);}
const objectData=i=>i.toObject?i.toObject():{name:i.name,type:i.type,img:i.img,system:copy(i.system),flags:copy(i.flags||{})};
function loc(t,p){if(!t)return null;const [x,y]=tokenCentre(t);return {mapId:mapIdOf(t.parent),sceneId:t.parent.id,tokenId:t.id,zoneId:p.zoneId,x,y};}
function ownActor(id,userId){const a=game.actors.get(id),u=game.users.get(userId);if(!a||!u||(!u.isGM&&!a.testUserPermission?.(u,'OWNER')))throw new Error('Choose your own character.');return a;}
function ownedCredential(actor,itemId,p){const i=actor.items.get(itemId),c=i?.getFlag(NS,'credential');if(!i||!c?.issued||c.actorId!==actor.id||c.venueId!==p.venueId||c.used||Number(i.system.quantity??1)<1)throw new Error('That is not an unused pass issued to you for this venue.');return {i,c};}
export async function runVenueService(args){
  const {actorId,userId,service,itemId=null,targetId=null}=args,actor=ownActor(actorId,userId),id=opId(args.operationId),signature=JSON.stringify([args.shopKey,service,itemId,targetId,args.amount??null,args.choice??null]);
  return withActionLocks([`actor:${actor.id}`,'venue-economy'],async()=>{
    let rec=sameOperation(receiptFor(actor,id),'venueService',signature);if(rec?.status==='done')return rec.result;
    const ctx=rec?{profile:venueProfile(rec.plan.shopKey),token:actorToken(actor)}:checkVenue(actor,args.shopKey,userId,args),p=ctx.profile,t=ctx.token;
    if(!p||(p.services||[]).indexOf(service)<0)throw new Error('That service is not offered at this counter.');
    if(!rec){
      const plan={shopKey:p.key,service,itemId,targetId,location:loc(t,p),override:Boolean(ctx.override),reason:ctx.reason||null};let cost=0,patch={};
      const heat=Number(actor.system.heat?.value||0);
      if(service==='present'){
        const {i,c}=ownedCredential(actor,itemId,p);plan.credential=copy(c);plan.itemId=i.id;
        if(c.kind==='admission'||c.kind==='booking')plan.access={issued:true,actorId:actor.id,venueId:p.venueId,kind:c.kind,source:i.id,expiresAt:worldSeconds()+Number(c.minutes||120)*60,room:/Room Booking/.test(i.name),serial:c.serial};
        else if(c.kind==='travelCredit')plan.credit=10;
        else if(c.kind==='fare')plan.fare=true;
        else throw new Error('Use this document with its matching service, not as an entry pass.');
      }else if(service==='pawn'||service==='resell'||service==='appraise'){
        const i=actor.items.get(itemId);if(!canPawn(i))throw new Error('This counter cannot accept equipped, restricted, hired or mission goods.');
        plan.original=objectData(i);plan.original.system.quantity=1;plan.value=Number((await libraryItem(i.name)).system.value||0);plan.pay=Math.floor(plan.value*(service==='pawn'?.4:.5));plan.redeem=Math.ceil(plan.pay*1.25);plan.deadline=worldSeconds()+7*86400;
      }else if(service==='redeem'){
        const pawn=actor.getFlag(NS,'pawns')?.[targetId];if(!pawn||pawn.venueId!==p.venueId||pawn.status!=='held')throw new Error('No outstanding pawn at this counter.');
        if(worldSeconds()>pawn.deadline)throw new Error('The seven-day redemption period has expired.');plan.pawn=copy(pawn);cost=pawn.redeem;
      }else if(service==='donate'){cost=boundedInt(args.amount,1,1000,'Donation');plan.amount=cost;
      }else if(service==='payFare'){
        const balance=Number(actor.getFlag(NS,'travelCredit')||0);if(balance>=3){patch[`flags.${NS}.travelCredit`]=balance-3;plan.creditUsed=3;}else cost=3;plan.fare=true;
      }else if(service==='copy'){
        const original=actor.items.get(itemId);if(!original||original.type!=='gear'||original.getFlag(NS,'credential')||original.getFlag(NS,'rental'))throw new Error('Choose an owned document, not a ticket, key or hire contract.');
        if(!original.getFlag(NS,'missionCargo')&&!original.getFlag(NS,'venueDocument')&&!/Book|Notebook|Dossier|Folder|Manifest|Catalogue|Guide|Programme|Media/i.test(original.name))throw new Error('That item is not a readable document.');
        plan.original=objectData(original);plan.originalId=itemId;const credit=actor.items.find(i=>i.name==='Photocopy Credit'&&i.getFlag(NS,'credential')?.venueId===p.venueId&&!i.getFlag(NS,'credential')?.used&&Number(i.system.quantity||0)>0);
        plan.creditId=credit?.id||null;if(!credit)cost=1;
      }else if(service==='requestDocument'){
        const name=String(args.choice||'');if(!(p.documents||[]).includes(name))throw new Error('Choose one of this counter\'s document services.');plan.documentName=name;
        plan.publicDocument=['Library Card','Appointment Slip','Records Request'].includes(name);plan.requestId=id;
      }else if(service==='treat'){
        if(heat>=2)throw new Error('Not with the police after you; A&E will report you.');plan.seconds=4*3600;plan.removes=idsOfConditions(actor,['Bleeding','Hurt','In Pain','Bruised','Down','Burning','Gassed']);
      }else if(service==='rest'||service==='bookedRest'){
        const why=restProblem(actor,t,{isGM:true});if(why)throw new Error(why);
        if(service==='bookedRest'){const access=actor.getFlag(NS,'venueAccess')?.[p.venueId];if(!credentialValid(access,{actorId:actor.id,venueId:p.venueId,time:worldSeconds()+8*3600,kind:'booking'})||!access.room)throw new Error('Activate a room booking with at least eight hours remaining.');}
        plan.seconds=8*3600;plan.removes=actor.items.filter(i=>i.type==='condition'&&!['Broken','Cuffed','Restrained','Grabbed'].includes(i.name)).map(i=>i.id);
      }else if(service==='stash'){
        const amount=Number(args.amount);if(!Number.isSafeInteger(amount)||amount===0)throw new Error('Enter a nonzero whole cash amount.');
        const cash=Number(actor.system.cash||0),stash=Number(actor.system.stash||0);if(amount>cash||-amount>stash)throw new Error('There is not enough cash in that balance.');
        patch={'system.cash':cash-amount,'system.stash':stash+amount};plan.amount=amount;
      }else if(['repair','respray','clothes'].includes(service)){
        if(service==='clothes'){
          if(heat<=0)throw new Error('Your Heat is already clear.');if(observedByPolice(t,actor))throw new Error('The police can see the change.');
          const last=actor.getFlag(NS,'disguiseReceipt');if(last&&worldSeconds()-Number(last.at)<3600)throw new Error('Another quick change cannot fool the same search. Wait an hour or clear your Heat.');
          cost=servicePrice('clothes');plan.heat=Math.max(0,heat-1);
        }else{
          const seat=t.getFlag(NS,'vehicleSeat'),v=seat?.seatId==='pilot'?t.parent.tokens.get(seat.vehicleTokenId):null;
          if(!v||distanceSquares(v,counterFor(t.parent,p.key))>Math.max(4,Number(p.reach||0)))throw new Error('Drive the vehicle beside this service bay.');
          if(v.actor.system.vehicle.destroyed)throw new Error('A written-off vehicle needs recovery, not this service.');
          if(service==='respray'&&(v.actor.system.vehicle.plateless||observedByPolice(v,actor)))throw new Error('A plated motor out of police sight is required.');
          cost=servicePrice(service,v.actor);plan.vehicleUuid=v.uuid;plan.vehicleActorUuid=v.actor.uuid;plan.oldPlate=v.getFlag(NS,'plate');plan.plate=ukPlate();
        }
      }else if(service==='hire'){
        const kind=String(args.choice||'bicycle'),allowed=p.code==='HR7'?['Cheap Smartphone','Toolkit']:['bicycle','Cycle Helmet','Toolkit'];if(!allowed.includes(kind))throw new Error('That asset is not for hire here.');
        if(Object.values(actor.getFlag(NS,'rentals')||{}).some(r=>r.venueId===p.venueId&&r.status==='out'))throw new Error('Return the existing hire before starting another checkout here.');
        plan.kind=kind;plan.deposit=kind==='bicycle'?50:20;plan.fee=15;plan.dueAt=worldSeconds()+86400;cost=plan.deposit+plan.fee;
      }else if(service==='returnHire'){
        const rental=actor.getFlag(NS,'rentals')?.[targetId];if(!rental||rental.venueId!==p.venueId||rental.status!=='out')throw new Error('No outstanding rental here.');
        plan.rental=copy(rental);let damage=0;
        if(rental.vehicleUuid){const v=game.scenes.flatMap(s=>Array.from(s.tokens)).find(t=>t.getFlag?.(NS,'rental')?.id===targetId);if(v)plan.rental.vehicleUuid=v.uuid;if(!v||v.parent.id!==t.parent.id||distanceSquares(v,t)>4||v.getFlag(NS,'rental')?.id!==targetId)throw new Error('Return the same hire bicycle to this counter.');damage=Math.max(0,Number(rental.body)-Number(v.actor.system.vehicle.body.value))*5;if(v.actor.system.vehicle.destroyed)damage=rental.deposit;}
        else{const i=actor.items.get(rental.itemId);if(!i||i.getFlag(NS,'rental')?.id!==targetId)throw new Error('Bring back the same hired item.');}
        plan.refund=Math.max(0,rental.deposit-damage-(worldSeconds()>rental.dueAt?10:0));
      }else if(service==='bookBet'){
        const day=Math.floor(worldSeconds()/86400);if(actor.getFlag(NS,'lastBetDay')===day)throw new Error('One fictional bet per character per Watch day.');
        if(!['odd','even'].includes(args.choice))throw new Error('Choose odd or even.');cost=boundedInt(args.amount,1,20,'Stake');plan.stake=cost;plan.choice=args.choice;plan.dueAt=worldSeconds()+600;patch[`flags.${NS}.lastBetDay`]=day;
      }else if(service==='settleBet'){
        const bet=actor.getFlag(NS,'bets')?.[targetId];if(!bet||bet.venueId!==p.venueId||bet.status!=='open'||worldSeconds()<bet.dueAt)throw new Error('That bet is not due for settlement here.');plan.bet=copy(bet);
      }else if(service==='contact'||service==='auction'){plan.noMutation=true;
      }else throw new Error('This service has no implemented handler.');
      rec=await beginOperation(actor,id,'venueService',signature,{cost,plan,patch});
    }
    const plan=rec.plan;let result={service,paid:rec.cost};
    if(service==='present'){
      const i=actor.items.get(plan.itemId);if(!i)throw new Error('The pass disappeared before it was validated.');
      await consumeOnce(i,id,1);await i.update({[`flags.${NS}.credential.used`]:true});
      if(plan.access)await effectOnce(actor,id,{[`flags.${NS}.venueAccess.${p.venueId}`]:plan.access});
      if(plan.credit)await effectOnce(actor,id,{[`flags.${NS}.travelCredit`]:Number(actor.getFlag(NS,'travelCredit')||0)+plan.credit});
      if(plan.fare)await effectOnce(actor,id,{[`flags.${NS}.fares.${id}`]:{issued:true,actorId:actor.id,venueId:p.venueId,paid:true,at:worldSeconds(),used:false}});
    }else if(['pawn','resell'].includes(service)){
      const i=actor.items.get(plan.itemId);if(!i)throw new Error('Pawned inventory disappeared before intake finished.');await consumeOnce(i,id,1);
      if(service==='pawn')await receiptItem(actor,id,'Pawn Ticket',{venueId:p.venueId,loan:plan.pay,redeem:plan.redeem,deadline:plan.deadline,pawnId:id,originalItemId:plan.itemId});
      const patch={'system.cash':Number(actor.system.cash||0)+plan.pay};
      if(service==='pawn')patch[`flags.${NS}.pawns.${id}`]={venueId:p.venueId,status:'held',original:plan.original,redeem:plan.redeem,deadline:plan.deadline,loan:plan.pay};
      result={...result,received:plan.pay,pawnId:service==='pawn'?id:null};await completeOperation(actor,id,result,patch);if(Number(i.system.quantity)===0)await i.delete();return result;
    }else if(service==='appraise'){
      await receiptItem(actor,id,'Appraisal Slip',{venueId:p.venueId,itemId:plan.itemId,catalogueValue:plan.value,pawnOffer:plan.pay,notMissionProof:true});result.value=plan.value;
    }else if(service==='redeem'){
      const d=copy(plan.pawn.original);d.flags??={};d.flags[NS]??={};d.flags[NS].redeemedPawn={pawnId:targetId,operationId:id};await issueOnce(actor,id,[d]);
      await effectOnce(actor,id,{[`flags.${NS}.pawns.${targetId}.status`]:'redeemed'});
    }else if(service==='donate'){await receiptItem(actor,id,'Donation Receipt',{venueId:p.venueId,amount:plan.amount});
    }else if(service==='payFare'){await receiptItem(actor,id,'Shopping Receipt',{venueId:p.venueId,service:'transitFare',amount:3});await effectOnce(actor,id,{[`flags.${NS}.fares.${id}`]:{issued:true,actorId:actor.id,venueId:p.venueId,paid:true,at:worldSeconds(),used:false}});
    }else if(service==='copy'){
      if(plan.creditId){const credit=actor.items.get(plan.creditId);if(!credit)throw new Error('Copy credit disappeared.');await consumeOnce(credit,id);await credit.update({[`flags.${NS}.credential.used`]:true});}
      const original=plan.original,d={name:`Copy: ${original.name}`,type:'gear',img:original.img,system:{quantity:1,value:0,description:original.system.description||''},flags:{[NS]:{venueCopy:{sourceItemId:plan.originalId,source:copy(original.flags?.[NS]||{}),venueId:p.venueId,operationId:id,notOriginal:true}}}};await issueOnce(actor,id,[d]);
    }else if(service==='requestDocument'){
      if(plan.publicDocument)await receiptItem(actor,id,plan.documentName,{venueId:p.venueId,requestType:plan.documentName,appointmentAt:plan.documentName==='Appointment Slip'?rec.startedAt+3600:null,notMissionProof:true});
      else{await effectOnce(actor,id,{[`flags.${NS}.documentRequests.${id}`]:{venueId:p.venueId,shopKey:p.key,name:plan.documentName,requestedAt:rec.startedAt,status:'pending'}});result.pendingApproval=true;}
    }else if(service==='treat'||service==='rest'||service==='bookedRest'){
      const patch={'system.resources.health.value':actor.system.resources.health.max,'system.states.down':false,'system.states.downRounds':0};
      if(service!=='treat')Object.assign(patch,{'system.resources.hustle.value':actor.system.resources.hustle.max,'system.states.surrendered':false,'system.states.reactionUsed':false,'system.states.offGame':false,'system.states.onARoll':false,'system.heat.value':0});
      await effectOnce(actor,id,patch);await actor.deleteEmbeddedDocuments('Item',plan.removes.filter(x=>actor.items.get(x)));await advanceOperationClock(actor,id,plan.seconds);
    }else if(service==='clothes'){
      await effectOnce(actor,id,{'system.heat.value':plan.heat,'system.heat.coolSince':0,[`flags.${NS}.disguiseReceipt`]:{at:worldSeconds(),source:'counter',operationId:id}});
    }else if(service==='repair'||service==='respray'){
      const v=await fromUuid(plan.vehicleUuid);if(!v)throw new Error('The paid service vehicle is missing; GM recovery is required.');
      if(service==='repair'){await effectOnce(v.actor,id,{'system.vehicle.body.value':v.actor.system.vehicle.body.max,'system.vehicle.flats':0});await effectOnce(v,id,{[`flags.${NS}.patched`]:false,[`flags.${NS}.fire`]:null});}
      else{await effectOnce(v,id,{[`flags.${NS}.plate`]:plan.plate,[`flags.${NS}.previousPlate`]:plan.oldPlate??null,[`flags.${NS}.marker`]:null,[`flags.${NS}.resprayed`]:true,[`flags.${NS}.hotUntil`]:0});await effectOnce(actor,id,{'system.heat.value':0,'system.heat.coolSince':0});}
      Hooks.callAll('smokeService',{actor,service,shop:p.inherit||p.key,venueId:p.venueId,vehicle:v,targetToken:v,actorToken:t,sceneId:plan.location.sceneId,zoneId:p.zoneId,proofId:id});
    }else if(service==='hire'){
      let rental=actor.getFlag(NS,'rentals')?.[id];
      if(!rental){
        rental={id,venueId:p.venueId,shopKey:p.key,status:'out',dueAt:plan.dueAt,deposit:plan.deposit,kind:plan.kind};
        if(plan.kind==='bicycle'){
          let v=game.scenes.flatMap(s=>Array.from(s.tokens)).find(v=>v.getFlag?.(NS,'rental')?.id===id);
          if(!v){const a=await ensureVehicleActor('LV04'),[x,y]=tokenCentre(counterFor(t.parent,p.key));v=await placeToken(t.parent,a,x+(t.parent.grid.size||100)*2,y,{flags:{locked:false,parked:false,rental:{id,actorId:actor.id,venueId:p.venueId},issued:true}});}
          rental.vehicleUuid=v.uuid;rental.body=Number(v.actor.system.vehicle.body.value);
        }else{const d=await libraryItem(plan.kind);d.flags??={};d.flags[NS]??={};d.flags[NS].rental={id,actorId:actor.id,venueId:p.venueId};d.system.quantity=1;const [i]=await issueOnce(actor,id,[d]);rental.itemId=i.id;}
        await actor.update({[`flags.${NS}.rentals.${id}`]:rental});
      }
      result.rentalId=id;
    }else if(service==='returnHire'){
      const r=plan.rental;
      if(r.vehicleUuid){const v=await fromUuid(r.vehicleUuid);if(v){await exitAllFromVehicle(v);await v.delete({smokeRental:true});}}
      else{const i=actor.items.get(r.itemId);if(i)await i.delete();}
      await completeOperation(actor,id,{...result,refund:plan.refund},{[`flags.${NS}.rentals.${targetId}.status`]:'returned','system.cash':Number(actor.system.cash||0)+plan.refund});return {...result,refund:plan.refund};
    }else if(service==='bookBet'){
      await receiptItem(actor,id,'Bet Receipt',{venueId:p.venueId,stake:plan.stake,choice:plan.choice,dueAt:plan.dueAt,betId:id});await effectOnce(actor,id,{[`flags.${NS}.bets.${id}`]:{...plan,venueId:p.venueId,status:'open'}});
    }else if(service==='settleBet'){
      let die=receiptFor(actor,id)?.stages?.die;if(!die){die=Number((await new Roll('1d6').evaluate()).total);await stageOperation(actor,id,'die',die);}
      const won=(die%2===0?'even':'odd')===plan.bet.choice,pay=won?plan.bet.stake*2:0;result={...result,die,won,pay};
      await completeOperation(actor,id,result,{[`flags.${NS}.bets.${targetId}.status`]:'settled',[`flags.${NS}.bets.${targetId}.result`]:{die,pay},'system.cash':Number(actor.system.cash||0)+pay});return result;
    }
    await completeOperation(actor,id,result);
    if(!plan.override)Hooks.callAll('smokeVenueService',{actor,service,venueId:p.venueId,shop:p.key,location:plan.location,proofId:id,result});
    if(!plan.noMutation)await card('VENUE SERVICE',p.name,`<p>${esc(actor.name)}: ${esc(VENUE_SERVICES[service]?.label||service)}. ${result.pendingApproval?'The authorised document request is pending GM review.':`Receipt ${esc(id)}.`}</p>`,'cash');
    return result;
  });
}
registerHandler('venue.service',runVenueService);
registerHandler('venue.document.approve',async({actorId,requestId,reason,userId})=>{
  if(!game.users.get(userId)?.isGM||String(reason||'').trim().length<8)throw new Error('An authorised GM must explain this document issue.');
  const actor=game.actors.get(actorId),req=actor?.getFlag(NS,'documentRequests')?.[requestId];if(!req)throw new Error('No such document request.');
  return withActionLocks([`actor:${actor.id}`],async()=>{
    if(actor.getFlag(NS,'documentRequests')?.[requestId]?.status==='issued')return true;
    const d=await libraryItem(req.name);d.flags??={};d.flags[NS]??={};d.flags[NS].venueDocument={issued:true,actorId,venueId:req.venueId,requestId,issuedBy:userId,reason:String(reason).slice(0,400),at:worldSeconds()};
    await issueOnce(actor,`approve_${requestId}`,[d]);const patch={[`flags.${NS}.documentRequests.${requestId}.status`]:'issued'};
    if(['Access Permit','Visitor Pass','Safehouse Key','Meeting Invitation','Faction Supply Voucher'].includes(req.name))patch[`flags.${NS}.venueAccess.${req.venueId}`]={issued:true,actorId,venueId:req.venueId,kind:'invitation',expiresAt:worldSeconds()+86400,source:requestId};
    await actor.update(patch);return true;
  });
});
registerHandler('transaction.recover',async({actorId,operationId,userId})=>{
  const actor=ownActor(actorId,userId),r=receiptFor(actor,opId(operationId));if(!r)throw new Error('Unknown transaction.');if(r.status==='done')return r.result;
  const p=r.plan;
  if(r.kind==='purchase'){const [shopKey,itemName,qty]=JSON.parse(r.signature);return (await import('./shops.mjs')).purchaseFromShop({actorId,userId,operationId,shopKey,itemName,qty});}
  if(r.kind==='dealerSale'){const [shopKey,itemId,qty]=JSON.parse(r.signature);return (await import('./shops.mjs')).sellAtShop({actorId,userId,operationId,shopKey,itemId,qty});}
  if(r.kind==='venueService'){const [shopKey,service,itemId,targetId,amount,choice]=JSON.parse(r.signature);return runVenueService({actorId,userId,operationId,shopKey,service,itemId,targetId,amount,choice});}
  if(r.kind==='itemUse')return (await import('./item-actions.mjs')).recoverItemAction(actor,operationId,userId);
  throw new Error('This operation needs its original action for recovery.');
});
export async function openVenueService(actor,shopKey,service){
  const p=venueProfile(shopKey);if(!p)throw new Error('Unknown counter.');const args={actorId:actor.id,shopKey,service,operationId:newOperationId()};let content='',selectName='itemId',choices=[];
  if(service==='contact'){
    const {missionData,missionState}=await import('./missions.mjs');const {checkpointReady}=await import('../rules/mission-contract.mjs');
    const data=await missionData(),state=missionState();const jobs=data.missions.filter(m=>state[m.id]?.status==='active'&&state[m.id]?.actorIds?.includes(actor.id));
    for(const m of jobs)for(const o of m.objectives)if(checkpointReady(m,o,state[m.id])&&o.checkpoint?.locations?.some(a=>a.mapId===p.mapId)&&['roll','choice','dialogue','race'].includes(o.checkpoint?.mode))choices.push({id:`${m.id}|${o.id}`,name:`${m.code}: ${o.text||o.label||o.id}`});
    if(!choices.length)return foundry.applications.api.DialogV2.prompt({window:{title:p.name},content:`<p>${esc(p.who||'Reception')}. ${esc(p.contact?`Known contact: ${p.contact}.`:'')}</p><p>No active mission interaction is ready here for this character.</p>`,ok:{label:'Close'}});
    const f=await foundry.applications.api.DialogV2.input({window:{title:'Mission interaction'},content:`<select name="step">${choices.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>`});if(!f)return;const [mid,step]=f.step.split('|');return game.smoke.missionActions.open(mid,step,actor.id);
  }
  if(service==='auction')return (await import('./shops.mjs')).shopAPI.buy(actor,shopKey,'Auction Lot',1);
  if(['pawn','resell','appraise'].includes(service))choices=actor.items.filter(canPawn).map(i=>({id:i.id,name:i.name}));
  if(service==='present')choices=actor.items.filter(i=>{const c=i.getFlag(NS,'credential');return c?.venueId===p.venueId&&c.actorId===actor.id&&!c.used&&['booking','admission','fare','travelCredit'].includes(c.kind);}).map(i=>({id:i.id,name:i.name}));
  if(service==='copy')choices=actor.items.filter(i=>i.type==='gear'&&!i.getFlag(NS,'credential')).map(i=>({id:i.id,name:i.name}));
  if(service==='redeem'){selectName='targetId';choices=Object.entries(actor.getFlag(NS,'pawns')||{}).filter(([,r])=>r.status==='held'&&r.venueId===p.venueId).map(([id,r])=>({id,name:`${r.original.name} - GBP ${r.redeem}`}));}
  if(service==='returnHire'){selectName='targetId';choices=Object.entries(actor.getFlag(NS,'rentals')||{}).filter(([,r])=>r.status==='out'&&r.venueId===p.venueId).map(([id,r])=>({id,name:r.kind}));}
  if(service==='settleBet'){selectName='targetId';choices=Object.entries(actor.getFlag(NS,'bets')||{}).filter(([,r])=>r.status==='open'&&r.venueId===p.venueId).map(([id,r])=>({id,name:`${r.choice} - GBP ${r.stake}`}));}
  if(service==='hire'){selectName='choice';choices=(p.code==='HR7'?['Cheap Smartphone','Toolkit']:['bicycle','Cycle Helmet','Toolkit']).map(n=>({id:n,name:n}));}
  if(service==='requestDocument'){selectName='choice';choices=(p.documents||[]).map(n=>({id:n,name:n}));}
  if(service==='bookBet'){selectName='choice';choices=['odd','even'].map(n=>({id:n,name:n}));}
  if(['present','pawn','resell','appraise','copy','redeem','returnHire','settleBet','hire','requestDocument'].includes(service)&&!choices.length)throw new Error('There are no eligible items or records for this service.');
  if(choices.length)content+=`<select name="${selectName}">${choices.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>`;
  if(['donate','bookBet','stash'].includes(service))content+='<label>Amount <input name="amount" type="number" value="5" step="1"></label>';
  content=`<p>${esc(VENUE_SERVICES[service]?.text||'Use this service at the current counter. The server verifies location, cost and the actual target.')}</p>`+content;
  const form=await foundry.applications.api.DialogV2.input({window:{title:`${p.name}: ${VENUE_SERVICES[service]?.label||service}`},content,ok:{label:'Confirm service'}});if(!form)return;
  return request('venue.service',{...args,...form});
}
