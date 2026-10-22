// Realistic render contexts for every template, built from the system's own data. Used by the build's template check
// (compile + render + balanced tags) so a broken template fails before Foundry ever loads it.
import {repInfo, levelUpPlan, levelInfo} from '../module/rules/advancement.mjs';
import {BANANA_SVG} from '../module/apps/banana-watch.mjs';
import {BACKGROUNDS, CREATION_STEPS, STARTER_EXTRAS, STORY_IDEAS, ENDS, blankDraft} from '../module/rules/creation.mjs';
import {QUICK_GROUPS, QUICK_CHECKS, TEAMWORK, HAZARD_GROUPS, HAZARDS, STREET_EVENTS, POLICE_EVENTS, NPC_ROLES} from '../module/gm/catalogue.mjs';
const STATS = {mus: 'Muscle', grt: 'Grit', mov: 'Moves', whl: 'Wheels', aim: 'Aim', grf: 'Graft', sav: 'Savvy', frt: 'Front', btl: 'Bottle'};
const ABBR = {mus: 'MUS', grt: 'GRT', mov: 'MOV', whl: 'WHL', aim: 'AIM', grf: 'GRF', sav: 'SAV', frt: 'FRT', btl: 'BTL'};
let n = 0; const id = () => `id${++n}`;

