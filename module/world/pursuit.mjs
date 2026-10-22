// One police decision at a time. The leader owns the response id and the roll result; the queue waits for it.
import {NS} from '../config.mjs';
import {clampHeat, isSuccess} from '../rules/core.mjs';
import {driveBands} from '../rules/driving.mjs';
import {registerHandler, request, card, esc, isLeader} from './net.mjs';
import {tokenCentre, distanceSquares} from './spawn.mjs';
import {chaseOf, actionKey, currentCombatant, vehicleOf, ridersOf, pendingAttacks} from './chase-state.mjs';
import {boardAsUser, exitAsUser, settlingMoves} from '../vehicles/vehicle-boarding.mjs';

const stopOf = t => t?.getFlag?.(NS, 'policeStop');
/** Is this token one of the chase's people (a combatant)? */
export const inChase = (combat, t) => Boolean(combat && t && combat.combatants?.some?.(c => c.tokenId === t.id));
const owns = (t, u) => u?.isGM || t?.actor?.testUserPermission?.(u, 'OWNER');
export const armedCrime = a => clampHeat(a?.system?.heat?.value) >= 4 && (a?.getFlag?.(NS, 'recentCrimes') || []).some(c => ['shooting', 'murder', 'copKiller'].includes(c.key));
const button = (t, s, choice, label, vehicleId = '') => `<button type="button" data-smoke-pursuit="${esc(t.uuid)}" data-response="${s.id}" data-choice="${choice}"${vehicleId ? ` data-vehicle="${vehicleId}"` : ''}>${label}</button>`;
async function markCard(s) { const m = s.messageId && game.messages.get(s.messageId); if (m) await m.setFlag(NS, 'promptDone', true); }
async function post(t, s, title, body, buttons) {
  const m = await card('POLICE · YOUR DECISION', title, `${body}<div class="smoke-buttons">${buttons}</div><p class="smoke-dim">Waiting for ${esc(t.name)} or the GM. Police and traffic hold until this is resolved.</p>`, 'heat', {flags: {[NS]: {policeDecision: {target: t.uuid, id: s.id}, chaseCombatId: s.combatId}}});
  await t.setFlag(NS, 'policeStop', {...s, messageId: m?.id ?? null});
}
/** Called by both roadside encounters and police turns. No repeating timer or expiration. */
export async function offerStop(t, unit, combat = chaseOf(t.parent)) {
  if (!t?.actor || !clampHeat(t.actor.system.heat?.value)) return;
  const previous=stopOf(t);
  if(previous){
    // Deleting/restarting a combat leaves an old stop token flag in saved worlds; replace it
    // rather than trapping the player behind an obsolete chat decision.
    if(previous.combatId && (!game.combats?.get?.(previous.combatId) || (combat && combat.id!==previous.combatId)))
      await clearStop(t,previous);
    else return;
  }
  const s = {id: foundry.utils.randomID(), unit: unit?.uuid ?? null, combatId: combat?.id ?? null, status: 'choice', talked: false};
  // Reserve before creating a card; another sight tick cannot create a duplicate.
  await t.setFlag(NS, 'policeStop', s);
  await post(t, s, `"Stop! Police!" — ${t.name}`, `<p>${esc(unit?.name ?? 'The police')} orders you to stop. Choose one response.</p>`,
    button(t, s, 'talk', 'Talk your way out · Front') + button(t, s, 'run', 'Make a break · Moves / Wheels') + button(t, s, 'surrender', 'Come quietly · arrested') + button(t, s, 'fight', 'Resist · fight'));
}
async function clearStop(t, s) { await markCard(s); await t.setFlag(NS, 'policeStop', null); await t.setFlag(NS, 'stopped', null); }
async function finishIfClear(combat) {
  if (!combat || !game.combats.get(combat.id)) return;
  const wanted = combat.combatants.some(c => c.actor?.type === 'character' && clampHeat(c.actor.system.heat?.value) > 0 && !c.actor.system.states?.surrendered && !(c.actor.items || []).some(i => i.type === 'condition' && ['Cuffed', 'Down'].includes(i.name)));
  if (!wanted) { const {endChase} = await import('./chase.mjs'); await endChase(combat, {escaped: true, why: 'No wanted characters remain in the chase.'}); }
}
/** A quick note to one player (and the leader's own screen if that is who asked). */
function tell(userId, text) {
  try { game.socket.emit(`system.${NS}`, {type: 'smokeWorld.notify', data: {text, userIds: [userId], level: 'info'}}); } catch (_e) {}
  if (userId === game.user?.id) ui.notifications?.info?.(text);
}
/** The escape move is over: the police recover, and either still see you or start searching. */
async function finishEscape(t, s, combat) {
  await clearStop(t, s);
  const body = vehicleOf(t) ?? t;
  const visible = t.parent.tokens.some(v => v.getFlag(NS, 'police') && distanceSquares(v, body) <= 14);
  if (!visible) {
    if (combat) await combat.update({[`flags.${NS}.chase.searching`]: true});
    else await t.parent.setFlag(NS, 'chaseCooldown', {until: Date.now() + 60000, last: {[t.actorId]: tokenCentre(body)}});
  }
  const moved = Math.round(Number(s.moved || 0) * 10) / 10;
  await card('ESCAPE MOVE', `${t.name}: ${visible ? 'still in sight' : 'out of sight'}`, `<p>${esc(t.name)} ${s.mode === 'vehicle' ? 'drives' : 'legs it'} ${moved} square${moved === 1 ? '' : 's'}. ${visible ? 'The police recover and the pursuit continues.' : 'The police search where they last saw you. Stay clear to lose the remaining stars.'} ${clampHeat(t.actor.system.heat?.value)}★ remaining.</p>`, 'chase');
  await finishIfClear(combat);
}
/**
 * After a vehicle's escape drive has used the whole allowance, finish it once the move has settled (its own world
 * action, never from inside another). Driving checks raised on the way keep it open until they are rolled.
 */
