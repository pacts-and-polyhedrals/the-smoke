// Chat-card buttons, scene-control tools, token HUD buttons and the Blower shortcut, in one place.
// Every card button resolves once: attack hits and dodges, first aid, Heat for a witnessed crime, Wasted/Busted.
import {NS, STATS} from './config.mjs';
import {jobsAPI} from './world/jobs.mjs';
import {request, esc} from './world/net.mjs';
import {resolveAttack} from './gameplay.mjs';
import {respond as respondToRequest} from './gm/requests.mjs';
import {sellVehicle} from './world/theft.mjs';
import {shopsAt, SHOPS} from './world/shops.mjs';
import {openShop} from './apps/shop.mjs';

const owns = a => game.user.isGM || a?.isOwner;
async function actorFrom(uuid) { const d = uuid ? await fromUuid(uuid) : null; return d?.actor ?? d; }

/** What one button does. Returns nothing; throws to show a warning. */
async function press(message, button) {
  const d = button.dataset;
  if (d.smokeRoll) {
    const a = await actorFrom(d.smokeRoll); if (!a) throw new Error('Character not found.');
    if (!owns(a)) throw new Error(`${a.name} is not yours to roll for.`);
    let context = null; try { context = d.context ? JSON.parse(d.context) : null; } catch (_e) {}
    if (!context && d.label === 'Stay Conscious') context = {kind: 'stayUp'};
    const out = await a.rollStat(d.stat, {band: d.band && d.band !== 'null' ? d.band : null, tn: d.tn ? Number(d.tn) : null, label: d.label, context});
    if (d.after && out?.result && !game.user.isGM && !out.result.success && ['legIt', 'talkOut'].includes(d.after)) ui.notifications.warn('It did not work. The GM decides: Busted, or fight.');
    return;
  }
  const attack = message.getFlag(NS, 'attack');
  if (d.smokeDamage || d.smokeDodge) {
    const a = await actorFrom(d.smokeDamage || d.smokeDodge);
    if (!owns(a)) throw new Error('The target’s owner or GM resolves the hit.');
    // The attack's own target: Take hit or Dodge, once. Anyone else on the card (splash, old cards): apply the amount.
    if (attack && (d.smokeDodge || d.smokeDamage === attack.target)) return resolveAttack(message, {dodge: Boolean(d.smokeDodge)});
    return a.applyDamage(Number(d.amount || 0));
  }
  if (d.smokeCondition) {
    const a = await actorFrom(d.smokeCondition);
    if (!owns(a)) throw new Error('The target’s owner or GM applies conditions.');
    if (attack) { await request('combat.condition', {messageId: message.id, condition: d.condition}); button.textContent = `${d.condition} ✓`; return; }
    return a.addCondition(d.condition);
  }
  if (d.smokeCrime) {
    if (!game.user.isGM) throw new Error('GM only.');
    if (message.getFlag(NS, 'crimeAdded')) throw new Error('Heat already added for this action.');
    const a = await actorFrom(d.smokeCrime); await message.setFlag(NS, 'crimeAdded', true);
    return game.smoke.heat.reportCrime(a, d.crime);
  }
  if (d.smokeWasted || d.smokeBusted) {
    const a = await actorFrom(d.smokeWasted || d.smokeBusted); if (!owns(a)) throw new Error('Not your character.');
    return game.smoke.heat[d.smokeWasted ? 'wasted' : 'busted'](a, {messageId: message.id});
  }
  if (d.smokeJobAccept) return jobsAPI.acceptCall(d.smokeJobAccept);
  if (d.smokeJobDecline) return jobsAPI.declineCall(d.smokeJobDecline);
  if (d.smokeAid) return request('aid.apply', {messageId: message.id});
  if (d.smokeRespond) return respondToRequest(message, {requestId: d.smokeRespond, actorId: d.actor, stat: d.stat, label: d.label});
  if (d.smokePoliceFight) { const t = await fromUuid(d.smokePoliceFight); if (t) return game.smoke.combat.policeFight(t); return; }
  if (d.smokeSell) { const vt = await fromUuid(d.smokeSell); if (!vt) throw new Error('That ride is gone.'); return sellVehicle(vt); }
  if (d.smokeInstall !== undefined) return game.smoke.setup();
}

export function installChat() {
  Hooks.on('renderChatMessageHTML', (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.querySelector ? html : html?.[0]; if (!root) return;
    root.querySelectorAll('.gm').forEach(el => { if (!game.user.isGM) el.hidden = true; });
    if (message.getFlag(NS, 'resolved')) root.querySelectorAll('[data-smoke-damage],[data-smoke-dodge],[data-smoke-aid]').forEach(b => { b.disabled = true; b.title = 'Already resolved'; });
    if (message.getFlag(NS, 'conditionApplied')) root.querySelectorAll('[data-smoke-condition]').forEach(b => { b.disabled = true; });
    if (message.getFlag(NS, 'attack') && message.getFlag(NS, 'resolution') !== 'hit') root.querySelectorAll('[data-smoke-condition]').forEach(b => { b.disabled = true; b.title = message.getFlag(NS, 'resolution') === 'dodged' ? 'The attack was dodged.' : 'Take the hit before choosing its condition.'; });
    if (message.getFlag(NS, 'outcomeResolved')) root.querySelectorAll('[data-smoke-wasted],[data-smoke-busted]').forEach(b => { b.disabled = true; });
    if (message.getFlag(NS, 'crimeAdded')) root.querySelectorAll('[data-smoke-crime]').forEach(b => { b.disabled = true; });
    root.querySelectorAll('[data-smoke-respond]').forEach(b => { if (!game.actors.get(b.dataset.actor)?.isOwner) b.disabled = true; });
    root.querySelectorAll('button').forEach(button => {
      if (!Object.keys(button.dataset).some(k => k.startsWith('smoke'))) return;
      button.addEventListener('click', async event => {
        event.preventDefault(); button.disabled = true;
        try { await press(message, button); }
        catch (error) { ui.notifications.warn(error.message); }
        finally { if (button.isConnected && !message.getFlag(NS, 'resolved')) button.disabled = false; }
      });
    });
  });
}

