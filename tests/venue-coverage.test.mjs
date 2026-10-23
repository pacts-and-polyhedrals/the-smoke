// 0.5.25: every place in the game is used. All 160 campaign venues are mission stops (most with an objective that
// points there), and every venue's street door is also somewhere jobs go: fares, parcels, patients, fires and fights.
// Every landmark on the street maps can be a fare or a delivery, including the two with no kerb of their own.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import * as J from '../module/rules/jobs-core.mjs';
const load = f => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const atlas = load('london-street-atlas.json'), venues = load('london-venues.json');
const missions = [...load('london-missions.json').missions, ...load('tagging-missions.json').missions, ...load('radio-war-missions.json').missions];
const real = venues.maps.filter(v => v.kind === 'venue');
assert.equal(real.length, 160);
// a mission stop for every venue
const stopCodes = new Set(missions.flatMap(m => (m.stops || []).flatMap(s => [s.code, String(s.placeId || '').replace(/^LDV-/, '')])));
const notStops = real.filter(v => !stopCodes.has(v.code)).map(v => v.code);
assert.deepEqual(notStops, [], 'every venue is a mission stop');
// a job location for every venue
const spots = J.venueSpots(venues, atlas);
assert.equal(spots.length, 160, 'every venue door is on its street map');
const reached = new Set();
for (const m of atlas.maps) for (let i = 0; i < 400; i++) {
  let k = 0; const seq = [0, i / 400]; const r = () => seq[Math.min(k++, 1)];
  const d = J.pickDestination(atlas, m.id, {minHops: 0, maxHops: 2, venues: spots, venueChance: 1, r});
  if (d?.venue) reached.add(d.code);
}
assert.deepEqual(real.filter(v => !reached.has(v.code)).map(v => v.code), [], 'every venue can be a fare or a delivery from somewhere');
for (const m of atlas.maps) assert.ok(J.venueKerbsOn(spots, m.id).length || !real.some(v => v.street === m.id), `${m.id}: a venue door for pickups`);
// every landmark is a destination from somewhere
const names = new Set(atlas.maps.flatMap(m => m.zones.filter(z => z.landmark).map(z => z.name)));
const got = new Set();
for (const m of atlas.maps) for (let i = 0; i < 300; i++) { const d = J.pickDestination(atlas, m.id, {minHops: 0, maxHops: 2, r: () => i / 300}); if (d) got.add(d.label); }
assert.deepEqual([...names].filter(n => !got.has(n)), [], 'every landmark is a job destination');
console.log(`places: all ${real.length} venues are mission stops and job locations (fares, parcels, patients, fires, fights); all ${names.size} landmarks are destinations — ok`);
process.exit(0);
