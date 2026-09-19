# Voice review log

## Pass 1 — Claude, 2026-09-19

Reviewed the preface, Chapters 2–15, and both appendices against `ANURAG_WRITING_GUIDE.md` and `docs/voice-guide.md`. Chapter 1 was already approved by Anurag and was not changed.

**Verdict:** the voice rewrite holds up. Chapters are consistent in tone, jokes sit around the math rather than inside it, every chapter has an "In which I…" subtitle, an opening mid-thought, and a closing hook to the next chapter. No rewrites were needed; fixes were small.

### Changed
| Where | Change | Why |
|---|---|---|
| Ch 3, 5, 6, 9, 10, 11, 14 | favour/judgement/behaviour/neighbour/coloured → American spelling | The rest of the book is American English |
| Ch 4 §4.4 | "your stack's counting feature from Chapter 6" → "the counting feature you'll build in Chapter 6" | Readers haven't reached Ch 6 yet |
| Ch 10 §10.1 | "libraries like FAISS, ScaNN, and HNSW" → "indexes (FAISS, ScaNN, or graph-based HNSW)" | HNSW is an algorithm, not a library |
| Ch 10 recap | "it's going to humble me a little" → "it's about to get a reality check" | "Humble" appears five times; three were back to back at the Ch 10→11 transition |
| Ch 12 §12.5 | Removed "here's the thing" | Third use in the book |
| Ch 15 intro | Removed "No pressure. (Lots of pressure.)" | Repeated Ch 14's joke almost word for word |
| Ch 15 §15.1 | The user-retention model is now described as "a gentler version of the Chapter 14 toy model" | The text claimed it was Ch 14's model at some sensitivity, but no single sensitivity gets from Ch 14's coefficients (0.8%, 60%) to the capstone's (0.4%, 40%). The code was left alone. |
| Ch 15 §15.2 | "Chapter 2's thin evening markets" → an explanation of how budgets running out leaves a thin market | Chapter 2 never mentions evenings |
| Ch 15 ending | "Now go vibe with your marketplace" → "Now go break something on purpose, and measure what happens" | The guide warns against forced slang; the new line calls back to "Try to break them" in the preface |

### For Anurag
- **Three claims about your experience to confirm or cut**, each marked with an `ANURAG:` comment: "I've been there" (preface lead), "I've made most of them" (preface, Common trap description), and "It surprised me" (Ch 11 intro).
- **The nine original `ANURAG:` story slots** are still open (preface, Ch 1 ×2, 3, 4, 6, 9, 11, 14). Find them with `grep -n "ANURAG:" chapters/*.html`.
- **Tics that are fine for now, to watch as you edit:** "No pressure" (Ch 1, 5, 14), "Here's…" as a sentence opener (26 uses), "never, ever" (7 uses).

### For the reference check (not done in this pass)
Citations that look right but should be checked against the sources:
- Ch 2: Edelman, Ostrovsky & Schwarz (2007); Varian (2007); "some large platforms have used VCG-style pricing"
- Ch 5: PAL (Huawei, 2019); YouTube multitask ranking (2019)
- Ch 7: McMahan et al. (2013), FTRL-Proximal; Zhang et al. (2022), one-epoch overfitting
- Ch 8: MMoE (Google, 2018); PLE (Tencent, 2020)
- Ch 9: He et al. (2014), normalized entropy
- Ch 10: Yi et al. (2019), logQ correction
- Ch 11: DCN (Wang et al., 2017 and 2021); DIN (2018); BST (2019); HSTU (2024); Wide & Deep (2016); "architecture launches are usually worth +0.1% to +0.5% in NE"
- Ch 12: Chapelle (2014), delayed feedback; ESMM (Ma et al., 2018)

Math in the worked examples was spot-checked (Ch 3, 4, 7, 8, 9, 12) and is correct.

## Pass 2 — reference check (Claude, 2026-09-19)

Every citation from the list above was checked for authors, year, venue, and whether the book's claim matches the source.

