// THE SMOKE — order from the shops on the Blower, delivered to Your Flat (0.5.27).
// The high-street side of the shops will deliver: the corner shop, Pat's tools, the market stalls, the bodyshops and
// the chemist. Pay from your pocket (the shop's price, your discounts, plus a delivery fee), and the parcel turns up at
// the flat after the delivery time on the Banana Watch. Collect it there, or at a safehouse, from the Blower. Nothing
// under the counter, out the back or Rep-locked comes by courier, and no weapons, ammo or drugs: those you still fetch
// in person. Payment is a receipted operation, so a dropped connection never charges twice. The GM can deliver an
// order at once, or cancel it with a refund.
import {NS} from '../config.mjs';
import {SHOPS, shopDefinition, stockFor} from './shops.mjs';
import {venueItemContract} from '../rules/venue-contract.mjs';
import {registerHandler, request, card, esc, ownersOf, isLeader} from './net.mjs';
import {withActionLocks, boundedInt, worldSeconds} from './action-locks.mjs';
import {newOperationId, opId, receiptFor, sameOperation, beginOperation, completeOperation, issueOnce} from './transactions.mjs';
import {actorToken} from './spawn.mjs';
import {safeHere} from '../gameplay.mjs';

const KEY = 'deliveries';
export const DELIVERY_SHOPS = Object.freeze(['corner', 'gang', 'clothes', 'respray', 'chop', 'hospital']);
const OFF_THE_BOOKS = /under the counter|out the back|other menu|don't ask|good stuff/i;
const NOT_BY_POST = new Set(['weapon', 'ammo', 'drug']);
const copy = x => foundry.utils.deepClone(x);
const setting = (k, d) => { try { return game.settings.get(NS, k) ?? d; } catch (_e) { return d; } };
export const deliveryFee = () => Math.max(0, Math.round(Number(setting('deliveryFee', 5)) || 0));
export const deliveryMinutes = () => Math.max(0, Math.round(Number(setting('deliveryMinutes', 60)) || 0));
export const phoneOrdersOn = () => setting('phoneOrders', true) !== false;

export function registerDeliverySettings() {
  game.settings.register(NS, KEY, {scope: 'world', config: false, type: Object, default: {orders: {}}});
  game.settings.register(NS, 'phoneOrders', {name: 'The Blower: order from the shops to the flat', hint: 'Players can order high-street stock (the corner shop, Pat\'s tools, the market, bodyshops, the chemist) on the Blower and collect it at Your Flat. No weapons, ammo, drugs or under-the-counter stock.', scope: 'world', config: true, type: Boolean, default: true});
  game.settings.register(NS, 'deliveryFee', {name: 'The Blower: delivery fee (£ per order)', scope: 'world', config: true, type: Number, default: 5});
  game.settings.register(NS, 'deliveryMinutes', {name: 'The Blower: delivery time (Banana Watch minutes)', hint: '0 = it is waiting at the flat straight away. The GM can also deliver any order at once.', scope: 'world', config: true, type: Number, default: 60});
}
export const deliveryState = () => { const s = setting(KEY, {orders: {}}); return {orders: {...(s?.orders || {})}}; };
let chain = Promise.resolve();
function withDeliveries(fn) {
  const next = chain.catch(() => {}).then(async () => { const st = copy(deliveryState()); const out = await fn(st); await game.settings.set(NS, KEY, st); Hooks.callAll('smokeDeliveriesChanged'); return out; });
  chain = next; return next;
}

