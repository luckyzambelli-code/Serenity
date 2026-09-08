/**
 * localAuth.ts — il token che prova al server locale « sono l'app stessa, in locale ».
 *
 * ── FIX SEC-1 ─────────────────────────────────────────────────────────────────────────────────
 * Segnalato nella revisione completa (0776d49..854dd5c): il vecchio `isFromTunnel()`, in
 * `server-core.cjs`, decideva « questa richiesta viene dal tunnel pubblico » confrontando
 * l'header Host: con l'hostname noto del tunnel — falsificabile da qualunque chiamante
 * non-browser (`curl -H "Host: 127.0.0.1:7893" https://xxxx.trycloudflare.com/api/profiles`
 * bypassava per intero la protezione "solo locale" su profili, sedute, PDF dei processus e le
 * rotte AppleScript del Theta-Meter). V. la nota grande su `LOCAL_AUTH_TOKEN` in
 * `server-core.cjs` per il meccanismo completo.
 *
 * Qui, lato renderer, si prende il token da UNA delle due vie possibili (mai dal tunnel — solo
 * canali che il tunnel non vede mai):
 *   • Electron: IPC puro, via `window.electronAPI.getLocalAuthToken()` (preload.cjs/main.cjs).
 *   • Modalità "Chrome" (`server.cjs`, `node server.cjs`): incorporato nell'URL locale stampato
 *     in console (`?token=...`) — letto da `location.search` al primo avvio, poi TOLTO subito
 *     dall'URL (`history.replaceState`) perché non resti visibile/copiabile per sbaglio in un
 *     link condiviso.
 * Il risultato è cachato in modulo: una sola risoluzione per tutta la vita della pagina.
 */

let _cached: string | null | undefined; // undefined = non ancora risolto

interface ElectronLocalAuthApi {
  getLocalAuthToken?: () => Promise<string>;
}

async function _resolve(): Promise<string | null> {
  // 1) Electron — canale IPC, mai visto dal tunnel (che vede solo HTTP).
  const w = window as unknown as { electronAPI?: ElectronLocalAuthApi };
  if (w.electronAPI?.getLocalAuthToken) {
    try {
      const t = await w.electronAPI.getLocalAuthToken();
      if (t) return t;
    } catch { /* ripiega sotto */ }
  }

  // 2) Modalità "Chrome" — il token arriva nella query string dell'URL locale stampato da
  //    server.cjs. Tolto subito dall'URL visibile: non deve restare in un link copiato/condiviso.
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('token');
    if (t) {
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
      return t;
    }
  } catch { /* location non disponibile (SSR/test) — nessun token */ }

  return null;
}

/** Il token locale, risolto una sola volta per pagina (Electron IPC, o `?token=` in modalità Chrome). */
export const getLocalAuthToken = (): Promise<string | null> => {
  if (_cached !== undefined) return Promise.resolve(_cached);
  return _resolve().then(t => { _cached = t; return t; });
};

/** Header pronti da spargere in un `fetch(..., { headers: {...} })` verso una rotta "solo locale". */
export const localAuthHeaders = async (): Promise<Record<string, string>> => {
  const t = await getLocalAuthToken();
  return t ? { 'X-Local-Auth': t } : {};
};