export function finishEscapeWhenSettled(t) {
  const s0 = stopOf(t); if (!s0 || s0.status !== 'escapeMove') return;
  let tries = 0;
  const go = () => {
    if (settlingMoves.size && tries++ < 60) { setTimeout(go, 100); return; }
    void request('chase.respond', {tokenUuid: t.uuid, responseId: s0.id, choice: 'finish'}).catch(error => console.info('The Smoke | escape move left open:', error.message));
  };
  setTimeout(go, 50);
}
async function escapeChoice(t, s, {lowerStar = true} = {}) {
  if (lowerStar) await t.actor.setHeat(clampHeat(t.actor.system.heat?.value) - 1, 'The police hesitate: one star lost and one chance to get away.');
  await markCard(s);
  const combat = s.combatId && game.combats.get(s.combatId);
  if (!clampHeat(t.actor.system.heat?.value)) { await clearStop(t, s); await card('CLEAR', `${t.name}: zero stars`, '<p>The police stand down. You are free to go.</p>', 'win'); await finishIfClear(combat); return; }
  const next = {...s, status: 'escapeChoice', messageId: null};
  const current = vehicleOf(t);
  const vehicles = t.parent.tokens.filter(v => v.actor?.type === 'vehicle' && !v.actor.system.vehicle.destroyed && !v.getFlag(NS, 'fire') && (v.id === current?.id || (!v.getFlag(NS, 'locked') && v.getFlag(NS, 'traffic')?.kind !== 'moving' && !ridersOf(v).some(r => r.seatId === 'pilot') && distanceSquares(t, v) <= 3)));
  await post(t, next, `${t.name}: one opening`, '<p>The officers fumble. Choose <b>one</b> escape move; nobody else acts during it. You can leave on foot or drive an accessible motor. After that the pursuit resumes.</p>',
    button(t, next, 'foot', 'Escape on foot · 6 squares') + vehicles.map(v => button(t, next, 'vehicle', `Drive ${esc(v.name)} · safe speed`, v.id)).join(''));
}
async function enforce(t, s, userId) {
  if (!armedCrime(t.actor)) {
    await clearStop(t, s);
    const {busted} = await import('./heat.mjs'); await busted(t.actor);
    await finishIfClear(s.combatId && game.combats.get(s.combatId));
    return;
  }
  // Violent, armed crimes bring a single attack, with Take hit / Dodge. It cannot roll straight into another shot.
  const next = {...s, status: 'enforcement', talked: true}; await t.setFlag(NS, 'policeStop', next);
  const {shootFromCar} = await import('./chase.mjs');
  const unit = s.unit && await fromUuid(s.unit);
  if (unit) await shootFromCar(unit, vehicleOf(t) ?? t, t, {combatId: s.combatId});
  await post(t, {...next, status: 'choice'}, 'Armed response — decide what you do', '<p>Your failed escape or bluff has brought armed enforcement for a recorded gun crime or killing. Resolve any incoming hit, then surrender, flee, or resist.</p>',
    button(t, s, 'surrender', 'Surrender · arrested') + button(t, s, 'run', 'Flee · Moves / Wheels') + button(t, s, 'fight', 'Resist · fight'));
}
registerHandler('chase.respond', async ({tokenUuid, responseId, choice, vehicleId, userId}) => {
  const t = await fromUuid(tokenUuid), s = stopOf(t), u = game.users.get(userId);
  if (!t || !owns(t, u)) throw new Error('Only this character’s owner or the GM can respond.');
  if (game.paused) throw new Error('The game is paused.');
  if (!s || s.id !== responseId) throw new Error('That decision is no longer active.');
  const combat = s.combatId && game.combats.get(s.combatId);
  if(s.combatId && !combat){
    await clearStop(t,s);
    throw new Error('That police decision belonged to a combat which has ended. Wait for a new police stop.');
  }
  // A hit on some OTHER person on this street does not prevent this character talking, fleeing or surrendering.
  // Likewise, ignore old chat cards linked to a previous fight. Only a current hit on them or their motor blocks.
  const targets=new Set([t.uuid,vehicleOf(t)?.uuid].filter(Boolean));
  const hit=pendingAttacks(t.parent,combat?.id).find(m=>targets.has(String(m.getFlag(NS,'attack')?.target||'')));
  if(hit)throw new Error(`Resolve the incoming hit on ${t.name} first (chat card ${hit.id}), then choose a police response.`);
  if (choice === 'finish') {
    if (s.status !== 'escapeMove') throw new Error('Choose an escape method first.');
    // The opening is spent by moving, not by the button: a player has to move before it ends (the GM can call it).
    if (!u.isGM && Number(s.moved || 0) < 0.5) throw new Error(`Move first: drag ${s.mode === 'vehicle' ? 'the vehicle' : t.name} up to ${s.max} squares — the ring on the map shows how far — then press Done moving.`);
    if (settlingMoves.size) throw new Error('Wait for the driving manoeuvre to finish.');
    if (Object.keys((vehicleOf(t) ?? t).getFlag(NS, 'prompts') || {}).length) throw new Error('Resolve the driving check first.');
    return finishEscape(t, s, combat);
  }
  if (['foot', 'vehicle'].includes(choice)) {
    if (s.status !== 'escapeChoice') throw new Error('That escape opportunity has already been used.');
    if (choice === 'foot' && vehicleOf(t)) await exitAsUser(t, userId);
    if (choice === 'vehicle') {
      const vt = t.parent.tokens.get(vehicleId);
      if (!vt || vt.actor?.type !== 'vehicle' || vt.actor.system.vehicle.destroyed || vt.getFlag(NS, 'fire')) throw new Error('Choose an accessible, working vehicle.');
      if (vehicleOf(t)?.id !== vt.id || t.getFlag(NS, 'vehicleSeat')?.seatId !== 'pilot') {
        if (vt.getFlag(NS, 'locked')) throw new Error('That vehicle is locked.');
        await boardAsUser(vt, t, 'pilot', userId);
      }
      if (vehicleOf(t)?.id !== vt.id || t.getFlag(NS, 'vehicleSeat')?.seatId !== 'pilot') throw new Error('You must be in the driving seat.');
    }
    await markCard(s);
    const body = vehicleOf(t) ?? t, max = choice === 'vehicle' ? driveBands(body.actor.system.vehicle).green : 6;
    const next = {...s, status: 'escapeMove', mode: choice, vehicleId: choice === 'vehicle' ? body.id : null, max, moved: 0, origin: tokenCentre(body), messageId: null};
    await post(t, next, `${t.name}: take your escape move`, `<p><b>Drag ${choice === 'vehicle' ? esc(body.name) : esc(t.name)} now</b> — up to <b>${max} squares</b>, even though it isn't your die. The ring on the map shows how far you can get. Police and traffic wait. The escape ends when you've used all ${max} squares, or press <b>Done moving</b> once you're where you want to be.</p>`, button(t, next, 'finish', 'Done moving — finish the escape'));
    return;
  }
  if (s.status !== 'choice') throw new Error('Finish the current police decision first.');
  if (!['talk', 'run', 'surrender', 'fight'].includes(choice)) throw new Error('Unknown police response.');
  if (choice === 'talk' && s.talked) throw new Error('You already tried talking at this stop.');
  if (choice === 'surrender') { await clearStop(t, s); const {busted} = await import('./heat.mjs'); await busted(t.actor); await finishIfClear(combat); return; }
  if (choice === 'fight') {
    await clearStop(t, s);
    await t.setFlag(NS, 'policeResisted', true);
    const {policeFightNow} = await import('../combat/combat.mjs');
    return policeFightNow(t);
  }
  await t.setFlag(NS, 'policeStop', {...s, status: 'rolling'});
  let out;
  try {
    const vt = vehicleOf(t), driving = vt && t.getFlag(NS, 'vehicleSeat')?.seatId === 'pilot';
    out = await t.actor.rollStat(choice === 'talk' ? 'frt' : driving ? 'whl' : 'mov', {band: choice === 'talk' ? (clampHeat(t.actor.system.heat.value) >= 3 ? 'miracle' : 'hard') : (clampHeat(t.actor.system.heat.value) >= 3 ? 'hard' : 'medium'), label: choice === 'talk' ? 'Talk your way out' : 'Make a break', sceneId: t.parent.id, tokenId: t.id, requestedBy: userId});
  } catch (error) { await t.setFlag(NS, 'policeStop', s); throw error; }
  if (!out?.result) { await t.setFlag(NS, 'policeStop', s); return; }
  await markCard(s);
  if (isSuccess(out.result.outcomeKey)) return escapeChoice(t, {...s, talked: s.talked || choice === 'talk'});
  return enforce(t, {...s, talked: s.talked || choice === 'talk'}, userId);
});

