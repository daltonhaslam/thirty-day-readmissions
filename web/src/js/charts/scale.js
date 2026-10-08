// Shared encodings: the penalty ramp (screens of the red ink) and axis styling helpers.
export const BINS = [
  { cls: 'p0', label: 'No penalty', test: (r) => r <= 0 },
  { cls: 'p1', label: 'Under 0.25%', test: (r) => r < 0.25 },
  { cls: 'p2', label: '0.25–0.49%', test: (r) => r < 0.5 },
  { cls: 'p3', label: '0.50–0.99%', test: (r) => r < 1 },
  { cls: 'p4', label: '1.00–1.99%', test: (r) => r < 2 },
  { cls: 'p5', label: '2.00–3.00%', test: (r) => true },
];
const binOf = (red) => BINS.findIndex((b) => b.test(red));
export const rampVar = (red) => `var(--${BINS[binOf(red)].cls})`;

export function styleAxis(g) {
  g.selectAll('path.domain').attr('stroke', 'var(--ink)').attr('stroke-width', 1);
  g.selectAll('.tick line').attr('stroke', 'var(--ink-3)');
  g.selectAll('.tick text').attr('fill', 'var(--ink-2)').attr('font-family', 'var(--font-type)').attr('font-size', 11);
  return g;
}
