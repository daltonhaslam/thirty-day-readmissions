import { contrib, CONDS, summarize, slug } from './model.js';

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// Every edition-specific phrase, derived from the data so a new fiscal year is a data refresh.
export function edition(meta, history) {
  const { fy } = meta;
  const firstFy = history.years[0];
  const nYears = fy - firstFy + 1;
  return {
    fy, label: `FY${fy}`, firstFy, nYears, yearsWord: WORDS[nYears] || String(nYears),
    perfLong: `${longDate(meta.perf[0])} through ${longDate(meta.perf[1])}`,
    payShort: `Oct 1, ${fy - 1} – Sep 30, ${fy}`,
    payLong: `October 1, ${fy - 1} through September 30, ${fy}`,
    payStart: `October 1, ${fy - 1}`,
    span: `FY${firstFy}–FY${fy}`,
  };
}

// Turn the raw data contract into indexed, view-ready structures.
export function loadData(raw) {
  const { meta, conditions, hospitals, history, timeline, research, geo } = raw;
  const byId = new Map();
  const byState = new Map();
  const byCbsa = new Map();
  const cbsaNames = {};
  for (const h of hospitals) {
    const r = contrib(h, meta);
    h.cx = r.byCond;
    h.flags = CONDS.filter((k) => h.c[k]?.flag === 1);
    h.place = [h.city, h.st].filter(Boolean).join(', ');
    byId.set(h.id, h);
    if (!byState.has(h.st)) byState.set(h.st, []);
    byState.get(h.st).push(h);
    if (h.cbsa) {
      if (!byCbsa.has(h.cbsa)) byCbsa.set(h.cbsa, []);
      byCbsa.get(h.cbsa).push(h);
      cbsaNames[h.cbsa] = h.cbsaName;
    }
  }
  const sortedRed = hospitals.map((h) => h.red).sort((a, b) => a - b);
  const divisions = meta.divisions.map((d) => ({ ...d, slug: slug(d.name) }));
  const regions = [...new Set(divisions.map((d) => d.region))].map((name) => ({
    name, slug: slug(name), divisions: divisions.filter((d) => d.region === name),
  }));
  const stateSummary = new Map([...byState.entries()].map(([st, list]) => [st, summarize(list)]));
  const condByKey = Object.fromEntries(conditions.map((c) => [c.key, c]));
  const nationalByFy = Object.fromEntries(history.national.map((r) => [r.fy, r]));
  return {
    meta, conditions, condByKey, hospitals, byId, byState, byCbsa, cbsaNames, sortedRed, stateSummary,
    nation: summarize(hospitals), edition: edition(meta, history),
    divisions, regions, history, nationalByFy, timeline, research, geo,
  };
}
