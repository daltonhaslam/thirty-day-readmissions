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

onRoute((route) => {
  hideTip();
  const key = `${route.view}:${route.key ?? ''}`;
  if (key !== current) {
    const [el, title] = view(route) || [renderNotFound(D, index), `Not found · ${SITE}`];
    clear(main).append(el);
    numberFigures(main);
    document.title = title;
    current = key;
    if (!route.section) window.scrollTo(0, 0);
  }
  if (route.section) document.getElementById(route.section)?.scrollIntoView({ block: 'start' });
  markNav(route.section || (route.view === 'methods' ? 'methods' : null));
});
