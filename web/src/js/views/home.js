import { h } from '../dom.js';
import { figure, part, field } from '../ui/figure.js';
import { omnibox } from '../ui/omnibox.js';
import { penaltyHistogram } from '../charts/histogram.js';
import { greenbarTable } from '../ui/table.js';
import { usMap, mapLegend, dotLegend, METRICS } from '../charts/usmap.js';
import { trendChart } from '../charts/trend.js';
import { fmtInt, fmtPct, fmtMoney, fmtDate } from '../model.js';
import { hospitalColumns, summaryColumns } from './columns.js';
import { explainerPart } from './explainer.js';
import { conditionFigure, peerFigure, typeFigure, measuredFigure } from './national.js';
import { explorer } from './explorer.js';
import { link, go, partNo } from '../router.js';
import { safeHref } from './util.js';
import { SITE_NAME_TOP, SITE_NAME_RED } from '../site.js';

function hero(D, index, S) {
  const bigMetro = [...D.byCbsa.entries()].reduce((a, b) => (b[1].length > a[1].length ? b : a));
  return h('section', { class: 'hero wrap', 'aria-labelledby': 'hero-title' },
    h('div', {},
      h('div', { class: 'hero__kicker cap' }, `${D.edition.label} edition · Year ${D.edition.nYears} of Medicare readmission penalties`),
      h('h1', { class: 'hero__title', id: 'hero-title' }, h('span', {}, SITE_NAME_TOP), ' ', h('span', { class: 'hero__title-red' }, SITE_NAME_RED)),
      h('p', { class: 'hero__deck' },
        `When too many patients land back in the hospital within 30 days of going home, Medicare pays that hospital less for a full year. Starting ${D.edition.payStart}, `,
        h('strong', {}, `${fmtInt(S.nPen)} of the ${fmtInt(S.n)} hospitals`), ' CMS evaluated take a cut.'),
      h('div', { class: 'hero__search' }, omnibox(index, { big: true, placeholder: 'Look up a hospital, city, state, or metro area' })),
      h('p', { class: 'hero__hint' }, 'Try ',
        h('a', { href: link('state', 'TX') }, 'Texas'), ', ',
        h('a', { href: link('metro', bigMetro[0]) }, bigMetro[1][0].cbsaName), ', or ',
        h('a', { href: '#explore' }, 'browse every hospital'), '. New to this? Start with ', h('a', { href: '#how' }, 'how the penalty works'), '.')),
    h('div', { class: 'hero__card' },
      h('div', { class: 'form summary' },
        h('div', { class: 'form__title' }, h('span', {}, `${D.edition.label} at a glance`), h('span', {}, 'All figures from CMS unless marked')),
        field(1, 'Hospitals evaluated', fmtInt(S.n)),
        field(2, 'Hospitals penalized', fmtInt(S.nPen), { note: `${fmtPct(S.pctPen, 1)} of hospitals` }),
        field(3, 'Average cut, all hospitals', fmtPct(S.meanRed)),
        field(4, 'Average cut, penalized only', fmtPct(S.meanRedPen)),
        field(5, 'At the 3% maximum', fmtInt(S.nMax), { note: 'hospitals' }),
        field(6, 'Estimated dollars', `≈ ${fmtMoney(D.meta.totals.modelPen)}`, { note: `Modeled here. CMS's rule-time estimate: ${fmtMoney(D.meta.totals.cmsEst)}` }),
        field(7, 'Data window', `${fmtDate(D.meta.perf[0])} – ${fmtDate(D.meta.perf[1])}`),
        field(8, 'Payment year', D.edition.payShort)),
      h('div', { class: 'hero__stamp' }, h('span', { class: 'stamp' }, `Final · posted ${fmtDate(D.meta.fileDate)}`))));
}

