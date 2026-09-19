/* Fundamentals of Ad Quality — the reader's ad stack.
 *
 * One working mini ad system that grows chapter by chapter:
 *   request loop → retrieval → ranking → GSP auction → serve → logging & joins
 *   → training → evaluation
 *
 * The reader implements small pieces ("code slots") in the browser. A slot's
 * reader code is used only after it passes its tests; until then the stack
 * falls back to the reference implementation, so skipping ahead never blocks.
 * Trained models and settings persist in localStorage.
 *
 * No DOM access here (UI lives in stack-ui.js), so this file also runs in a
 * Web Worker (sandboxed test runs) and in Node (the repo's test script).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'), require('./nn.js'));
  else root.Stack = factory(root.World, root.NN);
})(typeof self !== 'undefined' ? self : this, function (World, NN) {
  'use strict';

  var STORE_KEY = 'faq-stack-v1';
  var hashUnit = World.hashUnit;

  /* ================================================================== *
   * Persistence
   * ================================================================== */
  function defaultState() {
    return {
      v: 1,
      seed: 7,
      worldVersion: World.VERSION,
      code: {},        // slotId -> { src, passed }
      built: {},       // chapter number -> 'you' | 'reference'
      settings: {
        requestsPerDay: 3000,
        retrieval: 'eligible', retrievalK: 60,
        ranker: 'heuristic',
        calibrate: false,
        reserveEcpm: 0,
        pricing: 'cpc',
        cvrModel: 'oracle',
        epsilon: 0, shuffle: 0,
        hashBits: 15,
        retrainEvery: 7, warmStart: true
      },
      models: {},      // name -> serialized model
      calib: {}        // rankerName -> { preds: [], labels: [] } calibration sample
    };
  }
  var hasLS = (function () { try { return typeof localStorage !== 'undefined' && localStorage !== null; } catch (e) { return false; } })();
  var state = load();
  function load() {
    var s = defaultState();
    if (!hasLS) return s;
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && raw.v === 1) {
        for (var k in raw) if (k !== 'settings') s[k] = raw[k];
        for (k in raw.settings || {}) s.settings[k] = raw.settings[k];
        // Models trained on an older version of the world are meaningless in the new one.
        if (raw.worldVersion !== World.VERSION) {
          s.models = {}; s.calib = {};
          [7, 10, 11, 12, 14].forEach(function (c) { if (s.built[c]) delete s.built[c]; });
          s.modelsReset = true;
        }
      }
      s.worldVersion = World.VERSION;
    } catch (e) {}
    return s;
  }
  var listeners = [];
  function save() {
    if (hasLS) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
      catch (e) { if (typeof console !== 'undefined') console.warn('Could not save stack state', e); }
    }
    listeners.forEach(function (f) { try { f(state); } catch (e) {} });
  }
  function onChange(f) { listeners.push(f); }
  function reset() { state = defaultState(); _world = null; save(); }

  /* ================================================================== *
   * Small utilities
   * ================================================================== */
  // Yield to the event loop so the page stays responsive during long runs. MessageChannel
  // isn't clamped/throttled like setTimeout is in background tabs.
  var tick = (function () {
    if (typeof MessageChannel === 'undefined') return function () { return new Promise(function (r) { setTimeout(r, 0); }); };
    var ch = new MessageChannel(), queue = [];
    ch.port1.onmessage = function () { var r = queue.shift(); if (r) r(); };
    return function () { return new Promise(function (r) { queue.push(r); ch.port2.postMessage(0); }); };
  })();
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  // FNV-1a, 32-bit. The hashing trick maps any feature string to a bucket.
  function fnv1a(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function hashFeatures(feats, bits) {
    var mask = (1 << bits) - 1, out = new Int32Array(feats.length);
    for (var i = 0; i < feats.length; i++) out[i] = fnv1a(feats[i]) & mask;
    return out;
  }

  /* ---------- reference metrics (the reader re-implements some in Ch. 9) ---------- */
  function aucRef(preds, labels) {
    var n = preds.length, idx = new Array(n), i;
    for (i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (a, b) { return preds[a] - preds[b]; });
    var rankSum = 0, nPos = 0; i = 0;
    while (i < n) {
      var j = i;
      while (j + 1 < n && preds[idx[j + 1]] === preds[idx[i]]) j++;
      var avg = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) if (labels[idx[k]]) { rankSum += avg; nPos++; }
      i = j + 1;
    }
    var nNeg = n - nPos;
    if (!nPos || !nNeg) return NaN;
    return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
  }
  function loglossRef(preds, labels) {
    var s = 0;
    for (var i = 0; i < preds.length; i++) { var p = clamp(preds[i], 1e-7, 1 - 1e-7); s -= labels[i] ? Math.log(p) : Math.log(1 - p); }
    return s / preds.length;
  }
  function neRef(preds, labels) {
    var br = 0; for (var i = 0; i < labels.length; i++) br += labels[i];
    br /= labels.length;
    var h = -(br * Math.log(br) + (1 - br) * Math.log(1 - br));
    return loglossRef(preds, labels) / h;
  }
  function reliability(preds, targets, nBins) {
    // Equal-count bins; targets may be 0/1 labels or true probabilities.
    nBins = nBins || 10;
    var idx = preds.map(function (_, i) { return i; }).sort(function (a, b) { return preds[a] - preds[b]; });
    var out = [], per = Math.max(1, Math.floor(idx.length / nBins));
    for (var b = 0; b < nBins; b++) {
      var lo = b * per, hi = b === nBins - 1 ? idx.length : (b + 1) * per;
      if (lo >= hi) continue;
      var sp = 0, st = 0;
      for (var k = lo; k < hi; k++) { sp += preds[idx[k]]; st += targets[idx[k]]; }
      out.push({ pred: sp / (hi - lo), actual: st / (hi - lo), n: hi - lo });
    }
    return out;
  }
  function ece(preds, targets, nBins) {
    var bins = reliability(preds, targets, nBins || 10), n = preds.length, e = 0;
    bins.forEach(function (b) { e += b.n / n * Math.abs(b.pred - b.actual); });
    return e;
  }
  function pearson(a, b) {
    var n = a.length, ma = 0, mb = 0, i;
    for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var sab = 0, saa = 0, sbb = 0;
    for (i = 0; i < n; i++) { var x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return sab / Math.sqrt(saa * sbb);
  }

  /* ================================================================== *
   * World (one per seed, cached)
   * ================================================================== */
  var _world = null, worldOverrides = {};
  function setWorldOverrides(o) { worldOverrides = o || {}; _world = null; _prior = null; _logCache = {}; }
  function world() {
    if (!_world || _world.cfg.seed !== state.seed) _world = World.create(Object.assign({ seed: state.seed }, worldOverrides));
    return _world;
  }
  // The observable user+context object handed to reader code.
  function userView(w, req) {
    var u = w.users[req.user];
    return { id: u.id, age: u.age, country: u.country, device: req.device, hour: req.hour, day: req.day, history: w.history(req.user, req.day) };
  }
  // "Last month's dashboard": per-category CTR at slot 0 under random serving.
  var _prior = null;
  function prior() {
    if (_prior && _prior.seed === state.seed) return _prior;
    var w = world(), clicks = new Array(12).fill(0), imps = new Array(12).fill(0), tc = 0, ti = 0;
    var reqs = w.requestsForDay(0, 4000, 9);
    reqs.forEach(function (q) {
      var el = w.eligibleAds(q.user, 0);
      var a = el[Math.floor(hashUnit(state.seed, 91, q.id) * el.length)];
      var c = w.outcome(q, a, 0, 9).click, cat = w.ads[a].category;
      clicks[cat] += c; imps[cat]++; tc += c; ti++;
    });
    _prior = { seed: state.seed, globalCTR: tc / ti, catCTR: clicks.map(function (c, i) { return (c + 2) / (imps[i] + 2 / (tc / ti)); }) };
    return _prior;
  }

  /* ================================================================== *
   * Code slots — the pieces the reader builds
   * ================================================================== */
  var SLOTS = {};
  function slot(def) { SLOTS[def.id] = def; }

  slot({
    id: 'isEligible', chapter: 1, title: 'Eligibility filter',
    starter: [
      '// Return true if `ad` may be shown to `user` on `day`.',
      '//   ad.startDay, ad.endDay   the ad is live when startDay <= day < endDay',
      '//   ad.targeting.countries   null (anyone) or an array of allowed country ids',
      '//   ad.targeting.ages        null (anyone) or an array of allowed age-bucket ids',
      '//   user.country, user.age   the user\'s country id and age-bucket id',
      'function isEligible(ad, user, day) {',
      '  // TODO: check the flight dates, then each targeting rule',
      '  return true;',
      '}'
    ].join('\n'),
    reference: [
      'function isEligible(ad, user, day) {',
      '  if (day < ad.startDay || day >= ad.endDay) return false;      // not live',
      '  const t = ad.targeting;',
      '  if (t.countries && !t.countries.includes(user.country)) return false;',
      '  if (t.ages && !t.ages.includes(user.age)) return false;',
      '  return true;',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var w = world(), wrong = 0, n = 0, example = null;
      for (var i = 0; i < 400; i++) {
        var a = w.ads[(i * 37) % w.ads.length], u = w.users[(i * 101) % w.users.length], day = (i * 7) % 60;
        var got = !!fn(a, { id: u.id, age: u.age, country: u.country }, day);
        var want = w.isActive(a.id, day) && w.passesTargeting(a.id, u.id);
        n++; if (got !== want) { wrong++; if (!example) example = 'ad ' + a.id + ' (live days ' + a.startDay + '–' + (a.endDay - 1) + ', targeting ' + JSON.stringify(a.targeting) + ') for user age ' + u.age + ', country ' + u.country + ' on day ' + day + ': expected ' + want; }
      }
      T.check('Matches the ad server on 400 (ad, user, day) checks', wrong === 0, wrong ? wrong + ' mismatches. First: ' + example : '');
    }
  });

  slot({
    id: 'heuristicPCTR', chapter: 1, title: 'A heuristic pCTR',
    starter: [
      '// Predict the probability that `user` clicks `ad` if it is shown in the top slot.',
      '// You have no model yet — just common sense and last month\'s dashboard:',
      '//   prior.globalCTR          overall CTR in the top slot (about 0.03)',
      '//   prior.catCTR[c]          CTR for ads of category c',
      '//   ad.category              0..11 (Outdoor, Fitness, Travel, Finance, ...)',
      '//   user.history             categories of the 12 posts the user most recently',
      '//                            engaged with, most recent first',
      '//   user.age, user.device, user.hour',
      'function heuristicPCTR(ad, user, prior) {',
      '  // TODO: start from the category CTR and boost it when the user',
      '  // has recently engaged with this category.',
      '  return prior.globalCTR;',
      '}'
    ].join('\n'),
    reference: [
      'function heuristicPCTR(ad, user, prior) {',
      '  const c = ad.category;',
      '  const matches = user.history.filter(x => x === c).length;       // 0..12',
      '  const recent = user.history.slice(0, 3).filter(x => x === c).length;',
      '  const boost = 0.35 + 0.2 * matches + 0.35 * recent;',
      '  return Math.min(0.9, prior.catCTR[c] * boost);',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var w = world(), pr = prior(), reqs = w.requestsForDay(1, 250, 8), preds = [], truth = [], bad = 0;
      reqs.forEach(function (q) {
        var uv = userView(w, q), el = w.eligibleAds(q.user, 1);
        for (var k = 0; k < 8; k++) {
          var a = el[(k * 13 + q.id) % el.length];
          var p = fn(w.ads[a], uv, pr);
          if (typeof p !== 'number' || !(p >= 0 && p <= 1)) bad++;
          preds.push(p); truth.push(w.truth.relevance(q.user, a, q));
        }
      });
      T.check('Returns a probability between 0 and 1', bad === 0, bad ? bad + ' of ' + preds.length + ' outputs were not numbers in [0, 1]' : '');
      if (bad) return;
      var ord = pairOrderAcc(preds, truth);
      T.check('Orders ads better than a coin flip (pairwise accuracy vs. the truth > 0.60)', ord > 0.6, 'Your pairwise ordering accuracy against the true click probabilities: ' + ord.toFixed(3) + '. A constant scores 0.5.');
      var mp = mean(preds), mt = mean(truth);
      T.info('Average prediction ' + (mp * 100).toFixed(2) + '% vs. true average ' + (mt * 100).toFixed(2) + '% (we\'ll care about this gap in Chapter 3).');
    }
  });

  slot({
    id: 'runAuction', chapter: 2, title: 'The GSP auction',
    starter: [
      '// cands: [{ ad, bid, pctr }]   bid = max cost-per-click in $, pctr = predicted CTR',
      '// Rank by score = bid * pctr (expected $ per impression; eCPM = score * 1000).',
      '// Drop candidates whose score is below the reserve (reserveEcpm / 1000).',
      '// Fill up to nSlots slots. The winner of slot i pays, PER CLICK, the least it',
      '// could have bid and still kept its slot:',
      '//     price_i = max(score of the next-ranked candidate, reserve) / pctr_i',
      '// ...but never more than its own bid.',
      '// Return [{ ad, slot, price, ecpm }] ordered by slot.',
      'function runAuction(cands, nSlots, reserveEcpm) {',
      '  // TODO',
      '  return [];',
      '}'
    ].join('\n'),
    reference: [
      'function runAuction(cands, nSlots, reserveEcpm) {',
      '  const reserve = reserveEcpm / 1000;                 // $ per impression',
      '  const ranked = cands',
      '    .map(c => ({ ad: c.ad, bid: c.bid, pctr: c.pctr, score: c.bid * c.pctr }))',
      '    .filter(c => c.score >= reserve && c.score > 0)',
      '    .sort((a, b) => b.score - a.score);',
      '  const out = [];',
      '  for (let i = 0; i < Math.min(nSlots, ranked.length); i++) {',
      '    const c = ranked[i];',
      '    const next = i + 1 < ranked.length ? ranked[i + 1].score : 0;',
      '    const price = Math.min(c.bid, Math.max(next, reserve) / c.pctr);',
      '    out.push({ ad: c.ad, slot: i, price, ecpm: c.score * 1000 });',
      '  }',
      '  return out;',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var c1 = [{ ad: 'A', bid: 2.0, pctr: 0.02 }, { ad: 'B', bid: 1.0, pctr: 0.05 }, { ad: 'C', bid: 3.0, pctr: 0.01 }, { ad: 'D', bid: 0.5, pctr: 0.02 }];
      var r = fn(c1.map(clone), 2, 0) || [];
      T.check('Ranks by bid × pCTR, not by bid', r.length === 2 && r[0].ad === 'B' && r[1].ad === 'A', 'Expected [B, A]: B scores 1.00×0.05 = 0.050, A scores 0.040, C scores 0.030. Got ' + JSON.stringify(r.map(function (x) { return x.ad; })));
      if (r.length === 2) {
        T.close('Slot 0 price = next score / own pCTR = 0.040 / 0.05', r[0].price, 0.8, 1e-6);
        T.close('Slot 1 price = 0.030 / 0.02', r[1].price, 1.5, 1e-6);
        T.check('Slots are numbered 0, 1, …', r[0].slot === 0 && r[1].slot === 1, '');
      }
      var r2 = fn(c1.map(clone), 3, 35) || [];
      T.check('Reserve of $35 eCPM keeps only A and B', r2.length === 2, 'Got ' + r2.length + ' winners');
      if (r2.length === 2) T.close('Last winner pays the reserve: 0.035 / 0.02', r2[1].price, 1.75, 1e-6);
      var r3 = fn([{ ad: 'X', bid: 1.0, pctr: 0.1 }], 3, 150) || [];
      T.check('Nobody clears a reserve above every score', r3.length === 0, '');
      var r4 = fn([{ ad: 'X', bid: 1.0, pctr: 0.1 }], 3, 0) || [];
      T.check('A lone bidder pays 0 with no reserve', r4.length === 1 && Math.abs(r4[0].price) < 1e-9, '');
      var r5 = fn([{ ad: 'X', bid: 1.0, pctr: 0.1 }, { ad: 'Y', bid: 10.0, pctr: 0.0099 }], 1, 0) || [];
      T.check('Never charge more than the bid', r5.length === 1 && r5[0].price <= 1.0 + 1e-9, '');
    }
  });

  slot({
    id: 'fitCalibrator', chapter: 3, title: 'A calibration layer',
    starter: [
      '// Fit a calibration map from historical predictions and outcomes.',
      '//   preds:  array of predicted probabilities',
      '//   labels: array of 0/1 outcomes (same length)',
      '// Return a FUNCTION p => calibrated probability.',
      '// Suggested approach — histogram binning:',
      '//   1. sort the (pred, label) pairs by pred',
      '//   2. cut them into nBins groups of equal size',
      '//   3. for each group remember its largest pred and its average label',
      '//   4. the returned function finds p\'s group and returns that group\'s average label',
      'function fitCalibrator(preds, labels, nBins) {',
      '  // TODO',
      '  return p => p;',
      '}'
    ].join('\n'),
    reference: [
      'function fitCalibrator(preds, labels, nBins) {',
      '  const pairs = preds.map((p, i) => [p, labels[i]]).sort((a, b) => a[0] - b[0]);',
      '  const size = Math.ceil(pairs.length / nBins);',
      '  const edges = [], values = [];',
      '  for (let i = 0; i < pairs.length; i += size) {',
      '    const group = pairs.slice(i, i + size);',
      '    const meanPred = group.reduce((s, x) => s + x[0], 0) / group.length;',
      '    const clicks = group.reduce((s, x) => s + x[1], 0);',
      '    edges.push(group[group.length - 1][0]);',
      '    values.push((clicks + 10 * meanPred) / (group.length + 10)); // lightly smoothed',
      '  }',
      '  return p => {',
      '    let i = 0;',
      '    while (i < edges.length - 1 && p > edges[i]) i++;',
      '    return values[i];',
      '  };',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var r = World.Rand(5), preds = [], labels = [], truth = [];
      for (var i = 0; i < 6000; i++) { var t = sigmoid(r.normal(-3.2, 0.9)); truth.push(t); preds.push(Math.min(0.99, 2.2 * t)); labels.push(r.next() < t ? 1 : 0); }
      var cal = fn(preds.slice(), labels.slice(), 15);
      T.check('Returns a function', typeof cal === 'function', '');
      if (typeof cal !== 'function') return;
      var out = preds.map(function (p) { return cal(p); });
      var bad = out.filter(function (x) { return !(x >= 0 && x <= 1); }).length;
      T.check('Outputs are probabilities', bad === 0, bad + ' outputs outside [0, 1]');
      var ratio = mean(out) / mean(labels);
      T.check('Fixes a model that over-predicts by 2.2×: mean calibrated / mean actual within 10% of 1.0', Math.abs(ratio - 1) < 0.1, 'Ratio is ' + ratio.toFixed(3) + ' (before calibration: ' + (mean(preds) / mean(labels)).toFixed(2) + ')');
      var e0 = ece(preds, truth, 10), e1 = ece(out, truth, 10);
      T.check('Cuts calibration error against the truth by more than half', e1 < e0 / 2, 'ECE before ' + e0.toFixed(4) + ', after ' + e1.toFixed(4));
    }
  });

  slot({
    id: 'joinLabels', chapter: 4, title: 'The label join',
    starter: [
      '// Attach click and conversion labels to impressions.',
      '//   impressions: [{ rid, ad, t, ... }]      t = impression time in hours',
      '//   events:      [{ type: "click"|"conv", rid, ad, t }]',
      '//   opts:        { clickWindowH, convWindowH, nowT }',
      '// An event only counts if it has already happened (t <= nowT) and falls',
      '// inside its window measured from the impression time.',
      '// A conversion only counts if the impression also has a click.',
      '// Return a NEW array: each impression copied, plus { click: 0|1, conv: 0|1 }.',
      '// Tip: build a Map keyed by rid + ":" + ad — the join runs on ~50k rows.',
      'function joinLabels(impressions, events, opts) {',
      '  // TODO',
      '  return impressions.map(imp => Object.assign({}, imp, { click: 0, conv: 0 }));',
      '}'
    ].join('\n'),
    reference: [
      'function joinLabels(impressions, events, opts) {',
      '  const key = (rid, ad) => rid + ":" + ad;',
      '  const clicks = new Map(), convs = new Map();',
      '  for (const e of events) {',
      '    if (e.t > opts.nowT) continue;                  // hasn\'t happened yet',
      '    const m = e.type === "click" ? clicks : convs;',
      '    const k = key(e.rid, e.ad);',
      '    if (!m.has(k) || e.t < m.get(k)) m.set(k, e.t); // keep the earliest',
      '  }',
      '  return impressions.map(imp => {',
      '    const k = key(imp.rid, imp.ad);',
      '    const ct = clicks.get(k), vt = convs.get(k);',
      '    const click = ct !== undefined && ct - imp.t <= opts.clickWindowH ? 1 : 0;',
      '    const conv = click && vt !== undefined && vt - imp.t <= opts.convWindowH ? 1 : 0;',
      '    return Object.assign({}, imp, { click, conv });',
      '  });',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var imps = [{ rid: 1, ad: 10, t: 0 }, { rid: 1, ad: 11, t: 0 }, { rid: 2, ad: 10, t: 5 }, { rid: 3, ad: 12, t: 10 }, { rid: 4, ad: 13, t: 20 }];
      var ev = [
        { type: 'click', rid: 1, ad: 10, t: 0.01 }, { type: 'conv', rid: 1, ad: 10, t: 30 },
        { type: 'click', rid: 2, ad: 10, t: 7 },                                        // outside 1h click window
        { type: 'click', rid: 3, ad: 12, t: 10.02 }, { type: 'conv', rid: 3, ad: 12, t: 300 }, // conv after nowT
        { type: 'conv', rid: 4, ad: 13, t: 21 }                                          // conv without click
      ];
      var out = fn(imps.map(clone), ev.map(clone), { clickWindowH: 1, convWindowH: 168, nowT: 200 }) || [];
      var lab = out.map(function (r) { return '' + r.click + r.conv; }).join(',');
      T.check('Returns one row per impression, in order', out.length === 5 && out[3] && out[3].rid === 3, '');
      T.check('Click + conversion inside windows → (1, 1)', out[0] && out[0].click === 1 && out[0].conv === 1, 'Got ' + (out[0] && ('' + out[0].click + out[0].conv)));
      T.check('No event → (0, 0)', out[1] && out[1].click === 0 && out[1].conv === 0, '');
      T.check('Click 2h after the impression is outside a 1h window → click = 0', out[2] && out[2].click === 0, '');
      T.check('Conversion that hasn\'t happened yet (t > nowT) doesn\'t count', out[3] && out[3].click === 1 && out[3].conv === 0, 'Got ' + (out[3] && ('' + out[3].click + out[3].conv)));
      T.check('Conversion without a click doesn\'t count', out[4] && out[4].conv === 0, 'All labels: ' + lab);
      T.check('Keeps the original impression fields', out[0] && out[0].t === 0 && out[0].ad === 10, '');
      T.check('Does not mutate the input rows', imps[0].click === undefined, 'The impressions you were given now have a click field — return copies instead.');
      // performance
      var big = [], bev = [];
      for (var i = 0; i < 30000; i++) { big.push({ rid: i, ad: i % 97, t: i / 100 }); if (i % 20 === 0) bev.push({ type: 'click', rid: i, ad: i % 97, t: i / 100 + 0.01 }); }
      var t0 = Date.now(); var o2 = fn(big, bev, { clickWindowH: 1, convWindowH: 168, nowT: 1e9 }) || []; var dt = Date.now() - t0;
      T.check('Joins 30,000 impressions in under a second', dt < 1000 && o2.length === 30000, 'Took ' + dt + ' ms. Use a Map instead of searching the events array for each impression.');
    }
  });

  slot({
    id: 'ipwCTR', chapter: 5, title: 'Inverse propensity weighting',
    starter: [
      '// Estimate an ad\'s position-independent CTR ("CTR if examined") from logs.',
      '//   rows:    [{ slot, click }]   every time the ad was shown, and in which slot',
      '//   examine: examine[s] = probability a user even looks at slot s',
      '// Naive CTR = clicks / impressions, which punishes ads that were shown low.',
      '// IPW: each click in slot s counts as 1 / examine[s] clicks.',
      'function ipwCTR(rows, examine) {',
      '  // TODO',
      '  return 0;',
      '}'
    ].join('\n'),
    reference: [
      'function ipwCTR(rows, examine) {',
      '  let weighted = 0;',
      '  for (const r of rows) if (r.click) weighted += 1 / examine[r.slot];',
      '  return rows.length ? weighted / rows.length : 0;',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var ex = [1, 0.5, 0.25];
      T.close('Two top-slot impressions, one click → 0.5', fn([{ slot: 0, click: 1 }, { slot: 0, click: 0 }], ex), 0.5, 1e-9);
      T.close('A click in slot 2 (examined 25%) counts 4×: 1 of 8 rows → 0.5', fn([{ slot: 2, click: 1 }].concat(new Array(7).fill(0).map(function () { return { slot: 2, click: 0 }; })), ex), 0.5, 1e-9);
      T.close('Empty input → 0', fn([], ex), 0, 1e-9);
      var r = World.Rand(3), rows = [];
      for (var i = 0; i < 20000; i++) { var s = r.int(3); rows.push({ slot: s, click: r.next() < 0.08 * ex[s] ? 1 : 0 }); }
      T.close('Recovers a true CTR of 8% from mixed-slot logs (±0.6pp)', fn(rows, ex), 0.08, 0.006);
    }
  });

  slot({
    id: 'smoothedCTR', chapter: 6, title: 'Smoothed counting feature',
    starter: [
      '// A counting feature: an ad\'s historical CTR — but an ad with 3 impressions',
      '// and 1 click does not really have a 33% CTR.',
      '// Shrink toward `prior` as if we had seen `strength` extra impressions at the',
      '// prior rate.',
      'function smoothedCTR(clicks, imps, prior, strength) {',
      '  // TODO',
      '  return imps ? clicks / imps : prior;',
      '}'
    ].join('\n'),
    reference: [
      'function smoothedCTR(clicks, imps, prior, strength) {',
      '  return (clicks + prior * strength) / (imps + strength);',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      T.close('No data → the prior', fn(0, 0, 0.03, 100), 0.03, 1e-9);
      T.close('1 click in 3 imps stays near the prior (strength 100)', fn(1, 3, 0.03, 100), (1 + 3) / 103, 1e-9);
      T.close('Lots of data → the observed CTR (500/10,000 with strength 100)', fn(500, 10000, 0.03, 100), (500 + 3) / 10100, 1e-9);
    }
  });

  slot({
    id: 'featurize', chapter: 6, title: 'The feature extractor',
    starter: [
      '// Turn (user, ad) into a list of feature STRINGS. The stack hashes each string',
      '// into a bucket of a weight table (the hashing trick), so any string works.',
      '//   user:  { id, age, country, device, hour, history }   (serve-time view)',
      '//   ad:    { id, advertiser, category }',
      '//   stats: { globalCTR, ad: { [adId]: { imps, clicks } } } — counts as of',
      '//          the START of the current day (never the future!)',
      '//   lib.smoothedCTR(clicks, imps, prior, strength) — your Ch. 6 function',
      '// The stack adds the slot feature itself; don\'t add one.',
      'function featurize(user, ad, stats, lib) {',
      '  const c = ad.category;',
      '  const f = [];',
      '  f.push("ad=" + ad.id, "cat=" + c);',
      '  // TODO: add crosses (age×cat, device×cat, hour×cat, ...), history features,',
      '  // and a bucketed smoothed-CTR counting feature.',
      '  return f;',
      '}'
    ].join('\n'),
    reference: [
      'function featurize(user, ad, stats, lib) {',
      '  const c = ad.category;',
      '  const f = [];',
      '  // identity features: memorize per-ad / per-advertiser / per-user effects',
      '  f.push("ad=" + ad.id, "adv=" + ad.advertiser, "cat=" + c, "user=" + user.id);',
      '  // crosses: effects that exist only for a COMBINATION of user and ad',
      '  f.push("age×cat=" + user.age + "_" + c, "dev×cat=" + user.device + "_" + c,',
      '         "hour×cat=" + user.hour + "_" + c, "country×cat=" + user.country + "_" + c);',
      '  // history: how much, and how recently, the user engaged with this category',
      '  const n = user.history.filter(x => x === c).length;',
      '  const recent = user.history.slice(0, 3).filter(x => x === c).length;',
      '  f.push("hist×cat=" + Math.min(n, 6) + "_" + c, "recent3=" + recent, "last=" + (user.history[0] === c));',
      '  // counting feature: the ad\'s smoothed CTR so far, bucketed on a log scale',
      '  const s = stats.ad[ad.id] || { imps: 0, clicks: 0 };',
      '  const ctr = lib.smoothedCTR(s.clicks, s.imps, stats.globalCTR, 200);',
      '  f.push("adCTR=" + Math.round(Math.log2(ctr) * 2));',
      '  return f;',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var w = world(), q = w.requestsForDay(2, 5, 3)[0], uv = userView(w, q), ad = w.ads[3];
      var stats = { globalCTR: 0.03, ad: {} }; stats.ad[3] = { imps: 1000, clicks: 40 };
      var lib = { smoothedCTR: impl('smoothedCTR') };
      var f = fn(uv, ad, stats, lib);
      T.check('Returns an array of strings', Array.isArray(f) && f.length > 0 && f.every(function (x) { return typeof x === 'string'; }), '');
      if (!Array.isArray(f)) return;
      T.check('Deterministic: same input → same features', JSON.stringify(f) === JSON.stringify(fn(uv, ad, stats, lib)), '');
      var f2 = fn(uv, w.ads[4], stats, lib), u2 = userView(w, w.requestsForDay(2, 5, 3)[1]), f3 = fn(u2, ad, stats, lib);
      T.check('Depends on the ad', JSON.stringify(f) !== JSON.stringify(f2), '');
      T.check('Depends on the user', JSON.stringify(f) !== JSON.stringify(f3), 'Two different users get identical features — the model can\'t personalize.');
      T.check('No position/slot feature (the stack adds it)', !f.some(function (x) { return /slot/i.test(x); }), '');
      T.info(f.length + ' features, e.g. ' + f.slice(0, 4).join(', '));
    }
  });

  slot({
    id: 'sgdStep', chapter: 7, title: 'One step of SGD for logistic regression',
    starter: [
      '// One stochastic-gradient step for logistic regression on hashed features.',
      '//   w:   Float64Array of weights (the whole hashed weight table)',
      '//   idx: the bucket indices of this example\'s features (every feature = 1)',
      '//   y:   the label, 0 or 1',
      '//   lr:  learning rate;  l2: L2 regularization strength',
      '// 1. z = sum of w[i] over idx       (the logit)',
      '// 2. p = sigmoid(z)                   (the predicted probability)',
      '// 3. the gradient of log loss w.r.t. z is (p - y)',
      '// 4. for each i in idx: w[i] -= lr * ((p - y) + l2 * w[i])',
      '// Return p (the prediction BEFORE the update).',
      'function sgdStep(w, idx, y, lr, l2) {',
      '  // TODO',
      '  return 0.5;',
      '}'
    ].join('\n'),
    reference: [
      'function sgdStep(w, idx, y, lr, l2) {',
      '  let z = 0;',
      '  for (const i of idx) z += w[i];',
      '  const p = 1 / (1 + Math.exp(-z));',
      '  const g = p - y;                       // d(logloss)/dz',
      '  for (const i of idx) w[i] -= lr * (g + l2 * w[i]);',
      '  return p;',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var w = new Float64Array(8); w[1] = 0.5; w[3] = -0.25;
      var p = fn(w, Int32Array.of(1, 3), 1, 0.1, 0);
      T.close('Returns sigmoid(0.5 − 0.25) before updating', p, sigmoid(0.25), 1e-9);
      T.close('Moves w[1] by lr × (y − p)', w[1], 0.5 + 0.1 * (1 - sigmoid(0.25)), 1e-9);
      T.close('Moves w[3] by the same amount', w[3], -0.25 + 0.1 * (1 - sigmoid(0.25)), 1e-9);
      T.close('Leaves other weights alone', w[2], 0, 1e-12);
      var w2 = new Float64Array(4); w2[0] = 2;
      fn(w2, Int32Array.of(0), 0, 0.1, 0.5);
      T.close('Applies L2: w -= lr·((p − y) + l2·w)', w2[0], 2 - 0.1 * (sigmoid(2) + 0.5 * 2), 1e-9);
      var r = World.Rand(1), w3 = new Float64Array(4);
      for (var i = 0; i < 20000; i++) { var x = r.int(2); fn(w3, Int32Array.of(x, 3), r.next() < (x ? 0.2 : 0.05) ? 1 : 0, 0.02, 0); }
      T.close('Learns P(y) = 5% for feature 0 (±1.5pp)', sigmoid(w3[0] + w3[3]), 0.05, 0.015);
      T.close('Learns P(y) = 20% for feature 1 (±3pp)', sigmoid(w3[1] + w3[3]), 0.2, 0.03);
    }
  });

  slot({
    id: 'lossGrad', chapter: 8, title: 'Losses and their gradients',
    starter: [
      '// Given a raw model output z and label y, return { loss, dz } where dz = d(loss)/dz.',
      '//   "logloss":  p = sigmoid(z);  loss = -(y log p + (1-y) log(1-p));  dz = p - y',
      '//   "mse":      p = sigmoid(z);  loss = (p - y)^2;   dz = 2 (p - y) · p (1 - p)',
      '//   "poisson":  rate = exp(z);   loss = rate - y z;  dz = rate - y',
      'function lossGrad(kind, z, y) {',
      '  if (kind === "logloss") {',
      '    const p = 1 / (1 + Math.exp(-z));',
      '    return { loss: -(y * Math.log(p) + (1 - y) * Math.log(1 - p)), dz: p - y };',
      '  }',
      '  // TODO: "mse" and "poisson"',
      '  return { loss: 0, dz: 0 };',
      '}'
    ].join('\n'),
    reference: [
      'function lossGrad(kind, z, y) {',
      '  if (kind === "logloss") {',
      '    const p = 1 / (1 + Math.exp(-z));',
      '    return { loss: -(y * Math.log(p) + (1 - y) * Math.log(1 - p)), dz: p - y };',
      '  }',
      '  if (kind === "mse") {',
      '    const p = 1 / (1 + Math.exp(-z));',
      '    return { loss: (p - y) ** 2, dz: 2 * (p - y) * p * (1 - p) };',
      '  }',
      '  if (kind === "poisson") {',
      '    const rate = Math.exp(z);',
      '    return { loss: rate - y * z, dz: rate - y };',
      '  }',
      '  throw new Error("unknown loss " + kind);',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      ['logloss', 'mse', 'poisson'].forEach(function (k) {
        [[0.3, 1], [-2, 0], [-4, 1], [1.2, 0]].forEach(function (c) {
          var z = c[0], y = c[1], r = fn(k, z, y) || {};
          var num = ((fn(k, z + 1e-5, y) || {}).loss - (fn(k, z - 1e-5, y) || {}).loss) / 2e-5;
          if (!(Math.abs(r.dz - num) < 1e-4 * Math.max(1, Math.abs(num)))) { T.check(k + ': dz matches the numerical derivative', false, 'At z=' + z + ', y=' + y + ': your dz = ' + r.dz + ', numerical = ' + num.toFixed(6)); throw 'stop'; }
        });
        T.check(k + ': dz matches the numerical derivative of loss', true, '');
      });
      T.close('mse loss at z=0, y=1 is 0.25', (fn('mse', 0, 1) || {}).loss, 0.25, 1e-9);
      T.close('poisson loss at z=0, y=2 is 1', (fn('poisson', 0, 2) || {}).loss, 1, 1e-9);
    }
  });

  slot({
    id: 'auc', chapter: 9, title: 'AUC',
    starter: [
      '// AUC = probability that a randomly chosen positive is scored above a',
      '// randomly chosen negative (ties count half).',
      '// The O(n²) version is fine to start with — but real eval sets have',
      '// 50k rows. The fast way: sort by score and sum the ranks of the positives:',
      '//   AUC = (sum of positive ranks − nPos(nPos+1)/2) / (nPos · nNeg)',
      'function auc(preds, labels) {',
      '  // TODO',
      '  return 0.5;',
      '}'
    ].join('\n'),
    reference: [
      'function auc(preds, labels) {',
      '  const idx = preds.map((_, i) => i).sort((a, b) => preds[a] - preds[b]);',
      '  let rankSum = 0, nPos = 0;',
      '  for (let i = 0; i < idx.length; ) {',
      '    let j = i;',
      '    while (j + 1 < idx.length && preds[idx[j + 1]] === preds[idx[i]]) j++;',
      '    const avgRank = (i + j) / 2 + 1;              // tied scores share a rank',
      '    for (let k = i; k <= j; k++) if (labels[idx[k]]) { rankSum += avgRank; nPos++; }',
      '    i = j + 1;',
      '  }',
      '  const nNeg = labels.length - nPos;',
      '  return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      T.close('Perfect ranking → 1', fn([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1, 1e-9);
      T.close('Perfectly wrong → 0', fn([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]), 0, 1e-9);
      T.close('All scores tied → 0.5', fn([0.3, 0.3, 0.3, 0.3], [0, 1, 0, 1]), 0.5, 1e-9);
      T.close('Small example: 3 of 4 pairs correct → 0.75', fn([0.2, 0.4, 0.3, 0.9], [0, 0, 1, 1]), 0.75, 1e-9);
      var r = World.Rand(2), p = [], l = [];
      for (var i = 0; i < 40000; i++) { p.push(r.next()); l.push(r.next() < p[i] * 0.2 ? 1 : 0); }
      var t0 = Date.now(), a = fn(p, l), dt = Date.now() - t0;
      T.close('Matches the reference on 40k rows', a, aucRef(p, l), 1e-6);
      T.check('Runs on 40k rows in under 1.5 s', dt < 1500, 'Took ' + dt + ' ms — use the sort-and-rank method.');
    }
  });

  slot({
    id: 'normalizedEntropy', chapter: 9, title: 'Normalized entropy',
    starter: [
      '// NE = (average log loss of your predictions)',
      '//      / (log loss of always predicting the base rate)',
      '// base rate = mean(labels). Entropy of a rate b: -(b log b + (1-b) log(1-b)).',
      '// Clip predictions to [1e-7, 1 - 1e-7] before taking logs.',
      '// NE < 1 means you beat "just predict the average". Lower is better.',
      'function normalizedEntropy(preds, labels) {',
      '  // TODO',
      '  return 1;',
      '}'
    ].join('\n'),
    reference: [
      'function normalizedEntropy(preds, labels) {',
      '  const n = preds.length;',
      '  let ll = 0, pos = 0;',
      '  for (let i = 0; i < n; i++) {',
      '    const p = Math.min(Math.max(preds[i], 1e-7), 1 - 1e-7);',
      '    ll -= labels[i] ? Math.log(p) : Math.log(1 - p);',
      '    pos += labels[i];',
      '  }',
      '  const b = pos / n;',
      '  const baseline = -(b * Math.log(b) + (1 - b) * Math.log(1 - b));',
      '  return (ll / n) / baseline;',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      T.close('Predicting the base rate → exactly 1', fn([0.25, 0.25, 0.25, 0.25], [1, 0, 0, 0]), 1, 1e-9);
      var r = World.Rand(4), p = [], l = [];
      for (var i = 0; i < 5000; i++) { p.push(sigmoid(r.normal(-3, 1))); l.push(r.next() < p[i] ? 1 : 0); }
      T.close('Matches the reference on random data', fn(p, l), neRef(p, l), 1e-9);
      T.check('Survives a prediction of exactly 0 or 1', isFinite(fn([0, 1, 0.5], [1, 0, 1])), '');
    }
  });

  slot({
    id: 'topK', chapter: 10, title: 'Top-K retrieval by dot product',
    starter: [
      '// The retrieval step of a two-tower model.',
      '//   userVec: the user tower\'s embedding (array of numbers)',
      '//   ads:     [{ id, vec }] — each ad tower embedding',
      '//   k:       how many to return',
      '// Return the ids of the k ads with the largest dot(userVec, ad.vec),',
      '// best first.',
      'function topK(userVec, ads, k) {',
      '  // TODO',
      '  return ads.slice(0, k).map(a => a.id);',
      '}'
    ].join('\n'),
    reference: [
      'function topK(userVec, ads, k) {',
      '  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);',
      '  return ads',
      '    .map(a => ({ id: a.id, score: dot(userVec, a.vec) }))',
      '    .sort((a, b) => b.score - a.score)',
      '    .slice(0, k)',
      '    .map(a => a.id);',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var ads = [{ id: 'a', vec: [1, 0] }, { id: 'b', vec: [0, 1] }, { id: 'c', vec: [0.7, 0.7] }, { id: 'd', vec: [-1, 0] }];
      T.check('Returns the best 2 for user [1, 0.2], best first', JSON.stringify(fn([1, 0.2], ads, 2)) === '["a","c"]', 'Got ' + JSON.stringify(fn([1, 0.2], ads, 2)));
      T.check('k larger than the corpus returns everything', (fn([1, 0], ads, 10) || []).length === 4, '');
      T.check('Uses the dot product, not cosine (magnitude matters)', (fn([1, 0], [{ id: 'x', vec: [0.5, 0] }, { id: 'y', vec: [2, 2] }], 1) || [])[0] === 'y', '');
    }
  });

  slot({
    id: 'attentionWeights', chapter: 11, title: 'Target attention',
    starter: [
      '// Target attention over a user\'s history (as in DIN).',
      '//   hist:  array of history item embeddings (arrays of length d)',
      '//   query: the candidate ad\'s embedding (length d)',
      '// score_i = dot(hist[i], query) / sqrt(d)',
      '// weights = softmax(scores)  — subtract the max score before exp() for stability',
      '// Return the weights (they sum to 1).',
      'function attentionWeights(hist, query) {',
      '  // TODO',
      '  return hist.map(() => 1 / hist.length);',
      '}'
    ].join('\n'),
    reference: [
      'function attentionWeights(hist, query) {',
      '  const d = query.length;',
      '  const scores = hist.map(h => h.reduce((s, x, i) => s + x * query[i], 0) / Math.sqrt(d));',
      '  const mx = Math.max(...scores);',
      '  const e = scores.map(s => Math.exp(s - mx));',
      '  const z = e.reduce((a, b) => a + b, 0);',
      '  return e.map(x => x / z);',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      var w = fn([[1, 0], [0, 1]], [2, 0]) || [];
      var e = Math.exp(2 / Math.SQRT2);
      T.close('Matching item gets e^(2/√2)/(e^(2/√2)+1)', w[0], e / (e + 1), 1e-9);
      T.close('Weights sum to 1', (w[0] || 0) + (w[1] || 0), 1, 1e-9);
      var big = fn([[100, 0], [0, 100]], [100, 0]) || [];
      T.check('Numerically stable for large scores', isFinite(big[0]) && Math.abs(big[0] - 1) < 1e-9, 'Got ' + JSON.stringify(big) + ' — subtract the max before exp().');
    }
  });

  slot({
    id: 'observedFraction', chapter: 12, title: 'Delayed-feedback correction',
    starter: [
      '// Conversions arrive with a delay. If delays are exponential with mean',
      '// meanDelayH hours, what fraction of the conversions that WILL happen have',
      '// already been observed, elapsedH hours after the click?',
      '// (Return 0 if elapsedH <= 0.)',
      'function observedFraction(elapsedH, meanDelayH) {',
      '  // TODO',
      '  return 1;',
      '}'
    ].join('\n'),
    reference: [
      'function observedFraction(elapsedH, meanDelayH) {',
      '  if (elapsedH <= 0) return 0;',
      '  return 1 - Math.exp(-elapsedH / meanDelayH);   // exponential CDF',
      '}'
    ].join('\n'),
    tests: function (fn, T) {
      T.close('At t = 0 nothing is observed', fn(0, 24), 0, 1e-9);
      T.close('After one mean delay, 1 − 1/e ≈ 63%', fn(24, 24), 1 - Math.exp(-1), 1e-9);
      T.close('After a long time, almost everything', fn(1000, 24), 1, 1e-6);
      T.close('Finance (mean 120h), 2 days after click', fn(48, 120), 1 - Math.exp(-0.4), 1e-9);
    }
  });

  /* ---------- compile & test ---------- */
  var FN_NAME = {};
  Object.keys(SLOTS).forEach(function (id) { FN_NAME[id] = id; });
  function compile(id, src) {
    var f = new Function('"use strict";\n' + src + '\n;return (typeof ' + FN_NAME[id] + ' === "function") ? ' + FN_NAME[id] + ' : null;');
    var fn = f();
    if (!fn) throw new Error('Define a function named ' + FN_NAME[id] + '(…)');
    return fn;
  }
  function runTests(id, src) {
    var results = [], def = SLOTS[id], fn;
    var T = {
      check: function (name, ok, detail) { results.push({ name: name, pass: !!ok, detail: ok ? '' : (detail || '') }); },
      close: function (name, got, want, tol) {
        var ok = typeof got === 'number' && Math.abs(got - want) <= tol;
        results.push({ name: name, pass: ok, detail: ok ? '' : 'Expected ' + fmtNum(want) + ', got ' + (typeof got === 'number' ? fmtNum(got) : String(got)) });
      },
      info: function (msg) { results.push({ name: msg, info: true }); }
    };
    try { fn = compile(id, src); }
    catch (e) { return { ok: false, results: [{ name: 'Your code compiles', pass: false, detail: String(e && e.message || e) }] }; }
    try { def.tests(fn, T); }
    catch (e) { if (e !== 'stop') results.push({ name: 'Runs without throwing', pass: false, detail: String(e && e.message || e) }); }
    var ok = results.length > 0 && results.every(function (r) { return r.info || r.pass; });
    return { ok: ok, results: results };
  }
  function fmtNum(x) { return Math.abs(x) >= 1e-3 || x === 0 ? (+x.toFixed(6)).toString() : x.toExponential(3); }

  var _implCache = {};
  // The function the stack actually uses for a slot: the reader's code if it has
  // passed its tests, otherwise the reference implementation.
  function impl(id) {
    var c = state.code[id], src = c && c.passed ? c.src : SLOTS[id].reference;
    var key = id + '|' + src;
    if (_implCache[key]) return _implCache[key];
    var fn;
    try { fn = compile(id, src); } catch (e) { fn = compile(id, SLOTS[id].reference); }
    _implCache[key] = fn;
    return fn;
  }
  function implSource(id) { var c = state.code[id]; return c && c.passed ? 'you' : 'reference'; }
  function saveCode(id, src, passed) {
    state.code[id] = { src: src, passed: !!passed };
    save();
  }

  /* ================================================================== *
   * Models
   * ================================================================== */
  function lib() { return { smoothedCTR: impl('smoothedCTR') }; }

  // --- Heuristic ranker (Ch. 1) ---
  function heuristicRanker() {
    var f = impl('heuristicPCTR'), pr = prior(), w = world();
    return { name: 'heuristic', predict: function (req, uv, adIds) { return adIds.map(function (a) { return clamp(+f(w.ads[a], uv, pr) || 0, 0, 1); }); } };
  }
  function oracleRanker() {
    var w = world();
    return { name: 'oracle', predict: function (req, uv, adIds) { return adIds.map(function (a) { return w.truth.relevance(req.user, a, req); }); } };
  }

  // --- Hashed logistic regression (Ch. 6–8) ---
  function lrPredictZ(wts, idx, slotIdx) {
    var z = 0; for (var i = 0; i < idx.length; i++) z += wts[idx[i]];
    return z + (slotIdx != null ? wts[slotIdx] : 0);
  }
  function lrOutput(model, z) {
    if (model.loss === 'poisson') return clamp(Math.exp(z), 0, 0.99);
    return sigmoid(z);
  }
  function slotBucket(slotNum, bits) { return fnv1a('slot=' + slotNum) & ((1 << bits) - 1); }
  function lrRanker(model) {
    var w = world(), feat = impl('featurize'), L = lib(), s0 = slotBucket(0, model.bits);
    return {
      name: 'lr',
      predict: function (req, uv, adIds, stats) {
        return adIds.map(function (a) {
          var idx = hashFeatures(feat(uv, w.ads[a], stats, L), model.bits);
          return lrOutput(model, lrPredictZ(model.w, idx, s0));
        });
      }
    };
  }

  // Build feature/label arrays for LR training from joined rows.
  function lrDataset(rows, bits) {
    return rows.map(function (r) {
      var idx = hashFeatures(r.feats, bits), s = slotBucket(r.slot, bits);
      var full = new Int32Array(idx.length + 1); full.set(idx); full[idx.length] = s;
      return full;
    });
  }

  async function trainLR(opts) {
    var rows = opts.rows, bits = opts.bits || state.settings.hashBits, epochs = opts.epochs || 1;
    var lr = opts.lr == null ? 0.05 : opts.lr, l2 = opts.l2 == null ? 1e-6 : opts.l2, loss = opts.loss || 'logloss';
    var X = lrDataset(rows, bits), Y = rows.map(function (r) { return opts.label ? r[opts.label] : r.click; });
    var w = opts.init ? Float64Array.from(opts.init) : new Float64Array(1 << bits);
    var step = impl('sgdStep'), lg = impl('lossGrad');
    var order = rows.map(function (_, i) { return i; });
    var r = World.Rand(opts.seed || 11), curve = [], run = 0, runN = 0, seen = 0, total = epochs * rows.length;
    // pairwise: group by request
    var groups = null;
    if (loss === 'pairwise') {
      var byReq = new Map();
      rows.forEach(function (row, i) { if (!byReq.has(row.rid)) byReq.set(row.rid, []); byReq.get(row.rid).push(i); });
      groups = [];
      byReq.forEach(function (g) { var pos = g.filter(function (i) { return Y[i]; }), neg = g.filter(function (i) { return !Y[i]; }); if (pos.length && neg.length) groups.push({ pos: pos, neg: neg }); });
    }
    for (var e = 0; e < epochs; e++) {
      if (loss === 'pairwise') {
        r.shuffle(groups);
        for (var gi = 0; gi < groups.length; gi++) {
          var g = groups[gi];
          for (var a = 0; a < g.pos.length; a++) for (var b = 0; b < g.neg.length; b++) {
            var ip = X[g.pos[a]], ineg = X[g.neg[b]];
            var d = lrPredictZ(w, ip) - lrPredictZ(w, ineg);
            var sg = 1 / (1 + Math.exp(d)); // -dloss/dd
            var k;
            for (k = 0; k < ip.length; k++) w[ip[k]] += lr * (sg - l2 * w[ip[k]]);
            for (k = 0; k < ineg.length; k++) w[ineg[k]] -= lr * (sg + l2 * w[ineg[k]]);
            run += Math.log(1 + Math.exp(-d)); runN++;
          }
          seen += g.pos.length + g.neg.length;
          if (gi % 300 === 0) { curve.push({ x: e + gi / groups.length, loss: run / Math.max(1, runN) }); run = 0; runN = 0; if (opts.onProgress) opts.onProgress(Math.min(1, (e + gi / groups.length) / epochs), curve); await tick(); }
        }
        continue;
      }
      r.shuffle(order);
      for (var i = 0; i < order.length; i++) {
        var j = order[i], y = Y[j], p;
        // Learning-rate schedule: decay linearly to 20% by the end of training.
        var lrNow = opts.decay === false ? lr : lr * (1 - 0.8 * seen / total);
        if (loss === 'logloss') {
          p = step(w, X[j], y, lrNow, l2);
          run += -(y ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9)));
        } else {
          var z = lrPredictZ(w, X[j]), res = lg(loss, z, y), idx = X[j];
          for (var q = 0; q < idx.length; q++) w[idx[q]] -= lrNow * (res.dz + l2 * w[idx[q]]);
          run += res.loss;
        }
        runN++; seen++;
        if (seen % 2000 === 0) {
          curve.push({ x: e + i / order.length, loss: run / runN }); run = 0; runN = 0;
          if (opts.onProgress) opts.onProgress(seen / total, curve);
          await tick();
        }
      }
      if (opts.onEpoch) await opts.onEpoch(e + 1, { kind: 'lr', bits: bits, loss: loss, w: w });
    }
    if (opts.onProgress) opts.onProgress(1, curve);
    return { kind: 'lr', bits: bits, loss: loss, w: w, curve: curve, n: rows.length };
  }
  function lrPredictRows(model, rows, slotOverride) {
    var bits = model.bits;
    return rows.map(function (r) {
      var idx = hashFeatures(r.feats, bits);
      var s = slotBucket(slotOverride != null ? slotOverride : r.slot, bits);
      return lrOutput(model, lrPredictZ(model.w, idx, s));
    });
  }
  function serializeLR(m) { return { kind: 'lr', bits: m.bits, loss: m.loss, w: NN.toB64(m.w), meta: m.meta || {} }; }
  function deserializeLR(s) { return { kind: 'lr', bits: s.bits, loss: s.loss, w: NN.fromB64(s.w), meta: s.meta || {} }; }

  /* ---------- two-tower retrieval (Ch. 10) ----------
   * User tower: mean(history category embeddings) + mean(3 most recent) + age (+ user id).
   * Ad tower:   ad id + category + advertiser embeddings, plus a scalar ad bias.
   * Score = dot(user, ad), made compatible with pure dot-product ANN by appending
   * a constant 1 to the user vector and the ad bias to the ad vector. */
  var TT_D = 16;
  function twoTowerParams(rng, cfg) {
    var w = world();
    return {
      cU: NN.embedding('cU', 12, TT_D, rng, 0.1), cR: NN.embedding('cR', 12, TT_D, rng, 0.1), age: NN.embedding('age', 4, TT_D, rng, 0.05),
      uEmb: NN.embedding('uEmb', w.users.length, TT_D, rng, 0.01),
      aEmb: NN.embedding('aEmb', w.ads.length, TT_D, rng, 0.01), cA: NN.embedding('cA', 12, TT_D, rng, 0.1),
      advE: NN.embedding('advE', w.advertisers.length, TT_D, rng, 0.01), aB: NN.embedding('aB', w.ads.length, 1, null),
      gB: NN.bias('gB', 1, -3.3)
    };
  }
  function ttUser(g, P, uv, cfg) {
    var parts = [g.mean(uv.history.map(function (c) { return g.emb(P.cU, c); })),
      g.mean(uv.history.slice(0, 3).map(function (c) { return g.emb(P.cR, c); })), g.emb(P.age, uv.age)];
    if (cfg && cfg.userId) parts.push(g.emb(P.uEmb, uv.id));
    return g.concat([g.addAll(parts), g.const([1])]);
  }
  function ttAd(g, P, ad) {
    return g.concat([g.addAll([g.emb(P.aEmb, ad.id), g.emb(P.cA, ad.category), g.emb(P.advE, ad.advertiser)]), g.emb(P.aB, ad.id)]);
  }
  function paramList(P) { return Object.keys(P).map(function (k) { return P[k]; }); }

  /* trainTwoTower({ rows, objective: 'softmax'|'bce', negatives, epochs, lr, userId })
   *  softmax: for each CLICKED row, a softmax over the clicked ad and `negatives`
   *           ads sampled from everything the user was eligible for (sampled softmax).
   *  bce:     every impression is an example (clicked = 1, shown-not-clicked = 0),
   *           plus `negatives` random eligible ads per impression as extra 0s. */
  async function trainTwoTower(opts) {
    var w = world(), cfg = { userId: !!opts.userId }, obj = opts.objective || 'softmax', negs = opts.negatives == null ? 20 : opts.negatives;
    var P = twoTowerParams(World.Rand(opts.seed || 5), cfg), params = paramList(P), opt = NN.adam({ lr: opts.lr || 0.02 });
    var data = obj === 'softmax' ? opts.rows.filter(function (r) { return r.click; }) : opts.rows;
    var r = World.Rand(17), order = data.map(function (_, i) { return i; }), curve = [], run = 0, runN = 0, epochs = opts.epochs || 3, B = 32, inBatch = 0;
    var eligCache = new Map();
    function elig(uv) { var k = uv.id * 1000 + uv.day, e = eligCache.get(k); if (!e) { e = w.eligibleAds(uv.id, uv.day); eligCache.set(k, e); } return e; }
    var total = epochs * data.length, seen = 0;
    for (var e = 0; e < epochs; e++) {
      r.shuffle(order);
      for (var i = 0; i < order.length; i++) {
        var row = data[order[i]], g = NN.graph(), u = ttUser(g, P, row.uv, cfg), el = elig(row.uv), L, k;
        if (obj === 'softmax') {
          var logits = [g.dot(u, ttAd(g, P, w.ads[row.ad]))];
          for (k = 0; k < negs; k++) logits.push(g.dot(u, ttAd(g, P, w.ads[el[Math.floor(r.next() * el.length)]])));
          L = g.softmaxCE(g.concat(logits), 0);
        } else {
          var gb = g.vec(P.gB), ls = [g.bceLogit(g.add(g.dot(u, ttAd(g, P, w.ads[row.ad])), gb), row.click)];
          for (k = 0; k < negs; k++) ls.push(g.bceLogit(g.add(g.dot(u, ttAd(g, P, w.ads[el[Math.floor(r.next() * el.length)]])), gb), 0));
          L = g.addAll(ls);
        }
        g.backward(L); run += L.data[0]; runN++; inBatch++; seen++;
        if (inBatch === B) { opt.step(params, 1 / B); inBatch = 0; }
        if (seen % 1000 === 0) {
          curve.push({ x: seen / data.length, loss: run / runN }); run = 0; runN = 0;
          if (opts.onProgress) opts.onProgress(seen / total, curve);
          await tick();
        }
      }
    }
    if (inBatch) opt.step(params, 1 / inBatch);
    if (opts.onProgress) opts.onProgress(1, curve);
    return makeTwoTower(P, { objective: obj, negatives: negs, n: data.length, userId: cfg.userId });
  }
  function makeTwoTower(P, meta) {
    var w = world(), adVecCache = null, cfg = { userId: !!(meta && meta.userId) };
    return {
      kind: 'twotower', P: P, meta: meta || {},
      userVec: function (uv) { return Array.from(ttUser(NN.graph(), P, uv, cfg).data); },
      adVecs: function () {
        if (!adVecCache) adVecCache = w.ads.map(function (ad) { return Array.from(ttAd(NN.graph(), P, ad).data); });
        return adVecCache;
      }
    };
  }
  // Recall@K against the TRUE top-10 (by relevance, or by expected eCPM) on held-out requests.
  function retrievalRecall(scoreFn, o) {
    o = o || {};
    var w = world(), K = o.k || 30, day = o.day == null ? 10 : o.day, n = o.n || 300, target = o.target || 'relevance', tot = 0, cnt = 0;
    w.requestsForDay(day, n, 1).forEach(function (q) {
      var uv = userView(w, q), el = w.eligibleAds(q.user, day);
      var truthScore = function (a) { var rel = w.truth.relevance(q.user, a, q); return target === 'ecpm' ? rel * w.ads[a].cpcBid : rel; };
      var top10 = el.map(function (a) { return [a, truthScore(a)]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 10).map(function (x) { return x[0]; });
      var got = scoreFn(uv, el, K, q);
      var set = new Set(got);
      tot += top10.filter(function (a) { return set.has(a); }).length / 10; cnt++;
    });
    return tot / cnt;
  }
  // "What if you had unbiased data?" — clicks sampled in proportion to the TRUE relevance
  // over everything eligible. Only a simulator can produce this; it shows the ceiling.
  function unbiasedClicks(n, days) {
    var w = world(), out = [], r = World.Rand(9), per = Math.ceil(n / days.length);
    days.forEach(function (d) {
      w.requestsForDay(d, per, 5).forEach(function (q) {
        var uv = userView(w, q), el = w.eligibleAds(q.user, d);
        var ps = el.map(function (a) { return w.truth.relevance(q.user, a, q); }), s = sum(ps), x = r.next() * s, k = 0;
        while (k < el.length - 1 && x > ps[k]) { x -= ps[k]; k++; }
        out.push({ uv: uv, ad: el[k], slot: 0, click: 1 });
      });
    });
    return out;
  }
  function serializeNN(m) { return { kind: m.kind, meta: m.meta, params: NN.serialize(paramList(m.P)) }; }

  /* ---------- deep ranker: embeddings + cross layer + target attention (Ch. 11) ---------- */
  var DR_D = 8;
  function deepParams(rng, cfg) {
    var w = world(), nIn = DR_D * 9;
    var P = {
      uEmb: NN.embedding('uEmb', w.users.length, DR_D, rng, 0.05), aEmb: NN.embedding('aEmb', w.ads.length, DR_D, rng, 0.05),
      advEmb: NN.embedding('advEmb', w.advertisers.length, DR_D, rng, 0.05), catEmb: NN.embedding('catEmb', 12, DR_D, rng, 0.3),
      ageEmb: NN.embedding('ageEmb', 4, DR_D, rng, 0.1), ctyEmb: NN.embedding('ctyEmb', 3, DR_D, rng, 0.1),
      devEmb: NN.embedding('devEmb', 2, DR_D, rng, 0.1), hrEmb: NN.embedding('hrEmb', 6, DR_D, rng, 0.1),
      recEmb: NN.embedding('recEmb', 12, DR_D, rng, 0.05),
      W1: NN.param('W1', 32, nIn, rng), b1: NN.bias('b1', 32), W2: NN.param('W2', 1, 32, rng), b2: NN.bias('b2', 1, -3.3),
      slotB: NN.embedding('slotB', 3, 1, null), attnT: NN.bias('attnT', 1, 3)
    };
    if (cfg.wide) P.wide = NN.embedding('wide', 1 << state.settings.hashBits, 1, null);
    for (var l = 0; l < (cfg.cross || 0); l++) {
      // Low-rank DCN-v2 cross: W = U·V with rank 8
      P['cV' + l] = NN.param('cV' + l, 8, nIn, rng, 0.05); P['cU' + l] = NN.param('cU' + l, nIn, 8, rng, 0.05); P['cb' + l] = NN.bias('cb' + l, nIn);
    }
    return P;
  }
  // Wide & Deep: the deep network's logit plus a linear "wide" part over the hashed
  // engineered features (the same ones your logistic regression uses).
  function deepForward(g, P, cfg, uv, ad, wideIdx) {
    var q = g.emb(P.catEmb, ad.category), hist = uv.history.map(function (c, i) { return g.add(g.emb(P.catEmb, c), g.emb(P.recEmb, i)); });
    var att = cfg.attention ? g.attend(hist, q, g.vec(P.attnT)) : { out: g.mean(hist), weights: null };
    var zeroId = cfg.noIds ? g.const(new Float64Array(DR_D)) : null;
    var x0 = g.concat([cfg.noIds ? zeroId : g.emb(P.uEmb, uv.id), cfg.noIds ? zeroId : g.emb(P.aEmb, ad.id), g.emb(P.advEmb, ad.advertiser), q,
      g.emb(P.ageEmb, uv.age), g.emb(P.ctyEmb, uv.country), g.emb(P.devEmb, uv.device), g.emb(P.hrEmb, Math.floor(uv.hour / 4)), att.out]);
    var x = x0;
    for (var l = 0; l < (cfg.cross || 0); l++) {
      var proj = g.matvec(P['cU' + l], g.matvec(P['cV' + l], x));
      x = g.add(g.mul(x0, g.add(proj, g.vec(P['cb' + l]))), x);
    }
    var h = g.dense(x, P.W1, P.b1, 'relu');
    var z = g.dense(h, P.W2, P.b2);
    if (cfg.wide && wideIdx) z = g.addAll([z].concat(Array.prototype.map.call(wideIdx, function (i) { return g.emb(P.wide, i); })));
    return { z: z, attn: att.weights };
  }
  async function trainDeep(opts) {
    var w = world(), cfg = { cross: opts.cross == null ? 1 : opts.cross, attention: opts.attention !== false, wide: !!opts.wide, noIds: !!opts.noIds };
    var P = deepParams(World.Rand(opts.seed || 21), cfg), params = paramList(P), opt = NN.adam({ lr: opts.lr || 0.004, l2: opts.l2 || 0 });
    var rows = opts.rows, r = World.Rand(23), order = rows.map(function (_, i) { return i; }), curve = [], run = 0, runN = 0, epochs = opts.epochs || 1, B = 32, inBatch = 0;
    for (var e = 0; e < epochs; e++) {
      r.shuffle(order);
      for (var i = 0; i < order.length; i++) {
        var row = rows[order[i]], g = NN.graph();
        var out = deepForward(g, P, cfg, row.uv, w.ads[row.ad], cfg.wide ? hashFeatures(row.feats, state.settings.hashBits) : null);
        var L = g.bceLogit(g.add(out.z, g.emb(P.slotB, row.slot)), row.click);
        g.backward(L); run += L.data[0]; runN++; inBatch++;
        if (inBatch === B) { opt.step(params, 1 / B); inBatch = 0; }
        if ((i + 1) % 1500 === 0) {
          curve.push({ x: e + i / order.length, loss: run / runN }); run = 0; runN = 0;
          if (opts.onProgress) opts.onProgress((e + i / order.length) / epochs, curve);
          await tick();
        }
      }
    }
    if (inBatch) opt.step(params, 1 / inBatch);
    if (opts.onProgress) opts.onProgress(1, curve);
    return makeDeep(P, cfg, { n: rows.length });
  }
  function makeDeep(P, cfg, meta) {
    var w = world();
    var m = {
      kind: 'deep', P: P, cfg: cfg, meta: Object.assign({}, meta, cfg),
      // stats: counters for the wide part's counting features (serve-time); feats: precomputed strings
      pctr: function (uv, adId, stats, feats) {
        var idx = null;
        if (cfg.wide) idx = hashFeatures(feats || impl('featurize')(uv, w.ads[adId], stats || { globalCTR: prior().globalCTR, ad: {} }, lib()), state.settings.hashBits);
        return sigmoid(deepForward(NN.graph(), P, cfg, uv, w.ads[adId], idx).z.data[0] + P.slotB.data[0]);
      },
      attention: function (uv, adId) { var o = deepForward(NN.graph(), P, cfg, uv, w.ads[adId], null); return o.attn ? Array.from(o.attn.data) : null; }
    };
    return m;
  }

  /* ---------- conversion models (Ch. 12) ---------- */
  // Naive pCVR: logistic regression on CLICKED impressions only.
  // ESMM: two LR heads over ALL impressions; loss = BCE(pCTR, click) + BCE(pCTR·pCVR, conv).
  async function trainCVR(opts) {
    var rows = opts.rows, bits = opts.bits || state.settings.hashBits, esmm = opts.method === 'esmm', lr = opts.lr || 0.05;
    var wa = new Float64Array(1 << bits), wb = new Float64Array(1 << bits), l2 = 1e-6;
    var data = rows.filter(function (r) { return esmm || r.click; });
    // pCVR doesn't depend on the ad slot, so instead of a slot feature it gets a plain bias.
    var X = data.map(function (row) { return hashFeatures(row.feats.concat(['bias']), bits); }), r = World.Rand(29), order = data.map(function (_, i) { return i; }), epochs = opts.epochs || 2;
    for (var e = 0; e < epochs; e++) {
      r.shuffle(order);
      for (var i = 0; i < order.length; i++) {
        var j = order[i], row = data[j], idx = X[j], k;
        var wt = row.weight == null ? 1 : row.weight;
        if (!esmm) {
          var zb = lrPredictZ(wb, idx), pb = sigmoid(zb), gb = (pb - row.conv) * wt;
          for (k = 0; k < idx.length; k++) wb[idx[k]] -= lr * (gb + l2 * wb[idx[k]]);
        } else {
          var sa = sigmoid(lrPredictZ(wa, idx)), sb = sigmoid(lrPredictZ(wb, idx)), qv = clamp(sa * sb, 1e-7, 1 - 1e-7);
          var dq = ((qv - row.conv) / (qv * (1 - qv))) * wt;   // dBCE/dq
          var ga = (sa - row.click) + dq * sb * sa * (1 - sa);
          var gbb = dq * sa * sb * (1 - sb);
          for (k = 0; k < idx.length; k++) { wa[idx[k]] -= lr * (ga + l2 * wa[idx[k]]); wb[idx[k]] -= lr * (gbb + l2 * wb[idx[k]]); }
        }
        if (i % 3000 === 0) { if (opts.onProgress) opts.onProgress((e + i / order.length) / epochs); await tick(); }
      }
    }
    if (opts.onProgress) opts.onProgress(1);
    return { kind: esmm ? 'esmm' : 'cvr-naive', bits: bits, wa: wa, wb: wb };
  }
  function cvrPredictRows(model, rows) {
    return rows.map(function (r) { var idx = hashFeatures(r.feats.concat(['bias']), model.bits); return sigmoid(lrPredictZ(model.wb, idx)); });
  }

  /* ================================================================== *
   * Models registry (persisted)
   * ================================================================== */
  var _live = {};
  function putModel(name, model, meta) {
    model.meta = Object.assign({}, model.meta || {}, meta || {});
    _live[name] = model;
    var s;
    if (model.kind === 'lr') s = serializeLR(model);
    else if (model.kind === 'twotower' || model.kind === 'deep') s = serializeNN(model);
    else if (model.kind === 'esmm' || model.kind === 'cvr-naive') s = { kind: model.kind, bits: model.bits, wa: NN.toB64(model.wa), wb: NN.toB64(model.wb), meta: model.meta };
    if (model.kind === 'deep') s.cfg = model.cfg;
    state.models[name] = s;
    state.modelsReset = false;
    save();
  }
  function getModel(name) {
    if (_live[name]) return _live[name];
    var s = state.models[name];
    if (!s) return null;
    var m;
    if (s.kind === 'lr') m = deserializeLR(s);
    else if (s.kind === 'twotower') { var P = twoTowerParams(World.Rand(1)); NN.restore(paramList(P), s.params); m = makeTwoTower(P, s.meta); }
    else if (s.kind === 'deep') { var Pd = deepParams(World.Rand(1), s.cfg); NN.restore(paramList(Pd), s.params); m = makeDeep(Pd, s.cfg, s.meta); }
    else if (s.kind === 'esmm' || s.kind === 'cvr-naive') m = { kind: s.kind, bits: s.bits, wa: NN.fromB64(s.wa), wb: NN.fromB64(s.wb), meta: s.meta };
    if (m) { m.meta = s.meta || m.meta || {}; _live[name] = m; }
    return m;
  }
  function hasModel(name) { return !!state.models[name]; }
  // Snapshot / restore saved models (used by experiments that temporarily install their own).
  function snapshotModels(names) { var o = {}; names.forEach(function (n) { o[n] = state.models[n] || null; }); return o; }
  function restoreModels(snap) {
    Object.keys(snap).forEach(function (n) { delete _live[n]; if (snap[n]) state.models[n] = snap[n]; else delete state.models[n]; });
    save();
  }

  /* ================================================================== *
   * Serving policy and the request loop
   * ================================================================== */
  // Build the live policy from settings (overridable per call, e.g. for A/B arms).
  function policy(over) {
    var s = Object.assign({}, state.settings, over || {}), w = world();
    var elig = impl('isEligible'), auction = impl('runAuction');
    var ranker;
    if (s.ranker === 'oracle') ranker = oracleRanker();
    else if (s.ranker === 'lr' && getModel('lr')) ranker = lrRanker(getModel('lr'));
    else if (s.ranker === 'deep' && getModel('deep')) {
      // Two-stage ranking (Ch. 1's funnel): a cheap early ranker picks the top 30 by eCPM,
      // then the deep model scores only those. Everything else gets 0 and can't win.
      var dm = getModel('deep'), early = getModel('lr') ? lrRanker(getModel('lr')) : heuristicRanker();
      ranker = { name: 'deep', predict: function (req, uv, ids, st) {
        if (ids.length <= 30) return ids.map(function (a) { return dm.pctr(uv, a, st); });
        var pre = early.predict(req, uv, ids, st);
        var ord = ids.map(function (a, i) { return [i, pre[i] * w.ads[a].cpcBid]; }).sort(function (x, y) { return y[1] - x[1]; });
        var out = new Array(ids.length).fill(0);
        for (var k = 0; k < 30; k++) out[ord[k][0]] = dm.pctr(uv, ids[ord[k][0]], st);
        return out;
      } };
    } else ranker = heuristicRanker();
    var tt = s.retrieval === 'twotower' ? getModel('twotower') : null, topKFn = impl('topK');
    var calibrator = null;
    if (s.calibrate && state.calib[ranker.name]) {
      var cs = state.calib[ranker.name];
      try { calibrator = impl('fitCalibrator')(cs.preds.slice(), cs.labels.slice(), 20); } catch (e) { calibrator = null; }
    }
    var cvr = null;
    if (s.pricing === 'ocpm') {
      if (s.cvrModel === 'esmm' && getModel('esmm')) cvr = { model: getModel('esmm') };
      else if (s.cvrModel === 'cvr-naive' && getModel('cvr-naive')) cvr = { model: getModel('cvr-naive') };
      else cvr = { oracle: true };
    }
    // Quality penalty (Ch. 14): score = bid × pCTR − λ · pHide. Implemented by passing the
    // auction a quality-adjusted pCTR, so ranking and pricing both account for it.
    if (s.hideLambda > 0 && getModel('phide')) {
      var ph = getModel('phide'), base = ranker, featF = impl('featurize'), Lb = lib(), s0h = slotBucket(0, ph.bits), lam = s.hideLambda;
      ranker = { name: base.name, predict: function (req, uv, ids, st) {
        var p = base.predict(req, uv, ids, st);
        return p.map(function (x, i) {
          var hz = lrPredictZ(ph.w, hashFeatures(featF(uv, w.ads[ids[i]], st, Lb), ph.bits), s0h);
          return Math.max(1e-6, x - lam * sigmoid(hz) / w.ads[ids[i]].cpcBid);
        });
      } };
    }
    return {
      settings: s, ranker: ranker, calibrator: calibrator, auction: auction, cvr: cvr,
      retrieve: function (req, uv) {
        var out = [];
        for (var i = 0; i < w.ads.length; i++) if (elig(w.ads[i], uv, req.day)) out.push(i);
        if (tt && out.length > s.retrievalK) {
          // Two-tower retrieval with the reader's topK() (Ch. 10).
          var uvec = tt.userVec(uv), av = tt.adVecs();
          out = topKFn(uvec, out.map(function (a) { return { id: a, vec: av[a] }; }), s.retrievalK);
        }
        return out;
      }
    };
  }

  function newStats() { return { imps: 0, clicks: 0, globalCTR: 0.03, ad: {} }; }
  function cloneStats(st) {
    var o = { imps: st.imps, clicks: st.clicks, globalCTR: st.globalCTR, ad: {} };
    for (var k in st.ad) o.ad[k] = { imps: st.ad[k].imps, clicks: st.ad[k].clicks };
    return o;
  }

  /* simulate({ days, requestsPerDay, stream, policy, stats, logFeatures, onProgress, keepCandidates })
   * Returns a log: { impressions, events, truth, summary, stats }.
   * - impressions: what the server logged at serve time
   * - events: clicks and conversions, each with its own timestamp (join them in Ch. 4)
   * - truth: parallel array with the true probabilities (never used for training) */
  async function simulate(opts) {
    var w = world(), pol = opts.policy || policy(), s = pol.settings, stream = opts.stream || 0;
    var rpd = opts.requestsPerDay || s.requestsPerDay, days = opts.days || [0];
    var stats = opts.stats ? cloneStats(opts.stats) : newStats();
    var feat = impl('featurize'), L = lib();
    var log = { impressions: [], events: [], truth: [], requestUsers: [], stats: null, summary: null, meta: { days: days, stream: stream, ranker: pol.ranker.name, settings: s } };
    var sum = { requests: 0, impressions: 0, clicks: 0, convs: 0, revenue: 0, spend: 0, advValue: 0, hides: 0,
      expClicks: 0, expRevenue: 0, expConvs: 0, expValue: 0, expHides: 0, oracleValue: 0, explore: 0, predSum: 0, candidates: 0, retrievalMs: 0, rankMs: 0 };
    var total = days.length * rpd, done = 0, examine = w.cfg.examine;
    var B = opts.budgets || null;
    if (B) { B.spend = B.spend || {}; }
    var advStats = {}, spendByHour = new Array(24).fill(0);
    for (var di = 0; di < days.length; di++) {
      var day = days[di], reqs = w.requestsForDay(day, rpd, stream), snap = cloneStats(stats);
      snap.globalCTR = snap.imps > 500 ? snap.clicks / snap.imps : prior().globalCTR;
      var dayDelta = {};
      for (var ri = 0; ri < reqs.length; ri++) {
        var req = reqs[ri];
        if (opts.userFilter && !opts.userFilter(req.user)) { done++; continue; }
        var uv = userView(w, req);
        log.requestUsers.push(req.user);
        var t0 = Date.now();
        var cands = pol.retrieve(req, uv);
        // Capstone only: churned advertisers, exhausted budgets, and pacing (throttling).
        if (B) cands = cands.filter(function (a) {
          var adv = w.ads[a].advertiser;
          if (B.churned && B.churned.has(adv)) return false;
          if (B.limit && B.limit[adv] != null && B.spend[adv] >= B.limit[adv]) return false;
          if (B.throttle && B.throttle[adv] != null && hashUnit(state.seed, 81, req.id, adv) > B.throttle[adv]) return false;
          return true;
        });
        var t1 = Date.now();
        sum.requests++; sum.candidates += cands.length; sum.retrievalMs += t1 - t0;
        if (!cands.length) continue;
        var preds = pol.ranker.predict(req, uv, cands, snap);
        if (pol.calibrator) preds = preds.map(pol.calibrator);
        sum.rankMs += Date.now() - t1;
        var bids = cands.map(function (a, i) {
          if (!pol.cvr) return w.ads[a].cpcBid;
          var pc = pol.cvr.oracle ? w.truth.pcvr(req.user, a, req) : cvrScore(pol.cvr.model, uv, w.ads[a], snap, feat, L);
          return w.advertisers[w.ads[a].advertiser].targetCPA * pc;
        });
        var auctionIn = cands.map(function (a, i) { return { ad: a, bid: bids[i], pctr: preds[i] }; });
        var nSlots = Math.min(req.slots, s.adLoad || req.slots);
        var winners = pol.auction(auctionIn, nSlots, s.reserveEcpm) || [];
        var explore = 0;
        // Exploration: with prob epsilon, serve random eligible ads (free); with prob
        // `shuffle`, keep the winners but randomize their slot order.
        var xr = hashUnit(state.seed, 71, stream, req.id);
        if (xr < s.epsilon) {
          explore = 1;
          var picks = [], pool = cands.slice();
          for (var k = 0; k < Math.min(nSlots, pool.length); k++) {
            var pi = Math.floor(hashUnit(state.seed, 72, stream, req.id, k) * pool.length);
            picks.push({ ad: pool[pi], slot: k, price: 0 }); pool.splice(pi, 1);
          }
          winners = picks;
        } else if (xr < s.epsilon + s.shuffle && winners.length > 1) {
          explore = 2;
          var ord = winners.map(function (x, i) { return { x: x, k: hashUnit(state.seed, 73, stream, req.id, i) }; }).sort(function (a, b) { return a.k - b.k; });
          winners = ord.map(function (o, i) { return { ad: o.x.ad, slot: i, price: o.x.price, ecpm: o.x.ecpm }; });
        }
        if (explore) sum.explore++;
        // Best achievable expected value for this request (for regret), using the truth.
        if (opts.trackOracle) {
          var tv = cands.map(function (a) { return w.truth.relevance(req.user, a, req) * bids[cands.indexOf(a)]; }).sort(function (a, b) { return b - a; });
          for (var ok = 0; ok < Math.min(req.slots, tv.length); ok++) sum.oracleValue += tv[ok] * examine[ok];
        }
        for (var wi = 0; wi < winners.length; wi++) {
          var win = winners[wi], a = win.ad, ad = w.ads[a], slotN = win.slot;
          var ci = cands.indexOf(a), predServed = preds[ci];
          var o = w.outcome(req, a, slotN, stream);
          var imp = { rid: req.id, t: req.t, day: day, hour: req.hour, user: req.user, device: req.device, ad: a, adv: ad.advertiser, cat: ad.category,
            slot: slotN, bid: bids[ci], pctr: predServed, price: win.price, explore: explore };
          if (opts.logFeatures !== false) { imp.feats = feat(uv, ad, snap, L); }
          // Serve-time counters for this ad, so features can be recomputed faithfully later.
          var sa = snap.ad[a]; imp.adImps = sa ? sa.imps : 0; imp.adClicks = sa ? sa.clicks : 0; imp.g = snap.globalCTR;
          if (opts.keepUser) imp.uv = uv;
          log.impressions.push(imp);
          var tp = w.truth.pctr(req.user, a, req, slotN), tcv = w.truth.pcvr(req.user, a, req), th = w.truth.phide(req.user, a, req, slotN);
          log.truth.push({ pctr: tp, rel: w.truth.relevance(req.user, a, req), pcvr: tcv, phide: th });
          var value = w.advertisers[ad.advertiser].valuePerConv;
          var as = advStats[ad.advertiser] || (advStats[ad.advertiser] = { imps: 0, expClicks: 0, expSpend: 0, expValue: 0, spend: 0 });
          as.imps++; as.expClicks += tp; as.expSpend += tp * win.price; as.expValue += tp * tcv * value;
          spendByHour[req.hour] += tp * win.price;
          sum.impressions++; sum.predSum += predServed;
          sum.expClicks += tp; sum.expRevenue += tp * win.price; sum.expConvs += tp * tcv; sum.expValue += tp * tcv * value; sum.expHides += th;
          if (o.click) {
            var ct = req.t + o.clickDelayS / 3600;
            log.events.push({ type: 'click', rid: req.id, ad: a, t: ct });
            sum.clicks++; sum.revenue += win.price; sum.spend += win.price; as.spend += win.price;
            if (B) B.spend[ad.advertiser] = (B.spend[ad.advertiser] || 0) + win.price;
            if (o.conv) { log.events.push({ type: 'conv', rid: req.id, ad: a, t: ct + o.convDelayH }); sum.convs++; sum.advValue += value; }
          }
          if (o.hide) { sum.hides++; log.events.push({ type: 'hide', rid: req.id, ad: a, t: req.t + 0.02 }); }
          var dd = dayDelta[a] || (dayDelta[a] = { imps: 0, clicks: 0 });
          dd.imps++; dd.clicks += o.click;
        }
        done++;
        if (done % 400 === 0) { if (opts.onProgress) opts.onProgress(done / total); await tick(); }
      }
      // Counters update in a daily batch, so tomorrow's features see today's data.
      for (var ak in dayDelta) {
        var cur = stats.ad[ak] || (stats.ad[ak] = { imps: 0, clicks: 0 });
        cur.imps += dayDelta[ak].imps; cur.clicks += dayDelta[ak].clicks;
        stats.imps += dayDelta[ak].imps; stats.clicks += dayDelta[ak].clicks;
      }
    }
    if (opts.onProgress) opts.onProgress(1);
    stats.globalCTR = stats.imps ? stats.clicks / stats.imps : prior().globalCTR;
    log.stats = stats;
    sum.ctr = sum.impressions ? sum.clicks / sum.impressions : 0;
    sum.fill = sum.requests ? sum.impressions / (sum.requests * w.cfg.slots) : 0;
    sum.rpm = sum.requests ? 1000 * sum.revenue / sum.requests : 0;
    sum.expRpm = sum.requests ? 1000 * sum.expRevenue / sum.requests : 0;
    sum.roi = sum.spend ? sum.advValue / sum.spend : 0;
    sum.calibration = sum.expClicks ? sum.predSum / sum.expClicks : 0; // predicted / true expected clicks (slot-0 preds vs slot-adjusted truth)
    log.summary = sum;
    log.advStats = advStats; log.spendByHour = spendByHour;
    return log;
  }
  function cvrScore(model, uv, ad, stats, feat, L) {
    var idx = hashFeatures(feat(uv, ad, stats, L).concat(['bias']), model.bits);
    return sigmoid(lrPredictZ(model.wb, idx));
  }

  // Joined, labeled rows ready for training (uses the reader's join from Ch. 4).
  function labeledRows(log, opts) {
    opts = opts || {};
    var lastT = 0;
    log.impressions.forEach(function (x) { if (x.t > lastT) lastT = x.t; });
    var hides = new Set(), evs = [];
    log.events.forEach(function (e) { if (e.type === 'hide') hides.add(e.rid + ':' + e.ad); else evs.push(e); });
    var rows = impl('joinLabels')(log.impressions, evs, {
      clickWindowH: opts.clickWindowH || 1, convWindowH: opts.convWindowH || 168, nowT: opts.nowT != null ? opts.nowT : lastT + (opts.extraH == null ? 24 * 30 : opts.extraH)
    });
    rows.forEach(function (r) { r.hide = hides.has(r.rid + ':' + r.ad) ? 1 : 0; });
    return rows;
  }

  /* Recompute features for logged rows with any featurizer (needs rows with .uv).
   *   mode 'serve': counters as they were at serve time (faithful)
   *   mode 'final': counters from `finalStats`, i.e. including the future (leaky) */
  function refeaturize(rows, fn, mode, finalStats) {
    var w = world(), L = lib();
    return rows.map(function (r) {
      var st;
      if (mode === 'final') st = finalStats;
      else { st = { globalCTR: r.g, ad: {} }; st.ad[r.ad] = { imps: r.adImps, clicks: r.adClicks }; }
      var o = Object.assign({}, r); o.feats = fn(r.uv, w.ads[r.ad], st, L);
      return o;
    });
  }

  /* ================================================================== *
   * Standard datasets (deterministic, cached per page)
   * ================================================================== */
  var _logCache = {};
  function cacheKey(o) { return JSON.stringify(o) + '|' + JSON.stringify(state.settings) + '|' + Object.keys(state.code).map(function (k) { return k + (state.code[k].passed ? state.code[k].src.length : 0); }).join(','); }
  // Production logs for training: days 0..9 served by the given (default: current) policy.
  async function trainingLog(o) {
    o = Object.assign({ days: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], requestsPerDay: 6000, stream: 0 }, o || {});
    var key = 'train' + cacheKey(o);
    if (_logCache[key]) return _logCache[key];
    var pol = policy(o.policy || {});
    var log = await simulate({ days: o.days, requestsPerDay: o.requestsPerDay, stream: o.stream, policy: pol, onProgress: o.onProgress, keepUser: true });
    _logCache[key] = log;
    return log;
  }
  // Held-out evaluation logs: the next day, different users' requests (stream 1).
  async function evalLog(o) {
    o = Object.assign({ days: [10], requestsPerDay: 4000, stream: 1 }, o || {});
    var key = 'eval' + cacheKey(o);
    if (_logCache[key]) return _logCache[key];
    var trainL = await trainingLog({ onProgress: o.onProgressTrain });
    var log = await simulate({ days: o.days, requestsPerDay: o.requestsPerDay, stream: o.stream, policy: policy(o.policy || {}), stats: trainL.stats, onProgress: o.onProgress, keepUser: true });
    _logCache[key] = log;
    return log;
  }
  function clearLogCache() { _logCache = {}; }

  /* ================================================================== *
   * Evaluation
   * ================================================================== */
  function evaluate(preds, labels, truthP) {
    var aucFn = impl('auc'), neFn = impl('normalizedEntropy');
    var out = {
      n: preds.length, auc: aucFn(preds, labels), ne: neFn(preds, labels), logloss: loglossRef(preds, labels),
      calibration: sum(preds) / Math.max(1e-9, sum(labels)), ece: ece(preds, labels, 10),
      meanPred: mean(preds), baseRate: mean(labels)
    };
    if (truthP) {
      out.oracleAuc = aucRef(truthP, labels);
      out.oracleNe = neRef(truthP, labels);
      out.calibrationVsTruth = sum(preds) / Math.max(1e-9, sum(truthP));
      out.eceVsTruth = ece(preds, truthP, 10);
      out.corrWithTruth = pearson(preds.map(logitSafe), truthP.map(logitSafe));
      out.pairAccVsTruth = pairOrderAcc(preds, truthP);
    }
    return out;
  }
  function logitSafe(p) { p = clamp(p, 1e-6, 1 - 1e-6); return Math.log(p / (1 - p)); }
  // Share of random pairs ordered the same way as the truth.
  function pairOrderAcc(preds, truth) {
    var n = preds.length, agree = 0, tot = 0;
    var r = World.Rand(99);
    for (var k = 0; k < 20000; k++) {
      var i = Math.floor(r.next() * n), j = Math.floor(r.next() * n);
      if (truth[i] === truth[j]) continue;
      tot++;
      var d = (preds[i] - preds[j]) * (truth[i] - truth[j]);
      if (d > 0) agree++; else if (d === 0) agree += 0.5;
    }
    return tot ? agree / tot : 0.5;
  }

  // A/B test: users split 50/50 by hash; both arms see the same days and requests.
  // Returns observed metrics with bootstrap CIs, plus the true expected values that
  // only a simulator can know.
  async function abTest(o) {
    var days = o.days || [11, 12, 13], rpd = o.requestsPerDay || 4000;
    var trainL = await trainingLog();
    var arms = [{ name: o.controlName || 'Control', over: o.control || {} }, { name: o.treatmentName || 'Treatment', over: o.treatment || {} }];
    var out = [];
    for (var ai = 0; ai < 2; ai++) {
      var armIdx = ai;
      var log = await simulate({ days: days, requestsPerDay: rpd, stream: 3, policy: policy(arms[ai].over), stats: trainL.stats, logFeatures: false,
        userFilter: function (uid) { return (World.hashInts(state.seed, 555, uid) & 1) === armIdx; },
        onProgress: function (p) { if (o.onProgress) o.onProgress((armIdx + p) / 2); } });
      var users = new Map();
      function U(id) { var u = users.get(id); if (!u) { u = { req: 0, rev: 0, clicks: 0, conv: 0, value: 0, hides: 0 }; users.set(id, u); } return u; }
      log.requestUsers.forEach(function (uid) { U(uid).req++; });
      var impByKey = new Map();
      log.impressions.forEach(function (imp) { impByKey.set(imp.rid + ':' + imp.ad, imp); });
      log.events.forEach(function (e) {
        var imp = impByKey.get(e.rid + ':' + e.ad), u = U(imp.user);
        if (e.type === 'click') { u.clicks++; u.rev += imp.price; } else { u.conv++; u.value += world().advertisers[imp.adv].valuePerConv; }
      });
      out.push({ name: arms[ai].name, summary: log.summary, users: Array.from(users.values()) });
    }
    var metrics = { rpm: function (us) { return 1000 * sumK(us, 'rev') / sumK(us, 'req'); },
      ctr: function (us) { return sumK(us, 'clicks') / Math.max(1, sumK(us, 'req')); },
      value: function (us) { return 1000 * sumK(us, 'value') / sumK(us, 'req'); } };
    var diffs = {}, r = World.Rand(77);
    Object.keys(metrics).forEach(function (k) {
      var f = metrics[k], a = out[0].users, b = out[1].users, base = f(a), treat = f(b), boots = [];
      for (var i = 0; i < 300; i++) {
        var fa = f(resample(a, r)), fb = f(resample(b, r));
        boots.push(fb / fa - 1);
      }
      boots.sort(function (x, y) { return x - y; });
      diffs[k] = { control: base, treatment: treat, lift: treat / base - 1, lo: boots[7], hi: boots[292] };
    });
    var tA = out[0].summary, tB = out[1].summary;
    diffs.trueRpm = { control: tA.expRpm, treatment: tB.expRpm, lift: tB.expRpm / tA.expRpm - 1 };
    diffs.trueValue = { control: tA.expValue / tA.requests * 1000, treatment: tB.expValue / tB.requests * 1000, lift: (tB.expValue / tB.requests) / (tA.expValue / tA.requests) - 1 };
    return { arms: out, diffs: diffs };
  }
  function sumK(us, k) { var s = 0; for (var i = 0; i < us.length; i++) s += us[i][k]; return s; }
  function resample(us, r) { var o = new Array(us.length); for (var i = 0; i < us.length; i++) o[i] = us[Math.floor(r.next() * us.length)]; return o; }

  /* ================================================================== *
   * Chapter milestones and reference solutions
   * ================================================================== */
  var CHAPTER_SLOTS = {};
  Object.keys(SLOTS).forEach(function (id) { var c = SLOTS[id].chapter; (CHAPTER_SLOTS[c] = CHAPTER_SLOTS[c] || []).push(id); });
  var MODEL_FOR_CHAPTER = { 7: 'lr', 10: 'twotower', 11: 'deep', 12: 'esmm', 14: 'phide' };

  function markBuilt(ch, who) { if (state.built[ch] !== 'you') state.built[ch] = who || 'you'; save(); }
  function chapterStatus(ch) {
    var slots = CHAPTER_SLOTS[ch] || [];
    var mine = slots.filter(function (id) { return state.code[id] && state.code[id].passed; }).length;
    var needModel = MODEL_FOR_CHAPTER[ch];
    return { slots: slots, mine: mine, built: state.built[ch] || null, model: needModel ? hasModel(needModel) : null };
  }

  // Everything a reader who skipped chapters 1..n would be missing.
  function missingBefore(n) {
    var miss = [];
    for (var c = 1; c < n; c++) {
      if (!state.built[c]) miss.push(c);
      else if (MODEL_FOR_CHAPTER[c] && !hasModel(MODEL_FOR_CHAPTER[c])) miss.push(c);
    }
    return miss;
  }

  // Fill in chapters 1..n-1 with reference solutions (code slots the reader hasn't
  // solved stay on the reference implementation automatically) and train any
  // reference models that are missing.
  async function loadReference(n, onProgress) {
    var steps = [];
    for (var c = 1; c < n; c++) {
      if (!state.built[c]) {
        state.built[c] = 'reference';
        // The reference Ch. 5 decision: keep 10% exploration traffic in production.
        if (c === 5 && !state.settings.epsilon) state.settings.epsilon = 0.1;
        if (c === 3 && !state.settings.calibrate) state.settings.calibrate = false;
      }
      if (MODEL_FOR_CHAPTER[c] && !hasModel(MODEL_FOR_CHAPTER[c])) steps.push(c);
    }
    if (n > 7 && state.settings.ranker === 'heuristic' && state.built[9] === undefined && n > 9) { /* production switch happens in Ch. 9 */ }
    save();
    for (var i = 0; i < steps.length; i++) {
      var ch = steps[i];
      var report = function (p, label) { if (onProgress) onProgress((i + p) / steps.length, label); };
      await trainReferenceModel(ch, report);
    }
    if (n > 9 && state.settings.ranker === 'heuristic' && hasModel('lr')) { state.settings.ranker = 'lr'; state.built[9] = state.built[9] || 'reference'; }
    save();
    if (onProgress) onProgress(1, 'Done');
  }
  async function trainReferenceModel(ch, report) {
    // Reference models are trained on the heuristic-served logs, like a reader would.
    var tl = await trainingLog({ policy: { ranker: 'heuristic', retrieval: 'eligible', calibrate: false }, onProgress: function (p) { report(p * 0.4, 'Collecting logs'); } });
    var rows = labeledRows(tl);
    if (ch === 7) {
      var m = await trainLR({ rows: rows, epochs: 2, lr: 0.05, onProgress: function (p) { report(0.4 + 0.6 * p, 'Training logistic regression'); } });
      putModel('lr', m, { source: 'reference', trainedOn: 'days 0–9' });
    } else if (ch === 10) {
      var tt = await trainTwoTower({ rows: rows, epochs: 3, objective: 'softmax', negatives: 20, onProgress: function (p) { report(0.4 + 0.6 * p, 'Training two-tower'); } });
      putModel('twotower', tt, { source: 'reference' });
    } else if (ch === 11) {
      var dm = await trainDeep({ rows: rows, epochs: 1, cross: 1, attention: true, wide: true, onProgress: function (p) { report(0.4 + 0.6 * p, 'Training deep ranker'); } });
      putModel('deep', dm, { source: 'reference' });
    } else if (ch === 12) {
      var em = await trainCVR({ rows: rows, method: 'esmm', onProgress: function (p) { report(0.4 + 0.6 * p, 'Training ESMM'); } });
      putModel('esmm', em, { source: 'reference' });
    } else if (ch === 14) {
      var hm = await trainLR({ rows: rows, epochs: 2, label: 'hide', onProgress: function (p) { report(0.4 + 0.6 * p, 'Training pHide'); } });
      putModel('phide', hm, { source: 'reference' });
    }
  }

  /* ================================================================== *
   * Helpers
   * ================================================================== */
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  return {
    get state() { return state; }, save: save, reset: reset, onChange: onChange,
    world: world, setWorldOverrides: setWorldOverrides, prior: prior, userView: userView,
    SLOTS: SLOTS, CHAPTER_SLOTS: CHAPTER_SLOTS, impl: impl, implSource: implSource, runTests: runTests, saveCode: saveCode, compile: compile,
    fnv1a: fnv1a, hashFeatures: hashFeatures, lib: lib,
    trainLR: trainLR, lrPredictRows: lrPredictRows, lrRanker: lrRanker, lrDataset: lrDataset, trainTwoTower: trainTwoTower, retrievalRecall: retrievalRecall, unbiasedClicks: unbiasedClicks, trainDeep: trainDeep, trainCVR: trainCVR, cvrPredictRows: cvrPredictRows,
    putModel: putModel, getModel: getModel, hasModel: hasModel, snapshotModels: snapshotModels, restoreModels: restoreModels,
    policy: policy, simulate: simulate, labeledRows: labeledRows, refeaturize: refeaturize, newStats: newStats,
    trainingLog: trainingLog, evalLog: evalLog, clearLogCache: clearLogCache,
    evaluate: evaluate, abTest: abTest, reliability: reliability, ece: ece, aucRef: aucRef, neRef: neRef, loglossRef: loglossRef, pairOrderAcc: pairOrderAcc, pearson: pearson,
    markBuilt: markBuilt, chapterStatus: chapterStatus, missingBefore: missingBefore, loadReference: loadReference,
    MODEL_FOR_CHAPTER: MODEL_FOR_CHAPTER, sigmoid: sigmoid, mean: mean, sum: sum, tick: tick
  };
});
