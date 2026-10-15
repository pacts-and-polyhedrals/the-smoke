// Sheets: character / NPC, vehicle, item. ApplicationV2 + Handlebars (Foundry v14).
import {NS, STATS, STAT_KEYS, DIE_LADDER, HEAT, JOB_TYPES, VEHICLE_LOCK_BANDS} from '../config.mjs';
import {statModifier} from '../rules/core.mjs';
import {difficultyLadder} from '../rules/difficulty.mjs';
import {ABILITIES, abilitiesOf} from '../vehicles/vehicle-abilities.mjs';
import {seatLayout} from '../vehicles/vehicle-seat-math.mjs';
import {CONDITION_LIBRARY} from '../rules/conditions.mjs';

const {ActorSheetV2, ItemSheetV2} = foundry.applications.sheets;
const {HandlebarsApplicationMixin} = foundry.applications.api;
const value = el => el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;

function wireInputs(app, doc) {
  const el = app.element; if (!el) return;
  el.querySelectorAll('[name]').forEach(input => input.addEventListener('change', async ev => {
    const t = ev.currentTarget; if (!t.name) return;
    await doc.update({[t.name]: value(t)});
  }));
  el.querySelectorAll('[data-tab-target]').forEach(tab => tab.addEventListener('click', ev => { ev.preventDefault(); app._tab = tab.dataset.tabTarget; showTab(app); }));
  showTab(app);
}
function showTab(app) {
  const el = app.element; if (!el) return; const tab = app._tab || el.querySelector('[data-tab-target]')?.dataset.tabTarget;
  el.querySelectorAll('[data-tab-target]').forEach(t => t.classList.toggle('active', t.dataset.tabTarget === tab));
  el.querySelectorAll('[data-tab]').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
}

export class SmokeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-sheet', 'actor'], position: {width: 760, height: 780}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
  static PARTS = {main: {template: `systems/${NS}/templates/actor-sheet.hbs`, scrollable: ['.smoke-body']}};
  _tab = 'street';
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options); const a = this.actor, s = a.system;
    const heat = Math.max(0, Math.min(5, Number(s.heat?.value || 0)));
    return {...ctx, actor: a, system: s, isGM: game.user.isGM, owner: a.isOwner, isNPC: a.type === 'npc',
      stats: STAT_KEYS.map(k => ({key: k, abbr: STATS[k].abbr, label: STATS[k].label, hint: STATS[k].hint, die: s.stats[k]?.die ?? 4, mod: (() => { try { return statModifier(s.stats[k]?.die ?? 4); } catch (_e) { return 2; } })(),
        ladder: difficultyLadder({attributeDie: s.stats[k]?.die ?? 4}).map(b => `${b.label} ${b.tn}`).join(' · ')})),
      dice: DIE_LADDER, heat, heatInfo: HEAT[heat], stars: [1, 2, 3, 4, 5].map(n => ({n, on: n <= heat})),
      weapons: a.items.filter(i => i.type === 'weapon'), armour: a.items.filter(i => i.type === 'armour'), gear: a.items.filter(i => i.type === 'gear'),
      perks: a.items.filter(i => i.type === 'perk'), conditions: a.items.filter(i => i.type === 'condition'),
      conditionLibrary: CONDITION_LIBRARY.map(c => ({...c, active: a.items.some(i => i.type === 'condition' && i.name === c.name)})),
      folded: a.getFlag(NS, 'foldedVehicles') || []};
  }
  async _onRender(context, options) {
    await super._onRender(context, options); wireInputs(this, this.actor);
    const el = this.element, a = this.actor;
    const act = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n, ev)).catch(e => ui.notifications.warn(e.message)); }));
    act('[data-roll]', n => a.rollDialog(n.dataset.roll));
    act('[data-quick]', n => a.rollStat(n.dataset.quick, {band: 'medium'}));
    act('[data-item-use]', n => a.items.get(n.dataset.itemUse)?.use());
    act('[data-item-edit]', n => a.items.get(n.dataset.itemEdit)?.sheet.render(true));
    act('[data-item-delete]', n => a.items.get(n.dataset.itemDelete)?.delete());
    act('[data-item-toggle]', n => { const i = a.items.get(n.dataset.itemToggle); return i?.update({'system.equipped': !i.system.equipped}); });
    act('[data-condition]', n => n.classList.contains('on') ? a.removeCondition(n.dataset.condition) : a.addCondition(n.dataset.condition));
    act('[data-heat]', n => game.user.isGM ? a.setHeat(Number(n.dataset.heat) === Number(a.system.heat?.value) ? Number(n.dataset.heat) - 1 : Number(n.dataset.heat), 'Set by the GM.') : ui.notifications.info('Only the GM sets Heat by hand.'));
    act('[data-create]', n => a.createEmbeddedDocuments('Item', [{name: `New ${n.dataset.create}`, type: n.dataset.create}]).then(([i]) => i?.sheet.render(true)));
    act('[data-heal]', () => a.heal(1));
    act('[data-hurt]', () => a.applyDamage(1));
    act('[data-phone]', () => game.smoke.openPhone());
  }
}

export class SmokeVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-sheet', 'vehicle'], position: {width: 680, height: 720}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
  static PARTS = {main: {template: `systems/${NS}/templates/vehicle-sheet.hbs`, scrollable: ['.smoke-body']}};
  _tab = 'stats';
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options); const a = this.actor, v = a.system.vehicle;
    return {...ctx, actor: a, v, isGM: game.user.isGM, dice: DIE_LADDER, locks: VEHICLE_LOCK_BANDS,
      abilities: abilitiesOf(a).map(x => ({...x, ...(ABILITIES[x.key] || {label: x.key, text: ''}), seats: Array.isArray(x.seats) ? x.seats.join(', ') : ''})),
      seats: seatLayout(a), jobs: (v.jobs || []).map(j => JOB_TYPES[j]).filter(Boolean),
      bodyPct: Math.round(100 * Number(v.body.value) / Math.max(1, Number(v.body.max)))};
  }
  async _onRender(context, options) { await super._onRender(context, options); wireInputs(this, this.actor); }
}

export class SmokeItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-sheet', 'item'], position: {width: 520, height: 560}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
  static PARTS = {main: {template: `systems/${NS}/templates/item-sheet.hbs`}};
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    return {...ctx, item: this.item, system: this.item.system, type: this.item.type, stats: STAT_KEYS.map(k => ({key: k, label: STATS[k].label})),
      enriched: await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.item.system.description || '', {async: true})};
  }
  async _onRender(context, options) { await super._onRender(context, options); wireInputs(this, this.item); }
}
