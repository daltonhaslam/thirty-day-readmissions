import { h } from '../dom.js';
import { SITE_NAME, FEEDBACK_FORM_URL, FEEDBACK_ENTRIES } from '../site.js';

// The form's address with the site name and this page's address prefilled. Nothing else is sent.
export const feedbackHref = (pageUrl) => `${FEEDBACK_FORM_URL}?${FEEDBACK_ENTRIES.site}=${encodeURIComponent(SITE_NAME)}`
  + `&${FEEDBACK_ENTRIES.page}=${encodeURIComponent(pageUrl)}`;

// A link to the form in a new tab. The page address is read when the link is used, so it follows the current route.
export function feedbackLink(label, cls) {
  const a = h('a', { class: cls, href: feedbackHref(window.location.href), target: '_blank', rel: 'noopener noreferrer' },
    label, h('span', { class: 'visually-hidden' }, ' (opens in a new tab)'));
  const refresh = () => { a.href = feedbackHref(window.location.href); };
  for (const type of ['click', 'auxclick', 'contextmenu']) a.addEventListener(type, refresh);
  return a;
}

// Footer block on every page.
export const feedbackSection = () => h('section', { class: 'feedback', id: 'feedback', 'aria-labelledby': 'feedback-h' },
  h('h2', { id: 'feedback-h', class: 'feedback__title' }, 'Spot an error or have an idea?'),
  h('p', { class: 'feedback__lede' }, 'Tell me what looks wrong, what\'s unclear, or what you\'d like added. The form fills in this page\'s address for you. Please leave out any patient information.'),
  h('p', {}, feedbackLink('Send feedback', 'btn btn--red')));
