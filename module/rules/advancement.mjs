// Rep: levelling in The Smoke. Thirty-three levels from Nobody to King of London, in five tiers that work like Covenant
// Stages (each tier raises the stat cap). XP comes from jobs, Pat's orders, missions and the GM. Levelling up alternates:
// odd levels raise a stat, even levels add a perk; every third level rolls Growth for Health and Guard; each new tier
// adds a point of Hustle. A full run of the campaign lands in the low twenties — the top of the ladder is a long way off.
import {DIE_LADDER} from '../config.mjs';

/** The five tiers: the stat cap (the Covenant Stage) and where each starts. */
export const REP_TIERS = Object.freeze([
  {tier: 1, name: 'Street', from: 1, cap: 8, blurb: 'Bikes, errands, keeping your head down.'},
  {tier: 2, name: 'Known', from: 5, cap: 10, blurb: 'People know your name, and what you do.'},
  {tier: 3, name: 'Firm', from: 11, cap: 12, blurb: 'Part of something. Then running it.'},
  {tier: 4, name: "Guv'nor", from: 19, cap: 12, blurb: 'Your own firm, your own manor, your own property.'},
  {tier: 5, name: 'Empire', from: 27, cap: 20, blurb: 'Crime boss, landlord, philanthropist. They will never prove a thing.'}
]);
export const MAX_REP = 33;
/** XP to reach a level: quick at the start, a long climb at the top. */
export const xpFor = level => { const n = Math.max(0, Math.min(MAX_REP, Number(level) || 1) - 1); return Math.round(4 * n + 1.2 * n * n); };
const TITLES = [
  ['Nobody', 'Just another face on Mare Street.'],
  ['Runner', 'Pat knows your name. So does Kez\'s mum.'],
  ['Lookout', 'You know which corner the vans park on, and when.'],
  ['Grafter', 'Always on the hustle. Always skint by Sunday.'],
  ['Face', 'People nod at you on the street. Some of them cross over.'],
  ['Wheelman', 'If it\'s got wheels, you can make it disappear.'],
  ['Fixer', 'You know a man. More and more, you are the man.'],
  ['Earner', 'Money comes in faster than you can wash it.'],
  ['Name', 'Your name comes up at the Lea Boys\' meetings — and in DS Vale\'s notebook.'],
  ['Somebody', 'Bouncers wave you in. Shopkeepers get nervous.'],
  ['Soldier', 'Part of something bigger now, and everybody knows it.'],
  ['Enforcer', 'When there\'s a problem, they send you.'],
  ['Top Boy', 'Your postcode, your rules.'],
  ['Lieutenant', 'Trusted with the money and the secrets.'],
  ['Shot-caller', 'You say jump; the estate asks how high.'],
  ['Landlord', 'First flat bought cash. Nobody asked where from.'],
  ['Proper Villain', 'In DS Vale\'s notebook, underlined twice.'],
  ['Legend', 'There are stories about you. Some of them are even true.'],
  ['Guv\'nor', 'Your own firm, your own manor.'],
  ['Club Owner', 'A bar in Shoreditch, and a back office nobody sees.'],
  ['Developer', 'Luxury flats where the lock-ups used to be.'],
  ['Untouchable', 'Three arrests, no charges. Funny, that.'],
  ['Kingpin', 'Half of East London pays you, one way or another.'],
  ['Connected', 'Planning permission comes through. Quickly.'],
  ['Tycoon', 'The Standard calls you a "local businessman".'],
  ['Don of the East End', 'The old firms come to you for permission.'],
  ['Baron', 'There\'s a community centre with your name over the door.'],
  ['Mogul', 'A property portfolio from Stratford to the river.'],
  ['Overlord', 'Every crew from Hackney to Barking answers to you.'],
  ['Shadow Mayor', 'City Hall takes your calls. On the first ring.'],
  ['Crime Lord', 'Firms from Manchester and Marbella come to pay their respects.'],
  ['Emperor of the Smoke', 'Nothing moves through London without your cut.'],
  ['King of London', 'Crime boss and property baron. They will never prove a thing.']
];
/** The tier a level sits in (1–5): the Covenant Stage for stat caps and legendary dice. */
export const tierOf = level => [...REP_TIERS].reverse().find(t => Number(level || 1) >= t.from)?.tier ?? 1;
export const tierInfo = level => REP_TIERS[tierOf(level) - 1];
export const REP_LEVELS = Object.freeze(TITLES.map(([title, blurb], i) => {
  const level = i + 1, t = REP_TIERS[tierOf(level) - 1];
  return {level, title, xp: xpFor(level), blurb, tier: t.tier, tierName: t.name, cap: t.cap};
}));
/** The highest die a stat may reach at a Rep level (its tier's cap). */
export const statCap = level => tierInfo(level).cap;
export const clampRep = level => Math.max(1, Math.min(MAX_REP, Math.round(Number(level) || 1)));
export const levelInfo = level => REP_LEVELS[clampRep(level) - 1];
/** The level XP alone would reach (the character still has to level up through the wizard). */
export const levelForXP = xp => [...REP_LEVELS].reverse().find(l => Number(xp) >= l.xp)?.level ?? 1;
/** The old five-level Rep (0.4 and earlier) on the new ladder: the same XP, the same tier. */
export const OLD_REP = Object.freeze({1: 1, 2: 3, 3: 6, 4: 9, 5: 14});


