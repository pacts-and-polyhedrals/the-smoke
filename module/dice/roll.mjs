// Rolling: the Covenant roll from a character's sheet, with London's extras — the vehicle's Performance die
// behind the wheel, Hustle, Conditions, and a chat card the job minigames can read back.
import {NS, STATS, STAT_KEYS} from '../config.mjs';
import {buildFormula, countExplosions} from './formula.mjs';
import {outcomeFromMargin, blinderTier, isSuccess, damageValue, damageConsequences} from '../rules/core.mjs';
import {statPenalty, offGameFor, blocksEffortExplosion} from '../rules/conditions.mjs';
import {suggestTN, successChance} from '../rules/difficulty.mjs';
import {driverContext} from '../vehicles/vehicle-abilities.mjs';

const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
const BAND_LABEL = {easy: 'Easy', medium: 'Medium', hard: 'Hard', miracle: 'Long Shot'};

/** Everything that goes into one roll, without rolling: used by the roll and by the dialog preview. */
export function prepareRoll(actor, stat, options = {}) {
  stat = String(stat).toLowerCase();
  if (!STAT_KEYS.includes(stat)) throw new Error(`Unknown stat ${stat}`);
  const conditions = new Set(actor.items.filter(i => i.type === 'condition').map(i => i.name));
  const notes = [];
  let effortDie = Number(options.effortDie || 6), modifier = Number(options.modifier || 0);
  let effortUpgrades = Number(options.effortUpgrades || 0), statUpgrades = Number(options.statUpgrades || 0);
  let onARoll = options.onARoll ?? Boolean(actor.system.states?.onARoll);
  let offGame = options.offGame ?? Boolean(actor.system.states?.offGame);
  // Behind the wheel: the vehicle's Performance die is the Effort die.
  const drive = stat === 'whl' && options.vehicle !== false ? driverContext(actor) : null;
  if (drive) {
    effortDie = drive.perfDie; modifier += drive.handling + drive.modifier;
    notes.push(`${drive.vehicleName}: Performance d${drive.perfDie}, Handling ${drive.handling >= 0 ? '+' : ''}${drive.handling}`, ...drive.notes);
    if (drive.wrecked) { effortUpgrades -= 1; notes.push('Wrecked: Performance die one step down'); }
  }
  const cPen = statPenalty(conditions, stat); if (cPen) { modifier += cPen; notes.push(`Conditions ${cPen}`); }
  if (offGameFor(conditions, stat)) { offGame = true; notes.push('A Condition puts you Off Your Game'); }
  const hustle = Math.max(0, Math.min(2, Number(options.hustle || 0)));
  if (hustle === 1) { effortUpgrades += 1; notes.push('Hustle 1: Effort die one step up'); }
  if (hustle === 2) { onARoll = true; notes.push('Hustle 2: On a Roll'); }
  const perk = options.perk ? (actor.items.get(options.perk) ?? actor.items.find(i => i.type === 'perk' && i.name === options.perk)) : null;
  if (perk) notes.push(`Perk: ${perk.name}`);
  const state = onARoll && !offGame ? 'onARoll' : offGame && !onARoll ? 'offGame' : 'normal';
  const built = buildFormula({
    effortDie, statDie: Number(actor.system.stats?.[stat]?.die ?? 4), stage: Number(actor.system.stage ?? 1), state,
    modifier, perkApplies: Boolean(perk), statUpgrades, effortUpgrades: Math.max(0, effortUpgrades), effortDowngrades: Math.max(0, -effortUpgrades),
    noEffortExplosion: blocksEffortExplosion(conditions)
  });
  let tn = options.tn === '' || options.tn == null ? null : Number(options.tn);
  let band = options.band || null;
  if (tn == null && band) tn = suggestTN({attributeDie: built.statDie, effortDie: built.effortDie, modifier: built.staticModifier - built.statModifier}, band).tn;
  const chance = tn == null ? null : successChance({attributeDie: built.statDie, effortDie: built.effortDie, modifier: built.staticModifier - built.statModifier, state: state === 'offGame' ? 'cursed' : 'normal'}, tn);
  return {stat, built, tn, band, chance, notes, hustle, perk, drive, state};
}

