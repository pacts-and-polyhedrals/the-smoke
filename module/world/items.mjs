// Using kit: take a drug (a high, then a comedown), eat or drink, change outfit (and maybe lose a Heat star), reload,
// patch up a motor, swap plates, refuel, sell a wrap on the street. Timed Conditions wear off on the leader GM's clock.
import {NS, STATS} from '../config.mjs';
import {clampHeat, isSuccess} from '../rules/core.mjs';
import {CONDITION_LIBRARY} from '../rules/conditions.mjs';
import {isLeader, registerHandler, request, card, esc, ownersOf} from './net.mjs';
import {distanceSquares, mapIdOf, actorToken} from './spawn.mjs';
import {watchSeconds, watchDeadline, legacyDeadlineToWatch} from '../rules/watch-clock.mjs';

const {DialogV2} = foundry.applications.api;
const whisperTo = actor => [...ownersOf(actor), ...game.users.filter(u => u.isGM).map(u => u.id)];
const listOf = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
export const tokenOf = actor => actorToken(actor);

/* ------------------------------------------------------------------ street prices by district */
// What a wrap is worth depends on who is buying: the posh end pays more, the estates less.
export const DISTRICT_PRICE = Object.freeze({
  'LDN-STRATFORD': 1.3, 'LDN-HOXTON-WEST': 1.3, 'LDN-HIGHBURY': 1.25, 'LDN-CANONBURY': 1.2, 'LDN-DE-BEAUVOIR': 1.2, 'LDN-DALSTON': 1.15,
  'LDN-HAGGERSTON': 1.1, 'LDN-STOKEY': 1.1, 'LDN-VICTORIA-PARK': 1.1, 'LDN-OLYMPIC-NORTH': 1.05, 'LDN-HACKNEY': 1, 'LDN-SOUTH-HACKNEY': 1,
  'LDN-CLAPTON': .95, 'LDN-HACKNEY-ROAD': .95, 'LDN-WICK-WOODLAND': .9, 'LDN-BETHNAL-GREEN': .9, 'LDN-OLD-FORD': .9, 'LDN-MARSHES': .85,
  'LDN-LEYTON': .85, 'LDN-BOW-FLYOVER': .85
});
export const priceHere = (base, scene) => Math.max(1, Math.round(Number(base) * (DISTRICT_PRICE[mapIdOf(scene)] ?? 1)));

/* ------------------------------------------------------------------ timed Conditions */
/**
 * Temporary effects last a number of *Banana Watch game minutes*, not wall-clock minutes.
 * A high may turn into a comedown. Persistent injuries/restraint do not acquire timers.
 * `beginsAtWorldTime` is for overdue transitions after a GM fast-forwards the watch.
 */
export async function addTimedCondition(actor, name, minutes, {then = '', thenMinutes = 60, beginsAtWorldTime = null} = {}) {
  const old = actor.items.find(i => i.type === 'condition' && i.name === name);
  const duration = Math.max(1, Number(minutes) || 1);
  const expiresWorldTime = watchDeadline(duration, Number.isFinite(beginsAtWorldTime) ? beginsAtWorldTime : watchSeconds());
  const timer = {expiresWorldTime, timerClock: 'banana-watch', durationWatchMinutes: duration, then, thenMinutes};
  if (old) return old.update(Object.fromEntries(Object.entries(timer).map(([k,v]) => [`flags.${NS}.${k}`, v])));
  const def = CONDITION_LIBRARY.find(c => c.name === name) ?? {name, category: 'boost', severity: 1, description: '', removal: 'Wears off.'};
  const [item] = await actor.createEmbeddedDocuments('Item', [{name, type: 'condition', img: 'icons/svg/aura.svg', flags: {[NS]: timer},
    system: {category: def.category, severity: def.severity, description: `<p>${def.description}</p>`, removal: def.removal}}]);
  return item;
}

/** Convert a v0.5.5 wall-clock condition only once; the new deadline is persisted. */
async function expiryOf(item, nowWorld, nowRealMs) {
  const v = item.getFlag(NS, 'expiresWorldTime');
  if (v !== undefined && v !== null && Number.isFinite(Number(v))) return Number(v);
  const upgraded = legacyDeadlineToWatch(item.getFlag(NS, 'expiresAt'), nowWorld, nowRealMs);
  if (upgraded === null) return null; // A permanent condition, or not timed at all.
  await item.update({[`flags.${NS}.expiresWorldTime`]: upgraded, [`flags.${NS}.timerClock`]: 'banana-watch'});
  return upgraded;
}

