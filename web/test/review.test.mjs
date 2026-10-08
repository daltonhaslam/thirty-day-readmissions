import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatIfPaf, sliderRange, rankPct, inSentence, vsLabel, binIndex } from '../src/js/model.js';

const meta = { nm: 1, peerMedians: { 1: { AMI: 1, COPD: 1, HF: 1, PN: 1, CABG: 1, THA_TKA: 1 } } };

test('whatIfPaf: unchanged sliders return CMS factor; all at median returns 1 even with an unmodelable residual', () => {
  // HF counted with a weight; THA flagged by CMS but no published weight (residual CMS cut we cannot recompute)
  const h = { peer: 1, paf: 0.9888, c: { HF: { n: 100, err: 1.1, flag: 1, ratio: 0.1 }, THA_TKA: { n: 40, err: 1.2, flag: 1, ratio: null } } };
  assert.equal(whatIfPaf(h, meta, {}), 0.9888);
  assert.equal(whatIfPaf(h, meta, { HF: 1, THA_TKA: 1 }), 1);
  assert.ok(whatIfPaf(h, meta, { HF: 1.05 }) > 0.9888);
});

test('sliderRange always contains the actual ratio with room to move both ways', () => {
  assert.deepEqual(sliderRange(1.02), [0.8, 1.25]);
  const [lo, hi] = sliderRange(1.401);
  assert.ok(lo <= 1.3 && hi >= 1.45);
  const [lo2] = sliderRange(0.5765);
  assert.ok(lo2 <= 0.52);
});

test('rankPct never claims 100% and floors', () => {
  const sorted = Array.from({ length: 1000 }, (_, i) => i / 1000);
  assert.equal(rankPct(sorted, 2), 99);
  assert.equal(rankPct(sorted, 0.5), 50);
  assert.equal(rankPct(sorted, 0.0005), 0);
});

test('inSentence keeps acronyms and lowercases words', () => {
  assert.equal(inSentence('COPD'), 'COPD');
  assert.equal(inSentence('Heart failure'), 'heart failure');
  assert.equal(inSentence('Hip/knee replacement'), 'hip/knee replacement');
});

test('vsLabel compares after rounding', () => {
  assert.equal(vsLabel(80.4, 80.15, 0, 'pts'), 'same as nation');
  assert.equal(vsLabel(0.164, 0.16, 2, 'pts'), 'same as nation');
  assert.equal(vsLabel(48, 80.15, 0, 'pts'), '−32 pts vs nation');
  assert.equal(vsLabel(0.4, 0.35, 2, 'pts'), '+0.05 pts vs nation');
});

test('binIndex puts threshold values in the upper bin despite floating point', () => {
  assert.equal(binIndex(0.25, 0.05), 5);
  assert.equal(binIndex(0.24, 0.05), 4);
  assert.equal(binIndex(1.0, 0.05), 20);
  assert.equal(binIndex(0.29, 0.01), 29);
});
