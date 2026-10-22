// The GM Screen's catalogue: everything the GM can throw at the players with one click.
//   QUICK_CHECKS  everyday rolls, named for the situation, offering the stats that could honestly answer it
//   TEAMWORK      everyone rolls, the average meets the target
//   HAZARDS       incoming trouble with its consequences applied automatically on a failure
//   STREET_EVENTS a d20 table of things that happen on the streets, most with a "Do it" automation
//   POLICE_EVENTS what the Metro Police do next
// Each response is {label, stat, hint}. Bands: easy, medium, hard, miracle (Long Shot).
const r = (label, stat, hint = '') => ({label, stat, hint});

export const QUICK_GROUPS = Object.freeze(['On the Street', 'Graft', 'Motors', 'Bother', 'Front', 'Savvy']);
export const QUICK_CHECKS = Object.freeze([
  // On the Street
  {id: 'spot-old-bill', group: 'On the Street', name: 'Spot the Old Bill', band: 'medium', text: 'Is that a plain-clothes copper, an unmarked car, a camera?', guide: 'Before trouble arrives. Success: they see it coming and get a free move.', responses: [r('Clock them', 'sav', 'Street smarts'), r('Keep your head down', 'mov', 'Already moving away')]},
  {id: 'blend-in', group: 'On the Street', name: 'Blend In', band: 'medium', text: 'Look like you belong: one more face on Mare Street.', guide: 'When someone is looking for them. Make it Hard if they are masked or bleeding.', responses: [r('Act natural', 'frt', 'Confidence'), r('Read the crowd', 'sav', 'Know how people here move')]},
  {id: 'find-a-way', group: 'On the Street', name: 'Find a Way Through', band: 'medium', text: 'A shortcut, a cut-through, an alley the map doesn\'t show.', guide: 'Local knowledge. Easy on their own ends.', responses: [r('I know these streets', 'sav', 'Local knowledge'), r('Over the wall', 'mov', 'Make your own way')]},
  {id: 'leg-it', group: 'On the Street', name: 'Leg It', band: 'medium', text: 'Run. Now. Don\'t look back.', guide: 'Foot chase. Against a specific chaser, roll their Moves and type it as the TN.', responses: [r('Sprint', 'mov', 'Speed'), r('Keep going', 'grt', 'Outlast them')]},
  {id: 'climb-vault', group: 'On the Street', name: 'Climb or Vault', band: 'medium', text: 'A fence, a wall, a garage roof, a gap between balconies.', guide: 'On a Bad Luck they make it but tear something: Bruised, or drop something.', responses: [r('Vault it', 'mov', 'Agility'), r('Haul yourself up', 'mus', 'Arms')]},
  {id: 'lose-tail-foot', group: 'On the Street', name: 'Lose a Tail', band: 'hard', text: 'Somebody has been behind you for three streets.', guide: 'Success: tail lost. Failure: they follow you home.', responses: [r('Double back', 'sav', 'Know the tricks'), r('Duck into the market', 'mov', 'Use the crowd'), r('Front it out', 'btl', 'Turn and stare')]},
  // Graft
  {id: 'pick-lock', group: 'Graft', name: 'Pick a Lock', band: 'medium', text: 'A door, a padlock, a window catch.', guide: 'Lock picks make it one band easier. Bad Luck: you get in, but leave a mark.', responses: [r('Pick it', 'grf', 'Hands and patience')]},
  {id: 'hotwire', group: 'Graft', name: 'Hotwire', band: 'medium', text: 'Under the column, find the wires, don\'t touch the wrong two.', guide: 'For a motor already open. Newer cars are Hard without a relay box.', responses: [r('Wire it', 'grf', 'Know the loom')]},
  {id: 'pickpocket', group: 'Graft', name: 'Pickpocket', band: 'medium', text: 'A phone from a back pocket, a wallet from a bag.', guide: 'Proper Mess: caught in the act; 1★ Heat if anyone saw (pickpocketing never goes higher).', responses: [r('Light fingers', 'grf', 'Sleight of hand'), r('Bump and lift', 'mov', 'Distraction')]},
  {id: 'plant', group: 'Graft', name: 'Plant Something', band: 'hard', text: 'Slip something into a bag, a pocket, a glovebox.', guide: 'For setting someone up, or getting rid of evidence.', responses: [r('Slip it in', 'grf', 'Sleight of hand'), r('Distract them', 'frt', 'Chat while you do it')]},
  {id: 'fix-it', group: 'Graft', name: 'Fix It', band: 'medium', text: 'An engine, a chain, a lock, a phone screen.', guide: 'A toolkit makes it Easy; no tools makes it Hard.', responses: [r('Get stuck in', 'grf', 'Hands'), r('Know what\'s wrong', 'sav', 'Diagnose it')]},
  {id: 'case-joint', group: 'Graft', name: 'Case the Joint', band: 'medium', text: 'Cameras, exits, staff, when the shutters go down.', guide: 'Success: one useful fact per margin point (min 1). Binoculars one band easier.', responses: [r('Watch it', 'sav', 'Patience'), r('Walk in and look', 'frt', 'Be a customer')]},
  // Motors
  {id: 'drive-like-stole', group: 'Motors', name: 'Drive Like You Stole It', band: 'medium', text: 'Wrong side of the road, through the lights, up the kerb.', guide: 'Behind the wheel the vehicle\'s Performance die replaces the Effort die automatically.', responses: [r('Floor it', 'whl', 'Wheels')]},
  {id: 'lose-police', group: 'Motors', name: 'Lose the Police', band: 'hard', text: 'Blue lights in the mirror. Get out of sight.', guide: 'Success: out of sight — Heat starts cooling. Getaway Driver perk applies.', responses: [r('Out-drive them', 'whl', 'Wheels'), r('Know the back roads', 'sav', 'Local knowledge')]},
  {id: 'squeeze', group: 'Motors', name: 'Squeeze Through', band: 'medium', text: 'Between a bus and a skip lorry, under a closing barrier.', guide: 'Bad Luck: through, but the vehicle takes 2 damage.', responses: [r('Thread it', 'whl', 'Wheels')]},
  {id: 'keep-it-together', group: 'Motors', name: 'Keep It Together', band: 'medium', text: 'You hit something. Keep driving.', guide: 'After a crash. Failure: stall, spin or stop.', responses: [r('Wrestle the wheel', 'whl', 'Wheels'), r('Don\'t panic', 'btl', 'Nerve')]},
  {id: 'jump-it', group: 'Motors', name: 'Jump It', band: 'hard', text: 'Canal steps, a ramp, the speed bump outside the school.', guide: 'Proper Mess: the rider comes off (use the Bike Crash hazard).', responses: [r('Send it', 'whl', 'Wheels'), r('Commit', 'btl', 'Nerve')]},
  // Bother
  {id: 'shove-past', group: 'Bother', name: 'Shove Past', band: 'medium', text: 'Through the door, past the bouncer, out of the crush.', guide: 'Against a person, roll their Muscle and type it as the TN.', responses: [r('Barge', 'mus', 'Weight'), r('Slip past', 'mov', 'Speed')]},
  {id: 'break-door', group: 'Bother', name: 'Break Down a Door', band: 'medium', text: 'A flat door. A fire door. A shutter.', guide: 'A crowbar or axe makes it Easy. Loud: anyone near hears.', responses: [r('Boot it', 'mus', 'Force'), r('Find the weak point', 'grf', 'Hinges and frames')]},
  {id: 'take-a-hit', group: 'Bother', name: 'Take a Hit', band: 'medium', text: 'Brace. It\'s going to hurt.', guide: 'Halve the damage on a success.', responses: [r('Brace', 'grt', 'Toughness')]},
  {id: 'stay-conscious', group: 'Bother', name: 'Stay Conscious', band: 'medium', text: 'Everything is going dark at the edges.', guide: 'When Down. A Proper Mess, or nobody helping in three rounds: Wasted.', responses: [r('Hold on', 'grt', 'Grit')]},
  {id: 'keep-bottle', group: 'Bother', name: 'Keep Your Bottle', band: 'medium', text: 'Guns out, sirens, blood. Do you run, freeze, or keep your head?', guide: 'Failure: Shaken; Proper Mess: Bricking It.', responses: [r('Keep your head', 'btl', 'Nerve')]},
  {id: 'dont-grass', group: 'Bother', name: 'Don\'t Grass', band: 'hard', text: 'Interview room, tape running. "Make it easy on yourself."', guide: 'Failure: they let something slip. DS Vale\'s favourite game.', responses: [r('No comment', 'btl', 'Nerve'), r('Spin a story', 'frt', 'Lie')]},
  // Front
  {id: 'talk-way-out', group: 'Front', name: 'Talk Your Way Out', band: 'hard', text: 'Bluff, charm or bore them into letting you go.', guide: 'Police stops: Hard at 1 star, Long Shot at 2+. Silver Tongue applies.', responses: [r('Charm', 'frt', 'Front'), r('Know the law', 'sav', 'Your rights')]},
  {id: 'blag-in', group: 'Front', name: 'Blag Your Way In', band: 'medium', text: 'A guest list, a staff door, a cordon.', guide: 'Hi-vis or the right uniform makes it Easy.', responses: [r('Act like you belong', 'frt', 'Front'), r('Know the names', 'sav', 'Do your homework')]},
  {id: 'haggle', group: 'Front', name: 'Haggle', band: 'medium', text: 'Knock the price down, or push it up.', guide: 'Success: 10% better; Smashed It: 20%; Proper Mess: they won\'t deal today.', responses: [r('Haggle', 'frt', 'Front'), r('Know what it\'s worth', 'sav', 'Market sense')]},
  {id: 'get-info', group: 'Front', name: 'Get Someone Talking', band: 'medium', text: 'What did they see? Who was it? Where did they go?', guide: 'One answer per success, two on Smashed It.', responses: [r('Chat them up', 'frt', 'Front'), r('Read them', 'sav', 'Savvy'), r('Lean on them', 'mus', 'Intimidation')]},
  {id: 'intimidate', group: 'Front', name: 'Scare Them Off', band: 'medium', text: 'Make them think twice.', guide: 'Against a hard case, roll their Bottle and type it as the TN.', responses: [r('Get in their face', 'frt', 'Front'), r('Look like you mean it', 'btl', 'Nerve'), r('Show them your size', 'mus', 'Muscle')]},
  {id: 'calm-down', group: 'Front', name: 'Calm It Down', band: 'medium', text: 'Before someone gets glassed.', guide: 'Success stops a fight starting; Smashed It ends one.', responses: [r('Talk them down', 'frt', 'Front'), r('Stand firm', 'btl', 'Nerve')]},
  // Savvy
  {id: 'patch-up', group: 'Savvy', name: 'Patch Someone Up', band: 'medium', text: 'Stop the bleeding with what\'s to hand.', guide: 'A first aid kit removes Bleeding or Hurt on a success.', responses: [r('First aid', 'sav', 'Savvy')]},
  {id: 'know-a-bloke', group: 'Savvy', name: 'Know a Bloke', band: 'medium', text: 'Somebody who sells it, fixes it, or knows where it went.', guide: 'Fixer perk applies. Failure: you know someone, but they want a favour.', responses: [r('Ring round', 'sav', 'Contacts'), r('Ask nicely', 'frt', 'Front')]},
  {id: 'read-room', group: 'Savvy', name: 'Read the Room', band: 'medium', text: 'Who\'s in charge, who\'s nervous, who\'s carrying.', guide: 'Ask one question per success.', responses: [r('Watch', 'sav', 'Savvy')]},
  {id: 'spot-grass', group: 'Savvy', name: 'Spot the Grass', band: 'hard', text: 'Someone in this crew is talking to the police.', guide: 'Grass Radar applies.', responses: [r('Trust your gut', 'sav', 'Savvy'), r('Test them', 'frt', 'Front')]}
]);

