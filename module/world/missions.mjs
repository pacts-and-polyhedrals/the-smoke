// Missions: the "On Your Bike" story as a tracker. Missions unlock as earlier ones finish; starting one posts its brief
// and puts its objectives on everyone's phone; objectives with an `auto` rule tick themselves when the thing happens in
// play (reaching a map, selling to a fence, a respray, a finished job, a purchase); the GM ticks the rest. When every
// objective is done: MISSION PASSED, and the rewards go to everyone on it.
import {NS} from '../config.mjs';
import {isLeader, registerHandler, request, card, esc, ownersOf} from './net.mjs';

const KEY = 'missions', FACTIONS = 'factions';
/** Renown ranks (the Sandbox Campaign): the Influence cap rises with rank. */
export const RANKS = Object.freeze([{at: 0, name: 'Unproven', cap: 1}, {at: 3, name: 'Known', cap: 2}, {at: 7, name: 'Trusted', cap: 3}, {at: 12, name: 'Connected', cap: 4}, {at: 18, name: 'Insider', cap: 5}, {at: 25, name: 'Pillar', cap: 6}]);
export const STANCES = Object.freeze(['open', 'allied', 'strained', 'hostile']);
export const rankOf = renown => [...RANKS].reverse().find(r => Number(renown) >= r.at) ?? RANKS[0];
/** Each faction's standing with the crew: Renown, Influence (spent on favours, capped by rank) and stance. */
export const factionState = () => { try { return game.settings.get(NS, FACTIONS) || {}; } catch (_e) { return {}; } };
export const standing = (fac, code) => ({renown: 0, influence: 0, stance: 'open', ...(fac?.[code] || {})});
let DATA = null;
export async function missionData() { if (DATA) return DATA; DATA = await fetch(`systems/${NS}/data/london-missions.json`).then(r => r.json()).catch(() => ({missions: []})); return DATA; }
export const missionState = () => { try { return game.settings.get(NS, KEY) || {}; } catch (_e) { return {}; } };
export function registerMissionSettings() {
  game.settings.register(NS, KEY, {scope: 'world', config: false, type: Object, default: {}, onChange: () => Hooks.callAll('smokeMissionsChanged')});
  game.settings.register(NS, FACTIONS, {scope: 'world', config: false, type: Object, default: {}, onChange: () => Hooks.callAll('smokeMissionsChanged')});
}

/* ------------------------------------------------------------------ pure rules (tested) */
/** A mission's status from the saved state: done / failed / active / available / locked. A faction commission also
 * needs the crew's Renown with that faction to reach its offer gate (the GM can start any mission anyway). */
export function statusOf(m, state, fac = null) {
  const s = state[m.id]; if (s?.status) return s.status;
  if (!(m.requires || []).every(r => state[r]?.status === 'done')) return 'locked';
  if (m.faction && Number(m.gate || 0) > standing(fac ?? factionState(), m.faction).renown) return 'locked';
  return 'available';
}
/** Why a mission is locked, in words. */
export function lockReason(m, state, data, fac = null) {
  const missing = (m.requires || []).filter(r => state[r]?.status !== 'done').map(r => data?.missions?.find(x => x.id === r)).filter(Boolean);
  const out = missing.map(x => `${x.code ?? `Mission ${x.n}`} ${x.title}`);
  if (m.faction && Number(m.gate || 0) > standing(fac ?? factionState(), m.faction).renown) out.push(`Renown ${m.gate} with ${data?.factions?.[m.faction]?.name ?? m.faction}`);
  return out.join(' and ');
}
/** Who gets Renown for a mission: a career pays its faction; a local case pays one of its named factions (the GM picks). */
export function renownAward(m, pick = null) {
  if (m.rewards?.renown) return {...m.rewards.renown};
  const opts = m.rewards?.renownPick || []; if (!opts.length) return {};
  const to = opts.includes(pick) ? pick : opts[0];
  return {[to]: Number(m.rewards.renownAmount || 1)};
}
/** Apply a passed mission to faction standings: Renown up; Influence restored by the mission, up to the rank cap. */
export function applyStanding(fac, m, pick = null) {
  const out = foundry.utils.deepClone(fac || {}), award = renownAward(m, pick), changes = [];
  for (const [code, n] of Object.entries(award)) {
    const st = standing(out, code), before = rankOf(st.renown); st.renown += Number(n);
    const after = rankOf(st.renown); if (m.faction === code && m.rewards?.influence) st.influence = Math.min(after.cap, st.influence + Number(m.rewards.influence));
    out[code] = st; changes.push({code, renown: Number(n), total: st.renown, rank: after.name, ranked: after.name !== before.name});
  }
  return {factions: out, changes};
}
/** Each crew member's share of a crew fee (plus any per-head cash). */
export const shareOf = (m, n) => Number(m.rewards?.cash || 0) + (m.rewards?.fee ? Math.floor(Number(m.rewards.fee) / Math.max(1, n)) : 0);
export const label = m => m.code ? `${m.code} ${m.title}` : `${m.n}. ${m.title}`;
/** How many times an objective needs ticking (an auto rule's count, else 1). */
export const needed = o => Math.max(1, Number(o.auto?.count || 1));
export const objectiveDone = (o, s) => Number(s?.ticks?.[o.id] || 0) >= needed(o);
export const allDone = (m, s) => m.objectives.every(o => objectiveDone(o, s));
/** Does a game event satisfy an objective's auto rule? */
export function matches(auto, ev) {
  if (!auto || auto.on !== ev.on) return false;
  switch (auto.on) {
    case 'sold': return auto.service === ev.service && (!auto.ids || auto.ids.includes(ev.catalogId));
    case 'map': return auto.mapId === ev.mapId || (auto.mapIds || []).includes(ev.mapId);
    case 'service': return auto.service === ev.service;
    case 'job': return !auto.type || auto.type === ev.type;
    case 'buy': return !auto.shop || auto.shop === ev.shop;
  }
  return false;
}
/** Apply an event to the state: returns the ids of missions whose objectives moved. Mutates `state`. */
export function applyEvent(missions, state, ev) {
  const moved = [];
  for (const m of missions) {
    const s = state[m.id]; if (s?.status !== 'active') continue;
    if (ev.actorId && s.actorIds?.length && !s.actorIds.includes(ev.actorId)) continue;
    for (const o of m.objectives) {
      if (objectiveDone(o, s) || !matches(o.auto, ev)) continue;
      s.ticks = {...(s.ticks || {}), [o.id]: Number(s.ticks?.[o.id] || 0) + 1}; moved.push(m.id);
    }
  }
  return [...new Set(moved)];
}