/** What each delivering shop will send to this character: its everyday lines, at this character's prices. */
export function onlineCatalogue(lib, system, perks = []) {
  return DELIVERY_SHOPS.filter(k => SHOPS[k]).map(key => ({key, name: SHOPS[key].name, who: SHOPS[key].who,
    lines: stockFor(key, lib, system, perks).filter(l => !l.locked && !Number(l.minRep || 0) && !OFF_THE_BOOKS.test(l.label || ''))
      .map(l => ({label: l.label || 'For sale', items: l.items.filter(i => !NOT_BY_POST.has(i.type) && !i.system?.restricted && !venueItemContract(i.name))}))
      .filter(l => l.items.length)})).filter(s => s.lines.length);
}
const library = async () => (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json())).items || [];
function identity(actorId, userId) {
  const a = game.actors.get(actorId), u = game.users.get(userId);
  if (!a || a.type !== 'character' || !u || (!u.isGM && !a.testUserPermission?.(u, 'OWNER'))) throw new Error('Order for your own character.');
  return {actor: a, user: u};
}
/** The parcel's contents, as the shops issue them (a stack for consumables and ammo, one per item otherwise). */
function parcel(lib, qty, actor, id, shopKey) {
  const stack = ['ammo', 'drug', 'consumable'].includes(lib.type) || lib.system?.thrown, units = Number(lib.type === 'ammo' ? lib.system.perBox || lib.system.quantity || 1 : lib.system.quantity || 1);
  return Array.from({length: stack ? 1 : qty}, () => {
    const d = copy(lib); delete d.price; delete d.unit; delete d.remaining; delete d._id; d.system.quantity = stack ? units * qty : units;
    if (d.type === 'outfit') d.system.worn = false;
    d.flags ??= {}; d.flags[NS] ??= {}; d.flags[NS].provenance = {delivery: true, shopKey, actorId: actor.id, operationId: id, boughtAt: worldSeconds()};
    return d;
  });
}
const whisper = actor => [...ownersOf(actor), ...game.users.filter(u => u.isGM).map(u => u.id)];
const at = seconds => { const m = Math.max(0, Math.ceil((seconds - worldSeconds()) / 60)); return m ? `in about ${m} Watch minute${m === 1 ? '' : 's'}` : 'now'; };

