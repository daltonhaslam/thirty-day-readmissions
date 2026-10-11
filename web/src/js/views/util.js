import { h } from '../dom.js';
import { link } from '../router.js';

// Only https links from curated content are rendered.
export function safeHref(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// Where map dots come from, for figure source lines. Street-address geocoding arrives with meta.geocode.address.
export const placesSource = (meta) => (meta.geocode?.address
  ? 'locations geocoded from street addresses (U.S. Census Bureau Geocoder), else ZIP or county centers'
  : 'locations from Care Compare addresses and Census ZIP centroids');

// Every dollar figure modeled on this site carries a small "estimate" tag linking to the assumptions on Methods.
export const DOLLARS_HREF = link('methods', 'dollars');
export const estTag = () => h('a', { class: 'est', href: DOLLARS_HREF, 'aria-label': 'Estimate: see the assumptions behind the dollar figures' }, 'estimate');
// For figure source lines that include modeled dollars.
export const dollarsNote = () => ['dollars modeled (', h('a', { href: DOLLARS_HREF }, 'see the assumptions'), ')'];
