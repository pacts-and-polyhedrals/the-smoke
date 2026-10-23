// Missions: the "On Your Bike" story as a tracker. Missions unlock as earlier ones finish; starting one posts its brief
// and puts its objectives on everyone's phone; objectives with an `auto` rule tick themselves when the thing happens in
// play (reaching a map, selling to a fence, a respray, a finished job, a purchase); the GM ticks the rest. When every
// objective is done: MISSION PASSED, and the rewards go to everyone on it.
import {NS} from '../config.mjs';
import {withActionLocks} from './action-locks.mjs';
import {isLeader, registerHandler, request, card, esc, ownersOf} from './net.mjs';
import {canCreditPaintObjective} from '../graffiti/core.mjs';
import {compileMission,validateContract,requirementsFor,checkpointNeeded,checkpointDone,checkpointReady,allCheckpointsDone,canAcceptReceipt,recordReceipt} from '../rules/mission-contract.mjs';

const KEY = 'missions', FACTIONS = 'factions';
/** Renown ranks (the Sandbox Campaign): the Influence cap rises with rank. */
export const RANKS = Object.freeze([{at: 0, name: 'Unproven', cap: 1}, {at: 3, name: 'Known', cap: 2}, {at: 7, name: 'Trusted', cap: 3}, {at: 12, name: 'Connected', cap: 4}, {at: 18, name: 'Insider', cap: 5}, {at: 25, name: 'Pillar', cap: 6}]);
export const STANCES = Object.freeze(['open', 'allied', 'strained', 'hostile']);
export const rankOf = renown => [...RANKS].reverse().find(r => Number(renown) >= r.at) ?? RANKS[0];
/** Each faction's standing with the crew: Renown, Influence (spent on favours, capped by rank) and stance. */
export const factionState = () => { try { return game.settings.get(NS, FACTIONS) || {}; } catch (_e) { return {}; } };
export const standing = (fac, code) => ({renown: 0, influence: 0, stance: 'open', ...(fac?.[code] || {})});
let DATA=null,DATA_LOADING=null,CONTRACTS=null;
/** Installed by the mandatory ready-time mission automation bootstrap. Legacy library callers
 * remain usable; production startup refuses new jobs when contract loading fails. */
