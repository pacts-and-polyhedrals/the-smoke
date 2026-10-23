// The Blower's shopping app: order from the high-street shops, delivered to Your Flat (0.5.27).
import {NS} from '../config.mjs';
import {deliveriesAPI, deliveriesFor, deliveryFee, deliveryMinutes, phoneOrdersOn} from '../world/deliveries.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const strip = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const TYPE = {armour: 'Armour', outfit: 'Clobber', gear: 'Kit', consumable: 'Grub'};

export class SmokeOrders extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-shop', 'smoke-orders'], tag: 'div', position: {width: 820, height: 680}, window: {title: 'Banana Basket', icon: 'fa-solid fa-basket-shopping', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/order.hbs`, scrollable: ['.shop-main']}};
  constructor(actor) { super({id: `smoke-orders-${actor.id}`}); this.actor = actor; this.shopKey = null; }
  get title() { return `${this.actor.name} — Banana Basket`; }
  async _prepareContext() {
    const a = this.actor, shops = await deliveriesAPI.catalogue(a);
    if (!shops.some(s => s.key === this.shopKey)) this.shopKey = shops[0]?.key ?? null;
    const shop = shops.find(s => s.key === this.shopKey) ?? null, fee = deliveryFee(), cash = Number(a.system.cash || 0);
    return {actor: a, cash, stash: a.system.stash, fee, minutes: deliveryMinutes(), on: phoneOrdersOn(), isGM: game.user.isGM,
      shops: shops.map(s => ({key: s.key, name: s.name, active: s.key === this.shopKey})), shop,
      lines: (shop?.lines ?? []).map(l => ({label: l.label, items: l.items.map(i => ({name: i.name, img: i.img, price: i.price, unit: i.unit, type: TYPE[i.type] ?? i.type,
        blurb: strip(i.system?.description).slice(0, 150), afford: cash >= i.price + fee}))})),
      orders: deliveriesFor(a)};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element, a = this.actor;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', async ev => {
      ev.preventDefault(); if (this.busy) return; this.busy = true; el.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try { await fn(n); } catch (e) { ui.notifications.warn(e.message); } finally { this.busy = false; this.render(); }
    }));
    on('[data-order-shop]', n => { this.shopKey = n.dataset.orderShop; });
    on('[data-order]', n => deliveriesAPI.order(a, this.shopKey, n.dataset.order, Number(n.closest('.shop-item')?.querySelector('[name=qty]')?.value || 1)));
    on('[data-collect]', () => deliveriesAPI.collect(a));
    on('[data-cancel-order]', n => deliveriesAPI.cancel(n.dataset.cancelOrder));
    on('[data-deliver-now]', n => deliveriesAPI.now(n.dataset.deliverNow));
  }
}
const open = new Map();
export function openOrders(actor) {
  if (!actor) return ui.notifications.warn('Choose a character.');
  let app = open.get(actor.id); if (!app) { app = new SmokeOrders(actor); open.set(actor.id, app); }
  app.render({force: true}); return app;
}
const refresh = () => { for (const app of open.values()) if (app.rendered && !app.busy) app.render(); };
Hooks.on('smokeDeliveriesChanged', refresh);
Hooks.on('updateActor', a => { const app = open.get(a.id); if (app?.rendered && !app.busy) app.render(); });
