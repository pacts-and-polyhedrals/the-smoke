// Pure job / open-world maths: callout placement, deadlines, pay, chases, patients, plates, map hops.
// No Foundry globals here — the runtime (world/jobs.mjs) calls these and they are unit-tested.
import {outcomeFromMargin, isSuccess, challengeContribution} from './core.mjs';

/* ------------------------------------------------------------------ random */
export function rng(seed = Date.now()) {
  let s = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const pick = (list, r = Math.random) => list[Math.floor(r() * list.length)];

/* ------------------------------------------------------------------ number plates (UK, current format) */
const PLATE_LETTERS = 'ABCDEFGHJKLMNOPRSTUVWXY';   // no I, Q or Z
const LONDON_AREA = 'ABCDEFGHJKLMNOPRSTUVWXY';     // L-memory tags (LA..LY)
export function ukPlate(r = Math.random) {
  const year = pick(['08', '58', '10', '60', '12', '62', '14', '64', '15', '65', '16', '66', '17', '67', '18', '68', '19', '69', '20', '70', '21', '71', '22', '72', '23', '73', '24', '74', '25', '75'], r);
  const area = 'L' + pick(LONDON_AREA.split(''), r);
  return `${area}${year} ${pick(PLATE_LETTERS.split(''), r)}${pick(PLATE_LETTERS.split(''), r)}${pick(PLATE_LETTERS.split(''), r)}`;
}
export const isUkPlate = p => /^[A-Z]{2}\d{2} [A-Z]{3}$/.test(String(p || ''));

/* ------------------------------------------------------------------ zones */
export const zoneCentre = z => [z.rect[0] + z.rect[2] / 2, z.rect[1] + z.rect[3] / 2];
export const inRect = (r, x, y) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
export function zoneAtPoint(zones, x, y) { return (zones || []).find(z => Array.isArray(z.rect) && inRect(z.rect, x, y)) || null; }
/** Zones a vehicle may be spawned on (roads and junctions, never towpaths). */
export const drivable = zones => (zones || []).filter(z => z.kind === 'road' || z.kind === 'junction');
/** Pavement-side blocks: land or park zones that touch a road. Peds and fares stand here. */
export function kerbside(zones) {
  const roads = new Set(drivable(zones).map(z => z.id));
  return (zones || []).filter(z => (z.kind === 'land' || z.kind === 'park') && (z.adjacent || []).some(a => roads.has(a)));
}
/** A point inside a zone, kept away from its edges (grid px). */
export function pointIn(zone, r = Math.random, margin = 60) {
  const [x, y, w, h] = zone.rect;
  return [Math.round(x + margin + r() * Math.max(1, w - 2 * margin)), Math.round(y + margin + r() * Math.max(1, h - 2 * margin))];
}
/** Where a fare / patient stands: on the edge of a kerbside block nearest a road it touches, so a car can pull up. */
export function kerbPoint(zone, zones, r = Math.random) {
  const road = drivable(zones).find(z => (zone.adjacent || []).includes(z.id));
  const [x, y, w, h] = zone.rect;
  if (!road) return pointIn(zone, r);
  const [rx, ry, rw, rh] = road.rect;
  const along = () => r();
  if (ry >= y + h - 1) return [Math.round(x + 80 + along() * Math.max(1, w - 160)), Math.round(y + h - 70)];
  if (ry + rh <= y + 1) return [Math.round(x + 80 + along() * Math.max(1, w - 160)), Math.round(y + 70)];
  if (rx >= x + w - 1) return [Math.round(x + w - 70), Math.round(y + 80 + along() * Math.max(1, h - 160))];
  return [Math.round(x + 70), Math.round(y + 80 + along() * Math.max(1, h - 160))];
}

/* ------------------------------------------------------------------ the atlas as a graph */
export function mapGraph(atlas) {
  const g = new Map();
  for (const m of atlas?.maps || []) g.set(m.id, new Set((m.links || []).filter(l => l.kind === 'edge' && l.to).map(l => l.to)));
  return g;
}
export function hopDistances(graph, from) {
  const dist = new Map([[from, 0]]), queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of graph.get(cur) || []) if (!dist.has(n)) { dist.set(n, dist.get(cur) + 1); queue.push(n); }
  }
  return dist;
}
/** A destination for a fare / delivery: a named block on a street map within [minHops, maxHops]. */
export function pickDestination(atlas, fromMapId, {minHops = 0, maxHops = 2, r = Math.random, service = null, exclude = []} = {}) {
  const dist = hopDistances(mapGraph(atlas), fromMapId);
  const pool = [];
  for (const m of atlas?.maps || []) {
    const d = dist.get(m.id);
    if (d == null || d < minHops || d > maxHops) continue;
    const blocks = kerbside(m.zones).filter(z => (service ? z.service === service : z.landmark) && !exclude.includes(`${m.id}:${z.id}`));
    for (const z of blocks) pool.push({mapId: m.id, mapName: m.name, zoneId: z.id, label: z.name, hops: d});
  }
  if (!pool.length) return null;
  return pick(pool, r);
}
/** Nearest map (by hops) that has a block offering `service` (hospital, police …). */
export function nearestService(atlas, fromMapId, service) {
  const dist = hopDistances(mapGraph(atlas), fromMapId);
  let best = null;
  for (const m of atlas?.maps || []) for (const z of m.zones || []) {
    if (z.service !== service) continue;
    const d = dist.get(m.id); if (d == null) continue;
    if (!best || d < best.hops) best = {mapId: m.id, mapName: m.name, zoneId: z.id, label: z.name, hops: d};
  }
  return best;
}
/** True when a token rect (px) is on, or on a road touching, the destination block. */
export function arrivedAt(zones, destZoneId, tokenRect) {
  const dest = (zones || []).find(z => z.id === destZoneId); if (!dest) return false;
  const cx = tokenRect[0] + tokenRect[2] / 2, cy = tokenRect[1] + tokenRect[3] / 2;
  const here = zoneAtPoint(zones, cx, cy); if (!here) return false;
  return here.id === dest.id || (dest.adjacent || []).includes(here.id);
}

