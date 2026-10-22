// Nicking things: cut a lock, hotwire a car, carjack a driver, then sell it — bikes to Auntie Pat at The Arches,
// motors to Bow Breakers Yard. All writes happen on the leader GM; rolls happen on the player's own client.
import {NS} from '../config.mjs';
import {fencePrice, isSuccess} from '../rules/core.mjs';
import {lockBandWithTool, theftResult, arrivedAt} from '../rules/jobs-core.mjs';
import {BOARD_GATES, VEHICLE_ACTIONS, boardingCandidates, boardVehicle, exitAllFromVehicle} from '../vehicles/vehicle-boarding.mjs';
import {ejectAmbientCrew} from './traffic-crew.mjs';
import {hasAbility} from '../vehicles/vehicle-abilities.mjs';
import {request, registerHandler, isLeader, card, esc, ownersOf} from './net.mjs';
import {zonesOf, tokenRect, placeToken, ensurePersonActor, randomPedKey, distanceSquares} from './spawn.mjs';

const BIKE_CLASSES = new Set(['bike']);
const PEDAL = v => Number(v?.system?.vehicle?.size ?? 1) === 0;          // bicycles and scooters
export const isLocked = vt => Boolean(vt?.getFlag?.(NS, 'locked'));
export const isTraffic = vt => vt?.getFlag?.(NS, 'traffic')?.kind === 'moving';
export const isStolen = vt => Boolean(vt?.getFlag?.(NS, 'stolen'));
/** A Londoner at the wheel (Street Life crew), on a motor that isn't a police unit: one you carjack, not nick. */
export const npcAtWheel = vt => !vt?.getFlag?.(NS, 'police') && (vt?.getFlag?.(NS, 'vehicleOccupants') || []).some(o => o?.seatId === 'pilot' && o.ambient === true && vt.parent?.tokens?.get?.(o.tokenId));
/** Somebody else is driving it: moving traffic, or a motor the GM placed with an NPC driver (0.5.23). */
export const carjackable = vt => isTraffic(vt) || npcAtWheel(vt);
const occupants = vt => { const o = vt?.getFlag?.(NS, 'vehicleOccupants'); return Array.isArray(o) ? o : []; };
const TOOLS = ['angle grinder', 'relay box', 'bolt cutters', 'slim jim', 'screwdriver'];
/** The best tool this character carries for this lock (a gear Item whose `tool` names it). */
export function bestTool(actor, vehicle) {
  const have = new Set(actor.items.filter(i => i.type === 'gear' && Number(i.system.quantity)>0 && i.system.tool).map(i => String(i.system.tool).toLowerCase()));
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
  const choice = await foundry.applications.api.DialogV2.wait({window: {title: `Carjack the ${vt.name}`}, content: '<p>Drag the driver out (Muscle) or scare them out (Front)? Either way, it is a witnessed carjacking: <b>1★ Heat</b> if you had none (it never takes you higher).</p>',
    buttons: [{action: 'mus', label: 'Drag them out (Muscle)', icon: 'fa-solid fa-hand-fist'}, {action: 'frt', label: 'Scare them out (Front)', icon: 'fa-solid fa-face-angry'}]});
  if (!choice || !['mus', 'frt'].includes(choice)) return;
  const out = await who.actor.rollStat(choice, {band: 'medium', label: `Carjack: ${vt.name}`, context: {kind: 'carjack', vehicleTokenId: vt.id}});
  if (!out?.message) return;
  return request('theft.carjack', {sceneId: vt.parent.id, vehicleTokenId: vt.id, tokenId: who.id, messageId: out.message.id});
}
export const sellVehicle = vt => request('theft.sell', {sceneId: vt.parent.id, vehicleTokenId: vt.id});

/* ------------------------------------------------------------------ player-initiated street interactions */
/** Choose a player's nearby character to attempt a pickpocket or speak to a non-owned NPC.
 * This never grants the player ownership of the NPC actor. */
