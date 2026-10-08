import { h } from '../dom.js';
import { greenbarTable } from '../ui/table.js';
import { applyFilters, BED_BANDS, CONDS } from '../model.js';
import { hospitalColumns, CSV_COLUMNS } from './columns.js';
import { link } from '../router.js';

let uid = 0;
const opt = (value, label) => h('option', { value }, label);

// Filterable, sortable, exportable hospital table. `list` is the population (nation or a scope).
export function explorer(D, list, { showState = true, csvName = 'hospitals.csv', pageSize = 25, current } = {}) {
  uid += 1;
  const id = (k) => `ex${uid}-${k}`;
  const f = {};
  const table = greenbarTable({ columns: hospitalColumns(D), rows: list, pageSize, sort: { key: 'red', dir: 'desc' }, csvName,
    csvColumns: CSV_COLUMNS, rowHref: (x) => link('hospital', x.id), rowClass: (x) => (x.id === current ? 'is-current' : null),
    caption: 'Hospitals and their FY2027 readmission penalties' });
  const refresh = () => table.setRows(applyFilters(list, f));
  const sel = (key, label, options, parse = (v) => v) => {
    const el = h('select', { class: 'select', id: id(key), onchange: (e) => { f[key] = e.target.value === '' ? null : parse(e.target.value); refresh(); } },
      opt('', `All`), options.map(([v, l]) => opt(v, l)));
    return h('label', { class: 'ctl', for: id(key) }, h('span', { class: 'cap' }, label), el);
  };
  const states = Object.entries(D.meta.states).filter(([st]) => list.some((x) => x.st === st));
  const text = h('input', { class: 'select', id: id('q'), type: 'search', placeholder: 'Name, city, or CCN', oninput: (e) => { f.text = e.target.value; refresh(); } });
  const pen = h('input', { type: 'checkbox', id: id('pen'), onchange: (e) => { f.penalized = e.target.checked; refresh(); } });
  const controls = h('div', { class: 'controls filters' },
    h('label', { class: 'ctl ctl--grow', for: id('q') }, h('span', { class: 'cap' }, 'Filter'), text),
    showState && states.length > 1 ? sel('st', 'State', states.map(([st, name]) => [st, name])) : null,
    sel('peer', 'Peer group', [1, 2, 3, 4, 5].map((p) => [String(p), `Group ${p}`]), Number),
    sel('cond', 'Penalized on', CONDS.map((k) => [k, D.condByKey[k].short])),
    sel('teach', 'Teaching', [['none', 'Non-teaching'], ['minor', 'Minor'], ['major', 'Major']]),
    sel('beds', 'Beds', BED_BANDS.map((b) => [b, b])),
    sel('urban', 'Location', [['true', 'Urban'], ['false', 'Rural']], (v) => v === 'true'),
    h('label', { class: 'check', for: id('pen') }, pen, 'Penalized only'));
  return h('div', { class: 'explorer' }, controls,
    h('p', { class: 'legend legend--tight' }, h('span', {}, 'Conditions column, in order ', h('b', {}, CONDS.map((k) => D.condByKey[k].short).join(', ')), ':'),
      h('span', {}, h('span', { class: 'cstrip' }, h('i', { class: 'on' })), ' penalized'),
      h('span', {}, h('span', { class: 'cstrip' }, h('i')), ' no penalty'),
      h('span', {}, h('span', { class: 'cstrip' }, h('i', { class: 'na' })), ' under 25 cases')),
    table.el);
}
