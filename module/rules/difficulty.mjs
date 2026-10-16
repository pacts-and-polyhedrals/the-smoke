/**
 * Difficulty and Target Numbers.
 *
 * A fixed TN means completely different things at Stage 1 and Stage 5, so the
 * published §4.5 ladder — calibrated across the whole progression — tells a Guide
 * setting "Standard" at Stage 1 that they have set a 21–47% proposition for a
 * typical Attribute. TN 12, the system's most-used number (Prayer, Mortal Wound,
 * Stabilize), is a 26% roll on a d4 Attribute, and five of a Stage 1 character's
 * nine Attributes are d4.
 *
 * This module defines difficulty by the success rate the Guide actually wants and
 * solves for the TN that delivers it against the dice a character really has. The
 * result scales automatically: "Medium" stays medium as Attributes climb.
 *
 * The maths is exact, not simulated. An exploding die's distribution is computed by
 * recursion and convolved with the other die, so the reported percentage is the true
 * probability rather than a sample.
 */

import {STAT_MODIFIERS as ATTRIBUTE_MODIFIERS, DIE_LADDER} from "../config.mjs";

/** Recursion depth for explosion chains. Each level is 1/faces as likely; 24 is far past relevance. */
const EXPLOSION_DEPTH = 24;

/**
 * Difficulty bands, defined by the chance a character using a relevant Attribute
 * succeeds (margin >= 0, so a Narrow Success counts).
 */
export const DIFFICULTY_BANDS = Object.freeze([
  {key: "easy",    label: "Easy",    target: 0.85,
   hint: "Succeeds unless something goes wrong. Roll only when failure would be interesting."},
  {key: "medium",  label: "Medium",  target: 0.60,
   hint: "Favoured but uncertain. The standard roll for a character acting within their competence."},
  {key: "hard",    label: "Hard",    target: 0.35,
   hint: "Needs luck, a Perk, help or Hustle. Failure should already have a consequence in mind."},
  {key: "miracle", label: "Long Shot", target: 0.12,
   hint: "A long shot. Expect Hustle, a crew assist, the right tool or being On a Roll to carry it."}
]);

export const DIFFICULTY_KEYS = Object.freeze(DIFFICULTY_BANDS.map(b => b.key));

export function difficultyBand(key) {
  return DIFFICULTY_BANDS.find(b => b.key === String(key).toLowerCase()) ?? null;
}

const pmfCache = new Map();

/** Exact probability mass function of one exploding die, as a Map of total → probability. */
export function explodingDie(faces, topTwo=false) {
  const f=Number(faces);if(!DIE_LADDER.includes(f))throw new Error(`Unsupported die: d${faces}`);
  const key=`${f}:${topTwo}`;if(pmfCache.has(key))return pmfCache.get(key);
  const pmf=new Map();let active=new Map([[0,1]]);
  for(let depth=0;depth<=EXPLOSION_DEPTH;depth++){
    const next=new Map();
    for(const [total,prob] of active)for(let face=1;face<=f;face++){
      const sum=total+face,part=prob/f;
      const store=face>=(topTwo?f-1:f)&&depth<EXPLOSION_DEPTH?next:pmf;
      store.set(sum,(store.get(sum)||0)+part);
    }active=next;
  }pmfCache.set(key,pmf);return pmf;
}

/** Non-exploding die, for Cursed rolls. */
function flatDie(faces) {
  const pmf = new Map();
  for (let i = 1; i <= Number(faces); i++) pmf.set(i, 1 / Number(faces));
  return pmf;
}

/**
 * Distribution of a full Covenant Roll: Effort Die + Attribute Die + Attribute Modifier.
 * `state` accepts "normal" or "cursed"; Blessed is deliberately excluded, because a Guide
 * should not set difficulty on the assumption that a character will be Blessed.
 */
