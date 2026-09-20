# Visual style guide

The look is **warm editorial**: ivory paper, deep charcoal ink, one burnt-orange accent,
serif for reading, sans for anything the reader operates. A page should read like a
well-set book that happens to have working machinery in it — not like a dashboard and
not like a slide deck.

This document is the contract. If you are adding or restyling anything, match these
numbers rather than inventing new ones. Everything is driven by the custom properties in
`assets/book.css`; **never write a hex colour anywhere else.**

---

## 1. Type scale

Two families do all the work: `--serif` (Source Serif 4) for prose, `--sans` (Inter) for
anything interactive, structural or annotative. `--mono` (JetBrains Mono) is for numbers
the reader compares and for code.

| Level | Size | Family | Used for |
|---|---|---|---|
| `h1` | `clamp(34px, 6vw, 50px)` | serif 700 | Chapter title. One per page. |
| `.dek` | 21px italic | serif, `--ink-2` | The one-line subtitle under `h1`. |
| `h2` | 30px | serif | Section. Carries a `.sec` number in `--accent` sans. |
| `h3` | 18px | sans | Subsection. Sans on purpose — it reads as a label, not prose. |
| body | 19px / 1.65 | serif | Running text. 18px below 600px. |
| `.lead` | 21px | serif | First paragraph of a chapter, sparingly. |
| widget UI | 15px | sans | Anything inside `.widget`, `.quiz`, `.code-cell`. |
| caption | 13.5px | sans, `--ink-3` | `figcaption`, `.w-sub`. |
| micro | 11.5–12px | sans, `--ink-3` | Stat keys, table headers, legends, SVG detail text. |
| kicker | 11–13px, `.08em` tracking, uppercase | sans | `.kicker`, `.label`, `.qhead`, `.build-step`. |

**The figure-type rule.** Everything inside a figure — `figcaption`, chart tick labels,
SVG box labels — lives in one narrow band: **13.5px primary, 11.5px secondary.** A
`figcaption` and the label inside the picture above it are the same size on purpose. If
text inside an SVG is bigger than the body text around it, it is wrong.

**Never** introduce a size between two of these. Reach for an existing level.

## 2. Spacing rhythm

Base unit is 4px; block-level spacing lands on multiples of 8.

- Paragraph gap `1.05em`. Lists `1.1em`.
- `h2` gets `2.2em` above, `.5em` below. `h3` gets `1.8em` / `.4em`. The large space above
  a heading is what creates the page's rhythm — don't collapse it to make things fit.
- **Block elements in the reading flow all use `2em` vertical margin**: `figure`,
  `.widget`, `.code-cell`, `.table-wrap`. Callouts sit slightly tighter at `1.6em`
  because they are asides inside the argument, not breaks in it. `.quiz` / `.exercise` /
  `.reflect` use `1.8em`.
- `hr` uses `3em` — it is a real section break and should feel like one.
- **Bleed.** Interactive blocks (`.widget`, `.code-cell`) break the 720px measure:
  `margin-inline: -8px` on narrow screens, `-40px` at ≥900px. Static figures do **not**
  bleed; they stay inside the measure. This is the main signal that tells a reader
  "this one does something".

## 3. Colour tokens and what each is for

Defined once in `:root` and redefined for dark mode. Use the token, never the value.

**Surfaces**

| Token | Meaning |
|---|---|
| `--paper` | The page. |
| `--paper-2` | Recessed surface: inline code, `pre`, `.stat`, `.note`, `.recap`, status strips. |
| `--card` | Raised surface: `.widget`, `.card`, `.quiz`, SVG box fills. |
| `--rule` | Every border and hairline. |
| `--grid` | Chart gridlines and table row separators only. Quieter than `--rule`. |
| `--shadow` | Raised cards only. Never on SVG shapes. |

**Ink**

`--ink` body text and primary labels · `--ink-2` secondary prose, control labels ·
`--ink-3` captions, axes, arrows, neutral structure.

**Semantic hues.** Each has a `-soft` companion for fills. These are *meanings*, not a
palette to rotate through:

