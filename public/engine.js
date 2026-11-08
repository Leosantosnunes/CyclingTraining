import { calendarWindow, overallSignals, evaluateActivity } from './sensors.js';
/** Deterministic prototype policy. These are conservative product limits, not validated sports science. */
export const POLICY = Object.freeze({ version: 'coach-2.1', sparseMinutes: 90, historyWeeks: 4, regularWeeks: 3, confidenceRides: 6, requestedIncreaseLimit: 0.05, maxSession: 240, minSession: 15, recoveryFactor: 0.6, breakDays: 21, breakFactor: 0.5, staleThresholdDays: 90, taperDays: 7, taperFactor: 0.6 });
// Evidence informs the approach; these exact constraints are reviewable product choices.
export const COACH_POLICY = Object.freeze({ version:'coach-2.1', maxQuality:2, qualitySpacingDays:2, minQualityMinutes:60, recoveryMinutes:45, minCoverage:.8, demandingMinutes:10, demandingRpe:7, highReference:1.05, maxWorkFraction:.1, checkInAgeDays:7 });
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function localDate(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k).value).join('-');
}
export function addDays(date, n) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function weekday(date) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
export function validDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && addDays(v, 0) === v; }
export function defaultProfile() {
  return { name: '', goal: 'consistency', experience: 'returning', weeklyMinutes: 180, longestMinutes: 60, timezone: 'America/Toronto', units: 'metric', preference: 'either', equipment: ['bicycle'], availability: [90, 0, 45, 0, 45, 0, 90], eventDate: '', eventDistanceKm: null, eventTerrain: 'mixed', eventDurationMinutes: null, threshold: null, recovery: 'normal', recoveryWeekEnd: '2026-11-08', limitation: 'none', otherExerciseDays: [], retentionDays: 90 };
}
const goals = ['consistency', 'fitness', 'endurance', 'event', 'climbing', 'racing'];
export function validateProfile(p, today) {
  if (!p || typeof p.name !== 'string' || p.name.length > 60 || !goals.includes(p.goal) || !['new', 'returning', 'consistent'].includes(p.experience)) throw Error('Check your name, goal, and experience.');
  try { new Intl.DateTimeFormat('en', { timeZone: p.timezone }).format(); } catch { throw Error('Choose a valid IANA timezone, such as America/Toronto.'); }
  if (!Array.isArray(p.availability) || p.availability.length !== 7 || p.availability.some(x => !Number.isInteger(x) || x < 0 || x > 360)) throw Error('Daily availability must be 0–360 whole minutes.');
  if (![p.weeklyMinutes, p.longestMinutes].every(x => Number.isInteger(x) && x >= 0 && x <= 2400)) throw Error('Recent riding time must be 0–2400 whole minutes.');
  if (p.goal === 'event' && (!validDate(p.eventDate) || p.eventDate < today)) throw Error('Choose an event date today or in the future.');
  if (!['metric', 'imperial'].includes(p.units) || !['normal', 'poor'].includes(p.recovery) || !['none', 'restricted', 'acute'].includes(p.limitation) || !['inside', 'outside', 'either'].includes(p.preference)) throw Error('Check your preferences and recovery options.');
  if (!Array.isArray(p.equipment) || p.equipment.some(e => !['bicycle', 'trainer', 'power', 'hr', 'cadence'].includes(e))) throw Error('Invalid equipment.');
  if (!Array.isArray(p.otherExerciseDays) || p.otherExerciseDays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw Error('Invalid exercise days.');
  for (const key of ['eventDistanceKm', 'eventDurationMinutes']) if (p[key] !== null && (!Number.isFinite(p[key]) || p[key] <= 0 || p[key] > 10000)) throw Error('Event distance and duration must be positive, or left blank.');
  if (![30, 90, 365].includes(p.retentionDays)) throw Error('Invalid retention period.');
  if (p.recoveryWeekEnd && (!validDate(p.recoveryWeekEnd) || weekday(p.recoveryWeekEnd) !== 0)) throw Error('Recovery week must end on a valid Sunday.');
  if (p.weeklyTargetMinutes != null && (!Number.isInteger(p.weeklyTargetMinutes) || p.weeklyTargetMinutes < 0 || p.weeklyTargetMinutes > 2400)) throw Error('Weekly cycling target must be 0–2400 whole minutes, or blank.');
  if (p.threshold !== null && (!p.threshold || !Number.isFinite(p.threshold.watts) || p.threshold.watts <= 0 || p.threshold.watts > 1500 || !validDate(p.threshold.date) || p.threshold.date > today || !['test', 'estimate'].includes(p.threshold.method))) throw Error('Check the optional FTP value, method, and measurement date.');
  if(p.coach){const c=p.coach;if(typeof c.confirmed!=='boolean'||!['endurance','sustained','climbing','race','fitness'].includes(c.focus)||typeof c.goalDetail!=='string'||c.goalDetail.length>500||!['unknown','none','one','two'].includes(c.intervalExperience)||!validDate(c.checkInDate)||c.checkInDate>today||!validDate(c.cycleStart)||weekday(c.cycleStart)!==1||[c.fatigue,c.sleep,c.soreness,c.motivation].some(v=>!Number.isInteger(v)||v<1||v>5))throw Error('Check the coach goal, Monday cycle start, dated readiness check-in, and 1–5 ratings.');}
  if(p.bodyMassKg!=null&&(!Number.isFinite(p.bodyMassKg)||p.bodyMassKg<20||p.bodyMassKg>300))throw Error('Check optional body mass in kg.');
  if(p.maxHeartRate!=null&&(!Number.isFinite(p.maxHeartRate)||p.maxHeartRate<50||p.maxHeartRate>260))throw Error('Check optional estimated maximum heart rate.');
  if(p.coach?.strengthDays&&(!Array.isArray(p.coach.strengthDays)||p.coach.strengthDays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(p.coach.strengthDays).size!==p.coach.strengthDays.length))throw Error('Check strength training days.');
  if(p.strength)validateStrengthSettings(p.strength);
  return p;
}
export function validateActivity(a) {
  if (!a || typeof a.id !== 'string' || !a.id || a.id.length > 100 || !validDate(a.date) || typeof a.title !== 'string' || !a.title.trim() || a.title.length > 100 || !['manual', 'synthetic', 'strava'].includes(a.source) || !['cycling', 'other'].includes(a.discipline) || !Number.isFinite(a.minutes) || a.minutes < 0 || (a.minutes === 0 && a.source !== 'strava') || a.minutes > 1440 || (a.distanceKm !== null && (!Number.isFinite(a.distanceKm) || a.distanceKm < 0 || a.distanceKm > 2000)) || (a.rpe !== null && (!Number.isInteger(a.rpe) || a.rpe < 1 || a.rpe > 10))) throw Error('Check the ride date, duration, distance, and effort (1–10).');
  return a;
}
export function syntheticActivities(today) {
  return [ [2, 45, 18, 'Easy spin', 3], [4, 55, 24, 'Steady roads', 4], [7, 80, 34, 'Weekend endurance', 4], [10, 40, 16, 'Recovery spin', 2], [12, 50, 21, 'Midweek ride', 4], [14, 75, 31, 'Long way home', 4], [17, 45, 18, 'Easy roads', 3], [20, 65, 27, 'Weekend loop', 4], [23, 40, 15, 'Gentle spin', 2], [26, 60, 25, 'Steady ride', 4] ].map(([days, minutes, distanceKm, title, rpe], i) => ({ id: `synthetic-${i}`, date: addDays(today, -days), title, minutes, distanceKm, rpe, discipline: 'cycling', source: 'synthetic', recordedAt: new Date().toISOString() }));
}
export function analyze(activities, today) {
  const recent = activities.filter(a => a.date <= today && a.date > addDays(today, -28));
  const rides = recent.filter(a => a.discipline === 'cycling' && a.minutes > 0);
  const weekly = [3, 2, 1, 0].map(i => { const end = addDays(today, -i * 7); return { start: addDays(end, -6), end, minutes: rides.filter(a => a.date >= addDays(end, -6) && a.date <= end).reduce((s, a) => s + a.minutes, 0) }; });
  const minutes = rides.reduce((s, a) => s + a.minutes, 0);
  return { rides, weekly, minutes, weeklyAverage: Math.floor(minutes / 4), longest: Math.max(0, ...rides.map(a => a.minutes)), otherMinutes: recent.filter(a => a.discipline === 'other').reduce((s, a) => s + a.minutes, 0), latestDate: rides.map(a => a.date).sort().at(-1) || null, sources: [...new Set(rides.map(a => a.source))], evidenceIds: rides.map(a => a.id) };
}
function steps(minutes) {
  if (!minutes) return [];
  return [{ title: 'Warm up gently', minutes: 5, repetitions: 1, target: 2, unit: 'RPE / 10', guidance: 'Start comfortably; gradually settle into your rhythm.' }, { title: 'Conversational endurance', minutes: minutes - 10, repetitions: 1, target: 3, unit: 'RPE / 10', guidance: 'You should be able to speak in full sentences. Ease off whenever needed.' }, { title: 'Cool down', minutes: 5, repetitions: 1, target: 1, unit: 'RPE / 10', guidance: 'Finish with very easy pedalling.' }];
}
export function validateWorkout(w) {
  if (!w || typeof w.id !== 'string' || typeof w.title !== 'string' || typeof w.purpose !== 'string' || typeof w.alternative !== 'string' || !validDate(w.date) || !Number.isInteger(w.minutes) || w.minutes < 0 || w.minutes > 1440 || !Array.isArray(w.steps) || !Array.isArray(w.equipment) || !['planned', 'completed', 'partial', 'skipped', 'modified'].includes(w.status) || typeof w.locked !== 'boolean') throw Error('Invalid workout.');
  try { new Intl.DateTimeFormat('en', { timeZone: w.timezone }).format(); } catch { throw Error('Invalid workout timezone.'); }
  if (w.steps.some(s => !Number.isInteger(s.minutes) || s.minutes <= 0 || !Number.isInteger(s.repetitions) || s.repetitions < 1 || !['RPE / 10','W'].includes(s.unit) || !Number.isFinite(s.target) || (s.unit==='RPE / 10'?(s.target<1||s.target>10):(!Number.isInteger(s.target)||s.target<1||s.target>3000||!s.powerTarget||s.target!==s.powerTarget.targetWatts||!['easy','work'].includes(s.intensity)))) || w.steps.reduce((s, v) => s + v.minutes * v.repetitions, 0) !== w.minutes) throw Error('Workout steps do not match the prescribed duration or target units.');
  if(w.targetMethod==='FTP-watts-coach-2.1'&&w.steps.some(s=>s.unit!=='W'))throw Error('Watt-based prescriptions require watts for every step.');
  for(const s of w.steps)if(s.powerTarget){const t=s.powerTarget;if(t.unit!=='W'||t.method!=='FTP-reference-coach-2.0'||![t.minWatts,t.maxWatts,t.thresholdWatts,t.minPercent,t.maxPercent].every(Number.isFinite)||t.minWatts<0||t.minWatts>t.maxWatts||t.minPercent<0||t.minPercent>t.maxPercent||t.maxPercent>200||!validDate(t.thresholdDate)||t.thresholdWatts<=0||!w.thresholdVersion||!['FTP-reference-with-RPE-coach-2.0','FTP-watts-coach-2.1'].includes(w.targetMethod)||t.minWatts!==Math.round(t.thresholdWatts*t.minPercent/100)||t.maxWatts!==Math.round(t.thresholdWatts*t.maxPercent/100)||(s.unit==='W'&&(t.targetWatts!==Math.round((t.minWatts+t.maxWatts)/2)||t.targetWatts<t.minWatts||t.targetWatts>t.maxWatts)))throw Error('Invalid power target or threshold snapshot.');}
  if (w.feedback && (!Number.isFinite(w.feedback.actualMinutes) || w.feedback.actualMinutes < 0 || w.feedback.actualMinutes > 1440 || !['comfortable', 'hard', 'poor'].includes(w.feedback.feeling))) throw Error('Invalid workout feedback.');
  return w;
}
export const isQualityStep=s=>s.unit==='W'?s.intensity==='work':s.target>=5;
export const isQualityWorkout=w=>w.steps.some(isQualityStep);
export function deviceWorkout(w){
  validateWorkout(w);
  if(!w.minutes||w.steps.some(s=>s.unit!=='W'))throw Error('A complete watt-based workout and FTP reference are required.');
  const threshold=w.steps[0].powerTarget.thresholdWatts;
  if(w.steps.some(s=>s.powerTarget.thresholdWatts!==threshold||s.powerTarget.thresholdDate!==w.steps[0].powerTarget.thresholdDate))throw Error('Workout steps must use the same preserved FTP reference.');
  let elapsed=0;
  const rows=w.steps.flatMap(s=>Array.from({length:s.repetitions},()=>{const seconds=s.minutes*60,row={step:0,title:s.title,seconds,startSeconds:elapsed,endSeconds:elapsed+seconds,watts:s.target,minWatts:s.powerTarget.minWatts,maxWatts:s.powerTarget.maxWatts,ftpPercent:s.target/threshold*100};elapsed+=seconds;return row;})).map((r,i)=>({...r,step:i+1}));
  return {title:w.title,date:w.date,timezone:w.timezone,ftpWatts:threshold,thresholdDate:w.steps[0].powerTarget.thresholdDate,totalSeconds:elapsed,rows};
}
const xmlEscape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function workoutZwo(w){
  const d=deviceWorkout(w);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>Cadence</author>\n  <name>${xmlEscape(d.date+' '+d.title)}</name>\n  <description>${xmlEscape(`FTP assumption ${d.ftpWatts} W dated ${d.thresholdDate}. Set Zwift FTP to ${d.ftpWatts} W and workout intensity to 100%. Total ${d.totalSeconds/60} minutes. Targets are percentages; changing app FTP rescales watts.`)}</description>\n  <sportType>bike</sportType>\n  <workout>\n${d.rows.map(r=>`    <SteadyState Duration="${r.seconds}" Power="${(r.watts/d.ftpWatts).toFixed(8)}"/>`).join('\n')}\n  </workout>\n</workout_file>\n`;
}
export function workoutSetupText(w){
  const d=deviceWorkout(w),clock=n=>`${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  return [`${d.date} — ${d.title}`,`FTP assumption: ${d.ftpWatts} W (${d.thresholdDate}); timezone: ${d.timezone}`,`Total: ${clock(d.totalSeconds)}`,'Computer: Cycling workout; each step duration = Time; target = Custom Power (watts); automatic step advance by time.','Trainer: use the fixed watt setpoint below. Outdoors: use the custom watt range. No open-ended steps or hidden repeats.',...d.rows.map(r=>`${r.step}. ${r.title}: ${clock(r.seconds)} at ${r.watts} W (${r.ftpPercent.toFixed(1)}% FTP); outdoor range ${r.minWatts}–${r.maxWatts} W; elapsed ${clock(r.startSeconds)}–${clock(r.endSeconds)}.`),'Zwift: set FTP to the stored assumption and workout intensity to 100% before importing the .zwo file.','These files contain only the workout prescription and its FTP reference, without activity history, locations, or evidence IDs.'].join('\n');
}
export const STRENGTH_POLICY=Object.freeze({version:'strength-1.0',days:[4,0],separationHours:3,loadRule:'Choose a load that leaves at least 3 clean repetitions available. Do not test your maximum or take a set to failure. FTP does not determine lifting weight.'});
export function defaultStrengthSettings(){return {confirmed:false,equipment:'bodyweight',experience:'unknown',thursdayMinutes:45,sundayMinutes:30,restrictions:'unknown',loadNotes:''};}
export function validateStrengthSettings(c){if(!c||typeof c.confirmed!=='boolean'||!['gym','dumbbells','bodyweight'].includes(c.equipment)||!['unknown','new','regular'].includes(c.experience)||!['unknown','none','restricted'].includes(c.restrictions)||![c.thursdayMinutes,c.sundayMinutes].every(n=>Number.isInteger(n)&&n>=15&&n<=90)||(c.loadNotes!=null&&(typeof c.loadNotes!=='string'||c.loadNotes.length>1000)))throw Error('Check strength equipment, experience, restrictions, and 15–90 minute availability.');return c;}
const strengthExercise=(id,title,sets,reps,restSeconds,minutes,cues,alternative)=>({id,title,sets,reps,restSeconds,minutes,tempo:'Lower under control for about 2 seconds; rise smoothly. Stop the set before technique or speed deteriorates.',load:STRENGTH_POLICY.loadRule,cues,alternative});
export function strengthProposal(profile,startDate,records=[],previous=null,observedOn=localDate(profile.timezone)){
  const c=validateStrengthSettings(profile.strength||defaultStrengthSettings());if(!validDate(startDate)||weekday(startDate)!==1)throw Error('Strength week must start on a Monday.');
  const poor=profile.recovery==='poor'||profile.coach&&(profile.coach.fatigue>=4||profile.coach.soreness>=4||profile.coach.sleep<=2)||records.some(r=>r.date>=addDays(startDate,-7)&&r.date<startDate&&(r.soreness>=4||r.pain));
  const paused=profile.limitation!=='none'||c.restrictions==='restricted',ready=c.confirmed&&c.experience!=='unknown'&&c.restrictions==='none'&&!paused;
  const gym=c.equipment==='gym',weighted=c.equipment!=='bodyweight';
  const sessions=STRENGTH_POLICY.days.map((day,index)=>{
    const date=addDays(startDate,index===0?3:6),budget=index===0?c.thursdayMinutes:c.sundayMinutes;
    const previousSession=previous?.sessions.find(s=>s.date===date);
    if(previousSession&&(previousSession.date<observedOn||records.some(r=>r.sessionId===previousSession.id)))return structuredClone(previousSession);
    const main=index===0?[
      strengthExercise('squat',gym?'Goblet squat or familiar leg press':weighted?'Goblet squat':'Squat to a stable chair',2,'8 repetitions',120,8,['Feet about shoulder-width; keep the whole foot planted.','Sit down between your hips; let knees track in the direction of your toes.','Use a comfortable depth without rounding or forcing range.'],'Use an unloaded sit-to-stand from a higher chair.'),
      strengthExercise('hinge',weighted?'Dumbbell Romanian deadlift':'Hip hinge to wall',2,'8 repetitions',120,7,['Soften knees, brace your trunk, and move hips backward.','Keep any weights close to your legs; keep your back in its natural position.','Stop the descent when hamstrings limit your range; stand by driving hips forward.'],'Unloaded glute bridge: 2 × 10; do not arch your lower back.'),
      strengthExercise('row',gym?'Seated cable row':weighted?'Supported one-arm dumbbell row':'Prone W shoulder raise',2,weighted?'8 repetitions each side':'8 controlled repetitions',60,5,['Keep shoulders away from ears and ribs still.','Pull toward the lower ribs without twisting; lower slowly.','For prone W raises, use no load and lift only through a comfortable shoulder range.'],'Use an unloaded shoulder-blade squeeze; this is a lighter substitute, not equivalent pulling load.'),
      strengthExercise('calf',weighted?'Standing calf raise holding light dumbbells':'Supported standing calf raise',2,'10 repetitions',60,4,['Use a stable hand support.','Rise through the forefoot without rolling ankles; pause briefly and lower fully.','Keep the knee comfortable and the movement controlled.'],'Use both legs with bodyweight and a smaller pain-free range.'),
      strengthExercise('core','Dead bug',2,'6 repetitions each side',45,4,['Lie on your back with hips and knees bent; keep ribs down.','Slowly extend one arm and the opposite leg without arching the back.','Use a shorter lever if your back lifts.'],'Move one leg at a time while keeping both arms still.')
    ]:[
      strengthExercise('single-leg',weighted?'Supported split squat, light dumbbells':'Supported split squat',2,'6 repetitions each side',90,7,['Hold a stable support; place feet on separate rails rather than one line.','Lower vertically through a comfortable range with the front foot planted.','Push through the front foot; keep pelvis level and avoid wobbling.'],'Use an unloaded sit-to-stand instead; omit if Saturday left your legs unusually heavy.'),
      strengthExercise('bridge','Glute bridge',2,'10 repetitions',60,5,['Lie with knees bent and feet flat.','Brace gently and lift hips without arching your back.','Pause briefly, then lower under control.'],'Use a smaller comfortable range with no added load.'),
      strengthExercise('side-core','Side plank from knees',2,'20 seconds each side',45,4,['Place the elbow under the shoulder and bend your knees.','Lift hips so shoulders, hips, and knees form a line.','Keep breathing; stop if shoulder or back discomfort appears.'],'Use a standing side hold against a wall for 20 seconds each side.')
    ];
    if(gym&&c.experience==='regular'){
      if(index===0)main.splice(0,main.length,
        strengthExercise('squat','Familiar squat variation',3,'5 repetitions',180,12,['Use the squat variation and setup you already practise; set rack safety stops if using a bar.','Brace before each repetition, keep the whole foot planted and knees tracking with toes.','Use only a depth and load you control; no grinding repetitions. Start below the heaviest load you reported.'],'Goblet squat or familiar leg press: 2 × 8 with a light load.'),
        strengthExercise('stepup','Controlled step-up',2,'5 repetitions each leg',120,9,['Choose a stable step low enough to keep your pelvis level.','Place the whole front foot on the step; stand using that leg without jumping off the rear foot.','Lower slowly; use a hand support when needed. Keep dumbbells light enough to avoid swaying.'],'Lower step or supported unloaded sit-to-stand: 2 × 6.'),
        strengthExercise('calf','Standing calf raise',2,'8 repetitions',90,5,['Use a familiar machine or stable hand support.','Rise evenly through the forefoot; pause and lower without bouncing.','Use a controlled pain-free range and keep ankles from rolling outward.'],'Bodyweight calf raise: 2 × 10 with support.'),
        strengthExercise('core','Dead bug',2,'6 repetitions each side',45,5,['Keep ribs down and pelvis steady.','Extend opposite arm and leg slowly without arching the lower back.','Shorten the movement if control is lost.'],'Move only one leg at a time.')
      );else main.splice(0,main.length,
        strengthExercise('single-leg','Supported Bulgarian split squat / familiar Smith setup',2,'5 repetitions each leg',120,10,['Use your familiar setup with a low rear-foot support and safeties where available.','Keep the front foot planted and lower vertically; stop before the pelvis rotates or balance deteriorates.','Use less load than your usual main session; Saturday fatigue is a reason to use the easier version.'],'Supported split squat with rear foot on the floor: 1–2 × 6 each leg.'),
        strengthExercise('bridge','Glute bridge',2,'10 repetitions',60,6,['Keep feet flat and ribs down.','Lift hips without extending through the lower back.','Pause briefly, then lower smoothly; start with bodyweight.'],'Use a smaller comfortable range or omit if it causes discomfort.'),
        strengthExercise('row','Seated cable row',2,'8 repetitions',90,6,['Keep trunk still and shoulders down.','Pull the handle toward lower ribs; do not lean backward to move the weight.','Return slowly through a comfortable range.'],'Very light supported dumbbell row: 2 × 8 each side.'),
        strengthExercise('side-core','Side plank from knees',2,'20 seconds each side',45,5,['Place elbow under shoulder and keep knees bent.','Lift hips into a straight shoulder–hip–knee line without rotating.','Keep breathing; stop for shoulder or back pain.'],'Standing side hold against a wall: 2 × 20 seconds each side.')
      );
    }
    const selected=[];let used=10;for(const exercise of main){if(used+exercise.minutes<=budget){selected.push({...exercise,sets:poor?1:exercise.sets});used+=exercise.minutes;}}
    const blocked=paused||selected.length===0;
    return {id:`strength-${date}`,date,timezone:profile.timezone,version:STRENGTH_POLICY.version,title:index===0?'Thursday · Strength A':'Sunday · Strength B',purpose:index===0?'Practise familiar lower-body patterns and trunk control with repeatable loading.':'Use a smaller unilateral and trunk dose after Saturday’s long ride.',equipment:c.equipment,minutes:blocked?0:used,availableMinutes:budget,ready:ready&&!blocked,paused:blocked,reduced:Boolean(poor),loadNotes:c.loadNotes||'',warmup:{minutes:8,instructions:'2 minutes of comfortable walking or easy pedalling, then 5 unloaded sit-to-stands, 5 hip hinges and 5 calf raises. For the first loaded exercise, take 2 light rehearsal sets of 5 with 60 seconds rest; use one light rehearsal set before another unfamiliar movement. Do not rush.'},cooldown:{minutes:2,instructions:'Walk slowly and settle breathing. Note any unusual pain or fatigue.'},exercises:blocked?[]:selected,coordination:'These are additional gym minutes, separate from cycling availability. Keep the same-day ride easy. Where practical, separate riding and lifting by at least 3 hours; do the priority session first. Sunday is deliberately lighter after the long Saturday ride.',progression:'Repeat this introductory prescription first. If every set is controlled with at least 3 clean repetitions remaining and normal next-day recovery, propose the smallest available weight increase next week; change only one variable. No automatic load increase.',easier:'Use one set per exercise with bodyweight or light load; omit a movement that is uncomfortable. Rest instead when recovery is poor.'};
  });
  return {id:`strength-week-${startDate}`,startDate,version:STRENGTH_POLICY.version,sessions,canAccept:ready&&sessions.every(s=>s.ready||records.some(r=>r.sessionId===s.id)),reasons:[!c.confirmed?'Draft: equipment, experience, restrictions, and separate gym time need confirmation.':'Strength intake confirmed.',poor?'Reduced sets because current recovery or recent strength feedback calls for less work.':'First-cycle sets are intentionally introductory; no assumed lifting kilograms.',paused?'Automatic strength work is paused for the reported restriction.':'Stop an exercise for sharp, joint, radiating, or increasing pain; do not train through it.']};
}
export function validateStrengthRoom(room){
  if(!room||!Array.isArray(room.plans)||room.plans.length>52||!Array.isArray(room.records)||room.records.length>500)throw Error('Invalid strength history.');
  for(const p of room.plans){if(!validDate(p.startDate)||!Array.isArray(p.sessions)||p.sessions.length!==2||!Number.isInteger(p.revision)||p.revision<0)throw Error('Invalid strength prescription.');for(const s of p.sessions){if(!s.id||!validDate(s.date)||![4,0].includes(weekday(s.date))||!Array.isArray(s.exercises)||!Number.isInteger(s.minutes)||s.minutes<0||s.minutes>s.availableMinutes||s.exercises.some(e=>!Number.isInteger(e.sets)||e.sets<1||e.sets>4||!Number.isInteger(e.minutes)||e.minutes<1)||s.minutes&&s.warmup.minutes+s.cooldown.minutes+s.exercises.reduce((n,e)=>n+e.minutes,0)!==s.minutes)throw Error('Invalid strength session arithmetic.');}}
  for(const r of room.records)if(!r.sessionId||!validDate(r.date)||!['completed','partial','modified','skipped'].includes(r.status)||!Number.isInteger(r.actualMinutes)||r.actualMinutes<0||r.actualMinutes>180||!Number.isInteger(r.soreness)||r.soreness<1||r.soreness>5||typeof r.pain!=='boolean'||typeof r.notes!=='string'||r.notes.length>1000)throw Error('Invalid strength feedback.');
  if(new Set(room.records.map(r=>r.sessionId)).size!==room.records.length)throw Error('Duplicate strength feedback.');return room;
}
export function undoStrengthWeek(room,startDate,observedOn){
  validateStrengthRoom(room);const versions=room.plans.filter(p=>p.startDate===startDate),latest=versions.at(-1),prior=versions.at(-2);if(!latest)throw Error('No accepted strength week to undo.');
  const restored=structuredClone(latest);restored.revision++;restored.reason='Undo future strength change';
  restored.sessions=latest.sessions.map(s=>{if(s.date<observedOn||room.records.some(r=>r.sessionId===s.id))return structuredClone(s);const old=prior?.sessions.find(p=>p.id===s.id);return old?structuredClone(old):{...structuredClone(s),minutes:0,exercises:[],paused:true,ready:false,title:s.title+' · cancelled'};});
  if(JSON.stringify(restored.sessions)===JSON.stringify(latest.sessions))return false;room.plans.push(restored);room.plans=room.plans.slice(-52);return true;
}
export function coachAssessment(profile, activities, today, baselineEnd=today, previous=null, startDate=today) {
  const window=calendarWindow(today), rows=activities.filter(a=>a.date>=window.start&&a.date<=today);
  const recent=rows.filter(a=>a.discipline==='cycling'&&a.minutes>0&&a.date>addDays(baselineEnd,-28)&&a.date<=baselineEnd);
  const fresh=Boolean(profile.threshold&&profile.threshold.date<=today&&profile.threshold.date>=addDays(today,-POLICY.staleThresholdDays));
  const classified=recent.map(a=>{
    const g=a.signals, measured=a.sensors?.power?.source==='device', seconds=g?.power?.seconds||0;
    const powerCovered=Boolean(fresh&&measured&&seconds>=a.minutes*60*COACH_POLICY.minCoverage);
    const above=powerCovered?g.power.histogram.filter(([w])=>w>profile.threshold.watts*COACH_POLICY.highReference).reduce((s,[,t])=>s+t,0)/60:null;
    return {id:a.id,date:a.date,minutes:a.minutes,covered:powerCovered||a.rpe!==null,aboveReferenceMinutes:above,demanding:(a.rpe!==null&&a.rpe>=COACH_POLICY.demandingRpe)||(above!==null&&above>=COACH_POLICY.demandingMinutes)};
  });
  const covered=classified.filter(a=>a.covered).reduce((s,a)=>s+a.minutes,0), total=recent.reduce((s,a)=>s+a.minutes,0);
  const coverage=total?Math.min(1,covered/total):0, demanding=classified.filter(a=>a.demanding), demandingDays=new Set(demanding.map(a=>a.date));
  const c=profile.coach, reasons=[];
  if(c?.strengthDays?.length)reasons.push(`Strength training on ${c.strengthDays.map(d=>DAYS[d]).join(' and ')}: keep cycling easy around these days. Established gym work is not counted twice against the usual riding baseline; changed gym load still requires review.`);
  const feedbackPoor=previous?.workouts.some(w=>w.date>=addDays(today,-6)&&w.date<=today&&w.feedback?.feeling==='poor');
  const dated=Boolean(c&&c.checkInDate<=today&&c.checkInDate>=addDays(today,-COACH_POLICY.checkInAgeDays));
  const ready=Boolean(c?.confirmed&&dated&&c.fatigue<=2&&c.soreness<=2&&c.sleep>=3&&c.motivation>=3&&profile.recovery==='normal'&&profile.limitation==='none'&&!feedbackPoor);
  const baseline=analyze(rows,baselineEnd), established=profile.experience==='consistent'&&baseline.rides.length>=POLICY.confidenceRides&&baseline.weekly.filter(w=>w.minutes>0).length>=POLICY.regularWeeks;
  const breakPresent=!baseline.latestDate||!analyze(rows,today).latestDate||analyze(rows,today).latestDate<addDays(today,-POLICY.breakDays);
  const cycleWeek=c?Math.max(1,Math.floor((Date.parse(startDate)-Date.parse(c.cycleStart))/(7*86400000))+1):1;
  const reviewWeek=Boolean(c&&cycleWeek===4), cycleExpired=Boolean(c&&cycleWeek>4);
  const eventSoon=profile.goal==='event'&&profile.eventDate<=addDays(startDate,POLICY.taperDays);
  let quality=ready&&established&&!breakPresent&&!reviewWeek&&!cycleExpired&&!eventSoon&&['one','two'].includes(c.intervalExperience)?1:0;
  if(quality&&coverage>=COACH_POLICY.minCoverage&&demandingDays.size>=8&&c.intervalExperience==='two')quality=2;
  if(!c?.confirmed)reasons.push('Coach intake is incomplete: confirm your goal, available days, interval experience, and current recovery before purposeful intervals are proposed.');
  else if(!dated)reasons.push('Readiness check-in is older than seven days. Update it before adding purposeful intervals.');
  else if(!ready)reasons.push('Readiness ratings, recovery feedback, or training restrictions do not support demanding work; this proposal uses easy riding or rest.');
  if(c?.intervalExperience==='none')reasons.push('No regular interval experience reported: establish consistency before adding demanding sessions.');
  if(coverage<COACH_POLICY.minCoverage)reasons.push('Recent intensity coverage is incomplete. The coach treats unclassified time as unknown and allows at most one introductory quality session after a confirmed check-in.');
  if(reviewWeek)reasons.push('Cycle week 4 is a provisional recovery/review week with reduced volume and no demanding sessions; this is an editable planning convention, not a biological deadline.');
  if(cycleExpired)reasons.push('The four-week cycle outline has ended. Review progress and start a new cycle before further intensity progression.');
  if(eventSoon)reasons.push('An imminent event takes priority over introducing new interval work.');
  return {version:COACH_POLICY.version,window,baselineEnd,ready,established,coverage,classified,demandingDays:demandingDays.size,qualityLimit:quality,freshThreshold:fresh,feedbackPoor:Boolean(feedbackPoor),reviewWeek,cycleWeek,reasons,signals:overallSignals(rows,today,profile.threshold),otherExercise:rows.filter(a=>a.discipline==='other'&&a.date>addDays(today,-28))};
}
function coachStep(title,minutes,target,guidance,range=null,threshold=null){
  return {title,minutes,repetitions:1,target,unit:'RPE / 10',guidance,...(range&&threshold?{powerTarget:{minWatts:Math.round(threshold.watts*range[0]),maxWatts:Math.round(threshold.watts*range[1]),minPercent:range[0]*100,maxPercent:range[1]*100,unit:'W',method:'FTP-reference-coach-2.0',thresholdWatts:threshold.watts,thresholdDate:threshold.date}}:{})};
}
function prescribeCoach(workouts,profile,assessment,today) {
  const mutable=workouts.filter(w=>w.status==='planned'&&!w.locked&&w.minutes>0);
  const threshold=assessment.freshThreshold&&profile.equipment.includes('power')?profile.threshold:null;
  const protectedDemanding=workouts.filter(w=>w.locked||w.status!=='planned').filter(w=>isQualityWorkout(w));
  const chosen=[...protectedDemanding], quality=[];
  const long=mutable.filter(w=>w.minutes>=90).sort((a,b)=>b.minutes-a.minutes||a.date.localeCompare(b.date))[0];
  const focus=profile.coach?.focus||(['climbing','racing'].includes(profile.goal)?profile.goal==='racing'?'race':'climbing':'endurance');
  // Prefer a short weekday quality session, preserve the long ride, and keep a full easy/rest day between stressors.
  for(const w of mutable.filter(w=>w!==long&&w.minutes>=COACH_POLICY.minQualityMinutes)){
    const separated=chosen.every(q=>Math.abs(Date.parse(q.date)-Date.parse(w.date))>=COACH_POLICY.qualitySpacingDays*86400000);
    const exerciseConflict=[...profile.otherExerciseDays,...(profile.coach?.strengthDays||[])].some(day=>[-1,0,1].some(offset=>weekday(addDays(w.date,offset))===day));
    const longConflict=long&&Math.abs(Date.parse(long.date)-Date.parse(w.date))<COACH_POLICY.qualitySpacingDays*86400000;
    const recentConflict=assessment.classified.some(a=>a.demanding&&a.date<=today&&Math.abs(Date.parse(w.date)-Date.parse(a.date))<COACH_POLICY.qualitySpacingDays*86400000);
    if(chosen.length<assessment.qualityLimit&&separated&&!exerciseConflict&&!longConflict&&!recentConflict){chosen.push(w);quality.push(w);}
  }
  let workMinutes=protectedDemanding.reduce((sum,w)=>sum+w.steps.filter(isQualityStep).reduce((n,s)=>n+s.minutes*s.repetitions,0),0);
  const maxWork=Math.floor(workouts.reduce((n,w)=>n+w.minutes,0)*COACH_POLICY.maxWorkFraction);
  for(const w of mutable){
    let kind=quality.includes(w)?(focus==='endurance'||focus==='fitness'?'tempo':'sustained'):w===long?'long':'endurance';
    if(quality.indexOf(w)===1&&focus==='race')kind='aerobic';
    if(profile.recovery==='poor'||assessment.feedbackPoor||profile.coach&&(profile.coach.fatigue>=4||profile.coach.sleep<=2||profile.coach.soreness>=4))kind='recovery';
    if(!quality.includes(w)&&w!==long&&w.minutes<=60)kind='recovery';
    const intervalMinutes=kind==='aerobic'?3:8, reps=kind==='aerobic'?4:2, dose=intervalMinutes*reps;
    if(['tempo','sustained','aerobic'].includes(kind)&&workMinutes+dose>maxWork)kind='endurance';
    const easy=kind==='recovery'?2:3, range=kind==='recovery'?[.4,.55]:[.55,.7];
    let prescription=[coachStep('Warm up gently',5,2,'Start comfortably; keep breathing relaxed.',[.4,.55],threshold),coachStep(kind==='long'?'Long conversational endurance':kind==='recovery'?'Easy recovery spin':'Conversational endurance',w.minutes-10,easy,kind==='long'?'Stay conversational throughout. Plan food, fluids, and a route with an early return option. Shorten if fatigue changes your posture or effort.':'Use full sentences. The power reference is a ceiling guide; ease off when effort or conditions call for it.',range,threshold),coachStep('Cool down',5,1,'Finish with very easy pedalling.',[.35,.5],threshold)];
    if(['tempo','sustained','aerobic'].includes(kind)){
      const rpe=kind==='tempo'?6:kind==='sustained'?7:8, bounds=kind==='tempo'?[.8,.87]:kind==='sustained'?[.9,.95]:[1.05,1.15];
      prescription=[coachStep('Progressive warm-up',15,2,'Build gradually. If usual easy effort feels unexpectedly difficult, use the easier alternative.',[.45,.65],threshold)];
      for(let i=0;i<reps;i++){prescription.push(coachStep(`${kind==='tempo'?'Controlled tempo':kind==='sustained'?'Sustained controlled effort':'High aerobic effort'} ${i+1}/${reps}`,intervalMinutes,rpe,kind==='aerobic'?'Hard but repeatable; no sprint or all-out finish. Do not chase heart rate during short intervals.':'Even, controlled effort. End the intervals if you cannot maintain the intended effort without straining.',bounds,threshold));if(i<reps-1)prescription.push(coachStep('Easy interval recovery',3,2,'Pedal easily; extend recovery or stop the set if needed.',[.4,.55],threshold));}
      const filler=w.minutes-prescription.reduce((n,s)=>n+s.minutes,0)-10;
      if(filler>0)prescription.push(coachStep('Easy endurance finish',filler,3,'Return to full-sentence effort; no additional hard work.',[.55,.7],threshold));
      prescription.push(coachStep('Cool down',10,1,'Finish very easily.',[.35,.5],threshold));workMinutes+=dose;
    }
    if(threshold)prescription=prescription.map(s=>({...s,intensity:s.target>=5?'work':'easy',target:Math.round((s.powerTarget.minWatts+s.powerTarget.maxWatts)/2),unit:'W',powerTarget:{...s.powerTarget,targetWatts:Math.round((s.powerTarget.minWatts+s.powerTarget.maxWatts)/2)}}));
    Object.assign(w,{kind,title:({tempo:'Controlled tempo · 2 × 8 min',sustained:'Sustained power · 2 × 8 min',aerobic:'High aerobic · 4 × 3 min',long:'Long endurance & durability',recovery:'Recovery spin',endurance:'Aerobic endurance'})[kind],purpose:({tempo:'Practice sustained, controlled work for endurance without turning the whole ride into a race.',sustained:'Build repeatable sustained work for climbing or race demands.',aerobic:'Provide a small repeatable high aerobic stimulus for an experienced rider.',long:'Develop comfort and durability over the duration already supported by your recent history.',recovery:'Keep the ride light enough to prioritize recovery; complete rest is an equally valid option.',endurance:'Accumulate comfortable aerobic riding between the more demanding sessions.'})[kind],steps:prescription,targetMethod:threshold?'FTP-watts-coach-2.1':'RPE-talk-test-v1',thresholdVersion:threshold?(threshold.version||`${threshold.method}-${threshold.date}-${threshold.watts}`):null,explanation:`${assessment.classified.length} rides inform the four-week baseline ending ${assessment.baselineEnd}; ${Math.round(assessment.coverage*100)}% of riding time has intensity classification. ${quality.includes(w)?'Selected within the quality-session limit and spacing constraints.':w===long?'This is the longest allocated ride, within the recorded duration cap.':'This session supports the balance of the week.'} ${assessment.ready?'A dated rider check-in supports considering purposeful work.':'Purposeful intervals await adequate rider readiness and history.'}`});
    if(threshold){w.equipment=[...new Set([...w.equipment,'power'])];w.alternative=`${Math.max(10,Math.floor(w.minutes/2/5)*5)} min at ${Math.round(threshold.watts*.45)} W (45% FTP), or rest. Include an easy start and finish.`;}
  }
  return {qualitySessions:workouts.filter(w=>isQualityWorkout(w)).length,workMinutes,maxWorkMinutes:maxWork};
}
export function propose(profile, activities, today, previous = null, context = {}) {
  validateProfile(profile, today); activities.forEach(validateActivity);
  const startDate = context.startDate || today, baselineEnd = context.baselineEnd || today;
  if (!validDate(startDate) || startDate < today || !validDate(baselineEnd) || baselineEnd > today) throw Error('Invalid proposal dates. History must stop on or before today.');
  const analysis = analyze(activities, baselineEnd), current = analyze(activities, today), reasons = [], conflicts = [];
  const coach=coachAssessment(profile,activities,today,baselineEnd,previous,startDate);
  const available = profile.availability.reduce((s, x) => s + x, 0);
  let budget = Math.min(available, analysis.rides.length >= 3 ? analysis.weeklyAverage : Math.min(profile.weeklyMinutes, POLICY.sparseMinutes));
  const requestedProgression=profile.weeklyTargetMinutes!=null&&analysis.rides.length>=POLICY.confidenceRides&&analysis.weekly.filter(w=>w.minutes>0).length>=POLICY.regularWeeks&&profile.experience!=='new';
  reasons.push(analysis.rides.length >= 3 ? `${analysis.rides.length} ${analysis.sources.includes('synthetic') ? 'synthetic example' : analysis.sources.includes('strava') ? 'Strava' : 'recorded'} rides total ${Math.round(analysis.minutes)} min in 28 days ending ${baselineEnd}: a ${analysis.weeklyAverage} min/week baseline. ${requestedProgression?'A volume increase is considered only because you explicitly requested a target.':'No automatic volume increase.'}` : 'Limited recent ride history: begin with at most 90 minutes per week, further limited by your reported riding and availability.');
  if(requestedProgression){const limit=Math.floor(analysis.weeklyAverage*(1+POLICY.requestedIncreaseLimit));budget=Math.min(available,profile.weeklyTargetMinutes,limit);reasons.push(`You requested ${profile.weeklyTargetMinutes} cycling min/week. This prototype limits requested increases to ${POLICY.requestedIncreaseLimit*100}% above the observed baseline (${limit} min cap), before recovery and availability constraints. This is an unvalidated product safeguard, not a physiological guarantee.`);}
  else if(profile.weeklyTargetMinutes!=null){budget=Math.min(budget,profile.weeklyTargetMinutes);reasons.push('The requested target cannot increase load with sparse history or new-rider experience.');}
  if (baselineEnd !== today) reasons.push(`You reported a recovery week ending ${profile.recoveryWeekEnd}. Its reduced volume is excluded from the usual-volume baseline. The proposal starts ${startDate}; recovery is not assumed complete merely because a date has passed.`);
  if (current.latestDate && current.latestDate < addDays(today, -POLICY.breakDays)) { budget *= POLICY.breakFactor; reasons.push('A break of over 21 days reduces the starting budget by half.'); }
  if (profile.experience === 'new') { budget = Math.min(budget, POLICY.sparseMinutes); reasons.push('New rider: a gentle starting week, using perceived effort.'); }
  if (profile.recovery === 'poor'||coach.feedbackPoor||profile.coach&&(profile.coach.fatigue>=4||profile.coach.sleep<=2||profile.coach.soreness>=4)) { budget *= POLICY.recoveryFactor; reasons.push('Your poor recovery feedback or check-in reduces the time budget to 60%; rest is always an option.'); }
  if(coach.reviewWeek)budget*=POLICY.recoveryFactor;
  if(coach.qualityLimit&&(!coach.freshThreshold||coach.coverage<COACH_POLICY.minCoverage||coach.demandingDays<4)){budget=Math.min(budget,analysis.weeklyAverage);coach.qualityLimit=1;reasons.push('Introducing or uncertainly classified quality work: hold volume at or below the usual baseline rather than increasing volume and intensity together. The requested 12–13 hours may be deferred.');}
  if(budget>analysis.weeklyAverage&&coach.qualityLimit>1){coach.qualityLimit=1;reasons.push('Requested volume is increasing: limit this week to one quality session instead of increasing both volume and quality frequency.');}
  reasons.push(...coach.reasons);
  if (current.otherMinutes) {
    const reserve=requestedProgression?Math.max(0,(current.otherMinutes-analysis.otherMinutes)/4):current.otherMinutes/4;
    budget=Math.max(0,budget-reserve);
    reasons.push(requestedProgression?`${Math.round(current.otherMinutes)} min of other exercise is recorded in 28 days. Usual other exercise already coexisted with the baseline; ${Math.round(reserve)} additional min/week is reserved for increases over that baseline. Effort and future scheduling remain uncertain.`:`${Math.round(current.otherMinutes)} min of other exercise in 28 days reduces the riding budget; effort is uncertain.`);
  }
  if (profile.goal === 'event' && profile.eventDate <= addDays(startDate, POLICY.taperDays)) { budget *= POLICY.taperFactor; reasons.push('Event within 7 days: reduced volume, no catch-up work. This is a prototype taper rule.'); }
  if (profile.limitation !== 'none') { budget = 0; reasons.push(profile.limitation === 'acute' ? 'Stop training for acute concerning symptoms. Seek urgent medical help; call local emergency services if symptoms are severe or ongoing.' : 'Automatic training is paused for illness, injury, pregnancy, rehabilitation, or clinician restrictions. Follow qualified guidance before resuming.'); }
  if (!profile.equipment.includes('bicycle') || (profile.preference === 'inside' && !profile.equipment.includes('trainer'))) { budget = 0; reasons.push('Your equipment does not support the selected riding setting. Add suitable equipment or change your preference.'); }
  if (profile.threshold) reasons.push(`FTP ${profile.threshold.watts} W (${profile.threshold.method}, ${profile.threshold.date}) is ${coach.freshThreshold ? 'recorded and current enough for a reference' : 'stale; targets use RPE only'}. Watts are the prescribed targets. FTP percentages are practical prescription references, not measured physiological boundaries.`);
  else reasons.push('No FTP needed. Targets use perceived effort (RPE) and the talk test; no fitness or power zones are inferred.');
  if (profile.goal === 'event' && profile.eventDurationMinutes && profile.eventDurationMinutes > Math.max(profile.longestMinutes, analysis.longest)) reasons.push('Expected event duration exceeds your longest recent ride. This week cannot establish readiness; consider a revised goal or qualified coach.');
  budget = Math.floor(budget / 5) * 5;
  const workouts = [], preserved = previous?.workouts || [];
  let remaining = budget;
  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i), old = preserved.find(w => w.date === date);
    if (old && (old.locked || old.status !== 'planned')) { workouts.push(structuredClone(old)); remaining -= old.minutes; if (old.minutes > profile.availability[weekday(date)]) conflicts.push(`${date}: preserved session exceeds new availability.`); }
  }
  if (remaining < 0) conflicts.push('Preserved sessions exceed the new budget. Unlock future sessions or review the plan; no extra sessions were added.');
  if (profile.limitation !== 'none' && workouts.some(w => w.locked && w.status === 'planned' && w.minutes)) conflicts.push('A locked session conflicts with the training pause. Do not train; unlock it before accepting.');
  if (profile.recovery === 'poor' && workouts.some(w => w.locked && w.status === 'planned' && w.minutes)) conflicts.push('Locked sessions remain unchanged despite poor recovery. Review or unlock them.');
  const candidateDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i)).filter(date => !workouts.some(w => w.date === date) && profile.availability[weekday(date)] >= POLICY.minSession && !profile.otherExerciseDays.includes(weekday(date)) && !(profile.goal === 'event' && date >= profile.eventDate) && !(profile.recoveryWeekEnd && date <= profile.recoveryWeekEnd));
  // Spread easy sessions first; fill neither missed work nor every spare minute.
  const selected = [];
  for (const date of candidateDays) if (requestedProgression || !selected.length || date >= addDays(selected.at(-1), 2)) selected.push(date);
  const choices = selected.length ? selected : candidateDays.slice(0, 1);
  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i); if (workouts.some(w => w.date === date)) continue;
    const slots = choices.filter(d => d >= date).length;
    const maxRide = Math.min(POLICY.maxSession, analysis.longest || profile.longestMinutes || 30);
    const laterCapacity=choices.filter(d=>d>date).reduce((sum,d)=>sum+Math.min(profile.availability[weekday(d)],maxRide),0);
    const allocation=requestedProgression?Math.max(Math.max(0,remaining)-laterCapacity,Math.min(profile.availability[weekday(date)],Math.max(0,remaining)/Math.max(1,slots))):Math.max(0,remaining)/Math.max(1,slots);
    let minutes = choices.includes(date) ? Math.floor(Math.min(profile.availability[weekday(date)], maxRide, allocation) / 5) * 5 : 0;
    if (minutes < POLICY.minSession) minutes = 0;
    remaining -= minutes;
    const title = !minutes ? 'Rest & recharge' : profile.recovery === 'poor' ? 'Gentle recovery ride' : ['endurance', 'event'].includes(profile.goal) ? 'Endurance foundation' : 'Easy consistency ride';
    workouts.push({ id: `workout-${date}`, date, timezone: profile.timezone, title, discipline: 'cycling', purpose: minutes ? 'Build comfortable, repeatable riding for your goal without adding unearned load.' : 'Make room for recovery and life outside training.', minutes, equipment: minutes ? profile.preference === 'inside' ? ['bicycle', 'trainer'] : ['bicycle'] : [], steps: steps(minutes), targetMethod: 'RPE-talk-test-v1', thresholdVersion: null, alternative: minutes ? `${Math.max(10, Math.floor(minutes / 2 / 5) * 5)} min of very easy riding at RPE 1–2, or rest. Include an easy start and finish.` : 'A relaxed walk or complete rest, if comfortable.', status: 'planned', locked: false, activityId: null, feedback: null });
  }
  workouts.sort((a, b) => a.date.localeCompare(b.date));
  const prescription=prescribeCoach(workouts,profile,coach,today);
  const demanding=workouts.filter(w=>isQualityWorkout(w));
  if(demanding.length>coach.qualityLimit)conflicts.push('Preserved demanding sessions exceed the current quality-session allowance. Review or unlock future sessions; completed work stays intact.');
  if(prescription.workMinutes>prescription.maxWorkMinutes)conflicts.push('Preserved interval work exceeds the current work-duration limit. Review future locked sessions.');
  if(demanding.some((w,i)=>demanding.slice(i+1).some(q=>Math.abs(Date.parse(q.date)-Date.parse(w.date))<COACH_POLICY.qualitySpacingDays*86400000)))conflicts.push('Preserved demanding sessions are too close together. Review future locked sessions.');
  workouts.forEach(validateWorkout);
  reasons.push(`Coach decision: ${prescription.qualitySessions} quality sessions; ${prescription.workMinutes} min of prescribed quality-interval work within ${prescription.maxWorkMinutes} min policy allowance. Most time remains easy. These are practical starting rules, not a universal 80/20 formula.`);
  const total = workouts.reduce((s, w) => s + w.minutes, 0);
  if(profile.weeklyTargetMinutes!=null&&total<profile.weeklyTargetMinutes)reasons.push(`The proposal fits ${total} of the requested ${profile.weeklyTargetMinutes} min. Recovery, capacity limits, protected days, equipment, and preserved sessions take priority over filling the target.`);
  if(activities.some(a=>a.source==='strava')){
    const signals=overallSignals(activities,today,profile.threshold);
    reasons.push(`Six-month sensor context: ${signals.measuredPowerRecords} rides report device power, ${signals.heartRateRecords} report HR, and ${signals.streamRecords} have processed time series out of ${signals.cyclingRecords} cycling records. Missing or pending data is not treated as zero load.`);
    const best20=signals.best.find(p=>p.seconds===1200);
    if(best20?.watts!=null)reasons.push(`Best observed continuous 20-minute power: ${Math.round(best20.watts)} W on ${best20.date}. This is an observed effort, not an FTP test or an automatic threshold estimate.`);
    if(signals.aboveFtpSeconds!==null)reasons.push(`${Math.round(signals.aboveFtpSeconds/60)} recorded minutes above your supplied current FTP in the last 28 days. Historical FTP may differ; coverage and threshold age limit comparisons.`);
    else reasons.push('FTP is absent or stale. HR and power describe recorded efforts; purposeful sessions can use RPE after rider confirmation, without invented zones.');
    const lastWeek=activities.filter(a=>a.date>=addDays(today,-6)&&a.date<=today);
    if(lastWeek.some(a=>a.signals?.drift?.eligible))reasons.push('Some recent steady recordings support descriptive power/HR ratio comparisons. Heat, fueling, pacing, and recording quality can change this signal; it is not a readiness or medical test.');
  }
  if (!total && profile.limitation === 'none') reasons.push('No suitable riding slots within the current constraints. Short slots and rest days are respected.');
  const cycle={week:coach.cycleWeek,startDate:profile.coach?.cycleStart||startDate,outline:['Week 1: establish repeatable sessions and check recovery.','Week 2: review outcomes; progress interval duration OR easy volume only if recovery and execution support it.','Week 3: consolidate; no automatic increase or catch-up.','Week 4: provisional lighter week and review; adjust to the rider response.'],provisional:true};
  return { id: previous?.startDate === startDate ? previous.id : `plan-${startDate}`, startDate, observedOn: today, baselineEnd, timezone: profile.timezone, version: POLICY.version, generatedAt: new Date().toISOString(), workouts, reasons, conflicts, evidenceIds: [...new Set([...analysis.evidenceIds,...coach.signals.best.map(b=>b.id).filter(Boolean)])], coach:{...coach,prescription,cycle}, budget, total };
}
export function changes(before, after) {
  return after.workouts.flatMap(w => { const old = before?.workouts.find(v => v.id === w.id); return !old || old.minutes !== w.minutes || old.title !== w.title || JSON.stringify(old.steps)!==JSON.stringify(w.steps) ? [{ id: w.id, date: w.date, before: old ? `${old.title} · ${old.minutes} min (targets may change)` : 'Unplanned', after: `${w.title} · ${w.minutes} min · ${w.targetMethod}` }] : []; });
}
export function restoreFuture(current, prior, today) {
  const restored = structuredClone(prior);
  restored.workouts = restored.workouts.map(w => { const now = current.workouts.find(v => v.id === w.id); return now && (now.status !== 'planned' || now.locked || now.date < today) ? structuredClone(now) : w; });
  restored.total = restored.workouts.reduce((s, w) => s + w.minutes, 0);
  return restored;
}