/* ------------------------------------------------------------------ leader */
export async function placeOrder({actorId, shopKey, itemName, qty = 1, operationId, userId}) {
  if (!phoneOrdersOn()) throw new Error('The GM has switched off phone orders.');
  const {actor} = identity(actorId, userId), id = opId(operationId || newOperationId()), n = boundedInt(qty, 1, 20, 'Quantity');
  const signature = JSON.stringify([shopKey, itemName, n]);
  return withActionLocks([`actor:${actor.id}`], async () => {
    let rec = sameOperation(receiptFor(actor, id), 'delivery', signature);
    if (rec?.status === 'done') return rec.result;
    if (!rec) {
      if (!DELIVERY_SHOPS.includes(shopKey)) throw new Error(`${shopDefinition(shopKey)?.name ?? 'That shop'} doesn't deliver.`);
      const shop = onlineCatalogue(await library(), actor.system, actor.items.filter(i => i.type === 'perk').map(i => i.name)).find(s => s.key === shopKey);
      const item = shop?.lines.flatMap(l => l.items).find(i => i.name === itemName);
      if (!item) throw new Error(`${SHOPS[shopKey]?.name ?? 'That shop'} won't deliver ${itemName}. Fetch it in person.`);
      const fee = deliveryFee(), cost = item.price * n + fee;
      const plan = {shopKey, shopName: SHOPS[shopKey].name, itemName, qty: n, cost, fee, documents: parcel(item, n, actor, id, shopKey), arrivesAt: worldSeconds() + deliveryMinutes() * 60};
      rec = await beginOperation(actor, id, 'delivery', signature, {cost, plan});   // takes the money with the receipt
    }
    const p = rec.plan;
    await withDeliveries(st => { st.orders[id] ??= {id, actorId: actor.id, shopKey: p.shopKey, shopName: p.shopName, itemName: p.itemName, qty: p.qty, cost: p.cost, fee: p.fee,
      orderedAt: worldSeconds(), arrivesAt: p.arrivesAt, status: p.arrivesAt <= worldSeconds() ? 'waiting' : 'on-the-way', documents: p.documents}; });
    await completeOperation(actor, id, {orderId: id});
    await card('THE BLOWER · ORDER', actor.name, `<p>${esc(p.qty)} × ${esc(p.itemName)} from ${esc(p.shopName)}: £${p.cost} (including £${p.fee} delivery). ${p.arrivesAt <= worldSeconds() ? 'It\'s waiting at the flat.' : `It'll be at the flat ${at(p.arrivesAt)}.`}</p>`, 'cash', {whisper: whisper(actor)});
    await arrivals();
    return {orderId: id};
  });
}
/** Orders whose delivery time has come are waiting at the flat; tell whoever ordered them. */
export async function arrivals() {
  if (!isLeader()) return [];
  const due = Object.values(deliveryState().orders).filter(o => o.status === 'on-the-way' && Number(o.arrivesAt) <= worldSeconds());
  if (!due.length) return [];
  await withDeliveries(st => { for (const o of due) if (st.orders[o.id]?.status === 'on-the-way') st.orders[o.id].status = 'waiting'; });
  for (const o of due) { const a = game.actors.get(o.actorId); if (a) await card('THE BLOWER · DELIVERED', a.name, `<p>${esc(o.qty)} × ${esc(o.itemName)} from ${esc(o.shopName)} is at the flat. Mo signed for it. Collect it there on the Blower.</p>`, 'win', {whisper: whisper(a)}); }
  return due.map(o => o.id);
}
export async function collectOrders({actorId, userId}) {
  const {actor, user} = identity(actorId, userId);
  return withActionLocks([`actor:${actor.id}`], async () => {
    await arrivals();
    const mine = Object.values(deliveryState().orders).filter(o => o.actorId === actor.id && o.status === 'waiting');
    if (!mine.length) throw new Error('Nothing waiting at the flat.');
    if (!user.isGM && !safeHere(actorToken(actor, {userId}))) throw new Error('Your parcels are at Your Flat. Go there (or to a safehouse) to collect them.');
    const got = [];
    for (const o of mine) { await issueOnce(actor, o.id, o.documents); await withDeliveries(st => { if (st.orders[o.id]) { st.orders[o.id].status = 'collected'; st.orders[o.id].collectedAt = worldSeconds(); delete st.orders[o.id].documents; } }); got.push(`${o.qty} × ${o.itemName}`); }
    await card('THE BLOWER · COLLECTED', actor.name, `<p>${esc(got.join(', '))}.</p>`, '', {whisper: whisper(actor)});
    return got;
  });
}
/** Cancel an order on the way (its buyer) or any uncollected order (the GM), with a full refund. */
export async function cancelOrder({orderId, userId}) {
  const o = deliveryState().orders[orderId]; if (!o) throw new Error('No such order.');
  const {actor, user} = identity(o.actorId, userId);
  if (o.status === 'collected' || o.status === 'cancelled') throw new Error('That order is finished.');
  if (!user.isGM && o.status !== 'on-the-way') throw new Error('It has already arrived: collect it at the flat.');
  return withActionLocks([`actor:${actor.id}`], async () => {
    await withDeliveries(st => { if (st.orders[orderId]) { st.orders[orderId].status = 'cancelled'; delete st.orders[orderId].documents; } });
    await actor.update({'system.cash': Number(actor.system.cash || 0) + Number(o.cost || 0)});
    await card('THE BLOWER · CANCELLED', actor.name, `<p>${esc(o.qty)} × ${esc(o.itemName)}: £${o.cost} refunded.</p>`, '', {whisper: whisper(actor)});
    return o.cost;
  });
}
/** GM: an order on the way arrives now. */
export async function deliverNow({orderId, userId}) {
  if (!game.users.get(userId)?.isGM) throw new Error('Only the GM can hurry a delivery.');
  await withDeliveries(st => { const o = st.orders[orderId]; if (o?.status === 'on-the-way') o.arrivesAt = worldSeconds(); });
  return arrivals();
}
registerHandler('delivery.order', placeOrder);
registerHandler('delivery.collect', collectOrders);
registerHandler('delivery.cancel', cancelOrder);
registerHandler('delivery.now', deliverNow);

export function installDeliveries() {
  Hooks.on('updateWorldTime', () => { if (isLeader()) void arrivals().catch(e => console.warn('The Smoke | deliveries', e)); });
  if (isLeader()) void arrivals().catch(e => console.warn('The Smoke | deliveries', e));
}

/** What the Blower shows for a character: orders on the way and waiting, and whether they can collect here. */
export function deliveriesFor(actor) {
  if (!actor) return null;
  const list = Object.values(deliveryState().orders).filter(o => o.actorId === actor.id && ['on-the-way', 'waiting'].includes(o.status)).sort((a, b) => a.arrivesAt - b.arrivesAt)
    .map(o => ({id: o.id, text: `${o.qty} × ${o.itemName}`, shop: o.shopName, waiting: o.status === 'waiting', eta: o.status === 'waiting' ? 'At the flat' : `Arrives ${at(o.arrivesAt)}`}));
  const here = Boolean(safeHere(actorToken(actor)));
  return {on: phoneOrdersOn(), list, waiting: list.filter(o => o.waiting).length, here, isGM: Boolean(game.user?.isGM)};
}
export const deliveriesAPI = {
  catalogue: async actor => onlineCatalogue(await library(), actor.system, actor.items.filter(i => i.type === 'perk').map(i => i.name)),
  order: (actor, shopKey, itemName, qty = 1) => request('delivery.order', {actorId: actor.id, shopKey, itemName, qty, operationId: newOperationId()}),
  collect: actor => request('delivery.collect', {actorId: actor.id}),
  cancel: orderId => request('delivery.cancel', {orderId}),
  now: orderId => request('delivery.now', {orderId}),
  state: deliveryState, fee: deliveryFee, minutes: deliveryMinutes
};
