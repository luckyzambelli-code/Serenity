/**
 * primeFreqEngine.ts — Port of prime_freq.py core logic (v0.9)
 * Pure computation, no audio.
 *
 * MODEL:
 *   f_0 = 1 Hz  (fundamental)
 *   p*  = nearest prime to f_d
 *   Δ   = |f_d − p*|
 *   I_m = (β + γ)² / (θ + 0.01)
 */

export type Zone = 'PRIME' | 'SEMANTIC' | 'COMPOSITE' | 'MASSIVE';
export type PrimePhase = 'IDLE' | 'CAPTURE' | 'SONIFY' | 'CLEAN' | 'HARMONICS';

// ── Primes for EEG range (2–47 Hz) ────────────────────────────────────────
const PRIMES_EEG = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

// ── Primes for harmonic sequence (up to ~2000 Hz) ─────────────────────────
export const PRIMES_ALL: number[] = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67,
  71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149,
  151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227,
  229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307,
  311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389,
  397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467,
  479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571,
  577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653,
  659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751,
  757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853,
  857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947,
  953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021, 1031, 1033,
  1039, 1049, 1051, 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109,
  1117, 1123, 1129, 1151, 1153, 1163, 1171, 1181, 1187, 1193, 1201, 1213,
  1217, 1223, 1229, 1231, 1237, 1249, 1259, 1277, 1279, 1283, 1289, 1291,
  1297, 1301, 1303, 1307, 1319, 1321, 1327, 1361, 1367, 1373, 1381, 1399,
  1409, 1423, 1427, 1429, 1433, 1439, 1447, 1451, 1453, 1459, 1471, 1481,
  1483, 1487, 1489, 1493, 1499, 1511, 1523, 1531, 1543, 1549, 1553, 1559,
  1567, 1571, 1579, 1583, 1597, 1601, 1607, 1609, 1613, 1619, 1621, 1627,
  1637, 1657, 1663, 1667, 1669, 1693, 1697, 1699, 1709, 1721, 1723, 1733,
  1741, 1747, 1753, 1759, 1777, 1783, 1787, 1789, 1801, 1811, 1823, 1831,
  1847, 1861, 1867, 1871, 1873, 1877, 1879, 1889, 1901, 1907, 1913, 1931,
  1933, 1949, 1951, 1973, 1979, 1987, 1993, 1997, 1999,
];

// ── Zone colours (same palette as prime_freq.py) ──────────────────────────
export const ZONE_COLORS: Record<Zone, string> = {
  PRIME:     '#56cfe1',
  SEMANTIC:  '#e8c170',
  COMPOSITE: '#ff9b3d',
  MASSIVE:   '#d04545',
};

// ── Core computations ─────────────────────────────────────────────────────

/** I_m = (β + γ)² / (θ + 0.01)
 *  RAW intensity — the ×1000 display inflation was removed (it pushed the peak
 *  into the millions, e.g. "26.3M", which read poorly). Values are smaller now
 *  (often < 1, peaks in the thousands); the readout/PDF formatter (fmtIm) shows
 *  decimals for small values. No threshold depends on the absolute I_m magnitude
 *  (the AS-IS collapse test is a RATIO — peak-relative — hence scale-invariant). */
export function computeIm(theta: number, beta: number, gamma: number): number {
  return ((beta + gamma) ** 2) / (theta + 0.01);
}

/**
 * Approximate dominant frequency from EEG band powers.
 * Uses weighted centroid of band centre frequencies
 * (delta≈2 Hz, theta≈6 Hz, alpha≈10 Hz, beta≈20 Hz, gamma≈40 Hz).
 */
export function computeFd(
  delta: number,
  theta: number,
  alpha: number,
  beta: number,
  gamma: number,
): number {
  const total = delta + theta + alpha + beta + gamma + 1e-9;
  return (delta * 2 + theta * 6 + alpha * 10 + beta * 20 + gamma * 40) / total;
}

/** Return the nearest prime ≤ 47 Hz to f (EEG range). */
export function nearestPrime(f: number): number {
  if (f <= 1) return 2;
  let closest = PRIMES_EEG[0];
  let minDist = Math.abs(f - closest);
  for (const p of PRIMES_EEG) {
    const d = Math.abs(f - p);
    if (d < minDist) { minDist = d; closest = p; }
  }
  return closest;
}

/** Δ < 0.5 → PRIME, ≤ 3 → SEMANTIC, ≤ 7 → COMPOSITE, else MASSIVE */
export function classifyZone(delta: number): Zone {
  if (delta < 0.5) return 'PRIME';
  if (delta <= 3)  return 'SEMANTIC';
  if (delta <= 7)  return 'COMPOSITE';
  return 'MASSIVE';
}

/** Harmonic sequence: f_0·p for p ∈ {1} ∪ primes, up to maxHz. */
export function harmonicSequence(
  f0 = 1.0,
  pMax?: number,
  maxHz = 2000,
): Array<{ p: number; freq: number }> {
  const seq: Array<{ p: number; freq: number }> = [{ p: 1, freq: f0 }];
  for (const p of PRIMES_ALL) {
    if (pMax != null && p > pMax) break;
    const freq = f0 * p;
    if (freq >= maxHz) break;
    seq.push({ p, freq });
  }
  return seq;
}
