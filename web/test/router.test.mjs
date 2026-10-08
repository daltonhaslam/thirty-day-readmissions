import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, link } from '../src/js/router.js';

test('empty hash is home', () => {
  assert.deepEqual(parseHash(''), { view: 'home', key: null, section: null });
  assert.deepEqual(parseHash('#'), { view: 'home', key: null, section: null });
});

test('hospital route keeps the CCN as text', () => {
  assert.deepEqual(parseHash('#hospital-010001'), { view: 'hospital', key: '010001', section: null });
});

test('state route upper-cases the abbreviation', () => {
  assert.deepEqual(parseHash('#state-ut'), { view: 'state', key: 'UT', section: null });
});

test('division and region keep slugs; metro keeps CBSA code', () => {
  assert.deepEqual(parseHash('#division-south-atlantic'), { view: 'division', key: 'south-atlantic', section: null });
  assert.deepEqual(parseHash('#region-west'), { view: 'region', key: 'west', section: null });
  assert.deepEqual(parseHash('#metro-41620'), { view: 'metro', key: '41620', section: null });
});

test('home sections route to home with a section', () => {
  assert.deepEqual(parseHash('#map'), { view: 'home', key: null, section: 'map' });
  assert.deepEqual(parseHash('#methods'), { view: 'methods', key: null, section: null });
});

test('garbage is notfound and never throws', () => {
  for (const h of ['#hospital-', '#nope-thing', '#<script>', '#state-', '#%E0%A4%A']) {
    assert.equal(parseHash(h).view, 'notfound', h);
  }
});

test('link builds plain-anchor hashes', () => {
  assert.equal(link('hospital', '010001'), '#hospital-010001');
  assert.equal(link('state', 'UT'), '#state-ut');
  assert.equal(link('home'), '#');
});