export const TEAMWORK = Object.freeze([
  {id: 'push-van', name: 'Push the Van', band: 'medium', text: 'It won\'t start and the police are coming.', guide: 'Everyone rolls; the average meets the TN.', responses: [r('Push', 'mus'), r('Keep pushing', 'grt')]},
  {id: 'carry-out', name: 'Carry Someone Out', band: 'medium', text: 'They are Down and you are not leaving them.', guide: 'Failure: you get them out, but slowly — one more round of danger.', responses: [r('Lift', 'mus'), r('Keep going', 'grt'), r('Find the way', 'sav')]},
  {id: 'hold-door', name: 'Hold the Door', band: 'hard', text: 'Something big is on the other side.', guide: 'Buys one round per success.', responses: [r('Brace it', 'mus'), r('Hold on', 'grt'), r('Don\'t flinch', 'btl')]},
  {id: 'search-flat', name: 'Search the Place', band: 'medium', text: 'Turn it over before they come back.', guide: 'One find per success; Proper Mess: someone comes home.', responses: [r('Methodical', 'sav'), r('Rip it apart', 'mus'), r('Locks and hiding places', 'grf')]},
  {id: 'get-everyone-out', name: 'Get Everyone Out', band: 'medium', text: 'Fire, raid, or a riot starting. Out, now.', guide: 'Failure: someone gets left behind (GM picks).', responses: [r('Lead them', 'frt'), r('Clear the way', 'mus'), r('Know the exits', 'sav')]}
]);

