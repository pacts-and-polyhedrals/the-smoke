// Sheets: character / NPC, vehicle, item. ApplicationV2 + Handlebars (Foundry v14).
import {NS, STATS, STAT_KEYS, DIE_LADDER, HEAT, JOB_TYPES, VEHICLE_LOCK_BANDS} from '../config.mjs';
import {statModifier, validateStartingSpread} from '../rules/core.mjs';
import {difficultyLadder} from '../rules/difficulty.mjs';
import {ABILITIES, abilitiesOf, hasLights} from '../vehicles/vehicle-abilities.mjs';
import {driveBands, vehicleSpeedDice, crewDie} from '../rules/driving.mjs';
import {vehicleGuard} from '../combat/rules.mjs';
import {seatLayout} from '../vehicles/vehicle-seat-math.mjs';
import {openVehicleBoardDialog, openVehicleControl} from '../vehicles/vehicle-boarding.mjs';
import {CONDITION_LIBRARY} from '../rules/conditions.mjs';
import {repInfo, statCap} from '../rules/advancement.mjs';
import {reload, ammoFor} from '../world/items.mjs';
import {watchMinutesRemaining} from '../rules/watch-clock.mjs';
import {gameClockAt} from './banana-watch.mjs';

const {ActorSheetV2, ItemSheetV2} = foundry.applications.sheets;
const {HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const value = el => el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
const enrich = (html, doc) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html || '', {secrets: doc.isOwner, relativeTo: doc});
const tokenOf = a => a.token ?? canvas?.scene?.tokens?.find(t => t.actorId === a.id) ?? null;

/** Fields only the GM changes when "Lock players' progress fields" is on: money, progression, stats and maximums. */
export const GM_LOCKED_FIELDS = Object.freeze(['system.cash', 'system.stash', 'system.rep.xp', 'system.rep.crew', 'system.rep.street', 'system.rep.police', 'system.stage',
  'system.advancement.available', 'system.resources.health.max', 'system.resources.hustle.max', 'system.role']);
export const lockedForUser = (name, user = game.user) => {
  if (user?.isGM) return false;
  let on = false; try { on = Boolean(game.settings.get(NS, 'lockPlayerSheets')); } catch (_e) {}
  return on && (GM_LOCKED_FIELDS.includes(name) || /^system\.stats\.[a-z]{3}\.die$/.test(name));
};
function wireInputs(app, doc) {
  const el = app.element; if (!el) return;
  // Only owners edit; everyone else sees a read-only sheet.
  if (!doc.isOwner) el.querySelectorAll('input, select, textarea, prose-mirror').forEach(i => { i.disabled = true; });
  else el.querySelectorAll('[name]').forEach(i => { if (lockedForUser(i.name)) { i.disabled = true; i.title = 'The GM changes this (Settings: lock players\' progress fields).'; } });
  el.querySelectorAll('[name]').forEach(input => input.addEventListener('change', async ev => {
    const t = ev.currentTarget; if (!t.name || t.name.startsWith('job.')) return;
    try { if (!doc.isOwner) throw new Error('You need ownership to change this sheet.'); if (lockedForUser(t.name)) throw new Error('Only the GM changes that.'); await doc.update({[t.name]: value(t)}); }
    catch (e) { ui.notifications.warn(e.message); }
  }));
  el.querySelector('[data-edit="img"]')?.addEventListener('click', () => {
    if (!doc.isOwner) return;
    new foundry.applications.apps.FilePicker.implementation({type: 'image', current: doc.img, callback: img => doc.update({img})}).browse();
  });
  el.querySelectorAll('[data-tab-target]').forEach(tab => tab.addEventListener('click', ev => { ev.preventDefault(); app._tab = tab.dataset.tabTarget; showTab(app); }));
  showTab(app);
}
function showTab(app) {
  const el = app.element; if (!el) return; const tab = app._tab || el.querySelector('[data-tab-target]')?.dataset.tabTarget;
  el.querySelectorAll('[data-tab-target]').forEach(t => t.classList.toggle('active', t.dataset.tabTarget === tab));
  el.querySelectorAll('[data-tab]').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
}
/** Drop kit from a compendium or another actor: a copy, never a move. */
async function dropItem(sheet, event, data) {
  if (!sheet.actor.isOwner) throw new Error('You need ownership to change this sheet.');
  const item = data?.toObject ? data : await Item.implementation.fromDropData(data); if (!item) return null;
  if (item.parent?.uuid === sheet.actor.uuid) return null;
  const source = item.toObject(); delete source._id; return sheet.actor.createEmbeddedDocuments('Item', [source]);
}

