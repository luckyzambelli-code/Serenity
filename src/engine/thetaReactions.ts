/**
 * THETA-REACTIONS — classifica le reazioni sull'ago delle BOÎTES.
 *
 * ── PERCHÉ SERVE ────────────────────────────────────────────────────────────────────────────
 * ASSESSMENT e i cicli prendono le letture dal classificatore EEG. Col solo meter non arriva
 * nulla, quindi ogni item risultava NULL mentre l'ago si muoveva sotto gli occhi dell'auditor —
 * segnalato in seduta. Qui le reazioni si leggono dall'ago VERO, che è il modo classico.
 *
 * ── IL MODELLO: un EPISODIO, non un campione ───────────────────────────────────────────────
 * Una reazione non è un valore istantaneo: è un movimento che parte, arriva a un culmine e
 * rientra. Classificare campione per campione produrrebbe una raffica di letture per una sola
 * caduta. Si segue quindi l'episodio: si apre quando l'ago esce dalla banda di riposo, si tiene
 * il PICCO, e si emette UNA reazione quando rientra — quella del picco.
 *
 * Le ampiezze sono le stesse con cui il quadrante disegna le reazioni (`reactionKeyToOffset` in
 * QuantumSphere): la lettura scritta corrisponde così a ciò che si è visto.
 *
 * ── COSA QUESTO NON FA ──────────────────────────────────────────────────────────────────────
 * Non riconosce il FLOATING NEEDLE. Un F/N è uno spazzare ritmico, lento e uniforme, non
 * un'ampiezza: va riconosciuto dalla FORMA nel tempo, ed è un rilevatore a parte. Finché non
 * c'è, con le sole boîtes non si dichiara nessun F/N — meglio tacere che dichiararne uno falso,
 * visto che l'F/N è l'indicatore di AS-IS.
 *
 * Puro TS, nessuna dipendenza: si alimenta con la deviazione dell'ago e il tempo.
 */
import {
  THETA_REACT_TICK, THETA_REACT_SF, THETA_REACT_FALL,
  THETA_REACT_LONG_FALL, THETA_REACT_BLOW_DOWN, THETA_EPISODE_RELEASE,
} from './tuning';

/** Le chiavi di reazione, identiche a quelle usate dal resto dell'applicazione. */
export type ThetaReactionKey =
  | 'reaction_tick' | 'reaction_sf' | 'reaction_fall'
  | 'reaction_long_fall' | 'reaction_blow_down';

/** Una reazione riconosciuta. */
export interface ThetaReaction {
  key: ThetaReactionKey;
  /** Ampiezza del picco, in unità di quadrante rispetto a SET. */
  peak: number;
  /** Quando è cominciato il movimento (s dall'inizio seduta) — è QUESTO l'istante della
   *  reazione, non quello in cui rientra: una caduta si attribuisce a quando parte. */
  startedAtSec: number;
  /** Quanto è durato l'episodio (s). */
  durationSec: number;
}

/**
 * Ampiezza → reazione. Le soglie sono le ampiezze con cui il quadrante DISEGNA ciascuna
 * reazione, così la lettura scritta corrisponde a quello che si è visto muoversi.
 */
export const classifyAmplitude = (peak: number): ThetaReactionKey | null => {
  const a = Math.abs(peak);
  if (a >= THETA_REACT_BLOW_DOWN) return 'reaction_blow_down';
  if (a >= THETA_REACT_LONG_FALL) return 'reaction_long_fall';
  if (a >= THETA_REACT_FALL)      return 'reaction_fall';
  if (a >= THETA_REACT_SF)        return 'reaction_sf';
  if (a >= THETA_REACT_TICK)      return 'reaction_tick';
  return null;                     // sotto il tick: rumore, non una lettura
};

/**
 * Segue l'ago e riconosce gli episodi.
 *
 * Si alimenta con la deviazione RISPETTO A SET (positiva = caduta a destra) e il tempo in
 * secondi. Restituisce una reazione SOLO nel momento in cui l'episodio si chiude.
 */
export class ThetaReactionTracker {
  /** Episodio in corso, se ce n'è uno. */
  private open: { startedAtSec: number; peak: number } | null = null;

  /**
   * @param dev  deviazione dell'ago rispetto a SET, in unità di quadrante
   * @param nowSec  tempo di seduta
   * @param bodyMotion  la persona si sta muovendo: nessuna lettura è attribuibile
   */
  push(dev: number, nowSec: number, bodyMotion = false): ThetaReaction | null {
    // Movimento corporeo: si ABBANDONA l'episodio in corso invece di chiuderlo. Una stretta
    // delle boîtes produce una deviazione ampia che non è carica, e chiuderla la scriverebbe
    // nel journal come un blowdown.
    if (bodyMotion) { this.open = null; return null; }

    const a = Math.abs(dev);

    if (this.open) {
      if (a > this.open.peak) this.open.peak = a;
      // Rientrato nella banda di riposo → l'episodio è finito: si emette il PICCO.
      if (a <= THETA_EPISODE_RELEASE) {
        const ep = this.open;
        this.open = null;
        const key = classifyAmplitude(ep.peak);
        return key ? { key, peak: ep.peak, startedAtSec: ep.startedAtSec,
                       durationSec: Math.max(0, nowSec - ep.startedAtSec) } : null;
      }
      return null;
    }

    // Nessun episodio: si apre appena l'ago supera la soglia più bassa.
    if (a >= THETA_REACT_TICK) this.open = { startedAtSec: nowSec, peak: a };
    return null;
  }

  /** C'è un movimento in corso? Serve a non attribuire un item a un'oscillazione già iniziata. */
  get inEpisode(): boolean { return this.open !== null; }

  reset(): void { this.open = null; }
}
