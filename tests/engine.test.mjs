import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile, propose, syntheticActivities, analyze, validateActivity, validateProfile, validateWorkout, addDays, weekday, localDate, restoreFuture } from '../public/engine.js';
import { initialState, load, save, KEY, validateState, acceptProposal } from '../public/storage.js';
import { server } from '../server.mjs';
import http from 'node:http';
const date = '2026-11-07';
const p = () => ({ ...defaultProfile(), recoveryWeekEnd: '' });
const history = () => syntheticActivities(date);
test('synthetic evidence is explicit and rolling average includes empty weeks',()=>{
  const a=analyze(history(),date);assert.equal(a.rides.length,10);assert.equal(a.minutes,555);assert.equal(a.weeklyAverage,138);assert.deepEqual(a.sources,['synthetic']);
});
test('seven dates, full workout arithmetic, equipment and no invented power targets',()=>{
  const plan=propose(p(),history(),date);assert.equal(plan.workouts.length,7);assert.equal(new Set(plan.workouts.map(w=>w.id)).size,7);assert.ok(plan.total<=138);
  for(const w of plan.workouts){validateWorkout(w);assert.ok(w.minutes<=p().availability[weekday(w.date)]);assert.equal(w.steps.reduce((s,v)=>s+v.minutes*v.repetitions,0),w.minutes);assert.equal(w.thresholdVersion,null);}
});
test('new or sensor-free riders receive conservative RPE sessions',()=>{
  const profile={...p(),experience:'new',weeklyMinutes:600,equipment:['bicycle'],availability:[60,60,60,60,60,60,60]};
  const plan=propose(profile,[],date);assert.ok(plan.total<=90);assert.ok(plan.workouts.some(w=>w.minutes));assert.ok(plan.workouts.flatMap(w=>w.steps).every(s=>s.unit==='RPE / 10'));
  const rideDates=plan.workouts.filter(w=>w.minutes).map(w=>w.date);for(let i=1;i<rideDates.length;i++)assert.ok(rideDates[i]>=addDays(rideDates[i-1],2));
});
test('restricted availability and rest days never overrun',()=>{
  for(const availability of [[0,0,0,0,0,0,0],[10,10,10,10,10,10,10],[15,0,0,0,0,0,0],[60,60,60,60,60,60,60]]){
    const plan=propose({...p(),availability},history(),date);assert.ok(plan.workouts.every(w=>w.minutes<=availability[weekday(w.date)]));if(availability.every(v=>v<15))assert.equal(plan.total,0);
  }
});
test('zero recent self-reported training does not invent capacity',()=>{assert.equal(propose({...p(),weeklyMinutes:0},[],date).total,0);});
test('poor recovery reduces proposed volume and recorded outcomes stay immutable',()=>{
  const before=propose(p(),history(),date), reduced=propose({...p(),recovery:'poor'},history(),date);assert.ok(reduced.total<before.total);
  before.workouts[0].status='partial';before.workouts[0].feedback={actualMinutes:10,feeling:'poor'};
  const after=propose({...p(),recovery:'poor'},history(),date,before);assert.deepEqual(after.workouts[0],before.workouts[0]);
});
test('missed workouts never get stacked and repeat proposals are deterministic',()=>{
  const before=propose(p(),history(),date);before.workouts[0].status='skipped';before.workouts[0].feedback={actualMinutes:0,feeling:'comfortable'};
  const a=propose(p(),history(),date,before),b=propose(p(),history(),date,before);assert.deepEqual(a.workouts,b.workouts);assert.equal(a.workouts[0].status,'skipped');assert.ok(a.total<=before.total);
});
test('locked sessions surface availability, recovery, and safety conflicts',()=>{
  const before=propose(p(),history(),date);before.workouts[0].locked=true;
  const after=propose({...p(),availability:[0,0,0,0,0,0,0],limitation:'acute'},history(),date,before);assert.ok(after.conflicts.length>=2);assert.deepEqual(after.workouts[0],before.workouts[0]);
});
test('medical restrictions and unsupported equipment pause automatic riding',()=>{
  for(const profile of [{...p(),limitation:'acute'},{...p(),limitation:'restricted'},{...p(),equipment:[]},{...p(),preference:'inside',equipment:['bicycle']}])assert.equal(propose(profile,history(),date).total,0);
});
test('other demanding exercise days are kept free and cross training reduces budget',()=>{
  const profile={...p(),otherExerciseDays:[6]};const a=propose(profile,history(),date);assert.equal(a.workouts[0].minutes,0);
  const extra={...history()[0],id:'other',discipline:'other',minutes:120};assert.ok(propose(p(),[...history(),extra],date).budget<propose(p(),history(),date).budget);
});
test('stale threshold is disclosed and not used to generate watts',()=>{
  const plan=propose({...p(),threshold:{watts:220,method:'estimate',date:'2025-01-01'}},history(),date);assert.ok(plan.reasons.some(r=>r.includes('stale')));assert.ok(plan.workouts.every(w=>w.thresholdVersion===null));
});
test('past event rejected, imminent event tapers and event day has no auto workout',()=>{
  assert.throws(()=>propose({...p(),goal:'event',eventDate:'2026-11-01'},history(),date),/event date/);
  const plan=propose({...p(),goal:'event',eventDate:'2026-11-10'},history(),date);assert.ok(plan.budget<propose(p(),history(),date).budget);assert.ok(plan.workouts.filter(w=>w.date>='2026-11-10').every(w=>w.minutes===0));
});
test('extended break reduces capacity, goals cannot create more available time',()=>{
  const old=[0,1,2].map((_,i)=>({...history()[i],date:addDays(date,-22-i)}));const plan=propose(p(),old,date);assert.ok(plan.reasons.some(r=>r.includes('break')));assert.ok(plan.budget<=old.reduce((s,a)=>s+a.minutes,0)/8);
  assert.equal(propose({...p(),goal:'racing',availability:[0,0,0,0,0,0,0]},history(),date).total,0);
});
test('local date and calendar arithmetic survive DST and travel',()=>{
  assert.equal(localDate('America/Toronto',new Date('2026-11-01T05:30:00Z')),'2026-11-01');assert.equal(localDate('America/Toronto',new Date('2026-11-01T06:30:00Z')),'2026-11-01');assert.equal(addDays('2026-10-31',2),'2026-11-02');
  assert.equal(localDate('Asia/Tokyo',new Date('2026-11-07T23:30:00Z')),'2026-11-08');
});
test('undo preserves completed history and locked future sessions',()=>{
  const prior=propose(p(),history(),date),current=propose({...p(),recovery:'poor'},history(),date);current.workouts[0].status='completed';current.workouts[2].locked=true;
  const restored=restoreFuture(current,prior,date);assert.deepEqual(restored.workouts[0],current.workouts[0]);assert.deepEqual(restored.workouts[2],current.workouts[2]);assert.deepEqual(restored.workouts[4],prior.workouts[4]);
});
test('invalid measurements, units, dates, and arithmetic are rejected',()=>{
  assert.throws(()=>validateActivity({...history()[0],date:'2026-02-30'}));assert.throws(()=>validateActivity({...history()[0],minutes:-1}));assert.throws(()=>validateProfile({...p(),availability:[NaN]},date));assert.throws(()=>validateProfile({...p(),timezone:'Invalid/Zone'},date));assert.throws(()=>validateProfile({...p(),units:'watts'},date));
  const w=propose(p(),history(),date).workouts.find(w=>w.minutes);w.steps[0].minutes++;assert.throws(()=>validateWorkout(w));
});
function memory(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
test('validated persistence, duplicates, schema errors, and concurrent tabs',()=>{
  const store=memory(),a=initialState();save(a,store);const b=load(store);save(a,store);assert.throws(()=>save(b,store),/Another tab/);
  const duplicate=initialState();duplicate.activities.push(duplicate.activities[0]);assert.throws(()=>validateState(duplicate),/Duplicate/);
  assert.throws(()=>validateState({...initialState(),schema:2}));assert.throws(()=>validateState({...initialState(),connection:{status:'connected'}}));
  store.setItem(KEY,'broken');assert.throws(()=>load(store));
});
test('activity retention removes old records without touching prescriptions',()=>{
  const s=initialState(),store=memory();s.activities.push({...s.activities[0],id:'expired',date:'2020-01-01'});save(s,store);assert.ok(!load(store).activities.some(a=>a.id==='expired'));
});
test('adaptation acceptance is idempotent and snapshots cannot be changed by later edits',()=>{
  const s=initialState(),candidate={id:'event-1',baseRevision:0,plan:propose(s.profile,s.activities,localDate(s.profile.timezone)),profile:s.profile,reason:'Initial proposal',diff:[]};
  assert.equal(acceptProposal(s,candidate),true);assert.equal(acceptProposal(s,candidate),false);assert.equal(s.revisions.length,1);
  const original=s.revisions[0].after.workouts[0].locked;s.plan.workouts[0].locked=!original;assert.equal(s.revisions[0].after.workouts[0].locked,original);validateState(s);
  assert.throws(()=>acceptProposal({...s,revision:2},{...candidate,id:'event-2'}),/Data changed/);
});
test('server blocks non-local hostnames and unlisted files; supplies security headers',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  try { const res=await fetch(`http://127.0.0.1:${port}/`);assert.equal(res.status,200);assert.ok(res.headers.get('content-security-policy').includes("script-src 'self'"));assert.equal((await fetch(`http://127.0.0.1:${port}/.env`)).status,404);assert.equal((await fetch(`http://127.0.0.1:${port}/`,{method:'POST'})).status,405);const status=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:'/',headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(status,403); } finally {await new Promise(resolve=>server.close(resolve));}
});
