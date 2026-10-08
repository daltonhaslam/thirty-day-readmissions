import { h } from '../dom.js';
import { FEEDBACK_KINDS, MAX_MESSAGE, validateFeedback, looksLikePatientInfo, statusFor } from '../feedback.js';
import { FEEDBACK_URL, LINKEDIN_URL } from '../site.js';

// build.mjs can override the endpoint for tests; outside a bundle the site.js value is used.
// eslint-disable-next-line no-undef
const ENDPOINT = typeof __FEEDBACK_URL__ === 'string' ? __FEEDBACK_URL__ : FEEDBACK_URL;
export const FEEDBACK_ENABLED = Boolean(ENDPOINT);

const MESSAGES = {
  sent: 'Sent. Thank you.',
  short: 'Please write a few words so I know what to look at.',
  email: 'That email address doesn\'t look right. Leave it blank if you don\'t need a reply.',
  busy: 'Lots of notes are arriving right now. Please try again in a few minutes, or message me on LinkedIn.',
  unconfirmed: 'I couldn\'t confirm it arrived. Rather than sending it again, please message me on LinkedIn if it matters.',
  patient: 'This looks like it may include patient details. Please remove them, then send again.',
};

// One numbered form box (claim-form style). The number is decoration; the note is a description, not the name.
function box(no, label, control, { wide, note } = {}) {
  const noteEl = note ? h('span', { class: 'field__note', id: `${control.id}-note` }, note) : null;
  if (noteEl) control.setAttribute('aria-describedby', noteEl.id);
  return h('div', { class: `field${wide ? ' field--wide' : ''}` },
    h('label', { class: 'field__label', for: control.id }, h('span', { class: 'field__no', 'aria-hidden': 'true' }, String(no)), label),
    control, noteEl);
}

// Footer block: a short feedback form (when an endpoint is configured) plus a LinkedIn contact line.
export function feedbackSection() {
  const linkedin = h('p', { class: 'feedback__alt' }, 'Prefer to talk? ',
    h('a', { href: LINKEDIN_URL, target: '_blank', rel: 'noopener' }, 'Message me on LinkedIn'), '.');
  const section = h('section', { class: 'feedback', id: 'feedback', 'aria-labelledby': 'feedback-h' },
    h('h2', { id: 'feedback-h', class: 'feedback__title' }, 'Spot an error or have an idea?'));
  if (!FEEDBACK_ENABLED) {
    section.append(linkedin);
    return section;
  }
  let firstKeyAt = null; // time of the first keystroke in the current note
  let warnedText = null; // the exact note that already got the patient-information warning
  const kind = h('select', { class: 'select', id: 'fb-kind', name: 'kind' }, FEEDBACK_KINDS.map(([v, l]) => h('option', { value: v }, l)));
  const message = h('textarea', { id: 'fb-message', name: 'message', rows: '4', maxlength: String(MAX_MESSAGE), required: true });
  const email = h('input', { id: 'fb-email', name: 'email', type: 'email', autocomplete: 'email' });
  // Hidden from people, tempting to bots; the server ignores any submission that fills it.
  const trap = h('input', { id: 'fb-trap', name: 'fb_trap', type: 'text', tabindex: '-1', autocomplete: 'off' });
  const status = h('p', { id: 'fb-status', class: 'feedback__status', role: 'status', 'aria-live': 'polite' });
  const send = h('button', { class: 'btn btn--red', type: 'submit' }, 'Send feedback');
  const say = (key) => { status.textContent = MESSAGES[key]; };
  message.addEventListener('input', () => { firstKeyAt ??= Date.now(); });

  const form = h('form', { class: 'form feedback__form', novalidate: true },
    box(1, 'What is it about?', kind),
    box(2, 'Email, if you\'d like a reply', email),
    box(3, 'Your note', message, { wide: true, note: 'Please don\'t include patient names, record numbers, birth dates, or other patient details.' }),
    h('div', { class: 'feedback__trap', 'aria-hidden': 'true' }, h('label', { for: 'fb-trap' }, 'Leave this blank'), trap),
    h('div', { class: 'field field--wide feedback__actions' }, send, status));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = validateFeedback({ kind: kind.value, message: message.value, email: email.value, trap: trap.value,
      elapsed: firstKeyAt ? Date.now() - firstKeyAt : 0 }, { page: window.location.hash || '#', title: document.title });
    if (!r.ok) { say(r.reason); return; }
    if (looksLikePatientInfo(r.payload.message) && warnedText !== r.payload.message) {
      warnedText = r.payload.message;
      say('patient');
      message.focus();
      return;
    }
    send.disabled = true;
    status.textContent = 'Sending…';
    let outcome;
    try {
      // A simple form post (no preflight); Apps Script answers ok / ignored / busy / rejected.
      const res = await fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams(r.payload) });
      outcome = statusFor(await res.text());
    } catch {
      outcome = 'unconfirmed'; // e.g., a network that blocks Google's script host after the note was saved
    }
    send.disabled = false;
    say(outcome);
    if (outcome === 'sent') {
      form.reset();
      firstKeyAt = null;
      warnedText = null;
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
