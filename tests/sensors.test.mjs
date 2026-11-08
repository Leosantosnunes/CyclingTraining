import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarWindow, sensorSummary, activityDetails, mergeDetails, analyzeStreams, evaluateActivity, overallSignals } from '../public/sensors.js';
const stream=data=>({data});
function steady(seconds=1800,watts=200){const time=Array.from({length:seconds+1},(_,i)=>i);return {time:stream(time),watts:stream(time.map(()=>watts)),heartrate:stream(time.map(t=>t<seconds/2?120:132)),cadence:stream(time.map(()=>90)),moving:stream(time.map(()=>true))};}
test('six calendar months handle short months and leap years',()=>{
  assert.deepEqual(calendarWindow('2026-11-07'),{start:'2026-05-07',end:'2026-11-07'});assert.equal(calendarWindow('2024-08-31').start,'2024-02-29');assert.equal(calendarWindow('2025-08-31').start,'2025-02-28');
});
test('recorded zero watts stays zero, missing stays null, estimated power stays distinct',()=>{
  const s=sensorSummary({device_watts:true,average_watts:0,has_heartrate:false,average_heartrate:0});assert.equal(s.power.averageWatts,0);assert.equal(s.power.source,'device');assert.equal(s.heartRate.averageBpm,null);assert.equal(sensorSummary({average_watts:180,device_watts:false}).power.source,'estimated');assert.equal(sensorSummary({}).power.source,'missing');assert.equal(sensorSummary({device_watts:true}).power.source,'device');
});
test('stream averages are time-weighted with irregular samples and include coasting',()=>{
  const a=analyzeStreams({time:stream([0,10,30]),watts:stream([0,300,300]),heartrate:stream([100,150,150]),moving:stream([true,true,true])},true);
  assert.equal(a.power.mean,200);assert.ok(Math.abs(a.heartRate.mean-4000/30)<1e-8);assert.equal(a.workKj,6);assert.equal(a.power.seconds,30);
});
test('continuous benchmarks use recorded windows, and 20-minute power is not treated as FTP',()=>{
  const a=analyzeStreams(steady(),true);assert.equal(a.power.mean,200);assert.ok(Math.abs(a.workKj-360)<1e-8);assert.ok(a.power.best.every(p=>p.watts===200));assert.ok(!Object.hasOwn(a,'ftp'));assert.equal(a.sampleCount,1801);
});
test('long gaps cannot create continuous efforts or inflated work',()=>{
  const a=analyzeStreams({time:stream([0,10,100,110]),watts:stream([200,200,200,200]),heartrate:stream([130,130,130,130])},true);assert.equal(a.gapSeconds,90);assert.equal(a.workKj,4);assert.equal(a.power.best.find(p=>p.seconds===60).watts,null);assert.equal(a.power.best.find(p=>p.seconds===5).watts,null);assert.ok(a.quality.some(q=>q.includes('no interpolation')));
});
test('only suitably steady measured power and paired HR receive a ratio comparison',()=>{
  const a=analyzeStreams(steady(),true);assert.equal(a.drift.eligible,true);assert.ok(Math.abs(a.drift.percent-100*(1-120/132))<1e-8);
  assert.equal(analyzeStreams(steady(),false).drift.eligible,false);
  const variable=steady();variable.watts.data=variable.watts.data.map((_,i)=>i%2?50:350);assert.equal(analyzeStreams(variable,true).drift.eligible,false);
  const missing=steady();delete missing.heartrate;assert.equal(analyzeStreams(missing,true).drift.eligible,false);
});
test('sensor mismatches, dropouts, and impossible values are reported without invented measurements',()=>{
  const a=analyzeStreams({time:stream([0,10,20]),watts:stream([200,99999,200]),heartrate:stream([0,0]),moving:stream([true,true,true])},true);assert.equal(a.power.seconds,10);assert.equal(a.heartRate.mean,null);assert.ok(a.quality.some(q=>q.includes('sample count')));assert.ok(a.quality.some(q=>q.includes('validation bounds')));assert.throws(()=>analyzeStreams({time:stream([0,0,10])},true));
});
test('estimated watts never enter measured-power benchmarks or FTP effort accounting',()=>{
  const a={sensors:sensorSummary({device_watts:false,average_watts:200}),signals:analyzeStreams(steady(),false)};assert.equal(a.signals.power.best.length,0);const result=evaluateActivity(a,{watts:150,date:'2026-11-01',method:'test'});assert.equal(result.aboveFtpSeconds,null);assert.ok(result.limitations.some(t=>t.includes('estimated')));
});
test('detail selection retains laps/device provenance while excluding routes and notes',()=>{
  const d=activityDetails({device_name:'Trainer',device_watts:true,description:'private-note',map:{polyline:'private-route'},laps:[{name:'Work',elapsed_time:600,average_watts:240,average_heartrate:150}]});assert.equal(d.laps[0].averageBpm,150);assert.ok(!JSON.stringify(d).includes('private'));const merged=mergeDetails(sensorSummary({device_watts:true,average_watts:200}),activityDetails({device_name:'Trainer'}));assert.equal(merged.power.source,'device');assert.equal(merged.power.averageWatts,200);
});
test('six-month overview excludes older data and makes coverage and observed benchmark provenance explicit',()=>{
  const sensors=sensorSummary({device_watts:true,average_watts:200,has_heartrate:true});const signals=analyzeStreams(steady(),true);
  const a={id:'one',date:'2026-11-01',minutes:30,discipline:'cycling',sensors,signals};const result=overallSignals([a,{...a,id:'old',date:'2026-05-06'},{...a,id:'estimated',sensors:sensorSummary({device_watts:false,average_watts:200})}], '2026-11-07',{watts:190,date:'2026-11-01',method:'test'});
  assert.equal(result.cyclingRecords,2);assert.equal(result.measuredPowerRecords,1);assert.equal(result.estimatedPowerRecords,1);assert.equal(result.best.find(b=>b.seconds===1200).id,'one');assert.equal(result.aboveFtpSeconds,1800);assert.equal(result.periods[0].best20MinuteWatts,200);assert.match(result.note,/not FTP/);
  assert.equal(overallSignals([a],'2026-11-07',{watts:190,date:'2020-01-01',method:'test'}).aboveFtpSeconds,null);
});
