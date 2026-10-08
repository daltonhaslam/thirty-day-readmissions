import { contrib, CONDS } from './model.js';
import { slugify } from './router.js';

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
    h.top = CONDS.reduce((best, k) => (r.byCond[k] > (r.byCond[best] ?? 0) ? k : best), null);
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
  const divisions = meta.divisions.map((d) => ({ ...d, slug: slugify(d.name) }));
  const regions = [...new Set(divisions.map((d) => d.region))].map((name) => ({
    name, slug: slugify(name), divisions: divisions.filter((d) => d.region === name),
  }));
  const condByKey = Object.fromEntries(conditions.map((c) => [c.key, c]));
  const nationalByFy = Object.fromEntries(history.national.map((r) => [r.fy, r]));
  return {
    meta, conditions, condByKey, hospitals, byId, byState, byCbsa, cbsaNames, sortedRed,
    divisions, regions, history, nationalByFy, timeline, research, geo,
  };
}
