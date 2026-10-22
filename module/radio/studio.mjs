// Studio requests are entirely fictional in-game messages. They NEVER contact real stations.
// ChatMessage flags are persistent, whisper-restricted and GM-authoritative; there is no external send path.
import {NS} from '../config.mjs';
import {registerHandler,request,isLeader,esc} from '../world/net.mjs';
import {DEFAULT_STATIONS} from './stations.mjs';

const FLAG='studioRequest';
export const RETIRED_STATIONS=new Set(['codesouth','esencia-urbana']);
const TYPES=new Set(['message','announcement']);
const STATUSES=new Set(['queued','scheduled','replied','broadcast','declined']);
const RATE_MS=15000;

function availableStations(){
 const raw=game.settings.get(NS,'radioStations');
 if(raw){try{const list=JSON.parse(raw);if(Array.isArray(list))return list.filter(s=>!RETIRED_STATIONS.has(s?.id));}catch(_e){}}
 return DEFAULT_STATIONS;
}
function stationFor(id){
 const s=availableStations().find(x=>x.id===id);
 if(!s)throw new Error('That radio station has been removed. Tune another station.');
 return s;
}
function messageCollection(){
 const collection=game.messages;
 if(Array.isArray(collection?.contents))return collection.contents;
 if(Array.isArray(collection))return collection;
 if(typeof collection?.values==='function')return [...collection.values()];
 return [];
}
function gmRecipients(userId=null){return [...new Set([...(game.users?.filter?.(u=>u.isGM).map(u=>u.id)??[]),userId].filter(Boolean))];}
function recordOf(msg){return msg?.getFlag?.(NS,FLAG)??msg?.flags?.[NS]?.[FLAG]??null;}
function allStudioEntries(){
 return messageCollection().map(msg=>({msg,record:recordOf(msg)})).filter(x=>x.record && STATUSES.has(x.record.status))
   .sort((a,b)=>Number(b.record.createdAt||0)-Number(a.record.createdAt||0));
}
export function studioInbox(){
 if(!game.user?.isGM)return [];
 return allStudioEntries().slice(0,150);
}
function safeText(text,max=500){return String(text??'').trim().slice(0,max);}
function realUser(userId){const user=game.users.get?.(userId);if(!user||!user.active)throw new Error('That player is no longer connected.');return user;}
function characterFor(actorId,user){
 const actor=game.actors.get(actorId);
 if(actor?.type!=='character'||(!user.isGM&&!actor.testUserPermission?.(user,'OWNER')))
   throw new Error('Choose a character that belongs to you.');
 return actor;
}
export function renderStudioCard(kind,station,who,text,{label=''}={}){
 return `<section class="smoke-card radio studio-${esc(kind)}"><header><span class="kicker">THE SMOKE · FICTIONAL STUDIO ${esc(label||kind.toUpperCase())}</span><strong>${esc(station)} · ${esc(who)}</strong></header><p>“${esc(text)}”</p><p class="smoke-dim">Roleplay only. Nothing was sent to a real broadcaster.</p></section>`;
}

