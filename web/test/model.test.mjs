import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONDS, contrib, summarize, percentileRank, scopeFilter, applyFilters, bedBand,
  fmtPct, fmtMoney, fmtInt, toCSV, noEstimateNote, roundTo, plural, upFirst, penalizedOfMeasured, noneMeasured,
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

test('summarize handles empty lists without NaN; share penalized is null with nothing measured', () => {
  const s = summarize([]);
  for (const [k, v] of Object.entries(s)) if (k !== 'pctPen') assert.ok(Number.isFinite(v), JSON.stringify(s));
  assert.equal(s.n, 0);
  assert.equal(s.pctPen, null);
});

const MEASURED = { HF: { n: 40, err: 1.1 } };
test('summarize counts penalties, cap, and dollars', () => {
  const list = [
    { paf: 1, red: 0, pen: 0, base: 100, c: MEASURED },
    { paf: 0.99, red: 1, pen: 10, base: 1000, c: MEASURED },
    { paf: 0.97, red: 3, pen: 30, base: 1000, c: MEASURED },
    { paf: 0.998, red: 0.2, pen: null, base: null, c: MEASURED },
  ];
  const s = summarize(list);
  assert.deepEqual([s.n, s.nPen, s.nMeasured, s.nMax, s.nGe1, s.penTotal, s.baseTotal], [4, 3, 4, 1, 2, 40, 2100]);
  assert.equal(s.pctPen, 75);
  assert.ok(Math.abs(s.meanRed - 1.05) < 1e-9);
  assert.ok(Math.abs(s.meanRedPen - 1.4) < 1e-9);
});

test('summarize: share penalized is of hospitals measured on at least one condition', () => {
  const list = [
    { red: 0.5, c: MEASURED },
    { red: 0, c: { HF: { n: 40, err: 0.9 }, AMI: { n: 10, err: 1.2 } } },
    { red: 0, c: { HF: { n: 24, err: 1.3 } } }, // under 25 cases: not measured
    { red: 0, c: { PN: { n: 80, err: null } } }, // no published ratio: not measured
    { red: 0 }, // no conditions at all
  ];
  const s = summarize(list);
  assert.deepEqual([s.n, s.nPen, s.nMeasured], [5, 1, 2]);
  assert.equal(s.pctPen, 50);
  const none = summarize([{ red: 0, c: {} }, { red: 0, c: { HF: { n: 24, err: 1.3 } } }]);
  assert.deepEqual([none.n, none.nMeasured, none.pctPen], [2, 0, null]);
  assert.equal(fmtPct(none.pctPen, 0), '—');
  assert.equal(penalizedOfMeasured(none), 'none measured on any condition');
});

test('one "none measured" wording for the map tooltip, the area deck, and the type-of-hospital figure', async () => {
  const { deckShare } = await import('../src/js/views/scope.js');
  const { typeNote } = await import('../src/js/views/national.js');
  const none = summarize([{ red: 0, c: {} }, { red: 0, c: { HF: { n: 24, err: 1.3 } } }]);
  const one = summarize([{ red: 0, c: {} }]);
  assert.deepEqual([noneMeasured(none), noneMeasured(one)], ['none measured on any condition', 'not measured on any condition']);
  assert.equal(deckShare(none), 'none measured on any condition');
  assert.equal(deckShare(one), 'it is not measured on any condition');
  assert.equal(typeNote(none), '2 hospitals · none measured on any condition');
  assert.equal(typeNote(one), '1 hospital · not measured on any condition');
  const some = summarize([{ red: 0.2, c: MEASURED }, { red: 0, c: MEASURED }]);
  assert.equal(deckShare(some), '50% of the 2 measured on at least one condition');
  assert.equal(typeNote(some), '2 hospitals · 50% of measured penalized');
});

