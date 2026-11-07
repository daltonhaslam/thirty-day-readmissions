// The "moved" page (docs/), end to end, in Chrome, Firefox and WebKit: served with the exact vercel.json headers (so its CSP is
// enforced), the button's address is right for six old hashes, a hash changed on the page moves it, and with JavaScript off it
// opens /hrrp/. No console error, no request off the page's own origin, no sideways scroll on a phone. paidandpenalized.org is
// never reached: the button is read, not followed. CCNs and CBSAs are invented.
// Usage: node e2e/moved.mjs [--url https://thirty-day-readmissions.vercel.app/]   (the live check after a deploy)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';
import { INSIGHTS_PATH, makeCheck, vercelConfig } from './_lib.mjs';

const P = 'https://paidandpenalized.org/hrrp/';
const CASES = [
  ['', P, ''],
  ['#hospital-990001', `${P}hospital/990001/`, 'Your link was to a hospital, CCN 990001: the button opens its page there.'],
  ['#state-UT', `${P}state/ut/`, 'Your link was to a state: the button opens its page there.'],
  ['#metro-99990', `${P}metro/99990/`, 'Your link was to a metro area: the button opens its page there.'],
  ['#division-south-atlantic', `${P}division/south-atlantic/`, 'Your link was to a census division: the button opens its page there.'],
  ['#methods-dollars', `${P}methods/#methods-dollars`, 'Your link was to the dollar assumptions: the button opens them there.'],
  ['#/map', `${P}#map`, 'Your link was to the map: the button opens it there.'],
  ['#nope-route', P, ''],
];

const urlArg = process.argv.indexOf('--url');
const live = urlArg > -1 ? process.argv[urlArg + 1] : null;

// docs/ as Vercel serves it: its files at their names, every response with vercel.json's headers, Vercel's analytics script
// stood in by an empty one.
function serveDocs() {
  const headers = Object.fromEntries(vercelConfig.headers.flatMap((r) => r.headers.map((x) => [x.key, x.value])));
  const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/moved.js': ['moved.js', 'text/javascript'], '/og.png': ['og.png', 'image/png'] };
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === INSIGHTS_PATH) { res.writeHead(200, { 'Content-Type': 'text/javascript', ...headers }); res.end(''); return; }
    const f = files[path];
    res.writeHead(f ? 200 : 404, { 'Content-Type': f ? f[1] : 'text/plain', ...headers });
    res.end(f ? readFileSync(new URL(`../../${vercelConfig.outputDirectory}/${f[0]}`, import.meta.url)) : '');
  }).listen(0);
  return { base: `http://localhost:${server.address().port}/`, close: () => server.close() };
}

const { base, close } = live ? { base: live, close: () => {} } : serveDocs();
const { origin } = new URL(base);
const { check, report } = makeCheck(`moved page${live ? ` (${live})` : ''}`);

for (const [name, type, options] of [['chrome', chromium, { channel: 'chrome' }], ['firefox', firefox, {}], ['webkit', webkit, {}]]) {
  const browser = await type.launch(options);
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    // Never count a test visit: Vercel's analytics script and its beacon are answered here, on the live site too.
    await context.route(`**${INSIGHTS_PATH.replace(/script\.js$/, '')}**`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const errors = [];
    const strays = [];
    context.on('request', (r) => { if (new URL(r.url()).origin !== origin) strays.push(r.url()); });
    for (const [hash, href, note] of CASES) {
      const page = await context.newPage();
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${hash}: ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`${hash}: ${e}`));
      await page.goto(base + hash, { waitUntil: 'load' });
      const label = `${name}${javaScriptEnabled ? '' : ' (JS off)'} ${hash || '(none)'}`;
      const want = javaScriptEnabled ? { href, note } : { href: P, note: '' };
      if (javaScriptEnabled) await page.waitForFunction((h) => document.getElementById('go').href === h, href, { timeout: 3000 }).catch(() => {});
      const got = await page.locator('#go').getAttribute('href');
      check(got === want.href, `${label}: button goes to ${got}, not ${want.href}`);
      const shown = await page.locator('#note').isVisible();
      check(shown === Boolean(want.note), `${label}: note ${shown ? 'shown' : 'hidden'}`);
      if (want.note) check((await page.locator('#note').textContent()) === want.note, `${label}: note reads "${await page.locator('#note').textContent()}"`);
      await page.close();
    }
    if (javaScriptEnabled) {
      // A hash changed on the page moves the button; a phone has no sideways scroll.
      const page = await context.newPage();
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(base, { waitUntil: 'load' });
      await page.evaluate(() => { location.hash = '#hospital-990002'; });
      await page.waitForFunction(() => document.getElementById('go').href.endsWith('/hrrp/hospital/990002/'), null, { timeout: 3000 }).catch(() => {});
      check((await page.locator('#go').getAttribute('href')) === `${P}hospital/990002/`, `${name}: a hash changed on the page does not move the button`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(wide <= 0, `${name}: scrolls sideways at 360 px (${wide} px)`);
      await page.close();
    }
    check(!errors.length, `${name}${javaScriptEnabled ? '' : ' (JS off)'}: console errors: ${errors.join(' | ')}`);
    check(!strays.length, `${name}: requests off the page's origin: ${[...new Set(strays)].join(', ')}`);
    await context.close();
  }
  await browser.close();
}
close();
report();
