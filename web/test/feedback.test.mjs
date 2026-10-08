import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, looksLikePatientInfo } from '../src/js/feedback.js';

const base = { kind: 'data', message: 'The bed count for this hospital looks wrong.', email: '', website: '', startedAt: 0 };
const ctx = { now: 10_000, page: '#hospital-010006', title: 'Southeast Health · Thirty Day Readmissions' };

test('a normal submission becomes a payload with page context', () => {
  const r = validateFeedback(base, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.payload, { kind: 'data', message: base.message, email: '', page: '#hospital-010006', title: ctx.title });
});

test('honeypot and too-fast submissions are treated as spam', () => {
  assert.equal(validateFeedback({ ...base, website: 'http://spam' }, ctx).reason, 'spam');
  assert.equal(validateFeedback({ ...base, startedAt: 9_000 }, ctx).reason, 'spam');
});

test('message length and email format are checked', () => {
  assert.equal(validateFeedback({ ...base, message: '  hi ' }, ctx).reason, 'short');
  assert.equal(validateFeedback({ ...base, email: 'not-an-email' }, ctx).reason, 'email');
  assert.equal(validateFeedback({ ...base, email: ' me@example.org ' }, ctx).payload.email, 'me@example.org');
});

test('patient-information check flags identifiers, not hospital IDs', () => {
  assert.equal(looksLikePatientInfo('MRN 4482913 was readmitted'), true);
  assert.equal(looksLikePatientInfo('patient DOB 03/14/1948'), true);
  assert.equal(looksLikePatientInfo('date of birth is in the chart'), true);
  assert.equal(looksLikePatientInfo('CCN 010006 shows 334 beds in FY2027'), false);
  assert.equal(looksLikePatientInfo('The HF ratio of 1.0456 seems high for 2026'), false);
});