// Hazards: the consequence for each outcome is applied automatically when the roll comes back (the GM can switch
// that off on the screen). Keys: damage (reduced by armour if armoured), conditions, heat, cashPct (lose % of cash).
const C = (damage = 0, conditions = [], extra = {}) => ({damage, conditions, ...extra});
export const HAZARD_GROUPS = Object.freeze(['Roads', 'Falls & Fights', 'Police Kit', 'Fire, Water & Worse']);
export const HAZARDS = Object.freeze([
  {id: 'hit-by-car', group: 'Roads', name: 'Hit by a Car', band: 'hard', text: 'Headlights, a horn, no time.', responses: [r('Dive clear', 'mov'), r('Roll over the bonnet', 'grt')],
   narrow: C(2, ['Prone']), costly: C(6, ['Prone', 'Hurt']), severe: C(9, ['Broken', 'Prone'])},
  {id: 'bike-crash', group: 'Roads', name: 'Come Off the Bike', band: 'medium', text: 'The front wheel goes, the tarmac comes up.', responses: [r('Ride it out', 'whl'), r('Land it', 'mov')],
   narrow: C(1, ['Bruised']), costly: C(4, ['Prone', 'Bruised']), severe: C(7, ['Broken', 'Prone']), armoured: true},
  {id: 'car-crash', group: 'Roads', name: 'Car Crash', band: 'medium', text: 'Metal on metal. Airbags if you are lucky.', responses: [r('Brace', 'grt'), r('Steer into it', 'whl')],
   narrow: C(1, ['Shaken']), costly: C(4, ['Hurt']), severe: C(7, ['Broken', 'Bricking It'])},
  {id: 'glass', group: 'Falls & Fights', name: 'Glass Everywhere', band: 'medium', text: 'Through a window, or a bottle smashed in your face.', responses: [r('Cover up', 'mov'), r('Grit your teeth', 'grt')],
   narrow: C(1), costly: C(3, ['Bleeding']), severe: C(5, ['Bleeding', 'In Pain']), armoured: true},
  {id: 'fall', group: 'Falls & Fights', name: 'Fall from Scaffolding', band: 'hard', text: 'The plank gives. Two storeys down.', responses: [r('Grab something', 'mov'), r('Land right', 'grt')],
   narrow: C(2, ['Bruised']), costly: C(5, ['Hurt', 'Prone']), severe: C(8, ['Broken', 'Down'])},
  {id: 'dog', group: 'Falls & Fights', name: 'Staffie on the Loose', band: 'medium', text: 'It has decided your leg is the best thing it has seen all day.', responses: [r('Run', 'mov'), r('Stand your ground', 'btl'), r('Kick it off', 'mus')],
   narrow: C(1), costly: C(3, ['Bleeding']), severe: C(4, ['Bleeding', 'Restrained'])},
  {id: 'bottled', group: 'Falls & Fights', name: 'Bottle Thrown', band: 'medium', text: 'From across the road, end over end.', responses: [r('Duck', 'mov')], narrow: C(0, ['Shaken']), costly: C(3, ['Bleeding']), severe: C(4, ['Bleeding', 'Prone'])},
  {id: 'crush', group: 'Falls & Fights', name: 'Crowd Crush', band: 'medium', text: 'A gig, a march, a fight at the station. You cannot breathe.', responses: [r('Push out', 'mus'), r('Keep your head', 'btl')], narrow: C(1, ['Shaken']), costly: C(3, ['Knackered']), severe: C(5, ['Down'])},
  {id: 'stray-bullet', group: 'Falls & Fights', name: 'Stray Bullet', band: 'hard', text: 'Somebody is shooting and they are not good at it.', responses: [r('Hit the floor', 'mov'), r('Get behind something', 'sav')],
   narrow: C(0, ['Shaken']), costly: C(5, ['Bleeding']), severe: C(8, ['Bleeding', 'Down']), armoured: true},
  {id: 'tasered', group: 'Police Kit', name: 'Taser!', band: 'hard', text: '"TASER! TASER!" — the red dot is on your chest.', responses: [r('Dodge', 'mov'), r('Take it', 'grt')], narrow: C(0, ['Shaken']), costly: C(1, ['Stunned', 'Prone']), severe: C(1, ['Stunned', 'Prone', 'Restrained'])},
  {id: 'cs-gas', group: 'Police Kit', name: 'CS Spray', band: 'medium', text: 'A hiss and your eyes are on fire.', responses: [r('Turn away', 'mov'), r('Push through it', 'grt')], narrow: C(0), costly: C(0, ['Gassed']), severe: C(0, ['Gassed', 'Bricking It'])},
  {id: 'police-dog', group: 'Police Kit', name: 'Police Dog', band: 'hard', text: 'The handler lets it go. It is faster than you.', responses: [r('Outrun it', 'mov'), r('Freeze', 'btl')], narrow: C(1), costly: C(3, ['Bleeding', 'Grabbed']), severe: C(5, ['Bleeding', 'Grabbed', 'Prone'])},
  {id: 'smoke', group: 'Fire, Water & Worse', name: 'Fire and Smoke', band: 'medium', text: 'Black smoke rolling along the ceiling, heat on your face.', responses: [r('Stay low and out', 'mov'), r('Hold your breath', 'grt')], narrow: C(1, ['Gassed']), costly: C(3, ['Gassed', 'Knackered']), severe: C(5, ['Burning'])},
  {id: 'canal', group: 'Fire, Water & Worse', name: 'In the Canal', band: 'medium', text: 'Cold, black, full of shopping trolleys.', responses: [r('Swim', 'grt'), r('Grab the towpath', 'mov')], narrow: C(0, ['Knackered']), costly: C(2, ['Knackered', 'Shaken']), severe: C(4, ['Knackered', 'Down'])},
  {id: 'petrol-bomb', group: 'Fire, Water & Worse', name: 'Petrol Bomb', band: 'hard', text: 'It bursts at your feet.', responses: [r('Jump clear', 'mov')], narrow: C(1), costly: C(3, ['Burning']), severe: C(5, ['Burning', 'In Pain'])},
  {id: 'bad-kebab', group: 'Fire, Water & Worse', name: 'Dodgy Kebab', band: 'easy', text: 'The chilli sauce was not chilli sauce.', responses: [r('Stomach of iron', 'grt')], narrow: C(0), costly: C(0, ['Knackered']), severe: C(1, ['Knackered', 'In Pain'])}
]);

