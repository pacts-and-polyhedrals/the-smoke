// Nicking things: cut a lock, hotwire a car, carjack a driver, then sell it — bikes to Auntie Pat at The Arches,
// motors to Bow Breakers Yard. All writes happen on the leader GM; rolls happen on the player's own client.
import {NS, CRIMES} from '../config.mjs';
import {fencePrice, isSuccess} from '../rules/core.mjs';
import {lockBandWithTool, theftResult, arrivedAt} from '../rules/jobs-core.mjs';
import {BOARD_GATES, VEHICLE_ACTIONS, boardingCandidates, boardVehicle, exitAllFromVehicle} from '../vehicles/vehicle-boarding.mjs';
import {hasAbility} from '../vehicles/vehicle-abilities.mjs';
import {request, registerHandler, isLeader, card, esc, ownersOf, notify} from './net.mjs';
import {zonesOf, tokenRect, placeToken, ensurePersonActor, randomPedKey, distanceSquares} from './spawn.mjs';

const BIKE_CLASSES = new Set(['bike']);
const PEDAL = v => Number(v?.system?.vehicle?.size ?? 1) === 0;          // bicycles and scooters
export const isLocked = vt => Boolean(vt?.getFlag?.(NS, 'locked'));
export const isTraffic = vt => vt?.getFlag?.(NS, 'traffic')?.kind === 'moving';
export const isStolen = vt => Boolean(vt?.getFlag?.(NS, 'stolen'));
const occupants = vt => { const o = vt?.getFlag?.(NS, 'vehicleOccupants'); return Array.isArray(o) ? o : []; };
const TOOLS = ['angle grinder', 'relay box', 'bolt cutters', 'slim jim', 'screwdriver'];
/** The best tool this character carries for this lock (a gear Item whose `tool` names it). */
export function bestTool(actor, vehicle) {
  const have = new Set(actor.items.filter(i => i.type === 'gear' && i.system.tool).map(i => String(i.system.tool).toLowerCase()));
  const pedal = PEDAL(vehicle);
  const usable = TOOLS.filter(t => have.has(t) && (pedal ? ['angle grinder', 'bolt cutters'].includes(t) : ['relay box', 'slim jim', 'screwdriver', 'angle grinder'].includes(t)));
  return usable[0] || 'none';
}
const LOUD = new Set(['angle grinder']);

/* ------------------------------------------------------------------ client actions */
async function myCharacterNear(vt, {reach = 1.01} = {}) {
  const list = boardingCandidates(vt).filter(t => !t.getFlag(NS, 'vehicleSeat') || t.getFlag(NS, 'vehicleSeat')?.vehicleTokenId !== vt.id);
  if (!list.length) throw new Error('Get one of your characters right next to it first.');
  if (list.length === 1) return list[0];
  const form = await foundry.applications.api.DialogV2.input({window: {title: `${vt.name}: who's doing it?`}, content: `<select name="t">${list.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>`});
  return list.find(t => t.id === form?.t) ?? null;
}
export async function nickIt(vt) {
  const who = await myCharacterNear(vt); if (!who) return;
  const actor = who.actor, tool = bestTool(actor, vt.actor);
  const band = lockBandWithTool(vt.getFlag(NS, 'lock') || vt.actor.system.vehicle.lock || 'medium', tool);
  const label = PEDAL(vt.actor) ? `Cut the lock: ${vt.name}` : `Break in and hotwire: ${vt.name}`;
  const out = await actor.rollDialog('grf', {band, label: `${label}${tool !== 'none' ? ` (${tool})` : ''}`, context: {kind: 'theft', vehicleTokenId: vt.id, tool}});
  if (!out?.message) return;
  return request('theft.resolve', {sceneId: vt.parent.id, vehicleTokenId: vt.id, tokenId: who.id, messageId: out.message.id, tool});
}
export async function carjack(vt) {
  const who = await myCharacterNear(vt, {reach: 1.5}); if (!who) return;
  const choice = await foundry.applications.api.DialogV2.wait({window: {title: `Carjack the ${vt.name}`}, content: '<p>Drag the driver out (Muscle) or scare them out (Front)? Either way, it is a witnessed carjacking: <b>+2 Heat</b>.</p>',
    buttons: [{action: 'mus', label: 'Drag them out (Muscle)', icon: 'fa-solid fa-hand-fist'}, {action: 'frt', label: 'Scare them out (Front)', icon: 'fa-solid fa-face-angry'}]});
  if (!choice || !['mus', 'frt'].includes(choice)) return;
  const out = await who.actor.rollStat(choice, {band: 'medium', label: `Carjack: ${vt.name}`, context: {kind: 'carjack', vehicleTokenId: vt.id}});
  if (!out?.message) return;
  return request('theft.carjack', {sceneId: vt.parent.id, vehicleTokenId: vt.id, tokenId: who.id, messageId: out.message.id});
}
export const sellVehicle = vt => request('theft.sell', {sceneId: vt.parent.id, vehicleTokenId: vt.id});