async function myCharacterByNpc(target) {
  if (!target?.parent || target.actor?.type !== 'npc' || target.hidden) throw new Error('Choose a visible person.');
  const all = Array.from(target.parent.tokens?.contents || target.parent.tokens || []);
  const candidates = all.filter(t => t.actor?.type === 'character' &&
    (game.user.isGM || t.actor.testUserPermission?.(game.user,'OWNER')) &&
    distanceSquares(t,target) <= 2.2);
  if (!candidates.length) throw new Error('Get your character alongside the person first.');
  if (candidates.length === 1) return candidates[0];
  const form = await foundry.applications.api.DialogV2.input({window:{title:`${target.name}: choose your character`},
    content:`<label>Your character<select name="t">${candidates.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>`});
  return candidates.find(t => t.id === form?.t) ?? null;
}
export async function pickpocket(target) {
  const who = await myCharacterByNpc(target); if (!who) return null;
  const context = {kind:'pickpocket',sceneId:target.parent.id,targetTokenId:target.id};
  const out = await who.actor.rollDialog('grf',{band:'medium',label:`Pickpocket: ${target.name}`,context});
  if (!out?.message) return null;
  return request('theft.pickpocket',{sceneId:target.parent.id,targetTokenId:target.id,tokenId:who.id,messageId:out.message.id});
}
export async function talkTo(target) {
  const who = await myCharacterByNpc(target); if (!who) return null;
  return request('theft.talk',{sceneId:target.parent.id,targetTokenId:target.id,tokenId:who.id});
}
function requireNpcInteraction({sceneId,targetTokenId,tokenId,userId}) {
  const scene = game.scenes.get(sceneId), target = scene?.tokens.get(targetTokenId), who = scene?.tokens.get(tokenId), user = game.users.get(userId);
  if (!scene || !user || !target || target.actor?.type !== 'npc' || target.hidden) throw new Error('That person is not available.');
  if (!who || who.actor?.type !== 'character' || !user.isGM && !who.actor.testUserPermission?.(user,'OWNER')) throw new Error('Not your character.');
  if (!user.isGM && distanceSquares(who,target) > 2.2) throw new Error('Get closer before interacting.');
  return {scene,target,who,user};
}
registerHandler('theft.talk', async data => {
  const {target,who} = requireNpcInteraction(data);
  const to = [...new Set([...ownersOf(who.actor),...game.users.filter(u=>u.isGM).map(u=>u.id)])];
  await card('STREET CHAT',`${who.name} approaches ${target.name}`,`<p>${esc(who.name)} wants to talk. The GM can respond for this person.</p>`,'crew',{whisper:to});
  return true;
});
registerHandler('theft.pickpocket', async data => {
  const {target,who,scene} = requireNpcInteraction(data);
  const {m,r} = readStreetRoll(data.messageId,'pickpocket',target.id,scene.id);
  if (r.actorUuid !== who.actor.uuid || r.stat !== 'grf') throw new Error('That is not this character’s Graft roll.');
  // Consume the exact roll once. All game-world outcomes (including Heat) are applied by the leader.
  await m.setFlag(NS,'consumed',true);
  const success = isSuccess(r.outcomeKey);
  const noticed = !success || r.outcomeKey === 'narrowSuccess';
  const byPolice = noticed && policeNear(scene,who);
  const owners = [...new Set([...ownersOf(who.actor),...game.users.filter(u=>u.isGM).map(u=>u.id)])];
  await card('PICKPOCKET',`${who.name} · ${target.name}`,
    `<p>${success ? (noticed ? 'You lift something, but someone clocks you.' : 'A clean lift. They have not noticed yet.') : 'No luck: you did not get anything, and your attempt is noticed.'}</p><p><b>GM:</b> ${success ? 'Decide what the NPC was carrying and award it to this character if appropriate.' : 'Adjudicate the NPC reaction.'} No inventory or money has been transferred automatically.</p>`,
    success?'win':'lose',{whisper:owners});
  if (noticed) await who.actor.reportCrime('pickpocket',{witnessed:true,byPolice});
  return {success,noticed};
});
function readStreetRoll(messageId,kind,targetTokenId,sceneId) {
  const m = game.messages.get(messageId),r = m?.getFlag(NS,'roll');
  if (!m || !r || r.context?.kind !== kind || r.context?.targetTokenId !== targetTokenId || r.context?.sceneId !== sceneId)
    throw new Error('That roll does not match this target.');
  if (m.getFlag(NS,'consumed')) throw new Error('That attempt has already been resolved.');
  return {m,r};
}

