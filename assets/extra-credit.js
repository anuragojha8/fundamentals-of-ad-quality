/* Extra-credit mechanism diagrams. All scores and timelines are illustrative. */
(function () {
  'use strict';
  var E = Book.el, S = Book.sv;

  function makeSvg(host, height, label) {
    var width = Math.max(280, Math.round(host.getBoundingClientRect().width) || 400);
    var svg = S('svg', { class: 'aq-svg ec-svg', viewBox: '0 0 ' + width + ' ' + height,
      role: 'img', 'aria-label': label }, host);
    return { svg: svg, w: width, narrow: width < 560 };
  }
  function shape(parent, x, y, width, height, cls, radius) {
    return S('rect', { x: x, y: y, width: width, height: height,
      rx: radius == null ? 8 : radius, class: cls }, parent);
  }
  function label(parent, x, y, value, cls) {
    return S('text', { x: x, y: y, text: value, class: cls || 't-md' }, parent);
  }
  function card(parent, x, y, width, title, detail) {
    var box = shape(parent, x, y, width, 54, 'box');
    label(parent, x + 14, y + 22, title, 't-md t-b');
    label(parent, x + 14, y + 40, detail, 't-sm');
    return box;
  }
  function active(box, isCurrent, isPast) {
    box.setAttribute('class', 'box' + (isCurrent ? ' a cur' : isPast ? ' b' : ' ec-pending'));
  }
  function watchWidth(host, build) {
    var width = 0;
    function check() {
      var next = Math.round(host.getBoundingClientRect().width);
      if (next > 40 && next !== width) { width = next; build(); }
    }
    if (window.ResizeObserver) new ResizeObserver(check).observe(host);
    else window.addEventListener('resize', check, { passive: true });
    check();
  }
  function player(host, last, render) {
    var row = E('div', { class: 'btn-row' });
    host.insertBefore(row, host.querySelector('.ec-drawing'));
    var status = E('p', { class: 'aq-status', role: 'status', 'aria-live': 'polite' });
    var stage = 0, running = false, timer = null;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function button(text, fn, secondary) {
      var b = E('button', { type: 'button', class: secondary ? 'btn secondary' : 'btn', text: text });
      b.addEventListener('click', fn); row.appendChild(b); return b;
    }
    var play = button('Play', start, false);
    var pause = button('Pause', stop, true);
    var next = button('Next stage', function () { stop(); set(Math.min(stage + 1, last)); }, true);
    button('Reset', function () { stop(); set(0); }, true);
    function sync() {
      play.disabled = running;
      play.textContent = reduced.matches ? 'Show result' : stage === last ? 'Replay' : stage ? 'Continue' : 'Play';
      pause.disabled = !running;
      next.disabled = stage === last;
    }
    function set(n) { stage = n; status.textContent = render(n); sync(); }
    function stop() { clearTimeout(timer); timer = null; running = false; sync(); }
    function advance() {
      if (!running) return;
      set(Math.min(stage + 1, last));
      if (stage === last) stop(); else timer = setTimeout(advance, 1700);
    }
    function start() {
      stop();
      if (reduced.matches) { set(last); return; }
      if (stage === last) set(0);
      running = true; sync();
      timer = setTimeout(advance, stage === 0 ? 900 : 300);
    }
    reduced.addEventListener('change', function () { stop(); set(stage); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
    host.appendChild(status);
    set(0);
    return { redraw: function () { set(stage); } };
  }

  /* Two persistent segmented bars change width as recent actions arrive. */
  function history() {
    var host = document.getElementById('w-ec-history'), holder = E('div', { class: 'ec-drawing' });
    // Two dials the reader owns: how much the older summary counts, and how far each
    // new action pulls the live score. Everything below is computed from them.
    var dials = E('div'); host.appendChild(dials);
    host.appendChild(holder);
    var ctl = Book.controls(dials, [
      { key: 'longW', label: 'Weight on older history', min: 0, max: 0.9, step: 0.1, value: 0.4, fmt: function (v) { return Math.round(v * 100) + '%'; } },
      { key: 'pull', label: 'How far each new action moves the live score', min: 0.1, max: 0.9, step: 0.1, value: 0.5, fmt: function (v) { return Math.round(v * 100) + '% of the way'; } }
    ], function () { if (control) control.redraw(); });
    var LONG_CAMP = 0.2, FIRST_LIVE_CAMP = 0.4, ACTIONS = ['saves a campsite', 'compares tents', 'opens a packing list'];
    function scores(n) {
      var v = ctl.values, recent = 1 - (1 - FIRST_LIVE_CAMP) * Math.pow(1 - v.pull, n);
      return { recent: recent, blended: v.longW * LONG_CAMP + (1 - v.longW) * recent };
    }
    function flipAt() {
      for (var k = 0; k <= 3; k++) if (scores(k).blended > 0.5) return k;
      return -1;
    }
    var view, control = player(host, 3, function (n) {
      if (!view) return 'After one campsite view, press Play to add three more camping actions.';
      var sc = scores(n), camps = [LONG_CAMP, sc.recent, sc.blended];
      view.bars.forEach(function (bar, i) {
        var running = view.bw * (1 - camps[i]);
        bar.run.setAttribute('width', running.toFixed(1));
        bar.camp.setAttribute('x', (view.x + running).toFixed(1));
        bar.camp.setAttribute('width', (view.bw - running).toFixed(1));
        bar.num.textContent = Math.round(100 * (1 - camps[i])) + '% running  ·  ' + Math.round(100 * camps[i]) + '% camping';
      });
      view.dots.forEach(function (dot, i) { dot.setAttribute('class', i < n ? 'ec-event ec-on' : 'ec-event'); });
      view.count.textContent = n ? n + ' more camping ' + (n === 1 ? 'action' : 'actions') : 'Campsite view already seen';
      var pct = Math.round(100 * sc.blended), k = flipAt();
      var where = k === 0 ? 'Camping already leads after the first view: with these dials, one click moves the recommendation.'
        : k > 0 ? 'Camping takes the lead after ' + k + ' more ' + (k === 1 ? 'action' : 'actions') + '.'
        : 'Even after all three actions, running still leads: the older history is holding on.';
      var what = n === 0 ? 'After the campsite view, the combined score is ' + pct + '% camping.'
        : 'The user ' + ACTIONS[n - 1] + '; the combined score is now ' + pct + '% camping.';
      return what + ' ' + where;
    });
    function build() {
      holder.replaceChildren();
      var d = makeSvg(holder, 320, 'Three toy preference bars compare long-term memory, recent actions, and their blended score.');
      var s = d.svg, w = d.w, x = 16, bw = w - 32, rows = [];
      label(s, x, 24, 'OLDER HISTORY', 't-sm t-b');
      label(s, x, 46, 'Race plan → shoes → route', 't-md');
      label(s, x, 77, 'THIS MORNING', 't-sm t-b');
      var dots = [];
      for (var i = 0; i < 3; i++) dots.push(S('circle', { cx: x + 12 + i * 27, cy: 96, r: 8, class: 'ec-event' }, s));
      var count = label(s, x + 100, 100, '', 't-sm');
      [['Long-term memory', 132], ['Live sequence', 196], ['Combined signal', 260]].forEach(function (r) {
        label(s, x, r[1], r[0], 't-md t-b');
        var num = label(s, x, r[1] + 38, '', 't-sm');
        shape(s, x, r[1] + 8, bw, 15, 'ec-bar-track', 3);
        var run = shape(s, x, r[1] + 8, 0, 15, 'ec-run', 3);
        var camp = shape(s, x, r[1] + 8, 0, 15, 'ec-camp', 3);
        rows.push({ run: run, camp: camp, num: num });
      });
      view = { x: x, bw: bw, bars: rows, dots: dots, count: count };
      control.redraw();
    }
    watchWidth(holder, build);
  }

  /* Branching candidate paths; stage emphasis moves without replacing the SVG. */
  function retrieval() {
    var host = document.getElementById('w-ec-retrieval'), holder = E('div', { class: 'ec-drawing' });
    host.appendChild(holder);
    var view, lines = [
      'Start with the same action history. Both paths propose candidates; neither runs the auction.',
      'The two-tower path encodes the user once. The generative path reads the ordered sequence.',
      'One path searches nearby indexed ad vectors. The other decodes learned semantic-ID tokens.',
      'Both paths resolve their outputs to real, current ad IDs. A code by itself is not an ad.',
      'The candidate sets can be merged and checked for eligibility before ranking.'
    ];
    var control = player(host, 4, function (n) {
      if (view) view.forEach(function (lane) { lane.forEach(function (b, i) { active(b, i === n, i < n); }); });
      return lines[n];
    });
    function build() {
      holder.replaceChildren();
      var width = Math.max(280, Math.round(holder.getBoundingClientRect().width) || 400);
      var narrow = width < 560, h = narrow ? 684 : 370;
      var d = makeSvg(holder, h, 'Two-tower nearest-neighbor retrieval and semantic-ID generative retrieval run in parallel, then return candidate ad IDs.');
      var s = d.svg, w = d.w, pad = 14, gap = 20, col = narrow ? w - 2 * pad : (w - 2 * pad - gap) / 2;
      var paths = [
        [['Shared action history', 'Running → camping'], ['Encode user vector', 'One representation per request'], ['ANN index search', 'Find nearby ad vectors'], ['Resolve indexed IDs', 'Map neighbors to current ads'], ['Candidate ad IDs', 'Pass to eligibility checks']],
        [['Shared action history', 'Running → camping'], ['Read ordered actions', 'Sequence model at request time'], ['Decode (4, 2, 7)', 'Learned semantic-ID tokens'], ['Look up semantic ID', 'Map code to a current ad'], ['Candidate ad IDs', 'Pass to eligibility checks']]
      ];
      var lanes = [];
      paths.forEach(function (path, pi) {
        var x = narrow ? pad : pad + pi * (col + gap), top = narrow ? 22 + pi * 336 : 24;
        label(s, x, top, pi ? 'GENERATIVE RETRIEVAL' : 'TWO-TOWER RETRIEVAL', 't-sm t-b ec-heading');
        lanes.push(path.map(function (r, i) {
          var y = top + 14 + i * 61;
          var box = card(s, x, y, col, r[0], r[1]);
          if (i < path.length - 1) S('path', { d: 'M ' + (x + col / 2) + ' ' + (y + 54) + ' v 7', class: 'ec-connector' }, s);
          return box;
        }));
      });
      view = lanes;
      control.redraw();
    }
    watchWidth(holder, build);
  }

  /* Candidate identities remain in place while gate counts and tones change. */
  function eligibility() {
    var host = document.getElementById('w-ec-eligibility'), holder = E('div', { class: 'ec-drawing' });
    host.appendChild(holder);
    var view, messages = [
      'Six IDs were proposed. This diagram makes no claim about which retrieval method supplied them.',
      'Lookup removes B: its ID no longer resolves to a live ad. Five remain.',
      'Targeting removes C and F for this request. Three remain.',
      'Budget or policy checks remove D. A and E reach ranking; an auction winner has not been chosen.'
    ];
    var control = player(host, 3, function (n) {
      if (view) {
        view.chips.forEach(function (chip) {
          var out = chip.cut && chip.cut <= n;
          chip.rect.setAttribute('class', out ? 'box ec-excluded' : 'box ' + (n === 3 ? 'g' : 'b'));
          chip.text.setAttribute('class', out ? 't-md ec-muted' : 't-md t-b');
        });
        view.gates.forEach(function (b, i) { active(b, i === n, i < n); });
      }
      return messages[n];
    });
    function build() {
      holder.replaceChildren();
      var d = makeSvg(holder, 405, 'Six proposed ad IDs pass through lookup, targeting, budget and policy checks; two survive.');
      var s = d.svg, w = d.w, pad = 14, gap = 7, columns = d.narrow ? 3 : 6;
      var chipw = (w - 2 * pad - (columns - 1) * gap) / columns, chips = [];
      label(s, pad, 24, 'PROPOSED CANDIDATE IDS', 't-sm t-b');
      [['A', 0], ['B', 1], ['C', 2], ['D', 3], ['E', 0], ['F', 2]].forEach(function (v, i) {
        var x = pad + (i % columns) * (chipw + gap), y = 36 + Math.floor(i / columns) * 39;
        var rect = shape(s, x, y, chipw, 31, 'box b', 6);
        var t = label(s, x + chipw / 2, y + 21, v[0], 't-md t-b ec-center');
        chips.push({ rect: rect, text: t, cut: v[1] });
      });
      var start = d.narrow ? 132 : 100;
      var gates = [
        ['Proposed IDs · 6', 'Candidates, not winners'],
        ['Catalog lookup · 5', 'B no longer maps to a live ad'],
        ['Request targeting · 3', 'C and F are outside the audience'],
        ['Budget and policy · 2', 'A and E can enter ranking']
      ].map(function (r, i) { return card(s, pad, start + i * 68, w - 2 * pad, r[0], r[1]); });
      view = { chips: chips, gates: gates };
      control.redraw();
    }
    watchWidth(holder, build);
  }

  /* Independent refresh clocks are a hypothetical architecture, not Pebble metrics. */
  function freshness() {
    var host = document.getElementById('w-ec-freshness'), holder = E('div', { class: 'ec-drawing' });
    host.appendChild(holder);
    var view, messages = [
      'At 10:02 a user opens a campsite page and an advertiser launches a lantern ad. Nothing downstream is fresh yet.',
      'The action reaches the event stream. Logging a fact is not the same as serving it as a feature.',
      'The live user feature updates. A request can now use the new action with yesterday’s model weights.',
      'The lantern reaches the ad index. A new ad can be retrieved only after indexing and eligibility checks.',
      'Later, trained weights incorporate mature data. Feature, index and model cadences are separate choices.'
    ];
    var control = player(host, 4, function (n) {
      if (view) view.forEach(function (b, i) { active(b, i === n, i < n); });
      return messages[n];
    });
    function build() {
      holder.replaceChildren();
      var d = makeSvg(holder, 364, 'A hypothetical action and new ad move through event delivery, online features, ad indexing, and model-weight updates at separate times.');
      var s = d.svg, pad = 14, w = d.w;
      label(s, pad, 24, 'HYPOTHETICAL LAUNCH DAY', 't-sm t-b');
      var rows = [
        ['10:02 · user action + new ad', 'Two fresh inputs arrive'],
        ['10:02:01 · event stream', 'Action is recorded and delivered'],
        ['10:02:02 · online user feature', 'Recent actions available at serve time'],
        ['10:10 · refreshed ad index', 'The new lantern can enter retrieval'],
        ['Next day · model weights', 'Training incorporates mature examples']
      ];
      view = rows.map(function (r, i) {
        var y = 34 + i * 66;
        var box = card(s, pad, y, w - 2 * pad, r[0], r[1]);
        if (i < 4) S('path', { d: 'M ' + (pad + 16) + ' ' + (y + 54) + ' v 12', class: 'ec-connector' }, s);
        return box;
      });
      control.redraw();
    }
    watchWidth(holder, build);
  }

  document.addEventListener('DOMContentLoaded', function () {
    history(); retrieval(); eligibility(); freshness();
  });
})();
