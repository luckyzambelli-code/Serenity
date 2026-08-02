/**
 * THETA-FLOAT — riconosce il FLOATING NEEDLE sull'ago VERO delle boîtes.
 *
 * ── PERCHÉ È UN MODULO A PARTE ──────────────────────────────────────────────────────────────
 * `thetaReactions` classifica le AMPIEZZE: tick, small fall, fall, long fall, blowdown. L'F/N non
 * è un'ampiezza — è una FORMA NEL TEMPO. Un ago che spazza avanti e indietro di mezzo quadrante
 * darebbe, letto per ampiezze, una raffica di « fall »: e un fall non è un F/N, è il suo
 * contrario. Serve quindi guardare la storia, non l'istante.
 *
 * ── LA FORMA ────────────────────────────────────────────────────────────────────────────────
 * Ron la descrive così: l'ago spazza avanti e indietro, libero, ritmicamente, attorno a uno
 * stesso punto. Quattro cose, e tutte e quattro necessarie:
 *   1. INVERSIONI ripetute (almeno tre mezze spazzate: destra, ritorno, e di nuovo);
 *   2. AMPIEZZA sufficiente e SIMILE fra una spazzata e l'altra;
 *   3. RITMO — mezze spazzate di durata paragonabile;
 *   4. CENTRO STABILE — galleggia, non scivola.
 * Una caduta ha inversioni (scende e rientra) ma non si ripete. Una deriva ha un centro che
 * scivola. Un corpo che si agita ha ampiezze e tempi sparsi. Tolta una qualunque delle quattro,
 * il rilevatore direbbe F/N su qualcosa che non lo è.
 *
 * ── E IL MOVIMENTO DEL CORPO? ───────────────────────────────────────────────────────────────
 * Il rilevatore di agitazione (`thetaNeedle`) scatta quando l'ago spazza più di 0,5 unità in
 * 2 s — che è ESATTAMENTE la forma di un F/N ampio. Vietare l'F/N quando quel segnale è alto
 * renderebbe invisibili proprio gli F/N più larghi, cioè i più inequivocabili. Qui quindi il
 * movimento NON è un veto: è un dato che si RIPORTA (`motion`), e chi legge decide. Il
 * discriminante vero è la regolarità, perché un corpo che si muove è irregolare.
 *
 * ── A COSA SERVE ────────────────────────────────────────────────────────────────────────────
 * A confrontare l'F/N dell'ago vero con quello dell'EEG: dove concordano e dove no. È la prova
 * di falsificabilità dell'AS-IS — un AS-IS dichiarato dall'EEG e smentito dall'ago vero (o
 * viceversa) è esattamente il caso che insegna qualcosa. Da qui esce, poi, il modello dell'ago
 * del Muse su quello del Meter.
 *
 * Puro TS: si alimenta con la deviazione dell'ago e il tempo. Le soglie stanno in tuning.ts e
 * SONO DA TARARE sui video, come i profili del generatore F/N.
 */
import {
  THETA_FN_MIN_SWEEP, THETA_FN_MIN_SWEEPS, THETA_FN_HALF_MIN_S, THETA_FN_HALF_MAX_S,
  THETA_FN_AMP_SPREAD, THETA_FN_PERIOD_SPREAD, THETA_FN_CENTRE_DRIFT,
  THETA_FN_WINDOW_S, THETA_FN_SILENCE_MULT, THETA_FN_SILENCE_MIN_S, THETA_FN_TURN_HYST,
} from './tuning';

/** Una mezza spazzata: da un punto di svolta al successivo. */
interface Sweep {
  /** Ampiezza percorsa (unità di quadrante, sempre positiva). */
  amp: number;
  /** Durata (s). */
  dur: number;
  /** Punto di arrivo, per misurare la deriva del centro. */
  at: number;
  /** Quando è finita (s di seduta). */
  endedAtSec: number;
}

/** Stato dell'F/N sull'ago vero. */
export interface ThetaFloatState {
  /** L'ago sta galleggiando ADESSO. */
  fn: boolean;
  /** Da quando (s di seduta); null se non galleggia. */
  sinceSec: number | null;
  /** Ampiezza media delle spazzate: un F/N ampio non è come uno stretto. */
  widthAvg: number;
  /** Periodo medio di una spazzata intera (s). */
  periodSec: number;
  /** Il corpo si muoveva: l'F/N è da guardare con sospetto — riportato, non vietato. */
  motion: boolean;
}

const spread = (xs: number[]): number => {
  const min = Math.min(...xs), max = Math.max(...xs);
  return min > 0 ? max / min : Infinity;
};

