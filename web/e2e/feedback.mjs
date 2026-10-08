// Feedback form, end to end: builds a copy wired to a fake Apps Script URL, serves it with the
// vercel.json headers (so CSP is enforced), intercepts the POST, and checks what was sent.
// Usage: node e2e/feedback.mjs   (exit 1 on any failure)
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const FAKE = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const out = mkdtempSync(join(tmpdir(), 'tdr-feedback-'));
execFileSync('node', ['build.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, FEEDBACK_URL: FAKE, BUILD_OUT_DIR: out }, stdio: 'ignore' });

const root = new URL('../../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
const headers = Object.fromEntries(config.headers.flatMap((r) => r.headers.map((x) => [x.key, x.value])));
const html = readFileSync(join(out, 'index.html'));
const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(html); }).listen(0);
const base = `http://localhost:${server.address().port}/`;

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const posts = [];
await page.route(`${FAKE}*`, (route) => { posts.push(route.request().postData()); route.fulfill({ status: 200, body: 'ok' }); });

await page.goto(`${base}#hospital-010006`);
await page.waitForFunction(() => document.querySelector('#main > div'));
check(await page.locator('#feedback form').isVisible(), 'feedback form not shown when an endpoint is configured');
check(await page.locator('#feedback a[href*="linkedin.com"]').count() > 0, 'LinkedIn contact link missing');

// The hospital page button opens the form with "Data looks wrong" selected and the message focused.
await page.getByRole('button', { name: /report a problem with this hospital/i }).click();
check((await page.locator('#fb-kind').inputValue()) === 'data', 'report button did not preselect "Data looks wrong"');
check(await page.evaluate(() => document.activeElement?.id === 'fb-message'), 'report button did not focus the message');

// A message that looks like patient information gets a warning first, then sends on the second click.
await page.waitForTimeout(3200);
await page.fill('#fb-message', 'Patient MRN 4482913 was readmitted but not counted.');
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
check(!sent.has('website'), 'honeypot field leaked into the payload');
check((await page.inputValue('#fb-message')) === '', 'form not cleared after sending');

// A bot that fills the hidden field is told "thanks" but nothing is sent.
await page.waitForTimeout(3200);
await page.fill('#fb-message', 'Buy cheap things at my site today');
await page.evaluate(() => { document.querySelector('#fb-website').value = 'http://spam.example'; });
await page.click('#feedback button[type="submit"]');
await page.waitForTimeout(300);
check(posts.length === 1, 'honeypot submission was sent');
check(!errors.length, `console errors: ${errors.join(' | ')}`);

await browser.close();
server.close();
if (failures.length) { console.log(`FAIL (${failures.length})\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('feedback e2e: all checks passed');
