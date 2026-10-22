// Vehicle abilities (ported from Altered Carbon v2.5.6, rebuilt for London).
// Each vehicle lists abilities in flags['the-smoke'].vehicleAbilities = [{key, seats?}].
//   policeKit   lights & siren (lit art + animated light + sound) and the ANPR plate scanner
//   lights      lights & siren only (ambulance, fire pump)
//   cage        caged seats lock from outside        stretcher   patient bay (ambulance)
//   offroad     no off-road penalty, +1 off the road nimble      goes where cars can't (bikes, scooters)
//   exposed     riders can be hit directly           windowless  load bay, can't see out
//   silent      hard to hear coming                   foldable    fold and carry (scooter)
//   tightTurn   black cab: +1 Wheels when turning in tight streets   docked   hire bike: worthless to a fence
//   flying      helicopter: ignores roads
import {NS, SOCKET} from '../config.mjs';
import {ukPlate} from '../rules/jobs-core.mjs';
import {chaseOf, actionKey, tallyOf} from '../world/chase-state.mjs';
import {bandPenalty, BAND_INFO} from '../rules/driving.mjs';
const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
const leaderGM = () => game.users.activeGM ?? game.users.filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
const isLeader = () => leaderGM()?.id === game.user.id;

export const ABILITIES = Object.freeze({
  policeKit: {label: 'Police kit', icon: 'fa-solid fa-tower-broadcast', text: 'Lights and siren (token HUD): +1 to Wheels while on, and traffic pulls over. ANPR plate scanner (token HUD): target a vehicle within 12 squares to run its plate.'},
  lights: {label: 'Lights and siren', icon: 'fa-solid fa-truck-medical', text: 'Blue lights (token HUD): +1 to Wheels while on, traffic pulls over.'},
  cage: {label: 'Prisoner cage', icon: 'fa-solid fa-lock', text: 'The caged seats lock from outside. A caged rider cannot get out or change seats; someone in front, beside the vehicle, or the GM must let them out.'},
  stretcher: {label: 'Stretcher bay', icon: 'fa-solid fa-bed-pulse', text: 'Patients ride here. A paramedic in the back can treat them on the move.'},
  offroad: {label: 'Off-road', icon: 'fa-solid fa-mountain', text: 'No penalty off the road; +1 to Wheels across parks, the Marshes and the towpath.'},
  nimble: {label: 'Goes where cars can\'t', icon: 'fa-solid fa-person-biking', text: 'No penalty for pavements, parks, alleys, the towpath or the Narrow Way.'},
  exposed: {label: 'Exposed', icon: 'fa-solid fa-person-rays', text: 'Riders have no cover: attacks hit them directly. (Riders inside a car can only be hit through the body: +2 to their Guard.)'},
  windowless: {label: 'Windowless load bay', icon: 'fa-solid fa-eye-slash', text: 'Riders here cannot see out or attack out.'},
  silent: {label: 'Silent', icon: 'fa-solid fa-volume-xmark', text: 'Savvy rolls to hear it coming are Hard.'},
  foldable: {label: 'Folds to carry', icon: 'fa-solid fa-suitcase', text: 'With nobody on it, a character beside it can fold it and carry it (token HUD), and unfold it later.'},
  tightTurn: {label: 'Tight turning circle', icon: 'fa-solid fa-rotate', text: '+1 to Wheels at junctions and in tight streets — a cab turns in its own length.'},
  docked: {label: 'Docking-station bike', icon: 'fa-solid fa-plug', text: 'Every one is tracked and logged. No fence will touch it — but nobody calls the police about it either.'},
  flying: {label: 'Flying', icon: 'fa-solid fa-helicopter', text: 'Ignores roads, buildings and roadblocks.'}
});

export function abilitiesOf(actor) {
  const f = actor?.getFlag?.(NS, 'vehicleAbilities') ?? actor?.flags?.[NS]?.vehicleAbilities;
  return Array.isArray(f) ? f : [];
}
export function hasAbility(actor, key, seatId = null) { return abilitiesOf(actor).some(a => a?.key === key && (!seatId || !Array.isArray(a.seats) || a.seats.includes(seatId))); }
export const isCagedSeat = (actor, seatId) => Boolean(seatId) && hasAbility(actor, 'cage', seatId);
export const isExposedSeat = (actor, seatId) => hasAbility(actor, 'exposed', seatId);
export const hasLights = actor => hasAbility(actor, 'policeKit') || hasAbility(actor, 'lights');

