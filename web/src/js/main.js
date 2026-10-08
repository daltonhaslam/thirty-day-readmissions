import { loadData } from './data.js';
import { buildIndex } from './ui/search.js';
import { renderShell, markNav } from './views/shell.js';
import { onRoute } from './router.js';
import { renderHome } from './views/home.js';
import { renderScope } from './views/scope.js';
import { renderHospital } from './views/hospital.js';
import { renderMethods, renderNotFound } from './views/methods.js';
import { clear } from './dom.js';
import { hideTip } from './ui/tooltip.js';
import { numberFigures } from './ui/figure.js';

const D = loadData(JSON.parse(document.getElementById('hrrp-data').textContent));
const index = buildIndex({ hospitals: D.hospitals, states: D.meta.states, metros: D.cbsaNames });
renderShell(D, index);

const main = document.getElementById('main');
const SITE = 'Thirty Days';
let current = null;
let fromHistory = false;
const positions = new Map(); // route key -> scrollY, restored on Back/Forward
const afterLayout = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn)); // charts draw on the next frame

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('popstate', () => { fromHistory = true; });
let scrollTimer = null;
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { if (current) positions.set(current, window.scrollY); }, 100);
}, { passive: true });
document.querySelector('.skip').addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

const titled = (r) => (r ? [r[0], `${r[1]} · ${SITE}`] : null);

function view(route) {
  switch (route.view) {
    case 'home':
      return [renderHome(D, index), `${SITE} · Medicare readmission penalties, ${D.edition.label}`];
    case 'hospital':
      return titled(renderHospital(D, route.key));
    case 'methods':
      return [renderMethods(D), `Methods · ${SITE}`];
    case 'region': case 'division': case 'state': case 'metro':
      return titled(renderScope(D, route));
    default:
      return null;
  }
}

let first = true;
onRoute((route) => {
  hideTip();
  const key = `${route.view}:${route.key ?? ''}`;
  const restoring = fromHistory && positions.has(key) && !route.section;
  fromHistory = false;
  if (key !== current) {
    if (current) positions.set(current, window.scrollY);
    const [el, title] = view(route) || [renderNotFound(D, index), `Not found · ${SITE}`];
    clear(main).append(el);
    numberFigures(main);
    document.title = title;
    current = key;
    if (!first && !route.section) {
      const h1 = main.querySelector('h1');
      if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
    }
    if (restoring) afterLayout(() => window.scrollTo(0, positions.get(key)));
    else if (!route.section) window.scrollTo(0, 0);
  }
  if (route.section) {
    const target = () => document.getElementById(route.section)?.scrollIntoView({ block: 'start' });
    target();
    afterLayout(target);
  }
  first = false;
  markNav(route.section || (route.view === 'methods' ? 'methods' : null));
});
