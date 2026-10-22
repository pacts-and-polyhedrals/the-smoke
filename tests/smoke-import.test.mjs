import {hooks} from './runtime-stub.mjs';
import assert from 'assert';
// Foundry supplies the installed system version separately from the journal content edition.
game.system.version=JSON.parse((await import('fs')).readFileSync(new URL('../system.json', import.meta.url), 'utf8')).version;
await import('../the-smoke.mjs');
for (const f of hooks.init || []) f();
assert.ok(game.smoke, 'game.smoke API exists');
assert.ok(CONFIG.Actor.dataModels.character && CONFIG.Actor.dataModels.vehicle, 'actor data models registered');
assert.ok(CONFIG.Item.dataModels.weapon && CONFIG.Item.dataModels.perk, 'item data models registered');
for (const f of hooks.ready || []) await f();
const controls = {tokens: {tools: {select: {}}}}; for (const f of hooks.getSceneControlButtons || []) f(controls);
for (const k of ['blower', 'radio', 'satnav', 'smokeCombat', 'missions', 'smokeGMScreen', 'streetControl']) assert.ok(controls.tokens.tools[k], `${k} scene control added`);
// Street Control: one press, one window (a double fire is ignored), and it opens
let opened = 0; const realControl = game.smoke.control; game.smoke.control = () => { opened++; };
controls.tokens.tools.streetControl.onChange(); controls.tokens.tools.streetControl.onChange();
assert.equal(opened, 1, 'one press opens Street Control once'); assert.equal(controls.tokens.tools.streetControl.onClick, undefined, 'no deprecated onClick');
game.smoke.control = realControl; globalThis.canvas = {scene: null};
assert.ok(await game.smoke.control(), 'Street Control opens');
for (const k of ['phone', 'radio', 'satnav', 'setup', 'firstAid', 'rest', 'advance', 'services', 'quickBuild', 'openCreator', 'openLevelUp', 'openShop', 'openCombat', 'openMissions', 'openGMScreen', 'control', 'openGuide', 'diagnostics'])
  assert.ok(game.smoke[k], `game.smoke.${k}`);
assert.ok(CONFIG.Item.dataModels.ammo && CONFIG.Item.dataModels.outfit, 'the 0.2 item types are registered');
for (const k of ['chase', 'incidents', 'crewBar', 'drugFX', 'clock']) assert.ok(game.smoke[k], `game.smoke.${k} (0.5)`);
assert.equal(game.smoke.version, JSON.parse((await import('fs')).readFileSync(new URL('../system.json', import.meta.url), 'utf8')).version);
console.log('import + init + ready: ok;', Object.keys(hooks).length, 'hooks registered');
process.exit(0);
