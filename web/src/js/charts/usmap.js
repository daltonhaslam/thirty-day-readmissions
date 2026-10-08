import { select } from 'd3-selection';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { scaleSqrt } from 'd3-scale';
import { feature, mesh } from 'topojson-client';
import { s, h, responsive } from '../dom.js';
import { showTip, hideTip } from '../ui/tooltip.js';
import { rampVar, BINS } from './scale.js';
import { summarize, fmtPct, fmtInt, fmtMoney } from '../model.js';

const step = (cuts, labels) => ({ cls: (v) => `p${1 + cuts.filter((c) => v >= c).length}`, labels });
export const METRICS = {
  avg: { label: 'Average cut', value: (sm) => sm.meanRed, fmt: (v) => fmtPct(v),
    ...step([0.25, 0.35, 0.45, 0.6], ['under 0.25%', '0.25–0.34%', '0.35–0.44%', '0.45–0.59%', '0.60%+']) },
  pct: { label: 'Share penalized', value: (sm) => sm.pctPen, fmt: (v) => fmtPct(v, 0),
    ...step([70, 80, 85, 90], ['under 70%', '70–79%', '80–84%', '85–89%', '90%+']) },
  dollars: { label: 'Estimated dollars', value: (sm) => sm.penTotal, fmt: (v) => fmtMoney(v),
    ...step([2e6, 5e6, 10e6, 20e6], ['under $2M', '$2–5M', '$5–10M', '$10–20M', '$20M+']) },
  ge1: { label: 'Hospitals cut 1%+', value: (sm) => (sm.n ? (100 * sm.nGe1) / sm.n : 0), fmt: (v) => fmtPct(v, 0),
    ...step([4, 8, 12, 16], ['under 4%', '4–7%', '8–11%', '12–15%', '16%+']) },
};

let topoCache = null;
function geometry(D) {
  if (!topoCache) {
    const topo = D.geo.states;
    const byName = Object.fromEntries(Object.entries(D.meta.states).map(([ab, name]) => [name, ab]));
    const states = feature(topo, topo.objects.states).features.map((f) => ({ ...f, abbr: byName[f.properties.name] || null }));
    topoCache = { states, borders: mesh(topo, topo.objects.states, (a, b) => a !== b) };
  }
  return topoCache;
}

export function mapLegend(metricKey) {
  const m = METRICS[metricKey];
  return h('div', { class: 'legend' },
    m.labels.map((l, i) => h('span', {}, h('span', { class: 'sw', style: { background: `var(--p${i + 1})` } }), l)),
    h('span', {}, h('span', { class: 'sw sw--hatch' }), 'not in program'));
}

export function dotLegend() {
  return h('div', { class: 'legend' }, h('span', { class: 'cap muted' }, 'Hospital dots, by cut:'),
    BINS.map((b, i) => h('span', {}, h('span', { class: 'sw sw--dot', style: { background: i === 0 ? 'var(--paper)' : `var(--${b.cls})` } }), b.label)));
}

