import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONDS, contrib, summarize, percentileRank, scopeFilter, applyFilters, bedBand,
  fmtPct, fmtMoney, fmtInt, toCSV,
} from '../src/js/model.js';

// CMS methodology infographic, Hospital A (peer group 4, NM 0.9458)
const META_A = { nm: 0.9458, peerMedians: { 4: { AMI: 0.9970, COPD: 0.9954, HF: 1.0077, PN: 1.0021, CABG: 1.0093, THA_TKA: 1.0073 } } };
const HOSP_A = {
  peer: 4, paf: 0.9966,
  c: {
    AMI: { n: 42, err: 1.0259, flag: 1, ratio: 0.0648 },
    COPD: { n: 38, err: 1.0476, flag: 1, ratio: 0.0331 },
    HF: { n: 22, err: 1.0783, flag: 0, ratio: 0.05 },
    PN: { n: 23, err: 1.0007, flag: 0, ratio: 0.07 },
    CABG: { n: 25, err: 0.9439, flag: 0, ratio: 0.02 },
  },
};

test('reproduces the CMS worked example (0.34%)', () => {
  const r = contrib(HOSP_A, META_A);
  assert.equal(r.paf, 0.9966);
  assert.ok(Math.abs(r.byCond.AMI - 0.9458 * 0.0648 * (1.0259 - 0.997)) < 1e-12);
  assert.equal(r.byCond.HF, 0, 'fewer than 25 discharges never contributes');
  assert.equal(r.byCond.THA_TKA, 0, 'missing condition contributes 0');
});

test('what-if: bringing COPD to the peer median removes its contribution', () => {
  const base = contrib(HOSP_A, META_A);
  const r = contrib(HOSP_A, META_A, { COPD: 0.9954 });
  assert.equal(r.byCond.COPD, 0);
  assert.ok(r.reduction < base.reduction);
});

test('reduction is capped at 3%', () => {
  const h = { peer: 4, c: Object.fromEntries(CONDS.map((k) => [k, { n: 500, err: 1.6, flag: 1, ratio: 0.2 }])) };
  const r = contrib(h, META_A);
  assert.equal(r.reduction, 0.03);
  assert.equal(r.paf, 0.97);
});

test('browser formula reproduces CMS PAF for every FY2027 hospital', () => {
  const d = JSON.parse(readFileSync(new URL('../src/data/hrrp.json', import.meta.url)));
  const bad = d.hospitals.filter((h) => Math.abs(contrib(h, d.meta).paf - h.paf) > 1e-4 + 1e-12);
  assert.deepEqual(bad.map((h) => h.id), []);
});

test('summarize handles empty lists without NaN', () => {
  const s = summarize([]);
  for (const v of Object.values(s)) assert.ok(Number.isFinite(v), JSON.stringify(s));
  assert.equal(s.n, 0);
});

test('summarize counts penalties, cap, and dollars', () => {
  const list = [
    { paf: 1, red: 0, pen: 0, base: 100 },
    { paf: 0.99, red: 1, pen: 10, base: 1000 },
    { paf: 0.97, red: 3, pen: 30, base: 1000 },
    { paf: 0.998, red: 0.2, pen: null, base: null },
  ];
  const s = summarize(list);
  assert.deepEqual([s.n, s.nPen, s.nMax, s.nGe1, s.penTotal, s.baseTotal], [4, 3, 1, 2, 40, 2100]);
  assert.equal(s.pctPen, 75);
  assert.ok(Math.abs(s.meanRed - 1.05) < 1e-9);
  assert.ok(Math.abs(s.meanRedPen - 1.4) < 1e-9);
});

test('percentileRank is the share of values strictly below', () => {
  assert.equal(percentileRank([0, 0, 1, 2], 1), 50);
  assert.equal(percentileRank([0, 0, 1, 2], 0), 0);
  assert.equal(percentileRank([], 1), 0);
});

test('scope filters match state, metro, division slug, region', () => {
  const h = { st: 'UT', cbsa: '41620', division: 'Mountain', region: 'West' };
  assert.ok(scopeFilter({ view: 'state', key: 'UT' })(h));
  assert.ok(scopeFilter({ view: 'metro', key: '41620' })(h));
  assert.ok(scopeFilter({ view: 'division', key: 'mountain' })(h));
  assert.ok(scopeFilter({ view: 'region', key: 'west' })(h));
  assert.ok(!scopeFilter({ view: 'state', key: 'CA' })(h));
  assert.ok(scopeFilter({ view: 'home' })(h));
});

test('explorer filters combine', () => {
  const list = [
    { id: 'a', name: 'Alpha General', city: 'Provo', st: 'UT', paf: 0.99, peer: 1, teach: 'none', beds: 50, urban: false, c: { HF: { flag: 1 } } },
    { id: 'b', name: 'Beta Medical', city: 'Ogden', st: 'UT', paf: 1, peer: 2, teach: 'major', beds: 600, urban: true, c: {} },
  ];
  assert.deepEqual(applyFilters(list, { penalized: true }).map((h) => h.id), ['a']);
  assert.deepEqual(applyFilters(list, { cond: 'HF' }).map((h) => h.id), ['a']);
  assert.deepEqual(applyFilters(list, { beds: '500+', urban: true }).map((h) => h.id), ['b']);
  assert.deepEqual(applyFilters(list, { text: 'ogd' }).map((h) => h.id), ['b']);
  assert.deepEqual(applyFilters([...list, { ...list[0], id: 'c', st: 'ID' }], { st: 'ID' }).map((h) => h.id), ['c']);
  assert.equal(bedBand(99), '<100');
  assert.equal(bedBand(null), null);
});

test('formatters', () => {
  assert.equal(fmtPct(0.354), '0.35%');
  assert.equal(fmtPct(null), '—');
  assert.equal(fmtMoney(null), '—');
  assert.equal(fmtMoney(1234567), '$1.2M');
  assert.equal(fmtMoney(341_500_000), '$342M');
  assert.equal(fmtMoney(48210), '$48K');
  assert.equal(fmtMoney(950), '$950');
  assert.equal(fmtInt(2912), '2,912');
});

test('CSV quotes specials and neutralizes spreadsheet formulas in text', () => {
  const csv = toCSV(
    [{ name: 'He said "hi", ok', note: '=SUM(A1)', v: -1.5 }],
    [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }, { key: 'v', label: 'V' }],
  );
  assert.equal(csv, 'Name,Note,V\r\n"He said ""hi"", ok",\'=SUM(A1),-1.5\r\n');
});
