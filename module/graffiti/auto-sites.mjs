// Pure helpers for drop-and-tag street graffiti. No Foundry globals required.
// Auto-placed spots have their OWN unique durable site IDs; mission-linked site IDs stay strict.
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const numbered = name => clean(name).replace(/(?:\s+\d+|\s+#\d+)$/, '').trim();
const fold = s => numbered(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
export function autoSpotZone(scene, x, y) {
  const graph=scene?.getFlag?.('the-smoke','zoneGraph');
  const zones=Array.isArray(graph?.zones)?graph.zones:[];
  const found=zones.find(z => {
    const r=z?.rect;
    return Array.isArray(r)&&r.length===4&&x>=r[0]&&x<r[0]+r[2]&&y>=r[1]&&y<r[1]+r[3];
  });
  return found || null;
}
export function autoSpotRoot(scene, x, y) {
  const zone=autoSpotZone(scene,x,y);
  const road=Array.isArray(zone?.roads)?zone.roads.find(Boolean):null;
  const zoneName=road||zone?.name||scene?.name||'Street';
  // Existing street atlas zone headings often end in a segment number: replace that
  // with our own sequential surface number rather than double-numbering.
  return numbered(zoneName).replace(/\bBlock$/i,'Block').slice(0,60)||'Street';
}
export function nextAutoSpotName(scene, x, y, tokens=[]) {
  const root=autoSpotRoot(scene,x,y),key=fold(root);
  const occupied=new Set((Array.isArray(tokens)?tokens:Array.from(tokens || [])).map(t => {
    const spec=t?.getFlag?.('the-smoke','tagSpot');
    return spec?.auto && fold(spec.root||'')===key ? Number(spec.number||0) : 0;
  }).filter(n=>n>0));
  let number=1;while(occupied.has(number))number++;
  return {name:`${root} ${number}`,root,number,zoneId:autoSpotZone(scene,x,y)?.id||null};
}
export const isAutoSiteId = s => /^STREET-[a-z0-9_-]+$/i.test(String(s||''));
export function inferredMissionSite(catalogue, mission, spec, sceneMapId) {
  if(!mission?.tagging || !Array.isArray(catalogue?.sites))return null;
  const claimed=(catalogue.sites||[]).find(s=>s.id===spec?.siteId);
  if(claimed) return mission.tagging.sites?.includes(claimed.id) ? claimed.id : null;
  if(!spec?.auto || !spec.root) return null;
  // Only match a mission site when the zone/street name explicitly appears in its
  // authored description; guessing by district alone could award the wrong job.
  const root=fold(spec.root);
  const candidates=catalogue.sites.filter(s => mission.tagging.sites?.includes(s.id)
    && s.sceneMapId===sceneMapId
    && (s.surface===spec.surface || (s.surface==='bridge'&&spec.surface==='overpass') || (s.surface==='overpass'&&spec.surface==='bridge'))
    // Public transport commissions target a bus/train on the correct map, not a
    // hand-assigned vehicle id. Walls/bridges still require a matching named street.
    && (['bus','train'].includes(spec.surface) || (root.length>=6 && fold(s.label).includes(root))));
  return candidates.length===1 ? candidates[0].id : null;
}
export function isPublicTransportVehicle(token) {
  const actor=token?.actor;
  return actor?.type==='vehicle' && /\b(bus|double.decker|coach|train|carriage|tram)\b/i.test(`${token.name||''} ${actor.name||''}`);
}
export function vehicleSurface(token) {
  if(!isPublicTransportVehicle(token))return null;
  return /\b(train|carriage|tram)\b/i.test(`${token.name||''} ${token.actor?.name||''}`)?'train':'bus';
}
