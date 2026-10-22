// Chases: when the police get eyes on a wanted player, the street goes turn-based. Everyone in it rolls speed dice in
// the Combat Console — the players, each police unit (by its Performance die) and the nearest passing traffic — and
// acts on each die, highest first. Behind the wheel each action is measured on the green / yellow / red gauge. In
// auto mode the police and traffic take their own turns: units drive the real roads toward the wanted (cutting them
// off rather than sitting on their bumper), push into yellow and red when they're losing them, ram, PIT, shoot from
// the car at four stars, and pile out to nick anyone on foot; traffic carries on along its trip and pulls over for the
// blues. Out of every unit's reach at the end of a round, the players have lost them.
import {NS} from '../config.mjs';
import * as D from '../rules/driving.mjs';
import * as TC from '../rules/traffic-core.mjs';
import * as R from '../combat/rules.mjs';
import {clampHeat} from '../rules/core.mjs';
import {isLeader, registerHandler, request, card, esc} from './net.mjs';
import {tokenCentre, distanceSquares, ensurePersonActor, placeToken} from './spawn.mjs';
import {drivingNetwork} from './roads.mjs';
import {chaseOf, chaseMode, stateOf, actionKey, currentCombatant, ridersOf, pilotOf, vehicleOf, tallyOf, civilianTraffic, pendingResponses, canManageChase} from './chase-state.mjs';
import {recordJourney} from '../vehicles/travel-meter.mjs';
import {carryCrewInBatch,deployPoliceCrew} from './traffic-crew.mjs';
import {npcDriveRoll, npcRoll, promptCheck, lostControl, logIncident, fireRoundEnd} from './incidents.mjs';
import {headingOf, tripForToken, obstaclesOf} from './traffic.mjs';
import {lightsOn} from '../vehicles/vehicle-abilities.mjs';
import {settlingMoves} from '../vehicles/vehicle-boarding.mjs';
import {offerStop, armedCrime} from './pursuit.mjs';

const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isVehicle = t => t?.actor?.type === 'vehicle';
const vdata = t => t?.actor?.system?.vehicle ?? {};
const wantedOf = a => a?.type === 'character' && clampHeat(a.system?.heat?.value) > 0;
const bodyOf = t => vehicleOf(t) ?? t;
const sq = (t, g) => { const [x, y] = tokenCentre(t); return {x: x / g, y: y / g, rotation: Number(t.rotation) || 0}; };
const condNames = a => (a?.items ?? []).filter(i => i.type === 'condition').map(i => i.name);
const combatClass = () => CONFIG.Combat?.documentClass ?? getDocumentClass('Combat');

export function registerChaseSettings() {
  const reg = (k, o) => { try { game.settings.register(NS, k, {scope: 'world', config: true, ...o}); } catch (_e) {} };
  reg('autoChase', {name: 'Chases: start turn-based pursuits automatically', hint: 'Start a chase when ground police spot a wanted driver or anyone wanted at two stars or more. Disable for a fully manual sandbox.', type: Boolean, default: true});
  reg('chaseAuto', {name: 'Chase: legacy automatic NPC control', hint: 'Compatibility with old worlds; choose Full Auto / Assisted / Manual using Chase mode.', type: Boolean, default: true});
  reg('chaseMode', {name: 'Chases: GM automation mode', hint: 'Full Auto resolves police, traffic and round transitions once player choices are completed. Assisted requires Continue after NPC turns. Manual is controlled by the GM.', type: String, choices: {full: 'Full Auto', assisted: 'Assisted', manual: 'Manual'}, default: 'full'});
  reg('chaseTrafficMode', {name: 'Chases: civilian traffic turns', hint: 'One shared traffic phase, or individual speed dice for up to 12 nearby civilian motors.', type: String, choices: {shared: 'Shared traffic phase', individual: 'Individual traffic speed dice'}, default: 'shared'});
  reg('chaseDelay', {name: 'Chases: seconds before an assisted action', hint: 'Reading time before NPC actions in Full Auto and Assisted modes. Full Auto advances finished NPC turns; Assisted pauses for GM review.', type: Number, default: 3, range: {min: 2, max: 10, step: 1}});
  reg('autoEvade', {name: 'Driving: roll evasive manoeuvres automatically', hint: 'When a player drives over a vehicle, roll Wheels and apply the swerve or crash immediately, even outside a chase. Off: ask the driver to roll in chat.', type: Boolean, default: true});
  reg('chasePacingVersion', {scope: 'world', config: false, type: Number, default: 0});
}

