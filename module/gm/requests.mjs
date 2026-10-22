// Roll requests: the GM posts a check, a teamwork check, an opposed check or a hazard to chosen characters; each
// player answers with a button on the card; the leader GM writes every result back onto the same card, works out the
// teamwork average, and applies a hazard's consequences automatically (damage after armour, Conditions, Heat, cash).
import {NS, STATS} from '../config.mjs';
import {teamworkResult, isSuccess} from '../rules/core.mjs';
import {isLeader, esc, ownersOf} from '../world/net.mjs';

const BAND = {easy: 'Easy', medium: 'Medium', hard: 'Hard', miracle: 'Long Shot'};
const KICKER = {check: 'ROLL REQUEST', teamwork: 'TEAMWORK', hazard: 'HAZARD', opposed: 'OPPOSED'};
const uid = () => foundry.utils.randomID();

/** Which consequence a hazard deals for an outcome. */
export function hazardFor(spec, outcomeKey) {
  if (!spec) return null;
  if (outcomeKey === 'severeFailure') return spec.severe ?? spec.costly ?? null;
  if (outcomeKey === 'costlyFailure') return spec.costly ?? null;
  if (outcomeKey === 'narrowSuccess') return spec.narrow ?? null;
  return null;
}
/** Damage after armour, for hazards that armour helps against. */
export const hazardDamage = (c, armour = 0, armoured = false) => Math.max(0, Number(c?.damage || 0) - (armoured ? Number(armour || 0) : 0));
export function describeConsequence(c, {armour = 0, armoured = false} = {}) {
  if (!c) return 'No harm done.';
  const parts = [];
  const dmg = hazardDamage(c, armour, armoured); if (dmg) parts.push(`${dmg} damage`);
  if (c.conditions?.length) parts.push(c.conditions.join(', '));
  if (c.heat) parts.push(`+${c.heat} Heat`);
  if (c.cashPct) parts.push(`loses ${c.cashPct}% of their cash`);
  return parts.length ? parts.join(' · ') : 'Shaken, but fine.';
}

/** Post a request. spec: {kind, title, text, guide, band, tn, responses:[{label, stat}], actorIds, hazard, autoApply, whisper, opponent}. */
export async function postRequest(spec) {
  const state = {id: uid(), kind: spec.kind || 'check', title: spec.title, text: spec.text || '', guide: spec.guide || '', band: spec.tn ? null : (spec.band || 'medium'),
    tn: spec.tn ? Number(spec.tn) : null, responses: (spec.responses || []).filter(r => STATS[r.stat]), actorIds: [...new Set(spec.actorIds || [])],
    hazard: spec.hazard || null, autoApply: spec.autoApply !== false, opponent: spec.opponent || null, results: {}, team: null};
  if (!state.responses.length) throw new Error('A request needs at least one stat to roll.');
  if (!state.actorIds.length) throw new Error('Choose who has to roll.');
  if (state.kind === 'teamwork' && !state.tn) state.tn = Number(spec.teamTN) || null;
  const whisper = spec.whisper ? [...new Set([...state.actorIds.flatMap(id => ownersOf(game.actors.get(id))), ...game.users.filter(u => u.isGM).map(u => u.id)])] : undefined;
  return ChatMessage.implementation.create({speaker: {alias: 'The GM'}, content: renderRequest(state), whisper, flags: {[NS]: {request: state}}});
}

export function renderRequest(state) {
  const meta = [state.tn ? `TN ${state.tn}` : `${BAND[state.band] || 'Medium'} (solved for each character)`];
  if (state.opponent) meta.push(`vs ${state.opponent.name}'s ${STATS[state.opponent.stat]?.label ?? ''} ${state.opponent.total}`);
  if (state.kind === 'teamwork') meta.push('everyone rolls · the average counts');
  const hazardLines = state.kind === 'hazard' && state.hazard ? `<ul class="smoke-hazard-key">${[['narrow', 'Just About'], ['costly', 'Bad Luck'], ['severe', 'Proper Mess']]
    .filter(([k]) => state.hazard[k]).map(([k, l]) => `<li><b>${l}:</b> ${esc(describeConsequence(state.hazard[k]))}${state.hazard.armoured && state.hazard[k]?.damage ? ' (armour helps)' : ''}</li>`).join('')}</ul>` : '';
  const rows = state.actorIds.map(id => {
    const a = game.actors?.get?.(id), res = state.results[id], name = res?.name ?? a?.name ?? 'Someone';
    if (res) return `<div class="smoke-req-row done ${res.success ? 'win' : 'lose'}"><b>${esc(name)}</b><span class="smoke-req-out ${esc(res.outcomeKey)}">${esc(res.outcome || '')} <small>${res.total}${res.tn != null ? ` vs ${res.tn}` : ''} · ${esc(STATS[res.stat]?.abbr || '')}</small></span>${res.applied ? `<small class="smoke-req-applied">${esc(res.applied)}</small>` : ''}</div>`;
    const buttons = state.responses.map(r => `<button type="button" data-smoke-respond="${esc(state.id)}" data-actor="${esc(id)}" data-stat="${esc(r.stat)}" data-label="${esc(r.label)}" title="${esc(r.hint || '')}">${esc(r.label)} <small>${esc(STATS[r.stat].abbr)}</small></button>`).join('');
    return `<div class="smoke-req-row"><b>${esc(name)}</b><div class="smoke-buttons">${buttons}</div></div>`;
  }).join('');
  const team = state.team ? `<div class="smoke-req-team ${state.team.success ? 'win' : 'lose'}"><b>Team average ${state.team.average}${state.team.tn ? ` vs ${state.team.tn}` : ''}:</b> ${esc(state.team.outcome || '')}</div>` : '';
  return `<section class="smoke-card request ${state.kind}"><header><span class="kicker">${KICKER[state.kind] || 'ROLL REQUEST'}</span><strong>${esc(state.title)}</strong></header>
    ${state.text ? `<p>${esc(state.text)}</p>` : ''}<div class="smoke-req-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>${hazardLines}
    <div class="smoke-req-rows">${rows}</div>${team}
    ${state.guide ? `<p class="gm smoke-dim"><i class="fa-solid fa-user-secret"></i> ${esc(state.guide)}</p>` : ''}</section>`;
}

