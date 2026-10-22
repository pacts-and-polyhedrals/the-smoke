// THE SMOKE — deterministic, side-effect-free placement for real mission paint surfaces.
// The authored catalogue intentionally does not contain pixel coordinates. Venue anchors
// and place exits give us reproducible, street-accessible positions without inventing
// coordinates for a real London address. Unanchored stops are approximate and movable.
const rectOf = zone => Array.isArray(zone?.rect) && zone.rect.length === 4 && zone.rect.every(Number.isFinite) ? zone.rect : null;
const centre = r => [r[0]+r[2]/2, r[1]+r[3]/2];
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const normalise = text => String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const meaningful = s => normalise(s).split(' ').filter(x=>x.length>3 && !new Set(['wall','shutter','loading','paint','side','service','authorised','approved','panel','display','street','stationary','fictional','community','bridge','carriage','parked','outer','studio','boundary','depot']).has(x));
const hash = key => [...String(key)].reduce((n,ch)=>(Math.imul(n,31)+ch.charCodeAt(0))>>>0,2166136261);
const distanceRect = (a,b) => Math.hypot(Math.max(a[0]-b[0]-b[2],b[0]-a[0]-a[2],0),Math.max(a[1]-b[1]-b[3],b[1]-a[1]-a[3],0));

/** Distinct, authored target sites of active tagging commissions on this map. */
export function activePaintTargets(mapId,catalogue,missions,state){
  if(!mapId)return [];
  const sites = catalogue?.sites || [];
  const byId = new Map(sites.filter(site=>site.sceneMapId===mapId).map(site=>[site.id,site]));
  const found = new Map();
  for(const mission of missions || []){
    if(!mission.tagging || state?.[mission.id]?.status!=='active')continue;
    for(const id of mission.tagging.sites || []){
      const site=byId.get(id);
      if(!site)continue;
      const stop=mission.stops?.find(s=>s.code===id);
      if(!found.has(id))found.set(id,{site,stop,missionId:mission.id});
      else if(!found.get(id).stop && stop)found.get(id).stop=stop;
    }
  }
  return [...found.values()].sort((a,b)=>a.site.id.localeCompare(b.site.id));
}

/** An accessible kerb adjacent to the venue or street-door anchor. */
export function missionPaintPosition(map,site,stop,venues=[],places=[],occupied=[],grid=100){
  const zones=(map?.zones||[]).filter(z=>rectOf(z));
  const roadZones=zones.filter(z=>['road','junction'].includes(z.kind));
  const px=Number.isFinite(map?.width)?map.width:3000,py=Number.isFinite(map?.height)?map.height:2700;
  const placeId=stop?.placeId;
  const venue=(venues||[]).find(x=>x.id===placeId&&x.street===map.id);
  const doorway=(map?.links||[]).find(l=>l.to===placeId&&rectOf(l));
  let anchor=venue?.anchor?zones.find(z=>z.id===venue.anchor):null;
  let anchored=!!anchor,via=anchor?'venue':null;
  if(!anchor&&doorway){anchor={id:`door-${placeId}`,rect:doorway.rect,kind:'door'};anchored=true;via='door';}
  if(!anchor){
    const terms=meaningful(site.label);
    const ranked=zones.map(z=>{
      const zname=normalise(`${z.name||''} ${(z.roads||[]).join(' ')} ${z.id||''}`);
      const matches=terms.filter(term=>zname.includes(term)).length;
      return {z,matches};
    }).filter(x=>x.matches>0).sort((a,b)=>b.matches-a.matches || (a.z.kind==='land'?-1:0) - (b.z.kind==='land'?-1:0));
    anchor=ranked[0]?.z||null;
    if(anchor){via='label';anchored=false;}
  }
  if(!anchor && roadZones.length){
    // Missing named anchor: use a stable, inspectable approximation, never claim
    // it is a surveyed address or make users author a token before playing.
    anchor=roadZones[hash(site.id)%roadZones.length]; via='approximate';
  }
  if(!anchor) return {x:clamp(px/2,grid,px-grid),y:clamp(py/2,grid,py-grid),approximate:true,via:'centre'};
  let [ax,ay]=centre(anchor.rect), target=anchor;
  if(roadZones.length){
    const adjacent=new Set(anchor.adjacent||[]);
    const nearest=roadZones.map(z=>({z,dist:distanceRect(anchor.rect,z.rect),neighbor:adjacent.has(z.id)||(z.adjacent||[]).includes(anchor.id)}))
      .sort((a,b)=> (a.neighbor?-5000:0)+a.dist - ((b.neighbor?-5000:0)+b.dist) || a.z.id.localeCompare(b.z.id));
    target=nearest[0]?.z||anchor;
  }
  const [rx,ry,rw,rh]=target.rect,margin=Math.min(grid*.35,rw*.25,rh*.25);
  const nearX=clamp(ax,rx+margin,rx+rw-margin),nearY=clamp(ay,ry+margin,ry+rh-margin);
  // Put nearby different objectives on separate visible markers, not stacked on
  // top of each other. Preserve the chosen kerb/road rectangle.
  const shifts=[[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8],[.8,.8],[-.8,.8],[.8,-.8],[-.8,-.8],[1.6,0],[-1.6,0],[0,1.6],[0,-1.6]];
  const first=hash(site.id)%shifts.length;
  const candidates=shifts.map((_,i)=>shifts[(first+i)%shifts.length]).map(([dx,dy])=>({
    x:clamp(nearX+dx*grid,rx+margin,rx+rw-margin),y:clamp(nearY+dy*grid,ry+margin,ry+rh-margin)
  }));
  const unused=candidates.find(p=>!occupied.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<grid*.65));
  const choice=unused||candidates.sort((a,b)=>{
    const away=p=>Math.min(...occupied.map(q=>Math.hypot(p.x-q.x,p.y-q.y)),Infinity);
    return away(b)-away(a);
  })[0];
  return {x:clamp(choice.x,grid*.3,px-grid*.3),y:clamp(choice.y,grid*.3,py-grid*.3),
    approximate:!anchored,via,anchorZoneId:anchor.id,roadZoneId:target.id};
}

/**
 * Where a parked bus goes for a road-side paint site: at the kerb on the site's side of the road, lined up with the
 * road and kept inside it along its length, facing the way the traffic on that side goes (UK: keep left). Returns the
 * token's centre and rotation (Foundry's rotation 0 faces south; the art is drawn front-down).
 */
export function parkedAlong(point,road,{width=2,height=6,grid=100}={}){
  const r=rectOf(road);
  const horizontal=r?(road.o==='h'||(road.o!=='v'&&r[2]>=r[3])):true;
  const across=width*grid/2,along=height*grid/2;
  let cx=Number(point.x),cy=Number(point.y),rotation=horizontal?90:0;
  if(r){
    const [x,y,w,h]=r;
    if(horizontal){
      const north=cy<y+h/2;
      cx=w>=2*along?clamp(cx,x+along,x+w-along):x+w/2;
      cy=h>=2*across?(north?y+across:y+h-across):y+h/2;
      rotation=north?270:90;   // north kerb: eastbound traffic; south kerb: westbound
    }else{
      const west=cx<x+w/2;
      cy=h>=2*along?clamp(cy,y+along,y+h-along):y+h/2;
      cx=w>=2*across?(west?x+across:x+w-across):x+w/2;
      rotation=west?180:0;     // west kerb: northbound; east kerb: southbound
    }
  }
  return {cx:Math.round(cx),cy:Math.round(cy),rotation};
}