function picturePart(D, S) {
  const all = D.hospitals;
  const histEl = h('div');
  penaltyHistogram(histEl, { reds: all.map((x) => x.red) });
  const top = [...all].sort((a, b) => b.red - a.red || (b.pen ?? 0) - (a.pen ?? 0)).slice(0, 10);
  const topTable = greenbarTable({ columns: hospitalColumns(D), rows: top, pageSize: 10, sort: { key: 'red', dir: 'desc' },
    csvName: 'largest-penalties.csv', rowHref: (x) => link('hospital', x.id) });
  return part({ no: partNo('picture'), id: 'picture', title: `The ${D.edition.label} picture`,
    lede: `Most cuts are small. The typical penalized hospital loses ${fmtPct(S.medianRedPen)} of its base Medicare inpatient payments; ${fmtInt(S.nGe1)} lose 1% or more, and ${fmtInt(S.nMax)} hit the 3% cap.` },
    figure({ title: 'How big are the cuts?', take: `Each bar counts hospitals by the size of their payment reduction. ${fmtInt(S.n - S.nPen)} hospitals have no reduction.`,
      source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`, body: histEl }),
    h('div', { class: 'grid-2' }, measuredFigure(D, all), conditionFigure(D, all)),
    peerFigure(D, all),
    typeFigure(D, all),
    figure({ title: 'The largest penalties', take: 'Several are small surgical hospitals measured on a single condition, where one high ratio can reach the cap. Select a row to see what drove the penalty.',
      source: `CMS FY${D.meta.fy} HRRP Supplemental Data File; dollar estimates modeled from the FY${D.meta.fy} IPPS impact file.`, body: topTable.el }));
}

function mapPart(D) {
  let metric = 'avg';
  const mapEl = h('div', { class: 'map' });
  const legendHolder = h('div');
  const map = usMap(mapEl, D, { metric, dots: false, hospitals: D.hospitals,
    onState: (st) => go('state', st), onHospital: (id) => go('hospital', id) });
  let showDots = false;
  const setLegend = () => legendHolder.replaceChildren(mapLegend(metric), showDots ? dotLegend() : '');
  setLegend();
  const btns = Object.entries(METRICS).map(([k, m]) => h('button', { class: 'btn', type: 'button', 'aria-pressed': String(k === metric),
    onclick: (e) => { metric = k; for (const b of btns) b.setAttribute('aria-pressed', String(b === e.currentTarget)); map.update({ metric }); setLegend(); } }, m.label));
  const dots = h('input', { type: 'checkbox', id: 'map-dots', onchange: (e) => { showDots = e.target.checked; map.update({ dots: showDots }); setLegend(); } });

  const rows = [...D.stateSummary.entries()].map(([st, sm]) => ({ ...sm, label: D.meta.states[st], href: link('state', st) }));
  const stTable = greenbarTable({ rows, pageSize: 15, sort: { key: 'meanRed', dir: 'desc' }, csvName: 'states.csv', rowHref: (r) => r.href,
    columns: summaryColumns('State') });

  const regions = h('div', { class: 'regions' }, D.regions.map((r) => h('div', { class: 'region' },
    h('a', { class: 'region__name', href: link('region', r.slug) }, r.name),
    h('ul', {}, r.divisions.map((d) => h('li', {}, h('a', { href: link('division', d.slug) }, d.name),
      h('span', { class: 'region__states' }, d.states.map((st, i) => [i ? ' ' : '', h('a', { href: link('state', st) }, st)]))))))));

  return part({ no: partNo('map'), id: 'map', title: 'Where the penalties land', lede: 'Select a state to drill down to its regions, metro areas, and hospitals. Maryland is hatched: it runs its own all-payer model and is exempt.' },
    figure({ title: 'Penalties by state', take: 'Switch the measure, or turn on hospital dots (sized by Medicare volume, shaded by cut).',
      source: `CMS ${D.edition.label} HRRP Supplemental Data File; locations from Care Compare addresses and Census ZIP centroids.`,
      body: h('div', {}, h('div', { class: 'controls' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Map measure' }, btns),
        h('label', { class: 'check', for: 'map-dots' }, dots, 'Show hospitals')), mapEl, legendHolder) }),
    h('div', { class: 'grid-2 grid-2--wide-left' },
      figure({ title: 'Every state', take: 'Sort any column. Select a state to open it.', source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`, body: stTable.el }),
      figure({ title: 'Browse by region', take: 'Census regions and divisions.', body: regions })));
}

