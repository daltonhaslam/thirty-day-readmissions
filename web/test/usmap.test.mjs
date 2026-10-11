import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS } from '../src/js/charts/usmap.js';
import { fmtPct, fmtMoney } from '../src/js/model.js';

test('map color bins on the rounded value that is displayed', () => {
  // 0.2495 prints as 0.25%, so it takes the 0.25-0.34% color, not "under 0.25%".
  assert.equal(fmtPct(0.2495), '0.25%');
  assert.equal(METRICS.avg.cls(0.2495), 'p2');
  assert.equal(METRICS.avg.cls(0.2449), 'p1');
  assert.equal(METRICS.pct.cls(69.6), 'p2'); // shows 70%
  assert.equal(METRICS.pct.cls(69.4), 'p1');
  assert.equal(fmtMoney(1_960_000), '$2.0M');
  assert.equal(METRICS.dollars.cls(1_960_000), 'p2');
  assert.equal(METRICS.dollars.cls(1_940_000), 'p1');
});
