# Feedback via the shared Google Form: implementation plan (2026-10-20)

Source: `Paid-And-Penalized-Planning/docs/handoffs/2026-10-20-tdr-feedback-form-prompt.md`; decisions ARCH-28,
EDIT-04, OPS-04, LEGAL-12, OPS-12 (f) in that repo. Branch: `feedback-google-form` (local; Dalton approves push/merge).

Rules carried in: one Google Form in the project Gmail for every P&P site; no turnaround promise anywhere; no
retention or deletion promise; the form warns against patient information; feedback never goes to GitHub.

## Batch 1: the form (Chrome, the project Gmail only)

- [x] New form "Paid & Penalized: feedback": description, six questions, settings and confirmation per the handoff
- [x] Responses to a new Sheet "P&P feedback", email notifications on
- [x] Pre-filled link → `entry.<id>` for Site and Page; recorded in the planning repo's `docs/feedback-form.md`

## Batch 2: TDR code

- [x] `site.js`: `FEEDBACK_FORM_URL` (responder `viewform` URL) and `FEEDBACK_ENTRIES` (`site`, `page` entry IDs); drop `FEEDBACK_URL`
- [x] `ui/feedback.js`: `feedbackHref(pageUrl)` (pure; `encodeURIComponent` on both values, nothing else sent) and
  `feedbackLink(label, cls)`: an `<a target="_blank" rel="noopener noreferrer">` with visually hidden "(opens in a new tab)"
  text, whose `href` is rebuilt from the current address (query string dropped) on pointerdown, focus and click
- [x] Footer: the in-page form becomes a short section with the "Send feedback" link and the no-patient-information line
- [x] Hospital page: the "Report a problem" button becomes a link to the form (Page prefilled with the hospital URL)
- [x] Methods: the About contact route and the "Feedback and privacy" paragraph rewritten (site collects nothing and
  sets no cookies; the form is Google's, so Google sees what's sent and the sender's IP; no timing or retention promise)
- [x] Remove `feedback.js`, `feedbackForm.js`, `feedback/apps-script.gs`, `appsscript.test.mjs`, the old
  `feedback.test.mjs`, the `__FEEDBACK_URL__` define and the second (preview) bundle in `build.mjs`, dead form CSS
- [x] `feedback/README.md` → one line pointing to the form; repo README contact/network lines updated
- [x] `vercel.json` CSP: drop `https://script.google.com` and `https://script.googleusercontent.com` from `connect-src`
- [x] Tests: unit test for `feedbackHref`; `build.test` checks the built page links the production form;
  `e2e/feedback.mjs` clicks the link on a hospital page and on Methods and asserts the opened URL and prefill
  (Google requests intercepted, no network); headers e2e still passes
- [x] Rebuild `docs/index.html`; check the OG stale-card test (rerun `npm run og` only if it fails)

## Checkpoint (milestone = final gate here; one logical group)

- [x] `/simplify` on the branch diff, then `python3 -I pipeline/run_tests.py`, `npm test`, `npm run e2e`,
  `npm run e2e:headers`, `npm run e2e:feedback`
- [x] `/code-review` and `/security-review` (external link path, CSP change); fix Critical/Important, re-run until clean
- [ ] `/verify`: serve the built page with vercel.json headers, click the link from a hospital page and Methods,
  confirm Site and Page arrive filled in the real form and no CSP console errors
- [ ] Test submission "TEST, delete" in the form; confirm the Sheet row; delete the row

## Hand-off (Dalton)

- Push the branch, merge to `main` (Vercel deploys)
- Archive the old Apps Script deployment in the personal account; export or keep its Sheet