// Street events (d20). `auto` names an automation the screen can run for the GM: rivals, patrol, bike, pickpocket,
// recognised, kez, quick:<id> (post that quick check), hazard:<id>.
export const STREET_EVENTS = Object.freeze([
  {roll: 1, name: 'Lea Boys turn up', text: 'Two of Stretch\'s lads on bikes, circling. They have seen you on their patch.', auto: 'rivals'},
  {roll: 2, name: 'Patrol cruises past', text: 'A Metro Police area car rolls by, slowly. Anyone in a nicked motor gets pinged.', auto: 'patrol'},
  {roll: 3, name: 'Kez texts a tip-off', text: '"Carbon Whippet outside the coffee place, cheap lock, owner inside 10 mins x"', auto: 'bike'},
  {roll: 4, name: 'Dipped', text: 'A bump in the crowd. Is your wallet still there?', auto: 'pickpocket'},
  {roll: 5, name: 'Someone recognises you', text: '"Oi! I know you!" — a face from a job that went wrong.', auto: 'recognised'},
  {roll: 6, name: 'Staffie off the lead', text: 'Its owner is shouting "he\'s friendly!" It is not.', auto: 'hazard:dog'},
  {roll: 7, name: 'Fight outside the chicken shop', text: 'Two lads, one bottle, lots of shouting. Everyone is filming.', auto: 'quick:calm-down'},
  {roll: 8, name: 'Road works', text: 'Temporary lights and a man with a STOP sign. The road is down to one lane.', auto: 'quick:squeeze'},
  {roll: 9, name: 'Sudden downpour', text: 'London rain. Wheels rolls are one band harder until it stops.', auto: ''},
  {roll: 10, name: 'A favour asked', text: 'Mo from Chicken Palace needs something carried, collected or forgotten.', auto: ''},
  {roll: 11, name: 'Undercover buy', text: 'A friendly lad wants to buy something off you. Too friendly.', auto: 'quick:spot-grass'},
  {roll: 12, name: 'Ice cream van', text: 'Greensleeves. Mister Ripple, parked up, engine running, nobody in the cab.', auto: ''},
  {roll: 13, name: 'Lost tourist', text: 'Somebody asks the way to Columbia Road. Their bag is wide open.', auto: ''},
  {roll: 14, name: 'Bike in a skip', text: 'A decent mountain bike frame, no wheels, in a skip on Morning Lane.', auto: ''},
  {roll: 15, name: 'Fire engine on a shout', text: 'Sirens, the road clears, everything pulls over.', auto: ''},
  {roll: 16, name: 'Market day', text: 'Stalls everywhere: cheap clobber, cheap phones, cheap everything.', auto: ''},
  {roll: 17, name: 'Old friend', text: 'Someone from school, now working at the council. They owe you one.', auto: ''},
  {roll: 18, name: 'Somebody filming', text: 'A teenager has their phone out and has been recording for a while.', auto: 'quick:blend-in'},
  {roll: 19, name: 'Stray bullet', text: 'A moped, a pop, glass everywhere. Not aimed at you. Probably.', auto: 'hazard:stray-bullet'},
  {roll: 20, name: 'A proper opportunity', text: 'A delivery van, back doors open, driver inside a shop. Thirty seconds.', auto: ''}
]);