/** A new milestone choice sits on top of the existing stat/perk and Growth rewards. */
export const REP_MILESTONES = Object.freeze(Array.from({length:11}, (_,i)=>(i+1)*3));
export const MILESTONE_BONUSES = Object.freeze([
  {id:'stamina',name:'Still Standing',blurb:'+3 maximum Health, and heal 3 now.',icon:'heart-pulse'},
  {id:'guard',name:'Hard to Touch',blurb:'+1 permanent base Guard (up to three milestone picks).',icon:'shield-halved'},
  {id:'hustle',name:'Never Stop',blurb:'+1 maximum and current Hustle (up to two milestone picks).',icon:'bolt'},
  {id:'cash',name:'Paid Proper',blurb:'Take a cash bonus scaled to your current Rep.',icon:'sterling-sign'}
]);
export const isMilestone = level => Number.isInteger(Number(level)) && Number(level)>=3 && Number(level)<=MAX_REP && Number(level)%3===0;
/** The character can be older than the migration: no earned milestone is silently taken away. */
export function milestoneHistory(system) {
  let raw=system?.creation?.milestoneRewards??'[]';
  if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch(_e){raw=[];}}
  if(!Array.isArray(raw))return [];
  const seen=new Set();
  return raw.filter(v=>{
    const level=Number(v?.level),bonus=String(v?.bonus??'');
    if(!isMilestone(level)||seen.has(level)||!MILESTONE_BONUSES.some(b=>b.id===bonus))return false;
    seen.add(level);return true;
  }).map(v=>({level:Number(v.level),bonus:String(v.bonus)})).sort((a,b)=>a.level-b.level);
}
export const milestoneCash = level => 75 + 25 * Number(level);
export function milestoneChoices(system,level) {
  const done=milestoneHistory(system);
  const guardCount=done.filter(v=>v.bonus==='guard').length;
  const hustleCount=done.filter(v=>v.bonus==='hustle').length;
  return MILESTONE_BONUSES.map(b=>({
    ...b,available:isMilestone(level) && !done.some(v=>v.level===Number(level)) && !(b.id==='guard'&&guardCount>=3) && !(b.id==='hustle'&&hustleCount>=2),
    detail:b.id==='cash'?`+£${milestoneCash(level)} cash`:b.blurb
  }));
}
export function missingMilestones(system) {
  const claimed=new Set(milestoneHistory(system).map(x=>x.level));
  return REP_MILESTONES.filter(level=>level<=clampRep(system?.stage)&&!claimed.has(level));
}
/** Testable, side-effect-free milestone application. Persist these fields in the SAME Actor.update as Rep. */
export function milestoneUpdate(system,level,bonus) {
  if(Number(level)>clampRep(system?.stage)+1)throw new Error('This Rep milestone has not been earned yet.');
  const choice=milestoneChoices(system,level).find(b=>b.id===bonus);
  if(!choice?.available)throw new Error('That milestone reward has already been claimed or is unavailable.');
  const next=[...milestoneHistory(system),{level,bonus}].sort((a,b)=>a.level-b.level);
  const updates={'system.creation.milestoneRewards':JSON.stringify(next)};
  if(bonus==='stamina'){
    updates['system.resources.health.max']=Number(system?.resources?.health?.max??10)+3;
    updates['system.resources.health.value']=Number(system?.resources?.health?.value??10)+3;
  }else if(bonus==='guard')updates['system.guard.base']=Number(system?.guard?.base??4)+1;
  else if(bonus==='hustle'){
    updates['system.resources.hustle.max']=Number(system?.resources?.hustle?.max??3)+1;
    updates['system.resources.hustle.value']=Number(system?.resources?.hustle?.value??3)+1;
  }else if(bonus==='cash')updates['system.cash']=Number(system?.cash??0)+milestoneCash(level);
  return {updates,label:choice.name,detail:choice.detail};
}

