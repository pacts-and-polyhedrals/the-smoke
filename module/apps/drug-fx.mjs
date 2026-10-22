// Under the influence: while your character is high (or coming down, or mullered), your screen shows it. Every high
// has its own look — Skunk's green haze, Charlie's wired jitter, Pills' colour wash, Benzos' tunnel, Nitrous' wobble,
// Roids' red pulse — and every comedown its own grey, shaky, foggy morning after. A rush when it kicks in; a crash when
// the comedown starts. Only the player whose character it is sees it. A setting tones it down or turns it off.
import {NS} from '../config.mjs';
import {watchMinutesRemaining} from '../rules/watch-clock.mjs';
import {worldSeconds, gameClockAt} from './banana-watch.mjs';

/** Each condition's look. `kind`: high, comedown or drink. Earlier in the list wins if several are on at once. */
export const DRUG_FX = Object.freeze({
  'Wired':        {cls: 'wired', kind: 'high', label: 'Wired', colour: '#e8f4ff', drug: 'Charlie'},
  'Loved Up':     {cls: 'loved', kind: 'high', label: 'Loved up', colour: '#ff7ad9', drug: 'Pills'},
  'Giggling':     {cls: 'giggling', kind: 'high', label: 'Giggling', colour: '#ffe36b', drug: 'Nitrous'},
  'Blazed':       {cls: 'blazed', kind: 'high', label: 'Blazed', colour: '#8fe36b', drug: 'Skunk'},
  'Numb':         {cls: 'numb', kind: 'high', label: 'Numb', colour: '#9fb4c9', drug: 'Benzos'},
  'Pumped':       {cls: 'pumped', kind: 'high', label: 'Pumped', colour: '#ff5a4a', drug: 'Roids'},
  'Roid Rage':    {cls: 'rage', kind: 'comedown', label: 'Roid rage', colour: '#ff2a2a', drug: 'Roids'},
  'Crashing':     {cls: 'crashing', kind: 'comedown', label: 'Crashing', colour: '#9aa3ad', drug: 'Charlie'},
  'Wrung Out':    {cls: 'wrung', kind: 'comedown', label: 'Wrung out', colour: '#8fb0c8', drug: 'Pills'},
  'Jittery':      {cls: 'jittery', kind: 'comedown', label: 'Jittery', colour: '#c9c39a', drug: 'Benzos'},
  'Foggy':        {cls: 'foggy', kind: 'comedown', label: 'Foggy', colour: '#b8bdb2', drug: 'Skunk'},
  'Mullered':     {cls: 'mullered', kind: 'drink', label: 'Mullered', colour: '#ffb347', drug: 'Lager'},
  'Dutch Courage': {cls: 'tipsy', kind: 'drink', label: 'Dutch courage', colour: '#ffcf70', drug: 'Lager'}
});
const ORDER = Object.keys(DRUG_FX);
const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };

export function registerDrugFxSettings() {
  try {
    game.settings.register(NS, 'drugFX', {name: 'Screen effects when your character is high', hint: 'Full: the works. Subtle: colour and haze only, no shaking or swaying (also used if your system asks for reduced motion). Off: none.',
      scope: 'client', config: true, type: String, default: 'full', choices: {full: 'Full', subtle: 'Subtle', off: 'Off'}, onChange: () => refresh(true)});
  } catch (_e) {}
}

/** The character whose head we're in: the player's own. The GM sees nothing (unless previewing). */
export function myCharacter() {
  if (game.user?.isGM) return null;
  const own = game.user?.character; if (own?.type === 'character') return own;
  const t = canvas?.tokens?.controlled?.find?.(x => x.actor?.type === 'character' && x.actor.isOwner); if (t) return t.actor;
  return game.actors?.find?.(a => a.type === 'character' && a.isOwner) ?? null;
}
/** Which effect is on for an actor (or null): the strongest condition with a look, and when it wears off. */
export function activeFx(actor) {
  if (!actor) return null;
  const conds = (actor.items ?? []).filter(i => i.type === 'condition' && DRUG_FX[i.name]);
  if (!conds.length) return null;
  conds.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  const c = conds[0], rawUntil = c.getFlag?.(NS, 'expiresWorldTime');
  const until = rawUntil === null || rawUntil === undefined ? null : Number(rawUntil);
  const validUntil = until !== null && Number.isFinite(until) ? until : null;
  return {name: c.name, ...DRUG_FX[c.name], untilWorldTime: validUntil,
    minutes: validUntil !== null ? watchMinutesRemaining(validUntil, worldSeconds()) : null, then: c.getFlag?.(NS, 'then') || ''};
}

