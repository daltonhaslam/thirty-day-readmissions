// Bundle JS (d3 subset included), inline CSS + data, and write two outputs:
//   ../docs/index.html   full document for GitHub Pages
//   dist/artifact.html   body-only fragment for a claude.ai artifact preview
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), 'utf8');

// The explicit night-edition toggle reuses the dark media block's tokens verbatim.
const tokens = read('src/styles/tokens.css');
const darkDecls = /:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/.exec(tokens)?.[1];
if (!darkDecls) throw new Error('tokens.css: dark media block not found');
const css = (await transform([tokens, `:root[data-theme="dark"] {${darkDecls}}`, ...['base', 'components', 'charts'].map((n) => read(`src/styles/${n}.css`))].join('\n'),
  { loader: 'css', minify: true })).code;
const js = (await build({ entryPoints: [here('src/js/main.js').pathname], bundle: true, format: 'iife', minify: true,
  write: false, target: 'es2020', legalComments: 'none' })).outputFiles[0].text;
// Escape every '<' so no data string can close the script element.
const data = read('src/data/hrrp.json').replace(/</g, '\\u003c');
const shell = read('src/shell.html');

const DESC = 'How Medicare\'s Hospital Readmissions Reduction Program works, and the FY2027 penalty for every hospital, state, and metro area.';
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Libre+Franklin:ital,wght@0,400;0,600;0,700;1,400&display=swap">';
const head = (title) => `<title>${title}</title><meta name="description" content="${DESC}">${FONTS}<style>${css}</style>`;
const body = `${shell}<script id="hrrp-data" type="application/json">${data}</script><script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;

const pagesTitle = 'Thirty Days · Medicare readmission penalties, FY2027';
const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  + `<meta property="og:title" content="${pagesTitle}"><meta property="og:description" content="${DESC}"><meta property="og:type" content="website">`
  + `${head(pagesTitle)}</head><body>${body}</body></html>`;

mkdirSync(here('../docs/'), { recursive: true });
mkdirSync(here('dist/'), { recursive: true });
writeFileSync(here('../docs/index.html'), doc);
writeFileSync(here('dist/artifact.html'), `${head('Thirty Days')}${body}`);
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`docs/index.html ${kb(doc)} (js ${kb(js)}, css ${kb(css)}, data ${kb(data)})`);