/* ------------------------------------------------------------------ deadlines (seconds of real time) */
export function deadlineSeconds(type, stage, hops = 0) {
  const h = Math.max(0, Number(hops) || 0);
  switch (`${type}:${stage}`) {
    case 'taxi:pickup': return 150;
    case 'taxi:dropoff': return 120 + 90 * h;
    case 'courier:pickup': return 150;
    case 'courier:dropoff': return 100 + 80 * h;
    case 'ambulance:pickup': return 180;
    case 'ambulance:hospital': return 150 + 90 * h;
    case 'fire:respond': return 150 + 60 * h;
    case 'police:respond': return 150 + 60 * h;
    case 'police:anpr': return 300;
    case 'police:custody': return 240 + 90 * h;
    case 'bus:stop': return 120 + 60 * h;
    case 'crew:order': return 1800;
    default: return 180;
  }
}
export const timeFraction = (msLeft, msTotal) => Math.max(0, Math.min(1, Number(msTotal) > 0 ? Number(msLeft) / Number(msTotal) : 0));

/* ------------------------------------------------------------------ pay */
export function taxiPay({hops = 0, timeLeft = 0.5, rideOutcome = 'fullSuccess', vehicleKind = 'cab'}) {
  const fare = Math.round(12 + 9 * Math.max(0, hops) + (vehicleKind === 'cab' ? 4 : 0));
  const speed = Math.max(0, Math.min(1, timeLeft));
  const tipRate = {severeFailure: 0, costlyFailure: 0, narrowSuccess: .05, fullSuccess: .12, strongSuccess: .2, exceptionalSuccess: .35}[rideOutcome] ?? .1;
  const tip = Math.round(fare * (tipRate + speed * .25));
  return {fare, tip, total: fare + tip};
}
export function courierPay({hops = 0, timeLeft = 0.5, damaged = false}) {
  const base = 8 + 7 * Math.max(0, hops);
  return Math.max(0, Math.round(base * (0.6 + 0.6 * timeLeft) * (damaged ? 0.5 : 1)));
}
export function ambulancePay({state = 'Stable', hops = 0}) {
  const base = 40 + 15 * hops;
  return {Stable: base * 2, Fading: Math.round(base * 1.5), Faltering: base, Passing: Math.round(base * .5), Lost: 0}[state] ?? base;
}
export function firePay({progress = 0, consequences = 0, saved = true}) {
  return saved ? Math.max(25, 60 + 20 * progress - 15 * consequences) : 10;
}
export function policePay({kind = 'anpr', clean = true}) {
  return {anpr: 75, pursuit: 90, disturbance: 50}[kind] * (clean ? 1 : .6);
}
export const busStopPay = (timeLeft = .5) => Math.round(6 + 6 * Math.max(0, Math.min(1, timeLeft)));

