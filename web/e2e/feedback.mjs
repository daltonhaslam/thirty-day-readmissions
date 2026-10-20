// Feedback link, end to end: serves docs/ with the vercel.json headers (so CSP is enforced), clicks each
// feedback link, and checks the Google Form opens in a new tab with only the site and current page prefilled.
// Google is never reached: requests to it are answered locally.
// Usage: node e2e/feedback.mjs
import { chromium } from 'playwright';
import { serveWithHeaders, builtPage, makeCheck } from './_lib.mjs';
import { SITE_NAME, FEEDBACK_FORM_URL, FEEDBACK_ENTRIES } from '../src/js/site.js';

const { base, close } = serveWithHeaders(builtPage());
const { check, report } = makeCheck('feedback e2e');
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();
const errors = [];
const strays = [];
await context.route(/^https:\/\/docs\.google\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'form' }));
context.on('request', (r) => { if (/script\.google(usercontent)?\.com/.test(r.url())) strays.push(r.url()); });

const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base);
await page.waitForFunction(() => document.querySelector('#main > div'));
check(await page.locator('#feedback form').count() === 0, 'an in-page feedback form is still rendered');

// Click a link and return the URL the new tab opened.
async function follow(locator, label) {
  check(await locator.getAttribute('target') === '_blank', `${label}: does not open a new tab`);
  check(/\bnoopener\b/.test(await locator.getAttribute('rel') ?? ''), `${label}: missing rel=noopener`);
  check(/opens in a new tab/.test(await locator.textContent()), `${label}: no "opens in a new tab" text`);
  const [popup] = await Promise.all([context.waitForEvent('page'), locator.click()]);
  await popup.waitForLoadState('domcontentloaded');
  const url = popup.url();
  await popup.close();
  return url;
}

function expectPrefill(url, pageUrl, label) {
  const u = new URL(url);
  check(`${u.origin}${u.pathname}` === FEEDBACK_FORM_URL, `${label}: opened ${u.origin}${u.pathname}`);
  check(JSON.stringify([...u.searchParams.keys()]) === JSON.stringify([FEEDBACK_ENTRIES.site, FEEDBACK_ENTRIES.page]), `${label}: sends more than site and page (${u.search})`);
  check(u.searchParams.get(FEEDBACK_ENTRIES.site) === SITE_NAME, `${label}: site prefill is ${u.searchParams.get(FEEDBACK_ENTRIES.site)}`);
  check(u.searchParams.get(FEEDBACK_ENTRIES.page) === pageUrl, `${label}: page prefill is ${u.searchParams.get(FEEDBACK_ENTRIES.page)}, expected ${pageUrl}`);
}

// Routes change in place, so the page address must be read at click time, not when the link was drawn.
for (const hash of ['#hospital-010006', '#methods']) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForFunction((h) => window.location.hash === h && document.querySelector('#main > div'), hash);
  expectPrefill(await follow(page.locator('#feedback a').first(), `footer on ${hash}`), base + hash, `footer on ${hash}`);
}

await page.evaluate(() => { window.location.hash = '#hospital-010006'; });
await page.waitForSelector('a.hosp__report');
expectPrefill(await follow(page.locator('a.hosp__report'), 'hospital report link'), `${base}#hospital-010006`, 'hospital report link');

await page.evaluate(() => { window.location.hash = '#methods'; });
await page.waitForFunction(() => /How this was made/.test(document.querySelector('#main')?.textContent ?? ''));
const methodsLink = page.locator('#main a', { hasText: 'feedback form' }).first();
expectPrefill(await follow(methodsLink, 'methods link'), `${base}#methods`, 'methods link');
const methodsText = await page.textContent('#main');
check(/collects nothing about you and sets no cookies/.test(methodsText), 'Methods privacy text missing "collects nothing"');
check(/Google sees what you send and your IP address/.test(methodsText), 'Methods privacy text does not say Google sees submissions');
check(!/within \d|\bdays?\b.*\b(reply|fix)|delete/i.test(methodsText.match(/Feedback and privacy[\s\S]*?Accessibility/)?.[0] ?? ''), 'Methods feedback text makes a timing or deletion promise');

check(!strays.length, `requests to Apps Script: ${strays.join(', ')}`);
check(!errors.length, `console errors: ${errors.join(' | ')}`);
await browser.close();
close();
report();
