# Cadence — personal cycling coach

Source repository: [Leosantosnunes/CyclingTraining](https://github.com/Leosantosnunes/CyclingTraining) (private). The local Node server remains the launch target; connecting GitHub does not deploy the app or synchronize browser training records.

A local, dependency-free prototype built from `AGENTS.md`. It offers a seven-day proposal, goals and availability onboarding, workout steps, manual activity entry, recovery feedback, preserved workout prescriptions, locks, explained revisions, and undo for future unlocked sessions. **Live personal Strava REST OAuth, the six-month summary scan, initial detail/stream batches, and the connected per-ride sensor view have been verified.** Detailed backfill continues under provider rate limits; verification of initial batches does not mean every stream has been collected. Local deterministic coaching uses actual records and collected sensor observations in a separate temporary workspace. Authorization and temporary API data do not persist across server restarts; derived plans also clear on browser reload.

## Launch

Install Node.js 22 or newer, then run in this directory:

```powershell
npm start
```

Open **http://localhost:3000**. No `npm install`, account, API key, database, or environment file is needed. Stop with Ctrl+C. To change the port in PowerShell:

```powershell
$env:PORT = '3001'
npm start
```

Use the same hostname and port to keep access to the same saved browser data. `localhost` and `127.0.0.1` have separate browser storage. The server binds only to loopback; it is not a production or shared-user service.

## Strava verification and blocker

Reviewed **November 7, 2026** against [Strava’s official connection guide](https://support.strava.com/en-us/articles/15401531-how-do-i-connect-strava-to-an-ai-assistant), [API policy](https://www.strava.com/legal/api_policy), and [API/MCP FAQ](https://support.strava.com/en-us/articles/15401526-strava-api-and-mcp-faq).

The official MCP is a supported path for a subscriber’s personal analysis of their own activity history. Its documented endpoint is `https://mcp.strava.com/mcp`. It uses OAuth and is read-only. The guide currently names Claude and Gemini; Gemini availability is documented as US-only.

**This local app and the development session have no authenticated Strava MCP connection.** The published guide does not establish eligibility or a tool contract for this browser client. An external assistant’s connection does not transfer to this app. The Connections screen distinguishes the official MCP handoff from the separate personal REST integration described below. REST connection status only changes after a successful OAuth exchange; it never implies MCP access.

Policy §3.5 describes the personal-use MCP exception. §5.3 restricts AI use of ordinary API data; §5.16 prohibits unauthorized MCP proxies. The personal REST connection is not an MCP substitute or API-to-AI pipeline. At the rider's explicit request, this personal prototype now also processes summaries through local deterministic planning rules. This does **not** establish that Strava permits API analytics/coaching; its restrictions remain unresolved. No API records are sent to an AI service. Do not represent the prototype as an approved Strava coaching integration or release it as such without resolving the use restrictions.

For the external MCP connection, follow the official guide. Revoke external assistant access in Strava Settings → My Apps. This app cannot revoke an external assistant’s authorization. Neither integration uploads workouts to Strava.

### Your REST API application configuration

Client ID **90597** has been supplied for your application. `.env.example` documents the server configuration; `.env` is ignored by Git and excluded from the static server's allowlist. Startup reads it with Node's native environment-file loader. Existing process environment variables take precedence. Keep the file on your own device; Git exclusion does not encrypt it.

If `.env` is absent, copy `.env.example` to `.env`. In your editor, set `STRAVA_CLIENT_SECRET` to the client secret from your Strava API application settings. Do not put access/refresh tokens in frontend files, browser storage, or chat. Never overwrite an existing `.env` when copying the example.

After saving `.env`, restart the server, open **Connections**, and select **Connect with Strava**. In your Strava developer application settings, use authorization callback domain `localhost`. The callback is `http://localhost:3000/api/strava/callback` (or the port on which you launched the server). Strava’s OAuth documentation explicitly allows localhost callbacks. Complete authorization yourself on Strava’s page. Grant `activity:read_all` for read-only access including Only You activities; no write or profile scopes are requested. The client secret is sent only server-to-server to official Strava OAuth endpoints; it is never included in the authorization URL or returned to the browser.

Once authorized, the server retrieves only the last **six calendar months** (May 7–November 7, 2026 on the setup date), deduplicates activity IDs, and displays them in Ride history. Activity summaries include available HR, power, cadence, elevation, temperature, timing, and device-power provenance. A queued backfill obtains details, laps, and available training streams. GPS, maps, notes, and raw provider responses are discarded. Summary scan completion and detailed collection completion are separate statuses. See [docs/SENSORS.md](docs/SENSORS.md) for the complete data contract, rate-limit behavior, analysis methods, and limitations.

**Automatic sync:** the running server checks recent activities every 15 minutes and reconciles the entire six-month window at least daily when requests succeed. It independently processes detail/stream jobs in batches of at most 20 requests, continuing on a minute timer. Strava rate-limit headers pause and resume the queue; incomplete records remain pending. Successful detail work is reused when its stream request is delayed. Unavailable data is distinct from failed requests and zero measurements. Failed jobs can be retried from Connections or the assessment card. Backdated activities and older edits/deletions within six months are reconciled in a full scan. There is no public webhook endpoint or durable queue across server restarts.

**Credential lifetime:** access/refresh tokens and API training data live only in Node process memory, isolated by an HttpOnly SameSite cookie. They are not written to disk, `localStorage`, plan revisions, or JSON exports. Tokens are refreshed and rotated server-side. Restarting the server or reaching the seven-day session expiry requires reconnecting. This intentionally avoids an unencrypted token file; persistent authorization across restarts would require an OS credential vault or managed secret store. Protect the device and process memory. Session cookies use local HTTP; do not expose this server on a LAN or public network.

**Disconnect & delete API data** clears this session’s tokens and records, then calls Strava’s recommended OAuth revoke endpoint. If revocation cannot be confirmed, the UI directs you to My Apps; local deletion still succeeds. Revocation affects the app’s authorization for that athlete, including other sessions of the same API app. Restart/expiry drops local tokens but does not revoke the provider grant. Existing MCP connections are independent.

**Coaching permission remains unresolved.** A client ID, secret, and successful OAuth exchange do not establish approval for analytics, AI use, or persistent archives (§§5.3–5.5). Local deterministic analysis and planning is a personal experimental feature requested by the rider; it must not be described as officially permitted. Synthetic/manual inputs are kept in a separate workspace. No application setting has been changed on Strava by this code.

### Connected history and the return from recovery

While connected, **Ride history** defaults to the actual Strava records and the planner uses a separate memory-only Strava workspace. Sample records are never mixed in. Activity details expose summary metrics, available sensor evaluations, laps, signal plots, missing-data/quality findings, and whether the ride contributed to the baseline. Refreshes update history on every view; an accepted plan is not silently rewritten. Preview a new proposal to incorporate changed records. Disconnect or session expiry removes the temporary workspace. Local storage and exports explicitly reject/exclude Strava records, derived plans, feedback, evidence, and revisions. **Reloading the browser also clears the accepted Strava proposal**; profile inputs remain saved. This is an explicit temporary-workspace limitation, not durable coaching storage.

The rider reported that their recovery week ends **Sunday, November 8, 2026**. This personal default is visible and editable under Goals & availability → Listen to your body. The first return-week proposal runs **Monday, November 9–Sunday, November 15**. Observations stop on the actual current local day, independently of future workout dates. For that first return week, usual riding volume uses the four weeks ending **November 1**, excluding the deliberate recovery week of November 2–8. Poor recovery feedback still reduces the next week; a calendar date does not establish readiness. Completed and locked prescriptions are preserved and missed training is never stacked.

The rider subsequently requested **12–13 hours/week**. The personal setup now targets **12 hours (720 minutes)** for the first return week, with an editable assumed schedule: Monday rest, Tuesday–Thursday 100 minutes each, Friday 60, Saturday 240, Sunday 120 (revised by the rider). The rider confirmed this revised distribution. Review any changes before accepting a new proposal. The current goal is overall development toward road/criterium racing from May 2027; the first cycle uses a general aerobic focus. Previously accepted prescriptions remain preserved until a new proposal is accepted. The planner allows a requested increase only with sufficient consistent history, bounds it at 5% above the baseline, and still applies recovery and capacity constraints. This percentage is an unvalidated prototype safeguard. Other exercise already present in the baseline is not counted twice; increases above baseline reserve additional time. Consecutive easy days can be used for this explicit target; purposeful work now follows the separate Coach intake and readiness rules in [docs/COACH.md](docs/COACH.md). The target and schedule are visible and editable in Goals & availability.

The assessment combines recorded training exposure with actual collected sensor observations: measured versus estimated power, HR/power coverage, observed sustained-power benchmarks, monthly volume/measured work, eligible steady power/HR comparisons, recorded laps, quality flags, and dated FTP references if supplied. It does not invent FTP, HR zones, VO2max, diagnoses, or a validated fitness score. Device-reported power is identified by the provider flag, not independently calibrated. Partial backfill and unequal efforts limit comparisons. The specific calculations and their evidence/limitations are documented in [docs/SENSORS.md](docs/SENSORS.md).

## Try the workflow

1. Explore the **clearly labeled synthetic** example. These are fictional rides, not estimates of your history.
2. Choose **Use my own rides**. This removes sample rides and sample plan history to prevent contamination of personal recommendations.
3. Record recent rides and other exercise in **Ride history**. Duration is required; distance and effort are optional. No sensors or FTP test are necessary. Existing activities can be deleted; mistakes can be deleted and recorded again.
4. Set your goal, recent riding, available minutes per day, rest days (`0`), timezone, equipment, and recovery in **Goals & availability**. Preview and accept your proposal.
5. Open a day for its purpose, steps, watt targets when configured, and easier option. Lock sessions if needed. On or after the day, record completed, partial, modified, or skipped outcomes. Match an existing same-day ride to avoid recording it twice.
6. Preview changes after feedback, new rides, or availability updates. Nothing auto-stacks missed workouts. Conflicts block acceptance. Use **Plan journal → Undo** to reverse future unlocked prescriptions while retaining outcomes and current settings. Connected Strava mode uses the same preview/accept/undo flow in its temporary workspace.

In example mode, any recorded outcomes remain synthetic. Use manual mode or connected Strava mode for personal activity. Planning dates use your selected IANA timezone; original activity-local dates stay visible in the history table. Creation/feedback/revision timestamps use UTC. The UI proposes a Monday–Sunday week, starting after any active stated recovery week. An accepted old week remains available until you review a new one.

## Architecture and data

- `public/engine.js`: pure planning, date arithmetic, activity analysis, validation, explicit versioned policy.
- `public/sensors.js`: calendar window, selected sensor fields, time-weighted analysis, continuous power benchmarks, conditional power/HR comparisons, and overall sensor coverage.
- `public/storage.js`: schema validation, optimistic revision check, bounded revision history, idempotent acceptance.
- `public/integrations.js`: official MCP capability metadata, separate from REST.
- `lib/strava.mjs`: server-only personal OAuth, ephemeral sessions, token refresh, rate-limit backoff, six-month activity/detail/stream collection, resumable rate-limited backfill, scheduled sync, and revocation.
- `public/app.js`: accessible native forms, dialogs, local state, daily view, history, and explanations.
- `public/model.d.ts`: domain vocabulary and implemented schema, including unsupported integration states.
- `server.mjs`: Node static server with a file allowlist, loopback binding, hostname checks, CSP, and no sensitive request logging.

Data lives in browser `localStorage` under `cadence.personal.v1`. Saves are validated; unreadable data is preserved and can be exported or explicitly deleted. Concurrent-tab changes are rejected by a revision check. This is not a transactional multi-user database: avoid editing in multiple tabs simultaneously. Repeated proposal IDs have no repeated effect within the most recent 100 events. Activities are separate from prescriptions, and matches use activity IDs. Accepted prescription targets are preserved snapshots; later FTP edits do not recompute their watts.

**Privacy:** no telemetry, remote fonts, AI requests, or third-party ride transfers. REST OAuth communicates only with Strava. Browser coaching data is not encrypted; protect the browser profile and device. Data & privacy provides JSON export and configurable retention (30/90/365 days) for manual/synthetic activities. REST data is never included in those exports; its separate server-memory cache expires with its session within seven days. Activity retention is applied on load and setting changes; coaching plans/revisions remain until explicit deletion. Exports and browser backups need separate handling. There is no JSON/archive import endpoint.

## Planning limits and rationale

See [docs/PLANNING.md](docs/PLANNING.md). This is a conservative, **unvalidated prototype**, not a physiological model or medical clearance service. It never infers FTP, fitness improvement, or event readiness. Sensor zones, training-intensity progression, individualized intervals, advanced periodization, instant webhooks, durable Strava-derived coaching storage, rescheduling by drag/drop, account/cloud storage, and production deployment are not implemented. Event and racing goals receive easy foundation work with a visible limitation, rather than invented goal-specific capacity. Health messaging and consequential policy need qualified review before production.

## Verification

```powershell
npm test
npm run check
```

Tests cover representative planning constraints, arithmetic, recovery, preservation/undo, timezones, persistence, and server security. Sensor tests cover irregular samples, zero/missing/estimated power, gaps, measured benchmarks, conditional power/HR change, six-month boundaries, partial coverage, and provenance. Mock-provider integration tests also cover OAuth state, CSRF, granted scopes, callback replay, session isolation, pagination/deduplication, token rotation, automatic checks, deletion reconciliation, revocation, rate limits, outages, expiry, and exclusion of credentials and sensitive upstream fields. Mocks never use your real credentials. These checks establish software behavior, not training effectiveness. Real provider authorization and retrieval require you to complete OAuth; they must not be inferred from mock tests.

Official REST references: [OAuth and revocation](https://developers.strava.com/docs/authentication/), [activity-list endpoint](https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities), [rate limits](https://developers.strava.com/docs/rate-limits/), [webhooks](https://developers.strava.com/docs/webhooks/).

### Connection troubleshooting

If the browser returns from Strava but the app reports that authorization could not finish, check the Node server's outbound access to `https://www.strava.com`. A browser reaching Strava does not prove the server can reach the token endpoint. In restricted development environments, the local server may need execution approval for network access. Do not disable TLS verification or copy credentials into browser code. After fixing connectivity and restarting if necessary, start a fresh Connect with Strava flow; consumed authorization codes and expired OAuth state cannot be replayed. A failed token exchange does not schedule automatic retries until an authorized session exists.

The verified setup instance uses `http://localhost:3001/#connection` because another local app instance already occupied port 3000. Use that origin for its session; starting a different server or switching origins creates a separate session.

## Evidence-informed Coach

Coach 2.0 adds a dated readiness intake, cycle focus, strength-day scheduling, distinct endurance/recovery/long/quality sessions, optional preserved FTP-based watt references, intensity-coverage limits, and a conditional four-week outline. Read [docs/COACH.md](docs/COACH.md) for the 2025–2026 evidence and the separation between research findings and configurable prototype decisions. Review a fresh proposal to replace an older accepted plan. Unknown thresholds remain unknown; a 20-minute best is not silently converted to FTP.

The Coach intake now saves user-entered profile inputs independently when **Save inputs & preview proposal** is used. Accepting the proposed workouts remains a separate action. A live connected Coach 2.0 preview and its per-workout disclosures have been verified; the sensor backfill reached all cycling records during that verification. These observations do not validate physiological effectiveness.

## Manual computer / trainer setup

Coach 2.1 uses watts as the primary prescription when a current supplied FTP and power equipment are present. Each workout shows an ordered table with step duration, fixed trainer watts, outdoor watt range, and cumulative elapsed time. Enter a Cycling workout, choose Time for each step and Custom Power in watts for the target, and advance steps automatically by time. All repetitions are expanded; warm-up, recoveries, and cool-down count toward total duration. Sensor-free riders keep the existing RPE alternative.

Optional per-workout downloads provide `.txt` setup instructions and Zwift `.zwo`. These are user-initiated prescription exports; history, source activity IDs, notes, locations, and tokens are excluded. They do not enable archive export of Strava activity data or establish Strava permission for coaching. Zwift files store FTP-relative targets: set its FTP to the workout snapshot and intensity to 100% to reproduce the displayed watts. Import has not been verified on a physical computer or live trainer. Direct synchronization and FIT export are not implemented.

## Strength room

Open **Strength room** in the sidebar for separate Thursday and Sunday sessions. Confirm gym equipment, recent lifting, restrictions, and gym time, then preview and accept the two prescriptions. Each exercise has sets/reps, rest, technique cues, load-selection guidance, substitutions, and cycle-coordination advice. Record actual completion and next-day recovery separately; future outcomes are disabled. Pain/recovery feedback affects future proposals without silently changing accepted cycling workouts.

Strength inputs, prescriptions from those inputs, and manual feedback persist locally, including when connected to Strava. No imported activity history enters this local strength record. Review [docs/STRENGTH.md](docs/STRENGTH.md) for evidence, exact current templates, assumptions, storage limits, and the distinction between reported weights and working loads.
