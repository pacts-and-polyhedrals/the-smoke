import {NS} from './config.mjs';
import {jobsAPI} from './world/jobs.mjs';
import {request,esc} from './world/net.mjs';
import {resolveAttack} from './gameplay.mjs';
const owns=a=>game.user.isGM||a?.isOwner;
export function installChat(){
  Hooks.on('renderChatMessageHTML',(message,html)=>{
    const root=html?.querySelector?html:html?.[0];if(!root)return;
    root.querySelectorAll('.gm').forEach(el=>{if(!game.user.isGM)el.hidden=true;});
    if(message.getFlag(NS,'resolved'))root.querySelectorAll('[data-smoke-damage],[data-smoke-dodge],[data-smoke-aid]').forEach(b=>{b.disabled=true;b.title='Already resolved';});
    if(message.getFlag(NS,'conditionApplied'))root.querySelectorAll('[data-smoke-condition]').forEach(b=>b.disabled=true);
    if(message.getFlag(NS,'attack')&&message.getFlag(NS,'resolution')!=='hit')root.querySelectorAll('[data-smoke-condition]').forEach(b=>{b.disabled=true;b.title=message.getFlag(NS,'resolution')==='dodged'?'The attack was dodged.':'Take the hit before choosing its condition.';});
    if(message.getFlag(NS,'outcomeResolved'))root.querySelectorAll('[data-smoke-wasted],[data-smoke-busted]').forEach(b=>b.disabled=true);
    root.querySelectorAll('button').forEach(button=>{
      const d=button.dataset;if(!Object.keys(d).some(k=>k.startsWith('smoke')))return;
      button.addEventListener('click',async event=>{
        event.preventDefault();button.disabled=true;
        try{
          const uuid=d.smokeRoll||d.smokeDamage||d.smokeDodge||d.smokeCondition||d.smokeCrime||d.smokeWasted||d.smokeBusted||d.smokeAid;
          const doc=uuid?await fromUuid(uuid):null,a=doc?.actor??doc;
          if(d.smokeRoll){if(!owns(a))throw new Error('Roll from your own character.');let context=null;if(d.context)context=JSON.parse(d.context);if(!context&&d.label==='Stay Conscious')context={kind:'stayUp'};return await a.rollDialog(d.stat,{band:d.band||null,tn:d.tn??null,label:d.label,context});}
          if(d.smokeDamage||d.smokeDodge){if(!owns(a))throw new Error('The target’s owner or GM resolves the hit.');return await resolveAttack(message,{dodge:Boolean(d.smokeDodge)});}
          if(d.smokeCondition){if(!owns(a))throw new Error('The target’s owner or GM applies conditions.');await request('combat.condition',{messageId:message.id,condition:d.condition});button.textContent=`${d.condition} ✓`;return;}
          if(d.smokeCrime){if(!game.user.isGM)throw new Error('GM only.');if(message.getFlag(NS,'crimeAdded'))throw new Error('Heat already added for this action.');await message.setFlag(NS,'crimeAdded',true);return await game.smoke.heat.reportCrime(a,d.crime);}
          if(d.smokeWasted||d.smokeBusted){if(!owns(a))throw new Error('Not your character.');return await game.smoke.heat[d.smokeWasted?'wasted':'busted'](a,{messageId:message.id});}
          if(d.smokeJobAccept)return await jobsAPI.acceptCall(d.smokeJobAccept);
          if(d.smokeJobDecline)return await jobsAPI.declineCall(d.smokeJobDecline);
          if(d.smokeAid)return await request('aid.apply',{messageId:message.id});
        }catch(error){ui.notifications.warn(error.message);}finally{if(button.isConnected&&!message.getFlag(NS,'resolved'))button.disabled=false;}
      });
    });
  });
}
export function installSceneControls(){
  Hooks.on('getSceneControlButtons',controls=>{
    const tools={blower:{name:'blower',title:'The Blower · jobs & character',icon:'fa-solid fa-mobile-screen',button:true,onChange:()=>game.smoke.phone()},streetControl:{name:'streetControl',title:'The Smoke · Street Control',icon:'fa-solid fa-city',button:true,visible:game.user.isGM,onChange:()=>game.smoke.control()}};
    if(Array.isArray(controls)){const token=controls.find(c=>c.name==='token');if(token)token.tools.push(...Object.values(tools).map(t=>({...t,onClick:t.onChange})));}
    else if(controls.tokens)Object.assign(controls.tokens.tools,tools);
    else if(controls.token)Object.assign(controls.token.tools,tools);
  });
  game.keybindings.register(NS,'blower',{name:'Open the Blower',editable:[{key:'KeyB',modifiers:['Alt']}],onDown:()=>{game.smoke.phone();return true;}});
}
