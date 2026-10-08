// Reader feedback: validation, a patient-information check, and reply handling. Pure; the form is ui/feedbackForm.js.

export const FEEDBACK_KINDS = [
  ['data', 'Data looks wrong'],
  ['confusing', 'Something is confusing'],
  ['idea', 'Idea for the site'],
  ['other', 'Other'],
];
// These limits are repeated in feedback/apps-script.gs (it cannot import); a test keeps them equal.
export const MIN_MESSAGE = 5;
export const MAX_MESSAGE = 2000;
export const MIN_FILL_MS = 1500; // from first keystroke to send; faster is almost certainly a bot
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Words and shapes that suggest patient identifiers. Birth-date rules only fire for years before 2001,
// so CMS performance periods (2008 on) and fiscal years don't trip them.
const PATIENT_HINTS = [
  /\b(mrns?|dob|date of birth|birth ?date|born|medical records?|ssn|social security|acct|account (no|number))\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
  /\b\d{1,2}[/-]\d{1,2}[/-](19\d{2}|200\d|\d{2})\b/, // m/d/yyyy before 2010 or m/d/yy
  /\b(19\d{2}|2000)-\d{2}-\d{2}\b/, // ISO date before 2001
  /\b[A-Z]{1,3}\d{6,}\b/, // letter-prefixed record numbers
  /(?<![$\d.,])\b\d{7,}\b(?![.,]\d)/, // long bare numbers (not money, not decimals; CCNs are six digits)
];
export const looksLikePatientInfo = (text) => PATIENT_HINTS.some((re) => re.test(String(text ?? '')));

// -> { ok: true, payload } | { ok: false, reason: 'short' | 'email' }
// Spam signals (trap field, time since first keystroke) go to the server, which decides.
export function validateFeedback({ kind, message, email, trap, elapsed }, { page, title }) {
  const text = String(message ?? '').trim();
  if (text.length < MIN_MESSAGE) return { ok: false, reason: 'short' };
  const mail = String(email ?? '').trim();
  if (mail && !EMAIL.test(mail)) return { ok: false, reason: 'email' };
  return { ok: true, payload: { kind, message: text, email: mail, page, title, trap: trap ?? '', elapsed: String(Math.round(elapsed)) } };
}

// What to tell the reader for each server reply ('ignored' looks like success so bots learn nothing).
export function statusFor(reply) {
  return { ok: 'sent', ignored: 'sent', busy: 'busy', rejected: 'short' }[String(reply).trim()] ?? 'unconfirmed';
}