export async function configureMissionContracts(contracts) {
  const data=await missionData();
  for(const m of data.missions){const errors=validateContract(m,contracts?.missions?.[m.id]);if(errors.length)throw new Error(`${m.id}: ${errors.join('; ')}`);}
  if(game.smoke)game.smoke.missionCodes=Object.fromEntries(data.missions.map(m=>[m.id,m.code]));
  CONTRACTS=contracts;DATA={...data,missions:data.missions.map(m=>compileMission(m,contracts.missions[m.id]))};return DATA;
}
export async function missionData(){
  if(DATA)return DATA;
  if(DATA_LOADING)return DATA_LOADING;
  DATA_LOADING=(async()=>{
    const base=await fetch(`systems/${NS}/data/london-missions.json`).then(r=>r.json()).catch(()=>({missions:[]}));
    // Additional missions live outside the original 125-mission content data; upgrades never rewrite older IDs.
    const extra=await fetch(`systems/${NS}/data/tagging-missions.json`).then(r=>r.ok===false?null:r.json()).catch(()=>null);
    const tags=Array.isArray(extra?.missions)?extra.missions.filter(m=>m.taggingOnly&&m.group==='tagging'):[];
    const air=await fetch(`systems/${NS}/data/radio-war-missions.json`).then(r=>r.ok===false?null:r.json()).catch(()=>null);
    const radio=Array.isArray(air?.missions)?air.missions.filter(m=>m.radioOnly&&m.group==='radio'):[];
    const ids=new Set(base.missions.map(m=>m.id));
    base.missions=[...base.missions,...[...tags,...radio].filter(m=>!ids.has(m.id)&&ids.add(m.id))];
    base.groups=[...(base.groups||[]),...(extra?.groups||[]).filter(g=>g.key==='tagging'&&!(base.groups||[]).some(old=>old.key===g.key)),
      ...(air?.groups||[]).filter(g=>g.key==='radio'&&!(base.groups||[]).some(old=>old.key===g.key))];
    DATA=base;return DATA;
  })().catch(e=>{DATA_LOADING=null;throw e;});
  return DATA_LOADING;
}
export const missionState = () => { try { return game.settings.get(NS, KEY) || {}; } catch (_e) { return {}; } };
export function registerMissionSettings() {
  game.settings.register(NS, KEY, {scope: 'world', config: false, type: Object, default: {}, onChange: () => Hooks.callAll('smokeMissionsChanged')});
  game.settings.register(NS, FACTIONS, {scope: 'world', config: false, type: Object, default: {}, onChange: () => Hooks.callAll('smokeMissionsChanged')});
  game.settings.register(NS, 'playMode', {name: 'How the missions are played', hint: 'Story mode: the GM runs the storyline; players only get the side work (shifts, Pat\'s orders, hustles) and the missions the GM starts. Self-play: players can open any mission, start it and complete verified actions themselves, whenever they like (a GM account still has to be logged in somewhere, even idle).',
    scope: 'world', config: true, type: String, default: 'story', choices: {story: 'Story mode (the GM runs the missions)', self: 'Self-play (players run the missions)'}, onChange: () => Hooks.callAll('smokeMissionsChanged')});
}
/** The play mode: 'story' (the GM runs the storyline) or 'self' (players run missions themselves). */
export const playMode = () => { try { return game.settings.get(NS, 'playMode') === 'self' ? 'self' : 'story'; } catch (_e) { return 'story'; } };
/** Can this user start, tick and finish missions? The GM always; players only in self-play, and only with a character. */
export function canRunMissions(user) {
  if (!user) return false; if (user.isGM) return true;
  return playMode() === 'self' && (game.actors?.some?.(a => a.type === 'character' && a.testUserPermission?.(user, 'OWNER')) ?? false);
}
/** In story mode a player only sees the missions the GM has started for the crew (on, passed or failed). */
export const visibleToPlayers = (status, mode = playMode()) => mode === 'self' || ['active', 'done', 'failed'].includes(status);

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
export const needed = checkpointNeeded;
export const objectiveDone = checkpointDone;
export const allDone = allCheckpointsDone;
/** Does a game event satisfy an objective's auto rule? */
export function matches(auto, ev) {
  if (!auto || auto.on !== ev.on) return false;
  switch (auto.on) {
    case 'checkpoint': case 'checkpointArrival': return auto.stepId===ev.stepId;
    case 'vehicleNicked': case 'vehicleReturned': case 'boarded': case 'heatClear': case 'safeCargoReturn': case 'safeExit': case 'vehicleRetained': case 'escortArrived': case 'encounterResolved': case 'crewHome': return true;
    case 'sold': return auto.service === ev.service && (!auto.ids || auto.ids.includes(ev.catalogId));
    case 'map': return auto.mapId === ev.mapId || (auto.mapIds || []).includes(ev.mapId);
    case 'service': return auto.service === ev.service;
    case 'job': return !auto.type || auto.type === ev.type;
    case 'buy': return !auto.shop || auto.shop === ev.shop;
    case 'cargoCollected':
    case 'cargoDelivered': return auto.propId === ev.propId;
    case 'tagPlaced': return canCreditPaintObjective(auto,ev);
    case 'radioWar': return auto.stationId===ev.stationId && auto.actionId===ev.actionId;
  }
  return false;
}
/** Apply an event to the state: returns the ids of missions whose objectives moved. Mutates `state`. */
export function applyEvent(missions, state, ev) {
  const moved=[];
  for(const m of missions){
    const s=state[m.id];if(s?.status!=='active')continue;
    if(ev.actorId && s.actorIds?.length && !s.actorIds.includes(ev.actorId))continue;
    if (['cargoCollected','cargoDelivered'].includes(ev.on)) {
      if (m.id !== ev.missionId || !ev.missionRunId || s.runId !== ev.missionRunId || !ev.serial) continue;
      // One parcel is one work unit. Dropping/recollecting it must not manufacture progress.
      if (ev.status !== (ev.on === 'cargoCollected' ? 'held' : 'delivered')) continue;
    }
    if(ev.on==='radioWar'){
      if(!m.radioWar||m.id!==ev.missionId||!ev.attemptId||!ev.missionRunId||s.runId!==ev.missionRunId)continue;
      if((s.radioProof||[]).includes(ev.attemptId))continue;
      s.radioProof=[...(s.radioProof||[]),ev.attemptId].slice(-100);
    }
    if(ev.on==='tagPlaced'){
      if(!m.tagging || m.id!==ev.missionId || !ev.markId || !ev.missionRunId || s.runId!==ev.missionRunId)continue;
      if((s.paintMarks||[]).includes(ev.markId))continue; // replayed event never awards twice
      // Only a validated, durable mark emitted by the GM graffiti handler can reach this API.
      s.paintMarks=[...(s.paintMarks||[]),ev.markId].slice(-200);
    }
    const oldTicks={...(s.ticks||{})};
    for(const o of m.objectives){
      if(objectiveDone(o,s)||!matches(o.auto,ev)||!canAcceptReceipt(m,o,s,ev,oldTicks))continue;
      if(ev.on==='tagPlaced'){
        const seen=s.tagProof?.[o.id]||[];
        if(seen.includes(ev.siteId))continue; // repeated attempts at a site do not multiply progress
        s.tagProof={...(s.tagProof||{}),[o.id]:[...seen,ev.siteId]};
      }
      if (['cargoCollected','cargoDelivered'].includes(ev.on)) {
        const seen = s.cargoProof?.[o.id] || [];
        if (seen.includes(ev.serial)) continue;
        s.cargoProof = {...(s.cargoProof || {}), [o.id]: [...seen, ev.serial]};
      }
      if(s.automationVersion===1)recordReceipt(o,s,ev);
      s.ticks={...(s.ticks||{}),[o.id]:Number(s.ticks?.[o.id]||0)+1}; moved.push(m.id);
    }
  }
  return [...new Set(moved)];
}