/** Alt+N and the scene-control button: the sat nav for your character (pick a destination, or show / hide it). */
function satnavKey() {
  const actor = game.user.character ?? canvas?.tokens?.controlled?.find(t => t.actor?.type === 'character' && t.actor.isOwner)?.actor ?? game.actors.find(a => a.type === 'character' && a.isOwner && !game.user.isGM) ?? null;
  Promise.resolve(game.smoke.satnav.toggle(actor)).catch(e => ui.notifications.warn(e.message));
}
/** Scene controls (token layer): the Blower, pirate radio, the Combat Console; for the GM, the GM Screen and Street Control. */
export function installSceneControls() {
  Hooks.on('getSceneControlButtons', controls => {
    const tool = (name, title, icon, fn, visible = true) => ({name, title, icon, button: true, visible, onChange: fn, onClick: fn});
    const tools = {
      blower: tool('blower', 'The Blower · jobs, Heat, cash, radio (Alt+B)', 'fa-solid fa-mobile-screen', () => game.smoke.phone()),
      radio: tool('radio', 'Pirate radio · car & Blower', 'fa-solid fa-radio', () => game.smoke.radio.open()),
      satnav: tool('satnav', 'Sat nav · route to a job or a place (Alt+N)', 'fa-solid fa-diamond-turn-right', () => satnavKey()),
      smokeCombat: tool('smokeCombat', 'Combat Console (speed dice)', 'fa-solid fa-crosshairs', () => game.smoke.openCombat())
    };
    if (game.user.isGM) {
      tools.smokeGMScreen = tool('smokeGMScreen', 'GM Screen: roll requests, hazards, events, rewards', 'fa-solid fa-user-secret', () => game.smoke.openGMScreen());
      tools.streetControl = tool('streetControl', 'Street Control · set up the world, Street Life, Heat, shifts', 'fa-solid fa-city', () => game.smoke.control());
    }
    if (Array.isArray(controls)) { const t = controls.find(c => c.name === 'token'); t?.tools?.push(...Object.values(tools)); return; }
    const t = controls.tokens ?? controls.token; if (!t?.tools) return;
    let order = Object.keys(t.tools).length;
    for (const [k, v] of Object.entries(tools)) t.tools[k] = {...v, order: ++order};
  });
  game.keybindings.register(NS, 'blower', {name: 'Open the Blower', editable: [{key: 'KeyB', modifiers: ['Alt']}], onDown: () => { game.smoke.phone(); return true; }});
  game.keybindings.register(NS, 'satnav', {name: 'Sat nav: choose a destination, or show / hide the map', editable: [{key: 'KeyN', modifiers: ['Alt']}], onDown: () => { satnavKey(); return true; }});
}

/** Token HUD: a shop button wherever there is one; for the GM, Heat ±, Busted and Wasted. */
export function installTokenHUD() {
  Hooks.on('renderTokenHUD', (hud, html) => {
    try {
      const root = html instanceof HTMLElement ? html : html?.[0]; const doc = hud.document ?? hud.object?.document;
      if (!root || !doc || doc.actor?.type !== 'character' || !doc.actor.isOwner) return;
      const here = shopsAt(doc); if (!here.length) return;
      const col = root.querySelector('.col.right'); if (!col || col.querySelector('.smoke-shop-hud')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'control-icon smoke-shop-hud';
      b.dataset.tooltip = here.map(k => SHOPS[k].name).join(' · '); b.innerHTML = '<i class="fa-solid fa-store" inert></i>';
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); openShop(doc.actor, {shopKey: here.find(k => k !== 'corner') ?? here[0]}); });
      col.append(b);
    } catch (error) { console.warn('The Smoke | shop HUD', error); }
  });
  Hooks.on('renderTokenHUD', (hud, html) => {
    try {
      const root = html instanceof HTMLElement ? html : html?.[0]; const doc = hud.document ?? hud.object?.document;
      if (!root || !doc || doc.actor?.type !== 'character' || !game.user.isGM) return;
      const col = root.querySelector('.col.left'); if (!col || col.querySelector('.smoke-gm-hud')) return;
      const add = (icon, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'control-icon smoke-gm-hud'; b.dataset.tooltip = title; b.innerHTML = `<i class="${icon}" inert></i>`;
        b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); Promise.resolve(fn()).catch(e => ui.notifications.warn(e.message)); }); col.append(b); };
      add('fa-solid fa-star', 'Heat +1', () => doc.actor.changeHeat(1, 'The GM turns up the heat.'));
      add('fa-regular fa-star', 'Heat −1', () => doc.actor.changeHeat(-1, 'The heat dies down.'));
      add('fa-solid fa-handcuffs', 'Busted', () => game.smoke.heat.busted(doc.actor));
      add('fa-solid fa-skull', 'Wasted', () => game.smoke.heat.wasted(doc.actor));
    } catch (error) { console.warn('The Smoke | GM HUD', error); }
  });
}
export {esc, STATS};
