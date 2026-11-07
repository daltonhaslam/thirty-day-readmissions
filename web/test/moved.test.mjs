// The "moved" page (docs/index.html + docs/moved.js): target() maps every old hash to its new address on paidandpenalized.org,
// as the hash table in the fold-in spec has it, and nothing else; the page itself loads nothing from anywhere else, and a
// build of the old site cannot overwrite it. CCNs and CBSAs here are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORIGIN, target } from '../../docs/moved.js';
import { parseHash } from '../src/js/router.js';
import { cardImageUrl } from '../og-card.mjs';

const docs = (p) => readFileSync(new URL(`../../docs/${p}`, import.meta.url), 'utf8');
const HOME = `${ORIGIN}/hrrp/`;
const at = (hash) => target(hash).href;

test('no hash, an empty one, #top and #/ open the program page with no note', () => {
  for (const h of ['', '#', '#top', '#/', '#/top', undefined, null]) assert.deepEqual(target(h), { href: HOME, note: '' }, String(h));
});

test('the six home sections open the same section on the new program page', () => {
  for (const s of ['how', 'picture', 'map', 'history', 'explore', 'research']) {
    for (const h of [`#${s}`, `#/${s}`]) {
      const t = target(h);
      assert.equal(t.href, `${HOME}#${s}`, h);
      assert.match(t.note, /^Your link was to .+: the button opens it there\.$/, h);
    }
  }
  assert.equal(target('#map').note, 'Your link was to the map: the button opens it there.');
});

test('a hospital: six digits, its page, the CCN in the note', () => {
  assert.deepEqual(target('#hospital-990001'), { href: `${HOME}hospital/990001/`, note: 'Your link was to a hospital, CCN 990001: the button opens its page there.' });
  assert.equal(at('#/hospital-990001'), `${HOME}hospital/990001/`);
  assert.equal(at('#Hospital-990001'), `${HOME}hospital/990001/`, 'the old router read the kind in any case');
  assert.equal(at('#hospital-99000'), HOME, 'five digits');
  assert.equal(at('#hospital-9900011'), HOME, 'seven digits');
  assert.equal(at('#hospital-99000a'), HOME, 'a letter: the old router took digits only');
  assert.equal(at('#hospital-'), HOME);
});

test('a state: two letters in any case, lower-cased', () => {
  assert.deepEqual(target('#state-ut'), { href: `${HOME}state/ut/`, note: 'Your link was to a state: the button opens its page there.' });
  assert.equal(at('#state-UT'), `${HOME}state/ut/`);
  assert.equal(at('#STATE-Ut'), `${HOME}state/ut/`);
  assert.equal(at('#/state-ut'), `${HOME}state/ut/`);
  assert.equal(at('#state-u'), HOME);
  assert.equal(at('#state-utah'), HOME);
  assert.equal(at('#state-1t'), HOME);
});

test('a metro: five digits', () => {
  assert.deepEqual(target('#metro-99990'), { href: `${HOME}metro/99990/`, note: 'Your link was to a metro area: the button opens its page there.' });
  assert.equal(at('#metro-9999'), HOME);
  assert.equal(at('#metro-999901'), HOME);
  assert.equal(at('#metro-9999x'), HOME);
});

test('a division: a lower-case slug', () => {
  assert.deepEqual(target('#division-south-atlantic'), { href: `${HOME}division/south-atlantic/`, note: 'Your link was to a census division: the button opens its page there.' });
  assert.equal(at('#division-pacific'), `${HOME}division/pacific/`);
  assert.equal(at('#division-South-Atlantic'), HOME, 'the old router took the slug in lower case only');
  assert.equal(at('#division-south--atlantic'), HOME);
  assert.equal(at('#division--pacific'), HOME);
  assert.equal(at('#division-pacific-'), HOME);
  assert.equal(at('#division-new_england'), HOME);
});

test('a region: one of the four, lower case', () => {
  for (const r of ['northeast', 'midwest', 'south', 'west']) {
    assert.deepEqual(target(`#region-${r}`), { href: `${HOME}region/${r}/`, note: 'Your link was to a census region: the button opens its page there.' });
  }
  assert.equal(at('#region-north'), HOME);
  assert.equal(at('#region-West'), HOME);
});

test('Methods, and its section on the dollar estimates', () => {
  assert.deepEqual(target('#methods'), { href: `${HOME}methods/`, note: 'Your link was to the Methods page: the button opens it there.' });
  assert.deepEqual(target('#methods-dollars'), { href: `${HOME}methods/#methods-dollars`, note: 'Your link was to the dollar assumptions: the button opens them there.' });
  assert.equal(at('#/methods'), `${HOME}methods/`);
  assert.equal(at('#Methods'), HOME, 'the old router matched methods in lower case only');
  assert.equal(at('#methods-other'), HOME);
});

test('percent-encoded hashes decode first, as the old router did', () => {
  assert.equal(at('#hospital%2D990001'), `${HOME}hospital/990001/`);
  assert.equal(at('#%73tate-ut'), `${HOME}state/ut/`);
  assert.equal(at('#%6D%65%74%68%6F%64%73'), `${HOME}methods/`);
  assert.equal(at('#%2Fhospital-990001'), HOME, 'an encoded slash is not the #/ prefix');
  assert.equal(at('#%E0%A4%A'), HOME, 'a broken escape');
  assert.equal(at('#%'), HOME);
});