/* ------------------------------------------------------------------ leader: changes and rewards */
/**
 * Every change to the mission state goes through one queue and starts from a fresh read, so two things happening at
 * once (two of the crew crossing into the mission's map together, a sale and a tick, cargo and a graffiti proof) can't
 * overwrite each other or pass the same mission twice (paying everyone twice).
 */
/** Returned by a mutator that changed nothing. */
export const NO_WRITE = Symbol('noWrite');
let missionChain = Promise.resolve();
export function withMissionState(mutator) {
  const next = missionChain.catch(() => {}).then(async () => {
    const st = foundry.utils.deepClone(missionState());
    const out = await mutator(st);
    if (out !== NO_WRITE) await game.settings.set(NS, KEY, st);
    return out === NO_WRITE ? null : out;
  });
  missionChain = next.catch(() => {});
  return next;
}
async function save(mutator) { return withMissionState(mutator); }
const gmOnly = userId => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); };
const runner = userId => { if (!canRunMissions(game.users.get(userId))) throw new Error(playMode() === 'story' ? 'Story mode: the GM runs the missions.' : 'You need a character to run missions.'); };
const toAll = actorIds => [...new Set([...actorIds.flatMap(id => ownersOf(game.actors.get(id))), ...game.users.filter(u => u.isGM).map(u => u.id)])];

