# Coach 2.1: evidence, decisions, and limits

Reviewed November 7, 2026. This is a deterministic personal prototype, not a validated individualized physiology model. Training algorithms remain separate from OAuth, storage, and rendering. No LLM receives API data or chooses tool actions. Strava's unresolved analytics/coaching permission limitation still applies; successful OAuth is not official approval.

## What the evidence supports

- [Rosenblat et al., 2025, individual-participant network meta-analysis](https://www.stir.ac.uk/research/hub/publication/2095779): 13 studies, 348 endurance athletes. Polarized and pyramidal approaches did not differ overall for VO2max or time-trial performance. Subgroup findings and unequal populations limit a universal prescription. This supports individualization, not a mandatory 80/20 quota.
- [Li et al., 2026, Bayesian network meta-analysis](https://pubmed.ncbi.nlm.nih.gov/42171506/): no distribution had a definite advantage over polarized training when uncertainty intervals were considered. Rankings do not establish superiority for an individual rider. The Coach therefore does not optimize to a purported universally best distribution.
- [Mateo-March et al., 2026, WorldTour observations](https://pmc.ncbi.nlm.nih.gov/articles/PMC13217385/): most observed riders used a pyramidal distribution before competition. This describes professionals; it does not establish causal effects or justify copying professional volume.
- [Seiler et al., 2013, recreational-cyclist randomized trial](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1600-0838.2011.01351.x): interval intensity and accumulated work duration interacted. This supports tracking both, not treating any hard session as equivalent. The Coach's small introductory interval doses do not reproduce this study or inherit its effect sizes.
- [Mølmen et al., 2025, cyclist interval-block study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12575440/): moderate and high-intensity blocks both produced improvements in studied riders. Small, predominantly young male samples, fixed ordering, withdrawals, and supervised training limit application to an individual. The app does not copy concentrated interval blocks.
- [Saw et al., systematic review](https://pubmed.ncbi.nlm.nih.gov/26423706/?dopt=Abstract): regular subjective well-being adds useful response information. The app asks about fatigue, soreness, sleep, and motivation alongside recorded training; it does not diagnose readiness from HR alone.
- [2025 FTP construct-validity study](https://www.open-access.bcu.ac.uk/16282/1/964-Article%20Text-5462-1-10-20250711.pdf): a short performance test is not an interchangeable physiological threshold or guaranteed hour power. The app never converts a 20-minute best to FTP automatically.

## Inputs and actual decisions

Only the last six calendar months enter the sensor assessment. Summary duration, consistency, longest ride, and other exercise establish recent exposure. Processed device-power histograms can classify substantial work above a supplied **current** FTP reference. Session RPE can also classify demanding rides. Missing, estimated, stale, or pending observations remain unknown. Historical FTP may differ; this is not a reconstruction of historical physiological zones.

Best efforts, mechanical work, HR, cadence, laps, temperature, and steady power/HR comparisons provide descriptive context and quality warnings. They do not all independently change prescriptions. In particular, higher HR, a power/HR ratio change, or a higher observed best never automatically triggers more training. There is no CTL/ATL/TSB, TRIMP, TSS, VO2max, race-category, or diagnosis claim. Sample processing details are in [SENSORS.md](SENSORS.md).

The intake records a specific cycle focus, a Monday start, interval experience, a dated readiness check-in, actual daily availability, and strength days. A confirmed current check-in and established riding are prerequisites for purposeful intervals. Sparse history, restrictions, poor feedback, stale check-ins, or inadequate readiness suppress intervals. Lack of FTP permits RPE-based training; it does not require an all-easy plan indefinitely.

The Coach assigns:

| Session | Purpose | Initial work prescription |
| --- | --- | --- |
| Aerobic endurance | Comfortable volume between demanding work | Full-sentence effort, RPE 3 |
| Long endurance | Duration-specific durability within recent longest-ride capacity | Conversational, RPE 3 |
| Recovery spin | Light optional riding; rest remains an alternative | RPE 2 |
| Controlled tempo | Controlled sustained work for a general/endurance cycle | 2 × 8 minutes, RPE 6; 3-minute easy separation |
| Sustained power | Sustained climbing/racing demands | 2 × 8 minutes, RPE 7; 3-minute easy separation |
| High aerobic | Repeatable harder work for experienced race-focused riders | 4 × 3 minutes, RPE 8; 3-minute easy separations |

Quality sessions include a 15-minute warm-up, 10-minute cool-down, and only easy filler. Every step is ordered and arithmetic is validated. No all-out testing is added automatically. These initial doses are product choices informed by broader evidence, not trial-proven optimal prescriptions for this rider.

## Explicit policy choices

`POLICY` and `COACH_POLICY` in `public/engine.js` are versioned. Exact numbers below are **unvalidated configurable safeguards**, not universal sports-science boundaries:

- At most two quality sessions per week. Start with at most one when recent intensity coverage is incomplete or new quality work is being introduced. Two requires reported experience and adequate classified recent exposure.
- Keep at least two local calendar days between quality sessions and away from a long ride or reported demanding exercise/strength days. Calendar-day spacing is not an exact elapsed 48-hour guarantee across timezones/DST.
- Limit newly prescribed RPE 5+ interval work to 10% of allocated ride minutes. This is not an 80/20 zone model; session count, work minutes, power zones, and HR zones are different quantities.
- Do not increase requested volume and quality frequency together. If quality exposure cannot be established, hold volume at or below the usual baseline while introducing one session. This can defer a requested 12–13-hour target.
- Volume remains bounded by actual slots, recorded capacity, and the existing explicit 5% requested-progression cap. Warm-up/cool-down count inside the slot. No missed-work catch-up.
- Fatigue/soreness 4–5, sleep 1–2, poor recovery, or recent poor completion feedback reduces volume to 60% and removes new demanding work. Motivation below 3 or milder concerns also suppress intervals. These screening cutoffs are product choices, not medical tests.
- A check-in expires after seven days. The provisional four-week outline includes a lighter fourth week and requires a new cycle review afterward. Weeks 2–3 have no automatic progression: execution, feedback, availability, and actual records must be reviewed first.

An FTP no older than 90 days plus reported power equipment selects primary watt prescriptions with a fixed setpoint and outdoor range. RPE descriptions in the dose table apply to the sensor-free fallback only. Easy 55–70%, recovery 40–55%, tempo 80–87%, sustained 90–95%, and high aerobic 105–115% are prescription references, not measured lactate/ventilatory domains. The rider may reduce or stop a session when recovery changes. Watts remain the primary target. Each step stores watts, percentages, threshold watts/date, and method; the workout stores the threshold version. Later FTP edits do not mutate accepted prescriptions. Estimated maximum HR is context only and never establishes HR zones. W/kg labels distinguish a supplied FTP estimate from a recorded duration-specific best, and depend on estimated body mass.

Strength sessions can coexist with easy riding; days marked unavailable/other demanding exercise remain protected from cycling. The current system does not prescribe gym sets or model strength/cycling interference quantitatively. Unusual gym loading needs rider review.

## Cycle and delivery boundaries

For a May racing goal, the first cycle develops general aerobic consistency and controlled sustained work; exact race preparation awaits discipline, event dates, and subsequent response. Only one week receives actual prescriptions. The four-week outline is conditional, and a longer season roadmap is not an automatic six-month workout schedule.

Completed and locked workouts remain unchanged; conflicts block acceptance when preserved work violates new limits. Power-only changes appear in previews. Acceptance and undo retain prescription history. Live Strava records and derived plans remain temporary and excluded from browser persistence and archive export. Explicit per-workout downloads now allow only the prescription and its threshold reference, without API activity fields or evidence. Profile inputs can persist locally; restarting the server still requires reconnecting.

Before production: obtain integration permission, independent qualified review of consequential training rules and health messaging, stronger private storage and durable consented data lifecycle, and prospective outcome validation. Passing software tests demonstrates constraints and arithmetic, not physiological effectiveness.

## Device-ready step specification

Coach 2.1 stores `unit: W`, an integer target, easy/work classification, the permitted watt range, percentages, and the original FTP snapshot for every watt-based step. The fixed setpoint is the rounded midpoint of the prescribed rounded watt range. Computer/trainer tables show time durations and cumulative elapsed times with all repeats expanded. Quality classification uses the step intensity, so a numerical watt value is never mistaken for an RPE value. Legacy accepted RPE workouts remain readable and unchanged.

Optional `.txt` and `.zwo` exports validate duration and consistent FTP snapshots. ZWO uses a sequence of timed SteadyState elements with watt/FTP ratios. XML text is escaped. Import requires the same FTP and 100% workout intensity. Format behavior is informed by [Garmin workout documentation](https://developer.garmin.com/fit/articles/file-types/workout.html) and [Zwift workout-file examples](https://forums.zwift.com/t/average-power-needed-for-workout-intervals/523650). Software tests verify steps, order, arithmetic, units, repeat expansion, XML targets, privacy exclusions, and preserved prescriptions; physical device/trainer imports remain unverified.
