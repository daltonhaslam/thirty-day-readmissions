import { h } from '../dom.js';
import { part } from '../ui/figure.js';
import { fmtInt, fmtMoney } from '../model.js';
import { safeHref } from './util.js';
import { omnibox } from '../ui/omnibox.js';

const GLOSSARY = [
  ['Readmission', 'An unplanned return to any acute-care hospital within 30 days of discharge, for any reason. Planned returns, such as a scheduled chemotherapy stay, do not count.'],
  ['Excess readmission ratio (ERR)', 'Predicted readmissions for this hospital divided by expected readmissions for an average hospital with the same patients. Above 1.0 means more than expected.'],
  ['Peer group', 'One of five equal-sized groups of hospitals, sorted by the share of their Medicare stays from patients who also have full Medicaid.'],
  ['Dual-eligible', 'A person enrolled in both Medicare and full Medicaid benefits, a common marker of low income.'],
  ['Neutrality modifier', 'A single factor, the same for every hospital in a year, that keeps total penalties under peer grouping equal to what the pre-2019 method would have produced.'],
  ['Payment weight (DRG payment ratio)', 'The share of a hospital\'s traditional Medicare base payments that come from stays for a given condition. Conditions that bring in more payments weigh more.'],
  ['Payment adjustment factor (PAF)', 'What CMS multiplies each base payment by: 1 minus the reduction. A factor of 0.9886 means a 1.14% cut.'],
  ['Base operating DRG payment', 'The standard Medicare inpatient payment for a stay before add-ons such as teaching, low-income patient, and outlier payments. The cut applies only to this amount.'],
  ['Traditional Medicare (FFS)', 'Fee-for-service Medicare, paid directly by CMS. Medicare Advantage plans are private plans paid separately; the cut does not apply to them.'],
  ['IPPS', 'The Inpatient Prospective Payment System, which sets Medicare payments to general acute-care hospitals each fiscal year.'],
  ['CCN', 'CMS Certification Number, the six-digit ID CMS assigns each hospital.'],
  ['Metro area (CBSA)', 'A Core-Based Statistical Area defined by the Office of Management and Budget: a city and the counties tied to it by commuting.'],
];

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
        h('p', {}, `Thirty Days explains Medicare's Hospital Readmissions Reduction Program and shows the ${E.label} penalty for every hospital in it.`
          + ' It is built entirely from public federal files and is meant for anyone: patients and families, reporters, and the hospital teams who work with these numbers every day.'),
        h('p', {}, 'Built by Dalton Haslam, MD, MBA, a physician advisor. It is an independent project, not affiliated with or endorsed by the Centers for Medicare & Medicaid Services. Corrections are welcome through ',
          h('a', { href: 'https://www.linkedin.com/in/dalton-haslam', target: '_blank', rel: 'noopener' }, 'LinkedIn'), '.'),

        h('h2', {}, 'The formula'),
        h('p', {}, 'For each of the six conditions with at least 25 cases, CMS compares the hospital\'s excess readmission ratio with its peer group\'s median. Each condition above the median contributes:'),
        h('pre', { class: 'formula' }, 'neutrality modifier × payment weight × (ratio − peer median)'),
        h('p', {}, `The contributions are added, capped at 3%, and subtracted from 1 to give the payment adjustment factor. This year the neutrality modifier is ${m.nm.toFixed(4)}. The cut applies to every traditional-Medicare base inpatient payment the hospital receives from ${E.payLong}.`),
        h('p', {}, `Recomputing every hospital from the values CMS publishes reproduces its factor exactly for ${fmtInt(rep.exact)} hospitals and within 0.0001 for the other ${fmtInt(rep.rounding)}. CMS computes from unrounded ratios and weights; the file publishes them rounded to four decimals.`),

        h('h2', {}, 'Estimated dollars'),
        h('p', {}, 'CMS publishes each hospital\'s percentage, not a dollar amount. This site estimates the base payments the cut applies to, then multiplies by the cut:'),
        h('pre', { class: 'formula' }, 'cases × case-mix index × (labor amount × wage index + non-labor amount × cost-of-living adjustment)'),
        h('p', {}, `Cases and case-mix index are each hospital's transfer-adjusted traditional-Medicare figures from the ${E.label} IPPS impact file, which uses claims from two years earlier. The standardized amounts come from ${E.label} Tables 1A and 1B (correction notice), choosing the column that matches each hospital's quality-reporting and EHR status.`),
        h('p', {}, `Across all hospitals this gives about ${fmtMoney(m.totals.modelBase)} in base payments and ${fmtMoney(m.totals.modelPen)} in penalties. CMS's own estimate in the ${E.label} final rule was ${fmtMoney(m.totals.cmsEst)}, made before the final factors with preliminary data.`),
        h('p', {}, `Limits: volume from two years earlier stands in for ${E.label}; hospitals paid on a hospital-specific rate (some sole community and Medicare-dependent hospitals) are estimated at the federal rate; nine hospitals missing from the impact file have no estimate. Teaching, low-income-patient, and outlier add-ons are excluded because the cut does not apply to them.`),

        h('h2', {}, 'How to read a penalty'),
        h('ul', {},
          h('li', {}, 'It is relative. Half of each peer group sits above each median by definition, so most hospitals measured on several conditions get some cut.'),
          h('li', {}, 'A readmission is any unplanned return to an acute-care hospital within 30 days, for any reason. Not every readmission is preventable, and the ratios are adjusted for patients\' age and illnesses, not for their income or support at home.'),
          h('li', {}, 'Small hospitals have noisier ratios. CMS\'s statistical model pulls low-volume hospitals toward the average, and conditions under 25 cases do not count.'),
          h('li', {}, 'Medicare Advantage patients are in the ratios starting with FY2027, but the cut applies only to traditional Medicare payments.'),
          h('li', {}, `The data window is ${E.perfLong}, so the cut reflects care from roughly one to three years before it takes effect.`),
          h('li', {}, 'Not included: Maryland (its own all-payer model), critical access, children\'s, cancer, psychiatric, rehabilitation, and long-term care hospitals. Puerto Rico hospitals are not subject to the cut.')),

        h('h2', {}, 'Places'),
        h('p', {}, `Hospitals are placed at the center of their ZIP code (${fmtInt(m.geocode.zip)} hospitals) or, when the ZIP is a post-office box, the center of their county (${fmtInt(m.geocode.county)}). Metro areas are the CBSA where each hospital sits, from the IPPS impact file. Regions and divisions follow the Census Bureau.`),

        h('h2', {}, 'History'),
        h('p', {}, `Penalties for FY${E.firstFy} through FY${E.fy - 1} come from CMS's archived final-rule supplemental files.`
          + ` For FY2013–FY2018 the share penalized excludes Maryland, Puerto Rico, and hospitals with no measured conditions, which those early files listed. Annual dollar totals are CMS estimates from each year's payment rule, or KFF Health News reporting where CMS printed none; CMS did not publish a total for ${D.history.national.filter((r) => !r.totalEst).map((r) => `FY${r.fy}`).join(' or ')}.`)),
      h('aside', {},
        h('h2', {}, 'Sources'),
        h('ul', { class: 'sources' }, src,
          h('li', {}, `CMS archived HRRP supplemental data files, FY${E.firstFy}–FY${E.fy - 1}`),
          h('li', {}, `Federal Register IPPS final rules, ${E.span}`),
          h('li', {}, 'KFF Health News annual readmission-penalty reporting')),
        h('h2', {}, 'Glossary'),
        h('dl', { class: 'glossary' }, GLOSSARY.map(([t, d]) => [h('dt', {}, t), h('dd', {}, d)])),
        h('h2', {}, 'Reuse'),
        h('p', {}, 'Code is MIT-licensed. Federal source data are public domain. Every table on the site can be copied or downloaded as CSV.'))));
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
