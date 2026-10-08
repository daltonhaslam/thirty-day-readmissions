import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { max } from 'd3-array';
import { s, responsive } from '../dom.js';
import { showTip, hideTip } from '../ui/tooltip.js';
import { styleAxis } from './scale.js';
import { fmtInt, binIndex } from '../model.js';

// Histogram of hospitals' dual-eligible share with the five peer-group bands behind it.
export function dualBands(el, { duals, cutoffs, highlight }) {
  const STEP = 0.01;
  const top = Math.min(1, Math.ceil((Math.max(...duals) + 0.01) * 20) / 20);
  const bins = new Array(Math.round(top / STEP)).fill(0);
  for (const d of duals) bins[Math.min(bins.length - 1, binIndex(d, STEP))] += 1;
  responsive(el, (W) => {
    el.replaceChildren();
    const m = { t: 34, r: 14, b: 34, l: 14 };
    const H = 210;
    const x = scaleLinear().domain([0, top]).range([m.l, W - m.r]);
    const y = scaleLinear().domain([0, max(bins)]).range([H - m.b, m.t + 4]);
    const svg = s('svg', { width: W, height: H, role: 'img', 'aria-label': 'Distribution of dual-eligible share with five peer-group bands' });
    el.append(svg);
    const g = select(svg);
    cutoffs.forEach(([lo, hi], i) => {
      const x0 = x(i === 0 ? 0 : lo);
      const x1 = x(i === cutoffs.length - 1 ? top : hi);
      g.append('rect').attr('x', x0).attr('y', m.t - 20).attr('width', Math.max(0, x1 - x0)).attr('height', H - m.b - m.t + 20)
        .attr('fill', i % 2 ? 'var(--paper-2)' : 'var(--form-tint)');
      g.append('text').attr('x', (x0 + x1) / 2).attr('y', m.t - 7).attr('text-anchor', 'middle')
        .attr('font-family', 'var(--font-type)').attr('font-size', 12).attr('fill', 'var(--form-ink)').text(x1 - x0 > 70 ? `Group ${i + 1}` : String(i + 1));
    });
    g.append('g').selectAll('rect.b').data(bins.map((n, i) => ({ n, i }))).join('rect').attr('class', 'b')
      .attr('x', (d) => x(d.i * STEP) + 0.5).attr('width', Math.max(1, x(STEP) - x(0) - 1))
      .attr('y', (d) => y(d.n)).attr('height', (d) => H - m.b - y(d.n)).attr('fill', 'var(--ink)')
      .on('mousemove', (e, d) => showTip(e, `${d.i}–${d.i + 1}% dual-eligible`, [['Hospitals', fmtInt(d.n)]]))
      .on('mouseleave', hideTip);
    if (highlight != null) {
      g.append('line').attr('x1', x(highlight)).attr('x2', x(highlight)).attr('y1', m.t - 4).attr('y2', H - m.b).attr('stroke', 'var(--form)').attr('stroke-width', 3);
    }
    styleAxis(g.append('g').attr('transform', `translate(0,${H - m.b})`).call(axisBottom(x).ticks(Math.min(10, W / 70)).tickFormat((d) => `${Math.round(d * 100)}%`).tickSizeOuter(0)));
  });
}
