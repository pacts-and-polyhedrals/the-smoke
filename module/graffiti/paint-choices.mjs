// THE SMOKE — what Tag Studio should pick for a paint attempt: which surface, which commission it counts for, which tag,
// and a line telling the player what the job needs here. Pure: everything comes in as arguments (tested on its own).
// 0.5.23: before, Tag Studio started on whichever surface came first on the map (often a passing bus), could keep a
// faction tag on a job that needs another, and never said when a paint would not count (quality too low, a character
// who isn't on the job, a site that was already done), so commissions looked as if they had stopped working.
import {QUALITY_LABEL} from './core.mjs';
import {inferredMissionSite, isPublicTransportVehicle, vehicleSurface} from './auto-sites.mjs';

const NS = 'the-smoke';
const RANK = ['severeFailure', 'costlyFailure', 'narrowSuccess', 'fullSuccess', 'strongSuccess', 'exceptionalSuccess'];
const needOf = o => Math.max(1, Number(o?.auto?.count || 1));
const atSite = (o, siteId) => o?.auto?.on === 'tagPlaced' && (o.auto.siteId === siteId || (o.auto.siteIds || []).includes(siteId));
const isOpen = (o, s) => Number(s?.ticks?.[o.id] || 0) < needOf(o);
const codeOf = m => m?.code ?? m?.id ?? 'the job';

/** The paint spec of a surface token (a marker, a parked mission bus, or any bus/train on the map). */
export function surfaceSpec(token, scene) {
  if (!token) return null;
  const own = token.getFlag?.(NS, 'tagSpot'); if (own) return own;
  return isPublicTransportVehicle(token) ? {siteId: `STREET-${scene?.id}-${token.id}`, surface: vehicleSurface(token), auto: true, root: token.name || 'Transport'} : null;
}
/** The tag a commission's objective at this site asks for, in words. */
export function tagNeedText(identity, packs = []) {
  if (!identity || identity === 'ANY_UNLOCKED') return 'any tag you have unlocked';
  if (identity === 'TAG-STREET') return 'your own tag';
  const p = packs.find(x => x.id === identity); return p ? `the ${p.title} tag` : identity;
}
/** What the open objectives at a site need: the highest minimum quality among them. */
export function siteNeed(m, s, siteId) {
  const open = (m?.objectives || []).filter(o => atSite(o, siteId) && isOpen(o, s));
  if (!open.length) return null;
  const q = open.map(o => o.auto.minQuality || 'narrowSuccess').sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0];
  // a site's own objective comes first: "Just About" here, and one of the set at "Smashed It" can come later
  const own = open.filter(o => o.stop != null).map(o => o.auto.minQuality || 'narrowSuccess').sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0];
  return {quality: own ?? q, bonus: own && q !== own ? q : null, identity: m.tagging?.identity};
}
/** Sites of a commission still to paint, by name. */
export function openSites(m, s) {
  return (m?.objectives || []).filter(o => o.stop != null && isOpen(o, s)).map(o => m.stops?.[o.stop]?.name).filter(Boolean);
}
/**
 * Tag Studio's choices. `draft` is what the player has picked so far ({spotTokenId, missionId, missionPicked, tagPackId});
 * `spots` the paintable surfaces on the map; `actorToken` where the painter stands (for "nearest").
 */
