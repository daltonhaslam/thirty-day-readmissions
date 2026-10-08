import { h } from '../dom.js';
import { omnibox } from '../ui/omnibox.js';
import { themeButton } from '../ui/theme.js';
import { link, SECTION_LIST } from '../router.js';
import { SITE_NAME, LINKEDIN_URL } from '../site.js';
import { feedbackSection } from '../ui/feedbackForm.js';

export function renderShell(D, index) {
  const nav = [...SECTION_LIST.map(([id, label]) => [id, id === 'picture' ? D.edition.label : label]), ['methods', 'Methods']];
  document.getElementById('topbar').append(
    h('div', { class: 'wrap topbar__row' },
      h('a', { class: 'wordmark', href: '#', 'aria-label': `${SITE_NAME}, home` },
        h('span', { class: 'wordmark__name' }, SITE_NAME),
        h('span', { class: 'wordmark__tag' }, `HRRP · ${D.edition.label}`)),
      h('div', { class: 'topbar__search' }, omnibox(index)),
      themeButton()),
    h('nav', { class: 'nav', 'aria-label': 'Sections' },
      h('ol', { class: 'wrap' }, nav.map(([id, label], i) => h('li', {},
        h('a', { href: link(id), 'data-nav': id }, id === 'methods' ? null : h('span', { class: 'num' }, String(i + 1)), label))))));

  document.getElementById('footer').append(h('div', { class: 'wrap' }, feedbackSection()), h('div', { class: 'wrap footer__grid' },
    h('div', {},
      h('p', { class: 'byline' }, 'Built by Dalton Haslam, MD, MBA, using ',
        h('a', { href: 'https://claude.com/claude-code', rel: 'noopener', target: '_blank' }, 'Claude Code'), ' · ',
        h('a', { href: LINKEDIN_URL, rel: 'noopener', target: '_blank' }, 'LinkedIn')),
      h('p', {}, `Data: CMS ${D.edition.label} Hospital Readmissions Reduction Program Supplemental Data File (posted ${D.meta.fileDate}), ${D.edition.label} IPPS final rule files, CMS Care Compare, and US Census geography. Figures marked "estimated" are modeled here; see `,
        h('a', { href: '#methods' }, 'Methods'), '.')),
    h('div', {},
      h('p', {}, 'An independent project. Not affiliated with or endorsed by the Centers for Medicare & Medicaid Services.'),
      h('p', { class: 'small' }, 'Code MIT-licensed. Federal source data is public domain.'))));
}

export function markNav(section) {
  for (const a of document.querySelectorAll('[data-nav]')) a.setAttribute('aria-current', String(a.dataset.nav === section));
}
