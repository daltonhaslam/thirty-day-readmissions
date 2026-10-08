import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeHref } from '../src/js/views/util.js';

test('safeHref allows only https URLs', () => {
  assert.equal(safeHref('https://doi.org/10.1/x'), 'https://doi.org/10.1/x');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('http://example.com'), null);
  assert.equal(safeHref('not a url'), null);
  assert.equal(safeHref(undefined), null);
});
