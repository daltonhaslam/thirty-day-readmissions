import { h } from '../dom.js';
import { SITE_NAME, SITE_URL, FEEDBACK_FORM_URL, FEEDBACK_ENTRIES } from '../site.js';

// The form's address with the site name and this page's address prefilled. Nothing else is sent.
export const feedbackHref = (pageUrl) => `${FEEDBACK_FORM_URL}?${FEEDBACK_ENTRIES.site}=${encodeURIComponent(SITE_NAME)}`
  + `&${FEEDBACK_ENTRIES.page}=${encodeURIComponent(pageUrl)}`;

// The public address of the current route. Only the hash varies, so a saved copy, preview host or share-tracking
// query string (?fbclid=) never reaches the form.
const pageAddress = () => SITE_URL + window.location.hash;

// A link to the form in a new tab, its address rebuilt from the current route when it is pressed, focused or clicked.
export function feedbackLink(label, cls) {
  const a = h('a', { class: cls, href: feedbackHref(pageAddress()), target: '_blank', rel: 'noopener noreferrer' },
    label, h('span', { class: 'visually-hidden' }, ' (opens in a new tab)'));
  const refresh = () => { a.href = feedbackHref(pageAddress()); };
  for (const type of ['pointerdown', 'focus', 'click']) a.addEventListener(type, refresh);
  return a;
}

// Footer block on every page. It outlives route changes, so its link also follows each one (hover, copy link).
export function feedbackSection() {
  const link = feedbackLink('Send feedback', 'btn btn--red');
  window.addEventListener('hashchange', () => { link.href = feedbackHref(pageAddress()); });
  return h('section', { class: 'feedback', id: 'feedback', 'aria-labelledby': 'feedback-h' },
    h('h2', { id: 'feedback-h', class: 'feedback__title' }, 'Spot an error or have an idea?'),
    h('p', { class: 'feedback__lede' }, 'Tell me what looks wrong, what\'s unclear, or what you\'d like added. The form fills in this page\'s address for you. Please leave out any patient information.'),
    h('p', {}, link));
}