/** XP awards, in one place so jobs, missions and the GM screen agree. */
export const XP_AWARDS = Object.freeze({
  job: 1,            // a completed taxi fare, delivery, patient, fire or police call
  crewOrder: 2,      // one of Pat's orders completed
  bigSale: 1,        // a vehicle sold for £500 or more
  missionMinor: 3, missionMajor: 5,
  bustedOrWasted: 0
});

/** Things a character unlocks. `test` reads only actor.system so it works on plain data too. */
export const UNLOCKS = Object.freeze([
  {key: 'guns', label: 'Rep 3 — Uncle sells you shooters (guns and ammo out the back of Uncle\'s Cafe)', test: s => Number(s.stage) >= 3},
  {key: 'bigOrders', label: 'Rep 3 — Pat gives you the bigger orders', test: s => Number(s.stage) >= 3},
  {key: 'fenceBonus', label: 'Rep 6 — A known supplier: fences pay you 10% more for nicked rides', test: s => Number(s.stage) >= 6},
  {key: 'goodStuff', label: 'Rep 6 — Uncle\'s "good stuff": SMGs, pump shotguns, proper vests', test: s => Number(s.stage) >= 6},
  {key: 'carJobs', label: 'Rep 9 — Pat\'s car jobs (motors, not bikes), and Uncle\'s "don\'t ask" shelf', test: s => Number(s.stage) >= 9},
  {key: 'ownCrew', label: 'Rep 13 — Top Boy: your own crew, hire NPCs to work for you', test: s => Number(s.stage) >= 13},
  {key: 'legendary', label: 'Rep 27 — Empire: stats can reach d20', test: s => Number(s.stage) >= 27},
  {key: 'patDiscount', label: 'Chainring 3 — Pat knocks 10% off at The Arches', test: s => Number(s.rep?.crew) >= 3},
  {key: 'streetDiscount', label: 'Street 5 — Known on the street: every shop knocks 10% off', test: s => Number(s.rep?.street) >= 5},
  {key: 'knownToPolice', label: 'Known to police 3 — Stops start at Wanted: they know your face', test: s => Number(s.rep?.police) >= 3}
]);
export const hasUnlock = (system, key) => Boolean(UNLOCKS.find(u => u.key === key)?.test(system));

