// Condition automation: the single source of truth for what a Condition does to a roll (Covenant pattern).
export const CONDITION_EFFECTS = Object.freeze({
  // physical
  'Bruised':      {statPenalty: {}},
  'Hurt':         {statPenalty: {mus: -1, grt: -1, mov: -1}},
  'Bleeding':     {statPenalty: {mus: -1, mov: -1}, bleeds: true},
  'In Pain':      {noEffortExplosion: true},
  'Broken':       {offGameStats: ['mus', 'mov']},
  'Knackered':    {offGameStats: ['mus', 'grt', 'mov']},
  'Restrained':   {offGameStats: ['mov', 'aim']},
  'Stunned':      {guardPenalty: -2, losesReaction: true},
  'Prone':        {guardPenalty: -2},
  'Down':         {cannotAct: true, guardPenalty: -4},
  // head
  'Shaken':       {statPenalty: {btl: -1}},
  'Bricking It':  {statPenalty: {btl: -1, frt: -1}, offGameStats: ['btl']},
  'Mullered':     {statPenalty: {whl: -2, aim: -1, sav: -1}},   // drunk
  'Gassed':       {statPenalty: {aim: -2, sav: -2}},          // CS spray / smoke
  'Cuffed':       {offGameStats: ['mus', 'mov', 'aim', 'grf'], cannotDrive: true},
  'Grabbed':      {guardPenalty: -2, offGameStats: ['mov']},
  'Burning':      {statPenalty: {aim: -1, grf: -1}, burns: true},
  // highs (taken), and what follows them
  'Blazed':       {statBonus: {btl: 1}, statPenalty: {sav: -1, whl: -1}},
  'Wired':        {statBonus: {frt: 1, btl: 1}},
  'Loved Up':     {statBonus: {frt: 2}, statPenalty: {aim: -1, sav: -1}},
  'Numb':         {statPenalty: {mov: -1, aim: -1}, ignores: ['Shaken', 'Bricking It']},
  'Giggling':     {statPenalty: {sav: -2, frt: -1}},
  'Pumped':       {statBonus: {mus: 1}, statPenalty: {frt: -1}},
  'Foggy':        {statPenalty: {sav: -1}},
  'Crashing':     {statPenalty: {frt: -1, btl: -1}},
  'Wrung Out':    {statPenalty: {btl: -1, mus: -1}},
  'Jittery':      {statPenalty: {btl: -1, aim: -1}},
  'Roid Rage':    {statPenalty: {frt: -2}, statBonus: {mus: 1}},
  // food, drink and medicine
  'Buzzing':      {statBonus: {mov: 1}},
  'Dutch Courage': {statBonus: {btl: 1}},
  'Numbed':       {ignores: ['In Pain', 'Hurt']}
});

/** Default Banana Watch durations for effects applied directly from a sheet/chat action.
 * Drug and consumable use supplies its own duration; this is the fallback for a GM
 * applying a temporary condition by name, not a replacement for combat-round rules.
 * Permanent injuries, wounds, restraint and "until you get some rest" effects stay untimed.
 */
export const WATCH_CONDITION_DEFAULTS = Object.freeze({
  'Blazed':       {minutes: 60, then: 'Foggy', thenMinutes: 120},
  'Wired':        {minutes: 30, then: 'Crashing', thenMinutes: 60},
  'Loved Up':     {minutes: 45, then: 'Wrung Out', thenMinutes: 90},
  'Numb':         {minutes: 60, then: 'Jittery', thenMinutes: 120},
  'Giggling':     {minutes: 2},
  'Pumped':       {minutes: 120, then: 'Roid Rage', thenMinutes: 240},
  'Foggy':        {minutes: 120},
  'Crashing':     {minutes: 60},
  'Wrung Out':    {minutes: 90},
  'Jittery':      {minutes: 120},
  'Roid Rage':    {minutes: 240},
  'Buzzing':      {minutes: 30},
  'Dutch Courage': {minutes: 30},
  'Numbed':       {minutes: 60},
  'Mullered':     {minutes: 240}
});

