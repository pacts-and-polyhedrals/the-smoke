// Level Up: when a character has the XP for the next Rep level. Odd levels raise one stat (up to the tier's cap), even
// levels add a perk, every third level rolls Growth for Health and Guard, and each new tier adds a point of Hustle.
import {NS, STATS, STAT_KEYS, DIE_LADDER} from '../config.mjs';
import {repInfo, levelUpPlan, validateLevelUp, healthGrowth, guardGrowth, levelInfo, MAX_REP, missingMilestones, milestoneChoices, milestoneUpdate} from '../rules/advancement.mjs';
import {card, esc} from '../world/net.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const strip = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export class SmokeLevelUp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-levelup'], tag: 'div', position: {width: 760, height: 680}, window: {title: 'Level Up', icon: 'fa-solid fa-arrow-trend-up', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/levelup.hbs`, scrollable: ['.lv-main']}};
  constructor(actor) { super({id: `smoke-levelup-${actor.id}`}); this.actor = actor; this.stat = ''; this.perk = ''; this.growth = null; this.bonus = ''; this.claimLevel = missingMilestones(actor.system)[0] ?? null; this._saving = false; }
  async _prepareContext() {
    const a = this.actor, s = a.system, info = repInfo(s), plan = levelUpPlan(info.level);
    const misses = missingMilestones(s);
    this.claimLevel = misses.includes(this.claimLevel) ? this.claimLevel : (misses[0] ?? null);
    const bonusOnly = Boolean(this.claimLevel);
    const milestoneLevel = bonusOnly ? this.claimLevel : plan.to;
    const bonusChoices = milestoneChoices(s, milestoneLevel).map(b=>({...b,selected:this.bonus===b.id}));
    const lib = (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json()).catch(() => ({items: []}))).items;
    const owned = new Set(a.items.filter(i => i.type === 'perk').map(i => i.name));
    const check = bonusOnly ? {valid: bonusChoices.some(b=>b.id===this.bonus&&b.available),message:'Pick your milestone reward.'} :
      validateLevelUp({fromLevel: info.level, stat: this.stat, statDie: s.stats?.[this.stat]?.die, perk: this.perk, xp: s.rep?.xp, milestone:this.bonus,system:s});
    const needGrowth = !bonusOnly && plan.growthRoll && !this.growth;
    let n = 0; const steps = {stat: plan.statUpgrade ? ++n : 0, perk: plan.perk ? ++n : 0,
      growth: plan.growthRoll ? ++n : 0, milestone: plan.milestone ? ++n : 0};
    return {actor: a, info, plan, steps, nextTitle: levelInfo(plan.to)?.title, nextBlurb: levelInfo(plan.to)?.blurb,
      top: info.level >= MAX_REP, maxRep: MAX_REP, enoughXP: info.canLevel, bonusOnly, milestoneLevel, bonusChoices,
      missedCount:misses.length,
      stats: STAT_KEYS.map(k => { const die = Number(s.stats?.[k]?.die ?? 4), next = DIE_LADDER[DIE_LADDER.indexOf(die) + 1];
        return {key: k, abbr: STATS[k].abbr, label: STATS[k].label, die, next, ok: Boolean(next && next <= plan.cap), selected: this.stat === k}; }),
      perks: lib.filter(i => i.type === 'perk' && !owned.has(i.name)).map(p => ({name: p.name, abbr: STATS[p.system.stat]?.abbr, when: p.system.when, text: strip(p.system.description), selected: this.perk === p.name})),
      growth: this.growth, ready: check.valid && !needGrowth, problem: check.valid ? (needGrowth ? 'Roll Growth.' : '') : check.message,
      grtDie: s.stats?.grt?.die ?? 4, guardDie: Math.max(Number(s.stats?.mov?.die ?? 4), Number(s.stats?.grt?.die ?? 4))};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).catch(e => ui.notifications.warn(e.message)); }));
    on('[data-lv-stat]', n => { this.stat = n.dataset.lvStat; this.render(); });
    on('[data-lv-perk]', n => { this.perk = n.dataset.lvPerk; this.render(); });
    on('[data-lv-bonus]', n => { this.bonus = n.dataset.lvBonus; this.render(); });
    on('[data-lv-growth]', () => this.rollGrowth());
    on('[data-lv-confirm]', () => this.confirm());
  }
  /** Growth is rolled after the stat is chosen, so raising Grit or Moves helps the roll that follows. */
  async rollGrowth() {
    if (this.growth) throw new Error('Growth is already rolled.');
    if (levelUpPlan(repInfo(this.actor.system).level).statUpgrade && !this.stat) throw new Error('Choose the stat to raise first: it can change your Growth dice.');
    const s = this.actor.system, raised = k => k === this.stat ? DIE_LADDER[DIE_LADDER.indexOf(Number(s.stats[k].die)) + 1] : Number(s.stats[k].die);
    const grt = raised('grt'), guardDie = Math.max(raised('mov'), raised('grt'));
    const roll = await new Roll(`1d${grt} + 1d${guardDie}`).evaluate();
    const [h, g] = roll.dice.map(d => d.total);
    this.growth = {health: healthGrowth(h), healthRoll: h, healthDie: grt, guard: guardGrowth(g, guardDie), guardRoll: g, guardDie};
    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor: this.actor}), flavor: `${this.actor.name}: Growth (Health d${grt}, Guard d${guardDie})`});
    this.render();
  }
  async confirm() {
    if(this._saving)return;
    this._saving=true;
    try {
      const a=this.actor, s=a.system, info=repInfo(s);
      // Characters who reached these levels before milestones existed claim each one, with no XP or level rollback.
      if(this.claimLevel!==null){
        if(!missingMilestones(s).includes(this.claimLevel))throw new Error('That milestone is already claimed.');
        const m=milestoneUpdate(s,this.claimLevel,this.bonus);
        await a.update(m.updates);
        await card(`REP ${this.claimLevel}`, `${a.name}: milestone reward`, `<p><b>${esc(m.label)}</b> — ${esc(m.detail)}</p><p>No XP spent. Your original level gains stay exactly as they were.</p>`, 'crew');
        ui.notifications.info(`${a.name} has claimed the Rep ${this.claimLevel} bonus.`);
        return this.close();
      }
      const plan=levelUpPlan(info.level);
      const check=validateLevelUp({fromLevel:info.level,stat:this.stat,statDie:s.stats?.[this.stat]?.die,perk:this.perk,xp:s.rep?.xp,milestone:this.bonus,system:s});
      if(!check.valid)throw new Error(check.message);
      if(plan.growthRoll&&!this.growth)throw new Error('Roll Growth first.');
      const lib=(await fetch(`systems/${NS}/data/london-items.json`).then(r=>r.json())).items;
      const perk=plan.perk?lib.find(i=>i.name===this.perk):null;
      if(plan.perk&&!perk)throw new Error('That perk is unavailable. Choose another.');
      const hp=s.resources.health,hu=s.resources.hustle,gr=plan.growthRoll?this.growth:{health:0,guard:0};
      const m=plan.milestone?milestoneUpdate(s,plan.to,this.bonus):null;
      const updates={'system.stage':plan.to,...(plan.statUpgrade?{[`system.stats.${this.stat}.die`]:check.nextDie}:{}),
        'system.creation.levelledTo':plan.to,...(m?.updates??{})};
      // Stack the ordinary growth and tier-Hustle rewards with the chosen milestone reward.
      if(gr.health){
        updates['system.resources.health.max']=Number(updates['system.resources.health.max']??hp.max)+gr.health;
        updates['system.resources.health.value']=Number(updates['system.resources.health.value']??hp.value)+gr.health;
      }
      if(gr.guard)updates['system.guard.base']=Number(updates['system.guard.base']??s.guard?.base??4)+gr.guard;
      if(plan.hustle){
        updates['system.resources.hustle.max']=Number(updates['system.resources.hustle.max']??hu.max)+plan.hustle;
        updates['system.resources.hustle.value']=Number(updates['system.resources.hustle.value']??hu.value)+plan.hustle;
      }
      await a.update(updates);
      if(perk)await a.createEmbeddedDocuments('Item',[foundry.utils.deepClone(perk)]);
      const lines=[plan.statUpgrade?`<li>${esc(STATS[this.stat].label)} → d${check.nextDie}</li>`:'',
        perk?`<li>New perk: ${esc(this.perk)}</li>`:'',
        plan.growthRoll?`<li>Health +${gr.health} (rolled ${gr.healthRoll} on d${gr.healthDie})</li><li>Guard +${gr.guard} (rolled ${gr.guardRoll} on d${gr.guardDie})</li>`:'',
        plan.hustle?`<li>Hustle +1 — into the ${esc(plan.tierName)} tier</li>`:'',
        m?`<li><b>Rep ${plan.to} milestone — ${esc(m.label)}</b>: ${esc(m.detail)}</li>`:''].join('');
      await card(`REP ${plan.to}`,`${a.name}: ${levelInfo(plan.to).title}`,
        `<p>${esc(levelInfo(plan.to).blurb)}</p><ul>${lines}</ul>${plan.newTier?`<p class="smoke-passed">${esc(plan.tierName.toUpperCase())}</p>`:''}`,'crew');
      ui.notifications.info(`${a.name} reaches Rep ${plan.to}.`);
      return this.close();
    }finally{this._saving=false;}
  }

}
export function openLevelUp(actor) {
  if (!actor) return ui.notifications.warn('Choose a character.');
  if (!actor.isOwner) return ui.notifications.warn(`${actor.name} is not yours.`);
  const app = new SmokeLevelUp(actor); app.render({force: true}); return app;
}
