// 0.5.27 mission contract corrections, applied to data/mission-automation.json, data/london-missions.json and
// data/tagging-catalogue.json (idempotent). Each one is a real problem found by playing every job through
// (tests/mission-playthrough.mjs) or by checking each checkpoint against what its objective says and where the GM file
// runs the scene: the order the sat nav takes you in, a checkpoint you couldn't complete where it was set, or a place
// that doesn't match what the objective says.
// Usage (system folder): node scripts/missions/fix-contracts.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {missionPaintPosition} from '../../module/graffiti/mission-placements.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), DATA = f => path.join(ROOT, 'data', f);
const read = f => JSON.parse(fs.readFileSync(DATA(f), 'utf8'));
const FILES = {'mission-automation.json': read('mission-automation.json'), 'london-missions.json': read('london-missions.json'), 'tagging-catalogue.json': read('tagging-catalogue.json')};
const M = FILES['mission-automation.json'].missions, LONDON = FILES['london-missions.json'].missions, CATALOGUE = FILES['tagging-catalogue.json'];
const TAGGING = read('tagging-missions.json').missions;
const atlas = read('london-street-atlas.json'), venues = read('london-venues.json').maps, places = read('london-places.json').maps;
const MAPS = new Map([...venues, ...places, ...atlas.maps].map(m => [m.id, m]));
const log = [], same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ helpers */
// The label in front of a zone name is whatever the rest of the contracts already call that map ("Leyton & Ruckholt").
const LABEL = new Map();
for (const m of Object.values(M)) for (const s of Object.values(m.steps)) for (const a of s.locations) if (!LABEL.has(a.mapId)) LABEL.set(a.mapId, a.name.slice(0, a.name.lastIndexOf(' / ')));
const anchor = (mapId, zoneId) => {
  const map = MAPS.get(mapId), z = map?.zones?.find(x => x.id === zoneId);
  if (!z?.rect) throw new Error(`no zone ${mapId}/${zoneId}`);
  const [x, y, w, h] = z.rect, a = {id: `${mapId}:${zoneId}`, mapId, zoneId, name: `${LABEL.get(mapId) ?? map.title ?? mapId} / ${z.name}`, rect: [...z.rect], x: x + w / 2, y: y + h / 2, reach: 2.4};
  if (mapId.startsWith('LDN-')) a.marginSquares = 2;   // street zones get the same margin as every other street checkpoint
  return a;
};
const step = (mid, sid) => { const s = M[mid]?.steps?.[sid]; if (!s) throw new Error(`${mid}/${sid} missing`); return s; };
const mission = mid => { const m = LONDON.find(x => x.id === mid); if (!m) throw new Error(`${mid} missing`); return m; };
const objective = (mid, oid) => { const o = mission(mid).objectives.find(x => x.id === oid); if (!o) throw new Error(`${mid}/${oid} missing`); return o; };
/** Put a checkpoint at one or more places ([[mapId, zoneId], …]). */
const place = (mid, sid, where, why) => { const s = step(mid, sid), next = where.map(([m, z]) => anchor(m, z)); if (!same(s.locations, next)) { s.locations = next; log.push(`${mid}/${sid}: now at ${next.map(a => a.name).join(' or ')} (${why})`); } };
const requires = (mid, sid, ids) => { const s = step(mid, sid), add = ids.filter(id => !s.requires.includes(id)); if (add.length) { s.requires.push(...add); log.push(`${mid}/${sid}: now waits for ${add.join(', ')}`); } };
const unrequire = (mid, sid, ids) => { const s = step(mid, sid), drop = ids.filter(id => s.requires.includes(id)); if (drop.length) { s.requires = s.requires.filter(id => !drop.includes(id)); log.push(`${mid}/${sid}: no longer waits for ${drop.join(', ')}`); } };
const propAt = (mid, pid, end, [mapId, zoneId]) => {
  const p = M[mid].props?.[pid]; if (!p) throw new Error(`${mid} prop ${pid} missing`);
  const a = anchor(mapId, zoneId), next = {...p, [end]: mapId, [`${end}Zone`]: zoneId, [`${end}Anchor`]: a};
  if (!same(p, next)) { M[mid].props[pid] = next; log.push(`${mid} ${pid}: ${end} at ${a.name}`); }
};
const resourceAt = (mid, rid, [mapId, zoneId]) => { const r = M[mid].resources.find(x => x.id === rid), a = anchor(mapId, zoneId); if (!same(r.location, a)) { r.location = a; log.push(`${mid} ${rid}: waits at ${a.name}`); } };
const contactAt = (mid, key, [mapId, zoneId]) => { const c = M[mid].contacts.find(x => x.key === key), a = anchor(mapId, zoneId); if (!same(c.location, a)) { c.location = a; log.push(`${mid} ${c.name}: now at ${a.name}`); } };
const supportAt = (mid, [mapId, zoneId]) => { const a = anchor(mapId, zoneId); for (const t of M[mid].support) if (!same(t.locations, [a])) { t.locations = [a]; log.push(`${mid} support "${t.label}": at ${a.name}`); } };
/** Text the players read (objective text, where, prop names and descriptions, the play guide). */
const setText = (obj, key, value, what) => { if (obj[key] !== value) { obj[key] = value; log.push(`${what}: text updated`); } };

