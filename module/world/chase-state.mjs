// Where a chase stands, read from the Combat document. No imports beyond the namespace, so anything can use it.
import {NS} from '../config.mjs';
import {isBackgroundTraffic} from './traffic-crew.mjs';

const combatsOf = () => game.combats?.contents ?? (Array.isArray(game.combats) ? game.combats : []);
/** The fight on a scene, if there is one (a chase or a plain fight). */
export const combatOn = scene => scene ? combatsOf().find(c => c.scene?.id === scene.id && c.active) ?? combatsOf().find(c => c.scene?.id === scene.id) ?? null : null;
/** Do not accidentally find an ordinary/stale combat ahead of the active chase. */
export function chaseOf(scene) {
  if (!scene) return null;
  const possible=combatsOf().filter(c=>c.scene?.id===scene.id && c.getFlag?.(NS,'chase') && (c.active || ['intent','resolve'].includes(stateOf(c).phase)));
  const assigned=scene.getFlag?.(NS,'chaseCombatId');
  return possible.find(c=>c.id===assigned)??possible.find(c=>c.active)??possible[0]??null;
}
export const chaseMode = combat => {const c=combat?.getFlag?.(NS,'chase');return ['full','assisted','manual'].includes(c?.mode)?c.mode:c?.auto?'assisted':'manual';};
export const stateOf = combat => combat?.getFlag?.(NS, 'state') ?? {phase: 'idle', round: 0, queue: [], cursor: 0};
/** One action in a fight: which round and which die in the queue. Null between actions. */
export function actionKey(combat) {
  const st = stateOf(combat);
  return combat && st.phase === 'resolve' && st.queue?.[st.cursor] ? `${combat.id}:${st.round}:${st.cursor}` : null;
}
/** The combatant whose die is up now. */
export function currentCombatant(combat) {
  const st = stateOf(combat), e = st.phase === 'resolve' ? st.queue?.[st.cursor] : null;
  return e ? {entry: e, combatant: combat.combatants.get(e.cid) ?? null} : {entry: null, combatant: null};
}
/** The riders list on a vehicle token. */
export const ridersOf = vt => { const raw = vt?.getFlag?.(NS, 'vehicleOccupants'); return Array.isArray(raw) ? raw : []; };
/** The token in a vehicle's driving seat. */
export const pilotOf = vt => { const o = ridersOf(vt).find(r => r.seatId === 'pilot'); return o ? vt.parent?.tokens?.get(o.tokenId) ?? null : null; };
/** The vehicle a token is riding in (or null). */
export const vehicleOf = t => { const s = t?.getFlag?.(NS, 'vehicleSeat'); return s ? t.parent?.tokens?.get(s.vehicleTokenId) ?? null : null; };
/** Is it this vehicle's go: the current die belongs to the vehicle itself or to whoever is driving it. */
export function vehiclesGo(combat, vt) {
  const {combatant} = currentCombatant(combat); if (!combatant || !vt) return false;
  if (combatant.tokenId === vt.id) return true;
  const p = pilotOf(vt); return Boolean(p && combatant.tokenId === p.id);
}
/** The vehicle being driven on the current die, if any. */
export function vehicleNow(combat) {
  const {combatant} = currentCombatant(combat); const t = combatant?.token; if (!t) return null;
  if (t.actor?.type === 'vehicle') return t;
  const vt = vehicleOf(t); return vt && t.getFlag?.(NS, 'vehicleSeat')?.seatId === 'pilot' ? vt : null;
}
/** This action's driving so far for a vehicle: squares moved, the band reached, checks rolled, stopped. */
export function tallyOf(vt, key) {
  const f = vt?.getFlag?.(NS, 'drive');
  return f && key && f.key === key ? {checked: [], ...f} : {key, moved: 0, band: 'green', checked: [], stopped: false};
}

