# The Smoke v0.5.27-rc.2 — every mission plays through again

Built on 0.5.27-rc.1 (your uploaded build), so everything in it is kept. This release fixes the mission automation that rc.1 added. It came from a crew stuck on CH3 Lights and Sirens:
- "Get some wheels — fast" sat at 1/4 with four players in one car.
- The sat nav went to The Arches and nothing happened there.
- The step that had been filled in by hand couldn't be ticked off.
- The board showed "No clear 2 x 4 space in South Hackney & Well Street / Morning Ln" and "The GM must review the progress retained from the previous build".

## What was wrong, and what changed

**Shared cars didn't count.** "Get some wheels" only counted Pat's loan bikes, one per player, so a crew who all got into one car stayed stuck. Now each player aboard any vehicle counts, so four in one car is 4/4.

**Only the motor the job placed counted, only at Pat's.**
- A nicked motor now counts wherever you nicked it, and any model the job asks for counts (M05's "a car worth having").
- A sale counts at the right buyer: Pat, anywhere in The Arches, or the chop shop.

**One parked car could stop a job.** Setting up CH3 needed a clear 2 × 4 space on Morning Lane; if anything was parked there, the job stopped. Now set-up:
- looks along nearby roads and will turn the van to fit;
- ignores moving traffic;
- if something still can't be placed, lists it for the GM and carries on.

**rc.1 froze jobs from older builds.** It held them until the GM wrote a review. Now a running job keeps its progress and carries on. Any job rc.1 froze is released when the world loads, with a note in its log.

**You couldn't tick a step by hand.** Now:
- **A player on the job, in Self-play,** can press **Mark done** on a step that's ready, meaning its earlier steps are done. Players can't skip ahead or reopen a step.
- **The GM** can mark any step done, reopen it, or pass the whole job.
- Every change is written in the job's log, and it counts as that player's part in the job.

**The sat nav didn't know where some steps were.** Now it goes to:
- the job's motor first ("Nick the …", "Back to the …"), then the buyer;
- the next wall still to paint;
- the station's radio contact;
- the cargo.

It also finishes what's at the place you're in before driving off. For example, it picks up the dog at the market you're already in, rather than driving away and coming back.

## Every mission and place checked
Each of the 894 checkpoints was compared with three things: what its objective says, where the GM file runs that scene, and who it names. These were in the wrong place and are fixed:

| Job | Was | Now |
|---|---|---|
| M09 Westfield | London Stadium foyer | Westfield Stratford City (the concourse) |
| M12 Big Night | The Third Half Bookroom's front bar | "Get to Leyton" at the Leyton Orient ground; the lock-up, Stretch and the crate in the yard behind the ground |
| M11 Raid | Save the ledger only after Pat was home | Save it during the raid |
| CH5 The Borrowed Winner | Stop the rival rider at The Kenton pub | At the VeloPark prize-giving |
| CH6 The Shop That Was Already Sold | Essex Dry Goods only | Essex Dry Goods or the Clapton Union Rooms |
| CH7 Who Runs the Arches | Daz and the chest at Pat's; debts at Pat's | Daz and the chest in the Social Rooms' boxing room; debts named at the MOTH Club sit-down; "who's backing who" with Moth, the fences or the drivers |
| CH8 Keys to the Arches | The base chosen only at the Storehouse | At the Storehouse or the Clifden garage; the deed in the pavilion's account office |
| AD1 Borrowed Speakers | Patch at Cafe OTO | Patch in Backspin Studio's live room, where the step sends you |
| AD3 Two Stages One Van | The back-up lined up at The Lauriston | At North Echo; the programmes at Union Chapel or Hoxton Hall |
| AD8 The Whole City Listening | The broadcast only at the London Stadium | At either site the crew picked |
| LB2 Stretch Wants His Cut | The crate at Bow Breakers | In the Orient Night Shed's cold cage; the call made at the sit-down |
| TU2 The Van and the Debt | The second crew at Bow Breakers | At Barge East's mooring |
| TU8 The City Still Has to Move | The broadcast van at A&E | At Bridge Nine |
| BB4 A Result Before the Race | The cashier at a church | In the Third Half Bookroom's betting room |
| MR7 The Quiet Hour | The Marshgate depot only | The depot or the East Cross compound |
| S04 The Dog at the Fundraiser | The trader at the pavilion; the cash tin at the market | The trader at New Spitalfields; Ellis and the tin in the pavilion club room |
| All 42 graffiti commissions | Each wall's checkpoint on the first block of the map | Where its paint spot is; the Bow Flyover column is under the flyover |

The GM file for every job ends with a **Live mission contract** table. It is now built from the same data, so its places are always current. Existing worlds get the updated pages automatically.

## Existing worlds
- **Running jobs:** they keep their progress. CH3 continues from where you are; get everyone into a car and it ticks.
- **First GM login:** the guides refresh, and the "Upgraded to 0.5.27-rc.2" card lists the changes.
- **Edited pages:** if you've edited a page, your version is copied into a GM-only backup journal before it's replaced.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.27-rc.2`**, marked **Latest**.
3. Upload two separate assets: `the-smoke-v0.5.27-rc.2.zip` and `system.json`.
4. Update in Forge/Foundry through the existing manifest URL. Players should reload their page.

## Checked
- **Every job, played through.** A new simulator (`tests/mission-playthrough.mjs`) plays every job the way a crew would: it asks the sat nav, goes there, and does what the objective says. For example, everyone gets into one car, nicks the van, drives it back, sells it, paints the wall or carries the crate. The step must tick from that alone. All 179 jobs pass:
  - at 1, 2, 3, 4, 5 and 6 players (1,074 runs);
  - with every street the job uses crowded with parked cars (358 runs).
- **Compared with rc.1.** The same simulator fails on the rc.1 code at CH3 with four players, CH3's van, M05's car and crowded set-up, which matches the report.
- **Tests:** all 75 suites pass, including the new `mission-playthrough` suite. It replays 716 runs on every build and checks:
  - a job frozen by rc.1;
  - four players in one car;
  - Mark done and Reopen;
  - "finish what's here first".
- **Not covered:** this is not a live Foundry or Forge session. The play-throughs drive the real mission code and data in Node, so give CH3 a quick run in your world after updating.
