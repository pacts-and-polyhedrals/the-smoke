// Combat in Foundry: speed-dice rounds on the core Combat document, attacks with ranges/cover/ammo, grabs and arrests,
// ramming and tyres, cover and dodging, round-end bleeding and burning, and police officers who take their own turns.
// Every write that touches someone else's document runs on the leader GM.
import {NS, STATS, CRIMES} from '../config.mjs';
import {clampHeat, damageConsequences, isSuccess} from '../rules/core.mjs';
import {roundDamage} from '../rules/conditions.mjs';
import * as R from './rules.mjs';
import {isLeader, registerHandler, request, card, esc, ownersOf} from '../world/net.mjs';
import {distanceSquares, tokenCentre, ensurePersonActor, placeToken} from '../world/spawn.mjs';
import {reload as reloadWeapon} from '../world/items.mjs';

const {DialogV2} = foundry.applications.api;
const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
const condNames = actor => (actor?.items ?? []).filter(i => i.type === 'condition').map(i => i.name);
const stateOf = combat => combat?.getFlag?.(NS, 'state') ?? {phase: 'idle', round: 0, queue: [], cursor: 0};
const speedOf = c => c?.getFlag?.(NS, 'speed') ?? {count: 0, results: [], rolled: false, locked: false};
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const isPC = actor => actor?.type === 'character';
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
  if (a?.type === 'vehicle') return {guard: R.vehicleGuard(a.system.vehicle.size), armour: Number(a.system.vehicle.armour || 0), isVehicle: true};
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
  const content = `<div class="smoke-roll-dialog"><p><b>${esc(target.name)}</b> — ${band} (${Math.round(d)} squares)${def.cover && def.cover !== 'none' ? ` · ${esc(R.COVER[def.cover].label.split(' (')[0])}` : ''}</p>
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
  const scene = officerToken.parent, a = officerToken.actor;
  const targets = scene.tokens.filter(t => isPC(t.actor) && !condNames(t.actor).includes('Cuffed')).map(t => ({t, d: rangeBetween(officerToken, t)})).sort((x, y) => (clampHeat(y.t.actor.system.heat?.value) - clampHeat(x.t.actor.system.heat?.value)) || x.d - y.d);
  const pick = targets[0]; if (!pick) return card('POLICE', officerToken.name, '<p>Nobody to nick.</p>');
  const heat = clampHeat(pick.t.actor.system.heat?.value);
  const weapons = a.items.filter(i => i.type === 'weapon').map(i => ({...i.system, name: i.name}));
  const choice = R.policeChoice({heat, distance: pick.d, target: {conditions: condNames(pick.t.actor), surrendered: pick.t.actor.system.states?.surrendered, armed: pick.t.actor.items.some(i => i.type === 'weapon' && i.name !== 'Fists' && i.system.kind !== 'melee')}, weapons});
  await card('POLICE', `${officerToken.name}: ${choice.act}`, `<p>${esc(choice.why)}</p>`, 'heat', {whisper: gmIds()});
  if (choice.act === 'move' || choice.act === 'cuff' && pick.d > R.RANGE_SQUARES.Engaged) await moveToward(officerToken, pick.t, 6);
  if (choice.act === 'cuff') return cuff(officerToken, pick.t);
  if (choice.act === 'grab') return grab(officerToken, pick.t);
  if (choice.act === 'attack') { const w = a.items.find(i => i.name === choice.weapon); if (Number(w?.system.ammo?.max) && !Number(w.system.ammo.value)) await reloadWeapon(a, w).catch(() => null); return attack(officerToken, {weapon: w, target: pick.t, auto: true}); }
  if (choice.act === 'shout') return card('POLICE', `"Stop! Police!"`, `<p>${esc(officerToken.name)} shouts at ${esc(pick.t.name)} to get on the ground.</p>`, 'heat');
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

/** Open a new round: everyone's speed dice are cleared, reactions come back. Runs on the leader. */
async function beginRound(combatId) {
  const combat = game.combats.get(combatId); if (!combat) return;
  const st = stateOf(combat), round = Number(st.round || 0) + 1;
  for (const c of combat.combatants) {
    const a = c.actor; const count = a ? R.speedDiceCount({movDie: a.system.stats?.mov?.die ?? 4, conditions: condNames(a), surrendered: a.system.states?.surrendered}) : 0;
    await c.update({initiative: null, [`flags.${NS}.speed`]: {count, results: [], rolled: !count, locked: !count}});
    if (a?.isPerson && a.system.states?.reactionUsed) await a.update({'system.states.reactionUsed': false});
  }
  await combat.update({[`flags.${NS}.state`]: {phase: 'intent', round, queue: [], cursor: 0}, round: Math.max(1, round), turn: 0});
  await postBoard(combat, `Round ${round}: roll your speed dice`, `<p>Open the <b>Combat Console</b> and roll. Your dice are private until the GM reveals everyone's at once. Highest die acts first; every die is one action.</p>`);
}
registerHandler('combat.begin', async ({combatId, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  return beginRound(combatId);
});
registerHandler('combat.speed', async ({combatId, combatantId, messageId, userId}) => {
  const combat = game.combats.get(combatId), c = combat?.combatants.get(combatantId), msg = game.messages.get(messageId);
  if (!c || !msg || !okFor(userId, c)) throw new Error('Not allowed.');
  const sp = speedOf(c), dice = diceOf(msg).slice(0, sp.count);
  if (sp.rolled || dice.length !== sp.count) throw new Error('That roll does not match.');
  await c.update({[`flags.${NS}.speed`]: {...sp, results: dice, rolled: true, locked: true}});
});
registerHandler('combat.npcSpeed', async ({combatId, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const combat = game.combats.get(combatId);
  for (const c of combat.combatants.filter(x => !x.hasPlayerOwner && !speedOf(x).rolled && speedOf(x).count)) {
    const roll = await new Roll(`${speedOf(c).count}d6`).evaluate();
    await c.update({[`flags.${NS}.speed`]: {...speedOf(c), results: roll.dice[0].results.map(r => Number(r.result)), rolled: true, locked: true}});
  }
});
registerHandler('combat.reveal', async ({combatId, force = false, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const combat = game.combats.get(combatId); const waiting = combat.combatants.filter(c => !speedOf(c).rolled);
  if (waiting.length && !force) throw new Error(`Still waiting on: ${waiting.map(c => c.name).join(', ')}.`);
  const queue = R.buildQueue(combat.combatants.filter(c => speedOf(c).rolled).map(c => ({cid: c.id, name: c.name, results: speedOf(c).results, movDie: c.actor?.system?.stats?.mov?.die ?? 4, pc: c.hasPlayerOwner})));
  for (const c of combat.combatants) { const top = Math.max(0, ...speedOf(c).results); await c.update({initiative: top || null}); }
  await combat.update({[`flags.${NS}.state`]: {...stateOf(combat), phase: 'resolve', queue, cursor: 0}});
  await postBoard(combat, `Round ${stateOf(combat).round}: the order`, `<ol class="smoke-queue">${queue.map(e => `<li><b>${e.value}</b> ${esc(e.name)}</li>`).join('')}</ol><p>First up: <b>${esc(queue[0]?.name ?? 'nobody')}</b>.</p>`);
});
registerHandler('combat.next', async ({combatId, userId}) => {
  const combat = game.combats.get(combatId); const st = stateOf(combat); const cur = st.queue[st.cursor];
  const cc = cur && combat.combatants.get(cur.cid);
  if (!game.users.get(userId)?.isGM && !okFor(userId, cc)) throw new Error('Not your turn.');
  const cursor = st.cursor + 1;
  if (cursor < st.queue.length) { await combat.update({[`flags.${NS}.state`]: {...st, cursor}}); const nx = st.queue[cursor]; return notifyTurn(combat, nx); }
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
  await combat.update({[`flags.${NS}.state`]: {...st, phase: 'idle', cursor}});
  await postBoard(combat, `End of round ${st.round}`, `${lines.length ? `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p>Nobody bleeding.</p>'}<p class="smoke-dim">GM: Begin the next round in the Combat Console.</p>`);
  for (const [a, count] of downCards) await card('DOWN', a.name, `<p>Round ${count}/3 without aid. Roll Grit to stay conscious.</p><button type="button" data-smoke-roll="${esc(a.uuid)}" data-stat="grt" data-band="medium" data-label="Stay Conscious" data-context='${esc(JSON.stringify({kind: 'stayUp'}))}'>Stay conscious</button>`, 'down');
  if (downOut.length) { const {wasted} = await import('../world/heat.mjs'); for (const a of downOut) { await card('WASTED', a.name, '<p>Three rounds Down without aid. The ambulance takes you to A&E.</p>', 'wasted'); await wasted(a); } }
});
async function notifyTurn(combat, entry) {
  const c = combat.combatants.get(entry.cid); if (!c) return;
  const to = c.hasPlayerOwner ? [...ownersOf(c.actor), ...gmIds()] : gmIds();
  return card('YOUR GO', `${c.name} (${entry.value})`, `<p>Attack, move, take cover, aim, reload, grab, run, surrender — then press <b>Done</b> in the Combat Console.</p>`, 'combat', {whisper: to});
}
registerHandler('combat.hit', async ({attackerTokenUuid, targetTokenUuid, weaponName, weaponCrime, effect, loud, hit, margin, total, outcomeKey, explosions, impact, armourBonus, tyres, band, userId}) => {
  const at = await fromUuid(attackerTokenUuid), tt = await fromUuid(targetTokenUuid); if (!at || !tt || !okFor(userId, at)) throw new Error('Not allowed.');
  const scene = tt.parent, attacker = at.actor, target = tt.actor, lines = [];
  // crime and Heat: a character attacking with someone watching
  if (isPC(attacker) && weaponCrime && setting('combatAutoHeat', true)) {
    const byPolice = policeAround(scene, at), seen = byPolice || witnesses(scene, at) || loud;
    const crime = target?.system?.role === 'police' || tt.getFlag(NS, 'police') ? 'assaultCop' : weaponCrime;
    if (seen && CRIMES[crime]) await attacker.reportCrime(crime, {witnessed: true, byPolice});
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
    if (auto) { if (vdmg) await a.applyDamage(vdmg); if (a.type !== 'vehicle') for (const c of (v.id === tt.id ? conditions : extra)) if (c !== 'Down') await a.addCondition(c); }
    lines.push(`${v.name}: ${vdmg} damage${(v.id === tt.id ? conditions : extra).length ? ` · ${(v.id === tt.id ? conditions : extra).join(', ')}` : ''}`);
  }
  if (effect === 'smoke') await tt.update({[`flags.${NS}.cover`]: 'full'});
  if (auto) return card('HIT', `${weaponName} → ${tt.name}: ${dmg}`, `<p>${esc(cons.label || '')}</p><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`, 'damage');
  // The target's owner (or the GM) resolves the hit once: take it, or spend their reaction to Dodge. Then the GM picks
  // at most one condition the fiction warrants; a weapon's own effect (stun, gas, fire…) lands with the hit.
  const severity = cons.label || '', choose = target?.type === 'vehicle' ? [] : [...new Set([...(cons.conditions || []), ...(cons.breakthrough || [])])].filter(c => c !== 'Down');
  const attackFlag = {target: tt.uuid, total: Number(total ?? 0), damage: dmg, attacker: attacker?.uuid, attackerName: at.name, severity, conditions: choose, effects: extra.filter(c => c !== 'Down')};
  const canDodge = target?.isPerson && !target.system.states?.reactionUsed;
  const splash = victims.filter(v => v.id !== tt.id).map(v => { const vd = effect === 'smoke' ? 0 : Math.max(0, dmg - Number(v.actor?.system?.armour || 0)); return `<button type="button" data-smoke-damage="${esc(v.uuid)}" data-amount="${vd}">${esc(v.name)}: apply ${vd}</button>`; }).join('');
  return card('HIT · DAMAGE', `${weaponName} → ${tt.name}: ${dmg}`, `<p>${esc(severity)}${effect ? ` · ${esc(effect)}` : ''}</p>
    <div class="smoke-buttons"><button type="button" data-smoke-damage="${esc(tt.uuid)}" data-amount="${dmg}"><i class="fa-solid fa-burst"></i> Take hit · ${dmg}</button>${canDodge ? `<button type="button" data-smoke-dodge="${esc(tt.uuid)}"><i class="fa-solid fa-person-running"></i> Dodge · use reaction</button>` : ''}</div>
    ${choose.length ? `<p class="smoke-dim">GM: choose one fitting condition if the fiction warrants it.</p>${choose.map(c => `<button type="button" data-smoke-condition="${esc(tt.uuid)}" data-condition="${esc(c)}">${esc(c)}</button>`).join('')}` : ''}
    ${splash ? `<p class="smoke-dim">Caught in it too:</p>${splash}` : ''}`, 'damage', {flags: {[NS]: {attack: attackFlag}}});
});
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
  await t.actor.update({'system.states.surrendered': true});
  return card('SURRENDER', `${t.name} gives up`, '<p>Hands up, on your knees. No more speed dice; anyone can cuff you without a roll.</p>', 'combat');
});
registerHandler('combat.policeFight', async ({tokenUuid, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const t = await fromUuid(tokenUuid); if (!t) return; const scene = t.parent, stars = clampHeat(t.actor.system.heat?.value);
  const unit = scene.tokens.filter(u => u.getFlag(NS, 'police') && u.getFlag(NS, 'police').unit !== 'heli').sort((a, b) => distanceSquares(a, t) - distanceSquares(b, t))[0];
  const g = scene.grid.size, [ux, uy] = unit ? tokenCentre(unit) : tokenCentre(t);
  const officer = await ensurePersonActor(stars >= 4 ? 'arv' : 'pc'); const made = [];
  for (let i = 0; i < 2; i++) made.push(await placeToken(scene, officer, ux + (i ? 1.2 : -1.2) * g, uy + 1.5 * g, {name: stars >= 4 ? 'Armed Officer' : 'PC', flags: {police: {unit: 'officer', hunting: t.actor.id}}}));
  let combat = game.combats.find(c => c.scene?.id === scene.id);
  if (!combat) combat = await (CONFIG.Combat?.documentClass ?? getDocumentClass('Combat')).create({scene: scene.id, active: true});
  const have = new Set(combat.combatants.map(c => c.tokenId));
  await combat.createEmbeddedDocuments('Combatant', [t, ...made.filter(Boolean)].filter(x => !have.has(x.id)).map(x => ({tokenId: x.id, sceneId: scene.id, actorId: x.actorId})));
  await card('POLICE', `${t.name} kicks off`, `<p>Two ${stars >= 4 ? 'armed officers' : 'officers'} pile out of the ${esc(unit?.name ?? 'van')}. Fight, run, or surrender.</p>`, `heat h${stars}`);
  return beginRound(combat.id);   // already on the leader: no nested request
});

export const combatAPI = {startFight, rollSpeed, attack, grab, breakFree, cuff, ram, policeTurn, policeFight, takeCover, aim, dodge, surrender, defenceOf, rangeBetween,
  begin: combat => request('combat.begin', {combatId: combat.id}), npcSpeed: combat => request('combat.npcSpeed', {combatId: combat.id}),
  reveal: (combat, force = false) => request('combat.reveal', {combatId: combat.id, force}), next: combat => request('combat.next', {combatId: combat.id}), stateOf, speedOf};