/* ------------------------------------------------------------------ starting and ending */
/** Turn a map into a chase around a wanted player (leader only, no nested requests). */
// One authoritative chase per scene. The start lock prevents two simultaneous sightings
// from creating duplicate Combat documents or two competing turn controllers.
const starting=new Map();
export function startChaseNow(scene,opts={}){
  if(!scene)return Promise.resolve(null);
  if(starting.has(scene.id))return starting.get(scene.id);
  const task=startChaseInternal(scene,opts);
  starting.set(scene.id,task);
  void task.finally(()=>{if(starting.get(scene.id)===task)starting.delete(scene.id);}).catch(()=>{});
  return task;
}
async function startChaseInternal(scene, {targetId = null, auto = null, reason = 'Police chase'} = {}) {
  if (!scene) return null;
  let combat = chaseOf(scene); const already = combat?.getFlag(NS, 'chase');
  const g = scene.grid.size;
  const pcs = new Set(scene.tokens.filter(t => wantedOf(t.actor) || t.id === targetId).map(t => t.id));
  for (const id of [...pcs]) { const vt = vehicleOf(scene.tokens.get(id)); for (const o of ridersOf(vt)) { const r = scene.tokens.get(o.tokenId); if (r?.actor?.type === 'character') pcs.add(r.id); } }
  if (!pcs.size) return null;
  if (!already) for (const id of pcs) { const pc = scene.tokens.get(id); if (pc?.getFlag(NS, 'policeResisted')) await pc.setFlag(NS, 'policeResisted', null); }
  const centres = [...pcs].map(id => sq(bodyOf(scene.tokens.get(id)), g));
  const near = (t, r) => { const p = sq(t, g); return centres.some(c => Math.hypot(c.x - p.x, c.y - p.y) <= r); };
  const units = scene.tokens.filter(t => isVehicle(t) && t.getFlag(NS, 'police') && t.getFlag(NS, 'police').unit !== 'heli' && !vdata(t).destroyed && !ridersOf(t).some(o => scene.tokens.get(o.tokenId)?.actor?.type === 'character') && near(t, D.CHASE_REACH.units));
  const officers = scene.tokens.filter(t => t.getFlag(NS, 'police')?.unit === 'officer' && !condNames(t.actor).includes('Down') && near(t, D.CHASE_REACH.officers));
  const traffic = civilianTraffic(scene);
  const mode = already?.mode ?? setting('chaseMode','full');
  const trafficMode = already?.trafficMode ?? setting('chaseTrafficMode','shared');
  combat ??= await combatClass().create({scene: scene.id, active: true});
  if(scene.getFlag(NS,'chaseCombatId')!==combat.id)await scene.setFlag(NS,'chaseCombatId',combat.id);
  const seenAtStart=Object.fromEntries([...pcs].map(id=>scene.tokens.get(id)).filter(Boolean).filter(t=>units.some(u=>distanceSquares(u,bodyOf(t))<=14)).map(t=>[t.actorId,{at:Date.now(),point:tokenCentre(bodyOf(t))}]));
  const chase = {auto: auto ?? mode !== 'manual', mode, trafficMode, since: Date.now(), reason, action: null, searching: false, lastSeen: {...seenAtStart,...(already?.lastSeen??{})}};
  await combat.update({[`flags.${NS}.chase`]: {...(already || {}), ...chase}});
  const have = new Set(combat.combatants.map(c => c.tokenId));
  const chosenTraffic=trafficMode==='individual'?traffic.filter(t=>near(t,24)).sort((a,b)=>Math.min(...centres.map(c=>Math.hypot(sq(a,g).x-c.x,sq(a,g).y-c.y)))-Math.min(...centres.map(c=>Math.hypot(sq(b,g).x-c.x,sq(b,g).y-c.y)))).slice(0,12):[];
  const add = [...[...pcs].map(id => scene.tokens.get(id)), ...units, ...officers, ...chosenTraffic].filter(t => t && !have.has(t.id));
  if (add.length) await combat.createEmbeddedDocuments('Combatant', add.map(t => ({tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: t.hidden})));
  const names = [...pcs].map(id => scene.tokens.get(id)?.name).filter(Boolean);
  await card('CHASE', `${reason}!`, `<p class="smoke-passed">IT'S ON</p><p><b>${esc(names.join(', '))}</b> ${names.length > 1 ? 'have' : 'has'} got ${units.length} unit${units.length === 1 ? '' : 's'} on ${names.length > 1 ? 'them' : 'their tail'}${traffic.length ? `, with ${traffic.length} motor${traffic.length === 1 ? '' : 's'} in the way` : ''}. Open the <b>Combat Console</b> and roll your speed dice. Players and police act separately; ${trafficMode==='individual'?'the nearest civilian traffic uses individual speed dice':'civilian traffic shares one phase'}. Mode: ${chase.mode}. Full Auto does not skip any unresolved player decision.</p>
    <p class="smoke-dim">Behind the wheel each die is one action on the gauge — <b class="g">green</b> up to your Speed is safe; <b class="y">yellow</b> (to 1½×) costs Handling −1 and a Medium Wheels check; <b class="r">red</b> (to 2×) costs −2 and a Hard check. Drive over another vehicle and you swerve or crash. Stay more than 30 squares clear of every unit for a round to lose one star; repeat until zero.</p>`, 'chase', {flags: {[NS]: {openConsole: true}}});
  game.socket.emit(`system.${NS}`, {type: 'smokeWorld.combatConsole', data: {sceneId: scene.id}});
  if (globalThis.canvas?.scene?.id === scene.id) game.smoke?.openCombat?.();
  if (!already || stateOf(combat).phase === 'idle') { const {beginRound} = await import('../combat/combat.mjs'); await beginRound(combat.id); }
  return combat;
}
/** The chase is over: say why, cool things down and hand the map back to real time. */
export async function endChase(combat, {escaped = false, why = ''} = {}) {
  const scene = combat?.scene; if (!scene) return;
  const lost = {};
  for (const c of combat.combatants) { const t = c.token; if (t && wantedOf(t.actor)) lost[t.actorId] = tokenCentre(bodyOf(t)); }
  if (escaped) await scene.setFlag(NS, 'chaseCooldown', {until: Date.now() + 60000, last: lost}).catch(() => null);
  for (const t of scene.tokens.filter(x => x.getFlag(NS, 'policeStop')?.combatId === combat.id)) { const stop = t.getFlag(NS, 'policeStop'); const m = stop.messageId && game.messages.get(stop.messageId); if (m) await m.setFlag(NS, 'promptDone', true); await t.setFlag(NS, 'policeStop', null); await t.setFlag(NS, 'stopped', null); }
  for (const t of scene.tokens.filter(x => x.getFlag(NS, 'police')?.parked)) await t.update({[`flags.${NS}.police.parked`]: false}, {acVehicleCarry: true}).catch(() => null);
  await card('CHASE OVER', escaped ? 'Lost them!' : 'Chase over', `<p>${esc(why || (escaped ? 'Out of sight, out of mind. For now.' : 'That\'s that.'))}</p>${escaped ? '<p class="smoke-dim">The units search where they last saw you for a minute. Stay out of sight and the stars start to drop.</p>' : ''}`, escaped ? 'chase win' : 'chase');
  try { await combat.delete(); await scene.unsetFlag(NS,'chaseCombatId'); } catch (error) { console.warn('The Smoke | ending the chase', error); }
}
/** End of a round in any fight: fires go up, evasive driving ends; in a chase, the helicopter keeps up and we see who got away. */
export async function roundEnd(combat, st) {
  const scene = combat?.scene; if (!scene) return;
  await fireRoundEnd(combat, st);
  if (combat.getFlag(NS, 'chase')) { const {helicopterPhase}=await import('./heat.mjs'); await helicopterPhase(combat); }
  for (const t of scene.tokens.filter(x => isVehicle(x) && x.getFlag(NS, 'dodging'))) await t.update({[`flags.${NS}.dodging`]: false}, {acVehicleCarry: true}).catch(() => null);
  if (!combat.getFlag(NS, 'chase') || !game.combats.get(combat.id)) return;
  const g = scene.grid.size, inIt = combat.combatants.map(c => c.token).filter(Boolean);
  const wanted = inIt.filter(t => wantedOf(t.actor) && !condNames(t.actor).some(c => ['Cuffed', 'Down'].includes(c)) && !t.actor.system.states?.surrendered).map(t => sq(bodyOf(t), g));
  const units = inIt.filter(t => t.getFlag(NS, 'police') && !(isVehicle(t) && vdata(t).destroyed)).map(t => sq(t, g));
  // No rubber-banding helicopter: breaking contact must actually create a way out.
  const heli = scene.tokens.find(t => t.getFlag(NS, 'police')?.unit === 'heli');
  if (heli && !vdata(heli).destroyed) units.push(sq(heli, g));
  const res = D.chaseOver({wanted, units});
  if (!res.over) {
    if (combat.getFlag(NS, 'chase')?.searching && wanted.some(w => units.some(u => Math.hypot(u.x - w.x, u.y - w.y) <= 14))) await combat.update({[`flags.${NS}.chase.searching`]: false});
    await joinReinforcements(combat, wanted);
    return;
  }
  if (res.escaped) {
    const cooled = new Set();
    for (const c of combat.combatants) if (!cooled.has(c.actor?.id) && wantedOf(c.actor) && c.token && !condNames(c.actor).some(n => ['Cuffed', 'Down'].includes(n))) { cooled.add(c.actor.id); await c.actor.setHeat(clampHeat(c.actor.system.heat.value) - 1, 'Out of every police unit’s reach for a round: one star lost.'); }
    if (combat.combatants.some(c => wantedOf(c.actor))) {
      await combat.update({[`flags.${NS}.chase.searching`]: true});
      await card('SEARCH', 'Lost contact · one star down', '<p>The units have lost your trail. They search instead of tracking your exact position. Begin the next round when ready; stay clear to lose another star, until zero.</p>', 'chase win');
      return;
    }
  }
  await endChase(combat, res);
}

