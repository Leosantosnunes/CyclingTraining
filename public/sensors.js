// Descriptive signal processing, not a medical or validated physiological model.
export const SENSOR_POLICY = Object.freeze({ version:'signals-1.0', months:6, maxSamples:200000, maxGapSeconds:30, maxPlotPoints:240, steadyMinSeconds:1800, steadyPowerCv:0.15, steadyHalfDifference:0.1, powerDurations:[5,60,300,1200], limits:{ watts:[0,5000], heartrate:[25,260], cadence:[0,300], temp:[-60,80], velocity_smooth:[0,50], altitude:[-500,10000] } });
export const STREAM_KEYS = ['time','watts','heartrate','cadence','velocity_smooth','distance','altitude','temp','moving'];
const number = (value, min=0, max=Infinity) => typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max ? value : null;
const boolean = v => typeof v==='boolean'?v:null;
export function calendarWindow(date, months=SENSOR_POLICY.months) {
  const [y,m,d]=date.split('-').map(Number);const first=new Date(Date.UTC(y,m-1-months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const start=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);
  return {start,end:date};
}
export function dateInZone(instant,timezone='America/Toronto') {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
  return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export function sensorSummary(raw) {
  const averageWatts=number(raw.average_watts,0,5000),maxWatts=number(raw.max_watts,0,5000),deviceWatts=boolean(raw.device_watts);
  return { elapsedSeconds:number(raw.elapsed_time,0,604800), elevationMeters:number(raw.total_elevation_gain,0,30000), estimatedCalories:number(raw.calories,0,50000),providerRelativeEffort:number(raw.suffer_score,0,10000),averageSpeedMps:number(raw.average_speed,0,50), maxSpeedMps:number(raw.max_speed,0,50), averageCadence:number(raw.average_cadence,0,300), temperatureC:number(raw.average_temp,-60,80), trainer:boolean(raw.trainer), commute:boolean(raw.commute), manual:boolean(raw.manual), workoutTag:Number.isInteger(raw.workout_type)?raw.workout_type:null,
    power:{averageWatts,maxWatts,weightedWatts:number(raw.weighted_average_watts,0,5000),workKj:number(raw.kilojoules,0,100000),deviceWatts,source:deviceWatts===true?'device':averageWatts===null&&maxWatts===null?'missing':deviceWatts===false?'estimated':'unknown'},
    heartRate:{recorded:raw.has_heartrate===true||(raw.has_heartrate!==false&&number(raw.average_heartrate,25,260)!==null),averageBpm:raw.has_heartrate===false?null:number(raw.average_heartrate,25,260),maxBpm:raw.has_heartrate===false?null:number(raw.max_heartrate,25,260)} };
}
export function activityDetails(raw) {
  return { ...sensorSummary(raw), deviceName:typeof raw.device_name==='string'?raw.device_name.slice(0,100):null,
    laps:Array.isArray(raw.laps)?raw.laps.slice(0,2000).map((l,i)=>({index:i+1,name:typeof l.name==='string'?l.name.slice(0,100):`Lap ${i+1}`,elapsedSeconds:number(l.elapsed_time,0,604800),movingSeconds:number(l.moving_time,0,604800),distanceMeters:number(l.distance,0,2000000),averageWatts:number(l.average_watts,0,5000),averageBpm:number(l.average_heartrate,25,260),maxBpm:number(l.max_heartrate,25,260),averageCadence:number(l.average_cadence,0,300)})):[] };
}
export function mergeDetails(base, detail) {
  const merged={...base};
  for(const [key,value] of Object.entries(detail))if(key!=='power'&&key!=='heartRate'&&value!==null)merged[key]=value;
  merged.power={...base.power};for(const [key,v]of Object.entries(detail.power))if(v!==null&&key!=='source')merged.power[key]=v;
  merged.power.source=merged.power.deviceWatts===true?'device':merged.power.averageWatts===null&&merged.power.maxWatts===null?'missing':merged.power.deviceWatts===false?'estimated':'unknown';
  merged.heartRate={...base.heartRate};for(const [key,v]of Object.entries(detail.heartRate))if(v!==null&&(key!=='recorded'||v))merged.heartRate[key]=v;
  return merged;
}
function statistics(intervals,key) {
  let seconds=0,sum=0,squares=0,max=null;const histogram=new Map();
  for(const row of intervals){const v=row[key];if(v===null||!row.active)continue;seconds+=row.dt;sum+=v*row.dt;squares+=v*v*row.dt;max=max===null?v:Math.max(max,v);const bin=Math.round(v);histogram.set(bin,(histogram.get(bin)||0)+row.dt);}
  return {seconds,mean:seconds?sum/seconds:null,max,cv:seconds&&sum?Math.sqrt(Math.max(0,squares/seconds-(sum/seconds)**2))/(sum/seconds):null,histogram:[...histogram].sort((a,b)=>a[0]-b[0])};
}
function powerCurve(intervals, time) {
  return SENSOR_POLICY.powerDurations.map(seconds=>{
    const maxStep=Math.min(SENSOR_POLICY.maxGapSeconds,seconds/5),work=[0],coverage=[0];
    const valid=r=>r.watts!==null&&r.dt<=maxStep;
    for(const r of intervals){work.push(work.at(-1)+(valid(r)?r.watts*r.dt:0));coverage.push(coverage.at(-1)+(valid(r)?r.dt:0));}
    function cumulative(x,values,isWork){if(x<=time[0])return 0;if(x>=time.at(-1))return values.at(-1);let lo=0,hi=time.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(time[m]<=x)lo=m;else hi=m;}const r=intervals[lo];return values[lo]+(valid(r)?(x-time[lo])*(isWork?r.watts:1):0);}
    let watts=null;for(const t of time)for(const end of [t,t+seconds]){const start=end-seconds;if(start<time[0]||end>time.at(-1))continue;const covered=cumulative(end,coverage,false)-cumulative(start,coverage,false);if(covered+1e-7<seconds)continue;const value=(cumulative(end,work,true)-cumulative(start,work,true))/seconds;watts=watts===null?value:Math.max(watts,value);}
    return {seconds,watts,maxSampleStep:maxStep};
  });
}
export function analyzeStreams(payload, measuredPower=false) {
  const streams=Array.isArray(payload)?Object.fromEntries(payload.filter(s=>s&&typeof s.type==='string').map(s=>[s.type,s])):payload;
  const time=streams?.time?.data;
  if(!Array.isArray(time)||time.length<2||time.length>SENSOR_POLICY.maxSamples||time.some((v,i)=>number(v,0,604800)===null||(i>0&&v<=time[i-1])))throw Error('Activity time stream is missing or invalid.');
  const quality=[],series={};
  for(const key of STREAM_KEYS.filter(k=>k!=='time')){const a=streams[key]?.data;if(!Array.isArray(a))continue;if(a.length!==time.length){quality.push(`${key}: sample count does not match time; ignored.`);continue;}series[key]=a;}
  if(!series.moving)quality.push('Moving flags are missing; time-weighted means cover recorded elapsed intervals.');
  let gaps=0,invalid=0;const intervals=[];
  for(let i=0;i<time.length-1;i++){
    const dt=time[i+1]-time[i],gap=dt>SENSOR_POLICY.maxGapSeconds; if(gap)gaps+=dt;
    const row={start:time[i],dt,active:series.moving?series.moving[i]===true:true};
    for(const [key,limits]of Object.entries(SENSOR_POLICY.limits)){const original=series[key]?.[i];row[key]=gap?null:number(original,...limits);if(original!=null&&row[key]===null&&!gap)invalid++;}
    intervals.push(row);
  }
  if(gaps)quality.push(`${gaps} seconds of gaps over ${SENSOR_POLICY.maxGapSeconds}s were excluded; no interpolation.`);
  if(invalid)quality.push(`${invalid} sensor values were outside validation bounds and excluded; this is a recording-quality check, not a medical interpretation.`);
  const power=statistics(intervals,'watts'),hr=statistics(intervals,'heartrate'),cadence=statistics(intervals,'cadence'),temperature=statistics(intervals,'temp');
  const activeSeconds=intervals.filter(r=>r.active).reduce((s,r)=>s+r.dt,0);
  const paired=intervals.filter(r=>r.active&&r.watts!==null&&r.heartrate!==null&&r.watts>0);const pairedSeconds=paired.reduce((s,r)=>s+r.dt,0);
  let drift={eligible:false,percent:null,reason:'Needs measured power, paired HR, and a sustained steady effort; variable rides are not treated as drift tests.'};
  if(measuredPower&&pairedSeconds>=SENSOR_POLICY.steadyMinSeconds&&pairedSeconds>=activeSeconds*.8&&power.cv!==null&&power.cv<=SENSOR_POLICY.steadyPowerCv){
    const halves=[{w:0,h:0,t:0},{w:0,h:0,t:0}];let elapsed=0;
    for(const r of paired){const first=Math.min(r.dt,Math.max(0,pairedSeconds/2-elapsed));for(const [index,dt]of [[0,first],[1,r.dt-first]]){halves[index].w+=r.watts*dt;halves[index].h+=r.heartrate*dt;halves[index].t+=dt;}elapsed+=r.dt;}
    const [a,b]=halves;const p1=a.w/a.t,p2=b.w/b.t;
    if(Math.abs(p2-p1)/p1<=SENSOR_POLICY.steadyHalfDifference){const ratio1=a.w/a.h,ratio2=b.w/b.h;drift={eligible:true,percent:(ratio1-ratio2)/ratio1*100,reason:'Descriptive first-half versus second-half power/HR ratio change. Heat, hydration, terrain, sensor errors, and pacing can affect it; this is not a fitness diagnosis.'};}
  }
  const stride=Math.max(1,Math.ceil(time.length/SENSOR_POLICY.maxPlotPoints));const plot=[];
  for(let i=0;i<time.length;i+=stride)plot.push({seconds:time[i],watts:number(series.watts?.[i],0,5000),bpm:number(series.heartrate?.[i],25,260),cadence:number(series.cadence?.[i],0,300)});
  return {version:SENSOR_POLICY.version,sampleCount:time.length,recordedSeconds:time.at(-1)-time[0],activeSeconds,gapSeconds:gaps,power:{...power,source:measuredPower?'device':'not-confirmed-measured',best:measuredPower?powerCurve(intervals,time):[]},heartRate:hr,cadence,temperature,workKj:measuredPower?intervals.reduce((s,r)=>s+(r.watts===null?0:r.watts*r.dt/1000),0):null,drift,plot,quality};
}
export function evaluateActivity(activity, threshold=null) {
  const signal=activity.signals,summary=activity.sensors;const measured=summary?.power?.source==='device';
  const result={measuredPower:measured,hasHeartRate:Boolean(summary?.heartRate?.recorded||signal?.heartRate?.seconds),aboveFtpSeconds:null,ftpReference:null,findings:[],limitations:[]};
  if(summary?.power?.source==='estimated')result.limitations.push('Power is estimated by Strava; excluded from measured-power benchmarks and FTP-based effort analysis.');
  if(!measured)result.limitations.push('No confirmed device-measured power.');
  if(!result.hasHeartRate)result.limitations.push('No recorded heart-rate data available.');
  if(signal){
    if(measured&&signal.power.mean!==null)result.findings.push(`Time-weighted recorded power: ${Math.round(signal.power.mean)} W; zero-power samples included.`);
    if(signal.heartRate.mean!==null)result.findings.push(`Time-weighted recorded HR: ${Math.round(signal.heartRate.mean)} bpm.`);
    if(signal.drift.eligible)result.findings.push(`Steady-effort power/HR ratio change: ${signal.drift.percent.toFixed(1)}%. Context is required; no fitness pass/fail threshold is applied.`);
    result.limitations.push(...signal.quality);
    const cycling=activity.discipline==='cycling'||['Ride','VirtualRide','MountainBikeRide','GravelRide','EBikeRide','EMountainBikeRide','Handcycle','Velomobile'].includes(activity.sport);
    if(cycling&&measured&&threshold&&number(threshold.watts,1,1500)!==null){result.aboveFtpSeconds=signal.power.histogram.filter(([w])=>w>threshold.watts).reduce((s,[,t])=>s+t,0);result.ftpReference={watts:threshold.watts,date:threshold.date,method:threshold.method};result.findings.push(`${Math.round(result.aboveFtpSeconds/60)} min above the supplied ${threshold.watts} W FTP reference. Histogram is rounded to 1 W; this does not establish historical FTP.`);}
  }else result.limitations.push(activity.enrichment?.error||'Detailed signal collection is pending or unavailable. Summary averages cannot describe interval execution.');
  return result;
}
export function overallSignals(activities, observedOn, threshold=null) {
  const window=calendarWindow(observedOn),riders=activities.filter(a=>a.discipline==='cycling'&&a.date>=window.start&&a.date<=observedOn);
  const measured=riders.filter(a=>a.sensors?.power?.source==='device'),hr=riders.filter(a=>a.sensors?.heartRate?.recorded||a.signals?.heartRate?.seconds),withStreams=riders.filter(a=>a.signals);
  const best=SENSOR_POLICY.powerDurations.map(seconds=>{const candidates=measured.flatMap(a=>{const b=a.signals?.power?.best.find(b=>b.seconds===seconds);return b?.watts!=null?[{watts:b.watts,id:a.id,date:a.date}]:[];}).sort((a,b)=>b.watts-a.watts);return {seconds,...(candidates[0]||{watts:null,id:null,date:null})};});
  const thresholdFresh=threshold&&threshold.date>=new Date(Date.parse(observedOn+'T12:00:00Z')-90*86400000).toISOString().slice(0,10);
  const recent=riders.filter(a=>a.date>=new Date(Date.parse(observedOn+'T12:00:00Z')-27*86400000).toISOString().slice(0,10));
  const aboveFtpSeconds=thresholdFresh?recent.reduce((s,a)=>s+(evaluateActivity(a,threshold).aboveFtpSeconds||0),0):null;
  const months=new Map();for(const a of riders){const key=a.date.slice(0,7);const m=months.get(key)||{month:key,rides:0,minutes:0,workKj:0,measuredWorkRides:0};m.rides++;m.minutes+=a.minutes;if(a.sensors?.power?.source==='device'&&a.signals?.workKj!=null){m.workKj+=a.signals.workKj;m.measuredWorkRides++;}months.set(key,m);}
  const periods=[{label:'Last 28 days',start:new Date(Date.parse(observedOn+'T12:00:00Z')-27*86400000).toISOString().slice(0,10),end:observedOn},{label:'Previous 28 days',start:new Date(Date.parse(observedOn+'T12:00:00Z')-55*86400000).toISOString().slice(0,10),end:new Date(Date.parse(observedOn+'T12:00:00Z')-28*86400000).toISOString().slice(0,10)}].map(p=>{const rows=measured.filter(a=>a.date>=p.start&&a.date<=p.end&&a.signals);return {...p,recordings:rows.length,best20MinuteWatts:Math.max(0,...rows.map(a=>a.signals.power.best.find(b=>b.seconds===1200)?.watts||0))||null};});
  return {window,cyclingRecords:riders.length,measuredPowerRecords:measured.length,heartRateRecords:hr.length,streamRecords:withStreams.length,estimatedPowerRecords:riders.filter(a=>a.sensors?.power?.source==='estimated').length,best,months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),periods,aboveFtpSeconds,thresholdFresh:Boolean(thresholdFresh),steadyComparisons:withStreams.filter(a=>a.signals.drift.eligible).map(a=>({id:a.id,date:a.date,trainer:a.sensors.trainer,temperatureC:a.sensors.temperatureC,percent:a.signals.drift.percent})),note:'Observed best efforts depend on the rides attempted and recording coverage. They are not FTP or VO2max estimates, and changes are not proof of physiological improvement.'};
}