// The watch may advance by hours in one operation. Process high -> comedown against
// the ORIGINAL expiry, so skipping an entire evening also finishes the comedown.
let ticking = false;
export async function tickTimedConditions(now = watchSeconds(), actors = null, {realNowMs = Date.now()} = {}) {
  if (ticking) return; // Only the active GM writes; ignore overlapping heartbeat/hook ticks.
  ticking = true;
  try {
    const worldNow = Number(now);
    if (!Number.isFinite(worldNow)) throw new Error('Invalid Banana Watch time.');
    for (const actor of actors ?? game.actors.filter(a => a.type === 'character' || a.type === 'npc')) {
      // Future-proof against chains of statuses, without allowing a malformed condition to loop forever.
      for (let step = 0; step < 12; step++) {
        let due = null;
        for (const condition of actor.items.filter(i => i.type === 'condition')) {
          const expires = await expiryOf(condition, worldNow, realNowMs);
          if (expires !== null && expires <= worldNow && (!due || expires < due.expires)) due = {condition, expires};
        }
        if (!due) break;
        const c = due.condition, then = c.getFlag(NS, 'then'), mins = Number(c.getFlag(NS, 'thenMinutes')) || 60;
        await c.delete();
        if (then && then !== c.name) await addTimedCondition(actor, then, mins, {beginsAtWorldTime: due.expires});
        if (actor.type === 'character') await card('WEARS OFF', `${actor.name}: ${c.name} wears off`,
          then ? `<p>The next stage is <b>${esc(then)}</b> for about ${mins} Banana Watch minutes.</p>` : '<p>Back to normal.</p>', '', {whisper: whisperTo(actor)});
      }
    }
  } finally { ticking = false; }
}

/* ------------------------------------------------------------------ drugs */
export async function takeDrug(actor, item) {
  const s = item.system; if (Number(s.quantity || 0) < 1) throw new Error(`No ${item.name} left.`);
  // another hit while coming down off the same thing: the comedown lifts (for now) and the high starts again
  const chasing = s.comedown && actor.items.find(i => i.type === 'condition' && i.name === s.comedown);
  if (chasing) await chasing.delete();
  await addTimedCondition(actor, s.high, s.minutes, {then: s.comedown, thenMinutes: Math.max(30, s.minutes * 2)});
  await spendOne(item);
  await card('TAKEN', `${actor.name} takes the ${esc(item.name)}`, `<p><b>${esc(s.high)}</b> for about ${s.minutes} Banana Watch minutes${s.comedown ? `, then ${esc(s.comedown)}` : ''}.${chasing ? ` Chasing it: the ${esc(s.comedown)} lifts — for now. The next one will be worse.` : ''}</p>`, 'crew', {whisper: whisperTo(actor)});
}
export async function sellOnStreet(actor, item) {
  const s = item.system, have = Number(s.quantity || 0); if (have < 1) throw new Error(`No ${item.name} to sell.`);
  const t = tokenOf(actor), scene = t?.parent ?? canvas?.scene, each = priceHere(s.street || s.value, scene);
  const heat = clampHeat(actor.system.heat?.value);
  const out = await actor.rollDialog('frt', {band: heat ? 'hard' : 'medium', label: `Shift ${item.name} to a punter (£${each} each)`, context: {kind: 'streetSale', itemId: item.id}});
  if (!out?.result) return;
  const r = out.result;
  if (isSuccess(r.outcomeKey)) {
    const n = Math.min(have, r.outcomeKey === 'exceptionalSuccess' ? 5 : r.outcomeKey === 'strongSuccess' ? 3 : r.outcomeKey === 'fullSuccess' ? 2 : 1);
    const price = Math.round(n * each * (r.outcomeKey === 'exceptionalSuccess' ? 1.25 : 1));
    await spendOne(item, n); await actor.changeCash(price, `Sold ${n} ${s.unit || 'unit'}${n > 1 ? 's' : ''} of ${item.name} on ${scene?.name ?? 'the street'}.`);
    await actor.update({'system.rep.street': Number(actor.system.rep?.street || 0) + (n >= 3 ? 1 : 0)});
  } else if (r.outcomeKey === 'severeFailure') {
    await card('BAD MOVE', 'Undercover', `<p>The "punter" flashes a warrant card. Plain-clothes. ${esc(actor.name)} is caught dealing.</p>`, 'lose');
    await request('heat.set', {actorUuid: actor.uuid, value: heat + 2, reason: 'Caught dealing by an undercover officer.'});
  } else await card('NO SALE', `${actor.name} gets knocked back`, '<p>Nobody bites. Maybe somewhere busier, or posher.</p>', 'lose', {whisper: whisperTo(actor)});
}

