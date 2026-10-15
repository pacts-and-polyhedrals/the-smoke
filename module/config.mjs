// THE SMOKE — constants. The dice are the Covenant Dice System (Effort Die + Stat Die + Stat modifier,
// exploding, Target Numbers solved from difficulty bands); the stats, resources and Heat are London's.
export const NS = 'the-smoke';
export const SOCKET = `system.${NS}`;

export const STATS = Object.freeze({
  mus: {abbr: 'MUS', label: 'Muscle', hint: 'Lifting, shoving, fighting hand to hand, kicking a door in.'},
  grt: {abbr: 'GRT', label: 'Grit', hint: 'Taking a hit, running all night, staying conscious, holding a hose on a fire.'},
  mov: {abbr: 'MOV', label: 'Moves', hint: 'Dodging, climbing, vaulting fences, running away, slipping cuffs.'},
  whl: {abbr: 'WHL', label: 'Wheels', hint: 'Driving and riding anything. The vehicle\'s Performance die replaces your Effort die.'},
  aim: {abbr: 'AIM', label: 'Aim', hint: 'Shooting, throwing, hitting a moving target from a moving vehicle.'},
  grf: {abbr: 'GRF', label: 'Graft', hint: 'Locks, hotwiring, pickpocketing, sleight of hand, fixing an engine.'},
  sav: {abbr: 'SAV', label: 'Savvy', hint: 'Street smarts: spotting cops and tails, knowing London, first aid, finding a fence.'},
  frt: {abbr: 'FRT', label: 'Front', hint: 'Chat, bluff, charm, intimidation, haggling, talking down a copper.'},
  btl: {abbr: 'BTL', label: 'Bottle', hint: 'Nerve. Keeping your head when it goes wrong, standing your ground, not grassing.'}
});
export const STAT_KEYS = Object.freeze(Object.keys(STATS));
export const STAT_LABELS = Object.freeze(Object.fromEntries(Object.entries(STATS).map(([k, v]) => [k, `${v.abbr} — ${v.label}`])));

export const DIE_LADDER = Object.freeze([4, 6, 8, 10, 12, 20]);
export const STAT_MODIFIERS = Object.freeze({4: 2, 6: 3, 8: 4, 10: 5, 12: 6, 20: 10});
export const STARTING_SPREAD = Object.freeze({8: 1, 6: 3, 4: 5});

/** Heat: the wanted level. Each star brings a bigger police response. */
export const HEAT = Object.freeze([
  {stars: 0, name: 'Clean', response: 'Nobody is looking for you.'},
  {stars: 1, name: 'Clocked', response: 'A patrol has your description. Cops who see you will stop you.'},
  {stars: 2, name: 'Wanted', response: 'Area cars hunt you and give chase on sight.'},
  {stars: 3, name: 'India 99', response: 'The NPAS helicopter is up: it spots you anywhere outdoors on this map.'},
  {stars: 4, name: 'Trojans', response: 'Armed Response Vehicles join the hunt. They will shoot.'},
  {stars: 5, name: 'Lockdown', response: 'Roadblocks on every exit of the map. Every unit in the borough.'}
]);

/** What a crime adds to Heat when someone sees it. */
export const CRIMES = Object.freeze({
  nickBike: {label: 'Nicking a bike', heat: 1},
  nickCar: {label: 'Nicking a car', heat: 1},
  carjack: {label: 'Carjacking', heat: 2},
  assault: {label: 'Assault', heat: 1},
  assaultCop: {label: 'Assaulting a police officer', heat: 2},
  shooting: {label: 'Firing a gun', heat: 2},
  murder: {label: 'Killing someone', heat: 3},
  copKiller: {label: 'Killing a police officer', heat: 4},
  evading: {label: 'Failing to stop for police', heat: 1},
  dangerousDriving: {label: 'Dangerous driving', heat: 1},
  stealCopCar: {label: 'Stealing a police vehicle', heat: 3}
});

export const CASH = '£';
export const VEHICLE_LOCK_BANDS = Object.freeze({easy: 'Easy', medium: 'Medium', hard: 'Hard', miracle: 'Long Shot'});

export const JOB_TYPES = Object.freeze({
  taxi: {label: 'Taxi', icon: 'fa-solid fa-taxi', verb: 'Taxi shift', hint: 'Pick up fares hailing on the street and get them where they are going before the meter runs out.'},
  police: {label: 'Police', icon: 'fa-solid fa-shield-halved', verb: 'Police shift', hint: 'Respond to calls: ANPR stolen-vehicle sweeps, pursuits and disturbances. Arrests go to a police station.'},
  ambulance: {label: 'Paramedic', icon: 'fa-solid fa-truck-medical', verb: 'Paramedic shift', hint: 'Treat patients at the scene and get them to Homerton or the Royal London while they can still be saved.'},
  fire: {label: 'Firefighter', icon: 'fa-solid fa-fire-extinguisher', verb: 'Firefighter shift', hint: 'Get the pump to the fire and put it out before the building is lost.'},
  courier: {label: 'Courier', icon: 'fa-solid fa-box', verb: 'Courier shift', hint: 'Collect parcels and takeaway orders and deliver them on time and in one piece.'},
  bus: {label: 'Bus', icon: 'fa-solid fa-bus', verb: 'Bus shift', hint: 'Run the route stop to stop on time. Every stop pays.'},
  crew: {label: 'The Chainring', icon: 'fa-solid fa-link', verb: 'Crew job', hint: 'Auntie Pat wants bikes. Find them, cut the locks, ride them to The Arches on Morning Lane.'}
});

export const SERVICE_LABELS = Object.freeze({
  hospital: 'A&E', police: 'Police station', fire: 'Fire station', respray: 'Respray', safehouse: 'Safehouse', gang: 'The Arches (your crew)',
  clothes: 'Market / clobber', rank: 'Taxi rank', chop: 'Chop shop', dealer: 'Dealer'
});

export const DEFAULT_ICONS = Object.freeze({
  character: 'icons/svg/mystery-man.svg', npc: 'icons/svg/mystery-man.svg', vehicle: 'icons/svg/target.svg',
  weapon: 'icons/svg/sword.svg', armour: 'icons/svg/shield.svg', gear: 'icons/svg/item-bag.svg', condition: 'icons/svg/aura.svg', perk: 'icons/svg/upgrade.svg'
});

export const RANGE_ZONES = Object.freeze(['Engaged', 'Near', 'Far', 'Distant']);
