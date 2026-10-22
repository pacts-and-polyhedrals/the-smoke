// The Combat Console: the round at a glance. Roll your speed dice in private; the GM reveals everyone's at once;
// then work down the queue, highest die first. Whoever's die is up gets the action buttons; police officers can be
// left to the AI. The GM starts fights, rolls for the NPCs, reveals, moves the queue on and begins each round.
import {NS} from '../config.mjs';
import {clampHeat} from '../rules/core.mjs';
import {COVER} from '../combat/rules.mjs';
import {combatAPI, seatOf} from '../combat/combat.mjs';
import {reload} from '../world/items.mjs';
import {driveBands, bandFor, BAND_INFO} from '../rules/driving.mjs';
import {chaseAPI, chaseRelevantFlags} from '../world/chase.mjs';
import {chaseOf, vehicleNow, actionKey, tallyOf, vehicleOf, canManageChase, chaseMode, pendingResponses, pendingResponseDetails} from '../world/chase-state.mjs';
import {request} from '../world/net.mjs';

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const PHASE = {idle: 'Between rounds', intent: 'Roll your speed dice', resolve: 'Action'};
/** Say why someone has no dice instead of a bare OUT. */
const OUT_WHY = {
  Surrendered: 'Surrendered in this fight: no actions until it ends. A new fight, Busted, Wasted or a night\'s rest stands you back up.',
  Down: 'Down at the start of the round: no actions. Healing above 0 Health brings your dice back next round.',
  Cuffed: 'Cuffed: no actions. A key, a Hard Graft roll or the custody suite takes the cuffs off (rest does not).',
  'On fire': 'Burning motor: no actions.', Parked: 'Parked up: no actions.', 'Traffic phase': 'Moves with the shared civilian traffic phase.'};
export function outLabel(c, sp = c?.getFlag?.(NS, 'speed')) {
  if (!sp) return {outLabel: 'NEXT ROUND', outTitle: 'Joined after the dice were revealed: dealt in when the next round begins.'};
  if (sp.count) return {outLabel: '', outTitle: ''};
  return {outLabel: sp.why ? `OUT · ${String(sp.why).toUpperCase()}` : 'OUT', outTitle: OUT_WHY[sp.why] ?? 'No speed dice this round.'};
}

