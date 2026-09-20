/* Fundamentals of Ad Quality — shared book engine.
   Loaded synchronously in <head> of every page so chapter widget scripts can use window.Book. */
(function () {
  'use strict';

  var CHAPTERS = [
    { id: '00-preface', n: '0', part: 'Start Here', title: 'How to Read This Book', blurb: 'Who this is for, the running example, and the map of the ad stack.' },
    { id: '01-two-hundred-ms', n: '1', part: 'I · The Marketplace', title: 'Two Hundred Milliseconds', blurb: 'The life of an ad request: retrieval, ranking, auction, serving, logging — and the latency budget that shapes everything.' },
    { id: '02-auction', n: '2', part: 'I · The Marketplace', title: 'The Auction', blurb: 'eCPM, second-price and GSP, reserve prices, bid types, and why auctions need predictions.' },
    { id: '03-predictions-are-prices', n: '3', part: 'I · The Marketplace', title: 'Predictions Are Prices', blurb: 'Why a 10% miscalibration is a 10% pricing error, and ranking quality vs calibration.' },
    { id: '04-logging', n: '4', part: 'II · Data', title: 'Logging: The Memory of the System', blurb: 'Impressions, events, joins, attribution windows, and why you log features at serve time.' },
    { id: '05-labels-and-bias', n: '5', part: 'II · Data', title: 'Labels and the Biases Hiding in Them', blurb: 'Label design, position bias, selection bias, feedback loops, exploration, and inverse propensity weighting.' },
    { id: '06-features', n: '6', part: 'II · Data', title: 'Features', blurb: 'Dense vs sparse, IDs and embeddings, hashing, counting features, crosses, sequences — and leakage.' },
    { id: '07-how-models-learn', n: '7', part: 'III · Learning', title: 'How a Model Learns', blurb: 'Logistic regression from scratch, gradient descent, learning rates, overfitting, and regularization — trained live in your browser.' },
    { id: '08-losses-and-heads', n: '8', part: 'III · Learning', title: 'Losses and Model Heads', blurb: 'Log loss, MSE, Poisson, pairwise/AUC loss, softmax, multi-task heads, and calibration layers.' },
    { id: '09-evaluation', n: '9', part: 'III · Learning', title: 'Evaluation, Offline and Online', blurb: 'AUC, normalized entropy, calibration, slicing, the offline–online gap, and A/B testing.' },
    { id: '10-retrieval', n: '10', part: 'IV · The Models', title: 'Retrieval', blurb: 'Two-tower models, embeddings, approximate nearest neighbours, negative sampling, and recall.' },
    { id: '11-ranking-architectures', n: '11', part: 'IV · The Models', title: 'Towers, Crosses, and Transformers', blurb: 'The anatomy of a modern ranking model: embeddings, interaction layers, cross towers, multi-task, and attention over user history.' },
    { id: '12-conversion-modeling', n: '12', part: 'IV · The Models', title: 'Conversion Modeling', blurb: 'pCVR, sparse and delayed labels, sample selection bias, ESMM, and value optimization.' },
    { id: '13-privacy', n: '13', part: 'IV · The Models', title: 'Privacy and Measurement', blurb: 'Opt-outs, aggregated and noisy conversion reports, k-anonymity, differential privacy, and modeled conversions.' },
    { id: '14-pretrain-train-refresh', n: '14', part: 'IV · The Models', title: 'Pre-training, Fine-tuning, and Freshness', blurb: 'Foundation embeddings, warm starts, continuous training, distillation, and model staleness.' },
    { id: '15-beyond-the-click', n: '15', part: 'V · The Job', title: 'Quality Beyond the Click', blurb: 'Ad load, user experience, negative feedback, long-term value, and the objective function you actually own.' },
    { id: '16-what-the-ad-caused', n: '16', part: 'V · The Job', title: 'What the Ad Actually Caused', blurb: 'Attribution windows as a label decision, view-through credit, incrementality, holdouts and ghost ads, and why lift is hard to measure.' },
    { id: '17-capstone', n: '17', part: 'V · The Job', title: 'Capstone: Run the Marketplace', blurb: 'A simulation game. Make the calls a real ads quality PM makes, and live with the results.' },
    { id: 'appendix-a-glossary', n: 'A', part: 'Appendices', title: 'Glossary', blurb: 'Every term in the book, in one place.' },
    { id: 'appendix-b-question-bank', n: 'B', part: 'Appendices', title: 'The Model Review Question Bank', blurb: 'The questions to ask in a launch review, a metrics readout, or a roadmap debate.' }
  ];

  var STORE_KEY = 'faq-book-v1';
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
  var store = loadStore();
  store.solved = store.solved || {};
  store.notes = store.notes || {};
  store.required = store.required || {};

  // One-time migration: Chapter 13 (Privacy and Measurement) was inserted, so the
  // old chapters 13-15 became 14-16. Move saved progress onto the new keys, highest
  // number first so nothing is overwritten on the way.
  (function migrateChapter13Insert() {
    if (store.shifted13) return;
    var ids = [['15-capstone', '17-capstone'], ['14-beyond-the-click', '15-beyond-the-click'], ['13-pretrain-train-refresh', '14-pretrain-train-refresh']];
    ids.forEach(function (p) {
      if (store.required[p[0]] && !store.required[p[1]]) { store.required[p[1]] = store.required[p[0]]; delete store.required[p[0]]; }
    });
    ['15', '14', '13'].forEach(function (n) {
      var from = 'ch' + n + '-', to = 'ch' + (Number(n) + 1) + '-';
      [store.solved, store.notes, store.required].forEach(function (bag) {
        Object.keys(bag).forEach(function (k) {
          if (k.indexOf(from) === 0 && !bag[to + k.slice(from.length)]) { bag[to + k.slice(from.length)] = bag[k]; delete bag[k]; }
        });
      });
      // The required lists hold quiz ids too, so shift those as well.
      Object.keys(store.required).forEach(function (chap) {
        var req = store.required[chap];
        if (Array.isArray(req)) store.required[chap] = req.map(function (id) { return id.indexOf(from) === 0 ? to + id.slice(from.length) : id; });
      });
    });
    store.shifted13 = true;
    saveStore(store);
  })();

  // A second insert: Chapter 16 (What the Ad Actually Caused) pushed the capstone to 17.
  (function migrateChapter16Insert() {
    if (store.shifted16) return;
    if (store.required['16-capstone'] && !store.required['17-capstone']) { store.required['17-capstone'] = store.required['16-capstone']; delete store.required['16-capstone']; }
    [store.solved, store.notes, store.required].forEach(function (bag) {
      Object.keys(bag).forEach(function (k) {
        if (k.indexOf('ch16-') === 0 && !bag['ch17-' + k.slice(5)]) { bag['ch17-' + k.slice(5)] = bag[k]; delete bag[k]; }
      });
    });
    Object.keys(store.required).forEach(function (chap) {
      var req = store.required[chap];
      if (Array.isArray(req)) store.required[chap] = req.map(function (id) { return id.indexOf('ch16-') === 0 ? 'ch17-' + id.slice(5) : id; });
    });
    store.shifted16 = true;
    saveStore(store);
  })();

  function isChapterDone(id) {
    var req = store.required[id];
    if (!req || !req.length) return false;
    for (var i = 0; i < req.length; i++) if (!store.solved[req[i]]) return false;
    return true;
  }


  /* ---------- chapter sections: the in-page rail ---------- */
  // A section runs from one h2 to the next. We record whether it holds something to
  // build or run, and which graded checks live inside it, so the rail can show progress.
  function sections(page) {
    var out = [];
    Array.prototype.forEach.call(page.querySelectorAll('h2[id]'), function (h) {
      var title = h.cloneNode(true), n = title.querySelector('.sec');
      if (n) n.remove();
      var checks = [], interactive = false, node = h.nextElementSibling;
      while (node && node.tagName !== 'H2') {
        if (node.matches('.code-cell') || node.querySelector('.code-cell')) interactive = true;
        Array.prototype.forEach.call(node.querySelectorAll('[data-id]'), function (c) { checks.push(c.getAttribute('data-id')); });
        if (node.hasAttribute && node.hasAttribute('data-id')) checks.push(node.getAttribute('data-id'));
        node = node.nextElementSibling;
      }
      out.push({ id: h.id, title: title.textContent.trim(), el: h, checks: checks, interactive: interactive });
    });
    return out;
  }

  function refreshSectionMarks(page) {
    sections(page).forEach(function (sec) {
      var mark = document.querySelector('[data-sec-done="' + sec.id + '"]');
      if (!mark) return;
      var done = sec.checks.length && sec.checks.every(function (id) { return store.solved[id]; });
      mark.textContent = done ? '✓' : '';
    });
  }

  function scrollSpy(page, sub) {
    var links = {};
    Array.prototype.forEach.call(sub.querySelectorAll('[data-sec]'), function (a) { links[a.getAttribute('data-sec')] = a; });
    // Look the headings up at measure time: the rail is built before the page is in
    // the document, so anything captured now would measure zero.
    var ids = sections(page).map(function (s) { return s.id; });
    if (!ids.length) return;
    var ticking = false;
    function update() {
      ticking = false;
      // The current section is the last heading whose top has passed the reading line.
      var line = 140, best = ids[0], i, node;
      for (i = 0; i < ids.length; i++) {
        node = document.getElementById(ids[i]);
        if (node && node.getBoundingClientRect().top <= line) best = ids[i];
      }
      // At the very bottom, the last section is the one you're reading.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) best = ids[ids.length - 1];
      Object.keys(links).forEach(function (id) { links[id].classList.toggle('here', id === best); });
    }
    // A timer rather than requestAnimationFrame: rAF is suspended while the tab is
    // hidden, which would leave the rail stuck on whatever section it last saw.
    addEventListener('scroll', function () {
      if (!ticking) { ticking = true; setTimeout(update, 60); }
    }, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
  }

  /* ---------- chapter meta: what this chapter asks of you ---------- */
  function chapterMeta(page) {
    var head = page.querySelector('.chapter-head');
    if (!head || page.querySelector('.ch-meta')) return;
    var words = (page.textContent.match(/\S+/g) || []).length;
    var mins = Math.max(1, Math.round(words / 220));
    var builds = page.querySelectorAll('.code-cell').length;
    var runs = page.querySelectorAll('.widget').length;
    var bits = [mins + ' min read'];
    if (builds) bits.push(builds + (builds === 1 ? ' build step' : ' build steps'));
    if (runs) bits.push(runs + (runs === 1 ? ' experiment' : ' experiments'));
    head.appendChild(el('p', { class: 'ch-meta', text: bits.join(' · ') }));
  }

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- math & numerics ---------- */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    var f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.normal = function () {
      var u = 1 - f(), v = f();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    f.bern = function (p) { return f() < p ? 1 : 0; };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.exp = function (mean) { return -Math.log(1 - f()) * mean; };
    return f;
  }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function logit(p) { p = clamp(p, 1e-9, 1 - 1e-9); return Math.log(p / (1 - p)); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function logloss(p, y) { p = clamp(p, 1e-12, 1 - 1e-12); return -(y * Math.log(p) + (1 - y) * Math.log(1 - p)); }
  function entropy(p) { return logloss(p, p); }
  function auc(scores, labels) {
    var idx = scores.map(function (s, i) { return i; }).sort(function (a, b) { return scores[a] - scores[b]; });
    var rankSum = 0, nPos = 0, nNeg = 0, i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
      var avgRank = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) if (labels[idx[k]]) { rankSum += avgRank; nPos++; }
      i = j + 1;
    }
    nNeg = labels.length - nPos;
    if (!nPos || !nNeg) return NaN;
    return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

  function fmt(x, d) {
    if (x == null || isNaN(x)) return '—';
    if (d == null) d = 2;
    return Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(x, d) { return fmt(x * 100, d == null ? 1 : d) + '%'; }
  function money(x, d) { return (x < 0 ? '−$' : '$') + fmt(Math.abs(x), d == null ? 2 : d); }
  function signed(x, d, suffix) { return (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x), d) + (suffix || ''); }

  function renderMath(root) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(root || document.body, {
          delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
          throwOnError: false
        });
      } catch (e) {}
    }
  }
  function tex(target, src, display) {
    if (window.katex) { try { window.katex.render(src, target, { displayMode: !!display, throwOnError: false }); return; } catch (e) {} }
    target.textContent = src;
  }

  /* ---------- controls ---------- */
  // specs: [{key,label,min,max,step,value,fmt}] ; onChange(values)
  function controls(container, specs, onChange) {
    var vals = {};
    var wrap = el('div', { class: 'controls' });
    specs.forEach(function (s) {
      vals[s.key] = s.value;
      var out = el('output', { text: s.fmt ? s.fmt(s.value) : String(s.value) });
      var inp = el('input', { type: 'range', min: s.min, max: s.max, step: s.step || 1, value: s.value, 'aria-label': s.label });
      inp.addEventListener('input', function () {
        vals[s.key] = parseFloat(inp.value);
        out.textContent = s.fmt ? s.fmt(vals[s.key]) : inp.value;
        onChange(vals, s.key);
      });
      s._set = function (v) { inp.value = v; vals[s.key] = v; out.textContent = s.fmt ? s.fmt(v) : String(v); };
      wrap.appendChild(el('div', { class: 'ctl' }, [el('label', null, [s.label, out]), inp]));
    });
    container.appendChild(wrap);
    return {
      values: vals,
      set: function (key, v) { specs.forEach(function (s) { if (s.key === key) s._set(v); }); onChange(vals, key); },
      el: wrap
    };
  }
  function seg(container, options, value, onChange) {
    var w = el('div', { class: 'seg', role: 'group' });
    var btns = options.map(function (o) {
      var b = el('button', { type: 'button', text: o.label });
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); onChange(o.value);
      });
      if (o.value === value) b.classList.add('on');
      w.appendChild(b); return b;
    });
    container.appendChild(w);
    return w;
  }
  function stats(container, items) {
    // items: [{key,label,sub}] -> returns update(map)
    var w = el('div', { class: 'stats' }), refs = {};
    items.forEach(function (it) {
      var v = el('div', { class: 'v', text: '—' }), d = el('div', { class: 'd', text: it.sub || '' });
      var box = el('div', { class: 'stat' }, [el('div', { class: 'k', text: it.label }), v, d]);
      refs[it.key] = { box: box, v: v, d: d };
      w.appendChild(box);
    });
    container.appendChild(w);
    return function (map) {
      for (var k in map) {
        if (!refs[k]) continue;
        var m = map[k];
        if (typeof m === 'object' && m !== null) {
          refs[k].v.textContent = m.v;
          if (m.d != null) refs[k].d.textContent = m.d;
          refs[k].box.classList.toggle('good', m.tone === 'good');
          refs[k].box.classList.toggle('bad', m.tone === 'bad');
        } else refs[k].v.textContent = m;
      }
    };
  }

  /* ---------- chart ---------- */
  /* Charts are drawn at the container's measured width, so a width change makes them
     stale. Widgets register their redraw here; `diagrams.js` keeps its own list for the
     same reason. Height changes (a chart redrawing, an accordion opening) must not fire
     this, so it watches the viewport width and ignores small jitter. */
  var redraws = [], lastW = window.innerWidth, resizeT = null;
  // A handler that returns false has nothing left to draw (its container is gone) and
  // is dropped, so replaced widgets do not pile up.
  function onResize(fn) { redraws.push(fn); }
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (Math.abs(window.innerWidth - lastW) < 8) return;
      lastW = window.innerWidth;
      // One widget failing to redraw must not stop the rest of the page.
      redraws = redraws.filter(function (fn) { try { return fn() !== false; } catch (e) { return true; } });
    }, 160);
  });

  function niceTicks(a, b, n) {
    var span = b - a; if (span <= 0) return [a];
    var step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var t = [], s = Math.ceil(a / step - 1e-9) * step;
    for (var x = s; x <= b + step * 1e-6; x += step) t.push(Math.round(x / step) * step);
    return t;
  }
  /* Style guide §6: one SVG user unit is one CSS pixel, so the viewBox width has to be
     the width the chart really renders at — otherwise `.chart text` at 11.5px comes out
     at 11.5 × (rendered width / W). The holder is a plain block child, so measuring it
     once it is in the document gives that width for any container and any viewport.
     `w` is only the fallback for a container that is not laid out yet (display:none, or
     still detached); call sites pass the desktop width of their container for that case. */
  function chartWidth(holder, fallback) {
    var w = Math.round(holder.getBoundingClientRect().width);
    return w > 40 ? w : (fallback || 640);
  }
  function chart(container, o) {
    o = o || {};
    var holder = el('div', { class: 'chart' });
    container.appendChild(holder);
    var W = chartWidth(holder, o.w), H = o.h || 300;
    /* Tick text no longer shrinks with the container, so a narrow chart needs fewer of
       them or the x labels collide. */
    var nx = o.nx || (W < 420 ? 4 : 6), ny = o.ny || (W < 420 ? 4 : 5);
    /* `margin` may be a function of the measured width, for a chart whose labels need
       more room once they stop being scaled down with the container. */
    function margins() {
      var extra = typeof o.margin === 'function' ? o.margin(W) : o.margin;
      return Object.assign({ t: 14, r: 16, b: o.xlabel ? 44 : 28, l: o.ylabel ? 58 : 44 }, extra || {});
    }
    var m = margins();
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.label || 'chart' }, holder);
    var gAxes = sv('g', null, svg), gData = sv('g', null, svg), gTop = sv('g', null, svg);
    var X = o.x || [0, 1], Y = o.y || [0, 1];
    var xlog = !!o.xlog;
    function sx(v) {
      if (xlog) return m.l + (Math.log10(v) - Math.log10(X[0])) / (Math.log10(X[1]) - Math.log10(X[0])) * (W - m.l - m.r);
      return m.l + (v - X[0]) / (X[1] - X[0]) * (W - m.l - m.r);
    }
    function sy(v) { return H - m.b - (v - Y[0]) / (Y[1] - Y[0]) * (H - m.t - m.b); }
    function invx(px) { return X[0] + (px - m.l) / (W - m.l - m.r) * (X[1] - X[0]); }
    function invy(py) { return Y[0] + (H - m.b - py) / (H - m.t - m.b) * (Y[1] - Y[0]); }
    function axes() {
      while (gAxes.firstChild) gAxes.removeChild(gAxes.firstChild);
      var xf = o.xfmt || function (v) { return +v.toFixed(6) + ''; };
      var yf = o.yfmt || function (v) { return +v.toFixed(6) + ''; };
      var yt = o.yticks || niceTicks(Y[0], Y[1], ny);
      yt.forEach(function (t) {
        sv('line', { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t), class: 'gridline' }, gAxes);
        sv('text', { x: m.l - 6, y: sy(t) + 4, 'text-anchor': 'end', text: yf(t) }, gAxes);
      });
      var xt = o.xticks || (xlog ? (function () { var r = []; for (var p = Math.ceil(Math.log10(X[0])); p <= Math.log10(X[1]); p++) r.push(Math.pow(10, p)); return r; })() : niceTicks(X[0], X[1], nx));
      xt.forEach(function (t) {
        sv('line', { x1: sx(t), x2: sx(t), y1: H - m.b, y2: H - m.b + 4, stroke: 'var(--ink-3)' }, gAxes);
        sv('text', { x: sx(t), y: H - m.b + 16, 'text-anchor': 'middle', text: xf(t) }, gAxes);
      });
      sv('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'var(--ink-3)' }, gAxes);
      if (o.xlabel) sv('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'lbl', text: o.xlabel }, gAxes);
      if (o.ylabel) sv('text', { x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', class: 'lbl', transform: 'rotate(-90 14 ' + ((m.t + H - m.b) / 2) + ')', text: o.ylabel }, gAxes);
    }
    axes();
    /* Every drawing call is recorded so the chart can rebuild itself at a new width
       without the call site having to know it happened. `clear()` empties the log the
       same way it empties the canvas; `setDomain` is not recorded because X and Y
       already persist. */
    var log = [];
    var api = {
      svg: svg, g: gData, top: gTop, sx: sx, sy: sy, invx: invx, invy: invy, W: W, H: H, m: m,
      setDomain: function (x, y) { if (x) X = x; if (y) Y = y; axes(); },
      clear: function () { log = []; while (gData.firstChild) gData.removeChild(gData.firstChild); while (gTop.firstChild) gTop.removeChild(gTop.firstChild); },
      line: function (pts, s) {
        s = s || {};
        var d = pts.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); })
          .map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(clamp(p[1], Y[0] - (Y[1] - Y[0]) * 0.05, Y[1] + (Y[1] - Y[0]) * 0.05)).toFixed(1); }).join('');
        return sv('path', { d: d, fill: 'none', stroke: s.color || 'var(--s1)', 'stroke-width': s.width || 2.2, 'stroke-dasharray': s.dash || '', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: s.opacity || 1 }, s.top ? gTop : gData);
      },
      area: function (pts, s) {
        s = s || {};
        var base = s.base != null ? s.base : Y[0];
        var d = 'M' + sx(pts[0][0]) + ',' + sy(base) + pts.map(function (p) { return 'L' + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join('') + 'L' + sx(pts[pts.length - 1][0]) + ',' + sy(base) + 'Z';
        return sv('path', { d: d, fill: s.color || 'var(--s1)', opacity: s.opacity == null ? 0.15 : s.opacity, stroke: 'none' }, gData);
      },
      dots: function (pts, s) {
        s = s || {};
        pts.forEach(function (p) {
          sv('circle', { cx: sx(p[0]), cy: sy(p[1]), r: p[2] || s.r || 3.5, fill: p[3] || s.color || 'var(--s1)', opacity: s.opacity || 0.85, stroke: s.stroke || 'none', 'stroke-width': 1.5 }, s.top ? gTop : gData);
        });
      },
      rect: function (x0, y0, x1, y1, s) {
        s = s || {};
        var a = sx(x0), b = sx(x1), c = sy(y0), d = sy(y1);
        return sv('rect', { x: Math.min(a, b), y: Math.min(c, d), width: Math.abs(b - a), height: Math.abs(d - c), fill: s.fill || 'var(--s1)', opacity: s.opacity == null ? 0.85 : s.opacity, rx: s.rx || 2, stroke: s.stroke || 'none' }, s.top ? gTop : gData);
      },
      text: function (x, y, str, s) {
        s = s || {};
        var px = sx(x) + (s.dx || 0), py = sy(y) + (s.dy || 0);
        var a = { x: px, y: py, 'text-anchor': s.anchor || 'start', text: str, style: 'fill:' + (s.color || 'var(--ink-2)') + ';font-size:' + (s.size || 12) + 'px;font-weight:' + (s.weight || 500) };
        if (s.rotate) a.transform = 'rotate(' + s.rotate + ' ' + px + ' ' + py + ')';
        return sv('text', a, gTop);
      },
      vline: function (x, s) { s = s || {}; return sv('line', { x1: sx(x), x2: sx(x), y1: sy(Y[0]), y2: sy(Y[1]), stroke: s.color || 'var(--ink-3)', 'stroke-width': s.width || 1.5, 'stroke-dasharray': s.dash || '4 4' }, gTop); },
      hline: function (y, s) { s = s || {}; return sv('line', { x1: sx(X[0]), x2: sx(X[1]), y1: sy(y), y2: sy(y), stroke: s.color || 'var(--ink-3)', 'stroke-width': s.width || 1.5, 'stroke-dasharray': s.dash || '4 4' }, gTop); }
    };
    ['line', 'area', 'dots', 'rect', 'text', 'vline', 'hline'].forEach(function (k) {
      var fn = api[k];
      api[k] = function () { log.push([k, [].slice.call(arguments)]); return fn.apply(api, arguments); };
    });
    /* The viewBox is the rendered width, so a width change makes the picture stale.
       Redraw at the new width and replay; returning false unregisters a chart whose
       container has since been replaced. */
    onResize(function () {
      if (!holder.isConnected) return false;
      var nw = chartWidth(holder, o.w);
      if (Math.abs(nw - W) < 2) return;
      W = nw; api.W = W;
      nx = o.nx || (W < 420 ? 4 : 6); ny = o.ny || (W < 420 ? 4 : 5);
      m = margins(); api.m = m;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      axes();
      var replay = log;
      api.clear();
      replay.forEach(function (e) { api[e[0]].apply(api, e[1]); });
    });
    return api;
  }
  function legend(container, items) {
    var w = el('div', { class: 'legend' });
    items.forEach(function (it) {
      w.appendChild(el('span', null, [el('i', { class: it.dot ? 'dot' : '', style: 'background:' + it.color + (it.dash ? ';background:repeating-linear-gradient(90deg,' + it.color + ' 0 4px,transparent 4px 7px)' : '') }), it.label]));
    });
    container.appendChild(w);
    return w;
  }

  /* ---------- quizzes / exercises / reflections ---------- */
  var chapterId = null;
  var requiredIds = [];

  function markSolved(id) {
    store.solved[id] = true; saveStore(store); refreshCompletion();
  }

  function initQuiz(q) {
    var id = q.getAttribute('data-id');
    requiredIds.push(id);
    var items = q.querySelectorAll('li');
    var explain = q.querySelector('.explain');
    var head = el('div', { class: 'qhead' }, ['Check your understanding']);
    var status = el('span', { class: 'status' });
    head.appendChild(status);
    q.insertBefore(head, q.firstChild);
    var letters = 'ABCDEFG';
    var buttons = [];
    items.forEach(function (li, i) {
      var correct = li.hasAttribute('data-correct');
      var why = li.getAttribute('data-why');
      var b = el('button', { type: 'button', html: '<span class="opt">' + letters[i] + '</span><span>' + li.innerHTML + '</span>' });
      li.innerHTML = ''; li.appendChild(b);
      buttons.push({ b: b, correct: correct });
      b.addEventListener('click', function () {
        if (correct) {
          b.classList.add('right');
          buttons.forEach(function (x) { x.b.disabled = true; });
          status.textContent = '✓ Correct'; status.className = 'status ok';
          if (explain) explain.classList.add('show');
          markSolved(id);
        } else {
          b.classList.add('wrong'); b.disabled = true;
          status.textContent = why ? '✗ ' + why : '✗ Not quite — try again'; status.className = 'status no';
        }
      });
    });
    if (store.solved[id]) {
      buttons.forEach(function (x) { x.b.disabled = true; if (x.correct) x.b.classList.add('right'); });
      status.textContent = '✓ Solved'; status.className = 'status ok';
      if (explain) explain.classList.add('show');
    }
  }

  function initExercise(ex) {
    var id = ex.getAttribute('data-id');
    requiredIds.push(id);
    var answer = parseFloat(ex.getAttribute('data-answer'));
    var tol = parseFloat(ex.getAttribute('data-tol') || '0.01');
    var relTol = ex.hasAttribute('data-rel');
    var unit = ex.getAttribute('data-unit') || '';
    var explain = ex.querySelector('.explain');
    var head = el('div', { class: 'qhead' }, ['Exercise']);
    var status = el('span', { class: 'status' });
    head.appendChild(status);
    ex.insertBefore(head, ex.firstChild);
    var input = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Your answer', 'aria-label': 'Your answer' });
    var fb = el('span', { class: 'feedback' });
    var btn = el('button', { type: 'button', class: 'btn', text: 'Check' });
    var row = el('div', { class: 'answer-row' }, [input, unit ? el('span', { class: 'muted', text: unit }) : null, btn, fb]);
    var anchor = ex.querySelector('.q');
    anchor.parentNode.insertBefore(row, anchor.nextSibling);
    var tries = 0;
    var reveal = el('button', { type: 'button', class: 'btn secondary', text: 'Show solution', style: 'display:none' });
    row.appendChild(reveal);
    reveal.addEventListener('click', function () { if (explain) explain.classList.add('show'); reveal.style.display = 'none'; });
    function check() {
      var raw = input.value.replace(/[$,%\s]/g, '');
      var v = parseFloat(raw);
      if (isNaN(v)) { fb.textContent = 'Enter a number'; fb.className = 'feedback'; return; }
      var ok = relTol ? Math.abs(v - answer) <= Math.abs(answer) * tol : Math.abs(v - answer) <= tol;
      tries++;
      if (ok) {
        fb.textContent = '✓ Correct'; fb.className = 'feedback pos';
        status.textContent = '✓ Solved'; status.className = 'status ok';
        if (explain) explain.classList.add('show');
        reveal.style.display = 'none';
        markSolved(id);
      } else {
        fb.textContent = '✗ Not quite' + (tries >= 2 ? '' : ' — check the hint'); fb.className = 'feedback neg';
        if (tries >= 2) reveal.style.display = '';
      }
    }
    btn.addEventListener('click', check);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
    if (store.solved[id]) {
      input.value = ex.getAttribute('data-show') || String(answer);
      fb.textContent = '✓ Correct'; fb.className = 'feedback pos';
      status.textContent = '✓ Solved'; status.className = 'status ok';
      if (explain) explain.classList.add('show');
    }
  }

  function initReflect(r) {
    var id = r.getAttribute('data-id');
    var model = r.querySelector('.model');
    var head = el('div', { class: 'qhead' }, ['Apply it — think like the PM']);
    r.insertBefore(head, r.firstChild);
    var ta = el('textarea', { placeholder: 'Write your answer first (saved in this browser). Then compare with ours.', 'aria-label': 'Your answer' });
    ta.value = store.notes[id] || '';
    ta.addEventListener('input', function () { store.notes[id] = ta.value; saveStore(store); btn.disabled = ta.value.trim().length < 20; });
    var btn = el('button', { type: 'button', class: 'btn secondary', text: 'Compare with a strong answer' });
    btn.disabled = ta.value.trim().length < 20;
    var anchor = r.querySelector('.q');
    anchor.parentNode.insertBefore(ta, anchor.nextSibling);
    ta.parentNode.insertBefore(el('div', { class: 'btn-row', style: 'margin-top:8px' }, [btn, el('span', { class: 'muted small', text: 'Unlocks after you write a couple of sentences.' })]), ta.nextSibling);
    if (model) {
      model.classList.add('explain');
      btn.addEventListener('click', function () { model.classList.add('show'); btn.disabled = true; });
    }
  }

  var completionEl = null;
  function refreshCompletion() {
    if (!chapterId) return;
    store.required[chapterId] = requiredIds.slice();
    saveStore(store);
    var main = document.querySelector('main');
    if (main) refreshSectionMarks(main);
    var solved = requiredIds.filter(function (id) { return store.solved[id]; }).length;
    if (completionEl) {
      if (!requiredIds.length) { completionEl.style.display = 'none'; }
      else if (solved === requiredIds.length) {
        completionEl.className = 'completion done';
        completionEl.textContent = '✓ Chapter complete — all ' + requiredIds.length + ' checks solved.';
      } else {
        completionEl.className = 'completion';
        completionEl.textContent = solved + ' of ' + requiredIds.length + ' checks solved in this chapter.';
      }
    }
    var pill = document.getElementById('progressPill');
    if (pill) {
      var done = CHAPTERS.filter(function (c) { return isChapterDone(c.id); }).length;
      pill.textContent = done + '/' + CHAPTERS.length + ' chapters';
    }
    document.querySelectorAll('[data-done-for]').forEach(function (n) {
      n.textContent = isChapterDone(n.getAttribute('data-done-for')) ? '✓' : '';
    });
  }

  /* ---------- theme ---------- */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(store.theme);

  /* ---------- page chrome ---------- */
  function buildChrome() {
    var body = document.body;
    chapterId = body.getAttribute('data-chapter');
    var isIndex = body.hasAttribute('data-index');
    var root = isIndex ? 'chapters/' : '';
    var home = isIndex ? 'index.html' : '../index.html';
    var cur = null, idx = -1;
    CHAPTERS.forEach(function (c, i) { if (c.id === chapterId) { cur = c; idx = i; } });

    var page = el('div', { class: 'page' });
    while (body.firstChild) page.appendChild(body.firstChild);

    var readbar = el('div', { class: 'readbar' });
    var themeBtn = el('button', { class: 'icon-btn', type: 'button', title: 'Toggle theme', 'aria-label': 'Toggle color theme', text: '◐' });
    themeBtn.addEventListener('click', function () {
      var order = [undefined, 'light', 'dark'];
      var next = order[(order.indexOf(store.theme) + 1) % 3];
      store.theme = next; saveStore(store); applyTheme(next);
      themeBtn.title = 'Theme: ' + (next || 'auto');
    });
    var navBtn = el('button', { class: 'icon-btn', id: 'navToggle', type: 'button', 'aria-label': 'Open contents', html: '☰ <span class="small">Contents</span>' });
    navBtn.addEventListener('click', function () { body.classList.toggle('nav-open'); });
    var topbar = el('header', { class: 'topbar' }, [
      navBtn,
      el('a', { class: 'brand', href: home, html: 'Fundamentals of <span>Ad Quality</span>' }),
      el('span', { class: 'crumb', text: cur ? '· ' + (cur.n.match(/^\d/) ? 'Ch. ' + cur.n + ' ' : 'Appendix ' + cur.n + ' ') + '— ' + cur.title : '' }),
      el('span', { class: 'progress-pill', id: 'progressPill' }),
      themeBtn,
      readbar
    ]);

    var side = el('nav', { class: 'sidebar', 'aria-label': 'Table of contents' });
    var lastPart = null;
    CHAPTERS.forEach(function (c) {
      if (c.part !== lastPart) { side.appendChild(el('div', { class: 'part', text: c.part })); lastPart = c.part; }
      var a = el('a', { href: root + c.id + '.html', class: c.id === chapterId ? 'current' : '' }, [
        el('span', { class: 'n', text: c.n }), el('span', { text: c.title }), el('span', { class: 'done', 'data-done-for': c.id })
      ]);
      side.appendChild(a);
      if (c.id === chapterId) {
        var sub = el('div', { class: 'toc-sub' });
        sections(page).forEach(function (sec) {
          var link = el('a', { href: '#' + sec.id, 'data-sec': sec.id }, [
            el('span', { class: 'label', text: sec.title }),
            sec.interactive ? el('span', { class: 'mark', title: 'You write code in this section', text: 'build' }) : null,
            el('span', { class: 'done', 'data-sec-done': sec.id })
          ].filter(Boolean));
          sub.appendChild(link);
        });
        if (sub.childNodes.length) { side.appendChild(sub); scrollSpy(page, sub); }
      }
    });
    var scrim = el('div', { class: 'scrim' });
    scrim.addEventListener('click', function () { body.classList.remove('nav-open'); });
    side.addEventListener('click', function (e) { if (e.target.closest('a')) body.classList.remove('nav-open'); });

    chapterMeta(page);
    body.appendChild(topbar); body.appendChild(side); body.appendChild(scrim); body.appendChild(page);

    // Chapter footer: completion + prev/next
    var main = page.querySelector('main.chapter');
    if (main && cur) {
      completionEl = el('div', { class: 'completion' });
      main.appendChild(completionEl);
      var navRow = el('div', { class: 'chapter-nav' });
      var prev = CHAPTERS[idx - 1], next = CHAPTERS[idx + 1];
      if (prev) navRow.appendChild(el('a', { href: prev.id + '.html', class: 'prev' }, [el('small', { text: '← Previous' }), el('span', { class: 't', text: prev.title })]));
      if (next) navRow.appendChild(el('a', { href: next.id + '.html', class: 'next' }, [el('small', { text: 'Next →' }), el('span', { class: 't', text: next.title })]));
      main.appendChild(navRow);
    }

    page.querySelectorAll('.quiz[data-id]').forEach(initQuiz);
    page.querySelectorAll('.exercise[data-id]').forEach(initExercise);
    page.querySelectorAll('.reflect[data-id]').forEach(initReflect);
    refreshCompletion();

    window.addEventListener('scroll', function () {
      var h = document.documentElement;
      var p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      readbar.style.width = (p * 100).toFixed(1) + '%';
    }, { passive: true });

    // Landing page card rendering
    var cardsHost = document.getElementById('chapterCards');
    if (cardsHost) {
      var lp = null, grid = null;
      CHAPTERS.forEach(function (c) {
        if (c.part !== lp) {
          cardsHost.appendChild(el('div', { class: 'part-title', text: c.part }));
          grid = el('div', { class: 'cards' }); cardsHost.appendChild(grid); lp = c.part;
        }
        grid.appendChild(el('a', { class: 'card', href: 'chapters/' + c.id + '.html' }, [
          el('span', { class: 'done', 'data-done-for': c.id }),
          el('div', { class: 'n', text: c.n.match(/^\d/) ? 'CHAPTER ' + c.n : 'APPENDIX ' + c.n }),
          el('h3', { text: c.title }), el('p', { text: c.blurb })
        ]));
      });
      refreshCompletion();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildChrome);
  else buildChrome();
  window.addEventListener('load', function () { renderMath(document.body); });

  window.Book = {
    CHAPTERS: CHAPTERS, el: el, sv: sv, rng: rng, sigmoid: sigmoid, logit: logit, clamp: clamp,
    logloss: logloss, entropy: entropy, auc: auc, mean: mean, sum: sum,
    fmt: fmt, pct: pct, money: money, signed: signed,
    controls: controls, seg: seg, stats: stats, chart: chart, legend: legend, onResize: onResize,
    tex: tex, renderMath: renderMath,
    // Let other modules (code cells) register graded checks for chapter completion.
    requireCheck: function (id) { if (requiredIds.indexOf(id) < 0) requiredIds.push(id); refreshCompletion(); },
    solve: function (id) { markSolved(id); },
    unsolve: function (id) { delete store.solved[id]; saveStore(store); refreshCompletion(); },
    isSolved: function (id) { return !!store.solved[id]; },
    resetProgress: function () { store = { solved: {}, notes: {}, required: {} }; saveStore(store); location.reload(); }
  };
})();
