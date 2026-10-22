// Shops and the map spots that do something: the corner shop (any street), Pat's Arches, the markets, Uncle's Cafe
// (drugs, and shooters from Rep 3), the respray shops, Bow Breakers, Homerton A&E and your flat (kip, stash, wardrobe).
// Purchases, sales and services run on the leader GM; prices come from the item library, less any discounts earned.
import {NS} from '../config.mjs';
import {clampHeat} from '../rules/core.mjs';
import {hasUnlock} from '../rules/advancement.mjs';
import {registerHandler, request, card, ownersOf} from './net.mjs';
import {zonesOf, tokenRect, distanceSquares, isStreetScene, actorToken} from './spawn.mjs';
import {arrivedAt} from '../rules/jobs-core.mjs';
import {distToRect} from './theft.mjs';
import {offerFor, performService, servicePrice} from './services.mjs';
import {restNow, restProblem} from '../gameplay.mjs';

export const SHOP_REACH = 4;   // squares from a shop's block that count as "outside"
const L = names => names.split('|').map(s => s.trim()).filter(Boolean);
/** What each kind of place sells and does. `stock` names library items; `minRep` gates a line of stock. */
export const SHOPS = Object.freeze({
  corner: {name: 'Corner Shop', who: 'Mr Demir', quote: '"Card machine\'s broken, cash only."', anywhere: true,
    stock: [{items: L('Meal Deal|Energy Drink|Bottle of Water|Cigarettes|Cans of Lager|Painkillers|Bandages|Burner Phone|Cheap Smartphone|Oyster Card|Duct Tape|Cable Ties|Torch|Pocket Torch')}]},
  gang: {name: 'The Arches · Pat\'s Cycles', who: 'Auntie Pat', quote: '"Mates\' rates, darling. Well. Nearly."', discountKey: 'patDiscount',
    stock: [{items: L('Bolt Cutters|Angle Grinder|Cordless Angle Grinder|Hacksaw|Lock Picks|Slim Jim|Screwdriver Set|Screwdriver|Spray Paint|Bike Lock|D-Lock|Cycle Helmet|Courier Backpack|Burner Phone|Toolkit|Vehicle Repair Kit')},
            {label: 'Under the counter', items: L('Bike Chain|Baseball Bat|Crowbar|Balaclava|Motorbike Leathers|Handcuffs')}], services: ['repair']},
  clothes: {name: 'Market Stalls', who: 'the stallholders', quote: '"Two for twenty, go on."', changing: true,
    stock: [{items: L('Tracksuit|Black Hoodie & Mask|Hi-Vis & Hard Hat|Delivery Rider Jacket|Football Shirt|Smart Suit|Puffer Jacket|Leather Jacket|Heavy Work Jacket|Hi-Vis Vest|Spare Clothes|Balaclava')},
            {label: 'Food stalls', items: L('Chicken & Chips|Kebab|Pie & Mash|Energy Drink|Bottle of Water|Cans of Lager')},
            {label: 'Phone stall', items: L('Burner Phone|Cheap Smartphone|Police Scanner|Binoculars')}], services: ['clothes']},
  dealer: {name: 'Uncle\'s Cafe', who: 'Uncle', quote: '"Full English? Or the other menu?"', buysDrugs: 0.8,
    stock: [{items: L('Full English|Pie & Mash')},
            {label: 'The other menu', items: L('Skunk|Charlie|Pills|Benzos|Nitrous|Roids')},
            {label: 'Out the back (Rep 3)', minRep: 3, items: L('Knuckle Duster|Lock Knife|Zombie Knife|Machete|Pocket .22|Converted Pistol|Compact Pistol|Fictional Show Plates|Service Revolver|Sawn-off Shotgun|Farmer\'s Double|Air Rifle|Stab Vest|Fake ID|Key Programmer|Relay Box|Spare Plates|.22 Rounds|9mm Rounds|.38 Rounds|12-Gauge Shells|Air Rifle Pellets|Petrol Bomb|Firework Rocket')},
            {label: 'The good stuff (Rep 6)', minRep: 6, items: L('Polymer Nine|Machine Pistol|Micro SMG|Pump Shotgun|Hunting Rifle|Bulletproof Vest|Smoke Grenade|.308 Rounds')},
            {label: 'Don\'t ask (Rep 9)', minRep: 9, items: L('Hand Cannon|Kalash|Frag Grenade|.50 Rounds|7.62 Rounds')}]},
  respray: {name: 'Respray', who: 'the bodyshop', quote: '"Colour? Plates? Don\'t tell me where it\'s from."',
    stock: [{items: L('Toolkit|Vehicle Repair Kit|Jerry Can|Spare Plates')}], services: ['respray', 'repair']},
  chop: {name: 'Bow Breakers Yard', who: 'Big Den', quote: '"Bring it round the back."',
    stock: [{items: L('Toolkit|Vehicle Repair Kit|Jerry Can|Spare Plates|Slim Jim|Screwdriver Set')}, {label: 'Rep 3', minRep: 3, items: L('Relay Box|Key Programmer')}], services: ['repair']},
  hospital: {name: 'Homerton A&E', who: 'the triage nurse', quote: '"Take a seat. It\'s about a four-hour wait."',
    stock: [{label: 'The chemist', items: L('Painkillers|Bandages|First Aid Kit|Bottle of Water')}], services: ['treat']},
  safehouse: {name: 'Your Flat', who: 'Mo downstairs', quote: '"Rent\'s Friday. Keep the noise down."', changing: true, services: ['rest', 'stash']}
});
export const SERVICES = Object.freeze({
  respray: {label: 'Respray & new plates', icon: 'fa-solid fa-spray-can', text: 'New colour, new plates: Heat cleared and the ANPR marker gone. Only if no police unit (or India 99) can see you go in.'},
  repair: {label: 'Garage repair', icon: 'fa-solid fa-wrench', text: 'Body back to full and any flat tyres changed. Priced per missing Body point; a tyre counts as six.'},
  clothes: {label: 'Change clothes', icon: 'fa-solid fa-shirt', text: 'A quick change at the stalls loses one Heat star, out of police sight.'},
  treat: {label: 'Get seen in A&E', icon: 'fa-solid fa-hospital', text: 'Free. Back to full Health; Bleeding, Hurt, In Pain and the rest sorted. A Broken limb is set in a cast: it still needs a week. Not with 2+ stars: the police always check A&E.'},
  rest: {label: 'Kip for the night', icon: 'fa-solid fa-bed', text: 'Full Health and Hustle, short-term Conditions gone, and two stars or less of Heat dies down. Not while Bleeding, with three or more stars, or with police in sight.'},
  stash: {label: 'The stash', icon: 'fa-solid fa-box-archive', text: 'Cash under the floorboards. Nobody takes it when you are Busted or Wasted.'}
});
/** Prices: the configurable Local services prices (Settings → The Smoke). */
export const resprayPrice = vehicle => servicePrice('respray', vehicle);
export const repairPrice = vehicle => servicePrice('repair', vehicle);