export const CONDITION_LIBRARY = Object.freeze([
  {name: 'Bruised', category: 'physical', severity: 1, description: 'Knocked about. No effect on its own; two more Bruises make you Hurt.', removal: 'A rest or a night\'s kip.'},
  {name: 'Hurt', category: 'physical', severity: 2, description: '-1 to Muscle, Grit and Moves rolls.', removal: 'First aid (Savvy, Medium) or a night at the safehouse.'},
  {name: 'Bleeding', category: 'physical', severity: 3, description: '-1 to Muscle and Moves. Lose 1 Health every round until patched up (at the end of the round in the Combat Console; at the end of your turn on the core tracker).', removal: 'First aid (Savvy, Medium), a paramedic or A&E.'},
  {name: 'In Pain', category: 'physical', severity: 3, description: 'Your Effort die does not explode.', removal: 'Painkillers, rest or A&E.'},
  {name: 'Broken', category: 'physical', severity: 3, description: 'Muscle and Moves are rolled Off Your Game (no exploding).', removal: 'A&E and a week.'},
  {name: 'Knackered', category: 'physical', severity: 2, description: 'Muscle, Grit and Moves are rolled Off Your Game.', removal: 'Sleep.'},
  {name: 'Restrained', category: 'physical', severity: 2, description: 'Held, tangled or pinned: Moves and Aim are Off Your Game.', removal: 'Break free (Muscle or Moves vs the holder).'},
  {name: 'Stunned', category: 'physical', severity: 2, description: '-2 Guard and no Reaction this round.', removal: 'Ends at the end of your next turn.'},
  {name: 'Prone', category: 'physical', severity: 1, description: 'On the floor: -2 Guard.', removal: 'Get up (your move).'},
  {name: 'Down', category: 'physical', severity: 4, description: 'At 0 Health. You cannot act. Roll Grit (Stay Conscious) each round or be Wasted.', removal: 'First aid or a paramedic gets you back to 1 Health.'},
  {name: 'Shaken', category: 'head', severity: 1, description: '-1 to Bottle rolls.', removal: 'A breather somewhere safe.'},
  {name: 'Bricking It', category: 'head', severity: 3, description: 'Terrified: -1 to Front and Bottle; Bottle is also Off Your Game.', removal: 'Keep Your Bottle (Bottle, Medium) or get away.'},
  {name: 'Mullered', category: 'head', severity: 2, description: 'Drunk: -2 Wheels, -1 Aim and Savvy. Drink-driving is a crime if you are stopped.', removal: 'A kebab and four hours.'},
  {name: 'Gassed', category: 'head', severity: 2, description: 'CS spray or smoke: -2 Aim and Savvy.', removal: 'Fresh air and water: one round out of it.'},
  {name: 'Cuffed', category: 'physical', severity: 3, description: 'Hands cuffed: Muscle, Moves, Aim and Graft are Off Your Game; you cannot drive.', removal: 'A key, a Graft roll (Hard), or the custody suite.'},
  {name: 'Grabbed', category: 'physical', severity: 2, description: 'Someone has hold of you: you cannot move away, Moves is Off Your Game and -2 Guard.', removal: 'Break free: Muscle or Moves against the grabber\'s Guard, on your action.'},
  {name: 'Burning', category: 'physical', severity: 3, description: 'On fire: -1 Aim and Graft, and 2 damage at the end of each round.', removal: 'Stop, drop and roll (Moves, Easy), a fire extinguisher or a canal.'},
  {name: 'Blazed', category: 'drug', severity: 1, description: 'Stoned: +1 Bottle, -1 Savvy and Wheels.', removal: 'Wears off (then Foggy).'},
  {name: 'Wired', category: 'drug', severity: 1, description: 'Coked up: +1 Front and Bottle. Everyone you talk to can tell.', removal: 'Wears off (then Crashing).'},
  {name: 'Loved Up', category: 'drug', severity: 1, description: 'Pilled: +2 Front, -1 Aim and Savvy. You love everyone, even the police.', removal: 'Wears off (then Wrung Out).'},
  {name: 'Numb', category: 'drug', severity: 1, description: 'Benzos: Shaken and Bricking It have no effect; -1 Moves and Aim.', removal: 'Wears off (then Jittery).'},
  {name: 'Giggling', category: 'drug', severity: 1, description: 'Nitrous: -2 Savvy, -1 Front. Lasts two Banana Watch minutes.', removal: 'Wears off quickly.'},
  {name: 'Pumped', category: 'drug', severity: 1, description: 'Steroids: +1 Muscle, -1 Front.', removal: 'Wears off (then Roid Rage).'},
  {name: 'Foggy', category: 'comedown', severity: 1, description: 'Comedown: -1 Savvy.', removal: 'Sleep, or wait it out.'},
  {name: 'Crashing', category: 'comedown', severity: 2, description: 'Comedown: -1 Front and Bottle.', removal: 'Sleep, or wait it out.'},
  {name: 'Wrung Out', category: 'comedown', severity: 2, description: 'Comedown: -1 Bottle and Muscle.', removal: 'Sleep, or wait it out.'},
  {name: 'Jittery', category: 'comedown', severity: 1, description: 'Comedown: -1 Bottle and Aim.', removal: 'Sleep, or wait it out.'},
  {name: 'Roid Rage', category: 'comedown', severity: 2, description: 'Comedown: -2 Front, but +1 Muscle. You want to hit something.', removal: 'Sleep, or wait it out.'},
  {name: 'Buzzing', category: 'boost', severity: 1, description: 'Energy drink: +1 Moves.', removal: 'Wears off.'},
  {name: 'Dutch Courage', category: 'boost', severity: 1, description: 'A few cans in: +1 Bottle. Any more and you are Mullered.', removal: 'Wears off.'},
  {name: 'Numbed', category: 'boost', severity: 1, description: 'Painkillers: In Pain and Hurt have no effect.', removal: 'Wears off.'}
]);

