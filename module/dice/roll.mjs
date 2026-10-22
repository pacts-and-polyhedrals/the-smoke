// Rolling: the Covenant roll from a character's sheet, with London's extras — the vehicle's Performance die
// behind the wheel, Hustle, Conditions, and a chat card the job minigames can read back.
import {NS, STATS, STAT_KEYS} from '../config.mjs';
import {buildFormula, countExplosions} from './formula.mjs';
import {outcomeFromMargin, blinderTier, isSuccess, damageValue, damageConsequences} from '../rules/core.mjs';
import {statPenalty, offGameFor, blocksEffortExplosion} from '../rules/conditions.mjs';
import {suggestTN, successChance} from '../rules/difficulty.mjs';
import {driverContext,seatInfo,isExposedSeat} from '../vehicles/vehicle-abilities.mjs';
import {cannotDrive} from '../rules/conditions.mjs';
import {isLeader, registerHandler, request} from '../world/net.mjs';
import {tierOf} from '../rules/advancement.mjs';

const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
const BAND_LABEL = {easy: 'Easy', medium: 'Medium', hard: 'Hard', miracle: 'Long Shot'};

/** Everything that goes into one roll, without rolling: used by the roll and by the dialog preview. */
export function prepareRoll(actor, stat, options = {}) {
  stat = String(stat).toLowerCase();
  if (!STAT_KEYS.includes(stat)) throw new Error(`Unknown stat ${stat}`);
  const conditions = new Set(actor.items.filter(i => i.type === 'condition').map(i => i.name));
  const notes = [];
  if((actor.system.states?.down||conditions.has('Down')) && options.context?.kind!=='stayUp' && options.label!=='Stay Conscious')throw new Error('Down characters can only roll to stay conscious until helped.');
  let effortDie = Number(options.effortDie || 6), modifier = Number(options.modifier || 0);
  let effortUpgrades = Number(options.effortUpgrades || 0), statUpgrades = Number(options.statUpgrades || 0);
  let onARoll = options.onARoll ?? Boolean(actor.system.states?.onARoll);
  let offGame = options.offGame ?? Boolean(actor.system.states?.offGame);
  // Behind the wheel: the vehicle's Performance die is the Effort die.
  const drive = stat === 'whl' && options.vehicle !== false ? driverContext(actor, options) : null;
  if(drive?.destroyed)throw new Error('This vehicle is written off and cannot be driven.');
  if (drive && cannotDrive(conditions))throw new Error('You cannot drive while Cuffed or Down.');
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
  let perk = options.perk ? (actor.items.get(options.perk) ?? actor.items.find(i => i.type === 'perk' && i.name === options.perk)) : null;
  if (perk && (perk.type!=='perk' || (perk.system.stat && perk.system.stat!==stat)))perk=null;
  if (perk) notes.push(`Perk: ${perk.name}`);
  const state = onARoll && !offGame ? 'onARoll' : offGame && !onARoll ? 'offGame' : 'normal';
  const built = buildFormula({
    effortDie, statDie: Number(actor.system.stats?.[stat]?.die ?? 4), stage: tierOf(actor.system.stage ?? 1), state,   // the Rep tier is the Covenant Stage
    modifier, perkApplies: Boolean(perk), statUpgrades, effortUpgrades: Math.max(0, effortUpgrades), effortDowngrades: Math.max(0, -effortUpgrades),
    noEffortExplosion: blocksEffortExplosion(conditions)
  });
  let tn = options.tn === '' || options.tn == null ? null : Number(options.tn);
  let band = options.band || null;
  if (tn == null && band) tn = suggestTN({attributeDie:Number(actor.system.stats?.[stat]?.die??4), effortDie:drive?.perfDie??Number(options.effortDie||6)}, band).tn;
  const chance = tn == null ? null : successChance({attributeDie: built.statDie, effortDie: built.effortDie, modifier: built.staticModifier - built.statModifier, state, noEffortExplosion:blocksEffortExplosion(conditions)}, tn);
  return {stat, built, tn, band, chance, notes, hustle:hustle+Number(perk?.system.hustleCost||0), perk, drive, state};
}

