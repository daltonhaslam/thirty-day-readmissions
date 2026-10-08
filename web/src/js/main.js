import { loadData } from './data.js';
import { buildIndex } from './ui/search.js';
import { renderShell, markNav } from './views/shell.js';
import { onRoute } from './router.js';
import { renderHome } from './views/home.js';
import { h, clear } from './dom.js';

const D = loadData(JSON.parse(document.getElementById('hrrp-data').textContent));
const index = buildIndex({ hospitals: D.hospitals, states: D.meta.states, metros: D.cbsaNames });
renderShell(D, index);

const main = document.getElementById('main');
let current = null;

function view(route) {
  switch (route.view) {
    case 'home': return renderHome(D, index);
    default: return h('div', { class: 'wrap' }, h('p', {}, 'Coming soon.'));
  }
}

onRoute((route) => {
  const key = `${route.view}:${route.key ?? ''}`;
  if (key !== current) {
    clear(main).append(view(route));
    current = key;
    if (!route.section) window.scrollTo(0, 0);
  }
  if (route.section) document.getElementById(route.section)?.scrollIntoView({ block: 'start' });
  markNav(route.section || (route.view === 'methods' ? 'methods' : null));
});