export async function rollStat(actor, stat, options = {}) {
  const prep = prepareRoll(actor, stat, options);
  if (prep.hustle && !(await actor.spendHustle(prep.hustle, options.label || STATS[prep.stat].label))) return null;
  const roll = await new Roll(prep.built.formula).evaluate();
  const explosions = countExplosions(roll);
  const margin = prep.tn == null ? null : Number(roll.total) - prep.tn;
  const outcome = margin == null ? null : outcomeFromMargin(margin);
  const blinder = blinderTier(explosions);
  const label = options.label || `${STATS[prep.stat].label} roll`;
  const result = {actorUuid: actor.uuid, actorName: actor.name, stat: prep.stat, total: Number(roll.total), tn: prep.tn, band: prep.band, margin,
                  outcomeKey: outcome?.key ?? null, outcome: outcome?.label ?? null, success: outcome ? isSuccess(outcome.key) : null,
                  explosions, blinder: blinder.key, label, context: options.context ?? null, formula: prep.built.formula};
  const content = rollCard({actor, label, prep, roll, result, outcome, blinder, extra: options.cardExtra || ''});
  const message = await ChatMessage.implementation.create({
    speaker: ChatMessage.getSpeaker({actor}), content, rolls: [roll],
    flags: {[NS]: {roll: result}}, ...(options.whisper ? {whisper: options.whisper} : {})
  });
  if (options.consumeState !== false) {
    const up = {};
    if (actor.system.states?.onARoll && prep.state === 'onARoll' && !prep.hustle) up['system.states.onARoll'] = false;
    if (actor.system.states?.offGame && prep.state === 'offGame') up['system.states.offGame'] = false;
    if (Object.keys(up).length) await actor.update(up);
  }
  return {message, result, roll};
}

