// Jobs: get in a vehicle that does a job (taxi, police, ambulance, fire pump, courier, bus), start a shift,
// and callouts appear on the map. Accept one and it becomes a short minigame against a real-time clock, played
// with Covenant rolls: fares and tips, ANPR stolen-vehicle sweeps and pursuits, patients on the Fading track,
// fires on a progress track. Auntie Pat's bike orders run the same way without a vehicle.
// All state lives in one world setting written only by the leader GM; every client renders from it.
import {NS, JOB_TYPES} from '../config.mjs';
import {isSuccess} from '../rules/core.mjs';
import * as J from '../rules/jobs-core.mjs';
import {isLeader, registerHandler, request, dispatch, card, esc, ownersOf, notify} from './net.mjs';
import {ensureVehicleActor, ensurePersonActor, randomPedKey, placeToken, zonesOf, mapIdOf, isStreetScene, tokenRect, distanceSquares, lanePoint, loadCatalogs} from './spawn.mjs';
import {loadAtlas} from '../map/map-transit.mjs';
import {boardVehicle, exitVehicle, VEHICLE_ACTIONS, seatLayout} from '../vehicles/vehicle-boarding.mjs';
import {lightsOn, hasAbility, isCagedSeat} from '../vehicles/vehicle-abilities.mjs';

const KEY = 'jobState';
import {XP_AWARDS, levelInfo, repInfo} from '../rules/advancement.mjs';
/** Add XP and say so when the next Rep level is within reach. */
export async function awardXP(actor, xp, why = '') {
  const before = repInfo(actor.system); await actor.update({'system.rep.xp': Number(actor.system.rep?.xp || 0) + Number(xp)});
  const after = repInfo(actor.system);
  if (!before.canLevel && after.canLevel) await card(`REP ${after.nextLevel}`, `${actor.name} can level up`, `<p>${esc(why)}: +${xp} XP (${after.xp}). Rep ${after.nextLevel} — ${esc(levelInfo(after.nextLevel).title)} — is there for the taking: <b>Level up</b> on the sheet's Rep &amp; Conditions tab.</p>`, 'crew', {whisper: [...ownersOf(actor), ...game.users.filter(u => u.isGM).map(u => u.id)]});
}
const now = () => Date.now();
const uid = () => foundry.utils.randomID(10);
export function registerJobSettings() {
  game.settings.register(NS, KEY, {scope: 'world', config: false, type: Object, default: {shifts: {}, calls: {}}});
  game.settings.register(NS, 'pausedAt', {scope: 'world', config: false, type: Number, default: 0});
  game.settings.register(NS, 'jobsPaused', {scope: 'world', config: false, type: Boolean, default: false});
  game.settings.register(NS, 'offerEvery', {name: 'Jobs: seconds between callouts on a shift', scope: 'world', config: true, type: Number, default: 25, range: {min: 5, max: 180, step: 5}});
  game.settings.register(NS, 'jobClock', {name: 'Jobs: clock speed', hint: 'Multiply every job deadline. 1 = normal, 2 = twice as long (slower tables), 0.5 = frantic.', scope: 'world', config: true, type: Number, default: 1, range: {min: .5, max: 4, step: .25}});
}
export const state = () => foundry.utils.deepClone(game.settings.get(NS, KEY) || {shifts: {}, calls: {}});
export async function remapJobsForTransit({target,idMap}){
 return mutate(s=>{
  for(const sh of Object.values(s.shifts))if(idMap[sh.vehicleTokenId]){sh.vehicleTokenId=idMap[sh.vehicleTokenId];sh.sceneId=target.id;}
  for(const c of Object.values(s.calls)){
   if(c.cleanup)c.cleanup=c.cleanup.map(id=>idMap[id]??id);
   for(const k of ['fareTokenId','patientTokenId','suspectTokenId','stolenTokenId'])if(idMap[c.data?.[k]])c.data[k]=idMap[c.data[k]];
  }
 });
}
let writing = Promise.resolve();
async function mutate(fn) {
  writing = writing.catch(() => {}).then(async () => { const s = state(); const out = await fn(s); await game.settings.set(NS, KEY, s); return out; }).catch(e => { console.error('The Smoke | job state', e); throw e; });
  return writing;
}
const clock = () => { try { return Number(game.settings.get(NS, 'jobClock')) || 1; } catch (_e) { return 1; } };
const deadline = (type, stage, hops = 0) => now() + J.deadlineSeconds(type, stage, hops) * 1000 * clock();
const paused = () => { try { return game.settings.get(NS, 'jobsPaused'); } catch (_e) { return false; } };

/* ------------------------------------------------------------------ locating things */
const sceneOfToken = id => { for (const s of game.scenes) { const t = s.tokens.get(id); if (t) return {scene: s, token: t}; } return {}; };
function vehicleOfShift(sh) {
  const s = game.scenes.get(sh.sceneId); let t = s?.tokens.get(sh.vehicleTokenId);
  if (!t) for (const sc of game.scenes) { const x = sc.tokens.find(k => k.getFlag(NS, 'shiftId') === sh.id); if (x) { t = x; break; } }
  return t ?? null;
}
const driverActor = sh => game.actors.get(sh.actorId);
const mayManage=(sh,userId)=>{const u=game.users.get(userId);return Boolean(u?.isGM||driverActor(sh)?.testUserPermission(u,'OWNER'));};
export function canWorkCall(call,actor){
 if(call.actorId===actor?.id)return true;
 if(!['fire','ambulance'].includes(call.type))return false;
 const sh=state().shifts[call.shiftId],vt=sh&&vehicleOfShift(sh);return Boolean(vt&&(vt.getFlag(NS,'vehicleOccupants')||[]).some(o=>o.actorId===actor?.id));
}
const occupants = vt => { const o = vt?.getFlag?.(NS, 'vehicleOccupants'); return Array.isArray(o) ? o : []; };
const freeSeat = (vt, pred = () => true) => { const occ = occupants(vt).map(o => o.seatId); return seatLayout(vt.actor).find(s => s.role === 'passenger' && !occ.includes(s.id) && pred(s.id))?.id ?? null; };
async function whisperOwners(sh, kicker, title, body, cls = '') { return card(kicker, title, body, cls, {whisper: [...ownersOf(game.actors.get(sh.actorId)), ...game.users.filter(u => u.isGM).map(u => u.id)]}); }
const rollButton = (actorId, stat, band, label, ctx, extra = '') => {
  const a = game.actors.get(actorId);
  return `<button type="button" data-smoke-roll="${esc(a?.uuid || '')}" data-stat="${stat}" ${band ? `${band ? `data-band="${band}"` : ''}` : ''} data-label="${esc(label)}" data-context='${esc(JSON.stringify(ctx))}' ${extra}><i class="fa-solid fa-dice"></i> ${esc(label)}</button>`;
};

/* ------------------------------------------------------------------ shifts */
export function jobsOfVehicle(actor) { return actor?.system?.vehicle?.jobs?.length ? actor.system.vehicle.jobs : (actor?.getFlag?.(NS, 'jobs') || []); }
export const startShift = (vt, type) => request('job.start', {sceneId: vt.parent.id, vehicleTokenId: vt.id, type});
export const endShift = shiftId => request('job.end', {shiftId});
export const acceptCall = callId => request('job.accept', {callId});
export const declineCall = callId => request('job.decline', {callId});
export const askPat = actor => request('job.crew', {actorId: actor.id});

