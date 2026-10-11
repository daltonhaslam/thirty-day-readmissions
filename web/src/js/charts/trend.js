import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { line } from 'd3-shape';
import { s, responsive } from '../dom.js';
import { showTip, hideTip } from '../ui/tooltip.js';
import { styleAxis } from './scale.js';

// Labels are Courier Prime at 10.5px, which advances 0.6em per character.
const LABEL_PX = 10.5;
const CHAR_W = LABEL_PX * 0.6;
const LABEL_GAP = 4; // least space between two labels in one row
const ROW_H = 14;
const LEFT = 46; // left margin, for the y-axis labels
export const NARROW = 520;

// Lay out marker labels in rows above the plot. items: [{x, text}], where a label begins at `x`, or ends there when
// beginning there would run past `hi`. Each label takes the first row it clears by LABEL_GAP.
// Returns the labels with x0/x1/row, and the number of rows.
export function layoutLabels(items, { lo, hi }) {
  const placed = items.map((it) => {
    const w = it.text.length * CHAR_W;
    const x0 = Math.max(lo, it.x + w > hi ? Math.min(it.x, hi) - w : it.x);
    return { ...it, x0, x1: x0 + w };
  }).sort((a, b) => a.x0 - b.x0);
  const ends = [];
  for (const p of placed) {
    let row = ends.findIndex((e) => p.x0 >= e + LABEL_GAP);
    if (row < 0) row = ends.length;
    ends[row] = p.x1;
    p.row = row;
  }
  return { placed, rows: ends.length };
}

// Year-by-year chart. series: [{label, kind: 'bar'|'line', values: [v|null], style: {fill|stroke, dash}, fmt}]
// annotations: [{fy, label, short?}] dashed rule lines, labeled in rows above the plot;
// bands: [{from, to, label, short?}] shaded spans of years, labeled under the axis. Narrow charts use short labels.
export function trendChart(el, { years, series, yMax, yFormat, annotations = [], bands = [], height = 260, label, barStyle }) {
  responsive(el, (W) => {
    el.replaceChildren();
    const x = scaleBand().domain(years).range([LEFT, W - 12]).padding(0.22);
    const half = (x.step() * x.padding()) / 2;
    const text = (a) => (W < NARROW && a.short ? a.short : a.label);
    const shown = bands.filter((b) => x(b.from) != null && x(b.to) != null);
    const { placed, rows } = layoutLabels(annotations.filter((a) => x(a.fy) != null).map((a) => {
      const ax = x(a.fy) + x.bandwidth() / 2;
      return { ax, x: ax + 3, text: text(a) };
    }), { lo: LEFT, hi: W - 2 });
    const m = { t: rows ? 8 + rows * ROW_H + 6 : 16, r: 12, b: shown.length ? 46 : 30, l: LEFT };
    // Label rows and band labels add height rather than squeezing the plot.
    const H = height + Math.max(0, m.t - 46) + m.b - 30;
    const top = yMax ?? Math.max(...series.flatMap((sr) => sr.values.filter((v) => v != null)), 1e-9) * 1.1;
    const y = scaleLinear().domain([0, top]).nice().range([H - m.b, m.t]);
    const svg = s('svg', { width: W, height: H, role: 'img', 'aria-label': label });
    el.append(svg);
    const g = select(svg);
    // A band's shading runs down past the axis to its label, so the label sits under the years it names.
    for (const b of shown) {
      const x0 = x(b.from) - half;
      const x1 = x(b.to) + x.bandwidth() + half;
      g.append('rect').attr('x', x0).attr('width', x1 - x0).attr('y', m.t).attr('height', H - 2 - m.t)
        .attr('fill', 'var(--p0)').attr('fill-opacity', 0.75).attr('pointer-events', 'none');
      g.append('text').attr('x', (x0 + x1) / 2).attr('y', H - 7).attr('text-anchor', 'middle')
        .attr('font-family', 'var(--font-type)').attr('font-size', LABEL_PX).attr('fill', 'var(--ink-2)').text(text(b));
    }
    g.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', 'var(--bar-line)');
    const every = W < NARROW ? 2 : 1;
    styleAxis(g.append('g').attr('transform', `translate(0,${H - m.b})`)
      .call(axisBottom(x).tickValues(years.filter((_, i) => i % every === 0 || years[i] === years[years.length - 1])).tickFormat((d) => `'${String(d).slice(2)}`).tickSizeOuter(0)));
    styleAxis(g.append('g').attr('transform', `translate(${m.l},0)`).call(axisLeft(y).ticks(4).tickFormat(yFormat).tickSizeOuter(0)));
    // Rule lines start at the plot, below every label row, so a line never runs through another label.
    for (const p of placed) {
      g.append('line').attr('x1', p.ax).attr('x2', p.ax).attr('y1', m.t - 4).attr('y2', H - m.b).attr('stroke', 'var(--form)').attr('stroke-dasharray', '2 3');
      g.append('text').attr('x', p.x0).attr('y', 8 + (p.row + 1) * ROW_H - 3)
        .attr('font-family', 'var(--font-type)').attr('font-size', LABEL_PX).attr('fill', 'var(--form-ink)').text(p.text);
    }
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
