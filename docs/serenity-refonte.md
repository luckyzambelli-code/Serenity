# SERENITY — le fasi della refonte

> ⚠️ **Non è `refonte-fasi.md`.** Quel documento (e `refonte-ergonomia.md`) parlano
> dell'epurazione dello schermo DI EQUILIBRIUM — un progetto precedente, tutto interno
> a un'unica interfaccia. Questo è un altro piano: **due applicazioni, un solo motore.**
> Diversi commenti nel codice citavano per errore `refonte-fasi.md` per le fasi SERENITY —
> corretto il 16/08/2026, e questo file è il posto giusto da qui in avanti.

Il mandato originale, in una riga: rifare l'interfaccia mantenendo motore, calcoli,
algoritmi MUSE/Meter, gestione ago, gestione Auditor/PC, sedute a distanza e rapporti —
**invariati**. Due applicazioni separate (non un'interfaccia commutabile), stesso deposito,
stesso archivio.

Punti di ritorno, in ordine: `equilibrium-2.0.132` (prima di tutto) →
`serenity-fase1` (controllore di sessione fuori da App.tsx) → `serenity-fase2`
(connessione MUSE) → `serenity-3.0.0` (il guscio, prima uscita).

---

## Le otto fasi

| # | Fase | Stato |
|---|------|-------|
| 1 | Il controllore di sessione fuori da App.tsx (`session/` — 4 cicli + giornale) | ✅ fatta |
| 2 | La connessione MUSE come hook (`hooks/useMuseConnection`) | ✅ fatta |
| 3 | SERENITY, guscio vuoto — seconda applicazione, stesso motore | ✅ fatta |
| 4 | Il flusso di partenza — auditor → solo/PC → qui/distanza → normale/esperto | ✅ fatta |
| 5 | Il Meter al centro — stesso arco, stesso ago, **stesse dimensioni** | ✅ fatta |
| 6 | R-Factor, processo, cicli, giornale, assessment | ⏳ in corso² |
| 7 | Seduta a distanza — link, stato remoto, video/audio | ✅ fatta¹ |
| 8 | Fine seduta e rapporto | ⏳ da fare |

¹ Fase 7: `hooks/useRemoteSession` + `serenity/Connessione.tsx` coprono link/tunnel, WebRTC
video+audio, stato del preclear (batteria, MUSE connesso, qualità segnale), lingua della seduta
e `SESSION_STATE`. **Non** cablato: `RAW_EEG`/`RAW_PPG`/`RAW_GYRO` — SERENITY non ha ancora un
ago EEG (fase 5 legge solo il Theta-Meter USB), instradare l'EEG remoto ora sarebbe un tubo
senza un ago all'arrivo. Si aggancia quando la fase 6 porta la pipeline EEG in SERENITY.

² Fase 6, primo passo (16/08/2026): `hooks/useChargeEngine` — spawn del worker EEG, lettura dei
suoi messaggi, calcolo di carica/fase/AS-IS/reazione. Prima di questo, i quattro cicli (fase 1,
già pronti) non avevano un `qL` vivo a cui agganciarsi — un tubo senza un ago all'arrivo. Non è
una riscrittura: è lo stesso codice che stava nell'onmessage del worker in `App.tsx`, spostato
— le variabili libere sono diventate una `ChargeEngineDeps` esplicita (larga ma onesta, stesso
principio di `ContactNullDeps`), la sequenza delle chiamate no. `App.tsx` è stato riscritto per
usare l'hook al posto del proprio effetto — non un secondo motore parallelo. **Non** ancora
fatto: montare i cicli e il campo item/assessment DENTRO SERENITY (quello resta il prossimo
passo di questa fase) — questo primo passo prepara solo il tubo, non ancora l'ago che ci si
aggancia. ⚠️ Estrazione grossa e sensibile (rilevamento di carica/AS-IS usato in seduta reale):
verificata con typecheck, lint, i 639 test e una build completa, ma il collaudo vero resta con
un MUSE appaiato — questa macchina non può provarlo da sé.

⚠️ **Correzione lo stesso giorno**: la prima versione di `useChargeEngine` teneva private nove
ref (`activeKickRef`, `kickFlybackRef`, `needleItemInterruptRef`, `reactionHoldUntilRef`,
`gammaEmaRef`, `lastFnShownAtRef`, `lastLoggedChargeRef`, `chargeLogPendingRef`,
`lastLoggedReactionRef`) che invece `freeNeedleForNewItem` e il RESET di sessione — rimasti in
`App.tsx` — toccano anche loro: erano diventate due copie scollegate, una viva e una orfana.
Tornate dipendenza. Trovato PRIMA del collaudo hardware, rileggendo il codice — non durante una
seduta. EQUILIBRIUM 2.0.150 corregge.

**Fase 6, secondo passo (17/08/2026)**: `hooks/useMuseContactGate` — lo stesso gate di
« contatto vero » (RMS per elettrodo, railing sull'AC, isteresi) che `useChargeEngine` legge
via `museContactRef`, spostato fuori da `App.tsx` con lo stesso principio: codice invariato,
dipendenze esplicite. Prerequisito scoperto strada facendo: **SERENITY non aveva ancora nessuna
connessione MUSE** — `Serenity.tsx` chiamava solo `useThetaMeter` (l'e-meter USB), mai
`useMuseConnection`. Senza cuffia appaiata il motore della carica non ha campioni EEG da
leggere: montare i cicli richiede prima questo. EQUILIBRIUM 2.0.151.

**Fase 6, terzo passo (17/08/2026) — SERENITY ha un ago EEG vero**: due pezzi in più estratti
con lo stesso principio (`hooks/useStableReleaseState`, « LIBERAZIONE ATTIVA » — CONN-110, il
Tone Arm che scende conta, la velocità del processo no — letto da `useChargeEngine` e influenza
la macchina a stati del ciclo), poi `Serenity.tsx` monta per la prima volta `useMuseConnection`
+ `useMuseContactGate` + `useStableReleaseState` + `useChargeEngine` + `useEpValidation` (lo
stesso EP a 4 stadi di EQUILIBRIUM, condiviso). Un bottone « connect muse » appare in
intestazione; l'ago EEG si muove per davvero (`needleOffsetProp` legge `needleEngine`, il
motore fisico condiviso, invece della costante `SET_OFFSET`); l'AS-IS del quadrante segue lo
stato vero (`ep.asIsnessState`) invece del `"persist"` fisso di prima.

⚠️ Cosa mancava a quel punto: l'ago EEG reagiva ma nessun ciclo era armabile.

**Fase 6, quarto passo (17/08/2026) — un ciclo si arma per davvero**: `session/
useContactNullCycle` (pronto dalla fase 1) montato in `Serenity.tsx`. Un campo item + due gesti
(« dai l'item » → `cycles.armCycle('charge')`, poi « dichiara AS-IS » → `cycles.validateAsIs()`)
sostituiscono i placeholder `cycleArmedRef`/`trackCycleRef` con quelli VERI del ciclo.
`freeNeedleForNewItem` (già scritta al passo precedente per il tasto SET) trova finalmente chi
la chiama. Verificato A SCHERMO (senza MUSE reale, ma l'intero giro dell'interfaccia): dare
l'item scrive « ▶ #1 … » nel giornale e fa comparire « dichiara AS-IS »; dichiarare l'AS-IS
scrive « ✓ #1 … — AS-IS » e torna al campo vuoto, pronto per il prossimo.

⚠️ A quel punto mancavano ancora: NULL, CORPUS, lag di Ron, assessment da voce, MNA/MIRROR/TONE.

**Fase 6, quinto passo (17/08/2026) — NULL e CORPUS**: due aggiunte, stesso principio « il
motore già lo sa fare, qui si collega ». `cycles.armCycle('null')` (un secondo bottone, « dai
l'item (NULL) ») e la sua chiusura (`cycles.validateClearRead(vgi)`, due bottoni — « EQUILIBRIUM
· VGI ✓ » e « · senza VGI », stesso lessico di App.tsx) — CONTACT e NULL condividono lo stesso
campo item, sono due strade sullo stesso motore, non due cicli da scrivere due volte.

`apri()`/`chiudi()` scrivono ora davvero nel CORPUS come App.tsx: `corpusSessionRef` prende
l'ora d'apertura (l'identificativo di seduta) e la riga `sessionRecord` parte SUBITO — se la
seduta si interrompe, le reazioni già scritte restano interpretabili. Con `corpusAvailable()`
falso (Chrome, non l'app Electron) compare lo stesso avviso « archivio non attivo » di
App.tsx, tradotto per SERENITY. `writeCycleCorpus`/`markFnAsIs` (passo precedente, no-op)
scrivono ora `cycleRecord`/`fnRecord` per davvero.

Verificato A SCHERMO: un ciclo NULL armato con « le passé » mostra entrambi i bottoni di
chiusura; « EQUILIBRIUM · VGI ✓ » chiude il ciclo e il giornale avanza di una riga; nessun
errore console alla scrittura CORPUS (compreso il percorso "non disponibile in browser").
EQUILIBRIUM 2.0.154, SERENITY 3.0.17.

⚠️ **Revisione completa richiesta (17/08/2026)**: segnalato che SERENITY non riproduceva
fedelmente le funzionalità di EQUILIBRIUM e che qualcosa "non reagiva". Test interattivo
sistematico di ogni controllo esistente (tema, lingua, profili, avvio, MUSE, seduta, cicli,
Connessione): un solo apparente guasto, tracciato a un residuo di hot-reload del dev server
su una tab riusata troppe volte — confermato SENZA difetti in una tab pulita. Costruita la
matrice completa EQUILIBRIUM → SERENITY (vedi `docs/da-provare.md`): 18 funzioni fatte, 2
parziali, 14 assenti. Parità totale non raggiungibile in una sola sessione — si chiudono i
vuoti in ordine di priorità clinica.

**Sesto passo — i numeri accanto all'ago**: SERENITY aveva SOLO il quadrante — nessun TA in
cifre, nessuna fase in parole, a differenza di App.tsx che li affianca sempre. Un ago che si
muove poco, guardato nell'istante sbagliato, sembra fermo anche a motore funzionante: `TA` e
la fase (`LetturaTA`/`LetturaFase`, `React.memo`, dalla stessa `metricsStore`) tolgono
quell'ambiguità.

**Settimo passo — la validazione manuale dell'EP**: `serenity/PannelloEp.tsx`, a tutta pagina
come `PannelloProfilo`/`Connessione`. Stesso `hooks/useEpValidation` di EQUILIBRIUM (non un
secondo stato): reazione dell'ago, realizzazione del PC, VGI/VVGI, nota — e la validazione fa
le stesse quattro cose di App.tsx (`epValidated`, chiude, `asIsnessState:'ep'`, riga di
giornale). ⚠️ `EpValidationModal` (la finestra automatica a conto alla rovescia) NON ha un
equivalente: verificato che in EQUILIBRIUM stesso `setShowEpValidation(true)` non viene mai
chiamato da nessuna parte del codice — nata morta, niente da riprodurre. Verificato a schermo
un giro completo: apre, compila, VGI, valida → torna alla seduta con "EP ✓" e il giornale
avanza. EQUILIBRIUM 2.0.156, SERENITY 3.0.19.

Verifica di ogni fase: la stessa seduta, condotta nelle due applicazioni, deve dare lo
stesso giornale, lo stesso rapporto, gli stessi test verdi.

**Ottavo passo — le camere** (`serenity/CameraCerchio.tsx`): assente dalla matrice, e grave in
seduta a distanza — l'auditor riceveva già `remote.remoteStream` (fase 7) ma non lo mostrava
da NESSUNA parte, quindi non poteva VEDERE il preclear collegato. Stesso aggancio di
`components/CameraFeed.tsx` (callback ref, retry su `play()`, `attachAudioBoost`), grafica
propria: un cerchio (`Cerchio.tsx`), non un riquadro con barra del titolo e badge. CAM 2 (PC):
lo stream remoto a distanza, la webcam locale quando l'auditor testa da solo (`avvio.solo`).
CAM 1 (auditor): sempre locale, come in EQUILIBRIUM. Solo a seduta aperta.

**Nono passo — CONFIG, all'inizio del flusso**: segnalato assente l'intero cassetto CONFIG di
EQUILIBRIUM (aspetto, moduli visibili, disposizioni). `serenity/PannelloConfig.tsx`, a tutta
pagina, raggiungibile da un'icona ingranaggio sull'Avvio E durante la seduta (stessa libertà
del cassetto di EQUILIBRIUM, non solo un passaggio obbligato). Tema/lingua/trasparenza/sfondo
sono le STESSE quattro preferenze di `useUiStore`/`useI18n` — cambiarle qui le cambia anche
per EQUILIBRIUM. La trasparenza (`uiAlpha`) non governa un vetro (SERENITY non ne ha) ma
l'`opacita` dei cerchi satellite (nuovo prop di `Cerchio.tsx`) — stessa impostazione, grafica
propria. Lo sfondo usa `--s-veil` (mai usato finora, esisteva già nel token) invece del vetro
scuro di EQUILIBRIUM. I sette moduli di EQUILIBRIUM restano tutti in lista
(`serenityModuleStore.ts`, archivio A PARTE da `layoutStore` — altrimenti spegnere una camera
in SERENITY spegnerebbe quella di EQUILIBRIUM, stesso `localStorage`): solo `cam1`/`cam2` sono
interruttori veri, gli altri cinque restano spenti e onesti (« in arrivo »), pronti ad
accendersi quando la loro fase costruisce il pannello. Il salvataggio di più disposizioni non
ha un equivalente — dichiarato in pannello, non taciuto: SERENITY non sposta i moduli.

**Decimo passo — le connessioni, un punto e una parola per dispositivo**
(`serenity/IndicatoreConnessione.tsx`): segnalato che lo stato delle connessioni doveva dirsi
SUBITO — quale dispositivo è collegato, quale non lo è, se regge, quale aspetta, un errore,
una ricerca in corso — senza diventare un pannello diagnostico. Un solo componente, cinque
stati (connesso/in-attesa/cercando/errore/spento) sui TRE soli colori di `tokens.css` (mai un
quarto). In seduta a distanza la rete verso il PC e il SUO Muse sono ora due indicatori
separati (erano una riga sola, e "quale dei due non risponde" si doveva dedurre dal testo) —
`remote.tunnelLoading`/`remote.errore` (già esposti dall'hook, mai letti prima in
`Serenity.tsx`) danno finalmente gli stati "cercando"/"errore" anche DURANTE la seduta, non
solo nella schermata di connessione iniziale.

Verificato a schermo (tab pulita): CONFIG si apre dall'Avvio e dalla seduta, torna esattamente
al punto di partenza; il toggle CAM 1/CAM 2 spegne e riaccende i cerchi dal vivo; tema scuro
verificato — cerchi e indicatori restano leggibili; le due camere in seduta SOLO mostrano
"CAMÉRA HORS LIGNE" quando il browser nega il permesso (atteso in sandbox, corretto — non un
difetto). EQUILIBRIUM 2.0.157, SERENITY 3.0.20.

⚠️ **Segnalato subito dopo (17/08/2026)**: le camere troppo piccole (« l'auditor deve vedere
il PC correttamente ») e le scritte di connessione/CONFIG poco leggibili (« un'interfaccia
semplice e serena deve essere però leggibile »). Due correzioni, non un nono passo a parte:

- **Le camere sono uscite dall'intestazione** — 44 px in una riga con tema/lingua erano
  un'icona, non un volto. Ora galleggiano in un blocco `position:absolute` sopra l'angolo
  del pannello scuro (non nel flusso della sezione: il quadrante non perde un pixel della sua
  taglia per farle posto — stessa regola del principio dimensionale qui sotto). CAM 2 (PC),
  la priorità: 190 px. CAM 1 (auditor), un controllo secondario: 100 px. Una didascalia
  SEMPRE visibile sotto ogni cerchio (non più solo un `title` al passaggio del mouse).
- **Il colore è tornato a essere solo l'accento, mai la parola.** `IndicatoreConnessione`
  metteva anche il TESTO nel colore tenue del segnale — coerente con la dottrina (« i colori
  dicono, non gridano ») ma illeggibile per « in attesa »/« spento » su fondo perla. Ora il
  punto resta colorato (7→9 px), la parola è sempre `--s-ink` pieno. Stesso principio in
  `PannelloConfig.tsx`: le etichette di sezione e i nomi dei moduli erano in `--s-ink-faint`
  a 10,5 px — troppo piccole E troppo deboli insieme. Bump a `--s-ink-soft`/`--s-ink` e a
  taglie leggermente maggiori, senza toccare la calma della pagina: nessun colore acceso in
  più, solo più inchiostro dove c'è testo funzionale da leggere davvero.

Verificato a schermo (tab pulita, tema chiaro e scuro): le due camere si leggono come un volto
anche a distanza, le didascalie CAM 1/CAM 2 sempre visibili, CONFIG e gli indicatori di
connessione leggibili senza sforzo in entrambi i temi. EQUILIBRIUM 2.0.158, SERENITY 3.0.21.

⚠️ **Segnalato di nuovo (18/08/2026)**: « non vedo dove posso connettere il METER, e non vedo
i test meter e muse, il TA doppia lattina e solo ». Vero — `Serenity.tsx` chiamava già
`useThetaMeter` (fase 5, l'ago si disegna) ma NESSUN elemento dell'interfaccia chiamava mai
`theta.connect()`, `theta.startSqueezeTest()`/`startBreathTest()` o
`theta.addPointFromReference()`: il footer diceva solo, in grigio, se era connesso — un testo,
non un bottone. `serenity/PannelloMeter.tsx` (scritto in una sessione precedente, mai collegato)
colma il vuoto con le STESSE funzioni di `useThetaMeter`, zero logica propria:

- **Intestazione** — un `IndicatoreConnessione` in più, accanto a quello del MUSE: click per
  connettere/disconnettere, `theta.unavailable` (niente WebHID nel browser) distinto da
  "non ancora connesso", esattamente come già distinto per MUSE.
- **Piè di pagina** — `PannelloMeter` sostituisce lo span di solo testo: bottone di stato,
  e a connessione avvenuta un pannello a comparsa con due-lattine/lattina-sola
  (`theta.setConfig`), la prova della stretta e la prova del respiro (con l'esito ✓/⚠), e la
  taratura TA a due punti (`theta.addPointFromReference`, contatore punti, fabbrica/propria,
  `theta.clearTaCalibration`) — le stesse funzioni del cassetto Theta-Meter di EQUILIBRIUM.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (solo gli avvisi preesistenti),
`vitest run` 639/639. A schermo (tab pulita, seduta aperta): il punto "Collega il meter"
compare in intestazione E in piè di pagina, il ciclo CONTACT si arma e mostra il contatore
"CONTACT 1 · 0 AS-IS" e l'arco colorato che avanza — i cicli, oggetto del secondo segnalato di
questa stessa giornata, erano già visibili (MIRROR/TONE/terzo esito NULL/contatore/ANNULLA
tutti presenti, opera di lavoro precedente in questa sessione): mancava solo l'aggancio del
meter. EQUILIBRIUM 2.0.163, SERENITY 3.0.26.

⚠️ **Segnalato ancora (18/08/2026, subito dopo)**: cinque punti distinti, tutti veri.

1. **« la connessione METER non la vedo, vedo invece connessione MUSE »** — bug vero, non
   percezione: l'etichetta del punto in caso `theta.unavailable` usava `theta_uncalibrated`
   ("non tarato") invece di `ser_meter_unavailable` ("meter non disponibile qui") — una parola
   che non nomina nemmeno il meter. Corretto in due punti (l'indicatore d'intestazione e
   `PannelloMeter.tsx`).
2. **« la logica METER/MUSE/NESSUN STRUMENTO non è implementata »** — vero: App.tsx chiede
   SEMPRE, al primo avvio senza nulla di già collegato, quale configurazione usare ("senza
   strumenti" è il gruppo di controllo, una scelta, non un difetto). SERENITY apriva la seduta
   comunque. Aggiunto un pannello identico nella funzione (`connSel` — MUSE e METER selezionabili
   insieme, "nessuno" esclusivo con loro, come `scegliConn` di App.tsx), grafica di SERENITY,
   davanti ad ogni apertura di seduta finché non c'è né uno strumento connesso né la scelta
   "senza strumenti" già fatta.
3. **« il CICLO CONTACT non è specificato in basso »** e **4. « visibilità dei CICLI non
   ottimale... bottoni più visibili, uno accanto all'altro come in EQUILIBRIUM »** — le quattro
   strade (CONTACT/NULL/MIRROR/TONE) erano link fantasma senza bordo, indistinguibili a colpo
   d'occhio. Ora quattro pillole bordate, ciascuna col nome per intero e uno dei tre colori di
   `tokens.css` (TONE resta neutro — mai un quarto colore nuovo). A ciclo armato un badge PIENO
   dello stesso colore («CONTACT»/«NULL»/«MIRROR»/«TONE») sta prima dell'item, non dopo un
   contatore in grigio che bisognava leggere per capire quale dei quattro stesse girando.
4. **« dare l'ITEM a voce... non è implementata »** — I tre motori dei cicli (`useContactNullCycle`/
   `useMirrorCycle`/`useToneCycle`, portati da App.tsx in una sessione precedente) sapevano già
   riempire l'item da soli (`cycleAwaitItemRef`/`itemDettato` e le sue due sorelle) — mancava la
   SORGENTE. `hooks/useVoiceItem.ts` (nuovo) avvia lo stesso riconoscitore di App.tsx (nativo
   macOS, poi Whisper offline), e ogni frase finale entra nel giornale come farebbe l'auditor
   scrivendola — tre `useEffect` (uno per motore) la smistano verso l'item in attesa, filtrata da
   `engine/assessItemFilter.ts` (isAssessableItem, già condiviso, non duplicato). Aggiunto anche
   il pulsante di ripiego « l'item è stato detto » (`dichiaraItemDetto`, come App.tsx) per quando
   la trascrizione non c'è, e l'indicatore pulsante « dì l'item… » (`.ser-pulse`, nuovo in
   `tokens.css` — il "respiro" esistente è troppo lento per un'attesa attiva) durante le fasi
   `*.say_item` di `engine/sessionPhase.ts` (`deriveCyclePhase`, mai importato in SERENITY prima
   d'ora — stessa derivazione pura di App.tsx, zero soglie riscritte).

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639. A schermo (tab
pulita): il pannello "con che cosa si audita?" compare al primo APRI UNA SEDUTA con MUSE/LATTINE/
"seduta senza strumenti" selezionabili; le quattro pillole CONTACT/NULL/MIRROR/TONE si vedono
distintamente nel piè di pagina; armato CONTACT compare il badge verde pieno "CONTACT" e, prima
che l'item sia dato, "dì l'item…" pulsante con il bottone di ripiego — cliccato, spegne
l'avviso e lascia il ciclo proseguire. EQUILIBRIUM 2.0.164, SERENITY 3.0.27.

⚠️ **Chiesto nello stesso momento**: « un sistema di configurazioni registrate che memorizzi
le scelte iniziali... alla sessione successiva l'Auditor deve poter richiamare una
configurazione salvata... evitando di ripetere ogni passaggio iniziale ». Nuovo
`serenity/configurazioniStore.ts` (localStorage, come `serenityModuleStore.ts` — preferenze di
macchina, non dati di seduta): ogni configurazione è un'istantanea delle quattro domande
dell'avvio (`flussoAvvio.ts`'s `Avvio`) PIÙ la scelta strumenti (`connSel`), perché sono
entrambe "le scelte iniziali" e la seconda si fa DOPO la prima, non dentro. Si salva dal
pannello strumenti (l'unico punto in cui le cinque scelte sono tutte disponibili insieme, con
un campo nome + "salva"), si richiama dalla primissima schermata dell'avvio (una striscia
"CONFIGURAZIONI SALVATE" sopra la domanda, solo se ne esiste almeno una) — un click salta le
quattro domande E avvia in sottofondo la connessione degli strumenti salvati, così quando
l'auditor preme APRI UNA SEDUTA il gate strumenti trova già la risposta e non si ripresenta.
Verificato a schermo: salvata "Solo rapido" dal pannello strumenti, ricomparsa nella striscia
dopo "cambia auditor o preclear", richiamata con un click → dritti alla schermata principale
con auditor/modo già impostati, APRI UNA SEDUTA apre la seduta SENZA mostrare di nuovo il
pannello strumenti. EQUILIBRIUM 2.0.164, SERENITY 3.0.27.

⚠️ **Segnalato di nuovo (18/08/2026, stesso giorno)**: « comment peux-tu mettre la connexion
METER EN BAS, le MUSE en haut... il faut que SERENITY soit un CHEMIN DE FACILITÉ et de
COMPRÉHENSION ». Aveva ragione: la prima versione di `PannelloMeter` portava con sé un
SECONDO bottone « Collega il meter » piantato in fondo alla pagina, mentre MUSE si connette da
UN punto solo, in intestazione — due strumenti, due abitudini diverse. Riorganizzato:

- **La connessione vive SOLO in intestazione** (l'indicatore già esistente, identico a quello
  del MUSE). `PannelloMeter` non ha più un bottone di connessione proprio — è montato SOLO a
  meter già connesso.
- **La sua configurazione (due lattine/lattina sola, le due prove, la taratura TA) è
  un'ESPANSIONE ancorata sotto quello stesso indicatore** — una freccia "▾ configurazione"
  accanto al punto, non un secondo pannello lontano da scoprire. Si chiude da sé se il meter si
  disconnette.

Insieme, chiesto (« le réglage est incompréhensible, fonctionne seulement les deux boîtes »):
« lattina sola » non era rotta — mancava il modo di misurare la correzione che richiede
(`theta.setSoloOffset` esisteva, nessun bottone lo chiamava, a differenza di App.tsx e del suo
`ThetaReadyCheck.tsx`). Portata la STESSA prova doppia (`provaTa`, `engine/canTest.ts`'s
`compareReady`/`soloTaOffset`, già condivisi): un avviso quando si sceglie "lattina sola" senza
scarto misurato, il confronto dei due TA (due lattine · una lattina · differenza) appena
entrambe le prove sono fatte, e "usa questa differenza" per applicarla — zero calcolo nuovo,
le stesse funzioni pure di App.tsx.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639. A schermo (tab
pulita): il piè di pagina non porta più alcun controllo del meter — CONTACT/NULL/MIRROR/TONE e
basta; l'intestazione resta l'unico punto per MUSE e METER, uno accanto all'altro.
EQUILIBRIUM 2.0.166, SERENITY 3.0.29.

---

## L'audit comparativo (18/08/2026) — cosa manca ancora, davvero

Chiesta esplicitamente una « transformation complète » con audit preliminare: un'esplorazione
sistematica ha confrontato `App.tsx` (~7000 righe) con l'intero `src/serenity/` per ogni area
funzionale (ago, arco, quattro cicli, METER, MUSE, avvio, CONFIG, camere, connessione remota,
trascrizione vocale, F/N, R&I, EP, MNA, CORPUS, calibrazioni, biometria, traduzioni). Il
risultato completo (matrice + gap prioritari) è nella cronologia della sessione; qui i punti
che RESTANO aperti, in ordine di rischio per una seduta reale — e lo stato di ciascuno:

1. ~~**Nessuna pausa su MUSE perso**~~ **RISOLTO** (questa voce) — `pauseOnLoss` era un no-op
   esplicito; ora la seduta va in pausa vera (`sessionClock.pause()`, badge « in pausa —
   strumento perso » pulsante accanto all'orologio) e riprende da sé al ritorno del contatto.
2. **Nessun recupero da crash / bozza automatica** (`lib/storage`'s `saveSessionDraft`/
   `loadSessionDraftAsync`, `lib/crashGuard`) — non ancora portato.
3. **Nessun rapporto di fine seduta** (`components/PostSessionReport`) — non ancora portato;
   chiudere una seduta SERENITY non produce riepilogo, grafico, né esportazione.
4. **La seduta non entra nella cronologia del profilo** (`saveSession()`) — dipende dal punto 3
   (i dati del riepilogo li calcola oggi solo `PostSessionReport`): non separabile senza o
   costruire quel calcolo altrove o inventare numeri non misurati, il che sarebbe peggio di non
   averli.
5. **R&I / assessment multi-item** — `ensureAssessmentOn` resta un no-op nei tre cicli; l'intero
   metodo (liste di item, letture per item, `itemRecord`/`reactionRecord` nel CORPUS) è
   inaccessibile da SERENITY.
6. **Nessuna consultazione dell'archivio CORPUS** (`components/HistoryModal`) — non portato.
7. **Ready-check del Theta-Meter** (`components/ThetaReadyCheck`) — non montato: chi lavora solo
   col Meter non riceve più l'avviso di prontezza metabolica prima di iniziare.
8. Nessuna visualizzazione del giornale/transcript durante la seduta (scelta di design
   dichiarata, non un buco silenzioso — solo un contatore di righe è visibile).
9. Nessuna scelta dell'ago principale con MUSE e Meter entrambi collegati (regola fissa: il
   Meter ha sempre la precedenza).
10. BPM/PPG e pannelli di salute/biometria calcolati dal motore ma mai mostrati.
11. Nessuna ridondanza satellite/hands-free, e gli errori del riconoscitore vocale restano
    silenziosi (nessun log di stato come in App.tsx).
12. Il selettore esperto/normale resta un'etichetta senza effetto (in App.tsx sblocca pannelli).
13. Nessuna guida passo-passo del ciclo (`CycleHint`/`CycleSteps`).

Punti 2-4 (crash recovery, rapporto, cronologia) sono i più consistenti — richiedono ciascuno
una sessione di lavoro dedicata, non una riga in coda a questa. Punto 5 (R&I) è un metodo
intero, non un dettaglio. Si procede in quest'ordine.

Verificato (auto-pausa): `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639,
a schermo l'orologio continua a scorrere normalmente in seduta senza strumenti (nessuna falsa
pausa) — EQUILIBRIUM 2.0.167, SERENITY 3.0.30.

⚠️ **Revisione funzionale — non solo grafica (17/08/2026, terza segnalazione)**: due
regressioni VERE, non d'aspetto — una funzione persa nel passaggio a SERENITY, non solo
ridisegnata:

- **La CAMM non si può « nascondere e basta »**. `CameraFeed.tsx` di EQUILIBRIUM ha DUE
  controlli distinti: `isVisible`/`onToggle` la RIMPICCIOLISCE in seduta (stream ancora vivo,
  attenuato), `onDisable` la TOGLIE dal layout. La prima versione di `CameraCerchio.tsx` aveva
  SOLO il secondo (via CONFIG → moduli) — il gesto rapido di minimizzare/riespandere era
  sparito. Tornato: cliccare il cerchio lo collassa (video ancora agganciato, 62% d'opacità,
  taglia un terzo), ricliccare lo riespande — `collassata`/`onToggleCollasso`, nuovi prop.
- **L'arco dei cicli non c'era più**. In EQUILIBRIUM il quadrante ha un SECONDO arco,
  concentrico a quello dell'ago (`components/ClearDial.tsx` — stesso perno, stesso SWEEP):
  CONTACT · DISSOLUTION · AS-IS (o NULL · RISE · EQUILIBRIUM in ciclo NULL) coi loro colori,
  le suddivisioni, le etichette curve lungo l'arco, un puntino di avanzamento agganciato alla
  geometria dell'ago. SERENITY aveva il CICLO (arma/valida già funzionanti dalla fase 6) ma
  l'arco non lo diceva più — solo bottoni di testo in fondo pagina, l'informazione visiva
  persa. Montato `ClearDial` TALE E QUALE (stessa logica di `QuantumSphere`: qui i colori SONO
  l'informazione, non un ornamento da reinterpretare) dentro il pannello dello strumento,
  subito dopo l'ago. Nello stesso giro si è chiuso anche `onLagMeasured` (era un no-op
  documentato dalla fase 1 — «il lag di Ron, nessun readout») e si è aggiunta la % di
  dissoluzione accanto al TA: la stessa `CycleStatusBar` di App.tsx le calcola entrambe, qui
  in un `LetturaCiclo` a parte (solo a ciclo armato, isolato dal re-render a 10 Hz di `qL`).

Verificato a schermo (tab pulita): armato un ciclo CONTACT, l'arco passa da grigio spento a
pieno regime e le tre parole CONTACT/DISSOLUTION/AS-IS compaiono lungo la curva (confermato nel
testo di pagina, non solo a vista); in tema scuro i tre colori di fase sono quelli giusti
(rosso/blu/grigio spento, gli stessi di `chargeStateById`). Cliccare CAM 1 la rimpicciolisce e
la sua didascalia resta leggibile; ricliccare la riporta intera. EQUILIBRIUM 2.0.159, SERENITY
3.0.22.

⚠️ **Non chiuso in questo giro, segnalato per la prossima verifica sistematica**: gli altri
« secondi archi » di EQUILIBRIUM — `MirrorDial` (ciclo MIRROR) e `ToneDial` (TONE SCALE) — non
hanno un equivalente perché i cicli MIRROR/TONE non sono ancora montati in SERENITY (gap già
noto, non nuovo); la `CycleStatusBar` completa ha anche un chip « sembra NULL »
(`noReadSignal`) non ancora ripreso, solo il lag e la % dissoluzione.

⚠️ **Continuando la stessa verifica (17/08/2026, quarto giro), tre CONTROLLI mancanti nel
piede di pagina del ciclo** — non l'arco stavolta, i bottoni stessi:

- **Il terzo esito del NULL, « NON RICARICA ».** App.tsx dice, testuale, che è « il risultato
  diagnostico più prezioso del ciclo NULL »: senza dichiararlo il ciclo resta indistinguibile
  da uno abbandonato, e quel ramo del rapporto/CORPUS resta irraggiungibile. SERENITY aveva
  SOLO i due esiti VGI/senza VGI — un bottone intero perso, non uno stile. Aggiunto
  `ser_no_recharging` (le 5 lingue, stesso testo di App.tsx) e il bottone, che chiama
  `cycles.declareNoRecharging()` — GIÀ nella `useContactNullCycle` montata dalla fase 6,
  semplicemente non richiamata da nessun controllo.
- **ANNULLA.** In App.tsx chiudere un ciclo armato ha due strade — validare, o ANNULLA
  (`finalizeCycle(false)`), che lo lascia « non validato » nel rapporto invece di forzare un
  esito che non è successo. SERENITY non aveva modo di uscire da un ciclo armato per errore
  senza scegliere comunque un esito.
- **Il contatore del ciclo in corso.** Un chip di App.tsx dice, per il SOLO metodo in corso
  (CONTACT con CONTACT, NULL con NULL — due contatori insieme confondono, scelta utente),
  quanti cicli sono stati armati e quanti portati a compimento in questa seduta.
  `cycles.cycleStats` arrivava già dalla stessa `useContactNullCycle` — solo non era letto.

Tutti e tre i valori/azioni esistevano già nel motore condiviso (`useContactNullCycle`,
montato dalla fase 6): mancavano SOLO i controlli che li richiamano — lo stesso pattern
dell'arco e della CAMM: la logica c'era, l'interfaccia non la esponeva più.

Verificato a schermo (tab pulita): armato un ciclo NULL, il piede di pagina mostra ora
« NULL 1 · 0 CLEAR » (contatore), CANCEL, EQUILIBRIUM · VGI ✓, EQUILIBRIUM · no VGI, NO
RECHARGING nello stesso sguardo; premuto NO RECHARGING il ciclo si chiude (torna ai due
bottoni d'armamento), esattamente come `finalizeCycle(false)` fa in App.tsx. EQUILIBRIUM
2.0.160, SERENITY 3.0.23.

**Undicesimo passo — l'MNA, il primo dei sottosistemi assenti a diventare reale**
(`serenity/PannelloMna.tsx`): `useChargeEngine` scriveva già `primeIm`/`primeFd`/`primeZone`/
`primeDelta`/`primePStar` da sempre (il worker gira comunque, l'avviso in cima al blocco MNA di
`Serenity.tsx` lo diceva da fasi) — mancava SOLO l'interfaccia, stesso pattern di CAMM e arco.
Diverso dagli altri pannelli SERENITY (`PannelloEp`/`PannelloConfig`, a tutta pagina): l'MNA in
App.tsx « sta qui ma non è un modo — si apre SENZA lasciare il ciclo in corso », quindi qui
galleggia SUL pannello dello strumento (come le camere), la seduta resta visibile sotto. Stessa
macchina a quattro fasi di `MnaPanel.tsx` (CAPTURE → SONIFY → CLEAN → HARMONICS, una pressione
= l'azione della fase corrente, gli stessi guardrail `canAdvance`), `onCapture` blocca sul picco
di I_m (`engine/PrimeFreqTracker.ts`), `onAudio` inoltra al PC remoto via `networkManager`
(`MNA_AUDIO`) — nessuno dei due reinventato. `mna` è diventato il terzo modulo REALE di
`serenityModuleStore.ts` (era fra i cinque « in arrivo » di CONFIG).

Nello stesso giro, chiuse due perdite collegate scoperte costruendolo:
- `stopSonification` era un no-op — l'AS-IS chiude l'MNA in corso in App.tsx (« la carica non
  c'è più, il tono primo non ha più niente da trattare »); senza, un tono sarebbe restato
  acceso oltre la fine del ciclo che lo giustificava.
- `onHarmonicCopy` (il callback di `primeFreqAudio` che popola le copie durante HARMONICS) non
  era mai agganciato — il contatore COPIES sarebbe restato a zero per sempre. Agganciato
  all'apertura della seduta, come in App.tsx, insieme all'ingresso automatico in CAPTURE (non
  IDLE — l'attrezzo è pronto dal primo secondo) e allo spegnimento alla chiusura della seduta.

Verificato a schermo (tab pulita): il tasto MNA appare nel piede di pagina a seduta aperta, apre
il pannello galleggiante con I_M/ZONE/F_D/Δ/P*/COPIES e il bottone della fase corrente
(« CAPTURE »); senza segnale reale il bottone non avanza (`primeCaptured` resta falso — guardia
corretta, non un difetto); la ✕ lo richiude senza toccare la seduta sotto; CONFIG mostra ora
« Modulazione Neuro-Acustica » come interruttore vero, non più « in arrivo ». EQUILIBRIUM
2.0.161, SERENITY 3.0.24.

**Dodicesimo passo — il ciclo MIRROR, il secondo sottosistema assente a diventare reale**
(`session/useMirrorCycle`, già estratto e condiviso con App.tsx, mai montato qui): come per
CONTACT/NULL, `trackMirrorRef` esisteva già in `Serenity.tsx` — l'ago EEG lo alimentava a ogni
campione — ma restava un no-op: il metodo del raddoppio di Ron era TOTALMENTE inaccessibile,
non solo privo d'arco. Montato lo stesso motore, e l'arco che gli appartiene (`MirrorDial`,
identica geometria di `ClearDial`) **prende il suo posto** quando MIRROR è armato — in App.tsx
i due archi sono ESCLUSIVI a vicenda (`viewMode`); qui la stessa esclusività senza un
selettore di modo a parte: i bottoni d'armamento dei tre metodi si escludono da soli (armare
uno nasconde gli altri due), quindi i due cicli non possono mai essere armati insieme.

Ripresa la sequenza a TRE tempi di App.tsx (non due — l'errore che il codice originale stesso
segnala di NON ripetere): (a) il VALORE 1–10 dell'item, dieci bottoni; (b) il DOPPIO da
raggiungere, dichiarato a mano; (c) OTTENUTO → valida. Le chiamate al motore
(`mirrorCycle.setManualValue`/`declareReached`/`stopMirror`) sono le STESSE di App.tsx, non
reinterpretate. Un bottone ANNULLA copre l'uscita anticipata (in App.tsx quel gesto passa dal
cambio di modo, che SERENITY non ha — stessa funzione, `stopMirror()`, raggiunta da un
controllo diretto invece che da un selettore).

Verificato a schermo (tab pulita): armato MIRROR, l'arco cambia da CONTACT/DISSOLUTION/AS-IS
alla scala 1–10 con i doppi fra parentesi; bloccato il valore a 6 il piede di pagina mostra
« 6 → 12 » e l'arco « 6.0 → ×2 12.0 »; dichiarato raggiunto compare « OBTENU » pulsante
sull'arco e « obtenu — valider » in fondo; validato, il giornale avanza di due righe (la
diagnostica di taratura + l'esito) e si torna ai tre bottoni d'armamento con l'arco tornato a
ClearDial; armando CONTACT durante il test, il bottone MIRROR spariva (esclusività confermata).
EQUILIBRIUM 2.0.162, SERENITY 3.0.25.

⚠️ Resta assente: TONE SCALE (e il suo `ToneDial`) — stesso pattern, prossimo candidato.

**Tredicesimo passo — TONE SCALE, il terzo e ultimo sottosistema-ciclo assente a diventare
reale** (`session/useToneCycle`, 326 righe, già estratto e mai montato): il più grande dei tre,
perché a differenza di CONTACT/NULL/MIRROR TONE dipende da infrastruttura che SERENITY non
aveva ancora — non solo il motore del ciclo:

- **La prova delle lattine per persona** (`engine/canTest.ts` — `canHistory`/`provaTa`): da lì
  esce il margine sul tono (« senza prova, una divisione in meno ») e lo scarto del SOLO.
  Stessa logica di App.tsx, riletta quando cambia il nome (« l'archivio è per persona, non per
  strumento »). In SOLO il « preclear » di questa prova È l'auditor — stessa regola del sesso.
- **Il sesso del preclear** (`pcSex`): decide il TA di clear (tono 40 di QUESTA persona — 3.0
  uomo, 2.0 donna). App.tsx lo tiene in un suo store globale (`useProfileStore`), popolato dal
  SUO flusso di selezione profilo — SERENITY non ha quello store: qui si legge direttamente dal
  profilo scelto in `Avvio` (`PcProfile`/`UserProfile.sex`, lo stesso campo che serve già a
  EQUILIBRIUM per la stessa ragione in modalità SOLO).
- **La configurazione elettrodi** (`theta.setup.config`/`offsets`): già interamente disponibile
  — `useThetaMeter` è montato in SERENITY dalla fase 5, semplicemente nessun ciclo ne aveva
  ancora avuto bisogno.

Diverso dagli altri tre metodi anche nell'interazione: TONE non si "arma" per un item — è un
METODO in cui si LAVORA per più resistenze di fila (locate → raise → done → locate…), come il
tab di App.tsx che resta su TONE finché l'auditor non lo cambia. Qui un gesto diretto
(`toneAttivo`) fa la stessa cosa, esclusivo con CONTACT/NULL/MIRROR come gli altri tre fra
loro. `ToneDial` prende il posto degli altri archi quando attivo (stessa geometria condivisa).
Il menù a tendina dei livelli nominati di Ron (Serenity of Beingness, Postulates… fino a Total
Failure) compare quando non c'è un meter — le STESSE 13 tappe di `TONE_LABELS`, non
un'invenzione.

⚠️ **Un bug reale trovato dalla verifica interattiva stessa** (non dal tsc, non dai test): il
bottone "tono quaranta raggiunto" chiamava solo `chiudiTone(true)` — in App.tsx quel gesto fa
DUE cose insieme (`chiudiTone(true); setTonePhase('done');`), la seconda delle quali avanza la
fase mostrata a schermo. Senza, il ciclo si registrava correttamente nel giornale ma il piede
di pagina restava bloccato sulla fase 'raise' — invisibile a tsc/lint/test, visibile solo
premendo il bottone davvero. Corretto nello stesso giro: prova viva di perché il mandato
insiste sul test interattivo, non solo sulla compilazione.

Verificato a schermo (tab pulita, un profilo "uomo"): localizzato un tono a −20 col menù dei
livelli nominati, l'arco mostra "−20 → +40"; "portalo a tono 40" incrementa il contatore
(«×2»); "tono quaranta raggiunto" porta l'arco a "AS-IS" e il piede a "altra resistenza"; quel
bottone riparte in locate SENZA uscire da TONE (stesso item svuotato, stessa select tornata a
0); CANCEL esce del tutto e riporta l'arco a ClearDial coi quattro bottoni. Verificato anche in
tema scuro. EQUILIBRIUM 2.0.163, SERENITY 3.0.26.

⚠️ **Non ripreso in questo giro, dichiarato non taciuto**: `ToneColumn` — la scala verticale
coi nomi dei livelli accanto all'ago (« due mestieri: l'arco è la reazione, la colonna è la
posizione »). Il menù a tendina della fase 'locate' copre la stessa lista di nomi quando non
c'è meter; la lettura verticale continua durante 'raise' resta assente.

---

## Il principio dimensionale — regola per le fasi 6, 7, 8

Dettato il 16/08/2026, dopo che il quadrante era stato rifatto due volte — prima con i
colori sbagliati (chiaro invece di scuro), poi con la taglia sbagliata (un cerchio da
380 px invece di riempire lo schermo). La regola che le corregge entrambe:

> **EQUILIBRIUM = struttura, dimensioni, funzione. SERENITY = grafica, stile, identità
> visiva. Non si comprime EQUILIBRIUM per farlo entrare in SERENITY — si fa entrare
> SERENITY dentro la struttura dimensionale di EQUILIBRIUM.**

In pratica, per ogni zona che le fasi 6–8 porteranno da EQUILIBRIUM a SERENITY — arco e
scala del Meter, ago, numeri e valori, scritte ed etichette, indicatori, controlli,
pulsanti, aree di lettura, zone di input/output, pannelli funzionali —:

1. **Le dimensioni funzionali di EQUILIBRIUM sono il riferimento**, non un punto di
   partenza da negoziare. Se nel disegno SERENITY qualcosa sembra più piccolo, si
   ALLARGA il contenitore SERENITY — non si comprime la zona di EQUILIBRIUM.
2. **Le proporzioni originali si conservano.** Un arco che in EQUILIBRIUM è largo quanto
   lo schermo non diventa un cerchio decorativo in SERENITY.
3. **La leggibilità di ago, arco, numeri e testi viene prima dell'estetica del layout.**
   Se una griglia SERENITY (i cerchi, gli spazi bianchi) non lascia posto a sufficienza,
   è la griglia a cedere, non lo strumento.
4. **Il responsive scala, non comprime.** `aspect-ratio` con un `max-width` generoso e
   nessun limite artificiale in basso — l'elemento occupa lo spazio che il momento
   concede, come `w-full h-full` fa in EQUILIBRIUM, non una taglia fissa inventata.

Quel che RESTA libero, e va rifatto nel linguaggio di SERENITY: colori, sfondi, bordi,
luminosità, effetti, tipografia, stile dei pannelli e dei pulsanti, ombre, materiali
visivi, gerarchia grafica, animazioni puramente estetiche. La logica applicativa — stati,
transizioni, soglie, calcoli, gestione dell'input dell'auditor — non si tocca MAI per
farla stare nel disegno: se una funzione esiste già e funziona, si integra visivamente,
non si riscrive.

**Precedente di riferimento — il Meter (fase 5).** `Serenity.tsx` monta
`components/QuantumSphere` — lo STESSO componente di EQUILIBRIUM, non un secondo disegno:

```tsx
const isLightTheme = useUiStore(s => s.isLightTheme);   // la STESSA preferenza di EQUILIBRIUM
// …
<div style={{
  width: 'min(100%, 1400px)', aspectRatio: '1600 / 850', maxHeight: 'calc(100% - 44px)',
  borderRadius: 18, overflow: 'hidden',
  background: isLightTheme
    ? 'var(--s-ground)'   // bianco perla — la superficie STESSA di SERENITY
    : 'radial-gradient(130% 120% at 50% 22%, #2e2e33 0%, #2a2a2f 55%, #262629 100%)',
  boxShadow: isLightTheme ? 'var(--s-shadow)' : 'var(--s-shadow-lift)',
}}>
  <QuantumSphere /* …stesse props di EQUILIBRIUM, nessun forceTheme… */ />
</div>
```

- **`aspect-ratio: 1600 / 850`** — la proporzione VERA del quadrante, la stessa con cui
  `App.tsx` lo monta (`viewBox="0 0 1600 850"`). Non una taglia scelta a occhio.
- **`width: min(100%, 1400px)`, nessun'altezza fissa** — riempie lo spazio disponibile
  come farebbe `w-full h-full`, con un tetto solo per non diventare assurdo su schermi
  enormi. Su una finestra piccola si restringe SENZA smettere di leggersi (verificato:
  a 900×700 le scritte SF/FALL/LONG FALL restano nitide).
- **Il tema NON è più fissato.** Prima versione: `forceTheme="dark"`, fisso — ma
  segnalato: « aiguilles avec light… le fond de l'arc doit pouvoir être blanc perle
  aussi ». `QuantumSphere` è tornato a leggere `isLightTheme` da solo (il suo
  comportamento di sempre, nessuna prop in più); `Serenity.tsx` legge la STESSA chiave
  per colorare il pannello che lo contiene, e un `SelettoreTema` (in `Impostazioni.tsx`,
  visibile in `Avvio.tsx` E durante la seduta) la cambia in entrambe le direzioni.
- **È la preferenza di EQUILIBRIUM, non una copia.** Stesso `localStorage`
  (`nest_ui_preferences`), stessa chiave di `GlassThemeToggle`: cambiare tema in
  SERENITY lo cambia anche per la prossima apertura di EQUILIBRIUM, e viceversa —
  coerente con l'archivio unico, i profili unici, la lingua per-profilo. « Toutes les
  fonctionnalités de EQUILIBRIUM » vale anche per questa preferenza.
- **In tema chiaro il pannello sparisce**, letteralmente: `var(--s-ground)`, lo stesso
  bianco perla della pagina. I colori di `QuantumSphere` in tema chiaro sono già
  inchiostro scuro leggibile su bianco — un bezel a parte sarebbe stato un pannello
  chiaro dentro una pagina chiara, cioè un bordo che non serve a niente.

Questo è il modello da ripetere per R-Factor, i pannelli dei quattro cicli,
l'assessment e tutto il resto delle fasi 6–8: **stesso componente o stessa logica dove
possibile, stessa taglia sempre, pelle nuova.**

---

## La seduta a distanza (fase 7)

Diverso dalle fasi precedenti: qui non si riusa un componente EQUILIBRIUM travestito, si
scrive un collante NUOVO (`hooks/useRemoteSession.ts`) — perché è legittimamente nuovo, non
motore duplicato. La differenza:

- **Il motore è `lib/networkManager`**, un'istanza SINGOLA (non una per applicazione):
  WebRTC, tunnel Cloudflare, riconnessione del preclear, protocollo via dati. Quello non si
  tocca, ed è lo stesso per le due applicazioni — non girano mai insieme (un solo
  `userData`), quindi assegnargli i callback da SERENITY non confligge con App.tsx.
- **L'orchestrazione (quando chiamare cosa) è per forza diversa**, perché guida un flusso
  diverso: EQUILIBRIUM apre un `ConnectionModal` sopra la seduta già in corso; SERENITY apre
  `serenity/Connessione.tsx` come schermata piena, fra le quattro domande dell'avvio e il
  quadrante — non c'è ancora una seduta da coprire quando ci si sta ancora connettendo.
  `useRemoteSession` è quella nuova orchestrazione, scritta seguendo lo STESSO protocollo via
  dati di `App.tsx` (`BATTERY`, `MUSE_STATUS`, `SIGNAL_QUALITY`, `LANG`, `SESSION_STATE`,
  `TRANSCRIPT`) così che un auditor su SERENITY e un preclear su EQUILIBRIUM (l'unico che il
  link possa aprire — vedi sotto) si capiscano.

**Il preclear non apre mai SERENITY.** `server-core.cjs` serve `index.html` per qualunque
richiesta arrivi dal tunnel, indipendentemente da quale applicazione desktop l'auditor ha
aperto — il link generato porta sempre al `ParticipantView` di EQUILIBRIUM, già collaudato su
telefono. Questa fase costruisce SOLO il lato dell'auditor: è per questo che non esiste (e non
deve esistere) un secondo `ParticipantView` dentro `src/serenity/`.

**Quel che resta fuori, di proposito.** `RAW_EEG`/`RAW_PPG`/`RAW_GYRO` non sono cablati: il
quadrante di SERENITY (fase 5) legge solo il Theta-Meter USB fisico, non ancora un ago EEG —
quella pipeline (worker, buffer, badge di qualità del segnale) è materia della fase 6.
Instradare qui l'EEG remoto senza un ago locale che lo mostri sarebbe un tubo che non arriva
in nessun posto — il preclear continua comunque a inviarlo, resta solo da agganciarlo.
