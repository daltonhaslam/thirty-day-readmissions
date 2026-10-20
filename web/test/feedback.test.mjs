import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackHref } from '../src/js/ui/feedback.js';
import { SITE_NAME, FEEDBACK_FORM_URL, FEEDBACK_ENTRIES } from '../src/js/site.js';

test('the feedback link prefills only the site name and the page address, both encoded', () => {
  const page = 'https://thirty-day-readmissions.vercel.app/#hospital-010006?x=1&y=a b';
  const url = new URL(feedbackHref(page));
  assert.equal(`${url.origin}${url.pathname}`, FEEDBACK_FORM_URL);
  assert.deepEqual([...url.searchParams.keys()], [FEEDBACK_ENTRIES.site, FEEDBACK_ENTRIES.page]);
  assert.equal(url.searchParams.get(FEEDBACK_ENTRIES.site), SITE_NAME);
  assert.equal(url.searchParams.get(FEEDBACK_ENTRIES.page), page);
  assert.equal(url.hash, '');
});

test('the form constants point at a Google Forms responder page and its entry fields', () => {
  assert.match(FEEDBACK_FORM_URL, /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform$/);
  for (const id of Object.values(FEEDBACK_ENTRIES)) assert.match(id, /^entry\.\d+$/);
});
