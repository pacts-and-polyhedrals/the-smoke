import {NS,STATS,STAT_KEYS,DIE_LADDER,JOB_TYPES,CRIMES} from '../config.mjs';
import {state,jobsAPI,canWorkCall} from '../world/jobs.mjs';
import {request,esc} from '../world/net.mjs';
import {mapIdOf,zonesOf,tokenCentre} from '../world/spawn.mjs';
import {findOrImportScene,loadAtlas,openTravelDialog} from '../map/map-transit.mjs';
import {getawayTN,zoneCentre,mapGraph,hopDistances} from '../rules/jobs-core.mjs';
const {ApplicationV2,HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
export const permittedCharacters=()=>game.actors.filter(a=>a.type==='character'&&(game.user.isGM||a.isOwner));
const currentToken=a=>a?.token??canvas?.scene?.tokens.find(t=>t.actorId===a?.id);
function callAction(call){
  const ctx=step=>({callId:call.id,step});
  if(call.type==='taxi'&&call.stage==='dropoff'&&!call.chat)return {label:'Chat with the fare',stat:'frt',band:'medium',context:ctx('chat')};
  if(call.type==='ambulance'&&['treat','hospital'].includes(call.stage))return {label:call.stage==='treat'?'Treat & load the patient':'Treat the patient',stat:'sav',band:'medium',context:ctx(call.stage==='treat'?'load':'treat')};
  if(call.type==='fire'&&call.stage==='fight')return {label:'Hose it down',stat:'grt',band:'hard',context:ctx('hose')};
  if(call.type==='police'){
    if(call.stage==='pursuit')return {label:'Close the gap',stat:'whl',tn:call.chaseTN??14,context:ctx('chase')};
    if(call.stage==='calm')return {label:'Calm it down',stat:'frt',band:'medium',context:ctx('calm')};
    if(call.stage==='stop'&&call.stopAsked)return {label:'Signal it to stop',stat:'frt',band:'medium',context:ctx('stop')};
    if(call.stage==='arrest'&&call.cuffAsked)return {label:'Cuff the suspect',stat:'mus',band:'medium',context:ctx('cuff')};
  }
  return null;
}
export class Blower extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'smoke-blower',classes:['the-smoke','smoke-phone'],position:{width:410,height:720},window:{title:'The Blower',resizable:true}};
  static PARTS={main:{template:`systems/${NS}/templates/phone.hbs`,scrollable:['.smoke-phone-content']}};
  _actorId=null;_clock=null;_hook=null;_actorHook=null;
  constructor(options={}){super(options);this._actorId=options.actorId??game.user.character?.id??permittedCharacters()[0]?.id;}
  async _prepareContext(options){
    const ctx=await super._prepareContext(options),chars=permittedCharacters();
    if(!chars.some(a=>a.id===this._actorId))this._actorId=chars[0]?.id;
    const actor=game.actors.get(this._actorId),s=state();
    const shifts=Object.values(s.shifts).filter(sh=>sh.actorId===actor?.id),shift=shifts[0];
    const calls=Object.values(s.calls).filter(c=>c.actorId===actor?.id||(c.status==='active'&&canWorkCall(c,actor))).map(c=>({...c,jobLabel:JOB_TYPES[c.type]?.label,offered:c.status==='offered',action:callAction(c),hasProgress:c.type==='fire',hasGap:c.stage==='pursuit',delivered:c.type==='crew'?`${c.data.delivered}/${c.data.order.want}`:null}));
    const token=currentToken(actor),seat=token?.getFlag(NS,'vehicleSeat'),vt=seat&&token.parent.tokens.get(seat.vehicleTokenId);
    const startable=vt&&seat.seatId==='pilot'&&!shift?(vt.actor.system.vehicle.jobs||[]).map(type=>({type,label:JOB_TYPES[type]?.verb})).filter(j=>j.label):[];
    return {...ctx,actor,characters:chars.map(a=>({id:a.id,name:a.name,selected:a.id===this._actorId})),shift:shift?{...shift,label:JOB_TYPES[shift.type]?.label}:null,calls,startable,heatStars:'★'.repeat(actor?.system.heat?.value??0)+'☆'.repeat(5-(actor?.system.heat?.value??0)),paused:game.settings.get(NS,'jobsPaused'),pausedAt:game.settings.get(NS,'pausedAt'),location:token?.parent.name??'No token on this map'};
  }
  async _onRender(ctx,opts){
    await super._onRender(ctx,opts);
    this.element.querySelector('[data-character]')?.addEventListener('change',e=>{this._actorId=e.currentTarget.value;this.render(false);});
    this.element.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',e=>this._action(e)));
    if(!this._hook)this._hook=Hooks.on('smokeJobsChanged',()=>this.render(false));
    if(!this._actorHook)this._actorHook=Hooks.on('updateActor',a=>{if(a.id===this._actorId)this.render(false);});
    if(!this._clock)this._clock=setInterval(()=>this._countdown(),1000);this._countdown();
  }
  _countdown(){
    const paused=game.settings.get(NS,'jobsPaused'),at=paused?game.settings.get(NS,'pausedAt'):Date.now();
    this.element?.querySelectorAll('[data-deadline]').forEach(el=>{const seconds=Math.max(0,Math.ceil((Number(el.dataset.deadline)-at)/1000));el.textContent=`${paused?'Ⅱ ':''}${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;el.classList.toggle('urgent',seconds<30);});
  }
  async _action(ev){
    const b=ev.currentTarget;try{
      const actor=game.actors.get(this._actorId);if(!actor)throw new Error('Choose an owned character.');
      const token=currentToken(actor),call=b.dataset.call&&state().calls[b.dataset.call];
      if(b.dataset.action==='accept')return jobsAPI.acceptCall(b.dataset.call);
      if(b.dataset.action==='decline')return jobsAPI.declineCall(b.dataset.call);
      if(b.dataset.action==='end')return jobsAPI.endShift(b.dataset.shift);
      if(b.dataset.action==='pat')return jobsAPI.askPat(actor);
      if(b.dataset.action==='sheet')return actor.sheet.render(true);
      if(b.dataset.action==='guide')return game.smoke.openGuide('player-guide');
      if(b.dataset.action==='travel'){if(!token)throw new Error('Place your character on this map first.');return openTravelDialog(token);}
      if(b.dataset.action==='start'){
        const seat=token?.getFlag(NS,'vehicleSeat'),vehicle=seat&&token.parent.tokens.get(seat.vehicleTokenId);
        if(!vehicle)throw new Error('Take the driver seat in a job vehicle first.');return jobsAPI.startShift(vehicle,b.dataset.type);
      }
      if(b.dataset.action==='roll'&&call){const action=callAction(call);if(action)return actor.rollDialog(action.stat,action);}
      if(b.dataset.action==='route'&&call)return showJobRoute(actor,call);
    }catch(e){ui.notifications.warn(e.message);}
  }
  async close(opts){if(this._clock)clearInterval(this._clock);if(this._hook)Hooks.off('smokeJobsChanged',this._hook);if(this._actorHook)Hooks.off('updateActor',this._actorHook);this._clock=this._hook=this._actorHook=null;return super.close(opts);}
}
export async function showJobRoute(actor,call){
  const t=currentToken(actor);if(!t)throw new Error('Your character needs a token on this map.');
  const dest=call.dest??(['dropoff'].includes(call.stage)?call.data.dest:null);
  const from=mapIdOf(t.parent),{atlas}=await loadAtlas();
  const goal=dest?.mapId??(call.data?.sceneId?mapIdOf(game.scenes.get(call.data.sceneId)):null);
  const targetScene=dest?game.scenes.find(s=>mapIdOf(s)===dest.mapId):game.scenes.get(call.data?.sceneId);
  const zone=targetScene&&zonesOf(targetScene).find(z=>z.id===(dest?.zoneId??call.data.zoneId));
  if(zone&&targetScene.id===canvas.scene?.id){const [x,y]=zoneCentre(zone);canvas.ping({x,y});}
  let route=[];if(from&&goal){const graph=mapGraph(atlas),queue=[[from]],seen=new Set([from]);while(queue.length){const path=queue.shift();if(path.at(-1)===goal){route=path;break;}for(const next of graph.get(path.at(-1))||[])if(!seen.has(next)){seen.add(next);queue.push([...path,next]);}}}
  const names=route.map(id=>atlas.maps.find(m=>m.id===id)?.name??id);
  return DialogV2.wait({window:{title:'The Blower · Directions'},content:`<p>${esc(call.instruction||call.text||'Follow the tip-offs.')}</p>${names.length?`<ol>${names.map(n=>`<li>${esc(n)}</li>`).join('')}</ol>`:'<p>Check the job instructions for the named location.</p>'}<p>Move to a road exit, then right-click → Go to the next map. Foot traffic can walk through doors automatically.</p>`,buttons:[{action:'close',label:'Got it'}]});
}
export class StreetControl extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'smoke-street-control',classes:['the-smoke','smoke-control'],position:{width:620,height:730},window:{title:'The Smoke · Street Control',resizable:true}};
  static PARTS={main:{template:`systems/${NS}/templates/control.hbs`,scrollable:['.smoke-control-body']}};
  async _prepareContext(options){const ctx=await super._prepareContext(options);return {...ctx,isGM:game.user.isGM,scene:canvas?.scene,characters:permittedCharacters(),settings:['streetLife','policeResponse','policeChase','heatCooling','jobsPaused'].map(key=>({key,label:{streetLife:'Street Life',policeResponse:'Automatic police response',policeChase:'Police drive themselves',heatCooling:'Heat cools out of sight',jobsPaused:'Pause job clocks'}[key],active:game.settings.get(NS,key)})),crimes:Object.entries(CRIMES).map(([key,c])=>({key,...c})),shifts:Object.values(state().shifts).map(sh=>({...sh,name:game.actors.get(sh.actorId)?.name,label:JOB_TYPES[sh.type]?.label})),counts:{traffic:canvas?.scene?.tokens.filter(t=>t.getFlag(NS,'traffic')).length??0,police:canvas?.scene?.tokens.filter(t=>t.getFlag(NS,'police')).length??0}};}
  async _onRender(ctx,opts){await super._onRender(ctx,opts);this.element.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',e=>this._action(e)));this.element.querySelectorAll('[data-setting]').forEach(b=>b.addEventListener('change',async()=>{try{if(!game.user.isGM)throw new Error('GM only.');if(b.dataset.setting==='jobsPaused')await jobsAPI.pause(b.checked);else await game.settings.set(NS,b.dataset.setting,b.checked);this.render(false);}catch(e){ui.notifications.warn(e.message);}}));}
  async _action(ev){
    if(!game.user.isGM)return;const b=ev.currentTarget;try{
      const scene=canvas?.scene;
      if(b.dataset.action==='setup')return game.smoke.setup();
      if(b.dataset.action==='importMaps')return game.smoke.content.importAllMaps();
      if(b.dataset.action==='diagnostics')return game.smoke.diagnostics();
      if(b.dataset.action==='guide')return game.smoke.openGuide(b.dataset.key||'gm-guide');
      if(b.dataset.action==='overview'){const s=await findOrImportScene('LDN-OVERVIEW');return s.view();}
      if(b.dataset.action==='populate'||b.dataset.action==='clear'||b.dataset.action==='respond'||b.dataset.action==='standDown'){
        if(!scene)throw new Error('View a London street scene first.');const type={populate:'traffic.populate',clear:'traffic.clear',respond:'heat.respond',standDown:'heat.standDown'}[b.dataset.action];await request(type,{sceneId:scene.id});return this.render(false);
      }
      if(b.dataset.action==='setHeat'){const row=b.closest('[data-actor]'),actor=game.actors.get(row.dataset.actor);await game.smoke.heat.setHeat(actor,Number(row.querySelector('select').value),'GM Street Control');return this.render(false);}
      if(b.dataset.action==='award'){const a=game.actors.get(b.dataset.actor);await a.update({'system.advancement.available':Number(a.system.advancement?.available||0)+1});ui.notifications.info(`${a.name}: +1 advance.`);return;}
      if(b.dataset.action==='end'){await jobsAPI.endShift(b.dataset.shift);return this.render(false);}
      if(b.dataset.action==='spawnJob')return spawnJobVehicle(b.dataset.type);
    }catch(e){ui.notifications.warn(e.message);}
  }
}
export async function spawnJobVehicle(type){
  const scene=canvas?.scene;if(!scene||!scene.getFlag(NS,'streetAtlas'))throw new Error('Open a London street map.');
  const {ensureVehicleActor,placeToken,lanePoint}=await import('../world/spawn.mjs');
  const id={taxi:'LV12',police:'LV23',ambulance:'LV26',fire:'LV27',courier:'LV05',bus:'LV28'}[type];
  const actor=await ensureVehicleActor(id),road=zonesOf(scene).find(z=>z.kind==='road');
  const selected=canvas.tokens.controlled.find(t=>t.actor?.type==='character')?.document;
  const p=selected?{x:selected.x+scene.grid.size*3,y:selected.y,rotation:0}:lanePoint(road,Math.random,null,scene);
  const t=await placeToken(scene,actor,p.x,p.y,{rotation:p.rotation,flags:{issued:true,locked:false,serviceVehicle:true}});
  ui.notifications.info(`${t.name}: unlocked and issued for ${JOB_TYPES[type].label} work.`);return t;
}
export async function characterCreator(actor=null){
  const rows=STAT_KEYS.map((key,i)=>`<label>${STATS[key].label}<select name="${key}">${[4,6,8].map(d=>`<option value="${d}" ${Number(actor?.system.stats[key]?.die??(i===0?8:i<4?6:4))===d?'selected':''}>d${d}</option>`).join('')}</select></label>`).join('');
  const form=await DialogV2.input({window:{title:actor?`Build ${actor.name}`:'New face in the Smoke'},content:`<div class="the-smoke smoke-creator"><p>Choose <b>one d8, three d6 and five d4</b>. Everyone begins with Health 10, Hustle 3 and £40.</p><label>Name<input name="name" value="${esc(actor?.name||'New face')}" required></label><div class="smoke-field-grid three">${rows}</div><label>Day hustle<input name="hustle" value="${esc(actor?.system.identity.hustle||'')}" placeholder="Courier, mechanic, student…"></label><label>Ambition<input name="ambition" value="${esc(actor?.system.identity.ambition||'')}" placeholder="What would getting out look like?"></label></div>`,ok:{label:actor?'Apply build':'Create character'}});
  if(!form)return;
  const {validateStartingSpread}=await import('../rules/core.mjs');const stats=Object.fromEntries(STAT_KEYS.map(key=>[key,{die:Number(form[key])}]));const check=validateStartingSpread(stats);if(!check.valid)throw new Error(check.message);
  const system={stats,identity:{hustle:String(form.hustle||''),ambition:String(form.ambition||'')}};
  if(actor)return actor.update({name:String(form.name||actor.name),...Object.fromEntries(STAT_KEYS.map(k=>[`system.stats.${k}.die`,stats[k].die])),'system.identity.hustle':system.identity.hustle,'system.identity.ambition':system.identity.ambition});
  const a=await Actor.implementation.create({name:String(form.name||'New face'),type:'character',system,prototypeToken:{actorLink:true,disposition:1},ownership:{default:0,[game.user.id]:3}});a.sheet.render(true);return a;
}
