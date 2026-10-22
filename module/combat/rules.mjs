// Combat rules for The Smoke, free of Foundry so they can be tested.
// Speed dice (from Altered Carbon): each round everyone rolls their speed dice in secret; the GM reveals them all at
// once; every die is one action, highest first. Attacks are Covenant rolls against Guard with range bands, cover,
// ammo, bursts and aiming; grabs and arrests; ramming and shooting tyres; and what the police do on their turn.
export const RANGES = Object.freeze(['Engaged', 'Near', 'Far', 'Distant']);
export const RANGE_SQUARES = Object.freeze({Engaged: 1.6, Near: 10, Far: 25, Distant: Infinity});
export const rangeIndex = band => Math.max(0, RANGES.indexOf(band));
/** The range band for a distance in squares. */
export function rangeBand(squares) {
  const d = Number(squares) || 0;
  return d <= RANGE_SQUARES.Engaged ? 'Engaged' : d <= RANGE_SQUARES.Near ? 'Near' : d <= RANGE_SQUARES.Far ? 'Far' : 'Distant';
}

/* ------------------------------------------------------------------ speed dice */
const SPEED_BY_MOVES = {4: 1, 6: 2, 8: 2, 10: 3, 12: 3, 20: 4};
/** Why someone gets no speed dice at all this round ('' if they roll): Down, Cuffed, or surrendered in this fight. */
export function speedDiceBlock({conditions = [], surrendered = false} = {}) {
  const c = new Set(conditions);
  return surrendered ? 'Surrendered' : c.has('Down') ? 'Down' : c.has('Cuffed') ? 'Cuffed' : '';
}
/** How many speed dice a character rolls this round. Down, Cuffed or surrendered: none; Stunned or Knackered: one fewer. */
export function speedDiceCount({movDie = 4, conditions = [], surrendered = false, bonus = 0} = {}) {
  const c = new Set(conditions);
  if (speedDiceBlock({conditions, surrendered})) return 0;
  let n = (SPEED_BY_MOVES[Number(movDie)] ?? 1) + Number(bonus || 0);
  if (c.has('Stunned')) n -= 1;
  if (c.has('Knackered')) n -= 1;
  return Math.max(1, Math.min(5, n));
}
/**
 * Stunned part-way through a round costs one of the dice still to come ("reduces speed dice for that round"), never
 * the one being acted on now, and never the last die of the round: minimum one. queue is the revealed order, cursor
 * the action being played. Returns the queue index to drop, or -1.
 */
export function stunnedDrop(queue = [], cursor = 0, cid) {
  const mine = queue.map((e, i) => ({e, i})).filter(x => x.e.cid === cid);
  if (mine.length < 2) return -1;
  const later = mine.filter(x => x.i > cursor);
  return later.length ? later[later.length - 1].i : -1;   // the queue runs highest first, so their last entry is their lowest die
}
/** Every die is one action. The queue runs highest die first; ties go to the better Moves die, then characters before NPCs. */
export function buildQueue(entries) {
  const out = [];
  for (const e of entries) (e.results || []).forEach((value, i) => out.push({cid: e.cid, name: e.name, die: i, value: Number(value), movDie: Number(e.movDie || 4), pc: Boolean(e.pc)}));
  return out.sort((a, b) => b.value - a.value || b.movDie - a.movDie || Number(b.pc) - Number(a.pc) || a.name.localeCompare(b.name) || a.die - b.die);
}

/* ------------------------------------------------------------------ cover */
export const COVER = Object.freeze({
  none: {label: 'No cover', guard: 0, armour: 0},
  light: {label: 'Light cover (a car door, a bin, a hedge)', guard: 2, armour: 0},
  heavy: {label: 'Heavy cover (a wall, an engine block, a skip)', guard: 4, armour: 1},
  full: {label: 'Out of sight (cannot be targeted)', guard: 99, armour: 99}
});

/* ------------------------------------------------------------------ attacks */
/**
 * Work out an attack before the dice: is it allowed, and what modifies it?
 * weapon: item.system; distance in squares; cover key; burst, aimed booleans; seat: 'pilot' | 'passenger' | null;
 * targetInVehicle: the target is riding inside a car (not exposed) → +2 Guard.
 */