/** Driver modifiers for a Wheels roll. zoneKind: road | junction | path | land | park | null. */
export function pilotModifiers({vehicle, zoneKind = null, lightsOn = false}) {
  const out = {modifier: 0, notes: []};
  if (!vehicle) return out;
  if (lightsOn && hasLights(vehicle)) { out.modifier += 1; out.notes.push('Blue lights: traffic pulls over (+1)'); }
  if (zoneKind === 'junction' && hasAbility(vehicle, 'tightTurn')) { out.modifier += 1; out.notes.push('Tight turning circle (+1)'); }
  if (hasAbility(vehicle, 'flying')) return out;
  if (['land', 'park', 'path'].includes(zoneKind)) {
    if (hasAbility(vehicle, 'offroad')) { out.modifier += 1; out.notes.push('Off-road (+1)'); }
    else if (hasAbility(vehicle, 'nimble')) out.notes.push('Goes where cars can\'t: no off-road penalty');
    else { out.modifier -= 2; out.notes.push('Off the road (−2)'); }
  }
  return out;
}

/* ------------------------------------------------------------------ scene helpers */
const seatOf = t => t?.getFlag?.(NS, 'vehicleSeat') || null;
export function seatInfo(token) {
  const seat = seatOf(token); if (!seat) return null;
  const vt = token.parent?.tokens?.get(seat.vehicleTokenId); return vt ? {vt, vehicle: vt.actor, seatId: seat.seatId} : null;
}
export const lightsOn = vt => Boolean(vt?.getFlag?.(NS, 'lightsOn'));
export function zoneKindAt(token) {
  const scene = token?.parent; const zones = scene?.getFlag?.(NS, 'zoneGraph')?.zones; if (!Array.isArray(zones)) return null;
  const g = scene.grid?.size || 100, cx = Number(token.x) + Number(token.width || 1) * g / 2, cy = Number(token.y) + Number(token.height || 1) * g / 2;
  return zones.find(z => Array.isArray(z.rect) && cx >= z.rect[0] && cx < z.rect[0] + z.rect[2] && cy >= z.rect[1] && cy < z.rect[1] + z.rect[3])?.kind || null;
}
function tokensOfActor(actor, sceneId = null, tokenId = null) {
  if (actor?.token) return [actor.token];
  const scene = (sceneId && game.scenes.get(sceneId)) || globalThis.canvas?.scene || game.scenes?.viewed; if (!scene) return [];
  return scene.tokens.filter(t => t.actorId === actor?.id && (!tokenId || t.id === tokenId));
}
/** If this character is in a driver seat: the vehicle's dice for a Wheels roll. Never throws. */
export function driverContext(actor, {sceneId = null, tokenId = null} = {}) {
  try {
    const info = tokensOfActor(actor, sceneId, tokenId).map(seatInfo).find(i => i?.seatId === 'pilot');
    if (!info?.vehicle) return null;
    const v = info.vehicle.system.vehicle, p = pilotModifiers({vehicle: info.vehicle, zoneKind: zoneKindAt(info.vt), lightsOn: lightsOn(info.vt)});
    // Flat tyres: each one knocks the Performance die down a step and costs 2 Handling.
    const flats = Math.max(0, Number(v.flats || 0)), ladder = [4, 6, 8, 10, 12, 20];
    const perf = ladder[Math.max(0, ladder.indexOf(Number(v.perfDie || 6)) - flats)] ?? 4;
    const notes = [...p.notes, ...(flats ? [`${flats} flat tyre${flats > 1 ? 's' : ''}: Performance d${perf}, Handling −${2 * flats}`] : [])];
    // In a chase, pushing into yellow or red costs Handling for the rest of that action.
    let modifier = p.modifier; const key = actionKey(chaseOf(info.vt?.parent)), band = key ? tallyOf(info.vt, key).band : 'green', pen = bandPenalty(band);
    if (pen) { modifier += pen; notes.push(`${BAND_INFO[band].label} on the gauge: Handling ${pen}`); }
    return {vehicleName: info.vehicle.name, vehicleToken: info.vt, perfDie: perf, handling: Number(v.handling || 0) - 2 * flats, modifier, notes, destroyed: Boolean(v.destroyed), wrecked: Number(v.body.value) <= 0, band};
  } catch (error) { console.warn('The Smoke | driver context', error); return null; }
}

