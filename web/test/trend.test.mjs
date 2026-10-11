import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutLabels } from '../src/js/charts/trend.js';

const mark = (ax, text) => ({ ax, start: ax + 3, end: ax + 3, text });
const overlaps = (placed, gap) => placed.some((a) => placed.some((b) => a !== b && a.row === b.row && a.x0 < b.x0 && b.x0 < a.x1 + gap));

test('labels that would collide go to the next row; ones that fit share a row', () => {
  // Desktop-like spacing: one year is about 32px, and "1% cap" is about 38px wide.
  const { placed, rows } = layoutLabels([mark(62, '1% cap'), mark(94, '2% cap'), mark(127, '3% cap'), mark(256, 'peer groups')], { lo: 46, hi: 540 });
  assert.equal(rows, 2);
  assert.deepEqual(placed.map((p) => [p.text, p.row]), [['1% cap', 0], ['2% cap', 1], ['3% cap', 0], ['peer groups', 0]]);
  assert.ok(!overlaps(placed, 4));
});

test('a label that would run past the right edge ends at its line instead', () => {
  const { placed } = layoutLabels([mark(305, 'MA added')], { lo: 46, hi: 326 });
  assert.ok(Math.abs(placed[0].x1 - 308) < 1e-9, JSON.stringify(placed[0]));
  assert.ok(placed[0].x1 <= 326);
});

test('narrow phone width: short cap labels fit on one row, and nothing overlaps or leaves the chart', () => {
  const items = [mark(56.8, '1%'), mark(74.5, '2%'), mark(92.3, '3% cap'), mark(163.2, 'peer groups'), mark(234.2, 'pneumonia out'), mark(305.2, 'MA added')];
  const { placed, rows } = layoutLabels(items, { lo: 46, hi: 326 });
  assert.equal(rows, 2);
  assert.deepEqual(placed.filter((p) => p.row === 0).map((p) => p.text).slice(0, 3), ['1%', '2%', '3% cap']);
  assert.ok(!overlaps(placed, 4));
  assert.ok(placed.every((p) => p.x0 >= 46 && p.x1 <= 326));
});