/** Where this vehicle can be sold from where it stands: 'gang' (Pat — bikes) or 'chop' (Bow Breakers — motors). */
export function fenceHere(vt) {
  const zones = zonesOf(vt.parent); const want = BIKE_CLASSES.has(vt.actor?.system?.vehicle?.klass) && Number(vt.actor.system.vehicle.size) <= 1 ? 'gang' : 'chop';
  const block = zones.find(z => z.service === want); if (!block) return null;
  return arrivedAt(zones, block.id, tokenRect(vt)) ? {service: want, block} : null;
}

/* ------------------------------------------------------------------ leader handlers */
function readRoll(messageId, kind, vehicleTokenId) {
  const m = game.messages.get(messageId); const r = m?.getFlag(NS, 'roll');
  if (!r || r.context?.kind !== kind || r.context?.vehicleTokenId !== vehicleTokenId) throw new Error('That roll does not match this vehicle.');
  if (m.getFlag(NS, 'consumed')) throw new Error('That roll has already been used.');
  return {m, r};
}
const witnessesNear = (scene, token, radius = 10) => scene.tokens.some(t => t.id !== token.id && t.actor?.type === 'npc' && !t.hidden && distanceSquares(t, token) <= radius);
const policeNear = (scene, token, radius = 12) => scene.tokens.some(t => t.getFlag(NS, 'police') && distanceSquares(t, token) <= radius);

registerHandler('theft.resolve', async ({sceneId, vehicleTokenId, tokenId, messageId, tool, userId}) => {
  const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), who = scene?.tokens.get(tokenId), user = game.users.get(userId);
  if (!vt || !who) throw new Error('Vehicle or character not found.');
  if (!user?.isGM && !who.actor?.testUserPermission(user, 'OWNER')) throw new Error('Not your character.');
  if (vt.getFlag(NS, 'jammed')) throw new Error(`The lock on the ${vt.name} is jammed solid.`);
  const {m, r} = readRoll(messageId, 'theft', vt.id); await m.setFlag(NS, 'consumed', true);
  const res = theftResult(r.outcomeKey, {loudTool: LOUD.has(String(tool))});
  const seen = res.witnessed && (witnessesNear(scene, who) || policeNear(scene, who) || r.outcomeKey === 'severeFailure');
  const byPolice = res.witnessed && policeNear(scene, who);
  if (res.unlocked) {
    const plate = vt.getFlag(NS, 'plate');
    await vt.update({[`flags.${NS}.locked`]: false, [`flags.${NS}.stolen`]: true, [`flags.${NS}.thief`]: who.actor.id, [`flags.${NS}.parked`]: false, [`flags.${NS}.traffic`]: null, [`flags.${NS}.hotUntil`]: Date.now() + 180000,
      ...(plate ? {[`flags.${NS}.marker`]: {kind: 'stolen', label: 'REPORTED STOLEN', since: 'reported minutes ago', note: 'Stolen from the street. Stop and detain the driver.'}} : {})}, {acVehicleCarry: true});
  } else if (res.jammed) await vt.update({[`flags.${NS}.jammed`]: true}, {acVehicleCarry: true});
  await card('NICKED?', `${who.name} · ${vt.name}`, `<p>${esc(res.note)}</p>${res.unlocked ? `<p><b>It's yours.</b> Right-click it → Board → Driver. ${PEDAL(vt.actor) ? 'Ride it to <b>The Arches</b> on Morning Lane for Auntie Pat.' : 'Sell it at <b>Bow Breakers Yard</b> (Mile End & Bow), or keep it.'}</p>` : ''}${seen ? '<p class="smoke-bad">Someone saw.</p>' : ''}`, res.unlocked ? 'win' : 'lose');
  if (seen) await who.actor.reportCrime(PEDAL(vt.actor) ? 'nickBike' : 'nickCar', {witnessed: true, byPolice});
  Hooks.callAll('smokeVehicleNicked', {vt, who, unlocked: res.unlocked});
  return res;
});

