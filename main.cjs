const { app, BrowserWindow, ipcMain, shell, systemPreferences, screen, clipboard } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync, spawn } = require('child_process');
const { createAppServer, getLanIp, stopTunnel } = require('./server-core.cjs');

const PORT     = 7893;
const DIST_DIR = path.join(__dirname, 'dist');

// App renamed STATIC METER → EQUILIBRIUM. The Chromium userData dir (which holds
// localStorage = profiles, session history, settings) is keyed by the product name,
// so a rename would otherwise orphan all existing data. Pin userData to the original
// "Static Meter" folder so nothing is lost across the rename. Must run before ready.
//
// ⚠️ E VALE PER TUTTE E DUE LE APPLICAZIONI. EQUILIBRIUM e SERENITY escono dallo stesso
// deposito e sono due eseguibili distinti, ma guardano UN SOLO ARMADIO: gli stessi profili,
// lo stesso archivio, le stesse sedute. È la verifica scritta per la fase 3 della refonte —
// un profilo creato di là si deve vedere di qua.
//
// La conseguenza da sapere: Chromium mette un lucchetto su questa cartella, quindi le due
// applicazioni NON possono stare aperte insieme. Non è un limite che dà fastidio (non si
// audita due volte in una volta), ed è il prezzo di avere una verità sola invece di due
// archivi che divergono.
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'Static Meter'));
} catch (_) { /* dev/non-packaged: ignore */ }

// ── QUALE DELLE DUE INTERFACCE SI APRE ───────────────────────────────────────
// Un solo `main.cjs` per due applicazioni: quel che cambia è la pagina che si carica, perché
// il resto — server locale, Bluetooth, HID, archivio, PDF — è identico e non va scritto due
// volte. Il nome del prodotto lo mette electron-builder; in sviluppo si può forzare con
// SM_ENTRY=serenity.html, dove il nome è ancora quello del package.
// L'entrata è SCRITTA nel pacchetto (`smEntry`), non dedotta dal nome: dedurla vorrebbe dire
// che un giorno, su un'altra piattaforma o dopo un cambio di nome, si apre l'interfaccia
// sbagliata senza un messaggio. In sviluppo, dove il pacchetto non c'è, si forza con
// SM_ENTRY=serenity.html; se non è scritto niente, si apre EQUILIBRIUM.
let ENTRY = 'index.html';
try { ENTRY = process.env.SM_ENTRY || require('./package.json').smEntry || 'index.html'; }
catch (_) { /* package.json illeggibile: EQUILIBRIUM */ }

// Kill whatever process is occupying PORT (macOS/Linux only)
function freePort(port) {
  try {
    const pids = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
    if (pids) {
      pids.split('\n').forEach(pid => {
        try { process.kill(Number(pid), 'SIGKILL'); } catch (_) {}
      });
      console.log(`[Static Meter] Freed port ${port} (PIDs: ${pids.replace(/\n/g, ', ')})`);
    }
  } catch (_) { /* port was already free */ }
}

let _httpServer = null;

// ── BLE state — module-level so ipcMain handlers (registered once) can access it ──
let _bleCallback  = null;
let _bleForEmeter = false;
// FIX MUSE-RECONNECT: se il Muse non compare nello scan, la richiesta Bluetooth restava APPESA
// PER SEMPRE (il picker del renderer a cui veniva inoltrata la lista non esiste) → connect() mai
// risolto → "searching" infinito e i tentativi successivi avvelenati. Ora lo scan ha un timeout:
// scaduto, si risponde '' (annulla) e il renderer riceve un errore PULITO e può riprovare.
let _bleScanTimer = null;
const BLE_SCAN_TIMEOUT_MS = 12000;
function _bleAnswer(deviceId) {
  if (_bleScanTimer) { clearTimeout(_bleScanTimer); _bleScanTimer = null; }
  if (_bleCallback) {
    const cb = _bleCallback;
    _bleCallback = null;
    _bleForEmeter = false;
    try { cb(deviceId || ''); } catch (_) {}
  }
}

// Renderer picks a BLE device → complete the pending BLE request
ipcMain.handle('ble-select', (_e, deviceId) => {
  _bleAnswer(deviceId);
  return { ok: true };
});

// FIX MUSE-RECONNECT: il renderer annulla ESPLICITAMENTE una ricerca (bottone premuto di nuovo,
// timeout lato renderer). Senza questo, la callback pendente restava appesa in Chromium.
ipcMain.handle('ble-cancel', () => {
  _bleAnswer('');
  return { ok: true };
});

