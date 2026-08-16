/**
 * Alza la versione di SERENITY — la SUA, che non è quella di EQUILIBRIUM.
 *
 * ⚠️ Due applicazioni, due numerazioni. SERENITY parte da 3.0.0 e cammina per conto suo:
 * `version` in package.json resta di EQUILIBRIUM (2.0.x). Se il numero fosse uno solo, un
 * ritocco all'una farebbe avanzare quello dell'altra senza che nulla sia cambiato — e il
 * numero sul DMG smetterebbe di dire qualcosa.
 *
 * Gemello di `bump-version.cjs`, che fa lo stesso per EQUILIBRIUM.
 */
const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(P, 'utf8'));
const [maj, min, pat] = String(pkg.serenityVersion || '3.0.0').split('.').map(Number);
pkg.serenityVersion = `${maj}.${min}.${pat + 1}`;
fs.writeFileSync(P, JSON.stringify(pkg, null, 2) + '\n');
console.log(`[serenity] versione → ${pkg.serenityVersion}`);