| Token | Means |
|---|---|
| `--accent` (burnt orange) | The reader's attention. The current step, the selected thing, the answer to the question the figure asks. Also links and the `INTERACTIVE` badge. |
| `--blue` | Inputs, data, logged facts — things that arrive from outside. Also `.reflect`. |
| `--green` | Good outcome, success, winner, "counted", passing tests. |
| `--red` | Failure, traps, wrong answers. |
| `--violet` | Machinery the reader operates: model internals, code cells, the stack. |
| `--amber` | Warnings; the reference implementation standing in for the reader's. |
| `--s1`…`--s6` | Chart **series** colours, in order. Never for UI or diagram semantics. |

> **The one rule that matters:** a tone must encode something. If a diagram alternates
> colours row by row for visual variety, that is a bug — it tells the reader a difference
> exists where none does. Neutral (`--card` / `--ink-3`) is the correct colour for "this
> box is not special".

## 4. Anatomy of the four block types

These four look different because they ask different things of the reader. Keep them
distinguishable.

### Figure — `<figure class="diagram">`
A static picture. **A figure is not a card.** No border, no background, no shadow, no
radius — just the SVG on the paper, with a `figcaption` beneath it. It stays inside the
720px measure.

```html
<figure class="diagram">
  <svg viewBox="0 0 760 240" role="img" aria-label="…">…</svg>
  <figcaption>What to notice.</figcaption>
</figure>
```

### Widget — `<div class="widget">`
Something the reader operates. Card: `--card`, 1px `--rule`, **14px radius**, `--shadow`,
bleeding past the measure. Fixed internal order:

1. `.w-title` — auto-prefixed with the orange `INTERACTIVE` badge via `::before`.
2. `.w-sub` — one or two sentences in `--ink-3` saying what to try and what is
   illustrative vs. computed from the reader's own stack.
3. Controls — `.btn-row`, `.controls`, `.seg`. **Exactly one** primary `.btn`; everything
   else is `.btn.secondary`. Four solid dark buttons in a row is wrong.
4. The picture / chart / table.
5. `.aq-status` — a `role="status"` live region on `--paper-2` with an `--accent` left
   rule. It must **always hold a sentence**, including before first interaction. Reserve
   its height so the layout does not jump.

### Callout — `<aside class="callout pm|intuition|trap|deep|story">`
An aside inside the argument. Tinted `-soft` background, 25%-mixed border, 10px radius,
uppercase `.label` in the matching hue. Sits inside the measure.

### Code cell — `<div class="code-cell">`
The reader writes code. Card with a **4px violet left rule** — that rule is the signature;
nothing else in the book has it. `.cc-kicker` badge, title, status, editor, buttons,
results.

## 5. Diagram rules

Diagrams are hand-laid-out SVG, either inline in a chapter or generated by
`assets/diagrams.js`. They share `.diagram` / `.aq-diagram` styling from `book.css` and
`diagrams.css`.

### The unit rule
**One SVG user unit = one CSS pixel.** The viewBox width is chosen to match the element's
real rendered width, so nothing is scaled:

- `760` — full-width diagram (a widget bleeding to ≈750px, or a figure in the 720px measure).
- `400` — the narrow layout, below 600px.

`diagrams.js` exposes this as `VW`. **Do not keep a 760 viewBox on a phone and inflate the
font sizes to compensate** — that is what made the previous pass look like a slide deck,
because the inflated type then rendered at 30px on desktop. Re-lay-out into the narrow
viewBox instead, and re-render on the breakpoint change.

### Geometry

| Thing | Value |
|---|---|
| Box corner radius | `8` (standard), `10` (full-width band or large panel), `3` (bars, chips) |
| Box stroke | `1.2` |
| Arrow stroke | `1.4`, `--ink-3`, `stroke-linecap: round` |
| Emphasis stroke | `2` — used only to mark the current/selected shape |
| Full-width band | `x: 24`, `width: 688`, `height: 56`, pitch `78` (56 + 22 gap) |
| Two-up panels | `width: 336` at `x: 24` and `x: 400` |
| Tint spine | `3 × 32` rounded rect inset 1px from a band's left edge, in the band's hue |

### Type inside SVG
`.t-md` = 13.5px, `.t-sm` = 11.5px `--ink-2`, `.t-b` = bold. That is the whole scale.
**Two lines of text per box, maximum** — a title and one detail. If you need a third line,
you need a second box or a `figcaption`.

### Arrows
One shared marker per SVG (`orient="auto-start-reverse"`, 7×7). Orthogonal runs or gentle
curves only. A feedback arrow routes outside the boxes, in the `712–760` gutter on the
right or `0–24` on the left. Dashed (`stroke-dasharray: 3 3`) means "informational /
not the main flow".

