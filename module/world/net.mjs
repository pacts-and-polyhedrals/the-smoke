// One request channel for open-world actions. Every scene write happens on one active GM (the leader);
// players ask over the socket and the leader checks they are allowed.
import {SOCKET} from '../config.mjs';
const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
export const leaderGM = () => game.users.activeGM ?? game.users.filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
export const isLeader = () => leaderGM()?.id === game.user.id;
const HANDLERS = new Map();
const pendingRequests = new Map();
export function registerHandler(type, fn) { HANDLERS.set(type, fn); }
let commands=Promise.resolve();
/** How long one world action may hold the queue before the next one is let through (it keeps running). */
let QUEUE_STALL_MS=45000;
/** For the tests (and a GM who needs it): how long one world action may hold the queue. */
export function setQueueStallMs(ms){QUEUE_STALL_MS=Math.max(50,Number(ms)||45000);return QUEUE_STALL_MS;}
export function dispatch(type,data){
 const fn=HANDLERS.get(type);if(!fn)return Promise.reject(new Error('Unknown world action.'));
 const next=commands.catch(()=>{}).then(()=>fn(data));
 // A handler that never settles (a lost socket reply, a document write that hangs) must not freeze every later
 // world action for the rest of the session: after QUEUE_STALL_MS the queue moves on and the GM is told which one.
 let timer=null;
 const released=new Promise(resolve=>{timer=setTimeout(()=>{console.warn(`The Smoke | world action "${type}" is still running after ${QUEUE_STALL_MS/1000}s; letting the next action through.`);resolve();},QUEUE_STALL_MS);});
 commands=Promise.race([next.catch(()=>{}),released]).finally(()=>clearTimeout(timer));
 return next;
}
const NOTIFY_LEVELS=new Set(['info','warn','error']);

/** Run `type` on the leader GM. Resolves with the handler's result when this client is the leader. */
export async function request(type, data = {}) {
  const payload = {...data, userId: game.user.id};
  if (isLeader()) return dispatch(type,payload);
  if (!leaderGM()) throw new Error('A GM must be connected for that.');
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingRequests.delete(requestId); reject(new Error('The GM did not answer. Check the connection before trying again.')); }, 30000);
    pendingRequests.set(requestId, {resolve, reject, timer, gmId: leaderGM().id});
    game.socket.emit(SOCKET, {type: `smokeWorld.${type}`, requestId, data: payload});
  });
}
/** Leader replies travel over the socket as plain data: documents become {id, uuid}. */
export function wire(value, depth = 0) {
  if (value == null || depth > 6) return value ?? null;
  const Doc = globalThis.foundry?.abstract?.Document;
  if (Doc && value instanceof Doc) return {id: value.id, uuid: value.uuid};
  if (Array.isArray(value)) return value.map(v => wire(v, depth + 1));
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wire(v, depth + 1)]));
    try { return JSON.parse(JSON.stringify(value)); } catch (_e) { return null; }
  }
  return typeof value === 'function' ? null : value;
}
export function installNet() {
  game.socket.on(SOCKET, async payload => {
    const t = String(payload?.type || '');
    if (t === 'smokeWorld.result') {
      if (payload.toUserId !== game.user.id) return;
      const pending = pendingRequests.get(payload.requestId);
      if (!pending || payload.gmId !== pending.gmId) return;
      clearTimeout(pending.timer); pendingRequests.delete(payload.requestId);
      if (payload.error) pending.reject(new Error(payload.error)); else pending.resolve(payload.result);
      return;
    }
    if (t === 'smokeWorld.notify') { if (!payload.data?.userIds || payload.data.userIds.includes(game.user.id)) ui.notifications[NOTIFY_LEVELS.has(payload.data?.level) ? payload.data.level : 'info'](String(payload.data?.text ?? '')); return; }
    if (t === 'smokeWorld.view') { if (payload.data?.userIds?.includes(game.user.id)) game.scenes.get(payload.data.sceneId)?.view(); return; }
    if (t === 'smokeWorld.combatConsole') { if (canvas?.scene?.id === payload.data?.sceneId) game.smoke?.openCombat?.(); return; }
    if (!t.startsWith('smokeWorld.') || !isLeader()) return;
    const fn = HANDLERS.get(t.slice(11)); if (!fn) return;
    const reply = value => { if (payload.requestId) game.socket.emit(SOCKET, {type:'smokeWorld.result', requestId:payload.requestId, toUserId:payload.data?.userId, gmId:game.user.id, ...value}); };
    try { const result = await dispatch(t.slice(11),payload.data || {}); reply({result:wire(result)}); } catch (error) {
      console.warn('The Smoke | request refused', t, error);
      if (payload.requestId) reply({error:error.message}); else notify(error.message, {userIds: [payload.data?.userId], level: 'warn'});
    }
  });
}
export function notify(text, {userIds = null, level = 'info'} = {}) {
  if (!NOTIFY_LEVELS.has(level)) level = 'info';
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
