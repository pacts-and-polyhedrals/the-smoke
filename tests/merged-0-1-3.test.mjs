// The 0.1.3 work inside 0.2.1: local services, rest and first aid, advances, Take hit / Dodge, the core-tracker turn
// clock, the leader request channel, pirate radio, free reloads, and the merged content (items, NPC notes, guides).
import assert from 'assert';
import {fakeActor, itemNamed, conditionNames, chat, uid, setPath, J, LIB} from './fakes.mjs';
const NS = 'the-smoke';
globalThis.canvas = {scene: null, tokens: {controlled: []}};
game.users = Object.assign([{id: 'gm', isGM: true, active: true}, {id: 'p1', isGM: false, active: true}], {activeGM: {id: 'gm'}, get: id => ({id, isGM: id === 'gm', name: id})});
game.user = {id: 'gm', isGM: true, targets: new Set()};
const settings = new Map(); game.settings.get = (ns, k) => settings.get(k); game.settings.set = async (ns, k, v) => settings.set(k, v); game.settings.register = () => null;

// Chat messages that keep their flags, so "resolves once" can be checked.
const msgs = new Map(); game.messages = Object.assign([], {get: id => msgs.get(id)});
function message(data) {
  const m = {id: uid(), ...data, flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    getFlag(ns, k) { return this.flags?.[ns]?.[k]; }, async setFlag(ns, k, v) { (this.flags[ns] ??= {})[k] = v; return this; },
    async update(u) { for (const [k, v] of Object.entries(u)) setPath(this, k, v); return this; }};
  msgs.set(m.id, m); chat.push(m); return m;
}
globalThis.ChatMessage = {implementation: {create: async d => message(d)}, getSpeaker: () => ({})};

const net = await import('../module/world/net.mjs');

/* ---------------------------------------------------------------- the request channel */
{
  class Doc {} globalThis.foundry.abstract.Document = Doc;
  const d = Object.assign(new Doc(), {id: 'x1', uuid: 'Actor.x1', name: 'big'});
  assert.deepEqual(net.wire({doc: d, list: [d, 2], fn: () => 1, n: null}), {doc: {id: 'x1', uuid: 'Actor.x1'}, list: [{id: 'x1', uuid: 'Actor.x1'}, 2], fn: null, n: null}, 'replies carry plain data');
  // Commands run one at a time on the leader, in order.
  const order = []; net.registerHandler('t.slow', async () => { await new Promise(r => setTimeout(r, 20)); order.push('slow'); return 1; }); net.registerHandler('t.fast', async () => { order.push('fast'); return 2; });
  const [a, b] = await Promise.all([net.request('t.slow'), net.request('t.fast')]);
  assert.deepEqual([a, b, ...order], [1, 2, 'slow', 'fast'], 'serialised in arrival order');
}

/* ---------------------------------------------------------------- scenes for services */
const atlas = J('london-street-atlas.json').maps;
function sceneOf(mapId, place = null) {
  const m = atlas.find(x => x.id === mapId);
  const tokens = new Map(); const scene = {id: `s-${mapId}`, name: m?.name ?? place, grid: {size: m?.gridSize ?? 100}, width: m?.width, height: m?.height,
    getFlag: (ns, k) => (place ? {place: {id: place}, zoneGraph: {zones: []}} : {zoneGraph: {zones: m.zones}, streetAtlas: {id: m.id}})[k],
    tokens: Object.assign(tokens, {filter: f => [...tokens.values()].filter(f), find: f => [...tokens.values()].find(f), some: f => [...tokens.values()].some(f)})};
  return scene;
}
function tok(scene, actor, x, y, flags = {}) {
  const t = {id: uid(), name: actor.name, actor, actorId: actor.id, parent: scene, x, y, width: 1, height: 1, flags: {[NS]: {...flags}},
    getFlag(ns, k) { return this.flags[NS]?.[k]; }, async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith(`flags.${NS}.`)) this.flags[NS][k.slice(NS.length + 7)] = v; else setPath(this, k, v); } return this; }};
  scene.tokens.set(t.id, t); actor.token = null; return t;
}
const dalston = sceneOf('LDN-DALSTON'), hag = sceneOf('LDN-HAGGERSTON');
game.scenes = Object.assign([dalston, hag], {get: id => [dalston, hag].find(s => s.id === id)});
const zone = (map, svc) => atlas.find(m => m.id === map).zones.find(z => z.service === svc);

