import assert from 'node:assert/strict';
import './runtime-stub.mjs';
import {SmokeTagStudio, openTagStudio, buildSvg} from '../module/apps/tag-studio.mjs';

// Foundry V14 exposes ApplicationV2.state as a getter with no setter. The editor
// must maintain its own draft without overriding the framework lifecycle state.
const App = foundry.applications.api.ApplicationV2;
Object.defineProperty(App.prototype, 'state', {get: () => 'RENDERED', configurable: true});
App.prototype._onRender = async () => {};

const FLAG_NS = 'the-smoke';
const flags = {};
const actor = {
  id: 'artist-1', name: 'Hatch', uuid: 'Actor.artist-1', type: 'character', isOwner: true,
  system: {stage: 1, stats: {grf: {die: 8}}}, items: [{type: 'gear', name: 'Spray Paint', system: {quantity: 1}, getFlag:()=>({remainingCharges: 5})}],
  getFlag(ns,key){assert.equal(ns,FLAG_NS);return flags[key];},
  async setFlag(ns,key,value){assert.equal(ns,FLAG_NS);flags[key]=value;return value;},
  async rollStat(stat,opts){assert.equal(stat,'grf');assert.equal(opts.band,'medium');return {result:{outcomeKey:'strongSuccess',blinder:'niceOne'}};}
};
game.actors=Object.assign([actor],{contents:[actor],get:id=>id===actor.id?actor:null});
game.user.character=actor;
globalThis.canvas={scene:{id:'test-scene',tokens:[],getFlag:()=>null},tokens:{controlled:[]}};
let painted=null;
game.smoke={
  missions:{data:async()=>({missions:[]}),state:()=>({}),factions:()=>({})},
  graffiti:{catalogue:async()=>({tagPacks:[]}),territory:()=>({}),paint:async details=>{painted=details;return {quality:'fullSuccess'};}}
};

const app=new SmokeTagStudio(actor,{spotTokenId:'spot-a'});
assert.equal(app.state,'RENDERED');
assert.equal(app.tagDraft.actorId,actor.id);
assert.equal(app.tagDraft.spotTokenId,'spot-a');
assert.equal(Object.hasOwn(app,'state'),false);
assert.ok(buildSvg(app.tagDraft).startsWith('<svg'));
let renders=0;
app.render=async()=>{renders++;return app;};
app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const ctx=await app._prepareContext();
assert.equal(ctx.actor,actor);
assert.equal(ctx.state,app.tagDraft,'Handlebars `state` is a view model, not the ApplicationV2 getter');
assert.ok(ctx.styles.length>=5);
assert.equal(ctx.canPaint,false);

// The startup fix must also keep the other major studio flows usable.
await app.rollQuality();
assert.equal(app.tagDraft.quality,'strongSuccess');
assert.equal(app.tagDraft.blinder,1);
assert.equal(app.state,'RENDERED');
assert.ok(renders>=1);
await app.saveCurrent();
assert.equal(flags.tagLibrary.length,1);
assert.equal(flags.tagLibrary[0].quality,'strongSuccess');
const savedId=flags.tagLibrary[0].id;
app.tagDraft.text='ANOTHER';
await app.loadSaved(savedId);
assert.equal(app.tagDraft.text,'ASMO');
app.tagDraft.spotTokenId='spot-a';
await app.paintOnMap();
assert.equal(painted.actor,actor);
assert.equal(painted.spotTokenId,'spot-a');
assert.equal(painted.design.text,'ASMO');
assert.equal(app.tagDraft.quality,'fullSuccess');
await app.deleteSaved(savedId);
assert.equal(flags.tagLibrary.length,0);
assert.equal(app.state,'RENDERED');
const opened=openTagStudio(actor);
assert.ok(opened instanceof SmokeTagStudio);
assert.equal(opened.state,'RENDERED');
console.log('Tag Studio v14 getter-only state: construction, context, SVG, quality, save/load/delete and paint dispatch — ok');
