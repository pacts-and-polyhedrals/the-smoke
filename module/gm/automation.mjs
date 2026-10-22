// What the GM Screen's "Do it" buttons do: rival crews, a passing patrol, Kez's tip-off bike, a pickpocket, being
// recognised, made-up NPCs, rewards. Every write runs on the leader GM through net.request().
import {NS, STATS} from '../config.mjs';
import {clampHeat} from '../rules/core.mjs';
import {pick, kerbside} from '../rules/jobs-core.mjs';
import {registerHandler, request, card, esc, ownersOf} from '../world/net.mjs';
import {ensurePersonActor, ensureVehicleActor, placeToken, zonesOf, tokenCentre, isStreetScene} from '../world/spawn.mjs';
import {roadSpawn} from '../world/traffic.mjs';
import {QUICK_CHECKS, HAZARDS, STREET_EVENTS, POLICE_EVENTS, TEAMWORK, FIRST_NAMES, SURNAMES, NPC_ROLES} from './catalogue.mjs';
import {postRequest} from './requests.mjs';

const requireGM = userId => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); };
export const pcTokens = scene => (scene?.tokens ?? []).filter(t => t.actor?.type === 'character' && t.actor.hasPlayerOwner !== false);
const nearestPC = scene => pcTokens(scene)[0] ?? null;
/** A point on the pavement `min`-`max` squares from (x, y), or near it. */
function kerbPointNear(scene, [x, y], min = 4, max = 10) {
  const g = scene.grid.size, kerbs = kerbside(zonesOf(scene));
  const ok = kerbs.map(z => ({z, d: Math.hypot(z.rect[0] + z.rect[2] / 2 - x, z.rect[1] + z.rect[3] / 2 - y) / g})).filter(o => o.d >= min && o.d <= max);
  const z = (ok.length ? pick(ok).z : kerbs.sort((a, b) => Math.hypot(a.rect[0] - x, a.rect[1] - y) - Math.hypot(b.rect[0] - x, b.rect[1] - y))[0]);
  if (!z) return [x + g * min, y];
  return [z.rect[0] + g + Math.random() * Math.max(1, z.rect[2] - 2 * g), z.rect[1] + g + Math.random() * Math.max(1, z.rect[3] - 2 * g)];
}

/* ------------------------------------------------------------------ catalogue → request */
export function quickSpec(id, {band = null, actorIds}) {
  const q = QUICK_CHECKS.find(x => x.id === id) ?? POLICE_EVENTS.find(x => x.id === id); if (!q) throw new Error(`No check ${id}.`);
  return {kind: 'check', title: q.name, text: q.text, guide: q.guide, band: band || q.band, responses: q.responses, actorIds};
}
export function teamSpec(id, {band = null, actorIds, tn}) {
  const q = TEAMWORK.find(x => x.id === id); if (!q) throw new Error(`No teamwork check ${id}.`);
  return {kind: 'teamwork', title: q.name, text: q.text, guide: q.guide, band: band || q.band, tn, responses: q.responses, actorIds};
}
export function hazardSpec(id, {band = null, actorIds, autoApply = true}) {
  const h = HAZARDS.find(x => x.id === id); if (!h) throw new Error(`No hazard ${id}.`);
  return {kind: 'hazard', title: h.name, text: h.text, guide: 'Consequences apply automatically when each roll comes in.', band: band || h.band, responses: h.responses, actorIds,
    hazard: {narrow: h.narrow, costly: h.costly, severe: h.severe, armoured: Boolean(h.armoured)}, autoApply};
}

