// Missions: the data is sound, missions unlock in order, events tick objectives, MISSION PASSED pays everyone on it.
import assert from 'assert';
import {fakeActor, chat, J} from './fakes.mjs';
const NS = 'the-smoke';
const data = J('london-missions.json');
const settings = new Map();
game.settings.get = (ns, k) => settings.get(k); game.settings.set = async (ns, k, v) => settings.set(k, v); game.settings.register = () => null;
game.users = Object.assign([{id: 'gm', isGM: true, active: true}], {activeGM: {id: 'gm'}, get: id => ({id, isGM: true})});
globalThis.fetch = async () => ({ok: true, json: async () => data});
const M = await import('../module/world/missions.mjs');
const net = await import('../module/world/net.mjs');

// The data: the 12 opening missions plus the Sandbox Campaign (12 careers × 8, CH1–CH3 being Missions 1–3, and 20 local
// cases); every requirement exists, every auto rule is well-formed, every page is in its journal.
const opening = data.missions.filter(m => m.group === 'opening'), careers = data.missions.filter(m => m.faction && m.group !== 'opening'), cases = data.missions.filter(m => m.group === 'local');
assert.equal(opening.length, 12); assert.equal(careers.length, 93); assert.equal(cases.length, 20); assert.equal(data.missions.length, 125);
const ids = new Set(data.missions.map(m => m.id)); assert.equal(ids.size, 125, 'unique ids');
const codes = data.missions.filter(m => m.code).map(m => m.code); assert.equal(new Set(codes).size, codes.length, 'unique codes'); assert.equal(codes.length, 116);
const journals = Object.fromEntries(J('london-guides.json').journals.map(j => [j.key, j]));
for (const m of data.missions) {
  for (const r of m.requires) { assert.ok(ids.has(r), `${m.id} needs ${r}`); if (m.n) assert.ok(data.missions.find(x => x.id === r).n < m.n, `${m.id}: ${r} comes earlier`); }
  for (const o of m.objectives) if (o.auto) assert.ok(['sold', 'map', 'service', 'job', 'buy', 'cargoCollected', 'cargoDelivered'].includes(o.auto.on), `${m.id}.${o.id}: auto rule`);
  assert.ok(m.objectives.length >= 3 && m.hook && m.giver && m.title, `${m.id}: hook, giver and objectives`);
  assert.ok(journals[m.journalKey]?.pages.some(p => p.name === m.page), `${m.id}: its page is in ${m.journalKey}`);
  assert.match(m.pageUuid, /^Compendium\.the-smoke\.guides\.JournalEntry\.[0-9a-f]{16}\.JournalEntryPage\.[0-9a-f]{16}$/);
}
const atlas = J('london-street-atlas.json'), places = J('london-places.json'), venues = J('london-venues.json'), maps = new Set([...atlas.maps, ...places.maps, ...venues.maps].map(m => m.id));
const zones = Object.fromEntries(atlas.maps.map(m => [m.id, new Set(m.zones.map(z => z.id))]));
for (const m of data.missions) {
  for (const o of m.objectives) { if (o.auto?.on === 'map') assert.ok(maps.has(o.auto.mapId), `${o.auto.mapId} is a real map`); if (o.stop != null) assert.ok(m.stops[o.stop], `${m.id}.${o.id}: its stop`); }
  for (const s of m.stops || []) { assert.ok(maps.has(s.mapId), `${m.id}: ${s.code} on a real map`); if (s.zoneId) assert.ok(zones[s.mapId]?.has(s.zoneId), `${m.id}: ${s.code} anchor ${s.zoneId}`); }
}
// The voice: every campaign job and case lands as the giver's texts (the hook is the thread in one line); its GM notes say
// how it goes down; every career finale has a twist; its journal page opens on the call and carries the heat and the twist.
for (const m of [...careers, ...cases]) {
  assert.ok(Array.isArray(m.call) && m.call.length >= 2 && m.call.length <= 5, `${m.id}: the call is a short text thread`);
  assert.equal(m.hook, m.call.join(' '), `${m.id}: the hook is the call`);
  assert.match(m.gm, /How it goes down/, `${m.id}: how it goes down`); assert.ok(m.twist, `${m.id}: the heat`);
  assert.equal(new Set(m.objectives.map(o => o.id)).size, m.objectives.length, `${m.id}: objective ids unique`);
  const page = journals[m.journalKey].pages.find(p => p.name === m.page).html;
  assert.match(page, /The call<\/h2><div class="sj-phone">/, `${m.id}: the page opens on the call`); assert.match(page, /The heat/, `${m.id}: the heat`);
  if (m.stage === 8) { assert.match(m.gm, /The twist/, `${m.id}: a finale twist`); assert.match(page, /sj-box twist/, `${m.id}: the twist on the page`); }
}
for (const m of opening.filter(x => x.code)) assert.match(m.campaign, /How it goes down/, `${m.id}: the campaign expansion in the same voice`);
// careers: eight stages, the plan's offer gates, Renown awards and fees; one Influence back (two for the capstone)
const GATES = [0, 1, 3, 5, 8, 11, 15, 20], RENOWN = [1, 2, 2, 3, 3, 4, 5, 5], FEES = [80, 120, 160, 240, 320, 480, 640, 1000];
for (const fc of Object.keys(data.factions)) {
  const career = data.missions.filter(m => m.faction === fc).sort((a, b) => a.stage - b.stage);
  assert.deepEqual(career.map(m => m.stage), [1, 2, 3, 4, 5, 6, 7, 8], `${fc}: eight stages`);
  assert.deepEqual(career.map(m => m.gate), GATES, `${fc}: offer gates`); assert.deepEqual(career.map(m => m.rewards.renown[fc]), RENOWN, `${fc}: Renown`);
  if (fc !== 'CH') assert.deepEqual(career.map(m => m.rewards.fee), FEES, `${fc}: fees`);
  assert.deepEqual(career.map(m => m.rewards.influence), [1, 1, 1, 1, 1, 1, 1, 2]);
  assert.deepEqual(data.factions[fc].career, career.map(m => m.id), `${fc}: the profile lists its career`);
}
assert.deepEqual(data.missions.filter(m => m.faction === 'CH' && m.stage <= 3).map(m => m.id), ['m01', 'm02', 'm03'], 'CH1–CH3 are Missions 1–3');
for (const c of cases) { assert.equal(c.rewards.renownPick.length, 2); assert.ok(c.rewards.renownPick.every(k => data.factions[k]), `${c.code}: Renown factions`); assert.ok(c.rewards.fee > 0); }
for (const [code, r] of Object.entries(data.refs)) assert.ok(journals[r.key]?.pages.some(p => p.name === r.page), `${code} → ${r.page}`);

