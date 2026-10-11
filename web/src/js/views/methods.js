import { h } from '../dom.js';
import { part } from '../ui/figure.js';
import { fmtInt, fmtMoney, fmtPct, fmtDate, noEstimate } from '../model.js';
import { METHODS_SECTIONS } from '../router.js';
import { safeHref } from './util.js';
import { omnibox } from '../ui/omnibox.js';
import { FEEDBACK_ENABLED } from '../ui/feedbackForm.js';
import { SITE_NAME, LINKEDIN_URL } from '../site.js';

const GLOSSARY = [
  ['Readmission', 'An unplanned return to any acute-care hospital within 30 days of discharge, for any reason. Planned returns, such as a scheduled chemotherapy stay, do not count.'],
  ['Excess readmission ratio (ERR)', 'Predicted readmissions for this hospital divided by expected readmissions for an average hospital with the same patients. Above 1.0 means more than expected.'],
  ['Peer group', 'One of five equal-sized groups of hospitals, sorted by the share of their Medicare stays from patients who also have full Medicaid.'],
  ['Dual-eligible', 'A person enrolled in both Medicare and full Medicaid benefits, a common marker of low income.'],
  ['Neutrality modifier', 'A single factor, the same for every hospital in a year, that keeps total penalties under peer grouping equal to what the pre-2019 method would have produced.'],
  ['Payment weight (DRG payment ratio)', 'The share of a hospital\'s traditional Medicare base payments that come from stays for a given condition. Conditions that bring in more payments weigh more.'],
  ['Payment adjustment factor (PAF)', 'What CMS multiplies each base payment by: 1 minus the reduction. A factor of 0.9886 means a 1.14% cut.'],
  ['Base operating DRG payment', 'The standard Medicare inpatient payment for a stay, plus any new-technology add-on, before teaching, low-income-patient, low-volume, and outlier payments. The cut applies only to this amount.'],
  ['Traditional Medicare (FFS)', 'Fee-for-service Medicare, paid directly by CMS. Medicare Advantage plans are private plans paid separately; the cut does not apply to them.'],
  ['IPPS', 'The Inpatient Prospective Payment System, which sets Medicare payments to general acute-care hospitals each fiscal year.'],
  ['CCN', 'CMS Certification Number, the six-digit ID CMS assigns each hospital.'],
  ['Teaching level', 'Major teaching means a resident-to-bed ratio of 0.25 or more; minor teaching is any lower ratio above zero. The ratio comes from the IPPS impact file, which draws on Medicare cost reports.'],
  ['Beds', 'The hospital\'s bed count from its Medicare cost report, as listed in the IPPS impact file. It can differ from licensed or certified beds.'],
  ['Metro area (CBSA)', 'A Core-Based Statistical Area defined by the Office of Management and Budget: a city and the counties tied to it by commuting.'],
];

const count = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;

// "Oct–Dec 2026": the part of the payment year before an end date.
function monthsBefore(fy, endIso) {
  const end = new Date(`${endIso}T12:00:00`);
  const mon = end.toLocaleDateString('en-US', { month: 'short' });
  return end.getFullYear() === fy - 1 ? `Oct–${mon} ${fy - 1}` : `Oct ${fy - 1}–${mon} ${end.getFullYear()}`;
}

// How the estimates compare with hospitals' cost reports; empty until the data carries that check.
export function accuracyLine(dc) {
  if (dc?.within15 == null) return '';
  return `Checked against hospitals' own Medicare cost reports, ${fmtPct(dc.within15, 0)} of estimates land within 15% after allowing for two years of payment-rate growth`
    + `${dc.within15Small != null ? ` (${fmtPct(dc.within15Small, 0)} for hospitals under 100 beds)` : ''}.`;
}