/** The plate on a vehicle token (assigned when the token is made; bikes have none). */
export function plateOf(vt) { return vt?.getFlag?.(NS, 'plate') || null; }

/* ------------------------------------------------------------------ GM-side actions */
const canDrive = (user, vt) => {
  if (user?.isGM || vt.actor?.testUserPermission?.(user, 'OWNER')) return true;
  const occ = vt.getFlag?.(NS, 'vehicleOccupants'); const pilot = Array.isArray(occ) ? occ.find(o => o.seatId === 'pilot') : null;
  return Boolean(pilot && vt.parent?.tokens?.get(pilot.tokenId)?.actor?.testUserPermission?.(user, 'OWNER'));
};
function sirenLight() {
  const anim = CONFIG?.Canvas?.lightAnimations || {}; const type = anim.siren ? 'siren' : anim.revolving ? 'revolving' : 'pulse';
  return {dim: 5, bright: 1.5, color: '#3d5bff', alpha: 0.55, angle: 360, animation: {type, speed: 7, intensity: 7}};
}
const ACTIONS = {
  async lights({sceneId, vehicleTokenId, userId}) {
    const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), user = game.users.get(userId);
    if (!vt || !hasLights(vt.actor)) throw new Error('That vehicle has no blue lights.');
    if (!canDrive(user, vt)) throw new Error(`${user?.name || 'That player'} is not driving ${vt.name}.`);
    const on = !lightsOn(vt);
    if (on) {
      const saved = {src: vt.texture?.src || '', light: vt.light?.toObject?.() ?? foundry.utils.deepClone(vt.light || {})};
      const lit = vt.actor?.getFlag?.(NS, 'lightsImg') || null;
      await vt.update({[`flags.${NS}.lightsOn`]: true, [`flags.${NS}.lightsSaved`]: saved, ...(lit ? {'texture.src': lit} : {}), light: sirenLight()}, {acVehicleCarry: true});
      try { foundry.audio.AudioHelper.play({src: `systems/${NS}/assets/sounds/siren.ogg`, volume: 0.45, autoplay: true, loop: false}, true); } catch (_e) {}
    } else {
      const saved = vt.getFlag(NS, 'lightsSaved') || {};
      await vt.update({[`flags.${NS}.lightsOn`]: false, ...(saved.src ? {'texture.src': saved.src} : {}), light: saved.light && Object.keys(saved.light).length ? saved.light : {dim: 0, bright: 0, animation: {type: null}}}, {acVehicleCarry: true});
    }
    await card(vt, on ? '<strong>Blues and twos.</strong> Traffic pulls over: +1 to Wheels.' : 'Lights and siren off.');
    Hooks.callAll('smokeLights', vt, on);
    return on;
  },
  /** ANPR: run the plate of a vehicle within range. Stolen markers come from the token's flags. */
  async scan({sceneId, vehicleTokenId, targetTokenId, userId}) {
    const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), target = scene?.tokens.get(targetTokenId), user = game.users.get(userId);
    if (!vt || !hasAbility(vt.actor, 'policeKit')) throw new Error('That vehicle has no ANPR plate scanner.');
    const aboard = scene.tokens.some(t => seatInfo(t)?.vt?.id === vt.id && t.actor?.testUserPermission?.(user, 'OWNER'));
    if (!canDrive(user, vt) && !aboard) throw new Error(`${user?.name || 'That player'} is not in ${vt.name}.`);
    if (target?.actor?.type !== 'vehicle') throw new Error('Target a vehicle to scan its plate.');
    const g = scene.grid.size, dist = Math.hypot((target.x + target.width * g / 2) - (vt.x + vt.width * g / 2), (target.y + target.height * g / 2) - (vt.y + vt.height * g / 2)) / g;
    if (!user?.isGM && dist > 12.5) throw new Error(`${target.name} is ${Math.round(dist)} squares away — the ANPR camera reads plates up to 12 squares.`);
    let plate = plateOf(target);
    if (!plate) {
      if (target.actor.system.vehicle?.plateless) throw new Error(`${target.name} has no number plate.`);
      plate = ukPlate(); await target.update({[`flags.${NS}.plate`]: plate}, {acVehicleCarry: true});
    }
    const marker = target.getFlag(NS, 'marker') || null;   // {kind:'stolen', since, keeper, note}
    const keeper = target.getFlag(NS, 'keeper') || marker?.keeper || 'Registered keeper on file';
    const hit = Boolean(marker);
    const body = hit
      ? `<p class="smoke-anpr hit"><b>${esc(plate)}</b> — ${esc(target.actor.name)}<br><b>⚠ ${esc(marker.label || 'REPORTED STOLEN')}</b>${marker.since ? ` · ${esc(marker.since)}` : ''}</p><p>${esc(marker.note || 'Stop the vehicle and detain the driver.')}</p>`
      : `<p class="smoke-anpr"><b>${esc(plate)}</b> — ${esc(target.actor.name)}<br>Keeper: ${esc(keeper)} · Insured · MOT valid · <b>No markers</b></p>`;
    await ChatMessage.implementation.create({speaker: {alias: `${vt.name} · ANPR`}, whisper: [userId, ...game.users.filter(u => u.isGM).map(u => u.id)],
      content: `<section class="smoke-card anpr ${hit ? 'hit' : ''}"><header><span class="kicker">ANPR CHECK</span><strong>${esc(plate)}</strong></header>${body}</section>`});
    Hooks.callAll('smokePlateScanned', {scene, policeToken: vt, target, plate, marker, userId});
    return {plate, marker};
  },
  async fold({sceneId, vehicleTokenId, carrierTokenId, userId}) {
    const scene = game.scenes.get(sceneId), vt = scene?.tokens.get(vehicleTokenId), carrier = scene?.tokens.get(carrierTokenId), user = game.users.get(userId);
    if (!vt || !hasAbility(vt.actor, 'foldable')) throw new Error('That vehicle does not fold.');
    if (!carrier || carrier.actor?.type === 'vehicle') throw new Error('Choose the character who will carry it.');
    if (!user?.isGM && !carrier.actor?.testUserPermission?.(user, 'OWNER')) throw new Error(`${user?.name || 'That player'} does not control ${carrier.name}.`);
    const occ = vt.getFlag(NS, 'vehicleOccupants'); if (Array.isArray(occ) && occ.length) throw new Error(`Someone is still on the ${vt.name}.`);
    const g = scene.grid.size; const gap = Math.max(0, Math.max(vt.x - (carrier.x + carrier.width * g), carrier.x - (vt.x + vt.width * g), vt.y - (carrier.y + carrier.height * g), carrier.y - (vt.y + vt.height * g))) / g;
    if (!user?.isGM && gap > 1.01) throw new Error(`${carrier.name} must be next to the ${vt.name}.`);
    const list = [...(carrier.actor.getFlag(NS, 'foldedVehicles') || [])];
    const data = vt.toObject(); delete data._id;
    list.push({name: vt.name, img: vt.texture?.src || '', data});
    await carrier.actor.setFlag(NS, 'foldedVehicles', list);
    await scene.deleteEmbeddedDocuments('Token', [vt.id]);
    await card(vt, `${esc(carrier.name)} folds up the <strong>${esc(vt.name)}</strong> and carries it.`);
    return true;
  },
  async unfold({sceneId, carrierTokenId, index = 0, userId}) {
    const scene = game.scenes.get(sceneId), carrier = scene?.tokens.get(carrierTokenId), user = game.users.get(userId);
    if (!carrier) throw new Error('Character not found.');
    if (!user?.isGM && !carrier.actor?.testUserPermission?.(user, 'OWNER')) throw new Error(`${user?.name || 'That player'} does not control ${carrier.name}.`);
    const list = [...(carrier.actor.getFlag(NS, 'foldedVehicles') || [])]; const item = list[Number(index) || 0]; if (!item) throw new Error(`${carrier.name} is not carrying anything folded.`);
    const {retarget} = await import('../map/map-transit.mjs');
    const data = retarget(foundry.utils.deepClone(item.data), scene); const g = scene.grid.size;
    data.x = Math.round(carrier.x + carrier.width * g); data.y = Math.round(carrier.y);
    foundry.utils.setProperty(data, `flags.${NS}.vehicleOccupants`, []);
    await scene.createEmbeddedDocuments('Token', [data]);
    list.splice(Number(index) || 0, 1); await carrier.actor.setFlag(NS, 'foldedVehicles', list);
    await card({name: item.name}, `${esc(carrier.name)} unfolds the <strong>${esc(item.name)}</strong>.`);
    return true;
  }
};
async function card(vt, text) { try { await ChatMessage.implementation.create({speaker: {alias: vt.name}, content: `<section class="smoke-card vehicle"><header><span class="kicker">VEHICLE</span><strong>${esc(vt.name)}</strong></header><p>${text}</p></section>`}); } catch (_e) {} }
async function request(type, data) {
  const payload = {...data, userId: game.user.id};
  if (isLeader()) return ACTIONS[type](payload);
  if (!leaderGM()) throw new Error('A GM must be connected.');
  game.socket.emit(SOCKET, {type: `acAbility.${type}`, data: payload}); return null;
}
export const toggleLights = vt => request('lights', {sceneId: vt.parent.id, vehicleTokenId: vt.id});
export const scanPlate = (vt, target) => request('scan', {sceneId: vt.parent.id, vehicleTokenId: vt.id, targetTokenId: target.id});
export const foldVehicle = (vt, carrier) => request('fold', {sceneId: vt.parent.id, vehicleTokenId: vt.id, carrierTokenId: carrier.id});
export const unfoldVehicle = (carrier, index = 0) => request('unfold', {sceneId: carrier.parent.id, carrierTokenId: carrier.id, index});
export const _actions = ACTIONS;

