/**
 * api-routes.cjs — Shared REST API handler
 * Used by both server.cjs (Chrome mode) and main.cjs (Electron mode).
 *
 * All data is stored in ~/Library/Application Support/Static Meter/appdata/
 *
 * Routes:
 *   GET  /api/health
 *   GET  /api/profiles           POST /api/profiles
 *   GET  /api/sessions           POST /api/sessions
 *   GET  /api/settings           POST /api/settings
 *   GET  /api/processus          POST /api/processus         (list / upload)
 *   GET  /api/processus/:id      DELETE /api/processus/:id   (file / delete)
 *   GET  /api/session-pdfs/:id   POST /api/session-pdfs      (fetch / save)
 *   GET  /api/relay/:roomId      POST /api/relay/:roomId     (SSE relay channel)
 *   GET  /api/theta-meter                                     (detect install)
 *   POST /api/theta-meter/open                                (launch app)
 */

const fs             = require('fs');
const path           = require('path');
const os             = require('os');
const { execFile, spawn } = require('child_process');

// ── AppleScript runner (Chrome / server mode) ────────────────────────────────
function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-']);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      if (code !== 0) reject(new Error(stderr.trim() || `exit ${code}`));
      else resolve(stdout.trim());
    });
    child.stdin.write(script);
    child.stdin.end();
  });
}

// ── Theta Meter paths (checked in order) ─────────────────────────────────────
// PORTABLE : on cherche les 4 variantes connues dans PLUSIEURS dossiers, du plus générique au
// plus personnel. `findThetaMeter()` prend le PREMIER qui existe → sur une autre machine les
// dossiers absents sont simplement sautés. (Avant : une seule base codée en dur avec un nom de
// personne, et les fallbacks génériques ne couvraient qu'UNE variante sur quatre.)
const THETA_METER_APPS = [
  'Theta-Meter.app',
  'Theta-Meter V3.0.app',
  'MarkV Theta Meter.app',
  'ThetaMeterX.app',
];
function getThetaMeterPaths() {
  const bases = [
    '/Applications/E-Meter',
    '/Applications',
    path.join(os.homedir(), 'Applications', 'E-Meter'),
    path.join(os.homedir(), 'Applications'),
    // Dossier historique de cette machine — gardé en DERNIER pour ne rien casser localement.
    '/Applications/Applications Claudio/E-Meter',
  ];
  return bases.flatMap(b => THETA_METER_APPS.map(a => path.join(b, a)));
}

function findThetaMeter() {
  return getThetaMeterPaths().find(p => fs.existsSync(p)) ?? null;
}

// ── In-memory relay rooms ─────────────────────────────────────────────────────
// Cleared on server restart (sessions are short-lived anyway).
// Structure: Map<roomId, Map<'auditor'|'preclear', ServerResponse | WebSocket>>
//
// FIX CONN-17: rooms now store EITHER an SSE ServerResponse OR a WebSocket.
// The relayEmit helper detects which it is and writes accordingly. This lets
// SSE and WS clients coexist for the duration of the migration, and gives a
// natural fallback path if WS fails.
const relayRooms = new Map();

// FIX C1: per-room auth token. Set by the auditor when they open the SSE channel
// (via ?t=xxx). Validated on all preclear connections and relay POSTs.
// Map<roomId, string>
const relayTokens = new Map();

function relayGetOrCreateRoom(roomId) {
  if (!relayRooms.has(roomId)) relayRooms.set(roomId, new Map());
  return relayRooms.get(roomId);
}