// opts: { metric, plain (neutral state fill), dots, hospitals (dots), context (faint gray dots), focusStates: [abbr] | null, focusPoints: bool, onState, onHospital }
export function usMap(el, D, opts) {
  const { states, borders } = geometry(D);
  let o = { ...opts };
  const stateSummary = new Map([...D.byState.entries()].map(([st, list]) => [st, summarize(list)]));
  const draw = (W) => {
    el.replaceChildren();
    const H = Math.round(Math.min(W * 0.62, 640));
    const proj = geoAlbersUsa();
    const focusFeatures = o.focusStates ? states.filter((f) => o.focusStates.includes(f.abbr)) : null;
    const pts = (o.hospitals || []).filter((x) => x.lat != null);
    if (o.focusPoints && pts.length) {
      // Frame the points' bounding box, padded to at least ~1.6 degrees so nearby context shows.
      const lons = pts.map((x) => x.lon);
      const lats = pts.map((x) => x.lat);
      const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
      const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
      const hw = Math.max(0.8, (Math.max(...lons) - Math.min(...lons)) * 0.8);
      const hh = Math.max(0.55, (Math.max(...lats) - Math.min(...lats)) * 0.8);
      proj.fitExtent([[12, 12], [W - 12, H - 12]], { type: 'MultiPoint', coordinates: [[cx - hw, cy - hh], [cx + hw, cy + hh]] });
    } else if (focusFeatures?.length) {
      proj.fitExtent([[12, 12], [W - 12, H - 12]], { type: 'FeatureCollection', features: focusFeatures });
    } else {
      proj.fitExtent([[4, 4], [W - 4, H - 4]], { type: 'FeatureCollection', features: states.filter((f) => f.abbr || f.properties.name === 'Maryland') });
    }
    const path = geoPath(proj);
    const metric = METRICS[o.metric || 'avg'];
    const svg = s('svg', { width: W, height: H, role: 'img', 'aria-label': `Map of ${metric.label.toLowerCase()} by state`, class: 'usmap' },
      s('defs', {}, s('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        s('rect', { width: 6, height: 6, fill: 'var(--paper)' }), s('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--hatch)', 'stroke-width': 2 }))));
    el.append(svg);
    const g = select(svg);
    const inFocus = (f) => !o.focusStates || o.focusStates.includes(f.abbr);
    g.append('g').selectAll('path').data(states.filter((f) => path(f))).join('path')
      .attr('d', path)
      .attr('fill', (f) => {
        const sm = f.abbr && stateSummary.get(f.abbr);
        if (!sm) return 'url(#hatch)';
        return o.plain ? 'var(--paper-2)' : `var(--${metric.cls(metric.value(sm))})`;
      })
      .attr('fill-opacity', (f) => (inFocus(f) ? 1 : 0.28))
      .attr('stroke', 'var(--ink)').attr('stroke-width', (f) => (o.focusStates && inFocus(f) ? 1.6 : 0.6))
      .style('cursor', (f) => (f.abbr && o.onState ? 'pointer' : null))
      .on('mousemove', (e, f) => {
        const sm = f.abbr && stateSummary.get(f.abbr);
        if (!sm) return showTip(e, f.properties.name, [f.properties.name === 'Maryland' ? 'Exempt: Maryland\'s own payment model' : 'No hospitals in the program']);
        return showTip(e, f.properties.name, [['Hospitals', fmtInt(sm.n)], ['Penalized', fmtPct(sm.pctPen, 0)], ['Average cut', fmtPct(sm.meanRed)], ['Estimated', fmtMoney(sm.penTotal)]]);
      })
      .on('mouseleave', hideTip)
      .on('click', (e, f) => f.abbr && o.onState?.(f.abbr));
    g.append('path').attr('d', path(borders)).attr('fill', 'none').attr('stroke', 'var(--ink)').attr('stroke-width', 0.6).attr('pointer-events', 'none');
    if (o.context?.length) {
      g.append('g').selectAll('circle').data(o.context.filter((x) => x.lat != null).map((x) => proj([x.lon, x.lat])).filter(Boolean)).join('circle')
        .attr('cx', (p) => p[0]).attr('cy', (p) => p[1]).attr('r', 2).attr('fill', 'var(--ink-3)').attr('fill-opacity', 0.45).attr('pointer-events', 'none');
    }
    if (o.dots) {
      const maxBase = Math.max(...pts.map((x) => x.base || 0), 1);
      const r = scaleSqrt().domain([0, maxBase]).range(o.plain ? [3.2, W > 700 ? 12 : 9] : [1.3, W > 700 ? 9 : 6]);
      const placed = pts.map((x) => ({ x, p: proj([x.lon, x.lat]) })).filter((d) => d.p).sort((a, b) => (b.x.base || 0) - (a.x.base || 0));
      g.append('g').selectAll('circle').data(placed).join('circle')
        .attr('cx', (d) => d.p[0]).attr('cy', (d) => d.p[1]).attr('r', (d) => r(d.x.base || 0))
        .attr('fill', (d) => (d.x.red > 0 ? rampVar(d.x.red) : 'var(--paper)')).attr('stroke', 'var(--ink)').attr('stroke-width', 0.7)
        .style('cursor', 'pointer')
        .on('mousemove', (e, d) => showTip(e, d.x.name, [d.x.place, ['Cut', fmtPct(d.x.red)], ['Estimated', fmtMoney(d.x.pen)]]))
        .on('mouseleave', hideTip)
        .on('click', (e, d) => o.onHospital?.(d.x.id));
    }
  };
  let lastW = 0;
  responsive(el, (W) => { lastW = W; draw(W); });
  return { update(next) { o = { ...o, ...next }; if (lastW) draw(lastW); } };
}