const S = await import('../module/world/services.mjs');
const Shops = await import('../module/world/shops.mjs');
/* ---------------------------------------------------------------- local services */
{
  assert.equal(S.servicePrice('respray'), 100); assert.equal(S.servicePrice('clothes'), 25);
  settings.set('resprayCost', 150); assert.equal(S.servicePrice('respray'), 150, 'the GM sets the price'); settings.delete('resprayCost');
  // Change clothes at Ridley Road: −1 star for £25, but not with police watching.
  const jaz = fakeActor({name: 'Jaz', cash: 100, heat: 2}); game.actors = Object.assign([jaz], {get: id => id === jaz.id ? jaz : null});
  const m = zone('LDN-DALSTON', 'clothes'), tj = tok(dalston, jaz, m.rect[0] + 50, m.rect[1] + 50);
  const offer = S.offerFor(jaz, 'clothes', {sceneId: dalston.id, tokenId: tj.id});
  assert.equal(offer.price, 25); assert.equal(offer.zone.service, 'clothes');
  await net.request('service.use', {actorUuid: jaz.uuid, kind: 'clothes', quote: 25, sceneId: dalston.id, tokenId: tj.id});
  assert.equal(jaz.system.cash, 75); assert.equal(jaz.system.heat.value, 1, 'one star off');
  const cop = fakeActor({name: 'Area car', type: 'vehicle'}); tok(dalston, cop, tj.x + 300, tj.y, {police: {unit: 'car'}});
  assert.throws(() => S.offerFor(jaz, 'clothes', {sceneId: dalston.id, tokenId: tj.id}), /police can see you/);
  // The same rules through the Shop window's Services list.
  await assert.rejects(net.request('shop.service', {actorId: jaz.id, shopKey: 'clothes', service: 'clothes'}), /police can see you/);
  // Respray: the driver brings the car in; Heat cleared, new plate, old ANPR marker gone, still stolen for the fence.
  const car = fakeActor({name: 'Vexa Hatch', type: 'vehicle'}); car.system.vehicle = {klass: 'car', size: 2, body: {value: 5, max: 10}, flats: 1, plateless: false, destroyed: false};
  const r = zone('LDN-HAGGERSTON', 'respray'), tv = tok(hag, car, r.rect[0] + 40, r.rect[1] + 40, {plate: 'AB12 CDE', stolen: true, marker: {kind: 'stolen'}, vehicleOccupants: []});
  const dan = fakeActor({name: 'Danny', cash: 300, heat: 3}); const td = tok(hag, dan, tv.x, tv.y, {vehicleSeat: {vehicleTokenId: tv.id, seatId: 'pilot'}});
  tv.flags[NS].vehicleOccupants = [{tokenId: td.id, seatId: 'pilot'}];
  game.actors = Object.assign([jaz, dan, car], {get: id => [jaz, dan, car].find(a => a.id === id)});
  const sp = S.offerFor(dan, 'respray', {sceneId: hag.id, tokenId: td.id});
  assert.equal(sp.price, 100);
  await S.performService(dan, 'respray', sp);
  assert.equal(dan.system.heat.value, 0); assert.equal(dan.system.cash, 200); assert.notEqual(tv.flags[NS].plate, 'AB12 CDE'); assert.equal(tv.flags[NS].previousPlate, 'AB12 CDE');
  assert.equal(tv.flags[NS].marker, null); assert.equal(tv.flags[NS].resprayed, true); assert.equal(tv.flags[NS].stolen, true, 'still stolen for the fence');
  // Garage: £10 per missing Body, a flat counting as six; passengers cannot book it.
  const rp = S.offerFor(dan, 'repair', {sceneId: hag.id, tokenId: td.id}); assert.equal(rp.price, 10 * (5 + 6));
  await S.performService(dan, 'repair', rp); assert.equal(car.system.vehicle.body.value, 10); assert.equal(car.system.vehicle.flats, 0); assert.equal(dan.system.cash, 90);
  td.flags[NS].vehicleSeat.seatId = 'back';
  assert.throws(() => S.offerFor(dan, 'repair', {sceneId: hag.id, tokenId: td.id}), /seated driver/);
  // Cash in the stash is protected.
  dan.system.cash = 10; dan.system.stash = 5000; td.flags[NS].vehicleSeat.seatId = 'pilot'; car.system.vehicle.body.value = 2;
  await assert.rejects(S.performService(dan, 'repair', S.offerFor(dan, 'repair', {sceneId: hag.id, tokenId: td.id})), /pockets\. Your stash is protected/);
  assert.equal(dan.system.stash, 5000);
}

