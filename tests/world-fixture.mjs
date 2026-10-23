// Shared document-level simulation for the upgrade tests. Uses real catalogue/map data,
// but is not a Foundry browser, canvas renderer or Forge server.
import './runtime-stub.mjs';
import {fakeActor,setPath,J,uid} from './fakes.mjs';
const NS='the-smoke',copy=x=>JSON.parse(JSON.stringify(x));
export const collection=(values=[])=>Object.defineProperty(Object.assign(values,{get(id){return this.find(x=>x.id===id);}}),'contents',{get(){return this;},configurable:true});
function merge(a,b){for(const [k,v]of Object.entries(b||{})){if(v&&typeof v==='object'&&!Array.isArray(v)){a[k]??={};merge(a[k],v);}else a[k]=copy(v);}return a;}
function updateDoc(doc,change){for(const [k,v]of Object.entries(change)){
 if(k.startsWith('-=')){delete doc[k.slice(2)];continue;}
 if(k.includes('.-=')){const [prefix,last]=k.split('.-=');let at=prefix.split('.').reduce((x,p)=>x?.[p],doc);if(at)delete at[last];continue;}
 if(k.includes('.'))setPath(doc,k,copy(v));else if(v&&typeof v==='object'&&!Array.isArray(v))merge(doc[k]??={},v);else doc[k]=copy(v);
}}
export async function makeWorld({players=4,preloadMaps=true}={}){
 const settings=new Map(),docs=new Map(),chat=collection(),actors=collection(),scenes=collection();
 const gm={id:'gm',isGM:true,active:true,name:'GM',can:()=>true},users=collection([gm,...Array.from({length:players},(_,i)=>({id:`user${i+1}`,isGM:false,active:true,name:`Player ${i+1}`,can:()=>true}))]);users.activeGM=gm;
 globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,LIMITED:1,OBSERVER:2,OWNER:3},TOKEN_DISPLAY_MODES:{ALWAYS:50,OWNER:20}};
 game.user=gm;game.users=users;game.actors=actors;game.scenes=scenes;game.folders=collection();game.messages=chat;game.combats=collection();game.paused=false;game.smoke={};
 game.settings={get:(_ns,k)=>copy(settings.get(k)??null),set:async(_ns,k,v)=>{settings.set(k,copy(v));if(k==='missions')Hooks.callAll('smokeMissionsChanged');return v;},register:(_ns,k,o)=>{if(!settings.has(k))settings.set(k,copy(o.default??null));},registerMenu:()=>{}};
 game.time={worldTime:100000,advance:async n=>{game.time.worldTime+=n;Hooks.callAll('updateWorldTime',game.time.worldTime,n,{},gm.id);return game.time.worldTime;}};
 foundry.utils.mergeObject=(a,b)=>merge(a,b);foundry.utils.setProperty=(a,k,v)=>{setPath(a,k,v);return true;};foundry.utils.getProperty=(a,k)=>k.split('.').reduce((x,p)=>x?.[p],a);
 globalThis.fromUuid=async u=>docs.get(u)||null;
 globalThis.Folder.implementation={create:async d=>{const f={...d,id:uid()};game.folders.push(f);return f;}};
 globalThis.ChatMessage.implementation={create:async d=>{
  const c={...copy(d),id:uid(),flags:copy(d.flags||{}),getFlag(ns,k){return this.flags?.[ns]?.[k];},async setFlag(ns,k,v){setPath(this,`flags.${ns}.${k}`,copy(v));return this;},async update(ch){updateDoc(this,ch);return this;}};chat.push(c);return c;
 }};
 function createActor(d,{synthetic=false,base=null}={}){
  const a=fakeActor({name:d.name,type:d.type,items:d.items||[],cash:d.system?.cash??100,health:d.system?.resources?.health?.value??10});
  const old=a.update.bind(a);a.id=d._id||a.id;a.uuid=`Actor.${a.id}`;a.img=d.img||'';a.flags=copy(d.flags||{});a.ownership=copy(d.ownership||{default:0});a.prototypeToken=copy(d.prototypeToken||{});
  a.system=merge(a.system,copy(d.system||{}));a.hasPlayerOwner=d.type==='character';a.isOwner=true;
  a.testUserPermission=(u,perm)=>Boolean(u?.isGM||Number(a.ownership[u?.id]??a.ownership.default)>=({OWNER:3,OBSERVER:2,LIMITED:1}[perm]||3));
  a.update=async change=>{await old(change);Hooks.callAll('updateActor',a,change,{},game.user.id);return a;};
  a.setFlag=async(ns,k,v)=>{setPath(a,`flags.${ns}.${k}`,copy(v));return a;};
  a.getTokenDocument=async change=>({toObject:()=>merge({actorId:a.id,name:a.name,width:1,height:1,actorLink:a.type==='character',x:0,y:0,rotation:0,flags:{},texture:{src:a.img}},merge(copy(a.prototypeToken),change||{}))});
  a.toObject=()=>({name:a.name,type:a.type,img:a.img,system:copy(a.system),flags:copy(a.flags),ownership:copy(a.ownership),prototypeToken:copy(a.prototypeToken),items:a.items.map(i=>({_id:i.id,name:i.name,type:i.type,img:i.img,system:copy(i.system),flags:copy(i.flags)}))});
  a.sheet={render:()=>true};a.delete=async()=>{const i=actors.indexOf(a);if(i>=0)actors.splice(i,1);};
  if(!synthetic){actors.push(a);docs.set(a.uuid,a);}return a;
 }
 globalThis.Actor.implementation={create:async d=>createActor(d)};
 game.actors.fromCompendium=d=>d.toObject();
 const castDocs=J('london-cast.json').cast.filter(c=>!c.existing).map(c=>({getFlag:(ns,k)=>k==='castKey'?c.key:null,toObject:()=>({name:c.name,type:'npc',img:c.img,system:{role:c.role},flags:{[NS]:{castKey:c.key}},prototypeToken:{width:1,height:1,actorLink:false}})}));
 game.packs={get:key=>key===`${NS}.campaign-cast`?{getDocuments:async()=>castDocs}:null};
 async function addToken(scene,data){
  const base=actors.get(data.actorId);if(!base)throw new Error(`No actor ${data.actorId}`);
  const linked=data.actorLink??base.type==='character',a=linked?base:createActor({...base.toObject(),_id:base.id},{synthetic:true});
  const t={...copy(data),id:data._id||uid(),parent:scene,actorId:base.id,actor:a,hidden:Boolean(data.hidden),width:data.width||1,height:data.height||1,x:data.x||0,y:data.y||0,rotation:data.rotation||0,flags:copy(data.flags||{})};
  t.uuid=`Scene.${scene.id}.Token.${t.id}`;
  if(!linked){a.token=t;a.uuid=`${t.uuid}.Actor.${base.id}`;docs.set(a.uuid,a);}
  t.getFlag=(ns,k)=>t.flags?.[ns]?.[k];t.setFlag=async(ns,k,v)=>t.update({[`flags.${ns}.${k}`]:v});
  t.unsetFlag=async(ns,k)=>t.update({[`flags.${ns}.-=${k}`]:null});
  t.toObject=()=>{const out={};for(const k of ['name','actorId','actorLink','x','y','width','height','rotation','hidden','flags','texture','disposition','elevation','light'])if(t[k]!==undefined)out[k]=copy(t[k]);return out;};
  t.update=async(change,options={})=>{if(Hooks.call('preUpdateToken',t,change,options,game.user.id)===false)return t;updateDoc(t,change);if(change.actorLink===true)t.actor=base;Hooks.callAll('updateToken',t,change,options,game.user.id);return t;};
  t.delete=async options=>scene.deleteEmbeddedDocuments('Token',[t.id],options);
  t.object={document:t,isOwner:true,visible:true};scene.tokens.push(t);docs.set(t.uuid,t);return t;
 }
 async function addScene(map){
  const s={id:`scene-${map.id}`,name:map.name||map.title,width:map.width,height:map.height,grid:{size:map.gridSize||map.grid||100},tokens:collection(),walls:collection(),active:false,
   flags:{[NS]:{[map.id.startsWith('LDN-')?'streetAtlas':'place']:{...copy(map)},zoneGraph:{zones:copy(map.zones)}}},
   getFlag(ns,k){return this.flags?.[ns]?.[k];},async setFlag(ns,k,v){setPath(this,`flags.${ns}.${k}`,v);return this;},async update(ch){updateDoc(this,ch);return this;},async view(){canvas.scene=this;game.user.viewedScene=this.id;return this;},
   async createEmbeddedDocuments(type,data,options={}){if(type!=='Token')return [];const ts=[];for(const d of data){const t=await addToken(this,d);ts.push(t);Hooks.callAll('createToken',t,options,game.user.id);}return ts;},
   async updateEmbeddedDocuments(type,updates,options={}){const result=[];for(const ch of updates){const t=this.tokens.get(ch._id);if(t)result.push(await t.update(ch,options));}return result;},
   async deleteEmbeddedDocuments(type,ids,options={}){for(const id of ids){const t=this.tokens.get(id);if(t){this.tokens.splice(this.tokens.indexOf(t),1);docs.delete(t.uuid);Hooks.callAll('deleteToken',t,options,game.user.id);}}}
  };
  if(typeof s.grid.size==='object')s.grid.size=Number(map.grid?.size||100);scenes.push(s);return s;
 }
 globalThis.canvas={scene:null,tokens:{controlled:[],placeables:[],get:id=>canvas.scene?.tokens.get(id)?.object},ready:true,grid:{size:100}};
 if(preloadMaps)for(const f of ['london-street-atlas.json','london-places.json','london-venues.json'])for(const map of J(f).maps)await addScene(map);
 const pcs=[];for(let i=1;i<=players;i++){const a=createActor({name:`PC ${i}`,type:'character',ownership:{default:0,[`user${i}`]:3},system:{stage:20,cash:1000}});pcs.push(a);users.get(`user${i}`).character=a;}
 const put=async(actor,mid,point)=>{const scene=scenes.find(s=>s.getFlag(NS,'place')?.id===mid||s.getFlag(NS,'streetAtlas')?.id===mid);if(!scene)throw new Error(`Missing map ${mid}`);
  for(const old of scenes)for(const t of [...old.tokens])if(t.actor===actor)await old.deleteEmbeddedDocuments('Token',[t.id],{acTransit:true});
  const g=scene.grid.size||100;const d=(await actor.getTokenDocument()).toObject();const [t]=await scene.createEmbeddedDocuments('Token',[{...d,x:point[0]-g/2,y:point[1]-g/2}],{acTransit:true});
  for(const u of users)if(u.character===actor)u.viewedScene=scene.id;canvas.scene=scene;return t;
 };
 return {settings,docs,chat,actors,scenes,users,gm,pcs,put,createActor,addScene,addToken};
}