### Showing state
Change the box's **tone class** (`box` → `box a` / `b` / `g` / `v`), and for the single
*current* shape add a 2px stroke. Dim what is out of play with `opacity: .58`.

**No gradient fills, no drop shadows, no glows inside SVG.** Flat `-soft` fills only. The
book's depth cue is the card the picture sits in, not the picture itself.

### How much goes in one picture
One idea. Around **8 shapes** is the ceiling; past that, split it or make it a widget with
stages. A diagram that needs a paragraph of explanation inside it is a table.

## 6. Chart conventions

Charts come from `Book.chart(container, opts)`.

- **Pass `w` equal to the chart's real rendered width** — `VW` for a full-width chart,
  ~`360` for one in a `.w-grid.two` column. Leave `h` between 180 and 260; taller charts
  break the page rhythm.
- Default margins are tuned for 11.5px tick text. Only widen `margin.l` for long y labels.
- Gridlines `--grid`; axis line and ticks `--ink-3`; tick text 11.5px, axis titles
  (`.lbl`) 12px `--ink-2`.
- Series use `--s1`…`--s6` in order. A single-series chart uses `--s1`.
- `line` 2.2px; `area` at 0.15 opacity in the line's colour; `dots` r 3.5 default.
- Reference lines: dashed `--ink-3`. The **one** line representing the reader's current
  setting is solid `--accent`.
- Anything with more than one series gets a `Book.legend`, not inline labels.

## 7. Motion

- **Reader-triggered, never ambient.** Nothing animates on scroll or on load. An animation
  starts because the reader pressed a button.
- **Replayable, not looping.** A sequence runs once and stops on its final state, and the
  play button becomes *Replay*. Always ship Pause and Reset alongside it, and a
  *Next stage* control so the reader can go at their own speed.
- Durations: state transitions 300–700ms, `cubic-bezier(.22,.68,.3,1)`. Stage dwell ~1.7s.
- Stop the timer on `visibilitychange` when the tab is hidden.
- **`prefers-reduced-motion: reduce`** must be honoured in both places:
  CSS sets `transition: none`, and the JS play button jumps straight to the final state
  and relabels itself (*Show result*). The reader must still be able to reach every stage
  via the non-animated controls.

## 8. Mobile rules (≤600px, test at 375px)

- **No horizontal page scroll, ever.** Verify with `document.documentElement.scrollWidth`.
- Diagrams switch to the `400` viewBox and a single column — they do not shrink.
- `.widget` padding drops to `16px 12px`; bleed drops to `-8px`.
- Multi-column grids (`.w-grid.two`, `.terms`, `.stats`) collapse to one column.
- Touch targets ≥ 38px tall. `.btn` already guarantees this; keep `.btn-row` gap at 8px so
  targets don't merge.
- Wide tables stay in `.table-wrap` (`overflow-x: auto`). A scrolling table is fine; a
  scrolling page is not.

## 9. Dark mode rules

Dark mode is the same layout with re-pointed tokens; there is no separate dark stylesheet.

- Every colour must come from a token. A hardcoded hex will look correct in exactly one
  mode, and there is no lint for it.
- `-soft` fills become dark, low-chroma tints. They are still **fills**, so text on them
  stays `--ink`; never assume a soft fill is light.
- Hues brighten in dark mode (`--accent` goes `#c2410c` → `#fb923c`) so that strokes and
  1px rules survive on a dark ground. Do not compensate by thickening strokes.
- Shadows are nearly invisible on dark paper — **separation must come from `--rule`**, not
  from `--shadow`. Any card that relies on shadow alone to be legible is broken in dark
  mode.
- `color-scheme` is set on `:root` in both modes so form controls and scrollbars follow.
- Both the `prefers-color-scheme` block and the `[data-theme="dark"]` block must be kept
  in sync — they are duplicated deliberately so an explicit toggle can override the OS.

---

## Checklist before committing a visual change

1. `node tests/run-tests.js --quick` passes.
2. All 20 pages load with no console errors, and every `[id^="w-"]` element is non-empty.
3. Light **and** dark mode.
4. 375px wide with no horizontal scroll.
5. No new hex colours: `grep -nE '#[0-9a-fA-F]{3,6}' assets/diagrams.css assets/diagrams.js`
   should return nothing.
6. `prefers-reduced-motion` still reaches every state.
