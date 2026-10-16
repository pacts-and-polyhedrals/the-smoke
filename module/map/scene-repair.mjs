// Scene background repair (from Altered Carbon v2.5.2): Foundry v14 keeps a scene's image on its Level.
// London scenes carry their image and links in flags; this puts the image where the running Foundry expects
// it and keeps each scene's links in step with the bundled map data.
import {NS} from '../config.mjs';
const DATA_FILES = ['london-street-atlas.json', 'london-overview.json', 'london-places.json', 'london-venues.json'];
let index = null;
async function mapIndex() {
  if (index) return index; index = new Map();
  for (const file of DATA_FILES) {
    try { const r = await fetch(`systems/${NS}/data/${file}`); if (!r.ok) continue; const d = await r.json();
      for (const m of d.maps || []) index.set(m.id, {src: `systems/${NS}/assets/maps/${m.file}`, links: m.links || [], zones: m.zones || [], roads:m.roads||[], kind: file.includes('places') || file.includes('venues') ? 'place' : 'streetAtlas'}); } catch (error) { console.warn('The Smoke | map index', file, error); }
  }
  return index;
}
export async function expectedImage(scene) {
  const f = scene?.flags?.[NS] || {}; const own = f.place?.src || f.streetAtlas?.src; if (own) return own;
  const id = f.place?.id || f.streetAtlas?.id; if (!id) return null;
  return (await mapIndex()).get(id)?.src || null;
}
export async function repairSceneBackground(scene) {
  const src = await expectedImage(scene); if (!src) return false;
  if (scene.levels !== undefined) {
    const levels = scene.levels?.contents ?? scene.levels ?? [];
    const level = (typeof scene.initialLevel === 'string' ? scene.levels.get?.(scene.initialLevel) : scene.initialLevel) ?? levels[0];
    if (!level) {
      const [created] = await scene.createEmbeddedDocuments('Level', [{name: 'Street', background: {src}, elevation: {bottom: 0, top: 20}, sort: 0}]);
      if (created && !scene.initialLevel) await scene.update({initialLevel: created.id});
      return true;
    }
    if (level.background?.src) return false;
    await scene.updateEmbeddedDocuments('Level', [{_id: level.id, 'background.src': src}]);
    return true;
  }
  if (scene.background?.src) return false;
  await scene.update({'background.src': src}); return true;
}
export async function syncSceneLinks(scene) {
  const f = scene?.flags?.[NS] || {}; const id = f.place?.id || f.streetAtlas?.id; if (!id) return false;
  const entry = (await mapIndex()).get(id); if (!entry) return false;
  const current = f[entry.kind]?.links || [];
  if (JSON.stringify(current) === JSON.stringify(entry.links) && JSON.stringify(f[entry.kind]?.roads||[])===JSON.stringify(entry.roads) && f.zoneGraph?.zones?.[0]?.kind) return false;
  await scene.update({[`flags.${NS}.${entry.kind}.links`]: entry.links, [`flags.${NS}.${entry.kind}.roads`]:entry.roads, [`flags.${NS}.zoneGraph`]: {zones: entry.zones.map(z => ({...z, service: z.service || null, roads: z.roads || [], landmark: z.landmark || false}))}});
  return true;
}
export async function repairAllSceneBackgrounds({notify = true} = {}) {
  if (!game.user?.isGM) return 0; let fixed = 0;
  for (const scene of game.scenes) { try { if (await repairSceneBackground(scene)) fixed++; await syncSceneLinks(scene); } catch (error) { console.warn('The Smoke | could not repair', scene.name, error); } }
  if (fixed && notify) ui.notifications.info(`The Smoke: restored the map image on ${fixed} London scene(s).`);
  return fixed;
}
export function installSceneRepair() {
  Hooks.once('ready', () => { const leader = game.users.activeGM ?? null; if (game.user.isGM && (!leader || leader.id === game.user.id)) repairAllSceneBackgrounds().catch(error => console.warn('The Smoke | scene repair', error)); });
  Hooks.on('createScene', (scene, options, userId) => { if (userId === game.user.id && game.user.isGM) repairSceneBackground(scene).catch(() => null); });
}