const rollQueues=new Map();
export function rollStat(actor,stat,options={}){
 if (!isLeader()) return remoteRoll('dice.stat', actor, {stat, options});
 const key=actor.uuid;const next=(rollQueues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>rollStatNow(actor,stat,options));rollQueues.set(key,next);
 void next.finally(()=>{if(rollQueues.get(key)===next)rollQueues.delete(key);}).catch(()=>{});return next;
}
async function rollStatNow(actor, stat, options = {}) {
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
                  explosions, blinder: blinder.key, label, context: options.context ?? null, formula: prep.built.formula, userId: options.requestedBy ?? game.user.id};
  const content = rollCard({actor, label, prep, roll, result, outcome, blinder, extra: options.cardExtra || ''});
  const message = await ChatMessage.implementation.create({
    speaker: ChatMessage.getSpeaker({actor}), content, rolls: [roll],
    flags: {[NS]: {roll: result}}, ...(options.whisper ? {whisper: options.whisper} : {})
  });
  if (options.consumeState !== false) {
    const up = {};
    if (actor.system.states?.onARoll ) up['system.states.onARoll'] = false;
    if (actor.system.states?.offGame ) up['system.states.offGame'] = false;
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
const attackQueues=new Map();
export function rollAttack(actor,weapon,targetToken=null,options={}){
 if (!isLeader()) return remoteRoll('dice.attack', actor, {weaponId:weapon?.id ?? null,targetUuid:targetToken?.uuid ?? null,options});
 const key=actor.uuid,next=(attackQueues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>rollAttackNow(actor,weapon,targetToken,options));attackQueues.set(key,next);
 void next.finally(()=>{if(attackQueues.get(key)===next)attackQueues.delete(key);}).catch(()=>{});return next;
}
async function rollAttackNow(actor, weapon, targetToken = null, options = {}) {
  if(!actor.isOwner && !game.user.isGM)throw new Error('Not your character.');
  const target = targetToken?.actor ?? null;
  if(!target){ui.notifications.warn('Target a person or vehicle first: hover their token and press T.');return null;}
  if(weapon && !weapon.system.equipped)throw new Error('Equip the weapon first.');
  const scene=(options.sceneId&&game.scenes.get(options.sceneId))||canvas?.scene;
  const me=actor.token??scene?.tokens.find(t=>t.actorId===actor.id&&(!options.tokenId||t.id===options.tokenId)),seat=me&&seatInfo(me);
  if(seat?.vehicle && !isExposedSeat(seat.vehicle,seat.seatId) && seat.vehicle.getFlag(NS,'vehicleAbilities')?.some(a=>a.key==='windowless'&&(!a.seats||a.seats.includes(seat.seatId))))throw new Error('You cannot attack out of a windowless load bay.');
  if(weapon?.system?.ammo?.max>0 && weapon.system.ammo.value<1)throw new Error('Empty magazine. Reload from the sheet.');
  if(me&&targetToken.parent?.id===me.parent?.id&&(!weapon||weapon.system.range==='Engaged')){
    const g=me.parent.grid.size,ax=me.x+me.width*g/2,ay=me.y+me.height*g/2,bx=targetToken.x+targetToken.width*g/2,by=targetToken.y+targetToken.height*g/2;
    if(Math.hypot(ax-bx,ay-by)>g*2.2)throw new Error('Move next to the target for a hand-to-hand attack.');
  }
  const cover=seatInfo(targetToken);const coverBonus=cover&&!isExposedSeat(cover.vehicle,cover.seatId)?2:0;
  const guard = Number(target.type === 'vehicle' ? 6 + Number(target.system.vehicle.size || 0) * 2 : target.system.guard?.value ?? 9)+coverBonus;
  const stat = weapon?.system?.stat || 'mus';
  const prepared = prepareRoll(actor, stat, {...options, tn:guard});
  if (prepared.hustle > Number(actor.system.resources.hustle.value)) { ui.notifications.warn('Not enough Hustle for that attack.'); return null; }
  const out = await rollStat(actor, stat, {...options, tn: guard, label: `${weapon?.name || 'Unarmed'} → ${target.name}`, context: {kind: 'attack', weaponId: weapon?.id, target: targetToken.uuid}});
  if(out&&weapon?.system?.ammo?.max>0)await weapon.update({'system.ammo.value':weapon.system.ammo.value-1});
  if (!out || out.result.margin < 0) return out;
  const armour = target.type === 'vehicle' ? Number(target.system.vehicle.armour || 0) : Number(target.system.armour || 0);
  const dmg = damageValue({margin: out.result.margin, impact: Number(weapon?.system?.impact ?? 1), armour});
  const cons = damageConsequences(dmg, {explosions: out.result.explosions});
  const attack={target:targetToken.uuid,total:out.result.total,damage:dmg,attacker:actor.uuid,attackerName:actor.name,severity:cons.label,conditions:[...new Set([...cons.conditions,...cons.breakthrough])]};
  const html = `<section class="smoke-card damage"><header><span class="kicker">HIT · DAMAGE</span><strong>${esc(target.name)}: ${dmg}</strong></header>
    <p>${esc(cons.label)}. Damage = margin ${out.result.margin} + Impact ${weapon?.system?.impact??1} − Armour ${armour}.</p>
    <div class="smoke-buttons"><button type="button" data-smoke-damage="${esc(targetToken.uuid)}" data-amount="${dmg}">Take hit · ${dmg} damage</button>
    ${target.type!=='vehicle'&&!target.system.states.reactionUsed?`<button type="button" data-smoke-dodge="${esc(targetToken.uuid)}">Dodge · use reaction</button>`:''}</div>
    ${target.type !== 'vehicle' && cons.conditions.length ? `<p class="smoke-dim">GM: choose one fitting condition if the fiction warrants it.</p>${[...new Set([...cons.conditions,...cons.breakthrough])].map(c => `<button type="button" data-smoke-condition="${esc(targetToken.uuid)}" data-condition="${esc(c)}">${esc(c)}</button>`).join('')}` : ''}
    ${weapon?.system?.crime ? `<button type="button" class="gm" data-smoke-crime="${esc(actor.uuid)}" data-crime="${esc(target.system.role === 'police' ? 'assaultCop' : weapon.system.crime)}">Witnessed: add Heat</button>` : ''}
  </section>`;
  await ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor}), content: html,flags:{[NS]:{attack}}});
  return out;
}

