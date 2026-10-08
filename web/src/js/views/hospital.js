import { h, clear } from '../dom.js';
import { figure, field } from '../ui/figure.js';
import { breadcrumb, crumbsFor } from '../ui/breadcrumb.js';
import { errRows } from '../charts/errRange.js';
import { trendChart } from '../charts/trend.js';
import { greenbarTable } from '../ui/table.js';
import { CONDS, MIN_DISCHARGES, CAP, TEACH_LABEL, contrib, cutPct, condState, peerMedian, peerBands, verdict, percentileRank, fmtInt, fmtPct, fmtMoney } from '../model.js';
import { hospitalColumns } from './columns.js';
import { worksheet } from './explainer.js';
import { link } from '../router.js';

let bandsCache = null;
const TYPES = { SCH: 'Sole community hospital', MDH: 'Medicare-dependent hospital', RRC: 'Rural referral center', IHS: 'Indian Health Service', EACH: 'Essential access community hospital' };

function rankLine(D, x) {
  const st = D.byState.get(x.st).map((y) => y.red).sort((a, b) => a - b);
  const peer = D.hospitals.filter((y) => y.peer === x.peer).map((y) => y.red).sort((a, b) => a - b);
  const p = (arr) => Math.round(percentileRank(arr, x.red));
  if (x.red <= 0) return 'No reduction, like ' + fmtInt(D.hospitals.filter((y) => y.red <= 0).length - 1) + ' other hospitals.';
  return `Larger cut than ${p(D.sortedRed)}% of hospitals nationally, ${p(st)}% in ${D.meta.states[x.st]}, and ${p(peer)}% in peer group ${x.peer}.`;
}

function summarySentence(D, x, v) {
  const name = x.name;
  if (v.status === 'none-measured') return `${name} has no ${D.edition.label} cut. None of its six conditions reached ${MIN_DISCHARGES} cases in the data window, so none could count against it.`;
  if (v.status === 'none-below') return `${name} has no ${D.edition.label} cut. All ${v.nMeasured} of its measured conditions came in at or below its peer group's median.`;
  return `Medicare will pay ${name} ${fmtPct(x.red)} less for every traditional-Medicare inpatient stay from ${D.edition.payLong}. `
    + `${v.nAbove} of its ${v.nMeasured} measured conditions came in above the peer-group median; ${D.condByKey[v.top].short.toLowerCase()} added the most.`;
}

function conditionRows(D, x, bands) {
  const r = contrib(x, D.meta);
  return CONDS.map((k) => {
    const c = x.c[k];
    const med = peerMedian(D.meta, x.peer, k);
    const state = condState(x, k, D.meta, r.byCond);
    const what = { counted: `adds ${(r.byCond[k] * 100).toFixed(3)} pts`, few: `under ${MIN_DISCHARGES}, not counted`, below: 'no penalty' }[state];
    const sub = !c ? 'no cases' : `${fmtInt(c.n ?? 0)} cases · ${what}`;
    return { key: k, label: D.condByKey[k].short, sub, err: c?.err ?? null, med, band: bands[x.peer]?.[k] || null, state };
  });
}

