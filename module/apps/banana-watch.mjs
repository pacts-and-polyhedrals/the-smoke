// The Banana Watch: the world clock, always on screen — day, date and time on a smartwatch from Banana (the fruit with
// the bite out of it; the Blower is one of theirs too). The game clock runs while the game is unpaused, at a pace the GM
// sets (real time by default), on Foundry's world time so calendar modules can drive it instead; or it can just show
// real London time. The GM sets the date and time from the watch's crown.
import {NS} from '../config.mjs';
import {watchMinutesRemaining} from '../rules/watch-clock.mjs';

const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = n => String(n).padStart(2, '0');
let host = null, ticker = null, advancer = null, sync = {worldTime: 0, at: Date.now()};

/** The Banana logo: a banana with a bite out of it. */
export const BANANA_SVG = `<svg class="banana-logo" viewBox="0 0 64 64" aria-hidden="true"><defs><mask id="smoke-banana-bite"><rect width="64" height="64" fill="#fff"/><circle cx="60.5" cy="32" r="6.5" fill="#000"/></mask></defs><g mask="url(#smoke-banana-bite)"><path fill="currentColor" d="M5 30C7 50 33 63 50 47C58 39 61 24 55.5 9C51 24 43 36 29 38C19 39.5 11 36.5 5 30Z"/></g><path fill="currentColor" d="M53.2 11.5L56.4 2.6C56.8 1.6 58 1.3 58.8 2L59.6 2.7C60.3 3.3 60.4 4.3 59.9 5L55.6 12.4Z"/></svg>`;

export function registerWatchSettings() {
  const reg = (k, o) => { try { game.settings.register(NS, k, o); } catch (_e) {} };
  reg('clockMode', {name: 'Banana Watch: what time it shows', hint: 'In-game: the shared world clock used by timed conditions (pauses when the game pauses; GM can advance it). Real: London wall time for display ONLY; timed effects remain on the stopped game clock.', scope: 'world', config: true, type: String, default: 'game', choices: {game: 'In-game time', real: 'Real London time'}, onChange: () => draw()});
  reg('clockStart', {name: 'Banana Watch: when the game clock starts', hint: 'The date and time at world time zero (YYYY-MM-DDTHH:MM). The GM can set the time from the watch\'s crown instead.', scope: 'world', config: true, type: String, default: '2026-10-12T09:00', onChange: () => draw()});
  reg('clockRate', {name: 'Banana Watch: game clock speed', hint: 'Game seconds for every real second while the game is unpaused. 1 = real time; 6 = an hour every ten minutes; 60 = an hour a minute; 0 = stopped (set it by hand from the crown).', scope: 'world', config: true, type: Number, default: 1, range: {min: 0, max: 60, step: 1}});
  reg('clockAdvance', {name: 'Banana Watch: The Smoke runs the clock', hint: 'Off if a calendar module advances world time instead: the watch still shows it.', scope: 'world', config: true, type: Boolean, default: true});
  reg('bananaWatch', {name: 'Banana Watch on screen', hint: 'Show the world clock (this browser only).', scope: 'client', config: true, type: Boolean, default: true, onChange: () => draw(true)});
  reg('bananaWatchPos', {scope: 'client', config: false, type: Object, default: {}});
  reg('bananaWatchMini', {scope: 'client', config: false, type: Boolean, default: false});
}

