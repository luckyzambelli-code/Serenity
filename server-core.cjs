/**
 * server-core.cjs — shared server logic for both server.cjs (Chrome) and main.cjs (Electron).
 *
 * Provides:
 *   - Express app with PeerJS signaling at /peerjs
 *   - /api/server-info  → { lanIp, port }
 *   - /api/tunnel       → POST: start Cloudflare tunnel; GET: status; DELETE: stop
 *   - Static file serving with SPA fallback
 *
 * Tunnel: uses Cloudflare cloudflared (trycloudflare.com) — no bypass page, no account needed.
 * Replaced localtunnel (loca.lt) which intercepted PeerJS HTTP requests with a bypass HTML page,
 * causing the client-side PeerJS init to fail with a JSON parse error.
 *
 * Usage:
 *   const { createAppServer } = require('./server-core.cjs');
 *   const { server, app } = createAppServer({ port: 7893, distDir: __dirname + '/dist' });
 *   server.listen(port, '0.0.0.0', callback);
 */

const http    = require('http');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const crypto  = require('crypto');
const express = require('express');
const { handleApi }         = require('./api-routes.cjs');
const { ExpressPeerServer } = require('peer');

// ── Auth ─────────────────────────────────────────────────────────────────────
// FIX H1 + CONN-1: static PeerJS key persisted across server restarts.
//
// Original H1 design regenerated the key on every server start, which forced
// every connection link to become 401 the moment the auditor closed/reopened
// the app. The participant's auto-reconnect (after a transient network drop)
// would also fail because the embedded key was now stale.
//
// CONN-1: we now persist the key in ~/.static-meter/peerjs-key (or platform
// equivalent). The file is created at first startup and reused across all
// subsequent restarts. The participant link, once shared, stays valid as long
// as the auditor uses the same machine/user account.
//
// Security model unchanged: the file lives in the user's HOME — only this
// user (or processes running as this user) can read it. External actors who
// only know the tunnel URL still need the embedded key to connect.
function _resolvePeerJsKey() {
  const dir  = path.join(os.homedir(), '.static-meter');
  const file = path.join(dir, 'peerjs-key');
  try {
    if (fs.existsSync(file)) {
      const k = fs.readFileSync(file, 'utf8').trim();
      if (/^[0-9a-f]{16}$/.test(k)) return k; // valid 16-char hex
    }
  } catch (_) { /* unreadable — regenerate below */ }
  const k = crypto.randomBytes(8).toString('hex');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, k, { mode: 0o600 });
  } catch (_) { /* unwriteable — key will regenerate next time, accept the cost */ }
  return k;
}
const PEERJS_KEY = _resolvePeerJsKey();

// ── LAN IP ───────────────────────────────────────────────────────────────────
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of (ifaces[name] || [])) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.mjs':  'application/javascript',   '.css': 'text/css',
  '.json': 'application/json',         '.svg': 'image/svg+xml',
  '.png':  'image/png',                '.ico': 'image/x-icon',
  '.jpg':  'image/jpeg',               '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',                '.webp': 'image/webp',
  '.woff2':'font/woff2',               '.woff': 'font/woff',
  '.ttf':  'font/ttf',                 '.wasm': 'application/wasm',
};

// ── Tunnel state (shared within process) ─────────────────────────────────────
let _tunnel       = null;  // cloudflared Tunnel instance
let _tunnelUrl    = null;  // public URL string  (https://xxx.trycloudflare.com)

const TUNNEL_TIMEOUT_MS = 40_000; // cloudflared startup can take ~5–15 s

// FIX CONN-5: keep-alive for trycloudflare quick-tunnels.
// Quick-tunnels close after ~5 min of complete inactivity. The SSE relay
// keepalive only fires when a participant is actively connected — but while
// the auditor is WAITING for a participant to click the link, there's no
// traffic, so the tunnel can die in the meantime. We fire a tiny GET to our
// own tunnel URL every 90 s as long as the tunnel is up. Bandwidth: ~1 KB.
let _tunnelKeepAlive = null;
function _startTunnelKeepAlive() {
  if (_tunnelKeepAlive) return;
  _tunnelKeepAlive = setInterval(() => {
    if (!_tunnelUrl) return;
    // Use the lightweight server-info endpoint — no side effects.
    fetch(`${_tunnelUrl}/api/server-info`, { method: 'GET' }).catch(() => {});
  }, 90_000);
  // Don't keep the process alive just for the keepalive
  if (typeof _tunnelKeepAlive.unref === 'function') _tunnelKeepAlive.unref();
}
function _stopTunnelKeepAlive() {
  if (_tunnelKeepAlive) { clearInterval(_tunnelKeepAlive); _tunnelKeepAlive = null; }
}