export const PERSONAL_RECOVERY_END = '2026-11-08';
export function planningContext(profile, observedOn) {
  const recoveryEnd = profile.recoveryWeekEnd || '';
  const nextMonday = addDays(observedOn, weekday(observedOn) === 1 ? 0 : (8 - weekday(observedOn)) % 7);
  const startDate = validDate(recoveryEnd) && recoveryEnd >= observedOn ? addDays(recoveryEnd, 1) : nextMonday;
  const returningWeek = validDate(recoveryEnd) && observedOn <= addDays(recoveryEnd, 7) && startDate <= addDays(recoveryEnd, 7);
  return { startDate, baselineEnd: returningWeek ? addDays(recoveryEnd, -7) : observedOn, recoveryWeekEnd: recoveryEnd };
}
export function fromStrava(records, timezone, observedOn=null) {
  const activities = [], rejected = [];
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const r of records) {
    try {
      const parts = formatter.formatToParts(new Date(r.startDate));
      const date = ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
      if(observedOn&&(date<calendarWindow(observedOn).start||date>observedOn))continue;
      const a = { id: `strava-${r.id}`, providerId: r.id, title: r.title.slice(0,100), date, originalLocalDate: r.localDate, minutes: r.movingSeconds / 60, distanceKm: r.distanceMeters === null ? null : r.distanceMeters / 1000, rpe: null, discipline: ['Ride','VirtualRide','MountainBikeRide','GravelRide','EBikeRide','EMountainBikeRide','Handcycle','Velomobile'].includes(r.sport) ? 'cycling' : 'other', sport: r.sport, source: 'strava', recordedAt: new Date(r.fetchedAt).toISOString(),sensors:r.sensors||null,signals:r.signals||null,enrichment:r.enrichment||null };
      validateActivity(a); activities.push(a);
    } catch { rejected.push(String(r.id)); }
  }
  return { activities, rejected };
}
export function assessTraining(activities, profile, observedOn) {
  const context = planningContext(profile, observedOn);
  const baseline = analyze(activities, context.baselineEnd), recent = analyze(activities, observedOn);
  const activeWeeks = baseline.weekly.filter(w=>w.minutes>0).length;
  const label = baseline.rides.length < 3 ? 'Limited recorded history' : activeWeeks >= POLICY.regularWeeks ? 'Regular riding history' : 'Intermittent riding history';
  const signals=overallSignals(activities,observedOn,profile.threshold);
  return { label, confidence: activeWeeks >= POLICY.regularWeeks && baseline.rides.length >= POLICY.confidenceRides ? 'moderate for recorded exposure; physiological interpretation depends on sensor coverage and context' : 'limited', baseline, recent, context, fitness: 'Not measured', signals, explanation: `${baseline.rides.length} cycling records across ${activeWeeks} of four baseline weeks. This describes recorded training exposure, not a validated fitness grade.`, evidenceIds: baseline.evidenceIds, missing: `${signals.streamRecords} of ${signals.cyclingRecords} six-month cycling records have processed time series. Measured power, HR, quality checks, and your threshold provide context; FTP, VO2max, and medical conditions are never inferred automatically.` };
}
