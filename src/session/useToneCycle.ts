/**
 * useToneCycle — IL CICLO TONE SCALE, fuori dall'interfaccia.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Primo pezzo del SESSION CONTROLLER (vedi la cartografia SERENITY). Fino a qui lo stato del
 * ciclo TONE e i suoi gesti vivevano dentro `App.tsx`, in mezzo a 8 657 righe che sono per il
 * resto interfaccia. Finché stanno lì, una seconda interfaccia dovrebbe riscriverli — cioè
 * duplicare la procedura di Ron in due posti, che è il modo più sicuro di farli divergere.
 *
 * Qui non c'è JSX e non ci sono decisioni nuove: è LO STESSO CODICE, spostato. I nomi
 * restituiti sono identici a quelli che App.tsx usava, perché il render non doveva cambiare di
 * una riga — è così che l'estrazione si verifica: stessa seduta, stesso giornale.
 *
 * ── COSA NON STA QUI ────────────────────────────────────────────────────────────────────────
 * Il CALCOLO. `toneFromTa`, `toneFromDelta`, `taToTwoCans`, `toneMargin` restano in
 * `src/engine/`, puri e provati da soli. Questo modulo tiene lo STATO del ciclo e l'ordine dei
 * gesti; il resto lo chiede al motore, come faceva App.
 *
 * ⚠️ E non ci sta nemmeno il testo. Le scritte del giornale hanno bisogno della lingua, quindi
 * chi usa il hook passa la sua funzione di traduzione: un controllore di sessione che sapesse
 * di francese e italiano sarebbe di nuovo interfaccia travestita.
 *
 * @see docs/serenity-refonte.md — le fasi della refonte.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TONE_TARGET, toneFromTa, toneFromDelta, reachedTop, ToneLocator,
  type TonePhase, type ToneLocateAnchor, type ToneWitness,
} from '../engine/toneScale';
import { TA_MAX } from '../engine/thetaTaScale';
import { taToTwoCans, toneMargin, withMargin, type PcCanHistory } from '../engine/canTest';
import type { ElectrodeConfig } from '../engine/thetaSetup';

/** Un ciclo TONE concluso, come finisce nel rapporto e nel PDF. */
export interface ToneCycleRecord {
  n: number;
  question: string;
  tStartSec: number;
  tEndSec: number;
  /** Tono di PARTENZA misurato. `null` senza meter. */
  located: number | null;
  /** Quante volte si è dato « porta questo a tono quaranta ». */
  repeats: number;
  /** Da dove viene il tono di partenza. Campo NUOVO (2.0.120): i cicli registrati prima non
   *  ce l'hanno, e restano leggibili. */
  source?: 'meter' | 'meter+eeg' | 'assessed';
  anchor: string;
  witnesses: string[];
  /** Il tono quaranta è stato raggiunto (nome storico del campo). */
  asIs: boolean;
}

