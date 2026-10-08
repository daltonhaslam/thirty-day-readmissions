// Element screenshots: node e2e/sections.mjs <hash> <prefix> <width> <theme> <selector...>
import { chromium } from 'playwright';
const [hash, prefix, width, theme, ...sels] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: Number(width), height: 1000 }, colorScheme: theme });
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`file://${new URL('../../docs/index.html', import.meta.url).pathname}${hash}`);
await p.waitForTimeout(800);
await p.addStyleTag({ content: '.topbar{position:static !important}' });
for (const sel of sels) {
  const el = await p.$(sel);
  if (!el) { console.log('missing', sel); continue; }
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  await el.screenshot({ path: `e2e/screenshots/${prefix}-${sel.replace(/[^a-z0-9]/gi, '')}.png` });
}
console.log(prefix, 'errors:', errors.length ? errors : 'none');
await b.close();
