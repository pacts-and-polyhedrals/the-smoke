// 0.5.22: Heat that fits the game. Thieving and carjacking stay at one star however often you do them; fighting tops
// out at two, gunfire at three; only taking a life brings four or five stars (armed response). The response itself is
// smaller, never more than the "most police vehicles on a map" setting, and stands down to match as the stars drop.
import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {NS, scene, token, vehicle, gm, settings, jaz, jt, chat, docs} from './chase-harness.mjs';
import {fakeActor} from './fakes.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import('../module/rules/core.mjs');
const {CRIMES, crimeHeatText} = await import('../module/config.mjs');
const after = (start, ...steps) => steps.reduce((h, [crime, byPolice = false]) => C.heatAfterCrime(h, crime, {byPolice}), start);

/* ---------------------------------------------------------------- the ladder */
for (const k of ['pickpocket', 'nickBike', 'nickCar', 'carjack', 'graffiti', 'dangerousDriving'])
  assert.equal(after(0, [k], [k, true], [k], [k, true]), 1, `${k}: one star at most, even again and again in front of the police`);
assert.equal(after(0, ['carjack', true], ['dangerousDriving', true]), 1, 'the old route to four stars (carjack + driving off in front of a patrol) is one star');
assert.equal(after(0, ['assault']), 1); assert.equal(after(0, ['assault'], ['assault'], ['assault', true]), 2, 'a fight tops out at two');
assert.equal(after(0, ['assaultCop']), 2, 'hitting a copper: two');
assert.equal(after(0, ['evading'], ['evading'], ['evading']), 2);
assert.equal(after(0, ['shooting']), 2, 'a gun fired: at least two'); assert.equal(after(0, ['shooting', true]), 3, 'in front of the police: the helicopter');
assert.equal(after(0, ['shooting', true], ['shooting', true], ['shooting', true]), 3, 'gunfire alone never brings armed response');
assert.equal(after(0, ['murder']), 4, 'a killing: four stars, armed response'); assert.equal(after(0, ['murder'], ['murder']), 5, 'a second killing: five');
assert.equal(after(0, ['copKiller']), 5, 'killing a police officer: five');
assert.equal(after(0, ['murder', true]), 4, 'a killing in front of the police is still four (not five)');
assert.equal(after(3, ['carjack']), 3, 'a petty crime never lowers Heat');
assert.equal(C.heatAfterCrime(0, 'murder', {witnessed: false}), 0, 'unseen is unseen');
assert.equal(crimeHeatText(CRIMES.carjack), '1★ at most'); assert.equal(crimeHeatText(CRIMES.shooting), 'at least 2★, up to 3★'); assert.equal(crimeHeatText(CRIMES.copKiller), '5★');
const units = s => { const r = C.policeResponse(s); return r.cars + r.bikes + r.vans + r.arv; };
assert.deepEqual([0, 1, 2, 3, 4, 5].map(units), [0, 1, 2, 2, 3, 6], 'police vehicles per star (it was 0, 1, 3, 4, 7, 10)');
assert.equal(C.policeResponse(3).helicopter, true); assert.equal(C.policeResponse(4).arv, 1); assert.equal(C.policeResponse(3).armed, false);

