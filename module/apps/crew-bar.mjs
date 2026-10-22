// The crew bar: every player character, always on screen. Click a face to go to them — the GM is taken to whichever
// map they're on and the view centres on their token (or the motor they're in); right-click opens the sheet. Hover for
// the basics: Rep, Health, Hustle, Guard, Heat, cash, conditions, where they are and what they're in.
import {NS, STATS, STAT_KEYS, HEAT} from '../config.mjs';
import {clampHeat} from '../rules/core.mjs';
import {repInfo} from '../rules/advancement.mjs';
import {zoneOfToken, isStreetScene} from '../world/spawn.mjs';

const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
let bar = null, tip = null, queued = false;

export function registerCrewBarSettings() {
  const reg = (k, o) => { try { game.settings.register(NS, k, o); } catch (_e) {} };
  reg('crewBar', {name: 'Crew bar', hint: 'Show the bar of player characters on screen (this browser only).', scope: 'client', config: true, type: Boolean, default: true, onChange: () => render()});
  reg('crewBarPlayers', {name: 'Crew bar: players see it too', hint: 'Off: only the GM gets the crew bar.', scope: 'world', config: true, type: Boolean, default: true, onChange: () => render()});
  reg('crewBarPos', {scope: 'client', config: false, type: Object, default: {}});
  reg('crewBarCollapsed', {scope: 'client', config: false, type: Boolean, default: false});
}

/* ------------------------------------------------------------------ who, and where */
/** Every player character: those assigned to a player first, then any other character a player owns. */
export function crewList() {
  const users = game.users?.filter?.(u => !u.isGM) ?? [];
  const out = [], seen = new Set();
  for (const u of [...users].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const a = u.character; if (a && a.type === 'character' && !seen.has(a.id)) { seen.add(a.id); out.push({actor: a, user: u}); }
  }
  for (const a of game.actors?.filter?.(x => x.type === 'character' && x.hasPlayerOwner) ?? []) {
    if (seen.has(a.id)) continue; seen.add(a.id);
    out.push({actor: a, user: users.find(u => a.testUserPermission?.(u, 'OWNER')) ?? null});
  }
  return out;
}
/** The token that is "them": on the map their player is looking at, else the active map, else anywhere. */
export function tokenOfPC(actor, user = null) {
  const found = [];
  for (const s of game.scenes ?? []) for (const t of s.tokens ?? []) if (t.actorId === actor.id && (t.actorLink || t.actor?.id === actor.id)) found.push(t);
  const score = t => (user?.viewedScene === t.parent.id ? 4 : 0) + (t.parent.active ? 2 : 0) + (t.hidden ? 0 : 1);
  return found.sort((a, b) => score(b) - score(a))[0] ?? null;
}
const vehicleOf = t => { const s = t?.getFlag?.(NS, 'vehicleSeat'); return s ? t.parent.tokens.get(s.vehicleTokenId) ?? null : null; };

/** Everything the hover card says. */
export function crewInfo(actor, user = null) {
  const s = actor.system, t = tokenOfPC(actor, user), vt = vehicleOf(t), heat = clampHeat(s.heat?.value), rep = repInfo(s);
  const seat = t?.getFlag?.(NS, 'vehicleSeat'), conds = actor.items.filter(i => i.type === 'condition').map(i => i.name);
  let where = 'Not on a map';
  if (t) { let zone = null; try { zone = isStreetScene(t.parent) ? zoneOfToken(vt ?? t)?.name : null; } catch (_e) {} where = zone ? `${t.parent.name} · ${zone}` : t.parent.name; }
  return {name: actor.name, img: actor.img || t?.texture?.src, player: user?.name ?? '', online: Boolean(user?.active), colour: user?.color?.css ?? user?.color ?? '#888',
    rep: rep.level, title: rep.title, tier: rep.tierName, xp: rep.xp, next: rep.next,
    hp: Number(s.resources?.health?.value ?? 0), hpMax: Number(s.resources?.health?.max ?? 0), hustle: Number(s.resources?.hustle?.value ?? 0), hustleMax: Number(s.resources?.hustle?.max ?? 0),
    guard: Number(s.guard?.value ?? 0), armour: Number(s.armour ?? 0), cash: Number(s.cash ?? 0), stash: Number(s.stash ?? 0),
    heat, heatName: HEAT[heat]?.name ?? '', down: Boolean(s.states?.down) || conds.includes('Down'), conditions: conds,
    where, scene: t?.parent ?? null, token: t, vehicle: vt ? {name: vt.name, seat: seat?.seatId === 'pilot' ? 'driving' : 'riding', fire: Boolean(vt.getFlag(NS, 'fire'))} : null,
    high: (() => { const h = actor.items.find(i => i.type === 'condition' && ['drug', 'comedown'].includes(i.system?.category)); return h ? {name: h.name, phase: h.system.category === 'comedown' ? 'comedown' : 'high'} : null; })(),
    stats: STAT_KEYS.map(k => `${STATS[k].abbr} d${s.stats?.[k]?.die ?? 4}`).join(' · ')};
}