/* ------------------------------------------------------------------ the opening */
// m09 Westfield: the shop is in Westfield Stratford City, not the London Stadium foyer.
const WESTFIELD = ['LDV-ST1', 'st1-1'];
for (const sid of ['case', 'stratford', 'grab']) place('m09', sid, [WESTFIELD], 'the shop is in Westfield, on the concourse');
propAt('m09', 'p1', 'pickup', WESTFIELD); supportAt('m09', WESTFIELD);
{
  const m = mission('m09'), p = m.props[0];
  setText(p, 'name', 'Stolen Westfield trainers', 'm09 prop');
  setText(p, 'pickup', 'LDV-ST1', 'm09 prop');
  setText(m.playGuide, 1, 'Find 1 × Stolen Westfield trainers at Westfield Stratford City (map LDV-ST1), on the concourse. Once on the scene, look for named mission-property tokens. You must stand close enough to physically collect each item. Do not just tick a checkbox.', 'm09 play guide');
  setText(m.playGuide, 2, 'Deliver every Stolen Westfield trainers to map LDP-FLAT. Hand it over from the carrier\'s inventory or Mission Board. A real delivery updates its objective; visiting the location alone does not count.', 'm09 play guide');
}
// m11 Raid: you save the ledger inside while the raid is on, not after Pat is already home at the flat.
unrequire('m11', 'ledger', ['pat']); requires('m11', 'ledger', ['arrive']);
// m12 Big Night: Stretch's lock-up is behind the Leyton Orient ground (the hook and the GM file), not a betting shop's front bar.
const LOCKUP = ['LDV-LY1', 'ly1-6'];
place('m12', 'leyton', [['LDN-LEYTON', 'leyton-orient-fc']], 'the football ground in Leyton');
for (const sid of ['in', 'take', 'physical-p1-collect']) place('m12', sid, [LOCKUP], 'the lock-ups behind the ground');
resourceAt('m12', 'stretch', LOCKUP); propAt('m12', 'p1', 'pickup', LOCKUP); supportAt('m12', LOCKUP);
// "Get everyone home" can only finish once Stretch's stock is delivered (or Stretch is brought instead), so the sat nav
// must take you to the crate first, not to the Arches with the crate still in Leyton.
requires('m12', 'home', ['physical-p1-deliver']);
{
  const m = mission('m12');
  setText(m, 'where', 'The Lea Boys\' lock-up behind the Leyton Orient ground, Leyton', 'm12 where');
  setText(m.props[0], 'pickup', 'LDV-LY1', 'm12 prop');
  setText(objective('m12', 'physical-p1-collect'), 'text', 'Physically collect 1 × Stretch\'s stock crate at the lock-up behind Leyton Orient stadium (map LDV-LY1)', 'm12 collect');
  setText(objective('m12', 'physical-p1-deliver'), 'text', 'Deliver 1 × Stretch\'s stock crate at The Arches (map LDP-ARCHES)', 'm12 deliver');
  setText(m.playGuide, 1, 'Find 1 × Stretch\'s stock crate at the lock-up behind Leyton Orient stadium (map LDV-LY1, the Loading Apron). Once on the scene, look for named mission-property tokens. You must stand close enough to physically collect each item. Do not just tick a checkbox.', 'm12 play guide');
}

