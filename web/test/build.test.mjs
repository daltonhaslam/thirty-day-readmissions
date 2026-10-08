import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const docs = (p) => new URL(`../../docs/${p}`, import.meta.url);

test('the page declares a social preview image with an absolute URL', () => {
  const html = readFileSync(docs('index.html'), 'utf8').slice(0, 6000);
  const og = /<meta property="og:image" content="([^"]+)">/.exec(html)?.[1];
  assert.equal(og, 'https://thirty-day-readmissions.vercel.app/og.png');
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/thirty-day-readmissions\.vercel\.app\/">/);
});

test('the preview image is a 1200x630 PNG', () => {
  const png = readFileSync(docs('og.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});