/* ------------------------------------------------------------------ time */
const startMs = () => { const s = String(setting('clockStart', '2026-10-12T09:00')).trim(); const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.length <= 16 ? `${s}:00` : s}Z`); return Number.isFinite(t) ? t : Date.parse('2026-10-12T09:00:00Z'); };
/** World time in seconds, smoothed between the leader's updates. */
export function worldSeconds() {
  const wt = Number(game.time?.worldTime ?? 0);
  if (wt !== sync.worldTime) sync = {worldTime: wt, at: Date.now()};
  const running = setting('clockAdvance', true) && !game.paused && Number(setting('clockRate', 1)) > 0;
  return wt + (running ? Math.min(15, (Date.now() - sync.at) / 1000) * Number(setting('clockRate', 1)) : 0);
}
/** The clock's reading as plain parts: {day, date, month, year, hours, minutes, seconds, night}. */
export function clockNow(now = Date.now()) {
  if (setting('clockMode', 'game') === 'real') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(now)).map(p => [p.type, p.value]));
    const hours = Number(parts.hour);
    return {day: String(parts.weekday).toUpperCase(), date: Number(parts.day), month: String(parts.month).toUpperCase().slice(0, 3), year: Number(parts.year), hours, minutes: Number(parts.minute), seconds: Number(parts.second), night: hours < 6 || hours >= 19, real: true};
  }
  const d = new Date(startMs() + worldSeconds() * 1000), hours = d.getUTCHours();
  return {day: DAYS[d.getUTCDay()], date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), hours, minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds(), night: hours < 6 || hours >= 19, real: false};
}
export const clockText = (c = clockNow()) => `${c.day.slice(0, 3)} ${c.date} ${c.month} · ${pad(c.hours)}:${pad(c.minutes)}`;
/** Convert an authoritative world-time expiry to a Banana Watch date/time label (even in Real London display mode). */
export function gameClockAt(seconds) {
  const d = new Date(startMs() + Number(seconds) * 1000);
  return `${DAYS[d.getUTCDay()].slice(0,3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/* ------------------------------------------------------------------ the watch */
function ensure() {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!setting('bananaWatch', true)) { host?.remove(); host = null; return null; }
  if (host?.isConnected) return host;
  host = document.createElement('div'); host.id = 'smoke-banana-watch'; host.className = 'smoke-watch';
  host.innerHTML = `<div class="sw-strap top"></div><div class="sw-case"><div class="sw-crown" title="${game.user?.isGM ? 'Set the clock' : 'Banana Watch'}"></div><div class="sw-button"></div>
    <div class="sw-screen"><svg class="sw-ring" viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="46"/><circle class="sec" cx="50" cy="50" r="46" pathLength="60"/></svg>
      <div class="sw-top">${BANANA_SVG}<span class="sw-loc">LONDON</span><i class="sw-sky fa-solid fa-sun"></i></div>
      <div class="sw-time"><span class="h">00</span><span class="colon">:</span><span class="m">00</span><span class="s">00</span></div>
      <div class="sw-day">MONDAY</div><div class="sw-date">12 OCT 2026</div>
      <div class="sw-mode"></div></div></div><div class="sw-strap bottom"></div>`;
  document.body.append(host);
  const pos = setting('bananaWatchPos', {}) || {};
  if (Number.isFinite(pos.left)) { host.style.left = `${pos.left}px`; host.style.top = `${pos.top}px`; host.style.right = 'auto'; }
  host.classList.toggle('mini', Boolean(setting('bananaWatchMini', false)));
  host.querySelector('.sw-crown').addEventListener('click', ev => { ev.stopPropagation(); if (game.user.isGM) setClockDialog().catch(e => ui.notifications.warn(e.message)); });
  host.querySelector('.sw-screen').addEventListener('dblclick', () => { const mini = !host.classList.contains('mini'); host.classList.toggle('mini', mini); game.settings.set(NS, 'bananaWatchMini', mini).catch(() => null); });
  for (const strap of host.querySelectorAll('.sw-strap')) strap.addEventListener('pointerdown', ev => {
    ev.preventDefault(); const r = host.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top;
    const move = e => { host.style.left = `${Math.max(0, Math.min(innerWidth - 60, e.clientX - dx))}px`; host.style.top = `${Math.max(0, Math.min(innerHeight - 60, e.clientY - dy))}px`; host.style.right = 'auto'; };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); const b = host.getBoundingClientRect(); game.settings.set(NS, 'bananaWatchPos', {left: Math.round(b.left), top: Math.round(b.top)}).catch(() => null); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  });
  return host;
}
/** Redraw the watch (and anything else showing the time, like the Blower's status bar). */
export function draw(rebuild = false) {
  if (rebuild && host) { host.remove(); host = null; }
  const c = clockNow(), h = ensure();
  if (typeof document !== 'undefined') document.querySelectorAll('[data-smoke-clock]').forEach(n => { n.textContent = n.dataset.smokeClock === 'full' ? clockText(c) : `${pad(c.hours)}:${pad(c.minutes)}`; });
  if (typeof document !== 'undefined') document.querySelectorAll('[data-smoke-condition-expiry]').forEach(n => {
    const mins = watchMinutesRemaining(n.dataset.smokeConditionExpiry, worldSeconds());
    if (mins !== null) n.textContent = `${mins} watch min`;
  });
  if (!h) return;
  h.querySelector('.h').textContent = pad(c.hours); h.querySelector('.m').textContent = pad(c.minutes); h.querySelector('.s').textContent = pad(c.seconds);
  h.querySelector('.sw-day').textContent = c.day; h.querySelector('.sw-date').textContent = `${c.date} ${c.month} ${c.year}`;
  h.querySelector('.sec').style.strokeDasharray = `${c.seconds + 1} 60`;
  const sky = h.querySelector('.sw-sky'); sky.classList.toggle('fa-sun', !c.night); sky.classList.toggle('fa-moon', c.night);
  h.classList.toggle('night', c.night);
  h.querySelector('.sw-mode').textContent = c.real ? 'REAL TIME' : game.paused || !Number(setting('clockRate', 1)) ? 'PAUSED' : Number(setting('clockRate', 1)) === 1 ? '' : `×${setting('clockRate', 1)}`;
}
/** GM: set the clock to a date and time, or nudge it. */
export async function setClockDialog() {
  if (!game.user.isGM) throw new Error('Only the GM sets the clock.');
  const c = clockNow(), iso = `${c.year}-${pad(MONTHS.indexOf(c.month) + 1)}-${pad(c.date)}T${pad(c.hours)}:${pad(c.minutes)}`;
  const form = await foundry.applications.api.DialogV2.input({window: {title: 'Banana Watch · set the clock', icon: 'fa-solid fa-clock'}, content: `<div class="the-smoke smoke-roll-dialog">
    <label>Date and time <input type="datetime-local" name="when" value="${iso}"></label>
    <label>Or move it on <select name="jump"><option value="0">—</option><option value="900">+15 minutes</option><option value="3600">+1 hour</option><option value="21600">+6 hours</option><option value="86400">+1 day (next morning)</option><option value="604800">+1 week</option></select></label>
    <label>Clock speed (game seconds per real second) <input type="number" name="rate" min="0" max="60" step="1" value="${setting('clockRate', 1)}"></label>
    <p class="smoke-dim">The clock only runs while the game is unpaused. Speed 0 stops it.</p></div>`, ok: {label: 'Set the time', icon: 'fa-solid fa-clock'}});
  if (!form) return;
  const jump = Number(form.jump || 0);
  if (jump) await game.time.advance(jump);
  else if (form.when && form.when !== iso) { const target = Date.parse(`${form.when}:00Z`); if (Number.isFinite(target)) await game.time.advance((target - (startMs() + worldSeconds() * 1000)) / 1000); }
  if (Number(form.rate) !== Number(setting('clockRate', 1))) await game.settings.set(NS, 'clockRate', Math.max(0, Math.min(60, Number(form.rate) || 0)));
  draw();
}

export function installWatch() {
  draw(true);
  Hooks.on('updateWorldTime', () => { sync = {worldTime: Number(game.time?.worldTime ?? 0), at: Date.now()}; draw(); });
  Hooks.on('pauseGame', () => { sync = {worldTime: Number(game.time?.worldTime ?? 0), at: Date.now()}; draw(); });
  if (ticker) clearInterval(ticker); ticker = setInterval(() => { try { draw(); } catch (_e) {} }, 1000);
  // the leader GM moves the game clock on while the game runs
  if (advancer) clearInterval(advancer);
  let last = Date.now();
  advancer = setInterval(() => {
    const now = Date.now(), dt = (now - last) / 1000; last = now;
    const leader = game.users?.activeGM?.id === game.user?.id;
    if (!leader || game.paused || setting('clockMode', 'game') !== 'game' || !setting('clockAdvance', true)) return;
    const rate = Number(setting('clockRate', 1)); if (!(rate > 0)) return;
    game.time.advance(Math.round(dt * rate)).catch?.(() => null);
  }, 10000);
}
export const watchAPI = {now: clockNow, text: clockText, set: setClockDialog, draw, logo: BANANA_SVG};
