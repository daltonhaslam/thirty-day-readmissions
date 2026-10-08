// Hash routes are plain anchors (letters, digits, '-') so deep links survive any host,
// including viewers that only pass through simple #anchors.
//   #                      home           #how #picture #map #history #explore #research  home sections
//   #hospital-010001       hospital       #state-ut  #metro-41620  #division-south-atlantic  #region-west
//   #methods               methods

import { slug } from './model.js';

// Home sections in page order: [id, nav label]. Part numbers follow this order.
export const SECTION_LIST = [['how', 'How it works'], ['picture', 'The year'], ['map', 'Map'], ['history', 'History'],
  ['explore', 'Every hospital'], ['research', 'Research']];
export const SECTIONS = SECTION_LIST.map(([id]) => id);
export const partNo = (id) => SECTIONS.indexOf(id) + 1;
const KEYS = {
  hospital: (k) => (/^[0-9]{6}$/.test(k) ? k : null),
  state: (k) => (/^[a-z]{2}$/i.test(k) ? k.toUpperCase() : null),
  metro: (k) => (/^[0-9]{5}$/.test(k) ? k : null),
  division: (k) => (/^[a-z]+(-[a-z]+)*$/.test(k) ? k : null),
  region: (k) => (/^(northeast|midwest|south|west)$/.test(k) ? k : null),
};

const route = (view, key = null, section = null) => ({ view, key, section });

export function parseHash(hash) {
  let s = String(hash || '').replace(/^#\/?/, '');
  try {
    s = decodeURIComponent(s);
  } catch {
    return route('notfound');
  }
  if (!s || s === 'top') return route('home');
  if (s === 'methods') return route('methods');
  if (SECTIONS.includes(s)) return route('home', null, s);
  const m = /^([a-z]+)-(.+)$/i.exec(s);
  const check = m && KEYS[m[1].toLowerCase()];
  const key = check ? check(m[2]) : null;
  return key ? route(m[1].toLowerCase(), key) : route('notfound');
}

export function link(view, key) {
  if (view === 'home' || !view) return '#';
  if (view === 'methods' || SECTIONS.includes(view)) return `#${view}`;
  return `#${view}-${String(key).toLowerCase()}`;
}

export const slugify = slug;

export function go(view, key) {
  window.location.hash = link(view, key);
}

export function onRoute(cb) {
  const fire = () => cb(parseHash(window.location.hash));
  window.addEventListener('hashchange', fire);
  fire();
}