// [assumption, effect on the estimate] rows, worded from what the data says about MDH, inactive, and missing hospitals.
export function assumptionRows(D) {
  const m = D.meta;
  const E = D.edition;
  const dc = m.dollarCheck;
  const nMdh = D.hospitals.filter((x) => x.types?.includes('MDH')).length;
  const nInactive = D.hospitals.filter((x) => x.inactive).length;
  const nNoEst = noEstimate(D.hospitals);
  const costFy = /FY ?(\d{4})/.exec(dc?.source ?? '')?.[1];
  return [
    [`Penalty = the ${E.label} cut (1 − adjustment factor) × the hospital's base DRG payments`, 'Mirrors how CMS applies the cut; the cut factor itself is CMS\'s exact value'],
    [`Payments priced at ${E.label} rates`, dc?.rateDrift
      ? `Runs about ${fmtPct((dc.rateDrift - 1) * 100, 1)} above ${costFy ? `FY${costFy} ` : ''}cost reports, by design`
      : 'Runs above earlier years\' cost reports, by design'],
    [`Medicare volume taken from FY${E.fy - 2}`, `Off in proportion if a hospital's ${E.label} volume differs`],
    ['Traditional Medicare only', 'Medicare Advantage enters the ratios but is not cut'],
    ['Sole community hospitals priced at the federal rate', 'What the law requires'],
    m.mdh?.endDate
      ? [`Medicare-dependent add-on included for ${monthsBefore(E.fy, m.mdh.endDate)} only, assuming MDH status ends ${fmtDate(m.mdh.endDate, 'long')}, as current law says (${count(nMdh, 'hospital', 'hospitals')})`,
        'If Congress extends MDH status, estimates for these hospitals run low, up to about 45% for some']
      : [`Medicare-dependent hospitals' own add-on left out (${count(nMdh, 'hospital', 'hospitals')})`, 'The cut covers it, so estimates for these hospitals run low'],
    ['New-technology add-on payments left out', 'The cut covers them; about 0.1% of payments nationally'],
    ['Pennsylvania Rural Health Model hospitals shown as a DRG-equivalent', 'They were paid on global budgets; low-medium confidence'],
    ['New hospitals use partial-year volume', 'Likely understated'],
    nInactive ? [`${count(nInactive, 'hospital', 'hospitals')} CMS lists as no longer active ${nInactive === 1 ? 'is' : 'are'} still shown`,
      'CMS will not pay them under this ID, so their cut is unlikely to be collected'] : null,
    nNoEst ? [`${count(nNoEst, 'hospital', 'hospitals')} missing from the impact file ${nNoEst === 1 ? 'gets' : 'get'} no estimate`,
      'Totals note the count instead of adding $0'] : null,
  ].filter(Boolean);
}

