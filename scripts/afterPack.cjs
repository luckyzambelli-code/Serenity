/**
 * afterPack.cjs — electron-builder afterPack hook
 *
 * electron-builder's extendInfo only patches the MAIN app's Info.plist.
 * On macOS 13+, the Renderer and other helper processes also need
 * NSBluetoothAlwaysUsageDescription or macOS kills them with a TCC crash.
 * This script patches all helper Info.plists after packing.
 *
 * ── IL BINARIO CLOUDFLARED DELLA PIATTAFORMA SBAGLIATA, TOLTO QUI — segnalato: « affina le
 * dimensioni ». `node_modules/cloudflared/bin/` porta, su questa macchina di sviluppo, DUE
 * binari insieme (`cloudflared` per macOS, `cloudflared.exe` per Windows — v.
 * `scripts/fetch-cloudflared-win.cjs` per il perché) — `files: [...]` in `package.json` non sa
 * escluderne uno solo per piattaforma: un `files` messo dentro `mac`/`win` in electron-builder
 * NON si aggiunge alla lista di sopra come sperato, la SOSTITUISCE — verificato dal vivo: il
 * pacchetto Windows è esploso da 321 MB a 712 MB (l'INTERO `node_modules`, `vite`/`rollup`/
 * `onnxruntime` compresi, tornava dentro). `afterPack` gira DOPO che electron-builder ha già
 * scritto la cartella scompattata (con la lista `files` di base intatta, mai toccata) — qui
 * basta CANCELLARE il file di troppo prima che `asar`/NSIS lo richiudano dentro, un intervento
 * chirurgico che non tocca affatto la lista che già funzionava bene per l'inclusione. */
const plist  = require('plist');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

// ⚠️ VERIFICATO — segnalato nella revisione completa: `mac` e `linux` condividono lo stesso
// nome (`'cloudflared'`, senza estensione) — non una svista, è la convenzione del pacchetto
// `cloudflared` a monte (lo stesso nome per entrambe le piattaforme Unix-like); Windows è
// l'unica con un nome diverso (`.exe`). Nessuna collisione REALE oggi: `removeWrongPlatformCloudflared`
// gira una volta per invocazione di `electron-builder`, sempre per UNA piattaforma sola
// (`--mac` o `--win`) — non elabora mai mac e linux nella stessa cartella insieme, quindi il
// valore duplicato non fa confondere nulla in pratica. Diventerebbe un problema SOLO se questo
// deposito guadagnasse un giorno un cross-build Linux DA MAC (come `fetch-cloudflared-win.cjs`
// fa oggi per Windows): a quel punto servirebbe lo stesso meccanismo di `server-core.cjs` per
// l'x64 mac (uno switch A RUNTIME fra binari con nomi DIVERSI in `native/`), non una semplice
// voce in questa mappa — annotato qui perché non si ripeta l'errore di pensare che basti
// aggiungere `linux-arm64: 'cloudflared'` e sperare che funzioni.
const CLOUDFLARED_BIN_BY_PLATFORM = { mac: 'cloudflared', windows: 'cloudflared.exe', linux: 'cloudflared' };

function removeWrongPlatformCloudflared(appOutDir, packager) {
  const platformName = packager.platform.name; // 'mac' | 'windows' | 'linux'
  const wantedBin = CLOUDFLARED_BIN_BY_PLATFORM[platformName];
  if (!wantedBin) return;

  const resourcesDir = platformName === 'mac'
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources');
  const binDir = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'cloudflared', 'bin');
  if (!fs.existsSync(binDir)) return;

  for (const entry of fs.readdirSync(binDir)) {
    if (entry === wantedBin) continue; // il binario giusto per QUESTA build resta
    const stray = path.join(binDir, entry);
    try {
      fs.rmSync(stray, { force: true });
      console.log(`  [afterPack] rimosso binario cloudflared di un'altra piattaforma: ${entry}`);
    } catch (e) {
      console.warn(`  [afterPack] impossibile rimuovere ${entry}: ${e.message}`);
    }
  }
}

const BT_KEYS = {
  NSBluetoothAlwaysUsageDescription:
    'Static Meter uses Bluetooth to connect to the Muse 2 headset and Theta Meter Nano.',
  NSBluetoothPeripheralUsageDescription:
    'Static Meter uses Bluetooth to connect to BLE biometric devices.',
};

module.exports = async function afterPack(context) {
  const { appOutDir, packager } = context;
  removeWrongPlatformCloudflared(appOutDir, packager);
  if (packager.platform.name !== 'mac') return;

  // Find the .app inside appOutDir
  const appName  = packager.appInfo.productFilename;
  const appPath  = path.join(appOutDir, `${appName}.app`);
  const fwDir    = path.join(appPath, 'Contents', 'Frameworks');

  if (!fs.existsSync(fwDir)) return;

  // Find all Helper .app bundles inside Frameworks/
  const entries = fs.readdirSync(fwDir);
  const helpers = entries.filter(e => e.endsWith('.app') && e.includes('Helper'));

  for (const helperName of helpers) {
    const plistPath = path.join(fwDir, helperName, 'Contents', 'Info.plist');
    if (!fs.existsSync(plistPath)) continue;

    try {
      // Read the existing plist (binary or XML)
      const raw = fs.readFileSync(plistPath);
      let data;
      try {
        // Try JSON plist module first
        data = plist.parse(raw.toString('utf8'));
      } catch {
        // Fallback: use plutil to convert binary plist → XML → parse
        execSync(`plutil -convert xml1 "${plistPath}"`, { stdio: 'inherit' });
        data = plist.parse(fs.readFileSync(plistPath, 'utf8'));
      }

      let changed = false;
      for (const [k, v] of Object.entries(BT_KEYS)) {
        if (!data[k]) { data[k] = v; changed = true; }
      }

      if (changed) {
        fs.writeFileSync(plistPath, plist.build(data), 'utf8');
        console.log(`  [afterPack] Bluetooth keys added to ${helperName}`);
      }
    } catch (e) {
      console.warn(`  [afterPack] Could not patch ${helperName}: ${e.message}`);
    }
  }
};
