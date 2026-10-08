import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisTop } from 'd3-axis';
import { s, responsive } from '../dom.js';
import { showTip, hideTip } from '../ui/tooltip.js';
import { styleAxis } from './scale.js';
import { niceDomain } from '../model.js';

// One row per condition: peer-group 10th–90th band, peer median tick, this hospital's ratio dot.
// rows: [{key, label, sub, err, med, band:[lo,hi]|null, state:'counted'|'below'|'few'|'none'}]
export function errRows(el, { rows, label }) {
  const vals = rows.flatMap((r) => [r.err, r.med, ...(r.band || [])]).filter((v) => v != null);
  const domain = niceDomain(vals, [0.75, 1.25], 0.05, 0.02);
  responsive(el, (W) => {
    el.replaceChildren();
    const narrow = W < 560;
    const m = { t: 26, r: 18, b: 8, l: narrow ? 12 : 170 };
    const rowH = narrow ? 58 : 42;
    const H = m.t + m.b + rows.length * rowH;
    const x = scaleLinear().domain(domain).range([m.l, W - m.r]).clamp(true);
    const svg = s('svg', { width: W, height: H, role: 'img', 'aria-label': label });
    el.append(svg);
    const g = select(svg);
    styleAxis(g.append('g').attr('transform', `translate(0,${m.t - 6})`).call(axisTop(x).ticks(narrow ? 5 : 10).tickFormat((d) => d.toFixed(2)).tickSizeOuter(0)));
    g.append('line').attr('x1', x(1)).attr('x2', x(1)).attr('y1', m.t - 6).attr('y2', H - m.b).attr('stroke', 'var(--ink-3)').attr('stroke-dasharray', '2 3');
    rows.forEach((r, i) => {
      const y0 = m.t + i * rowH;
      const cy = narrow ? y0 + 38 : y0 + rowH / 2;
      g.append('rect').attr('x', 0).attr('y', y0).attr('width', W).attr('height', rowH).attr('fill', i % 2 ? 'transparent' : 'var(--bar)');
      const lab = g.append('text').attr('x', narrow ? m.l : m.l - 12).attr('y', narrow ? y0 + 16 : cy - 2).attr('text-anchor', narrow ? 'start' : 'end')
        .attr('font-family', 'var(--font-body)').attr('font-weight', 600).attr('font-size', 13).attr('fill', 'var(--ink)').text(r.label);
      g.append('text').attr('x', narrow ? m.l + lab.node().getComputedTextLength() + 8 : m.l - 12).attr('y', narrow ? y0 + 16 : cy + 12)
        .attr('text-anchor', narrow ? 'start' : 'end').attr('font-family', 'var(--font-type)').attr('font-size', 11).attr('fill', 'var(--ink-2)').text(r.sub);
      if (r.band) {
        g.append('rect').attr('x', x(r.band[0])).attr('width', Math.max(1, x(r.band[1]) - x(r.band[0]))).attr('y', cy - 6).attr('height', 12)
          .attr('fill', 'var(--paper-2)').attr('stroke', 'var(--ink-3)').attr('stroke-width', 0.6);
      }
      if (r.med != null) {
        g.append('line').attr('x1', x(r.med)).attr('x2', x(r.med)).attr('y1', cy - 10).attr('y2', cy + 10).attr('stroke', 'var(--ink)').attr('stroke-width', 2.5);
      }
      if (r.err != null) {
        const counted = r.state === 'counted';
        g.append('circle').attr('cx', x(r.err)).attr('cy', cy).attr('r', 6.5)
          .attr('fill', counted ? 'var(--form)' : r.state === 'few' ? 'var(--paper)' : 'var(--ink)')
          .attr('stroke', 'var(--ink)').attr('stroke-width', 1.5)
          .on('mousemove', (e) => showTip(e, r.label, [['Ratio', r.err.toFixed(4)], ['Peer median', r.med?.toFixed(4) ?? '—'],
            r.band ? ['Middle 80% of peers', `${r.band[0].toFixed(3)}–${r.band[1].toFixed(3)}`] : '', r.sub]))
          .on('mouseleave', hideTip);
      }
    });
  });
}
