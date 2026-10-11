import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeHref, placesSource } from '../src/js/views/util.js';

test('map source line names the Census Geocoder once address geocoding is in the data', () => {
  assert.match(placesSource({ geocode: { address: 2700, zip: 150, county: 62 } }), /street addresses \(U\.S\. Census Bureau Geocoder\), else ZIP or county centers/);
  assert.equal(placesSource({ geocode: { zip: 2817, county: 95 } }), 'locations from Care Compare addresses and Census ZIP centroids');
});

test('safeHref allows only https URLs', () => {
  assert.equal(safeHref('https://doi.org/10.1/x'), 'https://doi.org/10.1/x');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('http://example.com'), null);
  assert.equal(safeHref('not a url'), null);
  assert.equal(safeHref(undefined), null);
});
