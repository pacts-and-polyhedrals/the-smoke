import {NS,STATS,DEFAULT_ICONS} from './module/config.mjs';
import {CharacterData,NPCData,VehicleData,WeaponData,ArmourData,GearData,ConditionData,PerkData} from './module/data-models.mjs';
import {SmokeActor,SmokeItem} from './module/documents.mjs';
import {registerSheets} from './module/applications/sheets.mjs';
import {Blower,StreetControl,characterCreator} from './module/applications/panels.mjs';
import {setupWorld,openGuide,diagnostics,installWorld,migrateWorld,VERSION} from './module/content/setup.mjs';
import {SmokeCombatant,installGameplay,firstAid,rest,advance} from './module/gameplay.mjs';
import {installChat,installSceneControls} from './module/ui.mjs';
import {installNet,isLeader} from './module/world/net.mjs';
import {registerTrafficSettings,installTraffic,populate,clearStreetLife} from './module/world/traffic.mjs';
import {registerHeatSettings,installHeat,heatAPI} from './module/world/heat.mjs';
import {registerJobSettings,installJobs,jobsAPI} from './module/world/jobs.mjs';
import {installVehicleBoarding,boardVehicle,exitVehicle,moveVehicle} from './module/vehicles/vehicle-boarding.mjs';
import {installVehicleAbilities} from './module/vehicles/vehicle-abilities.mjs';
import {installMapTransit,crossToNextMap,openTravelDialog,importAllMaps} from './module/map/map-transit.mjs';
import {installMapZones} from './module/map/map-zones.mjs';
import {installSceneRepair} from './module/map/scene-repair.mjs';
import {installTheft} from './module/world/theft.mjs';
import {registerServiceSettings,installServices,openServices} from './module/world/services.mjs';
let phoneApp,controlApp;
Hooks.once('init',()=>{
  CONFIG.Actor.documentClass=SmokeActor;CONFIG.Item.documentClass=SmokeItem;CONFIG.Combatant.documentClass=SmokeCombatant;
  Object.assign(CONFIG.Actor.dataModels,{character:CharacterData,npc:NPCData,vehicle:VehicleData});
  Object.assign(CONFIG.Item.dataModels,{weapon:WeaponData,armour:ArmourData,gear:GearData,condition:ConditionData,perk:PerkData});
  CONFIG.Actor.typeLabels={character:'TYPES.Actor.character',npc:'TYPES.Actor.npc',vehicle:'TYPES.Actor.vehicle'};
  CONFIG.Item.typeLabels=Object.fromEntries(['weapon','armour','gear','condition','perk'].map(k=>[k,`TYPES.Item.${k}`]));
  CONFIG.Actor.typeIcons={character:DEFAULT_ICONS.character,npc:DEFAULT_ICONS.npc,vehicle:DEFAULT_ICONS.vehicle};
  CONFIG.Item.typeIcons=Object.fromEntries(['weapon','armour','gear','condition','perk'].map(k=>[k,DEFAULT_ICONS[k]]));
  CONFIG.Combat.initiative={formula:'1d6 + @statMods.mov',decimals:0};
  CONFIG.Actor.trackableAttributes={character:{bar:['resources.health','resources.hustle'],value:['cash','heat.value']},npc:{bar:['resources.health'],value:[]},vehicle:{bar:['vehicle.body','vehicle.fuel'],value:[]}};
  registerSheets();registerTrafficSettings();registerHeatSettings();registerJobSettings();registerServiceSettings();
  game.settings.register(NS,'worldSetup',{scope:'world',config:false,type:Boolean,default:false});
  game.settings.register(NS,'contentVersion',{scope:'world',config:false,type:String,default:''});
  game.settings.register(NS,'migrationVersion',{scope:'world',config:false,type:Number,default:0});
  game.settings.registerMenu(NS,'streetControl',{name:'Street Control & world setup',label:'Open Street Control',hint:'Import the game, manage Street Life, Heat and shifts.',icon:'fa-solid fa-city',type:StreetControl,restricted:true});
  installMapZones();installSceneRepair();installSceneControls();
  game.smoke={version:VERSION,stats:STATS,STATS,heat:heatAPI,jobs:jobsAPI,traffic:{populate,clear:clearStreetLife},vehicles:{board:boardVehicle,exit:exitVehicle,move:moveVehicle},travel:{cross:crossToNextMap,picker:openTravelDialog,open:openTravelDialog},
    setup:setupWorld,openGuide,diagnostics,firstAid,rest,advance,services:openServices,creator:characterCreator,content:{installStarter:installWorld,importAllMaps,version:VERSION},
    phone(actor=null){if(phoneApp?.rendered){if(actor)phoneApp._actorId=actor.id;return phoneApp.render(false);}phoneApp=new Blower({actorId:actor?.id});return phoneApp.render(true);},
    control(){if(!game.user.isGM)return;controlApp??=new StreetControl();return controlApp.render(true);}
  };
  game.smoke.openPhone=(actor=null)=>game.smoke.phone(actor);game.smoke.openStreetControl=()=>game.smoke.control();
});
Hooks.once('ready',async()=>{
  installNet();installVehicleBoarding();installVehicleAbilities();installMapTransit();installTheft();installTraffic();installHeat();installJobs();installGameplay();installServices();installChat();
  await migrateWorld();
  if(isLeader()&&!game.settings.get(NS,'worldSetup'))game.smoke.control();
  console.info('The Smoke | Ready · Keep your bottle.');
});