/* ------------------------------------------------------------------ fences: who buys what, and where */
// Auntie Pat buys anything on two wheels (pedal bikes, scooters, mopeds, scramblers, motorbikes) at The Arches on
// Morning Lane. Cars and vans go to Bow Breakers Yard on Roman Road (Old Ford & Bow).
export const FENCES = Object.freeze({
  gang: {who: 'Auntie Pat', where: 'The Arches, Morning Lane (Hackney Central & Homerton)', share: 0.35},
  chop: {who: 'Bow Breakers Yard', where: 'Bow Breakers Yard, Roman Road (Old Ford & Bow)', share: 0.25}
});
export const FENCE_REACH = 4;   // squares from the yard's walls that still count as "outside"
export const buyerFor = actor => BIKE_CLASSES.has(actor?.system?.vehicle?.klass) ? 'gang' : 'chop';
/** Distance in pixels from a point to a zone rectangle (0 inside it). */
export function distToRect([bx, by, bw, bh], x, y) { return Math.hypot(Math.max(bx - x, 0, x - (bx + bw)), Math.max(by - y, 0, y - (by + bh))); }
/** Where this vehicle can be sold from where it stands, or null. */
export function fenceHere(vt) {
  const scene = vt?.parent; if (!scene || !vt.actor) return null;
  const want = buyerFor(vt.actor), zones = zonesOf(scene);
  // Ridden right into The Arches: anywhere inside counts.
  if (want === 'gang' && scene.getFlag?.(NS, 'place')?.id === 'LDP-ARCHES') return {service: want, block: zones.find(z => z.service === 'drop') ?? zones[0] ?? null};
  const block = zones.find(z => z.service === want); if (!block) return null;
  if (arrivedAt(zones, block.id, tokenRect(vt))) return {service: want, block};
  const [x, y, w, h] = tokenRect(vt), g = scene.grid?.size || 100;
  return distToRect(block.rect, x + w / 2, y + h / 2) <= FENCE_REACH * g ? {service: want, block} : null;
}
/** What the fence will pay right now. */
export function quoteFor(vt, service = buyerFor(vt.actor), seller = null) {
  const v = vt.actor.system.vehicle, hot = Number(vt.getFlag(NS, 'hotUntil') || 0) > Date.now();
  const bonus = Number(seller?.system?.stage || 1) >= 6 ? 1.1 : 1;   // Rep 6: a known supplier
  return {price: Math.round(fencePrice({value: v.value, body: v.body.value, bodyMax: v.body.max, share: FENCES[service].share, hot}) * bonus / 5) * 5, hot, bonus: bonus > 1};
}
/** Why a fence won't touch this vehicle, or '' if it is sellable. */
export function unsellable(vt) {
  if (!isStolen(vt)) return `The ${vt.name} is not nicked.`;
  if (hasAbility(vt.actor, 'docked')) return 'A docking-station bike? Every one is tracked. Nobody will touch it.';
  if (['police', 'ambulance', 'fire', 'bus'].some(j => (vt.actor.system.vehicle.jobs || []).includes(j))) return 'Nobody in their right mind buys an emergency vehicle. Dump it somewhere.';
  if (!Number(vt.actor.system.vehicle.value)) return `The ${vt.name} is worth nothing to a fence.`;
  return '';
}
/** How this nicked vehicle stands against the rider's open order from Pat (read from the job state). */
export function patOrderNote(actor, vt) {
  let st = null; try { st = game.settings.get(NS, 'jobState'); } catch (_e) {}
  const call = Object.values(st?.calls || {}).find(c => c.type === 'crew' && c.actorId === actor?.id && c.status === 'active'); if (!call) return null;
  const o = call.data?.order || {}, id = vt.actor?.getFlag?.(NS, 'catalogId'), counts = !o.ids || o.ids.includes(id);
  return {counts, delivered: Number(call.data?.delivered || 0), want: Number(o.want || 1), bonus: Number(o.bonus || 0)};
}
const riderOf = vt => { const p = occupants(vt).find(o => o.seatId === 'pilot'); return p ? vt.parent.tokens.get(p.tokenId) : null; };
/** The nicked vehicle this character is riding on `scene`, with where to take it. Used by the phone. */
export function ridingNicked(actor, scene = canvas?.scene) {
  if (!actor || !scene) return null;
  const vt = scene.tokens.find(t => t.actor?.type === 'vehicle' && isStolen(t) && riderOf(t)?.actorId === actor.id); if (!vt) return null;
  const service = buyerFor(vt.actor), here = fenceHere(vt), why = unsellable(vt);
  return {vt, service, here, why, fence: FENCES[service], ...quoteFor(vt, service, actor), order: service === 'gang' ? patOrderNote(actor, vt) : null};
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
  if (!isLocked(vt)) throw new Error(`${vt.name} is not locked. Get in instead of hotwiring it.`);
  if (carjackable(vt)) throw new Error(`${vt.name} has a driver. Try carjacking instead.`);
  if (vt.getFlag(NS, 'jammed')) throw new Error(`The lock on the ${vt.name} is jammed solid.`);
  const {m, r} = readRoll(messageId, 'theft', vt.id);
  if(r.actorUuid!==who.actor.uuid)throw new Error('That is not this character’s roll.');
  if(String(r.context.tool)!==String(tool)||tool!==bestTool(who.actor,vt.actor))throw new Error('The tool does not match the roll or inventory.');
  if(distanceSquares(who,vt)>Math.max(vt.width,vt.height)+2&&!user.isGM)throw new Error('Get beside the vehicle.');
  await m.setFlag(NS, 'consumed', true);
  const res = theftResult(r.outcomeKey, {loudTool: LOUD.has(String(tool))});
  const seen = res.witnessed && (witnessesNear(scene, who) || policeNear(scene, who) || r.outcomeKey === 'severeFailure');
  const byPolice = res.witnessed && policeNear(scene, who);
  if (res.unlocked) {
    const plate = vt.getFlag(NS, 'plate');
    await vt.update({[`flags.${NS}.locked`]: false, [`flags.${NS}.stolen`]: true, [`flags.${NS}.thief`]: who.actor.id, [`flags.${NS}.parked`]: false, [`flags.${NS}.traffic`]: null, [`flags.${NS}.hotUntil`]: Date.now() + 180000,
      ...(plate ? {[`flags.${NS}.marker`]: {kind: 'stolen', label: 'REPORTED STOLEN', since: 'reported minutes ago', note: 'Stolen from the street. Stop and detain the driver.'}} : {})}, {acVehicleCarry: true});
  } else if (res.jammed) await vt.update({[`flags.${NS}.jammed`]: true}, {acVehicleCarry: true});
  const fence = FENCES[buyerFor(vt.actor)];
  await card('NICKED?', `${who.name} · ${vt.name}`, `<p>${esc(res.note)}</p>${res.unlocked ? `<p><b>It's yours.</b> Right-click it → Board → Driver. Take it to <b>${esc(fence.where)}</b> — ${esc(fence.who)} will make an offer when you pull up.</p>` : ''}${seen ? '<p class="smoke-bad">Someone saw.</p>' : ''}`, res.unlocked ? 'win' : 'lose');
  if (seen) await who.actor.reportCrime(PEDAL(vt.actor) ? 'nickBike' : 'nickCar', {witnessed: true, byPolice});
  Hooks.callAll('smokeVehicleNicked', {vt, who, unlocked: res.unlocked});
  return res;
});

