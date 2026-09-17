/**
 * useAppUpdater — stato del pulsante "verifica aggiornamento" nell'intestazione.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Segnalato: « ho aperto su Windows e non lo aggiorna (versione 3.0.337) verso la 3.0.344.
 * Non sarebbe bello includere un pulsante VERIFICARE AGGIORNAMENTO? ». La causa vera era che
 * nessuna delle build costruite finora era stata PUBBLICATA su GitHub Releases (`dist:*` senza
 * `:publish` — v. la nota grande in `main.cjs` sull'aggiornamento automatico): l'autoUpdater
 * non trovava nulla di più nuovo perché non c'era niente da trovare, non perché fosse rotto.
 * Questo però ha scoperto un vero difetto separato: il controllo partiva UNA sola volta, 5s
 * dopo l'avvio, senza nessun modo per l'utente di richiamarlo (bisognava riavviare l'app) e
 * senza NESSUN riscontro visibile se non trovava nulla di nuovo (falliva "in silenzio" per
 * design, v. lo stesso commento in `main.cjs`) — indistinguibile da "l'aggiornamento non
 * funziona" per chi lo guarda. Questo hook dà al pulsante uno stato da mostrare.
 *
 * ── SOLO ELECTRON ────────────────────────────────────────────────────────────────────────────
 * `window.electronAPI.checkForUpdates`/`onUpdaterEvent` esistono solo nell'app pacchettizzata
 * (v. `preload.cjs`) — assenti nella preview browser di sviluppo e nel ParticipantView remoto
 * (mai ha senso "aggiornare" una pagina in un tunnel). `disponibile` è `false` in quei casi:
 * chi monta questo hook decide da sé se nascondere il pulsante o disabilitarlo.
 */
import { useEffect, useRef, useState } from 'react';

type EventoUpdater =
  | { type: 'checking' }
  | { type: 'available'; version?: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent?: number }
  | { type: 'downloaded'; version?: string }
  | { type: 'error'; message?: string };

interface ElectronUpdaterApi {
  checkForUpdates: () => Promise<{ ok: boolean }>;
  onUpdaterEvent: (cb: (payload: EventoUpdater) => void) => () => void;
}

export type StatoAggiornamento =
  | 'inattivo' | 'verifica' | 'aggiornato' | 'trovato' | 'scaricamento' | 'pronto' | 'errore';

function apiElectron(): ElectronUpdaterApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { electronAPI?: ElectronUpdaterApi }).electronAPI;
}

export function useAppUpdater() {
  const [stato, setStato] = useState<StatoAggiornamento>('inattivo');
  const [percentuale, setPercentuale] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disponibile = !!apiElectron()?.checkForUpdates;

  useEffect(() => {
    // ⚠️ DIPENDE DA `disponibile`, NON `[]` — in Electron vero `window.electronAPI` esiste
    // già al primo render (il preload gira prima dello script della pagina), ma un mount
    // con deps vuote non si riaggancerebbe MAI se per qualsiasi motivo diventasse
    // disponibile più tardi (trovato verificando col mock in dev: iniettare `electronAPI`
    // dopo il mount, con `[]`, lasciava l'hook sottoscritto per sempre a "niente" anche
    // dopo un nuovo render). Costa nulla in produzione, evita un futuro bug silenzioso.
    const api = apiElectron();
    if (!api?.onUpdaterEvent) return;
    return api.onUpdaterEvent(ev => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      // ⚠️ "aggiornato"/"errore" si azzerano da soli dopo qualche secondo — sono un
      // riscontro del momento ("ho appena controllato"), non uno stato permanente da
      // lasciare scritto per sempre accanto alla versione. "trovato"/"scaricamento"/
      // "pronto" restano finché non cambia lo stato stesso (informano di un'azione
      // ancora da fare — riavviare — non solo "è successo qualcosa poco fa").
      if (ev.type === 'checking') setStato('verifica');
      else if (ev.type === 'available') setStato('trovato');
      else if (ev.type === 'not-available') { setStato('aggiornato'); timerRef.current = setTimeout(() => setStato('inattivo'), 6000); }
      else if (ev.type === 'downloading') { setStato('scaricamento'); setPercentuale(ev.percent ?? 0); }
      else if (ev.type === 'downloaded') setStato('pronto');
      else if (ev.type === 'error') { setStato('errore'); timerRef.current = setTimeout(() => setStato('inattivo'), 6000); }
    });
  }, [disponibile]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const verifica = () => {
    const api = apiElectron();
    if (!api?.checkForUpdates) return;
    setStato('verifica');
    api.checkForUpdates().catch(() => setStato('errore'));
  };

  return { disponibile, stato, percentuale, verifica };
}
