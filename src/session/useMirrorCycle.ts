/**
 * useMirrorCycle — IL CICLO MIRROR, fuori dall'interfaccia.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Secondo pezzo del SESSION CONTROLLER, dopo `useToneCycle` e con lo stesso patto: è LO STESSO
 * CODICE, spostato. Nessuna decisione nuova, nessuna condizione cambiata, e i nomi restituiti
 * sono quelli che `App.tsx` usava già — così il render non cambia di una riga e l'estrazione si
 * verifica come si deve: stessa seduta, stesso giornale.
 *
 * ── IL METODO ───────────────────────────────────────────────────────────────────────────────
 * MIRROR è il metodo del raddoppio di Ron, e in questa applicazione è una COSA A PARTE: non è
 * CONTACT e non è NULL. Si dà l'item, si prende la carica ISTANTANEA che quello contatta
 * (valore 1–10, relativo all'ambiente), e si lascia correre finché lo smaltito arriva al DOPPIO
 * di quel valore. Da lì il « OTTENUTO ».
 *
 * ── COSA NON STA QUI ────────────────────────────────────────────────────────────────────────
 * Il CALCOLO. La classe `MirrorCycle` — ambiente, retrospezione sul picco, blocco del valore,
 * conteggio dello smaltito — resta in `src/engine/MirrorCycle.ts`, pura e provata da sola.
 * Questo modulo tiene lo STATO del ciclo e l'ordine dei gesti.
 *
 * ⚠️ E non ci sta il testo: le righe del giornale hanno bisogno della lingua, quindi chi usa il
 * hook passa la sua funzione di traduzione.
 *
 * @see docs/refonte-fasi.md — le fasi della refonte.
 */

import { useCallback, useRef, useState } from 'react';
import { MirrorCycle } from '../engine/MirrorCycle';

/** Un ciclo MIRROR concluso, come finisce nel rapporto e nel PDF.
 *  READ = picco incontrato (1–10), DOUBLE = il suo doppio, `erased` = doppio raggiunto. */
export interface MirrorRecord {
  n: number;
  question: string;
  tStartSec: number;
  tEndSec: number;
  readInst: number;
  readDouble: number;
  erased: boolean;
}

/** Quel che si mostra del ciclo in corso — copia React dello stato del motore. */
export interface MirrorDisp {
  contactQ: number;
  dischargeQ: number;
  locked: boolean;
  reached: boolean;
  valueR: number;
}

const DISP_ZERO: MirrorDisp = { contactQ: 0, dischargeQ: 0, locked: false, reached: false, valueR: 0 };

