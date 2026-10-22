// The Blower (your phone): cash, Heat, live pirate radio, shifts and callouts with live countdowns and the roll each
// stage needs, directions, Pat's orders, a nicked ride's price, your missions, travel and the guide.
// Street Control (GM): set up the world, Street Life, police, Heat, advances, job vehicles, clocks and shifts.
import {NS, HEAT, JOB_TYPES, CRIMES, STATS, STAT_KEYS, crimeHeatText} from '../config.mjs';
import {jobsAPI, canWorkCall} from '../world/jobs.mjs';
import {request, esc} from '../world/net.mjs';
import {ridingNicked, sellVehicle} from '../world/theft.mjs';
import {missionData, missionState, needed} from '../world/missions.mjs';
import {mapIdOf, zonesOf, isStreetScene} from '../world/spawn.mjs';
import {findOrImportScene, loadAtlas, openTravelDialog} from '../map/map-transit.mjs';
import {zoneCentre, mapGraph} from '../rules/jobs-core.mjs';
import {radioMarkup, radioView, bindRadio, selectRadioActor} from '../radio/radio.mjs';
import {startCallNav, openSatnavPicker, satnavSummary, stopSatNav, toggleSatNav} from '../map/satnav.mjs';
import {BANANA_SVG, clockNow} from './banana-watch.mjs';

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const permittedCharacters = () => game.actors.filter(a => a.type === 'character' && (game.user.isGM || a.isOwner));
const currentToken = a => a?.token ?? canvas?.scene?.tokens.find(t => t.actorId === a?.id) ?? null;

function myActor() {
  const c = game.user.character; if (c) return c;
  const t = canvas?.tokens?.controlled?.[0]?.actor; if (t?.type === 'character' && t.isOwner) return t;
  return game.actors.find(a => a.type === 'character' && a.isOwner && !game.user.isGM) ?? null;
}

/** The roll a call's current stage needs, if any (the GM's buttons in chat do the same). */
export function callAction(call) {
  const ctx = step => ({callId: call.id, step});
  if (call.type === 'taxi' && call.stage === 'dropoff' && !call.chat) return {label: 'Chat with the fare', stat: 'frt', band: 'medium', context: ctx('chat')};
  if (call.type === 'ambulance' && ['treat', 'hospital'].includes(call.stage)) return {label: call.stage === 'treat' ? 'Treat & load the patient' : 'Treat the patient', stat: 'sav', band: 'medium', context: ctx(call.stage === 'treat' ? 'load' : 'treat')};
  if (call.type === 'fire' && call.stage === 'fight') return {label: 'Hose it down', stat: 'grt', band: 'hard', context: ctx('hose')};
  if (call.type === 'police') {
    if (call.stage === 'pursuit') return {label: 'Close the gap', stat: 'whl', tn: call.chaseTN ?? 14, context: ctx('chase')};
    if (call.stage === 'calm') return {label: 'Calm it down', stat: 'frt', band: 'medium', context: ctx('calm')};
    if (call.stage === 'stop' && call.stopAsked) return {label: 'Signal it to stop', stat: 'frt', band: 'medium', context: ctx('stop')};
    if (call.stage === 'arrest' && call.cuffAsked) return {label: 'Cuff the suspect', stat: 'mus', band: 'medium', context: ctx('cuff')};
  }
  return null;
}

