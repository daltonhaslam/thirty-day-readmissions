import { h } from '../dom.js';
import { FEEDBACK_KINDS, MAX_MESSAGE, validateFeedback, looksLikePatientInfo } from '../feedback.js';
import { LINKEDIN_URL } from '../site.js';

// Injected by build.mjs from site.js (or the FEEDBACK_URL env var in tests). This file is only ever bundled.
// eslint-disable-next-line no-undef
const FEEDBACK_URL = __FEEDBACK_URL__;

const ERRORS = {
  short: 'Please write a few words so I know what to look at.',
  email: 'That email address doesn\'t look right. Leave it blank if you don\'t need a reply.',
};

// One numbered form box (claim-form style) wrapping a control.
const box = (no, label, control, { wide, note } = {}) => h('label', { class: `field${wide ? ' field--wide' : ''}`, for: control.id },
  h('span', { class: 'field__label' }, h('span', { class: 'field__no' }, String(no)), label), control,
  note ? h('span', { class: 'field__note' }, note) : null);

// Footer block: a short feedback form (when an endpoint is configured) plus a LinkedIn contact line.
export function feedbackSection() {
  const linkedin = h('p', { class: 'feedback__alt' }, 'Prefer to talk? ',
    h('a', { href: LINKEDIN_URL, target: '_blank', rel: 'noopener' }, 'Message me on LinkedIn'), '.');
  const section = h('section', { class: 'feedback', id: 'feedback', 'aria-labelledby': 'feedback-h' },
    h('h2', { id: 'feedback-h', class: 'feedback__title' }, 'Spot an error or have an idea?'));
  if (!FEEDBACK_URL) {
    section.append(linkedin);
    return section;
  }
  let startedAt = Date.now();
  let warnedPatientInfo = false;
  const kind = h('select', { class: 'select', id: 'fb-kind', name: 'kind' }, FEEDBACK_KINDS.map(([v, l]) => h('option', { value: v }, l)));
  const message = h('textarea', { id: 'fb-message', name: 'message', rows: '4', maxlength: String(MAX_MESSAGE), required: true });
  const email = h('input', { id: 'fb-email', name: 'email', type: 'email', autocomplete: 'email' });
  // Hidden from people, tempting to bots: anything typed here marks the submission as spam.
  const website = h('input', { id: 'fb-website', name: 'website', type: 'text', tabindex: '-1', autocomplete: 'off' });
  const status = h('p', { id: 'fb-status', class: 'feedback__status', role: 'status', 'aria-live': 'polite' });
  const send = h('button', { class: 'btn btn--red', type: 'submit' }, 'Send feedback');
  const say = (text) => { status.textContent = text; };

  const form = h('form', { class: 'form feedback__form', novalidate: true },
    box(1, 'What is it about?', kind),
    box(2, 'Email, if you\'d like a reply', email),
    box(3, 'Your note', message, { wide: true, note: 'Please don\'t include patient names, record numbers, birth dates, or other patient details.' }),
    h('div', { class: 'feedback__trap', 'aria-hidden': 'true' }, h('label', { for: 'fb-website' }, 'Website'), website),
    h('div', { class: 'field field--wide feedback__actions' }, send, status));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = validateFeedback({ kind: kind.value, message: message.value, email: email.value, website: website.value, startedAt },
      { now: Date.now(), page: window.location.hash || '#', title: document.title });
    if (!r.ok && r.reason === 'spam') { say('Sent. Thank you.'); return; }
    if (!r.ok) { say(ERRORS[r.reason]); return; }
    if (looksLikePatientInfo(r.payload.message) && !warnedPatientInfo) {
      warnedPatientInfo = true;
      say('This looks like it may include patient details. Please remove them, then send again.');
      message.focus();
      return;
    }
    send.disabled = true;
    say('Sending…');
    try {
      // Apps Script accepts a simple form post; the response is opaque (no-cors), so delivery is assumed.
      await fetch(FEEDBACK_URL, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(r.payload) });
      form.reset();
      warnedPatientInfo = false;
      startedAt = Date.now();
      say('Sent. Thank you.');
    } catch {
      say('That didn\'t go through. Please try again, or message me on LinkedIn.');
    } finally {
      send.disabled = false;
    }
  });
  section.append(h('p', { class: 'feedback__lede' }, 'Corrections and ideas go straight to me and help shape the next version.'), form, linkedin);
  return section;
}

// Scroll to the form, preselect a topic, and put the cursor in the message box.
export function openFeedback({ kind } = {}) {
  const kindSelect = document.getElementById('fb-kind');
  if (kind && kindSelect) kindSelect.value = kind;
  document.getElementById('fb-message')?.focus({ preventScroll: true });
  document.getElementById('feedback')?.scrollIntoView({ block: 'start' });
}