export function rollCard({actor, label, prep, roll, result, outcome, blinder, extra = ''}) {
  const dice = (roll.dice || []).map(d => `<span class="smoke-die d${d.faces}${d.results.some(r => r.exploded) ? ' boom' : ''}">${d.results.map(r => r.result).join('+')}</span>`).join('<i>+</i>');
  const tnLine = result.tn == null ? '' : `<div class="smoke-tn">vs <b>${result.tn}</b>${prep.band ? ` · ${BAND_LABEL[prep.band] || prep.band}` : ''}${prep.chance != null ? ` · ${Math.round(prep.chance * 100)}%` : ''}</div>`;
  return `<section class="smoke-card roll ${outcome ? (result.success ? 'win' : 'lose') : ''}">
    <header><span class="kicker">${esc(STATS[prep.stat].abbr)} · d${prep.built.effortDie} + d${prep.built.statDie}${prep.built.staticModifier >= 0 ? '+' : ''}${prep.built.staticModifier}</span><strong>${esc(label)}</strong></header>
    <div class="smoke-total"><span class="num">${result.total}</span>${tnLine}</div>
    <div class="smoke-dice">${dice}</div>
    ${outcome ? `<div class="smoke-outcome ${outcome.key}">${esc(outcome.label)}<small>${esc(outcome.short)}${result.margin != null ? ` · margin ${result.margin >= 0 ? '+' : ''}${result.margin}` : ''}</small></div>` : ''}
    ${blinder.rank ? `<div class="smoke-blinder r${blinder.rank}">${esc(blinder.label)}!</div>` : ''}
    ${prep.state !== 'normal' ? `<div class="smoke-state">${prep.state === 'onARoll' ? 'On a Roll' : 'Off Your Game'}</div>` : ''}
    ${prep.notes.length ? `<ul class="smoke-notes">${prep.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${extra}
  </section>`;
}

/** An attack: Aim or Muscle against the target's Guard; damage = margin + impact − armour. */
export async function rollAttack(actor, weapon, targetToken = null, options = {}) {
  const target = targetToken?.actor ?? null;
  const guard = target ? Number(target.type === 'vehicle' ? 6 + Number(target.system.vehicle.size || 0) * 2 : target.system.guard?.value ?? 9) : null;
  const stat = weapon?.system?.stat || 'mus';
  const out = await rollStat(actor, stat, {...options, tn: guard, label: `${weapon?.name || 'Unarmed'}${target ? ` → ${target.name}` : ''}`, context: {kind: 'attack', weaponId: weapon?.id, target: targetToken?.uuid}});
  if (!out || out.result.margin == null || out.result.margin < 0) return out;
  const armour = target?.type === 'vehicle' ? Number(target.system.vehicle.armour || 0) : Number(target?.system?.armour || 0);
  const dmg = damageValue({margin: out.result.margin, impact: Number(weapon?.system?.impact ?? 1), armour});
  const cons = damageConsequences(dmg, {explosions: out.result.explosions});
  const html = `<section class="smoke-card damage"><header><span class="kicker">DAMAGE</span><strong>${esc(target?.name || 'Target')}: ${dmg}</strong></header>
    <p>${esc(cons.label)}</p>
    ${target ? `<button type="button" data-smoke-damage="${esc(targetToken.uuid)}" data-amount="${dmg}"><i class="fa-solid fa-burst"></i> Apply ${dmg} damage</button>` : ''}
    ${target && target.type !== 'vehicle' ? [...cons.conditions, ...cons.breakthrough].map(c => `<button type="button" data-smoke-condition="${esc(targetToken.uuid)}" data-condition="${esc(c)}">${esc(c)}</button>`).join('') : ''}
    ${weapon?.system?.crime ? `<button type="button" class="gm" data-smoke-crime="${esc(actor.uuid)}" data-crime="${esc(target?.system?.role === 'police' ? 'assaultCop' : weapon.system.crime)}"><i class="fa-solid fa-star"></i> Witnessed: add Heat</button>` : ''}
  </section>`;
  await ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor}), content: html});
  return out;
}

/** Roll dialog: band or TN, Hustle, Perk, modifier. Returns the rollStat promise or null. */
export async function rollDialog(actor, stat, defaults = {}) {
  const perks = actor.items.filter(i => i.type === 'perk');
  const hustle = Number(actor.system.resources?.hustle?.value ?? 0);
  const content = `<div class="smoke-roll-dialog">
    <label>Difficulty <select name="band"><option value="">— no target —</option>${Object.entries(BAND_LABEL).map(([k, v]) => `<option value="${k}" ${defaults.band === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>…or Target Number <input type="number" name="tn" value="${defaults.tn ?? ''}" placeholder="auto"></label>
    <label>Modifier <input type="number" name="modifier" value="${defaults.modifier ?? 0}"></label>
    <label>Hustle (${hustle} left) <select name="hustle"><option value="0">none</option><option value="1" ${hustle < 1 ? 'disabled' : ''}>1 — Effort die up a step</option><option value="2" ${hustle < 2 ? 'disabled' : ''}>2 — On a Roll</option></select></label>
    ${perks.length ? `<label>Perk <select name="perk"><option value="">none</option>${perks.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : ''}
  </div>`;
  const form = await foundry.applications.api.DialogV2.input({window: {title: `${actor.name}: ${STATS[stat].label}`}, content, ok: {label: 'Roll', icon: 'fa-solid fa-dice'}});
  if (!form) return null;
  return rollStat(actor, stat, {...defaults, band: form.band || null, tn: form.tn === '' || form.tn == null ? null : Number(form.tn), modifier: Number(form.modifier || 0), hustle: Number(form.hustle || 0), perk: form.perk || null});
}
