import { h } from '../dom.js';

// Horizontal bar rows in HTML (accessible, responsive). rows: [{label, value, display, note, cls, href}]
export function barRows(rows, { max, compareLabel, tone = 'red' } = {}) {
  const top = max ?? Math.max(...rows.map((r) => Math.max(r.value || 0, r.compare || 0)), 1e-9);
  return h('ul', { class: `hbars hbars--${tone}` }, rows.map((r) => h('li', { class: r.cls || null },
    h('span', { class: 'hbars__label' }, r.href ? h('a', { href: r.href }, r.label) : r.label, r.note ? h('small', {}, r.note) : null),
    h('span', { class: 'hbars__track' },
      h('span', { class: 'hbars__bar', style: { width: `${Math.max(0, (100 * (r.value || 0)) / top)}%` } }),
      r.compare != null ? h('span', { class: 'hbars__cmp', style: { left: `${(100 * r.compare) / top}%` }, title: `${compareLabel}: ${r.compareDisplay}` }) : null),
    h('span', { class: 'hbars__val' }, r.display))));
}
