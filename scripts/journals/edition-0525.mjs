// The 0.5.25 guide edition: character creation, stats and Rep rewritten from the live rules data (the eight-step
// wizard, twelve backgrounds, the token builder, nine stats that all earn their keep, Rep 1-33, milestones, unlocks,
// Pat's orders and hired hands), the short Player Guide version, and the GM's Book rewards page brought up to date.
// Only these pages change. Old texts go into guide-history so unedited world copies refresh; edited copies are backed
// up by updateGuide before the new edition replaces them.
// Usage (system folder, world closed): node scripts/journals/edition-0525.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {textHash} from '../../module/text-hash.mjs';
import {STATS, STAT_MODIFIERS, STAT_KEYS} from '../../module/config.mjs';
import {BACKGROUNDS, STARTER_EXTRAS, CREATION_STEPS, BACKGROUND_LOOKS, ENDS, STORY_IDEAS} from '../../module/rules/creation.mjs';
import {REP_TIERS, REP_LEVELS, UNLOCKS, XP_AWARDS, MILESTONE_BONUSES, milestoneCash, MAX_REP} from '../../module/rules/advancement.mjs';
import {HIRE_TYPES, HIRE_REP, hireSlots} from '../../module/rules/hires-core.mjs';
import {p, h, box, table, steps, esc} from './rules.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), NS = 'the-smoke', EDITION = '0.5.25';
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const W = (f, d, pretty = 1) => fs.writeFileSync(path.join(ROOT, 'data', f), (pretty ? JSON.stringify(d, null, pretty) : JSON.stringify(d)) + (pretty ? '\n' : ''));
const content = J('content.json'), history = J('guide-history.json'), guides = J('london-guides.json'), items = J('london-items.json').items;
const builder = J('token-builder.json');
const journal = key => content.journals.find(j => j.flags?.[NS]?.contentKey === key);
const pageOf = (key, name) => journal(key)?.pages.find(x => x.name === name);
const link = (key, name, label = name) => { const j = journal(key), pg = pageOf(key, name); if (!pg) throw new Error(`Missing page ${key}|${name}`); return `@UUID[Compendium.${NS}.guides.JournalEntry.${j._id}.JournalEntryPage.${pg._id}]{${label}}`; };
const refs = list => p('<b>See also:</b> ' + list.map(([k, n, l]) => link(k, n, l)).join(' · '));
const label = k => STATS[k].label, LABEL = k => `${STATS[k].abbr} · ${STATS[k].label}`;
const mod = die => STAT_MODIFIERS[die];