/* ------------------------------------------------------------------ food, drink and medicine */
export async function consume(actor, item) {
  const s = item.system; if (Number(s.quantity || 0) < 1) throw new Error(`No ${item.name} left.`);
  const notes = [];
  if (item.name === 'First Aid Kit') {   // a roll, then the patch-up
    const out = await actor.rollDialog('sav', {band: 'medium', label: 'Patch Up'}); if (!out?.result) return;
    if (!isSuccess(out.result.outcomeKey)) { await spendOne(item); return card('PATCH UP', 'It does not take', '<p>The bandage slips and the kit is used up for nothing.</p>', 'lose', {whisper: whisperTo(actor)}); }
  }
  for (const name of listOf(s.removes)) if (actor.items.some(i => i.type === 'condition' && i.name === name)) { await actor.removeCondition(name); notes.push(`no longer ${name}`); }
  if (Number(s.heal)) { await actor.heal(Number(s.heal)); notes.push(`+${s.heal} Health`); }
  if (s.grants) {
    if (s.grants === 'Dutch Courage' && actor.items.some(i => i.type === 'condition' && i.name === 'Dutch Courage')) { await addTimedCondition(actor, 'Mullered', 240); notes.push('Mullered'); }
    else { await addTimedCondition(actor, s.grants, s.minutes || 30); notes.push(s.grants); }
  }
  await spendOne(item);
  await card(s.kind === 'medical' ? 'MEDICINE' : 'GRUB', `${actor.name}: ${item.name}`, `<p>${notes.length ? esc(notes.join(' · ')) : 'Lovely.'}</p>`, 'win', {whisper: whisperTo(actor)});
}
async function spendOne(item, n = 1) {
  const left = Number(item.system.quantity || 0) - n;
  if (left <= 0) return item.delete();
  return item.update({'system.quantity': left});
}

/* ------------------------------------------------------------------ outfits */
/** Put on an outfit. Out of sight of the police with 1-2 stars, a change of clothes loses Heat (the description no longer fits). */
export async function wearOutfit(actor, item) {
  const others = actor.items.filter(i => i.type === 'outfit' && i.id !== item.id && i.system.worn).map(i => ({_id: i.id, 'system.worn': false}));
  if (others.length) await actor.updateEmbeddedDocuments('Item', others);
  await item.update({'system.worn': true});
  return request('items.changedClothes', {actorUuid: actor.uuid, itemId: item.id});
}
/** What a change of clothes does to Heat. Pure: used by the leader and the tests. */
export function outfitHeatResult({heat, watched, heatDrop}) {
  heat = clampHeat(heat);
  if (!heat) return {to: 0, why: ''};
  if (heat >= 3) return {to: heat, why: 'Three stars and up: the helicopter is watching. A change of clothes will not shake them.'};
  if (watched) return {to: heat, why: 'The police watched you do it. No Heat lost.'};
  return {to: Math.max(0, heat - Math.max(0, Number(heatDrop) || 0)), why: ''};
}
export const wornOutfit = actor => actor.items.find(i => i.type === 'outfit' && i.system.worn) ?? null;