// Renderer signals whether the NEXT BLE scan is for E-meter mode
ipcMain.handle('ble-set-emeter-mode', (_e, isEmeter) => {
  _bleForEmeter = isEmeter;
  return { ok: true };
});

// ── CORPUS ────────────────────────────────────────────────────────────────────
// L'archivio delle esperienze, in JSON Lines, in una cartella SUA — non fra i dati di sessione:
// così si copia, si spedisce e si dà in pasto a un'AI senza portarsi dietro il resto.
// Si scrive in AGGIUNTA e mai si riscrive: due processi che scrivessero insieme non si
// corrompono a vicenda, e un file di 200 MB non va riletto per aggiungere una riga.
const CORPUS_DIR = path.join(os.homedir(), 'EQUILIBRIUM', 'corpus');
ipcMain.handle('corpus-append', (_e, { file, line }) => {
  try {
    if (typeof file !== 'string' || typeof line !== 'string') return { ok: false, error: 'bad args' };
    // Nome di file imposto dal chiamante: si accetta SOLO la forma attesa, o un percorso
    // costruito ad arte potrebbe far scrivere altrove.
    if (!/^[0-9]{4}-[0-9]{2}\.jsonl$/.test(file)) return { ok: false, error: 'bad file name' };
    if (line.includes('\n')) return { ok: false, error: 'newline in record' };
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
    fs.appendFileSync(path.join(CORPUS_DIR, file), line + '\n', 'utf8');
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});
ipcMain.handle('corpus-folder', () => CORPUS_DIR);

// ── PROCEDIMENTI (COMANDI) ───────────────────────────────────────────────────────────────
// Segnalato (SERENITY): « consenti la selezione di procedimenti presenti nella cartella
// COMANDI/Procedimenti ». La cartella non esisteva — la si crea qui, sotto HOME, accanto a
// CORPUS_DIR (stesso principio: un posto che si apre in Finder, si copia, si scrive a mano,
// non nascosto dentro `userData`). Un file .txt per procedimento — il nome del file (senza
// estensione) è il titolo mostrato nell'app.
//
// ── IL FORMATO, RIVISTO DI NUOVO — segnalato: « il numero davanti a una frase indica la
// domanda; le linee seguenti senza numero sono le indicazioni per l'auditor e devono apparire
// con la domanda, in corsivo ». Il marcatore non è più `#` (bisognava ricordarsi di scriverlo
// davanti a ogni nota): ora è il NUMERO stesso, la cosa che un auditor scrive già da sé
// copiando una procedura numerata — una riga che comincia con un numero (`1.`, `1)`, `1 -`,
// `1:` o solo `1 `) è una nuova domanda; una riga che NON comincia con un numero è
// un'indicazione per l'auditor, e si aggancia alla domanda appena prima. Un `#` davanti a una
// nota resta accettato e tolto (compatibilità con procedimenti scritti nel formato
// precedente), ma non è più richiesto. Riga vuota: solo un separatore, non chiude il gruppo.
const PROCEDIMENTI_DIR = path.join(os.homedir(), 'EQUILIBRIUM', 'COMANDI', 'Procedimenti');
const RE_DOMANDA_NUMERATA = /^\d+\s*[.)\-:]?\s*(.*)$/;
ipcMain.handle('procedimenti-list', () => {
  try {
    fs.mkdirSync(PROCEDIMENTI_DIR, { recursive: true });
    return fs.readdirSync(PROCEDIMENTI_DIR)
      .filter(f => f.toLowerCase().endsWith('.txt'))
      .sort()
      .map(f => {
        const testo = fs.readFileSync(path.join(PROCEDIMENTI_DIR, f), 'utf8');
        const righe = testo.split('\n').map(r => r.trim());
        const comandi = [];
        for (const riga of righe) {
          if (!riga) continue;                       // riga vuota: separatore, non conta
          const domanda = riga.match(RE_DOMANDA_NUMERATA);
          // Il testo dopo il numero deve restare qualcosa — una riga che è SOLO un numero
          // (nessuna domanda dopo) non ha senso come domanda vuota: cade nel ramo nota, sotto.
          if (domanda && domanda[1].trim()) {
            comandi.push({ testo: domanda[1].trim(), note: [] });
            continue;
          }
          // Niente numero davanti: è un'indicazione per l'auditor, si aggancia alla domanda
          // appena prima. Un `#` iniziale (il vecchio marcatore) si toglie se c'è, non è più
          // richiesto.
          const nota = riga.startsWith('#') ? riga.slice(1).trim() : riga;
          // Una nota prima di qualunque domanda non ha a cosa agganciarsi: si scarta — non un
          // errore, solo niente da mostrare.
          if (nota && comandi.length) comandi[comandi.length - 1].note.push(nota);
        }
        return { nome: f.replace(/\.txt$/i, ''), comandi };
      })
      .filter(p => p.comandi.length > 0);   // un file vuoto non è un procedimento da mostrare
  } catch (e) { return []; }
});
// Crea la cartella se manca e la apre in Finder — l'auditor non deve saperne il percorso a
// memoria né crearla a mano: un bottone in PROCESSUS chiama questo, e la cartella è lì.
ipcMain.handle('procedimenti-folder-open', () => {
  try {
    fs.mkdirSync(PROCEDIMENTI_DIR, { recursive: true });
    shell.openPath(PROCEDIMENTI_DIR);
    return { ok: true, dir: PROCEDIMENTI_DIR };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// CONN-76: native clipboard read — navigator.clipboard.readText() is blocked in
// the Electron renderer, so "paste from clipboard" never pasted. Read via the
// main process instead.
ipcMain.handle('clipboard-read', () => {
  try { return clipboard.readText() || ''; } catch (_) { return ''; }
});

// ── CONN-71: native macOS speech-to-text sidecar (SFSpeechRecognizer) ─────────
// Spawns the compiled `sm-stt` Swift helper, streams its newline-JSON output to
// the renderer over the 'stt-data' channel. Real-time, on-device, low latency.
let _sttProc = null;
function sttBinaryPath() {
  // Packaged: Contents/Resources/sm-stt ; dev: ./native/sm-stt
  const packaged = path.join(process.resourcesPath || '', 'sm-stt');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, 'native', 'sm-stt');
}
function sttSend(payload) {
  const w = BrowserWindow.getAllWindows()[0];
  if (w && !w.isDestroyed()) w.webContents.send('stt-data', payload);
}
ipcMain.handle('stt-start', (_e, locale) => {
  if (process.platform !== 'darwin') return { ok: false, error: 'native STT is macOS-only' };
  try {
    if (_sttProc) { try { _sttProc.kill('SIGKILL'); } catch (_) {} _sttProc = null; }
    const bin = sttBinaryPath();
    if (!fs.existsSync(bin)) return { ok: false, error: 'sidecar not found' };
    _sttProc = spawn(bin, [String(locale || 'en-US')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    _sttProc.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try { sttSend(JSON.parse(line)); } catch (_) {}
      }
    });
    _sttProc.stderr.on('data', (d) => console.warn('[sm-stt]', d.toString().trim()));
    _sttProc.on('exit', (code) => { sttSend({ type: 'status', value: 'exited', msg: String(code) }); _sttProc = null; });
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});
ipcMain.handle('stt-stop', () => {
  if (_sttProc) {
    const p = _sttProc; _sttProc = null;
    try { p.stdin.write('stop\n'); } catch (_) {}
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (_) {} }, 600);
  }
  return { ok: true };
});
app.on('before-quit', () => { if (_sttProc) { try { _sttProc.kill('SIGKILL'); } catch (_) {} _sttProc = null; } });

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const { server } = createAppServer({ port: PORT, distDir: DIST_DIR, entry: ENTRY });
    _httpServer = server;

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Static Meter] Port ${PORT} in use — freeing and retrying…`);
        server.close();
        freePort(PORT);
        setTimeout(() => {
          const { server: server2 } = createAppServer({ port: PORT, distDir: DIST_DIR, entry: ENTRY });
          _httpServer = server2;
          server2.on('error', (err2) => { reject(err2); });
          server2.listen(PORT, '0.0.0.0', () => {
            console.log(`[Static Meter] Server ready (retry) — LAN: http://${getLanIp()}:${PORT}`);
            resolve(server2);
          });
        }, 800);
      } else {
        reject(err);
      }
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Static Meter] Server ready — LAN: http://${getLanIp()}:${PORT}`);
      resolve(server);
    });
  });
}