registerHandler('theft.carjack', async ({sceneId, vehicleTokenId, tokenId, messageId, userId}) => {
  const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), who = scene?.tokens.get(tokenId), user = game.users.get(userId);
  if (!vt || !who) throw new Error('Vehicle or character not found.');
  if (!user?.isGM && !who.actor?.testUserPermission(user, 'OWNER')) throw new Error('Not your character.');
  if (!isTraffic(vt)) throw new Error('Nobody is driving that one — nick it instead.');
  const {m, r} = readRoll(messageId, 'carjack', vt.id); await m.setFlag(NS, 'consumed', true);
  const byPolice = policeNear(scene, who);
  if (!isSuccess(r.outcomeKey)) {
    await card('CARJACK', `${vt.name} gets away`, `<p>The driver floors it and you are left in the road${r.outcomeKey === 'severeFailure' ? ' — clipped by the wing mirror (2 damage)' : ''}.</p>`, 'lose');
    if (r.outcomeKey === 'severeFailure') await who.actor.applyDamage(2);
    await who.actor.reportCrime('carjack', {witnessed: true, byPolice});
    return false;
  }
  const g = scene.grid.size, plate = vt.getFlag(NS, 'plate');
  await vt.update({[`flags.${NS}.traffic`]: null, [`flags.${NS}.locked`]: false, [`flags.${NS}.stolen`]: true, [`flags.${NS}.thief`]: who.actor.id,
    ...(plate ? {[`flags.${NS}.marker`]: {kind: 'stolen', label: 'CARJACKED — VIOLENT ROBBERY', since: 'just now', note: 'Driver dragged from the vehicle. Approach with caution.'}} : {})}, {acVehicleCarry: true});
  try { const ped = await ensurePersonActor(await randomPedKey()); await placeToken(scene, ped, vt.x + (vt.width + 1.5) * g, vt.y + g, {flags: {traffic: {kind: 'ped', flee: who.id}}}); } catch (_e) {}
  await card('CARJACK', `${who.name} takes the ${vt.name}`, `<p>The driver is out on the tarmac shouting into their phone.</p>`, 'win');
  await who.actor.reportCrime('carjack', {witnessed: true, byPolice});
  await boardVehicle(vt, who, 'pilot');
  return true;
});

