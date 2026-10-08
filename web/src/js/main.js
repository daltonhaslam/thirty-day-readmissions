import { loadData } from './data.js';
import { buildIndex } from './ui/search.js';
import { renderShell, markNav } from './views/shell.js';
import { onRoute } from './router.js';
import { renderHome } from './views/home.js';
import { renderScope } from './views/scope.js';
import { renderHospital } from './views/hospital.js';
import { renderMethods, renderNotFound } from './views/methods.js';
import { clear, flushDraws } from './dom.js';
import { hideTip } from './ui/tooltip.js';
import { numberFigures } from './ui/figure.js';

const D = loadData(JSON.parse(document.getElementById('hrrp-data').textContent));
const index = buildIndex({ hospitals: D.hospitals, states: D.meta.states, metros: D.cbsaNames });
renderShell(D, index);

const main = document.getElementById('main');
const SITE = 'Thirty Days';
let current = null;
let fromHistory = false;
// Per-route memory used only on Back/Forward: scroll position and view state (explorer filters, sort, page).
const positions = new Map();
const viewStates = new Map();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// Browsers fire popstate for every hash change; only entries we stamped (below) are true Back/Forward visits.
window.addEventListener('popstate', (e) => { fromHistory = e.state?.thirtyDays != null; });
document.querySelector('.skip').addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

const titled = (r) => (r ? [r[0], `${r[1]} · ${SITE}`] : null);

function view(route, state) {
  switch (route.view) {
    case 'home':
      return [renderHome(D, index, state), `${SITE} · Medicare readmission penalties, ${D.edition.label}`];
    case 'hospital':
      return titled(renderHospital(D, route.key));
    case 'methods':
      return [renderMethods(D), `Methods · ${SITE}`];
    case 'region': case 'division': case 'state': case 'metro':
      return titled(renderScope(D, route, state));
    default:
      return null;
  }
}

onRoute((route) => {
  hideTip();
  const key = `${route.view}:${route.key ?? ''}`;
  const back = fromHistory;
  fromHistory = false;
  if (key !== current) {
    const firstView = current === null;
    if (current) positions.set(current, window.scrollY);
    const state = back && viewStates.has(key) ? viewStates.get(key) : {};
    viewStates.set(key, state);
    const [el, title] = view(route, state) || [renderNotFound(D, index), `Not found · ${SITE}`];
    clear(main).append(el);
    flushDraws(); // draw charts now so heights are final before any scrolling
    numberFigures(main);
    document.title = title;
    current = key;
    if (!firstView && !route.section) {
      const h1 = main.querySelector('h1');
      if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
    }
    if (!route.section) window.scrollTo(0, back && positions.has(key) ? positions.get(key) : 0);
  }
  if (route.section) document.getElementById(route.section)?.scrollIntoView({ block: 'start' });
  history.replaceState({ thirtyDays: key }, '');
  markNav(route.section || (route.view === 'methods' ? 'methods' : null));
});
