// Render the 1200x630 social preview card to ../docs/og.png and record a hash of its HTML in og.stamp.json
// (a test fails if the card goes stale). Usage: node og.mjs, then node build.mjs (the image URL is versioned).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadData } from './src/js/data.js';
import { cardHtml, CARD_FONTS } from './og-card.mjs';

const D = loadData(JSON.parse(readFileSync(new URL('src/data/hrrp.json', import.meta.url), 'utf8')));
const html = cardHtml(D);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
// document.fonts.check() is true even when a face never loaded, so require a loaded face for each one used.
const missing = await page.evaluate(async (fonts) => {
  await Promise.allSettled(fonts.map(([f, w]) => document.fonts.load(`${w} 20px "${f}"`)));
  const loaded = [...document.fonts].filter((ff) => ff.status === 'loaded');
  return fonts.filter(([f, w]) => !loaded.some((ff) => ff.family.replace(/"/g, '') === f && String(ff.weight) === w)).map((x) => x.join(' '));
}, CARD_FONTS);
if (missing.length) throw new Error(`fonts failed to load (${missing.join(', ')}); refusing to write a fallback-font card`);
// Refuse to write a card where any text runs past its box, sideways or downward (e.g., after a rename).
const problems = await page.evaluate(() => {
  const r = (sel) => document.querySelector(sel).getBoundingClientRect();
  const frame = r('.frame');
  const out = [...document.querySelectorAll('h1 span, .field, .deck, .url, .form')]
    .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > frame.right || el.getBoundingClientRect().bottom > frame.bottom)
    .map((el) => el.textContent.trim().slice(0, 30));
  if (r('.deck').bottom > r('.url').top - 8) out.push('title/deck runs into the address line');
  return out;
});
if (problems.length) throw new Error(`card layout problem: ${problems.join(' | ')}`);
await page.screenshot({ path: fileURLToPath(new URL('../docs/og.png', import.meta.url)) });
await browser.close();
writeFileSync(new URL('og.stamp.json', import.meta.url), `${JSON.stringify({ htmlSha256: createHash('sha256').update(html).digest('hex') }, null, 2)}\n`);
console.log('wrote docs/og.png and web/og.stamp.json; now run node build.mjs');
