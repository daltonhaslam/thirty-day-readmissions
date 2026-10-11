import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData, meanCutByYear, capMarks } from '../src/js/data.js';
import { shareTake, SHARE_CHART } from '../src/js/views/home.js';

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

test('the national line on area and hospital charts averages the same hospitals, each year over those in its file', () => {
  const history = { years: [2025, 2026], paf: { a: [0.99, 0.98], b: [null, 1] } };
  const list = [{ id: 'a', paf: 0.97 }, { id: 'b', paf: 1 }, { id: 'c', paf: 0.995 }]; // c is new this year
  const v = meanCutByYear(list, { years: [2025, 2026, 2027], history, meta: { fy: 2027 } });
  assert.deepEqual(v.map((x) => Math.round(x * 1000) / 1000), [1, 1, 1.167]);
  assert.deepEqual(meanCutByYear([{ id: 'z', paf: 1 }], { years: [2026, 2027], history: { paf: {} }, meta: { fy: 2027 } }), [null, 0]);
  assert.equal(D.programTrend.length, D.years.length);
  assert.ok(Math.abs(D.programTrend.at(-1) - D.nation.meanRed) < 1e-9, 'this year matches the national average');
});

test('history share-penalized caption: what each bar counts, and why this year differs from the headline', () => {
  const t = shareTake(D);
  assert.match(t, /^Each bar is the share of hospitals in that year's CMS file with a cut\. From FY2019 that is every hospital in the file; for FY2013–FY2018 it leaves out three groups those files listed and later files drop: Maryland, Puerto Rico, and hospitals with no data for any condition\./);
  assert.match(t, / FY2027 shows 80% here, not the 83% headline, because the headline counts only hospitals measured on at least one condition\. /);
  assert.match(t, /KFF Health News reported somewhat lower counts for FY2015, FY2016 and FY2018 \(2,610, 2,592 and 2,573\)/);
  // When the two round alike there is nothing to explain.
  const same = { ...D, nation: { ...D.nation, pctPen: D.nationalByFy[D.meta.fy].pctPen } };
  assert.doesNotMatch(shareTake(same), /headline/);
});

test('history share-penalized chart labels hold for every year, and the accessible label names the early exclusions', () => {
  assert.deepEqual([SHARE_CHART.title, SHARE_CHART.series], ['Share of hospitals penalized', 'Penalized']);
  assert.equal(SHARE_CHART.label, 'Share of hospitals penalized by fiscal year; FY2013–FY2018 exclude Maryland, Puerto Rico, and hospitals with no data');
  // FY2013–FY2018 bars do not count every hospital in the file, so no label may say they do.
  for (const s of Object.values(SHARE_CHART)) assert.doesNotMatch(s, /\ball\b|in the file|each year's CMS file/);
});

test('cap marks come from each year\'s cap; narrow labels keep "cap" only on the last', () => {
  const marks = capMarks([{ fy: 2013, cap: 1 }, { fy: 2014, cap: 2 }, { fy: 2015, cap: 3 }, { fy: 2016, cap: 3 }]);
  assert.deepEqual(marks, [
    { fy: 2013, label: '1% cap', short: '1%' }, { fy: 2014, label: '2% cap', short: '2%' }, { fy: 2015, label: '3% cap', short: '3% cap' }]);
  assert.deepEqual(D.capMarks.map((m) => m.fy), [2013, 2014, 2015]);
});
