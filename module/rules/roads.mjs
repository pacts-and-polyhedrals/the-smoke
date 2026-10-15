import {tokenRotation} from './roads-core.mjs';
// Street geometry, shared by traffic, patrols and route previews. Canvas-free.
export const length = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
export function projectPoint(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;
  const t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;
  const point=[a[0]+dx*t,a[1]+dy*t]; return {t,point,distance:length(p,point)};
}
export function clipSegment(a,b,width,height) {
  let lo=0,hi=1; const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]],[dx,width-a[0]],[-dy,a[1]],[dy,height-a[1]]]) {
    if(Math.abs(p)<1e-9){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }
  return [[a[0]+dx*lo,a[1]+dy*lo],[a[0]+dx*hi,a[1]+dy*hi]];
}
function intersection(a,b,c,d) {
  const u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]],den=u[0]*v[1]-u[1]*v[0];
  if(Math.abs(den)<1e-9)return null;
  const w=[c[0]-a[0],c[1]-a[1]],t=(w[0]*v[1]-w[1]*v[0])/den,s=(w[0]*u[1]-w[1]*u[0])/den;
  return t>=0&&t<=1&&s>=0&&s<=1?{t,s}:null;
}
export function buildRoadNetwork(roads,width=4200,height=2700) {
  const lines=[];
  for(const road of roads??[]) {
    if(road.cls==='P')continue;
    for(let i=1;i<road.pts.length;i++){
      const c=clipSegment(road.pts[i-1],road.pts[i],width,height);
      if(c&&length(...c)>1)lines.push({a:c[0],b:c[1],road:road.name,width:road.width||200,cuts:[0,1]});
    }
  }
  const connectors=[];
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++) {
    const a=lines[i],b=lines[j],hit=intersection(a.a,a.b,b.a,b.b);
    if(hit){a.cuts.push(hit.t);b.cuts.push(hit.s);continue;}
    if(a.road===b.road)continue;
    for(const [first,second] of [[a,b],[b,a]]) for(const endpoint of [first.a,first.b]){
      const p=projectPoint(endpoint,second.a,second.b);
      if(p.distance>1&&p.distance<Math.min(120,(first.width+second.width)*.22)&&p.t>.01&&p.t<.99){
        second.cuts.push(p.t);connectors.push({a:endpoint,b:p.point,road:first.road,width:Math.min(first.width,second.width)});
      }
    }
  }
  const nodes=new Map(),edges=[],byNode=new Map();
  const node=p=>{const key=p.map(v=>Math.round(v)).join(',');if(!nodes.has(key))nodes.set(key,p);return key;};
  const add=(a,b,road,w)=>{const from=node(a),to=node(b);if(from===to)return;
    const edge={id:`r${edges.length}`,a:from,b:to,from:a,to:b,road,width:w,length:length(a,b)};edges.push(edge);
    for(const k of [from,to]){if(!byNode.has(k))byNode.set(k,[]);byNode.get(k).push(edge);}
  };
  for(const l of lines){const cuts=[...new Set(l.cuts.map(v=>Math.round(v*1e7)/1e7))].sort((a,b)=>a-b);
    const at=t=>[l.a[0]+(l.b[0]-l.a[0])*t,l.a[1]+(l.b[1]-l.a[1])*t];
    for(let i=1;i<cuts.length;i++)add(at(cuts[i-1]),at(cuts[i]),l.road,l.width);
  }
  for(const c of connectors)add(c.a,c.b,c.road,c.width);
  return {nodes,edges,byNode,width,height};
}
export function laneOnEdge(edge,distance,dir=1,offset=null) {
  const d=Math.max(0,Math.min(edge.length,Number(distance)||0)),t=edge.length?d/edge.length:0;
  const dx=(edge.to[0]-edge.from[0])/edge.length,dy=(edge.to[1]-edge.from[1])/edge.length;
  const off=offset??Math.min(70,edge.width*.22),sign=dir<0?-1:1;
  return {x:edge.from[0]+(edge.to[0]-edge.from[0])*t+dy*off*sign,
    y:edge.from[1]+(edge.to[1]-edge.from[1])*t-dx*off*sign,
    rotation:tokenRotation(dx*sign,dy*sign),edgeId:edge.id,distance:d,travelDir:sign};
}
export function nearestRoad(network,point) {
  let best=null;for(const edge of network.edges){const p=projectPoint(point,edge.from,edge.to);if(!best||p.distance<best.distance)best={edge,...p};}return best;
}
export function randomLane(network,r=Math.random,roadNames=null,{kerb=false}={}) {
  let pool=network.edges.filter(e=>e.length>40&&(!roadNames?.length||roadNames.includes(e.road)));
  if(!pool.length)pool=network.edges;if(!pool.length)return null;
  const total=pool.reduce((s,e)=>s+e.length,0);let dart=r()*total;
  const edge=pool.find(e=>(dart-=e.length)<=0)??pool.at(-1),dir=r()<.5?1:-1;
  return laneOnEdge(edge,edge.length*(.1+r()*.8),dir,kerb?edge.width*.43:null);
}
function pathCosts(network,target) {
  const hit=nearestRoad(network,target);if(!hit)return new Map();
  const distances=new Map([[hit.edge.a,hit.t*hit.edge.length],[hit.edge.b,(1-hit.t)*hit.edge.length]]),open=new Set(distances.keys());
  while(open.size){let n=[...open].reduce((a,b)=>distances.get(a)<distances.get(b)?a:b);open.delete(n);
    for(const edge of network.byNode.get(n)||[]){const other=edge.a===n?edge.b:edge.a,c=distances.get(n)+edge.length;
      if(c<(distances.get(other)??Infinity)){distances.set(other,c);open.add(other);}}
  }return distances;
}
export function advanceRoad(network,point,state={},step=150,r=Math.random,target=null) {
  if(!network.edges.length)return null;
  let edge=network.edges.find(e=>e.id===state.edgeId),distance=Number(state.distance),dir=Number(state.travelDir)||1;
  if(!edge||!Number.isFinite(distance)){const p=nearestRoad(network,point);if(!p)return null;edge=p.edge;distance=p.t*edge.length;
    if(target){dir=length(edge.from,target)<length(edge.to,target)?-1:1;}else dir=r()<.5?1:-1;}
  const costs=target?pathCosts(network,target):null;let left=Math.max(0,step),loops=0;
  while(left>0&&loops++<80){const available=dir>0?edge.length-distance:distance;
    if(left<available){distance+=left*dir;left=0;break;}
    left-=available;const end=dir>0?edge.b:edge.a;
    let choices=(network.byNode.get(end)||[]).filter(e=>e.id!==edge.id);
    if(!choices.length){dir=-dir;distance=dir>0?0:edge.length;continue;}
    if(costs){choices.sort((a,b)=>((costs.get(a.a===end?a.b:a.a)??1e9)+a.length)-((costs.get(b.a===end?b.b:b.a)??1e9)+b.length));}
    const next=costs?choices[0]:choices[Math.floor(r()*choices.length)];
    edge=next;dir=edge.a===end?1:-1;distance=dir>0?0:edge.length;
  }
  return laneOnEdge(edge,distance,dir);
}
