// Character creation and Rep levelling rules.
import assert from 'assert';
import fs from 'fs';
const LIB = JSON.parse(fs.readFileSync(new URL('../data/london-items.json', import.meta.url), 'utf8')).items;
const C = await import('../module/rules/creation.mjs');
const A = await import('../module/rules/advancement.mjs');
const {validateStartingSpread} = await import('../module/rules/core.mjs');

// Backgrounds: legal spreads, real perks and kit.
assert.equal(C.BACKGROUNDS.length, 10);
for (const b of C.BACKGROUNDS) {
  assert.ok(validateStartingSpread(b.stats).valid, `${b.name}: a legal spread`);
  for (const p of b.perks) assert.ok(LIB.some(i => i.type === 'perk' && i.name === p), `${b.name}: perk ${p}`);
  for (const k of b.kit) assert.ok(LIB.some(i => i.name === k && !i.system.restricted), `${b.name}: kit ${k}`);
}
for (const x of C.STARTER_EXTRAS) assert.ok(LIB.some(i => i.name === x), `extra ${x}`);

// A draft through the steps.
const d = C.blankDraft();
assert.match(C.stepProblem('who', d), /name/);
d.name = 'Danny Doyle'; d.age = '16'; assert.match(C.stepProblem('who', d), /adults/, 'under 18 refused');
d.age = '24'; assert.equal(C.stepProblem('who', d), '');
assert.match(C.stepProblem('background', d), /background/);
d.background = 'bike-thief'; d.stats = {...C.BACKGROUNDS[0].stats};
assert.equal(C.stepProblem('stats', d), '');
d.stats.mus = 8; assert.match(C.stepProblem('stats', d), /one d8/); d.stats.mus = 4;
d.perk = 'Brawler'; assert.match(C.stepProblem('perk', d), /background/); d.perk = 'Bike Thief';
d.extra = 'Balaclava';
assert.deepEqual(C.draftProblems(d), []);
const plan = C.applyPlan(d);
assert.equal(plan.update['system.stats.grf.die'], 8); assert.equal(plan.update['system.resources.health'].max, 10); assert.equal(plan.update['system.cash'], 40);
assert.deepEqual(plan.items, ['Fists', 'Bolt Cutters', 'Burner Phone', 'Tracksuit', 'Energy Drink', 'Balaclava', 'Bike Thief']);
assert.equal(plan.update['system.creation.done'], true);
assert.equal(C.startingHealth(8), 12);