/* ---------------------------------------------------------------- rest, first aid, advances */
const G = await import('../module/gameplay.mjs');
{
  const flat = sceneOf('LDP-FLAT', 'LDP-FLAT');
  const sal = fakeActor({name: 'Sal', heat: 3, health: 14}); sal.system.resources.health.value = 4; sal.system.resources.hustle.value = 0;
  const ts = tok(flat, sal, 700, 200);
  assert.match(G.restProblem(sal, ts), /three stars/);
  sal.system.heat.value = 2; await sal.addCondition('Bleeding');
  assert.match(G.restProblem(sal, ts), /Bleeding/);
  await sal.removeCondition('Bleeding'); await sal.addCondition('Hurt'); await sal.addCondition('Broken'); await sal.addCondition('Cuffed');
  assert.equal(G.restProblem(sal, ts), null);
  const street = sceneOf('LDN-DALSTON'); const ts2 = tok(street, sal, 100, 100);
  assert.match(G.restProblem(sal, ts2), /flat or a safehouse/, 'not on a street corner');
  assert.equal(G.restProblem(sal, ts2, {isGM: true}), null, 'the GM can rest anyone anywhere');
  const priorTime=game.time;
  game.time={worldTime:1200,advance:async seconds=>(game.time.worldTime+=seconds)};
  const night=await G.restNow(sal);
  assert.equal(night.watchSeconds,28800);
  assert.equal(game.time.worldTime,30000,'rest advances exactly eight watch hours');
  game.time=priorTime;
  assert.equal(sal.system.resources.health.value, 14); assert.equal(sal.system.resources.hustle.value, 3); assert.equal(sal.system.heat.value, 0);
  assert.deepEqual(conditionNames(sal), ['Broken', 'Cuffed'], 'a broken bone and cuffs stay');

  // First aid: a successful Savvy roll offers one treatment per injury.
  const femi = fakeActor({name: 'Femi'}), jaz = fakeActor({name: 'Jaz'}); jaz.system.resources.health.value = 5; await jaz.addCondition('Bleeding');
  game.actors = Object.assign([femi, jaz], {get: id => [femi, jaz].find(a => a.id === id)});
  const roll = message({content: 'roll', flags: {[NS]: {roll: {success: true, stat: 'sav', actorUuid: femi.uuid, context: {kind: 'firstAid', target: jaz.uuid}}}}});
  const {messageId} = await net.request('aid.offer', {messageId: roll.id});
  await assert.rejects(net.request('aid.offer', {messageId: roll.id}), /unavailable/, 'one card per roll');
  await net.request('aid.apply', {messageId});
  assert.equal(jaz.system.resources.health.value, 7); assert.deepEqual(conditionNames(jaz), []);
  const again = message({content: 'roll', flags: {[NS]: {roll: {success: true, stat: 'sav', actorUuid: femi.uuid, context: {kind: 'firstAid', target: jaz.uuid}}}}});
  await assert.rejects(net.request('aid.offer', {messageId: again.id}), /already had first aid/, 'once per injury');

  // Advances: one stat step within the Rep stage's cap.
  jaz.system.stats.mov.die = 6; jaz.system.advancement = {available: 1, spent: 0}; jaz.system.stage = 1;
  await net.request('progression.advance', {actorUuid: jaz.uuid, stat: 'mov', fromDie: 6});
  assert.equal(jaz.system.stats.mov.die, 8); assert.equal(jaz.system.advancement.available, 0); assert.equal(jaz.system.advancement.spent, 1);
  jaz.system.advancement.available = 1;
  await assert.rejects(net.request('progression.advance', {actorUuid: jaz.uuid, stat: 'mov', fromDie: 8}), /no longer available/, 'Rep 1 caps at d8');
  // The GM Screen hands them out too.
  const A = await import('../module/gm/automation.mjs');
  await net.request('gm.reward', {actorIds: [jaz.id], advance: true});
  assert.equal(jaz.system.advancement.available, 2);
}

