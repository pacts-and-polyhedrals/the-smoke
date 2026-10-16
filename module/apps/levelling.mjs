// Level Up: when a character has the XP for the next Rep level. Raise one stat (up to the new cap), take a new
// perk, roll Growth for Health and Guard, and (at Rep 3 and 5) gain a point of Hustle.
import {NS, STATS, STAT_KEYS, DIE_LADDER} from '../config.mjs';
import {repInfo, levelUpPlan, validateLevelUp, healthGrowth, guardGrowth, levelInfo} from '../rules/advancement.mjs';
import {card, esc} from '../world/net.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const strip = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export class SmokeLevelUp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-levelup'], tag: 'div', position: {width: 760, height: 680}, window: {title: 'Level Up', icon: 'fa-solid fa-arrow-trend-up', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/levelup.hbs`, scrollable: ['.lv-main']}};
  constructor(actor) { super({id: `smoke-levelup-${actor.id}`}); this.actor = actor; this.stat = ''; this.perk = ''; this.growth = null; }
  async _prepareContext() {
    const a = this.actor, s = a.system, info = repInfo(s), plan = levelUpPlan(info.level);
    const lib = (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json()).catch(() => ({items: []}))).items;
    const owned = new Set(a.items.filter(i => i.type === 'perk').map(i => i.name));
    const check = validateLevelUp({fromLevel: info.level, stat: this.stat, statDie: s.stats?.[this.stat]?.die, perk: this.perk, xp: s.rep?.xp});
    return {actor: a, info, plan, nextTitle: levelInfo(plan.to)?.title, nextBlurb: levelInfo(plan.to)?.blurb, top: info.level >= 5, enoughXP: info.canLevel,
      stats: STAT_KEYS.map(k => { const die = Number(s.stats?.[k]?.die ?? 4), next = DIE_LADDER[DIE_LADDER.indexOf(die) + 1];
        return {key: k, abbr: STATS[k].abbr, label: STATS[k].label, die, next, ok: Boolean(next && next <= plan.cap), selected: this.stat === k}; }),
      perks: lib.filter(i => i.type === 'perk' && !owned.has(i.name)).map(p => ({name: p.name, abbr: STATS[p.system.stat]?.abbr, when: p.system.when, text: strip(p.system.description), selected: this.perk === p.name})),
      growth: this.growth, ready: check.valid && Boolean(this.growth), problem: check.valid ? (this.growth ? '' : 'Roll Growth.') : check.message,
      grtDie: s.stats?.grt?.die ?? 4, guardDie: Math.max(Number(s.stats?.mov?.die ?? 4), Number(s.stats?.grt?.die ?? 4))};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).catch(e => ui.notifications.warn(e.message)); }));
    on('[data-lv-stat]', n => { this.stat = n.dataset.lvStat; this.render(); });
    on('[data-lv-perk]', n => { this.perk = n.dataset.lvPerk; this.render(); });
    on('[data-lv-growth]', () => this.rollGrowth());
    on('[data-lv-confirm]', () => this.confirm());
  }
  /** Growth is rolled after the stat is chosen, so raising Grit or Moves helps the roll that follows. */
  async rollGrowth() {
    if (this.growth) throw new Error('Growth is already rolled.');
    if (!this.stat) throw new Error('Choose the stat to raise first: it can change your Growth dice.');
    const s = this.actor.system, raised = k => k === this.stat ? DIE_LADDER[DIE_LADDER.indexOf(Number(s.stats[k].die)) + 1] : Number(s.stats[k].die);
    const grt = raised('grt'), guardDie = Math.max(raised('mov'), raised('grt'));
    const roll = await new Roll(`1d${grt} + 1d${guardDie}`).evaluate();
    const [h, g] = roll.dice.map(d => d.total);
    this.growth = {health: healthGrowth(h), healthRoll: h, healthDie: grt, guard: guardGrowth(g, guardDie), guardRoll: g, guardDie};
    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor: this.actor}), flavor: `${this.actor.name}: Growth (Health d${grt}, Guard d${guardDie})`});
    this.render();
  }
  async confirm() {
    const a = this.actor, s = a.system, info = repInfo(s), plan = levelUpPlan(info.level);
    const check = validateLevelUp({fromLevel: info.level, stat: this.stat, statDie: s.stats[this.stat]?.die, perk: this.perk, xp: s.rep?.xp});
    if (!check.valid) throw new Error(check.message); if (!this.growth) throw new Error('Roll Growth first.');
    const lib = (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json())).items, perk = lib.find(i => i.name === this.perk);
    const hp = s.resources.health, hu = s.resources.hustle;
    await a.update({'system.stage': plan.to, [`system.stats.${this.stat}.die`]: check.nextDie, 'system.resources.health.max': Number(hp.max) + this.growth.health, 'system.resources.health.value': Number(hp.value) + this.growth.health,
      'system.guard.base': Number(s.guard?.base ?? 4) + this.growth.guard, 'system.creation.levelledTo': plan.to,
      ...(plan.hustle ? {'system.resources.hustle.max': Number(hu.max) + plan.hustle, 'system.resources.hustle.value': Number(hu.value) + plan.hustle} : {})});
    if (perk) await a.createEmbeddedDocuments('Item', [foundry.utils.deepClone(perk)]);
    await card(`REP ${plan.to}`, `${a.name} is a ${levelInfo(plan.to).title}`, `<p>${esc(levelInfo(plan.to).blurb)}</p><ul>
      <li>${esc(STATS[this.stat].label)} → d${check.nextDie}</li><li>New perk: ${esc(this.perk)}</li><li>Health +${this.growth.health} (rolled ${this.growth.healthRoll} on d${this.growth.healthDie})</li>
      <li>Guard +${this.growth.guard} (rolled ${this.growth.guardRoll} on d${this.growth.guardDie})</li>${plan.hustle ? '<li>Hustle +1</li>' : ''}</ul>`, 'crew');
    ui.notifications.info(`${a.name} reaches Rep ${plan.to}.`); this.close();
  }
}
export function openLevelUp(actor) {
  if (!actor) return ui.notifications.warn('Choose a character.');
  if (!actor.isOwner) return ui.notifications.warn(`${actor.name} is not yours.`);
  const app = new SmokeLevelUp(actor); app.render({force: true}); return app;
}
