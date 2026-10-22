// Pure campaign radio-war rules; no broadcaster is alleged to operate an illegal radio service.
export const RADIO_WAR_ACTIONS=Object.freeze({
  promo:{label:'Put the word about',stat:'frt',band:'medium',minutes:20,description:'Work the crowd, sort posters and get the next show heard.'},
  repair:{label:'Fix the relay',stat:'grf',band:'medium',minutes:30,description:'Patch a receiver, sort the aerial and keep the signal clean.'},
  defend:{label:'Defend the airwaves',stat:'sav',band:'hard',minutes:25,description:'Work out which rival is stealing listeners and win them back.'}
});
export const RADIO_WAR_SCORES=Object.freeze({severeFailure:-2,costlyFailure:-1,narrowSuccess:1,fullSuccess:2,strongSuccess:3,exceptionalSuccess:5});
export const radioWarDay=seconds=>Math.floor(Math.max(0,Number(seconds)||0)/86400);
export const radioWarClaimKey=(stationId,actorId,day)=>`${stationId}:${actorId}:${day}`;
export const radioWarScore=outcome=>RADIO_WAR_SCORES[outcome]??null;
/** Place a fictional street contact by the pavement, not in the middle of an
 * inaccessible 600×900 block. The marker stays inside its named zone, but
 * should be within normal walking distance of an adjacent street or path. */
export function radioContactPosition(zone,zones,grid=100){
 const [x,y,w,h]=zone.rect,mid=[x+w/2,y+h/2],margin=Math.max(8,grid*.20);
 const touching=(zone.adjacent||[]).map(id=>(zones||[]).find(z=>z.id===id))
   .filter(z=>z?.rect&&['road','junction','path','park'].includes(z.kind));
 const candidates=touching.length?touching:(zones||[]).filter(z=>z?.rect&&['road','junction','path'].includes(z.kind));
 const nearest=candidates.map(z=>{const [rx,ry,rw,rh]=z.rect,px=rx+rw/2,py=ry+rh/2;
  const cx=Math.max(x,Math.min(x+w,px)),cy=Math.max(y,Math.min(y+h,py));
  const dx=Math.max(rx-(x+w),x-(rx+rw),0),dy=Math.max(ry-(y+h),y-(ry+rh),0);
  return {x:cx,y:cy,dist:Math.hypot(dx,dy),fromCentre:Math.hypot(px-mid[0],py-mid[1]),kind:z.kind};
 }).sort((a,b)=>a.dist-b.dist|| (a.kind==='road'?-1:1) - (b.kind==='road'?-1:1)||a.fromCentre-b.fromCentre)[0];
 if(!nearest)return {x:mid[0],y:mid[1]};
 return {x:Math.max(x+margin,Math.min(x+w-margin,nearest.x)),
   y:Math.max(y+margin,Math.min(y+h-margin,nearest.y))};
}
export function selectedRadioSites(locations,stations){
 const playable=new Set((stations||[]).filter(s=>Boolean(s?.stream)).map(s=>s.id));
 return (locations||[]).filter(loc=>playable.has(loc.stationId));
}
export function radioWarTotals(state,locations){
 const out={underground:0,licensed:0};
 for(const loc of locations||[]) if(loc.side in out) out[loc.side]+=Number(state?.[loc.stationId]?.influence||0);
 return out;
}
