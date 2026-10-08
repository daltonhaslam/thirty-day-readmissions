import { h } from '../dom.js';
import { link, slugify } from '../router.js';

// Nation › Region › Division › State › Metro › (current). `at` is the hospital or scope being shown.
export function crumbsFor(D, { region, division, st, cbsa }) {
  const out = [{ label: 'Nation', href: '#' }];
  if (region) out.push({ label: region, href: link('region', slugify(region)) });
  if (division) out.push({ label: division, href: link('division', slugify(division)) });
  if (st) out.push({ label: D.meta.states[st] || st, href: link('state', st) });
  if (cbsa) out.push({ label: D.cbsaNames[cbsa], href: link('metro', cbsa) });
  return out;
}

export function breadcrumb(items, current) {
  return h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('ol', {},
    items.map((c) => h('li', {}, h('a', { href: c.href }, c.label))),
    h('li', { 'aria-current': 'page' }, current)));
}
