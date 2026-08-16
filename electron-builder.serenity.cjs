/**
 * SERENITY — il secondo eseguibile.
 *
 * Tutto identico a EQUILIBRIUM tranne tre cose: l'identificativo, il nome del prodotto, e la
 * VERSIONE — che è la sua, e parte da 3.0.0. Il resto (file da imballare, diritti macOS,
 * afterPack, icona) si prende da `package.json.build` invece di essere ricopiato: due elenchi
 * di file da tenere allineati a mano sarebbero il primo posto in cui le due applicazioni
 * divergerebbero senza che nessuno se ne accorga.
 *
 * ⚠️ È un `.cjs` e non un `.json` proprio per la versione: scritta a mano resterebbe ferma
 * mentre `bump-serenity.cjs` fa avanzare il numero, e il DMG direbbe una versione diversa da
 * quella nel deposito. Successo alla prima costruzione (3.0.0 sul DMG, 3.0.1 nel file).
 *
 * Il nome del prodotto NON è cosmetico: `main.cjs` sceglie da lì quale delle due interfacce
 * caricare — « Serenity » → `serenity.html`.
 */
// ⚠️ SI LEGGE DAL DISCO, non con `require`. electron-builder carica package.json per primo e
// gli toglie il blocco `build` dopo averlo usato: la cache dei moduli restituisce quindi un
// oggetto SENZA `build`, e la costruzione moriva con « Cannot read properties of undefined ».
const fs = require('fs');
const path = require('path');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const b = pkg.build;

module.exports = {
  appId: 'com.staticmeter.serenity',
  productName: 'Serenity',
  artifactName: '${productName}-${version}-${arch}.${ext}',
  afterPack: b.afterPack,
  directories: b.directories,
  files: b.files,
  asarUnpack: b.asarUnpack || [],
  mac: b.mac,
  // ⚠️ L'ENTRATA SI SCRIVE, non si indovina. Prima `main.cjs` la deduceva da `app.getName()`,
  // che su macOS può venire dall'Info.plist e su un'altra piattaforma dal package.json: una
  // deduzione che, sbagliando, aprirebbe l'interfaccia SBAGLIATA senza dire niente. Qui il
  // pacchetto porta scritto quale delle due è.
  extraMetadata: {
    version: pkg.serenityVersion,
    productName: 'Serenity',
    smEntry: 'serenity.html',
  },
};