/* ------------------------------------------------------------------ street events */
export const rollStreetEvent = () => STREET_EVENTS[Math.floor(Math.random() * STREET_EVENTS.length)];
/** Run an event's automation for these characters on this scene. */
export async function runAuto(auto, {scene, actorIds}) {
  if (!auto) return null;
  if (auto.startsWith('quick:')) return postRequest(quickSpec(auto.slice(6), {actorIds}));
  if (auto.startsWith('hazard:')) return postRequest(hazardSpec(auto.slice(7), {actorIds}));
  switch (auto) {
    case 'rivals': await request('gm.rivals', {sceneId: scene?.id}); return postRequest(quickSpec('intimidate', {actorIds}));
    case 'patrol': return request('gm.patrol', {sceneId: scene?.id});
    case 'bike': return request('gm.tipoff', {sceneId: scene?.id});
    case 'pickpocket': return postRequest({kind: 'hazard', title: 'Dipped', text: 'A bump in the crowd. Is your wallet still there?', band: 'medium', actorIds,
      responses: [{label: 'Feel it go', stat: 'sav'}, {label: 'Grab their wrist', stat: 'mov'}], hazard: {costly: {cashPct: 10}, severe: {cashPct: 25, conditions: ['Shaken']}}});
    case 'recognised': return postRequest({kind: 'hazard', title: 'Someone Recognises You', text: '"Oi! I know you!" — and they are getting their phone out.', band: 'medium', actorIds,
      responses: [{label: 'Talk them down', stat: 'frt'}, {label: 'Disappear', stat: 'mov'}, {label: 'Stare them out', stat: 'btl'}], hazard: {costly: {heat: 1}, severe: {heat: 2}}});
  }
  return null;
}

/* ------------------------------------------------------------------ made-up NPCs */
export function makeNPC(roleKey = null) {
  const role = NPC_ROLES.find(x => x.key === roleKey) ?? pick(NPC_ROLES);
  const name = `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`;
  const stats = Object.fromEntries(Object.keys(STATS).map(k => [k, {die: role.dice[k] ?? 4}]));
  return {name, role: role.label, roleKey: role.key, stats, health: 8 + (role.dice.grt ?? 4) / 2};
}
export function npcLine(n) { return Object.entries(n.stats).filter(([, v]) => v.die > 4).map(([k, v]) => `${STATS[k].abbr} d${v.die}`).join(' · ') || 'all d4'; }