registerHandler('theft.carjack', async ({sceneId, vehicleTokenId, tokenId, messageId, userId}) => {
  const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), who = scene?.tokens.get(tokenId), user = game.users.get(userId);
  if (!vt || !who) throw new Error('Vehicle or character not found.');
  if (!user?.isGM && !who.actor?.testUserPermission(user, 'OWNER')) throw new Error('Not your character.');
  if (!carjackable(vt)) throw new Error('Nobody is driving that one — nick it instead.');
  const {m, r} = readRoll(messageId, 'carjack', vt.id);
  if(r.actorUuid!==who.actor.uuid)throw new Error('That is not this character’s roll.');
  if(distanceSquares(who,vt)>Math.max(vt.width,vt.height)+2&&!user.isGM)throw new Error('Get beside the vehicle.');
  await m.setFlag(NS, 'consumed', true);
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
  await ejectAmbientCrew(vt,{fleeTokenId:who.id}); // actual taxi/bus/road driver, not a newly invented random witness
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
  const why = unsellable(vt); if (why) throw new Error(why);
  const here = fenceHere(vt); if (!here) { const f = FENCES[buyerFor(vt.actor)]; throw new Error(`${vt.name}: ${f.who} buys these — pull up at ${f.where} first.`); }
  const {price, hot} = quoteFor(vt, here.service, seller);
  await exitAllFromVehicle(vt, {keepDriver: false});
  const fresh = scene.tokens.get(vt.id); if (fresh) { await exitRider(scene, fresh); }
  await scene.tokens.get(vt.id)?.delete({smokeDespawn: true});
  await seller.changeCash(price, `${FENCES[here.service].who} takes the ${vt.name}${hot ? ' (still hot — a bit knocked off)' : ''}.`);
  if (here.service === 'gang') await seller.update({'system.rep.crew': Number(seller.system.rep?.crew || 0) + 1});
  if (price >= 500 && seller.type === 'character') { const {awardXP} = await import('./jobs.mjs'); await awardXP(seller, 1, `Sold the ${vt.name}`); }
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
    if (carjackable(vt) && seat.role === 'pilot') throw new Error(`Someone is driving the ${vt.name}. Carjack them (right-click the vehicle).`);
    if (isTraffic(vt)) throw new Error(`The ${vt.name} is someone else's ride.`);
    if (vt.getFlag(NS, 'jammed')) throw new Error(`The lock on the ${vt.name} is jammed.`);
    if (isLocked(vt) && !vt.actor?.testUserPermission?.(user, 'OWNER')) throw new Error(`The ${vt.name} is locked. Right-click it → Nick it.`);
  });
  // Getting into an emergency vehicle is a crime if the police see it (and you are not on a shift in it).
  // Riding off on a street vehicle that isn't yours makes it nicked, even when the GM skipped the lock roll.
  Hooks.on('smokeBoarded', async ({vt, ot, seat, scene}) => {
    if (!isLeader() || seat.role !== 'pilot' || !ot.actor || ot.actor.type !== 'character') return;
    const jobs = vt.actor?.system?.vehicle?.jobs || [];
    if (jobs.includes('police') && !vt.getFlag(NS, 'issued') && policeNear(scene, ot, 10)) await ot.actor.reportCrime('stealCopCar', {witnessed: true, byPolice: true});
    const streetVehicle = vt.getFlag(NS, 'locked') || vt.getFlag(NS, 'parked') || vt.getFlag(NS, 'orderFor') || vt.getFlag(NS, 'traffic');
    if (streetVehicle && !isStolen(vt) && !vt.getFlag(NS, 'issued') && !isTraffic(vt)) {
      const plate = vt.getFlag(NS, 'plate');
      await vt.update({[`flags.${NS}.locked`]: false, [`flags.${NS}.stolen`]: true, [`flags.${NS}.thief`]: ot.actor.id, [`flags.${NS}.parked`]: false, [`flags.${NS}.traffic`]: null,
        ...(plate ? {[`flags.${NS}.marker`]: {kind: 'stolen', label: 'REPORTED STOLEN', since: 'reported minutes ago', note: 'Stolen from the street. Stop and detain the driver.'}} : {})}, {acVehicleCarry: true});
      const f = FENCES[buyerFor(vt.actor)];
      await card('NICKED', `${ot.name} · ${vt.name}`, `<p>Off it goes. Take it to <b>${esc(f.where)}</b> — ${esc(f.who)} will make an offer when you pull up.</p>`, 'win', {whisper: [...ownersOf(ot.actor), ...game.users.filter(u => u.isGM).map(u => u.id)]});
    }
    await offerAtFence(scene.tokens.get(vt.id));
  });
  // Pull up at the right fence on a nicked ride and the buyer makes an offer in chat (once per visit).
  Hooks.on('updateToken', (doc, change) => {
    if (!isLeader() || !('x' in change || 'y' in change) || doc.actor?.type !== 'vehicle' || !isStolen(doc)) return;
    offerAtFence(doc).catch(error => console.warn('The Smoke | fence offer', error));
  });
  VEHICLE_ACTIONS.push(vt => {
    const out = [];
    if (carjackable(vt)) out.push({icon: 'fa-solid fa-hand-fist', title: 'Carjack', playerAllowed: true, fn: () => carjack(vt)});
    else if (isLocked(vt) && !vt.getFlag(NS, 'jammed')) out.push({icon: 'fa-solid fa-key', title: PEDAL(vt.actor) ? 'Nick it (cut the lock)' : 'Nick it (break in & hotwire)', playerAllowed: true, fn: () => nickIt(vt)});
    const here = isStolen(vt) && !unsellable(vt) && fenceHere(vt);
    if (here && (game.user.isGM || riderOf(vt)?.actor?.isOwner || game.actors.get(vt.getFlag(NS,'thief'))?.isOwner)) out.push({icon: 'fa-solid fa-sterling-sign', title: `Sell to ${FENCES[here.service].who} (£${quoteFor(vt, here.service, riderOf(vt)?.actor).price})`, playerAllowed: true, fn: () => sellVehicle(vt)});
    return out;
  });
}

