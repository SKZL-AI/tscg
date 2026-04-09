/**
 * TSCG Statistical Analysis
 * Wilson CI, McNemar test, and utility functions
 */

/** Wilson score confidence interval */
export function wilsonCI(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const d = 1 + (z * z) / total;
  const c = (p + (z * z) / (2 * total)) / d;
  const h = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** Binomial coefficient */
function comb(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  let r = 1;
  for (let i = 0; i < k; i++) {
    r = (r * (n - i)) / (i + 1);
  }
  return r;
}

/** McNemar exact test (two-sided) */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1.0;
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    tail += comb(n, i);
  }
  return Math.min(1.0, (2 * tail) / Math.pow(2, n));
}

/** Cohen's h effect size for two proportions */
export function cohensH(p1: number, p2: number): number {
  return 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));
}

/** Format percentage with 1 decimal */
export function fmtPct(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

/** Format confidence interval */
export function fmtCI(ci: [number, number]): string {
  return `[${(ci[0] * 100).toFixed(1)}-${(ci[1] * 100).toFixed(1)}]`;
}
