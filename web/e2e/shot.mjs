// Quick screenshots: node e2e/shot.mjs <hash> <name> [width] [theme] [fullPage]
import { chromium } from 'playwright';
const [hash = '', name = 'home', width = '1280', theme = 'light', full = '1'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: Number(width), height: 900 }, colorScheme: theme });
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`file://${new URL('../../docs/index.html', import.meta.url).pathname}${hash}`);
await p.waitForTimeout(900);
await p.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: full === '1' });
const sw = await p.evaluate(() => document.documentElement.scrollWidth);
console.log(name, 'errors:', errors.length ? errors : 'none', '| scrollWidth', sw, 'vs', width);
await b.close();
