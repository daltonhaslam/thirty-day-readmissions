import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search, normalize } from '../src/js/ui/search.js';

const hospitals = [
  { id: '150100', name: "St. Mary's Medical Center", city: 'Evansville', st: 'IN', zip: '47750' },
  { id: '460001', name: 'Utah Valley Hospital', city: 'Provo', st: 'UT', zip: '84604' },
  { id: '460010', name: 'University of Utah Hospital', city: 'Salt Lake City', st: 'UT', zip: '84132' },
  { id: '050010', name: "O'Connor Hospital", city: 'San Jose', st: 'CA', zip: '95128' },
  { id: '330101', name: 'Saint Marys Hospital', city: 'Rochester', st: 'NY', zip: '14611' },
];
const index = buildIndex({
  hospitals,
  states: { UT: 'Utah', IN: 'Indiana', CA: 'California', NY: 'New York' },
  metros: { 41620: 'Salt Lake City-Murray, UT' },
});

test('normalize strips punctuation, apostrophes and accents', () => {
  assert.equal(normalize("St. Mary's  Médical"), 'st marys medical');
});

test("apostrophes and periods do not block a match", () => {
  const r = search("st. mary's", index);
  assert.equal(r[0].key, '150100');
});

test('saint and st are interchangeable', () => {
  const keys = search('saint marys', index).map((x) => x.key);
  assert.ok(keys.includes('150100') && keys.includes('330101'));
});

test("o'connor matches without the apostrophe", () => {
  assert.equal(search('oconnor', index)[0].key, '050010');
  assert.equal(search("o'connor", index)[0].key, '050010');
});

test('an exact CCN ranks first', () => {
  const r = search('460001', index);
  assert.equal(r[0].type, 'hospital');
  assert.equal(r[0].key, '460001');
});

test('place names find states and metros', () => {
  const r = search('salt lake', index);
  assert.ok(r.some((x) => x.type === 'metro' && x.key === '41620'));
  assert.ok(r.some((x) => x.type === 'hospital' && x.key === '460010'));
  assert.equal(search('utah', index)[0].type, 'state');
});

test('markup and empty queries return nothing without throwing', () => {
  assert.deepEqual(search('<script>', index), []);
  assert.deepEqual(search('   ', index), []);
});
