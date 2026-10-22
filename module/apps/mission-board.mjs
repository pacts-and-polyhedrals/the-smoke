// The Mission Board: the opening story, twelve faction careers and twenty local cases at a glance. Two ways to play,
// the GM's call: in STORY MODE the GM starts missions, ticks objectives, passes or fails them and keeps each faction's
// Renown, Influence and stance, and players see only the side work (shifts, Pat's orders, hustles) and the missions the
// GM has put them on. In SELF-PLAY players can open any mission and run it themselves. Directions work in both.
import {NS, JOB_TYPES} from '../config.mjs';
import {missionsAPI, statusOf, needed, lockReason, standing, rankOf, RANKS, STANCES, visibleToPlayers} from '../world/missions.mjs';
import {findOrImportScene, importVenueMaps} from '../map/map-transit.mjs';
import {importCast, castActor, loadCast} from '../world/cast.mjs';
import {propUnits,propDestination,propMapId,moveCargo,propsAPI} from '../world/mission-props.mjs';
import {satnavData, missionTarget} from '../map/satnav.mjs';

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
  const list = data.missions.filter(m => group === 'opening' ? m.group === 'opening' : group === 'local' ? m.group === 'local' : group==='tagging' ? m.group==='tagging' : group==='radio' ? m.group==='radio' : m.faction === group && m.group!=='tagging');
  return list.sort((a,b)=>group==='opening'?a.n-b.n:group==='local'?a.code.localeCompare(b.code):['tagging','radio'].includes(group)?(a.order||0)-(b.order||0):(a.stage-b.stage));
}
/** The place the crew should head for next: the stop of the first unticked objective that has one, else the first stop. */
export function nextStop(m, s) {
  const o = m.objectives.find(x => x.stop != null && Number(s?.ticks?.[x.id] || 0) < needed(x));
  if (m.group === 'opening' && !o) return null;   // the opening's own places come from its objectives (the sat nav works them out)
  return m.stops?.[o?.stop ?? 0] ?? null;
}
/** Every mission can be routed: to its next place, or (the opening's) to wherever its next objective needs you. */
export const routable = m => Boolean(m?.stops?.length || m?.group === 'opening');