function hudButton(icon, title, fn) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'control-icon smoke-ability-hud'; b.title = title; b.dataset.tooltip = title; b.innerHTML = `<i class="${icon}" inert></i>`;
  b.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); Promise.resolve().then(fn).catch(error => ui.notifications.warn(error.message)); }); return b;
}
export function installVehicleAbilities() {
  game.socket.on(SOCKET, async payload => {
    if (!String(payload?.type || '').startsWith('acAbility.') || !isLeader()) return;
    const fn = ACTIONS[payload.type.slice(10)]; if (!fn) return;
    try { await fn(payload.data || {}); } catch (error) {
      try { await ChatMessage.implementation.create({speaker: {alias: 'Vehicle'}, whisper: [payload.data?.userId].filter(Boolean), content: `<p>${esc(error.message)}</p>`}); } catch (_e) {}
    }
  });
  // Every new car token gets a number plate (bikes and the helicopter do not).
  Hooks.on('preCreateToken', (doc, data) => {
    if (doc.actor?.type !== 'vehicle' || doc.actor.system.vehicle?.plateless) return;
    if (!foundry.utils.getProperty(data, `flags.${NS}.plate`)) doc.updateSource({[`flags.${NS}.plate`]: ukPlate()});
  });
  Hooks.on('renderTokenHUD', (hud, html) => {
    try {
      const root = html instanceof HTMLElement ? html : html?.[0]; const doc = hud.document ?? hud.object?.document; if (!root || !doc) return;
      const col = root.querySelector('.col.right') || root.querySelector('.right'); if (!col || col.querySelector('.smoke-ability-hud')) return;
      const vt = doc.actor?.type === 'vehicle' ? doc : seatInfo(doc)?.vt;
      if (vt && hasLights(vt.actor)) col.append(hudButton('fa-solid fa-tower-broadcast', lightsOn(vt) ? 'Blue lights: off' : 'Blue lights: on', () => toggleLights(vt)));
      if (vt && hasAbility(vt.actor, 'policeKit')) col.append(hudButton('fa-solid fa-barcode', 'ANPR: run the plate of the targeted vehicle', () => {
        const t = [...game.user.targets][0]?.document; if (!t) throw new Error('Target a vehicle first (hover it and press T).'); return scanPlate(vt, t); }));
      if (doc.actor?.type === 'vehicle' && hasAbility(doc.actor, 'foldable')) col.append(hudButton('fa-solid fa-suitcase', 'Fold up and carry', () => {
        const carrier = (canvas.tokens.controlled || []).map(t => t.document).find(t => t.id !== doc.id && t.actor?.type !== 'vehicle');
        if (!carrier) throw new Error('Select the character who will carry it as well (shift-click), then try again.'); return foldVehicle(doc, carrier); }));
      const folded = doc.actor?.type !== 'vehicle' ? (doc.actor?.getFlag?.(NS, 'foldedVehicles') || []) : [];
      folded.forEach((f, i) => col.append(hudButton('fa-solid fa-box-open', `Unfold the ${f.name}`, () => unfoldVehicle(doc, i))));
    } catch (error) { console.warn('The Smoke | ability HUD', error); }
  });
}