export async function studioSubmit({stationId,actorId,kind='message',text,submissionId}={}){
 return request('radio.studio.submit',{stationId,actorId,kind,text,submissionId});
}
registerHandler('radio.studio.submit',async data=>{
 const user=realUser(data.userId),actor=characterFor(data.actorId,user),station=stationFor(data.stationId);
 const kind=String(data.kind||'message'),text=safeText(data.text),submissionId=String(data.submissionId||'');
 if(!TYPES.has(kind))throw new Error('Choose a studio message or an announcement request.');
 if(text.length<2||text.length>500)throw new Error('Write a message between 2 and 500 characters.');
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(submissionId))throw new Error('The request identifier is invalid. Try again.');
 const existing=messageCollection().find(m=>recordOf(m)?.submissionId===submissionId&&recordOf(m)?.userId===user.id);
 if(existing)return {id:existing.id,existing:true};
 const now=Date.now();
 const recent=messageCollection().some(m=>{const r=recordOf(m);return r?.userId===user.id&&now-Number(r.createdAt||0)<RATE_MS;});
 if(recent&&!user.isGM)throw new Error('Give the studio a moment before sending another message.');
 const record={version:1,submissionId,userId:user.id,actorId:actor.id,actorName:actor.name,stationId:station.id,
  stationName:station.name,kind,text,status:'queued',createdAt:now,worldAt:Number(game.time?.worldTime||0),airAt:null};
 const msg=await ChatMessage.implementation.create({speaker:{alias:`Studio Inbox · ${station.name}`},
   content:renderStudioCard(kind,station.name,actor.name,text,{label:kind==='announcement'?'AIRTIME REQUEST':'PRIVATE MESSAGE'}),
   whisper:gmRecipients(user.id),flags:{[NS]:{[FLAG]:record}}});
 Hooks.callAll('smokeStudioInboxChanged');
 return {id:msg.id,existing:false};
});

function authorisedSource(id){
 if(!game.user?.isGM)throw new Error('Only the GM can manage studio requests.');
 const msg=game.messages.get(id),r=recordOf(msg);
 if(!msg||!r||!STATUSES.has(r.status))throw new Error('The studio request could not be found.');
 return {msg,record:r};
}
function actionMessage(msg,record,kind,text,recipients){
 return ChatMessage.implementation.create({speaker:{alias:`${record.stationName} · Fictional Studio`},
   content:renderStudioCard(kind,record.stationName,kind==='broadcast'?'ON AIR':record.actorName,text),
   ...(recipients?{whisper:recipients}:{}),flags:{[NS]:{studioReplyTo:msg.id,fictionalRadio:true}}});
}
export async function studioModerate(id,action,{reply='',minutes=60}={}){
 // No socket handler exists for moderation: a player cannot spoof a GM id in a raw socket request.
 if(!game.user?.isGM||!isLeader())throw new Error('The active GM must approve studio messages.');
 return moderateOnLeader({id,action,reply,minutes});
}
async function moderateOnLeader(data){
 const actor=game.user;
 const {msg,record:r}=authorisedSource(String(data.id||''));
 if(r.status!=='queued')throw new Error('This request has already been processed.');
 const action=String(data.action||''),reply=safeText(data.reply),minutes=Number(data.minutes);
 if(!['reply','broadcast','schedule','decline'].includes(action))throw new Error('Unknown studio action.');
 if(action==='reply'&&(!reply||reply.length>500))throw new Error('Write a reply of up to 500 characters.');
 if(action==='schedule'&&(!Number.isInteger(minutes)||minutes<1||minutes>1440))throw new Error('Schedule between 1 and 1440 Banana Watch minutes.');
 const next={...r,status:{reply:'replied',broadcast:'broadcast',schedule:'scheduled',decline:'declined'}[action],
  handledBy:actor.id,handledAt:Number(game.time?.worldTime||0),...(action==='schedule'?{airAt:Number(game.time?.worldTime||0)+minutes*60}:{}),
  ...(action==='reply'?{reply}: {})};
 // The persistent status is committed before a broadcast; double clicks / GM reconnection cannot duplicate it.
 await msg.setFlag(NS,FLAG,next);
 if(action==='reply')await actionMessage(msg,r,'reply',reply,gmRecipients(r.userId));
 if(action==='broadcast')await actionMessage(msg,r,'broadcast',r.text,null);
 if(action==='decline')await actionMessage(msg,r,'declined','Not this time, mate. Try another request.',gmRecipients(r.userId));
 Hooks.callAll('smokeStudioInboxChanged');
 return {status:next.status,airAt:next.airAt||null};
}