function historyPart(D) {
  const nat = D.history.national;
  const years = nat.map((r) => r.fy);
  const ann = [{ fy: 2015, label: '3% cap' }, { fy: 2019, label: 'peer groups' }, { fy: 2023, label: 'pneumonia paused' }, { fy: 2027, label: 'MA added' }];
  const pctEl = h('div');
  trendChart(pctEl, { years, label: 'Share of hospitals penalized by fiscal year', yMax: 100, yFormat: (d) => `${d}%`, annotations: ann,
    series: [{ label: 'Penalized', kind: 'bar', values: nat.map((r) => r.pctPen), fmt: (v) => fmtPct(v, 1), style: { fill: 'var(--p3)' },
      tipExtra: (p) => [['Hospitals', `${fmtInt(D.nationalByFy[p.fy].nPen)} of ${fmtInt(D.nationalByFy[p.fy].n)}`]] }] });
  const avgEl = h('div');
  trendChart(avgEl, { years, label: 'Average payment reduction by fiscal year', yFormat: (d) => `${d}%`, annotations: ann,
    series: [{ label: 'Average, penalized hospitals', kind: 'line', values: nat.map((r) => r.meanRedPen), fmt: (v) => fmtPct(v), style: { stroke: 'var(--form)', dot: 'var(--form)' } },
      { label: 'Average, all hospitals', kind: 'line', values: nat.map((r) => r.meanRed), fmt: (v) => fmtPct(v), style: { stroke: 'var(--ink)' } }] });
  const dolEl = h('div');
  trendChart(dolEl, { years, label: 'Estimated total penalties by fiscal year', yFormat: (d) => `$${d}M`,
    barStyle: (p) => (D.nationalByFy[p.fy].totalSrc?.kind === 'KFF' ? 'var(--p2)' : 'var(--p4)'),
    series: [{ label: 'Estimated total', kind: 'bar', values: nat.map((r) => (r.totalEst ? r.totalEst / 1e6 : null)), fmt: (v) => `$${Math.round(v)}M`,
      tipExtra: (p) => [D.nationalByFy[p.fy].totalSrc?.label || ''] }] });
  const missing = nat.filter((r) => !r.totalEst).map((r) => `FY${r.fy}`).join(', ');

  const timeline = h('ol', { class: 'ledger' }, D.timeline.map((t) => h('li', { class: t.fy && t.fy > D.meta.fy ? 'is-future' : null },
    h('span', { class: 'ledger__date' }, t.fy ? `FY${t.fy}` : t.date.slice(0, 4)),
    h('span', { class: 'ledger__body' }, h('b', {}, t.title), ' ', t.body, ' ',
      safeHref(t.src?.url) ? h('a', { href: safeHref(t.src.url), target: '_blank', rel: 'noopener' }, t.src.label) : null))));

  return part({ no: partNo('history'), id: 'history', title: `${D.edition.yearsWord} years of penalties`, lede: 'The program has penalized most hospitals every year since the cap reached 3%. Peer grouping in FY2019 and pandemic-era exclusions changed who gets penalized and by how much.' },
    h('div', { class: 'grid-2' },
      figure({ title: 'Share of hospitals penalized', take: 'Counts hospitals in each year\'s CMS file; early years exclude Maryland, Puerto Rico, and hospitals with no measured conditions.', source: `CMS HRRP Supplemental Data Files, ${D.edition.span}.`, body: pctEl }),
      figure({ title: 'Average cut', take: 'Red line: among penalized hospitals. Plain line: across all hospitals, counting zeros.', source: `CMS HRRP Supplemental Data Files, ${D.edition.span}.`, body: avgEl })),
    h('div', { class: 'grid-2 grid-2--wide-left' },
      figure({ title: 'Estimated total penalties', take: `Dark bars: CMS estimates from each year's payment rule. Light bars: totals reported by KFF Health News. We found no total for ${missing}.`,
        source: `Federal Register IPPS final rules; KFF Health News. ${D.edition.label} is CMS's rule-time estimate made with preliminary data.`, body: dolEl }),
      figure({ title: 'Timeline', body: timeline })));
}

function researchPart(D) {
  const themes = [...new Set(D.research.map((r) => r.theme))];
  return part({ no: partNo('research'), id: 'research', title: 'What the research says', lede: 'Readmissions fell after the program began. Researchers still disagree about how much of that was better care, and whether there were side effects.' },
    h('div', { class: 'research' }, themes.map((t) => h('section', { class: 'research__theme' },
      h('h3', {}, t),
      h('ul', {}, D.research.filter((r) => r.theme === t).map((r) => h('li', { class: 'cite' },
        h('p', {}, r.finding),
        h('p', { class: 'cite__src' }, safeHref(r.url) ? h('a', { href: safeHref(r.url), target: '_blank', rel: 'noopener' }, r.cite) : r.cite, ` · ${r.title}`))))))));
}

export function renderHome(D, index, state = {}) {
  const S = D.nation;
  return h('div', {},
    hero(D, index, S),
    h('div', { class: 'wrap' },
      explainerPart(D, index),
      picturePart(D, S),
      mapPart(D),
      historyPart(D),
      part({ no: partNo('explore'), id: 'explore', title: 'Every hospital', lede: `All ${fmtInt(D.hospitals.length)} hospitals in the ${D.edition.label} program. Filter, sort, and download.` },
        explorer(D, D.hospitals, { csvName: `hrrp-${D.edition.label.toLowerCase()}-hospitals.csv`, state })),
      researchPart(D)));
}
