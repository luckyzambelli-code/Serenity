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
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'Static Meter'));
} catch (_) { /* dev/non-packaged: ignore */ }

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
    const { server } = createAppServer({ port: PORT, distDir: DIST_DIR });
    _httpServer = server;

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Static Meter] Port ${PORT} in use — freeing and retrying…`);
        server.close();
        freePort(PORT);
        setTimeout(() => {
          const { server: server2 } = createAppServer({ port: PORT, distDir: DIST_DIR });
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
    const isLocal  = url.startsWith(`http://127.0.0.1:${PORT}`) || url.startsWith('http://localhost:' + PORT);
    const isInline = url.startsWith('blob:') || url.startsWith('data:');
    if (isLocal || isInline) {
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
  const ALLOWED_PERMS = ['media', 'audioCapture', 'videoCapture', 'bluetooth'];
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMS.includes(permission));
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMS.includes(permission));
  });

  // Notify the renderer when SM moves or resizes so TM can follow
  win.on('move',   () => { if (!win.isDestroyed()) win.webContents.send('window-moved'); });
  win.on('resize', () => { if (!win.isDestroyed()) win.webContents.send('window-resized'); });

  win.loadURL(`http://127.0.0.1:${PORT}/index.html`).catch(console.error);
}


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

app.on('before-quit', () => {
  stopTunnel();
  if (_httpServer) { _httpServer.closeAllConnections?.(); _httpServer.close(); _httpServer = null; }
});