export function rollDistribution({
  attributeDie = 4, effortDie = 6, modifier = 0, state = "normal", noEffortExplosion=false
} = {}) {
  const attr = Number(attributeDie), eff = Number(effortDie);
  const noExplode=["cursed","offGame"].includes(state),boost=["blessed","onARoll"].includes(state);
  const a = noExplode ? flatDie(attr) : explodingDie(attr,boost);
  const e = noExplode||noEffortExplosion ? flatDie(eff) : explodingDie(eff,boost);
  const flat = (ATTRIBUTE_MODIFIERS[attr] ?? 0) + Number(modifier || 0);
  const out = new Map();
  for (const [k1, p1] of e) {
    for (const [k2, p2] of a) {
      const total = k1 + k2 + flat;
      out.set(total, (out.get(total) ?? 0) + p1 * p2);
    }
  }
  return out;
}

/** Probability that a roll meets or beats `tn` (margin >= 0). */
export function successChance(options, tn) {
  const target = Number(tn);
  let p = 0;
  for (const [total, prob] of rollDistribution(options)) if (total >= target) p += prob;
  return p;
}

/** Mean of a distribution. */
export function expectedTotal(options) {
  let m = 0;
  for (const [total, prob] of rollDistribution(options)) m += total * prob;
  return m;
}

/** Smallest TN whose success chance is closest to `target`, searched over a generous range. */
function solveTN(options, target) {
  const dist=rollDistribution(options);
  let bestTN = 2, bestDelta = Infinity;
  for (let tn = 2; tn <= 80; tn++) {
    const delta = Math.abs(chanceFrom(dist, tn) - target);
    if (delta < bestDelta - 1e-12) { bestDelta = delta; bestTN = tn; }
  }
  return bestTN;
}

/**
 * The TN that puts `band` at its intended success rate for these dice.
 * Returns the TN plus the true probability, so the UI can show the Guide what it just set.
 */
export function suggestTN(options = {}, band = "medium") {
  const b = difficultyBand(band);
  if (!b) throw new Error(`Unknown difficulty band: ${band}`);
  const tn = solveTN(options, b.target);
  return {tn, band: b.key, label: b.label, chance: successChance(options, tn), target: b.target};
}

/** Every band at once, for a row of buttons. */
export function difficultyLadder(options = {}) {
  return DIFFICULTY_BANDS.map(b => suggestTN(options, b.key));
}

/* ------------------------------------------------------------------ party ---- */

/** The Attribute die an Actor brings to `attribute`, defaulting sanely for odd data. */
export function actorAttributeDie(actor, attribute) {
  const key = String(attribute).toLowerCase();
  const die = Number(actor?.system?.stats?.[key]?.die ?? actor?.system?.attributes?.[key]?.die);
  return DIE_LADDER.includes(die) ? die : 4;
}

/**
 * Pooled distribution across several Actors: the chance a randomly chosen member of
 * this group succeeds. Averaging the distributions rather than the dice keeps the
 * result honest when a party is uneven.
 */
export function partyDistribution(actors = [], attribute, {effortDie = 6, modifier = 0} = {}) {
  const list = (actors ?? []).filter(Boolean);
  if (!list.length) return rollDistribution({attributeDie: 4, effortDie, modifier});
  const pooled = new Map();
  const weight = 1 / list.length;
  for (const actor of list) {
    const dist = rollDistribution({
      attributeDie: actorAttributeDie(actor, attribute), effortDie, modifier
    });
    for (const [total, prob] of dist) pooled.set(total, (pooled.get(total) ?? 0) + prob * weight);
  }
  return pooled;
}

function chanceFrom(dist, tn) {
  let p = 0;
  for (const [total, prob] of dist) if (total >= tn) p += prob;
  return p;
}