/**
 * Police on this map who belong in this fight or chase go on its combat tracker: every unit and officer hunting someone
 * in it (more stars bring more cars), and any other unit that has come within reach. They act on their own speed dice:
 * dealt in at once while the dice are still being rolled, otherwise from the next round. While a fight or chase is on,
 * police never drive in on the wanted in real time between turns (see huntingUnits in heat.mjs). Runs on the leader.
 */
export async function joinReinforcements(combat, wanted = null, {announce = true} = {}) {
  const scene = combat?.scene; if (!scene || !game.combats.get(combat.id)) return 0;
  const g = scene.grid.size, have = new Set(combat.combatants.map(c => c.tokenId));
  const fighters = combat.combatants.map(c => c.token).filter(t => t && wantedOf(t.actor));
  const hunted = new Set(fighters.map(t => t.actorId));
  wanted ??= fighters.map(t => sq(bodyOf(t), g));
  if (!wanted.length) return 0;
  const near = (t, r) => { const p = sq(t, g); return wanted.some(w => Math.hypot(p.x - w.x, p.y - w.y) <= r); };
  const fresh = scene.tokens.filter(t => {
    const pol = t.getFlag(NS, 'police'); if (have.has(t.id) || !pol || pol.unit === 'heli' || pol.parked) return false;
    if (isVehicle(t) ? (vdata(t).destroyed || t.getFlag(NS, 'fire')) : condNames(t.actor).some(c => ['Down', 'Cuffed'].includes(c))) return false;
    if (ridersOf(t).some(o => scene.tokens.get(o.tokenId)?.actor?.type === 'character')) return false;
    return hunted.has(pol.hunting) || near(t, pol.unit === 'officer' ? D.CHASE_REACH.officers : D.CHASE_REACH.units);
  });
  if (!fresh.length) return 0;
  await combat.createEmbeddedDocuments('Combatant', fresh.map(t => ({tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: t.hidden})));
  const now = stateOf(combat).phase === 'intent', what = combat.getFlag(NS, 'chase') ? 'chase' : 'fight';
  if (announce) await card(what === 'chase' ? 'CHASE' : 'COMBAT', `More police join the ${what}`, `<p>${esc(fresh.map(t => t.name).join(', '))} ${fresh.length > 1 ? 'are' : 'is'} on the combat tracker and ${now ? 'roll speed dice this round' : 'roll speed dice from the next round'}.</p>`, 'heat');
  return fresh.length;
}
/**
 * A police unit's go in an ordinary fight (not a chase): drive in along the roads on its dice, and once it is close,
 * the officers pile out and join the fight on foot (the car parks up).
 */
export async function policeUnitInFight(combat, unit) {
  const scene = unit.parent, pol = unit.getFlag(NS, 'police') || {};
  if (pol.parked) return card('POLICE', unit.name, '<p>Parked up: the officers are on foot.</p>', 'heat', {whisper: gmIds()});
  const target = targetFor(scene, unit); if (!target) return card('POLICE', unit.name, '<p>Nobody left to nick. Holding position.</p>', 'heat', {whisper: gmIds()});
  const body = bodyOf(target), heat = clampHeat(target.actor.system.heat?.value);
  if (distanceSquares(unit, body) <= 6) return officersOut(combat, unit, target, heat);
  const driven = await driveToward(unit, tokenCentre(body), D.driveBands(vdata(unit)).green, {short: 3});
  if (distanceSquares(unit, body) <= 6) return officersOut(combat, unit, target, heat);
  return card('POLICE', `${unit.name} closes in`, `<p>${driven ? `${Math.round(driven)} squares nearer ${esc(target.name)}, blues and twos.` : 'Boxed in: going nowhere this action.'}</p>`, `heat h${heat}`);
}

/* ------------------------------------------------------------------ losing a die */
/** Spun out, crashed: the vehicle (or whoever drives it) loses its next die this round. */
export async function loseNextAction(vt, why = 'lost it') {
  const combat = chaseOf(vt?.parent); if (!combat) return false;
  const p = pilotOf(vt), ids = new Set(combat.combatants.filter(c => c.tokenId === vt.id || (p && c.tokenId === p.id)).map(c => c.id));
  const st = stateOf(combat), q = [...(st.queue || [])], i = q.findIndex((e, n) => n > st.cursor && ids.has(e.cid));
  if (i < 0) return false;
  q.splice(i, 1); await combat.update({[`flags.${NS}.state`]: {...st, queue: q}});
  await card('CHASE', `${vt.name} loses a die`, `<p>${esc(why)}: its next action this round is gone.</p>`, 'chase');
  return true;
}

