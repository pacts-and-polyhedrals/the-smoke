// Venue policy is data; it does not itself prove that a purchase or admission took place.
let required=false,ready=false,error=null;
const registry=new Map();let itemContracts=new Map();
export const requireVenues=()=>{required=true;};
export const venueStatus=()=>({required,ready,error});
export function configureVenues(data,baseShops={}){
  const next=new Map();
  for(const p of data.profiles||[]){
    if(!p.key||next.has(p.key)||!p.mapId||!p.zoneId||!Array.isArray(p.rect)||p.rect.length!==4)throw new Error(`Invalid or duplicate venue profile ${p.key}`);
    const parent=baseShops[p.inherit]||{};
    next.set(p.key,{...parent,...p,stock:p.stock??parent.stock??[],services:p.services??parent.services??[],hours:p.hours||[0,24]});
  }
  if(new Set([...next.values()].filter(p=>p.mapId.startsWith('LDV-')).map(p=>p.mapId)).size!==160)throw new Error('The venue registry must cover all 160 audited interiors.');
  registry.clear();for(const [key,p]of next)registry.set(key,p);
  itemContracts=new Map((data.itemContracts||[]).map(c=>[c.name,c]));ready=true;error=null;return [...registry.values()];
}
export function failVenues(message){ready=false;error=String(message);}
export const venueProfiles=()=>[...registry.values()];
export const venueProfile=key=>registry.get(key)||null;
export const venueItemContract=name=>itemContracts.get(name)||null;
export function openAt(hours,worldTime){
  const h=((Number(worldTime)/3600)%24+24)%24,[a,b]=hours;
  if(b-a>=24)return true;
  const x=a%24,y=b%24;return y<=x?h>=x||h<y:h>=x&&h<y;
}
export function credentialValid(credential,{actorId,venueId,time,kind=null}){
  return Boolean(credential?.issued&&credential.actorId===actorId&&credential.venueId===venueId&&credential.expiresAt>time&&(!kind||credential.kind===kind)&&!credential.revoked);
}
export function hasVenueAccess(profile,actor,{time=0,missions={},factions={}}={}){
  if(profile.access==='public'||!profile.access)return true;
  const grant=actor.getFlag?.('the-smoke','venueAccess')?.[profile.venueId];
  if(credentialValid(grant,{actorId:actor.id,venueId:profile.venueId,time}))return true;
  if(profile.access==='faction'&&profile.faction&&Number(factions[profile.faction]?.renown||0)>=Number(profile.minRenown||1))return true;
  const codes=new Set(profile.missionCodes||[]);
  return Object.entries(missions).some(([id,s])=>s.status==='active'&&(s.actorIds||[]).includes(actor.id)&&(codes.has(id)||codes.has(s.code)||codes.has(id.toUpperCase())));
}
export function validateVenueCatalog(data,items,maps){
  const names=new Map(items.map(i=>[i.name,i])),byMap=new Map(maps.map(m=>[m.id,m]));const errors=[];
  for(const p of data.profiles||[]){
    const m=byMap.get(p.mapId);if(!m)errors.push(`${p.key}: missing map`);else if(!m.zones.some(z=>z.id===p.zoneId))errors.push(`${p.key}: missing room`);
    for(const l of p.stock||[])for(const n of l.items||[]){const i=names.get(n);if(!i)errors.push(`${p.key}: absent stock ${n}`);else if(i.system.restricted||i.flags?.['the-smoke']?.itemContract?.action==='issued')errors.push(`${p.key}: inappropriate stock ${n}`);}
    if(p.retail==='No'&&(p.stock||[]).some(l=>l.items?.length))errors.push(`${p.key}: non-retail venue sells stock`);
  }
  return errors;
}
