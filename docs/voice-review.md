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
- **Tics that are fine for now, to watch as you edit:** "No pressure" (Ch 1, 5, 14), "Here's…" as a sentence opener (about 30 uses), "never, ever" (about 6 uses).

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