function whatIf(D, x, measured) {
  if (!measured.length) return h('p', { class: 'muted' }, `No condition had at least ${MIN_DISCHARGES} cases, so there is nothing to simulate.`);
  const over = {};
  const out = h('div', { class: 'form whatif__out' });
  const base = contrib(x, D.meta).paf;
  // Anchor to CMS's published factor; sliders move it by the recomputed difference.
  const paint = () => {
    const paf = Math.round(Math.min(1, Math.max(1 - CAP, x.paf + (contrib(x, D.meta, over).paf - base))) * 1e4) / 1e4;
    const red = cutPct(paf);
    const dollars = x.base != null ? x.base * (1 - paf) : null;
    clear(out).append(
      field('W1', 'Hypothetical cut', fmtPct(red), { big: true, note: `Actual: ${fmtPct(x.red)}` }),
      field('W2', 'Payment adjustment factor', paf.toFixed(4), { note: `Actual: ${x.paf.toFixed(4)}` }),
      field('W3', 'Estimated dollars', fmtMoney(dollars), { note: x.pen != null ? `Actual estimate: ${fmtMoney(x.pen)}` : 'no volume data' }));
  };
  const sliders = measured.map((k) => {
    const id = `wi-${k}`;
    const med = peerMedian(D.meta, x.peer, k);
    const val = h('output', { for: id, class: 'type' }, x.c[k].err.toFixed(3));
    const input = h('input', { type: 'range', id, min: '0.80', max: '1.25', step: '0.001', value: String(x.c[k].err),
      oninput: (e) => { over[k] = Number(e.target.value); val.textContent = over[k].toFixed(3); paint(); } });
    input.dataset.k = k;
    return h('div', { class: 'whatif__row' },
      h('label', { for: id }, h('b', {}, D.condByKey[k].short), h('small', {}, `median ${med.toFixed(3)}`)), input, val);
  });
  const setAll = (fn) => { for (const row of sliders) { const inp = row.querySelector('input'); const k = inp.dataset.k; const v = fn(k); inp.value = String(v); row.querySelector('output').textContent = v.toFixed(3); over[k] = v; } paint(); };
  paint();
  return h('div', { class: 'whatif' },
    h('div', { class: 'whatif__sliders' }, sliders,
      h('div', { class: 'seg' },
        h('button', { class: 'btn', type: 'button', onclick: () => setAll((k) => x.c[k].err) }, 'Reset'),
        h('button', { class: 'btn', type: 'button', onclick: () => setAll((k) => Math.min(x.c[k].err, peerMedian(D.meta, x.peer, k))) }, 'Bring all to median'))),
    out);
}

function historyChart(D, x) {
  const years = [...D.history.years, D.meta.fy];
  const hist = D.history.paf[x.id] || [];
  const vals = years.map((fy, i) => (fy === D.meta.fy ? x.red : hist[i] != null ? cutPct(hist[i]) : null));
  const el = h('div');
  trendChart(el, { years, label: `Payment cut by year for ${x.name}`, yFormat: (d) => `${d}%`, yMax: Math.max(1, ...vals.filter((v) => v != null)) * 1.1,
    series: [{ label: x.name, kind: 'bar', values: vals, fmt: (v) => fmtPct(v), style: { fill: 'var(--p4)' } },
      { label: 'National average', kind: 'line', values: years.map((fy) => D.nationalByFy[fy]?.meanRed ?? null), fmt: (v) => fmtPct(v), style: { stroke: 'var(--ink)', dash: '4 3', r: 2.2 } }] });
  const n = vals.filter((v) => v != null).length;
  const pen = vals.filter((v) => v > 0).length;
  return { el, take: `Penalized in ${pen} of the ${n} years with data. Bars: this hospital. Dashed line: national average. "n/a" means the hospital was not in that year's file.` };
}

