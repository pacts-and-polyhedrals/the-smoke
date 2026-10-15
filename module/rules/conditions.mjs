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
  'Cuffed':       {offGameStats: ['mus', 'mov', 'aim', 'grf'], cannotDrive: true}
});

export const CONDITION_LIBRARY = Object.freeze([
  {name: 'Bruised', category: 'physical', severity: 1, description: 'Knocked about. No effect on its own; two more Bruises make you Hurt.', removal: 'A rest or a night\'s kip.'},
  {name: 'Hurt', category: 'physical', severity: 2, description: '-1 to Muscle, Grit and Moves rolls.', removal: 'First aid (Savvy, Medium) or a night at the safehouse.'},
  {name: 'Bleeding', category: 'physical', severity: 3, description: '-1 to Muscle and Moves. Lose 1 Health at the start of your turn until patched up.', removal: 'First aid (Savvy, Medium), a paramedic or A&E.'},
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
  {name: 'Cuffed', category: 'physical', severity: 3, description: 'Hands cuffed: Muscle, Moves, Aim and Graft are Off Your Game; you cannot drive.', removal: 'A key, a Graft roll (Hard), or the custody suite.'}
]);

const asSet = names => names instanceof Set ? names : new Set(names || []);
export function statPenalty(names, stat) {
  let total = 0;
  for (const n of asSet(names)) total += Number(CONDITION_EFFECTS[n]?.statPenalty?.[stat] ?? 0);
  return total;
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
