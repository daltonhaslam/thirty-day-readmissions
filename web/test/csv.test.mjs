import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCSV, summarize } from '../src/js/model.js';
import { CSV_COLUMNS, summaryCsvColumns } from '../src/js/views/columns.js';

const HOSP = {
  id: '010001', name: 'Southeast Health Medical Center', city: 'Dothan', st: 'AL', cbsaName: 'Dothan, AL',
  beds: 334, bedsSrc: 'cr', inactive: { date: '2025-03-31', code: '01', reason: 'voluntary' },
  paf: 0.99960000001, red: 0.04, pen: 19712.4, peer: 2, dual: 0.18243333,
  c: {
    AMI: { n: 398, err: 0.98993333, flag: 0, ratio: 0.0254 },
    COPD: { n: 232, err: 1.0277, flag: 1, ratio: 0.0079 },
    HF: { n: 12, err: null, flag: 0, ratio: 0.0407 },
  },
};
// Raw cells of one CSV line (quotes kept), split on commas outside quotes.
const cells = (line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((c) => c.replace(/,$/, ''));
const unquote = (c) => (c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c);
const rowOf = (csv) => {
  const [head, row] = csv.split('\r\n');
  const vals = cells(row);
  return Object.fromEntries(cells(head).map((k, i) => [unquote(k), vals[i]]));
};

test('hospital CSV: units in headers, rounded values, CCN kept as text, new bed and inactive columns', () => {
  const r = rowOf(toCSV([HOSP], CSV_COLUMNS));
  assert.equal(r.CCN, '"=""010001"""');
  assert.equal(r['Payment adjustment factor'], '0.9996');
  assert.equal(r['Payment reduction (%)'], '0.04');
  assert.equal(r['Estimated penalty ($, modeled)'], '19712');
  assert.equal(r['Dual proportion'], '0.1824');
  assert.equal(r['AMI ERR'], '0.989933', 'ERRs keep six decimals so the factors can be recomputed');
  assert.deepEqual([r.Beds, r['Beds source'], r['Inactive (date)']], ['334', 'cost report', '2025-03-31']);
});

test('hospital CSV: a condition\'s penalized column is Y/N only when measured, blank otherwise', () => {
  const r = rowOf(toCSV([HOSP], CSV_COLUMNS));
  assert.equal(r['AMI penalized (Y/N)'], 'N');
  assert.equal(r['COPD penalized (Y/N)'], 'Y');
  assert.equal(r['HF penalized (Y/N)'], '', 'under 25 cases');
  assert.equal(r['PN penalized (Y/N)'], '', 'no cases');
});

test('hospital CSV works on data without the new fields', () => {
  const { bedsSrc, inactive, ...old } = HOSP;
  const r = rowOf(toCSV([old], CSV_COLUMNS));
  assert.deepEqual([r.Beds, r['Beds source'], r['Inactive (date)']], ['334', '', '']);
});

test('area CSV: share penalized of measured, rounded, with the counts behind it', () => {
  const measured = { HF: { n: 40, err: 1 } };
  const list = [{ red: 1, pen: 10.4, c: measured }, { red: 0, pen: 0, c: measured }, { red: 0.5, pen: 5.2, c: measured }, { red: 0, pen: 0, c: {} }];
  const csv = toCSV([{ label: 'Utah', ...summarize(list) }], summaryCsvColumns('State'));
  const r = rowOf(csv);
  assert.deepEqual(Object.keys(r), ['State', 'Hospitals', 'Hospitals measured', 'Hospitals penalized', 'Penalized (% of measured)', 'Average cut (%)', 'Cut 1% or more (hospitals)', 'Estimated penalties ($, modeled)']);
  assert.deepEqual(Object.values(r), ['Utah', '4', '3', '2', '66.7', '0.38', '1', '16']);
});
