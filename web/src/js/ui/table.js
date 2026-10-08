import { h, clear } from '../dom.js';
import { toCSV } from '../model.js';

// Green-bar printout table: sortable headers, pagination, CSV copy/download of all (filtered) rows.
export function greenbarTable({ columns, rows = [], pageSize = 25, sort, caption, csvName = 'hospitals.csv', csvColumns, rowClass }) {
  let data = rows;
  let page = 0;
  let sortState = sort || null; // { key, dir: 'desc'|'asc' }
  const thead = h('thead');
  const tbody = h('tbody');
  const status = h('span', { 'aria-live': 'polite' });
  const prev = h('button', { class: 'btn', type: 'button', onclick: () => { page -= 1; paint(); } }, 'Prev');
  const next = h('button', { class: 'btn', type: 'button', onclick: () => { page += 1; paint(); } }, 'Next');
  const copyBtn = h('button', { class: 'btn btn--red', type: 'button' }, 'Copy CSV');
  const dlBtn = h('button', { class: 'btn btn--red', type: 'button' }, 'Download CSV');
  const table = h('table', { class: 'gb' }, caption ? h('caption', { class: 'visually-hidden' }, caption) : null, thead, tbody);
  const el = h('div', { class: 'printout' },
    h('div', { class: 'printout__scroll' }, table),
    h('div', { class: 'printout__foot' }, status, h('span', { class: 'seg' }, prev, next), h('span', { class: 'seg' }, copyBtn, dlBtn)));

  const csvText = () => toCSV(sorted(), csvColumns || columns.map((c) => ({ label: c.label, value: c.csv || c.sort || ((r) => r[c.key]) })));
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(csvText());
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Copy blocked';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy CSV'; }, 1600);
  });
  dlBtn.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([csvText()], { type: 'text/csv' }));
    const a = h('a', { href: url, download: csvName });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  function sorted() {
    if (!sortState) return data;
    const col = columns.find((c) => c.key === sortState.key);
    const get = col.sort || ((r) => r[col.key]);
    const dir = sortState.dir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir;
    });
  }

  function header() {
    clear(thead);
    thead.append(h('tr', {}, columns.map((c) => {
      const active = sortState?.key === c.key;
      const th = h('th', { scope: 'col', class: c.num ? 'num' : null, 'aria-sort': active ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : null });
      if (c.sortable === false) th.append(c.label);
      else th.append(h('button', { type: 'button', onclick: () => {
        sortState = { key: c.key, dir: active && sortState.dir === 'desc' ? 'asc' : c.firstDir || 'desc' };
        page = 0;
        paint();
      } }, c.label));
      return th;
    })));
  }

  function paint() {
    header();
    const all = sorted();
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    page = Math.min(Math.max(0, page), pages - 1);
    clear(tbody);
    for (const r of all.slice(page * pageSize, (page + 1) * pageSize)) {
      tbody.append(h('tr', { class: rowClass?.(r) || null, onclick: (e) => { if (!e.target.closest('a,button')) r.href && (window.location.hash = r.href); } },
        columns.map((c) => h('td', { class: [c.num ? 'num' : '', c.cls || ''].join(' ').trim() || null }, c.render ? c.render(r) : r[c.key] ?? '—'))));
    }
    if (!all.length) tbody.append(h('tr', {}, h('td', { colspan: columns.length }, 'No hospitals match these filters.')));
    const from = all.length ? page * pageSize + 1 : 0;
    status.textContent = `${from.toLocaleString()}–${Math.min(all.length, (page + 1) * pageSize).toLocaleString()} of ${all.length.toLocaleString()}`;
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
  }

  paint();
  return { el, setRows(r) { data = r; page = 0; paint(); } };
}
