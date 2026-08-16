/**
 * useSessionJournal — IL GIORNALE DELLA SEDUTA.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Ultimo pezzo della fase 1 (vedi la cartografia SERENITY), e il più semplice: qui non c'è quasi
 * niente da scollegare. Il giornale è già una cosa a sé — righe che entrano, righe che si
 * leggono — e stava in `App.tsx` solo perché ci stava tutto il resto.
 *
 * È però il pezzo di cui TUTTI hanno bisogno: i quattro cicli ci scrivono, la trascrizione ci
 * scrive, il rapporto e il PDF lo rileggono, e l'assessment ci pesca gli item detti a voce.
 * Finché viveva dentro l'interfaccia, una seconda interfaccia avrebbe dovuto rifarlo — e due
 * giornali diversi vogliono dire due sedute che non si possono confrontare.
 *
 * ── LE DUE VIE PER SCRIVERE, E PERCHÉ SONO DUE ──────────────────────────────────────────────
 * `addLog` scrive SUBITO: è per i gesti umani, dove una riga in più non costa nulla.
 *
 * `logBufferRef.current.push(...)` scrive nel CUSCINETTO, che si svuota ogni mezzo secondo. È
 * per chi gira nel gestore del worker EEG, cioè decine di volte al secondo: passare di lì da
 * `setLogs` farebbe ridisegnare l'applicazione a ogni campione. Il cuscinetto è la ragione per
 * cui l'ago resta fluido mentre il giornale si riempie.
 *
 * ⚠️ E si SVUOTA prima di aggiungere, non dopo. L'ordine inverso — copia, poi azzera — perdeva
 * le righe spinte da altre vie asincrone nel mezzo.
 *
 * @see docs/serenity-refonte.md — le fasi della refonte.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../components/TranscriptLog';

/** Ogni quanto il cuscinetto si versa nel giornale. Mezzo secondo: sotto si sente il ridisegno,
 *  sopra le righe arrivano in gruppo e si vede che sono in ritardo sull'ago. */
const FLUSH_MS = 500;

export function useSessionJournal(initialText: string) {
  // La riga d'apertura si valuta UNA volta sola: `useState` ignora l'argomento dai render
  // successivi, quindi un cambio di lingua a seduta aperta non la riscrive — ed è giusto così,
  // perché quella riga è già stata detta.
  const [logs, setLogs] = useState<LogEntry[]>(() => [{ time: 0, speaker: 'SYS', text: initialText }]);
  /** Specchio in ref: la ricerca « questa parola è già stata detta? » parte da una callback
   *  stabile, che senza questo leggerebbe la trascrizione com'era a inizio seduta. */
  const logsRef = useRef<LogEntry[]>(logs); logsRef.current = logs;
  /** Il cuscinetto delle righe scritte a frequenza alta. */
  const logBufferRef = useRef<LogEntry[]>([]);

  // ── LO SVUOTAMENTO ────────────────────────────────────────────────────────────────────────
  // ⚠️ Dipendenze VUOTE, e in App erano `[sessionState, museConnection]`: l'intervallo si
  // rifaceva a ogni cambio di stato della seduta o della connessione, e ogni rifacimento poteva
  // ritardare uno svuotamento di mezzo secondo. Nulla di quel che c'è qui dentro dipende da
  // quei due valori, quindi l'intervallo si crea una volta e batte regolare.
  useEffect(() => {
    const id = setInterval(() => {
      if (logBufferRef.current.length === 0) return;
      // Si SVUOTA il cuscinetto in un colpo solo PRIMA di aggiungere: l'ordine inverso
      // (copia, poi azzera) perdeva le righe spinte fra la copia e l'azzeramento.
      const drained = logBufferRef.current.splice(0);
      setLogs(prev => [...prev, ...drained]);
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, []);

  /** Scrive SUBITO. Senza `time`, si data all'orologio di sistema. */
  const addLog = useCallback((entry: Omit<LogEntry, 'time'> & { time?: number }) => {
    const newEntry = { ...entry, time: entry.time ?? Date.now() / 1000 };
    // La forma funzionale è CRUCIALE: due righe scritte nello stesso giro non si perdono.
    setLogs(prev => [...prev, newEntry]);
  }, []);

  /** Una riga di sistema, in testa alla seduta (tempo 0) — avvisi e diagnosi d'avvio. */
  const addSysLine = useCallback((text: string, type?: LogEntry['type']) => {
    setLogs(prev => [...prev, { time: 0, speaker: 'SYS', text, type }]);
  }, []);

  /** Seduta nuova: il giornale riparte dalla sola riga d'apertura. */
  const resetJournal = useCallback((text: string) => {
    logBufferRef.current = [];
    setLogs([{ time: 0, speaker: 'SYS', text }]);
  }, []);

  return { logs, setLogs, logsRef, logBufferRef, addLog, addSysLine, resetJournal };
}