/** Quel che il ciclo ha bisogno di sapere dal resto della seduta. */
export interface ToneCycleDeps {
  /** Il TA del BRACCIO — lento, è quello che ancora il ciclo. `null` senza meter. */
  ta: number | null;
  /** Il TA della lettura CORRENTE — è quello che si mostra. `null` senza meter. */
  taNow: number | null;
  /** Come sono tenute le lattine, e lo scarto misurato per la configurazione a una. */
  config: ElectrodeConfig;
  soloOffset: number;
  hasTheta: boolean;
  hasMuse: boolean;
  /** Il sesso del preclear: decide il TA di clear, cioè il tono 40 di questa persona. */
  pcSex?: 'm' | 'f';
  /** Le prove delle lattine di questo preclear — da lì esce il margine. */
  canHistory: PcCanHistory;
  /** La carica EEG in questo istante: il secondo sguardo sulla salita. */
  qL: number;
  /** F/N sull'ago in gioco, e firma energetica dissolta: i due testimoni non di posizione. */
  fnNow: boolean;
  asIsSignature: boolean;
  /** L'item in corso, e il modo di svuotarlo a ciclo chiuso. */
  auditingQuestion: string;
  setAuditingQuestion: (s: string) => void;
  /** Il tempo di seduta, in secondi. */
  nowSec: () => number;
  /** Quante righe ha il giornale adesso — serve a captare solo ciò che si dice DOPO il tasto. */
  logLength: () => number;
  /** Scrive una riga nel giornale. */
  log: (text: string, type: 'normal' | 'success') => void;
  /** « L'item è stato detto » va riazzerato a ogni nuova resistenza. */
  setItemSpoken: (v: boolean) => void;
  /** Resistenza detta a voce → l'assessment si accende da sé, se non gira già. */
  ensureAssessmentOn: () => void;
  /** La traduzione, che il controllore non conosce. */
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function useToneCycle(d: ToneCycleDeps) {
  const [tonePhase, setTonePhase] = useState<TonePhase>('locate');
  /**
   * IL TONO DI PARTENZA — l'origine della scala, e da questa versione è l'origine VERA.
   *
   * Ron: « the relationship between the Tone Scale and ohms is an arbitrary one ». Prima il
   * tono si leggeva in assoluto dal fondo scala del meter: una convenzione dentro l'altra, e
   * quel fondo scala è del Theta-Meter, non della scala del tono. Adesso alla localizzazione si
   * fissa « qui sei a −12 » e da lì si misura la SALITA.
   *
   *   col METER  → lo propone la misura;
   *   senza      → lo dice l'auditor (quel che il preclear dichiara più la sua obnosi).
   *
   * `null` solo prima di localizzare.
   */
  const [toneAtStart, setToneAtStart] = useState<number | null>(null);
  /** Il tono che l'auditor dichiara senza strumenti — la sorgente quando non c'è misura. */
  const [toneAssessed, setToneAssessed] = useState(0);
  /** Le due misure ALL'ISTANTE della localizzazione: da lì si conta il movimento. */
  const toneTaAtStartRef = useRef<number | null>(null);
  const toneQAtStartRef = useRef<number | null>(null);
  /**
   * QUANTE VOLTE SI È DATO IL COMANDO « porta questo a tono quaranta ».
   *
   * Ron: « Command b is asked REPETITIVELY, until there is no reaction and the PC reaches
   * serenity of beingness. » La ripetizione È il processo — non un dettaglio di conduzione.
   * Si azzera alla localizzazione e a ogni reset: è il conto di QUESTA resistenza.
   */
  const [toneRipetizioni, setToneRipetizioni] = useState(0);
  /** Come si è scelto l'istante della localizzazione, e da quanti secondi prima viene. */
  const [toneAnchor, setToneAnchor] = useState<{ how: ToneLocateAnchor; ageS: number } | null>(null);
  const tonePhaseRef = useRef(tonePhase); tonePhaseRef.current = tonePhase;

  /**
   * IL LOCATORE — tiene gli ultimi secondi e, al clic, sceglie l'ISTANTE GIUSTO.
   *
   * ⚠️ UNO PER CICLO, e non più uno per modulo. In App.tsx era una costante di file: una sola
   * istanza per tutta la vita della pagina, condivisa da chiunque. Con due interfacce che
   * possono vivere nello stesso processo, quella scelta diventa un difetto silenzioso — due
   * sedute che si scambiano la finestra di misura. Il locatore appartiene al ciclo.
   */
  const toneLocatorRef = useRef<ToneLocator | null>(null);
  if (toneLocatorRef.current === null) toneLocatorRef.current = new ToneLocator();
  const toneLocator = toneLocatorRef.current;

  /** Premuto col campo VUOTO: si aspetta che la resistenza sia detta a voce. */
  const toneAwaitItemRef = useRef(false);
  const toneLogCursorRef = useRef(0);
  /**
   * Specchio del tono misurato: il gestore del worker EEG si aggancia UNA volta sola e il tono
   * cambia a ogni tick — senza questo il locatore accumulerebbe per sempre il valore d'avvio.
   */
  const toneMeasuredRef = useRef<number | null>(null);
  /**
   * ── BUG TROVATO (segnalato: « con solo MUSE... la scala del tono resta a 0 ») — SPECCHIO
   * DI `d.qL`, per la STESSA ragione di `toneMeasuredRef` appena sopra. `localizzaTone` (più
   * giù) legge `d.qL` dentro un `useCallback` con `eslint-disable-next-line
   * react-hooks/exhaustive-deps` — le sue dipendenze NON includono `d.qL` (di proposito: `qL`
   * cambia molte volte al secondo, mentre le dipendenze elencate cambiano di rado — ricreare
   * la funzione a ogni tick sarebbe stato uno spreco). Ma questo significa che la CLOSURE
   * catturava `d.qL` di QUALUNQUE render l'avesse ricreata l'ultima volta — non
   * necessariamente quello in cui l'auditor preme davvero "Localizza". Con Meter e MUSE
   * insieme il TA (che rientrava nelle dipendenze vere) ricreava la funzione spesso abbastanza
   * da non farlo notare; con SOLO il MUSE, nessuna delle dipendenze elencate cambia più,
   * `localizzaTone` smette di ricrearsi, e `d.qL` catturato resta quello di ORE prima — un
   * riferimento sbagliato con cui ogni delta successivo si confronta, spesso vicino a zero per
   * puro caso. Stesso rimedio di `toneMeasuredRef`: uno specchio sempre aggiornato, letto
   * dentro la callback invece del parametro diretto.
   */
  const qLRef = useRef(0);

  // ── IL TA RIPORTATO ALLE DUE LATTINE ─────────────────────────────────────────────────────
  // « Che fa fede sono le DUE LATTINE ». Con una lattina sola la resistenza è un'altra, e più
  // alta: mostrarla tale e quale farebbe credere a un caso più carico di quel che è.
  //
  // ⚠️ STA PRIMA DEL TONO, e non è un dettaglio di ordinamento: LA SCALA DEL TONO SI TARA SU
  // QUESTO NUMERO. Col TA grezzo, a una lattina tutta la scala era spostata di una divisione.
  const taMostrato = d.taNow === null ? null
    : taToTwoCans(d.taNow, d.config, d.soloOffset);
  /** Lo stesso, sul TA del BRACCIO — è quello che ancora il ciclo (vedi `toneFromDelta`). */
  const taCorretto = d.ta === null ? null
    : taToTwoCans(d.ta, d.config, d.soloOffset).ta;
  /**
   * IL TA DI CLEAR — il tono 40 di QUESTA persona: 3,0 uomo, 2,0 donna.
   *
   * Senza il sesso dichiarato si prende 2,0, il più prudente: parte più in basso, e chi è più
   * pulito ci arriva lo stesso.
   */
  const taClear = d.pcSex === 'm' ? 3.0 : 2.0;
  // Il tono MISURATO. Oggi passa dal TA e non da ohm veri: `toneFromTa` è dichiaratamente una
  // strada provvisoria, ed è per questo che il quadrante scrive « ≈ ».
  const toneMeasured = d.hasTheta && taCorretto !== null
    ? toneFromTa(taCorretto, taClear, TA_MAX) : null;
  const toneHasMeter = toneMeasured !== null;
  toneMeasuredRef.current = toneMeasured;
  qLRef.current = d.qL;

  /**
   * IL MARGINE DELLA PROVA DELLE LATTINE — senza prova di oggi, una divisione in meno.
   *
   * Non è una correzione della misura: è quel che si può SOSTENERE. Vale solo col meter —
   * senza, il tono lo dice l'auditor e il margine sarebbe togliere una divisione al suo
   * giudizio.
   */
  const margineTono = toneHasMeter ? toneMargin(d.canHistory, Date.now()) : 0;
  /**
   * DOVE SI È ADESSO SULLA SCALA.
   *
   * ⚠️ Il margine si toglie OVUNQUE il tono venga da una misura, non solo dopo la
   * localizzazione: vale da quando la misura esiste, non da quando comincia il ciclo.
   *
   * ── PRIORITÀ DELLE FONTI, IL MUSE PRIMA DEL METER — segnalato: « vorrei che la misura sia
   * quella del MUSE se c'è il MUSE, altrimenti quella del Meter, e se non ci sono entrambi,
   * dichiarata ». Il MUSE non ha una scala assoluta propria — `d.qL` è un quoziente di carica
   * 0..1, non tarato su −40…+40 come il TA lo è via `taClear`/`TA_MAX` — quindi può dire SOLO
   * quanto ci si è mossi da un punto noto, mai un numero assoluto suo: la LOCALIZZAZIONE (sopra,
   * `localizzaTone`) resta per forza dal Meter se c'è, dichiarata se non c'è, MAI dal solo MUSE
   * — nessuna riga qui sotto la tocca. Da quel punto in poi, se il MUSE è connesso, guida lui il
   * MOVIMENTO: la STESSA `toneFromDelta` di sempre (era già scritta per « qualunque sorgente »,
   * v. la sua nota in `toneScale.ts` — non una formula nuova, solo promossa da "secondo
   * sguardo" a cursore primario). Il margine delle lattine resta specifico del Theta-Meter: non
   * si applica quando è il MUSE a guidare.
   */
  const toneOraMuse = toneAtStart !== null && toneQAtStartRef.current !== null
    ? toneFromDelta(toneAtStart, toneQAtStartRef.current, d.qL, 1)
    : null;
  const toneOra = d.hasMuse && toneOraMuse !== null
    ? toneOraMuse
    : toneAtStart === null
      ? (toneHasMeter && toneMeasured !== null ? withMargin(toneMeasured, margineTono) : toneAssessed)
      : toneTaAtStartRef.current !== null && taCorretto !== null
        ? withMargin(
            // L'escursione è quella della SCALA DEL TONO — dal TA di clear al fondo scala —,
            // non l'intero range dello strumento: è lei a valere 80 divisioni.
            toneFromDelta(toneAtStart, toneTaAtStartRef.current, taCorretto, TA_MAX - taClear),
            margineTono)
        : withMargin(toneAtStart, margineTono);
  /** Il secondo sguardo per la colonna (`ToneColumn`'s `toneEeg`) — quando il MUSE È già il
   *  cursore primario (sopra) è la STESSA lettura: la colonna mostra il trattino "EEG" solo se
   *  diverge di oltre 3 unità dal cursore, quindi coincidendo semplicemente non compare più,
   *  senza bisogno di spegnerlo qui a mano. `null` senza MUSE, come sempre. */
  const toneOraEeg = toneOraMuse;
  /**
   * ── È UNA MISURA VERA, DA QUALUNQUE STRUMENTO — `toneHasMeter` (sopra) resta
   * DELIBERATAMENTE specifico del Theta-Meter (lo usano la localizzazione, il margine, il
   * pulsante "localizza col meter": tutti gesti che restano suoi, MAI del MUSE). Ma
   * `ToneDial`/`ToneColumn` (dove `toneOra` finisce a schermo) usavano PROPRIO `toneHasMeter`
   * per decidere se disegnare un numero — un `hasMeter` rimasto `false` con solo il MUSE
   * connesso avrebbe lasciato il quadrante VUOTO anche col cursore ora guidato per davvero dal
   * MUSE (verificato leggendo `ToneDial.tsx`: `{hasMeter && (...)}` non disegna NULLA se falso).
   * Un flag a sé, "è misurato da uno strumento qualunque" — i chiamanti del render passano
   * QUESTO a `hasMeter`, non più `toneHasMeter` direttamente.
   */
  const toneMisurato = toneHasMeter || toneOraMuse !== null;

  /**
   * I TESTIMONI — non si mostrano più, ma si registrano.
   *
   * Le tre spie a schermo, e la proposta automatica che ne discendeva, sono uscite: nel ciclo
   * di Ron chi giudica è l'auditor. Quali segnali si siano accesi resta però un DATO del
   * rapporto: a freddo dice se la fine del ciclo aveva un riscontro strumentale o solo l'obnosi.
   */
  const [toneFired, setToneFired] = useState<ToneWitness[]>([]);
  useEffect(() => {
    if (tonePhase !== 'raise') return;
    const nuovi: ToneWitness[] = [];
    // ⚠️ Non più `toneHasMeter` da solo: col MUSE che ora può guidare `toneOra` anche senza
    // Meter (v. la nota sulla priorità, sopra), il traguardo strumentale "top" deve accendersi
    // anche allora — altrimenti un tono che raggiunge +40 letto dal MUSE non lascerebbe MAI
    // questo testimone, anche se una misura vera lo ha visto arrivarci.
    if ((toneHasMeter || toneOraMuse !== null) && toneOra !== null && reachedTop(toneOra)) nuovi.push('top');
    if (d.fnNow) nuovi.push('fn');
    if (d.hasMuse && d.asIsSignature) nuovi.push('signature');
    if (!nuovi.length) return;
    setToneFired(p => {
      const add = nuovi.filter(w => !p.includes(w));
      return add.length ? [...p, ...add] : p;
    });
  }, [tonePhase, toneHasMeter, toneOra, toneOraMuse, d.fnNow, d.asIsSignature, d.hasMuse]);

  // ── I CICLI TONE SI REGISTRANO ─────────────────────────────────────────────────────────
  // Si tiene il tono di PARTENZA misurato (`located`, null senza meter), QUANTE VOLTE si è dato
  // il comando, e se il tono quaranta è stato raggiunto.
  const toneCyclesRef = useRef<ToneCycleRecord[]>([]);
  const toneNRef = useRef(0);
  const toneStartSecRef = useRef(0);

  const chiudiTone = useCallback((raggiunto: boolean) => {
    toneCyclesRef.current.push({
      n: ++toneNRef.current, question: d.auditingQuestion.trim(),
      tStartSec: toneStartSecRef.current, tEndSec: d.nowSec(),
      located: toneAtStart, repeats: toneRipetizioni,
      source: toneHasMeter ? (d.hasMuse ? 'meter+eeg' : 'meter') : 'assessed',
      anchor: toneAnchor?.how ?? 'settled',
      witnesses: [...toneFired], asIs: raggiunto,
    });
    // SENZA METER non si scrive un « ? » al posto del tono di partenza: un punto interrogativo
    // sembra un dato mancante per errore, mentre è semplicemente una seduta off-meter — come
    // quelle di Ron. Si scrive solo dove si andava.
    const da = toneAtStart !== null
      ? `${toneAtStart > 0 ? '+' : ''}${toneAtStart.toFixed(0)} → ` : '';
    d.log(
      `${raggiunto ? '✓' : '○'} #${toneNRef.current} ${d.auditingQuestion.trim() || d.LC('resistenza', 'résistance', 'resistance', 'resistencia', 'motstånd')} — TONE `
      + `${da}+${TONE_TARGET}`
      // QUANTE VOLTE si è dato « porta a tono 40 ». È il processo di Ron: il numero dice
      // quanto è costata questa resistenza, ed è l'unico modo di ritrovarlo dopo.
      + (toneRipetizioni > 0 ? ` · ×${toneRipetizioni}` : '')
      + (raggiunto ? ` · ${d.LC('TONO 40 RAGGIUNTO', 'TON 40 ATTEINT', 'TONE 40 REACHED', 'TONO 40 ALCANZADO', 'TON 40 NÅDD')}` : ''),
      raggiunto ? 'success' : 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.auditingQuestion, toneAtStart, toneAnchor, toneFired, toneRipetizioni,
      toneHasMeter, d.hasMuse, d.LC]);

  const resetTone = useCallback(() => {
    setTonePhase('locate');
    setToneAtStart(null); setToneAnchor(null); setToneFired([]);
    toneTaAtStartRef.current = null; toneQAtStartRef.current = null;
    setToneRipetizioni(0);   // il conto è di QUESTA resistenza, e la resistenza cambia.
    // Il campo si svuota: una resistenza nuova non porta l'etichetta di quella di prima.
    d.setAuditingQuestion('');
    toneAwaitItemRef.current = false;
    toneLocator.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * LOCALIZZA — e NON col valore del clic.
   *
   * Il MUSE dice QUANDO (il suo picco è il pensiero del preclear, e l'EEG lo coglie prima che
   * il corpo lo manifesti), il METER dice QUANTO (il TA a quell'istante). Senza MUSE si
   * ripiega sul movimento del METER; se non ha reagito nulla, sulla mediana della finestra —
   * che l'artefatto del clic non sposta.
   */
  const localizzaTone = useCallback(() => {
    const r = toneLocator.locate(d.nowSec(), d.hasMuse, toneMeasured ?? 0);
    setToneAnchor({ how: r.anchor, ageS: r.ageS });
    // ── L'ORIGINE DELLA SCALA SI FISSA QUI ────────────────────────────────────────────────
    // Col meter la propone la misura; senza, è quel che l'auditor ha dichiarato guardando il
    // preclear. Da questo istante il tono non si legge più in assoluto: si conta il MOVIMENTO.
    setToneAtStart(toneHasMeter ? r.tone : toneAssessed);
    // ⚠️ IL TA CORRETTO, non quello grezzo: se si ancorasse al grezzo e la configurazione
    // cambiasse in seduta, il tono salterebbe di una divisione senza che nulla sia successo.
    toneTaAtStartRef.current = taCorretto;
    // ⚠️ `qLRef.current`, non `d.qL` — v. la nota su `qLRef` più sopra: dentro questo
    // `useCallback` (dipendenze volutamente incomplete) `d.qL` sarebbe stato quello
    // dell'ultima ricreazione della funzione, non quello di ADESSO.
    toneQAtStartRef.current = d.hasMuse ? qLRef.current : null;
    toneStartSecRef.current = d.nowSec();   // il ciclo comincia QUI, non al comando 2
    // Premuto col campo VUOTO, la prima parola dell'auditor diventa l'item — come negli altri
    // tre cicli. Senza, in TONE si poteva solo scrivere: e scrivere vuol dire staccare gli
    // occhi dall'ago proprio mentre si localizza.
    toneAwaitItemRef.current = !d.auditingQuestion.trim();
    toneLogCursorRef.current = d.logLength();
    // E anche qui l'assessment si accende da sé (segnalato): dare la resistenza a voce è lo
    // stesso gesto che dare un item, e deve avere la stessa conseguenza in tutti e quattro i cicli.
    if (toneAwaitItemRef.current) d.ensureAssessmentOn();
    setToneRipetizioni(0);
    d.setItemSpoken(false);   // la resistenza di QUESTO ciclo va detta da capo.
    setTonePhase('raise');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.hasMuse, toneMeasured, toneHasMeter, toneAssessed, taCorretto]);

  /**
   * IL LOCATORE SI ALIMENTA DA FUORI — lo chiama il gestore del worker EEG, a ogni campione.
   *
   * L'istante del clic su LOCALIZZA è il peggiore dei tre (vedi `ToneLocator`): bisogna poter
   * risalire. Si accumula quindi in continuo, e solo in vista TONE — è chi chiama a saperlo.
   * `useCallback` con dipendenze vuote: il gestore del worker si aggancia una volta sola e
   * questa funzione non deve cambiare identità sotto di lui.
   */
  const trackTone = useCallback((q: number, nowSec: number) => {
    toneLocator.track(toneMeasuredRef.current ?? 0, q, nowSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    trackTone,
    // stato
    tonePhase, setTonePhase, tonePhaseRef,
    toneAtStart, toneAssessed, setToneAssessed,
    toneRipetizioni, setToneRipetizioni,
    toneAnchor, toneFired,
    // misure derivate
    taMostrato, taCorretto, taClear,
    toneMeasured, toneHasMeter, toneMisurato, margineTono, toneOra, toneOraEeg,
    // gesti
    localizzaTone, chiudiTone, resetTone,
    // registrazione e voce
    toneCyclesRef, toneAwaitItemRef, toneLogCursorRef,
  };
}