export class SmokePhone extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-phone', classes: ['smoke', 'smoke-phone'], tag: 'div', position: {width: 360, height: 680}, window: {title: 'The Blower · Banana', icon: 'fa-solid fa-mobile-screen', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/phone.hbs`, scrollable: ['.phone-screen']}};
  actorId = null; _radioOpen = null;
  async _prepareContext() {
    const actors = permittedCharacters();
    const actor = game.actors.get(this.actorId) ?? myActor() ?? actors[0] ?? null; this.actorId = actor?.id ?? null;
    const st = jobsAPI.state(); const now = Date.now();
    const shift = actor ? Object.values(st.shifts).find(s => s.actorId === actor.id) : null;
    const calls = Object.values(st.calls).filter(c => actor && (c.actorId === actor.id || (shift && c.shiftId === shift.id) || (c.status === 'active' && canWorkCall(c, actor))));
    const heat = Math.max(0, Math.min(5, Number(actor?.system?.heat?.value || 0)));
    let riding = null; try { const r = ridingNicked(actor); if (r) riding = {uuid: r.vt.uuid, name: r.vt.name, why: r.why, here: Boolean(r.here), price: r.price, hot: r.hot, who: r.fence.who, where: r.fence.where,
      order: r.order ? (r.order.counts ? `Counts toward Pat's order: ${r.order.delivered + 1} of ${r.order.want}.` : 'Not what Pat ordered — she will still buy it.') : ''}; } catch (_e) {}
    let missions = []; try { const md = await missionData(), ms = missionState();
      missions = md.missions.filter(m => ms[m.id]?.status === 'active' && (!ms[m.id].actorIds?.length || ms[m.id].actorIds.includes(actor?.id))).map(m => ({id: m.id, n: m.code ?? `MISSION ${m.n}`, title: m.title, giver: m.giver, route: Boolean(m.stops?.length) || m.group === 'opening',
        objectives: m.objectives.map(o => { const have = Math.min(needed(o), Number(ms[m.id].ticks?.[o.id] || 0)); return {text: o.text, done: have >= needed(o), count: needed(o) > 1 ? `${have}/${needed(o)}` : ''}; })})); } catch (_e) {}
    // shifts this character could start from the driver's seat
    const token = currentToken(actor), seat = token?.getFlag?.(NS, 'vehicleSeat'), vt = seat && token.parent.tokens.get(seat.vehicleTokenId);
    const startable = vt && seat.seatId === 'pilot' && !shift ? (vt.actor?.system?.vehicle?.jobs || []).map(type => ({type, label: JOB_TYPES[type]?.verb ?? JOB_TYPES[type]?.label})).filter(j => j.label) : [];
    let radio = '', radioLabel = 'Choose a station'; try { if (actor) { radio = radioMarkup(actor); radioLabel = radioView(actor).station?.name ?? radioLabel; } } catch (_e) {}
    return {actor, actors, heat, riding, missions, heatInfo: HEAT[heat], stars: [1, 2, 3, 4, 5].map(n => n <= heat),
      location: token?.parent?.name ?? 'No token on this map', radio, radioLabel, radioOpen: this._radioOpen ?? !calls.length,
      shift: shift ? {...shift, label: JOB_TYPES[shift.type]?.label, icon: JOB_TYPES[shift.type]?.icon} : null, startable,
      offers: calls.filter(c => c.status === 'offered').map(c => ({...c, left: fmt(c.expires - now)})),
      active: calls.filter(c => c.status === 'active').map(c => ({...c, left: c.deadline ? fmt(c.deadline - now) : '', urgent: c.deadline && c.deadline - now < 30000, action: callAction(c),
        pct: c.total ? Math.max(0, Math.min(100, Math.round(100 * (c.deadline - now) / c.total))) : 0, label: JOB_TYPES[c.type]?.label,
        extra: c.type === 'ambulance' ? `Patient: ${c.patient}` : c.type === 'fire' ? `Progress ${c.fire?.progress ?? 0}/4 · Fire ${c.fire?.consequences ?? 0}/3` : c.type === 'police' && c.stage === 'pursuit' ? `Gap ${c.gap}/5` : c.type === 'crew' ? `Delivered ${c.data?.delivered ?? 0}/${c.data?.order?.want ?? 0}` : ''})),
      satnav: (() => { const s = satnavSummary(); return s && (!actor || s.actorId === actor.id) ? s : null; })(),
      paused: game.settings.get(NS, 'jobsPaused'), isGM: game.user.isGM,
      banana: BANANA_SVG, clock: (() => { try { const c = clockNow(); return `${String(c.hours).padStart(2, '0')}:${String(c.minutes).padStart(2, '0')}`; } catch (_e) { return ''; } })(), boot: !this._booted};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._booted = true;
    const el = this.element, actor = () => game.actors.get(this.actorId);
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).catch(e => ui.notifications.warn(e.message)); }));
    el.querySelector('[name=actor]')?.addEventListener('change', ev => { this.actorId = ev.currentTarget.value; try { selectRadioActor(actor()); } catch (_e) {} this.render(); });
    el.querySelector('.phone-radio')?.addEventListener('toggle', ev => { this._radioOpen = ev.currentTarget.open; });
    if (actor()) bindRadio(el, {actor: actor()});
    on('[data-accept]', n => jobsAPI.acceptCall(n.dataset.accept));
    on('[data-decline]', n => jobsAPI.declineCall(n.dataset.decline));
    on('[data-end]', n => jobsAPI.endShift(n.dataset.end));
    on('[data-pat]', () => { const a = actor(); if (!a) throw new Error('Pick a character.'); return jobsAPI.askPat(a); });
    on('[data-ping]', n => {
      const c = jobsAPI.state().calls[n.dataset.ping]; const p = c?.ping;
      if (p && canvas?.scene?.id === p.sceneId) return canvas.ping({x: p.x, y: p.y});
      ui.notifications.info(c?.instruction || 'No location to show.');
    });
    on('[data-route]', n => { const c = jobsAPI.state().calls[n.dataset.route]; if (c) return showJobRoute(actor(), c).then(() => this.render()); });
    on('[data-satnav]', () => openSatnavPicker(actor()).then(() => this.render()));
    on('[data-mission-route]', async n => { const m = (await missionData()).missions.find(x => x.id === n.dataset.missionRoute); if (m) { await game.smoke.satnav.mission(actor(), m); this.render(); } });
    on('[data-satnav-show]', () => toggleSatNav(actor()));
    on('[data-satnav-end]', () => { stopSatNav(); this.render(); });
    on('[data-call-roll]', n => { const c = jobsAPI.state().calls[n.dataset.callRoll], a = actor(), act = c && callAction(c); if (a && act) return a.rollDialog(act.stat, act); });
    on('[data-start]', n => { const t = currentToken(actor()), seat = t?.getFlag(NS, 'vehicleSeat'), vt = seat && t.parent.tokens.get(seat.vehicleTokenId);
      if (!vt) throw new Error('Take the driver seat in a job vehicle first.'); return jobsAPI.startShift(vt, n.dataset.start); });
    on('[data-travel]', () => { const t = currentToken(actor()); if (!t) throw new Error('Place your character on this map first.'); return openTravelDialog(t); });
    on('[data-guide]', () => game.smoke.openGuide('player-guide'));
    on('[data-sheet]', () => actor()?.sheet.render(true));
    on('[data-missions]', () => game.smoke.openMissions());
    on('[data-sell]', async n => { const vt = await fromUuid(n.dataset.sell); if (vt) return sellVehicle(vt); });
    // countdowns tick in place, so the radio controls are not redrawn every second
    if (!this._ticker) this._ticker = setInterval(() => this._countdown(), 1000);
    this._countdown();
  }
  _countdown() {
    if (!this.rendered) return;
    const paused = game.settings.get(NS, 'jobsPaused'), at = paused ? Number(game.settings.get(NS, 'pausedAt') || Date.now()) : Date.now();
    this.element?.querySelectorAll('[data-deadline]').forEach(el => {
      const left = Number(el.dataset.deadline) - at; el.textContent = `${paused ? 'Ⅱ ' : ''}${fmt(left)}`;
      el.closest('.phone-card')?.classList.toggle('urgent', left < 30000);
      const fill = el.parentElement?.querySelector('.fill'); const total = Number(el.dataset.total || 0);
      if (fill && total) fill.style.width = `${Math.max(0, Math.min(100, Math.round(100 * left / total)))}%`;
    });
  }
  _onClose(options) { clearInterval(this._ticker); this._ticker = null; super._onClose?.(options); }
}
let phone = null;
export function openPhone(actor = null) {
  if (actor) { try { selectRadioActor(actor); } catch (_e) {} }
  phone ??= new SmokePhone(); if (actor) phone.actorId = actor.id; phone.render({force: true}); return phone;
}
const rerender = () => { if (phone?.rendered) phone.render(); };
Hooks.on('smokeJobsChanged', rerender);
Hooks.on('smokeMissionsChanged', rerender);
// The radio pings on every token or setting change; only redraw when what the phone shows has changed.
let radioKey = '';
Hooks.on('smokeRadioChanged', () => {
  if (!phone?.rendered) return;
  let key = ''; try { const a = game.actors.get(phone.actorId), v = a ? radioView(a) : null; key = v ? [v.kind, v.status, v.station?.id, v.power, v.muted, v.enabled, v.canTune, v.available].join('|') : ''; } catch (_e) {}
  if (key === radioKey) return; radioKey = key; phone.render();
});
Hooks.on('updateActor', a => { if (phone?.rendered && a.id === phone.actorId) phone.render(); });

