// Shared helpers for the e2e scripts.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
export const vercelConfig = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
// The old site's built page (web/build.mjs writes it to web/dist/; docs/, which Vercel serves, now holds the "moved" page).
export const builtPage = () => readFileSync(new URL('web/dist/index.html', root));
export const movedPage = () => readFileSync(new URL(`${vercelConfig.outputDirectory}/index.html`, root));

// Vercel serves its analytics script at this path in production; tests stand in an empty script so the tag resolves.
export const INSIGHTS_PATH = '/_vercel/insights/script.js';
export const stubInsights = (page) => page.route(`**${INSIGHTS_PATH}`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

// Serve one HTML document at / with the exact response headers vercel.json configures.
export function serveWithHeaders(html) {
  const headers = Object.fromEntries(vercelConfig.headers.flatMap((r) => r.headers.map((x) => [x.key, x.value])));
  const server = createServer((req, res) => {
    if (req.url === INSIGHTS_PATH) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(''); return; }
    const ok = req.url.split('?')[0] === '/';
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
    res.end(ok ? html : '');
  }).listen(0);
  return { base: `http://localhost:${server.address().port}/`, close: () => server.close() };
}

// Collect failures; report() prints them and sets the exit code.
export function makeCheck(name) {
  const failures = [];
  return {
    check: (ok, msg) => { if (!ok) failures.push(msg); },
    report() {
      if (failures.length) {
        console.log(`FAIL (${failures.length})\n- ${failures.join('\n- ')}`);
        process.exitCode = 1;
      } else console.log(`${name}: all checks passed`);
    },
  };
}