/** Discount for this character at this shop (0-0.2). */
export function discountFor(system, shopKey, perks = []) {
  let d = 0;
  if (hasUnlock(system, 'streetDiscount')) d += .1;
  if (SHOPS[shopKey]?.discountKey && hasUnlock(system, SHOPS[shopKey].discountKey)) d += .1;
  if (perks.includes('Wide Boy')) d += .1;
  return Math.min(.2, d);
}
export const priceFor = (item, discount = 0) => Math.max(0, Math.round(Number(item?.system?.value || 0) * (1 - discount)));
/** How much of an item one purchase gives (a box of ammo, a pack of cigarettes, a pair of petrol bombs). */
export const unitOf = item => item.type === 'ammo' ? Number(item.system.perBox || item.system.quantity || 1) : Number(item.system.quantity || 1);

/** The stock this character can see at this shop, as {label, locked, items:[library item + price]}. */
export function stockFor(shopKey, library, system, perks = []) {
  const shop = SHOPS[shopKey]; if (!shop) return [];
  const rep = Number(system?.stage || 1), d = discountFor(system, shopKey, perks);
  return (shop.stock || []).map(line => ({label: line.label || 'For sale', locked: Number(line.minRep || 0) > rep, minRep: line.minRep || 0,
    items: line.items.map(n => library.find(i => i.name === n)).filter(i => i && !i.system.restricted).map(i => ({...i, price: priceFor(i, d), unit: unitOf(i)}))}));
}