let processing=false;
export async function publishDueStudioShows(){
 if(!isLeader()||!game.user?.isGM||processing)return 0;
 processing=true;let count=0;
 try{
  const now=Number(game.time?.worldTime||0);
  for(const {msg,record:r} of allStudioEntries().filter(x=>x.record.status==='scheduled'&&Number(x.record.airAt)<=now)){
   // Re-check persistent status before broadcasting; status changes before chat creation.
   const fresh=recordOf(msg);if(fresh?.status!=='scheduled')continue;
   await msg.setFlag(NS,FLAG,{...fresh,status:'broadcast',broadcastAt:now});
   await actionMessage(msg,fresh,'broadcast',fresh.text,null);
   count++;
  }
  if(count)Hooks.callAll('smokeStudioInboxChanged');
  return count;
 }finally{processing=false;}
}
export function installStudioInbox(){
 Hooks.on('createChatMessage',msg=>{if(recordOf(msg)||msg.getFlag?.(NS,'studioReplyTo'))Hooks.callAll('smokeStudioInboxChanged');});
 Hooks.on('updateChatMessage',msg=>{if(recordOf(msg))Hooks.callAll('smokeStudioInboxChanged');});
 Hooks.on('updateWorldTime',()=>{void publishDueStudioShows().catch(error=>console.warn('The Smoke | studio schedule',error));});
 if(isLeader()&&game.user.isGM)void publishDueStudioShows().catch(error=>console.warn('The Smoke | studio schedule recovery',error));
}
/** A scheduled broadcast's time as the Banana Watch shows it (world seconds are meaningless to a GM). */
export function airTimeLabel(seconds){
 const n=Number(seconds);if(!Number.isFinite(n))return 'a later time';
 try{const start=String(game.settings.get(NS,'clockStart')||'2026-10-12T09:00').trim();
  const base=Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(start)?start:`${start.length<=16?`${start}:00`:start}Z`);
  const d=new Date((Number.isFinite(base)?base:Date.parse('2026-10-12T09:00:00Z'))+n*1000),pad=v=>String(v).padStart(2,'0');
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
 }catch(_e){return `${Math.round(n/60)} min`;}
}
export function studioInboxMarkup(){
 if(!game.user?.isGM)return '';
 const rows=studioInbox();
 const pending=rows.filter(x=>x.record.status==='queued'||x.record.status==='scheduled').slice(0,30);
 return `<details class="smoke-radio-inbox" data-studio-inbox><summary><i class="fa-solid fa-inbox"></i> GM Studio Inbox <b>${pending.length} pending</b></summary>
 <p class="smoke-radio-hint">Roleplay requests from players only. Broadcasts appear in the game chat, never on actual radio stations.</p>
 ${pending.length?pending.map(({msg,record:r})=>`<article class="smoke-studio-request"><header><b>${esc(r.stationName)} · ${esc(r.actorName)}</b> <small>${r.kind==='announcement'?'AIRTIME REQUEST':'STUDIO MESSAGE'} · ${esc(r.status)}</small></header>
 <p>${esc(r.text)}</p>${r.status==='scheduled'?`<p>On air at ${esc(airTimeLabel(r.airAt))} on the Banana Watch.</p>`:
 `<label>Private reply<textarea rows="2" data-studio-reply="${esc(msg.id)}" maxlength="500" placeholder="Alright mate, the producer says…"></textarea></label>
 <div class="smoke-studio-gm-buttons"><button type="button" data-studio-action="reply" data-studio-id="${esc(msg.id)}">Reply privately</button><button type="button" data-studio-action="broadcast" data-studio-id="${esc(msg.id)}">Broadcast now</button></div>
 <label>Prerecorded · delay (Banana Watch minutes)<input type="number" data-studio-minutes="${esc(msg.id)}" min="1" max="1440" value="60"></label><div class="smoke-studio-gm-buttons"><button type="button" data-studio-action="schedule" data-studio-id="${esc(msg.id)}">Queue broadcast</button><button type="button" data-studio-action="decline" data-studio-id="${esc(msg.id)}">Decline</button></div>`}</article>`).join(''):
 '<p class="smoke-radio-hint">No pending messages. Players can send one through their Blower.</p>'}</details>`;
}