export class SmokeMissionBoard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-mission-board', classes: ['smoke', 'smoke-missions'], tag: 'div', position: {width: 980, height: 720}, window: {title: 'Mission Board', icon: 'fa-solid fa-flag-checkered', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/mission-board.hbs`, scrollable: ['.mb-list ol', '.mb-detail']}};
  selected = null; group = null; view = 'mission';
  async _prepareContext() {
    const data = await missionsAPI.data(), st = missionsAPI.state(), fac = missionsAPI.factions(), isGM = game.user.isGM, cast = (await loadCast()).cast;
    const territory=game.smoke?.graffiti?.territory?.()||{};
    const status = m => statusOf(m, st, fac), mode = missionsAPI.playMode(), canRun = missionsAPI.canRun(game.user), storyLocked = !isGM && mode === 'story';
    // story mode: a player sees only what the GM has put the crew on; the rest of the storyline stays off the board
    const sees = m => !storyLocked || visibleToPlayers(status(m), mode);
    const sideWork = Object.entries(JOB_TYPES).map(([key, j]) => ({key, ...j}));
    if (storyLocked && !data.missions.some(sees)) return {isGM, canRun, mode, storyLocked, sideWork, empty: true, groups: [], list: [], m: null};
    // start on whatever the crew is doing, else the opening
    const active = data.missions.find(m => status(m) === 'active');
    this.group ??= active ? (['opening','local','tagging','radio'].includes(active.group) ? active.group : active.faction) : 'opening';
    let groups = (data.groups ?? [{key: 'opening', name: 'On Your Bike', kicker: 'HACKNEY OPENING'}]).map(g => {
      const ms = groupMissions(data, g.key);
      return {...g, selected: g.key === this.group, done: ms.filter(m => status(m) === 'done').length, total: ms.length, active: ms.some(m => status(m) === 'active'), shown: ms.some(sees)};
    });
    if (storyLocked) { groups = groups.filter(g => g.shown); if (!groups.some(g => g.selected) && groups[0]) { this.group = groups[0].key; groups[0].selected = true; } }
    const group = groups.find(g => g.selected) ?? groups[0], missions = groupMissions(data, group.key).filter(sees);
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
    // the button names where the sat nav will actually go (0.5.23: it named the next stop even when the sat nav went elsewhere)
    let stop = m ? nextStop(m, s) : null;
    if (m && routable(m)) try { const t = missionTarget(await satnavData(), m, s); if (t?.label) stop = {...(stop || {}), name: t.label}; } catch (_e) {}
    const cargoCharacters = pcs.filter(a=>isGM||a.testUserPermission?.(game.user,'OWNER'));
    const preferredCargoActor = game.user.character?.id || canvas?.tokens?.controlled?.find(t=>t.actor?.type==='character'&&t.actor.isOwner)?.actor?.id || cargoCharacters[0]?.id || null;
    const cargoRows = m ? propUnits(m).map(({serial,prop,index})=>{
      const rec=s.parcels?.[serial]||{status:'pending'},from=propDestination(m,prop.pickup),to=propDestination(m,prop.delivery);
      const carrier=game.actors.get(rec.actorId),scene=game.scenes.get(rec.sceneId);
      const owned=Boolean(isGM || carrier?.testUserPermission?.(game.user,'OWNER'));
      const nearby=rec.status==='world' && rec.sceneId===canvas?.scene?.id;
      const carrierHere=rec.status==='held' && owned && Boolean(canvas?.scene?.tokens?.find?.(t=>t.actor?.id===rec.actorId));
      return {serial,name:prop.name,number:prop.quantity>1?`${index+1}/${prop.quantity}`:'',status:rec.status,
        statusText:rec.status==='held'?`Carried by ${carrier?.name||'crew'}`:rec.status==='delivered'?'Delivered':rec.status==='world'?`On map: ${scene?.name||from?.name||propMapId(from)||'location'}`:'Preparing property…',
        from:from?.name||propMapId(from)||'Pickup area',to:to?.name||propMapId(to)||'Handover location',
        description:prop.description||'',canCollect:nearby,canCarry:carrierHere,carrierId:rec.actorId,
        heavy:Boolean(prop.heavy)};
    }):[];

    return {isGM, canRun, mode, storyLocked, selfPlay: mode === 'self', sideWork, groups, group, fs, view: this.view, factionsView: this.view === 'factions', list: list.map(x => ({...x, active: x.id === this.selected})),
      cargoCharacters:cargoCharacters.map(a=>({id:a.id,name:a.name,selected:a.id===preferredCargoActor})),
      m: m ? {...m, taggingSpots: m.tagging ? m.tagging.sites.map(siteId=>({siteId,label:m.stops?.find(t=>t.code===siteId)?.name||siteId,sceneMapId:m.stops?.find(t=>t.code===siteId)?.mapId||'',placed: game.scenes.some(scene=>scene.tokens.some(t=>!t.hidden && t.getFlag?.(NS,'tagSpot')?.siteId===siteId)),
        done: m.objectives.some(o=>o.stop!=null&&m.stops?.[o.stop]?.code===siteId&&Number(s.ticks?.[o.id]||0)>=needed(o))})) : [], cargo:cargoRows, routable: routable(m), status: status(m), label: LABEL[status(m)], fcClass: m.group === 'local' ? 'fc-local' : m.faction && m.group !== 'opening' ? `fc-${m.faction.toLowerCase()}` : '', kicker: m.code ? `${m.code} · ${(faction(m.faction)?.name ?? (m.group === 'local' ? 'Local case' : '')).toUpperCase()} · ${m.giver.toUpperCase()}` : `MISSION ${m.n} · ${m.giver.toUpperCase()}`,
        lock: status(m) === 'locked' ? lockReason(m, st, data, fac) : '', pays,
        objectives: m.objectives.map(o => { const have = Math.min(needed(o), Number(s.ticks?.[o.id] || 0)); return {...o, have, need: needed(o), done: have >= needed(o), multi: needed(o) > 1, autoCargo: ['cargoCollected','cargoDelivered','tagPlaced','radioWar'].includes(o.auto?.on) && !isGM}; }),
        places: (m.locations || []).map(l => ({...l, ref: data.refs?.[l.code] ? l.code : '', placeId: (m.stops || []).find(x => x.code === l.code)?.placeId ?? ''})),
        mapIds: [...new Set((m.stops || []).map(x => x.placeId).filter(Boolean))],
        cast: (m.cast || []).map(c => ({...c, here: Boolean(castActor(c.key, cast))})),
        continues: (m.continues || []).map(c => ({code: c, title: data.missions.find(x => x.code === c)?.title ?? ''})),
        evidence: m.evidence || [], picks: (m.rewards.renownPick || []).map(k => ({code: k, name: faction(k)?.name ?? k})),
        on: (s.actorIds || []).map(id => game.actors.get(id)?.name).filter(Boolean).join(', '), stop: stop ? {...stop} : null} : null,
      factions: Object.values(data.factions || {}).map(f => { const x = standing(fac, f.code), r = rankOf(x.renown), next = groupMissions(data, f.code).find(q => !['done', 'failed', 'active'].includes(status(q)));
        const territoryPoints=Object.values(territory).reduce((sum,map)=>sum+Number(map?.[f.code]||0),0);
        return {...f, ...x, territoryPoints, rank: r.name, cap: r.cap, stances: STANCES.map(k => ({key: k, label: STANCE[k], selected: k === x.stance})), stanceLabel: STANCE[x.stance],
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
    on('[data-play-mode]', n => missionsAPI.setMode(n.dataset.playMode));
    on('[data-open-blower]', () => { game.smoke.phone(); return false; });
    on('[data-open-tags]',()=>{game.smoke.openTagStudio();return false;});
    on('[data-group]', n => { this.group = n.value; this.selected = null; this.view = 'mission'; }, 'change');
    on('[data-view]', n => { this.view = n.dataset.view; });
    on('[data-start]', () => missionsAPI.start(this.selected, [...el.querySelectorAll('[name=mbActor]:checked')].map(x => x.value)));
    on('[data-tick]', n => missionsAPI.tick(this.selected, n.dataset.tick, Number(n.dataset.delta || 1)));
    on('[data-cargo-action]', async n => {
      const m=(await missionsAPI.data()).missions.find(x=>x.id===this.selected);
      if(!m)throw new Error('Choose an active mission.');
      const state=missionsAPI.state()[m.id];if(state?.status!=='active')throw new Error('Start this mission first.');
      const rec=state.parcels?.[n.dataset.cargoSerial],selected=el.querySelector('[name=mbCargoActor]')?.value;
      const actorId=n.dataset.cargoAction==='collect'?selected:rec?.actorId;
      if(!actorId)throw new Error('Choose a character for the parcel.');
      return moveCargo(n.dataset.cargoAction,{missionId:m.id,serial:n.dataset.cargoSerial,actorId,sceneId:canvas.scene.id,tokenId:rec?.tokenId});
    });
    on('[data-repair-cargo]',()=>propsAPI.repair(this.selected));
    on('[data-repair-paint]',()=>game.smoke.graffiti.prepareMissionSpots(this.selected));
    on('[data-set]', n => missionsAPI.set(this.selected, n.dataset.set, el.querySelector('[name=mbRenownTo]')?.value ?? null));
    on('[data-crew]', () => missionsAPI.crew(this.selected, [...el.querySelectorAll('[name=mbActor]:checked')].map(x => x.value)));
    on('[data-site-directions]', async n => {
      const data = await missionsAPI.data(), m = data.missions.find(x => x.id === this.selected), stop = m?.stops?.find(x => x.code === n.dataset.siteDirections);
      const actor = game.user.character ?? canvas?.tokens?.controlled?.find(t => t.actor?.type === 'character')?.actor ?? game.actors.find(a => a.type === 'character' && a.isOwner && !game.user.isGM);
      if (!actor) throw new Error('Pick a character (or select their token) for the sat nav.');
      if (!stop) throw new Error('That site has no place on the map.'); await game.smoke.satnav.mission(actor, m, stop); return false;
    });
    on('[data-renown]', n => { const f = missionsAPI.standing(missionsAPI.factions(), n.dataset.code); return missionsAPI.faction(n.dataset.code, {renown: f.renown + Number(n.dataset.renown)}); });
    on('[data-influence]', n => { const f = missionsAPI.standing(missionsAPI.factions(), n.dataset.code); return missionsAPI.faction(n.dataset.code, {influence: f.influence + Number(n.dataset.influence)}); });
    on('[data-stance]', n => missionsAPI.faction(n.dataset.stance, {stance: n.value}), 'change');
    on('[data-page]', async () => { const data = await missionsAPI.data(), m = data.missions.find(x => x.id === this.selected); await openRef({key: m.journalKey, page: m.page, uuid: m.pageUuid}); return false; });
    on('[data-profile]', async n => { const data = await missionsAPI.data(), f = data.factions[n.dataset.profile]; await openRef({key: f.journalKey, page: f.page, uuid: f.pageUuid}); return false; });
    on('[data-ref]', async n => {
      const data = await missionsAPI.data(), code = n.dataset.ref, target = data.missions.find(x => x.code === code);
      if (target) { this.group = ['opening','local','tagging'].includes(target.group) ? target.group : target.faction; this.selected = target.id; this.view = 'mission'; return; }
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
      if (!stop && !routable(m)) throw new Error('This mission has no place on the map.'); await game.smoke.satnav.mission(actor, m); return false;
    });
  }
}
let board = null;
export function openMissions() { board ??= new SmokeMissionBoard(); board.render({force: true}); return board; }
Hooks.on('smokeMissionsChanged', () => { if (board?.rendered) board.render(); });
Hooks.on('smokeGraffitiChanged', () => { if (board?.rendered) board.render(); });