/* ---------------------------------------------------------------- Take hit or Dodge, once; one condition */
{
  const att = fakeActor({name: 'Stretch', type: 'npc'}), def = fakeActor({name: 'Jaz'});
  const scene = sceneOf('LDN-DALSTON'); const tt = tok(scene, def, 0, 0); tt.uuid = `Token.${tt.id}`;
  const prev = globalThis.fromUuid; globalThis.fromUuid = async u => u === tt.uuid ? tt : prev(u);
  def.system.states = {reactionUsed: false};
  const card = () => message({content: 'hit', flags: {[NS]: {attack: {target: tt.uuid, total: 13, damage: 4, attacker: att.uuid, attackerName: 'Stretch', severity: 'Moderate', conditions: ['Hurt', 'Stunned'], effects: ['Prone']}}}});
  // Dodge: Moves beats the total — no damage, reaction spent.
  def.rolls.push({outcomeKey: 'fullSuccess', total: 15, margin: 2});
  const c1 = card(); await net.request('combat.resolve', {messageId: c1.id, dodge: true});
  assert.equal(def.system.resources.health.value, 10); assert.equal(c1.flags[NS].resolution, 'dodged'); assert.equal(def.system.states.reactionUsed, true);
  await assert.rejects(net.request('combat.resolve', {messageId: c1.id}), /already been resolved/);
  await assert.rejects(net.request('combat.condition', {messageId: c1.id, condition: 'Hurt'}), /as a hit/, 'no condition after a dodge');
  // No reaction left: take it. The weapon's effect lands; then the GM picks one listed condition, once.
  const c2 = card(); await assert.rejects(net.request('combat.resolve', {messageId: c2.id, dodge: true}), /No reaction/);
  await net.request('combat.resolve', {messageId: c2.id});
  assert.equal(def.system.resources.health.value, 6); assert.ok(conditionNames(def).includes('Prone'), 'a taser-style effect lands with the hit');
  await assert.rejects(net.request('combat.condition', {messageId: c2.id, condition: 'Broken'}), /listed conditions/);
  await net.request('combat.condition', {messageId: c2.id, condition: 'Hurt'});
  await assert.rejects(net.request('combat.condition', {messageId: c2.id, condition: 'Stunned'}), /already been chosen/);
  assert.deepEqual(conditionNames(def), ['Hurt', 'Prone']);
  globalThis.fromUuid = prev;
}

/* ---------------------------------------------------------------- the core tracker's turn clock (not the Console) */
{
  const a = fakeActor({name: 'Kez'}); a.system.states = {reactionUsed: true, down: false, downRounds: 0}; await a.addCondition('Bleeding'); await a.addCondition('Stunned');
  const b = fakeActor({name: 'Lea Boy', type: 'npc'}); b.system.states = {reactionUsed: true, down: true, downRounds: 1};
  const cA = {id: 'cA', tokenId: 'tA', actor: a}, cB = {id: 'cB', tokenId: 'tB', actor: b};
  const plain = {id: 'k1', round: 1, turn: 1, combatant: cB, combatants: Object.assign([cA, cB], {find: f => [cA, cB].find(f)}), turns: [cA, cB], previous: {round: 1, turn: 0, combatantId: 'cA', tokenId: 'tA'}, getFlag: () => null};
  await G.processCombatTurn(plain, {turn: 1});
  assert.equal(a.system.resources.health.value, 9, 'Bleeding at the end of Kez\'s turn'); assert.ok(!conditionNames(a).includes('Stunned'), 'Stunned wears off');
  assert.equal(b.system.states.reactionUsed, false, 'reaction back at the start of a turn'); assert.equal(b.system.states.downRounds, 2, 'the Down clock ticks');
  assert.match(chat.at(-1).content, /Round 2\/3/);
  // A Combat Console fight (speed dice) runs its own round end instead.
  const before = a.system.resources.health.value;
  await G.processCombatTurn({...plain, getFlag: (ns, k) => k === 'state' ? {phase: 'resolve'} : null, previous: {...plain.previous}}, {turn: 1});
  assert.equal(a.system.resources.health.value, before, 'no double Bleeding in a speed-dice fight');
}

/* ---------------------------------------------------------------- reloading */
{
  const items = await import('../module/world/items.mjs');
  const sal = fakeActor({name: 'Sal', items: [{name: 'Old Shooter', type: 'weapon', system: {stat: 'aim', ammo: {value: 1, max: 6}, ammoType: ''}}]});
  assert.equal(await items.reload(sal, itemNamed(sal, 'Old Shooter')), 5); assert.equal(itemNamed(sal, 'Old Shooter').system.ammo.value, 6, 'no ammo type: the magazine refills, as in 0.1.2');
  const jaz = fakeActor({name: 'Jaz', items: ['Polymer Nine']}); itemNamed(jaz, 'Polymer Nine').system.ammo.value = 0;
  await assert.rejects(items.reload(jaz, itemNamed(jaz, 'Polymer Nine')), /No 9mm/, 'a typed gun still needs rounds');
}

