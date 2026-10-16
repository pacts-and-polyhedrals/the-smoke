import {hooks} from './runtime-stub.mjs';
import assert from 'assert';
await import('../the-smoke.mjs');
for (const f of hooks.init || []) f();
assert.ok(game.smoke, 'game.smoke API exists');
assert.ok(CONFIG.Actor.dataModels.character && CONFIG.Actor.dataModels.vehicle, 'actor data models registered');
assert.ok(CONFIG.Item.dataModels.weapon && CONFIG.Item.dataModels.perk, 'item data models registered');
for (const f of hooks.ready || []) await f();
const controls = {tokens: {tools: {select: {}}}}; for (const f of hooks.getSceneControlButtons || []) f(controls);
for (const k of ['blower', 'radio', 'satnav', 'smokeCombat', 'smokeGMScreen', 'streetControl']) assert.ok(controls.tokens.tools[k], `${k} scene control added`);
for (const k of ['phone', 'radio', 'satnav', 'setup', 'firstAid', 'rest', 'advance', 'services', 'quickBuild', 'openCreator', 'openLevelUp', 'openShop', 'openCombat', 'openMissions', 'openGMScreen', 'control', 'openGuide', 'diagnostics'])
  assert.ok(game.smoke[k], `game.smoke.${k}`);
assert.ok(CONFIG.Item.dataModels.ammo && CONFIG.Item.dataModels.outfit, 'the 0.2 item types are registered');
assert.equal(game.smoke.version, '0.4.0');
console.log('import + init + ready: ok;', Object.keys(hooks).length, 'hooks registered');
process.exit(0);
