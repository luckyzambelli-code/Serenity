// CONN-116: keep release/ from piling up. After each packaged build, delete all
// but the KEEP most-recent DMGs (newest = the build just made; one extra kept as a
// rollback margin). Also removes the matching .blockmap. Build artifacts only.
//
// ⚠️ BUG TROVATO — segnalato: « Non trovo più la dmg per Serenity ora nel file RELEASE ».
// Vero: contava i DMG di TUTTA la cartella insieme, senza sapere che da quando esiste
// SERENITY ce ne sono di DUE applicazioni diverse (`Equilibrium-*.dmg`, `Serenity-*.dmg`).
// Questo script gira SOLO da `dist:mac` (mai da `dist:serenity`, che non lo chiama) — quindi
// ogni build di EQUILIBRIUM contava "i 2 più recenti" contro L'INTERA cartella, e cancellava
// il DMG di SERENITY più vecchio anche se era l'UNICO che SERENITY aveva. Ora si raggruppa per
// applicazione (il prefisso prima del primo "-" nel nome del file) e si tengono i KEEP più
// recenti DENTRO OGNUNO dei due gruppi — costruire EQUILIBRIUM non tocca più i DMG di SERENITY,
// e viceversa (anche se oggi solo `dist:mac` chiama questo script).
const fs = require('fs');
const path = require('path');

// ⚠️ 2 → 4 — segnalato nella revisione completa: « solo Apple Silicon viene distribuito, niente
// Intel ». Da quando `package.json`'s `build.mac.target` costruisce ENTRAMBE le architetture
// (arm64 + x64) per ogni versione, una singola build produce due file per applicazione — con
// KEEP fermo a 2 quel margine di rollback (« tieni anche la versione precedente ») si sarebbe
// silenziosamente ridotto a "tieni solo questa versione, nelle sue due architetture". 4 tiene
// di nuovo due versioni intere (2 architetture ciascuna) per applicazione.
const KEEP = 4; // how many newest files to keep PER ESTENSIONE, PER APPLICAZIONE (2 versions × 2 archs)
const dir = path.join(__dirname, '..', 'release');

// ⚠️ AGGIUNTO — segnalato: « ho 3.0.303 su Mac, dovrebbe fare l'aggiornamento » — verificato
// dal vivo (l'app girata dal Terminale ha scritto l'errore per intero): `electron-updater` su
// macOS (`MacUpdater`/Squirrel.Mac) richiede uno ZIP, il DMG da solo non basta MAI per il
// download+installazione automatica, anche indipendentemente dal problema della firma già
// documentato in `main.cjs`. `build.mac.target` (in `package.json`) ora costruisce ANCHE `zip`
// accanto a `dmg` — questo script filtrava solo `.dmg`: senza l'estensione anche qui, gli ZIP
// si sarebbero accumulati in `release/` senza limite, mai puliti.
const ESTENSIONI = ['.dmg', '.zip'];

try {
  const file = fs.readdirSync(dir)
    .filter(f => ESTENSIONI.some(ext => f.endsWith(ext)))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs, app: f.split('-')[0], ext: path.extname(f) }));

  // Un gruppo per applicazione E estensione (`Equilibrium.dmg`, `Serenity.dmg`, `Serenity.zip`…)
  // — un DMG vecchio non deve poter far cancellare uno ZIP recente (o viceversa), sono due
  // formati con un loro proprio margine di rollback ciascuno.
  const gruppi = new Map();
  for (const d of file) {
    const chiave = `${d.app}${d.ext}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave).push(d);
  }

  let rimossi = 0;
  for (const [chiave, lista] of gruppi) {
    lista.sort((a, b) => b.t - a.t); // newest first, DENTRO questo gruppo
    const toDelete = lista.slice(KEEP);
    for (const { f } of toDelete) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
      try { fs.unlinkSync(path.join(dir, f + '.blockmap')); } catch (_) {}
      console.log('[prune] removed old file: ' + f);
      rimossi++;
    }
    console.log(toDelete.length
      ? `[prune] ${chiave}: kept ${Math.min(KEEP, lista.length)} newest, removed ${toDelete.length}`
      : `[prune] ${chiave}: nothing to remove (${lista.length} ≤ ${KEEP})`);
  }
  if (!rimossi && file.length) console.log(`[prune] nothing to remove (${file.length} file totali, ${gruppi.size} gruppi, tutti entro il limite)`);
} catch (e) {
  console.warn('[prune] skipped:', e && e.message);
}
