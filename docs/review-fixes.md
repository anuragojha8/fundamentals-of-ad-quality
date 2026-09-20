# Review fixes and handoff

Updated 20 September 2026. Companion to [Cursor's review](suggested-improvements.md). This file records changes to the live book so Claude or another editor can continue without repeating resolved work. The review is a snapshot of an older baseline, not a list of current defects.

## Resolved in this pass

| Review item | What changed | Where |
| --- | --- | --- |
| P0: auction value, billing and goals | Distinguished `bid × pCTR` score from clearing-CPC revenue; added a four-column worked table for CPM, CPC, target CPA and target ROAS with units and realized costs. Target CPA is a goal, not a guaranteed per-conversion charge. Chapter 12 exercises and recap now use the same distinction. | Ch. 2 §§2.2, 2.6; Ch. 12 §§12.1, 12.5; glossary |
| P0: quality score units and attribution | Expressed Chapter 15's hide penalty in dollars per impression, kept ad load outside the score, and labeled the adjusted pCTR as an implementation device. Attribution now determines credit and labels, not necessarily billing. | Ch. 15 §§15.1, 15.3; Ch. 16 §16.1 |
| P0: privacy claims | Renamed the teaching artifact to an aggregate conversion report with suppression. Explained that conversion counts are not distinct users, suppression and arbitrary noise do not establish differential privacy, and DP requires a defined neighboring relation, bounded contributions, sensitivity, calibrated noise and composition. Updated the code slot and glossary. | Ch. 13 §§13.1–13.4; `assets/stack.js`; glossary |
| P0: outdated technology example | Dated Google's Attribution Reporting API as retired in October 2025; linked its announcement. | Ch. 13 §13.1 |
| P1: ESMM and missing data | Defined pCVR versus pCTCVR and post-click versus view-through labels; limited ESMM's “entire space” to logged impressions, stated support and unobserved-label limits, and qualified inverse-propensity weighting. The missing-conversion rescaling example now states its uniform-observation assumption. | Ch. 12 §12.4; Ch. 13 §§13.2, 13.4 |
| P1: core metric definitions | AUC now gives ties half credit and conditions base-rate invariance on unchanged class score distributions. Corrected the log-loss comparison. Renamed empirical oracle “ceiling” to benchmark in the Chapter 9 report and hid gap percentages when denominators are tiny. | Ch. 9 §§9.1–9.3; Ch. 15 widget; glossary |
| P1: GAUC and calibration | Defined the group, weighting and undefined-group choices for label GAUC; distinguished it from the simulator's oracle within-request ordering. Stable aggregate AUC now triggers slice checks rather than proving ranking stability. Histogram calibration's ties and possible bin reversals are explicit. | Ch. 3 §3.4; Ch. 11 §11.4; Ch. 14 quiz; glossary |
| P1: experiment assumptions | Added randomization, assignment-versus-exposure, sample-ratio mismatch, power, guardrail margins, mature labels, multiplicity and spillover caveats. An interval containing zero is called inconclusive. Incremental CPA is labeled a point ratio with no stable finite upper bound when lift may be zero. | Ch. 9 §9.6 and launch memo; Ch. 16 §§16.2–16.3 and widget |
| P1: teaching setup versus general rule | Qualified exploration, retrieval, pacing and ad-load outcomes so readers diagnose unexpected runs. Position as a feature is no longer said to identify relevance by itself. Point-in-time reconstruction is distinguished from naive future-data recomputation; downsampling correction states its assumptions. | Ch. 4 §§4.4–4.5; Ch. 5; Ch. 10; Ch. 15; Ch. 17 |
| P1: losses and architecture | Identified binary MSE as Brier score and its sigmoid-gradient issue; stated Poisson exposure and overdispersion; qualified pairwise loss and its calibration limit. Distinguished transformer components from target attention and HSTU's pointwise attention. | Ch. 8; Ch. 11 |
| Consistency | README chapter count is 17; the Chapter 13 blurb and code slot match the corrected privacy language. | README; `assets/book.js`; `assets/stack.js` |

The GSP arithmetic issue at the top of the review was fixed before this pass; the current Chapter 3 explanation no longer equates six cents of true spend with the three-cent runner-up score. Recheck it if that exercise changes.

## Still open from the review

- Missing operational lessons and the notation map proposed in the review. These are additions, not corrections already made here.
- The experiment checklist is editorial guidance; the simulation does not implement every diagnostic, including sample-ratio mismatch detection or an interval for incremental CPA. Chapter 16's point ratio is explicitly labeled as unstable when lift can be zero.
- A full empirical citation audit, simulation-to-prose audit, and author pass over placeholders and voice remain separate tasks.

## Implementation notes for Claude

Pebble is a pedagogical simulator. It uses CPC clearing prices even in the toy target-CPA treatment. Treat `targetCPA × pCTR × pCVR` as a bid-weighted auction score; do not call it expected platform revenue or a charge per conversion. The Chapter 13 `privacyReport()` slot counts conversion rows and suppresses low-count cells, then the widget adds illustrative noise. It does **not** implement k-anonymity or differential privacy. Keep these assumptions in prose, quiz answers, diagrams and UI labels when editing.

Primary sources used: [Google's API retirement](https://privacysandbox.google.com/blog/update-on-plans-for-privacy-sandbox-technologies), [Apple AdAttributionKit documentation](https://developer.apple.com/documentation/adattributionkit), [Dwork and Roth on differential privacy](https://www.cis.upenn.edu/~aaroth/Papers/privacybook.pdf), [original ESMM paper](https://arxiv.org/abs/1804.07931), [ESCM² on remaining bias](https://arxiv.org/abs/2204.05125), [Microsoft Research on sample-ratio mismatch](https://www.microsoft.com/en-us/research/publication/diagnosing-sample-ratio-mismatch-in-online-controlled-experiments-a-taxonomy-and-rules-of-thumb-for-practitioners/), [HSTU's pointwise attention](https://arxiv.org/html/2402.17152v3#S3.SS1).

## Validation

`node tests/run-tests.js` passed the full suite after both correction sets, including chapter script parsing, all code-slot reference tests, auction, conversion-model and A/B simulations. `git diff --check` passed. `tools/build.sh` produced `dist`; esbuild was unavailable in this local environment, so the build used its documented readable-asset fallback. This does not verify the CDN's minification step or a visual browser pass.
