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
  {
    const { page: p } = await open('#hospital-460001');
    const t = await p.textContent('.hosp__summary');
    check(t.includes('rounded to zero') && !t.includes('at or below'), `460001 (flag rounded to zero) summary: "${t}"`);
    await p.close();
  }
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

// 8. Skip link moves focus to the content without changing the page.
{
  const { page } = await open('#hospital-010006');
  const title = await page.title();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check((await page.title()) === title, 'skip link changed the page');
  check((await page.evaluate(() => document.activeElement.id)) === 'main', 'skip link did not focus main');
  await page.close();
}

// 9. Tables: second click on an ascending-first column sorts descending; focus stays on the sort button.
{
  const { page } = await open('#state-ut');
  const th = page.locator('#scope-hospitals th', { hasText: 'Hospital' }).first();
  await th.locator('button').click();
  await th.locator('button').click();
  check((await th.getAttribute('aria-sort')) === 'descending', 'name column cannot sort descending');
  await page.locator('#scope-hospitals th button', { hasText: 'Cut' }).focus();
  await page.keyboard.press('Enter');
  check(await page.evaluate(() => document.activeElement?.closest('thead') != null), 'sorting dropped keyboard focus');
  await page.close();
}

// 10. Section links land on the section even without scroll anchoring (Safari); Back restores scroll.
{
  const { page } = await open('#hospital-010006');
  await page.addStyleTag({ content: 'html { overflow-anchor: none !important; }' });
  await page.locator('.nav a[data-nav="history"]').click();
  await page.waitForTimeout(700);
  const top = await page.evaluate(() => document.getElementById('history').getBoundingClientRect().top);
  check(top >= -2 && top < 200, `nav to #history landed ${Math.round(top)}px from the top`);
  await page.close();
  const { page: p2 } = await open('#state-ut');
  await p2.evaluate(() => window.scrollTo(0, 2400));
  await p2.waitForTimeout(150);
  await p2.evaluate(() => { location.hash = '#hospital-460011'; });
  await p2.waitForTimeout(400);
  await p2.goBack();
  await p2.waitForTimeout(700);
  const y = await p2.evaluate(() => window.scrollY);
  check(Math.abs(y - 2400) < 120, `Back restored scroll to ${Math.round(y)} instead of ~2400`);
  await p2.close();
}

// 10b. Back restores explorer filters; a fresh visit starts clean.
{
  const { page } = await open('#state-ut');
  const box = page.locator('#scope-hospitals input[type="checkbox"]').first();
  await box.check();
  await page.evaluate(() => { location.hash = '#hospital-460011'; });
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(500);
  check(await page.locator('#scope-hospitals input[type="checkbox"]').first().isChecked(), 'Back did not restore explorer filter');
  await page.evaluate(() => { location.hash = '#state-id'; });
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#state-ut'; });
  await page.waitForTimeout(300);
  check(!(await page.locator('#scope-hospitals input[type="checkbox"]').first().isChecked()), 'fresh visit kept old explorer filter');
  await page.close();
}

// 11. A route change moves focus to the new page heading.
{
  const { page } = await open('');
  await page.evaluate(() => { location.hash = '#state-ut'; });
  await page.waitForTimeout(400);
  check(await page.evaluate(() => document.activeElement?.tagName === 'H1'), 'route change did not move focus to the heading');
  await page.close();
}

// 12. What-if: an out-of-range ratio does not jump on first touch; copy details.
{
  const { page } = await open('#hospital-040020');
  const cut = () => page.locator('.whatif__out .field__value').first().textContent();
  const actual = await cut();
  const slider = page.locator('#wi-CABG');
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  check((await cut()) === actual, `what-if jumped on first touch (${actual} -> ${await cut()})`);
  await page.close();
  const { page: p2 } = await open('#hospital-010001');
  check((await p2.textContent('.hosp__summary')).includes('COPD added the most'), 'COPD lowercased in summary');
  await p2.close();
  const { page: p3 } = await open('#hospital-050690');
  const t = await p3.textContent('main');
  check(!t.includes('rounds to 0') && t.includes('weight not published'), 'missing-weight condition mislabeled');
  await p3.close();
}

// 13. Conditions column is readable by screen readers.
{
  const { page } = await open('#explore');
  const txt = await page.locator('#explore tbody tr').first().locator('td').nth(4).textContent();
  check(/penalized on|no condition/i.test(txt), `conditions cell has no text alternative ("${txt}")`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.log(`FAIL (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('e2e smoke: all checks passed');
