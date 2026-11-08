# Strength room · strength-1.0

The room contains separate Thursday and Sunday strength prescriptions, not additional cycling workouts. Dates follow the rider's IANA timezone and selected Monday-start week. The reported 45–60 minutes per gym visit are **additional** to cycling availability. The first proposal uses a 45-minute ceiling for each visit and may leave time unused.

## Evidence and implementation choices

The [2026 cyclist-strength meta-analysis](https://pubmed.ncbi.nlm.nih.gov/40632222/) supports strength work alongside cycling for some performance outcomes; it does not establish this individual's ideal exercises, weights, or response. The [October 2026 practical review](https://pmc.ncbi.nlm.nih.gov/articles/PMC13633594/) discusses regular strength work and managing concurrent sessions. Separating riding and lifting by about three hours when practical is a contextual suggestion with substantial evidence from non-cyclist populations, not a guarantee of recovery.

The specific exercise selection, set reductions, time allowances, and lighter Sunday are versioned prototype decisions requiring qualified review. Sunday follows Saturday's long ride, so it uses less lower-body volume. These introductory sessions do not claim to reproduce a heavy-strength trial or promise a physiological improvement. Cycling FTP is never converted into a lifting weight, 1RM, or strength level.

## Current full-gym, experienced-rider templates

Thursday A: familiar squat 3 × 5, controlled step-up 2 × 5 each leg, standing calf raise 2 × 8, dead bug 2 × 6 each side. Sunday B: familiar supported/Smith Bulgarian split squat 2 × 5 each leg, bodyweight glute bridge 2 × 10, seated cable row 2 × 8, side plank from knees 2 × 20 seconds each side. Warm-up, rehearsal sets, rest periods, movement cues, substitutions, and cool-down are specified in the room. Bodyweight/home options remain available.

The rider reported squats reaching **150 lb total including the bar**. That is a reported reference, not the prescribed working load or a tested maximum. Other numbers originally referred to one side; total implement loads and whether the top squat set was near maximum remain uncertain. Notes preserve this distinction and their original units. There is no automatic conversion or addition of another bar weight.

Start below the heaviest reported load and choose a familiar load that leaves at least three clean repetitions available at the end of each set. No grinding, maximum testing, or sets to failure are prescribed. Lifting load cannot responsibly be specified in watts; cycling prescriptions remain in watts. First repeat the prescription, then review the smallest available weight increase only if technique and next-day recovery support it. No automatic progression.

## Responsibility and persistence

- Equipment, experience, separate gym availability, and restrictions need confirmation before accepting a week. Unknown inputs show a labeled draft. Restrictions pause prescriptions.
- Exercise-block times include setup and rests; the sum plus warm-up/cool-down fits the selected time. These are estimates, not instructions to rush. Limited time drops whole movements rather than cutting required rest invisibly.
- Save settings, preview, accept, and undo future changes are separate actions. Versions and original prescriptions are retained. Completed/past prescriptions survive regeneration and undo. Week selectors keep previous accepted sessions accessible.
- Outcomes are separate manual records: completed, partial, modified, skipped; actual minutes; soreness; pain; and actual exercises/weights or modifications. A future session cannot be recorded through the UI. Duplicate outcome IDs are rejected. Imported Strava weight-training summaries do not automatically complete these sessions or get duplicated as another activity.
- Reported pain pauses automatic training through the existing restriction workflow. High soreness sets recovery to poor. Future cycling changes require a fresh preview and acceptance; accepted cycling prescriptions do not silently change. This is not an injury diagnosis.
- The strength room stores only user-entered strength setup, prescriptions from those inputs, and manual feedback in local browser storage, including while Strava mode is active. No Strava activities, IDs, HR/power samples, or API-derived coaching evidence are copied into it. It survives reload/disconnect; browser storage is unencrypted. Existing local-data export/deletion includes this room. History is bounded to 52 prescription versions and 500 manual outcomes.

Validation/tests cover gym and sensor-free variants, time arithmetic, restrictions, unknown inputs, recovery reductions, completion preservation, undo, immutable workspace copies, and malformed stored prescriptions. Software checks do not validate exercise technique or training effectiveness. In-person coaching remains appropriate for unfamiliar loaded movements.