export class SmokeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-sheet', 'actor'], position: {width: 780, height: 800}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
  static PARTS = {main: {template: `systems/${NS}/templates/actor-sheet.hbs`, scrollable: ['.smoke-body']}};
  _tab = 'street';
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options); const a = this.actor, s = a.system;
    const heat = Math.max(0, Math.min(5, Number(s.heat?.value || 0)));
    const conditions = a.items.filter(i => i.type === 'condition');
    return {...ctx, actor: a, system: s, isGM: game.user.isGM, owner: a.isOwner, isNPC: a.type === 'npc', isPC: a.type === 'character',
      stats: STAT_KEYS.map(k => ({key: k, abbr: STATS[k].abbr, label: STATS[k].label, hint: STATS[k].hint, die: s.stats[k]?.die ?? 4, mod: (() => { try { return statModifier(s.stats[k]?.die ?? 4); } catch (_e) { return 2; } })(),
        ladder: difficultyLadder({attributeDie: s.stats[k]?.die ?? 4}).map(b => `${b.label} ${b.tn}`).join(' · ')})),
      dice: DIE_LADDER, heat, heatInfo: HEAT[heat], stars: [1, 2, 3, 4, 5].map(n => ({n, on: n <= heat})),
      weapons: a.items.filter(i => i.type === 'weapon').map(w => ({id: w.id, name: w.name, img: w.img, system: w.system, statAbbr: STATS[w.system.stat]?.abbr ?? '', spare: w.system.ammoType ? ammoFor(a, w) : 0})),
      armour: a.items.filter(i => i.type === 'armour'), gear: a.items.filter(i => i.type === 'gear'),
      ammo: a.items.filter(i => i.type === 'ammo'), outfits: a.items.filter(i => i.type === 'outfit'), drugs: a.items.filter(i => i.type === 'drug'), consumables: a.items.filter(i => i.type === 'consumable'),
      rep: repInfo(s), advances: Number(s.advancement?.available || 0), cap: statCap(s.stage),
      spread: a.type === 'character' ? validateStartingSpread(s.stats) : null,
      perks: a.items.filter(i => i.type === 'perk'), conditions,
      conditionLibrary: CONDITION_LIBRARY.map(c => {
        const have = conditions.find(i => i.name === c.name), until = have?.getFlag?.(NS, 'expiresWorldTime');
        const left = watchMinutesRemaining(until);
        return {...c, active: Boolean(have), stacks: Number(have?.system?.stacks || 0) > 1 ? have.system.stacks : 0,
          timeLeft: left === null ? '' : `${left} watch min`,
          expiresWorldTime: left === null ? null : Number(until),
          gameEnds: left === null ? '' : gameClockAt(until)};
      }),
      biographyHTML: await enrich(s.biography, a), notesHTML: await enrich(s.notes, a),
      folded: a.getFlag(NS, 'foldedVehicles') || []};
  }
  async _onRender(context, options) {
    await super._onRender(context, options); wireInputs(this, this.actor);
    const el = this.element, a = this.actor;
    const act = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n, ev)).catch(e => ui.notifications.warn(e.message)); }));
    const mine = () => { if (!a.isOwner) throw new Error('You need ownership to change this sheet.'); };
    act('[data-roll]', n => { mine(); return a.rollDialog(n.dataset.roll); });
    act('[data-quick]', n => { mine(); return a.rollStat(n.dataset.quick, {band: 'medium'}); });
    act('[data-item-use]', n => { mine(); return a.items.get(n.dataset.itemUse)?.use(); });
    act('[data-item-edit]', n => a.items.get(n.dataset.itemEdit)?.sheet.render(true));
    act('[data-item-delete]', async n => { mine(); const item = a.items.get(n.dataset.itemDelete); if (item?.getFlag(NS,'missionCargo')) return item.use(); if (item && await DialogV2.confirm({window: {title: `Remove ${item.name}?`}, content: '<p>Remove this item from the character?</p>'})) return item.delete(); });
    act('[data-item-toggle]', n => { mine(); const i = a.items.get(n.dataset.itemToggle); return i?.update({'system.equipped': !i.system.equipped}); });
    act('[data-condition]', n => { mine(); return n.classList.contains('on') ? a.removeCondition(n.dataset.condition) : a.addCondition(n.dataset.condition); });
    act('[data-heat]', n => game.user.isGM ? a.setHeat(Number(n.dataset.heat) === Number(a.system.heat?.value) ? Number(n.dataset.heat) - 1 : Number(n.dataset.heat), 'Set by the GM.') : ui.notifications.info('Only the GM sets Heat by hand.'));
    act('[data-create]', n => { mine(); return a.createEmbeddedDocuments('Item', [{name: `New ${n.dataset.create}`, type: n.dataset.create}]).then(([i]) => i?.sheet.render(true)); });
    act('[data-heal]', () => { mine(); return a.heal(1); });
    act('[data-hurt]', () => { mine(); return a.applyDamage(1); });
    act('[data-phone]', () => game.smoke.openPhone(a.type === 'character' ? a : null));
    act('[data-radio]', () => game.smoke.radio.open(a.type === 'character' ? a : null));
    act('[data-guide]', () => game.smoke.openGuide('player-guide'));
    act('[data-reload]', n => { mine(); return reload(a, a.items.get(n.dataset.reload)); });
    act('[data-shop]', () => game.smoke.openShop?.(a));
    act('[data-services]', () => game.smoke.services(a));
    act('[data-first-aid]', () => game.smoke.firstAid(a));
    act('[data-rest]', () => game.smoke.rest(a));
    act('[data-unarmed]', () => { mine(); const fists = a.items.find(i => i.type === 'weapon' && ['fists', 'unarmed'].includes(i.name.toLowerCase()));
      return fists ? fists.use() : a.rollAttack(null, [...game.user.targets][0]?.document); });
    act('[data-advance]', () => game.smoke.advance(a));
    act('[data-level-up]', () => game.smoke.openLevelUp?.(a));
    act('[data-creator]', () => game.smoke.openCreator?.(a));
    act('[data-quick-build]', () => game.smoke.quickBuild(a));
  }
  async _onDropItem(event, data) { return dropItem(this, event, data); }
}