export default function ({add, J}) {
  const items = J('london-items.json').items.map(i => ({...i, id: id()}));
  const of = t => items.filter(i => i.type === t);
  const pre = J('london-pregens.json').pregens[0];
  const system = {...pre.system, stage: 2, heat: {value: 2}, stash: 0, rep: {crew: 3, street: 1, police: 0, xp: 12}, creation: {done: false}, states: {onARoll: false, offGame: false},
    guard: {value: 9}, armour: 1, resources: pre.system.resources, identity: pre.system.identity};
  const actor = {id: 'a1', name: pre.name, img: pre.img, system};
  const sheet = {actor, system, isGM: true, owner: true, isNPC: false,
    stats: Object.keys(STATS).map(k => ({key: k, abbr: ABBR[k], label: STATS[k], hint: '', die: system.stats[k].die, mod: 3, ladder: 'Easy 7 · Medium 10'})),
    dice: [4, 6, 8, 10, 12, 20], heat: 2, heatInfo: {name: 'Wanted', response: 'Area cars hunt you.'}, stars: [1, 2, 3, 4, 5].map(k => ({n: k, on: k <= 2})),
    weapons: of('weapon').slice(0, 6).map(w => ({...w, statAbbr: ABBR[w.system.stat], spare: 20})), armour: of('armour').slice(0, 2), gear: of('gear').slice(0, 4),
    ammo: of('ammo').slice(0, 2), outfits: of('outfit').slice(0, 3).map((o, i) => ({...o, system: {...o.system, worn: i === 0}})), drugs: of('drug').slice(0, 2), consumables: of('consumable').slice(0, 3),
    perks: of('perk').slice(0, 2), conditions: [], conditionLibrary: [{name: 'Hurt', description: 'x', removal: 'y', active: true}], folded: [], rep: repInfo(system)};
  add('actor-sheet.hbs', sheet);
  add('actor-sheet.hbs', {...sheet, isNPC: true, weapons: [], ammo: [], drugs: [], outfits: [], consumables: [], gear: [], armour: [], rep: repInfo({stage: 5, rep: {xp: 90}})});
  for (const t of ['weapon', 'armour', 'gear', 'perk', 'condition', 'ammo', 'drug', 'consumable', 'outfit']) {
    const it = of(t)[0] ?? {name: 'Hurt', system: {category: 'physical', removal: 'rest'}};
    add('item-sheet.hbs', {item: it, system: it.system, type: t, stats: Object.keys(STATS).map(k => ({key: k, label: STATS[k]})), ranges: ['Engaged', 'Near', 'Far', 'Distant'],
      categories: ['melee', 'pistol'], effects: ['', 'stun'], enriched: '<p>x</p>'});
  }
  add('phone.hbs', {actor, actors: [actor], heat: 1, heatInfo: {name: 'Clocked', response: 'x'}, stars: [true, false, false, false, false],
    riding: {uuid: 'Scene.x.Token.y', name: 'Dirt Devil Scrambler', why: '', here: true, price: 875, hot: false, who: 'Auntie Pat', where: 'The Arches', order: 'Counts toward Pat\'s order: 1 of 1.'},
    shift: null, offers: [{id: 'c1', title: 'Fare', text: 'x', left: '0:30'}], active: [{id: 'c2', label: 'Taxi', stage: 'pickup', title: 'x', instruction: 'y', extra: 'z', left: '1:00', pct: 50, urgent: false}], paused: false, isGM: false});
  add('phone.hbs', {actor: null, actors: []});
  add('street-control.hbs', {scene: {name: 'Hackney'}, streetLife: true, police: true, chase: false, paused: false, traffic: 3, units: 1, shifts: [{id: 's', actor: 'Jaz', label: 'Taxi', earned: 40}], characters: [{id: 'a', name: 'Jaz', heat: 1, cash: 40}]});
  // GM screen, every tab
  const stats = r => r.map(x => ABBR[x.stat]).join(' / ');
  const chars = [{id: 'a1', name: 'Jaz', img: '', heat: 2, cash: 40, health: 10, xp: 3, rep: 1, onScene: true, checked: true}, {id: 'a2', name: 'Sal', img: '', heat: 0, cash: 90, health: 14, xp: 0, rep: 1, onScene: false, checked: false}];
  const gm = {tabs: [], band: '', whisper: false, autoApply: true, bands: [{key: 'easy', label: 'Easy', selected: false}], characters: chars, sceneName: 'Hackney', wanted: 1,
    quickGroups: QUICK_GROUPS.map(g => ({name: g, checks: QUICK_CHECKS.filter(q => q.group === g).map(q => ({...q, bandLabel: 'Medium', stats: stats(q.responses)}))})),
    teamwork: TEAMWORK.map(q => ({...q, bandLabel: 'Medium', stats: stats(q.responses)})),
    hazardGroups: HAZARD_GROUPS.map(g => ({name: g, hazards: HAZARDS.filter(h => h.group === g).map(h => ({...h, bandLabel: 'Hard', stats: stats(h.responses), lines: [{label: 'Bad Luck', text: '3 damage · Bleeding'}]}))})),
    streetEvents: STREET_EVENTS, lastEvent: STREET_EVENTS[0], policeEvents: POLICE_EVENTS.map(p => ({...p, bandLabel: 'Hard', stats: stats(p.responses)})),
    heatRows: [{...chars[0], stars: [0, 1, 2, 3, 4, 5].map(n => ({n, on: n <= 2 && n > 0, now: n === 2}))}], heatNames: ['Clean', 'Clocked', 'Wanted', 'India 99', 'Trojans', 'Lockdown'],
    crimes: [{key: 'assault', label: 'Assault (+1)'}], itemGroups: [{label: 'Weapons', items: ['Fists', 'Machete']}], npcRoles: NPC_ROLES.map(r => ({...r, selected: false})),
    npc: {name: 'Kwame Mensah', role: 'Bouncer', line: 'MUS d10 · GRT d8'}, odds: Object.keys(STATS).map(k => ({abbr: ABBR[k], label: STATS[k], cells: [{label: 'Easy', tn: 7, pct: 86}]})), oddsFor: 'Jaz',
    statOptions: Object.keys(STATS).map(k => ({key: k, label: STATS[k]})), npcTokens: [{id: 't1', name: 'Lea Boy'}], tools: [{key: 'combat', icon: 'x', label: 'Combat', hint: 'y'}], isGM: true};
  for (const tab of ['checks', 'hazards', 'street', 'heat', 'rewards', 'npcs', 'odds', 'tools']) add('gm-screen.hbs', {...gm, tab});
  add('gm-screen.hbs', {...gm, tab: 'street', lastEvent: null, npc: null, characters: [], heatRows: [], npcTokens: []});
  // shop
  const lib = J('london-items.json').items;
  const line = (label, names, extra = {}) => ({label, locked: false, minRep: 0, ...extra, items: names.map(nm => { const i = lib.find(x => x.name === nm); return {name: i.name, img: i.img, price: i.system.value, unit: i.type === 'ammo' ? i.system.perBox : 1, type: i.type, blurb: 'Blurb text for the item.', afford: i.system.value < 300}; })});
  add('shop.hbs', {actor, cash: 240, stash: 1000, rep: 2, isGM: false, shops: [{key: 'dealer', name: "Uncle's Cafe", active: true}, {key: 'corner', name: 'Corner Shop', active: false}],
    shop: {name: "Uncle's Cafe", who: 'Uncle', quote: '"Full English? Or the other menu?"'}, shopKey: 'dealer', discount: 10,
    lines: [line('For sale', ['Full English', 'Pie & Mash']), line('The other menu', ['Skunk', 'Charlie', 'Pills']), line('Out the back (Rep 2)', ['Converted Pistol', '9mm Rounds', 'Petrol Bomb']), line('Out the back (Rep 3)', ['Polymer Nine', 'Machine Pistol'], {locked: true, minRep: 3})],
    sell: [{id: 'i1', name: 'Charlie', img: lib.find(x => x.name === 'Charlie').img, qty: 2, unit: 'wrap', perUnit: 40}], services: [], wardrobe: []});
  add('shop.hbs', {actor, cash: 240, stash: 1000, rep: 1, isGM: true, shops: [{key: 'safehouse', name: 'Your Flat', active: true}], shop: {name: 'Your Flat', who: 'Mo downstairs', quote: 'x'}, shopKey: 'safehouse', discount: 0, lines: [], sell: [],
    services: [{key: 'rest', label: 'Kip for the night', icon: 'fa-solid fa-bed', text: 'Full Health.', price: 0, needsVehicle: false}, {key: 'stash', label: 'The stash', icon: 'fa-solid fa-box-archive', text: 'Cash.', stash: true}, {key: 'respray', label: 'Respray', icon: 'fa-solid fa-spray-can', text: 'x', price: null, needsVehicle: true, vehicle: null}],
    wardrobe: [{id: 'o1', name: 'Tracksuit', img: lib.find(x => x.name === 'Tracksuit').img, worn: true}, {id: 'o2', name: 'Smart Suit', img: lib.find(x => x.name === 'Smart Suit').img, worn: false}]});
  add('shop.hbs', {actor, cash: 0, stash: 0, rep: 1, shops: [], shop: null, lines: [], sell: [], services: [], wardrobe: [], nothing: true});
  // combat console
  const row = (o) => ({id: 'c', name: 'Jaz Kaur', img: '', pc: true, mine: true, current: false, hp: 8, hpMax: 10, heat: 2, cover: '', conditions: '', aiming: false, dodging: false, count: 2, rolled: true, canRoll: false, dice: [], hidden: false, out: false, ...o});
  const cc = {combat: true, isGM: true, round: 2, phase: 'resolve', phaseLabel: 'Action', waiting: '',
    rows: [row({current: true, dice: [{v: 5, spent: true}, {v: 2, spent: false}], conditions: 'Bleeding', cover: 'Light cover'}), row({id: 'd', name: 'PC Officer', pc: false, mine: false, heat: 0, dice: [{v: 6, spent: true}]}), row({id: 'e', name: 'Sal', out: true})],
    queue: [{name: 'PC Officer', value: 6, done: true}, {name: 'Jaz Kaur', value: 5, now: true}, {name: 'Jaz Kaur', value: 2}],
    current: {name: 'Jaz Kaur', value: 5, mine: true, npc: false, police: false, driving: true, grabbed: true, weapons: [{id: 'w', name: 'Polymer Nine 3/15'}], cover: [{key: 'none', label: 'No cover'}, {key: 'light', label: 'Light cover'}]}};
  add('combat-console.hbs', cc);
  add('combat-console.hbs', {...cc, phase: 'intent', phaseLabel: 'Roll your speed dice', waiting: 'Sal', current: null, queue: [], rows: [row({canRoll: true, rolled: false}), row({id: 'd', name: 'PC Officer', hidden: true, mine: false})]});
  add('combat-console.hbs', {...cc, phase: 'idle', current: null});
  add('combat-console.hbs', {combat: null, isGM: true, selected: 3});
  add('combat-console.hbs', {combat: null, isGM: false});
  // creator: every step
  const draft = {...blankDraft('Danny Doyle'), background: 'bike-thief', stats: {...BACKGROUNDS[0].stats}, perk: 'Bike Thief', extra: 'Balaclava'};
  const crBase = {draft, isNew: true, steps: CREATION_STEPS.map((x, i) => ({...x, n: i + 1, active: i === 2, done: i < 2, bad: false})), problem: '', first: false, last: false,
    ends: ENDS.map(e => ({name: e, selected: e === 'Homerton'})), backgrounds: BACKGROUNDS.map((b, i) => ({...b, selected: i === 0, statLine: 'GRF d8 · MOV d6', perkLine: b.perks.join(' / '), kitLine: b.kit.join(', ')})),
    bg: BACKGROUNDS[0], stats: Object.keys(STATS).map(k => ({key: k, abbr: ABBR[k], label: STATS[k], hint: 'x', die: draft.stats[k], mod: 3, options: [8, 6, 4].map(v => ({v, selected: v === draft.stats[k]}))})),
    counts: {8: 1, 6: 3, 4: 5}, spreadOk: true, perks: BACKGROUNDS[0].perks.map(p => ({name: p, selected: p === 'Bike Thief', when: 'When', text: 'Text', img: ''})),
    kit: BACKGROUNDS[0].kit.map(k => ({name: k, img: '', text: 'x'})), extras: STARTER_EXTRAS.map(x => ({name: x, img: '', selected: x === 'Balaclava'})),
    ideas: Object.fromEntries(Object.entries(STORY_IDEAS).map(([k, l]) => [k, l.map(v => ({v, selected: false}))])), health: 10, cash: 40, review: 'Bike Thief from Homerton.', problems: []};
  for (const st of CREATION_STEPS) add('creator.hbs', {...crBase, step: st.key, first: st.key === 'who', last: st.key === 'review'});
  add('creator.hbs', {...crBase, step: 'review', last: true, review: null, problem: 'Pick a background.', problems: [{step: 'background', problem: 'Pick a background.', label: 'Background'}], bg: null, perks: []});
  // level up
  const lvl = {actor: {name: 'Jaz Kaur'}, info: repInfo({stage: 1, rep: {xp: 12}}), plan: levelUpPlan(1), nextTitle: levelInfo(2).title, nextBlurb: levelInfo(2).blurb, top: false, enoughXP: true,
    stats: Object.keys(STATS).map(k => ({key: k, abbr: ABBR[k], label: STATS[k], die: 6, next: 8, ok: true, selected: k === 'whl'})), perks: [{name: 'Ghost', abbr: 'MOV', when: 'Sneaking', text: 'x', selected: true}],
    growth: {health: 2, healthRoll: 3, healthDie: 4, guard: 1, guardRoll: 5, guardDie: 8}, ready: true, problem: '', grtDie: 4, guardDie: 8};
  add('levelup.hbs', lvl); add('levelup.hbs', {...lvl, growth: null, ready: false, problem: 'Roll Growth.', enoughXP: false}); add('levelup.hbs', {...lvl, top: true});
  // mission board: the opening, a faction career, a local case, and the factions table
  const MJ = J('london-missions.json'), md = MJ.missions;
  const groups = MJ.groups.map((g, i) => ({...g, selected: i === 1, done: i, total: 8, active: i === 1}));
  const view = (m, extra = {}) => ({...m, status: 'active', label: 'On it', kicker: m.code ? `${m.code} · ${m.giver.toUpperCase()}` : `MISSION ${m.n}`,
    objectives: m.objectives.map((o, i) => ({...o, have: i, need: o.auto?.count ?? 1, done: i === 0, multi: (o.auto?.count ?? 1) > 1})),
    pays: ['£240 crew fee', '3 XP', '+3 Renown · The Night Market', '+1 Influence', 'Offer: Renown 5'], places: (m.locations || []).map(l => ({...l, ref: l.code, placeId: (m.stops || []).find(x => x.code === l.code)?.placeId ?? ''})),
    mapIds: [...new Set((m.stops || []).map(x => x.placeId).filter(Boolean))], cast: (m.cast || []).map((c, i) => ({...c, here: i === 0})),
    continues: (m.continues || []).map(c => ({code: c, title: 'Next job'})), evidence: m.evidence || [], picks: (m.rewards.renownPick || []).map(k => ({code: k, name: MJ.factions[k].name})),
    on: 'Jaz, Sal', lock: '', stop: m.stops?.[0] ?? null, ...extra});
  const mb = {isGM: true, groups, group: groups[1], fs: {renown: 3, rank: 'Known', influence: 1, cap: 2, stanceLabel: 'Open', color: '#ff7fb0'}, factionsView: false,
    list: md.slice(0, 12).map((x, i) => ({id: x.id, n: x.code ?? x.n, title: x.title, giver: x.giver, status: ['done', 'active', 'available', 'locked'][Math.min(3, i)], label: 'Open', img: x.img, active: i === 1})),
    m: view(md[0]), pcs: [{id: 'a', name: 'Jaz', checked: true}], counts: {done: 1, active: 1, available: 1, locked: 9, failed: 0}};
  add('mission-board.hbs', mb);
  for (const st of ['available', 'locked', 'done', 'failed']) add('mission-board.hbs', {...mb, m: {...mb.m, status: st, lock: st === 'locked' ? 'Renown 5 with The Night Market' : '', on: ''}});
  add('mission-board.hbs', {...mb, m: view(md.find(x => x.id === 'nm4'))});
  add('mission-board.hbs', {...mb, group: groups.at(-1), fs: null, m: view(md.find(x => x.id === 's19'))});
  add('mission-board.hbs', {...mb, isGM: false, m: view(md.find(x => x.id === 'nm4'))}); add('mission-board.hbs', {...mb, m: null});
  add('mission-board.hbs', {...mb, factionsView: true, ranks: '0 Unproven · 3 Known', factions: Object.values(MJ.factions).map((f, i) => ({...f, renown: i, influence: 1, cap: 2, rank: 'Known', stanceLabel: 'Open', done: 1, next: 'NM2 One Box Two Buyers',
    stances: ['open', 'allied', 'strained', 'hostile'].map(k => ({key: k, label: k, selected: k === 'open'}))}))});
  add('mission-board.hbs', {...mb, isGM: false, factionsView: true, ranks: '', factions: Object.values(MJ.factions).map(f => ({...f, renown: 0, influence: 0, cap: 1, rank: 'Unproven', stanceLabel: 'Open', done: 0, next: '', stances: []}))});
  add('phone.hbs', {actor, actors: [actor], heat: 0, heatInfo: {name: 'Clean', response: ''}, stars: [false, false, false, false, false], missions: [{id: 'nm4', n: 'NM4', route: true, title: 'Protection by Post', giver: 'Pearl Okonkwo', objectives: [{text: 'Get round', done: true, count: ''}, {text: 'Sell two', done: false, count: '1/2'}]}], offers: [], active: []});
  const v = J('london-vehicles.json').vehicles[7];
  add('vehicle-sheet.hbs', {actor: {name: v.name, img: v.img}, v: {...v.system.vehicle, body: {value: 6, max: 8}, fuel: {value: 5, max: 10}}, isGM: true, dice: [4, 6, 8], locks: {easy: 'Easy'}, abilities: [], seats: [], jobs: [], bodyPct: 75});
  // 0.2.1: what the merge added
  const radio = '<section class="smoke-radio on-phone"><div class="smoke-radio-top"><span class="smoke-kicker">PIRATE RADIO</span></div><button type="button" data-radio-listen>Listen</button></section>';
  add('phone.hbs', {actor, actors: [actor], heat: 3, heatInfo: {name: 'India 99', response: 'x'}, stars: [true, true, true, false, false], location: 'Hackney Central & Homerton', radio, radioLabel: 'Rude FM', radioOpen: true,
    shift: null, startable: [{type: 'taxi', label: 'taxi shift'}], offers: [{id: 'c1', title: 'Fare', text: '<p>x</p>', left: '0:30', expires: 123}],
    active: [{id: 'c2', label: 'Police', stage: 'pursuit', title: 'x', instruction: 'y', extra: 'Gap 2/5', left: '1:00', deadline: 999, total: 1000, pct: 50, urgent: true, action: {label: 'Close the gap', stat: 'whl'}}], paused: true, missions: []});
  add('phone.hbs', {actor, actors: [actor], heat: 0, heatInfo: {name: 'Clean', response: 'x'}, stars: [false, false, false, false, false], location: 'Bethnal Green', radio, radioLabel: 'Rude FM', radioOpen: false,
    satnav: {label: "The Arches · Pat's Cycles", remaining: '1.1 mi'}, shift: null, startable: [], offers: [],
    active: [{id: 'c3', label: 'Taxi', stage: 'dropoff', title: 'Fare: Hackney Central Stn → Ridley Rd Market', instruction: 'Take them to Ridley Rd Market (Dalston).', left: '2:00', deadline: 999, total: 1000, pct: 70}], paused: false, missions: []});
  add('street-control.hbs', {scene: {name: 'Hackney'}, street: true, moving: 2, isGM: true, setUp: false, traffic: 3, units: 1,
    settings: [{key: 'streetLife', label: 'Street Life', icon: 'fa-car-side', on: true}, {key: 'jobsPaused', label: 'Pause job clocks', icon: 'fa-pause', on: false}],
    shifts: [{id: 's', actor: 'Jaz', label: 'Taxi', earned: 40}], crimes: [{key: 'nick', label: 'Nick a bike', heat: 1}], jobs: [{key: 'taxi', label: 'Taxi'}],
    characters: [{id: 'a', name: 'Jaz', heat: 1, cash: 40, advances: 1, xp: 12, stage: 2, heatOptions: [0, 1, 2].map(n => ({n, name: `h${n}`, selected: n === 1}))}]});
  add('street-control.hbs', {scene: null, isGM: true, setUp: true, settings: [], shifts: [], crimes: [], jobs: [], characters: []});
  add('actor-sheet.hbs', {...sheet, isPC: true, advances: 2, cap: 10, spread: {valid: false, message: 'A new character has exactly one d8, three d6 and five d4.'}, biographyHTML: '<p>bio</p>', notesHTML: '',
    conditionLibrary: [{name: 'Bruised', description: 'x', removal: 'y', active: true, stacks: 2}], system: {...system, advancement: {available: 2, spent: 1}}});
  add('vehicle-sheet.hbs', {actor: {name: v.name, img: v.img, prototypeToken: {texture: {src: v.tokenImg}}, system: {biography: ''}}, v: {...v.system.vehicle, body: {value: 0, max: 8}, fuel: {value: 5, max: 10}, flats: 1, destroyed: true},
    isGM: true, owner: true, status: 'WRITTEN OFF', tokenOnMap: false, dice: [4, 6, 8], locks: {easy: 'Easy'}, abilities: [{label: 'Blue lights', text: 'x', icon: 'fa-solid fa-siren', seats: 'pilot'}],
    seats: [{label: 'Driver', occupant: 'Jaz'}, {label: 'Back', occupant: ''}], jobs: [{label: 'Taxi', hint: 'x', icon: 'fa-solid fa-taxi'}], jobChoices: [{key: 'taxi', label: 'Taxi', on: true}], bodyPct: 0, biographyHTML: '', systemsHTML: ''});
  add('radio.hbs', {radio, characters: [{id: 'a', name: 'Jaz', selected: true}]});
  add('radio.hbs', {radio, characters: []});
  add('radio-directory.hbs', {stations: [{id: 'rude-fm', name: 'Rude FM', genre: 'DnB', stream: 'https://x/y.mp3', website: 'https://x', directory: '', number: 1}]});
  add('radio-directory.hbs', {stations: [{id: 'rude-fm', name: 'Rude FM', genre: 'DnB', stream: 'https://x/y.mp3', website: 'https://x', directory: '', chatUrl: 'https://chatroll.com/embed/chat/rudefm', sms: '+447501442882', number: 1, hasContact: true}]});
  add('studio-chat.hbs', {station: 'Rude FM', genre: 'Drum & bass', src: 'https://chatroll.com/embed/chat/rudefm?a=1&b=2', host: 'chatroll.com', draft: 'Big up the Chainring <3 & Auntie Pat', site: 'https://rudefm.com/#shoutbox'});
  add('studio-chat.hbs', {station: 'Vision Radio UK', genre: 'Garage', src: 'https://minnit.chat/VRUKchatbox?embed', host: 'minnit.chat', draft: '', site: 'https://minnit.chat/VRUKchatbox'});
  // 0.5: chases and the gauge, the vehicle sheet, story / self-play, the Banana Blower, the 33-level ladder
  const gauge = {name: 'Ford Fiesta', moved: 11.5, green: 8, yellow: 12, red: 16, band: 'yellow', label: 'Pushing it', pg: 50, py: 25, pr: 25, at: 72, left: 4.5, stopped: false, burning: false, evasive: true};
  const chaseRows = [row({current: true, driving: 'Ford Fiesta'}), row({id: 'p', name: 'Area Car', pc: false, mine: false, kind: 'police', vehicle: true, hp: 10, hpMax: 12, burning: true}), row({id: 't', name: 'Toyota Prius', pc: false, mine: false, kind: 'traffic', vehicle: true})];
  add('combat-console.hbs', {...cc, chase: {auto: true, reason: 'Police pursuit'}, rows: chaseRows, gauge, current: {...cc.current, seated: true, isVehicle: false, person: true}});
  add('combat-console.hbs', {...cc, chase: {auto: false, reason: 'Police chase'}, rows: chaseRows, gauge: {...gauge, stopped: true, band: 'red'}, current: {name: 'Area Car', value: 4, mine: true, npc: true, police: true, isVehicle: true, driving: false, seated: false}});
  add('combat-console.hbs', {...cc, chase: {auto: true, reason: 'Police chase'}, rows: chaseRows, gauge, current: {name: 'Area Car', value: 4, mine: false, npc: true, police: true, isVehicle: true}});
  add('combat-console.hbs', {...cc, isGM: false, chase: {auto: true, reason: 'Police chase'}, phase: 'idle', current: null, gauge: null});
  const vv = J('london-vehicles.json').vehicles[7];
  const vs = {actor: {name: vv.name, img: vv.img, system: {biography: ''}}, v: {...vv.system.vehicle, body: {value: 5, max: 12}, fuel: {value: 6, max: 10}, crewDie: 0, flats: 1}, isGM: true, owner: true,
    dice: [4, 6, 8, 10, 12, 20], crewDice: [{v: 0, l: 'auto (d6)'}, {v: 8, l: 'd8'}], locks: {easy: 'Easy', medium: 'Medium'}, status: 'SMOKING', statusHint: 'Below half Body.', statusKey: 'smoking', fire: false, burnt: false,
    tokenOnMap: true, plate: 'LV23 KXP', bands: {green: 8, yellow: 12, red: 16}, chaseDice: 2, crew: 6, perf: 8, guard: 10, evasive: false, gaugePct: {g: 50, y: 25, r: 25},
    driver: {name: 'Jaz Kaur', mine: true, pc: true, whl: 8}, moves: [{key: 'drive', abbr: 'DRV', label: 'Drive', hint: 'x'}, {key: 'hotwire', abbr: 'HOT', label: 'Hotwire', hint: 'y', disabled: true}],
    incidents: [{kind: 'collision', label: 'Hit it: Toyota Prius', body: 4, when: '2 min ago', driver: 'Jaz Kaur', scene: 'Hackney', icon: 'fa-car-burst'}, {kind: 'fire', label: 'Caught fire', when: 'just now', icon: 'fa-fire'}], incidentCount: 2,
    lights: true, mineInside: [{uuid: 'Scene.x.Token.y', name: 'Jaz Kaur'}], riders: 2, abilities: [{label: 'Police kit', text: 'x', icon: 'fa-solid fa-tower-broadcast', seats: ''}],
    seats: [{label: 'Driver', occupant: 'Jaz Kaur'}, {label: 'Front passenger', occupant: ''}], jobs: [], jobChoices: [{key: 'taxi', label: 'Taxi', on: false}], bodyPct: 42, fuelPct: 60, biographyHTML: '', systemsHTML: ''};
  add('vehicle-sheet.hbs', vs);
  add('vehicle-sheet.hbs', {...vs, stuckChecks: 2, stuckPlural: true});   // 0.5.16: the GM's stuck-check button
  add('vehicle-sheet.hbs', {...vs, isGM: false, driver: null, status: 'ON FIRE', statusKey: 'fire', fire: true, mineInside: [], incidents: [], incidentCount: 0});
  add('vehicle-sheet.hbs', {...vs, status: 'BURNT OUT', statusKey: 'burnt', burnt: true, tokenOnMap: false, driver: {name: 'PC', mine: false, pc: false, whl: 6}});
  add('mission-board.hbs', {...mb, mode: 'story', canRun: true, selfPlay: false});
  add('mission-board.hbs', {...mb, isGM: false, canRun: true, mode: 'self', selfPlay: true, m: {...mb.m, status: 'locked', lock: 'Renown 5'}});
  add('mission-board.hbs', {...mb, isGM: false, canRun: true, mode: 'self', selfPlay: true});
  add('mission-board.hbs', {...mb, isGM: false, canRun: false, mode: 'story', storyLocked: true});
  add('mission-board.hbs', {isGM: false, canRun: false, mode: 'story', storyLocked: true, empty: true, groups: [], list: [], m: null,
    sideWork: Object.entries({taxi: 'Taxi', bus: 'Bus', crew: 'The Chainring'}).map(([key, label]) => ({key, label, icon: 'fa-solid fa-taxi', hint: 'x'}))});
  add('phone.hbs', {actor, actors: [actor], heat: 0, heatInfo: {name: 'Clean', response: ''}, stars: [false, false, false, false, false], missions: [], offers: [], active: [], banana: '<svg class="banana-logo"></svg>', clock: '21:47', boot: true});
  add('phone.hbs', {actor, actors: [actor], heat: 1, heatInfo: {name: 'Clocked', response: ''}, stars: [true, false, false, false, false], location: 'Hackney Central', missions: [], offers: [], active: [], banana: BANANA_SVG, clock: '21:47', boot: false});
  for (const level of [1, 2, 3, 4, 18, 26, 32]) {
    const plan = levelUpPlan(level);
    add('levelup.hbs', {...lvl, info: repInfo({stage: level, rep: {xp: 5000}}), plan, steps: {stat: plan.statUpgrade ? 1 : 0, perk: plan.perk ? 1 : 0, growth: plan.growthRoll ? 2 : 0}, nextTitle: levelInfo(level + 1).title, growth: plan.growthRoll ? lvl.growth : null, maxRep: 33});
  }
  add('levelup.hbs', {...lvl, info: repInfo({stage: 33, rep: {xp: 9999}}), top: true, maxRep: 33});
  add('actor-sheet.hbs', {...sheet, rep: repInfo({stage: 19, rep: {xp: 470, crew: 3}})});
  add('street-control.hbs', {scene: {name: 'Hackney'}, street: true, isGM: true, setUp: true, selfPlay: true, settings: [], shifts: [], crimes: [], jobs: [], characters: []});
  add('gm-screen.hbs', {...gm, tab: 'tools', selfPlay: true, highs: ['Blazed', 'Wired']});
}