/* ------------------------------------------------------------------ ammo */
/** Reload a weapon from matching ammo. Returns rounds loaded. */
export async function reload(actor, weapon) {
  const w = weapon.system, need = Number(w.ammo?.max || 0) - Number(w.ammo?.value || 0);
  if (Number(w.ammo?.max || 0) <= 0) throw new Error(`The ${weapon.name} does not take ammo.`);
  if (need <= 0) { ui.notifications.info(`The ${weapon.name} is already full.`); return 0; }
  if (!w.ammoType) {   // no ammo type set (older or home-made kit): refill the magazine when the fiction permits, as in 0.1.2
    await weapon.update({'system.ammo.value': Number(w.ammo.max)});
    await card('RELOAD', `${actor.name} reloads the ${weapon.name}`, `<p>Magazine full: ${w.ammo.max}/${w.ammo.max}. <span class="smoke-dim">No ammo type on this weapon, so no box was used.</span></p>`, '', {whisper: whisperTo(actor)});
    return need;
  }
  const boxes = actor.items.filter(i => i.type === 'ammo' && i.system.ammoType === w.ammoType && Number(i.system.quantity) > 0);
  if (!boxes.length) throw new Error(`No ${w.ammoType} ammo for the ${weapon.name}.`);
  let left = need;
  for (const b of boxes) { if (!left) break; const take = Math.min(left, Number(b.system.quantity)); left -= take; await spendOne(b, take); }
  const loaded = need - left;
  await weapon.update({'system.ammo.value': Number(w.ammo.value) + loaded});
  await card('RELOAD', `${actor.name} reloads the ${weapon.name}`, `<p>${loaded} round${loaded === 1 ? '' : 's'} in: ${Number(w.ammo.value) + loaded}/${w.ammo.max}.</p>`, '', {whisper: whisperTo(actor)});
  return loaded;
}
export const ammoFor = (actor, weapon) => actor.items.filter(i => i.type === 'ammo' && i.system.ammoType === weapon.system.ammoType).reduce((t, i) => t + Number(i.system.quantity || 0), 0);

/* ------------------------------------------------------------------ gear that does something */
const nearVehicles = (actor, reach = 2) => { const t = tokenOf(actor); return t ? t.parent.tokens.filter(v => v.actor?.type === 'vehicle' && distanceSquares(v, t) <= reach) : []; };
async function pickVehicle(actor, title) {
  const list = nearVehicles(actor); if (!list.length) throw new Error('Stand next to the vehicle first.');
  if (list.length === 1) return list[0];
  const form = await DialogV2.input({window: {title}, content: `<select name="v">${list.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select>`});
  return list.find(v => v.id === form?.v) ?? null;
}
async function useGear(actor, item) {
  if(item.name==='Spray Paint')return game.smoke.openTagStudio(actor);
  switch (item.name) {
    case 'Toolkit': {
      const vt = await pickVehicle(actor, 'Patch up which motor?'); if (!vt) return;
      const out = await actor.rollDialog('grf', {band: 'medium', label: `Patch up the ${vt.name}`, fixedTarget: true, context: {kind: 'repair', vehicleTokenId: vt.id, sceneId: vt.parent.id}}); if (!out?.result) return;
      return request('items.repair', {sceneId: vt.parent.id, vehicleTokenId: vt.id, actorId: actor.id, messageId: out.message?.id});
    }
    case 'Spare Plates': {
      const vt = await pickVehicle(actor, 'Swap the plates on which motor?'); if (!vt) return;
      const out = await actor.rollDialog('grf', {band: 'easy', label: `Swap the plates on the ${vt.name}`}); if (!out?.result || !isSuccess(out.result.outcomeKey)) return;
      await request('items.plates', {sceneId: vt.parent.id, vehicleTokenId: vt.id, actorId: actor.id}); return spendOne(item);
    }
    case 'Jerry Can': {
      const vt = await pickVehicle(actor, 'Fill up which motor?'); if (!vt) return;
      await request('items.refuel', {sceneId: vt.parent.id, vehicleTokenId: vt.id, actorId: actor.id}); return spendOne(item);
    }
    case 'Cable Ties': {
      const target = [...(game.user.targets ?? [])][0]?.document; if (!target?.actor) throw new Error('Target the person to tie up (T).');
      const conds = new Set(target.actor.items.filter(i => i.type === 'condition').map(i => i.name));
      if (!['Grabbed', 'Down', 'Restrained'].some(c => conds.has(c)) && !target.actor.system.states?.surrendered) throw new Error(`${target.name} has to be Grabbed, Down or surrendered first.`);
      await request('items.cuff', {actorUuid: target.actor.uuid, targetTokenUuid: target.uuid, actorId: actor.id}); return spendOne(item);
    }
  }
  if (item.system.stat) return actor.rollDialog(item.system.stat, {label: item.name, modifier: Number(item.system.bonus || 0)});
  return ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor}), content: `<section class="smoke-card"><header><span class="kicker">KIT</span><strong>${esc(item.name)}</strong></header>${item.system.description || ''}</section>`});
}

