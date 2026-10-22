// Driving rules for chases and incidents, free of Foundry so they can be tested.
//
// The movement gauge: in a turn-based chase each action lets a driver move their vehicle along three bands measured
// from its Speed (squares). GREEN (up to Speed) is safe with full manoeuvrability. YELLOW (up to 1½ × Speed) is
// pushing it: Handling −1 for the rest of the action and a Wheels check (Medium). RED (up to 2 × Speed) is the limit
// of driver and motor: Handling −2 and a Wheels check (Hard). Past red is not possible. A failed check is an incident.
//
// Incidents: a player's vehicle that passes over another vehicle has to make an evasive manoeuvre (Wheels). Fail it
// and it's a collision: both vehicles take damage, riders get shaken about, and it's logged on the vehicle. A vehicle
// at 0 Body catches fire; everyone has until the end of the next round (or a few seconds outside a chase) to get out
// before it goes up.

/* ------------------------------------------------------------------ the gauge */
export const BANDS = Object.freeze(['green', 'yellow', 'red']);
export const BAND_INFO = Object.freeze({
  green: {label: 'Green', short: 'Safe', penalty: 0, check: null, hint: 'Safe: full manoeuvrability.'},
  yellow: {label: 'Yellow', short: 'Pushing it', penalty: -1, check: 'medium', hint: 'Pushing it: Handling −1 for the rest of the action, and a Wheels check (Medium).'},
  red: {label: 'Red', short: 'Redlining', penalty: -2, check: 'hard', hint: 'At the limit of driver and motor: Handling −2, and a Wheels check (Hard).'},
  over: {label: 'Over the limit', short: 'Too far', penalty: -2, check: null, hint: 'Further than this motor can go in one action.'}
});
/** A little slack so a drag that lands a hair over a line doesn't count. */
export const BAND_SLACK = 0.25;

/** How far a vehicle can go in one action, in squares: the edges of green, yellow and red. */
export function driveBands(v = {}) {
  if (v.destroyed) return {green: 0, yellow: 0, red: 0, speed: 0};
  let speed = Math.max(1, Number(v.speed) || 6);
  speed = Math.max(2, speed - 2 * Math.max(0, Number(v.flats) || 0));                 // each flat tyre costs 2 squares
  const body = Number(v.body?.value ?? 1), max = Number(v.body?.max ?? 1);
  if (max > 0 && body < max / 2) speed = Math.max(2, Math.round(speed * 0.85));        // smoking and rattling
  const wrecked = body <= 0;
  const green = Math.round(speed), yellow = Math.round(speed * 1.5), red = wrecked ? yellow : Math.round(speed * 2);
  return {green, yellow, red, speed: green, wrecked};
}
/** Which band a distance moved this action falls in. */
export function bandFor(moved, bands) {
  const m = Math.max(0, Number(moved) || 0);
  if (m <= bands.green + BAND_SLACK) return 'green';
  if (m <= bands.yellow + BAND_SLACK) return 'yellow';
  if (m <= bands.red + BAND_SLACK) return 'red';
  return 'over';
}
export const bandRank = band => ({green: 0, yellow: 1, red: 2, over: 3})[band] ?? 0;
export const bandPenalty = band => BAND_INFO[band]?.penalty ?? 0;
export const bandCheck = band => BAND_INFO[band]?.check ?? null;
/** What's left of each band after moving `moved` squares this action. */
export function bandsLeft(moved, bands) {
  const m = Math.max(0, Number(moved) || 0);
  return {green: Math.max(0, bands.green - m), yellow: Math.max(0, bands.yellow - m), red: Math.max(0, bands.red - m)};
}

/* ------------------------------------------------------------------ chase dice */
const PERF_DICE = {4: 1, 6: 2, 8: 2, 10: 3, 12: 3, 20: 4};
/** Speed dice a vehicle rolls in a chase (police units, traffic): from its Performance die. */
export function vehicleSpeedDice(v = {}) {
  if (v.destroyed) return 0;
  const body = Number(v.body?.value ?? 1);
  let n = PERF_DICE[Number(v.perfDie)] ?? 2;
  if (Number(v.flats || 0) >= 2) n -= 1;
  if (body <= 0) n -= 1;
  return Math.max(1, Math.min(4, n));
}
/** The NPC driver's Wheels die when nobody at the table is driving: the vehicle's crew die (police are trained). */
export function crewDie(v = {}, {police = false} = {}) {
  const d = Number(v.crewDie);
  return [4, 6, 8, 10, 12, 20].includes(d) ? d : police ? 8 : 6;      // 0 or unset: automatic
}

