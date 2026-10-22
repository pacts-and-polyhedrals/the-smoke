import assert from 'node:assert/strict';
import './runtime-stub.mjs';
import {REP_MILESTONES,levelUpPlan,missingMilestones,milestoneChoices,milestoneCash,milestoneHistory,milestoneUpdate,repInfo,validateLevelUp} from '../module/rules/advancement.mjs';
import {SmokeLevelUp} from '../module/apps/levelling.mjs';
import fs from 'node:fs';

assert.deepEqual(REP_MILESTONES,[3,6,9,12,15,18,21,24,27,30,33]);
for(let level=2;level<=32;level++){
  const plan=levelUpPlan(level);
  assert.equal(plan.milestone,plan.to%3===0,`Rep ${plan.to} milestone flag`);
  assert.equal(plan.growthRoll,plan.milestone,`Growth remains alongside milestone at ${plan.to}`);
  assert.equal(plan.statUpgrade,plan.to%2===1,`stat step at odd Rep ${plan.to}`);
  assert.equal(plan.perk,plan.to%2===0,`perk at even Rep ${plan.to}`);
}
assert.throws(()=>milestoneUpdate(modelForPrematureClaim(),33,'cash'),/not been earned/);
function modelForPrematureClaim(){return {stage:1,creation:{milestoneRewards:'[]'},resources:{},guard:{base:4}};}
assert.equal(milestoneCash(3),150);assert.equal(milestoneCash(33),900);
const model=(stage=3)=>({stage,resources:{health:{max:10,value:8},hustle:{max:3,value:2}},guard:{base:4},cash:20,
  creation:{milestoneRewards:'[]'},stats:{grf:{die:4},grt:{die:8},mov:{die:6}},rep:{xp:1600}});
let s=model(33);
assert.deepEqual(missingMilestones(s),REP_MILESTONES,'existing Rep 33 character gets all missed milestone choices');
assert.equal(milestoneChoices(s,3).length,4);
const apply=(level,bonus)=>{
  const value=milestoneUpdate(s,level,bonus);
  for(const [key,v] of Object.entries(value.updates)){
    const path=key.replace(/^system\./,'').split('.');let ref=s;
    for(const part of path.slice(0,-1))ref=ref[part]??={};
    ref[path.at(-1)]=v;
  }
  return value;
};
assert.match(apply(3,'stamina').label,/Standing/);
assert.equal(s.resources.health.max,13);assert.equal(s.resources.health.value,11);
assert.throws(()=>milestoneUpdate(s,3,'stamina'),/already been claimed/);
apply(6,'guard');apply(9,'guard');apply(12,'guard');
assert.ok(!milestoneChoices(s,15).find(b=>b.id==='guard').available,'limit permanent +Guard to three bonuses');
apply(15,'hustle');apply(18,'hustle');
assert.ok(!milestoneChoices(s,21).find(b=>b.id==='hustle').available,'limit permanent +Hustle to two bonuses');
assert.equal(s.resources.hustle.max,5);
apply(21,'cash');assert.equal(s.cash,20+milestoneCash(21));
assert.equal(milestoneHistory(s).length,7);
assert.deepEqual(missingMilestones(s),[24,27,30,33]);
assert.match(validateLevelUp({fromLevel:2,stat:'grf',statDie:4,xp:13,milestone:'',system:model(2)}).message,/milestone/);
assert.equal(validateLevelUp({fromLevel:2,stat:'grf',statDie:4,xp:13,milestone:'stamina',system:model(2)}).valid,true);

function actor(stage=2){
 const system=model(stage);system.rep.xp=500;
 return {id:'l1',name:'Jaz',type:'character',isOwner:true,system,items:[],changes:[],
   async update(patch){this.changes.push(patch);for(const [key,value] of Object.entries(patch)){
     const parts=key.replace(/^system\./,'').split('.');let ref=this.system;
     for(const part of parts.slice(0,-1))ref=ref[part]??={};
     ref[parts.at(-1)]=value;
   }},
   async createEmbeddedDocuments(type,items){this.items.push(...items);return items;}
 };
}
// Stage 2 => 3: stat step + Growth + milestone Health, same update, no overwritten health gain.
SmokeLevelUp.prototype.close=async function(){this.closed=true;};
const a=actor(2),w=new SmokeLevelUp(a);
w.stat='grf';w.bonus='stamina';w.growth={health:2,guard:1,healthRoll:4,healthDie:8,guardRoll:4,guardDie:8};
await w.confirm();
assert.equal(a.system.stage,3);
assert.equal(a.system.stats.grf.die,6);
assert.equal(a.system.resources.health.max,15,'+2 rolled growth and +3 milestone Health');
assert.equal(a.system.resources.health.value,13,'both bonuses heal');
assert.equal(a.system.guard.base,5,'normal Growth remains');
assert.deepEqual(milestoneHistory(a.system),[{level:3,bonus:'stamina'}]);
assert.equal(a.changes.length,1,'atomic Actor.update includes ordinary and milestone gains');
await assert.rejects(()=>w.confirm(),/perk|already claimed|cannot be claimed/i,'replaying the reward refused');
// Legacy Rep 9 character can claim Rep 3, 6 and 9 with no XP and without losing levels.
const old=actor(9);old.system.rep.xp=0;
const legacy=new SmokeLevelUp(old);
assert.equal(legacy.claimLevel,3);
legacy.bonus='cash';
await legacy.confirm();
assert.equal(old.system.stage,9,'recovery grants bonus without level change');
assert.equal(old.system.cash,20+milestoneCash(3));
assert.deepEqual(missingMilestones(old.system),[6,9]);
assert.match(fs.readFileSync(new URL('../templates/levelup.hbs',import.meta.url),'utf8'),/data-lv-bonus/);
assert.match(fs.readFileSync(new URL('../templates/actor-sheet.hbs',import.meta.url),'utf8'),/missingMilestones/);
console.log('Rep milestones: 11 bonus levels, full stat/perk/Growth stacking, 4 choices, caps, no replay, older character recovery and UI — ok');
