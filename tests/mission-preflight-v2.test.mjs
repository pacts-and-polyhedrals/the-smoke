import assert from 'node:assert/strict';
import {makeWorld} from './world-fixture.mjs';
import {J} from './fakes.mjs';
import {registerMissionSettings,missionData,configureMissionContracts,missionState,withMissionState} from '../module/world/missions.mjs';
import {requirementsFor} from '../module/rules/mission-contract.mjs';
import {prepareMission,resourcesFor} from '../module/world/mission-automation.mjs';
const w=await makeWorld({players:6});registerMissionSettings();await configureMissionContracts(J('mission-automation.json'));
const data=await missionData(),fail=[];let n=0;
for(const size of [1,2,4,6])for(const m of data.missions){
 for(const scene of w.scenes)scene.tokens.splice(0);
 const ids=w.pcs.slice(0,size).map(a=>a.id);
 w.settings.set('missions',{[m.id]:{status:'active',automationVersion:1,runId:`run-${m.id}-${size}`,actorIds:ids,ticks:{},requirements:requirementsFor(m,ids),contributions:{},receipts:{},choices:{}}});
 try{await prepareMission(m);assert.equal(missionState()[m.id].preflightError,null);n++;}catch(e){fail.push(`${m.code||m.id}/${size}: ${e.message}`);}
}
console.log(fail.join('\n'));assert.equal(fail.length,0,`${fail.length} preflight failures`);
console.log(`mission preflight: ${n} real document preparations; all179 jobs at1/2/4/6 PCs`);
