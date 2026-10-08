// Reader feedback: validation and a patient-information check. Pure; the form lives in ui/feedbackForm.js.

export const FEEDBACK_KINDS = [
  ['data', 'Data looks wrong'],
  ['confusing', 'Something is confusing'],
  ['idea', 'Idea for the site'],
  ['other', 'Other'],
];
// These limits are repeated in feedback/apps-script.gs (it cannot import); a test keeps them equal.
export const MIN_MESSAGE = 5;
export const MAX_MESSAGE = 2000;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_MS = 3000; // humans take longer than this to write anything

// Words and shapes that suggest patient identifiers (record numbers, birth dates).
// Hospital CCNs are six digits and years are four, so neither trips the long-number rule.
const PATIENT_HINTS = [
  /\b(mrn|dob|date of birth|medical record|ssn|social security)\b/i,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  /\b\d{7,}\b/,
];
export const looksLikePatientInfo = (text) => PATIENT_HINTS.some((re) => re.test(String(text ?? '')));

// -> { ok: true, payload } | { ok: false, reason: 'spam' | 'short' | 'email' }
// The textarea's maxlength caps length; the server re-checks everything.
export function validateFeedback({ kind, message, email, website, startedAt }, { now, page, title }) {
  if (website || now - startedAt < MIN_FILL_MS) return { ok: false, reason: 'spam' };
  const text = String(message ?? '').trim();
  if (text.length < MIN_MESSAGE) return { ok: false, reason: 'short' };
  const mail = String(email ?? '').trim();
  if (mail && !EMAIL.test(mail)) return { ok: false, reason: 'email' };
  return { ok: true, payload: { kind, message: text, email: mail, page, title } };
}
