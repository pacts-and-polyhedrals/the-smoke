// Rep: levelling in The Smoke. Covenant Stages with London names. XP comes from jobs, Pat's orders, missions and the
// GM; each level raises one stat (up to the level's cap), adds a perk, and rolls Growth for Health and Guard.
import {DIE_LADDER} from '../config.mjs';

export const REP_LEVELS = Object.freeze([
  {level: 1, title: 'Nobody', xp: 0, blurb: 'Just another face on Mare Street.'},
  {level: 2, title: 'Runner', xp: 10, blurb: 'Pat knows your name. So does Kez\'s mum.'},
  {level: 3, title: 'Face', xp: 25, blurb: 'People nod at you on the street. Some of them cross over.'},
  {level: 4, title: 'Name', xp: 45, blurb: 'Your name comes up at the Lea Boys\' meetings — and in DS Vale\'s notebook.'},
  {level: 5, title: 'Legend', xp: 70, blurb: 'There are stories about you. Some of them are even true.'}
]);
/** The highest die a stat may reach at each Rep level (Covenant Stage caps). */
export const statCap = level => Number(level) <= 1 ? 8 : Number(level) === 2 ? 10 : Number(level) <= 4 ? 12 : 20;
export const levelInfo = level => REP_LEVELS[Math.max(1, Math.min(5, Number(level) || 1)) - 1];
/** The level XP alone would reach (the character still has to level up through the wizard). */
export const levelForXP = xp => [...REP_LEVELS].reverse().find(l => Number(xp) >= l.xp)?.level ?? 1;

/** XP awards, in one place so jobs, missions and the GM screen agree. */
export const XP_AWARDS = Object.freeze({
  job: 1,            // a completed taxi fare, delivery, patient, fire or police call
  crewOrder: 2,      // one of Pat's orders completed
  bigSale: 1,        // a vehicle sold for £500 or more
  missionMinor: 3, missionMajor: 5,
  bustedOrWasted: 0
});

/** Things a character unlocks. `test` reads only actor.system so it works on plain data too. */
export const UNLOCKS = Object.freeze([
  {key: 'guns', label: 'Rep 2 — Uncle sells you shooters (guns and ammo at Uncle\'s Cafe)', test: s => Number(s.stage) >= 2},
  {key: 'bigOrders', label: 'Rep 2 — Pat gives you the bigger orders', test: s => Number(s.stage) >= 2},
  {key: 'fenceBonus', label: 'Rep 3 — A known supplier: fences pay you 10% more for nicked rides', test: s => Number(s.stage) >= 3},
  {key: 'carJobs', label: 'Rep 4 — Pat\'s car jobs (motors, not bikes)', test: s => Number(s.stage) >= 4},
  {key: 'ownCrew', label: 'Rep 5 — Your own crew: hire NPCs to work for you', test: s => Number(s.stage) >= 5},
  {key: 'patDiscount', label: 'Chainring 3 — Pat knocks 10% off at The Arches', test: s => Number(s.rep?.crew) >= 3},
  {key: 'streetDiscount', label: 'Street 5 — Known on the street: every shop knocks 10% off', test: s => Number(s.rep?.street) >= 5},
  {key: 'knownToPolice', label: 'Known to police 3 — Stops start at Wanted: they know your face', test: s => Number(s.rep?.police) >= 3}
]);
export const hasUnlock = (system, key) => Boolean(UNLOCKS.find(u => u.key === key)?.test(system));

/** Everything the sheet shows about Rep. */
export function repInfo(system) {
  const level = Math.max(1, Math.min(5, Number(system?.stage) || 1)), xp = Math.max(0, Number(system?.rep?.xp) || 0);
  const cur = levelInfo(level), nxt = level < 5 ? levelInfo(level + 1) : null;
  const pct = nxt ? Math.max(0, Math.min(100, Math.round(100 * (xp - cur.xp) / Math.max(1, nxt.xp - cur.xp)))) : 100;
  return {level, title: cur.title, blurb: cur.blurb, xp, next: nxt?.xp ?? null, nextLevel: nxt?.level ?? null, nextTitle: nxt?.title ?? null, pct,
    canLevel: Boolean(nxt && xp >= nxt.xp), cap: statCap(level), nextCap: nxt ? statCap(nxt.level) : statCap(level),
    unlocks: UNLOCKS.map(u => ({key: u.key, label: u.label, on: u.test(system || {})}))};
}

/** What a level-up must include, and whether a set of choices is legal. */
export function levelUpPlan(fromLevel) {
  const to = Number(fromLevel) + 1;
  return {to, title: levelInfo(to).title, statUpgrade: true, cap: statCap(to), perk: true, hustle: to === 3 || to === 5 ? 1 : 0,
    growth: ['Health (roll your Grit die, gain half rounded up)', 'Guard (roll the better of Moves or Grit: 3+ gains 1, the top face gains 2)']};
}
export function validateLevelUp({fromLevel, stat, statDie, perk, xp}) {
  const plan = levelUpPlan(fromLevel);
  if (Number(fromLevel) >= 5) return {valid: false, message: 'Already Rep 5: a Legend.'};
  if (Number(xp) < levelInfo(plan.to).xp) return {valid: false, message: `Rep ${plan.to} needs ${levelInfo(plan.to).xp} XP.`};
  if (!stat) return {valid: false, message: 'Choose a stat to raise.'};
  const at = DIE_LADDER.indexOf(Number(statDie)); const nextDie = DIE_LADDER[at + 1];
  if (at < 0 || !nextDie) return {valid: false, message: 'That stat cannot go any higher.'};
  if (nextDie > plan.cap) return {valid: false, message: `At Rep ${plan.to} a stat can reach d${plan.cap} at most.`};
  if (!perk) return {valid: false, message: 'Choose a new perk.'};
  return {valid: true, message: 'Ready.', nextDie};
}
/** Growth: Health gains half the Grit die roll (rounded up, at least 1). */
export const healthGrowth = roll => Math.max(1, Math.ceil(Number(roll) / 2));
/** Growth: Guard gains nothing on 1-2, 1 on 3+, 2 on the die's top face. */
export const guardGrowth = (roll, faces) => Number(roll) >= Number(faces) ? 2 : Number(roll) >= 3 ? 1 : 0;
