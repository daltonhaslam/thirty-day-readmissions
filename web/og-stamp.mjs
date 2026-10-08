// The inputs the preview card shows. og.mjs writes them to docs/og.json next to og.png;
// a test recomputes them so a stale card (data or name changed, card not re-rendered) fails.
export const cardStamp = (D, lines) => ({
  fy: D.meta.fy, lines, n: D.nation.n, nPen: D.nation.nPen, meanRed: Number(D.nation.meanRed.toFixed(2)), nMax: D.nation.nMax,
});
