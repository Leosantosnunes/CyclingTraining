# Six-month training data and signal evaluation

This is a personal, local prototype. Strava's API use restrictions for analytics/coaching remain unresolved; successful OAuth is not approval. Nothing here is a medical diagnosis, validated fitness score, or claim of physiological effectiveness. Consequential policies and health messaging need qualified review before production.

## Collection scope

The rolling window is six **calendar** months ending on the current rider-local day: on November 7, 2026 it is May 7–November 7. Month-end dates clamp to the last valid day, including leap years. `STRAVA_TIMEZONE` defaults to `America/Toronto`. The API query uses a boundary buffer and results are filtered to the exact local-date window; older/future records are discarded and out-of-window cached records are pruned.

The server collects the authenticated athlete's activity summaries, detailed activity records, and available streams with `activity:read_all` authorization:

- Original/local timestamps, moving/elapsed time, distance, elevation, speed, cadence, trainer/commute/manual flags, and provider workout tag.
- Recorded average/peak HR, average/peak/weighted power, device-power flag, mechanical work, provider-estimated calories, and provider relative effort where available.
- Device name and recorded lap timing, distance, average power/HR/cadence.
- `time`, `watts`, `heartrate`, `cadence`, `velocity_smooth`, `distance`, `altitude`, `temp`, and `moving` streams when exposed by Strava.

GPS coordinates, routes, maps, descriptions, notes, and raw provider responses are not retained. Complete raw streams are processed then discarded. Compact samples, histograms, descriptive statistics, quality findings, and benchmark provenance stay in the temporary server cache and browser memory. They are excluded from local storage and exports. Session expiry, disconnect, or server restart clears the server cache; browser reload clears the derived coaching workspace. Device-reported power is identified using Strava's `device_watts` flag; that does not verify meter calibration or prove the absence of virtual/estimated device behavior.

## Rate-limited backfill

Summaries become visible before detailed collection finishes. Newest activities are processed first. Each batch is capped at 20 detail/stream requests; a minute timer continues pending work. Provider rate-limit headers pause the queue until the indicated window resets. A successful details request is retained if its following stream request is rate-limited. Daily summary reconciliation discovers older edits/deletions within the six-month window. Unchanged records reuse their processed data; changed summaries invalidate that record's detail work.

Progress distinguishes ready, pending, unavailable, and failed records. A 404/403 stream response is unavailable, not zero power or zero effort. Temporary failures get up to three attempts; failed jobs can be explicitly retried. A 401 clears authorization and cached records. Collection may take multiple rate-limit windows; the app must not present an incomplete backfill as a complete assessment. Keep the server running. There is no durable backfill queue across restarts in this version.

## Calculation methods and limits

Rules and validation bounds are explicit in `SENSOR_POLICY` (`signals-1.0`). Validation bounds are recording-quality limits, not human safety limits or medical judgments.

1. **Time weighting:** adjacent sample timestamps define interval durations. Each valid interval uses the preceding sample (a stepwise-hold assumption). Intervals over 30 seconds and invalid values are excluded; no long gap is filled. Missing HR is never converted to zero; recorded zero watts remains coasting. Moving flags restrict descriptive means to active intervals; when flags are absent the app explicitly states that recorded elapsed intervals were used.
2. **Continuous power benchmarks:** the best observed 5-second, 1-, 5-, and 20-minute means are computed from cumulative work across candidate interval boundaries. Windows require complete valid coverage. Sample intervals must be no larger than one-fifth of the effort duration, capped at 30 seconds, so sparse recordings cannot produce invented short sprint benchmarks. Estimated or unconfirmed power does not enter measured-power benchmarks. A 20-minute best is not converted into FTP.
3. **Mechanical work:** integrate valid device-reported watts over time and divide joules by 1,000. This is not metabolic energy expenditure. Calories and Strava weighted power/relative effort retain their provider labels; weighted power is not relabeled as normalized power.
4. **Power-to-HR change:** compare the power/HR ratio in two equal-duration halves of paired active recordings. The prototype requires at least 30 minutes of paired data, at least 80% paired active coverage, power coefficient of variation no greater than 0.15, and half-to-half mean power within 10%. These are unvalidated screening filters. Variable rides, missing HR, and estimated power get no ratio interpretation. A positive change can reflect heat, hydration, fatigue, pacing, terrain, and recording quality; no pass/fail fitness threshold is applied.
5. **Threshold references:** with a supplied, dated FTP no older than 90 days, cycling power histograms can report approximate recorded time above that current reference (1 W rounding). This does not establish the threshold that applied on the historical date. No FTP, maximum HR, lactate threshold, power zones, HR zones, VO2max, or disease is inferred automatically.
6. **Overall picture:** show sensor coverage, monthly riding volume and collected measured work, six-month power benchmarks with activity IDs/dates, last versus previous 28-day observed 20-minute benchmarks, and the number of eligible steady comparisons. Partial months and incomplete collection are labeled. Differences in attempted efforts, indoor/outdoor setting, temperature, and sensor coverage prevent treating a higher observed best as proof of improved fitness.

The weekly proposal retains the rider's stated recovery week through November 8 and requested 12-hour return-week target. Sensor observations enter the rationale, uncertainty, and the explicit Coach intensity-coverage decision. Purposeful sessions also require rider intake/readiness; signals do not replace threshold measurements or override availability/recovery constraints. See COACH.md. Future plans still require preview and acceptance.

## Sources

The collection contract follows the official [Strava API reference](https://developers.strava.com/docs/reference/), [OAuth documentation](https://developers.strava.com/docs/authentication/), and [rate limits](https://developers.strava.com/docs/rate-limits/).

The contextual limitation on interpreting power/HR drift follows [TrainingPeaks' explanation of steady-effort decoupling](https://help.trainingpeaks.com/hc/en-us/articles/204071724-Aerobic-Decoupling-Pw-Hr-and-Pa-HR-and-Efficiency-Factor-EF). The custom filters and ratio here are transparent prototype calculations, not a claim to reproduce TrainingPeaks' proprietary metrics or validate fitness.