/** Everything the sheet shows about Rep. */
export function repInfo(system) {
  const level = clampRep(system?.stage), xp = Math.max(0, Number(system?.rep?.xp) || 0);
  const cur = levelInfo(level), nxt = level < MAX_REP ? levelInfo(level + 1) : null;
  const pct = nxt ? Math.max(0, Math.min(100, Math.round(100 * (xp - cur.xp) / Math.max(1, nxt.xp - cur.xp)))) : 100;
  return {level, title: cur.title, blurb: cur.blurb, xp, next: nxt?.xp ?? null, nextLevel: nxt?.level ?? null, nextTitle: nxt?.title ?? null, pct, max: MAX_REP,
    tier: cur.tier, tierName: cur.tierName, nextTier: nxt && nxt.tier !== cur.tier ? nxt.tierName : null,
    canLevel: Boolean(nxt && xp >= nxt.xp), cap: statCap(level), nextCap: nxt ? statCap(nxt.level) : statCap(level),
    nextMilestone:REP_MILESTONES.find(n=>n>level)??null,
    missingMilestones:missingMilestones(system),
    claimedMilestones:milestoneHistory(system),
    ladder: REP_LEVELS.map(l => ({level: l.level, title: l.title, xp: l.xp, tier: l.tier, tierName: l.tierName, here: l.level === level, done: l.level < level,
      milestone:isMilestone(l.level)})),
    unlocks: UNLOCKS.map(u => ({key: u.key, label: u.label, on: u.test(system || {})}))};
}

/** What a level-up gives: odd levels a stat step, even levels a perk; every third level Growth; a new tier, Hustle. */
export function levelUpPlan(fromLevel) {
  const to = clampRep(Number(fromLevel) + 1), newTier = tierOf(to) !== tierOf(fromLevel);
  return {to, title: levelInfo(to).title, tierName: tierInfo(to).name, newTier, statUpgrade: to % 2 === 1, cap: statCap(to), perk: to % 2 === 0,
    growthRoll: to % 3 === 0, milestone: isMilestone(to), hustle: newTier ? 1 : 0,
    growth: ['Health (roll your Grit die, gain half rounded up)', 'Guard (roll the better of Moves or Grit: 3+ gains 1, the top face gains 2)']};
}
export function validateLevelUp({fromLevel, stat, statDie, perk, xp, milestone, system}) {
  const plan = levelUpPlan(fromLevel);
  if (Number(fromLevel) >= MAX_REP) return {valid: false, message: `Already Rep ${MAX_REP}: ${levelInfo(MAX_REP).title}.`};
  if (Number(xp) < levelInfo(plan.to).xp) return {valid: false, message: `Rep ${plan.to} needs ${levelInfo(plan.to).xp} XP.`};
  let nextDie = null;
  if (plan.statUpgrade) {
    if (!stat) return {valid: false, message: 'Choose a stat to raise.'};
    const at = DIE_LADDER.indexOf(Number(statDie)); nextDie = DIE_LADDER[at + 1];
    if (at < 0 || !nextDie) return {valid: false, message: 'That stat cannot go any higher.'};
    if (nextDie > plan.cap) return {valid: false, message: `At Rep ${plan.to} a stat can reach d${plan.cap} at most.`};
  }
  if (plan.perk && !perk) return {valid: false, message: 'Choose a new perk.'};
  if(plan.milestone){
    if(!milestone)return {valid:false,message:'Choose your Rep milestone bonus.'};
    if(!milestoneChoices(system??{stage:fromLevel,creation:{milestoneRewards:'[]'}},plan.to).some(x=>x.id===milestone&&x.available))
      return {valid:false,message:'That milestone bonus cannot be claimed.'};
  }
  return {valid: true, message: 'Ready.', nextDie};
}
/** Growth: Health gains half the Grit die roll (rounded up, at least 1). */
export const healthGrowth = roll => Math.max(1, Math.ceil(Number(roll) / 2));
/** Growth: Guard gains nothing on 1-2, 1 on 3+, 2 on the die's top face. */
export const guardGrowth = (roll, faces) => Number(roll) >= Number(faces) ? 2 : Number(roll) >= 3 ? 1 : 0;
