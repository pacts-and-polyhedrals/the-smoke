// Character creation for The Smoke: who you are, your background, your stats (one d8, three d6, five d4), a perk,
// your starting kit and cash, and your story. Pure data and checks; the wizard (apps/creator.mjs) drives it.
import {STAT_KEYS, STATS} from '../config.mjs';
import {statModifier, validateStartingSpread} from './core.mjs';

const spread = (d8, d6s) => Object.fromEntries(STAT_KEYS.map(k => [k, k === d8 ? 8 : d6s.includes(k) ? 6 : 4]));
export const BACKGROUNDS = Object.freeze([
  {key: 'bike-thief', name: 'Bike Thief', blurb: 'You have been nicking bikes since you could reach the pedals. Locks are puzzles; puzzles are money.', stats: spread('grf', ['mov', 'whl', 'sav']),
   perks: ['Bike Thief', 'Parkour', 'Wheelie King'], kit: ['Bolt Cutters', 'Burner Phone', 'Tracksuit', 'Energy Drink'], cash: 40, hustle: 'No lock you can\'t open'},
  {key: 'getaway-kid', name: 'Getaway Kid', blurb: 'Joyriding at fourteen, driving for older lads at sixteen. You know every rat-run from Dalston to Bow.', stats: spread('whl', ['mov', 'sav', 'btl']),
   perks: ['Getaway Driver', 'Wheelie King', 'Courier'], kit: ['Slim Jim', 'Burner Phone', 'Delivery Rider Jacket'], cash: 40, hustle: 'Drives like they stole it'},
  {key: 'market-trader', name: 'Market Trader', blurb: 'Ridley Road born and bred. You can sell anything to anyone, and buy it back cheaper.', stats: spread('frt', ['sav', 'grf', 'btl']),
   perks: ['Wide Boy', 'Blag Merchant', 'Fixer'], kit: ['Burner Phone', 'Tracksuit', 'Cigarettes'], cash: 120, hustle: 'Knows a bloke'},
  {key: 'boxer', name: 'Boxer', blurb: 'Repton Boxing Club, until the knee went. Now you are the one people send when someone needs a word.', stats: spread('mus', ['grt', 'btl', 'mov']),
   perks: ['Brawler', 'Hard as Nails', 'Dirty Fighter'], kit: ['Puffer Jacket', 'Tracksuit', 'Energy Drink'], cash: 40, hustle: 'Makes problems go away'},
  {key: 'carer', name: 'Care Worker', blurb: 'Twelve-hour shifts for minimum wage, then you found out what Pat pays. You still patch everyone up.', stats: spread('sav', ['frt', 'grt', 'btl']),
   perks: ['Medic', 'Cool Head', 'Local Knowledge'], kit: ['First Aid Kit', 'Bandages', 'Burner Phone', 'Tracksuit'], cash: 60, hustle: 'Keeps everyone alive'},
  {key: 'phone-tech', name: 'Phone Shop Tech', blurb: 'Unlocking phones on Kingsland Road. Then car keys. Then cars.', stats: spread('grf', ['sav', 'frt', 'mov']),
   perks: ['Grease Monkey', 'Fixer', 'Grass Radar'], kit: ['Screwdriver Set', 'Burner Phone', 'Torch', 'Tracksuit'], cash: 80, hustle: 'Fixes anything with a battery'},
  {key: 'ex-squaddie', name: 'Ex-Squaddie', blurb: 'Two tours, one discharge, no plan. Calm when it goes loud, which is why people hire you.', stats: spread('aim', ['grt', 'btl', 'mus']),
   perks: ['Steady Hand', 'Cool Head', 'Hard as Nails'], kit: ['Leather Jacket', 'Torch', 'Cans of Lager'], cash: 60, hustle: 'Calm under fire'},
  {key: 'runner', name: 'Runner', blurb: 'Over walls, across roofs, through the estate. Nobody has caught you on foot. Yet.', stats: spread('mov', ['sav', 'grt', 'whl']),
   perks: ['Parkour', 'Leg It', 'Ghost'], kit: ['Delivery Rider Jacket', 'Energy Drink', 'Burner Phone'], cash: 40, hustle: 'Nobody catches them on foot'},
  {key: 'cabbies-kid', name: 'Cabbie\'s Kid', blurb: 'Your dad did The Knowledge and made you learn it too. You know London better than the satnav.', stats: spread('whl', ['sav', 'frt', 'grt']),
   perks: ['Cabbie', 'Local Knowledge', 'Night Owl'], kit: ['Oyster Card', 'Burner Phone', 'Smart Suit'], cash: 60, hustle: 'Knows every street in London'},
  {key: 'ex-old-bill', name: 'Ex-Old Bill', blurb: 'You were a copper until you weren\'t. You know how they think, and some of them still owe you.', stats: spread('sav', ['frt', 'btl', 'mus']),
   perks: ['Ex-Old Bill', 'Silver Tongue', 'Grass Radar'], kit: ['Torch', 'Cable Ties', 'Burner Phone', 'Smart Suit'], cash: 80, hustle: 'Knows how the police think'}
]);
/** One extra thing to start with. */
export const STARTER_EXTRAS = Object.freeze(['Bike Lock', 'Balaclava', 'Spray Paint', 'Meal Deal', 'Painkillers', 'Bandages', 'Cigarettes', 'Torch', 'Oyster Card', 'Duct Tape']);
export const ENDS = Object.freeze(['Hackney Central', 'Homerton', 'Dalston', 'Clapton', 'Stoke Newington', 'Haggerston', 'Hoxton', 'De Beauvoir', 'Canonbury', 'Highbury', 'South Hackney', 'Hackney Wick', 'Bethnal Green', 'Bow', 'Old Ford', 'Stratford', 'Leyton', 'Lea Bridge']);
export const STORY_IDEAS = Object.freeze({
  vice: ['Fruit machines', 'Showing off', 'Trainers', 'Weed', 'Pride', 'Gambling on the football', 'Adrenaline', 'Lying', 'Buying rounds'],
  bond: ['Kez taught you to ride', 'You owe Pat for your mum\'s funeral', 'Mo lets you off the rent', 'Grew up with Stretch, before', 'Your little sister thinks you work in a phone shop', 'DS Vale arrested your dad'],
  ambition: ['Your own bike shop, legit', 'One big score and out', 'Run the crew one day', 'Get your mum out of the estate', 'A deal with a trainer brand', 'Never work for anyone again']
});
export const CREATION_STEPS = Object.freeze([
  {key: 'who', label: 'Who'}, {key: 'background', label: 'Background'}, {key: 'stats', label: 'Stats'}, {key: 'perk', label: 'Perk'},
  {key: 'kit', label: 'Kit'}, {key: 'story', label: 'Story'}, {key: 'review', label: 'Done'}
]);