/** The fence's offer, whispered to the rider when they arrive. Clears when they ride away so the next visit offers again. */
export async function offerAtFence(vt) {
  if (!vt?.actor || !isStolen(vt)) return false;
  const here = fenceHere(vt), was = vt.getFlag(NS, 'atFence');
  if (!here) { if (was) await vt.update({[`flags.${NS}.atFence`]: false}, {acVehicleCarry: true}); return false; }
  const rider = riderOf(vt); if (was || !rider?.actor) return false;
  await vt.update({[`flags.${NS}.atFence`]: true}, {acVehicleCarry: true});
  const f = FENCES[here.service], why = unsellable(vt), to = [...ownersOf(rider.actor), ...game.users.filter(u => u.isGM).map(u => u.id)];
  if (why) { await card(f.who.toUpperCase(), `${f.who} won't touch it`, `<p>${esc(why)}</p>`, 'lose', {whisper: to}); return false; }
  const {price, hot} = quoteFor(vt, here.service, rider.actor), order = here.service === 'gang' ? patOrderNote(rider.actor, vt) : null;
  const orderLine = !order ? '' : order.counts
    ? `<p><b>Pat's order:</b> this makes ${order.delivered + 1} of ${order.want}.${order.delivered + 1 >= order.want ? ` That finishes it: +£${order.bonus} bonus.` : ''}</p>`
    : `<p><b>Pat's order:</b> "Lovely, but that's not what I asked for." She'll still buy it; it doesn't count toward the order.</p>`;
  await card(f.who.toUpperCase(), `${f.who} looks over the ${vt.name}`, `<p>"I'll give you <b>£${price}</b> for it${hot ? ' — it\'s still hot, mind' : ''}."</p>${orderLine}
    <div class="smoke-buttons"><button type="button" data-smoke-sell="${esc(vt.uuid)}"><i class="fa-solid fa-sterling-sign"></i> Sell for £${price}${order?.counts ? ' · deliver the order' : ''}</button></div>
    <p class="smoke-dim">Or keep it and ride on. The offer comes back next time you pull up.</p>`, 'crew', {whisper: to});
  return true;
}
