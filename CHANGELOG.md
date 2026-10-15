# Changelog

## 0.1.2 · consolidated gameplay and upgrades · 15 October 2026

- Preserve the uploaded pregens (including Sal’s 14 Health), all 25 map images, street topology and four-row Scene organisation.
- Reconcile both catalogues: 72 authored actors, 90 equipment/perk/condition items, eight journals / 45 pages in eight compendiums.
- Add idempotent existing-world migration. Preserve edited characters, items, notes and ownership; restore old shared driver grants and isolate driven vehicle permissions.
- Fix GM-mediated roll requests and replies. Shared Hustle/ammunition cannot be spent twice. Driving uses the player’s scene even when the GM is viewing another map.
- Fix temporary roll bonuses, exact damage, empty magazines, one-use damage/conditions, Dodge/reaction handling and armour stacking.
- Add first aid, safehouse rest, advancement and configurable local services: resprays, new plates, clothes and garage repairs.
- Automate Bruise stacking, end-turn Bleeding, Stunned expiry, native Health/Down synchronisation and Wasted after three Down rounds or a Proper Mess staying conscious.
- Fix cross-map job references before transit returns, full ambulance/cage validation, call ownership, double acceptance, all paused timestamps and job-target cleanup protection.
- Retain the Blower, Street Control, seven job types, traffic, police response, ANPR, fencing and Wasted/Busted.
- Protect GM and mission guides; add current player and GM instructions.
- Source includes regression tests, package/compendium audits and Chromium layout QA. Live Foundry/Forge validation remains outstanding; remove the unsupported verified claim.

## 0.1.1 · map import and Scene folders

All maps import on setup and older worlds receive missing maps. Streets are filed north–south and west–east. Street Control can import every map idempotently.
