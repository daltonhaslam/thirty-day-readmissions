import { h } from '../dom.js';

let counter = 0;
export function resetFigures() { counter = 0; }

// A report-style figure: "FIG. N", title, one-line takeaway, body, source line.
export function figure({ title, take, source, body, id, cls }) {
  counter += 1;
  return h('figure', { class: `fig ${cls || ''}`, id },
    h('figcaption', { class: 'fig__head' },
      h('span', { class: 'fig__no cap' }, `Fig. ${counter}`),
      h('span', { class: 'fig__title' }, title),
      take ? h('span', { class: 'fig__take' }, take) : null),
    h('div', { class: 'fig__body' }, body),
    source ? h('div', { class: 'fig__src' }, `Source: ${source}`) : null);
}

export function part({ no, id, title, lede }, ...children) {
  return h('section', { class: 'part', id, 'aria-labelledby': `${id}-h` },
    h('header', { class: 'part__head' },
      h('span', { class: 'part__no cap' }, h('b', {}, `Part ${no}`)),
      h('h2', { id: `${id}-h` }, title),
      lede ? h('p', { class: 'part__lede' }, lede) : null),
    ...children);
}

export function field(no, label, value, { note, big } = {}) {
  return h('div', { class: 'field' },
    h('div', { class: 'field__label' }, no != null ? h('span', { class: 'field__no' }, String(no)) : null, label),
    h('div', { class: `field__value${big ? ' field__value--big' : ''}` }, value),
    note ? h('div', { class: 'field__note' }, note) : null);
}