app.commandLine.appendSwitch('enable-features', 'WebBluetooth');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'EQUILIBRIUM',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // CONN-75: enable the built-in Chromium PDF viewer (PDFium) so processus
      // PDFs render INSIDE the in-app <iframe>. Without this the embedded PDF
      // stayed blank/transparent until detached into a separate window.
      plugins: true,
    }
  });

  // ── BLE device picker ──────────────────────────────────────────────────────
  // _bleCallback and _bleForEmeter live at module scope (see top of file).
  // ipcMain handlers for 'ble-select' and 'ble-set-emeter-mode' are also
  // registered at module scope to avoid "second handler" crash on reload.

  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    const isNewScan = !_bleCallback;   // l'evento rispara con la lista aggiornata: 1 timer per scan
    _bleCallback = callback;

    // Auto-select Muse 2 (legacy path — no UI needed)
    const museDevice = deviceList.find(d => d.deviceName && d.deviceName.includes('Muse'));
    if (museDevice && !_bleForEmeter) {
      _bleAnswer(museDevice.deviceId);
      return;
    }

    // Niente Muse (ancora): NON restare appesi per sempre. Il timer parte al PRIMO evento dello
    // scan; se il Muse non compare entro il timeout, si annulla e il renderer riceve l'errore.
    if (isNewScan) {
      if (_bleScanTimer) clearTimeout(_bleScanTimer);
      _bleScanTimer = setTimeout(() => _bleAnswer(''), BLE_SCAN_TIMEOUT_MS);
    }

    // Forward the current device list to the renderer so it can show a picker
    if (!win.isDestroyed()) {
      win.webContents.send('ble-devices', deviceList);
    }
  });

  // FIX #1: allow window.open() popups (e.g. "Détacher" a Processus PDF into its
  // own window). Modern Electron DENIES renderer window.open by default unless a
  // handler explicitly allows it → the detach button silently failed (w === null).
  // We allow our own server-served pages (PDF viewer) in a real child window with
  // the PDF plugin enabled; everything else opens in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open our own server pages AND in-memory documents (blob:/data: — e.g. the
    // History session PDFs, the Processus "Détacher") in a real child window with
    // the Chromium PDF plugin. FIX: previously blob:/data: fell through to
    // shell.openExternal → macOS replied "no application configured to open the
    // URL blob:…" and the History PDF never opened.
    //
    // ⚠️ BUG TROVATO — segnalato: « quand j'appuie sur view du PDF... il me dit que aucune
    // appli pour ouvrir about:blank ». Causa: `HistoryModal.openPdf` (giro precedente, fix
    // per il window.open perso dopo un await) apre ORA una finestra VUOTA subito nel click
    // (`window.open('', '_blank')`, url `about:blank`) per non perdere il gesto dell'utente,
    // e le dà l'indirizzo vero solo dopo. `about:blank` non è né `isLocal` né `isInline` —
    // cadeva anche lei in `shell.openExternal`, che su `about:blank` non ha un'app di
    // sistema a cui appoggiarsi. Aggiunta come terzo caso ammesso: è una finestra APERTA DA
    // NOI, non un link esterno cliccato dall'utente.
    const isLocal  = url.startsWith(`http://127.0.0.1:${PORT}`) || url.startsWith('http://localhost:' + PORT);
    const isInline = url.startsWith('blob:') || url.startsWith('data:');
    const isBlank  = url === 'about:blank';
    if (isLocal || isInline || isBlank) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900, height: 900, autoHideMenuBar: true,
          webPreferences: { plugins: true },
        },
      };
    }
    try { shell.openExternal(url); } catch (_) {}
    return { action: 'deny' };
  });

  // SECURITY (A5): only grant the permissions the app actually needs (camera/mic
  // for remote sessions, Web Bluetooth for the Muse) instead of approving every
  // permission unconditionally.
  const ALLOWED_PERMS = ['media', 'audioCapture', 'videoCapture', 'bluetooth', 'hid'];
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMS.includes(permission));
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMS.includes(permission));
  });

  // ── Theta-Meter : sélecteur HID ────────────────────────────────────────────
  // L'e-meter USB de l'utilisateur est un NXP LPC13xx qui se présente en HID
  // « vendor-defined » (PAS un port série, malgré les traces FTDI dans le logiciel
  // Theta-Meter). Comme son VID/PID est unique, on le choisit AUTOMATIQUEMENT —
  // même approche que le Muse plus haut : aucune interface de sélection à écrire.
  // VID seul, PAS le PID : il existe plusieurs modèles de Theta-Meter, et sur un autre modèle
  // le PID change — l'appareil n'apparaissait alors même pas dans le sélecteur, et sans
  // connexion on ne voyait ni le TA ni le moyen de l'étalonner (constaté chez un testeur).
  const THETA_VID = 0x1fc9;   // NXP Semiconductors
  const estLeMeter = d => d && d.vendorId === THETA_VID;

  win.webContents.session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const meter = (details.deviceList || []).find(estLeMeter);
    // null = « aucun choix » : le renderer reçoit un rejet propre au lieu d'attendre.
    callback(meter ? meter.deviceId : null);
  });

  // Sans ceci l'autorisation est oubliée à chaque redémarrage et il faudrait
  // re-choisir l'appareil à chaque session. On n'autorise QUE ce meter.
  win.webContents.session.setDevicePermissionHandler(
    details => details.deviceType === 'hid' && estLeMeter(details.device));

  // Notify the renderer when SM moves or resizes so TM can follow
  // Chiusura con una seduta in corso: si FERMA e si chiede. Vale per la crocetta, per Cmd+Q e
  // per « Esci » dal menu — tutti passano di qui.
  win.on('close', (e) => {
    if (_closeConfirmed || !_sessionActive || win.isDestroyed()) return;
    e.preventDefault();
    win.webContents.send('app-close-request');
  });

  win.on('move',   () => { if (!win.isDestroyed()) win.webContents.send('window-moved'); });
  win.on('resize', () => { if (!win.isDestroyed()) win.webContents.send('window-resized'); });

  win.loadURL(`http://127.0.0.1:${PORT}/${ENTRY}`).catch(console.error);
}