/** Which shops are open to this token where it stands. Street maps always have a corner shop. */
export function shopsAt(token) {
  const scene = token?.parent; if (!scene) return [];
  const out = new Set(); const zones = zonesOf(scene), place = scene.getFlag?.(NS, 'place');
  if (place) {
    if (place.id === 'LDP-FLAT') out.add('safehouse');
    if (place.id === 'LDP-ARCHES') out.add('gang');
    if (place.id === 'LDP-HOSPITAL') out.add('hospital');
    return [...out];
  }
  if (isStreetScene(scene)) out.add('corner');
  const rect = tokenRect(token), g = scene.grid?.size || 100, cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
  for (const z of zones.filter(z => z.service && SHOPS[z.service])) {
    if (arrivedAt(zones, z.id, rect) || distToRect(z.rect, cx, cy) <= SHOP_REACH * g) out.add(z.service);
  }
  return [...out];
}
const tokenOf = actor => actorToken(actor);   // the token in play, not a stale one on the map the GM happens to be viewing
/** The vehicle this character is driving, if any. */
const drivingOf = token => { const seat = token?.getFlag?.(NS, 'vehicleSeat'); return seat?.seatId === 'pilot' ? token.parent.tokens.get(seat.vehicleTokenId) : null; };
export function shopsFor(actor) { const t = tokenOf(actor); return t ? shopsAt(t) : []; }