/* ------------------------------------------------------------------ driving a route, animated */
/** Drive a token along `route` from s0 to s1 (px), hop by hop round the corners, so it follows the road on screen. */
async function driveRoute(t, route, s0, s1, {ms = 2400, combat = null, key = null} = {}) {
  const scene = t.parent, g = scene.grid.size, L = TC.cumulative(route);
  let marks = []; for (let i = 1; i < route.length; i++) if (L[i] > s0 + 4 && L[i] < s1 - 4) marks.push(L[i]);
  if (marks.length > 6) { const k = Math.ceil(marks.length / 6); marks = marks.filter((_, i) => i % k === k - 1); }
  marks.push(s1); let prev = s0;
  for (const s of marks) {
    if (combat && !canContinue(combat, key)) return;
    const p = TC.pointAt(route, s, {incoming: true}), dur = Math.max(160, Math.round(ms * (s - prev) / Math.max(1, s1 - s0)));
    await scene.updateEmbeddedDocuments('Token', carryCrewInBatch(scene,[{_id: t.id, x: Math.round(p.x - t.width * g / 2), y: Math.round(p.y - t.height * g / 2), rotation: Math.round(TC.rotationOf(p.dx, p.dy))}]),
      {smokeTraffic: true, acVehicleCarry: true, animate: true, animation: {duration: dur}});
    await recordJourney(scene.tokens.get(t.id)??t,(s-prev)/g,{key,source:'police'});
    await sleep(dur); prev = s;
  }
}
/** Straight at something (close in, or off-road): stop `short` squares from it. */
async function closeIn(t, goal, squares, short = 2, combat = null) {
  if (combat && !canContinue(combat, actionKey(combat))) return 0;
  const g = t.parent.grid.size, [ax, ay] = tokenCentre(t), d = Math.hypot(goal[0] - ax, goal[1] - ay), step = Math.max(0, Math.min(squares * g, d - short * g));
  if (step < g * 0.3) return 0;
  const nx = ax + (goal[0] - ax) / d * step, ny = ay + (goal[1] - ay) / d * step;
  await t.parent.updateEmbeddedDocuments('Token',carryCrewInBatch(t.parent,[{_id:t.id,x:Math.round(nx-t.width*g/2),y:Math.round(ny-t.height*g/2),rotation:Math.round(TC.rotationOf((goal[0]-ax)/d,(goal[1]-ay)/d))}]),{smokeTraffic:true,acVehicleCarry:true,animate:true,animation:{duration:700}});
  await recordJourney(t,step/g,{key:combat? actionKey(combat):null,source:'police'});
  await sleep(700); return step / g;
}
/** A gauge check for an NPC driver who pushed it: roll, and lose it on a failure. */
async function npcBandCheck(t, band, key) {
  if (!['yellow', 'red'].includes(band)) return true;
  const r = await npcDriveRoll(t, {band: D.bandCheck(band), label: `${t.name}: ${D.BAND_INFO[band].short}`, penalty: D.bandPenalty(band)});
  const res = D.lossOfControl({band, outcomeKey: r.outcomeKey, size: Number(vdata(t).size ?? 2)});
  if (res.incident) { await lostControl(t, res, {key, driver: 'the driver'}); return false; }
  return true;
}
/**
 * One action of driving toward a point along the roads: the route from where it is (the way it faces), as far as
 * `squares` allows, stopping `short` squares from the goal and short of anything in the lane. Returns squares driven.
 */
async function driveToward(t, goal, squares, {short = 2.2, key = null} = {}) {
  const scene = t.parent, g = scene.grid.size, local = await drivingNetwork(scene).catch(() => null);
  const trip = local && TC.tripFrom(local, tokenCentre(t), {heading: headingOf(t), goal});
  if (!trip) return closeIn(t, goal, squares, short, chaseOf(scene));
  const route = TC.lanePath(trip.pts, trip.widths, {offset: w => Math.round(TC.laneOffset(w) * 0.5)}), total = TC.pathLength(route);
  const front = Math.max(Number(t.width) || 2, Number(t.height) || 3) * g / 2;
  const others = obstaclesOf(scene).filter(o => o.id !== t.id);
  let go = Math.min(squares * g, total - short * g);
  go = Math.min(go, TC.clearAhead(route, 0, go, others, {front, gap: g * 0.35}));
  if (go < g * 0.3) return 0;
  const st = TC.stepAlong(route, 0, go, {ease: 1});
  await driveRoute(t, route, 0, st.s, {combat: chaseOf(scene), key});
  return st.s / g;
}