### Fixed
| Where | Problem | Fix |
|---|---|---|
| Ch 5, Going deeper | Cited PAL and YouTube together for a shallow position tower "added to the main model's logit." Only YouTube's paper is additive; PAL multiplies P(seen \| position) by P(click \| seen) | Describes each paper's mechanism separately, and ties PAL back to the examination hypothesis in §5.2 |
| Ch 11 §11.1 | Presented DIN as softmax-normalized scaled dot-product attention. DIN scores pairs with a small learned "activation unit" and deliberately does **not** normalize the weights | States what DIN does, and says the stack uses the simpler transformer-style dot product |
| Ch 11, In your job | "Architecture launches are usually worth +0.1% to +0.5% in NE" was stated as fact without a source | Softened to "usually moves NE by a fraction of a percent" |

### Verified, no change
- Ch 2: Edelman, Ostrovsky & Schwarz (2007, *American Economic Review*), GSP analysis; Varian (2007, *International Journal of Industrial Organization*), position auctions; VCG-style pricing at a large platform (Facebook; see Varian & Harris, 2014)
- Ch 7: McMahan et al. (2013, KDD), FTRL-Proximal with per-coordinate rates and sparsity; Zhang et al. (2022, CIKM, Alibaba), one-epoch overfitting in deep CTR models
- Ch 8: MMoE (Ma et al., KDD 2018, Google); PLE (Tang et al., RecSys 2020, Tencent)
- Ch 9: He et al. (2014, ADKDD, Facebook), normalized entropy
- Ch 10: Yi et al. (2019, RecSys, Google/YouTube), logQ correction for in-batch/popularity-sampled negatives
- Ch 11: DCN (Wang et al., 2017) and DCN-V2 (2021); the cross-layer formula shown is DCN-V2's form. BST (Alibaba, 2019); HSTU (Meta, 2024); Wide & Deep (Google, 2016)
- Ch 12: Chapelle (2014, KDD), delayed feedback with an exponential delay model, which matches the book's F(t); ESMM (Ma et al., SIGIR 2018, Alibaba)

### Not checked
Uncited general claims (e.g. "logistic regression ran most of the world's ad auctions for about a decade") were read for plausibility only.

## Pass 3 — new chapter (Claude, 2026-09-19)

Added **Chapter 13, Privacy and Measurement**, the biggest content gap: the book assumed per-event conversion data that mostly no longer exists.

- §13.1 three distinct losses: fewer events (opt-out), coarser events (SKAdNetwork, Privacy Sandbox), protected aggregates (k-anonymity plus noise).
- §13.2 widget: retrain the Ch 12 ESMM model with only part of the conversions observable. Rescaling restores the level (calibration 0.45 → 1.13) but not the signal (ranking 66.4% → 64.4%).
- §13.3 build step `privacyReport()`: aggregate per advertiser and time bucket, suppress cells under k. Widget adds noise and shows who pays: at k=5 on daily cells, 17 of 25 advertisers get no report at all; grouping 10 days per cell brings that down to 7.
- §13.4 modeled conversions and differential privacy, with the privacy-budget idea.
- Chapters 13-15 became 14-16. Old URLs redirect; reader progress migrates on first load.

Still open from the gap review: attribution and incrementality (recommended next), ad review/policy and brand safety, invalid traffic, creative, bandits, and variance reduction.

## Pass 4 — new chapter (Claude, 2026-09-19)

Added **Chapter 16, What the Ad Actually Caused** (Part V; the capstone moved to 17). Scoped to ad quality rather than billing, per Anurag: attribution matters here because it defines the training label, and incrementality is a measurement problem, not a per-campaign dial.

- §16.1 attribution as a label decision (window, view-through, multi-touch credit). Widget joins the same logs under 1/3/7/30-day windows: Finance CVR reads 0.3% at one day versus 5.9% at 30, while Gaming is unchanged at 42.4%. Training under the short window leaves the model under-calibrated (0.84 vs 1.15) and slightly worse at ranking.
- §16.2 credit vs cause, retargeting, holdouts and ghost ads. Build step `liftEstimate()` returns lift plus standard error; the toy widget shows attributed CPA next to incremental CPA and whether the interval clears zero.
- §16.3 what changes for a quality PM: models optimize predictability rather than persuasion; some launch "wins" are transfers of credit; holdouts matter more as privacy tightens.
- Glossary gained 10 terms from chapters 13 and 16.

Remaining gaps from the original review: ad review/policy and brand safety, invalid traffic, creative, bandits in Ch 5, variance reduction in Ch 9.
