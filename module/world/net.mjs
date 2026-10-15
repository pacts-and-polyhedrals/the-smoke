// One request channel for open-world actions. Every scene write happens on one active GM (the leader);
// players ask over the socket and the leader checks they are allowed.
import {NS, SOCKET} from '../config.mjs';
const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
export const leaderGM = () => game.users.activeGM ?? game.users.filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
export const isLeader = () => leaderGM()?.id === game.user.id;
const HANDLERS = new Map();
export function registerHandler(type, fn) { HANDLERS.set(type, fn); }

/** Run `type` on the leader GM. Resolves with the handler's result when this client is the leader. */
export async function request(type, data = {}) {
  const payload = {...data, userId: game.user.id};
  if (isLeader()) return HANDLERS.get(type)?.(payload);
  if (!leaderGM()) throw new Error('A GM must be connected for that.');
  game.socket.emit(SOCKET, {type: `smokeWorld.${type}`, data: payload});
  return null;
}
export function installNet() {
  game.socket.on(SOCKET, async payload => {
    const t = String(payload?.type || '');
    if (t === 'smokeWorld.notify') { if (!payload.data?.userIds || payload.data.userIds.includes(game.user.id)) ui.notifications[payload.data.level || 'info'](payload.data.text); return; }
    if (t === 'smokeWorld.view') { if (payload.data?.userIds?.includes(game.user.id)) game.scenes.get(payload.data.sceneId)?.view(); return; }
    if (!t.startsWith('smokeWorld.') || !isLeader()) return;
    const fn = HANDLERS.get(t.slice(11)); if (!fn) return;
    try { await fn(payload.data || {}); } catch (error) {
      console.warn('The Smoke | request refused', t, error);
      notify(error.message, {userIds: [payload.data?.userId], level: 'warn'});
    }
  });
}
export function notify(text, {userIds = null, level = 'info'} = {}) {
  if (!userIds || userIds.includes(game.user.id)) ui.notifications[level](text);
  game.socket.emit(SOCKET, {type: 'smokeWorld.notify', data: {text, userIds, level}});
}
export function sendToScene(sceneId, userIds) { game.socket.emit(SOCKET, {type: 'smokeWorld.view', data: {sceneId, userIds}}); }
export const ownersOf = actor => game.users.filter(u => !u.isGM && actor?.testUserPermission?.(u, 'OWNER')).map(u => u.id);
export function card(kicker, title, body, cls = '', extra = {}) {
  return ChatMessage.implementation.create({speaker: extra.speaker ?? {alias: extra.alias ?? 'The Smoke'}, whisper: extra.whisper,
    content: `<section class="smoke-card ${cls}"><header><span class="kicker">${esc(kicker)}</span><strong>${esc(title)}</strong></header>${body}</section>`, flags: extra.flags});
}
export {esc};
