// The Mission Board: the opening story, twelve faction careers and twenty local cases at a glance. The GM starts
// missions, ticks objectives, passes or fails them and keeps each faction's Renown, Influence and stance; players can
// open it to see what is open and what they are on (read-only), and get Directions to the next place.
import {NS} from '../config.mjs';
import {missionsAPI, statusOf, needed, lockReason, standing, rankOf, RANKS, STANCES} from '../world/missions.mjs';
import {findOrImportScene, importVenueMaps} from '../map/map-transit.mjs';
import {importCast, castActor, loadCast} from '../world/cast.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const LABEL = {locked: 'Locked', available: 'Open', active: 'On it', done: 'Passed', failed: 'Failed'};
const STANCE = {open: 'Open', allied: 'Allied', strained: 'Strained', hostile: 'Hostile'};
const REP = {crew: 'Chainring', street: 'Street', police: 'Known to police'};

/** Open a journal page: the world's copy (world setup imports the guides) first, else the compendium. */
export async function openRef({key, page, uuid}) {
  const entry = game.journal?.find(j => j.getFlag(NS, 'contentKey') === key), local = entry?.pages?.find(p => p.name === page);
  const doc = local ?? (uuid ? await fromUuid(uuid) : null); if (!doc) throw new Error('Run world setup, or open the guide in the Guides compendium.');
  if (!doc.parent?.testUserPermission?.(game.user, 'OBSERVER') && !game.user.isGM) throw new Error('That page is for the GM.');
  return doc.parent.sheet.render(true, {pageId: doc.id});
}
/** The missions in a group, in story order (the opening by number, a career by stage, cases by code). */
export function groupMissions(data, group) {
  const list = data.missions.filter(m => group === 'opening' ? m.group === 'opening' : group === 'local' ? m.group === 'local' : m.faction === group);
  return list.sort((a, b) => group === 'opening' ? a.n - b.n : group === 'local' ? a.code.localeCompare(b.code) : (a.stage - b.stage));
}
/** The place the crew should head for next: the stop of the first unticked objective that has one, else the first stop. */
export function nextStop(m, s) {
  const o = m.objectives.find(x => x.stop != null && Number(s?.ticks?.[x.id] || 0) < needed(x));
  return m.stops?.[o?.stop ?? 0] ?? null;
}

