/**
 * copy-guide — porta le GUIDE dentro l'applicazione, prima di ogni build.
 *
 * ── PERCHÉ UNO SCRIPT E NON UNA COPIA A MANO ────────────────────────────────────────────────
 * Le guide vivono fuori dal repo (`~/Downloads/Guide Static Meter/`) perché sono documenti che
 * si scrivono e si rileggono da soli, in un browser, senza far girare l'app. Ma devono essere
 * anche DENTRO l'app, sempre disponibili — e due copie tenute a mano divergono alla prima
 * modifica: si aggiornerebbe quella di fuori e l'app mostrerebbe la vecchia, senza che nessuno
 * se ne accorga.
 *
 * Copiandole a ogni build, la sorgente resta UNA. Se un file non c'è — chi clona il repo senza
 * la cartella — il build NON si ferma: l'app mostra una riga che dice dove cercarlo. Meglio un
 * bottone che spiega di un build che fallisce su un documento.
 *
 * ── DUE GUIDE, NON UNA — segnalato: « rifai il GUIDE per SERENITY... aggiornando il tutto ed
 * il nome con SERENITY ». Fino a qui questo script copiava SOLO EQUILIBRIUM-manuale.html —
 * SERENITY mostrava (via `GuideModal`) la STESSA guida, col nome EQUILIBRIUM scritto sopra.
 * Ora un file per app, ciascuno con la SUA cartella di screenshot (`guide-screenshots` per
 * EQUILIBRIUM, `guide-screenshots-serenity` per SERENITY — nomi diversi apposta, per non
 * mostrare mai lo screenshot dell'una sotto il nome dell'altra se una manca e l'altra c'è).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const GUIDE_DIR = path.join(os.homedir(), 'Downloads', 'Guide Static Meter');
const DEST_ROOT = path.join(__dirname, '..', 'public', 'guide');

const GUIDE = [
  { nome: 'EQUILIBRIUM', shots: 'guide-screenshots' },
  { nome: 'SERENITY',    shots: 'guide-screenshots-serenity' },
];

for (const { nome, shots } of GUIDE) {
  const sorgente = path.join(GUIDE_DIR, `${nome}-manuale.html`);
  const destinazione = path.join(DEST_ROOT, `${nome}-manuale.html`);

  if (!fs.existsSync(sorgente)) {
    console.log(`[guide] ${nome} non trovata:`, sorgente, '— l\'app mostrerà l\'avviso al posto della guida.');
    continue;
  }

  fs.mkdirSync(path.dirname(destinazione), { recursive: true });
  fs.copyFileSync(sorgente, destinazione);

  // Gli screenshot di QUESTA guida, se ci sono: cercati nella SUA cartella dedicata.
  const shotsSrc = path.join(GUIDE_DIR, 'docs', shots);
  if (fs.existsSync(shotsSrc)) {
    const shotsDest = path.join(DEST_ROOT, 'docs', shots);
    fs.mkdirSync(shotsDest, { recursive: true });
    for (const f of fs.readdirSync(shotsSrc)) {
      fs.copyFileSync(path.join(shotsSrc, f), path.join(shotsDest, f));
    }
  }

  const kb = Math.round(fs.statSync(destinazione).size / 1024);
  console.log(`[guide] ${nome} copiata in public/guide/ (${kb} KB)`);
}