registerHandler('job.start', async ({sceneId, vehicleTokenId, type, userId}) => {
  const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), user = game.users.get(userId);
  if (!vt) throw new Error('Vehicle not found.');
  if (!jobsOfVehicle(vt.actor).includes(type)) throw new Error(`The ${vt.name} can't do ${JOB_TYPES[type]?.label || type} work.`);
  const pilot = occupants(vt).find(o => o.seatId === 'pilot'); const driver = pilot && scene.tokens.get(pilot.tokenId);
  if (!driver?.actor) throw new Error('Get in the driver seat first.');
  if (!user?.isGM && !driver.actor.testUserPermission(user, 'OWNER')) throw new Error('Only the driver can start a shift.');
  const s0 = state(); if (Object.values(s0.shifts).some(s => s.vehicleTokenId === vt.id || s.actorId === driver.actor.id)) throw new Error('Already on a shift.');
  const sh = {id: uid(), type, actorId: driver.actor.id, userIds: ownersOf(driver.actor), vehicleTokenId: vt.id, sceneId, started: now(), earned: 0, done: 0, failed: 0, activeCall: null, nextOfferAt: now() + 6000};
  await vt.update({[`flags.${NS}.shiftId`]: sh.id, [`flags.${NS}.issued`]: true}, {acVehicleCarry: true});
  await mutate(s => { s.shifts[sh.id] = sh; });
  await whisperOwners(sh, JOB_TYPES[type].verb.toUpperCase(), `${driver.actor.name} is on shift`, `<p>${esc(JOB_TYPES[type].hint)}</p><p class="smoke-dim">Callouts come to your phone (<i class="fa-solid fa-mobile-screen"></i> in the scene controls) and to chat.</p>`, 'job');
  return sh.id;
});
registerHandler('job.end', async ({shiftId, userId}) => {
  const sh = state().shifts[shiftId]; if (!sh) return;
  const user = game.users.get(userId); if (!mayManage(sh,userId)) throw new Error('Not your shift.');
  if (sh.activeCall) await failCall(sh.activeCall, 'Shift ended mid-job.');
  await mutate(s => { delete s.shifts[shiftId]; for (const [id, c] of Object.entries(s.calls)) if (c.shiftId === shiftId) delete s.calls[id]; });
  const vt = vehicleOfShift(sh); if (vt) await vt.unsetFlag(NS, 'shiftId');
  await whisperOwners(sh, 'SHIFT OVER', `${driverActor(sh)?.name}: £${sh.earned} earned`, `<p>${sh.done} job${sh.done === 1 ? '' : 's'} done, ${sh.failed} blown.</p>`, 'job');
});
registerHandler('job.accept', async ({callId, userId}) => {
  const call = state().calls[callId]; if (!call) throw new Error('That callout has gone.');
  const sh = state().shifts[call.shiftId]; if (!sh) throw new Error('Shift over.');
  if (!mayManage(sh,userId)) throw new Error('Not your callout.');
  if (call.status !== 'offered') return;
  if (sh.activeCall) throw new Error('Finish the job you are on first.');
  await GEN[call.type].accept(call, sh);
  await mutate(s => { s.calls[callId] = {...call, status: 'active'}; s.shifts[sh.id].activeCall = callId; });
});
registerHandler('job.decline', async ({callId, userId}) => { const call = state().calls[callId]; const sh = call && state().shifts[call.shiftId]; if (call && (!sh || !mayManage(sh,userId))) throw new Error('Not your callout.'); await mutate(s => { const c = s.calls[callId]; if (c && c.status === 'offered') { delete s.calls[callId]; if (s.shifts[c.shiftId]) s.shifts[c.shiftId].nextOfferAt = now() + 8000; } }); });
registerHandler('job.pause', async ({paused: p, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const was = paused(); if (Boolean(p) === was) return;
  if (p) await game.settings.set(NS, 'pausedAt', now());
  await game.settings.set(NS, 'jobsPaused', Boolean(p));
  if (!p) { const since = Number(game.settings.get(NS, 'pausedAt') || pausedAtMemo || now()); const add = now() - since; await mutate(s => { for (const c of Object.values(s.calls)) for (const k of ['deadline','expires','worsenAt']) if (c[k]) c[k] += add; for (const sh of Object.values(s.shifts)) if (sh.nextOfferAt) sh.nextOfferAt += add; }); }
  pausedAtMemo = p ? now() : null;
});
let pausedAtMemo = null;

/* ------------------------------------------------------------------ call bookkeeping */
async function updateCall(id, patch) { return mutate(s => { if (s.calls[id]) Object.assign(s.calls[id], typeof patch === 'function' ? patch(s.calls[id]) : patch); }); }
async function completeCall(id, pay, text, {repKey = null} = {}) {
  const call = state().calls[id]; if (!call) return; const sh = state().shifts[call.shiftId];
  const actor = game.actors.get(call.actorId ?? sh?.actorId);
  await cleanup(call);
  await mutate(s => { delete s.calls[id]; const x = s.shifts[call.shiftId]; if (x) { x.activeCall = null; x.earned += pay; x.done += 1; x.nextOfferAt = now() + Number(game.settings.get(NS,'offerEvery'))*1000; } });
  if (actor && pay) await actor.changeCash(pay, text);
  else if (text) await card('JOB DONE', JOB_TYPES[call.type]?.label || 'Job', `<p>${esc(text)}</p>`, 'win');
  if (actor && repKey) await actor.update({[`system.rep.${repKey}`]: Number(actor.system.rep?.[repKey] || 0) + 1});
  if (actor?.type === 'character') await awardXP(actor, call.type === 'crew' ? XP_AWARDS.crewOrder : XP_AWARDS.job, call.type === 'crew' ? 'Pat\'s order done' : 'Job done');
  Hooks.callAll('smokeJobDone', {actor, type: call.type, pay});
  if (actor && call.type === 'police' && Number(actor.system.heat?.value) > 0) await actor.changeHeat(-1, 'Doing the job looks good on you: the heat eases.');
}
async function failCall(id, why) {
  const call = state().calls[id]; if (!call) return;
  await cleanup(call);
  await mutate(s => { delete s.calls[id]; const x = s.shifts[call.shiftId]; if (x) { x.activeCall = null; x.failed += 1; x.nextOfferAt = now() + Number(game.settings.get(NS,'offerEvery'))*1000; } });
  const sh = state().shifts[call.shiftId];
  if (sh) await whisperOwners(sh, 'JOB BLOWN', call.title, `<p>${esc(why)}</p>`, 'lose');
  else await card('JOB BLOWN', call.title, `<p>${esc(why)}</p>`, 'lose');
}
async function cleanup(call) {
  for (const id of call.cleanup || []) {
    const {scene, token} = sceneOfToken(id); if (!token) continue;
    const seat = token.getFlag(NS, 'vehicleSeat'); if (seat) { try { await exitVehicle(token); } catch (_e) {} }
    await scene.tokens.get(id)?.delete({smokeDespawn: true});
  }
  for (const d of call.drawings || []) { const s = game.scenes.get(d.sceneId); await s?.drawings.get(d.id)?.delete(); }
}

/* ------------------------------------------------------------------ generators: one per job type */
const atlas = async () => (await loadAtlas()).atlas;
function hopsBetween(at, a, b) { return J.hopDistances(J.mapGraph(at), a).get(b) ?? 0; }
const GEN = {};

/* ---------- taxi */
GEN.taxi = {
  async offer(sh, vt) {
    const scene = vt.parent, kerbs = J.kerbside(zonesOf(scene)); if (!kerbs.length) return null;
    const zone = J.pick(kerbs); const at = await atlas();
    const dest = J.pickDestination(at, mapIdOf(scene), {minHops: 0, maxHops: 2, exclude: [`${mapIdOf(scene)}:${zone.id}`]}); if (!dest) return null;
    const hops = dest.hops, est = J.taxiPay({hops, timeLeft: .6});
    return {title: `Fare: ${zone.name} → ${dest.label}`, text: `Someone's hailing a cab outside <b>${esc(zone.name)}</b>. Going to <b>${esc(dest.label)}</b>, ${esc(dest.mapName)} (${hops ? `${hops} map${hops > 1 ? 's' : ''} away` : 'this map'}). About £${est.total} with tip.`,
            data: {sceneId: scene.id, zoneId: zone.id, dest, hops}};
  },
  async accept(call, sh) {
    const scene = game.scenes.get(call.data.sceneId), zone = zonesOf(scene).find(z => z.id === call.data.zoneId);
    const [x, y] = J.kerbPoint(zone, zonesOf(scene)); const fare = await ensurePersonActor(await randomPedKey());
    const t = await placeToken(scene, fare, x, y, {name: 'Fare', flags: {fare: call.id}});
    Object.assign(call, {stage: 'pickup', deadline: deadline('taxi', 'pickup'), total: J.deadlineSeconds('taxi', 'pickup') * 1000 * clock(), cleanup: [t.id], data: {...call.data, fareTokenId: t.id},
      instruction: `Pull up next to the fare outside ${zone.name} (within 2 squares).`, ping: {sceneId: scene.id, x, y}});
    await whisperOwners(sh, 'TAXI', 'Fare accepted', `<p>${esc(call.instruction)}</p>`, 'job');
  },
  async tick(call, sh, vt) {
    if (call.stage === 'pickup') {
      const {token: fare} = sceneOfToken(call.data.fareTokenId); if (!fare) return failCall(call.id, 'The fare wandered off.');
      if (vt.parent.id !== fare.parent.id || distanceSquares(vt, fare) > 3.2) return;
      const seat = freeSeat(vt); if (!seat) return failCall(call.id, 'No room in the back for the fare.');
      await boardVehicle(vt, fare, seat);
      const rush = Math.random() < .35;
      const hops = call.data.hops, total = J.deadlineSeconds('taxi', 'dropoff', hops) * 1000 * clock() * (rush ? .75 : 1);
      await updateCall(call.id, {stage: 'dropoff', deadline: now() + total, total, rush, instruction: `Take them to ${call.data.dest.label} (${call.data.dest.mapName}).${rush ? ' They are late: step on it, double tip.' : ''}`, ping: null});
      const fareLine = rush ? '"I\'m so late — step on it, there\'s extra in it for you!"' : J.pick(['"Alright? Cheers for stopping."', '"Busy tonight, innit."', '"Can you avoid Mare Street? It\'s rammed."', '"Don\'t go via the Old Street roundabout, I\'m begging you."']);
      await whisperOwners(sh, 'TAXI', `Fare aboard → ${call.data.dest.label}`, `<p>${esc(fareLine)}</p><p>${esc(call.data.dest.label)}, ${esc(call.data.dest.mapName)}.</p>
        ${rollButton(sh.actorId, 'frt', 'medium', 'Make conversation (better tip)', {callId: call.id, step: 'chat'})}`, 'job');
      return;
    }
    if (call.stage === 'dropoff') {
      if (mapIdOf(vt.parent) !== call.data.dest.mapId) return;
      if (!J.arrivedAt(zonesOf(vt.parent), call.data.dest.zoneId, tokenRect(vt))) return;
      const left = J.timeFraction(call.deadline - now(), call.total);
      const pay = J.taxiPay({hops: call.data.hops, timeLeft: left, rideOutcome: call.chat || 'fullSuccess', vehicleKind: vt.actor?.getFlag(NS, 'catalogId') === 'LV12' ? 'cab' : 'minicab'});
      const total = pay.total + (call.rush ? pay.tip : 0);
      return completeCall(call.id, total, `Taxi fare to ${call.data.dest.label}: £${pay.fare} + £${total - pay.fare} tip.`, {repKey: 'street'});
    }
  },
  async roll(call, sh, r) { if (r.context.step === 'chat' && call.stage === 'dropoff' && !call.chat) await updateCall(call.id, {chat: r.outcomeKey}); },
  async timeout(call) { return failCall(call.id, call.stage === 'pickup' ? 'Too slow — the fare got an Uber.' : 'The meter ran out of patience. The fare jumps out at the lights without paying.'); }
};

/* ---------- courier */
GEN.courier = {
  async offer(sh, vt) {
    const scene = vt.parent, kerbs = J.kerbside(zonesOf(scene)).filter(z => z.landmark || z.service === 'clothes'); const pickZone = J.pick(kerbs.length ? kerbs : J.kerbside(zonesOf(scene)));
    if (!pickZone) return null; const at = await atlas();
    const dest = J.pickDestination(at, mapIdOf(scene), {minHops: 0, maxHops: 2, exclude: [`${mapIdOf(scene)}:${pickZone.id}`]}); if (!dest) return null;
    const what = J.pick(['a chicken shop order', 'a pad thai and two Red Stripes', 'a parcel marked FRAGILE', 'a birthday cake', 'a brown envelope (don\'t ask)', 'documents for a solicitor']);
    return {title: `Delivery: ${pickZone.name} → ${dest.label}`, text: `Collect ${what} from <b>${esc(pickZone.name)}</b> and drop it at <b>${esc(dest.label)}</b>, ${esc(dest.mapName)}. About £${J.courierPay({hops: dest.hops, timeLeft: .6})}.`,
            data: {sceneId: scene.id, mapId: mapIdOf(scene), zoneId: pickZone.id, dest, what, body: vt.actor.system.vehicle.body.value}};
  },
  async accept(call, sh) { Object.assign(call, {stage: 'pickup', deadline: deadline('courier', 'pickup'), total: J.deadlineSeconds('courier', 'pickup') * 1000 * clock(), instruction: `Collect from ${zonesOf(game.scenes.get(call.data.sceneId)).find(z => z.id === call.data.zoneId)?.name}.`}); },
  async tick(call, sh, vt) {
    if (call.stage === 'pickup' && mapIdOf(vt.parent) === call.data.mapId && J.arrivedAt(zonesOf(vt.parent), call.data.zoneId, tokenRect(vt))) {
      const total = J.deadlineSeconds('courier', 'dropoff', call.data.dest.hops) * 1000 * clock();
      await updateCall(call.id, {stage: 'dropoff', deadline: now() + total, total, instruction: `Deliver to ${call.data.dest.label} (${call.data.dest.mapName}).`, body: vt.actor.system.vehicle.body.value});
      await whisperOwners(sh, 'COURIER', 'Collected', `<p>${esc(call.data.what)} is in the box. ${esc(call.data.dest.label)}, ${esc(call.data.dest.mapName)}.</p>`, 'job');
    } else if (call.stage === 'dropoff' && mapIdOf(vt.parent) === call.data.dest.mapId && J.arrivedAt(zonesOf(vt.parent), call.data.dest.zoneId, tokenRect(vt))) {
      const damaged = Number(vt.actor.system.vehicle.body.value) < Number(call.body ?? call.data.body);
      return completeCall(call.id, J.courierPay({hops: call.data.dest.hops, timeLeft: J.timeFraction(call.deadline - now(), call.total), damaged}), `Delivered ${call.data.what}${damaged ? ' (a bit squashed)' : ''}.`);
    }
  },
  async timeout(call) { return failCall(call.id, 'Late. The customer cancels and leaves you one star.'); }
};

/* ---------- ambulance */
GEN.ambulance = {
  async offer(sh, vt) {
    const scene = vt.parent, kerbs = J.kerbside(zonesOf(scene)); if (!kerbs.length) return null;
    const zone = J.pick(kerbs), what = J.pick(['a cyclist knocked off at the lights', 'a stabbing outside a chicken shop', 'an elderly man collapsed at the bus stop', 'a builder fallen off scaffolding', 'a woman in labour on the pavement', 'a lad who drank too much on the canal']);
    return {title: `Cat 1: ${zone.name}`, text: `<b>${esc(what)}</b> outside ${esc(zone.name)}. Treat, load, and get them to A&E.`, data: {sceneId: scene.id, zoneId: zone.id, what}};
  },
  async accept(call, sh) {
    const scene = game.scenes.get(call.data.sceneId), zone = zonesOf(scene).find(z => z.id === call.data.zoneId);
    const [x, y] = J.kerbPoint(zone, zonesOf(scene)); const p = await ensurePersonActor('patient');
    const t = await placeToken(scene, p, x, y, {name: 'Patient', rotation: 90, flags: {patient: call.id}});
    Object.assign(call, {stage: 'pickup', patient: 'Fading', worsenAt: now() + 45000 * clock(), deadline: deadline('ambulance', 'pickup'), total: J.deadlineSeconds('ambulance', 'pickup') * 1000 * clock(),
      cleanup: [t.id], data: {...call.data, patientTokenId: t.id}, instruction: `Get to the patient outside ${zone.name}.`, ping: {sceneId: scene.id, x, y}});
  },
  async tick(call, sh, vt) {
    if (call.patient !== 'Stable' && call.worsenAt && now() > call.worsenAt) {
      const next = J.patientWorsens(call.patient);
      await updateCall(call.id, {patient: next, worsenAt: now() + 45000 * clock()});
      if (next === 'Lost') return failCall(call.id, 'The patient is gone. Nobody could have done more. (Somebody could have done more.)');
      await whisperOwners(sh, 'PATIENT', `Getting worse: ${next}`, `<p>Treat them: ${rollButton(sh.actorId, 'sav', 'medium', 'Treat the patient', {callId: call.id, step: 'treat'})}</p>`, 'lose');
    }
    if (call.stage === 'pickup') {
      const {token: pt} = sceneOfToken(call.data.patientTokenId); if (!pt) return failCall(call.id, 'The patient was moved.');
      if (vt.parent.id !== pt.parent.id || distanceSquares(vt, pt) > 3.2 || call.loading) return;
      await updateCall(call.id, {loading: true, stage: 'treat', instruction: 'Treat and load the patient (Savvy).'});
      await whisperOwners(sh, 'PARAMEDIC', 'On scene', `<p>${esc(call.data.what)}. Patient is <b>${esc(call.patient)}</b>.</p>${rollButton(sh.actorId, 'sav', 'medium', 'Treat and load', {callId: call.id, step: 'load'})}`, 'job');
    }
    if (call.stage === 'hospital') {
      if (mapIdOf(vt.parent) !== call.dest.mapId || !J.arrivedAt(zonesOf(vt.parent), call.dest.zoneId, tokenRect(vt))) return;
      const pay = J.ambulancePay({state: call.patient, hops: call.dest.hops});
      return completeCall(call.id, pay, `Patient handed over at ${call.dest.label} — ${call.patient}.`, {repKey: 'street'});
    }
  },
  async roll(call, sh, r) {
    const next = J.patientAfterTreatment(call.patient, r.outcomeKey);
    if (r.context.step === 'load' && call.stage === 'treat') {
      const {token: pt} = sceneOfToken(call.data.patientTokenId); const vt = vehicleOfShift(sh);
      if (next === 'Lost') return failCall(call.id, 'They arrest on the pavement and do not come back.');
      const seat = vt && freeSeat(vt, s => hasAbility(vt.actor, 'stretcher', s)) || (vt && freeSeat(vt));
      if(!pt||!vt||!seat){await whisperOwners(sh,'PARAMEDIC','No free patient seat','<p>Make room in the ambulance and try loading again.</p>','lose');return;}
      if(vt.parent.id!==pt.parent.id||distanceSquares(vt,pt)>3.2)throw new Error('Get the ambulance beside the patient.');
      await boardVehicle(vt, pt, seat);
      const at = await atlas(); const dest = J.nearestService(at, mapIdOf(vt.parent), 'hospital');
      if(!dest)throw new Error('No reachable hospital.');
      const total = J.deadlineSeconds('ambulance', 'hospital', dest.hops) * 1000 * clock();
      await updateCall(call.id, {patient: next, stage: 'hospital', dest, worsenAt:now()+45000*clock(), deadline: now() + total, total, instruction: `Blue-light them to ${dest.label} (${dest.mapName}). Patient: ${next}.`, ping: null});
      await whisperOwners(sh, 'PARAMEDIC', `Loaded — ${next}`, `<p>Go: <b>${esc(dest.label)}</b>, ${esc(dest.mapName)}. Lights on.</p>`, 'job');
    } else if (r.context.step === 'treat'&&['treat','hospital'].includes(call.stage)) {
      await updateCall(call.id, {patient: next, worsenAt: now() + 45000 * clock()});
      if (next === 'Lost') return failCall(call.id, 'Lost them in the back of the ambulance.');
    }
  },
  async timeout(call) { return failCall(call.id, call.stage === 'pickup' || call.stage === 'treat' ? 'Another crew got there first — you are stood down.' : 'Too slow to A&E. They did not make it.'); }
};

/* ---------- fire */
GEN.fire = {
  async offer(sh, vt) {
    const scene = vt.parent, blocks = zonesOf(scene).filter(z => z.kind === 'land' && !z.service && (z.adjacent || []).length); if (!blocks.length) return null;
    const zone = J.pick(blocks), what = J.pick(['a kitchen fire in a flat above a shop', 'a bin store alight', 'a car on fire on the street', 'smoke from a warehouse', 'an e-bike battery fire in a hallway']);
    return {title: `Fire: ${zone.name}`, text: `<b>${esc(what)}</b> at ${esc(zone.name)}.`, data: {sceneId: scene.id, zoneId: zone.id, what}};
  },
  async accept(call, sh) {
    const scene = game.scenes.get(call.data.sceneId), zone = zonesOf(scene).find(z => z.id === call.data.zoneId);
    const [x, y, w, h] = zone.rect;
    const [d] = await scene.createEmbeddedDocuments('Drawing', [{x: x + w * .2, y: y + h * .2, shape: {type: 'e', width: w * .6, height: h * .6}, strokeWidth: 8, strokeColor: '#ff8a3d', fillType: 1, fillColor: '#ff5a1e', fillAlpha: .45,
      text: '🔥 FIRE', fontSize: 64, textColor: '#fff3c4', locked: true, flags: {[NS]: {fire: call.id}}}]);
    Object.assign(call, {stage: 'respond', fire: {progress: 0, consequences: 0}, deadline: deadline('fire', 'respond'), total: J.deadlineSeconds('fire', 'respond') * 1000 * clock(),
      drawings: [{sceneId: scene.id, id: d.id}], instruction: `Get the pump to ${zone.name}.`, ping: {sceneId: scene.id, x: x + w / 2, y: y + h / 2}});
  },
  async tick(call, sh, vt) {
    if (call.stage !== 'respond') return;
    if (vt.parent.id !== call.data.sceneId || !J.arrivedAt(zonesOf(vt.parent), call.data.zoneId, tokenRect(vt))) return;
    await updateCall(call.id, {stage: 'fight', deadline: now() + 240000 * clock(), total: 240000 * clock(), instruction: 'Fight the fire: everyone on the crew rolls Grit.'});
    await whisperOwners(sh, 'FIRE', 'In attendance', `<p>Get the hoses on it. Put it out (4 progress) before it wins (3 consequences). Anyone on the crew can roll.</p>${rollButton(sh.actorId, 'grt', 'hard', 'Hose it down', {callId: call.id, step: 'hose'})}`, 'job');
  },
  async roll(call, sh, r) {
    if (call.stage !== 'fight' || r.context.step !== 'hose') return;
    const f = J.fireStep(call.fire, r.outcomeKey);
    await updateCall(call.id, {fire: {progress: f.progress, consequences: f.consequences}});
    if (f.out && !f.lost) return completeCall(call.id, J.firePay({progress: f.progress, consequences: f.consequences}), `Fire at ${call.title.replace('Fire: ', '')} out. Stop. Nobody hurt.`, {repKey: 'street'});
    if (f.lost) return failCall(call.id, 'The roof goes in. The building is lost — but everyone got out.');
    await whisperOwners(sh, 'FIRE', `Progress ${f.progress}/4 · Fire ${f.consequences}/3`, rollButton(sh.actorId, 'grt', 'hard', 'Hose it down', {callId: call.id, step: 'hose'}), 'job');
  },
  async timeout(call) { return failCall(call.id, call.stage === 'respond' ? 'Another watch got there first.' : 'It burned out of control.'); }
};

/* ---------- bus */
GEN.bus = {
  async offer(sh, vt) {
    const scene = vt.parent, at = await atlas(), mapId = mapIdOf(scene);
    const graph = J.mapGraph(at), next = J.pick([...(graph.get(mapId) || [])]);
    const stopsOn = id => { const m = at.maps.find(x => x.id === id); return (m?.zones || []).filter(z => z.kind === 'road').map(z => ({mapId: id, mapName: m.name, zoneId: z.id, label: z.name})); };
    const a = J.pick(stopsOn(mapId)), b = J.pick(stopsOn(mapId).filter(z => z.zoneId !== a?.zoneId)), c = next ? J.pick(stopsOn(next)) : null, d = next ? J.pick(stopsOn(next).filter(z => z.zoneId !== c?.zoneId)) : null;
    const stops = [a, b, c, d].filter(Boolean); if (stops.length < 2) return null;
    return {title: `Route 38: ${stops.length} stops`, text: `Run the route: ${stops.map(s => `<b>${esc(s.label)}</b>`).join(' → ')}.`, data: {stops}};
  },
  async accept(call) { Object.assign(call, {stage: 'stop', index: 0, deadline: deadline('bus', 'stop'), total: J.deadlineSeconds('bus', 'stop') * 1000 * clock(), instruction: `Next stop: ${call.data.stops[0].label} (${call.data.stops[0].mapName}).`}); },
  async tick(call, sh, vt) {
    const stop = call.data.stops[call.index]; if (!stop) return;
    if (mapIdOf(vt.parent) !== stop.mapId || !J.arrivedAt(zonesOf(vt.parent), stop.zoneId, tokenRect(vt))) return;
    const pay = J.busStopPay(J.timeFraction(call.deadline - now(), call.total));
    const actor = driverActor(sh); if (actor) await actor.update({'system.cash': Number(actor.system.cash || 0) + pay});
    await mutate(s => { if (s.shifts[sh.id]) s.shifts[sh.id].earned += pay; });
    if (call.index + 1 >= call.data.stops.length) return completeCall(call.id, 10, `End of the line. Route bonus.`);
    const nx = call.data.stops[call.index + 1], hops = mapIdOf(vt.parent) === nx.mapId ? 0 : 1;
    const total = J.deadlineSeconds('bus', 'stop', hops) * 1000 * clock();
    await updateCall(call.id, {index: call.index + 1, deadline: now() + total, total, instruction: `Next stop: ${nx.label} (${nx.mapName}).`});
    notify(`🚌 ${stop.label}: +£${pay}. Next: ${nx.label}.`, {userIds: sh.userIds});
  },
  async timeout(call) { return failCall(call.id, 'Running too late — control takes you off the route.'); }
};

/* ---------- police: ANPR sweeps, pursuits, disturbances */
GEN.police = {
  async offer(sh, vt) {
    const scene = vt.parent; const roads = zonesOf(scene).filter(z => z.kind === 'road'); if (!roads.length) return null;
    const kind = J.pick(['anpr', 'anpr', 'pursuit', 'disturbance']);
    const {vehicles} = await loadCatalogs(); const car = J.pick(vehicles.filter(v => ['LV14', 'LV15', 'LV16', 'LV17', 'LV18', 'LV20', 'LV21'].includes(v.id)));
    if (kind === 'anpr') return {title: `ANPR sweep: stolen ${car.name}`, text: `A <b>${esc(car.name)}</b> reported stolen was last seen on <b>${esc(scene.name)}</b>. Run plates on passing traffic with the ANPR scanner (target a car → <i class="fa-solid fa-barcode"></i>) and find it.`, data: {kind, sceneId: scene.id, carId: car.id, carName: car.name}};
    if (kind === 'pursuit') return {title: `Pursuit: ${car.name} failing to stop`, text: `A <b>${esc(car.name)}</b> has just failed to stop for a unit on <b>${esc(scene.name)}</b>. Join the pursuit.`, data: {kind, sceneId: scene.id, carId: car.id, carName: car.name}};
    const zone = J.pick(J.kerbside(zonesOf(scene))); if (!zone) return null;
    return {title: `Disturbance: ${zone.name}`, text: `Reports of a fight outside <b>${esc(zone.name)}</b>.`, data: {kind, sceneId: scene.id, zoneId: zone.id}};
  },
  async accept(call, sh) {
    const scene = game.scenes.get(call.data.sceneId); const vt = vehicleOfShift(sh);
    if (call.data.kind === 'disturbance') {
      const zone = zonesOf(scene).find(z => z.id === call.data.zoneId); const [x, y] = J.kerbPoint(zone, zonesOf(scene));
      const a = await ensurePersonActor('suspect'), b = await ensurePersonActor(await randomPedKey());
      const t1 = await placeToken(scene, a, x, y, {name: 'Brawler', flags: {suspect: call.id}}), t2 = await placeToken(scene, b, x + scene.grid.size, y, {name: 'Brawler', flags: {suspect: call.id}});
      Object.assign(call, {stage: 'respond', deadline: deadline('police', 'respond'), total: J.deadlineSeconds('police', 'respond') * 1000 * clock(), cleanup: [t1.id, t2.id], data: {...call.data, suspectTokenId: t1.id}, instruction: `Get to ${zone.name}.`, ping: {sceneId: scene.id, x, y}});
      return;
    }
    // ANPR and pursuits: put the stolen car in the traffic, hidden among decoys
    const roads = zonesOf(scene).filter(z => z.kind === 'road'); const r = Math.random;
    const stolen = await ensureVehicleActor(call.data.carId);
    const far = roads.filter(z => !vt || Math.hypot(z.rect[0] - vt.x, z.rect[1] - vt.y) > scene.grid.size * 10);
    const p = lanePoint(J.pick(far.length ? far : roads), r, null, scene);
    const plate = J.ukPlate();
    const st = await placeToken(scene, stolen, p.x, p.y, {rotation: p.rotation, flags: {traffic: {kind: 'moving', dir: p.dir, edgeId:p.edgeId, distance:p.distance, travelDir:p.travelDir, speed: call.data.kind === 'pursuit' ? 3 : 1, keep: true}, plate,
      marker: {kind: 'stolen', label: 'REPORTED STOLEN', since: 'stolen two days ago, Clapton', note: 'Occupants believed to be responsible for a burglary. Stop and detain.'}, jobTarget: call.id}});
    const cleanup = [st.id];
    if (call.data.kind === 'anpr') {
      for (let i = 0; i < 3; i++) { const d = await ensureVehicleActor(call.data.carId === 'LV14' ? 'LV16' : 'LV14'); const q = lanePoint(J.pick(roads), r, null, scene);
        const t = await placeToken(scene, d, q.x, q.y, {rotation: q.rotation, flags: {traffic: {kind: 'moving', dir: q.dir, edgeId:q.edgeId, distance:q.distance, travelDir:q.travelDir, speed: 1}, keeper: 'Registered keeper on file'}}); cleanup.push(t.id); }
      const decoy = await ensureVehicleActor(call.data.carId); const q = lanePoint(J.pick(roads), r, null, scene);   // same model, clean plate
      const t = await placeToken(scene, decoy, q.x, q.y, {rotation: q.rotation, flags: {traffic: {kind: 'moving', dir: q.dir, edgeId:q.edgeId, distance:q.distance, travelDir:q.travelDir, speed: 1}}}); cleanup.push(t.id);
    }
    Object.assign(call, {stage: call.data.kind === 'pursuit' ? 'pursuit' : 'search', gap: J.CHASE.start, deadline: deadline('police', call.data.kind === 'pursuit' ? 'respond' : 'anpr'), total: J.deadlineSeconds('police', call.data.kind === 'pursuit' ? 'respond' : 'anpr') * 1000 * clock(),
      chaseTN:J.getawayTN({driverDie:8,perfDie:stolen.system.vehicle.perfDie,handling:stolen.system.vehicle.handling}),cleanup, data: {...call.data, stolenTokenId: st.id, plate},
      instruction: call.data.kind === 'pursuit' ? 'Chase it down: roll Wheels each round.' : `Find the stolen ${call.data.carName}: target passing cars and run their plates (ANPR).`});
    if (call.data.kind === 'pursuit') await whisperOwners(sh, 'PURSUIT', `${call.data.carName} — ${plate}`, `<p>Gap ${J.CHASE.start}. Close to 0 to box it in; at 5 you have lost it.</p>${rollButton(sh.actorId, 'whl', null, 'Pursuit roll', {callId: call.id, step: 'chase'}, `data-tn="${J.getawayTN({driverDie: 8, perfDie: stolen.system.vehicle.perfDie, handling: stolen.system.vehicle.handling})}"`)}`, 'job');
  },
  async tick(call, sh, vt) {
    const {token: target} = sceneOfToken(call.data.stolenTokenId ?? call.data.suspectTokenId);
    if (call.stage === 'respond' && call.data.kind === 'disturbance') {
      if (!target || vt.parent.id !== target.parent.id || distanceSquares(vt, target) > 4) return;
      await updateCall(call.id, {stage: 'calm', instruction: 'Calm it down (Front), or nick one of them (Muscle).'});
      await whisperOwners(sh, 'DISTURBANCE', 'On scene', `<p>Two of them squaring up, a crowd filming.</p>${rollButton(sh.actorId, 'frt', 'medium', 'Calm it down', {callId: call.id, step: 'calm'})} ${rollButton(sh.actorId, 'mus', 'medium', 'Nick the ringleader', {callId: call.id, step: 'cuff'})}`, 'job');
      return;
    }
    if (call.stage === 'stop' && target && vt.parent.id === target.parent.id && lightsOn(vt) && distanceSquares(vt, target) <= 5 && !call.stopAsked) {
      await updateCall(call.id, {stopAsked: true});
      await whisperOwners(sh, 'STOP', `Pull over the ${call.data.carName}`, `<p>Lights on behind it. Will they stop?</p>${rollButton(sh.actorId, 'frt', 'medium', 'Signal it to stop', {callId: call.id, step: 'stop'})}`, 'job');
    }
    if (call.stage === 'arrest' && target) {
      const driver = game.scenes.get(target.parent.id)?.tokens.find(t => t.actorId === sh.actorId && !t.getFlag(NS, 'vehicleSeat'));
      if (driver && distanceSquares(driver, target) <= 2.6 && !call.cuffAsked) {
        await updateCall(call.id, {cuffAsked: true});
        await whisperOwners(sh, 'ARREST', 'Get them out of the car', `<p>Hands where I can see them.</p>${rollButton(sh.actorId, 'mus', 'medium', 'Cuff the suspect', {callId: call.id, step: 'cuff'})}`, 'job');
      }
    }
    if (call.stage === 'custody') {
      if (mapIdOf(vt.parent) !== call.dest.mapId || !J.arrivedAt(zonesOf(vt.parent), call.dest.zoneId, tokenRect(vt))) return;
      return completeCall(call.id, J.policePay({kind: call.data.kind, clean: !call.messy}), `Suspect booked in at ${call.dest.label}.`, {repKey: 'police'});
    }
  },
  async roll(call, sh, r) {
    const step = r.context.step, ok = isSuccess(r.outcomeKey);
    const {scene, token: target} = sceneOfToken(call.data.stolenTokenId ?? call.data.suspectTokenId);
    if (step === 'stop' && call.stage === 'stop') {
      if (ok && target) { await target.setFlag(NS, 'traffic', {kind: 'stopped'}); await updateCall(call.id, {stage: 'arrest', instruction: 'It pulls over. Get out and arrest the driver (stand next to it).'}); await whisperOwners(sh, 'STOP', 'It pulls over', '<p>Hazards on. Get out and walk up to it.</p>', 'job'); }
      else { if (target) await target.setFlag(NS, 'traffic', {...(target.getFlag(NS, 'traffic') || {}), kind: 'moving', speed: 3, keep: true}); await updateCall(call.id, {stage: 'pursuit', gap: J.CHASE.start, chaseTN:J.getawayTN({driverDie:8,perfDie:target?.actor?.system.vehicle.perfDie??8,handling:target?.actor?.system.vehicle.handling??0}),deadline: now() + 240000 * clock(), total: 240000 * clock(), instruction: 'It floors it! Pursuit: roll Wheels each round.'});
        const v = target?.actor?.system?.vehicle || {perfDie: 8, handling: 0};
        await whisperOwners(sh, 'PURSUIT', `${call.data.carName} — failing to stop`, `<p>Gap ${J.CHASE.start}.</p>${rollButton(sh.actorId, 'whl', null, 'Pursuit roll', {callId: call.id, step: 'chase'}, `data-tn="${J.getawayTN({driverDie: 8, perfDie: v.perfDie, handling: v.handling})}"`)}`, 'job'); }
      return;
    }
    if (step === 'chase' && call.stage === 'pursuit') {
      const res = J.chaseStep(call.gap, r.outcomeKey); const vt = vehicleOfShift(sh);
      if (res.crash && vt?.actor) await vt.actor.applyDamage(4);
      if (res.caught) { if (target) await target.setFlag(NS, 'traffic', {kind: 'stopped'}); await updateCall(call.id, {gap: 0, stage: 'arrest', messy: res.crash || call.messy, instruction: 'Boxed in! Get out and arrest the driver.'}); return whisperOwners(sh, 'PURSUIT', 'Boxed in!', '<p>Tactical contact — it stops. Out you get.</p>', 'win'); }
      if (res.escaped) return failCall(call.id, 'Lost it. Last seen heading for the A12.');
      await updateCall(call.id, {gap: res.gap, messy: res.crash || call.messy});
      const v = target?.actor?.system?.vehicle || {perfDie: 8, handling: 0};
      return whisperOwners(sh, 'PURSUIT', `Gap ${res.gap}${res.crash ? ' — you clip a bollard (4 damage)' : ''}`, rollButton(sh.actorId, 'whl', null, 'Pursuit roll', {callId: call.id, step: 'chase'}, `data-tn="${J.getawayTN({driverDie: 8, perfDie: v.perfDie, handling: v.handling})}"`), res.gap < call.gap ? 'win' : 'lose');
    }
    if (step === 'calm' && call.stage === 'calm') {
      if (ok) return completeCall(call.id, J.policePay({kind: 'disturbance'}), 'Words of advice given. Everyone goes home.', {repKey: 'police'});
      await whisperOwners(sh, 'DISTURBANCE', 'It kicks off', `<p>One of them swings at you. Nick them.</p>${rollButton(sh.actorId, 'mus', 'medium', 'Nick the ringleader', {callId: call.id, step: 'cuff'})}`, 'lose');
      return updateCall(call.id, {messy: true});
    }
    if (step === 'cuff' && ['arrest', 'calm'].includes(call.stage)) {
      if (!ok) { await updateCall(call.id, {cuffAsked: false, messy: true}); return whisperOwners(sh, 'ARREST', 'They wriggle free', '<p>Try again — before they leg it.</p>', 'lose'); }
      const vt = vehicleOfShift(sh);
      const cageSeat=vt&&freeSeat(vt,s=>isCagedSeat(vt.actor,s));
      if(!vt||!cageSeat){await whisperOwners(sh,'ARREST','No free cage seat','<p>Make room in a caged police vehicle before booking an arrest.</p>','lose');return;}
      let suspectTok;
      if (call.data.kind === 'disturbance') suspectTok = target;
      else { if (!target) return failCall(call.id, 'The car has gone — nobody to arrest.'); const sus = await ensurePersonActor('suspect'); const g = scene.grid.size; suspectTok = await placeToken(scene, sus, target.x + (target.width + .8) * g, target.y + g, {name: 'Suspect'}); await updateCall(call.id, c => ({cleanup: [...(c.cleanup || []), suspectTok.id]}));
        await target.setFlag(NS, 'traffic', null); await target.setFlag(NS, 'locked', false); }
      const seat = cageSeat;
      if (!suspectTok || vt.parent.id!==suspectTok.parent.id)throw new Error('Bring the police vehicle to the suspect.');
      if (vt && seat && suspectTok && vt.parent.id === suspectTok.parent.id) {
        // walk them to the car: put them beside it, then in the cage
        const g = vt.parent.grid.size; await suspectTok.update({x: vt.x + vt.width * g, y: vt.y}, {acVehicleCarry: true});
        await boardVehicle(vt, vt.parent.tokens.get(suspectTok.id), seat);
      }
      const at = await atlas(); const dest = J.nearestService(at, mapIdOf(vt?.parent ?? scene), 'police');
      if(!dest)throw new Error('No reachable police station.');
      const total = J.deadlineSeconds('police', 'custody', dest.hops) * 1000 * clock();
      await updateCall(call.id, {stage: 'custody', dest, deadline: now() + total, total, instruction: `Take the suspect to ${dest.label} (${dest.mapName}).`});
      return whisperOwners(sh, 'ARREST', 'In cuffs', `<p>"You do not have to say anything…" Take them to <b>${esc(dest.label)}</b>, ${esc(dest.mapName)}.</p>`, 'win');
    }
  },
  async event(call, sh, ev) {
    if (ev.kind === 'scan' && call.stage === 'search' && ev.targetId === call.data.stolenTokenId) {
      await updateCall(call.id, {stage: 'stop', instruction: `HIT on ${call.data.plate}! Lights on and get within 5 squares to pull it over.`});
      await whisperOwners(sh, 'ANPR HIT', `${call.data.plate} — ${call.data.carName}`, '<p>That\'s the one. Blue lights on, get behind it.</p>', 'win');
    }
  },
  async timeout(call) { return failCall(call.id, call.stage === 'search' ? 'The trail has gone cold. Another unit picks it up on the A12.' : call.stage === 'custody' ? 'Too long getting to the station — the custody sergeant is not impressed and the suspect walks.' : 'Out of time.'); }
};

/* ---------- The Chainring: Auntie Pat's orders (no vehicle needed) */
const PAT_ORDERS = [
  {want: 2, ids: null, text: 'Two bikes. Any bikes. I have a man in Leyton who is not fussy.', bonus: 40},
  {want: 1, ids: ['LV03'], text: 'A carbon road bike. One of them Whippets — the Lycra lot leave them outside the coffee places on Broadway Market and in Shoreditch.', bonus: 120},
  {want: 3, ids: ['LV01', 'LV02'], text: 'Three BMXs or mountain bikes for the lads in Tottenham.', bonus: 60},
  {want: 1, ids: ['LV07', 'LV08'], text: 'A moped or a scrambler. Somebody is doing deliveries and needs wheels, no questions.', bonus: 90}
];
GEN.crew = {
  async offer() { return null; },
  async accept() {},
  async tick() {},
  async timeout(call) { return failCall(call.id, 'Pat gives the order to someone else. "Too slow, darling."'); }
};
registerHandler('job.crew', async ({actorId, userId}) => {
  const actor = game.actors.get(actorId), user = game.users.get(userId); if (!actor) throw new Error('No character.');
  if (!user?.isGM && !actor.testUserPermission(user, 'OWNER')) throw new Error('Not your character.');
  const s0 = state(); if (Object.values(s0.calls).some(c => c.type === 'crew' && c.actorId === actorId)) throw new Error('Pat is still waiting on your last order.');
  const order = J.pick(PAT_ORDERS); const at = await atlas();
  // seed the order: the bikes she wants, chained up on nearby streets (not on her own doorstep)
  const maps = [...J.hopDistances(J.mapGraph(at), 'LDN-HACKNEY')].filter(([id, d]) => d >= 1 && d <= 2).map(([id]) => id);
  const spots = [];
  for (let i = 0; i < order.want + 1; i++) {
    const mapId = J.pick(maps); const m = at.maps.find(x => x.id === mapId); const zone = J.pick(J.kerbside(m.zones).filter(z => z.kind === 'land'));
    if (zone) spots.push({mapId, mapName: m.name, zoneId: zone.id, label: zone.name, vid: order.ids ? J.pick(order.ids) : J.pick(['LV01', 'LV02', 'LV02', 'LV03', 'LV05'])});
  }
  const call = {id: uid(), type: 'crew', shiftId: null, actorId, userIds: ownersOf(actor), status: 'active', title: `Pat's order: ${order.want} × ${order.ids ? 'specific bikes' : 'bikes'}`, text: order.text,
    data: {order, spots, delivered: 0}, deadline: deadline('crew', 'order'), total: J.deadlineSeconds('crew', 'order') * 1000 * clock(),
    instruction: `Tip-offs: ${spots.map(s => `${s.label} (${s.mapName})`).join('; ')}. Nick them and ride them to The Arches.`};
  await mutate(s => { s.calls[call.id] = call; });
  await card('THE CHAINRING', 'Auntie Pat has a job', `<p>"${esc(order.text)}"</p><p><b>Tip-offs from Kez:</b></p><ul>${spots.map(s => `<li>${esc(s.label)} — ${esc(s.mapName)}</li>`).join('')}</ul><p class="smoke-dim">Bring them to The Arches, Morning Lane (Hackney Central). Bonus £${order.bonus} when the order's complete.</p>`, 'crew', {whisper: [...call.userIds, ...game.users.filter(u => u.isGM).map(u => u.id)]});
  return call.id;
});
/** Seed the tipped-off bikes the first time anyone loads the map they are on. */
let seeding=Promise.resolve();
async function seedCrewBikes(scene) {
 seeding=seeding.catch(()=>{}).then(()=>seedCrewBikesNow(scene));return seeding;
}
async function seedCrewBikesNow(scene) {
  const id = mapIdOf(scene); if (!id) return;
  for (const call of Object.values(state().calls).filter(c => c.type === 'crew')) {
    const todo = call.data.spots.filter(s => s.mapId === id && !s.seeded); if (!todo.length) continue;
    for (const s of todo) {
      const zone = zonesOf(scene).find(z => z.id === s.zoneId); if (!zone) continue;
      const [x, y] = J.pointIn(zone, Math.random, 90); const a = await ensureVehicleActor(s.vid);
      await placeToken(scene, a, x, y, {flags: {locked: true, parked: true, orderFor: call.id, traffic: {kind: 'bike'}}});
      s.seeded = true;
    }
    await updateCall(call.id, current=>({data:{...current.data,spots:call.data.spots}}));
  }
}

/* ------------------------------------------------------------------ the leader's clock */
async function offerTick() {
  const s = state();
  for (const sh of Object.values(s.shifts)) {
    if (sh.activeCall || now() < sh.nextOfferAt) continue;
    if (Object.values(s.calls).some(c => c.shiftId === sh.id && c.status === 'offered')) continue;
    const vt = vehicleOfShift(sh); if (!vt) continue;
    const pilot = occupants(vt).find(o => o.seatId === 'pilot');
    if (!pilot || vt.parent.tokens.get(pilot.tokenId)?.actorId !== sh.actorId) continue;   // driver must be at the wheel
    if (!isStreetScene(vt.parent)) continue;
    let offer = null; try { offer = await GEN[sh.type]?.offer(sh, vt); } catch (error) { console.warn('The Smoke | job offer', error); }
    if (!offer) { await mutate(x => { if (x.shifts[sh.id]) x.shifts[sh.id].nextOfferAt = now() + 10000; }); continue; }
    const call = {id: uid(), type: sh.type, shiftId: sh.id, actorId: sh.actorId, status: 'offered', expires: now() + 60000, ...offer};
    await mutate(x => { x.calls[call.id] = call; if (x.shifts[sh.id]) x.shifts[sh.id].nextOfferAt = now() + 60000; });
    await whisperOwners(sh, `${JOB_TYPES[sh.type].label.toUpperCase()} · CALLOUT`, offer.title, `<p>${offer.text}</p><div class="smoke-buttons"><button type="button" data-smoke-job-accept="${call.id}"><i class="fa-solid fa-check"></i> Accept</button><button type="button" data-smoke-job-decline="${call.id}"><i class="fa-solid fa-xmark"></i> Pass</button></div>`, 'job offer');
  }
}
export async function clockTick() {
  if (!isLeader() || game.paused || paused()) return;
  try {
    await offerTick();
    const s = state();
    for (const call of Object.values(s.calls)) {
      if (call.status === 'offered' && now() > call.expires) { await mutate(x => { delete x.calls[call.id]; if (x.shifts[call.shiftId]) x.shifts[call.shiftId].nextOfferAt = now() + 10000; }); continue; }
      if (call.status !== 'active') continue;
      if (call.deadline && now() > call.deadline) { await GEN[call.type].timeout(call); continue; }
      const sh = s.shifts[call.shiftId]; if (!sh) { if (call.type !== 'crew') await failCall(call.id, 'Shift over.'); continue; }
      const vt = vehicleOfShift(sh); if (!vt) continue;
      await GEN[call.type].tick(call, sh, vt);
    }
  } catch (error) { console.warn('The Smoke | job clock', error); }
}

registerHandler('job.tick',async({userId})=>{if(!game.users.get(userId)?.isGM)throw new Error('GM only.');return clockTick();});
registerHandler('job.roll',async({messageId})=>{
 const msg=game.messages.get(messageId),r=msg?.getFlag(NS,'roll'),callId=r?.context?.callId;
 if(!r||!callId||msg.getFlag(NS,'jobConsumed'))return;
 const call=state().calls[callId];if(!call||call.status!=='active')return;
 const author=r.userId?game.users.get(r.userId):(msg.author??game.users.get(msg.user?.id??msg.user)),actor=await fromUuid(r.actorUuid);
 if(!author||!actor||(!author.isGM&&!actor.testUserPermission(author,'OWNER'))||!canWorkCall(call,actor))return;
 const expected={chat:'frt',load:'sav',treat:'sav',hose:'grt',chase:'whl',stop:'frt',calm:'frt',cuff:'mus'}[r.context.step];
 if(expected!==r.stat)return;
 await msg.setFlag(NS,'jobConsumed',true);
 const sh=state().shifts[call.shiftId]??{id:null,actorId:call.actorId,userIds:call.userIds||[]};
 return GEN[call.type].roll?.(call,sh,r);
});
/* ------------------------------------------------------------------ install */
let timer = null;
export function installJobs() {
  if (timer) clearInterval(timer);
  // One job clock tick at a time: a slow tick (placing fares, offers) must not stack up behind itself in the world queue.
  let ticking = false;
  timer = setInterval(()=>{ if(!isLeader()||ticking)return; ticking=true;
    void dispatch('job.tick',{userId:game.user.id}).catch(e=>console.warn('The Smoke | jobs',e)).finally(()=>{ticking=false;}); }, 2000);
  // Rolls made from job buttons come back here (on the leader) through their chat message.
  Hooks.on('createChatMessage', msg => {
    if(!isLeader()||!msg.getFlag(NS,'roll')?.context?.callId)return;
    void dispatch('job.roll',{messageId:msg.id}).catch(e=>console.warn('The Smoke | job roll',e));
  });
  Hooks.on('smokePlateScanned', async ({policeToken, target}) => {
    if (!isLeader()) return; const sid = policeToken.getFlag(NS, 'shiftId'); if (!sid) return;
    const sh = state().shifts[sid]; const call = sh?.activeCall && state().calls[sh.activeCall]; if (!call) return;
    await GEN[call.type].event?.(call, sh, {kind: 'scan', targetId: target.id});
  });
  Hooks.on('smokeVehicleSold', async ({seller, catalogId, service}) => {
    if (!isLeader() || service !== 'gang') return;
    // Count the bike in the same write that reads the order (0.5.23: two sales close together both read "0 delivered"
    // and the order never completed), and finish it once.
    let hit = null;
    await mutate(s => {
      const call = Object.values(s.calls).find(c => c.type === 'crew' && c.actorId === seller?.id && !c.completing); if (!call) return;
      const o = call.data.order; if (o.ids && !o.ids.includes(catalogId)) return;
      call.data.delivered = Number(call.data.delivered || 0) + 1;
      if (call.data.delivered >= o.want) call.completing = true;
      hit = {id: call.id, delivered: call.data.delivered, want: o.want, bonus: o.bonus, done: Boolean(call.completing), userIds: call.userIds};
    });
    if (!hit) return;
    if (hit.done) return completeCall(hit.id, hit.bonus, `Auntie Pat: "Lovely. That's the order done." Order bonus.`, {repKey: 'crew'});
    notify(`Pat's order: ${hit.delivered}/${hit.want}`, {userIds: hit.userIds});
  });
  Hooks.on('canvasReady', () => { if (isLeader()) seedCrewBikes(canvas.scene).catch(() => null); });
  Hooks.on('smokeTransit', ({target}) => { if(isLeader())void seedCrewBikes(target).catch(e=>console.warn('The Smoke | job transit',e)); });
  let pausedWithFoundry=false;
  Hooks.on('pauseGame',p=>{if(!isLeader())return;if(p&&!paused()){pausedWithFoundry=true;void request('job.pause',{paused:true});}else if(!p&&pausedWithFoundry){pausedWithFoundry=false;void request('job.pause',{paused:false});}});
  Hooks.on('updateSetting', s => { if (s.key === `${NS}.${KEY}`) Hooks.callAll('smokeJobsChanged'); });
  // Start / end a shift from the vehicle's right-click.
  VEHICLE_ACTIONS.push(vt => {
    const jobs = jobsOfVehicle(vt.actor); if (!jobs.length) return [];
    const pilot = occupants(vt).find(o => o.seatId === 'pilot'); const driver = pilot && vt.parent.tokens.get(pilot.tokenId);
    if (!driver?.actor || !(game.user.isGM || driver.actor.isOwner)) return [];
    const sid = vt.getFlag(NS, 'shiftId');
    if (sid && state().shifts[sid]) return [{icon: 'fa-solid fa-flag-checkered', title: 'End shift', playerAllowed: true, fn: () => endShift(sid)}];
    return jobs.filter(j => JOB_TYPES[j]).map(j => ({icon: JOB_TYPES[j].icon, title: `Start ${JOB_TYPES[j].verb}`, playerAllowed: true, fn: () => startShift(vt, j)}));
  });
}
export const jobsAPI = {state, startShift, endShift, acceptCall, declineCall, askPat, pause: p => request('job.pause', {paused: p}), GEN};