/* ------------------------------------------------------------------ leader: changes and rewards */
async function save(mutator) { const st = foundry.utils.deepClone(missionState()); const r = await mutator(st); await game.settings.set(NS, KEY, st); return r; }
const gmOnly = userId => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); };
const toAll = actorIds => [...new Set([...actorIds.flatMap(id => ownersOf(game.actors.get(id))), ...game.users.filter(u => u.isGM).map(u => u.id)])];

async function passMission(m, st, pick = null) {
  const s = st[m.id]; s.status = 'done'; s.doneAt = Date.now();
  const {awardXP} = await import('./jobs.mjs'); const names = [], ids = (s.actorIds || []).filter(id => game.actors.get(id)), share = shareOf(m, ids.length);
  for (const id of ids) {
    const a = game.actors.get(id); names.push(a.name);
    if (share) await a.changeCash(share, `${label(m)}.`);
    const up = {}; for (const [k, v] of Object.entries(m.rewards.rep || {})) up[`system.rep.${k}`] = Number(a.system.rep?.[k] || 0) + Number(v);
    if (Object.keys(up).length) await a.update(up);
    if (m.rewards.xp) await awardXP(a, m.rewards.xp, label(m));
  }
  const data = await missionData();
  const oldFac = factionState(), {factions, changes} = applyStanding(oldFac, m, pick ?? s.renownTo);
  const before = {...st, [m.id]: {...s, status: 'active'}};
  const opened = data.missions.filter(x => x.id !== m.id && statusOf(x, before, oldFac) === 'locked' && statusOf(x, st, factions) === 'available');
  if (changes.length) await game.settings.set(NS, FACTIONS, factions);
  const fee = m.rewards.fee ? ` (crew fee £${m.rewards.fee})` : '';
  const renown = changes.map(c => `+${c.renown} Renown with ${esc(data.factions?.[c.code]?.name ?? c.code)} (${c.total}, ${c.rank}${c.ranked ? ' — new rank!' : ''})`).join('; ');
  await card('MISSION PASSED', label(m), `<p class="smoke-passed">MISSION PASSED</p><p>${esc(names.join(', ') || 'Nobody')}: £${share} each${fee}, ${m.rewards.xp} XP${Object.keys(m.rewards.rep || {}).length ? ', and Rep' : ''}.</p>
    ${renown ? `<p>${renown}.</p>` : ''}${opened.length ? `<p>Now open: ${opened.map(x => `<b>${esc(label(x))}</b>`).join(', ')}.</p>` : ''}`, 'mission');
}
registerHandler('mission.start', async ({id, actorIds = [], userId}) => {
  gmOnly(userId); const data = await missionData(); const m = data.missions.find(x => x.id === id); if (!m) throw new Error('No such mission.');
  const ids = actorIds.length ? actorIds : game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner).map(a => a.id);
  await save(st => { st[id] = {status: 'active', ticks: {}, actorIds: ids, startedAt: Date.now()}; });
  const pays = m.rewards.fee ? `a £${m.rewards.fee} crew fee` : `£${m.rewards.cash} each`;
  return card(`${m.code ?? `MISSION ${m.n}`} · ${m.giver.toUpperCase()}`, m.title, `<p><i>${esc(m.where)}</i></p><p>${esc(m.hook)}</p><ol>${m.objectives.map(o => `<li>${esc(o.text)}</li>`).join('')}</ol>
    <p class="smoke-dim">Pays ${pays} and ${m.rewards.xp} XP. Objectives are on your phone${m.stops?.length ? '; Directions puts the sat nav on the next place' : ''}.</p>`, 'mission', {whisper: toAll(ids)});
});
registerHandler('mission.tick', async ({id, objId, delta = 1, userId}) => {
  gmOnly(userId); const data = await missionData(); const m = data.missions.find(x => x.id === id); if (!m) return;
  return save(async st => {
    const s = st[id]; if (s?.status !== 'active') throw new Error('Start the mission first.');
    const o = m.objectives.find(x => x.id === objId); s.ticks = {...(s.ticks || {}), [objId]: Math.max(0, Math.min(needed(o), Number(s.ticks?.[objId] || 0) + Number(delta)))};
    if (allDone(m, s)) await passMission(m, st);
  });
});
registerHandler('mission.set', async ({id, status, renownTo = null, userId}) => {
  gmOnly(userId); const data = await missionData(); const m = data.missions.find(x => x.id === id); if (!m) return;
  return save(async st => {
    if (status === 'reset') { delete st[id]; return; }
    if (status === 'done') { st[id] ??= {status: 'active', ticks: {}, actorIds: game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner).map(a => a.id)}; return passMission(m, st, renownTo); }
    if (status === 'failed') { st[id] = {...(st[id] || {}), status: 'failed'}; return card('MISSION FAILED', label(m), '<p class="smoke-failed">MISSION FAILED</p><p>The GM can reset it to try again.</p>', 'lose'); }
  });
});
/** Leader: an event happened in play. Tick any matching auto objectives. */
export async function missionEvent(ev) {
  if (!isLeader()) return [];
  const data = await missionData(); const st = foundry.utils.deepClone(missionState());
  const moved = applyEvent(data.missions, st, ev); if (!moved.length) return [];
  for (const id of moved) {
    const m = data.missions.find(x => x.id === id), s = st[id];
    if (allDone(m, s)) await passMission(m, st);
    else await card(m.code ?? `MISSION ${m.n}`, m.title, `<p>${m.objectives.map(o => `${objectiveDone(o, s) ? '☑' : '☐'} ${esc(o.text)}${needed(o) > 1 ? ` (${Math.min(needed(o), Number(s.ticks?.[o.id] || 0))}/${needed(o)})` : ''}`).join('<br>')}</p>`, 'mission', {whisper: toAll(s.actorIds || [])});
  }
  await game.settings.set(NS, KEY, st);
  return moved;
}

