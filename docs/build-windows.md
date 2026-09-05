# Build Windows — EQUILIBRIUM e SERENITY

> Aggiunta segnalata: « è possibile creare una versione per Windows? ». Risposta breve: sì, ma
> va COSTRUITA su un vero ambiente Windows (fisico o virtuale) — da questo Mac si può preparare
> tutta la configurazione, non il file `.exe` finale: `better-sqlite3` è un modulo NATIVO, e
> compilarlo per Windows da macOS (cross-compilazione) non è affidabile. Una macchina virtuale
> Windows va benissimo: `electron-builder`/`npm install` non sanno né gli interessa se il
> Windows sotto di loro è fisico o virtuale, gli basta che sia un vero Windows.

## Cosa NON funziona uguale su Windows, e perché non è un problema

- **Il riconoscimento vocale nativo** (`native/sm-stt.swift`, compilato con `swiftc`) è
  macOS-esclusivo — richiede il framework Speech di Apple, che su Windows non esiste. `main.cjs`
  lo sa già: `process.platform !== 'darwin'` risponde `« native STT is macOS-only »` invece di
  rompersi. Su Windows la trascrizione userà solo il percorso web (Whisper via
  `onnxruntime-web`, già nel codice) — funziona diversamente, non manca del tutto, ma non è
  stato verificato a fondo su quella piattaforma.
- **WebHID** (Theta-Meter) e **Web Bluetooth** (MUSE) sono API di Chromium, non di macOS:
  Electron le porta identiche su Windows. Nessun codice da cambiare lì.
- **`better-sqlite3`** (l'unico modulo nativo vero, oltre a `sharp`) si ricompila da sé
  quando fai `npm install` SU Windows — `electron-builder` chiama `@electron/rebuild`
  automaticamente durante il pacchettaggio, esattamente come già fa oggi per l'arm64 di macOS
  (visibile nei log di ogni build: `executing @electron/rebuild`). Non serve alcuno script in
  più — SOLO che `npm install` giri davvero lì, non che si copino i `node_modules` dal Mac.

## Cosa è stato aggiunto (da questo Mac, oggi)

- `package.json` → `build.win` (icona, target NSIS x64) e `build.nsis` (installer classico,
  non "un clic": lascia scegliere la cartella di destinazione).
- `build.mac.extraResources` (lo spostamento di `sm-stt`, prima in cima a `build`): un
  `extraResources` in cima veniva incluso anche nel pacchetto Windows, dove quel file non
  esiste mai — `electron-builder` si sarebbe fermato cercando un file assente. Ora vive SOLO
  sotto `mac`.
- `electron-builder.serenity.cjs` → lo stesso `win`/`nsis` di EQUILIBRIUM, con l'icona di
  SERENITY al posto di quella di EQUILIBRIUM (stessa ragione già in uso per l'icona `.icns`).
- `build/icon.ico` e `build/icon-serenity.ico` — generati da questo Mac con
  `scripts/make-ico.cjs` (nessun ImageMagick installato: usa `sharp`, già una dipendenza del
  progetto, e scrive il contenitore `.ico` a mano — un formato semplice, intestazione più voci
  PNG, supportato da Windows da Vista in poi). **Restano LOCALI a questa macchina**, come le
  `.icns` già esistenti (`build/` è nel `.gitignore`, di proposito, da prima di questo giro):
  se costruisci su un'altra macchina — anche la stessa VM Windows, la prima volta — vanno
  rigenerati lì con `node scripts/make-ico.cjs build/icon.iconset build/icon.ico` (e la
  variante `-serenity`) prima del primo `dist:win`.
- `npm run dist:win` / `npm run dist:win-serenity` — gli equivalenti di `dist:mac`/
  `dist:serenity`, senza `build:stt` (non serve, e `swiftc` non esiste su Windows).

## Come costruire, sulla macchina Windows

1. Porta il codice sorgente lì (`git clone`/copia della cartella — **mai** i `node_modules` del
   Mac: sono binari arm64/macOS, inutilizzabili e probabilmente causa di errori criptici).
   ⚠️ `git clone` da solo NON porta la cartella `build/` (icone comprese): è nel `.gitignore`,
   di proposito, da prima che le `.ico` esistessero — copiala A PARTE dal Mac (l'intera
   cartella `build/`, `.icns`/`.iconset`/`.ico` insieme) la prima volta.
2. `npm install` (ricompila da sé `better-sqlite3`/`sharp` per Windows — richiede Node.js e,
   se `npm install` si lamenta di un compilatore C++ mancante, gli strumenti di build di
   Visual Studio: `npm install -g windows-build-tools` risolve nella maggioranza dei casi, o
   l'installer di Visual Studio con il carico di lavoro "Sviluppo di applicazioni desktop con
   C++").
3. `npm run dist:win` (EQUILIBRIUM) o `npm run dist:win-serenity` (SERENITY).
4. Il file `.exe` (l'installer NSIS) esce in `release/`, come i `.dmg` su macOS.

Nessuna firma di codice richiesta per farlo GIRARE (come su macOS, dove oggi si salta la firma
allo stesso modo) — Windows SmartScreen mostrerà un avviso "editore sconosciuto" al primo
avvio, cliccabile ("Ulteriori informazioni" → "Esegui comunque"): lo stesso compromesso già
accettato per le build macOS non firmate.

## Non ancora verificato dal vivo

Questa build non è mai stata eseguita su un vero Windows (nessuna macchina Windows raggiungibile
da questa sessione) — la configurazione è corretta e i due build macOS (`dist:mac`/
`dist:serenity`) sono stati rieseguiti dopo ogni modifica per confermare di non averli rotti,
ma il primo `.exe` prodotto va controllato con attenzione: in particolare che l'app si avvii, che
il Bluetooth/WebHID chiedano davvero il permesso a Windows, e che il fallback Whisper web
funzioni senza il binario nativo.