function startTunnel(port) {
  if (_tunnel) return Promise.resolve(_tunnelUrl);  // already running

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (err, url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err); else resolve(url);
    };

    const timer = setTimeout(() => {
      try { if (_tunnel) _tunnel.stop(); } catch (_) {}
      _tunnel = null; _tunnelUrl = null;
      settle(new Error('Cloudflare tunnel timeout (>40 s) — check internet connection'));
    }, TUNNEL_TIMEOUT_MS);

    let cfTunnel;
    try {
      const { Tunnel, use, DEFAULT_CLOUDFLARED_BIN } = require('cloudflared');

      // Re-apply asar path fix in case require('cloudflared') was called fresh here
      const binPath = DEFAULT_CLOUDFLARED_BIN;
      if (binPath && binPath.includes('.asar') && !binPath.includes('.asar.unpacked')) {
        use(binPath.replace(/\.asar([/\\])/, '.asar.unpacked$1'));
      }

      // cloudflared tunnel --url http://localhost:PORT --no-autoupdate
      cfTunnel = new Tunnel([
        'tunnel',
        '--url', `http://localhost:${port}`,
        '--no-autoupdate',
      ]);
    } catch (err) {
      settle(new Error(`Cannot load cloudflared: ${err.message}`));
      return;
    }

    // 'url' event fires when cloudflared prints the trycloudflare.com URL
    cfTunnel.once('url', (url) => {
      _tunnel    = cfTunnel;
      _tunnelUrl = url;
      console.log(`  🌍 Tunnel Cloudflare actif: ${url}`);
      _startTunnelKeepAlive(); // FIX CONN-5: prevent idle timeout

      // Clean up state when the process exits
      cfTunnel.process.once('close', () => {
        _tunnel = null; _tunnelUrl = null;
        _stopTunnelKeepAlive();
        console.log('  Tunnel Cloudflare fermé.');
      });

      settle(null, url);
    });

    cfTunnel.process.once('error', (err) => {
      _tunnel = null; _tunnelUrl = null;
      settle(new Error(`Cloudflare tunnel process error: ${err.message}`));
    });

    // If cloudflared exits before emitting a URL (bad binary, permission error, etc.)
    cfTunnel.process.once('close', (code) => {
      if (!_tunnelUrl) {
        _tunnel = null;
        settle(new Error(`Cloudflare tunnel exited (code ${code}) — ensure cloudflared binary is executable`));
      }
    });
  });
}

function stopTunnel() {
  _stopTunnelKeepAlive();
  if (_tunnel) {
    try { _tunnel.stop(); } catch (_) {}
    _tunnel = null; _tunnelUrl = null;
  }
}

function getTunnelUrl() { return _tunnelUrl; }

// ── SECURITY: distinguere una richiesta arrivata dal tunnel pubblico da una locale/LAN ──
// Segnalato nella revisione completa: l'intera `/api/*` (profili, sedute, PDF dei processus,
// e le rotte che eseguono AppleScript per Theta-Meter) non aveva NESSUN controllo — e durante
// ogni seduta a distanza è raggiungibile non solo in LAN ma dal tunnel Cloudflare PUBBLICO,
// perché `cloudflared` non fa che inoltrare a questo stesso server (v. `startTunnel`, sopra:
// `--url http://localhost:${port}`). Il TCP non aiuta a distinguere: cloudflared è un processo
// LOCALE, quindi anche una richiesta relayata dal tunnel arriva con `remoteAddress` di loopback,
// identico a una vera richiesta locale. Quel che INVECE resta diverso è l'header Host:
// cloudflared preserva quello originale (`xxxx.trycloudflare.com`) quando inoltra, mentre
// l'app stessa (il proprio renderer) chiama sempre la propria stessa origine
// (`127.0.0.1:porta` o l'IP di LAN). Confrontare l'Host con l'hostname noto del tunnel è quindi
// un segnale affidabile — usato sotto per tenere i dati personali e le rotte di controllo
// macchina irraggiungibili da internet, lasciando aperto solo il percorso dati della seduta a
// distanza vera e propria (`/peerjs/*`, `/api/relay*`), che è l'unico scopo del tunnel.
function _tunnelHost() {
  if (!_tunnelUrl) return null;
  try { return new URL(_tunnelUrl).host.toLowerCase(); } catch (_) { return null; }
}
function isFromTunnel(req) {
  const h = _tunnelHost();
  return !!h && (req.headers.host || '').toLowerCase() === h;
}

