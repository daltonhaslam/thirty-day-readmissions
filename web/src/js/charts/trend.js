import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { line } from 'd3-shape';
import { s, responsive } from '../dom.js';
import { showTip, hideTip } from '../ui/tooltip.js';
import { styleAxis } from './scale.js';

// Year-by-year chart. series: [{label, kind: 'bar'|'line', values: [v|null], style: {fill|stroke, dash}, fmt}]
// annotations: [{fy, label}]; years: [2013, ...]
export function trendChart(el, { years, series, yMax, yFormat, annotations = [], height = 260, label, barStyle }) {
  responsive(el, (W) => {
    el.replaceChildren();
    const m = { t: annotations.length ? 46 : 16, r: 12, b: 30, l: 46 };
    const x = scaleBand().domain(years).range([m.l, W - m.r]).padding(0.22);
    const top = yMax ?? Math.max(...series.flatMap((sr) => sr.values.filter((v) => v != null)), 1e-9) * 1.1;
    const y = scaleLinear().domain([0, top]).nice().range([height - m.b, m.t]);
    const svg = s('svg', { width: W, height, role: 'img', 'aria-label': label });
    el.append(svg);
    const g = select(svg);
    g.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', 'var(--bar-line)');
    const every = W < 520 ? 2 : 1;
    styleAxis(g.append('g').attr('transform', `translate(0,${height - m.b})`)
      .call(axisBottom(x).tickValues(years.filter((_, i) => i % every === 0 || years[i] === years[years.length - 1])).tickFormat((d) => `'${String(d).slice(2)}`).tickSizeOuter(0)));
    styleAxis(g.append('g').attr('transform', `translate(${m.l},0)`).call(axisLeft(y).ticks(4).tickFormat(yFormat).tickSizeOuter(0)));
    annotations.forEach((a, i) => {
      const ax = x(a.fy) + x.bandwidth() / 2;
      const ty = 12 + (i % 2) * 15;
      g.append('line').attr('x1', ax).attr('x2', ax).attr('y1', ty + 3).attr('y2', height - m.b).attr('stroke', 'var(--form)').attr('stroke-dasharray', '2 3');
      g.append('text').attr('x', Math.min(ax + 3, W - 4)).attr('y', ty).attr('text-anchor', ax > W - 90 ? 'end' : 'start')
        .attr('font-family', 'var(--font-type)').attr('font-size', 10.5).attr('fill', 'var(--form-ink)').text(a.label);
    });
    for (const sr of series) {
      const pts = years.map((fy, i) => ({ fy, v: sr.values[i] })).filter((p) => p.v != null);
      if (sr.kind === 'bar') {
        g.append('g').selectAll('text').data(years.filter((_, i) => sr.values[i] == null)).join('text')
          .attr('x', (fy) => x(fy) + x.bandwidth() / 2).attr('y', y(0) - 5).attr('text-anchor', 'middle')
          .attr('font-family', 'var(--font-type)').attr('font-size', 10).attr('fill', 'var(--ink-3)').text('n/a');
        g.append('g').selectAll('rect').data(pts).join('rect')
          .attr('x', (p) => x(p.fy)).attr('width', x.bandwidth()).attr('y', (p) => y(p.v)).attr('height', (p) => y(0) - y(p.v))
          .attr('fill', (p) => (barStyle ? barStyle(p) : sr.style?.fill || 'var(--p3)')).attr('stroke', 'var(--ink)').attr('stroke-width', 0.6)
          .on('mousemove', (e, p) => showTip(e, `FY${p.fy}`, [[sr.label, sr.fmt(p.v)], ...(sr.tipExtra ? sr.tipExtra(p) : [])]))
          .on('mouseleave', hideTip);
      } else {
        const gen = line().x((p) => x(p.fy) + x.bandwidth() / 2).y((p) => y(p.v)).defined((p) => p.v != null);
        g.append('path').attr('d', gen(years.map((fy, i) => ({ fy, v: sr.values[i] }))))
          .attr('fill', 'none').attr('stroke', sr.style?.stroke || 'var(--ink)').attr('stroke-width', sr.style?.width || 2.2)
          .attr('stroke-dasharray', sr.style?.dash || null);
        g.append('g').selectAll('circle').data(pts).join('circle')
          .attr('cx', (p) => x(p.fy) + x.bandwidth() / 2).attr('cy', (p) => y(p.v)).attr('r', sr.style?.r ?? 3.2)
          .attr('fill', sr.style?.dot || sr.style?.stroke || 'var(--ink)').attr('stroke', 'var(--paper)').attr('stroke-width', 1)
          .on('mousemove', (e, p) => showTip(e, `FY${p.fy}`, [[sr.label, sr.fmt(p.v)]]))
          .on('mouseleave', hideTip);
      }
    }
  });
}
