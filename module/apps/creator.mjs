// The Character Creator: seven short steps from a name to a finished Rep 1 character with stats, a perk, kit, cash
// and a story. The GM can make a new character from scratch; a player can finish their own blank one.
import {NS, STATS, STAT_KEYS} from '../config.mjs';
import {statModifier} from '../rules/core.mjs';
import {BACKGROUNDS, STARTER_EXTRAS, ENDS, STORY_IDEAS, CREATION_STEPS, blankDraft, stepProblem, draftProblems, applyPlan, startingHealth} from '../rules/creation.mjs';
import {card, esc} from '../world/net.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const strip = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export class SmokeCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-creator'], tag: 'div', position: {width: 860, height: 700}, window: {title: 'Character Creator', icon: 'fa-solid fa-user-plus', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/creator.hbs`, scrollable: ['.cr-main']}};
  constructor(actor = null) {
    super({id: `smoke-creator-${actor?.id ?? 'new'}`}); this.actor = actor; this.step = 'who';
    this.draft = blankDraft(actor?.name && !/^New /.test(actor.name) ? actor.name : '');
    if (actor) { const id = actor.system.identity || {}; Object.assign(this.draft, {alias: id.alias || '', pronouns: id.pronouns || '', age: id.age || '', ends: id.ends || 'Hackney Central', look: id.look || ''}); }
  }
  async _prepareContext() {
    const d = this.draft, bg = BACKGROUNDS.find(b => b.key === d.background), lib = (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json()).catch(() => ({items: []}))).items;
    const find = n => lib.find(i => i.name === n);
    const counts = {8: 0, 6: 0, 4: 0}; for (const k of STAT_KEYS) counts[d.stats[k]] = (counts[d.stats[k]] || 0) + 1;
    const idx = CREATION_STEPS.findIndex(s => s.key === this.step);
    return {
      draft: d, step: this.step, isNew: !this.actor,
      steps: CREATION_STEPS.map((s, i) => ({...s, n: i + 1, active: s.key === this.step, done: i < idx && !stepProblem(s.key, d), bad: i < idx && Boolean(stepProblem(s.key, d))})),
      problem: stepProblem(this.step, d), first: idx === 0, last: this.step === 'review',
      ends: ENDS.map(e => ({name: e, selected: e === d.ends})),
      backgrounds: BACKGROUNDS.map(b => ({...b, selected: b.key === d.background, statLine: STAT_KEYS.filter(k => b.stats[k] > 4).map(k => `${STATS[k].abbr} d${b.stats[k]}`).join(' · '),
        perkLine: b.perks.join(' / '), kitLine: b.kit.join(', ')})),
      bg, stats: STAT_KEYS.map(k => ({key: k, abbr: STATS[k].abbr, label: STATS[k].label, hint: STATS[k].hint, die: d.stats[k], mod: statModifier(d.stats[k]),
        options: [8, 6, 4].map(v => ({v, selected: d.stats[k] === v}))})),
      counts, spreadOk: !stepProblem('stats', d),
      perks: bg ? bg.perks.map(p => ({name: p, selected: d.perk === p, ...(find(p) ? {when: find(p).system.when, text: strip(find(p).system.description), img: find(p).img} : {})})) : [],
      kit: bg ? bg.kit.map(n => ({name: n, img: find(n)?.img, text: strip(find(n)?.system?.description).slice(0, 90)})) : [],
      extras: STARTER_EXTRAS.map(n => ({name: n, img: find(n)?.img, selected: d.extra === n})),
      ideas: Object.fromEntries(Object.entries(STORY_IDEAS).map(([k, list]) => [k, list.map(v => ({v, selected: d[k] === v}))])),
      health: startingHealth(d.stats.grt), cash: bg?.cash ?? 0,
      review: draftProblems(d).length ? null : applyPlan(d).summary, problems: draftProblems(d).map(p => ({...p, label: CREATION_STEPS.find(s => s.key === p.step).label}))
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element, d = this.draft;
    const on = (sel, fn, ev = 'click') => el.querySelectorAll(sel).forEach(n => n.addEventListener(ev, e => { if (ev === 'click') e.preventDefault(); Promise.resolve(fn(n)).catch(err => ui.notifications.warn(err.message)); }));
    on('[data-field]', n => { d[n.dataset.field] = n.value; }, 'change');
    on('[data-field]', n => { d[n.dataset.field] = n.value; }, 'input');
    on('[data-goto]', n => { this.step = n.dataset.goto; this.render(); });
    on('[data-next]', () => { const p = stepProblem(this.step, d); if (p) throw new Error(p); this.step = CREATION_STEPS[CREATION_STEPS.findIndex(s => s.key === this.step) + 1].key; this.render(); });
    on('[data-back]', () => { this.step = CREATION_STEPS[Math.max(0, CREATION_STEPS.findIndex(s => s.key === this.step) - 1)].key; this.render(); });
    on('[data-background]', n => { d.background = n.dataset.background; const bg = BACKGROUNDS.find(b => b.key === d.background); d.stats = {...bg.stats}; d.perk = ''; d.hustle ||= bg.hustle; this.render(); });
    on('[data-stat]', n => { d.stats[n.dataset.stat] = Number(n.value); this.render(); }, 'change');
    on('[data-suggest]', () => { const bg = BACKGROUNDS.find(b => b.key === d.background); if (bg) { d.stats = {...bg.stats}; this.render(); } });
    on('[data-perk]', n => { d.perk = n.dataset.perk; this.render(); });
    on('[data-extra]', n => { d.extra = d.extra === n.dataset.extra ? '' : n.dataset.extra; this.render(); });
    on('[data-idea]', n => { d[n.dataset.idea] = n.value; this.render(); }, 'change');
    on('[data-finish]', () => this.finish());
  }
  async finish() {
    const problems = draftProblems(this.draft); if (problems.length) throw new Error(problems[0].problem);
    const plan = applyPlan(this.draft);
    let actor = this.actor;
    if (!actor) {
      if (!game.user.isGM && !game.user.can?.('ACTOR_CREATE')) throw new Error('Ask the GM to make you a blank character first.');
      let folder = game.folders.find(f => f.type === 'Actor' && f.name === 'The Smoke — Player Characters');
      folder ??= await Folder.implementation.create({name: 'The Smoke — Player Characters', type: 'Actor', color: '#ffc467'});
      actor = await Actor.implementation.create({name: plan.update.name, type: 'character', folder: folder.id, img: 'icons/svg/mystery-man.svg', prototypeToken: {actorLink: true, disposition: 1, sight: {enabled: true}}});
    }
    const lib = (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json())).items;
    const kitTypes = ['weapon', 'armour', 'gear', 'consumable', 'outfit', 'perk', 'ammo', 'drug'];
    await actor.deleteEmbeddedDocuments('Item', actor.items.filter(i => kitTypes.includes(i.type)).map(i => i.id));
    const docs = plan.items.map(n => lib.find(i => i.name === n)).filter(Boolean).map(i => foundry.utils.deepClone(i));
    const firstOutfit = docs.find(i => i.type === 'outfit'); if (firstOutfit) firstOutfit.system.worn = true;
    await actor.update(plan.update); await actor.createEmbeddedDocuments('Item', docs);
    await card('NEW FACE', actor.name, `<p>${esc(plan.summary)}</p><p class="smoke-dim">Rep 1 — Nobody. Pat will be in touch.</p>`, 'crew');
    ui.notifications.info(`${actor.name} is ready.`); this.close(); actor.sheet.render(true);
    return actor;
  }
}
export function openCreator(actor = null) {
  if (actor?.system?.creation?.done && !game.user.isGM) return ui.notifications.info(`${actor.name} is already made. Level up from the sheet when you have the XP.`);
  const app = new SmokeCreator(actor); app.render({force: true}); return app;
}
