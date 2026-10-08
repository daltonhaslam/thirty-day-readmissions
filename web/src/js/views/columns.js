import { h } from '../dom.js';
import { fmtPct, fmtMoney, CONDS } from '../model.js';
import { link } from '../router.js';

// Six boxes: filled = condition added to the penalty; outline = measured, no penalty; dotted = too few cases.
export function condStrip(D, x) {
  return h('span', { class: 'cstrip', 'aria-label': `Penalized on ${x.flags.length} of 6 conditions` },
    CONDS.map((k) => {
      const c = x.c[k];
      const cls = c?.flag === 1 ? 'on' : (c && (c.n ?? 0) >= 25 ? '' : 'na');
      return h('i', { class: cls || null, title: `${D.condByKey[k].short}: ${c?.flag === 1 ? 'penalized' : c && (c.n ?? 0) >= 25 ? 'no penalty' : 'too few cases'}` });
    }));
}

export function hospitalColumns(D, { compact = false } = {}) {
  const cols = [
    { key: 'name', label: 'Hospital', cls: 'name', firstDir: 'asc', sort: (x) => x.name,
      render: (x) => [h('a', { href: link('hospital', x.id) }, x.name), h('small', {}, `${x.place} · CCN ${x.id}`)], csv: (x) => x.name },
    { key: 'red', label: 'Cut', num: true, sort: (x) => x.red,
      render: (x) => [fmtPct(x.red), h('span', { class: 'pbar', style: { width: `${(x.red / 3) * 48}px` } })] },
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
