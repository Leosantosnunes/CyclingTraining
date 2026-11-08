import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStravaIntegration, normalizeActivity } from '../lib/strava.mjs';

const epoch = Date.parse('2026-11-08T03:00:00Z');
const record = (id = 10) => ({ id, name: '<script>ride</script>', start_date: '2026-11-07T18:00:00Z', start_date_local: '2026-11-07T13:00:00Z', moving_time: 3600, distance: 20000, sport_type: 'Ride', map: { summary_polyline: 'private-gps' }, average_heartrate: 135, description: 'private notes' });
const reply = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
async function fixture(provider,{autoEnrich=false}={}) {
  let clock = epoch;
  const calls=[];
  const integration=createStravaIntegration({env:{STRAVA_CLIENT_ID:'90597',STRAVA_CLIENT_SECRET:'test-client-secret'},now:()=>clock,autoEnrich,fetchImpl:async(url,opts)=>{calls.push({url:String(url),opts});return provider(String(url),opts);}});
  const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');await integration.handle(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const r=await fetch(base+'/api/strava/status');const status=await r.json();const cookie=r.headers.get('set-cookie').split(';')[0];
  const get=(route)=>fetch(base+'/api/strava/'+route,{headers:{cookie},redirect:'manual'});
  const post=(route,extra={})=>fetch(base+'/api/strava/'+route,{method:'POST',headers:{cookie,origin:base,'x-csrf-token':status.csrf,...extra}});
  const begin=async()=>{const r=await post('connect');assert.equal(r.status,200);return new URL((await r.json()).authorizationUrl);};
  const authorize=async()=>{const auth=await begin();return get(`callback?state=${auth.searchParams.get('state')}&code=test-code&scope=read,activity:read_all`);};
  const wait=async()=>{for(let i=0;i<100;i++){const r=await get('activities');const data=await r.json();if(!data.syncing)return data;await new Promise(resolve=>setImmediate(resolve));}throw Error('sync did not settle');};
  return {base,cookie,status,calls,get,post,begin,authorize,wait,integration,advance:ms=>clock+=ms,close:async()=>{integration.close();await new Promise(resolve=>server.close(resolve));}};
}
const tokens=(extra={})=>({access_token:'test-access',refresh_token:'test-refresh',expires_at:epoch/1000+3600,athlete:{id:77},...extra});
test('normalization retains requested sensor metrics while discarding GPS, notes, and raw responses',()=>{
  const a=normalizeActivity(record(),epoch);assert.equal(a.movingSeconds,3600);assert.equal(a.source,'strava-api');assert.equal(a.localDate,'2026-11-07');assert.ok(!JSON.stringify(a).includes('private'));assert.equal(a.average_heartrate,undefined);assert.throws(()=>normalizeActivity({...record(),moving_time:-1},epoch));
});
test('OAuth binds state to browser, requests read-only scope, and rejects CSRF',async()=>{
  const f=await fixture(()=>{throw Error('should not reach provider');});
  try {
    const auth=await f.begin();assert.equal(auth.origin,'https://www.strava.com');assert.equal(auth.searchParams.get('scope'),'activity:read_all');assert.equal(auth.searchParams.get('client_id'),'90597');assert.equal(auth.searchParams.get('redirect_uri'),f.base+'/api/strava/callback');assert.ok(!auth.href.includes('test-client-secret'));
    assert.equal((await f.post('connect',{'x-csrf-token':'wrong'})).status,403);
    assert.equal((await f.post('connect',{origin:'https://evil.example'})).status,403);
    assert.equal((await f.get('callback?state=wrong&code=x&scope=activity:read_all')).status,400);assert.equal(f.calls.length,0);
    assert.equal((await fetch(f.base+'/api/strava/activities')).status,401);
  }finally{await f.close();}
});
test('authorization denial and missing scope do not exchange credentials',async()=>{
  const f=await fixture(()=>{throw Error('should not reach provider');});
  try {
    let auth=await f.begin();assert.equal((await f.get(`callback?state=${auth.searchParams.get('state')}&error=access_denied`)).status,303);assert.match((await(await f.get('status')).json()).error,/declined/);
    auth=await f.begin();await f.get(`callback?state=${auth.searchParams.get('state')}&code=x&scope=read`);assert.match((await(await f.get('status')).json()).error,/not granted/);assert.equal(f.calls.length,0);
  }finally{await f.close();}
});
test('network failure during token exchange asks for new authorization instead of promising automatic retry',async()=>{
  const f=await fixture(()=>{throw Error('private network detail');});
  try {await f.authorize();const s=await(await f.get('status')).json();assert.equal(s.connected,false);assert.match(s.error,/Connect with Strava again/);assert.ok(!s.error.includes('retry automatically'));assert.ok(!s.error.includes('private network detail'));}finally{await f.close();}
});
test('pagination deduplicates, session isolates records, callback cannot replay, disconnect revokes',async()=>{
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):url.endsWith('/oauth/revoke')?new Response(null,{status:204}):new URL(url).searchParams.get('page')==='1'?reply(Array.from({length:100},(_,i)=>record(i+1))):reply([record(1)]));
  try {
    const auth=await f.begin(),callback=`callback?state=${auth.searchParams.get('state')}&code=test-code&scope=activity:read_all`;
    assert.equal((await f.get(callback)).status,303);const result=await f.wait();assert.equal(result.count,100);assert.equal(result.complete,true);assert.equal(result.historyWindow.start,'2026-05-07');
    assert.equal((await f.get(callback)).status,400);
    const serialized=JSON.stringify(result);for(const secret of ['test-access','test-refresh','test-client-secret','private-gps','private notes'])assert.ok(!serialized.includes(secret));
    const other=await fetch(f.base+'/api/strava/status');const otherCookie=other.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(f.base+'/api/strava/activities',{headers:{cookie:otherCookie}})).status,401);
    const disconnect=await(await f.post('disconnect')).json();assert.equal(disconnect.connected,false);assert.equal(disconnect.revoked,true);assert.equal(disconnect.count,0);assert.equal((await f.get('activities')).status,401);
    assert.ok(f.calls.some(c=>c.url.endsWith('/oauth/revoke')&&c.opts.body.get('token')==='test-refresh'));
  }finally{await f.close();}
});
test('automatic recent sync refreshes tokens, full scans reconcile deletions',async()=>{
  let rows=[record(10)],refreshes=0;
  const f=await fixture((url,opts)=>{
    if(url.endsWith('/oauth/token')){if(opts.body.get('grant_type')==='refresh_token'){refreshes++;return reply(tokens({access_token:'rotated',refresh_token:'rotated-refresh',expires_at:(epoch+2*86400000)/1000}));}return reply(tokens());}
    return reply(rows);
  });
  try {
    await f.authorize();assert.equal((await f.wait()).count,1);rows=[record(11)];f.advance(3600000);await f.integration.tick();let data=await f.wait();assert.equal(refreshes,1);assert.deepEqual(data.activities.map(a=>a.id),['11']);assert.ok(f.calls.some(c=>c.url.includes('after=')));
    rows=[];f.advance(86400000);await f.integration.tick();data=await f.wait();assert.equal(data.count,0);assert.ok(data.lastFullSync);
  }finally{await f.close();}
});
test('provider outages keep cached records and never expose upstream secret messages',async()=>{
  let fail=false;
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):fail?reply({error:'test-client-secret'},503):reply([record()]));
  try {await f.authorize();await f.wait();fail=true;f.advance(900000);await f.integration.tick();const data=await f.wait();assert.equal(data.count,1);assert.match(data.error,/503/);assert.ok(!JSON.stringify(data).includes('test-client-secret'));}finally{await f.close();}
});
test('rate limits pause retries instead of repeatedly hitting Strava',async()=>{
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):reply({},429));
  try {await f.authorize();const data=await f.wait();assert.match(data.error,/rate limit/i);const count=f.calls.length;await f.integration.tick();assert.equal(f.calls.length,count);assert.equal((await f.post('sync')).status,429);}finally{await f.close();}
});
test('revoked access purges cache and failed disconnect still deletes local credentials',async()=>{
  let denied=false;
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):url.endsWith('/oauth/revoke')?reply({},503):denied?reply({},401):reply([record()]));
  try {await f.authorize();await f.wait();const result=await(await f.post('disconnect')).json();assert.equal(result.revoked,false);assert.equal(result.connected,false);assert.equal(result.count,0);await f.authorize();await f.wait();denied=true;f.advance(900000);await f.integration.tick();const s=await(await f.get('status')).json();assert.equal(s.connected,false);assert.equal(s.count,0);}finally{await f.close();}
});
test('expired OAuth state and seven-day sessions cannot retrieve activities',async()=>{
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):reply([]));
  try {const auth=await f.begin();f.advance(11*60000);assert.equal((await f.get(`callback?state=${auth.searchParams.get('state')}&code=x&scope=activity:read_all`)).status,400);f.advance(7*86400000);assert.equal((await f.get('activities')).status,401);}finally{await f.close();}
});
async function waitDetails(f){for(let i=0;i<150;i++){const d=await(await f.get('activities')).json();if(!d.enriching&&!d.syncing)return d;await new Promise(resolve=>setImmediate(resolve));}throw Error('collection did not settle');}
const sampleStreams=()=>({time:{data:[0,10,20]},watts:{data:[180,200,220]},heartrate:{data:[120,125,130]},moving:{data:[true,true,true]}});
test('API requests and retained data are bounded to the six-month rider-local window',async()=>{
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):reply([record(1),{...record(2),start_date:'2026-05-07T03:00:00Z'},{...record(3),start_date:'2026-05-07T04:00:00Z'},{...record(4),start_date:'2026-11-09T18:00:00Z'}]));
  try{await f.authorize();const d=await f.wait();assert.deepEqual(d.activities.map(a=>a.id).sort(),['1','3']);const u=new URL(f.calls.find(c=>c.url.includes('/athlete/activities')).url);assert.ok(Number(u.searchParams.get('after'))>Date.parse('2026-05-05T00:00:00Z')/1000);assert.equal(d.historyWindow.start,'2026-05-07');}finally{await f.close();}
});
test('detail/stream backfill retains requested training data, excludes location, and is isolated by session',async()=>{
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):url.includes('/athlete/activities')?reply([record(10)]):url.includes('/streams?')?reply({...sampleStreams(),latlng:{data:[[1,2],[3,4],[5,6]]}}):reply({...record(10),athlete:{id:77},device_watts:true,average_watts:200,device_name:'Trainer',laps:[{name:'Steady',elapsed_time:20,average_watts:200,average_heartrate:125}]}),{autoEnrich:true});
  try{await f.authorize();const d=await waitDetails(f);assert.equal(d.enrichment.ready,1);assert.equal(d.activities[0].sensors.power.source,'device');assert.equal(d.activities[0].signals.power.mean,190);assert.equal(d.activities[0].sensors.laps[0].averageBpm,125);assert.ok(!JSON.stringify(d).includes('latlng'));assert.ok(!JSON.stringify(d).includes('private-notes'));const streamCall=f.calls.find(c=>c.url.includes('/streams?'));assert.ok(!streamCall.url.includes('latlng'));}finally{await f.close();}
});
test('collection uses bounded batches and resumes pending activities',async()=>{
  const rows=Array.from({length:25},(_,i)=>record(i+1));
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):url.includes('/athlete/activities')?reply(rows):url.includes('/streams?')?reply(sampleStreams()):reply({...record(Number(new URL(url).pathname.split('/').at(-1))),athlete:{id:77},device_watts:true}),{autoEnrich:true});
  try{await f.authorize();let d=await waitDetails(f);assert.equal(d.enrichment.ready,10);assert.equal(d.enrichment.pending,15);await f.integration.tick();d=await waitDetails(f);assert.equal(d.enrichment.ready,20);await f.integration.tick();d=await waitDetails(f);assert.equal(d.enrichment.ready,25);assert.equal(d.enrichment.pending,0);}finally{await f.close();}
});
test('a rate-limited stream request preserves its completed details and resumes without re-fetching them',async()=>{
  let limited=true,detailCalls=0;
  const f=await fixture(url=>{if(url.endsWith('/oauth/token'))return reply(tokens({expires_at:(epoch+3*86400000)/1000}));if(url.includes('/athlete/activities'))return reply([record(10)]);if(url.includes('/streams?'))return limited?reply({},429):reply(sampleStreams());detailCalls++;return reply({...record(10),athlete:{id:77},device_watts:true});},{autoEnrich:true});
  try{await f.authorize();let d=await waitDetails(f);assert.equal(d.activities[0].enrichment.details,'ready');assert.equal(d.enrichment.pending,1);assert.ok(d.retryAt);const n=f.calls.length;await f.integration.tick();assert.equal(f.calls.length,n);limited=false;f.advance(16*60000);await f.integration.tick();d=await waitDetails(f);assert.equal(d.enrichment.ready,1);assert.equal(detailCalls,1);}finally{await f.close();}
});
test('unavailable streams remain explicitly missing instead of creating zero-valued signals',async()=>{
  const f=await fixture(url=>url.endsWith('/oauth/token')?reply(tokens()):url.includes('/athlete/activities')?reply([record(10)]):url.includes('/streams?')?reply({},404):reply({...record(10),athlete:{id:77}}),{autoEnrich:true});
  try{await f.authorize();const d=await waitDetails(f);assert.equal(d.enrichment.unavailable,1);assert.equal(d.enrichment.pending,0);assert.equal(d.activities[0].signals,undefined);}finally{await f.close();}
});