/* ------------------------------------------------------------------ patients */
export const PATIENT_STATES = Object.freeze(['Stable', 'Fading', 'Faltering', 'Passing', 'Lost']);
/** Treatment roll result moves the patient along the Covenant mortal-wound ladder. */
export function patientAfterTreatment(state, outcomeKey) {
  let i = Math.max(0, PATIENT_STATES.indexOf(state));
  if (i === 4) return 'Lost';
  if (outcomeKey === 'exceptionalSuccess' || outcomeKey === 'strongSuccess') i = Math.max(0, i - 2);
  else if (outcomeKey === 'fullSuccess') i = Math.max(0, i - 1);
  else if (outcomeKey === 'costlyFailure') i = Math.min(4, i + 1);
  else if (outcomeKey === 'severeFailure') i = Math.min(4, i + 2);
  return PATIENT_STATES[i];
}
/** Untreated patients get worse every interval unless Stable. */
export function patientWorsens(state) {
  const i = PATIENT_STATES.indexOf(state);
  if (i <= 0) return state; return PATIENT_STATES[Math.min(4, i + 1)];
}

/* ------------------------------------------------------------------ chases */
export const CHASE = Object.freeze({start: 2, caught: 0, escaped: 5});
/** One chase round for the pursuer: success closes the gap, failure opens it, a Proper Mess is a crash. */
export function chaseStep(gap, outcomeKey) {
  const c = challengeContribution(outcomeKey);
  const delta = -c.progress + (isSuccess(outcomeKey) ? 0 : 1) + (outcomeKey === 'severeFailure' ? 1 : 0);
  const next = Math.max(CHASE.caught, Math.min(CHASE.escaped, Number(gap) + delta));
  return {gap: next, crash: outcomeKey === 'severeFailure', caught: next <= CHASE.caught, escaped: next >= CHASE.escaped};
}
/** The fleeing side's TN for the chase, from the getaway driver's Wheels die and the vehicle. */
export function getawayTN({driverDie = 6, perfDie = 6, handling = 0}) {
  return Math.round(4 + (Number(driverDie) + Number(perfDie)) / 2 + Number(handling));
}

/* ------------------------------------------------------------------ fires */
export const FIRE = Object.freeze({progressNeeded: 4, lostAt: 3});
export function fireStep(state, outcomeKey) {
  const c = challengeContribution(outcomeKey);
  const progress = Number(state.progress || 0) + c.progress, consequences = Number(state.consequences || 0) + c.consequences;
  return {progress, consequences, out: progress >= FIRE.progressNeeded, lost: consequences >= FIRE.lostAt};
}

/* ------------------------------------------------------------------ nicking things */
/** Steps the lock band gets easier with the right tool. */
export const TOOL_STEPS = Object.freeze({none: 0, 'bolt cutters': 1, 'angle grinder': 2, 'relay box': 2, 'slim jim': 1, screwdriver: 0});
const BANDS = ['easy', 'medium', 'hard', 'miracle'];
export function lockBandWithTool(band, tool = 'none') {
  const i = Math.max(0, BANDS.indexOf(band));
  return BANDS[Math.max(0, i - (TOOL_STEPS[String(tool).toLowerCase()] ?? 0))];
}
/** What happens when you go at a lock. Loud tools always risk being seen. */
export function theftResult(outcomeKey, {loudTool = false} = {}) {
  switch (outcomeKey) {
    case 'exceptionalSuccess': case 'strongSuccess': return {unlocked: true, witnessed: false, note: 'In and gone before anyone looks up.'};
    case 'fullSuccess': return {unlocked: true, witnessed: loudTool, note: loudTool ? 'Off it comes — but the grinder shrieks and heads turn.' : 'Clean job.'};
    case 'narrowSuccess': return {unlocked: true, witnessed: true, note: 'It comes free, but someone across the road is filming on their phone.'};
    case 'costlyFailure': return {unlocked: false, witnessed: loudTool, note: 'The lock holds. You can have another go — it costs time.'};
    default: return {unlocked: false, witnessed: true, jammed: true, note: 'Alarm. Shouting. The lock is jammed for good. Leg it.'};
  }
}

export {outcomeFromMargin, isSuccess};