export function paintChoices({catalogue, missions = [], states = {}, factions = {}, actor = null, actorToken = null, scene = null, spots = [], draft = {}, isGM = false}) {
  const mapId = scene?.getFlag?.(NS, 'streetAtlas')?.id || scene?.getFlag?.(NS, 'place')?.id || scene?.id;
  const onJob = m => m.tagging && states[m.id]?.status === 'active' && (!states[m.id].actorIds?.length || states[m.id].actorIds.includes(actor?.id));
  const jobs = missions.filter(onJob);
  const creditFor = (m, t) => inferredMissionSite(catalogue, m, surfaceSpec(t, scene), mapId);
  const stillNeeded = (m, t) => { const site = creditFor(m, t); return Boolean(site && siteNeed(m, states[m.id], site)); };
  let spot = spots.find(t => t.id === draft.spotTokenId) ?? null;
  if (!spot) {
    const dist = t => actorToken ? Math.hypot(Number(t.x) - Number(actorToken.x), Number(t.y) - Number(actorToken.y)) : 0;
    const wanted = spots.filter(t => jobs.some(m => stillNeeded(m, t)));
    spot = [...(wanted.length ? wanted : spots)].sort((a, b) => dist(a) - dist(b))[0] ?? null;
  }
  const options = spot ? jobs.map(m => ({m, site: creditFor(m, spot)})).filter(x => x.site)
    .sort((a, b) => Number(Boolean(siteNeed(b.m, states[b.m.id], b.site))) - Number(Boolean(siteNeed(a.m, states[a.m.id], a.site)))) : [];
  let missionId = options.some(x => x.m.id === draft.missionId) ? draft.missionId : draft.missionPicked && draft.missionId === '' ? '' : options[0]?.m.id ?? '';
  const chosen = options.find(x => x.m.id === missionId) ?? null, sel = chosen?.m ?? null;
  const packs = (catalogue?.tagPacks || []).filter(p => p.id !== 'TAG-STREET' && (isGM || states[p.unlock?.completeMissionId]?.status === 'done'
    || Number(factions[p.faction]?.renown || 0) >= Number(p.unlock?.minimumRenown || 1) || (sel?.faction && sel.faction === p.faction)));
  let tagPackId = draft.tagPackId || 'TAG-STREET';
  const want = sel?.tagging?.identity;
  if (want && want !== 'ANY_UNLOCKED') tagPackId = want;     // the job decides the tag
  if (tagPackId !== 'TAG-STREET' && !packs.some(p => p.id === tagPackId)) tagPackId = 'TAG-STREET';
  let hint = '';
  if (sel) {
    const need = siteNeed(sel, states[sel.id], chosen.site);
    if (need) hint = `Counts for ${codeOf(sel)} at ${QUALITY_LABEL[need.quality]} or better, with ${tagNeedText(need.identity, catalogue?.tagPacks)}.${need.bonus ? ` One piece in the set must be ${QUALITY_LABEL[need.bonus]} or better.` : ''}`;
    else { const left = openSites(sel, states[sel.id]); hint = `${codeOf(sel)} already has this site.${left.length ? ` Still to paint: ${left.join(', ')}.` : ''}`; }
  } else if (spot) {
    const others = missions.filter(m => m.tagging && states[m.id]?.status === 'active' && !onJob(m) && creditFor(m, spot));
    if (others.length) hint = `${others.map(codeOf).join(', ')} needs this surface, but ${actor?.name ?? 'this character'} is not on that job: it will only count for territory. The GM (or you, in Self-play) can add them on the Mission Board.`;
    else if (options.length && missionId === '') hint = 'Free paint: counts for territory only, not for a commission.';
  }
  return {spot, spec: surfaceSpec(spot, scene), missions: options.map(x => x.m), missionId, tagPackId, packs, hint};
}
/**
 * Why a paint for a commission did not move it on (for the card after spraying). Empty when it did, or when nothing
 * useful can be said.
 */
export function paintShortfall(m, s, {siteId, outcomeKey, identity} = {}, packs = []) {
  if (!m) return '';
  if (s?.status !== 'active') return `${codeOf(m)} is not on.`;
  const here = (m.objectives || []).filter(o => atSite(o, siteId));
  if (!here.length) return `this surface is not one of ${codeOf(m)}'s sites.`;
  const open = here.filter(o => isOpen(o, s));
  if (!open.length) { const left = openSites(m, s); return `${codeOf(m)} already has this site.${left.length ? ` Still to paint: ${left.join(', ')}.` : ''}`; }
  const wrongTag = open.filter(o => o.auto.identity && o.auto.identity !== 'ANY_UNLOCKED' && o.auto.identity !== identity);
  if (wrongTag.length === open.length) return `${codeOf(m)} needs ${tagNeedText(wrongTag[0].auto.identity, packs)} here.`;
  const need = siteNeed(m, s, siteId);
  if (need && RANK.indexOf(outcomeKey) < RANK.indexOf(need.quality)) return `${codeOf(m)} needs ${QUALITY_LABEL[need.quality]} or better here; this one was ${QUALITY_LABEL[outcomeKey] ?? outcomeKey}. Paint over it with another charge.`;
  return '';
}
