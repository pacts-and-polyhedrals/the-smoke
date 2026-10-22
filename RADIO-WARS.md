# THE SMOKE v0.5.15 — The Radio Wars

The radio war is **fictional campaign content**, not a statement about any real radio station's ownership, licensing status, UK premises, or participation in crime. London site tokens are fictional listening points, relays and promo contacts. Broadcasters' true headquarters may be outside London; these are **NOT** their addresses.

## Listening presets

The default phone/car radio dial contains six preset streams: Point Blank FM, Rude FM, Vision Radio UK, Flex FM, Supreme FM and Radio Caroline UK. Each entry has an HTTPS audio URL. As with all live internet broadcasts, these URLs are provided by external broadcasters and may change; availability is never guaranteed without an actual live test.

**CodeSouth and Esencia Urbana are retired from the beta tuner and the radio-war location catalogue.** They no longer reappear from saved custom presets. No map contacts are added for them; any old *system-created* locations are removed at the GM's next radio-war synchronisation. The six functioning stations remain available.

All in-game radio-war locations and rivalries are fictional. They do not imply any real broadcaster endorses or participates in The Smoke's story. See [BETA-LEGAL-CHECKLIST.md](BETA-LEGAL-CHECKLIST.md).

## London radio-war locations

On the first GM load (and when a new street Scene is added), the game places a small, movable **Radio War Contact** token at the street-side entrance of the mapped zone. These markers do not grant ownership of their actors. Right-click an accessible contact to choose **Work this radio contact**, **Radio-war standing**, or **Open the live radio dial**. Under the hood, only the connected GM creates tokens and validates outcomes.

| Station | London map | Fictional contact | Campaign-only side |
|---|---|---|---|
| Point Blank FM | LDN-HOXTON-WEST | Eagle Wharf promo lockup | Underground |
| Rude FM | LDN-HAGGERSTON | Dalston aerial contact | Underground |
| Vision Radio UK | LDN-DALSTON | Shacklewell promoter | Licensed |
| Flex FM | LDN-HACKNEY | Clarence Road listening point | Underground |
| Supreme FM | LDN-BETHNAL-GREEN | Broadway Market showcase | Licensed |
| Radio Caroline UK | LDN-BOW-FLYOVER | Marshgate listening post | Licensed |

Zones and street coordinates come from the actual London atlas. The token is placed beside the street or path to avoid inaccessible block centres. Previously placed tokens keep their GM-adjusted positions; reloading the system does not create duplicates.

## Play and rewards

The **Radio Wars** tab in the Mission Board includes **12 new commissions**—two per active default station. The original 125 story and 42 tagging missions remain in place.

At a contact: choose **Put the word about** (Front, Medium, 20 Banana Watch minutes), **Fix the relay** (Graft, Medium, 30 min), or **Defend the airwaves** (Savvy, Hard, 25 min). A real stat roll is matched server-side to character, actor ownership, user, exact map, token, action and attempt. Progress is based on the roll outcome: Proper Mess −2, Bad Luck −1, Just About +1, Sorted +2, Smashed It +3, Legendary +5 signal influence. Higher successes award +1 Street Rep. Each character can complete one attempt per station per in-game Watch day; recorded attempts and mission proofs cannot be replayed for extra rewards. Reconnecting with the identical valid attempt can repair missing mission progress without paying twice or advancing the Watch again. Commission completion requires the correct, verified action at the correct station.

## Forge guidance

1. Make a backup or clone of your world before installing v0.5.15.
2. Publish the ZIP and standalone `system.json` to a GitHub release tagged `v0.5.15`, then update through the usual Forge manifest.
3. Restart the world. As GM, inspect the six existing station maps; the six fictional contact markers should appear without duplicates.
4. As a player, walk within two squares of a contact and right-click. Use the station action and choose a commission from the Mission Board.
5. Confirm your existing six radio presets still play. Neither broken station should return to the default list. Both retired station IDs are removed even if their stream was customised. Use a newly named verified custom preset for a different broadcaster.

**Live verification still required:** how Forge renders radio markers and browser playback, multiplayer request latency, audio availability, and session-specific permissions. Automated tests do not substitute for a live player session.
