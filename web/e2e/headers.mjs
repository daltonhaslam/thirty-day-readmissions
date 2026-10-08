// Serve docs/ with the exact headers from vercel.json and check the page still works under them.
// Usage: node e2e/headers.mjs
import { chromium } from 'playwright';
import { serveWithHeaders, builtPage, makeCheck } from './_lib.mjs';

const { base, close } = serveWithHeaders(builtPage());
const { check, report } = makeCheck('headers check');
const browser = await chromium.launch({ channel: 'chrome' });
for (const hash of ['', '#hospital-010006', '#state-ut']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + hash);
  await page.waitForFunction(() => document.querySelector('#main > div'));
  await page.waitForTimeout(600);
  check(!errors.length, `${hash || '#'}: ${errors.join(' | ')}`);
  // fonts.check() is true even for faces that never loaded; require an actually loaded face.
  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.load('16px "Alfa Slab One"').catch(() => []);
    return [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Alfa Slab One' && f.status === 'loaded');
  });
  check(fontLoaded, `${hash || '#'}: display font blocked`);
  await page.close();
}
await browser.close();
close();
report();
