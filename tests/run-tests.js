/* End-to-end checks for the book's engine. Run: node tests/run-tests.js [--quick]
 * 1. Every reference solution passes its own slot tests; every starter compiles.
 * 2. The pipeline runs: simulate → join → train → evaluate, with sanity bounds on
 *    the numbers the chapters rely on (AUC ranges, calibration, recall, etc.). */
'use strict';
const path = require('path');
const World = require(path.join(__dirname, '../assets/world.js'));
const Stack = require(path.join(__dirname, '../assets/stack.js'));
const quick = process.argv.includes('--quick');

let failures = 0;
function expect(name, ok, detail) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}
const f3 = x => (typeof x === 'number' ? x.toFixed(3) : String(x));
const time = async (label, fn) => { const t = Date.now(); const r = await fn(); console.log('    (' + label + ': ' + ((Date.now() - t) / 1000).toFixed(1) + 's)'); return r; };

(async function main() {
  console.log('\n[0] Chapter scripts parse');
  const fs = require('fs'), dir = path.join(__dirname, '../chapters');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8'), re = /<script>([\s\S]*?)<\/script>/g;
    let m, err = null;
    while ((m = re.exec(src))) { try { new Function(m[1]); } catch (e) { err = e.message; } }
    if (err) expect(`${f}: inline scripts parse`, false, err);
  }
  expect('All chapter scripts parse', failures === 0);

  console.log('\n[1] Code slots');
  for (const id of Object.keys(Stack.SLOTS)) {
    const def = Stack.SLOTS[id];
    const ref = Stack.runTests(id, def.reference);
    expect(`${id}: reference passes (${ref.results.filter(r => !r.info).length} tests)`, ref.ok, ref.ok ? '' : JSON.stringify(ref.results.filter(r => !r.pass && !r.info)));
    let compiles = true;
    try { Stack.compile(id, def.starter); } catch (e) { compiles = false; }
    const st = Stack.runTests(id, def.starter);
    expect(`${id}: starter compiles and is not already passing`, compiles && !st.ok);
  }

  // Match the reference solution's Ch. 5 decision (10% exploration). Without exploration the
  // LR loses online to the heuristic: that's the book's deliberate exposure-bias storyline.
  Stack.state.settings.epsilon = 0.1;
  console.log('\n[2] Heuristic production logs (days 0–9)');
  const tl = await time('simulate 60k requests', () => Stack.trainingLog());
  const s = tl.summary;
  console.log(`    imps ${s.impressions}  CTR ${(100 * s.ctr).toFixed(2)}%  RPM $${s.rpm.toFixed(2)}  fill ${(100 * s.fill).toFixed(0)}%  cands/req ${(s.candidates / s.requests).toFixed(0)}`);
  expect('CTR in a realistic range (1–8%)', s.ctr > 0.01 && s.ctr < 0.08, (100 * s.ctr).toFixed(2) + '%');
  const rows = await time('join', () => Stack.labeledRows(tl));
  expect('Join yields one row per impression', rows.length === tl.impressions.length);
  const clicks = rows.reduce((a, r) => a + r.click, 0), convs = rows.reduce((a, r) => a + r.conv, 0);
  console.log(`    clicks ${clicks}  convs ${convs}  post-click CVR ${(100 * convs / clicks).toFixed(1)}%`);
  expect('Enough conversions to learn from (> 400)', convs > 400, String(convs));

  const ev = await time('eval log (day 10)', () => Stack.evalLog());
  const erows = Stack.labeledRows(ev);
  const ey = erows.map(r => r.click), et = ev.truth.map(t => t.pctr);
  const ex = Stack.world().cfg.examine;
  const heur = Stack.evaluate(ev.impressions.map(i => i.pctr * ex[i.slot]), ey, et);
  console.log(`    heuristic: AUC ${f3(heur.auc)}  NE ${f3(heur.ne)}  calib ${f3(heur.calibration)}  oracle AUC ${f3(heur.oracleAuc)}`);
  expect('Oracle AUC in 0.78–0.88', heur.oracleAuc > 0.78 && heur.oracleAuc < 0.88, f3(heur.oracleAuc));
  expect('Heuristic AUC in 0.58–0.70', heur.auc > 0.58 && heur.auc < 0.7, f3(heur.auc));

  console.log('\n[3] Logistic regression');
  const lr = await time('train LR (2 epochs)', () => Stack.trainLR({ rows, epochs: 2, lr: 0.05 }));
  const lrm = Stack.evaluate(Stack.lrPredictRows(lr, erows), ey, et);
  console.log(`    LR: AUC ${f3(lrm.auc)}  NE ${f3(lrm.ne)}  calib ${f3(lrm.calibration)}  corr w/ truth ${f3(lrm.corrWithTruth)}`);
  expect('LR AUC in 0.70–0.80', lrm.auc > 0.7 && lrm.auc < 0.8, f3(lrm.auc));
  expect('LR calibration within 15%', Math.abs(lrm.calibration - 1) < 0.15, f3(lrm.calibration));
  expect('LR beats heuristic by > 0.05 AUC', lrm.auc > heur.auc + 0.05);
  if (!quick) {
    for (const loss of ['mse', 'poisson', 'pairwise']) {
      const m = await Stack.trainLR({ rows, epochs: 2, lr: loss === 'mse' ? 0.5 : 0.05, loss });
      const e = Stack.evaluate(Stack.lrPredictRows(m, erows), ey, et);
      console.log(`    ${loss.padEnd(8)}: AUC ${f3(e.auc)}  NE ${f3(e.ne)}  calib ${f3(e.calibration)}`);
    }
  }
  Stack.putModel('lr', lr, { source: 'test' });

  console.log('\n[4] A/B test: heuristic vs LR');
  const ab = await time('A/B', () => Stack.abTest({ control: { ranker: 'heuristic' }, treatment: { ranker: 'lr' } }));
  const d = ab.diffs;
  const pc = x => (100 * x).toFixed(1) + '%';
  console.log(`    RPM lift ${pc(d.rpm.lift)} [${pc(d.rpm.lo)}, ${pc(d.rpm.hi)}]  true RPM lift ${pc(d.trueRpm.lift)}  CTR lift ${pc(d.ctr.lift)} [${pc(d.ctr.lo)}, ${pc(d.ctr.hi)}]  adv value lift ${pc(d.value.lift)}  true value lift ${pc(d.trueValue.lift)}`);
  expect('LR raises true expected revenue', d.trueRpm.lift > 0);

  if (!quick) {
    console.log('\n[5] Two-tower retrieval (recall@30 of the true top-10)');
    const w = Stack.world(), topK = Stack.impl('topK'), H = Stack.impl('heuristicPCTR'), pr = Stack.prior();
    const byScore = (f) => (uv, el, K) => el.map(a => [a, f(uv, a)]).sort((x, y) => y[1] - x[1]).slice(0, K).map(x => x[0]);
    const rnd = Stack.retrievalRecall((uv, el, K) => el.slice(0, K));
    const heurR = Stack.retrievalRecall(byScore((uv, a) => H(w.ads[a], uv, pr)));
    const tt = await time('train two-tower (logged clicks)', () => Stack.trainTwoTower({ rows }));
    const ttScore = m => (uv, el, K) => { const u = m.userVec(uv), av = m.adVecs(); return topK(u, el.map(a => ({ id: a, vec: av[a] })), K); };
    const ttR = Stack.retrievalRecall(ttScore(tt));
    const ttB = await Stack.trainTwoTower({ rows, objective: 'bce', negatives: 2, epochs: 1 });
    const ttBR = Stack.retrievalRecall(ttScore(ttB));
    const ttU = await time('train two-tower (unbiased)', () => Stack.trainTwoTower({ rows: Stack.unbiasedClicks(clicks, [0,1,2,3,4,5,6,7,8,9]) }));
    const ttUR = Stack.retrievalRecall(ttScore(ttU));
    console.log(`    random ${f3(rnd)}  heuristic ${f3(heurR)}  two-tower BCE ${f3(ttBR)}  two-tower softmax ${f3(ttR)}  two-tower on unbiased data ${f3(ttUR)}`);
    expect('Softmax two-tower beats random by 2x', ttR > 2 * rnd);
    expect('Softmax beats BCE-on-impressions', ttR > ttBR);
    expect('Unbiased data beats the heuristic', ttUR > heurR);
    Stack.putModel('twotower', tt, { source: 'test' });

    console.log('\n[6] Deep ranker (cross + attention)');
    for (const cfg of [{ cross: 0, attention: false }, { cross: 1, attention: true }]) {
      const dm = await time('train deep ' + JSON.stringify(cfg), () => Stack.trainDeep(Object.assign({ rows, epochs: 1 }, cfg)));
      const dp = ev.impressions.map(imp => { const z = Math.log(dm.pctr(imp.uv, imp.ad)) - Math.log(1 - dm.pctr(imp.uv, imp.ad)); return Stack.sigmoid(z + dm.P.slotB.data[imp.slot] - dm.P.slotB.data[0]); });
      const de = Stack.evaluate(dp, ey, et);
      console.log(`    deep ${JSON.stringify(cfg)}: AUC ${f3(de.auc)}  NE ${f3(de.ne)}  calib ${f3(de.calibration)}`);
    }

    console.log('\n[7] Conversion models vs truth (impression space)');
    const tcv = ev.truth.map(t => t.pcvr);
    for (const method of ['naive', 'esmm']) {
      const m = await Stack.trainCVR({ rows, method });
      const p = Stack.cvrPredictRows(m, erows);
      console.log(`    ${method}: mean pred ${f3(Stack.mean(p))} vs true ${f3(Stack.mean(tcv))}  pairAcc ${f3(Stack.pairOrderAcc(p, tcv))}`);
    }

    console.log('\n[8] Drift: stale LR (days 0–9) vs fresh LR (previous 10 days), same eval day');
    for (const day of [11, 30, 50, 75]) {
      const pol = Stack.policy({ ranker: 'heuristic' });
      const prev = await Stack.simulate({ days: Array.from({ length: 10 }, (_, i) => day - 10 + i), requestsPerDay: 6000, stream: 0, policy: pol });
      const fresh = await Stack.trainLR({ rows: Stack.labeledRows(prev), epochs: 2 });
      const l = await Stack.simulate({ days: [day], requestsPerDay: 4000, stream: 2, policy: pol, stats: prev.stats });
      const r2 = Stack.labeledRows(l), y2 = r2.map(r => r.click), t2 = l.truth.map(t => t.pctr);
      const eS = Stack.evaluate(Stack.lrPredictRows(lr, r2), y2, t2), eF = Stack.evaluate(Stack.lrPredictRows(fresh, r2), y2, t2);
      console.log(`    day ${String(day).padStart(2)}: stale AUC ${f3(eS.auc)} calib ${f3(eS.calibration)} | fresh AUC ${f3(eF.auc)} calib ${f3(eF.calibration)} | oracle ${f3(eS.oracleAuc)}`);
    }
  }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
