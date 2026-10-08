import { h } from '../dom.js';

const KEY = 'thirty-days-theme';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } };

export function currentTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set) return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function themeButton(onChange) {
  const saved = read();
  if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  const btn = h('button', { class: 'theme-btn cap', type: 'button' });
  const label = () => { btn.textContent = currentTheme() === 'dark' ? 'Day' : 'Night'; btn.setAttribute('aria-label', `Switch to ${btn.textContent.toLowerCase()} edition`); };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    write(next);
    label();
    onChange?.(next);
  });
  label();
  return btn;
}
