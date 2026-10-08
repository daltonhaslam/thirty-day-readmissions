import { h } from '../dom.js';
import { figure, part, field, resetFigures } from '../ui/figure.js';
import { omnibox } from '../ui/omnibox.js';
import { penaltyHistogram } from '../charts/histogram.js';
import { greenbarTable } from '../ui/table.js';
import { summarize, fmtInt, fmtPct, fmtMoney } from '../model.js';
import { hospitalColumns } from './columns.js';
import { link } from '../router.js';

const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function renderHome(D, index) {
  resetFigures();
  const all = D.hospitals;
  const S = summarize(all);
  const nat = D.nationalByFy[D.meta.fy];
  const bigMetro = [...D.byCbsa.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  const hero = h('section', { class: 'hero wrap', 'aria-labelledby': 'hero-title' },
    h('div', {},
      h('div', { class: 'hero__kicker cap' }, `FY${D.meta.fy} edition · Year 15 of Medicare readmission penalties`),
      h('h1', { class: 'hero__title', id: 'hero-title' }, 'Thirty ', h('span', {}, 'Days')),
      h('p', { class: 'hero__deck' },
        'When too many patients land back in the hospital within 30 days of going home, Medicare pays that hospital less for a full year. Starting October 1, 2026, ',
        h('strong', {}, `${fmtInt(S.nPen)} of the ${fmtInt(S.n)} hospitals`), ' CMS evaluated take a cut.'),
      h('div', { class: 'hero__search' }, omnibox(index, { big: true, placeholder: 'Look up a hospital, city, state, or metro area' })),
      h('p', { class: 'hero__hint' }, 'Try ',
        h('a', { href: link('state', 'TX') }, 'Texas'), ', ',
        h('a', { href: link('metro', bigMetro[0]) }, bigMetro[1][0].cbsaName), ', or ',
        h('a', { href: '#explore' }, 'browse every hospital'), '.')),
    h('div', { class: 'hero__card' },
      h('div', { class: 'form summary' },
        h('div', { class: 'form__title' }, h('span', {}, `FY${D.meta.fy} at a glance`), h('span', {}, 'All figures from CMS unless marked')),
        field(1, 'Hospitals evaluated', fmtInt(S.n)),
        field(2, 'Hospitals penalized', fmtInt(S.nPen), { note: `${fmtPct(S.pctPen, 1)} of hospitals` }),
        field(3, 'Average cut, all hospitals', fmtPct(S.meanRed)),
        field(4, 'Average cut, penalized only', fmtPct(S.meanRedPen)),
        field(5, 'At the 3% maximum', fmtInt(S.nMax), { note: 'hospitals' }),
        field(6, 'Estimated dollars', `≈ ${fmtMoney(D.meta.totals.modelPen)}`, { note: `Modeled here. CMS's rule-time estimate: ${fmtMoney(D.meta.totals.cmsEst)}` }),
        field(7, 'Data window', `${fmtDate(D.meta.perf[0])} – ${fmtDate(D.meta.perf[1])}`),
        field(8, 'Payment year', 'Oct 1, 2026 – Sep 30, 2027')),
      h('div', { class: 'hero__stamp' }, h('span', { class: 'stamp' }, `Final · posted ${fmtDate(D.meta.fileDate)}`))));

  const histEl = h('div');
  penaltyHistogram(histEl, { reds: all.map((x) => x.red) });

  const top = [...all].sort((a, b) => b.red - a.red || b.pen - a.pen).slice(0, 10);
  const topTable = greenbarTable({ columns: hospitalColumns(D), rows: top, pageSize: 10, sort: { key: 'red', dir: 'desc' }, csvName: 'largest-penalties.csv' });

  return h('div', {},
    hero,
    h('div', { class: 'wrap' },
      part({ no: 2, id: 'picture', title: `The FY${D.meta.fy} picture`, lede: `Most penalties are small. The typical penalized hospital loses ${fmtPct(S.medianRedPen)} of its base Medicare payments; ${fmtInt(S.nGe1)} lose 1% or more.` },
        figure({ title: 'How big are the cuts?', take: `Each bar counts hospitals by the size of their payment reduction. ${fmtInt(S.n - S.nPen)} hospitals have no reduction.`,
          source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`, body: histEl }),
        figure({ title: 'The largest penalties', take: 'Ten hospitals hit the 3% cap. Select a row to see what drove the penalty.',
          source: `CMS FY${D.meta.fy} HRRP Supplemental Data File; dollar estimates modeled from the FY${D.meta.fy} IPPS impact file.`, body: topTable.el }))));
}
