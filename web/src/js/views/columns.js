import { h } from '../dom.js';
import { fmtPct, fmtMoney, fmtInt, roundTo, isMeasured, CONDS, MIN_DISCHARGES, CAP_PCT, condState } from '../model.js';
import { link } from '../router.js';

// Six boxes: filled = condition added to the penalty; outline = measured, no penalty; dotted = too few cases.
const STRIP = { counted: ['on', 'penalized'], below: [null, 'no penalty'], few: ['na', `under ${MIN_DISCHARGES} cases`], none: ['na', 'no cases'] };
export function condStrip(D, x) {
  const states = CONDS.map((k) => condState(x, k, D.meta, x.cx));
  const counted = CONDS.filter((_, i) => states[i] === 'counted').map((k) => D.condByKey[k].short);
  return h('span', {},
    h('span', { class: 'cstrip', 'aria-hidden': 'true' }, CONDS.map((k, i) => {
      const [cls, text] = STRIP[states[i]];
      const note = states[i] === 'counted' && x.paf >= 1 ? ' (rounded to zero)' : '';
      return h('i', { class: cls, title: `${D.condByKey[k].short}: ${text}${note}` });
    })),
    h('span', { class: 'visually-hidden' }, counted.length ? `Penalized on ${counted.join(', ')}` : 'No condition penalized'));
}

// Columns for tables of areas (states, metros, divisions) whose rows carry summarize() fields plus label/href.
export function summaryColumns(label) {
  return [
    { key: 'label', label, cls: 'name', firstDir: 'asc', render: (r) => (r.href ? h('a', { href: r.href }, r.label) : r.label) },
    { key: 'n', label: 'Hospitals', num: true, render: (r) => fmtInt(r.n) },
    { key: 'pctPen', label: 'Penalized', title: 'percent of hospitals measured on at least one condition', num: true, render: (r) => fmtPct(r.pctPen, 0) },
    { key: 'meanRed', label: 'Avg cut', num: true, render: (r) => fmtPct(r.meanRed) },
    { key: 'nGe1', label: 'Cut 1%+', num: true, render: (r) => fmtInt(r.nGe1) },
    { key: 'penTotal', label: 'Est. $', num: true, render: (r) => fmtMoney(r.penTotal) },
  ];
}

export function hospitalColumns(D, { compact = false } = {}) {
  const cols = [
    { key: 'name', label: 'Hospital', cls: 'name', firstDir: 'asc', sort: (x) => x.name,
      render: (x) => [h('a', { href: link('hospital', x.id) }, x.name), h('small', {}, `${x.place} · CCN ${x.id}`)], csv: (x) => x.name },
    { key: 'red', label: 'Cut', num: true, sort: (x) => x.red,
      render: (x) => [fmtPct(x.red), h('span', { class: 'pbar', style: { width: `${(x.red / CAP_PCT) * 48}px` } })] },
    { key: 'pen', label: 'Est. $', num: true, sort: (x) => x.pen, render: (x) => fmtMoney(x.pen) },
    { key: 'peer', label: 'Peer grp', num: true, sort: (x) => x.peer, render: (x) => String(x.peer) },
    { key: 'flags', label: 'Conditions', sort: (x) => x.flags.length, render: (x) => condStrip(D, x), csv: (x) => x.flags.join(' ') },
  ];
  if (!compact) {
    cols.push({ key: 'beds', label: 'Beds', num: true, sort: (x) => x.beds, render: (x) => (x.beds ?? '—') });
  }
  return cols;
}

// Area tables' CSV: headers carry units, values rounded as shown (shares to one decimal), plus the counts behind them.
export const summaryCsvColumns = (label) => [
  { label, value: (r) => r.label },
  { label: 'Hospitals', value: (r) => r.n },
  { label: 'Hospitals measured', value: (r) => r.nMeasured },
  { label: 'Hospitals penalized', value: (r) => r.nPen },
  { label: 'Penalized (% of measured)', value: (r) => roundTo(r.pctPen, 1) },
  { label: 'Average cut (%)', value: (r) => roundTo(r.meanRed, 2) },
  { label: 'Cut 1% or more (hospitals)', value: (r) => r.nGe1 },
  { label: 'Estimated penalties ($, modeled)', value: (r) => roundTo(r.penTotal, 0) },
];

const BEDS_SRC = { pos: 'certified (Provider of Services file)', cr: 'cost report' };

// Hospital CSV. The CCN is written so spreadsheets keep its leading zero; a condition's penalized column is blank
// when the hospital had too few cases to be measured on it.
export const CSV_COLUMNS = [
  { label: 'CCN', value: (x) => x.id, ccn: true }, { label: 'Hospital', value: (x) => x.name }, { label: 'City', value: (x) => x.city },
  { label: 'State', value: (x) => x.st }, { label: 'Metro area', value: (x) => x.cbsaName },
  { label: 'Beds', value: (x) => x.beds }, { label: 'Beds source', value: (x) => BEDS_SRC[x.bedsSrc] }, { label: 'Inactive (date)', value: (x) => x.inactive?.date },
  { label: 'Payment adjustment factor', value: (x) => roundTo(x.paf, 4) }, { label: 'Payment reduction (%)', value: (x) => roundTo(x.red, 2) },
  { label: 'Estimated penalty ($, modeled)', value: (x) => roundTo(x.pen, 0) },
  { label: 'Peer group', value: (x) => x.peer }, { label: 'Dual proportion', value: (x) => roundTo(x.dual, 4) },
  ...CONDS.flatMap((k) => [
    { label: `${k} discharges`, value: (x) => x.c[k]?.n }, { label: `${k} ERR`, value: (x) => roundTo(x.c[k]?.err, 4) },
    { label: `${k} penalized (Y/N)`, value: (x) => (isMeasured(x.c[k]) ? (x.c[k].flag === 1 ? 'Y' : 'N') : null) }]),
];
