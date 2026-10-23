// The Token Builder window (0.5.25): build a top-down token from layered parts in the house style, see it live, and
// save it to the character (its prototype token, every placed token, optionally the portrait). The recipe stays on
// the actor so the look can be edited later. Opened from the sheet (Build / Edit / Randomise token), the Character
// Creator's Token step, and game.smoke.tokens.open(actor). The GM can use it on any NPC.
import {NS} from '../config.mjs';
import {loadKit, recipeOf, saveToken} from '../tokens/kit.mjs';
import {newPanelState, panelHTML, wirePanel} from '../tokens/panel.mjs';
import {randomRecipe} from '../tokens/compose.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class TokenBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-token-builder'], tag: 'div', position: {width: 960, height: 720}, window: {title: 'Token Builder', icon: 'fa-solid fa-user-pen', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/token-creator.hbs`, scrollable: ['.tb-options', '.tb-scroll']}};
  constructor(actor, {random = false} = {}) {
    super({id: `smoke-token-builder-${actor?.id ?? 'none'}`, window: {title: `Token Builder${actor ? ` · ${actor.name}` : ''}`}});
    this.actor = actor; this.random = random; this.state = null; this.saving = false;
  }
  async _prepareContext() {
    const kit = await loadKit();
    if (!this.state) {
      const start = recipeOf(this.actor, kit.catalogue);
      this.state = newPanelState(kit, this.random ? randomRecipe(kit.catalogue) : start, {npc: this.actor?.type === 'npc'});
      if (this.random) this.state.start = start;
    }
    return {actor: this.actor, panel: panelHTML(this.state, {idPrefix: `tb${this.actor?.id ?? ''}`}), portrait: this.state.portrait, saving: this.saving,
      hasToken: Boolean(Object.keys(this.actor?.system?.identity?.tokenParts ?? {}).length), isNPC: this.actor?.type === 'npc'};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    wirePanel(el, this.state, () => this.render());
    el.querySelector('[data-tb-portrait]')?.addEventListener('change', ev => { this.state.portrait = ev.currentTarget.checked; });
    el.querySelector('[data-tb-save]')?.addEventListener('click', async ev => {
      ev.preventDefault(); if (this.saving) return;
      this.saving = true; this.render();
      try { await saveToken(this.actor, this.state.recipe, {portrait: this.state.portrait}); this.state.start = structuredClone(this.state.recipe); this.close(); }
      catch (error) { ui.notifications.error(error.message); this.saving = false; this.render(); }
    });
    el.querySelector('[data-tb-cancel]')?.addEventListener('click', ev => { ev.preventDefault(); this.close(); });
  }
}
/** Open the builder for `actor` (players: their own characters; the GM: anyone). `random` starts from a random look. */
export function openTokenBuilder(actor, {random = false} = {}) {
  if (!actor) return ui.notifications.warn('Pick a character first.');
  if (!actor.isOwner) return ui.notifications.warn(`${actor.name} isn't yours to change.`);
  if (actor.type === 'vehicle') return ui.notifications.warn('The Token Builder makes people. Vehicles keep their own art.');
  const id = `smoke-token-builder-${actor.id}`, open = foundry.applications.instances?.get?.(id);
  if (open) { open.render({force: true}); open.bringToFront?.(); return open; }
  const app = new TokenBuilder(actor, {random}); app.render({force: true}); return app;
}
/** Sheet button: a random new look, saved straight away (the builder can change it afterwards). */
export async function randomiseToken(actor) {
  if (!actor?.isOwner) throw new Error('Not yours to change.');
  const kit = await loadKit();
  return saveToken(actor, randomRecipe(kit.catalogue, Math.random, {npc: actor.type === 'npc'}));
}
