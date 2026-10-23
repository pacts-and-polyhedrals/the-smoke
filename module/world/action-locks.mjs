// Logical locks outlive the network queue's stall timeout. Multi-document Foundry writes
// are NOT a database transaction; callers keep receipts/rollback data where needed.
const tails=new Map();
export async function withActionLocks(keys,fn){
  const ids=[...new Set(keys.filter(Boolean).map(String))].sort();
  const before=ids.map(id=>tails.get(id)||Promise.resolve());
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const settled=Promise.all(before.map(p=>p.catch(()=>{})));
  const tail=settled.then(()=>gate);
  for(const id of ids)tails.set(id,tail);
  await settled;
  try{return await fn();}finally{release();for(const id of ids)if(tails.get(id)===tail)tails.delete(id);}
}
export function boundedInt(value,min,max,label='Amount'){
  const n=Number(value);if(!Number.isFinite(n)||!Number.isInteger(n)||n<min||n>max)throw new Error(`${label} must be a whole number from ${min} to ${max}.`);return n;
}
export const worldSeconds=()=>Number(game.time?.worldTime||0);
