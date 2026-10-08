// Render the 1200x630 social preview card (link previews on LinkedIn, X, Slack...) to ../docs/og.png.
// Usage: node og.mjs   (rerun when the data or the name changes)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadData } from './src/js/data.js';
import { fmtInt, fmtPct } from './src/js/model.js';
import { SITE_NAME, SITE_URL } from './src/js/site.js';

const D = loadData(JSON.parse(readFileSync(new URL('src/data/hrrp.json', import.meta.url), 'utf8')));
const S = D.nation;
const [first, ...rest] = SITE_NAME.split(' ');
const titleTop = `${first} ${rest[0]}`; // "Thirty Day"
const titleBottom = rest.slice(1).join(' '); // "Readmissions"
const field = (no, label, value, note) => `<div class="field"><div class="label"><span class="no">${no}</span>${label}</div><div class="value">${value}</div>${note ? `<div class="note">${note}</div>` : ''}</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Courier+Prime:wght@400;700&family=Libre+Franklin:wght@600&display=swap">
<style>
  :root { --paper:#fbfbf8; --ink:#1c1b1d; --ink2:#49484d; --form:#c4303a; --formink:#a5222c; --tint:#f7e1e2; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: var(--paper); color: var(--ink); font-family: 'Libre Franklin', Arial, sans-serif; }
  .frame { position: absolute; inset: 22px; border: 3px solid var(--form); padding: 46px 52px 40px; display: grid; grid-template-columns: minmax(0, 1fr) 372px; gap: 40px; }
  .kicker { color: var(--formink); font-weight: 600; font-size: 19px; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font: 400 86px/0.95 'Alfa Slab One', Rockwell, Georgia, serif; margin-top: 22px; letter-spacing: -.01em; }
  h1 span { display: block; } h1 .red { color: var(--form); }
  .deck { font: 400 26px/1.35 'Courier Prime', 'Courier New', monospace; color: var(--ink2); margin-top: 28px; max-width: 32ch; }
  .form { align-self: center; border-top: 2px solid var(--form); border-left: 2px solid var(--form); }
  .title { background: var(--tint); color: var(--formink); border-right: 2px solid var(--form); border-bottom: 2px solid var(--form); padding: 10px 14px; font-weight: 600; font-size: 16px; letter-spacing: .1em; text-transform: uppercase; }
  .field { border-right: 2px solid var(--form); border-bottom: 2px solid var(--form); padding: 10px 16px 12px; }
  .label { color: var(--formink); font-weight: 600; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; display: flex; gap: 8px; align-items: center; }
  .no { font: 400 14px/1 'Courier Prime', monospace; border: 1.5px solid var(--form); padding: 2px 5px; letter-spacing: 0; }
  .value { font: 700 44px/1.05 'Courier Prime', 'Courier New', monospace; margin-top: 6px; }
  .note { font: 400 18px/1.2 'Courier Prime', monospace; color: var(--ink2); margin-top: 4px; }
  .url { position: absolute; left: 52px; bottom: 34px; font: 400 22px/1 'Courier Prime', monospace; color: var(--ink); }
  .url b { color: var(--formink); }
</style></head><body><div class="frame">
  <div>
    <div class="kicker">FY${D.meta.fy} edition · Medicare HRRP</div>
    <h1><span>${titleTop}</span><span class="red">${titleBottom}</span></h1>
    <p class="deck">Every hospital's readmission penalty, and how Medicare calculates it.</p>
  </div>
  <div class="form">
    <div class="title">FY${D.meta.fy} at a glance</div>
    ${field(1, 'Hospitals penalized', fmtInt(S.nPen), `of ${fmtInt(S.n)} evaluated`)}
    ${field(2, 'Average cut', fmtPct(S.meanRed), 'of base payments')}
    ${field(3, 'At the 3% maximum', fmtInt(S.nMax), 'hospitals')}
  </div>
  <div class="url"><b>Look up any hospital ›</b> ${SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}</div>
</div></body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const ok = await page.evaluate(() => document.fonts.check('86px "Alfa Slab One"'));
if (!ok) throw new Error('display font failed to load; refusing to write a fallback-font card');
// Refuse to write a card where any text runs past its box (e.g., after a rename).
const overflow = await page.evaluate(() => [...document.querySelectorAll('h1 span, .field, .deck, .url')]
  .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > document.querySelector('.frame').getBoundingClientRect().right
    || (el.closest('.frame > div:first-child') && el.getBoundingClientRect().right > document.querySelector('.form').getBoundingClientRect().left - 8))
  .map((el) => el.textContent.trim().slice(0, 30)));
if (overflow.length) throw new Error(`card text overflows: ${overflow.join(' | ')}`);
const out = fileURLToPath(new URL('../docs/og.png', import.meta.url));
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`wrote ${out}`);