async function passMission(m, st, pick = null) {
  const s=st[m.id];if(s.status==='done')return;
  const run=s.runId||`legacy-${s.startedAt||m.id}`,receiptId=`${m.id}-${run}`;
  const ids=(s.actorIds||[]).filter(id=>game.actors.get(id)),names=[],share=shareOf(m,ids.length);
  // Each actor's payout and its receipt share ONE document update. A retry after a
  // connection failure cannot add cash/XP a second time, even before mission state saves.
  for(const id of ids)await withActionLocks([`actor:${id}`],async()=>{
    const a=game.actors.get(id);names.push(a.name);
    if(a.getFlag(NS,'missionRewards')?.[receiptId])return;
    const up={'system.cash':Number(a.system.cash||0)+share,'system.rep.xp':Number(a.system.rep?.xp||0)+Number(m.rewards.xp||0),
      [`flags.${NS}.missionRewards.${receiptId}`]:{missionId:m.id,runId:run,cash:share,xp:Number(m.rewards.xp||0),at:Number(game.time?.worldTime||0)}};
    for(const [k,v]of Object.entries(m.rewards.rep||{}))up[`system.rep.${k}`]=Number(a.system.rep?.[k]||0)+Number(v);
    await a.update(up);
  });
  const data=await missionData(),oldFac=factionState();let factions=oldFac,changes=[];
  if(!oldFac.__missionRewards?.[receiptId]){
    ({factions,changes}=applyStanding(oldFac,m,pick??s.renownTo));
    factions.__missionRewards={...(oldFac.__missionRewards||{}),[receiptId]:{at:Number(game.time?.worldTime||0)}};
    await game.settings.set(NS,FACTIONS,factions);
  }
  s.status='done';s.doneAt=Date.now();s.rewardReceipt=receiptId;
  const before={...st,[m.id]:{...s,status:'active'}};
  const opened=data.missions.filter(x=>x.id!==m.id&&statusOf(x,before,oldFac)==='locked'&&statusOf(x,st,factions)==='available');
  const renown=changes.map(c=>`+${c.renown} Renown with ${esc(data.factions?.[c.code]?.name??c.code)} (${c.total}, ${c.rank})`).join('; ');
  try{await card('MISSION PASSED',label(m),`<p class="smoke-passed">MISSION PASSED</p><p>${esc(names.join(', '))}: £${share} each, ${m.rewards.xp||0} XP.</p>${renown?`<p>${renown}.</p>`:''}${opened.length?`<p>Now open: ${opened.map(x=>`<b>${esc(label(x))}</b>`).join(', ')}.</p>`:''}`,'mission');}
  catch(e){console.warn('The Smoke | payout saved; announcement failed',e);}
}
registerHandler('mission.start', async ({id, actorIds = [], userId, overrideReason = ''}) => {
  runner(userId); const data = await missionData(); const m = data.missions.find(x => x.id === id); if (!m) throw new Error('No such mission.');
  if (!game.users.get(userId)?.isGM && statusOf(m, missionState(), factionState()) !== 'available') throw new Error(`Not open yet: ${lockReason(m, missionState(), data, factionState()) || 'already on or done'}.`);
  if(game.smoke?.missionAutomationError)throw new Error(game.smoke.missionAutomationError);
  const user=game.users.get(userId);
  const ids = [...new Set(actorIds.length ? actorIds : game.actors.filter(a => a.type === 'character' && (user?.isGM?a.hasPlayerOwner:a.testUserPermission?.(user,'OWNER'))).map(a => a.id))];
  if(m.automation){
    if(!ids.length||ids.length>6||ids.some(x=>game.actors.get(x)?.type!=='character'))throw new Error('Choose one to six distinct player characters.');
    if(!user?.isGM && ids.some(x=>!game.actors.get(x)?.testUserPermission?.(user,'OWNER')))throw new Error('Start with your own characters; teammates can join the running mission themselves.');
    const blocked=statusOf(m,missionState(),factionState())!=='available'||ids.some(x=>Number(game.actors.get(x)?.system.stage||1)<Number(m.minRep||1));
    if(blocked && (!user?.isGM || String(overrideReason).trim().length<8))throw new Error(`Mission prerequisites or Rep ${m.minRep||1} not met. A GM override needs a reason of at least eight characters.`);
  }
  await save(st => { if(st[id]?.status==='active') throw new Error('This mission is already active. Reset it from Mission Board before starting a new run.'); st[id] = {status: 'active', ticks: {}, actorIds: ids, startedAt: Date.now(), runId: foundry.utils.randomID(12), ...(m.automation?{automationVersion:1,requirements:requirementsFor(m,ids),contributions:{},receipts:{},choices:{},crewSnapshot:ids,overrideReason:String(overrideReason||''),preflightError:'Preparing mission resources.'}:{})}; });
  if(m.automation)await (await import('./mission-automation.mjs')).prepareMission(m);
  if (m.props?.length) await (await import('./mission-props.mjs')).ensureMissionProps(m);
  if (m.tagging) await (await import('../graffiti/runtime.mjs')).ensureMissionPaintSpotsForMission(m);
  // 0.5.23: "get to X" ticks for anyone already standing there (before, they had to leave the map and come back)
  if (m.objectives.some(o => o.auto?.on === 'map')) for (const {mapId, actorId} of crewWhereabouts(ids)) await missionEvent({on: 'map', mapId, actorId}).catch(e => console.warn('The Smoke | mission', e));
  const pays = m.rewards.fee ? `a £${m.rewards.fee} crew fee` : `£${m.rewards.cash} each`;
  const propNote = m.props?.length ? `<p><b>Physical cargo:</b> ${esc(m.props.map(p=>`${p.quantity||1} x ${p.name}`).join('; '))}. Go to the marked pickup scene, collect the actual map token(s), carry or drop the inventory item(s), and deliver all of them to the specified handover location. Read Mission Board → How to play this job without a GM.</p>` : '';
  return card(`${m.code ?? `MISSION ${m.n}`} · ${m.giver.toUpperCase()}`, m.title, `<p><i>${esc(m.where)}</i></p>${m.call?.length ? `<div class="smoke-call">${m.call.map(t => `<p class="sj-text in">${esc(t)}</p>`).join('')}</div>` : `<p>${esc(m.hook)}</p>`}<ol>${m.objectives.map(o => `<li>${esc(o.text)}</li>`).join('')}</ol>
    ${propNote}<p class="smoke-dim">Pays ${pays} and ${m.rewards.xp} XP. Objectives are on your phone${m.stops?.length ? '; Directions puts the sat nav on the next place' : ''}.</p>`, 'mission', {whisper: toAll(ids)});
});
/**
 * Tick an objective by hand. 0.5.27: when the automatic check doesn't catch something that happened in play, the GM
 * marks the step done in one go (`complete`), and in Self-play so can a player whose character is on the job, once the
 * earlier steps are done. Either way it is logged on the mission with who did it. A hand-marked step also counts as
 * taking part for the character who marked it (the GM's counts for anyone on the job who hasn't yet), so a job can
 * always be finished from the Mission Board. Before, only the GM could tick, one point at a time, with a written reason.
 */
