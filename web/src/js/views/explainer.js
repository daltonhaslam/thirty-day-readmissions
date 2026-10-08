import { h, clear } from '../dom.js';
import { figure, part, field } from '../ui/figure.js';
import { barRows } from '../charts/bars.js';
import { stripPlot } from '../charts/strip.js';
import { dualBands } from '../charts/dualBands.js';
import { CONDS, PEERS, contrib, peerMedian, condState, isMeasured, MIN_DISCHARGES, fmtInt, fmtPct, fmtMoney } from '../model.js';
import { link, partNo } from '../router.js';
import { omnibox } from '../ui/omnibox.js';

const f4 = (v) => (v == null ? '—' : v.toFixed(4));

// Pick a typical, readable example: median-sized penalty, several conditions counted.
export function exampleHospital(D) {
  const pen = D.hospitals.filter((x) => x.flags.length >= 3 && x.beds >= 150 && x.paf < 1).sort((a, b) => a.red - b.red);
  return pen[Math.floor(pen.length / 2)] || D.hospitals[0];
}

function stepHead(n, title, text) {
  return h('div', { class: 'step__head' }, h('span', { class: 'step__no' }, String(n)), h('div', {}, h('h3', {}, title), h('p', { class: 'muted' }, text)));
}

export function worksheet(D, hosp, { compact = false } = {}) {
  const r = contrib(hosp, D.meta);
  const rows = CONDS.map((k) => {
    const c = hosp.c[k];
    const med = peerMedian(D.meta, hosp.peer, k);
    const n = c?.n ?? 0;
    const state = condState(hosp, k, D.meta, r.byCond);
    const counted = state === 'counted' && r.byCond[k] > 0;
    const why = { none: 'no cases', few: `under ${MIN_DISCHARGES} cases`, below: 'at or below median', counted: 'rounds to 0' }[state];
    return h('tr', { class: counted ? 'is-on' : 'is-off' },
      h('th', { scope: 'row' }, D.condByKey[k].short),
      h('td', { class: 'num' }, n ? fmtInt(n) : '—'),
      h('td', { class: 'num' }, f4(c?.err)),
      h('td', { class: 'num' }, f4(med)),
      h('td', { class: 'num' }, counted ? `+${(c.err - med).toFixed(4)}` : why),
      h('td', { class: 'num' }, f4(c?.ratio)),
      h('td', { class: 'num strong' }, counted ? `${(r.byCond[k] * 100).toFixed(3)}%` : '0'));
  });
  const recomputed = r.paf;
  const match = Math.abs(recomputed - hosp.paf) < 1e-9;
  return h('div', { class: 'worksheet' },
    h('div', { class: 'worksheet__title' },
      h('span', {}, 'Worksheet R · Readmissions payment adjustment'),
      h('span', {}, D.edition.label)),
    h('div', { class: 'form worksheet__id' },
      field('A', 'Hospital', h('a', { href: link('hospital', hosp.id) }, hosp.name), { note: `${hosp.place} · CCN ${hosp.id}` }),
      field('B', 'Peer group', `${hosp.peer} of 5`, { note: `${fmtPct(hosp.dual * 100, 1)} dual-eligible stays` }),
      field('C', 'Neutrality modifier', f4(D.meta.nm), { note: 'same for every hospital' })),
    h('div', { class: 'printout__scroll' }, h('table', { class: 'ws' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Condition'), h('th', { scope: 'col', class: 'num' }, 'Line 1', h('br'), 'Cases'),
        h('th', { scope: 'col', class: 'num' }, 'Line 2', h('br'), 'Ratio (ERR)'), h('th', { scope: 'col', class: 'num' }, 'Line 3', h('br'), 'Peer median'),
        h('th', { scope: 'col', class: 'num' }, 'Line 4', h('br'), 'Excess (2 − 3)'), h('th', { scope: 'col', class: 'num' }, 'Line 5', h('br'), 'Payment weight'),
        h('th', { scope: 'col', class: 'num' }, 'Line 6', h('br'), 'C × 4 × 5'))),
      h('tbody', {}, rows))),
    h('ol', { class: 'ws__totals' },
      h('li', {}, h('span', {}, 'Line 7 · Sum of line 6'), h('b', {}, `${(r.sum * 100).toFixed(3)}%`)),
      h('li', {}, h('span', {}, 'Line 8 · Line 7, capped at 3%, rounded'), h('b', {}, fmtPct(Math.round(r.reduction * 1e4) / 100))),
      h('li', {}, h('span', {}, 'Line 9 · Payment adjustment factor (1 − line 8)'), h('b', {}, recomputed.toFixed(4))),
      h('li', { class: 'ws__check' }, h('span', {}, `CMS published factor`), h('b', {}, `${hosp.paf.toFixed(4)} ${match ? '· matches' : '· differs by 0.0001 (CMS rounds after computing with unrounded inputs)'}`)),
      compact ? null : h('li', {}, h('span', {}, `Applied to every traditional Medicare base payment, ${D.edition.payShort}`), h('b', {}, `≈ ${fmtMoney(hosp.pen)} estimated`))));
}

