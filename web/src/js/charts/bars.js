import { h } from '../dom.js';

// Horizontal bar rows in HTML (accessible, responsive). rows: [{label, value, display, note, compare?, compareDisplay?}]
export function barRows(rows, { max, compareLabel, ink = false } = {}) {
  const top = max ?? Math.max(...rows.map((r) => Math.max(r.value || 0, r.compare || 0)), 1e-9);
  return h('ul', { class: ink ? 'hbars hbars--ink' : 'hbars' }, rows.map((r) => h('li', {},
    h('span', { class: 'hbars__label' }, r.label, r.note ? h('small', {}, r.note) : null),
    h('span', { class: 'hbars__track' },
      h('span', { class: 'hbars__bar', style: { width: `${Math.max(0, (100 * (r.value || 0)) / top)}%` } }),
      r.compare != null ? h('span', { class: 'hbars__cmp', style: { left: `${(100 * r.compare) / top}%` }, title: `${compareLabel}: ${r.compareDisplay}` }) : null),
    h('span', { class: 'hbars__val' }, r.display))));
}
