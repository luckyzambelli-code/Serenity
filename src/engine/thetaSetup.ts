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
 *     configurazioni.
 *
 * ── LO SCARTO SI MISURA CONTRO IL METER VERO, AFFIANCATI ───────────────────────────────────
 * Il programma Theta-Meter e EQUILIBRIUM possono leggere il dispositivo **nello stesso momento**
 * (HID si legge da più clienti; l'esclusiva di libusb che temevo non c'è). Si guardano quindi i
 * due quadranti affiancati e si registra il valore del meter vero: da lì esce la correzione,
 * senza procedure a due passaggi né conti a mano.
 *
 * Lo scarto è PER CONFIGURAZIONE: due lattine e lattina solo ne hanno uno ciascuna.
 *
 * ── LA SENSIBILITÀ È PER SEDUTA, NON PER SEMPRE ────────────────────────────────────────────
 * ⚠️ Le due prove vanno rifatte **PRIMA DI OGNI SEDUTA**: servono a stabilire come QUEL
 * preclear tiene le lattine, e da lì la sensibilità. Non è quindi una configurazione valida per
 * tutti, e infatti la sensibilità **NON viene salvata**: ogni avvio riparte da non impostata.
 * (In prima stesura la salvavo insieme al resto — sbagliato: la sensibilità di ieri applicata
 * a un altro preclear darebbe letture false senza che nulla lo segnali.)
 *
 *   1. **PROVA DELLA STRETTA** — stringendo le lattine l'ago deve cadere di **un terzo di
 *      quadrante**. È QUESTA che fissa la sensibilità (sul Theta-Meter è la manopola apposita).
 *   2. **TEST DEL RESPIRO** — poi, respirando a fondo e rilasciando, l'ago deve cadere almeno
 *      un minimo. È una VERIFICA che la persona reagisca, non una taratura.
 *
 * La SCALA DEL TA invece sì: si tara una volta con l'artefatto e resta per chiunque.
 */

/** Come sono disposti gli elettrodi. */
export type ElectrodeConfig = 'two-cans' | 'solo-can';

/** Caduta attesa dell'ago sulla PROVA DELLA STRETTA: un terzo della CORSA DI CADUTA, cioè del
 *  tratto da SET al bordo destro.
 *
 *  Storia di questo numero, perché non se ne rifaccia il giro: preso prima per 1/3 dell'asse
 *  (0,333) l'ago si muoveva MENO del Theta-Meter; portato a 1/3 della larghezza dell'asse
 *  intero (0,667) si muoveva TROPPO. Il riferimento giusto è la corsa che l'ago compie davvero
 *  quando cade — da SET (−0,35) al bordo — che vale 1,35.
 *
 *  Resta comunque un punto di PARTENZA: la sensibilità si regola poi a mano, come la manopola
 *  del Theta-Meter, perché dipende dalla persona e dalla presa. */
export const SQUEEZE_TARGET_OFFSET = (1 - (-0.35)) / 3;

/** Di quanto si muove la sensibilità a ogni scatto della manopola. Un quarto per scatto: si
 *  arriva in fretta senza saltare il punto giusto. */
export const SENSITIVITY_STEP = 1.25;
/** Caduta MINIMA attesa sul test del respiro. Sotto questa la persona non sta reagendo (o gli
 *  elettrodi fanno contatto male): è una verifica, non una taratura. */
export const BREATH_MIN_OFFSET = 0.08;

export interface ThetaSetup {
  /** Configurazione in uso. */
  config: ElectrodeConfig;
  /** Correzione da sommare alla nostra lettura, PER CONFIGURAZIONE, per farla coincidere con
   *  quella del meter vero. 0 = non misurata. */
  offsets: Record<ElectrodeConfig, number>;
  /** Unità grezze → offset del quadrante, dalla PROVA DELLA STRETTA.
   *  ⚠️ NON persistita: vale per la seduta in corso. Vedi la nota in testa. */
  needleScale: number;
  /** false finché la stretta non l'ha misurata in QUESTA seduta. */
  scaleMeasured: boolean;
}

/** Assetto di partenza, con la sensibilità di ripiego finché la stretta non l'ha misurata. */
export const defaultSetup = (fallbackScale: number): ThetaSetup => ({
  config: 'two-cans',
  offsets: { 'two-cans': 0, 'solo-can': 0 },
  needleScale: fallbackScale,
  scaleMeasured: false,
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

/** Un colpo di manopola: `verso` +1 alza la sensibilità, −1 la abbassa. */
export const adjustSensitivity = (scale: number, verso: 1 | -1): number =>
  verso > 0 ? scale * SENSITIVITY_STEP : scale / SENSITIVITY_STEP;

/** Il respiro ha prodotto una caduta sufficiente? Verifica, non taratura. */
export const breathIsValid = (deviazioneGrezza: number, scale: number): boolean =>
  Math.abs(deviazioneGrezza) * scale >= BREATH_MIN_OFFSET;

/**
 * Correzione ricavata dal confronto affiancato: quanto va sommato alla NOSTRA lettura perché
 * coincida con quella del meter vero.
 */
export const offsetFromReference = (taRiferimento: number, taNostro: number): number =>
  taRiferimento - taNostro;

/** Applica la correzione della configurazione in uso. */
export const taWithSetup = (ta: number, setup: ThetaSetup): number =>
  ta + (setup.offsets?.[setup.config] ?? 0);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENZA — l'assetto è dello strumento e del modo di auditare, non della persona
// ═══════════════════════════════════════════════════════════════════════════════════════════

const CHIAVE = 'sm_theta_setup';

/** Si salva SOLO ciò che vale per tutti. La sensibilità no: è della seduta. */
export const saveSetup = (s: ThetaSetup): void => {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ config: s.config, offsets: s.offsets }));
  } catch (_) { /* quota o modalità privata */ }
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
      offsets: {
        'two-cans': Number.isFinite(o.offsets?.['two-cans']) ? o.offsets!['two-cans'] : 0,
        'solo-can': Number.isFinite(o.offsets?.['solo-can']) ? o.offsets!['solo-can'] : 0,
      },
      // La sensibilità riparte SEMPRE da non misurata: va rifatta prima di ogni seduta.
      needleScale: fallbackScale,
      scaleMeasured: false,
    };
  } catch (_) { return defaultSetup(fallbackScale); }
};