/* ------------------------------------------------------------------ the police on their turn */
function targetFor(scene, unit) {
  const hunting = unit.getFlag(NS, 'police')?.hunting;
  const list = scene.tokens.filter(t => wantedOf(t.actor) && !condNames(t.actor).some(c => ['Cuffed', 'Down'].includes(c)) && !t.actor.system.states?.surrendered);
  return list.find(t => t.actorId === hunting) ?? list.sort((a, b) => distanceSquares(unit, bodyOf(a)) - distanceSquares(unit, bodyOf(b)))[0] ?? null;
}
const guardOfVehicle = t => R.vehicleGuard(vdata(t).size) + (t.getFlag(NS, 'dodging') ? 2 : 0);
async function policeVehicleTurn(combat, unit) {
  const scene = unit.parent, g = scene.grid.size, pol = unit.getFlag(NS, 'police') || {}, key = actionKey(combat);
  if (pol.parked) return card('POLICE', unit.name, '<p>Parked up: the officers are on foot.</p>', 'heat', {whisper: gmIds()});
  const target = targetFor(scene, unit); if (!target) return card('POLICE', `${unit.name}`, '<p>Nobody left to chase. Holding position.</p>', 'heat', {whisper: gmIds()});
  const body = bodyOf(target), onFoot = body === target, distance = distanceSquares(unit, body), heat = clampHeat(target.actor.system.heat?.value);
  if (target.getFlag(NS, 'policeStop')) return;
  if (distance<=14&&!target.getFlag(NS,'indoors')) {
    const last={...(combat.getFlag(NS,'chase')?.lastSeen??{}),[target.actorId]:{at:Date.now(),point:tokenCentre(body)}};
    await combat.update({[`flags.${NS}.chase.lastSeen`]:last});
  }
  if (combat.getFlag(NS,'chase')?.searching&&distance>14){
    const last=combat.getFlag(NS,'chase')?.lastSeen?.[target.actorId]?.point;
    if(!last)return card('POLICE SEARCH',unit.name,'<p>Contact lost. Searching side streets without a precise fix.</p>','chase');
    const searchCount=Number(unit.getFlag(NS,'searchTurns')||0);
    const offsets=[[0,0],[5,0],[0,5],[-5,0],[0,-5],[8,8],[-8,-8]];
    const off=offsets[searchCount%offsets.length];
    const driven=await driveToward(unit,[last[0]+off[0]*g,last[1]+off[1]*g],D.driveBands(vdata(unit)).green,{short:1,key});
    await unit.setFlag(NS,'searchTurns',searchCount+1);
    return card('POLICE SEARCH',unit.name,`<p>Searching ${Math.round(driven)} squares around the last known position. No live suspect tracking.</p>`,'chase');
  }
  if (distance <= (onFoot ? 4 : 5) && !target.getFlag(NS, 'policeResisted')) return offerStop(target, unit, combat);
  const bands = D.driveBands(vdata(unit));
  const choice = D.policeAction({distance, heat, targetOnFoot: onFoot, bands, armed: armedCrime(target.actor)});
  if (choice.act === 'officersOut') return officersOut(combat, unit, target, heat);
  if (choice.act === 'ram' || choice.act === 'pit') return contact(unit, body, choice.act, {key});
  if (choice.act === 'shoot') return shootFromCar(unit, body, target, {combatId: combat.id});
  // drive: to where they're going, not where they are, when they're moving away fast
  let goal = tokenCentre(body);
  if (!onFoot && distance > 6) { const ip = D.interceptPoint(sq(body, g), distance, D.driveBands(vdata(body)).green); goal = [ip.x * g, ip.y * g]; }
  const ok = await npcBandCheck(unit, choice.band, key);
  if (!ok || !canContinue(combat, key)) return; // a failed handling check ends the action
  const driven = await driveToward(unit, goal, choice.squares, {short: onFoot ? 2.5 : 2.2, key});
  await card('POLICE', `${unit.name}: ${choice.why}`, `<p>${driven ? `${Math.round(driven)} squares${choice.band !== 'green' ? ` (${D.BAND_INFO[choice.band].label.toLowerCase()})` : ''} after ${esc(target.name)}.` : 'Boxed in, going nowhere this action.'}</p>`, `heat h${heat}`);
}
/** Ram or PIT: pull alongside and make contact. */
async function contact(unit, body, act, {key = null} = {}) {
  const scene = unit.parent, g = scene.grid.size;
  const combat = chaseOf(scene);
  await closeIn(unit, tokenCentre(body), 3, 1.8, combat);
  if (combat && !canContinue(combat, key)) return;
  const r = await npcDriveRoll(unit, {tn: guardOfVehicle(body), label: `${unit.name}: ${act === 'ram' ? 'ram' : 'PIT manoeuvre'} → ${body.name}`});
  if (!r.success && r.margin < 0) return card('POLICE', `${unit.name} misses ${body.name}`, `<p>${act === 'ram' ? 'Swings in and catches nothing but air and kerb.' : 'Goes for the back wheel and misses.'}</p>`, 'heat');
  if (act === 'ram') {
    const res = R.ramDamage({margin: Math.max(0, r.margin), size: Number(vdata(unit).size ?? 2), targetIsVehicle: true});
    return promptCheck(body, {kind: 'ramSave', difficulty: 'hard', band: 'red', other: unit, damage: res, label: 'Police ram: evade the impact',
      why: `${esc(unit.name)} comes in hard. Roll Wheels (Hard) to avoid ${res.target} Body damage. The chase waits for your response.`});
  }
  await logIncident(body, {kind: 'pit', label: `PIT manoeuvre by ${unit.name}`, against: unit.name});
  return promptCheck(body, {kind: 'pitSave', difficulty: 'hard', band: 'red', other: unit, label: 'PIT manoeuvre: hold it straight',
    why: `${esc(unit.name)} noses into the back wheel. Hold it (Wheels, Hard) or spin round and lose your next die.`});
}
export async function shootFromCar(unit, body, target, {combatId = null} = {}) {
  const onFoot = body === target, guard = onFoot ? Number(target.actor.system.guard?.value ?? 9) + (target.getFlag(NS, 'dodging') ? 2 : 0) : guardOfVehicle(body) + 2;
  const r = await npcRoll({name: unit.name, die: 8, perfDie: 8, tn: guard, label: `Armed officers fire at ${onFoot ? target.name : body.name}`});
  if (r.margin < 0) return card('SHOTS FIRED', `${unit.name} misses`, '<p>Rounds into brickwork and windscreens.</p>', 'heat h4');
  const armour = onFoot ? Number(target.actor.system.armour || 0) : Number(vdata(body).armour || 0), dmg = R.hitDamage({margin: r.margin, impact: 3, armour});
  const victim = onFoot ? target : body;
  const attack = {target: victim.uuid, total: r.total, damage: dmg, attacker: unit.actor.uuid, attackerName: unit.name, severity: 'Police gunfire', conditions: onFoot ? ['Bleeding'] : [], effects: []};
  return card('SHOTS FIRED · RESPOND', `${unit.name} → ${victim.name}: ${dmg}`, `<p>Resolve this hit before anyone acts again.</p><div class="smoke-buttons"><button type="button" data-smoke-damage="${esc(victim.uuid)}" data-amount="${dmg}">Take hit · ${dmg}</button>${onFoot && !target.actor.system.states?.reactionUsed ? `<button type="button" data-smoke-dodge="${esc(target.uuid)}">Dodge · reaction</button>` : ''}</div>`, 'damage', {flags: {[NS]: {attack, chaseCombatId: combatId}}});
}
/** Officers out: two (armed at four stars) get out next to the suspect and join from next round. The unit parks up. */
async function officersOut(combat, unit, target, heat) {
  const scene = unit.parent, g = scene.grid.size, [ux, uy] = tokenCentre(unit), [tx, ty] = tokenCentre(target), d = Math.hypot(tx - ux, ty - uy) || 1;
  const officer = await ensurePersonActor(heat >= 4 ? 'arv' : 'pc'), made = await deployPoliceCrew(unit,target,2);
  for (let i = made.length; i < 2; i++) {
    const ox = ux + (tx - ux) / d * g * 1.6 + (i ? 1 : -1) * (ty - uy) / d * g, oy = uy + (ty - uy) / d * g * 1.6 - (i ? 1 : -1) * (tx - ux) / d * g;
    made.push(await placeToken(scene, officer, ox, oy, {name: heat >= 4 ? 'Armed Officer' : 'PC', flags: {police: {unit: 'officer', hunting: target.actorId}}}));
  }
  await unit.update({[`flags.${NS}.police.parked`]: true}, {acVehicleCarry: true});
  const have = new Set(combat.combatants.map(c => c.tokenId));
  await combat.createEmbeddedDocuments('Combatant', made.filter(t => t && !have.has(t.id)).map(t => ({tokenId: t.id, sceneId: scene.id, actorId: t.actorId})));
  const mine = combat.combatants.filter(c => c.tokenId === unit.id).map(c => c.id); if (mine.length) await combat.deleteEmbeddedDocuments('Combatant', mine);
  return card('POLICE', `${unit.name}: officers out!`, `<p>Doors fly open — two ${heat >= 4 ? 'armed officers' : 'officers'} on foot after ${esc(target.name)}. They act from next round.</p>`, `heat h${heat}`);
}