export function installMissions() {
  Hooks.on('smokeVehicleSold', ({seller, service, catalogId}) => missionEvent({on: 'sold', service, catalogId, actorId: seller?.id}).catch(e => console.warn('The Smoke | mission', e)));
  Hooks.on('smokeTransit', ({target, idMap}) => {
    const mapId = target?.getFlag?.(NS, 'streetAtlas')?.id ?? target?.getFlag?.(NS, 'place')?.id; if (!mapId) return;
    const actors = Object.values(idMap || {}).map(id => target.tokens.get(id)?.actor).filter(a => a?.type === 'character');
    for (const a of actors) missionEvent({on: 'map', mapId, actorId: a.id}).catch(e => console.warn('The Smoke | mission', e));
  });
  Hooks.on('smokeService', ({actor, service}) => missionEvent({on: 'service', service, actorId: actor?.id}).catch(() => null));
  Hooks.on('smokeJobDone', ({actor, type}) => missionEvent({on: 'job', type, actorId: actor?.id}).catch(() => null));
  Hooks.on('smokeBought', ({actor, shop}) => missionEvent({on: 'buy', shop, actorId: actor?.id}).catch(() => null));
}
/** GM: change a faction's standing (Renown, Influence within its cap, stance). */
registerHandler('faction.set', async ({code, renown, influence, stance, userId}) => {
  gmOnly(userId); const data = await missionData(); if (!data.factions?.[code]) throw new Error('No such faction.');
  const fac = foundry.utils.deepClone(factionState()), st = standing(fac, code);
  if (renown !== undefined) st.renown = Math.max(0, Math.min(99, Math.round(Number(renown) || 0)));
  if (influence !== undefined) st.influence = Math.max(0, Math.min(rankOf(st.renown).cap, Math.round(Number(influence) || 0)));
  else st.influence = Math.min(st.influence, rankOf(st.renown).cap);
  if (stance !== undefined) { if (!STANCES.includes(stance)) throw new Error('Unknown stance.'); st.stance = stance; }
  fac[code] = st; await game.settings.set(NS, FACTIONS, fac); return st;
});
export const missionsAPI = {data: missionData, state: missionState, statusOf, factions: factionState, standing, rankOf, RANKS, STANCES,
  start: (id, actorIds = []) => request('mission.start', {id, actorIds}), tick: (id, objId, delta = 1) => request('mission.tick', {id, objId, delta}),
  set: (id, status, renownTo = null) => request('mission.set', {id, status, renownTo}), faction: (code, change) => request('faction.set', {code, ...change}), event: missionEvent};
