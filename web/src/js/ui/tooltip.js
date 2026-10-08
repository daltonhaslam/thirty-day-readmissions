import { h, clear } from '../dom.js';

let el;
function ensure() {
  if (!el) {
    el = h('div', { class: 'tip', role: 'tooltip', hidden: true });
    document.body.append(el);
  }
  return el;
}

// lines: [title, ...rows] where rows are strings or [label, value] pairs
export function showTip(event, title, rows = []) {
  const t = ensure();
  clear(t);
  t.append(h('b', {}, title));
  for (const r of rows) t.append(h('div', {}, Array.isArray(r) ? `${r[0]}: ${r[1]}` : r));
  t.hidden = false;
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const r = t.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + r.width > W - 8) x = event.clientX - r.width - pad;
  if (y + r.height > H - 8) y = event.clientY - r.height - pad;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${Math.max(8, y)}px`;
}

export function hideTip() {
  if (el) el.hidden = true;
}
