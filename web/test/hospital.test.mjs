import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peerBands, verdict, ordinal } from '../src/js/model.js';

const meta = { nm: 1, peerMedians: { 1: { AMI: 1, COPD: 1, HF: 1, PN: 1, CABG: 1, THA_TKA: 1 } } };
const mk = (id, err, n = 100) => ({ id, peer: 1, c: { HF: { n, err, flag: err > 1 ? 1 : 0, ratio: 0.05 } } });

test('peerBands gives the 10th-90th percentile ERR per peer group and condition', () => {
  const list = Array.from({ length: 11 }, (_, i) => mk(String(i), 0.9 + i * 0.02)); // 0.90 ... 1.10
  const b = peerBands(list);
  assert.ok(Math.abs(b[1].HF[0] - 0.92) < 1e-9);
  assert.ok(Math.abs(b[1].HF[1] - 1.08) < 1e-9);
  assert.equal(b[1].AMI, undefined);
});

test('peerBands ignores conditions under 25 cases', () => {
  const b = peerBands([mk('a', 2, 10), mk('b', 1, 30)]);
  assert.deepEqual(b[1].HF, [1, 1]);
});

test('verdict: penalized names the biggest contributor', () => {
  const h = { peer: 1, paf: 0.99, c: { HF: { n: 100, err: 1.2, flag: 1, ratio: 0.05 }, PN: { n: 100, err: 1.05, flag: 1, ratio: 0.05 }, AMI: { n: 40, err: 0.9, flag: 0, ratio: 0.02 } } };
  const v = verdict(h, meta);
  assert.deepEqual([v.status, v.top, v.nAbove, v.nMeasured], ['penalized', 'HF', 2, 3]);
});

test('verdict: no penalty because nothing reached 25 cases', () => {
  const v = verdict({ peer: 1, paf: 1, c: { HF: { n: 10, err: 1.3, flag: 0, ratio: 0.05 } } }, meta);
  assert.equal(v.status, 'none-measured');
});

test('verdict: no penalty because every measured condition was at or below median', () => {
  const v = verdict({ peer: 1, paf: 1, c: { HF: { n: 50, err: 0.95, flag: 0, ratio: 0.05 } } }, meta);
  assert.deepEqual([v.status, v.nMeasured], ['none-below', 1]);
});

test('beds: certified counts read plainly; only the cost-report fallback is marked', async () => {
  const { bedsLabel } = await import('../src/js/views/hospital.js');
  assert.equal(bedsLabel({ beds: 2059 }), '2,059 beds');
  assert.equal(bedsLabel({ beds: 25, bedsSrc: 'cr' }), '25 beds (cost report)');
  assert.equal(bedsLabel({ beds: null }), null);
});

test('inactive hospitals get a sentence naming the CCN, end date, and reason; the cut is mentioned only when there is one', async () => {
  const { inactiveSentence } = await import('../src/js/views/hospital.js');
  const D = { edition: { label: 'FY2027' } };
  const x = { id: '050001', red: 0.42, inactive: { date: '2025-03-31', reason: 'voluntary termination' } };
  assert.equal(inactiveSentence(D, x),
    'CMS lists this hospital\'s Medicare agreement under CCN 050001 as ended on March 31, 2025 (voluntary termination). It will not be paid under this ID in FY2027, so its cut is unlikely to be collected.');
  assert.equal(inactiveSentence(D, { ...x, red: 0 }),
    'CMS lists this hospital\'s Medicare agreement under CCN 050001 as ended on March 31, 2025 (voluntary termination). It will not be paid under this ID in FY2027.');
  assert.equal(inactiveSentence(D, { ...x, inactive: { date: null, reason: 'merger or closure' } }),
    'CMS lists this hospital\'s Medicare agreement under CCN 050001 as ended (merger or closure). It will not be paid under this ID in FY2027, so its cut is unlikely to be collected.');
});

test('the inactive tag tooltip omits a missing date', async () => {
  const { inactiveTitle } = await import('../src/js/views/columns.js');
  assert.equal(inactiveTitle({ inactive: { date: '2025-03-31' } }), 'CMS lists this hospital\'s Medicare agreement as ended on 2025-03-31');
  assert.equal(inactiveTitle({ inactive: { date: null } }), 'CMS lists this hospital\'s Medicare agreement as ended');
});

test('explorer text filter matches the alias', async () => {
  const { applyFilters } = await import('../src/js/model.js');
  const list = [{ id: '450100', name: 'Baylor Scott & White', alias: 'Hillcrest Baptist', city: 'Waco', st: 'TX' }, { id: '1', name: 'Other', city: 'Waco', st: 'TX' }];
  assert.deepEqual(applyFilters(list, { text: 'hillcrest' }).map((x) => x.id), ['450100']);
});

test('ordinal suffixes', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
});

test('isMeasured, cutPct, condState, PEERS', async () => {
  const { isMeasured, cutPct, condState, PEERS, slug } = await import('../src/js/model.js');
  assert.equal(isMeasured({ n: 25, err: 1 }), true);
  assert.equal(isMeasured({ n: 24, err: 1 }), false);
  assert.equal(isMeasured(undefined), false);
  assert.equal(cutPct(0.9886), 1.14);
  assert.equal(cutPct(1), 0);
  const h = { peer: 1, c: { HF: { n: 100, err: 1.2, flag: 1, ratio: 0.05 }, PN: { n: 100, err: 0.9, flag: 0, ratio: 0.05 }, AMI: { n: 5, err: 1.3, flag: 0, ratio: 0.01 } } };
  assert.deepEqual(['HF', 'PN', 'AMI', 'CABG'].map((k) => condState(h, k, meta)), ['counted', 'below', 'few', 'none']);
  assert.deepEqual(PEERS, [1, 2, 3, 4, 5]);
  assert.equal(slug('South Atlantic'), 'south-atlantic');
});