/* ---------------------------------------------------------------- pirate radio */
{
  const core = await import('../module/radio/core.mjs'), {DEFAULT_STATIONS} = await import('../module/radio/stations.mjs'), {RadioReceiver} = await import('../module/radio/receiver.mjs');
  assert.deepEqual(DEFAULT_STATIONS.map(s => s.name), ['Point Blank FM', 'Rude FM', 'Vision Radio UK', 'Flex FM', 'Supreme FM', 'Radio Caroline UK']);
  assert.equal(core.validateStations(DEFAULT_STATIONS).length, 6);
  assert.throws(() => core.validateStations([{...DEFAULT_STATIONS[0], stream: 'http://insecure/live.mp3'}]), /HTTPS/);
  assert.throws(() => core.validateStations([{...DEFAULT_STATIONS[0], stream: 'https://x/list.m3u8'}]), /playlist/);
  assert.equal(core.steppedStation(DEFAULT_STATIONS, 'radio-caroline', 1), 'point-blank', 'the dial wraps');
  assert.equal(core.clampVolume(3), 1); assert.equal(core.clampVolume('x'), 0.25);
  const audios = []; let timers = [];
  const rx = new RadioReceiver({createAudio: () => { const a = {l: {}, addEventListener(e, f) { (this.l[e] ??= []).push(f); }, removeEventListener() {}, pause() {}, removeAttribute() {}, load() {}, play: () => Promise.resolve()}; audios.push(a); return a; },
    setTimer: (fn, ms) => { timers.push(fn); return timers.length; }, clearTimer: () => null});
  rx.follow(DEFAULT_STATIONS[1]); assert.equal(rx.status, 'off', 'nothing plays until you press Listen');
  rx.listen(DEFAULT_STATIONS[1]); await Promise.resolve(); await Promise.resolve();
  assert.equal(rx.status, 'playing'); assert.equal(audios.length, 1);
  rx.follow(DEFAULT_STATIONS[1]); assert.equal(audios.length, 1, 'the same station is not reconnected');
  rx.follow(DEFAULT_STATIONS[1], {power: false}); assert.equal(rx.status, 'car-off');
  rx.stop(); assert.equal(rx.status, 'off'); assert.equal(rx.enabled, false);
  assert.ok(DEFAULT_STATIONS.every(s=>s.stream),'all six default tuner entries have a direct stream configured');
  assert.ok(!DEFAULT_STATIONS.some(s=>['codesouth','esencia-urbana'].includes(s.id)),'the two unverified streams have been removed');
  // Message the studio (0.2.2): each station's own channels, the message filled in where the channel allows it.
  const v = Object.fromEntries(core.validateStations(DEFAULT_STATIONS).map(s => [s.id, s]));
  const msg = 'Big up Jaz & the Chainring!';
  const links = id => Object.fromEntries(core.studioLinks(v[id], msg).map(l => [l.type, l]));
  assert.equal(links('flex-fm').whatsapp.href, 'https://wa.me/447704941014?text=Big%20up%20Jaz%20%26%20the%20Chainring!');
  assert.equal(links('rude-fm').sms.href, 'sms:+447501442882?&body=Big%20up%20Jaz%20%26%20the%20Chainring!');
  assert.match(links('radio-caroline').email.href, /^mailto:studio@radiocaroline\.co\.uk\?subject=Message%20for%20Radio%20Caroline%20UK&body=Big%20up/);
  assert.equal(links('point-blank').web.href, 'https://www.pointblankradio.com/'); assert.equal(links('point-blank').web.prefilled, false, 'a web form is copied, not filled');
  assert.equal(links('vision-radio').web.detail, 'minnit.chat');
  for (const s of Object.values(v)) assert.ok(core.studioLinks(s).length, `${s.name} can be messaged`);
  assert.equal(core.studioLinks(v['flex-fm'], '').find(l => l.type === 'whatsapp').href, 'https://wa.me/447704941014', 'an empty message just opens the chat');
  assert.equal(core.studioLinks(v['flex-fm'], 'x'.repeat(900)).find(l => l.type === 'whatsapp').href.length, 'https://wa.me/447704941014?text='.length + 500, 'messages are capped at 500 characters');
  assert.equal(core.phoneNumber('07501 442882'), '+447501442882'); assert.equal(core.phoneNumber('+44 (20) 3598-9656'), '+442035989656');
  assert.throws(() => core.validateStations([{...DEFAULT_STATIONS[1], sms: 'call me'}]), /phone number/);
  assert.throws(() => core.validateStations([{...DEFAULT_STATIONS[1], email: 'not an email'}]), /email address/);
  assert.throws(() => core.validateStations([{...DEFAULT_STATIONS[1], messageUrl: 'http://rudefm.com'}]), /HTTPS/);
  // Studio chat (0.2.3): the station's own chat shown inside Foundry, first on the list where a station has one.
  assert.deepEqual(Object.values(v).filter(s => s.chatUrl).map(s => s.id), ['point-blank', 'rude-fm', 'vision-radio']);
  assert.equal(core.studioLinks(v['rude-fm'], msg)[0].type, 'chat', 'the in-Foundry chat comes first');
  assert.match(links('rude-fm').chat.href, /^https:\/\/chatroll\.com\/embed\/chat\/rudefm\?/); assert.equal(links('rude-fm').chat.inFoundry, true);
  assert.equal(links('rude-fm').chat.href.includes('Big'), false, 'nothing is posted for the player: they paste and send it themselves');
  assert.equal(links('vision-radio').chat.detail, 'minnit.chat'); assert.equal(links('point-blank').chat.detail, 'pointblankradio.com');
  assert.equal(links('flex-fm').chat, undefined, 'a WhatsApp station has no in-Foundry chat');
  assert.throws(() => core.validateStations([{...DEFAULT_STATIONS[1], chatUrl: 'http://chatroll.com/embed/chat/x'}]), /HTTPS/);
  assert.throws(() => core.validateStations([{...DEFAULT_STATIONS[1], chatUrl: 'javascript:alert(1)'}]), /HTTPS/);
  // Presets a GM saved before contacts existed keep the supplied stations' contacts; a custom station has none.
  const R = await import('../module/radio/radio.mjs');
  const old = DEFAULT_STATIONS.slice(0,6).map(({chatUrl, whatsapp, sms, phone, email, messageUrl, ...rest}) => rest).concat([{id: 'custom-x', name: 'Kool', genre: '', stream: 'https://k/live.mp3', website: 'https://k/'}]);
  settings.set('radioStations', JSON.stringify(old));
  const list = R.stations();
  assert.equal(list.length,7,'only six verified defaults plus the GM custom stream remain');
  assert.equal(list.find(s => s.id === 'rude-fm').sms, '+447501442882'); assert.equal(list.find(s => s.id === 'custom-x').email, '');
  assert.match(list.find(s => s.id === 'rude-fm').chatUrl, /^https:\/\/chatroll\.com\//, 'saved presets gain the studio chat'); assert.equal(list.find(s => s.id === 'custom-x').chatUrl, '');
  const cx = R.studioChatContext(v['rude-fm'], links('rude-fm').chat, `  ${'y'.repeat(600)} `);
  assert.equal(cx.src, v['rude-fm'].chatUrl); assert.equal(cx.site, 'https://rudefm.com/#shoutbox'); assert.equal(cx.draft.length, 500);
  assert.equal(R.studioChatContext(v['point-blank'], links('point-blank').chat).site, 'https://www.pointblankradio.com/');
  const chat = R.radioAPI.studioChat(v['rude-fm'], 'Big up Hackney');
  assert.ok(chat instanceof R.StudioChat); assert.equal(chat.draft, 'Big up Hackney'); assert.equal(chat.link.type, 'chat');
  foundry.applications.instances = new Map([['smoke-studio-chat-rude-fm', chat]]);
  assert.equal(R.radioAPI.studioChat(v['rude-fm'], 'Second shout'), chat, 'an open chat is brought forward, not reloaded'); assert.equal(chat.draft, 'Second shout');
  delete foundry.applications.instances;
  assert.throws(() => R.radioAPI.studioChat(v['flex-fm'], 'x'), /no studio chat/);
  const installedHook = (await import('node:fs')).readFileSync(new URL('../the-smoke.mjs',import.meta.url),'utf8');
  assert.match(installedHook, /await migrateRadioPresets\(\)/, 'the ready hook must actually trigger the one-time preset migration');
  await R.migrateRadioPresets();
  assert.equal(settings.get('radioPresetVersion'),515,'migration version saved once');
  const after=JSON.parse(settings.get('radioStations'));
  assert.equal(after.length,7,'old six and the GM station; no dead presets re-added');
  const removed=after.filter(s=>s.id!=='custom-x');
  settings.set('radioStations',JSON.stringify(removed));
  assert.equal(R.stations().some(s=>s.id==='custom-x'),false,'removed custom preset stays removed');
  settings.delete('radioStations');settings.delete('radioPresetVersion');
}

/* ---------------------------------------------------------------- merged content */
{
  const content = J('content.json');
  assert.equal(content.version, (await import('../module/content.mjs')).VERSION, 'journal source uses its own retained content edition; a system hotfix must not rewrite guides');
  assert.equal(content.actors.length, 72, '4 pregens, 15 named NPCs, 24 Londoners, 29 motors');
  assert.equal(content.items.filter(i => i.type === 'condition').length, 31);
  const names = new Set(LIB.map(i => i.name));
  const from013 = ['Police Baton', 'Compact Pistol', 'ARV Carbine', 'Conducted-Energy Device', 'Thrown Brick', 'Ballistic Vest', 'Heavy Work Jacket', 'Cordless Angle Grinder', 'Screwdriver', 'Paramedic Bag', 'Firefighter Kit',
    'Cheap Smartphone', 'Service Radio', 'D-Lock', 'Hi-Vis Vest', 'Cycle Helmet', 'Courier Backpack', 'Handcuffs', 'Vehicle Repair Kit', 'Spare Clothes', 'Pocket Torch', 'Fictional Show Plates', 'Bike Messenger', 'Hard to Shift',
    'Estate Runner', 'Locksmith', 'Street Reader', 'Steady Hands', 'Stare Them Down', 'Door Staff', 'First Responder', 'The Knowledge', 'Local Face', 'Rally Driver', 'Crowd Work', 'Iron Stomach', 'Quiet Feet', 'Dead Calm',
    'First Aid Kit', 'Painkillers', 'Sawn-off Shotgun'];
  assert.deepEqual(from013.filter(n => !names.has(n)), [], 'every 0.1.3 item is in the library');
  assert.ok(content.items.every(i => i.flags?.[NS]?.contentKey), 'every item has a content key');
  const pat = content.actors.find(a => a.flags[NS].npcKey === 'pat');
  assert.match(pat.system.biography, /Tea before business/); assert.match(pat.system.biography, /Pat's Cycle Repairs/, 'both bios kept');
  assert.ok(content.actors.find(a => a.flags[NS].npcKey === 'pc').items.some(i => i.name === 'Handcuffs'));
  const keys = content.journals.map(j => j.flags[NS].contentKey);
  const campaignKeys = ['sandbox-campaign', ...['ch', 'ad', 'lb', 'vc', 'tu', 'ge', 'bb', 'nm', 'bm', 'ld', 'mr', 'rt'].map(f => `faction-${f}`), 'local-cases', 'venue-register'];
  assert.deepEqual(keys, ['player-guide', 'gm-guide', 'jobs-handbook', 'rules-reference', 'london-directory', 'crew-dossiers', 'gear-reference', 'players-handbook', 'gms-book', 'london-guide', 'street-papers', 'missions-guide', ...campaignKeys]);
  assert.deepEqual(content.journals.filter(j => !j.ownership.default).map(j => j.flags[NS].contentKey), ['gm-guide', 'gms-book', 'missions-guide', ...campaignKeys], 'GM guides (and the whole Sandbox Campaign) are private');
  assert.ok(content.journals.find(j => j.flags[NS].contentKey === 'player-guide').pages.some(p => p.name === 'Live pirate radio'));
  const missions = J('london-missions.json').missions, byKey = Object.fromEntries(content.journals.map(j => [j.flags[NS].contentKey, j]));
  for (const m of missions) { const mj = byKey[m.journalKey]; assert.ok(mj && m.pageUuid.includes(mj._id) && mj.pages.some(p => m.pageUuid.endsWith(p._id) && p.name === m.page), `${m.title} links to its page`); }
}
console.log('0.1.3 inside 0.2.1: request channel, services, rest, first aid, advances, Take hit/Dodge, turn clock, reloads, radio, merged content — ok');
process.exit(0);
