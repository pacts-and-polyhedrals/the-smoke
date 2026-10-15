import {NS,STATS,STAT_KEYS,DIE_LADDER,HEAT,JOB_TYPES,DEFAULT_ICONS} from '../config.mjs';
import {CONDITION_LIBRARY} from '../rules/conditions.mjs';
import {validateStartingSpread} from '../rules/core.mjs';
import {seatLayout,openVehicleBoardDialog,openVehicleControl} from '../vehicles/vehicle-boarding.mjs';
import {abilitiesOf,ABILITIES} from '../vehicles/vehicle-abilities.mjs';
const {HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
const {ActorSheetV2,ItemSheetV2}=foundry.applications.sheets;
const read=input=>input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
const editor=async(value,doc)=>foundry.applications.ux.TextEditor.implementation.enrichHTML(value||'',{secrets:doc.isOwner,relativeTo:doc});
const owned=doc=>{if(!doc.isOwner)throw new Error('You need ownership to change this sheet.');};

export class SmokeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2){
  static DEFAULT_OPTIONS={classes:['the-smoke','smoke-sheet'],tag:'form',position:{width:880,height:800},window:{resizable:true},form:{closeOnSubmit:false,submitOnChange:false}};
  static PARTS={main:{template:`systems/${NS}/templates/actor.hbs`,scrollable:['.smoke-sheet-body']}};
  _activeTab='overview';
  async _prepareContext(options){
    const ctx=await super._prepareContext(options),a=this.actor,s=a.system;
    const isVehicle=a.type==='vehicle';
    const tabs=(isVehicle?[['overview','Vehicle'],['seats','Seats & Kit'],['story','Details']]:[['overview','On the Street'],['kit','Kit & Perks'],['conditions','Conditions'],['story','Identity']]).map(([id,label])=>({id,label,active:this._activeTab===id}));
    const token=a.token??canvas?.scene?.tokens.find(t=>t.actorId===a.id);
    const occupants=token?.getFlag(NS,'vehicleOccupants')??[];
    return {...ctx,actor:a,system:s,editable:a.isOwner,isGM:game.user.isGM,isVehicle,tabs,
      overview:this._activeTab==='overview',kit:this._activeTab==='kit',conditionsTab:this._activeTab==='conditions',story:this._activeTab==='story',seatsTab:this._activeTab==='seats',
      stats:STAT_KEYS.map(key=>({key,...STATS[key],die:s.stats?.[key]?.die??4,mod:s.statMods?.[key]??0,options:DIE_LADDER.map(d=>({value:d,label:`d${d}`,selected:s.stats?.[key]?.die===d}))})),
      spread:!isVehicle?validateStartingSpread(s.stats):null,
      heat:HEAT[s.heat?.value??0],stars:Array.from({length:5},(_,i)=>({value:i+1,lit:i<Number(s.heat?.value??0)})),
      dice:DIE_LADDER.map(d=>({value:d,label:`d${d}`,selected:s.vehicle?.perfDie===d})),
      weapons:a.items.filter(i=>i.type==='weapon'),gear:a.items.filter(i=>i.type==='gear'),armour:a.items.filter(i=>i.type==='armour'),perks:a.items.filter(i=>i.type==='perk'),conditions:a.items.filter(i=>i.type==='condition'),
      conditionLibrary:CONDITION_LIBRARY.map(c=>({...c,active:a.items.some(i=>i.type==='condition'&&i.name===c.name)})),
      biography:await editor(s.biography,a),notes:await editor(s.notes,a),systems:await editor(s.vehicle?.systems,a),
      seats:isVehicle?seatLayout(a).map(seat=>({...seat,occupant:occupants.find(o=>o.seatId===seat.id)?.name??'Empty'})):[],
      abilities:isVehicle?abilitiesOf(a).map(ab=>({...ABILITIES[ab.key],key:ab.key})):[],
      vehicleJobs:isVehicle?Object.entries(JOB_TYPES).filter(([key])=>key!=='crew').map(([key,j])=>({key,label:j.label,active:s.vehicle.jobs.includes(key)})):[],
      tokenOnMap:Boolean(token)
    };
  }
  async _onRender(context,options){
    await super._onRender(context,options);const el=this.element;
    el.querySelector('[data-edit="img"]')?.addEventListener('click',()=>{if(!this.actor.isOwner)return;new foundry.applications.apps.FilePicker.implementation({type:'image',current:this.actor.img,callback:img=>this.actor.update({img})}).browse();});
    el.querySelectorAll('[name]').forEach(input=>input.addEventListener('change',async ev=>{
      const t=ev.currentTarget;if(!t.name||t.name.startsWith('job.'))return;
      try{owned(this.actor);await this.actor.update({[t.name]:read(t)});}catch(e){ui.notifications.warn(e.message);}
    }));
    el.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',ev=>this._action(ev)));
    el.querySelectorAll('[data-vehicle-job]').forEach(b=>b.addEventListener('change',async()=>{
      try{owned(this.actor);const jobs=[...el.querySelectorAll('[data-vehicle-job]:checked')].map(x=>x.dataset.vehicleJob);await this.actor.update({'system.vehicle.jobs':jobs});}catch(e){ui.notifications.warn(e.message);}
    }));
  }
  async _action(event){
    event.preventDefault();const b=event.currentTarget,a=this.actor,action=b.dataset.action;
    try{
      if(action==='tab'){this._activeTab=b.dataset.tab;return this.render(false);}
      if(action==='phone')return game.smoke.phone(a);
      if(action==='guide')return game.smoke.openGuide('player-guide');
      owned(a);
      if(action==='roll')return a.rollDialog(b.dataset.stat,{band:'medium'});
      if(action==='use')return a.items.get(b.dataset.item)?.use();
      if(action==='editItem')return a.items.get(b.dataset.item)?.sheet.render(true);
      if(action==='deleteItem'){const item=a.items.get(b.dataset.item);if(item&&await DialogV2.confirm({window:{title:`Remove ${item.name}?`},content:'<p>Remove this item from the character?</p>'}))await item.delete();return;}
      if(action==='condition'){const name=b.dataset.condition;return a.items.some(i=>i.type==='condition'&&i.name===name)?a.removeCondition(name):a.addCondition(name);}
      if(action==='addItem'){const type=b.dataset.type;const [item]=await a.createEmbeddedDocuments('Item',[{name:`New ${type}`,type,img:DEFAULT_ICONS[type]}]);return item.sheet.render(true);}
      if(action==='unarmed')return a.rollAttack(null,[...game.user.targets][0]?.document);
      if(action==='heal')return a.heal(2);
      if(action==='damage')return a.applyDamage(2);
      if(action==='firstAid')return game.smoke.firstAid(a);
      if(action==='rest')return game.smoke.rest(a);
      if(action==='services')return game.smoke.services(a);
      if(action==='reload'){const w=a.items.get(b.dataset.item);if(w)await w.update({'system.ammo.value':w.system.ammo.max});return;}
      if(action==='advance')return game.smoke.advance(a);
      if(action==='board'||action==='vehicleControl'){
        const token=a.token??canvas?.scene?.tokens.find(t=>t.actorId===a.id);if(!token)throw new Error('Place this vehicle on the map first.');
        return action==='board'?openVehicleBoardDialog(token):openVehicleControl(token);
      }
      if(action==='creator')return game.smoke.creator(a);
    }catch(error){console.error('The Smoke | sheet action',error);ui.notifications.warn(error.message);}
  }
  async _onDropItem(event,data){
    owned(this.actor);const item=data?.toObject?data:await Item.implementation.fromDropData(data);if(!item)return;
    if(item.parent?.uuid===this.actor.uuid)return super._onSortItem?.(event,item);
    const source=item.toObject();delete source._id;return this.actor.createEmbeddedDocuments('Item',[source]);
  }
}
export class SmokeItemSheet extends HandlebarsApplicationMixin(ItemSheetV2){
  static DEFAULT_OPTIONS={classes:['the-smoke','smoke-sheet','smoke-item-sheet'],tag:'form',position:{width:610,height:650},window:{resizable:true},form:{closeOnSubmit:false,submitOnChange:false}};
  static PARTS={main:{template:`systems/${NS}/templates/item.hbs`,scrollable:['.smoke-sheet-body']}};
  async _prepareContext(options){
    const ctx=await super._prepareContext(options),i=this.item;
    return {...ctx,item:i,system:i.system,editable:i.isOwner,weapon:i.type==='weapon',armour:i.type==='armour',gear:i.type==='gear',condition:i.type==='condition',perk:i.type==='perk',description:await editor(i.system.description,i),
      stats:STAT_KEYS.map(key=>({key,label:STATS[key].label,selected:key===i.system.stat}))};
  }
  async _onRender(ctx,opts){
    await super._onRender(ctx,opts);this.element.querySelector('[data-edit="img"]')?.addEventListener('click',()=>{if(!this.item.isOwner)return;new foundry.applications.apps.FilePicker.implementation({type:'image',current:this.item.img,callback:img=>this.item.update({img})}).browse();});this.element.querySelectorAll('[name]').forEach(input=>input.addEventListener('change',async ev=>{
      try{owned(this.item);await this.item.update({[ev.currentTarget.name]:read(ev.currentTarget)});}catch(e){ui.notifications.warn(e.message);}
    }));
  }
}
export function registerSheets(){
  const config=foundry.applications.apps.DocumentSheetConfig;
  config.registerSheet(Actor,NS,SmokeActorSheet,{types:['character','npc','vehicle'],makeDefault:true,label:'The Smoke'});
  config.registerSheet(Item,NS,SmokeItemSheet,{types:['weapon','armour','gear','condition','perk'],makeDefault:true,label:'The Smoke'});
}