/**
 * Segue l'ago e dice se galleggia.
 *
 * Non emette « eventi »: mantiene uno STATO, perché un F/N dura — è una condizione, non un
 * colpo. Chi lo usa guarda il fronte di salita di `fn` se vuole l'istante in cui è comparso.
 */
export class ThetaFloatDetector {
  /** Ultimo punto di svolta: valore e quando. */
  private turn: { at: number; sec: number } | null = null;
  /** Estremo raggiunto dall'ultima svolta, e in che direzione si stava andando. */
  private extreme = 0;
  private dir: 0 | 1 | -1 = 0;
  private sweeps: Sweep[] = [];
  private since: number | null = null;
  private motionSeen = false;

  /**
   * @param dev deviazione dell'ago rispetto a SET, unità di quadrante
   * @param nowSec tempo di seduta
   * @param bodyMotion il rilevatore di agitazione è alto (riportato, non usato come veto)
   */
  push(dev: number, nowSec: number, bodyMotion = false): ThetaFloatState {
    if (this.turn === null) {
      this.turn = { at: dev, sec: nowSec };
      this.extreme = dev;
      return this.state();
    }

    // Si segue l'estremo nella direzione DI MARCIA; quando l'ago torna indietro di più
    // dell'isteresi, quell'estremo era un punto di SVOLTA e la mezza spazzata si chiude.
    if (this.dir === 0) {
      // Direzione ancora ignota: la si prende dal primo spostamento vero. Senza questo passo
      // l'estremo seguirebbe l'ago in ENTRAMBI i versi e non si chiuderebbe mai una spazzata.
      const passo = dev - this.turn.at;
      if (Math.abs(passo) >= THETA_FN_TURN_HYST) this.dir = passo > 0 ? 1 : -1;
      this.extreme = dev;
    } else {
      const avanti = this.dir === 1 ? dev > this.extreme : dev < this.extreme;
      if (avanti) {
        this.extreme = dev;
      } else if (Math.abs(dev - this.extreme) >= THETA_FN_TURN_HYST) {
        this.sweeps.push({
          amp: Math.abs(this.extreme - this.turn.at),
          dur: nowSec - this.turn.sec,
          at: this.extreme,
          endedAtSec: nowSec,
        });
        if (this.sweeps.length > 12) this.sweeps.shift();
        this.turn = { at: this.extreme, sec: nowSec };
        this.dir = this.dir === 1 ? -1 : 1;
        this.extreme = dev;
        if (bodyMotion) this.motionSeen = true;
      }
    }

    // Spazzate troppo vecchie: un F/N di venti secondi fa non dice niente su adesso.
    this.sweeps = this.sweeps.filter(s => s.endedAtSec >= nowSec - THETA_FN_WINDOW_S);

    return this.valuta(nowSec, bodyMotion);
  }

  private valuta(nowSec: number, bodyMotion: boolean): ThetaFloatState {
    const recenti = this.sweeps.filter(s => s.endedAtSec >= nowSec - THETA_FN_WINDOW_S);

    // ── PRIMA DI TUTTO: l'ago sta ancora spazzando? ─────────────────────────────────────────
    // Va guardato PRIMA di riqualificare, non dopo. Con la finestra a 15 s le spazzate di un
    // float finito ci restano dentro a lungo, la qualifica continua a riuscire e l'F/N non si
    // spegneva più — l'ago fermo da sei secondi risultava ancora « in F/N ».
    if (this.since !== null && this.silenzio(recenti, nowSec)) {
      this.since = null;
      this.motionSeen = false;
      return this.state(recenti);
    }

    // ── E il CENTRO? ────────────────────────────────────────────────────────────────────────
    // Si misura sulla finestra INTERA, non sulla corsa scelta: « l'ago sta andando da qualche
    // parte » è una proprietà di tutto il tratto. Cercandola solo dentro la corsa, una deriva
    // lunga si nascondeva scegliendo tre spazzate che, prese da sole, derivano poco.
    const prova = this.centroStabile(recenti) ? this.miglioreCorsa(recenti) : null;

    if (prova) {
      if (this.since === null) {
        // L'F/N è cominciato quando è partita la PRIMA delle spazzate che lo dimostrano, non
        // adesso: il riconoscimento arriva per forza dopo la terza spazzata, e datarlo qui
        // sposterebbe l'F/N di qualche secondo — proprio la grandezza che vogliamo misurare.
        this.since = prova[0].endedAtSec - prova[0].dur;
        this.motionSeen = bodyMotion;
      }
      if (bodyMotion) this.motionSeen = true;
    }
    return this.state(recenti);
  }