export class SmokeCombatConsole extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-combat-console', classes: ['smoke', 'smoke-combat'], tag: 'div', position: {width: 620, height: 720}, window: {title: 'Combat Console', icon: 'fa-solid fa-crosshairs', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/combat-console.hbs`, scrollable: ['.cc-body']}};
  get combat() { return chaseOf(canvas?.scene) ?? game.combats.find(c => c.scene?.id === canvas?.scene?.id && c.active) ?? game.combats.find(c => c.scene?.id === canvas?.scene?.id) ?? null; }

  async _prepareContext() {
    const combat = this.combat, isGM = game.user.isGM;
    if (!combat) return {combat: null, isGM, canStart: isGM || game.settings.get(NS, 'playMode') === 'self', selected: (canvas?.tokens?.controlled ?? []).length};
    const st = combatAPI.stateOf(combat), revealed = st.phase === 'resolve' || st.phase === 'idle' && st.queue?.length;
    const cur = st.phase === 'resolve' ? st.queue[st.cursor] : null, curC = cur ? combat.combatants.get(cur.cid) : null;
    const spentOf = cid => (st.queue || []).slice(0, st.phase === 'resolve' ? st.cursor : (st.queue || []).length).filter(e => e.cid === cid).map(e => e.die);
    const rows = combat.combatants.map(c => {
      const sp = combatAPI.speedOf(c), a = c.actor, t = c.token, mine = c.isOwner, see = isGM || mine || revealed, spent = new Set(spentOf(c.id));
      const kind = a?.type === 'vehicle' ? (t?.getFlag(NS, 'police') ? 'police' : 'traffic') : t?.getFlag(NS, 'police') ? 'officer' : '';
      return {id: c.id, name: c.name, img: c.img ?? a?.img, pc: c.hasPlayerOwner, mine, current: curC?.id === c.id, kind, vehicle: a?.type === 'vehicle',
        burning: Boolean(t?.getFlag(NS, 'fire')), driving: !c.hasPlayerOwner ? '' : (vehicleOf(t)?.name ?? ''),
        hp: a?.system?.resources?.health?.value ?? a?.system?.vehicle?.body?.value, hpMax: a?.system?.resources?.health?.max ?? a?.system?.vehicle?.body?.max,
        heat: clampHeat(a?.system?.heat?.value), cover: t?.getFlag(NS, 'cover') && t.getFlag(NS, 'cover') !== 'none' ? COVER[t.getFlag(NS, 'cover')]?.label.split(' (')[0] : '',
        conditions: (a?.items ?? []).filter(i => i.type === 'condition').map(i => i.name).join(', '), aiming: t?.getFlag(NS, 'aiming'), dodging: t?.getFlag(NS, 'dodging'),
        count: sp.count, rolled: sp.rolled, canRoll: mine && st.phase === 'intent' && !sp.rolled && sp.count > 0,
        dice: see ? (sp.results || []).map((v, i) => ({v, spent: spent.has(i), lost: (sp.lost || []).includes(i)})) : [], hidden: !see && sp.rolled, out: !sp.count, ...outLabel(c)};
    });
    const curToken = curC?.token, curActor = curC?.actor, mineNow = curC && (curC.isOwner || isGM);
    const weapons = mineNow ? (curActor?.items ?? []).filter(i => i.type === 'weapon' && Number(i.system.ammo?.max) && Number(i.system.ammo.value) < Number(i.system.ammo.max)).map(w => ({id: w.id, name: `${w.name} ${w.system.ammo.value}/${w.system.ammo.max}`})) : [];
    const conds = new Set((curActor?.items ?? []).filter(i => i.type === 'condition').map(i => i.name));
    const chase = combat.getFlag(NS, 'chase') ?? null;
    const canManage = canManageChase(combat), pending = pendingResponses(combat), pendingDetails=pendingResponseDetails(combat).map(d=>({...d,canReview:isGM&&d.kind==='drive'&&d.rolled,canCancel:isGM&&d.kind==='drive'&&!d.rolled}));
    const action = chase?.action?.key === actionKey(combat) ? chase.action : null;
    const npc = cur?.kind === 'traffic' || curC && !curC.hasPlayerOwner;
    // the movement gauge for whoever is driving on this die
    const vt = vehicleNow(combat); let gauge = null;
    if (vt?.actor) {
      const b = driveBands(vt.actor.system.vehicle), tally = tallyOf(vt, actionKey(combat)), moved = Number(tally.moved || 0), band = bandFor(moved, b), max = Math.max(1, b.red);
      gauge = {name: vt.name, moved: Math.round(moved * 10) / 10, green: b.green, yellow: b.yellow, red: b.red, band: band === 'over' ? 'red' : band, label: BAND_INFO[band === 'over' ? 'red' : band].short,
        pg: Math.round(100 * b.green / max), py: Math.round(100 * (b.yellow - b.green) / max), pr: Math.round(100 * (b.red - b.yellow) / max), at: Math.min(100, Math.round(100 * moved / max)),
        left: Math.max(0, Math.floor((b.red - moved) * 10) / 10), stopped: tally.stopped, burning: Boolean(vt.getFlag(NS, 'fire')), evasive: Boolean(vt.getFlag(NS, 'dodging'))};
    }
    const seat = seatOf(curToken);
    return {combat: true, isGM, canManage, pending, hasPending: pending.length > 0, npc, busy: action?.status === 'running', review: action?.status === 'review', canRunNPC: canManage && npc && !action && !pending.length, round: st.round || combat.round, phase: st.phase, phaseLabel: PHASE[st.phase] ?? st.phase, rows, gauge,
      chase: chase ? {auto: chaseMode(combat)!=='manual', mode:chaseMode(combat), error:chase.autopilotError, full:chaseMode(combat)==='full', assisted:chaseMode(combat)==='assisted', manual:chaseMode(combat)==='manual', reason: chase.reason || 'Chase'} : null, pendingDetails,
      queue: (st.queue || []).map((e, i) => ({...e, done: st.phase === 'resolve' ? i < st.cursor : true, now: st.phase === 'resolve' && i === st.cursor})),
      waiting: rows.filter(r => !r.rolled && !r.out).map(r => r.name).join(', '),
      current: cur && !curC ? {name: cur.kind === 'traffic' ? 'All civilian traffic' : cur.name, value: cur.value || '—', mine: canManage, npc: true, traffic: cur.kind === 'traffic', isVehicle: true} : curC ? {name: curC.name, value: cur.value, mine: mineNow, npc: Boolean(chase && !curC.hasPlayerOwner), police: Boolean(curToken?.getFlag(NS, 'police') || curActor?.system?.role === 'police'),
        driving: seat?.seatId === 'pilot', seated: Boolean(seat), isVehicle: curActor?.type === 'vehicle', person: Boolean(curActor?.isPerson),
        grabbed: conds.has('Grabbed'), weapons, cover: Object.entries(COVER).filter(([k]) => k !== 'full').map(([k, v]) => ({key: k, label: v.label.split(' (')[0]}))} : null};
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element, combat = this.combat;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).then(() => setTimeout(() => this.render(), 300)).catch(e => ui.notifications.warn(e.message)); }));
    const st = combat ? combatAPI.stateOf(combat) : null, cur = st?.queue?.[st.cursor], cc = cur ? combat.combatants.get(cur.cid) : null, tok = cc?.token;
    on('[data-start]', () => combatAPI.startFight([...(canvas.tokens.controlled ?? []), ...[...(game.user.targets ?? [])]]));
    on('[data-start-chase]', () => chaseAPI.start(canvas.scene));
    on('[data-chase-auto]', n => chaseAPI.auto(combat, n.dataset.chaseAuto === 'on'));
    on('[data-chase-mode]', n=>chaseAPI.mode(combat,n.dataset.chaseMode));
    on('[data-review-prompt]',async n=>{const [tokenId,pid]=String(n.dataset.reviewPrompt).split(':');
      const ok=await DialogV2.confirm({window:{title:'Certify saved driving outcome?'},content:'<p>Only confirm after checking the saved roll and manually verifying every effect (including damage and Heat) has already been applied. This will clear the stuck prompt WITHOUT rerolling or reapplying effects.</p>'});
      if(ok)return request('drive.reviewPrompt',{sceneId:combat.scene.id,tokenId,pid});});
    on('[data-cancel-prompt]',async n=>{const [tokenId,pid]=String(n.dataset.cancelPrompt).split(':');
      const ok=await DialogV2.confirm({window:{title:'Cancel unrolled obsolete check?'},content:'<p>The GM certifies that no dice were rolled for this prompt and that it is obsolete. Its card will be marked cancelled in the audit trail.</p>'});
      if(ok)return request('drive.cancelPrompt',{sceneId:combat.scene.id,tokenId,pid});});
    on('[data-npc-turn]', () => chaseAPI.npcTurn(combat));
    on('[data-end-chase]', async () => { if (await DialogV2.confirm({window: {title: 'Call off the chase?'}, content: '<p>End the chase and hand the map back to real time?</p>'})) return chaseAPI.end(combat); });
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
        case 'pit': return chaseAPI.pit(tok);
        case 'evasive': return chaseAPI.evasive(tok);
        case 'bail': return game.smoke.vehicles.exit(tok);
        case 'vsheet': return vehicleOf(tok)?.actor?.sheet.render(true);
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
// One redraw for a burst of changes (a chase action writes several documents in a row), and none for Street Life's
// every-second traffic and travel-meter writes, which used to redraw the open console constantly.
let refreshTimer = null;
const refresh = () => { if (!consoleApp?.rendered || refreshTimer) return; refreshTimer = setTimeout(() => { refreshTimer = null; if (consoleApp?.rendered) consoleApp.render(); }, 120); };
for (const h of ['updateCombat', 'updateCombatant', 'createCombat', 'deleteCombat', 'createCombatant', 'deleteCombatant']) Hooks.on(h, refresh);
Hooks.on('updateActor', refresh); Hooks.on('updateToken', (d, ch) => { if (chaseRelevantFlags(ch)) refresh(); });
Hooks.on('updateChatMessage', refresh); Hooks.on('deleteChatMessage', refresh); Hooks.on('pauseGame', refresh);
// A Combat Console button in the core combat tracker.
Hooks.on('renderCombatTracker', (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0]; if (!root || root.querySelector('.smoke-open-console')) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'smoke-open-console'; b.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Combat Console (speed dice)';
  b.addEventListener('click', ev => { ev.preventDefault(); openCombat(); });
  (root.querySelector('.combat-tracker-header') ?? root.querySelector('header') ?? root).prepend(b);
});
