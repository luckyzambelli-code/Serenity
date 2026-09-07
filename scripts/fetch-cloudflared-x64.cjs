// fetch-cloudflared-x64.cjs — scarica il binario cloudflared per Intel (x64), se manca.
//
// ── PERCHÉ QUESTO SCRIPT ESISTE ──────────────────────────────────────────────────────────────
// Segnalato nella revisione completa: « solo Apple Silicon viene distribuito, niente Intel ».
// `node_modules/cloudflared` scarica UN SOLO binario al momento di `npm install`, per
// l'architettura della macchina che fa la build — su questo deposito, sempre arm64. Un pacchetto
// x64 costruito sulla STESSA macchina spedirebbe comunque quel binario arm64, e ogni tunnel
// fallirebbe in silenzio su un vero Mac Intel (v. `server-core.cjs`, dove il binario giusto
// viene scelto DAVVERO in base a `process.arch` a runtime — ma serve che esista).
//
// ── PERCHÉ NON È NEL DEPOSITO GIT ────────────────────────────────────────────────────────────
// È un binario di terze parti da ~40 MB, non qualcosa compilato da un sorgente già qui dentro
// (a differenza di `native/sm-stt`, compilato da `native/sm-stt.swift` con `build:stt`) — la
// stessa ragione per cui `node_modules/cloudflared` stesso non è mai versionato: si scarica,
// non si porta nel deposito. Questo script fa per l'architettura x64 esattamente quel che il
// `postinstall` di `cloudflared` fa già per quella della macchina locale.
//
// Idempotente: se il file esiste già, non riscarica nulla — un secondo giro di build resta
// veloce quanto prima che questo script esistesse.
const fs   = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const DEST_DIR  = path.join(__dirname, '..', 'native');
const DEST_FILE = path.join(DEST_DIR, 'cloudflared-darwin-x64');
const URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';

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
    console.log('[fetch-cloudflared-x64] già presente, nessun download:', DEST_FILE);
    return;
  }
  if (process.platform !== 'darwin') {
    console.log('[fetch-cloudflared-x64] non-macOS — saltato (serve solo per il pacchetto Mac x64).');
    return;
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const tgz = path.join(DEST_DIR, '_cloudflared-darwin-amd64.tgz');
  console.log('[fetch-cloudflared-x64] scarico', URL, '…');
  try {
    await download(URL, tgz);
    execSync(`tar -xzf "${tgz}" -C "${DEST_DIR}"`, { stdio: 'inherit' });
    fs.renameSync(path.join(DEST_DIR, 'cloudflared'), DEST_FILE);
    fs.chmodSync(DEST_FILE, 0o755);
    console.log('[fetch-cloudflared-x64] pronto:', DEST_FILE);
  } finally {
    try { fs.unlinkSync(tgz); } catch (_) {}
  }
}

main().catch((err) => {
  // Non blocca la build: senza questo binario il pacchetto x64 esce comunque (con lo stesso
  // limite di prima — il tunnel non funzionerà su un vero Mac Intel, un binario arm64 non può
  // girare su x64) invece di far fallire l'intera `dist:mac`/`dist:serenity` per un download.
  console.warn('[fetch-cloudflared-x64] fallito, si procede senza (il tunnel non funzionerà su Intel):', err.message);
});