/* ------------------------------------------------------------------ the facts the pages are built from */
const perksBy = Object.fromEntries(STAT_KEYS.map(k => [k, items.filter(i => i.type === 'perk' && i.system.stat === k)]));
const bestOf = b => STAT_KEYS.find(k => b.stats[k] === 8), d6Of = b => STAT_KEYS.filter(k => b.stats[k] === 6);
const presets = builder.presets.filter(x => !x.npc).map(x => x.label), npcPresets = builder.presets.filter(x => x.npc).map(x => x.label);
const lookName = key => builder.presets.find(x => (x.key || x.id || '').toLowerCase() === key || x.label.toLowerCase().startsWith(key))?.label ?? key;
// Pat's orders, read straight from the job code so the guide cannot drift from it.
const jobsSrc = fs.readFileSync(path.join(ROOT, 'module/world/jobs.mjs'), 'utf8');
const ORDERS = [...jobsSrc.matchAll(/\{key: '([^']+)',(?: minRep: (\d+),)?( car: true,)? want: (\d+),[\s\S]*?text: '((?:[^'\\]|\\.)*)', bonus: (\d+)\}/g)]
  .map(m => ({key: m[1], minRep: Number(m[2] || 1), car: Boolean(m[3]), want: Number(m[4]), text: m[5].replace(/\\'/g, '\''), bonus: Number(m[6])}));
if (ORDERS.length < 10) throw new Error(`Pat's orders not found (${ORDERS.length})`);
// Mission checks by stat, from the 179 GM files.
const FILES = {};
for (const f of fs.readdirSync(path.join(ROOT, 'scripts/missions/files')).filter(f => f.endsWith('.mjs')).sort()) Object.assign(FILES, (await import(pathToFileURL(path.join(ROOT, 'scripts/missions/files', f)).href)).default);
const checks = Object.fromEntries(STAT_KEYS.map(k => [k, 0]));
for (const f of Object.values(FILES)) for (const s of f.scenes || []) for (const c of s.checks || []) for (const k of String(c[0]).split('|')) if (k in checks) checks[k]++;
const totalChecks = Object.values(checks).reduce((a, b) => a + b, 0);

/** What each stat does, and every place the game asks for it. */
const USES = {
  mus: {what: 'Strength and weight: hitting with fists and clubs, grabbing, shoving, kicking a door in, carrying the heavy end.',
    where: 'Melee attacks (fists, bats, bars) · Grab and Cuff · dragging a driver out of a motor · cuffing on a police shift · heavy lifts and doors in missions · Muscle hired hands',
    saves: 'The door is locked, the van is coming and someone has to carry the cases.'},
  grt: {what: 'Toughness: taking a hit, staying up, cold, hunger, long nights, holding a hose on a fire.',
    where: 'Your Health (8 + Grit modifier) · Guard (the better of Moves or Grit) · the Health Growth roll every third level · firefighter callouts (hold the hose) · staying conscious and shrugging off conditions · long stake-outs and all-night graft in missions · Minder hired hands',
    saves: 'Four in the morning, minus five, and you are the only one still standing.'},
  mov: {what: 'Agility: dodging, climbing, running, vaulting, slipping cuffs and crowds.',
    where: 'Dodge an attack · Guard (the better of Moves or Grit) · Run from a stop on foot · the escape move · foot chases · climbing to a high wall or over a fence in missions and commissions · Runner hired hands',
    saves: 'The van doors are opening and the only way out is over the wall.'},
  whl: {what: 'Driving and riding anything with wheels. The vehicle\'s Performance die replaces your Effort die.',
    where: 'Every driving check on the green/yellow/red gauge · chases · Run from a stop while driving · evasive manoeuvres, PIT and ram checks · taxi, courier, ambulance and police-shift driving · getaway runs in missions · Wheelman hired hands',
    saves: 'Blue lights in the mirror and the A12 is solid.'},
  aim: {what: 'Hitting what you mean to: shooting, throwing, from a moving vehicle or across a room.',
    where: 'Gun attacks and drive-bys · thrown weapons (bricks, bottles) · knocking out a camera, tripping a runner, hitting a switch, catching a throw, a long-lens photo in missions · Shooter hired hands',
    saves: 'One throw, one chance, and the shutter is coming down.'},
  grf: {what: 'Hands and know-how: locks, hotwiring, pickpocketing, sleight of hand, fixing an engine.',
    where: 'Cutting locks and nicking bikes and motors · hotwiring · lifting and planting things · repairs and the toolkit · <b>every Tag Studio paint roll</b> · <b>Fix the relay</b> at a radio-war contact · Locksmith hired hands',
    saves: 'The ledger is in the third drawer and the drawer is locked.'},
  sav: {what: 'Street smarts: spotting cops and tails, reading people and paper, knowing London, first aid.',
    where: 'First aid and paramedic jobs · spotting the Old Bill, a tail or a grass · loading and treating on callouts · reading forged paperwork in missions · <b>Defend the airwaves</b> at a radio-war contact · Lookout hired hands',
    saves: 'Two Whippets look the same. One of them has a tracker in the seat post.'},
  frt: {what: 'Chat, bluff, charm, intimidation and haggling.',
    where: 'Talk your way out of a stop · haggling in shops · fares\' chat, calming a disturbance, stopping a car on a police shift · blags and pitches in missions · <b>Put the word about</b> at a radio-war contact · Talker hired hands',
    saves: 'No invitation, black tie, and the man on the door has a list.'},
  btl: {what: 'Nerve: keeping your head when it goes wrong, standing your ground, not grassing.',
    where: '<b>Say nothing</b> at a police stop · facing someone down · being shot at or chased (Cool Head) · turning down a bribe, holding a promise in public in missions · Old Head hired hands',
    saves: 'The envelope is fat, the man is smiling, and everyone is watching you.'}
};

/* ------------------------------------------------------------------ Player's Handbook · Making a Character */
const STEP_TEXT = {
  who: 'Name, street name (optional), pronouns, age (adults only, 18+), your <b>ends</b> (where you grew up) and a line about how you look.',
  background: 'Pick one of twelve backgrounds. It suggests your stat spread, offers three perks, and gives you starting kit and cash.',
  stats: 'Spread <b>one d8, three d6 and five d4</b> across the nine stats. The background\'s suggestion is already filled in; move any die you like. The wizard will not let you finish with an illegal spread.',
  perk: 'Choose <b>one</b> of your background\'s three perks. A perk steps a stat die up once in the situation it names.',
  kit: 'Your background\'s kit and cash, plus <b>one</b> extra of your choice.',
  story: 'A hustle (what you are known for), a vice, a bond and an ambition. Pick from the ideas or write your own. These are what the GM hangs stories on.',
  token: 'Build your token with the <b>Token Builder</b>: build, skin, hair, clothes, accessories and colours, or pick a style preset or Randomise. It starts from a look that suits your background.',
  review: 'Check everything on one page. Anything missing is listed with a link to its step. Finish, and your character, kit and token are made.'
};
const creationFull = () => {
  const healthRows = [4, 6, 8].map(d => [`Grit d${d}`, `+${mod(d)}`, `${8 + mod(d)}`]);
  const guardRows = [[4, 4], [6, 4], [8, 4], [6, 6], [8, 6]].map(([a, b]) => [`Moves d${a} / Grit d${b}`, `${3 + 4 + Math.max(mod(a), mod(b))}`]);
  return p('Make a new <b>Character</b> actor and open its sheet, then press <b>Character creator</b> on the Rep &amp; Conditions tab (the GM can also open it from the GM Screen). The wizard walks you through eight steps. Nothing is saved until you press <b>Finish</b>, and you can jump back to any step from the strip along the top.')
    + h('The eight steps', steps(CREATION_STEPS.map(s => `<b>${esc(s.label)}.</b> ${STEP_TEXT[s.key]}`)))
    + box('Quick build: two minutes', 'Name, ends, background. Leave the suggested spread as it is, take the first perk and the first extra, pick one story idea for each line, press <b>Randomise</b> on the Token step, then Finish. You can tune everything later with the GM.')
    + h('The twelve backgrounds', p('Every stat is the best stat of at least one background, so whatever you want to be good at, there is a way in. The spread is only a suggestion.')
      + table(['Background', 'Suggested stats', 'Perks and kit'], BACKGROUNDS.map(b => [`<b>${esc(b.name)}</b><br><i>${esc(b.blurb)}</i><br>Known for: ${esc(b.hustle)}<br>Token: ${esc(lookName(BACKGROUND_LOOKS[b.key] || 'casual'))}`, `<b>d8 ${label(bestOf(b))}</b><br>d6 ${d6Of(b).map(label).join(', ')}<br>d4 the rest`, `<b>Pick one:</b> ${b.perks.map(esc).join(' · ')}<br><b>Start:</b> £${b.cash}, ${b.kit.map(esc).join(', ')}`])))
    + h('What you start with', p('Every new character starts at <b>Rep 1</b> with <b>0 XP</b>, <b>3 Hustle</b>, Fists, the background kit and cash, one extra, and the perk you chose. Health and Guard are worked out from your stats; the sheet shows the sources when you hover.')
      + table(['Grit die', 'Modifier', 'Starting Health (8 + modifier)'], healthRows)
      + p('<b>Guard</b> is how hard you are to hit: 3 + your base Guard (4) + the <b>better</b> of your Moves or Grit modifier + worn armour.')
      + table(['Moves / Grit', 'Guard (no armour)'], guardRows)
      + p('<b>Hustle</b> is grit you spend on a roll: 1 Hustle steps your Effort die up, 2 puts you <b>On a Roll</b>. It comes back with rest. Each new Rep tier adds one more.'))
    + h('One extra thing', p(STARTER_EXTRAS.map(esc).join(' · ')))
    + h('Your story', p(`<b>Ends:</b> ${ENDS.map(esc).join(', ')}.`) + table(['Line', 'Some ideas'], [['Vice', STORY_IDEAS.vice.map(esc).join(' · ')], ['Bond', STORY_IDEAS.bond.map(esc).join(' · ')], ['Ambition', STORY_IDEAS.ambition.map(esc).join(' · ')]]) + p('Your bond and ambition are promises from the GM: expect them to come up.'))
    + h('Your token', p(`The <b>Token Builder</b> is step ${CREATION_STEPS.findIndex(s => s.key === 'token') + 1} of the wizard. It draws a top-down token in the house style from layered parts: ${builder.categories.map(c => esc(c.label)).join(', ')}. There are ${builder.builds.length} builds, ${builder.skins.length} skin tones and a palette for each clothing colour, with faction colours for the trim.`)
      + table(['Control', 'What it does'], [['Build and Skin', `${builder.builds.map(b => esc(b.label)).join(', ')} builds; ${builder.skins.length} skin tones.`], ['Parts', 'Pick a category on the right, then a part. Each option is drawn on your token so you can see it before you choose.'], ['Colour', 'Most clothing parts have their own palette under the options, plus a picker for any colour you like.'], ['Ring', 'The ring round the token: your faction trim colour, a colour of your own, or no ring.'], ['Style presets', `${presets.map(esc).join(', ')}. Each one dresses the whole token in one go; change any part after.`], ['Randomise', 'A whole new random look. Press again for another.'], ['New clothes', 'New clothes and kit on the same person.'], ['Reset', 'Back to how it looked when you opened the builder (in the wizard, the look that suits your background).'], ['Shirt number', 'A football top can carry a number.'], ['Saving', 'Finishing the wizard saves the picture and sets it as your token everywhere it is placed, and as your portrait if you have not chosen one.']])
      + p(`Change it any time from the <b>Edit token</b> button (the pencil-and-person icon) at the top right of your character sheet, or press the dice icon next to it for a random new look saved straight away. The GM\'s builder also has NPC presets: ${npcPresets.map(esc).join(', ')}.`))
    + box('Make a crew, not four copies', 'Talk to each other before you pick. A crew with a good driver, someone who can talk, someone who can take a hit and someone with quick hands will get through far more of London than four fighters. Every stat gets rolled; see Your Stats.')
    + refs([['players-handbook', 'Your Stats', 'Your Stats'], ['players-handbook', 'Rep and Levelling', 'Rep and Levelling'], ['players-handbook', 'Kit', 'Kit and perks']]);
};

/* ------------------------------------------------------------------ Player's Handbook · Your Stats */
const statsFull = () => {
  const sheet = p('<b>On the sheet:</b> the Street tab shows the nine stat dice and your perks; click a stat to roll it with a difficulty, Hustle and perks, or the small die for a quick Medium roll. Hover a stat to see its Easy / Medium / Hard / Long Shot numbers. The bars under the header show Health, Hustle, cash and Guard; Heat sits in the header. Kit holds your gear; Rep &amp; Conditions holds XP, the Level up button and any conditions.');
  return p('Nine stats, each a die from <b>d4</b> (not much) to <b>d20</b> (legendary). When you roll, you roll your <b>Effort die</b> and your <b>stat die</b>, add the stat\'s modifier, and try to beat the target the difficulty sets. Behind the wheel, the vehicle\'s Performance die replaces your Effort die.')
    + table(['Stat die', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20'], [['Modifier', ...[4, 6, 8, 10, 12, 20].map(d => `+${mod(d)}`)]])
    + h('The nine stats, and where the game uses them', STAT_KEYS.map(k => `<h3>${LABEL(k)}</h3>` + p(`<i>${esc(USES[k].saves)}</i> ${USES[k].what}`) + p(`<b>The game rolls it for:</b> ${USES[k].where}.`) + p(`<b>Best stat of:</b> ${BACKGROUNDS.filter(b => bestOf(b) === k).map(b => esc(b.name)).join(', ')} · <b>Perks:</b> ${perksBy[k].map(x => esc(x.name)).join(', ')}`)).join(''))
    + h('Stats that make other numbers', table(['Number', 'How it is worked out'], [['Health', '8 + your Grit modifier at Rep 1. Every third Rep level, roll Grit: add half the roll, rounded up (at least 1).'], ['Guard', '3 + base Guard (4) + the better of your Moves or Grit modifier + worn armour. Every third Rep level, roll the better of Moves/Grit: +2 on the top face, +1 on a 3 or more.'], ['Effort when driving', 'The vehicle\'s Performance die replaces your Effort die on Wheels rolls.'], ['Hustle', '3 to start, +1 at each new Rep tier. Spend 1 to step Effort up, 2 to be On a Roll.']]))
    + h('Every stat earns its keep', p(`There is no stat you can leave at d4 and never miss. The game is built so that each of the nine gets asked for: in the systems above, in the GM's quick checks and hazards, and in the ${Object.keys(FILES).length} mission files, which call for checks on every stat in roughly equal measure.`)
      + table(['Stat', 'Share of mission checks', 'Perks', 'Hired hand'], STAT_KEYS.map(k => [LABEL(k), `${(100 * checks[k] / totalChecks).toFixed(1)}%`, perksBy[k].length, esc(HIRE_TYPES.find(t => t.stat === k)?.label ?? '—')]))
      + p('Tagging commissions add a Graft roll for every paint, and the radio wars add Front (Put the word about) and Savvy (Defend the airwaves) rolls on top of the mission checks.'))
    + h('Raising stats', p('Odd Rep levels raise one stat a step (d4 → d6 → d8…), up to your tier\'s cap: d8 in Street, d10 in Known, d12 in Firm and Guv\'nor, d20 in Empire. A GM Advance is a separate step within the same cap. When a perk applies, it steps the die up once more for that roll, even past your cap (below Empire, a d12 gets +2 instead of becoming a d20).'))
    + box('Conditions', 'Some conditions put you <b>Off Your Game</b> with a stat (its dice do not explode) or give it a penalty. Broken: Muscle and Moves. Knackered: Muscle, Grit and Moves. Restrained: Moves and Aim. Cuffed: Muscle, Moves, Aim and Graft, and no driving. Bricking It: Bottle, and -1 to Front. The Rep &amp; Conditions tab lists what you have.')
    + sheet + refs([['players-handbook', 'Rolling the Dice', 'Rolling the Dice'], ['players-handbook', 'Making a Character', 'Making a Character'], ['players-handbook', 'Kit', 'Perks in full']]);
};

/* ------------------------------------------------------------------ Player's Handbook · Rep and Levelling */
const levelGain = n => n === 1 ? 'Start' : [n % 2 ? 'Raise a stat' : 'New perk', n % 3 === 0 ? 'Growth + milestone' : '', REP_TIERS.some(t => t.from === n) ? 'New tier: +1 Hustle, higher cap' : ''].filter(Boolean).join(' · ');
const repFull = () => p(`Rep is how far you have come: <b>${MAX_REP} levels</b> from Nobody to King of London, paid for with XP. When you have the XP for a new level, the <b>Level up</b> button on your sheet (Rep &amp; Conditions) lights up. The wizard applies one level at a time, in order; XP on its own never changes your stats.`)
  + h('Earning XP', table(['Source', 'XP'], [['A finished job (fare, delivery, patient, fire, police call)', XP_AWARDS.job], ['One of Pat\'s orders', XP_AWARDS.crewOrder], ['Selling a vehicle for £500 or more', XP_AWARDS.bigSale], ['A minor / major mission (the Board shows the real award)', `${XP_AWARDS.missionMinor} / ${XP_AWARDS.missionMajor}`], ['A street commission or radio-war job', 'as listed on the Board'], ['Busted or Wasted', XP_AWARDS.bustedOrWasted]]) + p('The GM can also award XP for a great night and give an <b>Advance</b> (a stat step within your cap) for something remarkable.'))
  + h('The five tiers', table(['Tier', 'Rep', 'Stat cap', 'What it feels like'], REP_TIERS.map((t, i) => [`<b>${esc(t.name)}</b>`, `${t.from}–${(REP_TIERS[i + 1]?.from ?? MAX_REP + 1) - 1}`, `d${t.cap}`, esc(t.blurb)])) + p('Each new tier adds 1 maximum Hustle and raises how high a stat can go.'))
  + h('The level-up wizard', steps(['<b>Odd level:</b> choose one stat to raise a step, up to your cap.', '<b>Even level:</b> choose a new perk from the library (any perk you meet the story for; the GM has the final word).', '<b>Every third level (3, 6, 9…):</b> roll <b>Growth</b>. Health: roll Grit, add half rounded up (at least 1). Guard: roll the better of Moves/Grit, +2 on the top face, +1 on 3 or more, nothing on 1–2.', '<b>Every third level</b> also gives a <b>milestone</b> reward of your choice (below).', '<b>New tier:</b> +1 maximum Hustle, and the stat cap goes up.', 'Confirm. The sheet updates in one go; if you have more XP banked, the button lights up again for the next level.']))
  + h('Milestones (every third level)', table(['Reward', 'What you get'], MILESTONE_BONUSES.map(b => [`<b>${esc(b.name)}</b>`, b.id === 'cash' ? `Cash: £75 + £25 × your Rep (£${milestoneCash(3)} at Rep 3, £${milestoneCash(12)} at Rep 12).` : esc(b.blurb)])) + p('A character who levelled before milestones existed can claim the ones they missed from the same wizard.'))
  + h('All thirty-three levels', table(['Rep', 'Title', 'XP · tier', 'At this level'], REP_LEVELS.map(x => [x.level, `<b>${esc(x.title)}</b>${x.blurb ? `<br><i>${esc(x.blurb)}</i>` : ''}`, `${x.xp}<br>${esc(x.tierName)}`, levelGain(x.level)])) + p('A full run of the campaign lands in the low twenties. The top of the ladder is a long way off, on purpose.'))
  + h('What Rep opens up', table(['When', 'What'], UNLOCKS.map(u => { const [when, ...rest] = u.label.split(' — '); return [`<b>${esc(when)}</b>`, esc(rest.join(' — '))]; })) + p('These are live in the game: shop shelves, fence prices, the orders Pat offers, police stops and the Blower all check them.'))
  + h('Pat\'s orders', p('Ask Pat for an order on the Blower. She picks one you are ready for. Bike orders go to The Arches; car jobs go to Bow Breakers Yard on Roman Road. Delivering the right ride with the order open pays her bonus on top of the price, and 2 XP.') + table(['From Rep', 'Order', 'Bonus'], ORDERS.map(o => [o.minRep, `${o.car ? '<b>Car job.</b> ' : ''}${esc(o.text)}`, `£${o.bonus}`])))
  + h(`Hired hands (Rep ${HIRE_REP}+)`, p(`From Rep ${HIRE_REP} (Top Boy) you can put people on your own payroll. Open the <b>Crew</b> card on the Blower, pick a type and pay the fee. They turn up beside your token as an NPC with their own kit and a token dressed for the job, and your player runs them: in fights, behind the wheel, on jobs. You can keep ${hireSlots(13)} at Rep 13, ${hireSlots(20)} from Rep 20 and ${hireSlots(27)} from Rep 27. Dismiss one from the same card; the fee is not refunded.`)
    + table(['Hand', 'What they do', 'Kit'], HIRE_TYPES.map(t => [`<b>${esc(t.label)}</b><br>${label(t.stat)} d8 · £${t.fee}`, esc(t.blurb), t.kit.filter(k => k !== 'Fists').map(esc).join(', ')])))
  + box('Old characters', 'Characters from before the 33-level ladder kept their standing: old Rep 1, 2, 3, 4 and 5 became 1, 3, 6, 9 and 14.')
  + refs([['players-handbook', 'Your Stats', 'Your Stats'], ['players-handbook', 'Missions and Faction Standing', 'Missions and standing'], ['players-handbook', 'Money and Shops', 'Shops']]);

/* ------------------------------------------------------------------ Player Guide · Make a new face (short) */
const creationShort = () => p('Make a new Character actor, open its sheet and press <b>Character creator</b> (Rep &amp; Conditions tab), or ask the GM to open it from the GM Screen. Eight steps, nothing saved until you Finish:')
  + steps(CREATION_STEPS.map((s, i) => `<b>${esc(s.label)}.</b> ${STEP_TEXT[s.key]}`))
  + box('Quick build', 'Pick a background, keep its suggested spread, take the first perk and the first extra, one story idea each, press Randomise on the Token step, Finish.')
  + p(`Twelve backgrounds: ${BACKGROUNDS.map(b => `${esc(b.name)} (${label(bestOf(b))})`).join(', ')}. You start at Rep 1 with Health 8 + your Grit modifier, Hustle 3 and Fists. Change your token any time from the sheet's <b>Edit token</b> button.`)
  + refs([['players-handbook', 'Making a Character', 'Full creation rules'], ['players-handbook', 'Your Stats', 'What each stat is for'], ['players-handbook', 'Rep and Levelling', 'Rep 1–33']]);

/* ------------------------------------------------------------------ GM's Book · Rewards and XP (targeted update) */
function gmRewards(old) {
  let body = old.match(/<div class="sj-page-body">([\s\S]*)<\/div><footer/)[1];
  body = body.replace(/<section class="sj-0525">[\s\S]*?<\/section>/, '');
  const unlockTable = table(['When', 'What'], UNLOCKS.map(u => { const [when, ...rest] = u.label.split(' — '); return [`<b>${esc(when)}</b>`, esc(rest.join(' — '))]; }));
  const before = body; body = body.replace(/<div[^>]*class="sj-table-scroll"[^>]*><table class="sj-table"><thead><tr><th scope="col">Unlock<\/th>[\s\S]*?<\/table><\/div>/, unlockTable);
  if (body === before && !body.includes('Long Shot')) throw new Error('Rewards and XP: unlock table not found');
  body = body.replace(/<p>The crew-hiring and property ambitions are story permissions for the GM to develop\.[^<]*/, '<p>All of these are live controls: shop shelves, fence prices, Pat\'s orders, police stops and hired hands check Rep. Property ambitions stay story permissions for the GM. Old five-level characters migrate as Rep 1→1, 2→3, 3→6, 4→9, 5→14.');
  body = body.replace(/The Mission Board holds <b>125 missions<\/b>: the twelve On Your Bike opening jobs, the rest of twelve faction careers, and twenty local cases\./, 'The Mission Board holds <b>179 jobs</b>: the twelve On Your Bike opening jobs, the rest of twelve faction careers, twenty local cases, forty-two street commissions and twelve radio-war jobs. Every one has a GM file in its journal: brief, read-aloud boxes, scenes with checks, who\'s who and DM notes.');
  const extra = `<section class="sj-0525">${h('0.5.25 at the table', p('<b>Pat\'s orders by Rep.</b> From Rep 3 Pat offers bigger bike and motorbike orders; from Rep 9 she offers car jobs, delivered to Bow Breakers Yard rather than The Arches. The Blower picks one the crew is ready for.')
    + p(`<b>Hired hands.</b> From Rep ${HIRE_REP} a player can hire NPCs from the Blower's Crew card (${hireSlots(13)} slots, ${hireSlots(20)} from Rep 20, ${hireSlots(27)} from Rep 27). They are NPC actors owned by the hiring player, who runs them; you can give them a voice, a want and a problem. Fees run from £${Math.min(...HIRE_TYPES.map(t => t.fee))} to £${Math.max(...HIRE_TYPES.map(t => t.fee))}. A hand who is badly treated walks, or talks.`)
    + p('<b>Police who know your face.</b> At Known to police 3, talking your way out of a stop is a Long Shot. The new <b>Say nothing</b> choice rolls Bottle (Medium at 1★, Hard at 2★, Long Shot at 3★+), is never offered against armed crime, and on a success clears the stop and drops a star.')
    + p('<b>Chase settings.</b> The GM, or Self-play players who own a character, can switch automatic sight chases, the default chase mode, chase traffic, automatic evading and automatic driving checks from the Blower or Street Control. Changes are announced in chat.'))
    + h('Calling for the right stat', p('Every stat is meant to matter. When you improvise a check, look down the list and ask who has not rolled tonight. The mission files spread their checks like this:') + table(['Stat', 'Mission checks', 'Typical asks'], STAT_KEYS.map(k => [LABEL(k), `${checks[k]} (${(100 * checks[k] / totalChecks).toFixed(1)}%)`, esc(USES[k].saves)])))}</section>`;
  return body.replace(/(<section class="sj-standing-rules">|$)/, `${extra}$1`);
}

/* ------------------------------------------------------------------ wrap and write */
function wrap(j, i, body) {
  const key = j.flags[NS].contentKey, nav = [];
  if (i) nav.push(link(key, j.pages[i - 1].name, '← Previous'));
  nav.push(link('rules-reference', 'Guide Index', 'Rules index'));
  if (i < j.pages.length - 1) nav.push(link(key, j.pages[i + 1].name, 'Next →'));
  const access = j.ownership.default ? 'CREW COPY' : 'GM FILE';
  return `<article class="smoke-journal sj-console" data-smoke-edition="${EDITION}"><div class="sj-status"><span>THE SMOKE / FIELD GUIDE</span><span>${access} · v${EDITION}</span></div><nav class="sj-nav" aria-label="Journal navigation">${nav.join('<span aria-hidden="true"> / </span>')}</nav><div class="sj-page-body">${body}</div><footer class="sj-footer"><span>${esc(j.name)}</span><span>${i + 1} / ${j.pages.length} · RULES ${EDITION}</span></footer></article>`;
}
const cover = (j, name) => { const key = j.flags[NS].contentKey, colour = key.startsWith('gm') ? 'blue' : key === 'rules-reference' ? 'cy' : 'orange';
  return `<header class="sj-cover ${colour}"><div><span class="sj-kicker">${esc(j.name)}</span><h1>${esc(name)}</h1><p>${j.ownership.default ? 'THE CREW’S REFERENCE' : 'GM FILE · TABLE NOTES'}</p></div></header>`; };
const NEW = [['players-handbook', 'Making a Character', creationFull], ['players-handbook', 'Your Stats', statsFull], ['players-handbook', 'Rep and Levelling', repFull], ['player-guide', 'Make a new face', creationShort]];
const touched = new Set();
const setPage = (key, name, html) => {
  const j = journal(key), i = j.pages.findIndex(x => x.name === name), pg = j.pages[i];
  if (pg.text.content === html) return;
  const hk = `${key}|${name}`; history[hk] = [...new Set([...(history[hk] || []), textHash(pg.text.content)])];
  pg.text = {...pg.text, format: 1, content: html}; touched.add(j);
};
for (const [key, name, make] of NEW) { const j = journal(key), i = j.pages.findIndex(x => x.name === name); setPage(key, name, wrap(j, i, cover(j, name) + make())); }
{ const j = journal('gms-book'), i = j.pages.findIndex(x => x.name === 'Rewards and XP'); setPage('gms-book', 'Rewards and XP', wrap(j, i, gmRewards(j.pages[i].text.content))); }
for (const j of touched) {
  j.flags[NS].guideEdition = EDITION;
  for (const pg of j.pages) {   // every page of a re-editioned journal carries the new stamp; untouched pages keep their words
    const html = pg.text.content.replace(/data-smoke-edition="[^"]*"/, `data-smoke-edition="${EDITION}"`).replace(/(GM FILE|CREW COPY) · v[\d.]+/, `$1 · v${EDITION}`).replace(/RULES [\d.]+<\/span><\/footer>/, `RULES ${EDITION}</span></footer>`);
    if (html !== pg.text.content) { const hk = `${j.flags[NS].contentKey}|${pg.name}`; history[hk] = [...new Set([...(history[hk] || []), textHash(pg.text.content)])]; pg.text.content = html; }
    pg.flags[NS] = {...pg.flags[NS], textHash: textHash(pg.text.content), guideEdition: EDITION, sourcePageId: pg._id, sourceName: pg.name};
  }
}
console.log('stat shares of mission checks:', Object.fromEntries(STAT_KEYS.map(k => [k, `${(100 * checks[k] / totalChecks).toFixed(1)}%`])), `· ${ORDERS.length} orders · ${touched.size} journals`);
if (process.argv.includes('--preview')) {
  const out = process.argv[process.argv.indexOf('--preview') + 1] || 'preview.html';
  const pages = [...NEW.map(([k, n]) => pageOf(k, n)), pageOf('gms-book', 'Rewards and XP')].map(x => x.text.content);
  fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${ROOT}styles/the-smoke.css"><link rel="stylesheet" href="file://${ROOT}styles/journals.css"><style>body{background:#0a0d10;color:#ece4cf;font-family:sans-serif;max-width:960px;margin:auto}</style>${pages.join('<hr>')}`);
  console.log('preview', out); process.exit(0);
}
if (process.argv.includes('--check')) process.exit(0);
W('content.json', content, 0); W('guide-history.json', history, 2);
guides.journals = content.journals.map(j => ({...(guides.journals.find(s => s.key === j.flags[NS].contentKey) || (j.ownership?.default ? {} : {gmOnly: true})), key: j.flags[NS].contentKey, name: j.name, pages: j.pages.map(x => ({name: x.name, html: x.text.content, wrapped: true}))}));
guides.version = EDITION; W('london-guides.json', guides, 2);
const req = createRequire(import.meta.url); let ClassicLevel;
for (const m of [path.join(ROOT, 'scripts/journals/node_modules/classic-level'), '/home/claude/build/node_modules/classic-level', 'classic-level']) { try { ({ClassicLevel} = req(m)); break; } catch (_e) {} }
if (!ClassicLevel) throw new Error('classic-level is needed to write the Guides pack: npm ci --prefix scripts/journals');
const pack = path.join(ROOT, 'packs/guides'), db = new ClassicLevel(pack, {valueEncoding: 'json'}); await db.open();
const releaseTime = Date.parse('2026-10-21T12:00:00Z');
const stamp = old => ({...old?._stats, createdTime: old?._stats?.createdTime ?? releaseTime, coreVersion: old?._stats?.coreVersion || '14.359', systemId: NS, systemVersion: EDITION, modifiedTime: releaseTime, lastModifiedBy: null});
for (const j of touched) {
  const rootKey = `!journal!${j._id}`; let old = null; try { old = await db.get(rootKey); } catch (_e) {}
  await db.put(rootKey, {...j, pages: j.pages.map(x => x._id), folder: null, _stats: stamp(old)});
  for (const x of j.pages) { const k = `!journal.pages!${j._id}.${x._id}`; let o = null; try { o = await db.get(k); } catch (_e) {} await db.put(k, {...x, _stats: stamp(o)}); }
}
await db.compactRange('', '￿'); await db.close();
for (const f of fs.readdirSync(pack)) if (f === 'LOCK' || f.startsWith('LOG')) fs.rmSync(path.join(pack, f));
console.log(`guides 0.5.25: ${touched.size} journals re-editioned`);
