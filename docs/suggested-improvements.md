# Suggested improvements: Fundamentals of Ad Quality

Review date: 19 September 2026. Baseline: `a2765fa` (restored book, including privacy and incrementality chapters).

## Editorial verdict

The central teaching idea works: the reader builds one marketplace, and earlier decisions become later model failures. Keep the progression **auction → data → learning → architectures → operating the marketplace**. This is already a substantial technical book, not an outline that needs starting over.

Before publication, fix the mathematical and measurement claims below. Then add a few compact lessons that connect the models to real PM decisions. The greatest gap is operational judgment under uncertainty, rather than another model architecture.

This is an editorial and technical review of the chapter prose, exercises, and selected supporting implementations. It is not an exhaustive verification of every simulation or every empirical claim. The voice assessment uses the supplied parent writing guide, the book-specific guide, and the restored text; it does not claim fresh access to the author's three original Substack posts. Proposed prose changes below have **not** been silently applied to the chapters.

## 1. Fix before publication

### P0 · The worked GSP example contradicts its own arithmetic

**Location:** [Chapter 3, exercise ch3-e1](../chapters/03-predictions-are-prices.html), immediately after the advertiser-miscalibration widget.

The example correctly computes `$0.03 / 0.02 = $1.50` per click and actual expected spend `0.04 × $1.50 = $0.06`. It then calls six cents “exactly the runner-up's score,” which is three cents.

**Suggested replacement:**

> Lumen pays $1.50 per click. The model expects a click 2% of the time, so it predicts a cost of 3 cents per impression—the runner-up's score. But the true CTR is 4%. Lumen's actual expected cost is 6 cents per impression. The model balanced the books using the wrong probability.

State that the rival threshold and slot are held fixed. If a prediction change changes the winner or its next competitor, recompute the auction rather than extrapolating the reciprocal-price formula.

### P0 · Separate auction value, clearing payment, optimization goal, and billing event

**Locations:** Chapters 2 §2.2 and §2.6; 12 §12.1 and §12.5; 15 §15.1–3; 16 attribution discussion.

`bid × pCTR` is bid-weighted expected value per impression, not generally expected platform revenue under GSP. Actual expected revenue is `price per click × true CTR` (and position examination where applicable). Chapter 2's $30 eCPM example presently says Pebble expects to *earn* $30, even though a clearing price can be below the bid.

The bidding table also mixes goals and charging units. Target CPA is an optimization target, not necessarily payment per acquisition or a maximum guaranteed price. ROAS bidding needs an explicitly defined multiplier/unit; multiplying an unspecified “bid” by purchase value is ambiguous. Attribution does not universally decide billing: many campaigns pay for impressions or clicks.

**Add a four-column worked table:** advertiser goal; bid/controller output and units; ranking score; billing event and realized cost. Show one CPC example and one target-CPA example through to actual CPA. Explain that low CPA does not by itself prove under-delivery, and high CPA does not uniquely diagnose pCVR overprediction. Competition, budgets, measurement changes and controller behavior also matter.

For Chapter 15, keep every additive term in compatible value-per-impression units. Ad load is an allocation constraint, not a term in the displayed score. Explicitly distinguish a policy penalty from the simulator's implementation through an adjusted pCTR; an adjusted score is not a calibrated click probability.

### P0 · The privacy exercise does not establish privacy safety

**Locations:** Chapter 13 §13.3, differential-privacy callout, glossary and wrap-up; `assets/stack.js` slot `privacyReport` title/starter.

The function counts conversions and suppresses small cells; the widget adds noise later. “Can be shared without exposing anyone,” “privacy-safe,” and “makes any one person's presence unknowable” are not warranted. A conversion threshold is not a distinct-person threshold. Deterministic cell presence can itself reveal information. Noise alone does not establish differential privacy.

**Rename the teaching artifact:** “An aggregated conversion report with suppression.” State that it is an illustration, not a validated privacy mechanism. Introduce neighboring datasets, per-person contribution bounds, sensitivity, calibrated noise, and composition before claiming differential privacy. Explain that DP limits how much including one person's data changes output probabilities; it does not make individuals unknowable. Keep policy/legal compliance separate from this mathematical property. See [Dwork and Roth, The Algorithmic Foundations of Differential Privacy](https://www.cis.upenn.edu/~aaroth/Papers/privacybook.pdf), especially the definition, sensitivity and composition treatments.

