import { defaultProfile, localDate, validDate, validateProfile, validateActivity, validateWorkout, syntheticActivities, addDays, validateStrengthRoom } from './engine.js';
export const KEY = 'cadence.personal.v1';
export function initialState() {
  const profile = defaultProfile();
  return { schema: 1, revision: 0, onboarded: false, mode: 'synthetic', profile, activities: syntheticActivities(localDate(profile.timezone)), plan: null, revisions: [], processedEvents: [], strengthRoom:{plans:[],records:[]}, connection: { provider: 'strava', status: 'unavailable' } };
}
export function validateState(s, { ephemeral = false } = {}) {
  if (!s || s.schema !== 1 || !Number.isInteger(s.revision) || s.revision < 0 || typeof s.onboarded !== 'boolean' || !(ephemeral ? ['synthetic', 'manual', 'strava'] : ['synthetic', 'manual']).includes(s.mode)) throw Error('Saved data has an unsupported format.');
  validateProfile(s.profile, s.profile.goal === 'event' && validDate(s.profile.eventDate) ? s.profile.eventDate : localDate(s.profile.timezone));
  if(s.strengthRoom)validateStrengthRoom(s.strengthRoom);
  if (!Array.isArray(s.activities) || s.activities.length > 10000) throw Error('Invalid activity history.');
  s.activities.forEach(validateActivity);
  if (new Set(s.activities.map(a => a.id)).size !== s.activities.length || s.activities.some(a => s.mode === 'strava' ? !['strava','manual'].includes(a.source) : a.source !== s.mode)) throw Error('Duplicate activities or mixed sample and personal data.');
  function plan(p) { if (!p || !Array.isArray(p.workouts) || p.workouts.length !== 7 || !Array.isArray(p.reasons) || !p.reasons.every(r => typeof r === 'string') || !Array.isArray(p.conflicts) || !p.conflicts.every(r => typeof r === 'string') || new Set(p.workouts.map(w => w.id)).size !== 7 || new Set(p.workouts.map(w => w.date)).size !== 7) throw Error('Invalid saved plan.'); p.workouts.forEach(validateWorkout); }
  if (s.plan) plan(s.plan);
  if (!Array.isArray(s.revisions) || s.revisions.length > 100 || !Array.isArray(s.processedEvents) || !s.processedEvents.every(x => typeof x === 'string') || s.processedEvents.length > 100) throw Error('Invalid revision history.');
  s.revisions.forEach(r => { if (!r || typeof r.id !== 'string' || typeof r.reason !== 'string' || !Array.isArray(r.changes)) throw Error('Invalid revision.'); if (r.before) plan(r.before); if (r.after) plan(r.after); });
  if (s.connection?.status !== 'unavailable') throw Error('Unsupported connection status.');
  return s;
}
export function load(storage = localStorage) {
  const raw = storage.getItem(KEY);
  if (!raw) return initialState();
  const s = validateState(JSON.parse(raw));
  const cutoff = addDays(localDate(s.profile.timezone), -s.profile.retentionDays);
  s.activities = s.activities.filter(a => a.date >= cutoff);
  return s;
}
export function save(state, storage = localStorage) {
  if (state.mode === 'strava') throw Error('Strava coaching data is temporary and cannot be saved to browser storage.');
  validateState(state);
  const current = storage.getItem(KEY);
  if (current && JSON.parse(current).revision !== state.revision) throw Error('Another tab updated your data. Reload this page before saving.');
  const next = { ...state, revision: state.revision + 1 };
  storage.setItem(KEY, JSON.stringify(next));
  state.revision = next.revision;
}
export function createStravaWorkspace(local, activities) {
  return { ...structuredClone(local), revision: 0, mode: 'strava', activities: structuredClone(activities), plan: null, revisions: [], processedEvents: [] };
}
export function acceptProposal(s, p) {
  if (s.processedEvents.includes(p.id)) return false;
  if (p.baseRevision !== s.revision) throw Error('Data changed since this proposal was created. Review a fresh proposal.');
  if (p.plan.conflicts.length) throw Error('Resolve proposal conflicts first.');
  s.revisions.push({ id: p.id, at: new Date().toISOString(), reason: p.reason, before: structuredClone(s.plan), after: structuredClone(p.plan), profileBefore: structuredClone(s.profile), profileAfter: structuredClone(p.profile), changes: structuredClone(p.diff) });
  s.revisions = s.revisions.slice(-100);
  s.plan = structuredClone(p.plan);
  s.profile = structuredClone(p.profile);
  s.onboarded = true;
  s.processedEvents = [...s.processedEvents, p.id].slice(-100);
  return true;
}
