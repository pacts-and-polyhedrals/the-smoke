// Hired hands (0.5.25): the Rep 13 unlock "Top Boy — your own crew, hire NPCs to work for you" was listed on every
// sheet since 0.2.0 but never existed. One hire for each stat, so a crew can cover whatever its players are weak at.
// Pure data and checks; module/world/hires.mjs does the work on the leader.
import {STAT_KEYS} from '../config.mjs';

export const HIRE_REP = 13;
/** How many hands a character can keep on: two at Rep 13, three from Rep 20, four from Rep 27. */
export const hireSlots = stage => (Number(stage) >= 27 ? 4 : Number(stage) >= 20 ? 3 : Number(stage) >= HIRE_REP ? 2 : 0);

const spread = (d8, d6s) => Object.fromEntries(STAT_KEYS.map(k => [k, k === d8 ? 8 : d6s.includes(k) ? 6 : 4]));
export const HIRE_TYPES = Object.freeze([
  {key: 'muscle', label: 'Muscle', stat: 'mus', fee: 350, stats: spread('mus', ['grt', 'btl']), kit: ['Fists', 'Baseball Bat', 'Puffer Jacket'], preset: 'roadman',
   blurb: 'Big lad from the boxing gym. Opens doors, closes arguments.'},
  {key: 'minder', label: 'Minder', stat: 'grt', fee: 300, stats: spread('grt', ['mus', 'btl']), kit: ['Fists', 'Stab Vest', 'Bandages'], preset: 'smart',
   blurb: 'Stands between you and trouble and takes the hit so you don\'t.'},
  {key: 'runner', label: 'Runner', stat: 'mov', fee: 250, stats: spread('mov', ['grt', 'sav']), kit: ['Fists', 'Burner Phone', 'Energy Drink'], preset: 'rider',
   blurb: 'Over the wall and gone. Carries messages, parcels and the bag nobody wants to be holding.'},
  {key: 'wheelman', label: 'Wheelman', stat: 'whl', fee: 400, stats: spread('whl', ['sav', 'btl']), kit: ['Fists', 'Slim Jim', 'Burner Phone'], preset: 'driver',
   blurb: 'Keeps the engine running. Knows every rat-run from Dalston to Bow.'},
  {key: 'shooter', label: 'Shooter', stat: 'aim', fee: 600, stats: spread('aim', ['btl', 'grt']), kit: ['Fists', 'Compact Pistol', '9mm Rounds'], preset: 'dark',
   blurb: 'Quiet, careful, expensive. Brings the kind of attention you don\'t want, when you need it.'},
  {key: 'locksmith', label: 'Locksmith', stat: 'grf', fee: 350, stats: spread('grf', ['mov', 'sav']), kit: ['Fists', 'Lock Picks', 'Bolt Cutters'], preset: 'mechanic',
   blurb: 'Locks, alarms, keyless cars, safes. Gets in; leaves no mess.'},
  {key: 'lookout', label: 'Lookout', stat: 'sav', fee: 250, stats: spread('sav', ['mov', 'frt']), kit: ['Fists', 'Binoculars', 'Police Scanner'], preset: 'casual',
   blurb: 'Clocks the Old Bill before they clock you. Knows who is grassing.'},
  {key: 'talker', label: 'Talker', stat: 'frt', fee: 300, stats: spread('frt', ['sav', 'btl']), kit: ['Fists', 'Fake ID', 'Smart Suit'], preset: 'smart',
   blurb: 'Charm, front and a story for every copper, bouncer and landlord in the borough.'},
  {key: 'old-head', label: 'Old Head', stat: 'btl', fee: 300, stats: spread('btl', ['frt', 'grt']), kit: ['Fists', 'Cigarettes', 'Leather Jacket'], preset: 'old',
   blurb: 'Did a five-stretch and never said a word. Nothing rattles them, and they keep everyone else steady.'}
]);
export const hireType = key => HIRE_TYPES.find(h => h.key === key) ?? null;

const FIRST = ['Dele', 'Shaz', 'Marcus', 'Jodie', 'Tunde', 'Kayleigh', 'Ramy', 'Bex', 'Connor', 'Asha', 'Liam', 'Precious', 'Hakan', 'Tash', 'Kwame', 'Shannon',
  'Ibby', 'Reece', 'Mo', 'Chantelle', 'Dev', 'Kerry', 'Femi', 'Rosa', 'Jermaine', 'Nat', 'Tomasz', 'Leanne', 'Yusuf', 'Gemma'];
const STREET = ['Two-Times', 'Ghost', 'Bricks', 'Nitro', 'Tidy', 'Biscuit', 'Lucky', 'Spanner', 'Smudge', 'Flex', 'Peanut', 'Stretch', 'Tank', 'Bones', 'Gully', 'Specs'];
/** A name for a new hand, avoiding names already on the crew. `rand` returns [0, 1). */
export function hireName(rand = Math.random, taken = []) {
  for (let i = 0; i < 40; i++) {
    const n = `${FIRST[Math.floor(rand() * FIRST.length)]} "${STREET[Math.floor(rand() * STREET.length)]}"`;
    if (!taken.includes(n)) return n;
  }
  return `${FIRST[Math.floor(rand() * FIRST.length)]} ${Math.floor(rand() * 90) + 10}`;
}
/** Why `system` (a character) can't take on a `type` hand now, or ''. */
export function hireProblem(system, type, current = 0) {
  const stage = Number(system?.stage || 1);
  if (!type) return 'Pick who to hire.';
  if (stage < HIRE_REP) return `Your own crew opens at Rep ${HIRE_REP} (Top Boy).`;
  if (current >= hireSlots(stage)) return `You can keep ${hireSlots(stage)} on at Rep ${stage}.${stage < 27 ? ` More at Rep ${stage < 20 ? 20 : 27}.` : ''}`;
  if (Number(system?.cash || 0) < type.fee) return `${type.label} wants £${type.fee} up front. You have £${Number(system?.cash || 0)}.`;
  return '';
}
/** The NPC actor data for a hand. */
export function hireActorData(type, {name, employer, img = null, ownership = {}}) {
  const health = 8 + ({4: 2, 6: 3, 8: 4}[type.stats.grt] ?? 2);
  return {
    name, type: 'npc', img: img || 'icons/svg/mystery-man.svg', ownership: {default: 0, ...ownership},
    system: {stats: Object.fromEntries(Object.entries(type.stats).map(([k, d]) => [k, {die: d}])), stage: Math.max(1, Math.min(33, Number(employer?.system?.stage || 13) - 6)),
      resources: {health: {value: health, max: health}, hustle: {value: 1, max: 1}}, role: 'crew', disposition: 'friendly',
      identity: {alias: name.match(/"([^"]+)"/)?.[1] ?? '', crew: employer?.name ?? 'Your crew', hustle: type.blurb},
      biography: `<p><b>${type.label}</b> on ${employer?.name ?? 'the crew'}'s payroll. ${type.blurb}</p>`},
    prototypeToken: {actorLink: true, disposition: 1, sight: {enabled: true}, name, texture: {src: img || 'icons/svg/mystery-man.svg'}},
    flags: {'the-smoke': {hire: {employer: employer?.id ?? null, role: type.key, hiredAt: Date.now()}}}
  };
}