/* ------------------------------------------------------------------ chapters and faction jobs */
// CH5: the rival rider is stopped at the VeloPark prize-giving (GM file ON1.3), not in a pub in Hackney Wick.
place('ch5', 'prize', [['LDV-ON1', 'on1-3']], 'the VeloPark prize-giving');
// CH6: "the workers at Essex Dry Goods and the Clapton Union Rooms": either place.
place('ch6', 'tenants', [['LDV-DB8', 'db8-1'], ['LDV-CL8', 'cl8-1']], 'the objective names both');
// CH7: who's backing who is asked of Moth, the fences or the drivers; Daz and the tool chest are in the Social Rooms'
// boxing room; every real debt is named at the MOTH Club sit-down (GM file CL7.4, OF7.3, HX7.2, HC5.4).
place('ch7', 'support', [['LDV-CL7', 'cl7-3'], ['LDV-OF7', 'of7-1'], ['LDV-HX7', 'hx7-1']], 'the objective names all three');
place('ch7', 'chest', [['LDV-CL7', 'cl7-4']], 'Daz is in the boxing room with the chest');
place('ch7', 'physical-p1-collect', [['LDV-CL7', 'cl7-4']], 'the chest is with Daz');
propAt('ch7', 'p1', 'pickup', ['LDV-CL7', 'cl7-4']);
place('ch7', 'debts', [['LDV-HC5', 'hc5-1']], 'the debts are named at the sit-down');
// CH8: either base can be chosen at either yard; the pledged deed is in the pavilion's account office (GM file ST7.5).
place('ch8', 'base', [['LDV-HC7', 'hc7-5'], ['LDV-HC8', 'hc8-2']], 'the Storehouse or the Clifden garage');
for (const sid of ['recovery', 'physical-p1-collect']) place('ch8', sid, [['LDV-ST7', 'st7-5']], 'the deed is in the account office');
propAt('ch8', 'p1', 'pickup', ['LDV-ST7', 'st7-5']);
// AD1: Patch is in Backspin Studio's live room (his HQ), where the objective sends you, not at Cafe OTO.
place('ad1', 'live', [['LDV-DA7', 'da7-3']], 'the live room'); contactAt('ad1', 'jules-akin', ['LDV-DA7', 'da7-3']);
// AD3: both programmes (Union Chapel or Hoxton Hall), and the back-up is lined up at North Echo, not The Lauriston.
place('ad3', 'bills', [['LDV-CG4', 'cg4-1'], ['LDV-HR2', 'hr2-1']], 'the objective names both');
place('ad3', 'backup', [['LDV-ON7', 'on7-1']], 'North Echo, as the objective says');
// AD8: the broadcast runs from whichever site the crew picked: the Round Chapel or the London Stadium.
for (const sid of ['night', 'choice']) place('ad8', sid, [['LDV-HC2', 'hc2-2'], ['LDV-ST2', 'st2-1']], 'either broadcast site');
// LB2: the crate is in the Orient Night Shed's cold cage (GM file HM7.4), and the call is made at the sit-down.
place('lb2', 'crate', [['LDV-HM7', 'hm7-4']], 'the crate is in the cold cage');
place('lb2', 'choice', [['LDV-CL2', 'cl2-1']], 'the crate is opened at the sit-down');
// TU2: the second recovery crew turns up at Barge East's mooring (GM file VW1.6), not at Bow Breakers.
place('tu2', 'crew', [['LDV-VW1', 'vw1-6']], 'the dock at Barge East');
place('tu2', 'choice', [['LDV-VW1', 'vw1-1']], 'aboard Barge East');
// TU8: the broadcast van is collected from Bridge Nine (where Dee waits), not from A&E.
place('tu8', 'van', [['LDV-ST8', 'st8-1']], 'the van bay at Bridge Nine');
place('tu8', 'choice', [['LDV-ST8', 'st8-1'], ['LDV-HX7', 'hx7-2']], 'from the van or the dispatch room');
// BB4: the cashier pays out at the Third Half Bookroom's betting room (GM file LY7.2), and the call is made there.
for (const sid of ['cashier', 'choice']) place('bb4', sid, [['LDV-LY7', 'ly7-2']], 'the betting room');
// MR7: the loads and the contractor are at the Marshgate depot or the East Cross compound.
place('mr7', 'loads', [['LDV-BF7', 'bf7-1'], ['LDV-WW8', 'ww8-1']], 'the objective names both');
// S04: the dog is with the trader at New Spitalfields; Ellis is hiding the cash tin in the Jubilee Park pavilion
// club room (GM file HM6.4); the call is made back at the pavilion with the organiser.
place('s04', 'trader', [['LDV-HM2', 'hm2-1']], 'the produce hall, as the objective says');
place('s04', 'ellis', [['LDV-HM6', 'hm6-4']], 'Ellis is in the club room');
place('s04', 'choice', [['LDV-HM6', 'hm6-1']], 'back with the organiser');
place('s04', 'physical-p2-collect', [['LDV-HM6', 'hm6-4']], 'Ellis has the tin');
propAt('s04', 'p2', 'pickup', ['LDV-HM6', 'hm6-4']); requires('s04', 'physical-p2-collect', ['ellis']);
{
  const m = mission('s04'), p = m.props.find(x => x.id === 'p2');
  setText(p, 'pickup', 1, 's04 prop');
  setText(p, 'description', 'The heavy fundraiser cash tin. Ellis has been hiding it in the Leyton Jubilee Park pavilion club room; hand it back to the organiser in the pavilion foyer.', 's04 prop');
  setText(objective('s04', 'physical-p2-collect'), 'text', 'Find Ellis and physically collect the Missing fundraiser cash tin in the Leyton Jubilee Park pavilion club room (LDV-HM6)', 's04 tin');
  setText(objective('s04', 'physical-p2-deliver'), 'text', 'Hand the Missing fundraiser cash tin back to the organiser in the Leyton Jubilee Park pavilion foyer (LDV-HM6)', 's04 tin');
}