async function remoteRoll(type, actor, data) {
  // Keep the token the caller named (a driver in a particular seat); only fill in what is missing.
  const named=data.options?.sceneId&&data.options?.tokenId;
  const token=named?null:actor.token??canvas?.tokens?.controlled?.find?.(t=>t.actor?.id===actor.id)?.document??canvas?.scene?.tokens.find(t=>t.actorId===actor.id);
  data.options={...data.options,sceneId:data.options?.sceneId??token?.parent?.id??canvas?.scene?.id,tokenId:data.options?.tokenId??token?.id};
  const response = await request(type, {actorUuid:actor.uuid, ...data});
  return response ? {result:response.result, message:game.messages.get(response.messageId) ?? {id:response.messageId}, roll:null} : null;
}
async function authorizedActor(actorUuid, userId) {
  const doc = await fromUuid(actorUuid), actor = doc?.actor ?? doc, user = game.users.get(userId);
  if (!actor?.isPerson || !user || (!user.isGM && !actor.testUserPermission(user, 'OWNER'))) throw new Error('Roll from your own character.');
  return actor;
}
const rollReply = out => out ? {messageId:out.message.id, result:out.result} : null;
/** Only the escaped notes list the Combat Console sends may ride along in a GM-authored roll card. */
const SAFE_EXTRA = /^<ul class="smoke-notes">(<li>[^<>]*<\/li>)*<\/ul>$/;
/** Options a player's client may set on a roll the leader makes for them. Card HTML, whispers and state handling stay
 * the leader's; anything else is dropped. */
