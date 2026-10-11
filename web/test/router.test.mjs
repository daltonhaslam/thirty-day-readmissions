import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, link, scrollTarget } from '../src/js/router.js';
import { DOLLARS_HREF } from '../src/js/views/util.js';

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

test('a Methods section is the methods view with a scroll target; unknown ones are not found', () => {
  assert.equal(DOLLARS_HREF, '#methods-dollars');
  assert.deepEqual(parseHash(DOLLARS_HREF), { view: 'methods', key: null, section: 'methods-dollars' });
  assert.equal(link('methods'), '#methods');
});

test('scroll after a route change: a section, the saved spot on Back, the top of a new page, else left alone', () => {
  const methods = parseHash('#methods');
  // Methods nav (or Back) from #methods-dollars: same page, section cleared, so back to the top.
  assert.deepEqual(scrollTarget(methods, { changed: false, back: false, saved: 900, fromSection: 'methods-dollars' }), { y: 0 });
  assert.deepEqual(scrollTarget(methods, { changed: false, back: true, fromSection: 'methods-dollars' }), { y: 0 });
  assert.equal(scrollTarget(methods, { changed: false, back: false, fromSection: null }), null);
  assert.deepEqual(scrollTarget(parseHash('#methods-dollars'), { changed: false, back: false }), { section: 'methods-dollars' });
  // Home keeps its old handling: section links scroll to the section; the wordmark and Back/Forward to plain # are left
  // to the browser, even when leaving a home section.
  assert.deepEqual(scrollTarget(parseHash('#map'), { changed: false, back: true, fromSection: 'history' }), { section: 'map' });
  assert.equal(scrollTarget(parseHash('#'), { changed: false, back: false, fromSection: 'map' }), null); // wordmark from #map
  assert.equal(scrollTarget(parseHash('#'), { changed: false, back: true, fromSection: 'map' }), null); // Back from #map
  assert.deepEqual(scrollTarget(parseHash('#'), { changed: true, back: false, fromSection: 'methods-dollars' }), { y: 0 });
  assert.deepEqual(scrollTarget(parseHash('#state-ut'), { changed: true, back: true, saved: 2400 }), { y: 2400 });
  assert.deepEqual(scrollTarget(parseHash('#state-ut'), { changed: true, back: false, saved: 2400 }), { y: 0 });
  assert.deepEqual(scrollTarget(parseHash('#state-ut'), { changed: true, back: true, saved: undefined }), { y: 0 });
});

test('garbage is notfound and never throws', () => {
  for (const h of ['#hospital-', '#nope-thing', '#<script>', '#state-', '#%E0%A4%A', '#methods-nope']) {
    assert.equal(parseHash(h).view, 'notfound', h);
  }
});

test('link builds plain-anchor hashes', () => {
  assert.equal(link('hospital', '010001'), '#hospital-010001');
  assert.equal(link('state', 'UT'), '#state-ut');
  assert.equal(link('home'), '#');
});