// Foot movement in a chase (and the one-off escape move) uses the same authoritative turn checks as a vehicle.
registerHandler('chase.footMove', async ({tokenUuid, x, y, userId}) => {
  const t = await fromUuid(tokenUuid), u = game.users.get(userId); if (!t || !owns(t, u) || t.actor?.type !== 'character') throw new Error('Not your character.');
  if (![x, y].every(Number.isFinite) || game.paused) throw new Error('Invalid movement, or the game is paused.');
  if (vehicleOf(t)) throw new Error('Get out of the vehicle first.');
  const s = stopOf(t), combat = chaseOf(t.parent), escape = s?.status === 'escapeMove' && s.mode === 'foot';
  // Only people in the chase (or under a police stop) move on the chase's terms; anyone else on the map walks freely.
  if (!s && !inChase(combat, t)) { await t.update({x: Math.round(x), y: Math.round(y)}, {smokeFootMove: true}); return; }
  // The escaper moves now, whoever's die it is (and even if someone else's police card is open). Anyone else waits.
  if (!escape) {
    if (s) throw new Error(s.status === 'escapeChoice' ? 'Choose how you escape on the police card in chat first.' : 'Answer the police card in chat first.');
    if (t.parent.tokens.some(v => stopOf(v) && inChase(combat, v))) throw new Error('Wait for the police decision to be resolved.');
    if (!combat || currentCombatant(combat).combatant?.tokenId !== t.id) throw new Error('Wait for your own turn.');
  }
  const key = actionKey(combat), old = t.getFlag(NS, 'walk'), tally = escape ? s : old?.key === key ? old : {key, moved: 0};
  const g = t.parent.grid.size, max = escape ? Number(s.max) : 6, used = Number(tally.moved || 0), left = max - used;
  let dist = Math.hypot(x - t.x, y - t.y) / g;
  if (left < 0.5) throw new Error(escape ? 'No squares left in this escape move.' : 'No squares left this action.');
  // Too far: go as far as the squares allow, along the line of the drag (whole squares on a grid).
  if (dist > left + 0.25) {
    const reach = Math.max(0.5, Math.floor(left + 0.25)), k = reach / dist;
    x = t.x + (x - t.x) * k; y = t.y + (y - t.y) * k;
    if (t.x % g === 0 && t.y % g === 0) { x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
    dist = Math.hypot(x - t.x, y - t.y) / g;
    tell(userId, `${t.name} gets ${Math.floor(left + 0.25)} square${Math.floor(left + 0.25) === 1 ? '' : 's'}${escape ? ' of escape' : ' this action'}: moved as far as that goes.`);
  }
  const moved = used + dist;
  await t.update({x: Math.round(x), y: Math.round(y), [`flags.${NS}.${escape ? 'policeStop' : 'walk'}`]: {...tally, moved}}, {smokeFootMove: true});
  // Every square used: the escape is over without needing the button.
  if (escape && max - moved < 1) return finishEscape(t, {...s, moved}, s.combatId && game.combats.get(s.combatId));
});
export function installPursuit() {
  // Foundry's End Combat/delete leaves chat cards behind for reference. Release this encounter's
  // token stops and close its choice cards; never clear a genuine ongoing stop from another fight.
  Hooks.on('deleteCombat', combat => {
    if(!isLeader())return;
    for(const t of combat?.scene?.tokens??[]){
      const stop=stopOf(t);
      if(stop?.combatId===combat.id)void clearStop(t,stop).catch(e=>console.warn('The Smoke | clearing finished police stop',e));
    }
  });
  Hooks.on('preUpdateToken', (t, ch, options) => {
    if (options?.smokeFootMove || options?.acVehicleCarry || options?.acTransit || t.actor?.type !== 'character' || vehicleOf(t) || !['x', 'y'].some(k => Object.hasOwn(ch, k))) return;
    // A chase on the map only holds up the people in it (or anyone the police have stopped); everyone else walks freely.
    if (!stopOf(t) && !inChase(chaseOf(t.parent), t)) return;
    if (game.user.isGM && game.keyboard?.isModifierActive?.('Alt')) return;
    void request('chase.footMove', {tokenUuid: t.uuid, x: Number(ch.x ?? t.x), y: Number(ch.y ?? t.y)}).catch(e => ui.notifications.warn(e.message));
    return false;
  });
}
export const pursuitAPI = {offerStop, respond: (tokenUuid, responseId, choice, vehicleId = null) => request('chase.respond', {tokenUuid, responseId, choice, vehicleId})};
