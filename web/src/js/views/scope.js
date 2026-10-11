import { h } from '../dom.js';
import { figure, part, field } from '../ui/figure.js';
import { breadcrumb, crumbsFor } from '../ui/breadcrumb.js';
import { penaltyHistogram } from '../charts/histogram.js';
import { usMap, dotLegend } from '../charts/usmap.js';
import { trendChart } from '../charts/trend.js';
import { barRows } from '../charts/bars.js';
import { greenbarTable } from '../ui/table.js';
import { summarize, scopeFilter, fmtInt, fmtPct, fmtMoney, mean, ordinal, vsLabel, noEstimateNote, noneMeasured, plural, upFirst, PEERS } from '../model.js';
import { summaryColumns, summaryCsvColumns } from './columns.js';
import { conditionFigure } from './national.js';
import { explorer } from './explorer.js';
import { link, slugify, go } from '../router.js';
import { estTag, PLACES_SOURCE } from './util.js';
import { meanCutByYear, COVID_GAP, COVID_GAP_NOTE } from '../data.js';

// Resolve a scope route to {kind, name, list, crumbs, children}
export function resolveScope(D, route) {
  const list = D.hospitals.filter(scopeFilter(route));
  if (!list.length) return null;
  const { view, key } = route;
  if (view === 'region') {
    const r = D.regions.find((x) => x.slug === key);
    return { kind: 'Census region', name: r.name, list, crumbs: crumbsFor(D, {}),
      children: { title: 'Divisions', rows: r.divisions.map((d) => ({ label: d.name, href: link('division', d.slug), list: list.filter((x) => x.division === d.name) })) } };
  }
  if (view === 'division') {
    const d = D.divisions.find((x) => x.slug === key);
    return { kind: 'Census division', name: d.name, list, crumbs: crumbsFor(D, { region: d.region }),
      children: { title: 'States', rows: d.states.map((st) => ({ label: D.meta.states[st], href: link('state', st), list: D.byState.get(st) || [] })) } };
  }
  if (view === 'state') {
    const any = list[0];
    const metros = [...new Set(list.map((x) => x.cbsa).filter(Boolean))];
    // A metro that crosses state lines shows only this state's hospitals, so say so (the linked page shows the whole metro).
    const metroLabel = (c) => (D.byCbsa.get(c).some((x) => x.st !== key) ? `${D.cbsaNames[c]} (${key} part)` : D.cbsaNames[c]);
    const rows = metros.map((c) => ({ label: metroLabel(c), href: link('metro', c), list: list.filter((x) => x.cbsa === c) }));
    const rural = list.filter((x) => !x.cbsa);
    if (rural.length) rows.push({ label: 'Outside metro areas', list: rural });
    return { kind: 'State', name: D.meta.states[key], list, crumbs: crumbsFor(D, { region: any.region, division: any.division }),
      children: { title: 'Metro areas', rows } };
  }
  const st = [...new Set(list.map((x) => x.st))];
  const home = st.sort((a, b) => list.filter((x) => x.st === b).length - list.filter((x) => x.st === a).length)[0];
  const any = list.find((x) => x.st === home);
  return { kind: 'Metro area', name: D.cbsaNames[key], list, crumbs: crumbsFor(D, { region: any.region, division: any.division, st: home }),
    multiState: st.length > 1, states: st, children: null };
}

const rankOf = (D, kind, value) => {
  if (kind !== 'State') return null;
  const avgs = [...D.stateSummary.values()].map((sm) => sm.meanRed).sort((a, b) => b - a);
  return { rank: avgs.findIndex((v) => v <= value + 1e-12) + 1, of: avgs.length };
};

function scopeTrend(D, list) {
  const { years } = D;
  const el = h('div');
  trendChart(el, { years, label: `Average cut by year, this area vs all hospitals in the ${D.edition.label} program`, yFormat: (d) => `${d}%`,
    annotations: D.capMarks, bands: [COVID_GAP],
    series: [
      { label: 'This area', kind: 'line', values: meanCutByYear(list, D), fmt: (v) => fmtPct(v), style: { stroke: 'var(--form)', dot: 'var(--form)' } },
      { label: `All hospitals in the ${D.edition.label} program`, kind: 'line', values: D.programTrend, fmt: (v) => fmtPct(v), style: { stroke: 'var(--ink)', dash: '4 3', r: 2.2 } }] });
  return el;
}

// The deck's share penalized: of the hospitals measured on at least one condition, or noneMeasured() when none is
// ("it is not measured on any condition" for a one-hospital area, so the deck's first sentence stays whole).
export const deckShare = (S) => (S.pctPen == null ? `${S.n === 1 ? 'it is ' : ''}${noneMeasured(S)}`
  : `${fmtPct(S.pctPen, 0)} of the ${fmtInt(S.nMeasured)} measured on at least one condition`);

// The deck's first sentence. Its subject is singular when one hospital takes a cut or the area has only one
// ("0 of 1 hospital takes a cut").
export const deckLead = (S, label) => `${fmtInt(S.nPen)} of ${plural(S.n, 'hospital')} ${S.nPen === 1 || S.n === 1 ? 'takes' : 'take'} a cut in ${label}: ${deckShare(S)}.`;

// The Penalized KPI's note: measured count and the gap to the nation, or no comparison when nothing here is measured.
export function penalizedNote(S, N) {
  return `of ${fmtInt(S.nMeasured)} measured${S.pctPen == null ? '' : ` · ${vsLabel(S.pctPen, N.pctPen, 0, 'pts')}`}`;
}

