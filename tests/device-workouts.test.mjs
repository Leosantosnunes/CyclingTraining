import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,propose,planningContext,addDays,weekday,deviceWorkout,workoutZwo,workoutSetupText,validateWorkout,isQualityWorkout} from '../public/engine.js';
const today='2026-11-07';
const p=()=>({...defaultProfile(),goal:'racing',experience:'consistent',availability:[120,0,100,100,100,60,240],weeklyTargetMinutes:720,equipment:['bicycle','power'],threshold:{watts:308,date:today,method:'estimate',version:'provisional-308'},coach:{confirmed:true,focus:'endurance',goalDetail:'General development',cycleStart:'2026-11-09',checkInDate:today,fatigue:1,soreness:1,sleep:5,motivation:5,intervalExperience:'two',strengthDays:[0,4]}});
const history=()=>Array.from({length:28},(_,i)=>{const date=addDays('2026-10-05',i);return {id:`private-history-${i}`,date,title:'Private activity never exported',minutes:[120,0,100,100,100,60,240][weekday(date)],distanceKm:null,rpe:null,discipline:'cycling',source:'strava',recordedAt:'2026-11-07T12:00:00Z'};}).filter(a=>a.minutes);
const plan=(profile=p(),previous=null)=>propose(profile,history(),today,previous,planningContext(profile,today));
test('308 W FTP produces primary watt prescriptions and correctly counts only the quality session',()=>{
 const a=plan();assert.equal(a.coach.prescription.qualitySessions,1);assert.ok(a.workouts.filter(w=>w.minutes).every(w=>w.steps.every(s=>s.unit==='W'&&s.target===s.powerTarget.targetWatts)));const tempo=a.workouts.find(isQualityWorkout),work=tempo.steps.filter(s=>s.intensity==='work');assert.deepEqual(work.map(s=>s.target),[257,257]);assert.ok(work.every(s=>s.powerTarget.minWatts===246&&s.powerTarget.maxWatts===268));assert.ok(a.workouts.find(w=>w.kind==='endurance').steps.some(s=>s.target===193));assert.equal(a.conflicts.length,0);
});
test('computer steps and trainer XML preserve every duration, recovery, target and order',()=>{
 const w=plan().workouts.find(isQualityWorkout),d=deviceWorkout(w),xml=workoutZwo(w),blocks=[...xml.matchAll(/<SteadyState Duration="(\d+)" Power="([\d.]+)"\/>/g)];assert.equal(d.totalSeconds,6000);assert.equal(d.rows.length,6);assert.deepEqual(d.rows.map(r=>r.seconds),[900,480,180,480,3360,600]);assert.equal(blocks.reduce((n,b)=>n+Number(b[1]),0),6000);assert.deepEqual(blocks.map(b=>Math.round(Number(b[2])*308)),d.rows.map(r=>r.watts));assert.equal(d.rows.at(-1).endSeconds,6000);assert.match(xml,/Set Zwift FTP to 308 W/);const text=workoutSetupText(w);assert.match(text,/00:03:00 at 146 W/);assert.doesNotMatch(text,/RPE|private-history|Private activity/);
});
test('repetitions expand to explicit ordered device steps and XML escapes names',()=>{
 const w=structuredClone(plan().workouts.find(w=>w.kind==='recovery'));w.steps[1].repetitions=2;w.minutes+=w.steps[1].minutes;w.title='A & B <safe>';const d=deviceWorkout(w);assert.equal(d.rows.length,4);assert.equal(d.totalSeconds,w.minutes*60);assert.match(workoutZwo(w),/A &amp; B &lt;safe&gt;/);
});
test('accepted watt prescriptions survive changed FTP, and invalid or mixed snapshots cannot export',()=>{
 const before=plan(),w=before.workouts.find(isQualityWorkout);w.locked=true;const xml=workoutZwo(w),after=plan({...p(),threshold:{...p().threshold,watts:320,version:'new'}},before);assert.equal(workoutZwo(after.workouts.find(a=>a.id===w.id)),xml);const bad=structuredClone(w);bad.steps[0].target=999;assert.throws(()=>validateWorkout(bad),/target/);const mixed=structuredClone(w);mixed.steps[0].powerTarget.thresholdDate='2026-11-06';assert.throws(()=>deviceWorkout(mixed),/same preserved/);
});
test('sensor-free and stale-reference workouts remain available but cannot masquerade as watt files',()=>{
 for(const profile of [{...p(),threshold:null},{...p(),equipment:['bicycle']},{...p(),threshold:{...p().threshold,date:'2026-01-01'}}]){const w=plan(profile).workouts.find(w=>w.minutes);assert.ok(w.steps.every(s=>s.unit==='RPE / 10'));assert.throws(()=>workoutZwo(w),/watt-based/);}assert.throws(()=>deviceWorkout(plan().workouts[0]),/watt-based/);
});
