/**
 * QUALI MODULI HANNO SENSO, secondo gli strumenti collegati.
 *
 * EQUILIBRIUM può girare con il MUSE, con il THETA-METER, o con tutti e due. Ogni modulo vive
 * di una sorgente precisa, e mostrarne uno che non ce l'ha è peggio che nasconderlo: resta
 * fermo o vuoto, e chi guarda non sa se è rotto o se non ha dati.
 *
 *   health     EEG · giroscopio · PPG · qualità del segnale   → SOLO Muse
 *   biometric  integrità, da EEG + PPG                        → SOLO Muse
 *   mna        I_m dalle bande β/γ/θ                          → SOLO Muse
 *   journal    la voce                                        → indipendente
 *   cam1/cam2  le camere                                      → indipendenti
 *   ri         ASSESSMENT: vive delle LETTURE dell'ago        → indipendente dagli strumenti
 *              in sé, ma senza sorgente di letture resta muto (vedi la nota sotto)
 *
 * ⚠️ NOTA sul caso « solo Theta-Meter »: nascondere i moduli senza sorgente è una cosa; far
 * FUNZIONARE assessment e cicli con le sole boîtes è un'altra, e richiede di classificare le
 * reazioni sull'ago vero — caduta, caduta lunga, blowdown, F/N. Non è un interruttore, è un
 * motore, e non è qui.
 *
 * Puro TS: si decide QUALI moduli, non si tocca nulla.
 */

/** Cosa è collegato in questo momento. */
export interface Instruments {
  muse: boolean;
  theta: boolean;
}

/** I moduli che dipendono dall'EEG e non hanno senso senza Muse. */
export const MUSE_ONLY_MODULES = ['health', 'biometric', 'mna'] as const;
export type MuseOnlyModule = (typeof MUSE_ONLY_MODULES)[number];

/**
 * Filtra la visibilità scelta dall'utente con quella POSSIBILE.
 *
 * Non si TOCCA la preferenza salvata: si nasconde soltanto ciò che non ha sorgente. Riattaccando
 * il Muse, i moduli tornano come l'utente li aveva lasciati — sovrascrivere le sue scelte perché
 * un cavo è staccato sarebbe un modo silenzioso di perdergliele.
 */
export const effectiveModules = <T extends object>(scelti: T, instruments: Instruments): T => {
  if (instruments.muse) return scelti;
  const out = { ...scelti } as Record<string, unknown>;
  for (const m of MUSE_ONLY_MODULES) {
    if (m in out) out[m] = false;
  }
  return out as T;
};

/** Nessuno strumento collegato: si può preparare la seduta ma non misurare nulla. */
export const noInstruments = (i: Instruments): boolean => !i.muse && !i.theta;

/**
 * Da dove viene il TONE ARM. Le boîtes vincono quando ci sono: è una resistenza MISURATA,
 * mentre quella dell'EEG è una ricostruzione mai validata in assoluto.
 */
export const taSource = (i: Instruments): 'theta' | 'eeg' | 'none' =>
  i.theta ? 'theta' : i.muse ? 'eeg' : 'none';