// Unlocking: requirements, then the faction's offer gate.
const st = {}, byId = id => data.missions.find(m => m.id === id);
assert.equal(M.statusOf(byId('m01'), st, {}), 'available');
assert.equal(M.statusOf(byId('m02'), st, {}), 'locked');
st.m01 = {status: 'done'};
assert.equal(M.statusOf(byId('m02'), st, {}), 'locked', 'CH2 needs Renown 1 with the Chainring');
assert.equal(M.statusOf(byId('m02'), st, {CH: {renown: 1}}), 'available');
assert.equal(M.statusOf(byId('m03'), st, {CH: {renown: 1}}), 'locked', 'CH3 needs Renown 3');
assert.equal(M.statusOf(byId('m03'), st, {CH: {renown: 3}}), 'available');
assert.equal(M.statusOf(byId('m12'), st, {}), 'locked');
assert.equal(M.statusOf(byId('ad1'), {}, {}), 'available', 'every career opens at Renown 0');
assert.equal(M.statusOf(byId('ad2'), {}, {AD: {renown: 0}}), 'locked'); assert.equal(M.statusOf(byId('s07'), {}, {}), 'available', 'local cases are open');
assert.match(M.lockReason(byId('nm4'), {}, data, {}), /Renown 5 with The Night Market/);
assert.deepEqual(M.rankOf(0), {at: 0, name: 'Unproven', cap: 1}); assert.equal(M.rankOf(7).name, 'Trusted'); assert.equal(M.rankOf(26).cap, 6);
assert.deepEqual(M.renownAward(byId('s07'), 'AD'), {AD: 1}); assert.deepEqual(M.renownAward(byId('s07'), 'XX'), {VC: 1}, 'an unknown pick falls back to the first');
const stand = M.applyStanding({}, byId('nm8')); assert.deepEqual(stand.factions.NM, {renown: 5, influence: 2, stance: 'open'}); assert.equal(stand.changes[0].rank, 'Known');
assert.equal(M.shareOf(byId('ad1'), 2), 40); assert.equal(M.shareOf(byId('m01'), 4), 60, 'the opening pays per head');

// Events tick only matching, active missions, for the characters on them.
const jaz = fakeActor({name: 'Jaz', cash: 0}), sal = fakeActor({name: 'Sal', cash: 0});
game.actors = Object.assign([jaz, sal], {get: id => [jaz, sal].find(a => a.id === id), filter: f => [jaz, sal].filter(f)});
jaz.hasPlayerOwner = sal.hasPlayerOwner = true;
const s2 = {m01: {status: 'active', ticks: {}, actorIds: [jaz.id, sal.id]}};
assert.deepEqual(M.applyEvent(data.missions, s2, {on: 'sold', service: 'chop', actorId: jaz.id}), [], 'a car to Bow Breakers is not Pat');
assert.deepEqual(M.applyEvent(data.missions, s2, {on: 'sold', service: 'gang', catalogId: 'LV01', actorId: jaz.id}), ['m01']);
assert.equal(s2.m01.ticks.sell, 1); assert.equal(M.objectiveDone(data.missions[0].objectives[2], s2.m01), false, '1 of 2');
const outsider = fakeActor({name: 'Stranger'});
assert.deepEqual(M.applyEvent(data.missions, s2, {on: 'sold', service: 'gang', actorId: outsider.id}), [], 'not on the mission');