export class SmokeMissionBoard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-mission-board', classes: ['smoke', 'smoke-missions'], tag: 'div', position: {width: 980, height: 720}, window: {title: 'Mission Board', icon: 'fa-solid fa-flag-checkered', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/mission-board.hbs`, scrollable: ['.mb-list ol', '.mb-detail']}};
  selected = null; group = null; view = 'mission';
  async _prepareContext() {
    const data = await missionsAPI.data(), st = missionsAPI.state(), fac = missionsAPI.factions(), isGM = game.user.isGM, cast = (await loadCast()).cast;
    const status = m => statusOf(m, st, fac);
    // start on whatever the crew is doing, else the opening
    const active = data.missions.find(m => status(m) === 'active');
    this.group ??= active ? (active.group === 'opening' || active.group === 'local' ? active.group : active.faction) : 'opening';
    const groups = (data.groups ?? [{key: 'opening', name: 'On Your Bike', kicker: 'HACKNEY OPENING'}]).map(g => {
      const ms = groupMissions(data, g.key);
      return {...g, selected: g.key === this.group, done: ms.filter(m => status(m) === 'done').length, total: ms.length, active: ms.some(m => status(m) === 'active')};
    });
    const group = groups.find(g => g.selected) ?? groups[0], missions = groupMissions(data, group.key);
    const list = missions.map(m => ({id: m.id, n: m.code ?? m.n, title: m.title, giver: m.giver, status: status(m), label: LABEL[status(m)], img: m.img}));
    if (!list.some(x => x.id === this.selected)) this.selected = (list.find(m => m.status === 'active') ?? list.find(m => m.status === 'available') ?? list[0])?.id;
    const m = data.missions.find(x => x.id === this.selected), s = st[m?.id] || {};
    const faction = code => data.factions?.[code];
    const fs = group.key in (data.factions || {}) ? (() => { const x = standing(fac, group.key), r = rankOf(x.renown); return {...x, rank: r.name, cap: r.cap, stanceLabel: STANCE[x.stance], color: faction(group.key).color}; })() : null;
    const pcs = game.actors.filter(a => a.type === 'character');
    const pays = m ? [m.rewards.fee ? `£${m.rewards.fee} crew fee` : `£${m.rewards.cash} each`, `${m.rewards.xp} XP`,
      ...Object.entries(m.rewards.rep || {}).map(([k, v]) => `+${v} ${REP[k] ?? k}`),
      ...Object.entries(m.rewards.renown || {}).map(([k, v]) => `+${v} Renown · ${faction(k)?.name ?? k}`),
      ...(m.rewards.renownPick ? [`+${m.rewards.renownAmount || 1} Renown · ${m.rewards.renownPick.map(k => faction(k)?.name ?? k).join(' or ')}`] : []),
      ...(m.rewards.influence ? [`+${m.rewards.influence} Influence`] : []), ...(m.minRep > 1 ? [`Rep ${m.minRep}+`] : []), ...(m.faction && m.gate ? [`Offer: Renown ${m.gate}`] : [])] : [];
    const stop = m ? nextStop(m, s) : null;
    return {isGM, groups, group, fs, view: this.view, factionsView: this.view === 'factions', list: list.map(x => ({...x, active: x.id === this.selected})),
      m: m ? {...m, status: status(m), label: LABEL[status(m)], fcClass: m.group === 'local' ? 'fc-local' : m.faction && m.group !== 'opening' ? `fc-${m.faction.toLowerCase()}` : '', kicker: m.code ? `${m.code} · ${(faction(m.faction)?.name ?? (m.group === 'local' ? 'Local case' : '')).toUpperCase()} · ${m.giver.toUpperCase()}` : `MISSION ${m.n} · ${m.giver.toUpperCase()}`,
        lock: status(m) === 'locked' ? lockReason(m, st, data, fac) : '', pays,
        objectives: m.objectives.map(o => { const have = Math.min(needed(o), Number(s.ticks?.[o.id] || 0)); return {...o, have, need: needed(o), done: have >= needed(o), multi: needed(o) > 1}; }),
        places: (m.locations || []).map(l => ({...l, ref: data.refs?.[l.code] ? l.code : '', placeId: (m.stops || []).find(x => x.code === l.code)?.placeId ?? ''})),
        mapIds: [...new Set((m.stops || []).map(x => x.placeId).filter(Boolean))],
        cast: (m.cast || []).map(c => ({...c, here: Boolean(castActor(c.key, cast))})),
        continues: (m.continues || []).map(c => ({code: c, title: data.missions.find(x => x.code === c)?.title ?? ''})),
        evidence: m.evidence || [], picks: (m.rewards.renownPick || []).map(k => ({code: k, name: faction(k)?.name ?? k})),
        on: (s.actorIds || []).map(id => game.actors.get(id)?.name).filter(Boolean).join(', '), stop: stop ? {...stop} : null} : null,
      factions: Object.values(data.factions || {}).map(f => { const x = standing(fac, f.code), r = rankOf(x.renown), next = groupMissions(data, f.code).find(q => !['done', 'failed', 'active'].includes(status(q)));
        return {...f, ...x, rank: r.name, cap: r.cap, stances: STANCES.map(k => ({key: k, label: STANCE[k], selected: k === x.stance})), stanceLabel: STANCE[x.stance],
          done: groupMissions(data, f.code).filter(q => status(q) === 'done').length, next: next ? `${next.code ?? next.n} ${next.title}${status(next) === 'locked' ? ` (Renown ${next.gate})` : ''}` : 'Career complete'}; }),
      ranks: RANKS.map(r => `${r.at} ${r.name}`).join(' · '),
      pcs: pcs.map(a => ({id: a.id, name: a.name, checked: (s.actorIds || pcs.filter(p => p.hasPlayerOwner).map(p => p.id)).includes(a.id)})),
      counts: Object.fromEntries(Object.keys(LABEL).map(k => [k, list.filter(x => x.status === k).length]))};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element, refresh = () => setTimeout(() => this.render(), 250);
    const on = (sel, fn, ev = 'click') => el.querySelectorAll(sel).forEach(n => n.addEventListener(ev, e => { if (ev === 'click') e.preventDefault(); Promise.resolve(fn(n, e)).then(r => { if (r !== false) refresh(); }).catch(err => ui.notifications.warn(err.message)); }));
    on('[data-pick]', n => { this.selected = n.dataset.pick; this.view = 'mission'; });
    on('[data-group]', n => { this.group = n.value; this.selected = null; this.view = 'mission'; }, 'change');
    on('[data-view]', n => { this.view = n.dataset.view; });
    on('[data-start]', () => missionsAPI.start(this.selected, [...el.querySelectorAll('[name=mbActor]:checked')].map(x => x.value)));
    on('[data-tick]', n => missionsAPI.tick(this.selected, n.dataset.tick, Number(n.dataset.delta || 1)));
    on('[data-set]', n => missionsAPI.set(this.selected, n.dataset.set, el.querySelector('[name=mbRenownTo]')?.value ?? null));
    on('[data-renown]', n => { const f = missionsAPI.standing(missionsAPI.factions(), n.dataset.code); return missionsAPI.faction(n.dataset.code, {renown: f.renown + Number(n.dataset.renown)}); });
    on('[data-influence]', n => { const f = missionsAPI.standing(missionsAPI.factions(), n.dataset.code); return missionsAPI.faction(n.dataset.code, {influence: f.influence + Number(n.dataset.influence)}); });
    on('[data-stance]', n => missionsAPI.faction(n.dataset.stance, {stance: n.value}), 'change');
    on('[data-page]', async () => { const data = await missionsAPI.data(), m = data.missions.find(x => x.id === this.selected); await openRef({key: m.journalKey, page: m.page, uuid: m.pageUuid}); return false; });
    on('[data-profile]', async n => { const data = await missionsAPI.data(), f = data.factions[n.dataset.profile]; await openRef({key: f.journalKey, page: f.page, uuid: f.pageUuid}); return false; });
    on('[data-ref]', async n => {
      const data = await missionsAPI.data(), code = n.dataset.ref, target = data.missions.find(x => x.code === code);
      if (target) { this.group = target.group === 'opening' || target.group === 'local' ? target.group : target.faction; this.selected = target.id; this.view = 'mission'; return; }
      const ref = data.refs?.[code]; if (!ref) return false; await openRef(ref); return false;
    });
    on('[data-cast]', async () => { const data = await missionsAPI.data(), m = data.missions.find(x => x.id === this.selected); await importCast((m?.cast || []).map(c => c.key)); });
    on('[data-person]', async n => { const key = n.dataset.person; let a = castActor(key, (await loadCast()).cast); if (!a) [a] = await importCast([key], {notify: false}); a?.sheet?.render(true); });
    on('[data-view-map]', async n => { const scene = await findOrImportScene(n.dataset.viewMap); await scene?.view(); return false; });
    on('[data-prepare-maps]', async () => { const data = await missionsAPI.data(), m = data.missions.find(x => x.id === this.selected); await importVenueMaps((m?.stops || []).map(x => x.placeId).filter(Boolean)); return false; });
    on('[data-directions]', async () => {
      const data = await missionsAPI.data(), m = data.missions.find(x => x.id === this.selected), stop = nextStop(m, missionsAPI.state()[m.id]);
      const actor = game.user.character ?? canvas?.tokens?.controlled?.find(t => t.actor?.type === 'character')?.actor ?? game.actors.find(a => a.type === 'character' && a.isOwner && !game.user.isGM);
      if (!actor) throw new Error('Pick a character (or select their token) for the sat nav.');
      if (!stop) throw new Error('This mission has no place on the map.'); await game.smoke.satnav.mission(actor, m); return false;
    });
  }
}
let board = null;
export function openMissions() { board ??= new SmokeMissionBoard(); board.render({force: true}); return board; }
Hooks.on('smokeMissionsChanged', () => { if (board?.rendered) board.render(); });