// Returns [element, title] or null for an unknown CCN.
export function renderHospital(D, id) {
  const x = D.byId.get(id);
  if (!x) return null;
  bandsCache ??= peerBands(D.hospitals);
  const v = verdict(x, D.meta);
  const types = [TEACH_LABEL[x.teach], x.beds ? `${fmtInt(x.beds)} beds` : null, x.own, x.urban == null ? null : x.urban ? 'Urban' : 'Rural', ...x.types.map((t) => TYPES[t])].filter(Boolean);
  const neighbors = (x.cbsa ? D.byCbsa.get(x.cbsa) : D.byState.get(x.st).filter((y) => !y.cbsa)).filter(Boolean);
  const condEl = h('div');
  errRows(condEl, { rows: conditionRows(D, x, bandsCache), label: `Readmission ratios by condition for ${x.name}` });
  const hist = historyChart(D, x);

  const el = h('div', { class: 'wrap hosp' },
    breadcrumb(crumbsFor(D, { region: x.region, division: x.division, st: x.st, cbsa: x.cbsa }), x.name),
    h('div', { class: 'hosp__top' },
      h('div', { class: 'form hosp__id' },
        h('div', { class: 'form__title' }, h('span', {}, `Hospital record · ${D.edition.label}`), h('span', {}, `CCN ${x.id}`)),
        h('div', { class: 'field field--wide' }, h('div', { class: 'field__label' }, h('span', { class: 'field__no' }, '1'), 'Hospital'),
          h('h1', { class: 'hosp__name' }, x.name)),
        field(2, 'Location', [x.place, x.zip ? ` ${x.zip}` : ''].join(''), { note: x.county ? `${x.county} County` : null }),
        field(3, 'Metro area', x.cbsaName || 'Outside metro areas', { note: x.cbsa ? h('a', { href: link('metro', x.cbsa) }, 'See this metro') : h('a', { href: link('state', x.st) }, `See ${D.meta.states[x.st]}`) }),
        field(4, 'Type', types.join(' · ') || '—', { small: true }),
        field(5, 'Peer group', `${x.peer} of 5`, { note: `${fmtPct(x.dual * 100, 1)} of stays dual-eligible` }),
        field(6, 'Care Compare stars', x.star ? `${'★'.repeat(x.star)}${'☆'.repeat(5 - x.star)}` : 'Not rated',
          { note: h('a', { href: `https://www.medicare.gov/care-compare/details/hospital/${x.id}`, target: '_blank', rel: 'noopener' }, 'Open on Medicare.gov') })),
      h('div', { class: 'hosp__verdict' },
        h('span', { class: `stamp ${x.red > 0 ? '' : 'stamp--ink'}` }, x.red > 0 ? `Cut ${fmtPct(x.red)}` : 'No cut'),
        h('p', { class: 'hosp__summary' }, summarySentence(D, x, v)),
        h('div', { class: 'form hosp__nums' },
          field('A', 'Payment adjustment factor', x.paf.toFixed(4), { note: 'CMS, final' }),
          field('B', 'Estimated dollars', x.pen != null ? fmtMoney(x.pen) : '—', { note: x.base != null ? `on ≈ ${fmtMoney(x.base)} of base payments` : 'no volume data' })),
        h('p', { class: 'small muted' }, rankLine(D, x)))),
    figure({ title: 'Where the penalty came from', take: 'Each row is one condition. Dot: this hospital\'s ratio (red = counted toward the penalty; hollow = too few cases). Black tick: peer-group median. Gray band: middle 80% of peer hospitals.',
      source: `CMS ${D.edition.label} HRRP Supplemental Data File.`, body: condEl }),
    h('div', { class: 'grid-2 grid-2--wide-left' },
      figure({ title: 'What if?', take: `Drag a ratio to see how the cut would change. Hypothetical: peer medians stay at their ${D.edition.label} values.`, source: 'Recomputed with the CMS formula.', body: whatIf(D, x, v.measured) }),
      figure({ title: 'Penalty history', take: hist.take, source: `CMS HRRP Supplemental Data Files, ${D.edition.span}.`, body: hist.el })),
    h('details', { class: 'hosp__ws' }, h('summary', { class: 'btn' }, 'Show the full worksheet'), worksheet(D, x, { compact: true })),
    neighbors.length > 1 ? figure({ title: x.cbsa ? `Other hospitals in ${x.cbsaName}` : `Other hospitals outside metro areas in ${D.meta.states[x.st]}`,
      take: 'This hospital is highlighted.', source: `CMS ${D.edition.label} HRRP Supplemental Data File.`,
      body: greenbarTable({ columns: hospitalColumns(D, { compact: true }), rows: neighbors, pageSize: 12, sort: { key: 'red', dir: 'desc' },
        rowHref: (y) => link('hospital', y.id), rowClass: (y) => (y.id === x.id ? 'is-current' : null), csvName: 'nearby.csv' }).el }) : null);
  return [el, x.name];
}
