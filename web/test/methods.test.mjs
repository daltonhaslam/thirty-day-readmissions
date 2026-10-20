import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuracyLine, assumptionRows, replicationText } from '../src/js/views/methods.js';
import { factorCheck, excessText, WORKSHEET_NOTE } from '../src/js/views/explainer.js';

test('replication text follows the pipeline check: all exact, or exact for some', () => {
  assert.match(replicationText({ exact: 2912, total: 2912 }), /^Recomputing every hospital .* full precision .* exactly for all 2,912 hospitals\./);
  assert.match(replicationText({ exact: 2911, total: 2912 }), /exactly for 2,911 of 2,912 hospitals\./);
});

test('worksheet check: matches, or differs by the gap', () => {
  const h = { paf: 0.9948, c: { HF: { flag: 1, ratio: 0.05 } } };
  assert.equal(factorCheck(h, 0.9948), '· matches');
  assert.equal(factorCheck(h, 0.9949), '· differs by 0.0001');
});

test('worksheet line 4 is the stored excess to four decimals, and a sliver above zero reads "< 0.0001"', () => {
  // 1.02484 - 0.99276 = 0.03208: the stored excess, not 1.0248 - 0.9928 as lines 2 and 3 print.
  assert.equal(excessText(1.02484, 0.99276), '+0.0321');
  assert.equal(excessText(1.0899, 0.9928), '+0.0971');
  assert.equal(excessText(0.99284, 0.99281), '< 0.0001');
  assert.equal(excessText(0.9929, 0.99281), '+0.0001');
  assert.equal(WORKSHEET_NOTE, 'Ratios, medians, weights, and the neutrality modifier are printed to four decimals; lines 4 and 6 use the site\'s stored values, kept to six or more decimals, so the last digit can differ from a hand calculation.');
});

const edition = { fy: 2027, label: 'FY2027' };
const hospitals = [
  { id: 'a', types: ['MDH'], pen: 10 },
  { id: 'b', types: ['MDH'], pen: 20, inactive: { date: '2025-03-31', reason: 'voluntary' } },
  { id: 'c', types: [], pen: null },
];
const DOLLAR_CHECK = { asOf: '2026-10-11', source: 'Medicare cost reports (HCRIS) for cost-reporting periods beginning in FY2024', costFy: 2024, rateDrift: 1.066, within15: 85.0, within15Small: 73.7 };
const meta = (mdh = {}) => ({ dollarCheck: DOLLAR_CHECK, mdh: { endDate: '2026-12-31', maxShortfall: 33, ...mdh } });
const find = (rows, re) => rows.find(([a]) => re.test(a));

test('accuracy line dates the cost-report check, and stays harmless on a partial record', () => {
  assert.equal(accuracyLine(DOLLAR_CHECK, 2027), "In an October 2026 check against hospitals' FY2024 Medicare cost reports, 85% of estimates land within 15% after allowing for payment-rate growth from FY2024 to FY2027 (74% for hospitals under 100 beds).");
  assert.match(accuracyLine({ ...DOLLAR_CHECK, asOf: '2027-03-02' }), /^In a March 2027 check against hospitals' FY2024 Medicare cost reports,/);
  assert.equal(accuracyLine({ within15: 85 }, 2027), "In a check against hospitals' Medicare cost reports, 85% of estimates land within 15% after allowing for payment-rate growth.");
  assert.equal(accuracyLine(undefined), '');
});

test('assumption rows: MDH add-on through the end date, rate drift, inactive count', () => {
  const rows = assumptionRows({ meta: meta(), edition, hospitals });
  assert.deepEqual(find(rows, /^Payments priced/), ['Payments priced at FY2027 rates', 'Runs about 6.6% above FY2024 cost reports, by design']);
  const low = assumptionRows({ meta: { ...meta(), dollarCheck: { ...DOLLAR_CHECK, rateDrift: 0.97 } }, edition, hospitals });
  assert.equal(find(low, /^Payments priced/)[1], 'Runs about 3.0% below FY2024 cost reports, by design');
  assert.match(find(rows, /Medicare-dependent/)[0], /^Medicare-dependent add-on included for Oct–Dec 2026 only, assuming MDH status ends December 31, 2026, as current law says \(2 hospitals\)$/);
  assert.match(find(rows, /Medicare-dependent/)[1], /up to about 33% for some$/);
  assert.deepEqual(find(rows, /no longer active/), ['1 hospital CMS lists as no longer active is still shown', 'CMS will not pay it under this ID, so any cut it has is unlikely to be collected']);
  const two = assumptionRows({ meta: meta(), edition, hospitals: [...hospitals, { id: 'd', types: [], pen: 5, inactive: { date: null, reason: 'merger or closure' } }] });
  assert.deepEqual(find(two, /no longer active/), ['2 hospitals CMS lists as no longer active are still shown', 'CMS will not pay them under this ID, so any cut they have is unlikely to be collected']);
  // Some inactive hospitals have no cut (factor 1.0), so the row must not say each one has one.
  assert.doesNotMatch(find(rows, /no longer active/)[1], /their cut/);
  assert.deepEqual(find(rows, /impact file/), ['1 hospital missing from the impact file gets no estimate', 'Totals note the count instead of adding $0']);
  assert.equal(find(rows, /^Medicare volume/)[0], 'Medicare volume taken from FY2025');
  assert.match(find(rows, /^New-technology/)[1], /up to about 2% low overall.*FY2027 was about \$1\.7 billion\)$/);
  assert.equal(find(rows, /^Pennsylvania/)[1], 'Medicare pays them a global budget until the model ends December 31, 2026, so Oct–Dec 2026 is lower confidence; they are paid per stay after that');
});

test('the Pennsylvania Rural Health Model row drops out once the model has ended before the payment year', () => {
  const rows = assumptionRows({ meta: meta(), edition: { fy: 2028, label: 'FY2028' }, hospitals });
  assert.equal(find(rows, /^Pennsylvania/), undefined);
});

test('the inactive and no-estimate rows appear only when there are such hospitals', () => {
  const rows = assumptionRows({ meta: meta(), edition, hospitals: hospitals.map(({ inactive, ...x }) => ({ ...x, pen: 1 })) });
  assert.equal(find(rows, /no longer active/), undefined);
  assert.equal(find(rows, /impact file/), undefined);
});

test('an MDH end date past December names both years', () => {
  const rows = assumptionRows({ meta: meta({ endDate: '2027-03-31' }), edition, hospitals });
  assert.match(find(rows, /Medicare-dependent/)[0], /for Oct 2026–Mar 2027 only/);
});
