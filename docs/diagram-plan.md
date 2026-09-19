# Plan: more (and more dynamic) diagrams

**Status — 19 September 2026:** items 1–13 are implemented and verified. Item 14 is intentionally omitted because the existing attention heatmap already covers it. Gradient and AUC use reader-triggered steps/samples instead of timed animation. See [implementation, data sources, and verification](diagram-implementation.md). The original planning notes follow.

Today the book has 10 static SVG diagrams and 47 interactive widgets, unevenly spread. Chapters 2, 3, 5, 6, 7, 9, 15, 16 and 17 have **no** diagram at all, and those are some of the most mechanism-heavy chapters in the book.

This plan lists what to add, in priority order. Read the conventions first; they're what keeps a new diagram from looking bolted on.

## What "dynamic" means here

Three kinds, in increasing cost:

1. **Data-driven.** A structural SVG whose numbers and bar lengths come from the reader's own stack (`Stack.*`) or from a widget's current state. It redraws when the reader changes something.
2. **Interactive.** Hover or click reveals a path, highlights a stage, or steps through a sequence. No new simulation, just exposure of what's already computed.
3. **Animated.** A short, replayable sequence (a request moving down the funnel, one SGD step). Must be replayable on demand, never looping on its own, and must respect `prefers-reduced-motion`.

Prefer 1 and 2. Reach for 3 only where the thing being taught *is* a sequence.

## Conventions (all of these already exist; match them)

- **Markup:** illustrative diagrams go in `<figure class="diagram">` with a `<figcaption>`. If a diagram has controls, it belongs in a `<div class="widget" id="w-…">` with a `w-title`/`w-sub` instead, like the other widgets.
- **Styling is done for you** in `assets/book.css`: `.box` plus modifier `a` (accent), `b` (blue), `g` (green), `v` (violet); `.arrow` (uses `marker-end`); text classes `.t-sm`, `.t-md`, `.t-b`. Use them instead of inline fills.
- **Never hardcode a color.** Use `var(--ink)`, `var(--accent)`, `var(--s1)`…`var(--s6)` and so on, so dark mode works for free. Every diagram must be checked in both themes.
- **Unique ids per page.** Two diagrams on one page cannot both define `<marker id="arr">`. The preface uses `arr` and `arr2`; follow that pattern.
- **Sizing:** `viewBox="0 0 760 H"`, no `width`/`height` attributes (CSS makes it fluid). Keep body text at 11px or larger inside the viewBox, and boxes at least 140 units wide so labels don't wrap at phone width.
- **Accessibility:** `role="img"` and a real `aria-label` that says what the diagram shows, not "diagram". Keep the caption meaningful on its own.
- **No new dependencies.** Plain SVG and the existing `Book.*` / `Stack.*` helpers. `Book.chart` already handles axes, lines, dots and areas; use it for anything chart-shaped rather than hand-rolling axes.
- **Voice:** captions follow `ANURAG_WRITING_GUIDE.md` and `docs/voice-guide.md`. A caption states what the reader is looking at and why it matters; it isn't a label.

## Priority 1 — chapters with no diagram and a mechanism that needs one

### 1. Ch 2 · The GSP ladder (data-driven)
Next to the existing "A GSP auction you can edit" widget. Five candidate rows, each showing `bid × pCTR = score` as a bar, the three slots marked, and an arrow from each winner down to the ad below it, labeled with the price that ad sets (`next score ÷ own pCTR`). Redraws when the reader edits bids or pCTRs in the widget.
*Why:* the formula is the chapter's core and currently exists only as algebra.

### 2. Ch 3 · Two ways to be wrong (static, mirrored)
Two columns: over-prediction (wins more, pays less) and under-prediction (loses auctions, pays more), with the arrows meeting at "somebody pays the wrong price."
*Why:* §3.1 describes exactly this symmetry in prose, twice.

### 3. Ch 7 · Anatomy of one gradient step (animated, replayable)
Features → weights → sum (z) → sigmoid (p̂) → loss → gradient `p̂ − y` flowing back to nudge the active weights. A "Take one step" button advances it; numbers come from a real example, so the arithmetic on screen is the arithmetic in `sgdStep`.
*Why:* this is the single most important mechanism in the book, and it's currently pure text.

### 4. Ch 9 · AUC as a pile of pairs (animated)
Sample a clicked and a non-clicked impression, draw them on a score line, mark the pair correct or not, and accumulate toward the AUC number. Ten pairs at a time, with a "sample more" button.
*Why:* "probability a random positive outranks a random negative" is far easier to see than to read.

### 5. Ch 5 · The feedback loop that eats itself (interactive)
The show → log → learn → show cycle, with the missing arm drawn explicitly: ads never shown produce no labels, so the model never learns it was wrong. A toggle switches exploration on, adding the arm back.
*Why:* §5.5 is the conceptual heart of the chapter and has no picture.

## Priority 2 — high value, chapter already has one diagram

### 6. Ch 6 · Hashing and collisions (interactive)
An input box with a feature string, the hash arrow, and a row of buckets. Typing shows where a string lands; a preset pair of colliding strings shows two unrelated features sharing one weight. Use `Stack.fnv1a(str)` and `Stack.hashFeatures(feats, bits)` (both exported) so the buckets are the real ones, and read the table size from the reader's own `hashBits` setting.

### 7. Ch 16 · The attribution window, on a timeline (data-driven)
One user's impression, click, and conversion plotted on an hours axis, with the window drawn as a shaded band. Moving the window slider lights events as counted or not counted, and a second row shows a slow-converting advertiser falling outside the same band.

### 8. Ch 16 · Two worlds (static)
Exposed world and holdout world side by side, converters split into "caused by the ad" and "would have converted anyway," with the lift labeled as the difference.

### 9. Ch 15 · The objective you own (static, annotated formula)
The total-value score with each term annotated: which parts are predictions (pCTR, pCVR, pHide) and which are policy set by a human (λ, ad load).

### 10. Ch 1 · The latency budget (data-driven bar)
A 200 ms bar split by stage, matching the numbers the chapter already quotes, with the ranking stage expanding as candidates increase.

## Priority 3 — nice to have

11. **Ch 17 · The lever map:** each capstone lever linked to the chapter that taught it. Good final-page furniture.
12. **Ch 13 · The privacy dial:** k-threshold and noise as two dials feeding a published number, showing the same cell at different settings.
13. **Ch 10 · ANN search, visually:** why a dot product against precomputed vectors is cheap, next to the pair-by-pair cost of a cross tower.
14. **Ch 11 · Attention, one row:** history items sized by attention weight for the current candidate ad. (Partly covered by the existing heatmap widget; only build it if it adds something.)

## Definition of done, per diagram

- Renders correctly in light and dark mode.
- Readable at 375px wide with no horizontal scroll.
- `role="img"` plus a specific `aria-label`, and a caption in Anurag's voice.
- No console errors; `node tests/run-tests.js --quick` still passes.
- Any animation is triggered by the reader and respects `prefers-reduced-motion`.
- Data-driven diagrams use the reader's own stack, and say so when the reader hasn't built that piece yet (follow how the existing widgets phrase the reference-solution fallback).
- Committed in small batches and pushed, with remote HEAD verified (see `AGENTS.md`).

## Order of work

Priority 1 in listed order (2, 3, 7, 9, 5). Those five give every mechanism-heavy chapter a picture. Then Priority 2. Priority 3 only if it still feels missing afterwards.
