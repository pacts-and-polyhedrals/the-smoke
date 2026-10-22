// The movement gauge on the map: in a chase, rings round whichever vehicle is being driven on the current die show how
// far it can still go this action — green (safe), yellow (pushing it), red (the limit). Everyone at the table sees
// them. They follow the vehicle as it moves and shrink as the action is used up. A police escape move gets its own
// ring (how far the escaper can still get), and so does a character on foot whose die it is.
import {NS} from '../config.mjs';
import {driveBands, bandsLeft} from '../rules/driving.mjs';
import {chaseOf, vehicleNow, actionKey, tallyOf, vehicleOf, currentCombatant} from '../world/chase-state.mjs';

let gfx = null, label = null, tracked = null, queued = false, labelDy = 0;
const COLOURS = {green: 0x3ddc84, yellow: 0xffd23f, red: 0xff4d4d};
function layer() { return canvas?.interface ?? canvas?.controls ?? canvas?.stage; }
function ensure() {
  if (!globalThis.PIXI || !canvas?.ready) return false;
  if (!gfx || gfx.destroyed) { gfx = new PIXI.Graphics(); gfx.eventMode = 'none'; gfx.name = 'smoke-drive-gauge'; layer()?.addChild?.(gfx); }
  if (!label || label.destroyed) {
    const Text = foundry.canvas?.containers?.PreciseText ?? globalThis.PreciseText ?? PIXI.Text;
    label = new Text('', {fontFamily: 'Oswald, Arial Narrow, sans-serif', fontSize: 26, fontWeight: '700', fill: 0xffffff, stroke: 0x000000, strokeThickness: 5, align: 'center'});
    label.anchor?.set?.(0.5, 1); label.eventMode = 'none'; layer()?.addChild?.(label);
  }
  return true;
}
function clear() { try { gfx?.clear?.(); if (label) label.text = ''; } catch (_e) {} tracked = null; }
const ESCAPE = 0x4cc9f0, FOOT = 0xf5f1e6;
/** Who is moving outside the dice right now (a police escape move), or who is on foot on the current die: {token, left, text, colour}. */
export function footReach(scene, combat = chaseOf(scene)) {
  const escaper = scene?.tokens?.find?.(t => t.getFlag?.(NS, 'policeStop')?.status === 'escapeMove');
  if (escaper) {
    const s = escaper.getFlag(NS, 'policeStop'), body = s.mode === 'vehicle' ? scene.tokens.get(s.vehicleId) ?? escaper : escaper;
    const left = Math.max(0, Number(s.max || 0) - Number(s.moved || 0));
    return {token: body, left, colour: ESCAPE, text: `${escaper.name} · ESCAPE · ${Math.floor(left + 0.25)} sq left`};
  }
  const c = combat ? currentCombatant(combat).combatant : null, t = c?.token;
  if (!t || t.actor?.type !== 'character' || vehicleOf(t)) return null;
  const walk = t.getFlag?.(NS, 'walk'), left = Math.max(0, 6 - (walk?.key === actionKey(combat) ? Number(walk.moved || 0) : 0));
  return {token: t, left, colour: FOOT, text: `${t.name} · on foot · ${Math.floor(left + 0.25)} sq left`};
}
/** Draw the rings for the vehicle being driven now (or nothing). */
export function drawGauge() {
  try {
    const combat=chaseOf(canvas?.scene);
    // An escape move (or a character on foot on their die) shows how far they can get.
    const reach=footReach(canvas?.scene,combat);
    if(reach&&!(reach.colour===FOOT&&vehicleNow(combat))){
      if(!ensure())return;
      const g=canvas.grid.size,rt=reach.token,ct=rt.object?.center??{x:rt.x+rt.width*g/2,y:rt.y+rt.height*g/2};
      gfx.clear();
      if(reach.left>0){
        if(typeof gfx.setStrokeStyle==='function'){gfx.circle(0,0,reach.left*g);gfx.fill({color:reach.colour,alpha:0.1});gfx.circle(0,0,reach.left*g);gfx.stroke({width:6,color:reach.colour,alpha:0.95});}
        else{gfx.lineStyle({width:6,color:reach.colour,alpha:0.95});gfx.beginFill(reach.colour,0.1);gfx.drawCircle(0,0,reach.left*g);gfx.endFill();}
      }
      gfx.position.set(ct.x,ct.y);
      if(label){label.text=reach.text;labelDy=-Math.max(reach.left*g,rt.height*g/2)-10;label.position.set(ct.x,ct.y+labelDy);}
      tracked=rt.id;return;
    }
    const inChase=combat&&Boolean(vehicleNow(combat));
    const selected=canvas?.tokens?.controlled?.find(t=>t.actor?.type==='vehicle'||t.actor?.type==='character')?.document
      ?? [...(game.user?.targets??[])].find(t=>t.actor?.type==='vehicle'||t.actor?.type==='character')?.document;
    const vt=vehicleNow(combat)??(selected?.actor?.type==='vehicle'?selected:vehicleOf(selected));
    if(!vt?.actor||vt.actor.system.vehicle?.destroyed||vt.hidden)return clear();
    if (!ensure()) return;
    const g = canvas.grid.size, b = driveBands(vt.actor.system.vehicle), tally = tallyOf(vt, inChase?actionKey(combat):null), left = tally.stopped ? {green: 0, yellow: 0, red: 0} : bandsLeft(tally.moved, b);
    const v8 = typeof gfx.setStrokeStyle === 'function';
    gfx.clear();
    const ring = (r, colour, alpha) => {
      if (r <= 0) return;
      if (v8) { gfx.circle(0, 0, r * g); gfx.fill({color: colour, alpha}); gfx.circle(0, 0, r * g); gfx.stroke({width: 6, color: colour, alpha: 0.9}); }
      else { gfx.lineStyle({width: 6, color: colour, alpha: 0.9}); gfx.beginFill(colour, alpha); gfx.drawCircle(0, 0, r * g); gfx.endFill(); }
    };
    if(inChase){ring(left.red,COLOURS.red,0.07);ring(left.yellow,COLOURS.yellow,0.08);ring(left.green,COLOURS.green,0.10);}
    const t = vt.object, c = t?.center ?? {x: vt.x + vt.width * g / 2, y: vt.y + vt.height * g / 2};
    gfx.position.set(c.x, c.y);
    if (label) {
      const travel=vt.getFlag(NS,'travel')??{};
      label.text=inChase?(tally.stopped?`${vt.name}: LOST IT`:`${vt.name} · ${Math.floor(left.green)} / ${Math.floor(left.yellow)} / ${Math.floor(left.red)} sq left`)
        :`${vt.name} · ${Number(travel.recent||0).toFixed(1)} sq moved · ${Number(travel.total||0).toFixed(1)} sq total`;
      labelDy=inChase?-Math.max(left.red*g,vt.height*g/2)-10:-Math.max(40,vt.height*g/2+12);label.position.set(c.x,c.y+labelDy);
    }
    tracked = vt.id;
  } catch (error) { console.warn('The Smoke | drive gauge', error); }
}
function soon() { if (queued) return; queued = true; const run = () => { queued = false; drawGauge(); }; if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(run); else setTimeout(run, 16); }
export function installDriveGauge() {
  Hooks.on('canvasReady', () => { gfx = null; label = null; soon(); });
  for (const h of ['updateCombat', 'deleteCombat', 'createCombat', 'deleteCombatant','controlToken','targetToken']) Hooks.on(h, soon);
  Hooks.on('updateToken', (doc, changes) => { if (doc.parent?.id === canvas?.scene?.id && (doc.id === tracked || changes.flags?.[NS])) soon(); });
  // follow the vehicle frame by frame while it animates
  Hooks.on('refreshToken', token => {
    if (!tracked || token.document?.id !== tracked || !gfx || gfx.destroyed) return;
    const c = token.center; gfx.position.set(c.x, c.y);
    if (label && !label.destroyed) label.position.set(c.x, c.y + labelDy);
  });
}