/* ------------------------------------------------------------------ vehicles: the same shape as a character sheet */
/** What a vehicle sheet can roll. Each is the driver's Wheels with the motor's Performance die (or the NPC crew die). */
const VEHICLE_MOVES = Object.freeze([
  {key: 'drive', abbr: 'DRV', label: 'Drive', band: 'medium', hint: 'Wheels + Performance: getting somewhere it\'s hard to get, fast.'},
  {key: 'evasive', abbr: 'EVA', label: 'Evasive', band: 'medium', hint: 'Weave through it. In a chase, on your go: +2 Guard against rams, PITs and shots till the round ends.'},
  {key: 'push', abbr: 'YEL', label: 'Push it', band: 'medium', hint: 'The yellow line: Medium, Handling −1.'},
  {key: 'redline', abbr: 'RED', label: 'Redline', band: 'hard', hint: 'The red line: Hard, Handling −2.'},
  {key: 'ram', abbr: 'RAM', label: 'Ram', band: null, hint: 'Target something (T) within 4 squares: Wheels against its Guard.'},
  {key: 'pit', abbr: 'PIT', label: 'PIT', band: null, hint: 'Clip a vehicle alongside: they hold it (Hard) or spin and lose a die.'},
  {key: 'patch', abbr: 'FIX', label: 'Patch up', band: 'hard', stat: 'grf', hint: 'Graft (Hard), in or beside it: +2 Body (+4 on a strong roll). Once, until a garage sees it.'},
  {key: 'hotwire', abbr: 'HOT', label: 'Hotwire', band: null, stat: 'grf', hint: 'Locked? Graft against the lock (your tools help).'}
]);
const STATUS = {
  burnt: ['BURNT OUT', 'A blackened shell. Nothing left to drive.'], fire: ['ON FIRE', 'Get everyone out before it goes up.'],
  wrecked: ['WRECKED', 'Body 0.'], smoking: ['SMOKING', 'Below half Body: slower, rattling.'], damaged: ['DAMAGED', 'Dents and scrapes.'], ok: ['ROADWORTHY', 'Ready to go.']
};
const ago = ms => { const s = Math.max(0, Math.round((Date.now() - Number(ms || 0)) / 1000)); return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
const INCIDENT_ICON = {collision: 'fa-car-burst', scrape: 'fa-car-side', hit: 'fa-car-burst', skid: 'fa-road', spin: 'fa-rotate', crash: 'fa-car-burst', fire: 'fa-fire', explosion: 'fa-explosion', blast: 'fa-explosion', rammed: 'fa-car-burst', ram: 'fa-car-burst', pit: 'fa-rotate-right', shot: 'fa-gun', patch: 'fa-screwdriver-wrench'};

export class SmokeVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-sheet', 'vehicle'], position: {width: 780, height: 800}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
  static PARTS = {main: {template: `systems/${NS}/templates/vehicle-sheet.hbs`, scrollable: ['.smoke-body']}};
  _tab = 'drive';
  /** The token this sheet drives: its own (unlinked), or the first on the current map. */
  get vehicleToken() { return tokenOf(this.actor); }
  /** Who is at the wheel, and whether this user plays them. */
  driver() {
    const vt = this.vehicleToken, occ = vt?.getFlag?.(NS, 'vehicleOccupants') ?? [], o = Array.isArray(occ) ? occ.find(x => x.seatId === 'pilot') : null;
    const t = o ? vt.parent.tokens.get(o.tokenId) : null;
    return t?.actor ? {token: t, actor: t.actor, name: t.name, mine: t.actor.isOwner, pc: t.actor.type === 'character'} : null;
  }
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options); const a = this.actor, v = a.system.vehicle, vt = this.vehicleToken;
    const occupants = vt?.getFlag?.(NS, 'vehicleOccupants') ?? [], drv = this.driver();
    const fire = Boolean(vt?.getFlag?.(NS, 'fire')), burnt = Boolean(v.destroyed || vt?.getFlag?.(NS, 'burnt'));
    const statusKey = burnt ? 'burnt' : fire ? 'fire' : Number(v.body.value) <= 0 ? 'wrecked' : Number(v.body.value) < Number(v.body.max) / 2 ? 'smoking' : Number(v.body.value) < Number(v.body.max) ? 'damaged' : 'ok';
    const bands = driveBands(v), police = Boolean(vt?.getFlag?.(NS, 'police')), crew = crewDie(v, {police});
    const flats = Math.max(0, Number(v.flats || 0)), ladder = DIE_LADDER, perf = ladder[Math.max(0, ladder.indexOf(Number(v.perfDie || 6)) - flats)] ?? 4;
    const incidents = [...(a.getFlag(NS, 'incidents') || [])].reverse().map(i => ({...i, when: ago(i.at), icon: INCIDENT_ICON[i.kind] ?? 'fa-triangle-exclamation'}));
    const locked = Boolean(vt?.getFlag?.(NS, 'locked'));
    const mineInside = vt ? (occupants || []).map(o => vt.parent.tokens.get(o.tokenId)).filter(t => t?.actor?.isOwner && t.actor.type !== 'vehicle') : [];
    return {...ctx, actor: a, v, isGM: game.user.isGM, owner: a.isOwner, dice: DIE_LADDER, crewDice: [{v: 0, l: `auto (d${police ? 8 : 6})`}, ...DIE_LADDER.map(d => ({v: d, l: `d${d}`}))], locks: VEHICLE_LOCK_BANDS,
      status: STATUS[statusKey][0], statusHint: STATUS[statusKey][1], statusKey, fire, burnt, tokenOnMap: Boolean(vt), plate: vt?.getFlag?.(NS, 'plate') ?? (v.plateless ? 'none' : '—'),
      bands, chaseDice: vehicleSpeedDice(v), crew, perf, guard: vehicleGuard(v.size) + (vt?.getFlag?.(NS, 'dodging') ? 2 : 0), evasive: Boolean(vt?.getFlag?.(NS, 'dodging')),
      gaugePct: {g: Math.round(100 * bands.green / Math.max(1, bands.red)), y: Math.round(100 * (bands.yellow - bands.green) / Math.max(1, bands.red)), r: Math.round(100 * (bands.red - bands.yellow) / Math.max(1, bands.red))},
      driver: drv ? {name: drv.name, mine: drv.mine, pc: drv.pc, whl: drv.actor.system?.stats?.whl?.die ?? 4} : null,
      moves: VEHICLE_MOVES.filter(m => m.key !== 'hotwire' || locked).map(m => ({...m, disabled: burnt || (!vt && m.key !== 'patch')})),
      incidents, incidentCount: incidents.length, lights: hasLights(a), stuckChecks: Object.keys(vt?.getFlag?.(NS, 'prompts') ?? {}).length, stuckPlural: Object.keys(vt?.getFlag?.(NS, 'prompts') ?? {}).length > 1, mineInside: mineInside.map(t => ({uuid: t.uuid, name: t.name})),
      riders: Object.keys(Object.fromEntries((occupants || []).map(o => [o.seatId, 1]))).length,
      abilities: abilitiesOf(a).map(x => ({...x, ...(ABILITIES[x.key] || {label: x.key, text: ''}), seats: Array.isArray(x.seats) ? x.seats.join(', ') : ''})),
      seats: seatLayout(a).map(seat => ({...seat, occupant: (occupants || []).find(o => o.seatId === seat.id)?.name ?? ''})),
      jobs: (v.jobs || []).map(j => JOB_TYPES[j]).filter(Boolean),
      jobChoices: Object.entries(JOB_TYPES).filter(([key]) => key !== 'crew').map(([key, j]) => ({key, label: j.label, on: (v.jobs || []).includes(key)})),
      bodyPct: Math.round(100 * Number(v.body.value) / Math.max(1, Number(v.body.max))), fuelPct: Math.round(100 * Number(v.fuel.value) / Math.max(1, Number(v.fuel.max))),
      biographyHTML: await enrich(a.system.biography, a), systemsHTML: await enrich(v.systems, a)};
  }
  /** Roll one of the vehicle's moves. */
  async move(key) {
    const vt = this.vehicleToken, def = VEHICLE_MOVES.find(m => m.key === key); if (!def) return null;
    if (!vt && key !== 'patch') throw new Error('Put this vehicle on the map first.');
    const drv = this.driver();
    if (key === 'hotwire') return game.smoke.vehicles.nick(vt);
    if (key === 'patch') return patchUp(this.actor, vt);
    if (key === 'ram' || key === 'pit') {
      if (!drv?.mine) throw new Error('Take the driver\'s seat first.');
      return key === 'ram' ? game.smoke.combat.ram(drv.token) : game.smoke.chase.pit(drv.token);
    }
    if (key === 'evasive') { const combat = game.smoke.chase.chaseOf(vt.parent); if (combat && drv?.mine) return game.smoke.chase.evasive(drv.token); }
    const label = `${vt.name}: ${def.label}`;
    if (drv?.mine && drv.actor.isPerson) return drv.actor.rollStat('whl', {band: def.band, label, context: {kind: 'vehicleMove', move: key, vt: vt.uuid}});
    if (game.user.isGM && (!drv || !drv.pc)) return game.smoke.incidents.npcDriveRoll(vt, {band: def.band, label, penalty: key === 'push' ? -1 : key === 'redline' ? -2 : 0});
    throw new Error(drv ? `${drv.name} is driving: their player rolls.` : 'Nobody is driving. Take the driver\'s seat first.');
  }
  async _onRender(context, options) {
    await super._onRender(context, options); wireInputs(this, this.actor);
    const el = this.element, a = this.actor;
    const act = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n, ev)).catch(e => ui.notifications.warn(e.message)); }));
    const placed = () => { const t = this.vehicleToken; if (!t) throw new Error('Place this vehicle on the map first.'); return t; };
    const gm = () => { if (!game.user.isGM) throw new Error('GM only.'); };
    act('[data-vmove]', n => this.move(n.dataset.vmove));
    act('[data-board]', () => openVehicleBoardDialog(placed()));
    act('[data-vehicle-control]', () => openVehicleControl(placed()));
    act('[data-radio]', () => game.smoke.radio.vehicle(placed()));
    act('[data-lights]', () => game.smoke.vehicles.lights(placed()));
    act('[data-everyone-out]', () => game.smoke.vehicles.exitAll(placed()));
    act('[data-get-out]', async n => { const t = await fromUuid(n.dataset.getOut); if (t) return game.smoke.vehicles.exit(t); });
    act('[data-vhurt]', () => { gm(); return a.applyDamage(1); });
    act('[data-vfix]', () => { gm(); return a.update({'system.vehicle.body.value': Math.min(Number(a.system.vehicle.body.max), Number(a.system.vehicle.body.value) + 1)}); });
    act('[data-put-out]', () => { gm(); return game.smoke.request('drive.putOut', {tokenUuid: placed().uuid}); });
    act('[data-ignite]', () => { gm(); return game.smoke.incidents.ignite(placed()); });
    act('[data-explode]', () => { gm(); return game.smoke.incidents.explode(placed()); });
    act('[data-clear-checks]', async () => { gm(); if (await DialogV2.confirm({window: {title: 'Clear stuck driving checks?'}, content: '<p>Clears every driving check still waiting on this vehicle. A check that was already rolled is treated as reviewed (check its effects in chat first); an unrolled one is cancelled. Nothing is rerolled and no damage is applied.</p>'})) return game.smoke.incidents.clearPrompts(placed()); });
    act('[data-clear-incidents]', async () => { gm(); if (await DialogV2.confirm({window: {title: 'Clear the incident log?'}, content: '<p>Wipe this vehicle\'s incident log?</p>'})) return a.unsetFlag(NS, 'incidents'); });
    el.querySelectorAll('[data-vehicle-job]').forEach(b => b.addEventListener('change', async () => {
      try { if (!a.isOwner) throw new Error('You need ownership to change this sheet.'); await a.update({'system.vehicle.jobs': [...el.querySelectorAll('[data-vehicle-job]:checked')].map(x => x.dataset.vehicleJob)}); }
      catch (e) { ui.notifications.warn(e.message); }
    }));
  }
}
/** Patch a vehicle up at the roadside: Graft (Hard) by someone in it or right beside it, once until it's garaged. */
async function patchUp(vehicleActor, vt) {
  if (!vt) throw new Error('Put this vehicle on the map first.');
  const g = vt.parent.grid.size, [vx, vy] = [vt.x + vt.width * g / 2, vt.y + vt.height * g / 2];
  const mine = vt.parent.tokens.filter(t => t.actor?.isPerson && t.actor.isOwner && (t.getFlag(NS, 'vehicleSeat')?.vehicleTokenId === vt.id || Math.hypot(t.x + t.width * g / 2 - vx, t.y + t.height * g / 2 - vy) <= g * 2.6));
  const who = mine.find(t => t.actor.type === 'character') ?? mine[0];
  if (!who) throw new Error('Get in it or stand right beside it first.');
  if (vt.getFlag(NS, 'patched')) throw new Error(`${vt.name} has already been patched up. It needs a garage now.`);
  if (vt.getFlag(NS, 'burnt') || vehicleActor.system.vehicle.destroyed) throw new Error('There is nothing left to patch.');
  const out = await who.actor.rollStat('grf', {band: 'hard', label: `Patch up the ${vt.name}`, context: {kind: 'patch', vt: vt.uuid}});
  if (!out?.result?.success) return out;
  return game.smoke.request('drive.patch', {tokenUuid: vt.uuid, actorUuid: who.actor.uuid, strong: ['strongSuccess', 'exceptionalSuccess'].includes(out.result.outcomeKey)});
}

export class SmokeItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-sheet', 'item'], position: {width: 560, height: 620}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
  static PARTS = {main: {template: `systems/${NS}/templates/item-sheet.hbs`}};
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    return {...ctx, item: this.item, system: this.item.system, type: this.item.type, owner: this.item.isOwner, stats: STAT_KEYS.map(k => ({key: k, label: STATS[k].label})),
      ranges: ['Engaged', 'Near', 'Far', 'Distant'], categories: ['melee', 'pistol', 'smg', 'shotgun', 'rifle', 'throwable', 'police', 'heavy'], effects: ['', 'stun', 'gas', 'fire', 'bleed', 'area', 'smoke'],
      enriched: await enrich(this.item.system.description, this.item)};
  }
  async _onRender(context, options) { await super._onRender(context, options); wireInputs(this, this.item); }
}