/** Send `data` to the slot owner — works for both SSE res and WebSocket. */
function relayEmit(target, data) {
  if (!target) return;
  // WebSocket?  ws.send(); ServerResponse?  res.write('data: ...\n\n')
  if (typeof target.send === 'function' && typeof target.readyState === 'number') {
    try {
      if (target.readyState === 1 /* OPEN */) target.send(JSON.stringify(data));
    } catch (_) {}
  } else {
    try { target.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  }
}

// ── WebSocket relay (CONN-17) ────────────────────────────────────────────────
// Single instance shared across all server.on('upgrade') events for
// /api/relay-ws/{roomId}?role=auditor|preclear&t=...
function createWsRelay() {
  const { WebSocketServer } = require('ws');
  // `noServer: true` because we'll handleUpgrade manually from server-core.cjs.
  const wss = new WebSocketServer({ noServer: true });

  function parseQuery(url) {
    const idx = url.indexOf('?');
    const out = {};
    if (idx === -1) return out;
    for (const pair of url.slice(idx + 1).split('&')) {
      const [k, v] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return out;
  }

  return {
    handleUpgrade(req, socket, head) {
      // URL pattern: /api/relay-ws/{roomId}?role=...&t=...
      const url = req.url || '';
      const m = url.match(/^\/api\/relay-ws\/([^/?]+)(?:\?|$)/);
      if (!m) { socket.destroy(); return; }
      const roomId = decodeURIComponent(m[1]);
      const q = parseQuery(url);
      const role = q.role;
      const token = q.t;

      if (role !== 'auditor' && role !== 'preclear') {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return;
      }

      // Token validation: auditor sets it, preclear must match
      if (role === 'auditor') {
        if (token) relayTokens.set(roomId, token);
      } else {
        const expected = relayTokens.get(roomId);
        if (expected && token !== expected) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
        }
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const room = relayGetOrCreateRoom(roomId);
        const otherRole = role === 'auditor' ? 'preclear' : 'auditor';

        // Kick old occupant of this role (if any) and register new
        const existing = room.get(role);
        if (existing && existing !== ws) {
          console.log(`[RELAY-WS] ${role} reconnected to room ${roomId.slice(0, 8)}… (kicking stale slot)`);
          try { if (typeof existing.close === 'function') existing.close(); } catch (_) {}
        } else {
          console.log(`[RELAY-WS] ${role} connected to room ${roomId.slice(0, 8)}…`);
        }
        room.set(role, ws);

        // Both parties present? notify each
        const other = room.get(otherRole);
        if (other) {
          console.log(`[RELAY-WS] room ${roomId.slice(0, 8)}… both parties present — emitting peer_connected`);
          relayEmit(other, { type: 'peer_connected', role });
          relayEmit(ws,    { type: 'peer_connected', role: otherRole });
        }

        // Route incoming messages from this client to the other party
        ws.on('message', (raw) => {
          let parsed;
          try { parsed = JSON.parse(raw.toString()); } catch { return; }
          const dest = room.get(otherRole);
          if (dest) relayEmit(dest, parsed);
        });

        // ws library auto-handles ping/pong frames, but we also send our own
        // periodic ping to keep middleboxes happy.
        const pingTimer = setInterval(() => {
          try { ws.ping(); } catch (_) { clearInterval(pingTimer); }
        }, 15000);

        ws.on('close', () => {
          clearInterval(pingTimer);
          if (room.get(role) !== ws) {
            console.log(`[RELAY-WS] ${role} close ignored (slot already taken by newer connection)`);
            return;
          }
          console.log(`[RELAY-WS] ${role} closed room ${roomId.slice(0, 8)}…`);
          room.delete(role);
          if (room.size === 0) {
            relayRooms.delete(roomId);
            relayTokens.delete(roomId);
          } else {
            const remaining = room.get(otherRole);
            if (remaining) {
              console.log(`[RELAY-WS] notifying ${otherRole} that ${role} disconnected`);
              relayEmit(remaining, { type: 'peer_disconnected', role });
            }
          }
        });

        ws.on('error', () => { /* close will follow */ });
      });
    },
  };
}

function relayQueryParam(rawUrl, key) {
  const qs = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
  for (const pair of qs.split('&')) {
    const [k, v] = pair.split('=');
    if (decodeURIComponent(k || '') === key) return decodeURIComponent(v || '');
  }
  return '';
}

// ── Paths ────────────────────────────────────────────────────────────────────
// ~/Library/Application Support/Static Meter/ is hidden from casual Finder
// browsing (Library is invisible by default on macOS) — prevents accidental deletion.
const BASE_DIR        = path.join(os.homedir(), 'Library', 'Application Support', 'Static Meter', 'appdata');
const PROCESSUS_DIR   = path.join(BASE_DIR, 'processus');
const SESSION_PDF_DIR = path.join(BASE_DIR, 'session-pdfs');
const PROCESSUS_INDEX = path.join(PROCESSUS_DIR, 'index.json');
const BACKUP_DIR      = path.join(BASE_DIR, 'backups'); // R5: rotating daily backups