  /** L'ago ha smesso di spazzare? Il tempo concesso segue il RITMO osservato, non un valore
   *  fisso: su un F/N rapido due mezze spazzate sono pochi decimi, su uno lento sono otto
   *  secondi, e una soglia unica sbaglierebbe da una parte o dall'altra. */
  private silenzio(recenti: Sweep[], nowSec: number): boolean {
    if (!recenti.length) return true;
    const ultima = recenti[recenti.length - 1];
    const media = recenti.reduce((a, s) => a + s.dur, 0) / recenti.length;
    const concesso = Math.max(THETA_FN_SILENCE_MIN_S, media * THETA_FN_SILENCE_MULT);
    return nowSec - ultima.endedAtSec > concesso;
  }

  /**
   * La più lunga CORSA di spazzate CONSECUTIVE che qualifica come F/N, o null.
   *
   * Non si chiede che TUTTA la finestra sia regolare: un F/N è preceduto dal movimento con cui
   * l'ago ci arriva, e quello non è il float. Misurato sull'INSTANT F/N del video: dieci mezze
   * spazzate da 0,13–0,29 precedute da una da 0,98 (l'ingresso) — chiedendo la regolarità
   * sull'insieme il rapporto saliva a 7,6 e il float spariva; sulle dieci vale 2,3.
   *
   * Si cerca dalla corsa PIÙ LUNGA che finisce sull'ultima spazzata: il float è ciò che sta
   * accadendo ADESSO, non un tratto regolare di dieci secondi fa.
   */
  private miglioreCorsa(sw: Sweep[]): Sweep[] | null {
    for (let da = 0; da <= sw.length - THETA_FN_MIN_SWEEPS; da++) {
      const corsa = sw.slice(da);
      if (this.qualifica(corsa)) return corsa;
    }
    return null;
  }

  /** Le quattro condizioni. Basta che una manchi e non è un F/N. */
  private qualifica(sw: Sweep[]): boolean {
    if (sw.length < THETA_FN_MIN_SWEEPS) return false;
    const amps = sw.map(s => s.amp);
    const durs = sw.map(s => s.dur);
    if (Math.min(...amps) < THETA_FN_MIN_SWEEP) return false;
    if (durs.some(d => d < THETA_FN_HALF_MIN_S || d > THETA_FN_HALF_MAX_S)) return false;
    if (spread(amps) > THETA_FN_AMP_SPREAD) return false;
    return spread(durs) <= THETA_FN_PERIOD_SPREAD;
  }

  /** Il CENTRO dello spazzare sta fermo? Un F/N galleggia attorno a uno stesso punto; se il
   *  centro scivola, l'ago sta andando da qualche parte — è una caduta lenta o una salita.
   *  Si valuta sulla finestra intera: vedi `valuta`. */
  private centroStabile(sw: Sweep[]): boolean {
    if (sw.length < THETA_FN_MIN_SWEEPS) return false;
    // Il centro di una spazzata è il punto MEDIO fra due svolte consecutive: prendere la media
    // dei punti di svolta non basta, perché si alternano in alto e in basso e su una manciata
    // di spazzate quell'alternanza copre la deriva. Misurato: un centro che scivolava di 0,18
    // per spazzata passava per « stabile ».
    const centri: number[] = [];
    for (let i = 0; i + 1 < sw.length; i++) centri.push((sw[i].at + sw[i + 1].at) / 2);
    if (centri.length < 2) return true;      // con due sole spazzate non c'è deriva da misurare
    // PER SPAZZATA: un limite totale dipenderebbe da quante ne sono entrate nella finestra.
    const perSpazzata = Math.abs(centri[centri.length - 1] - centri[0]) / (centri.length - 1);
    return perSpazzata <= THETA_FN_CENTRE_DRIFT;
  }

  private state(sw: Sweep[] = this.sweeps): ThetaFloatState {
    const fn = this.since !== null;
    const amps = sw.map(s => s.amp);
    const durs = sw.map(s => s.dur);
    return {
      fn,
      sinceSec: this.since,
      widthAvg: amps.length ? amps.reduce((a, b) => a + b, 0) / amps.length : 0,
      // Un periodo INTERO sono due mezze spazzate: andata e ritorno.
      periodSec: durs.length ? (durs.reduce((a, b) => a + b, 0) / durs.length) * 2 : 0,
      motion: fn ? this.motionSeen : false,
    };
  }

  reset(): void {
    this.turn = null; this.extreme = 0; this.dir = 0;
    this.sweeps = []; this.since = null; this.motionSeen = false;
  }
}
