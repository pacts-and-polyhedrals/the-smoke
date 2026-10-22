// Pure, testable tagging/territory rules. No Foundry APIs or Date.now() dependencies.
export const QUALITY = Object.freeze(['severeFailure','costlyFailure','narrowSuccess','fullSuccess','strongSuccess','exceptionalSuccess']);
export const QUALITY_LABEL = Object.freeze({'severeFailure':'Proper Mess','costlyFailure':'Bad Luck','narrowSuccess':'Just About','fullSuccess':'Sorted','strongSuccess':'Smashed It','exceptionalSuccess':'Legendary'});
export const QUALITY_SCORE = Object.freeze({severeFailure:0,costlyFailure:0,narrowSuccess:1,fullSuccess:2,strongSuccess:3,exceptionalSuccess:5});
export function qualityAtLeast(outcome, needed='narrowSuccess') {
  const a=QUALITY.indexOf(outcome), b=QUALITY.indexOf(needed);
  return a>=0 && b>=0 && a>=b;
}
export function tagMinutes(outcome, surface='wall') {
  const base=['severeFailure','costlyFailure'].includes(outcome)?2:outcome==='exceptionalSuccess'?7:outcome==='strongSuccess'?6:4;
  return base+(surface==='train'?3:surface==='bridge'||surface==='overpass'?2:surface==='bus'?1:0);
}
export function witnessedTag({approved=false,policeNear=false,crowded=false,exposed=false}={}) {
  if (approved) return {witnessed:false,byPolice:false};
  return {witnessed:Boolean(policeNear||crowded||exposed),byPolice:Boolean(policeNear)};
}
/** Overlap-aware token rectangles: adjacent large tokens are near even when their centres are far apart. */
export function rectDistanceSquares(a,b,grid=100) {
  if(!a||!b)return Infinity;
  const gr=Math.max(1,Number(grid)||100);
  // A token turned side-on (a parked bus at 90°) covers its height across and its width down, about the same centre.
  const box=t=>{let x=Number(t.x)||0,y=Number(t.y)||0,w=(Number(t.width)||1)*gr,h=(Number(t.height)||1)*gr;const r=((Number(t.rotation)||0)%180+180)%180;
    if(r>45&&r<135){const cx=x+w/2,cy=y+h/2;[w,h]=[h,w];x=cx-w/2;y=cy-h/2;}return [x,y,w,h];};
  const [ax,ay,aw,ah]=box(a),[bx,by,bw,bh]=box(b);
  const dx=Math.max(0,Math.max(ax,bx)-Math.min(ax+aw,bx+bw));
  const dy=Math.max(0,Math.max(ay,by)-Math.min(ay+ah,by+bh));
  return Math.hypot(dx,dy)/gr;
}
export const factionFromIdentity = identity => /^TAG-([A-Z]{2})$/.exec(String(identity||''))?.[1] ?? 'CREW';
export function territoryForMarks(marks=[]) {
  const points={};const sites={};
  for(const mark of marks) {
    if(mark?.status!=='visible')continue;
    const score=QUALITY_SCORE[mark.outcomeKey]??0;
    if(!score)continue;
    const faction=factionFromIdentity(mark.identity);
    // One visible mark per slot, authority always covers the older mark first.
    const key=String(mark.siteId||mark.slotId||mark.markId);
    if(!sites[key] || Number(mark.createdAtWorldSeconds||0)>=Number(sites[key].createdAtWorldSeconds||0))sites[key]=mark;
  }
  for(const mark of Object.values(sites)){
    const faction=factionFromIdentity(mark.identity), score=QUALITY_SCORE[mark.outcomeKey]??0;
    points[faction]=(points[faction]||0)+score;
  }
  return points;
}
export function canCreditPaintObjective(auto,event) {
  if(!auto||auto.on!=='tagPlaced'||event?.on!=='tagPlaced'||!event.markId||!event.siteId||!event.missionId)return false;
  if(auto.siteId && auto.siteId!==event.siteId)return false;
  if(auto.siteIds && !auto.siteIds.includes(event.siteId))return false;
  if(auto.identity && auto.identity!=='ANY_UNLOCKED' && auto.identity!==event.identity)return false;
  return qualityAtLeast(event.outcomeKey,auto.minQuality||'narrowSuccess');
}
export function computeTileGeometry(spot,scene,{vehicle=false}={}) {
  const grid=Math.max(24,Number(scene?.grid?.size)||100);
  const sw=(Number(spot?.width)||1)*grid,sh=(Number(spot?.height)||1)*grid;
  const scale=vehicle?0.70:2.0;
  const w=vehicle?Math.max(50,Math.round(sw*scale)):Math.max(grid*2,Math.round(sw*scale));
  const h=vehicle?Math.max(25,Math.round(w*0.49)):Math.max(Math.round(grid*.75),Math.round(w*0.49));
  const x=Math.round((Number(spot?.x)||0)+(sw-w)/2),y=Math.round((Number(spot?.y)||0)+(sh-h)/2);
  return {x,y,width:w,height:h,rotation:Number(spot?.rotation)||0};
}