/* ------------------------------------------------------------------ leader handlers */
async function library() { return (await (await fetch(`systems/${NS}/data/london-items.json`)).json()).items || []; }
const allowed = (userId, actor) => { const u = game.users.get(userId); return u?.isGM || actor?.testUserPermission?.(u, 'OWNER'); };
const whisperTo = actor => [...ownersOf(actor), ...game.users.filter(u => u.isGM).map(u => u.id)];
/** Can this user shop at `shopKey` for this actor? The GM can open any shop; a player must be standing at it. */
function checkAt(userId, actor, shopKey) {
  if (game.users.get(userId)?.isGM) return true;
  if (!shopsFor(actor).includes(shopKey)) throw new Error(`${SHOPS[shopKey]?.name ?? 'That shop'} is not here. Go there first.`);
  return true;
}
/** Add `qty` purchases of a library item to an actor, stacking quantities where it makes sense. */
export async function giveItem(actor, lib, qty = 1) {
  const stackable = ['ammo', 'drug', 'consumable'].includes(lib.type) || lib.system.thrown;
  const have = stackable ? actor.items.find(i => i.name === lib.name && i.type === lib.type) : null;
  const units = unitOf(lib) * qty;
  if (have) return have.update({'system.quantity': Number(have.system.quantity || 0) + units});
  const data = foundry.utils.deepClone(lib); delete data.price; delete data.unit;
  if (stackable) data.system.quantity = units;
  if (data.type === 'outfit') data.system.worn = false;
  const docs = []; for (let i = 0; i < (stackable ? 1 : qty); i++) docs.push(data);
  return actor.createEmbeddedDocuments('Item', docs);
}
registerHandler('shop.buy', async ({actorId, shopKey, itemName, qty = 1, userId}) => {
  const actor = game.actors.get(actorId); if (!actor || !allowed(userId, actor)) throw new Error('Not allowed.');
  checkAt(userId, actor, shopKey);
  const perks = actor.items.filter(i => i.type === 'perk').map(i => i.name);
  const line = stockFor(shopKey, await library(), actor.system, perks).find(l => l.items.some(i => i.name === itemName));
  if (!line) throw new Error(`${SHOPS[shopKey].name} does not sell ${itemName}.`);
  if (line.locked) throw new Error(`${SHOPS[shopKey].who} won't sell you that until you are Rep ${line.minRep}.`);
  const lib = line.items.find(i => i.name === itemName), n = Math.max(1, Math.min(20, Number(qty) || 1)), cost = lib.price * n;
  if (Number(actor.system.cash || 0) < cost) throw new Error(`${actor.name} has £${actor.system.cash}; that is £${cost}.`);
  await giveItem(actor, lib, n);
  await actor.changeCash(-cost, `${SHOPS[shopKey].name}: ${n > 1 ? `${n} × ` : ''}${itemName}.`);
  Hooks.callAll('smokeBought', {actor, shop: shopKey, itemName, qty: n});
  return cost;
});
registerHandler('shop.sell', async ({actorId, shopKey, itemId, qty = 1, userId}) => {
  const actor = game.actors.get(actorId), item = actor?.items.get(itemId); if (!actor || !item || !allowed(userId, actor)) throw new Error('Not allowed.');
  checkAt(userId, actor, shopKey);
  const rate = shopKey === 'dealer' && item.type === 'drug' ? SHOPS.dealer.buysDrugs : 0;
  if (!rate) throw new Error(`${SHOPS[shopKey].who} doesn't buy that.`);
  const n = Math.max(1, Math.min(Number(item.system.quantity || 1), Number(qty) || 1)), pay = Math.round(Number(item.system.value || 0) * rate * n);
  const left = Number(item.system.quantity || 1) - n; if (left > 0) await item.update({'system.quantity': left}); else await item.delete();
  await actor.changeCash(pay, `${SHOPS[shopKey].who} takes ${n} ${item.system.unit || ''} of ${item.name} off your hands.`);
  return pay;
});
registerHandler('shop.service', async ({actorId, shopKey, service, amount = 0, userId}) => {
  const actor = game.actors.get(actorId); if (!actor || !allowed(userId, actor)) throw new Error('Not allowed.');
  checkAt(userId, actor, shopKey);
  if (!(SHOPS[shopKey]?.services || []).includes(service)) throw new Error('Not here.');
  const t = tokenOf(actor), heat = clampHeat(actor.system.heat?.value);
  const policeNear = t ? t.parent.tokens.some(u => u.getFlag(NS, 'police') && distanceSquares(u, t) <= 14) : false;
  switch (service) {
    case 'respray': case 'repair': case 'clothes': {
      // Same rules as Local services: the right block, out of police sight, the driver bringing the vehicle in.
      const c = offerFor(actor, service, {sceneId: t?.parent?.id, tokenId: t?.id});
      return performService(actor, service, c);
    }
    case 'treat': {
      if (heat >= 2) throw new Error('Not with the police after you — they always check A&E.');
      const fix = ['Bleeding', 'Hurt', 'In Pain', 'Bruised', 'Down', 'Burning', 'Gassed'];
      for (const c of actor.items.filter(i => i.type === 'condition' && fix.includes(i.name))) await c.delete();
      await actor.update({'system.resources.health.value': actor.system.resources.health.max, 'system.states.down': false, 'system.states.downRounds': 0});
      const broken = actor.items.some(i => i.type === 'condition' && i.name === 'Broken');
      return card('HOMERTON A&E', `${actor.name} gets seen`, `<p>Four hours, two vending-machine coffees and a junior doctor later: patched up. The NHS: free at the point of use.</p>${broken ? '<p><b>Broken:</b> set in a cast. It needs a week of recovery; the GM removes it then.</p>' : ''}`, 'win', {whisper: whisperTo(actor)});
    }
    case 'rest': {
      const why = restProblem(actor, t, {isGM: game.users.get(userId)?.isGM}); if (why) throw new Error(why);
      return restNow(actor);
    }
    case 'stash': {
      const amt = Math.round(Number(amount) || 0); if (!amt) return null;
      const cash = Number(actor.system.cash || 0), stash = Number(actor.system.stash || 0);
      if (amt > 0 && amt > cash) throw new Error(`Only £${cash} in your pocket.`);
      if (amt < 0 && -amt > stash) throw new Error(`Only £${stash} in the stash.`);
      await actor.update({'system.cash': cash - amt, 'system.stash': stash + amt});
      return card('THE STASH', actor.name, `<p>${amt > 0 ? `£${amt} under the floorboards` : `£${-amt} out of the stash`}. Stash: £${stash + amt}.</p>`, '', {whisper: whisperTo(actor)});
    }
  }
  return null;
});

export const shopAPI = {SHOPS, SERVICES, shopsFor, shopsAt, stockFor, discountFor, buy: (actor, shopKey, itemName, qty = 1) => request('shop.buy', {actorId: actor.id, shopKey, itemName, qty}),
  sell: (actor, shopKey, item, qty = 1) => request('shop.sell', {actorId: actor.id, shopKey, itemId: item.id, qty}),
  service: (actor, shopKey, service, amount = 0) => request('shop.service', {actorId: actor.id, shopKey, service, amount})};
