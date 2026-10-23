// 0.5.25: every stat earns its keep and no one or two stats outweigh the rest. This pins the balance so an upgrade
// can't quietly drop a stat out of the game:
//  - the 179 mission GM files spread their checks over all nine stats, each between 8% and 14% of the checks;
//  - every stat is the d8 of at least one background, has at least five perks, a hired hand, and GM Screen checks;
//  - the hard-wired systems (police stop, tagging, radio wars, Growth, Guard) still ask for the stats they name;
//  - the Player's Handbook "Your Stats" page covers every stat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {STAT_KEYS} from '../module/config.mjs';
import {BACKGROUNDS} from '../module/rules/creation.mjs';
import {HIRE_TYPES} from '../module/rules/hires-core.mjs';
import {QUICK_CHECKS, TEAMWORK, HAZARDS} from '../module/gm/catalogue.mjs';
import {RADIO_WAR_ACTIONS} from '../module/radio/war-core.mjs';

const root = new URL('../', import.meta.url), read = f => fs.readFileSync(new URL(f, root), 'utf8'), load = f => JSON.parse(read(`data/${f}`));
const zero = () => Object.fromEntries(STAT_KEYS.map(k => [k, 0]));

// Mission files: share of checks per stat.
const dir = new URL('scripts/missions/files/', root), files = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) Object.assign(files, (await import(pathToFileURL(new URL(f, dir).pathname).href)).default);
const missions = [...load('london-missions.json').missions, ...load('tagging-missions.json').missions, ...load('radio-war-missions.json').missions];
assert.equal(Object.keys(files).length, missions.length, 'one GM file per mission');
assert.deepEqual(missions.filter(m => !files[m.id]).map(m => m.id), [], 'every mission has a GM file');
const checks = zero(); let total = 0;
for (const f of Object.values(files)) for (const s of f.scenes || []) for (const c of s.checks || []) for (const k of String(c[0]).split('|')) { assert.ok(k in checks, `unknown stat ${k}`); checks[k]++; total++; }
const share = Object.fromEntries(STAT_KEYS.map(k => [k, 100 * checks[k] / total]));
for (const k of STAT_KEYS) assert.ok(share[k] >= 8 && share[k] <= 14, `${k} is ${share[k].toFixed(1)}% of mission checks (want 8-14%)`);
const top2 = Object.values(share).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
assert.ok(top2 < 28, `the two biggest stats take ${top2.toFixed(1)}% of mission checks`);

// Character options.
const items = load('london-items.json').items, perks = zero();
for (const i of items.filter(i => i.type === 'perk')) if (i.system.stat in perks) perks[i.system.stat]++;
for (const k of STAT_KEYS) {
  assert.ok(BACKGROUNDS.some(b => b.stats[k] === 8), `${k} is no background's d8`);
  assert.ok(perks[k] >= 5, `${k} has only ${perks[k]} perks`);
  assert.ok(HIRE_TYPES.some(t => t.stat === k), `${k} has no hired hand`);
}
for (const b of BACKGROUNDS) assert.deepEqual(Object.values(b.stats).sort(), [4, 4, 4, 4, 4, 6, 6, 6, 8], `${b.name}: one d8, three d6, five d4`);

// GM Screen catalogue: every stat can be called for.
const gm = zero();
for (const x of [...QUICK_CHECKS, ...TEAMWORK, ...HAZARDS]) for (const r of [...(x.responses || []), ...(x.stat ? [{stat: x.stat}] : [])]) if (r.stat in gm) gm[r.stat]++;
for (const k of STAT_KEYS) assert.ok(gm[k] >= 3, `${k} appears in only ${gm[k]} GM Screen checks`);

// Hard-wired systems still ask for the stat they promise.
const pursuit = read('module/world/pursuit.mjs');
assert.match(pursuit, /rollStat\('btl', \{band: h >= 3 \? 'miracle'/, 'Say nothing rolls Bottle');
assert.match(pursuit, /choice === 'talk' \? 'frt' : driving \? 'whl' : 'mov'/, 'a stop is talked out with Front, run from with Wheels or Moves');
assert.equal(RADIO_WAR_ACTIONS.promo.stat, 'frt'); assert.equal(RADIO_WAR_ACTIONS.defend.stat, 'sav'); assert.equal(RADIO_WAR_ACTIONS.repair.stat, 'grf');
assert.match(read('module/graffiti/runtime.mjs'), /rollStat\('grf'/, 'Tag Studio paints with Graft');
assert.match(read('module/rules/creation.mjs'), /startingHealth = grtDie => 8 \+ statModifier\(grtDie\)/, 'Health comes from Grit');

// Radio play steps match the real menu and actions.
for (const m of load('radio-war-missions.json').missions) {
  const steps = m.playGuide.join(' ');
  assert.match(steps, /Work this radio contact/, `${m.code}: names the real menu entry`);
  assert.ok(steps.includes(RADIO_WAR_ACTIONS[m.radioWar.actionId].label), `${m.code}: names its action`);
}

// The guide covers every stat.
const content = load('content.json'), hb = content.journals.find(j => j.flags?.['the-smoke']?.contentKey === 'players-handbook');
const statsPage = hb.pages.find(p => p.name === 'Your Stats').text.content;
for (const k of STAT_KEYS) assert.ok(statsPage.includes(`<h3>${k.toUpperCase()} · `), `Your Stats page covers ${k}`);

console.log(`stat balance: mission checks ${STAT_KEYS.map(k => `${k} ${share[k].toFixed(1)}%`).join(', ')}; every stat a background d8, 5+ perks, a hired hand, GM checks and its systems — ok`);
process.exit(0);
