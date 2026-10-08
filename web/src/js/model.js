// Pure functions: the HRRP formula, summaries, filters, and formatting. No DOM.
import { quantileSorted } from 'd3-array';

export const CONDS = ['AMI', 'COPD', 'HF', 'PN', 'CABG', 'THA_TKA'];
export const PEERS = [1, 2, 3, 4, 5];
export const MIN_DISCHARGES = 25;
export const CAP = 0.03;
export const CAP_PCT = CAP * 100;
export const TEACH_LABEL = { none: 'Non-teaching', minor: 'Minor teaching', major: 'Major teaching' };

const round4 = (v) => Math.round(v * 1e4) / 1e4;
// Payment reduction in percent (2 dp) from a payment adjustment factor.
export const cutPct = (paf) => Math.round((1 - paf) * 1e4) / 100;
// A condition counts only with at least 25 eligible cases and a published ratio.
export const isMeasured = (c) => (c?.n ?? 0) >= MIN_DISCHARGES && c.err != null;
export const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

export function peerMedian(meta, peer, cond) {
  return meta.peerMedians[peer]?.[cond] ?? null;
}

// One condition's contribution: NM x DRG ratio x max(ERR - peer median, 0), when discharges >= 25.
export function conditionContribution(c, med, nm, errOverride) {
  if (!isMeasured(c)) return 0;
  const err = errOverride ?? c.err;
  if (med == null || !weightPublished(c)) return 0;
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
    get medianRed() { return median(reds); },
    meanRedPen: mean(pen),
    get medianRedPen() { return median(pen); },
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

// {peer: {cond: [p10, p90]}} of ERRs among hospitals with >= 25 cases.
export function peerBands(list) {
  const acc = {};
  for (const x of list) {
    for (const [k, c] of Object.entries(x.c)) {
      if (!isMeasured(c)) continue;
      ((acc[x.peer] ??= {})[k] ??= []).push(c.err);
    }
  }
  const out = {};
  for (const [p, conds] of Object.entries(acc)) {
    out[p] = {};
    for (const [k, v] of Object.entries(conds)) {
      v.sort((a, b) => a - b);
      out[p][k] = [quantileSorted(v, 0.1), quantileSorted(v, 0.9)];
    }
  }
  return out;
}

// 'counted' (adds to the penalty) | 'below' (measured, at or below median) | 'few' (under 25 cases) | 'none'
export function condState(h, k, meta, byCond = contrib(h, meta).byCond) {
  const c = h.c[k];
  if (!c) return 'none';
  if (!isMeasured(c)) return 'few';
  return byCond[k] > 0 || c.flag === 1 ? 'counted' : 'below';
}

// Why a hospital got (or avoided) its penalty.
export function verdict(h, meta) {
  const r = contrib(h, meta);
  const measured = CONDS.filter((k) => isMeasured(h.c[k]));
  const above = measured.filter((k) => condState(h, k, meta, r.byCond) === 'counted');
  const top = above.reduce((best, k) => (best == null || r.byCond[k] > r.byCond[best] ? k : best), null);
  let status = 'penalized';
  if (h.paf >= 1) status = !measured.length ? 'none-measured' : above.length ? 'none-rounded' : 'none-below';
  return { status, top, nAbove: above.length, nMeasured: measured.length, measured, above };
}

// What-if factor: CMS's published factor moved by the recomputed change. When no measured condition is
// above its median any more the cut is zero by CMS's rule; this also absorbs the 0.0001 rounding gap and
// any share CMS counted that cannot be recomputed (a flagged condition with no published payment weight).
export function whatIfPaf(h, meta, over) {
  const anyAbove = CONDS.some((k) => {
    const c = h.c[k];
    if (!isMeasured(c)) return false;
    return (over[k] ?? c.err) > peerMedian(meta, h.peer, k);
  });
  if (!anyAbove) return 1;
  const moved = h.paf + (contrib(h, meta, over).paf - contrib(h, meta).paf);
  return Math.round(Math.min(1, Math.max(1 - CAP, moved)) * 1e4) / 1e4;
}

// [lo, hi] widened as needed to contain `values` plus `pad`, snapped outward to multiples of `step`.
export function niceDomain(values, [lo, hi], step, pad) {
  const snap = (v) => Math.round(v * 1e6) / 1e6;
  return [snap(Math.min(lo, Math.floor((Math.min(...values) - pad) / step + 1e-9) * step)),
    snap(Math.max(hi, Math.ceil((Math.max(...values) + pad) / step - 1e-9) * step))];
}

// Slider bounds that always contain the actual ratio, with room on both sides.
export const sliderRange = (err) => niceDomain([err], [0.8, 1.25], 0.05, 0.05);

// CMS can flag a condition without publishing its payment weight; its share of the cut then can't be recomputed.
export const weightPublished = (c) => c?.ratio != null;
export const WEIGHT_MISSING = 'flagged by CMS; payment weight not published';

// "Larger cut than N% of hospitals": floored and never 100 (a hospital is never above itself).
export function rankPct(sorted, v) {
  return Math.min(99, Math.floor(percentileRank(sorted, v)));
}

// Condition label inside a sentence: acronyms stay, words go lowercase.
export const inSentence = (label) => (label === label.toUpperCase() ? label : label.toLowerCase());

// "+0.05 pts vs nation", compared after rounding to what is shown.
export function vsLabel(a, b, dp, unit, word = 'nation') {
  const d = Number(a.toFixed(dp)) - Number(b.toFixed(dp));
  if (Math.abs(d) < 10 ** -(dp + 2)) return `same as ${word}`;
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(dp)} ${unit} vs ${word}`;
}

// Histogram bin for value v with width step; bins are [lo, hi) and robust to float error.
export const binIndex = (v, step) => Math.floor(v / step + 1e-9);

export const fmtDate = (iso, month = 'short') => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month, day: 'numeric', year: 'numeric' });