/** The Conditions that actually bite: a Condition that `ignores` others switches them off (painkillers, benzos). */
const asSet = names => {
  const set = names instanceof Set ? new Set(names) : new Set(names || []);
  for (const n of [...set]) for (const x of CONDITION_EFFECTS[n]?.ignores || []) set.delete(x);
  return set;
};
/** The net modifier Conditions put on a stat: penalties and the odd bonus from something you took. */
export function statPenalty(names, stat) {
  let total = 0;
  for (const n of asSet(names)) total += Number(CONDITION_EFFECTS[n]?.statPenalty?.[stat] ?? 0) + Number(CONDITION_EFFECTS[n]?.statBonus?.[stat] ?? 0);
  return total;
}
/** Conditions that hurt at the end of each round: [{name, damage}]. */
export function roundDamage(names) {
  const out = [];
  for (const n of asSet(names)) { if (CONDITION_EFFECTS[n]?.bleeds) out.push({name: n, damage: 1}); if (CONDITION_EFFECTS[n]?.burns) out.push({name: n, damage: 2}); }
  return out;
}
export function offGameFor(names, stat) {
  for (const n of asSet(names)) if (CONDITION_EFFECTS[n]?.offGameStats?.includes(stat)) return true;
  return false;
}
export function blocksEffortExplosion(names) {
  for (const n of asSet(names)) if (CONDITION_EFFECTS[n]?.noEffortExplosion) return true;
  return false;
}
export function guardPenalty(names) {
  let total = 0;
  for (const n of asSet(names)) total += Number(CONDITION_EFFECTS[n]?.guardPenalty ?? 0);
  return total;
}
export function cannotDrive(names) {
  for (const n of asSet(names)) if (CONDITION_EFFECTS[n]?.cannotDrive || CONDITION_EFFECTS[n]?.cannotAct) return true;
  return false;
}