export function attackPlan({weapon, distance = 1, cover = 'none', burst = false, aimed = false, seat = null, targetInVehicle = false, dodging = false, tyres = false}) {
  const w = weapon || {kind: 'melee', impact: 0, range: 'Engaged', ammo: {value: 0, max: 0}};
  const band = rangeBand(distance), notes = [];
  const melee = w.kind === 'melee' || (w.category === 'police' && w.stat === 'mus');
  const reach = melee ? 'Engaged' : (RANGES.includes(w.range) ? w.range : 'Near');
  if (rangeIndex(band) > rangeIndex(reach)) return {ok: false, reason: `${band} is out of range (${reach} at most).`, band};
  if (COVER[cover]?.guard >= 99 && w.effect !== 'area' && w.effect !== 'smoke') return {ok: false, reason: 'They are out of sight.', band};
  let modifier = 0, impact = Number(w.impact || 0), effortUpgrades = 0, ammoCost = 0;
  const guardBonus = (COVER[cover]?.guard ?? 0) + (targetInVehicle ? 2 : 0) + (dodging ? 2 : 0), armourBonus = COVER[cover]?.armour ?? 0;
  if (COVER[cover]?.guard) notes.push(`${COVER[cover].label.split(' (')[0]}: +${COVER[cover].guard} Guard`);
  if (targetInVehicle) notes.push('Inside a vehicle: +2 Guard');
  if (dodging) notes.push('Dodging: +2 Guard');
  if (!melee && !w.thrown && Number(w.ammo?.max || 0) > 0) {
    ammoCost = burst && w.burst ? 3 : 1;
    if (Number(w.ammo?.value || 0) < ammoCost) return {ok: false, reason: `Needs ${ammoCost} round${ammoCost > 1 ? 's' : ''}: reload.`, band, needsReload: true};
  }
  if (w.thrown && Number(w.quantity ?? 1) < 1) return {ok: false, reason: 'None left to throw.', band};
  if (burst) { if (!w.burst) return {ok: false, reason: 'That weapon cannot fire a burst.', band}; impact += 2; notes.push('Burst: +2 impact, 3 rounds'); }
  if (aimed && !melee) { effortUpgrades += 1; notes.push('Aimed: Effort die one step up'); }
  if (w.category === 'shotgun' && band === 'Engaged') { impact += 2; notes.push('Shotgun up close: +2 impact'); }
  if (w.category === 'rifle' && band === 'Engaged') { modifier -= 2; notes.push('Rifle at arm\'s length: −2'); }
  if (!melee && band === 'Distant' && w.range === 'Distant') { modifier -= 1; notes.push('Long range: −1'); }
  if (seat === 'pilot' && !melee) { if (w.twoHanded) return {ok: false, reason: 'Two hands on the wheel: not with that.', band}; modifier -= 2; notes.push('Shooting while driving: −2'); }
  if (seat === 'passenger' && !melee) { modifier -= 1; notes.push('Drive-by: −1'); }
  if (seat && melee && band !== 'Engaged') return {ok: false, reason: 'Out of reach from the vehicle.', band};
  if (tyres) { modifier -= 2; notes.push('Going for the tyres: −2'); }
  return {ok: true, band, melee, modifier, impact, effortUpgrades, ammoCost, guardBonus, armourBonus, notes};
}
/** Damage from a hit. */
export const hitDamage = ({margin, impact, armour = 0}) => Math.max(0, Math.floor(Number(margin) + Number(impact) - Number(armour)));
/** Conditions a weapon's effect adds on a hit (on top of the damage severity). */
export function effectConditions(effect, {damage = 0, outcomeKey = 'fullSuccess'} = {}) {
  switch (effect) {
    case 'stun': return ['Stunned', 'Prone'];
    case 'gas': case 'smoke': return ['Gassed'];
    case 'fire': return ['Burning'];
    case 'bleed': return damage > 0 && ['strongSuccess', 'exceptionalSuccess'].includes(outcomeKey) ? ['Bleeding'] : [];
    default: return [];
  }
}
/** Guard of a vehicle: bigger is easier to hit. */
export const vehicleGuard = size => 6 + Number(size || 0) * 2;

/* ------------------------------------------------------------------ grabs, arrests, surrender */
/** Can `target` be cuffed now? */
export function cuffable({conditions = [], surrendered = false} = {}) {
  const c = new Set(conditions);
  return surrendered || ['Grabbed', 'Down', 'Restrained', 'Stunned'].some(x => c.has(x));
}

/* ------------------------------------------------------------------ vehicles */
/** Ramming: damage to the target and to your own motor. */
export function ramDamage({margin = 0, size = 2, targetIsVehicle = false}) {
  const base = Math.max(0, Number(margin) + Number(size) * 2);
  return {target: base, self: Math.ceil(base / (targetIsVehicle ? 2 : 4)), knockdown: !targetIsVehicle && base > 0};
}

/* ------------------------------------------------------------------ the police on their turn */
/**
 * What a police officer does with this action.
 * heat: the target's stars; distance in squares; target {conditions, surrendered, armed}; weapons: [{name, kind, category, range, ammo, effect, stat}].
 * Returns {act: 'cuff' | 'grab' | 'attack' | 'move' | 'shout', weapon?, why}.
 */
export function policeChoice({heat = 1, distance = 5, target = {}, weapons = []}) {
  const band = rangeBand(distance), engaged = band === 'Engaged';
  const loaded = w => !Number(w.ammo?.max) || Number(w.ammo?.value) > 0;
  const can = w => loaded(w) && rangeIndex(band) <= rangeIndex(w.kind === 'melee' ? 'Engaged' : w.range);
  if (cuffable(target)) return engaged ? {act: 'cuff', why: 'They can be cuffed.'} : {act: 'move', why: 'Close in to cuff them.'};
  if (target.surrenderedBefore === false && heat <= 1) return {act: 'shout', why: '"Stop! Police! Get on the ground!"'};
  if (heat >= 4) { const gun = weapons.find(w => w.kind === 'firearm' && w.effect !== 'stun' && w.effect !== 'gas' && can(w)); if (gun) return {act: 'attack', weapon: gun.name, why: 'Armed response: shots fired.'}; }
  const taser = weapons.find(w => w.effect === 'stun' && can(w));
  if (taser && (target.armed || heat >= 2)) return {act: 'attack', weapon: taser.name, why: 'Taser.'};
  if (engaged) {
    if (heat <= 2) return {act: 'grab', why: 'Hands on: grab them.'};
    const spray = weapons.find(w => w.effect === 'gas' && can(w)); if (spray) return {act: 'attack', weapon: spray.name, why: 'CS spray.'};
    const baton = weapons.find(w => w.kind === 'melee' && w.category === 'police'); if (baton) return {act: 'attack', weapon: baton.name, why: 'Baton.'};
    return {act: 'grab', why: 'Hands on.'};
  }
  return {act: 'move', why: 'Close the distance.'};
}