/** Quel che il ciclo ha bisogno di sapere dal resto della seduta. */
export interface MirrorCycleDeps {
  /** L'item in corso, e il modo di svuotarlo a ciclo chiuso. */
  auditingQuestion: string;
  setAuditingQuestion: (s: string) => void;
  /** « L'item è stato detto » va riazzerato a ogni nuovo item. */
  setItemSpoken: (v: boolean) => void;
  /** Il tempo di seduta, in secondi. */
  nowSec: () => number;
  /** Quante righe ha il giornale adesso — serve a captare solo ciò che si dice DOPO il tasto. */
  logLength: () => number;
  /** Scrive una riga nel giornale. */
  log: (text: string, type: 'normal' | 'success') => void;
  /** Item dato a voce → l'assessment si accende da sé, se non gira già. */
  ensureAssessmentOn: () => void;
  /** La traduzione, che il controllore non conosce. */
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function useMirrorCycle(d: MirrorCycleDeps) {
  /**
   * IL MOTORE — uno PER CICLO, e non più uno per modulo.
   *
   * ⚠️ In `App.tsx` era il singleton `mirrorCycle` esportato dal motore: una sola istanza per
   * tutta la vita della pagina. Come per il locatore del TONE, con due interfacce che possono
   * vivere nello stesso processo quella scelta diventa un difetto silenzioso — due sedute che
   * si scambiano l'ambiente e lo storico della carica. Il motore appartiene al ciclo.
   */
  const engineRef = useRef<MirrorCycle | null>(null);
  if (engineRef.current === null) engineRef.current = new MirrorCycle();
  const mirrorCycle = engineRef.current;

  const [mirrorArmed, setMirrorArmed] = useState(false);
  const mirrorArmedRef = useRef(false); mirrorArmedRef.current = mirrorArmed;
  const [mirrorDisp, setMirrorDisp] = useState<MirrorDisp>(DISP_ZERO);
  /** TOTALE DI SEDUTA — contatore SEPARATO, perché la somma esce dalla scala 1–10: quanti item,
   *  quanti ottenuti, e Σ dei valori effettivi (il suo doppio è il totale raddoppiato). */
  const [mirrorSession, setMirrorSession] = useState({ count: 0, erased: 0, sumV: 0 });

  const mirrorCyclesRef = useRef<MirrorRecord[]>([]);
  const mirrorCurRef = useRef<{ n: number; question: string; tStartSec: number } | null>(null);
  const mStartedRef = useRef(0), mDoneRef = useRef(0);   // cicli MIRROR agganciati / ottenuti

  /** ITEM A VOCE: campo vuoto all'aggancio → si scrive quel che l'auditor DICE, e si RIANCORA
   *  la misura a quell'istante (= carica ISTANTANEA di quell'item). */
  const mirrorVoiceModeRef = useRef(false);   // questo ciclo aspetta/aspettava un item dettato
  const mirrorAwaitItemRef = useRef(false);   // cattura in corso
  const mirrorLogCursorRef = useRef(0);       // righe di giornale già consumate

  /** AGGANCIO — si dà l'item, il ciclo del doppio parte. */
  const armMirror = useCallback(() => {
    mirrorCycle.arm(d.nowSec());
    setMirrorArmed(true);
    d.setItemSpoken(false);
    setMirrorDisp(DISP_ZERO);
    const n = ++mStartedRef.current;
    mirrorCurRef.current = { n, question: d.auditingQuestion.trim(), tStartSec: d.nowSec() };
    // ITEM A VOCE: se il campo è VUOTO si scrive quel che l'auditor sta per DIRE, e si RIANCORA
    // la misura a quell'istante → il valore è la CARICA ISTANTANEA di quell'item.
    mirrorVoiceModeRef.current = !d.auditingQuestion.trim();
    mirrorAwaitItemRef.current = mirrorVoiceModeRef.current;
    mirrorLogCursorRef.current = d.logLength();   // captare SOLO ciò che si dice DOPO il tasto
    // DANDO L'ITEM A VOCE l'assessment si accende da sé — come in CONTACT/NULL. Senza, in
    // MIRROR l'item detto non compariva nella lista e bisognava premere ASSESS a parte
    // (segnalato in seduta): il gesto è lo stesso, la conseguenza dev'essere la stessa.
    if (mirrorVoiceModeRef.current) d.ensureAssessmentOn();
    d.log(`◎ ${d.LC('MIRROR — item dato · corri fino al doppio', 'MIRROR — item donné · fais tourner jusqu\'au double', 'MIRROR — item given · run to the double', 'MIRROR — ítem dado · corre hasta el doble', 'MIRROR — item givet · kör till dubbeln')} ${d.auditingQuestion.trim() ? '· ' + d.auditingQuestion.trim() : ''}`, 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.auditingQuestion, d.LC]);

  const stopMirror = useCallback(() => {
    const erased = mirrorCycle.reached;   // bersaglio (il doppio) raggiunto = OTTENUTO
    // Registrare l'item (valore effettivo, doppio, ottenuto) + SOMMARLO al totale di seduta.
    const cur = mirrorCurRef.current;
    if (cur) {
      const readInst = mirrorCycle.valueR;   // valore 1–10 RELATIVO all'ambiente
      // DIAGNOSTICA per la taratura: i numeri veri di questa macchina/persona nel giornale.
      d.log(`MIRROR contact: amb ${mirrorCycle.baselineQ.toFixed(2)} pic ${mirrorCycle.contactQ.toFixed(2)} (x${(mirrorCycle.contactQ / Math.max(mirrorCycle.baselineQ, 0.05)).toFixed(2)}) -> ${readInst.toFixed(1)}/10${mirrorCycle.peakAgeS > 0.15 ? ` · ${d.LC('picco preso', 'pic pris', 'peak taken', 'pico tomado', 'topp tagen')} ${mirrorCycle.peakAgeS.toFixed(1)}s ${d.LC('PRIMA dell\'item', 'AVANT l\'item', 'BEFORE the item', 'ANTES del ítem', 'FÖRE item')}` : ''}`, 'normal');
      if (readInst > 0.1 || erased) {
        mirrorCyclesRef.current.push({ n: cur.n, question: cur.question, tStartSec: cur.tStartSec, tEndSec: d.nowSec(),
          readInst, readDouble: 2 * readInst, erased });
        if (erased) mDoneRef.current++;
        setMirrorSession(prev => ({ count: prev.count + 1, erased: prev.erased + (erased ? 1 : 0), sumV: prev.sumV + readInst }));
      }
    }
    mirrorCurRef.current = null;
    mirrorCycle.disarm();
    setMirrorArmed(false);
    // Item DETTATO → si svuota il campo, così il PROSSIMO item torna a essere captato a voce.
    if (mirrorVoiceModeRef.current) d.setAuditingQuestion('');
    d.setItemSpoken(false);
    mirrorVoiceModeRef.current = false;
    mirrorAwaitItemRef.current = false;
    d.log(erased
      ? `✓ MIRROR — ${d.LC('OTTENUTO (doppio raggiunto)', 'OBTENU (double atteint)', 'OBTAINED (double reached)', 'OBTENIDO (doble alcanzado)', 'UPPNÅTT (dubbeln nådd)')}`
      : `◎ MIRROR — ${d.LC('validato senza raggiungere il doppio', 'validé sans atteindre le double', 'validated without reaching the double', 'validado sin alcanzar el doble', 'validerad utan att nå dubbeln')}`,
      erased ? 'success' : 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.LC]);

  /**
   * L'ITEM DETTATO È ARRIVATO — lo chiama chi ascolta il giornale.
   *
   * Non è solo un'etichetta da riempire: si RILANCIA la misura a quell'istante preciso, e il
   * valore trattenuto è quindi la carica ISTANTANEA di QUESTO item — non quel che si trascinava
   * da quando si è premuto il tasto. È la differenza con CONTACT/NULL, dove il tasto ancora già.
   */
  const itemDettato = useCallback((txt: string) => {
    mirrorAwaitItemRef.current = false;
    d.setAuditingQuestion(txt);                  // l'item si mostra nel campo
    if (mirrorCurRef.current) mirrorCurRef.current.question = txt;
    mirrorCycle.arm(d.nowSec());                 // riancoraggio = carica ISTANTANEA
    setMirrorDisp(DISP_ZERO);
    d.log(`◎ MIRROR — ${d.LC('item', 'item', 'item', 'ítem', 'item')} · ${txt}`, 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.LC]);

  /**
   * IL MOTORE SI ALIMENTA DA FUORI — lo chiama il gestore del worker EEG, a ogni campione.
   *
   * L'AMBIENTE si misura SEMPRE in vista MIRROR, anche senza item agganciato: è il riferimento
   * del valore relativo, e senza storico la retrospezione sul picco non avrebbe da dove
   * risalire. `useCallback` a dipendenze vuote: il gestore del worker si aggancia una volta
   * sola e questa funzione non deve cambiare identità sotto di lui.
   */
  const trackMirror = useCallback((q: number, nowSec: number, pushUi: boolean) => {
    mirrorCycle.track(q, nowSec);
    if (!mirrorArmedRef.current) return;
    mirrorCycle.update(q, nowSec);
    if (pushUi) setMirrorDisp({ contactQ: mirrorCycle.contactQ, dischargeQ: mirrorCycle.dischargeQ,
      locked: mirrorCycle.locked, reached: mirrorCycle.reached, valueR: mirrorCycle.valueR });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Seduta nuova: il ciclo torna com'era all'apertura dell'applicazione. */
  const resetMirror = useCallback(() => {
    mirrorCycle.reset();
    setMirrorArmed(false);
    setMirrorDisp(DISP_ZERO);
    setMirrorSession({ count: 0, erased: 0, sumV: 0 });
    mirrorCyclesRef.current = []; mirrorCurRef.current = null;
    mStartedRef.current = 0; mDoneRef.current = 0;
    mirrorVoiceModeRef.current = false; mirrorAwaitItemRef.current = false; mirrorLogCursorRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    mirrorCycle, trackMirror,
    // stato
    mirrorArmed, setMirrorArmed, mirrorArmedRef,
    mirrorDisp, setMirrorDisp,
    mirrorSession, setMirrorSession,
    // gesti
    armMirror, stopMirror, itemDettato, resetMirror,
    // registrazione e voce
    mirrorCyclesRef, mirrorCurRef, mStartedRef, mDoneRef,
    mirrorVoiceModeRef, mirrorAwaitItemRef, mirrorLogCursorRef,
  };
}