/* ------------------------------------------------------------------ graffiti commissions */
// The Bow Flyover column is under the flyover itself (East Cross Route & Stratford High), not wherever a hash put it.
const pillar = CATALOGUE.sites.find(s => s.id === 'SP-BF-PILLAR');
if (pillar.anchorZone !== 'east-cross-route-stratford-high') { pillar.anchorZone = 'east-cross-route-stratford-high'; log.push('SP-BF-PILLAR: under the flyover'); }
// Every wall checkpoint goes where its paint spot actually appears (beside the venue on its street), not the map's
// first block. A "one of those, at Smashed It" bonus can be any of its walls.
const inside = (p, r) => p.x >= r[0] && p.x <= r[0] + r[2] && p.y >= r[1] && p.y <= r[1] + r[3];
const spotZone = (m, siteId) => {
  const site = CATALOGUE.sites.find(s => s.id === siteId), map = atlas.maps.find(x => x.id === site.sceneMapId), stop = m.stops.find(s => s.code === siteId);
  const p = missionPaintPosition(map, site, stop, venues, places, [], 100), hits = map.zones.filter(z => z.rect && inside(p, z.rect));
  const z = hits.find(z => ['road', 'junction'].includes(z.kind)) ?? hits[0];
  return [map.id, z.id];
};
for (const m of TAGGING) for (const o of m.objectives) {
  if (o.auto?.on !== 'tagPlaced') continue;
  const ids = o.auto.siteIds ?? [o.auto.siteId], where = [...new Map(ids.map(id => spotZone(m, id)).map(w => [w.join(':'), w])).values()];
  place(m.id, o.id, where, 'where the paint spot is');
}

/* ------------------------------------------------------------------ write */
const outputs = Object.entries(FILES).map(([f, d]) => [f, JSON.stringify(d, null, 2) + '\n']);
if (process.argv.includes('--check')) {
  const stale = outputs.filter(([f, out]) => fs.readFileSync(DATA(f), 'utf8') !== out).map(([f]) => f);
  if (stale.length) { console.log(`mission contracts need fixing (${stale.join(', ')}):\n${log.join('\n')}`); process.exit(1); }
  console.log('mission contracts: corrections in place');
} else {
  for (const [f, out] of outputs) if (fs.readFileSync(DATA(f), 'utf8') !== out) fs.writeFileSync(DATA(f), out);
  console.log(log.length ? log.join('\n') : 'mission contracts: nothing to change');
}
