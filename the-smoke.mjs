// THE SMOKE — a London crime sandbox for Foundry VTT v14.
// Covenant dice (Effort die + Stat die, exploding, solved difficulty bands) with GTA-style stats; Altered Carbon
// vehicles, boarding and map transit; a traced street atlas of Hackney and around; Street Life, Heat and job shifts.
import {NS, SOCKET, STATS, DEFAULT_ICONS} from './module/config.mjs';
import * as Models from './module/data-models.mjs';
import {SmokeActor, SmokeItem} from './module/documents.mjs';
import {SmokeActorSheet, SmokeVehicleSheet, SmokeItemSheet} from './module/apps/sheets.mjs';
import {SmokePhone, StreetControl, openPhone} from './module/apps/phone.mjs';
import {installMapZones} from './module/map/map-zones.mjs';
import {installSceneRepair, repairAllSceneBackgrounds} from './module/map/scene-repair.mjs';
import {installMapTransit, crossToNextMap, openTravelDialog} from './module/map/map-transit.mjs';
import {installVehicleBoarding, boardVehicle, exitVehicle, openVehicleBoardDialog} from './module/vehicles/vehicle-boarding.mjs';
import {installVehicleAbilities, toggleLights, scanPlate, ABILITIES} from './module/vehicles/vehicle-abilities.mjs';
import {installNet, request} from './module/world/net.mjs';
import {installTheft, nickIt, carjack, sellVehicle} from './module/world/theft.mjs';
import {installTraffic, registerTrafficSettings, populate, clearStreetLife} from './module/world/traffic.mjs';
import {installHeat, registerHeatSettings, heatAPI} from './module/world/heat.mjs';
import {installJobs, registerJobSettings, jobsAPI} from './module/world/jobs.mjs';
import {installContent, contentAPI} from './module/content.mjs';
import * as Rules from './module/rules/core.mjs';
import * as Difficulty from './module/rules/difficulty.mjs';

const esc = v => foundry.utils.escapeHTML(String(v ?? ''));
const safe = (label, fn) => { try { fn(); } catch (error) { console.error(`The Smoke | ${label}`, error); } };

Hooks.once('init', () => {
  console.log('The Smoke | Initialising');
  CONFIG.Actor.documentClass = SmokeActor;
  CONFIG.Item.documentClass = SmokeItem;
  Object.assign(CONFIG.Actor.dataModels, {character: Models.CharacterData, npc: Models.NPCData, vehicle: Models.VehicleData});
  Object.assign(CONFIG.Item.dataModels, {weapon: Models.WeaponData, armour: Models.ArmourData, gear: Models.GearData, condition: Models.ConditionData, perk: Models.PerkData});
  CONFIG.Actor.typeIcons = {...(CONFIG.Actor.typeIcons || {}), character: 'fa-solid fa-user', npc: 'fa-solid fa-user-secret', vehicle: 'fa-solid fa-car'};
  CONFIG.Actor.trackableAttributes = {character: {bar: ['resources.health', 'resources.hustle'], value: ['heat.value', 'cash']}, npc: {bar: ['resources.health'], value: []}, vehicle: {bar: ['vehicle.body', 'vehicle.fuel'], value: []}};
  CONFIG.Combat.initiative = {formula: '1d6x + @statMods.mov', decimals: 0};
  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(foundry.documents.Actor, NS, SmokeActorSheet, {types: ['character', 'npc'], makeDefault: true, label: 'The Smoke — Character'});
  DSC.registerSheet(foundry.documents.Actor, NS, SmokeVehicleSheet, {types: ['vehicle'], makeDefault: true, label: 'The Smoke — Vehicle'});
  DSC.registerSheet(foundry.documents.Item, NS, SmokeItemSheet, {makeDefault: true, label: 'The Smoke — Item'});
  for (const [k, f] of Object.entries({eq: (a, b) => a === b || String(a) === String(b), gt: (a, b) => Number(a) > Number(b), times: (n, block) => { let o = ''; for (let i = 0; i < Number(n); i++) o += block.fn(i); return o; }, json: v => JSON.stringify(v)}))
    if (!Handlebars.helpers[k]) Handlebars.registerHelper(k, f);
  registerTrafficSettings(); registerHeatSettings(); registerJobSettings();
  game.settings.register(NS, 'pausedAt', {scope: 'world', config: false, type: Number, default: 0});
  game.settings.register(NS, 'contentVersion', {scope: 'world', config: false, type: String, default: ''});
  game.settings.registerMenu(NS, 'streetControl', {name: 'The Smoke — Street Control', label: 'Open Street Control', hint: 'Street Life, police response, job clocks and Heat.', icon: 'fa-solid fa-tower-broadcast', type: StreetControl, restricted: true});
  safe('map zones', installMapZones); safe('scene repair', installSceneRepair);
  game.smoke = {
    version: '0.1.0', Rules, Difficulty, STATS, ABILITIES,
    heat: heatAPI, jobs: jobsAPI, content: contentAPI,
    vehicles: {board: boardVehicle, exit: exitVehicle, openBoard: openVehicleBoardDialog, lights: toggleLights, scanPlate, nick: nickIt, carjack, sell: sellVehicle},
    travel: {cross: crossToNextMap, open: openTravelDialog},
    streetLife: {populate: scene => request('traffic.populate', {sceneId: (scene ?? canvas.scene).id}), clear: scene => request('traffic.clear', {sceneId: (scene ?? canvas.scene).id})},
    openPhone, openStreetControl: () => new StreetControl().render({force: true}), repairScenes: repairAllSceneBackgrounds
  };
});

