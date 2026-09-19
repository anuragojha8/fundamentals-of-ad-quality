# SVG diagrams: implementation and verification

Completed 19 September 2026. Thirteen diagrams cover all Priority 1 and Priority 2 items, plus Priority 3 items 11–13. Item 14 is intentionally omitted: Chapter 11 already has the candidate-by-history attention heatmap, and a second view would repeat it.

## Where to find them

| Plan item | Chapter / anchor | Behavior and data source |
|---|---|---|
| 1 · GSP ladder | [2 · Auction](../chapters/02-auction.html#w-gsp) | Reads the existing editable widget's candidates, current order and prices on every render. Bid-only mode uses its different payment rule and labels it. Five score bars, three winners, next-candidate price arrows. |
| 2 · Two ways to be wrong | [3 · Predictions](../chapters/03-predictions-are-prices.html#d-errors) | Mirrored over/underprediction example. Fixed bid, rival threshold and true CTR; correct expected-spend arithmetic. |
| 3 · Gradient step | [7 · Learning](../chapters/07-how-models-learn.html#w-gradient-diagram) | Calls `Stack.impl('sgdStep')` on local weights. Shows before/after weights, logit, sigmoid, loss, gradient and returned prediction. Step and reset/replay controls; names learner/reference source. |
| 4 · AUC pairs | [9 · Evaluation](../chapters/09-evaluation.html#w-auc-diagram) | Samples ten pairs per click from `Stack.evalLog()` and joined observed click labels. Uses saved LR predictions when available; otherwise explicitly labeled logged serving predictions. Accumulates pair credit, counts ties as ½, and compares with full-log reference AUC. Resets when stack changes. |
| 5 · Feedback loop | [5 · Bias](../chapters/05-labels-and-bias.html#w-feedback-diagram) | Exploration switch adds the overlooked-ad path to the illustration. Does not change production exploration. |
| 6 · Hash collisions | [6 · Features](../chapters/06-features.html#w-hashing-diagram) | Uses `Stack.fnv1a`, `Stack.hashFeatures`, and current `hashBits`. Input strings, a bounded collision search, and a four-bucket neighborhood. Refreshes when settings change. |
| 7 · Attribution timeline | [16 · Causality](../chapters/16-what-the-ad-caused.html#w-timeline-diagram) | Local illustrative event times: impression −0.25h, click 0h, conversions 2h and 120h. Window slider updates the shaded band and counted/outside status, including the exact boundary. The adjacent original widget evaluates actual logs. |
| 8 · Two worlds | [16 · Causality](../chapters/16-what-the-ad-caused.html#d-two-worlds) | Illustrative 10% vs 6% population expectations. Labels aggregate lift, rather than claiming particular converters are identifiable as caused by the ad. |
| 9 · Objective | [15 · Quality](../chapters/15-beyond-the-click.html#d-objective) | Annotates probability predictions, policy weights and value units. Conversion scoring is an alternative to the CPC term. Ad load is a separate policy constraint. |
| 10 · Latency | [1 · Request](../chapters/01-two-hundred-ms.html#w-funnel) | Replaces the widget's previous small HTML bar with an SVG stage bar driven by the exact existing `latR`, `latE`, `latL` and fixed overhead. Shows the simulator's 100 ms selection budget and the chapter's 200 ms end-to-end reference separately. No change to timeout arithmetic. |
| 11 · Lever map | [17 · Capstone](../chapters/17-capstone.html#d-levers) | Six keyboard-focusable SVG links to the relevant mechanism chapters, plus measurement/pacing reading guidance. |
| 12 · Privacy dial | [13 · Privacy](../chapters/13-privacy.html#w-privacy-diagram) | Local illustrative nine-conversion cell passed to `Stack.impl('privacyReport')`. Threshold and noise-scale controls; same seeded noise draw makes dial comparisons interpretable. Explicitly no DP guarantee. |
| 13 · ANN | [10 · Retrieval](../chapters/10-retrieval.html#d-ann) | Structural comparison of precomputed ad vectors, request-time search and joint work per candidate. States that the book uses exact top-K, rather than claiming an ANN implementation. |

## Design and integration

- Source: [assets/diagrams.js](../assets/diagrams.js), [assets/diagrams.css](../assets/diagrams.css), and small chapter insertion points. The diagrams are inline SVGs created in the page, not raster screenshots.
- All SVGs have a 760-unit viewBox, descriptive accessible names, theme variables, and unique marker IDs. Existing `Book.chart` supplies axes for AUC, attribution and latency.
- Large SVG type and predominantly vertical layouts keep labels legible on phones. Mirrored comparisons remain side by side with short labels.
- Steps and samples are reader-triggered. No automatic or looping motion is introduced; reduced-motion users receive the same complete explanations.
- No new book runtime dependency. Static diagrams initialize with the book's existing JavaScript; illustrative widgets do not write their choices into the learner's production policy.
- A small existing navigation overflow was fixed in `assets/book.css` so the theme button remains inside the 375px viewport.

## Verification performed

Checked the final implementation with installed Chrome through Playwright in a separate, temporary browser context; no learner's saved browser data was used.

- Twelve chapter pages × two viewport widths (375 and 1280) × two themes: **48 page/theme/viewport checks passed**. All thirteen diagrams were included; AUC's chart and pair table have separate named SVGs.
- No page or console errors in those checks. No document-level horizontal overflow. SVG text bounding boxes remained within their viewBoxes. Every generated SVG had `role="img"` and a descriptive `aria-label`.
- Screenshots inspected for layout, contrast and text size in light/dark mode. The inspection caught and fixed collapsed whitespace in the AUC table and oversized static-diagram supporting text.
- Verified auction edits and bid-only mode redraw; candidate changes alter the latency bar; exploration switches the missing-label path.
- Verified gradient reference and learner-code paths, the numerical first step (`w₁ = 0.5438`) and reset/replay.
- Verified AUC accumulation (10 then 20 pairs), logged-prediction fallback, and saved-LR prediction path.
- Verified a real collision: default 15-bit table maps `feature=9` and `feature=166` to bucket 1211. User-entered markup is displayed as text.
- Verified attribution at the 120-hour boundary, privacy suppression above the nine-count example, and all six lever-map link targets.
- `node tests/run-tests.js --quick`: **passed** (chapter script parsing, all 17 code slots, simulation→join→LR→evaluation→A/B checks).
- `node --check assets/diagrams.js` and `git diff --check`: passed.

This is Chrome layout/interaction verification, not a full assistive-technology or cross-browser certification. The full slow model-training suite was not rerun because the diagrams do not change those model implementations.

## Editorial boundaries

The proposed chapter corrections remain in [suggested-improvements.md](suggested-improvements.md). Diagrams use explicit assumptions and corrected arithmetic; the surrounding restored prose has not been comprehensively rewritten. In particular, the review's privacy, billing, ESMM and causal-inference changes still need an editorial pass.

## Follow-up: animated Chapter 1 request funnel

Replaced the original static funnel illustration in §1.1 with `#w-request-funnel` at the author's request. This is an additional diagram beyond the thirteen listed above.

- Twelve fixed illustrative candidates retain their identities as four fail eligibility, eight are reordered by bid × pCTR, and three are selected. F, C and A win by their calculated scores. Ranking itself does not remove candidates in this example.
- Native SVG cards animate their position and opacity. Playback starts only on request; Play/Continue, Pause, Next stage, Reset and Replay are supported. Playback stops when the page becomes hidden.
- Reduced-motion preference removes transitions and replaces Play with an instant Show result; Next stage still explains each intermediate state.
- A two-column mobile card layout replaces the four-column desktop layout. The stage counts, descriptive SVG label, live status and static no-JavaScript explanation preserve the mechanism without requiring motion.
- The example is explicitly illustrative, does not read or change the learner's production state, and explains why retrieval is omitted until Chapter 10.
- Verified no autoplay, pause stability, correct stage order and winners, replay/reset, reduced motion, 375px/1280px layouts, both themes, no horizontal overflow and no browser errors. Existing quick engine checks passed.
