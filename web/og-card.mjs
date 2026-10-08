// The social preview card: its HTML (pure, so a test can hash it) and its published, versioned URL.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fmtInt, fmtPct } from './src/js/model.js';
import { SITE_NAME_TOP, SITE_NAME_RED, SITE_URL, FONTS_HREF } from './src/js/site.js';

// Every face the card uses; og.mjs refuses to render if any of them fails to load.
export const CARD_FONTS = [['Alfa Slab One', '400'], ['Courier Prime', '400'], ['Courier Prime', '700'], ['Libre Franklin', '600']];

// The query string changes whenever the image does, so link-preview caches fetch the new card.
export const cardImageUrl = (png) => new URL(`og.png?v=${createHash('sha256').update(png).digest('hex').slice(0, 10)}`, SITE_URL).href;

export function cardHtml(D) {
  const S = D.nation;
  const tokens = readFileSync(new URL('src/styles/tokens.css', import.meta.url), 'utf8');
  const rows = [
    ['Hospitals penalized', fmtInt(S.nPen), `of ${fmtInt(S.n)} evaluated`],
    ['Average cut, penalized', fmtPct(S.meanRedPen), 'of base Medicare payments'],
    ['At the 3% maximum', fmtInt(S.nMax), 'hospitals'],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS_HREF}">
<style>${tokens}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: var(--paper); color: var(--ink); font-family: var(--font-body); }
  .frame { position: absolute; inset: 22px; border: 3px solid var(--form); padding: 46px 52px 40px; display: grid; grid-template-columns: minmax(0, 1fr) 372px; gap: 40px; }
  .kicker { color: var(--form-ink); font-weight: 600; font-size: 19px; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font: 400 86px/0.95 var(--font-display); margin-top: 22px; letter-spacing: -.01em; }
  h1 span { display: block; white-space: nowrap; } h1 .red { color: var(--form); }
  .deck { font: 400 26px/1.35 var(--font-type); color: var(--ink-2); margin-top: 28px; max-width: 32ch; }
  .form { align-self: center; border-top: 2px solid var(--form); border-left: 2px solid var(--form); }
  .title { background: var(--form-tint); color: var(--form-ink); border-right: 2px solid var(--form); border-bottom: 2px solid var(--form); padding: 10px 14px; font-weight: 600; font-size: 16px; letter-spacing: .1em; text-transform: uppercase; }
  .field { border-right: 2px solid var(--form); border-bottom: 2px solid var(--form); padding: 10px 16px 12px; }
  .label { color: var(--form-ink); font-weight: 600; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; display: flex; gap: 8px; align-items: center; }
  .no { font: 400 14px/1 var(--font-type); border: 1.5px solid var(--form); padding: 2px 5px; letter-spacing: 0; }
  .value { font: 700 44px/1.05 var(--font-type); margin-top: 6px; }
  .note { font: 400 18px/1.2 var(--font-type); color: var(--ink-2); margin-top: 4px; }
  .url { position: absolute; left: 52px; bottom: 34px; font: 400 22px/1 var(--font-type); }
  .url b { color: var(--form-ink); }
</style></head><body><div class="frame">
  <div class="left">
    <div class="kicker">FY${D.meta.fy} edition · Medicare HRRP</div>
    <h1><span>${SITE_NAME_TOP}</span><span class="red">${SITE_NAME_RED}</span></h1>
    <p class="deck">Every hospital's readmission penalty, and how Medicare calculates it.</p>
  </div>
  <div class="form">
    <div class="title">FY${D.meta.fy} at a glance</div>
    ${rows.map(([label, value, note], i) => `<div class="field"><div class="label"><span class="no">${i + 1}</span>${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`).join('')}
  </div>
  <div class="url"><b>Look up any hospital ›</b> ${new URL(SITE_URL).host}</div>
</div></body></html>`;
}
