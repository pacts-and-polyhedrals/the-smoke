// The Covenant roll formula: Effort Die + Stat Die + Stat modifier, both dice exploding on their top face.
// On a Roll (Covenant "Blessed"): explode on the top two faces. Off Your Game ("Cursed"): no explosions.
// Behind the wheel the vehicle's Performance die stands in for the Effort die and Handling is added.
import {statModifier, stepDie, stepDown} from '../rules/core.mjs';

function explode(faces, state, allow = true) {
  if (!allow || state === 'offGame') return '';
  if (state === 'onARoll') return `x>=${Math.max(2, faces - 1)}`;
  return `x=${faces}`;
}

export function buildFormula({
  effortDie = 6, statDie = 4, statUpgrades = 0, effortUpgrades = 0, effortDowngrades = 0, stage = 1, state = 'normal',
  modifier = 0, perkApplies = false, noExplosions = false, noEffortExplosion = false, allowLegendary = false
} = {}) {
  let stat = {die: Number(statDie), bonus: 0};
  if (perkApplies) stat = stepDie(stat.die, 1, {stage, allowLegendary});
  if (statUpgrades) { const s = stepDie(stat.die, statUpgrades, {stage, allowLegendary}); stat = {die: s.die, bonus: stat.bonus + s.bonus}; }
  let effort = stepDie(Number(effortDie), effortUpgrades, {stage, allowLegendary});
  if (effortDowngrades) { const d = stepDown(effort.die, effortDowngrades); effort = {die: d.die, bonus: effort.bonus + d.bonus}; }
  const effective = noExplosions ? 'offGame' : state;
  const effortTerm = `1d${effort.die}${explode(effort.die, effective, !noExplosions && !noEffortExplosion)}`;
  const statTerm = `1d${stat.die}${explode(stat.die, effective, !noExplosions)}`;
  const flat = statModifier(stat.die) + stat.bonus + effort.bonus + Number(modifier || 0);
  const sign = flat >= 0 ? `+ ${flat}` : `- ${Math.abs(flat)}`;
  return {formula: `${effortTerm} + ${statTerm} ${sign}`, effortTerm, statTerm, effortDie: effort.die, statDie: stat.die,
          statModifier: statModifier(stat.die), staticModifier: flat, state: effective};
}

export function countExplosions(roll) {
  return (roll?.dice ?? []).reduce((t, d) => t + (d.results ?? []).filter(r => r.exploded).length, 0);
}
