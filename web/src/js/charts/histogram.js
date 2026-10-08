import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { max } from 'd3-array';
import { s, responsive } from '../dom.js';
import { showTip, hideTip } from '../ui/tooltip.js';
import { rampVar, styleAxis } from './scale.js';
import { fmtInt, fmtPct, mean } from '../model.js';

const STEP = 0.1;
const N_BINS = 30; // 0-3% in 0.1-point bins

function binCounts(reds) {
  const zero = reds.filter((r) => r <= 0).length;
  const bins = new Array(N_BINS).fill(0);
  for (const r of reds) if (r > 0) bins[Math.min(N_BINS - 1, Math.floor((r - 1e-9) / STEP))] += 1;
  return { zero, bins };
}

// Distribution of payment reductions. `compare` (optional) overlays another population as an outline; both shown as shares.
export function penaltyHistogram(el, { reds, compare, compareLabel = 'All hospitals', label = 'These hospitals', height = 240 }) {
  const asShare = Boolean(compare);
  const a = binCounts(reds);
  const b = compare ? binCounts(compare) : null;
  const norm = (n, tot) => (asShare ? (100 * n) / Math.max(tot, 1) : n);
  const avg = mean(reds);

  responsive(el, (W) => {
    el.replaceChildren();
    const m = { t: 26, r: 12, b: 38, l: 44 };
    const w = W - m.l - m.r;
    const hgt = height - m.t - m.b;
    const zeroW = Math.max(18, w * 0.06);
    const gap = 14;
    const x = scaleLinear().domain([0, 3]).range([zeroW + gap, w]);
    const yMax = max([norm(a.zero, reds.length), ...a.bins.map((n) => norm(n, reds.length)),
      ...(b ? [norm(b.zero, compare.length), ...b.bins.map((n) => norm(n, compare.length))] : [])]) || 1;
    const y = scaleLinear().domain([0, yMax]).nice().range([hgt, 0]);
    const svg = s('svg', { width: W, height, role: 'img', 'aria-label': `Histogram of FY2027 payment reductions; average ${fmtPct(avg)}` });
    el.append(svg);
    const g = select(svg).append('g').attr('transform', `translate(${m.l},${m.t})`);

    styleAxis(g.append('g').attr('transform', `translate(0,${hgt})`)
      .call(axisBottom(x).tickValues([0, 0.5, 1, 1.5, 2, 2.5, 3]).tickFormat((d) => `${d}%`).tickSizeOuter(0)));
    styleAxis(g.append('g').call(axisLeft(y).ticks(5).tickFormat((d) => (asShare ? `${d}%` : fmtInt(d))).tickSizeOuter(0)));
    g.append('text').attr('x', zeroW / 2).attr('y', hgt + 30).attr('text-anchor', 'middle')
      .attr('fill', 'var(--ink-2)').attr('font-family', 'var(--font-type)').attr('font-size', 11).text('none');
    g.append('text').attr('x', 0).attr('y', -12).attr('fill', 'var(--ink-3)').attr('font-family', 'var(--font-type)')
      .attr('font-size', 11).text(asShare ? 'share of hospitals' : 'hospitals');

    const tip = (title, n, tot) => (e) => showTip(e, title, [[label, `${fmtInt(n)} (${fmtPct((100 * n) / Math.max(tot, 1), 1)})`]]);
    const bars = [{ x0: 0, x1: zeroW, n: a.zero, red: 0, title: 'No penalty' },
      ...a.bins.map((n, i) => ({ x0: x(i * STEP), x1: x((i + 1) * STEP), n, red: (i + 0.5) * STEP,
        title: `${(i * STEP).toFixed(1)}–${((i + 1) * STEP).toFixed(1)}% reduction` }))];
    g.append('g').selectAll('rect').data(bars).join('rect')
      .attr('x', (d) => d.x0 + 0.5).attr('width', (d) => Math.max(1, d.x1 - d.x0 - 1))
      .attr('y', (d) => y(norm(d.n, reds.length))).attr('height', (d) => hgt - y(norm(d.n, reds.length)))
      .attr('fill', (d) => (d.red === 0 ? 'var(--p0)' : rampVar(d.red))).attr('stroke', 'var(--ink)').attr('stroke-width', 0.6)
      .on('mousemove', (e, d) => tip(d.title, d.n, reds.length)(e)).on('mouseleave', hideTip);

    if (b) {
      const pts = [[0, b.zero, zeroW], ...b.bins.map((n, i) => [x(i * STEP), n, x((i + 1) * STEP)])];
      const path = pts.map(([x0, n, x1]) => `M${x0},${y(norm(n, compare.length))}H${x1}`).join('');
      g.append('path').attr('d', path).attr('fill', 'none').attr('stroke', 'var(--ink)').attr('stroke-width', 2);
    }

    const ax = x(avg);
    g.append('line').attr('x1', ax).attr('x2', ax).attr('y1', -4).attr('y2', hgt)
      .attr('stroke', 'var(--ink)').attr('stroke-dasharray', '3 3');
    g.append('text').attr('x', ax + 5).attr('y', 4).attr('fill', 'var(--ink)').attr('font-family', 'var(--font-type)')
      .attr('font-size', 12).text(`average ${fmtPct(avg)}`);
  });
}
