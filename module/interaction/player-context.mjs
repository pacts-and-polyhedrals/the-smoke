// Safe street-action menu for non-owned tokens. Foundry's native TokenHUD is a token-owner editor,
// not an interaction system. A non-GM player gets a short, allowlisted list of actions without
// changing Actor ownership, permitting token configuration, or exposing NPC actor sheets.
import {keepOnScreen} from '../apps/fit-menus.mjs';
import {vehicleActions,openVehicleBoardDialog} from '../vehicles/vehicle-boarding.mjs';
import {pickpocket,talkTo} from '../world/theft.mjs';
import {collectParcelToken,describeParcel} from '../world/mission-props.mjs';
import {NS} from '../config.mjs';
import {isPublicTransportVehicle} from '../graffiti/auto-sites.mjs';
import {openRadioWar,inspectRadioWar,radioWarAtToken} from '../radio/war.mjs';

/** Whether a user may interact with this placeable at all. Does NOT grant ownership/control. */
export function playerContextAllowed(placeable,user=game.user) {
  const doc=placeable?.document,actor=doc?.actor;
  if(!user||!doc||!actor)return false;
  if(doc.hidden||placeable.visible===false||placeable.isVisible===false)return false;
  if(!['vehicle','npc'].includes(actor.type))return false;
  if(canvas?.scene && doc.parent?.id !== canvas.scene.id)return false;
  // Painted surfaces and buses have a dedicated safe right-click menu for ALL
  // users (including the GM). Hold Shift for the ordinary Foundry owner HUD.
  if(doc.getFlag?.(NS,'tagSpot') || isPublicTransportVehicle(doc) || radioWarAtToken(doc))return true;
  if(user.isGM||placeable.isOwner||actor.isOwner)return false;
  return true;
}
/** Access to the context menu NEVER replaces the per-action GM-side authorisation checks. */
export function playerActionsFor(doc,user=game.user) {
  if(!doc?.actor||doc.hidden)return [];
  if(radioWarAtToken(doc))return [
    {icon:'fa-solid fa-tower-broadcast',title:'Work this radio contact',fn:()=>openRadioWar(doc)},
    {icon:'fa-solid fa-chart-line',title:'Radio-war standing',fn:()=>inspectRadioWar(doc)},
    {icon:'fa-solid fa-radio',title:'Open the live radio dial',fn:()=>game.smoke.radio.open()}
  ];
  if(doc.getFlag?.(NS,'tagSpot') || isPublicTransportVehicle(doc))return [
    {icon:'fa-solid fa-spray-can-sparkles',title:'Tag surface / spray',fn:()=>game.smoke.tags.open(null,{spotTokenId:doc.id})},
    {icon:'fa-solid fa-eye',title:'Inspect graffiti',fn:()=>game.smoke.graffiti.inspect(doc.parent,doc.id)},
    ...(doc.actor.type==='vehicle'? [{icon:'fa-solid fa-car-side',title:'Board / choose seat',fn:()=>openVehicleBoardDialog(doc)},...vehicleActions(doc,{playerOnly:true})] : [])
  ];
  if(user?.isGM)return [];
  if(doc.actor.type==='vehicle')return [
    {icon:'fa-solid fa-car-side',title:'Board / choose seat',fn:()=>openVehicleBoardDialog(doc)},
    ...vehicleActions(doc,{playerOnly:true})
  ];
  if(doc.getFlag?.(NS,'missionProp'))return [
    {icon:'fa-solid fa-box-open',title:'Collect mission property',fn:()=>collectParcelToken(doc)},
    {icon:'fa-solid fa-circle-info',title:'Inspect property',fn:()=>ui.notifications.info(describeParcel(doc))}
  ];
  if(doc.actor.type==='npc')return [
    {icon:'fa-solid fa-comments',title:'Talk / approach',fn:()=>talkTo(doc)},
    {icon:'fa-solid fa-hand',title:'Attempt pickpocket (Graft)',fn:()=>pickpocket(doc)}
  ];
  return [];
}
let activePopup=null;
export function dismissPlayerActions() {
  if(activePopup){activePopup();activePopup=null;}
}
function fromEvent(event) {
  const e=event?.nativeEvent??event?.data?.originalEvent??event;
  const rect=canvas?.app?.view?.getBoundingClientRect?.();
  return {x:Number(e?.clientX??(rect?rect.left+(event?.global?.x??0):100))||100,
    y:Number(e?.clientY??(rect?rect.top+(event?.global?.y??0):100))||100};
}
/** A deliberately separate menu, never the native GM/owner Token HUD. */
export function openPlayerActionMenu(doc,event=null) {
  if(typeof document==='undefined'||!document.body)return false;
  const obj=canvas?.tokens?.get?.(doc?.id)??canvas?.tokens?.placeables?.find?.(t=>t.document===doc);
  if(!playerContextAllowed(obj)) return false;
  const actions=playerActionsFor(doc);
  if(!actions.length)return false;
  dismissPlayerActions();
  const where=fromEvent(event),win=globalThis.window;
  const x=Math.max(8,Math.min(where.x,(win?.innerWidth||1440)-245));
  const y=Math.max(8,Math.min(where.y-20,(win?.innerHeight||900)-Math.min(400,45+actions.length*43)));
  const host=document.createElement('div');
  host.className='smoke-vehicle-boarding-popover smoke-player-action-popover';
  host.setAttribute('role','menu');
  host.setAttribute('aria-label','Street actions');
  host.style.left=`${x}px`;host.style.top=`${y}px`;
  const heading=document.createElement('div');heading.className='smoke-player-menu-title';
  heading.textContent=doc.name||'Street interaction';host.append(heading);
  for(const action of actions){
    const button=document.createElement('button');button.type='button';
    button.className='control-icon smoke-vehicle-boarding-action smoke-player-action';
    button.setAttribute('role','menuitem');button.title=action.title;
    const icon=document.createElement('i');icon.className=action.icon||'fa-solid fa-hand';icon.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.textContent=action.title;
    button.append(icon,label);
    button.addEventListener('click',ev=>{
      ev.preventDefault();ev.stopPropagation();dismissPlayerActions();
      Promise.resolve().then(()=>action.fn(doc)).catch(error=>ui.notifications.warn(error.message));
    });host.append(button);
  }
  const hint=document.createElement('p');hint.className='smoke-player-menu-hint';
  hint.textContent='Actions use your character and are checked by the GM-side rules. They do not grant control of this token.';
  host.append(hint);document.body.append(host);keepOnScreen(host);
  const closeOutside=ev=>{if(!host.contains(ev.target))dismissPlayerActions();};
  const closeEscape=ev=>{if(ev.key==='Escape')dismissPlayerActions();};
  document.addEventListener('pointerdown',closeOutside,true);
  document.addEventListener('keydown',closeEscape,true);
  activePopup=()=>{document.removeEventListener('pointerdown',closeOutside,true);document.removeEventListener('keydown',closeEscape,true);host.remove();};
  return true;
}
/** Fallback for devices/other modules which intercept right-click first: T target, Actions toolbar, Alt+I. */
export function openTargetActions() {
  if(game.user?.isGM) return ui.notifications.info('GM: right-click a paintable surface, bus, or radio contact to open its safe action menu.');
  const targets=[...(game.user?.targets||[])];
  const token=targets.find(t=>playerContextAllowed(t))??canvas?.tokens?.controlled?.find(t=>playerContextAllowed(t));
  if(!token) return ui.notifications.warn('Target a visible vehicle, person or mission property (hover and press T), then click Street Actions or press Alt+I.');
  return openPlayerActionMenu(token.document);
}
/**
 * The Token class(es) to patch: Foundry's own, a replacement a module registered in CONFIG.Token.objectClass, and the
 * old global only when it is a plain value (in v13+ it is a deprecation getter for the same class).
 */
