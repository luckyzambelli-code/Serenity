/**
 * CORPUS WRITER — scrive le righe dell'archivio, dal renderer.
 *
 * La costruzione delle righe sta in engine/corpus.ts (pura, 14 test); qui c'è solo l'invio al
 * processo principale, che è l'unico con accesso al disco.
 *
 * ── PERCHÉ SI ACCUMULA E SI SPEDISCE A LOTTI ────────────────────────────────────────────────
 * Le reazioni arrivano a raffica durante un assessment. Una chiamata IPC per ciascuna
 * significherebbe centinaia di attraversamenti del ponte in pochi secondi, per un dato che
 * nessuno guarda in tempo reale. Si accumulano quindi in memoria e si scrivono a intervalli —
 * e SEMPRE prima che l'applicazione si chiuda, o le ultime righe della seduta si perderebbero.
 *
 * ── FUORI DA ELECTRON NON SI SCRIVE, E NON È UN ERRORE ──────────────────────────────────────
 * In Chrome non c'è filesystem: le righe si accumulano e si perdono alla chiusura. Meglio così
 * che far finta di archiviare — e chi analizza deve poter sapere che quella seduta non c'è.
 */
import { toLine, corpusFileName, type CorpusRecord } from '../engine/corpus';

/** Ogni quanto si svuota la coda (ms). Un dato d'archivio non ha fretta. */
const FLUSH_MS = 5000;

interface ElectronCorpusApi {
  corpusAppend?: (a: { file: string; line: string }) => Promise<{ ok: boolean; error?: string }>;
  corpusFolder?: () => Promise<string>;
}
const api = (): ElectronCorpusApi | null => {
  const w = window as unknown as { electronAPI?: ElectronCorpusApi };
  return w.electronAPI?.corpusAppend ? w.electronAPI : null;
};

/** L'archivio è scrivibile su questa macchina? */
export const corpusAvailable = (): boolean => api() !== null;

let coda: CorpusRecord[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
/** Quante righe non si è riusciti a scrivere. Se sale, l'archivio è incompleto e va detto. */
let perse = 0;
/** Quante ne sono state accodate e quante sono arrivate su disco. Servono a rispondere alla
 *  domanda « l'archivio è vuoto: nessuno gli parla, o non riesce a scrivere? », che sono due
 *  guasti opposti e finora indistinguibili. */
let accodate = 0;
let scritte = 0;

const flush = async (): Promise<void> => {
  const a = api();
  if (!a?.corpusAppend || coda.length === 0) return;
  // Si svuota la coda PRIMA di scrivere: se arrivano righe nuove durante l'attesa dell'IPC,
  // finiscono nel giro successivo invece di essere scritte due volte.
  const lotto = coda;
  coda = [];
  for (const r of lotto) {
    try {
      const res = await a.corpusAppend({ file: corpusFileName(r.at), line: toLine(r) });
      if (res?.ok) scritte++; else perse++;
    } catch (_) { perse++; }
  }
};

/** Accoda una riga. Non attende: la scrittura avviene a lotti. */
export const corpusWrite = (r: CorpusRecord): void => {
  accodate++;
  coda.push(r);
  if (!timer && api()) timer = setInterval(() => { void flush(); }, FLUSH_MS);
};

/** Svuota subito — da chiamare a fine seduta e alla chiusura dell'applicazione. */
export const corpusFlushNow = (): Promise<void> => flush();

/** Righe che non si è riusciti a scrivere: un archivio incompleto deve poterlo dire. */
export const corpusLost = (): number => perse;

/** Stato dell'archivio, per la diagnosi: accodate · scritte · perse · in attesa · c'è il disco? */
export const corpusStato = () => ({ accodate, scritte, perse, inCoda: coda.length, disco: api() !== null });

/** Dove sta l'archivio, per mostrarlo all'utente. */
export const corpusFolder = async (): Promise<string | null> => {
  try { return (await api()?.corpusFolder?.()) ?? null; } catch (_) { return null; }
};

// Alla chiusura si scrive quel che resta: senza questo, le ultime righe della seduta — che sono
// spesso le più interessanti, quelle della fine — non arriverebbero mai su disco.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void flush(); });
}
