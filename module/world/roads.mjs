// The traced road polylines for a scene (from data/london-street-atlas.json), with their crossings, cached.
import {loadAtlas} from '../map/map-transit.mjs';
import {mapIdOf} from './spawn.mjs';
import {buildRoadNetwork} from '../rules/roads.mjs';
import {NS} from '../config.mjs';
import {crossings, nearestRoad} from '../rules/roads-core.mjs';
const cache = new Map();
export async function roadsFor(scene) {
  const id = mapIdOf(scene); if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  const {atlas} = await loadAtlas();
  const m = (atlas?.maps || []).find(x => x.id === id);
  const roads = (m?.roads || []).map(r => ({...r, pts: r.pts.map(p => [Number(p[0]), Number(p[1])])}));
  const out = roads.length ? {roads, cross: crossings(roads)} : null;
  cache.set(id, out); return out;
}
export const drivableIndexes = roads => roads.map((r, i) => r.cls === 'P' ? -1 : i).filter(i => i >= 0);
export {nearestRoad};

const networkCache=new Map();
/** Clipped, split road graph for pathfinding; uses the supplied 15 October polylines. */
export function networkOf(scene){
 const roads=scene?.getFlag(NS,'streetAtlas')?.roads??[];
 const old=networkCache.get(scene?.id);if(old?.source===roads)return old.network;
 const network=buildRoadNetwork(roads,scene?.width,scene?.height);networkCache.set(scene?.id,{source:roads,network});return network;
}