/** Directions to a call: the sat nav (bottom right) routes you there live, and the spot is pinged if it is on this map. */
export async function showJobRoute(actor, call) {
  const t = currentToken(actor); if (!t) throw new Error('Your character needs a token on this map.');
  const dest = call.dest ?? (['dropoff'].includes(call.stage) ? call.data?.dest : null);
  const targetScene = dest ? game.scenes.find(s => mapIdOf(s) === dest.mapId) : game.scenes.get(call.data?.sceneId);
  const zone = targetScene && zonesOf(targetScene).find(z => z.id === (dest?.zoneId ?? call.data?.zoneId));
  if (zone && targetScene.id === canvas.scene?.id) { const [x, y] = zoneCentre(zone); canvas.ping({x, y}); }
  else if (call.ping && call.ping.sceneId === canvas.scene?.id) canvas.ping({x: call.ping.x, y: call.ping.y});
  try { return await startCallNav(actor, call); }
  catch (error) { ui.notifications.warn(error.message); return listRoute(actor, call); }
}
/** The old directions: the chain of maps to cross (used when the sat nav cannot place the job). */
async function listRoute(actor, call) {
  const t = currentToken(actor), dest = call.dest ?? (['dropoff'].includes(call.stage) ? call.data?.dest : null);
  const from = mapIdOf(t.parent), {atlas} = await loadAtlas();
  const goal = dest?.mapId ?? (call.data?.sceneId ? mapIdOf(game.scenes.get(call.data.sceneId)) : null);
  let route = [];
  if (from && goal) { const graph = mapGraph(atlas), queue = [[from]], seen = new Set([from]);
    while (queue.length) { const path = queue.shift(); if (path.at(-1) === goal) { route = path; break; } for (const next of graph.get(path.at(-1)) || []) if (!seen.has(next)) { seen.add(next); queue.push([...path, next]); } } }
  const names = route.map(id => atlas.maps.find(m => m.id === id)?.name ?? id);
  return DialogV2.wait({window: {title: 'The Blower · Directions'}, content: `<div class="the-smoke"><p>${esc(call.instruction || call.text || 'Follow the tip-offs.')}</p>${names.length ? `<ol>${names.map(n => `<li>${esc(n)}</li>`).join('')}</ol>` : '<p>Check the job instructions for the named location.</p>'}<p>Move to a road exit, then right-click → Go to the next map. Foot traffic can walk through doors automatically.</p></div>`, buttons: [{action: 'close', label: 'Got it'}]});
}

