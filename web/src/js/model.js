// Pure functions: the HRRP formula, summaries, filters, and formatting. No DOM.

export const CONDS = ['AMI', 'COPD', 'HF', 'PN', 'CABG', 'THA_TKA'];
export const MIN_DISCHARGES = 25;
export const CAP = 0.03;

const round4 = (v) => Math.round(v * 1e4) / 1e4;

export function peerMedian(meta, peer, cond) {
  return meta.peerMedians[peer]?.[cond] ?? null;
}

// One condition's contribution: NM x DRG ratio x max(ERR - peer median, 0), when discharges >= 25.
export function conditionContribution(c, med, nm, errOverride) {
  if (!c) return 0;
  const err = errOverride ?? c.err;
  if ((c.n ?? 0) < MIN_DISCHARGES || err == null || med == null || c.ratio == null) return 0;
  return nm * c.ratio * Math.max(err - med, 0);
}

export function contrib(h, meta, errOverride = {}) {
  const byCond = {};
  let sum = 0;
  for (const k of CONDS) {
    byCond[k] = conditionContribution(h.c[k], peerMedian(meta, h.peer, k), meta.nm, errOverride[k]);
    sum += byCond[k];
  }
  const reduction = Math.min(sum, CAP);
  return { byCond, sum, reduction, paf: round4(1 - round4(reduction)) };
}

export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(list) {
  const reds = list.map((h) => h.red);
  const pen = reds.filter((r) => r > 0);
  return {
    n: list.length,
    nPen: pen.length,
    pctPen: list.length ? (100 * pen.length) / list.length : 0,
    meanRed: mean(reds),
    medianRed: median(reds),
    meanRedPen: mean(pen),
    medianRedPen: median(pen),
    nMax: list.filter((h) => h.paf <= 1 - CAP + 1e-9).length,
    nGe1: reds.filter((r) => r >= 1).length,
    penTotal: list.reduce((s, h) => s + (h.pen ?? 0), 0),
    baseTotal: list.reduce((s, h) => s + (h.base ?? 0), 0),
  };
}

// Share (0-100) of values strictly below v; `sorted` ascending.
export function percentileRank(sorted, v) {
  if (!sorted.length) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return (100 * lo) / sorted.length;
}

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

export function scopeFilter({ view, key }) {
  switch (view) {
    case 'state': return (h) => h.st === key;
    case 'metro': return (h) => h.cbsa === key;
    case 'division': return (h) => slug(h.division) === key;
    case 'region': return (h) => slug(h.region) === key;
    default: return () => true;
  }
}

export const BED_BANDS = ['<100', '100–299', '300–499', '500+'];
export function bedBand(beds) {
  if (beds == null) return null;
  if (beds < 100) return BED_BANDS[0];
  if (beds < 300) return BED_BANDS[1];
  if (beds < 500) return BED_BANDS[2];
  return BED_BANDS[3];
}

const norm = (s) => String(s ?? '').toLowerCase();

export function applyFilters(list, f = {}) {
  const text = norm(f.text).trim();
  return list.filter((h) =>
    (!f.penalized || h.paf < 1)
    && (f.st == null || h.st === f.st)
    && (f.peer == null || h.peer === f.peer)
    && (f.teach == null || h.teach === f.teach)
    && (f.beds == null || bedBand(h.beds) === f.beds)
    && (f.urban == null || h.urban === f.urban)
    && (f.cond == null || h.c?.[f.cond]?.flag === 1)
    && (!text || norm(`${h.name} ${h.city} ${h.st} ${h.id}`).includes(text)));
}

export function fmtPct(v, dp = 2) {
  return v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}%`;
}

export function fmtInt(v) {
  return v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US');
}

export function fmtMoney(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e8) return `$${Math.round(v / 1e6)}M`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value ? c.value(r) : r[c.key])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function pct(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

// {peer: {cond: [p10, p90]}} of ERRs among hospitals with >= 25 cases.
export function peerBands(list) {
  const acc = {};
  for (const x of list) {
    for (const [k, c] of Object.entries(x.c)) {
      if ((c.n ?? 0) < MIN_DISCHARGES || c.err == null) continue;
      ((acc[x.peer] ??= {})[k] ??= []).push(c.err);
    }
  }
  const out = {};
  for (const [p, conds] of Object.entries(acc)) {
    out[p] = {};
    for (const [k, v] of Object.entries(conds)) {
      v.sort((a, b) => a - b);
      out[p][k] = [pct(v, 0.1), pct(v, 0.9)];
    }
  }
  return out;
}

// Why a hospital got (or avoided) its penalty.
export function verdict(h, meta) {
  const measured = CONDS.filter((k) => (h.c[k]?.n ?? 0) >= MIN_DISCHARGES && h.c[k].err != null);
  const r = contrib(h, meta);
  const above = measured.filter((k) => r.byCond[k] > 0 || h.c[k].flag === 1);
  const top = above.reduce((best, k) => (best == null || r.byCond[k] > r.byCond[best] ? k : best), null);
  let status = 'penalized';
  if (h.paf >= 1) status = measured.length ? 'none-below' : 'none-measured';
  return { status, top, nAbove: above.length, nMeasured: measured.length, measured, above };
}
