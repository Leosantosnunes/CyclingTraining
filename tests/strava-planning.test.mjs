import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile, planningContext, fromStrava, assessTraining, propose, addDays } from '../public/engine.js';
import { initialState, createStravaWorkspace, save, validateState, acceptProposal } from '../public/storage.js';
const date='2026-11-07';
const record=(id,day,minutes=60,sport='Ride')=>({id:String(id),title:`Actual ride ${id}`,sport,startDate:`${day}T18:00:00Z`,localDate:day,movingSeconds:minutes*60,distanceMeters:25000,fetchedAt:Date.parse('2026-11-07T23:00:00Z')});
const records=()=>[...Array.from({length:4},(_,i)=>[record(i*2+1,addDays('2026-10-30',-7*i),60),record(i*2+2,addDays('2026-10-31',-7*i),90)]).flat(),record(99,'2026-11-05',15)];
test('recovery week ending Nov 8 produces Nov 9–15 and excludes recovery from the baseline',()=>{
  const p=defaultProfile(),context=planningContext(p,date);assert.equal(context.startDate,'2026-11-09');assert.equal(context.baselineEnd,'2026-11-01');
  const activities=fromStrava(records(),p.timezone).activities,plan=propose(p,activities,date,null,context);
  assert.equal(plan.startDate,'2026-11-09');assert.equal(plan.workouts.at(-1).date,'2026-11-15');assert.equal(plan.observedOn,date);assert.equal(plan.budget,150);assert.ok(!plan.evidenceIds.includes('strava-99'));assert.ok(plan.reasons.some(r=>r.includes('recovery week ending 2026-11-08')));
  assert.ok(plan.workouts.every(w=>w.minutes<=p.availability[new Date(w.date+'T12:00:00Z').getUTCDay()]));
});
test('rider classification uses actual records without inventing fitness, FTP, or RPE',()=>{
  const p=defaultProfile(),mapped=fromStrava(records(),p.timezone),a=assessTraining(mapped.activities,p,date);
  assert.equal(a.label,'Regular riding history');assert.equal(a.baseline.weeklyAverage,150);assert.equal(a.fitness,'Not measured');assert.ok(mapped.activities.every(r=>r.source==='strava'&&r.rpe===null));assert.equal(a.evidenceIds.length,8);
  const none=assessTraining([],p,date);assert.equal(none.label,'Limited recorded history');assert.equal(none.fitness,'Not measured');
});
test('poor recovery still lowers next week despite the scheduled recovery week ending',()=>{
  const p=defaultProfile(),a=fromStrava(records(),p.timezone).activities,c=planningContext(p,date);
  const normal=propose(p,a,date,null,c),poor=propose({...p,recovery:'poor'},a,date,null,c);assert.ok(poor.total<normal.total);assert.ok(poor.reasons.some(r=>r.includes('poor recovery')));
});
test('API zero-duration and other sports are explicit; invalid records cannot inflate load',()=>{
  const mapped=fromStrava([record(1,'2026-10-30',0),record(2,'2026-10-31',40,'Run'),{...record(3,'2026-10-31'),movingSeconds:-1}], 'America/Toronto');
  assert.equal(mapped.rejected.length,1);assert.equal(mapped.activities[0].minutes,0);assert.equal(mapped.activities[1].discipline,'other');const a=assessTraining(mapped.activities,defaultProfile(),date);assert.equal(a.baseline.rides.length,0);
});
test('planning timezone conversion is deliberate across midnight and DST',()=>{
  const r={...record(1,'2026-11-01'),startDate:'2026-11-02T01:30:00Z'};
  assert.equal(fromStrava([r],'America/Toronto').activities[0].date,'2026-11-01');assert.equal(fromStrava([r],'Asia/Tokyo').activities[0].date,'2026-11-02');
});
test('connected workspace contains no synthetic history and cannot be persisted',()=>{
  const local=initialState(),activities=fromStrava(records(),local.profile.timezone).activities,w=createStravaWorkspace(local,activities);
  assert.equal(w.mode,'strava');assert.ok(!w.activities.some(a=>a.source==='synthetic'));assert.equal(w.plan,null);assert.equal(w.revisions.length,0);validateState(w,{ephemeral:true});assert.throws(()=>save(w,{getItem:()=>null,setItem:()=>assert.fail('must not write')}),/temporary/);
  const plan=propose(w.profile,w.activities,date,null,planningContext(w.profile,date));acceptProposal(w,{id:'new',baseRevision:w.revision,profile:w.profile,plan,reason:'Next week',diff:[]});validateState(w,{ephemeral:true});assert.equal(local.plan,null);assert.ok(local.activities.every(a=>a.source==='synthetic'));
});
test('API plans preserve locked sessions and original prescriptions after refresh',()=>{
  const p=defaultProfile(),a=fromStrava(records(),p.timezone).activities,c=planningContext(p,date),before=propose(p,a,date,null,c);const locked=before.workouts.find(w=>w.minutes);locked.locked=true;
  const after=propose({...p,recovery:'poor'},a,date,before,c);assert.deepEqual(after.workouts.find(w=>w.id===locked.id),locked);assert.ok(after.conflicts.length);
});
test('recovery date remains a user setting and future activities never leak into baseline',()=>{
  const p=defaultProfile(),a=fromStrava([...records(),record(200,'2026-11-10',500)],p.timezone).activities;
  const assessment=assessTraining(a,p,date);assert.equal(assessment.baseline.weeklyAverage,150);assert.ok(!assessment.evidenceIds.includes('strava-200'));assert.equal(planningContext({...p,recoveryWeekEnd:''},date).startDate,'2026-11-09');assert.equal(planningContext(p,'2026-11-09').baselineEnd,'2026-11-01');
});
const regularVolumeRecords=()=>Array.from({length:28},(_,i)=>record(1000+i,addDays('2026-10-05',i),[60,75,75,75,75,240,100][i%7]));
test('explicit 12-hour target fits six easy days, Monday rest, and established longest ride',()=>{
  const p={...defaultProfile(),experience:'consistent',weeklyTargetMinutes:720,availability:[150,0,90,90,90,60,240]};
  const a=fromStrava(regularVolumeRecords(),p.timezone).activities,c=planningContext(p,date),plan=propose(p,a,date,null,c);
  assert.equal(plan.budget,720);assert.equal(plan.total,720);assert.equal(plan.workouts[0].minutes,0);assert.deepEqual(plan.workouts.map(w=>w.minutes),[0,90,90,90,60,240,150]);assert.ok(plan.workouts.every(w=>w.minutes<=240));
  assert.ok(plan.reasons.some(r=>r.includes('explicitly requested')));assert.ok(plan.workouts.flatMap(w=>w.steps).every(s=>s.target<=3));
});
test('requested volume does not override recovery, sparse history, or the configured progression limit',()=>{
  const p={...defaultProfile(),experience:'consistent',weeklyTargetMinutes:780,availability:[240,0,120,120,120,120,240]};const a=fromStrava(regularVolumeRecords(),p.timezone).activities,c=planningContext(p,date);
  const limited=propose(p,a,date,null,c);assert.ok(limited.total<=735);assert.ok(limited.total<780);assert.ok(limited.reasons.some(r=>r.includes('fits')));
  assert.ok(propose({...p,recovery:'poor'},a,date,null,c).total<limited.total);
  assert.ok(propose({...p,experience:'new'},[],date,null,c).total<=90);
});
test('other exercise above the baseline reserves time in an explicit volume request',()=>{
  const p={...defaultProfile(),experience:'consistent',weeklyTargetMinutes:720,availability:[150,0,90,90,90,60,240]};const a=fromStrava(regularVolumeRecords(),p.timezone).activities,c=planningContext(p,date);
  const other=fromStrava([record(4000,'2026-11-06',120,'WeightTraining')],p.timezone).activities;
  assert.ok(propose(p,[...a,...other],date,null,c).total<propose(p,a,date,null,c).total);
});
