// The GM Screen: one window for everything the GM throws at the players. Pick who it's for on the left; post quick
// checks, teamwork and opposed checks, hazards (harm applied automatically), street and police events with their
// automations; set Heat, report crimes, hand out cash, XP and kit; make up NPCs; see the party's real odds; open every tool.
import {NS, STATS, STAT_KEYS, HEAT, CRIMES, crimeHeatText} from '../config.mjs';
import {clampHeat} from '../rules/core.mjs';
import {partyLadder} from '../rules/difficulty.mjs';
import {QUICK_GROUPS, QUICK_CHECKS, TEAMWORK, HAZARD_GROUPS, HAZARDS, STREET_EVENTS, POLICE_EVENTS, NPC_ROLES} from '../gm/catalogue.mjs';
import {postRequest, describeConsequence} from '../gm/requests.mjs';
import {quickSpec, teamSpec, hazardSpec, rollStreetEvent, runAuto, makeNPC, npcLine, pcTokens} from '../gm/automation.mjs';
import {request, card, esc} from '../world/net.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const BAND = {easy: 'Easy', medium: 'Medium', hard: 'Hard', miracle: 'Long Shot'};
const TABS = [
  {key: 'checks', label: 'Checks', icon: 'fa-solid fa-dice'}, {key: 'hazards', label: 'Hazards', icon: 'fa-solid fa-triangle-exclamation'},
  {key: 'street', label: 'Street', icon: 'fa-solid fa-road'}, {key: 'heat', label: 'Police & Heat', icon: 'fa-solid fa-star'},
  {key: 'rewards', label: 'Rewards', icon: 'fa-solid fa-sterling-sign'}, {key: 'npcs', label: 'NPCs', icon: 'fa-solid fa-user-secret'},
  {key: 'odds', label: 'Odds', icon: 'fa-solid fa-percent'}, {key: 'tools', label: 'Tools', icon: 'fa-solid fa-toolbox'}
];
export const GM_TOOLS = Object.freeze([
  {key: 'streetControl', icon: 'fa-solid fa-tower-broadcast', label: 'Street Control', hint: 'Street Life, police response, job clocks.'},
  {key: 'combat', icon: 'fa-solid fa-crosshairs', label: 'Combat Console', hint: 'Speed dice, ranges, cover, ammo, police AI.'},
  {key: 'missions', icon: 'fa-solid fa-flag-checkered', label: 'Mission Board', hint: 'The Hackney story, objectives and rewards.'},
  {key: 'shop', icon: 'fa-solid fa-store', label: 'Open a Shop', hint: 'For the first ticked character, wherever they stand.'},
  {key: 'creator', icon: 'fa-solid fa-user-plus', label: 'Character Creator', hint: 'Make a brand-new character for a player.'},
  {key: 'levelUp', icon: 'fa-solid fa-arrow-trend-up', label: 'Level Up', hint: 'For the first ticked character with the XP.'},
  {key: 'guides', icon: 'fa-solid fa-book-open', label: 'Guides & Handbook', hint: 'The journals: rules, London, missions.'},
  {key: 'phone', icon: 'fa-solid fa-mobile-screen', label: 'The Blower', hint: 'A character\'s phone.'},
  {key: 'maps', icon: 'fa-solid fa-map', label: 'Import every map', hint: 'Adds any London map missing from the Scenes tab.'},
  {key: 'kit', icon: 'fa-solid fa-boxes-stacked', label: 'Sync item library', hint: 'Adds any missing items to The Smoke — Kit.'},
  {key: 'setup', icon: 'fa-solid fa-city', label: 'Set up the world', hint: 'Import or top up London, the kit, the people, the motors and the guides; assign the pregens.'},
  {key: 'radio', icon: 'fa-solid fa-radio', label: 'Pirate radio', hint: 'Listen in, or edit the station presets.'},
  {key: 'services', icon: 'fa-solid fa-screwdriver-wrench', label: 'Local services', hint: 'Respray, clothes or garage for the first ticked character.'},
  {key: 'firstAid', icon: 'fa-solid fa-kit-medical', label: 'First aid', hint: 'The first ticked character treats your targeted token (or themself).'},
  {key: 'rest', icon: 'fa-solid fa-bed', label: 'Rest', hint: 'A night at the flat for the first ticked character.'},
  {key: 'advance', icon: 'fa-solid fa-circle-up', label: 'Spend an advance', hint: 'For the first ticked character (award them in Rewards).'},
  {key: 'jobVehicle', icon: 'fa-solid fa-taxi', label: 'Put a job vehicle out', hint: 'Taxi, police, ambulance, fire, courier or bus beside the selected token.'},
  {key: 'diagnostics', icon: 'fa-solid fa-stethoscope', label: 'Diagnostics', hint: 'Map links, compendiums, orphaned riders.'}
]);

