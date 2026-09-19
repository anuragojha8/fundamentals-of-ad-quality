/* Fundamentals of Ad Quality — the synthetic world.
 *
 * A seeded, fully deterministic ad marketplace with KNOWN ground truth.
 * Every random draw is either from a seeded PRNG consumed in a fixed order
 * (entity generation) or from a stateless hash of integer keys (per-user/day
 * histories, per-request draws), so the same seed always yields the same
 * world — in the browser, in Node, or in a future Python port.
 *
 * Two views of the world:
 *   - OBSERVABLE: what a production system could log (ids, age bucket,
 *     country, device, hour, engagement history, bids, categories).
 *   - world.truth: latent parameters and the true probability functions
 *     (pCTR, pCVR, pHide, examination/position curve, conversion delays).
 *     Models never see this; widgets use it to grade models against reality.
 *
 * No DOM access. UMD: window.World in the browser, module.exports in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.World = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 2; // bump whenever generation or truth changes: saved models become invalid

  /* ------------------------------------------------------------------ *
   * Portable randomness
   * ------------------------------------------------------------------ */
  // mulberry32: tiny, fast, easy to port (all ops are 32-bit int).
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Stateless hash of a list of ints -> uint32 (murmur3-style mixing).
  function hashInts() {
    var h = 0x9747b28c | 0;
    for (var i = 0; i < arguments.length; i++) {
      var k = arguments[i] | 0;
      k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
      h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
    }
    h ^= arguments.length * 4;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function hashUnit() { return hashInts.apply(null, arguments) / 4294967296; }

  function Rand(seed) {
    var u = mulberry32(seed);
    var r = {
      next: u,
      uniform: function (a, b) { return a + (b - a) * u(); },
      int: function (n) { return Math.floor(u() * n); },
      normal: function (m, s) {
        var x = 1 - u(), y = u();
        return (m || 0) + (s == null ? 1 : s) * Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y);
      },
      bern: function (p) { return u() < p ? 1 : 0; },
      exp: function (mean) { return -Math.log(1 - u()) * mean; },
      pick: function (arr) { return arr[Math.floor(u() * arr.length)]; },
      weighted: function (w) {
        var s = 0, i; for (i = 0; i < w.length; i++) s += w[i];
        var x = u() * s;
        for (i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
        return w.length - 1;
      },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(u() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
        return arr;
      }
    };
    return r;
  }

  /* ------------------------------------------------------------------ *
   * Small math helpers
   * ------------------------------------------------------------------ */
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function normalize(v) {
    var n = Math.sqrt(dot(v, v)) || 1;
    for (var i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }
  function randUnit(r, d) { var v = new Array(d); for (var i = 0; i < d; i++) v[i] = r.normal(); return normalize(v); }

  /* ------------------------------------------------------------------ *
   * Fixed, human-readable structure of the marketplace
   * ------------------------------------------------------------------ */
  var CATEGORIES = [
    // cluster: 0 active/outdoors, 1 money/tech, 2 style/home, 3 leisure
    { id: 0, name: 'Outdoor', cluster: 0, cvrBase: -3.0, delayMeanH: 36, valuePerConv: 60 },
    { id: 1, name: 'Fitness', cluster: 0, cvrBase: -2.9, delayMeanH: 30, valuePerConv: 45 },
    { id: 2, name: 'Travel', cluster: 0, cvrBase: -3.6, delayMeanH: 96, valuePerConv: 150 },
    { id: 3, name: 'Finance', cluster: 1, cvrBase: -3.4, delayMeanH: 120, valuePerConv: 120 },
    { id: 4, name: 'Tech', cluster: 1, cvrBase: -3.2, delayMeanH: 48, valuePerConv: 80 },
    { id: 5, name: 'Education', cluster: 1, cvrBase: -3.3, delayMeanH: 72, valuePerConv: 70 },
    { id: 6, name: 'Beauty', cluster: 2, cvrBase: -2.8, delayMeanH: 24, valuePerConv: 35 },
    { id: 7, name: 'Fashion', cluster: 2, cvrBase: -3.0, delayMeanH: 30, valuePerConv: 40 },
    { id: 8, name: 'Home', cluster: 2, cvrBase: -3.1, delayMeanH: 40, valuePerConv: 55 },
    { id: 9, name: 'Gaming', cluster: 3, cvrBase: -1.7, delayMeanH: 2, valuePerConv: 6 },
    { id: 10, name: 'Food', cluster: 3, cvrBase: -2.6, delayMeanH: 10, valuePerConv: 25 },
    { id: 11, name: 'Pets', cluster: 3, cvrBase: -2.7, delayMeanH: 18, valuePerConv: 30 }
  ];
  var K = CATEGORIES.length;
  var AGES = ['18–24', '25–34', '35–49', '50+'];
  var COUNTRIES = ['US', 'UK', 'BR'];
  var DEVICES = ['ios', 'android'];

  // Age x category affinity (logit shift). Deliberately structured so that
  // "age" is a genuinely useful feature and a genuinely useful CROSS.
  var AGE_CAT = [
    //  Out   Fit   Trv   Fin   Tech  Edu   Bty   Fsh   Home  Game  Food  Pets
    [0.10, 0.25, 0.05, -0.45, 0.15, 0.30, 0.20, 0.35, -0.40, 0.55, 0.10, -0.10],
    [0.15, 0.20, 0.20, 0.00, 0.20, 0.10, 0.15, 0.15, 0.00, 0.15, 0.15, 0.05],
    [0.05, 0.00, 0.10, 0.30, 0.05, -0.10, -0.05, -0.05, 0.35, -0.20, 0.10, 0.15],
    [-0.05, -0.20, 0.25, 0.35, -0.25, -0.30, -0.15, -0.30, 0.30, -0.55, 0.05, 0.20]
  ];
  // Device x category (logit shift).
  var DEVICE_CAT = [
    [0.00, 0.05, 0.10, 0.20, 0.10, 0.00, 0.15, 0.10, 0.00, -0.25, 0.00, 0.00], // ios
    [0.00, -0.05, -0.10, -0.20, -0.05, 0.00, -0.10, -0.05, 0.00, 0.30, 0.05, 0.00] // android
  ];

  var NAMED_ADVERTISERS = [
    { name: 'Trailhead', category: 0 }, { name: 'Nimbus', category: 3 }, { name: 'Sprout', category: 10 },
    { name: 'Orbit', category: 9 }, { name: 'Lumen', category: 6 }
  ];
  var NAME_A = ['Aster', 'Bolt', 'Cedar', 'Delta', 'Ember', 'Fable', 'Grove', 'Harbor', 'Iris', 'Juniper', 'Kite', 'Lark', 'Maple', 'Nova', 'Onyx', 'Pike', 'Quill', 'Rowan', 'Sable', 'Tide', 'Umber', 'Vale', 'Wren', 'Yarrow', 'Zephyr', 'Birch', 'Coral', 'Dune', 'Flint', 'Haven'];
  var NAME_B = ['Gear', 'Fit', 'Trips', 'Pay', 'Labs', 'Learn', 'Glow', 'Thread', 'Nest', 'Play', 'Bites', 'Paws'];

  var DEFAULTS = {
    seed: 7,
    dim: 8,
    nUsers: 4000,
    nAdvertisers: 60,
    minCreatives: 3,
    maxCreatives: 8,
    horizonDays: 90,
    slots: 3,
    // Examination probability by ad slot (position bias). Slot 0 is the
    // first ad in the feed load.
    examine: [1.0, 0.62, 0.41],
    baseLogit: -6.4,
    wMatch: 3.4,         // weight on dot(user interest, ad embedding)
    wIntent: 1.3,        // bonus when the ad matches today's short-term intent
    userBiasSd: 1.0,     // user "clickiness"
    adQualitySd: 0.55,   // creative appeal
    advQualitySd: 0.2,
    driftStrength: 2.2,  // how far user interests wander over the horizon
    trendAmp: 0.3,       // category seasonality amplitude (logit)
    historyLen: 12,
    adSpread: 0.38,      // how far a creative's embedding strays from its category
    userSpread: 0.25,    // idiosyncratic taste beyond category interests
    attributionWindowH: 168  // 7-day click-through attribution
  };

  /* ------------------------------------------------------------------ *
   * World construction
   * ------------------------------------------------------------------ */
  function create(opts) {
    var cfg = {};
    var k;
    for (k in DEFAULTS) cfg[k] = DEFAULTS[k];
    if (opts) for (k in opts) cfg[k] = opts[k];
    var D = cfg.dim;
    var r = Rand(hashInts(cfg.seed, 1));

    /* Category embeddings: cluster direction + individual direction. */
    var clusterVecs = [0, 1, 2, 3].map(function () { return randUnit(r, D); });
    var catVec = CATEGORIES.map(function (c) {
      var own = randUnit(r, D), v = new Array(D);
      for (var i = 0; i < D; i++) v[i] = 0.62 * clusterVecs[c.cluster][i] + 0.78 * own[i];
      return normalize(v);
    });
    var trendPhase = CATEGORIES.map(function () { return r.uniform(0, 2 * Math.PI); });
    var trendPeriod = CATEGORIES.map(function () { return r.uniform(28, 80); });

    /* Advertisers */
    var advertisers = [], advTruth = [];
    for (var a = 0; a < cfg.nAdvertisers; a++) {
      var named = NAMED_ADVERTISERS[a];
      var cat = named ? named.category : r.int(K);
      var name = named ? named.name : NAME_A[a % NAME_A.length] + ' ' + NAME_B[cat];
      var value = CATEGORIES[cat].valuePerConv * Math.exp(r.normal(0, 0.35));
      var margin = r.uniform(0.45, 0.9); // share of value they're willing to spend
      var assumedCvr = sigmoid(CATEGORIES[cat].cvrBase + r.normal(0, 0.25));
      advertisers.push({
        id: a, name: name, category: cat,
        valuePerConv: round2(value),
        targetCPA: round2(value * margin),
        dailyBudget: round2(Math.exp(r.normal(Math.log(400), 0.7))),
        // CPC bid an advertiser would set by hand: value * their CVR guess * margin
        baseCpcBid: round2(Math.max(0.05, value * assumedCvr * margin))
      });
      advTruth.push({ quality: r.normal(0, cfg.advQualitySd), cvrOffset: r.normal(0, 0.3), annoy: r.normal(0, 0.4) });
    }

    /* Ads (creatives). Most are live on day 0; the rest launch over time. */
    var ads = [], adTruth = [];
    advertisers.forEach(function (adv) {
      var n = cfg.minCreatives + r.int(cfg.maxCreatives - cfg.minCreatives + 1);
      for (var c = 0; c < n; c++) {
        var id = ads.length;
        var early = r.next() < 0.6;
        var start = early ? 0 : 1 + r.int(cfg.horizonDays - 10);
        var dur = early ? 35 + r.int(cfg.horizonDays) : 20 + r.int(40);
        var countries = null, ages = null;
        if (r.next() < 0.3) { countries = [r.int(3)]; if (r.next() < 0.5) { var c2 = r.int(3); if (c2 !== countries[0]) countries.push(c2); } }
        if (r.next() < 0.3) { var lo = r.int(3); ages = []; for (var g = lo; g <= Math.min(3, lo + 1 + r.int(2)); g++) ages.push(g); }
        var own = randUnit(r, D), phi = new Array(D);
        for (var i = 0; i < D; i++) phi[i] = catVec[adv.category][i] + cfg.adSpread * own[i];
        normalize(phi);
        ads.push({
          id: id, advertiser: adv.id, category: adv.category, creative: c,
          startDay: start, endDay: start + dur,
          cpcBid: round2(adv.baseCpcBid * Math.exp(r.normal(0, 0.15))),
          targeting: { countries: countries, ages: ages }
        });
        adTruth.push({
          quality: advTruth[adv.id].quality + r.normal(0, cfg.adQualitySd),
          phi: phi,
          cvrOffset: advTruth[adv.id].cvrOffset + r.normal(0, 0.2),
          annoy: advTruth[adv.id].annoy + r.normal(0, 0.25)
        });
      }
    });

    /* Users */
    var users = [], userTruth = [];
    for (var u = 0; u < cfg.nUsers; u++) {
      var age = r.weighted([0.26, 0.34, 0.25, 0.15]);
      var country = r.weighted([0.5, 0.2, 0.3]);
      var device = r.next() < (country === 2 ? 0.25 : 0.55) ? 0 : 1;
      // Interests: 2–3 favourite categories, age-skewed, plus background.
      var prior = CATEGORIES.map(function (c, j) { return Math.exp(1.6 * AGE_CAT[age][j]); });
      var w = new Array(K).fill(0.04);
      var nFav = 2 + r.int(2);
      for (var f = 0; f < nFav; f++) w[r.weighted(prior)] += r.uniform(0.5, 1.2);
      var ws = w.reduce(function (s, x) { return s + x; }, 0);
      w = w.map(function (x) { return x / ws; });
      var theta = new Array(D).fill(0);
      for (var j = 0; j < K; j++) for (var d = 0; d < D; d++) theta[d] += w[j] * catVec[j][d];
      var noise = randUnit(r, D);
      for (d = 0; d < D; d++) theta[d] += cfg.userSpread * noise[d];
      normalize(theta);
      users.push({ id: u, age: age, country: country, device: device, activity: round2(Math.exp(r.normal(0, 0.8))) });
      userTruth.push({
        interests: w, theta: theta, drift: randUnit(r, D),
        clickiness: r.normal(0, cfg.userBiasSd),
        purchase: r.normal(0, 0.5),
        focus: r.uniform(0.45, 0.85) // how strongly today's intent dominates recent history
      });
    }

    // A second interest profile per user, drawn the same way as the first. Over the horizon each
    // user's tastes move from profile 0 toward profile 1 (between categories, not into nowhere).
    // Drawn from a separate stream so the rest of the world is unchanged by this feature.
    var r2 = Rand(hashInts(cfg.seed, 2));
    userTruth.forEach(function (ut, u) {
      var age = users[u].age, prior = CATEGORIES.map(function (c, j) { return Math.exp(1.6 * AGE_CAT[age][j]); });
      var w2 = new Array(K).fill(0.04), nFav = 2 + r2.int(2);
      for (var f = 0; f < nFav; f++) w2[r2.weighted(prior)] += r2.uniform(0.5, 1.2);
      var ws2 = w2.reduce(function (a, b) { return a + b; }, 0);
      ut.interests2 = w2.map(function (x) { return x / ws2; });
      var th = new Array(D).fill(0);
      for (var j = 0; j < K; j++) for (var d = 0; d < D; d++) th[d] += ut.interests2[j] * catVec[j][d];
      var nz = randUnit(r2, D);
      for (d = 0; d < D; d++) th[d] += cfg.userSpread * nz[d];
      ut.theta2 = normalize(th);
    });
    function driftShare(day) { return Math.min(1, cfg.driftStrength * Math.min(day, cfg.horizonDays) / cfg.horizonDays) * 0.85; }
    var intCache = new Map();
    function interestsAt(uid, day) {
      var key = uid * 1024 + day, v = intCache.get(key);
      if (v) return v;
      var ut = userTruth[uid], sh = driftShare(day);
      v = ut.interests.map(function (x, j) { return (1 - sh) * x + sh * ut.interests2[j]; });
      if (intCache.size > 200000) intCache.clear();
      intCache.set(key, v);
      return v;
    }

    // Cumulative activity weights for request sampling.
    var cumAct = [], acc = 0;
    users.forEach(function (x) { acc += x.activity; cumAct.push(acc); });

    /* ---------------- truth functions ---------------- */
    var thetaCache = new Map();
    function thetaAt(uid, day) {
      var key = uid * 1024 + day;
      var t = thetaCache.get(key);
      if (t) return t;
      var ut = userTruth[uid], sh = driftShare(day);
      t = new Array(D);
      for (var i = 0; i < D; i++) t[i] = (1 - sh) * ut.theta[i] + sh * ut.theta2[i];
      normalize(t);
      if (thetaCache.size > 200000) thetaCache.clear();
      thetaCache.set(key, t);
      return t;
    }
    function trend(cat, day) {
      return cfg.trendAmp * Math.sin(2 * Math.PI * day / trendPeriod[cat] + trendPhase[cat]);
    }
    function hourEffect(cat, hour) {
      var base = 0.12 * Math.sin(2 * Math.PI * (hour - 15) / 24);
      if (cat === 10 && ((hour >= 11 && hour <= 13) || (hour >= 17 && hour <= 20))) base += 0.35; // food at mealtimes
      if (cat === 9 && (hour >= 21 || hour <= 1)) base += 0.25; // late-night gaming
      if (cat === 3 && hour >= 8 && hour <= 10) base += 0.15;   // morning finance
      return base;
    }
    // Today's short-term intent: mostly from long-term interests, sometimes random.
    function intentOf(uid, day) {
      var wts = interestsAt(uid, day);
      var x = hashUnit(cfg.seed, 11, uid, day);
      if (x < 0.25) return Math.floor(hashUnit(cfg.seed, 12, uid, day) * K);
      var y = hashUnit(cfg.seed, 13, uid, day), s = 0;
      for (var j = 0; j < K; j++) { s += wts[j]; if (y <= s) return j; }
      return K - 1;
    }
    var histCache = new Map();
    // Observable: categories of the last N posts the user engaged with, most recent first.
    function history(uid, day) {
      var key = uid * 1024 + day;
      var h = histCache.get(key);
      if (h) return h;
      var ut = userTruth[uid], intent = intentOf(uid, day), wts = interestsAt(uid, day);
      h = new Array(cfg.historyLen);
      for (var i = 0; i < cfg.historyLen; i++) {
        var pIntent = ut.focus * Math.pow(0.86, i);
        if (hashUnit(cfg.seed, 21, uid, day, i) < pIntent) h[i] = intent;
        else {
          var y = hashUnit(cfg.seed, 22, uid, day, i), s = 0, pick = K - 1;
          for (var j = 0; j < K; j++) { s += wts[j]; if (y <= s) { pick = j; break; } }
          h[i] = pick;
        }
      }
      if (histCache.size > 200000) histCache.clear();
      histCache.set(key, h);
      return h;
    }

    function relevanceLogit(uid, adId, ctx) {
      var ad = ads[adId], at = adTruth[adId], ut = userTruth[uid], us = users[uid];
      var cat = ad.category;
      return cfg.baseLogit + ut.clickiness + at.quality
        + cfg.wMatch * dot(thetaAt(uid, ctx.day), at.phi)
        + (intentOf(uid, ctx.day) === cat ? cfg.wIntent : 0)
        + AGE_CAT[us.age][cat] + DEVICE_CAT[ctx.device][cat]
        + hourEffect(cat, ctx.hour) + trend(cat, ctx.day);
    }
    function relevance(uid, adId, ctx) { return sigmoid(relevanceLogit(uid, adId, ctx)); }
    function examine(pos) { return cfg.examine[Math.min(pos, cfg.examine.length - 1)]; }
    function pctr(uid, adId, ctx, pos) { return examine(pos || 0) * relevance(uid, adId, ctx); }
    function pcvr(uid, adId, ctx) {
      var ad = ads[adId], at = adTruth[adId], ut = userTruth[uid];
      return sigmoid(CATEGORIES[ad.category].cvrBase + at.cvrOffset
        + 1.2 * dot(thetaAt(uid, ctx.day), at.phi) + ut.purchase
        - 0.5 * ut.clickiness - 0.8 * at.quality); // clicky users & clickbait creatives convert less
    }
    function delayMeanH(adId) { return CATEGORIES[ads[adId].category].delayMeanH; }
    function pcvrWithin(uid, adId, ctx, windowH) {
      return pcvr(uid, adId, ctx) * (1 - Math.exp(-windowH / delayMeanH(adId)));
    }
    function phide(uid, adId, ctx, pos) {
      var at = adTruth[adId];
      return examine(pos || 0) * sigmoid(-4.4 - 1.8 * dot(thetaAt(uid, ctx.day), at.phi) - 0.5 * at.quality + at.annoy);
    }

    /* ---------------- observable API ---------------- */
    function isActive(adId, day) { var ad = ads[adId]; return day >= ad.startDay && day < ad.endDay; }
    function passesTargeting(adId, uid) {
      var t = ads[adId].targeting, us = users[uid];
      if (t.countries && t.countries.indexOf(us.country) < 0) return false;
      if (t.ages && t.ages.indexOf(us.age) < 0) return false;
      return true;
    }
    function eligibleAds(uid, day) {
      var out = [];
      for (var i = 0; i < ads.length; i++) if (isActive(i, day) && passesTargeting(i, uid)) out.push(i);
      return out;
    }
    function activeAds(day) { var out = []; for (var i = 0; i < ads.length; i++) if (isActive(i, day)) out.push(i); return out; }

    // Diurnal traffic shape (share of requests by hour).
    var HOUR_W = [];
    for (var hh = 0; hh < 24; hh++) HOUR_W.push(0.35 + Math.max(0, Math.sin(Math.PI * (hh - 6) / 17)) + (hh >= 19 && hh <= 22 ? 0.35 : 0));
    var hourCum = [], hs = 0; HOUR_W.forEach(function (x) { hs += x; hourCum.push(hs); });

    function pickUser(x) {
      var target = x * acc, lo = 0, hi = cumAct.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cumAct[mid] < target) lo = mid + 1; else hi = mid; }
      return lo;
    }
    // Deterministic list of requests for a day. Request ids are unique per (day, i).
    function requestsForDay(day, n, stream) {
      stream = stream || 0;
      var out = [];
      for (var i = 0; i < n; i++) {
        var uid = pickUser(hashUnit(cfg.seed, 31, stream, day, i));
        var hx = hashUnit(cfg.seed, 32, stream, day, i) * hs, hour = 0;
        while (hour < 23 && hourCum[hour] < hx) hour++;
        var minute = hashUnit(cfg.seed, 33, stream, day, i);
        var device = hashUnit(cfg.seed, 34, stream, day, i) < 0.9 ? users[uid].device : 1 - users[uid].device;
        out.push({ id: day * 1000000 + stream * 100000 + i, day: day, hour: hour, t: day * 24 + hour + minute, user: uid, device: device, slots: cfg.slots });
      }
      out.sort(function (a, b) { return a.t - b.t; });
      return out;
    }

    // What a logging system could record about a request.
    function observe(req) {
      var us = users[req.user];
      return { user: req.user, age: us.age, country: us.country, device: req.device, hour: req.hour, day: req.day, history: history(req.user, req.day) };
    }

    // Sample what actually happens when ad `adId` is shown in slot `pos`.
    function outcome(req, adId, pos, stream) {
      var s = stream || 0, uid = req.user, ctx = req;
      var click = hashUnit(cfg.seed, 41, s, req.id, adId, pos) < pctr(uid, adId, ctx, pos) ? 1 : 0;
      var hide = !click && hashUnit(cfg.seed, 42, s, req.id, adId, pos) < phide(uid, adId, ctx, pos) ? 1 : 0;
      var conv = 0, convDelayH = null;
      if (click && hashUnit(cfg.seed, 43, s, req.id, adId) < pcvr(uid, adId, ctx)) {
        conv = 1;
        convDelayH = -Math.log(1 - hashUnit(cfg.seed, 44, s, req.id, adId)) * delayMeanH(adId);
      }
      var clickDelayS = click ? 2 + 40 * hashUnit(cfg.seed, 45, s, req.id, adId) : null;
      return { click: click, hide: hide, conv: conv, convDelayH: convDelayH, clickDelayS: clickDelayS };
    }

    var world = {
      version: VERSION,
      cfg: cfg,
      categories: CATEGORIES, ages: AGES, countries: COUNTRIES, devices: DEVICES,
      users: users, advertisers: advertisers, ads: ads,
      isActive: isActive, passesTargeting: passesTargeting, eligibleAds: eligibleAds, activeAds: activeAds,
      requestsForDay: requestsForDay, observe: observe, history: history, outcome: outcome,
      truth: {
        users: userTruth, ads: adTruth, advertisers: advTruth, categoryVectors: catVec,
        relevance: relevance, relevanceLogit: relevanceLogit, examine: examine,
        pctr: pctr, pcvr: pcvr, pcvrWithin: pcvrWithin, phide: phide,
        delayMeanH: delayMeanH, intentOf: intentOf, thetaAt: thetaAt, interestsAt: interestsAt,
        trend: trend, hourEffect: hourEffect, ageCat: AGE_CAT, deviceCat: DEVICE_CAT
      },
      // Everything needed to rebuild this world elsewhere (e.g. a Python track).
      exportJSON: function () {
        return JSON.stringify({ version: VERSION, cfg: cfg, categories: CATEGORIES, users: users, advertisers: advertisers, ads: ads,
          truth: { users: userTruth, ads: adTruth, advertisers: advTruth, categoryVectors: catVec, trendPhase: trendPhase, trendPeriod: trendPeriod, ageCat: AGE_CAT, deviceCat: DEVICE_CAT } });
      }
    };
    return world;
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  return {
    VERSION: VERSION, DEFAULTS: DEFAULTS, create: create,
    hashInts: hashInts, hashUnit: hashUnit, Rand: Rand, sigmoid: sigmoid, dot: dot
  };
});
