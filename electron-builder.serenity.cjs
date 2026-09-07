/**
 * SERENITY — il secondo eseguibile.
 *
 * Tutto identico a EQUILIBRIUM tranne tre cose: l'identificativo, il nome del prodotto, e la
 * VERSIONE — che è la sua, e parte da 3.0.0. Il resto (file da imballare, diritti macOS,
 * afterPack, icona) si prende da `package.json.build` invece di essere ricopiato: due elenchi
 * di file da tenere allineati a mano sarebbero il primo posto in cui le due applicazioni
 * divergerebbero senza che nessuno se ne accorga.
 *
 * ⚠️ BUG TROVATO — segnalato: « non posso aggiungere Serenity a Reconnaissance vocale ». Non
 * era un problema di permessi: `extraResources` (`native/sm-stt`, il binario Swift che chiede
 * DAVVERO il permesso a macOS — v. `main.cjs`, `sttBinaryPath`) non era in questo elenco.
 * Senza quel binario dentro `Serenity.app/Contents/Resources`, il riconoscimento nativo non
 * parte MAI — non fallisce silenziosamente, semplicemente il file non c'è — quindi macOS non
 * mostra MAI la richiesta di permesso per "Serenity": non può comparire in un elenco di app
 * che non gliel'hanno mai chiesto. Lo stesso `sttBinaryPath` in `main.cjs` risolve già per
 * conto suo da `process.resourcesPath` (diverso per ogni app pacchettizzata) — bastava che il
 * file ci fosse.
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
  // ⚠️ L'ICONA, NON PIÙ CONDIVISA — segnalato: « cambia l'icona dell'applicazione SERENITY
  // con questa immagine » (la testa/cervello in wireframe, `build/icon-serenity.icns`,
  // generato da `Ondes.png` fornito dall'utente). Prima `mac: b.mac` prendeva l'icona di
  // EQUILIBRIUM (il quadrante "STATIC Meter") tale e quale: le due applicazioni sono
  // distinte anche nel Dock/Launchpad ora, non solo nell'interfaccia.
  mac: { ...b.mac, icon: 'build/icon-serenity.icns' },
  // ⚠️ AGGIUNTO — la versione Windows. `extraResources` (sm-stt, il riconoscimento vocale
  // nativo) è ORA dentro `b.mac` (spostato da `package.json`, v. la nota lì): niente da
  // escludere qui a mano, lo spread di `b.mac` sopra lo porta con sé SOLO sul mac, come deve
  // essere — `main.cjs` già risponde « native STT is macOS-only » senza quel binario, invece
  // di romperlo. `win`/`nsis` restano quelli di EQUILIBRIUM (`b.win`/`b.nsis`), tranne
  // l'icona — stessa ragione dell'icona mac, sopra: le due app restano distinte anche
  // nell'elenco programmi di Windows, non solo nel Dock di macOS.
  win: { ...b.win, icon: 'build/icon-serenity.ico' },
  nsis: b.nsis,
  extraResources: [],
  // ⚠️ AGGIUNTO — `channel` DIVERSO da quello di EQUILIBRIUM (`b.publish`, "equilibrium"),
  // stesso repository. electron-builder scrive un file `<channel>-mac.yml` per applicazione —
  // senza un canale a parte, le due app (stesso repository GitHub, uniche release pubblicate lì)
  // si sovrascriverebbero a vicenda il file che `electron-updater` legge per sapere qual è
  // l'ultima versione: EQUILIBRIUM proporrebbe di aggiornarsi all'ultima release di SERENITY
  // (o viceversa), stesso repository ma prodotto sbagliato.
  publish: { ...b.publish, channel: 'serenity' },
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