/* ---------------------------------------------------------------- the response on a map, and standing down */
globalThis.fetch = async url => { const f = path.join(root, 'data', path.basename(String(url))); return fs.existsSync(f) ? {ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8'))} : {ok: false}; };
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/london-vehicles.json'), 'utf8')).vehicles;
const unitActors = ['LV23', 'LV24', 'LV25', 'LV11', 'LV29'].map(id => { const v = catalog.find(x => x.id === id); const a = vehicle(v.name, {size: v.system.vehicle.size, perfDie: v.system.vehicle.perfDie});
  a.system.vehicle = {...a.system.vehicle, ...v.system.vehicle}; a.flags[NS] = {catalogId: id, streetLife: true}; a.prototypeToken = v.token; a.getTokenDocument = async () => ({toObject: () => ({name: v.name, width: v.token.width, height: v.token.height, flags: {}})}); return a; });
const people = ['pc', 'arv'].map(key => { const p = fakeActor({name: key === 'pc' ? 'PC' : 'Armed Officer', type: 'npc'}); p.flags[NS] = {npcKey: key, streetLife: true}; p.getTokenDocument = async () => ({toObject: () => ({name: p.name, width: 1, height: 1, flags: {}})}); return p; });
const all = [jaz, ...unitActors, ...people];
game.actors = Object.assign([...all], {get: id => all.find(a => a.id === id), find: f => all.find(f), filter: f => all.filter(f), some: f => all.some(f)});
scene.createEmbeddedDocuments = async (_t, list) => list.map(d => token(all.find(a => a.name === d.name) ?? people[0], {x: d.x, y: d.y, w: d.width ?? 1, h: d.height ?? 1, flags: d.flags?.[NS] ?? {}, name: d.name}));
scene.flags[NS] = {...(scene.flags[NS] || {}), streetAtlas: {id: 'LDN-TEST'}, zoneGraph: {zones: [{id: 'r1', kind: 'road', o: 'h', rect: [0, 3000, 12000, 300]}, {id: 'r2', kind: 'road', o: 'v', rect: [6000, 0, 300, 12000]}]}};
settings.policeResponse = true; settings.policeMaxUnits = 4;
const heat = await import('../module/world/heat.mjs');
const police = () => scene.tokens.filter(t => t.getFlag(NS, 'police') && t.getFlag(NS, 'police').unit !== 'officer');
const ofUnit = u => police().filter(t => t.getFlag(NS, 'police').unit === u).length;
await jt.setFlag(NS, 'vehicleSeat', null); await jt.update({x: 1000, y: 1000}, {smokeFootMove: true});
jaz.system.heat.value = 5;
await heat.respond(scene, jt);
assert.equal(police().filter(t => t.getFlag(NS, 'police').unit !== 'heli').length, 4, 'five stars, but never more than four police vehicles on the map (the setting)');
assert.equal(ofUnit('car'), 3); assert.equal(ofUnit('arv'), 1, 'the ceiling cuts the extras, not the ARV'); assert.equal(ofUnit('van'), 0); assert.equal(ofUnit('heli'), 1);
assert.ok(chat.some(m => /units dispatched/.test(m.content ?? '')));
// Stars come down to two: the ARV, a car and the helicopter go home (nobody can see them); two cars carry on.
for (const t of police()) await t.update({x: 11000, y: 11000}, {acVehicleCarry: true});
jaz.system.heat.value = 2;
const sent = await heat.scaleBack(scene);
assert.equal(sent, 3);
assert.deepEqual([ofUnit('car'), ofUnit('arv'), ofUnit('heli')], [2, 0, 0]);
// Units in sight of a character, or in a fight, are not magicked away.
jaz.system.heat.value = 1;
const near = police().find(t => t.getFlag(NS, 'police').unit === 'car'); await near.update({x: 1300, y: 1000}, {acVehicleCarry: true});
await heat.scaleBack(scene);
assert.ok(scene.tokens.get(near.id), 'the car you can see stays'); assert.equal(ofUnit('car'), 1, 'the unseen extra goes');
/* ---------------------------------------------------------------- killings are noticed */
const net = await import('../module/world/net.mjs');
await import('../module/combat/combat.mjs'); await import('../module/gameplay.mjs');
settings.combatAutoHeat = true;
const victim = (name, health = 3) => { const a = fakeActor({name, type: 'npc', health}); a.system.role = 'civilian'; const t = token(a, {x: 1200, y: 1000}); docs.set(t.uuid, t); return t; };
const shot = (target, extra = {}) => net.dispatch('combat.hit', {attackerTokenUuid: jt.uuid, targetTokenUuid: target.uuid, weaponName: 'Polymer Nine', weaponCrime: 'shooting', effect: '', loud: true, hit: true, margin: 3, total: 15, outcomeKey: 'fullSuccess', explosions: 0, impact: 4, armourBonus: 0, userId: gm.id, ...extra});
settings.combatAutoDamage = true;
jaz.system.heat.value = 0;
const lad = victim('Gang Lad', 3); await shot(lad);
assert.equal(lad.actor.system.resources.health.value, 0);
assert.equal(jaz.system.heat.value, 4, 'shot dead with witnesses about: a killing, four stars');
assert.ok(chat.some(m => /has killed Gang Lad/.test(m.content ?? '')));
// Knocked out with fists is not a killing.
jaz.system.heat.value = 0;
const drunk = victim('Drunk', 1);
await shot(drunk, {weaponName: 'Fists', weaponCrime: 'assault', impact: 0, loud: false});
assert.equal(drunk.actor.system.resources.health.value, 0);
assert.ok(jaz.system.heat.value <= 2, `floored with a punch: assault (${jaz.system.heat.value}★), not murder`);
// The chat-card path (Take hit) counts too.
settings.combatAutoDamage = false; jaz.system.heat.value = 1;
const pal = victim('Lookout', 2); await shot(pal);
const hitCard = chat.at(-1); assert.equal(hitCard.flags[NS].attack.lethal, true);
await net.dispatch('combat.resolve', {messageId: hitCard.id, userId: gm.id});
assert.equal(pal.actor.system.resources.health.value, 0); assert.equal(jaz.system.heat.value, 4, 'Take hit on a lethal shot that kills: four stars');
console.log('heat scaling: thieving and carjacking cap at 1★, fights 2★, guns 3★, killings (now detected) 4–5★; at most four police vehicles a map; extras go home as the stars drop — ok');
process.exit(0);