// Rep: thirty-three levels in five tiers, from Nobody to King of London.
assert.equal(A.REP_LEVELS.length, 33); assert.equal(A.MAX_REP, 33);
assert.equal(A.REP_LEVELS[0].title, 'Nobody'); assert.equal(A.REP_LEVELS.at(-1).title, 'King of London');
assert.deepEqual(A.REP_LEVELS.slice(0, 5).map(l => l.xp), [0, 5, 13, 23, 35], 'quick at the start');
assert.ok(A.REP_LEVELS.every((l, i) => !i || l.xp > A.REP_LEVELS[i - 1].xp), 'every level costs more XP');
assert.ok(A.REP_LEVELS.every((l, i) => i < 2 || l.xp - A.REP_LEVELS[i - 1].xp >= A.REP_LEVELS[i - 1].xp - (A.REP_LEVELS[i - 2]?.xp ?? 0)), 'and the steps only get longer');
assert.equal(new Set(A.REP_LEVELS.map(l => l.title)).size, 33, 'every level has its own title');
assert.deepEqual([1, 4, 5, 10, 11, 18, 19, 26, 27, 33].map(A.tierOf), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
assert.deepEqual([1, 5, 11, 19, 27].map(A.statCap), [8, 10, 12, 12, 20], 'each tier its Covenant stat cap');
// the whole campaign (every mission's XP, plus a couple of hundred jobs) lands well inside the ladder
const MISSIONS = JSON.parse(fs.readFileSync(new URL('../data/london-missions.json', import.meta.url), 'utf8')).missions;
const campaignXP = MISSIONS.reduce((t, m) => t + Number(m.rewards?.xp || 0), 0);
assert.ok(A.levelForXP(campaignXP) <= 22, `every mission (${campaignXP} XP) reaches Rep ${A.levelForXP(campaignXP)}`);
assert.ok(A.levelForXP(campaignXP + 250) <= 25, `and with 250 more from jobs, Rep ${A.levelForXP(campaignXP + 250)}: far from 33`);
assert.equal(A.levelForXP(24), 4); assert.equal(A.levelForXP(1357), 33);
const r = A.repInfo({stage: 1, rep: {xp: 6, crew: 3, street: 0, police: 0}});
assert.equal(r.canLevel, true); assert.equal(r.nextLevel, 2); assert.equal(r.pct, 100); assert.equal(r.tierName, 'Street'); assert.equal(r.ladder.length, 33);
assert.ok(r.unlocks.find(u => u.key === 'patDiscount').on); assert.ok(!r.unlocks.find(u => u.key === 'guns').on);
assert.ok(A.repInfo({stage: 3}).unlocks.find(u => u.key === 'guns').on, 'Rep 3: Uncle sells you shooters');
assert.equal(A.repInfo({stage: 4, rep: {xp: 23}}).nextTier, 'Known', 'next level steps into a new tier');
assert.equal(A.repInfo({stage: 33, rep: {xp: 9000}}).canLevel, false, 'King of London is the top');
// What each level gives: odd a stat, even a perk; Growth every third; Hustle with each new tier.
for (let from = 1; from < 33; from++) { const p = A.levelUpPlan(from); assert.ok(p.statUpgrade !== p.perk, `Rep ${p.to}: a stat or a perk`); }
assert.ok(A.levelUpPlan(2).statUpgrade && A.levelUpPlan(2).growthRoll, 'Rep 3: a stat and Growth');
assert.ok(A.levelUpPlan(1).perk && !A.levelUpPlan(1).growthRoll, 'Rep 2: a perk');
assert.deepEqual([4, 10, 18, 26].map(l => A.levelUpPlan(l).hustle), [1, 1, 1, 1], 'Hustle at Rep 5, 11, 19, 27');
assert.equal([...Array(32).keys()].map(i => A.levelUpPlan(i + 1).hustle).reduce((a, b) => a + b, 0), 4);
// Level-up checks.
assert.match(A.validateLevelUp({fromLevel: 1, perk: 'Ghost', xp: 2}).message, /needs 5 XP/);
assert.deepEqual(A.validateLevelUp({fromLevel: 1, perk: 'Ghost', xp: 5}), {valid: true, message: 'Ready.', nextDie: null}, 'Rep 2 is a perk: no stat needed');
assert.match(A.validateLevelUp({fromLevel: 1, perk: '', xp: 5}).message, /perk/);
assert.match(A.validateLevelUp({fromLevel: 2, stat: 'grf', statDie: 8, xp: 13}).message, /d8 at most/, 'Rep 3 is still the Street tier: d8');
assert.deepEqual(A.validateLevelUp({fromLevel: 4, stat: 'grf', statDie: 8, xp: 35}), {valid: true, message: 'Ready.', nextDie: 10}, 'Rep 5 (Known) allows d10');
assert.match(A.validateLevelUp({fromLevel: 4, stat: '', xp: 35}).message, /stat/);
assert.match(A.validateLevelUp({fromLevel: 26, stat: 'grf', statDie: 12, xp: 915, milestone:'stamina'}).message, /Ready/, 'Rep 27 (Empire) allows d20');
assert.match(A.validateLevelUp({fromLevel: 33, xp: 99999}).message, /Already Rep 33/);
// The old five levels move up to the same place on the new ladder.
assert.deepEqual(A.OLD_REP, {1: 1, 2: 3, 3: 6, 4: 9, 5: 14});
assert.equal(A.healthGrowth(1), 1); assert.equal(A.healthGrowth(7), 4);
assert.equal(A.guardGrowth(2, 8), 0); assert.equal(A.guardGrowth(5, 8), 1); assert.equal(A.guardGrowth(8, 8), 2);
console.log('advancement: 10 backgrounds, the creation steps (18+), Rep levels, caps, unlocks, level-up checks, growth — ok');
