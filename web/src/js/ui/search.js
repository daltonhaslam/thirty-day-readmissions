// Pure search over hospitals, states, and metro areas. DOM lives in omnibox.js.

const SYNONYMS = { saint: ['st'], st: ['saint'], mount: ['mt'], mt: ['mount'], fort: ['ft'], ft: ['fort'] };
const TYPE_WEIGHT = { state: 30, metro: 20, hospital: 0 };

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function entry(type, key, label, sub, extra = '') {
  const labelNorm = normalize(label);
  return { type, key, label, sub, labelNorm, labelWords: labelNorm.split(' '), words: normalize(`${label} ${extra}`).split(' ') };
}

export function buildIndex({ hospitals, states, metros }) {
  const out = [];
  for (const [st, name] of Object.entries(states)) out.push(entry('state', st, name, 'State', st));
  for (const [code, name] of Object.entries(metros)) out.push(entry('metro', String(code), name, 'Metro area'));
  for (const h of hospitals) {
    const where = [h.city, h.st].filter(Boolean).join(', ');
    out.push(entry('hospital', h.id, h.name, where, `${h.city ?? ''} ${h.st ?? ''} ${h.zip ?? ''} ${h.id}`));
  }
  return out;
}

const matchesWord = (alts, words) => words.some((w) => alts.some((a) => w.startsWith(a)));

export function search(query, index, limit = 10) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ').map((t) => [t, ...(SYNONYMS[t] || [])]);
  const scored = [];
  for (const e of index) {
    if (!tokens.every((alts) => matchesWord(alts, e.words))) continue;
    let score = TYPE_WEIGHT[e.type];
    if (e.key.toLowerCase() === q) score += 1000;
    if (e.labelNorm === q) score += 500;
    else if (e.labelNorm.startsWith(q)) score += 200;
    for (const alts of tokens) if (matchesWord(alts, e.labelWords)) score += 20;
    score -= e.label.length * 0.1;
    scored.push({ type: e.type, key: e.key, label: e.label, sub: e.sub, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
