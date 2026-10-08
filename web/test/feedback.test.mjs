import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, looksLikePatientInfo, statusFor } from '../src/js/feedback.js';

const base = { kind: 'data', message: 'The bed count for this hospital looks wrong.', email: '', trap: '', elapsed: 9000 };
const ctx = { page: '#hospital-010006', title: 'Southeast Health · Thirty Day Readmissions' };

test('a submission becomes a payload with page context and the spam signals for the server', () => {
  const r = validateFeedback(base, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.payload, { kind: 'data', message: base.message, email: '', page: '#hospital-010006', title: ctx.title, trap: '', elapsed: '9000' });
});

test('message length and email format are checked', () => {
  assert.equal(validateFeedback({ ...base, message: '  hi ' }, ctx).reason, 'short');
  assert.equal(validateFeedback({ ...base, email: 'not-an-email' }, ctx).reason, 'email');
  assert.equal(validateFeedback({ ...base, email: ' me@example.org ' }, ctx).payload.email, 'me@example.org');
});

test('patient-information check catches identifiers', () => {
  for (const t of ['MRN 4482913 was readmitted', 'the MRNs below', 'medical records show it', 'patient DOB 03/14/1948',
    'birthdate is wrong', 'born 1948-03-14', 'pt 123-45-6789 readmitted', 'acct E1234567', 'date of birth is in the chart']) {
    assert.equal(looksLikePatientInfo(t), true, t);
  }
});

test('patient-information check leaves ordinary HRRP talk alone', () => {
  for (const t of ['CCN 010006 shows 334 beds in FY2027', 'The HF ratio of 1.0456 seems high for 2026',
    'performance period 7/1/2021-6/30/2024', 'base payments of $2345678 look low', 'see 90 FR 36923']) {
    assert.equal(looksLikePatientInfo(t), false, t);
  }
});

test('server replies map to reader-facing status', () => {
  assert.equal(statusFor('ok'), 'sent');
  assert.equal(statusFor('ignored'), 'sent');
  assert.equal(statusFor('busy'), 'busy');
  assert.equal(statusFor('rejected'), 'short');
  assert.equal(statusFor('<html>error</html>'), 'unconfirmed');
});
