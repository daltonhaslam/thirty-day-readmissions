// Shared helpers for the e2e scripts.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
export const vercelConfig = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
export const builtPage = () => readFileSync(new URL(`${vercelConfig.outputDirectory}/index.html`, root));

// Serve one HTML document at / with the exact response headers vercel.json configures.
export function serveWithHeaders(html) {
  const headers = Object.fromEntries(vercelConfig.headers.flatMap((r) => r.headers.map((x) => [x.key, x.value])));
  const server = createServer((req, res) => {
    const ok = req.url === '/';
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