registerHandler('mission.tick', async ({id, objId, delta = 1, complete = false, userId, reason = ''}) => {
  runner(userId); const data = await missionData(); const m = data.missions.find(x => x.id === id); if (!m) return;
  const user = game.users.get(userId), isGM = Boolean(user?.isGM);
  return save(async st => {
    const s = st[id]; if (s?.status !== 'active') throw new Error('Start the mission first.');
    const o = m.objectives.find(x => x.id === objId); if (!o) throw new Error('Unknown objective.');
    const mine = (s.actorIds || []).filter(a => game.actors.get(a)?.testUserPermission?.(user, 'OWNER'));
    if(m.automation){
      if(!isGM){
        if(!mine.length)throw new Error('Only a character on this job can mark its steps.');
        if(Number(delta) < 0)throw new Error('Ask the GM to reopen a step.');
        if(!checkpointReady(m,o,s))throw new Error('Finish the earlier steps first.');
      }
      const how=complete?'marked done':Number(delta)<0?'reopened':'advanced';
      s.recoveryLog=[...(s.recoveryLog||[]),{stepId:objId,delta:complete?'complete':Number(delta),reason:String(reason).trim()||`${isGM?'GM':'Player'} ${how} by hand`,userId,at:Date.now()}];
      if(Number(delta)>0||complete){
        s.contributions??={};
        for(const a of (isGM?(s.actorIds||[]).filter(x=>!Object.keys(s.contributions[x]||{}).length):mine.slice(0,1)))s.contributions[a]={...(s.contributions[a]||{}),[`manual:${objId}`]:{stepId:objId,worldTime:Number(game.time?.worldTime||0)}};
      }
    } else if (!isGM && ['cargoCollected','cargoDelivered','tagPlaced','radioWar'].includes(o.auto?.on)) throw new Error('This requires verified cargo, graffiti or radio-war activity. Use the actual map contact instead of ticking it by hand.');
    const want = complete ? needed(o,s) : Number(s.ticks?.[objId] || 0) + Number(delta);
    s.ticks = {...(s.ticks || {}), [objId]: Math.max(0, Math.min(needed(o,s), want))};
    if (allDone(m, s)) await passMission(m, st);
  });
});
/** Change who is on a running mission (0.5.23: a character added to the table after the start could never get credit). */
registerHandler('mission.crew', async ({id, actorIds = [], userId}) => {
  const user=game.users.get(userId);if(!user)throw new Error('Unknown user.');
  const ids = [...new Set(actorIds)].filter(x => game.actors.get(x)?.type === 'character');
  if (!ids.length) throw new Error('Tick at least one character.');
  const data=await missionData(),m=data.missions.find(x=>x.id===id);
  if(ids.length>6)throw new Error('At most six participating characters.');
  await save(st => {const s=st[id];if(s?.status!=='active')throw new Error('Start the mission first.');
    if(!user.isGM){const changed=[...new Set([...ids,...(s.actorIds||[])])].filter(x=>ids.includes(x)!==(s.actorIds||[]).includes(x));
      if(changed.some(x=>!game.actors.get(x)?.testUserPermission?.(user,'OWNER')))throw new Error('You may only join or leave with your own character.');}
    s.actorIds=ids;if(m?.automation)s.requirements=requirementsFor(m,ids,s);return ids;});
  if(m?.automation)await (await import('./mission-automation.mjs')).prepareMission(m);return ids;
});
registerHandler('mission.set', async ({id, status, renownTo = null, userId, reason = ''}) => {
  runner(userId); const data = await missionData(); const m = data.missions.find(x => x.id === id); if (!m) return;
  return save(async st => {
    if(m.automation && !game.users.get(userId)?.isGM && !(st[id]?.actorIds||[]).some(x=>game.actors.get(x)?.testUserPermission?.(game.users.get(userId),'OWNER')))throw new Error('Only a participating character may change this mission.');
    if(m.automation && ['reset','failed'].includes(status) && !game.users.get(userId)?.isGM)throw new Error('Ask the GM to reset or fail the whole crew mission.');
    if (status === 'reset') { if (st[id]) {await (await import('./mission-props.mjs')).cleanupMissionProps(m, st[id]);if(m.automation)await (await import('./mission-automation.mjs')).cleanupMissionResources(m,st[id]);} delete st[id]; return null; }
    if (status === 'done') {
      if(m.automation && !allDone(m,st[id]) && !game.users.get(userId)?.isGM)throw new Error('Complete the checkpoints and each participant contribution first (or mark a stuck step done).');
      if(m.automation && !allDone(m,st[id]))st[id].recoveryLog=[...(st[id].recoveryLog||[]),{action:'gm-passed',reason:String(reason).trim()||'GM passed the job',userId,at:Date.now()}];
      if (!game.users.get(userId)?.isGM && (!st[id] || st[id].status!=='active' || !allDone(m,st[id]))) throw new Error('Finish the objectives before claiming mission rewards. Physical deliveries and graffiti missions cannot be bypassed.');
      st[id] ??= {status: 'active', ticks: {}, actorIds: game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner).map(a => a.id)}; return passMission(m, st, renownTo); }
    if (status === 'failed') { if (st[id]) {await (await import('./mission-props.mjs')).cleanupMissionProps(m,st[id]);if(m.automation)await (await import('./mission-automation.mjs')).cleanupMissionResources(m,st[id]);} st[id] = {...(st[id] || {}), status: 'failed'}; return card('MISSION FAILED', label(m), '<p class="smoke-failed">MISSION FAILED</p><p>The GM can reset it to try again.</p>', 'lose'); }
  });
});
const sceneMapId = scene => { const id = scene?.getFlag?.(NS, 'streetAtlas')?.id ?? scene?.getFlag?.(NS, 'place')?.id; return id && id !== 'LDN-OVERVIEW' ? id : null; };
/** The street maps and venues each of these characters is standing on now (not riding hidden, not on the overview). */
export function crewWhereabouts(actorIds) {
  const out = [], seen = new Set();
  for (const scene of game.scenes ?? []) {
    const mapId = sceneMapId(scene); if (!mapId) continue;
    for (const t of scene.tokens ?? []) {
      if (!actorIds.includes(t.actorId) || t.hidden || seen.has(`${mapId}|${t.actorId}`)) continue;
      seen.add(`${mapId}|${t.actorId}`); out.push({mapId, actorId: t.actorId});
    }
  }
  return out;
}
/** Leader: an event happened in play. Tick any matching auto objectives. */
export async function missionEvent(ev) {
  if (!isLeader()) return [];
  const data = await missionData();
  // These three existing subsystems already validate their world actions on the leader.
  // Enrich only their run-bound receipts, never a client-supplied generic roll or map event.
  if(['cargoCollected','cargoDelivered','tagPlaced','radioWar'].includes(ev.on)&&ev.missionId&&ev.missionRunId&&!ev.location){
    const {pointOf}=await import('./mission-automation.mjs');const {actorToken}=await import('./spawn.mjs');
    const t=actorToken(game.actors.get(ev.actorId));ev={...ev,verified:true,location:pointOf(t),sceneId:t?.parent?.id,worldTime:Number(game.time?.worldTime||0)};
  }
  return (await withMissionState(async st => {
    const moved = applyEvent(data.missions, st, ev);
    if(ev.on==='missionContribution' && ev.missionId && st[ev.missionId]?.runId===ev.missionRunId && st[ev.missionId]?.status==='active' && ev.verified)moved.push(ev.missionId);
    if (!moved.length) return NO_WRITE;
    for (const id of moved) {
      const m = data.missions.find(x => x.id === id), s = st[id];
      if (allDone(m, s)) await passMission(m, st);
      else await card(m.code ?? `MISSION ${m.n}`, m.title, `<p>${m.objectives.map(o => `${objectiveDone(o, s) ? '☑' : '☐'} ${esc(o.text)}${needed(o,s) > 1 ? ` (${Math.min(needed(o,s), Number(s.ticks?.[o.id] || 0))}/${needed(o,s)})` : ''}`).join('<br>')}</p>`, 'mission', {whisper: toAll(s.actorIds || [])});
    }
    return moved;
  })) ?? [];
}

