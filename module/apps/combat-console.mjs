// The Combat Console: the round at a glance. Roll your speed dice in private; the GM reveals everyone's at once;
// then work down the queue, highest die first. Whoever's die is up gets the action buttons; police officers can be
// left to the AI. The GM starts fights, rolls for the NPCs, reveals, moves the queue on and begins each round.
import {NS, STATS} from '../config.mjs';
import {clampHeat} from '../rules/core.mjs';
import {COVER, rangeBand} from '../combat/rules.mjs';
import {combatAPI, seatOf} from '../combat/combat.mjs';
import {reload} from '../world/items.mjs';

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const PHASE = {idle: 'Between rounds', intent: 'Roll your speed dice', resolve: 'Action'};

export class SmokeCombatConsole extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-combat-console', classes: ['smoke', 'smoke-combat'], tag: 'div', position: {width: 620, height: 720}, window: {title: 'Combat Console', icon: 'fa-solid fa-crosshairs', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/combat-console.hbs`, scrollable: ['.cc-body']}};
  get combat() { return game.combats.find(c => c.scene?.id === canvas?.scene?.id && c.active) ?? game.combats.find(c => c.scene?.id === canvas?.scene?.id) ?? null; }

  async _prepareContext() {
    const combat = this.combat, isGM = game.user.isGM;
    if (!combat) return {combat: null, isGM, selected: (canvas?.tokens?.controlled ?? []).length};
    const st = combatAPI.stateOf(combat), revealed = st.phase === 'resolve' || st.phase === 'idle' && st.queue?.length;
    const cur = st.phase === 'resolve' ? st.queue[st.cursor] : null, curC = cur ? combat.combatants.get(cur.cid) : null;
    const spentOf = cid => (st.queue || []).slice(0, st.phase === 'resolve' ? st.cursor : (st.queue || []).length).filter(e => e.cid === cid).map(e => e.die);
    const rows = combat.combatants.map(c => {
      const sp = combatAPI.speedOf(c), a = c.actor, t = c.token, mine = c.isOwner, see = isGM || mine || revealed, spent = new Set(spentOf(c.id));
      return {id: c.id, name: c.name, img: c.img ?? a?.img, pc: c.hasPlayerOwner, mine, current: curC?.id === c.id,
        hp: a?.system?.resources?.health?.value ?? a?.system?.vehicle?.body?.value, hpMax: a?.system?.resources?.health?.max ?? a?.system?.vehicle?.body?.max,
        heat: clampHeat(a?.system?.heat?.value), cover: t?.getFlag(NS, 'cover') && t.getFlag(NS, 'cover') !== 'none' ? COVER[t.getFlag(NS, 'cover')]?.label.split(' (')[0] : '',
        conditions: (a?.items ?? []).filter(i => i.type === 'condition').map(i => i.name).join(', '), aiming: t?.getFlag(NS, 'aiming'), dodging: t?.getFlag(NS, 'dodging'),
        count: sp.count, rolled: sp.rolled, canRoll: mine && st.phase === 'intent' && !sp.rolled && sp.count > 0,
        dice: see ? (sp.results || []).map((v, i) => ({v, spent: spent.has(i)})) : [], hidden: !see && sp.rolled, out: !sp.count};
    });
    const curToken = curC?.token, curActor = curC?.actor, mineNow = curC && (curC.isOwner || isGM);
    const weapons = mineNow ? (curActor?.items ?? []).filter(i => i.type === 'weapon' && Number(i.system.ammo?.max) && Number(i.system.ammo.value) < Number(i.system.ammo.max)).map(w => ({id: w.id, name: `${w.name} ${w.system.ammo.value}/${w.system.ammo.max}`})) : [];
    const conds = new Set((curActor?.items ?? []).filter(i => i.type === 'condition').map(i => i.name));
    return {combat: true, isGM, round: st.round || combat.round, phase: st.phase, phaseLabel: PHASE[st.phase] ?? st.phase, rows,
      queue: (st.queue || []).map((e, i) => ({...e, done: st.phase === 'resolve' ? i < st.cursor : true, now: st.phase === 'resolve' && i === st.cursor})),
      waiting: rows.filter(r => !r.rolled && !r.out).map(r => r.name).join(', '),
      current: curC ? {name: curC.name, value: cur.value, mine: mineNow, npc: !curC.hasPlayerOwner, police: Boolean(curToken?.getFlag(NS, 'police') || curActor?.system?.role === 'police'),
        driving: seatOf(curToken)?.seatId === 'pilot', grabbed: conds.has('Grabbed'), weapons, cover: Object.entries(COVER).filter(([k]) => k !== 'full').map(([k, v]) => ({key: k, label: v.label.split(' (')[0]}))} : null};
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element, combat = this.combat;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).then(() => setTimeout(() => this.render(), 300)).catch(e => ui.notifications.warn(e.message)); }));
    const st = combat ? combatAPI.stateOf(combat) : null, cur = st?.queue?.[st.cursor], cc = cur ? combat.combatants.get(cur.cid) : null, tok = cc?.token;
    on('[data-start]', () => combatAPI.startFight([...(canvas.tokens.controlled ?? []), ...[...(game.user.targets ?? [])]]));
    on('[data-begin]', () => combatAPI.begin(combat));
    on('[data-npc-roll]', () => combatAPI.npcSpeed(combat));
    on('[data-reveal]', n => combatAPI.reveal(combat, n.dataset.reveal === 'force'));
    on('[data-next]', () => combatAPI.next(combat));
    on('[data-end-fight]', async () => { const ok = await DialogV2.confirm({window: {title: 'End the fight?'}, content: '<p>End this combat for everyone?</p>'}); if (ok) { for (const c of combat.combatants) { const a = c.actor; if (a?.system?.states?.surrendered) await a.update({'system.states.surrendered': false}); } return combat.delete(); } });
    on('[data-roll-speed]', n => combatAPI.rollSpeed(combat.combatants.get(n.dataset.rollSpeed)));
    on('[data-ping]', n => { const t = combat.combatants.get(n.dataset.ping)?.token?.object; if (t) canvas.animatePan({x: t.center.x, y: t.center.y}); });
    // the current action
    on('[data-act]', n => {
      if (!tok) return null; const k = n.dataset.act;
      switch (k) {
        case 'attack': return combatAPI.attack(tok);
        case 'grab': return combatAPI.grab(tok);
        case 'cuff': return combatAPI.cuff(tok);
        case 'free': return combatAPI.breakFree(tok);
        case 'aim': return combatAPI.aim(tok);
        case 'dodge': return combatAPI.dodge(tok);
        case 'ram': return combatAPI.ram(tok);
        case 'surrender': return combatAPI.surrender(tok);
        case 'police': return combatAPI.policeTurn(tok);
        case 'sheet': return tok.actor?.sheet.render(true);
      }
      return null;
    });
    on('[data-cover]', n => tok && combatAPI.takeCover(tok, n.dataset.cover));
    on('[data-reload]', n => tok && reload(tok.actor, tok.actor.items.get(n.dataset.reload)));
  }
}
let consoleApp = null;
export function openCombat() { consoleApp ??= new SmokeCombatConsole(); consoleApp.render({force: true}); return consoleApp; }
const refresh = () => { if (consoleApp?.rendered) consoleApp.render(); };
for (const h of ['updateCombat', 'updateCombatant', 'createCombat', 'deleteCombat', 'createCombatant', 'deleteCombatant']) Hooks.on(h, refresh);
Hooks.on('updateActor', refresh); Hooks.on('updateToken', (d, ch) => { if (ch.flags?.[NS]) refresh(); });
// A Combat Console button in the core combat tracker.
Hooks.on('renderCombatTracker', (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0]; if (!root || root.querySelector('.smoke-open-console')) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'smoke-open-console'; b.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Combat Console (speed dice)';
  b.addEventListener('click', ev => { ev.preventDefault(); openCombat(); });
  (root.querySelector('.combat-tracker-header') ?? root.querySelector('header') ?? root).prepend(b);
});