test('anything else opens the program page, with no note; the address is always on paidandpenalized.org', () => {
  const garbage = [
    '#nope', '#nope-route', '#hospital', '#-990001', '#constructor-x', '#__proto__-x', '#toString-1', '#hasOwnProperty',
    '#state-ut/../../x', '#hospital-990001/', '#hospital-990001?x=1', '#hospital-990001#map', '# hospital-990001',
    '#//evil.example', '#/\\evil.example', '#https://evil.example/', '#javascript:alert(1)', '#%0Ahospital-990001',
    '#hospital-990001%0A', '#state-u%00t', '#<img src=x onerror=alert(1)>', `#${'a'.repeat(10000)}`, '#\u0000', '#é-990001',
  ];
  for (const h of garbage) assert.deepEqual(target(h), { href: HOME, note: '' }, h);
  for (const h of [...garbage, '#hospital-990001', '#state-ut', '#metro-99990', '#division-pacific', '#region-west', '#methods-dollars', '#map']) {
    const u = new URL(target(h).href);
    assert.equal(u.origin, ORIGIN, h);
    assert.ok(u.pathname.startsWith('/hrrp/'), h);
  }
});

test('the page: its button works without the script, it loads only its own files, and it is findable', () => {
  const html = docs('index.html');
  assert.match(html, /<a class="go" id="go" href="https:\/\/paidandpenalized\.org\/hrrp\/">/);
  assert.match(html, /<title>Thirty Day Readmissions has moved<\/title>/);
  assert.doesNotMatch(html, /name="robots"/, 'no noindex: the page should be findable as moved');
  // Only same-origin files: the script, Vercel's analytics script, and nothing from a font service or elsewhere.
  const srcs = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs.filter((s) => !s.startsWith('data:')), ['moved.js', '/_vercel/insights/script.js']);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|@import|url\(http/);
  // The card's version is the served file's hash, so a re-rendered og.png (npm run og) shows up here.
  const og = readFileSync(new URL('../../docs/og.png', import.meta.url));
  assert.equal(/<meta property="og:image" content="([^"]+)">/.exec(html)?.[1], cardImageUrl(og));
  assert.doesNotMatch(html, /hrrp-data/, 'the old site\'s build did not overwrite the page');
});

test('the script sets the note as text and points analytics at the path alone', () => {
  const js = docs('moved.js');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|location\s*=|location\.(assign|replace|href\s*=)/);
  assert.match(js, /note\.textContent = /);
  assert.match(js, /url: e\.url\.split\(\/\[\?#\]\/\)\[0\]/);
});

// Every input the old router read as a page, target() sends to that page's new address; everything it did not, to /hrrp/.
// Run against the old router itself (web/src/js/router.js parseHash), so the two cannot drift apart.
test('target() agrees with the old router on every input', () => {
  const kinds = ['hospital', 'Hospital', 'state', 'STATE', 'metro', 'division', 'region', 'methods', 'nope', 'top'];
  const keys = ['990001', '99000', '9900011', '99990', 'ut', 'UT', 'u', 'south-atlantic', 'South-Atlantic', 'south--atlantic', 'west',
    'West', 'north', 'dollars', '', 'x', '990001/', '1t'];
  const inputs = ['', '#', '#/', '#top', '#/top', '#methods', '#Methods', '#methods-dollars', '#how', '#map', '#explore', '#research',
    '#history', '#picture', '#Map', '#%6Dap', '#%', '#%E0%A4%A', '#__proto__', '#constructor-x', '#toString-1',
    ...kinds.flatMap((k) => keys.flatMap((v) => [`#${k}-${v}`, `#/${k}-${v}`, `#${encodeURIComponent(`${k}-${v}`)}`]))];
  // The old router's key table was a plain object, so '#constructor-x' read as a 'constructor' view the site never had (it
  // showed nothing): for the moved page that is not a page, and it goes to /hrrp/.
  const VIEWS = new Set(['home', 'methods', 'hospital', 'state', 'metro', 'division', 'region']);
  const read = (h) => { const r = parseHash(h); return VIEWS.has(r.view) ? r : { view: 'notfound' }; };
  const want = (r) => {
    if (r.view === 'home') return r.section ? `${ORIGIN}/hrrp/#${r.section}` : `${ORIGIN}/hrrp/`;
    if (r.view === 'methods') return `${ORIGIN}/hrrp/methods/${r.section ? `#${r.section}` : ''}`;
    if (r.view === 'notfound') return `${ORIGIN}/hrrp/`;
    return `${ORIGIN}/hrrp/${r.view}/${r.key.toLowerCase()}/`;
  };
  for (const h of inputs) {
    const r = read(h);
    assert.equal(target(h).href, want(r), `${h}: old router read ${JSON.stringify(r)}`);
    assert.equal(target(h).note === '', r.view === 'notfound' || (r.view === 'home' && !r.section), `${h}: note`);
  }
});
