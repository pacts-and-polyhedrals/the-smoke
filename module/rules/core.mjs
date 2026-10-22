// Pure rules: the Covenant core with London names. No Foundry globals, so everything here is unit-tested.
import {STAT_MODIFIERS, DIE_LADDER, HEAT, CRIMES} from '../config.mjs';

export function statModifier(die) {
  const mod = STAT_MODIFIERS[Number(die)];
  if (mod == null) throw new Error(`Unsupported die: d${die}`);
  return mod;
}
export const isValidDie = die => DIE_LADDER.includes(Number(die));

/** Step a die up the ladder. Past d12 (below the Empire tier, stage 5) each extra step becomes +2 instead. `stage` is the Rep tier (1–5). */
export function stepDie(die, steps = 1, {stage = 1, allowLegendary = false} = {}) {
  let current = Number(die);
  if (!isValidDie(current)) throw new Error(`Unsupported die: d${die}`);
  let overflow = 0;
  for (let i = 0; i < Math.max(0, Number(steps)); i++) {
    const idx = DIE_LADDER.indexOf(current);
    if (current === 12 && stage < 5 && !allowLegendary) { overflow += 2; continue; }
    current = DIE_LADDER[Math.min(idx + 1, DIE_LADDER.length - 1)];
  }
  return {die: current, bonus: overflow};
}
/** Step a die down (a vehicle that is wrecked, a Condition). Below d4 a step is -1. */
export function stepDown(die, steps = 1) {
  let current = Number(die), penalty = 0;
  for (let i = 0; i < Math.max(0, Number(steps)); i++) {
    const idx = DIE_LADDER.indexOf(current);
    if (idx <= 0) { penalty -= 1; continue; }
    current = DIE_LADDER[idx - 1];
  }
  return {die: current, bonus: penalty};
}

export function validateStartingSpread(stats) {
  const dice = Object.values(stats).map(v => Number(v?.die ?? v));
  const counts = Object.fromEntries(DIE_LADDER.map(d => [d, dice.filter(x => x === d).length]));
  const valid = dice.length === 9 && counts[8] === 1 && counts[6] === 3 && counts[4] === 5;
  return {valid, counts, message: valid ? 'Valid starting spread' : 'A new character has exactly one d8, three d6 and five d4.'};
}

export function outcomeFromMargin(margin) {
  if (margin <= -4) return {key: 'severeFailure', label: 'Proper Mess', short: 'Severe Failure'};
  if (margin <= -1) return {key: 'costlyFailure', label: 'Bad Luck', short: 'Costly Failure'};
  if (margin === 0) return {key: 'narrowSuccess', label: 'Just About', short: 'Narrow Success'};
  if (margin <= 3) return {key: 'fullSuccess', label: 'Sorted', short: 'Full Success'};
  if (margin <= 7) return {key: 'strongSuccess', label: 'Smashed It', short: 'Strong Success'};
  return {key: 'exceptionalSuccess', label: 'Legendary', short: 'Exceptional Success'};
}
export const isSuccess = key => ['narrowSuccess', 'fullSuccess', 'strongSuccess', 'exceptionalSuccess'].includes(key);

/** Exploding dice: the Covenant miracle tiers, London edition. */
export function blinderTier(explosions) {
  const n = Math.max(0, Number(explosions) || 0);
  if (n >= 4) return {key: 'frontPage', label: 'Front Page', rank: 4};
  if (n === 3) return {key: 'absoluteScenes', label: 'Absolute Scenes', rank: 3};
  if (n === 2) return {key: 'blinder', label: 'A Blinder', rank: 2};
  if (n === 1) return {key: 'niceOne', label: 'Nice One', rank: 1};
  return {key: 'ordinary', label: '', rank: 0};
}

/** Guard against physical attacks: 3 (passive effort) + base + better of Moves/Grit modifier + armour. */
export function guardValue({base = 4, movDie = 4, grtDie = 4, armour = 0, passive = 3} = {}) {
  return Number(passive) + Number(base) + Math.max(statModifier(movDie), statModifier(grtDie)) + Number(armour || 0);
}

export function damageValue({margin = 0, impact = 0, armour = 0}) {
  return Math.max(0, Math.floor(Number(margin) + Number(impact) - Number(armour)));
}
export function damageSeverity(damage) {
  const d = Number(damage) || 0;
  if (d <= 0) return {key: 'none', label: 'No harm'};
  if (d <= 2) return {key: 'minor', label: 'Minor — bruised, shaken, knocked down'};
  if (d <= 4) return {key: 'moderate', label: 'Moderate — hurt, stunned, held'};
  if (d <= 6) return {key: 'severe', label: 'Severe — bleeding, broken, scared stiff'};
  return {key: 'critical', label: 'Critical — down and maybe out'};
}
export const SEVERITY_CONDITIONS = Object.freeze({
  none: [], minor: ['Bruised', 'Shaken', 'Prone'], moderate: ['Hurt', 'Stunned', 'Restrained'],
  severe: ['Bleeding', 'In Pain', 'Broken', 'Bricking It'], critical: ['Down', 'Broken', 'Bleeding']
});
const SEVERITY_ORDER = ['none', 'minor', 'moderate', 'severe', 'critical'];
export function damageConsequences(damage, {explosions = 0} = {}) {
  const severity = damageSeverity(damage);
  const conditions = [...SEVERITY_CONDITIONS[severity.key]];
  const rank = SEVERITY_ORDER.indexOf(severity.key);
  const next = Number(explosions) > 0 && rank > 0 ? SEVERITY_ORDER[Math.min(rank + 1, SEVERITY_ORDER.length - 1)] : null;
  return {...severity, conditions, breakthrough: next ? SEVERITY_CONDITIONS[next].filter(c => !conditions.includes(c)) : []};
}

