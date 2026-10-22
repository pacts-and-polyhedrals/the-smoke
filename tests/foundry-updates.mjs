// Foundry document updates merge object fields; absent keys are retained.
// A nested -=key update removes a key. Arrays and scalar values replace.
const plain = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const clone = v => v === undefined ? undefined : structuredClone(v);
function field(target, key, value) {
  if (key.startsWith('-=')) { delete target[key.slice(2)]; return; }
  if (plain(value)) {
    if (!plain(target[key])) target[key] = {};
    for (const [k,v] of Object.entries(value)) field(target[key],k,v);
  } else target[key] = clone(value);
}
export function applyDocumentUpdate(doc, update) {
  for (const [path,value] of Object.entries(update)) {
    if (path === '_id') continue;
    const keys=path.split('.'); let parent=doc;
    for(const key of keys.slice(0,-1)) { if(!plain(parent[key]))parent[key]={};parent=parent[key]; }
    field(parent,keys.at(-1),value);
  }
}
export function flagDocument(doc) {
  return Object.assign(doc, {
    getFlag(ns,key) { return key.split('.').reduce((o,k)=>o?.[k],this.flags?.[ns]); },
    async setFlag(ns,key,value) { applyDocumentUpdate(this,{[`flags.${ns}.${key}`]:value});return this; },
    async unsetFlag(ns,key) { const parts=key.split('.'),last=parts.pop();applyDocumentUpdate(this,{[`flags.${ns}.${parts.length?parts.join('.')+'.':''}-=${last}`]:null});return this; }
  });
}
