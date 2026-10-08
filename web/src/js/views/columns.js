import { h } from '../dom.js';
import { fmtPct, fmtMoney, fmtInt, CONDS, MIN_DISCHARGES, CAP_PCT, condState } from '../model.js';
import { link } from '../router.js';

// Six boxes: filled = condition added to the penalty; outline = measured, no penalty; dotted = too few cases.
const STRIP = { counted: ['on', 'penalized'], below: [null, 'no penalty'], few: ['na', `under ${MIN_DISCHARGES} cases`], none: ['na', 'no cases'] };
export function condStrip(D, x) {
  const states = CONDS.map((k) => condState(x, k, D.meta, x.cx));
  const counted = CONDS.filter((_, i) => states[i] === 'counted').map((k) => D.condByKey[k].short);
  return h('span', {},
    h('span', { class: 'cstrip', 'aria-hidden': 'true' }, CONDS.map((k, i) => {
      const [cls, text] = STRIP[states[i]];
      return h('i', { class: cls, title: `${D.condByKey[k].short}: ${text}` });
    })),
    h('span', { class: 'visually-hidden' }, counted.length ? `Penalized on ${counted.join(', ')}` : 'No condition penalized'));
}

// Columns for tables of areas (states, metros, divisions) whose rows carry summarize() fields plus label/href.
export function summaryColumns(label) {
  return [
    { key: 'label', label, cls: 'name', firstDir: 'asc', render: (r) => (r.href ? h('a', { href: r.href }, r.label) : r.label) },
    { key: 'n', label: 'Hospitals', num: true, render: (r) => fmtInt(r.n) },
    { key: 'pctPen', label: 'Penalized', num: true, render: (r) => fmtPct(r.pctPen, 0) },
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

export const CSV_COLUMNS = [
  { label: 'CCN', value: (x) => x.id }, { label: 'Hospital', value: (x) => x.name }, { label: 'City', value: (x) => x.city },
  { label: 'State', value: (x) => x.st }, { label: 'Metro area', value: (x) => x.cbsaName }, { label: 'Payment adjustment factor', value: (x) => x.paf },
  { label: 'Payment reduction %', value: (x) => x.red }, { label: 'Estimated penalty $ (modeled)', value: (x) => x.pen },
  { label: 'Peer group', value: (x) => x.peer }, { label: 'Dual proportion', value: (x) => x.dual },
  ...CONDS.flatMap((k) => [
    { label: `${k} discharges`, value: (x) => x.c[k]?.n }, { label: `${k} ERR`, value: (x) => x.c[k]?.err },
    { label: `${k} penalized`, value: (x) => (x.c[k]?.flag ? 'Y' : 'N') }]),
];
