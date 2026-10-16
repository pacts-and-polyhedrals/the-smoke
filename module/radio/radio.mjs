import {NS} from '../config.mjs';
import {registerHandler,request,esc} from '../world/net.mjs';
import {VEHICLE_ACTIONS,serialScene} from '../vehicles/vehicle-boarding.mjs';
import {DEFAULT_STATIONS,RADIO_DIRECTORY} from './stations.mjs';
import {validateStations,steppedStation,clampVolume,studioLinks,CONTACT_FIELDS} from './core.mjs';
import {RadioReceiver} from './receiver.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
const FLAG='radio',PREFS='radioPreferences';
let selectedActorId=null,vehicleRef=null,radioApp=null,refreshQueued=false;
// What you are typing to the studio survives the panel redrawing (station changes, someone boarding).
const studio={draft:'',open:false,share:false};
const changed=()=>Hooks.callAll('smokeRadioChanged');
export const receiver=new RadioReceiver({changed});
const owns=a=>Boolean(a&&(game.user.isGM||a.isOwner));
const people=()=>game.actors.filter(a=>a.type==='character'&&owns(a));
const preferences=()=>game.settings.get(NS,PREFS)??{};
export function stations(){
 const custom=game.settings.get(NS,'radioStations');
 if(custom){try{return validateStations(withDefaultContacts(JSON.parse(custom)));}catch(error){console.warn('The Smoke | Invalid custom radio directory; using presets.',error);}}
 return DEFAULT_STATIONS.map(s=>({...s}));
}
/** Presets saved before studio contacts existed keep the supplied stations' contacts. */
export function withDefaultContacts(rows){
 return (Array.isArray(rows)?rows:[]).map(row=>{const d=DEFAULT_STATIONS.find(x=>x.id===row?.id);if(!d)return row;const out={...row};for(const k of CONTACT_FIELDS)if(!(k in out))out[k]=d[k]??'';return out;});
}
export function registerRadioSettings(){
 game.settings.register(NS,'radioEnabled',{name:'Live pirate radio',hint:'Allow players to listen to live stations through the Blower and vehicle radios.',scope:'world',config:true,type:Boolean,default:true});
 game.settings.register(NS,'radioStations',{scope:'world',config:false,type:String,default:''});
 game.settings.register(NS,PREFS,{scope:'client',config:false,type:Object,default:{volume:.25,muted:false,phones:{}}});
 game.settings.registerMenu(NS,'radioDirectory',{name:'Live radio presets',label:'Edit radio stations',hint:'Change presets or add a direct HTTPS MP3/AAC stream.',icon:'fa-solid fa-radio',type:RadioDirectory,restricted:true});
}
function tokenFor(actor){
 if(actor?.token&&actor.token.parent?.tokens.get(actor.token.id))return actor.token;
 const here=canvas?.scene?.tokens.filter(t=>t.actorId===actor?.id)??[];
 const controlled=canvas?.tokens?.controlled?.map(t=>t.document??t)??[];
 return here.find(t=>controlled.some(c=>c.id===t.id))??here[0]??[...game.scenes].flatMap(s=>s.tokens.contents??[...s.tokens]).find(t=>t.actorId===actor?.id)??null;
}
function vehicleContext(vt,actor=null,token=null){
 const raw=vt.getFlag(NS,FLAG),list=stations(),station=list.find(s=>s.id===raw?.stationId)??list[0];
 const occupants=vt.getFlag(NS,'vehicleOccupants')??[];
 const pilot=occupants.find(o=>o.seatId==='pilot'),driver=pilot&&vt.parent.tokens.get(pilot.tokenId);
 const seat=driver?.getFlag(NS,'vehicleSeat');
 const canTune=game.user.isGM||Boolean(driver&&owns(driver.actor)&&seat?.vehicleTokenId===vt.id&&seat.seatId==='pilot');
 return {kind:'vehicle',actor,token,vehicle:vt,station,power:raw?.power!==false,canTune,label:vt.name,hint:canTune?'You control the car radio.':'The driver chooses the station.'};
}
export function radioContext(actor=null,ref=null){
 if(ref){const vt=game.scenes.get(ref.sceneId)?.tokens.get(ref.vehicleTokenId);if(game.user.isGM&&vt?.actor?.type==='vehicle')return vehicleContext(vt);}
 if(!actor||actor.type!=='character'||!owns(actor))return {kind:'none',canTune:false,power:false,label:'Choose your character',hint:'Choose an owned character in the Blower.'};
 const token=tokenFor(actor),seat=token?.getFlag(NS,'vehicleSeat'),vt=seat&&token.parent.tokens.get(seat.vehicleTokenId);
 const listed=vt?.getFlag(NS,'vehicleOccupants')?.some(o=>o.tokenId===token.id&&o.seatId===seat.seatId);
 if(vt?.actor?.type==='vehicle'&&listed)return vehicleContext(vt,actor,token);
 const list=stations(),id=preferences().phones?.[actor.id],station=list.find(s=>s.id===id)??list[0];
 return {kind:'phone',actor,token,vehicle:null,station,power:true,canTune:true,label:`${actor.name}'s Blower`,hint:'Your personal station. Volume and mute affect only you.'};
}
const currentContext=()=>radioContext(game.actors.get(selectedActorId),vehicleRef);
function syncPreferences(){const p=preferences();receiver.setVolume(p.volume??.25);receiver.muted=Boolean(p.muted);if(receiver.audio)receiver.audio.muted=receiver.muted;}
export function refreshRadio({retry=false}={}){
 syncPreferences();const c=currentContext();
 if(c.kind==='none'){receiver.stop();return;}
 receiver.follow(c.station,{power:c.power,allowed:game.settings.get(NS,'radioEnabled'),retry});changed();
}
function queueRefresh(){if(refreshQueued)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;refreshRadio();});}
export function selectRadioActor(actor){
 if(actor&&!owns(actor))throw new Error('Choose an owned character.');
 selectedActorId=actor?.id??null;vehicleRef=null;refreshRadio();
}
function selectTarget(actor,ref){
 if(ref){if(!game.user.isGM)throw new Error('Choose your seated character to use this radio.');vehicleRef={...ref};selectedActorId=null;refreshRadio();}
 else selectRadioActor(actor);
}
function isCurrent(actor,ref){return ref?vehicleRef?.sceneId===ref.sceneId&&vehicleRef?.vehicleTokenId===ref.vehicleTokenId:!vehicleRef&&selectedActorId===actor?.id;}
export function radioView(actor=null,ref=null){
 const c=radioContext(actor,ref),active=isCurrent(actor,ref),enabled=active&&receiver.enabled;
 const status=active?receiver.status:'off',available=game.settings.get(NS,'radioEnabled');
 const messages={off:'Tap Listen to connect.',connecting:'Connecting to the live broadcast…',buffering:'Buffering the live broadcast…',playing:receiver.muted?'Playing · muted on your device':'Live broadcast',blocked:'Your browser paused playback. Press Resume.',unavailable:'Stream unavailable here. Retry, tune elsewhere or open the station.',disabled:'The GM has disabled live radio.','car-off':'The car radio is switched off.','no-station':'Choose a station.'};
 return {...c,available,active,enabled,status,statusText:messages[status]??messages.off,live:enabled&&status==='playing',needsRetry:enabled&&['blocked','unavailable'].includes(status),canListen:available&&c.kind!=='none'&&c.power,
  volume:Math.round(receiver.volume*100),muted:receiver.muted,isVehicle:c.kind==='vehicle',presets:stations().map((s,i)=>({...s,number:String(i+1).padStart(2,'0'),selected:s.id===c.station?.id})),directory:RADIO_DIRECTORY};
}
export function radioMarkup(actor=null,ref=null){
 const v=radioView(actor,ref),disabled=!v.canTune||!v.available||v.kind==='none';
 return `<section class="smoke-radio ${v.isVehicle?'in-car':'on-phone'}" aria-label="Live radio">
 <div class="smoke-radio-top"><span class="smoke-kicker"><i class="fa-solid ${v.isVehicle?'fa-car':'fa-headphones'}" aria-hidden="true"></i> ${v.isVehicle?'CAR RADIO':'PIRATE RADIO'}</span><span class="smoke-radio-badge ${v.live?'live':''}">${v.live?'● LIVE':v.enabled?'TUNED IN':'OFF'}</span></div>
 <div class="smoke-radio-display"><small>${esc(v.label)}</small><h2>${esc(v.station?.name??'The ends are on air.')}</h2><p>${esc(v.station?.genre??'Live stations from London and beyond')}</p><div class="smoke-radio-bars ${v.live?'playing':''}" aria-hidden="true">${[3,6,4,8,5,9,6,4,7,3,5,8,4,6,3,7].map(h=>`<i style="--bar:${h}"></i>`).join('')}</div><p class="smoke-radio-status" role="status">${esc(v.available?v.statusText:'The GM has disabled live radio.')}</p></div>
 <div class="smoke-radio-dial"><button type="button" data-radio-step="-1" aria-label="Previous station" ${disabled?'disabled':''}>‹</button><select data-radio-station aria-label="Radio station" ${disabled?'disabled':''}>${v.presets.map(s=>`<option value="${s.id}" ${s.selected?'selected':''}>${s.number} · ${esc(s.name)}</option>`).join('')}</select><button type="button" data-radio-step="1" aria-label="Next station" ${disabled?'disabled':''}>›</button></div>
 <div class="smoke-radio-presets" aria-label="Station presets">${v.presets.map(s=>`<button type="button" data-radio-preset="${s.id}" class="${s.selected?'selected':''}" aria-pressed="${s.selected}" title="${esc(s.name)} · ${esc(s.genre)}" ${disabled?'disabled':''}><b>${s.number}</b><span>${esc(s.name)}</span></button>`).join('')}</div>
 <div class="smoke-radio-play"><button type="button" class="primary" data-radio-listen ${!v.canListen&&!v.enabled?'disabled':''}><i class="fa-solid ${v.enabled&&!v.needsRetry?'fa-stop':'fa-play'}" aria-hidden="true"></i> ${v.needsRetry?(v.status==='blocked'?'Resume':'Retry'):v.enabled?'Stop listening':'Listen'}</button>${v.isVehicle?`<button type="button" data-radio-power ${!v.canTune||!v.available?'disabled':''}>${v.power?'Switch car radio off':'Switch car radio on'}</button>`:''}<button type="button" data-radio-mute aria-label="${v.muted?'Unmute radio':'Mute radio'}" aria-pressed="${v.muted}"><i class="fa-solid ${v.muted?'fa-volume-xmark':'fa-volume-high'}" aria-hidden="true"></i> ${v.muted?'Unmute':'Mute'}</button></div>
 <label class="smoke-radio-volume">Volume <input type="range" data-radio-volume min="0" max="100" step="1" value="${v.volume}" aria-label="Your radio volume"><output>${v.volume}%</output></label>
 ${studioMarkup(v)}
 <p class="smoke-radio-hint">${esc(v.hint)}</p><div class="smoke-radio-links">${v.station?`<a href="${esc(v.station.website)}" target="_blank" rel="noopener noreferrer">Station website ↗</a>${v.station.directory?`<a href="${esc(v.station.directory)}" target="_blank" rel="noopener noreferrer">Listen on radio.net ↗</a>`:''}`:''}<a href="${RADIO_DIRECTORY}" target="_blank" rel="noopener noreferrer">More pirate stations ↗</a>${game.user.isGM?'<button type="button" data-radio-edit>Edit presets</button>':''}</div></section>`;
}
/** Message the studio: the station's own channels, filled in with your message where they can be. */
function studioMarkup(v){
 if(!v.station||v.kind==='none')return '';
 const links=studioLinks(v.station,studio.draft);
 return `<details class="smoke-radio-message" data-radio-studio ${studio.open?'open':''}><summary><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Message the studio <small>${esc(v.station.name)}</small></summary>
 <p class="smoke-radio-hint">This reaches the real station, live. Studio chat opens the station's own chat inside Foundry; WhatsApp, text and email open your own apps with the message filled in — you press send there. Keep it friendly: shout-outs, requests, big ups.</p>
 <textarea data-radio-draft maxlength="500" rows="3" placeholder="Big up everyone in Hackney tonight…" aria-label="Message for ${esc(v.station.name)}">${esc(studio.draft)}</textarea>
 <label class="smoke-radio-share"><input type="checkbox" data-radio-share ${studio.share?'checked':''}> Show the table what you sent</label>
 ${links.length?`<div class="smoke-radio-send">${links.map(l=>`<button type="button" data-radio-send="${l.type}" title="${esc(l.inFoundry?`Opens ${l.detail} in a Foundry window; your message is copied to paste in`:l.prefilled?`${l.label}: ${l.detail} (your message is filled in)`:l.type==='call'?`Call ${l.detail}`:`Opens ${l.detail}; your message is copied to paste in`)}"><i class="${l.icon}" aria-hidden="true"></i> ${esc(l.label)}</button>`).join('')}</div>
 <p class="smoke-radio-hint smoke-radio-ways">${links.map(l=>`${esc(l.label)}: ${esc(l.detail)}`).join(' · ')}</p>`:`<p class="smoke-radio-hint">No studio contact for this preset yet.${game.user.isGM?' Add one in Edit presets.':' The GM can add one in Edit presets.'}</p>`}
 </details>`;
}
/** Copy for pasting: Foundry's helper also works where the browser's clipboard needs HTTPS (a game served over the LAN). */
async function copyText(text){
 if(!text)return false;
 try{if(game.clipboard?.copyPlainText){await game.clipboard.copyPlainText(text);return true;}if(globalThis.navigator?.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch(_e){}
 return false;
}
/** Open one of the station's channels: a link the browser hands to WhatsApp, Messages or Mail, or the station's page. */
export async function messageStudio(type,{actor=null,ref=null,text=studio.draft,share=studio.share}={}){
 const v=radioView(actor,ref),station=v.station;if(!station)throw new Error('Choose a station first.');
 const link=studioLinks(station,text).find(l=>l.type===type);if(!link)throw new Error(`${station.name} has no ${type} contact in the presets.`);
 const message=String(text??'').trim();
 const copied=await copyText(message);
 if(link.inFoundry){
  openStudioChat(station,link,message);
  ui.notifications.info(message?(copied?`Message copied: paste it into ${station.name}'s chat and post it there.`:`Copy your message into ${station.name}'s chat.`):`${station.name}'s studio chat is open.`);
 }else{
  const a=document.createElement('a');a.href=link.href;a.rel='noopener noreferrer';if(/^https?:/.test(link.href))a.target='_blank';
  document.body.append(a);a.click();a.remove();
  if(!link.prefilled&&link.type!=='call')ui.notifications.info(message?(copied?`Message copied: paste it into ${station.name}'s message box.`:`Copy your message into ${station.name}'s message box.`):`${station.name}: opening ${link.detail}.`);
  else if(link.prefilled)ui.notifications.info(`${link.label} opened with your message for ${station.name}. Press send there.`);
 }
 const who=actor??game.actors.get(selectedActorId);
 if(share&&message&&link.type!=='call')await ChatMessage.implementation.create({speaker:ChatMessage.getSpeaker(who?{actor:who}:{}),content:`<section class="smoke-card radio"><header><span class="kicker">PIRATE RADIO · ${esc(link.label.toUpperCase())}</span><strong>${esc(who?.name??game.user.name)} → ${esc(station.name)}</strong></header><p>“${esc(message)}”</p></section>`});
 return link;
}
/** What the studio chat window shows: the station's own chat or message box, and the player's message to paste in. */
export function studioChatContext(station,link,draft=''){
 return {station:station.name,genre:station.genre??'',src:link.href,host:link.detail,draft:String(draft??'').trim().slice(0,500),site:station.messageUrl||link.href};
}
/**
 * The station's own chat, inside Foundry. Players post through the station's system exactly as on its website; nothing
 * is sent on their behalf. A station that forbids being shown inside other sites stays blank: Open on their site.
 */
export class StudioChat extends HandlebarsApplicationMixin(ApplicationV2){
 static DEFAULT_OPTIONS={classes:['the-smoke','smoke-studio-chat-app'],position:{width:440,height:700},window:{title:'Studio chat',icon:'fa-solid fa-comments',resizable:true}};
 static PARTS={main:{template:`systems/${NS}/templates/studio-chat.hbs`}};
 constructor({station,link,draft='',...options}={}){super({...options,id:`smoke-studio-chat-${station.id}`,window:{title:`${station.name} · Studio chat`}});this.station=station;this.link=link;this.draft=String(draft??'').trim().slice(0,500);}
 async _prepareContext(options){return {...await super._prepareContext(options),...studioChatContext(this.station,this.link,this.draft)};}
 /** A new message for a chat that is already open: shown without reloading the chat (which would lose its place). */
 setDraft(text){
  this.draft=String(text??'').trim().slice(0,500);const box=this.element?.querySelector('[data-studio-draft]');
  if(box){box.hidden=!this.draft;const q=box.querySelector('q');if(q)q.textContent=this.draft;}
 }
 async _onRender(ctx,opts){
  await super._onRender(ctx,opts);const root=this.element,frame=root.querySelector('iframe'),site=studioChatContext(this.station,this.link).site;
  root.querySelector('[data-studio-copy]')?.addEventListener('click',async e=>{e.preventDefault();if(await copyText(this.draft))ui.notifications.info('Message copied: paste it into the chat box.');else ui.notifications.warn('Copying is blocked here: select your message and copy it.');});
  root.querySelector('[data-studio-open]')?.addEventListener('click',e=>{e.preventDefault();window.open(site,'_blank','noopener,noreferrer');});
  root.querySelector('[data-studio-reload]')?.addEventListener('click',e=>{e.preventDefault();if(frame)frame.src=this.link.href;});
  // A live page under the pointer would take a window drag or resize for itself: the window keeps the pointer until it lets go.
  root.addEventListener('pointerdown',e=>{if(!frame||!e.target.closest('.window-header,.window-resize-handle'))return;frame.style.pointerEvents='none';window.addEventListener('pointerup',()=>{frame.style.pointerEvents='';},{once:true});});
 }
}
export function openStudioChat(station,link,draft=''){
 const open=foundry.applications.instances?.get(`smoke-studio-chat-${station.id}`);
 if(open){open.setDraft(draft);if(open.minimized)open.maximize();open.bringToFront?.();return open;}
 const app=new StudioChat({station,link,draft});app.render(true);return app;
}
async function savePreferences(patch){return game.settings.set(NS,PREFS,{...preferences(),...patch});}
export async function tuneRadio(id,{actor=null,ref=null,power}={}){
 const c=radioContext(actor,ref);if(!game.settings.get(NS,'radioEnabled'))throw new Error('The GM has disabled live radio.');
 if(!c.canTune)throw new Error('Only the seated driver or GM can tune the car radio.');
 if(id!==undefined&&!stations().some(s=>s.id===id))throw new Error('Choose a listed station.');
 selectTarget(actor,ref);
 if(c.kind==='vehicle')await request('radio.tune',{sceneId:c.vehicle.parent.id,vehicleTokenId:c.vehicle.id,...(id!==undefined?{stationId:id}:{}),...(power!==undefined?{power}:{} )});
 else if(c.kind==='phone'&&id!==undefined)await savePreferences({phones:{...preferences().phones,[actor.id]:id}});
 else throw new Error('Choose a character or a car radio.');
 refreshRadio();
}
registerHandler('radio.tune',data=>serialScene(data.sceneId,async()=>{
 const {sceneId,vehicleTokenId,userId,stationId,power}=data,user=game.users.get(userId),vt=game.scenes.get(sceneId)?.tokens.get(vehicleTokenId);
 if(!user||vt?.actor?.type!=='vehicle')throw new Error('Vehicle or user no longer available.');
 if(!game.settings.get(NS,'radioEnabled'))throw new Error('The GM has disabled live radio.');
 if(!user.isGM){
  const pilot=(vt.getFlag(NS,'vehicleOccupants')??[]).find(o=>o.seatId==='pilot'),driver=pilot&&vt.parent.tokens.get(pilot.tokenId),seat=driver?.getFlag(NS,'vehicleSeat');
  if(!driver?.actor?.testUserPermission(user,'OWNER')||seat?.vehicleTokenId!==vt.id||seat.seatId!=='pilot')throw new Error('Only the seated driver or GM can tune the car radio.');
 }
 if(stationId===undefined&&power===undefined)throw new Error('Choose a station or change the power.');
 if(stationId!==undefined&&!stations().some(s=>s.id===stationId))throw new Error('Choose a listed station.');
 if(power!==undefined&&typeof power!=='boolean')throw new Error('Radio power must be on or off.');
 const old=vt.getFlag(NS,FLAG),next={stationId:stationId??old?.stationId??stations()[0].id,power:power??old?.power??true};
 await vt.setFlag(NS,FLAG,next);return next;
}));
export function bindRadio(root,{actor=null,ref=null}={}){
 const run=fn=>async event=>{event.preventDefault();event.stopPropagation();try{await fn(event);}catch(error){ui.notifications.warn(error.message);}};
 root.querySelector('[data-radio-listen]')?.addEventListener('click',run(()=>{
  const v=radioView(actor,ref);if(v.enabled&&!v.needsRetry)return receiver.stop();
  if(!v.canListen)throw new Error(v.isVehicle&&!v.power?'The driver has switched off the car radio.':'Live radio is unavailable.');
  selectTarget(actor,ref);const c=currentContext();receiver.listen(c.station,{power:c.power,allowed:game.settings.get(NS,'radioEnabled')});
 }));
 root.querySelector('[data-radio-station]')?.addEventListener('change',run(e=>tuneRadio(e.currentTarget.value,{actor,ref})));
 root.querySelectorAll('[data-radio-step]').forEach(b=>b.addEventListener('click',run(()=>tuneRadio(steppedStation(stations(),radioContext(actor,ref).station?.id,Number(b.dataset.radioStep)),{actor,ref}))));
 root.querySelectorAll('[data-radio-preset]').forEach(b=>b.addEventListener('click',run(()=>tuneRadio(b.dataset.radioPreset,{actor,ref}))));
 root.querySelector('[data-radio-power]')?.addEventListener('click',run(()=>tuneRadio(undefined,{actor,ref,power:!radioContext(actor,ref).power})));
 root.querySelector('[data-radio-mute]')?.addEventListener('click',run(async()=>{receiver.setMuted(!receiver.muted);await savePreferences({muted:receiver.muted});}));
 const volume=root.querySelector('[data-radio-volume]');
 volume?.addEventListener('input',e=>{receiver.setVolume(Number(e.currentTarget.value)/100);const output=e.currentTarget.parentElement.querySelector('output');if(output)output.textContent=Math.round(receiver.volume*100)+'%';});
 volume?.addEventListener('change',run(()=>savePreferences({volume:receiver.volume})));
 root.querySelector('[data-radio-edit]')?.addEventListener('click',run(()=>new RadioDirectory().render(true)));
 root.querySelector('[data-radio-studio]')?.addEventListener('toggle',e=>{studio.open=e.currentTarget.open;});
 root.querySelector('[data-radio-draft]')?.addEventListener('input',e=>{studio.draft=e.currentTarget.value.slice(0,500);});
 root.querySelector('[data-radio-share]')?.addEventListener('change',e=>{studio.share=e.currentTarget.checked;});
 root.querySelectorAll('[data-radio-send]').forEach(b=>b.addEventListener('click',run(async()=>{
  const box=root.querySelector('[data-radio-draft]');if(box)studio.draft=box.value.slice(0,500);
  await messageStudio(b.dataset.radioSend,{actor,ref});
 })));
}
export class RadioApp extends HandlebarsApplicationMixin(ApplicationV2){
 static DEFAULT_OPTIONS={id:'smoke-radio',classes:['the-smoke','smoke-radio-app'],position:{width:460,height:680},window:{title:'The Smoke · Pirate Radio',resizable:true}};
 static PARTS={main:{template:`systems/${NS}/templates/radio.hbs`,scrollable:['.smoke-radio-body']}};
 _actorId=null;_ref=null;_hook=null;
 constructor(options={}){super(options);this._actorId=options.actorId??game.user.character?.id??people()[0]?.id;this._ref=options.vehicleRef??null;}
 async _prepareContext(options){const ctx=await super._prepareContext(options);return {...ctx,radio:radioMarkup(game.actors.get(this._actorId),this._ref),characters:this._ref?[]:people().map(a=>({id:a.id,name:a.name,selected:a.id===this._actorId}))};}
 async _onRender(ctx,opts){await super._onRender(ctx,opts);bindRadio(this.element,{actor:game.actors.get(this._actorId),ref:this._ref});this.element.querySelector('[data-radio-character]')?.addEventListener('change',e=>{this._actorId=e.currentTarget.value;selectRadioActor(game.actors.get(this._actorId));this.render(false);});if(!this._hook)this._hook=Hooks.on('smokeRadioChanged',()=>{const v=radioView(game.actors.get(this._actorId),this._ref),key=[v.kind,v.status,v.station?.id,v.power,v.muted,v.enabled,v.canTune,v.available].join('|');if(key===this._key)return;this._key=key;this.render(false);});}
 async close(options){if(this._hook)Hooks.off('smokeRadioChanged',this._hook);this._hook=null;return super.close(options);}
}
export function openRadio(actor=null){
 actor??=game.user.character??people()[0]??null;selectTarget(actor,null);
 radioApp??=new RadioApp();radioApp._actorId=actor?.id??null;radioApp._ref=null;return radioApp.render(true);
}
export function openVehicleRadio(vt){
 const occupants=vt.getFlag(NS,'vehicleOccupants')??[];
 const mine=occupants.map(o=>vt.parent.tokens.get(o.tokenId)?.actor).filter(a=>a?.type==='character'&&owns(a));
 const actor=mine.find(a=>a.id===game.user.character?.id)??mine[0];
 if(actor)return openRadio(actor);
 if(!game.user.isGM)throw new Error('Take a seat in this vehicle to listen to its radio.');
 const ref={sceneId:vt.parent.id,vehicleTokenId:vt.id};selectTarget(null,ref);
 radioApp??=new RadioApp();radioApp._actorId=null;radioApp._ref=ref;return radioApp.render(true);
}
export class RadioDirectory extends HandlebarsApplicationMixin(ApplicationV2){
 static DEFAULT_OPTIONS={id:'smoke-radio-directory',classes:['the-smoke','smoke-radio-directory'],position:{width:700,height:760},window:{title:'The Smoke · Radio presets',resizable:true}};
 static PARTS={main:{template:`systems/${NS}/templates/radio-directory.hbs`,scrollable:['.smoke-radio-editor-rows']}};
 _rows=null;
 async _prepareContext(options){if(!game.user.isGM)throw new Error('GM only.');this._rows??=stations();return {...await super._prepareContext(options),stations:this._rows.map((s,i)=>({...s,number:i+1,hasContact:CONTACT_FIELDS.some(k=>s[k])}))};}
 _read(){return [...this.element.querySelectorAll('[data-radio-row]')].map(row=>Object.fromEntries(['id','name','genre','stream','website','directory',...CONTACT_FIELDS].map(k=>[k,row.querySelector(`[data-field="${k}"]`)?.value??''])));}
 async _onRender(ctx,opts){
  await super._onRender(ctx,opts);this.element.querySelectorAll('[data-radio-editor]').forEach(b=>b.addEventListener('click',async()=>{
   try{
    if(!game.user.isGM)throw new Error('GM only.');const action=b.dataset.radioEditor;this._rows=this._read();
    if(action==='add'){this._rows.push({id:'custom-'+foundry.utils.randomID(8).toLowerCase(),name:'',genre:'',stream:'',website:'',directory:'',...Object.fromEntries(CONTACT_FIELDS.map(k=>[k,'']))});return this.render(false);}
    if(action==='remove'){this._rows.splice(Number(b.dataset.index),1);return this.render(false);}
    if(action==='reset'){if(!await foundry.applications.api.DialogV2.confirm({window:{title:'Restore original presets?'},content:'<p>This replaces your edited list with the supplied pirate-radio stations.</p>'}))return;this._rows=stationsFromDefaults();return this.render(false);}
    if(action==='save'){const rows=validateStations(this._rows);await game.settings.set(NS,'radioStations',JSON.stringify(rows));ui.notifications.info(`${rows.length} radio presets saved.`);return this.close();}
   }catch(error){ui.notifications.warn(error.message);}
  }));
 }
}
const stationsFromDefaults=()=>DEFAULT_STATIONS.map(s=>({...s}));
export function installRadio(){
 syncPreferences();selectedActorId=game.user.character?.id??people()[0]?.id??null;
 // Runtime consent is deliberately not restored when a player reloads the world.
 for(const hook of ['canvasReady','createToken','deleteToken','updateActor','deleteActor','smokeTransit','smokeBoarded'])Hooks.on(hook,queueRefresh);
 Hooks.on('updateToken',(_doc,changes)=>{if(changes.flags||changes.actorId||Object.keys(changes).some(k=>k.startsWith(`flags.${NS}.`)))queueRefresh();});
 Hooks.on('updateSetting',setting=>{if(['radioStations','radioEnabled',PREFS].some(k=>setting.key===`${NS}.${k}`))queueRefresh();});
 Hooks.on('updateUser',user=>{if(user.id===game.user.id)queueRefresh();});
 VEHICLE_ACTIONS.push(vt=>game.user.isGM||(vt.getFlag(NS,'vehicleOccupants')??[]).some(o=>owns(vt.parent.tokens.get(o.tokenId)?.actor))?[{icon:'fa-solid fa-radio',title:'Car radio',fn:()=>openVehicleRadio(vt)}]:[]);
 globalThis.addEventListener?.('beforeunload',()=>receiver.stop());
}
export const radioAPI={open:openRadio,vehicle:openVehicleRadio,stop:()=>receiver.stop(),stations,refresh:refreshRadio,message:messageStudio,studioChat:(station,draft=studio.draft)=>{const link=studioLinks(station,draft).find(l=>l.type==='chat');if(!link)throw new Error(`${station?.name??'This station'} has no studio chat in the presets.`);return openStudioChat(station,link,draft);},studioLinks:station=>studioLinks(station,studio.draft)};
