import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format an intensity value — like I_m — as ONE compact, unambiguous, all-ASCII
 * token: "0.42", "5.4", "350", "26k", "1.5M". Since the ×1000 display inflation
 * was removed from computeIm, raw I_m is usually < 1 with occasional spikes into
 * the thousands, so small values need decimals (an integer round would show "0").
 *
 * Why not `toLocaleString()`: in fr-FR it groups thousands with U+202F (narrow
 * no-break space). jsPDF's standard Helvetica has no glyph for it, so it rendered
 * as "/" → "26 315 476" came out as "26 /315 /476", which looked like THREE
 * separate numbers and also broke right-alignment (jsPDF measured the separator
 * as a space but drew a different glyph, so the real right edge missed the
 * computed one). A compact SI-suffixed form avoids the separator entirely.
 */
export function fmtIm(n: number | undefined | null): string {
  if (n == null || !(n > 0)) return '—';
  if (n >= 1_000_000) { const m = n / 1_000_000; return `${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`.replace(/\.?0+M$/, 'M'); }
  if (n >= 10_000)    return `${Math.round(n / 1000)}k`;
  if (n >= 100)       return String(Math.round(n));
  if (n >= 1)         return n.toFixed(1).replace(/\.0$/, '');
  return n.toFixed(2);
}

// Normalize text: remove accents, lowercase, strip trailing s/es/ed/ing for basic stemming
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')    // keep only alphanum
    .replace(/\b(\w+?)(ies)\b/g, '$1y')   //ories -> ory
    .replace(/\b(\w{3,})(ies)\b/g, '$1ie') // fallback
    .replace(/\b(\w{4,})(ing|tion|tions|ment|ments|ed|es|s)\b/g, '$1') // strip suffixes
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if needle appears in haystack using normalized comparison
export function fuzzyIncludes(haystack: string, needle: string): boolean {
  const normHaystack = normalizeForSearch(haystack);
  const normNeedle = normalizeForSearch(needle);
  // Also check each word of needle individually (all must match)
  const words = normNeedle.split(' ').filter(w => w.length > 2);
  if (words.length === 0) return false;
  return words.every(w => normHaystack.includes(w));
}
