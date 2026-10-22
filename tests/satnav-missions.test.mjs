// 0.5.23: the sat nav on every mission (story, careers, local cases, graffiti, radio), at every point along the way —
// in order, and with the GM ticking objectives out of order. It must point at the map of the next open objective that
// has a place, never back at the start. (On 0.5.21 it got 112 of the 179 missions wrong somewhere: cargo objectives
// had no place so it fell back to the first stop or Pat's, graffiti sites with no venue door were skipped, and when
// only GM-ticked steps were left it went back to the beginning.) Then cargo: the parcel, then its handover.
import assert from 'node:assert/strict';
import process from 'node:process';
import path from 'node:path'; import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./runtime-stub.mjs');
const S = await import(`${ROOT}/module/map/satnav.mjs`);
const {needed} = await import(`${ROOT}/module/world/missions.mjs`);
const P = await import(`${ROOT}/module/world/mission-props.mjs`);
S.registerSatnavSettings();
const d = await S.satnavData();
const doorStreet = id => { for (const m of d.atlas.maps) if ((m.links || []).some(l => l.kind === 'door' && l.to === id)) return m.id; return null; };
const venueStreet = id => { if (!id) return null; const v = (d.venues?.maps || []).find(x => x.id === id); return doorStreet(id) ?? (v?.approach ? doorStreet(v.approach) : null) ?? v?.street ?? null; };
const placeMaps = (m, o, st) => {
  const a = o.auto;
  if (o.stop != null && m.stops?.[o.stop]) { const s = m.stops[o.stop]; return [s.placeId, s.mapId, venueStreet(s.placeId), venueStreet(s.mapId)].filter(Boolean); }
  if (a?.on === 'map') return [a.mapId, ...(a.mapIds || []), venueStreet(a.mapId)].filter(Boolean);
  if (a?.on === 'cargoCollected' || a?.on === 'cargoDelivered') {
    const p = (m.props || []).find(x => x.id === a.propId); if (!p) return null;
    const held = Object.entries(st?.parcels || {}).some(([k, r]) => k.startsWith(`${p.id}:`) && r.status === 'held');
    const pt = a.on === 'cargoCollected' || !held ? p.pickup : p.delivery, dest = P.propDestination(m, pt);
    return [P.propMapId(dest), dest?.mapId, venueStreet(P.propMapId(dest))].filter(Boolean);
  }
  if (a?.on === 'tagPlaced' || a?.on === 'radioWar') return null;
  return null;   // GM-ticked, sold, service: no fixed place
};
const tmap = t => [t?.placeId, t?.mapId].filter(Boolean);
let states = 0; const bad = [];
const check = (m, st, how) => {
  states++;
  const t = S.missionTarget(d, m, st), list = m.objectives, open = list.filter(o => Number(st.ticks?.[o.id] || 0) < needed(o));
  if (!open.length) return;
  const nextPlaced = open.find(o => placeMaps(m, o, st)?.length || (o.auto?.on === 'tagPlaced' && o.stop != null));
  const dynamicFirst = open.find(o => ['sold', 'service'].includes(o.auto?.on));
  if (!t) { bad.push(`${m.id} ${how}: no target`); return; }
  if (nextPlaced && (!dynamicFirst || list.indexOf(dynamicFirst) > list.indexOf(nextPlaced))) {
    const want = placeMaps(m, nextPlaced, st) ?? [m.stops?.[nextPlaced.stop]?.mapId];
    if (!tmap(t).some(x => want.includes(x))) bad.push(`${m.id} ${how}: → ${t.label} (${tmap(t).join('/')}), next open with a place is ${nextPlaced.id} (${want.join('/')})`);
  } else if (!nextPlaced && !dynamicFirst) {
    // only GM steps left: not back at the first place unless that is where the job last was
    const firstOpen = list.findIndex(o => open.includes(o));
    const prev = list.slice(0, firstOpen).reverse().find(o => placeMaps(m, o, st)?.length);
    if (prev && !tmap(t).some(x => placeMaps(m, prev, st).includes(x))) bad.push(`${m.id} ${how}: only GM steps left → ${t.label} (${tmap(t).join('/')}), last place was ${prev.id}`);
  }
};
for (const m of d.missions) {
  // in order, with cargo collected (held) before its delivery is due
  const st = {status: 'active', ticks: {}, parcels: {}};
  for (const o of m.objectives) {
    check(m, st, `before ${o.id}`);
    st.ticks[o.id] = needed(o);
    if (o.auto?.on === 'cargoCollected') for (const u of P.propUnits(m).filter(u => u.prop.id === o.auto.propId)) st.parcels[u.serial] = {status: 'held', actorId: 'a1'};
    if (o.auto?.on === 'cargoDelivered') for (const u of P.propUnits(m).filter(u => u.prop.id === o.auto.propId)) st.parcels[u.serial] = {status: 'delivered'};
  }
  // the GM ticks one objective out of order (each in turn): the rest still route properly
  for (const skip of m.objectives) check(m, {status: 'active', ticks: {[skip.id]: needed(skip)}, parcels: {}}, `with only ${skip.id} ticked`);
}
assert.deepEqual(bad, [], 'the sat nav always points at the next place the mission needs');
assert.ok(states > 1700);
/* ---------------------------------------------------------------- cargo, live */
const m06 = d.missions.find(m => m.id === 'm06'), at = {status: 'active', ticks: {cafe: 1}, parcels: {}};
let t = S.missionTarget(d, m06, at); assert.equal(t.mapId, 'LDN-OLD-FORD'); assert.match(t.label, /^Collect: /, 'not yet collected: where to collect it');
const tok = {id: 'tp', x: 900, y: 700, width: 1, height: 1, parent: null};
const sc = {id: 'sc-of', grid: {size: 100}, getFlag: (ns, k) => k === 'streetAtlas' ? {id: 'LDN-OLD-FORD'} : null, tokens: Object.assign([tok], {get: id => id === 'tp' ? tok : null})}; tok.parent = sc;
game.scenes = Object.assign([sc], {get: id => id === 'sc-of' ? sc : null});
t = S.missionTarget(d, m06, {...at, parcels: {'p1:1': {status: 'world', sceneId: 'sc-of', tokenId: 'tp'}}});
assert.deepEqual([t.mapId, t.x, t.y], ['LDN-OLD-FORD', 950, 750], 'lying on the map: the parcel itself');
t = S.missionTarget(d, m06, {...at, ticks: {cafe: 1, collect: 1}, parcels: {'p1:1': {status: 'held', actorId: 'a1'}}});
assert.match(t.label, /^Deliver: /, 'carried: the handover');
t = S.missionTarget(d, m06, {...at, ticks: {cafe: 1, collect: 1}, parcels: {'p1:1': {status: 'world', sceneId: 'sc-of', tokenId: 'tp'}}});
assert.match(t.label, /^Pick up: /, 'dropped on the way: go back for it');
console.log(`sat nav on every mission: ${d.missions.length} missions, ${states} points along the way (in order and ticked out of order) — always the next place the job needs; cargo to the parcel, then the handover — ok`);
process.exit(0);