/** Progress / consequence for a tracked challenge (a chase, a fire, a heist): the Covenant table. */
export function challengeContribution(outcomeKey, acceptCost = false) {
  switch (outcomeKey) {
    case 'exceptionalSuccess': return {progress: 3, consequences: 0};
    case 'strongSuccess': return {progress: 2, consequences: 0};
    case 'fullSuccess': return {progress: 1, consequences: 0};
    case 'narrowSuccess': return {progress: 1, consequences: 1};
    case 'costlyFailure': return acceptCost ? {progress: 1, consequences: 1} : {progress: 0, consequences: 1};
    case 'severeFailure': return {progress: 0, consequences: 2};
    default: return {progress: 0, consequences: 0};
  }
}
export function teamworkResult(totals = [], tn = null) {
  const rolls = totals.map(Number).filter(Number.isFinite);
  const count = rolls.length, sum = rolls.reduce((a, b) => a + b, 0);
  if (!count) return {count: 0, sum: 0, exact: 0, average: 0, tn, margin: null, outcome: null};
  const average = Math.floor(sum / count), target = tn == null || tn === '' ? null : Number(tn);
  const margin = target == null ? null : average - target;
  return {count, sum, exact: sum / count, average, tn: target, margin, outcome: margin == null ? null : outcomeFromMargin(margin)};
}

/* ------------------------------------------------------------------ Heat */
export const clampHeat = v => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
export function heatInfo(stars) { return HEAT[clampHeat(stars)]; }
/** Heat after a crime. Unseen crimes add nothing; a witnessed one adds its weight; cops seeing it add one more. */
export function heatAfterCrime(current, crimeKey, {witnessed = true, byPolice = false} = {}) {
  const crime = CRIMES[crimeKey], now = clampHeat(current);
  if (!crime || !witnessed) return now;
  // A crime raises Heat up to its own ceiling (a police witness adds one, still within it), never lowers it, and a
  // serious one sets a floor: a killing is four stars however clean you were.
  // (A police witness doesn't add to a killing: four stars is already armed response; five is a second killing or a cop.)
  const bonus = byPolice && Number(crime.min || 0) < 4 ? 1 : 0;
  const raised = Math.min(Math.max(now + Number(crime.heat || 1), Number(crime.min || 0)) + bonus, Number(crime.cap ?? 5));
  return clampHeat(Math.max(now, raised));
}
/** Police response for a Heat level: how many units, which, and what they bring. */
export function policeResponse(stars) {
  const s = clampHeat(stars);
  return {
    stars: s,
    // 0.5.22: a response you can play against (it used to be up to 11 units, plus their crews, at five stars).
    cars: [0, 1, 2, 2, 2, 3][s],
    bikes: [0, 0, 0, 0, 0, 0][s],
    vans: [0, 0, 0, 0, 0, 1][s],
    arv: [0, 0, 0, 0, 1, 2][s],
    helicopter: s >= 3,
    roadblocks: s >= 5,
    armed: s >= 4
  };
}
/** Seconds out of sight of any police unit before one star drops. Higher Heat cools more slowly. */
export const coolDownSeconds = stars => [0, 45, 60, 90, 120, 150][clampHeat(stars)];

/* ------------------------------------------------------------------ money */
/** What the fence at The Arches / a chop shop pays for a nicked vehicle: a share of value, cut by damage. */
export function fencePrice({value = 0, body = 1, bodyMax = 1, share = 0.35, hot = false}) {
  const condition = Math.max(0, Math.min(1, Number(bodyMax) > 0 ? Number(body) / Number(bodyMax) : 1));
  const raw = Number(value) * share * (0.4 + 0.6 * condition) * (hot ? 0.8 : 1);
  return Math.max(0, Math.round(raw / 5) * 5);
}
/** Wasted: the hospital takes its share (prescriptions, a cab home, your phone went missing). */
export const wastedCost = cash => Math.min(Math.max(0, Number(cash) || 0), Math.max(50, Math.round((Number(cash) || 0) * 0.1)));
/** Busted: a fine, legal fees, and the police keep anything they can call evidence. */
export const bustedCost = cash => Math.min(Math.max(0, Number(cash) || 0), Math.max(100, Math.round((Number(cash) || 0) * 0.2)));