export function remoteRollOptions(options = {}, userId = null) {
  const o = options && typeof options === 'object' ? options : {};
  const out = {};
  for (const k of ['band', 'tn', 'label', 'modifier', 'hustle', 'perk', 'effortDie', 'effortUpgrades', 'statUpgrades', 'vehicle', 'sceneId', 'tokenId', 'context', 'fixedTarget'])
    if (o[k] !== undefined) out[k] = o[k];
  if (out.label != null) out.label = String(out.label).slice(0, 200);
  if (typeof o.cardExtra === 'string' && SAFE_EXTRA.test(o.cardExtra)) out.cardExtra = o.cardExtra;
  // A second GM's client (not the leader) may still whisper its rolls or keep On a Roll / Off Your Game.
  if (game.users?.get?.(userId)?.isGM) { if (Array.isArray(o.whisper)) out.whisper = o.whisper.map(String); if (o.consumeState === false) out.consumeState = false; }
  out.requestedBy = userId;
  return out;
}
/** Tell the player (not the GM's screen) when their Hustle won't cover the roll. */
function checkHustle(actor, stat, options) {
  const need = prepareRoll(actor, stat, options).hustle;
  const have = Number(actor.system.resources?.hustle?.value ?? 0);
  if (need > have) throw new Error(`${actor.name} has only ${have} Hustle.`);
}
registerHandler('dice.stat', async ({actorUuid, stat, options={}, userId}) => {
  const actor = await authorizedActor(actorUuid,userId), opts = remoteRollOptions(options, userId);
  checkHustle(actor, stat, opts);
  return rollReply(await rollStat(actor,stat,opts));
});
registerHandler('dice.attack', async ({actorUuid, weaponId, targetUuid, options={}, userId}) => {
  const actor = await authorizedActor(actorUuid,userId), weapon = weaponId ? actor.items.get(weaponId) : null;
  if (weaponId && weapon?.type !== 'weapon') throw new Error('Weapon not found on this character.');
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  return rollReply(await rollAttack(actor,weapon,target,remoteRollOptions(options, userId)));
});

/** Roll dialog: band or TN, Hustle, Perk, modifier. Returns the rollStat promise or null. */
export async function rollDialog(actor, stat, defaults = {}) {
  const perks = actor.items.filter(i => i.type === 'perk'&&(!i.system.stat||i.system.stat===stat));
  const hustle = Number(actor.system.resources?.hustle?.value ?? 0);
  const fixed=Boolean(defaults.context?.callId||defaults.fixedTarget);
  const content = `<div class="the-smoke smoke-roll-dialog"><p>The target is set before Hustle and perks. Their bonuses improve your chances.</p>
    <label>Difficulty <select name="band" ${fixed?'disabled':''}><option value="">— no target —</option>${Object.entries(BAND_LABEL).map(([k, v]) => `<option value="${k}" ${defaults.band === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>…or Target Number <input type="number" name="tn" value="${esc(defaults.tn ?? '')}" placeholder="auto" ${fixed?'disabled':''}></label>
    <label>Modifier <input type="number" name="modifier" value="${esc(defaults.modifier ?? 0)}"></label>
    <label>Hustle (${hustle} left) <select name="hustle"><option value="0">none</option><option value="1" ${hustle < 1 ? 'disabled' : ''}>1 — Effort die up a step</option><option value="2" ${hustle < 2 ? 'disabled' : ''}>2 — On a Roll</option></select></label>
    ${perks.length ? `<label>Perk <select name="perk"><option value="">none</option>${perks.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : ''}
  </div>`;
  const form = await foundry.applications.api.DialogV2.input({window: {title: `${actor.name}: ${STATS[stat].label}`}, content, ok: {label: 'Roll', icon: 'fa-solid fa-dice'}});
  if (!form) return null;
  return rollStat(actor, stat, {...defaults, band: fixed?(defaults.band||null):(form.band||null), tn:fixed?(defaults.tn??null):(form.tn === '' || form.tn == null ? null : Number(form.tn)), modifier: Number(form.modifier || 0), hustle: Number(form.hustle || 0), perk: form.perk || null});
}
