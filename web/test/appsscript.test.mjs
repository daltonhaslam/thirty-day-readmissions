import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load the Apps Script file into a sandbox (Apps Script is plain JS with global functions).
const src = readFileSync(new URL('../../feedback/apps-script.gs', import.meta.url), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { handleFeedback } = sandbox;

function env({ quota = 100, recent = 0 } = {}) {
  const rows = [];
  const mail = [];
  const cache = new Map(recent ? [['recent', String(recent)]] : []);
  return {
    rows, mail,
    now: new Date('2026-10-09T12:00:00Z'),
    owner: 'owner@example.org',
    sheet: { getLastRow: () => rows.length, appendRow: (r) => rows.push(r) },
    mailer: { getRemainingDailyQuota: () => quota, sendEmail: (o) => mail.push(o) },
    cache: { get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) },
    lock: { waitLock: () => {}, releaseLock: () => {} },
  };
}
const good = { kind: 'data', message: 'Bed count looks wrong here.', email: 'reader@example.org', page: '#hospital-010006', title: 'Southeast Health · Thirty Day Readmissions' };

test('a valid submission adds a header row, a data row, and an email with reply-to', () => {
  const e = env();
  assert.equal(handleFeedback(good, e), 'ok');
  assert.equal(e.rows.length, 2);
  assert.equal(e.rows[0][0], 'Received');
  assert.equal(e.rows[1][1], 'Data looks wrong');
  assert.equal(e.mail.length, 1);
  assert.equal(e.mail[0].to, 'owner@example.org');
  assert.equal(e.mail[0].replyTo, 'reader@example.org');
  assert.match(e.mail[0].body, /#hospital-010006/);
});

test('honeypot submissions are dropped silently', () => {
  const e = env();
  assert.equal(handleFeedback({ ...good, website: 'x' }, e), 'ignored');
  assert.equal(e.rows.length + e.mail.length, 0);
});

test('too-short messages are rejected', () => {
  const e = env();
  assert.equal(handleFeedback({ ...good, message: 'hi' }, e), 'rejected');
  assert.equal(e.rows.length, 0);
});

test('spreadsheet formulas are neutralized and fields are length-capped', () => {
  const e = env();
  handleFeedback({ ...good, message: '=HYPERLINK("http://evil","x") '.padEnd(5000, 'y') }, e);
  assert.ok(e.rows[1][2].startsWith("'="));
  assert.ok(e.rows[1][2].length <= 2001);
});

test('invalid email gets no reply-to, and the subject never contains line breaks', () => {
  const e = env();
  handleFeedback({ ...good, email: 'nope', title: 'Bad\r\nBcc: victim@example.org' }, e);
  assert.equal(e.mail[0].replyTo, undefined);
  assert.equal(e.rows[1][3], '');
  assert.doesNotMatch(e.mail[0].subject, /[\r\n]/);
});

test('a burst over the rate limit is refused; an exhausted mail quota still logs the row', () => {
  const busy = env({ recent: 20 });
  assert.equal(handleFeedback(good, busy), 'busy');
  assert.equal(busy.rows.length, 0);
  const noQuota = env({ quota: 0 });
  assert.equal(handleFeedback(good, noQuota), 'ok');
  assert.equal(noQuota.rows.length, 2);
  assert.equal(noQuota.mail.length, 0);
});