/* ------------------------------------------------------------------ going to them */
async function goTo(actor, user) {
  const t = tokenOfPC(actor, user); if (!t) return ui.notifications.info(`${actor.name} isn't on any map.`);
  const target = vehicleOf(t) ?? t;
  if (canvas?.scene?.id !== t.parent.id) {
    if (!game.user.isGM) return ui.notifications.info(`${actor.name} is on ${t.parent.name}.`);
    await new Promise(resolve => { Hooks.once('canvasReady', () => resolve()); t.parent.view(); setTimeout(resolve, 8000); });
  }
  const g = canvas.grid?.size ?? 100, x = target.x + target.width * g / 2, y = target.y + target.height * g / 2;
  await canvas.animatePan({x, y, scale: Math.max(canvas.stage?.scale?.x ?? 1, 0.8), duration: 600});
  const obj = (canvas.tokens?.get?.(t.id) ?? t.object);
  if (obj && (game.user.isGM || obj.isOwner)) obj.control({releaseOthers: true});
  canvas.ping?.({x, y});
}

/* ------------------------------------------------------------------ drawing */
function hoverCard(info) {
  const stars = [1, 2, 3, 4, 5].map(n => `<i class="fa-${n <= info.heat ? 'solid' : 'regular'} fa-star"></i>`).join('');
  return `<header><b>${esc(info.name)}</b><small>${info.player ? `<i class="dot ${info.online ? 'on' : ''}"></i>${esc(info.player)}` : 'no player'}</small></header>
    <div class="cb-rep">Rep <b>${info.rep}</b> · ${esc(info.title)} <small>${esc(info.tier)} · ${info.xp}${info.next ? `/${info.next}` : ''} XP</small></div>
    <div class="cb-meters"><span class="hp">Health <b>${info.hp}/${info.hpMax}</b></span><span>Hustle <b>${info.hustle}/${info.hustleMax}</b></span><span>Guard <b>${info.guard}</b>${info.armour ? ` (+${info.armour} armour)` : ''}</span></div>
    <div class="cb-heat h${info.heat}">${stars} ${esc(info.heatName)}</div>
    <div class="cb-row"><i class="fa-solid fa-sterling-sign"></i> £${info.cash.toLocaleString()} <small>(£${info.stash.toLocaleString()} stashed)</small></div>
    <div class="cb-row"><i class="fa-solid fa-location-dot"></i> ${esc(info.where)}</div>
    ${info.vehicle ? `<div class="cb-row"><i class="fa-solid fa-car-side"></i> ${info.vehicle.seat === 'driving' ? 'Driving' : 'In'} the ${esc(info.vehicle.name)}${info.vehicle.fire ? ' <b class="cb-fire">— ON FIRE</b>' : ''}</div>` : ''}
    ${info.high ? `<div class="cb-row cb-high"><i class="fa-solid fa-cannabis"></i> ${info.high.phase === 'comedown' ? 'Coming down' : 'High'}: ${esc(info.high.name)}</div>` : ''}
    ${info.conditions.length ? `<div class="cb-conds">${info.conditions.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    <div class="cb-stats">${esc(info.stats)}</div>
    <footer>${game.user.isGM ? 'Click: go to them' : 'Click: find them'} · Right-click: sheet</footer>`;
}
function showTip(el, html) {
  hideTip(); tip = document.createElement('div'); tip.className = 'smoke-crew-tip'; tip.innerHTML = html; document.body.append(tip);
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  const below = r.top < h + 20;
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${below ? r.bottom + 8 : r.top - h - 8}px`;
}
function hideTip() { tip?.remove(); tip = null; }
function visible() { return setting('crewBar', true) && (game.user?.isGM || setting('crewBarPlayers', true)); }

let lastHtml = '';
export function render() {
  if (typeof document === 'undefined' || !document.body) return;
  if (!visible()) { bar?.remove(); bar = null; hideTip(); return; }
  const list = crewList();
  if (!bar) {
    lastHtml = ''; bar = document.createElement('div'); bar.id = 'smoke-crew-bar'; bar.className = 'smoke-crew-bar'; document.body.append(bar);
    const pos = setting('crewBarPos', {}) || {};
    if (Number.isFinite(pos.left)) { bar.style.left = `${pos.left}px`; bar.style.top = `${pos.top}px`; bar.style.bottom = 'auto'; }
  }
  const collapsed = setting('crewBarCollapsed', false);
  bar.classList.toggle('collapsed', Boolean(collapsed));
  const html = `<div class="cb-grip" title="Drag to move · double-click to fold away"><i class="fa-solid fa-grip-vertical"></i><span>CREW</span></div>
    <div class="cb-faces">${list.length ? list.map(({actor, user}) => {
      const i = crewInfo(actor, user), pct = i.hpMax ? Math.max(0, Math.min(100, Math.round(100 * i.hp / i.hpMax))) : 0;
      return `<div class="cb-face ${i.online ? 'online' : 'offline'}${i.down ? ' down' : ''}${i.token ? '' : ' nowhere'}${i.high ? ' high' : ''}" data-actor="${actor.id}" style="--cb-colour:${esc(i.colour)}">
        <img src="${esc(i.img)}" alt="">
        ${i.heat ? `<span class="cb-stars h${i.heat}">${'★'.repeat(i.heat)}</span>` : ''}
        ${i.vehicle ? `<span class="cb-badge${i.vehicle.fire ? ' fire' : ''}"><i class="fa-solid fa-${i.vehicle.fire ? 'fire' : 'car-side'}"></i></span>` : ''}
        ${i.down ? '<span class="cb-down"><i class="fa-solid fa-skull"></i></span>' : ''}
        <span class="cb-hp"><span style="width:${pct}%"></span></span>
        <span class="cb-name">${esc(actor.name.split(/\s+/)[0])}</span>
      </div>`; }).join('') : '<span class="cb-empty">No player characters yet</span>'}</div>`;
  // Nothing on it changed: leave the DOM alone (0.5.22 — it used to be rebuilt every time any car on the map moved).
  if (html === lastHtml && bar.isConnected) return;
  lastHtml = html; bar.innerHTML = html;
  const users = new Map(list.map(({actor, user}) => [actor.id, user]));
  bar.querySelectorAll('.cb-face').forEach(el => {
    const actor = game.actors.get(el.dataset.actor), user = users.get(el.dataset.actor); if (!actor) return;
    el.addEventListener('mouseenter', () => showTip(el, hoverCard(crewInfo(actor, user))));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('click', ev => { ev.preventDefault(); hideTip(); goTo(actor, user).catch(e => ui.notifications.warn(e.message)); });
    el.addEventListener('contextmenu', ev => { ev.preventDefault(); hideTip(); if (actor.testUserPermission(game.user, 'LIMITED')) actor.sheet.render(true); else ui.notifications.info(`You can't see ${actor.name}'s sheet.`); });
  });
  drag(bar.querySelector('.cb-grip'));
}
function drag(grip) {
  if (!grip) return;
  grip.addEventListener('dblclick', () => game.settings.set(NS, 'crewBarCollapsed', !setting('crewBarCollapsed', false)).then(render));
  grip.addEventListener('pointerdown', ev => {
    ev.preventDefault(); const r = bar.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top;
    const move = e => { bar.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dx))}px`; bar.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dy))}px`; bar.style.bottom = 'auto'; };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); const b = bar.getBoundingClientRect(); game.settings.set(NS, 'crewBarPos', {left: Math.round(b.left), top: Math.round(b.top)}).catch(() => null); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  });
}
/** Is this vehicle carrying one of the player characters (the only motors the crew bar shows)? */
const carriesPC = t => (t?.getFlag?.(NS, 'vehicleOccupants') || []).some(o => t.parent?.tokens?.get(o.tokenId)?.actor?.type === 'character');
function soon() { if (queued) return; queued = true; setTimeout(() => { queued = false; try { render(); } catch (error) { console.warn('The Smoke | crew bar', error); } }, 150); }

export function installCrewBar() {
  render();
  const pcActor = a => a?.type === 'character';
  Hooks.on('updateActor', a => { if (pcActor(a)) soon(); });
  Hooks.on('createActor', a => { if (pcActor(a)) soon(); }); Hooks.on('deleteActor', a => { if (pcActor(a)) soon(); });
  for (const h of ['createItem', 'deleteItem']) Hooks.on(h, i => { if (i.type === 'condition' && pcActor(i.parent)) soon(); });
  // Only tokens that change what the bar shows: the characters and the motors they're in (not every passing car,
  // whose travel meter and traffic state are written every second).
  for (const h of ['createToken', 'deleteToken']) Hooks.on(h, t => { if (pcActor(t.actor) || carriesPC(t)) soon(); });
  Hooks.on('updateToken', (t, ch) => { if (ch.flags?.[NS] && (pcActor(t.actor) || carriesPC(t))) soon(); });
  Hooks.on('updateUser', soon); Hooks.on('userConnected', soon); Hooks.on('canvasReady', soon);
}
export const crewBarAPI = {render, list: crewList, info: crewInfo, goTo};