export class SmokeGMScreen extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {id: 'smoke-gm-screen', classes: ['smoke', 'smoke-gm-screen'], tag: 'div', position: {width: 1040, height: 780}, window: {title: 'The Smoke — GM Screen', icon: 'fa-solid fa-user-secret', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/gm-screen.hbs`, scrollable: ['.gm-main', '.gm-recipients']}};
  tab = 'checks'; selected = new Set(); band = ''; whisper = false; autoApply = true; lastEvent = null; npc = null; npcRole = '';

  get characters() { return game.actors.filter(a => a.type === 'character'); }
  get recipients() { const ids = [...this.selected].filter(id => game.actors.get(id)); if (ids.length) return ids; throw new Error('Tick at least one character on the left.'); }

  async _prepareContext() {
    const sceneIds = new Set(pcTokens(canvas?.scene).map(t => t.actorId));
    if (!this.selected.size) for (const id of sceneIds) this.selected.add(id);
    const chars = this.characters.map(a => ({id: a.id, name: a.name, img: a.img, heat: clampHeat(a.system.heat?.value), cash: a.system.cash, health: a.system.resources?.health?.value,
      xp: a.system.rep?.xp ?? 0, rep: a.system.stage ?? 1, onScene: sceneIds.has(a.id), checked: this.selected.has(a.id)}));
    const subjects = this.characters.filter(a => this.selected.has(a.id)); const party = subjects.length ? subjects : this.characters;
    const stats = r => r.map(x => STATS[x.stat]?.abbr).join(' / ');
    const lib = await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json()).catch(() => ({items: []}));
    const types = {weapon: 'Weapons', ammo: 'Ammo', armour: 'Armour', outfit: 'Clobber', gear: 'Tools & Gear', consumable: 'Food & Medicine', drug: 'Drugs', perk: 'Perks'};
    return {
      tab: this.tab, tabs: TABS.map(t => ({...t, active: t.key === this.tab})), band: this.band, whisper: this.whisper, autoApply: this.autoApply,
      bands: Object.entries(BAND).map(([key, label]) => ({key, label, selected: key === this.band})),
      characters: chars, sceneName: canvas?.scene?.name ?? '—', wanted: chars.filter(c => c.heat).length,
      quickGroups: QUICK_GROUPS.map(g => ({name: g, checks: QUICK_CHECKS.filter(q => q.group === g).map(q => ({...q, bandLabel: BAND[q.band], stats: stats(q.responses)}))})),
      teamwork: TEAMWORK.map(q => ({...q, bandLabel: BAND[q.band], stats: stats(q.responses)})),
      hazardGroups: HAZARD_GROUPS.map(g => ({name: g, hazards: HAZARDS.filter(h => h.group === g).map(h => ({...h, bandLabel: BAND[h.band], stats: stats(h.responses),
        lines: [['Just About', h.narrow], ['Bad Luck', h.costly], ['Proper Mess', h.severe]].filter(([, c]) => c).map(([label, c]) => ({label, text: describeConsequence(c) + (h.armoured && c.damage ? ' (armour helps)' : '')}))}))})),
      streetEvents: STREET_EVENTS, lastEvent: this.lastEvent, policeEvents: POLICE_EVENTS.map(p => ({...p, bandLabel: BAND[p.band], stats: stats(p.responses)})),
      heatRows: chars.filter(c => c.checked).map(c => ({...c, stars: [0, 1, 2, 3, 4, 5].map(n => ({n, on: n <= c.heat && n > 0, now: n === c.heat}))})), heatNames: HEAT.map(h => h.name),
      crimes: Object.entries(CRIMES).map(([key, c]) => ({key, label: `${c.label} (${crimeHeatText(c)})`})),
      itemGroups: Object.entries(types).map(([type, label]) => ({label, items: (lib.items || []).filter(i => i.type === type).map(i => i.name)})),
      npcRoles: NPC_ROLES.map(r => ({...r, selected: r.key === this.npcRole})), npc: this.npc ? {...this.npc, line: npcLine(this.npc)} : null,
      odds: STAT_KEYS.map(k => ({abbr: STATS[k].abbr, label: STATS[k].label, cells: partyLadder(party, k).map(b => ({label: b.label, tn: b.tn, pct: Math.round(b.chance * 100)}))})),
      oddsFor: subjects.length ? subjects.map(a => a.name).join(', ') : 'all characters',
      statOptions: STAT_KEYS.map(k => ({key: k, label: STATS[k].label})),
      npcTokens: (canvas?.scene?.tokens ?? []).filter(t => t.actor && t.actor.type === 'npc').map(t => ({id: t.id, name: t.name})),
      tools: GM_TOOLS, isGM: game.user.isGM, selfPlay: (() => { try { return game.settings.get(NS, 'playMode') === 'self'; } catch (_e) { return false; } })(),
      highs: ['Blazed', 'Wired', 'Loved Up', 'Numb', 'Giggling', 'Pumped', 'Foggy', 'Crashing', 'Wrung Out', 'Jittery', 'Roid Rage', 'Mullered']
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const on = (sel, fn, ev = 'click') => el.querySelectorAll(sel).forEach(n => n.addEventListener(ev, e => { if (ev === 'click') e.preventDefault(); Promise.resolve(fn(n, e)).catch(err => ui.notifications.warn(err.message)); }));
    const rerender = () => this.render();
    on('[data-gm-tab]', n => { this.tab = n.dataset.gmTab; rerender(); });
    on('[data-recipient]', n => { n.checked ? this.selected.add(n.dataset.recipient) : this.selected.delete(n.dataset.recipient); rerender(); }, 'change');
    on('[data-select]', n => { const m = n.dataset.select; this.selected = new Set(m === 'all' ? this.characters.map(a => a.id) : m === 'scene' ? pcTokens(canvas?.scene).map(t => t.actorId) : []); if (m === 'none') this.selected.add('__none__'); rerender(); });
    on('[data-band]', n => { this.band = n.value; }, 'change');
    on('[data-whisper]', n => { this.whisper = n.checked; }, 'change');
    on('[data-autoapply]', n => { this.autoApply = n.checked; }, 'change');
    const opts = () => ({band: this.band || null, actorIds: this.recipients});
    const post = spec => postRequest({...spec, whisper: this.whisper});
    on('[data-post-check]', n => post(quickSpec(n.dataset.postCheck, opts())));
    on('[data-post-team]', n => { const o = opts(); const actors = o.actorIds.map(id => game.actors.get(id)); const q = TEAMWORK.find(x => x.id === n.dataset.postTeam);
      const tn = partyLadder(actors, q.responses[0].stat).find(b => b.band === (o.band || q.band))?.tn; return post(teamSpec(q.id, {...o, tn})); });
    on('[data-post-hazard]', n => post(hazardSpec(n.dataset.postHazard, {...opts(), autoApply: this.autoApply})));
    on('[data-post-police]', n => post(quickSpec(n.dataset.postPolice, opts())));
    on('[data-post-custom]', () => {
      const f = el.querySelector('.gm-custom'); const statsSel = [...f.querySelectorAll('[name=cstat]:checked')].map(x => x.value);
      return post({kind: 'check', title: f.querySelector('[name=ctitle]').value || 'Roll', text: f.querySelector('[name=ctext]').value, band: f.querySelector('[name=cband]').value || this.band || 'medium',
        tn: Number(f.querySelector('[name=ctn]').value) || null, responses: statsSel.map(s => ({label: STATS[s].label, stat: s})), actorIds: this.recipients});
    });
    on('[data-post-opposed]', async () => {
      const f = el.querySelector('.gm-opposed'); const tok = canvas.scene.tokens.get(f.querySelector('[name=onpc]').value); if (!tok?.actor) throw new Error('Choose an NPC on this map.');
      const ostat = f.querySelector('[name=ostat]').value, pstat = f.querySelector('[name=pstat]').value;
      const out = await tok.actor.rollStat(ostat, {label: `${tok.name}: ${STATS[ostat].label} (opposed)`, whisper: game.users.filter(u => u.isGM).map(u => u.id)});
      if (!out?.result) return;
      return post({kind: 'opposed', title: f.querySelector('[name=otitle]').value || `Against ${tok.name}`, text: '', tn: out.result.total, opponent: {name: tok.name, stat: ostat, total: out.result.total},
        responses: [{label: STATS[pstat].label, stat: pstat}], actorIds: this.recipients});
    });
    // street
    on('[data-roll-event]', () => { this.lastEvent = rollStreetEvent(); rerender(); });
    on('[data-pick-event]', n => { this.lastEvent = STREET_EVENTS.find(e => String(e.roll) === n.dataset.pickEvent); rerender(); });
    on('[data-event-tell]', () => this.lastEvent && card('ON THE STREET', this.lastEvent.name, `<p>${esc(this.lastEvent.text)}</p>`, 'job'));
    on('[data-event-do]', () => this.lastEvent && runAuto(this.lastEvent.auto, {scene: canvas.scene, actorIds: this.recipients}));
    on('[data-auto]', n => runAuto(n.dataset.auto, {scene: canvas.scene, actorIds: n.dataset.auto === 'patrol' || n.dataset.auto === 'bike' ? [] : this.recipients}));
    // heat
    on('[data-set-heat]', n => game.actors.get(n.dataset.actor)?.setHeat(Number(n.dataset.setHeat), 'Set from the GM Screen.').then(rerender));
    on('[data-report-crime]', n => { const crime = el.querySelector('[name=crime]').value; return Promise.all(this.recipients.map(id => game.actors.get(id)?.reportCrime(crime))).then(rerender); });
    on('[data-dispatch]', () => request('heat.respond', {sceneId: canvas.scene.id}));
    on('[data-standdown]', () => request('heat.standDown', {sceneId: canvas.scene.id}));
    on('[data-busted]', () => Promise.all(this.recipients.map(id => game.smoke.heat.busted(game.actors.get(id)))));
    on('[data-wasted]', () => Promise.all(this.recipients.map(id => game.smoke.heat.wasted(game.actors.get(id)))));
    // rewards
    const reward = data => request('gm.reward', {actorIds: this.recipients, ...data}).then(() => setTimeout(rerender, 300));
    on('[data-give-cash]', n => reward({cash: Number(el.querySelector('[name=cash]').value || 0) * (n.dataset.giveCash === 'take' ? -1 : 1)}));
    on('[data-give-xp]', () => reward({xp: Number(el.querySelector('[name=xp]').value || 0)}));
    on('[data-reward]', n => reward({[n.dataset.reward]: true}));
    on('[data-reward-rep]', n => reward({rep: n.dataset.rewardRep}));
    on('[data-give-item]', () => reward({itemName: el.querySelector('[name=giveItem]').value, qty: Number(el.querySelector('[name=giveQty]').value || 1)}));
    // npcs
    on('[data-npc-role]', n => { this.npcRole = n.value; }, 'change');
    on('[data-npc-make]', () => { this.npc = makeNPC(this.npcRole || null); rerender(); });
    on('[data-npc-post]', () => this.npc && card('MADE UP', `${this.npc.name} — ${this.npc.role}`, `<p>${esc(npcLine(this.npc))} · Health ${Math.round(this.npc.health)}</p>`, '', {whisper: game.users.filter(u => u.isGM).map(u => u.id)}));
    on('[data-npc-place]', () => { if (!this.npc) throw new Error('Make one first.'); const c = canvas.stage?.pivot ?? {x: canvas.scene.width / 2, y: canvas.scene.height / 2}; return request('gm.placeNPC', {sceneId: canvas.scene.id, npc: this.npc, x: c.x, y: c.y}); });
    on('[data-spawn]', n => { const k = n.dataset.spawn; if (k === 'fill') return request('traffic.populate', {sceneId: canvas.scene.id}); if (k === 'clear') return request('traffic.clear', {sceneId: canvas.scene.id}); return runAuto(k, {scene: canvas.scene, actorIds: []}); });
    // tools
    on('[data-tool]', n => openTool(n.dataset.tool, [...this.selected].find(id => game.actors.get(id))));
    on('[data-play-mode]', n => game.smoke.missions.setMode(n.dataset.playMode));
    on('[data-preview-high]', n => game.smoke.drugFX.preview(n.dataset.previewHigh, 10));
  }
}

export async function openTool(key, actorId = null) {
  const actor = actorId ? game.actors.get(actorId) : null, s = game.smoke;
  const need = () => { if (!actor) throw new Error('Tick a character first.'); return actor; };
  switch (key) {
    case 'streetControl': return s.openStreetControl();
    case 'combat': return s.openCombat?.();
    case 'missions': return s.openMissions?.();
    case 'shop': return s.openShop?.(need());
    case 'creator': return s.openCreator?.(null);
    case 'levelUp': return s.openLevelUp?.(need());
    case 'phone': return s.openPhone();
    case 'maps': return s.content.importAllMaps();
    case 'kit': { const n = await s.content.syncItemLibrary(); return ui.notifications.info(n ? `Added ${n} item(s) to The Smoke — Kit.` : 'The item library is complete.'); }
    case 'guides': { const pack = game.packs.get(`${NS}.guides`); return pack?.render(true); }
    case 'setup': return s.setup();
    case 'radio': return s.radio.open(actor);
    case 'services': return s.services(need());
    case 'firstAid': return s.firstAid(need());
    case 'rest': return s.rest(need());
    case 'advance': return s.advance(need());
    case 'diagnostics': return s.diagnostics();
    case 'jobVehicle': { const type = await foundry.applications.api.DialogV2.wait({window: {title: 'Put a job vehicle out'}, content: '<p>Which shift?</p>',
      buttons: ['taxi', 'police', 'ambulance', 'fire', 'courier', 'bus'].map(k => ({action: k, label: k[0].toUpperCase() + k.slice(1)}))}); return type ? s.vehicles.spawnJob(type) : null; }
  }
  return null;
}
let screen = null;
export function openGMScreen() { if (!game.user.isGM) return ui.notifications.warn('The GM Screen is for the GM.'); screen ??= new SmokeGMScreen(); screen.render({force: true}); return screen; }
Hooks.on('updateActor', a => { if (screen?.rendered && a.type === 'character') screen.render(); });
