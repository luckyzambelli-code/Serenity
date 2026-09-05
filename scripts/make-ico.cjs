/**
 * make-ico.cjs — genera un'icona .ico per Windows dagli iconset .icns già esistenti.
 *
 * ── PERCHÉ SERVE ────────────────────────────────────────────────────────────────────────────
 * electron-builder vuole un'icona .ico per il target Windows (NSIS) — .icns non basta. Niente
 * ImageMagick su questa macchina (verificato: `magick`/`convert`/`png2icns` assenti), ma `sharp`
 * è già una dipendenza del progetto: la si usa per ridimensionare i PNG dell'iconset esistente
 * e si scrive a mano il contenitore .ico — formato semplice (intestazione + voci PNG), supportato
 * da Windows da Vista in poi senza bisogno di dati BMP grezzi.
 *
 * Uso: node scripts/make-ico.cjs <cartella-iconset> <file-ico-di-uscita>
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TAGLIE = [16, 32, 48, 64, 128, 256];

async function main() {
  const [, , srcDir, outFile] = process.argv;
  if (!srcDir || !outFile) {
    console.error('Uso: node scripts/make-ico.cjs <cartella-iconset> <file-ico-di-uscita>');
    process.exit(1);
  }
  // La sorgente più grande dell'iconset .icns — ridimensionare DA una grande è sempre corretto,
  // il contrario (ingrandire una piccola) produrrebbe icone sfocate. Non tutti gli iconset
  // hanno la stessa nomenclatura (1024 diretto, oppure 512@2x che è lo stesso pixel count):
  // si prova in ordine di preferenza invece di assumere un nome fisso.
  const candidati = ['icon_1024x1024.png', 'icon_512x512@2x.png', 'icon_512x512.png'];
  const trovato = candidati.find(c => fs.existsSync(path.join(srcDir, c)));
  if (!trovato) {
    console.error(`Nessuna sorgente grande trovata in ${srcDir} (provati: ${candidati.join(', ')}).`);
    process.exit(1);
  }
  const sorgente = path.join(srcDir, trovato);

  const immagini = await Promise.all(
    TAGLIE.map(taglia => sharp(sorgente).resize(taglia, taglia).png().toBuffer()),
  );

  // ── ICONDIR (6 byte) + ICONDIRENTRY × N (16 byte ciascuna) + i dati PNG in coda ────────────
  const numero = immagini.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // riservato
  header.writeUInt16LE(1, 2);       // tipo 1 = icona
  header.writeUInt16LE(numero, 4);  // quante immagini

  const voci = Buffer.alloc(16 * numero);
  let offset = 6 + 16 * numero;
  immagini.forEach((buf, i) => {
    const taglia = TAGLIE[i];
    const base = i * 16;
    voci.writeUInt8(taglia >= 256 ? 0 : taglia, base);       // larghezza (0 = 256)
    voci.writeUInt8(taglia >= 256 ? 0 : taglia, base + 1);   // altezza (0 = 256)
    voci.writeUInt8(0, base + 2);                            // palette (0 = vero colore)
    voci.writeUInt8(0, base + 3);                            // riservato
    voci.writeUInt16LE(1, base + 4);                         // piani colore
    voci.writeUInt16LE(32, base + 6);                        // bit per pixel
    voci.writeUInt32LE(buf.length, base + 8);                // byte dell'immagine
    voci.writeUInt32LE(offset, base + 12);                   // offset dall'inizio del file
    offset += buf.length;
  });

  fs.writeFileSync(outFile, Buffer.concat([header, voci, ...immagini]));
  console.log(`Scritto ${outFile} (${numero} risoluzioni: ${TAGLIE.join(', ')}).`);
}

main().catch(e => { console.error(e); process.exit(1); });
