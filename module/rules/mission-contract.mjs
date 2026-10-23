// Mission contracts are pure data/rules. Runtime event producers, not a player's checkbox,
// supply receipts. Kept separate from Foundry documents so every mission and crew size can be tested.
export const MISSION_CONTRACT_VERSION = 1;
const copy = x => JSON.parse(JSON.stringify(x));
export function compileMission(m, contract) {
  if (!contract) throw new Error(`Missing mission contract: ${m.id}`);
  const out = copy(m);
  out.automation = copy(contract);
  out.objectives = m.objectives.map(o => {
    const c = contract.steps[o.id];
    if (!c || !c.locations?.length) throw new Error(`${m.id}/${o.id}: missing location or contract.`);
    const auto = ['roll','dialogue','choice','race'].includes(c.mode)
      ? {on:'checkpoint',stepId:o.id}
      : c.mode === 'arrival' ? {on:'checkpointArrival',stepId:o.id}
      : {...(o.auto || {}), ...(c.event ? {on:c.event} : {})};
    if (!auto.on) throw new Error(`${m.id}/${o.id}: missing automatic event.`);
    return {...copy(o), auto, checkpoint:copy(c)};
  });
  out.props = (m.props || []).map(p => ({...copy(p), ...(contract.props?.[p.id] || {})}));
  return out;
}
export function scaledCount(rule, crew, fallback=1) {
  const n = Math.max(1, Math.min(6, Math.trunc(Number(crew)||1)));
  if (rule === 'crewMin2') return Math.max(2,n);
  if (rule === 'crew') return n;
  if (rule === 'halfCrew') return Math.max(1,Math.ceil(n/2));
  return Math.max(1, Math.trunc(Number(rule)||Number(fallback)||1));
}
export function requirementsFor(m, actorIds, previous={}) {
  return Object.fromEntries(m.objectives.map(o => [o.id, Math.max(
    Number(previous.ticks?.[o.id]||0),
    scaledCount(o.checkpoint?.scale,actorIds.length,o.auto?.count || 1)
  )]));
}
export function checkpointNeeded(o,s) { return Math.max(1,Number(s?.requirements?.[o.id] ?? o.auto?.count ?? 1)); }
export function branchState(o,s) {
  const when=o.checkpoint?.when;
  if (!when) return 'selected';
  const selected=s?.choices?.[when.key];
  if (selected == null) return 'pending';
  return selected === when.value ? 'selected' : 'excluded';
}
export function checkpointDone(o,s) {
  return branchState(o,s)==='excluded' || Number(s?.ticks?.[o.id]||0)>=checkpointNeeded(o,s);
}
export function checkpointReady(m,o,s,ticks=s?.ticks) {
  if (branchState(o,s)!=='selected') return false;
  return (o.checkpoint?.requires||[]).every(id => {
    const other=m.objectives.find(x=>x.id===id);
    return Boolean(other && checkpointDone(other,{...s,ticks}));
  });
}
export function contributionMissing(s) {
  if (s?.automationVersion !== MISSION_CONTRACT_VERSION) return [];
  return (s.actorIds||[]).filter(id=>!Object.keys(s.contributions?.[id]||{}).length);
}
export function allCheckpointsDone(m,s) {
  // 0.5.27: a placement problem or progress carried over from an older build never holds the crew up.
  return Boolean(s && m.objectives.every(o=>checkpointDone(o,s)) && !contributionMissing(s).length);
}
export function atAnchor(point,anchor) {
  if (!point || point.mapId!==anchor?.mapId) return false;
  if (point.zoneIds?.includes(anchor.zoneId)) return true;
  const [x,y,w,h]=anchor.rect||[anchor.x,anchor.y,0,0];
  const dx=Math.max(x-point.x,0,point.x-(x+w)), dy=Math.max(y-point.y,0,point.y-(y+h));
  // Entry is into the authored zone, not anywhere on its parent street.
  return Math.hypot(dx,dy)<=Math.max(0,Number(anchor.marginSquares||0))*Number(point.grid||100);
}
export function locationMatches(c,ev) {
  return (c?.locations||[]).some(a=>atAnchor(ev.location,a));
}
/** The fence a sale anchor stands for: Pat buys bikes at The Arches; Bow Breakers takes motors. */
export function fenceOfAnchor(a) {
  if (a?.mapId === 'LDP-ARCHES' || /arches/i.test(a?.zoneId || '')) return 'gang';
  if (/bow-breakers|breakers/i.test(`${a?.zoneId || ''} ${a?.name || ''}`)) return 'chop';
  return null;
}
/**
 * 0.5.27: where a receipt may come from. Most checkpoints happen in their authored place. Three don't:
 *  - getting some wheels: everyone aboard a vehicle — any vehicle, shared or not — wherever they climbed in;
 *  - nicking a mission target: the target's own serial proves it, wherever it had got to (a moving van);
 *  - a sale: at the right fence, inside its yard or pulled up outside it (that is where the fence buys).
 */
