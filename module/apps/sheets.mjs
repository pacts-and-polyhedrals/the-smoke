// Sheets: character / NPC, vehicle, item. ApplicationV2 + Handlebars (Foundry v14).
import {NS, STATS, STAT_KEYS, DIE_LADDER, HEAT, JOB_TYPES, VEHICLE_LOCK_BANDS} from '../config.mjs';
import {statModifier, validateStartingSpread} from '../rules/core.mjs';
import {difficultyLadder} from '../rules/difficulty.mjs';
import {ABILITIES, abilitiesOf} from '../vehicles/vehicle-abilities.mjs';
import {seatLayout} from '../vehicles/vehicle-seat-math.mjs';
import {openVehicleBoardDialog, openVehicleControl} from '../vehicles/vehicle-boarding.mjs';
import {CONDITION_LIBRARY} from '../rules/conditions.mjs';
import {repInfo, statCap} from '../rules/advancement.mjs';
import {reload, ammoFor} from '../world/items.mjs';

const {ActorSheetV2, ItemSheetV2} = foundry.applications.sheets;
const {HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const value = el => el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
const enrich = (html, doc) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html || '', {secrets: doc.isOwner, relativeTo: doc});
const tokenOf = a => a.token ?? canvas?.scene?.tokens?.find(t => t.actorId === a.id) ?? null;

function wireInputs(app, doc) {
  const el = app.element; if (!el) return;
  // Only owners edit; everyone else sees a read-only sheet.
  if (!doc.isOwner) el.querySelectorAll('input, select, textarea, prose-mirror').forEach(i => { i.disabled = true; });
  el.querySelectorAll('[name]').forEach(input => input.addEventListener('change', async ev => {
    const t = ev.currentTarget; if (!t.name || t.name.startsWith('job.')) return;
    try { if (!doc.isOwner) throw new Error('You need ownership to change this sheet.'); await doc.update({[t.name]: value(t)}); }
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
      conditionLibrary: CONDITION_LIBRARY.map(c => { const have = conditions.find(i => i.name === c.name); return {...c, active: Boolean(have), stacks: Number(have?.system?.stacks || 0) > 1 ? have.system.stacks : 0}; }),
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
    act('[data-item-delete]', async n => { mine(); const item = a.items.get(n.dataset.itemDelete); if (item && await DialogV2.confirm({window: {title: `Remove ${item.name}?`}, content: '<p>Remove this item from the character?</p>'})) return item.delete(); });
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

export class SmokeVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-sheet', 'vehicle'], position: {width: 700, height: 760}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
  static PARTS = {main: {template: `systems/${NS}/templates/vehicle-sheet.hbs`, scrollable: ['.smoke-body']}};
  _tab = 'stats';
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options); const a = this.actor, v = a.system.vehicle;
    const token = tokenOf(a), occupants = token?.getFlag?.(NS, 'vehicleOccupants') ?? [];
    const status = v.destroyed ? 'WRITTEN OFF' : Number(v.body.value) <= 0 ? 'WRECKED' : Number(v.body.value) < Number(v.body.max) ? 'DAMAGED' : 'ROADWORTHY';
    return {...ctx, actor: a, v, isGM: game.user.isGM, owner: a.isOwner, dice: DIE_LADDER, locks: VEHICLE_LOCK_BANDS, status, tokenOnMap: Boolean(token),
      abilities: abilitiesOf(a).map(x => ({...x, ...(ABILITIES[x.key] || {label: x.key, text: ''}), seats: Array.isArray(x.seats) ? x.seats.join(', ') : ''})),
      seats: seatLayout(a).map(seat => ({...seat, occupant: occupants.find(o => o.seatId === seat.id)?.name ?? ''})),
      jobs: (v.jobs || []).map(j => JOB_TYPES[j]).filter(Boolean),
      jobChoices: Object.entries(JOB_TYPES).filter(([key]) => key !== 'crew').map(([key, j]) => ({key, label: j.label, on: (v.jobs || []).includes(key)})),
      bodyPct: Math.round(100 * Number(v.body.value) / Math.max(1, Number(v.body.max))),
      biographyHTML: await enrich(a.system.biography, a), systemsHTML: await enrich(v.systems, a)};
  }
  async _onRender(context, options) {
    await super._onRender(context, options); wireInputs(this, this.actor);
    const el = this.element, a = this.actor;
    const act = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n, ev)).catch(e => ui.notifications.warn(e.message)); }));
    const placed = () => { const t = tokenOf(a); if (!t) throw new Error('Place this vehicle on the map first.'); return t; };
    act('[data-board]', () => openVehicleBoardDialog(placed()));
    act('[data-vehicle-control]', () => openVehicleControl(placed()));
    act('[data-radio]', () => game.smoke.radio.vehicle(placed()));
    el.querySelectorAll('[data-vehicle-job]').forEach(b => b.addEventListener('change', async () => {
      try { if (!a.isOwner) throw new Error('You need ownership to change this sheet.'); await a.update({'system.vehicle.jobs': [...el.querySelectorAll('[data-vehicle-job]:checked')].map(x => x.dataset.vehicleJob)}); }
      catch (e) { ui.notifications.warn(e.message); }
    }));
  }
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