export function installMissions() {
  Hooks.on('smokeVehicleSold', ({seller, service, catalogId}) => missionEvent({on: 'sold', service, catalogId, actorId: seller?.id}).catch(e => console.warn('The Smoke | mission', e)));
  Hooks.on('smokeTransit', ({target, idMap}) => {
    const mapId = sceneMapId(target); if (!mapId) return;
    const actors = Object.values(idMap || {}).map(id => target.tokens.get(id)?.actor).filter(a => a?.type === 'character');
    for (const a of actors) missionEvent({on: 'map', mapId, actorId: a.id}).catch(e => console.warn('The Smoke | mission', e));
  });
  // A character put on a map some other way (dragged in by the GM, a new token, a scene change) has arrived there too.
  Hooks.on('createToken', (doc, options) => {
    if (!isLeader() || options?.acTransit || doc.actor?.type !== 'character' || doc.hidden) return;
    const mapId = sceneMapId(doc.parent); if (!mapId) return;
    missionEvent({on: 'map', mapId, actorId: doc.actor.id}).catch(e => console.warn('The Smoke | mission', e));
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
export const missionsAPI = {data: missionData, state: missionState, statusOf, factions: factionState, standing, rankOf, RANKS, STANCES, playMode, canRun: canRunMissions,
  setMode: mode => { if (!game.user.isGM) throw new Error('Only the GM sets the play mode.'); return game.settings.set(NS, 'playMode', mode === 'self' ? 'self' : 'story'); },
  start: (id, actorIds = [], overrideReason = '') => request('mission.start', {id, actorIds, overrideReason}), tick: (id, objId, delta = 1, reason = '', {complete = false} = {}) => request('mission.tick', {id, objId, delta, reason, complete}),
  set: (id, status, renownTo = null) => request('mission.set', {id, status, renownTo}), crew: (id, actorIds) => request('mission.crew', {id, actorIds}), faction: (code, change) => request('faction.set', {code, ...change}), event: missionEvent};
