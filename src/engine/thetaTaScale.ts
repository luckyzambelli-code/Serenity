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

/** Estremi della scala del TONE ARM. Sopra 6,5 non è più una lettura: è il prolungamento
 *  dell'ultimo segmento che se ne va per conto suo (si erano visti valori come 8,59).
 *  Meglio fermarsi al fondo scala vero che stampare un numero che non esiste. */
export const TA_MIN = 0;
export const TA_MAX = 6.5;

/**
 * TARATURA DI FABBRICA — misurata con l'artefatto fisico il 29/07/2026.
 *
 * Va DENTRO il programma, non solo in localStorage: la scala è una proprietà dell'APPARECCHIO,
 * quindi vale per chiunque abbia un Theta-Meter, non solo per chi l'ha misurata. Tenendola solo
 * sulla macchina di chi ha l'artefatto, su ogni altro computer il TA non compariva affatto —
 * e non c'era modo di capirlo (segnalato da un tester).
 *
 * ⚠️ I TA NON sono quelli incisi sull'artefatto: sono quelli che il programma Theta-Meter
 * MOSTRA premendo ciascun pulsante. Il suo software applica correzioni sue, e ancorare la scala
 * ai valori nominali produce un errore che varia lungo la scala e ne inverte pure il segno.
 *
 * Chi ritara, sovrascrive: la sua misura vince su questa.
 */
export const FACTORY_TA_POINTS: ThetaTaPoint[] = [
  { ta: 2.034, raw:   947_945 },
  { ta: 3.056, raw: 2_188_003 },
  { ta: 4.068, raw: 3_938_419 },
  { ta: 5.041, raw: 6_699_352 },
];

/** Servono almeno due punti per definire una scala. */
export const MIN_TA_POINTS = 2;

/**
 * IL PUNTO FUORI ORDINE, se c'è.
 *
 * ── PERCHÉ SERVE, E COME L'HO SCOPERTO ─────────────────────────────────────────────────────
 * Misura del 08/08/2026 con la regolazione automatica: TA 2 → 494, TA 3 → 1244, TA 4 → 2555,
 * TA 5 → **559**. I primi tre crescono (×2,52 poi ×2,05, forma coerente con quella di fabbrica);
 * il quarto è NOVE VOLTE più basso di dove dovrebbe stare, e più basso perfino del punto TA 3.
 *
 * Su un e-meter è impossibile: più TA vuol dire più resistenza, quindi il grezzo deve crescere.
 * Un punto che scende dice che è cambiato qualcosa DURANTE la misura (la regolazione automatica
 * ha cambiato portata, o la lettura è stata presa prima che si stabilizzasse), non che
 * l'apparecchio si comporta così.
 *
 * ── IL DIFETTO CHE QUESTO NASCONDEVA ───────────────────────────────────────────────────────
 * `buildTaScale` ORDINA per grezzo, e con quei quattro punti l'ordinamento dava:
 *
 *     raw  494 → TA 2      raw  559 → TA 5      raw 1244 → TA 3      raw 2555 → TA 4
 *
 * cioè una scala in cui il TA sale, scende e risale. Un ago fermo a 520 avrebbe letto TA ≈ 4,5
 * invece di ≈ 2,1. E veniva accettata IN SILENZIO, perché il solo controllo era che i grezzi
 * fossero distinti — e lo erano. Una taratura sbagliata in silenzio è peggio di nessuna
 * taratura: il numero c'è, sembra buono, e mente per tutta la seduta.
 *
 * ── MONOTONO, NON « CRESCENTE » ────────────────────────────────────────────────────────────
 * Il verso dell'apparecchio non si dà per scontato: `taFromRaw` regge anche un meter in cui il
 * grezzo CALA al crescere della resistenza (c'è un test che lo pretende). Quel che è impossibile
 * non è « scendere »: è scendere DOPO essere salito. Si prende quindi il verso dalla MAGGIORANZA
 * dei passi e si segnala il punto che va controcorrente — così un solo punto sbagliato viene
 * indicato per quel che è, invece di far sembrare rotto tutto il resto.
 *
 * Restituisce il punto fuori ordine, o null se la serie è coerente.
 */
