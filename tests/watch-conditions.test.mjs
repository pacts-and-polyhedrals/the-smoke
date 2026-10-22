// Timed conditions must run on the Banana Watch / Foundry world clock, not wall time.
import assert from 'node:assert/strict';
import {fakeActor, itemNamed, conditionNames, chat} from './fakes.mjs';
import {watchSeconds, watchDeadline, watchMinutesRemaining, legacyDeadlineToWatch} from '../module/rules/watch-clock.mjs';
const NS = 'the-smoke';
const gm = {id:'gm',isGM:true,active:true};
const player = {id:'u1',isGM:false,active:true};
game.users = Object.assign([gm,player], {activeGM:gm, get:id=>[gm,player].find(u=>u.id===id), filter:fn=>[gm,player].filter(fn)});
game.user = gm;
game.time = {worldTime: 0};
game.paused = true;
game.settings.get = (_ns,k) => ({clockMode:'game',clockStart:'2026-10-12T09:00',clockAdvance:true,clockRate:60})[k];
globalThis.canvas = {scene:null};
const items = await import('../module/world/items.mjs');
const {activeFx} = await import('../module/apps/drug-fx.mjs');
const {gameClockAt} = await import('../module/apps/banana-watch.mjs');
const a = fakeActor({name:'Watch Runner'});
game.actors = Object.assign([a], {filter:fn=>[a].filter(fn)});

assert.equal(watchSeconds(),0);
assert.equal(watchDeadline(30),1800);
assert.equal(watchMinutesRemaining(1800),30);
assert.equal(gameClockAt(1800),'MON 12 OCT · 09:30');

await items.addTimedCondition(a,'Wired',30,{then:'Crashing',thenMinutes:60});
let high=itemNamed(a,'Wired');
assert.equal(high.getFlag(NS,'expiresWorldTime'),1800,'world seconds saved as the authoritative deadline');
assert.equal(high.getFlag(NS,'expiresAt'),undefined,'no Date.now expiry is generated');
assert.equal(activeFx(a).minutes,30,'player effect displays watch minutes');

// A stopped watch remains stopped, even if the browser wall-clock jumps forward an entire day.
const trueNow=Date.now;
try {
  Date.now=()=>trueNow()+86400000;
  await items.tickTimedConditions();
  assert.deepEqual(conditionNames(a),['Wired']);
  assert.equal(activeFx(a).minutes,30,'screen effect is not counting literal real minutes');
} finally { Date.now=trueNow; }

// Advance 29 minutes and 59 seconds; the character remains high.
game.time.worldTime=1799;
await items.tickTimedConditions();
assert.deepEqual(conditionNames(a),['Wired']);
assert.equal(activeFx(a).minutes,1);
// Advance the watch one second; effect transitions to a comedown with its own watch deadline.
game.time.worldTime=1800;
await items.tickTimedConditions();
assert.deepEqual(conditionNames(a),['Crashing']);
assert.equal(itemNamed(a,'Crashing').getFlag(NS,'expiresWorldTime'),5400);
assert.equal(activeFx(a).name,'Crashing');
assert.equal(activeFx(a).minutes,60);

// The same watch tick must not process the effect twice.
const cardCount=chat.length;
await items.tickTimedConditions();
assert.equal(chat.length,cardCount);
// A large GM jump skips both stages at their real scheduled watch deadlines.
game.time.worldTime=5500;
await items.tickTimedConditions();
assert.deepEqual(conditionNames(a),[]);

// Crossing an entire high + comedown interval in a single watch jump leaves no residual effect.
game.time.worldTime=6000;
await items.addTimedCondition(a,'Blazed',20,{then:'Foggy',thenMinutes:40});
game.time.worldTime+=2*3600;
await items.tickTimedConditions();
assert.ok(!itemNamed(a,'Blazed') && !itemNamed(a,'Foggy'),'no stale comedown after a fast-forward');

