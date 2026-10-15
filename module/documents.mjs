import {NS, CRIMES, HEAT} from './config.mjs';
import {clampHeat, heatAfterCrime} from './rules/core.mjs';
import {CONDITION_LIBRARY} from './rules/conditions.mjs';
import {rollStat, rollDialog, rollAttack} from './dice/roll.mjs';

const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
const card = (kicker, title, body, cls = '') => `<section class="smoke-card ${cls}"><header><span class="kicker">${esc(kicker)}</span><strong>${esc(title)}</strong></header>${body}</section>`;

export class SmokeActor extends Actor {
  get isPerson() { return this.type === 'character' || this.type === 'npc'; }
  rollStat(stat, options = {}) { return rollStat(this, stat, options); }
  rollDialog(stat, defaults = {}) { return rollDialog(this, stat, defaults); }
  rollAttack(weapon, targetToken, options = {}) { return rollAttack(this, weapon, targetToken, options); }

  async spendHustle(n, reason = '') {
    const cur = Number(this.system.resources?.hustle?.value ?? 0);
    if (cur < n) { ui.notifications.warn(`${this.name} has only ${cur} Hustle.`); return false; }
    await this.update({'system.resources.hustle.value': cur - n});
    return true;
  }
  async changeCash(delta, reason = '') {
    const before = Number(this.system.cash || 0), after = Math.max(0, before + Number(delta || 0));
    await this.update({'system.cash': after});
    if (reason) await ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor: this}), content: card(delta >= 0 ? 'PAID' : 'SPENT', `${delta >= 0 ? '+' : '−'}£${Math.abs(after - before)}`, `<p>${esc(reason)}</p><p class="smoke-dim">Cash: £${after}</p>`, delta >= 0 ? 'cash' : 'cost')});
    return after;
  }
  async setHeat(value, reason = '') {
    const before = clampHeat(this.system.heat?.value), after = clampHeat(value);
    if (before === after) return after;
    await this.update({'system.heat.value': after, 'system.heat.coolSince': 0});
    const info = HEAT[after];
    await ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor: this}),
      content: card('HEAT', `${this.name}: ${'★'.repeat(after)}${'☆'.repeat(5 - after)} ${info.name}`, `${reason ? `<p>${esc(reason)}</p>` : ''}<p class="smoke-dim">${esc(info.response)}</p>`, `heat h${after}`)});
    Hooks.callAll('smokeHeatChanged', this, before, after);
    return after;
  }
  changeHeat(delta, reason = '') { return this.setHeat(clampHeat(this.system.heat?.value) + Number(delta || 0), reason); }
  reportCrime(crimeKey, {witnessed = true, byPolice = false} = {}) {
    const crime = CRIMES[crimeKey]; if (!crime) return this.system.heat?.value;
    return this.setHeat(heatAfterCrime(this.system.heat?.value, crimeKey, {witnessed, byPolice}), `${crime.label}${byPolice ? ' — in front of the police' : ''}.`);
  }
  async addCondition(name) {
    if (this.items.some(i => i.type === 'condition' && i.name === name)) return null;
    const def = CONDITION_LIBRARY.find(c => c.name === name) ?? {name, category: 'physical', severity: 1, description: '', removal: ''};
    const [item] = await this.createEmbeddedDocuments('Item', [{name: def.name, type: 'condition', img: 'icons/svg/aura.svg',
      system: {category: def.category, severity: def.severity, description: `<p>${def.description}</p>`, removal: def.removal}}]);
    return item;
  }
  async removeCondition(name) { const i = this.items.find(x => x.type === 'condition' && x.name === name); if (i) await i.delete(); }
  async applyDamage(amount) {
    amount = Math.max(0, Number(amount) || 0);
    if (this.type === 'vehicle') {
      const v = this.system.vehicle, next = Math.max(0, Number(v.body.value) - amount);
      await this.update({'system.vehicle.body.value': next});
      await ChatMessage.implementation.create({content: card('VEHICLE DAMAGE', `${this.name}: −${amount} Body`, `<p>Body ${next}/${v.body.max}${next <= 0 ? ' — <b>WRECKED</b>. It limps along a die step down; one more hit and it burns.' : next < v.body.max / 2 ? ' — smoking and rattling.' : ''}</p>`, 'cost')});
      return next;
    }
    const hp = this.system.resources.health, next = Math.max(0, Number(hp.value) - amount);
    await this.update({'system.resources.health.value': next, ...(next <= 0 ? {'system.states.down': true} : {})});
    if (next <= 0) {
      await this.addCondition('Down');
      await ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor: this}), content: card('DOWN', `${this.name} is down`,
        `<p>At 0 Health. Each round roll <b>Grit — Stay Conscious</b> (Medium). A Proper Mess, or nobody helping within three rounds, and they are <b>Wasted</b>.</p>
         <button type="button" data-smoke-roll="${esc(this.uuid)}" data-stat="grt" data-band="medium" data-label="Stay Conscious"><i class="fa-solid fa-heart-pulse"></i> Stay Conscious</button>
         <button type="button" class="gm" data-smoke-wasted="${esc(this.uuid)}"><i class="fa-solid fa-skull"></i> Wasted</button>`, 'down')});
    }
    return next;
  }
  async heal(amount) {
    const hp = this.system.resources.health, next = Math.min(Number(hp.max), Number(hp.value) + Math.max(0, Number(amount) || 0));
    await this.update({'system.resources.health.value': next, ...(next > 0 ? {'system.states.down': false} : {})});
    if (next > 0) await this.removeCondition('Down');
    return next;
  }
}

export class SmokeItem extends Item {
  async use() {
    const actor = this.parent; if (!actor) return;
    if (this.type === 'weapon') {
      const target = [...(game.user?.targets ?? [])][0]?.document ?? null;
      return actor.rollAttack(this, target);
    }
    if (this.type === 'gear' && this.system.stat) return actor.rollDialog(this.system.stat, {label: this.name});
    return ChatMessage.implementation.create({speaker: ChatMessage.getSpeaker({actor}), content: card(this.type.toUpperCase(), this.name, this.system.description || '')});
  }
}