registerHandler('theft.sell', async ({sceneId, vehicleTokenId, userId}) => {
  const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), user = game.users.get(userId);
  if (!vt) throw new Error('Vehicle not found.');
  const pilot = occupants(vt).find(o => o.seatId === 'pilot'); const rider = pilot && scene.tokens.get(pilot.tokenId);
  const seller = rider?.actor ?? game.actors.get(vt.getFlag(NS, 'thief'));
  if (!seller) throw new Error('Someone has to be riding it.');
  if (!user?.isGM && !seller.testUserPermission(user, 'OWNER')) throw new Error('Only the rider can sell it.');
  if (!isStolen(vt)) throw new Error(`Pat only buys nicked gear — the ${vt.name} is not stolen.`);
  if (hasAbility(vt.actor, 'docked')) throw new Error('A docking-station bike? Every one is tracked. Nobody will touch it.');
  if (['police', 'ambulance', 'fire', 'bus'].some(j => (vt.actor.system.vehicle.jobs || []).includes(j))) throw new Error('Nobody in their right mind buys an emergency vehicle. Dump it somewhere.');
  const here = fenceHere(vt); if (!here) throw new Error(`${vt.name}: ${BIKE_CLASSES.has(vt.actor.system.vehicle.klass) && Number(vt.actor.system.vehicle.size) <= 1 ? 'bikes go to Auntie Pat at The Arches (Hackney Central)' : 'motors go to Bow Breakers Yard (Mile End & Bow)'} — pull up outside first.`);
  const v = vt.actor.system.vehicle;
  const hot = Number(vt.getFlag(NS, 'hotUntil') || 0) > Date.now();
  const price = fencePrice({value: v.value, body: v.body.value, bodyMax: v.body.max, share: here.service === 'gang' ? 0.35 : 0.25, hot});
  await exitAllFromVehicle(vt, {keepDriver: false});
  const fresh = scene.tokens.get(vt.id); if (fresh) { await exitRider(scene, fresh); }
  await scene.tokens.get(vt.id)?.delete({smokeDespawn: true});
  await seller.changeCash(price, `${here.service === 'gang' ? 'Auntie Pat' : 'Bow Breakers Yard'} takes the ${vt.name}${hot ? ' (still hot — she knocks a bit off)' : ''}.`);
  if (here.service === 'gang') await seller.update({'system.rep.crew': Number(seller.system.rep?.crew || 0) + 1});
  Hooks.callAll('smokeVehicleSold', {seller, vehicleName: vt.name, catalogId: vt.actor.getFlag(NS, 'catalogId'), price, service: here.service, vehicle: vt.actor});
  return price;
});
async function exitRider(scene, vt) {
  const pilot = occupants(vt).find(o => o.seatId === 'pilot'); const t = pilot && scene.tokens.get(pilot.tokenId);
  if (t) { const {exitVehicle} = await import('../vehicles/vehicle-boarding.mjs'); await exitVehicle(t); }
}

/* ------------------------------------------------------------------ install */
export function installTheft() {
  // Nobody drives off in a locked motor, or a car someone else is driving.
  BOARD_GATES.push(async ({vt, ot, seat, user}) => {
    if (user?.isGM) return;
    const aboard = ot.getFlag(NS, 'vehicleSeat')?.vehicleTokenId === vt.id;
    if (aboard) return;
    if (isTraffic(vt) && seat.role === 'pilot') throw new Error(`Someone is driving the ${vt.name}. Carjack them (right-click the vehicle).`);
    if (isTraffic(vt)) throw new Error(`The ${vt.name} is someone else's ride.`);
    if (vt.getFlag(NS, 'jammed')) throw new Error(`The lock on the ${vt.name} is jammed.`);
    if (isLocked(vt) && !vt.actor?.testUserPermission?.(user, 'OWNER')) throw new Error(`The ${vt.name} is locked. Right-click it → Nick it.`);
  });
  // Getting into an emergency vehicle is a crime if the police see it (and you are not on a shift in it).
  Hooks.on('smokeBoarded', async ({vt, ot, seat, scene}) => {
    if (!isLeader() || seat.role !== 'pilot' || !ot.actor || ot.actor.type !== 'character') return;
    const jobs = vt.actor?.system?.vehicle?.jobs || [];
    if (jobs.includes('police') && !vt.getFlag(NS, 'issued') && policeNear(scene, ot, 10)) await ot.actor.reportCrime('stealCopCar', {witnessed: true, byPolice: true});
  });
  VEHICLE_ACTIONS.push(vt => {
    const out = [];
    if (isTraffic(vt)) out.push({icon: 'fa-solid fa-hand-fist', title: 'Carjack', fn: () => carjack(vt)});
    else if (isLocked(vt) && !vt.getFlag(NS, 'jammed')) out.push({icon: 'fa-solid fa-key', title: PEDAL(vt.actor) ? 'Nick it (cut the lock)' : 'Nick it (break in & hotwire)', fn: () => nickIt(vt)});
    if (isStolen(vt) && fenceHere(vt)) out.push({icon: 'fa-solid fa-sterling-sign', title: fenceHere(vt).service === 'gang' ? 'Sell to Auntie Pat' : 'Sell to Bow Breakers', fn: () => sellVehicle(vt)});
    return out;
  });
}
