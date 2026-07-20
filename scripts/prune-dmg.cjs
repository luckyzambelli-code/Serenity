// CONN-116: keep release/ from piling up. After each packaged build, delete all
// but the KEEP most-recent DMGs (newest = the build just made; one extra kept as a
// rollback margin). Also removes the matching .blockmap. Build artifacts only.
const fs = require('fs');
const path = require('path');

const KEEP = 2; // how many newest DMGs to keep
const dir = path.join(__dirname, '..', 'release');

try {
  const dmgs = fs.readdirSync(dir)
    .filter(f => f.endsWith('.dmg'))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t); // newest first

  const toDelete = dmgs.slice(KEEP);
  for (const { f } of toDelete) {
    try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    try { fs.unlinkSync(path.join(dir, f + '.blockmap')); } catch (_) {}
    console.log('[prune] removed old DMG: ' + f);
  }
  console.log(toDelete.length
    ? `[prune] kept ${Math.min(KEEP, dmgs.length)} newest DMG(s), removed ${toDelete.length}`
    : `[prune] nothing to remove (${dmgs.length} ≤ ${KEEP})`);
} catch (e) {
  console.warn('[prune] skipped:', e && e.message);
}
