import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuracyLine, assumptionRows } from '../src/js/views/methods.js';

const edition = { fy: 2027, label: 'FY2027' };
const hospitals = [
  { id: 'a', types: ['MDH'], pen: 10 },
  { id: 'b', types: ['MDH'], pen: 20, inactive: { date: '2025-03-31', code: '01', reason: 'voluntary' } },
  { id: 'c', types: [], pen: null },
];
const DOLLAR_CHECK = { source: 'Medicare cost reports (HCRIS) for cost-reporting periods beginning in FY2024', rateDrift: 1.066, within15: 85.0, within15Small: 73.7 };
const find = (rows, re) => rows.find(([a]) => re.test(a));

test('accuracy line reads the cost-report check, and is empty before the data has one', () => {
  assert.equal(accuracyLine(DOLLAR_CHECK), "Checked against hospitals' own Medicare cost reports, 85% of estimates land within 15% after allowing for two years of payment-rate growth (74% for hospitals under 100 beds).");
  assert.equal(accuracyLine({ within15: 85 }), "Checked against hospitals' own Medicare cost reports, 85% of estimates land within 15% after allowing for two years of payment-rate growth.");
  assert.equal(accuracyLine(undefined), '');
});

test('assumption rows with the new data: MDH add-on through the end date, rate drift, inactive count', () => {
  const rows = assumptionRows({ meta: { dollarCheck: DOLLAR_CHECK, mdh: { endDate: '2026-12-31', share: 0.25 } }, edition, hospitals });
  assert.deepEqual(find(rows, /^Payments priced/), ['Payments priced at FY2027 rates', 'Runs about 6.6% above FY2024 cost reports, by design']);
  assert.match(find(rows, /Medicare-dependent/)[0], /^Medicare-dependent add-on included for Oct–Dec 2026 only, assuming MDH status ends December 31, 2026, as current law says \(2 hospitals\)$/);
  assert.match(find(rows, /Medicare-dependent/)[1], /up to about 45%/);
  assert.deepEqual(find(rows, /no longer active/), ['1 hospital CMS lists as no longer active is still shown', 'CMS will not pay them under this ID, so their cut is unlikely to be collected']);
  assert.deepEqual(find(rows, /impact file/), ['1 hospital missing from the impact file gets no estimate', 'Totals note the count instead of adding $0']);
  assert.equal(find(rows, /^Medicare volume/)[0], 'Medicare volume taken from FY2025');
});

test('assumption rows on data without the new fields fall back to what that data did', () => {
  const rows = assumptionRows({ meta: {}, edition, hospitals: hospitals.map(({ inactive, ...x }) => ({ ...x, pen: 1 })) });
  assert.match(find(rows, /Medicare-dependent/)[0], /add-on left out \(2 hospitals\)$/);
  assert.match(find(rows, /^Payments priced/)[1], /^Runs above earlier years' cost reports/);
  assert.equal(find(rows, /no longer active/), undefined);
  assert.equal(find(rows, /impact file/), undefined);
});

test('an MDH end date past December names both years', () => {
  const rows = assumptionRows({ meta: { mdh: { endDate: '2027-03-31' } }, edition, hospitals });
  assert.match(find(rows, /Medicare-dependent/)[0], /for Oct 2026–Mar 2027 only/);
});
