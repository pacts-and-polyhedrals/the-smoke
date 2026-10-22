> **0.5.22:** fewer police and a fairer wanted level — crimes have a ceiling (thieving/carjacking 1★, fights 2★, guns 3★, only killings 4–5★), police vehicles by star are 0/1/2/2/3/6, never more than the *Heat: most police vehicles on a map* setting (default 4), and unseen extras go home when the stars drop. See RELEASE-v0.5.22.md.

> **0.5.19:** police who arrive while a fight or chase is on (more stars, more units) go **on its combat tracker** and act on their own speed dice — this round if the dice are still being rolled, otherwise from the next — instead of driving in between turns. Every unit hunting someone in the fight or chase joins it, near or far; only units after somebody outside it keep driving in real time. In an ordinary fight a police car drives in on its go and, once close, its officers get out and join on foot. The helicopter never takes turns: once a round in a chase, holding station over a fight.

> **0.5.16:** a chase now only holds up the people and police units *in* it — other characters move freely and other units keep driving, joining the chase at the end of a round when they reach it. Outside a chase an unanswered driving card never blocks a vehicle; the GM can clear stuck checks from the vehicle sheet. Self-play players can end their own chase. See AUDIT-v0.5.16.md.

> **CURRENT CHASE CONTROLS (0.5.5):** The following instructions document v0.5.3's *historical* manual/assisted behaviour. The current system defaults to **Full Auto** police/traffic actions and automatic chase detection, with **Assisted** and **Manual** available in the Combat Console. Players must still complete their own turns and unresolved response cards; the GM can use the prompt-review tools for a saved rolled result. A configured Shared/Individual traffic option controls how many civilian dice are rolled. For the up-to-date instructions use [RECOVERY-STATUS.md](RECOVERY-STATUS.md) and [INSTALL.md](INSTALL.md).

# The Smoke v0.5.3 — Driving and chases

Install this ZIP into `Data/systems/the-smoke` with `system.json` directly inside that folder, then restart Foundry. On Forge, upload the contents into the existing `the-smoke` system folder. The first GM login switches the old chase automation defaults off once; later choices are kept.

## Completed checks stuck in an older world

Install v0.5.3 and restart with the GM connected. Completed evasions, yellow/red checks, PIT saves and ram defences are recovered from their saved chat results. Your existing roll and damage are kept; no reroll is needed. Genuine unanswered checks remain pending. New checks clear their movement and turn locks when resolved.

If an outcome could only be partly applied because of an error, the GM reviews the recorded outcome; the system does not offer another roll or replay uncertain damage.

## Start and pacing

1. Board a vehicle and take its Driver seat for normal vehicle controls and the movement gauge.
2. Open **Combat Console → Start a police chase** when wanted. Automatic chase creation is an optional world setting.
3. **Assist: off** is the default. The GM can toggle it in Story mode; a participating player can do so in Self-play. A GM account must remain connected.
4. Roll speed dice. PCs and police have separate turns. All moving civilian traffic shares one phase at the end of the round.
5. On a police/traffic phase, choose **Run one action / Move all civilian traffic**, or let Assist start it after the reading pause (default three seconds).
6. Resolve the current chat card, read the result and press **Continue — next turn**. Your own actions use **Done — next**. A new round always waits for **Begin round**.

The console lists unanswered decisions. No check expires just because someone needs time. Pause stops assistance. Turning Assist off cancels an action still in its reading delay; a completed or interrupted action waits for review.

## Driving and collision checks

Green: up to Speed, safe. Yellow: to 1½× Speed, Handling −1 and a Medium Wheels check. Red: to 2× Speed, Handling −2 and a Hard check.

Driving across another vehicle triggers an evasive Wheels roll in ordinary travel and during chases. It rolls automatically by default. For a manual button instead, switch off **Driving: roll evasive manoeuvres automatically** in system settings. Check the chat result and the motor's Incidents tab. An unboarded player-owned vehicle uses its owner's assigned character for the incident roll; boarding is still needed for the full chase gauge.

Police rams and PIT saves wait for the driver. Incoming gunfire waits for **Take hit / Dodge** where a Dodge reaction is available. Complete these before moving on. GM **Alt-drag** deliberately repositions freely.

## A police stop

Choose **Talk**, **Make a break**, **Come quietly**, or **Resist**.

- Successful talk or getaway roll: lose exactly one star. At zero, police stand down and the chase ends.
- Stars remaining: police fumble once. Choose an accessible vehicle or go on foot, then **drag straight away** — it is never your die, and that's fine: a blue ring on the map shows how far you can get (the vehicle's safe speed, or six squares on foot), and a longer drag stops at the limit. Using every square ends the escape by itself; otherwise press **Done moving — finish the escape** (it won't end the opening until you've moved; the GM can). Other police and traffic wait. The same opening cannot be reused. (0.5.18)
- Failed nonviolent bluff/getaway: the arrest handler sends the PC to custody, applies the normal fine/confiscation, and clears Heat.
- Four/five stars plus a recorded shooting or killing: failure can bring one armed attack. Resolve its hit card, then choose whether to flee, surrender or fight. Stars alone do not make a conversation failure a shooting.
- Surrender: custody, including for armed offending.

Locked vehicles and motors with a civilian driver keep their normal theft and carjacking restrictions. Close the escape decision before changing maps.

## Ending a pursuit

Break visual contact and units search rather than following an exact unseen position. Stay more than 30 squares clear of every unit for a full round to lose another star. Keep out of reach until zero; come back into view and pursuit resumes. Helicopters no longer teleport behind the car at round end.

The GM can also end the chase from its banner. A map crossing carries an active pursuit into a new scene-bound chase and waits for the new round's dice.

## Verification

The automated suite exercises real system modules using Foundry document stand-ins. It is not a licensed live Foundry/Forge run. In a test world, verify normal travel through a vehicle, one full assisted chase round, a talk success and escape choice, a failed stop/custody transfer, a police ram and an incoming-hit response using GM and player accounts.
