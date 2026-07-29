/**
 * THETA — ASSETTO dell'apparecchio: configurazione degli elettrodi e sensibilità dell'ago.
 *
 * Distinto dalla scala del TA (`thetaTaScale.ts`), e per un motivo preciso:
 *
 *   · la SCALA DEL TA si tara **una volta sola con l'artefatto** e vale per chiunque — è una
 *     proprietà dello strumento, non della persona;
 *   · l'ASSETTO qui dipende invece da COME si audita: due lattine (una per mano) oppure, in
 *     SOLO AUDITING, una lattina sola composta da due mezze lattine. La geometria degli
 *     elettrodi cambia la resistenza, quindi lo stesso preclear legge un TA diverso nelle due
 *     configurazioni. Si misura la DIFFERENZA una volta e la si applica.
 *
 * ── LA SENSIBILITÀ SI MISURA, NON SI INDOVINA ──────────────────────────────────────────────
 * La procedura standard del Theta-Meter dà un riferimento oggettivo, in DUE prove distinte:
 *
 *   1. **PROVA DELLA STRETTA** — stringendo le lattine l'ago deve cadere di **un terzo di
 *      quadrante**. È QUESTA che fissa la sensibilità (sul Theta-Meter è la manopola apposita).
 *   2. **TEST DEL RESPIRO** — poi, respirando a fondo e rilasciando, l'ago deve cadere almeno
 *      un minimo. È una VERIFICA che la persona reagisca, non una taratura.
 *
 * Senza questo riferimento la sensibilità era un numero scelto a tavolino, e il primo valore
 * era cinque volte troppo alto: tutto sbatteva contro i bordi.
 */

/** Come sono disposti gli elettrodi. */
export type ElectrodeConfig = 'two-cans' | 'solo-can';

/** Caduta attesa dell'ago sulla PROVA DELLA STRETTA: un terzo di quadrante. */
export const SQUEEZE_TARGET_OFFSET = 1 / 3;
/** Caduta MINIMA attesa sul test del respiro. Sotto questa la persona non sta reagendo (o gli
 *  elettrodi fanno contatto male): è una verifica, non una taratura. */
export const BREATH_MIN_OFFSET = 0.08;

export interface ThetaSetup {
  /** Configurazione in uso. */
  config: ElectrodeConfig;
  /** TA(due lattine) − TA(lattina solo) per la STESSA persona. Si somma alla lettura in
   *  configurazione solo, per riportarla al riferimento delle due lattine. 0 = non misurato. */
  soloOffsetTa: number;
  /** Unità grezze → offset del quadrante. Ricavata dalla PROVA DELLA STRETTA. */
  needleScale: number;
}

/** Assetto di partenza, con la sensibilità di ripiego finché la stretta non l'ha misurata. */
export const defaultSetup = (fallbackScale: number): ThetaSetup => ({
  config: 'two-cans',
  soloOffsetTa: 0,
  needleScale: fallbackScale,
});

/**
 * Sensibilità dalla PROVA DELLA STRETTA.
 *
 * `deviazioneGrezza` = di quanto la lettura si è scostata dal braccio al culmine della caduta
 * provocata dalla stretta. Si vuole che QUELLA valga un terzo di quadrante:
 *
 *     scala = (1/3) / deviazione
 *
 * Restituisce null se la deviazione è nulla o assurda: meglio tenere la sensibilità che c'è
 * che azzerare l'ago o mandarlo fuori scala per una misura sbagliata.
 */
export const scaleFromSqueeze = (deviazioneGrezza: number): number | null => {
  const d = Math.abs(deviazioneGrezza);
  if (!Number.isFinite(d) || d < 1) return null;
  const scala = SQUEEZE_TARGET_OFFSET / d;
  return Number.isFinite(scala) && scala > 0 ? scala : null;
};

/** Il respiro ha prodotto una caduta sufficiente? Verifica, non taratura. */
export const breathIsValid = (deviazioneGrezza: number, scale: number): boolean =>
  Math.abs(deviazioneGrezza) * scale >= BREATH_MIN_OFFSET;

/**
 * Scarto di TA fra le due configurazioni, misurato sulla stessa persona a breve distanza.
 * Si sottrae la lettura in solo da quella a due lattine: sommando il risultato alle letture
 * in solo, le due configurazioni tornano confrontabili.
 */
export const soloOffsetFrom = (taDueLattine: number, taLattinaSolo: number): number =>
  taDueLattine - taLattinaSolo;

/** Applica l'assetto a una lettura di TA. */
export const taWithSetup = (ta: number, setup: ThetaSetup): number =>
  setup.config === 'solo-can' ? ta + setup.soloOffsetTa : ta;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENZA — l'assetto è dello strumento e del modo di auditare, non della persona
// ═══════════════════════════════════════════════════════════════════════════════════════════

const CHIAVE = 'sm_theta_setup';

export const saveSetup = (s: ThetaSetup): void => {
  try { localStorage.setItem(CHIAVE, JSON.stringify(s)); } catch (_) { /* quota o modalità privata */ }
};

export const loadSetup = (fallbackScale: number): ThetaSetup => {
  try {
    const s = localStorage.getItem(CHIAVE);
    if (!s) return defaultSetup(fallbackScale);
    const o = JSON.parse(s) as Partial<ThetaSetup>;
    // Si ricostruisce campo per campo invece di fidarsi: un valore fuori posto qui
    // manderebbe l'ago fuori scala o lo bloccherebbe fermo, e non sarebbe ovvio perché.
    return {
      config: o.config === 'solo-can' ? 'solo-can' : 'two-cans',
      soloOffsetTa: Number.isFinite(o.soloOffsetTa) ? (o.soloOffsetTa as number) : 0,
      needleScale: Number.isFinite(o.needleScale) && (o.needleScale as number) > 0
        ? (o.needleScale as number) : fallbackScale,
    };
  } catch (_) { return defaultSetup(fallbackScale); }
};
