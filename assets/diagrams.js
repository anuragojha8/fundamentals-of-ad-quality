/* Mechanism diagrams. Only explicit controls compute or change local examples.
   Layout follows docs/style-guide.md §5: one SVG user unit is one CSS pixel, so the
   viewBox width tracks the element's real rendered width (760 wide, 400 on a phone)
   instead of scaling a wide picture down and inflating the type to compensate. */
(function () {
  'use strict';
  var E = Book.el, S = Book.sv, serial = 0;

  /* ---------- responsive geometry ---------- */
  var narrowMQ = matchMedia('(max-width: 600px)'), redraws = [];
  function geom() {
    var n = narrowMQ.matches;
    return { W: n ? 400 : 760, pad: n ? 12 : 24, gut: n ? 28 : 48, narrow: n };
  }
  function onResize(fn) { redraws.push(fn); }
  narrowMQ.addEventListener('change', function () {
    redraws.forEach(function (fn) { try { fn(); } catch (e) { /* one diagram must not stop the rest */ } });
  });

  /* Band metrics. A band is one full-width step in a vertical stack. */
  var TITLE_LH = 18, DETAIL_LH = 15, PAD_T = 11, PAD_B = 12, GAP = 22;
  function bandHeight(tn, dn) { return PAD_T + tn * TITLE_LH + dn * DETAIL_LH + PAD_B; }

  /* Greedy word wrap. Only ever bites on the narrow layout; the wide bands are
     long enough that every real label stays on one line. */
  function wrap(str, max) {
    if (!str) return [];
    if (str.length <= max) return [str];
    var words = String(str).split(' '), out = [''];
    words.forEach(function (w) {
      var last = out[out.length - 1];
      var cand = last ? last + ' ' + w : w;
      if (!last || cand.length <= max) out[out.length - 1] = cand; else out.push(w);
    });
    return out;
  }
  function chars(width, px) { return Math.max(8, Math.floor((width - 36) / (px * 0.52))); }

  /* ---------- primitives ---------- */
  function svg(host, height, label) {
    var g = geom();
    var s = S('svg', { viewBox: '0 0 ' + g.W + ' ' + height, role: 'img', 'aria-label': label, class: 'aq-svg' }, host);
    var id = 'aq-arrow-' + (++serial), d = S('defs', {}, s);
    var m = S('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, d);
    S('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--ink-3)' }, m);
    s._arrow = id;
    return s;
  }
  function txt(s, x, y, t, cls) { return S('text', { x: x, y: y, text: t, class: cls || 't-md' }, s); }
  function mlines(s, x, y, arr, cls, lh) {
    var t = S('text', { x: x, y: y, class: cls }, s);
    arr.forEach(function (line, i) { S('tspan', { x: x, dy: i ? lh : 0, text: line }, t); });
    return t;
  }
  var SPINE = { a: 'accent', b: 'blue', g: 'green', v: 'violet' };

  /* One full-width band: tinted spine, a title, and at most a detail line. */
  function band(s, y, title, detail, tone, x, width) {
    var g = geom();
    x = x == null ? g.pad : x;
    width = width || (g.W - x - g.gut);
    var tl = wrap(title, chars(width, 13.5)), dl = wrap(detail, chars(width, 11.5));
    var h = bandHeight(tl.length, dl.length);
    S('rect', { x: x, y: y, width: width, height: h, rx: 10, class: 'box ' + (tone || '') }, s);
    S('rect', { x: x + 1, y: y + 12, width: 3, height: Math.max(12, h - 24), rx: 1.5, fill: 'var(--' + (SPINE[tone] || 'ink-3') + ')' }, s);
    mlines(s, x + 20, y + 24, tl, 't-md t-b', TITLE_LH);
    if (dl.length) mlines(s, x + 20, y + PAD_T + tl.length * TITLE_LH + 12, dl, 't-sm', DETAIL_LH);
    return h;
  }
  /* Kept for callers that lay out their own flow and need the height back. */
  function box(s, y, title, detail, tone, x, width) { return band(s, y, title, detail, tone, x, width); }
  /* Height a band will take, so a caller can size its svg before drawing. */
  function measure(title, detail, width) {
    return bandHeight(wrap(title, chars(width, 13.5)).length, wrap(detail, chars(width, 11.5)).length);
  }

  function arrow(s, d) { S('path', { d: d, class: 'arrow', style: 'marker-end:url(#' + s._arrow + ')' }, s); }
  function down(s, y, cx) {
    var g = geom();
    arrow(s, 'M ' + (cx == null ? g.pad + (g.W - g.pad - g.gut) / 2 : cx) + ' ' + y + ' V ' + (y + GAP));
  }

  /* A vertical stack of bands. Returns the svg, with band boxes on `_bands`. */
  function stage(host, rows, label) {
    var g = geom(), x = g.pad, w = g.W - x - g.gut;
    var laid = rows.map(function (r) {
      var tl = wrap(r[0], chars(w, 13.5)), dl = wrap(r[1], chars(w, 11.5));
      return { r: r, tl: tl, dl: dl, h: bandHeight(tl.length, dl.length) };
    });
    var y = 12;
    laid.forEach(function (L) { L.y = y; y += L.h + GAP; });
    var s = svg(host, y - GAP + 12, label);
    laid.forEach(function (L, i) {
      band(s, L.y, L.r[0], L.r[1], L.r[2], x, w);
      if (i < laid.length - 1) down(s, L.y + L.h, x + w / 2);
    });
    s._bands = laid; s._x = x; s._w = w;
    return s;
  }

  function mount(id, title, caption, interactive) {
    var host = document.getElementById(id); if (!host) return null;
    host.className = interactive ? 'widget aq-diagram' : 'diagram aq-diagram';
    if (title) host.appendChild(E('div', { class: 'w-title', text: title }));
    host.appendChild(E(interactive ? 'p' : 'figcaption', { class: 'w-sub', text: caption }));
    return host;
  }
  function output(host) { var p = E('p', { class: 'aq-status', role: 'status', 'aria-live': 'polite' }); host.appendChild(p); return p; }
  /* One primary button per widget; everything else is secondary (style guide §4). */
  function button(host, label, fn, secondary) {
    var b = E('button', { type: 'button', class: secondary ? 'btn secondary' : 'btn', text: label });
    b.addEventListener('click', fn); host.appendChild(b); return b;
  }
  function source(id) { return Stack.implSource(id) === 'you' ? 'your ' + id + '()' : 'reference ' + id + '() (you have not built this slot yet)'; }

  /* ---------- ch.2 · generalized second price ---------- */
  function gsp(host, ads, cands, res, rankBy) {
    var f = host.querySelector('.aq-gsp');
    if (!f) { f = E('figure', { class: 'diagram aq-diagram aq-gsp' }); host.appendChild(f); }
    f.replaceChildren();
    var g = geom(), x = g.pad + 8, w = g.W - x - (g.narrow ? 68 : 90), pitch = 102;
    var s = svg(f, 12 + cands.length * pitch + 6, 'Five auction candidates in current rank order. Each winning price is set by the next candidate.');
    var max = Math.max.apply(null, cands.map(function (c) { return c.score; })) || 1;
    cands.forEach(function (c, k) {
      var a = ads[c.i], y = 12 + k * pitch, r = res[c.i];
      S('rect', { x: x, y: y, width: w, height: 88, rx: 10, class: 'box ' + (r ? 'a' : '') }, s);
      txt(s, x + 20, y + 24, a.name + ' · ' + (r ? 'slot ' + (r.slot + 1) : 'not shown'), 't-md t-b');
      txt(s, x + 20, y + 42, '$' + a.bid.toFixed(2) + ' × ' + a.pctr.toFixed(3) + ' = $' + c.score.toFixed(4), 't-sm');
      S('rect', { x: x + 20, y: y + 52, width: w - 40, height: 6, rx: 3, fill: 'var(--rule)' }, s);
      S('rect', { x: x + 20, y: y + 52, width: (w - 40) * c.score / max, height: 6, rx: 3, fill: 'var(--accent)' }, s);
      if (r) {
        var n = cands[k + 1];
        txt(s, x + 20, y + 76, rankBy === 'bid' ? 'Next bid → $' + r.price.toFixed(2) + '/click' : '$' + n.score.toFixed(4) + ' ÷ ' + a.pctr.toFixed(3) + ' → $' + r.price.toFixed(2) + '/click', 't-sm');
        arrow(s, 'M ' + (x + w) + ' ' + (y + pitch + 44) + ' H ' + (x + w + 30) + ' V ' + (y + 66) + ' H ' + (x + w + 4));
      }
    });
    f.appendChild(E('figcaption', { text: rankBy === 'bid' ? 'Bid-only mode: rows follow bids; prices come from the next bid. Bars still show bid × pCTR. These are the editable example’s numbers.' : 'Edit the table and follow the arrows upward: the next ad sets the winner’s price. Bars show bid × pCTR in dollars per impression, not the platform’s collected revenue. No reserve in this example.' }));
  }

  /* ---------- ch.3 · two ways to move the price ---------- */
  function errors() {
    var h = mount('d-errors', 'Two ways to move the price', 'Hold the competing score at $0.03 and your bid at $2. The true CTR is 4%. These are conditional prices for a won slot; a lower prediction may instead make you lose.', false);
    if (!h) return;
    var wrapEl = E('div'); h.appendChild(wrapEl);
    function draw() {
      wrapEl.replaceChildren();
      var g = geom(), cols = g.narrow ? 1 : 2, pw = g.narrow ? g.W - 24 : 336, ph = 104;
      var rows = [['Overpredict', 'pCTR = 8%', 'Score = $0.16', 'CPC = $0.375', 'Spend = 1.5¢', 'a'],
                  ['Underpredict', 'pCTR = 2%', 'Score = $0.04', 'CPC = $1.50', 'Spend = 6¢', 'b']];
      var joinY = cols === 1 ? 16 + 2 * (ph + 22) + 6 : 16 + ph + 40;
      var joinX = cols === 1 ? 12 : 24, joinW = cols === 1 ? 376 : 712;
      var joinH = measure('Somebody pays the wrong price.', 'At the true 4% CTR: CPC $0.75; spend 3¢.', joinW);
      var s = svg(wrapEl, joinY + joinH + 14, 'Mirrored overprediction and underprediction paths meet at a mispriced impression, with the rival threshold held fixed.');
      rows.forEach(function (r, i) {
        var px = cols === 1 ? 12 : (i ? 400 : 24), py = cols === 1 ? 16 + i * (ph + 22) : 16;
        S('rect', { x: px, y: py, width: pw, height: ph, rx: 10, class: 'box ' + r[5] }, s);
        S('rect', { x: px + 1, y: py + 12, width: 3, height: ph - 24, rx: 1.5, fill: 'var(--' + SPINE[r[5]] + ')' }, s);
        r.slice(0, 5).forEach(function (t, j) { txt(s, px + 20, py + 24 + j * (j ? 15 : 18) + (j ? 3 : 0), t, j ? 't-sm' : 't-md t-b'); });
        var cx = px + pw / 2;
        if (cols === 1) arrow(s, 'M ' + cx + ' ' + (py + ph) + ' V ' + (py + ph + (i ? 28 : 22)));
        else arrow(s, 'M ' + cx + ' ' + (py + ph) + ' V ' + (py + ph + 20) + ' H 380' + (i ? '' : ' V ' + joinY));
      });
      band(s, joinY, 'Somebody pays the wrong price.', 'At the true 4% CTR: CPC $0.75; spend 3¢.', 'v', joinX, joinW);
    }
    draw(); onResize(draw);
  }

  /* ---------- ch.7 · one gradient step ---------- */
  function gradient() {
    var h = mount('w-gradient-diagram', 'Anatomy of one gradient step', 'A local example with two active binary features, label y = 1, learning rate 0.1 and no L2 penalty. Take a step, inspect the arithmetic, then take another. Your saved model stays as it was.', true);
    if (!h) return;
    var controls = E('div', { class: 'btn-row' }), out = E('div'), status;
    h.appendChild(controls); h.appendChild(out); status = output(h);
    var w, step = 0;
    function draw(take) {
      out.replaceChildren();
      var before = [w[1], w[3]], z = before[0] + before[1], p = Stack.sigmoid(z), gr = p - 1, ret;
      try {
        if (take) {
          ret = Stack.impl('sgdStep')(w, Int32Array.of(1, 3), 1, 0.1, 0); step++;
          if (!Number.isFinite(ret) || !Number.isFinite(w[1]) || !Number.isFinite(w[3])) throw Error('The step returned non-finite values. Reset and check your implementation.');
        }
      } catch (e) { status.textContent = e.message; return; }
      var s = stage(out, [
        ['1 · Active features: buckets 1 and 3', 'Before: w₁ = ' + before[0].toFixed(4) + '; w₃ = ' + before[1].toFixed(4), 'b'],
        ['2 · Add weights → logit z', 'z = ' + before[0].toFixed(4) + ' + ' + before[1].toFixed(4) + ' = ' + z.toFixed(4), ''],
        ['3 · Sigmoid → probability', 'p = 1 / (1 + exp(−z)) = ' + p.toFixed(4), 'g'],
        ['4 · Compare with the clicked label', 'Loss = −ln(p) = ' + (-Math.log(p)).toFixed(4) + '; y = 1', ''],
        ['5 · Send the gradient backward', '∂loss/∂z = p − y = ' + gr.toFixed(4), 'v'],
        [take ? '6 · Active weights after the step' : '6 · Next update: w ← w − 0.1 × gradient', take ? 'w₁ = ' + w[1].toFixed(4) + '; w₃ = ' + w[3].toFixed(4) : 'Both active weights would move up by ' + (-0.1 * gr).toFixed(4), 'a']
      ], 'One logistic regression training step from active features through log loss and its gradient back to the active weights.');
      var b = s._bands, last = b[b.length - 1], right = s._x + s._w;
      arrow(s, 'M ' + right + ' ' + (last.y + last.h / 2) + ' H ' + (right + 26) + ' V ' + (b[0].y + b[0].h / 2) + ' H ' + (right + 4));
      status.textContent = 'Step ' + step + ' · Using ' + source('sgdStep') + (take ? '. Returned pre-update p = ' + ret.toFixed(4) : '. Press Take one step to execute it.');
    }
    button(controls, 'Take one step', function () { draw(true); });
    button(controls, 'Reset / replay', function () { reset(); }, true);
    function reset() { w = new Float64Array(8); w[1] = 0.5; w[3] = -0.25; step = 0; draw(false); }
    reset(); onResize(function () { draw(false); });
  }

  /* ---------- ch.5 · the feedback loop ---------- */
  function feedback() {
    var h = mount('w-feedback-diagram', 'The loop that keeps its own secrets', 'This switch changes the illustration, not your production exploration setting. Exploration gives eligible, previously overlooked ads a chance to supply labels; it does not guarantee a click.', true);
    if (!h) return;
    var label = E('label', { class: 'aq-check' }), input = E('input', { type: 'checkbox' });
    label.append(input, document.createTextNode(' Give overlooked ads a chance'));
    h.appendChild(label);
    var out = E('div'); h.appendChild(out);
    function draw() {
      out.replaceChildren();
      var on = input.checked;
      var s = stage(out, [
        ['Show ads selected by the current policy', 'Selection decides which outcomes can be logged.', 'a'],
        ['Log outcomes from shown ads', 'Clicks and non-clicks both become labels.', 'b'],
        ['Train the next model', 'Learn from the examples the policy collected.', 'g'],
        [on ? 'Explore other eligible ads' : 'The missing arm: never shown', on ? 'Some receive exposure → observed outcomes.' : 'No exposure → no outcome label.', 'v']
      ], 'Exposure produces logged labels that train the next selection model; exploration adds a path for overlooked eligible ads.');
      var b = s._bands, right = s._x + s._w, left = s._x;
      arrow(s, 'M ' + right + ' ' + (b[2].y + b[2].h / 2) + ' H ' + (right + 26) + ' V ' + (b[0].y + b[0].h / 2) + ' H ' + (right + 4));
      if (on) arrow(s, 'M ' + left + ' ' + (b[3].y + b[3].h / 2) + ' H ' + (left - 8) + ' V ' + (b[0].y + b[0].h / 2) + ' H ' + (left - 4));
    }
    input.addEventListener('change', draw); draw(); onResize(draw);
  }

  /* ---------- ch.9 · AUC one pair at a time ---------- */
  function auc() {
    var h = mount('w-auc-diagram', 'AUC, one pair at a time', 'Sample a clicked and a non-clicked row from your held-out logs. A higher clicked score earns 1; a tie earns ½. Ten pairs are a noisy estimate, not the full-data AUC.', true);
    if (!h) return;
    var controls = E('div', { class: 'btn-row' }), out = E('div');
    h.append(controls, out);
    var status = output(h), rng = Book.rng(91), n = 0, sum = 0, data = null, lastPairs = null;
    function render(pairs) {
      out.replaceChildren();
      var g = geom(), last = pairs[pairs.length - 1];
      var c = Book.chart(out, {
        w: g.W, h: 200, x: [0, Math.max(.05, last[0], last[1]) * 1.15], y: [0, 1],
        xticks: [0, Math.max(.05, last[0], last[1])], yticks: [.25, .75],
        yfmt: function (v) { return v === .75 ? 'clicked' : 'no click'; },
        xfmt: function (v) { return v.toFixed(3); }, xlabel: 'Prediction · latest pair',
        label: 'Latest sampled clicked and non-clicked row on a prediction axis.',
        margin: { l: 72, r: 20, b: 42, t: 14 }
      });
      c.dots([[last[0], .75, 6, 'var(--green)'], [last[1], .25, 6, 'var(--accent)']]);
      var cols = g.narrow ? [12, 150, 278] : [24, 250, 480];
      var s = svg(out, 40 + pairs.length * 22 + 12, 'Ten sampled AUC pairs with clicked score, non-clicked score and pair credit.');
      txt(s, cols[0], 18, 'Clicked', 't-sm t-b'); txt(s, cols[1], 18, 'Non-click', 't-sm t-b'); txt(s, cols[2], 18, 'Credit', 't-sm t-b');
      pairs.forEach(function (p, i) {
        var y = 40 + i * 22;
        txt(s, cols[0], y, p[0].toFixed(4), 't-sm'); txt(s, cols[1], y, p[1].toFixed(4), 't-sm');
        txt(s, cols[2], y, p[2] === .5 ? '½ · tie' : p[2] ? '1 · correct' : '0 · reversed', 't-sm');
      });
    }
    async function sample() {
      btn.disabled = true; reset.disabled = true;
      status.textContent = 'Loading held-out outcomes and predictions…';
      try {
        if (!data) {
          var log = await Stack.evalLog(), rows = Stack.labeledRows(log), model = Stack.getModel('lr'),
            p = model ? Stack.lrPredictRows(model, rows) : log.impressions.map(function (i) { return Math.min(.99, i.pctr * Stack.world().cfg.examine[i.slot]); });
          var pos = [], neg = [];
          rows.forEach(function (r, i) { (r.click ? pos : neg).push(p[i]); });
          if (!pos.length || !neg.length) throw Error('AUC needs at least one clicked and one non-clicked row.');
          data = { pos: pos, neg: neg, full: Stack.aucRef(p, rows.map(function (r) { return r.click; })), source: model ? 'your saved LR predictions' : 'logged serving predictions (no saved LR model)' };
        }
        var pairs = [];
        for (var i = 0; i < 10; i++) {
          var a = data.pos[Math.floor(rng() * data.pos.length)], b = data.neg[Math.floor(rng() * data.neg.length)],
            v = a > b ? 1 : a === b ? .5 : 0;
          pairs.push([a, b, v]); sum += v; n++;
        }
        lastPairs = pairs; render(pairs);
        status.textContent = n + ' pairs · sampled AUC ' + (sum / n).toFixed(3) + ' · full-log AUC ' + data.full.toFixed(3) + ' · Using ' + data.source + '.';
      } catch (e) {
        status.textContent = 'Could not sample pairs: ' + e.message;
      } finally { btn.disabled = false; reset.disabled = false; }
    }
    var btn = button(controls, 'Sample 10 pairs', sample),
      reset = button(controls, 'Reset sample', function () {
        n = 0; sum = 0; data = null; lastPairs = null; rng = Book.rng(91); out.replaceChildren();
        status.textContent = 'Reset. The next sample reloads the current stack.';
      }, true);
    document.addEventListener('stackchange', function () {
      data = null; n = 0; sum = 0; lastPairs = null; rng = Book.rng(91); out.replaceChildren();
      status.textContent = 'Stack changed. Sample again to use its current predictions.';
    });
    onResize(function () { if (lastPairs) render(lastPairs); });
    status.textContent = 'Ready. Sampling uses observed click labels, not oracle probabilities.';
  }

  /* ---------- ch.6 · feature hashing ---------- */
  function hashing() {
    var h = mount('w-hashing-diagram', 'Two features. One unfortunate address.', 'This uses the real feature hash and the table size in your stack. Different strings can land in the same bucket, which means they share a weight. The four boxes show a neighborhood, not the whole table.', true);
    if (!h) return;
    var label = E('label', { text: 'Feature string' }), input = E('input', { type: 'text', value: 'hour=12', maxlength: '120' });
    label.appendChild(input); h.appendChild(label);
    var controls = E('div', { class: 'btn-row' }), out = E('div');
    h.append(controls, out);
    var status = output(h), pair = null;
    function draw() {
      out.replaceChildren();
      var g = geom(), bits = Stack.state.settings.hashBits, feats = pair || [input.value],
        idx = Stack.hashFeatures(feats, bits), B = Math.pow(2, bits);
      var cols = g.narrow ? 2 : 4, bw = g.narrow ? 176 : 166, bp = g.narrow ? 188 : 172, bh = 60;
      var gridRows = 4 / cols, gridH = gridRows * (bh + 10) - 10, bandW = g.W - g.pad - g.gut;
      var t1 = feats[0].length > 35 ? feats[0].slice(0, 32) + '…' : feats[0],
        d1 = pair ? 'Also: ' + feats[1] : 'String → unsigned FNV-1a hash',
        t2 = 'FNV-1a = ' + Stack.fnv1a(feats[0]), d2 = bits + ' bits → ' + B.toLocaleString() + ' buckets';
      var h1 = measure(t1, d1, bandW), h2 = measure(t2, d2, bandW);
      var gridTop = 12 + h1 + GAP + h2 + GAP + 8;
      var s = svg(out, gridTop + gridH + 40, 'Feature strings are hashed into a fixed-size table; a collision makes unrelated features share a weight.');
      band(s, 12, t1, d1, 'b');
      down(s, 12 + h1);
      band(s, 12 + h1 + GAP, t2, d2, 'v');
      down(s, 12 + h1 + GAP + h2);
      var start = Math.max(0, Math.min(B - 4, idx[0] - 1));
      for (var j = 0; j < 4; j++) {
        var nb = start + j, x = g.pad + (j % cols) * bp, y = gridTop + Math.floor(j / cols) * (bh + 10);
        S('rect', { x: x, y: y, width: bw, height: bh, rx: 8, class: 'box ' + (nb === idx[0] ? 'a cur' : '') }, s);
        txt(s, x + 14, y + 22, 'Bucket', 't-sm');
        txt(s, x + 14, y + 44, String(nb), 't-md t-b');
      }
      txt(s, g.pad, gridTop + gridH + 26, pair ? 'Collision: both strings update bucket ' + idx[0] : 'Selected weight: w[' + idx[0] + ']', 't-sm');
      status.textContent = feats.join(' and ') + ' → ' + Array.from(idx).join(', ') + '. Using Stack.fnv1a and Stack.hashFeatures; ' + bits + '-bit table from your settings.';
    }
    button(controls, 'Show a collision', function () {
      var bits = Stack.state.settings.hashBits, seen = new Map(), found = null;
      for (var i = 0; i < 50000; i++) {
        var f = 'feature=' + i, b = Stack.hashFeatures([f], bits)[0];
        if (seen.has(b)) { found = [seen.get(b), f]; break; }
        seen.set(b, f);
      }
      if (found) { pair = found; input.value = pair[0]; draw(); }
      else status.textContent = 'No collision found in this bounded search. Try a smaller table in your stack.';
    });
    input.addEventListener('input', function () { pair = null; draw(); });
    document.addEventListener('stackchange', function () { pair = null; draw(); });
    draw(); onResize(draw);
  }

  /* ---------- ch.16 · attribution window ---------- */
  function timeline() {
    var h = mount('w-timeline-diagram', 'Same window. Different clocks.', 'Two illustrative users: each sees an impression 15 minutes before clicking at hour 0. One converts at hour 2; the other at hour 120. Move the post-click window. This changes the illustration; use the next widget to compare windows on your logs.', true);
    if (!h) return;
    var label = E('label', { text: 'Attribution window: ' }), range = E('input', { type: 'range', min: '0', max: '168', step: '1', value: '24', 'aria-label': 'Attribution window in hours' });
    label.appendChild(range); h.appendChild(label);
    var out = E('div'); h.appendChild(out);
    var status = output(h);
    function draw() {
      var v = +range.value, g = geom();
      out.replaceChildren();
      stage(out, [['Impression → click', '−0.25 hours → hour 0 (both users)', 'b']], 'Both users see an impression a quarter hour before clicking at hour zero.');
      var c = Book.chart(out, {
        w: g.W, h: 210, x: [-12, 180], y: [0, 1], xticks: [0, 24, 72, 120, 168], yticks: [.25, .75],
        yfmt: function (y) { return y === .75 ? 'fast' : 'slow'; }, xlabel: 'Hours after click',
        label: 'Attribution window shaded from click time to the selected cutoff; fast and slow conversion events shown on separate rows.',
        margin: { l: 56, r: 20, t: 16, b: 44 }
      });
      c.rect(0, 0, v, 1, { fill: 'var(--green)', opacity: .16 });
      c.vline(0); c.vline(v, { color: 'var(--accent)' });
      [[2, .75], [120, .25]].forEach(function (r) {
        c.line([[0, r[1]], [168, r[1]]], { color: 'var(--ink-3)', width: 1 });
        c.dots([[0, r[1], 4, 'var(--blue)'], [r[0], r[1], 6.5, r[0] <= v ? 'var(--green)' : 'var(--accent)']]);
      });
      status.textContent = 'Window: ' + v + ' hours. Fast conversion at 2h: ' + (v >= 2 ? 'counted' : 'outside') + '. Slow conversion at 120h: ' + (v >= 120 ? 'counted' : 'outside') + '. Boundary rule: event time ≤ cutoff.';
    }
    range.addEventListener('input', draw); draw(); onResize(draw);
  }

  /* ---------- ch.16 · two worlds ---------- */
  function worlds() {
    var h = mount('d-two-worlds', 'Two worlds, one causal question', 'Illustrative population expectations under random assignment: 10% convert with ads and 6% without. The 4 percentage-point difference is aggregate lift. We cannot point to a particular person and say the ad caused their purchase.', false);
    if (!h) return;
    var wrapEl = E('div'); h.appendChild(wrapEl);
    function draw() {
      wrapEl.replaceChildren();
      var g = geom(), one = g.narrow, pw = one ? g.W - 24 : 336, ph = 88;
      var rows = [['Ads assigned', '10% convert', '6% baseline', '4 pp net lift', 'a'],
                  ['Random holdout', '6% convert', '6% baseline', 'No campaign ads', 'b']];
      var joinY = one ? 16 + 2 * (ph + 22) + 6 : 16 + ph + 40;
      var joinX = one ? 12 : 24, joinW = one ? 376 : 712;
      var joinH = measure('10% − 6% = 4 percentage points', '40 extra conversions per 1,000 assigned users.', joinW);
      var s = svg(wrapEl, joinY + joinH + 14, 'Ad-assigned and randomized holdout populations have conversion rates of ten and six percent, for four percentage points of aggregate lift.');
      rows.forEach(function (r, i) {
        var px = one ? 12 : (i ? 400 : 24), py = one ? 16 + i * (ph + 22) : 16;
        S('rect', { x: px, y: py, width: pw, height: ph, rx: 10, class: 'box ' + r[4] }, s);
        S('rect', { x: px + 1, y: py + 12, width: 3, height: ph - 24, rx: 1.5, fill: 'var(--' + SPINE[r[4]] + ')' }, s);
        r.slice(0, 4).forEach(function (t, j) { txt(s, px + 20, py + 24 + j * (j ? 15 : 18) + (j ? 3 : 0), t, j ? 't-sm' : 't-md t-b'); });
        var cx = px + pw / 2;
        if (one) arrow(s, 'M ' + cx + ' ' + (py + ph) + ' V ' + (py + ph + (i ? 28 : 22)));
        else arrow(s, 'M ' + cx + ' ' + (py + ph) + ' V ' + (py + ph + 20) + ' H 380' + (i ? '' : ' V ' + joinY));
      });
      band(s, joinY, '10% − 6% = 4 percentage points', '40 extra conversions per 1,000 assigned users.', 'g', joinX, joinW);
    }
    draw(); onResize(draw);
    h.appendChild(E('p', { class: 'w-sub', text: 'The baseline-plus-lift split is an aggregate illustration. Identifying “would convert anyway” people requires unobservable potential outcomes; interpreting lift as a count helped also assumes no one is discouraged. Real estimates need uncertainty and checks for spillovers.' }));
  }

  /* ---------- ch.15 · the objective ---------- */
  function objective() {
    var h = mount('d-objective', 'Predictions inform the score. People set the policy.', 'A simplified CPC objective, with every term expressed in value per impression. A conversion goal replaces bidCPC × pCTR with targetCPA × pCTR × pCVR before controller adjustments. The score is not the clearing payment.', false);
    if (!h) return;
    var wrapEl = E('div'); h.appendChild(wrapEl);
    function draw() {
      wrapEl.replaceChildren();
      stage(wrapEl, [
        ['Advertiser term: bidCPC × pCTR', 'Bid: dollars/click. pCTR: model prediction.', 'b'],
        ['Alternative: conversion bidding', 'Replace CPC term with CPA × pCTR × pCVR.', 'b'],
        ['User cost: λ × c × pHide', 'pHide: prediction. λ and value scale c: policy.', 'v'],
        ['Total score = advertiser term', '+ user-value term − user-cost term', 'a'],
        ['Ad load: how many slots may be filled', 'A policy constraint, outside the score formula.', 'g']
      ], 'Predicted click, conversion and hide probabilities feed a value score; human policy sets tradeoff weights and the number of ad slots.');
    }
    draw(); onResize(draw);
  }

  /* ---------- ch.1 · latency budget (called from the chapter widget) ---------- */
  function latency(host, segs, lat) {
    var f = E('figure', { class: 'diagram aq-diagram aq-latency' });
    host.appendChild(f);
    f.appendChild(E('figcaption', { text: 'The chapter’s full request has a 200 ms reference budget. This widget models selection with a 100 ms timeout budget. Colored segments below use this widget’s actual stage costs; the budget lines are references, not extra work.' }));
    var g = geom(), max = Math.max(220, lat * 1.1);
    var c = Book.chart(f, {
      w: g.W, h: 190, x: [0, max], y: [0, 1], xticks: [0, 100, 200], yticks: [],
      xlabel: 'Milliseconds · current selection path',
      label: 'Current selection stage latencies compared with the simulator’s 100 millisecond timeout budget and the chapter’s 200 millisecond full-request reference.',
      margin: { l: 24, r: 20, t: 26, b: 44 }
    });
    var start = 0;
    segs.forEach(function (s) { c.rect(start, .3, start + s[1], .7, { fill: s[2], rx: 3 }); start += s[1]; });
    c.vline(100, { color: 'var(--accent)' }); c.vline(200, { color: 'var(--ink-3)' });
    c.text(100, .92, '100', { anchor: 'middle', size: 11.5 });
    c.text(200, .92, '200', { anchor: 'middle', size: 11.5 });
    var s = svg(f, 16 + segs.length * 20 + 8, 'Current latency in milliseconds for fixed overhead, retrieval, early ranking and late ranking.');
    segs.forEach(function (r, i) {
      S('rect', { x: g.pad, y: 8 + i * 20, width: 9, height: 9, rx: 2, fill: r[2] }, s);
      txt(s, g.pad + 18, 16 + i * 20, r[0] + ': ' + r[1].toFixed(1) + ' ms', 't-sm');
    });
    f.appendChild(E('p', { class: 'w-sub', text: 'Total selection latency: ' + lat.toFixed(1) + ' ms. Increasing candidates or late-ranker size changes these numbers and the timeout rate shown below.' }));
  }

  /* ---------- ch.17 · the lever map ---------- */
  function levers() {
    var h = mount('d-levers', 'The decisions behind your dashboard', 'Use this map when a capstone metric moves. Pick the mechanism you suspect, then return to the chapter that lets you inspect it.', false);
    if (!h) return;
    var wrapEl = E('div'); h.appendChild(wrapEl);
    var rows = [['Candidate eligibility', '01-two-hundred-ms', 'Ch. 1 · who enters'],
      ['Reserves and auction prices', '02-auction', 'Ch. 2 · who wins and pays'],
      ['Calibration and conversion bids', '12-conversion-modeling', 'Ch. 3 + 12 · prediction scale'],
      ['Exploration and retrieval', '10-retrieval', 'Ch. 5 + 10 · who gets a chance'],
      ['Model refresh', '14-pretrain-train-refresh', 'Ch. 14 · what the model remembers'],
      ['Hide penalty and ad load', '15-beyond-the-click', 'Ch. 15 · cost to users']];
    function draw() {
      wrapEl.replaceChildren();
      var g = geom(), x = g.pad, w = g.W - 2 * g.pad;
      /* Neutral bands: these are six equivalent destinations, so none of them is
         tinted. The accent sub-label and the hover stroke carry the affordance. */
      var laid = rows.map(function (r) {
        var tl = wrap(r[0], chars(w, 13.5)), dl = wrap(r[2], chars(w, 11.5));
        return { r: r, tl: tl, dl: dl, h: bandHeight(tl.length, dl.length) };
      });
      var y = 12;
      laid.forEach(function (L) { L.y = y; y += L.h + 10; });
      var s = svg(wrapEl, y + 2, 'Clickable capstone levers lead back to their mechanism chapters.');
      laid.forEach(function (L) {
        var a = S('a', { href: L.r[1] + '.html', 'aria-label': L.r[0] + ': ' + L.r[2] }, s);
        S('rect', { x: x, y: L.y, width: w, height: L.h, rx: 10, class: 'box' }, a);
        S('rect', { x: x + 1, y: L.y + 12, width: 3, height: L.h - 24, rx: 1.5, fill: 'var(--accent)' }, a);
        mlines(a, x + 20, L.y + 24, L.tl, 't-md t-b', TITLE_LH);
        mlines(a, x + 20, L.y + PAD_T + L.tl.length * TITLE_LH + 12, L.dl, 't-sm t-link', DETAIL_LH);
      });
    }
    draw(); onResize(draw);
    h.appendChild(E('p', { class: 'w-sub', text: 'Pacing controls when an advertiser’s budget can be spent; revisit the capstone budget rules. For credible impact measurement, return to Chapters 9 and 16.' }));
  }

  /* ---------- ch.13 · one reporting cell ---------- */
  function privacy() {
    var h = mount('w-privacy-diagram', 'Watch one reporting cell disappear', 'Illustrative cell: nine conversions for one advertiser on one day. Your reporting function applies the threshold; the diagram then adds a fixed Gaussian noise draw scaled by the noise dial. This does not establish differential privacy.', true);
    if (!h) return;
    var controls = E('div'), out = E('div');
    h.append(controls, out);
    var status = output(h), z = Book.rng(99).normal();
    var ctl = Book.controls(controls, [
      { key: 'k', label: 'Minimum conversions to publish', min: 1, max: 15, step: 1, value: 5 },
      { key: 'noise', label: 'Noise standard deviation', min: 0, max: 6, step: .5, value: 2 }
    ], draw);
    function draw() {
      if (!ctl) return;
      out.replaceChildren();
      var rows = Array.from({ length: 9 }, function () { return { adv: 1, day: 0, conv: 1 }; }), report;
      try { report = Stack.impl('privacyReport')(rows, { k: ctl.values.k }); }
      catch (e) { status.textContent = e.message; return; }
      var count = report['1:0'], published = count == null ? null : Math.max(0, Math.round(count + ctl.values.noise * z));
      stage(out, [
        ['Input cell: 9 conversions', 'One advertiser × one day; illustrative counts.', 'b'],
        ['Threshold: k = ' + ctl.values.k, count == null ? 'Suppressed: no published cell.' : 'Passes: ' + count + ' conversions before noise.', 'v'],
        ['Noise draw: ' + (ctl.values.noise * z).toFixed(2), 'Same random draw; change only its scale.', ''],
        ['Published result', published == null ? 'No value (not a reported zero).' : String(published) + ' conversions after rounding / clipping.', 'a']
      ], 'A conversion count passes or fails a threshold, then receives scaled noise before publication.');
      status.textContent = 'Using ' + source('privacyReport') + '. Published: ' + (published == null ? 'suppressed' : published) + '. No privacy budget, contribution bound or guarantee is modeled.';
    }
    draw(); onResize(draw);
  }

  /* ---------- ch.10 · why retrieval is fast ---------- */
  function ann() {
    var h = mount('d-ann', 'Why retrieval gets to be fast', 'Two towers move ad-side work out of the request path. Approximate search visits part of an index and trades recall for speed; it does not promise a fixed millisecond latency. The book’s small corpus uses exact top-K.', false);
    if (!h) return;
    var wrapEl = E('div'); h.appendChild(wrapEl);
    function draw() {
      wrapEl.replaceChildren();
      stage(wrapEl, [
        ['Before the request: encode each ad', 'Store vectors in a versioned, refreshed index.', 'b'],
        ['At request time: encode the user once', 'Search the index using dot-product similarity.', 'g'],
        ['Retrieve K candidates → ranking', 'Measure both index recall and relevance recall.', 'a'],
        ['Cross tower: combine each user–ad pair', 'A fresh joint forward pass for each candidate.', 'v'],
        ['That cost grows with candidate count', 'Cache invariant work; reserve joint work for K.', '']
      ], 'Two-tower retrieval precomputes ad vectors and searches with one user vector, while cross-tower ranking performs joint work for each retained candidate.');
    }
    draw(); onResize(draw);
  }

  /* ---------- ch.1 · the animated request funnel ---------- */
  function animatedFunnel() {
    var h = mount('w-request-funnel', 'One request. Twelve hopeful ads.',
      'Follow the same ads through filtering, scoring and selection. This is a twelve-ad teaching example, not a sample of your saved stack. The animation slows the request down so you can see what changes.', true);
    if (!h) return;
    var candidates = [
      { id: 'A', bid: 2, p: .03 }, { id: 'B', bid: 5, p: .01, reason: 'Wrong country' },
      { id: 'C', bid: 1.5, p: .05 }, { id: 'D', bid: 3, p: .012 },
      { id: 'E', bid: 4, p: .04, reason: 'Not running' }, { id: 'F', bid: 1, p: .09 },
      { id: 'G', bid: 2.5, p: .02 }, { id: 'H', bid: 2, p: .025, reason: 'Budget spent' },
      { id: 'I', bid: .8, p: .04 }, { id: 'J', bid: 1.8, p: .025 },
      { id: 'K', bid: 3, p: .06, reason: 'Frequency cap' }, { id: 'L', bid: 1.2, p: .035 }
    ];
    candidates.forEach(function (a) { a.score = a.bid * a.p; });
    var eligible = candidates.filter(function (a) { return !a.reason; }),
      excluded = candidates.filter(function (a) { return !!a.reason; }),
      ranked = eligible.slice().sort(function (a, b) { return b.score - a.score; });
    var descriptions = [
      'Start: twelve ads enter the example. A high bid alone cannot get an ad shown.',
      'Eligibility: B, E, H and K are filtered out. Eight remain. Targeting, campaign dates, budget and frequency caps are constraints, not model scores.',
      'Rank: the same eight eligible ads are ordered by bid × pCTR. No ad disappears at this step. F leads with $0.090 per impression, ahead of C and A.',
      'Select and serve: F, C and A fill the three slots. Five eligible ads lose this auction; four never qualified. The auction also sets prices, which Chapter 2 explains.'
    ];
    var controls = E('div', { class: 'btn-row' }); h.appendChild(controls);
    var play = button(controls, 'Play request', start),
      pause = button(controls, 'Pause', stop, true),
      next = button(controls, 'Next stage', function () { stop(); setStage(Math.min(3, current + 1)); }, true),
      reset = button(controls, 'Reset', function () { stop(); setStage(0); }, true);
    var status = output(h);
    var holder = E('div'); h.appendChild(holder);
    h.appendChild(E('p', { class: 'w-sub', text: 'Solid cards are still in contention; faded cards are out. Notice that ranking reorders the eight survivors—it does not shrink this candidate set. Your small stack scores every eligible ad; retrieval joins the funnel in Chapter 10.' }));

    var current = 0, timer = null, running = false,
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var s, stages, heading, tiles, L;

    function build() {
      holder.replaceChildren();
      var g = geom();
      L = g.narrow
        ? { cols: 2, tw: 176, tp: 188, x: 12, cw: 82, cp: 94, ch: 56, rows: 6 }
        : { cols: 4, tw: 166, tp: 186, x: 20, cw: 160, cp: 186, ch: 60, rows: 3 };
      L.top = L.ch + 12 + 46;                    /* chips + gap + heading baseline room */
      var height = L.top + L.rows * 74 - 12 + 12;
      s = svg(holder, height, 'Twelve illustrative ads pass through eligibility, ranking and selection. Start the animation or use Next stage to follow their identities.');
      stages = [];
      ['All ads', 'Eligible', 'Ranked', 'Shown'].forEach(function (name, i) {
        var x = L.x + i * L.cp, grp = S('g', {}, s);
        var shape = S('rect', { x: x, y: 12, width: L.cw, height: L.ch, rx: 10, class: 'box' }, grp);
        txt(grp, x + L.cw / 2, 32, name, 't-sm t-b').setAttribute('text-anchor', 'middle');
        var count = txt(grp, x + L.cw / 2, 12 + L.ch - 12, String([12, 8, 8, 3][i]), 'aq-count');
        count.setAttribute('text-anchor', 'middle');
        stages.push(shape);
        if (i < 3) arrow(s, 'M ' + (x + L.cw + 3) + ' ' + (12 + L.ch / 2) + ' H ' + (x + L.cp - 5));
      });
      heading = txt(s, L.x, L.ch + 12 + 30, '12 candidates · before filtering', 't-md t-b');
      tiles = candidates.map(function (a) {
        var grp = S('g', { class: 'aq-candidate' }, s),
          rect = S('rect', { x: 0, y: 0, width: L.tw, height: 62, rx: 10, class: 'box' }, grp);
        return {
          ad: a, g: grp, rect: rect,
          name: txt(grp, 14, 20, 'Ad ' + a.id, 't-md t-b'),
          detail: txt(grp, 14, 38, '$' + a.bid.toFixed(2) + '/click', 't-sm'),
          note: txt(grp, 14, 54, 'pCTR ' + (a.p * 100).toFixed(1) + '%', 't-sm')
        };
      });
    }

    function setStage(n) {
      current = n;
      var order = n === 0 ? candidates : n === 1 ? eligible.concat(excluded) : ranked.concat(excluded);
      stages.forEach(function (shape, i) { shape.setAttribute('class', 'box ' + (i === n ? (i === 3 ? 'g cur' : 'a cur') : i < n ? 'b' : '')); });
      heading.textContent = ['12 candidates · before filtering', '8 eligible · 4 filtered out', '8 scored · highest bid × pCTR first', '3 winners · ready for the feed'][n];
      tiles.forEach(function (t) {
        var a = t.ad, k = order.indexOf(a), out = n > 0 && a.reason,
          win = n === 3 && !a.reason && k < 3, loser = n === 3 && !a.reason && k >= 3;
        t.g.style.transform = 'translate(' + (L.x + (k % L.cols) * L.tp) + 'px,' + (L.top + Math.floor(k / L.cols) * 74) + 'px)';
        t.g.style.opacity = out || loser ? '0.58' : '1';
        t.rect.setAttribute('class', 'box ' + (win ? 'g cur' : n >= 2 && !out ? 'b' : ''));
        t.name.textContent = win ? 'Slot ' + (k + 1) + ' · ' + a.id : 'Ad ' + a.id;
        t.detail.textContent = out ? ({ B: 'Country', E: 'Inactive', H: 'Budget', K: 'Freq. cap' }[a.id]) : n >= 2 ? '$' + a.score.toFixed(3) : '$' + a.bid.toFixed(2) + '/click';
        t.note.textContent = out ? 'Filtered out' : loser ? 'Not selected' : n >= 2 ? 'bid × pCTR' : 'pCTR ' + (a.p * 100).toFixed(1) + '%';
      });
      status.textContent = descriptions[n];
      s.setAttribute('aria-label', descriptions[n]);
      next.disabled = n === 3; pause.disabled = !running;
      play.textContent = reduced.matches ? 'Show result' : n === 3 ? 'Replay request' : n === 0 ? 'Play request' : 'Continue request';
      play.disabled = running;
    }
    function stop() { clearTimeout(timer); timer = null; running = false; pause.disabled = true; play.disabled = false; }
    function advance() {
      if (!running) return;
      setStage(current + 1);
      if (current === 3) { stop(); setStage(3); } else timer = setTimeout(advance, 1700);
    }
    function start() {
      stop();
      if (reduced.matches) { setStage(3); return; }
      if (current === 3) setStage(0);
      running = true; play.disabled = true; pause.disabled = false;
      timer = setTimeout(advance, current === 0 ? 900 : 300);
    }
    onResize(function () { build(); setStage(current); });
    reduced.addEventListener('change', function () { stop(); setStage(current); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
    build(); setStage(0);
  }

  window.AQDiagrams = { gsp: gsp, latency: latency };
  document.addEventListener('DOMContentLoaded', function () {
    errors(); gradient(); feedback(); auc(); hashing(); timeline();
    worlds(); objective(); levers(); privacy(); ann(); animatedFunnel();
  });
})();
