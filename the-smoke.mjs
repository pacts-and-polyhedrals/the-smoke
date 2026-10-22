// THE SMOKE — a London crime sandbox for Foundry VTT v14.
// Covenant dice (Effort die + Stat die, exploding, solved difficulty bands) with GTA-style stats; Altered Carbon
// vehicles, boarding and map transit; a traced street atlas of Hackney and around; Street Life, Heat, job shifts,
// live pirate radio, local services, shops and missions; speed-dice combat; a GM Screen.
import {NS, STATS, DEFAULT_ICONS} from './module/config.mjs';
import * as Models from './module/data-models.mjs';
import {SmokeActor, SmokeItem} from './module/documents.mjs';
import {SmokeActorSheet, SmokeVehicleSheet, SmokeItemSheet} from './module/apps/sheets.mjs';
import {StreetControl, openPhone, quickBuild, spawnJobVehicle, showJobRoute} from './module/apps/phone.mjs';
import {installMapZones} from './module/map/map-zones.mjs';
import {installSceneRepair, repairAllSceneBackgrounds} from './module/map/scene-repair.mjs';
import {installMapTransit, crossToNextMap, openTravelDialog, importAllMaps} from './module/map/map-transit.mjs';
import {installMissionProps, propsAPI} from './module/world/mission-props.mjs';
import {registerGraffitiSettings,installGraffiti,graffitiAPI} from './module/graffiti/runtime.mjs';
import {installVehicleBoarding, boardVehicle, exitVehicle, exitAllFromVehicle, moveVehicle, openVehicleBoardDialog} from './module/vehicles/vehicle-boarding.mjs';
import {installVehicleAbilities, toggleLights, scanPlate, ABILITIES} from './module/vehicles/vehicle-abilities.mjs';
import {installNet, isLeader, request} from './module/world/net.mjs';
import {installTheft, nickIt, carjack, sellVehicle} from './module/world/theft.mjs';
import {installTraffic, registerTrafficSettings, populate, clearStreetLife} from './module/world/traffic.mjs';
import {installHeat, registerHeatSettings, heatAPI} from './module/world/heat.mjs';
import {installJobs, registerJobSettings, jobsAPI} from './module/world/jobs.mjs';
import {contentAPI, setupWorld, openGuide, diagnostics, migrateWorld, VERSION} from './module/content.mjs';
import {installItems, itemsAPI} from './module/world/items.mjs';
import {installRequests} from './module/gm/requests.mjs';
import {SmokeGMScreen, openGMScreen} from './module/apps/gm-screen.mjs';
import './module/gm/automation.mjs';
import {openShop} from './module/apps/shop.mjs';
import {combatAPI, registerCombatSettings, installCombat} from './module/combat/combat.mjs';
import {installMenuFit} from './module/apps/fit-menus.mjs';
import {openCombat} from './module/apps/combat-console.mjs';
import {openCreator} from './module/apps/creator.mjs';
import {openLevelUp} from './module/apps/levelling.mjs';
import {openTagStudio} from './module/apps/tag-studio.mjs';
import {registerMissionSettings, installMissions, missionsAPI} from './module/world/missions.mjs';
import {castAPI} from './module/world/cast.mjs';
import {openMissions} from './module/apps/mission-board.mjs';
import {shopAPI} from './module/world/shops.mjs';
import {SmokeCombatant, installGameplay, firstAid, rest, advance} from './module/gameplay.mjs';
import {registerServiceSettings, installServices, openServices} from './module/world/services.mjs';
import {registerRadioSettings, installRadio, radioAPI, selectRadioActor, migrateRadioPresets} from './module/radio/radio.mjs';
import {registerRadioWarSettings,installRadioWar,syncRadioWarLocations,radioWarAPI} from './module/radio/war.mjs';
import {installChat, installSceneControls, installTokenHUD} from './module/ui.mjs';
import {installPlayerInteractions} from './module/interaction/player-context.mjs';
import {registerSatnavSettings, installSatnav, satnavAPI} from './module/map/satnav.mjs';
import {installIncidents, incidentsAPI, recoverCompletedPrompts} from './module/world/incidents.mjs';
import {registerChaseSettings, installChase, chaseAPI, migrateChasePacing} from './module/world/chase.mjs';
import {installPursuit, pursuitAPI} from './module/world/pursuit.mjs';
import {installDriveGauge} from './module/map/drive-gauge.mjs';
import {registerCrewBarSettings, installCrewBar, crewBarAPI} from './module/apps/crew-bar.mjs';
import {registerDrugFxSettings, installDrugFx, drugFxAPI} from './module/apps/drug-fx.mjs';
import {registerWatchSettings, installWatch, watchAPI} from './module/apps/banana-watch.mjs';
import * as Rules from './module/rules/core.mjs';
import * as Difficulty from './module/rules/difficulty.mjs';

const safe = (label, fn) => { try { fn(); } catch (error) { console.error(`The Smoke | ${label}`, error); } };
const ITEM_TYPES = ['weapon', 'armour', 'gear', 'condition', 'perk', 'ammo', 'drug', 'consumable', 'outfit'];