The chapter's named technology example is also outdated: Google announced retirement of Attribution Reporting and related Privacy Sandbox APIs in October 2025. Present them as historical examples or replace the example with a dated, maintained reference. [Google's retirement announcement](https://privacysandbox.google.com/blog/update-on-plans-for-privacy-sandbox-technologies).

### P1 · ESMM is a modeling approach, not a universal bias eraser

**Locations:** Chapter 12 §12.4 and quiz explanation; Chapter 13 modeled-conversion discussion.

“All candidates” includes unshown ads, while ESMM's entire space is the **observed impression space**. Clicked-only training can estimate `P(conversion | click, x)` correctly with adequate support and a correctly specified conditional model; selection alone does not prove conditional bias. Calibration averaged over clicked examples does not establish calibration in every served slice. ESMM shares representations and constrains the click→conversion chain, but does not guarantee identification everywhere or solve missing consent data.

Replace “fixes it” with the mechanism and assumptions. Add the distinction between `P(conversion | click,x)`, `P(click and conversion | x)`, and view-through conversions. The current “conversions only exist for people who clicked” is a simulator/label definition, not a general property of advertising. Compare the [original ESMM paper](https://arxiv.org/abs/1804.07931) with [ESCM²'s analysis of remaining estimation bias](https://arxiv.org/abs/2204.05125).

Likewise, inverse propensity weighting requires a valid propensity and overlap. Dividing by pCTR is not a blanket cure for missing features, consent selection, or unseen ads. Global rescaling of missing conversions works only under the stated observation model; observed-user share need not equal observed-conversion share.

### P1 · Tighten the metric definitions

**Locations:** Chapter 9 §§9.1–3; Chapter 11 GAUC passages; Chapter 14 calibration quiz.

- AUC gives ties half credit. Its base-rate invariance assumes unchanged positive/negative score distributions; changing traffic composition can change AUC.
- “1% CTR has lower log loss than 10%, no matter how good the model is” is false. Base-rate entropy compares the constant base-rate predictors. A good 10% model can have lower log loss than a bad 1% model.
- The oracle score maximizes population expected discrimination under the simulator assumptions. Its empirical AUC on a finite set of sampled clicks is not an inviolable ceiling. Change “ceiling” in the report card to “oracle benchmark.” Be cautious about percentages of the gap closed when the denominator is small or negative.
- GAUC needs a defined group (request or user), averaging weights, and handling of groups without both label classes. Oracle within-request ordering accuracy is not the same metric as label-based GAUC.
- Stable aggregate AUC does not prove every ordering or slice is unchanged. A calibration refit is a sensible first investigation, not a guaranteed sufficient fix.
- Histogram calibration need not preserve ordering. State monotonicity assumptions when promising calibration changes cannot affect ranking.

### P1 · Give experiments their missing assumptions

**Locations:** Chapter 9 A/B interpretation and ship memo; Chapters 15–17 long-term comparisons; Chapter 16 lift.

The simulator's expected outcomes remove click/conversion sampling noise. Comparing expectations across different assigned users can still contain assignment imbalance. Label oracle diagnostics separately from observed outcomes and their confidence intervals.

An interval containing zero is inconclusive, not evidence of no harm. Set a noninferiority margin for guardrails. Ratios such as cost per incremental conversion can become unbounded or unstable when the incremental-conversion denominator is near zero; don't imply every lift estimate has a tidy finite CPA interval.

A randomized holdout is a strong route to causal identification under assumptions. “The only honest measure” is too sweeping. Distinguish assignment from actual exposure, intention-to-treat from exposed-only comparisons, and individual potential outcomes from aggregate lift. View-through conversions are not automatically noncausal. Shared campaign budgets and marketplace interference can violate a simple independent-user experiment model.

Add a short preflight: randomization unit, sample-ratio mismatch, power/MDE, mature labels, primary metric, stop/ramp rules, multiplicity and uncertainty. [Microsoft's SRM taxonomy](https://www.microsoft.com/en-us/research/publication/diagnosing-sample-ratio-mismatch-in-online-controlled-experiments-a-taxonomy-and-rules-of-thumb-for-practitioners/) supplies a concrete diagnostic exercise.

### P1 · Remove certainty that comes from the teaching setup

**Locations:** Chapters 5, 7, 10, 11, 14, 15 and 17.

“Short tests will always tell you to show more ads,” “an extra slot wins every single week-one revenue comparison,” “pacing rarely hurts,” and the heuristic being “supposed to” beat retrieval train the reader to predict the author's result. Replace these with observations conditional on the model/settings. A different result should prompt diagnosis, not appear to invalidate the learner's work.

Other precision changes:

- Adding position as a feature and setting it to slot 0 at serving does not automatically disentangle relevance from selection. Show the need for randomization or identifying assumptions.
- Negative downsampling correction assumes known outcome-dependent sampling rates. Feature-dependent sampling needs corresponding conditional correction/weighting; do not correct twice if the training loss already corrected it.
- Point-in-time reconstruction can faithfully reproduce features; recomputation is not inherently leakage. Teach availability time versus event time and immutable historical snapshots.
- MSE on probabilities is the Brier score, a proper scoring rule. The sigmoid parameterization can produce small gradients; that is different from saying the loss cannot learn calibrated rare-event probabilities.
- Pairwise AUC surrogates optimize score ordering, not probabilities. Include ties, sampling, request grouping and a calibrated or mixed-objective path to auction use.
- Poisson needs counts plus exposure: `E[count]=exposure × rate`. Discuss overdispersion and why a Poisson rate is not bounded to [0,1].
- A transformer includes more than target attention: sequence order, masking, normalization, residuals and feed-forward layers deserve one compact walkthrough. HSTU should not be described as simply the same softmax-attention stack; its [original paper, §3.1](https://arxiv.org/html/2402.17152v3#S3.SS1) describes pointwise aggregated attention.
- Two-tower factorization cannot directly consume an arbitrary pair feature while preserving independent encoding. It can still represent interactions through embeddings. “Nothing can be precomputed” for cross towers is too broad: invariant feature processing and some sequence encodings can be cached.
- Teacher probabilities carry teacher bias; distillation can combine hard and soft labels and is not guaranteed to improve data efficiency or calibration.

## 2. Coverage: what is missing for a PM who will use this at work?

| Addition | Put it here | Exercise and evidence of understanding |
|---|---|---|
| Budget pacing and bid controllers | Ch. 2 introduction; short worked lesson before Ch. 17 | Compare two hourly traffic patterns under one daily budget. Explain underspend, overspend, delayed CPA feedback and why a better ranker can improve value without revenue. Pacing currently becomes a major capstone lever before it is properly taught. |
| Safety, policy eligibility and invalid traffic | Ch. 1 eligibility + Ch. 4 labels | Diagnose high CTR from accidental clicks/fraud. Choose between blocking eligibility, downranking, and improving a noisy label. Include appeals, false positives and delayed enforcement. |
| Creative and landing-page quality | Ch. 6 features + Ch. 15 objectives | Two creatives have equal CTR but different conversion, complaint and landing-page outcomes. Specify useful features, leakage checks and the relevant objective. |
| Observation and label contract | Ch. 4 | Define impression/viewability, deduplication key, retries, late arrivals, event time, ingestion time, window, and negative maturity. Draw an event that happened before cutoff but arrived after it. |
| Exploration and offline policy evaluation | Ch. 5 | Compute an IPS estimate, then remove support or introduce a huge weight. Explain overlap, clipping bias, effective sample size and why deterministic logs cannot evaluate every policy. Add contextual bandits as the next step. |
| Validation versus final test | Ch. 7–9 | Reserve a later untouched day after choosing features, hyperparameters and architecture. Repeatedly using day 10 turns it into validation data. Add a learning-curve/model-capacity diagnosis rather than only a metric target. |
| Retrieval in production | Ch. 10 | Compare exact top-K and approximate-index recall separately from relevance recall. Include index freshness, filtering, hard/in-batch negatives, accidental positives and cost. |
| Multi-task optimization | Ch. 8 and 12 | Vary task sampling and gradient scales; show that loss weights are not the same as business-value weights. Introduce shared trunk versus task heads and negative transfer. |
| Pre-training and distillation practice | Ch. 14 | Freeze versus fine-tune representations, inspect cold-start slices, and compare teacher/student latency and calibration. These originally requested topics currently get mostly prose and a quiz. |
| Monitoring and rollback | Ch. 9 and 14 | Hand the reader a model/feature version mismatch, delayed labels and a revenue jump. Require a rollback choice, evidence and a follow-up plan. |
| Mastery rubric | Ch. 17 | Score diagnosis, assumptions, experiment design and business interpretation—not only simulator profit. Require a short memo with uncertainty, and a failure case the reader investigated. |

Avoid adding every topic as a new chapter. Most fit in one section and one exercise. The book already has enough machinery to support a demanding course.

## 3. Flow and learning design

1. **Keep the current chapter order.** Chapters 4→5→6→7 make the strongest learning chain: logs become biased labels, features make that bias learnable, then training makes it consequential. The newly added privacy and incrementality chapters belong where they are.
2. **Introduce the three stakeholders in Chapter 1.** Keep the deep user-quality treatment in Chapter 15, but don't suggest user value first becomes relevant after fourteen chapters. Return to the same objective as each measurement becomes available.
3. **Add a one-page label/probability map.** Define pCTR, post-click pCVR, pCTCVR, pHide, position adjustment and attribution windows once; link it from 3, 5, 8, 12, 13 and 16. This prevents the book's most expensive notation drift.
4. **Distinguish three kinds of numbers consistently:** observed logs; model estimates; simulator oracle. Also separate illustrative toy cases from the reader's persisted stack. Put this distinction in each relevant caption.
5. **Give every interactive exercise a prediction prompt and a debrief.** “Before you run it, which quantity should change?” followed by “What evidence would disprove your explanation?” makes the interaction reasoning practice.
6. **Add a no-code review path and a small JavaScript bridge.** The preface promises Python familiarity; the exercises use JavaScript. Explain arrays, objects, mutation and the handful of helpers once. PM scenario responses should count toward a separate mastery checklist even if they aren't automatically graded.
7. **Repair restored-book consistency.** README still describes 15 chapters while the book now has 17. Chapter 15 says “for thirteen chapters.” Chapter 1's title/full-request narrative says 200 ms, while its actual funnel simulator uses a 100 ms budget. Define 100 ms as the modeled selection sub-budget inside a 200 ms end-to-end illustration, or change both model and prose together. Do not draw a 200 ms timeout while the widget computes timeouts at 100 ms.
8. **Add a bibliography with dates and scope.** Distinguish papers supporting a mechanism from company-specific empirical results. Source millisecond ANN claims, industry NE-gain claims and current privacy platform descriptions, or soften them. A paper's implementation is not automatically the simulator's implementation.

## 4. Does it sound like Anurag?

**Mostly yes.** The book matches the guide's technical mode: it starts simple, breaks the simple version, thinks aloud with the reader, then earns the math. Pebble gives the jokes an actual setting. The strongest humor arises from a mechanism rather than announcing how fun the lesson will be.

### Preserve these

- Chapter 4: “Nobody ever got a standing ovation for a join.” Specific, dry, and exactly about the work.
- Chapter 6: an ID feature is “an infrastructure request wearing a modeling costume.” A joke that communicates a useful cost model.
- Chapter 3's premise that predictions become prices. Repetition here creates conceptual continuity.
- Chapter 15: “Every ad spends a little of their patience.” Let that sentence stand without adding a wink.
- The chapter titles and first-person deks. They give the book character while the navigation remains clear.

### Where it feels generated or over-managed

- Repeated “Here's,” “Okay,” “pretty neat, right?”, “No pressure,” “never, ever,” and “it's the whole…” make neighboring chapters sound templated. Keep the best instances; don't replace them with a fresh quota of tics.
- The book-specific rule that *every* chapter must begin mid-thought and end with a callback/sign-off is more rigid than the parent guide. Consider changing these to options. Keep the deks if you like them; vary the body openings between a concrete result, a decision, a question and a plain statement.
- “Every piece,” “the only question that matters,” “always,” “exactly” and “completely impossible” sometimes turn confidence into factual overclaim. Anurag's voice can admit a condition without becoming academic.
- Generic reassurance (“Look at you, reusing infrastructure like a pro”) adds less than an observation about the result. Cut some of it and let the reader's successful experiment provide the payoff.
- Several personal claims need author confirmation: preface “I've been there” and “I've made most of them”; Chapter 11 “It surprised me.” The existing `ANURAG:` story prompts are the right mechanism. Do not invent the stories or treat these claims as confirmed biography.

### Three small examples of the target register

**Ch. 10, pre-announced winner:**

> If your heuristic beats the two-tower model, look at what the model got to learn from. Its clicks came from ads the old system already liked. A larger model doesn't automatically develop better taste from the same narrow menu.

**Ch. 12, excessive certainty:**

> ESMM makes the two predictions answer to the same impression-level evidence. Useful. It still can't recover events we never observed, or tell us much about regions where clicks are almost nonexistent.

**Ch. 15, guaranteed short-test result:**

> An extra slot can make this week's revenue look excellent. The interesting question is what happens after users have lived with it for a while. Unfortunately, they do not file their dissatisfaction on our launch-review schedule.

These are candidate edits, not claims of exact imitation. Preserve the existing distinctive lines; reduce repetition and unsupported certainty before adding more jokes.

## 5. Suggested sequence

1. Correct the GSP arithmetic, auction/billing units, privacy guarantees and outdated platform reference.
2. Tighten ESMM, metric and causal-inference language; align exercise explanations with the assumptions.
3. Add pacing, label contracts, experiment preflight and monitoring exercises.
4. Add hands-on pre-training/distillation and a final untouched evaluation exercise.
5. Make a selective voice pass, confirm personal claims, and refresh README, chapter counts, reading paths and bibliography.

The SVG work can proceed independently. New diagrams should model the corrected explanations, explicitly mark illustrative assumptions, and avoid amplifying the existing overclaims.
