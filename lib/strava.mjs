import { randomBytes, timingSafeEqual } from 'node:crypto';
import { calendarWindow, dateInZone, sensorSummary, activityDetails, mergeDetails, analyzeStreams, STREAM_KEYS } from '../public/sensors.js';

const COOKIE = 'cadence_strava_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const INTERVAL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const ENRICH_BATCH_REQUESTS = 20;
const random = () => randomBytes(32).toString('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const safeId = v => Number.isSafeInteger(v) && v > 0;

/** Select training fields only. GPS, notes, maps, and raw responses are discarded. */
export function normalizeActivity(a, fetchedAt) {
  if (!a || !safeId(a.id) || typeof a.name !== 'string' || typeof a.start_date !== 'string' || !Number.isFinite(Date.parse(a.start_date)) || !Number.isFinite(a.moving_time) || a.moving_time < 0 || a.moving_time > 604800 || (a.distance != null && (!Number.isFinite(a.distance) || a.distance < 0))) throw Error('Strava returned an invalid activity record.');
  return { id: String(a.id), title: a.name.slice(0, 200), sport: String(a.sport_type || a.type || 'Activity').slice(0, 60), startDate: new Date(a.start_date).toISOString(), localDate: /^\d{4}-\d{2}-\d{2}/.test(a.start_date_local || '') ? a.start_date_local.slice(0, 10) : a.start_date.slice(0, 10), movingSeconds: a.moving_time, distanceMeters: a.distance ?? null, source: 'strava-api', fetchedAt, sensors:sensorSummary(a) };
}

/** Single-device personal integration. Tokens and temporary records live in server memory only. */
export function createStravaIntegration({ env = process.env, fetchImpl = fetch, now = Date.now, autoEnrich = true } = {}) {
  const sessions = new Map();
  let retryAt = 0;
  const config = () => ({ clientId: (env.STRAVA_CLIENT_ID || '').trim(), secret: (env.STRAVA_CLIENT_SECRET || '').trim() });
  const configured = () => /^\d+$/.test(config().clientId) && Boolean(config().secret);
  const window = () => calendarWindow(dateInZone(now(),env.STRAVA_TIMEZONE||'America/Toronto'));
  const inWindow = a => {const d=dateInZone(a.startDate,env.STRAVA_TIMEZONE||'America/Toronto');const w=window();return d>=w.start&&d<=w.end&&Date.parse(a.startDate)<=now();};
  function clear(s) { s.generation++; s.tokens = null; s.athleteId = null; s.activities.clear(); s.lastSync = null; s.lastFullSync = null; s.oauth = null; s.complete = false; }
  function prune() { for (const [id, s] of sessions) { if (s.expires <= now()) { clear(s); sessions.delete(id); } else for (const [key, a] of s.activities) if (a.fetchedAt < now() - SESSION_MS||!inWindow(a)) s.activities.delete(key); } }
  function session(req, res, create = false) {
    prune();
    const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    let s = sessions.get(cookie);
    if (!s && create) {
      if (sessions.size >= 20) return null;
      const id = random(); s = { csrf: random(), expires: now() + SESSION_MS, tokens: null, athleteId: null, oauth: null, activities: new Map(), lastSync: null, lastFullSync: null, lastAttempt: 0, syncing: false, enriching:false, error: '', complete: false, generation: 0 };
      sessions.set(id, s);
      res.setHeader('Set-Cookie', `${COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`);
    }
    return s;
  }
  function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
  async function request(url, options = {}) {
    if (retryAt > now()) throw Error('Strava rate limit reached. Automatic sync will retry after the limit resets.');
    let r;
    try { r = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw Error('Strava could not be reached. Sync will retry automatically; your existing records are unchanged.'); }
    let nextPause = 0;
    for (const prefix of ['x-ratelimit', 'x-readratelimit']) {
      const limits = (r.headers.get(`${prefix}-limit`) || '').split(',').map(Number);
      const usage = (r.headers.get(`${prefix}-usage`) || '').split(',').map(Number);
      if (limits.length === 2 && usage.length === 2) {
        if (usage[0] >= limits[0] && limits[0] > 0) nextPause = Math.max(nextPause, (Math.floor(now() / INTERVAL_MS) + 1) * INTERVAL_MS + 1000);
        if (usage[1] >= limits[1] && limits[1] > 0) nextPause = Math.max(nextPause, (Math.floor(now() / DAY_MS) + 1) * DAY_MS + 1000);
      }
    }
    if (r.status === 429) nextPause = Math.max(nextPause, now() + INTERVAL_MS);
    retryAt = Math.max(retryAt, nextPause);
    if (!r.ok) { const error = Error(r.status === 429 ? 'Strava rate limit reached. Sync will retry after the limit resets.' : r.status === 401 ? 'Strava authorization expired or was revoked. Reconnect your account.' : r.status === 403 ? 'Strava denied access. Check your application eligibility and granted scopes.' : `Strava request failed (HTTP ${r.status}). Please retry later.`); error.status = r.status; throw error; }
    try { return await r.json(); } catch { throw Error('Strava returned an unreadable response. Please retry later.'); }
  }
  async function tokenRequest(fields) {
    const c = config();
    const t = await request('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, ...fields }) });
    if (typeof t.access_token !== 'string' || !t.access_token || typeof t.refresh_token !== 'string' || !t.refresh_token || !Number.isFinite(t.expires_at) || t.expires_at * 1000 <= now()) throw Error('Strava returned invalid authorization credentials. Reconnect your account.');
    return t;
  }
  async function access(s) {
    if (!s.tokens) throw Error('Connect your Strava account first.');
    if (s.tokens.expires_at * 1000 < now() + 60000) {
      const generation = s.generation;
      const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.tokens.refresh_token });
      if (generation !== s.generation || !s.tokens) throw Error('Strava connection changed.');
      s.tokens = { access_token: next.access_token, refresh_token: next.refresh_token, expires_at: next.expires_at };
    }
    return s.tokens.access_token;
  }
  async function sync(s, full = false) {
    if (s.syncing || s.enriching || !s.tokens) return;
    s.syncing = true; s.error = ''; s.lastAttempt = now();
    const generation = s.generation;
    const fullScan = full || !s.lastFullSync || now() - s.lastFullSync >= DAY_MS;
    // Snapshot upper bound prevents new uploads shifting pagination mid-scan.
    const before = Math.floor(now() / 1000) + 1;
    // Broad query boundary, followed by exact rider-local calendar filtering (including DST).
    const after = fullScan?Math.floor(Date.parse(window().start+'T00:00:00Z')/1000)-86400:Math.floor((now() - 30 * DAY_MS) / 1000);
    const incoming = new Map(); let complete = false;
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (generation !== s.generation) return;
        const token = await access(s);
        const query = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE), before: String(before) });
        query.set('after', String(after));
        const data = await request(`https://www.strava.com/api/v3/athlete/activities?${query}`, { headers: { Authorization: `Bearer ${token}` } });
        if (generation !== s.generation) return;
        if (!Array.isArray(data) || data.length > PAGE_SIZE) throw Error('Strava returned an invalid activity list.');
        for (const raw of data) {
          const a=normalizeActivity(raw,now());if(!inWindow(a))continue;
          const old=s.activities.get(a.id);
          const unchanged=old&&old.movingSeconds===a.movingSeconds&&old.distanceMeters===a.distanceMeters&&JSON.stringify(old.summarySensors)===JSON.stringify(a.sensors);
          a.summarySensors=structuredClone(a.sensors);
          if(unchanged){a.sensors=old.sensors;a.signals=old.signals;a.enrichment=old.enrichment;}
          else a.enrichment={details:'pending',streams:'pending',attempts:0,error:'',fetchedAt:null};
          incoming.set(a.id,a);
        }
        if (data.length < PAGE_SIZE) { complete = true; break; }
      }
      if (!complete) throw Error('Activity history exceeds the 10,000-record safety limit. History is incomplete; contact the developer before increasing the limit.');
      if (fullScan) s.activities = incoming;
      else { for (const [id, a] of s.activities) if (Date.parse(a.startDate) > after * 1000 && !incoming.has(id)) s.activities.delete(id); for (const [id, a] of incoming) s.activities.set(id, a); }
      s.lastSync = now(); if (fullScan) { s.lastFullSync = now(); s.complete = true; }
    } catch (error) {
      if (generation === s.generation) {
        if (error.status === 401) clear(s);
        s.error = error.message;
      }
    } finally { s.syncing = false; if(autoEnrich&&s.tokens&&generation===s.generation)void enrich(s); }
  }
  async function enrich(s) {
    if(!s.tokens||s.syncing||s.enriching||retryAt>now())return;
    s.enriching=true;const generation=s.generation;let used=0;
    try {
      const candidates=[...s.activities.values()].sort((a,b)=>b.startDate.localeCompare(a.startDate));
      for(const a of candidates){
        if(used>=ENRICH_BATCH_REQUESTS||generation!==s.generation||!s.tokens||retryAt>now())break;
        const e=a.enrichment;
        if(!e||e.attempts>=3||(!['pending','retry'].includes(e.details)&&!['pending','retry'].includes(e.streams)))continue;
        try {
          if(['pending','retry'].includes(e.details)){
            used++;const token=await access(s);const detail=await request(`https://www.strava.com/api/v3/activities/${a.id}`,{headers:{Authorization:`Bearer ${token}`}});
            if(generation!==s.generation)return;
            if(!detail||String(detail.id)!==a.id||String(detail.athlete?.id)!==String(s.athleteId))throw Error('Activity details did not match the authorized athlete.');
            a.sensors=mergeDetails(a.sensors,activityDetails(detail));e.details='ready';
          }
          if(used>=ENRICH_BATCH_REQUESTS||retryAt>now())break;
          if(['pending','retry'].includes(e.streams)){
            used++;const token=await access(s);const query=new URLSearchParams({keys:STREAM_KEYS.join(','),key_by_type:'true'});
            const raw=await request(`https://www.strava.com/api/v3/activities/${a.id}/streams?${query}`,{headers:{Authorization:`Bearer ${token}`}});
            if(generation!==s.generation)return;
            if(!raw||(Array.isArray(raw)?!raw.length:!Object.keys(raw).length)){e.streams='unavailable';e.error='No time-series data was recorded or exposed for this activity.';}
            else {a.signals=analyzeStreams(raw,a.sensors.power.source==='device');e.streams='ready';}
          }
          e.fetchedAt=now();e.attempts=0;if(e.details==='ready'&&e.streams==='ready')e.error='';
        }catch(error){
          if(generation!==s.generation)return;
          if(error.status===401){clear(s);s.error=error.message;break;}
          if(error.status===404&&e.details!=='ready'){s.activities.delete(a.id);continue;}
          if(error.status===404||error.status===403){if(e.details!=='ready')e.details='unavailable';e.streams='unavailable';e.error='Detail or stream access is unavailable for this activity.';e.fetchedAt=now();continue;}
          if(retryAt>now())break;
          e.attempts++;if(e.details!=='ready')e.details=e.attempts>=3?'failed':'retry';if(e.streams!=='ready')e.streams=e.attempts>=3?'failed':'retry';e.error=error.message;
        }
      }
    }finally{s.enriching=false;}
  }
  async function tick() { prune(); for (const s of sessions.values()) if (s.tokens && !s.syncing && !s.enriching && now() >= retryAt) {if(now()-s.lastAttempt>=INTERVAL_MS)await sync(s);else if(autoEnrich)await enrich(s);} }
  const timer = setInterval(() => { void tick().catch(() => {}); }, 60000); timer.unref();
  function status(s){
    const jobs=[...(s?.activities.values()||[])].map(a=>a.enrichment).filter(Boolean);
    return { configured:configured(),clientId:config().clientId||null,connected:Boolean(s?.tokens),csrf:s?.csrf||null,syncing:s?.syncing||false,enriching:s?.enriching||false,lastSync:s?.lastSync?new Date(s.lastSync).toISOString():null,lastFullSync:s?.lastFullSync?new Date(s.lastFullSync).toISOString():null,nextSync:s?.tokens?new Date(Math.max(retryAt,s.lastAttempt+INTERVAL_MS)).toISOString():null,retryAt:retryAt>now()?new Date(retryAt).toISOString():null,complete:s?.complete||false,error:s?.error||'',autoSyncMinutes:15,count:s?.activities.size||0,expiresAt:s?new Date(s.expires).toISOString():null,historyWindow:window(),enrichment:{total:jobs.length,ready:jobs.filter(j=>j.details==='ready'&&j.streams==='ready').length,pending:jobs.filter(j=>['pending','retry'].includes(j.details)||['pending','retry'].includes(j.streams)).length,unavailable:jobs.filter(j=>j.details==='unavailable'||j.streams==='unavailable').length,failed:jobs.filter(j=>j.details==='failed'||j.streams==='failed').length}};
  }
  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!url.pathname.startsWith('/api/strava/')) return false;
    const callback = url.pathname === '/api/strava/callback';
    const origin = `http://${req.headers.host}`;
    if (!callback && ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site')) { json(res, 403, { error: 'Open this page directly from the local app.' }); return true; }
    const s = session(req, res, url.pathname === '/api/strava/status' && req.method === 'GET');
    if (!s) { json(res, 401, { error: 'Open Connections in the local app to start a session.' }); return true; }
    if (req.method === 'POST' && (!equal(req.headers['x-csrf-token'], s.csrf) || req.headers.origin !== origin)) { json(res, 403, { error: 'Request verification failed. Reload the app.' }); return true; }
    if (req.method === 'GET' && url.pathname === '/api/strava/status') { json(res, 200, status(s)); return true; }
    if (req.method === 'GET' && url.pathname === '/api/strava/activities') { if (!s.tokens) json(res, 401, { error: 'Connect Strava to read activities.' }); else json(res, 200, { activities: [...s.activities.values()].sort((a, b) => b.startDate.localeCompare(a.startDate)), ...status(s) }); return true; }
    if (req.method === 'POST' && url.pathname === '/api/strava/connect') {
      if (!configured()) { json(res, 503, { error: 'Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env, save the file, and restart the server.' }); return true; }
      if (s.tokens) { json(res, 409, { error: 'Disconnect the current account before connecting another.' }); return true; }
      const state = random(); s.oauth = { state, expires: now() + 10 * 60000, redirectUri: `${origin}/api/strava/callback` };
      const auth = new URL('https://www.strava.com/oauth/authorize');
      auth.search = new URLSearchParams({ client_id: config().clientId, redirect_uri: s.oauth.redirectUri, response_type: 'code', approval_prompt: 'force', scope: 'activity:read_all', state }).toString();
      json(res, 200, { authorizationUrl: auth.href }); return true;
    }
    if (req.method === 'GET' && callback) {
      const oauth = s.oauth; s.oauth = null;
      if (!oauth || oauth.expires <= now() || !equal(url.searchParams.get('state'), oauth.state) || new URL(oauth.redirectUri).origin !== origin) { json(res, 400, { error: 'Authorization state is invalid, expired, or already used. Return to Connections and try again.' }); return true; }
      if (url.searchParams.get('error')) { s.error = 'Authorization was declined. No account was connected.'; res.writeHead(303, { Location: '/?strava=denied#connection' }); res.end(); return true; }
      const scopes = (url.searchParams.get('scope') || '').split(/[ ,]+/);
      if (!scopes.includes('activity:read_all') || !url.searchParams.get('code')) { s.error = 'Activity access was not granted. Reconnect and allow read access to all your activities.'; res.writeHead(303, { Location: '/?strava=scope#connection' }); res.end(); return true; }
      try {
        const t = await tokenRequest({ code: url.searchParams.get('code'), grant_type: 'authorization_code' });
        if (!safeId(t.athlete?.id)) throw Error('Strava did not identify the authorized athlete.');
        clear(s); s.tokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at }; s.athleteId = t.athlete.id; s.error = ''; s.complete = false;
        void sync(s, true);
      } catch (e) { s.error = `Authorization could not finish. ${e.message.replace('Sync will retry automatically; your existing records are unchanged.', 'No account was connected.')} Select Connect with Strava again to retry.`; }
      res.writeHead(303, { Location: '/?strava=return#connection' }); res.end(); return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/strava/sync') {
      if (!s.tokens) { json(res, 401, { error: 'Connect Strava first.' }); return true; }
      if (retryAt > now()) { json(res, 429, { error: 'Rate limited. Wait until the next sync time.' }); return true; }
      if(s.enriching){json(res,409,{error:'A sensor collection batch is running. Please try again after it finishes.'});return true;}
      if (!s.syncing && now() - s.lastAttempt < 60000) { json(res, 429, { error: 'A sync was just requested. Wait a minute before requesting another.' }); return true; }
      void sync(s, true); json(res, 202, status(s)); return true;
    }
    if(req.method==='POST'&&url.pathname==='/api/strava/retry-details'){
      if(!s.tokens){json(res,401,{error:'Connect Strava first.'});return true;}
      if(s.enriching||s.syncing){json(res,409,{error:'Collection is already running.'});return true;}
      for(const a of s.activities.values()){const e=a.enrichment;if(!e)continue;if(['failed','retry'].includes(e.details))e.details='pending';if(['failed','retry'].includes(e.streams))e.streams='pending';e.attempts=0;}
      void enrich(s);json(res,202,status(s));return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/strava/disconnect') {
      const token = s.tokens?.refresh_token;
      clear(s); s.error = ''; s.complete = false;
      let revoked = !token;
      if (token) {
        try {
          const c = config();
          const r = await fetchImpl('https://www.strava.com/oauth/revoke', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: 'refresh_token' }) });
          revoked = r.ok || r.status === 401;
        } catch { /* Local data is already deleted even if Strava cannot be reached. */ }
      }
      json(res, 200, { ...status(s), revoked, message: revoked ? 'Disconnected and temporary API data deleted.' : 'Local credentials and data deleted. Revocation could not be confirmed; revoke this app in Strava Settings → My Apps.' }); return true;
    }
    json(res, 404, { error: 'Unsupported Strava route.' }); return true;
  }
  return { handle, tick, close: () => { clearInterval(timer); for (const s of sessions.values()) clear(s); sessions.clear(); } };
}
