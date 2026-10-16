// The Sandbox Campaign cast: everyone the campaign plan and the venue register name (faction patrons and their people, the
// mission givers and the contact at every venue). Their actors live in the Campaign Cast compendium until the GM brings
// them in, a mission at a time (Mission Board → Bring in the cast) or by key. The opening's own people (Pat, Kez, Vale …)
// are the world's existing actors.
import {NS} from '../config.mjs';

export const CAST_FOLDER = 'The Smoke — Campaign Cast';
const PACK = `${NS}.campaign-cast`;
let castData = null;

/** london-cast.json: [{key, name, role, faction, img, existing, venues, missions, …}] */
export async function loadCast() {
  if (castData) return castData;
  try { const r = await fetch(`systems/${NS}/data/london-cast.json`); castData = r.ok ? await r.json() : {cast: []}; } catch (_e) { castData = {cast: []}; }
  return castData;
}
/** The world actor for a cast key, if it has been brought in (or is one of the opening's people). */
export function castActor(key, cast = castData?.cast ?? []) {
  const c = cast.find(x => x.key === key);
  if (c?.existing) return game.actors.find(a => a.getFlag(NS, 'npcKey') === c.existing && !a.getFlag(NS, 'streetLife') && !a.getFlag(NS, 'dedicatedFor')) ?? null;
  return game.actors.find(a => a.getFlag(NS, 'castKey') === key) ?? null;
}
async function folderFor(faction, factions) {
  const find = (name, parent) => game.folders.find(f => f.type === 'Actor' && f.name === name && (f.folder?.id ?? null) === (parent?.id ?? null));
  const root = find(CAST_FOLDER, null) ?? await Folder.implementation.create({name: CAST_FOLDER, type: 'Actor', color: '#e9cc8c', sorting: 'a'});
  const name = faction ? (factions?.[faction]?.name ?? faction) : 'Venue contacts';
  return find(name, root) ?? await Folder.implementation.create({name, type: 'Actor', folder: root.id, color: factions?.[faction]?.color ?? '#9fb2b8', sorting: 'a'});
}
/** Bring cast members into the world (GM): returns their actors, existing ones included. */
export async function importCast(keys, {notify = true} = {}) {
  if (!game.user?.isGM) throw new Error('Only the GM can bring in the cast.');
  const {cast} = await loadCast(), pack = game.packs.get(PACK);
  let docs = null, factions = null;
  try { factions = (await (await fetch(`systems/${NS}/data/london-missions.json`)).json()).factions; } catch (_e) {}
  const out = []; let made = 0, missing = 0;
  for (const key of [...new Set(keys)]) {
    const c = cast.find(x => x.key === key); if (!c) continue;
    let actor = castActor(key, cast);
    if (!actor && !c.existing) {
      if (!pack) throw new Error('The Campaign Cast compendium is missing.');
      docs ??= await pack.getDocuments();
      const doc = docs.find(d => d.getFlag(NS, 'castKey') === key); if (!doc) { missing++; continue; }
      const data = game.actors.fromCompendium(doc); data.folder = (await folderFor(c.faction, factions)).id;
      actor = await Actor.implementation.create(data); made++;
    }
    if (actor) out.push(actor); else missing++;
  }
  if (notify) ui.notifications.info(made ? `The Smoke: brought ${made} of the cast into "${CAST_FOLDER}".` : missing ? 'The Smoke: run world setup first for the opening\'s people.' : 'The Smoke: they are all here already.');
  return out;
}
/** The cast for a mission (its giver, then each venue's contact). */
export async function importMissionCast(m, options = {}) { return importCast((m?.cast || []).map(c => c.key), options); }
export const castAPI = {data: loadCast, import: importCast, mission: importMissionCast, actor: castActor};
