/**
 * Standalone HTTP server — use this to run Static Meter in Chrome without Electron.
 *
 * Usage:
 *   node server.cjs
 *   Then open Chrome at: http://127.0.0.1:7893
 *
 * Advantages over Electron:
 *   - Web Speech API works natively in Chrome (near-realtime transcription)
 *   - WebBluetooth works in Chrome at http://127.0.0.1 (secure context)
 *
 * P2P remote sessions:
 *   LAN  → auditor shares IP shown on startup (e.g. 192.168.0.106:7893)
 *   Internet → click "Créer tunnel internet" in the Link drawer (uses cloudflared)
 */

const path       = require('path');
const { execSync } = require('child_process');
const { createAppServer, getLanIp } = require('./server-core.cjs');

const PORT     = 7893;
const DIST_DIR = path.join(__dirname, 'dist');
// ⚠️ SEGNALATO: « fai in modo che 127.0.0.1:7893 sia SERENITY ». Questo script non calcolava
// mai un ENTRY (a differenza di `main.cjs`, che legge `SM_ENTRY`/`package.json.smEntry`) — la
// radice "/" del server (v. `server-core.cjs`, ora parametrizzata) cadeva sempre su
// `index.html`, cioè EQUILIBRIUM, qualunque cosa si stesse davvero testando. Qui il default è
// SERENITY (è la porta che questo script pubblicizza per "apri Chrome e prova" — v. l'intestazione
// del file), non EQUILIBRIUM: `SM_ENTRY=index.html node server.cjs` resta la via per l'altro verso.
const ENTRY = process.env.SM_ENTRY || 'serenity.html';

// Proactively free the port before binding (handles fast restarts)
try {
  const pids = execSync(`lsof -ti tcp:${PORT}`, { encoding: 'utf8' }).trim();
  if (pids) {
    pids.split('\n').forEach(pid => { try { process.kill(Number(pid), 'SIGKILL'); } catch (_) {} });
    console.log(`  ✓ Freed port ${PORT} (PIDs: ${pids.replace(/\n/g, ', ')})`);
    // Small pause to let the OS reclaim the port
    require('child_process').execSync('sleep 0.4');
  }
} catch (_) { /* port was already free */ }

const { server } = createAppServer({ port: PORT, distDir: DIST_DIR, entry: ENTRY });

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('');
    console.log(`  ⚠️  Port ${PORT} still in use after cleanup.`);
    console.log(`  → Try: lsof -ti:${PORT} | xargs kill -9 && node server.cjs`);
    console.log('');
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log('');
  console.log(`  Static Meter — Chrome server ready (${ENTRY === 'serenity.html' ? 'SERENITY' : 'EQUILIBRIUM'})`);
  console.log(`  → Local:    http://127.0.0.1:${PORT}`);
  console.log(`  → Réseau:   http://${lanIp}:${PORT}  ← LAN: partager au participant`);
  console.log('');
  console.log('  📡 PeerJS signaling intégré — pas de serveur cloud requis');
  console.log('  🌍 Internet: cliquer "Créer tunnel" dans le tiroir Lien');
  console.log('');
  console.log('  Note: use Chrome for WebBluetooth + Web Speech API.');
  console.log('');
});

process.on('SIGINT', () => {
  require('./server-core.cjs').stopTunnel();
  console.log('\n  Server stopped.');
  process.exit(0);
});