export const POLICE_EVENTS = Object.freeze([
  {id: 'stop-search', name: 'Stop and Search', text: '"Can I have a word? Turn out your pockets."', guide: 'Savvy to hide gear before they search; Front to talk it down. Anything illegal found (weapon or drugs): +1 Heat, 2★ at most.', responses: [r('Ditch it first', 'sav'), r('Talk it down', 'frt'), r('Leg it', 'mov')], band: 'medium'},
  {id: 'anpr-ping', name: 'ANPR Ping', text: 'A camera on the A10 reads your plate. If the motor is nicked, every unit hears it.', guide: 'If they are in a nicked vehicle: +1 Heat, 2★ at most. Spare plates beat it.', responses: [r('Pull off the main road', 'sav'), r('Keep calm and drive', 'btl')], band: 'medium'},
  {id: 'heli-overhead', name: 'India 99 Overhead', text: 'The helicopter. The searchlight. The noise.', guide: 'At 3+ stars it sees anyone outdoors. Get under a roof.', responses: [r('Get under cover', 'sav'), r('Run for it', 'mov')], band: 'hard'},
  {id: 'door-knock', name: 'Knock at the Door', text: 'Two officers at the flat. They have a few questions about a bike.', guide: 'Known to police 3+: they have a warrant. Failure: Busted or a search.', responses: [r('Bluff', 'frt'), r('Don\'t grass', 'btl'), r('Out the back', 'mov')], band: 'hard'},
  {id: 'vale-visits', name: 'DS Vale Drops By', text: 'DS Harriet Vale, two coffees, very friendly. She knows more than she says.', guide: 'Bottle to keep your story; Savvy to work out what she knows.', responses: [r('No comment', 'btl'), r('Find out what she knows', 'sav'), r('Charm her', 'frt')], band: 'hard'}
]);

