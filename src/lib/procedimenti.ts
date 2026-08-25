/**
 * PROCEDIMENTI — la lista dei procedimenti scritti a mano in `~/EQUILIBRIUM/COMANDI/Procedimenti`.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato (SERENITY): « consenti la selezione/chiamata di procedimenti presenti nella
 * cartella COMANDI/Procedimenti ». Quella cartella non esisteva — non c'era nessun formato
 * per « i comandi di un procedimento » da nessuna parte nell'app: PROCESSUS è un archivio di
 * PDF opachi (`ProcessusModal.tsx`), senza estrazione di testo. Qui si definisce il formato
 * più semplice possibile da scrivere a mano: un file `.txt` per procedimento, il nome del
 * file (senza estensione) è il titolo, un comando per riga. Righe vuote e righe che iniziano
 * con `#` (note dell'auditor, non comandi da leggere in seduta) non contano.
 *
 * La lettura vera è nel processo principale (`main.cjs`, `procedimenti-list` /
 * `procedimenti-folder-open`) — qui solo l'invio via IPC, come `corpusWriter.ts` accanto.
 *
 * ── FUORI DA ELECTRON NON C'È NULLA, E NON È UN ERRORE ──────────────────────────────────────
 * In un browser di anteprima non c'è filesystem: la lista torna vuota e il bottone "apri
 * cartella" non fa nulla — stesso principio di `corpusAvailable()`.
 *
 * ── COMANDI NUMERATI, NOTE SOTTO SENZA NUMERO — segnalato: « a) domande numerate in
 * sequenza; b) commenti per aiutare l'auditor, sotto la domanda, senza numero, anche su più
 * righe ». Una riga del file È un comando; una riga che inizia con `#` è una nota del
 * comando appena prima (`main.cjs` fa l'aggancio, qui si legge già raggruppato).
 */

/** Un comando del procedimento: il testo (numerato in sequenza) e le sue note (senza numero, 0+ righe). */
export interface ComandoProcedimento {
  testo: string;
  note: string[];
}

/** Un procedimento: titolo (dal nome del file) e i suoi comandi. */
export interface Procedimento {
  nome: string;
  comandi: ComandoProcedimento[];
}

interface ElectronProcedimentiApi {
  listProcedimenti?: () => Promise<Procedimento[]>;
  openProcedimentiFolder?: () => Promise<{ ok: boolean; dir?: string; error?: string }>;
}
const api = (): ElectronProcedimentiApi | null => {
  const w = window as unknown as { electronAPI?: ElectronProcedimentiApi };
  return w.electronAPI?.listProcedimenti ? w.electronAPI : null;
};

/** La cartella dei procedimenti è leggibile su questa macchina? */
export const procedimentiDisponibili = (): boolean => api() !== null;

/** I procedimenti trovati adesso in `~/EQUILIBRIUM/COMANDI/Procedimenti` — vuoto se non c'è filesystem, o la cartella è vuota. */
export const listaProcedimenti = async (): Promise<Procedimento[]> => {
  try { return (await api()?.listProcedimenti?.()) ?? []; } catch { return []; }
};

/** Crea (se manca) e apre in Finder la cartella dei procedimenti. Nessun effetto fuori da Electron. */
export const apriCartellaProcedimenti = async (): Promise<void> => {
  try { await api()?.openProcedimentiFolder?.(); } catch { /* noop */ }
};