export const findNonMonotonic = (points: ThetaTaPoint[]): ThetaTaPoint | null => {
  const validi = points.filter(p => Number.isFinite(p.raw) && Number.isFinite(p.ta));
  if (validi.length < 2) return null;

  // Si ordina per TA — che è il dato CERTO (è inciso sull'artefatto). Ordinare per grezzo, come
  // fa `buildTaScale`, è proprio ciò che maschera il problema: qualunque serie diventa
  // « ordinata » se la si riordina.
  const perTa = [...validi].sort((a, b) => a.ta - b.ta);

  let su = 0, giu = 0;
  for (let i = 1; i < perTa.length; i++) {
    const d = perTa[i].raw - perTa[i - 1].raw;
    if (d > 0) su++; else if (d < 0) giu++;
  }
  // Nessun dislivello, o tanti su quanti giù con due soli punti: non c'è una maggioranza da cui
  // dedurre il verso. I casi degeneri (grezzi uguali) li prende già `buildTaScale`.
  if (su === 0 && giu === 0) return null;
  const versoSu = su >= giu;

  for (let i = 1; i < perTa.length; i++) {
    const d = perTa[i].raw - perTa[i - 1].raw;
    if (versoSu ? d <= 0 : d >= 0) return perTa[i];
  }
  return null;
};

/**
 * Costruisce la scala dai punti raccolti. Restituisce null se:
 *   • sono troppo pochi;
 *   • due punti hanno lo stesso grezzo (indeterminato: due TA diversi, una lettura sola);
 *   • la serie non è monotona (vedi `findNonMonotonic` — misura da rifare, non da salvare).
 */
export const buildTaScale = (points: ThetaTaPoint[], madeAt: number): ThetaTaScale | null => {
  const validi = points.filter(p => Number.isFinite(p.raw) && Number.isFinite(p.ta));
  if (validi.length < MIN_TA_POINTS) return null;
  if (findNonMonotonic(validi)) return null;

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
export const taFromRaw = (raw: number, scale: ThetaTaScale): number =>
  clampTa(taFromRawUnclamped(raw, scale));

/** Limita al fondo scala del meter. Fuori da lì il numero non significa più nulla. */
export const clampTa = (ta: number): number => Math.max(TA_MIN, Math.min(TA_MAX, ta));

const taFromRawUnclamped = (raw: number, scale: ThetaTaScale): number => {
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

/** La taratura di fabbrica, sempre disponibile. */
export const factoryTaScale = (): ThetaTaScale | null => buildTaScale(FACTORY_TA_POINTS, 0);

/**
 * La taratura in uso: quella misurata su QUESTA macchina se c'è, altrimenti quella di fabbrica.
 * Non restituisce più null quando localStorage è vuoto — era il motivo per cui su un computer
 * diverso da quello dell'artefatto non compariva alcun TA.
 */
export const loadTaScale = (): ThetaTaScale | null => {
  try {
    const s = localStorage.getItem(CHIAVE);
    if (!s) return factoryTaScale();
    const o = JSON.parse(s) as ThetaTaScale;
    // Si ricostruisce invece di fidarsi: un file scritto a mano, o di una versione precedente,
    // non deve poter produrre una scala non ordinata o con punti doppi.
    const propria = Array.isArray(o?.points) ? buildTaScale(o.points, o.madeAt ?? 0) : null;
    return propria ?? factoryTaScale();
  } catch (_) { return factoryTaScale(); }
};

/**
 * ⚠️ RIMOSSI (segnalato: « togliere la parte di gestione con l'artefatto ») — `clearTaScale`
 * e `isFactoryScale` stavano qui. Erano usati SOLO da `ThetaTaCalibration.tsx` (il pannello
 * dei 4 pulsanti dell'artefatto fisico, tolto) e dal suo test — con `FACTORY_TA_POINTS` come
 * unica taratura possibile, non c'è più una "propria" da cancellare né da distinguere.
 */