/* ------------------------------------------------------------------ one entry point for the sheet's "use" */
export async function useItem(item) {
  const actor = item.parent; if (!actor) return;
  switch (item.type) {
    case 'ammo': {
      const guns = actor.items.filter(w => w.type === 'weapon' && w.system.ammoType === item.system.ammoType && Number(w.system.ammo?.value) < Number(w.system.ammo?.max));
      if (!guns.length) throw new Error(`Nothing to load with ${item.name}.`);
      return reload(actor, guns[0]);
    }
    case 'drug': {
      const each = priceHere(item.system.street || item.system.value, tokenOf(actor)?.parent ?? canvas?.scene);
      const choice = await DialogV2.wait({window: {title: item.name}, content: `<p>${item.system.quantity} ${esc(item.system.unit || 'unit')}(s). On this street a punter pays about <b>£${each}</b> each.</p>`,
        buttons: [{action: 'take', label: 'Take one', icon: 'fa-solid fa-pills'}, {action: 'sell', label: 'Sell to a punter (Front)', icon: 'fa-solid fa-sterling-sign'}, {action: 'cancel', label: 'Put it away'}]});
      if (choice === 'take') return takeDrug(actor, item);
      if (choice === 'sell') return sellOnStreet(actor, item);
      return null;
    }
    case 'consumable': return consume(actor, item);
    case 'outfit': return wearOutfit(actor, item);
    case 'gear': return useGear(actor, item);
    case 'perk': return ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor}), content: `<section class="smoke-card"><header><span class="kicker">PERK · ${esc(STATS[item.system.stat]?.label || '')}</span><strong>${esc(item.name)}</strong></header><p><b>When:</b> ${esc(item.system.when)}</p>${item.system.description || ''}</section>`});
  }
  return null;
}

