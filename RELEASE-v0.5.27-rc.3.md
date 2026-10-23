# The Smoke v0.5.27-rc.3 — what the GM adds counts, and shopping on the Blower

Built on 0.5.27-rc.2 (the mission fixes), so everything in it is kept. This release fixes cash and kit added to a sheet not counting (ten cans of Spray Paint, and the Tag Studio still said "buy one from a shop"). It also adds ordering from the shops on the Blower, delivered to the flat.

## Cash and kit you add now count

**What was wrong.** A character made with Foundry's **Create Actor** got an *unlinked* token, because the system never told Foundry to link it. An unlinked token keeps its own copy of the character. Double-clicking that token opens the copy's sheet, so cash and kit added there went into the copy. The shops, the Tag Studio, the missions and the Blower all use the character itself, and never saw it. Pregens and characters made with the Character Creator were already linked, which is why it only happened to some characters.

**What changed.**
- **Every character's token is linked to the character.** This covers new characters and every token dragged out for one.
- **Nothing you added is lost.** When the GM logs in, anything added on a token's own copy is moved onto the character first:
  - kit added or changed there;
  - more cash or stash than the character has.

  The token is then linked, and the GM gets a chat card listing what moved. Your ten cans will be on the character.
- **Any can called spray paint works.** "Spray Paint", "spray paint", "Spray can" and "Spray Paint Can" all count, not only the shop's exact name. The message when you have none now says where to get one.

## Who controls money and kit
- **The GM always has full control,** in Story mode and Self-play alike. The GM can type cash or stash onto any sheet, drop kit onto it, or use the GM Screen. The GM Screen's Rewards can now **take** kit away as well as give it, and give and take cash as before.
- **Story mode:** nothing else changes. Players' sheets follow the existing "lock players' progress fields" setting.
- **Self-play:** players' money and kit come through play: shops, jobs, missions, sales and Blower orders. A player can't type cash or stash onto their own sheet, drop new kit onto it, or create kit by hand; the fields say why. They can still use, drop and spend what they have. To let players edit their own sheets in Self-play, switch off **Self-play: money and kit come through play** in Settings.

## Banana Basket: order to the flat
The Blower has a **Shop** app and a **Banana Basket** card.
- **Who delivers:** the corner shop, Pat's tools, the market stalls, the respray bodyshops and Bow Breakers' yard (tools and parts) and the A&E chemist.
- **Price:** the shop's price, with your discounts, plus a **£5 delivery fee** per order, paid from your pocket.
- **Delivery:** the parcel reaches **Your Flat** after **60 Banana Watch minutes**, and the Blower tells you when it's there.
- **Collecting:** collect it from the Blower when you're at the flat (or a safehouse).
- **Cancelling:** cancel an order while it's on the way for a full refund.
- **What doesn't come by courier:** weapons, ammo, drugs, anything under the counter or out the back, and anything Rep-locked. Fetch those in person.
- **The GM:**
  - can deliver any order straight away, or cancel one with a refund;
  - can hand parcels over wherever the character is;
  - sets the fee and delivery time in Settings (0 minutes means it's waiting at once), or switches phone orders off.
- **Paid once:** payment is receipted like the shops, so a dropped connection never charges you twice.

## Existing worlds
- **First GM login:** characters are linked and anything on their tokens' copies is moved over. The "Upgraded to 0.5.27-rc.3" card lists the changes.
- **Running missions:** jobs and everything from rc.2 carry on as they were.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.27-rc.3`**, marked **Latest**.
3. Upload two separate assets: `the-smoke-v0.5.27-rc.3.zip` and `system.json`.
4. Update in Forge/Foundry through the existing manifest URL. Players should reload their page.

## Checked
- **Tests:** all 76 suites pass, including the new `resources-and-orders` suite. It reproduces the bug: Spray Paint and £5,000 added on an unlinked token's sheet are missing from the character. It then checks that linking moves them across without doubling anything, and that new characters and tokens are linked. It also covers:
  - any spray can counting;
  - the Self-play rule and the GM's control;
  - GM give and take;
  - the Blower orders: paid once, refused for weapons, drugs, under-the-counter stock and Uncle, delivered after the Watch hour, collected only at the flat, cancelled with a refund, hurried by the GM, and the GM's settings.
- **Missions:** every mission still plays through, with 1–6 players and on crowded streets.
- **Windows:** the Banana Basket window and the Blower card were rendered in a browser. Nothing is out of reach at full or short height.
- **Not covered:** this is not a live Foundry session. Check one character's token in your world after updating (the GM's chat card says what moved).
