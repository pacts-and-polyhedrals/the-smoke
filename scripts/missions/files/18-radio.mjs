// DM mission files: Radio Wars (12). The stations are real London broadcasters used only as sources of live audio;
// every contact, venue, rival and incident here is fictional and nothing suggests a real station does anything unlawful.
// The radio-panel roll is automatic: Spread the Signal is Front (medium), Hold the Frequency is Savvy (hard).
// The checks below are the ones the GM calls around it.
const PED = n => `systems/the-smoke/assets/tokens/people/ped-${String(n).padStart(2, '0')}.webp`;
const RIVAL = {name: 'The Static Kings', role: 'Fictional rival promo crew', img: PED(18), look: 'Three lads in matching bomber jackets with a van full of flyers and a portable speaker.', manner: 'Loud, cocky, quick to paste over anyone else\'s poster.', wants: 'Every wall, every listener and every dial in East London.', line: 'Your lot? Never heard of you. Neither will anyone else.'};
const CONTACTS = {
  dele: {name: 'Dele Ashby', role: 'Fictional producer and fan, Eagle Wharf', img: PED(2), look: 'Thirties, beanie, headphones, a lockup full of flyers and a kettle.', manner: 'Quiet, obsessive about late-night sets.', wants: 'The late sets heard by everyone who should hear them.', line: 'If they don\'t know the show\'s on, it might as well not be.'},
  ronnie: {name: 'Ronnie Signal', role: 'Fictional signal runner, Dalston', img: PED(4), look: 'Fifties, anorak with forty pockets, a multimeter, jungle on his headphones.', manner: 'Talks fast, fixes faster.', wants: 'The jungle sound reaching every flat in Dalston.', line: 'Ninety-four, mate. That\'s when it all made sense.'},
  bea: {name: 'Bea Lyons', role: 'Fictional booking contact, Shacklewell', img: PED(7), look: 'Forties, smart coat, diary full of venues, phone always charging.', manner: 'Above board, organised, tired of fly-posters.', wants: 'Legitimate venue slots and a weekend broadcast that runs on time.', line: 'We do it properly or we don\'t do it.'},
  marcus: {name: 'Marcus Flynn', role: 'Fictional listening-point host, Clarence Road', img: PED(10), look: 'Sixties, cardigan, a wall of radios and a notebook of what everyone plays.', manner: 'Gentle, nosy, knows every tune on every dial.', wants: 'Listeners voting for what they actually want to hear.', line: 'I know what everyone in this borough is listening to. Ask me.'},
  toyin: {name: 'Toyin Adeyemi', role: 'Fictional community-radio stallholder, Broadway Market', img: PED(9), look: 'Thirties, market apron with badges on, a clipboard of acts.', manner: 'Warm, brisk, juggling six things at once.', wants: 'A full stage at the showcase and the sponsor\'s people kept happy.', line: 'Stage at two, sound check at one, panic at quarter to.'},
  gordon: {name: 'Gordon Pyke', role: 'Fictional relay contact and archive keeper, Marshgate', img: PED(20), look: 'Seventies, Aran jumper, a shed full of reel-to-reels and a ship in a bottle.', manner: 'Courteous, nostalgic, fiercely protective of the archive.', wants: 'The old broadcasts kept safe and listened to.', line: 'Every one of these tapes is somebody\'s summer.'}
};
export default {
  'rw-point-blank-01': {
    brief: `A radio war for listeners. Dele Ashby, a fictional producer and devoted fan, works from a lockup on Eagle Wharf Road and wants Point Blank's late-night sets heard across Hoxton before rival promoters buy up every wall. The crew run flyers and collect street requests for the underground line-up, then complete the promo at the lockup with the radio panel's roll (Front, medium). The rivals: the Static Kings, a fictional promo crew pasting over everything.`,
    openTitle: `Read aloud: spread the signal`,
    open: `Under a railway arch on Eagle Wharf Road, a lockup with the shutter half up. Inside: a kettle, a table of flyers and a young man in headphones nodding along to something only he can hear. He takes one ear off. "Dele," he says. "I love this station. The late sets. Nobody plays what they play." He hands you a stack of flyers. "Help me get them heard? The Static Kings have papered every wall from here to Old Street."`,
    cast: [],
    people: {dele: CONTACTS.dele, 'static-kings': RIVAL},
    roles: {dele: `The fictional fan and producer running the promo.`, 'static-kings': `The fictional rival crew covering every wall.`},
    scenes: [
      {at: 'RADIO-point-blank', title: `Flyers and requests`, read: `Hoxton at dusk. Every wall on Eagle Wharf Road is covered in Static Kings posters, three deep. Dele hands you a list: "Pubs, cafés, the canal, the bus stops. Get requests. What do people want to hear?"`,
        text: `Street work before the roll. The radio panel's promo roll (Front, medium) completes the objective at the lockup.`,
        checks: [['mov', 'medium', `Cover a mile of Hoxton with flyers before the Static Kings' van comes round again`, `Every café, every bus stop.`, `Their van overtakes you.`],
          ['grt', 'easy', `Stand outside The Narrowboat for two hours collecting requests`, `Forty requests in Dele's notebook.`, `Six requests and a cold.`]]},
      {at: 'RADIO-point-blank', title: `Back at the lockup`, read: `Back at the lockup, Dele reads the requests out loud and grins at each one. Then the Static Kings' van pulls up outside, and three lads in bomber jackets get out with paste buckets.`,
        text: `Roll the promo from the radio panel. The rivals are watching.`,
        checks: [['mus', 'medium', `Stand in the lockup doorway so they can't paste over Dele's shutter`, `They try, then give up and drive off.`, `They paste over half of it.`]]}
    ],
    closeTitle: `Read aloud: heard`,
    close: `At midnight, Dele turns up the radio in the lockup. A late set comes on, exactly the kind of thing on your request list. He closes his eyes. "That's it," he says. "That's why." He opens them. "Forty people asked for that tonight. Forty people who'll tune in." He grins. "The Static Kings can keep their walls."`,
    notes: [`The station is real and used only for live audio. Dele, the lockup and the Static Kings are fictional.`,
      `The objective needs the radio panel's promo roll (Front, medium) at the correct contact on LDN-HOXTON-WEST.`,
      `Each action takes Banana Watch time; failures can be retried on a later game day.`]
  },
  'rw-point-blank-02': {
    brief: `Hold the frequency. The Static Kings are stealing Dele's listeners with fake "rebrand" posters that send people to the wrong dial position. The crew work out which rival is behind it and win the listeners back, completing the defend action at the Eagle Wharf lockup with the radio panel's roll (Savvy, hard).`,
    openTitle: `Read aloud: hold the frequency`,
    open: `Dele holds up a poster: the station's logo, but with the wrong frequency printed underneath. "Somebody's been putting these up," he says. "Sending people to the wrong place on the dial. Fake." He crumples it. "Half our listeners from last week have gone." He looks at you. "Find out who. Get them back."`,
    cast: [],
    people: {dele: CONTACTS.dele, 'static-kings': RIVAL},
    roles: {dele: `Losing listeners to fake posters.`, 'static-kings': `Behind the fake posters.`},
    scenes: [
      {at: 'RADIO-point-blank', title: `The fake posters`, read: `Fake posters on every lamppost from Eagle Wharf Road to Hoxton Street. Same design, wrong number. A printer's mark in the corner.`,
        text: `Find the source, then roll defend (Savvy, hard) from the radio panel at the lockup.`,
        checks: [['grf', 'medium', `Peel a fake poster cleanly to read the printer's mark underneath`, `"Static Print, Old Street." The Kings' own print shop.`, `It tears.`],
          ['whl', 'medium', `Follow the Kings' van on its poster run`, `Every stop, photographed.`, `Lost at Old Street roundabout.`]]},
      {at: 'RADIO-point-blank', title: `Win them back`, read: `Dele's lockup, with a new stack of correct posters and a long night ahead.`,
        text: `Replace every fake. Then roll defend.`,
        checks: [['aim', 'easy', `Paste the correct poster dead centre over every fake in one slap`, `Perfect, every time.`, `Wonky. Redo.`],
          ['grt', 'medium', `Re-poster the whole route through the night`, `By dawn, every fake is covered.`, `Half the route.`]]}
    ],
    closeTitle: `Read aloud: back on the dial`,
    close: `The next night, Dele counts the requests coming in on his phone. Twenty. Thirty. Fifty. "They're back," he says. "And some new ones." He shows you a message: "Saw your poster. Never heard this station before. Wow." He puts the phone down. "The Static Kings did us a favour," he says. "They made people look."`,
    notes: [`The station is real and used only for live audio. Everything else is fictional.`,
      `The objective needs the radio panel's defend roll (Savvy, hard) at the correct contact on LDN-HOXTON-WEST.`,
      `Failures can be retried on a later game day.`]
  },
  'rw-rude-fm-01': {
    brief: `Ronnie Signal, a fictional signal runner and lifelong jungle fan, needs help getting Rude FM's evening set heard across Dalston. The crew repair a fan's receiver, carry the set's flyers to the next relay point, and complete the promo action at the Dalston contact with the radio panel's roll (Front, medium). Rival promoters are watching.`,
    openTitle: `Read aloud: keep the jungle sound alive`,
    open: `Up a flight of stairs above a shop off Kingsland Road, a man in an anorak with forty pockets is soldering a radio on his kitchen table. Jungle plays from a speaker on the windowsill. "Ronnie," he says, without looking up. "Ninety-four, mate. That's when it all made sense." He holds up the radio. "My neighbour's. Broke. She's eighty-one and she listens every night." He hands you a box of flyers. "Fix it, then get these out."`,
    cast: [],
    people: {ronnie: CONTACTS.ronnie, 'static-kings': RIVAL},
    roles: {ronnie: `The fictional signal runner and fan.`, 'static-kings': `Rival promoters watching.`},
    scenes: [
      {at: 'RADIO-rude-fm', title: `The broken receiver`, read: `Ronnie's kitchen table: a 1980s radio with its back off, wires everywhere, a soldering iron smoking gently.`,
        text: `Fix the neighbour's radio before the evening set.`,
        checks: [['grf', 'medium', `Re-solder the radio's loose aerial wire`, `It crackles, then sings. Ronnie cheers.`, `It sparks. Try again.`]]},
      {at: 'RADIO-rude-fm', title: `Carry the set`, read: `Dalston at dusk. Kingsland High Street, Ridley Road, Gillett Square. Ronnie's flyers in your bag. The Static Kings' van cruising past.`,
        text: `Get the word out, then roll the promo (Front, medium).`,
        checks: [['mov', 'medium', `Flyer Ridley Road market before the stalls close`, `Every stall.`, `They're packing up.`],
          ['mus', 'easy', `Carry Ronnie's neighbour's fixed radio up four flights to her flat`, `She cries when it plays.`, `You bump the banister.`]]}
    ],
    closeTitle: `Read aloud: ninety-four`,
    close: `That night, from the flat next door to Ronnie's, through the wall, you can hear it: jungle, loud, from an eighty-one-year-old woman's fixed radio. Ronnie grins. "Every night," he says. "She knows all the MCs' names." He turns his own speaker up to match. "Ninety-four," he says. "That's when it all made sense."`,
    notes: [`The station is real and used only for live audio. Ronnie and the rivals are fictional.`,
      `The objective needs the radio panel's promo roll (Front, medium) at the Dalston contact on LDN-HAGGERSTON.`]
  },
  'rw-rude-fm-02': {
    brief: `Hold the frequency. Rival promoters are telling people the evening set has been cancelled, and listeners are drifting away. The crew find out who started the rumour and win the listeners back, completing the defend action at Ronnie's Dalston contact with the radio panel's roll (Savvy, hard).`,
    openTitle: `Read aloud: cancelled?`,
    open: `Ronnie holds up his phone: a message going round Dalston group chats. "Evening set CANCELLED this week. Don't bother." He shakes his head. "It's not cancelled. Someone's making it up." He puts the phone down. "Half the estate's switched off. My neighbour rang me in tears." He looks at you. "Find who started it."`,
    cast: [],
    people: {ronnie: CONTACTS.ronnie, 'static-kings': RIVAL},
    roles: {ronnie: `Fighting a false rumour.`, 'static-kings': `Started the rumour.`},
    scenes: [
      {at: 'RADIO-rude-fm', title: `The rumour`, read: `Dalston: Ridley Road, the Rio, Gillett Square. Everyone's heard it. Nobody knows where it came from.`,
        text: `Trace the rumour, then roll defend (Savvy, hard).`,
        checks: [['grt', 'medium', `Ask every stallholder on Ridley Road who told them`, `Six of them say the same thing: three lads in bomber jackets.`, `Everyone says "dunno".`],
          ['aim', 'medium', `Photograph the Kings handing out "cancelled" flyers from across Gillett Square`, `Caught in the act.`, `Blurred.`]]},
      {at: 'RADIO-rude-fm', title: `Win them back`, read: `Ronnie's flat. The evening set is in an hour. You need to tell everyone it's on.`,
        text: `Spread the truth, then roll.`,
        checks: [['whl', 'medium', `Drive round the estates with a speaker on the roof playing the set's jingle`, `Windows open all over Dalston.`, `The speaker falls off.`],
          ['mus', 'easy', `Carry Ronnie's big speaker down to the square for a live listen`, `Down, set up, playing.`, `It's heavier than it looks.`]]}
    ],
    closeTitle: `Read aloud: on air`,
    close: `At eight o'clock, Gillett Square fills up: forty people round Ronnie's big speaker, the evening set booming out, jungle bouncing off the buildings. Ronnie's neighbour sits on a folding chair at the front, nodding along. "Cancelled," Ronnie says, laughing. "Cancelled!" He turns it up. "Not tonight."`,
    notes: [`The station is real and used only for live audio. Everything else is fictional.`,
      `The objective needs the radio panel's defend roll (Savvy, hard) at the Dalston contact on LDN-HAGGERSTON.`]
  },
  'rw-vision-radio-01': {
    brief: `Bea Lyons, a fictional booking contact who insists on doing everything above board, is trying to secure legitimate venue slots for a weekend of shows linked to Vision Radio UK while rival fly-posters cover every wall. The crew help her book venues properly and complete the promo action at the Shacklewell contact with the radio panel's roll (Front, medium).`,
    openTitle: `Read aloud: above board`,
    open: `Bea Lyons sits in a café on Shacklewell Lane with a diary full of venues and a phone that's always charging. "We do it properly or we don't do it," she says. "Licensed venues, proper bookings, proper posters on proper boards." She looks out of the window at a wall plastered with illegal fly-posters. "Unlike some people." She hands you a list. "Three venues. Help me sign them up."`,
    cast: [],
    people: {bea: CONTACTS.bea, 'static-kings': RIVAL},
    roles: {bea: `The fictional booking contact who does everything properly.`, 'static-kings': `The fly-posters.`},
    scenes: [
      {at: 'RADIO-vision-radio', title: `Three venues`, read: `Shacklewell Lane, Kingsland Road, Stoke Newington Road. Three venue managers, three busy offices.`,
        text: `Legitimate bookings before the roll.`,
        checks: [['whl', 'medium', `Get round three venues before the managers leave for the day`, `Three signatures.`, `One manager's gone home.`],
          ['grt', 'easy', `Wait in a venue manager's office for an hour while he finishes a call`, `He signs, impressed by your patience.`, `You leave. He doesn't sign.`]]},
      {at: 'RADIO-vision-radio', title: `Proper posters`, read: `A licensed poster board on Shacklewell Lane. The Static Kings have fly-posted over it.`,
        text: `Clean it, put up the proper poster, then roll the promo.`,
        checks: [['mus', 'easy', `Scrape the fly-posters off the licensed board`, `Clean.`, `It takes an hour.`],
          ['aim', 'easy', `Get the proper poster dead straight first time`, `Perfect.`, `Wonky.`]]}
    ],
    closeTitle: `Read aloud: properly`,
    close: `Bea ticks the last box in her diary. "Three venues. Licensed. Signed." She looks at the clean poster board, the proper poster on it, straight and neat. "Properly," she says. She almost smiles. "You'd be amazed how rare that is."`,
    notes: [`The station is real and used only for live audio. Bea and everyone else are fictional.`,
      `The objective needs the radio panel's promo roll (Front, medium) at the Shacklewell contact on LDN-DALSTON.`]
  },
  'rw-vision-radio-02': {
    brief: `Hold the frequency. A rival has double-booked one of Bea's venues for the same weekend and is telling listeners her shows have moved. The crew untangle the double-booking and win the listeners back, completing the defend action at the Shacklewell contact with the radio panel's roll (Savvy, hard).`,
    openTitle: `Read aloud: double-booked`,
    open: `Bea is on the phone, very calm, which is how you know it's bad. "Double-booked," she says, hanging up. "The venue on Kingsland Road. Someone else has booked the same Saturday and they're telling people our show's moved." She puts the phone face down. "It hasn't. I have a signed contract." She looks at you. "Help me prove it."`,
    cast: [],
    people: {bea: CONTACTS.bea, 'static-kings': RIVAL},
    roles: {bea: `Has a signed contract.`, 'static-kings': `Double-booked the venue.`},
    scenes: [
      {at: 'RADIO-vision-radio', title: `The double-booking`, read: `The venue's office on Kingsland Road. A manager with two contracts on his desk, both for the same Saturday, looking miserable.`,
        text: `Prove whose contract came first, then roll defend (Savvy, hard).`,
        checks: [['grf', 'medium', `Get the venue's booking log from the office computer while the manager makes tea`, `Bea's booking: 3rd. The Kings': 9th.`, `Password-protected.`],
          ['btl', 'easy', `Sit in the office until the manager agrees to honour the first booking`, `He sighs. "Fine. First come, first served."`, `He asks you to leave.`]]},
      {at: 'RADIO-vision-radio', title: `Win them back`, read: `Shacklewell Lane, Saturday morning. Listeners need to know the show hasn't moved.`,
        text: `Spread the word, then roll.`,
        checks: [['mov', 'medium', `Flyer the queue outside the wrong venue the Kings sent people to`, `Forty people walk round the corner to the right one.`, `They've already gone home.`],
          ['whl', 'easy', `Give a vanload of confused listeners a lift to the right venue`, `Delivered.`, `Lost in Dalston.`]]}
    ],
    closeTitle: `Read aloud: first come, first served`,
    close: `On Saturday night, the venue on Kingsland Road is full: Bea's show, Bea's acts, Bea's licensed posters on the wall. Bea stands at the back with her diary, ticking things off. "First come, first served," she says. "That's the rule." She closes the diary. "Some people think rules are boring." She looks at the packed room. "Rules are how you get this."`,
    notes: [`The station is real and used only for live audio. Everything else is fictional.`,
      `The objective needs the radio panel's defend roll (Savvy, hard) at the Shacklewell contact on LDN-DALSTON.`]
  },
  'rw-flex-fm-01': {
    brief: `Marcus Flynn, a fictional radio enthusiast, runs a "listening point" from his front room on Clarence Road with a wall of radios, and knows what everyone in the borough is listening to. He wants a tune on Flex FM voted for by listeners before the competition gets in first. The crew take listener votes, test his aerial and complete the promo action with the radio panel's roll (Front, medium).`,
    openTitle: `Read aloud: the listening point`,
    open: `Marcus Flynn's front room on Clarence Road is a wall of radios: old, new, transistor, valve, all tuned to different stations, all playing quietly at once. He sits in a cardigan with a notebook. "I know what everyone in this borough is listening to," he says. "Ask me." He taps the notebook. "Help me collect votes for a request. The people's choice. Before the competition gets theirs on first."`,
    cast: [],
    people: {marcus: CONTACTS.marcus, 'static-kings': RIVAL},
    roles: {marcus: `The fictional listening-point host.`, 'static-kings': `The competition.`},
    scenes: [
      {at: 'RADIO-flex-fm', title: `Listener votes`, read: `Clarence Road, Mare Street, the Narrow Way. Shops, cafés, a launderette. Everyone has an opinion about music.`,
        text: `Collect votes, then roll the promo.`,
        checks: [['grt', 'medium', `Stand on the Narrow Way all afternoon collecting votes`, `Two hundred votes. A clear winner.`, `Forty votes. No clear winner.`],
          ['mov', 'easy', `Dodge the Static Kings' clipboard crew working the same street`, `You get to people first.`, `They beat you to the queue.`]]},
      {at: 'RADIO-flex-fm', title: `Test the aerial`, read: `Marcus's roof. An old TV aerial, bent, with a radio aerial strapped to it with gaffer tape. Marcus shouts up from the window: "Is it pointing at Stratford?"`,
        text: `Fix the aerial so Marcus can hear the request go out.`,
        checks: [['mus', 'medium', `Straighten the bent aerial mast on the roof`, `Straight. Marcus cheers from the window.`, `It bends the other way.`],
          ['grf', 'easy', `Re-tape the radio aerial to the mast properly`, `Solid.`, `It flaps in the wind.`]]}
    ],
    closeTitle: `Read aloud: the people's choice`,
    close: `That night, the people's choice comes on. Marcus turns every radio on his wall to the same station at once. The room fills with one song, from thirty speakers, perfectly in sync. He closes his eyes and smiles. "Two hundred votes," he says. "Two hundred people, one tune." He opens his eyes. "That's radio."`,
    notes: [`The station is real and used only for live audio. Marcus and everyone else are fictional.`,
      `The objective needs the radio panel's promo roll (Front, medium) at the Clarence Road contact on LDN-HACKNEY.`]
  },
  'rw-flex-fm-02': {
    brief: `Hold the frequency. The rivals have been stuffing Marcus's vote box with fake ballots to push their own request. The crew work out which votes are fake and win the real listeners back, completing the defend action at Clarence Road with the radio panel's roll (Savvy, hard).`,
    openTitle: `Read aloud: stuffed`,
    open: `Marcus tips a shoebox of paper votes onto his table. "Four hundred," he says. "Last week it was two hundred." He picks up a handful. "Same handwriting. Same pen. Same request." He looks up. "Somebody's stuffing the box." He sighs. "I know what everyone in this borough listens to. And it isn't this."`,
    cast: [],
    people: {marcus: CONTACTS.marcus, 'static-kings': RIVAL},
    roles: {marcus: `His vote box has been stuffed.`, 'static-kings': `Stuffed it.`},
    scenes: [
      {at: 'RADIO-flex-fm', title: `Fake ballots`, read: `Marcus's table: four hundred paper votes. Half of them in the same blue biro, in the same loopy handwriting.`,
        text: `Separate the real from the fake, then roll defend (Savvy, hard).`,
        checks: [['grt', 'medium', `Go through four hundred votes one by one`, `Two hundred and six fakes. Same biro.`, `You lose count.`],
          ['aim', 'easy', `Photograph the Kings stuffing the box outside the launderette from across the road`, `Caught.`, `Blurred.`]]},
      {at: 'RADIO-flex-fm', title: `Real listeners`, read: `The launderette on Clarence Road, where Marcus keeps his vote box. Noreen-style regulars, folding laundry, happy to chat.`,
        text: `Win back real votes, then roll.`,
        checks: [['mus', 'easy', `Help the regulars carry their laundry bags home while you ask for votes`, `Twenty real votes and a lot of goodwill.`, `You drop a bag in a puddle.`],
          ['mov', 'medium', `Chase the Kings' runner when he comes back with another stack of fakes`, `You catch him. He drops the stack.`, `He's gone.`]]}
    ],
    closeTitle: `Read aloud: real votes`,
    close: `Marcus counts the real votes again: two hundred and twelve, the same people's choice as last week. He puts the fakes in the bin. "Same biro," he says, shaking his head. "They didn't even change the pen." He puts the shoebox back in the launderette window. "I know what everyone in this borough listens to," he says. "And now I can prove it."`,
    notes: [`The station is real and used only for live audio. Everything else is fictional.`,
      `The objective needs the radio panel's defend roll (Savvy, hard) at the Clarence Road contact on LDN-HACKNEY.`]
  },
  'rw-supreme-fm-01': {
    brief: `Toyin Adeyemi, a fictional community-radio stallholder at Broadway Market, has a showcase stage to fill and a sponsor's people to keep happy. The crew organise the acts, sort the sound and complete the promo action at the Broadway Market stall with the radio panel's roll (Front, medium).`,
    openTitle: `Read aloud: a stage to fill`,
    open: `Broadway Market on a Saturday: sourdough, vintage leather, a queue for coffee. At a stall with a banner and a clipboard, Toyin Adeyemi waves you over. Her apron is covered in badges. "Stage at two, sound check at one, panic at quarter to," she says. "Six acts, one stage, and a sponsor's man who wants to see a full crowd." She hands you the clipboard. "Help?"`,
    cast: [],
    people: {toyin: CONTACTS.toyin, 'static-kings': RIVAL},
    roles: {toyin: `The fictional stallholder running the showcase.`, 'static-kings': `Rival promoters trying to pull the crowd away.`},
    scenes: [
      {at: 'RADIO-supreme-fm', title: `Six acts`, read: `Six acts, scattered across Broadway Market: a choir in the café, a DJ in the record shop, a poet at the cheese stall. Toyin needs them all at the stage at quarter to two.`,
        text: `Round them up, then roll the promo.`,
        checks: [['mov', 'medium', `Run the length of Broadway Market rounding up six acts through the crowd`, `All six at the stage at 1.44.`, `The poet's wandered off.`],
          ['mus', 'medium', `Carry the PA speakers from the van to the stage through the crowd`, `Set up by one.`, `Sound check's late.`]]},
      {at: 'RADIO-supreme-fm', title: `The showcase`, read: `Two o'clock. The stage is up. The sponsor's man stands at the side with a clipboard of his own. Across the street, the Static Kings have set up a rival speaker, blasting.`,
        text: `Keep the crowd. Roll the promo.`,
        checks: [['grf', 'medium', `Fix the PA's dodgy cable before the first act`, `Clean sound.`, `Crackle all through the first song.`],
          ['btl', 'easy', `Keep the show running calmly while the Kings blast their speaker across the street`, `The crowd stays with you.`, `Half the crowd drifts across.`]]}
    ],
    closeTitle: `Read aloud: a full stage`,
    close: `At four o'clock, the last act, the café choir, finishes with every stallholder on Broadway Market singing along. The sponsor's man writes "EXCELLENT" on his clipboard and shows Toyin. She hugs him, then hugs you, then hugs the poet. "Stage at two," she says, laughing. "Panic at quarter to." She looks at the crowd. "Worth it."`,
    notes: [`The station is real and used only for live audio. Toyin and everyone else are fictional.`,
      `The objective needs the radio panel's promo roll (Front, medium) at the Broadway Market contact on LDN-BETHNAL-GREEN.`]
  },
  'rw-supreme-fm-02': {
    brief: `Hold the frequency. The Static Kings have told the sponsor's people that Toyin's showcase was half empty, and the sponsor is wavering. The crew prove the crowd was real and win the sponsor back, completing the defend action at the Broadway Market stall with the radio panel's roll (Savvy, hard).`,
    openTitle: `Read aloud: half empty?`,
    open: `Toyin is close to tears. "The sponsor rang," she says. "Someone told them the showcase was half empty. Sent photos." She shows you: a photo of the stage at quarter to two, before anyone arrived. "That was before it started!" She wipes her eyes. "They're pulling the funding for next month unless I prove it was full."`,
    cast: [],
    people: {toyin: CONTACTS.toyin, 'static-kings': RIVAL},
    roles: {toyin: `Needs to prove the crowd was real.`, 'static-kings': `Sent the misleading photo.`},
    scenes: [
      {at: 'RADIO-supreme-fm', title: `Proof`, read: `Broadway Market, a week later. The stallholders all remember the showcase. Some of them took photos.`,
        text: `Gather proof, then roll defend (Savvy, hard).`,
        checks: [['grt', 'medium', `Go stall to stall collecting every photo and video from the day`, `Forty photos, timestamped, a packed crowd.`, `Six photos.`],
          ['aim', 'medium', `Find the exact angle the Kings' photo was taken from and shoot the same view of the full crowd from a video still`, `Side by side: empty at 1.45, packed at 2.30.`, `The angle's wrong.`]]},
      {at: 'RADIO-supreme-fm', title: `The sponsor's office`, read: `The sponsor's man in a little office above a shop. He looks at the photos on your phone, one by one.`,
        text: `Show the proof, then roll.`,
        checks: [['whl', 'medium', `Get Toyin and the photos to the sponsor before his five o'clock meeting`, `In his office at 4.50.`, `He's left.`],
          ['mus', 'easy', `Carry Toyin's banner and boxes up to his office so he sees how much work goes in`, `He's impressed.`, `You knock the banner into his plant.`]]}
    ],
    closeTitle: `Read aloud: full`,
    close: `The sponsor's man scrolls through forty photos in silence. Then he looks at the Kings' photo, timestamped 1.45. He puts the phone down. "Quarter to two," he says. "Before it started." He picks up a pen and signs Toyin's renewal. "Next month," he says. "And the month after." Toyin hugs him. Then she hugs you. Then, for good measure, the plant.`,
    notes: [`The station is real and used only for live audio. Everything else is fictional.`,
      `The objective needs the radio panel's defend roll (Savvy, hard) at the Broadway Market contact on LDN-BETHNAL-GREEN.`]
  },
  'rw-radio-caroline-01': {
    brief: `Gordon Pyke, a fictional relay contact and lifelong fan, keeps an archive of old broadcasts in a shed at a Marshgate listening post. Its history is worth something to both sides. The crew recover a missing recording that a rival collector took, help the listening post stay on air, and complete the promo action at Marshgate with the radio panel's roll (Front, medium).`,
    openTitle: `Read aloud: every tape is somebody's summer`,
    open: `A shed at Marshgate full of reel-to-reels, a ship in a bottle on a shelf, and a man in an Aran jumper making tea on a camping stove. "Gordon," he says. "Fan since 1966." He gestures at the shelves. "Every one of these tapes is somebody's summer." He points at a gap. "Except that one. Gone. A collector came round, asked to listen, and left with it." He looks at you. "Get it back, and help me get the word out about the listening night."`,
    cast: [],
    people: {gordon: CONTACTS.gordon, 'static-kings': RIVAL},
    roles: {gordon: `The fictional archive keeper and fan.`, 'static-kings': `A rival collector took the tape.`},
    scenes: [
      {at: 'RADIO-radio-caroline', title: `The missing tape`, read: `The collector's address: a flat in Bow, a doorbell that plays a jingle, and a man who swears he borrowed it.`,
        text: `Recover the tape, then roll the promo.`,
        checks: [['grf', 'medium', `Spot and lift the tape from the collector's shelf while he makes excuses`, `In your bag.`, `He sees.`],
          ['frt', 'easy', `Persuade the collector to give it back`, `"Fine. It was a loan. Obviously."`, `He slams the door.`]]},
      {at: 'RADIO-radio-caroline', title: `The listening night`, read: `Back at Gordon's shed. A listening night needs an audience: flyers, chairs, a working speaker.`,
        text: `Set it up and spread the word.`,
        checks: [['mus', 'medium', `Carry twenty folding chairs from the depot to the shed`, `Twenty chairs, in rows.`, `Ten chairs. People stand.`],
          ['whl', 'easy', `Drive round Bow and Stratford dropping flyers at every café`, `Twenty cafés.`, `Lost on the A12.`]]}
    ],
    closeTitle: `Read aloud: somebody's summer`,
    close: `On the listening night, twenty people sit on folding chairs in Gordon's shed as he threads the recovered tape onto a reel-to-reel. A crackle, then a DJ's voice from decades ago, and a song from a summer before most of them were born. An old woman in the front row starts to cry, quietly. Gordon sits down beside her. "Your summer?" he says. She nods. "1967," she says. "I was seventeen."`,
    notes: [`The station is real and used only for live audio. Gordon, the archive, the collector and the rivals are fictional.`,
      `The objective needs the radio panel's promo roll (Front, medium) at the Marshgate contact on LDN-BOW-FLYOVER.`]
  },
  'rw-radio-caroline-02': {
    brief: `Hold the frequency. A rival collector is offering Gordon's regular listeners money for copies of his archive tapes, splitting the listening group. The crew work out who's behind it and win the listeners back, completing the defend action at the Marshgate listening post with the radio panel's roll (Savvy, hard).`,
    openTitle: `Read aloud: copies`,
    open: `Gordon sits in his shed with a letter. "Someone's offering my regulars fifty quid a tape for copies," he says. "Copies of my archive." He puts the letter down. "Half of them have stopped coming on Thursdays." He looks at the shelves. "It's not about the money. It's about listening together." He sighs. "Find out who, and bring them back."`,
    cast: [],
    people: {gordon: CONTACTS.gordon, 'static-kings': RIVAL},
    roles: {gordon: `Losing his listening group.`, 'static-kings': `Buying copies to sell on.`},
    scenes: [
      {at: 'RADIO-radio-caroline', title: `The buyer`, read: `The letter has a phone number and a PO box in Stratford. Gordon's regulars have all had one.`,
        text: `Find the buyer, then roll defend (Savvy, hard).`,
        checks: [['grt', 'medium', `Visit every one of Gordon's regulars and hear their side`, `They all say the same: "Lads in bomber jackets."`, `Half won't open the door.`],
          ['mov', 'medium', `Stake out the Stratford PO box and catch the collector picking up`, `There: a Static King with a carrier bag of tapes.`, `He's been and gone.`]]},
      {at: 'RADIO-radio-caroline', title: `Bring them back`, read: `Thursday night at the shed. Gordon has put out twenty chairs, hopefully.`,
        text: `Bring the regulars back, then roll.`,
        checks: [['whl', 'medium', `Drive round picking up regulars who can't get there on their own`, `Eighteen chairs filled.`, `Eight.`],
          ['aim', 'easy', `Thread the reel-to-reel tape onto the spool first time, in the dark`, `Perfect.`, `It tangles. Gordon sighs.`]]}
    ],
    closeTitle: `Read aloud: together`,
    close: `Thursday night. The shed is full again: eighteen regulars, a pot of tea, the hiss of an old tape. Gordon plays a broadcast from 1971. Halfway through, the old woman from the front row reaches over and squeezes the hand of the man next to her, a stranger three weeks ago. Gordon watches, and smiles. "Copies," he says, very quietly. "You can't copy this."`,
    notes: [`The station is real and used only for live audio. Everything else is fictional.`,
      `The objective needs the radio panel's defend roll (Savvy, hard) at the Marshgate contact on LDN-BOW-FLYOVER.`]
  }
};