/* ------------------------------------------------------------------ a single traffic phase */
export async function trafficPhase(combat,{onlyToken=null}={}) {
  const scene = combat.scene, g = scene.grid.size, key = actionKey(combat), local = await drivingNetwork(scene).catch(() => null);
  const obstacles = obstaclesOf(scene), plans = [], gone = [];
  let yielding = 0, blocked = 0;
  for (const t of onlyToken?[onlyToken]:civilianTraffic(scene)) {
    const f = t.getFlag(NS, 'traffic') || {};
    if (scene.tokens.some(b => b.id !== t.id && lightsOn(b) && distanceSquares(b, t) < 8)) { yielding++; continue; }
    if (Number(f.stalledUntil || t.getFlag(NS, 'stalledUntil') || 0) > Date.now()) { blocked++; continue; }
    const route = Array.isArray(f.route) && f.route.length >= 2 ? f.route : local && tripForToken(local, t);
    if (!route) { blocked++; continue; }
    const s = Number(f.s) || 0, total = TC.pathLength(route), want = D.driveBands(vdata(t)).green * g * (Number(f.pace) || 1);
    const front = Math.max(Number(t.width) || 2, Number(t.height) || 3) * g / 2;
    const go = Math.min(want, TC.clearAhead(route, s, want, obstacles.filter(o => o.id !== t.id), {front, gap: g * 0.35}));
    if (go < g * 0.3) { blocked++; continue; }
    const end = Math.min(total, s + go);
    // Reserve endpoints as well as the shared starting snapshot: crossing cars cannot claim the same space.
    const dest = TC.pointAt(route, end, {incoming: true});
    if (plans.some(p => Math.hypot(p.dest.x - dest.x, p.dest.y - dest.y) < g * 1.5)) { blocked++; continue; }
    plans.push({t, route, s, end, dest});
    if (end >= total - 2 && !f.keep) gone.push(t.id);
  }
  const frames = 12, duration = 2400;
  for (let frame = 1; frame <= frames; frame++) {
    if (!canContinue(combat, key)) return;
    const ups = plans.filter(p => scene.tokens.get(p.t.id)).map(({t, route, s, end}) => {
      const at = s + (end - s) * frame / frames, p = TC.pointAt(route, at, {incoming: true});
      return {_id: t.id, x: Math.round(p.x - t.width * g / 2), y: Math.round(p.y - t.height * g / 2), rotation: Math.round(TC.rotationOf(p.dx, p.dy)), [`flags.${NS}.traffic.route`]: route, [`flags.${NS}.traffic.s`]: at, [`flags.${NS}.traffic.wait`]: 0};
    });
    if (ups.length) { await scene.updateEmbeddedDocuments('Token', carryCrewInBatch(scene,ups), {smokeTraffic: true, acVehicleCarry: true, animate: true, animation: {duration: duration / frames}}); await sleep(duration / frames); }
  }
  for (const p of plans) if(scene.tokens.get(p.t.id))await recordJourney(p.t,(p.end-p.s)/g,{key:onlyToken?key:null,source:'traffic'});
  if (gone.length && canContinue(combat, key)) await scene.deleteEmbeddedDocuments('Token', gone, {smokeDespawn: true});
  await card('TRAFFIC PHASE', onlyToken ? onlyToken.name : 'All civilian traffic', `<p>${plans.length} motor(s) move${onlyToken ? '' : ' together'} · ${yielding} yield to blue lights · ${blocked} wait. Police and player vehicles keep their own turns.</p>`, 'chase', {whisper: gmIds()});   // a summary for the GM, not a chat line every round
}

/* ------------------------------------------------------------------ an NPC's die */
/** Whatever an NPC does with the current die. Runs on the leader, outside the request queue (it makes requests). */
export async function npcTurn(combat, combatant) {
  const t = combatant?.token, a = combatant?.actor; if (!t || !a) return;
  if (isVehicle(t)) {
    if (vdata(t).destroyed || t.getFlag(NS, 'fire')) return card('CHASE', t.name, `<p>${vdata(t).destroyed ? 'A burnt-out shell.' : 'Burning. Going nowhere.'}</p>`, 'chase', {whisper: gmIds()});
    if (tallyOf(t, actionKey(combat)).stopped) return null;
    if (t.getFlag(NS, 'police')) return policeVehicleTurn(combat, t);
    return trafficPhase(combat,{onlyToken:t});
  }
  if (t.getFlag(NS, 'police') || a.system?.role === 'police') { const {policeTurn} = await import('../combat/combat.mjs'); return policeTurn(t); }
  return card('CHASE', t.name, '<p>Holds their ground. (GM: their go, if you want it.)</p>', 'chase', {whisper: gmIds()});
}

