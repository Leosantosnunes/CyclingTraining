import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,propose,planningContext,addDays,weekday,changes,validateWorkout,isQualityStep,isQualityWorkout} from '../public/engine.js';
const day='2026-11-07';
const intake=()=>({confirmed:true,focus:'endurance',goalDetail:'General development for road and criterium racing in May.',cycleStart:'2026-11-09',checkInDate:day,fatigue:1,soreness:1,sleep:5,motivation:5,intervalExperience:'two'});
const profile=()=>({...defaultProfile(),goal:'racing',experience:'consistent',availability:[120,0,100,100,100,60,240],weeklyTargetMinutes:720,equipment:['bicycle','power','hr'],coach:intake()});
function rides(measured=false){return Array.from({length:28},(_,i)=>{const date=addDays('2026-10-05',i),d=weekday(date),minutes=[120,0,100,100,100,60,240][d];return {id:`r-${i}`,date,title:'Representative test ride',minutes,distanceKm:null,rpe:null,discipline:'cycling',source:'strava',recordedAt:'2026-11-07T12:00:00Z',...(measured?{sensors:{power:{source:'device'}},signals:{quality:[],power:{mean:null,seconds:minutes*60,histogram:[[180,Math.max(0,minutes-20)*60],[340,20*60]],best:[]},heartRate:{seconds:0,mean:null},drift:{eligible:false}}}:{})};}).filter(a=>a.minutes);}
const build=(p=profile(),a=rides(),prev=null)=>propose(p,a,day,prev,planningContext(p,day));
test('confirmed experienced rider gets a distinct first cycle with one RPE quality session when intensity coverage is unknown',()=>{
 const p=profile(),plan=build(p);assert.equal(plan.coach.prescription.qualitySessions,1);assert.equal(plan.coach.coverage,0);assert.ok(plan.workouts.some(w=>w.kind==='tempo'));assert.ok(plan.workouts.some(w=>w.kind==='long'));assert.ok(plan.workouts.some(w=>w.kind==='recovery'));assert.equal(plan.workouts[0].minutes,0);assert.ok(plan.workouts.every(w=>w.minutes<=p.availability[weekday(w.date)]));assert.ok(plan.workouts.flatMap(w=>w.steps).every(s=>!s.powerTarget));assert.equal(plan.coach.cycle.startDate,'2026-11-09');assert.equal(plan.workouts.at(-1).date,'2026-11-15');
});
test('complete current-reference exposure can support two separated quality sessions at unchanged volume',()=>{
 const p={...profile(),coach:{...intake(),focus:'race'},threshold:{watts:300,date:'2026-10-15',method:'test',version:'test-1'}};const plan=build(p,rides(true)),hard=plan.workouts.filter(w=>isQualityWorkout(w));
 assert.equal(hard.length,2);assert.ok(Date.parse(hard[1].date)-Date.parse(hard[0].date)>=2*86400000);assert.ok(hard.every(w=>w.steps.every(s=>s.powerTarget)));assert.ok(plan.coach.prescription.workMinutes<=plan.coach.prescription.maxWorkMinutes);assert.equal(plan.conflicts.length,0);plan.workouts.forEach(validateWorkout);
 const original=structuredClone(hard[0]);p.threshold.watts=320;assert.equal(original.steps.find(isQualityStep).powerTarget.thresholdWatts,300);
});
test('a request to increase volume does not also increase quality frequency',()=>{
 const p={...profile(),weeklyTargetMinutes:750,availability:[150,0,110,110,110,60,240],threshold:{watts:300,date:'2026-10-15',method:'test'}};const plan=build(p,rides(true));assert.equal(plan.coach.prescription.qualitySessions,1);assert.ok(plan.total<=756);
});
test('unconfirmed, stale, poor, and restricted check-ins never introduce intervals',()=>{
 for(const patch of [{coach:{...intake(),confirmed:false}},{coach:{...intake(),checkInDate:'2026-10-15'}},{coach:{...intake(),fatigue:4}},{recovery:'poor'},{limitation:'restricted'},{coach:{...intake(),intervalExperience:'unknown'}}]){const plan=build({...profile(),...patch});assert.equal(plan.coach.prescription.qualitySessions,0);}
 assert.ok(build({...profile(),coach:{...intake(),sleep:1}}).total<build().total);
});
test('quality respects other exercise and long-ride spacing even when slots are awkward',()=>{
 const plan=build({...profile(),otherExerciseDays:[3,5]});assert.equal(plan.coach.prescription.qualitySessions,0);assert.equal(plan.workouts.find(w=>weekday(w.date)===3).minutes,0);
});
test('Thursday and Sunday strength allows easy cycling but leaves only Tuesday eligible for quality',()=>{
 const p={...profile(),coach:{...intake(),strengthDays:[4,0]}},plan=build(p);const hard=plan.workouts.filter(w=>isQualityWorkout(w));assert.equal(hard.length,1);assert.equal(weekday(hard[0].date),2);assert.ok(plan.workouts.find(w=>weekday(w.date)===4).minutes>0);assert.ok(plan.workouts.find(w=>weekday(w.date)===0).minutes>0);assert.ok(plan.reasons.some(r=>r.includes('Strength training on')));
});
test('stale FTP never supplies watts and a 20-minute best is never converted into FTP',()=>{
 const plan=build({...profile(),threshold:{watts:308,date:'2026-01-01',method:'estimate'}},rides(true));assert.ok(plan.workouts.flatMap(w=>w.steps).every(s=>!s.powerTarget));assert.equal(plan.coach.freshThreshold,false);
});
test('poor completion feedback reduces the proposal while preserving the original completed work',()=>{
 const prev=build();prev.workouts[0].status='completed';prev.workouts[0].date=day;prev.workouts[0].feedback={feeling:'poor',actualMinutes:0};const plan=build(profile(),rides(),prev);assert.equal(plan.coach.prescription.qualitySessions,0);assert.ok(plan.total<build().total);
});
test('locked interval prescriptions remain immutable and surface recovery conflicts',()=>{
 const prev=build(),w=prev.workouts.find(w=>isQualityWorkout(w));w.locked=true;const next=build({...profile(),recovery:'poor'},rides(),prev);assert.deepEqual(next.workouts.find(x=>x.id===w.id),w);assert.ok(next.conflicts.length);
});
test('power-only prescription changes appear in preview and malformed threshold snapshots are rejected',()=>{
 const p={...profile(),threshold:{watts:300,date:'2026-10-15',method:'test',version:'v1'}},before=build(p),after=build({...p,threshold:{...p.threshold,watts:320,version:'v2'}});assert.ok(changes(before,after).length);const bad=structuredClone(before.workouts.find(w=>w.minutes));bad.steps[0].powerTarget.unit='% FTP';assert.throws(()=>validateWorkout(bad),/power target/);
});
test('cycle week four reduces load and later cycles need a new review',()=>{
 const normal=build(),review=build({...profile(),coach:{...intake(),cycleStart:'2026-10-19'}}),expired=build({...profile(),coach:{...intake(),cycleStart:'2026-10-12'}});assert.equal(review.coach.cycleWeek,4);assert.ok(review.total<normal.total);assert.equal(review.coach.prescription.qualitySessions,0);assert.equal(expired.coach.prescription.qualitySessions,0);
});