/** Players may run a chase in Self-play, for a character they actually own. */
export function canManageChase(combat, user = game.user) {
  if (user?.isGM) return true;
  if (!user || !combat?.getFlag?.(NS, 'chase')) return false;
  let self = false; try { self = game.settings.get(NS, 'playMode') === 'self'; } catch (_e) {}
  return self && combat.combatants.some(c => c.actor?.type === 'character' && c.actor.testUserPermission?.(user, 'OWNER'));
}
/** Civilian motors share one phase; occupied/player-controlled motors never join the background traffic. */
export function civilianTraffic(scene) {
  return scene?.tokens?.filter(t => t.actor?.type === 'vehicle' && t.getFlag(NS, 'traffic')?.kind === 'moving'
    && !t.getFlag(NS, 'police') && isBackgroundTraffic(t) && !t.actor.hasPlayerOwner && !t.getFlag(NS, 'stolen')
    && !t.actor.system?.vehicle?.destroyed && !t.getFlag(NS, 'fire')) ?? [];
}
export function pendingAttacks(scene, combatId = null) {
  const messages = game.messages?.contents ?? (game.messages?.[Symbol.iterator] ? [...game.messages] : []);
  return messages.filter(m => {
    const attack = m.getFlag?.(NS, 'attack');
    if(!attack || m.getFlag(NS,'resolved'))return false;
    const target=String(attack.target||'');
    if(!target.startsWith(`Scene.${scene.id}.Token.`))return false;
    // Old cards from another encounter must never freeze the present round.
    const linked=m.getFlag(NS,'chaseCombatId');
    // A completed/deleted Combat can leave its old HIT chat message visible. It is historical,
    // not a fresh decision gate on this scene. Keep the card in chat for the GM's audit trail.
    if(linked && !game.combats?.get?.(linked))return false;
    if(combatId && linked && linked!==combatId)return false;
    if(combatId && !linked){
      const when=Number(m.timestamp??m.time??0),combat=game.combats?.get?.(combatId),since=Number(combat?.getFlag?.(NS,'chase')?.since??combat?.timestamp??0);
      if(when&&since&&when<since)return false;
    }
    return true;
  });
}
/** Only this encounter's participating tokens/vehicles can block its queue. */
export function chaseParticipants(combat){
  const ids=new Set((combat?.combatants??[]).map(c=>c.tokenId).filter(Boolean)),scene=combat?.scene;
  if(!scene)return ids;
  for(const t of scene.tokens){
    const seat=t.getFlag?.(NS,'vehicleSeat');
    if(ids.has(t.id)&&seat?.vehicleTokenId)ids.add(seat.vehicleTokenId);
    if(ids.has(seat?.vehicleTokenId)&&seat?.seatId==='pilot')ids.add(t.id);
  }
  return ids;
}
/** Structured blockers give the GM the exact token/roll to review. */
export function pendingResponseDetails(combat){
  const scene=combat?.scene;if(!scene)return [];
  const participants=chaseParticipants(combat),out=[];
  for(const t of scene.tokens){
    const relevant=participants.has(t.id);
    if(relevant)for(const [pid,p] of Object.entries(t.getFlag?.(NS,'prompts')||{})){
      if(p?.context?.key && !String(p.context.key).startsWith(`${combat.id}:`))continue;
      out.push({kind:'drive',tokenId:t.id,tokenName:t.name,pid,messageId:p.messageId??null,status:p.status??'pending',rolled:Boolean(p.result),
        text:`${t.name}: ${p.result?'Recorded driving outcome awaiting GM review':p.kind==='evade'?'Evasive manoeuvre':'Driving check'} (${p.status??'pending'})`});
    }
    const stop=t.getFlag?.(NS,'policeStop');
    if(relevant&&stop&&stop.combatId===combat.id)out.push({kind:'stop',tokenId:t.id,tokenName:t.name,messageId:stop.messageId??null,
      text:`${t.name}: ${stop.status==='escapeMove'?`take the escape move (drag up to ${Math.max(0,Math.floor(Number(stop.max||0)-Number(stop.moved||0)+0.25))} sq, then Done)`:stop.status==='escapeChoice'?'Choose escape method':'answer the police'}`});
  }
  for(const m of pendingAttacks(scene,combat.id)){
    const a=m.getFlag(NS,'attack')||{},target=String(a.target??''),participantsInTarget=[...participants].some(id=>target.includes(`Token.${id}`));
    if(m.getFlag(NS,'chaseCombatId')!==combat.id&&!participantsInTarget)continue;
    out.push({kind:'attack',messageId:m.id,text:`${a.attackerName||'Attack'}: Take hit or Dodge`});
  }
  return out;
}
export const pendingResponses=combat=>pendingResponseDetails(combat).map(p=>p.text);

