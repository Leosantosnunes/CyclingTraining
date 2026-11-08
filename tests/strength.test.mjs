import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,defaultStrengthSettings,strengthProposal,validateStrengthRoom,undoStrengthWeek} from '../public/engine.js';
import {initialState,validateState,createStravaWorkspace} from '../public/storage.js';
const settings=()=>({...defaultStrengthSettings(),equipment:'gym',experience:'regular',confirmed:true,restrictions:'none',thursdayMinutes:45,sundayMinutes:45,loadNotes:'Squat: reported 150 lb total including bar; comfort at this load not confirmed.'});
const p=()=>({...defaultProfile(),strength:settings()});
const week=(profile=p(),records=[],previous=null)=>strengthProposal(profile,'2026-11-09',records,previous,'2026-11-08');
const accepted=()=>({...week(),revision:0});
test('full gym sessions use reported patterns with separate Thursday and Sunday dates and no fabricated kg',()=>{
 const a=week();assert.equal(a.canAccept,true);assert.deepEqual(a.sessions.map(s=>s.date),['2026-11-12','2026-11-15']);assert.deepEqual(a.sessions.map(s=>s.exercises.length),[4,4]);assert.equal(a.sessions[0].exercises[0].sets,3);assert.match(a.sessions[1].exercises[0].title,/Bulgarian/);assert.ok(a.sessions.every(s=>s.minutes<=45));assert.ok(a.sessions.every(s=>s.exercises.every(e=>!('kg' in e))));assert.match(a.sessions[0].loadNotes,/150 lb total/);validateStrengthRoom({plans:[{...a,revision:0}],records:[]});
});
test('unconfirmed setup remains a visible unaccepted draft and restrictions pause actual prescriptions',()=>{
 assert.equal(week({...p(),strength:defaultStrengthSettings()}).canAccept,false);
 for(const profile of [{...p(),limitation:'restricted'},{...p(),limitation:'acute'},{...p(),strength:{...settings(),restrictions:'restricted'}}]){const a=week(profile);assert.equal(a.canAccept,false);assert.ok(a.sessions.every(s=>s.minutes===0&&s.exercises.length===0));}
});
test('time-constrained sessions fit warm-up and finish, and sensor-free variants require no gym',()=>{
 for(const equipment of ['gym','dumbbells','bodyweight'])for(const n of [15,20,30,45,60]){const a=week({...p(),strength:{...settings(),equipment,thursdayMinutes:n,sundayMinutes:n}});for(const s of a.sessions){assert.ok(s.minutes<=n);if(s.minutes)assert.equal(s.minutes,s.warmup.minutes+s.cooldown.minutes+s.exercises.reduce((n,e)=>n+e.minutes,0));}}
 const body=week({...p(),strength:{...settings(),equipment:'bodyweight'}});assert.ok(!JSON.stringify(body.sessions).includes('Smith'));
});
test('poor recovery and recent soreness reduce sets without assuming an imported gym activity is a completion',()=>{
 const normal=week(),poor=week({...p(),recovery:'poor'});assert.ok(poor.sessions[0].exercises[0].sets<normal.sessions[0].exercises[0].sets);assert.ok(poor.sessions.every(s=>s.reduced));assert.ok(!('status' in normal.sessions[0]));
 const record={sessionId:'strength-2026-11-05',date:'2026-11-05',status:'completed',actualMinutes:40,soreness:4,pain:false,notes:''};assert.ok(week(p(),[record]).sessions[0].reduced);
});
test('accepted completed prescriptions survive changes and future undo retains completion feedback',()=>{
 const a=accepted(),record={sessionId:a.sessions[0].id,date:a.sessions[0].date,status:'partial',actualMinutes:25,soreness:2,pain:false,notes:'Used lighter weights'};
 const changed=week({...p(),strength:{...settings(),equipment:'bodyweight'}},[record],a);assert.deepEqual(changed.sessions[0],a.sessions[0]);assert.notDeepEqual(changed.sessions[1],a.sessions[1]);const room={plans:[a,{...changed,revision:1}],records:[record]};assert.ok(undoStrengthWeek(room,a.startDate,'2026-11-13'));assert.deepEqual(room.plans.at(-1).sessions[0],a.sessions[0]);assert.deepEqual(room.plans.at(-1).sessions[1],a.sessions[1]);assert.deepEqual(room.records,[record]);
});
test('initial undo cancels only future uncompleted sessions and preserves the original version',()=>{
 const a=accepted(),room={plans:[a],records:[]};undoStrengthWeek(room,a.startDate,'2026-11-08');assert.ok(room.plans.at(-1).sessions.every(s=>s.minutes===0&&s.paused));assert.equal(room.plans[0].sessions[0].minutes,a.sessions[0].minutes);validateStrengthRoom(room);
});
test('strength inputs and manually recorded outcomes validate without persisting Strava activity history',()=>{
 const local=initialState();local.profile=p();local.strengthRoom={plans:[accepted()],records:[]};validateState(local);const remote=createStravaWorkspace(local,[]);assert.deepEqual(remote.strengthRoom,local.strengthRoom);remote.strengthRoom.plans[0].sessions[0].exercises[0].sets=1;assert.equal(local.strengthRoom.plans[0].sessions[0].exercises[0].sets,3);const invalid=structuredClone(local);invalid.strengthRoom.plans[0].sessions[0].minutes=99;assert.throws(()=>validateState(invalid),/strength session/);
});
