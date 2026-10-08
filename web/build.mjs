// Bundle JS (d3 subset included), inline CSS + data, and write two outputs:
//   ../docs/index.html   full document served by Vercel
//   dist/artifact.html   body-only fragment for a claude.ai artifact preview
// Env: FEEDBACK_URL overrides the feedback endpoint (tests); BUILD_OUT_DIR writes index.html elsewhere.
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SITE_NAME, SITE_URL, FEEDBACK_URL, FONTS_HREF } from './src/js/site.js';

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), 'utf8');

// The explicit night-edition toggle reuses the dark media block's tokens verbatim.
const tokens = read('src/styles/tokens.css');
const darkDecls = /:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/.exec(tokens)?.[1];
if (!darkDecls) throw new Error('tokens.css: dark media block not found');
const css = (await transform([tokens, `:root[data-theme="dark"] {${darkDecls}}`, ...['base', 'components', 'charts'].map((n) => read(`src/styles/${n}.css`))].join('\n'),
  { loader: 'css', minify: true })).code;
const js = (await build({ entryPoints: [fileURLToPath(here('src/js/main.js'))], bundle: true, format: 'iife', minify: true,
  write: false, target: 'es2020', legalComments: 'none', define: { __FEEDBACK_URL__: JSON.stringify(process.env.FEEDBACK_URL ?? FEEDBACK_URL) } })).outputFiles[0].text;
const rawData = read('src/data/hrrp.json');
const { fy } = JSON.parse(rawData).meta;
// Escape every '<' so no data string can close the script element.
const data = rawData.replace(/</g, '\\u003c');
const shell = read('src/shell.html');

const DESC = `How Medicare's Hospital Readmissions Reduction Program works, and the FY${fy} penalty for every hospital, state, and metro area.`;
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + `<link rel="stylesheet" href="${FONTS_HREF}">`;
const ICON = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#c4303a"/><text x="16" y="23" font-family="Georgia,serif" font-weight="700" font-size="18" text-anchor="middle" fill="#fbfbf8">30</text></svg>')}">`;
const head = (title) => `<title>${title}</title><meta name="description" content="${DESC}">${ICON}${FONTS}<style>${css}</style>`;
const body = `${shell}<script id="hrrp-data" type="application/json">${data}</script><script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;

const pagesTitle = `${SITE_NAME} · Medicare readmission penalties, FY${fy}`;
const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  + `<meta property="og:title" content="${pagesTitle}"><meta property="og:description" content="${DESC}"><meta property="og:type" content="website">`
  + `<meta property="og:url" content="${SITE_URL}"><meta property="og:image" content="${SITE_URL}og.png">`
  + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
  + `<meta property="og:image:alt" content="${SITE_NAME}: FY${fy} Medicare readmission penalties for every hospital">`
  + '<meta name="twitter:card" content="summary_large_image">'
  + `${head(pagesTitle)}</head><body>${body}</body></html>`;

const outDir = process.env.BUILD_OUT_DIR ?? fileURLToPath(here('../docs/'));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), doc);
if (!process.env.BUILD_OUT_DIR) {
  mkdirSync(here('dist/'), { recursive: true });
  writeFileSync(here('dist/artifact.html'), `${head(SITE_NAME)}${body}`);
}
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`docs/index.html ${kb(doc)} (js ${kb(js)}, css ${kb(css)}, data ${kb(data)})`);
