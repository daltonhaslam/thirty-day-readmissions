// Reader feedback: validation and a patient-information check. Pure; the form lives in ui/feedbackForm.js.

export const FEEDBACK_KINDS = [
  ['data', 'Data looks wrong'],
  ['confusing', 'Something is confusing'],
  ['idea', 'Idea for the site'],
  ['other', 'Other'],
];
const KIND_KEYS = new Set(FEEDBACK_KINDS.map(([k]) => k));
export const MAX_MESSAGE = 2000;
const MIN_FILL_MS = 3000; // humans take longer than this to write anything
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Words and shapes that suggest patient identifiers (record numbers, birth dates).
// Hospital CCNs are six digits and years are four, so neither trips the long-number rule.
const PATIENT_HINTS = [
  /\b(mrn|dob|date of birth|medical record|ssn|social security)\b/i,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  /\b\d{7,}\b/,
];
export const looksLikePatientInfo = (text) => PATIENT_HINTS.some((re) => re.test(String(text ?? '')));

// -> { ok: true, payload } | { ok: false, reason: 'spam' | 'short' | 'long' | 'email' }
export function validateFeedback({ kind, message, email, website, startedAt }, { now, page, title }) {
  if (website || now - startedAt < MIN_FILL_MS) return { ok: false, reason: 'spam' };
  const text = String(message ?? '').trim();
  if (text.length < 5) return { ok: false, reason: 'short' };
  if (text.length > MAX_MESSAGE) return { ok: false, reason: 'long' };
  const mail = String(email ?? '').trim();
  if (mail && !EMAIL.test(mail)) return { ok: false, reason: 'email' };
  return { ok: true, payload: { kind: KIND_KEYS.has(kind) ? kind : 'other', message: text, email: mail, page, title } };
}
