// The Blower (your phone): cash, Heat, shifts, callouts and Pat's orders, with live countdowns.
// Street Control (GM): Street Life, police response, job clocks.
import {NS, HEAT, JOB_TYPES} from '../config.mjs';
import {jobsAPI} from '../world/jobs.mjs';
import {request} from '../world/net.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function myActor() {
  const c = game.user.character; if (c) return c;
  const t = canvas?.tokens?.controlled?.[0]?.actor; if (t?.type === 'character' && t.isOwner) return t;
  return game.actors.find(a => a.type === 'character' && a.isOwner && !game.user.isGM) ?? null;
}

export class SmokePhone extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-phone', classes: ['smoke', 'smoke-phone'], tag: 'div', position: {width: 340, height: 600}, window: {title: 'The Blower', icon: 'fa-solid fa-mobile-screen', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/phone.hbs`, scrollable: ['.phone-screen']}};
  actorId = null;
  async _prepareContext() {
    const actors = game.actors.filter(a => a.type === 'character' && (a.isOwner || game.user.isGM));
    const actor = game.actors.get(this.actorId) ?? myActor() ?? actors[0] ?? null; this.actorId = actor?.id ?? null;
    const st = jobsAPI.state(); const now = Date.now();
    const shift = actor ? Object.values(st.shifts).find(s => s.actorId === actor.id) : null;
    const calls = Object.values(st.calls).filter(c => actor && (c.actorId === actor.id || (shift && c.shiftId === shift.id)));
    const heat = Math.max(0, Math.min(5, Number(actor?.system?.heat?.value || 0)));
    return {actor, actors, heat, heatInfo: HEAT[heat], stars: [1, 2, 3, 4, 5].map(n => n <= heat),
      shift: shift ? {...shift, label: JOB_TYPES[shift.type]?.label, icon: JOB_TYPES[shift.type]?.icon} : null,
      offers: calls.filter(c => c.status === 'offered').map(c => ({...c, left: fmt(c.expires - now)})),
      active: calls.filter(c => c.status === 'active').map(c => ({...c, left: c.deadline ? fmt(c.deadline - now) : '', urgent: c.deadline && c.deadline - now < 30000,
        pct: c.total ? Math.max(0, Math.min(100, Math.round(100 * (c.deadline - now) / c.total))) : 0, label: JOB_TYPES[c.type]?.label,
        extra: c.type === 'ambulance' ? `Patient: ${c.patient}` : c.type === 'fire' ? `Progress ${c.fire?.progress ?? 0}/4 · Fire ${c.fire?.consequences ?? 0}/3` : c.type === 'police' && c.stage === 'pursuit' ? `Gap ${c.gap}/5` : c.type === 'crew' ? `Delivered ${c.data?.delivered ?? 0}/${c.data?.order?.want ?? 0}` : ''})),
      paused: game.settings.get(NS, 'jobsPaused'), isGM: game.user.isGM};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).catch(e => ui.notifications.warn(e.message)); }));
    el.querySelector('[name=actor]')?.addEventListener('change', ev => { this.actorId = ev.currentTarget.value; this.render(); });
    on('[data-accept]', n => jobsAPI.acceptCall(n.dataset.accept));
    on('[data-decline]', n => jobsAPI.declineCall(n.dataset.decline));
    on('[data-end]', n => jobsAPI.endShift(n.dataset.end));
    on('[data-pat]', () => { const a = game.actors.get(this.actorId); if (!a) throw new Error('Pick a character.'); return jobsAPI.askPat(a); });
    on('[data-ping]', n => {
      const c = jobsAPI.state().calls[n.dataset.ping]; const p = c?.ping;
      if (p && canvas?.scene?.id === p.sceneId) return canvas.ping({x: p.x, y: p.y});
      ui.notifications.info(c?.instruction || 'No location to show.');
    });
    on('[data-sheet]', () => game.actors.get(this.actorId)?.sheet.render(true));
    if (!this._ticker) this._ticker = setInterval(() => { if (this.rendered) this.render(); }, 1000);
  }
  _onClose(options) { clearInterval(this._ticker); this._ticker = null; super._onClose?.(options); }
}
let phone = null;
export function openPhone() { phone ??= new SmokePhone(); phone.render({force: true}); return phone; }
Hooks.on('smokeJobsChanged', () => { if (phone?.rendered) phone.render(); });
Hooks.on('updateActor', a => { if (phone?.rendered && a.id === phone.actorId) phone.render(); });

export class StreetControl extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-street-control', classes: ['smoke', 'smoke-control'], tag: 'div', position: {width: 460, height: 'auto'}, window: {title: 'Street Control', icon: 'fa-solid fa-tower-broadcast', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/street-control.hbs`}};
  async _prepareContext() {
    const scene = canvas?.scene; const st = jobsAPI.state();
    return {scene, streetLife: game.settings.get(NS, 'streetLife'), police: game.settings.get(NS, 'policeResponse'), chase: game.settings.get(NS, 'policeChase'), paused: game.settings.get(NS, 'jobsPaused'),
      traffic: scene ? scene.tokens.filter(t => t.getFlag(NS, 'traffic')).length : 0, units: scene ? scene.tokens.filter(t => t.getFlag(NS, 'police')).length : 0,
      shifts: Object.values(st.shifts).map(s => ({...s, actor: game.actors.get(s.actorId)?.name, label: JOB_TYPES[s.type]?.label})),
      characters: game.actors.filter(a => a.type === 'character').map(a => ({id: a.id, name: a.name, heat: Number(a.system.heat?.value || 0), cash: a.system.cash}))};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).then(() => this.render()).catch(e => ui.notifications.warn(e.message)); }));
    on('[data-toggle]', n => game.settings.set(NS, n.dataset.toggle, !game.settings.get(NS, n.dataset.toggle)));
    on('[data-populate]', () => request('traffic.populate', {sceneId: canvas.scene.id}));
    on('[data-clear]', () => request('traffic.clear', {sceneId: canvas.scene.id}));
    on('[data-respond]', () => request('heat.respond', {sceneId: canvas.scene.id}));
    on('[data-standdown]', () => request('heat.standDown', {sceneId: canvas.scene.id}));
    on('[data-pause]', () => jobsAPI.pause(!game.settings.get(NS, 'jobsPaused')));
    on('[data-endshift]', n => jobsAPI.endShift(n.dataset.endshift));
    on('[data-heat]', n => { const a = game.actors.get(n.dataset.actor); return a?.changeHeat(Number(n.dataset.heat), 'Set from Street Control.'); });
    on('[data-install]', () => game.smoke.content.installStarter());
  }
}
