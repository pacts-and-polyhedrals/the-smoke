// Situational item/perk bonuses. Automatic tags come from world state or a bound action,
// not an arbitrary list of tags sent by a player's client. Unmodelled fiction needs an
// explicit, recorded GM approval; it does not silently grant every matching-stat perk.
import {NS} from '../config.mjs';
import {actorToken,mapIdOf} from '../world/spawn.mjs';
let strict=false;
export const enableItemRules=()=>{strict=true;};
export const itemRulesEnabled=()=>strict;
const gf=(d,k)=>d?.getFlag?.(NS,k);
const has=(a,name)=>Boolean(a?.items?.some(i=>i.type==='perk'&&i.name===name));
const match=(tags,...want)=>want.some(t=>tags.has(t));
const BIKES=new Set(['bicycle','bike','pedal','moped','motorcycle','motorbike','scooter']);
export const PERK_TAGS=Object.freeze({
 'Bike Thief':['bikeTheft'],'Getaway Driver':['getaway'],'Local Knowledge':['hackney'],
 'Silver Tongue':['policeTalk'],'Parkour':['footEscape','climb'],'Brawler':['unarmed'],
 'Cabbie':['taxi'],'Medic':['medicine'],'Wheelie King':['twoWheels'],'Grease Monkey':['vehicleWork'],
 'Steady Hand':['aimed'],'Spray and Pray':['burst'],'Dirty Fighter':['grapple'],'Leg It':['policeFootEscape'],
 'Hard as Nails':['stayUp','injured'],'Night Owl':['night'],'Grass Radar':['policeIntel'],
 'Blag Merchant':['accessBluff'],'Wide Boy':['trade'],'Proper Nutter':['intimidate'],'Cool Head':['underFire','getaway'],
 'Ghost':['sneak'],'Courier':['courier'],'Blue Light Runner':['blues'],'Ex-Old Bill':['policeIntel'],
 'Fixer':['findTrader'],'Bike Messenger':['twoWheels'],'Hard to Shift':['stayUp','fatigue'],
 'Estate Runner':['footEscape','climb'],'Locksmith':['lock'],'Street Reader':['case','policeIntel'],
 'Steady Hands':['aimed'],'Stare Them Down':['intimidate','underFire'],'Door Staff':['grapple'],
 'First Responder':['medicine'],'The Knowledge':['navigate'],'Local Face':['localTalk'],
 'Rally Driver':['roughRoad'],'Crowd Work':['crowd'],'Iron Stomach':['fatigue','sickness'],
 'Quiet Feet':['sneak'],'Dead Calm':['underFire','getaway','alarm'],
 // The 0.5.25/26 branch adds nine stat-balancing perks. Keep them usable with
 // the audit branch's contextual validation instead of silently locking them out.
 'Shoulder Charge':['barge'],'Heavy Lifting':['heavyLift'],
 'Second Wind':['stayUp','fatigue'],'Long Shift':['endurance'],
 'Good Arm':['throw'],'Quick Draw':['firstShot'],'Hotwire Kid':['hotwire'],
 'Light Fingers':['pickpocket'],'Poker Face':['policeInterview','nerveBluff']
});
/** Tags from authored mission text or a GM-authored request, never client-supplied prose. */
export function authoredPerkTags(text='') {
 const rules={barge:/\b(?:barge|barging|shoulder charge|force.*door|break.*door|clear the way)\b/i,
  heavyLift:/\b(?:lift|lifting|drag|dragging|carry|carrying|push)\b/i,
  endurance:/\b(?:hours|shift|stakeout|endure|endurance|hold on|keep going|keep pushing|cold|rain)\b/i,
  throw:/\b(?:throw|throwing|sling|lob|hurl)\b/i,
  hotwire:/\b(?:hotwire|hotwiring|key programmer|relay box|without.*keys)\b/i,
  pickpocket:/\b(?:pickpocket|pickpocketing|palm|palming|plant|planting|swap|swapping)\b/i,
  policeInterview:/\b(?:interview|say nothing|no comment|stop and search)\b/i,
  nerveBluff:/\b(?:poker face|straight face|keep.*nerve|bluff.*gun)\b/i};
 return Object.entries(rules).filter(([,rule])=>rule.test(String(text))).map(([tag])=>tag);
}
function findToken(uuid){if(!uuid)return null;for(const s of game.scenes||[])for(const t of s.tokens||[])if(t.uuid===uuid)return t;return null;}
export function contextTags(actor,stat,options={}){
 const tags=new Set(),t=actorToken(actor),ctx=options.context||{},map=mapIdOf(t?.parent)||'';
 const conditions=new Set(actor.items.filter(i=>i.type==='condition').map(i=>i.name));
 if(map.startsWith('LDN-')&&!/LEYTON|STRATFORD|OLYMPIC|BOW-FLYOVER|OLD-FORD|BETHNAL/.test(map))tags.add('hackney');
 const hour=((Number(game.time?.worldTime||0)/3600)%24+24)%24;if(hour>=20||hour<6)tags.add('night');
 if(conditions.has('Hurt')||conditions.has('Bleeding')||conditions.has('In Pain'))tags.add('injured');
 if(conditions.has('Knackered'))tags.add('fatigue');
 if(ctx.kind==='stayUp'&&(conditions.has('Down')||actor.system.states?.down))tags.add('stayUp');
 const seat=gf(t,'vehicleSeat'),motor=seat&&t?.parent.tokens.get(seat.vehicleTokenId),v=motor?.actor?.system?.vehicle;
 if(v&&stat==='whl'){
  if(BIKES.has(v.klass))tags.add('twoWheels');
  if(gf(motor,'lights')||gf(motor,'siren'))tags.add('blues');
  if(Number(actor.system.heat?.value)>0&&game.combats?.some(c=>c.scene?.id===t.parent.id&&gf(c,'chase')))tags.add('getaway');
 }
 const target=findToken(ctx.target||ctx.targetUuid)||t?.parent.tokens.get(ctx.vehicleTokenId);
 if(ctx.kind==='theft'&&target?.actor?.type==='vehicle'){tags.add('lock');if(BIKES.has(target.actor.system.vehicle.klass))tags.add('bikeTheft');if(!['bicycle','bike','pedal'].includes(target.actor.system.vehicle.klass))tags.add('hotwire');}
 if(ctx.kind==='policeSilent'&&gf(t,'policeStop'))tags.add('policeInterview');
 if(['policeTalk','policeEscape'].includes(ctx.kind)&&gf(t,'policeStop')){if(ctx.kind==='policeTalk')tags.add('policeTalk');else{tags.add('getaway');if(!seat){tags.add('policeFootEscape');tags.add('footEscape');}}}
 if(ctx.kind==='pickpocket'&&ctx.sceneId===t?.parent?.id){
  const victim=t.parent.tokens.get(ctx.targetTokenId);
  if(victim?.actor?.isPerson&&victim.id!==t.id){const g=t.parent.grid?.size||100;if(Math.hypot(victim.x-t.x,victim.y-t.y)<=g*2.2)tags.add('pickpocket');}
 }
 // Requests must really be authored by a GM, addressed to this actor, and not
 // already answered. A client cannot invent a request or its contextual tags.
 if(ctx.kind==='request'){
  const message=game.messages?.get?.(ctx.messageId), req=gf(message,'request');
  const author=message?.author??game.users?.get?.(message?.user?.id??message?.user);
  if(author?.isGM&&req?.id===ctx.requestId&&req.actorIds?.includes(actor.id)&&!req.results?.[actor.id]&&req.responses?.some(r=>r.stat===stat)){
   for(const tag of authoredPerkTags([req.title,req.text,...req.responses.filter(r=>r.stat===stat).map(r=>r.label)].join(' ')))tags.add(tag);
  }
 }
 if(ctx.kind==='firstAid'&&target){tags.add('medicine');}
 if(['grab','breakFree'].includes(ctx.kind)&&target)tags.add('grapple');
 if(ctx.kind==='attack'&&target){const weapon=actor.items.get(ctx.weaponId)||actor.items.find(i=>i.type==='weapon'&&i.name===ctx.weapon);
  if(weapon){
   if(weapon.system.thrown)tags.add('throw');
   // First action of the first round, and only a ranged weapon. Persisted attack
   // messages bind the first shot to this encounter even before Done is pressed.
   const combat=game.combats?.find(c=>c.scene?.id===t?.parent?.id&&c.combatants?.some(x=>x.actor?.id===actor.id));
   const state=gf(combat,'state'), first=state?.queue?.[0], combatant=combat?.combatants?.get?.(first?.cid);
   const priorShot=game.messages?.some?.(m=>{const r=gf(m,'roll');return r?.context?.kind==='attack'&&r.context.combatId===combat?.id;});
   if(stat==='aim'&&weapon.system.range!=='Engaged'&&state?.round===1&&state.phase==='resolve'&&state.cursor===0&&combatant?.actor?.id===actor.id&&!priorShot)tags.add('firstShot');
   if(['Fists','Unarmed'].includes(weapon.name))tags.add('unarmed');if(ctx.burst&&weapon.system.burst)tags.add('burst');if(ctx.aimed&&gf(t,'attackAimReceipt')===ctx.aimReceipt)tags.add('aimed');}
 }
 if(ctx.kind==='itemAction'){
  const rec=gf(actor,'operations')?.[ctx.operationId],p=rec?.plan;
  if(rec?.status==='pending'&&rec.kind==='itemUse'&&p.itemId===ctx.itemId){
   if(['repair','repairKit','repairParts','innerTube','plates'].includes(p.action))tags.add('vehicleWork');
   if(p.itemName==='First Aid Kit')tags.add('medicine');if(['unlock','sawLock'].includes(p.action))tags.add('lock');
   if(p.action==='showID')tags.add('policeTalk');if(p.action==='scanner')tags.add('policeIntel');
   if(p.action==='case')tags.add('case');if(p.action==='streetSale')tags.add('trade');
  }
 }
 const jobs=game.settings?.get?.(NS,'jobState')||{},call=jobs.calls?.[ctx.callId];
 if(call&&Object.values(jobs.shifts||{}).some(sh=>sh.actorId===actor.id&&(sh.id===call.shiftId||sh.callId===call.id))){tags.add(call.type);if(call.type==='ambulance')tags.add('medicine');}
 if(ctx.kind==='mission'){
  const run=game.settings?.get?.(NS,'missions')?.[ctx.missionId],attempt=run?.attempts?.[ctx.attemptId];
  if(attempt?.actorId===actor.id&&attempt.runId===ctx.missionRunId&&['open','rolling'].includes(attempt.status)){
   for(const tag of attempt.contextTags||[])tags.add(tag);
  }
 }
 return tags;
}
export function perkEligible(actor,perk,stat,options={}){
 if(!perk||perk.type!=='perk'||perk.system.stat&&perk.system.stat!==stat)return false;
 if(!strict)return true;
 const approval=gf(actor,'perkApproval');if(approval?.perkId===perk.id&&approval.stat===stat&&Number(approval.expiresAt)>=Number(game.time?.worldTime||0))return true;
 return match(contextTags(actor,stat,options),...(PERK_TAGS[perk.name]||[]));
}
export function contextualEquipment(actor,stat,options={}){
 if(!strict)return null;const tags=contextTags(actor,stat,options);
 const worn=actor.items.find(i=>i.type==='outfit'&&i.system.worn&&i.system.stat===stat);
 const rules={'Hi-Vis & Hard Hat':['accessBluff'],'Hi-Vis Hard Hat':['accessBluff'],'Delivery Rider Jacket':['sneak'],'Smart Suit':['accessBluff','trade','policeTalk'],'Paramedic Uniform':['hospitalAccess'],'Police Uniform':['civilianOrder']};
 if(worn&&match(tags,...(rules[worn.name]||[])))return worn;
 if(stat==='frt'&&tags.has('policeTalk'))return actor.items.find(i=>i.name==='Fake ID'&&Number(i.system.quantity??1)>0)||null;
 if(stat==='sav'&&tags.has('policeIntel'))return actor.items.find(i=>i.name==='Police Scanner'&&Number(i.system.quantity??1)>0)||null;
 return null;
}
export function adjustedWitnessHeat(actor,before,after,{witnessed,byPolice}){
 if(!strict||!witnessed||byPolice||after<=before)return after;
 const masked=actor.items.some(i=>i.name==='Balaclava'&&gf(i,'wornMask')&&Number(i.system.quantity??1)>0)||actor.items.some(i=>i.type==='outfit'&&i.system.worn&&i.system.disguise==='masked');
 return masked?Math.max(before,after-1):after;
}
export const ghostCooldown=(actor,seconds)=>has(actor,'Ghost')?Math.max(1,Number(seconds)-15):seconds;
export const cabbieTip=(actor,tip)=>has(actor,'Cabbie')?Math.max(1,Math.ceil(Number(tip)*.25)):0;
export const courierFullPay=actor=>has(actor,'Courier');
export function crashRiderDamage(actor,vehicle,damage){return BIKES.has(vehicle?.system?.vehicle?.klass)&&actor.items.some(i=>i.type==='armour'&&i.name==='Motorbike Leathers'&&i.system.equipped)?Math.ceil(Math.max(0,damage)/2):damage;}
export function weaponRestriction(actor,weapon){return weapon?.system?.twoHanded&&actor.items.some(i=>i.type==='armour'&&i.name==='Riot Shield'&&i.system.equipped)?'Put away the Riot Shield before using a two-handed weapon.':null;}