// Returns [element, title] or null when the route matches nothing.
export function renderScope(D, route, state = {}) {
  const sc = resolveScope(D, route);
  if (!sc) return null;
  const { list } = sc;
  const S = summarize(list);
  const N = D.nation;
  const rank = rankOf(D, sc.kind, S.meanRed);
  const noEstNote = noEstimateNote(list);
  const deck = `${deckLead(S, D.edition.label)} `
    + `The average cut, counting ${S.n === 1 ? 'its one hospital' : `all ${plural(S.n, 'hospital')}`}, is ${fmtPct(S.meanRed)}`
    + `${rank ? `, ${rank.rank === 1 ? 'the largest' : `the ${ordinal(rank.rank)}-largest`} among the ${rank.of - (D.stateSummary.has('DC') ? 1 : 0)} states${D.stateSummary.has('DC') ? ' and DC' : ''} in the program` : ''}. `;
  const total = ['Estimated total: ', fmtMoney(S.penTotal), estTag(), noEstNote ? ` (${noEstNote})` : '', '.'];

  const kpis = h('div', { class: 'form kpis' },
    h('div', { class: 'form__title' }, h('span', {}, `${sc.name} · ${D.edition.label}`), h('span', {}, 'Compared with all hospitals nationally')),
    field(1, 'Hospitals', fmtInt(S.n)),
    field(2, 'Penalized', fmtPct(S.pctPen, 0), { note: penalizedNote(S, N) }),
    field(3, 'Average cut', fmtPct(S.meanRed), { note: vsLabel(S.meanRed, N.meanRed, 2, 'pts') }),
    field(4, 'Cut 1% or more', fmtInt(S.nGe1), { note: `${fmtPct((100 * S.nGe1) / S.n, 0)} of hospitals (nation ${fmtPct((100 * N.nGe1) / N.n, 0)})` }),
    field(5, 'At the 3% cap', fmtInt(S.nMax)),
    field(6, 'Estimated dollars', [fmtMoney(S.penTotal), estTag()], { note: noEstNote ? `${upFirst(noEstNote)}.` : null }));

  const mapEl = h('div', { class: 'map map--scope' });
  const scopeStates = [...new Set(list.map((x) => x.st))];
  usMap(mapEl, D, { metric: 'avg', plain: true, dots: true, hospitals: list, focusStates: scopeStates, focusPoints: route.view === 'metro',
    context: route.view === 'metro' ? scopeStates.flatMap((st) => D.byState.get(st)).filter((x) => x.cbsa !== route.key) : null,
    onState: (st) => go('state', st), onHospital: (id) => go('hospital', id) });

  const histEl = h('div');
  penaltyHistogram(histEl, { reds: list.map((x) => x.red), compare: D.hospitals.map((x) => x.red), label: sc.name });

  const peerRows = PEERS.map((p) => {
    const g = list.filter((x) => x.peer === p);
    return { label: `Group ${p}`, value: g.length, display: fmtInt(g.length), note: g.length ? `avg cut ${fmtPct(mean(g.map((x) => x.red)))}` : 'none' };
  });

  let childTable = null;
  if (sc.children?.rows.length) {
    const rows = sc.children.rows.map((c) => ({ ...c, ...summarize(c.list) })).filter((r) => r.n);
    const rowLabel = sc.children.title.replace(/s$/, '');
    childTable = figure({ title: sc.children.title, take: 'Select a row to drill down.', source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`,
      body: greenbarTable({ rows, pageSize: 25, sort: { key: 'n', dir: 'desc' }, csvName: `${slugify(sc.name)}-${slugify(sc.children.title)}.csv`,
        rowHref: (r) => r.href, columns: summaryColumns(rowLabel), csvColumns: summaryCsvColumns(rowLabel) }).el });
  }

  const el = h('div', { class: 'wrap scope' },
    h('header', { class: 'scope__head' },
      breadcrumb(sc.crumbs, sc.name),
      h('div', { class: 'cap hero__kicker' }, sc.kind + (sc.multiState ? ` · spans ${sc.states.join(', ')}` : '')),
      h('h1', { class: 'scope__title' }, sc.name),
      h('p', { class: 'scope__deck' }, deck, total)),
    kpis,
    h('div', { class: 'grid-2 grid-2--wide-left scope__row' },
      figure({ title: 'Hospitals on the map', take: route.view === 'metro' ? 'Hospitals in this metro area are sized by Medicare volume and shaded by cut; gray dots are other hospitals in the state. Select one to open it.' : 'Dots are sized by Medicare volume and shaded by cut. Select one to open it.',
        source: `${upFirst(PLACES_SOURCE)}.`, body: h('div', {}, mapEl, dotLegend()) }),
      figure({ title: 'Size of the cuts', take: `Bars: ${sc.name}. Outline: all hospitals. Both as shares, so areas of any size compare.`,
        source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`, body: histEl })),
    conditionFigure(D, list, { compare: D.hospitals }),
    h('div', { class: 'grid-2' },
      figure({ title: 'Peer groups', take: 'How many hospitals here fall in each dual-eligible peer group. Group 5 serves the most low-income patients.',
        source: `CMS ${D.edition.label} HRRP Supplemental Data File.`, body: barRows(peerRows, { ink: true }) }),
      figure({ title: 'Average cut over time', take: `Red: hospitals in ${sc.name} that are in the ${D.edition.label} program. Dashed: every hospital in the ${D.edition.label} program, nationwide. Each year averages those in that year's file. ${COVID_GAP_NOTE}`,
        source: `CMS HRRP Supplemental Data Files, ${D.edition.span}.`, body: scopeTrend(D, list) })),
    childTable,
    part({ no: null, id: 'scope-hospitals', title: `Hospitals in ${sc.name}` },
      explorer(D, list, { showState: route.view !== 'state', csvName: `${slugify(sc.name)}-hospitals.csv`, state })));
  return [el, sc.name];
}
