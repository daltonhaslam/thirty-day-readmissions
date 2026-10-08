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

function env({ quota = 100, recent = 0, sentToday = 0, lockFails = false } = {}) {
  const rows = [];
  const formats = [];
  const mail = [];
  const now = new Date('2026-10-09T12:00:00Z');
  const windowKey = `recent-${Math.floor(now.getTime() / 600000)}`;
  const cache = new Map(recent ? [[windowKey, String(recent)]] : []);
  const props = new Map(sentToday ? [['mail-2026-10-09', String(sentToday)]] : []);
  return {
    rows, formats, mail, props, cache, windowKey, now,
    owner: 'owner@example.org',
    sheet: {
      getLastRow: () => rows.length,
      appendRow: (r) => rows.push(r),
      getRange: (row, col, nr, nc) => ({
        setNumberFormat(f) { formats.push([row, col, nr, nc, f]); return this; },
        setValues(v) { rows[row - 1] = v[0]; return this; },
      }),
    },
    mailer: { getRemainingDailyQuota: () => quota, sendEmail: (o) => mail.push(o) },
    store: { getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) },
    cache: { get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) },
    lock: { waitLock: () => { if (lockFails) throw new Error('Lock timeout'); }, releaseLock: () => {} },
  };
}
const good = { kind: 'data', message: 'Bed count looks wrong here.', email: 'reader@example.org', page: '#hospital-010006',
  title: 'Southeast Health · Thirty Day Readmissions', trap: '', elapsed: '8000' };

test('a valid submission adds a header row, a plain-text data row, and an email with reply-to', () => {
  const e = env();
  assert.equal(handleFeedback(good, e), 'ok');
  assert.equal(e.rows.length, 2);
  assert.equal(e.rows[0][0], 'Received');
  assert.equal(e.rows[1][1], 'Data looks wrong');
  assert.deepEqual(e.formats.at(-1), [2, 2, 1, 5, '@'], 'reader columns are stored as plain text');
  assert.equal(e.mail.length, 1);
  assert.equal(e.mail[0].to, 'owner@example.org');
  assert.equal(e.mail[0].replyTo, 'reader@example.org');
  assert.match(e.mail[0].body, /#hospital-010006/);
});

test('bot signals are ignored on the server: filled trap, too fast, or no timing at all', () => {
  for (const p of [{ ...good, trap: 'x' }, { ...good, elapsed: '500' }, { ...good, elapsed: undefined }]) {
    const e = env();
    assert.equal(handleFeedback(p, e), 'ignored');
    assert.equal(e.rows.length + e.mail.length, 0);
  }
});

test('too-short messages are rejected', () => {
  const e = env();
  assert.equal(handleFeedback({ ...good, message: 'hi' }, e), 'rejected');
  assert.equal(e.rows.length, 0);
});

test('formulas stay text even after a CSV export, and fields are length-capped', () => {
  const e = env();
  handleFeedback({ ...good, message: '=HYPERLINK("http://evil","x") '.padEnd(5000, 'y') }, e);
  assert.ok(e.rows[1][2].startsWith("' ="));
  assert.ok(e.rows[1][2].length <= 2003);
});

test('invalid email gets no reply-to, and the subject never contains line breaks', () => {
  const e = env();
  handleFeedback({ ...good, email: 'nope', page: '#state-ut\r\nBcc: victim@example.org' }, e);
  assert.equal(e.mail[0].replyTo, undefined);
  assert.equal(e.rows[1][3], '');
  assert.doesNotMatch(e.mail[0].subject, /[\r\n]/);
});

test('the rate limit counts per fixed 10-minute window, inside the lock', () => {
  const busy = env({ recent: 20 });
  assert.equal(handleFeedback(good, busy), 'busy');
  assert.equal(busy.rows.length, 0);
  const fresh = env();
  handleFeedback(good, fresh);
  assert.equal(fresh.cache.get(fresh.windowKey), '1');
});

test('a lock timeout reports busy without counting toward the limit', () => {
  const e = env({ lockFails: true });
  assert.equal(handleFeedback(good, e), 'busy');
  assert.equal(e.cache.get(e.windowKey) ?? null, null);
});

test('an exhausted mail quota still logs the row', () => {
  const e = env({ quota: 0 });
  assert.equal(handleFeedback(good, e), 'ok');
  assert.equal(e.rows.length, 2);
  assert.equal(e.mail.length, 0);
});

test('server rules match the browser rules (they cannot share code)', async () => {
  const fb = await import('../src/js/feedback.js');
  assert.deepEqual(Object.entries(sandbox.KINDS), fb.FEEDBACK_KINDS);
  assert.equal(sandbox.MAX_MESSAGE, fb.MAX_MESSAGE);
  assert.equal(sandbox.MIN_MESSAGE, fb.MIN_MESSAGE);
  assert.equal(sandbox.MIN_FILL_MS, fb.MIN_FILL_MS);
  assert.equal(sandbox.EMAIL.source, fb.EMAIL.source);
});

test('the script asks only for access to its own spreadsheet', () => {
  assert.match(src, /@OnlyCurrentDoc/);
});

test('emails stop at the daily cap but rows are still saved', () => {
  const e = env({ sentToday: sandbox.MAX_EMAILS_PER_DAY });
  assert.equal(handleFeedback(good, e), 'ok');
  assert.equal(e.rows.length, 2);
  assert.equal(e.mail.length, 0);
  const fresh = env();
  handleFeedback(good, fresh);
  assert.equal(fresh.props.get('mail-2026-10-09'), '1');
});

test('the email leads with details; the subject carries only the route, never reader text', () => {
  const e = env();
  handleFeedback({ ...good, title: 'URGENT: verify your account', page: '#hospital-010006' }, e);
  assert.doesNotMatch(e.mail[0].subject, /URGENT/);
  assert.match(e.mail[0].subject, /#hospital-010006/);
  assert.ok(e.mail[0].body.indexOf('Kind:') < e.mail[0].body.indexOf(good.message));
});

test('pages that are not site routes are dropped', () => {
  const e = env();
  handleFeedback({ ...good, page: 'https://evil.example/login' }, e);
  assert.equal(e.rows[1][4], '');
});

test('full-width formula characters are neutralized and odd kinds fall back to Other', () => {
  const e = env();
  handleFeedback({ ...good, kind: 'constructor', message: '＝HYPERLINK("x") please check' }, e);
  assert.ok(e.rows[1][2].startsWith("'"));
  assert.equal(e.rows[1][1], 'Other');
});
