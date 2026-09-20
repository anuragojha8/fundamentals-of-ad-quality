/* Theme lab: repaint the book in the "Technical Monograph" system from DESIGN.md.
 *
 * Bookmarklet:
 *   javascript:(function(){var s=document.createElement('script');s.src='/tools/theme-monograph.js';document.body.appendChild(s);})()
 *
 * Click once to apply, again to revert. Nothing is saved and nothing ships — this is a
 * try-before-you-buy for a visual direction, not a second stylesheet in the book.
 *
 * Everything below is a token override. It works at all only because the book already
 * drives every colour, family and radius through custom properties; that's the real
 * test of whether a design system can be swapped without touching markup.
 */
(function () {
  var ID = 'aq-theme-monograph';
  var existing = document.getElementById(ID);
  if (existing) {
    existing.remove();
    var oldBar = document.getElementById(ID + '-bar');
    if (oldBar) oldBar.remove();
    console.log('Monograph theme off.');
    return;
  }

  var fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.id = ID + '-fonts';
  fonts.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
  document.head.appendChild(fonts);

  var css = document.createElement('style');
  css.id = ID;
  css.textContent = `
/* ---- light: warm porcelain, cobalt primary ---- */
:root, :root[data-theme="light"] {
  --paper: #fbfbfa;
  --paper-2: #f1f1ee;
  --card: #ffffff;
  --ink: #111c2d;
  --ink-2: #434655;
  --ink-3: #6b6e7e;
  --rule: #e4e6ec;
  --grid: #eceef3;

  --accent: #1d4ed8;          /* Algorithmic Core */
  --accent-soft: #eff6ff;
  --blue: #1d4ed8;  --blue-soft: #eff6ff;
  --amber: #d97706; --amber-soft: #fffbeb;   /* Auction mechanics */
  --green: #059669; --green-soft: #ecfdf5;   /* Runtime / tests pass */
  --violet: #6366f1; --violet-soft: #eef2ff; /* Learning & embeddings */
  --red: #e11d48;   --red-soft: #fff1f2;     /* Ground truth violations */
  --s1: #1d4ed8; --s2: #d97706; --s3: #059669; --s4: #6366f1; --s5: #0891b2; --s6: #e11d48;

  --serif: 'Newsreader', Georgia, serif;
  --sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --measure: 680px;
  --shadow: 0 1px 3px rgba(15,23,42,.04), 0 8px 24px -6px rgba(15,23,42,.03);
}

/* ---- dark: obsidian slate ---- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #0b0f17; --paper-2: #1e2638; --card: #151b28;
    --ink: #ecf1ff; --ink-2: #c3c7d6; --ink-3: #8d92a5;
    --rule: rgba(255,255,255,.12); --grid: rgba(255,255,255,.08);
    --accent: #7aa2ff; --accent-soft: #16244a;
    --blue: #7aa2ff; --blue-soft: #16244a;
    --amber: #f59e0b; --amber-soft: #3a2a10;
    --green: #34d399; --green-soft: #10291f;
    --violet: #a5b4fc; --violet-soft: #1e1f3d;
    --red: #fb7185; --red-soft: #3a1620;
    --s1: #7aa2ff; --s2: #f59e0b; --s3: #34d399; --s4: #a5b4fc; --s5: #22d3ee; --s6: #fb7185;
    --shadow: 0 1px 3px rgba(0,0,0,.4), 0 8px 24px -6px rgba(0,0,0,.35);
  }
}
:root[data-theme="dark"] {
  --paper: #0b0f17; --paper-2: #1e2638; --card: #151b28;
  --ink: #ecf1ff; --ink-2: #c3c7d6; --ink-3: #8d92a5;
  --rule: rgba(255,255,255,.12); --grid: rgba(255,255,255,.08);
  --accent: #7aa2ff; --accent-soft: #16244a;
  --blue: #7aa2ff; --blue-soft: #16244a;
  --amber: #f59e0b; --amber-soft: #3a2a10;
  --green: #34d399; --green-soft: #10291f;
  --violet: #a5b4fc; --violet-soft: #1e1f3d;
  --red: #fb7185; --red-soft: #3a1620;
  --s1: #7aa2ff; --s2: #f59e0b; --s3: #34d399; --s4: #a5b4fc; --s5: #22d3ee; --s6: #fb7185;
  --shadow: 0 1px 3px rgba(0,0,0,.4), 0 8px 24px -6px rgba(0,0,0,.35);
}

/* ---- type scale from DESIGN.md ---- */
body { font-size: 18px; line-height: 30px; }
main p, main li, .chapter > p, .chapter > ul li, .chapter > ol li { font-size: 18px; line-height: 30px; }
h1 { font-weight: 400; letter-spacing: -.015em; }
h2 { font-family: var(--sans); font-size: 22px; font-weight: 600; line-height: 30px; letter-spacing: -.01em; }
h3 { font-family: var(--sans); font-size: 17px; font-weight: 600; line-height: 24px; }
.dek { font-family: var(--serif); font-style: italic; }
.label, .kicker, .w-title { font-family: var(--sans); letter-spacing: .04em; text-transform: none; }
.stats .v, .terms b { font-family: var(--mono); }

/* ---- shapes: compact, instrument-like ---- */
.widget, .callout, .code-cell, .table-wrap, .quiz, .reflect, .recap, figure.aq-diagram, .stat {
  border-radius: 6px;
}
button, .btn, input, select, textarea { border-radius: 4px !important; }
.pill, .progress-pill, .badge, .tag { border-radius: 9999px !important; }

/* ---- elevation: hairlines, not shadows ---- */
.widget, .code-cell, .stat { border: 1px solid var(--rule); box-shadow: var(--shadow); }
.callout { box-shadow: none; border-left-width: 3px; }
`;
  document.head.appendChild(css);

  var bar = document.createElement('div');
  bar.id = ID + '-bar';
  bar.style.cssText = 'position:fixed;left:18px;bottom:18px;z-index:9999;display:flex;gap:8px;align-items:center;' +
    'padding:9px 12px;border:1px solid var(--rule);border-radius:6px;background:var(--card);color:var(--ink);' +
    'font:600 12px/1 var(--sans);box-shadow:var(--shadow)';
  bar.innerHTML = '<span>Monograph theme</span><button style="font:600 11px/1 var(--sans);padding:6px 9px;border-radius:4px;border:1px solid var(--rule);background:var(--paper-2);color:var(--ink);cursor:pointer">Revert</button>';
  bar.querySelector('button').onclick = function () { css.remove(); fonts.remove(); bar.remove(); };
  document.body.appendChild(bar);
  console.log('Monograph theme on. Click the bookmarklet again, or Revert, to go back.');
})();