/* ------------------------------------------------------------------ incidents */
/** Losing it after a failed yellow or red check. Returns what happens to the vehicle and the people in it. */
export function lossOfControl({band = 'yellow', outcomeKey = 'costlyFailure', size = 2} = {}) {
  const severe = outcomeKey === 'severeFailure', red = band === 'red';
  if (!['costlyFailure', 'severeFailure'].includes(outcomeKey)) return {incident: false};
  const body = (red ? 3 : 2) + (severe ? 2 + (red ? 2 : 0) : 0) + (Number(size) >= 3 ? 1 : 0);
  return {incident: true, kind: severe ? (red ? 'crash' : 'spin') : 'skid', body, riders: severe && red ? 2 : 0,
    conditions: severe ? ['Shaken'] : [], stop: true,
    label: severe ? (red ? 'Crashed out: off the road and into something hard' : 'Spun out') : 'Skidded and lost the line'};
}
/** A collision after a failed (or barely made) evasive manoeuvre. */
export function collisionResult({outcomeKey = 'costlyFailure', band = 'green', mySize = 2, theirSize = 2} = {}) {
  const pace = {green: 0, yellow: 1, red: 2}[band] ?? 0;
  if (['fullSuccess', 'strongSuccess', 'exceptionalSuccess'].includes(outcomeKey)) return {hit: false, label: 'Swerved clear', mine: 0, theirs: 0, riders: 0, conditions: []};
  if (outcomeKey === 'narrowSuccess') return {hit: true, scrape: true, label: 'Scraped past', mine: 1, theirs: 1, riders: 0, conditions: []};
  const severe = outcomeKey === 'severeFailure';
  const impact = (severe ? 4 : 2) + pace * 2;
  return {hit: true, label: severe ? 'Smashed into it' : 'Hit it', mine: impact + Number(theirSize || 0) * (severe ? 2 : 1), theirs: impact + Number(mySize || 0) * (severe ? 2 : 1),
    riders: severe ? 2 : pace >= 2 ? 1 : 0, conditions: severe ? ['Shaken'] : pace ? ['Bruised'] : [], stop: severe};
}
/** The evasive manoeuvre's difficulty: how fast you were going when it came up. */
export const evadeBand = band => band === 'red' ? 'hard' : band === 'yellow' ? 'medium' : 'easy';

/**
 * A vehicle's body for collisions: the line down its middle, nose to tail (rotation 0 faces south), and its half-width.
 * `w`/`h` are the token's footprint in px.
 */
export function vehicleBody({id = null, x, y, w = 200, h = 300, rotation = 0, ...rest} = {}) {
  const long = Math.max(w, h), half = Math.min(w, h) / 2, reach = Math.max(0, long / 2 - half);
  const a = (Number(rotation) || 0) * Math.PI / 180, hx = -Math.sin(a), hy = Math.cos(a);
  return {...rest, id, x, y, half, x1: x - hx * reach, y1: y - hy * reach, x2: x + hx * reach, y2: y + hy * reach};
}
const segPoint = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
};
/** How close two vehicles' middles must come for one to be driving over the other: their bodies half overlapping. */
export const overReach = (meHalf, o) => (Number(meHalf) + Number(o.half ?? o.r ?? 0)) / 2;
/**
 * Which vehicles a move passes over. `from`/`to` are the mover's centres (px), `meHalf` its half-width (px); `others`
 * are vehicleBody()s (or plain {id, x, y, r} circles). A vehicle you were already on top of at the start is left out.
 * Each hit has `t0`: how far along the move (0–1) you first reach it. Nearest first.
 */
export function sweptHits(from, to, meHalf, others = []) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]), out = [];
  if (len < 1) return out;
  for (const o of others) {
    const reach = overReach(meHalf, o), a = [o.x1 ?? o.x, o.y1 ?? o.y], b = [o.x2 ?? o.x, o.y2 ?? o.y];
    if (segPoint(from, a, b) < reach) continue;
    const steps = Math.max(8, Math.ceil(len / Math.max(8, reach / 3)));
    let t0 = null, best = Infinity;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, d = segPoint([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], a, b);
      if (d < reach && t0 == null) t0 = Math.max(0, (i - 1) / steps);
      best = Math.min(best, d);
    }
    if (t0 != null) out.push({...o, t0, t: t0, d: best});
  }
  return out.sort((p, q) => p.t0 - q.t0);
}

