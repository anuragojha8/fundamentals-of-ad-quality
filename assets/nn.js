/* Fundamentals of Ad Quality — a tiny reverse-mode autodiff for small recsys models.
 *
 * Deliberately minimal: every value is a 1-D vector (Float64Array). Matrices only
 * exist as parameters and are used through matvec(). That's enough for embeddings,
 * towers (MLPs), DCN-style cross layers, target attention, and multi-task heads.
 *
 * Usage:
 *   const E = NN.embedding(nUsers, 8, rng), W = NN.param(4, 8, rng)
 *   const g = NN.graph()
 *   const z = g.dot(g.emb(E, u), g.emb(A, a))
 *   const loss = g.bceLogit(z, y)
 *   g.backward(loss); opt.step([E, A, W])
 *
 * No DOM access. UMD: window.NN in the browser, module.exports in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- parameters ---------------- */
  function Param(name, rows, cols, init) {
    this.name = name; this.rows = rows; this.cols = cols;
    this.data = new Float64Array(rows * cols);
    this.grad = new Float64Array(rows * cols);
    this.touched = null;       // Set of rows for sparse (embedding) params
    this.m = null; this.v = null; this.t = 0; // Adam state
    if (init) for (var i = 0; i < this.data.length; i++) this.data[i] = init(i);
  }
  function normalInit(rng, sd) { return function () { return rng.normal(0, sd); }; }

  function param(name, rows, cols, rng, sd) {
    return new Param(name, rows, cols, rng ? normalInit(rng, sd == null ? Math.sqrt(2 / (cols + rows)) : sd) : null);
  }
  function embedding(name, n, d, rng, sd) {
    var p = new Param(name, n, d, rng ? normalInit(rng, sd == null ? 0.05 : sd) : null);
    p.touched = new Set();
    return p;
  }
  function bias(name, n, value) {
    var p = new Param(name, n, 1, null);
    if (value) p.data.fill(value);
    return p;
  }

  /* ---------------- graph ---------------- */
  function Node(data, prev, back) { this.data = data; this.grad = null; this.prev = prev; this.back = back; }

  function graph() {
    var g = {};
    function node(data, prev, back) { return new Node(data, prev || [], back || null); }
    function G(n) { if (!n.grad) n.grad = new Float64Array(n.data.length); return n.grad; }

    g.const = function (arr) { return node(arr instanceof Float64Array ? arr : Float64Array.from(arr)); };

    g.emb = function (P, row) {
      var d = P.cols, off = row * d, out = new Float64Array(d);
      for (var i = 0; i < d; i++) out[i] = P.data[off + i];
      var n = node(out, [], function () {
        if (!n.grad) return;
        for (var i = 0; i < d; i++) P.grad[off + i] += n.grad[i];
        if (P.touched) P.touched.add(row);
      });
      return n;
    };
    g.vec = function (P) { // whole parameter as a vector (e.g. a bias)
      var out = Float64Array.from(P.data);
      var n = node(out, [], function () { if (n.grad) for (var i = 0; i < out.length; i++) P.grad[i] += n.grad[i]; });
      return n;
    };
    g.matvec = function (W, x) {
      var R = W.rows, C = W.cols, out = new Float64Array(R);
      for (var r = 0; r < R; r++) { var s = 0, o = r * C; for (var c = 0; c < C; c++) s += W.data[o + c] * x.data[c]; out[r] = s; }
      var n = node(out, [x], function () {
        if (!n.grad) return;
        var gx = G(x);
        for (var r = 0; r < R; r++) {
          var gr = n.grad[r]; if (gr === 0) continue; var o = r * C;
          for (var c = 0; c < C; c++) { W.grad[o + c] += gr * x.data[c]; gx[c] += gr * W.data[o + c]; }
        }
      });
      return n;
    };
    g.add = function (a, b) {
      var L = a.data.length, out = new Float64Array(L);
      for (var i = 0; i < L; i++) out[i] = a.data[i] + b.data[i];
      var n = node(out, [a, b], function () {
        if (!n.grad) return; var ga = G(a), gb = G(b);
        for (var i = 0; i < L; i++) { ga[i] += n.grad[i]; gb[i] += n.grad[i]; }
      });
      return n;
    };
    g.addAll = function (list) { var acc = list[0]; for (var i = 1; i < list.length; i++) acc = g.add(acc, list[i]); return acc; };
    g.mul = function (a, b) {
      var L = a.data.length, out = new Float64Array(L);
      for (var i = 0; i < L; i++) out[i] = a.data[i] * b.data[i];
      var n = node(out, [a, b], function () {
        if (!n.grad) return; var ga = G(a), gb = G(b);
        for (var i = 0; i < L; i++) { ga[i] += n.grad[i] * b.data[i]; gb[i] += n.grad[i] * a.data[i]; }
      });
      return n;
    };
    g.scale = function (a, s) {
      var L = a.data.length, out = new Float64Array(L);
      for (var i = 0; i < L; i++) out[i] = a.data[i] * s;
      var n = node(out, [a], function () { if (!n.grad) return; var ga = G(a); for (var i = 0; i < L; i++) ga[i] += n.grad[i] * s; });
      return n;
    };
    g.relu = function (a) {
      var L = a.data.length, out = new Float64Array(L);
      for (var i = 0; i < L; i++) out[i] = a.data[i] > 0 ? a.data[i] : 0;
      var n = node(out, [a], function () { if (!n.grad) return; var ga = G(a); for (var i = 0; i < L; i++) if (a.data[i] > 0) ga[i] += n.grad[i]; });
      return n;
    };
    g.sigmoid = function (a) {
      var L = a.data.length, out = new Float64Array(L);
      for (var i = 0; i < L; i++) out[i] = 1 / (1 + Math.exp(-a.data[i]));
      var n = node(out, [a], function () { if (!n.grad) return; var ga = G(a); for (var i = 0; i < L; i++) ga[i] += n.grad[i] * out[i] * (1 - out[i]); });
      return n;
    };
    g.concat = function (list) {
      var L = 0; list.forEach(function (x) { L += x.data.length; });
      var out = new Float64Array(L), o = 0;
      list.forEach(function (x) { out.set(x.data, o); o += x.data.length; });
      var n = node(out, list, function () {
        if (!n.grad) return; var o = 0;
        list.forEach(function (x) { var gx = G(x); for (var i = 0; i < x.data.length; i++) gx[i] += n.grad[o + i]; o += x.data.length; });
      });
      return n;
    };
    g.dot = function (a, b) {
      var L = a.data.length, s = 0;
      for (var i = 0; i < L; i++) s += a.data[i] * b.data[i];
      var n = node(Float64Array.of(s), [a, b], function () {
        if (!n.grad) return; var gs = n.grad[0], ga = G(a), gb = G(b);
        for (var i = 0; i < L; i++) { ga[i] += gs * b.data[i]; gb[i] += gs * a.data[i]; }
      });
      return n;
    };
    g.sum = function (a) {
      var s = 0; for (var i = 0; i < a.data.length; i++) s += a.data[i];
      var n = node(Float64Array.of(s), [a], function () { if (!n.grad) return; var ga = G(a); for (var i = 0; i < a.data.length; i++) ga[i] += n.grad[0]; });
      return n;
    };
    g.softmax = function (a) {
      var L = a.data.length, mx = -Infinity, i;
      for (i = 0; i < L; i++) if (a.data[i] > mx) mx = a.data[i];
      var out = new Float64Array(L), s = 0;
      for (i = 0; i < L; i++) { out[i] = Math.exp(a.data[i] - mx); s += out[i]; }
      for (i = 0; i < L; i++) out[i] /= s;
      var n = node(out, [a], function () {
        if (!n.grad) return; var ga = G(a), d = 0, i;
        for (i = 0; i < L; i++) d += n.grad[i] * out[i];
        for (i = 0; i < L; i++) ga[i] += out[i] * (n.grad[i] - d);
      });
      return n;
    };
    // Weighted sum of vectors: sum_i w[i] * vs[i]; w is a node of length vs.length.
    g.wsum = function (vs, w) {
      var d = vs[0].data.length, out = new Float64Array(d);
      for (var k = 0; k < vs.length; k++) for (var i = 0; i < d; i++) out[i] += w.data[k] * vs[k].data[i];
      var n = node(out, vs.concat([w]), function () {
        if (!n.grad) return; var gw = G(w);
        for (var k = 0; k < vs.length; k++) {
          var gv = G(vs[k]), s = 0;
          for (var i = 0; i < d; i++) { gv[i] += w.data[k] * n.grad[i]; s += vs[k].data[i] * n.grad[i]; }
          gw[k] += s;
        }
      });
      return n;
    };
    g.mean = function (vs) { return g.scale(g.addAll(vs), 1 / vs.length); };
    // Target attention (DIN-style): weights = softmax(<h_i, q> / sqrt(d)), output = sum w_i h_i.
    // temp (optional): a length-1 node, a learnable sharpness multiplier on the scores.
    g.attend = function (hs, q, temp) {
      var scores = g.concat(hs.map(function (h) { return g.dot(h, q); }));
      if (temp) scores = g.mul(scores, g.concat(hs.map(function () { return temp; })));
      var w = g.softmax(g.scale(scores, 1 / Math.sqrt(q.data.length)));
      return { out: g.wsum(hs, w), weights: w };
    };
    // DCN-v2 cross layer: x_{l+1} = x0 * (W x_l + b) + x_l
    g.cross = function (x0, xl, W, b) { return g.add(g.mul(x0, g.add(g.matvec(W, xl), g.vec(b))), xl); };
    g.dense = function (x, W, b, act) { var h = g.add(g.matvec(W, x), g.vec(b)); return act === 'relu' ? g.relu(h) : h; };

    /* ---------- losses (return length-1 nodes) ---------- */
    // Binary cross-entropy on a logit z (numerically stable).
    g.bceLogit = function (z, y, weight) {
      var x = z.data[0], wt = weight == null ? 1 : weight;
      var l = (Math.max(x, 0) - x * y + Math.log(1 + Math.exp(-Math.abs(x)))) * wt;
      var p = 1 / (1 + Math.exp(-x));
      var n = node(Float64Array.of(l), [z], function () { G(z)[0] += n.grad[0] * (p - y) * wt; });
      return n;
    };
    // Binary cross-entropy on a probability node p (used by ESMM, where p = pCTR * pCVR).
    g.bceProb = function (pn, y, weight) {
      var p = Math.min(Math.max(pn.data[0], 1e-7), 1 - 1e-7), wt = weight == null ? 1 : weight;
      var n = node(Float64Array.of(-(y * Math.log(p) + (1 - y) * Math.log(1 - p)) * wt), [pn], function () {
        G(pn)[0] += n.grad[0] * wt * (-(y / p) + (1 - y) / (1 - p));
      });
      return n;
    };
    // Squared error on a probability p = sigmoid(z).
    g.mseProb = function (z, y) {
      var p = 1 / (1 + Math.exp(-z.data[0]));
      var n = node(Float64Array.of((p - y) * (p - y)), [z], function () { G(z)[0] += n.grad[0] * 2 * (p - y) * p * (1 - p); });
      return n;
    };
    // Poisson negative log-likelihood with rate = exp(z): rate - y*z.
    g.poisson = function (z, y) {
      var rate = Math.exp(z.data[0]);
      var n = node(Float64Array.of(rate - y * z.data[0]), [z], function () { G(z)[0] += n.grad[0] * (rate - y); });
      return n;
    };
    // Pairwise logistic (RankNet / AUC surrogate): log(1 + exp(-(zPos - zNeg))).
    g.pairwise = function (zPos, zNeg) {
      var d = zPos.data[0] - zNeg.data[0];
      var l = Math.max(-d, 0) + Math.log(1 + Math.exp(-Math.abs(d)));
      var s = 1 / (1 + Math.exp(d)); // = -dl/dd
      var n = node(Float64Array.of(l), [zPos, zNeg], function () { G(zPos)[0] -= n.grad[0] * s; G(zNeg)[0] += n.grad[0] * s; });
      return n;
    };
    // Softmax cross-entropy over a list of logits; target index t.
    g.softmaxCE = function (logits, t) {
      var sm = g.softmax(logits);
      var p = Math.max(sm.data[t], 1e-12);
      var n = node(Float64Array.of(-Math.log(p)), [sm], function () { G(sm)[t] += -n.grad[0] / p; });
      return n;
    };

    g.backward = function (out) {
      var order = [], seen = new Set();
      (function visit(v) {
        if (seen.has(v)) return; seen.add(v);
        for (var i = 0; i < v.prev.length; i++) visit(v.prev[i]);
        order.push(v);
      })(out);
      out.grad = new Float64Array(out.data.length).fill(1);
      for (var i = order.length - 1; i >= 0; i--) if (order[i].back) order[i].back();
    };
    return g;
  }

  /* ---------------- optimizers ---------------- */
  // Adam with lazy (sparse) updates for embedding tables.
  function adam(opts) {
    opts = opts || {};
    var lr = opts.lr || 0.01, b1 = opts.beta1 || 0.9, b2 = opts.beta2 || 0.999, eps = 1e-8, l2 = opts.l2 || 0;
    function upd(P, i) {
      var gi = P.grad[i] + l2 * P.data[i];
      P.m[i] = b1 * P.m[i] + (1 - b1) * gi;
      P.v[i] = b2 * P.v[i] + (1 - b2) * gi * gi;
      var mh = P.m[i] / (1 - Math.pow(b1, P.t)), vh = P.v[i] / (1 - Math.pow(b2, P.t));
      P.data[i] -= lr * mh / (Math.sqrt(vh) + eps);
      P.grad[i] = 0;
    }
    return {
      setLr: function (x) { lr = x; },
      step: function (params, scale) {
        params.forEach(function (P) {
          if (!P.m) { P.m = new Float64Array(P.data.length); P.v = new Float64Array(P.data.length); }
          P.t++;
          if (scale && scale !== 1) for (var j = 0; j < P.grad.length; j++) P.grad[j] *= scale;
          if (P.touched) {
            P.touched.forEach(function (row) { for (var c = 0; c < P.cols; c++) upd(P, row * P.cols + c); });
            P.touched.clear();
          } else for (var i = 0; i < P.data.length; i++) upd(P, i);
        });
      }
    };
  }
  function sgd(opts) {
    var lr = (opts && opts.lr) || 0.05;
    return {
      setLr: function (x) { lr = x; },
      step: function (params, scale) {
        var s = scale || 1;
        params.forEach(function (P) {
          if (P.touched) {
            P.touched.forEach(function (row) { for (var c = 0; c < P.cols; c++) { var i = row * P.cols + c; P.data[i] -= lr * s * P.grad[i]; P.grad[i] = 0; } });
            P.touched.clear();
          } else for (var i = 0; i < P.data.length; i++) { P.data[i] -= lr * s * P.grad[i]; P.grad[i] = 0; }
        });
      }
    };
  }

  /* ---------------- (de)serialization ---------------- */
  function toB64(f64) {
    var f32 = Float32Array.from(f64), bytes = new Uint8Array(f32.buffer), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }
  function fromB64(str) {
    var s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return Float64Array.from(new Float32Array(bytes.buffer));
  }
  function serialize(params) {
    var out = {};
    params.forEach(function (P) { out[P.name] = { rows: P.rows, cols: P.cols, b64: toB64(P.data) }; });
    return out;
  }
  function restore(params, saved) {
    params.forEach(function (P) {
      var s = saved && saved[P.name];
      if (s && s.rows === P.rows && s.cols === P.cols) P.data.set(fromB64(s.b64));
    });
  }
  function copyInto(dst, src) { dst.data.set(src.data); }

  return {
    Param: Param, param: param, embedding: embedding, bias: bias, graph: graph,
    adam: adam, sgd: sgd, serialize: serialize, restore: restore, toB64: toB64, fromB64: fromB64, copyInto: copyInto
  };
});
