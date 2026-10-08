import { h, clear } from '../dom.js';
import { omnibox } from '../ui/omnibox.js';
import { themeButton } from '../ui/theme.js';
import { link } from '../router.js';

export const NAV = [
  ['how', 'How it works'], ['picture', 'FY2027'], ['map', 'Map'], ['history', 'Fifteen years'],
  ['explore', 'Every hospital'], ['research', 'Research'], ['methods', 'Methods'],
];

export function renderShell(D, index) {
  const top = document.getElementById('topbar');
  clear(top);
  top.append(
    h('div', { class: 'wrap topbar__row' },
      h('a', { class: 'wordmark', href: '#', 'aria-label': 'Thirty Days, home' },
        h('span', { class: 'wordmark__name' }, 'Thirty Days'),
        h('span', { class: 'wordmark__tag' }, `HRRP · FY${D.meta.fy}`)),
      h('div', { class: 'topbar__search' }, omnibox(index)),
      themeButton()),
    h('nav', { class: 'nav', 'aria-label': 'Sections' },
      h('ol', { class: 'wrap' }, NAV.map(([id, label], i) => h('li', {},
        h('a', { href: link(id), 'data-nav': id }, id === 'methods' ? null : h('span', { class: 'num' }, String(i + 1)), label))))));

  const foot = document.getElementById('footer');
  clear(foot);
  foot.append(h('div', { class: 'wrap footer__grid' },
    h('div', {},
      h('p', { class: 'byline' }, 'Built by Dalton Haslam, MD, MBA · ',
        h('a', { href: 'https://www.linkedin.com/in/dalton-haslam', rel: 'noopener', target: '_blank' }, 'LinkedIn')),
      h('p', {}, `Data: CMS FY${D.meta.fy} Hospital Readmissions Reduction Program Supplemental Data File (posted ${D.meta.fileDate}), FY${D.meta.fy} IPPS final rule files, CMS Care Compare, and US Census geography. Figures marked "estimated" are modeled here; see `,
        h('a', { href: '#methods' }, 'Methods'), '.')),
    h('div', {},
      h('p', {}, 'An independent project. Not affiliated with or endorsed by the Centers for Medicare & Medicaid Services.'),
      h('p', { class: 'small' }, 'Code MIT-licensed. Federal source data is public domain.'))));
}

export function markNav(section) {
  for (const a of document.querySelectorAll('[data-nav]')) a.setAttribute('aria-current', String(a.dataset.nav === section));
}