Hooks.once('init', () => {
  try { document.body?.classList.add('smoke-system'); } catch (_e) {}   // scopes the dialog scrolling rules to worlds running The Smoke
  console.log('The Smoke | Initialising');
  // Before the first map is drawn: Foundry fixes each token's right-click handlers when it draws it (0.5.23).
  safe('player right-click actions', installPlayerInteractions);
  CONFIG.Actor.documentClass = SmokeActor;
  CONFIG.Item.documentClass = SmokeItem;
  CONFIG.Combatant.documentClass = SmokeCombatant;
  Object.assign(CONFIG.Actor.dataModels, {character: Models.CharacterData, npc: Models.NPCData, vehicle: Models.VehicleData});
  Object.assign(CONFIG.Item.dataModels, {weapon: Models.WeaponData, armour: Models.ArmourData, gear: Models.GearData, condition: Models.ConditionData, perk: Models.PerkData,
    ammo: Models.AmmoData, drug: Models.DrugData, consumable: Models.ConsumableData, outfit: Models.OutfitData});
  CONFIG.Actor.typeLabels = {character: 'TYPES.Actor.character', npc: 'TYPES.Actor.npc', vehicle: 'TYPES.Actor.vehicle'};
  CONFIG.Item.typeLabels = Object.fromEntries(ITEM_TYPES.map(k => [k, `TYPES.Item.${k}`]));
  CONFIG.Actor.typeIcons = {...(CONFIG.Actor.typeIcons || {}), character: 'fa-solid fa-user', npc: 'fa-solid fa-user-secret', vehicle: 'fa-solid fa-car'};
  CONFIG.Item.typeIcons = {...(CONFIG.Item.typeIcons || {}), ...Object.fromEntries(ITEM_TYPES.map(k => [k, DEFAULT_ICONS[k]]))};
  CONFIG.Actor.trackableAttributes = {character: {bar: ['resources.health', 'resources.hustle'], value: ['heat.value', 'cash']}, npc: {bar: ['resources.health'], value: []}, vehicle: {bar: ['vehicle.body', 'vehicle.fuel'], value: []}};
  CONFIG.Combat.initiative = {formula: '1d6x + @statMods.mov', decimals: 0};
  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(foundry.documents.Actor, NS, SmokeActorSheet, {types: ['character', 'npc'], makeDefault: true, label: 'The Smoke — Character'});
  DSC.registerSheet(foundry.documents.Actor, NS, SmokeVehicleSheet, {types: ['vehicle'], makeDefault: true, label: 'The Smoke — Vehicle'});
  DSC.registerSheet(foundry.documents.Item, NS, SmokeItemSheet, {makeDefault: true, label: 'The Smoke — Item'});
  for (const [k, f] of Object.entries({eq: (a, b) => a === b || String(a) === String(b), gt: (a, b) => Number(a) > Number(b), times: (n, block) => { let o = ''; for (let i = 0; i < Number(n); i++) o += block.fn(i); return o; }, json: v => JSON.stringify(v)}))
    if (!Handlebars.helpers[k]) Handlebars.registerHelper(k, f);
  registerTrafficSettings(); registerHeatSettings(); registerJobSettings(); registerCombatSettings(); registerMissionSettings(); registerGraffitiSettings(); registerServiceSettings(); registerRadioSettings(); registerRadioWarSettings(); registerSatnavSettings(); registerChaseSettings(); registerCrewBarSettings(); registerDrugFxSettings(); registerWatchSettings();
  game.settings.register(NS, 'worldSetup', {scope: 'world', config: false, type: Boolean, default: false});
  game.settings.register(NS, 'contentVersion', {scope: 'world', config: false, type: String, default: ''});
  game.settings.register(NS, 'migrationVersion', {scope: 'world', config: false, type: Number, default: 0});
  game.settings.register(NS, 'lockPlayerSheets', {name: 'Character sheets: lock players\' progress fields', hint: 'On: players cannot type new values into their own cash, stash, XP, Rep, Rep level, stats, advances or Health/Hustle maximums — they change through play (shops, jobs, levelling) or by the GM. Off (default): owners can edit everything, as Foundry normally allows.', scope: 'world', config: true, type: Boolean, default: false});
  game.settings.registerMenu(NS, 'streetControl', {name: 'Street Control & world setup', label: 'Open Street Control', hint: 'Set up the world, manage Street Life, police, Heat, advances and shifts.', icon: 'fa-solid fa-city', type: StreetControl, restricted: true});
  game.settings.registerMenu(NS, 'gmScreen', {name: 'The Smoke — GM Screen', label: 'Open the GM Screen', hint: 'Roll requests, hazards, street and police events, rewards, NPCs, odds and every GM tool.', icon: 'fa-solid fa-user-secret', type: SmokeGMScreen, restricted: true});
  safe('map zones', installMapZones); safe('scene repair', installSceneRepair); safe('scene controls', installSceneControls);
  let controlApp = null;
  game.smoke = {
    version: game.system.version ?? VERSION, Rules, Difficulty, STATS, ABILITIES,
    heat: heatAPI, chase: chaseAPI, pursuit: pursuitAPI, graffiti: graffitiAPI, crewBar: crewBarAPI, drugFX: drugFxAPI, clock: watchAPI, incidents: incidentsAPI, jobs: jobsAPI, content: contentAPI, items: itemsAPI, radio: radioAPI, radioWar: radioWarAPI, satnav: satnavAPI, shops: shopAPI, combat: combatAPI, missions: missionsAPI, props: propsAPI, cast: castAPI,
    traffic: {populate, clear: clearStreetLife},
    streetLife: {populate: scene => request('traffic.populate', {sceneId: (scene ?? canvas.scene).id}), clear: scene => request('traffic.clear', {sceneId: (scene ?? canvas.scene).id})},
    request,
    vehicles: {board: boardVehicle, exit: exitVehicle, exitAll: (vt, options = {}) => exitAllFromVehicle(vt, options), move: moveVehicle, openBoard: openVehicleBoardDialog, lights: toggleLights, scanPlate, nick: nickIt, carjack, sell: sellVehicle, spawnJob: spawnJobVehicle},
    travel: {cross: crossToNextMap, open: openTravelDialog, picker: openTravelDialog},
    setup: setupWorld, openGuide, diagnostics, firstAid, rest, advance, services: openServices, route: showJobRoute,
    creator: quickBuild, quickBuild, openCreator, openLevelUp, openShop, openCombat, openMissions, openGMScreen, openTagStudio,
    phone: (actor = null) => openPhone(actor), openPhone: (actor = null) => openPhone(actor),
    tags: {open: (actor = null, options={}) => openTagStudio(actor,options)},
    control: async () => {
      if (!game.user.isGM) { ui.notifications.warn('Street Control is for the GM.'); return null; }
      // reuse the open window (from here or Game Settings), bring it forward; start afresh if the last one broke
      const open = foundry.applications.instances?.get?.('smoke-street-control');
      if (open && open !== controlApp) controlApp = open;
      if (controlApp && (controlApp.state === -3 || controlApp._smokeBroken)) controlApp = null;
      controlApp ??= new StreetControl();
      try { await controlApp.render({force: true}); if (controlApp.minimized) await controlApp.maximize?.(); controlApp.bringToFront?.(); return controlApp; }
      catch (error) { controlApp._smokeBroken = true; console.error('The Smoke | Street Control', error); ui.notifications.error(`Street Control could not open: ${error.message}`); return null; }
    },
    openStreetControl: () => game.smoke.control(),
    repairScenes: repairAllSceneBackgrounds, importAllMaps, selectRadioActor
  };
});

