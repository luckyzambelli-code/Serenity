// CONN-113: bump the patch version in package.json before each packaged build,
// so every DMG gets a unique, incrementing semantic version (1.0.1, 1.0.2, …).
// Done with a targeted regex replace to preserve the file's exact formatting.
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
let raw = fs.readFileSync(pkgPath, 'utf8');

const m = raw.match(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
  console.error('[bump] could not find a semver "version" in package.json — skipping');
  process.exit(0);
}
const next = `${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}`;
raw = raw.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);
fs.writeFileSync(pkgPath, raw);
console.log(`[bump] version → ${next}`);
