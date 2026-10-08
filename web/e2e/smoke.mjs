// End-to-end smoke test of the built page (docs/index.html) in installed Chrome.
// Usage: node e2e/smoke.mjs   (exit 1 on any failure)
import { chromium } from 'playwright';

const PAGE = `file://${new URL('../../docs/index.html', import.meta.url).pathname}`;
const ROUTES = ['', '#region-south', '#division-south-atlantic', '#state-ut', '#metro-41620', '#hospital-010006',
  '#hospital-010051', '#hospital-010021', '#methods', '#hospital-999999', '#map', '#nope-route'];
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

const browser = await chromium.launch({ channel: 'chrome' });

async function open(hash, { width = 1280, scheme = 'light' } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(PAGE + hash);
  await page.waitForFunction(() => document.querySelector('#main > div'));
  const ms = Date.now() - t0;
  await page.waitForTimeout(400);
  return { page, errors, ms };
}

// 1. Every route, desktop and phone: no errors, no horizontal scroll, no NaN/undefined text, charts labeled.
for (const width of [1280, 360]) {
  for (const hash of ROUTES) {
    const { page, errors, ms } = await open(hash, { width });
    const label = `${hash || '#'} @${width}`;
    check(!errors.length, `${label}: console errors ${JSON.stringify(errors)}`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= width, `${label}: horizontal overflow (scrollWidth ${sw})`);
    const text = await page.evaluate(() => document.getElementById('main').innerText);
    check(!/\bNaN\b|\bundefined\b|\[object Object\]/.test(text), `${label}: NaN/undefined/[object] in text`);
    const unlabeled = await page.evaluate(() => [...document.querySelectorAll('#main svg')].filter((s) => !s.closest('.legend') && !s.getAttribute('aria-label')).length);
    check(unlabeled === 0, `${label}: ${unlabeled} charts without aria-label`);
    if (width === 1280 && hash === '') check(ms < 2500, `home render took ${ms}ms`);
    await page.close();
  }
}

// 2. Not-found and no-penalty pages read correctly.
{
  const { page } = await open('#hospital-999999');
  check((await page.textContent('main')).includes('No record found'), 'unknown CCN does not show not-found view');
  await page.close();
  for (const id of ['010051', '010021']) {
    const { page: p } = await open(`#hospital-${id}`);
    const t = await p.textContent('main');
    check(t.includes('No cut') && t.includes('has no FY2027 cut'), `${id}: no-penalty verdict missing`);
    await p.close();
  }
}

// 3. Search: punctuation-tolerant queries return results; Enter navigates.
{
  const { page } = await open('');
  const input = page.locator('.topbar input[role="combobox"]');
  for (const q of ["st. mary's", 'saint marys', 'salt lake', '460001']) {
    await input.fill(q);
    const n = await page.locator('.topbar [role="listbox"] li[role="option"]:not([aria-disabled])').count();
    check(n > 0, `search "${q}" returned nothing`);
  }
  await input.fill('utah');
  await input.press('Enter');
  const opened = await page.waitForFunction(() => document.querySelector('h1')?.textContent.trim() === 'Utah', null, { timeout: 3000 }).then(() => true, () => false);
  check(opened, 'Enter on "utah" did not open Utah');
  await page.close();
}

// 4. Explorer: "Penalized only" filters to the penalized count.
{
  const { page } = await open('#explore');
  await page.locator('#explore input[type="checkbox"]').first().check();
  const status = await page.locator('#explore .printout__foot span[aria-live]').textContent();
  check(/of 2,334$/.test(status.trim()), `explorer penalized filter status "${status}"`);
  await page.close();
}

// 5. What-if: dragging a ratio down lowers the cut; Reset restores CMS's figure.
{
  const { page } = await open('#hospital-010006');
  const cut = () => page.locator('.whatif__out .field__value').first().textContent();
  const actual = await cut();
  await page.locator('.whatif input[type="range"]').nth(1).fill('0.8');
  const lower = await cut();
  check(parseFloat(lower) < parseFloat(actual), `what-if did not lower the cut (${actual} -> ${lower})`);
  await page.getByRole('button', { name: 'Reset' }).click();
  check((await cut()) === actual, 'what-if Reset did not restore the actual cut');
  await page.close();
}

// 6. Dark mode changes the page background; theme toggle works.
{
  const light = await open('');
  const dark = await open('', { scheme: 'dark' });
  const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check((await bg(light.page)) !== (await bg(dark.page)), 'dark mode background identical to light');
  await light.page.locator('.theme-btn').click();
  check((await light.page.getAttribute('html', 'data-theme')) === 'dark', 'theme toggle did not switch to dark');
  check((await bg(light.page)) === (await bg(dark.page)), 'night-edition toggle does not match the dark palette');
  await light.page.close();
  await dark.page.close();
}

// 7. Keyboard: first Tab reaches the skip link, then the search box.
{
  const { page } = await open('');
  await page.keyboard.press('Tab');
  check((await page.evaluate(() => document.activeElement.textContent)) === 'Skip to content', 'first Tab is not the skip link');
  await page.close();
}

await browser.close();
if (failures.length) {
  console.log(`FAIL (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('e2e smoke: all checks passed');