/** GM: put an unlocked, issued job vehicle beside the selected character (or on a road). */
export async function spawnJobVehicle(type) {
  const scene = canvas?.scene; if (!scene || !scene.getFlag(NS, 'streetAtlas')) throw new Error('Open a London street map.');
  const {ensureVehicleActor, placeToken, lanePoint} = await import('../world/spawn.mjs');
  const id = {taxi: 'LV12', police: 'LV23', ambulance: 'LV26', fire: 'LV27', courier: 'LV06', bus: 'LV28'}[type];   // 0.5.23: courier was the Zap E-Scooter, which can't do courier work
  const actor = await ensureVehicleActor(id), road = zonesOf(scene).find(z => z.kind === 'road');
  const selected = canvas.tokens.controlled.find(t => t.actor?.type === 'character')?.document;
  const p = selected ? {x: selected.x + scene.grid.size * 3, y: selected.y, rotation: 0} : lanePoint(road, Math.random, null, scene);
  const t = await placeToken(scene, actor, p.x, p.y, {rotation: p.rotation, flags: {issued: true, locked: false, serviceVehicle: true}});
  ui.notifications.info(`${t.name}: unlocked and issued for ${JOB_TYPES[type].label} work.`); return t;
}

/** The quick build: pick one d8, three d6 and five d4 (the full Character Creator is game.smoke.openCreator). */
export async function quickBuild(actor = null) {
  const rows = STAT_KEYS.map((key, i) => `<label>${STATS[key].label}<select name="${key}">${[4, 6, 8].map(d => `<option value="${d}" ${Number(actor?.system.stats[key]?.die ?? (i === 0 ? 8 : i < 4 ? 6 : 4)) === d ? 'selected' : ''}>d${d}</option>`).join('')}</select></label>`).join('');
  const form = await DialogV2.input({window: {title: actor ? `Build ${actor.name}` : 'New face in the Smoke'}, content: `<div class="the-smoke smoke-creator"><p>Choose <b>one d8, three d6 and five d4</b>. Everyone begins with Health 10, Hustle 3 and £40. For backgrounds, kit and a story, use the full <b>Character Creator</b>.</p><label>Name<input name="name" value="${esc(actor?.name || 'New face')}" required></label><div class="smoke-field-grid three">${rows}</div><label>Day hustle<input name="hustle" value="${esc(actor?.system.identity.hustle || '')}" placeholder="Courier, mechanic, student…"></label><label>Ambition<input name="ambition" value="${esc(actor?.system.identity.ambition || '')}" placeholder="What would getting out look like?"></label></div>`, ok: {label: actor ? 'Apply build' : 'Create character'}});
  if (!form) return;
  const {validateStartingSpread} = await import('../rules/core.mjs'); const stats = Object.fromEntries(STAT_KEYS.map(key => [key, {die: Number(form[key])}])); const check = validateStartingSpread(stats); if (!check.valid) throw new Error(check.message);
  const system = {stats, identity: {hustle: String(form.hustle || ''), ambition: String(form.ambition || '')}, creation: {done: true, background: '', levelledTo: 1}};
  if (actor) return actor.update({name: String(form.name || actor.name), ...Object.fromEntries(STAT_KEYS.map(k => [`system.stats.${k}.die`, stats[k].die])), 'system.identity.hustle': system.identity.hustle, 'system.identity.ambition': system.identity.ambition, 'system.creation.done': true});
  const a = await Actor.implementation.create({name: String(form.name || 'New face'), type: 'character', system, prototypeToken: {actorLink: true, disposition: 1}, ownership: {default: 0, [game.user.id]: 3}}); a.sheet.render(true); return a;
}