function ensureDirs() {
  [BASE_DIR, PROCESSUS_DIR, SESSION_PDF_DIR, BACKUP_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// CONN-70: non-destructive merge of an incoming array of {id} records into the
// existing file. Previously POST /sessions and /profiles did writeJson(body),
// which OVERWROTE the file — so a client pushing its own list deleted records
// created by another client (e.g. Electron clobbering sessions made in Chrome,
// and vice-versa → diverging history). Merging by id (incoming wins on conflict)
// makes the server an additive source of truth shared by every client.
// CONN-103: tombstones — a map "entity:id" → deletedAt(ms). A delete records a
// tombstone so a stale re-push from the other client can't resurrect the record.
const TOMB_FILE = path.join(BASE_DIR, 'tombstones.json');
function getTombs() { return readJson(TOMB_FILE, {}); }
function addTomb(entity, id) {
  const t = getTombs(); t[`${entity}:${id}`] = Date.now(); writeJson(TOMB_FILE, t);
}

// CONN-103: LAST-WRITE-WINS merge. For each id we keep the record with the
// higher `updatedAt` (so a stale push can NEVER overwrite a newer edit), and we
// drop ids that are tombstoned with a deletedAt newer than the record's update.
function mergeByIdWrite(filePath, incoming, entity) {
  const existing = readJson(filePath, []);
  const tomb = getTombs();
  const merged = new Map();
  const put = (r) => {
    if (!r || r.id == null) return;
    if (entity) {
      const del = tomb[`${entity}:${r.id}`] || 0;
      if (del && del >= (r.updatedAt || 0)) return; // deleted after this version → skip
    }
    const prev = merged.get(r.id);
    if (!prev || (r.updatedAt || 0) >= (prev.updatedAt || 0)) merged.set(r.id, r);
  };
  if (Array.isArray(existing)) existing.forEach(put);
  if (Array.isArray(incoming)) incoming.forEach(put);
  const arr = Array.from(merged.values());
  writeJson(filePath, arr);
  return arr;
}

// ── R5: automatic rotating backups (insurance against data loss/corruption) ──
// One snapshot file per day (overwritten through the day with the latest data),
// keeping the last MAX_BACKUPS days. Triggered (debounced) after writes to the
// session/profile stores, plus once at startup. Purely additive — the live
// files are never touched, so this can never make the data WORSE.
const MAX_BACKUPS = 14;
let _backupTimer = null;

function writeBackup() {
  try {
    ensureDirs();
    const snapshot = {
      savedAt: new Date().toISOString(),
      profiles:   readJson(path.join(BASE_DIR, 'profiles.json'), []),
      sessions:   readJson(path.join(BASE_DIR, 'sessions.json'), []),
      pcProfiles: readJson(path.join(BASE_DIR, 'pc-profiles.json'), []),
      settings:   readJson(path.join(BASE_DIR, 'settings.json'), {}),
    };
    // Nothing to back up yet → skip (avoid empty snapshots on a fresh install).
    if (snapshot.profiles.length === 0 && snapshot.sessions.length === 0) return;
    const day = snapshot.savedAt.slice(0, 10); // YYYY-MM-DD
    fs.writeFileSync(path.join(BACKUP_DIR, `backup-${day}.json`), JSON.stringify(snapshot), 'utf8');
    // Prune to the newest MAX_BACKUPS daily files.
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (_) {}
    }
  } catch (e) {
    console.warn('[backup] failed:', e.message);
  }
}

function scheduleBackup() {
  if (_backupTimer) return; // debounce a burst of writes into one snapshot
  _backupTimer = setTimeout(() => { _backupTimer = null; writeBackup(); }, 30_000);
  if (typeof _backupTimer.unref === 'function') _backupTimer.unref();
}

// One backup shortly after startup (so a fresh launch captures current state).
setTimeout(() => { try { writeBackup(); } catch (_) {} }, 8_000).unref?.();

const MAX_BODY       = 50 * 1024 * 1024; // 50 MB — large enough for any PDF
const MAX_RELAY_BODY = 65536;             // 64 KB — enforced for relay POST regardless of Content-Length

// FIX H2: accept an optional maxBytes to cap relay messages even on chunked transfers
// (Content-Length check alone is bypassable by omitting the header)
function readBody(req, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > maxBytes) { reject(new Error('Request body too large')); return; }
      chunks.push(c);
    });
    req.on('end',  () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

function setCors(res) {
  // FIX C1: use '*' so cross-origin relay requests from remote participants are allowed.
  // In relay mode the participant's origin is http://127.0.0.1:7893 on THEIR machine,
  // while the server sits behind a Cloudflare tunnel — that is cross-origin.
  // This app carries no sensitive cookies/credentials so a wildcard origin is safe.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── SECURITY: rotte che non devono MAI rispondere a una richiesta arrivata dal tunnel
// pubblico — segnalato nella revisione completa: profili, sedute, PDF dei processus/sedute,
// e le rotte che lanciano/pilotano Theta-Meter via AppleScript, non avevano NESSUN controllo.
// Durante ogni seduta a distanza queste rotte sono raggiungibili non solo in LAN ma anche dal
// tunnel Cloudflare (v. la nota grande su `isFromTunnel` in `server-core.cjs`). Nessuna di
// queste è mai chiamata da un preclear/partecipante — solo dall'app stessa, sulla propria
// origine locale — quindi bloccarle per il tunnel non toglie nulla di reale: `/api/relay*`
// (il vero canale dati della seduta a distanza) NON è in questo elenco, resta aperto.
const LOCAL_ONLY_PREFIXES = [
  '/api/health',       // rivela il percorso home dell'utente — nessun uso remoto
  '/api/server-info',  // già bloccato anche in server-core.cjs; qui per lo stesso principio
  '/api/profiles',
  '/api/pc-profiles',
  '/api/sessions',
  '/api/settings',
  '/api/processus',
  '/api/session-pdfs',
  '/api/tombstones',
  '/api/theta-meter',  // GET (rileva) e /open (lancia l'app) — nessun bisogno remoto
  '/api/tm/',          // tile/restore/close — pilotano finestre via AppleScript
];
function isLocalOnlyRoute(url) {
  return LOCAL_ONLY_PREFIXES.some(p => url === p || url.startsWith(p));
}

// ── Main handler ─────────────────────────────────────────────────────────────
// Returns true if the request was handled (so the caller skips static serving).
async function handleApi(req, res) {
  const url    = (req.url || '/').split('?')[0];
  const method = req.method.toUpperCase();

  if (!url.startsWith('/api/')) return false;

  ensureDirs();

  // OPTIONS pre-flight
  if (method === 'OPTIONS') { setCors(res); res.writeHead(204); res.end(); return true; }

  // `req._smFromTunnel` è calcolato da `server-core.cjs` (è lì che vive `_tunnelUrl`).
  if (req._smFromTunnel && isLocalOnlyRoute(url)) {
    json(res, { error: 'not available over the public tunnel' }, 403);
    return true;
  }

  try {
    // ── Health ────────────────────────────────────────────────────────────
    if (url === '/api/health' && method === 'GET') {
      json(res, { ok: true, dataDir: BASE_DIR });
      return true;
    }

    // ── Theta Meter integration ───────────────────────────────────────────
    // GET  /api/theta-meter        → { path: string|null }
    // POST /api/theta-meter/open   → { ok: boolean, error?: string }
    if (url === '/api/theta-meter' && method === 'GET') {
      json(res, { path: findThetaMeter() });
      return true;
    }
    if (url === '/api/theta-meter/open' && method === 'POST') {
      const appPath = findThetaMeter();
      if (!appPath) { json(res, { ok: false, error: 'Theta Meter not found' }); return true; }
      execFile('open', [appPath], (err) => {
        if (err) json(res, { ok: false, error: err.message });
        else     json(res, { ok: true });
      });
      return true;
    }

    // POST /api/tm/tile
    // Body: { smWidth, chromeX, chromeY, chromeH, screenW }
    // Positions TM to the right of the Chrome/SM window, filling remaining screen space.
    if (url === '/api/tm/tile' && method === 'POST') {
      const body   = await readBody(req);
      const smWidth  = Number(body.smWidth  || 460);
      const chromeX  = Number(body.chromeX  || 0);
      const chromeY  = Number(body.chromeY  || 0);
      const chromeH  = Number(body.chromeH  || 900);
      const screenW  = Number(body.screenW  || 1440);

      const tmX = Math.round(chromeX + smWidth);
      const tmY = Math.round(chromeY);
      const tmW = Math.max(400, screenW - tmX);
      const tmH = Math.round(chromeH);

      const script = `
tell application "System Events"
  set procs to (every process whose name contains "Theta" or name contains "MarkV" or name contains "ThetaMeter")
  if (count of procs) = 0 then return "no_process"
  set proc to item 1 of procs
  if (count of windows of proc) = 0 then return "no_window"
  set win to window 1 of proc
  set position of win to {${tmX}, ${tmY}}
  set size     of win to {${tmW}, ${tmH}}
  perform action "AXRaise" of win
  set frontmost of proc to true
end tell
return "ok"
`;
      try {
        const out = await runAppleScript(script);
        if (out === 'no_process' || out === 'no_window') {
          json(res, { ok: false, error: out }); return true;
        }
        json(res, { ok: true });
      } catch (e) {
        json(res, { ok: false, error: e.message });
      }
      return true;
    }

    // POST /api/tm/restore — move TM to corner {40,40}
    if (url === '/api/tm/restore' && method === 'POST') {
      const script = `
tell application "System Events"
  set procs to (every process whose name contains "Theta" or name contains "MarkV" or name contains "ThetaMeter")
  if (count of procs) = 0 then return "no_process"
  set proc to item 1 of procs
  if (count of windows of proc) = 0 then return "no_window"
  set position of window 1 of proc to {40, 40}
end tell
return "ok"
`;
      try { await runAppleScript(script); json(res, { ok: true }); }
      catch (e) { json(res, { ok: false, error: e.message }); }
      return true;
    }

    // POST /api/tm/close — quit all Theta Meter instances
    if (url === '/api/tm/close' && method === 'POST') {
      const script = `
tell application "System Events"
  set procs to (every process whose name contains "Theta" or name contains "MarkV")
  repeat with proc in procs
    tell proc to quit
  end repeat
end tell
`;
      try { await runAppleScript(script); json(res, { ok: true }); }
      catch (e) { json(res, { ok: false, error: e.message }); }
      return true;
    }

    // ── Profiles ──────────────────────────────────────────────────────────
    if (url === '/api/profiles') {
      const file = path.join(BASE_DIR, 'profiles.json');
      if (method === 'GET') { json(res, readJson(file, [])); return true; }
      if (method === 'POST') {
        const body = await readBody(req);
        mergeByIdWrite(file, body, 'profiles'); // CONN-103: LWW + tombstones
        scheduleBackup(); // R5
        json(res, { ok: true });
        return true;
      }
    }

    // ── PC profiles (CONN-102: preclear registry, shared Electron ↔ Chrome) ──
    if (url === '/api/pc-profiles') {
      const file = path.join(BASE_DIR, 'pc-profiles.json');
      if (method === 'GET') { json(res, readJson(file, [])); return true; }
      if (method === 'POST') {
        const body = await readBody(req);
        mergeByIdWrite(file, body, 'pc-profiles');
        scheduleBackup(); // R5
        json(res, { ok: true });
        return true;
      }
    }

    // CONN-103: tombstones (so clients can also drop locally-deleted records).
    if (url === '/api/tombstones' && method === 'GET') { json(res, getTombs()); return true; }

    // ── Sessions ──────────────────────────────────────────────────────────
    if (url === '/api/sessions') {
      const file = path.join(BASE_DIR, 'sessions.json');
      if (method === 'GET') { json(res, readJson(file, [])); return true; }
      if (method === 'POST') {
        const body = await readBody(req);
        mergeByIdWrite(file, body, 'sessions');
        scheduleBackup(); // R5
        json(res, { ok: true });
        return true;
      }
    }

    // DELETE /api/sessions/:id  — remove a single session + tombstone it.
    const sessionDeleteMatch = url.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionDeleteMatch && method === 'DELETE') {
      const sessionId = decodeURIComponent(sessionDeleteMatch[1]);
      const file = path.join(BASE_DIR, 'sessions.json');
      writeJson(file, readJson(file, []).filter(s => s.id !== sessionId));
      addTomb('sessions', sessionId);
      json(res, { ok: true });
      return true;
    }

    // DELETE /api/profiles/:id and /api/pc-profiles/:id — remove + tombstone.
    const profDel = url.match(/^\/api\/profiles\/([^/]+)$/);
    if (profDel && method === 'DELETE') {
      const id = decodeURIComponent(profDel[1]);
      const file = path.join(BASE_DIR, 'profiles.json');
      writeJson(file, readJson(file, []).filter(p => p.id !== id));
      addTomb('profiles', id);
      json(res, { ok: true }); return true;
    }
    const pcDel = url.match(/^\/api\/pc-profiles\/([^/]+)$/);
    if (pcDel && method === 'DELETE') {
      const id = decodeURIComponent(pcDel[1]);
      const file = path.join(BASE_DIR, 'pc-profiles.json');
      writeJson(file, readJson(file, []).filter(p => p.id !== id));
      addTomb('pc-profiles', id);
      json(res, { ok: true }); return true;
    }

    // ── Settings ─────────────────────────────────────────────────────────
    if (url === '/api/settings') {
      const file = path.join(BASE_DIR, 'settings.json');
      if (method === 'GET') { json(res, readJson(file, {})); return true; }
      if (method === 'POST') {
        const body = await readBody(req);
        writeJson(file, body);
        json(res, { ok: true });
        return true;
      }
    }

    // ── Processus — list ─────────────────────────────────────────────────
    if (url === '/api/processus' && method === 'GET') {
      json(res, readJson(PROCESSUS_INDEX, []));
      return true;
    }

    // ── Processus — upload ───────────────────────────────────────────────
    // Body: { id: string, name: string, tag: string, base64: string }
    if (url === '/api/processus' && method === 'POST') {
      const body = await readBody(req);
      if (!body.id || !body.base64) { json(res, { error: 'missing id or base64' }, 400); return true; }
      const filePath = path.join(PROCESSUS_DIR, `${body.id}.pdf`);
      // SECURITY (A2): same path-traversal guard the GET/DELETE/session-pdf routes
      // already have — a crafted body.id ("../…") must not escape PROCESSUS_DIR.
      if (!filePath.startsWith(PROCESSUS_DIR + path.sep)) {
        json(res, { error: 'invalid id' }, 400); return true;
      }
      fs.writeFileSync(filePath, Buffer.from(body.base64, 'base64'));
      const index = readJson(PROCESSUS_INDEX, []).filter(e => e.id !== body.id);
      index.push({ id: body.id, name: body.name, tag: body.tag || 'General' });
      writeJson(PROCESSUS_INDEX, index);
      json(res, { ok: true });
      return true;
    }

    // ── Processus — individual file ──────────────────────────────────────
    const procMatch = url.match(/^\/api\/processus\/(.+)$/);
    if (procMatch) {
      const id = decodeURIComponent(procMatch[1]);
      const filePath = path.join(PROCESSUS_DIR, `${id}.pdf`);
      // FIX BUG 5: path traversal guard — reject any id that escapes the intended directory
      if (!filePath.startsWith(PROCESSUS_DIR + path.sep) && filePath !== PROCESSUS_DIR) {
        json(res, { error: 'invalid id' }, 400); return true;
      }

      if (method === 'GET') {
        if (!fs.existsSync(filePath)) { json(res, { error: 'not found' }, 404); return true; }
        setCors(res);
        // CONN-75: headers that let the PDF render INSIDE the app iframe. Under
        // the page's COEP (credentialless) an embedded resource must carry CORP/
        // COEP; `inline` makes the browser display it instead of downloading.
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        });
        res.end(fs.readFileSync(filePath));
        return true;
      }
      if (method === 'DELETE') {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        const index = readJson(PROCESSUS_INDEX, []).filter(e => e.id !== id);
        writeJson(PROCESSUS_INDEX, index);
        json(res, { ok: true });
        return true;
      }
    }

    // ── Session PDFs — save ──────────────────────────────────────────────
    // Body: { sessionId: string, filename: string, base64: string }
    if (url === '/api/session-pdfs' && method === 'POST') {
      const body = await readBody(req);
      if (!body.sessionId || !body.base64) { json(res, { error: 'missing sessionId or base64' }, 400); return true; }
      const filePath = path.join(SESSION_PDF_DIR, `${body.sessionId}.pdf`);
      // FIX M5: path traversal guard — reject any sessionId that escapes the intended directory
      if (!filePath.startsWith(SESSION_PDF_DIR + path.sep) && filePath !== SESSION_PDF_DIR) {
        json(res, { error: 'invalid sessionId' }, 400); return true;
      }
      fs.writeFileSync(filePath, Buffer.from(body.base64, 'base64'));
      json(res, { ok: true, path: filePath });
      return true;
    }

    // ── Session PDFs — fetch ─────────────────────────────────────────────
    const pdfMatch = url.match(/^\/api\/session-pdfs\/(.+)$/);
    if (pdfMatch) {
      const sessionId = decodeURIComponent(pdfMatch[1]);
      // FIX VIEW-404: also answer HEAD. HistoryModal probes the server with a
      // HEAD request to decide whether to show the "View" button; this route
      // only matched GET, so HEAD fell through to 404 even when the PDF file
      // EXISTED → server-side PDFs were invisible to History (the button only
      // appeared when a LOCAL IndexedDB copy existed → "session senza View"
      // on any other device).
      if (method === 'GET' || method === 'HEAD') {
        const filePath = path.join(SESSION_PDF_DIR, `${sessionId}.pdf`);
        // FIX BUG 5: path traversal guard
        if (!filePath.startsWith(SESSION_PDF_DIR + path.sep) && filePath !== SESSION_PDF_DIR) {
          json(res, { error: 'invalid id' }, 400); return true;
        }
        if (!fs.existsSync(filePath)) { json(res, { error: 'not found' }, 404); return true; }
        setCors(res);
        res.writeHead(200, { // CONN-75: embeddable PDF headers (see processus GET)
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        });
        if (method === 'HEAD') { res.end(); return true; }
        res.end(fs.readFileSync(filePath));
        return true;
      }
    }

    // ── Relay — SSE channel for remote P2P data (no TURN needed) ──────────
    // GET  /api/relay/:roomId?role=auditor|preclear  → SSE stream
    // POST /api/relay/:roomId?from=auditor|preclear  → push to other party
    const relayMatch = url.match(/^\/api\/relay\/([^/]+)$/);
    if (relayMatch) {
      const roomId = decodeURIComponent(relayMatch[1]);
      const rawUrl = req.url || '';

      if (method === 'GET') {
        const role      = relayQueryParam(rawUrl, 'role');           // 'auditor' | 'preclear'
        const otherRole = role === 'auditor' ? 'preclear' : 'auditor';

        // FIX L1: validate role before touching room state
        if (role !== 'auditor' && role !== 'preclear') {
          json(res, { error: 'invalid role' }, 400); return true;
        }

        // FIX C1: relay auth token validation.
        // Auditor is the first to connect and sets the token for the room.
        // Preclear must supply the same token; otherwise the connection is rejected.
        const clientToken = relayQueryParam(rawUrl, 't');
        if (role === 'auditor') {
          // Auditor establishes the token for this room (if provided).
          if (clientToken) relayTokens.set(roomId, clientToken);
        } else {
          // Preclear must match the token set by the auditor.
          const expectedToken = relayTokens.get(roomId);
          if (expectedToken && clientToken !== expectedToken) {
            // Reject with CORS header so the browser sees the 401, not a CORS error.
            res.writeHead(401, { 'Access-Control-Allow-Origin': '*' });
            res.end('Unauthorized');
            return true;
          }
        }

        // SSE responses require explicit CORS headers.
        // The participant's page origin is http://127.0.0.1:7893 (their local server) but
        // the SSE URL is https://<tunnel>.trycloudflare.com — cross-origin. Without these
        // headers Chromium (Electron webSecurity:true) blocks the SSE stream entirely.
        // FIX CONN-16: explicit anti-buffering headers + immediate flush.
        // Cloudflare's quick tunnel (and several other CDN edges) buffer the
        // SSE response if the server doesn't explicitly tell them otherwise.
        // The `X-Accel-Buffering: no` header is the nginx convention; Cloudflare
        // honours it. `Connection: keep-alive` + `Transfer-Encoding: chunked`
        // make the framing explicit. flushHeaders() guarantees the headers
        // reach the wire immediately rather than waiting for the first write.
        res.writeHead(200, {
          'Content-Type':                'text/event-stream',
          'Cache-Control':               'no-cache, no-transform',
          'Connection':                  'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering':           'no',
        });
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        const room = relayGetOrCreateRoom(roomId);

        // Kick-old strategy — if a slot is still marked occupied, close the stale
        // connection first. The previous req.on('close') fires asynchronously and may not
        // have cleared the slot yet when EventSource auto-reconnects after a transient error.
        const existing = room.get(role);
        if (existing && !existing.writableEnded) {
          console.log(`[RELAY] ${role} reconnected to room ${roomId.slice(0, 8)}… (kicking stale slot)`);
          try { existing.end(); } catch (_) {}
        } else {
          console.log(`[RELAY] ${role} connected to room ${roomId.slice(0, 8)}…`);
        }
        room.set(role, res);

        // FIX CONN-16: use real SSE data events instead of comments.
        //
        // The first attempt (CONN-14) used `: ka\n\n` comments, which are
        // valid SSE but several proxies — Cloudflare in particular — treat
        // comment-only frames as "no activity" and idle-close the stream
        // after a few seconds.  Switching to a real `data:` event makes the
        // proxy see actual traffic and reset its idle timer.
        //
        // The client SSE handler discards any event with `type: 'ka'` so
        // the app layer never sees these heartbeats.
        const sendKa = () => {
          try { res.write(`data: {"type":"ka","t":${Date.now()}}\n\n`); }
          catch (_) { clearInterval(keepalive); }
        };
        sendKa(); // initial frame to mark the stream as immediately active
        const keepalive = setInterval(sendKa, 3000);

        // If both parties are now present, notify each other immediately
        const other = room.get(otherRole);
        if (other) {
          console.log(`[RELAY] room ${roomId.slice(0, 8)}… both parties present — emitting peer_connected`);
          relayEmit(other, { type: 'peer_connected', role });
          relayEmit(res,   { type: 'peer_connected', role: otherRole });
        }

        req.on('close', () => {
          clearInterval(keepalive);
          res.end();
          // FIX CONN-12: only release the slot if WE are still the one
          // holding it. The "kick-old" code path above closes the stale
          // res and immediately writes the new one into the same room slot.
          // The closed res's req.on('close') fires AFTER that write, so a
          // naive `room.delete(role)` would erase the NEW slot — leaving
          // the server with no preclear registered, even though the new
          // SSE is fully alive. The check makes this idempotent against
          // the kick-old race.
          if (room.get(role) !== res) {
            console.log(`[RELAY] ${role} close ignored (slot already taken by newer connection)`);
            return;
          }
          console.log(`[RELAY] ${role} closed room ${roomId.slice(0, 8)}…`);
          room.delete(role);
          if (room.size === 0) {
            relayRooms.delete(roomId);
            relayTokens.delete(roomId); // FIX C1: release token when room is fully gone
          } else {
            // Notify the remaining party
            const remaining = room.get(otherRole);
            if (remaining) {
              console.log(`[RELAY] notifying ${otherRole} that ${role} disconnected`);
              relayEmit(remaining, { type: 'peer_disconnected', role });
            }
          }
        });

        return true; // response kept open (SSE) — do NOT call res.end()
      }

      if (method === 'POST') {
        // FIX L1: validate `from` role before routing
        const from = relayQueryParam(rawUrl, 'from');   // 'auditor' | 'preclear'
        if (from !== 'auditor' && from !== 'preclear') {
          json(res, { error: 'invalid from role' }, 400); return true;
        }
        const toRole = from === 'auditor' ? 'preclear' : 'auditor';

        // FIX C1: validate relay auth token on POST messages too.
        // Both sides must send the token; either side can trigger a relay POST.
        const clientToken = relayQueryParam(rawUrl, 't');
        const expectedToken = relayTokens.get(roomId);
        if (expectedToken && clientToken !== expectedToken) {
          json(res, { error: 'unauthorized' }, 401); return true;
        }

        // FIX H2: enforce the 64 KB cap via readBody's maxBytes parameter so that
        // chunked transfers without Content-Length cannot bypass the limit.
        const body = await readBody(req, MAX_RELAY_BODY);

        // Verify body.type is a string before forwarding
        if (body.type !== undefined && typeof body.type !== 'string') {
          json(res, { error: 'invalid message type' }, 400); return true;
        }
        const room = relayRooms.get(roomId);
        if (room) {
          const toRes = room.get(toRole);
          if (toRes) {
            relayEmit(toRes, body);
          } else {
            // Slot empty — recipient not connected. Log only non-trivial types.
            if (body.type !== 'PING' && body.type !== 'PONG') {
              console.log(`[RELAY] POST from ${from} type=${body.type} dropped: ${toRole} not in room`);
            }
          }
        } else {
          console.log(`[RELAY] POST from ${from} type=${body.type} dropped: room ${roomId.slice(0, 8)}… does not exist`);
        }
        json(res, { ok: true });
        return true;
      }
    }

    // Unknown API route
    json(res, { error: 'unknown route' }, 404);
    return true;

  } catch (err) {
    console.error('[API] Error:', err.message);
    json(res, { error: err.message }, 500);
    return true;
  }
}

module.exports = { handleApi, createWsRelay };