/* ------------------------------------------------------------------ robust automatic / assisted / manual state transitions */
const running = new Map(), scheduled = new Set(), advancing = new Set();
function canContinue(combat, key) {
  const live = game.combats.get(combat.id), action = live?.getFlag(NS, 'chase')?.action;
  return Boolean(live && !game.paused && !pendingResponses(live).length && !live.scene?.tokens?.some(t => settlingMoves.has(t.uuid)) && actionKey(live) === key && (!action || action.status === 'running' && (!action.automatic || live.getFlag(NS, 'chase')?.auto)));
}
async function runAction(combatId, key, automatic) {
  const combat = game.combats.get(combatId); if (!combat || actionKey(combat) !== key) { running.delete(combatId); return; }
  let errorText = '', performed=false;
  try {
    if (automatic) await sleep(Math.max(0.3,Number(setting('chaseDelay',3))||3)*1000);
    if (!canContinue(combat, key)) return;
    performed=true;
    const {entry, combatant} = currentCombatant(combat);
    if (entry?.kind === 'traffic') await trafficPhase(combat);
    else if (combatant) await npcTurn(combat, combatant);
  } catch (error) { console.warn('The Smoke | NPC turn', error); errorText = error.message; }
  finally {
    const live = game.combats.get(combatId);
    if (live && actionKey(live) === key && live.getFlag(NS, 'chase')?.action?.key === key) {
      if(!performed){await live.update({[`flags.${NS}.chase.action`]:null});}
      else {await live.update({[`flags.${NS}.chase.action`]: {key, status: 'review', automatic, error: errorText}});
      if(errorText||chaseMode(live)==='assisted')await card('CHASE · PAUSED', errorText ? 'Action needs attention' : 'Action finished — review and continue', `<p>${errorText ? esc(errorText) : 'Resolve any card, read the outcome, then press Continue in the Combat Console.'}</p>`, 'chase');}
    }
    running.delete(combatId);
    schedule(combatId);
  }
}
async function beginAction(combat, automatic = false) {
  const key = actionKey(combat), {entry, combatant} = currentCombatant(combat);
  if (!combat.getFlag(NS, 'chase')) throw new Error('Start a chase before using chase assistance.');
  if (!key || !entry || running.has(combat.id) || combat.getFlag(NS, 'chase')?.action?.key === key) return;
  if (combatant?.hasPlayerOwner) throw new Error('That is a player’s go.');
  const pending = pendingResponses(combat); if (pending.length) throw new Error(`Waiting: ${pending.join('; ')}.`);
  if (game.paused) throw new Error('The game is paused.');
  // Lock before any awaited document update or hook can schedule this action a second time.
  running.set(combat.id, true);
  try { await combat.update({[`flags.${NS}.chase.action`]: {key, status: 'running', automatic}}); } catch (error) { running.delete(combat.id); throw error; }
  // Start outside the world request queue: NPC actions can make their own authorised requests.
  void Promise.resolve().then(() => runAction(combat.id, key, automatic)).catch(error => console.warn('The Smoke | chase action', error));
}
async function autopilot(combatId) {
  const combat = game.combats.get(combatId), chase = combat?.getFlag(NS, 'chase');
  if (!isLeader() || game.paused || !chase || chaseMode(combat)==='manual' || pendingResponses(combat).length) return;
  const mode=chaseMode(combat);
  if(advancing.has(combatId)||combat.scene?.tokens?.some(t=>settlingMoves.has(t.uuid)))return;
  if(stoppedByError(chase))return;
  const st = stateOf(combat);
  if(st.phase==='idle'&&mode==='full') {
    if(!combat.combatants.some(c=>c.actor?.type==='character'&&wantedOf(c.actor)))return;
    await advanceOnce(combatId,()=>request('combat.begin',{combatId,automatic:true}));return;
  }
  if (st.phase === 'intent') {
    const waiting = combat.combatants.filter(c => { const sp = c.getFlag(NS, 'speed') || {}; return sp.count && !sp.rolled; });
    if (waiting.some(c => !c.hasPlayerOwner)) { await request('combat.npcSpeed', {combatId}); schedule(combatId); return; }
    if (!waiting.length) await request('combat.reveal', {combatId});
    return;
  }
  if(st.phase !== 'resolve')return;
  const key=actionKey(combat),{entry,combatant}=currentCombatant(combat);
  if(!key||running.has(combatId))return;
  if(mode==='full' && chase.action?.key===key && chase.action?.status==='review' && !chase.action?.error){
    await advanceOnce(combatId,()=>request('combat.next',{combatId,key}));return;
  }
  if(combatant?.hasPlayerOwner||chase.action?.key===key)return;
  if(entry?.kind==='traffic'||combatant)await request('chase.npcTurn',{combatId,key,automatic:true});
}
function stoppedByError(chase){return Boolean(chase.autopilotError)||(chase.action?.status==='review'&&Boolean(chase.action?.error));}
/** A failed transition must never spin the microtask queue forever or silently skip the turn. */
async function advanceOnce(combatId,fn){
  if(advancing.has(combatId))return;
  advancing.add(combatId);let success=false;
  try{await fn();success=true;}
  catch(error){
    const live=game.combats.get(combatId);
    console.warn('The Smoke | automatic advance needs GM intervention',error);
    if(live?.getFlag(NS,'chase'))await live.update({[`flags.${NS}.chase.autopilotError`]:String(error.message||error).slice(0,300)});
  }finally{advancing.delete(combatId);if(success)schedule(combatId);}
}
function schedule(combatId) {
  if (scheduled.has(combatId)) return; scheduled.add(combatId);
  queueMicrotask(() => { scheduled.delete(combatId); void autopilot(combatId).catch(error => console.warn('The Smoke | chase assistant', error)); });
}
/** Upgrade to selectable modes without resetting an already configured mode on every login. */
export async function migrateChasePacing() {
  if (!isLeader()) return;
  if (Number(setting('chasePacingVersion', 0)) < 2) {
    // v0.5.3 forcibly disabled both settings. Restore the intended automated default once,
    // while a world using the new chaseMode setting can explicitly choose Manual later.
    await game.settings.set(NS, 'autoChase', true); await game.settings.set(NS, 'chaseAuto', true);
    for (const c of game.combats ?? []) if (c.getFlag(NS, 'chase')) {
      const st = stateOf(c), trafficIds = new Set(c.combatants.filter(cb => cb.token?.getFlag(NS, 'traffic')?.kind === 'moving' && !cb.token.getFlag(NS, 'police') && !cb.hasPlayerOwner).map(cb => cb.id));
      const mode=c.getFlag(NS,'chase')?.mode??setting('chaseMode','full');
      const previousAction=c.getFlag(NS,'chase')?.action;
      const up = {[`flags.${NS}.chase.auto`]: mode!=='manual', [`flags.${NS}.chase.mode`]:mode, [`flags.${NS}.chase.trafficMode`]:setting('chaseTrafficMode','shared'),
        [`flags.${NS}.chase.action`]:previousAction?.status==='running'?{...previousAction,status:'review',error:'GM review after migration'}:previousAction};
      if (trafficIds.size && st.phase === 'resolve') {
        const past = (st.queue || []).slice(0, st.cursor), future = (st.queue || []).slice(st.cursor);
        const group = {cid: '@traffic', kind: 'traffic', name: 'All civilian traffic', value: 0, die: 0};
        const remaining = future.filter(e => !trafficIds.has(e.cid) && e.kind !== 'traffic');
        const queue = [...past, ...(trafficIds.has(future[0]?.cid) ? [group, ...remaining] : [...remaining, group])];
        up[`flags.${NS}.state`] = {...st, queue};
      }
      await c.update(up);
      if (trafficIds.size) await c.deleteEmbeddedDocuments('Combatant', [...trafficIds]);
    }
    for (const scene of game.scenes ?? []) for (const t of scene.tokens ?? []) if (t.getFlag?.(NS, 'stopped') && !t.getFlag(NS, 'policeStop')) await t.setFlag(NS, 'stopped', null);
    await game.settings.set(NS, 'chasePacingVersion', 2);
  }
  for (const c of game.combats ?? []) {
    const ch=c.getFlag(NS,'chase');if(ch?.action?.status==='running')await c.update({[`flags.${NS}.chase.action.status`]:'review'});
    if(String(ch?.autopilotError||'').includes('Finish this round before beginning another'))await c.update({[`flags.${NS}.chase.autopilotError`]:null});
  }
}

/* ------------------------------------------------------------------ requests */
registerHandler('chase.start', async ({sceneId, targetId = null, reason, userId}) => {
  const u = game.users.get(userId), scene = game.scenes.get(sceneId); if (!scene) return null;
  if (!u) throw new Error('Unknown user.');
  if (!u?.isGM) {
    const t = scene.tokens.get(targetId) ?? scene.tokens.find(t => wantedOf(t.actor) && t.actor.testUserPermission?.(u, 'OWNER'));
    if (setting('playMode', 'story') !== 'self' || !t || t.actor?.type !== 'character' || !wantedOf(t.actor) || !t.actor.testUserPermission?.(u, 'OWNER')) throw new Error('In Story mode the GM starts chases. Self-play players can start one for their own character.');
    targetId = t.id;
  }
  if (chaseOf(scene)) return null;
  return startChaseNow(scene, {targetId, reason: reason || 'Police chase'});
});
registerHandler('chase.auto', async ({combatId, auto, mode = null, userId}) => {
  const combat = game.combats.get(combatId); if (!combat?.getFlag(NS, 'chase')) return;
  if (!canManageChase(combat, game.users.get(userId) ?? null)) throw new Error('The GM controls chases in Story mode. In Self-play a participating player can toggle assistance.');
  const choice=['full','assisted','manual'].includes(mode)?mode:(auto?'assisted':'manual');
  await combat.update({[`flags.${NS}.chase.mode`]:choice,[`flags.${NS}.chase.auto`]:choice!=='manual',[`flags.${NS}.chase.autopilotError`]:null});
});
registerHandler('chase.npcTurn', async ({combatId, key, automatic = false, userId}) => {
  const combat = game.combats.get(combatId); if (!combat || actionKey(combat) !== key) return;
  if (!canManageChase(combat, game.users.get(userId) ?? null)) throw new Error('Not allowed to run this chase.');
  if (automatic && chaseMode(combat)==='manual') return;
  return beginAction(combat, automatic);
});
registerHandler('chase.end', async ({combatId, userId}) => {
  const c = game.combats.get(combatId), u = game.users.get(userId);
  if (!c?.getFlag(NS, 'chase')) return;
  // the GM, or (Self-play) a player whose character is in this chase — whoever may start and run it may also end it
  if (!canManageChase(c, u ?? null)) throw new Error('In Story mode the GM ends chases. In Self-play a player in the chase can end it.');
  return endChase(c, {why: u?.isGM ? 'The GM calls it.' : `${u?.name ?? 'A player'} calls it off.`});
});
/** A player's PIT manoeuvre landed: the other driver holds it or spins. */
registerHandler('chase.pit', async ({vehicleTokenUuid, targetTokenUuid, userId}) => {
  const vt = await fromUuid(vehicleTokenUuid), tt = await fromUuid(targetTokenUuid), u = game.users.get(userId);
  const driver = pilotOf(vt); if (!vt || !tt || !(u?.isGM || driver?.actor?.testUserPermission?.(u, 'OWNER'))) throw new Error('Not allowed.');
  await logIncident(tt, {kind: 'pit', label: `PIT manoeuvre by ${vt.name}`, against: vt.name});
  if (driver?.actor?.type === 'character') { const byPolice = tt.getFlag(NS, 'police'); await driver.actor.reportCrime(byPolice ? 'assaultCop' : 'dangerousDriving', {witnessed: true, byPolice: Boolean(byPolice)}).catch(() => null); }
  void promptCheck(tt, {kind: 'pitSave', difficulty: 'hard', band: 'red', other: vt, label: 'PIT manoeuvre: hold it straight', why: `${esc(vt.name)} clips the back wheel. Hold it (Wheels, Hard) or spin round and lose the next die.`});
});
registerHandler('chase.evasive', async ({vehicleTokenUuid, userId}) => {
  const vt = await fromUuid(vehicleTokenUuid), u = game.users.get(userId), driver = pilotOf(vt);
  if (!vt || !(u?.isGM || driver?.actor?.testUserPermission?.(u, 'OWNER') || vt.actor?.testUserPermission?.(u, 'OWNER'))) throw new Error('Not allowed.');
  await vt.update({[`flags.${NS}.dodging`]: true}, {acVehicleCarry: true});
  return card('EVASIVE', `${vt.name} weaves`, '<p>Swerving lane to lane: +2 Guard against rams, PITs and shots until the end of the round.</p>', 'chase');
});