/* ------------------------------------------------------------------ fire */
/** Seconds a burning vehicle lasts outside a chase; in a chase it goes up at the end of the next round. */
export const FIRE_SECONDS = 15;
/** Damage from an exploding vehicle by distance in squares: riders still inside, people nearby, vehicles nearby. */
export function explosionDamage(distance, {inside = false, vehicle = false} = {}) {
  if (inside) return {damage: 10, conditions: ['Burning']};
  const d = Number(distance);
  if (vehicle) return {damage: d <= 2 ? 5 : d <= 4 ? 2 : 0, conditions: []};
  if (d <= 2) return {damage: 5, conditions: ['Burning', 'Prone']};
  if (d <= 4) return {damage: 2, conditions: ['Prone']};
  return {damage: 0, conditions: []};
}

/* ------------------------------------------------------------------ AI on its turn */
/**
 * What a police unit does with one action in a chase: get the officers out to a suspect on foot, ram or PIT a
 * vehicle alongside, else drive toward them along the roads — pushing into yellow when they're getting away and into
 * red at three stars or more. `distance` is squares to the target; `bands` the unit's gauge.
 */
export function policeAction({distance = 20, heat = 2, targetOnFoot = false, bands = {green: 10, yellow: 15, red: 20}, armed = false} = {}) {
  if (targetOnFoot && distance <= 4) return {act: 'officersOut', why: 'Officers out: on foot after them.'};
  if (!targetOnFoot && distance <= 3.5) return heat >= 3 ? {act: 'ram', why: 'Ram them off the road.'} : {act: 'pit', why: 'Tactical contact: PIT manoeuvre.'};
  if (armed && heat >= 4 && distance <= 10) return {act: 'shoot', why: 'Armed response: shots fired from the car.'};
  const want = Math.max(0, distance - 2.5);
  const band = want > bands.yellow && heat >= 3 ? 'red' : want > bands.green ? 'yellow' : 'green';
  return {act: 'drive', band, squares: Math.min(want, bands[band]), why: band === 'green' ? 'Closing in.' : band === 'yellow' ? 'Pushing it to keep up.' : 'Flat out after them.'};
}
/** Ordinary traffic in a chase just carries on, at a safe pace. */
export function trafficAction({bands = {green: 9}} = {}) { return {act: 'drive', band: 'green', squares: bands.green, why: 'Carries on its way.'}; }

/* ------------------------------------------------------------------ who's in a chase, and where police aim */
/** Squares around the wanted that pull police units and passing traffic into a chase. */
export const CHASE_REACH = Object.freeze({units: 40, officers: 30, traffic: 20, maxTraffic: 4});
/** The moving traffic that joins a chase: the nearest few within reach of any wanted vehicle. Points in squares. */
export function pickChaseTraffic(traffic = [], wanted = [], {radius = CHASE_REACH.traffic, max = CHASE_REACH.maxTraffic} = {}) {
  const near = t => Math.min(...wanted.map(w => Math.hypot(t.x - w.x, t.y - w.y)));
  return traffic.map(t => ({...t, d: wanted.length ? near(t) : Infinity})).filter(t => t.d <= radius).sort((a, b) => a.d - b.d).slice(0, max);
}
/**
 * Where a police unit should head to cut a vehicle off rather than sit on its bumper: ahead of it along the way it
 * faces, by up to `lead` squares (less when they are already close). Points in squares; rotation 0 faces south.
 */
export function interceptPoint(target, distance, lead) {
  const a = (Number(target.rotation) || 0) * Math.PI / 180, ahead = Math.max(0, Math.min(Number(lead) || 0, Number(distance) * 0.4));
  return {x: target.x - Math.sin(a) * ahead, y: target.y + Math.cos(a) * ahead, ahead};
}

/* ------------------------------------------------------------------ the end of a chase */
/** Out of every unit's sight (squares) at the end of a round: lost them. */
export const ESCAPE_SQUARES = 30;
export function chaseOver({wanted = [], units = []} = {}) {
  if (!wanted.length) return {over: true, why: 'Nobody left to chase.'};
  if (!units.length) return {over: true, why: 'No units left in it.'};
  const lost = wanted.every(w => units.every(u => Math.hypot(u.x - w.x, u.y - w.y) > ESCAPE_SQUARES));
  return lost ? {over: true, escaped: true, why: 'Lost them.'} : {over: false};
}
