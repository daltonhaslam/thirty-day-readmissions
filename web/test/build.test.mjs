import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SITE_URL, FEEDBACK_URL } from '../src/js/site.js';
import { loadData } from '../src/js/data.js';
import { cardHtml, cardImageUrl } from '../og-card.mjs';

const docs = (p) => new URL(`../../docs/${p}`, import.meta.url);
const html = readFileSync(docs('index.html'), 'utf8');
const png = readFileSync(docs('og.png'));

test('the page declares a versioned social preview image with absolute URLs', () => {
  const expected = new URL(`og.png?v=${createHash('sha256').update(png).digest('hex').slice(0, 10)}`, SITE_URL).href;
  assert.equal(cardImageUrl(png), expected);
  assert.equal(/<meta property="og:image" content="([^"]+)">/.exec(html)?.[1], expected);
  assert.equal(/<meta property="og:url" content="([^"]+)">/.exec(html)?.[1], new URL(SITE_URL).href);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
});

test('the preview image is a 1200x630 PNG', () => {
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

test('the preview card is current: re-run `npm run og` after the data, name, styles, or card text change', () => {
  const D = loadData(JSON.parse(readFileSync(new URL('../src/data/hrrp.json', import.meta.url), 'utf8')));
  const stamp = JSON.parse(readFileSync(new URL('../og.stamp.json', import.meta.url), 'utf8'));
  assert.equal(stamp.htmlSha256, createHash('sha256').update(cardHtml(D)).digest('hex'));
});

test('the published page uses the production feedback endpoint (no leftover test override)', () => {
  assert.ok(FEEDBACK_URL && html.includes(FEEDBACK_URL));
});
