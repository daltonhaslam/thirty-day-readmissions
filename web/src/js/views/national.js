import { h } from '../dom.js';
import { figure } from '../ui/figure.js';
import { barRows } from '../charts/bars.js';
import { stripPlot } from '../charts/strip.js';
import { rampVar } from '../charts/scale.js';
import { CONDS, PEERS, CAP_PCT, TEACH_LABEL, isMeasured, summarize, median, fmtInt, fmtPct, fmtMoney, bedBand, BED_BANDS } from '../model.js';
import { link } from '../router.js';

// Estimated dollars attributable to each condition: each hospital's penalty split by its contributions.
export function dollarsByCondition(list) {
  const out = Object.fromEntries(CONDS.map((k) => [k, 0]));
  for (const x of list) {
    const tot = CONDS.reduce((s, k) => s + x.cx[k], 0);
    if (!tot || !x.pen) continue;
    for (const k of CONDS) out[k] += (x.pen * x.cx[k]) / tot;
  }
  return out;
}

export function conditionFigure(D, list, { compare } = {}) {
  const dollars = dollarsByCondition(list);
  const totalD = Object.values(dollars).reduce((a, b) => a + b, 0) || 1;
  const rate = (pop, k) => {
    const measured = pop.filter((x) => isMeasured(x.c[k]));
    return measured.length ? (100 * measured.filter((x) => x.c[k].flag === 1).length) / measured.length : null;
  };
  const rows = CONDS.map((k) => ({ k, share: (100 * dollars[k]) / totalD }));
  const top = [...rows].sort((a, b) => b.share - a.share)[0];
  const money = barRows([...rows].sort((a, b) => b.share - a.share).map((r) => ({ label: D.condByKey[r.k].short, value: r.share,
    display: fmtPct(r.share, 0), note: `≈ ${fmtMoney(dollars[r.k])}` })), { max: 100 });
  if (!compare) {
    return figure({ title: 'Which conditions cost hospitals the most',
      take: `Each hospital's estimated penalty, split by how much each condition added to it. ${D.condByKey[top.k].short} leads because it is common and carries a large share of payments.`,
      source: `CMS FY${D.meta.fy} HRRP Supplemental Data File; dollars modeled (see Methods).`, body: money });
  }
  const ratesEl = barRows(CONDS.map((k) => ({ k, v: rate(list, k), c: rate(compare, k) })).filter((r) => r.v != null)
    .map((r) => ({ label: D.condByKey[r.k].short, value: r.v, display: fmtPct(r.v, 0), compare: r.c, compareDisplay: fmtPct(r.c, 0) })),
  { max: 100, compareLabel: 'All hospitals' });
  return figure({ title: 'Which conditions drive the penalties here',
    take: 'Left: share of measured hospitals penalized on each condition (black tick: all hospitals, about half by design). Right: share of the estimated dollars.',
    source: `CMS FY${D.meta.fy} HRRP Supplemental Data File; dollars modeled (see Methods).`,
    body: h('div', { class: 'grid-2 grid-2--tight' }, h('div', {}, h('div', { class: 'cap muted sub' }, 'Penalized on this condition'), ratesEl),
      h('div', {}, h('div', { class: 'cap muted sub' }, 'Share of estimated dollars'), money)) });
}

export function measuredFigure(D, list) {
  const measured = (x) => CONDS.filter((k) => isMeasured(x.c[k])).length;
  const rows = [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const grp = list.filter((x) => measured(x) === n);
    const sm = summarize(grp);
    return { label: n === 1 ? '1 condition' : `${n} conditions`, value: sm.pctPen, display: fmtPct(sm.pctPen, 0), note: `${fmtInt(sm.n)} hospitals`, n: sm.n };
  }).filter((r) => r.n > 0);
  return figure({ title: 'More conditions measured, more ways to be penalized',
    take: 'Share of hospitals penalized, by how many of the six conditions had at least 25 cases. A hospital is penalized if any one condition lands above its peer median, so each added condition is another chance.',
    source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`, body: barRows(rows, { max: 100 }) });
}

export function peerFigure(D, list) {
  const rows = PEERS.map((p) => ({ key: p, label: `Group ${p}` }));
  const groups = PEERS.map((p) => list.filter((x) => x.peer === p));
  const meds = Object.fromEntries(PEERS.map((p, i) => [p, median(groups[i].map((x) => x.red))]));
  const el = h('div');
  stripPlot(el, { rows, points: list.map((x) => ({ id: x.id, row: x.peer, x: x.red, fill: rampVar(x.red),
    tip: () => [x.name, [['Cut', fmtPct(x.red)], ['Peer group', x.peer], x.place]], href: link('hospital', x.id) })),
  domain: [0, CAP_PCT], ticks: [0, 0.5, 1, 1.5, 2, 2.5, CAP_PCT], tickFormat: (d) => `${d}%`, medians: meds, rowH: 44,
  label: 'Payment reductions by peer group' });
  const sums = groups.map(summarize);
  return figure({ title: 'Penalties by peer group',
    take: `Group 1 serves the fewest dual-eligible patients, group 5 the most. Black ticks mark each group's median cut. Share penalized ranges from ${fmtPct(Math.min(...sums.map((s) => s.pctPen)), 0)} to ${fmtPct(Math.max(...sums.map((s) => s.pctPen)), 0)}.`,
    source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`, body: el });
}

const DIMENSIONS = [
  ['Teaching status', (x) => TEACH_LABEL[x.teach], Object.values(TEACH_LABEL)],
  ['Beds', (x) => bedBand(x.beds), BED_BANDS],
  ['Location', (x) => (x.urban == null ? null : x.urban ? 'Urban' : 'Rural'), ['Urban', 'Rural']],
  ['Ownership', (x) => x.own, ['Nonprofit', 'For-profit', 'Government']],
];

export function typeFigure(D, list) {
  const blocks = DIMENSIONS.map(([title, keyOf, order]) => {
    const rows = order.map((label) => {
      const grp = list.filter((x) => keyOf(x) === label);
      const sm = summarize(grp);
      return { label, value: sm.meanRed, display: fmtPct(sm.meanRed), note: `${fmtInt(sm.n)} hospitals · ${fmtPct(sm.pctPen, 0)} penalized`, n: sm.n };
    }).filter((r) => r.n > 0);
    return h('div', {}, h('div', { class: 'cap muted sub' }, title), barRows(rows, { max: 0.8 }));
  });
  return figure({ title: 'Average cut by type of hospital', take: 'Bars show the average reduction; each label adds how many hospitals are in the group and the share penalized. Small and non-teaching hospitals are penalized less often, mostly because fewer of their conditions reach 25 cases.',
    source: `CMS FY${D.meta.fy} HRRP Supplemental Data File; hospital characteristics from the FY${D.meta.fy} IPPS impact file and Care Compare.`,
    body: h('div', { class: 'grid-4' }, blocks) });
}
