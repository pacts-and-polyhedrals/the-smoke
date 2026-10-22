// Beta radio split: players message GM only; real station links, broadcasts and scheduling stay with the GM.
import assert from 'node:assert/strict';
import './runtime-stub.mjs';
import {dispatch} from '../module/world/net.mjs';
import {DEFAULT_STATIONS} from '../module/radio/stations.mjs';
import {radioMarkup,radioAPI,messageStudio,openStudioChat} from '../module/radio/radio.mjs';
import {studioInbox,studioModerate,publishDueStudioShows,RETIRED_STATIONS} from '../module/radio/studio.mjs';

const ns='the-smoke';
const gm={id:'gm',isGM:true,active:true,name:'Asmo'},
      player={id:'player',isGM:false,active:true,name:'Hatch'},
      outsider={id:'other',isGM:false,active:true,name:'Other'};
game.user=gm;game.users=Object.assign([gm,player,outsider],{activeGM:gm,get:id=>[gm,player,outsider].find(u=>u.id===id),filter:fn=>[gm,player,outsider].filter(fn)});
const actor={id:'hatch',type:'character',name:'Hatch',isOwner:true,
 testUserPermission:(user,permission)=>user.id==='player'||user.isGM};
const otherActor={id:'other-pc',type:'character',name:'Stranger',testUserPermission:user=>user.isGM};
game.actors=Object.assign([actor,otherActor],{get:id=>[actor,otherActor].find(a=>a.id===id),filter:fn=>[actor,otherActor].filter(fn)});
globalThis.canvas={scene:null,tokens:{controlled:[]}};
game.time={worldTime:20000};
const settings=new Map([['radioStations',''],['radioEnabled',true],['radioPresetVersion',515],['radioPreferences',{volume:.3,muted:false,phones:{}}]]);
game.settings.get=(ns,k)=>settings.get(k);game.settings.set=async(ns,k,v)=>{settings.set(k,v);return v;};
const messages=new Map();let seq=0;
game.messages={get:id=>messages.get(id),get contents(){return [...messages.values()];}};
globalThis.ChatMessage={getSpeaker:()=>({}),implementation:{create:async data=>{
 const id=`msg-${++seq}`;
 const msg={id,user:{id:gm.id},...data,flags:foundry.utils.deepClone(data.flags||{}),
  getFlag(ns,key){return this.flags?.[ns]?.[key]??null;},
  async setFlag(ns,key,value){(this.flags[ns]??={})[key]=value;return value;}};
 messages.set(id,msg);return msg;
}}};
const station=DEFAULT_STATIONS[0];
const first=await dispatch('radio.studio.submit',{userId:player.id,actorId:actor.id,stationId:station.id,kind:'message',text:'Big up the arches',submissionId:'first-sub-001'});
const submitted=messages.get(first.id);
assert.equal(submitted.getFlag(ns,'studioRequest').status,'queued');
assert.equal(submitted.getFlag(ns,'studioRequest').actorName,'Hatch');
assert.deepEqual([...submitted.whisper].sort(),['gm','player'],'private inbox only, not other players');
assert.match(submitted.content,/FICTIONAL STUDIO/);
assert.equal((await dispatch('radio.studio.submit',{userId:player.id,actorId:actor.id,stationId:station.id,kind:'message',text:'Big up the arches',submissionId:'first-sub-001'})).id,first.id,'replay creates no duplicate');
await assert.rejects(dispatch('radio.studio.submit',{userId:player.id,actorId:otherActor.id,stationId:station.id,kind:'message',text:'Not my character',submissionId:'different-sub-001'}),/belongs to you/);
await assert.rejects(dispatch('radio.studio.submit',{userId:player.id,actorId:actor.id,stationId:'codesouth',kind:'message',text:'hello',submissionId:'retired-station-01'}),/removed/);
await assert.rejects(dispatch('radio.studio.submit',{userId:player.id,actorId:actor.id,stationId:station.id,kind:'announcement',text:'Another now',submissionId:'rate-limit-001'}),/Give the studio/);
assert.equal(studioInbox().length,1);
const gmMarkup=radioMarkup(actor,null,{gmInbox:true});
assert.match(gmMarkup,/GM Studio Inbox/);
assert.match(gmMarkup,/Reply privately/);
assert.match(gmMarkup,/Real station contacts/);
assert.match(gmMarkup,/Station website/);

game.user=player;
const playerMarkup=radioMarkup(actor,null,{gmInbox:true});
assert.match(playerMarkup,/data-radio-internal="message"/);
assert.match(playerMarkup,/data-radio-internal="announcement"/);
assert.doesNotMatch(playerMarkup,/data-radio-send|mailto:|whatsapp|tel:|Station website|More pirate stations|radio\.net|Real station contacts|GM Studio Inbox/);
assert.equal(studioInbox().length,0,'player cannot read GM inbox');
assert.throws(()=>radioAPI.studioLinks(station),/GM only/);
assert.throws(()=>radioAPI.studioChat(station),/GM only/);
assert.rejects(messageStudio('email',{actor,text:'contact the real station'}),/GM-only/);
assert.throws(()=>openStudioChat(station,{href:station.website}),/GM-only/);
await assert.rejects(studioModerate(first.id,'broadcast'),/active GM/,'players cannot broadcast even with a known message id');
game.user=gm;
await studioModerate(first.id,'reply',{reply:'Nice one, Hatch. Keep your ears open.'});
assert.equal(submitted.getFlag(ns,'studioRequest').status,'replied');
assert.deepEqual([...messages.get('msg-2').whisper].sort(),['gm','player'],'GM reply stays private');
await assert.rejects(studioModerate(first.id,'broadcast'),/already been processed/,'no double approve');
submitted.getFlag(ns,'studioRequest').createdAt-=25000;
const second=await dispatch('radio.studio.submit',{userId:player.id,actorId:actor.id,stationId:station.id,kind:'announcement',text:'Oi, London: big up the crew.',submissionId:'second-sub-002'});
const queue=messages.get(second.id);
const later=await studioModerate(second.id,'schedule',{minutes:60});
assert.equal(later.status,'scheduled');assert.equal(later.airAt,23600);
assert.equal(await publishDueStudioShows(),0,'not early');
game.time.worldTime=23600;
assert.equal(await publishDueStudioShows(),1,'one fictional announcement when Banana Watch arrives');
assert.equal(queue.getFlag(ns,'studioRequest').status,'broadcast');
assert.equal(await publishDueStudioShows(),0,'time tick / reconnect never broadcasts twice');
assert.equal(messages.size,4,'one request, one reply, one queued request, one broadcast');
assert.equal(RETIRED_STATIONS.size,2);
console.log('radio beta: private GM inbox, player links hidden, real contact GM-only, station removal, verified ownership, replay/rate limits, replies, scheduled roleplay broadcasts and replay protection — ok');
