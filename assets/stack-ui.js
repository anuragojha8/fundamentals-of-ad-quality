/* Fundamentals of Ad Quality — UI for the reader's stack.
 *   <div class="code-cell" data-slot="runAuction"></div>   → editor + tests for a code slot
 *   <div class="stack-panel" data-chapter="7"></div>       → "your stack so far" + load reference
 * Plus helpers used by chapter widgets: progress bars, async buttons, tables. */
(function () {
  'use strict';
  var el = Book.el;
  var ASSET_BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.slice(0, s.lastIndexOf('/') + 1) : '../assets/';
  })();

  var COMPONENTS = [
    { ch: 1, label: 'Request loop', sub: 'eligibility + heuristic pCTR' },
    { ch: 2, label: 'GSP auction', sub: 'ranking & pricing' },
    { ch: 3, label: 'Calibration', sub: 'predictions → prices' },
    { ch: 4, label: 'Logging & joins', sub: 'labels from events' },
    { ch: 5, label: 'Exploration', sub: 'position bias & IPW' },
    { ch: 6, label: 'Features', sub: 'hashing, counts, crosses' },
    { ch: 7, label: 'Logistic regression', sub: 'trained on your logs' },
    { ch: 8, label: 'Losses', sub: 'log, MSE, Poisson, pairwise' },
    { ch: 9, label: 'Evaluation & A/B', sub: 'AUC, NE, ship decision' },
    { ch: 10, label: 'Two-tower retrieval', sub: 'embeddings, recall@K' },
    { ch: 11, label: 'Deep ranker', sub: 'crosses + attention' },
    { ch: 12, label: 'Conversion model', sub: 'delayed labels, ESMM' },
    { ch: 13, label: 'Privacy reporting', sub: 'aggregates & noise' },
    { ch: 14, label: 'Freshness', sub: 'drift & retraining' },
    { ch: 15, label: 'Quality & ad load', sub: 'pHide, λ, slots' }
  ];

  /* ---------------- progress & buttons ---------------- */
  function progressBar(container) {
    var bar = el('div', { class: 'pbar' }, [el('div', { class: 'pbar-fill' })]);
    var label = el('span', { class: 'pbar-label muted small' });
    var wrap = el('div', { class: 'pbar-wrap', style: 'display:none' }, [bar, label]);
    container.appendChild(wrap);
    return {
      el: wrap,
      set: function (p, text) { wrap.style.display = ''; bar.firstChild.style.width = Math.round(100 * Math.min(1, p)) + '%'; if (text != null) label.textContent = text; },
      done: function (text) { bar.firstChild.style.width = '100%'; label.textContent = text || 'Done'; setTimeout(function () { if (label.textContent === (text || 'Done')) wrap.style.display = 'none'; }, text ? 60000 : 900); },
      hide: function () { wrap.style.display = 'none'; }
    };
  }
  // A button that runs an async task, shows progress and prevents double runs.
  function asyncButton(container, label, task, opts) {
    opts = opts || {};
    var btn = el('button', { type: 'button', class: 'btn ' + (opts.cls || 'accent'), text: label });
    var row = el('div', { class: 'btn-row' }, [btn]);
    container.appendChild(row);
    var pb = progressBar(opts.progressHost || container);
    btn.addEventListener('click', async function () {
      if (btn.disabled) return;
      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = opts.busy || 'Running…';
      try { await task(function (p, text) { pb.set(p, text); }); pb.hide(); }
      catch (e) { console.error(e); pb.set(1, 'Something went wrong: ' + (e && e.message || e)); }
      btn.disabled = false; btn.textContent = old;
    });
    return { btn: btn, row: row, progress: pb };
  }

  /* ---------------- sandboxed test runs ---------------- */
  var workerOK = location.protocol === 'http:' || location.protocol === 'https:';
  function runTestsSandboxed(slot, src) {
    if (!workerOK || typeof Worker === 'undefined') return Promise.resolve(Stack.runTests(slot, src));
    return new Promise(function (resolve) {
      var code = [
        'importScripts(' + JSON.stringify(ASSET_BASE + 'world.js') + ',' + JSON.stringify(ASSET_BASE + 'nn.js') + ',' + JSON.stringify(ASSET_BASE + 'stack.js') + ');',
        'onmessage = function (e) {',
        '  var st = self.Stack.state; st.seed = e.data.seed; st.code = e.data.code;',
        '  postMessage(self.Stack.runTests(e.data.slot, e.data.src));',
        '};'
      ].join('\n');
      var w;
      try { w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))); }
      catch (e) { workerOK = false; resolve(Stack.runTests(slot, src)); return; }
      var timer = setTimeout(function () {
        w.terminate();
        resolve({ ok: false, results: [{ name: 'Finishes within 8 seconds', pass: false, detail: 'Your code is still running after 8 s. Is there an infinite loop (a while loop that never ends)?' }] });
      }, 8000);
      w.onmessage = function (e) { clearTimeout(timer); w.terminate(); resolve(e.data); };
      w.onerror = function (e) {
        clearTimeout(timer); w.terminate();
        // Worker failed to boot (e.g. blocked importScripts) — fall back to the page.
        workerOK = false; resolve(Stack.runTests(slot, src));
      };
      w.postMessage({ slot: slot, src: src, seed: Stack.state.seed, code: Stack.state.code });
    });
  }

  /* ---------------- code cells ---------------- */
  var cells = {};
  function initCodeCell(host) {
    var id = host.getAttribute('data-slot'), def = Stack.SLOTS[id];
    if (!def) { host.textContent = 'Unknown code slot ' + id; return; }
    var checkId = 'code-' + id;
    Book.requireCheck(checkId);
    var saved = Stack.state.code[id];
    var draftKey = 'faq-draft-' + id, draft = null;
    try { draft = localStorage.getItem(draftKey); } catch (e) {}
    var initial = draft != null ? draft : saved ? saved.src : def.starter;

    var status = el('span', { class: 'cc-status' });
    var head = el('div', { class: 'cc-head' }, [el('span', { class: 'cc-kicker', text: 'BUILD · Ch. ' + def.chapter }), el('span', { class: 'cc-title', text: def.title }), status]);
    var area = el('textarea', { class: 'cc-text', spellcheck: 'false', 'aria-label': 'Code editor for ' + def.title });
    area.value = initial;
    var edWrap = el('div', { class: 'cc-editor' }, [area]);
    var runBtn = el('button', { type: 'button', class: 'btn accent', html: '▶ Run tests <span class="kbd">⌘↵</span>' });
    var resetBtn = el('button', { type: 'button', class: 'btn secondary', text: 'Reset to starter' });
    var refBtn = el('button', { type: 'button', class: 'btn secondary', text: 'Show reference solution' });
    var results = el('div', { class: 'cc-results' });
    host.appendChild(head); host.appendChild(edWrap);
    host.appendChild(el('div', { class: 'btn-row cc-buttons' }, [runBtn, resetBtn, refBtn]));
    host.appendChild(results);

    var cm = null;
    if (window.CodeMirror) {
      cm = window.CodeMirror.fromTextArea(area, {
        mode: 'javascript', lineNumbers: true, indentUnit: 2, tabSize: 2, matchBrackets: true, viewportMargin: Infinity, lineWrapping: false,
        extraKeys: { 'Cmd-Enter': run, 'Ctrl-Enter': run, Tab: function (c) { c.replaceSelection('  '); } }
      });
      cm.on('change', function () { try { localStorage.setItem(draftKey, cm.getValue()); } catch (e) {} });
    } else {
      area.rows = Math.max(8, initial.split('\n').length + 1);
      area.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
        if (e.key === 'Tab') { e.preventDefault(); var s = area.selectionStart; area.value = area.value.slice(0, s) + '  ' + area.value.slice(area.selectionEnd); area.selectionStart = area.selectionEnd = s + 2; }
      });
      area.addEventListener('input', function () { try { localStorage.setItem(draftKey, area.value); } catch (e) {} });
    }
    function getSrc() { return cm ? cm.getValue() : area.value; }
    function setSrc(s) { if (cm) cm.setValue(s); else area.value = s; try { localStorage.setItem(draftKey, s); } catch (e) {} }

    function renderStatus() {
      var c = Stack.state.code[id];
      if (c && c.passed) {
        var isRef = c.src.trim() === def.reference.trim();
        status.className = 'cc-status ' + (isRef ? 'ref' : 'ok');
        status.textContent = isRef ? '◐ Reference solution in use' : '✓ Your code is live in the stack';
      } else { status.className = 'cc-status'; status.textContent = '○ Stack is using the reference until your tests pass'; }
    }
    renderStatus();

    function showResults(res) {
      results.innerHTML = '';
      res.results.forEach(function (r) {
        var line = el('div', { class: 'cc-line ' + (r.info ? 'info' : r.pass ? 'pass' : 'fail') }, [
          el('span', { class: 'cc-mark', text: r.info ? 'ℹ' : r.pass ? '✓' : '✗' }), el('span', { text: r.name })
        ]);
        results.appendChild(line);
        if (r.detail) results.appendChild(el('div', { class: 'cc-detail', text: r.detail }));
      });
      var nPass = res.results.filter(function (r) { return !r.info && r.pass; }).length, nAll = res.results.filter(function (r) { return !r.info; }).length;
      results.appendChild(el('div', { class: 'cc-summary ' + (res.ok ? 'pass' : 'fail'), text: res.ok ? 'All ' + nAll + ' tests pass. Your ' + id + '() is now part of your stack.' : nPass + ' of ' + nAll + ' tests pass.' }));
    }
    async function run() {
      runBtn.disabled = true;
      results.innerHTML = '<div class="muted small">Running tests…</div>';
      var src = getSrc();
      var res = await runTestsSandboxed(id, src);
      runBtn.disabled = false;
      showResults(res);
      var wasPassing = Stack.state.code[id] && Stack.state.code[id].passed;
      if (res.ok) {
        Stack.saveCode(id, src, true);
        Book.solve(checkId);
      } else if (!wasPassing) {
        Stack.saveCode(id, src, false);
      } else {
        results.appendChild(el('div', { class: 'cc-detail', text: 'Your previous passing version stays live in the stack until this one passes.' }));
      }
      renderStatus();
      host.dispatchEvent(new CustomEvent('slotchange', { bubbles: true, detail: { slot: id, ok: res.ok } }));
      document.dispatchEvent(new CustomEvent('stackchange', { detail: { slot: id } }));
    }
    runBtn.addEventListener('click', run);
    resetBtn.addEventListener('click', function () { if (confirm('Replace your code with the starter?')) setSrc(def.starter); });
    refBtn.addEventListener('click', function () {
      if (!confirm('Load the reference solution into the editor? (Try it yourself first — the tests tell you what\'s wrong.)')) return;
      setSrc(def.reference); run();
    });
    if (saved && saved.passed) Book.solve(checkId);
    cells[id] = { run: run };
  }

  /* ---------------- "your stack" panel ---------------- */
  function initPanel(host) {
    var ch = parseInt(host.getAttribute('data-chapter'), 10);
    function render() {
      host.innerHTML = '';
      var st = Stack.state;
      host.appendChild(el('div', { class: 'sp-head' }, [el('b', { text: 'Your ad stack' }), el('span', { class: 'muted small', text: ch > 1 ? ' — what you\'ve built so far, and what this chapter adds' : ' — you start building it in this chapter' })]));
      var row = el('div', { class: 'sp-row' });
      COMPONENTS.forEach(function (c) {
        var b = st.built[c.ch], cls = b === 'you' ? 'you' : b === 'reference' ? 'ref' : c.ch === ch ? 'now' : 'none';
        if (c.ch > ch && cls === 'none') cls = 'future';
        var mark = cls === 'now' ? '★' : cls === 'you' ? '✓' : cls === 'ref' ? '◐' : '○';
        if (c.ch === ch) cls += ' current';
        row.appendChild(el('div', { class: 'sp-chip ' + cls, title: c.sub }, [el('span', { class: 'sp-n', text: mark + ' ' + c.ch }), el('span', { text: c.label })]));
      });
      host.appendChild(row);
      host.appendChild(el('div', { class: 'sp-legend muted small', html: '<span>✓ built by you</span><span>◐ reference solution</span><span>★ this chapter</span><span>○ not built yet</span>' }));
      var s = st.settings;
      var prod = 'Production: ' + (s.retrieval === 'twotower' ? 'two-tower retrieval (top ' + s.retrievalK + ')' : 'all eligible ads') +
        ' → ' + ({ heuristic: 'heuristic pCTR', lr: 'your logistic regression', deep: 'your deep ranker', oracle: 'oracle' }[s.ranker] || s.ranker) +
        (s.calibrate ? ' + calibration' : '') + ' → GSP' + (s.reserveEcpm ? ' (reserve $' + s.reserveEcpm + ' eCPM)' : '') +
        (s.pricing === 'ocpm' ? ', oCPM bidding' : ', CPC bidding') + (s.epsilon ? ' · ' + Math.round(s.epsilon * 100) + '% exploration' : '');
      host.appendChild(el('div', { class: 'sp-prod small', text: prod }));
      if (st.modelsReset && !Object.keys(st.models).length) {
        host.appendChild(el('div', { class: 'note warn', style: 'margin-top:10px', html: '<b>The simulated world was updated</b> since you last trained, so your saved models were cleared. Your code, settings, and progress are kept. Retrain in the model chapters, or load reference solutions below.' }));
      }
      var missing = Stack.missingBefore(ch);
      if (missing.length) {
        var box = el('div', { class: 'note warn', style: 'margin-top:10px' });
        box.appendChild(el('div', { html: '<b>Skipping ahead?</b> Chapter ' + ch + ' builds on ' + (missing.length === 1 ? 'chapter ' : 'chapters ') + rangeText(missing) + ', which you haven\'t built. Load the reference solutions and pick up from here. Anything you did build stays yours.' }));
        var host2 = el('div', { style: 'margin-top:8px' });
        box.appendChild(host2);
        asyncButton(host2, 'Load reference solutions for ' + (missing.length === 1 ? 'Ch. ' : 'Ch. ') + rangeText(missing), async function (progress) {
          await Stack.loadReference(ch, function (p, label) { progress(p, label || 'Working…'); });
          document.dispatchEvent(new CustomEvent('stackchange', { detail: { reference: true } }));
          render();
        }, { busy: 'Loading…' });
        host.appendChild(box);
      }
    }
    render();
    document.addEventListener('stackchange', render);
  }
  function rangeText(list) {
    if (list.length === 1) return String(list[0]);
    var contiguous = list.every(function (x, i) { return i === 0 || x === list[i - 1] + 1; });
    return contiguous ? list[0] + '–' + list[list.length - 1] : list.join(', ');
  }

  /* ---------------- small table helper ---------------- */
  function table(container, columns, rows, opts) {
    opts = opts || {};
    var t = el('table', { class: 'data' });
    var thead = el('thead'), tr = el('tr');
    columns.forEach(function (c) { tr.appendChild(el('th', { class: c.num ? 'num' : '', text: c.label })); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (r, i) {
      var row = el('tr', { class: opts.rowClass ? opts.rowClass(r, i) || '' : '' });
      columns.forEach(function (c) {
        var v = c.get ? c.get(r, i) : r[c.key];
        var td = el('td', { class: c.num ? 'num' : '' });
        if (v instanceof Node) td.appendChild(v); else td.innerHTML = v == null ? '' : String(v);
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    var wrap = el('div', { class: 'table-wrap', style: opts.maxHeight ? 'max-height:' + opts.maxHeight + 'px;overflow:auto;margin:.6em 0' : 'margin:.6em 0' }, [t]);
    container.appendChild(wrap);
    return wrap;
  }

  var CAT_COLORS = ['#2f7d4f', '#56a36c', '#2a8fa8', '#3558c9', '#6a5acd', '#8a63d2', '#d0508f', '#c2410c', '#b8860b', '#d9480f', '#a16207', '#7c6f5b'];
  function catName(c) { return Stack.world().categories[c].name; }
  function adLabel(a) { var w = Stack.world(), ad = w.ads[a]; return w.advertisers[ad.advertiser].name + ' #' + ad.creative; }

  function init() {
    document.querySelectorAll('.code-cell[data-slot]').forEach(initCodeCell);
    document.querySelectorAll('.stack-panel[data-chapter]').forEach(initPanel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.StackUI = { progressBar: progressBar, asyncButton: asyncButton, table: table, cells: cells, CAT_COLORS: CAT_COLORS, catName: catName, adLabel: adLabel, runTestsSandboxed: runTestsSandboxed };
})();
