// Combat in Foundry: speed-dice rounds on the core Combat document, attacks with ranges/cover/ammo, grabs and arrests,
// ramming and tyres, cover and dodging, round-end bleeding and burning, and police officers who take their own turns.
// Every write that touches someone else's document runs on the leader GM.
import {NS, CRIMES} from '../config.mjs';
import {clampHeat, damageConsequences, isSuccess} from '../rules/core.mjs';
import {roundDamage} from '../rules/conditions.mjs';
import * as R from './rules.mjs';
import {registerHandler, request, card, esc, ownersOf, isLeader} from '../world/net.mjs';
import {distanceSquares, tokenCentre, ensurePersonActor, placeToken} from '../world/spawn.mjs';
import {reload as reloadWeapon} from '../world/items.mjs';
import {vehicleSpeedDice} from '../rules/driving.mjs';
import {canManageChase, civilianTraffic, pendingResponses, chaseMode, actionKey} from '../world/chase-state.mjs';
import {settlingMoves} from '../vehicles/vehicle-boarding.mjs';
import {deployPoliceCrew} from '../world/traffic-crew.mjs';

const {DialogV2} = foundry.applications.api;
const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
const condNames = actor => (actor?.items ?? []).filter(i => i.type === 'condition').map(i => i.name);
const stateOf = combat => combat?.getFlag?.(NS, 'state') ?? {phase: 'idle', round: 0, queue: [], cursor: 0};
const speedOf = c => c?.getFlag?.(NS, 'speed') ?? {count: 0, results: [], rolled: false, locked: false};
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const isPC = actor => actor?.type === 'character';
const combatOnScene = scene => game.combats.find(c => c.scene?.id === scene.id && c.getFlag(NS, 'chase'));
export const seatOf = token => token?.getFlag?.(NS, 'vehicleSeat') ?? null;
/** Where a token really is: riders are wherever their vehicle is. */
export const bodyOf = token => { const s = seatOf(token); return s ? token.parent.tokens.get(s.vehicleTokenId) ?? token : token; };
export const rangeBetween = (a, b) => distanceSquares(bodyOf(a), bodyOf(b));

export function registerCombatSettings() {
  const reg = (k, o) => { try { game.settings.register(NS, k, {scope: 'world', config: true, ...o}); } catch (_e) {} };
  reg('combatAutoDamage', {name: 'Combat: apply damage automatically', hint: 'On: hits apply damage and Conditions as soon as the attack is rolled. Off (default): the target\'s owner or the GM chooses Take hit or Dodge (their reaction), then the GM picks at most one condition.', type: Boolean, default: false});
  reg('combatAutoHeat', {name: 'Combat: witnessed crimes add Heat', hint: 'A character who attacks someone with witnesses or police nearby gains Heat for it automatically.', type: Boolean, default: true});
}

/* ------------------------------------------------------------------ starting a fight */
/** Start (or join) a fight with these tokens on this scene, and open the first round. */
export async function startFight(tokens, scene = canvas.scene) {
  if (!game.user.isGM) throw new Error('The GM starts fights.');
  const list = [...new Set(tokens.map(t => t.document ?? t))].filter(t => t.actor && t.actor.type !== 'vehicle');
  if (!list.length) throw new Error('Select the tokens in the fight (or target them).');
  let combat = game.combats.find(c => c.scene?.id === scene.id && c.active) ?? game.combats.find(c => c.scene?.id === scene.id);
  if (!combat) combat = await (CONFIG.Combat?.documentClass ?? getDocumentClass('Combat')).create({scene: scene.id, active: true});
  const have = new Set(combat.combatants.map(c => c.tokenId));
  const add = list.filter(t => !have.has(t.id)).map(t => ({tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: t.hidden}));
  if (add.length) await combat.createEmbeddedDocuments('Combatant', add);
  await request('combat.begin', {combatId: combat.id});
  return combat;
}

/* ------------------------------------------------------------------ speed dice */
/** A player rolls their combatant's speed dice, whispered to themselves and the GM. */
export async function rollSpeed(combatant) {
  const sp = speedOf(combatant); if (!sp.count) throw new Error(`${combatant.name} cannot act this round.`);
  if (sp.rolled) throw new Error('Already rolled.');
  const roll = await new Roll(`${sp.count}d6`).evaluate();
  const msg = await ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({token: combatant.token}), rolls: [roll], whisper: [...new Set([game.user.id, ...gmIds()])],
    content: `<section class="smoke-card"><header><span class="kicker">SPEED DICE · PRIVATE</span><strong>${esc(combatant.name)}</strong></header><div class="smoke-dice">${roll.dice[0].results.map(r => `<span class="smoke-die">${r.result}</span>`).join('')}</div></section>`,
    flags: {[NS]: {speedRoll: {combatId: combatant.parent.id, combatantId: combatant.id}}}});
  return request('combat.speed', {combatId: combatant.parent.id, combatantId: combatant.id, messageId: msg.id});
}
const diceOf = message => (message?.rolls?.[0]?.dice?.[0]?.results ?? []).filter(r => r.active !== false).map(r => Number(r.result));

/* ------------------------------------------------------------------ attacks */
async function pickTarget(attackerToken, {title = 'Who?', includeVehicles = true} = {}) {
  const targeted = [...(game.user.targets ?? [])].map(t => t.document).filter(t => t.id !== attackerToken.id);
  if (targeted.length === 1) return targeted[0];
  const pool = (targeted.length ? targeted : attackerToken.parent.tokens.filter(t => t.id !== attackerToken.id && t.actor && (includeVehicles || t.actor.type !== 'vehicle') && !t.hidden && seatOf(t)?.vehicleTokenId !== attackerToken.id))
    .map(t => ({t, d: rangeBetween(attackerToken, t)})).sort((a, b) => a.d - b.d).slice(0, 25);
  if (!pool.length) throw new Error('Nobody to target.');
  const form = await DialogV2.input({window: {title}, content: `<select name="t">${pool.map(({t, d}) => `<option value="${t.id}">${esc(t.name)} — ${R.rangeBand(d)} (${Math.round(d)} sq)</option>`).join('')}</select>`});
  return pool.find(p => p.t.id === form?.t)?.t ?? null;
}
/** Everything about a target's defence. */
export function defenceOf(targetToken) {
  const a = targetToken.actor;
  if (a?.type === 'vehicle') return {guard: R.vehicleGuard(a.system.vehicle.size) + (targetToken.getFlag?.(NS, 'dodging') ? 2 : 0), armour: Number(a.system.vehicle.armour || 0), isVehicle: true};
  const seat = seatOf(targetToken), vt = seat ? targetToken.parent.tokens.get(seat.vehicleTokenId) : null;
  const inside = Boolean(vt && !(vt.actor?.getFlag?.(NS, 'vehicleAbilities') || []).some(x => x.key === 'exposed'));
  return {guard: Number(a?.system?.guard?.value ?? 9), armour: Number(a?.system?.armour || 0), cover: targetToken.getFlag(NS, 'cover') || 'none', inside, dodging: Boolean(targetToken.getFlag(NS, 'dodging'))};
}
/**
 * Attack someone. Opens a short dialog (weapon, target, burst, aim, tyres), checks the plan, spends the ammo, rolls
 * against Guard, and sends the hit to the leader GM to apply.
 */
