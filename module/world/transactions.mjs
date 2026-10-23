// Durable, actor-scoped operation receipts. Foundry has no cross-document transaction:
// every stage records enough identity to resume after a failed write without paying twice.
// A retry uses the same id and payload; conflicting reuse fails instead of silently succeeding.
import {NS} from '../config.mjs';
import {worldSeconds} from './action-locks.mjs';
export const OP_FLAG='operations';
export const opId = value => {
  const id=String(value||'');if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw new Error('A valid transaction reference is required. Reopen the action.');return id;
};
export const newOperationId=()=>foundry.utils.randomID(20);
export const receiptFor=(actor,id)=>actor.getFlag?.(NS,OP_FLAG)?.[id]||null;
export function sameOperation(old,kind,signature){
  if(old&&(old.kind!==kind||old.signature!==signature))throw new Error('That transaction reference belongs to another action.');return old;
}
export async function beginOperation(actor,id,kind,signature,{cost=0,plan={},patch={}}={}){
  id=opId(id);const old=sameOperation(receiptFor(actor,id),kind,signature);if(old)return old;
  const pending=Object.entries(actor.getFlag?.(NS,OP_FLAG)||{}).find(([,v])=>v.status==='pending');
  if(pending)throw new Error(`Finish or recover transaction ${pending[0]} before starting another action.`);
  if(!Number.isFinite(cost)||cost<0)throw new Error('Invalid transaction cost.');
  const cash=Number(actor.system.cash||0);if(cash<cost)throw new Error(`You need GBP ${cost}; you have GBP ${cash}.`);
  const rec={kind,signature,status:'pending',cost,plan,startedAt:worldSeconds(),stages:{}};
  await actor.update({...patch,...(cost?{'system.cash':cash-cost}:{}),[`flags.${NS}.${OP_FLAG}.${id}`]:rec});return receiptFor(actor,id)||rec;
}
export async function stageOperation(actor,id,stage,value=true){
  await actor.update({[`flags.${NS}.${OP_FLAG}.${opId(id)}.stages.${stage}`]:value});return receiptFor(actor,id);
}
export async function completeOperation(actor,id,result,patch={}){
  const rec=receiptFor(actor,id);if(!rec)throw new Error('Transaction receipt is missing.');
  if(rec.status==='done')return rec.result;
  await actor.update({...patch,[`flags.${NS}.${OP_FLAG}.${id}.status`]:'done',[`flags.${NS}.${OP_FLAG}.${id}.completedAt`]:worldSeconds(),[`flags.${NS}.${OP_FLAG}.${id}.result`]:result});return result;
}
/** Create each unit once. Do not stack across unrelated receipts: identity survives a partial create. */
export async function issueOnce(actor,id,documents){
  const result=[];
  for(let index=0;index<documents.length;index++){
    let item=actor.items.find(i=>{const f=i.getFlag?.(NS,'issuedBy');return f?.operationId===id&&f.index===index;});
    if(!item){const d=foundry.utils.deepClone(documents[index]);delete d._id;d.flags??={};d.flags[NS]??={};d.flags[NS].issuedBy={operationId:id,index,actorId:actor.id};[item]=await actor.createEmbeddedDocuments('Item',[d]);}
    result.push(item);
  }
  return result;
}
/** Inventory charge and consumption marker share one Item update. A zero stack remains until completion. */
export async function consumeOnce(item,id,quantity=1){
  if(item.getFlag?.(NS,'spentBy')?.[id])return;
  const n=Number(item.system.quantity??1);if(!Number.isInteger(quantity)||quantity<0||n<quantity)throw new Error('Not enough of that item remains.');
  await item.update({'system.quantity':n-quantity,[`flags.${NS}.spentBy.${opId(id)}`]:quantity||true});
}
/** Effect and receipt live in the same target Document update. */
export async function effectOnce(target,id,patch){
  if(target.getFlag?.(NS,'effectsBy')?.[id])return false;
  await target.update({...patch,[`flags.${NS}.effectsBy.${opId(id)}`]:{at:worldSeconds()}});return true;
}
/** The actor update and clock update cannot be atomic. Store an absolute target, never re-add duration. */
export async function advanceOperationClock(actor,id,seconds){
  if(!seconds)return;let rec=receiptFor(actor,id);let target=rec?.stages?.clockTarget;
  if(target==null){target=worldSeconds()+seconds;await stageOperation(actor,id,'clockTarget',target);}
  if(worldSeconds()<target)await game.time.advance(target-worldSeconds());
  await stageOperation(actor,id,'clockDone',true);
}