/** London names for NPCs made up on the spot. */
export const FIRST_NAMES = Object.freeze(['Jamal', 'Chantelle', 'Kwame', 'Shannon', 'Tariq', 'Precious', 'Callum', 'Aisha', 'Darren', 'Ngozi', 'Kieran', 'Fatima', 'Ricky', 'Leanne', 'Kofi', 'Jade', 'Harun', 'Stacey', 'Liam', 'Yasmin', 'Tunde', 'Gemma', 'Arjun', 'Kayleigh', 'Dwayne', 'Ruksana', 'Connor', 'Blessing', 'Mehmet', 'Sharon', 'Theo', 'Amira']);
export const SURNAMES = Object.freeze(['Okafor', 'Smith', 'Begum', 'O\'Connor', 'Yilmaz', 'Mensah', 'Patel', 'Williams', 'Ali', 'Murphy', 'Campbell', 'Ahmed', 'Taylor', 'Adeyemi', 'Kowalski', 'Hussain', 'Brown', 'Nwosu', 'Clarke', 'Demir', 'Khan', 'Thompson', 'Asante', 'Singh']);
export const NPC_ROLES = Object.freeze([
  {key: 'shopkeeper', label: 'Shopkeeper', dice: {sav: 8, frt: 8, btl: 6}},
  {key: 'bouncer', label: 'Bouncer', dice: {mus: 10, grt: 8, btl: 8, frt: 6}},
  {key: 'dealer', label: 'Dealer', dice: {sav: 8, frt: 8, mov: 6, btl: 6}},
  {key: 'hard-case', label: 'Hard case', dice: {mus: 8, grt: 8, btl: 10, aim: 6}},
  {key: 'rival', label: 'Rival crew', dice: {mov: 8, whl: 8, mus: 6, grf: 6, btl: 6}},
  {key: 'witness', label: 'Nosy witness', dice: {sav: 8, frt: 6}},
  {key: 'pensioner', label: 'Pensioner', dice: {sav: 10, btl: 8, frt: 8}},
  {key: 'student', label: 'Student', dice: {mov: 6, sav: 6, frt: 6}}
]);
