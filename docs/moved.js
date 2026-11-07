// The "moved" page's one script. Thirty Day Readmissions now lives at Paid & Penalized, under /hrrp/. An old link carried a
// hash (#hospital-010001, #state-ut …); target() turns it into the matching new address, built from fixed prefixes and a key
// checked as the old site's router checked it (web/src/js/router.js parseHash), so the button can only ever point at
// paidandpenalized.org. Nothing forwards by itself: the page rewrites the button and adds one line, set as text.
// Without this script the button goes to /hrrp/.

export const ORIGIN = 'https://paidandpenalized.org';
export const HOME = '/hrrp/';

// The old home page's sections, by hash (the new page keeps each id), as the note names them.
const SECTIONS = {
  how: 'the “How it works” section', picture: 'the year’s picture', map: 'the map', history: 'the program’s history',
  explore: 'the list of every hospital', research: 'the research section',
};

// The old router's keys, the same checks; each returns the new page's path, or null.
const PAGES = {
  hospital: (k) => (/^[0-9]{6}$/.test(k) ? { path: `hospital/${k}/`, what: `a hospital, CCN ${k}` } : null),
  state: (k) => (/^[a-z]{2}$/i.test(k) ? { path: `state/${k.toLowerCase()}/`, what: 'a state' } : null),
  metro: (k) => (/^[0-9]{5}$/.test(k) ? { path: `metro/${k}/`, what: 'a metro area' } : null),
  division: (k) => (/^[a-z]+(-[a-z]+)*$/.test(k) ? { path: `division/${k}/`, what: 'a census division' } : null),
  region: (k) => (/^(northeast|midwest|south|west)$/.test(k) ? { path: `region/${k}/`, what: 'a census region' } : null),
};

// hash: location.hash ('' or '#…'). Returns { href, note }: the button's absolute address and the line to show under it
// ('' when the link named no page or one the old site did not have).
export function target(hash) {
  const home = { href: ORIGIN + HOME, note: '' };
  let s = String(hash ?? '').replace(/^#\/?/, '');
  try {
    s = decodeURIComponent(s);
  } catch {
    return home;
  }
  if (!s || s === 'top') return home;
  const to = (path, what, obj) => ({ href: ORIGIN + HOME + path, note: `Your link was to ${what}: the button opens ${obj} there.` });
  if (s === 'methods') return to('methods/', 'the Methods page', 'it');
  if (s === 'methods-dollars') return to('methods/#methods-dollars', 'the dollar assumptions', 'them');
  if (Object.hasOwn(SECTIONS, s)) return to(`#${s}`, SECTIONS[s], 'it');
  const m = /^([a-z]+)-(.+)$/i.exec(s);
  const kind = m && m[1].toLowerCase();
  const page = kind && Object.hasOwn(PAGES, kind) ? PAGES[kind](m[2]) : null;
  return page ? to(page.path, page.what, 'its page') : home;
}

if (typeof document !== 'undefined') {
  // Vercel Web Analytics (its deferred script follows this one): only the page address is sent, never the hash.
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', (e) => ({ ...e, url: e.url.split(/[?#]/)[0] }));

  const button = document.getElementById('go');
  const note = document.getElementById('note');
  const show = () => {
    const t = target(location.hash);
    button.href = t.href;
    note.textContent = t.note;
    note.hidden = !t.note;
  };
  show();
  window.addEventListener('hashchange', show);
}
