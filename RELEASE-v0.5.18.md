# The Smoke v0.5.18 — the police escape move

Built on v0.5.17 (which has the speed-dice and scrolling fixes; if you never published 0.5.17, this release includes all of it).

## What happens at a police stop
1. The police order you to stop. You **Talk**, **Run**, **Come quietly** or **Resist**.
2. A successful Talk or Run removes one star. If you still have stars, *the officers fumble*: you choose one opening, either **on foot (6 squares)** or **an accessible vehicle (its safe green speed)**.
3. You take that one move **while police and traffic wait**. It doesn't matter whose speed die is up: this move happens outside the dice.
4. Then the police recover. If they can still see you (within 14 squares), the pursuit carries on; if not, they search where they last saw you.

## What was going wrong
- The card for step 3 said "Press Finish once you have moved", but its button was labelled **Finish escape move**. Pressing it *before* moving ended the opening at once. You got "Big Sal Moretti: still in sight", the chase's dice took over again, and dragging your token then said **Wait for your own turn**. That's the sequence in your chat log. I reproduced it on the 0.5.17 code: press first, then the drag is refused. A drag made *before* pressing the button did work.
- Nothing on the map showed how far the escape could go.
- If someone else had a police card open at the same time, the escaper couldn't move either.
- Dragging further than the allowance was refused outright instead of going as far as allowed.

## What changed
- **Drag straight away.** The card now says "Drag Big Sal now — up to 6 squares, even though it isn't your die". The escaper can always move during the opening, even when another character's police card is still open (everyone else still waits).
- **A blue ring on the map** shows how far you can get, labelled "ESCAPE · n sq left", and shrinks as you move. Everyone sees it, and it goes when the escape ends. (A character on foot whose die is up gets the same kind of ring for their six squares.)
- **Too long a drag stops at the limit** (on foot and in a vehicle), with a short note saying so.
- **It only resolves once you've moved.** Use every square and it ends by itself. Otherwise press **Done moving — finish the escape** when you're where you want to be. Pressing it before moving now just says "Move first: drag Big Sal up to 6 squares…". The GM can still end it without a move.
- The result card says how far you got ("Big Sal Moretti legs it 6 squares…"). The Combat Console's waiting line says "take the escape move (drag up to n sq, then Done)".

## Files
`module/world/pursuit.mjs`, `module/world/incidents.mjs` (vehicle escape drive), `module/map/drive-gauge.mjs` (the ring), `module/world/chase-state.mjs` (Console text), `CHASES.md`. Tests: new `tests/escape-move.test.mjs`, updated `tests/chase-decisions.test.mjs`.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.18`**, marked **Latest**.
3. Upload two separate assets: **`the-smoke-v0.5.18.zip`** and **`system.json`**.
4. Update on Forge through `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
5. Check live: get stopped in a chase, Run (or Talk) successfully, pick **Escape on foot**, and drag straight away. You should see the blue ring, move out of turn, and see the escape end when the six squares are used. Then try a vehicle escape, and pressing Done before moving.

The in-game guide pages still say "press Finish escape move"; the button reads "Done moving — finish the escape", which matches closely enough. Journals stay on content edition 0.5.3 so your edited guides aren't rewritten.
