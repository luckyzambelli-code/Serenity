/**
 * copy-guide — porta la GUIDA dentro l'applicazione, prima di ogni build.
 *
 * ── PERCHÉ UNO SCRIPT E NON UNA COPIA A MANO ────────────────────────────────────────────────
 * La guida vive fuori dal repo (`~/Downloads/Guide Static Meter/`) perché è un documento che si
 * scrive e si rilegge da solo, in un browser, senza far girare l'app. Ma dev'essere anche
 * DENTRO l'app, sempre disponibile — e due copie tenute a mano divergono alla prima modifica:
 * si aggiornerebbe quella di fuori e l'app mostrerebbe la vecchia, senza che nessuno se ne
 * accorga.
 *
 * Copiandola a ogni build, la sorgente resta UNA. Se il file non c'è — chi clona il repo senza
 * la cartella — il build NON si ferma: l'app mostra una riga che dice dove cercarlo. Meglio un
 * bottone che spiega di un build che fallisce su un documento.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SORGENTE = path.join(os.homedir(), 'Downloads', 'Guide Static Meter', 'EQUILIBRIUM-manuale.html');
const DESTINAZIONE = path.join(__dirname, '..', 'public', 'guide', 'EQUILIBRIUM-manuale.html');

if (!fs.existsSync(SORGENTE)) {
  console.log('[guide] non trovata:', SORGENTE, '— l\'app mostrerà l\'avviso al posto della guida.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(DESTINAZIONE), { recursive: true });
fs.copyFileSync(SORGENTE, DESTINAZIONE);

// Anche gli screenshot, se ci sono: la guida li cerca in `docs/guide-screenshots/`.
const SHOTS = path.join(os.homedir(), 'Downloads', 'Guide Static Meter', 'docs', 'guide-screenshots');
if (fs.existsSync(SHOTS)) {
  const dest = path.join(__dirname, '..', 'public', 'guide', 'docs', 'guide-screenshots');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) {
    fs.copyFileSync(path.join(SHOTS, f), path.join(dest, f));
  }
}

const kb = Math.round(fs.statSync(DESTINAZIONE).size / 1024);
console.log(`[guide] copiata in public/guide/ (${kb} KB)`);