/** A player (or the GM) answers: roll that character's stat against the request. */
export async function respond(message, {requestId, actorId, stat, label}) {
  const state = message?.getFlag?.(NS, 'request'); if (!state || state.id !== requestId) throw new Error('That request has gone.');
  if (state.results[actorId]) throw new Error('Already rolled.');
  const actor = game.actors.get(actorId); if (!actor) throw new Error('Character not found.');
  if (!actor.isOwner) throw new Error(`${actor.name} is not yours to roll for.`);
  return actor.rollStat(stat, {band: state.tn ? null : state.band, tn: state.tn, label: `${state.title}: ${label}`, context: {kind: 'request', requestId, messageId: message.id, actorId}});
}

/** Leader GM: a request roll came in. Record it, apply hazard consequences, finish teamwork.
 * Answers to one card are handled one at a time from a fresh read of the card: a whole crew answering a teamwork
 * check at once used to overwrite each other's results (and a lost answer could be rolled, and hurt, twice). */
const cardQueues = new Map();
export function recordResponse(message, roll) {
  const key = message?.id ?? 'none';
  const next = (cardQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(() => recordResponseNow(game.messages?.get?.(message?.id) ?? message, roll));
  cardQueues.set(key, next);
  void next.finally(() => { if (cardQueues.get(key) === next) cardQueues.delete(key); }).catch(() => {});
  return next;
}
async function recordResponseNow(message, roll) {
  const state = foundry.utils.deepClone(message.getFlag(NS, 'request')); if (!state || state.results[roll.context.actorId]) return null;
  if (!state.actorIds.includes(roll.context.actorId)) return null;   // only the characters the GM asked
  const actor = game.actors.get(roll.context.actorId);
  if (actor && roll.actorUuid && roll.actorUuid !== actor.uuid) return null;   // a roll can only answer for its own character
  if (roll.stat && !state.responses.some(r => r.stat === roll.stat)) return null;
  const res = {name: actor?.name ?? roll.actorName, stat: roll.stat, total: roll.total, tn: roll.tn, margin: roll.margin, outcomeKey: roll.outcomeKey, outcome: roll.outcome, success: Boolean(roll.success), applied: ''};
  if (state.kind === 'hazard' && actor) {
    const c = hazardFor(state.hazard, roll.outcomeKey);
    res.applied = c ? describeConsequence(c, {armour: actor.system?.armour, armoured: state.hazard?.armoured}) : 'No harm done.';
    if (c && state.autoApply) await applyConsequence(actor, c, {armoured: state.hazard?.armoured, reason: state.title});
    else if (c) res.applied += ' (not applied)';
  }
  state.results[roll.context.actorId] = res;
  if (state.kind === 'teamwork' && state.actorIds.every(id => state.results[id])) {
    const t = teamworkResult(state.actorIds.map(id => state.results[id].total), state.tn);
    state.team = {average: t.average, tn: t.tn, outcome: t.outcome?.label ?? null, success: t.outcome ? isSuccess(t.outcome.key) : null};
  }
  await message.update({content: renderRequest(state), [`flags.${NS}.request`]: state});
  return state;
}
/** The most Heat a street event's consequence can bring on its own (0.5.22: only crimes, and killings above all, go higher). */
export const MISHAP_HEAT_CAP = 2;
export async function applyConsequence(actor, c, {armoured = false, reason = ''} = {}) {
  const dmg = hazardDamage(c, actor.system?.armour, armoured);
  if (dmg) await actor.applyDamage(dmg);
  for (const name of c.conditions || []) if (name !== 'Down' || Number(actor.system?.resources?.health?.value) <= 0) await actor.addCondition(name);
  // A street mishap (being recognised, a tip-off) is not a crime: it can bring a patrol (2★ at most), never armed police.
  if (c.heat) { const now = Math.max(0, Math.min(5, Number(actor.system?.heat?.value) || 0)), to = Math.max(now, Math.min(now + Number(c.heat), MISHAP_HEAT_CAP)); if (to > now) await actor.changeHeat(to - now, reason); }
  if (c.cashPct) { const lose = Math.round(Number(actor.system.cash || 0) * Number(c.cashPct) / 100); if (lose) await actor.changeCash(-lose, `${reason}: gone.`); }
}

export function installRequests() {
  Hooks.on('createChatMessage', msg => {
    if (!isLeader()) return; const roll = msg.getFlag?.(NS, 'roll'); if (roll?.context?.kind !== 'request') return;
    const target = game.messages.get(roll.context.messageId); if (!target) return;
    recordResponse(target, roll).catch(error => console.warn('The Smoke | request', error));
  });
}
