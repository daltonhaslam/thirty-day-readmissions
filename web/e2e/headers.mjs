// Serve docs/ with the exact headers from vercel.json and check the page still works under them.
// Usage: node e2e/headers.mjs   (exit 1 on any failure)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
const headers = Object.fromEntries(config.headers.flatMap((r) => r.headers.map((x) => [x.key, x.value])));
const html = readFileSync(new URL(`${config.outputDirectory}/index.html`, root));
const server = createServer((req, res) => {
  res.writeHead(req.url === '/' || req.url.startsWith('/#') ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(req.url === '/' ? html : '');
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const failures = [];
const browser = await chromium.launch({ channel: 'chrome' });
for (const hash of ['', '#hospital-010006', '#state-ut']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + hash);
  await page.waitForFunction(() => document.querySelector('#main > div'));
  await page.waitForTimeout(600);
  if (errors.length) failures.push(`${hash || '#'}: ${errors.join(' | ')}`);
  const fontOk = await page.evaluate(() => document.fonts.check('16px "Alfa Slab One"'));
  if (!fontOk) failures.push(`${hash || '#'}: display font blocked`);
  await page.close();
}
await browser.close();
server.close();
if (failures.length) { console.log(`FAIL\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('headers check: page works under vercel.json headers');