export async function attack(attackerToken, {weapon = null, target = null, auto = false} = {}) {
  const actor = attackerToken.actor; if (!actor?.isOwner) throw new Error('Not your character.');
  const weapons = actor.items.filter(i => i.type === 'weapon');
  target ??= await pickTarget(attackerToken, {title: `${actor.name}: attack who?`}); if (!target) return null;
  const d = rangeBetween(attackerToken, target), band = R.rangeBand(d), def = defenceOf(target);
  const usable = weapons.filter(w => R.attackPlan({weapon: w.system, distance: d}).ok || R.attackPlan({weapon: w.system, distance: d}).needsReload);
  const choices = usable.length ? usable : weapons;
  const content = `<div class="smoke-roll-dialog"><p><b>${esc(target.name)}</b> — ${band} (${Math.round(d)} squares)${def.cover && def.cover !== 'none' && R.COVER[def.cover] ? ` · ${esc(R.COVER[def.cover].label.split(' (')[0])}` : ''}</p>
    <label>Weapon <select name="w">${choices.map(w => `<option value="${w.id}" ${weapon?.id === w.id ? 'selected' : ''}>${esc(w.name)} (${w.system.range}${Number(w.system.ammo?.max) ? ` · ${w.system.ammo.value}/${w.system.ammo.max}` : ''}${w.system.thrown ? ` · ×${w.system.quantity}` : ''})</option>`).join('')}</select></label>
    <label><input type="checkbox" name="burst"> Fire a burst (+2 impact, 3 rounds)</label>
    <label><input type="checkbox" name="aimed" ${attackerToken.getFlag(NS, 'aiming') ? 'checked' : ''}> Aimed (spent an action aiming)</label>
    ${def.isVehicle ? '<label><input type="checkbox" name="tyres"> Go for the tyres (−2; a hit flattens one)</label>' : ''}
    <label>Hustle <select name="hustle"><option value="0">none</option><option value="1">1 — Effort die up a step</option><option value="2">2 — On a Roll</option></select></label></div>`;
  const form = auto && weapon ? {w: weapon.id} : await DialogV2.input({window: {title: `${actor.name} attacks`}, content, ok: {label: 'Attack', icon: 'fa-solid fa-crosshairs'}});
  if (!form) return null;
  const w = actor.items.get(form.w) ?? weapons.find(x => x.name === 'Fists'); if (!w) throw new Error('No weapon.');
  const seat = seatOf(attackerToken);
  const plan = R.attackPlan({weapon: w.system, distance: d, cover: def.cover, burst: Boolean(form.burst), aimed: Boolean(form.aimed || attackerToken.getFlag(NS, 'aiming')),
    seat: seat ? (seat.seatId === 'pilot' ? 'pilot' : 'passenger') : null, targetInVehicle: def.inside, dodging: def.dodging, tyres: Boolean(form.tyres)});
  if (!plan.ok) { if (plan.needsReload) ui.notifications.warn(`${w.name}: ${plan.reason}`); else ui.notifications.warn(plan.reason); return null; }
  // spend ammo / the thrown thing, and the aim
  if (plan.ammoCost) await w.update({'system.ammo.value': Number(w.system.ammo.value) - plan.ammoCost});
  if (w.system.thrown) { const left = Number(w.system.quantity || 1) - 1; if (left <= 0) await w.delete(); else await w.update({'system.quantity': left}); }
  if (attackerToken.getFlag(NS, 'aiming')) await request('combat.flag', {tokenUuid: attackerToken.uuid, key: 'aiming', value: false});
  const tn = def.guard + plan.guardBonus;
  const out = await actor.rollStat(w.system.stat || 'mus', {tn, modifier: plan.modifier, effortUpgrades: plan.effortUpgrades, hustle: Number(form.hustle || 0),
    label: `${w.name} → ${target.name}${form.burst ? ' (burst)' : ''}${form.tyres ? ' (tyres)' : ''}`, context: {kind: 'attack', weapon: w.name, target: target.uuid},
    cardExtra: plan.notes.length ? `<ul class="smoke-notes">${plan.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''});
  if (!out?.result) return null;
  const r = out.result, hit = r.margin != null && r.margin >= 0;
  if (w.name === 'Converted Pistol' && r.outcomeKey === 'severeFailure') { await w.update({'system.ammo.value': 0}); ui.notifications.warn('The Converted Pistol jams. Reload to clear it.'); }
  return request('combat.hit', {attackerTokenUuid: attackerToken.uuid, targetTokenUuid: target.uuid, weaponName: w.name, weaponCrime: w.system.crime, effect: w.system.effect, loud: w.system.loud,
    hit, margin: r.margin, total: r.total, outcomeKey: r.outcomeKey, explosions: r.explosions, impact: plan.impact, armourBonus: plan.armourBonus, tyres: Boolean(form.tyres), band: plan.band});
}

/* ------------------------------------------------------------------ hands-on: grab, break free, cuff */
export async function grab(attackerToken, target = null) {
  target ??= await pickTarget(attackerToken, {title: 'Grab who?', includeVehicles: false}); if (!target) return null;
  if (rangeBetween(attackerToken, target) > R.RANGE_SQUARES.Engaged) throw new Error('Get hold of them first: you need to be Engaged.');
  const out = await attackerToken.actor.rollStat('mus', {tn: defenceOf(target).guard, label: `Grab ${target.name}`, context: {kind: 'grab', target: target.uuid}});
  if (out?.result && isSuccess(out.result.outcomeKey)) return request('combat.grab', {attackerTokenUuid: attackerToken.uuid, targetTokenUuid: target.uuid});
  return null;
}
export async function breakFree(token) {
  const by = token.parent.tokens.get(token.getFlag(NS, 'grabbedBy'));
  const stat = await DialogV2.wait({window: {title: 'Break free'}, content: `<p>Break ${by ? `${esc(by.name)}'s` : 'the'} hold.</p>`, buttons: [{action: 'mus', label: 'Wrench free (Muscle)'}, {action: 'mov', label: 'Twist out (Moves)'}]});
  if (!['mus', 'mov'].includes(stat)) return null;
  const out = await token.actor.rollStat(stat, {tn: by ? defenceOf(by).guard : 9, label: 'Break free'});
  if (out?.result && isSuccess(out.result.outcomeKey)) return request('combat.release', {tokenUuid: token.uuid});
  return null;
}
export async function cuff(attackerToken, target = null) {
  target ??= await pickTarget(attackerToken, {title: 'Cuff who?', includeVehicles: false}); if (!target) return null;
  if (rangeBetween(attackerToken, target) > R.RANGE_SQUARES.Engaged) throw new Error('You need to be Engaged to cuff someone.');
  const t = target.actor; if (!R.cuffable({conditions: condNames(t), surrendered: t.system.states?.surrendered})) throw new Error(`${target.name} has to be grabbed, down, stunned or surrendered first.`);
  const easy = t.system.states?.surrendered || condNames(t).includes('Down');
  if (!easy) { const out = await attackerToken.actor.rollStat('mus', {tn: defenceOf(target).guard - 2, label: `Cuff ${target.name}`}); if (!out?.result || !isSuccess(out.result.outcomeKey)) return null; }
  return request('combat.cuff', {attackerTokenUuid: attackerToken.uuid, targetTokenUuid: target.uuid});
}

/* ------------------------------------------------------------------ vehicles: ramming */
export async function ram(driverToken, target = null) {
  const vt = bodyOf(driverToken); if (vt === driverToken || seatOf(driverToken)?.seatId !== 'pilot') throw new Error('You have to be driving.');
  target ??= await pickTarget(driverToken, {title: 'Ram what?'}); if (!target) return null;
  if (distanceSquares(vt, bodyOf(target)) > 4) throw new Error('Too far away to ram: get within a few squares.');
  const out = await driverToken.actor.rollStat('whl', {tn: defenceOf(target).guard, label: `Ram ${target.name}`, context: {kind: 'ram', target: target.uuid}});
  if (!out?.result) return null;
  return request('combat.ram', {vehicleTokenUuid: vt.uuid, driverTokenUuid: driverToken.uuid, targetTokenUuid: target.uuid, margin: out.result.margin, hit: out.result.margin >= 0});
}

/* ------------------------------------------------------------------ the police take their turn */
export async function policeTurn(officerToken) {
  if (!game.user.isGM) throw new Error('GM only.');
  // A police car on the tracker: in a chase it drives on its dice; in a fight it drives in, then the officers get out.
  if (officerToken.actor?.type === 'vehicle') {
    const combat = game.combats.find(c => c.combatants.some(x => x.tokenId === officerToken.id)); if (!combat) return null;
    const chase = await import('../world/chase.mjs');
    return combat.getFlag(NS, 'chase') ? chase.npcTurn(combat, combat.combatants.find(x => x.tokenId === officerToken.id)) : chase.policeUnitInFight(combat, officerToken);
  }
  const scene = officerToken.parent, a = officerToken.actor;
  const targets = scene.tokens.filter(t => isPC(t.actor) && clampHeat(t.actor.system.heat?.value) > 0 && !condNames(t.actor).some(c => ['Cuffed', 'Down'].includes(c))).map(t => ({t, d: rangeBetween(officerToken, t)})).sort((x, y) => (clampHeat(y.t.actor.system.heat?.value) - clampHeat(x.t.actor.system.heat?.value)) || x.d - y.d);
  const pick = targets[0]; if (!pick) return card('POLICE', officerToken.name, '<p>Nobody to nick.</p>');
  if (pick.t.getFlag(NS, 'policeStop')) return;
  const {offerStop, armedCrime} = await import('../world/pursuit.mjs');
  if (pick.d <= 4 && !pick.t.getFlag(NS, 'policeResisted') && !pick.t.actor.system.states?.surrendered) return offerStop(pick.t, officerToken);
  const heat = clampHeat(pick.t.actor.system.heat?.value);
  const weapons = a.items.filter(i => i.type === 'weapon').map(i => ({...i.system, name: i.name}));
  const choice = R.policeChoice({heat, distance: pick.d, target: {conditions: condNames(pick.t.actor), surrendered: pick.t.actor.system.states?.surrendered, armed: armedCrime(pick.t.actor)}, weapons});
  await card('POLICE', `${officerToken.name}: ${choice.act}`, `<p>${esc(choice.why)}</p>`, 'heat', {whisper: gmIds()});
  if (choice.act === 'move' || choice.act === 'cuff' && pick.d > R.RANGE_SQUARES.Engaged) await moveToward(officerToken, pick.t, 6);
  if (choice.act === 'cuff') return cuff(officerToken, pick.t);
  if (choice.act === 'grab') return grab(officerToken, pick.t);
  if (choice.act === 'attack') { const w = a.items.find(i => i.name === choice.weapon); if (Number(w?.system.ammo?.max) && !Number(w.system.ammo.value)) await reloadWeapon(a, w).catch(() => null); return attack(officerToken, {weapon: w, target: pick.t, auto: true}); }
  if (choice.act === 'shout') return offerStop(pick.t, officerToken);
  return null;
}
async function moveToward(token, target, squares) {
  const g = token.parent.grid.size, [ax, ay] = tokenCentre(token), [bx, by] = tokenCentre(bodyOf(target)), dist = Math.hypot(bx - ax, by - ay);
  const step = Math.max(0, Math.min(squares * g, dist - g * 1.1)); if (!step) return;
  return token.update({x: Math.round(token.x + (bx - ax) / dist * step), y: Math.round(token.y + (by - ay) / dist * step)});
}
/** A police stop becomes a fight: officers get out of the unit next to the character, and the round begins. */
export async function policeFight(characterToken) {
  if (!game.user.isGM) throw new Error('GM only.');
  return request('combat.policeFight', {tokenUuid: characterToken.uuid});
}

/* ------------------------------------------------------------------ simple actions */
export const takeCover = (token, level) => request('combat.flag', {tokenUuid: token.uuid, key: 'cover', value: level});
export const aim = token => request('combat.flag', {tokenUuid: token.uuid, key: 'aiming', value: true});
export const dodge = token => request('combat.flag', {tokenUuid: token.uuid, key: 'dodging', value: true});
export const surrender = token => request('combat.surrender', {tokenUuid: token.uuid});

/* ------------------------------------------------------------------ leader handlers */
const okFor = (userId, doc) => { const u = game.users.get(userId); return u?.isGM || doc?.actor?.testUserPermission?.(u, 'OWNER') || doc?.testUserPermission?.(u, 'OWNER'); };
const witnesses = (scene, token) => scene.tokens.some(t => t.id !== token.id && t.actor?.type === 'npc' && !t.hidden && distanceSquares(t, token) <= 12);
const policeAround = (scene, token) => scene.tokens.some(t => (t.getFlag(NS, 'police') || t.actor?.system?.role === 'police') && t.id !== token.id && distanceSquares(t, token) <= 14);
async function postBoard(combat, title, body) { return card('COMBAT', title, body, 'combat'); }

/**
 * Speed dice this round. People roll by their Moves; a vehicle in a chase (a police unit, passing traffic) by its
 * Performance die; whoever is driving rolls the better of their own and their motor's.
 */
export function speedCountFor(c) { return speedFor(c).count; }
/**
 * A surrender holds for the fight it was made in and nothing after it. (Up to 0.5.16 it was a bare switch on the
 * character that only the GM's End Fight button turned off: end a fight any other way — a chase ending, the core
 * tracker, Busted, Wasted — and the character sat OUT of every fight afterwards, rest or no rest.)
 */
export const surrenderedIn = (actor, combat) => Boolean(actor?.system?.states?.surrendered) && Boolean(combat?.id) && actor.getFlag?.(NS, 'surrenderedIn') === combat.id;
/** Speed dice this round and, when there are none, why: {count, why}. */
export function speedFor(c) {
  const a = c?.actor; if (!a) return {count: 0, why: 'No character'};
  if (a.type === 'vehicle') {
    const t = c.token, chase = c.parent?.getFlag?.(NS, 'chase');
    if (chase && chase.trafficMode !== 'individual' && civilianTraffic(c.parent.scene).some(v => v.id === t?.id)) return {count: 0, why: 'Traffic phase'};
    if (t?.getFlag?.(NS, 'fire')) return {count: 0, why: 'On fire'};
    if (t?.getFlag?.(NS, 'police')?.parked) return {count: 0, why: 'Parked'};
    return {count: vehicleSpeedDice(a.system.vehicle), why: ''};
  }
  const conditions = condNames(a), surrendered = surrenderedIn(a, c.parent);
  const why = R.speedDiceBlock({conditions, surrendered}); if (why) return {count: 0, why};
  const own = R.speedDiceCount({movDie: a.system.stats?.mov?.die ?? 4, conditions, surrendered});
  const seat = seatOf(c.token), vt = seat?.seatId === 'pilot' ? c.token.parent?.tokens?.get(seat.vehicleTokenId) : null;
  return {count: vt?.actor ? Math.max(own, vehicleSpeedDice(vt.actor.system.vehicle)) : own, why: ''};
}
const dealt = c => { const {count, why} = speedFor(c); return {count, why, results: [], lost: [], stunned: 0, rolled: !count, locked: !count}; };   // every key, so nothing from last round survives Foundry's flag merge
/**
 * Someone who joins while the dice are being rolled (police piling out, a unit catching up) is dealt in at once;
 * anyone joining after the reveal waits for the next round. Runs on the leader.
 */
export async function dealIn(c) {
  const combat = c?.parent; if (!combat || c.getFlag?.(NS, 'speed')) return null;
  if (stateOf(combat).phase !== 'intent') return null;
  const sp = dealt(c); await c.update({[`flags.${NS}.speed`]: sp}); return sp;
}
/**
 * Stunned part-way through a round: their lowest die still to come is lost (minimum one die a round). Before the
 * reveal it comes off the dice they roll. Runs on the leader.
 */
export async function stunSpeed(combat, c) {
  const st = stateOf(combat), sp = speedOf(c); if (!c || !sp.count) return false;
  if (st.phase === 'intent') {
    if (sp.count < 2 || sp.stunned === st.round) return false;
    if (!sp.rolled) { await c.update({[`flags.${NS}.speed`]: {...sp, count: sp.count - 1, stunned: st.round}}); return true; }
    const results = [...sp.results], low = results.indexOf(Math.min(...results)); results.splice(low, 1);
    await c.update({[`flags.${NS}.speed`]: {...sp, count: results.length, results, stunned: st.round}}); return true;
  }
  if (st.phase !== 'resolve' || sp.stunned === st.round) return false;
  const drop = R.stunnedDrop(st.queue, st.cursor, c.id); if (drop < 0) return false;
  const gone = st.queue[drop], queue = st.queue.filter((_e, i) => i !== drop);
  await c.update({[`flags.${NS}.speed`]: {...sp, lost: [...(sp.lost || []), gone.die], stunned: st.round}});
  await combat.update({[`flags.${NS}.state`]: {...st, queue}});
  await card('STUNNED', `${c.name} loses a die`, `<p>Stunned: their ${gone.value} comes out of this round's order.</p>`, 'combat');
  return true;
}
// Both run in the world queue (never alongside a Done or a reveal that is moving the same round on).
registerHandler('combat.dealIn', async ({combatId, combatantId, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const combat = game.combats.get(combatId); return dealIn(combat?.combatants.get(combatantId));
});
registerHandler('combat.stunned', async ({actorUuid, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  for (const combat of game.combats ?? []) for (const c of combat.combatants ?? []) if (c.actor?.uuid === actorUuid) await stunSpeed(combat, c);
});
let combatHooks = false;
export function installCombat() {
  if (combatHooks) return; combatHooks = true;
  const quietly = (type, data) => void request(type, data).catch(error => console.warn(`The Smoke | ${type}`, error));
  Hooks.on('createCombatant', c => { if (isLeader() && c.parent?.id) quietly('combat.dealIn', {combatId: c.parent.id, combatantId: c.id}); });
  Hooks.on('createItem', item => { if (isLeader() && item.type === 'condition' && item.name === 'Stunned' && item.parent?.isPerson && item.parent.uuid) quietly('combat.stunned', {actorUuid: item.parent.uuid}); });
}
async function rollNpcSpeed(combat) {
  for (const c of combat.combatants.filter(x => !x.hasPlayerOwner && !speedOf(x).rolled && speedOf(x).count)) {
    const roll = await new Roll(`${speedOf(c).count}d6`).evaluate();
    await c.update({[`flags.${NS}.speed`]: {...speedOf(c), results: roll.dice[0].results.map(r => Number(r.result)), rolled: true, locked: true}});
  }
}
/** Open a new round: everyone's speed dice are cleared, reactions come back. Runs on the leader. */
export async function beginRound(combatId,{automatic=false}={}) {
  const combat = game.combats.get(combatId); if (!combat) return;
  const st = stateOf(combat), round = Number(st.round || 0) + 1, chase = combat.getFlag(NS, 'chase');
  if (st.phase !== 'idle') { if(automatic)return {skipped:true,phase:st.phase}; throw new Error('Finish this round before beginning another.'); }
  if (game.paused) throw new Error('The game is paused.');
  const pending = pendingResponses(combat); if (pending.length) throw new Error(`Waiting: ${pending.join('; ')}.`);
  // Police who have arrived for this fight or chase since the last round (more stars, more units) are dealt in now.
  try { const {joinReinforcements} = await import('../world/chase.mjs'); await joinReinforcements(combat); } catch (error) { console.warn('The Smoke | police joining the fight', error); }
  for (const c of combat.combatants) {
    const a = c.actor;
    await c.update({initiative: null, [`flags.${NS}.speed`]: dealt(c)});
    if (a?.isPerson && a.system.states?.reactionUsed) await a.update({'system.states.reactionUsed': false});
  }
  await combat.update({[`flags.${NS}.state`]: {phase: 'intent', round, queue: [], cursor: 0}, round: Math.max(1, round), turn: 0});
  if (chaseMode(combat)!=='manual') await rollNpcSpeed(combat);   // police and traffic roll their own; the players roll theirs
  await postBoard(combat, `Round ${round}${chase ? ' of the chase' : ''}: roll your speed dice`, `<p>Open the <b>Combat Console</b> and roll. Your dice are private until ${chase?.auto ? 'everyone has rolled' : 'the GM reveals everyone\'s at once'}. Highest die acts first; every die is one action.${chase ? ' Behind the wheel, each action is one go on the green / yellow / red gauge.' : ''}</p>`);
}
registerHandler('combat.begin', async ({combatId, automatic=false, userId}) => {
  if (!canManageChase(game.combats.get(combatId), game.users.get(userId) ?? null)) throw new Error('The GM begins rounds in Story mode.');
  return beginRound(combatId,{automatic});
});
registerHandler('combat.speed', async ({combatId, combatantId, messageId, userId}) => {
  const combat = game.combats.get(combatId), c = combat?.combatants.get(combatantId), msg = game.messages.get(messageId);
  if (!c || !msg || !okFor(userId, c)) throw new Error('Not allowed.');
  const sp = speedOf(c), dice = diceOf(msg).slice(0, sp.count);
  if (sp.rolled || dice.length !== sp.count) throw new Error('That roll does not match.');
  await c.update({[`flags.${NS}.speed`]: {...sp, results: dice, rolled: true, locked: true}});
});
registerHandler('combat.npcSpeed', async ({combatId, userId}) => {
  const combat = game.combats.get(combatId);
  if (!canManageChase(combat, game.users.get(userId) ?? null)) throw new Error('Not allowed to roll NPC speed.');
  if (!combat || stateOf(combat).phase !== 'intent') return;
  return rollNpcSpeed(combat);
});
registerHandler('combat.reveal', async ({combatId, force = false, userId}) => {
  const combat = game.combats.get(combatId);
  const user = game.users.get(userId);
  if (!user || !canManageChase(combat, user) || force && !user?.isGM) throw new Error('Not allowed to reveal these dice.');
  if (!combat || stateOf(combat).phase !== 'intent') return;
  if (game.paused) throw new Error('The game is paused.');
  const pending = pendingResponses(combat); if (pending.length) throw new Error(`Waiting: ${pending.join('; ')}.`);
  const waiting = combat.combatants.filter(c => !speedOf(c).rolled);
  if (waiting.length && !force) throw new Error(`Still waiting on: ${waiting.map(c => c.name).join(', ')}.`);
  const queue = R.buildQueue(combat.combatants.filter(c => speedOf(c).rolled && !(combat.getFlag(NS, 'chase')?.trafficMode!=='individual' && combat.getFlag(NS, 'chase') && civilianTraffic(combat.scene).some(t => t.id === c.tokenId))).map(c => ({cid: c.id, name: c.name, results: speedOf(c).results, movDie: c.actor?.system?.stats?.mov?.die ?? 4, pc: c.hasPlayerOwner})));
  if (combat.getFlag(NS, 'chase')?.trafficMode!=='individual' && combat.getFlag(NS, 'chase') && civilianTraffic(combat.scene).length) queue.push({cid: '@traffic', name: 'All civilian traffic', value: 0, die: 0, kind: 'traffic'});
  for (const c of combat.combatants) { const top = Math.max(0, ...speedOf(c).results); await c.update({initiative: top || null}); }
  await combat.update({[`flags.${NS}.state`]: {...stateOf(combat), phase: queue.length ? 'resolve' : 'idle', queue, cursor: 0}, ...(combat.getFlag(NS, 'chase') ? {[`flags.${NS}.chase.action`]: null} : {})});
  await postBoard(combat, `Round ${stateOf(combat).round}: the order`, `<ol class="smoke-queue">${queue.map(e => `<li><b>${e.value}</b> ${esc(e.name)}</li>`).join('')}</ol><p>First up: <b>${esc(queue[0]?.name ?? 'nobody')}</b>.</p>`);
  if (queue[0]) await notifyTurn(combat, queue[0]);
});
registerHandler('combat.next', async ({combatId, key = null, userId}) => {
  const combat = game.combats.get(combatId); if (!combat) return; const st = stateOf(combat); if (st.phase !== 'resolve') return;
  if (!game.users.get(userId)) throw new Error('Unknown user.');
  if (key && key !== actionKey(combat)) return; // stale or double-clicked Done
  if (game.paused) throw new Error('The game is paused.');
  if (combat.scene?.tokens?.some(t => settlingMoves.has(t.uuid))) throw new Error('Wait for the driving manoeuvre to finish.');
  const pending = pendingResponses(combat); if (pending.length) throw new Error(`Waiting: ${pending.join('; ')}.`);
  const action = combat.getFlag(NS, 'chase')?.action;
  if (action?.key === actionKey(combat) && action.status === 'running') throw new Error('Wait for this NPC action to finish.');
  const cur = st.queue[st.cursor];
  const cc = cur && combat.combatants.get(cur.cid);
  const manager = canManageChase(combat, game.users.get(userId) ?? null);
  if (!game.users.get(userId)?.isGM && !okFor(userId, cc) && !(manager && (cur?.kind === 'traffic' || !cc?.hasPlayerOwner))) throw new Error('Not your turn.');
  if (chaseMode(combat)!=='manual' && (cur?.kind === 'traffic' || cc && !cc.hasPlayerOwner) && action?.status !== 'review') throw new Error('Wait for the automated action to finish before continuing.');
  let cursor = st.cursor + 1;
  while (cursor < st.queue.length && st.queue[cursor].kind !== 'traffic' && !combat.combatants.get(st.queue[cursor].cid)) cursor++; // a wreck or dismounted unit has no later dice
  if (cursor < st.queue.length) { await combat.update({[`flags.${NS}.state`]: {...st, cursor}, ...(combat.getFlag(NS, 'chase') ? {[`flags.${NS}.chase.action`]: null} : {})}); const nx = st.queue[cursor]; return notifyTurn(combat, nx); }
  // end of the round: bleeding and burning bite, stunning wears off, dodges end, the Down clock ticks
  const lines = [], downOut = [], downCards = [];
  for (const c of combat.combatants) {
    const a = c.actor, t = c.token; if (!a || a.type === 'vehicle') continue;
    for (const {name, damage} of roundDamage(condNames(a))) { await a.applyDamage(damage); lines.push(`${c.name}: ${name} −${damage}`); }
    if (condNames(a).includes('Stunned')) await a.removeCondition('Stunned');
    if (t?.getFlag(NS, 'dodging')) await t.update({[`flags.${NS}.dodging`]: false});
    // Down without aid: three rounds and the ambulance takes you; each round, roll Grit to stay conscious.
    if (a.isPerson && a.system.states?.down && Number(a.system.resources?.health?.value) <= 0) {
      const count = Number(a.system.states.downRounds || 0) + 1; await a.update({'system.states.downRounds': count});
      if (count >= 3) { lines.push(`${c.name}: three rounds Down — Wasted`); downOut.push(a); }
      else downCards.push([a, count]);
    }
  }
  const chase = combat.getFlag(NS, 'chase');
  await postBoard(combat, `End of round ${st.round}`, `${lines.length ? `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p>Nobody bleeding.</p>'}<p class="smoke-dim">Begin the next round in the Combat Console when everyone is ready.</p>`);
  // fires go up, evasive driving ends, and in a chase: did they get away?
  try { const {roundEnd} = await import('../world/chase.mjs'); await roundEnd(combat, st); } catch (error) { console.warn('The Smoke | end of round', error); }
  if (game.combats.get(combatId)) await combat.update({[`flags.${NS}.state`]: {...st, phase: 'idle', cursor}, ...(chase ? {[`flags.${NS}.chase.action`]: null} : {})});
  for (const [a, count] of downCards) await card('DOWN', a.name, `<p>Round ${count}/3 without aid. Roll Grit to stay conscious.</p><button type="button" data-smoke-roll="${esc(a.uuid)}" data-stat="grt" data-band="medium" data-label="Stay Conscious" data-context='${esc(JSON.stringify({kind: 'stayUp'}))}'>Stay conscious</button>`, 'down');
  if (downOut.length) { const {wasted} = await import('../world/heat.mjs'); for (const a of downOut) { await card('WASTED', a.name, '<p>Three rounds Down without aid. The ambulance takes you to A&E.</p>', 'wasted'); await wasted(a); } }
});
async function notifyTurn(combat, entry) {
  if (entry.kind === 'traffic') return card('TRAFFIC PHASE', 'All civilian traffic', '<p>One shared move for the civilian traffic. Run the phase, review it, then Continue.</p>', 'chase', {whisper: gmIds()});
  const c = combat.combatants.get(entry.cid); if (!c) return;
  if (!c.hasPlayerOwner && chaseMode(combat)!=='manual') return;   // the AI takes it
  const to = c.hasPlayerOwner ? [...ownersOf(c.actor), ...gmIds()] : gmIds();
  const driving = seatOf(c.token)?.seatId === 'pilot';
  return card('YOUR GO', `${c.name} (${entry.value})`, driving
    ? `<p>Drive it: drag your vehicle along the road — <b class="g">green</b> is safe, <b class="y">yellow</b> and <b class="r">red</b> push it and need a Wheels check. Or ram, PIT, go evasive, shoot, bail out — then press <b>Done</b> in the Combat Console.</p>`
    : `<p>Attack, move, take cover, aim, reload, grab, run, surrender — then press <b>Done</b> in the Combat Console.</p>`, 'combat', {whisper: to});
}
registerHandler('combat.hit', async ({attackerTokenUuid, targetTokenUuid, weaponName, weaponCrime, effect, loud, hit, margin, total, outcomeKey, explosions, impact, armourBonus, tyres, band, userId}) => {
  const at = await fromUuid(attackerTokenUuid), tt = await fromUuid(targetTokenUuid); if (!at || !tt || !okFor(userId, at)) throw new Error('Not allowed.');
  const scene = tt.parent, attacker = at.actor, target = tt.actor, lines = [];
  // A weapon that kills when it drops someone: guns, blades, fire, explosives and the heaviest melee weapons. Fists,
  // bats, tasers and spray knock people down (that's assault); taking a life is what brings the high stars.
  const lethal = weaponCrime === 'shooting' || ['bleed', 'fire', 'area'].includes(effect) || Number(impact) >= 4;
  const byPolice = policeAround(scene, at), seen = byPolice || witnesses(scene, at) || Boolean(loud);
  // crime and Heat: a character attacking with someone watching
  if (isPC(attacker) && weaponCrime && setting('combatAutoHeat', true)) {
    // Going for a copper is at least assaulting a police officer; with a gun it is also gunfire (whichever is worse).
    const crimes = target?.system?.role === 'police' || tt.getFlag(NS, 'police') ? [...new Set(['assaultCop', weaponCrime])] : [weaponCrime];
    if (seen) for (const crime of crimes) if (CRIMES[crime]) await attacker.reportCrime(crime, {witnessed: true, byPolice});
  }
  if (!hit) return card('MISS', `${weaponName} → ${tt.name}`, `<p>${esc(at.name)} misses.</p>`, 'lose');
  if (target?.type === 'vehicle' && tyres) {
    const flats = Math.min(4, Number(target.system.vehicle.flats || 0) + 1); await target.update({'system.vehicle.flats': flats});
    return card('TYRE', `${tt.name}: blown tyre`, `<p>Bang — ${flats} flat. Performance down a step and Handling −2 per flat.</p>`, 'win');
  }
  const armour = target?.type === 'vehicle' ? Number(target.system.vehicle.armour || 0) : Number(target?.system?.armour || 0) + Number(armourBonus || 0);
  const dmg = R.hitDamage({margin, impact, armour}), cons = target?.type === 'vehicle' ? {conditions: [], breakthrough: [], label: ''} : damageConsequences(dmg, {explosions});
  const extra = target?.type === 'vehicle' ? [] : R.effectConditions(effect, {damage: dmg, outcomeKey});
  const conditions = [...new Set([...extra, ...(dmg >= 3 ? cons.conditions.slice(0, 1) : [])])];
  const victims = [tt];
  if (effect === 'area' || effect === 'smoke') for (const t of scene.tokens.filter(x => x.id !== tt.id && x.actor && x.actor.type !== 'vehicle' && distanceSquares(x, tt) <= R.RANGE_SQUARES.Engaged)) victims.push(t);
  const auto = setting('combatAutoDamage', true);
  for (const v of victims) {
    const a = v.actor; if (!a) continue;
    const vdmg = v.id === tt.id ? dmg : (effect === 'smoke' ? 0 : Math.max(0, dmg - Number(a.system?.armour || 0)));
    if (auto) { const before = Number(a.system?.resources?.health?.value ?? 0); if (vdmg) await a.applyDamage(vdmg); if (a.type !== 'vehicle') for (const c of (v.id === tt.id ? conditions : extra)) if (c !== 'Down') await a.addCondition(c);
      await reportKill(attacker, v, {before, lethal, seen, byPolice}); }
    lines.push(`${v.name}: ${vdmg} damage${(v.id === tt.id ? conditions : extra).length ? ` · ${(v.id === tt.id ? conditions : extra).join(', ')}` : ''}`);
  }
  if (effect === 'smoke') await tt.update({[`flags.${NS}.cover`]: 'full'});
  if (auto) return card('HIT', `${weaponName} → ${tt.name}: ${dmg}`, `<p>${esc(cons.label || '')}</p><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`, 'damage');
  // The target's owner (or the GM) resolves the hit once: take it, or spend their reaction to Dodge. Then the GM picks
  // at most one condition the fiction warrants; a weapon's own effect (stun, gas, fire…) lands with the hit.
  const severity = cons.label || '', choose = target?.type === 'vehicle' ? [] : [...new Set([...(cons.conditions || []), ...(cons.breakthrough || [])])].filter(c => c !== 'Down');
  const attackFlag = {target: tt.uuid, total: Number(total ?? 0), damage: dmg, attacker: attacker?.uuid, attackerName: at.name, severity, conditions: choose, effects: extra.filter(c => c !== 'Down'), lethal, seen, byPolice};
  const canDodge = target?.isPerson && !target.system.states?.reactionUsed;
  const splash = victims.filter(v => v.id !== tt.id).map(v => { const vd = effect === 'smoke' ? 0 : Math.max(0, dmg - Number(v.actor?.system?.armour || 0)); return `<button type="button" data-smoke-damage="${esc(v.uuid)}" data-amount="${vd}">${esc(v.name)}: apply ${vd}</button>`; }).join('');
  return card('HIT · DAMAGE', `${weaponName} → ${tt.name}: ${dmg}`, `<p>${esc(severity)}${effect ? ` · ${esc(effect)}` : ''}</p>
    <div class="smoke-buttons"><button type="button" data-smoke-damage="${esc(tt.uuid)}" data-amount="${dmg}"><i class="fa-solid fa-burst"></i> Take hit · ${dmg}</button>${canDodge ? `<button type="button" data-smoke-dodge="${esc(tt.uuid)}"><i class="fa-solid fa-person-running"></i> Dodge · use reaction</button>` : ''}</div>
    ${choose.length ? `<p class="smoke-dim">GM: choose one fitting condition if the fiction warrants it.</p>${choose.map(c => `<button type="button" data-smoke-condition="${esc(tt.uuid)}" data-condition="${esc(c)}">${esc(c)}</button>`).join('')}` : ''}
    ${splash ? `<p class="smoke-dim">Caught in it too:</p>${splash}` : ''}`, 'damage', {flags: {[NS]: {attack: attackFlag, chaseCombatId: game.combats?.find?.(c=>c.scene?.id===scene.id && c.active)?.id ?? null}}});
});
/**
 * A character's lethal attack has just taken a person from standing to 0 Health: that's a killing, and if anyone saw
 * or heard it, it's four stars (five for a police officer, or a second killing). Runs on the leader.
 */
export async function reportKill(attacker, targetToken, {before = 0, lethal = false, seen = false, byPolice = false} = {}) {
  const victim = targetToken?.actor ?? targetToken;
  if (!isPC(attacker) || !lethal || !victim?.isPerson || victim === attacker || !setting('combatAutoHeat', true)) return false;
  if (!(Number(before) > 0) || Number(victim.system?.resources?.health?.value ?? 1) > 0) return false;
  const cop = victim.system?.role === 'police' || Boolean(targetToken?.getFlag?.(NS, 'police'));
  await attacker.reportCrime(cop ? 'copKiller' : 'murder', {witnessed: Boolean(seen), byPolice: Boolean(byPolice)});
  await card('KILLING', `${attacker.name} has killed ${targetToken?.name ?? victim.name}`, `<p>${seen ? `${cop ? 'A police officer is down and not getting up.' : 'Someone is dead.'} Every unit in the borough hears about it.` : 'Nobody saw it. Yet.'}</p>`, `heat h${clampHeat(attacker.system.heat?.value)}`);
  return true;
}
registerHandler('combat.grab', async ({attackerTokenUuid, targetTokenUuid, userId}) => {
  const at = await fromUuid(attackerTokenUuid), tt = await fromUuid(targetTokenUuid); if (!at || !tt || !okFor(userId, at)) throw new Error('Not allowed.');
  await tt.actor.addCondition('Grabbed'); await tt.update({[`flags.${NS}.grabbedBy`]: at.id});
  if (isPC(at.actor) && tt.actor?.type === 'npc' && setting('combatAutoHeat', true) && (witnesses(tt.parent, at) || policeAround(tt.parent, at))) await at.actor.reportCrime(tt.getFlag(NS, 'police') || tt.actor.system.role === 'police' ? 'assaultCop' : 'assault', {witnessed: true, byPolice: policeAround(tt.parent, at)});
  return card('GRABBED', `${at.name} has hold of ${tt.name}`, '<p>Grabbed: can\'t move away, Moves is Off Your Game, −2 Guard. Break free on their action, or get cuffed.</p>', 'combat');
});
registerHandler('combat.release', async ({tokenUuid, userId}) => {
  const t = await fromUuid(tokenUuid); if (!t || !okFor(userId, t)) throw new Error('Not allowed.');
  await t.actor.removeCondition('Grabbed'); await t.update({[`flags.${NS}.grabbedBy`]: null});
  return card('FREE', `${t.name} breaks free`, '', 'win');
});
registerHandler('combat.cuff', async ({attackerTokenUuid, targetTokenUuid, userId}) => {
  const at = await fromUuid(attackerTokenUuid), tt = await fromUuid(targetTokenUuid); if (!at || !tt || !okFor(userId, at)) throw new Error('Not allowed.');
  await tt.actor.addCondition('Cuffed'); await tt.actor.removeCondition('Grabbed');
  const police = at.getFlag(NS, 'police') || at.actor?.system?.role === 'police';
  await card('CUFFED', `${at.name} cuffs ${tt.name}`, police && isPC(tt.actor) ? '<p>"You do not have to say anything…" — <b>Busted.</b></p>' : '<p>Hands behind the back.</p>', 'combat');
  if (police && isPC(tt.actor)) { const {busted} = await import('../world/heat.mjs'); await busted(tt.actor); }
});
registerHandler('combat.ram', async ({vehicleTokenUuid, driverTokenUuid, targetTokenUuid, margin, hit, userId}) => {
  const vt = await fromUuid(vehicleTokenUuid), dt = await fromUuid(driverTokenUuid), tt = await fromUuid(targetTokenUuid); if (!vt || !dt || !tt || !okFor(userId, dt)) throw new Error('Not allowed.');
  if (isPC(dt.actor) && setting('combatAutoHeat', true)) await dt.actor.reportCrime(tt.actor?.type === 'vehicle' ? 'dangerousDriving' : (tt.getFlag(NS, 'police') ? 'assaultCop' : 'assault'), {witnessed: true, byPolice: policeAround(vt.parent, vt)});
  if (!hit) return card('RAM', `${vt.name} misses ${tt.name}`, '<p>Swerve, screech, mount the kerb. Missed.</p>', 'lose');
  const res = R.ramDamage({margin, size: vt.actor.system.vehicle.size, targetIsVehicle: tt.actor?.type === 'vehicle'});
  const target = bodyOf(tt).actor ?? tt.actor;
  await target.applyDamage(res.target); await vt.actor.applyDamage(res.self);
  if (res.knockdown && tt.actor?.type !== 'vehicle') await tt.actor.addCondition('Prone');
  return card('RAM', `${vt.name} rams ${tt.name}`, `<p>${tt.name}: −${res.target}${res.knockdown ? ', knocked flying (Prone)' : ''}. ${vt.name}: −${res.self} Body.</p>`, 'damage');
});
registerHandler('combat.flag', async ({tokenUuid, key, value, userId}) => {
  const t = await fromUuid(tokenUuid); if (!t || !okFor(userId, t)) throw new Error('Not allowed.');
  if (!['cover', 'aiming', 'dodging'].includes(key)) throw new Error('Unknown.');
  await t.update({[`flags.${NS}.${key}`]: value});
  if (key === 'cover') return card('COVER', `${t.name}: ${R.COVER[value]?.label ?? value}`, '', 'combat');
});
registerHandler('combat.surrender', async ({tokenUuid, userId}) => {
  const t = await fromUuid(tokenUuid); if (!t || !okFor(userId, t)) throw new Error('Not allowed.');
  const fight = game.combats?.find?.(cb => (!cb.scene || cb.scene.id === t.parent?.id) && cb.combatants?.some?.(c => c.tokenId === t.id)) ?? null;
  await t.actor.update({'system.states.surrendered': true, [`flags.${NS}.surrenderedIn`]: fight?.id ?? null});
  return card('SURRENDER', `${t.name} gives up`, '<p>Hands up, on your knees. No more speed dice in this fight; anyone can cuff you without a roll.</p>', 'combat');
});
registerHandler('combat.policeFight', async ({tokenUuid, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const t = await fromUuid(tokenUuid); if (t) return policeFightNow(t);
});
export async function policeFightNow(t) {
  const scene = t.parent, stars = clampHeat(t.actor.system.heat?.value);
  const unit = scene.tokens.filter(u => u.getFlag(NS, 'police') && u.getFlag(NS, 'police').unit !== 'heli').sort((a, b) => distanceSquares(a, t) - distanceSquares(b, t))[0];
  const g = scene.grid.size, [ux, uy] = unit ? tokenCentre(unit) : tokenCentre(t);
  const officer = await ensurePersonActor(stars >= 4 ? 'arv' : 'pc'); const made = unit ? await deployPoliceCrew(unit,t,2) : [];
  for (let i = made.length; i < 2; i++) made.push(await placeToken(scene, officer, ux + (i ? 1.2 : -1.2) * g, uy + 1.5 * g, {name: stars >= 4 ? 'Armed Officer' : 'PC', flags: {police: {unit: 'officer', hunting: t.actor.id}}}));
  let combat = game.combats.find(c => c.scene?.id === scene.id);
  if (!combat) combat = await (CONFIG.Combat?.documentClass ?? getDocumentClass('Combat')).create({scene: scene.id, active: true});
  const have = new Set(combat.combatants.map(c => c.tokenId));
  await combat.createEmbeddedDocuments('Combatant', [t, ...made.filter(Boolean)].filter(x => !have.has(x.id)).map(x => ({tokenId: x.id, sceneId: scene.id, actorId: x.actorId})));
  await card('POLICE', `${t.name} kicks off`, `<p>Two ${stars >= 4 ? 'armed officers' : 'officers'} pile out of the ${esc(unit?.name ?? 'van')}. Fight, run, or surrender.</p>`, `heat h${stars}`);
  if (stateOf(combat).phase === 'idle') return beginRound(combat.id);
  // Join next round without replacing anybody's outstanding speed dice or interrupting this action.
  return combat;
}

export const combatAPI = {startFight, rollSpeed, attack, grab, breakFree, cuff, ram, policeTurn, policeFight, takeCover, aim, dodge, surrender, defenceOf, rangeBetween, speedCountFor, speedFor, surrenderedIn, dealIn, stunSpeed,
  begin: combat => request('combat.begin', {combatId: combat.id}), npcSpeed: combat => request('combat.npcSpeed', {combatId: combat.id}),
  reveal: (combat, force = false) => request('combat.reveal', {combatId: combat.id, force}), next: combat => request('combat.next', {combatId: combat.id, key: actionKey(combat)}), stateOf, speedOf};