export function blankDraft(name = '') {
  return {name, alias: '', pronouns: '', age: '', ends: 'Hackney Central', look: '', background: '', stats: Object.fromEntries(STAT_KEYS.map(k => [k, 4])),
    perk: '', extra: '', hustle: '', vice: '', bond: '', ambition: ''};
}
/** Health from Grit, as the sheet works it out at Rep 1: 8 + the Grit modifier. */
export const startingHealth = grtDie => 8 + statModifier(grtDie);
/** What is wrong with a step, or ''. */
export function stepProblem(step, d) {
  switch (step) {
    case 'who': {
      if (!String(d.name || '').trim()) return 'Give them a name.';
      const age = parseInt(d.age, 10); if (d.age && (!Number.isFinite(age) || age < 18)) return 'Characters in The Smoke are adults: 18 or over.';
      return '';
    }
    case 'background': return BACKGROUNDS.some(b => b.key === d.background) ? '' : 'Pick a background.';
    case 'stats': return validateStartingSpread(d.stats).valid ? '' : 'Assign exactly one d8, three d6 and five d4.';
    case 'perk': { const bg = BACKGROUNDS.find(b => b.key === d.background); return bg?.perks.includes(d.perk) ? '' : 'Pick one of your background\'s perks.'; }
    case 'kit': return !d.extra || STARTER_EXTRAS.includes(d.extra) ? '' : 'Pick an extra from the list.';
    default: return '';
  }
}
export function draftProblems(d) { return CREATION_STEPS.map(s => ({step: s.key, problem: stepProblem(s.key, d)})).filter(x => x.problem); }
/** The changes a finished draft makes to a character: actor update data and the library item names to add. */
export function applyPlan(d) {
  const bg = BACKGROUNDS.find(b => b.key === d.background);
  const hp = startingHealth(d.stats.grt);
  return {
    update: {name: d.name.trim(), 'system.stage': 1, 'system.rep.xp': 0, 'system.cash': bg.cash, 'system.resources.health': {value: hp, max: hp}, 'system.resources.hustle': {value: 3, max: 3},
      ...Object.fromEntries(STAT_KEYS.map(k => [`system.stats.${k}.die`, Number(d.stats[k])])),
      'system.identity.alias': d.alias, 'system.identity.pronouns': d.pronouns, 'system.identity.age': d.age, 'system.identity.ends': d.ends, 'system.identity.look': d.look,
      'system.identity.crew': 'The Chainring', 'system.identity.hustle': d.hustle || bg.hustle, 'system.identity.vice': d.vice, 'system.identity.bond': d.bond, 'system.identity.ambition': d.ambition,
      'system.creation.done': true, 'system.creation.background': bg.name, 'system.creation.levelledTo': 1, 'system.role': 'pc'},
    items: ['Fists', ...bg.kit, ...(d.extra ? [d.extra] : []), d.perk],
    summary: `${bg.name} from ${d.ends}. ${STAT_KEYS.filter(k => d.stats[k] > 4).map(k => `${STATS[k].label} d${d.stats[k]}`).join(', ')}. Perk: ${d.perk}. Health ${hp}, £${bg.cash}.`
  };
}
