// Incidents behind the wheel: the chase movement gauge (green / yellow / red) and the driving checks it calls for, the
// evasive manoeuvre when a player's vehicle drives over another vehicle, collisions and losing control, the incident
// log on each vehicle, and fire: a vehicle at 0 Body burns until the end of the next round (or a few seconds outside a
// fight) and then goes up, with anyone still inside. Everything that writes runs on the leader GM.
import {NS} from '../config.mjs';
import * as D from '../rules/driving.mjs';
import {suggestTN} from '../rules/difficulty.mjs';
import {buildFormula} from '../dice/formula.mjs';
import {outcomeFromMargin, isSuccess} from '../rules/core.mjs';
import {isLeader, registerHandler, card, esc, ownersOf} from './net.mjs';
import {tokenCentre, distanceSquares} from './spawn.mjs';
import {MOVE_GATES, MOVE_WATCHERS, settlingMoves, exitAllFromVehicle, moveVehicle} from '../vehicles/vehicle-boarding.mjs';
import {combatOn, chaseOf, stateOf, actionKey, vehiclesGo, ridersOf, pilotOf, tallyOf} from './chase-state.mjs';
import {recordJourney} from '../vehicles/travel-meter.mjs';

const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const isVehicle = t => t?.actor?.type === 'vehicle';
const vdata = vt => vt?.actor?.system?.vehicle ?? {};
const sizeOf = vt => Number(vdata(vt).size ?? 2);
const riderTokens = vt => ridersOf(vt).map(o => vt.parent.tokens.get(o.tokenId)).filter(t => t?.actor);
const setting = (k, fallback) => { try { return game.settings.get(NS, k) ?? fallback; } catch (_e) { return fallback; } };
// A manually controlled player-owned vehicle still has a driver for incident rolls before boarding is reconciled.
export function incidentDriver(vt, user = null) {
  const pilot = pilotOf(vt); if (pilot?.actor?.type === 'character') return pilot;
  if (!vt?.actor?.hasPlayerOwner && user?.isGM !== false) return null;
  const owners = game.users.filter(u => !u.isGM && vt.actor?.testUserPermission?.(u, 'OWNER'));
  const player = user && !user.isGM ? user : owners[0];
  const a = player?.character;
  return vt.parent.tokens.find(t => t.actor?.type === 'character' && (a ? t.actorId === a.id : player && t.actor.testUserPermission?.(player, 'OWNER'))) ?? null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ bodies on the map */
/** A vehicle token as a collision body (px). */
export function bodyOfToken(t) {
  const g = t.parent?.grid?.size || 100, [x, y] = tokenCentre(t);
  return D.vehicleBody({id: t.id, x, y, w: Number(t.width || 2) * g, h: Number(t.height || 3) * g, rotation: Number(t.rotation) || 0});
}
const halfWidth = t => Math.min(Number(t.width || 2), Number(t.height || 3)) * (t.parent?.grid?.size || 100) / 2;
/** Everything a moving vehicle could drive over: other vehicles on the ground. */
function vehicleBodies(scene, exceptId) {
  return scene.tokens.filter(t => t.id !== exceptId && isVehicle(t) && !t.hidden && Number(t.elevation || 0) < 5).map(bodyOfToken);
}
const policeNear = (scene, t, sq = 14) => scene.tokens.some(u => u.id !== t.id && (u.getFlag(NS, 'police') || u.actor?.system?.role === 'police') && distanceSquares(u, t) <= sq);
const witnessesNear = (scene, t) => scene.tokens.some(u => u.id !== t.id && u.actor?.type === 'npc' && !u.hidden && distanceSquares(u, t) <= 12);

/* ------------------------------------------------------------------ the incident log */
/** Add a line to a vehicle's incident log (kept on the vehicle, shown on its sheet). */
export async function logIncident(vt, entry) {
  const a = vt?.actor; if (!a) return;
  const list = [...(a.getFlag(NS, 'incidents') || []), {at: Date.now(), scene: vt.parent?.name ?? '', ...entry}].slice(-40);
  try { await a.setFlag(NS, 'incidents', list); } catch (error) { console.warn('The Smoke | incident log', error); }
}

/* ------------------------------------------------------------------ NPC drivers roll for themselves */
/** A driving roll for a driver nobody at the table plays: crew die + Performance die + Handling against a band or TN. */
export async function npcRoll({name = 'Driver', die = 6, perfDie = 6, handling = 0, band = 'medium', tn = null, label = 'Driving', whisper = null} = {}) {
  const built = buildFormula({effortDie: Number(perfDie) || 6, statDie: Number(die) || 6, modifier: Number(handling) || 0});
  const target = tn ?? suggestTN({attributeDie: Number(die) || 6, effortDie: Number(perfDie) || 6}, band).tn;
  const roll = await new Roll(built.formula).evaluate();
  const margin = Number(roll.total) - target, outcome = outcomeFromMargin(margin), ok = isSuccess(outcome.key);
  try {
    await ChatMessage.implementation.create({speaker: {alias: name}, rolls: [roll], ...(whisper ? {whisper} : {}),
      content: `<section class="smoke-card roll ${ok ? 'win' : 'lose'}"><header><span class="kicker">NPC · d${built.effortDie} + d${built.statDie}${built.staticModifier >= 0 ? '+' : ''}${built.staticModifier}</span><strong>${esc(label)}</strong></header>
        <div class="smoke-total"><span class="num">${roll.total}</span><div class="smoke-tn">vs <b>${target}</b></div></div>
        <div class="smoke-outcome ${outcome.key}">${esc(outcome.label)}<small>margin ${margin >= 0 ? '+' : ''}${margin}</small></div></section>`});
  } catch (error) { console.warn('The Smoke | NPC roll card', error); }
  return {total: Number(roll.total), tn: target, margin, outcomeKey: outcome.key, success: ok};
}
/** The NPC roll for a vehicle with nobody from the table at the wheel. */
export function npcDriveRoll(vt, {band = 'medium', tn = null, label = 'Driving', penalty = 0} = {}) {
  const v = vdata(vt), police = Boolean(vt.getFlag(NS, 'police'));
  const flats = Math.max(0, Number(v.flats || 0)), ladder = [4, 6, 8, 10, 12, 20];
  const perf = ladder[Math.max(0, ladder.indexOf(Number(v.perfDie || 6)) - flats)] ?? 4;
  return npcRoll({name: vt.name, die: D.crewDie(v, {police}), perfDie: perf, handling: Number(v.handling || 0) - 2 * flats + Number(penalty || 0), band, tn, label});
}

/* ------------------------------------------------------------------ prompts: driving checks and evasive manoeuvres */
const promptsOf = vt => ({...(vt?.getFlag?.(NS, 'prompts') || {})});
/** Checks still waiting on a response. They never expire because of elapsed time. */
export function openPrompts(vt) { return Object.entries(promptsOf(vt)).map(([pid, p]) => ({pid, ...p})); }
const DRIVING_CHECKS = new Set(['driveCheck', 'evade', 'pitSave', 'ramSave']);
const OUTCOMES = new Set(['severeFailure', 'costlyFailure', 'narrowSuccess', 'fullSuccess', 'strongSuccess', 'exceptionalSuccess']);
/** Foundry merges objects: writing prompts:{} does NOT delete an existing prompt. */
async function finishPrompt(vt, pid, prompt) {
  if (promptsOf(vt)[pid]) await vt.update({[`flags.${NS}.prompts.-=${pid}`]: null}, {acVehicleCarry: true});
  const message = prompt?.messageId && game.messages.get(prompt.messageId);
  if (message) await message.setFlag(NS, 'promptDone', true).catch(error => console.warn('The Smoke | driving card completion', error));
}
const bandWord = {easy: 'Easy', medium: 'Medium', hard: 'Hard', miracle: 'Long Shot'};
/**
 * Ask for a Wheels roll in the chat: the driver's player rolls it from the card; a driver nobody plays rolls at once.
 * kind: 'driveCheck' (pushing into yellow / red), 'evade' (about to hit something), 'pitSave' (being spun).
 */
export async function promptCheck(vt, {kind, band = 'yellow', difficulty = null, other = null, impact = null, damage = null, label = '', why = '', user = null, at = null}) {
  const pilot = incidentDriver(vt, user), pid = foundry.utils.randomID(), diff = difficulty ?? (kind === 'evade' ? D.evadeBand(band) : D.bandCheck(band) ?? 'medium');
  // `at`: where the vehicle was left by the move that raised the check. A crash only stops it dead there if it hasn't
  // been driven on since (a card rolled later, out on the street, must not teleport it back).
  const ctx = {kind, pid, vt: vt.uuid, band, other: other?.uuid ?? null, impact, damage, key: actionKey(chaseOf(vt.parent)), at: at ?? [Number(vt.x), Number(vt.y)]};
  const title = label || (kind === 'evade' ? `Evasive manoeuvre: ${other?.name ?? 'something'} dead ahead` : kind === 'pitSave' ? 'Hold it straight' : `${D.BAND_INFO[band]?.label ?? band}: ${D.BAND_INFO[band]?.short ?? ''}`);
  if (!pilot?.actor || pilot.actor.type !== 'character') {
    const r = await npcDriveRoll(vt, {band: diff, label: `${vt.name}: ${title}`, penalty: kind === 'driveCheck' ? 0 : D.bandPenalty(tallyOf(vt, ctx.key).band)});
    return resolve({...ctx, outcomeKey: r.outcomeKey, margin: r.margin, driver: vt.name});
  }
  const automatic = kind === 'evade' && setting('autoEvade', true);
  if (automatic) ctx.automatic = true;
  await vt.update({[`flags.${NS}.prompts.${pid}`]: {kind, at: Date.now(), band, context: ctx, actorUuid: pilot.actor.uuid}}, {acVehicleCarry: true});
  if (automatic) {
    let out;
    try {
      const seated = pilotOf(vt)?.id === pilot.id;
      out = await pilot.actor.rollStat('whl', {band: diff, label: `${vt.name}: ${title}`, sceneId: vt.parent.id, tokenId: pilot.id, context: ctx, ...(seated ? {} : {vehicle: false, effortDie: Number(vdata(vt).perfDie || 6), modifier: Number(vdata(vt).handling || 0) + D.bandPenalty(band)})});
    } catch (error) { console.warn('The Smoke | automatic evasive roll; offering manual roll', error); }
    // A resolution/write error must never offer another roll after dice already landed.
    if (out?.result) return resolve({...ctx, fromChat: true, actorUuid: pilot.actor.uuid, outcomeKey: out.result.outcomeKey, margin: out.result.margin, driver: pilot.name, rollMessageId: out.message?.id});
    // If an automatic roll cannot be made, retain a usable manual card rather than silently skipping the incident.
    ctx.automatic = false;
    await vt.update({[`flags.${NS}.prompts.${pid}.context.automatic`]: false}, {acVehicleCarry: true});
  }
  const kicker = kind === 'evade' ? 'INCIDENT · EVASIVE' : kind === 'pitSave' ? 'INCIDENT · PIT' : `DRIVING · ${String(band).toUpperCase()}`;
  const msg = await card(kicker, `${vt.name}: ${title}`, `<p>${why}</p>
    <div class="smoke-buttons"><button type="button" class="hot" data-smoke-roll="${esc(pilot.actor.uuid)}" data-stat="whl" data-band="${diff}" data-label="${esc(title)}" data-context='${esc(JSON.stringify(ctx))}'><i class="fa-solid fa-car-burst"></i> ${kind === 'evade' ? 'Swerve' : 'Keep it on the road'}: Wheels (${bandWord[diff]})</button></div>
    <p class="smoke-dim">${esc(pilot.name)} rolls. Until then ${esc(vt.name)} can't move again.</p>`, `drive ${kind === 'driveCheck' ? `band-${band}` : 'incident'}`);
  if (!promptsOf(vt)[pid]) return null;
  await vt.update({[`flags.${NS}.prompts.${pid}.messageId`]: msg?.id ?? null}, {acVehicleCarry: true});
  return null;
}
/** A prompt's roll came in (or an NPC rolled): what happens. Runs on the leader. */
const resolving = new Map();
async function resolve(ctx) {
  const vt = await fromUuid(ctx.vt); if (!vt) return;
  const tag = `${vt.uuid}:${ctx.pid}`; if (resolving.has(tag)) return resolving.get(tag);
  const prompt = ctx.fromChat ? promptsOf(vt)[ctx.pid] : null;
  if (ctx.fromChat && !prompt) return;
  if (ctx.fromChat && ctx.actorUuid && prompt.actorUuid && ctx.actorUuid !== prompt.actorUuid) return;
  if (!OUTCOMES.has(ctx.outcomeKey) || !DRIVING_CHECKS.has(ctx.kind)) return;
  if (prompt?.context) ctx = {...prompt.context, fromChat: true, outcomeKey: ctx.outcomeKey, margin: ctx.margin, driver: ctx.driver, rollMessageId: ctx.rollMessageId};
  const task = (async () => {
    // If only the deletion failed, finish the saved outcome without repeating damage.
    if (prompt?.status === 'resolved') return finishPrompt(vt, ctx.pid, prompt);
    if (prompt?.result) throw new Error(`${vt.name}: this check was already rolled; the saved roll awaits GM review; never roll again.`);
    if (prompt) await vt.update({[`flags.${NS}.prompts.${ctx.pid}.result`]: {outcomeKey: ctx.outcomeKey, margin: ctx.margin ?? null, driver: ctx.driver ?? '', messageId: ctx.rollMessageId ?? null}, [`flags.${NS}.prompts.${ctx.pid}.status`]: 'resolving'}, {acVehicleCarry: true});
    let result;
    try { result = await resolveOutcome(vt, ctx); }
    catch (error) {
      if (prompt && promptsOf(vt)[ctx.pid]) await vt.update({[`flags.${NS}.prompts.${ctx.pid}.status`]: 'review', [`flags.${NS}.prompts.${ctx.pid}.error`]: error.message}, {acVehicleCarry: true});
      throw error;
    }
    if (prompt) {
      if (promptsOf(vt)[ctx.pid]) await vt.update({[`flags.${NS}.prompts.${ctx.pid}.status`]: 'resolved'}, {acVehicleCarry: true});
      await finishPrompt(vt, ctx.pid, prompt);
    }
    return result;
  })();
  resolving.set(tag, task);
  try { return await task; } finally { resolving.delete(tag); }
}

/** Repair pre-0.5.3 completed checks on GM login. Never reroll or replay their damage.
 * Unanswered checks, unrelated Wheels rolls and partially-applied new outcomes stay gated. */
export async function recoverCompletedPrompts({scene = null, notify = true} = {}) {
  if (!isLeader() || !game.user.isGM) throw new Error('The active GM repairs completed driving checks.');
  const messages = game.messages?.contents ?? (game.messages?.[Symbol.iterator] ? [...game.messages] : []);
  let repaired = 0;
  for (const s of scene ? [scene] : game.scenes ?? []) for (const vt of s.tokens ?? []) {
    for (const {pid, ...prompt} of openPrompts(vt)) {
      if (resolving.has(`${vt.uuid}:${pid}`)) continue;
      const source = prompt.messageId && game.messages.get(prompt.messageId);
      const roll = messages.find(m => {
        const r = m.getFlag?.(NS, 'roll'), c = r?.context;
        return r?.stat === 'whl' && OUTCOMES.has(r.outcomeKey) && c?.pid === pid && c.vt === vt.uuid && c.kind === prompt.kind && (!prompt.actorUuid || r.actorUuid === prompt.actorUuid);
      });
      // A saved roll is NOT proof that collision damage or control loss was applied.
      // Only confirmed completion can be cleaned up automatically. Otherwise keep it for GM review.
      if (prompt.status==='resolved'||source?.getFlag(NS,'promptDone')){
        await finishPrompt(vt,pid,prompt);repaired++;continue;
      }
      if(roll&&!prompt.result){
        await vt.update({[`flags.${NS}.prompts.${pid}.result`]:{outcomeKey:roll.getFlag(NS,'roll')?.outcomeKey,
          margin:roll.getFlag(NS,'roll')?.margin,messageId:roll.id,driver:roll.getFlag(NS,'roll')?.actorName??''},
          [`flags.${NS}.prompts.${pid}.status`]:'review',
          [`flags.${NS}.prompts.${pid}.error`]:'Recorded dice found after reconnect; GM must verify whether effects were applied.'},{acVehicleCarry:true});
      }

    }
  }
  if (repaired && notify) ui.notifications.info(`The Smoke: recovered ${repaired} completed driving check(s). Existing rolls and damage were kept; no reroll needed.`);
  return repaired;
}
async function resolveOutcome(vt, ctx) {
  const key = ctx.key, tally = tallyOf(vt, key);
  if (ctx.kind === 'ramSave') {
    const other = ctx.other && await fromUuid(ctx.other);
    if (isSuccess(ctx.outcomeKey)) return card('RAM EVADED', `${vt.name} swerves clear`, '<p>The police ram misses. No damage.</p>', 'win');
    const dmg = ctx.damage || {target: 0, self: 0};
    await logIncident(vt, {kind: 'rammed', label: `Rammed by ${other?.name ?? 'the police'}`, body: dmg.target, against: other?.name});
    if (other) await logIncident(other, {kind: 'ram', label: `Rammed ${vt.name}`, body: dmg.self, against: vt.name});
    await shakeRiders(vt, 1);
    if (dmg.target) await vt.actor.applyDamage(dmg.target);
    if (other && dmg.self) await other.actor.applyDamage(dmg.self);
    return card('RAM', `${other?.name ?? 'Police'} rams ${vt.name}`, `<p>${esc(vt.name)} −${Number(dmg.target)} Body; everyone inside −1. ${esc(other?.name ?? 'The unit')} −${Number(dmg.self)} Body.</p>`, 'damage');
  }
  if (ctx.kind === 'driveCheck') {
    const res = D.lossOfControl({band: ctx.band, outcomeKey: ctx.outcomeKey, size: sizeOf(vt)});
    if (!res.incident) return card('DRIVING', `${vt.name} keeps it together`, `<p>${ctx.band === 'red' ? 'On the limit and holding it.' : 'Pushing it, but in control.'} Handling ${D.bandPenalty(ctx.band)} for the rest of the action.</p>`, 'drive win');
    return lostControl(vt, res, {key, driver: ctx.driver});
  }
  if (ctx.kind === 'pitSave') {
    const ok = isSuccess(ctx.outcomeKey);
    if (ok) return card('PIT', `${vt.name} holds it straight`, '<p>A shunt, a wobble, and it keeps going.</p>', 'drive win');
    const res = D.lossOfControl({band: 'yellow', outcomeKey: 'severeFailure', size: sizeOf(vt)});
    await lostControl(vt, {...res, label: 'Spun round by a PIT manoeuvre'}, {key, driver: ctx.driver});
    const {loseNextAction} = await import('./chase.mjs'); return loseNextAction(vt, 'spun round');
  }
  if (ctx.kind === 'evade') {
    const other = ctx.other ? await fromUuid(ctx.other) : null;
    const res = D.collisionResult({outcomeKey: ctx.outcomeKey, band: ctx.band, mySize: sizeOf(vt), theirSize: other ? sizeOf(other) : 2});
    return collide(vt, other, res, {impact: ctx.impact, key, driver: ctx.driver, at: ctx.at});
  }
}
/** Damage riders take, with any conditions. */
async function shakeRiders(vt, amount, conditions = []) {
  const out = [];
  for (const t of riderTokens(vt)) {
    if (!t.actor?.isPerson) continue;
    if (amount) await t.actor.applyDamage(amount);
    for (const c of conditions) await t.actor.addCondition(c);
    if (amount || conditions.length) out.push(`${t.name}${amount ? ` −${amount}` : ''}${conditions.length ? ` (${conditions.join(', ')})` : ''}`);
  }
  return out;
}
async function stopFor(vt, key) { if (key) await vt.update({[`flags.${NS}.drive`]: {...tallyOf(vt, key), stopped: true}}, {acVehicleCarry: true}); }
/** Lost it after a failed check: damage, riders thrown about, logged, and no more driving this action. */
export async function lostControl(vt, res, {key = null, driver = null} = {}) {
  await stopFor(vt, key);
  const riders = await shakeRiders(vt, res.riders, res.conditions);
  await logIncident(vt, {kind: res.kind, label: res.label, body: res.body, driver: driver ?? pilotOf(vt)?.name ?? ''});
  await card('INCIDENT', `${vt.name}: ${res.label}`, `<p>−${res.body} Body.${riders.length ? ` Inside: ${esc(riders.join('; '))}.` : ''}${key ? ' That\'s the end of this action.' : ''}</p>`, 'drive incident');
  if (res.body) await vt.actor.applyDamage(res.body);
  return res;
}
/** A collision (or a swerve that got away with it). */
export async function collide(vt, other, res, {impact = null, key = null, driver = null, at = null} = {}) {
  if (!res.hit) return card('INCIDENT', `${vt.name}: ${res.label}`, `<p>Missed the ${esc(other?.name ?? 'other vehicle')} by a coat of paint.</p>`, 'drive win');
  const scene = vt.parent, lines = [];
  const stillThere = !Array.isArray(at) || (Math.abs(Number(vt.x) - Number(at[0])) < 2 && Math.abs(Number(vt.y) - Number(at[1])) < 2);
  if (!res.scrape && impact && Number.isFinite(impact[0]) && stillThere) {
    const g = scene.grid.size;
    try { await moveVehicle(vt, {x: Math.round(impact[0] - vt.width * g / 2), y: Math.round(impact[1] - vt.height * g / 2)}, {free: true}); } catch (error) { console.warn('The Smoke | stop at the impact', error); }
  }
  if (res.stop || !res.scrape) await stopFor(vt, key);
  lines.push(...await shakeRiders(vt, res.riders, res.conditions));
  if (other) {
    lines.push(...await shakeRiders(other, res.riders ? Math.max(0, res.riders - 1) : 0, []));
    const f = other.getFlag(NS, 'traffic');
    if (f?.kind === 'moving') await other.update({[`flags.${NS}.stalledUntil`]: Date.now() + 20000}, {acVehicleCarry: true});   // hazards on, swearing
    await logIncident(other, {kind: 'hit', label: `Hit by ${vt.name}`, body: res.theirs, against: vt.name});
  }
  await logIncident(vt, {kind: res.scrape ? 'scrape' : 'collision', label: `${res.label}: ${other?.name ?? 'a vehicle'}`, body: res.mine, against: other?.name ?? '', driver: driver ?? pilotOf(vt)?.name ?? ''});
  await card('INCIDENT', `${vt.name}: ${res.label}${other ? ` — ${other.name}` : ''}`, `<p>${esc(vt.name)} −${res.mine} Body${other ? ` · ${esc(other.name)} −${res.theirs} Body` : ''}.${lines.length ? ` ${esc(lines.join('; '))}.` : ''}${res.scrape ? ' Carries on.' : ' Stopped dead.'}</p>`, 'drive incident');
  // a crash in front of the police or a crowd is dangerous driving; ploughing into a police car is worse
  const pilot = pilotOf(vt), a = pilot?.actor;
  if (a?.type === 'character' && !res.scrape) {
    const byPolice = policeNear(scene, vt), crime = other?.getFlag(NS, 'police') ? 'assaultCop' : 'dangerousDriving';
    if (byPolice || witnessesNear(scene, vt)) await a.reportCrime(crime, {witnessed: true, byPolice}).catch(() => null);
  }
  if (res.mine) await vt.actor.applyDamage(res.mine);
  if (other && res.theirs) await other.actor.applyDamage(res.theirs);
  return res;
}

/* ------------------------------------------------------------------ the gauge and turn order, on every move */
/** Before an occupied vehicle moves: in a chase it only goes on its own die, and never past the red line. */
/** Prompts that hold this vehicle: only checks raised in the chase now running on its map. Out on the street an
 * unanswered card (or one waiting for GM review) never strands the motor — it resolves whenever it is rolled. */
export function blockingPrompts(vt, scene = vt?.parent) {
  const combat = chaseOf(scene); if (!combat) return [];
  return openPrompts(vt).filter(p => !p.context?.key || String(p.context.key).startsWith(`${combat.id}:`));
}
function gateSync({vt, scene, user, transform, passengers={}, free}) {
  if (free) return transform;
  const open = blockingPrompts(vt, scene);
  if (open[0]?.status === 'review') throw new Error(`${vt.name}: the GM must review the recorded driving outcome; do not roll again.`);
  if (open.length) throw new Error(`${vt.name}: roll the ${open[0].kind === 'evade' ? 'evasive manoeuvre' : 'driving check'} in the chat first.`);
  const driver=(passengers?.pilot&&scene.tokens.get(passengers.pilot.tokenId))??incidentDriver(vt,user);
  const stop=driver?.getFlag(NS,'policeStop');
  if (stop) {
    if (stop.status !== 'escapeMove' || stop.mode !== 'vehicle' || stop.vehicleId !== vt.id) throw new Error('Resolve the police decision before moving.');
    // The escape drive goes now, whoever's die it is, as far as its squares allow (a longer drag stops at the limit).
    const x = Number(transform.x ?? vt.x), y = Number(transform.y ?? vt.y), dist = Math.hypot(x - vt.x, y - vt.y) / scene.grid.size;
    const left = Number(stop.max) - Number(stop.moved || 0);
    if (dist <= left + 0.25) return transform;
    if (left < 0.5) throw new Error(`${vt.name}: no squares left in this escape move.`);
    const k = Math.floor(left + 0.25) / dist;
    const note = `${vt.name} gets ${Math.floor(left + 0.25)} squares of escape: driven as far as that goes.`;
    game.socket.emit(`system.${NS}`, {type: 'smokeWorld.notify', data: {text: note, userIds: [user.id], level: 'info'}});
    if (user.id === game.user.id) ui.notifications.info(note);
    return {...transform, x: Math.round(vt.x + (x - vt.x) * k), y: Math.round(vt.y + (y - vt.y) * k)};
  }
  const combat = chaseOf(scene); if (!combat) return transform;
  const pilot = passengers?.pilot && scene.tokens.get(passengers.pilot.tokenId);
  const inIt = combat.combatants.some(c => c.tokenId === vt.id || (pilot && c.tokenId === pilot.id)); if (!inIt) return transform;
  const mine = vehiclesGo(combat, vt);
  if (!mine) { if (user.isGM) return transform; throw new Error(`${vt.name}: not your go. In a chase you drive on your own dice — wait for your turn in the Combat Console.`); }
  if (!Number.isFinite(Number(transform.x)) && !Number.isFinite(Number(transform.y))) return transform;
  const key = actionKey(combat), tally = tallyOf(vt, key);
  if (tally.stopped && !user.isGM) throw new Error(`${vt.name} has lost it this action. Wait for your next die.`);
  const g = scene.grid.size, bands = D.driveBands(vdata(vt));
  const x = Number(transform.x ?? vt.x), y = Number(transform.y ?? vt.y), dist = Math.hypot(x - vt.x, y - vt.y) / g;
  const left = bands.red - Number(tally.moved || 0);
  if (dist <= left + D.BAND_SLACK) return transform;
  if (left < 0.5) throw new Error(`${vt.name} is on the red line: nothing left this action.`);
  const k = left / dist;
  game.socket.emit(`system.${NS}`, {type: 'smokeWorld.notify', data: {text: `${vt.name}: that's past the red line. It gets ${Math.floor(left)} squares this action.`, userIds: [user.id], level: 'info'}});
  if (user.id === game.user.id) ui.notifications.info(`${vt.name}: that's past the red line. It gets ${Math.floor(left)} squares this action.`);
  return {...transform, x: Math.round(vt.x + (x - vt.x) * k), y: Math.round(vt.y + (y - vt.y) * k)};
}
/** Promise-shaped gate retained for MOVE_GATES and existing tests; native preUpdateToken calls the synchronous implementation. */
async function gate(args){return gateSync(args);}
/** After an occupied vehicle moves: count it on the gauge, ask for checks, and look for anything it drove over. */
async function watch({vt, scene, user, from, to, passengers, free}) {
  if (free) return;
  const moved = Math.hypot(to[0] - from[0], to[1] - from[1]) / scene.grid.size; if (moved < 0.2) return;
  const pilot = (passengers.pilot && scene.tokens.get(passengers.pilot.tokenId)) ?? incidentDriver(vt, user), pc = pilot?.actor?.type === 'character';
  const stop = pilot?.getFlag(NS, 'policeStop');
  const escape = stop?.status === 'escapeMove' && stop.mode === 'vehicle' && stop.vehicleId === vt.id;
  if (escape) {
    const used = Number(stop.moved || 0) + moved;
    await pilot.setFlag(NS, 'policeStop', {...stop, moved: used});
    // Every square used: the escape ends by itself once this move has settled.
    if (Number(stop.max) - used < 1) { const {finishEscapeWhenSettled} = await import('./pursuit.mjs'); finishEscapeWhenSettled(pilot); }
  }
  const combat = chaseOf(scene), key = !escape && combat && vehiclesGo(combat, vt) ? actionKey(combat) : null;
  const bands = D.driveBands(vdata(vt));
  let band = D.bandFor(moved, bands);
  if (key) {
    const tally = tallyOf(vt, key), total = Number(tally.moved || 0) + moved, before = tally.band;
    band = D.bandFor(total, bands); if (band === 'over') band = 'red';
    const due = D.bandRank(band) > D.bandRank(before) && ['yellow', 'red'].includes(band) && !tally.checked.includes(band);
    await recordJourney(vt,moved,{key,source:'player',tally:{...tally,key,moved:Math.round(total*100)/100,band:D.bandRank(band)>D.bandRank(before)?band:before,checked:due?[...tally.checked,band]:tally.checked}});
    if (due) await promptCheck(vt, {kind: 'driveCheck', band, user, why: `${esc(D.BAND_INFO[band].hint)} ${Math.round(total)} of ${bands.red} squares this action.`});
  }
  if(!key)await recordJourney(vt,moved,{source:pc?'player':'free-drive'});
  if (band === 'over') band = 'red';
  if (!pc) return;   // incidents are for vehicles driven by the players
  const hits = D.sweptHits(from, to, halfWidth(vt), vehicleBodies(scene, vt.id));
  if (!hits.length) return;
  const first = hits[0], other = scene.tokens.get(first.id), t0 = Math.max(0, first.t0 - 0.04);
  const impact = [from[0] + (to[0] - from[0]) * t0, from[1] + (to[1] - from[1]) * t0];
  const more = hits.length > 1 ? ` (and ${hits.length - 1} more in the way)` : '';
  const g = scene.grid.size, at = [to[0] - Number(vt.width) * g / 2, to[1] - Number(vt.height) * g / 2];   // where the move left it
  await promptCheck(vt, {kind: 'evade', band, other, impact, user, at, why: `${esc(vt.name)} is going straight over the ${esc(other?.name ?? 'vehicle')}${more}. Swerve: fail and it's a collision. ${band === 'green' ? '' : `At this speed (${D.BAND_INFO[band].label.toLowerCase()}) it's harder.`}`});
}

/* ------------------------------------------------------------------ fire */
/** A vehicle at 0 Body catches fire. In a fight it goes up at the end of the next round; otherwise in a few seconds. */
export async function ignite(vt) {
  if (!vt || vt.getFlag(NS, 'fire') || vdata(vt).destroyed || vt.getFlag(NS, 'burnt')) return;
  const combat = combatOn(vt.parent), st = stateOf(combat);
  const fire = {since: Date.now(), until: Date.now() + D.FIRE_SECONDS * 1000, combatId: combat?.id ?? null, round: combat ? Number(st.round || 0) : null};
  const up = {[`flags.${NS}.fire`]: fire, light: {dim: 4, bright: 1.5, color: '#ff6a00', alpha: 0.6, angle: 360, animation: {type: 'torch', speed: 6, intensity: 6}}};
  if (vt.getFlag(NS, 'traffic')?.kind === 'moving') up[`flags.${NS}.traffic.kind`] = 'wreck';
  await vt.update(up, {acVehicleCarry: true});
  await logIncident(vt, {kind: 'fire', label: 'Caught fire'});
  const riders = riderTokens(vt);
  await card('ON FIRE', `${vt.name} is on fire!`, `<p>Flames under the bonnet. ${combat ? 'It goes up at the <b>end of the next round</b>.' : `It goes up in about <b>${D.FIRE_SECONDS} seconds</b>.`} Anyone still inside goes up with it.</p>
    ${riders.length ? `<div class="smoke-buttons">${riders.map(t => `<button type="button" class="hot" data-smoke-exit="${esc(t.uuid)}"><i class="fa-solid fa-person-walking-arrow-right"></i> ${esc(t.name)}: get out!</button>`).join('')}</div>` : '<p class="smoke-dim">Nobody inside. Stand well back.</p>'}`, 'fire', {flags: {[NS]: {fireFor: vt.uuid}}});
}
/** Boom. Riders still inside take the worst of it; people and vehicles nearby get caught too. */
export async function explode(vt) {
  if (!vt?.parent || vt.getFlag(NS, 'burnt')) return;
  const scene = vt.parent, lines = [];
  await vt.update({[`flags.${NS}.fire`]: null, [`flags.${NS}.burnt`]: true, [`flags.${NS}.-=prompts`]: null, 'texture.tint': '#3d3a38',
    light: {dim: 14, bright: 7, color: '#ff8a1e', alpha: 0.85, angle: 360, animation: {type: 'torch', speed: 9, intensity: 9}}}, {acVehicleCarry: true});
  await vt.actor.update({'system.vehicle.body.value': 0, 'system.vehicle.destroyed': true});
  const inside = riderTokens(vt);
  for (const t of inside) {
    if (!t.actor?.isPerson) continue; const e = D.explosionDamage(0, {inside: true});
    await t.actor.applyDamage(e.damage); for (const c of e.conditions) await t.actor.addCondition(c);
    lines.push(`${t.name} (inside) −${e.damage}, ${e.conditions.join(', ')}`);
  }
  if (inside.length) await exitAllFromVehicle(vt, {keepDriver: false}).catch(error => console.warn('The Smoke | thrown clear', error));
  const near = scene.tokens.filter(t => t.id !== vt.id && t.actor && !t.getFlag(NS, 'vehicleSeat') && !inside.some(x => x.id === t.id));
  const hitVehicles = [];
  for (const t of near) {
    const veh = isVehicle(t), d = Math.max(0, distanceSquares(t, vt) - 1 - (veh ? 1 : 0)), e = D.explosionDamage(d, {vehicle: veh});
    if (!e.damage) continue;
    if (veh) { if (!vdata(t).destroyed) hitVehicles.push([t, e.damage]); continue; }
    if (!t.actor.isPerson) continue;
    await t.actor.applyDamage(e.damage); for (const c of e.conditions) await t.actor.addCondition(c);
    lines.push(`${t.name} −${e.damage}${e.conditions.length ? `, ${e.conditions.join(', ')}` : ''}`);
  }
  await logIncident(vt, {kind: 'explosion', label: 'Went up in flames. Burnt out.'});
  await card('BOOM', `${vt.name} explodes`, `<p class="smoke-passed">BOOM</p><p>A fireball, a pressure wave, glass everywhere. ${esc(vt.name)} is a burnt-out shell.</p>${lines.length ? `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p>Nobody caught in it.</p>'}`, 'fire boom');
  for (const [t, dmg] of hitVehicles) { await logIncident(t, {kind: 'blast', label: `Caught in the blast from ${vt.name}`, body: dmg}); await t.actor.applyDamage(dmg); }
  for (const c of game.combats ?? []) {
    const ids = c.combatants.filter(x => x.tokenId === vt.id && x.sceneId === scene.id).map(x => x.id);
    if (ids.length) await c.deleteEmbeddedDocuments('Combatant', ids).catch(() => null);
  }
  setTimeout(() => { if (vt.parent) vt.update({light: {dim: 3, bright: 0.6, color: '#ff5a00', alpha: 0.35, angle: 360, animation: {type: 'torch', speed: 3, intensity: 4}}}, {acVehicleCarry: true}).catch(() => null); }, 4000);
}
/** End of a round: anything that caught fire before this round goes up. */
export async function fireRoundEnd(combat, st) {
  const scene = combat?.scene; if (!scene) return;
  for (const t of scene.tokens.filter(x => x.getFlag(NS, 'fire'))) {
    const f = t.getFlag(NS, 'fire'); if (!f || t.getFlag(NS, 'burnt')) continue;   // already gone up (a blast next door)
    if (f.round == null || Number(st.round) >= Number(f.round) + 1 || f.combatId !== combat.id) await explode(t);
    else await card('ON FIRE', `${t.name} is burning`, '<p>Smoke pouring out. It goes up at the end of the next round. <b>Get out!</b></p>', 'fire');
  }
}

/* ------------------------------------------------------------------ requests and hooks */
registerHandler('drive.reviewPrompt',async({sceneId,tokenId,pid,userId})=>{
  const user=game.users.get(userId);if(!user?.isGM)throw new Error('Only the GM can certify an incident outcome.');
  const vt=game.scenes.get(sceneId)?.tokens.get(tokenId),prompt=promptsOf(vt)?.[pid];
  if(!vt||!prompt||!prompt.result)throw new Error('There is no saved roll to review.');
  if(prompt.status==='resolving'&&resolving.has(`${vt.uuid}:${pid}`))throw new Error('This result is still applying; review after its write finishes.');
  await card('GM INCIDENT REVIEW',`${vt.name}: ${prompt.kind}`,`<p>GM confirmed consequences manually using the saved roll <b>${esc(prompt.result.messageId??'automatic')}</b> (${esc(prompt.result.outcomeKey)}). No reroll or duplicate damage applied.</p>`,'drive',{whisper:gmIds()});
  await finishPrompt(vt,pid,prompt);
  return true;
});
registerHandler('drive.cancelPrompt',async({sceneId,tokenId,pid,userId})=>{
  if(!game.users.get(userId)?.isGM)throw new Error('GM only.');
  const vt=game.scenes.get(sceneId)?.tokens.get(tokenId),prompt=promptsOf(vt)?.[pid];
  if(!vt||!prompt||prompt.result)throw new Error('A saved result cannot be cancelled. Certify it after review.');
  const landed=(game.messages?.contents??[]).some(m=>m.getFlag?.(NS,'roll')?.context?.pid===pid);
  if(landed)throw new Error('A roll exists. Recover and review it; never discard rolled dice.');
  await card('GM CHECK CANCELLED',vt.name,`<p>GM cancelled an obsolete unrolled ${esc(prompt.kind)} prompt. No dice or effects were discarded.</p>`,'drive',{whisper:gmIds()});
  await finishPrompt(vt,pid,prompt);return true;
});
registerHandler('drive.recoverPrompt',async({sceneId,tokenId,pid,userId})=>{
  if(!game.users.get(userId)?.isGM)throw new Error('GM only.');
  const vt=game.scenes.get(sceneId)?.tokens.get(tokenId),prompt=promptsOf(vt)?.[pid];
  if(!vt||!prompt||prompt.status!=='resolved')throw new Error('Only fully resolved results can be cleaned up automatically.');
  await finishPrompt(vt,pid,prompt);return true;
});
/** GM: clear every driving check stuck on one vehicle (outside the chase console, e.g. from the vehicle sheet). Saved
 * rolls are certified as reviewed, unrolled cards are cancelled; nothing is rerolled and no damage is applied. */
registerHandler('drive.clearPrompts', async ({tokenUuid, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const vt = await fromUuid(tokenUuid); const open = openPrompts(vt); if (!vt || !open.length) return 0;
  for (const p of open) { if (resolving.has(`${vt.uuid}:${p.pid}`)) continue; await finishPrompt(vt, p.pid, p); }
  await card('GM INCIDENT REVIEW', `${vt.name}: ${open.length} driving check${open.length > 1 ? 's' : ''} cleared`, `<p>${open.map(p => `${esc(p.kind)}${p.result ? ` (saved roll: ${esc(p.result.outcomeKey)} — confirmed by the GM)` : ' (never rolled — cancelled)'}`).join('; ')}. Nothing was rerolled and no damage was applied.</p>`, 'drive', {whisper: gmIds()});
  return open.length;
});
registerHandler('drive.ignite', async ({tokenUuid, userId}) => { const vt = await fromUuid(tokenUuid); if (!vt) return; if (!game.users.get(userId)?.isGM && Number(vdata(vt).body?.value ?? 1) > 0) throw new Error('GM only: a vehicle only catches fire by itself at 0 Body.'); return ignite(vt); });
registerHandler('drive.explode', async ({tokenUuid, userId}) => { const vt = await fromUuid(tokenUuid); if (!vt) return; if (!game.users.get(userId)?.isGM && !vt.getFlag(NS, 'fire')) throw new Error('GM only.'); return explode(vt); });   // anyone can set off one that's already burning
registerHandler('drive.putOut', async ({tokenUuid, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.');
  const vt = await fromUuid(tokenUuid); if (!vt?.getFlag(NS, 'fire')) return;
  await vt.update({[`flags.${NS}.fire`]: null, light: {dim: 0, bright: 0}}, {acVehicleCarry: true});
  return card('FIRE', `${vt.name}: fire out`, '<p>An extinguisher and a lot of swearing. It still won\'t start.</p>', 'drive');
});
/** A roadside patch-up landed: +2 Body (+4 on a strong roll), once until a garage sees it. */
registerHandler('drive.patch', async ({tokenUuid, actorUuid, strong = false, userId}) => {
  const vt = await fromUuid(tokenUuid), a = await fromUuid(actorUuid), u = game.users.get(userId);
  if (!vt || !a || !(u?.isGM || a.testUserPermission?.(u, 'OWNER'))) throw new Error('Not allowed.');
  if (vt.getFlag(NS, 'patched') || vdata(vt).destroyed) throw new Error(`${vt.name} can't be patched again: it needs a garage.`);
  const v = vdata(vt), add = strong ? 4 : 2, next = Math.min(Number(v.body.max), Number(v.body.value) + add);
  await vt.actor.update({'system.vehicle.body.value': next});
  const up = {[`flags.${NS}.patched`]: true}; if (vt.getFlag(NS, 'fire') && next > 0) Object.assign(up, {[`flags.${NS}.fire`]: null, light: {dim: 0, bright: 0}});
  await vt.update(up, {acVehicleCarry: true});
  await logIncident(vt, {kind: 'patch', label: `Patched up by ${a.name} (+${add} Body)`});
  return card('PATCHED UP', `${vt.name}: +${add} Body`, `<p>${esc(a.name)} gets under the bonnet with a roll of gaffer tape and a lot of swearing. Body ${next}/${v.body.max}.${up[`flags.${NS}.fire`] === null ? ' The fire\'s out.' : ''}</p>`, 'drive win');
});
/** Call a fire action on the leader, directly when this client is the leader (never queue behind a running request). */
export async function onLeader(type, tokenUuid) {
  if (isLeader()) { const vt = await fromUuid(tokenUuid); if (!vt) return; return type === 'explode' ? explode(vt) : ignite(vt); }
  const {request} = await import('./net.mjs'); return request(`drive.${type}`, {tokenUuid});
}

let fireTimer = null;
export function installIncidents() {
  MOVE_GATES.push(gate); MOVE_WATCHERS.push(watch);
  // a driver's roll from a prompt card
  Hooks.on('createChatMessage', message => {
    if (!isLeader()) return;
    const r = message.getFlag?.(NS, 'roll'), c = r?.context;
    if (!c || c.automatic || !['driveCheck', 'evade', 'pitSave', 'ramSave'].includes(c.kind) || !r.outcomeKey || r.stat !== 'whl' && r.stat != null) return;
    resolve({...c, fromChat: true, outcomeKey: r.outcomeKey, margin: r.margin, driver: r.actorName, actorUuid: r.actorUuid, rollMessageId: message.id}).catch(error => console.warn('The Smoke | resolving a driving check', error));
  });
  // Native moves of empty vehicles do not pass through the occupied-vehicle request path.
  Hooks.on('preUpdateToken', (doc, changes, options) => {
    if (options?.acVehicleCarry || options?.smokeTraffic || !isVehicle(doc) || ridersOf(doc).length) return;
    if (!['x', 'y'].some(k => Object.hasOwn(changes, k))) return;
    if (game.user.isGM && game.keyboard?.isModifierActive?.('Alt')) return;
    if(settlingMoves.has(doc.uuid)||blockingPrompts(doc).length){ui.notifications.warn('Resolve the previous driving manoeuvre before moving again.');return false;}
    // Empty and occupied vehicles must obey the same speed dice and police decision gates.
    try{
      const checked=gateSync({vt:doc,scene:doc.parent,user:game.user,transform:changes,passengers:{},free:false});
      if(checked && checked!==changes)Object.assign(changes,checked);
    }catch(error){ui.notifications.warn(error.message);return false;}
    options.smokeFrom=tokenCentre(doc);
  });
  Hooks.on('updateToken', (doc, changes, options, userId) => {
    if (!isLeader() || !options?.smokeFrom || options?.smokeTraffic || options?.acVehicleCarry || !isVehicle(doc)) return;
    const user = game.users.get(userId) ?? game.user;
    settlingMoves.add(doc.uuid);
    watch({vt: doc, scene: doc.parent, user, from: options.smokeFrom, to: tokenCentre(doc), passengers: {}, free: false}).catch(error => console.warn('The Smoke | native driving incident', error)).finally(() => settlingMoves.delete(doc.uuid));
  });
  // a fight ending mid-fire: the fire carries on in real time
  Hooks.on('deleteCombat', combat => {
    if (!isLeader()) return;
    for (const t of combat.scene?.tokens?.filter(x => x.getFlag(NS, 'fire')?.combatId === combat.id) ?? [])
      t.update({[`flags.${NS}.fire`]: {...t.getFlag(NS, 'fire'), combatId: null, round: null, until: Date.now() + D.FIRE_SECONDS * 1000}}, {acVehicleCarry: true}).catch(() => null);
  });
  if (fireTimer) clearInterval(fireTimer);
  let busy = false;
  fireTimer = setInterval(async () => {
    if (!isLeader() || game.paused || busy) return; busy = true;
    try {
      for (const scene of game.scenes ?? []) {
        for (const t of scene.tokens?.filter?.(x => x.getFlag(NS, 'fire')) ?? []) {
          const f = t.getFlag(NS, 'fire'); if (!f || t.getFlag(NS, 'burnt')) continue;
          if (f.combatId && game.combats?.get?.(f.combatId)) continue;   // in a fight: it goes at the end of a round
          if (Date.now() >= Number(f.until || 0)) await explode(t);
        }
      }
    } catch (error) { console.warn('The Smoke | fire tick', error); } finally { busy = false; }
  }, 1000);
}
export const incidentsAPI = {ignite: vt => onLeader('ignite', vt.uuid), explode: vt => onLeader('explode', vt.uuid), npcRoll, npcDriveRoll, promptCheck, logIncident, bodyOfToken, openPrompts, blockingPrompts, recoverCompletedPrompts,
  clearPrompts: async vt => (await import('./net.mjs')).request('drive.clearPrompts', {tokenUuid: vt.uuid})};
export {sleep, gmIds, ownersOf};
/** For the tests. */
export const _internals = {gate, watch, resolve};
