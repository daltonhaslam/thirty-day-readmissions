import { contrib, CONDS, summarize, slug, fmtDate, mean, cutPct } from './model.js';

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

// Every edition-specific phrase, derived from the data so a new fiscal year is a data refresh.
export function edition(meta, history) {
  const { fy } = meta;
  const firstFy = history.years[0];
  const nYears = fy - firstFy + 1;
  return {
    fy, label: `FY${fy}`, firstFy, nYears, yearsWord: WORDS[nYears] || String(nYears),
    perfLong: `${fmtDate(meta.perf[0], 'long')} through ${fmtDate(meta.perf[1], 'long')}`,
    payShort: `Oct 1, ${fy - 1} – Sep 30, ${fy}`,
    payLong: `October 1, ${fy - 1} through September 30, ${fy}`,
    payStart: `October 1, ${fy - 1}`,
    span: `FY${firstFy}–FY${fy}`,
  };
}

// Years whose data windows set aside January–June 2020 claims (timeline.json: "The gap shows up in the FY2022
// through FY2024 calculations"). Not the COVID-patient exclusion, which ran FY2023–FY2026.
export const COVID_GAP = { from: 2022, to: 2024, label: 'COVID data gap', short: 'COVID gap' };
export const COVID_GAP_NOTE = `Shaded: FY${COVID_GAP.from}–FY${COVID_GAP.to}, whose data windows set aside early-2020 claims because of COVID-19.`;

// A mark at each year the payment cap changed, read from the data; narrow charts drop "cap" from all but the last.
export function capMarks(national) {
  const steps = national.filter((r, i) => r.cap != null && r.cap !== national[i - 1]?.cap);
  return steps.map((r, i) => ({ fy: r.fy, label: `${r.cap}% cap`, short: i === steps.length - 1 ? `${r.cap}% cap` : `${r.cap}%` }));
}

// Mean cut (%) per year across `list`, each year over those of them in that year's file. Over every hospital this is
// the national line for area and hospital charts: the same hospitals as the area line, unlike CMS's yearly totals.
export function meanCutByYear(list, { years, history, fy }) {
  return years.map((y, i) => {
    const vals = list.map((x) => (y === fy ? x.paf : history.paf[x.id]?.[i])).filter((v) => v != null);
    return vals.length ? mean(vals.map(cutPct)) : null;
  });
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
  const years = [...history.years, meta.fy];
  return {
    meta, conditions, condByKey, hospitals, byId, byState, byCbsa, cbsaNames, sortedRed, stateSummary,
    nation: summarize(hospitals), edition: edition(meta, history), years,
    divisions, regions, history, nationalByFy, timeline, research, geo,
    programTrend: meanCutByYear(hospitals, { years, history, fy: meta.fy }), capMarks: capMarks(history.national),
  };
}