/* ------------------------------------------------------------------ leader handlers */
registerHandler('gm.rivals', async ({sceneId, count = 2, userId}) => {
  requireGM(userId); const scene = game.scenes.get(sceneId) ?? canvas.scene; const pc = nearestPC(scene); if (!scene) return 0;
  const at = pc ? tokenCentre(pc) : [scene.width / 2, scene.height / 2]; const lad = await ensurePersonActor('lea-boy');
  for (let i = 0; i < count; i++) { const [x, y] = kerbPointNear(scene, at, 3, 8); await placeToken(scene, lad, x, y, {flags: {rival: true}, name: i ? 'Lea Boy' : 'Lea Boy (mouthy one)'}); }
  return count;
});
registerHandler('gm.patrol', async ({sceneId, userId}) => {
  requireGM(userId); const scene = game.scenes.get(sceneId) ?? canvas.scene; if (!isStreetScene(scene)) throw new Error('Patrols drive on street maps.');
  const pc = nearestPC(scene); const p = await roadSpawn(scene, Math.random, {awayFrom: pc ? tokenCentre(pc) : null, minDist: scene.grid.size * 10}); if (!p) return null;
  const car = await ensureVehicleActor('LV23');
  return placeToken(scene, car, p.x, p.y, {rotation: p.rotation, flags: {police: {unit: 'car', patrol: true}, issued: true, locked: true, traffic: {kind: 'moving', ...p.road, speed: 1, keep: true}}});
});
registerHandler('gm.tipoff', async ({sceneId, userId}) => {
  requireGM(userId); const scene = game.scenes.get(sceneId) ?? canvas.scene; const pc = nearestPC(scene); if (!scene) return null;
  const vid = pick(['LV02', 'LV03', 'LV03', 'LV07', 'LV08']); const bike = await ensureVehicleActor(vid);
  const [x, y] = kerbPointNear(scene, pc ? tokenCentre(pc) : [scene.width / 2, scene.height / 2], 6, 14);
  const t = await placeToken(scene, bike, x, y, {flags: {locked: true, parked: true, traffic: {kind: 'bike'}, tipoff: true}});
  await card('KEZ', 'Tip-off', `<p>"${esc(bike.name)} on ${esc(scene.name)}, cheap lock, owner in the caff. Go go go x"</p>`, 'crew', {whisper: [...new Set([...(pc ? ownersOf(pc.actor) : []), ...game.users.filter(u => u.isGM).map(u => u.id)])]});
  if (t && canvas?.scene?.id === scene.id) canvas.ping?.({x, y});
  return t;
});
registerHandler('gm.placeNPC', async ({sceneId, npc, x, y, userId}) => {
  requireGM(userId); const scene = game.scenes.get(sceneId) ?? canvas.scene; if (!scene) return null;
  let folder = game.folders.find(f => f.type === 'Actor' && f.name === 'The Smoke — Made Up');
  folder ??= await Folder.implementation.create({name: 'The Smoke — Made Up', type: 'Actor', color: '#b9ae95'});
  const [actor] = await Actor.implementation.createDocuments([{name: npc.name, type: 'npc', folder: folder.id, img: 'icons/svg/mystery-man.svg',
    system: {stats: npc.stats, role: npc.roleKey, resources: {health: {value: Math.round(npc.health), max: Math.round(npc.health)}, hustle: {value: 0, max: 0}}, biography: `<p>${esc(npc.role)}.</p>`},
    prototypeToken: {name: npc.name, displayName: 20, actorLink: false, disposition: 0}}]);
  return placeToken(scene, actor, x ?? scene.width / 2, y ?? scene.height / 2);
});
registerHandler('gm.reward', async ({actorIds, cash = 0, xp = 0, hustle = false, heal = false, rep = null, clearHeat = false, advance = false, itemName = null, qty = 1, userId}) => {
  requireGM(userId); const items = itemName ? (await (await fetch(`systems/${NS}/data/london-items.json`)).json()).items : [];
  const lib = items.find(i => i.name === itemName);
  for (const id of actorIds || []) {
    const a = game.actors.get(id); if (!a) continue; const up = {}; const notes = [];
    if (Number(xp)) { up['system.rep.xp'] = Math.max(0, Number(a.system.rep?.xp || 0) + Number(xp)); notes.push(`${xp > 0 ? '+' : ''}${xp} XP`); }
    if (hustle) { up['system.resources.hustle.value'] = a.system.resources.hustle.max; notes.push('Hustle refilled'); }
    if (heal) { up['system.resources.health.value'] = a.system.resources.health.max; up['system.states.down'] = false; notes.push('patched up'); }
    if (advance && a.type === 'character') { up['system.advancement.available'] = Number(a.system.advancement?.available || 0) + 1; notes.push('+1 advance (spend it on the Rep tab)'); }
    if (rep) { up[`system.rep.${rep}`] = Number(a.system.rep?.[rep] || 0) + 1; notes.push(`+1 ${rep === 'crew' ? 'Chainring' : rep === 'street' ? 'Street' : 'Known to police'}`); }
    if (Object.keys(up).length) await a.update(up);
    if (heal) for (const c of a.items.filter(i => i.type === 'condition')) await c.delete();
    if (clearHeat && clampHeat(a.system.heat?.value)) { await a.setHeat(0, 'The GM wipes the slate.'); notes.push('Heat cleared'); }
    if (Number(cash)) await a.changeCash(Number(cash), Number(cash) > 0 ? 'From the GM.' : 'Taken by the GM.');
    if (lib) { const have = a.items.find(i => i.name === lib.name && ['ammo', 'drug', 'consumable'].includes(i.type));
      if (have) await have.update({'system.quantity': Number(have.system.quantity || 0) + Number(qty || 1) * (lib.type === 'ammo' ? Number(lib.system.perBox || 1) : 1)});
      else await a.createEmbeddedDocuments('Item', [{...lib, system: {...lib.system, ...(Number(qty) > 1 && lib.type !== 'ammo' ? {quantity: Number(qty)} : {})}}]);
      notes.push(`${lib.name}${Number(qty) > 1 ? ` ×${qty}` : ''}`); }
    if (notes.length) await card('FROM THE GM', a.name, `<p>${esc(notes.join(' · '))}</p>`, 'win', {whisper: [...ownersOf(a), ...game.users.filter(u => u.isGM).map(u => u.id)]});
  }
});
