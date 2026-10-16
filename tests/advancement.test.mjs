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

// Rep levels, XP and caps.
assert.deepEqual(A.REP_LEVELS.map(l => l.xp), [0, 10, 25, 45, 70]);
assert.equal(A.levelForXP(24), 2); assert.equal(A.levelForXP(70), 5);
assert.deepEqual([1, 2, 3, 4, 5].map(A.statCap), [8, 10, 12, 12, 20]);
const r = A.repInfo({stage: 1, rep: {xp: 12, crew: 3, street: 0, police: 0}});
assert.equal(r.canLevel, true); assert.equal(r.nextLevel, 2); assert.equal(r.pct, 100);
assert.ok(r.unlocks.find(u => u.key === 'patDiscount').on); assert.ok(!r.unlocks.find(u => u.key === 'guns').on);
assert.equal(A.repInfo({stage: 2, rep: {xp: 12}}).pct, 13, '2 of 15 XP toward Rep 3');
assert.equal(A.repInfo({stage: 5, rep: {xp: 90}}).canLevel, false, 'Legend is the top');

// Level-up checks.
assert.match(A.validateLevelUp({fromLevel: 1, stat: 'grf', statDie: 8, perk: 'Ghost', xp: 5}).message, /needs 10 XP/);
assert.match(A.validateLevelUp({fromLevel: 1, stat: 'grf', statDie: 10, perk: 'Ghost', xp: 10}).message, /d10 at most/, 'Rep 2 caps at d10');
assert.deepEqual(A.validateLevelUp({fromLevel: 1, stat: 'grf', statDie: 8, perk: 'Ghost', xp: 10}), {valid: true, message: 'Ready.', nextDie: 10});
assert.match(A.validateLevelUp({fromLevel: 4, stat: 'grf', statDie: 12, perk: 'Ghost', xp: 70}).message, /Ready/, 'Rep 5 allows d20');
assert.match(A.validateLevelUp({fromLevel: 1, stat: 'grf', statDie: 8, perk: '', xp: 10}).message, /perk/);
assert.equal(A.levelUpPlan(2).hustle, 1); assert.equal(A.levelUpPlan(1).hustle, 0);
assert.equal(A.healthGrowth(1), 1); assert.equal(A.healthGrowth(7), 4);
assert.equal(A.guardGrowth(2, 8), 0); assert.equal(A.guardGrowth(5, 8), 1); assert.equal(A.guardGrowth(8, 8), 2);
console.log('advancement: 10 backgrounds, the creation steps (18+), Rep levels, caps, unlocks, level-up checks, growth — ok');
