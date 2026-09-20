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
| Consistency | README chapter count is 17; the Chapter 13 blurb and code slot match the corrected privacy language. | README; `assets/book.js`; `assets/stack.js` |

The GSP arithmetic issue at the top of the review was fixed before this pass; the current Chapter 3 explanation no longer equates six cents of true spend with the three-cent runner-up score. Recheck it if that exercise changes.

## Still open from the review

- Experiment interpretation and uncertainty in Chapters 9 and 16: guardrail noninferiority margins, intervals containing zero, unstable incremental-CPA ratios, exposure versus assignment, and marketplace interference.
- GAUC grouping, weights and undefined groups; distinguish label GAUC from oracle within-request ordering. Review Chapter 11 and any other metric explanations.
- Selection and pairwise-learning caveats in Chapters 5 and 11, and calibration diagnosis in Chapter 14.
- Missing operational lessons and the notation map proposed in the review. These are additions, not corrections already made here.
- A full empirical citation audit, simulation-to-prose audit, and author pass over placeholders and voice remain separate tasks.

## Implementation notes for Claude

Pebble is a pedagogical simulator. It uses CPC clearing prices even in the toy target-CPA treatment. Treat `targetCPA × pCTR × pCVR` as a bid-weighted auction score; do not call it expected platform revenue or a charge per conversion. The Chapter 13 `privacyReport()` slot counts conversion rows and suppresses low-count cells, then the widget adds illustrative noise. It does **not** implement k-anonymity or differential privacy. Keep these assumptions in prose, quiz answers, diagrams and UI labels when editing.

Primary sources used: [Google's API retirement](https://privacysandbox.google.com/blog/update-on-plans-for-privacy-sandbox-technologies), [Apple AdAttributionKit documentation](https://developer.apple.com/documentation/adattributionkit), [Dwork and Roth on differential privacy](https://www.cis.upenn.edu/~aaroth/Papers/privacybook.pdf), [original ESMM paper](https://arxiv.org/abs/1804.07931), [ESCM² on remaining bias](https://arxiv.org/abs/2204.05125).

## Validation

`node tests/run-tests.js` passed the full suite, including chapter script parsing, all code-slot reference tests, auction, conversion-model and A/B simulations. `git diff --check` passed. `tools/build.sh` produced `dist`; esbuild was unavailable in this local environment, so the build used its documented readable-asset fallback. This does not verify the CDN's minification step or a visual browser pass.