// The whole of Mission 1 through the leader: start, a map event, two sales, a GM tick → MISSION PASSED and pay-out.
settings.set('missions', {m01: {status: 'done'}});
await net.request('mission.set', {id: 'm01', status: 'reset'});
assert.equal(M.statusOf(data.missions[0], settings.get('missions')), 'available', 'reset');
await net.request('mission.start', {id: 'm01', actorIds: [jaz.id, sal.id]});
assert.equal(settings.get('missions').m01.status, 'active');
await M.missionEvent({on: 'map', mapId: 'LDP-ARCHES', actorId: sal.id});
await M.missionEvent({on: 'sold', service: 'gang', catalogId: 'LV02', actorId: jaz.id});
await M.missionEvent({on: 'sold', service: 'gang', catalogId: 'LV01', actorId: jaz.id});
assert.equal(settings.get('missions').m01.status, 'active', 'the nick objective is still the GM\'s to tick');
await net.request('mission.tick', {id: 'm01', objId: 'nick'});
assert.equal(settings.get('missions').m01.status, 'done', 'MISSION PASSED');
assert.equal(jaz.system.cash, 60); assert.equal(sal.system.cash, 60, 'both paid');
assert.equal(jaz.system.rep.xp, 3); assert.equal(jaz.system.rep.crew, 1);
assert.ok(chat.some(c => /MISSION PASSED/.test(c.content || '')), 'the passed card');
assert.deepEqual(settings.get('factions').CH, {renown: 1, influence: 1, stance: 'open'}, '+1 Renown with the Chainring');
assert.equal(M.statusOf(data.missions[1], settings.get('missions'), settings.get('factions')), 'available', 'M2 opens');
assert.ok(chat.some(c => /Now open: <b>CH2 The Whippet/.test(c.content || '')), 'the card names what opened');
// A faction commission: a crew fee split between the crew, Renown and Influence, and its next commission opening.
const cashBefore = jaz.system.cash;
await net.request('mission.start', {id: 'ad1', actorIds: [jaz.id, sal.id]});
await net.request('mission.set', {id: 'ad1', status: 'done'});
assert.equal(jaz.system.cash - cashBefore, 40, '£80 crew fee, two of them');
assert.deepEqual(settings.get('factions').AD, {renown: 1, influence: 1, stance: 'open'});
assert.equal(M.statusOf(byId('ad2'), settings.get('missions'), settings.get('factions')), 'available', 'AD2 opens at Renown 1');
assert.ok(chat.some(c => /AD1 · /.test(c.content || '') && /class="smoke-call"/.test(c.content || '') && /sj-text in/.test(c.content || '')), 'the job lands as a text thread from the giver');
// A local case: the GM picks which faction gets the Renown.
await net.request('mission.start', {id: 's01', actorIds: [jaz.id]});
await net.request('mission.set', {id: 's01', status: 'done', renownTo: 'BM'});
assert.equal(settings.get('factions').BM.renown, 1); assert.equal(settings.get('factions').AD.renown, 1, 'only one faction is paid');
// The GM's faction panel: Renown, Influence within the rank's cap, stance.
await net.request('faction.set', {code: 'NM', renown: 7}); assert.equal(settings.get('factions').NM.renown, 7);
await net.request('faction.set', {code: 'NM', influence: 9}); assert.equal(settings.get('factions').NM.influence, 3, 'capped at Trusted');
await net.request('faction.set', {code: 'NM', stance: 'hostile'}); assert.equal(settings.get('factions').NM.stance, 'hostile');
await assert.rejects(net.request('faction.set', {code: 'NM', stance: 'cross'}), /stance/);
// Failing.
// 0.5.23: "get to the market" ticks for someone already standing on that map when the mission starts, and for a
// character the GM drops straight onto a map (no map crossing needed).
const market = {id: 'sc-hag', getFlag: (ns, k) => k === 'streetAtlas' ? {id: 'LDN-HAGGERSTON'} : null, tokens: [{actorId: jaz.id, hidden: false}]};
game.scenes = [market];
await net.request('mission.set', {id: 'm02', status: 'reset'});
await net.request('mission.start', {id: 'm02', actorIds: [jaz.id]});
assert.equal(settings.get('missions').m02.ticks.market, 1, 'already at the market: ticked at the start');
await net.request('mission.set', {id: 'm02', status: 'reset'}); game.scenes = [];
await net.request('mission.start', {id: 'm02', actorIds: [jaz.id]});
assert.equal(settings.get('missions').m02.ticks.market, undefined);
M.installMissions(); Hooks.callAll('createToken', {actor: jaz, hidden: false, parent: market}, {});
for (let i = 0; i < 20 && !settings.get('missions').m02.ticks.market; i++) await new Promise(r => setTimeout(r, 5));
assert.equal(settings.get('missions').m02.ticks.market, 1, 'dropped onto the map by the GM: ticked');
await net.request('mission.set', {id: 'm02', status: 'failed'});
assert.equal(settings.get('missions').m02.status, 'failed');
console.log('missions: 12 opening missions, 12 faction careers and 20 local cases wired to pages, maps and places; every job a text thread with a twist at each finale; gates, Renown, Influence, fees, auto ticks, MISSION PASSED, fail and reset — ok');
process.exit(0);