/* ------------------------------------------------------------------ leader handlers */
const okFor = (u, actor) => u?.isGM || actor?.testUserPermission?.(u, 'OWNER');
registerHandler('items.repair', async ({sceneId, vehicleTokenId, actorId, messageId, outcomeKey = null, userId}) => {
  const vt = game.scenes.get(sceneId)?.tokens.get(vehicleTokenId), actor = game.actors.get(actorId), u = game.users.get(userId);
  if (!vt || !okFor(u, actor)) throw new Error('Not allowed.');
  // The result comes from the roll's own chat message (made by the leader), once — not from what a client says it rolled.
  const msg = messageId && game.messages.get(messageId), r = msg?.getFlag?.(NS, 'roll');
  if (r) {
    if (r.stat !== 'grf' || r.actorUuid !== actor.uuid || r.context?.kind !== 'repair' || r.context?.vehicleTokenId !== vt.id) throw new Error('That roll does not match this repair.');
    if (msg.getFlag(NS, 'consumed')) throw new Error('That repair roll has already been used.');
    await msg.setFlag(NS, 'consumed', true); outcomeKey = r.outcomeKey;
  } else if (!u?.isGM) throw new Error('Roll the repair first.');
  if (!u?.isGM) { const t = tokenOf(actor); if (!t || t.parent?.id !== vt.parent?.id || distanceSquares(t, vt) > Math.max(vt.width, vt.height) + 2) throw new Error('Stand next to the vehicle first.'); }
  const v = vt.actor.system.vehicle, add = {narrowSuccess: 1, fullSuccess: 2, strongSuccess: 4, exceptionalSuccess: 99}[outcomeKey] ?? 0;
  if (!add) return card('REPAIR', `${vt.name}: no joy`, '<p>Skinned knuckles and a spare bolt. No better.</p>', 'lose');
  const flats = Number(v.flats || 0);
  if (flats) { await vt.actor.update({'system.vehicle.flats': flats - 1}); return card('REPAIR', `${vt.name}: tyre changed`, `<p>${flats - 1 ? `${flats - 1} flat still to go.` : 'Back on four good tyres.'}</p>`, 'win'); }
  const body = Math.min(Number(v.body.max), Number(v.body.value) + add);
  await vt.actor.update({'system.vehicle.body.value': body});
  return card('REPAIR', `${vt.name} patched up`, `<p>Body ${body}/${v.body.max}.</p>`, 'win');
});
registerHandler('items.plates', async ({sceneId, vehicleTokenId, actorId, userId}) => {
  const vt = game.scenes.get(sceneId)?.tokens.get(vehicleTokenId), actor = game.actors.get(actorId), u = game.users.get(userId);
  if (!vt || !okFor(u, actor)) throw new Error('Not allowed.');
  const L = 'ABCDEFGHJKLMNOPRSTUVWXY', r = n => Array.from({length: n}, () => L[Math.floor(Math.random() * L.length)]).join('');
  const plate = `${r(2)}${String(10 + Math.floor(Math.random() * 60)).padStart(2, '0')} ${r(3)}`;
  await vt.update({[`flags.${NS}.plate`]: plate, [`flags.${NS}.marker`]: null, [`flags.${NS}.hotUntil`]: 0}, {acVehicleCarry: true});
  return card('PLATES', `${vt.name} has new plates`, `<p>Now reads <b class="smoke-plate">${esc(plate)}</b>. The ANPR scanner sees a clean car.</p>`, 'win');
});
registerHandler('items.refuel', async ({sceneId, vehicleTokenId, actorId, userId}) => {
  const vt = game.scenes.get(sceneId)?.tokens.get(vehicleTokenId), actor = game.actors.get(actorId), u = game.users.get(userId);
  if (!vt || !okFor(u, actor)) throw new Error('Not allowed.');
  const f = vt.actor.system.vehicle.fuel; await vt.actor.update({'system.vehicle.fuel.value': Math.min(Number(f.max), Number(f.value) + 5)});
});
registerHandler('items.changedClothes', async ({actorUuid, itemId, userId}) => {
  const actor = await fromUuid(actorUuid), u = game.users.get(userId), item = actor?.items.get(itemId);
  if (!actor || !item || !okFor(u, actor) || !item.system.worn) throw new Error('Not allowed.');
  const heat = clampHeat(actor.system.heat?.value), t = tokenOf(actor);
  const watched = t ? t.parent.tokens.some(x => x.getFlag(NS, 'police') && distanceSquares(x, t) <= 14) : false;
  const res = outfitHeatResult({heat, watched, heatDrop: item.system.heatDrop});
  let line = `<p>${esc(actor.name)} changes into the ${esc(item.name)}.</p>`;
  if (res.to < heat) { await actor.setHeat(res.to, `Changed into the ${item.name}: the description no longer fits.`); line += `<p>New look, new person: Heat ${heat}★ → ${res.to}★.</p>`; }
  else if (res.why) line += `<p class="smoke-dim">${esc(res.why)}</p>`;
  if (item.system.disguise === 'police' && watched) { line += '<p class="smoke-bad">A real officer clocks the uniform. Impersonating a police officer.</p>'; await actor.setHeat(Math.max(heat, 2) + 1, 'Impersonating a police officer.'); }
  return card('CLOBBER', `${actor.name} gets changed`, line, 'crew', {whisper: whisperTo(actor)});
});
registerHandler('items.cuff', async ({actorUuid, targetTokenUuid = null, actorId = null, userId}) => {
  const u = game.users.get(userId); if (!u) return; const a = await fromUuid(actorUuid); if (!a) return;
  if (!u.isGM) {
    // the same rules the Blower checks, enforced here: your character, holding cable ties, beside someone who can't resist
    const tier = game.actors.get(actorId);
    if (!tier || !okFor(u, tier) || !tier.items.some(i => i.name === 'Cable Ties' && Number(i.system.quantity ?? 1) > 0)) throw new Error('Use cable ties your own character is carrying.');
    const conds = new Set(a.items.filter(i => i.type === 'condition').map(i => i.name));
    if (!['Grabbed', 'Down', 'Restrained'].some(c => conds.has(c)) && !a.system.states?.surrendered) throw new Error(`${a.name} has to be Grabbed, Down or surrendered first.`);
    const tt = targetTokenUuid ? await fromUuid(targetTokenUuid) : null, me = tokenOf(tier);
    if (!tt || !me || tt.parent?.id !== me.parent?.id || distanceSquares(me, tt) > 2.2) throw new Error('Get right next to them first.');
  }
  await a.addCondition('Cuffed'); await a.removeCondition('Grabbed');
  return card('TIED UP', `${a.name} is restrained`, '<p>Cable ties round the wrists. Cuffed until someone cuts them.</p>', '');
});

let timer = null, watchHookInstalled = false;
export function installItems() {
  const refresh = () => { if (isLeader()) void tickTimedConditions().catch(error => console.warn('The Smoke | timed conditions', error)); };
  if (!watchHookInstalled) {
    Hooks.on('updateWorldTime', refresh); // manual jumps and game-clock ticking process effects immediately
    watchHookInstalled = true;
  }
  if (timer) clearInterval(timer);
  timer = setInterval(refresh, 15000); // migration / recovery if the GM reconnects or a hook was missed
  refresh();
}
export const itemsAPI = {useItem, takeDrug, sellOnStreet, consume, wearOutfit, reload, addTimedCondition, tickTimedConditions, priceHere, ammoFor};
