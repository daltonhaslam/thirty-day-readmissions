import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE_URL, SITE_NAME_LINES } from '../src/js/site.js';
import { loadData } from '../src/js/data.js';
import { cardStamp } from '../og-stamp.mjs';

const docs = (p) => new URL(`../../docs/${p}`, import.meta.url);

test('the page declares a social preview image with an absolute URL', () => {
  const html = readFileSync(docs('index.html'), 'utf8');
  assert.equal(/<meta property="og:image" content="([^"]+)">/.exec(html)?.[1], `${SITE_URL}og.png`);
  assert.equal(/<meta property="og:url" content="([^"]+)">/.exec(html)?.[1], SITE_URL);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
});

test('the preview image is a 1200x630 PNG', () => {
  const png = readFileSync(docs('og.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

test('the preview card is current: re-run `npm run og` after the data or the name changes', () => {
  const D = loadData(JSON.parse(readFileSync(new URL('../src/data/hrrp.json', import.meta.url), 'utf8')));
  const stamp = JSON.parse(readFileSync(docs('og.json'), 'utf8'));
  assert.deepEqual(stamp, cardStamp(D, SITE_NAME_LINES));
});
