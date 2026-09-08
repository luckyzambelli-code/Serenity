// scripts/lib/download.cjs — scarico HTTPS con redirect, condiviso dagli script di build che
// prendono i binari `cloudflared` per piattaforme diverse dalla macchina che fa la build
// (`fetch-cloudflared-x64.cjs`, `fetch-cloudflared-win.cjs`).
//
// ── PERCHÉ QUESTO FILE ESISTE ────────────────────────────────────────────────────────────────
// Segnalato nella revisione completa (reuse): la stessa `download()` viveva copiata identica
// in entrambi gli script — ogni bug (i due sotto, trovati nella stessa revisione) andava
// corretto due volte, col rischio di dimenticarne una. Un solo posto, ora.
//
// ── I DUE BUG CORRETTI QUI (erano in entrambe le copie) ─────────────────────────────────────
// 1. Mancava `res.on('error', ...)`: c'era `.on('error', reject)` sulla RICHIESTA
//    (`https.get(...)`) e su `file` (lo stream di scrittura), ma non sulla RISPOSTA (`res`) —
//    una connessione che cade A METÀ scaricamento emette un `'error'` su `res` che, senza
//    ascoltatore, sarebbe salito fino a far crashare l'intero processo Node invece di essere
//    intercettato dal `.catch()` di `main()`.
// 2. `file.on('finish', () => file.close(resolve));` passava `resolve` DIRETTAMENTE come
//    callback di `fs.WriteStream.close()` — un errore di chiusura (disco pieno, permessi)
//    diventava così il VALORE con cui la promise si risolve (positivamente!), invece di farla
//    fallire. Ora `close()` ha il proprio callback, che rigetta se riceve un errore.
const fs    = require('fs');
const https = require('https');

/** Scarica `url` in `dest`, seguendo i redirect (max `redirectsLeft`, default 5). */
function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        download(res.headers.location, dest, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} scaricando ${url}`));
        return;
      }
      res.on('error', reject); // FIX #5: senza, un drop a metà scaricamento crashava il processo.
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        // FIX #6: `close()` ha un proprio esito — non passare `resolve` come suo callback
        // diretto, altrimenti un errore di chiusura risolverebbe comunque la promise.
        file.close((err) => { if (err) reject(err); else resolve(); });
      });
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

module.exports = { download };
