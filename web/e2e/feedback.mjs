// Feedback form, end to end: builds a copy wired to a fake Apps Script URL, serves it with the
// vercel.json headers (so CSP is enforced), intercepts the POST, and checks what was sent.
// Usage: node e2e/feedback.mjs
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serveWithHeaders, makeCheck } from './_lib.mjs';

const FAKE = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const out = mkdtempSync(join(tmpdir(), 'tdr-feedback-'));
execFileSync('node', ['build.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, FEEDBACK_URL: FAKE, BUILD_OUT_DIR: out }, stdio: 'ignore' });
const { base, close } = serveWithHeaders(readFileSync(join(out, 'index.html')));
const { check, report } = makeCheck('feedback e2e');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const posts = [];
let reply = 'ok'; // what the fake Apps Script answers, with the CORS header Google's script host sends
const strays = [];
// Never let a test reach the real script: anything on Google's script hosts that isn't FAKE is blocked and fails the run.
await page.route(/https:\/\/script\.(google|googleusercontent)\.com\//, (route) => {
  if (!route.request().url().startsWith(FAKE)) { strays.push(route.request().url()); return route.abort(); }
  posts.push(route.request().postData());
  return route.fulfill({ status: 200, body: reply, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' } });
});

await page.goto(`${base}#hospital-010006`);
await page.waitForFunction(() => document.querySelector('#main > div'));
check(await page.locator('#feedback form').isVisible(), 'feedback form not shown when an endpoint is configured');
check(await page.locator('#feedback a[href*="linkedin.com"]').count() > 0, 'LinkedIn contact link missing');

// The hospital page button opens the form with "Data looks wrong" selected and the message focused.
await page.getByRole('button', { name: /report a problem with this hospital/i }).click();
check((await page.locator('#fb-kind').inputValue()) === 'data', 'report button did not preselect "Data looks wrong"');
check(await page.evaluate(() => document.activeElement?.id === 'fb-message'), 'report button did not focus the message');

// A message that looks like patient information gets a warning first, then sends on the second click.
await page.fill('#fb-message', 'Patient MRN 4482913 was readmitted but not counted.');
await page.waitForTimeout(1700);
await page.click('#feedback button[type="submit"]');
check(/patient/i.test(await page.textContent('#fb-status')), 'no patient-information warning');
check(posts.length === 0, 'sent before the patient-information warning was acknowledged');
await page.fill('#fb-message', 'The heart failure ratio here looks too high for this hospital.');
await page.fill('#fb-email', 'reader@example.org');
await page.click('#feedback button[type="submit"]');
await page.waitForFunction(() => /thank/i.test(document.querySelector('#fb-status')?.textContent || ''));
check(posts.length === 1, `expected one POST, got ${posts.length}`);
const sent = new URLSearchParams(posts[0] || '');
check(sent.get('kind') === 'data' && sent.get('page') === '#hospital-010006' && sent.get('email') === 'reader@example.org', `payload: ${posts[0]}`);
const heading = (await page.textContent('h1')).trim();
check((sent.get('title') || '').startsWith(heading), `payload title "${sent.get('title')}" lacks the hospital name "${heading}"`);
check(sent.get('trap') === '' && Number(sent.get('elapsed')) > 0, `spam signals missing from payload: ${posts[0]}`);
check((await page.inputValue('#fb-message')) === '', 'form not cleared after sending');

// A busy server is reported honestly and the note is kept.
reply = 'busy';
await page.fill('#fb-message', 'A second note while the server is busy.');
await page.waitForTimeout(1700);
await page.click('#feedback button[type="submit"]');
await page.waitForFunction(() => /try again/i.test(document.querySelector('#fb-status')?.textContent || ''));
check((await page.inputValue('#fb-message')) !== '', 'note cleared even though the server was busy');

// A bot that fills the hidden field: the server decides (it answers "ignored"), the reader sees "Sent".
reply = 'ignored';
await page.evaluate(() => { document.querySelector('#fb-trap').value = 'http://spam.example'; });
await page.click('#feedback button[type="submit"]');
await page.waitForFunction(() => /thank/i.test(document.querySelector('#fb-status')?.textContent || ''));
check(new URLSearchParams(posts.at(-1)).get('trap') === 'http://spam.example', 'trap value not passed to the server');

// The note text is the accessible name's content only through its description, not the label.
const name = await page.evaluate(() => document.querySelector('#fb-message').labels[0].textContent);
check(!/patient/i.test(name), `textarea label includes the note: "${name}"`);
check(!errors.length, `console errors: ${errors.join(' | ')}`);

check(!strays.length, `requests escaped to a real script URL: ${strays.join(', ')}`);

// Kill switch: an empty endpoint hides the form and the report button and changes the Methods text.
const offDir = mkdtempSync(join(tmpdir(), 'tdr-feedback-off-'));
execFileSync('node', ['build.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, FEEDBACK_URL: '', BUILD_OUT_DIR: offDir }, stdio: 'ignore' });
const off = serveWithHeaders(readFileSync(join(offDir, 'index.html')));
const offPage = await browser.newPage();
await offPage.goto(`${off.base}#hospital-010006`);
await offPage.waitForFunction(() => document.querySelector('#main > div'));
check(await offPage.locator('#feedback form').count() === 0, 'form shown although feedback is off');
check(await offPage.getByRole('button', { name: /report a problem/i }).count() === 0, 'report button shown although feedback is off');
check(await offPage.locator('#feedback a[href*="linkedin.com"]').count() > 0, 'LinkedIn link missing when feedback is off');
await offPage.goto(`${off.base}#methods`);
await offPage.waitForFunction(() => document.querySelector('#main > div'));
check(/collects nothing about you/.test(await offPage.textContent('main')), 'Methods text still describes a live form');
off.close();

await browser.close();
close();
report();
