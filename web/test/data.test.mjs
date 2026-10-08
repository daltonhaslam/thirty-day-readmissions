import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/js/data.js';

const D = loadData(JSON.parse(readFileSync(new URL('../src/data/hrrp.json', import.meta.url))));

test('loadData indexes hospitals and caches summaries', () => {
  assert.equal(D.byId.get('010006').id, '010006');
  assert.equal(D.nation.n, D.hospitals.length);
  assert.equal(D.stateSummary.get('UT').n, D.byState.get('UT').length);
  assert.ok(D.hospitals.every((h) => Array.isArray(h.flags) && h.cx && typeof h.place === 'string'));
});

test('edition phrases come from the data', () => {
  assert.equal(D.edition.label, `FY${D.meta.fy}`);
  assert.equal(D.edition.nYears, D.meta.fy - D.history.years[0] + 1);
  assert.equal(D.edition.payLong, `October 1, ${D.meta.fy - 1} through September 30, ${D.meta.fy}`);
  assert.match(D.edition.perfLong, /^July 1, \d{4} through June 30, \d{4}$/);
  assert.equal(D.edition.yearsWord, 'Fifteen');
});
