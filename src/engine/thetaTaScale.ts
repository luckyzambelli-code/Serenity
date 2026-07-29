/**
 * THETA — SCALA DEL TONE ARM, tarata con l'artefatto fisico.
 *
 * L'utente possiede l'artefatto di taratura del Theta-Meter: si attacca al posto delle lattine
 * e ha un pulsante per ciascun valore di TA — 2, 3, 4, 5. Premendoli si ottengono quattro
 * coppie (grezzo, TA) **certe**, e da lì il TA diventa un numero VERO sulla scala del meter,
 * non una grandezza relativa.
 *
 * ── PERCHÉ A TRATTI E NON UNA RETTA ────────────────────────────────────────────────────────
 * Si potrebbe adattare una retta ai quattro punti, ma sarebbe un'ipotesi: se il meter converte
 * la resistenza in frequenza il legame è curvo, e la retta sbaglierebbe in mezzo. Con quattro
 * punti conviene invece **interpolare fra di essi**: è ESATTO in corrispondenza dei punti
 * misurati e non assume nulla sulla forma della curva.
 *
 * La linearità la si può comunque MISURARE (`linearitaResidua`) — è un'informazione utile
 * sull'apparecchio, non un'ipotesi su cui poggiare la lettura.
 *
 * Fuori dai punti tarati si prolunga il segmento più vicino: meglio un valore un po' incerto
 * ai bordi che nessun valore.
 */

/** Una coppia misurata con l'artefatto. */
export interface ThetaTaPoint {
  /** Valore di TA inciso sull'artefatto (2, 3, 4, 5). */
  ta: number;
  /** Grezzo letto dal meter con quel pulsante premuto. */
  raw: number;
}

/** La taratura completa: i punti, ordinati per grezzo crescente. */
export interface ThetaTaScale {
  points: ThetaTaPoint[];
  /** Quando è stata fatta (ms epoch) — una taratura vecchia va rifatta. */
  madeAt: number;
}

/** Servono almeno due punti per definire una scala. */
export const MIN_TA_POINTS = 2;

/**
 * Costruisce la scala dai punti raccolti. Restituisce null se sono troppo pochi o se due punti
 * hanno lo stesso grezzo (indeterminato: due TA diversi non possono dare la stessa lettura).
 */
export const buildTaScale = (points: ThetaTaPoint[], madeAt: number): ThetaTaScale | null => {
  const validi = points.filter(p => Number.isFinite(p.raw) && Number.isFinite(p.ta));
  if (validi.length < MIN_TA_POINTS) return null;

  const ordinati = [...validi].sort((a, b) => a.raw - b.raw);
  for (let i = 1; i < ordinati.length; i++) {
    if (Math.abs(ordinati[i].raw - ordinati[i - 1].raw) < 1e-9) return null;
  }
  return { points: ordinati, madeAt };
};

/**
 * Grezzo → TONE ARM, interpolando fra i punti tarati.
 *
 * NB sul verso: sul meter dell'utente il grezzo CRESCE con la resistenza, e sul TA di un
 * e-meter un valore più alto corrisponde a più resistenza. I punti sono quindi normalmente
 * crescenti in entrambi — ma non lo si dà per scontato: si ordina per grezzo e si interpola,
 * così la funzione regge anche se l'apparecchio andasse al contrario.
 */
export const taFromRaw = (raw: number, scale: ThetaTaScale): number => {
  const p = scale.points;
  if (p.length === 1) return p[0].ta;

  // Sotto il primo punto o sopra l'ultimo: si prolunga il segmento di bordo.
  if (raw <= p[0].raw) return interpola(raw, p[0], p[1]);
  if (raw >= p[p.length - 1].raw) return interpola(raw, p[p.length - 2], p[p.length - 1]);

  for (let i = 1; i < p.length; i++) {
    if (raw <= p[i].raw) return interpola(raw, p[i - 1], p[i]);
  }
  return p[p.length - 1].ta;
};

const interpola = (raw: number, a: ThetaTaPoint, b: ThetaTaPoint): number => {
  const dr = b.raw - a.raw;
  if (Math.abs(dr) < 1e-9) return a.ta;
  return a.ta + ((raw - a.raw) / dr) * (b.ta - a.ta);
};

/**
 * Quanto l'apparecchio si scosta da una retta, in unità di TA: si adatta una retta ai minimi
 * quadrati sui punti e si restituisce lo scarto MASSIMO.
 *
 * Non serve alla lettura — quella interpola e non ha bisogno di ipotesi. Serve a SAPERE com'è
 * fatto l'apparecchio: sotto ~0,05 TA il legame è praticamente lineare; molto sopra, è curvo, e
 * allora tarare solo due punti non basterebbe (motivo per cui l'artefatto ne offre quattro).
 */
export const linearitaResidua = (scale: ThetaTaScale): number => {
  const p = scale.points;
  if (p.length < 3) return 0;              // con due punti la retta passa esatta: nulla da dire

  const n = p.length;
  const sx = p.reduce((s, q) => s + q.raw, 0);
  const sy = p.reduce((s, q) => s + q.ta, 0);
  const sxx = p.reduce((s, q) => s + q.raw * q.raw, 0);
  const sxy = p.reduce((s, q) => s + q.raw * q.ta, 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return 0;

  const m = (n * sxy - sx * sy) / den;
  const b = (sy - m * sx) / n;
  return Math.max(...p.map(q => Math.abs(q.ta - (m * q.raw + b))));
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENZA
// ═══════════════════════════════════════════════════════════════════════════════════════════

const CHIAVE = 'sm_theta_ta_scale';

/** La taratura è dell'APPARECCHIO, non della persona: si fa una volta e resta. */
export const saveTaScale = (scale: ThetaTaScale): void => {
  try { localStorage.setItem(CHIAVE, JSON.stringify(scale)); } catch (_) { /* quota o modalità privata */ }
};

export const loadTaScale = (): ThetaTaScale | null => {
  try {
    const s = localStorage.getItem(CHIAVE);
    if (!s) return null;
    const o = JSON.parse(s) as ThetaTaScale;
    // Si ricostruisce invece di fidarsi: un file scritto a mano, o di una versione precedente,
    // non deve poter produrre una scala non ordinata o con punti doppi.
    return Array.isArray(o?.points) ? buildTaScale(o.points, o.madeAt ?? 0) : null;
  } catch (_) { return null; }
};

export const clearTaScale = (): void => {
  try { localStorage.removeItem(CHIAVE); } catch (_) { /* niente da fare */ }
};