export function explainerPart(D, index) {
  const all = D.hospitals;
  const ex = exampleHospital(D);

  // Step 1: eligibility per condition
  const elig = CONDS.map((k) => ({ k, n: all.filter((x) => isMeasured(x.c[k])).length,
    cases: all.reduce((s, x) => s + (x.c[k]?.n ?? 0), 0) }));
  const step1 = barRows(elig.map((e) => ({ label: D.condByKey[e.k].short, note: D.condByKey[e.k].label.replace(/\s*\(.*\)$/, ''),
    value: e.n, display: `${fmtInt(e.n)} hospitals` })), { max: all.length, ink: true });

  // Step 2: ERR strip with condition toggle
  const stripEl = h('div');
  const condBtns = h('div', { class: 'seg', role: 'group', 'aria-label': 'Condition' });
  const drawStrip = (k) => {
    for (const b of condBtns.children) b.setAttribute('aria-pressed', String(b.dataset.k === k));
    const pts = all.filter((x) => isMeasured(x.c[k])).map((x) => ({
      id: x.id, row: 'r', x: x.c[k].err, fill: x.c[k].err > 1 ? 'var(--form)' : 'var(--ink-3)',
      tip: () => [x.name, [['Ratio', x.c[k].err.toFixed(4)], ['Cases', fmtInt(x.c[k].n)], x.place]], href: link('hospital', x.id),
    }));
    stripPlot(stripEl, { rows: [{ key: 'r', label: '' }], points: pts, domain: [0.7, 1.3], ticks: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3],
      tickFormat: (d) => d.toFixed(1), refs: [{ value: 1, label: '1.0 = as expected' }], highlight: ex.id, rowH: 150,
      label: `Excess readmission ratios for ${D.condByKey[k].short}` });
  };
  for (const k of CONDS) condBtns.append(h('button', { class: 'btn', type: 'button', 'data-k': k, onclick: () => drawStrip(k) }, D.condByKey[k].short));
  drawStrip('HF');

  // Step 3: dual bands
  const bandEl = h('div');
  dualBands(bandEl, { duals: all.map((x) => x.dual), cutoffs: D.meta.peerCutoffs });

  // Step 4: peer medians grid
  const grid = h('div', { class: 'printout__scroll' }, h('table', { class: 'ws ws--grid' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Peer group'), CONDS.map((k) => h('th', { scope: 'col', class: 'num' }, D.condByKey[k].short)))),
    h('tbody', {}, PEERS.map((p) => h('tr', {},
      h('th', { scope: 'row' }, `${p} · ${fmtPct(D.meta.peerCutoffs[p - 1][0] * 100, 0)}–${fmtPct(D.meta.peerCutoffs[p - 1][1] * 100, 0)} dual`),
      CONDS.map((k) => { const v = peerMedian(D.meta, p, k); return h('td', { class: `num ${v > 1 ? 'hi' : ''}` }, v.toFixed(4)); }))))));

  // Step 5: worksheet with hospital picker
  const wsHolder = h('div');
  const showWs = (hosp) => clear(wsHolder).append(worksheet(D, hosp));
  showWs(ex);
  const picker = omnibox(index, { placeholder: 'Try another hospital: name, city, or CCN', types: ['hospital'],
    onPick: (r) => showWs(D.byId.get(r.key)) });

  const newBox = h('aside', { class: 'callout' },
    h('div', { class: 'callout__title cap' }, `New for ${D.edition.label}`),
    h('ul', {},
      h('li', {}, h('b', {}, 'Medicare Advantage patients now count. '), 'The ratios include patients in private Medicare Advantage plans for the first time. The cut still applies only to traditional Medicare payments.'),
      h('li', {}, h('b', {}, 'Two years of data instead of three. '), `Discharges from ${D.edition.perfLong}.`),
      h('li', {}, h('b', {}, 'COVID-19 patients are back in. '), 'The pandemic-era exclusion ended.'),
      h('li', {}, h('b', {}, 'Coming in FY2030: '), 'readmissions after sepsis become a seventh measure.')));

  const whoBox = h('aside', { class: 'callout callout--ink' },
    h('div', { class: 'callout__title cap' }, 'Who is in the program'),
    h('p', {}, `About ${fmtInt(Math.round(all.length / 100) * 100)} general acute-care hospitals paid under Medicare's inpatient prospective payment system. Not included: critical access hospitals, children's, cancer, psychiatric, rehabilitation, and long-term care hospitals. Maryland hospitals run under their own payment model and are exempt; Puerto Rico hospitals are not subject to the cut.`));

  return part({ no: partNo('how'), id: 'how', title: 'How the penalty works', lede: `CMS runs the same arithmetic for every hospital. Here it is in five steps, using the real ${D.edition.label} numbers.` },
    h('div', { class: 'grid-2' }, newBox, whoBox),
    h('ol', { class: 'steps' },
      h('li', { class: 'step' }, stepHead(1, 'Six kinds of stays are tracked',
        `For each one, CMS counts patients who come back to any hospital within 30 days, for any reason. A hospital needs at least ${MIN_DISCHARGES} cases of a condition for it to count.`),
        figure({ title: 'Hospitals with enough cases to be measured', take: 'Heart failure and pneumonia are measured almost everywhere; bypass surgery only at hospitals that do heart surgery.',
          source: `CMS FY${D.meta.fy} HRRP Supplemental Data File (eligible discharges).`, body: step1 })),
      h('li', { class: 'step' }, stepHead(2, 'Each hospital gets a ratio',
        'The excess readmission ratio (ERR) divides the readmissions CMS predicts for this hospital by the readmissions an average hospital would have with the same patients. Above 1.0 means more than expected.'),
        figure({ title: 'Every hospital\'s ratio, one dot each', take: `Red dots are above 1.0. The large dot is ${ex.name}, used in the worksheet below. Select a dot to open that hospital.`,
          source: `CMS FY${D.meta.fy} HRRP Supplemental Data File. Hospitals with at least ${MIN_DISCHARGES} cases.`, body: h('div', {}, h('div', { class: 'controls' }, condBtns), stripEl) })),
      h('li', { class: 'step' }, stepHead(3, 'Hospitals are compared with peers',
        'Since FY2019, hospitals are split into five equal groups by the share of their Medicare patients who also qualify for full Medicaid, a common marker of low income. Each hospital is judged only against its own group.'),
        figure({ title: 'Share of stays from dual-eligible patients', take: 'Group 1 serves the fewest low-income patients; group 5 the most. Each band holds about a fifth of hospitals.',
          source: `CMS FY${D.meta.fy} HRRP Supplemental Data File (dual proportion, peer group).`, body: bandEl })),
      h('li', { class: 'step' }, stepHead(4, 'The bar to clear is the group median',
        'A condition adds to the penalty only if the hospital\'s ratio is above its peer group\'s median for that condition. Half of each group is above the median by definition, which is why most hospitals end up with some penalty.'),
        figure({ title: `Peer-group medians for ${D.edition.label}`, take: 'The medians differ slightly by group. Shaded cells are above 1.0.',
          source: `CMS FY${D.meta.fy} HRRP Supplemental Data File.`, body: grid })),
      h('li', { class: 'step' }, stepHead(5, 'The worksheet',
        'Each condition above its median adds its excess, weighted by how much of the hospital\'s Medicare payments that condition represents. The total is capped at 3% and applied to every traditional Medicare inpatient base payment for the year, not just the readmissions.'),
        h('div', { class: 'ws-picker' }, picker),
        wsHolder)));
}