/** The TN that puts `band` at its intended rate for this party and Attribute. */
export function suggestPartyTN(actors, attribute, band = "medium", opts = {}) {
  const b = difficultyBand(band);
  if (!b) throw new Error(`Unknown difficulty band: ${band}`);
  const dist = partyDistribution(actors, attribute, opts);
  let bestTN = 2, bestDelta = Infinity;
  for (let tn = 2; tn <= 80; tn++) {
    const delta = Math.abs(chanceFrom(dist, tn) - b.target);
    if (delta < bestDelta - 1e-12) { bestDelta = delta; bestTN = tn; }
  }
  return {tn: bestTN, band: b.key, label: b.label, chance: chanceFrom(dist, bestTN), target: b.target};
}

/** Every band for a party, for the Guide panel's button row. */
export function partyLadder(actors, attribute, opts = {}) {
  return DIFFICULTY_BANDS.map(b => suggestPartyTN(actors, attribute, b.key, opts));
}

/** Per-character breakdown of one TN, so a Guide can see who is actually threatened by it. */
export function tnBreakdown(actors, attribute, tn, {effortDie = 6, modifier = 0} = {}) {
  return (actors ?? []).filter(Boolean).map(actor => {
    const die = actorAttributeDie(actor, attribute);
    return {
      name: actor.name,
      die,
      chance: successChance({attributeDie: die, effortDie, modifier}, tn)
    };
  }).sort((a, b) => b.chance - a.chance);
}

/**
 * Which band a raw TN currently represents for this party — used to label the TNs
 * already written into adventures and Threat entries.
 */
export function classifyTN(actors, attribute, tn, opts = {}) {
  const chance = chanceFrom(partyDistribution(actors, attribute, opts), Number(tn));
  let best = DIFFICULTY_BANDS[0], bestDelta = Infinity;
  for (const b of DIFFICULTY_BANDS) {
    const delta = Math.abs(chance - b.target);
    if (delta < bestDelta) { bestDelta = delta; best = b; }
  }
  return {band: best.key, label: best.label, chance};
}

/**
 * Checks the rules publish at a fixed Target Number, declared by the band they are
 * meant to be rather than by a number. A number cannot hold its meaning across the
 * progression: TN 12 is Hard on a Stage 1 d4 and comfortable on a Stage 5 d12, so the
 * same published number made Prayer a 26% roll for a starting character and a formality
 * for a finished one. The band is the intent; `solveCheckTN` turns it into the number
 * for the character actually rolling.
 *
 * `reference` is the number these checks carried before 1.3.0, kept so a Guide who
 * prefers the published figure can still find it and so the book can show both.
 */
export const FIXED_CHECKS = Object.freeze({
  stayUp:      {label: "Stay Conscious (Down)",  band: "medium", attribute: "grt"},
  firstAid:    {label: "Patch Up / First Aid",   band: "medium", attribute: "sav"},
  stabilise:   {label: "Stabilise a Patient",    band: "medium", attribute: "sav"},
  keepBottle:  {label: "Keep Your Bottle",       band: "medium", attribute: "btl"},
  spotTail:    {label: "Spot a Tail",            band: "medium", attribute: "sav"},
  loseCops:    {label: "Lose the Cops",          band: "hard",   attribute: "whl"},
  talkDown:    {label: "Talk Your Way Out",      band: "hard",   attribute: "frt"}
});

/**
 * Solve a band into a Target Number for one character's own die. Falls back to the
 * default d4 curve when the Actor cannot be read, so a missing sheet never produces
 * a silently impossible check.
 */
export function solveCheckTN(actor, attribute, band = "medium") {
  const die = actorAttributeDie(actor, attribute);
  return suggestTN({attributeDie: die}, band);
}

/**
 * The Target Number for a published fixed check, solved for this character.
 * `key` is a key of FIXED_CHECKS; an unknown key falls back to Medium.
 */
export function fixedCheckTN(actor, key, attribute = null) {
  const check = FIXED_CHECKS[key] ?? {band: "medium", attribute: "btl"};
  const solved = solveCheckTN(actor, attribute ?? check.attribute, check.band);
  return {...solved, key, label: check.label ?? key, reference: check.reference ?? null};
}
