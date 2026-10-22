// A safety valve for the background loops (Street Life traffic, police on the hunt). They write token moves every
// second; if the server or the browser falls behind (a big police response, lots of traffic, a slow connection),
// each tick takes longer than the gap between ticks and the whole table starts to lag — menus stop answering. When a
// loop runs long, it rests for a while so everything can catch up, and the GM is told once why the streets went still.
import {card} from './net.mjs';

const restUntil = new Map(), slowCount = new Map(), told = new Map();
const REST_MS = 15000, TELL_EVERY_MS = 10 * 60 * 1000;
const LABEL = {traffic: 'Street Life traffic', police: 'Police units on the hunt'};
export const slowGuard = {
  /** Is this loop resting just now? */
  resting(loop, now = Date.now()) { return Number(restUntil.get(loop) || 0) > now; },
  /** A tick finished: if it ran well over its interval twice running, rest the loop. */
  took(loop, ms, interval, now = Date.now()) {
    const slow = ms > Math.max(1500, interval * 1.5);
    const n = slow ? (slowCount.get(loop) || 0) + 1 : 0; slowCount.set(loop, n);
    if (n < 2) return false;
    slowCount.set(loop, 0); restUntil.set(loop, now + REST_MS);
    console.warn(`The Smoke | ${LABEL[loop] ?? loop} took ${(ms / 1000).toFixed(1)} s for a ${(interval / 1000).toFixed(0)} s step; resting it for ${REST_MS / 1000} s so the table can catch up.`);
    if (now - Number(told.get(loop) || 0) > TELL_EVERY_MS) {
      told.set(loop, now);
      const gm = globalThis.game?.users?.filter?.(u => u.isGM).map(u => u.id) ?? [];
      void card('SLOW DOWN', `${LABEL[loop] ?? loop} paused for ${REST_MS / 1000} s`, `<p>Each step was taking ${(ms / 1000).toFixed(1)} s — longer than the gap between steps — so the game was falling behind. It picks up again by itself. If this keeps happening, lower <b>Street Life: moving cars per map</b> or <b>Heat: most police vehicles on a map</b> in Settings.</p>`, 'heat', {whisper: gm}).catch(() => null);
    }
    return true;
  },
  reset() { restUntil.clear(); slowCount.clear(); told.clear(); }
};