// Permanent/physical conditions remain tied to recovery or combat, not a timestamp.
await a.addCondition('Bleeding');
await a.addCondition('Cuffed');
await a.addCondition('Broken');
game.time.worldTime+=30*86400;
await items.tickTimedConditions();
assert.deepEqual(conditionNames(a),['Bleeding','Broken','Cuffed']);

// Migration: earlier v0.5.5 saved expiry timestamps are re-anchored once to watch time.
const old=fakeActor({name:'Old Character'});
const realAnchor=Date.now(), nowWatch=12500;
await old.createEmbeddedDocuments('Item',[{name:'Buzzing',type:'condition',flags:{[NS]:{expiresAt:realAnchor+10*60000}},system:{}}]);
assert.equal(legacyDeadlineToWatch(realAnchor+600000,nowWatch,realAnchor),nowWatch+600);
await items.tickTimedConditions(nowWatch,[old],{realNowMs:realAnchor});
assert.equal(itemNamed(old,'Buzzing').getFlag(NS,'expiresWorldTime'),nowWatch+600);
assert.equal(itemNamed(old,'Buzzing').getFlag(NS,'timerClock'),'banana-watch');
await items.tickTimedConditions(nowWatch,[old],{realNowMs:realAnchor+86400000});
assert.ok(itemNamed(old,'Buzzing'),'once migrated, real time can never expire the effect');
await items.tickTimedConditions(nowWatch+600,[old]);
assert.ok(!itemNamed(old,'Buzzing'));

// Legacy overdue conditions age once on upgrade. Any elapsed offline time is unrecoverable.
const expired=fakeActor({name:'Expired Old Character'});
await expired.createEmbeddedDocuments('Item',[{name:'Numbed',type:'condition',flags:{[NS]:{expiresAt:realAnchor-60000}},system:{}}]);
await items.tickTimedConditions(500,[expired],{realNowMs:realAnchor});
assert.equal(itemNamed(expired,'Numbed'),undefined);

// Conditions applied manually (from a sheet or attack) use the same watch clock, not a permanent flag.
const {WATCH_CONDITION_DEFAULTS}=await import('../module/rules/conditions.mjs');
const {SmokeActor}=await import('../module/documents.mjs');
const library=JSON.parse((await import('node:fs')).readFileSync(new URL('../data/london-items.json', import.meta.url),'utf8')).items;
for (const d of library.filter(i=>i.type==='drug')) {
  const def=WATCH_CONDITION_DEFAULTS[d.system.high];
  assert.equal(def?.minutes,d.system.minutes,`default timing agrees with ${d.name}`);
  if (d.system.comedown) {
    assert.equal(def.then,d.system.comedown);
    assert.equal(def.thenMinutes,Math.max(30,d.system.minutes*2));
  }
}
for (const c of library.filter(i=>i.type==='consumable' && i.system.grants))
  assert.equal(WATCH_CONDITION_DEFAULTS[c.system.grants]?.minutes,c.system.minutes,`default timing agrees with ${c.name}`);
const manual=fakeActor({name:'Manual effects'});
game.time.worldTime=0;
await SmokeActor.prototype.addCondition.call(manual,'Giggling');
assert.equal(itemNamed(manual,'Giggling').getFlag(NS,'expiresWorldTime'),120);
await SmokeActor.prototype.addCondition.call(manual,'Bleeding');
assert.equal(itemNamed(manual,'Bleeding').getFlag(NS,'expiresWorldTime'),undefined,'persistent injuries are not clocked');
game.time.worldTime=120;
await items.tickTimedConditions(undefined,[manual]);
assert.ok(!itemNamed(manual,'Giggling') && itemNamed(manual,'Bleeding'));

// The world-time hook is registered for prompt updates and the leader owns the writes.
items.installItems();
assert.ok(Hooks._all.updateWorldTime?.length,'watch-change listener exists');
console.log('watch conditions: pausing, high -> comedown, fast-forward, legacy upgrade, permanent injuries, FX and world-time listener — ok');
process.exit(0);
