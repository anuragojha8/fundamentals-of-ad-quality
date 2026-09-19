/* Edit mode: read the book, fix sentences in place, export the changes.
 *
 * Load it from a bookmarklet while the local server is running:
 *   javascript:(function(){var s=document.createElement('script');s.src='/tools/edit-mode.js';document.body.appendChild(s);})()
 *
 * Nothing here ships: tools/ is not copied into the published site (netlify.toml),
 * and this file is never referenced by a chapter. Edits live in localStorage until
 * you export them, so you can edit across chapters in one sitting.
 */
(function () {
  if (window.__aqEdit) { window.__aqEdit.toggle(); return; }

  var KEY = 'faq-edits-v1';
  var FILE = location.pathname.replace(/^\//, '') || 'index.html';

  /* ---------- which blocks are editable ---------- */
  // Prose only. Widgets render their own content, code cells hold the reader's
  // code, and KaTeX spans are rendered math — editing any of those is meaningless.
  var SELECTOR = 'main p, main li, main h1, main h2, main h3, main figcaption, main dd, main .q, main .label, main .w-title, main .w-sub';
  function editable(el) {
    if (el.closest('.code-cell, .cm-editor, .chart, [contenteditable="true"] *')) return false;
    if (el.querySelector('.katex, svg, input, button, textarea')) return false;
    if (el.closest('[id^="w-"]') && !el.matches('.w-title, .w-sub')) return false;  // widget output
    if (!el.textContent.trim()) return false;
    return true;
  }

  /* ---------- addressing a block, stably ---------- */
  // Index among all candidate blocks on the page, plus the opening text, so a
  // stale edit can be spotted when it's applied rather than landing in the wrong place.
  var blocks = [];
  function collect() {
    blocks = Array.prototype.filter.call(document.querySelectorAll(SELECTOR), editable);
    return blocks;
  }

  /* ---------- store ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  var store = load();
  function edits() { return store[FILE] || (store[FILE] = {}); }
  function count() { return Object.keys(store).reduce(function (n, f) { return n + Object.keys(store[f]).length; }, 0); }

  /* ---------- UI ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.aq-ed-on [data-aq-i]{outline:1px dashed rgba(120,120,120,.45);outline-offset:4px;border-radius:3px}',
    '.aq-ed-on [data-aq-i]:hover{outline-color:var(--accent);background:var(--accent-soft)}',
    '.aq-ed-on [data-aq-i][data-aq-changed]{outline:none;box-shadow:-3px 0 0 var(--accent);background:var(--accent-soft)}',
    '.aq-ed-on [data-aq-i]:focus{outline:2px solid var(--accent);background:var(--card)}',
    '.aq-note{margin:10px 0;padding:10px 12px;border-left:3px solid var(--amber);background:var(--amber-soft);',
    '  font:13px/1.5 var(--sans);color:var(--ink-2);border-radius:0 8px 8px 0}',
    '.aq-bar{position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;gap:8px;align-items:center;',
    '  padding:10px 12px;border:1px solid var(--rule);border-radius:12px;background:var(--card);',
    '  box-shadow:var(--shadow);font:13px/1 var(--sans);color:var(--ink)}',
    '.aq-bar button{font:600 12px/1 var(--sans);padding:7px 10px;border-radius:8px;border:1px solid var(--rule);',
    '  background:var(--paper-2);color:var(--ink);cursor:pointer}',
    '.aq-bar button.p{background:var(--accent);border-color:var(--accent);color:#fff}',
    '.aq-bar b{font-weight:700}'
  ].join('\n');
  document.head.appendChild(css);

  var bar = document.createElement('div');
  bar.className = 'aq-bar';
  bar.innerHTML = '<span>Edit mode · <b id="aq-n">0</b> edits</span>' +
    '<button id="aq-copy" class="p">Copy edits</button>' +
    '<button id="aq-file">Download</button>' +
    '<button id="aq-reset">Discard</button>' +
    '<button id="aq-off">Exit</button>';
  document.body.appendChild(bar);
  function refresh() { document.getElementById('aq-n').textContent = count(); }

  /* ---------- turn the page editable ---------- */
  function apply(el, i) {
    el.setAttribute('data-aq-i', i);
    el.setAttribute('contenteditable', 'true');
    el.spellcheck = true;
    var original = el.innerHTML;
    var saved = edits()[i];
    if (saved) { el.innerHTML = saved.after; el.setAttribute('data-aq-changed', '1'); }
    el.addEventListener('blur', function () {
      var now = el.innerHTML;
      var base = saved ? saved.before : original;
      if (now.trim() === base.trim()) { delete edits()[i]; el.removeAttribute('data-aq-changed'); }
      else { edits()[i] = { before: base, after: now, text: el.textContent.slice(0, 80) }; el.setAttribute('data-aq-changed', '1'); }
      save(store); refresh();
    });
    // Enter should not create new blocks inside a paragraph; shift+enter still can.
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); } });
  }

  // Surface the <!-- ANURAG: ... --> prompts so they can be answered while reading.
  function showNotes() {
    var walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_COMMENT);
    var n, found = [];
    while ((n = walker.nextNode())) if (n.nodeValue.indexOf('ANURAG:') >= 0) found.push(n);
    found.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'aq-note';
      d.textContent = '✎ ' + c.nodeValue.replace(/ANURAG:\s*/, '').trim();
      c.parentNode.insertBefore(d, c.nextSibling);
    });
  }

  function on() {
    document.body.classList.add('aq-ed-on');
    collect().forEach(apply);
    showNotes();
    refresh();
  }
  function off() {
    document.body.classList.remove('aq-ed-on');
    blocks.forEach(function (el) { el.removeAttribute('contenteditable'); });
    bar.remove(); css.remove();
    Array.prototype.forEach.call(document.querySelectorAll('.aq-note'), function (n) { n.remove(); });
    delete window.__aqEdit;
  }

  /* ---------- export ---------- */
  function payload() {
    var out = [];
    Object.keys(store).forEach(function (file) {
      Object.keys(store[file]).forEach(function (i) {
        var e = store[file][i];
        out.push({ file: file, index: +i, before: e.before, after: e.after });
      });
    });
    return JSON.stringify({ generated: new Date().toISOString(), edits: out }, null, 1);
  }
  document.getElementById('aq-copy').onclick = function () {
    navigator.clipboard.writeText(payload()).then(function () {
      var b = document.getElementById('aq-copy'); b.textContent = 'Copied ✓';
      setTimeout(function () { b.textContent = 'Copy edits'; }, 1500);
    });
  };
  document.getElementById('aq-file').onclick = function () {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload()], { type: 'application/json' }));
    a.download = 'edits.json'; a.click();
  };
  document.getElementById('aq-reset').onclick = function () {
    if (!confirm('Discard all ' + count() + ' edits, including ones made on other chapters?')) return;
    store = {}; save(store); location.reload();
  };
  document.getElementById('aq-off').onclick = off;

  window.__aqEdit = { toggle: off, payload: payload, store: function () { return store; } };
  on();
  console.log('Edit mode on. Click any paragraph to edit. ' + count() + ' edits stored so far.');
})();