/* ------------------------------------------------------------------ the player side */
/** PIT manoeuvre from the driver's seat: Wheels against the target's Guard, then they hold it or spin. */
export async function pit(driverToken, target = null) {
  const vt = vehicleOf(driverToken); if (!vt || driverToken.getFlag(NS, 'vehicleSeat')?.seatId !== 'pilot') throw new Error('You have to be driving.');
  const scene = vt.parent;
  if (!target) {
    const pool = scene.tokens.filter(t => t.id !== vt.id && isVehicle(t) && !vdata(t).destroyed && distanceSquares(vt, t) <= 4).sort((a, b) => distanceSquares(vt, a) - distanceSquares(vt, b));
    const targeted = [...(game.user.targets ?? [])].map(t => t.document).find(t => isVehicle(t));
    target = targeted ?? pool[0] ?? null;
  }
  if (!target) throw new Error('Nothing close enough to PIT: get alongside (within 4 squares) and target it (T).');
  if (distanceSquares(vt, target) > 4) throw new Error('Too far away for a PIT: get alongside.');
  const out = await driverToken.actor.rollStat('whl', {tn: guardOfVehicle(target), label: `PIT manoeuvre → ${target.name}`, context: {kind: 'pit', target: target.uuid}});
  if (!out?.result) return null;
  if (out.result.margin < 0) return card('PIT', `${vt.name} misses ${target.name}`, '<p>Goes for the back wheel and gets nothing.</p>', 'lose');
  return request('chase.pit', {vehicleTokenUuid: vt.uuid, targetTokenUuid: target.uuid});
}
export const evasive = driverToken => { const vt = vehicleOf(driverToken) ?? (isVehicle(driverToken) ? driverToken : null); if (!vt) throw new Error('Not in a vehicle.'); return request('chase.evasive', {vehicleTokenUuid: vt.uuid}); };

/* ------------------------------------------------------------------ install */
/** Street Life moves every car every second (route position, travel meter): those flag writes are not chase news. */
const QUIET_FLAGS = new Set(['traffic', 'travel', 'policeRoad', 'searchTurns', 'walk']);
export function chaseRelevantFlags(changes) {
  const keys = [...Object.keys(changes?.flags?.[NS] ?? {}), ...Object.keys(changes ?? {}).filter(k => k.startsWith(`flags.${NS}.`)).map(k => k.slice(`flags.${NS}.`.length).split('.')[0])];
  return keys.some(k => !QUIET_FLAGS.has(k.replace(/^-=/, '')));
}
export function installChase() {
  for (const h of ['updateCombat', 'updateCombatant', 'createCombatant']) Hooks.on(h, doc => { if (!isLeader()) return; const c = doc.parent?.documentName === 'Combat' ? doc.parent : doc; if (c?.getFlag?.(NS, 'chase')) schedule(c.id); });
  Hooks.on('smokeTransit', ({target, idMap}) => {
    if (!isLeader()) return;
    const moved = Object.values(idMap).map(id => target.tokens.get(id)).filter(t => t?.getFlag(NS, 'chaseTransfer'));
    if (!moved.length) return;
    void (async () => {
      const opts = moved[0].getFlag(NS, 'chaseTransfer');
      for (const t of moved) await t.setFlag(NS, 'chaseTransfer', null);
      const wanted = moved.find(t => wantedOf(t.actor)); if (!wanted) return;
      const {respond} = await import('./heat.mjs'); await respond(target, wanted);
      await startChaseNow(target, {targetId: wanted.id, auto: opts.auto, reason: 'Pursuit into another district'});
    })().catch(error => console.warn('The Smoke | chase across maps', error));
  });
  const wake = () => { if (isLeader()) for (const c of game.combats ?? []) if (c.getFlag(NS, 'chase')) schedule(c.id); };
  Hooks.on('updateChatMessage', wake); Hooks.on('deleteChatMessage', wake); Hooks.on('pauseGame', wake);
  Hooks.on('updateToken', (t, ch) => { if (chaseRelevantFlags(ch)) wake(); });
  Hooks.on('deleteCombat', combat => { scheduled.delete(combat.id); running.delete(combat.id); });
}

export const chaseAPI = {
  start: (scene = canvas?.scene, targetId = null) => request('chase.start', {sceneId: scene?.id, targetId, reason: 'Police chase'}),
  end: combat => request('chase.end', {combatId: combat.id}),
  auto: (combat, on) => request('chase.auto', {combatId: combat.id, auto: on}),
  mode: (combat, mode) => request('chase.auto', {combatId: combat.id, mode}),
  npcTurn: combat => request('chase.npcTurn', {combatId: combat.id, key: actionKey(combat)}),
  pit, evasive, chaseOf, trafficPhase, joinReinforcements, policeUnitInFight
};