/* ------------------------------------------------------------------ the overlay */
let host = null, current = null, preview = null, timer = null, onsetTimer = null;
const ALL = Object.values(DRUG_FX).map(f => `fx-${f.cls}`);
function ensureHost() {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!host || !host.isConnected) {
    host = document.createElement('div'); host.id = 'smoke-fx'; host.setAttribute('aria-hidden', 'true');
    host.innerHTML = '<div class="fx-l fx-a"></div><div class="fx-l fx-b"></div><div class="fx-l fx-c"></div><div class="fx-flash"></div><div class="fx-label"><b></b><span></span></div>';
    const board = document.getElementById('board'); if (board?.parentElement) board.after(host); else document.body.append(host);
  }
  return host;
}
function clearClasses() { document.body.classList.remove('smoke-fx-on', 'smoke-fx-subtle', ...ALL); host?.classList.remove(...ALL, 'fx-onset', 'fx-crash', 'on'); }
/** Put the effect on screen (or take it off). */
export function refresh(force = false) {
  if (typeof document === 'undefined' || !document.body) return;
  const mode = setting('drugFX', 'full'), fx = preview ?? activeFx(myCharacter());
  if (!fx || mode === 'off') { if (current) { clearClasses(); current = null; } return; }
  const h = ensureHost(); if (!h) return;
  const changed = force || current?.name !== fx.name;
  if (changed) {
    const was = current; clearClasses();
    document.body.classList.add('smoke-fx-on', `fx-${fx.cls}`); if (mode === 'subtle') document.body.classList.add('smoke-fx-subtle');
    h.classList.add('on', `fx-${fx.cls}`); h.style.setProperty('--fx-colour', fx.colour);
    // a rush as it kicks in; a crash as the comedown starts (not on reload, and not for a refresh)
    if (!force && (!was || was.kind !== fx.kind || was.name !== fx.name)) {
      const kick = fx.kind === 'comedown' ? 'fx-crash' : 'fx-onset';
      h.classList.add(kick); clearTimeout(onsetTimer); onsetTimer = setTimeout(() => h.classList.remove('fx-onset', 'fx-crash'), 2600);
    }
    current = fx;
  }
  h.querySelector('.fx-label b').textContent = fx.label.toUpperCase();
  const span = h.querySelector('.fx-label span');
  span.textContent = fx.minutes != null ? `${fx.kind === 'comedown' ? 'comedown · ' : ''}${fx.minutes} watch min` : (fx.kind === 'comedown' ? 'comedown' : '');
  span.title = fx.untilWorldTime != null ? `Banana Watch: ends ${gameClockAt(fx.untilWorldTime)}` : '';
}
/** Try an effect for a few seconds (the GM can see what the players will). */
export function previewFx(name, seconds = 12) {
  const def = DRUG_FX[name]; if (!def) throw new Error(`No screen effect for ${name}. Try: ${ORDER.join(', ')}.`);
  preview = {name, ...def, until: Date.now() + seconds * 1000, minutes: null, then: ''}; current = null; refresh();
  clearTimeout(timer); timer = setTimeout(() => { preview = null; refresh(); }, seconds * 1000);
}

export function installDrugFx() {
  const mine = actor => actor && actor.id === myCharacter()?.id;
  const onItem = item => { if (item?.type === 'condition' && mine(item.parent)) setTimeout(() => refresh(), 50); };
  Hooks.on('createItem', onItem); Hooks.on('deleteItem', onItem); Hooks.on('updateItem', onItem);
  Hooks.on('updateUser', (u, ch) => { if (u.id === game.user.id && 'character' in ch) refresh(true); });
  Hooks.on('controlToken', () => refresh()); Hooks.on('canvasReady', () => refresh(true));
  Hooks.on('updateWorldTime', () => refresh());
  setInterval(() => { if (current) refresh(); }, 1000); // on-screen countdown follows a sped-up Banana Watch
  refresh(true);
}
export const drugFxAPI = {preview: previewFx, refresh, active: activeFx, list: () => ORDER.slice()};
