import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { s, responsive } from '../dom.js';
import { showTip, hideTip } from '../ui/tooltip.js';
import { styleAxis } from './scale.js';

// Stable pseudo-random jitter from a string id.
export function jitter(id) {
  let x = 2166136261;
  for (let i = 0; i < id.length; i += 1) x = Math.imul(x ^ id.charCodeAt(i), 16777619);
  return ((x >>> 0) % 10007) / 10007;
}

// Jittered strip plot. rows: [{key, label}] (one band each); points: [{id, row, x, fill, tip:[title, rows]}]
export function stripPlot(el, { rows, points, domain, ticks, tickFormat, refs = [], medians = {}, highlight, onPoint, rowH = 46, label }) {
  responsive(el, (W) => {
    el.replaceChildren();
    const m = { t: 18, r: 14, b: 32, l: rows.length > 1 ? 92 : 14 };
    const H = m.t + m.b + rows.length * rowH;
    const x = scaleLinear().domain(domain).range([m.l, W - m.r]).clamp(true);
    const svg = s('svg', { width: W, height: H, role: 'img', 'aria-label': label });
    el.append(svg);
    const g = select(svg);
    styleAxis(g.append('g').attr('transform', `translate(0,${H - m.b})`).call(axisBottom(x).tickValues(ticks).tickFormat(tickFormat).tickSizeOuter(0)));
    rows.forEach((r, i) => {
      const y0 = m.t + i * rowH;
      g.append('rect').attr('x', m.l).attr('y', y0 + 3).attr('width', W - m.l - m.r).attr('height', rowH - 6)
        .attr('fill', i % 2 ? 'transparent' : 'var(--bar)');
      if (rows.length > 1) {
        g.append('text').attr('x', m.l - 8).attr('y', y0 + rowH / 2 + 4).attr('text-anchor', 'end')
          .attr('font-family', 'var(--font-body)').attr('font-size', 12).attr('font-weight', 600).attr('fill', 'var(--ink)').text(r.label);
      }
      if (medians[r.key] != null) {
        const mx = x(medians[r.key]);
        g.append('line').attr('x1', mx).attr('x2', mx).attr('y1', y0 + 2).attr('y2', y0 + rowH - 2).attr('stroke', 'var(--ink)').attr('stroke-width', 2.5);
      }
    });
    for (const ref of refs) {
      const rx = x(ref.value);
      g.append('line').attr('x1', rx).attr('x2', rx).attr('y1', m.t - 6).attr('y2', H - m.b).attr('stroke', 'var(--ink)').attr('stroke-dasharray', '3 3');
      g.append('text').attr('x', rx + 4).attr('y', m.t - 6).attr('font-family', 'var(--font-type)').attr('font-size', 11).attr('fill', 'var(--ink)').text(ref.label);
    }
    const rowIdx = Object.fromEntries(rows.map((r, i) => [r.key, i]));
    const ordered = [...points].sort((a, b) => (a.id === highlight) - (b.id === highlight));
    g.append('g').selectAll('circle').data(ordered).join('circle')
      .attr('cx', (p) => x(p.x))
      .attr('cy', (p) => m.t + rowIdx[p.row] * rowH + 7 + jitter(p.id) * (rowH - 14))
      .attr('r', (p) => (p.id === highlight ? 6 : 2.3))
      .attr('fill', (p) => p.fill).attr('fill-opacity', (p) => (p.id === highlight ? 1 : 0.75))
      .attr('stroke', (p) => (p.id === highlight ? 'var(--ink)' : 'none')).attr('stroke-width', 2)
      .style('cursor', onPoint ? 'pointer' : null)
      .on('mousemove', (e, p) => p.tip && showTip(e, p.tip[0], p.tip[1]))
      .on('mouseleave', hideTip)
      .on('click', (e, p) => onPoint?.(p));
  });
}