// ── CHIUSURA CON UNA SEDUTA APERTA ───────────────────────────────────────────
// Uscire mentre si audita perdeva tutto senza una parola. Ma la seduta VIVE nel renderer: qui
// non c'è niente da salvare, si può solo FERMARE la chiusura e chiedere. Il renderer mostra la
// domanda e, quando ha finito (salvato o no), dice di procedere.
//
// Il flag lo tiene il renderer perché è lui a sapere se una seduta è in corso; qui si conserva
// solo l'ultimo valore ricevuto — e si azzera se la finestra sparisce, o una chiusura fallita
// lascerebbe l'applicazione impossibile da chiudere.
let _sessionActive = false;
let _closeConfirmed = false;
ipcMain.handle('session-active', (_e, attiva) => { _sessionActive = !!attiva; return { ok: true }; });
ipcMain.handle('close-confirmed', () => {
  _closeConfirmed = true;
  _sessionActive = false;
  const w = BrowserWindow.getAllWindows()[0];
  if (w && !w.isDestroyed()) w.close();
  return { ok: true };
});

// ── IPC: save session PDF ────────────────────────────────────────────────────
ipcMain.handle('save-pdf-to-disk', async (_e, { filename, base64 }) => {
  try {
    const sessionsDir = path.join(app.getPath('userData'), 'appdata', 'session-pdfs');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
    // SECURITY (A4): strip any path components from the renderer-supplied filename
    // so it can never escape sessionsDir (e.g. "../../evil").
    const safeName = path.basename(String(filename || ''));
    if (!safeName) return { ok: false, error: 'invalid filename' };
    const filePath = path.join(sessionsDir, safeName);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('get-sessions-folder', () =>
  path.join(app.getPath('userData'), 'appdata', 'session-pdfs')
);

// ── IPC: Return SM content bounds ─────────────────────────────────────────────
ipcMain.handle('get-content-bounds', () => {
  const smWin = BrowserWindow.getAllWindows()[0];
  return smWin ? smWin.getContentBounds() : null;
});

app.whenReady().then(async () => {
  freePort(PORT);
  await new Promise(r => setTimeout(r, 400));
  await startLocalServer();
  createWindow();

  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      console.log('[TM] Accessibility not granted — prompting user…');
      systemPreferences.isTrustedAccessibilityClient(true);
    } else {
      console.log('[TM] Accessibility already granted.');
    }
  }
});

app.on('window-all-closed', () => {
  stopTunnel();
  if (_httpServer) { _httpServer.closeAllConnections?.(); _httpServer.close(); }
  if (process.platform !== 'darwin') app.quit();
});

// Cmd+Q non passa da `close` finché la finestra non accetta di chiudersi: si intercetta anche
// qui, o l'uscita da tastiera aggirerebbe la domanda.
app.on('before-quit', (e) => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!_closeConfirmed && _sessionActive && w && !w.isDestroyed()) {
    e.preventDefault();
    w.webContents.send('app-close-request');
    return;
  }
  stopTunnel();
  if (_httpServer) { _httpServer.closeAllConnections?.(); _httpServer.close(); _httpServer = null; }
});