function tokenClasses() {
  const legacy=Object.getOwnPropertyDescriptor(globalThis,'Token'),old=legacy&&'value' in legacy?legacy.value:null;
  return [...new Set([foundry.canvas?.placeables?.Token,globalThis.CONFIG?.Token?.objectClass,old].filter(k=>typeof k?.prototype?._onClickRight==='function'))];
}
/**
 * Foundry captures a token's right-click handlers when it draws the token. Tokens drawn before the patch (everything on
 * the map when the world loads — Pat's chained bikes, parked cars) kept Foundry's owner-only handlers, so a player's
 * right-click did nothing on them until the map was reloaded. Point those already-drawn tokens at the patched ones.
 */
function rearmDrawnTokens() {
  for(const t of canvas?.tokens?.placeables??[]){
    const m=t?.mouseInteractionManager;if(!m)continue;
    if(m.permissions&&typeof m.permissions==='object')m.permissions.clickRight=t._canHUD;
    if(m.callbacks&&typeof m.callbacks==='object')m.callbacks.clickRight=t._onClickRight;
  }
}
/**
 * Install as early as possible (at init, before the first map is drawn), so every token is drawn with the player
 * right-click menu. Safe to call again. Does not grant token ownership.
 */
export function installPlayerInteractions() {
  const key=Symbol.for('the-smoke.player-context-v1');
  const classes=tokenClasses().filter(k=>!k.prototype[key]);
  if(!classes.length){ if(!tokenClasses().length)console.warn('The Smoke | Token right-click API unavailable; players can target and use Street Actions (Alt+I).'); rearmDrawnTokens(); return; }
  for(const klass of classes){
    const proto=klass.prototype,originalRight=proto._onClickRight,originalCanHUD=proto._canHUD;
    Object.defineProperty(proto,key,{value:true,configurable:false});
    // Foundry normally permits the Token HUD only for owners. Allow the right-click *event* on
    // visible non-owned interactable tokens; the handler below intercepts it BEFORE the native HUD.
    // _canControl, _canDrag, actor ownership and native HUD actions remain untouched.
    proto._canHUD=function(user,event){
      if(playerContextAllowed(this,user??game.user))return true;
      return typeof originalCanHUD==='function'?originalCanHUD.call(this,user,event):Boolean(this.isOwner);
    };
    proto._onClickRight=function(...args){
      const e=args[0]?.nativeEvent??args[0]?.data?.originalEvent??args[0];
      if(!e?.shiftKey && playerContextAllowed(this,game.user)){
        openPlayerActionMenu(this.document,args[0]);
        return; // No native HUD or token-configuration controls for non-owners.
      }
      dismissPlayerActions();
      return originalRight.apply(this,args);
    };
  }
  rearmDrawnTokens();
  if(installPlayerInteractions.hooked)return;installPlayerInteractions.hooked=true;
  Hooks.on('canvasReady',rearmDrawnTokens);
  Hooks.on('canvasReady',dismissPlayerActions);
  Hooks.on('deleteToken',doc=>{if(doc?.parent?.id===canvas?.scene?.id)dismissPlayerActions();});
}
