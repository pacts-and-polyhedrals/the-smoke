// The chase and driving switches, shared by Street Control and the Blower (0.5.25). 0.5.1 had a "Police chases" card
// on the Blower and chase toggles in Street Control; later merges kept the settings but dropped every control for
// them, so they could only be found in Foundry's Configure Settings. These put them back where they were.
import {NS} from '../config.mjs';
import {chaseAPI} from '../world/chase.mjs';
import {canSetChases} from '../world/chase-state.mjs';

const get = (k, d) => { try { const v = game.settings.get(NS, k); return v ?? d; } catch (_e) { return d; } };

/** Context for the switches, or null when this user may not change them. */
export function chaseControlsContext(user = game.user) {
  if (!canSetChases(user)) return null;
  const mode = get('chaseMode', 'full'), traffic = get('chaseTrafficMode', 'shared');
  return {
    autoChase: Boolean(get('autoChase', true)), autoEvade: Boolean(get('autoEvade', true)), autoDriveChecks: Boolean(get('autoDriveChecks', false)),
    modes: [['full', 'Full Auto', 'The police and traffic drive themselves; rounds move on when every player has chosen.'],
      ['assisted', 'Assisted', 'The AI takes each NPC turn, then pauses for the GM to review and continue.'],
      ['manual', 'Manual', 'The GM runs every police unit and car from the Combat Console.']].map(([key, label, hint]) => ({key, label, hint, on: key === mode})),
    traffic: [['shared', 'Shared traffic phase'], ['individual', 'Traffic rolls its own dice']].map(([key, label]) => ({key, label, on: key === traffic})),
    summary: chaseAPI.summary?.().lines ?? []
  };
}
/** Wire the buttons inside `root`. Each change goes through the leader (chase.settings), which posts a card. */
export function wireChaseControls(root, after = () => {}) {
  const act = (sel, fn) => root?.querySelectorAll?.(sel).forEach(n => n.addEventListener('click', ev => {
    ev.preventDefault(); Promise.resolve(fn(n)).then(after).catch(err => ui.notifications.warn(err.message));
  }));
  act('[data-chase-switch]', n => { const k = n.dataset.chaseSwitch; return chaseAPI.settings({[k]: !get(k, k === 'autoDriveChecks' ? false : true)}); });
  act('[data-chase-default-mode]', n => chaseAPI.settings({chaseMode: n.dataset.chaseDefaultMode}));
  act('[data-chase-traffic]', n => chaseAPI.settings({chaseTrafficMode: n.dataset.chaseTraffic}));
}
/** Re-render `app` whenever any of the switches change (settings sync to every client). */
export function rerenderOnChaseSettings(app) {
  const keys = ['autoChase', 'chaseMode', 'chaseTrafficMode', 'autoEvade', 'autoDriveChecks'].map(k => `${NS}.${k}`);
  const id = Hooks.on('updateSetting', s => { if (keys.includes(s?.key) && app.rendered) app.render(); });
  return () => Hooks.off('updateSetting', id);
}