// ── App factory ───────────────────────────────────────────────────────────────
function createAppServer({ port, distDir, entry = 'index.html' }) {
  const app    = express();
  const server = http.createServer(app);

  // FIX CONN-17b: SHARE the HTTP server's upgrade event between two
  // WebSocket-using services: PeerJS signaling AND our relay channel.
  //
  // Problem: `ws.WebSocketServer({ path, server })` auto-attaches an upgrade
  // listener that DESTROYS the socket on URL mismatch. PeerJS uses this
  // pattern, so any non-PeerJS WS URL (like `/api/relay-ws/...`) gets killed
  // by PeerJS's listener even after our own listener has accepted it.
  //
  // Solution: disable PeerJS auto-attach by overriding `createWebSocketServer`
  // to use `noServer: true`. We then implement a single shared upgrade
  // dispatcher that routes by URL prefix:
  //   • `/peerjs/...`         → PeerJS's wss.handleUpgrade
  //   • `/api/relay-ws/...`   → our relay wss.handleUpgrade
  //   • otherwise              → 400 + destroy
  const { WebSocketServer: _WSS } = require('ws');
  let peerJsWss = null; // captured below via createWebSocketServer override
  const peerMw = ExpressPeerServer(server, {
    path: '/', allow_discovery: false, debug: false,
    key: PEERJS_KEY,
    createWebSocketServer: (_opts) => {
      peerJsWss = new _WSS({ noServer: true });
      return peerJsWss;
    },
  });

  const wsRelay = require('./api-routes.cjs').createWsRelay();
  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (url.startsWith('/api/relay-ws/')) {
      wsRelay.handleUpgrade(req, socket, head);
    } else if (url.startsWith('/peerjs/') && peerJsWss) {
      peerJsWss.handleUpgrade(req, socket, head, (ws) => {
        peerJsWss.emit('connection', ws, req);
      });
    } else {
      // Unknown upgrade target — reject cleanly
      try { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (_) {}
      socket.destroy();
    }
  });

  // FIX H1: validate PeerJS key before passing to the signaling middleware.
  // PeerJS clients encode the key as the first URL path segment after the mount:
  //   GET /peerjs/{key}/id/{peerId}  or  WS /peerjs/{key}?id=...
  // Express strips the mount prefix, so inside this handler req.url = /{key}/...
  app.use('/peerjs', (req, res, next) => {
    const parts    = req.url.split('/');            // ['', key, ...]
    const clientKey = (parts[1] || '').split('?')[0]; // strip any query string
    if (clientKey !== PEERJS_KEY) {
      res.status(401).set('Content-Type', 'text/plain').send('Unauthorized');
      return;
    }
    next();
  }, peerMw);

  // 2. API routes
  // ⚠️ CORRETTO — segnalato: la vecchia frase « external actors don't have it » era falsa,
  // bastava chiamare QUESTA rotta sul tunnel per ottenere `peerKey` senza nessun link. Nessun
  // preclear/partecipante la chiama mai (v. `useRemoteSession.ts`/`App.tsx`: solo l'auditor,
  // sulla propria stessa origine) — bloccata quando arriva dal tunnel pubblico, invariata per
  // chi la chiama davvero (l'app stessa, in locale/LAN).
  app.get('/api/server-info', (req, res) => {
    if (isFromTunnel(req)) { res.status(403).json({ error: 'not available over the public tunnel' }); return; }
    // FIX H1: include peerKey so the auditor frontend can embed it in the link.
    res.json({ lanIp: getLanIp(), port, tunnelUrl: _tunnelUrl, peerKey: PEERJS_KEY });
  });

  // POST /api/tunnel  → start tunnel, returns { url }
  // GET  /api/tunnel  → status, returns { url } or { url: null }
  // DELETE /api/tunnel → stop tunnel
  // ⚠️ POST/DELETE bloccati dal tunnel — nessun chiamante remoto legittimo (solo l'auditor
  // avvia/ferma il PROPRIO tunnel, sempre in locale) e un estraneo che arrivasse a spegnerlo
  // interromperebbe una seduta in corso. Il GET resta aperto apposta: `App.tsx`
  // (`refreshSignalingForReconnect`, CONN-3) lo chiama DAL PARTECIPANTE proprio sull'host del
  // tunnel per sapere se è ancora vivo dopo un blip di rete — bloccarlo romperebbe quel
  // controllo, l'unico caso in cui una rotta di `/api/tunnel` è chiamata legittimamente da fuori.
  app.post('/api/tunnel', express.json(), async (req, res) => {
    if (isFromTunnel(req)) { res.status(403).json({ error: 'not available over the public tunnel' }); return; }
    try {
      const url = await startTunnel(port);
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get('/api/tunnel', (_req, res) => {
    res.json({ url: _tunnelUrl });
  });
  app.delete('/api/tunnel', (req, res) => {
    if (isFromTunnel(req)) { res.status(403).json({ error: 'not available over the public tunnel' }); return; }
    stopTunnel();
    res.json({ ok: true });
  });

  // FIX: Express strips the mount prefix '/api' from req.url before passing to
  // the middleware, so req.url becomes '/health' instead of '/api/health'.
  // handleApi expects the full '/api/...' path for its route matching — re-prepend it.
  app.use('/api', async (req, res, next) => {
    const saved  = req.url;
    req.url      = '/api' + (req.url || '/');
    // ⚠️ AGGIUNTO — `handleApi` (in `api-routes.cjs`) usa questo per bloccare le rotte che
    // toccano dati personali o comandi macchina quando la richiesta arriva dal tunnel pubblico.
    // Calcolato qui perché `_tunnelUrl` vive in questo modulo, non in `api-routes.cjs`.
    req._smFromTunnel = isFromTunnel(req);
    const handled = await handleApi(req, res);
    req.url = saved;          // restore in case next() needs the original path
    if (!handled) next();
  });

  // 3. Static files + SPA fallback
  //
  // ⚠️ SEGNALATO: « fai in modo che 127.0.0.1:7893 sia SERENITY ». La radice "/" e i due
  // ripieghi qui sotto scrivevano `index.html` a mano — SEMPRE EQUILIBRIUM, anche quando il
  // server che gira è quello di SERENITY (main.cjs lo capisce già, e naviga la SUA finestra
  // su `/${ENTRY}` — v. `win.loadURL`, sotto — ma qualunque ALTRO client, un browser aperto
  // sulla porta nuda o un dispositivo remoto sul tunnel, riceveva comunque EQUILIBRIUM). Ora
  // `entry` arriva da chi crea il server (lo stesso `ENTRY` che main.cjs già calcola da
  // `SM_ENTRY`/`package.json.smEntry`) — la radice segue DAVVERO quale app sta girando,
  // invece di darla per scontata.
  const _distRoot = path.resolve(distDir);
  const _entryFile = '/' + entry.replace(/^\/+/, '');
  app.use((req, res) => {
    let urlPath = (req.url || '/').split('?')[0];
    try { urlPath = decodeURIComponent(urlPath); } catch (_) { /* keep raw */ }
    if (urlPath === '/') urlPath = _entryFile;
    // SECURITY (A1): confine resolution to distDir. req.url is NOT normalised by
    // Node, so '../' (raw or %2e-encoded) would otherwise escape distDir and read
    // arbitrary files — and this server is reachable from the public Cloudflare
    // tunnel. We normalise, resolve, and verify the result stays under distRoot;
    // anything that escapes falls through to the SPA index (never leaks a file).
    const file = path.resolve(_distRoot, '.' + path.posix.normalize('/' + urlPath.replace(/\\/g, '/')));
    if (file !== _distRoot && !file.startsWith(_distRoot + path.sep)) {
      fs.readFile(path.join(_distRoot, entry), (_e, b) => {
        if (_e) { res.status(404).end(); return; }
        res.set({ 'Content-Type': 'text/html; charset=utf-8',
                  'Cross-Origin-Opener-Policy': 'same-origin',
                  'Cross-Origin-Embedder-Policy': 'credentialless' }).end(b);
      });
      return;
    }

    fs.readFile(file, (err, buf) => {
      if (err) {
        fs.readFile(path.join(distDir, entry), (_e, b) => {
          if (_e) { res.status(404).end(); return; }
          res.set({ 'Content-Type': 'text/html; charset=utf-8',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Embedder-Policy': 'credentialless' }).end(b);
        });
        return;
      }
      const ct = MIME[path.extname(file)] || 'application/octet-stream';
      res.set({ 'Content-Type': ct,
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'credentialless' }).end(buf);
    });
  });

  return { server, app, getLanIp, stopTunnel, getTunnelUrl };
}

module.exports = { createAppServer, getLanIp, startTunnel, stopTunnel, getTunnelUrl };