Hooks.once('ready', async () => {
  safe('net', installNet);
  try { await migrateChasePacing(); } catch (error) { console.error('The Smoke | chase defaults upgrade', error); }
  safe('vehicle boarding', installVehicleBoarding);
  safe('player right-click actions', installPlayerInteractions);
  safe('vehicle abilities', installVehicleAbilities);
  safe('map transit', installMapTransit);
  safe('theft', installTheft);
  safe('traffic', installTraffic);
  safe('heat', installHeat);
  safe('incidents', installIncidents);
  if (isLeader() && game.user.isGM) try { await recoverCompletedPrompts(); } catch (error) { console.error('The Smoke | driving check recovery', error); }
  safe('chases', installChase);
  safe('police decisions', installPursuit);
  safe('drive gauge', installDriveGauge);
  safe('crew bar', installCrewBar);
  safe('drug effects', installDrugFx);
  safe('Banana Watch', installWatch);
  safe('jobs', installJobs);
  safe('combat', installCombat);
  safe('gameplay', installGameplay);
  safe('services', installServices);
  try { await migrateRadioPresets(); } catch (error) { console.warn('The Smoke | radio preset upgrade', error); }
  safe('radio', installRadio);
  safe('radio war maps', installRadioWar);
  safe('sat nav', installSatnav);
  safe('items', installItems);
  safe('requests', installRequests);
  safe('missions', installMissions);
  safe('graffiti decals', installGraffiti);
  safe('mission property', () => { void installMissionProps().catch(e=>console.warn('The Smoke | mission property',e)); });
  safe('chat', installChat);
  safe('token HUD', installTokenHUD);
  safe('menus that fit the screen', installMenuFit);
  try { await migrateWorld(); } catch (error) { console.error('The Smoke | setup/upgrade', error); }
  if(isLeader()&&game.user.isGM)try{await syncRadioWarLocations();}catch(error){console.error('The Smoke | radio war location import',error);}
  if (isLeader() && game.user.isGM && !game.settings.get(NS, 'worldSetup') && !game.settings.get(NS, 'contentVersion')) game.smoke.control();
  console.log('The Smoke | Ready · Keep your bottle.');
});
