// The shop window: whatever shops are open where the character stands (the GM can open any), with Buy, Sell,
// Services (respray, repair, a change of clothes, A&E, kip, stash) and the Wardrobe where you can change.
import {NS} from '../config.mjs';
import {SHOPS, SERVICES, shopsFor, stockFor, resprayPrice, repairPrice, shopAPI, discountFor} from '../world/shops.mjs';
import {wearOutfit} from '../world/items.mjs';
import {servicePrice} from '../world/services.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const strip = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const TYPE = {weapon: 'Weapon', ammo: 'Ammo', armour: 'Armour', outfit: 'Clobber', gear: 'Kit', consumable: 'Grub', drug: 'Gear'};

export class SmokeShop extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-shop'], tag: 'div', position: {width: 820, height: 680}, window: {title: 'Shop', icon: 'fa-solid fa-store', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/shop.hbs`, scrollable: ['.shop-main']}};
  constructor(actor, {shopKey = null} = {}) { super({id: `smoke-shop-${actor.id}`}); this.actor = actor; this.shopKey = shopKey; }
  get title() { return `${this.actor.name} — ${SHOPS[this.shopKey]?.name ?? 'Shops'}`; }
  get open() { return game.user.isGM ? Object.keys(SHOPS) : shopsFor(this.actor); }

  async _prepareContext() {
    const a = this.actor, open = this.open;
    if (!open.includes(this.shopKey)) this.shopKey = open.find(k => k !== 'corner') ?? open[0] ?? null;
    const lib = (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json()).catch(() => ({items: []}))).items;
    const perks = a.items.filter(i => i.type === 'perk').map(i => i.name);
    const shop = this.shopKey ? SHOPS[this.shopKey] : null;
    const seat = canvas?.scene?.tokens?.find(t => t.actorId === a.id)?.getFlag(NS, 'vehicleSeat');
    const vt = seat?.seatId === 'pilot' ? canvas.scene.tokens.get(seat.vehicleTokenId) : null;
    const services = (shop?.services || []).map(k => ({key: k, ...SERVICES[k],
      price: k === 'respray' ? (vt ? resprayPrice(vt.actor) : null) : k === 'repair' ? (vt ? repairPrice(vt.actor) : null) : k === 'clothes' ? servicePrice('clothes') : k === 'treat' || k === 'rest' ? 0 : null,
      needsVehicle: ['respray', 'repair'].includes(k), vehicle: vt?.name ?? null, stash: k === 'stash'}));
    return {
      actor: a, cash: a.system.cash, stash: a.system.stash, rep: a.system.stage ?? 1, isGM: game.user.isGM,
      shops: open.map(k => ({key: k, name: SHOPS[k].name, active: k === this.shopKey})), shop, shopKey: this.shopKey,
      discount: Math.round(discountFor(a.system, this.shopKey, perks) * 100),
      lines: this.shopKey ? stockFor(this.shopKey, lib, a.system, perks).map(l => ({...l, items: l.items.map(i => ({name: i.name, img: i.img, price: i.price, unit: i.unit, type: TYPE[i.type] ?? i.type,
        blurb: strip(i.system.description).slice(0, 110), afford: Number(a.system.cash) >= i.price}))})) : [],
      sell: this.shopKey === 'dealer' ? a.items.filter(i => i.type === 'drug').map(i => ({id: i.id, name: i.name, img: i.img, qty: i.system.quantity, unit: i.system.unit, perUnit: Math.round(Number(i.system.value) * SHOPS.dealer.buysDrugs)})) : [],
      services, wardrobe: shop?.changing ? a.items.filter(i => i.type === 'outfit').map(i => ({id: i.id, name: i.name, img: i.img, worn: i.system.worn})) : [],
      nothing: !open.length
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element, a = this.actor;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(n)).then(() => setTimeout(() => this.render(), 250)).catch(e => ui.notifications.warn(e.message)); }));
    on('[data-shop-tab]', n => { this.shopKey = n.dataset.shopTab; });
    on('[data-buy]', n => shopAPI.buy(a, this.shopKey, n.dataset.buy, Number(n.closest('.shop-item')?.querySelector('[name=qty]')?.value || 1)));
    on('[data-sell]', n => shopAPI.sell(a, this.shopKey, a.items.get(n.dataset.sell), Number(n.closest('.shop-item')?.querySelector('[name=qty]')?.value || 1)));
    on('[data-service]', n => shopAPI.service(a, this.shopKey, n.dataset.service));
    on('[data-stash]', n => shopAPI.service(a, this.shopKey, 'stash', Number(el.querySelector('[name=stashAmount]')?.value || 0) * (n.dataset.stash === 'out' ? -1 : 1)));
    on('[data-wear]', n => wearOutfit(a, a.items.get(n.dataset.wear)));
  }
}
const open = new Map();
export function openShop(actor, opts = {}) {
  if (!actor) return ui.notifications.warn('Choose a character.');
  let app = open.get(actor.id); if (!app) { app = new SmokeShop(actor, opts); open.set(actor.id, app); } else if (opts.shopKey) app.shopKey = opts.shopKey;
  app.render({force: true}); return app;
}
Hooks.on('updateActor', a => { const app = open.get(a.id); if (app?.rendered) app.render(); });