// The section every "estimate" tag links to: what the dollar figures assume, and how well they hold up.
function dollarAssumptions(D) {
  const id = METHODS_SECTIONS.dollars;
  const accuracy = accuracyLine(D.meta.dollarCheck);
  return h('section', { id, class: 'methods__sec', 'aria-labelledby': `${id}-h` },
    h('h2', { id: `${id}-h` }, 'Assumptions behind the dollar estimates'),
    h('p', {}, `Dollar figures are estimates made for this site, not amounts CMS publishes. They apply each hospital's ${D.edition.label} cut to its estimated base Medicare payments, using the assumptions below.`),
    accuracy ? h('p', {}, accuracy) : null,
    h('div', { class: 'printout__scroll' }, h('table', { class: 'assume' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Assumption'), h('th', { scope: 'col' }, 'Effect on the estimate'))),
      h('tbody', {}, assumptionRows(D).map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))),
    h('p', {}, 'Teaching, low-income-patient, low-volume, and outlier add-ons are excluded because the cut does not apply to them.'));
}

export function renderMethods(D) {
  const m = D.meta;
  const E = D.edition;
  const rep = m.replication;
  const src = m.sources.map((s) => h('li', {}, safeHref(s.url) ? h('a', { href: safeHref(s.url), target: '_blank', rel: 'noopener' }, s.name) : s.name));
  return h('div', { class: 'wrap methods' },
    h('header', { class: 'scope__head' }, h('div', { class: 'cap hero__kicker' }, 'Methods & sources'), h('h1', { class: 'scope__title' }, 'How this was made')),
    h('div', { class: 'methods__grid' },
      h('div', { class: 'prose' },
        h('h2', {}, 'About'),
        h('p', {}, `${SITE_NAME} explains Medicare's Hospital Readmissions Reduction Program and shows the ${E.label} penalty for every hospital in it.`
          + ' It is built entirely from public federal files and is meant for anyone: patients and families, reporters, and the hospital teams who work with these numbers every day.'),
        h('p', {}, 'Built by Dalton Haslam, MD, MBA, a physician advisor, using Claude Code. It is an independent project, not affiliated with or endorsed by the Centers for Medicare & Medicaid Services. Corrections are welcome through ',
          h('a', { href: LINKEDIN_URL, target: '_blank', rel: 'noopener' }, 'LinkedIn'), '.'),

        h('h2', {}, 'The formula'),
        h('p', {}, 'For each of the six conditions with at least 25 cases, CMS compares the hospital\'s excess readmission ratio with its peer group\'s median. Each condition above the median contributes:'),
        h('pre', { class: 'formula' }, 'neutrality modifier × payment weight × (ratio − peer median)'),
        h('p', {}, `The contributions are added, capped at 3%, and subtracted from 1 to give the payment adjustment factor. This year the neutrality modifier is ${m.nm.toFixed(4)}. The cut applies to every traditional-Medicare base inpatient payment the hospital receives from ${E.payLong}.`),
        h('p', {}, `Recomputing every hospital from the values CMS publishes reproduces its factor exactly for ${fmtInt(rep.exact)} hospitals and within 0.0001 for the other ${fmtInt(rep.rounding)}. CMS computes from unrounded ratios and weights. The text version of its file, which this site reads, rounds them to four decimals; the Excel version carries the unrounded values.`),

        h('h2', {}, 'Estimated dollars'),
        h('p', {}, 'CMS publishes each hospital\'s percentage, not a dollar amount. This site estimates the base payments the cut applies to, then multiplies by the cut:'),
        h('pre', { class: 'formula' }, 'cases × case-mix index × (labor amount × wage index + non-labor amount × cost-of-living adjustment)'),
        h('p', {}, `Cases and case-mix index are each hospital's transfer-adjusted traditional-Medicare figures from the ${E.label} IPPS impact file, which uses claims from two years earlier. The standardized amounts come from ${E.label} Tables 1A and 1B (correction notice), choosing the column that matches each hospital's quality-reporting and EHR status as CMS flags it in the impact file.`),
        h('p', {}, `Across all hospitals this gives about ${fmtMoney(m.totals.modelBase)} in base payments and ${fmtMoney(m.totals.modelPen)} in penalties. CMS's own estimate in the ${E.label} final rule was ${fmtMoney(m.totals.cmsEst)}, made before the final factors from 2022–23 readmissions and FY2023 payments. It is a ballpark, not a check of these figures.`),
        dollarAssumptions(D),

        h('h2', {}, 'How to read a penalty'),
        h('ul', {},
          h('li', {}, 'It is relative. CMS sets each median over every hospital in the peer group, so about half of the hospitals measured on a condition sit above it, and most hospitals measured on several conditions get some cut.'),
          h('li', {}, 'A readmission is any unplanned return to an acute-care hospital within 30 days, for any reason. Not every readmission is preventable, and the ratios are adjusted for patients\' age and illnesses, not for their income or support at home.'),
          h('li', {}, 'Small hospitals have noisier ratios. CMS\'s statistical model pulls low-volume hospitals toward the average, and conditions under 25 cases do not count.'),
          h('li', {}, 'Medicare Advantage patients are in the ratios starting with FY2027, but the cut applies only to traditional Medicare payments.'),
          h('li', {}, `The data window is ${E.perfLong}, so the cut reflects care from roughly one to three years before it takes effect.`),
          h('li', {}, 'Not included: Maryland (its own all-payer model), critical access, children\'s, cancer, psychiatric, rehabilitation, and long-term care hospitals. Puerto Rico hospitals are not subject to the cut.')),

        h('h2', {}, 'Places'),
        h('p', {}, `Map dots are approximate: each hospital is placed at the center of its ZIP code (${fmtInt(m.geocode.zip)} hospitals) or, when the ZIP is not in the Census file or its center falls far outside the hospital's county, the center of that county (${fmtInt(m.geocode.county)}). Metro areas are the CBSA where each hospital sits, from the IPPS impact file. Regions and divisions follow the Census Bureau.`),

        h('h2', {}, 'History'),
        h('p', {}, `Penalties for FY${E.firstFy} through FY${E.fy - 1} come from CMS's archived final-rule supplemental files.`
          + ` For FY2013–FY2018 the share penalized excludes Maryland, Puerto Rico, and hospitals with no measured conditions, which those early files listed. Annual dollar totals come from CMS (a payment-rule estimate or, for FY2025, a later simulation of that year under the pre-FY2027 method) or from KFF Health News reporting; each bar's tooltip names its source. We found no total from either source for ${D.history.national.filter((r) => !r.totalEst).map((r) => `FY${r.fy}`).join(' or ')}.`)),
        h('h2', {}, 'Feedback and privacy'),
        h('p', {}, FEEDBACK_ENABLED
          ? 'The feedback form at the bottom of every page sends your note, the page you were on, and your email if you choose to give it. It goes to a private spreadsheet and an email inbox that only I read. Nothing else is collected, and the site sets no cookies. Please leave out any patient information.'
          : 'The site collects nothing about you and sets no cookies. To reach me, use the LinkedIn link at the bottom of any page.'),
        h('h2', {}, 'Accessibility'),
        h('p', {}, 'Every chart has a text label, and every chart\'s numbers are also available in a sortable table on the same page. Selecting individual dots or map areas requires a mouse or touch; the tables, search, and links offer the same destinations by keyboard.'),
      h('aside', {},
        h('h2', {}, 'Sources'),
        h('ul', { class: 'sources' }, src,
          h('li', {}, `CMS archived HRRP supplemental data files, FY${E.firstFy}–FY${E.fy - 1}`),
          h('li', {}, `Federal Register IPPS final rules, ${E.span}`),
          h('li', {}, 'KFF Health News annual readmission-penalty reporting')),
        h('h2', {}, 'Glossary'),
        h('dl', { class: 'glossary' }, GLOSSARY.map(([t, d]) => [h('dt', {}, t), h('dd', {}, d)])),
        h('h2', {}, 'Reuse'),
        h('p', {}, 'Code is MIT-licensed. Federal source data are public domain. Every table on the site can be copied or downloaded as CSV.'
          + ' In those files the CCN is written as ="010001" so spreadsheets keep its leading zero, headers name their units, and a condition\'s "penalized" column is blank when the hospital had fewer than 25 cases of it.'))));
}

export function renderNotFound(D, index) {
  return h('div', { class: 'wrap notfound' },
    h('div', { class: 'cap hero__kicker' }, 'Not in this edition'),
    h('h1', { class: 'scope__title' }, 'No record found'),
    h('p', {}, `That link does not match a hospital, state, metro area, or region in the ${D.edition.label} program.`
      + ' Hospitals not paid under Medicare\'s inpatient payment system, such as critical access hospitals, are not part of it.'),
    h('div', { class: 'hero__search' }, omnibox(index, { big: true })),
    h('p', {}, h('a', { href: '#' }, 'Back to the front page')));
}