export function locationRelaxed(o, ev) {
  const on = o?.auto?.on, c = o?.checkpoint;
  if (on === 'boarded' && ev.on === 'boarded') return true;
  if (on === 'vehicleNicked' && ev.on === 'vehicleNicked' && c?.targetGroup && ev.targetSerial) return true;
  if (on === 'sold' && ev.on === 'sold' && ev.service) return (c?.locations || []).some(a => fenceOfAnchor(a) === ev.service);
  // Painting, the radio contact and mission cargo check their own place on the GM (beside that wall, that contact,
  // that parcel, inside the handover area) and the event names the site, station or parcel, so the paint counts where
  // the wall actually is, not where an older anchor said it would be.
  if (['tagPlaced', 'radioWar', 'cargoCollected', 'cargoDelivered'].includes(on) && ev.on === on) return true;
  return false;
}
export function receiptKey(ev) {
  // Boarding is personal: four of you in one car is four people with wheels, not one vehicle counted once.
  if (ev.on === 'boarded' && ev.actorId) return `boarded:${ev.actorId}`;
  // A serial remains one object through cross-map transfers and drop/recollect cycles.
  if (ev.serial) return `${ev.on}:${ev.serial}`;
  if (ev.targetSerial) return `${ev.on}:${ev.targetSerial}`;
  return ev.proofId || ev.messageId || ev.attemptId || ev.markId || null;
}
export function canAcceptReceipt(m,o,s,ev,oldTicks=s?.ticks) {
  if (s?.automationVersion !== MISSION_CONTRACT_VERSION) return true;
  if (ev.missionId!==m.id || ev.missionRunId!==s.runId || ev.verified!==true) return false;
  if (!s.actorIds?.includes(ev.actorId)) return false;
  if (!checkpointReady(m,o,s,oldTicks)) return false;
  if (ev.stepId && ev.stepId!==o.id) return false;
  const c=o.checkpoint;
  if (c.targetGroup && c.targetGroup!==ev.targetGroup && o.auto?.on!=='boarded') return false;   // any vehicle is "some wheels"
  if (!locationMatches(c,ev) && !locationRelaxed(o,ev)) return false;
  if (c.mode==='roll' && ev.success!==true) return false;
  if (c.mode==='choice' && !(c.choices||[]).some(x=>(x.value??x.id)===ev.choice)) return false;
  const k=receiptKey(ev);
  if (!k || (s.receipts?.[o.id]||[]).some(r=>r.key===k)) return false;
  return true;
}
export function recordReceipt(o,s,ev) {
  const r={key:receiptKey(ev),actorId:ev.actorId,on:ev.on,stepId:o.id,
    sceneId:ev.sceneId||null,mapId:ev.location?.mapId||ev.mapId||null,
    zoneId:ev.location?.zoneIds?.[0]||ev.zoneId||null,messageId:ev.messageId||null,
    targetSerial:ev.targetSerial||ev.serial||null,worldTime:Number(ev.worldTime||0),choice:ev.choice||null};
  s.receipts={...(s.receipts||{}),[o.id]:[...(s.receipts?.[o.id]||[]),r]};
  if(o.checkpoint?.mode!=='arrival'){
    s.contributions??={};s.contributions[ev.actorId]??={};s.contributions[ev.actorId][r.key]={stepId:o.id,worldTime:r.worldTime};
  }
  if(o.checkpoint?.mode==='choice' && o.checkpoint.choiceKey){
    s.choices={...(s.choices||{}),[o.checkpoint.choiceKey]:ev.choice};
  }
  return r;
}
export function validateContract(m,contract) {
  const errors=[];const ids=new Set(m.objectives.map(o=>o.id));
  if(contract?.id!==m.id)errors.push('Mission ID mismatch');
  for(const o of m.objectives){const c=contract?.steps?.[o.id];
    if(!c?.locations?.length)errors.push(`${o.id}: missing location`);
    for(const a of c?.locations||[])if(!a.mapId||!a.zoneId||!Array.isArray(a.rect)||a.rect.length!==4)errors.push(`${o.id}: invalid anchor`);
    for(const id of c?.requires||[])if(!ids.has(id)||id===o.id)errors.push(`${o.id}: invalid prerequisite ${id}`);
    if(c?.mode==='choice' && !(c.choices?.length>=2))errors.push(`${o.id}: needs choices`);
  }
  const visit=(id,path=[])=>{if(path.includes(id)){errors.push(`Prerequisite cycle: ${[...path,id].join(' > ')}`);return;}
    for(const parent of contract?.steps?.[id]?.requires||[])if(ids.has(parent))visit(parent,[...path,id]);};
  for(const id of ids)visit(id);
  return [...new Set(errors)];
}
