# Fundamentals of Ad Quality

An interactive, build-as-you-learn book on ad quality for product managers with a CS background. Readers build one working mini ad stack chapter by chapter: request loop → retrieval → ranking → GSP auction → serving → logging and joins → training → evaluation. All of it runs in the browser in plain JavaScript, against a seeded synthetic world whose ground truth is visible.

## Run it

It's static HTML with no build step. Serve the folder with any static server:

```bash
python3 tools/serve.py
```

Then open http://localhost:8765. `tools/serve.py` disables caching so edits always show up. Opening the files directly (`file://`) mostly works, but code-cell tests then run on the page instead of in a sandboxed Web Worker.

## Chapter numbers

`tools/chapter-stats.py --write` measures every chapter (minutes to read, build steps,
experiments) and writes the numbers into the `CHAPTERS` table in `assets/book.js`. The
table of contents, the landing cards and the previous/next cards read them from there,
since a page can only count its own words. Re-run it after adding or cutting prose.

## Deploying

`tools/build.sh` copies the book into `dist/` and minifies the CSS and JS with esbuild
(fetched on demand by `npx`, so nothing is installed in the repo). Netlify runs it via
`netlify.toml`. Minification happens only on the way to the CDN: the repo, the local
server, and the tests all use the readable sources. Shipped assets are about 59 KB
gzipped, down from 76 KB unminified.

## Structure

| Path | What it is |
|---|---|
| `index.html`, `chapters/*.html` | The book: preface, 17 chapters, an extra-credit Chapter 18, and 2 appendices |
| `assets/world.js` | The synthetic world: users, advertisers, ads, and the **true** pCTR, pCVR, pHide, position bias, conversion delays, and drift. Deterministic from a seed; no DOM. |
| `assets/nn.js` | A tiny reverse-mode autodiff (embeddings, dense, DCN cross layers, target attention, losses, Adam). |
| `assets/stack.js` | The reader's stack: 15 **code slots** (reader-written functions with tests and reference solutions), the serving policy, the simulator loop, joins, trainers (LR, two-tower, wide & deep, naive pCVR / ESMM), evaluation, A/B testing, and localStorage persistence. No DOM. |
| `assets/stack-ui.js` | Code-cell editor with sandboxed test runs, the "Your ad stack" panel with *Load reference solutions*, and progress helpers. |
| `assets/book.js`, `assets/book.css` | Page chrome, table of contents, quizzes and exercises, charts, theme. |
| `tests/run-tests.js` | End-to-end checks of the engine (see below). |

### How the build-as-you-learn loop works

- Each chapter's `<div class="code-cell" data-slot="…">` asks the reader to implement a function (e.g. `runAuction`, `joinLabels`, `sgdStep`, `auc`). Tests run in a Web Worker with a timeout. **The stack uses the reader's code only after it passes; until then it falls back to the reference**, so skipping ahead never blocks.
- Trained models (LR, two-tower, deep, ESMM, pHide) and settings (reserve, exploration, ad load, λ, …) persist in `localStorage` under `faq-stack-v1`. Book progress lives under `faq-book-v1`.
- Every chapter's stack panel offers **Load reference solutions** for missing prerequisites. It marks those chapters as reference-built and trains any missing reference models.
- Decisions carry forward on purpose. For example, the exploration rate chosen in Ch. 5 determines whether the Ch. 7 model beats the heuristic in the Ch. 9 A/B test (exposure bias).

## Tests

```bash
node tests/run-tests.js          # full run (~30 s)
```

```bash
node tests/run-tests.js --quick  # skips the deep models, drift, and retrieval (~5 s)
```

They check that every reference solution passes its own tests and every starter compiles but fails. They also check the numbers the chapters rely on: oracle AUC ≈ 0.85, logistic regression ≈ 0.75, heuristic ≈ 0.65, CTR in a realistic range, the LR winning an A/B test when logs include exploration, two-tower recall ordering, and so on. Run them after changing `world.js` or `stack.js`.

## Changing the world

`World.VERSION` in `assets/world.js` must be bumped whenever generation or the truth functions change. Saved models trained on an older world are then discarded automatically, and readers see a notice, while their code and settings are kept. After changes, re-run the tests and spot-check chapters whose conclusion text depends on magnitudes. Most conclusion text is already data-driven.

Key tuning knobs live in `World.DEFAULTS`: `baseLogit`, `wMatch`, `wIntent`, `userBiasSd`, `adQualitySd`, `driftStrength`, `trendAmp`, `examine`.

## Room for a Python companion track (not built)

`world.js` was written so a Python port can reproduce it exactly:

- All randomness is either `mulberry32` consumed in a fixed order (entity generation) or `hashInts` (a murmur3-style 32-bit hash) of integer keys for per-request draws. Both use only 32-bit integer arithmetic, which ports directly with masking.
- `world.exportJSON()` dumps every entity plus the latent truth parameters, so a Python track can also load a world from JSON instead of regenerating it.
- The stack's contracts (the log schema, the join semantics, feature strings hashed with FNV-1a into `2^hashBits` buckets, and the code-slot signatures) are plain data and functions that map one-to-one to Python.
