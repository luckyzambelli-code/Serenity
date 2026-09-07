// fetch-cloudflared-win.cjs — scarica il binario cloudflared per Windows (x64), se manca.
//
// ── PERCHÉ QUESTO SCRIPT ESISTE ──────────────────────────────────────────────────────────────
// Trovato costruendo per la prima volta il pacchetto Windows da questo Mac (cross-build,
// `electron-builder --win`): `node_modules/cloudflared` scarica UN SOLO binario al momento di
// `npm install`, per la piattaforma della macchina che fa la build — su questo deposito,
// sempre macOS (`bin/cloudflared`, un eseguibile Mach-O). Il pacchetto Windows, costruito sulla
// STESSA macchina, spedirebbe comunque quel binario macOS — inutilizzabile su Windows vero, e
// con il nome SBAGLIATO: `node_modules/cloudflared/lib/constants.js` cerca `bin/cloudflared.exe`
// quando `process.platform === 'win32'` (`DEFAULT_CLOUDFLARED_BIN`, letto da `server-core.cjs`),
// non `bin/cloudflared` — ogni tunnel fallirebbe in silenzio (`ENOENT`) su un vero PC Windows.
// Stessa famiglia di bug già trovata e corretta per l'x64 mac (`fetch-cloudflared-x64.cjs`), qui
// cross-sistema operativo invece che cross-architettura.
//
// ── PERCHÉ VA DENTRO `node_modules/cloudflared/bin/`, NON `native/` ─────────────────────────
// A differenza del caso x64 mac (che ha bisogno di uno switch A RUNTIME fra due architetture
// possibili sulla STESSA build universale, v. `server-core.cjs`), qui basta un solo binario per
// tutta la build Windows (x64) — mettendolo esattamente dove il pacchetto `cloudflared` se lo
// aspetta già da sé (`DEFAULT_CLOUDFLARED_BIN`), nessuna riga nuova serve in `server-core.cjs`:
// la stessa `require('cloudflared')` che già funziona su macOS/Linux lo trova da sola.
//
// ── PERCHÉ NON È NEL DEPOSITO GIT ────────────────────────────────────────────────────────────
// Un binario di terze parti da ~40 MB, la stessa ragione per cui `node_modules/cloudflared`
// stesso non è mai versionato: si scarica, non si porta nel deposito.
//
// Idempotente: se `cloudflared.exe` esiste già, non riscarica nulla.
const fs   = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR   = path.join(__dirname, '..', 'node_modules', 'cloudflared', 'bin');
const DEST_FILE = path.join(BIN_DIR, 'cloudflared.exe');
const URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  if (fs.existsSync(DEST_FILE)) {
    console.log('[fetch-cloudflared-win] già presente, nessun download:', DEST_FILE);
    return;
  }
  if (!fs.existsSync(path.join(__dirname, '..', 'node_modules', 'cloudflared'))) {
    console.log('[fetch-cloudflared-win] node_modules/cloudflared assente — saltato (npm install non ancora fatto?).');
    return;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log('[fetch-cloudflared-win] scarico', URL, '…');
  const tmp = DEST_FILE + '.download';
  try {
    await download(URL, tmp);
    fs.renameSync(tmp, DEST_FILE);
    console.log('[fetch-cloudflared-win] pronto:', DEST_FILE);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

main().catch((err) => {
  // Non blocca la build: senza questo binario il pacchetto Windows esce comunque (il tunnel
  // non funzionerà, stesso limite di prima) invece di far fallire l'intera `dist:win-serenity`
  // per un download.
  console.warn('[fetch-cloudflared-win] fallito, si procede senza (il tunnel non funzionerà su Windows):', err.message);
});