Hooks.once('ready', async () => {
  safe('net', installNet);
  safe('vehicle boarding', installVehicleBoarding);
  safe('vehicle abilities', installVehicleAbilities);
  safe('map transit', installMapTransit);
  safe('theft', installTheft);
  safe('traffic', installTraffic);
  safe('heat', installHeat);
  safe('jobs', installJobs);
  try { await installContent(); } catch (error) { console.error('The Smoke | content', error); }
  console.log('The Smoke | Ready');
});

/* ------------------------------------------------------------------ scene controls: the phone and the GM panel */
Hooks.on('getSceneControlButtons', controls => {
  const phone = {name: 'smokePhone', title: 'Your phone (jobs, Heat, cash)', icon: 'fa-solid fa-mobile-screen', button: true, visible: true, onChange: () => openPhone(), onClick: () => openPhone()};
  const gm = {name: 'smokeStreet', title: 'Street Control (GM)', icon: 'fa-solid fa-tower-broadcast', button: true, visible: game.user.isGM, onChange: () => game.smoke.openStreetControl(), onClick: () => game.smoke.openStreetControl()};
  if (Array.isArray(controls)) { const t = controls.find(c => c.name === 'token'); t?.tools?.push(phone); if (game.user.isGM) t?.tools?.push(gm); return; }
  const t = controls.tokens ?? controls.token; if (!t?.tools) return;
  const n = Object.keys(t.tools).length;
  t.tools.smokePhone = {...phone, order: n + 1};
  if (game.user.isGM) t.tools.smokeStreet = {...gm, order: n + 2};
});

/* ------------------------------------------------------------------ chat card buttons */
async function actorFrom(uuid) { const d = await fromUuid(uuid); return d?.actor ?? d; }
Hooks.on('renderChatMessageHTML', (message, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0]; if (!root) return;
  const on = (sel, fn) => root.querySelectorAll(sel).forEach(b => b.addEventListener('click', ev => { ev.preventDefault(); Promise.resolve(fn(b)).catch(e => ui.notifications.warn(e.message)); }));
  root.querySelectorAll('.gm').forEach(b => { if (!game.user.isGM) b.remove(); });
  on('[data-smoke-roll]', async b => {
    const actor = await actorFrom(b.dataset.smokeRoll); if (!actor) throw new Error('Character not found.');
    if (!actor.isOwner) throw new Error(`${actor.name} is not yours to roll for.`);
    let context = null; try { context = b.dataset.context ? JSON.parse(b.dataset.context) : null; } catch (_e) {}
    const out = await actor.rollStat(b.dataset.stat, {band: b.dataset.band && b.dataset.band !== 'null' ? b.dataset.band : null, tn: b.dataset.tn ? Number(b.dataset.tn) : null, label: b.dataset.label, context});
    const after = b.dataset.after;
    if (after && out?.result && game.user.isGM === false && !out.result.success && ['legIt', 'talkOut'].includes(after)) ui.notifications.warn('It did not work. The GM decides: Busted, or fight.');
  });
  on('[data-smoke-damage]', async b => { const a = await actorFrom(b.dataset.smokeDamage); if (!a) return; if (!a.isOwner && !game.user.isGM) throw new Error('Ask the GM to apply it.'); await a.applyDamage(Number(b.dataset.amount)); });
  on('[data-smoke-condition]', async b => { const a = await actorFrom(b.dataset.smokeCondition); if (!a) return; if (!a.isOwner) throw new Error('Ask the GM to apply it.'); await a.addCondition(b.dataset.condition); });
  on('[data-smoke-crime]', async b => { const a = await actorFrom(b.dataset.smokeCrime); if (a) await heatAPI.reportCrime(a, b.dataset.crime); });
  on('[data-smoke-wasted]', async b => { const a = await actorFrom(b.dataset.smokeWasted); if (a) await heatAPI.wasted(a); });
  on('[data-smoke-busted]', async b => { const a = await actorFrom(b.dataset.smokeBusted); if (a) await heatAPI.busted(a); });
  on('[data-smoke-job-accept]', b => jobsAPI.acceptCall(b.dataset.smokeJobAccept));
  on('[data-smoke-job-decline]', b => jobsAPI.declineCall(b.dataset.smokeJobDecline));
});

/* ------------------------------------------------------------------ token HUD: Heat at a glance, Wasted/Busted for the GM */
Hooks.on('renderTokenHUD', (hud, html) => {
  try {
    const root = html instanceof HTMLElement ? html : html?.[0]; const doc = hud.document ?? hud.object?.document;
    if (!root || !doc || doc.actor?.type !== 'character' || !game.user.isGM) return;
    const col = root.querySelector('.col.left'); if (!col || col.querySelector('.smoke-gm-hud')) return;
    const add = (icon, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'control-icon smoke-gm-hud'; b.dataset.tooltip = title; b.innerHTML = `<i class="${icon}" inert></i>`;
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); Promise.resolve(fn()).catch(e => ui.notifications.warn(e.message)); }); col.append(b); };
    add('fa-solid fa-star', 'Heat +1', () => doc.actor.changeHeat(1, 'The GM turns up the heat.'));
    add('fa-regular fa-star', 'Heat −1', () => doc.actor.changeHeat(-1, 'The heat dies down.'));
    add('fa-solid fa-handcuffs', 'Busted', () => heatAPI.busted(doc.actor));
    add('fa-solid fa-skull', 'Wasted', () => heatAPI.wasted(doc.actor));
  } catch (error) { console.warn('The Smoke | GM HUD', error); }
});