export class StreetControl extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-street-control', classes: ['smoke', 'smoke-control'], tag: 'div', position: {width: 560, height: 760}, window: {title: 'Street Control', icon: 'fa-solid fa-city', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/street-control.hbs`, scrollable: ['.smoke-control-inner']}};
  async _prepareContext() {
    // each part on its own, so one odd actor or setting can't stop the window opening
    const part = (label, fn, fallback) => { try { return fn(); } catch (error) { console.warn(`The Smoke | Street Control: ${label}`, error); return fallback; } };
    const scene = canvas?.scene ?? null, st = part('jobs', () => jobsAPI.state(), {shifts: {}, calls: {}});
    const settings = [['streetLife', 'Street Life', 'fa-car-side'], ['policeResponse', 'Police respond automatically', 'fa-shield-halved'], ['policeChase', 'Police drive themselves', 'fa-car-burst'], ['heatCooling', 'Heat cools out of sight', 'fa-snowflake'], ['jobsPaused', 'Pause job clocks', 'fa-pause']]
      .map(([key, label, icon]) => ({key, label, icon, on: part(key, () => Boolean(game.settings.get(NS, key)), false)}));
    const tokens = scene ? part('tokens', () => [...scene.tokens], []) : [];
    return {scene, isGM: game.user.isGM, settings, setUp: part('setup', () => Boolean(game.settings.get(NS, 'worldSetup')), false), street: part('street', () => isStreetScene(scene), false),
      selfPlay: part('playMode', () => game.settings.get(NS, 'playMode') === 'self', false), chaseOn: part('chase', () => Boolean(game.settings.get(NS, 'autoChase')), true),
      traffic: tokens.filter(t => t.getFlag?.(NS, 'traffic')).length, moving: tokens.filter(t => t.getFlag?.(NS, 'traffic')?.kind === 'moving').length, units: tokens.filter(t => t.getFlag?.(NS, 'police')).length,
      shifts: part('shifts', () => Object.values(st.shifts || {}).map(s => ({...s, actor: game.actors.get(s.actorId)?.name, label: JOB_TYPES[s.type]?.label})), []),
      crimes: Object.entries(CRIMES).map(([key, c]) => ({key, ...c, heatText: crimeHeatText(c)})),
      jobs: ['taxi', 'police', 'ambulance', 'fire', 'courier', 'bus'].map(k => ({key: k, label: JOB_TYPES[k]?.label ?? k})),
      characters: part('characters', () => game.actors.filter(a => a.type === 'character').map(a => ({id: a.id, name: a.name, heat: Number(a.system?.heat?.value || 0), cash: a.system?.cash ?? 0, advances: Number(a.system?.advancement?.available || 0), xp: Number(a.system?.rep?.xp || 0), stage: a.system?.stage ?? 1,
        heatOptions: [0, 1, 2, 3, 4, 5].map(n => ({n, name: HEAT[n]?.name ?? n, selected: n === Number(a.system?.heat?.value || 0)}))})), [])};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).then(() => this.render()).catch(e => ui.notifications.warn(e.message)); }));
    const scene = () => { if (!canvas?.scene) throw new Error('View a London street scene first.'); return canvas.scene; };
    const street = () => { const s = scene(); if (!isStreetScene(s)) throw new Error(`${s.name} isn't a street map: Street Life runs on the twenty London street maps.`); return s; };
    on('[data-toggle]', n => n.dataset.toggle === 'jobsPaused' ? jobsAPI.pause(!game.settings.get(NS, 'jobsPaused')) : game.settings.set(NS, n.dataset.toggle, !game.settings.get(NS, n.dataset.toggle)));
    on('[data-populate]', async () => { const s = street(), made = Number(await request('traffic.populate', {sceneId: s.id})) || 0;
      ui.notifications.info(made ? `Street Life: ${made} more on ${s.name}.` : `Street Life: ${s.name} is already full. Clear it to start afresh, or raise the numbers in Settings.`); });
    on('[data-clear]', async () => { const s = scene(), gone = Number(await request('traffic.clear', {sceneId: s.id})) || 0; ui.notifications.info(`Street Life: cleared ${gone} from ${s.name}.`); });
    on('[data-respond]', () => request('heat.respond', {sceneId: scene().id}));
    on('[data-standdown]', () => request('heat.standDown', {sceneId: scene().id}));
    on('[data-endshift]', n => jobsAPI.endShift(n.dataset.endshift));
    on('[data-heat]', n => { const a = game.actors.get(n.dataset.actor); return a?.changeHeat(Number(n.dataset.heat), 'Set from Street Control.'); });
    on('[data-set-heat]', n => { const a = game.actors.get(n.dataset.setHeat), v = Number(n.closest('tr')?.querySelector('select')?.value ?? 0); return game.smoke.heat.setHeat(a, v, 'GM Street Control'); });
    on('[data-award]', async n => { const a = game.actors.get(n.dataset.award); await a.update({'system.advancement.available': Number(a.system.advancement?.available || 0) + 1}); ui.notifications.info(`${a.name}: +1 advance.`); });
    on('[data-spawn-job]', n => spawnJobVehicle(n.dataset.spawnJob));
    on('[data-setup]', () => game.smoke.setup());
    on('[data-import-maps]', () => game.smoke.content.importAllMaps());
    on('[data-diagnostics]', () => game.smoke.diagnostics());
    on('[data-guide]', n => game.smoke.openGuide(n.dataset.guide || 'gm-guide'));
    on('[data-overview]', async () => (await findOrImportScene('LDN-OVERVIEW'))?.view());
    on('[data-gm-screen]', () => game.smoke.openGMScreen());
    on('[data-missions]', () => game.smoke.openMissions());
    on('[data-play-mode]', n => game.smoke.missions.setMode(n.dataset.playMode));
    on('[data-start-chase]', () => game.smoke.chase.start(canvas.scene));
    on('[data-set-clock]', () => game.smoke.clock.set());
  }
}