test('area deck lead: a whole sentence whose verb agrees, including a one-hospital area', async () => {
  const { deckLead } = await import('../src/js/views/scope.js');
  const lead = (list) => deckLead(summarize(list), 'FY2027');
  assert.equal(lead([{ red: 0, c: {} }]), '0 of 1 hospital takes a cut in FY2027: it is not measured on any condition.');
  assert.equal(lead([{ red: 0.2, c: MEASURED }]), '1 of 1 hospital takes a cut in FY2027: 100% of the 1 measured on at least one condition.');
  assert.equal(lead([{ red: 0, c: MEASURED }]), '0 of 1 hospital takes a cut in FY2027: 0% of the 1 measured on at least one condition.');
  assert.equal(lead([{ red: 0, c: {} }, { red: 0, c: {} }]), '0 of 2 hospitals take a cut in FY2027: none measured on any condition.');
  assert.equal(lead([{ red: 0.2, c: MEASURED }, { red: 0, c: MEASURED }]), '1 of 2 hospitals takes a cut in FY2027: 50% of the 2 measured on at least one condition.');
  assert.equal(lead([{ red: 0.2, c: MEASURED }, { red: 0.1, c: MEASURED }]), '2 of 2 hospitals take a cut in FY2027: 100% of the 2 measured on at least one condition.');
});

test('scope KPI: an all-unmeasured area shows no share and skips the comparison with the nation', async () => {
  const { penalizedNote } = await import('../src/js/views/scope.js');
  const nation = summarize([{ red: 0.5, c: MEASURED }, { red: 0, c: MEASURED }]);
  assert.equal(penalizedNote(summarize([{ red: 0, c: {} }]), nation), 'of 0 measured');
  assert.equal(penalizedNote(summarize([{ red: 0.2, c: MEASURED }]), nation), 'of 1 measured · +50 pts vs nation');
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
  assert.equal(fmtMoney(999.7), '$1K');
  assert.equal(fmtMoney(999_949), '$1.0M');
  assert.equal(fmtMoney(999_400), '$999K');
  assert.equal(fmtMoney(99_960_000), '$100M');
  assert.equal(fmtMoney(999_600_000), '$1.0B');
  assert.equal(fmtInt(2912), '2,912');
});

test('CSV quotes specials and neutralizes spreadsheet formulas in text', () => {
  const csv = toCSV(
    [{ name: 'He said "hi", ok', note: '=SUM(A1)', v: -1.5 }],
    [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }, { key: 'v', label: 'V' }],
  );
  assert.equal(csv, 'Name,Note,V\r\n"He said ""hi"", ok",\'=SUM(A1),-1.5\r\n');
});

test('CSV writes a CCN column as ="010001" so Excel keeps the zero; the formula guard still covers everything else', () => {
  const cols = [{ key: 'id', label: 'CCN', ccn: true }, { key: 'note', label: 'Note' }];
  const csv = toCSV([{ id: '010001', note: '="010001"' }, { id: '=1+1', note: 'ok' }, { id: '05012F', note: '+x' }], cols);
  assert.deepEqual(csv.split('\r\n'), ['CCN,Note', '"=""010001""","\'=""010001"""', '\'=1+1,ok', '"=""05012F""",\'+x', '']);
  assert.equal(roundTo(91.66666666666667, 1), 91.7);
  assert.equal(roundTo(null, 2), null);
  assert.equal(roundTo(19712.4, 0), 19712);
});

test('plural, upFirst, and the penalized-of-measured phrase', () => {
  assert.deepEqual([plural(1, 'hospital'), plural(2912, 'hospital'), plural(2, 'hospital has', 'hospitals have')],
    ['1 hospital', '2,912 hospitals', '2 hospitals have']);
  assert.deepEqual([upFirst('locations'), upFirst('')], ['Locations', '']);
  assert.equal(penalizedOfMeasured({ pctPen: 83.4, nMeasured: 2798 }), '83% of 2,798 measured');
});

test('noEstimateNote counts hospitals with no dollar estimate, and is empty when none', () => {
  assert.equal(noEstimateNote([{ pen: 5 }, { pen: 0 }]), '');
  assert.equal(noEstimateNote([{ pen: null }, { pen: 5 }]), '1 hospital has no estimate and is left out of the total');
  assert.equal(noEstimateNote([{ pen: null }, { pen: undefined }]), '2 hospitals have no estimate and are left out of the total');
});
