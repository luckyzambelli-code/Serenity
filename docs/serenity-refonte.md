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

⚠️ **Segnalato di nuovo (18/08/2026, stessa giornata)**: « la possibilité de sortir du test des
boîtes / les inscriptions sont incompréhensibles... sur quel instrument / on n'a toujours pas
sans instrument / le point de sauvegarde de la configuration... n'est toujours pas implémenté /
les deux aiguilles ? pas vue ». Cinque punti — due erano REALI, tre erano già risolti da
`e623018` (commesso PRIMA di questo giro di segnalazioni, nella stessa giornata: probabile DMG
non ancora aggiornato sulla macchina di prova).

**Verificato di nuovo a schermo (tab pulita, senza saved-config) che SONO già presenti e
funzionanti**:
- « Seduta senza strumenti » — terza voce del pannello di scelta strumenti, apre la seduta
  senza bloccare su nessun collegamento.
- Il salvataggio della configurazione — lo stesso pannello, spuntata una scelta, offre "nome di
  questa configurazione…"/"salva"; richiamata dalla striscia in alto salta DRITTO alla seduta,
  domande d'avvio E scelta strumenti comprese.
- I bottoni dei quattro cicli, ben visibili come pillole bordate una accanto all'altra
  (CONTACT/NULL/MIRROR/TONE), non più testo fantasma.

**Corretti per davvero, perché mancavano davvero**:
- **`theta.cancelTest()`** — aggiunto al motore condiviso `useThetaMeter` (mai toccato prima da
  SERENITY): la prova della stretta/del respiro chiudeva SOLO da sé al proprio timer (4 s · 9 s),
  senza modo di uscirne prima. Bottone "annulla" in `PannelloMeter`, visibile solo a prova in
  corso — annullare non scrive né un esito positivo né uno negativo.
- **Le etichette del pannello Meter erano tecniche senza contesto** — un titolo in cima
  («IL THETA-METER — LE LATTINE») nomina lo strumento due volte (nel titolo E nel testo), e ogni
  sezione (config due/una lattina, le due prove, la taratura TA) ha ora una riga di spiegazione
  SEMPRE visibile, non solo un `title` al passaggio del mouse. Anche la freccia d'apertura in
  intestazione: "▾ Assetto" → "▾ configura il meter".
- **Un solo ago alla volta, ma la scelta non esisteva** — App.tsx stesso disegna un ago SOLO con
  entrambi gli strumenti collegati (commento esplicito: mostrarli insieme fu un difetto corretto
  apposta), lasciando all'auditor la scelta (`agoPrincipale`). SERENITY aveva la regola fissa
  «il Meter vince sempre», muta. Ora una coppia di pillole MUSE/METER — SOLO quando entrambi
  sono connessi — sceglie quale ago guardare, con la STESSA preferenza persistita di App.tsx
  (stessa chiave `localStorage`).

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639, a schermo (tab
pulita, FR) il flusso "Séance sans instruments" completo — dalla scelta all'apertura della
seduta, cicli visibili, nessun errore in console oltre a quelli pre-esistenti e noti (P2P/
Whisper, non legati a questa modifica). EQUILIBRIUM 2.0.168, SERENITY 3.0.31.

⚠️ **Segnalato di nuovo (18/08/2026, terzo giro della stessa giornata)**: sei punti.

1. **« quand on cache la cam il faut que apparaisse un cercle vide »** — `collassata` mostrava
   lo STESSO video rimpicciolito e attenuato: a quella taglia un volto ancora in movimento si
   legge come un difetto, non come un gesto voluto. Ora il video resta montato (lo stream non
   si stacca) ma invisibile, e sopra compare un disco VUOTO e affondato — `Cerchio`'s `spenta`,
   lo stesso linguaggio già usato altrove per "previsto ma spento".
2. **« la cam du PC doit être bien plus grande »** — 190 px restavano piccoli. Portata a 260
   (CAM 1 a 130, stessa proporzione).
3. **« séparer et rendre explicites les questions des cicles »** — verificato di nuovo a
   schermo: i quattro cicli sono già pillole nominate (CONTACT/NULL/MIRROR/TONE) e, armato un
   ciclo, un badge pieno dello stesso colore dice quale — presente da `e623018`. Nessun nuovo
   difetto trovato in questa zona (probabile DMG non aggiornato).
4. **« l'assessement ne marche pas et n'apparaît pas »** — vero, mancava per davvero: i tre
   motori dei cicli chiamavano già `ensureAssessmentOn()` ma qui era un no-op. Aggiunta una
   versione MINIMA e onesta (non la sofisticazione intera di `AssessmentPanel.tsx`/App.tsx, che
   calcola una lettura istantanea per item — ~300 righe accoppiate a refs locali, non un modulo
   portabile in un passo solo): un bottone "ASSESSMENT" in piè di pagina, e gli item dati a
   voce (stesso filtro `isAssessableItem`, stesso principio cursore-su-log dei tre effetti
   "item dettato") compaiono in un cassetto ancorato lì, con l'ora — senza una lettura calcolata
   accanto a ciascuno, dichiarato non taciuto.
5. **« le point de sauvegarde de la configuration... il est où ? »** — il campo esisteva già,
   ma SOLO dentro il pannello "con che cosa si audita?", che si apre SOLO se nessuno strumento è
   ancora connesso. Chi connette MUSE/METER dall'indicatore d'intestazione PRIMA di aprire la
   seduta — il gesto più naturale, quello che l'intestazione stessa invita a fare — quel
   pannello non lo vede mai. Aggiunto un bottone "salva questa configurazione" SEMPRE
   raggiungibile accanto al nome dell'auditor, che legge la combinazione COM'È ORA (strumenti
   già connessi compresi).
6. **« en haut... il faut expliciter, pas seulement séparer »** — l'intestazione aveva tema/
   lingua, chi audita, gli strumenti, la rete a distanza e CONFIG tutti sulla stessa riga, nello
   stesso grigio. Un separatore verticale sottile fra ogni zona, e le due sole zone davvero
   ambigue (STRUMENTI, A DISTANZA) hanno anche il nome — mai un'etichetta su OGNI zona, quello
   tornerebbe a gridare. Corretta anche un'ambiguità vera trovata cercando: l'indicatore MUSE
   del preclear a distanza si chiamava "MUSE", la stessa parola dell'indicatore MUSE
   dell'auditor poco prima — ora "MUSE (preclear)".

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320, nessuno nuovo), `vitest run`
639/639. A schermo (tab pulita): CAM 2 visibilmente più grande, CAM 1 collassata → disco vuoto
scuro, il pannello ASSESSMENT si apre e ascolta, il popover "salva questa configurazione" in
intestazione funziona senza aprire prima il pannello strumenti, l'intestazione mostra
"STRUMENTI" e "A DISTANZA" come zone separate. Nessun errore in console oltre a quelli
pre-esistenti (P2P/Whisper). EQUILIBRIUM 2.0.169, SERENITY 3.0.32.

⚠️ **Segnalato di nuovo (18/08/2026, quarto giro)**: « "Alone" tradotto in SOLO in tutte le
lingue » + « metti un'icona per chiaro/scuro, per l'auditor (SOLO/Expert/ecc.), e per i
connettori MUSE e Meter ».

**Sulla traduzione**: cercato a fondo (`ser_alone_tag`, `ser_solo`, la striscia configurazioni
salvate, la domanda "da solo o con un preclear?", l'etichetta in seduta) — tutti e quattro i
punti sono CORRETTAMENTE tradotti nelle cinque lingue, verificato di nuovo a schermo in
francese ("Seul" ovunque, mai "SOLO"). Esiste un'ALTRA chiave, `solo` (minuscolo, di App.tsx),
che vale letteralmente `"SOLO"` in tutte le lingue — ma non è usata da nessuna parte in
`src/serenity/`. Nessun difetto trovato: probabile, ancora, DMG non aggiornato.

**Sulle icone — fatto**, tre punti:
- `SelettoreTema` (chiaro/scuro): sole/luna (`lucide-react`, `Sun`/`Moon`) accanto alla parola —
  la parola resta la fonte vera, l'icona la anticipa (una precedente nota di design diceva
  esplicitamente "due parole, non sole/luna": la richiesta esplicita di oggi la sostituisce).
- La riga "chi audita" in intestazione: le STESSE icone di `Avvio.tsx` per le stesse scelte —
  `User`/`Users` per solo/con preclear, `Wrench` per esperto, `Wifi` per a distanza — non un
  secondo set da imparare.
- `IndicatoreConnessione` — nuovo prop opzionale `icona`: `Headphones` per ogni indicatore MUSE
  (locale E del preclear a distanza), `Gauge` per il METER, `Wifi` per la connessione PC —
  ancora le stesse icone che App.tsx usa nel suo pannello di scelta strumenti.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639, a schermo (tab
pulita, EN) tutte le icone rendono correttamente accanto alle rispettive parole.
EQUILIBRIUM 2.0.170, SERENITY 3.0.33.

⚠️ **Segnalato di nuovo (18/08/2026, quinto giro)**: « le scritte più in grande e più scure,
per più visibilità ». Due interventi, entrambi GLOBALI invece che pannello per pannello:

- **Le taglie**: ogni `fontSize` funzionale in `src/serenity/*.tsx` da 9 a 13 px alzata di un
  passo (9→10, 9.5→10.5, … 12.5→13.5, 13→14) — una sostituzione script su tutti gli undici file,
  non a mano pannello per pannello (125 punti). I titoli grandi (14 px in su, il testo
  dell'item, "SERENITY", le domande dell'avvio) restano com'erano: la gerarchia fra "titolo" e
  "testo funzionale" si conserva, si sposta insieme.
- **Il colore**: `--s-ink-soft`/`--s-ink-faint` in `tokens.css`, scuriti di un passo in tema
  chiaro e SCHIARITI di un passo in tema scuro (la stessa richiesta, applicata nel verso giusto
  per ciascun fondo — scurire il testo chiaro su fondo scuro lo renderebbe MENO leggibile, non
  di più). `--s-ink-ghost` (il punto "nessun segnale" degli indicatori) resta invariato: non è
  testo da leggere.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639, a schermo (tab
pulita, tema scuro): testo visibilmente più grande e più contrastato ovunque, nessun
troncamento/sovrapposizione nei pannelli più stretti (piè di pagina, camere, meter).
EQUILIBRIUM 2.0.171, SERENITY 3.0.34.

---

## Il vetro (18/08/2026, sesto giro) — « les boutons de EQUILIBRIUM » + « liquid glass »

Chiesto in due tempi, lo stesso desiderio: prima « i bottoni di EQUILIBRIUM, molto più belli »,
poi — con tre riferimenti visivi (una barra di ricerca "liquid glass", un assistente con pillole
traslucide su fondo blu, una barra di navigazione con un riflesso curvo sul bordo) —
« ricostruisci l'interfaccia SERENITY in liquid glass ».

**Cosa NON si è toccato, e perché**: la palette resta quella di `tokens.css` — i tre segnali
tenui, niente accento saturo. La regola « i colori dicono, non gridano » non è un vezzo
estetico in questa app: è la ragione per cui uno schermo non deve distrarre l'auditor durante
una seduta. I riferimenti mostravano anche sfondi sfumati blu/viola molto vivaci — quella parte
NON è stata portata: il vetro è un fatto di FORMA (sfocatura, bordo, riflesso), non di colore, e
i due si possono separare.

**Cosa si è aggiunto — un materiale condiviso, non uno stile ripetuto in ogni file**:

- `tokens.css`: `--s-disc`/`--s-disc-sunk` diventano TRASLUCIDI (rgba, non più opachi) — perché
  `backdrop-filter` abbia qualcosa da sfocare. Due classi CSS, `.s-glass` (sfocatura + bordo
  chiarissimo che imita il riflesso del vetro vero + un lucido in alto via `::before`, come nei
  riferimenti) e i suoi modificatori combinabili `.s-glass-lift` (ombra di rilievo) e
  `.s-glass-btn` (transizione, `:hover`/`:active` che risponde). Chi ha già `background:
  var(--s-disc)` nel proprio `style` inline ottiene il vetro aggiungendo solo un `className` —
  niente conflitto di cascata, l'inline resta per le proprietà che già dichiara.
- `Cerchio.tsx` — il primitivo condiviso da OGNI cerchio di SERENITY (camere, avatar dei
  profili) — prende il vetro una volta sola, tranne `spenta` (un disco "previsto ma spento" non
  deve luccicare come se fosse acceso).
- Bottoni: la seduta APRI/CHIUDI, le quattro pillole dei cicli (CONTACT/NULL/MIRROR/TONE, bordo
  colorato conservato), tutti i pulsanti `pillola(...)` di `PannelloMeter.tsx`,
  `PannelloEp.tsx`, `PannelloProfilo.tsx`.
- Pannelli galleggianti: il cassetto del meter, il popover "salva questa configurazione", il
  cassetto ASSESSMENT, il modale "con che cosa si audita?", il pannello MNA.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639. A schermo (tab
pulita, tema chiaro E scuro): il riflesso si vede su cerchi e pulsanti, i pannelli galleggianti
sfocano il quadrante dietro di loro, nessun bottone ha perso la sua funzione o il suo colore di
stato. EQUILIBRIUM 2.0.172, SERENITY 3.0.35.

⚠️ **Segnalato subito dopo, con un nuovo riferimento visivo**: « je ne vois pas de GLASS FORM » +
« le bouton FERMER — on ne sait pas s'il correspond à la séance ou au cycle » + « le même style
[dei cicli] doit être utilisé pour les inscriptions en haut ».

**La causa vera del "non vedo il vetro"**: un bug, non un'impressione. `pillola()` in
`PannelloMeter.tsx`/`PannelloEp.tsx`/`PannelloProfilo.tsx`, e lo stile inline del bottone
APRI/CHIUDI seduta, dichiaravano ANCORA `border: 'none'` e un `boxShadow` proprio — e uno stile
inline VINCE SEMPRE su una classe CSS per la stessa proprietà. Il bordo e il riflesso di
`.s-glass`/`.s-glass-btn` (aggiunti via `className` nel giro precedente) non arrivavano mai a
schermo: cancellati in silenzio dalle due righe rimaste indietro in ognuno di questi file. Tolte
ovunque — il vetro ora si vede davvero (verificato a schermo, chiaro e scuro).

**Il bottone FERMER, disambiguato**: diceva solo "chiudi"/"fermer" — la stessa parola che,
armato un ciclo, un ANNULLA vicino avrebbe potuto sembrare dire. Ora dice per esteso "chiudi LA
SEDUTA"/"fermer LA SÉANCE" — l'unico bottone che la governa, mai confondibile con un gesto di
ciclo.

**Le "inscriptions" in alto, ora pillole di vetro**: `IndicatoreConnessione` (MUSE, METER, PC,
MUSE del preclear) e la riga "chi audita" prendono la STESSA `.s-glass`/`.s-glass-btn` dei
bottoni di ciclo — non un secondo linguaggio per dire cose simili. Insieme: "salva questa
configurazione", la freccia "configura il meter", l'ingranaggio CONFIG, ASSESSMENT, MNA, EP —
ogni controllo reale dell'intestazione e del piè di pagina.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639, a schermo
(tema chiaro E scuro) il bordo/riflesso si vede chiaramente su ogni pillola, "chiudi la seduta"
si legge per esteso. EQUILIBRIUM 2.0.173, SERENITY 3.0.36.

---

## Il cursore che scivola (19/08/2026) — « un bouton qui SLIDE »

Chiesto con foto e .gif precisi: non due (o cinque) pillole indipendenti che si accendono a
turno, ma UN cursore di vetro che SCIVOLA da una tappa all'altra della stessa pista — l'esempio
dato è CLAIR/DARK, con « la logique » dichiarata generalizzabile.

**`SegmentoVetro.tsx`, nuovo** — un cursore `.s-glass` vero (stessa sfocatura/bordo/lucido dei
bottoni) che scivola in `transform: translateX(...)` (mai `left`, che ricalcolerebbe il layout
a ogni fotogramma) con una curva che RIMBALZA leggermente (`cubic-bezier(0.34, 1.56, 0.64, 1)`)
— lo stesso effetto "vetro vero" del .gif, non una traslazione meccanica. Applicato a:

- **`SelettoreTema`** (chiaro/scuro) — l'esempio letterale del segnalato.
- **`SelettoreLingua`** (EN/FR/IT/ES/SV) — stessa famiglia di scelta (una sola vera alla volta).
- **`agoScelto`** (MUSE/METER, quando entrambi connessi) — già due pillole separate dal giro
  precedente, la stessa identica forma di scelta.

**Cosa NON è diventato uno scivolo, e perché**: le quattro pillole dei cicli (CONTACT/NULL/
MIRROR/TONE) restano bottoni veri — ogni click lì ARMA SUBITO un ciclo, un'azione e non una
preferenza; uno scivolo implicherebbe "scegli, poi conferma", cambiando il gesto stesso.

**« Manque SANS INSTRUMENTS à côté de MUSE et METER »** — vero: quella terza via esisteva solo
dentro il modale "con che cosa si audita?", raggiungibile SOLO se nessuno strumento era ancora
connesso. Aggiunto un terzo `IndicatoreConnessione` in intestazione, stessa famiglia di MUSE/
METER: attivarlo disconnette entrambi gli strumenti (esclusività identica al modale).

**Effetto collaterale corretto**: le pillole di vetro e i cursori scorrevoli sono più larghi
delle parole nude di prima — l'intestazione, senza `flexWrap`, perdeva gli ultimi indicatori
fuori dal bordo su una finestra non larghissima. Aggiunto `flexWrap: 'wrap'` — va a capo,
niente più sparisce.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori, `vitest run` 639/639. A schermo (tab
pulita, chiaro): il cursore tema scivola cliccando "light"/"dark", il cursore lingua scivola fra
i cinque codici, "Session without instruments" apre la seduta SENZA il modale di scelta
(verificato via click programmato + lettura dei bottoni a schermo), l'intestazione va a capo
senza perdere alcun indicatore. EQUILIBRIUM 2.0.174, SERENITY 3.0.37.

---

## Sesto giro (19/08/2026) — vetro più liquido, passi dei cicli, assessment reale, ago corretto

Sei punti in un solo messaggio, con un promemoria in cima e uno in fondo: « devi solo cambiare
l'interfaccia, in nessun modo le logiche... NON CAMBIARE PROPRIO NULLA AL MOTORE ». Verificato
con `git status` dopo ogni modifica: **solo file di `src/serenity/` toccati**, mai `App.tsx` né
un modulo di `engine/`/`hooks/`/`session/` condiviso.

1. **« Più trasparenze liquide, i bottoni fossero VERAMENTE glass form »** — `--s-disc`/
   `--s-disc-sunk` più traslucidi (0,62→0,42 chiaro, 0,55→0,36 scuro), sfocatura più forte
   (20px→30px, saturazione 160%→200%), lucido (`::before`) più ampio e più intenso.
2. **« Il cerchio delle camm è troppo piccolo »** (terza volta) — 260/130 px → 340/160 px.
3. **« Le scritte dei cicli sono confuse... evidenziate le steps, a prova di stupido »** —
   `PassiCiclo.tsx`, nuovo: uno stepper vero (passo fatto ✓, passo in corso acceso, passi futuri
   spenti), per tutti e quattro i metodi. ZERO logica propria — legge `faseCiclo`
   (`engine/sessionPhase.ts`, già condiviso) e mostra solo dove si è.
4. **« L'assessment non funziona ancora... è solo un cambio grafico, non devi riscrivere le
   funzioni »** — aveva ragione più di quanto pensassi io stesso: `computeInstantRead`/
   `readWindow`/`readWaitSeconds` (`engine/instantRead.ts`) e `chiaveItem` (`engine/corpus.ts`)
   erano GIÀ funzioni pure condivise — la versione precedente le aveva scartate per prudenza,
   credendole accoppiate a refs locali di App.tsx che in realtà non lo sono. L'UNICA cosa
   mancante per davvero: `shownReadsRef` (la fonte di `computeInstantRead`) riceveva SOLO le
   reazioni EEG — mai quelle del Meter, wiring mai fatto qui. Aggiunta la STESSA logica di
   App.tsx (episodio aggiornato per id, `REACTION_LABELS`) nel callback `onReaction` di
   `useThetaMeter`, già mount. Ora ogni item dato a voce durante l'ASSESSMENT riceve, dopo
   `readWaitSeconds`, una lettura vera: la reazione, lo scarto in ms, l'ago che l'ha letta,
   NON MISURATO se nessuno strumento guardava, il gruppo di ripetizione se l'item è già stato
   detto. Un calcolo solo per item (non la ripetizione progressiva a 200ms di App.tsx) — stessa
   funzione pura, un giro invece di N.
5. **« Per la logica ago METER/MUSE, non funziona allo stesso modo che su Equilibrium »** —
   vero, mancavano due livelli di `agoPrincipale` (App.tsx): TONE impone SEMPRE il Meter (mai la
   preferenza generale — prima l'ago EEG restava a schermo anche in TONE se la preferenza era
   MUSE), e un ciclo CONTACT/NULL/MIRROR in corso impone SEMPRE l'EEG (quei tre vivono solo di
   carica EEG, il Meter non vi partecipa — prima la preferenza generale poteva mostrare il Meter
   a un ciclo già armato che stava producendo dati sul MUSE). Aggiunti entrambi.
6. **« Mancano ancora dei moduli »** — confermato, restano aperti (non toccati in questo giro,
   ciascuno una sessione a parte): crash recovery/bozza automatica, rapporto di fine seduta,
   cronologia del profilo, R&I via CORPUS `itemRecord`, archivio CORPUS consultabile,
   ready-check del Theta-Meter. Vedi l'audit comparativo più sopra nel documento.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320, nessuno nuovo), `vitest run`
639/639, a schermo (chiaro): il vetro visibilmente più trasparente, le camere molto più grandi,
lo stepper del ciclo CONTACT segna "✓ item — ● dissoluzione — 3 AS-IS" armando e validando,
l'ASSESSMENT si apre senza errori, nessun file fuori da `src/serenity/` toccato.
EQUILIBRIUM 2.0.175, SERENITY 3.0.38.

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

## Settimo giro (19/08/2026) — un bottone solo, il campo item ritrovato, e un falso allarme

Sei punti in un solo messaggio. Verificato con `git status` dopo ogni modifica: solo
`src/serenity/` e `src/hooks/useVoiceItem.ts` (SERENITY-esclusivo) toccati.

1. **« I bottoni DARK/LIGHT devono essere solo UNO, che si trasforma » + « i bottoni delle
   lingue UGUALE »** — `BottoneCiclico.tsx`, nuovo: un bottone solo che mostra SEMPRE e SOLO
   lo stato attuale e si trasforma nel prossimo al click (remount con animazione
   `sBottoneMorph`, 260ms). Sostituisce lo scivolo a due tappe (`SegmentoVetro`) per
   `SelettoreTema`/`SelettoreLingua` in `Impostazioni.tsx` — `SegmentoVetro` resta per il
   selettore MUSE/METER (non segnalato, e vedere entrambe le opzioni lì conta di più).
2. **« La gestione di configurare il METER è troppo complicata »** — `PannelloMeter.tsx`
   riscritto come percorso a 4 passi (config → stretta → respiro → taratura), puntini di
   avanzamento cliccabili, avanti/indietro — stesso schema a una domanda per volta di
   `Avvio.tsx`. ZERO logica nuova: stesse chiamate a `useThetaMeter`, solo riordinate in passi.
3. **« Il cerchio della camm è troppo piccolo, deve essere almeno il doppio »** (quarta volta)
   — 340/160 px → 680/320 px, la stessa proporzione.
4. **« I cicli non posso dare l'item verbalmente e non posso scriverlo, non sò dove »** +
   **« l'assessment non funziona »** — la STESSA causa per entrambi, trovata dopo aver
   raddoppiato le camme al punto 3: il riquadro che le contiene (`position:absolute`,
   `zIndex:5`) è rettangolare anche se i cerchi dentro sono rotondi — a 680 px il suo angolo
   invisibile arriva a coprire tutta la riga del campo item e del bottone ASSESSMENT
   sottostanti, rubando il click prima che li raggiunga. Non era la logica (il campo, il
   bottone, `useVoiceItem`, il calcolo della lettura erano già a posto dal giro precedente) —
   era geometria. `pointer-events:none` sul riquadro contenitore, riacceso solo dentro ogni
   `CameraCerchio` (il cerchio vero) — il resto torna trasparente anche ai click, non solo
   alla vista. Aggiunte anche due etichette sempre visibili (« SCRIVI O DÌ L'ITEM » / « POI
   SCEGLI IL METODO ») e lo stato della voce accanto al campo (« in ascolto » / « voce non
   disponibile — scrivi l'item »), perché il campo restava comunque poco leggibile come un
   input anonimo senza etichetta.
5. **Un falso allarme, non un bug**: durante la verifica è comparso un errore React
   « change in the order of Hooks » al primo montaggio di `Serenity`, ripetibile ad ogni
   ricarica. Isolato per bisezione fino al commit già spedito (`26ad5c3`, invariato) — quindi
   non causato da nessuna modifica di questo giro — e assente in EQUILIBRIUM in una tab
   pulita. Riavviato il server di sviluppo da zero (`staticmeter-dev`, in piedi da ore, dopo
   moltissime modifiche a caldo in questa sessione): l'errore non si è più ripresentato, in
   nessuna combinazione di file testata, su più ricariche consecutive. Diagnosi: corruzione
   dello stato di Hot-Module-Replacement di Vite accumulata durante la sessione, non un difetto
   del codice — e non poteva mai esistere nel DMG spedito, che è una build statica e non passa
   mai da Vite/HMR. Nessuna modifica applicata per questo punto: non c'era niente da correggere.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320 warning, tutte preesistenti —
confrontate una per una con lo stesso file a HEAD), `vitest run` 639/639, a schermo (tab
pulita, server riavviato): i bottoni tema/lingua sono un pezzo solo che si trasforma, il campo
item si clicca e si scrive direttamente, il bottone ASSESSMENT apre il cassetto (« ITEMS GIVEN
ALOUD » / « listening… »), le camme occupano davvero il doppio dello spazio. Il percorso a
passi del METER non è verificabile in questo ambiente (serve un Theta-Meter USB vero via
WebHID, assente nel browser sandbox) — verificato per lettura del codice e per compilazione/
lint/test, da confermare nell'app reale.

---

## Ottavo giro (19/08/2026) — i comandi in alto, le camm senza coprire l'arco, il vetro ovunque

Otto punti in un solo messaggio.

1. **« La video camm occupa troppo spazio, riduci di un terzo. Però copre l'arco dell'ago,
   correggi »** — due segnalazioni insieme, stessa causa. 680/320 px → 453/213 (i due terzi di
   prima, stessa proporzione), e non più una FILA orizzontale larga quanto l'arco: una COLONNA
   verticale, PC sopra e AUDITOR sotto (lo stesso ordine di App.tsx, « PC cam top, Auditor cam
   bottom »), ridossata tutta all'angolo — l'ingombro resta nella striscia più a destra, fuori
   dal semicerchio centrato sul quadrante.
2. **« Aumenta i caratteri, che siano più grandi »** — spazzata sistematica di ogni `fontSize`
   fisso in `src/serenity/*.tsx` (10→11,5 px fino a 14→15,5 px, +1,5 px su tutta la fascia
   piccola) più la base di `body` (15→16px in `tokens.css`).
3. **« L'assessment deve avere una sua zona, come in equilibrium »** — `ZonaAssessment.tsx`,
   nuovo: non più un cassetto appeso al bottone (`position:absolute, bottom:'100%'`, spariva
   con la cattura spenta), una colonna ancorata all'angolo opposto delle camere, sempre
   presente a seduta aperta, titolo sempre leggibile anche chiusa. Zero stato nuovo —
   `assessAttivo`/`assessItems` sono gli stessi di sempre, solo un contenitore vero.
4. **« Quando si schiaccia sulla lingua fai apparire sotto tutte le lingue »** — `BottoneCiclico`
   riceve `elencoCompleto`: con due sole tappe (tema) ciclare resta la scelta giusta (la
   prossima è sempre l'unica altra); con cinque (lingua) il click apre un cassetto con TUTTE le
   tappe sotto il bottone. Il bottone in sé resta identico — mostra solo lo stato attuale.
5. **« Nella cam PC devi mettere le indicazioni che hai già in equilibrium »** — `CameraCerchio`
   riceve `statoTesto`/`inDiretta`: lo stesso badge LIVE e lo stesso testo di stato
   (`massStatus`) di `CameraFeed.tsx`, sullo stesso cerchio invece che su un riquadro. Stessa
   fonte di App.tsx — le tre parole già condivise (`status_waiting`/`status_searching_mass`/
   `status_asisness_reached`) più lo stato del MUSE del preclear a distanza — un gradino più
   semplice (manca l'intermedio `isFnActive`, mai portato qui: tre stati onesti battono un
   quarto inventato).
6. **« VOGLIO ASSOLUTAMENTE CHE TU CREI i bottoni liquid glass »** — un giro di bonifica: 16
   bottoni-link nudi (`border:'none', background:'none'`) nel blocco dei cicli di
   `Serenity.tsx`, più altri in `PannelloMna.tsx`, `PannelloMeter.tsx` (i due ANNULLA delle
   prove, « usa questa differenza », « azzera taratura », INDIETRO) e `Avvio.tsx` (l'ingranaggio
   CONFIG, il richiamo di una configurazione salvata, la sua ×, INDIETRO) sono diventati pillole
   di vetro vere (`s-glass s-glass-btn`, sfondo `--s-disc`, bordo arrotondato). Non esaustivo:
   `Connessione.tsx`/`PannelloConfig.tsx`/`PannelloEp.tsx`/`PannelloProfilo.tsx` restano con
   bottoni non ancora vetrati — dichiarato, non taciuto, prossimo giro.
7. **« Le camm se nascoste devono apparire come un bottone liquid glass anche lui »** —
   `Cerchio.tsx`'s `spenta` di proposito non prende il vetro (giusto per un modulo non ancora
   montato): aggiunto `vetroDaSpenta`, l'eccezione esplicita che `CameraCerchio` chiede per sé.
   L'albero resta UNO SOLO (il `<video>` non si smonta mai, altrimenti lo stream si
   scollegherebbe a ogni collasso/riespansione — lo stesso bug già risolto in un giro
   precedente): cambia solo la classe, non la struttura.
8. **« I cicli non sono chiari messi sotto. Mettili in alto come in equilibrium »** — il blocco
   comandi (era `<footer>`, l'ultimo figlio della pagina: sessione, item, i quattro metodi, i
   loro passi ed esiti, giornale, MNA, EP) si è spostato SOPRA il quadrante, appena sotto
   l'intestazione — in App.tsx questi stessi controlli stanno dentro il pannello dello
   strumento, non in fondo pagina. Mossa meccanica (un blocco JSX spostato di peso, tag
   rinominato da `footer` a `div`): zero righe di logica toccate, solo l'ordine in cui
   compaiono.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320 warning, tutte preesistenti),
`vitest run` 639/639. A schermo (tab pulita, chiaro e scuro): i comandi del ciclo sono la prima
cosa sotto l'intestazione, l'arco resta libero con le camm ridotte e in colonna, l'assessment
si apre nella sua colonna a sinistra mostrando « in ascolto… », il bottone lingua apre il
cassetto con le cinque tappe, la camm collassata mostra il bordo di vetro, un ciclo CONTACT
armato mostra ANNULLA/« dichiara AS-IS »/l'item come pillole di vetro coerenti col resto.
`git status` conferma: solo `src/serenity/*` toccati. EQUILIBRIUM invariato, SERENITY 3.0.40.

---

## Nono giro (19/08/2026) — SOLO ovunque, le zone che non si sovrappongono più, l'arco del TONO ritrovato

Cinque segnalazioni, l'ultima delle quali era un bug vero trovato solo verificando dal vivo.

1. **« ALONE deve essere tradotto in SOLO, uguale in tutte le lingue. Ed anche sotto l'icona
   deve essere scritto SOLO »** — `ser_solo`/`ser_solo_sub` (`src/i18n.tsx`, l'unico posto dove
   sono lette: `Avvio.tsx`, mai da App.tsx) erano tradotte diversamente per lingua (« Alone » /
   « Seul » / « Da solo » / « Ensam »...) più un sottotitolo descrittivo (« auditing myself » /
   « je m'audite moi-même »...). Ora entrambe dicono, testuale e identico, « SOLO » nelle
   cinque lingue — deliberatamente NON tradotto.
2. **« La camm del PC falla più piccola e quando la chiudi deve essere della stessa dimensione
   di quella dell'auditor »** — CAM 2 453 → 260px. E: `CameraCerchio` riceve
   `dimensioneCollassata`, un numero ESPLICITO invece del 35% calcolato sulla taglia propria di
   ciascuna camera — prima due taglie diverse da chiuse (camere di taglia diversa), ora la
   STESSA (88px) per entrambe.
3. **« Il bottone assessment copre CLOSE THE SESSION » + « devi stare attento a non sovrapporre
   gli elementi »** — causa reale: il cassetto del meter, la colonna delle camere e
   `ZonaAssessment` galleggiavano ancorati a `top:76` relativo a TUTTA la pagina (`main`) — taglia
   giusta per QUANDO i comandi stavano in fondo (giro precedente), sbagliata da quando i
   comandi si sono spostati IN ALTO: quello stesso `top:76` cadeva esattamente sopra "CHIUDI LA
   SEDUTA". Spostati tutti e tre DENTRO `<section>` (che comincia sempre DOPO i comandi,
   qualunque sia la loro altezza — un ciclo armato ne occupa di più di uno spento):
   `top:16`, ora relativo alla sezione e non più all'intera pagina.
4. **« La scala del tono non appare, il TA neanche, la diagnostica e tutti gli altri elementi,
   METTILI »** — un bug vero, trovato ispezionando il DOM dopo che il testo dei numeri (« -40 »
   … « +40 ») risultava presente nella pagina ma INVISIBILE a schermo: `ToneDial`/`MirrorDial`
   disegnano un `<svg>` nudo, senza il contenitore `position:absolute,inset:0` che `ClearDial`
   invece si dà da sé (e che in App.tsx avvolge tutti e tre insieme). Senza, restavano nel
   FLUSSO normale della pagina — attaccati SOTTO l'ago invece che sovrapposti, letteralmente
   fuori dalla vista su uno schermo di taglia normale. Lo stesso contenitore aggiunto qui,
   attorno a tutti e tre insieme (nessuna riga toccata DENTRO i tre componenti). Probabilmente
   presente fin dal montaggio di MIRROR/TONE in un giro precedente — la verifica di allora
   aveva letto le etichette nel TESTO della pagina senza controllare la loro posizione VERA.
   Aggiunto anche il TA in cifre lato METER (`theta.ta`/`taNow`, già calcolati da
   `useThetaMeter`): il readout esisteva ma parlava SOLO all'ago EEG (`agoEeg`) — con
   METER/senza strumenti restava muto anche a numeri veri disponibili.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320 warning, tutte preesistenti),
`vitest run` 639/639. A schermo (tab pulita, scuro e francese): la domanda SOLO/con preclear
mostra « SOLO » due volte, identico; TONE armato senza strumenti mostra l'arco −40…+40
sovrapposto all'ago con la fascia rossa che segue la resistenza (confermato via ispezione del
DOM: gli elementi `<text>` del quadrante ora ricadono nel rettangolo visibile, non più 360px
sotto); « CHIUDI LA SEDUTA » resta leggibile con l'assessment aperto. `git status`: solo
`src/serenity/*` + le due chiavi `ser_solo*` in `src/i18n.tsx`. EQUILIBRIUM invariato,
SERENITY 3.0.41.

---

## Decimo giro (19/08/2026) — gli stessi componenti di EQUILIBRIUM, non le loro imitazioni

Tre segnalazioni, la prima delle quali cambia l'approccio dei giri precedenti.

1. **« Il faut que les CYCLES soient exactement disposés comme dans EQUILIBRIUM, même champs,
   même logique »** — fin qui, ogni pezzo del ciclo era stato RISCRITTO a mano nella grafica di
   SERENITY (`PassiCiclo.tsx`, `LetturaCiclo`): stessa INFORMAZIONE, componenti PROPRI. Preso
   alla lettera: dove EQUILIBRIUM usa un componente CONDIVISO (già in `src/components/`, mai
   importato qui prima), SERENITY ora monta QUELLO, non una sua imitazione.
   - **`CycleSteps`** (`components/CycleSteps.tsx`) sostituisce `PassiCiclo.tsx` (rimossa): la
     stessa pista che App.tsx monta tre volte (una per CONTACT/NULL, una per MIRROR, una per
     TONE) — legge `mode`/`faseCiclo` (già calcolati qui) e ricava da sé passi ed etichette
     (`engine/cycleSteps.ts`, provato da solo). Prima SERENITY ricalcolava a mano l'indice e le
     etichette in tre punti diversi — tre occasioni di disallinearsi da EQUILIBRIUM.
   - **`CycleStatusBar`** (`components/CycleStatusBar.tsx`) sostituisce `LetturaCiclo`: quella
     mostrava SOLO comm-lag e % dissoluzione, un sottoinsieme scritto a mano. Il componente
     vero aggiunge i due campi mancanti — il chip « nessuna lettura » (`noReadSignal`: il ciclo
     CONTACT non ha visto nulla nella finestra del comm-lag) e il chip del ciclo NULL
     (« recharging », lo scarto di TA dal suo inizio + i secondi) — NESSUNO dei due ricalcolato:
     `useContactNullCycle` (già montato) li espone già (`noReadSignal`, `nullSinceMock`,
     `taAtNullStart`), semplicemente non erano letti. `CycleStatusBar` legge tre variabili CSS
     proprie di EQUILIBRIUM (`--sm-chip-bg`/`--sm-chip-edge`/`--sm-accent-ink`, da
     `index.css`, mai importato da SERENITY) — definite ora anche in `tokens.css`, nella lingua
     di questa tavolozza (non i colori di EQUILIBRIUM: la stessa idea di fondo/bordo/inchiostro
     di un chip).
2. **« Tous les elements de EQUILIBRIUM doivent apparaitre dans SERENITY »** — il punto 1 è la
   risposta concreta di questo giro (due componenti condivisi in più, con tutti i loro campi).
   Restano dichiarati, non taciuti, i gap già scritti nei giri precedenti: `ToneColumn` (la
   scala verticale accanto all'ago), la vista INDICAZIONE dell'assessment (le due letture
   separate MUSE/METER), i bottoni non ancora vetrati di
   `Connessione`/`PannelloConfig`/`PannelloEp`/`PannelloProfilo`.
3. **« ATTENTION, les tests des boîtes est bien fait, mais il ne disparaît pas »** — in App.tsx
   questo stesso percorso (`ThetaReadyCheck`) è una SCHERMATA che sparisce da sé quando
   l'auditor preme « prosegui » (`onProceed`). Il percorso a passi di SERENITY
   (`PannelloMeter`) restava un cassetto aperto per sempre: fatte le due prove, l'ultimo passo
   diceva solo « ✓ fatto » — un testo, non un gesto. Aggiunto `onFatto`: sull'ultimo passo, un
   bottone vero (« ✓ fatto — chiudi ») che chiude il cassetto (`meterSetupAperto` in
   `Serenity.tsx`) — stesso gesto di App.tsx, non la stessa schermata bloccante (che avrebbe
   richiesto rifare l'intero flusso d'ingresso, fuori scopo di questo giro).

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320 warning, tutte preesistenti),
`vitest run` 639/639. A schermo (tab pulita, scuro e francese): armato CONTACT senza
strumenti, la pista mostra « ① ITEM — ② MOCK-UP — ③ AS-IS » (le etichette esatte di
`CycleSteps`, non una parafrasi). `git status`: solo `src/serenity/*`. EQUILIBRIUM invariato,
SERENITY 3.0.42.

---

## Undicesimo giro (19/08/2026) — l'audit funzionale completo

Mandato esplicito e dettagliato: « SERENITY ne contient pas encore toutes les fonctionnalités
d'EQUILIBRIUM... fais l'inventaire... identifie toi-même les fonctions manquantes ». Metodo
seguito alla lettera: confronto riga per riga degli import di `App.tsx` contro quelli di
`Serenity.tsx`, poi lettura di ogni sospetto per capire se è un vero VUOTO FUNZIONALE (il
motore c'è, l'interfaccia no) o una differenza di ORGANIZZAZIONE legittima (App.tsx e SERENITY
dispongono la STESSA funzione in due punti diversi — permesso esplicitamente dal mandato,
punto 4: « soit comme dans EQUILIBRIUM... soit dans une organisation SERENITY encore plus
claire »).

### Trovati e chiusi in questo giro

1. **La taratura dell'ago EEG (sensibilità + inerzia) — ASSENTE del tutto.** App.tsx la tiene
   nel cassetto TRIM di `SidebarDrawer` (`needleTrim`/`needleInertia`, scritte dritte sul
   motore condiviso `runtime/NeedleEngine` — `needleEngine.setTrim()`/`.k`/`.d`). SERENITY non
   aveva NESSUN controllo su questi due numeri: l'ago restava sempre alla taratura di fabbrica,
   senza modo di correggerla. Aggiunta la stessa coppia di manopole in `PannelloConfig.tsx`
   (sezione nuova, visibile solo col MUSE collegato — come in App.tsx: è la SUA sensibilità),
   stesse formule, stesso motore, nessuna persistenza fra sedute (App.tsx non lo fa nemmeno).
2. **Il controllo di prontezza prima della seduta — ASSENTE del tutto.** In App.tsx, collegare
   uno strumento non porta MAI dritti alla seduta: prima la prova delle boîtes
   (`ThetaReadyCheck` — stretta e respiro, la STESSA che fissa la sensibilità e verifica la
   caduta) se il meter è collegato, poi il respiro guidato del MUSE (`MetabolicCheck` — una
   baseline passiva più un'inspirazione profonda, quattro numeri: contatto, calma, cuore,
   reattività) se il MUSE è collegato. SERENITY apriva la seduta all'istante — un MUSE appena
   accoppiato ma non indossato, o un ago mai tarato, entravano in seduta senza che nessuno lo
   sapesse. Montati gli STESSI due componenti condivisi (zero righe riscritte dentro di loro),
   sullo STESSO motore che li alimenta (`metabolicBaseline` — già nutrito da
   `hooks/useChargeEngine`, montato in SERENITY fin dalla fase 6: semplicemente nessuno lo
   guardava). Resta CONSULTIVO come in App.tsx — ANNULLA apre comunque la seduta, non la
   blocca — e un caso limite proprio di SERENITY (la connessione scelta fallisce nel mezzo)
   esce da solo verso la seduta invece di restare bloccato su un pannello vuoto, con un
   `useEffect` dedicato (mai uno stato scritto DURANTE il render — la stessa impurità che ha
   già causato un falso allarme dei Hook in un giro precedente).

### Verificati e confermati NON mancanti (differenza di organizzazione, non di funzione)

- **`useMnaModule`** — App.tsx lo usa come hook, SERENITY replica lo STESSO stato a mano
  (`primePhase`/`primeIm`/…). Stessa forma, stesso reset: non una divergenza di logica, solo
  del codice duplicato — a rischio zero, non prioritario.
- **`SidebarDrawer`/`Sidebar`** — la navigazione a cassetti di App.tsx (link/auditor/pc/trim/
  session/lang/config). SERENITY la sostituisce con le pillole d'intestazione + `PannelloConfig`
  + `Connessione` — organizzazione diversa, stesse destinazioni raggiungibili (tranne TRIM,
  chiuso al punto 1 sopra).
- **`ConnectionModal`/`ConnectionProgress`** — coperti da `Connessione.tsx`.
- **`EpValidationModal`/`EpManualModal`** — coperti da `PannelloEp.tsx`.

### Trovati, dichiarati, NON ancora chiusi (l'inventario resta onesto)

- **`PostSessionReport`** (~1.500 righe, esporta PDF) — SERENITY non ha ALCUN rapporto di fine
  seduta (`reportOpen` è cablato a `false`). Già segnato « da fare » nella tabella delle fasi
  in cima a questo documento (fase 8) — confermato dall'audit, non una sorpresa, ma resta il
  vuoto funzionale più grande rimasto.
- **`ToneColumn`** — la scala verticale del tono accanto all'ago (segnalata assente da almeno
  due giri).
- **La vista INDICAZIONE dell'assessment** (`AssessmentPanel`'s seconda vista: le due letture
  MUSE/METER separate, la domanda « indica al preclear? »). `ZonaAssessment` copre solo la
  vista ASSESSMENT.
- **`useMediaRelayFallback`** (CONN-33, fallback JPEG quando il WebRTC video fallisce) — il
  PROP esiste già su `CameraCerchio` (`fallbackFrame`), il hook che lo alimenta non è montato.
- **`HealthPanel`** (322 righe), **`BiometricPanel`** (100 righe), **`AIAssistant`** (444
  righe), **`GuideModal`** (147 righe), **`CreditsModal`**, **`SplashScreen`** — non ancora
  esaminati riga per riga in questo giro (tempo del giro esaurito prima di arrivarci): la loro
  reale necessità (funzione operativa vs. contenuto informativo) resta da stabilire nel
  prossimo.
- I bottoni non ancora vetrati di `Connessione`/`PannelloConfig`/`PannelloEp`/
  `PannelloProfilo` (già dichiarato nel decimo giro).

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320 warning, tutte preesistenti),
`vitest run` 639/639. A schermo (tab pulita, scuro): « sans instruments » apre la seduta
all'istante (nessuna regressione); scelto MUSE, il controllo di prontezza si apre e — la
connessione MUSE non potendo riuscire in un browser senza Bluetooth vero — esce da solo verso
la seduta pochi istanti dopo, confermando il caso limite. `git status`: solo
`src/serenity/PannelloConfig.tsx` + `src/serenity/Serenity.tsx`. EQUILIBRIUM invariato,
SERENITY 3.0.43.

---

## Dodicesimo giro (19/08/2026) — continua l'audit: un bug vero trovato verificando dal vivo

« Continue » — proseguito l'audit senza fermarsi, con l'interruzione di un blocco permessi del
filesystem (Accesso completo al disco) nel mezzo: risolto lato utente, ripreso da dove si era.

**Due funzioni in più, chiuse con lo stesso metodo dell'undicesimo giro** (il motore esiste
già, mancava solo chi lo guarda/attiva):

1. **L'integrità biometrica** (`runtime/SmoothingEngine`'s `integrityTracker`) — ASSENTE.
   `hooks/useChargeEngine` già gli scrive `setTarget` a ogni METRICS_UPDATE (montato da
   sempre): mancava solo chi legge (`useSyncExternalStore`) e chi lo avvia
   (`integrityTracker.start()/.stop()`, legato al montaggio dell'applicazione come in
   App.tsx, non a una singola seduta). Aggiunto un readout nella riga diagnostica, accanto a
   TA/fase/qualità segnale.
2. **La guida** (`GuideModal`) — ASSENTE. Autosufficiente (un iframe su un file HTML copiato
   ad ogni build, `scripts/copy-guide.cjs` — gira per entrambe le applicazioni, verificato)
   — montata tale e quale, un bottone « ? » accanto a CONFIG in intestazione.

**Un bug vero, trovato SOLO verificando dal vivo, non dalla lettura del codice**: aperta una
seduta scegliendo MUSE, il controllo di prontezza (chiuso l'undicesimo giro) non compariva
mai — si andava dritti alla seduta, esattamente il difetto che quel giro doveva correggere.
Causa: `apri()` — il gesto dietro il bottone "APRI UNA SEDUTA" quando uno strumento è GIÀ
collegato (per esempio dall'intestazione, prima di premere il bottone) — chiamava
`avviaSeduta()` DIRETTAMENTE, senza mai passare da `setMetabolicOpen(true)`. Il pannello di
scelta strumento (`scegliStrumento`) era già cablato bene fin dall'undicesimo giro — è
`apri()`, il SECONDO modo di aprire una seduta, che era rimasto scollegato. Corretto con la
stessa regola di App.tsx (`proceedStart`): senza strumenti, dritti alla seduta (niente da
misurare); altrimenti, il controllo prima.

⚠️ **Ancora non verificabile a vista in questo ambiente**: il controllo di prontezza si APRE
davvero adesso (confermato per lettura del codice — la stessa `useEffect` "caso limite" già
scritta nell'undicesimo giro lo richiude un istante dopo, perché senza Bluetooth vero la
connessione MUSE non può mai riuscire in un browser) — la sua schermata VISIBILE resta da
confermare nell'app reale, con hardware vero, come il percorso del METER già segnalato prima.

**Dichiarato di nuovo, non ancora esaminato riga per riga** (l'audit resta onesto): il
rapporto di fine seduta (fase 8), `ToneColumn`, la vista INDICAZIONE dell'assessment, i
bottoni non vetrati di 4 pannelli secondari, `HealthPanel`/`BiometricPanel` (le forme d'onda
EEG/gyro grezze — richiedono di allacciarsi al flusso grezzo del worker, non ancora
esaminato), `AIAssistant`, `useMediaRelayFallback`.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320 warning, tutte preesistenti),
`vitest run` 639/639, verifica dal vivo (guida: si apre, mostra il manuale, si chiude; profilo
"Test" → SOLO → MUSE → apri: nessun crash, la seduta si apre correttamente attraverso il
percorso corretto di `apri()`). `git status`: solo `src/serenity/Serenity.tsx`. EQUILIBRIUM
invariato, SERENITY 3.0.44.

---

## Tredicesimo giro (19/08/2026) — la scala del tono, e i bottoni vetrati fino in fondo

« oui » — continuato l'audit dei punti dichiarati nel giro precedente.

**`ToneColumn` — chiusa**, stesso metodo: componente puro (« nessuno stato, nessuna
decisione »), tutto quel che gli serve arriva già da `tone` (`useToneCycle`, montato da
sempre) — `toneOraEeg`/`margineTono` erano già nel suo ritorno, semplicemente non ancora
letti. Montata accanto a `ToneDial`.

⚠️ **Un secondo bug trovato SOLO verificando dal vivo**: montata a destra come in App.tsx, la
colonna risultava PRESENTE nel DOM (confermato via ispezione — il suo `<svg>` c'era, col
`viewBox` giusto) ma INVISIBILE — coperta dalla colonna delle camere, che occupa la stessa
zona con uno z-index più alto. App.tsx non ha questo conflitto (le sue camere stanno in una
colonna fissa a parte, non galleggiano sul quadrante come qui). Spostata a sinistra, dove non
incontra le camere.

**I bottoni vetrati, fino in fondo** — gli ultimi rimasti nudi (`border:'none',
background:'none'`, segnalati ma non ancora chiusi nel decimo giro) in `Connessione.tsx`
(copia link, riprova connessione, indietro, entra in seduta — più un `boxShadow` inline che
cancellava in silenzio quello di `.s-glass-btn`, lo stesso bug già visto altrove),
`PannelloConfig.tsx` (indietro, tutti on/tutti off), `PannelloEp.tsx` (annulla),
`PannelloProfilo.tsx` (indietro, elimina profilo) — tutti diventati pillole di vetro vere.

**Dichiarato ancora, non chiuso** (l'audit resta onesto): il rapporto di fine seduta (fase 8),
la vista INDICAZIONE dell'assessment (App.tsx la calcola con funzioni SUE — `aggiungiItemManuale`/
`cercaLetturaPerParola`/`segnaIndicazione` — non funzioni condivise: da PORTARE, non da
collegare), `HealthPanel`/`BiometricPanel` (le forme d'onda EEG/gyro grezze — il loro buffer
si popola dentro App.tsx stesso, non in un hook condiviso: stessa natura della vista
INDICAZIONE), `AIAssistant`, `useMediaRelayFallback`.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori (320 warning, tutte preesistenti),
`vitest run` 639/639, verifica dal vivo (TONE armato: la colonna del tono appare a sinistra,
leggibile, senza sovrapposizioni). `git status`: solo `src/serenity/*`. EQUILIBRIUM invariato,
SERENITY 3.0.45.

---

## Quattordicesimo giro (19/08/2026) — il terzo motore vocale, quello che mancava davvero

Segnalato con una prova precisa: « in EQUILIBRIUM con CHROME funziona, ed anche in Electron ».
Prima ipotesi (sbagliata, controllata e scartata): che l'assessment funzionasse solo a voce
vera e in questo ambiente di test non ci fosse microfono — vero in generale, ma non spiegava
perché EQUILIBRIUM ripiegasse su QUALCOSA che funzionava e SERENITY no.

**La causa vera, trovata leggendo App.tsx riga per riga**: App.tsx ha TRE motori vocali, non
due. `useVoiceItem.ts` (fase precedente della refonte) ne conosceva solo due — il riconoscitore
nativo macOS (via il sidecar Electron) e Whisper offline (WASM) come ripiego — perché la nota
in cima al file diceva esplicitamente « gli STESSI due motori di App.tsx », ed era la premessa
sbagliata: App.tsx ne ha un terzo, `window.SpeechRecognition`/`webkitSpeechRecognition` — il
riconoscitore NATIVO DEL BROWSER — e FUORI DA ELECTRON è quello che prova PER PRIMO (in
Electron lo salta del tutto, commento CONN-61 nel suo stesso codice: fallisce sempre lì).
Risultato: in Chrome, EQUILIBRIUM parla con Web Speech; SERENITY provava solo Whisper, e se
Whisper non si carica (visto succedere in ambienti sandboxed — errore ONNX runtime
`registerBackend`) non restava più nulla.

**Corretto**: `useVoiceItem.ts` riscritto con la STESSA precedenza di App.tsx — Electron:
nativo → Whisper; browser: Web Speech → Whisper solo se Web Speech stesso fallisce (non per un
« nessun discorso », benigno e frequentissimo, dove si riprova e basta — stessa regola CONN-81
di App.tsx). Aggiunto anche il riavvio automatico di Web Speech a ogni interruzione (Chrome
ferma il riconoscitore dopo ogni frase: senza riavvio si sentirebbe una frase sola e poi
silenzio).

**Trovato nello stesso giro**: il parametro `speechEndMs` (quando la parola è FINITA, non
quando il riconoscitore la dichiara — fino a 900ms dopo) arrivava già dai due motori esistenti
ma `Serenity.tsx` lo IGNORAVA, datando sempre l'item all'istante di arrivo della trascrizione.
L'instant read dell'ago, che avviene alla fine della parola, poteva cadere fuori dalla sua
finestra. Aggiunta la STESSA retrodatazione di App.tsx (fino a 3s, la stessa formula).

⚠️ **Non verificabile fino in fondo in questo ambiente**: il browser di test blocca sia il
microfono di Web Speech sia il caricamento di Whisper — confermato che il codice ORA prova
Web Speech per primo (la richiesta di permesso microfono compare, cosa che prima non
succedeva mai), ma la conferma che funzioni DAVVERO in Chrome vero, con un microfono vero,
resta da fare da chi l'ha segnalato.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori nuovi, `vitest run` 639/639. `git
status`: solo `src/hooks/useVoiceItem.ts` (esclusivo SERENITY) + `src/serenity/Serenity.tsx`.
EQUILIBRIUM invariato, SERENITY 3.0.46.

---

## Quindicesimo giro (19/08/2026) — la stessa componente di EQUILIBRIUM, il vetro fino in fondo

« riproda logica dei cicli di equilibrium in SERENITY, con gli stessi campi, stessi
posizionamenti » — dopo il decimo giro (che aveva già montato `CycleSteps`/`CycleStatusBar`),
mancavano ancora due pezzi, trovati leggendo App.tsx riga per riga.

1. **`CycleHint` — « a che punto sono, e cosa devo fare » — ASSENTE del tutto.** App.tsx ha
   `spiegazioneCiclo` (una mappa fase→testo: titolo, il comando ESATTO da dire al preclear fra
   virgolette, che cosa fare, un avviso ambra) più `CycleHint` che lo disegna, sempre nello
   stesso posto sotto i comandi del ciclo. `CycleSteps` (già montata) dice DOVE si è nella
   sequenza; questo dice COSA FARE in quel punto — le due informazioni non si sovrappongono, e
   SERENITY aveva solo la prima. Portato `spiegazioneCiclo` parola per parola (non è calcolo,
   è la procedura scritta) per TONE/MIRROR/CONTACT/NULL. `CycleHint` STESSO non si è potuto
   riusare: scrive i suoi colori DIRETTI nello stile inline (mai una `var(--sm-x)` come
   `CycleStatusBar`) — `rgba(240,246,255,0.95)`, quasi bianco, tarato sul fondo scuro di
   App.tsx, sarebbe stato quasi invisibile sul bianco perla di SERENITY in tema chiaro. Stessa
   struttura a quattro righe, stessi dati, nella lingua grafica di SERENITY:
   `SuggerimentoCiclo`, nuovo, locale a `Serenity.tsx`.

2. **`CycleStatusBar` era nel posto sbagliato.** Montata nel decimo giro, ma vicino al
   quadrante (dietro `agoEeg`), lontana dai comandi del ciclo — App.tsx la mette SEMPRE
   direttamente sotto la domanda/i comandi, mai altrove (la sua stessa nota: « riga sotto la
   domanda »). Spostata nel blocco CONTACT/NULL, subito dopo gli esiti di validazione: stesso
   componente, ora anche stesso posto.

Verificato dal vivo: armato CONTACT senza strumenti, la scritta cambia correttamente ad ogni
fase — « DÌ L'ITEM · Le premier mot que tu dis devient l'item. » in attesa della parola,
« DEMANDE UN MOCK-UP · Puis ne fais rien d'autre : le cycle avance tout seul jusqu'à l'AS-IS. »
dopo — parola per parola quanto App.tsx.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori nuovi (317 warning, tutte
preesistenti), `vitest run` 639/639. `git status`: solo `src/serenity/Serenity.tsx`.
EQUILIBRIUM invariato, SERENITY 3.0.48.

---

## Sedicesimo giro (20/08/2026) — il logo, il bottone dentro il campo, le icone raddoppiate, i quattro moduli che mancavano

Cinque richieste in un solo messaggio, tutte sull'intestazione e sui moduli « in arrivo ».

1. **Il logo Alternative Scientology — ASSENTE.** App.tsx lo mette in alto a sinistra,
   sempre, con lo stesso trattamento a due temi (pillola scura in tema chiaro, perché il PNG
   ha la scritta bianca incisa dentro, pensata per un fondo scuro). Portato tale e quale,
   `setCreditiAperti(true)` al click — monta `CreditsModal`, riusato COSÌ COM'È come già
   `GuideModal`: un velo scuro a sé, non parte della superficie chiara/scura di SERENITY.

2. **« SAUVEGARDE CETTE CONFIGURATION », ORA DENTRO il campo Auditeur/PC · Expert/Normal.**
   Era una pillola a parte, accanto. Segnalato: deve essere UN'ICONA, dentro lo stesso campo —
   perché salvare la configurazione è salvare esattamente quel che quel campo racconta (chi
   audita, con chi, quanto esperto), non un'azione indipendente. Un'icona `Save` sola, stesso
   cassetto a scomparsa di prima (nome + bottone salva/salvata ✓), solo spostata dentro.

3. **Tutte le icone, raddoppiate.** Sweep su ogni `size={…}` di `lucide-react` in
   `src/serenity/*.tsx` — 12→24, 13→26, 16→32, 48→96 (l'icona segnaposto del ritratto in
   `PannelloProfilo`, il disco che la contiene è 132px: 96 ci sta comodo). Verificato dal vivo,
   nessun contenitore va in overflow.

4. **MUSE / METER / SANS INSTRUMENTS — dalla frase intera alla parola sola.** Prima la parola
   PORTAVA lo stato (« connecter muse » / « meter déconnecté » / …), diversa ogni volta — ora
   la parola è SEMPRE il nome corto e invariante del dispositivo, lo stato si legge dal punto
   colorato (`IndicatoreConnessione`, invariata) e da un `dettaglio` corto (%, "…", "⚠", "✓").
   La frase intera non è sparita: è diventata il `title` (tooltip / lettore di schermo) —
   niente tolto, solo spostato da « sempre visibile » a « a richiesta ».

5. **I quattro moduli « in arrivo » — journal, Santé Système, Assessement, integrità
   biometrica — ORA REALI.** Erano nella lista di CONFIG da fasi, spenti e non toccabili,
   perché senza un pannello vero un interruttore sarebbe stato un controllo bugiardo.
   Verificato COSA mancava DAVVERO, leggendo il codice invece di supporre:
   - **Assessment e integrità biometrica esistevano già** (`ZonaAssessment`,
     `LetturaIntegrita`, montate in un giro precedente) — mancava solo il loro interruttore in
     CONFIG. Ora gated su `moduleVis.ri`/`moduleVis.biometric`.
   - **Il giornale mostrava solo un conteggio.** Un bottone lo apre ora in un cassetto
     ancorato al quadrante (stesso posto di `PannelloMna`, un cassetto alla volta):
     stessa lista di `components/TranscriptLog.tsx` — ordine per TEMPO non per arrivo, righe
     RITIRATE in ambra, righe METER nel colore dell'ago, `hideSpeech` nelle sedute SOLO —
     riscritta con i token `var(--s-*)` di SERENITY invece delle sue classi `text-white/…`
     fisse (stessa ragione per cui `CycleHint` non si è potuto riusare tale e quale, giro 15).
     ⚠️ **Trovato verificando dal vivo, non leggendo il codice**: la prima versione usava
     `--s-ink-ghost` per le righe SYS e il titolo — leggibilissimo sulla superficie chiara di
     SERENITY, quasi invisibile qui perché questo cassetto galleggia sullo SCHERMO scuro fisso
     del quadrante (non sul fondo dell'app). Corretto a `--s-ink-faint`, la stessa convenzione
     già usata da `PannelloMna` sullo stesso fondo — non l'ho inventata, l'ho letta lì.
   - **Santé Système era del tutto assente — e NON era il porting pesante temuto.** Un giro
     precedente (13°) aveva già portato `eegBuffer`/`gyroBuffer` in `Serenity.tsx` per
     `ToneColumn`: la STESSA coppia di ref che `HealthPanel` (App.tsx) legge, riempita dallo
     STESSO `useMuseConnection` condiviso. `displayBpm` (`realBpm`), `signalQuality`
     (`museGate.signalQuality`), `museConnection`, `batteryLevel` c'erano già tutti come
     variabili locali. Montato `HealthPanel` TALE E QUALE (non una sua imitazione), in un
     bottone + cassetto nuovi (« salute sistema »), visibile solo a strumento connesso
     (`agoEeg || meterC` — niente bottone che apre il nulla). Le sue zone interne (onda EEG,
     radar del giroscopio, quadrante BPM) restano il proprio SCHERMO scuro fisso apposta — uno
     strumento resta uno strumento a prescindere dal tema di SERENITY attorno, la STESSA scelta
     già fatta per il quadrante principale in tema scuro. Serviva solo un token mancante,
     `--sm-panel-shadow` (letto da `TOKEN.panelShadow`, definito solo in `index.css` di
     EQUILIBRIUM) — aggiunto a `tokens.css` con gli stessi valori, chiaro e scuro, seguendo la
     nota già scritta lì per `--sm-chip-bg`/`--sm-chip-edge`/`--sm-accent-ink`.
   - `serenityModuleStore.ts`: le sette chiavi ora sono tutte reali
     (`SERENITY_MODULES_DEFAULT` le accende tutte); `PannelloConfig.tsx`: `MODULI_IN_ARRIVO`
     sparita, i quattro spostati in `MODULI_REALI`; « ACCENDI TUTTO »/« SPEGNI TUTTO » ora
     coprono tutti e sette, non più solo i primi tre.

Verificato dal vivo (server Vite locale, `.claude/launch.json` aggiornato con una voce
`serenity-dev`): logo cliccabile (apre i crediti), pillola con l'icona salva funzionante nel
posto giusto, icone raddoppiate senza overflow, MUSE/METER/SANS INSTRUMENTS corti e leggibili,
CONFIG con sette moduli tutti accesi e tutti spegnibili singolarmente (provato spegnere e
riaccendere « journal de session »: il bottone sparisce e torna, il conteggio muto lo
sostituisce quando spento), giornale apribile con righe leggibili dopo la correzione del
colore, ASSESSMENT visibile in seduta, Santé Système correttamente assente senza strumento
connesso (niente da mostrare, niente bottone).

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori nuovi (317 warning, tutte
preesistenti — nessuna nuova rispetto al giro 15), `vitest run` 639/639. `git status`: solo
`src/serenity/*` + `.claude/launch.json` (voce di sviluppo, nessuna logica applicativa).
EQUILIBRIUM invariato.

---

## Diciassettesimo giro (20/08/2026) — la manopola di sensibilità, il test che non si ripete, l'icona START sul quadrante

Tre segnalazioni, e una REGOLA dettata per intero insieme: **« Reproduit les mêmes logique
que dans equilibrium, sauf si expressément demandé diversement »** — vedi la memoria
`serenity-reproduce-equilibrium-logic`. Il filo comune dei tre punti: `PannelloMeter.tsx`
(il wizard di connessione del meter, una schermata che SERENITY ha e EQUILIBRIUM no) non
riprendeva fedelmente ciò che App.tsx offre per lo stesso strumento, e un'icona con un posto
preciso in EQUILIBRIUM mancava del tutto in SERENITY.

1. **La sensibilità del meter — ASSENTE nel test di connessione.** `theta.setup.sensTrim`/
   `theta.setSensTrim` esistono da sempre nel motore condiviso (li usa `ThetaReadyCheck`,
   App.tsx) — mancava solo il controllo in `PannelloMeter.tsx`. Aggiunto lo STESSO gesto di
   `ThetaReadyCheck`: due bottoni grandi ±1, sotto la prova della stretta (passo 2) — non un
   cursore trascinabile come nel drawer TRIM di App.tsx, perché questo pannello è a passi
   come `ThetaReadyCheck`, non un cassetto sempre aperto come il TRIM: stesso principio,
   forma presa dal parente più vicino, non dai due insieme a caso.

2. **Il test si ripeteva due volte.** Se l'auditor aveva già fatto stretta + respiro nel
   pannello di connessione (passi 2 e 3 di `PannelloMeter`), aprendo la seduta
   `ThetaReadyCheck` chiedeva di rifarli — `apri()` resettava sempre `thetaReadyDone` a
   `false`. Corretto: se il meter è collegato E `theta.setup.scaleMeasured` E
   `theta.breathOk !== null` (il test è stato fatto, indipendentemente dall'esito — la nota
   di `ThetaReadyCheck` stessa dice che si può procedere comunque), `thetaReadyDone` parte
   già `true` e il controllo delle boîtes si salta, passando dritto al respiro guidato del
   MUSE se c'è, o alla seduta.

3. **L'icona START sul quadrante — ASSENTE.** App.tsx ne ha una seconda, oltre al bottone
   della sidebar: un `Play` pieno, centrato SUL quadrante, dentro un anello che respira
   (`smStartPulse`), quando uno strumento è pronto e la seduta non è aperta — « la zone
   aiguille ». SERENITY aveva solo il bottone di testo in barra comandi. Aggiunta la STESSA
   icona, nello stesso punto, con la stessa animazione — ridisegnata con `currentColor` e
   `color-mix` invece del ciano fisso di EQUILIBRIUM (due nuovi `@keyframes` in
   `tokens.css`, `sStartPulse`/`sStartFade`), per restare nella tavolozza di SERENITY senza
   toccare né condizione né posizione. Non sostituisce il bottone di testo, lo affianca —
   esattamente come in App.tsx i due convivono.

Verificato dal vivo: senza strumenti, l'icona Play appare centrata sul quadrante insieme al
bottone "OUVRIR UNE SÉANCE"; click sull'icona apre la seduta; icona sparisce a seduta aperta
e riappare dopo averla chiusa.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori nuovi, `vitest run` 639/639.
`git status`: solo `src/serenity/*`. EQUILIBRIUM invariato.

---

## Diciottesimo giro (20/08/2026) — la linea del bersaglio sull'arco, R&I, pausa manuale, e l'inventario onesto di ciò che resta

Due richieste nello stesso messaggio: una precisa (la linea del bersaglio durante la prova
delle boîtes), una larga e imperativa (« MAINTENANT IMPLEMENTE LES MODULS MANQUANTS »). Per la
seconda, audit vero — non supposizioni — confrontando gli import di `App.tsx` con quelli di
`src/serenity/*`, per trovare cosa manca DAVVERO e non ciò che sembra mancare a naso.

1. **La linea del bersaglio sull'arco, durante stretta/respiro — ASSENTE.** `QuantumSphere`
   sa già disegnarla (`targetOffset`, la linea tratteggiata verde a un terzo di quadrante) —
   qui restava sempre `null`. Ora `theta.testing ? theta.testBaseOffset + SQUEEZE_TARGET_OFFSET
   : null`, la STESSA espressione di App.tsx.

2. **R&I / INDICAZIONE — la vista che l'audit funzionale aveva dichiarato aperta da tre giri.**
   `AssessmentPanel.tsx` (App.tsx) non era, come temuto in un giro precedente, un caso di
   "logica sepolta nel corpo di App.tsx" — le tre funzioni che la fanno funzionare
   (`aggiungiItemManuale`/`cercaLetturaPerParola`/`segnaIndicazione`) usano SOLO primitive già
   pure e già presenti in `Serenity.tsx` (`computeInstantRead`, `chiaveItem`, `corpusWrite`,
   `shownReadsRef`) — un wiring, non un porting. Portate parola per parola, e `ZonaAssessment`
   (la "sua zona" di un giro precedente) si è presa il selettore ASSESSMENT/INDICAZIONE, il
   campo per scrivere un item trovato in un altro modo con la proposta di quando è stato detto,
   i bottoni Sì/No per la conferma del preclear, le due colonne separate MUSE/METER quando
   entrambi gli strumenti sono connessi (mai un verdetto unico — misurato: κ di Cohen −0,09 fra
   i due), e il conteggio finale. Stessa grafica di `ZonaAssessment`, non le classi Tailwind
   di `AssessmentPanel`.

3. **La pausa che sceglie l'auditor — mancava, c'era solo quella automatica.** SERENITY aveva
   già `pauseOnLoss` (strumento perso → pausa, portato in un giro precedente) ma non il bottone
   Play/Pause che App.tsx offre SEMPRE in seduta, per una pausa VOLUTA (una conversazione fuori
   verbale, per dire). Le due pause non potevano condividere lo stesso interruttore senza
   conflitto: l'effetto di auto-ripresa avrebbe cancellato una pausa manuale nell'istante stesso
   in cui la si premeva, perché lo strumento resta connesso. Un `pausaMotivoRef` (`'strumento'`
   `| 'manuale'`) distingue le due; l'auto-ripresa agisce SOLO sulla prima. La voce si ferma da
   sé (`useVoiceItem`'s `active` ora `aperta && !pausata`), come `handlePause` in App.tsx.
   ⚠️ Trovato verificando dal vivo: il badge "in pausa" diceva SEMPRE « strumento perso », anche
   per una pausa manuale con nessuno strumento mai perso — corretto a leggere `pausaMotivoRef`.

4. **Total TA e velocità di rilascio — assenti insieme al TA istantaneo.** App.tsx li affianca
   sempre (`TotalTaReadout`/`SpeedReadout`), qui c'era solo `LetturaTA`. Stessa fonte
   (`metricsStore`, o `theta.totalTa` quando il meter è connesso — la resistenza MISURATA
   prevale sempre su quella ricostruita dall'EEG), stesso `React.memo` isolato per non
   ridisegnare tutta l'intestazione a ~10 Hz.

### L'inventario, onesto: cosa manca ANCORA

L'audit (confronto import `App.tsx` ↔ `src/serenity/*`) ha trovato tre feature INTERE, non
piccoli dettagli, che restano assenti — dichiarate qui invece di lasciarle scoperte in
silenzio:

- **`PostSessionReport`** (fine seduta, rapporto/PDF — fase 8 del piano) — mai iniziata.
- **`HistoryModal`** (le sedute passate, riapertura dei rapporti) — dipende dal punto sopra.
- **`ProcessusModal`** (la libreria dei processi di auditing) — mai iniziata.

Più piccoli, non ancora guardati: `AIAssistant`, `ThetaTaCalibration` (il "tester" completo
dell'artefatto — la taratura di base c'è già in `PannelloMeter`, passo 4), parità completa fra
`PannelloEp` e `EpValidationModal`/`EpManualModal` di App.tsx. Non un'omissione — le prime tre
sono, da sole, ciascuna un giro a parte per la stessa cura che ha avuto ogni altro pezzo di
questa refonte (lettura completa, porting fedele, verifica dal vivo, test).

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori nuovi, `vitest run` 639/639,
verifica dal vivo (pausa manuale, badge corretto dopo la correzione, vista R&I: item scritto,
proposta, conferma Sì, conteggio 0/0 corretto per "non misurato" — tutto senza strumenti,
quindi la linea del bersaglio e i readout TA/velocità restano da verificare con un meter/MUSE
vero). `git status`: solo `src/serenity/*`. EQUILIBRIUM invariato.

---

## Diciannovesimo giro (20/08/2026) — l'arco riprende spazio, la vista DUE, la taratura spiegata, e History al posto del Report

Sei richieste arrivate una dietro l'altra nello stesso messaggio, più due bug segnalati dal
vivo. Il filo comune di metà di loro: fare più posto all'ARCO, che restava schiacciato da
elementi che potevano stare altrove.

1. **Icona di eliminazione nelle CONFIGURAZIONI SALVATE.** C'era già (`eliminaConfigurazione`
   collegata da un giro precedente), ma era la "×" di un carattere, non un'icona vera. Ora
   `Trash2`, la STESSA di `HistoryModal.tsx` per lo stesso gesto.

2. **I comandi del ciclo, tutti sulla stessa riga.** Il blocco "poi scegli il metodo" (le
   quattro pillole CONTACT/NULL/MIRROR/TONE) aveva un `flexBasis:'100%'` che lo forzava SEMPRE
   su una riga sua, anche quando c'era spazio per stare accanto al campo dell'item. Tolto —
   resta un figlio normale della riga flessibile, va a capo da sé solo se serve davvero.
   (I `flexBasis:'100%'` di `CycleSteps`/`CycleStatusBar`/`SuggerimentoCiclo` restano: quelli
   sono la regola "riga sotto la domanda" di un giro precedente, voluta così.)

3. **La striscia delle letture, spostata DENTRO il quadrante.** Orologio, TA, fase, il
   selettore MUSE/METER, il badge di pausa: stavano FUORI dal contenitore dell'ago, un figlio
   in più della colonna della sezione — e siccome il quadrante ha un `maxHeight` calcolato
   sullo spazio che resta, ogni lettura aggiunta ai giri precedenti (TA totale, velocità di
   rilascio) lo restringeva. In App.tsx queste letture stanno DENTRO il pannello dello
   strumento (`Panel3D`, laterale), mai fuori. Spostata l'intera striscia dentro il
   contenitore del quadrante come overlay ancorato al fondo (`position:absolute`, come
   `ToneColumn`/i cassetti già lì) — il quadrante torna a leggere `maxHeight:'100%'` invece di
   `calc(100% - 44px)`, uno spazio VERO invece che conteso. Verificato dal vivo: l'arco è
   visibilmente più grande, l'orologio resta leggibile (`--s-ink-soft`/`-ghost` a seconda di
   `aperta`, invariato).

4. **La vista DUE (MUSE+METER insieme) — dichiarata aperta da due giri, ora chiusa.** La terza
   voce del selettore di App.tsx (`reazioniViste`): l'ago resta quello del Meter (misurato),
   ma le reazioni del MUSE si aggiungono ETICHETTATE accanto — non un secondo ago disegnato
   (SERENITY ne mostra sempre uno solo, scelta del decimo giro), le sue letture in più.
   `SegmentoVetro` ora ha tre voci invece di due.

5. **La taratura due-lattine/lattina-sola, resa esplicita.** Segnalato: « on ne sait pas s'il
   faut serrer les boîtes des deux cans ou solo pour avoir la différence de TA ». Vero — il
   riquadro del confronto compariva SOLO quando entrambe le prove erano GIÀ fatte, senza dire
   come farle: bisognava indovinare di tornare al passo 1 per cambiare configurazione, poi al
   passo 2 per stringere, due volte. Il passo 4 di `PannelloMeter` è ora una sequenza guidata
   con due sotto-passi propri (« 1 · con DUE lattine » → cambia configurazione e stringi da
   QUI, senza uscire dal passo; « 2 · con la LATTINA SOLA », sbloccato solo dopo il primo),
   seguiti dal confronto — e separata con chiarezza dalla taratura della SCALA (contro il
   Theta-Meter vero), che è un'altra cosa e viveva confusa nello stesso riquadro.

6. **Il Report post-seduta non c'è più — la seduta finisce diretta in History, col suo PDF.**
   Il cambiamento più grosso del giro. `PostSessionReport.tsx` fa due cose insieme in App.tsx:
   una schermata interattiva, E (al suo stesso montaggio, non a un clic) il salvataggio della
   seduta + la generazione del PDF per History. SERENITY voleva SOLO la seconda parte.
   - **Scoperta chiave**: `sessionRecorder` (il singleton che nutre `history`/`reactions` del
     rapporto) è GIÀ riempito in SERENITY — le sue scritture vivono in `useChargeEngine`/
     `useMuseConnection`, condivisi e già montati qui. Mancava solo `pushNeedleOffset`
     (nello stesso `sessionClock.subscribe` di App.tsx, aggiunto) e `reset()` all'apertura.
   - **`sessionReport.ts`, nuovo**: `costruisciRiepilogo` (la STESSA forma di `SessionSummary`
     di App.tsx, coi soli campi che SERENITY misura per intero) e `generaPdf` — un PDF con lo
     STESSO linguaggio visivo di App.tsx (banner, pannelli con barra d'accento, riquadri-
     metrica: massa, TA totale, F/N — stessa fusione delle micro-interruzioni sotto 1s —, EP)
     ma NON un porting riga-per-riga delle ~800 righe di `generateTextPdf`: le tabelle
     per-ciclo (CONTACT/NULL/MIRROR/TONE/ASSESSMENT, un elenco per ogni ciclo con esito — un
     ARRAY che SERENITY non tiene ancora) restano un giro a sé, dichiarato anche NEL pdf
     stesso, non solo qui.
   - `chiudi()` costruisce il riepilogo, chiama `saveSession`, genera il PDF in background e
     lo salva (`saveSessionPdfAsync`) — zero schermo in mezzo.
   - `HistoryModal` montato `lazy` (come App.tsx), un'icona nuova in intestazione
     (`sidebar_history`), STESSO componente, STESSO archivio unico — una seduta chiusa da
     SERENITY compare anche aprendo EQUILIBRIUM, e viceversa.
   - ⚠️ **Bug trovato verificando dal vivo**: la prima versione condizionava il salvataggio a
     `corpusAvailable()` — che guarda l'archivio CORPUS (JSON Lines per l'IA, richiede
     Electron/filesystem), un controllo SBAGLIATO qui: bloccava il salvataggio in History
     anche nel browser, dove l'archivio sessioni (`localStorage`/IndexedDB) funziona da sé.
     I due archivi sono indipendenti. Tolto il controllo; riverificato dal vivo — la seduta
     compare in History con il suo PDF (confermato anche leggendo `IndexedDB` a mano: un data
     URI `application/pdf` da ~20 KB, ben formato).

### Bug segnalato, non riprodotto

« L'aiguille du Muse semble ne pas bouger » — letto `useChargeEngine`/`useMuseContactGate`
riga per riga (il gate di contatto che decide se l'EEG di un istante conta, la STESSA logica
per le due applicazioni), nessun difetto trovato nel codice, e senza un MUSE vero in questo
ambiente non è riproducibile qui. Resta aperto: serve sapere QUANDO (all'apertura seduta? con
che percentuale di segnale mostrata accanto? l'ago si muove pochissimo o per niente?) per
continuare a cercarlo con qualcosa di più di una lettura del codice.

Verificato: `tsc --noEmit` pulito, `npm run lint` 0 errori nuovi, `vitest run` 639/639,
verifica dal vivo estesa (layout senza strumenti in tutte le fasi, icona elimina, PDF
generato e letto da IndexedDB, seduta chiusa senza schermo di rapporto, History con la seduta
e il suo PDF). `git status`: solo `src/serenity/*`. EQUILIBRIUM invariato.

---

## Ventesimo giro (20/08/2026) — due bug veri sull'ago, trovati leggendo il codice riga per riga

Quattro segnalazioni insieme: « quand on choisit MUSE, apparaît toujours l'aiguille des
boîtes », « l'aiguille du MUSE ne bouge pas », « les indications des réactions ne marchent
pas », « les couleurs traînées des réactions pas visibles ». Le prime due erano la STESSA
causa; le ultime due un'altra, più profonda.

1. **L'ago del Meter, disegnato SEMPRE col meter connesso.** `QuantumSphere` disegna il suo
   ago ogni volta che `thetaOffset` non è `null` (nessun'altra guardia, riga 644 del
   componente) — qui era `meterC ? theta.offset : null`, senza condizione sull'ago SCELTO.
   Risultato: scegliendo MUSE con anche il Meter connesso, l'ago del Meter restava disegnato
   lo stesso, fermo (a riposo, nessuna stretta in corso) proprio sopra quello EEG che invece
   si muoveva — sembrava che l'ago del MUSE non si muovesse: era l'ago del Meter, immobile,
   sopra il suo. App.tsx lo mostra SOLO quando è lui il principale (`agoPrincipale ===
   'theta'`, la sua nota: « un ago solo »): `thetaOffset={meterC && !agoEeg ? theta.offset :
   null}`, stessa esclusività.

2. **Le reazioni non venivano MAI classificate — non un'etichetta mancante, il
   riconoscimento intero spento.** `needleVirtualRef` esisteva già (dichiarato, azzerato a
   ogni apertura, LETTO da `useChargeEngine` come `offH` — la storia che il classificatore
   delle reazioni confronta per riconoscere un colpo) ma nessuno ci scriveva MAI dentro: la
   storia restava sempre vuota. In App.tsx quella scrittura vive nello stesso
   `sessionClock.subscribe` che già alimentava `sessionRecorder.pushNeedleOffset` (aggiunto
   al giro scorso) — mancava solo lei, un campionamento della molla "virtuale" nascosta
   (`virtualNeedle.pos`, il segnale liscio su cui il classificatore è tarato), tenuta agli
   ultimi 3 secondi. Spiega insieme « le indicazioni non funzionano » E « le scie colorate
   non si vedono »: senza una reazione classificata, non c'è né l'una né l'altra.

Non riproducibili dal vivo in questo ambiente (nessun MUSE/Meter vero disponibile qui) —
corrette leggendo `QuantumSphere.tsx`/`useChargeEngine.ts` riga per riga dopo le
segnalazioni, non per tentativi. Verifica dal vivo possibile solo sulla macchina dell'utente,
con lo strumento vero collegato.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (uno IN MENO del giro
precedente — `displayMass` non è più "assegnato e mai letto", ora `chiudi()` lo usa),
`vitest run` 639/639. `git status`: solo `src/serenity/Serenity.tsx`. EQUILIBRIUM invariato.

---

## Ventunesimo giro (20/08/2026) — l'assistente IA, la parità EP verificata, due lacune dichiarate con motivo

« Poi continua con l'integrazione degli altri moduli » — proseguito l'inventario di
`App.tsx` (import per import) rimasto dal 18° giro.

1. **`AIAssistant` — ASSENTE, ORA MONTATO TALE E QUALE.** Legge già `useUiStore` da sé
   (si adatta al tema di SERENITY senza bisogno di passarglielo, come `HealthPanel`): niente
   porting, solo il `sessionContext` costruito con dati che SERENITY ha già (nomi, tempo,
   TA, `metricsStore`, ultima reazione, ultime righe del giornale). La chiave Gemini resta
   dell'auditor, in `localStorage`, mai inviata a SERENITY/EQUILIBRIUM (nota già scritta nel
   componente stesso). Accanto al bottone EP nella barra dei comandi, solo a seduta aperta.

2. **`EpManualModal`/`EpValidationModal` — VERIFICATI, NON MANCANTI.** Controllo dell'audit:
   `PannelloEp.tsx` (montato da fasi) riprende GIÀ `EpManualModal` per intero — stesso hook
   `useEpValidation`, stessi campi (reazione, realizzazione del PC, VGI/VVGI, nota), stessa
   sequenza di validazione. `EpValidationModal` non ha un equivalente DI PROPOSITO: è codice
   morto anche in App.tsx (`setShowEpValidation(true)` non viene mai chiamato da nessuna
   parte) — non si riproduce un pezzo che l'originale stesso non usa, nota già scritta in
   testa a `PannelloEp.tsx` da un giro precedente.

3. **`ProcessusModal` — dichiarato aperto, CON IL MOTIVO PRECISO.** Non è un componente
   isolato: la sua sorgente dati (`useAppInitializer`) governa ANCHE `useProfileStore`
   (profilo attivo unico, `isSoloSession`, lingua da preferenza di profilo) — lo STESSO
   meccanismo che il flusso a quattro domande di SERENITY (`avvio.auditorId`/`avvio.pcId`,
   nessun "profilo attivo" singolo) esiste apposta per non avere. Montare
   `useAppInitializer` tale e quale griderebbe sopra `Avvio.tsx` invece di conviverci —
   serve un caricatore SOLO dei PDF di processo (`getAllProcessusFiles`/
   `serverGetProcessusList`, senza gli effetti collaterali sul profilo), non ancora scritto.
   Resta il gap più grande dell'inventario.

4. **La taratura della scala TA con l'artefatto fisico — parità PARZIALE, dichiarata.**
   `ThetaTaCalibration.tsx` (App.tsx) offre un pulsante per ciascun valore inciso
   sull'artefatto (4 pressioni, 4 punti insieme); il blocco B del passo 4 di
   `PannelloMeter.tsx` (17° giro) offre lo STESSO risultato — la stessa `theta.taScale`,
   lo stesso `theta.addPointFromReference` — ma un valore alla volta, scritto a mano. Una
   differenza di COMODITÀ, non di funzione: la taratura si ottiene lo stesso, in più passi.
   Non urgente quanto `ProcessusModal`.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo (l'assistente appare nella barra comandi a seduta aperta, nessun
errore in console). `git status`: solo `src/serenity/Serenity.tsx`. EQUILIBRIUM invariato.

---

## Ventiduesimo giro (20/08/2026) — la camera PC più grande, e un vero bug nelle condizioni dei moduli

Due segnalazioni: « la camm PC doit être plus grande » (semplice), e « je ne vois pas les
modules JOURNAL DE SESSION etc. manquants » — che sembrava un dubbio sulla visibilità e si è
rivelato un bug vero, trovato rileggendo le condizioni introdotte al 16° giro.

1. **CAM 2 (PC)**: 260 → 340. CAM 1 (auditor) invariata (213) — solo la PC era segnalata,
   come nei giri precedenti su questa stessa camera.

2. **Bug trovato: « Santé Système » e l'integrità biometrica sparivano col MUSE connesso ma
   NON scelto come ago attivo.** Le condizioni erano `agoEeg || meterC` per Santé Système e
   l'integrità annidata dentro `agoEeg &&` (il blocco delle letture EEG) — `agoEeg` dice
   QUALE ago si sta GUARDANDO in questo momento, non se il MUSE è connesso: con meter
   connesso e scelto come ago primario, `agoEeg` è `false` anche se il MUSE resta perfettamente
   attivo — e i due moduli sparivano, anche se il modulo in CONFIG restava acceso. Non un
   dubbio di visibilità: le condizioni leggevano la cosa sbagliata. Corrette in `museOk ||
   meterC` (Santé Système, in entrambi i punti dov'è gated) e `museOk` da solo per l'integrità
   e la % di qualità segnale, portate FUORI dal blocco `agoEeg` in un blocco proprio — la
   stessa distinzione che serviva già esisteva altrove (Santé Système la faceva quasi giusta),
   mancava solo applicarla ovunque.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo della camera (visibilmente più grande, nessun overflow sopra
l'arco). La correzione delle condizioni non è verificabile dal vivo in questo ambiente
(nessun MUSE vero) — letta e riletta contro `agoEeg`/`museOk`/`meterC` riga per riga.
`git status`: solo `src/serenity/Serenity.tsx`. EQUILIBRIUM invariato.

---

## Ventitreesimo giro (20/08/2026) — SERENITY non caricava Tailwind: la causa vera dietro History rotto

Tre segnalazioni: « Fermer la séance et pause doivent être après Historique » (riordino),
« manquent PROCESSUS et les autres modules » (di nuovo), e soprattutto « quand on clique sur
Historique rien apparaît et on ne peut pas sortir » — un bug bloccante.

**La scoperta.** `HistoryModal` (App.tsx) è scritto in classi Tailwind
(`absolute inset-0 z-50 flex items-center …`). `serenity/main.tsx` importa SOLO `tokens.css` —
non ha MAI caricato Tailwind. Ogni classe Tailwind su un componente condiviso era quindi un
nome senza NESSUNA regola CSS dietro: `absolute` non posizionava nulla, `flex`/`items-center`
non allineava nulla, `z-50` non impilava nulla. Il pannello non "spariva" — si disegnava come
testo semplice impilato, senza struttura, col bottone "Fermer" (che FUNZIONAVA — non era mai
lui il guasto) perso nel disordine, sembrando irraggiungibile. La stessa causa minacciava
OGNI componente condiviso scritto in Tailwind già montato in SERENITY — `HealthPanel`,
`AIAssistant` — anche se non ancora segnalati per loro (il secondo aveva già un sintomo
latente: `TOKEN.warn`/`.sep`, usati per il suo banner di avviso, leggevano variabili mai
definite in `tokens.css`).

**La correzione, in tre pezzi:**
1. `serenity/tailwind-compat.css`, nuovo — SOLO `theme` + `utilities` di Tailwind
   (`@import "tailwindcss/theme.css" layer(theme); @import "tailwindcss/utilities.css"
   layer(utilities);`), MAI `preflight` (l'azzeramento globale di margini/`button`/`input` —
   si applicherebbe a OGNI elemento della pagina, non solo a quelli con classi Tailwind,
   rimettendo le mani sui controlli che SERENITY già stila a modo suo). MAI `import
   '../index.css'` intero — porterebbe anche le variabili di tema di EQUILIBRIUM, il doppio
   sistema di colori che questo progetto evita da sempre.
2. `--sm-warn`/`--sm-warn-bg`/`--sm-warn-edge`/`--sm-sep` aggiunte a `tokens.css`, derivate da
   `--s-reserve`/`--s-ink-ghost` con `color-mix` (stessa idea dei quattro token aggiunti nei
   giri precedenti per `CycleStatusBar`/`HealthPanel`).
3. `HistoryModal` e `ProcessusModal` (vedi sotto) disegnano sé stessi con `absolute inset-0` —
   relativo all'ANTENATO posizionato più vicino, che in App.tsx è già grande quanto lo
   schermo. In SERENITY quell'antenato era `<main>` (col suo `padding`), quindi restavano
   chiusi in quella cornice piccola. Un involucro `position:'fixed', inset:0` attorno a
   entrambi, allo stesso punto di montaggio, risolve senza toccare i componenti condivisi.

**Riordino**: il bottone Historique era nell'intestazione, lontano dai comandi di seduta —
spostato PRIMO elemento della barra comandi, prima di "chiudi la seduta"/pausa (« Fermer la
séance et pause doivent être après Historique »).

**PROCESSUS, implementato.** Restava dichiarato aperto (12° giro) perché la sua sorgente in
App.tsx (`useAppInitializer`) governa anche il profilo attivo unico — incompatibile col
flusso a quattro domande di SERENITY. Scritto un caricatore SOLO per i PDF di processo
(server poi IndexedDB, stessa sequenza di `useAppInitializer` senza gli effetti collaterali
sul profilo); `ProcessusModal` stesso montato TALE E QUALE (autosufficiente — salva/tagga/
filtra da sé). Il visore resta un raffinamento dichiarato aperto: un PDF alla volta in una
finestra fissa, non le finestre multiple trascinabili/ridimensionabili di App.tsx
(`activeProcessus`) — una macchina a parte, per un giro futuro se richiesta.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo estesa — History ora si apre a schermo intero, ben formattato,
"Fermer" trovato e funzionante; Processus si apre/chiude correttamente, stato vuoto
leggibile; l'assistente IA ora visibilmente stilizzato (badge d'avviso leggibile, prova che
il fix Tailwind + i nuovi token hanno risolto anche il suo sintomo latente). `git status`:
`src/serenity/Serenity.tsx`, `src/serenity/main.tsx`, `src/serenity/tokens.css`, e il nuovo
`src/serenity/tailwind-compat.css`. EQUILIBRIUM invariato (nessun file fuori da
`src/serenity/` toccato).

---

## Ventiquattresimo giro (20/08/2026) — CAM 2 (PC) spariva nel caso più comune

Segnalato: « non trovo più la camm PC ». CAM 2 era ristretta a `moduleVis.cam2 &&
(avvio.distanza || avvio.solo)` — spariva del tutto in una seduta LOCALE con un preclear
vero, il caso più frequente di tutti. App.tsx non ha questa condizione: mostra CAM 2 ogni
volta che `moduleVis.cam2` è acceso — la webcam locale generica quando non c'è un flusso
remoto (`CameraCerchio` chiama `getUserMedia` da sé, senza bisogno di uno stream esterno), lo
stream vero solo quando `avvio.distanza` lo fornisce. La restrizione era un'invenzione
introdotta qui in un giro precedente, non una scelta di EQUILIBRIUM — tolta, per la stessa
regola di sempre: riprodurre la logica di EQUILIBRIUM, non una versione più prudente
inventata da zero.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo — seduta LOCALE con un PC vero (né SOLO né a distanza), CAM 2 ora
appare correttamente (« caméra hors ligne / refusée » nell'ambiente di test, che non concede
la webcam al browser — il ramo di codice corretto è raggiunto). `git status`: solo
`src/serenity/Serenity.tsx`. EQUILIBRIUM invariato.

---

## Venticinquesimo giro (20/08/2026) — le tabelle per-ciclo nel PDF, dichiarate aperte due giri fa

Chiesto di nuovo: « ed i moduli restanti, li fai? ». Il pezzo dichiarato aperto più grande —
le tabelle CONTACT/NULL/TONE SCALE/MIRROR/ASSESSMENT nel PDF di History — si è rivelato un
wiring, non un porting, rileggendo i motori condivisi.

**La scoperta.** `auditingCyclesRef`/`mirrorCyclesRef`/`toneCyclesRef` (l'elenco DI OGNI
ciclo, non solo l'ultimo) non sono logica di App.tsx: sono dichiarati DENTRO
`useContactNullCycle`/`useMirrorCycle`/`useToneCycle` stessi — gli STESSI motori condivisi
che SERENITY monta da sempre — e restituiti dal hook. `cycles.auditingCyclesRef`,
`mirror.mirrorCyclesRef`, `tone.toneCyclesRef` erano già lì, raggiungibili, semplicemente
mai letti da questo lato. Solo ASSESSMENT resta una vera trasformazione: App.tsx tiene
`assessCyclesRef` nel proprio corpo (non in un hook condiviso) — qui si ottiene la stessa
forma raggruppando `assessItems` per `gruppo` (lo stesso numero che `ZonaAssessment` usa già
per « ×N »).

**`sessionReport.ts`** esteso con le cinque sezioni (stessi colori, stessa selezione di
campi di `generateTextPdf`), più la prova delle lattine e il lag di Ron completo
(`deltaTrend`/`deltaBaseline`/`deltaAdaptive` — anche questi già nel callback
`onLagMeasured`, come `deltaStar`/`deltaStarN` prima di loro, mai letti).

**⚠️ Bug trovato verificando dal vivo, non leggendo il codice**: chiudere la seduta con un
ciclo CONTACT/NULL o MIRROR ancora ARMATO non lo registrava mai nell'elenco — spariva dal
PDF, non "incompleto", proprio ASSENTE. `closeOpenCycleAtEnd()` (dentro
`useContactNullCycle`, condiviso) esiste apposta per questo caso — App.tsx la chiama in
`handleEnd()`, `chiudi()` qui non la chiamava mai. Aggiunta insieme alla chiusura di un
MIRROR ancora armato (`stopMirror()`), PRIMA di leggere i due elenchi per il PDF — altrimenti
il ciclo in corso non è ancora nell'elenco quando lo si legge.

**Quel che resta fuori, dichiarato**: il grafico Q_L (un `<AreaChart>` catturato come
immagine) e il pannello MNA — due pezzi visivi che richiedono la loro stessa macchina di
cattura, non tabellari come il resto. Restano nel PDF stesso come nota, non finti con un
disegno inventato.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo end-to-end — armato un ciclo CONTACT, chiusa la seduta col ciclo
ancora aperto, letto il PDF risultante DIRETTAMENTE da IndexedDB (decodificato da base64,
cercato il testo nei suoi stessi operatori `Tj`): `(cycles d'audition - contact) Tj` seguito
da `(0/1 AS-IS) Tj` — la tabella c'è, il ciclo forzatamente chiuso è registrato come non
completato, esattamente come App.tsx. `git status`: `src/serenity/Serenity.tsx` e
`src/serenity/sessionReport.ts`. EQUILIBRIUM invariato.

---

## Ventiseiesimo giro (20/08/2026) — i quattro metodi e APRI fuori dall'arco, l'assistente dopo GUIDE

Due riordini: « metti i bottoni Contact, Null, Mirror, Tone ed anche OPEN sul lato sinistro
fuori dall'arco, così si ha più spazio per il ciclo stesso » e « la zona API mettila dopo
l'icona GUIDE ».

1. **Barra laterale, nuova.** APRI/CHIUDI LA SEDUTA e i quattro metodi (CONTACT/NULL/MIRROR/
   TONE) erano nella barra comandi orizzontale, sopra il quadrante — la stessa riga dove vive
   anche `SuggerimentoCiclo` (« a che punto sono, cosa devo fare ») quando un ciclo è armato:
   più pillole in quella riga, meno posto per quel testo. Spostati in una colonna verticale
   ancorata al bordo sinistro di `<main>` (`position:absolute`, fuori dal contenitore del
   quadrante), verticalmente centrata. Zero logica nuova — gli stessi `chiudi`/`apri`/
   `cycles.armCycle`/`mirror.armMirror`/`setToneAttivo` di sempre, con le stesse condizioni di
   visibilità, solo spostati. La barra comandi ora ha solo il campo item + lo stato della voce
   + MNA/journal/EP — la richiesta di spazio per il ciclo stesso.

2. **L'assistente IA, dall'intestazione.** Montato nella barra comandi al giro 23 — spostato
   nell'intestazione, subito dopo il bottone Guide (?), come richiesto.

3. **Pausa, accanto a "Fermer la séance".** Segnalato subito dopo, nello stesso giro: « il
   bottone di pausa deve essere vicino al bottone Fermer la séance ». Era rimasta nella barra
   comandi orizzontale quando gli altri quattro l'hanno lasciata — spostata anche lei, subito
   sotto APRI/CHIUDI nella stessa colonna. Stesso stato (`pausata`/`pausaManuale`) di sempre.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo — la barra laterale appare correttamente (CHIUDI LA SÉANCE/PAUSA/
CONTACT/NULL/MIRROR/TONE, verticale, fuori dall'arco, nessuna sovrapposizione), l'arco ha
visibilmente più spazio, l'assistente IA appare nell'intestazione dopo Guide, la pausa
funziona (badge "paused", icona Play, orologio fermo). `git status`: solo
`src/serenity/Serenity.tsx`. EQUILIBRIUM invariato.

---

## Ventisettesimo giro (22/08/2026) — le letture sopra CLOSE SESSION, un bug di click trovato subito, History a due temi

Cinque segnalazioni: « il TA ed il time session mettili sopra CLOSE SESSION, nonché
diagnostica », poi (mentre verificavo dal vivo) « le module History et Processus ne
s'ouvrent pas », « il faut aussi que ces deux modules soient en white ou dark en fonction du
choix effectué », e « CHANGE AUDITOR OR PRECLEAR doit être sous forme d'icône... en haut ».

1. **Le letture, sopra CLOSE SESSION.** Orologio, scelta MUSE/METER/DUE, qualità segnale,
   integrità biometrica, TA/fase/TA totale/velocità — stavano ancorate al fondo del
   quadrante (giro 19). Spostate in cima alla stessa colonna della barra laterale (giro 26),
   impilate in verticale invece che in riga (la colonna è larga 148px, non tutto l'arco).
   Zero logica nuova, solo la disposizione.

2. **BUG BLOCCANTE trovato subito dopo, verificando dal vivo**: History e Processus non si
   aprivano più. La nuova barra laterale (giro 26) è alta quanto quasi tutta la pagina per
   poter CENTRARE i suoi bottoni — ma un `<div>` copre l'intero rettangolo anche dove non
   c'è nulla da vedere, e quel rettangolo si sovrapponeva alle icone Historique/Processus
   della barra comandi appena sopra (`top:118` cadeva proprio lì): i click finivano rubati
   da questo contenitore invece di raggiungere le icone — la STESSA famiglia di bug degli
   « angoli trasparenti » delle camere, trovata un giro fa. `pointerEvents:'none'` sul
   contenitore, riacceso `'auto'` su ogni bottone vero (i due di apri/pausa, i quattro
   metodi, il selettore MUSE/METER/DUE).

3. **`HistoryModal` era sempre scuro, anche in EQUILIBRIUM** — la sua stessa classe lo dice
   (`.nest-dark-modal`): non legge mai `useUiStore`, a differenza di `ProcessusModal` (già
   correttamente bicromo, verificato). Non essendo possibile toccare quel file condiviso,
   nuovo `serenity/historyLight.css`: un override mirato a `.nest-dark-modal` e alle sue
   classi Tailwind interne (`text-slate-*`, `bg-white/*`, `bg-slate-*`, `border-*`, …),
   attivo SOLO sotto `:root[data-tema='chiaro']` — la stessa preferenza di `tokens.css` — con
   un pezzo di selettore in più che batte in specificità le regole originali (tutte
   `!important`) a prescindere dall'ordine nel DOM. Il velo di fondo dietro il pannello resta
   scuro apposta (uno scrim, come quello di `CreditsModal`/`GuideModal`); un piccolo badge
   secondario (« archive N · autres N ») ha colore scritto in linea, non in una classe —
   resta a basso contrasto in chiaro, dichiarato qui invece che finto sistemato.

4. **« Change auditor or preclear », ora un'icona.** Era un link di testo isolato in fondo
   alla barra comandi (« ← changer d'auditeur ou de préclair »). `UserCog`, dentro la stessa
   pillola Auditor/PC/Expert in alto, PRIMA dell'icona di salvataggio — la stessa
   `ricomincia()` di sempre.

**Non verificabile in questo ambiente** (segnalato nello stesso messaggio, nessun MUSE/Meter
vero disponibile qui): « les réactions ne s'affichent pas », « journal/santé/intégrité pas
actifs ». Con "sans instruments" (l'unico modo di testare qui) Santé Système e l'integrità
biometrica restano correttamente muti — nessuno strumento, nessuna lettura da mostrare, per
design (mai un controllo bugiardo). Il giornale invece appariva regolarmente
("journal · N ligne(s)") in ogni prova. Resta aperto: serve sapere se questi sintomi si
vedono anche CON un MUSE/Meter vero collegato, per continuare a cercarli con qualcosa di più
di una lettura del codice.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo estesa — le letture appaiono sopra CLOSE SESSION, History e
Processus si aprono di nuovo in entrambi i test (icone cliccabili), History passa
correttamente da scuro a chiaro col selettore tema (Processus già lo faceva), l'icona
cambia-persone funziona (riporta a "chi audita?"). `git status`: `src/serenity/Serenity.tsx`,
`src/serenity/main.tsx`, e il nuovo `src/serenity/historyLight.css`. EQUILIBRIUM invariato.

---

## Ventottesimo giro (22/08/2026) — chiusura di History/Processus in stile SERENITY, tutto in alto vicino alla versione, i moduli solo da CONFIG

Otto segnalazioni nello stesso messaggio:

1. **« Ready for session » resta sempre DARK, deve seguire il tema chiaro.** `ThetaReadyCheck`
   (le boîtes) e `MetabolicCheck` (il respiro guidato del MUSE) — condivisi con EQUILIBRIUM —
   non leggono mai `useUiStore`: ogni colore è un RGBA scritto in linea, senza NESSUNA classe
   a cui appendere un override (a differenza di `HistoryModal`, che almeno riusa classi
   Tailwind). Nuovo `serenity/readyCheckLight.css`: un involucro proprio
   (`.ser-ready-wrap`, attorno ai due componenti in `Serenity.tsx`) più selettori
   `[style*="rgba(…"]` a sottostringa — l'unico gancio possibile senza toccare il file
   condiviso. Ritinti i due pannelli (da vetro nero a vetro chiaro) e le famiglie di testo
   "quasi bianco" (due livelli di enfasi, non ogni sfumatura di alfa — la stessa
   semplificazione già fatta in `historyLight.css` sulle classi Tailwind). **Dichiarato
   aperto**: i bordi/sfondi in `rgba(255,255,255,·)` (il "vetro" scuro delle carte e degli
   anelli del respiro) restano quelli, solo ritinti come bordo — su un pannello ora chiaro
   sono più tenui, non invisibili come sarebbe stato il testo lasciato intatto. Non
   verificabile dal vivo in questo ambiente: la schermata si apre solo a Meter/MUSE
   realmente collegati.

2. **Il test del MUSE non deve rifarsi se il soffio del Meter è già riuscito.** Nuovo
   `useEffect` in `Serenity.tsx` (stesso schema di quello già presente per la connessione
   fallita a metà controllo: mai uno stato scritto durante il render): quando
   `thetaReadyDone` e `theta.breathOk` sono entrambi veri, salta `MetabolicCheck` e apre la
   seduta direttamente (`avviaSedutaConProntezza(null)`) — la stessa prova non si richiede
   due volte con due strumenti diversi. Copre sia il caso appena fatto (`ThetaReadyCheck`
   qui) sia quello fatto PRIMA in `PannelloMeter`, all'apertura della seduta.

3. **MUSE/METER/DUE, di nuovo sotto l'ago.** Era stato spostato nella barra laterale insieme
   a Contact/Null/Mirror/Tone (giro 26) — ma è la scelta di quale AGO guardare, non un
   metodo di ciclo: rimesso come overlay assoluto dentro il quadrante, appena sotto l'arco.

4. **Ora reale, sopra il tempo di seduta.** Nuovo componente `OraReale` (un orologio che si
   aggiorna ogni secondo, `Clock` di lucide) nella colonna della barra laterale, appena
   sopra `<Timer/> {orologio(tempo)}` — due informazioni diverse (che ore sono / da quanto
   dura la seduta), ciascuna con la SUA icona.

5. **Verifica di « configure the meter ».** Letto `PannelloMeter.tsx` per intero: usa solo
   token `var(--s-*)` (quindi già adattivo al tema da solo), chiama direttamente le funzioni
   di `useThetaMeter` (zero logica propria, come dichiara la sua stessa intestazione),
   monta correttamente `onFatto={() => setMeterSetupAperto(false)}`. Nessun difetto trovato
   nel codice. Non verificabile end-to-end in questo ambiente: serve un Theta-Meter vero
   collegato via WebHID per aprire davvero il cassetto (gated `meterC &&`).

6. **I bottoni di chiusura di History/Processus, in stile SERENITY.** Erano l'interruttore a
   levetta di EQUILIBRIUM (`GlassCollapseToggle`, condiviso con moltissimi altri pannelli —
   MNA, salute, R&I, biometria, journal, EP: cambiarlo avrebbe cambiato anche loro). Nuovo
   `serenity/modalCloseButtons.css`: due involucri propri (`.ser-history-wrap`,
   `.ser-processus-wrap`) più un aggancio sulle 5 traduzioni esatte di `tip_close`
   (`src/i18n.tsx`) — l'unico modo di riconoscere QUEL bottone e non un altro bottone
   titolato nello stesso pannello, senza toccare il componente condiviso. Il bottone resta lo
   stesso elemento (`onClick` intatto): solo ridipinto in un cerchio di vetro `.s-glass
   s-glass-btn`, con una « × » al posto della pista/pollice. Verificato dal vivo: 34×34px,
   `border-radius:999px`, `::after` con la « × » — su entrambi i pannelli.

7. **Tutti i bottoni statici, vicino al numero di versione.** History e Processus (gli ultimi
   due bottoni statici rimasti fuori dall'intestazione — Contact/Null/Mirror/Tone/OPEN/PAUSA
   restano nella barra laterale, richiesta separata ed esplicita) spostati dalla barra comandi
   sotto il quadrante all'intestazione, subito dopo `{__SERENITY_VERSION__}`. A 1280px di
   larghezza l'intestazione va comunque a capo (`flexWrap:'wrap'`, comportamento preesistente:
   c'era già troppo contenuto — tema/lingua, pillola Auditor/PC, le connessioni, CONFIG,
   Guide, assistente — per stare su una riga a quella larghezza anche PRIMA di questo giro);
   su una finestra più larga i due bottoni stanno sulla stessa riga del nome/versione, come
   segnalato.

8. **ASSESSMENT/System Health/Journal/MNA, solo da CONFIG.** Rimossi i tre bottoni che li
   aprivano dalla barra comandi (MNA, "salute sistema", il conteggio-journal cliccabile) —
   ora si vedono SOLO quando il relativo interruttore in CONFIG è acceso
   (`moduleVis.mna`/`.health`/`.journal`, lo stesso store già esistente), come già faceva
   `ZonaAssessment`. Le loro chiusure interne spengono direttamente l'interruttore
   (`onHide={() => setModuleVis(v => ({ ...v, health: false }))}`, lo stesso schema già usato
   da `HealthPanel` in App.tsx) invece di uno stato locale separato.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo (profilo TEST) — History e Processus si aprono dall'intestazione,
i due bottoni di chiusura sono ora cerchi di vetro SERENITY (34×34px, confermato via
`getComputedStyle`), nessun errore in console oltre a fallimenti di rete attesi (nessun
server P2P/hardware reale in questo ambiente). `git status`: `src/serenity/Serenity.tsx`,
`src/serenity/main.tsx`, tre file nuovi (`modalCloseButtons.css`, `readyCheckLight.css`, e
`historyLight.css` già esistente, invariato). EQUILIBRIUM invariato.

---

## Ventinovesimo giro (22/08/2026) — il velo di MetabolicCheck ritinto, i cerchi delle camere leggibili in chiaro, EP sotto TONE, Santé/Journal a destra dell'arco

Cinque segnalazioni:

1. **« Ouvrir la séance resta in BLACK anche in LIGHT »** — il giro scorso aveva già ritinto i
   due pannelli di `ThetaReadyCheck`/`MetabolicCheck` (`readyCheckLight.css`), ma aveva
   lasciato scuro apposta il VELO a tutto schermo di `MetabolicCheck` (`rgba(0,0,0,0.8)`),
   seguendo l'analogia con lo scrim di `HistoryModal`. Analogia sbagliata per questa forma:
   `HistoryModal` copre quasi tutto lo schermo (il velo è un filo ai bordi), `MetabolicCheck`
   è una carta piccola (460px) al centro di un velo grande — l'impressione resta "schermo
   nero" anche col pannello già corretto. Nuova regola in `readyCheckLight.css`: il velo si
   ritinge anche lui, con la stessa espressione già usata da `scegliStrumento`
   (`color-mix(in srgb, var(--s-ground) 80%, transparent)`). Verificato via test sintetico
   (nessun MUSE/Meter vero in questo ambiente): il colore risolto è ora quello del fondo di
   SERENITY, non nero.

2. **« Hai ancora i bottoni di EQUILIBRIUM in SANTE SYSTEME »** — `HealthPanel` (condiviso)
   riduce/espande sé stesso con lo stesso `GlassCollapseToggle` di History/Processus (giro
   scorso). Nuovo `healthPanelButtons.css`, stessa tecnica: involucro `.ser-health-wrap` +
   le traduzioni di `tip_collapse`/`tip_expand` (due stati, due glifi: − quando si può
   ridurre, + quando si può espandere, invece della singola × di una chiusura). Verificato
   via test sintetico: 30×30px, cerchio di vetro, glifo corretto in entrambi gli stati.

3. **« Quando si nasconde una camm deve vedersi meglio in LIGHT — la scritta sempre dentro il
   cerchio »** — due difetti distinti in `CameraCerchio.tsx`/`Cerchio.tsx` (entrambi SOLO
   SERENITY, non condivisi: modificati direttamente). Il cerchio "affondato" di una camm
   nascosta (`vetroDaSpenta`) non aveva ombra (`boxShadow:'none'`, pensato per un modulo
   "previsto ma non montato") — in chiaro `--s-disc-sunk` è quasi lo stesso colore del fondo:
   senza ombra spariva. Ora `vetroDaSpenta` prende un'ombra vera (`var(--s-shadow)`), la sola
   eccezione a `spenta` (verificato: nessun altro cerchio in SERENITY usa `vetroDaSpenta`,
   nessun effetto collaterale altrove). La didascalia (nome della camera) era FUORI dal
   cerchio, una riga sotto — spostata DENTRO: centrata quando collassata (l'unica cosa scritta
   su un disco vuoto), un'etichetta in alto quando espansa (il badge LIVE, se c'è, scende per
   fargli posto). Verificato dal vivo: "CAM 2 (PC)" leggibile dentro il cerchio in entrambi
   gli stati, in tema chiaro.

4. **« Il bottone EP deve essere posizionato sotto TONE »** — spostato dalla barra comandi
   sotto il quadrante alla barra laterale, subito dopo i quattro metodi (stesso stile a
   pillola bordata). Resta visibile per tutta la seduta aperta (non solo quando nessun ciclo
   è armato, a differenza dei quattro metodi: un EP si registra in qualunque momento).
   Verificato dal vivo: EP compare sotto TONE nella colonna.

5. **« Posiziona Santé Système, Journal de session a destra dell'arco »** — erano ancorati a
   tutta larghezza in fondo al quadrante (`left:16, right:16`), sopra l'arco stesso. Ora
   ancorati solo a destra (`right:32`, lo stesso bordo delle camere), larghezza fissa (380px)
   invece che a tutto campo. MNA non è stato toccato (non era nella segnalazione, resta
   ancorato come prima). Verificato dal vivo: il pannello journal appare come un riquadro
   stretto in basso a destra, non più a tutta larghezza.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo (profilo TEST) — velo di MetabolicCheck e toggle di Santé Système
verificati via test sintetico (nessun hardware vero disponibile qui), il resto verificato
sulla seduta reale: EP sotto TONE, journal ancorato a destra, camm PC leggibile da collassata.
Nessun errore in console. `git status`: `src/serenity/Serenity.tsx`, `src/serenity/main.tsx`,
`src/serenity/CameraCerchio.tsx`, `src/serenity/Cerchio.tsx`, `src/serenity/readyCheckLight.css`,
un file nuovo (`healthPanelButtons.css`). EQUILIBRIUM invariato.

---

## Trentesimo giro (22/08/2026) — assessment/Santé/journal in colonne vere fuori dall'arco, l'arco si restringe, le letture nell'angolo, l'intestazione compatta a sinistra

Quattro segnalazioni, la più grande di questo giro:

1. **« La zone assessment doit être aussi à gauche, comme Système Santé/Journal, mais tous en
   dehors de la zone arc, qui se réduit dès qu'un module apparaît. Les zones modules doivent
   être larges de moitié »** — la riscrittura più grande: assessment/Santé/journal
   galleggiavano `position:absolute` SUL quadrante (due giri fa erano stati ancorati a un
   angolo/lato, ma restavano fuori dal FLUSSO — l'arco non sapeva che esistevano). Ora
   `<section>` è una riga a tre colonne vera: assessment a sinistra, l'arco al centro
   (`flex:1`, si restringe da sé), Santé/journal a destra — ciascuna colonna aperta prende
   metà della riga (`width:'50%'`), un terzo a testa se sono aperte insieme (altrimenti
   l'arco sparirebbe: trovato verificando dal vivo). `ZonaAssessment.tsx` non è più
   `position:absolute` (zero logica toccata, solo il contenitore).
   **Due bug trovati per strada, nello stesso giro**:
   - Le colonne finivano SOTTO la barra laterale (OPEN/PAUSA/CONTACT/…): `<section>` non
     aveva mai avuto bisogno di uno spazio riservato per lei finché tutto era assoluto.
     `paddingLeft` su `<section>`.
   - `<section>` aveva un'ALTEZZA DI GRIGLIA MINUSCOLA (111px su 900): `gridTemplateRows`
     di `<main>` (`'auto 1fr auto'`) era scritto per l'ordine header/arco/comandi, ma i
     comandi si erano spostati SOPRA l'arco in un giro passato senza aggiornare il modello —
     la riga elastica (`1fr`) andava ai comandi, non all'arco. Restava invisibile perché
     l'arco (`aspect-ratio`) trabocca dal proprio riquadro senza saperlo. Corretto:
     `'auto auto 1fr'`.
   - **Segnalato ANCORA, a verifica in corso**: « le zones devono essere sotto les cams » — le
     camere (`position:absolute, top:16, right:32`) e la nuova colonna destra occupavano LA
     STESSA area. `paddingTop` sulla colonna destra, pari alla vera altezza dello stack delle
     camere (una o due, aperte o collassate) — le tiene sempre sotto.

2. **« Les boutons History et Processus après le bouton langue »** — spostati da subito dopo
   il numero di versione a subito dopo `SelettoreLingua`.

3. **« Les boutons de haut doivent être justifiés à gauche à côté du numéro de build »** — lo
   spazio elastico (`flex:1`) che spingeva tema/lingua/pillola/connessioni verso destra è
   stato spostato in fondo all'intestazione (dopo l'assistente IA): ora tutto si accoda a
   sinistra, il vuoto va tutto a destra.

4. **« L'horloge, le temps de session, le TA et la somme de TA doivent être inscrits en haut à
   gauche dans la zone de l'arc »** — l'intero blocco letture (ora reale, tempo di seduta,
   badge pausa, segnale/integrità, TA/fase/TA totale/velocità) spostato dalla barra laterale
   all'angolo in alto a sinistra DENTRO il riquadro dell'arco stesso — lo stesso posto in cui
   stava `ZonaAssessment` prima di diventare una colonna. `--s-ink-faint` al posto di
   `-ghost` (due punti), stessa ragione già scritta per il giornale: questo riquadro ha il suo
   schermo scuro apposta in tema scuro.

**Osservazione, non richiesta oggi**: con TUTTI i moduli accesi insieme (l'impostazione di
fabbrica — `SERENITY_MODULES_DEFAULT` li accende tutti), assessment (33%) + Santé/journal
(33%) lasciano l'arco molto stretto, e MNA (che continua a galleggiare SUL quadrante, mai
toccato) può arrivare a coprirlo quasi del tutto a quella taglia. Con un solo modulo alla
volta (l'uso più comune, gli altri spenti da CONFIG) l'arco resta ampio — verificato dal vivo.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo estesa (profilo TEST, resize della finestra) — le tre colonne, il
`paddingLeft`/`paddingTop` che le tengono fuori da barra laterale e camere, l'intestazione
compatta a sinistra, le letture nell'angolo dell'arco. Nessun errore in console oltre ai
fallimenti di rete attesi. `git status`: solo `src/serenity/Serenity.tsx` e
`src/serenity/ZonaAssessment.tsx`. EQUILIBRIUM invariato.

---

## Trentunesimo giro (22/08/2026) — l'assessment sotto EP, l'arco riprende lo spazio, le camere più piccole, il MUSE non indossato si legge, i due bottoni contano

Cinque segnalazioni:

1. **« La zona assessment... deve stare sotto il bottone EP, rimonta l'insieme dei bottoni
   CLOSE THE SESSION... quindi la zona arco deve occupare tutto lo spazio liberato »** —
   l'assessment non è più una colonna nella riga a fianco dell'arco (giro scorso): è tornata
   nella barra laterale, sotto i sette bottoni (OPEN/PAUSA/CONTACT/NULL/MIRROR/TONE/EP), nello
   stesso involucro allargato apposta (« larga la metà »: `width:'50%', maxWidth:560` sul
   contenitore, ma un involucro STRETTO da 148px avvolge SOLO i bottoni, così non si allargano
   anche loro). Nella riga dell'arco è rimasta solo la colonna destra (Santé/journal): senza
   assessment a contendersi lo spazio, l'arco (`flex:1`) la riprende tutta — non più due terzi,
   tutta. `paddingLeft` di `<section>` ora segue la STESSA percentuale della barra laterale
   (`calc(50% + 40px)` quando l'assessment è aperta, altrimenti il vecchio valore fisso), così
   la riga dell'arco comincia sempre dopo di lei qualunque sia la sua vera larghezza.

2. **« System Health deve essere larga la metà e si deve vedere tutta »** — `maxHeight:'78%',
   overflowY:'auto'` tagliava il pannello a metà: tolto, il pannello si vede per intero. La
   larghezza (metà riga) è la stessa della colonna destra, condivisa con journal — « la stessa
   larghezza che Santé Système » era già vera (stesso genitore, nessuna larghezza propria).

3. **« La zona camm deve essere di 1/5 più piccola »** — CAM 2 (PC) 340→272, CAM 1 (auditor)
   213→170 (×0,8 su entrambe, stessa proporzione). Aggiornata anche `camStackH` (lo spazio
   riservato sopra la colonna destra, v. giro scorso) con le nuove taglie.

4. **« Non appare quando il MUSE non è indossato » / « quando spengo il MUSE appare sempre
   connesso »** — due segnalazioni, due esiti diversi.
   - **BUG TROVATO e corretto**: l'avviso "non indossato" usava `t('ser_meter_disconnected')`
     ("meter scollegato") — la chiave SBAGLIATA, copiata dal Meter, per un avviso che riguarda
     il MUSE. App.tsx ha la chiave giusta (`muse_tip_not_worn`), tradotta nelle 5 lingue, mai
     usata qui. Anche `dettaglio` mostrava solo un "⚠" muto — ora la PAROLA (`muse_not_worn`),
     come fa App.tsx (« MUSE · not worn »), leggibile senza passare il mouse sopra.
   - **Non risolto, richiede hardware vero**: la disconnessione (« resta sempre connesso da
     spento ») non è nel codice di SERENITY — `useMuseConnection`/`useMuseContactGate` sono gli
     STESSI hook condivisi di App.tsx, chiamati con gli stessi parametri (confrontati riga per
     riga, nessuna differenza). Il meccanismo che dovrebbe correggersi da solo è dentro l'hook
     condiviso: un watchdog che declassa `museConnection` a "disconnesso" dopo 6 secondi senza
     nuovi campioni EEG (commento nel codice: « muse-js' own disconnect event doesn't always
     fire, so the badge would otherwise lie forever »). Non modificato — è un file condiviso, e
     senza un MUSE vero qui non posso verificare se il guasto è davvero nella finestra dei 6
     secondi o altrove. Serve sapere se lo stesso sintomo appare ANCHE in EQUILIBRIUM: se sì, è
     l'hook condiviso (da toccare con più cautela, e con la tua conferma); se solo in SERENITY,
     c'è dell'altro da trovare qui.

5. **« I bottoni History e Processus devono indicare il numero di elementi »** — un pallino
   numerico in alto a destra su ciascun bottone: `getSessionsByProfile` (la stessa funzione
   sincrona già usata da `HistoryModal` per lo stesso conto) per History, `processusPdfs.length`
   per Processus. Assente quando il conto è zero, per non gridare un numero vuoto.

**Rimandato a un prossimo giro** (segnalato ma non ancora fatto in questo): « i bottoni
MUSE/METER/NO INSTRUMENTS devono essere un solo bottone con le tre icone » (un cambio di
interazione più grande — tre indicatori indipendenti, ciascuno col proprio stato/colore/click,
da fondere in un unico controllo segmentato senza perdere nessuna delle tre informazioni) e
« non vedo il bottone SAVE CONFIGURATION in CONFIG » (esiste già, ma SOLO nella pillola
dell'intestazione, visibile solo a seduta chiusa — da capire se serve anche dentro CONFIG o se
basta saperlo).

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo (profilo TEST) — assessment sotto EP, arco più largo, camere più
piccole, nessun errore in console oltre a fallimenti di rete attesi. Il MUSE-non-indossato e la
disconnessione non sono verificabili senza hardware vero. `git status`: solo
`src/serenity/Serenity.tsx`. EQUILIBRIUM invariato.

---

## Trentaduesimo giro (22/08/2026) — assessment stretta come i bottoni, System Health quanto le camm, MUSE/METER/NONE in un solo bottone, l'arco quasi tocca i bordi, un bug di sovrapposizione trovato per strada

Cinque segnalazioni:

1. **« Assessment deve essere largo quanto i bottoni Contact...ecc »** — tornata da « larga la
   metà » (giro scorso) a 148px, la STESSA larghezza dei sette bottoni sopra di lei nella barra
   laterale. L'involucro esterno che li conteneva entrambi è tornato anche lui a 148px fisso
   (non più `50%`/max 560).

2. **« System Health deve essere della stessa larghezza che le camm »** — non più a metà riga:
   la colonna destra (Santé/journal, sotto le camere) è ora larga 272px, la stessa di CAM 2
   (la più grande delle due).

3. **« I bottoni MUSE, Meter, No instrument devono essere un solo bottone con solo le icone »** —
   le tre pillole `IndicatoreConnessione` (punto + icona + PAROLA, la STRUMENTI davanti) sono
   diventate UNA pillola sola, tre icone dentro: ciascuna resta il proprio bottone/stato/click,
   ma senza più etichette sempre visibili — la frase intera (stato, percentuale batteria,
   « non indossato »…) resta nel `title`, letta al passaggio del mouse. Il colore del punto di
   stato è la STESSA mappa di `IndicatoreConnessione` (`COLORE_PUNTO`, ora esportata da lì:
   una sola fonte, non duplicata).

4. **« La zona arc deve quindi allargarsi »** — conseguenza diretta delle prime due: con le due
   colonne più strette (148+272 invece di metà riga ciascuna), l'arco (`flex:1`) riprende lo
   spazio da sé, senza bisogno di codice a parte.

5. **BUG TROVATO per strada, verificando dal vivo**: « i bottoni a sinistra non devono
   sovrapporsi alle scritte in alto » — vero, e la causa era un `top` FISSO (118px) sulla barra
   laterale, tarato per UNA combinazione di contenuto di `<header>`+`.ser-comandi` sopra di
   lei; con l'assistente IA o la riga dell'item presenti quel bordo vero era più in basso, e la
   barra ci finiva sopra. Prima corretto con un `ResizeObserver` — poi trovato, sempre
   verificando dal vivo, che in QUESTO ambiente di test i suoi callback non arrivano MAI
   (confermato con un secondo `ResizeObserver` di prova, anche su un ridimensionamento vero
   della finestra): non ci si può appoggiare a un meccanismo silenzioso qui. Sostituito con una
   misura reale ad ogni resa (`useLayoutEffect` senza lista di dipendenze, una guardia
   `prev === nuovo` per non ridisegnare a vuoto) — verificato dal vivo: `top` passa da 118 a
   240px una volta aperta la seduta, e "FERMER LA SÉANCE" non copre più "ÉCRIS OU DIS L'ITEM".

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo — un avviso nuovo
di `useLayoutEffect` risolto con un `eslint-disable` motivato, non ignorato), `vitest run`
639/639, verifica dal vivo estesa (profilo TEST, con un test isolato di `ResizeObserver` per
diagnosticare il bug del punto 5). Nessun errore in console oltre a fallimenti di rete attesi.
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/IndicatoreConnessione.tsx`.
EQUILIBRIUM invariato.

---

## Trentatreesimo giro (22/08/2026) — il quinto metodo APERTO, il TA a due/una lattina scritto, l'assessment allargata, la camm collassata con un'icona

Otto segnalazioni:

1. **« Non si può scrivere il nome della configurazione della session in alto »** — verificato
   dal vivo con un click preciso (via `ref`, non coordinate a stima) sul campo: SCRIVE
   correttamente («abc» digitato, comparso, «enregistrer» si è riattivato). Non un bug di
   codice — probabile click mancato sul campo piccolo dentro il cassetto, non sull'input.
   Nessuna modifica: il meccanismo funziona.

2. **« La voce non è disponibile nell'applicazione mac, ma funziona in Chrome? »** —
   `useVoiceItem.ts` ha già, dal 19/08 (`e5c4b3a`, un giro precedente a questa finestra), la
   STESSA cascata a tre motori di App.tsx (Electron: nativo macOS → Whisper; browser: Web
   Speech → Whisper) — non un difetto trovato oggi. Se il sintomo persiste sull'ultima build,
   serve sapere se: (a) macOS ha davvero concesso i permessi "Riconoscimento vocale" e
   "Microfono" all'app (Impostazioni di Sistema → Privacy e sicurezza), e (b) lo stesso Chrome
   ripiega su Web Speech con successo sulla STESSA macchina — senza hardware/microfono reale
   qui non è verificabile oltre la lettura del codice.

3. **BUG TROVATO — « la zona ASSESSMENT non mostra il bottone »**: a 148px (larga quanto i
   bottoni CONTACT/…, dal giro precedente) il selettore di vista ASSESSMENT/R&I·MANUALE non
   ci stava — il secondo bottone restava tagliato a una lettera. Portata a 272px (la stessa
   larghezza già scelta per Santé Système/journal a destra — colonna gemella): i bottoni
   sopra restano a 148px nel loro involucro proprio, l'assessment prende la larghezza intera.
   Verificato dal vivo: entrambi i bottoni ora interi, affiancati.

4. **« Manca la zona LIBRE sotto TONE »** — `engine/sessionMode.ts` conta CINQUE metodi, non
   quattro: CONTACT/NULL/MIRROR/TONE più `free` (App.tsx lo chiama "APERTO": « libero suonava
   come "senza regole" », la sua nota — nessuna sequenza ciclica, solo l'ago). SERENITY lo
   calcolava già (`const mode`, diventa `'free'` quando nessuno degli altri è armato) ma non
   lo mostrava mai. Aggiunta una quinta pillola, sempre "attiva" (nessun bottone: non c'è
   nulla da armare, mode è già lì), stessa lingua visiva dell'attivo di App.tsx. Verificato
   dal vivo: "OUVERT" compare sotto TONE, sempre in evidenza quando nessun ciclo è armato.

5. **« In SCALA la parte con la scala del tono deve essere più larga verso il bordo esterno »**
   — l'involucro di `ToneColumn` (SERENITY-only, il componente resta condiviso e intatto) era
   260px come App.tsx — ma lì a destra con più margine, qui a sinistra vicino al bordo, coi
   nomi dei livelli strettissimi. Portato a 320px. Verificato dal vivo.

6. **« COSA INDICA sotto il TA la freccia con il numero? »** — domanda, non un difetto: `TA
   X.XX` è la lettura di RIPOSO (il braccio dell'ago, `theta.ta`); la freccia `→ Y.YY`
   (`theta.taNow`) compare SOLO quando il valore ADESSO è diverso da quello di riposo — dice
   "l'ago si sta muovendo verso questo numero", non ancora assestato.

7. **BUG TROVATO — « non vedo scritto la differenza fra TA a due cans ed una »**: App.tsx
   scrive SEMPRE su quale base poggia il TA mostrato — "TA · 2 lattine" / "TA · 1 lattina → 2"
   (scarto misurato) / "TA · 1 lattina − 1 div." (scarto non misurato, prudenza) — lo stesso
   numero a vedersi vuol dire tre cose diverse. `tone.taMostrato` (`useToneCycle`, condiviso,
   la STESSA funzione `taToTwoCans`) esisteva già nel ritorno del motore, mai letto in
   SERENITY. Aggiunta la stessa didascalia, sotto la lettura TA del Meter.

8. **« Quando la camm si nasconde, deve esserci l'icona in più della scritta »** — `VideoOff`
   (lucide, la stessa famiglia grafica di SERENITY) sopra la didascalia, nel cerchio
   collassato. Verificato dal vivo: icona + "CAM 2 (PC)" entrambe leggibili nel disco chiuso.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo estesa (profilo TEST) — assessment a due bottoni interi, "OUVERT"
sotto TONE, scala del tono più larga, camera collassata con icona. Nessun errore in console
oltre a fallimenti di rete attesi. `git status`: `src/serenity/Serenity.tsx`,
`src/serenity/CameraCerchio.tsx`. EQUILIBRIUM invariato.

---

## Trentaquattresimo giro (23/08/2026) — Basic/Expert un interruttore vero, la trasparenza sulle scritte, il fondo dell'arco trasparente, MNA sotto l'arco

Sette segnalazioni:

1. **« Non si può scrivere il nome della configurazione... VERIFICA LA LOGICA »** — verificato
   DUE VOLTE dal vivo, sui DUE campi che esistono (la pillola in alto vicino a Processus, e lo
   stesso campo dentro « con che cosa si audita? »): entrambi scrivono correttamente con un
   click preciso sul campo. Nessun bug trovato nel codice — resta aperto se il sintomo persiste
   sulla build reale, con più dettagli su come riprodurlo.

2. **« Devi anche permettere di schiacciare su expert per passare in normale, e viceversa »** —
   bug reale: il tag "esperto" era un `<span>` muto, visibile SOLO quando esperto, nessun modo
   di tornare indietro se non rifacendo l'avvio. Ora un interruttore vero, sempre visibile
   (icona+parola cambiano insieme), stesso principio del selettore di `Sidebar.tsx` in
   EQUILIBRIUM (`onClick` che capovolge lo stato). Verificato dal vivo: clic su "basique" →
   "expert", e viceversa, il pannello CONFIG appare/sparisce di conseguenza.

3. **« Cambia Normal in Basic »** — le 5 traduzioni di `ser_normal`/`ser_auto_normal`
   (SERENITY-esclusive, verificato: nessun uso in App.tsx) da "Normal"/"Normale" a
   "Basic"/"Basique"/"Base"/"Básico"/"Grundläggande". Nuova chiave `ser_normal_tag` (com'era già
   `ser_expert_tag`) per l'etichetta breve nella pillola.

4. **« La trasparenza si può modificare ma non agisce sulle scritte »** — `uiAlpha` arrivava
   SOLO a `Cerchio.tsx` (le due camere). Nuova variabile CSS `--s-ui-alpha` su `<html>` (stesso
   meccanismo di `data-tema`), letta da `.s-glass` come `opacity` — ora copre il pannello E il
   testo che porta, ovunque compare quella classe. Verificato dal vivo via `getComputedStyle`:
   45% sul cursore → `opacity:0.45` su un pannello `.s-glass` reale.

5. **« In CONFIG non c'è il bottone di SAUVEGARDER, allora che c'è scritto... »** — un paragrafo
   spiegava (giustamente) perché il salvataggio delle disposizioni non esiste in SERENITY, ma
   leggeva come l'etichetta di un bottone assente. Tolto dalla superficie, la spiegazione resta
   nel commento del file per chi legge il codice.

6. **Il fondo della zona arc, trasparente** — in chiaro era `var(--s-ground)`, lo stesso colore
   della pagina ma PIENO: con uno sfondo personalizzato (CONFIG → importa un'immagine) copriva
   comunque l'immagine con un rettangolo opaco. Ora `transparent` per davvero, SOLO in chiaro —
   in scuro resta il gradiente vero (l'ago vi disegna in colori chiari, pensati per un fondo
   scuro: trasparente diventerebbero illeggibili).

7. **Il MNA, sotto l'arco invece che sopra** — `PannelloMna` si ancorava `position:absolute`
   DENTRO il riquadro dell'arco (`bottom:16` — la sua nota lo dice: « ancorato in fondo al
   pannello dello strumento »), coprendone il fondo. `PannelloMna` non è toccato: cambia
   l'involucro che lo ospita, ora un fratello dell'arco (non un figlio) nella stessa colonna,
   diventata `flexDirection:'column'` per impilarli — lo spazio c'è perché l'arco
   (`aspect-ratio`) quasi mai riempie tutta l'altezza disponibile. Verificato dal vivo: MNA
   appare chiaramente sotto il quadrante, non più sopra.

**Non ancora verificabile senza hardware vero**: la voce nell'app Mac (v. giro precedente).

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo estesa (profilo TEST) — interruttore Basic/Expert nei due sensi,
trasparenza confermata via DOM, fondo dell'arco trasparente, MNA sotto l'arco, "OUVERT" ancora
presente. Nessun errore in console oltre a fallimenti di rete attesi. `git status`:
`src/i18n.tsx` (solo chiavi `ser_*`, verificato nessun uso in App.tsx), `src/serenity/
PannelloConfig.tsx`, `src/serenity/Serenity.tsx`, `src/serenity/tokens.css`. EQUILIBRIUM
invariato nel comportamento (i18n condiviso tocca solo vocabolario SERENITY).

---

## Trentacinquesimo giro (23/08/2026) — SOLO non più doppio, il nome della configurazione si salva da sé, le letture del TA spiegate, la finestra del meter non esce più dallo schermo, le zone col fondo della pagina

Sette segnalazioni:

1. **« SOLO è scritto due volte »** — bug reale: `ser_solo_sub` valeva letteralmente "SOLO",
   la stessa parola dell'etichetta sopra — mai stato un sottotitolo vero. La scelta gemella
   ("Avec un préclair") non ne ha mai avuto uno: tolto anche a SOLO, simmetria invece di
   inventare un testo che prima non c'era.

2. **« Non è chiaro che devi schiacciare su save... naturalmente si schiaccia OUVRIR UNE
   SÉANCE »** — invece di spiegare meglio un gesto in più, tolto il gesto in più: scrivere un
   nome e poi premere OUVRIR UNE SÉANCE ora salva la configurazione DA SÉ, senza dover trovare
   e premere "enregistrer" a parte. Verificato dal vivo: nome scritto, seduta aperta senza
   toccare "enregistrer", la configurazione appare comunque nell'elenco delle sedute
   registrate al riavvio. Aggiunto anche INVIO-per-salvare e `autoFocus` sul campo gemello
   nella pillola in alto (che resta un salvataggio A PARTE, per rinominare una configurazione
   senza aprire subito una seduta).

3. **« La pillola in alto non lascia scrivere... VERIFICA LA LOGICA »** — ritestato ancora,
   stavolta anche il campo dentro « con che cosa si audite? » (typing "Test autosave" fino in
   fondo, confermato nel `localStorage`): entrambi scrivono correttamente. Nessun bug trovato.

4. **« L'assessment non funziona »** — testato dal vivo passo per passo: apertura/chiusura,
   cambio vista ASSESSMENT ↔ R&I·MANUEL, item scritto a mano e aggiunto (compare con "non
   mesuré" e i bottoni Oui/Non), conteggio nel titolo aggiornato. Tutto risponde. Non
   verificabile: la cattura guidata dalla VOCE (serve un microfono vero).

5. **« Il TA sotto l'ora non è esplicito »** — due numeri senza nessuna parola: la freccia
   `→ X.XX` (il TA proprio ADESSO, diverso dal riposo sopra) e la percentuale del segnale.
   Aggiunta l'etichetta visibile a entrambi ("adesso →", "segnale N%") — non solo un `title`
   al passaggio del mouse, la stessa ragione già scritta per « MUSE non indossato ».

6. **« La fenêtre de configurer le meter est hors champ en partie »** — `PannelloMeter`
   (4 passi, l'ultimo il più lungo) si ancorava solo con `top:16`, senza un `bottom` a
   fermarlo: su una finestra non abbastanza alta usciva sotto, portandosi via i bottoni
   avanti/indietro in fondo. Aggiunto un tetto pari all'altezza vera della sezione, con
   scorrimento proprio se il contenuto lo supera comunque.

7. **« La zone ARC doit avoir le même fond que le fond général... et les zones également,
   juste un petit liseré très fin de séparation »** — nuovi token `--s-zone-bg`/
   `--s-zone-border` in `tokens.css`: trasparenti per davvero in chiaro (lo stesso fondo della
   pagina, non un colore identico ma opaco) con un bordo sottile a dire dove finiscono —
   applicati all'arco, assessment, Santé Système, journal, MNA. In scuro restano invariati
   (il vetro smerigliato di sempre): lì l'ago disegna in colori chiari pensati per un fondo
   scuro, cambiarlo avrebbe rotto quel contrasto. Verificato dal vivo: arco e journal con
   bordo sottile, fondo indistinguibile da quello della pagina.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo estesa (profilo TEST) — autosave confermato nel localStorage,
assessment testato passo per passo, arco e journal col nuovo fondo/bordo. Nessun errore in
console oltre a fallimenti di rete attesi. `git status`: `src/serenity/Avvio.tsx`,
`src/serenity/PannelloMna.tsx`, `src/serenity/Serenity.tsx`, `src/serenity/ZonaAssessment.tsx`,
`src/serenity/tokens.css`. EQUILIBRIUM invariato.

---

## Trentaseiesimo giro (23/08/2026) — le reazioni sopra l'arco, Santé Système senza cancello sugli strumenti, i quattro metodi tondi, i CREDITS scrivono SERENITY

Otto segnalazioni, la più importante trovata leggendo il codice condiviso fino in fondo:

1. **« Le fond de la zone ARC, Journal, Assessment... je veux de la transparence »** — il giro
   scorso li aveva resi trasparenti SOLO in chiaro, lasciandoli vetro smerigliato in scuro
   (stessa ragione dell'arco — sbagliata per LORO: quella ragione, l'ago che disegna in colori
   chiari, riguarda SOLO l'arco). `--s-zone-bg`/`--s-zone-border` ora trasparenti in ENTRAMBI i
   temi per le zone; l'arco resta l'unica eccezione, gestita a parte.

2. **« PRÊT POUR LA SÉANCE... cette zone n'a pas les couleurs de fond du reste »** — i due
   pannelli (`ThetaReadyCheck`/`MetabolicCheck`) erano stati ritinti in un azzurro chiaro
   INVENTATO, diverso dal `--s-ground` perlato di tutta SERENITY. Ora lo stesso fondo vero, lo
   stesso bordo neutro delle altre zone.

3. **« Santé Système ne se voit pas en entier, et elle apparaît alors que le MUSE n'est pas
   activé... VERIFIE LE CODE, il est déjà opérationnel dans EQUILIBRIUM »** — verificato: il
   codice di App.tsx ha un commento esplicito, « FIX M-07: dead `hideHealth = false` removed —
   visibility driven by `moduleVis` ONLY » — EQUILIBRIUM ha RIMOSSO deliberatamente il cancello
   sugli strumenti che un tempo aveva. Il `&& (museOk || meterC)` qui era un'invenzione mia,
   non una riproduzione — tolto. Anche il taglio verticale corretto: la colonna che la contiene
   aveva `overflow:'hidden'` invece di uno scorrimento proprio.

4. **« Dans équilibrium apparaissent les réactions écrites au-dessus de l'aiguille, dans
   SERENITY elles n'apparaissent pas »** — verificato nel codice condiviso: `QuantumSphere.tsx`
   dice da sé perché non le disegna più — « Reaction label REMOVED — reactions are shown in
   the top data-stack » — App.tsx le scrive appena SOPRA il quadrante, non dentro
   `QuantumSphere`. Portata la STESSA riga in SERENITY, leggendo `needleReactionKey`/
   `thetaReactionKey` che esistevano già (mai letti per questo): stessa tabella sigle, stessi
   due colori (MUSE bianco, METER ambra), stessa regola una/due righe secondo `reazioniViste`.

5. **« Les boutons CYCLES à gauche... des boutons ronds, exactement dans le style de l'image
   de référence, cohérents avec tous les autres boutons... moins présents, mais plus
   différenciés »** — CONTACT/NULL/MIRROR/TONE (ed EP) erano le UNICHE pillole rettangolari
   della barra laterale, in un'app dove ogni altro bottone è un cerchio (CONFIG, Guide,
   History, Processus, le camere). Ora cerchi anche loro (54px, la stessa famiglia di
   `CameraCerchio`: icona dentro, didascalia sempre leggibile sotto) — più piccoli (« moins
   présents ») e distinti anche per ICONA, non solo per colore (« plus différenciés »): `Hand`
   per CONTACT, `Target` per NULL, `FlipHorizontal2` per MIRROR, `AudioWaveform` per TONE.

6. **« Les indications du TA, motion, etc correspondent exactement à celle de EQUILIBRIUM »**
   — verificate le soglie di velocità (1.15/0.85, identiche) e la tabella delle reazioni
   (identica, v. punto 4); corretta una differenza di scrittura trovata: « — motion » (trattino
   lungo), non « · motion ».

7. **« QUAND ON APPUYE POUR VOIR LES CREDITS ON A TOUJOURS EQUILIBRIUM »** — bug reale:
   `CreditsModal` (condiviso) scriveva `EQUILIBRIUM`/`__APP_VERSION__` a mano, montato TALE E
   QUALE in SERENITY. Nuove props opzionali `appName`/`appVersion` — default invariato
   (EQUILIBRIUM non li passa, nessun cambiamento per lui), SERENITY passa i propri. Verificato
   dal vivo: "SERENITY v3.0.68" nella finestra dei crediti.

**Rimandato a un prossimo giro** (segnalato ma non ancora fatto): « quand on arme un CYCLE,
l'écriture DONNE L'ITEM... mets-la directement sur la ligne du bouton... fais disparaître le
TITRE... également pour toutes les étapes du CYCLE » — una ristrutturazione dei quattro
metodi (CONTACT/NULL/MIRROR/TONE), passo per passo, che merita un giro dedicato invece di un
rattoppo veloce in fondo a un giro già grande.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, verifica dal vivo estesa (profilo TEST) — bottoni tondi, Santé Système senza
strumenti connessi, CREDITS con SERENITY, nessun errore in console oltre a fallimenti di rete
attesi. `git status`: `src/components/CreditsModal.tsx` (props opzionali, default invariato —
EQUILIBRIUM non tocca), `src/serenity/Serenity.tsx`, `src/serenity/readyCheckLight.css`,
`src/serenity/tokens.css`.

---

## Trentasettesimo giro (23/08/2026) — icone Contact/Null più esplicite, UNBOUND tondo, il vetro dei bottoni davvero più spesso, il bug vero dietro « Assessment/Giornale/MNA con un fondo proprio », la fusione titolo+bottone in tutti i cicli

Cinque richieste, nell'ordine dato dall'utente stesso (« ma prima: » — la fusione titolo+
bottone, già rimandata dal giro scorso, arriva SOLO alla fine):

1. **« L'icône Contact doit être plus explicite, comme quelque chose qui est visé » / « L'icône
   NULL doit être plus explicite »** — `Hand` (un contatto generico) → `Crosshair` (un
   bersaglio inquadrato: il gesto di MIRARE). `Target` era già un bersaglio ma ormai
   indistinguibile a colpo d'occhio da `Crosshair` — sostituito con `Scale`, la bilancia: NULL
   è il punto di equilibrio raggiunto, non il puntamento — due gesti, due icone.

2. **« Le bouton OUVERT doit être aussi sous forme de cercle. Change le nom en UNBOUND »** —
   l'unica pillola rettangolare rimasta dopo la conversione dei quattro metodi (giro scorso).
   Ora un cerchio identico agli altri (54px, icona `Unlink`, didascalia sotto) ma NON un
   bottone — non c'è nulla da armare, ci si è già — quindi `className="s-glass"` (non `-btn`)
   e cursore di default. Nome nuovo, SOLO per SERENITY (non tocca "APERTO"/"OUVERT" di
   App.tsx): IT SVINCOLATO, FR DÉLIÉ, EN UNBOUND, ES DESLIGADO, SV OBUNDEN — evitando di nuovo
   "libero"/"libre", per la stessa ragione già scritta da App.tsx per "APERTO".

3. **« Crea un toggle button in stile glassmorphism identico all'immagine di riferimento »**
   (immagine allegata: una traccia+manopola di vetro che scorre, sole/luna, "Light"/"Dark") —
   quell'immagine È `SelettoreTema` (le stesse due tappe, la stessa coppia di parole).
   `BottoneCiclico.tsx` ora sceglie da sé fra due rese: con ESATTAMENTE due tappe (il tema) un
   vero scivolo — traccia 124×40, manopola 32px che scorre con `left` in transizione
   `cubic-bezier(0.4,0,0.2,1)` — coi quattro strati del riferimento (lucido, manopola di vetro,
   traccia di vetro, ombra diffusa a due strati); con più tappe (la lingua, cinque) resta il
   bottone-che-si-trasforma di prima, perché con cinque tappe non esiste "l'altro stato" unico
   verso cui scorrere. E, letto insieme a « NON VEDO CAMBIAMENTO NELLO STILE DEI BOTTONI »:
   l'ombra di `.s-glass-btn` (ereditata da `--s-shadow`, tarata per le GRANDI zone silenziose)
   era troppo debole per leggersi su un cerchio di 54px — ora un'ombra propria dei bottoni, più
   profonda, senza toccare `--s-shadow` che le zone continuano a usare.

4. **« Hai mantenuto le zone ASSESSMENT, GIORNALE, MNA con un fondo proprio. RENDILI
   TRASPARENTI COME SALUTE SYSTEMA »** — il bug vero, trovato confrontando dal vivo (via
   `getComputedStyle`) la catena di antenati di Santé (che l'utente conferma corretta) con
   quella di Assessment/MNA/Journal: **non era il fondo** — tutti e quattro leggono già
   `var(--s-zone-bg)`, trasparente. Il colpevole era `className="s-glass s-glass-lift"` sul
   contenitore radice dei tre pannelli (Santé non la porta MAI, solo stile in linea):
   `.s-glass` porta il SUO `backdrop-filter: blur(30px) saturate(200%)`, che sfoca e satura
   quel che sta DIETRO il pannello — anche con `background` trasparente, sfocare lo sfondo lo fa
   leggere come "una lastra a sé", esattamente l'effetto segnalato tre volte di fila. Tolta la
   classe dai tre file (`ZonaAssessment.tsx`, `PannelloMna.tsx`, il Journal in `Serenity.tsx`):
   resta solo lo stile in linea con i token di zona, come Santé.

5. **« Fai la fusione titolo bottone per tutte le tappe dei cicli »** (rimandata dal giro
   scorso) — `SuggerimentoCiclo` (il testo "cosa devo fare" sotto ogni tappa) mostrava un
   `titolo` in grassetto ("1 · DAI L'ITEM", "3 · AS-IS"...) in un blocco a sé
   (`flexBasis:'100%'`), IN FONDO a tutti i bottoni della tappa — un doppione: il badge
   (CONTACT/NULL/MIRROR/TONE), `CycleSteps` e il testo del bottone stesso dicono già IN QUALE
   tappa si è. Tolto il `titolo` (il componente non lo accetta più come prop), e la chiamata
   spostata da "in fondo a tutto" a SUBITO dopo il blocco di bottoni della tappa attiva, sulla
   stessa riga elastica (niente più `flexBasis`) — nei tre cicli (TONE, MIRROR, CONTACT/NULL).
   Verificato dal vivo: armato un ciclo CONTACT, la spiegazione ("poi non fare altro: il ciclo
   avanza da sé fino all'AS-IS") appare ora come semplice didascalia, senza titolo, appena
   prima del contatore/ANNULLA/valida — non più isolata in coda.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo, `senzaNumero`
rimosso perché diventato inutile), `vitest run` 639/639, verifica dal vivo estesa (profilo
TEST, entrambi i temi) — icone Crosshair/Scale distinguibili, UNBOUND tondo con la sua
didascalia, il toggle tema scorre correttamente fra "light"/"dark" nei due sensi, Assessment/
Giornale/MNA senza più `backdrop-filter` in tutta la catena di antenati (controllato via
`getComputedStyle`, non solo a occhio), ciclo CONTACT armato con la spiegazione fusa sulla riga
dei bottoni. `git status`: `src/serenity/Serenity.tsx`, `src/serenity/BottoneCiclico.tsx`,
`src/serenity/Impostazioni.tsx`, `src/serenity/tokens.css`, `src/serenity/ZonaAssessment.tsx`,
`src/serenity/PannelloMna.tsx`.

---

## Trentottesimo giro (23/08/2026) — l'arco trasparente anche in scuro e ingrandito, UNBOUND tolto di nuovo, la scritta TA parola per parola come EQUILIBRIUM, un'indicazione per « voice not available »

Quattro segnalazioni:

1. **« La zona ARC con l'ago ha sempre un fondo. NON LO VOGLIO, VOGLIO CHE SIA TRASPARENTE.
   AGGRANDISCI AL MASSIMO DELLE POSSIBILITÀ »** — in scuro l'arco teneva apposta un gradiente
   vero (`#2e2e33`→`#262629`), per una ragione scritta a lungo nel codice: l'ago disegna in
   colori chiari, pensati per un fondo scuro. Verificato che quella ragione non regge più da
   sola: `--s-ground` in tema scuro è `#17181a`, PIÙ scuro del gradiente che sostituiva —
   togliere il gradiente non toglie contrasto all'ago, lo aumenta. `background: 'transparent'`
   ora in ENTRAMBI i temi, resta solo il filo sottile del bordo. Il tetto di larghezza
   (1400px) era anche più stretto del vero spazio libero (la barra laterale e le camere
   galleggiano, `position:absolute`: non tolgono spazio flex all'arco) — alzato a 2200px.

2. **« UNBOUND n'est pas nécessaire, car il est par défaut si on ne choisit pas un CYCLE.
   ENLEVE LE »** — il cerchio aggiunto il giro scorso (dopo la pillola "APERTO" di prima)
   indicava uno stato che non richiede scelta né conferma: `mode === 'free'` è già dove ci si
   trova finché non si preme uno dei quattro cerchi. Tolto — l'assenza dei quattro badge
   colorati dice già da sé che nessun metodo è armato.

3. **« Le scritte TA con 1 o 2 cans non è chiaro. METTI LE SCRITTE ESATTAMENTE COME IN
   EQUILIBRIUM »** — confrontato parola per parola col testo di App.tsx: un'unica differenza,
   l'abbreviazione "1 div." al posto di "1 divisione"/"1 division"/"1 división" per intero.
   Corretta nelle quattro lingue coinvolte (lo svedese "delstreck" era già identico) — la
   logica (`tone.taMostrato`, la funzione condivisa `taToTwoCans`) era già la stessa da un
   giro precedente, restava solo questa parola abbreviata.

4. **« Mi dice VOICE NOT AVAILABLE »** — verificato: `useVoiceItem.ts` (condiviso, mai
   toccato) prova nativo macOS poi Whisper offline, la STESSA catena di App.tsx — se dice
   "assente" qui e non in EQUILIBRIUM, sulla stessa macchina, non è un bug di logica ma il
   permesso di sistema: macOS tratta Serenity.app ed Equilibrium.app come due applicazioni
   separate (`appId` diverso in `electron-builder.serenity.cjs`), il permesso concesso
   all'una non vale per l'altra. Non risolvibile da codice — aggiunto un `title` che dice
   dove guardare (Preferenze di Sistema → Privacy e Sicurezza → Microfono/Riconoscimento
   vocale, concedere a "Serenity" separatamente) invece di lasciare l'auditor a chiedersi
   perché.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (profilo TEST, tema scuro) — l'arco senza più `background-image`
(`getComputedStyle` conferma `none`) e largo quanto lo spazio libero, nessun cerchio UNBOUND
dopo EP, il tooltip della voce presente e col testo giusto. `git status`:
`src/serenity/Serenity.tsx`.

---

## Trentanovesimo giro (23/08/2026) — CANS ritinto per davvero in chiaro, il TA « adesso » era un'invenzione, l'arco più grande sul serio, Basic/Expert allinea il modulo biometrico, la guida al permesso vocale

Cinque segnalazioni:

1. **« Il ready for the session CANS non corrisponde alla scelta LIGHT/DARK, ma ha colori
   propri »** — il pannello principale di `ThetaReadyCheck` (fondo, testo) era già ritinto in
   chiaro; restavano le CARTE PICCOLE dentro (le due tappe della prova, i bottoni ANNULLA/
   CONTINUA, la barra di avanzamento): fondo `rgba(255,255,255,0.0X)`, pensato per leggersi
   come "un po' più chiaro" SUL FONDO NERO di prima — su un fondo ora chiaro diventa bianco su
   bianco, quasi invisibile. Non "il colore sbagliato": NESSUN colore, la struttura a carte
   spariva e restava solo il testo — da cui l'impressione di "colori propri". Aggiunta la
   ritinta per i quattro alfa usati SOLO come sfondo in questi due componenti (0.04/0.05/0.06/
   0.08), verificati uno per uno per non toccare per sbaglio il bordo del pannello principale
   (che usa 0.14, escluso apposta).

2. **« Che vuol dire nel TA maintenant seguita da un numero? » / « TA 1 boîte → 2 senza nessun
   numero? »** — trovato l'errore alla radice: un giro fa avevo AGGIUNTO due righe (« TA
   {riposo} » e « adesso → {taNow} ») accanto alla didascalia della base — TRE informazioni per
   un solo dato, un'invenzione mai esistita in App.tsx. Letto parola per parola: EQUILIBRIUM
   mostra UN SOLO numero, `tone.taMostrato.ta` (che la funzione calcola già da `taNow`, non dal
   riposo), con la sua didascalia subito sotto — punto. Ecco perché la didascalia sembrava
   "senza numero": il numero sopra (il riposo) non era quello a cui si riferiva. Tolte le due
   righe inventate, resta la stessa coppia numero+didascalia di App.tsx.

3. **« Lo spazio dell'arco deve essere più grande, fallo occupare tutto lo spazio disponibile »**
   — il tetto in px (alzato a 2200 il giro scorso) non era mai il vero limite: con un
   `aspect-ratio` largo quasi 1,9 volte la sua altezza, su uno schermo normale è la LARGHEZZA
   disponibile a decidere la taglia, non un tetto mai raggiunto. Tolto il tetto (`100%` puro) e
   ridotto il padding di `<main>` (38/44px → 20/24px), che toglieva spazio vero all'arco su
   OGNI schermo, non solo sui piccoli.

4. **« Dimmi esattamente cosa fai apparire come moduli in BASIC e EXPERT »** — risposta onesta
   trovata leggendo il codice: NIENTE. L'interruttore cambiava solo la propria icona/parola,
   nessun modulo lo seguiva — un'omissione, non una scelta. Verificato App.tsx: `espertoAttivo`
   governa un `useEffect` che scrive `moduleVis.biometric` (vero in EXPERT, falso in BASIC, una
   preferenza che l'auditor può comunque poi cambiare a mano da CONFIG) e un secondo pannello
   "diagnostica" (Total TA + velocità) dietro un cassetto visibile solo in EXPERT. Replicata la
   PRIMA parte (la sincronia del modulo biometrico, verificata dal vivo nei due sensi) — la
   seconda lasciata FUORI apposta e dichiarata, non nascosta: in SERENITY il Total TA e la
   velocità sono già sempre visibili nell'angolo dell'arco per una scelta esplicita di un giro
   precedente, e nasconderli di nuovo dietro EXPERT toglierebbe qualcosa che l'auditor vede oggi
   senza che l'abbia chiesto — ambiguità reale, non risolta da sola.

5. **« Non posso aggiungere Serenity a Reconnaissance vocale, come fare? »** — risposta data in
   chat (nessun codice: impostazioni di sistema macOS), non nel codice.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (profilo TEST, tema scuro) — l'arco visibilmente più largo a parità di
finestra, la didascalia TA senza più le due righe inventate, `moduleVis.biometric` che
diventa `true`/`false` passando Basic↔Expert (controllato in `localStorage['ser_module_vis']`
nei due sensi). `git status`: `src/serenity/Serenity.tsx`, `src/serenity/readyCheckLight.css`.

---

## Quarantesimo giro (23/08/2026) — il vero bug della voce: sm-stt non veniva mai imballato in Serenity.app

Segnalato con lo screenshot delle Preferenze di Sistema: « non appare Serenity [in
Reconnaissance vocale] e non so come fare ». Non era un problema di permessi da spiegare
all'utente (come risposto nel giro scorso) — era un BUG di packaging, trovato leggendo
`electron-builder.serenity.cjs` riga per riga: il file copia da `package.json.build` un
elenco esplicito di chiavi (`appId`, `files`, `mac`, `asarUnpack`...) invece di prendere
l'intero oggetto, e `extraResources` — la voce che dice a electron-builder di copiare
`native/sm-stt` (il binario Swift che chiede DAVVERO il permesso a macOS, v. `main.cjs`,
`sttBinaryPath`) dentro `Contents/Resources` — non era fra le chiavi copiate.

Conseguenza esatta: senza quel binario nel pacchetto, il riconoscimento nativo non falliva
silenziosamente — semplicemente non esisteva nulla da eseguire. macOS non può proporre un
permesso per un processo che non ha mai provato a chiederlo: da qui "Serenity" assente
dall'elenco, non "permesso negato". La stessa `sttBinaryPath` in `main.cjs` risolve già da sé
da `process.resourcesPath` (diverso per ogni app pacchettizzata) — bastava che il file fosse
lì.

Corretto: `extraResources: b.extraResources || []` aggiunto a `electron-builder.serenity.cjs`.
Verificato non solo compilando ma APRENDO il pacchetto costruito: `ls
release/mac-arm64/Serenity.app/Contents/Resources/` mostra `sm-stt` presente (96 KB,
eseguibile) — non solo "il codice sembra giusto", il file è davvero dentro il DMG spedito.

`git status`: `electron-builder.serenity.cjs`.

---

## Quarantunesimo giro (23/08/2026) — le camere affiancate liberano Santé/Journal, Santé Système compatto, i cinque cerchi in riga liberano l'assessment, NEEDLE LIGHT, l'animazione iniziale

Sette segnalazioni, misurate dal vivo con `getBoundingClientRect` prima di toccare una riga
di codice — non supposizioni sul layout.

1. **« Il journal et Santé système non si vedono completamente, sposta la camm PC
   completamente in alto »** — misurato: a 1400×900, Santé Système cominciava a y=724 (176px
   liberi prima del fondo finestra) e il Journal a y=1164, **fuori dallo schermo per intero**.
   Causa esatta: `paddingTop: camStackH` sulla colonna destra riservava spazio per le DUE
   camere impilate (CAM 2 sopra, CAM 1 sotto — 272+14+170+margini ≈ 490px). Le camere ora
   AFFIANCATE (una riga, non una colonna) — CAM 2 resta grande e in cima esattamente come
   prima, ma non ha più nulla stivato sotto di sé: la riserva è ora alta quanto la PIÙ ALTA
   delle due (non la somma), libera ~186px.

2. **« Santé système devi cambiarlo. Metti il giro affiancato a EEG... Il PPG indica solo il
   numero di BPM senza il cerchio e mettigli accanto sulla stessa linea il capteur MUSE 2 »**
   — cambio di STRUTTURA di `HealthPanel.tsx` (condiviso con App.tsx: « EQUILIBRIUM detta
   struttura, SERENITY solo la grafica » vale anche al contrario). Nuova prop opzionale
   `compact` (default `false`, App.tsx non la passa — la sua resa non cambia di un pixel):
   quando vera, GYRO affiancato a EEG (`flex:1`/`flex:2`) invece che sotto, e PPG diventa un
   numero solo (niente `CircularGauge`) sulla stessa riga di MUSE 2/batteria — estratta la riga
   MUSE 2 (`MuseSensorLine`) e la griglia elettrodi (`ElectrodeGrid`) come funzioni a sé,
   riusate TALE E QUALI dalla resa originale di App.tsx (via `ElectrodeRing`, invariata) e
   dalla resa compatta di SERENITY. SERENITY passa `compact`.

3. **« I bottoni dei cicli spostali a sinistra e porta in alto la zona assessment »** — i
   cinque cerchi (CONTACT/NULL/MIRROR/TONE/EP) erano impilati in colonna, ~390px prima che
   l'assessment potesse cominciare. Ora una riga che va a capo da sé (`flexWrap`), larga
   quanto l'intero contenitore (272px): quattro cerchi entrano nella stessa riga
   (54×4+10×3=246<272), il quinto (EP) va a capo — due righe invece di cinque, l'assessment
   risale di conseguenza. CHIUDI/PAUSA restano nella loro colonna stretta di sempre (148px),
   solo i cinque cerchi cambiano contenitore.

4. **« Si deve poter attivare Assessment al di fuori dei cicli »** — verificato nel codice:
   `assessColOpen`/il toggle di `ZonaAssessment` non erano MAI stati legati allo stato del
   ciclo — la vera causa era che il bottone era irraggiungibile (punto 3, sopra), non
   disabilitato. Con l'assessment ora visibile, verificato dal vivo: aperta con successo senza
   alcun ciclo armato (badge CONTACT/NULL/MIRROR/TONE assente, i quattro cerchi ancora tutti
   proposti) — nessuna modifica di logica necessaria, solo di layout.

5. **« Togli le percentuali con la scritta signal »** — la riga "segnale N%" (aggiunta un
   giro fa per spiegare cosa fosse un numero nudo) tolta del tutto — non più un'etichetta da
   chiarire, il numero stesso non deve più esserci.

6. **« Manca la possibilità di mettere/togliere la scia »** — trovato in App.tsx: una levetta
   ESATTA, `showTrailPref` (default `true`), « NEEDLE LIGHT — la scia luminosa dell'ago e le
   etichette di reazione », mai portata qui — `showTrail` su `<QuantumSphere>` restava fissa a
   `true`. Aggiunta la stessa levetta, stessa condizione (un ago da vedere, non MIRROR/TONE),
   nell'angolo delle letture sopra l'arco.

7. **« Metti anche l'animazione iniziale con SERENITY come nome »** — `SplashScreen`
   (condiviso) non era MAI montato in SERENITY: nessuna animazione all'avvio, mai. Il testo
   sotto il logo (`'EQUILIBRIUM'`) era scritto a mano — nuova prop opzionale `appName`
   (default `'EQUILIBRIUM'`, stessa ricetta di `CreditsModal`), SERENITY monta il componente
   passando `appName="SERENITY"`. Verificato via `tsc`/lettura del codice (stessa struttura
   già provata di `CreditsModal`) — la finestra di 3,8 s dell'animazione si è rivelata troppo
   corta da catturare in uno screenshot col giro di chiamate remoto di questo ambiente di
   test; nessun rischio nella modifica (prop+ref, stesso schema già in produzione).

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo a TRE larghezze (1400×900, 1280×800, 1024×700, profilo TEST) — camere
affiancate, Santé Système compatto con PPG/MUSE 2 sulla stessa riga (confermato via DOM, non
solo a occhio), Journal visibile senza scorrimento a 1400×900, assessment aperta con successo
senza alcun ciclo armato, nessuna scritta "signal" residua in tutto il testo di pagina.
`git status`: `src/components/HealthPanel.tsx`, `src/components/SplashScreen.tsx`,
`src/serenity/Serenity.tsx`.

---

## Quarantaduesimo giro (23/08/2026) — l'arco non si sposta più con le reazioni, l'item scritto senza ciclo non arma più CONTACT, l'ombra dell'arco tolta

Tre segnalazioni:

1. **« C'est gênant de déplacer la zone ARC en fonction des réactions, elle doit rester
   figée »** — il riquadro delle reazioni sopra l'arco (portato da App.tsx due giri fa) aveva
   un'altezza VARIABILE: `null` (niente riquadro affatto) quando non c'era reazione, 52 o 28px
   secondo quanti aghi si guardano quando c'era — l'arco, sotto nella stessa colonna flex, si
   spostava su e giù ogni volta. Ora un'altezza FISSA (52px, il caso più alto) sempre presente
   a seduta aperta, contenuto o no: l'arco non si muove mai più.

2. **« Au début, alors que je n'ai pas choisi de cycle, dans la zone écris ou dis l'item il
   fait démarrer par défaut CONTACT, NON, cela doit simplement écrire dans assessment l'item
   et la réaction »** — l'Invio in quel campo chiamava `cycles.armCycle('charge')` SEMPRE,
   anche quando l'auditor voleva solo dare un item da assessment senza ancora scegliere un
   metodo. CONTACT/NULL restano armabili dai loro cerchi (che leggono lo stesso `item`, appena
   scritto) — il campo ora scrive nel giornale con `journal.addLog({speaker:'Aud',...})`, la
   STESSA funzione già usata da `onTranscript` della voce: l'assessment (se accesa) lo
   raccoglie da sé, nessun ciclo armato di nascosto. Verificato dal vivo che CONTACT non si
   arma più premendo Invio nel campo (i quattro cerchi restano proposti dopo ripetuti tentativi)
   — la riga nel giornale non si è lasciata confermare in questo ambiente di test: la
   simulazione remota della pressione di Invio su questo campo specifico non è risultata
   affidabile (né con la vecchia né con la nuova gestione — lo stesso limite sembra preesistente
   allo strumento di test, non introdotto da questa modifica), ma la funzione chiamata è la
   STESSA, già in produzione, usata dalla voce.

3. **« Togli l'ombra alla zona ARC AGO »** — restava un'ombra di rilievo
   (`--s-shadow`/`--s-shadow-lift`) ereditata da quando il fondo dell'arco era pieno; con lo
   sfondo ormai trasparente (giro precedente) un'ombra sotto un riquadro senza fondo si legge
   come un bordo scuro extra, non un rilievo vero. Tolta — resta solo il filo sottile del
   bordo.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (profilo TEST) — l'ombra dell'arco sparita a schermo, CONTACT/NULL/MIRROR/
TONE mai armati dopo ripetuti Invio nel campo item.

`git status`: `src/serenity/Serenity.tsx`.

---

## Quarantatreesimo giro (23/08/2026) — la pillola chi/come/dove compressa a un'icona sola

Richiesta esplicita, dopo un resoconto: la pillola "chi audita" impacchettava fino a QUATTRO
azioni sempre in chiaro (interruttore Basic/Expert, cambia auditor/preclear, salva
configurazione — le ultime due solo prima di aprire) — le stesse informazioni che `Avvio.tsx`
raccoglie una volta sola, tornate a vista per tutta la seduta. `Avvio.tsx` lo dice di sé
stesso: « sono cose che si controllano una volta all'inizio, non che si guardano in seduta ».

**Corretta un'idea sbagliata proposta a voce prima di scrivere codice**: "riapri lo stesso
Avvio.tsx" non è praticabile — `ricomincia()` (l'unica via per rivedere `Avvio.tsx`) azzera
`avvio` e ricomincia le QUATTRO domande da capo, ed è commentata esplicitamente « solo a
seduta chiusa »: riusarla a metà seduta vorrebbe dire chiuderla. Scelto invece un piccolo
pannello a tendina proprio (`assettoAperto`, nuovo stato) dietro un'unica icona
(`SlidersHorizontal`) — le stesse tre azioni di prima, IDENTICHE (nessuna tolta, nessuna
logica nuova: `setAvvio`, `ricomincia`, `salvaConfigurazione` tutte le stesse chiamate), solo
non più tutte in chiaro insieme.

Verificato dal vivo: la pillola ora mostra solo nome+ruolo; l'icona apre il pannello con
"basic/expert · cambia" (funzionante nei due sensi), "cambia auditor o preclear" e "salva
questa configurazione" — le ultime due spariscono correttamente a seduta aperta (`!aperta`,
invariato), lasciando solo il livello.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639.

`git status`: `src/serenity/Serenity.tsx`.

---

## Quarantaquattresimo giro (23/08/2026) — modalità ciclo, Santé Système richiede il MUSE per davvero, camere riordinate

Quattro segnalazioni insieme, confermate una per una prima di scrivere codice.

**1. Modalità ciclo** — confermata dopo una proposta scritta (cosa sparisce, cosa resta, e
perché). Nuovo `modalitaCiclo = mode !== 'free'` (zero stato in più: `mode` già distingue
libero da tutto il resto, la STESSA condizione che già nasconde/mostra i cinque cerchi dei
metodi). A ciclo armato spariscono: logo/crediti, tema, lingua, storico, processus, l'assetto,
CONFIG, Guida, l'assistente IA — tutti decisi una volta, mai bisogno di guardarli con un ago
che reagisce. Restano SEMPRE: l'arco/le letture/NEEDLE LIGHT, i controlli del ciclo in corso,
EP, CHIUDI/PAUSA, le camere, il Journal, l'Assessment (« la parte di auditing libera » — già
raggiungibile, nessuna modifica necessaria: ANNULLA chiude il ciclo e i quattro cerchi
ricompaiono da soli). Il selettore strumenti resta visibile ma diventa INERTE (`onClick`
`undefined`, `cursor:'default'`) — i puntini di stato restano leggibili (una disconnessione a
metà lettura va vista subito), i bottoni per connettersi no.

**2. « Vedo che appare Santé Système anche senza il MUSE »** — verificato di nuovo dal vivo,
aprendo DAVVERO EQUILIBRIUM senza strumenti: lo fa anche lui (il "FIX M-07" di App.tsx è
confermato). Ma qui la richiesta, vista e confermata dopo aver guardato le due app fianco a
fianco, è una preferenza dichiarata e diversa per SERENITY — non una divergenza da correggere.
Rimesso il cancello `&& museOk`. **Bug trovato verificando dal vivo**: `rightColOpen` (la
condizione che decide lo spazio della colonna) aveva il cancello nuovo, ma la condizione che
monta DAVVERO `<HealthPanel>`, poco più sotto, era rimasta la vecchia — due condizioni per la
stessa cosa, una sola aggiornata. Corrette entrambe.

**3. Le camere riordinate** — segnalato al contrario del giro precedente: « sposta la cam
AUDITOR in alto di quella del PC per poter spostare la camm PC a destra ». Da riga (affiancate)
a colonna di nuovo, ma stavolta CAM 1 (Auditor) in cima, CAM 2 (PC) sotto di lei e spostata
verso il bordo vero (`marginRight: -24`). `camStackH` torna a sommare le due altezze — il
risparmio verticale del giro precedente ceduto alla richiesta esplicita di questo.

**4. « L'arco deve essere più grande »** — compensato in parte il punto 3 riducendo ancora il
padding di `<main>` (20/24px → 16/20px).

Verificato dal vivo (profilo TEST, senza strumenti): Santé Système assente dal testo di pagina
(prima ancora presente nonostante il cancello su `rightColOpen`), CAM 1 sopra/CAM 2 sotto-
destra, ciclo CONTACT armato → l'intera barra amministrativa sparisce (verificato anche che i
tre bottoni strumenti diventano `cursor:'default'`), ANNULLA → tutto riappare.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639.

`git status`: `src/serenity/Serenity.tsx`.

---

## Quarantacinquesimo giro (24/08/2026) — tolta la duplicazione dei tre cicli, le camm allineate al centro, l'arco senza più un bordo

Il punto 2 del resoconto sulla semplificazione, confermato: « le intestazioni dei tre cicli
sono copiate quasi parola per parola, tre volte » e « lo stile del bottone a pillola è
ridigitato a mano più di 15 volte », con una prova già trovata (« l'item è stato detto » aveva
un `title` in CONTACT/NULL, dimenticato in MIRROR/TONE).

**Il refactoring** — due helper, definiti una sola volta dentro un'unica IIFE che avvolge i
tre blocchi (`toneAttivo`/`mirror.mirrorArmed`/`cycles.cycleArmed`), chiusi sulle stesse
variabili che i tre blocchi già leggevano (`item`, `t`, `mode`, `faseCiclo`, `lang`) — zero
prop da far viaggiare, zero componente nuovo da montare:
- `testataCiclo(nome, colore)` — badge + item + `CycleSteps`, IDENTICI nei tre blocchi
  (differiva solo il colore/nome del badge — `null` per il bordo neutro di TONE, un colore
  pieno per MIRROR/CONTACT/NULL).
- `pillBtn(colore, dimensione?)` — lo stile del bottone a pillola, usato 16 volte nei tre
  blocchi (differiva solo il colore, e a volte la taglia del testo).
- `titoloDichiaraDetto` — il `title` che CONTACT/NULL aveva e MIRROR/TONE no: ora la STESSA
  costante sui tre bottoni "l'item/la resistenza è stato/a detto/a" — l'incoerenza già trovata
  non può più ripetersi, perché non c'è più una copia da dimenticare.

Le ~340 righe dei tre blocchi sono scese a circa la metà. Verificato dal vivo: ciclo CONTACT
armato, badge/item/pista/ANNULLA/AS-IS tutti presenti e funzionanti — nessuna resa cambiata,
solo la duplicazione tolta.

**Le camere, di nuovo** — terzo tentativo in tre giri: riga (CAM 2 in cima, efficiente) →
colonna con scalino a margine negativo (CAM 1 in cima, « non efficiente e non armoniosa »,
segnalato) → riga di nuovo, ma stavolta **allineata al centro** (`alignItems:'center'`) invece
che al bordo superiore: due cerchi di taglia diversa allineati sullo stesso bordo restano
sbilanciati, allineati sul centro si leggono come un gruppo solo. Nessun margine negativo,
nessuno scalino. `camStackH` torna al massimo delle due altezze (non la somma) — la scelta più
efficiente delle tre era anche la più armoniosa.

**Il bordo dell'arco, tolto** — restava un filo sottile (`--s-zone-border`) dopo che fondo e
ombra erano già stati tolti nei giri precedenti; segnalato come l'ultimo segno che l'arco
fosse "un riquadro" invece dell'ago a fluttuare sulla superficie. `border: 'none'`.

Verificato dal vivo (profilo TEST, senza strumenti): camere centrate senza sovrapposizioni,
Journal di nuovo visibile senza scorrimento, arco senza `border`/`boxShadow` (confermato via
`getComputedStyle`), ciclo CONTACT funzionante con la nuova intestazione condivisa.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639.

`git status`: `src/serenity/Serenity.tsx`.

---

## Quarantaseiesimo giro (24/08/2026) — "senza strumenti" non resta più bloccato, il TA a una lattina scrive lo scarto vero, Assessment si arma col ciclo, Giornale/Assessment scambiati, orologio vicino a CHIUDI, integrità biometrica nella pillola MUSE

Sette segnalazioni.

1. **« Quando scelgo senza strumenti e poi scelgo ad esempio cans, senza strumenti resta
   attivato »** — bug trovato: nella pillola MUSE/METER/NESSUNO dell'intestazione, scegliere
   MUSE o METER non spegneva mai `senzaStrumenti` — solo "NESSUNO" lo toccava (accendendolo E
   spegnendo gli altri due). Corretto: connettere uno strumento ora esce sempre dal gruppo di
   controllo. Verificato dal vivo: cliccato METER, il punto di "SANS INSTRUMENTS" torna
   grigio (non più verde/attivo).

2. **« Il TA 1 boîte vs 2 boîtes non è chiaro, devi scrivere la differenza che applichi con
   una sola can »** — la didascalia diceva CHE una correzione veniva applicata ma mai QUANTO.
   Per "solo-measured" ora scrive lo scarto vero misurato in taratura
   (`theta.setup.offsets['solo-can']`, con segno), non solo "→ 2".

3. **Assessment si accende/spegne da sé col ciclo** — segnalato: « sembra sempre attivo,
   anche quando è chiuso... nel report abbiamo assessment lunghissimi che in realtà non lo
   sono. DEVE ESSERE ATTIVATO al momento dell'armamento del ciclo, ed alla fine disattivato ».
   Nuovo `useEffect` su `[mode]`: si accende quando `mode` esce da `'free'`, si spegne quando
   ci rientra — SOLO alle transizioni, quindi l'auditor può ancora spegnerla/riaccenderla a
   mano mentre un ciclo resta armato (segnalato insieme: « si deve poter armare l'assessment
   quando l'auditor lo ritiene opportuno »). Verificato dal vivo: armato CONTACT →
   ASSESSMENT si apre da sola; ANNULLA → si richiude da sola.

4. **Giornale e Assessment scambiati di posizione** — il Giornale ora sotto i bottoni dei
   metodi (a sinistra), l'Assessment sotto Santé Système (a destra) — stessa logica di
   entrambi, invariata, solo la posizione si scambia. Verificato dal vivo.

5. **L'orologio vicino a CHIUDI LA SEDUTA** — segnalato: « la scritta dell'ora e del TA è un
   unico pavé che richiede attenzione per essere letto ». Orologio/tempo di seduta spostati
   accanto al bottone che governa la seduta (più logico); le letture dell'ago hanno ripreso il
   loro posto nell'angolo dell'arco.

6. **« Scrivi METER TA invece di TA »** — nel ramo "solo meter, niente ago EEG" un "TA" nudo
   non diceva di quale strumento. Ora "METER TA".

7. **L'integrità biometrica, dalla percentuale misteriosa alla pillola MUSE** — segnalato:
   « la percentuale che appare non so cosa sia... deve essere spostata sotto l'icona del MUSE
   in alto ». `LetturaIntegrita` (un numero nudo, "82%") viveva nell'angolo dell'arco, lontano
   da MUSE a cui appartiene. Spostata nella pillola MUSE/METER/NESSUNO, con un'etichetta
   "INT" davanti al numero — mai più un numero senza dire cosa sia.

**Non ancora fatto, per scelta esplicita**: il riposizionamento delle camere — proposto
(riga centrata, misurata dal vivo: 27% della larghezza/65% dell'altezza dell'arco coperti) ma
« non mi convince » — resta da ripensare con una soluzione diversa, dopo questi cambiamenti.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa (profilo TEST, 1400×900) — tutti e sette i punti confermati in
sessione, incluso il ciclo CONTACT con la nuova intestazione condivisa (giro precedente) che
continua a funzionare invariato.

`git status`: `src/serenity/Serenity.tsx`.

---

## Quarantasettesimo giro (24/08/2026) — le camere piccole fuori ciclo, grandi nella striscia liberata durante un ciclo; orologio e "in pausa" a fianco dei loro bottoni; Total TA scritto per intero; l'indicazione "galleggia" tolta; il TA a una lattina in una frase vera

**Le camere, una soluzione diversa invece di un'altra variante** — le ultime tre disposizioni
(riga, colonna con scalino, riga centrata) erano tutte lo stesso problema riproposto: due
cerchi che galleggiano nell'angolo, ridisposti in modi diversi, misurati a coprire fino al
27% della larghezza e il 65% dell'altezza dell'arco qualunque fosse la disposizione. Idea
diversa, confermata: la TAGLIA non è più sempre la stessa. Nuovo `useEffect` su
`[modalitaCiclo]` porta `cam1Collassata`/`cam2Collassata` a `true` (piccole, 88px, nell'angolo)
quando NESSUN ciclo è armato, a `false` (grandi, 272/170px) quando un ciclo lo è — e in quel
momento le stesse `<CameraCerchio>` non restano nell'angolo: si spostano dentro
`<header>`, nello spazio che la modalità ciclo (giro precedente) libera togliendo i controlli
amministrativi. Stesso stato, stessi componenti, solo DOVE renderizzano cambia secondo
`modalitaCiclo` — mai una seconda coppia di camere. Verificato dal vivo: fuori ciclo, cerchi
piccoli nell'angolo dell'arco; armato CONTACT, le stesse due camere ricompaiono grandi in
alto, l'arco mai coperto.

**Cinque rifiniture, segnalate insieme**:
1. **Orologio a sinistra del bottone CHIUDI** (non più sopra, giro precedente) — riga vera,
   `alignItems:'center'`, orologio compatto a sinistra, bottone a destra.
2. **Il badge "in pausa"/"strumento perso" accanto al bottone Pausa/Riprendi** — stava
   nell'angolo dell'arco, lontano dal bottone che lo governa; ora sulla stessa riga, a
   sinistra del bottone, come l'orologio sopra è a sinistra di Chiudi.
3. **L'indicazione "galleggia" tolta** — segnalato: « c'est quoi? ». Verificato App.tsx:
   `theta.fn.fn` alimenta SOLO la logica interna del ciclo TONE, mai renderizzato a schermo —
   un'invenzione SERENITY, un'etichetta isolata senza contesto. Tolta, stessa regola di
   sempre: riprodurre EQUILIBRIUM, non inventare una lettura che lui non mostra mai.
4. **Il simbolo "Σ" diventa "Total TA"** — verificato `TotalTaReadout` (App.tsx, condiviso):
   scrive la PAROLA vera (`label`, la stringa `total_ta` tradotta), mai un simbolo
   matematico. "Σ" era un'altra invenzione SERENITY.
5. **La didascalia del TA a una lattina, riscritta come una frase** — segnalato ancora: « rends
   plus clair ». "TA · 1 lattina −0.34 → 2" (giro scorso) restava un telegramma. Ora: "1
   lattina, corretta di −0.34 ≈ equivalente a 2 lattine" — "≈ equivalente a" al posto della
   freccia (una freccia si legge come "sta per diventare", non "vale come se fosse").

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa (profilo TEST, 1400×900, tema scuro) — camere piccole/grandi
confermate nei due stati, orologio e badge pausa nella nuova posizione, ciclo CONTACT e
Assessment auto-armata (giro precedente) ancora funzionanti insieme alle camere spostate.

`git status`: `src/serenity/Serenity.tsx`.

---

## Quarantottesimo giro (24/08/2026) — la relocation delle camere annullata (destabilizzava lo sguardo dell'auditor), il bottone CHIUDI allargato, l'interruttore di attivazione dell'assessment reso esplicito, la sua zona con un'altezza minima garantita

**Le camere, tornate al loro unico posto** — il giro precedente le rendeva piccole fuori
ciclo e le spostava, grandi, dentro `<header>` durante un ciclo. Segnalato: « così non mi
piacciono, perché si destabilizza l'auditor che deve cambiare logica di sguardo. Lascia le
camm al loro posto a destra, semplicemente le ingrandisci ». Il POSTO conta più della
taglia: un auditor che sa sempre dove guardare batte una camera più grande in un posto che
si sposta due volte per seduta. Tolto l'`useEffect` che legava `cam1Collassata`/
`cam2Collassata` a `modalitaCiclo`, tolto il blocco camere dentro `<header>` — resta un
SOLO posto, l'angolo sopra il quadrante di sempre, sempre alla stessa taglia. Taglia
ingrandita rispetto a quella "piccola" del giro scorso: CAM 2 (PC) 272→340px, CAM 1
(auditor) 170→210px, stessa proporzione. `camStackH` (la riserva di spazio per il resto del
layout) aggiornato agli stessi numeri.

**Il bottone CHIUDI LA SEDUTA, allargato** — segnalato: « allargalo per avere solo due
righe ». Stava in un involucro suo di 148px, deliberatamente più stretto della colonna
(272px) che lo contiene — con l'orologio a sinistra (giro scorso) il bottone stesso restava
con appena una novantina di pixel, troppo poco per "FERMER LA SÉANCE" su due righe. 148 →
272, la STESSA larghezza della colonna e della riga dei cinque cerchi appena sotto: verificato
dal vivo, il testo entra ora su UNA riga sola.

**L'assessment: come funziona, reso esplicito invece che spiegato solo a parole** —
chiesto: « la gestione dell'assessment come funziona? Voglio che ci sia un bottone di
attivazione quando non è armato automaticamente da un ciclo ». Il meccanismo esisteva già:
l'intestazione di `ZonaAssessment` (`onToggle`) governa lo STESSO `assessAttivo` che arma/
disarma davvero la cattura in `Serenity.tsx` — non un secondo interruttore. Il problema era
che si leggeva come una freccia d'accordion (▸/▾), non come un vero ON/OFF: niente diceva a
colpo d'occhio "questo bottone ARMA l'assessment". Sostituita con un interruttore vero (un
anello: vuoto quando spento, pieno e colorato quando acceso) più un'etichetta "ATTIVA" per
esteso quando è spento — non più solo un simbolo. Fuori da un ciclo (`assessAttivo` resta
dov'era l'auditor l'ha lasciato) è questo l'unico modo di armarlo; durante un ciclo lo
stesso bottone resta comunque disponibile per spegnerlo in anticipo se serve.

**La zona assessment, un'altezza minima garantita** — segnalato: « non deve essere ridotta
da non vedere quasi più nulla, devi lasciarla ben visibile in altezza ». `maxHeight:'70%'`
da solo, in una colonna flex con Santé Système sopra (mai limitata, « si deve vedere tutta
»), lasciava il contenitore restringersi (`flex-shrink` di default) fin quasi a sparire
quando Santé Système era già alta — e `ZonaAssessment` ha il proprio `overflowY:'auto'`
interno, quindi si comprimeva senza protestare, mostrando poco più della sua intestazione.
`flexShrink:0` + `minHeight:280` aggiunti: non può più scendere sotto una taglia leggibile
qualunque cosa ci sia sopra — se lo spazio proprio non basta, scorre la COLONNA
(`overflowY:'auto'`, già lì), non lei che si schiaccia. Verificato dal vivo: aperta,
l'altezza resta 280px anche a zona sola (nessun'altra zona sopra a spingerla).

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa (profilo TEST, 1400×900, tema scuro) — camere grandi e ferme
nell'angolo confermate, bottone CHIUDI su una riga, interruttore ASSESSMENT/ATTIVA che si
accende e si spegne correttamente, zona assessment a 280px anche isolata.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`,
`src/serenity/ZonaAssessment.tsx`.

---

## Quarantanovesimo giro (24/08/2026) — il vero bug dietro « CHANGER D'auditeur / sauvegarder cette configuration ne fonctionnent pas », le camere più in alto e ridotte di un quarto

**Il bug vero, riprodotto dal vivo prima di toccare una riga** — segnalato: « quando apri
[il popover dell'assetto] ti dice CHANGER D'auditeur... e salva questa configurazione, ma
non funziona ». Riprodotto subito: click reali sul bottone "sauvegarder cette
configuration" (e lo stesso per "changer d'auditeur ou de préclair") non aprivano nulla —
tre clic di fila, zero effetto visibile. `document.elementFromPoint` sul centro esatto del
bottone dava la risposta: un `<div>` DIVERSO, quello di `<section>` (il quadrante),
riceveva il clic al posto del bottone. Causa: `<header>` (che contiene il popover,
`position:absolute, zIndex:40`) non aveva mai un suo `position` — un contenitore non
posizionato non stabilisce un proprio contesto di sovrapposizione, quindi lo `zIndex:40`
del popover veniva confrontato non contro `<section>` direttamente ma bolliva fino al primo
antenato che un contesto ce l'ha davvero — e lì perdeva, perché `<section>` (posizionata
per il quadrante) risultava più in alto nell'ordine di quel contesto. Aggiunto
`position:'relative', zIndex:10` a `<header>` stesso: ora l'intero blocco (popover incluso)
forma il proprio contesto e resta sopra `<section>` per costruzione, non per un numero più
alto scelto a caso. Verificato dal vivo con `document.elementFromPoint` PRIMA (il div di
`<section>` in cima) e DOPO (il bottone stesso in cima), poi con clic reali del mouse sui
due bottoni: entrambi funzionano ora. La stessa famiglia di bug degli "angoli trasparenti"
trovata più volte in questo file — un elemento invisibile che ruba il clic prima che arrivi
a chi dovrebbe riceverlo, mai per il bottone in sé.

**Le camere, più in alto e più piccole** — segnalato: « devono essere più in alto per
guadagnare spazio e riduci di 1/4 ». `top:16` → `top:-8` (più vicine al bordo superiore
della sezione, che comincia già sotto l'intestazione — nessun rischio di finire sopra i
comandi); taglia ridotta di un quarto (× 0,75): CAM 2 340→255px, CAM 1 210→158px, stessa
proporzione di sempre. `camStackH` (la riserva di spazio per la colonna sotto) aggiornato
agli stessi numeri, `-8` compreso — altrimenti la colonna avrebbe riservato più spazio del
vero, un vuoto morto sopra Santé Système/Assessment.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa (profilo TEST, 1400×900, tema scuro) — i due bottoni del popover
assetto aprono davvero il loro drawer, le camere confermate più in alto e più piccole senza
sovrapporsi ai comandi sopra di loro.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`.

---

## Cinquantesimo giro (24/08/2026) — la pista dei tempi del ciclo, i caratteri troppo piccoli, un prop opzionale invece di toccare il componente condiviso

Segnalato: « le scritte delle steps dei cicli sono troppo piccole, aumenta la taglia dei
caratteri ». La pista (① ITEM — ② MOCK-UP — ③ AS-IS, ecc.) vive in
`components/CycleSteps.tsx` — un componente CONDIVISO, lo stesso che `App.tsx`
(EQUILIBRIUM) monta tre volte nella SUA barra comandi, stretta: i 9px fissi dentro il
componente erano tarati per QUELLO spazio, non per la riga intera che SERENITY gli riserva
(`flexBasis:'100%'`, dal giro della deduplicazione). Cambiare quei 9px a peso fisso avrebbe
ingrandito anche EQUILIBRIUM, mai chiesto — la stessa regola di sempre: SERENITY tocca solo
la propria pelle, mai il motore né un componente condiviso in un modo che ricada
sull'altra app.

Aggiunto un prop OPZIONALE, `scala` (default `1` — la taglia esatta di sempre, quella che
App.tsx continua a vedere non passandolo): cerchio, spunta, testo ed connettore vengono
tutti moltiplicati per lo stesso fattore, restando nelle stesse proporzioni fra loro. Solo
`Serenity.tsx` lo passa, `scala={1.5}` — 9px → 14px il testo, 15px → 23px i cerchi
numerati. Verificato dal vivo: armato CONTACT, il testo "ITEM"/"MOCK-UP"/"AS-IS" letto a
`getComputedStyle` conferma 14px (era 9).

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (profilo TEST, ciclo CONTACT armato, 1400×900) — pista chiaramente più
leggibile, cerchi/testo/connettore scalati insieme senza rompere le proporzioni.

`git status`: `docs/serenity-refonte.md`, `src/components/CycleSteps.tsx`,
`src/serenity/Serenity.tsx`.

---

## Cinquantunesimo giro (24/08/2026) — l'assessment verificato dal vivo, l'analisi del codice richiesta e i suoi correttivi, la scala del tono ingrandita, TA/orologio più grandi, la zona dei cicli isolata, la cam dell'auditor sparita in locale

**Verifica funzionale dell'ASSESSMENT** — chiesto: « verifica che l'assessment funzioni ».
Testato dal vivo, seduta senza strumenti, NESSUN ciclo armato (il caso più delicato, senza
l'aiuto dell'auto-armamento): attivazione manuale, item dichiarato nel campo `écris ou dis
l'item`, raccolto da solo (`ASSESSMENT · 1`), lettura "non mesuré" corretta, bottoni Oui/Non
funzionanti, rapporto ago/indicazione "0/0" corretto per costruzione (un item non misurato non
entra nel conteggio). Tab R&I · Manuel testato a parte: item aggiunto a mano, scritto nel
Giornale. Un'imprecisione trovata e corretta nello stesso giro (v. sotto): il Giornale
scriveva sempre "(NULL)" anche quando la ragione vera era "nessuno strumento".

**L'analisi del codice, richiesta esplicitamente** ("come se l'avesse fatto un altro"), e i
correttivi applicati subito dopo la conferma ("correggi il tutto"):
1. **Divisore verticale duplicato 4 volte** (lo stesso `<span>` letterale, trovato con una
   ricerca) — estratto in un componente `Divisore` a sé.
2. **Commento stantio su `camStackH`** — narrava ancora i tre tentativi di disposizione delle
   camere scartati (riga/scalino/riga centrata) e taglie vecchie (272/170 invece delle 255/158
   vere) — riscritto per riflettere lo stato ATTUALE, con un rimando a questo file per la
   cronologia invece di ripeterla nel codice.
3. **Wording del Giornale per l'R&I manuale** — `aggiungiItemManuale` scriveva sempre "(NULL)"
   quando non c'era reazione, anche col vero motivo "nessuno strumento connesso"
   (`READ_NON_MISURATO`) — distinto ora dal vero "NULL" (l'ago ha guardato e non ha reagito),
   la stessa distinzione che il pannello (`ZonaAssessment`) faceva già.
4. **Decisioni RINVIATE, con motivazione** — la scomposizione del file da 4188 righe in hook
   più piccoli (proposta nell'analisi) e l'aggiunta di test sul livello di rendering: nel
   verificare la fattibilità della prima, è emerso che `museOk`, `attivaAssessment`, `agoEegRef`
   e `assessActiveRef` sono usati in punti sparsi per tutto il file con vincoli d'ordine di
   dichiarazione stretti — un'estrazione fatta in fretta in questo stesso giro (mentre
   arrivavano nuove richieste) rischiava di rompere silenziosamente l'assessment appena
   verificato. Rinviata a un giro dedicato, sua sola cosa da fare, con più margine per
   verificare ogni punto di aggancio uno per uno.

**La scala del tono, ingrandita** — segnalato: « deve essere molto più grande ed occupare più
spazio per essere visibile ». L'involucro (in `Serenity.tsx`, `ToneColumn` stesso è puro e
condiviso, non toccato) allargato 320→460px, alzato di altezza 38%→22% dall'alto e 14%→6% da
sotto. Verificato dal vivo con TONE armato: colonna molto più leggibile, nessuna
sovrapposizione con quadrante/camere/pannello MNA.

**METER TA e MUSE TA, scritti più in grande** — la riga del numero principale (in tre punti:
la lettura MUSE quando l'ago è EEG, la stessa quando compare accanto al METER, e "METER TA")
passa da 13px (ereditato dal blocco intero) a 21px con un proprio `<span>` — fase/Total
TA/velocità, che condividevano lo stesso blocco, restano alla taglia di sempre: solo il numero
che si legge da lontano cresce.

**Orologio e tempo di seduta, scritti più in grande** — accanto al bottone CHIUDI LA SEDUTA:
11px→15px l'ora vera, 13px→17px il tempo di seduta, icone di conseguenza.

**La zona dei bottoni dei cicli, isolata** — segnalato: « isola la zona dei bottoni dei cicli,
compreso EP, con una piccola riga come quella del giornale ». La riga di cerchi
(CONTACT/NULL/MIRROR/TONE/EP) non aveva un contenitore proprio — ora la STESSA cornice sottile
di Giornale/Assessment/Santé Système (`--s-zone-bg`/`--s-zone-border`). Un bug introdotto e
corretto nello stesso giro: la cornice restava visibile VUOTA anche a seduta chiusa (i cerchi
dentro sono tutti `aperta && ...`, il contenitore non lo era) — aggiunto `aperta &&` anche
sul contenitore, verificato dal vivo prima/dopo lo screenshot a seduta chiusa.

**La cam dell'auditor, sparita dall'interfaccia locale** — segnalato: « non è necessaria,
falla sparire dall'interfaccia dell'auditor. Lasciala per le connessioni a distanza ».
Verificato in `CameraCerchio`: CAM 1 non riceve mai `externalStream`, è SEMPRE la sua webcam
locale — un autoritratto inutile a chi è già di persona nella stanza, utile invece in una
videochiamata (sapere di essere inquadrati). Montata ora solo con `avvio.distanza` — sia nel
render sia nella riserva di spazio (`camStackH`, `cam1Mostrata` nuovo). Verificato dal vivo,
seduta SOLO locale: CAM 1 non compare più, CAM 2 (PC) resta.

**Due domande dell'utente, risposte a parte, non nel codice**: come si calcola oggi la scala
del tono (spiegazione: `useToneCycle.ts`/`toneFromTa`/`toneFromDelta` — il cursore PRIMARIO
viene sempre dal TA col meter, o dichiarato dall'auditor senza; il MUSE alimenta solo due
annotazioni SECONDARIE già esistenti, `toneOraEeg` e la barra di carica, mai il cursore); e se
includere il MUSE nel calcolo primario — non implementato, perché tocca `engine/toneScale.ts`/
`useToneCycle.ts`, MOTORE CONDIVISO con EQUILIBRIUM: serve una conferma esplicita sulla
formula prima di cambiarlo, non una scelta presa da soli in un file che App.tsx usa identico.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa (profilo TEST, 1400×900, seduta SOLO locale senza strumenti, poi
CONTACT armato) — assessment end-to-end, cam1 assente, zona cicli incorniciata (piena e
vuota-a-riposo), orologio/TA leggibili, colonna del tono grande e pulita.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx` (`CameraCerchio.tsx` letto
per capire dove va lo stream, non modificato — la logica dello stream resta sua).

---

## Cinquantaduesimo giro (24/08/2026) — il MUSE prima del Meter nel calcolo del tono, MOTORE CONDIVISO con EQUILIBRIUM

**Segnalato, poi discusso al dettaglio prima di toccare nulla**: « vorrei che la misura sia
quella del MUSE se c'è il MUSE, altrimenti quella del Meter, e se non ci sono entrambi,
dichiarata ». Tocca `useToneCycle.ts`/`toneScale.ts` — il MOTORE, condiviso paro paro con
`App.tsx` (EQUILIBRIUM): confermato esplicitamente che la modifica vale per ENTRAMBE le app,
non solo per SERENITY.

**Il limite tecnico, capito PRIMA di scrivere la formula**: il MUSE non ha una scala assoluta
propria — `d.qL` è un quoziente di carica EEG (0..1), non tarato su −40…+40 come il TA lo è
via `taClear`/`TA_MAX`. Può dire SOLO quanto ci si è mossi da un punto noto, mai un numero
assoluto suo. La LOCALIZZAZIONE (`localizzaTone`, l'ancoraggio iniziale «sei a −12 adesso»)
resta quindi per forza dal Meter se c'è, dichiarata se non c'è — MAI dal solo MUSE, nessuna
combinazione lo permette. Questo non è un'invenzione di questo giro: è la stessa filosofia
già scritta nel motore (« Ron: the relationship between the Tone Scale and ohms is an
arbitrary one… what is important is TONE »), verificata leggendo `localizzaTone` prima di
proporre qualunque formula.

**La formula**: `toneOraMuse` (nuovo) applica la STESSA `toneFromDelta` di sempre — già
scritta nel motore per « qualunque sorgente », non una formula inventata qui — alla carica
EEG invece che al TA. `toneOra` la usa come PRIMARIA quando il MUSE è connesso e c'è un
riferimento valido (`d.hasMuse && toneOraMuse !== null`); altrimenti ricade sulla logica di
sempre (Meter, poi dichiarato). Il margine delle lattine (specifico del Theta-Meter) non si
applica quando è il MUSE a guidare. Il "secondo sguardo" della colonna (`toneOraEeg`, il
trattino tratteggiato "EEG") ora COINCIDE con `toneOraMuse`: quando il MUSE è già il cursore
primario il trattino semplicemente non compare più (la colonna lo disegna solo se diverge di
oltre 3 unità dal cursore) — nessuna riga in più serviva a spegnerlo.

**Due effetti collaterali trovati leggendo il codice, corretti nello stesso giro**:
1. Il testimone strumentale "top" (`toneFired`, per il rapporto) si accendeva solo con
   `toneHasMeter` — un tono che raggiunge +40 guidato dal MUSE senza Meter non l'avrebbe MAI
   acceso, anche se una misura vera lo vedeva arrivarci. Esteso a `toneHasMeter ||
   toneOraMuse !== null`.
2. **Il bug più serio, trovato leggendo `ToneDial.tsx` prima di fidarmi**: `ToneDial`/
   `ToneColumn` non disegnano NULLA (`{hasMeter && (...)}`, un cancello vero, non solo la
   formattazione) se `hasMeter` è falso — e ricevevano `toneHasMeter`, specifico del
   Theta-Meter. Con la nuova priorità, un ciclo guidato dal SOLO MUSE avrebbe lasciato il
   quadrante COMPLETAMENTE VUOTO nonostante `toneOra` avesse ora un valore vero. Aggiunto un
   flag a sé, `toneMisurato` (`toneHasMeter || toneOraMuse !== null`) — `toneHasMeter` resta
   INTATTO ovunque serva restare specifico del Meter (localizzazione, margine, il bottone
   "localizza col meter", tutti in App.tsx E Serenity.tsx, non toccati): `toneMisurato` è
   passato SOLO ai quattro punti di disegno (`hasMeter` prop di `ToneDial`/`ToneColumn`, due
   in ciascuna app).

**Deliberatamente NON toccato**: il campo `source` del rapporto (`ToneCycleRecord`,
`'meter'|'meter+eeg'|'assessed'`) — descrive da dove viene il tono di PARTENZA (la
localizzazione), che questa modifica non cambia affatto (resta sempre Meter-o-dichiarato).
Toccarlo per riflettere "chi guida il movimento" sarebbe stata un'estensione non chiesta.

**⚠️ Limite di verifica, dichiarato apertamente**: questo ambiente di test non ha un MUSE né
un Theta-Meter fisici collegabili — non è stato possibile verificare dal vivo il percorso
CON strumenti veri. Verificato invece: `tsc --noEmit` pulito, `npm run lint` 316 warning
(nessuno nuovo), `vitest run` 639/639 (le funzioni pure `toneFromDelta`/`toneFromTa`,
riusate senza modifiche, restano provate da sole in `toneScale.test.ts`); dal vivo il
percorso SENZA strumenti (TONE armato, "Mort du corps" dichiarato) — nessuna regressione.
**Il percorso con MUSE e/o Meter veri va provato con l'hardware reale prima di fidarsene in
seduta**, sia in SERENITY sia in EQUILIBRIUM.

`git status`: `docs/serenity-refonte.md`, `src/App.tsx`, `src/serenity/Serenity.tsx`,
`src/session/useToneCycle.ts`.

---

## Cinquantatreesimo giro (24/08/2026) — attivare uno strumento durante un ciclo

Segnalato: « quando abbiamo un ciclo in corso dobbiamo poter attivare uno strumento non
attivato ». La pillola MUSE/METER/NESSUNO, in modalità ciclo, disattivava TUTTI i bottoni di
connessione (`onClick` sempre `undefined`) — giusto per non poter STACCARE uno strumento a
metà lettura, sbagliato per chi vuole AGGIUNGERNE uno che non c'era (il MUSE che si scollega
da solo a metà seduta, o il Meter affiancato a ciclo già avviato).

Aggiunto `connesso` a ciascuno strumento della pillola (SOLO lo stato ATTIVO — "in ricerca"
non conta, cliccare durante una ricerca la riprova/annulla, non stacca un dato che arriva
davvero): il bottone resta vivo in modalità ciclo quando lo strumento NON è ancora connesso,
si disattiva SOLO quando cliccarlo disconnetterebbe uno strumento già attivo. "NESSUNO" resta
sempre disattivato a ciclo in corso — è per costruzione un gesto di disconnessione (stacca gli
altri due se acceso), mai di attivazione.

Verificato dal vivo: CONTACT armato, cliccato MUSE (non connesso) — il Giornale conferma che
la ricerca è partita davvero ("Searching for Muses...", prima del fix il click non avrebbe
fatto nulla).

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`.

---

## Cinquantaquattresimo giro (24/08/2026) — la scala dei caratteri armonizzata in tutto `src/serenity/`

Segnalato (analisi del codice, tre motivi confermati insieme): « troppi font diversi insieme,
taglie incoerenti, difficile da leggere in generale ». Contati i letterali `fontSize:` in
TUTTI i file di `src/serenity/`: **oltre venti taglie diverse**, spesso a 0,5px l'una
dall'altra (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 17, 18, 20,
21, 22, 26, 27, 28, 30) — la deriva di decine di giri che hanno ognuno aggiustato UN testo
senza guardare gli altri, non una scala voluta.

**Le FAMIGLIE restavano coerenti** (verificato prima di cambiare qualunque cosa): serif per
le parole umane (domande dei dialoghi, comandi letti a voce, il nome dell'app), sans per
l'interfaccia (etichette, bottoni), mono per i numeri tabulari (TA, orologio, tono) — nessuna
tocca.

**Le TAGLIE si riducono a sei passi** (`tokens.css`, nuovi `--s-fs-micro/sm/base/lg/xl/hero`),
scelti sui grappoli naturali dell'istogramma (i salti più netti, non un taglio a caso): ogni
valore vecchio ricade nel passo più vicino (differenza mai oltre 1,5px, invisibile) — **181
sostituzioni** in 12 file (66 in `Serenity.tsx`, 115 negli altri). Il caso più netto trovato:
i titoli `<h1>` a schermo intero (Avvio, Connessione, PannelloConfig, PannelloEp,
PannelloProfilo) erano **26, 27, 28, 28, 30** — cinque taglie diverse per LO STESSO ruolo in
cinque file diversi — ora tutti `--s-fs-hero` (28px).

**Un'eccezione deliberata, non forzata nella scala**: il campo per scrivere il nome del
profilo (`PannelloProfilo.tsx`, 22px) — nessun altro testo condivide il suo ruolo (un campo
editabile per un nome, non un titolo né un numero), costringerlo nel grappolo più vicino
avrebbe risolto un'incoerenza che non c'era creandone una vera. Commento lasciato sul posto a
spiegare perché resta un letterale.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa (profilo TEST, onboarding, "Edit TEST", il quadrante, CONFIG, la
seduta aperta con Journal/Assessment, EP) — nessuna rottura visiva, gerarchia invariata,
solo più coerente.

`git status`: `docs/serenity-refonte.md`, `src/serenity/tokens.css`, e tutti i file `.tsx` di
`src/serenity/` che avevano almeno un `fontSize:` letterale (12 file).

---

## Cinquantacinquesimo giro (24/08/2026) — quattro segnalazioni verificate, un bug vero trovato nel motore condiviso

**1. L'orologio e il tempo di seduta, tornati coerenti** — segnalato: « le scritte dell'ora
ed altre non sono le stesse ». L'armonizzazione (giro scorso) aveva piegato ciascun valore
VECCHIO guardando solo il numero: 15→base (invariato) e 17→lg (18, +1px) — la coppia
orologio/tempo-seduta, scelta apposta vicina (15/17) qualche giro fa, si è ritrovata con un
gradino diverso (15/18) senza che nessuno lo decidesse. Sono la stessa famiglia di
informazione: ora entrambi `--s-fs-base`. Verificato dal vivo con `getComputedStyle`: 15px
su entrambi.

**2. La scala del tono, spostata completamente fuori dall'arco** — segnalato: « sposta la
tone scale a sinistra, completamente [fuori] della zona arco ». Misurato dal vivo (le due
`<svg>`, coordinate di pagina vere): a `left:12` il riquadro finiva 152px oltre il bordo dove
comincia il disegno del quadrante. Spostato a `left:-150` — verificato di nuovo dal vivo,
con TONE armato: la colonna sta chiaramente a sinistra, mai sopra la curva.

**3. "avec quoi audite-t-on" non chiede più due volte la stessa cosa** — segnalato: « ho
scelto MUSE prima di iniziare la seduta, poi all'apertura mi si richiede di nuovo cosa
utilizzo — è una doppia cosa uguale ». Il cancello di `apri()` guardava `museConnection ===
'connected'` per davvero — la connessione BLE già CONCLUSA — non "l'auditor ha già scelto".
Cliccare MUSE nella pillola dell'intestazione avvia una ricerca ('searching'), non
instantanea: nella finestra fra il click e la connessione vera, aprire la seduta faceva
ripetere la stessa domanda mentre la risposta era già in corso. "Già scelto" ora include
anche la ricerca in corso (MUSE 'searching', Meter 'connecting'), non solo il traguardo.
Non riproducibile fino in fondo in questo ambiente (WebBluetooth fallisce subito, senza
restare in 'searching' abbastanza per il test) — verificato che il caso INVARIATO (nessuno
strumento toccato) continua a mostrare il pannello come sempre.

**4. Il bug vero: "con solo MUSE... la scala del tono resta a 0"** — la caccia più seria di
questo giro. `localizzaTone` (`useToneCycle.ts`) legge `d.qL` dentro un `useCallback` con
`eslint-disable-next-line react-hooks/exhaustive-deps` — le sue dipendenze reali
(`d.hasMuse, toneMeasured, toneHasMeter, toneAssessed, taCorretto`) NON includono `d.qL`
(deliberatamente: `qL` cambia molte volte al secondo, ricreare la funzione a ogni tick
sarebbe stato uno spreco). Ma questo significa che la CLOSURE catturava `d.qL` di qualunque
render l'avesse ricreata l'ultima volta — non necessariamente quello in cui l'auditor preme
"Localizza" davvero. Con Meter e MUSE insieme il TA (una dipendenza vera) ricreava la
funzione abbastanza spesso da non farlo notare; con SOLO il MUSE, NESSUNA delle dipendenze
elencate cambia più — `localizzaTone` smette di ricrearsi, e il riferimento `qL` catturato
resta quello di ore prima, spesso vicino a zero per puro caso. Stesso rimedio già in uso nel
file per lo stesso problema (`toneMeasuredRef`): uno specchio (`qLRef`) sempre aggiornato nel
corpo della funzione, letto dentro la callback al posto del parametro diretto — non una
formula nuova, la correzione di un bug di dipendenze mancanti.

⚠️ **Non risolto in questo giro, chiesto chiarimento**: la parte "non vedo il TA" — durante
TONE, `agoEeg` (che decide se mostrare il pannello della lettura ago nuda) è forzato a
`false` SEMPRE (`toneAttivo ? false : ...`), un comportamento preesistente allineato a
App.tsx (« TONE impone SEMPRE il Meter », mai la preferenza generale) — scritto PRIMA che
il MUSE potesse guidare TONE da solo. Non toccato senza conferma: decide se il pannello
della lettura nuda debba restare visibile anche con solo il MUSE.

Verificato: `tsc --noEmit` pulito, `npm run lint` 316 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa per i punti 1/2/3 (profilo TEST). Il punto 4 tocca il motore
condiviso — nessun hardware reale disponibile per una verifica end-to-end, il fix è stato
verificato per lettura/ragionamento, non dal vivo con un MUSE fisico.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`,
`src/session/useToneCycle.ts`.

---

## Cinquantaseiesimo giro (24/08/2026) — verifica del codice, codice morto tolto, letture di storage duplicate consolidate

Chiesto esplicitamente: verificare di nuovo il codice, togliere codice morto, ottimizzare
dove serve — **senza cambiare calcoli, sistemi o modo di calcolo, senza rompere nulla**.
Perimetro: `src/serenity/` (l'unica zona che SERENITY può toccare) più i due file del motore
condiviso appena corretti (`useToneCycle.ts`, invariato in questo giro — nessun altro difetto
trovato lì).

**Il linter come prima passata** — `npm run lint` segnala SOLO `Serenity.tsx` in tutto
`src/serenity/` (tutti gli altri 13 file: puliti). Tre punti:
1. `AVVIO_VUOTO` importato da `flussoAvvio.ts` e mai usato — tolto (il tipo `Avvio` accanto
   resta, quello serve).
2. `isHoldMode` — il VALORE non era mai letto in questo file, solo il suo setter
   (`setIsHoldMode`, passato al motore condiviso). `const [isHoldMode, setIsHoldMode]` →
   `const [, setIsHoldMode]`: il motore continua a scriverlo esattamente come prima, qui si
   tiene solo il pezzo usato davvero.
3. Un `as any` superfluo (`journal.addLog(e as any)`, passato a `useMuseContactGate`) —
   verificato che i due tipi (`Omit<LogEntry,'time'> & {time?:number}`) sono IDENTICI, stesso
   `LogEntry` importato dallo stesso posto: il cast zittiva un disallineamento che non
   esisteva. Tolto, la funzione passa diretta. Un secondo `as any` simile (riga 655, verso
   `useMuseConnection`) è rimasto: lì i due tipi sono davvero diversi (`time` obbligatorio
   contro opzionale, `speaker`/`type` stringhe larghe contro union stretti) — toccarlo per
   bene vorrebbe dire cambiare la firma di un hook condiviso con EQUILIBRIUM, fuori dal
   perimetro di "senza cambiare i sistemi".

**Oltre il linter — l'ottimizzazione vera trovata**: `getProfiles()`/`getPcProfiles()`
(`lib/storage.ts`) rileggono e ri-analizzano (`JSON.parse`) l'intero armadio profili da
`localStorage` a OGNI chiamata. Nel corpo del render (eseguito a OGNI render, non solo
all'apertura) venivano chiamate **7 volte** in punti diversi per lo stesso identico armadio:
nome auditor, nome preclear, sesso del preclear, la foto per `HistoryModal`. Consolidate in
`profiliAuditor`/`profiliPreclear`, lette UNA volta per render invece di ripetutamente — nello
stesso render sincrono `localStorage` non può cambiare nel frattempo, quindi stesso identico
risultato con una lettura invece di tre. **Due chiamate lasciate intatte, di proposito**:
quelle dentro il gestore di chiusura seduta (righe ~1787-1788) — lì la lettura fresca al
momento dell'evento è quel che serve davvero (l'auditor potrebbe aver cambiato la propria foto
durante la seduta), consolidarle con le letture di render avrebbe introdotto un dato
potenzialmente vecchio: la stessa distinzione fra "sempre fresco per costruzione" (dentro il
render) e "fresco al momento dell'evento" (dentro un gestore) di sempre.

**Cercato e NON trovato**: blocchi di codice disattivato/commentato, file di `src/serenity/`
mai importati da nessuna parte, cicli ripetuti sullo stesso array (`journal.logs`/
`assessItems`) nello stesso blocco, `JSON.parse`/regex ricreati inutilmente altrove — il resto
del file era già in ordine.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (**−3** rispetto a prima, i tre
punti tolti — nessun nuovo warning), `vitest run` 639/639, dal vivo (profilo TEST) — nome
auditor nel pill dell'intestazione e profilo attivo nello Storico, entrambi corretti dopo il
consolidamento delle letture.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`.

---

## Cinquantasettesimo giro (25/08/2026) — il fondo del test squeeze/breath, ANNULLA che non annullava più, NO INSTRUMENT che si riattiva da solo, l'assistente IA dietro un'icona

**Il fondo del test squeeze/breath, non più un nero a parte** — segnalato: « il fondo sembra
essere nero, diverso sia da DARK che LIGHT ». `ThetaReadyCheck.tsx` (condiviso con
EQUILIBRIUM) porta un `background` fisso `rgba(2,6,23,0.97)` — un blu-nero, diverso dal nero
NEUTRO di SERENITY (`--s-ground` scuro, `#17181a`). Il pannello è un cassetto laterale, non un
velo (il suo stesso commento: « il quadrante deve restare visibile e leggibile ») — pensato
per convivere con lo sfondo attorno, non per essere un'interruzione a sé come Guide/Crediti.
`var(--tr-bg, quel-blu-di-sempre)` nel componente condiviso: il fallback resta ESATTO per
App.tsx (zero cambiamento, non definisce mai questo token); SERENITY lo punta al proprio nero
vero in `tokens.css`. Resta scuro in ENTRAMBI i temi di SERENITY (non diventa bianco in
LIGHT): i testi interni sono chiari e fissi, cambiare solo il fondo li renderebbe illeggibili
— la stessa scelta già presa per `HealthPanel` (« le sue zone interne restano il proprio
schermo scuro, per scelta »).

**ANNULLA che apriva la seduta lo stesso** — segnalato: « se schiacci Cancel o Start Anyway fa
partire la seduta comunque ». Verificato App.tsx: per QUESTO controllo (stretta/respiro del
Meter) `onCancel={() => setMetabolicOpen(false)}` — chiude e basta, non apre mai la seduta. Il
commento in SERENITY (« nessuno dei due blocca per davvero... è consultivo ») descriveva
`MetabolicCheck` (il respiro del MUSE, dove App.tsx SÌ apre la seduta anche da ANNULLA — quello
resta) — un'invenzione presa in prestito dal componente sbagliato. Corretto a chiudere soltanto.

**NO INSTRUMENT che si riattiva da solo** — segnalato: « quando sei in seduta e disattivi il
METER e/o il MUSE e non hai più strumenti connessi, il bottone NO INSTRUMENT deve attivarsi,
invece non lo fa ». Il verso "attivo UNO strumento → esco dal gruppo di controllo" esisteva
già; il verso opposto no. Un nuovo effetto: a seduta aperta, se `senzaStrumenti` è ancora
falso e MUSE è per davvero `disconnected` (non `'searching'` — un tentativo in corso non è un
niente) e il Meter non è connesso, si attiva da sé. Verificato dal vivo: MUSE scelto
all'apertura, connessione fallita nel sandbox (nessun hardware) → il pallino di "SANS
INSTRUMENTS" diventa verde da solo.

**L'assistente IA, dietro un'icona** — segnalato: « riduci la finestra di connessione a GEMINI
sotto forma di un'icona, che si apra quando schiacci, così recuperiamo spazio e non
disturbiamo l'auditor. Porta l'icona dopo config e prima di guide ». `AIAssistant`
(condiviso) monta da sé una barra sempre larga fino a 380px — mai un'icona sola. Non toccato
il componente: SERENITY decide solo SE montarlo, dietro un'icona propria (`Brain`, la stessa
che il componente usa per il suo bottone interno) con un popover, spostata fra CONFIG e Guide
(era dopo Guide, un giro fa — riposizionata su richiesta esplicita). Verificato dal vivo:
l'ordine nell'intestazione è CONFIG → assistente IA → Guide, la barra compatta non è più
sempre a vista, si apre e si chiude col click sull'icona.

**⚠️ Limite di verifica**: i primi due punti (il fondo di `ThetaReadyCheck`, ANNULLA)
riguardano il test squeeze/breath del Theta-Meter — raggiungibile solo con un Meter fisico
connesso, assente in questo ambiente. Verificati per lettura/confronto diretto col codice di
App.tsx, non end-to-end dal vivo.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo per NO INSTRUMENT e l'icona IA (profilo TEST, 1400×900).

`git status`: `docs/serenity-refonte.md`, `src/components/ThetaReadyCheck.tsx`,
`src/serenity/Serenity.tsx`, `src/serenity/tokens.css`.

---

## Cinquantottesimo giro (25/08/2026) — il popover di Gemini dentro lo schermo, assessment attivo/aperto separati, i cicli molto più grandi, l'arco che sparisce senza strumenti, il tema chiaro più leggibile

**Il popover di Gemini usciva dallo schermo** — segnalato: « una parte della zona resta
fuori dalla finestra ». `left:0` faceva crescere il popover verso DESTRA dall'icona, vicino
al bordo destro (fra CONFIG e Guide) — e la barra di `AIAssistant` dentro è larga almeno
380px: usciva sicuramente. `right:0`, come il popover dell'assetto già a fianco: cresce
verso sinistra, dentro lo schermo.

**Assessment: attivo/disattivo separato da aperto/chiuso** — segnalato: « deve poter essere
disattivato ma lasciando vedere gli item con le reazioni, poiché utili all'auditor. Separa la
chiusura dalla disattivazione ». I due gesti erano lo STESSO click (`attivo` unico, gating sia
la cattura sia la vista). Ora due bottoni distinti, non uno annidato nell'altro: il TITOLO
(con la freccia ▸/▾) apre/chiude la VISTA (`espansa`, nuovo stato locale — mai tocca la
cattura); l'ANELLO resta SOLO l'interruttore della cattura (mai tocca la vista). Il messaggio
"in ascolto…" ora distingue: pulsa solo se sta davvero ascoltando, altrimenti dice "cattura
disattivata" senza animarsi. Verificato dal vivo: item catturato, cattura disattivata (dice
ACTIVER) — l'item resta visibile con Oui/Non ancora lì.

**Le scritte dei cicli, molto più grandi** — segnalato: « DEVONO ESSERE BEN VISIBILI ». Tre
punti, tutti locali a SERENITY (nessuno condiviso con App.tsx, liberi di crescere): il
"comando" di `SuggerimentoCiclo` (la citazione esatta) da `--s-fs-sm` a `--s-fs-lg`; il badge
del metodo da `--s-fs-sm` a `--s-fs-base`, l'ITEM da `--s-fs-base` a `--s-fs-lg`; la pista
(`CycleSteps`) da `scala={1.5}` a `scala={2}` (18px il testo, 30px i cerchi — il prop
opzionale già esisteva apposta per questo).

**Senza strumenti, l'arco sparisce e le scritte prendono il suo posto — COME IN EQUILIBRIUM**
— segnalato esplicitamente. Verificato App.tsx: monta `<QuantumSphere>` SOLO `!senzaMisura`
(`noInstruments({muse,theta})`, la STESSA funzione pura condivisa — non un'invenzione); a
seduta aperta senza strumenti, un blocco di testo grande (titolo, comando, "come" — con
`comeSenzaAgo`/`senzaNumero`, PORTATI PAROLA PER PAROLA da App.tsx, che evitano di nominare
un ago che non c'è) prende il suo posto, centrato dove l'arco stava. Stessa condizione per
l'arco secondario (ClearDial/MirrorDial/ToneDial). Solo `aperta`, non `!aperta`: prima di
aprire, l'arco resta — è lì che vive il bottone PLAY al centro, un disegno SERENITY che
App.tsx non ha. I bottoni per avanzare il ciclo restano SOLO nella barra comandi (già sempre
montati lì, con o senza strumenti) — SERENITY non li duplica come fa App.tsx. Verificato dal
vivo: seduta senza strumenti, CONTACT armato — l'arco è sparito del tutto, "DONNE L'ITEM /
Écris-le ou dis-le, puis appuie." (il testo `comeSenzaAgo`, non quello normale che avrebbe
nominato l'ago) al centro, grande.

**Il tema chiaro, i colori del testo ricalcolati per il contrasto vero** — segnalato di
nuovo: « le scritte devono essere più visibili, più scure ». Calcolato il contrasto WCAG
reale (luminanza relativa sRGB, non a occhio): `--s-ink-faint` (`#84898e`) su `--s-ground`
(`#f4f3f0`) rendeva ≈2,6:1 — ben sotto il minimo leggibile (4,5:1); `--s-ink-soft`
(`#54585d`) ≈2,5:1, stesso problema — una scurita precedente (« un passo ciascuna ») non
bastava. Ricalcolati sui target: `--s-ink-soft` → `#3d4045` (≈7:1), `--s-ink-faint` →
`#63676c` (≈4,5:1, il minimo AA). `--s-ink-ghost` invariato — è il punto "nessun segnale"
degli indicatori/bordi, non testo da leggere. Verificato dal vivo, tema chiaro: onboarding,
seduta aperta, Giornale, Assessment, MNA — tutti i testi nettamente più leggibili.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa (profilo TEST, 1400×900, entrambi i temi) — tutti e cinque i punti
confermati.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`,
`src/serenity/ZonaAssessment.tsx`, `src/serenity/tokens.css`.

---

## Cinquantanovesimo giro (25/08/2026) — la pista dei tempi a fuoco, sovrapposta all'arco

**Segnalato**: le "steps" del ciclo (ITEM · MOCK-UP · AS-IS, e le sequenze equivalenti di
NULL/MIRROR/TONE) devono stare a SINISTRA dell'arco, senza ridurlo né spostarlo, sovrapposte
con trasparenza in modo che l'ago resti tracciabile sotto; il tempo in corso deve essere il
"principale" — più grande, al centro — e i vicini più piccoli e smorzati, per guidare
l'attenzione dell'auditor; un clic su un tempo qualunque deve poterlo mettere a fuoco.

**`PistaCiclo.tsx`, nuovo componente, SOLO SERENITY.** `CycleSteps` (orizzontale, già nella
barra comandi sopra il quadrante) resta dov'era — non la sostituisce, è la lettura estesa,
pensata per restare sovrapposta all'arco per tutta la durata del tempo in corso. Stessi dati
puri di sempre, le STESSE funzioni che legge `components/CycleSteps.tsx`
(`engine/cycleSteps.ts`: `stepsOf`/`currentStep`/`stepDone`) — nessuna logica nuova, solo una
resa diversa dello stesso dato: non può divergere da lui su quanti tempi ci sono o a quale si
è.

**Il fuoco manuale non sposta MAI il tempo reale.** Non esiste, e non deve esistere, un
motore che sappia "salta al tempo 2" — il ciclo lo fa avanzare solo un gesto vero (dare
l'item, validare l'AS-IS, dichiarare raggiunto...). Un clic su un tempo passato o futuro
mette a fuoco visivamente quel tempo per rileggerlo (`useState<number|null>`, di nome
`fuoco`), ma torna da solo al tempo vero non appena il ciclo avanza davvero
(`useEffect(() => setFuoco(null), [cur])`): un clic che spostasse il tempo reale
mentirebbe sullo stato dell'audit, esattamente quello che questa pista non deve mai fare.

**La geometria, verificata sul DOM, non solo sulla carta.** Il bordo sinistro vero del
disegno dell'arco è a x=320 relativo a `<section>` (`paddingLeft:320` per la barra laterale,
poi il quadrante comincia — misurato via `getBoundingClientRect()` sull'SVG di
`QuantumSphere`, 340px dal bordo della finestra a 1280px, meno i 20px di margine della
sezione: torna esatto). `PistaCiclo` parte 20px prima di quel bordo (`left:300`) e si estende
per 250px: circa 230px dentro il disegno vero dell'arco — sovrapposizione vera, non solo un
accostamento, con `pointerEvents:'none'` sul contenitore e `'auto'` solo sui singoli bottoni
(non ruba clic al quadrante nei punti senza testo). Solo il tempo a fuoco porta un fondo
proprio (`color-mix(in srgb, var(--s-ground) 42%, transparent)`, tarato per restare leggibile
su qualunque colore dell'arco sotto senza spegnere l'ago che ci passa dietro); i tempi non a
fuoco restano puro testo, senza impilare altri riquadri semitrasparenti sopra il quadrante.
Montata con la STESSA condizione di `QuantumSphere`/dell'arco (`!senzaMisura`): senza
strumenti l'ago non c'è, e sovrapporsi a un arco assente non avrebbe senso — la guardia
interna del componente (`cur < 0`, la stessa di `CycleSteps`) copre da sé LIBERO e "ciclo non
armato", nessuna condizione esterna in più da tenere sincronizzata.

**Limite di questa verifica.** La sovrapposizione ago/pista è stata controllata a livello
geometrico (misure DOM esatte, come sopra) e di codice (nessun conflitto di `pointerEvents`),
ma non con un ago VERO in movimento: l'anteprima nel browser non può appaiare un MUSE o un
Theta-Meter reali (Bluetooth/WebHID di un dispositivo fisico). Da verificare nell'app
pacchettizzata, con uno strumento davvero connesso — gli scarti di posizione, se ce ne sono,
si correggono da lì.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo nel browser (profilo TEST, 1280×720): nessun errore di compilazione/HMR,
nessun errore in console, geometria dell'arco confermata via DOM.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`,
`src/serenity/PistaCiclo.tsx` (nuovo).

---

## Sessantesimo giro (25/08/2026) — i procedimenti da PROCESSUS, dentro lo spazio comandi dei cicli

**Segnalato**: poter scegliere, dentro PROCESSUS, un procedimento preso da una cartella
`COMANDI/Procedimenti`; una volta scelto, i suoi comandi devono comparire nello spazio comandi
dei cicli (la pista appena fatta, giro precedente), ereditando la stessa trasparenza.

**La cartella non esisteva — l'ho creata io, non l'auditor a mano.** Cercata ovunque (repo e
filesystem): non c'era, e PROCESSUS oggi è solo un archivio di PDF opachi (`ProcessusModal.tsx`
+ IndexedDB), senza estrazione di testo — nessun "comando" strutturato da nessuna parte.
Chiesto all'utente il formato voluto; risposta: « decidilo tu, così la creo di conseguenza ».
Scelta, per coerenza con `CORPUS_DIR` (`~/EQUILIBRIUM/corpus`, già lo stesso principio — una
cartella sotto HOME, non dentro `userData`, che si apre in Finder, si copia, si scrive a mano):

- **`~/EQUILIBRIUM/COMANDI/Procedimenti/`** — un file **`.txt`** per procedimento.
- **Il nome del file (senza `.txt`) è il titolo** mostrato nell'app.
- **Un comando per riga.** Righe vuote e righe che iniziano con `#` (note dell'auditor) non
  contano come comando.
- **Un bottone "apri cartella" in PROCESSUS** la crea (se manca) e la apre in Finder —
  l'auditor non deve conoscerne il percorso a memoria né fare `mkdir` a mano.

**Tre file condivisi toccati, con aggiunte SOLO additive** (per questo entrambi i DMG, questo
giro):
- **`main.cjs`** — due `ipcMain.handle` nuovi (`procedimenti-list`, `procedimenti-folder-open`),
  accanto a `corpus-append`/`corpus-folder` con la stessa forma. Nessuna riga esistente
  toccata.
- **`preload.cjs`** — due voci nuove su `electronAPI` (`listProcedimenti`,
  `openProcedimentiFolder`). Nessuna voce esistente toccata.
- **`components/ProcessusModal.tsx`** — tre prop nuove, **tutte opzionali**
  (`procedimenti?`, `onSelectProcedimento?`, `onApriCartellaProcedimenti?`). La sezione
  PROCEDIMENTI si disegna solo se `procedimenti !== undefined`: App.tsx (EQUILIBRIUM) non la
  passa, quindi il suo `ProcessusModal` resta **esattamente com'era** — verificato leggendo il
  suo punto di montaggio (`App.tsx:6920`), nessuna delle tre prop nuove è lì.

**`lib/procedimenti.ts`, nuovo** — lo stesso schema di `corpusWriter.ts`: legge via
`window.electronAPI`, fuori da Electron (l'anteprima nel browser, i test) torna lista vuota e
non fa nulla, senza eccezioni.

**`PistaProcedimento.tsx`, nuovo, SOLO SERENITY** — stesso slot fisico di `PistaCiclo` (stessa
posizione sovrapposta all'arco, stessa trasparenza, stesso comportamento visivo a
fuoco/distanza), ma un componente A SÉ e non una variante: `PistaCiclo` non lascia MAI che un
clic sposti il tempo REALE del ciclo (v. la sua nota, giro precedente) — un procedimento
invece è testo puro, senza stato d'audit da proteggere, e lì il clic PUÒ spostare liberamente
il fuoco. Mescolare le due logiche in un componente condizionale sarebbe stata la fonte di
errori silenziosi che quella nota mette in guardia. `Serenity.tsx`: `procedimentoAttivo`
(scelto nel popover PROCEDIMENTI) sostituisce `PistaCiclo` nello stesso slot finché l'auditor
non lo chiude col ✕ dentro `PistaProcedimento` — mai i due sovrapposti.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, `node -c main.cjs`/`node -c preload.cjs` puliti, dal vivo nel browser (profilo TEST):
PROCESSUS si apre con la sezione PROCÉDÉS (tradotta), stato vuoto corretto, "OUVRIR LE DOSSIER"
non genera errori fuori da Electron, nessun errore nuovo in console.

`git status`: `docs/serenity-refonte.md`, `main.cjs`, `preload.cjs`,
`src/components/ProcessusModal.tsx`, `src/serenity/Serenity.tsx`,
`src/lib/procedimenti.ts` (nuovo), `src/serenity/PistaProcedimento.tsx` (nuovo).

---

## Sessantunesimo giro (25/08/2026) — due bug in LIGHT (uno vero, uno di tecnica), note nei procedimenti, scorrimento a rotellina/frecce

**Segnalato**: « in LIGHT non si vedono le scritte del READY FOR SESSION »; « le reazioni del
MUSE non si leggono in LIGHT »; sul formato PROCEDIMENTI, in francese: domande numerate in
sequenza, commenti sotto la domanda senza numero (anche su più righe), scorrimento a
rotellina/frecce fra i comandi.

**Le reazioni del MUSE, bianche fisse — bug vero, in `Serenity.tsx`.** La scritta di reazione
(FALL/SF/LONG FALL…) sopra l'arco era stata portata da App.tsx un giro fa, « TALE E QUALE »,
sigle comprese — ma non il colore: `const BIANCO = 'rgba(255,255,255,0.92)'`, FISSO, mai
condizionato da `isLightTheme`. In App.tsx questo non è un bug: quell'area è SEMPRE scura, una
costante di EQUILIBRIUM. In SERENITY l'arco cambia fondo col tema (« il principio dimensionale »
— EQUILIBRIUM detta struttura, non colore): lo stesso bianco fisso, in tema chiaro, finiva su un
fondo perla. Ora `BIANCO = isLightTheme ? 'var(--s-ink)' : 'rgba(255,255,255,0.92)'` —
`AMBRA` (il Meter) resta invariata, è già un colore saturo leggibile su entrambi i fondi.

**« READY FOR SESSION » — non un colore dimenticato: la TECNICA di `readyCheckLight.css` non
aveva MAI funzionato.** Tre giri di "corretto di nuovo" avevano ritoccato i valori di
sostituzione senza scoprire che i selettori non si agganciavano affatto. Verificato in console:
```js
el.style.color = 'rgba(240,246,255,0.95)'; el.getAttribute('style')
// → "color: rgba(240, 246, 255, 0.95);"  — UNO SPAZIO dopo ogni virgola
```
Il browser NORMALIZZA una `rgba(a,b,c,d)` assegnata a una proprietà DIRETTA, aggiungendo uno
spazio dopo ogni virgola nell'attributo `style` serializzato — i selettori del foglio erano
scritti SENZA quello spazio (`[style*="rgba(240,246,255"]`): non hanno mai fatto match, su
NESSUNA proprietà diretta, da quando il file esiste. La sola eccezione è una `rgba` dentro il
FALLBACK di un `var(--tr-bg, rgba(2,6,23,...))`: quel testo il browser lo conserva pari pari,
senza spazi (non lo riconosce come colore da normalizzare, è un token opaco dentro `var()`) —
per questo il pannello di `ThetaReadyCheck` (background dentro un `var()`) si ritingeva DAVVERO
mentre il suo stesso titolo (`color` diretto) restava bianco: fondo forzato chiaro + testo
rimasto bianco fisso = invisibile, esattamente « READY FOR SESSION » sparito. Corretto
aggiungendo per OGNI famiglia di colore ENTRAMBE le forme (con e senza spazio) come selettori
alternativi — funziona qualunque sia la proprietà, diretta o dentro un `var()`. Verificato non
sul DOM vero (serve un Meter connesso, non riproducibile nel browser di anteprima) ma con un
elemento sintetico nella stessa pagina, stessa tecnica, `data-tema='chiaro'` e
`.ser-ready-wrap` veri: `getComputedStyle(title).color` → `rgb(15, 23, 42)` (l'inchiostro
scuro atteso, non più bianco).

**Le note nei procedimenti — segnalato in francese, formato rivisto.** Prima ogni riga con `#`
veniva SCARTATA (letta come "nota per chi scrive il file", mai mostrata). Ora si aggancia al
comando appena prima invece di sparire: una riga SENZA `#` è un nuovo comando (prende il
numero successivo in sequenza); una riga CON `#` è una nota di quel comando (il testo dopo il
cancelletto, SENZA numero, può ripetersi su più righe); una riga vuota è solo un separatore.
`main.cjs` fa l'aggancio in lettura (`ComandoProcedimento = {testo, note: string[]}`,
`lib/procedimenti.ts`); `PistaProcedimento.tsx` mostra le note sotto il comando, in corsivo,
SOLO quando quel comando è a fuoco (altrimenti affollerebbero una pista già smorzata).

**Scorrimento a rotellina e frecce, in `PistaProcedimento.tsx`.** `onWheel` sul contenitore
avanza/arretra il fuoco di un comando per "tacca" (cooldown di 220ms — un trackpad manda
decine di eventi per un solo gesto, senza freno la pista salterebbe più comandi insieme);
`onKeyDown` con `tabIndex` + autofocus al montaggio fa lo stesso con ↑/↓ e ←/→. Il clic diretto
su un comando resta il modo primario — queste sono scorciatoie in più.

**Perché SOLO `PistaProcedimento`, non anche `PistaCiclo`.** I comandi di un procedimento sono
testo puro, senza stato d'audit da proteggere: scorrere/cliccare liberamente è la loro
funzione. I tempi del CICLO invece sono legati al motore vero — permettere lo stesso
scorrimento libero lì avrebbe fatto sembrare che rotellina/frecce potessero "avanzare" un
ciclo reale, che è esattamente quel che la nota di `PistaCiclo` (giro scorso) vieta.

**Non affrontato in questo giro, segnalato genuina ambiguità**: « le scritte dei cicli devono
essere tutte al lato sinistro, sotto il TA, tutte quelle in alto ». Lo spazio a sinistra è già
conteso da tre elementi con vincoli propri — la barra laterale APRI/PAUSA/CONTACT/NULL/MIRROR/
TONE (`position:absolute, left:20, width:272`, il suo `top` calcolato dinamicamente
dall'altezza di `.ser-comandi` — misura che uno spostamento di `.ser-comandi` stessa
romperebbe), la lettura TA (dentro `<section>`, `top:14, left:16`) e `PistaCiclo`/
`PistaProcedimento` (appena fatti, `left:300`, sovrapposti all'arco). Spostare l'intera barra
comandi (`.ser-comandi`: campo item, i quattro blocchi per metodo, `SuggerimentoCiclo`, i
bottoni di avanzamento) in quello stesso spazio senza poterne verificare dal vivo la resa in
OGNI modalità (serve hardware connesso per MUSE/Meter, TONE, MIRROR) rischia di sovrapporre
elementi già esistenti invece di limitarsi a spostarne uno — richiede una decisione sul layout
che non è sicuro indovinare alla cieca. Chiesto all'utente come vuole risolvere la
sovrapposizione prima di implementare.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, `node -c main.cjs` pulito, verificato dal vivo (elemento sintetico per il fix LIGHT,
console pulita per il resto — nessun errore nuovo).

`git status`: `docs/serenity-refonte.md`, `main.cjs`, `src/serenity/Serenity.tsx`,
`src/serenity/readyCheckLight.css`, `src/serenity/PistaProcedimento.tsx`,
`src/lib/procedimenti.ts`, `src/components/ProcessusModal.tsx`.

---

## Sessantaduesimo giro (25/08/2026) — la barra comandi dei cicli, dalla cima allo schermo alla barra laterale

**Segnalato di nuovo, con una risposta questa volta**: « le scritte dei cicli devono essere
tutte al lato sinistro, sotto il TA, tutte quelle in alto » — chiesto dove esattamente,
risposto: « dentro la barra laterale esistente ».

**Il problema tecnico, non solo estetico.** `.ser-comandi` (l'item, i quattro blocchi per
metodo con badge/pista/`SuggerimentoCiclo`, i bottoni di avanzamento) era una riga ORIZZONTALE,
`position` normale, SECONDA riga della griglia di `<main>` (`gridTemplateRows:'auto auto 1fr'`
— header/comandi/quadrante). La barra laterale (APRI/PAUSA/CONTACT/NULL/MIRROR/TONE) già
misurava `.ser-comandi` (`comandiRef`) per sapere DOVE cominciare, restando sempre sotto di
lei. Spostare `.ser-comandi` a sinistra significava toccare l'anello che tutto questo tiene
insieme — a farlo alla cieca (senza verificare dal vivo OGNI modalità) si rischiava di
sovrapporre la nuova colonna proprio alla barra che la misura.

**La catena a DUE anelli, non uno.** Prima: `<header>` in flusso normale → `.ser-comandi` in
flusso normale, subito sotto → barra laterale, misurata (`comandiRef`/`sidebarTop`) per
restare sotto `.ser-comandi`. Ora: `.ser-comandi` esce dal flusso (`position:absolute`) e
diventa lei stessa un riquadro ancorato a sinistra — le serve un PRIMO anello nuovo
(`headerRef`/`comandiTop`, stessa tecnica: `useLayoutEffect` senza dipendenze, guardia
`Math.round`+confronto per non ridisegnare all'infinito) per sapere dove comincia LEI, subito
sotto `<header>`. Il SECONDO anello (`comandiRef`/`sidebarTop`) non è stato toccato: misurava
`.ser-comandi` prima, la misura ancora ora — `offsetTop`/`offsetHeight` funzionano uguali che
l'elemento sia in flusso o assoluto, riportano il suo rettangolo VERO in entrambi i casi. La
barra laterale continua a seguire `.ser-comandi` come sempre; `.ser-comandi` ha solo imparato a
seguire `<header>` a sua volta.

**`<main>`, due righe di griglia non più tre.** Verificato sul DOM (non solo sulla carta):
appena `.ser-comandi` diventa assoluta, un `position:absolute` esce dal flusso della griglia —
`<main>` vede solo `<header>` e `<section>` come figli IN FLUSSO. Lasciare
`gridTemplateRows:'auto auto 1fr'` (tre righe) avrebbe messo `<section>` (il quadrante) sulla
SECONDA riga (`auto`, strizzata) invece dell'ultima (`1fr`, elastica) — lo stesso bug già
trovato un giro fa con l'ordine sbagliato dei figli, stavolta con un figlio in meno. Corretto a
`'auto 1fr'`.

**`flexBasis` → `width`, l'asse è cambiato.** Due punti dentro `.ser-comandi`
(`<CycleSteps>`/`<CycleStatusBar>`) forzavano `flexBasis:'100%'` per andare a capo in una riga
ORIZZONTALE — sull'asse principale, cioè la larghezza. In una colonna VERTICALE l'asse
principale è l'ALTEZZA: lo stesso `flexBasis:'100%'` avrebbe fatto crescere quei due elementi
fino a occupare tutto lo spazio verticale disponibile, schiacciando o facendo traboccare il
resto. Cambiati in `width:'100%'` — la proprietà giusta sull'asse TRASVERSALE di una colonna.

**Stessa larghezza e stesso bordo della barra laterale** (`left:20, width:272`): non due
colonne accostate a caso, una sola colonna visiva — esattamente « dentro la barra laterale
esistente ». `maxHeight`/`overflowY:'auto'` come rete di sicurezza se un giorno il contenuto
di un metodo diventasse più alto dello spazio libero.

Verificato dal vivo (profilo TEST, 1280×720, ENTRAMBI i temi): CONTACT (badge+item+pista+
CycleStatusBar+2 bottoni), NULL (3 bottoni d'esito invece di 2 — il caso più alto), TONE (il
selettore del valore assessed) — in tutti e tre, `.ser-comandi` impilata correttamente sotto
`<header>`, la barra laterale (FERMER LA SÉANCE/pausa/EP/Journal) sempre subito sotto di lei
senza sovrapposizioni, nessun taglio del contenuto. MIRROR non verificato dal vivo (stesso
`testataCiclo`/`pillBtn` di CONTACT/NULL, nessuna riga diversa) ma stessa logica.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo estesa come sopra — nessun errore in console (a parte gli `ERR_CONNECTION_
REFUSED` preesistenti, non legati a questo giro).

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`.

---

## Sessantatreesimo giro (25/08/2026) — la pista dei cicli/procedimenti, allineata a sinistra col METER TA

**Segnalato**: « le procedimenti avec question et les CYCLES doivent etre plus a gauche
alignès a gauche avec le METER TA ».

`PistaCiclo.tsx`/`PistaProcedimento.tsx` (giro 59/60) sovrapponevano l'arco da `left:300` —
scelto allora per stare DENTRO il disegno vero del quadrante (x=320). Ora `left:16`, LO STESSO
valore del blocco della lettura TA (`top:14, left:16`, stesso `<section>`, dove vive "METER
TA") — non un numero vicino, lo stesso bordo sinistro: la pista legge come il proseguimento
verticale della colonna TA (TA sopra, tempi/comandi del ciclo sotto), non più come
un'etichetta accostata al centro dell'arco. Nessuna riga di `QuantumSphere`/`ClearDial`
toccata — stesso principio delle due volte precedenti.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639. Non verificabile dal vivo con contenuto reale (`PistaCiclo`/`PistaProcedimento`
compaiono solo `!senzaMisura`, quindi con un MUSE o un Meter davvero connesso — l'anteprima
nel browser non può appaiare un dispositivo fisico); il numero è preso PARI PARI da quello già
verificato sul DOM del blocco TA (stesso `<section>`, stessa origine), quindi a basso rischio —
ma la resa vera va confermata nell'app pacchettizzata.

`git status`: `docs/serenity-refonte.md`, `src/serenity/PistaCiclo.tsx`,
`src/serenity/PistaProcedimento.tsx`.

---

## Sessantaquattresimo giro (25/08/2026) — il fuoco resta visibile scorrendo, si può chiudere la pista, comincia sotto NEEDLE LIGHT

**Segnalato**: « quand on scrolle les commandes elles doivent se positionner dans la fenêtre
pour rester visible, maintenant ce n'est pas le cas »; « il faut pouvoir fermé les commandes »;
« fais commencer les commandes en dessous de needl light ».

**Il fuoco che usciva dallo schermo, in `PistaProcedimento.tsx`.** Cambiare `fuoco` (clic,
rotellina, frecce) cambiava taglia/opacità del comando ma non garantiva che restasse DENTRO la
parte visibile del contenitore (`overflowY:'auto'`, altezza limitata) — con molti comandi,
scorrere con le frecce poteva mettere a fuoco una riga già fuori dallo scorrimento corrente,
invisibile finché non si scorreva anche a mano. Aggiunto `righeRef` (un ref per riga) e un
`useEffect` su `[fuoco]` che chiama `scrollIntoView({block:'nearest', behavior:'smooth'})`:
sposta lo scorrimento SOLO se la riga a fuoco non è già visibile — mai un salto a metà pista
per un comando già in vista.

**La chiusura, in `PistaCiclo.tsx`.** `PistaProcedimento` aveva già un ✕ (chiude tornando alla
pista del ciclo); `PistaCiclo` no — restava sempre a schermo finché un ciclo era armato. Un
nuovo stato locale `chiuso` (nessuna riga nuova in `Serenity.tsx`, resta un dettaglio del
componente): chiusa, la pista si riduce a una piccola maniglia (`› MOCK-UP`, il nome del tempo
a fuoco) che riapre al clic — mai sparita per sempre, l'auditor l'ha chiusa per un momento, non
ha smesso di auditare.

**Il terzo anello di misura — segnalato: « fai cominciare i comandi sotto NEEDLE LIGHT ».**
`PistaCiclo`/`PistaProcedimento` centravano `top:'50%'` da soli sull'arco, indipendentemente
da dove finisce il blocco della lettura TA (che porta NEEDLE LIGHT come suo ultimo figlio,
stesso `<section>`, `top:14,left:16`). Aggiunta la STESSA tecnica di `headerRef`/`comandiRef`
(giro 62): `taRef` sul blocco della lettura TA, `pistaTop` misurato da un
`useLayoutEffect` senza dipendenze (`offsetTop+offsetHeight`, relativo a `<section>` — lo
stesso antenato positioned di `PistaCiclo`/`PistaProcedimento`, nessuna conversione da fare) —
un terzo anello nella stessa catena, non un numero indovinato. Entrambi i componenti ricevono
ora `top={pistaTop}` invece di centrarsi da soli; `maxHeight`/`overflowY` ricalcolati sullo
stesso `top` per non traboccare sotto.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (flusso completo, nessun errore nuovo in console). La resa vera di
`PistaCiclo`/`PistaProcedimento` (con contenuto, quindi con uno strumento connesso) resta da
confermare nell'app pacchettizzata — stesso limite già dichiarato ai due giri precedenti.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`,
`src/serenity/PistaCiclo.tsx`, `src/serenity/PistaProcedimento.tsx`.

---

## Sessantacinquesimo giro (25/08/2026) — reazioni MUSE e READY FOR SESSION illeggibili in LIGHT, note nei procedimenti, scorrimento

**Segnalato**: « quando in LIGHT, il systems HEALTH non si vede niente »; « cambia il nome di
PROCEDURES con PROCEDURES COMMANDS ».

**Il bug vero, in `HealthPanel.tsx` (condiviso).** `panelStyle` (in `Serenity.tsx`) puntava a
`--s-zone-bg`, che è `transparent` in ENTRAMBI i temi di SERENITY (verificato in
`tokens.css`, non solo sulla carta). In tema scuro restava leggibile per un CASO, non per un
disegno: `HealthPanel` è un componente condiviso, scrive tutto in `text-white/*` (Tailwind),
e con fondo trasparente si vedeva la pagina SCURA dietro. In tema chiaro la stessa
trasparenza mostra la pagina CHIARA — bianco su bianco, davvero invisibile, non solo poco
leggibile. Un commento precedente in `tokens.css` diceva « stessa scelta già presa per
HealthPanel » riferendosi a `ThetaReadyCheck`/`--tr-bg` — non era vero, non era mai stato
fatto per davvero. Aggiunto `--s-instrument-bg` (stesso valore di `--tr-bg`, `#17181a`, fisso
in ENTRAMBI i temi — uno strumento resta uno strumento): il `panelStyle` di `HealthPanel` ora
lo usa al posto di `--s-zone-bg`. Le altre zone che usano `--s-zone-bg` (`ZonaAssessment`,
Giornale, `PannelloMna`) RESTANO su quel token — il loro testo segue i colori `--s-ink-*` di
SERENITY da solo, non hanno bisogno di un fondo fisso.

**Il nome, in `ProcessusModal.tsx`.** La sezione dei procedimenti si chiamava "PROCEDURES"
(EN) / "PROCÉDÉS" (FR) ecc. — ora "PROCEDURES COMMANDS" / "COMMANDES DE PROCÉDÉS" (e le
traduzioni corrispondenti in IT/ES/SV), per dire più chiaramente che quel che si sceglie sono
i COMANDI di un procedimento, non il procedimento (il PDF) stesso.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo in tema chiaro (nome nuovo confermato: "COMMANDES DE PROCÉDÉS", nessun
errore nuovo in console). `HealthPanel` monta solo con un MUSE davvero connesso
(`museOk`) — la resa visiva del fondo scuro fisso resta da confermare nell'app
pacchettizzata, stesso limite già dichiarato per `PistaCiclo`/`PistaProcedimento`.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`,
`src/serenity/tokens.css`, `src/components/ProcessusModal.tsx`.

---

## Sessantaseiesimo giro (25/08/2026) — chiusura più evidente, il numero davanti dice « questa è la domanda »

**Segnalato**: « la chiusura dei comandi non è evidente, metti più in rilievo che si capisca »;
« vorrei che i comandi nel file TXT fossero trattati in modo che il numero davanti ad una
frase indichi la domanda — le linee seguenti senza numero sono le indicazioni per l'auditor e
devono apparire con la domanda ma in corsivo ».

**Il ✕ che si perdeva contro l'arco.** In `PistaCiclo.tsx` era un'icona nuda (20px, nessun
bordo, nessun fondo) — su un arco colorato sotto si confondeva con un dettaglio decorativo.
Ora un bottone VERO: bordato, con l'etichetta CHIUDI/FERMER/CLOSE/CERRAR/STÄNG accanto,
stessa lingua visiva di NEEDLE LIGHT e degli altri bottoni-pillola di SERENITY. Stesso
trattamento al ✕ di `PistaProcedimento.tsx` (già dentro una pillola col titolo, ma senza
bordo proprio — ora ce l'ha, più un `title` localizzato che prima mancava; il componente ha
dovuto ricevere `lang` in più, non ce l'aveva).

**Il marcatore delle note, da `#` al numero — in `main.cjs` (condiviso).** Il formato
precedente (giro passato) chiedeva di scrivere `#` davanti a ogni nota: bisognava
ricordarsene, ed era il contrario di come un auditor scrive già un procedimento (una
procedura numerata, con indicazioni sotto senza numero). Ribaltato: `RE_DOMANDA_NUMERATA =
/^\d+\s*[.)\-:]?\s*(.*)$/` — una riga che comincia con un numero (`1.`, `1)`, `1 -`, `1:`, o
solo `1 `) è una nuova domanda; una riga che non comincia con un numero è un'indicazione per
l'auditor, agganciata alla domanda appena prima (già mostrata in corsivo, sotto la domanda a
fuoco — `PistaProcedimento.tsx`, invariato: leggeva già `testo`/`note`, solo `main.cjs`
cambiava DA COSA le riempiva). Il vecchio `#` resta accettato e tolto per compatibilità, ma
non è più richiesto. Provato a mano (non solo sulla carta) con `node -e` sui cinque formati di
numerazione più una riga-solo-numero: tutti corretti, incluso un bug trovato PROPRIO da quella
prova — `3 - Terza domanda` (spazio prima del trattino) restituiva `"- Terza domanda"` con la
prima versione della regex (il trattino andava cercato SUBITO dopo la cifra, senza permettere
uno spazio in mezzo); corretto permettendo spazi opzionali sia prima che dopo la punteggiatura.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, `node -c main.cjs` pulito, prova manuale della regex (sopra) su tutti i formati più i
casi limite, dal vivo (nessun errore nuovo in console). La resa vera del ✕/delle note in
corsivo con un procedimento reale resta da confermare nell'app pacchettizzata — stesso limite
dei giri precedenti sulla pista.

`git status`: `docs/serenity-refonte.md`, `main.cjs`, `src/lib/procedimenti.ts`,
`src/serenity/PistaCiclo.tsx`, `src/serenity/PistaProcedimento.tsx`, `src/serenity/Serenity.tsx`.

---

## Sessantasettesimo giro (25/08/2026) — Santé Système leggibile in chiaro, chiusura più grande, la pista dei cicli uguale a quella dei procedimenti

**Segnalato**: « il systems health resta in dark anche quando passiamo in LIGHT, in light
rendilo ben visibile le scritte » (arrivato a metà lavoro, mentre si rispondeva a un giro
precedente — trattato subito); « fai più grande il bottone di chiusura dei comandi »; « vorrei
che i comandi dei cicli siano posizionati esattamente come i comandi dei procedimenti ».

**Santé Système, il fondo scuro fisso non bastava — capovolto con un filtro CSS, da fuori.**
Il giro scorso `--s-instrument-bg` aveva reso il fondo scuro FISSO in entrambi i temi (perché
il testo di `HealthPanel`, condiviso, è quasi tutto `text-white/*` fisso) — leggibile, ma una
macchia scura dentro una pagina chiara non è "ben visibile" come richiesto ora. Verificato
leggendo `HealthPanel.tsx` riga per riga: dentro non c'è NESSUN colore saturo, solo
bianco/nero/grigio a varie opacità — condizione ideale per il trucco `filter: invert(1)
hue-rotate(180deg)` (bianco-su-scuro diventa scuro-su-chiaro, `hue-rotate` non ha nulla da
correggere perché non c'è tinta da preservare). Un'unica eccezione: l'INTESTAZIONE
("SYSTEM HEALTH SENSORS") legge già `isLightTheme` da sola e va già scura-su-chiaro — il suo
titolo ANDREBBE invertito due volte (la sua logica + il filtro) se il filtro coprisse tutto il
pannello. Applicato quindi due volte: sul pannello intero (`.ser-health-wrap`) E di nuovo,
separatamente, sulla sola intestazione (`.ser-health-wrap > div > div:first-child`, il suo
PRIMO figlio) — due `invert()` sulla stessa zona si annullano (verificato: composizione CSS
standard, il filtro di un discendente si applica alla SUA resa PRIMA di essere ricomposta nel
sottoalbero filtrato dell'antenato), riportandola alla sua resa originale, corretta da sola.
Lo stesso annullamento riporta alla resa vera anche il bottone riduci/espandi (dentro
l'intestazione, già ritinto da questo stesso file). Tutto in `healthPanelButtons.css` — MAI
dentro `HealthPanel.tsx` condiviso, nessun file toccato lì. **Provato per davvero**, non solo
sulla carta: iniettato un elemento sintetico nella pagina (stessa struttura, `data-tema` a
`'chiaro'`) e verificato via screenshot che l'intestazione resta scura-su-chiara e il corpo
(bianco fisso originale) diventa anche lui scuro-su-chiaro — confermato prima di considerarlo
fatto, poi ripulito.

**Il bottone di chiusura, più grande — in `PistaCiclo.tsx`/`PistaProcedimento.tsx`.** Icona da
12 a 15px, testo da `--s-fs-micro` a `--s-fs-sm`, padding più largo (`6px 14px 6px 11px`) — in
entrambi i componenti, stessa taglia identica.

**`PistaCiclo`, posizionata esattamente come `PistaProcedimento`.** Segnalato esplicitamente.
Tre differenze rimaste dal giro della sua prima stesura, tolte: larghezza 250→280 (uguale);
bottone di chiusura isolato sopra la lista → intestazione a pillola fissa in cima
(`position:'sticky'`), col nome del metodo (CONTACT/NULL/MIRROR/TONE, derivato da `mode`)
accanto alla chiusura — stessa struttura esatta dell'intestazione di `PistaProcedimento` (nome
+ chiusura nella stessa pillola). Resta un'unica differenza, voluta e dichiarata nel commento
del file: nessuno scorrimento a rotellina/frecce in `PistaCiclo` — i tempi di un ciclo sono
2-4, sempre pochi abbastanza da stare tutti a schermo; quello scorrimento in
`PistaProcedimento` serve per liste di comandi potenzialmente più lunghe.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (prova sintetica del filtro CSS confermata via screenshot, nessun errore
nuovo in console). Nessun file condiviso toccato questo giro (`healthPanelButtons.css`,
`PistaCiclo.tsx`, `PistaProcedimento.tsx` sono tutti e tre SOLO SERENITY) — un solo DMG.

`git status`: `docs/serenity-refonte.md`, `src/serenity/healthPanelButtons.css`,
`src/serenity/PistaCiclo.tsx`, `src/serenity/PistaProcedimento.tsx`.

---

## Sessantottesimo giro (25/08/2026) — la % di Santé Système corretta, tutti i cicli fuori dalla barra in alto

**Segnalato**: « le % dans systems health est blanc en light et ne se voit pas »; « voglio che
le indicazioni e non solo les steps dei cicli siano posizionate a sinistra dell'ago — a questo
punto non deve più nulla dei cicli essere riprodotto in alto a sinistra ».

**Il bug della %, nato dal filtro troppo largo del giro precedente.** Il doppio-invert
copriva TUTTA l'intestazione di `HealthPanel` (`div:first-child`), non solo il titolo —
riportando al bianco originale anche la spia di qualità segnale accanto (etichetta "PC",
pallino di connessione, anello SVG, e la %), che è bianca fissa ESATTAMENTE come il resto del
corpo, non theme-aware come il titolo. Corretto restringendo l'annullamento a SOLO le due
zone che vanno davvero preservate — il titolo (`span:first-child` dell'intestazione) e il
bottone riduci/espandi (`div:last-child`) — lasciando la spia di qualità segnale, in mezzo ai
due, SOTTO il capovolgimento del pannello come il resto del corpo. **Riprovato per davvero**
con un elemento sintetico più fedele (titolo, "PC · 92%", bottone riduci) prima di
considerarlo fatto: confermato via screenshot che ora tutti e tre si leggono correttamente in
chiaro.

**Tutto ciò che riguarda i cicli, fuori dalla barra comandi in alto — per davvero, questa
volta.** Segnalato esplicitamente: dopo aver spostato la pista (step) a sinistra dell'arco (i
giri scorsi), restava ancora duplicato in alto: `testataCiclo` (badge+item+`CycleSteps`
orizzontale) e `SuggerimentoCiclo` (comando/come/avviso), montati tre volte — una per
TONE/MIRROR/CONTACT-NULL. Tolti da lì per davvero: `testataCiclo` (la funzione stessa)
cancellata, le tre chiamate rimosse; le tre `<SuggerimentoCiclo>` rimosse. `SuggerimentoCiclo`
estratto dal corpo di `Serenity.tsx` in un file a sé
([SuggerimentoCiclo.tsx](../src/serenity/SuggerimentoCiclo.tsx), verbatim) — necessario per
poterlo importare da `PistaCiclo.tsx` senza un giro circolare (`Serenity.tsx` importa già
`PistaCiclo` da lì). `PistaCiclo` riceve ora tre prop nuove — `item`/`itemPlaceholder`
(prima nel badge+item di `testataCiclo`) e `spiegazione` (lo stesso `spiegazioneCiclo` già
calcolato in `Serenity.tsx`, non ricalcolato) — e le mostra nell'ordine: intestazione (nome
del metodo) → item → pista dei tempi → indicazioni (`SuggerimentoCiclo`). La guida segue
SEMPRE il tempo REALE (`spiegazione`), mai il `fuoco` di preview — coerente con la regola già
scritta per la pista: solo un gesto vero decide cosa dire adesso. Restano in alto SOLO i
bottoni veri (dare l'item, validare, ecc.) — non "riprodotti", sono l'unico posto dove
esistono. Import di `CycleSteps` (il componente condiviso) tolto da `Serenity.tsx`: non più
usato da nessuna parte nel file.

**Limite di questa verifica.** Non sono riuscito a portare `cycles.cycleArmed` a vero nel
browser di anteprima (dare l'item sembra richiedere un passo in più che qui non si attiva) per
vedere la nuova pista con contenuto reale accanto ai bottoni — verificato invece: `tsc`/`lint`/
`vitest` puliti (nessun riferimento pendente a `testataCiclo`/`CycleSteps` rimasti,
il compilatore li avrebbe segnalati), e la sessione senza strumenti resta stabile e senza
errori nuovi in console dall'apertura fino al tentativo di dare l'item. La resa vera con un
ciclo davvero armato resta da confermare nell'app pacchettizzata.

`git status`: `docs/serenity-refonte.md`, `src/serenity/healthPanelButtons.css`,
`src/serenity/PistaCiclo.tsx`, `src/serenity/Serenity.tsx`,
`src/serenity/SuggerimentoCiclo.tsx` (nuovo).

---

## Sessantanovesimo giro (25/08/2026) — « dì l'item… »/« l'ho detta » spostati a sinistra, per tutti i cicli

**Segnalato**: « voglio che anche SAY THE ITEM... il bottone THE ITEM HAS BEEN SAID ecc. siano
a sinistra con i comandi, e questo per tutti i cicli ».

L'ultimo pezzo di UI dei cicli rimasto nella barra comandi in alto (deciso di lasciarlo lì il
giro scorso, letto come « bottone vero », non « riprodotto ») — tre copie quasi identiche
(TONE diceva "la resistenza", MIRROR/CONTACT/NULL "l'item"), tutte condizionate su
`faseCiclo === '*.say_item'` e tutte che chiamavano lo stesso `dichiaraItemDetto`. Tolte le tre
copie dalla barra; un blocco solo dentro `PistaCiclo` (che riceve già `phase`, quindi calcola
da sé `diItem = phase === 'tone.say_item' || 'mirror.say_item' || 'contact.say_item' ||
'null.say_item'`, nessuna logica nuova) — mostrato subito sotto l'item, sopra la pista dei
tempi. `onDichiaraDetto`, nuova prop, resta l'UNICA vera azione (chiama `dichiaraItemDetto`, il
motore, invariato) — testo che pulsa, taglia, posizione sono solo resa, la distinzione
TONE/altri-metodi (resistenza/item) fatta con `mode === 'tone'`, che `PistaCiclo` ha già.

Rimosso anche `titoloDichiaraDetto` da `Serenity.tsx` (restava senza più nessun punto che lo
leggesse) — la stessa traduzione ora vive dentro `PistaCiclo`, dove serve.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (nessun errore nuovo in console, sessione stabile). Stesso limite dei giri
precedenti: la resa con `phase` davvero a `*.say_item` (che richiede un ciclo armato con
l'item in attesa) non è stata vista con contenuto reale nel browser di anteprima — da
confermare nell'app pacchettizzata.

`git status`: `docs/serenity-refonte.md`, `src/serenity/PistaCiclo.tsx`, `src/serenity/Serenity.tsx`.

---

## Settantesimo giro (25/08/2026) — anche i bottoni veri dei cicli, a sinistra

**Segnalato**: « nei cicli, tutte le indicazioni devono essere a sinistra con i comandi ed
anche i bottoni ».

L'ultimo pezzo di UI dei cicli rimasto nella barra comandi in alto — i bottoni VERI (validare,
annullare, ripetere, il contatore, `CycleStatusBar`), lasciati lì due giri fa proprio perché
« non riprodotti, l'unico posto dove esistono ». Il ragionamento restava valido ma non la
conclusione: l'utente conferma esplicitamente di volerli spostati anche loro — nessuna
ambiguità residua.

**La sfida non era spostarli, era che servono in DUE contesti.** I bottoni funzionano SIA con
strumenti SIA senza (`aperta && cycles.cycleArmed` non controlla mai `senzaMisura`) — ma
`PistaCiclo` monta SOLO `!senzaMisura`. Spostarli semplicemente dentro `PistaCiclo` li avrebbe
fatti sparire per chi audita senza strumenti: una vera regressione funzionale, non solo
estetica. Risolto MISURANDO una sola volta, montando in DUE posti — la stessa tecnica già
usata per `spiegazioneCiclo`:

- **`bottoniCiclo`**, un nuovo `const` calcolato PRIMA del `return` del componente (dove
  `spiegazioneCiclo` già viveva) — non dentro la JSX come prima (`{(() => {...})()}`), perché
  JSX è un'unica espressione e non permette una `const` a metà per riusarla altrove nello
  stesso albero. Contenuto TALE E QUALE ai tre blocchi (TONE/MIRROR/CONTACT-NULL): stesse
  chiamate al motore (`tone.*`/`mirror.*`/`cycles.*`), stesso `pillBtn`, nessuna riga di logica
  toccata — solo spostato, non riscritto.
- **Montato in `PistaCiclo`** come nuova prop `children` (con strumenti) — un contenitore
  proprio (`pointerEvents:'auto'`, `flexDirection:'column'`) dopo `SuggerimentoCiclo`.
- **Montato nel blocco "senza strumenti"** (senza) — lo STESSO `bottoniCiclo`, non una seconda
  copia, appeso sotto l'avviso nel testo grande che prende il posto dell'arco.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639 — un buon segno per un taglia-incolla di questa taglia (centinaia di righe spostate):
il compilatore avrebbe segnalato qualunque variabile rimasta fuori scope. Dal vivo: sessione
senza strumenti aperta e ciclo CONTACT già attivo di default, nessun errore in console.
Stesso limite dei giri precedenti: non sono riuscito a portare `cycles.cycleArmed` a vero nel
browser di anteprima (dare l'item resta bloccato allo stesso punto già segnalato) per vedere i
bottoni veri con contenuto reale — la resa finale resta da confermare nell'app pacchettizzata.

`git status`: `docs/serenity-refonte.md`, `src/serenity/PistaCiclo.tsx`, `src/serenity/Serenity.tsx`.

---

## Settantunesimo giro (25/08/2026) — MUSE scelto ma non acceso: la seduta non parte più da sola

**Segnalato**: « quando comincio la session ed il muse è scelto ma non acceso, lascia iniziare
lo stesso, non va bene ».

**Il bug vero — `'searching'` scambiato per `'disconnected'`.** `museConnection` ha tre stati:
`'disconnected'` (mai cercato, o ha rinunciato) · `'searching'` (ricerca in corso) ·
`'connected'`. Il controllo di prontezza (`metabolicOpen`) usa `readinessMuseOk = museOk`
(`museConnection === 'connected'`, per davvero collegato) sia per decidere COSA mostrare sia
per decidere QUANDO uscire e aprire la seduta — ma `readinessMuseOk` è falso in DUE casi
diversi: connessione FALLITA (`'disconnected'`, il caso che il codice diceva esplicitamente di
coprire) e connessione ANCORA IN CORSO (`'searching'`, MUSE scelto ma non ancora acceso/
associato). Il codice non li distingueva — trattava « sto ancora cercando » come « ho
rinunciato » su TRE punti diversi:

1. **L'effetto di uscita** (`useEffect` accanto a `metabolicOpen`) — apriva la seduta subito
   appena vedeva `readinessMuseOk` falso, senza aspettare che la ricerca finisse.
2. **Il cancello di rendering** di `MetabolicCheck` — richiedeva anche lui `readinessMuseOk`,
   quindi durante la ricerca non montava NULLA (nemmeno con `museConnecting`, la sua prop già
   pronta apposta per mostrare "connessione in corso" — semplicemente non arrivava mai a
   schermo).
3. **`onProceed` di `ThetaReadyCheck`** — stesso controllo (`!readinessMuseOk`), stesso bug: se
   Meter e MUSE erano scelti insieme, finito il Meter apriva la seduta anche col MUSE ancora in
   cerca.

**Corretto con `museCercandoAncora`** (`!avvio?.distanza && muse.museConnection === 'searching'`,
calcolato una volta, usato nei tre punti): l'effetto di uscita NON esce più mentre la ricerca è
in corso; il cancello di rendering monta `MetabolicCheck` ANCHE durante la ricerca (ora la sua
prop `museConnecting` arriva davvero a schermo, mostrando "connessione in corso" invece di
niente); `onProceed` di `ThetaReadyCheck` non salta più avanti. La decisione di procedere
comunque resta SEMPRE dell'auditor — `MetabolicCheck` ha i suoi bottoni Proceed/Cancel, che
aprono la seduta a prescindere (per scelta esplicita, non per un bug che salta il controllo).

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639. Dal vivo: scelto MUSE, il browser di anteprima non ha un vero dispositivo da associare
— `requestDevice()` fallisce quasi subito (`NotFoundError`, verificato in console), portando
`museConnection` a `'disconnected'` per davvero in una frazione di secondo: il caso di
FALLIMENTO VERO, che il codice copriva già correttamente prima di questo giro — non lo stato
`'searching'` sostenuto che il bug riguardava, impossibile da mantenere in questo ambiente
senza hardware reale. Il warning React « la dimensione dell'array di dipendenze è cambiata »
visto durante la modifica dal vivo era un artefatto dell'hot-reload (il file cambiava sotto un
componente già montato) — confermato assente ricaricando la pagina da zero. La resa vera con
un MUSE che resta "in ricerca" per un tempo prolungato resta da confermare nell'app
pacchettizzata, con un MUSE davvero presente ma spento/fuori portata.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`.

---

## Settantaduesimo giro (25/08/2026) — MUSE non indossato ben visibile, le scritte dei comandi allargate

**Segnalato**: « quando il MUSE è collegato ma non indossato devi lasciare l'indicazione
apparente per indicare all'auditor »; « le scritte dei comandi dobbiamo allargarle per renderle
su una riga se possibile. O mettiamo i comandi sotto l'ago in basso o allarghiamo la zona
rendendo i bottoni a sinistra verticalmente. Cosa ne pensi? ».

**MUSE non indossato — l'indicazione esisteva, ma solo in un `title`.** Il pallino di stato
nella barra in alto già distingueva "connesso" da "non indossato" (`museGate.museContact`), ma
la frase che lo spiega viveva SOLO in un `title` — visibile passando il mouse sopra, che
l'auditor non fa: guarda il preclear, non l'icona. Verificato App.tsx: ha un banner dedicato,
SEMPRE visibile, pulsante, centrato in alto sull'arco (`museConnection === 'connected' &&
!museContact`) — non esisteva ancora in SERENITY. Aggiunto, stessa condizione, stessa scritta
(`t('no_contact')`, chiave condivisa già tradotta), nella lingua grafica di SERENITY
(`--s-reserve`, l'ambra di "attenzione" di sempre, non il rosso fisso di App.tsx — la STESSA
idea, non gli stessi colori).

**Le scritte dei comandi — chiesta la mia opinione fra due strade, scelta e motivata.** Fra «
sotto l'ago » e « allarghiamo la zona a sinistra »: la seconda, perché consolidare TUTTO ciò
che riguarda il ciclo a sinistra (steps, item, indicazioni, bottoni) è stata la direzione
esplicita degli ultimi cinque giri — spostare i bottoni sotto l'ago sarebbe tornato indietro
proprio su quello, oltre a riaprire lo stesso problema di spazio che « sotto l'ago » aveva già
(l'arco resta al centro, la fascia sotto non è più larga della colonna a sinistra). Fatto in
due parti: `pillBtn` (i bottoni veri, `Serenity.tsx`) e il bottone "l'ho detta"
(`PistaCiclo.tsx`) hanno ora `whiteSpace:'nowrap'` — senza, il testo andava a capo DENTRO la
pillola quando non ci stava; `PistaCiclo`/`PistaProcedimento` da 280 a 320px — non un numero
arbitrario, allineato al vero bordo sinistro del disegno dell'arco (x=320, la stessa misura di
sempre), quindi la pista arriva esattamente fin lì, non oltre.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (nessun errore nuovo in console, confermato sul log completo — non solo il
filtro degli errori, che nella console del browser di anteprima ripeteva le voci più vecchie
invece delle più recenti). Il banner MUSE non indossato e la resa delle scritte allargate con
un ciclo reale in corso restano da confermare nell'app pacchettizzata — stesso limite hardware
di sempre.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`, `src/serenity/PistaCiclo.tsx`,
`src/serenity/PistaProcedimento.tsx`.

---

## Settantatreesimo giro (25/08/2026) — obiettivo, processo, stato fisico, R-Factor

**Segnalato**: « mancano l'obiettivo, rfactor ecc all'inizio session ».

Verificato App.tsx: quattro campi di testo libero, sempre scrivibili per tutta la seduta aperta
(`sessionState === 'running'`, non solo "all'inizio" — l'auditor può tornarci in qualunque
momento) — `sessionObjective`/`sessionProcessObjective`/`sessionPhysicalCheck`/
`sessionBriefing`. Nessuna logica dietro: solo testo che accompagna il rapporto, nessun
calcolo, nessuna soglia. Mancavano DEL TUTTO in SERENITY (`grep` senza risultati) — coerente
con l'avviso in cima al file (« fase 6, in corso »): non un bug, una parte non ancora
costruita.

Aggiunti gli stessi quattro campi, montati dentro lo stesso blocco misurato da `taRef` (la
lettura TA/NEEDLE LIGHT), sotto quest'ultimo — `pistaTop` si allunga da solo per fargli posto,
la stessa tecnica già usata tre volte in questa refonte (misurare, non indovinare un numero).
Un campo per riga, non affiancati: lo spazio in larghezza a `left:16` è quello della colonna
riservata alla barra laterale, quattro in fila si sarebbero accavallati col bordo.

**Le etichette, tradotte — non ricopiate.** In App.tsx sono FISSE in francese ("Objectif" /
"Processus" / "État physique" / "R-Factor"), mai passate per `t()` — una svista mai corretta
là, non una scelta. Qui tradotte con `LC` nelle 5 lingue, coerente con com'è scritto tutto il
resto di SERENITY: stessi campi, stessa logica, non la stessa svista.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (sessione aperta senza strumenti — i quattro campi non hanno bisogno di
strumenti per contare, esattamente come in App.tsx — scritto un valore nel campo Objectif,
confermato sullo schermo, nessun errore in console prima o dopo).

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`.

---

## Settantaquattresimo giro (25/08/2026) — MUSE scelto ma non acceso, la seduta non parte più da sola

**Segnalato**: « pronto per la session con il MUSE non dà i risultati anche se dice pronto ».

**Bug trovato, non solo sospettato — verificato riga per riga contro App.tsx.**
`MetabolicCheck` (condiviso) chiama la sua prop `onPhase` per dire quando entra nella fase
`'baseline'` o `'breath'` — è così che `useChargeEngine` (condiviso, alimentato da
`METRICS_UPDATE`) sa quando nutrire `metabolicBaseline` con le bande EEG/BPM/qualità del
segnale in arrivo (`hooks/useChargeEngine.ts`: `if (_mp === 'baseline' || _mp === 'breath')
metabolicBaseline.push(...)`, dove `_mp` è `metabolicPhaseRef.current`). In `Serenity.tsx`,
`onPhase` era `() => {}` — un vuoto. `metabolicPhaseRef` (già dichiarato, già passato a
`useChargeEngine`) restava fermo su `'idle'` per tutta la prova: zero campioni raccolti,
`metabolicBaseline.assess()` uscito da uno stato vuoto — la schermata "pronto" si vedeva
davvero (i tempi passano comunque, sono un timer locale al componente), ma dietro non c'era un
solo numero vero. Corretto a `onPhase={p => { metabolicPhaseRef.current = p; }}` — verificato
identico, carattere per carattere nella struttura, a `App.tsx:6752`.

**La pulizia in più — segnalata insieme.** Senza un reset esplicito alla chiusura,
`metabolicPhaseRef` poteva restare bloccato su `'baseline'`/`'breath'` DOPO aver chiuso il
controllo (annullato, o chiuso dall'uscita automatica di caso limite) — `useChargeEngine`
avrebbe continuato a nutrire `metabolicBaseline` per il resto della seduta, lavoro sprecato
(mai letto: la prossima apertura lo azzera comunque con `metabolicBaseline.reset()`) ma non
corretto. Aggiunto `metabolicPhaseRef.current = 'idle'` nei due punti di uscita
(`avviaSedutaConProntezza`, che copre onProceed/onCancel di `MetabolicCheck` e il salto
automatico quando il soffio del Meter è già riuscito; l'uscita per connessione fallita) —
stessa pulizia che App.tsx fa alla chiusura.

Verificato: `tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo), `vitest run`
639/639, dal vivo (caricamento pulito, nessun errore in console). La resa vera — un MUSE
davvero indossato, la prova del respiro che produce contatto/calma/cuore/reattività reali —
resta da confermare nell'app pacchettizzata: qui non c'è hardware da associare, ma il difetto
trovato (`onPhase` vuoto) è verificabile leggendo il codice, non serve vederlo per sapere che
c'era.

`git status`: `docs/serenity-refonte.md`, `src/serenity/Serenity.tsx`.

---

## Settantacinquesimo giro (25/08/2026) — i comandi dei cicli, sotto il perno dell'ago

**Segnalato**: « bene tutti i comandi e indicazioni dei cicli mettili ora, per più
leggibilità, sotto il punto di ancoraggio dell'ago, in uno spazio che permetta di avere il più
possibile le scritte su una linea ».

**Il posto c'era già, ma non era quello giusto.** `PistaCiclo`/`PistaProcedimento` (la pista a
fuoco coi tempi del ciclo, l'item, "dì l'item…", le indicazioni, i bottoni veri) vivevano in
una colonna stretta (320px) incollata al bordo sinistro dell'arco — deciso in un giro
precedente proprio scegliendo QUELLA delle due strade proposte allora, contro « i comandi
sotto l'ago ». Segnalato di nuovo, stavolta la direzione è la seconda: spostati sotto il
perno, in una fascia orizzontale larga quanto il quadrante (fino a 1400px), coi gruppi
(intestazione, item, tempi, indicazioni, bottoni) disposti in RIGA — ognuno prova a restare su
una riga sola, va a capo fra un gruppo e l'altro solo se lo spazio non basta davvero.

**⚠️ Bug reale trovato spostandola, non solo un dettaglio estetico.** Il primo tentativo
misurava (`pannelloRef`/`useLayoutEffect`, la stessa tecnica di `headerRef`/`comandiRef`/
`taRef` già in uso) dove finisce il pannello del quadrante, e passava quel numero come `top`
assoluto a `PistaCiclo`. Sembrava corretto — e lo era, come NUMERO. Il problema: il pannello
ha `overflow:'hidden'` (per i suoi bordi arrotondati), e `PistaCiclo` viveva ANCORA DENTRO
quel pannello (un `</div>` che credevo chiudesse il pannello, verificato da vivo con
`getBoundingClientRect()`/`offsetParent`, chiudeva in realtà un blocco interno — il vero
`</div>` del pannello arriva 90 righe più giù, dopo `PistaCiclo`). Un `top` che supera
l'altezza del suo stesso contenitore, dentro un contenitore con `overflow:hidden`, si TAGLIA
via — invisibile a schermo, presente nel DOM e nel testo di pagina (`get_page_text` lo
mostrava per intero), mai dipinto. Trovato SOLO ispezionando dal vivo (`javascript_tool`,
`getBoundingClientRect`/`offsetParent` sull'elemento reale) dopo che gli screenshot in una
finestra 1280×720 e poi 1600×1000 non mostravano niente sotto l'arco.

**La correzione vera, non solo un numero diverso.** Spostato `PistaCiclo`/`PistaProcedimento`
FUORI dal pannello — fratelli suoi, non più figli, dentro lo stesso involucro `flex:1 column,
alignItems:'center'` che già impila verticalmente il quadrante. Tolto tutto il posizionamento
`absolute`/`top`/`transform` calcolato a mano: nel flusso normale della colonna, il `gap`/
`alignItems:'center'` del contenitore li mette esattamente dove servono, centrati, senza poter
mai finire tagliati via da un contenitore che non li aspettava. Tolta anche `pannelloRef`/
`sottoAgoTop` (il ref e l'effetto di misura, ora inutili) e il prop `top` da entrambi i
componenti — meno stato, non di più, per lo stesso risultato.

**Dentro ai gruppi.** I tempi del ciclo (`steps.map`) ora vivono in un loro contenitore
`flexWrap:'nowrap'`: restano sempre affiancati fra loro (sono 2-4), è il GRUPPO che
eventualmente va a capo, mai un tempo da solo a metà. I bottoni veri (`children`, passati da
`Serenity.tsx`) sono passati da `flexDirection:'column'` a `'row'` — si affiancano invece di
impilarsi, `flexWrap:'wrap'` resta come rete di sicurezza per i gruppi davvero larghi (i dieci
bottoni del valore in MIRROR, il selettore + bottone di TONE). Tolto `width:'100%'` da quel
contenitore: su una riga che deve stare AFFIANCO agli altri gruppi, forzare la piena larghezza
avrebbe spinto ogni altro gruppo su una riga propria — l'esatto opposto della richiesta.
`SuggerimentoCiclo` (comando/come/avviso) tiene il suo `maxWidth` alzato da 420 a 760: tarato
sulla vecchia colonna stretta, ora ha più spazio prima di dover andare a capo, restando
comunque tre righe distinte (non una frase fusa che confonderebbe citazione/spiegazione/
avviso).

`PistaProcedimento` segue la stessa riposizione (« i comandi dei procedimenti posizionati
esattamente come i comandi dei cicli », regola già scritta in un giro precedente) ma tiene il
proprio scorrimento verticale — i comandi di un procedimento possono essere molti, a
differenza dei 2-4 tempi fissi di un ciclo — con un tetto d'altezza fisso (`min(50vh,420px)`)
al posto del `calc()` legato al vecchio `top`.

**Verificato a schermo, non solo a compilazione** — proprio il tipo di verifica che questo
bug avrebbe reso necessaria comunque: forzato temporaneamente `senzaMisura` a `false` (l'unico
modo di raggiungere l'arco senza un MUSE vero in questo ambiente — tolto subito dopo, non
resta nel codice), armato ciascuno dei quattro metodi. CONTACT: intestazione, item, "dì
l'item…", i tre tempi, tutto su una riga; guida + contatore + ANNULLA + "déclare l'AS-IS" sulla
riga sotto. NULL: gli stessi gruppi PIÙ i tre esiti (VGI/senza VGI/NON RICARICA) — cinque
elementi, ancora su una riga sola nella finestra di prova. MIRROR: i dieci bottoni del valore
1-10 tutti affiancati; bloccato un valore, "5 → 10" e "doppio raggiunto" leggibili. TONE: il
menù dei livelli nominati di Ron + "dai l'item" + ANNULLA. Verificato in tema chiaro E scuro.
Nessuna regressione: validato un ciclo CONTACT fino ad AS-IS, il giornale e il ritorno ai
quattro bottoni funzionano come prima.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/PistaCiclo.tsx`, `src/serenity/PistaProcedimento.tsx`,
`src/serenity/Serenity.tsx`, `src/serenity/SuggerimentoCiclo.tsx`.

EQUILIBRIUM 2.0.215, SERENITY 3.0.109.

---

## Settantaseiesimo giro (25/08/2026) — niente scroll, tutto in larghezza; OBIETTIVO ecc. in alto; l'item riunito coi metodi

**Segnalato**: « Non devi avere uno spazio dedicato così poco alto da dover scroll per vedere
le indicazioni e tutto quanto, ma metti il tutto sotto il perno dell'ago al fine da vedere
bene in larghezza il tutto. Poi OBJECTIVE, Process, Physical State, R-Factor devono essere
presenti in alto in larghezza. Perché c'è sempre uno spazio con Type or say the Item in alto a
sinistra? »

**Tre correzioni sulla stessa direzione del giro precedente — quella non bastava ancora.**

**1) Niente più scroll, la larghezza fa il lavoro.** `PistaProcedimento` (il giro scorso)
aveva preso un `maxHeight:min(50vh,420px)` con `overflowY:'auto'` — esattamente lo « spazio
dedicato così poco alto da dover scroll » segnalato. Tolto il tetto d'altezza: il contenuto
sta nel flusso naturale della colonna, alla sua taglia vera. `width` di `PistaCiclo` E
`PistaProcedimento` alzata da 1400/900 a `min(96%,2200px)` — lo stesso tetto a cui
`Serenity.tsx` aveva portato il pannello del quadrante in un giro precedente (« aggrandisci al
massimo delle possibilità »): la fascia dei comandi non deve restare più stretta di lui. Più
larghezza per lo stesso testo vuol dire meno righe totali, quindi meno bisogno di scorrere —
la soluzione chiesta esplicitamente, non solo un tetto più permissivo.

**2) OBIETTIVO / PROCESSO / STATO FISICO / R-FACTOR, in alto in larghezza.** Vivevano
nell'angolo in alto a sinistra del pannello dell'ago, un campo per riga, larghi 240px (lo
spazio della vecchia barra laterale — la ragione scritta allora: « quattro in fila si
sarebbero accavallati col bordo », vera SOLO in quello spazio stretto). Spostati in cima alla
stessa colonna `flex:1` che porta il pannello e la fascia dei cicli — una riga sola, i quattro
campi divisi in parti uguali (`flex:1 1 160px` ciascuno): a questa larghezza (fino a 2200px)
entrano affiancati senza sforzo. Nessuna logica toccata — stessi quattro stati, stesso testo
libero senza guardia.

**3) L'item e i quattro metodi, riuniti con la pista del ciclo — la risposta alla domanda.**
Perché c'era sempre quello spazio: il campo per scrivere/dire l'item (e i quattro cerchi
CONTACT/NULL/MIRROR/TONE per armare un metodo) vivevano nella barra laterale in alto a
sinistra — un posto DIVERSO da dove il ciclo, una volta armato, sarebbe comparso (`PistaCiclo`,
sotto il quadrante, dal giro precedente). Due luoghi per la STESSA sequenza (scegli il metodo →
il ciclo armato), a due passi di distanza: da qui la sensazione di uno spazio isolato, senza un
perché visibile a chi guarda. Corretto spostando l'item, la sua indicazione di voce, e i
quattro cerchi dei metodi nella STESSA fascia larga sotto il quadrante — un fratello nuovo di
`PistaCiclo` per lo stato "nessun metodo ancora armato": quando armato uno sparisce e compare
l'altro, mai i due insieme, mai una fascia vuota. La barra laterale in alto a sinistra ora
porta solo CHIUDI/PAUSA e EP (che resta lì: visibile SEMPRE, non solo prima di armare un
metodo — spostarlo insieme agli altri quattro lo avrebbe fatto sparire durante un ciclo).
Nessuna riga di logica toccata: stesso `item`/`setItem`, stesso `journal.addLog` sull'Invio,
stessa voce (`statoVoce`), stesse quattro chiamate (`armCycle`/`armMirror`/`setToneAttivo`) —
solo spostate.

**Verificato a schermo** (tab pulita, `senzaMisura` forzato temporaneamente a `false` per
raggiungere l'arco senza MUSE vero in questo ambiente — tolto subito dopo): OBJECTIVE/PROCESS/
PHYSICAL STATE/R-FACTOR in una riga in cima, scrivibili (provato "test obiettivo", comparso
subito); il campo item e i quattro cerchi dei metodi ora sotto l'arco, non più nella barra
laterale, che mostra solo CHIUDI/PAUSA/EP; armato CONTACT con un item scritto lì, validato
fino ad AS-IS, tornato correttamente ai quattro cerchi; armato MIRROR, i quattro tempi + la
guida + i dieci bottoni del valore tutti leggibili con margine, nessuno scroll. Verificato in
tema chiaro e scuro.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/PistaCiclo.tsx`, `src/serenity/PistaProcedimento.tsx`,
`src/serenity/Serenity.tsx`.

EQUILIBRIUM 2.0.216, SERENITY 3.0.110.

---

## Settantasettesimo giro (26/08/2026) — l'ultimo terzo in basso per i comandi; OBIETTIVO ecc. spariscono da soli; PROCESSO tolto

**Segnalato**: « Quando la sessione inizia OBJECTIVE, Physical State, R-Factor se riempiti
devono sparire dopo 10 secondi per liberare l'interfaccia. Il campo Process, toglilo, perché è
ridondante con il nuovo Comandi Procedimenti che abbiamo istaurato. Io creerei un bottone
specifico con icone da mettere a fianco del bottone EP. Hai fatto bene a mettere i comandi in
tutta larghezza, ma hai ridotto l'ago veramente a troppo piccolo. Devi utilizzare l'ultimo
terzo in basso come altezza per i comandi. »

Quattro correzioni, tutte sulla stessa riga del giro precedente (« bene la larghezza, ora
sistemiamo il resto »).

**1) PROCESSO tolto, per davvero — non un'omissione.** Segnalato esplicitamente come
ridondante: da quando esiste "Comandi Procedimenti" (un elenco di comandi VERI da scegliere,
`PistaProcedimento`), scrivere lo stesso nome a mano in un campo di testo libero a parte è la
stessa informazione due volte. Diverso da App.tsx per scelta esplicita dell'utente, non
un'omissione muta: App.tsx non ha un equivalente di "Comandi Procedimenti", quindi lì il campo
di testo libero "Processus" resta l'UNICO modo di dire quale processo gira — qui non più.
Restano `sessionObjective`/`sessionPhysicalCheck`/`sessionBriefing` (OBIETTIVO/STATO
FISICO/R-FACTOR): nessuna logica dietro nessuno dei tre, solo testo libero che accompagna il
rapporto.

**2) Un bottone Procedimenti, a fianco di EP.** Prima l'unico modo di aprire l'elenco dei
procedimenti era il bottone "processes" nella barra in alto — lontano dalla zona EP/comandi
del ciclo, dove l'auditor guarda per il resto della seduta. Aggiunto un secondo bottone
rotondo identico (stessa icona `BookOpen`, stesso badge col numero di procedimenti, stesso
`setProcessusAperto(true)`) nella STESSA cornice `--s-zone-bg` che già conteneva EP — non un
componente nuovo, la stessa azione raggiungibile da un secondo posto più comodo. Il bottone in
alto resta: due strade per la stessa porta, non una duplicazione di logica.

**3) OBIETTIVO / STATO FISICO / R-FACTOR spariscono 10 secondi dopo essere stati riempiti.**
Nuovo stato `campiSessioneNascosti`, un `useEffect` che parte un `setTimeout` di 10s appena
ALMENO uno dei tre campi ha del testo (si riazzera a ogni tocco: scrivere ancora rimanda la
sparizione, non la accorcia), e SOLO allora — restano visibili per sempre se sono vuoti,
niente da nascondere. Passato il tempo, la riga intera cede il posto a una piccola maniglia
("obiettivo · stato fisico · r-factor", lo stesso stile "chiuso" già usato da `PistaCiclo`):
un clic la riporta, e resta poi aperta — riaprirla è una scelta per guardarla o correggerla,
non un invito a essere interrotti di nuovo dieci secondi dopo (il riaprire non rimette in moto
il conto alla rovescia, che dipende solo dal TESTO dei tre campi, non da
`campiSessioneNascosti` stesso). Si riazzera anche ad ogni nuova apertura di seduta
(`apri()` → `setCampiSessioneNascosti(false)`).

**4) L'ultimo terzo in basso, per davvero — non più una speranza lasciata al flex-shrink.**
La causa vera dell'ago rimpicciolito: nella colonna `flex:1` che porta OBIETTIVO + striscia
reazioni + pannello dell'ago + pista dei cicli + MNA, tutti i blocchi TRANNE il pannello
avevano `flexShrink:0` (non si comprimono mai) — quando lo spazio totale non basta, un flex
column shrinka gli elementi proporzionalmente alla loro taglia di base, e il pannello (il più
alto di tutti, per via del suo `aspect-ratio` 1600×850) è quello con più pixel da perdere. Il
risultato: più righe di comandi sotto = ago più piccolo, senza alcun limite esplicito. Corretto
spezzando la colonna in DUE gruppi veri anziché uno piatto: `gruppoAlto` (OBIETTIVO + striscia
reazioni + il pannello dell'ago, `flex:'2 1 0%'`) e `gruppoBasso` (pista del ciclo/procedimento
o scelta del metodo, + MNA, `flex:'1 1 0%'`) — due terzi/un terzo GARANTITI dal browser, non
più contesi. Una variabile `comandiSottoAgo` (= `aperta && !senzaMisura`, la stessa
condizione che decide se il gruppo basso avrà davvero qualcosa da mostrare) azzera il gruppo
basso (`'0 0 0%'`) quando non c'è nulla lì — seduta chiusa o senza strumenti — cosicché l'ago
non perda mai un terzo per uno spazio che resterebbe vuoto: la stessa vista a riposo di prima
(l'ago occupa tutto), invariata.

**Verificato a schermo** (`serenity-dev`, `senzaMisura` forzato temporaneamente a `false` per
raggiungere la UI degli strumenti — tolto subito dopo, `tsc` pulito prima e dopo): a riposo
(seduta chiusa) l'ago riempie tutto lo spazio, nessun terzo vuoto sprecato; seduta aperta a
1800px di larghezza, l'ago visibilmente più grande di prima, la riga OBIETTIVO/STATO
FISICO/R-FACTOR (senza più PROCESSO) in cima, il campo item + i quattro cerchi
CONTACT/NULL/MIRROR/TONE su una riga sola sotto l'ago, MNA sotto ancora; scritto "test
obiettivo", atteso 10s, la riga è sparita lasciando la maniglia "objective · physical state ·
r-factor"; riaperta con un clic, rimasta aperta altri 10s senza risparire da sola; il bottone
Procedimenti a fianco di EP apre lo stesso popup PROCESSES del bottone in alto; armato CONTACT
dalla nuova fascia sotto l'ago, `PistaCiclo` compreso e l'ago sempre alla stessa taglia grande.
Verificato solo in tema scuro (il tema chiaro non tocca nessuna delle quattro correzioni:
sono tutte disposizione/logica, non colore).

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/Serenity.tsx`.

EQUILIBRIUM 2.0.217, SERENITY 3.0.111.

---

## Settantottesimo giro (26/08/2026) — il bottone Processus diventa COMMANDS; il METER non deseleziona più SENZA STRUMENTI

**Segnalato**: « Allora il Bottone Processus devi chiamarlo COMMANDS e deve aprire processus
in generale, ma mettere in evidenza la zona Processu Command. Quando scielgo SENZA STRUMENTI
e poi scelgo METER, senza strumenti non si deseleziona. »

Due correzioni indipendenti.

**1) Il bottone accanto a EP si chiama COMMANDS.** L'etichetta era "procedimenti"/"processes"
(tradotta via `LC`, come il resto di SERENITY) — non diceva perché questo bottone esiste QUI,
vicino a EP, invece che solo in intestazione: non un secondo elenco di PDF, la scorciatoia
diretta ai comandi di un procedimento. "COMMANDS", fissa in maiuscolo come "EP"/"TONE" (mai
tradotta — un nome proprio della funzione, non una frase). Il click resta lo stesso
(`setProcessusAperto(true)`, l'intero modale PROCESSUS generale, PDF compresi — non un
popup diverso, esattamente come richiesto). Dentro il modale, la sezione COMANDI PROCEDIMENTI
(già SERENITY-only, `ProcessusModal.tsx`) ora si fa notare: prima un blocco fra tanti con lo
stesso bordo sottile grigio del resto, ora una card a sé con fondo e bordo dell'accento e un
lieve alone — la stessa lingua visiva che il modale usa già per "selezionato"/"attivo"
altrove, non un colore inventato apposta. Non tocca EQUILIBRIUM: la sezione resta dietro
`procedimenti !== undefined`, `undefined` per App.tsx come sempre.

**2) BUG TROVATO — il METER non usciva più dal gruppo di controllo.** Un effetto esistente
(giro precedente all'attuale, commento « quando disattivi il METER e/o il MUSE... il bottone
NO INSTRUMENT deve attivarsi ») rimette `senzaStrumenti` a `true` quando, a seduta aperta,
nessuno strumento risulta collegato — la cura necessaria perché disconnettere l'ultimo
strumento riattivi da sé il gruppo di controllo. Per il MUSE l'effetto già escludeva
`'searching'` (un tentativo in corso non è un "niente"); per il METER mancava lo stesso
riguardo: la condizione leggeva solo `meterC` (vero SOLO a connessione RIUSCITA, mai durante
il tentativo). Cliccare la pillola METER chiama `setSenzaStrumenti(false)` prima di
`theta.connect()` — ma nella finestra fra il clic e la connessione vera, `meterC` è ancora
`false`: l'effetto tornava vero un istante dopo che l'utente l'aveva appena spento, prima
ancora che il METER avesse il tempo di collegarsi. La pillola SENZA STRUMENTI restava accesa
per sempre. Aggiunto `theta.status !== 'connecting'` alla condizione (e alle dipendenze
dell'effetto) — verificato nel sorgente che `ThetaMeterHid.connect()` chiama
`setStatus('connecting')` in modo SINCRONO, prima di qualunque `await`: nello stesso giro di
React che applica `setSenzaStrumenti(false)`, `theta.status` è già `'connecting'`, quindi
l'effetto non retrocede più — stessa cura già data al MUSE, stavolta anche per lui.

**Verificato**: `tsc`/riga di sorgente per `setStatus('connecting')` (sincrona, confermata);
in browser il bottone COMMANDS apre PROCESSUS con la sezione COMANDI PROCEDIMENTI in evidenza.
Il verso del bug (METER veramente collegato) non è riproducibile in questo ambiente sandbox —
nessun Theta-Meter fisico, e `navigator.hid.requestDevice()` apre un vero selettore nativo del
sistema operativo che blocca la pagina finché non lo si chiude a mano (confermato dal vivo: un
tentativo di clic ha aperto per davvero quel selettore, la pagina è rimasta bloccata finché non
è stato premuto Escape) — CONFERMA che il codice tenta una connessione reale, non un
segnaposto, ma rende impossibile osservare qui la finestra `'connecting'` millisecondo per
millisecondo. La correzione si appoggia quindi sulla lettura sincrona del sorgente
(`setStatus('connecting')` prima dell'`await`, `onStatus` collegato a un `setState` diretto,
nessun giro asincrono in mezzo) più che su una riproduzione visiva dal vivo — stesso schema già
verificato e funzionante per il MUSE.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/Serenity.tsx`, `src/components/ProcessusModal.tsx`.

EQUILIBRIUM 2.0.218, SERENITY 3.0.112.

---

## Settantanovesimo giro (26/08/2026) — la pastiglia di COMMANDS conta i procedimenti, non i PDF; la prima riga dei comandi non finisce più fuori vista

**Segnalato**: « devi mettere la pastiglia dei comandi con il numero di file della sezione
PROCEDURES COMMANDS » — poi, testando i comandi del ciclo: « la prima linea dei comandi non
deve essere sottostante al bottone CLOSE, perché non si riesce a leggere la domanda » e «
quando schiacci CLOSE si vede che i comandi sono due volte presenti e si deve schiacciare due
volte CLOSE ».

**1) La pastiglia sul bottone COMMANDS.** Contava `processusPdfs.length` — l'archivio PDF
generale, la sezione SBAGLIATA: il bottone si chiama COMMANDS (giro scorso) proprio per
puntare ai PROCEDIMENTI, non ai PDF. Ora conta `procedimenti.length`, lo stesso array che
`ProcessusModal` mostra nella card COMANDI PROCEDIMENTI messa in evidenza il giro scorso —
la pastiglia e la card che evidenzia dicono finalmente lo stesso numero.

**2) BUG TROVATO — la prima riga della pista del ciclo poteva finire fuori vista, senza
nessun segno che dicesse di scorrere.** Non un doppio montaggio: un solo `<PistaCiclo>` nel
sorgente, verificato di nuovo con calma. La causa vera era nel contenitore che gli fa da
casa (`gruppoBasso`, l'ultimo terzo riservato ai comandi, dal giro "l'ultimo terzo in basso"):
`justifyContent:'center'` su un contenitore con `overflow:'auto'`, quando il contenuto
(intestazione + item + tempi + indicazioni + bottoni di `PistaCiclo`, spesso più alto del
terzo disponibile specie a finestra bassa) supera l'altezza del box. CENTRARE un contenuto
più alto del suo box lo fa sporgere ugualmente sopra E sotto — ma `overflow:'auto'` mostra
SOLO la fetta dentro al box, e quella sporgenza SOPRA finiva scrollata fuori dalla vista,
senza barra di scorrimento visibile a dirlo: la prima riga di `PistaCiclo` (la sua stessa
intestazione, col bottone "CHIUDI"/"FERMER"/"CLOSE" — lo stesso nome del bottone che chiude
la SEDUTA, la confusione era servita) sembrava sparita, o "sotto" qualcos'altro. Cliccare alla
cieca dove ci si aspettava quel bottone colpiva invece il testo sotto (la vera prima riga,
appena rivelata) — da qui il bisogno di cliccare due volte, e la sensazione di vedere « i
comandi due volte » (la riga vera, prima nascosta e poi rivelata dallo scroll, sembra un
secondo blocco apparso dal nulla).

Corretto: `justifyContent:'flex-start'` invece di `'center'`. Il contenuto parte SEMPRE dalla
cima del box — la prima riga è SEMPRE la prima cosa visibile, mai quella scrollata via;
l'eventuale eccedenza trabocca in basso, dove uno scroll è normale da aspettarsi (e dove sta,
per costruzione, il gruppo più sacrificabile: i bottoni finali del ciclo, non la sua
intestazione).

**Verificato in browser** (`senzaMisura` forzato temporaneamente, tolto subito dopo): a
1400×800 (una finestra bassa, apposta per far traboccare il contenuto), PRIMA della
correzione solo l'ultimo cerchio (TONE) restava visibile della fascia item+metodi, tutto il
resto scrollato fuori senza segno; DOPO, item e i tre cerchi CONTACT/NULL/MIRROR/TONE tutti
visibili dalla cima. Armato CONTACT alla stessa finestra bassa: l'intestazione di `PistaCiclo`
(badge CONTACT + bottone FERMER) visibile fin da subito, un solo clic su FERMER collassa la
pista nella maniglia "› ITEM" senza alcun doppione, un secondo clic la riapre identica.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/Serenity.tsx`.

EQUILIBRIUM 2.0.219, SERENITY 3.0.113.

---

## Ottantesimo giro (26/08/2026) — Needle Trim spostato nel test del respiro; Journal uniforme; l'item si scrive nei cicli; OUI/NON spiegati

**Segnalato** (otto punti nello stesso messaggio):

1. « in config devi togliere NEEDLE TRIM e devi aggiungerlo quando fai il test col MUSE per il
   respiro, in modo da avere una logica. ATTENZIONE, deve potersi vedere l'ago come reagisce
   quando regoli Needle trim MUSE »
2. « la police de caractère dans Journal deve essere la stessa che nel resto dell'applicazione
   per uniformità e meno bianca, è troppo visibile e disturba (in DARK) mentre in LIGHT va bene »
3. « IN LIGHT TA 1 cans vs 2 non si vede, è troppo chiaro »
4. « In assessement OUI/NNON deve avere l'indicazione di cosa è »
5. « Quando non ho armato nessun ciclo appare sempre ECRIS OU DIS L'ITEM, se scrivi non lo
   prende e poi non serve. Deve apparire quando armi un ciclo. Tanto se vuoi un Item lo scrivi
   in R&I o ASSESSEMENT, dunque non serve »
6. « IN TONE ti dice "Écris ou dis la résistance..." ma non puoi scriverlo »
7. « Negli altri cicli anche non si può scrivere, invece si deve, l'auditor potrebbe volerlo
   scrivere. Questo permette di calcolarne la carica? »
8. « La prima linea dei comandi di qualsiasi procedimento è sempre sovrastata dal titolo e dal
   bottone FERMER »

**1) NEEDLE TRIM, da CONFIG al test del respiro.** Tolta la sezione da `PannelloConfig.tsx`
(pannello a tutta pagina — l'ago non è mai a schermo lì, tararlo non ne mostrava mai l'effetto,
l'esatto contrario di una taratura). Le stesse due manopole (sensibilità/trim e inerzia, stesso
motore `runtime/NeedleEngine`) ora vivono dentro `MetabolicCheck` — SOLO SERENITY, una prop
opzionale `needleTrim` che App.tsx non passa mai (comportamento invariato lì) — visibili appena
il MUSE è appaiato E indossato (`effConnected`, la stessa condizione che fa partire la
baseline: prima di allora l'ago non riceve dati veri). **Il velo dell'overlay, schiarito SOLO
in questa variante**: `rgba(0,0,0,0.8)` + `blur(10px)` di sempre coprirebbe l'ago dietro a
tutto schermo — con `needleTrim` presente diventa `rgba(0,0,0,0.28)`, niente sfocatura: la
carta (460px) copre il centro dell'arco (che arriva a 2200px), il resto dell'ago resta
leggibile e in movimento ai suoi lati mentre si regola la manopola.
⚠️ **Limite di verifica dichiarato**: in questo ambiente sandbox il MUSE non arriva mai a
`'connected'`+indossato (nessun casco fisico, nessun bridge Electron/BLE) — l'effetto
dal vivo (l'ago che reagisce mentre si sposta il cursore) non è stato osservabile qui.
Verificato invece: `tsc` pulito, la sezione è sparita da CONFIG, `MetabolicCheck` monta la
nuova sezione senza errori quando `needleTrim`+`effConnected` sono veri (letto nel sorgente),
il velo si schiarisce solo con la prop presente (letto nel sorgente, invariato per App.tsx
che non la passa mai).

**2) Il Journal, stesso font del resto dell'app.** Era `--s-mono` — l'unica zona a usarlo per
il testo corrente. Un font monospazio ha più inchiostro per carattere di un sans-serif alla
STESSA dimensione e colore: più "pieno", quindi percepito più chiaro/acceso su un fondo scuro
— non un colore sbagliato (`--s-ink` è già tarato per contrasto in entrambi i temi), la
TECNICA. Passato a `--s-sans`, lo stesso di tutto il resto (Assessment, PistaCiclo,
SuggerimentoCiclo…): la doppia richiesta (uniformità + meno bianco) risolta da un solo cambio.
Verificato: `getComputedStyle` sulla riga del giornale conferma `ui-sans-serif...` invece di
`ui-monospace...`, stesso colore di prima (nessuna intenzione di toccarlo, solo il font).

**3) « IN LIGHT TA 1 cans vs 2 non si vede ».** Trovato in DUE posti che mostrano lo stesso
confronto: `PannelloMeter.tsx` (SERENITY, il cassetto del meter sempre raggiungibile) e
`ThetaReadyCheck.tsx` (condiviso con EQUILIBRIUM, la prima taratura di seduta). Stessa causa in
entrambi: le etichette "2 ·"/"1 ·" si affievolivano con `opacity:0.6` sul colore EREDITATO
invece di un token dedicato — un'opacità frazionaria sfuma verso lo SFONDO SOTTOSTANTE, non
verso un grigio fisso: nello scuro di sempre sfumava verso un fondo comunque scuro (leggibile),
in chiaro sfuma verso il quasi-bianco (troppo tenue). `PannelloMeter.tsx`: `opacity:0.6` tolto,
sostituito con `color:'var(--s-ink-faint)'` (il token già tarato per contrasto in entrambi i
temi). `ThetaReadyCheck.tsx` (condiviso, non toccato direttamente): una regola in più in
`readyCheckLight.css` (lo stesso foglio SOLO-SERENITY che già ritinge questo componente in
chiaro) — `[style*="opacity: 0.6"]` → `opacity:1 !important; color:#475569 !important` — SOLO
due elementi nel file la usano (verificato con un grep mirato), nessun altro elemento colpito
per sbaglio.

**4) OUI/NON in Assessment/R&I, ora autoesplicativi.** I due bottoni prima del giudizio
mostravano `t('ri_yes')`/`t('ri_no')` nudi ("Sì"/"No", "Oui"/"Non"…) — il significato
("indica al preclear?") viveva SOLO nel `title`, un tooltip invisibile finché non ci si passa
sopra col mouse. Cambiati in `✓ {t('ri_indicates')}` / `✗ {t('ri_does_not_indicate')}` — lo
STESSO testo che lo stato GIÀ deciso mostra due righe più giù, un riuso non un'invenzione.
Verificato dal vivo: scritto un item in R&I → Manuale, comparsi i due bottoni "✓ indique" /
"✗ n'indique pas" (in francese, la lingua della prova).

**5/6/7 — L'ITEM, tolto da dove non serviva, aggiunto dove serve.** Il campo "ECRIS OU DIS
L'ITEM" (prima di armare un metodo) aveva un bug preciso: premere Invio chiamava
`setItem('')` SUBITO dopo averlo loggato — lo svuotava prima ancora che l'auditor potesse
cliccare CONTACT/NULL/MIRROR/TONE, che lo trovava già vuoto. Tolto per intero (l'auditor ha
già R&I/ASSESSMENT per annotare un item prima di armare). Al suo posto, DENTRO `PistaCiclo`
(una volta armato un metodo), l'item — prima uno `<span>` di sola lettura — è ora un
`<input>` vero, per CONTACT/NULL/MIRROR/TONE indistintamente: scrivere chiama `setItem`, LO
STESSO stato che la voce riempie già — calcola la carica esattamente come un item detto a
voce, perché per il motore (`useContactNullCycle`/`useMirrorCycle`/`useToneCycle`) è la STESSA
variabile. Se il ciclo aspetta ancora l'item (`diItem`), Invio chiama anche `onDichiaraDetto`,
lo stesso gesto del bottone "l'item è stato detto" accanto. Verificato dal vivo: armato
CONTACT, scritto "test genitore" nel campo — preso; armato TONE, scritto "paura del buio" nel
campo resistenza — preso, Invio senza errori.

**8) BUG TROVATO — `PistaProcedimento`, la stessa causa già trovata per `PistaCiclo` un giro
fa, in un posto diverso.** Non un doppio montaggio (un solo `<PistaProcedimento>` nel
sorgente). La sua intestazione (nome del procedimento + bottone FERMER) portava ancora
`position:'sticky', top:0` — residuo di quando questo componente scorreva AL SUO INTERNO
(`overflowY:'auto'`, tolto in un giro precedente per la richiesta « niente scroll, tutto in
larghezza »). Senza uno scorrimento proprio, `sticky` cerca il primo ANTENATO che scorre — ora
`gruppoBasso`, in `Serenity.tsx` — e si incolla LÌ: l'intestazione restava fissa in cima a
QUELLA scatola mentre i comandi veri scorrevano sotto di lei, sempre coperti — esattamente il
sintomo segnalato, stavolta per i procedimenti invece che per i cicli. `PistaCiclo` non aveva
mai avuto questo `sticky` (verificato): ecco perché il suo fix di un giro fa (`justifyContent:
'flex-start'` su `gruppoBasso`) non bastava anche per questo componente — due bug diversi con
lo stesso sintomo. Tolto `position`/`top`: l'intestazione torna un normale primo figlio nel
flusso.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/PannelloConfig.tsx`, `src/serenity/Serenity.tsx`,
`src/serenity/PistaCiclo.tsx`, `src/serenity/PistaProcedimento.tsx`,
`src/serenity/PannelloMeter.tsx`, `src/serenity/ZonaAssessment.tsx`,
`src/serenity/readyCheckLight.css`, `src/components/MetabolicCheck.tsx`.

EQUILIBRIUM 2.0.220, SERENITY 3.0.114.

---

## Ottantunesimo giro (26/08/2026) — la VISTA SENZA AGO; OUI/NON grigi con intestazione; MUSE visibile nel test del respiro; il bottone CHIUDI dei cicli tolto

**Segnalato** (sei punti sullo stesso giro precedente, poi una richiesta a parte):

1. « INDICATE and does not indicate sembra che sia indicate già valido. METTILI TUTTE E DUE
   grigi e cambia colore quando è scelto »
2. « Does not... non si vede è fuori campo. Scrivi Yes, Not e sopra in testa di colonna
   INDICATE »
3. « Quando si fa il test del MUSE resta selezionato il METER e non si vede cosa si fa col
   MUSE »
4. « Ma col MUSE il valore di MIRROR era calcolato automaticamente, si iscrive quando si è col
   METER o senza strumenti »
5. « Il bottone close dei cicli non mi sembra serva a qualcosa »
6. « Il bottone COMMANDS non indica il numero di file presenti se non lo apri prima »

poi, a parte: « devi mettere la police de caractère du journal più in grigio per non
disturbare la vista » e infine la richiesta grande: una vista senza ago.

**1/2) OUI/NON — grigi finché non scelti, corti, con intestazione.** Il giro precedente aveva
allungato i due bottoni in "✓ indica"/"✗ non indica" (per spiegare cosa fossero) e colorato
"indica" di verde — ma il verde PRIMA di cliccare lo faceva sembrare già scelto, e la frase
intera non ci stava nello spazio stretto della colonna (« does not... fuori campo »). Corretto
i DUE punti insieme: i bottoni tornano corti (`ri_yes`/`ri_no`), ENTRAMBI grigi (nessun colore
finché la scelta non è fatta — il colore arriva SOLO nel bottone singolo che li sostituisce
dopo, quello resta invariato), e un'intestazione "INDICATE" (`t('ri_indicates')`, riusata, non
un'invenzione) compare UNA VOLTA SOLA sopra la lista, allineata a destra come i bottoni stessi
(`justifyContent:'flex-end'`, lo stesso bordo — nessun calcolo di posizione, i due combaciano
da soli).

**3) L'ago del MUSE, visibile durante il SUO test.** `agoEeg` (la variabile che decide quale
ago disegnare) aveva due casi speciali già scritti (TONE impone il Meter, un ciclo EEG in
corso impone il MUSE) ma non un terzo: durante `MetabolicCheck` (il respiro guidato) restava
sulla preferenza generale (`agoScelto`) — se il METER era già stato provato prima in questa
seduta e la preferenza era rimasta lì, lo schermo del respiro mostrava l'ago SBAGLIATO.
Aggiunto `metabolicOpen ? true : ...`: durante questo schermo l'ago è sempre quello del MUSE.

**4) MIRROR — chiarito, non un bug.** Verificato `useChargeEngine.ts`: `trackMirrorRef` è
alimentato SOLO dal worker EEG (dentro il suo gestore di messaggi, mai dal Theta-Meter) —
quando il MUSE è connesso, il motore blocca automaticamente il valore 1–10 al primo vero
contatto (`MirrorCycle.update`, il "read si è retourné"); coi soli METER o senza strumenti
`trackMirror` non viene mai chiamato, e restano gli UNICI dieci bottoni manuali già presenti.
Il meccanismo esiste già e funziona come descritto — nessuna modifica: l'item scrivibile
aggiunto un giro fa (il testo dell'item, per tutti i metodi) è una variabile SEPARATA dal
valore 1–10 di MIRROR, non lo tocca.

**5) Il bottone CHIUDI dei cicli, tolto.** Aveva senso quando `PistaCiclo` viveva SOVRAPPOSTA
all'arco (il file lo ricorda ancora nel titolo) — chiuderla rivelava l'ago che copriva. Da un
giro all'altro la pista è diventata un FRATELLO dell'arco nel flusso normale: l'ago non è mai
stato coperto da lei da allora, e chiudere non rivela più nulla — un gesto rimasto senza il
suo effetto originale. Tolti lo stato `chiuso`, il bottone, la pillola collassata: la pista
resta sempre visibile.

**6) La pastiglia di COMMANDS, caricata subito.** `listaProcedimenti()` partiva SOLO
`if (processusAperto)` — la lista (e quindi la pastiglia, `procedimenti.length`) restava a 0
finché l'auditor non apriva il modale almeno una volta. Tolta la guardia: carica anche al
primo render, e ancora ogni volta che PROCESSUS si apre o si chiude (il ricaricamento "a
caldo" di un file appena aggiunto resta invariato).

**Il Journal, ancora più grigio.** Il giro precedente aveva cambiato solo il FONT
(monospazio → sans-serif). Non bastava: `--s-ink` (l'inchiostro pieno) restava il colore più
acceso della scala. Sceso a `--s-ink-soft` — un gradino più tenue, lo stesso già usato altrove
per il testo corrente, non `--s-ink-faint` (quello resta riservato alle righe SYS).

**La VISTA SENZA AGO.** Chiesta per intero: « una vista in più dell'arco con l'ago (bottone
slide per scegliere, come per LIGHT DARK) in cui non mostri l'ago né l'arco, ma solo i colori
di CONTACT, DISSOLUTION, AS-IS e la velocità di liberazione, elegante, futurista ma efficiente
e molto comprensibile, mantenendo tutte le scritte ed i cicli presenti quando c'è l'arco ».

Nuovo file `VistaSenzaAgo.tsx` — una SECONDA resa dello STESSO dato di `ClearDial` (lo stesso
`chargePhase`/`cycleKind`/`nullPhase` da `metricsStore`, la STESSA fonte dei colori
`lib/chargeState.ts` — « una funzione → un colore, usato dalla sfera E dall'ago, così le due
viste non si contraddicono mai »: questa è una terza vista, stessa regola, mai un colore
inventato). `ClearDial` è un anello SOTTILE (`CYCLE_R=461`, spessore 10 — un filo pensato per
girare CONCENTRICO all'ago vero); qui l'ago non c'è, la stessa informazione diventa la
protagonista — banda molto più spessa (30), raggio più grande (610), un centro libero per la
fase in parole grandi + la velocità invece che vuoto. **La velocità, visibile e non solo
scritta**: `velRatio` (`metricsStore`, la STESSA fonte di `LetturaVelocita` già esistente in
`Serenity.tsx`) governa il RITMO dell'impulso della zona attiva — più veloce il rilascio, più
veloce l'impulso, leggibile a colpo d'occhio prima ancora di leggere il numero (che resta
comunque scritto, per chi vuole la precisione).

Un bottone slide nell'intestazione (`BottoneCiclico`, lo STESSO componente di
`SelettoreTema` — nessun secondo stile inventato), persistito in `localStorage` come il tema.
Al posto di `QuantumSphere`+`ClearDial` quando scelta — MIRROR e TONE non toccati (le loro
scale, 1–10 e −40…+60, non sono "CONTACT/DISSOLUTION/AS-IS": inventare qui una loro
traduzione non era stato chiesto) — l'ago sparisce comunque anche lì, `MirrorDial`/`ToneDial`
restano quel che sono, indipendenti dalla scelta.

⚠️ **BUG TROVATO verificando dal vivo, nello stesso giro**: a riposo (nessun ciclo armato) in
tema CHIARO le tre zone erano quasi invisibili — la STESSA famiglia di bug già trovata altrove
in questa sessione (`readyCheckLight.css`, `PannelloMeter.tsx`): un'opacità frazionaria sfuma
verso lo SFONDO SOTTOSTANTE, non verso un grigio fisso. Qui la cosa raddoppiava: l'intero
gruppo scendeva a 0.45 quando non armato, E ogni segmento (nessuno "attivo" a riposo) scendeva
GIÀ a 0.22 per conto suo — 0.45×0.22 ≈ 0.10, un decimo di opacità, praticamente sparito su
sfondo chiaro. Tolta la doppia attenuazione (ridondante) e tarata una soglia più alta per il
tema chiaro (0.4 invece di 0.22) — verificato dal vivo, DOPO la correzione, in entrambi i temi.

**Verificato in browser** (`senzaMisura` forzato temporaneamente, tolto subito dopo): vista
zone a riposo (dark E light, dopo la correzione del contrasto), ciclo CONTACT armato (banda
rossa attiva col glow, "en attente" finché il contatto vero non arriva — stessa logica di
`ClearDial`, non un errore), ciclo NULL armato (NULL/RISE/EQUILIBRIUM coi loro colori),
MIRROR armato (nessun ago, `MirrorDial` intatto). OUI/NON: scritto un item in R&I, bottoni
"Sì"/"No" grigi con l'intestazione "INDICATE" sopra. Il bottone COMMANDS mostra il numero
prima di essere mai aperto (verificato leggendo l'effetto, non ancora un vero file di
procedimento presente in questo ambiente per un conteggio non-zero dal vivo).

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/Serenity.tsx`, `src/serenity/PistaCiclo.tsx`,
`src/serenity/ZonaAssessment.tsx`, `src/serenity/VistaSenzaAgo.tsx` (nuovo).

EQUILIBRIUM 2.0.221, SERENITY 3.0.115.

---

## Giro (26/08/2026) — l'ago visibile nel test MUSE; la velocità a barra; i bottoni dei cicli differenziati; la massa tolta dal report

**Segnalato**:

1. « dans le test del MUSE on ne voit pas bien l'aiguille, rend la fenetre plus transparente ou
   deplace la »
2. « dans le journal rend la police de caractere plus grise »
3. « la valeur dans TON n'arrete pas de monter et descendre sur l'echelle. on doit revoir les
   calculs, montre moi et on decide quoi faire »
4. « Les boutons des cicles doivent etre mieux differencies sans etre trop voyants »
5. « La vista zones: Il bottone non è esplicito, la vitesse deve essere una barra slide »
6. « Nel report togli la percentuale della massa et non vedo più il testo della verbalizzazione
   poichè anbce nel journal non appare »

**1) L'ago, visibile durante il SUO test — di nuovo.** Il velo esterno era già stato
schiarito in un giro precedente (`needleTrim`, `rgba(0,0,0,0.28)` senza sfocatura) — non
bastava: la CARTA stessa (460px, quasi opaca, centrata sull'INTERO schermo) cadeva proprio
sopra il perno dell'arco. Il centro vero dello schermo NON è il centro vero dell'arco: la
barra laterale EP/COMMANDS toglie ~320px a sinistra, spostando il centro dell'arco a destra
del centro pieno. Corretto in due mosse: la carta si sposta a sinistra
(`justifyContent:'flex-start'`, un margine) invece di restare centrata — cade nella fascia già
occupata dalla barra laterale, l'arco resta scoperto sulla sua destra — e la carta stessa
scende di opacità (0.96/0.94 → 0.88/0.86) e di sfocatura (24px → 16px) SOLO con `needleTrim`:
un po' dell'arco traspare anche dietro di lei, non solo ai suoi lati.

**2) Il Journal, ancora più grigio.** Due giri fa il font (mono→sans), un giro fa il colore
(`--s-ink`→`--s-ink-soft`) — non bastava ancora. Sceso a `--s-ink-faint`, lo STESSO grigio già
usato per le righe SYS/il timestamp/l'etichetta ✕: tutto il giornale a un solo grigio
discreto, la voce di chi parla resta distinguibile dal grassetto, non dal colore.

**3) TONE — la scala che oscilla: TROVATO, da decidere insieme.** Verificato
`engine/toneScale.ts`/`session/useToneCycle.ts`: col MUSE, `toneOraMuse` chiama
`toneFromDelta(toneAtStart, qLAllaPartenza, qLAdesso, escursione=1)` — la carica EEG corrente
(`d.qL`, "predicted/display", non ulteriormente lisciata qui) entra CRUDA, senza nessuna
attenuazione fra un tick e l'altro, in una formula che moltiplica lo scarto per `2×40/1 = 80`:
un rumore anche piccolo su `qL` (frazioni di unità — plausibile per un segnale EEG dal vivo)
diventa un salto di diversi punti sulla scala −40…+40. Confronto: `engine/MirrorCycle.ts`, che
fa un calcolo simile (carica istantanea → valore 1–10 mostrato) MA lo fa passare da uno
`smoothQ` (media mobile) prima di mostrarlo — TONE non ha l'equivalente sul ramo MUSE. Non
toccato: la scala è terreno clinico, la richiesta esplicita è « decide[re] insieme cosa fare »
prima di cambiare una formula che l'auditor legge come dato vero.

**4) I quattro cerchi CONTACT/NULL/MIRROR/TONE, differenziati.** Tre usavano già i TRE SEGNALI
del sistema (`--s-still`/`--s-alive`/`--s-reserve`, v. `tokens.css` — « tre e non dieci, un
linguaggio che l'auditor deve ricordare è un linguaggio che non guarderà »); TONE restava
`hue: null`, lo stesso grigio spento di un bottone senza nulla di speciale — non "meno
vistoso", solo MENO RICONOSCIBILE. Dargli uno dei tre segnali gli avrebbe rubato un
significato che porta altrove (stati, non nomi di metodo): una QUARTA tinta locale,
`--s-tone-hue` (stessa desaturazione/luminosità delle altre tre, a metà strada sulla ruota fra
`--s-reserve` e `--s-alive` — non un colore acceso nuovo, non un quinto segnale del sistema,
usata SOLO per questi quattro cerchi). Aggiunta anche una tinta di FONDO leggerissima
(`color-mix`, 12%) a tutti e quattro, oltre al bordo — più superficie colorata, stessa
saturazione tenue.

**5) La vista senza ago — il bottone e la velocità.** Le due tappe dicevano "ago"/"zone" —
sostantivi nudi, che non dicono QUALE vista si vede ora. Diventano "con ago"/"senza ago" — le
stesse parole della richiesta originale. La velocità (numero + parola) resta, MA affiancata da
una barra a tre zone (lento/normale/veloce, gli stessi limiti già usati per `wordVel`) con un
cursore che scorre — colorato riusando `--s-alive`/`--s-reserve` per il loro significato VERO
(qualcosa accade / non sostenibile), non due tinte nuove.

**6) Il report — la massa tolta, la verbalizzazione indagata.** Rimossa la casella "massa"
dalle quattro metriche del PDF (`sessionReport.ts`) — le altre tre (Total TA/F-N/EP) si
allargano su tre colonne invece di lasciare un vuoto. La verbalizzazione mancante nel Journal
(non solo nel report, che la legge da lì): verificato `useVoiceItem`/`onTranscript` in
`Serenity.tsx` — la pipeline che scrive la trascrizione nel giornale è intatta, non toccata da
nessuna modifica recente. Non riproducibile qui: il riconoscimento vocale ha bisogno di un
microfono vero, assente in questo ambiente sandbox (« camera and microphone access... blocked
» a ogni sessione di verifica di questo giro). Resta un punto aperto — non un fix silenzioso
su qualcosa che non si è potuto vedere accadere.

**Verificato in browser** (`senzaMisura` forzato temporaneamente, tolto subito dopo): vista
zone con l'etichetta "con ago"/"senza ago" leggibile; ciclo CONTACT armato con la barra della
velocità (tre zone, cursore al centro su "1.00× normale"); i quattro cerchi CONTACT/NULL/
MIRROR/TONE ciascuno con bordo E fondo distinti, TONE non più grigio spento.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/Serenity.tsx`, `src/serenity/VistaSenzaAgo.tsx`,
`src/serenity/tokens.css`, `src/serenity/sessionReport.ts`, `src/components/MetabolicCheck.tsx`.

EQUILIBRIUM 2.0.222, SERENITY 3.0.116.

---

## Giro (26/08/2026) — TONE solo sale; il Journal parla, non annuncia; il tono di voce arriva in SERENITY

**Segnalato**:

1. « Fai una media mobile e tieni il punto più alto sulla scala fisso fino a che un punto più
   alto non è raggiunto. Così la vediamo solo salire » — decisione presa insieme sul giro
   precedente (« la valeur dans TON n'arrete pas de monter et descendre »).
2. « Nel journal non appare il testo. Poi appaiono troppe informazioni, non mettere visibili le
   reazioni o la dissoluzione, solo il testo con il tono di voce e la reazione se c'è sulla
   parola »
3. « Anche nel ciclo non appare più l'item che è pronunciato »
4. « La barra slide della velocità falla più luminosa, come per l'arco, ma con una barra di
   progressione non una pallina »

**1) TONE — media mobile + punto più alto fisso.** Aggiunta `TONE_SMOOTH` (`tuning.ts`, stesso
alfa di `MIRROR_SMOOTH`, 0.15) — una EMA su `qL`/il TA prima di entrare in `toneFromDelta`, sui
DUE rami (MUSE e METER, non solo quello segnalato). Aggiunto un ratchet (`toneHighRef` in
`useToneCycle.ts`): dopo la localizzazione, il tono mostrato è `max(valore lisciato adesso,
punto più alto già visto in QUESTA localizzazione)` — non scende mai, si azzera SOLO a una
nuova localizzazione o a un reset di seduta. Coerente col comando di Ron (« raise this to tone
forty »): si sale, non si oscilla.

**2/3) Il Journal e l'item — la STESSA causa, trovata leggendo il codice.** `.filter(l =>
!(avvio.solo && (l.speaker === 'Aud' || l.speaker === 'PC')))` toglieva le righe Aud/PC
PROPRIO in seduta SOLO — il caso più comune, e la ragione per cui « il testo non appare » E
« l'item non appare più »: gli effetti che riempiono l'item alla voce leggono `journal.logs`
cercando righe `Aud`, e in seduta solo (`avvio.solo`) quelle righe non venivano nemmeno
SCRITTE a schermo (anche se restavano nell'array sottostante — il filtro era solo sulla RESA).
Tolto il filtro solo-mode. Insieme, la seconda metà della richiesta: la vista ora mostra SOLO
`speaker === 'Aud' || 'PC'` (NEEDLE e SYS — le reazioni annunciate a parte, l'andamento del
ciclo — restano nei dati per il PDF/gli effetti, non più nella resa live); la REAZIONE, se
c'è, si legge ORA accanto alla parola (stesso `computeInstantRead` di `aggiungiItemManuale`),
non più su una riga a sé.

**Il tono di voce — un pezzo che a SERENITY mancava per intero.** `useVoiceItem.ts` lo
dichiarava esplicito nella sua stessa intestazione (« qui manca tutta la logica di
ruolo/satellite/tono-vocale/relay di rete di App.tsx ») — non una svista di questa sessione,
un pezzo mai portato. `voiceToneAnalyzer` (lo STESSO singleton di App.tsx, un flusso microfono
a parte da quello del riconoscitore) ora si avvia con la seduta (`avviaSeduta()`) e si ferma
alla chiusura (`chiudi()`); `.analyze()` letto nello stesso punto in cui lo legge App.tsx (al
consumo della trascrizione, non dentro il riconoscitore) e allegato come `tone` a ogni riga
Aud. Il chip che lo mostra riusa lo stesso stile di `TranscriptLog.tsx`. **Trovato per strada**:
le chiavi `tone_calm`/`tone_neutral`/`tone_tense`/`tone_stressed` non esistevano affatto in
`i18n.tsx` — il chip di App.tsx le legge da sempre a vuoto (`t(...) || ''`, mai un errore, solo
un'etichetta bianca). Aggiunte nelle cinque lingue: correzione di un buco preesistente,
condivisa con EQUILIBRIUM, non solo per SERENITY.

**4) La barra della velocità, più luminosa, a riempimento.** Il cursore tondo diventa una
barra RIEMPITA fino alla posizione corrente — colore pieno (non più stemperato al 35%) più un
`boxShadow` a più strati che imita il glow SVG dei segmenti dell'arco (un `<div>` non può
usare lo stesso filtro, l'effetto si ottiene impilando ombre).

**Verificato in browser**: velocità come barra luminosa a riempimento (CONTACT armato,
1.00×); History con i bottoni View/PDF presenti per tutte le sessioni (il punto « nella
cronologia non appare più la possibilità di visualizzare né scaricare » segnalato a parte NON
si riproduce in questo ambiente — 5/5 sessioni con PDF, bottoni visibili; se succede ancora
sulla macchina vera, serve sapere in quali condizioni per restringere la ricerca). Non
verificato dal vivo (nessun microfono reale in questo ambiente sandbox): il tono di voce che
appare davvero nel chip, la voce che riempie l'item durante un ciclo.

**Punto rimasto da chiarire**: un messaggio su « il test del MUSE... mostra la sensibilità e
l'inerzia ma non l'ago, l'auditor non può sapere come regolarle » è arrivato incompleto/
mescolato — non affrontato in questo giro, in attesa di una riformulazione.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. `git status`: `src/serenity/Serenity.tsx`, `src/serenity/VistaSenzaAgo.tsx`,
`src/session/useToneCycle.ts`, `src/engine/tuning.ts`, `src/i18n.tsx`.

EQUILIBRIUM 2.0.224, SERENITY 3.0.117.

---

## Giro (26/08/2026) — `viewModeRef` sbloccato: MIRROR e TONE si alimentano davvero dal MUSE; l'ago visibile nel test; lo scivolo e l'item non si tagliano più

**Il punto rimasto in sospeso dal giro precedente**, riformulato: « Il test di sensibilità e
dell'inerzia del MUSE non mostra l'ago del MUSE, dunque impossibile di capire cosa fare » — e,
insieme, un secondo segnalato che sembrava scollegato: « In MIrror il valore non vien mai
indicato in automatico e si deve scegliere a mano ». Le due cose avevano DUE cause diverse,
trovate entrambe rileggendo il codice da capo (non l'ipotesi di un giro precedente, scartata
esplicitamente: « chiarito, non un bug » non reggeva più davanti al segnalato).

**LA CAUSA VERA DI MIRROR — e, di striscio, di TONE.** `viewModeRef` (in `Serenity.tsx`) porta
`App.tsx` a distinguere `'needle' | 'mirror' | 'tone'` così che il worker EEG sappia A CHI dare
il campione (`useChargeEngine.ts`: `if (d.viewModeRef.current === 'mirror') trackMirrorRef(...)`,
lo stesso per `'tone'`). In `App.tsx` questo ref si RISCRIVE a ogni render
(`viewModeRef.current = viewMode`). In `Serenity.tsx` portava un commento onesto, di quando
MIRROR e TONE non esistevano ancora: « SERENITY non ha ancora MIRROR/TONE — sempre 'needle'
finché quelle viste non arrivano ». Le due viste sono arrivate (giri precedenti), ma nessuno è
tornato a togliere quel `'needle'` fisso — il ref non è MAI stato risincronizzato. Risultato: il
worker non chiamava mai `trackMirrorRef`/`trackToneRef`, quindi:
- **MIRROR**: `MirrorCycle.update()` (il rilevatore di picco che blocca da sé il valore) non
  riceveva MAI un campione — da qui « non vien mai indicato in automatico », esattamente come
  segnalato: non una taratura troppo severa, un tubo staccato.
- **TONE**: il `toneLocator` (che localizza il momento della risalita) restava anch'esso
  fermo — la MISURA in scala restava viva lo stesso (alimentata altrove, `qLRef.current = d.qL`
  a ogni render, non passa da questo ref), motivo per cui l'oscillazione del giro precedente si
  vedeva comunque, ma la LOCALIZZAZIONE automatica no.

Fix in `Serenity.tsx`: `viewModeRef.current` si scrive ora subito dopo aver calcolato `mode`,
con la STESSA derivazione di `App.tsx` (`mode==='mirror' ? 'mirror' : mode==='tone' ? 'tone' :
showTrailPref ? 'needle' : 'needle_pure'`). Di striscio, anche `localizzaTone` in
`useToneCycle.ts` aveva `d.auditingQuestion` assente dalle sue dipendenze (nessuna nota che lo
giustificasse, a differenza di `d.qL` — v. il giro precedente): aggiunta, per la stessa ragione
per cui l'item non arrivava sempre a TONE.

**L'AGO NEL TEST MUSE — terzo tentativo, stavolta strutturale.** I primi due (velo più chiaro,
carta spostata) attenuavano senza risolvere: restava comunque un velo nero (28%) steso su TUTTO
lo schermo, ago compreso — un ago chiaro su tema scuro perde contrasto anche sotto un velo
"leggero", e la carta, per quanto spostata, restava una modale grande che tagliava fuori mezzo
schermo. `MetabolicCheck.tsx`, con `needleTrim` presente: il velo sparisce DEL TUTTO
(`background:'transparent'`, niente `blur`) e la carta stessa cambia natura — non più una
modale centrata (460px, a tutto schermo dietro) ma un pannello fluttuante in un ANGOLO
(340px, ancorato basso-sinistra — l'angolo strutturalmente più lontano dal perno dell'ago, che
sta in basso ma spostato a destra per via della barra EP/COMMANDS). `pointerEvents:'none'`
sull'involucro pieno schermo, `'auto'` solo sulla carta: il resto dello schermo, ago compreso,
torna cliccabile come se l'overlay non ci fosse. Verificato dal vivo (override temporaneo di
`museConnected`/`museWorn` per raggiungere la schermata senza hardware reale): l'ago si vede,
si muove, resta leggibile esattamente come in seduta.

**TONE — l'ambiguità « in corso o raggiunto » nell'arco e in testa.** Segnalato: « mette i due
valori, quello iniziale e il tono 40, ma come auditor non si sà se è già stato ottenuto ».
La scritta sopra l'arco era LETTERALMENTE identica nelle due fasi (`raise` e `done`) — stesso
`+40` in `--s-reserve` (un colore che nella dottrina dei tre segnali significa altro: "dato
presente non sostenibile", non "raggiunto"). Ora: in salita, `--s-tone-hue` con una freccia che
pulsa (`animate-pulse`) e la scritta "in corso…"; raggiunto, `--s-still` — LO STESSO segnale che
l'AS-IS/F-N usano altrove per "arrivato" — con un segno di spunta, immobile. Nell'arco stesso
(`ToneDial.tsx`), la stessa distinzione: la riga ambra e l'anello di avanzamento pulsano SOLO
mentre si sale, spenti (già avevano il loro segnale: glow fisso + `AS-IS`) una volta raggiunto.

**Lo scivolo con/senza ago — tagliato in francese.** `BottoneCiclico`, ramo a due tappe, usa una
larghezza FISSA (`TOGGLE_W=124`, tarata su "chiaro"/"scuro") che il `minLarghezza` esistente non
tocca affatto — il tentativo di un giro precedente (`minLarghezza={120}`) era quindi un'azione a
vuoto, il taglio restava. Aggiunta una prop dedicata a questo ramo soltanto,
`larghezzaScivolo` (190px per lo scivolo con/senza ago), senza toccare `SelettoreTema` che non
la passa.

**L'item nei cicli, tagliato nella sua stessa zona.** `PistaCiclo`: la larghezza dell'`<input>`
si calcolava in `ch` (`text.length * 1ch`) — `1ch` è la larghezza del glifo "0", non la media dei
caratteri, e per un font proporzionale (`--s-serif`) questo sottostima sistematicamente lo
spazio vero. Corretto con un moltiplicatore di sicurezza (`× 1.6`).

**Anche NEEDLE LIGHT e il selettore MUSE/METER/DEUX, nascosti in vista senza ago** — segnalato:
« Quando abbiamo senza ago, non devi mostrare MUSE/METER DEUX »/« Quando si scegli senza ago non
devi mostrare NEEDLE LIGHT ». Entrambi parlano di una scia/di uno strumento che appartiene
all'AGO — nella vista senza ago (`VistaSenzaAgo`) non hanno un oggetto a cui riferirsi.

**Rimasto in sospeso — bloccato, non da questa sessione**: cambiare l'icona di SERENITY con
l'immagine (testa/cervello in wireframe) allegata in chat. Nessun file accessibile su disco per
quell'immagine — il cambio (`electron-builder.serenity.cjs`, un `icon` per-app diverso da quello
condiviso con EQUILIBRIUM) resta pronto a implementarsi appena l'utente fornisce un percorso file
utilizzabile (idealmente un PNG 1024×1024 o un `.icns` già pronto).

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore), `vitest run`
639/639. Verificato dal vivo nel browser (con override temporanei sempre rimossi dopo): lo
scivolo mostra "avec aiguille"/"sans aiguille" per intero, NEEDLE LIGHT e MUSE/METER/DEUX
spariscono in vista senza ago, l'ago è visibile nel test di prontezza MUSE, l'item lungo non si
taglia più nella pista del ciclo. `git status`: `src/serenity/Serenity.tsx`,
`src/components/MetabolicCheck.tsx`, `src/components/ToneDial.tsx`, `src/serenity/PistaCiclo.tsx`,
`src/serenity/BottoneCiclico.tsx`, `src/session/useToneCycle.ts`.

EQUILIBRIUM 2.0.225, SERENITY 3.0.118.

---

## Giro (26/08/2026) — l'icona di SERENITY; `agoEeg` non confondeva più le boîtes col MUSE; TONE arma in un click; History PDF apribile per davvero

**L'icona.** Arrivata come file (`~/Downloads/Fonds/Ondes.png`, una testa/cervello in wireframe
dorato su nero) — prima bloccata perché l'allegato in chat non dava un percorso su disco.
Composta in un badge circolare 1024×1024 (Pillow: gradiente radiale, anello sottile, bagliore
ambrato dietro i nodi accesi), nel nero neutro di SERENITY (`--s-ground` scuro, `#17181a`),
NON il blu navy dell'icona di EQUILIBRIUM — la sua identità, non una copia. Iconset generato con
`sips`, `.icns` con `iconutil`, collegato in `electron-builder.serenity.cjs` con un override
mirato (`mac: { ...b.mac, icon: 'build/icon-serenity.icns' }`) — EQUILIBRIUM non tocca.

**`agoEeg` confondeva ThetaReadyCheck con MetabolicCheck.** Segnalato: « quando fai il test MUSE
resta su METER » (il SELETTORE lo diceva, il vero ago era già quello giusto — v. sotto) e,
separatamente: « quando faccio la prova dello squeeze l'ago si freeze ». Stessa causa profonda:
`metabolicOpen` è UNA variabile che apre DUE schermate diverse in sequenza (prima
`ThetaReadyCheck`, la stretta delle boîtes; poi `MetabolicCheck`, il respiro del MUSE) — ma
`agoEeg = metabolicOpen ? true : ...` forzava l'ago EEG per TUTTO `metabolicOpen`, comprese le
boîtes. Durante lo squeeze test l'ago disegnato era quindi quello del MUSE (fermo, senza
segnale) invece di quello del Meter (che si sarebbe mosso con la stretta vera) — non un vero
"freeze" del motore, l'ago SBAGLIATO. Aggiunta `inThetaReadyCheck` (la STESSA condizione che
sceglie quale dei due componenti montare) per restringere il forzato EEG alla sola metà giusta.
Di riflesso, anche il selettore MUSE/METER/DEUX sotto l'arco (che leggeva `agoScelto`, la
preferenza persistita, mai il forzato) è stato nascosto durante `metabolicOpen`: mostrava
"METER" sopra un ago che nel frattempo era EEG — fuorviante, e comunque senza effetto essendo il
forzato a vincere sempre.

**TONE arma in un click, come gli altri tre.** Segnalato: « le cicle TONE contrairement aux
autres demande d'appuyer sur un bouton pour donner l'item. ENLEVE LE ». Vero: `armCycle`/
`armMirror` (CONTACT/NULL/MIRROR) armano E aprono la cattura dell'item nello stesso click; il
cerchio TONE apriva solo il pannello e aspettava un secondo click, "DAI L'ITEM"
(`tone.localizzaTone()`) — la stessa asimmetria esiste in App.tsx (non un'invenzione di questa
sessione), ma qui è un'esplicita richiesta di non riprodurla. Il click sul cerchio ora arma E
localizza insieme; il selettore del tono di partenza SENZA meter (prima dentro la fase
"locate", ormai irraggiungibile) si è spostato PRIMA, accanto al cerchio TONE stesso — si sceglie
da dove si parte, poi si clicca, non il contrario.

**History — i PDF SERENITY erano invisibili per una ragione strutturale, non intermittente.**
Segnalato di nuovo dopo un giro in cui non si era riprodotto il bug (« il est toujours
impossible de visualiser les pdf de History »). Trovate DUE cause, una dentro l'altra:
1. `HistoryModal.openPdf` provava PRIMA un `blob:` locale (`URL.createObjectURL`, IndexedDB) e
   solo come ultima spiaggia l'URL del server. Un `blob:` è registrato per PROCESSO di
   rendering — la finestra figlia che Electron apre per il "View" (`setWindowOpenHandler` in
   `main.cjs`, corretto in un giro precedente per PERMETTERE la navigazione) gira in un processo
   suo (`overrideBrowserWindowOptions` lo costringe), quindi il blob creato nella finestra
   principale non esiste più lì: la navigazione veniva concessa, la pagina restava vuota o
   rotta — nessun errore visibile, solo "non si vede niente". Invertito l'ordine: si prova PRIMA
   l'URL del server locale (`serverSessionPdfUrl`, una risorsa di rete vera — `api-routes.cjs`
   la serve con `Content-Type: application/pdf` — senza scope di processo), il blob resta
   l'ultima spiaggia per quando il server non risponde affatto.
2. Ma il server non aveva MAI un PDF SERENITY da servire: `PostSessionReport.tsx` (App.tsx)
   carica il PDF sul server locale a ogni chiusura seduta (commento "FIX HISTORY-PDF", un bug
   già trovato e corretto lì UNA VOLTA) — quel caricamento non era mai stato portato al
   salvataggio di SERENITY (`Serenity.tsx`, dentro `chiudi()`), che scriveva SOLO in IndexedDB.
   Aggiunta la stessa chiamata (`serverSaveSessionPdf`, stesso schema `dataUri.split(',')[1]`)
   dopo il salvataggio locale. Le due cause insieme spiegano perché il fix precedente (il
   permesso della finestra) non fosse bastato: anche permettendo la finestra, o il blob era
   cross-processo (causa 1) o il server non aveva nulla comunque (causa 2) — serviva risolvere
   entrambe. Non verificabile in questo sandbox (serve il server locale + l'app Electron vera,
   non il solo dev server Vite) — da controllare nella prossima seduta chiusa e riaperta da
   History.

**Tre cose più piccole, stesso giro.**
- **Lo scivolo con/senza ago, misurato non indovinato.** 190px (un giro fa) bastava con
  margine a rivendere; misurato dal vivo (`getBoundingClientRect`, stesso font/peso/corpo)
  sulle dieci etichette × cinque lingue, la più lunga è "without needle" (EN, 91px reali) —
  148px la contiene con solo un margine minimo, non uno spazio vuoto vero.
- **Lo stesso scivolo, raggiungibile ANCHE a ciclo armato.** Segnalato: « quando sono in ciclo
  armato devo poter passare da ago a senza ago ». Viveva nella barra amministrativa che sparisce
  tutta insieme appena un metodo si arma (`modalitaCiclo`) — ma è l'UNICA di quelle scelte che
  ha senso rifare MENTRE l'ago sta reagendo, non solo prima. Spostato fuori da quel blocco,
  resta l'unica eccezione.
- **OBIETTIVO/STATO FISICO/R-FACTOR sparisce DEL TUTTO dopo 10s**, non più una maniglia al suo
  posto. Segnalato: « elle n'est pas utile qu'elle reste pendant la seance » — la maniglia
  cliccabile (per riaprire la riga) era proprio l'ingombro lamentato, una riga che si
  trasformava in un'altra riga invece di sparire. I tre campi restano scritti nello stato/nel
  rapporto, solo non più a vista; nessun modo di riaprirli a seduta in corso.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, nessun errore, due import
spenti tolti — `exactLevelName`/`levelName`, non più usati dopo aver spostato il selettore di
TONE), `vitest run` 639/639. Verificato dal vivo nel browser: TONE arma e localizza in un click
solo (screenshot: "0 → +40 en cours…" appare subito, nessun secondo bottone); lo squeeze test
mostra l'ago giusto (Meter, non EEG) dietro la carta di prontezza; lo scivolo ago/senza-ago resta
visibile e funzionante a ciclo CONTACT armato (screenshot prima/dopo il click); OBIETTIVO ecc.
sparisce senza lasciare nulla al suo posto dopo 10s. Il fix di History non è verificabile senza
il server locale + Electron vero. `git status`: `src/serenity/Serenity.tsx`,
`src/components/HistoryModal.tsx`, `src/components/ToneDial.tsx`, `src/session/useToneCycle.ts`,
`electron-builder.serenity.cjs`, `build/icon-serenity.icns`, `build/icon-serenity.iconset/*`.

EQUILIBRIUM 2.0.226, SERENITY 3.0.119.

---

## Giro (27/08/2026) — con ago/senza ago sotto NEEDLE LIGHT, stessa pillola

Segnalato: « tu as deplacè avec et sans aiguille en haut a gauche. Mets le maintenant sous
NEEDLE LIGHT, exactement avec la meme forme et la meme logique, plutot que un bouton slide ».
Lo scivolo `BottoneCiclico` (due tappe, manopola che scorre) è tolto dall'header; al suo posto,
nell'angolo in alto a sinistra DELL'ARCO — lo stesso angolo di `taRef`, subito sotto NEEDLE
LIGHT — una pillola IDENTICA nella forma (bordo sottile `--s-ink-ghost`, fondo trasparente,
stesso font/dimensione) e nella logica (un solo bottone, un click che cambia stato, un pallino
pieno/vuoto invece di due icone che scorrono). Stessa condizione di NEEDLE LIGHT (un ago da
vedere, non MIRROR/TONE) ma SENZA la sua esclusione `!vistaSenzaAgo` — quel bottone è lui
stesso il comando per uscire dalla vista senza ago, nasconderlo lì bloccherebbe l'auditor senza
via di ritorno. Tolti gli import ormai inutilizzati (`Compass`/`Layers`, le icone dello
scivolo; `BottoneCiclico` stesso, non più chiamato direttamente da `Serenity.tsx`).

**Segnalato in parallelo, non ancora risolto**: « le journal ne inscrit plus le texte et
n'apparait meme pas dans Assessment », dentro un ciclo armato. Riletta tutta la catena
(`onTranscript` → `journal.addLog` → il filtro di resa → l'effetto che alimenta Assessment,
`assessAttivo` compreso) senza trovare una causa nel codice — né in questo giro né nei due
precedenti, che non toccano quella catena. Non riproducibile in questo sandbox (serve un
microfono vero). In attesa di un dettaglio in più dall'utente (l'interruttore ASSESSMENT era
attivo? il microfono risultava in ascolto?) prima di intervenire alla cieca.

`tsc --noEmit` pulito, `vitest run` 639/639, `npm run lint` 313 warning (nessuno nuovo).
Verificato dal vivo: la pillola compare sotto NEEDLE LIGHT, stessa forma, il click passa da
"○ with needle" a "● without needle" mostrando `VistaSenzaAgo` — NEEDLE LIGHT sparisce insieme
(nessun ago da illuminare), esattamente come nella vecchia posizione. `git status`:
`src/serenity/Serenity.tsx`.

**Trovato per strada, non un bug**: `public/guide/EQUILIBRIUM-manuale.html` (dentro il repo)
NON è la sorgente — `scripts/copy-guide.cjs` lo SOVRASCRIVE a ogni `npm run build`/`dist:*` da
`~/Downloads/Guide Static Meter/EQUILIBRIUM-manuale.html`, la vera sorgente (fuori dal repo per
scelta esplicita, v. il commento in testa allo script). I `VERSIONE = "..."` scritti a mano
nella copia interna in due giri precedenti di questa sessione sparivano silenziosamente al
build successivo — corretto ORA nella sorgente vera; da qui in avanti aggiornarla LÌ, non nel
repo.

EQUILIBRIUM 2.0.227, SERENITY 3.0.120.

---

## Giro (27/08/2026) — i cicli a prova di stupido: una schermata per tempo, i comandi separati; TONE ricalibrato

**WITH/WITHOUT NEEDLE in maiuscolo** — segnalato: « scrivi WHIT NEEDLE in maiuscolo come per
il NEEDLE LIGHT ». NEEDLE LIGHT non si traduce mai, un solo letterale in ogni lingua — la
pillola con/senza ago (giro precedente) ora fa lo stesso: `WITH NEEDLE`/`WITHOUT NEEDLE`,
fissi, non più `LC(...)`.

**I cicli, decomposti — `PistaCiclo.tsx`.** Segnalato: « le indicazioni siano a prova di
stupido: decomporre ogni step in una schermata... scritte più in grande... la step seguente
resta indicata come ora... ANNULER/DECLARE AS-IS/il numero di cicli ora disturbano, separateli
ma accessibili ». Tre righe, non più una sola fusa insieme:
1. **Riga 1, invariata**: intestazione del metodo, item scrivibile, "dì l'item…", e la fila dei
   tempi numerati (1 ITEM · 2 MOCK-UP · 3 AS-IS) — la stessa di sempre, nessuna nota lì cambiata.
2. **Riga 2, nuova — "lo schermo"**: `SuggerimentoCiclo` (comando/come/avviso) in un blocco
   TUTTO SUO, fondo proprio più marcato (48%, contro il 30% di quando era un gruppo fra tanti)
   e un bordo che lo stacca. La sua taglia interna è salita da `--s-fs-lg`/`--s-fs-base` a
   `--s-fs-hero`/`--s-fs-lg` (`SuggerimentoCiclo.tsx`) — la stessa taglia dei titoli a schermo
   intero (Avvio, Connessione, EP), non più "titoli minori".
3. **Riga 3, nuova — i comandi, separati**: `children` (ANNULLA, valida/dichiara, il contatore
   "N · M AS-IS") in una fascia propria, sotto un bordo (`borderTop`), più piccola/discreta —
   NON un cassetto da aprire (un cassetto sarebbe MENO accessibile, non di più): restano
   cliccabili esattamente come prima, solo non più mescolati con la frase grande che l'auditor
   deve leggere mentre conduce.

**La dissoluzione (CONTACT), stessa barra della velocità.** `VistaSenzaAgo.tsx`: sotto la
barra della velocità, una seconda barra — stessa resa (pista scavata + riempimento pieno con
bagliore impilato), la STESSA percentuale che già muove il puntino sulla banda DISSOLUTION
(`tzoneStore.cycleDissolved`, nessun secondo calcolo). **La "ricarica" per NULL, lasciata
fuori**: concettualmente è l'OPPOSTO (quanto la resistenza è risalita dopo il mock-up, non
quanto è caduta da un picco) e nessuna metrica del genere esiste ancora nel codice — riusare
`cycleDissolved` con lo stesso segno avrebbe detto l'opposto di quel che l'etichetta
promette. Da riprendere quando c'è un numero vero da mostrarle.

**TONE — il MUSE non salta più a +40 in un colpo.** Segnalato: « il MUSE porta subito a tono
40. rivediamo come lo calcoliamo » — deciso « entrambe » le correzioni proposte:
1. **Il guadagno era troppo alto**: `toneFromDelta` riceveva un'escursione di `1` per `qL`
   (quoziente di carica 0..1) — uno spostamento anche modesto, moltiplicato per l'intera scala
   (80 divisioni), bastava a superare il fondo scala in un tick. `TONE_MUSE_ESCURSIONE = 4`
   (nuova, `tuning.ts`) porta il guadagno a un quarto — ⚠️ non una misura verificata sul campo,
   un punto di partenza dichiarato tale, da stringere/allargare guardando le prossime sedute.
2. **Il picco doveva reggere un istante**: il ratchet (« solo sale », deciso in un giro
   precedente) prendeva per buono QUALUNQUE nuovo massimo — un colpo isolato bastava a
   bloccare il tono lassù per sempre. `TONE_HOLD_S = 0.3` (nuova) richiede che un nuovo massimo
   resti il più alto per 300ms di fila prima di essere promosso a pavimento garantito
   (`toneCandidateRef`, `useToneCycle.ts`) — la stessa idea già provata in `MirrorCycle.ts` per
   distinguere un contatto vero dal rumore, applicata qui a un singolo campione fuori posto.

**Segnalato, ancora non risolto**: il journal che non scrive più il testo dentro un ciclo
armato (giro precedente). In attesa della risposta dell'utente su ASSESSMENT/microfono prima
di intervenire alla cieca.

`tsc --noEmit` pulito, `vitest run` 639/639, `npm run lint` 313 warning (nessuno nuovo).
Verificato dal vivo: CONTACT armato mostra le tre righe separate (schermo grande, comandi
sotto un bordo), la barra dissoluzione compare sotto la velocità in vista senza ago,
WITH/WITHOUT NEEDLE in maiuscolo fisso. Il calcolo TONE non verificabile dal vivo senza un
vero segnale EEG. `git status`: `src/serenity/Serenity.tsx`, `src/serenity/PistaCiclo.tsx`,
`src/serenity/SuggerimentoCiclo.tsx`, `src/serenity/VistaSenzaAgo.tsx`,
`src/session/useToneCycle.ts`, `src/engine/tuning.ts`.

EQUILIBRIUM 2.0.228, SERENITY 3.0.121.

---

## Giro (27/08/2026) — lo squeeze test rivuole l'ago; testi CONTACT/NULL/MIRROR completati; la dissoluzione solo sale; TONE non mostra la scala prima dell'item

**Lo squeeze test riporta da solo il selettore su CON AGO.** Segnalato: « se il selettore è su
SENZA AGO il test dello squeeze resta disponibile ma non si vede l'ago ». `vistaSenzaAgo`
persiste da una seduta all'altra — se l'ultima scelta era "senza ago", `ThetaReadyCheck` (la
stretta delle boîtes) restava raggiungibile ma l'ago vero, che deve muoversi di un terzo di
quadrante, restava nascosto dietro `VistaSenzaAgo`. Un nuovo `useEffect` (`Serenity.tsx`) lo
riporta su "con ago" UN COLPO SOLO quando quello schermo si apre (`metabolicOpen && meterC &&
!thetaReadyDone`) — non un blocco permanente, l'auditor resta libero di tornare a "senza ago"
dopo. Verificato dal vivo: con "senza ago" impostato da una sessione precedente, aprendo una
seduta con le boîtes il selettore passa da sé a "con ago" e l'ago appare.

**Tre testi completati, dove finivano su un "poi" senza aver detto il "prima".** In CONTACT,
NULL e MIRROR il titolo del tempo diceva già cosa fare ("2 · CHIEDI UN MOCK-UP", "4 · PORTA AL
DOPPIO X.X") ma il corpo del testo (`spiegazioneCiclo.come`) saltava dritto al "poi non fare
altro" senza mai scrivere l'istruzione vera:
- CONTACT, step 2: "Chiedi un mock-up. Poi non fare altro..." (prima: solo "Poi non fare
  altro...").
- MIRROR, step 4: "Porta il valore al suo doppio. Valore X.X — il metodo del doppio di Ron..."
  (prima: solo "Valore X.X — ..."). Segnalato insieme: la step "valore" (③ CONTATTO DELLA
  CARICA) resta nella fila numerata (non toccata, per la regola "la fila resta") ma è lei
  stessa a spiegare perché l'istruzione vera va scritta QUI, nel tempo del doppio.
- NULL, `comeSenzaAgo` (la frase mostrata in seduta "senza strumenti", non "senza ago" — le
  due sono diverse, v. la nota nel codice): mancava la frase che la versione CON strumenti
  aveva già per `null.rise` ("Il mock-up sta creando massa. Aspetta il ritorno alla base:
  quello è l'EQUILIBRIUM.") — chi testa senza hardware reale (la scelta più comune per evitare
  il selettore nativo MUSE/METER, bloccante) vedeva un'altra frase, mai questa.

**La dissoluzione (CONTACT) ora sale sola e arriva a 100% solo all'AS-IS.** Segnalato: « la
barra deve indicare 100% solo quando ottenuto AS-IS... falla progredire in modo che salga, mai
che scenda ». `VistaSenzaAgo.tsx`: lo stesso ratchet già provato per TONE (« la vediamo solo
salire ») applicato al rapporto di dissoluzione — `dissHighRef` tiene il massimo raggiunto DA
QUESTO ciclo (si azzera solo quando un ciclo nuovo arma), il 100% pieno resta riservato al vero
AS-IS (`effId==='asis'`, la stessa condizione che fa pulsare il puntino a fondo banda) — prima
di allora il massimo visibile è 99%, anche se la misura grezza avesse già toccato zero per un
istante.

**TONE non mostra più un livello prima che la resistenza abbia un nome.** Segnalato: « l'item
dato a voce non si scrive... per cui il ciclo non si arma. Quando il ciclo TONE non è armato,
non si deve mostrare il livello della scala del tono ». Causa trovata: il click in un colpo
solo sul cerchio TONE (giro precedente) localizza SUBITO — `toneAttivo` diventa vero prima che
l'auditor abbia detto la resistenza, ma `ToneDial`/`ToneColumn` (l'arco) si montavano sulla
sola condizione `toneAttivo`, ignorando che `faseCiclo` restava `'tone.say_item'` (non
`'tone.raise'`) finché `itemNamed` era falso — la STESSA informazione che già guidava
correttamente il testo, mai letta dall'arco. Ora l'arco resta vuoto (`null`) finché `faseCiclo`
non passa a `'tone.raise'`/`'tone.done'` — verificato dal vivo: armato TONE, l'arco resta senza
scala finché non si dà l'item; datolo, la scala −40…+40 appare subito.

`tsc --noEmit` pulito, `vitest run` 639/639, `npm run lint` 313 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/VistaSenzaAgo.tsx`.

EQUILIBRIUM 2.0.229, SERENITY 3.0.122.

---

## Giro (27/08/2026) — le etichette di zona sotto le barre; MIRROR/TONE rispettano "senza ago"; il bottone dice l'azione; TONE ritarato una terza volta

**Le etichette CONTACT/DISSOLUTION/AS-IS (e NULL/RISE/EQUILIBRIUM), sotto l'ultima barra.**
Segnalato: « mettile sotto la barra di dissoluzione per non confondersi con quelle dell'arco »
(e, per NULL, sotto la velocità). Correvano CURVE lungo la banda (`textPath`, tolto insieme al
suo `<defs>` in `VistaSenzaAgo.tsx`) — la stessa informazione della grande scritta centrale,
ripetuta una seconda volta e più lenta da leggere proprio dove l'occhio legge già i colori
dell'arco. Ora una riga piatta sotto l'ultima barra (dissoluzione se c'è, altrimenti la
velocità), la zona attiva piena e in grassetto, le altre smorzate — stessa opacità
"quieta"/"fatta" già in uso sull'arco, nessuna scala nuova.

**MIRROR e TONE rispettano ora "senza ago".** Segnalato: « la scritta con o senza ago deve
apparire anche in MIRROR e TONE » e, per TONE: « se si sceglie senza ago non deve apparire ».
Prima i due quadranti ignoravano `vistaSenzaAgo` per scelta esplicita di un giro passato (le
loro scale non sono CONTACT/DISSOLUTION/AS-IS) — quella scelta resta (nessun quadrante nuovo
inventato per loro), ma "senza ago" ora vuol dire anche per loro NASCONDERE il disegno
dell'ago: il calcolo dietro (MIRROR: la sola carica EEG; TONE: MUSE se connesso, altrimenti il
TA del Meter) continua tale e quale, invariato in `useToneCycle.ts`/`MirrorCycle.ts` — solo il
quadrante resta vuoto, la guida testuale di `PistaCiclo` resta comunque a schermo.

**Il bottone con/senza ago dice l'azione, non lo stato.** Segnalato: « quando scrivi SENZA AGO
devi mostrare l'ago, così il bottone indica cosa puoi cambiare ». La parola sul bottone
descriveva la vista ATTUALE ("WITHOUT NEEDLE" quando l'ago era già nascosto) — invertita:
"WITHOUT NEEDLE" compare quando l'ago è ANCORA visibile (il click lo nasconderebbe), "WITH
NEEDLE" quando è già nascosto (il click lo rimostrerebbe) — il pallino resta lo stato vero
(pieno = ago visibile adesso).

**TONE, terza taratura.** Segnalato: « ora il calcolo è troppo severo, la scala non si muove »
— il tentativo precedente (guadagno a un quarto + tenuta di 300ms) aveva corretto "salta
subito a +40" ma esagerato nell'altra direzione. `TONE_MUSE_ESCURSIONE` scende da 4 a 2 (a
metà strada fra l'1 troppo sensibile e il 4 troppo severo, il primo punto fra i due mai
provato), `TONE_HOLD_S` da 0.3 a 0.15 (la stessa scala di tempo di `TONE_SMOOTH`, non il
doppio — tre freni sommati, media mobile + guadagno basso + tenuta lunga, bastavano a
immobilizzare un segnale già debole). ⚠️ Ancora una stima, non una misura verificata — resta
da guardare sulle prossime sedute vere.

**Testi CONTACT/NULL completati** — la step 2 di NULL ("2 · CHIEDI UN MOCK-UP") aveva la
stessa lacuna già corretta per CONTACT nel giro precedente: il titolo diceva "chiedi un
mock-up", il corpo saltava dritto a una nota sul tempo. Aggiunta l'istruzione vera prima del
testo esistente.

**Segnalato, non ancora risolto**: History non mostra il bottone View e non permette la
selezione per cancellare. Verificato dal vivo con una sessione fresca in questo sandbox: View,
il PDF e la selezione (checkbox, "Tout sélect.", il cestino con il conteggio) funzionano tutti
correttamente — non riprodotto. Il sospetto più concreto: `pdfMap[session.id]` risulta falso
per le sessioni REALI dell'utente (né IndexedDB né server hanno un PDF per loro, magari salvate
con build precedenti a un giro di questa sessione) — ma senza vederle non è verificabile da qui.

`tsc --noEmit` pulito, `vitest run` 639/639, `npm run lint` 313 warning (nessuno nuovo).
Verificato dal vivo: le etichette piatte compaiono sotto la barra giusta; il bottone con/senza
ago mostra "WITH NEEDLE"/"WITHOUT NEEDLE" invertiti come richiesto; lo squeeze test continua a
riportare da sé su "con ago". Il calcolo TONE non verificabile senza un vero segnale EEG.
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/VistaSenzaAgo.tsx`,
`src/engine/tuning.ts`.

EQUILIBRIUM 2.0.230, SERENITY 3.0.123.

---

## Giro (27/08/2026) — nove punti, ognuno verificato dal vivo (o dichiarato non verificabile)

Segnalato con durezza: « NON HAI REGOLATO QUESTI PUNTI, FALLO PER CORTESIA, VERIFICA CHE STAI
FACENDO LE COSE, NON SOLO DIRE CHE LO FAI ». Giustificato — alcuni bug erano reali, non solo
mal descritti. Ogni punto sotto porta l'ESITO della verifica dal vivo, non solo la correzione.

1. **Squeeze test, l'ago del Meter non appariva.** Causa vera trovata: il fix di un giro fa
   (`inThetaReadyCheck`) toglieva il forzato EEG durante lo squeeze test, ma poi il calcolo
   ricadeva nella regola generale — con MUSE ANCHE connesso e `agoScelto` (la preferenza
   persistita) su 'eeg', l'ago tornava quello sbagliato. `inThetaReadyCheck` ora FORZA il
   Meter, un ramo dedicato prima di tutti gli altri. **Verificato dal vivo**: con MUSE e METER
   entrambi "connessi" e la preferenza forzata su 'eeg', lo squeeze test mostra l'ago giusto.
2. **CONTACT step 2, il testo restava a metà** (il titolo diceva "chiedi un mock-up", il corpo
   saltava al "poi"). Aggiunta l'istruzione vera prima del testo esistente. **Verificato dal
   vivo**: dato l'item, il tempo 2 mostra "Demande un mock-up. Puis ne fais rien d'autre...".
3. **PistaProcedimento: il fuoco a metà altezza, FERMER sempre visibile.** `scrollIntoView`
   passato da `'nearest'` a `'center'`; il contenitore ha ripreso un `maxHeight` (52vh, con
   `padding` sopra/sotto per poter centrare anche il primo/ultimo comando); l'intestazione
   (FERMER) è ora un FRATELLO del contenitore scorrevole, non più un suo primo figlio — non
   scorre più con la lista. **Non verificato dal vivo**: nessun procedimento caricabile in
   questo sandbox (legge da `~/EQUILIBRIUM/COMANDI/Procedimenti`, filesystem reale assente
   qui) — verificato per lettura di codice/struttura JSX, `tsc` pulito.
4. **TONE, la scala non appariva più.** Non riprodotto con il codice attuale: **verificato dal
   vivo** più volte in questo giro — armato TONE, l'arco resta vuoto finché l'item non è dato;
   datolo (Invio), la scala −40…+40 appare subito. Il fix del giro precedente (gating su
   `faseCiclo`) risulta corretto; il segnalato era probabilmente contro una build precedente.
5. **ACTIVER → DÉSACTIVER.** Il giro precedente lo aveva corretto; **riverificato dal vivo**:
   il pulsante mostra DÉSACTIVER da acceso, ACTIVER da spento, in entrambe le direzioni.
6. **L'item avanzava al primo carattere digitato.** Causa vera: `itemNamed` (che decide se
   passare al tempo successivo) leggeva `!!item.trim()` — vero già al primo tasto, perché
   `item` è lo STESSO stato che l'`<input>` scrive a ogni battuta. Nuovo stato `itemDigitando`
   (vero dalla prima battuta MANUALE, mai toccato dalla voce — che arriva sempre intera, mai
   un carattere alla volta): `itemNamed` ora aspetta o `itemSpoken` (Invio/dichiarazione) o
   che non si stia più digitando. **Verificato dal vivo**: digitando "Peur" lettera per
   lettera, il tempo resta a "① ITEM" per tutta la digitazione; Invio lo fa avanzare.
7. **Senza strumenti, i cicli non apparivano.** Causa: `!senzaMisura` escludeva l'INTERA fascia
   dei quattro cerchi di scelta del metodo — senza strumenti, nessun modo di armarne uno.
   Tolta l'esclusione. **Verificato dal vivo**: sessione "senza strumenti", i quattro cerchi
   esistono nel DOM con le loro etichette, e cliccare CONTACT arma il ciclo per davvero.
8. **L'assessment restava armato oltre il tempo dell'item.** Nuovo `useEffect` su `faseCiclo`:
   appena il tempo esce da `*.item`/`*.say_item` (mentre un ciclo resta armato), l'assessment
   si spegne da sé — resta comunque riaccendibile a mano in qualunque momento. **Verificato
   dal vivo**: armando CONTACT l'assessment si accende (DÉSACTIVER); dato l'item e passato al
   tempo 2 (MOCK-UP), torna da solo su ACTIVER — stesso comportamento osservato anche in TONE.
9. **La configurazione salvata non mostrava (né restituiva) la lingua.** `ConfigurazioneSalvata`
   ha un campo `lingua` nuovo (facoltativo, le configurazioni vecchie non ce l'hanno);
   `salvaConfigurazione`/`richiamaConfigurazione` lo scrivono/leggono; la lista in `Avvio.tsx`
   lo mostra in coda (`· FR`). **Verificato dal vivo**: salvata una configurazione in francese,
   ricaricata la pagina (lingua tornata inglese), richiamata la configurazione dalla lista —
   la lingua torna francese insieme ad auditor/PC/strumenti, tutti mostrati correttamente nella
   riga della configurazione salvata.

`tsc --noEmit` pulito, `vitest run` 639/639, `npm run lint` 313 warning (nessuno nuovo). Otto
punti su nove verificati con interazione reale nel browser (screenshot alla mano); il nono
(PistaProcedimento) verificato per struttura di codice, non riproducibile in questo sandbox
per mancanza di dati di test. `git status`: `src/serenity/Serenity.tsx`,
`src/serenity/PistaProcedimento.tsx`, `src/serenity/ZonaAssessment.tsx`,
`src/serenity/Avvio.tsx`, `src/serenity/configurazioniStore.ts`.

EQUILIBRIUM 2.0.231, SERENITY 3.0.124.

---

## Giro (27/08/2026) — il bug vero dietro "TONE non appare"; il journal nel PDF; Tout sélectionner rigiudicato

Cinque punti nuovi, più due segnalati a parte durante lo stesso giro. Di nuovo con verifica dal
vivo, non solo lettura di codice — e stavolta la verifica dal vivo ha trovato un bug REALE che
la sola lettura del codice, al giro precedente, aveva mancato.

1. **MIRROR: la carica iniziale ottenuta col MUSE non appariva.** `mirrorCycle.liveQ` (un campo
   pubblico del motore, mai letto fuori da lì) esposto come `mirrorDisp.liveR` (stessa
   conversione 1–10 di `valueR`). Un indicatore "MUSE x.x" pulsante compare ora accanto ai
   pulsanti manuali, prima del blocco. **Verificato dal vivo**: MIRROR armato con MUSE
   "connesso", la riga "MUSE 0.0" appare nel pannello "combien de charge ?".
2. **TONE: la scala non appariva — segnalato una seconda volta, stavolta un bug vero.** Il giro
   precedente aveva concluso "non riprodotto" perché il test era stato fatto CON ago. Il bug
   viveva nel percorso SENZA ago, e non dove sembrava: non in `ToneDial` (che già sapeva
   disegnare l'arco senza la lancetta, tramite `hasMeter`), ma nella condizione di montaggio di
   `<QuantumSphere>` — l'ago DI BASE. Quella condizione escludeva `vistaSenzaAgo` SOLO quando
   `!mirror.mirrorArmed && !toneAttivo`, apposta per non spegnere del tutto l'arco di sfondo in
   MIRROR/TONE (che non hanno una `VistaSenzaAgo` sostitutiva) — ma restando montato,
   `QuantumSphere` continuava a disegnare la lancetta vera e propria, ignara di `vistaSenzaAgo`.
   Risultato osservato dal vivo: in TONE senza ago, prima ancora che l'item fosse dato, un ago
   ambra restava comunque visibile sull'arco — e una volta corretto quel primo strato, il
   secondo bug (la condizione di montaggio di `ToneDial` stesso, `&& !vistaSenzaAgo`, che
   toglieva l'INTERO quadrante invece della sola lancetta) sarebbe comunque rimasto a nascondere
   la scala una volta dato l'item. Corretti entrambi: `ToneDial` monta sempre quando l'item è
   dato (con `hasMeter={!vistaSenzaAgo && tone.toneMisurato}`, non più con l'intera vista
   condizionata), e `QuantumSphere` spegne le sue due sorgenti di lancetta
   (`thetaOffset`/`showEegNeedle`) con `!vistaSenzaAgo`, indipendentemente da MIRROR/TONE.
   **Verificato dal vivo, prima/dopo**: TONE armato senza ago, item non ancora dato — PRIMA una
   lancetta ambra era comunque visibile sull'arco; ricaricato con la correzione, l'arco resta
   vuoto (solo le fasce colorate, nessuna lancetta). Dato l'item ("colpa"), la scala −40…+80 in
   arco concentrico E la colonna verticale (`ToneColumn`, coi nomi dei livelli) appaiono
   entrambe, sempre senza alcuna lancetta disegnata.
3. **"Nessun ciclo armato" scriveva EN ATTENTE.** Tolto qualunque testo di riserva dal centro
   della vista senza ago quando `effId === 'neutral'` (nessun ciclo). **Verificato dal vivo**:
   sessione senza ago, nessun ciclo armato, il centro dell'arco non mostra alcuna scritta.
4. **Senza ago, l'arco doveva animarsi come con l'ago quando nessun ciclo è armato.** Nuova
   animazione CSS `vsaIdleGlow` (respiro dell'opacità, 3.4s, sfalsata di 1.1s per fascia) sulle
   tre bande di zona quando `!armed`. **Verificato dal vivo**: ispezionato lo stile calcolato
   delle tre `<path>` di zona a ciclo non armato — tutte e tre portano
   `animation: 3.4s ease-in-out ... infinite vsaIdleGlow`, con ritardo 0s/1.1s/2.2s.
5. **"Il bottone di chiusura dei comandi non appare".** Trovate DUE cose diverse sotto lo stesso
   nome: il pannello "PROCESSUS" (l'elenco dei procedimenti disponibili) ha già una ✕ ben
   visibile in alto a destra — **verificato dal vivo**, nessun problema lì. `PistaProcedimento`
   (la vista del procedimento IN CORSO, con FERMER) era già stata ristrutturata il giro
   precedente perché lo scorrimento non la nascondesse — resta **non verificabile dal vivo** in
   questo sandbox (nessun procedimento `.txt` caricabile, serve un filesystem reale). Se il
   segnalato riguarda quest'ultima, serve conferma con dati veri per continuare a cercare.
6. **Il journal nel PDF di HISTORY, con trascritto/reazioni/tono.** `SerenityReportInput` non
   aveva alcun campo journal — gap reale, non un bug. Aggiunto `journal?: JournalLineInput[]`
   (stesso `LogEntry` di `TranscriptLog.tsx`, con una `reaction` in più) e una sezione PDF
   dedicata (monospazio, colore per chi parla, tono in tag, reazione in viola) — stesso
   linguaggio visivo della sezione transcript di `generateTextPdf` (App.tsx). `Serenity.tsx`
   costruisce l'elenco da `journal.logs` con la STESSA `computeInstantRead` che il pannello
   Journal a schermo già usa "sulla parola" (nessuna seconda logica di lettura inventata). **Non
   verificato dal vivo per intero**: `tsc` pulito e la sezione è cablata nel percorso di
   chiusura seduta, ma generare e riaprire un vero PDF di History dentro questo sandbox non è
   stato provato in questo giro — la logica di lettura (`computeInstantRead`) è la stessa già
   verificata dal vivo nei giri precedenti per il pannello Journal a schermo.
7. **"In HISTORY non si può scegliere TOUT SELECTIONNER".** Non riprodotto: **verificato dal
   vivo**, click sul checkbox master → le tre checkbox (master + due sedute) passano a
   `checked:true`, entrambe le schede prendono la classe di selezione
   (`border-red-400 bg-red-50/30`), e il bottone di eliminazione multipla appare con il conteggio
   corretto ("2"). Il primo tentativo di verifica in questo stesso giro aveva mostrato uno stato
   vuoto — causa trovata: il server di sviluppo Vite di questo sandbox si riavvia da solo a
   intervalli (osservato nei suoi log, non legato a nessuna azione qui), un riavvio in mezzo a
   un'interazione azzera lo stato React e sembra "il click non ha fatto nulla". Un problema
   dell'ambiente di anteprima, non dell'app pacchettizzata (che non ha un server Vite con
   ricaricamento a caldo) — batchando click e lettura del DOM in una sola chiamata atomica il
   comportamento corretto si è visto in modo ripetibile.

`tsc --noEmit` pulito, `npm run lint` 313 warning (nessuno nuovo, 0 errori). File toccati:
`src/serenity/Serenity.tsx`, `src/serenity/sessionReport.ts`.

---

## Giro (27/08/2026, notte, 3) — la GUIDA di SERENITY, rifatta per davvero

Chiesto: « rifai il GUIDE per SERENITY, puoi utilizzare quello di EQUILIBRIUM, ma cambiando le
cose che sono state cambiate ed aggiornando il tutto ed il nome con SERENITY ». Prima SERENITY
montava `GuideModal` con `SRC` cablato su `/guide/EQUILIBRIUM-manuale.html` — mostrava LA
GUIDA DI EQUILIBRIUM, col suo nome scritto ovunque ("GUIDE · EQUILIBRIUM", "Torna a
EQUILIBRIUM"), anche aperta da dentro SERENITY.

- **Un secondo file**, `~/Downloads/Guide Static Meter/SERENITY-manuale.html`, copiato da
  EQUILIBRIUM-manuale.html (stesso motore di rendering, stesso contenuto tecnico VERIFICATO
  sul codice — formule TA↔tono, fisica del MUSE/THETA-METER, tutto identico perché lo È) e poi
  riscritto dove SERENITY è DAVVERO diversa: il selettore di metodo (cinque cerchi cliccabili
  invece di pastiglie di testo), il bottone CON/SENZA AGO e la vista senza ago (le tre bande
  colorate che "respirano"), la pista di un ciclo alla volta, il pannello JOURNAL (che a
  schermo mostra solo Aud/PC — il resto va nel PDF), e un **nuovo modulo TRUTH** — il
  protocollo di Ron, che non esiste ancora nel manuale di EQUILIBRIUM.
- `scripts/copy-guide.cjs` copia ora **due** guide, ciascuna con la propria cartella di
  screenshot (`guide-screenshots` per EQUILIBRIUM, `guide-screenshots-serenity` per SERENITY
  — nomi diversi apposta: le due app condividono la cartella dei manuali, e senza questo uno
  screenshot mancante in una avrebbe potuto mostrare per sbaglio quello dell'altra).
- `GuideModal.tsx` accetta ora un `app?: 'equilibrium' | 'serenity'` (default invariato) che
  sceglie il file E il nome giusti ovunque compaiono — titolo, bottone di chiusura, messaggio
  "guida assente". `Serenity.tsx` passa `app="serenity"`.
- ⚠️ **Bug trovato per caso**, non introdotto qui: `NOTE("info", UI.L_info, ...)` compariva
  cinque volte nel file ORIGINALE di EQUILIBRIUM, ma `L_info` non era mai stato dichiarato —
  le cinque note "info" mostravano l'etichetta "UNDEFINED" invece di un testo vero, anche nel
  manuale già distribuito. Corretto in ENTRAMBI i file (la chiave mancante, stesso testo di
  `L_note`).
- Il percorso reale `~/EQUILIBRIUM/corpus/` (l'archivio CORPUS, condiviso dalle due app,
  hardcoded in `main.cjs`) resta scritto così anche nel manuale di SERENITY — cambiarlo
  sarebbe stato scrivere un percorso falso — con una nota che spiega perché.

**Verificato dal vivo**: aperta la guida da dentro SERENITY (icona "?"), intestazione "GUIDE ·
SERENITY", bottone "Retour à l'app", contenuto e nav coi nuovi moduli, in tutte e tre le
lingue (FR/IT/EN, verificato lo switch). Aperta anche da EQUILIBRIUM per la controprova: mostra
ancora "GUIDE · EQUILIBRIUM" col suo contenuto originale, nessuna regressione.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 0 errori.

---

## Giro (27/08/2026, notte, 2) — TRUTH: l'assessment si accendeva e si spegneva nello stesso istante

Segnalato: « il faut activer l'assessment, car on doit trouver un R&I ». `truth.locateRI()`
chiama già `ensureAssessmentOn()` (come CONTACT/NULL/MIRROR/TONE quando l'item non è ancora
dato) — ma un ALTRO effetto la spegneva nello stesso istante: quello che disattiva
l'assessment appena si esce dai tempi "si sta ancora dando l'item" (`*.item`/`*.say_item`).
Le fasi di TRUTH si chiamano `truth.ri`/`truth.say_ri` (il R/I, non un "item" come negli altri
quattro — v. `sessionPhase.ts`), quindi quell'effetto non le riconosceva MAI come "si sta
ancora dando l'item": la spegneva subito. Esteso il controllo a `*.ri`/`*.say_ri` e a
`truth.questioning` — per TRUTH è anche più giusto che per gli altri: « locate an R/I via any
process » è di per sé una ricerca, l'assessment ha senso restare accesa per tutto il tempo in
cui il R/I non è ancora chiuso, non solo al primo tempo. **Verificato dal vivo**: armato
TRUTH, il pannello passa da "ACTIVER"/"capture désactivée" a "DÉSACTIVER"/"à l'écoute...".

Riguardato anche « Dans History... tout vibre et saute et on ne peut pas choisir de tout
sélectionner ». Il buon segno: i PDF ora si vedono (il fix del giro precedente ha tenuto). Il
checkbox "Tout sélectionner" — verificato dal vivo che la sua LOGICA è corretta: cliccato
direttamente sul suo elemento, i quattro checkbox (generale + tre sedute) sono passati tutti a
`checked: true`. Non trovata invece nessuna causa di "vibrazione" nel codice (nessun
`setInterval`, nessun ciclo di re-render, console pulita) — non riprodotta in due schermate
consecutive con solo tre sedute di prova. Resta aperto: serve sapere se, cliccando "Tout
sélectionner" nell'app vera, non succede NIENTE (visivamente) o se serve più di un clic — con
tre tentativi già fatti su questa stessa segnalazione senza trovare altro, un quarto a
indovinare rischia di sprecare il giro invece di risolverlo.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 0 errori.

---

## Giro (27/08/2026, notte) — TRUTH: l'item non si scriveva, tutto era in inglese, il candidato lampeggiava

Segnalato subito dopo aver agganciato TRUTH all'interfaccia: « le cicle TRUTH n'est pas
clair — l'item dit ne s'inscrit pas, tout est en anglais peu importe la langue choisie,
apparaît fugace une phrase que je n'arrive pas à lire ». Tre bug reali, distinti, tutti
verificati dal vivo (non solo per lettura di codice).

1. **L'item detto non si scriveva.** TRUTH era stato agganciato al motore/al cerchio/alla
   pista, ma il QUARTO pezzo — l'`useEffect` che legge `journal.logs` e scrive DAVVERO il R/I
   detto a voce nel campo — non era mai stato scritto (esisteva per CONTACT/NULL/MIRROR/TONE,
   mancava per TRUTH). `truthAwaitItemRef`/`truthLogCursorRef` restavano accesi per sempre,
   senza nessuno a leggerli: il R/I restava "in attesa" a vita, `itemNamed` restava falso, la
   pista non avanzava mai oltre "① R/I". Aggiunto l'effetto mancante in `Serenity.tsx` E in
   `App.tsx` (che non ce l'aveva nemmeno lui), più il ramo TRUTH mancante nel dispatcher di
   R&I · Manuel e in `dichiaraItemDetto`. **Verificato dal vivo**: R/I "la culpabilité" dato
   via R&I · Manuel su TRUTH armato → il campo si riempie, la pista avanza a "② DEMANDE".
2. **Tutto in inglese, qualunque lingua scelta.** Causa banale ma reale: `LC(it, fr, en, es,
   sv)` — nello scrivere le battute di Ron ("What about this is the truth?", "Return to
   present time!") ho messo la STESSA citazione inglese in TUTTE E CINQUE le posizioni invece
   di tradurla in ciascuna lingua — quindi lo slot FRANCESE, letto in seduta FR, restituiva
   testo inglese. Tradotte per davvero in italiano/francese/spagnolo/svedese (le battute di
   Ron restano fra « », come già per TONE, ma nella lingua della seduta). **Verificato dal
   vivo, in francese**: « Qu'y a-t-il de vrai là-dedans ? » e « Retourne au temps présent ! »
   compaiono ora nella pista.
3. **Il candidato lampeggiava, illeggibile.** `trackTruth` promuoveva/ritirava lo stato
   "candidato" al primo campione che attraversava la soglia, in ENTRAMBE le direzioni — un
   solo campione rumoroso a cavallo della soglia bastava a far comparire e sparire il badge
   nello stesso tick, prima che un occhio umano potesse leggerlo. Aggiunta una tenuta
   (`TRUTH_CANDIDATE_HOLD_S`, 0,6s) in entrambe le direzioni — stessa disciplina già in uso
   per TONE (`TONE_HOLD_S`)/MIRROR (il turnover), qui più lunga perché il tempo deve bastare
   anche a LEGGERE la frase, non solo a scartare il rumore. Non verificabile dal vivo in
   questo sandbox (serve un segnale EEG reale rumoroso) — corretta per costruzione, resta da
   confermare in seduta vera.

Approfittato del giro per riverificare da capo (con MUSE forzato via debug temporaneo) « quando
nessun ciclo è armato e si è senza ago, l'arco deve vivere come con l'ago » — segnalato una
terza volta. Confermato via DOM che l'animazione `vsaIdleGlow` è davvero applicata in questo
esatto scenario nel codice attuale: il sospetto è che il DMG provato fosse precedente al fix.
Alzata comunque l'escursione (0,22→0,40 diventa 0,22→0,57) e accorciato il giro (3,4s→2,6s):
più viva a vedersi, indipendentemente dalla causa del rapporto.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 0 errori.

EQUILIBRIUM non toccato in questo giro — solo SERENITY.

---

## Giro (27/08/2026, sera) — R&I · Manuel non arrivava al ciclo; il motore TRUTH

Cominciato il ciclo TRUTH (v. `docs/truth-cycle-proposal.md`) subito dopo il "vai" — scritti e
provati `engine/truthScale.ts` (vettore di stato S/Ṡ/S̈, i tre flag D/P/Q normalizzati
sull'ampiezza-ambiente della persona come nel fix TONE del giro precedente, il punteggio di
fiducia, mai un candidato promosso da solo a evento — 13 test nuovi, tutti verdi) e
`session/useTruthCycle.ts` (la FSM a sei stati, i gesti dell'auditor). **Non ancora agganciato
all'interfaccia** — `SessionMode`/`MODE_SPEC`/`PistaCiclo`/`cycleSteps` restano com'erano:
integrarli tocca App.tsx (dove nasce ogni funzione, per principio dimensionale) su parecchi
punti, e a metà lavoro sono arrivate tre segnalazioni dal vivo che hanno avuto la precedenza —
il motore resta pronto, inerte, per il prossimo giro dedicato.

1. **« in tone l'item ne s'inscrit pas alors qu'il apparaît dans ASSESSMENT ».** Causa trovata
   e riprodotta dal vivo (non solo per lettura di codice): `aggiungiItemManuale` — il
   gestore di R&I · Manuel — scrive l'item SOLO in `assessItems` e in una riga di sistema
   (`speaker:'NEEDLE'`); i tre `useEffect` che aspettano l'item di CONTACT/NULL/MIRROR/TONE
   guardano `journal.logs` con `speaker==='Aud'`, che R&I · Manuel non tocca MAI. Un item
   dato così appariva quindi in ASSESSMENT ma non arrivava MAI al ciclo armato, qualunque
   fosse — non solo TONE, lo stesso vale per CONTACT/NULL/MIRROR. Corretto notificando
   direttamente il ciclo in attesa dentro `aggiungiItemManuale`. **Verificato dal vivo**: item
   "la trahison" dato con R&I · Manuel su CONTACT armato → il campo item si riempie, la pista
   avanza a "② MOCK-UP".
2. **« SANS AIGUILLE tu dois montrer les lumières dans l'ARC, autrement on dirait que cela ne
   marche pas ».** Il respiro idle (dato lo scorso giro) si accendeva solo a `!armed` — un
   ciclo appena armato, prima che qualcosa reagisca (`effId==='neutral'`), restava
   COMPLETAMENTE immobile: nessuna banda "attiva" (nessuna eguaglia `cur`) e nessun respiro
   (perché `armed` è vero). Esteso a `!armed || effId==='neutral'`. **Verificato dal vivo**
   (via DOM): le tre bande hanno `animation: vsaIdleGlow` attiva con CONTACT armato e senza
   ago, sfasate di 1,1s l'una dall'altra.

`tsc --noEmit` pulito, `vitest run` 652/652 (13 nuovi per `truthScale.ts`), `npm run lint` 0
errori (313 warning, invariati).

EQUILIBRIUM 2.0.234, SERENITY 3.0.127.

---

## Giro (27/08/2026) — TONE: la scala si tara da sé; MIRROR spiegato; l'arco cresce col ciclo

Cinque segnalazioni arrivate durante la verifica del giro precedente, mentre si stava per
cominciare il ciclo TRUTH — messo in pausa per queste, standard nel dare priorità a un bug
appena riscontrato dal vivo rispetto a una funzione nuova non ancora cominciata.

1. **TONE, il quarto « salta subito a 40 ».** Tre round di taratura pura (`TONE_MUSE_ESCURSIONE`
   1→4→2, `TONE_HOLD_S` 0.3→0.15) non erano bastati — segnalato di nuovo, stavolta con le
   parole giuste: « il faut revoir les calculs », non ritarare un numero. Causa vera: un'unica
   escursione FISSA per chiunque non può reggere, perché l'ampiezza di rumore di `d.qL` varia
   da persona a persona — quel che è ragionevole per uno fa traboccare la scala per un altro.
   Sostituita con un'escursione DINAMICA, calcolata a ogni tick sull'ampiezza-ambiente della
   PERSONA in seduta (`qLAmbientDevRef`, una EMA lentissima di quanto `d.qL` si scosta dalla
   propria media — la stessa idea già in uso in `ToneLocator.ambientQ`, estesa da "un istante"
   a "ogni tick"): un movimento di UNA ampiezza-ambiente vale una divisione (10 punti),
   qualunque sia il rumore naturale di chi si sta auditando. Nuove manopole in `tuning.ts`:
   `TONE_AMBIENT_ALPHA`, `TONE_AMBIENT_MIN`, `TONE_SIGMA_SPAN` — dichiaratamente ANCORA non
   misurate su dati EEG reali, ma un'ipotesi più robusta (si adatta da sé) della precedente
   (sperare che un numero fisso vada bene per chiunque).
2. **MIRROR, « la valeur 1–10 se fige d'elle-même... n'est pas clair ».** Non un bug nel
   blocco (che è voluto — v. `MirrorCycle.turnedOver`): la frase CITATA dall'utente era
   proprio il testo di `PistaCiclo`, tempo "CONTATTO DELLA CARICA" — "si è girata"/"s'est
   retournée" è gergo del segnale, non un'immagine chiara per chi non sa come funziona il
   calcolo. Riscritta su cosa succede in termini fisici (il picco passa) E che i dieci
   pulsanti restano una scelta valida (prima "aspetta" accanto a dieci bottoni cliccabili
   lasciava intendere che aspettare fosse l'unica via). Aggiunto anche un piccolo badge
   « 🔒 bloccato » quando il valore si è fermato — in `Serenity.tsx` E nel `MirrorDial.tsx`
   condiviso, così vale anche per App.tsx. **Verificato dal vivo**: la nuova frase compare
   parola per parola nel tempo "VALEUR" di MIRROR.
3. **« Quand on a le CYCLE en bas l'arc est petit, baisse la position des CICLES ».** Il
   rapporto due-terzi/un-terzo fra l'arco e la zona comandi era FISSO, uguale a schermo
   inattivo (quattro cerchi, poche righe) e a ciclo ARMATO (tutta la `PistaCiclo`, molto più
   alta) — non un errore percettivo: il gruppo basso non cedeva più spazio quando ne
   occupava di più. Un ciclo attivo (`cycles.cycleArmed`/`mirror.mirrorArmed`/`toneAttivo`/
   `procedimentoAttivo`) riceve ora tre quarti invece di due terzi. **Verificato dal vivo**:
   arco visibilmente più grande con MIRROR armato rispetto a schermo inattivo, stesso
   viewport.
4. **Il journal nel PDF di History.** Il campo era stato aggiunto il giro scorso (`tsc`
   pulito) ma mai fatto passare per davvero attraverso `generaPdf`. **Verificato stavolta con
   uno script diretto** (fuori dal browser, `generaPdf` chiamato con un `SerenityReportInput`
   sintetico): il testo AUD e PC compare nel PDF generato, non solo nel tipo TypeScript.
5. **« TU AS ENCORE LE MEME PROBLEME AVEC HISTORY... on ne peux pas voir les PDF ».** Il
   codice di apertura (server locale prima, poi IndexedDB, `main.cjs` che apre entrambi in
   una finestra vera) risultava corretto a rileggerlo — ma `chiudi()` genera E salva il PDF
   in un `void (async () => {...})()` "spara e dimentica", DOPO che lo schermo è già tornato
   a quello pre-seduta, dove History è subito raggiungibile. Con il journal ora incluso
   (più testo da scrivere) quella finestra si è allungata: aprendo History nei primi istanti
   dopo una seduta, il controllo "ha un PDF?" di `HistoryModal` girava una volta sola, non
   trovava ancora nulla, e la sessione restava segnata "senza PDF" per tutta la vita del
   pannello. Aggiunto un RITENTATIVO: per le sedute chiuse da meno di un minuto e ancora
   senza PDF trovato, un secondo controllo dopo 2,5s. **Non è stato possibile riprodurre il
   sintomo esatto dell'utente in questo sandbox** (nessun Electron reale, nessun modo di
   aprire la finestra del PDF come nell'app pacchettizzata) — questa resta la causa più
   concreta trovata rileggendo il codice, non una riproduzione dal vivo del bug riportato:
   se il sintomo persiste nella prossima DMG, serve sapere SE il pannello mostra "PDF non
   disponibile" (nessun file trovato) o se il file si trova ma la finestra non si apre (un
   problema diverso, più vicino al primo bug già risolto una volta).

`tsc --noEmit` pulito, `vitest run` 639/639, `npm run lint` 313 warning (nessuno nuovo). Il
ciclo TRUTH (v. `docs/truth-cycle-proposal.md`) resta il prossimo passo, ripreso subito dopo
questo giro.

EQUILIBRIUM 2.0.233, SERENITY 3.0.126.

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

---

## Giro (28/08/2026) — le etichette sotto le bande a riposo; TRUTH « Localise un ITEM »; le VRAIE cause de History; le guide refait en mode d'emploi

**Les lumières de l'arc SANS AIGUILLE, mais sans légende.** Segnalato : « les lumières dans
l'arc sont maintenant bien présentes [au repos], mais écris en-dessous à quoi elles
correspondent ». `VistaSenzaAgo.tsx` : la légende (les noms de zone sous les bandes) était
DANS le même bloc `{armed && (...)}` que la barre de vitesse et la barre de dissolution —
correctes pour n'apparaître qu'en cycle armé, mais elles emportaient la légende avec elles.
Sortie de ce bloc, désormais toujours affichée (en gris, aucune zone "active" au repos,
`cur === -1`). **Vérifié en direct** : les libellés CONTACT/DISSOLUTION/AS-IS apparaissent
sous l'arc dès l'écran principal, sans cycle armé.

**TRUTH, le texte du premier temps.** Demande directe, citation exacte fournie : remplacer
« Localisé avec un procédé quelconque… » (participe passé, décrit un état déjà survenu) par
« Localise un ITEM avec un procédé quelconque… » (impératif, dit à l'auditeur quoi faire
maintenant). Corrigé dans les cinq langues de `Serenity.tsx`.

**« TU AS ENCORE LE MEME PROBLEME AVEC HISTORY… mais uniquement dans Electron. »** Le giro
précédent (v. plus haut, EQUILIBRIUM 2.0.233/SERENITY 3.0.126) avait dû se contenter d'une
cause plausible « trouvée en relisant le code », faute de pouvoir reproduire le symptôme
dans ce bac à sable. Cette fois, reproduit pour de vrai — un serveur `server-core.cjs` réel
(pas le repli IndexedDB du dev Vite) lancé sur le port 7893 avec la vraie base de données de
l'utilisateur, ouvert dans le navigateur de test. Deux bugs distincts trouvés, tous les deux
dans `HistoryModal.tsx` (composant PARTAGÉ — la correction vaut pour EQUILIBRIUM aussi) :
1. **La cause réelle du symptôme rapporté** : l'effet qui charge les séances dépendait de
   `[activeProfile]` — l'OBJET. Dans `Serenity.tsx`, cet objet vient de
   `getProfiles().find(...)`, et `getProfiles()` fait un `JSON.parse` frais à CHAQUE rendu du
   parent (jamais mémoïsé — voulu, pour refléter tout de suite une modification de profil
   ailleurs) : même contenu, mais une référence NOUVELLE à chaque fois. L'effet repartait
   donc à chaque rendu du parent — des dizaines par seconde en séance vivante (minuteur,
   aiguille, polling des instruments). Chaque redémarrage faisait `setSelected(new Set())` :
   la coche de "Tout sélectionner" disparaissait un instant après être apparue, trop vite
   pour la voir — d'où « impossible de sélectionner ». Et chaque redémarrage relançait aussi
   la vérification des PDF (`useEffect([sessions])`, un tableau neuf à chaque fois) : des
   dizaines de requêtes HEAD s'annulant l'une l'autre (`net::ERR_ABORTED`), le résultat ne se
   stabilisait jamais — d'où « impossible de voir le PDF ». Pourquoi seulement Electron ?
   Ce n'est pas vraiment "seulement" — c'est une course que ce bac à sable isolé gagne presque
   toujours (peu d'autres sources de rendu), et perd presque toujours dans Electron, où MUSE/
   Theta-Meter/BLE tournent en même temps. **Corrigé** : l'effet dépend maintenant de
   `activeProfile?.id` (une primitive stable), pas de l'objet. **Vérifié en direct, avant/
   après** : ~30 requêtes HEAD dupliquées en une fraction de seconde → une seule ; la coche
   "Tout sélectionner" reste cochée après 2 secondes (avant : revenait décochée).
2. **Un second bug, trouvé en même temps** : `openPdf` (le bouton "View") est `async`, et
   `window.open(...)` arrivait après deux `await` — hors de la pile d'appel synchrone du
   clic. Chromium ne compte plus ça comme un geste utilisateur ; la requête elle-même
   ressortait `net::ERR_ABORTED` (vérifié), silencieusement, sans erreur visible. Corrigé
   avec le patron classique : ouvrir la fenêtre vide tout de suite (dans le clic), lui
   donner l'adresse une fois le PDF localisé. **Non vérifiable dans ce bac à sable** — le
   panneau lui-même bloque tout `window.open`, y compris celui-ci, indépendamment du geste ;
   la correction suit la règle standard mais reste à confirmer dans la vraie app.

**Le guide de SERENITY, refait une seconde fois — plus simple, pas plus théorique.**
Demande explicite : « le guide est trop complexe. Rends-le très simple, pratique […]. Complet,
exhaustif, mais pas plus long que nécessaire. » Le fichier précédent (28/08, giro de nuit)
adaptait TEL QUEL le moteur du guide d'EQUILIBRIUM — 24 modules, un "rôle" théorique (la
doctrine de Ron) avant chaque bouton. Remplacé entièrement : plus de moteur JS générateur de
HTML, dix sections dans l'ordre réel d'utilisation (premier lancement → écran principal →
démarrer une séance → les 5 méthodes en un tableau → avec/sans aiguille → journal → processus,
avec la réponse à « comment j'annule le script des commandes » → fermer la séance → historique
→ dépannage), trilingue FR/IT/EN par un simple bascule CSS. **1269 lignes/235 Ko → 390 lignes/
31 Ko.** **Vérifié en direct** : bouton GUIDE de SERENITY → « GUIDE · SERENITY », le nouveau
mode d'emploi s'affiche, bascule EN fonctionne, retour à l'app fonctionne.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/components/HistoryModal.tsx`, `src/serenity/Serenity.tsx`,
`src/serenity/VistaSenzaAgo.tsx`, `public/guide/SERENITY-manuale.html` (rigenerato).

---

## Giro (28/08/2026, 2) — le vrai bug de TONE (R&I · Manuel avant d'armer), about:blank cassé par le giro précédent, FERMER sticky dans Processus, captures dans le guide

**Régression trouvée dans mon propre giro précédent** : segnalato « quand j'appuie sur view du
PDF... il me dit que aucune appli pour ouvrir about:blank ». Le fix précédent d'`openPdf`
(ouvrir une fenêtre vide `window.open('', '_blank')` tout de suite dans le clic, pour garder le
geste utilisateur) ouvre une URL `about:blank` — ni `isLocal` ni `isInline` dans
`setWindowOpenHandler` (`main.cjs`), donc elle tombait dans `shell.openExternal('about:blank')`,
et macOS n'a pas d'app par défaut pour ce schéma. Ajouté un troisième cas `isBlank = url ===
'about:blank'`. Corrigé, pas encore reconstruit en DMG au moment d'écrire cette ligne.

**Le vrai bug de TONE — reproduit et corrigé, pas seulement de la tuning.** Segnalato : « dans
TONE parfois l'item n'est pas inscrit dans le cycle et il ne démarre pas, même si on l'écrit ;
mais si on annule et on redémarre le cycle, ça marche avec l'item dit auparavant ». Reproduit
en direct : écrire la résistance dans **R&I · Manuel AVANT d'armer** TONE (un geste tout à fait
naturel — c'est la seule case de saisie manuelle visible avant d'avoir cliqué un cercle) laissait
le cycle bloqué pour toujours sur « DIS LA RÉSISTANCE », même si le texte apparaissait bien dans
le panneau R&I · Manuel. Cause : le gestionnaire de R&I · Manuel (`aggiungiItemManuale`,
`Serenity.tsx`) ne pousse le texte dans le champ partagé `item` QUE si un cycle est DÉJÀ en
attente (`*AwaitItemRef`) — avant d'armer, aucun ne l'est, donc rien n'était écrit ; le cycle
armé juste après trouvait le champ vide, entrait lui-même en attente, et restait bloqué pour
toujours car R&I · Manuel n'écrit JAMAIS dans `journal.logs` avec `speaker:'Aud'` (seul ce que
l'effet d'attente sait voir) — aucun réarmement seul n'aurait pu s'en sortir, contrairement à
la voix (qui, elle, écrit bien un 'Aud', et explique pourquoi reparler après annulation
« marche »). **Corrigé** : un cinquième cas, `else if (!cycleArmed && !mirrorArmed && !toneAttivo
&& truthPhase==='idle' && !item.trim())`, écrit directement dans `item` — seulement à cycle
libre et champ vide, pour ne jamais écraser l'item DÉJÀ en cours d'un cycle armé avec une note
R&I ultérieure. **Vérifié en direct, avant/après** : avant le fix, TONE restait bloqué sur « DIS
LA RÉSISTANCE » après « colère envers le père » tapé dans R&I · Manuel puis clic sur TONE ; après
le fix, le même geste passe directement à « MÈNE-LE AU TON 40 ». Vaut pour les cinq cycles (même
garde partagée), pas seulement TONE.

*(Une seconde piste, `itemDigitando` jamais remis à `false` sans appui sur Invio, a aussi été
corrigée par précaution dans les cinq boutons d'armement — plausible pour un item tapé dans le
champ PROPRE de CONTACT/NULL/MIRROR sans presser Invio, mais ce N'ÉTAIT PAS la cause du cas
reproduit ci-dessus.)*

**« TONE trop souvent déjà à tone 40 ».** Pas de nouveau chiffre magique cette fois — trois
tours de tuning à l'aveugle (`TONE_MUSE_ESCURSIONE`, `TONE_HOLD_S`, puis la refonte dynamique
`TONE_AMBIENT_*`) sans données EEG réelles pour calibrer contre. `~/EQUILIBRIUM/corpus/` contient
de vraies séances (JSON Lines) — reste à analyser les traces `qL` réelles d'une remontée TONE
pour choisir `TONE_SIGMA_SPAN` sur des chiffres mesurés plutôt que devinés. Pas fait dans ce
giro (temps), noté pour le prochain.

**FERMER invisible dans Processus.** Segnalato : « il faut scroller vers le haut EN DEHORS de
commandes, ce n'est pas naturel ». L'en-tête (déjà un frère du conteneur qui scrolle, pas un
enfant — fix d'un giro précédent contre le scroll INTERNE à la liste) ne protégeait pas contre
un second scroll, plus extérieur (la page/le panneau qui contient tout `PistaProcedimento`).
`position: 'sticky', top: 0` s'accroche au plus proche ancêtre qui scroll, quel qu'il soit —
règle les deux cas sans avoir à savoir lequel scroll vraiment. Pas vérifié en direct (aucun
fichier de procédure présent dans ce bac à sable pour le reproduire) — pattern CSS standard,
à confirmer visuellement dans la prochaine build.

**Le guide, une image par point.** Demande explicite : « inclut les images ou la place pour les
images pour chaque point ». Ajouté un `<div class="shot">` (même dégradation gracieuse en
cadre pointillé si le fichier n'existe pas) après chaque section pratique (§1, 2, 4–9) — sauté
§10 (Dépannage), une table de symptômes, pas un écran à capturer.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 324 warning (nessuno nuovo).
`git status`: `main.cjs`, `src/serenity/Serenity.tsx`, `src/serenity/PistaProcedimento.tsx`,
`public/guide/SERENITY-manuale.html` (rigenerato).

---

## Giro (28/08/2026, 3) — MIRROR sans aiguille montrait `null`, `itemNamed` sticky (TRUTH), le PDF traduit et coloré, Q_L + MNA ajoutés

**MIRROR sans aiguille — même défaut que TONE, jamais corrigé.** Segnalato : « dans MIRROR
sans aiguille les indications du nombre, de l'avancement etc n'apparaissent pas ». Le rond
armé montait `vistaSenzaAgo ? null : <MirrorDial/>` — `null`, pas un ago caché. `MirrorDial`
ne dessine d'ailleurs AUCUN ago (à la différence de `ToneDial`) : il est entièrement texte et
progression (valeur 1–10, ×2 à atteindre, anneau, "🔒 bloqué", "OBTENU") — rien à cacher.
Corrigé : montage toujours, avec ou sans aiguille.

**TRUTH avance puis recule — trouvé, structurel, touche les cinq cycles.** Segnalato : « dans
TRUTH parfois ça avance d'une step et ça revient en arrière ». `itemNamed` (la garde partagée
par les cinq cycles dans `sessionPhase.ts`) était recalculée à CHAQUE rendu depuis `item`/
`itemDigitando`/`itemSpoken` — aucune mémoire de « déjà donné une fois ». Si le champ est
retouché plus tard dans le MÊME cycle (une correction, un ré-affichage qui relève
`itemDigitando`), `itemNamed` repasse fugitivement à faux et l'écran recule à "dis le R/I"
même si le moteur (`truthPhase`) est déjà à "questioning" ou plus loin. TRUTH est le plus
exposé : le R/I reste à l'écran (donc touchable) pendant tout le cycle, contrairement aux
quatre autres où l'item ne se donne qu'une fois au début. Corrigé avec un flag sticky
(`itemConfirmedRef`) : une fois vrai dans ce cycle, `itemNamed` ne redevient plus jamais faux
avant que le champ soit vraiment vidé (nouveau cycle/nouvelle résistance).

**Le PDF de History — AGO traduit, couleurs par zone, Q_L et MNA ajoutés.** Trois demandes
réunies :
1. *Traduction* — 'AGO' était un littéral italien fixe, même dans un PDF en français/anglais/
   espagnol/suédois. `LC('AGO','AIG','NDL','AGU','NÅL')`.
2. *Couleurs* — SYS passe au noir vrai (était gris clair). Les lignes AIG (NEEDLE) portaient
   TOUTES le même ambre plat — corrigé pour piocher une des trois couleurs de zone de charge
   de l'app (`chargeState.ts`/`LIGHT_PHASE` : contact/dissolution, AS-IS forcé au gris comme
   demandé explicitement) selon `l.reaction`. Ce champ n'était en fait JAMAIS rempli pour les
   lignes NEEDLE (`Serenity.tsx`, condition arrêtée à Aud/PC) — élargi, sinon la couleur
   n'aurait jamais pu être la bonne.
3. *Q_L + MNA* — dichiarati apertamente assenti dans ce même fichier, pour un obstacle supposé
   (« nécessitent leur propre machine de capture ») qui ne se confirme pas à la relecture de
   `PostSessionReport.tsx` : ni l'un ni l'autre n'est une image capturée d'un composant React —
   les deux sont dessinés à coups de primitives `jsPDF` (rectangles/lignes/texte), portés mot
   pour mot. Q_L lit `sessionRecorder.chart` (même singleton déjà utilisé ailleurs dans ce
   fichier) ; MNA lit `mnaSessionRef.current` (même forme que `MnaSession`, aucun second calcul).
   **Vérifié en direct** : script autonome (`generaPdf` appelé hors navigateur avec un input
   synthétique incluant les trois types de lecture), PDF relu — 'AIG' apparaît en français,
   les trois couleurs sont bien celles attendues (rouge/vert/gris), le graphique Q_L et le
   panneau MNA (4 tuiles + barre de phases CAPTURE/SONIFY/CLEAN/HARMONICS) s'affichent
   correctement.

**Non traité ce giro, par manque de cible claire** : « la transparence doit aussi agir sur les
écritures, pas uniquement sur les boutons ». Une recherche de fonds opaques sur les panneaux
de texte (Journal/Assessment/PistaCiclo) n'a rien trouvé d'évident — `--s-zone-bg: transparent`
existe déjà pour ces zones en thème clair (giro précédent), et le commentaire à côté explique
pourquoi le thème sombre garde volontairement un fond opaque. Il est possible que ce
signalement décrive en fait le symptôme MIRROR ci-dessus (« les indications n'apparaissent
pas » ressemble à « pas transparent » vu de l'extérieur, alors que le composant entier ne se
montait pas) — à confirmer après cette build avant d'aller plus loin.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/sessionReport.ts`.

---

## Giro (28/08/2026, 4) — TRUTH montrait NULL/RISE/EQUILIBRIUM, TONE_MUSE_ESCURSIONE fixe (retour), PDF trop espacé

**TRUTH montrait littéralement l'arc de NULL.** Segnalato : « dans TRUTH tu as laissé NULL
RISE EQUILIBRIUM, cela n'est pas bon ». Cause : `ClearDial` n'a jamais eu de branche pour
TRUTH — un cinquième métode qui n'existe même pas dans EQUILIBRIUM, où ce composant est né.
Le ternaire de montage (`Serenity.tsx`) ne trouvait aucune condition vraie et tombait dans le
ramo par défaut — le MÊME `<ClearDial cycleKind={cycles.cycleKind}>` du cycle CONTACT/NULL,
avec SES étiquettes. Troisième `cycleKind` ajouté (`'truth'`), trois segments propres —
ACCORD → VÉRITÉ → TEMPS PRÉSENT, TRADUITS dans les cinq langues (demande explicite — pas des
termes fixes comme CONTACT/NULL). Les trois tappe collassano la FSM comme le fait déjà
`sessionPhase.ts` pour le texte (ri_located→ACCORD, questioning/candidate/truth_event→un seul
VÉRITÉ, return_present→TEMPS PRÉSENT) — même raison : candidate/questioning oscillent par
construction, les faire correspondre à deux étiquettes différentes aurait fait voir à l'arc
la même régression tout juste corrigée dans le texte le giro précédent. Toujours monté avec
ou sans aiguille (même correction que MIRROR) : `VistaSenzaAgo` n'a pas de branche TRUTH dont
se "répéter", donc le cacher aurait fait disparaître l'unique vue que TRUTH a.

**TONE_MUSE_ESCURSIONE, retour à un nombre fixe.** Segnalato : « le calcul doit être porté sur
le fait que TONE_SIGMA_SPAN ne soit pas 8, mais un numéro certain arbitraire (comme indiqué
par Ron pour le TA et les Ohms) qui permette de visualiser la montée et reste dans le range ».
Le système ad ampiezza-ambiente (trois round de tuning, jamais stabilisé) abandonné : Ron ne
calibre pas la scala du TA sur le bruit de chaque preclear (`TA_MAX`/`taClear` sont fixes pour
tout le monde) — même logique appliquée ici. `TONE_MUSE_ESCURSIONE` repasse à une constante
simple, valeur 3 (entre 2, encore trop sensible, et 4, jamais assez — le seul point entre les
deux jamais essayé comme valeur isolée). Les constantes `TONE_AMBIENT_*`/`TONE_SIGMA_SPAN`
restent dans `tuning.ts` marquées ABANDONNÉES, comme note historique.

**Le PDF trop espacé — pas une police, un glyphe manquant.** Segnalato : « change la police de
caractère pour SYS et AIG, elle est trop espacée. Utilise la même que pour le transcript ».
C'était déjà la même police (`courier`) — le vrai coupable : les lignes AGO/NEEDLE portent
« → » et « ◎ » dans leur texte, hors du jeu Latin-1/WinAnsi des polices standard de jsPDF. Un
glyphe manquant corrompt le calcul de crénage de TOUTE la ligne, pas seulement de ce caractère
— d'où l'espacement large lettre par lettre, visible SEULEMENT sur les lignes qui contenaient
ces symboles. `ascii()` (dans `sessionReport.ts`) enlevait déjà les accents (NFD) mais pas ces
symboles — étendu pour les remplacer par des équivalents ASCII (→ « -> », ◎ « * », etc.).
**Vérifié en direct** : script autonome, PDF avant/après relu — la ligne "AIG: R&I · colere ->
Fall" s'affiche maintenant compacte, exactement comme SYS/AUD.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/components/ClearDial.tsx`, `src/engine/tuning.ts`, `src/serenity/Serenity.tsx`,
`src/serenity/sessionReport.ts`, `src/session/useToneCycle.ts`.

---

## Giro (28/08/2026, 5) — BASIC vraiment simplifié, HELP à post-it

**BASIC, enfin simplifié pour de vrai.** Segnalato : « cosa proponi per semplificare al
massimo l'interfaccia BASIC? ». Prima, `espertoAttivo` gouvernait UNE seule chose
(`moduleVis.biometric`) — le reste (MNA, Santé Système, Total TA cumulatif, vitesse) restait
identique en BASIC et EXPERT. Étendu : MNA et Santé Système suivent maintenant le même
interrupteur (toujours ré-allumables depuis CONFIG — le choix reste à l'auditeur), et les
lectures Total TA/vitesse (secondaires — "combien en tout", pas "combien maintenant") sont
cachées en BASIC. `LetturaTA`/`LetturaFase` (le besoin DE MAINTENANT) restent visibles dans
les deux niveaux : ce n'est pas un chiffre en plus, c'est la lecture elle-même. Reste ouvert
(proposé, pas encore choisi) : cams désactivées hors séance à distance, panneaux latéraux
repliés par défaut, sélecteur MUSE/METER/AUCUN réduit à un point d'état, un bandeau-guide
permanent même à vide.

**HELP à post-it — implémenté, option A choisie (« tous ensemble, un seul clic »).** Nouveau
bouton, à côté de GUIDE mais différent (celui-ci ouvre le manuel entier ailleurs ; celui-ci
montre des explications courtes SUR l'écran actuel, sans le quitter). Mécanisme : un attribut
`data-help="texte"` sur chaque bouton à expliquer (le texte est presque toujours déjà celui du
`title` existant — pas une invention) et un seul composant (`AiutoOverlay`) qui les trouve
tous seul (`querySelectorAll`) et dessine un post-it sous chacun, dans une couche
`position:fixed`. Ajouter une explication à un bouton demain = ajouter un attribut, pas
toucher ce composant. Couvre pour l'instant : Historique, Processus, réglages de séance,
MUSE/METER/SANS INSTRUMENTS, CONFIG, COMMANDS, et les cinq cercles de méthode (nouvelles
courtes descriptions écrites pour eux, les autres réutilisent un texte déjà existant).
**Vérifié en direct** : clic sur HELP, les post-it apparaissent bien sous les boutons de la
barre et sous COMMANDS. Limite connue, non corrigée : les cinq cercles sont proches du bord
bas de l'écran — dans une petite fenêtre leur post-it peut sortir de l'écran (pas de logique
"retourne au-dessus si pas de place" pour l'instant).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`.

---

## Giro (28/08/2026, 6) — HELP sans chevauchement, les quatre dernières simplifications BASIC

**HELP — les post-it se chevauchaient.** Segnalato tout de suite après le giro précédent :
« l'HELP sovrappone i post-it e non si legge nulla ». Chaque étiquette se plaçait TOUJOURS à
la même hauteur (juste sous son bouton) — deux boutons proches (MUSE/METER/SANS INSTRUMENTS,
trois pilules côte à côte) donnaient deux rectangles superposés. `impila()` : un ripiano à
rangées — trie les post-it de gauche à droite, et pour chacun cherche la première rangée libre
(celle où il ne touche personne déjà placé) ; un groupe serré de boutons finit sur plusieurs
rangées empilées au lieu de se chevaucher. **Vérifié en direct** : tous les post-it de la barre
sont maintenant lisibles, chacun sur son propre palier.

**Les quatre dernières simplifications BASIC — « tutti ».**
1. **Journal fermé par défaut en BASIC** — même forme que MNA/Santé Système (l'interrupteur
   `moduleVis` suit maintenant `espertoAttivo`). `moduleVis.ri` (ASSESSMENT + R&I · Manuel)
   délibérément LAISSÉ EN DEHORS : c'est la façon même de donner un item à la main quand la
   voix n'est pas là — l'éteindre par défaut aurait retiré une fonction, pas un tecnicisme.
2. **CAM 2 cachée hors séance à distance, en BASIC** — même principe déjà en place pour CAM 1
   (`cam1Mostrata = moduleVis.cam1 && avvio.distanza`) : `cam2Mostrata` dérivée
   (`moduleVis.cam2 && (espertoAttivo !== false || avvio.distanza)`), la préférence
   `moduleVis.cam2` elle-même n'est jamais réécrite — seul le calcul de QUAND la montrer
   change. En EXPERT rien ne change.
3. **Sélecteur d'instruments réduit à un point d'état, en BASIC** — les trois pilules
   MUSE/METER/SANS INSTRUMENTS deviennent UN bouton (icône + point de couleur agrégé) tant que
   l'auditeur ne l'a pas touché ; un clic l'étend à la rangée entière (reste ainsi pour le
   reste de la séance — pas de réduction automatique). La fonction de connexion ne disparaît
   jamais, elle demande un clic de plus la première fois seulement.
4. **Une ligne-guide même au repos** — avant, à cycle libre, les cinq cercles s'affichaient
   SANS un mot au-dessus. Une ligne, dans les cinq langues (« choisis une méthode ci-dessous »)
   — visible dans les deux niveaux, pas seulement BASIC : ça ne coûte rien à EXPERT.

**Vérifié en direct, les trois vérifiables sans séance à distance** : niveau BASIC choisi →
le sélecteur d'instruments montre bien UN point (pas trois) ; « journal · 2 lignes » (fermé,
muet) au lieu du panneau ouvert ; « choisis une méthode ci-dessous » visible sous les cinq
cercles à l'ouverture d'une séance, avant tout choix de méthode. CAM 2 non vérifiée en direct
(pas de séance à distance dans ce bac à sable) — même dérivation que CAM 1, déjà en production.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`.

---

## Giro (28/08/2026, 7) — le vrai bug derrière « senza strumenti, les cercles ne se voient pas » ; les post-it reliés à leur bouton

**Senza strumenti — les cinq cercles étaient là, invisibles sous le bord de l'écran.**
Segnalato : « senza strumenti scrive "scegli un metodo" ma non si vede nulla ». Pas mon ajout
de la ligne-guide (giro précédent) qui causait ça — juste 40px de plus sur un problème déjà
là. Vrai coupable, trouvé en mesurant en direct (`document.body.scrollHeight` 1096px contre
`window.innerHeight` 720px, `body{overflow:hidden}` — toute l'appli est un viewport FIXE, sans
scroll, par choix délibéré) : `comandiSottoAgo = aperta && !senzaMisura` mettait `gruppoBasso`
(le conteneur qui héberge les cinq cercles) à `flex:'0 0 0%'` — zéro espace réservé — chaque
fois que `senzaMisura` était vrai. Correct quand cette ligne fut écrite : sans instruments,
`gruppoBasso` ne montrait alors RIEN d'autre que le texte de `spiegazioneCiclo`, déjà dupliqué
dans l'overlay absolu « DONNE L'ITEM » à côté — zéro espace ne retirait rien. Depuis qu'un giro
précédent a rendu les cinq cercles visibles aussi sans instruments (« senza strumenti non
appaiono i cicli, invece devono apparire »), cette prémisse ne tient plus : zéro espace pour
un conteneur avec cinq vrais cercles dedans veut dire qu'ils débordent SOUS lui, sous le bord
de l'écran — présents dans le DOM, invisibles à l'auditor. `comandiSottoAgo = aperta`, sans la
condition sur `senzaMisura` : `gruppoBasso` reçoit toujours sa part. **Vérifié en direct,
avant/après** : `scrollHeight` 1096px → 720px (exactement égal à `innerHeight`, plus aucun
débordement), les cinq cercles bien visibles avec leurs étiquettes sous « DONNE L'ITEM ». La
ligne-guide elle-même reste réservée au cas AVEC instruments (redondante avec « DONNE L'ITEM »
sinon) — pas restaurée en `senzaMisura`.

**Les post-it HELP — reliés à leur bouton.** Segnalato : « i post-it non sono posizionati
correttamente, devi mettere un qualcosa che li collega alla zona che spiegano ». `impila()`
(giro précédent, contre le chevauchement) pousse certains post-it plusieurs rangées plus bas
que leur bouton — sans un signe, plus moyen de savoir LEQUEL de plusieurs boutons proches un
post-it éloigné explique. Ajouté : une lineetta verticale fine entre le vrai bord du bouton et
le post-it quand ils ont été séparés par l'empilement, et un petit codino (triangle, comme une
bulle de bande dessinée) qui pointe vers le haut sur chaque post-it. **Vérifié en direct** :
les post-it de MUSE/METER/SANS INSTRUMENTS (empilés en escalier) sont maintenant chacun reliés
par un fil visible à leur propre bouton.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`.

---

## Giro (28/08/2026, 8) — BASIC/EXPERT fiable pour de vrai, COMMANDS sans instruments, TRUTH étiqueté en grand

**Le vrai bug derrière « la MNA en basic ne s'affiche toujours pas ».** `espertoAttivo` vient
de `avvio?.esperto`, qui part de `null` (`flussoAvvio.ts`) — PAS `undefined`. L'effet qui lie
MNA/Santé Système/Journal/biométrie au niveau sortait tout de suite sur `if (espertoAttivo ===
undefined) return;` : une configuration sauvegardée sans ce champ (créée avant qu'il existe,
ou restaurée par un chemin qui ne le remplit pas) restait `null`/`undefined` pour toujours, la
garde sortait, et la préférence PERSISTÉE (potentiellement `true` depuis des mois d'usage
EXPERT) ne se corrigeait jamais. Garde retirée : tout ce qui n'est pas `true` littéral compte
comme BASIC — sûr même avant que l'auditor réponde, ces modules ne se voyant qu'à séance
ouverte. Même correction appliquée par cohérence à deux autres endroits qui comparaient
`=== false` au lieu de `!== true` (le texte simplifié de NULL sans instruments, le sélecteur
d'instruments réduit).

**COMMANDS n'affichait rien sans instruments.** Segnalato : « senza strumenti i comandi di
COMMANDS non appaiono ». `!senzaMisura` enveloppait tout le bloc, `PistaProcedimento` compris
— correct pour `PistaCiclo` (sa guidance sans instruments vient de l'overlay séparé « DONNE
L'ITEM ») mais pas pour un procédé, texte pur sans aucun lien avec MUSE/METER. Ajouté
`procedimentoAttivo ||` : un procédé s'affiche toujours quand il est choisi, `PistaCiclo`
garde sa règle d'avant. Non vérifiable en direct dans ce bac à sable (`COMANDI/Procedimenti`
se lit par IPC Electron, pas par le serveur HTTP que ce sandbox peut atteindre) — corrigé par
lecture de code, pas par reproduction.

**TRUTH — ACCORDO/VÉRITÉ/TEMPO PRESENTE en grand.** Les mêmes trois étiquettes ajoutées à
l'arc (giro précédent) préfixent maintenant le `titolo` de `spiegazioneCiclo` — le texte le
plus grand à l'écran pendant un cycle, celui que l'auditor regarde en conduisant.

**Le bouton fermer la séance, teinté ambre discret.** Segnalato : « più verso il giallo, ma
poco vistoso ». `color-mix` avec `--s-reserve` (le même ambre tenue du troisième signal du
système) à 14% de fond + un bordo à 35% — seulement quand le bouton dit "fermer" (`aperta`),
jamais quand il dit "ouvrir".

**BASIC/EXPERT visible sous SERENITY.** Segnalato : « fai apparire sotto SERENITY... se
l'interfaccia è BASIC o EXPERT ». Une deuxième ligne, petite, sous le nom — même source
(`espertoAttivo`), rien de nouveau à maintenir. Cachée avant que `avvio` existe (les quatre
questions pas encore finies). **Vérifié en direct** : "EXPERT" apparaît sous SERENITY pour une
configuration sauvegardée de niveau expert.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`.

---

## Giro (28/08/2026, 9) — CONFIG toujours accessible, TRUTH sans zone de texte, guide mis à jour

**CONFIG disparaissait pendant un cycle, en BASIC comme en EXPERT.** Segnalato : « il bottone
CONFIG deve apparire anche in BASIC per poter attivare dei moduli se necessario ». Il vivait
dans `{!modalitaCiclo && (...)}`, le même wrapper que Guide/l'assistant IA — son propre
commentaire disait pourtant « raggiungibile in ogni momento, come il cassetto di EQUILIBRIUM »,
plus vrai depuis que ce wrapper l'a englobé. Justement en BASIC, où MNA/Santé Système/chiffres
restent éteints tant qu'on ne les rallume pas depuis CONFIG, rester bloqué hors de CONFIG
pendant une séance en cours retirait le seul moyen de les changer. Sorti du wrapper — toujours
monté, quel que soit `modalitaCiclo`. **Vérifié en direct** : CONFIG reste dans la barre après
avoir armé CONTACT (Guide/Help disparaissent bien, comme prévu).

**TRUTH sans instruments — l'instruction parlait d'une case qui n'existe pas ici.** Segnalato :
« senza strumenti ti dice di dire o scrivere un item IN TRUTH ma non c'è la zona testo ».
`comeSenzaAgo` (le texte vraiment affiché sans instruments) n'avait aucun cas pour TRUTH — il
retombait sur le texte NORMAL de `spiegazioneCiclo.come` (« Scrivilo... »), qui suppose le
champ item de `PistaCiclo` — jamais monté sans instruments. Ajouté le cas manquant, nommant
EXPLICITEMENT où écrire pour de vrai : le champ « R&I · Manuel » du panneau Assessment.

**Essai retiré** : un `|| senzaMisura` pour garder les cinq cercles visibles même processus
ouvert (« nasconde i bottoni dei cicli ») — l'auditor a confirmé après coup que cacher les
cercles pendant un processus est le comportement voulu, essai annulé.

**Le guide, mis à jour.** Segnalato : « aggiorna la GUIDE di SERENITY ed includi lo spazio per
le screenshot ». Ce que BASIC cache pour de vrai (§1), le bouton HELP avec sa propre capture
dédiée (§2, nouvelle), le sélecteur d'instruments réduit en BASIC (§2), TRUTH et ses trois
étapes en grand (§4), le mock-up de NULL simplifié en BASIC (§4), la teinte ambre du bouton
fermer (§8). Toutes les sections pratiques gardent leur emplacement de capture. Version du
guide : 3.0.140.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`, `public/guide/SERENITY-manuale.html` (rigenerato).

---

## Giro (28/08/2026, 10) — TONE : scala espansa e denominazione nel menu senza strumenti

**Il menu di dichiarazione TONE, senza nome accanto al numero.** Segnalato : « nel TONE c'è
sotto la scala del tono, devi mettere anche la denominazione con i numeri, devi dare la scala
espansa ». Il `<select>` sotto il cerchio TONE (dove il preclear/auditor dichiara la posizione
sulla scala quando non c'è meter) mostrava solo i tredici numeri di `TONE_LABELS` — quelli
scritti sulla colonna verticale, ridotti apposta per non accavallarsi nel disegno SVG. Il
`<select>` GEMELLO in EQUILIBRIUM (`App.tsx`, stesso ruolo) mostrava già « numero · nome »:
SERENITY era rimasta indietro sulla propria dottrina — riprodurre la logica di EQUILIBRIUM
([[serenity_reproduce_equilibrium_logic]]).

Corretto in ENTRAMBE le app (non solo SERENITY: è la stessa select, la stessa funzione, e la
dottrina vale nei due sensi — un divario fra le due non è mai voluto). Non solo il nome: la
scala data è ora quella INTERA, `TONE_LEVELS` (sessantadue livelli, non più i tredici di
`TONE_LABELS`) — un menu a tendina non è un disegno con un bordo da cui i nomi escono, quindi
il vincolo che limita la colonna verticale a tredici etichette non si applica qui. La colonna
disegnata (`ToneColumn.tsx`) NON è toccata: i suoi tredici punti restano quelli, con la stessa
motivazione documentata contro l'accavallamento — non era quello il posto segnalato, e
comunque un ritocco lì rischierebbe di disfare una correzione già presa con cura in un giro
precedente.

**Verificato in diretto**: sessione senza strumenti aperta, ciclo TONE — il menu mostra
"0 · Mort du corps" di default (FR), e via DOM sono confermate 62 opzioni da "+40 · Sérénité
de l'être" a "-40 · Échec total", ciascuna col nome tradotto accanto al numero.

**Il guide, aggiornato.** Nuova nota `.note.info` in §4 (dopo quella su TRUTH), versione guide
3.0.140 → 3.0.141.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/App.tsx`, `src/serenity/Serenity.tsx`, `public/guide/SERENITY-manuale.html`
(rigenerato).

---

## Giro (28/08/2026, 11) — guida: audire senza cicli è normale, non un'eccezione

**Il guide non lo diceva mai.** Segnalato: « devi mettere che senza cicli puoi audire
normalmente ». Il testo esistente (§3, "Démarrer une séance") passava direttamente da "clic su
Ouvrir une séance" alla tabella dei 5 metodi, senza mai dire che armare un cerchio NON è un
passo obbligatorio: `mode === 'free'` (nessun ciclo armato) attiva già da sé il pannello
Assessment/R&I·Manuel (`Serenity.tsx`, `setAssessAttivo(mode !== 'free')`), e tutto quel che si
scrive o si dice finisce comunque nel Diario — i 5 metodi servono solo alle tecniche che hanno
bisogno del proprio quadrante. Aggiunta una nota `.note.info` in §3, subito dopo "Ouvrir une
séance", prima della schermata del quadrante.

**Cartella screenshot creata.** `~/Downloads/Guide Static Meter/docs/guide-screenshots-serenity/`
non esisteva ancora — creata, in attesa dei 10 file che l'utente sta preparando (nomi già
elencati in conversazione, uno per ciascuno dei 10 blocchi `.shot` già cablati nel guide).

**Verificato in diretto**: `public/guide/SERENITY-manuale.html` ricaricato nel browser, la nota
appare in §3 nel testo esatto atteso.

Versione guide: 3.0.141 → 3.0.142.

`git status`: `src/App.tsx`, `src/serenity/Serenity.tsx`, `public/guide/SERENITY-manuale.html`
(rigenerato) — nessun file `.ts`/`.tsx` toccato in questo giro oltre alla rigenerazione della
guida, quindi nessun nuovo `tsc`/`vitest`/`lint` da rilanciare.

---

## Giro (29/08/2026, 12) — MNA enfin visible, choix METER lisible, proposition liquid glass

**Le MNA était quasi entièrement hors écran.** Segnalato: « le MNA se trouve trop en bas et on
ne le voit pas entièrement ». Mesuré en direct (1280×720): `PannelloMna` (rect réel, 141px de
haut) s'affichait à `top:717, bottom:858` — 3px visibles sur 141, le reste sous le bord de la
fenêtre. Deux causes combinées: (1) son enveloppe (`minHeight:240`) réservait 240px alors que le
panneau réel ne dépasse jamais ~157px même à l'étape la plus chargée (barre de progression
comprise) — 80px perdus EN HAUT de l'enveloppe, poussant tout le reste plus bas qu'il ne fallait;
(2) `gruppoBasso` (la ligne des 5 cercles + le MNA) ne recevait qu'un tiers de la hauteur contre
deux tiers pour l'arc — un rapport fixé avant que le MNA vive là-dedans. `gruppoBasso` a bien un
`overflow:'auto'` (vérifié: scroller à la main révèle le MNA en entier), mais rien ne dit à
l'auditor qu'il PEUT scroller — une barre de 6px, invisible sur fond sombre. Corrigé: enveloppe
réduite à `minHeight:180` (zéro gâchis), et `gruppoBasso` reçoit maintenant 2,4 parts contre 1
quand le MNA est réellement ouvert (`mnaVisibile = aperta && moduleVis.mna`) — l'arc ne perd
jamais un pixel quand le MNA est fermé, la grande majorité du temps. **Vérifié en direct**: les 5
cercles ET le panneau MNA visibles ensemble, sans aucun scroll, à 1280×720.

**Le choix METER ne montrait presque rien au clic.** Segnalato: « configurer le METER, il faut
montrer davantage quand on a cliqué sur un bouton de choix ». `pillola()` distinguait sélectionné/
non-sélectionné par une différence d'opacité entre `--s-disc` (`rgba(255,255,255,0.42)`) et
`--s-disc-sunk` (`rgba(236,234,230,0.34)`) — quasi le même blanc translucide, presque invisible.
`ThetaReadyCheck.tsx` (le même bouton, EQUILIBRIUM) marque déjà l'option active en ambre
(`#f59e0b`) contre un gris neutre: nouvelle fonction `scelta()` reprenant la même logique avec
`--s-reserve` (l'ambre de SERENITY, déjà utilisé pour "chiudi la seduta"). Vérifié visuellement
(page de contrôle isolée, dans les deux thèmes): l'option active ressort clairement en ambre,
bordure + texte, l'inactive reste neutre.

**Proposition « liquid glass ».** Segnalato: « je voudrais que les boutons, tous les boutons et
l'interface deviennent plus GLASS LIQUID ». `.s-glass`/`.s-glass-btn` existent déjà (giro
précédent, hors de cette fenêtre visible) — 34 des 48 `<button>` de `Serenity.tsx` les utilisent
déjà; 14 n'y sont pas encore (à traiter au prochain giro, cas par cas — certains ont
volontairement un autre traitement, pas un balayage mécanique). Trois directions comparées côte
à côte sur les vraies pièces de l'appli (bouton principal, cercle de méthode, choix persistant),
publiées en artefact pour choix: « Verre profond » (le même mécanisme renforcé — flou/saturation/
ombre plus poussés, zéro risque), « Reflet mobile » (un lustre qui glisse au survol, un ménisque
sur le bord haut des boutons sélectionnés), « Lentille » (le verre le plus récent façon Apple —
lentille convexe simulée, plus radical, plus loin du ton actuel de SERENITY).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/PannelloMeter.tsx`.

---

## Giro (29/08/2026, 13) — LENTILLE, la scelta fatta

**« Per SERENITY vorrei LENTILLE »** — la terza delle tre proposte confrontate nell'artefatto
"Trois verres pour SERENITY" (giro precedente), applicata al vero materiale condiviso
(`tokens.css`, `.s-glass`/`.s-glass-btn`): questo era il punto di costruire le tre proposte
sulle CLASSI vere, non su un mockup a parte — la scelta si scrive in un solo posto e arriva
automaticamente a tutti e 34 i bottoni che già portano quelle classi, senza toccarli uno per
uno.

**Cosa cambia davvero.** `.s-glass::before` (il lucido): da un velo diagonale lineare
(`linear-gradient(165deg, ...)`, che tagliava dritto da un bordo all'altro) a una lente
CONVESSA vera — un dégradé RADIALE decentrato in alto a sinistra (`radial-gradient(120% 140%
at 24% 8%, ...)`, dove cadrebbe la luce su un vero oggetto di vetro). `.s-glass-btn`: da due
ombre a tre — un filo di luce più spesso in cima (`inset 0 2px`, non più `0 1px`), un'ombra
INTERNA che incurva il lato opposto (`inset 0 -6px 10px -4px`, l'ingrediente che mancava a un
rilievo piatto), l'ombra esterna di sempre un poco più profonda. Nuovo `.s-glass-btn::after`:
una goccia di luce netta nello stesso angolo del lucido — un secondo pseudo-elemento, zero
markup nuovo da aggiungere bottone per bottone.

**Il gap dei 14 bottoni senza `.s-glass-btn`** (segnalato il giro scorso): rivisto uno per
uno, non un balayage meccanico. Tredici si sono rivelati intenzionalmente ALTRO — righe di
lista (MUSE/BOÎTES/SANS-INSTRUMENTS, i menu Assetto), link di testo puri (« annulla »,
« enregistrer », i due "salva configurazione"), un bottone che incornicia il logo Alt.
Scientology (un caso a parte, non un controllo generico), un bottone di chiusura sopra un
iframe esterno (tenuto apposta indipendente dal tema, quel colore deve leggersi su qualunque
contenuto ci sia sotto), due chip di stato (NEEDLE LIGHT, con/senza ago), e il grande invito
trasparente "premi START" sopra l'arco (sfocarlo avrebbe confuso il quadrante sotto). Solo UNO
era una vera lacuna: la tastiera numerica manuale di MIRROR (dieci cerchietti 26px, `Serenity.
tsx` — stesso ruolo dei pulsanti +/- di sensibilità in `PannelloMeter.tsx`, che il vetro ce
l'hanno già) — aggiunte le classi lì, tolto il `border:'none'` inline che avrebbe cancellato
il bordo del vetro.

**Verificato in diretto**, chiaro e scuro: cerchi header, cerchi di metodo, bottone "fermer la
séance", tutti mostrano ora il riflesso convesso decentrato invece del velo piatto di prima —
particolarmente netto in scuro sul bottone grande.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/tokens.css`, `src/serenity/Serenity.tsx`.

---

## Giro (29/08/2026, 14) — MNA allineato al Giornale, LENTILLE in chiaro/CRONOLOGIA/PROCESSUS, bottoni ASSESSMENT più alti

**MNA fuori da `gruppoBasso` — l'arco riprende la sua taglia.** Segnalato: « hai rialzato il
MNA ma hai ridotto di molto la zona ago, non va bene. Il MNA mettilo in basso allineato con il
giornale e così aggrandisci l'arco ». Il giro precedente aveva dato a `gruppoBasso` (pista del
ciclo/scelta metodo) un peso flex fino a 2,4 quando l'MNA era visibile — ma `gruppoBasso`
contiene anche i cinque cerchi/la pista, quindi ingrandirlo ingrandiva LORO, mentre l'arco
(`gruppoAlto`) si restringeva davvero per fargli posto: il rimedio sbagliato. Rimedio giusto:
l'MNA non vive più DENTRO `gruppoBasso` — è ora un TERZO fratello della stessa colonna
(`flex:'0 0 auto'`, fuori dal conto due-terzi/un-terzo), che essendo l'ULTIMO figlio della
colonna centrale finisce sullo stesso bordo su cui la colonna del Giornale, a sinistra, finisce
già (le due colonne condividono la stessa altezza, `alignItems:'stretch'` sulla riga a tre
colonne). `gruppoAlto`/`gruppoBasso` tornano al loro rapporto di sempre (2:1 a riposo, 3:1 a
ciclo armato), senza l'MNA a contenderselo.

**LENTILLE, troppo debole in chiaro.** Segnalato: « fai LENTILLE anche in light ». Le cifre del
giro precedente erano tarate SUL BUIO (dove il bianco del lucido si vede naturalmente bene) e
si perdevano quasi del tutto sulle superfici già chiare di SERENITY in tema chiaro: bianco al
55% su un fondo quasi bianco (`--s-disc`) non fa contrasto. Rinforzate SOLO le regole di
default (il tema chiaro, dato che lo scuro ha il suo `:root[data-tema='scuro']` a parte, mai
toccato): il lucido 0,55→0,85, la goccia di luce 0,75→0,92, le due ombre scure che incurvano/
staccano 0,20→0,30 e 0,18→0,26 (in chiaro l'ombra deve fare il lavoro che in scuro faceva già
il bianco).

**LENTILLE anche in CRONOLOGIA/PROCESSUS.** Segnalato: « fai i bottoni LENTILLE anche per
CRONOLOGIA, PROCESSUS ». `HistoryModal`/`ProcessusModal` sono componenti CONDIVISI con
EQUILIBRIUM — non si toccano i loro file (cambierebbe anche l'altra applicazione). Gli
involucri `.ser-history-wrap`/`.ser-processus-wrap` esistevano già (per la sola taglia
dell'overlay, un bug di un giro fa): vi si aggiunge ora, per SOLO selettore CSS discendente
(`.ser-history-wrap button`/`.ser-processus-wrap button`), la stessa ricetta lentille di
`.s-glass-btn` (lucido decentrato + goccia di luce + tre ombre) — zero JSX condiviso toccato,
zero rischio per EQUILIBRIUM (che questi due nomi di classe non li ha mai). I colori dei
bottoni di quei pannelli (view=slate, PDF=cyan, elimina=red) restano i loro: solo il rilievo
si aggiunge sopra. Una sola ricetta (non scuro/chiaro separati): i due pannelli sono sempre a
fondo chiaro/perla, in entrambi i temi di SERENITY.

**I bottoni ASSESSMENT/ATTIVA, +1/3 di altezza.** Segnalato: « aumenta di 1/3 l'altezza dei
bottoni ASSESSMENT e ATTIVA nella zona ASSESSMENT ». Misurati dal vivo (nessuna altezza
esplicita prima, solo padding+contenuto): 19px e 18px veri. × 4/3 → 25px e 24px, dati come
`minHeight` (`ZonaAssessment.tsx`).

**Nota aperta, non risolta.** Segnalato anche: « cosa è l'alone bianco dove c'è scritto METER
TA. TOGLILO ». Cercato a fondo — il bottone PRESS-START (`radial-gradient(circle at 50% 40%...)`,
104px, ma si smonta quando `aperta`), la scia colorata delle reazioni MUSE/METER
(`textShadow: 0 0 12px ${alone}`, letteralmente chiamata "alone" ma non bianca per METER e non
vicino a "METER TA"), lo sfondo dell'arco (tolto, trasparente da un giro precedente),
`QuantumSphere`/`VistaSenzaAgo` (nessun bagliore bianco fisso) — nessuno corrisponde. Riprodotto
dal vivo in questo sandbox un alone identico alla descrizione, ma un'analisi DOM/CSS completa
(elementi reali, pseudo-elementi, SVG, canvas, immagini — tutti interrogati sulla regione esatta
del bagliore) non ha trovato NESSUN elemento della pagina responsabile: il sospetto forte è che
sia un artefatto del solo sandbox (la richiesta `getUserMedia` per il microfono, bloccata qui con
un avviso del browser che il DOM della pagina non vede né controlla) e non un bug reale
dell'app Electron. Non corretto per non rincorrere un fantasma — serve uno screenshot dall'app
vera per procedere con sicurezza.

**Verificato in diretto**: tema chiaro, il lucido/la goccia di luce si vedono chiaramente su
tutti i cerchi/pulsanti (prima quasi invisibili); MNA in fondo, circa allo stesso bordo del
Giornale; `.ser-history-wrap button::before` conferma via DOM il nuovo gradiente applicato;
`ASSESSMENT`/`ATTIVA` misurati 25px/24px dopo la modifica (erano 19px/18px).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/ZonaAssessment.tsx`,
`src/serenity/tokens.css`.

---

## Giro (29/08/2026, 15) — corretto un mio bug (la X nascosta), testo nero in PROCESSUS, MNA più basso

**Bug mio, dal giro precedente: la X di History/Processus, coperta dal lucido.** Segnalato: « la
X è nascosta, mettila in primo piano ». Causa: `.ser-history-wrap button::after` (la goccia di
luce, aggiunta nel giro scorso per LENTILLE) e il `::after` del bottone di chiusura vero
(`GlassCollapseToggle`, ritinto con una `content:'×'` in `modalCloseButtons.css`, un file già
esistente prima di questo giro) sono lo STESSO pseudo-elemento sullo STESSO bottone — le due
regole si sommavano, e il bianco aggiuntivo del lucido anneriva il contrasto già tenue della ×
(`--s-ink-soft`, un grigio medio, non pensato per competere con altro bianco sopra). Escluso il
bottone di chiusura dalla regola generica LENTILLE con lo stesso `:not(:is([title=...]))` già
usato da `modalCloseButtons.css` — il bottone di chiusura resta SOLO col suo trattamento
dedicato (che già gli dà vetro + rilievo + × leggibile), il resto dei bottoni tiene LENTILLE
com'era.

**Testo nero nei bottoni di PROCESSUS.** Segnalato: « scrivi all'interno dei bottoni in nero
perché in bianco non si vede bene ». Alcuni bottoni di `ProcessusModal.tsx` (i chip di tag in
sospeso, "ADD ↵", "✕") scrivono `color: rgba(255,255,255,...)` fisso in linea, senza seguire
`th.text`/`lt` come il resto del file — andava bene sul fondo scuro per cui erano stati
scritti, diventa illeggibile sul vetro chiaro di SERENITY (ancora più chiaro ora, con LENTILLE).
Non si tocca il file condiviso: `.ser-processus-wrap button, .ser-processus-wrap button *
{ color: var(--s-ink) !important; }` — lo stesso escamotage `!important` di
`modalCloseButtons.css`.

**CRONOLOGIA — verificato, non serviva altro.** Segnalato: « metti tutti i bottoni in LENTILLE
come per PROCESSUS ». La regola generica già copre `.ser-history-wrap button` per intero (ogni
`<button>` dentro, righe di sessione comprese) — verificato dal vivo su PROCESSUS, che HA
contenuto reale (35 procedimenti): ogni chip/scheda mostra il lucido. CRONOLOGIA nel test resta
vuota (« Aucune session passée trouvée »): stessa regola, semplicemente niente ancora da
mostrarla sopra.

**MNA più basso, per MIRROR.** Segnalato: « in MIRROR quando c'è l'MNA i numeri di quanto
carica si vedono solo a metà e si deve scrolling, riduci la zona MNA in altezza, che tanto va
bene lo stesso ». Il suo involucro (`flex:'0 0 auto'`, dal giro scorso) non si restringe MAI
sotto la sua `minHeight` — in MIRROR, con `gruppoAlto` cresciuto e la tastiera del valore
manuale già dentro `gruppoBasso`, quei pixel non liberati da nessuno mancavano altrove.
Ridotti insieme: `minHeight` 180→140 (`Serenity.tsx`), il padding del pannello 12px 18px→8px
14px e i due `marginTop` fra le righe 10→6 (`PannelloMna.tsx`).

**Alone bianco su METER TA — indagine in corso, con l'utente.** Verificate a fondo e SCARTATE
con prova diretta (markup incollato dall'utente via DevTools): il `<svg>` di `QuantumSphere`
(pulito, nessun elemento fuori posto, `trail_glow`/`needle_glow` mai referenziati in questo
render), il wallpaper personalizzato di CONFIG (confermato dall'utente: è su DEFAULT, nessuna
immagine). In attesa che l'utente ispezioni l'alone stesso in DevTools (Chrome vero, non l'app
impacchettata — verificabile) per identificare l'elemento esatto.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/tokens.css`, `src/serenity/PannelloMna.tsx`, `src/serenity/Serenity.tsx`.

---

## Giro (29/08/2026, 16) — alone bianco: un tentativo mirato, in attesa di conferma

**Indagine chiusa (per esclusione), non per causa trovata.** Con l'utente, via DevTools:
ispezionato l'elemento esatto sotto l'alone — risulta il `<div>` dell'arco stesso
(`background:'transparent'`, `overflow:'hidden'`, nessuna classe) coi suoi due unici figli
(le letture, vuote qui; il testo "DONNE L'ITEM" centrato) — niente che disegni un alone.
Ispezionato anche l'`<svg>` di `QuantumSphere`: pulito, `trail_glow`/`needle_glow` mai
referenziati nel render corrente. Scartato il wallpaper personalizzato (CONFIG è su DEFAULT,
confermato). Scartate le estensioni Chrome (l'alone resta identico in incognito).

**Un sospetto concreto, testato con un correttivo mirato.** L'alone è comparso esattamente
nella versione che ha introdotto LENTILLE (`backdrop-filter` pesante su molti più bottoni,
due giri fa) — coincidenza che punta a un bug di composizione GPU di Chromium: la sfocatura
di elementi vicini che "sanguina" in un pannello trasparente, senza fondo, senza il proprio
livello di composizione. Aggiunto `transform:'translateZ(0)'` al pannello dell'arco — il
rimedio standard per isolare un elemento sul proprio livello GPU, innocuo se la causa fosse
altra (non tocca il disegno). **In attesa di conferma dal vivo**: se non basta, il prossimo
passo è disattivare `backdrop-filter` un pezzo alla volta per isolare quale bottone lo causa
davvero.

`tsc --noEmit` pulito, `vitest run` 652/652.
`git status`: `src/serenity/Serenity.tsx`.

---

## Giro (29/08/2026, 17) — l'alone bianco: trovato (probabilmente) — il canvas della SplashScreen

**La caccia, in breve.** Sette test dal vivo con l'utente, ciascuno escludendo una pista: il
markup della `<section>` (due volte, riga per riga, con l'utente su DevTools — pulito), il
wallpaper personalizzato (CONFIG su DEFAULT), le estensioni Chrome (identico in incognito),
l'app impacchettata vera (stesso alone, non solo nel dev-server), gli effetti video di macOS
(Ritratto/Center Stage, già spenti), la fotocamera stessa (alone presente anche spenta),
l'isolamento del livello GPU (`transform:translateZ(0)`, tentato sul pannello dell'arco — non
bastava).

**Il sospetto che spiega TUTTI i "no".** Un `<canvas>` non lascia MAI traccia in un'ispezione
DOM/CSS — è disegnato a pixel, non con stili — e sopravvive a qualunque test che agisca SOLO
sulla pagina web (estensioni, wallpaper, istanza browser). `SplashScreen.tsx` (condiviso con
EQUILIBRIUM, l'animazione dei primi secondi con SERENITY/EQUILIBRIUM scritto) disegna proprio
questo — una « sfera cerebrale luminosa » su canvas — la stessa forma dell'alone. Sospetto:
un fantasma dell'ultimo fotogramma, lasciato sul livello di composizione GPU di Chromium dopo
che il canvas viene rimosso dal DOM allo smontaggio del componente (un bug di compositing non
raro per questa classe di elementi, e coerente con "presente ovunque, mai nel DOM").

**Il correttivo.** Nella funzione di pulizia del suo `useEffect` (già cancella
`requestAnimationFrame` e il listener di resize), aggiunto `ctx.clearRect(0,0,canvas.width,
canvas.height)` — il canvas si svuota per davvero un istante prima di essere portato via: se il
fantasma di un fotogramma dovesse restare, sarebbe quello di un canvas VUOTO, non della sfera.
Innocuo se la causa fosse un'altra (non tocca il disegno mentre l'animazione è visibile, in
NESSUNA delle due app). **In attesa di conferma dal vivo** — a differenza dei tentativi
precedenti, per vedere l'effetto serve una seduta APERTA DOPO che la SplashScreen si è chiusa
da sola (i primi ~4 secondi dell'app), non un test in una seduta già aperta.

**Testo nero, anche in HISTORY.** Segnalato di nuovo: « devi anche cambiare il bianco in nero
nei bottoni dei PROCESSUS et HISTORY, non si vede la scritta ». La regola del giro scorso
copriva solo `.ser-processus-wrap` — estesa a `.ser-history-wrap` con lo stesso `!important`,
la stessa esclusione per il bottone di chiusura (il suo `::after` dichiara il proprio `color`,
mai sovrascritto).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/components/SplashScreen.tsx` (condiviso), `src/serenity/tokens.css`.

---

## Giro (successivo) — l'alone bianco: indagine rifatta da zero, riprodotta dal vivo, DOM escluso con certezza

**Segnalato di nuovo**, dopo il fix del canvas della SplashScreen (non bastava) e un riavvio
completo del Mac (esclude un fantasma di GPU lasciato da una sessione precedente — un riavvio
pulito non porta con sé nessuna texture residua). Rifatta l'indagine da zero, in sandbox, MA
riproducendo l'alone DAL VIVO (profilo TEST, seduta senza strumenti aperta — "solo a seduta
aperta", confermato dall'utente) prima di cercare, non sulla carta.

**Escluso con certezza, non per sospetto.** Con `document.elementsFromPoint()` in più punti
dentro l'alone: lo stack è sempre `[SECTION, MAIN, DIV, BODY, HTML]`, niente in mezzo.
Scansionati TUTTI gli elementi dentro `<section>` (140, uno per uno) per sfondo/gradiente/
ombra/filtro/outline: nessuna corrispondenza vicino all'alone. Zero `<canvas>` nell'intera
pagina (la teoria del "fantasma del canvas della SplashScreen" è ora esclusa per davvero: il
canvas non c'è proprio, la SplashScreen lo rimuove correttamente dal DOM). Zero `<svg>` con
filtri vicino, zero `<video>`, zero `<iframe>`, zero Shadow DOM in tutto il documento. Zero
`animation-name` attivo vicino. `::before`/`::after` di `html`/`body`/`#serenity`/`main`/
`section` tutti vuoti. **Disattivate le due fotocamere da CONFIG (CAM 1 e CAM 2): l'alone
resta identico** — esclude anche la fotocamera/microfono per davvero, non solo per sospetto
come nei giri precedenti.

**Il dato che sposta l'indagine.** `document.body.style.visibility = 'hidden'` fa sparire
l'alone; ripristinare lo fa ricomparire. Dipende quindi dal contenuto della pagina — ma NESSUN
elemento della pagina, cercato in ogni modo interrogabile da JS, ne è responsabile. Questa
combinazione (dipende dalla pagina, nessun elemento la disegna) è la firma tipica di un bug di
COMPOSITING GPU di Chromium/Electron — un livello "fantasma" che il motore non invalida per
bene quando ridisegna quella regione — non di un errore nel nostro markup/CSS: non c'è più
niente da cercare lì con lo stesso metodo, i quattro tentativi precedenti (mirati a elementi
specifici) non potevano funzionare se la causa è a un livello sotto il DOM.

**Test diagnostico: GPU spenta.** `app.disableHardwareAcceleration()` in `main.cjs` (condiviso
— entrambi i DMG spediti), prima di `app.whenReady()`. Se l'alone sparisce con la GPU spenta,
la causa è confermata e si sceglie un rimedio mirato (non tenere la GPU spenta per sempre — il
resto dell'interfaccia diventa più lento); se resta identico, la pista GPU è esclusa anche lei
e si cerca oltre. **In attesa di conferma dal vivo.**

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `main.cjs` (condiviso).

---

## Giro (successivo) — l'alone bianco: pista GPU esclusa, ripristinata l'accelerazione

**Confermato dall'utente**: « c'è sempre » anche con `app.disableHardwareAcceleration()`. La
pista GPU (compositing) è esclusa quanto le quattro tentate prima (bottone PRESS-START, glow
SVG, isolamento del livello GPU sull'arco, canvas della SplashScreen). Tolta la riga — nessun
beneficio, solo il costo di un'interfaccia più lenta (resa software invece che hardware).

**Dove restare, ora che DOM e GPU sono entrambi esclusi con prove dirette.** Riassunto
completo per chi riprende: l'alone (1) dipende dal contenuto della pagina (sparisce
nascondendo `<body>`), (2) non è disegnato da NESSUN elemento interrogabile via JS (DOM
esaustivamente scansionato), (3) non cambia disattivando la GPU. Il prossimo passo utile non è
più cercare nel codice di quest'app — è capire se l'alone esiste ANCHE FUORI dalla finestra
dell'app, sullo stesso punto dello schermo, con un'altra finestra sopra. Se sì, la causa è nel
sistema dell'utente (un'utility di terze parti che disegna overlay, un filtro colore/accessibilità
di macOS, un problema del pannello stesso) e non in questo repository — nessun'altra modifica
al codice potrebbe toglierlo.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `main.cjs` (condiviso).

## Giro (successivo) — review completa del codice, 10 correzioni

**Segnalato**: « Fai una review completa del codice come se non l'avessi mai analizzato prima
[...] Individua bug, ridondanze e colli di bottiglia e proponi miglioramenti concreti, mantenendo
invariato il comportamento previsto dell'app. » — non una diff, tutta l'applicazione: `App.tsx`,
`Serenity.tsx`, l'engine e gli hook condivisi. Sei angoli di ricerca paralleli (correttezza
Serenity, correttezza engine/hook condivisi, parità App↔Serenity, riuso, efficienza,
async/memoria/sicurezza), poi verifica diretta riga per riga dei 10 candidati più gravi. Poi
« Procedi con tutti e dieci ».

**Corretti (file condivisi — riguardano ANCHE EQUILIBRIUM, entrambi i DMG ricostruiti):**

1. `useChargeEngine.ts` — l'accumulatore di distanza/massa SOL sommava `newVSol * 0.1`
   (dt fisso, 10Hz) a OGNI tick METRICS_UPDATE, ma il worker gira a ~22Hz (commento già presente
   nello stesso file, poco più sotto) — la distanza mostrata/salvata nei rapporti era gonfiata di
   ~2,2×. Ora un dt REALE, misurato con `performance.now()` fra un tick e l'altro (riusa `_nowMs`,
   già calcolato per il throttle React), clampato [0, 0.5s] per non contare un balzo dopo una
   pausa/tab in background.
2. `useChargeEngine.ts` — la zona T60 (`derivedZone`) accettava `needleReactionRef.current ===
   'F/N (Floating)'` come prova di F/N attivo, ma quell'etichetta è un TESTO visualizzato che
   resta a schermo per una finestra di tempo dopo che l'episodio è realmente finito
   (`lastFnShownAtRef`). Tolto il fallback: resta solo `tracking.isActive`, la fonte vera,
   aggiornata ad ogni tick da `fnTracker.update(qL, ...)`.
3. `MetabolicBaseline.ts` — il controllo di prontezza classificava `heart='ok'` per QUALUNQUE
   bpm ≤105, senza limite basso: un bpm implausibile (20, rumore/contatto scarso) passava come
   "ok" invece di segnalare il problema. Aggiunta `BPM_LOW=40`: sotto quella soglia è `'poor'`
   (nuova ragione `metab_reason_lowbpm`, non tradotta — come `metab_reason_agitated`/
   `metab_reason_highbpm`, già esistenti e mai renderizzate: `MetabolicCheck.tsx` filtra solo
   `contact`/`nobpm`).
4. `useMuseConnection.ts` — la sottoscrizione a `client.connectionStatus` non veniva mai
   salvata né smessa (a differenza di eeg/ppg/acc/gyro/telemetry, tutte in `museSubsRef`):
   sopravviveva alla disconnessione esplicita, e un evento GATT tardivo poteva riscrivere lo
   stato a `'searching'` subito dopo che l'utente aveva chiesto di scollegare. Ora vive nel suo
   `connectionStatusSubRef` (fuori da `museSubsRef`, apposta: quello si smonta/riattacca a ogni
   `wireStreams`, questa sottoscrizione si crea una sola volta per client) e viene smessa in TRE
   punti: le due disconnessioni esplicite (ricerca annullata, connesso→disconnetti) e quando la
   riconnessione silenziosa rinuncia dopo i tentativi massimi.
5. `useRemoteSession.ts` — `avvia()` non aveva nessun token di cancellazione (a differenza del
   pattern `museTokenRef` già usato per lo stesso genere di attesa in `useMuseConnection`):
   un `disconnetti()` durante l'attesa di `otteniChiaveServer()`/`networkManager.init()` poteva
   essere superato dalla stessa promise, che risolve DOPO e fa ricomparire un link di connessione
   per una seduta già chiusa. Aggiunto `avviaTokenRef`, stesso schema: incrementato all'ingresso
   di `avvia()` e da `disconnetti()`, controllato prima di applicare il risultato di `init()`.

**Corretti (solo `Serenity.tsx`, nessun impatto su EQUILIBRIUM):**

6. `cam2Mostrata` (riga ~2763) usava `espertoAttivo !== false` — l'UNICA occorrenza del file a
   trattare `undefined` (una config salvata prima che il campo esistesse) come EXPERT; ogni altro
   uso nello stesso file (righe 694, 2094 con un commento che lo dichiara esplicitamente, 3756,
   4068) usa `=== true`/`!== true`, che tratta `undefined` come BASIC. Corretta alla stessa
   convenzione — una config vecchia non mostra più CAM 2 di sorpresa in una seduta BASIC.
7. I PDF PROCESSUS (`getAllProcessusFiles()`, percorso IndexedDB) creano un
   `URL.createObjectURL(blob)` per ciascuno — `App.tsx` li revoca con un effetto dedicato
   ("FIX B-04"), qui non c'era nessun equivalente: perdita di memoria che cresce con ogni PDF
   caricato, mai liberata per tutta la vita della finestra. Aggiunto lo STESSO pattern di
   App.tsx: diff prev→next sull'elenco, revoca solo gli URL usciti dalla lista, più la revoca
   finale allo smontaggio.

**Esaminati e NON modificati (non erano difetti da correggere):**

8. `senzaStrumenti` che si riattiva da solo a metà seduta (riga ~866) — la divergenza da
   App.tsx è VERA, ma leggendo il commento sul posto è un comportamento esplicitamente segnalato
   e corretto due volte su richiesta diretta dell'utente (« quando disattivi il METER e/o il
   MUSE... il bottone NO INSTRUMENT deve attivarsi »). Non un bug: una scelta UX di SERENITY,
   diversa da EQUILIBRIUM apposta.
9. `LetturaVelocita` gated su `agoEeg` invece che sulla connessione MUSE — confermato che il
   blocco (TA/Fase/TotalTa/Velocità) è gated come UNITÀ su quale ago è primario, e il ramo
   "meter primario" (`!agoEeg && meterC`, poco più sotto) non ha MAI avuto una lettura di
   velocità: non un copia-incolla dimenticato, ma un layout a due colonne deliberatamente
   diverso da App.tsx (dove i due strumenti non condividono un blocco unico). Aggiungerla al
   ramo meter sarebbe una funzionalità nuova, non richiesta, in una zona già molto tarata a
   colpi di "segnalato" — lasciata com'è.
10. `aggiungiItemManuale`/`cercaLetturaPerParola`/`segnaIndicazione` ricopiate a mano da
    App.tsx, già leggermente divergenti (SERENITY distingue "non misurato" da "NULL" nel
    Giornale, App.tsx no) — un rischio di manutenzione futura, non un bug oggi: unificarle in un
    modulo condiviso toccherebbe `App.tsx` per un refactor, non per un fix mirato. Lasciata
    com'è; da riconsiderare se la duplicazione produce un vero bug.

**Verifica**: `tsc --noEmit` pulito, `npx vitest run` 652/652 verdi, `npm run lint` 325 warning
(identico alla baseline — l'unico nuovo `useRef<any>` è stato tipizzato
`{ unsubscribe: () => void } | null` apposta per non alzare il conteggio). Verifica dal vivo
(profilo TEST, Expert, seduta senza strumenti): nessun errore console, seduta aperta e
funzionante regolarmente.

## Giro (successivo) — l'alone bianco: causa trovata (con ragionevole certezza) — `backgroundColor` mai impostato

**Segnalato**: « Verifica il codice come se non l'avessi mai analizzato prima. Individua perché
compare un alone bianco nell'angolo superiore sinistro della zona ARCO. » — indagine rifatta
completamente da zero, senza dare per scontate le esclusioni precedenti (DOM, GPU, bagliori SVG,
fotocamere — tutte confermate valide alla rilettura, v. i giri precedenti).

**Il confronto che ha aperto la pista.** Rileggendo `Serenity.tsx` da capo: il pannello
dell'arco (`borderRadius:18`, `overflow:'hidden'`, `transform:'translateZ(0)'`) è l'UNICO
riquadro arrotondato di tutta l'applicazione con `background:'transparent'` — Giornale,
Assessment e Santé Système usano tutti un vero colore (`--s-zone-bg`) che copre qualunque cosa
gli stia dietro. Solo questo pannello, per una richiesta esplicita dell'utente due giri fa
(« la zona arc deve essere trasparente », per lasciar vedere il wallpaper personalizzato sotto),
non ha più NESSUN colore proprio a riempirlo — la firma esatta per cui, all'angolo arrotondato
di un livello composito senza sfondo opaco, Chromium può lasciar trapelare un filo di quel che
sta DIETRO invece di sfumarlo sul niente.

**E dietro la pagina, in Electron, non c'è altro che la finestra stessa.** `main.cjs` crea la
`BrowserWindow` senza mai impostare `backgroundColor` — Electron la disegna BIANCA di default
quando non specificato. Bianco è esattamente il colore segnalato. Questo spiega anche perché
NESSUNA delle indagini precedenti l'aveva trovato: non è un elemento della pagina (per questo
l'ispezione DOM/CSS, anche esaustiva, non trovava mai nulla — non è la pagina a disegnarlo, è
quel che sta sotto), e non dipende dalla GPU (è il colore della finestra stessa, non una resa
del suo contenuto — coerente col test già fatto: spegnere l'accelerazione hardware non cambia il
colore di fondo non impostato della finestra).

**La correzione**: `backgroundColor` impostato esplicitamente sulla `BrowserWindow`, scelto in
base a quale interfaccia si carica (`ENTRY`) — `#17181a` per SERENITY (il suo `--s-ground`
scuro), `#2a2a2f` per EQUILIBRIUM (il centro del suo gradiente `AppBackground.tsx`). Costo zero,
nessun cambio di comportamento o di disegno: quel colore si vede SOLO nel filo scoperto
all'angolo (o nell'istante prima che la pagina dipinga sopra) — mai altrove. Non tocca
`Serenity.tsx`: il pannello dell'arco resta transparente com'è stato chiesto, il wallpaper
personalizzato continua a vedersi sotto.

**Perché non con certezza assoluta**: senza poter riprodurre l'alone dal vivo in questo
ambiente sandboxato (serve la build Electron reale, non il solo server di sviluppo in un
browser) la diagnosi resta la spiegazione più coerente con TUTTE le prove raccolte finora
(colore, invisibilità al DOM, indipendenza dalla GPU, unicità di questo pannello) — non una
riproduzione confermata riga per riga come le esclusioni precedenti. Se il DMG mostra ancora
l'alone, la pista GPU/DOM/finestra è ormai esaurita: resterebbe solo la verifica di sistema già
proposta (un'altra finestra sovrapposta allo stesso punto dello schermo).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `main.cjs` (condiviso — entrambi i DMG ricostruiti).

## Giro (successivo) — l'alone bianco: ancora presente, provato un vero sfondo sul pannello dell'arco

**Confermato dall'utente**: « c'è ancora » anche con `backgroundColor` impostato sulla
`BrowserWindow` — quella pista non basta da sola. Proposta dell'utente stesso, diretta: « E se
tu mettessi un fondo alla zona dell'arco? Prova. »

**Fatto**: `background:'transparent'` → `background:'var(--s-ground)'` sul pannello dell'arco
(`Serenity.tsx`). Riprova diretta dell'ipotesi "nessun colore proprio → all'angolo arrotondato
trapela quel che sta sotto" — se un vero colore lo toglie, la causa è confermata. `--s-ground` è
lo STESSO colore piatto della pagina in entrambi i temi (non un'invenzione): senza un wallpaper
personalizzato attivo la resa resta visivamente identica a prima; CON un wallpaper attivo
(CONFIG → "importa la tua immagine") questo pannello torna a coprirlo con un rettangolo pieno,
come prima delle due richieste esplicite di renderlo trasparente — un costo noto, accettato per
la durata del test.

Solo `Serenity.tsx` toccato, nessun file condiviso: un solo DMG questa volta.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
Verifica dal vivo (profilo TEST, Expert): pannello dell'arco visibilmente pieno, nessun errore
console. In attesa di conferma dall'utente sulla build reale.
`git status`: `src/serenity/Serenity.tsx`.

## Giro (successivo) — l'alone bianco: indagine dal vivo, esclusi DOM/CSS/SVG/canvas con certezza diretta

**Confermato dall'utente**: « c'è ancora » — con uno SCREENSHOT REALE (Chrome, `127.0.0.1:7893`,
non l'app Electron impacchettata — un tab di Chrome puntato allo stesso server locale) che per
la prima volta mostra l'alone chiaramente: un cerchio soffuso bianco/grigio, ~380px, nella metà
sinistra della zona ARCO, a seduta senza strumenti aperta (« DONNE L'ITEM »). Proposta
dell'utente: « E se tu mettessi un fondo alla zona dell'arco? Prova. » (v. giro precedente —
provato, escluso).

**Riprodotto dal vivo, in sandbox, IDENTICO.** Stesso profilo TEST → Expert → seduta senza
strumenti: lo stesso identico cerchio soffuso compare, stessa posizione, stessa taglia — in un
Chromium completamente diverso da quello dell'utente. Prova diretta che NON è specifico al Mac
dell'utente, alla sua GPU, o a un'estensione: è nella pagina stessa, riproducibile ovunque.

**L'indagine più esaustiva finora, con certezza diretta (non per sospetto) — TUTTO escluso:**
- `document.elementsFromPoint()` — **scartato apposta**: salta gli elementi
  `pointer-events:none` (che questa app usa OVUNQUE per gli overlay decorativi) — un difetto
  della tecnica usata finora, non solo un risultato negativo. Sostituito con una scansione
  diretta di ogni nodo (`querySelectorAll('*')`, 313 elementi in tutta la pagina) filtrata per
  bounding-box, che non salta nulla.
- Sfondo, `background-image`, `filter`, `box-shadow` (raggio incluso — nessuno abbastanza
  esteso da raggiungere quella zona), `mix-blend-mode`, `mask`/`-webkit-mask`,
  `::before`/`::after` — controllati su OGNI elemento che copre quella regione: zero
  corrispondenze.
- `<svg>`, `<canvas>`, `<video>`, `<iframe>`, Shadow DOM, custom elements — zero in tutta la
  pagina in questo stato preciso (VistaSenzaAgo/QuantumSphere non sono montati quando
  `senzaMisura && aperta`: verificato leggendo il codice, poi confermato dal vivo — zero
  `<style>` con le loro `@keyframes`, zero riferimenti a filtri SVG `url(#...)` ovunque nel DOM).
- **Sopravvive a**: resize della finestra (esclude un residuo di paint/tile cache legato al
  layout), un ciclo `display:none`→`''` mirato SUL pannello dell'arco stesso (esclude un livello
  GPU "fantasma" del pannello — se fosse la sua cache, distruggerne e ricreare il nodo
  l'avrebbe cancellata), rimozione LIVE di `transform:translateZ(0)`, di `overflow:hidden`, di
  `borderRadius`, del colore di fondo (`var(--s-ground)` → `transparent`) — **nessuno di questi**
  cambia l'alone di un pixel.
- **Non sopravvive a**: `document.body.style.visibility='hidden'` (sparisce — dipende dal
  contenuto della pagina) — ma navigare a `https://example.com` nella STESSA scheda non lo
  mostra mai (esclude che sia un artefatto del pannello di anteprima stesso, non legato a
  QUESTA pagina).
- **Non è la voce**: `useVoiceItem` (riconoscimento vocale, `active: aperta && !pausata`) è
  attivo esattamente in questo stato — messo in PAUSA dal vivo (`active` passa a falso,
  `SpeechRecognition` si ferma), l'alone resta identico. Non è il microfono/la sua UI.

**Conclusione onesta**: con ogni tecnica di ispezione DOM/CSS/JS esaurita e ogni proprietà
sospetta rimossa dal vivo senza il minimo cambiamento, questo non è più "un elemento che non
troviamo" — è la prova diretta che NESSUN elemento o stile di questa pagina lo disegna. Resta
una sola spiegazione compatibile con tutte le prove raccolte: qualcosa nella pipeline di
rendering di Chromium stesso (indipendente da Electron — riproducibile fuori da Electron, in
un server locale + un tab Chrome qualsiasi; indipendente dalla GPU — test già fatto), oppure
qualcosa fuori da qualunque browser sul sistema dell'utente. **Il test decisivo che resta, mai
fatto**: aprire la STESSA sessione (`http://127.0.0.1:7893`) in Safari invece che Chrome. Se
l'alone c'è ANCHE lì (un motore di rendering del tutto diverso, WebKit non Chromium), la causa è
di sicuro fuori da qualunque browser — un'utility di terze parti, un filtro colore/accessibilità
di macOS. Se NON c'è in Safari, è un bug specifico della famiglia Chromium/Electron con questa
esatta pagina — utile saperlo, ma a quel punto la correzione diventa "aggirare il bug"
(riscrivere il layout per non toccare qualunque combinazione lo scateni), non più "trovare
l'elemento colpevole", perché non esiste.

Nessuna modifica di codice applicata in questo giro (solo test dal vivo, mai persistiti) — tranne
il ripristino di `background:'transparent'` sul pannello dell'arco (il test del giro precedente,
ormai escluso: nessuna ragione di tenere la regressione sul wallpaper personalizzato).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx` (solo il ripristino a `transparent`).

## Giro (successivo) — l'alone bianco: anche in Safari — escluso ANCHE il canvas della SplashScreen

**Confermato dall'utente**: « C'è anche in SAFARI. Per me è molto più semplice di cosa sembra.
cerca una causa più semplice. » — prova decisiva: due motori di rendering del tutto diversi
(Chromium E WebKit) mostrano lo stesso identico alone. Questo esclude con certezza qualunque bug
di compositing specifico di un browser — quel che resta deve essere qualcosa di più semplice, o
di esterno a qualunque motore di rendering.

**Ripresa l'ipotesi più promettente rimasta**: il canvas della `SplashScreen` (`drawBrain`,
gradienti radiali bianchi concentrici — la STESSA identica forma dell'alone) era già stato
sospettato (giro 17) e "corretto" con `ctx.clearRect()` prima dello smontaggio — ma quello
svuota solo i PIXEL, non libera necessariamente il buffer GPU sottostante. Rinforzato:
`canvas.width = 0; canvas.height = 0` nella pulizia, il modo standard per forzare il browser a
scartare il backing store per davvero (non solo ridipingerlo trasparente).

**Verificato dal vivo, in un tab completamente nuovo (mai riusato)**: la SplashScreen gioca
regolarmente (il suo `requestAnimationFrame` + i timer da 3.8s scattano sempre), lo smontaggio
con la pulizia rinforzata gira — e l'alone compare comunque, identico, subito dopo. **Anche
questa pista è esclusa con certezza diretta**, non per sospetto: non un residuo del canvas
iniziale.

Il fix (`canvas.width/height = 0` allo smontaggio) resta nel codice — libera per bene la memoria
GPU del canvas, una buona norma a prescindere, costo zero, nessun effetto collaterale — ma NON
risolve l'alone.

**A questo punto**, con DOM/CSS/SVG/canvas/GPU/browser-engine tutti esclusi con prove dirette, e
la conferma che succede ANCHE in Safari, l'unica spiegazione compatibile con OGNI prova raccolta
è che l'alone non è disegnato da NESSUNA pagina web in NESSUN browser — è qualcosa di esterno
(il sistema, un'altra applicazione, o l'hardware del display). Chiesto all'utente il test più
diretto possibile: **la finestra del browser, spostata sullo schermo — l'alone si sposta CON la
finestra (sarebbe legato al contenuto/all'app) o resta FERMO nello stesso punto fisico dello
schermo (sarebbe esterno a qualunque browser/app)?** In attesa di risposta.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/components/SplashScreen.tsx` (condiviso — entrambi i DMG ricostruiti).

## Giro (successivo) — l'alone bianco: tolto `transform:translateZ(0)` — la teoria del compositor di macOS

**Confermato dall'utente**: la finestra spostata sullo schermo — « si sposta con la finestra ».
Prova diretta che NON è esterno al browser: è contenuto vero, legato a QUELLA finestra.

**Poi, il test decisivo**: chiesto di aprire l'ispettore e cliccare destro esattamente sull'alone.
Risposta dell'utente: « Non prende, non si posiziona su nulla nella console, è in arrière plan »
— e ha incollato l'HTML completo del `<section>` renderizzato dal vivo, sul suo Mac. Confrontato
riga per riga con quello di questa repo: IDENTICO, nessuna sorpresa — nessun elemento in più,
nessuno stile diverso. Il click non seleziona nulla perché quel che disegna l'alone sta SOTTO
tutto il contenuto vero della pagina, in un livello che l'ispettore del browser (che vede solo
l'albero DOM del SUO motore di rendering) non raggiunge affatto.

**La teoria che tiene insieme OGNI prova raccolta finora**: non un bug di Chromium, non un bug di
WebKit — il compositing di **macOS stesso** (Core Animation / Window Server), lo strato SOTTO
entrambi i motori che disegna la finestra vera sullo schermo. Spiega:
- stesso identico artefatto in Chrome E Safari (condividono lo stesso compositor di sistema);
- invisibile a QUALUNQUE ispezione DOM/CSS di un motore di rendering (non è lui a disegnarlo);
- si sposta con la finestra (è il compositor DI QUELLA finestra, non dello schermo);
- non cambia disattivando l'accelerazione hardware DI CHROMIUM (`app.disableHardwareAcceleration()`,
  giro precedente) — quel flag spegne la GPU del PROCESSO di rendering di Chromium, non il
  compositing della finestra che macOS fa comunque, a valle, per disegnarla sullo schermo.

Un solo elemento in tutta l'app chiede esplicitamente il SUO livello di composizione GPU separato
(`transform:'translateZ(0)'`) — proprio il pannello dell'arco, l'UNICO con
`background:transparent` + `overflow:hidden` + `borderRadius` insieme. Un livello GPU promosso,
con angoli arrotondati da ritagliare e nessun colore proprio a riempirlo, è la combinazione da
manuale per questa classe di artefatto di Core Animation. Aggiunta un giro fa come "rimedio
standard" mai dimostrato (anzi: il sospetto ora è che sia proprio la CAUSA, non il rimedio) —
tolta.

⚠️ Nota onesta: le mie prove precedenti ("rimosso live `transform:translateZ(0)`, l'alone non
cambia") giravano nel sandbox di test di Claude, quasi certamente non macOS — non potevano
intercettare un bug del compositor DI macOS. Non erano sbagliate, erano cieche a questa pista.

Verifica dal vivo (sandbox, non macOS): nessuna regressione visiva, l'arco è identico. La verifica
VERA di questo fix può avvenire solo sul Mac dell'utente, dove il difetto esiste per davvero.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).

## Giro (successivo) — l'alone bianco: RISOLTO — non era un bug di questo repository

**L'utente conferma**: « C'è ancora » su 3.0.157 (`translateZ(0)` tolto — pista esclusa anche
questa, confermata sul suo Mac vero). Proposto il pannello « Layer borders » di Chrome DevTools
(mostra un riquadro attorno a ogni livello di composizione GPU reale, invece di indovinare quale
proprietà CSS lo causa) — prima che l'utente arrivasse a provarlo, ha trovato da solo la vera
causa: **« Quando attivo MODE SOMBRE AUTOMATIQUE sparisce »**.

**Perché questo chiude l'indagine con certezza, non per sospetto.** L'impostazione di sistema
macOS Aspetto: Chiaro / Scuro / **Automatico** (passa da solo secondo l'ora) è indistinguibile, per
QUALUNQUE pagina web, da un Aspetto fissato a mano sullo stesso valore corrente — `prefers-color-
scheme` in CSS/JS restituisce lo stesso identico `dark` (o `light`) in entrambi i casi, nello
stesso istante. Nessuna riga di HTML/CSS/JS di questa applicazione — né di NESSUNA pagina web — può
*in linea di principio* comportarsi diversamente fra "Scuro fissato a mano" e "Automatico,
attualmente scuro": sono la stessa cosa vista dal browser. Se l'alone cambia fra i due, la causa
non può essere nella pagina — dev'essere macOS stesso, nel modo in cui gestisce un Aspetto FISSATO
a mano contro uno SCELTO in automatico (un dettaglio di implementazione del Window Server, non
qualcosa che un sito web può leggere o influenzare).

**Questo combacia con OGNI prova raccolta in tutta l'indagine**, dal primo giro fino a questo: mai
un elemento DOM/CSS/SVG/canvas a spiegarlo (giusto: non c'era da spiegare, non lo disegnava questa
pagina); presente in Chrome, Safari, ED Electron (giusto: tutti e tre passano dallo stesso
compositor di sistema); si sposta con la finestra (giusto: è il compositor DI QUELLA finestra);
l'ispettore non seleziona nulla, « è in arrière plan » (giusto: sotto tutto quel che il motore di
rendering del browser conosce); indipendente dalla GPU di Chromium (giusto: la GPU coinvolta è
quella del compositing di sistema, non quella del processo di rendering). Ogni singola prova, con
il senno di poi, punta ESATTAMENTE qui.

⚠️ **RIAPERTO nel giro successivo** — v. più in fondo a questo documento: la conclusione qui sopra
si è rivelata prematura. Non toccare questa sezione, resta come cronologia di come ci si è arrivati.

**Nessuna correzione di codice necessaria — non c'è niente in questo repository da correggere.**
Tutti i tentativi precedenti (bottone PRESS-START, bagliori SVG, GPU spenta, canvas della
SplashScreen, `backgroundColor` della finestra, sfondo pieno sulla zona arco, `transform:
translateZ(0)`) erano ipotesi ragionevoli via via escluse — nessuna sbagliata di per sé, tutte
cieche a una causa che stava fuori da qualunque pagina web. `transform:translateZ(0)` resta tolto
dalla zona arco (era comunque un rimedio mai dimostrato per un problema che non era suo da
risolvere — nessuna ragione di rimetterlo).

**Per l'utente**: se « Automatico » risolve l'alone ma cambia il comportamento dell'Aspetto in modo
indesiderato (passa da chiaro a scuro secondo l'ora, invece di restare fisso), è una scelta di
System Settings → Aspetto Generale, non qualcosa che questa app possa impostare o aggirare da sé —
maiuscolo indipendente da SERENITY/EQUILIBRIUM.

## Giro (successivo) — LENTILLE torna piatta sotto Automatico: la stessa causa, vista dall'altro lato

**Segnalato**: « Quando attivo modo automatico l'interfaccia perde il modo lentille » — vero,
non un'invenzione: `backdrop-filter` (la sfocatura vera del vetro, `.s-glass`/`.s-glass-btn` in
`tokens.css`) è una funzione del browser/di macOS, non dell'app — verificato che il tema COLORE
di SERENITY resta indipendente (`isLightTheme` non legge mai `prefers-color-scheme` né
l'API nativa di Electron per il tema — zero occorrenze in tutto il codice, incluso il CSS, ora
controllato anche lì dopo un primo giro che aveva cercato solo nei `.tsx`), ma la RESA di
`backdrop-filter` stesso può cambiare secondo come macOS compone quel livello — la stessa
famiglia di comportamento sospettata per l'alone. Sotto Automatico i bottoni restano leggibili
(`.s-glass` non ha un colore di fondo suo: quando la sfocatura non si compone, resta visibile
SOLO il colore di base già scritto su ogni bottone — il fallback più pulito che il CSS possa
fare da solo, niente di rotto).

**L'utente vuole entrambi**, non un compromesso — proposto un test mirato prima di arrendersi:
`.s-glass` non chiedeva mai un livello di composizione GPU esplicito (`isolation:isolate` crea
solo un contesto d'impilamento). Aggiunto `transform:translateZ(0)` — l'OPPOSTO esatto del
rimedio tolto dal pannello dell'arco due giri fa (lì il livello esplicito sembrava LA causa
dell'alone su un elemento `background:transparent`; qui, su un elemento con `backdrop-filter`
invece, l'ipotesi è che la sua ASSENZA sia la causa della sfocatura mancante sotto Automatico).

Verifica dal vivo (sandbox, non macOS): nessuna regressione — LENTILLE identica in condizioni
normali. La verifica vera (se la sfocatura torna sotto Automatico, e se l'alone nel frattempo
non riappare sui bottoni) può avvenire solo sul Mac dell'utente.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/tokens.css` (solo SERENITY).

**Esito, confermato dall'utente**: LENTILLE resta piatta anche con il livello GPU esplicito —
nessun beneficio. `transform:translateZ(0)` tolto da `.s-glass`, nessuna ragione di tenerlo per
un rimedio che non ha funzionato. `backdrop-filter` sotto Aspetto Automatico di macOS resta un
limite del sistema — non qualcosa che una proprietà CSS su questo lato possa aggirare.

**A questo punto il trade-off è confermato reale e non risolvibile via codice**: Aspetto fissato
(LENTILLE piena, l'alone resta, cosmetico) contro Aspetto Automatico (nessun alone, LENTILLE
piatta ma leggibile e funzionante). Nessuna delle correzioni provate — su nessuno dei due lati —
ha trovato un modo di avere entrambi. Resta la scelta dell'utente.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx` (solo SERENITY).

## Giro (successivo) — l'alone bianco: RIAPERTO — non era risolto, il microfono resta un candidato vero

**L'utente conferma « c'è ancora »** anche con CAM 2 spenta da CONFIG (webcam esclusa con
certezza) e con la seduta in **pausa** (voce esclusa... solo in apparenza). Riletto il codice di
`avviaSeduta()`/`chiudi()`: `voiceToneAnalyzer.stop()` e `primeFreqAudio.killAll()` vivono SOLO
dentro `chiudi()` — nessuno dei due si ferma quando la seduta va in pausa. `pausata` spegne
UNICAMENTE `useVoiceItem` (il riconoscimento vocale, via `active: aperta && !pausata`). Un secondo
flusso microfono VERO — `voiceToneAnalyzer`, che legge l'energia della voce, separato dalle
parole — resta attivo per tutta la pausa. Il test "seduta in pausa" quindi non escludeva il
microfono per davvero, solo UNO dei suoi consumatori: un buco nel mio ragionamento, non nel
codice.

**Il confronto che regge ancora**: CONFIG ha LENTILLE ma non apre mai una seduta — non avvia mai
`voiceToneAnalyzer`/`primeFreqAudio`, coerente con « appare SOLO dopo aver aperto la seduta »
(confermato: l'arco inattivo, prima di "OUVRIR UNE SÉANCE", è pulito).

**Test diagnostico**: `voiceToneAnalyzer.init()`/`ensureAudioContextActive()` disattivato
temporaneamente in `avviaSeduta()` (righe commentate, non rimosse — in questa build di test SOLO
il tono di voce nella trascrizione resta assente, nient'altro cambia). `primeFreqAudio.init()`
lasciato attivo apposta: crea solo un `AudioContext`, nessun `getUserMedia` nel suo codice —
meno sospetto di un microfono vero, isolato per un test successivo se serve.

Se aprendo una seduta NORMALE (non in pausa) in questa build l'alone sparisce, la causa è
`voiceToneAnalyzer` — confermata, non per sospetto. Se resta, si esclude anche lui e tocca a
`primeFreqAudio`.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx` (solo SERENITY).

**Esito**: l'utente conferma « C'È L'ALONE » — `voiceToneAnalyzer` escluso anche lui. Tolto anche
`primeFreqAudio.init()` (temporaneamente, stesso test) — l'ultimo motore audio/media rimasto che
si attiva esattamente all'apertura della seduta, mai prima. Crea "solo" un `AudioContext`, senza
`getUserMedia` nel suo codice: meno sospetto degli altri due, ma è l'ultimo candidato di questa
famiglia rimasto da escludere prima di allargare la ricerca fuori dall'audio.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx` (solo SERENITY).

**Esito**: « SI » — l'utente conferma che l'alone resta anche con `primeFreqAudio` spento.
TUTTA la famiglia audio/media di `avviaSeduta()` è ora esclusa con certezza (voce, tono di
voce, MNA). Ripristinati entrambi i motori (nessun beneficio, solo funzionalità rotta per
niente).

## Giro (successivo) — l'alone bianco: nuova pista — il ridimensionamento del pannello all'apertura

Rifatto il ragionamento da capo: il pannello ha SEMPRE lo stesso CSS statico (confermato dal
codice), ma non è vero che NIENTE cambia intorno a lui — `comandiSottoAgo = aperta` cambia il
rapporto flex della colonna che lo contiene (`'1 1 0%'` inattivo → `'2 1 0%'`/`'3 1 0%'` a seduta
aperta): il pannello CAMBIA DAVVERO dimensione nell'istante esatto in cui la seduta si apre, un
ridimensionamento vero non solo un cambio di contenuto — proprio l'istante in cui compare l'alone
(confermato: assente sull'arco inattivo, compare solo dopo "OUVRIR UNE SÉANCE").

**Ipotesi**: un pannello `overflow:hidden`+`borderRadius` che si ridimensiona PROPRIO mentre
riceve nuovo contenuto (camere, comandi, overlay) può lasciare un residuo di composizione che il
motore di rendering non invalida da solo — non un bug nel contenuto, un bug nella TRANSIZIONE.

**Test, questa volta senza toccare taglia o design veri**: un `useEffect` su `[aperta]` che, SOLO
quando la seduta si apre, aspetta due frame (che il layout si sia assestato per davvero) e poi fa
un "nudge" impercettibile di opacità (`1` → `0.999` → `1`) sul pannello — forza il motore di
rendering a ridipingerlo per davvero invece di riusare quel che aveva già composto per la taglia
precedente. Zero cambi visibili, zero cambi di comportamento — un `useEffect` in più, niente
altro.

Verifica dal vivo (sandbox, non macOS): nessuna regressione — seduta aperta e funzionante
normalmente. La verifica vera può avvenire solo sul Mac dell'utente.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx` (solo SERENITY).

## Giro (successivo) — l'alone bianco: TROVATO E CORRETTO — `.s-glass-btn::after` senza `position:relative`

**L'utente conferma « C'È ANCORA »** anche col nudge di ridisegno — e giustamente stanco di
ipotesi indirette, chiede di guardare quello che LENTILLE stessa disegna, non più il contenitore
attorno. Ripresa in mano `.s-glass::before`/`.s-glass-btn::after` (`tokens.css`, il lucido e la
« goccia di luce » di LENTILLE): entrambi sono `position:absolute` — e `.s-glass::before` è un
`radial-gradient` bianco, centrato al **24% 8%** (in alto a sinistra), grande **120%×140%**
dell'elemento. Esattamente la forma, il colore e l'angolo dell'alone.

**La caccia all'elemento, questa volta per bisezione visiva diretta** (non più `elementsFromPoint`
o scansioni di stile, che avevano già dimostrato i loro limiti): nascosto il pannello dell'arco —
alone invariato; nascosta l'intera `<section>` — alone sparito; bisezione binaria sui 167
discendenti della sezione (metà nascosti, metà visibili, ripetuto) finché non è rimasto un solo
elemento capace di farlo riapparire da solo: il bottone **« ACTIVER »** dell'ASSESSMENT
(`ZonaAssessment.tsx`).

**La causa esatta**: quel bottone (e il suo vicino, « espandi/chiudi la vista ») ha
`className="s-glass-btn"` — MAI `.s-glass` insieme, che è l'unica delle due classi a dichiarare
`position:relative`. `ZonaAssessment.tsx` non ha NESSUN `position:relative` proprio, in nessun
antenato. Il `::after` di quel bottone (la goccia di luce, `position:absolute`), senza un
antenato posizionato tutto suo, risale il DOM fino al primo che lo È — la `<section>` intera
(1240×558). Le sue percentuali (26%×34%, offset 16%/10%) si applicano quindi alla SEZIONE, non
al bottone di 24px: un cerchio enorme, centrato in una zona che non ha nessuna relazione visibile
con l'elemento che lo genera davvero — da qui l'impossibilità di trovarlo cliccandoci sopra
("è in arrière plan": il vero elemento responsabile è un piccolo bottone in alto a destra, non
sotto il cursore quando si clicca sull'alone).

Verificata la matematica: sezione 1240×558 a (20,146) → gradiente calcolato a x 218..540,
y 202..392 — combacia con l'alone osservato (x ~280..530, y ~136..344) entro il margine
d'errore di una stima a occhio sullo screenshot.

**La correzione**: `position: relative` aggiunto a `.s-glass-btn` stessa (`tokens.css`), non ai
singoli bottoni. Gli ALTRI due usi di `s-glass-btn` da solo in `Serenity.tsx` "funzionavano per
fortuna" (un div-contenitore già posizionato, uno `position:relative` scritto a mano) — un
contratto fragile, non garantito dalla classe. Ora lo è: qualunque bottone `s-glass-btn` futuro,
con o senza `.s-glass` insieme, ha sempre il suo proprio contesto di posizionamento.

Tolto anche il "nudge" di ridisegno del giro precedente (mai la vera causa, ora inutile) e i suoi
ref (`arcoPannelloRef`/`arcoNudgeId1Ref`/`arcoNudgeId2Ref`).

**Verificato dal vivo**: seduta riaperta con ASSESSMENT visibile (lo stesso stato in cui l'alone
compariva sempre) — nessun alone, "DONNE L'ITEM" pulito, nessuna regressione visiva altrove
(header, CONFIG, EP/COMMANDS). Prima volta in tutta questa indagine che il fix è CONFERMATO nel
mio stesso ambiente, non solo in attesa di conferma sul Mac dell'utente — perché stavolta la
causa è puramente CSS/DOM, non un comportamento specifico di macOS: doveva riprodursi ovunque, e
si è riprodotta.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/tokens.css` (solo SERENITY).

**CONFERMATO dall'utente sul suo Mac vero, versione 3.0.163**: « Perfetto, sparito ». L'indagine è
chiusa per davvero — non un'esclusione, una CAUSA TROVATA E CORRETTA. `EQUILIBRIUM` non ha mai
usato `.s-glass`/LENTILLE (la sua tavolozza scura vive in `ui/tokens.ts`, un materiale diverso):
nessun rischio dello stesso bug lì, nessun bisogno di ricostruire il suo DMG per questo fix.

## Giro (successivo) — PROCESSUS: `title` sulle card PDF e sui bottoni senza etichetta

**Segnalato**: « Metti i titoli dei bottoni in PROCESSUS in modo da rendere visibili le scritte ».
Verificato dal vivo (`ProcessusModal.tsx`, condiviso con EQUILIBRIUM): le card dei PDF mostrano il
nome troncato a due righe (`line-clamp-2`, es. « 12) FRA 8 January 2020 – The Existence Non... »)
ma non avevano `title` — passandoci sopra col mouse non compariva nessun testo completo.

**Aggiunto `title` (il nome intero) a**: le card PDF (il caso principale, il nome troncato ora si
vede per intero al passaggio del mouse), il bottone di eliminazione ✕ su ogni card, il chip "ALL"
del filtro tag, il bottone ✕ che annulla la coda dei file in attesa — tutti icone/testo troncato
senza nessuna etichetta prima. Solo `title`, nessun cambio visivo finché non ci si passa sopra —
sicuro per un file condiviso, nessun comportamento diverso per EQUILIBRIUM.

Verificato dal vivo: tutte le card mostrano ora il `title` completo (controllato via DOM, i
tooltip nativi non sempre catturabili in screenshot).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/components/ProcessusModal.tsx` (condiviso — entrambi i DMG ricostruiti).

## Giro (successivo) — review di ottimizzazione: 6 correzioni, riprendendo i candidati mai affrontati

**Segnalato**: « rivedi bene tutto il codice per vedere cosa c'è da ottimizzare ». Ripresi i
candidati di efficienza/duplicazione già trovati (ma non affrontati, per la regola « la
correttezza vince quando il tetto costringe a tagliare ») nella review completa di due giri fa —
riverificati uno per uno sul codice attuale, non per sospetto.

**Corretti (6):**
1. **`Serenity.tsx` — `onClick` di `QuantumSphere` stabilizzato.** Una funzione inline
   (`onClick={() => { theta.resetToSet(); resetNeedleEeg(); }}`) ricreata a ogni render,
   passata a un `React.memo` che l'app stessa descrive come "il componente più grande e più
   chiamato" — vanificava quel memo per questo prop, ridisegnando ~680 righe di SVG a ogni
   render di `Serenity.tsx`, non solo quando l'ago cambia per davvero. `resetNeedleEeg`
   avvolta in `useCallback([])` (tocca solo singleton di modulo e ref, mai stato), un nuovo
   `handleQuantumSphereClick` con `theta.resetToSet` (già stabile di suo) nelle dipendenze —
   MAI l'intero oggetto `theta`, che è un letterale nuovo a ogni render.
2. **`App.tsx` — `onShowGuide` stabilizzato.** Stessa classe di bug: un handler inline in
   mezzo a fratelli TUTTI già stabilizzati con `useEvent` per lo stesso commento esplicito
   ("stable-identity handlers... skipped when App re-renders only because the ~10 Hz session
   metrics changed") — l'unico dimenticato. Aggiunto `sbOnShowGuide = useEvent(...)`.
3. **`orologio` — duplicata parola per parola fra `Serenity.tsx` e `ZonaAssessment.tsx`.**
   Estratta in `orologio.ts` (un file a sé, non importata da `Serenity.tsx` per evitare lo
   stesso giro circolare già incontrato con `SuggerimentoCiclo.tsx`).
4. **`PannelloMeter.tsx` — ternario morto.** `theta.testing === 'squeeze' ? t('theta_squeeze_hint')
   : t('theta_squeeze_hint')` — stesso testo in entrambi i rami, nessun comportamento da
   preservare. Collassato nella sua unica resa.
5-6. **`PannelloMeter.tsx` — bottone annulla mancante in 2 delle 4 copie** del blocco "test in
   corso" (le due sotto-prove TA con due lattine/lattina sola, dentro il passo taratura) — le
   altre due copie (passo stretta/respiro) lo hanno da sempre. Chi stringeva per errore in
   quei due punti non aveva modo di uscirne se non aspettando la prova. Aggiunto lo stesso
   bottone, stesso testo, stesso stile delle copie che già lo avevano.

**Esaminati e SCARTATI** (candidati della review precedente, non più validi o mai stati un
problema reale): `getProfiles()`/`getPcProfiles()` triplicate — già ottimizzate in un giro non
tracciato qui; i due `useLayoutEffect` senza dipendenze in `Serenity.tsx` — deliberati, con
guardia `prev===nuovo` che li rende innocui, non un bug; `gyroRms` "non limitato" — 32
iterazioni per tick, costo trascurabile, falso allarme; `sessionContext` allocato inline per
`AIAssistant` — il componente non è memoizzato e legge quel prop solo dentro un callback, mai
in un effect reattivo: nessun beneficio misurabile a toccarlo; `pillola` duplicata — non più
vera, una sola definizione trovata; l'algoritmo di attenuazione in `PistaCiclo.tsx` — il file è
stato modificato pesantemente da un altro giro, l'identificatore originale non esiste più.

Verificato dal vivo: nessuna regressione (arco, ASSESSMENT, seduta aperta/chiusa normalmente).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo — il
warning nuovo di `react-hooks/exhaustive-deps` sul `useCallback` di `handleQuantumSphereClick`,
che avrebbe voluto l'intero oggetto `theta` nelle dipendenze — esattamente l'instabilità che il
fix elimina — silenziato con un `eslint-disable-next-line` mirato, non con una disattivazione
larga).
`git status`: `src/App.tsx`, `src/serenity/Serenity.tsx`, `src/serenity/ZonaAssessment.tsx`,
`src/serenity/PannelloMeter.tsx`, `src/serenity/orologio.ts` (nuovo) — `App.tsx` condiviso,
entrambi i DMG ricostruiti.

## Giro (successivo) — PROCESSUS: scritte nere vere sui bottoni (non più legate al tema)

**Segnalato con uno screenshot dal vero** (tema scuro): i bottoni di COMANDI PROCEDIMENTI
(RADIAL PROCEDURE, RUDIMENTS, APRI CARTELLA) avevano testo chiaro, difficile da leggere.

**La causa vera, trovata rileggendo `tokens.css`** (non `.s-glass` nel file React, come
sospettato un giro fa — `ProcessusModal.tsx` non usa mai quella classe): LENTILLE ci arriva per
SELETTORE CSS discendente, non per classe (`.ser-processus-wrap button::before` — righe
546-597, aggiunta apposta perché il file è condiviso con EQUILIBRIUM e non si può toccare). Il
lucido bianco è quindi SEMPRE presente su OGNI bottone di questo modale (tranne quello di
chiusura), indipendentemente dal suo sfondo dichiarato nel JSX. Il colore del testo, però,
seguiva `var(--s-ink)` (riga 622) — che segue il TEMA (`#2c2f33` scuro in chiaro, `#e8e6e1`
CHIARO in scuro) mentre il lucido resta bianco in ENTRAMBI i temi: nel tema scuro, chiaro-su-
lucido-bianco tornava chiaro-su-chiaro.

**Corretto**: `var(--s-ink)` → `#2c2f33` (il valore letterale del tema chiaro, non più la
variabile) — nero vero, fisso, leggibile sul lucido bianco che c'è sempre, in entrambi i temi.
Verificato dal vivo via DOM (non lo screenshot, troppo compresso per giudicare a occhio): il
colore computato su ogni bottone controllato è `rgb(44,47,51)`, il nero appena impostato.

**"Aggiorna il GUIDE anche"** — controllato dal vivo: il pannello Guida (`GuideModal.tsx`) ha
un suo sfondo scuro fisso, indipendente da LENTILLE e dal tema di SERENITY — nessuno stesso
problema lì, testo già leggibile. Il vero disallineamento trovato: il manuale SERENITY (vive
FUORI da questo repository, `~/Downloads/Guide Static Meter/SERENITY-manuale.html`, copiato
dentro l'app a ogni build da `scripts/copy-guide.cjs`) scriveva `VERSIONE = "3.0.142"` nel suo
footer — la app è già a 3.0.165. Allineato a `3.0.165`.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/tokens.css` (solo SERENITY) — e, fuori dal repository,
`~/Downloads/Guide Static Meter/SERENITY-manuale.html` (copiato in `public/guide/` alla build).

## Giro (successivo) — PROCESSUS: il nero era giusto, mancava un fondo chiaro vero

**Segnalato di nuovo, con screenshot**: « le noir dans les boutons... n'est pas visible » — il
nero era sparito del tutto, non solo poco leggibile.

**La causa**: il lucido di LENTILLE (`::before`) è un gradiente RADIALE concentrato in un
angolo (24% 8%), spento oltre il 60% della sua estensione — su un bottone LARGO (i chip dei
tag, "RADIAL PROCEDURE (EN)"...) gran parte del testo sta FUORI da quel lucido, sul fondo VERO
del bottone: quasi trasparente (gli sfondi originali di `ProcessusModal`, pensati per un'altra
coppia fondo/testo), quindi scuro quanto il pannello sotto. Nero su quello sparisce per
davvero.

**Corretto**: aggiunto `background-color: rgba(255,255,255,0.82) !important` alla stessa regola
CSS che già forza `backdrop-filter`/`box-shadow` su questi bottoni — un fondo chiaro VERO,
uniforme su TUTTO il bottone, non solo dove arriva il lucido parziale. Il lucido e la goccia di
luce restano sopra (loro pseudo-elementi, z-index più alto): l'effetto vetro non cambia, solo
ora ha sempre qualcosa di chiaro sotto perché il nero funzioni.

Verificato dal vivo: tutti i chip (ALL, ACADEMY, CANCER HANDLING...) e "OUVRIR LE DOSSIER" ora
leggibili, nero su fondo chiaro reale.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/tokens.css` (solo SERENITY).

## Giro — 2026-08-31 — quattro richieste insieme: BASIC senza strumenti, testo dei cicli più
## grande, "volume" ai bottoni PROCESSUS, cerchio icona in intestazione, briefing d'apertura

Quattro richieste arrivate una dopo l'altra, tutte solo-vista SERENITY (nessun file condiviso
toccato — nessuna `dist:mac`).

**1. « Basico deve cominciare senza strumenti per default »**

`apri()` (`Serenity.tsx`, l'unica funzione che apre il pannello "avec quoi audite-t-on?")
azzerava sempre `connSel` a `{muse:false, theta:false, none:false}` — nessuna scelta
pre-selezionata, indipendentemente da BASIC/EXPERT. Ora `none: espertoAttivo !== true`: in BASIC
(`!== true`, non `=== false` — stessa convenzione robusta di `moduleVis`/`cam2Mostrata`, per
includere una configurazione ancora senza questo campo) "senza strumenti" parte già selezionata;
l'auditor può comunque cambiarla con un clic. In EXPERT nessun cambiamento: nessuna scelta
pre-selezionata, come prima.

Verificato dal vivo: BASIC → il pannello si apre con "Séance sans instruments" già spuntato (✓).

**2. « Quando si audisce senza strumenti, i comandi dei cicli scrivili più grandi »**

Il blocco assoluto "senza strumenti" (`senzaMisura && aperta`, l'UNICA cosa che l'auditor legge
per condurre il ciclo quando non c'è né ago né arco): `spiegazioneCiclo.comando` era
`--s-fs-lg` (18px) → `--s-fs-xl` (21px, la taglia del nome SERENITY/dei numeri in mostra); il
"come" (`comeSenzaAgo`/`spiegazioneCiclo.come`) e l'`avviso` erano `--s-fs-base` (15px, la più
piccola del blocco) → `--s-fs-lg` (18px). Il titolo restava già `--s-fs-hero` (28px), invariato.

**3. « I bottoni dei processi che hai appena corretto così non sono belli, dagli un poco di
volume »**

Il fondo piatto aggiunto nel giro precedente (`background-color: rgba(255,255,255,0.82)
!important`, tinta unica uniforme) risolveva la leggibilità ma appiattiva il bottone in una
lastra bianca, perdendo l'aria "a lente" di LENTILLE. Sostituito con un **gradiente verticale**
(`linear-gradient(168deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.78) 55%,
rgba(255,255,255,0.86) 100%)`): più chiaro in alto dove cade la luce, leggermente più tenue al
centro, di nuovo chiaro in basso — il rilievo di una superficie curva. Ogni fermata resta sopra
0.74 di opacità, ben oltre la soglia di leggibilità del nero (a differenza del lucido radiale
`::before`, che scende fino a 0 in alcune zone del bottone — v. giro precedente). `box-shadow`
anche lui un poco più marcato (bordo/ombra esterna rinforzati) per accompagnare lo stesso
rilievo. Stessa regola CSS di prima (`.ser-history-wrap button:not(...)`,
`.ser-processus-wrap button:not(...)`), nessun nuovo selettore.

**4. « Inserisci sopra la versione accanto a SERENITY un cerchio con all'interno l'immagine che
utilizzi per l'icona dell'applicazione »**

Copiata `build/icon-serenity.iconset/icon_128x128.png` (la sorgente PNG della stessa icona che
macOS mostra nel Dock/Launchpad, `build/icon-serenity.icns`) in `public/icon-serenity.png` — un
asset solo di SERENITY, non condiviso con EQUILIBRIUM (che ha la propria `build/icon.icns`).
Nell'header, il numero di build (`{__SERENITY_VERSION__}`) è ora dentro una colonna verticale
insieme a un cerchio di 22px (`border-radius:'50%'`, `overflow:'hidden'`, leggero bordo/ombra)
che contiene quell'immagine — il cerchio sopra, il numero sotto, accanto al nome SERENITY: "sopra
la versione" preso alla lettera.

**5. (segnalato a metà di questo stesso giro, mentre le prime quattro erano già in corso) « Quando
si inizia la sessione senza strumenti appaiono i cerchi dei cicli, e c'è scritto DAI L'ITEM,
Scrivilo o dillo, poi premi, ma non è corretto »**

`spiegazioneCiclo`/`comeSenzaAgo` per `mode === 'free'` (nessun ciclo armato) sono giuste per il
RITORNO al libero fra un ciclo e l'altro — un auditor già in seduta sa già come procedere.
Sbagliate al **primo** libero della seduta, prima che qualsiasi ciclo sia mai stato armato: lì
serve un vero briefing d'apertura, non l'istruzione minima "premi" pensata per chi sta già
conducendo.

Nuovo state `primaVoltaLibero` (accanto alla derivazione di `mode`): si riarma a `true` ad ogni
apertura seduta (`aperta`), e si spegne per sempre — fino alla prossima apertura — al primo
`mode` diverso da `'free'` (il primo ciclo armato). Quando `mode==='free' && primaVoltaLibero`,
il blocco assoluto "senza strumenti" mostra un briefing "INIZIO SESSIONE"/"DÉBUT DE SÉANCE" (5
lingue) al posto di "DAI L'ITEM": intro + due liste ("Prima di iniziare" — Obiettivo/stato fisico
del PC/R-Factor, gli stessi tre campi già in cima allo schermo; "Durante la sessione" —
scegliere un ciclo o procedere liberamente, COMMANDS, ASSESSMENT, trascritto automatico).
`bottoniCiclo` (i cerchi dei cicli) restano SEMPRE montati sotto, in entrambi i casi — il
briefing lo dice esplicitamente ("puoi scegliere uno dei cicli disponibili").

⚠️ Primo tentativo (titolo `--s-fs-hero`, corpo `--s-fs-lg`/`--s-fs-xl`, le due liste una sopra
l'altra) **usciva dallo schermo**: verificato dal vivo anche a 1440×900, titolo e ultimo punto
tagliati fuori dal contenitore (`position:absolute; top:50%; transform:translate(-50%,-50%)`, che
non lascia margine extra). Corretto: le due liste affiancate in `grid`
(`gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))'`, non più impilate — dimezza
l'altezza), titolo e corpo un poco più piccoli (`--s-fs-xl`/`--s-fs-sm`, non hero/lg — è un testo
letto una volta sola all'apertura, diverso da `spiegazioneCiclo` che resta grande perché letto
ripetutamente durante il ciclo), più `maxHeight:'82vh'`/`overflowY:'auto'` come rete di sicurezza.

Verificato dal vivo (BASIC, FR, 1440×900): briefing completo visibile, cerchi dei cicli sotto;
cliccato CONTACT → torna il testo normale del ciclo (grande, come punto 2); ANNULER → tornati a
"libero" mostra "DONNE L'ITEM" normale, MAI più il briefing nella stessa apertura seduta.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx`, `src/serenity/tokens.css`, `public/icon-serenity.png`
(nuovo file, solo SERENITY).

## Giro — 2026-08-31 (2) — briefing INIZIO SESSIONE più grande + "DAI L'ITEM" non deve più
## riapparire dopo un ciclo

Due correzioni sullo STESSO blocco del giro precedente (`senzaMisura && aperta`).

**1. « Scrivi il briefing INIZIO SESSIONE più grande, come i comandi dei cicli »**

Taglie allineate a quelle di `spiegazioneCiclo` (il ramo "ciclo in corso", già ingrandito nel
giro precedente): titolo `--s-fs-hero` (era `--s-fs-xl`), intro `--s-fs-xl` serif (era
`--s-fs-base`), le due intestazioni/liste `--s-fs-lg` (erano `--s-fs-sm`) — stessa gerarchia,
non un'invenzione a parte.

Il testo più grande usciva di nuovo dal contenitore — due bug distinti trovati verificando dal
vivo (DOM, non solo screenshot):
- `maxHeight:'82vh'` misurava l'altezza della FINESTRA, ma il contenitore vive dentro un
  genitore posizionato alto solo ~400px (lo spazio vero fra header e riga dei cicli) — `82vh`
  (738px a 900px di finestra) non scattava mai come limite reale. Corretto: `maxHeight:'100%'`,
  che risolve contro il genitore posizionato vero (`top:50%` è già relativo a lui).
- Il contenitore (`display:flex`, `position:absolute`, solo `maxWidth` senza `width`) restava
  largo quanto il SUO contenuto (shrink-to-fit) invece che quanto `maxWidth` concedeva: la
  `grid` delle due liste (`repeat(auto-fit,minmax(260px,1fr))`) vedeva una larghezza troppo
  stretta per due colonne e ripiegava su una sola, raddoppiando l'altezza reale. Corretto:
  aggiunto `width:'100%'` accanto a `maxWidth`.

Verificato dal vivo via DOM (non solo screenshot, che può ingannare su un overflow silenzioso):
`getBoundingClientRect()`/`scrollHeight` del contenitore prima e dopo — da 613px di contenuto
dentro un genitore di 403px (200px fuori, invisibile, layout a 1 colonna) a 424px di contenuto
nello stesso spazio di 403px (grid a 2 colonne, come previsto; `overflowY:auto` copre i 21px
residui, non più un budget mai raggiunto).

**2. « Quando si finisce un ciclo si ritorna alla schermata iniziale e c'è sempre scritto DAI
L'ITEM, Scrivilo o dillo... Non deve più apparire »**

`mode === 'free'` senza `primaVoltaLibero` (un ciclo è già stato armato e concluso in questa
seduta) ricadeva sul ramo "ciclo in corso" con `spiegazioneCiclo`'s "1 · DAI L'ITEM": quella
frase descrive il PRIMO passo del processo CONTACT, non un invito generico a ridare un item —
fuorviante quando l'auditor è tornato al libero dopo MIRROR/TONE/NULL e sta per SCEGLIERE un
nuovo ciclo dai cerchi sotto, non a "scriverlo o dirlo".

Terzo ramo aggiunto al condizionale: `mode === 'free' && !primaVoltaLibero` → nessun testo
(`null`), solo i cerchi (`bottoniCiclo`, sempre montati sotto in tutti e tre i casi). Il ramo
`spiegazioneCiclo`/`comeSenzaAgo` resta ora SOLO per `mode !== 'free'` — un ciclo davvero in
corso (CONTACT/NULL/MIRROR/TONE/TRUTH).

Verificato dal vivo (BASIC, FR, 1440×900): briefing grande e leggibile, due colonne affiancate;
CONTACT → testo normale del ciclo; ANNULER → tornati al libero, schermo SENZA alcun testo,
solo i cinque cerchi — mai più "DAI L'ITEM" dopo il primo ciclo, nella stessa apertura seduta.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: solo `src/serenity/Serenity.tsx` (SERENITY, nessun file condiviso).

## Giro — 2026-08-31 (3) — EXPERT senza briefing, BASIC con menzione EXPLICATIONS DES BOUTONS

Due correzioni sullo stesso blocco "senza strumenti" (`senzaMisura && aperta`).

**1. « Quand on commence la séance comme EXPERT on n'a pas besoin du debriefing de INIZIO
SESSION »**

Il briefing spiega Obiettivo/stato fisico del PC/R-Factor e come funzionano COMMANDS/
ASSESSMENT — cose che un EXPERT (`espertoAttivo === true`, "tous les chiffres") già conosce.
Nuova const `mostraBriefingIniziale = mode === 'free' && primaVoltaLibero && espertoAttivo !==
true` (accanto a `primaVoltaLibero`) sostituisce la condizione inline nei tre punti del blocco:
in EXPERT il primo libero cade ora nello stesso ramo `null` di ogni libero successivo (nessun
testo, solo `bottoniCiclo`) — nessun secondo flag necessario, il criterio è già in
`mostraBriefingIniziale`.

**2. « Quand on est en basic au début de séance dans le debriefing ajoute que on peut appuyer
sur EXPLICATIONS DES BOUTONS en montrant l'icône pour les explications des commandes »**

Nuovo punto nella lista "Durante la sessione" (5 lingue), con la VERA icona `StickyNote` dello
stesso bottone-aiuto già in header (`helpAttivo`/`AiutoOverlay`) accanto al testo — non
descritta a parole soltanto. Icona 16px in uno `span` `inline-flex` DENTRO il `<li>` (non
`display:flex` sul `<li>` stesso, che gli avrebbe tolto il pallino elenco: i browser smettono
di generare `::marker` su un list-item con `display` sovrascritto).

Verificato dal vivo (1440×900): BASIC → briefing con il nuovo punto "Appuie sur [icona
StickyNote] pour les explications sur les boutons." (confermato via DOM: `<li>` con `<svg>`
dentro); EXPERT → seduta senza strumenti si apre DIRETTAMENTE sui cerchi dei cicli, nessun
briefing, nessuna regressione sul resto del pannello EXPERT (JOURNAL, MODULATION
NEURO-ACOUSTIQUE...).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: solo `src/serenity/Serenity.tsx` (SERENITY, nessun file condiviso).

## Giro — 2026-08-31 (4) — bottone START nel briefing INIZIO SESSIONE

**« Quand on ouvre la séance en BASIC, sans instruments, on doit voir le BRIEFING début séance,
mais doit apparaître aussi le bouton de START (rond avec la flèche) afin que une fois lu le
briefing l'écran se libère et l'auditeur puisse réellement commencer »**

Prima di questo giro, `primaVoltaLibero` si spegneva SOLO al primo `mode !== 'free'` (un ciclo
armato) — chi in BASIC voleva restare libero (nessun ciclo, solo ASSESSMENT manuale) non aveva
modo di liberare lo schermo dal briefing, che restava a coprire il centro indefinitamente.

Aggiunto un bottone rotondo sotto le due liste del briefing (`mostraBriefingIniziale`), stessa
iconografia `Play` pieno del bottone "PREMI START" già in uso nel file (quello che APRE la
seduta) — stesso linguaggio visivo dell'app per "si comincia". Il click chiama
`setPrimaVoltaLibero(false)`: la STESSA leva che il primo ciclo armato spegne da sé — non un
secondo stato da tenere allineato. Etichetta "INIZIA"/"COMMENCER"/"START"/"EMPEZAR"/"STARTA"
(5 lingue), sfondo `var(--s-reserve)` (l'accento ambra), icona/testo `#1c1408`.

Verificato dal vivo (BASIC, FR, 1440×900): il bottone appare sotto le due liste (confermato via
DOM col contenitore scrollato in fondo), un click libera immediatamente lo schermo — restano
solo i cerchi dei cicli, esattamente come dopo un ciclo concluso.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: solo `src/serenity/Serenity.tsx` (SERENITY, nessun file condiviso).

## Giro — 2026-08-31 (5) — bottone START spostato sotto R-FACTOR, identico all'originale

**« Il bottone che hai messo è sotto i bottoni dei cicli. mettilo [sotto il campo] R-FACTOR,
IDENTICO A QUELLO INIZIALE che pulsa »** (confermato dall'utente via domanda di chiarimento:
"Sotto il campo R-FACTOR").

Due correzioni sul bottone aggiunto nel giro precedente:

1. **Posizione** — viveva in fondo alle due liste del briefing, troppo vicino ai cerchi dei
   cicli (`bottoniCiclo`) subito sotto: confuso con loro, esattamente il problema segnalato.
   Rimosso da lì. Spostato nella riga Obiettivo/Stato fisico/R-Factor in alto (già esistente),
   sotto la terza colonna (R-Factor) — `.map(..., i) => ... i===2 && mostraBriefingIniziale`.

2. **Stile** — non più il cerchietto 56px inventato: ora è lo STESSO disegno del bottone
   "PREMI START" originale (quello che apre la seduta, `!aperta && (senzaStrumenti || museOk
   || meterC)`, poco più giù nel file) — cerchio 104px, bagliore radiale, anello pulsante
   (`animation:'sStartPulse'`, la stessa keyframe già in `tokens.css`), `Play` da 46px. Uniche
   differenze necessarie per il nuovo contesto: `position:'relative'` (vive nel flusso della
   colonna, non centrato a schermo) invece di `'absolute'`, e `color:'var(--s-ink)'` diretto
   invece del ternario `isLightTheme` dell'originale (tarato per il fondo scuro del quadrante
   ago — qui il bottone sta sulla riga di Obiettivo/Stato fisico, `--s-ink` già corretto nei
   due temi da solo).

Effetto collaterale corretto insieme: la riga dei tre campi (`aperta && !campiSessioneNascosti`)
spariva da sola dopo 10 secondi se l'auditor iniziava a scrivere — portandosi via anche il
bottone prima che fosse stato premuto. Condizione estesa a `aperta && (!campiSessioneNascosti
|| mostraBriefingIniziale)`: la riga resta visibile finché il briefing è a schermo,
indipendentemente dal timer.

Verificato dal vivo (BASIC, FR, 1440×900): bottone pulsante ben separato dai cerchi dei cicli,
posizionato sotto R-FACTOR; un click libera lo schermo (restano solo i cerchi), la riga
Obiettivo/Stato fisico/R-Factor resta visibile in alto come sempre.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: solo `src/serenity/Serenity.tsx` (SERENITY, nessun file condiviso).

## Giro — 2026-08-31 (6) — scala del tono senza strumenti (dopo la resistenza), orologio più grande

Tre correzioni in questo giro.

**1. « Senza strumenti devi far apparire la scala del tono solo dopo aver trovato la
resistenza. Il ciclo è: trovare la resistenza, trovare a quale livello di tono corrisponde,
chiedere di portarlo a Tono 40 e Tono 40 raggiunto »**, poi precisato: **« Senza strumenti non
deve far apparire l'arco quando è scelto »**

`ToneDial`/`ToneColumn` vivevano SOLO dentro `!(senzaMisura && aperta)` — senza strumenti,
TONE non mostrava mai nulla di visivo, solo il testo di `spiegazioneCiclo`. Aggiunta la SOLA
`ToneColumn` (la scala verticale a livelli, puro, prende tutto da `useToneCycle` già montato —
`toneAssessed`, il livello dichiarato dall'auditor PRIMA di armare via il `<select>` accanto al
cerchio TONE, è già la sorgente quando `!tone.toneHasMeter`) nel ramo "ciclo in corso"
dell'overlay senza strumenti, montata SOLO quando `faseCiclo === 'tone.raise' ||
faseCiclo === 'tone.done'` — la resistenza deve essere già stata trovata (fasi `tone.item`/
`tone.say_item`, prima di questa, non la montano). `ToneDial` (l'ARCO con la lancetta) resta
escluso: non ha senso senza un ago vero, esattamente come richiesto nella precisazione.
`charge={null}` (senza `museOk`, sempre falso in questo ramo).

Verificato dal vivo (EXPERT — per arrivare più in fretta al ciclo, comportamento identico a
BASIC per questa parte — FR, 1440×900, séance sans instruments): scelto un livello dal
`<select>` (−1,5), TONE armato → "DIS LA RÉSISTANCE" → NESSUNA scala ancora (corretto: resistenza
non ancora detta); resistenza data via "R&I · Manuel" → la scala verticale appare, nessun arco
(confermato via scan DOM degli `<svg>`: solo icone lucide + un `viewBox="0 0 260 454"`, il
`ToneColumn`, nessun disegno d'arco); "ton quarante atteint" → scala resta visibile.

**2. « L'ora e il tempo di sessione devono essere più in grande, e l'ora più in evidenza del
timer di sessione »**

L'orologio (`OraReale`) e il timer di seduta (`orologio(tempo)`, a sinistra del bottone FERMER
LA SÉANCE) erano stati portati alla STESSA taglia (`--s-fs-base`, 15px) in un giro precedente,
apposta come "stessa famiglia di informazione" — richiesta ora esplicitamente ribaltata.
`OraReale`: `--s-fs-xl` (21px), `color:'var(--s-ink)'` pieno (non più `--s-ink-faint`),
`fontWeight:700`. Timer: `--s-fs-lg` (18px, comunque più grande di prima), stesso colore di
sempre — resta il secondo orologio, non il protagonista.

Verificato dal vivo: l'ora ("14:38") nettamente più grande e marcata del timer ("00:00") sotto
di lei.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: solo `src/serenity/Serenity.tsx` (SERENITY, nessun file condiviso).

## Giro — 2026-08-31 (7) — correzioni pesanti: arco MAI senza strumenti, bottone START rimesso
## sotto R-Factor nel testo, scala del tono davvero al secondo comando, GUIDE 5 domande

Giro di correzioni dopo un riscontro molto negativo dell'utente sulle scelte del giro
precedente ("hai fatto malissimo"). Quattro correzioni, una delle quali tocca un file
condiviso con EQUILIBRIUM (additivo, entrambi i DMG ricompilati e spediti).

**1. « SENZA STRUMENTI NON DEVE MAI MOSTRARE L'ARCO, anche nella schermata iniziale (dove fai
apparire l'arco con il bottone PREMI START) »**

Un giro precedente aveva deliberatamente scelto `!(senzaMisura && aperta)` (non
`!senzaMisura`) per i tre archi (`VistaSenzaAgo`/`QuantumSphere`/il contenitore
`ClearDial`+`MirrorDial`+`ToneDial`) — "solo `aperta`, non `!aperta`: PRIMA di aprire, l'arco
resta, è lì che vive il bottone PLAY al centro". Scelta esplicitamente ribaltata ora: "mai"
vuol dire anche PRIMA di aprire. Le tre condizioni diventano `!senzaMisura`, senza la clausola
`&& aperta` — quando il bottone PREMI START è a schermo, `senzaMisura` è già il segnale
giusto (vero solo se `senzaStrumenti` è stato scelto O nessun MUSE/Meter è ancora connesso).

**2. « Appare il bottone CHIUDI LA SEDUTA mentre abbiamo in alto il bottone pulsante INIZIA,
questo non va bene. Il bottone START deve essere posizionato sotto la frase INSERISCI
L'R-FACTOR »**

Il giro precedente aveva letto "sotto il campo R-Factor" come il campo dell'INTESTAZIONE
(Obiettivo/Stato fisico/R-Factor, in alto) — sbagliato: portava il bottone pulsante proprio
accanto a "FERMER LA SÉANCE", due comandi opposti fianco a fianco. "INSERISCI L'R-FACTOR" è
in realtà la FRASE del briefing "INIZIO SESSIONE" (l'ultimo punto della lista "Prima di
iniziare"). Il bottone è tornato lì, sotto quella frase, dentro il testo del briefing —
lontano dai comandi di sessione in alto, che risolve anche l'incoerenza visiva. La barra
Obiettivo/Stato fisico/R-Factor è tornata alla sua condizione originale
(`!campiSessioneNascosti`, senza l'estensione per il briefing, non più necessaria).

**3. « Appaiono i bottoni dei cicli, con il bottone TONO in cui appare la scala del tono...
NON VA BENE. Deve apparire solo al secondo comando del ciclo TONO, dopo aver trovato la
resistenza »**

Il vero colpevole era il `<select>` che sceglieva il livello di tono PRIMA di armare TONE
(accanto al suo cerchio, fra i cinque metodi) — la "scala in anteprima" visibile fin dalla
primissima schermata, prima ancora di aver trovato la resistenza. Nascosto per `senzaMisura`
(`&& !senzaMisura` aggiunto alla sua condizione — resta invariato con SOLO il MUSE connesso).
Un gemello dello stesso select rimontato DAVVERO al secondo comando: accanto a `ToneColumn`,
nel ramo `tone.raise`/`tone.done` dell'overlay senza strumenti (dopo che la resistenza è
stata trovata, mai prima) — sotto l'etichetta "a che livello di tono corrisponde?".

Sfida tecnica: `localizzaTone()` (chiamato al click su TONE, invariato) fissa `toneAtStart`
SUBITO, usando `toneAssessed` in quel momento — nascondere il select pre-arm senza altro
avrebbe lasciato `toneAtStart` sempre a 0 (il default) per ogni ciclo TONE senza strumenti, un
regresso reale sul rapporto registrato. Risolto con un'aggiunta ADDITIVA a `useToneCycle.ts`
(file CONDIVISO con EQUILIBRIUM): esposto `setToneAtStart` (il setter di uno `useState` già
esistente, mai stato nel `return` — nessuna riga esistente toccata, nessun chiamante esistente
la legge, comportamento di EQUILIBRIUM invariato). Il nuovo select "al secondo comando"
chiama sia `setToneAssessed` che `setToneAtStart`: il valore che l'auditor sceglie DAVVERO,
dopo aver trovato la resistenza, diventa quello registrato — non più lo zero di default.

Verificato dal vivo (EXPERT, FR, 1440×900): TONE cliccato → "DIS LA RÉSISTANCE" (nessuna
scala, nessun select); resistenza data via R&I · Manuel → scala + select "a che livello di
tono corrisponde?" appaiono INSIEME, nessun arco (confermato via scan DOM degli `<svg>`);
select cambiato a −1,5 → `toneAtStart` aggiornato correttamente (pillola "−2 → +40 en
cours…", arrotondamento di `.toFixed(0)` su −1,5); "ton quarante atteint" → scala/select
restano, nessuna regressione. Verificato anche in BASIC: il briefing mostra il bottone START
sotto "Renseigne le R-Factor…" (non più accanto a FERMER LA SÉANCE), TONE senza select
prematuro sui cinque cerchi.

**4. « Dans le guide le chapitre 1, Premier lancement doit avoir 5 étapes et non pas 3 »**

`~/Downloads/Guide Static Meter/SERENITY-manuale.html` (fuori dal repository git), capitolo
"1. Premier lancement" — elencava solo 3 domande (Qui audite / Seul ou avec préclair /
Combien veux-tu voir), mancavano "Qui est le préclair ?" e "Ici, ou à distance ?" — le due
domande CONDIZIONALI (esistono solo scegliendo "Avec un préclair", saltate in SOLO — v.
`flussoAvvio.ts`, `PassoId`). Aggiunte le due voci mancanti nell'`<ol>` (con nota esplicita
sulla condizionalità), riscritta la nota "note info" per spiegare "5 domande, non sempre 5
schermate", aggiornati i due riferimenti residui a "3 questions"/"3 domande" (didascalia
screenshot, riga della tabella §2 "profil · seul/préclair"). Testi presi parola per parola
da `src/i18n.tsx` (`ser_q_auditor`/`ser_q_chi`/`ser_q_preclear`/`ser_q_dove`/`ser_q_modo`),
non reinventati. `VERSIONE` del manuale portata a 3.0.174 (la prossima build SERENITY).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx` (SERENITY) + `src/session/useToneCycle.ts`
(CONDIVISO, additivo) — **entrambi i DMG ricompilati e spediti**, come da regola per i file
condivisi. Il manuale HTML resta fuori dal repository, nessun commit per lui.

## Giro — 2026-08-31 (8) — scala del tono davvero scelta (non automatica), briefing mai due
## volte, timer/chiudi solo dopo START, COMMANDS solo comandi

Sei correzioni in questo giro, due delle quali toccano file condivisi con EQUILIBRIUM
(`useToneCycle.ts`, additivo; `ProcessusModal.tsx`, additivo) — entrambi i DMG ricompilati e
spediti.

**1. « Non hai capito. Nel ciclo TONO 40 devi far vedere la scala del tono per poter
scegliere il TONO dopo che è stata trovata la resistenza... NON PUÒ ESSERE AUTOMATICA senza
strumenti »**, chiarito dal vivo: « SENZA STRUMENTI, non c'è nessuna tendina poiché cerca da
solo il tono... Dice 0 vs +40 in corso... e lampeggia »

Il giro precedente AVEVA aggiunto un select — ma sotto la scala, in fondo a un contenitore che
scorre: mai visto, perché la cosa più in vista restava la pillola "0 → +40 in corso…"
pulsante di `bottoniCiclo` (sempre montata). Tre correzioni:
- Nuovo stato `tonoScelto`: finché è falso (seduta `senzaMisura`), `bottoniCiclo` NON monta la
  pillola pulsante né i bottoni "portalo a tono 40"/"raggiunto" — quella pillola era
  esattamente l'aria "automatica" segnalata.
- Nuovo ramo `deveScegliereTono` (`senzaMisura && toneAttivo && faseCiclo==='tone.raise' &&
  !tonoScelto`): uno SCHERMO DEDICATO, stesso peso visivo del briefing "INIZIO SESSIONE" —
  titolo hero "A CHE TONO SI TROVA?", istruzione, la scala GRANDE, e un select con bordo
  ambra e opzione vuota "— scegli il tono —" (mai un default nascosto) — impossibile da
  perdere, non un'aggiunta in coda a uno scroll.
- Il `<select>` pre-arm (accanto al cerchio TONE, prima di trovare la resistenza) nascosto per
  `senzaMisura` — era lui il vero "cerca da solo" percepito: sceglieva il tono PRIMA della
  resistenza, l'ordine sbagliato.

**Bug trovato verificando dal vivo**: scegliendo un tono PIÙ BASSO del default (0) lasciato da
`localizzaTone()` al click su TONE, la scala restava ferma su "0 · Mort du corps" invece di
mostrare il tono scelto. Causa: `toneOra` è un ratchet "solo sale" che non scende mai sotto il
massimo già confermato — nella finestra fra il click e la scelta, `toneOraGrezzo` era rimasto
fermo su 0 abbastanza a lungo da essere già promosso a pavimento. `useToneCycle.ts`
(CONDIVISO): nuova funzione additiva `correggiToneAtStart(v)` che scrive `toneAtStart` E
azzera il ratchet (`toneHighRef`/`toneCandidateRef`/`taSmoothRef`) — esattamente quel che
`localizzaTone()` fa già quando fissa l'origine la prima volta. Nessuna riga esistente
toccata, nessun chiamante esistente (EQUILIBRIUM) legge questi campi.

Verificato dal vivo (BASIC, FR, 1440×900): TONE → "DIS LA RÉSISTANCE" (nessuna scala) →
resistenza data → schermo dedicato "A CHE TONO SI TROVA?" con select vuoto → scelto un tono
PIÙ BASSO di 0 (−1,5) → la scala mostra CORRETTAMENTE "−2 · Contrôler les corps" (arrotondato)
alla posizione giusta, non più bloccata su 0.

**2. « Se passi da strumenti a senza strumenti, con la session in corso, rifai vedere il
debriefing di inizio sessione. NON VA BENE »**

`primaVoltaLibero` si spegneva solo al primo `mode !== 'free'` — una seduta aperta CON
strumenti che non aveva ancora armato nessun ciclo lo lasciava `true`; passando poi a "senza
strumenti" a metà seduta, il briefing si riaccendeva da sé. Nuovo effetto: appena la seduta
gira DAVVERO con uno strumento vero (`!senzaMisura`), `primaVoltaLibero` si spegne per sempre
(fino alla prossima apertura) — chi ha iniziato con MUSE/Meter, anche solo un istante, non è
più "al primo libero della seduta" nemmeno se stacca tutto dopo.

**3. « Quando si inizia la session senza strumenti non devi far partire il timer e indicare
Chiudi la seduta se prima non si è schiacciato sul START che pulsa »**

Il timer di seduta (accanto all'ora reale) e il bottone FERMER LA SÉANCE restano nascosti
finché `mostraBriefingIniziale` è vero — nessun secondo comando in alto mentre il bottone
INIZIA pulsa nel briefing. L'ora reale (`OraReale`) resta sempre visibile.

**Bug trovato SUBITO DOPO, verificato dal vivo**: `mostraBriefingIniziale` non controlla
`aperta` nel suo calcolo (`mode` vale già `'free'` PRIMA di aprire) — la sola
`!mostraBriefingIniziale` nascondeva "OUVRIR UNE SÉANCE" stesso sulla schermata INIZIALE,
prima di qualunque apertura: l'unico modo di cominciare, sparito. Corretto con
`!(mostraBriefingIniziale && aperta)` in entrambi i punti (timer e bottone).

**4. (dal punto 2 della sessione precedente, corretto insieme) Posizione del bottone START**
— restava ok dal giro precedente (sotto "Inserisci l'R-Factor" nel briefing), nessuna
modifica necessaria qui.

**5. « Quando schiacci sul bottone COMMANDS, devono apparire solo i file dei comandi, non
tutti i processus »**

`ProcessusModal.tsx` (CONDIVISO): nuova prop additiva `soloComandi?: boolean` — `true`
nasconde i chip dei tag, la griglia dei PDF e la zona di upload, lasciando SOLO l'intestazione
e la card "COMANDI PROCEDIMENTI". `undefined`/`false` (il default, e quel che passano
EQUILIBRIUM e il bottone "Processus" di SERENITY) lascia il modale tale e quale a sempre.
Nuovo stato `processusSoloComandi` in Serenity.tsx: `true` dal bottone COMMANDS, `false` dal
bottone "Processus" — un solo `<ProcessusModal>` montato, la prop dice quale dei due ha
aperto.

Verificato dal vivo: COMMANDS → solo la card "COMMANDES DE PROCÉDÉS" (0 procédés, nessun tag/
PDF/upload); Processus → tutto come prima (35 processus, 15 tag, griglia PDF, upload)
— nessuna regressione.

**6. « Quando si apre una session SENZA STRUMENTI, la scelta non è validata nel selettore in
alto »** — verificato dal vivo (EXPERT e BASIC): il pallino della pillola "SANS INSTRUMENTS"
è correttamente verde ("connesso") in entrambe le modalità, MUSE/METER restano grigi
("in attesa") — nessuna discrepanza trovata. Nessuna modifica fatta qui: se il problema persiste
sulla build reale, serve un altro giro con più dettagli (schermata, sequenza esatta).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: `src/serenity/Serenity.tsx` (SERENITY) + `src/session/useToneCycle.ts` +
`src/components/ProcessusModal.tsx` (CONDIVISI, additivi) — **entrambi i DMG ricompilati e
spediti**.

## Giro — 2026-08-31 (9) — arco mai senza strumenti anche col MUSE solo, guide capitolo 10

**1. « Quand on démarre la séance avec les instruments, le cycle TON fait apparaître sous le
bouton l'échelle des tons pour choisir un ton. C'est erroné, puisque le ton est trouvé via
les instruments »**

Il `<select>` pre-arm (sotto il cerchio TONE, prima di armare) restava per il caso MUSE-solo
(`!tone.toneHasMeter` — vero anche con SOLO il MUSE connesso, dato che `toneHasMeter` è
specifico del Theta-Meter): un giro precedente l'aveva escluso per la seduta COMPLETAMENTE
senza strumenti, ma l'aveva lasciato lì per MUSE-solo, credendola non la lamentela. Lo era —
segnalato di nuovo, stavolta esplicitamente "con gli strumenti". Tolto del tutto: con
QUALUNQUE strumento connesso (anche solo il MUSE) l'auditor non sceglie più nulla a mano
prima di armare TONE. Un MUSE-solo che arma TONE parte ora da `toneAssessed` (il default, 0)
senza modo di correggerlo — accettato: la scelta esplicita di non offrire più nessuna scala
manuale quando uno strumento c'è, qualunque esso sia.

Verificato dal vivo (senza strumenti, non regredito): TONE → "SAY THE RESISTANCE" → resistenza
data → scala grande + select "— choose the tone —" appare correttamente, come nei giri
precedenti — nessuna regressione sul flusso senza strumenti.

**2. « Dans le journal tu dois inclure un chapitre sur l'audition en BASIC, avec démarrage,
l'utilisation des cycles sans instruments etc »**

Nuovo capitolo 10, "Auditer en Basique, sans instruments" / "Audire in Basico, senza
strumenti" / "Auditing in Basic, without instruments", in `SERENITY-manuale.html` (esterno al
repository, copiato in `public/guide/` a ogni build) — tra "9. Historique" e il vecchio "10.
Dépannage" (rinumerato "11."). Copre: come scegliere Basico + senza strumenti (la
pre-selezione di default), lo schermo SESSION START (i tre campi da compilare, il bottone
START pulsante, timer/FERMER nascosti finché non premuto, la finestra "una sola volta per
seduta"), l'assenza di ago/arco sostituita dal testo grande, una tabella per ciclo (CONTACT/
NULL sempre dichiarati a mano; MIRROR/TRUTH identici alla versione con strumenti; TONE in due
tempi — resistenza, poi SOLO dopo la scelta del tono, mai automatico), e il richiamo che
COMMANDS/ASSESSMENT/Journal/FERMER LA SÉANCE restano invariati. Aggiornata anche una nota
obsoleta al capitolo 4 (menzionava ancora il vecchio menu pre-arm, ora rimosso) e la riga TONE
della sua tabella. `VERSIONE` del manuale portata a 3.0.176 (la prossima build SERENITY).

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: solo `src/serenity/Serenity.tsx` (SERENITY, nessun file condiviso questo giro —
`useToneCycle.ts`/`ProcessusModal.tsx` non toccati, il DMG EQUILIBRIUM non viene rispedito).

## Giro — 2026-08-31 (10) — chiudere la seduta con un ciclo aperto torna DAVVERO allo stato iniziale

**« Quando chiudi una seduta e che lascio un ciclo aperto, devi far ritornare lo schermo allo
stato iniziale, ora ad esempio resta TONO 40, con una parte fuori dallo schermo e non posso
neanche cambiare gli strumenti per iniziare la sessione »**

`chiudi()` correggeva già CONTACT/NULL (`cycles.closeOpenCycleAtEnd()`) e MIRROR
(`mirror.stopMirror()`, se armato) — un giro molto precedente aveva trovato e chiuso quel buco
per il PDF. Ma TONE e TRUTH restavano fuori dall'elenco: chiudere la seduta con uno dei due
ancora armato non li disarmava MAI.

Non è solo un dato mancante nel rapporto (come lo era per CONTACT/NULL prima della correzione
precedente) — è `mode` (`toneAttivo ? 'tone' : truth.truthPhase !== 'idle' ? 'truth' : ...`)
che NON controlla `aperta`: resta `'tone'`/`'truth'` PER SEMPRE dopo la chiusura, e con lui
`modalitaCiclo`, che ad esempio disattiva i bottoni di connessione strumenti "già attivo
durante un ciclo" — un ciclo fantasma, chiuso da nessuna parte tranne che nella testa
dell'app, blocca la schermata SUCCESSIVA intera (la scelta degli strumenti per la prossima
seduta), non solo il quadrante di quella appena chiusa.

Aggiunto a `chiudi()`, sullo stesso schema di CONTACT/NULL/MIRROR appena sopra: se TONE era
davvero in corso (`tonePhase==='raise'`) si registra "non concluso" (`tone.chiudiTone(false)`)
prima di azzerarlo — `tonePhase==='done'` è già stato registrato dal bottone "raggiunto",
richiuderlo lo avrebbe duplicato. TRUTH non ha un equivalente per un R/I abbandonato a metà —
`truth.resetTruth()` (la stessa via di ANNULER) è quella giusta: nessun R/I fu davvero
risolto, non c'è nulla di vero da registrare. Azzerato anche `procedimentoAttivo` (un
Procedimento COMANDI aperto), stessa famiglia di bug.

Verificato dal vivo (BASIC, FR, 1440×900): TONE armato → "DIS LA RÉSISTANCE" (resistenza mai
data) → FERMER LA SÉANCE diretto, senza ANNULER prima → lo schermo torna ESATTAMENTE allo
stato iniziale (OUVRIR UNE SÉANCE + il grande PLAY pulsante "Appuyez sur START"), nessuna
traccia di TONE; il selettore strumenti in alto si espande e i tre bottoni MUSE/METER/SANS
INSTRUMENTS sono di nuovo cliccabili — il sintomo esatto segnalato, confermato risolto.

`tsc --noEmit` pulito, `vitest run` 652/652, `npm run lint` 325 warning (nessuno nuovo).
`git status`: solo `src/serenity/Serenity.tsx` (SERENITY, nessun file condiviso).

## Giro — 2026-08-31 (11) — secondo screenshot per "cinq-méthodes"

**« Dans le guide ajoute un deuxième picture pour cinq-methodes »**

Aggiunto un secondo `<div class="shot">` al capitolo 4 ("Les 5 méthodes"), subito dopo il
primo — `cinq-methodes-2.png`, a complemento di `cinq-methodes.png` ("i 5 cerchi, armati e a
riposo"): questo mostra un ciclo armato IN CORSO (es. TONE con "portalo a tono 40"/"tono 40
raggiunto"), la controparte naturale del primo scatto statico. `VERSIONE` del manuale portata
a 3.0.178 (la prossima build SERENITY).

Nessun file del repository toccato — solo il manuale esterno
(`~/Downloads/Guide Static Meter/SERENITY-manuale.html`).

## Giro — 2026-08-31 (12) — correzioni al manuale: Journal senza bottone, PROCESSUS vs COMMANDS

**« Change, car ceci est faux » — capitolo 6 "Journal"**

Il capitolo diceva: « Le bouton 📖 dans la barre du haut ouvre/ferme un panneau ». Falso —
verificato nel codice: non esiste più nessun bottone dedicato nella barra in alto per il
Journal (un giro passato, non di questa sessione, l'aveva tolto: « i moduli ASSESSMENT,
System Health, Journal, MNA non devono avere bottoni, si attivano solamente via CONFIG » —
`moduleVis.journal`, spuntabile SOLO dal pannello CONFIG, voce "Journal de session"/"Diario di
sessione"). Riscritto: si mostra da CONFIG, si richiude con la crocetta × in alto sul
pannello stesso (la stessa voce in CONFIG si spunta via) — non un bottone a sé. Confermato
invece corretto il resto (solo Aud/PC, reazione inline sulla parola, non righe NEEDLE/SYS a
parte).

**« Tu dois aussi indiquer la différence entre PROCESSUS et COMMANDS » — capitolo 7**

Il capitolo trattava i due come sinonimi ("Processus (commandes)"). Sono due bottoni DISTINTI
(v. il giro "COMMANDS solo comandi" di qualche giorno fa): **Processus** (barra in alto) apre
l'archivio PDF INTERO (tag, zona di aggiunta, più la card procedimenti in cima); **COMMANDS**
(accanto a EP, sotto il quadrante) apre SOLO quella card — nessun PDF, nessun tag, nessuna
zona di aggiunta. Titolo del capitolo cambiato in "7. Processus et COMMANDS", nuova nota
esplicita in cima al capitolo con la distinzione, aggiornati TOC e nota di pianificazione
interna. `VERSIONE` del manuale portata a 3.0.180.

Verificato il bilanciamento dei tag HTML (`h2`/`p`/`div`/`span`/`ol`/`li`) dopo entrambe le
modifiche — tutto pari. Nessun file di codice toccato — solo il manuale esterno.

## Giro — 2026-08-31 (13) — chiarito: il PDF non appare mai in SERENITY, solo in Historique

**« Le pdf de fin séance n'apparait plus dans SERENITY, corrige le guide »**

Verificato dal vivo PRIMA di toccare il manuale (per non correggerlo a descrivere un bug che
non c'è, o peggio nascondere un bug vero): aperta una seduta, armato TONE, chiuso DIRETTAMENTE
senza completarlo (lo scenario esatto del giro precedente) — nessun errore in console, il PDF
appare correttamente in Historique ("2 sessions · 2 PDF", pulsante "+ PDF" attivo). La
correzione di `chiudi()` del giro precedente non ha rotto nulla.

Il capitolo 8 diceva già che il PDF va in Historique, ma non abbastanza chiaramente: non è mai
stato previsto che il PDF appaia dentro SERENITY stessa (scelta esplicita di un giro molto
precedente: « vorrei che il Report post session non ci sia più in Serenity, solo il PDF in
History »). Aggiunta una nota "warn" inequivocabile: **il PDF non appare MAI in SERENITY** —
nessuna finestra di rapporto, nessuna anteprima, niente a schermo al momento di chiudere — va
sempre e solo cercato in Historique (View/PDF). `VERSIONE` del manuale portata a 3.0.181.

Verificato il bilanciamento dei tag HTML dopo la modifica — tutto pari. Nessun file di codice
toccato — solo il manuale esterno.

## Giro — 2026-09-01 (14) — SANS INSTRUMENT: écrire l'item dans le cycle, + capitolo COMMANDS

**« Dans SANS INSTRUMENT il faut avoir la possibilité d'écrire l'item dans les Cycles, comme
quand on a les instruments »**

Vero — l'overlay grande senza strumenti (`Serenity.tsx`, il blocco `senzaMisura && aperta`) non
montava mai `PistaCiclo` (niente arco da affiancare), quindi l'unico modo di dare un item era
la voce, o il campo separato "R&I · Manuel"/ASSESSMENT — un passaggio più lontano dell'`<input>`
già presente, con strumenti, proprio nel testo che si sta leggendo.

Estratto il primo blocco di `PistaCiclo` (`<input>` + « dì l'item…/l'ho detta ») in un
componente a sé, [`ItemDaScrivere.tsx`](../src/serenity/ItemDaScrivere.tsx) — stessa logica
(`diItem`, il testo "dì l'item…"/"la resistenza…" in TONE, il calcolo della larghezza),
montato ora in DUE posti invece di uno: dentro `PistaCiclo` (invariato, con strumenti) e
nell'overlay senza strumenti (nuovo, prop `grande` per il testo più grande già usato lì).
`setItem`/`item` restano gli stessi di `Serenity.tsx` — scriverlo vale quanto dirlo a voce, il
motore (`useContactNullCycle`/`useMirrorCycle`/`useToneCycle`) legge la stessa variabile
qualunque sia la sua origine.

Verificato dal vivo (profilo Test, SOLO, BASIQUE, senza strumenti): armato CONTACT →
"DIS L'ITEM" mostra l'`<input>`, scritto "la peur du noir", cliccato "l'item a été dit" → il
ciclo avanza a "DEMANDE UN MOCK-UP" con l'item scritto in cima, esattamente come con
strumenti. Riprovato con TONE: "DIS LA RÉSISTANCE" mostra il testo giusto ("dis la
résistance…"/"je l'ai dite"), scritta la resistenza, dichiarata detta → la schermata dedicata
"choisis le ton" del giro precedente appare regolarmente dopo. Nessuna regressione nel flusso
con strumenti (`PistaCiclo` invariato).

**« Ajoute une vue explications (si pas fait) pour les COMMANDS et comment cela fonctionne »**

Il post-it in-app (`data-help` sul bottone COMMANDS) esiste già. Nel manuale, il capitolo 7
("Processus et COMMANDS") aveva già una nota che li distingue, ma trattava ancora COMMANDS
come una variante minore del flusso Processus (stessa lista numerata, "bouton FERMER"). Falso —
COMMANDS non apre nessun pannello a parte: le sue commande sostituiscono DIRETTAMENTE le
indicazioni del ciclo, nello stesso spazio, e si chiude con la crocetta × sulla card, non un
bottone FERMER (verificato in `PistaProcedimento.tsx`, `titoloChiudi`/`onChiudi`). Riscritto il
capitolo in due liste numerate distinte e etichettate — "Processus — l'archive PDF" (invariata)
e "COMMANDS — les procédés prêts à suivre" (nuova, tre passi + nota sul fichier .txt, pas de
PDF) — con una nota "info" che précise qu'aucun PDF n'existe côté COMMANDS. `VERSIONE` del
manuale portata a 3.0.182.

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.
Verificato il bilanciamento dei tag HTML del manuale dopo la modifica — tutto pari.

File toccati: [`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx),
[`src/serenity/PistaCiclo.tsx`](../src/serenity/PistaCiclo.tsx),
[`src/serenity/ItemDaScrivere.tsx`](../src/serenity/ItemDaScrivere.tsx) (nuovo) — solo SERENITY,
nessun file condiviso con EQUILIBRIUM. Più il manuale esterno.

## Giro — 2026-09-01 (15) — spazio per lo screenshot di COMMANDS in fondo al capitolo 7

**« aggiungi un posto per la immagine dei comandi (fine punto 7) »**

Il capitolo 7 aveva già uno slot screenshot per Processus (`processus.png`, il pannello con
bottone FERMER) ma nessuno per il nuovo blocco "COMMANDS — les procédés prêts à suivre" appena
scritto. Aggiunto un secondo `.shot` in fondo al capitolo (dopo la nota "info" sul file .txt,
prima del capitolo 8): `commands.png`, con la stessa didascalia nelle tre lingue — un
procedimento caricato nello spazio del ciclo, crocetta × visibile. `VERSIONE` del manuale
portata a 3.0.183.

Verificato il bilanciamento dei tag HTML dopo la modifica — tutto pari. Nessun file di codice
toccato — solo il manuale esterno.

## Giro — 2026-09-01 (16) — comment connecter MUSE et METER, interface propre du Theta‑Meter non utilisée

**« Tu dois ajouter une indication de liaison pour MUSE et THETA METER, en expliquant que
l'interface du Theta Meter est volontairement non utilisée »**

Il capitolo 2 elencava il bottone MUSE/METER/SENZA STRUMENTI ma senza dire COME si collega
davvero ciascuno strumento. Verificato nel codice (`Serenity.tsx`, i tre bottoni della pillola
strumenti; `useThetaMeter`/`thetaMeterHid.ts`) prima di scrivere: MUSE si collega cliccando
l'icona cuffie (apre il pop-up di associazione Bluetooth del sistema/browser), METER cliccando
l'icona quadrante (apre il selettore USB/WebHID del sistema/browser). Aggiunta una nota "info"
dopo la tabella del capitolo 2 con questi due gesti, ed esplicitato il punto chiesto: **il
Theta-Meter viene letto SOLO come segnale elettrico grezzo via USB (WebHID)** — SERENITY
disegna il proprio ago con la propria taratura TA, l'interfaccia/schermo/software propri
dell'apparecchio (o un eventuale programma del produttore aperto in parallelo) non sono mai
letti né necessari, per scelta (v. il commento storico in `thetaMeterHid.ts`: « il programma
Theta-Meter e EQUILIBRIUM possono leggere il dispositivo nello stesso momento » — SERENITY non
dipende in alcun modo da quel programma).

**Bonus, trovato per strada**: la tabella del capitolo 2 elencava ancora un bottone « 📖
Journal » che apre/chiude un pannello nella barra in alto — falso, corretto nel capitolo 6 di
un giro precedente (nessun bottone dedicato, si mostra solo da CONFIG) ma rimasto, per
dimenticanza, in questa tabella. Riga rimossa.

`VERSIONE` del manuale portata a 3.0.184. Verificato il bilanciamento dei tag HTML (inclusa la
`<table>`) dopo la modifica — tutto pari. Nessun file di codice toccato — solo il manuale
esterno.

## Giro — 2026-09-01 (17) — TONE: trasparenza fonte/margine, sciogliere un pavimento falso, pulizia

**« vai con rapide e medie »** — seguito alla revisione critica dei calcoli TONE (vedi l'artefatto
pubblicato nello stesso scambio): quattro correzioni "rapide" più una "media", le sole
implementabili subito — le altre (tarare le costanti sul CORPUS, ripensare la normalizzazione
MUSE) restano per il giro "architetturale", dopo una seduta vera.

**1 — nessuna indicazione di quale strumento guida il numero.** Con MUSE connesso, `toneOra`
è SEMPRE guidato da lui (v. `useToneCycle.ts`, la priorità delle fonti) — ma nulla lo diceva.
Aggiunto `toneSource` (`'meter' | 'muse' | 'assessed'`, additivo, stesse tre condizioni di
`toneOraGrezzo`) al ritorno di `useToneCycle`, mostrato in SERENITY come una piccola etichetta
"fonte · MUSE/METER/dichiarato" accanto alla colonna del tono.

**2 — il margine delle lattine (`margineTono`) è calcolato ma non c'è modo di agire su di
esso in SERENITY.** Verificato: EQUILIBRIUM ha già questo bottone (`App.tsx`, riga ~5540 —
« è lì che interessa », richiesta utente di un giro passato) — SERENITY non l'aveva mai
riprodotto. Aggiunto lo stesso bottone "−N · rifai la prova delle lattine" (stessa condizione
`margineTono > 0`), che ora riapre `PannelloMeter` direttamente sul passo "stretta" (nuovo prop
additivo `passoIniziale`, invece del default "quante lattine").

*Nota di correzione rispetto alla revisione precedente*: avevo scritto che il prop `margin` di
`ToneColumn` fosse "calcolato, passato, e mai mostrato" come se fosse un bug — falso, verificato
dopo: è una scelta deliberata di un giro passato (« il margine sta QUI e non sotto la colonna del
tono — richiesta utente »), il margine si mostra apposta ALTROVE (accanto al numero che corregge).
Il vero problema era che SERENITY non aveva mai portato quell'"altrove" dentro di sé.

**3 — il ratchet "solo salire" non si poteva correggere durante la salita.** Un colpo isolato
(un movimento del corpo, un cavo) che regge per caso `TONE_HOLD_S` (0,15s) diventava un
pavimento garantito per il resto della resistenza, senza modo di disfarlo se non annullando
tutto. Aggiunta `sciogliPavimento()` (additiva, in `useToneCycle.ts`: azzera SOLO
`toneHighRef`/`toneCandidateRef`, non `toneAtStart` — a differenza di `correggiToneAtStart`,
che azzera lo stesso ratchet ma cambiando anche l'origine) più `tonePavimentoAttivo` (per
mostrare il bottone SOLO quando c'è davvero un pavimento da sciogliere). Bottone "era un colpo
isolato" nella barra dei comandi TONE, visibile solo con uno strumento vero (`!senzaMisura`:
senza, nulla muove il numero, il ratchet non entra mai in gioco).

**4 — codice morto che può trarre in inganno.** `toneFromOhm` (alias di `toneFromResistance`,
in `toneScale.ts`) non aveva NESSUN chiamante in nessuno dei due programmi — verificato con una
ricerca sul deposito. Rimosso l'alias (non la funzione sottostante, che resta in
`impedanceMeter.ts`, testata e viva per il CAN METER a resistenza diretta).

**Media — trasparenza sull'estrapolazione della taratura TA.** I 4 punti di fabbrica
(2,034–5,041) non coprono l'intera scala (0–6,5): fuori da quel range, `taFromRaw` prolunga
l'ultimo segmento invece di interpolare fra due punti veri. Aggiunto un avviso "fuori dai punti
tarati" quando `theta.rawSmooth` esce dai valori misurati (calcolato lato SERENITY da
`theta.taScale.points`, nessuna modifica al motore — l'informazione era già tutta lì, solo mai
confrontata). *Scartata* invece la proposta di rendere `toneMargin` graduale (più giorni senza
prova → più margine): trovato, leggendo `canTest.ts`, che è già stato deciso il contrario, con
una ragione esplicita (« fingere di saper misurare l'incertezza in funzione del tempo sarebbe
inventare una curva che nessuno ha osservato ») — la stessa disciplina epistemica che la
revisione chiedeva di applicare altrove. Corretto qui invece di ignorare la nota.

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.
Verificato dal vivo (profilo TEST, SOLO, BASIC, senza strumenti — l'unico banco di prova
disponibile senza hardware reale): il ciclo TONE senza strumenti resta bit-per-bit identico a
prima (nessuno dei nuovi elementi appare, tutti correttamente condizionati a `!senzaMisura`/uno
strumento vero), nessun errore in console, nessuna regressione.

File toccati — CONDIVISI (richiedono build e invio di ENTRAMBI i DMG):
[`src/engine/toneScale.ts`](../src/engine/toneScale.ts),
[`src/session/useToneCycle.ts`](../src/session/useToneCycle.ts) — additivi, zero comportamento
esistente cambiato per EQUILIBRIUM (nessun campo nuovo letto dai suoi chiamanti). SERENITY-only:
[`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx),
[`src/serenity/PannelloMeter.tsx`](../src/serenity/PannelloMeter.tsx).

## Giro — 2026-09-02 (18) — TONE: tre bug veri trovati dal vivo, dopo il giro precedente

Segnalati con uno screenshot da una seduta vera (la prima volta in questa sessione con MUSE e
METER davvero collegati) — tre problemi distinti, tutti verificati e corretti uno per uno.

**1 — le "scritte parasite" in alto sulla scala del tono.** Il pannello fonte/margine
(giro precedente) usava `top:'15%'` credendo di essere relativo al riquadro della colonna
(460px, vicino a lei) — era relativo allo SCHERMO INTERO (`<div style={{position:'absolute',
inset:0}}>`, il contenitore che avvolge ToneDial/MirrorDial/ClearDial), quindi cadeva
nell'angolo in alto a sinistra, sopra NEEDLE LIGHT/WITH-WITHOUT NEEDLE — testo sovrapposto,
illeggibile. Il riquadro della colonna è diventato `flexDirection:'column'`: il pannello
fonte/margine ora ne è la PRIMA riga, dentro le sue stesse coordinate, mai vicino all'angolo.

**2 — « ho lo spazio per scrivere l'item ma non accetta di scrivere ».** Il bug più serio,
trovato solo grazie al DOM (non bastava leggere il sorgente): l'overlay senza strumenti
(`senzaMisura && aperta`) ha un contenitore con `pointerEvents: mostraBriefingIniziale ?
'auto' : 'none'` — acceso SOLO durante il briefing "INIZIO SESSIONE", spento in ogni altro
stato, "ciclo in corso" compreso. Il `<select>` del tono e "ANNULLA" avevano già il proprio
`pointerEvents:'auto'` scritto a mano; `ItemDaScrivere` (l'`<input>` dell'item/resistenza),
estratto da `PistaCiclo` — dove questo antenato non esiste — no. Verificato con
`elementFromPoint`: un click sull'input arrivava a un `<div>` decorativo del quadrante
sottostante, mai all'`<input>` (`document.activeElement` restava `<body>`). `form_input`
(usato nei giri precedenti per "digitare" nei test) scrive il valore DOM senza passare dal
vero hit-test del mouse — non mostrava mai il problema, da cui il falso "funziona" di prima.
Aggiunto `pointerEvents:'auto'` sul contenitore di `ItemDaScrivere` stesso: innocuo nell'altro
punto di montaggio (`PistaCiclo`), dove è già il valore di default.

**3 — « quando dò un'altra resistenza, mi dice di dare l'item... ma non si può scrivere e
l'assessment non è armato, si resta bloccati ».** Due cause, trovate una dopo l'altra dal
vivo:
- Il click sul cerchio TONE arma E localizza nello stesso gesto (`tone.localizzaTone()`,
  scelta esplicita di un giro precedente: « ENLEVE LE [il vecchio bottone "DAI L'ITEM"] »)
  — ma "altra resistenza" chiamava solo `resetTone()`, mai `localizzaTone()`: il ciclo restava
  fermo in `tonePhase==='locate'` (`faseCiclo==='tone.item'`), una fase che `ItemDaScrivere`
  non riconosce (il suo elenco `diItem` si ferma a `'tone.say_item'`) — nessun bottone di
  conferma, bloccato per davvero. Corretto richiamando `localizzaTone()` anche qui, come fa
  il cerchio.
- Con la sola correzione sopra, verificato dal vivo un SECONDO bug: si saltava dritti alla
  schermata "A CHE TONO SI TROVA?" con la resistenza VECCHIA, mai passando per "dì la
  resistenza". Causa: `itemConfirmedRef` (un flag "sticky", vero una volta per tutto il
  ciclo) resta vero dalla resistenza appena chiusa; si azzera da sé in un `useEffect` che
  osserva `item` — ma quello stesso effetto richiama anche `setItemDigitando(false)`, già
  falso a quel punto: React non ridisegna per uno stato invariato, quindi l'azzeramento del
  ref non arriva a un nuovo render finché qualcos'altro, per tutt'altra ragione, non ne forza
  uno — cosa che senza strumenti può non succedere mai. `itemNamed` restava quindi vero nello
  STESSO render in cui `resetTone()` svuota l'item, e `deriveCyclePhase` saltava dritto a
  `'tone.raise'`. Corretto azzerando `itemConfirmedRef.current` a mano, PRIMA di chiamare
  `resetTone()`/`localizzaTone()`.

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.
Verificato dal vivo con DIGITAZIONE REALE (click + tasti, non `form_input` — la lezione del
punto 2) l'intero ciclo TONE senza strumenti per DUE resistenze di fila: prima resistenza
("colère") scritta e dichiarata, tono scelto (-30), raggiunto; "altra resistenza" →
correttamente "DIS LA RÉSISTANCE" (non più il salto), seconda resistenza ("honte") scritta
con tastiera reale e dichiarata, schermata di scelta del tono di nuovo corretta.

File toccati — SOLO SERENITY (nessun file condiviso in questo giro):
[`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx),
[`src/serenity/ItemDaScrivere.tsx`](../src/serenity/ItemDaScrivere.tsx).

## Giro — 2026-09-02 (19) — TONE: +40 alla fine, reset neutro, scala scorrevole; Assessment verificato; PDF compresso

**1 — « quando si ottiene TONO 40, muovi la scala per indicare TONO 40, e quando si fa altra
resistenza, devi ripristinare la scala del tono al valore neutro di inizio ciclo ».**
Senza strumenti `tone.toneOra` non si muove mai da solo — resta fermo al valore scelto per
tutta la salita, anche dopo "tono quaranta raggiunto" (`chiudiTone(true)` logga il traguardo,
non tocca `toneAtStart`). Corretto: nel riferimento visivo (`ToneColumn`, terzo punto di
montaggio, solo senza strumenti) il valore mostrato è ora `tone.tonePhase === 'done' ? 40 :
tone.toneOra` — a `tone.done` la scala salta a +40, non resta al valore di partenza
dimenticato lì. E "altra resistenza": oltre alle due correzioni del giro precedente
(`localizzaTone()`, `itemConfirmedRef`), aggiunto `tone.setToneAssessed(0);
tone.correggiToneAtStart(0);` — la scala riparte dal neutro (0 · Mort du corps), non dall'ultima
scelta della resistenza appena chiusa.

**2 — « la scala deve essere possibile scroll, poiché l'auditor potrebbe aver bisogno di dare
i valori ed i nomi dei diversi toni al PC ».** `ToneColumn` (condivisa con EQUILIBRIUM, non
toccata) disegna apposta solo i TREDICI nomi di `TONE_LABELS`, su un `<svg>` che si RIDIMENSIONA
per stare nello spazio dato — niente scroll, niente altri quarantanove nomi. Nuovo componente
SOLO SERENITY, [`ScalaTonoCompleta.tsx`](../src/serenity/ScalaTonoCompleta.tsx): la stessa
lista di 62 livelli già usata dal `<select>` (`TONE_LEVELS`), in un riquadro scorrevole
(`overflowY:'auto'`, tetto 220px) con la riga più vicina al tono attuale evidenziata e
raggiunta da sola (`scrollIntoView`, `block:'nearest'`) quando il tono cambia. Montata in DUE
punti, entrambi senza strumenti: sotto il `<select>` in "A CHE TONO SI TROVA?", e accanto alla
colonna di riferimento durante "portalo a tono 40"/"raggiunto".

**Verificato (segnalato: « verifica che quando si arma un ciclo, l'assessment sia attivato »)
— confermato funzionante, non un bug.** Dal vivo, per CONTACT e per TONE: l'assessment si
accende correttamente nello stesso istante in cui il ciclo si arma (`useEffect` su `[mode]`,
`setAssessAttivo(mode !== 'free')`). Si spegne di nuovo, da sé, quando si passa dalla fase
"dai l'item" alla fase di lavoro vera (`tone.raise`, `contact.mock_up`…) — comportamento
DELIBERATO di un giro precedente (« deve essere attivato al momento dell'armamento... e alla
fine poi disattivato »), non toccato: cambiarlo avrebbe contraddetto una decisione esplicita
già presa, senza che fosse quello il segnalato.

**3 — « le PDF dans History est très lent à défiler ».** `sessionReport.ts` (il generatore PDF
di SERENITY, non `PostSessionReport.tsx` di EQUILIBRIUM) non incolla immagini — verificato,
zero `addImage` nel file — ma scrive OGNI riga del giornale della seduta: una seduta lunga
vuol dire molte pagine, tutte di testo. `new jsPDF(...)` non aveva `compress: true`: jsPDF
scriveva gli stream di ogni pagina non compressi. Aggiunta l'opzione — nessun cambiamento
visivo, stesso identico PDF, tipicamente dimezzato o più nel peso per un documento fatto quasi
solo di testo ripetuto su tante pagine. Non verificabile la VELOCITÀ in questa sessione (le
sedute di prova sono troppo corte per generare un PDF davvero pesante) — verificato solo che
la generazione resta corretta (PDF creato, "1 PDF" in Storico, si apre senza errori).

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.
Verificato dal vivo (digitazione/selezione reali): TONO 40 raggiunto → scala a +40 evidenziata
in entrambe le viste; "altra resistenza" → scala tornata a 0 · Mort du corps, evidenziata
correttamente nella lista scorrevole; scroll automatico confermato a ogni cambio di tono.

File toccati — SOLO SERENITY (nessun file condiviso in questo giro):
[`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx),
[`src/serenity/ScalaTonoCompleta.tsx`](../src/serenity/ScalaTonoCompleta.tsx) (nuovo),
[`src/serenity/sessionReport.ts`](../src/serenity/sessionReport.ts).

## Giro — 2026-09-02 (20) — TONE: due bug veri (scala doppia, assessment che non si riattiva)

**« TUTTO QUESTO è FATTO? »** — segnalato subito dopo, con forza, che il giro precedente non
andava bene su due punti. Verificato uno per uno: il primo era un vero difetto (introdotto
proprio nel giro precedente), il secondo un bug reale mai risolto perché il tentativo
precedente lo aveva solo "verificato come da design" invece di trovarne la causa vera.

**1 — « non va bene la scala del tono in doppio... hai già il selettore dove fai vedere la
scala, perché devi farne un secondo... NON VOGLIO UNA SECONDA SCALA, è perturbante ».**
Fondato: il giro precedente aveva aggiunto `ScalaTonoCompleta` ACCANTO a `ToneColumn` e al
`<select>` nativo — nella schermata di scelta, TRE rappresentazioni della stessa scala
insieme. Corretto: `ScalaTonoCompleta` ora riceve un prop `onScegli` opzionale — con lui, le
righe diventano bottoni veri (cliccarne una sceglie quel tono) e SOSTITUISCE sia `ToneColumn`
sia il `<select>`, invece di affiancarli; senza (nel riferimento durante "portalo a tono 40"),
resta sola lettura ma SOSTITUISCE comunque `ToneColumn`, mai accanto a lei. Una sola scala, in
ciascuno dei due punti. Rimosso l'import ormai inutile di `TONE_LEVELS`/`levelName` da
`Serenity.tsx` (restava solo dentro `ScalaTonoCompleta.tsx`).

**2 — « non hai risolto il problema dell'assessment che non si attiva quando armi TONE ».**
Aveva ragione, e la mia verifica del giro precedente era incompleta: avevo controllato SOLO il
primo arm (funzionava) senza mai testare una SECONDA resistenza nello stesso ciclo TONE
("altra resistenza"). Causa vera, trovata leggendo `useEffect` per `useEffect`: l'assessment
viveva in DUE effetti separati — uno su `[mode]` che ACCENDEVA solo alle transizioni
libero↔armato, uno su `[faseCiclo, mode]` che SAPEVA SOLO SPEGNERE quando si usciva dalla fase
"dai l'item". "Altra resistenza" non disarma TONE (`mode` resta `'tone'`, non cambia) — quindi
il primo effetto non rifaceva scattare nulla, e il secondo non aveva alcun ramo per
RIACCENDERE quando si rientrava in una fase "dai l'item" restando nello stesso ciclo. Risultato
reale: dopo la prima resistenza, l'assessment restava spento per tutte quelle successive.
Uniti i due effetti in uno solo, simmetrico: fuori da un ciclo → spento; dentro un ciclo, in
fase "dai l'item" → acceso; in qualunque altra fase → spento — scritto ESPLICITAMENTE
(`setAssessAttivo(inFaseItem)`), non più "spegni soltanto".

Verificato dal vivo, passo per passo, con l'intero ciclo: TONE armato (assessment ON) → item
"peur" dato → tono scelto CLICCANDO una riga della scala unica (nessun `<select>` residuo) →
"tono quaranta raggiunto" (assessment OFF, per design, fase non più "dai l'item") → "altra
resistenza" → **assessment di nuovo ON** ("à l'écoute…", non più "capture désactivée") — il
bug è confermato risolto, non solo "verificato come da design" come nel giro precedente.

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.

File toccati — SOLO SERENITY:
[`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx),
[`src/serenity/ScalaTonoCompleta.tsx`](../src/serenity/ScalaTonoCompleta.tsx).

## Giro — 2026-09-02 (21) — TONE: la scala nascondeva i bottoni del ciclo

**« Ora la scala nasconde i bottoni del ciclo TONE »** — segnalato subito dopo il giro
precedente (che aveva reso `ScalaTonoCompleta` l'unica scala, al posto di tre rappresentazioni
insieme). Diventata l'UNICA scala, la sua altezza fissa (300px) andava a sommarsi a titolo,
istruzione/citazione, item e bottoni nello STESSO contenitore a colonna — e quel contenitore
vive in uno spazio ALTO FISSO (~400px, lo spazio vero fra header e riga dei cicli, non l'intera
finestra: verificato che allargare la finestra a 1280×800 non cambiava nulla). Due correzioni,
in sequenza, verificate dal vivo dopo ciascuna:

1. Altezza della scala ridotta (`min(190px, 24vh)`, poi `min(130px, 16vh)` dopo aver visto che
   la schermata "PORTALO A TONO 40" — più affollata di quella di scelta: titolo + citazione +
   comando + item, PRIMA della scala — restava comunque troppo alta anche dopo il primo taglio).
2. Anche dopo il taglio, la schermata "PORTALO A TONO 40" a 1280×800 restava sopra i 400px
   disponibili — non per la finestra (fissa), ma per il TOTALE del contenuto fisso sopra la
   scala. Restringere ancora la scala avrebbe tolto lo scopo per cui esiste (leggere il nome di
   un livello al PC, che richiede vedersi abbastanza). Corretto alla radice: i bottoni del
   ciclo (`{bottoniCiclo}`, `Serenity.tsx`) ora hanno `position:sticky, bottom:0` col fondo del
   riquadro — restano SEMPRE nella parte bassa visibile, qualunque cosa ci sia sopra e quanto
   sia alta; se il contenuto sopra non ci sta, scorre SOLO lui, dietro ai bottoni, mai loro.

Verificato dal vivo, a 1280×800: TONE armato → item dato → cliccata una riga della scala unica
→ schermata "PORTALO A TONO 40" — titolo, citazione, item, la scala (ora scorrevole al suo
interno) E i tre bottoni ("mène-le au ton 40"/"ton quarante atteint"/"ANNULER") tutti visibili
insieme, senza dover scorrere la pagina per trovarli.

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.

File toccati — SOLO SERENITY:
[`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx),
[`src/serenity/ScalaTonoCompleta.tsx`](../src/serenity/ScalaTonoCompleta.tsx).

## Giro — 2026-09-02 (22) — scala: via la scritta doppia, ascensore vero, testo nero leggibile

Tre correzioni distinte su `ScalaTonoCompleta.tsx`, tutte segnalate nello stesso messaggio:

**« togli SCORRI PER VEDERE... perché si sovrappone con la scelta della scala fatta ».**
La scritta era essa stessa `position:sticky, bottom:0` — un SECONDO elemento agganciato in
fondo, proprio sotto `bottoniCiclo` (reso sticky nel giro precedente, stesso motivo). Due
"sticky bottom" annidati finiscono per accavallarsi. Rimossa — resta un `title` sul
contenitore (letto al passaggio del mouse) per chi ha bisogno di saperlo esplicitamente.

**« metti un ascensore laterale, si capisce ».** Al posto della scritta, una vera barra di
scorrimento SEMPRE visibile: `::-webkit-scrollbar` con larghezza e colore propri (classe
`.s-scala-tono-scroll`, definita in un `<style>` scoped dentro il componente — non uno stile
esprimibile dall'attributo `style` di React), invece di lasciare al sistema operativo
(macOS: comparsa solo al passaggio del mouse) l'ultima parola su se e quando mostrarla.

**« il colore giallo non va bene perché non si vede la scritta... devi far passare in NERO
il valore ed il nome del TONO ».** Il testo della riga evidenziata usava `var(--s-disc)` —
verificato in `tokens.css`: è un colore pensato per essere uno SFONDO translucido
(`rgba(...,0.36..0.42)`), non un testo leggibile sopra un colore pieno — quasi invisibile
sopra l'accento (`--s-tone-hue`, un mauve, non davvero giallo, ma lo stesso identico difetto
di contrasto). Cambiato in `#0b0f14`, lo stesso nero già usato altrove in SERENITY per il
testo sopra fondi chiari/accentati (`ToneColumn.tsx`).

Verificato dal vivo (zoom sulla riga "0 · Mort du corps" evidenziata): testo nero, alto
contrasto, perfettamente leggibile; nessuna scritta sovrapposta al bottone sotto; l'ascensore
appare come una sottile barra chiara sul bordo destro della lista.

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.

File toccati — SOLO SERENITY: [`src/serenity/ScalaTonoCompleta.tsx`](../src/serenity/ScalaTonoCompleta.tsx).

## Giro — 2026-09-02 (23) — COMMANDS fuori da Electron (guida), e l'item non scritto in TONE

**« Dans CHROME je ne peux pas ni créer ni accéder au fichiers commands ».** Verificato nel
codice (`src/lib/procedimenti.ts`) prima di scrivere: è un comportamento DELIBERATO, dichiarato
nel commento stesso del file (« FUORI DA ELECTRON NON C'È NULLA, E NON È UN ERRORE ») — COMMANDS
legge/scrive `~/EQUILIBRIUM/COMANDI/Procedimenti` via IPC (`main.cjs`/`preload.cjs`), un canale
che esiste SOLO nell'app Electron installata, mai in una scheda Chrome/browser puntata su un
indirizzo di sviluppo. Non un bug — una nota mancante nel manuale. Aggiunta una nota "warn" nel
capitolo 7, che spiega il perché e cosa aspettarsi (card vuota, "apri cartella" senza effetto)
fuori dall'app installata. `VERSIONE` del manuale portata a 3.0.191.

**« In TONE, quando enunci l'item è preso in considerazione ma non si scrive ».** Bug vero,
trovato leggendo `resetTone()`/`localizzaTone()` riga per riga: "altra resistenza" chiama
`resetTone()` (svuota l'item con uno STATE React, quindi asincrono) e SUBITO DOPO, nello stesso
gesto sincrono, `localizzaTone()` — che leggeva `d.auditingQuestion` dalla propria CHIUSURA,
ancora quella di PRIMA del reset (React non ha ancora ridisegnato). Con un item non vuoto
rimasto dall'ultima resistenza, `toneAwaitItemRef.current` risultava FALSO invece di VERO —
l'effetto che scrive la parola detta a voce dentro `item` (`Serenity.tsx`, l'`useEffect` sul
giornale) non scattava mai: la voce restava sentita/registrata nel giornale ma mai copiata nel
campo. Il primo arm (item già vuoto per davvero) non ne soffriva — da qui il bug visibile solo
dalla seconda resistenza in poi, esattamente come descritto.

Corretto in `useToneCycle.ts`: `localizzaTone` accetta ora `{ appenaResettato?: boolean }` —
"altra resistenza" lo passa `true`, scavalcando la chiusura invece di fidarsene. ⚠️ Non un
booleano posizionale: `App.tsx` monta questa stessa funzione con `onClick={localizzaTone}`
(nessun wrapper) — un booleano posizionale sarebbe risultato VERO su OGNI click (l'evento del
click, sempre "presente"), rompendo silenziosamente EQUILIBRIUM. Un oggetto `{appenaResettato}`
non condivide proprietà con un `MouseEvent`: TypeScript stesso l'ha segnalato in compilazione
("nessuna proprietà in comune"), da cui un piccolo tocco NECESSARIO a `App.tsx` — avvolto
`onClick={localizzaTone}` in `onClick={() => localizzaTone()}`, comportamento invariato
(nessun argomento passato, `appenaResettato` resta il suo default `false`).

Verificato dal vivo (senza microfono reale non simulabile qui) il percorso adiacente non
regredito: TONE, item digitato a mano, tono scelto, tono 40 raggiunto, "altra resistenza",
seconda resistenza digitata a mano — tutto funziona come prima, nessun errore in console.

`tsc --noEmit` pulito, `npm run lint` invariato (325 warning), `npx vitest run` 652/652 verdi.

File toccati — CONDIVISI (richiedono build e invio di ENTRAMBI i DMG):
[`src/session/useToneCycle.ts`](../src/session/useToneCycle.ts),
[`src/App.tsx`](../src/App.tsx) (solo il wrapper dell'`onClick`, comportamento invariato).
SERENITY-only: [`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx).
Più il manuale esterno (COMMANDS/Electron).

## Giro — 2026-09-03 (23) — DIZIONARIO TECNICO, nuovo bottone accanto a COMMANDS

**« Si potrebbe integrare il dizionario tecnico? »** — due fonti, entrambe FUORI dal deposito:
il "Dizionario Tecnico" italiano completo (808 pagine, PDF di New Era Publications, copyright
attivo) e un "Technical Dictionary" inglese ("fair use quotes", non il libro intero — 11 file
`.htm` FrontPage 4.0). **Copyright chiarito dall'utente prima di procedere**: per ora la
distribuzione resta a due persone, per il collaudo — la distribuzione più ampia resta da
decidere più avanti, non è compito di questo componente deciderlo.

**Estrazione (due script Python, fuori dal deposito — il libro non cambia, non serve rifarla
a ogni build come la guida):**
- **PDF italiano** — sorpresa buona: `pypdf` estrae un testo VERO e pulito, non è una
  scansione, nessun OCR necessario. Corpo alfabetico verificato pagina per pagina: PDF 11-631
  (pagine stampate 1-630; la 632 è la Scala del Tono, non un termine). Voci riconosciute da un
  termine tutto maiuscolo a inizio riga (spesso già con l'equivalente inglese: "ATTUABILITÀ -
  WORKABILITY"), seguito da virgola. Due bug di sillabazione trovati e corretti verificando i
  conteggi (non a occhio): un tentativo di distinguere "sillabazione vera" da "trattino di
  traduzione a fine riga" guardando maiuscola/minuscola sembrava giusto ma peggiorava le cose
  (286 sillabazioni vere rotte per guarire un solo caso raro) — tornato a ricongiungere
  sempre. **2408 voci finali** (uniti gli omografi — "ACCERTAMENTO" compariva più volte per
  intestazioni con una virgola al loro interno, es. "ACCERTAMENTO, METODO 1").
- **HTML inglese** — il primo tentativo (ancorato al tag `<b>`/`<a name>` esatto) trovava solo
  109 voci in tutto: HTML scritto a mano, tag non bilanciati un-per-voce. Stessa idea del PDF
  invece: `<br>` diventa "a capo" vero, si tolgono gli altri tag, si cerca lo stesso schema
  (MAIUSCOLO a inizio riga + virgola). **2541 voci finali.**

**L'interfaccia — segnalato: « un bottone come comands e processus sarebbe l'ideale »,
poi: « si possa far apparire sia la lista delle parole, sia un campo ricerca. Per l'italiano,
la ricerca deve potersi fare sia in italiano che con la parola corrispondente in inglese ».**
Nuovo bottone "DIZIONARIO" (icona `Search`), stessa forma esatta di COMMANDS — cerchio 54px,
etichetta sotto — nel nuovo [`DizionarioModal.tsx`](../src/serenity/DizionarioModal.tsx): due
schede (Italiano/Inglese, l'italiano di default), elenco completo cliccabile (si espande per
leggere la definizione), campo di ricerca che confronta la parola digitata sia col termine
italiano sia col suo `termine_en` incrociato — non solo col termine mostrato. I due JSON
(906 KB + 1,18 MB) vivono in `public/dizionario/`, caricati SOLO all'apertura del pannello
(mai al primo avvio di SERENITY, per non pesare su chi il dizionario non lo apre mai).

**Due bug trovati dal vivo, entrambi corretti prima di spedire:**
1. Il titolo "DIZIONARIO TECNICO" si sovrapponeva, illeggibile, all'intestazione vera di
   SERENITY dietro di lui. Non era la trasparenza dello sfondo (`rgba(0,0,0,0.72)`, la stessa
   già in uso per il visore PDF) — il montaggio viveva DENTRO `.ser-comandi`
   (`zIndex:8`, il contenitore del bottone che lo apre): un `position:fixed, zIndex:200`
   DENTRO un contenitore con `zIndex` più basso di `<header>` (`zIndex:10`) non vince mai
   contro di lui — lo z-index conta solo dentro il proprio contesto di impilamento, non può
   scavalcare quello del genitore. Spostato fratello di `<header>`, accanto agli altri modali
   (`historyAperto`/`processusAperto`) — lì il suo `zIndex:200` fa davvero da solo.
2. (minore, tenuto comunque) sfondo alzato a `rgba(6,9,13,0.95)`, quasi opaco.

Verificato dal vivo l'intero percorso: bottone DIZIONARIO accanto a COMMANDS, pannello leggibile
senza sovrapposizioni, "2408/2408 entrées", ricerca di "workability" (inglese) trova
"ATTUABILITÀ - WORKABILITY" nella scheda Italiano, click espande la definizione vera del
libro; scheda Inglese, stessa ricerca, trova "WORKABILITY" (2541 entrées).

`tsc --noEmit` pulito, `npm run lint` invariato (324 warning), `npx vitest run` 652/652 verdi.

File toccati — SOLO SERENITY: [`src/serenity/Serenity.tsx`](../src/serenity/Serenity.tsx),
[`src/serenity/DizionarioModal.tsx`](../src/serenity/DizionarioModal.tsx) (nuovo),
`public/dizionario/dizionario-it.json`, `public/dizionario/dizionario-en.json` (nuovi, dati
statici — nessun file di codice condiviso con EQUILIBRIUM).

## Giro — 2026-09-03 (24) — DIZIONARIO: inglese di default, ricerca per lettera, e la
## correzione grossa dell'estrazione italiana

**Due richieste piccole, poi una segnalazione grossa mentre erano ancora in corso.**
« Metti inglese per default » — la scheda che si vede aprendo il pannello ora è INGLESE
(prima Italiano); la ricerca bilingue (l'italiano che confronta anche `termine_en`) resta
identica su entrambe le schede, cambia solo quale si vede per prima. « Puoi mettere una
ricerca anche via lettera dell'alfabeto » — riga di 26 bottoni A-Z sotto il campo di testo,
alternativa al campo (non insieme: scegliere una lettera svuota il testo digitato e
viceversa, per non produrre un filtro doppio poco prevedibile); le lettere senza nessuna
voce nell'elenco corrente restano visibili ma spente, per coerenza visiva dell'alfabeto
intero. Cambiare scheda (Italiano/Inglese) azzera anche la lettera scelta, non solo la voce
espansa — altrimenti restava evidenziata una lettera "0 entrées" nella lingua appena aperta.

**Segnalato mentre erano in corso: « in light il dizionario, le definizioni non sono molto
visibili ».** Riprodotto dal vivo: lo sfondo esterno del pannello era un nero LETTERALE
(`rgba(6,9,13,0.95)`) fisso in ENTRAMBI i temi — copiato dal visore PDF quando si era corretto
(giro 23) il titolo che si sovrapponeva all'intestazione, ma il visore PDF resta scuro APPOSTA
in ogni tema (uno strumento, come `--tr-bg`/`--s-instrument-bg` — v. `tokens.css`); questo
pannello invece è testo normale, doveva seguire il tema come tutto il resto di SERENITY. In
chiaro il vetro semitrasparente del riquadro (`--s-disc`) galleggiava su quel nero fisso, e le
definizioni (`--s-ink-soft`, SCURO in tema chiaro per leggersi sul perla vero) sparivano sopra.
Sostituito con `color-mix(in srgb, var(--s-ground) 96%, transparent)` — segue il tema da solo.
Stessa correzione per il titolo (`#fff` fisso → `var(--s-ink)`), la pillola di lingua e il
bottone chiudi (bianco/nero fissi → `var(--s-ink)`/`var(--s-disc-sunk)`/`var(--s-ink-ghost)`).

**Segnalato SUBITO DOPO, con un esempio preciso: « hai sbagliato ad importare il dizionario
ITALIANO... in cima ad ogni pagina è riprodotto il titolo della definizione che si sta
spiegando... la B maiuscola è la continuazione del testo della pagina 2. CORREGGI ».**
Riprodotto e confermato: il PDF stampa un titolo corrente (il "guide word" da dizionario
cartaceo) in cima a OGNI pagina — lo script del giro 23 (`estrai_pdf.py`) lo trattava come
testo normale, incollandolo dentro la definizione ancora aperta al cambio pagina. Ricostruita
l'estrazione (`estrai_pdf_v2.py`, fuori dal deposito): `pdfplumber` invece del solo `pypdf`,
per sapere DOVE sta il testo sulla pagina — il titolo corrente sta sempre più in alto (`top` <
65pt) del corpo (sempre `top` >= 81pt), indipendentemente dal font (di norma 12pt contro
l'11pt del corpo, ma non sempre: la posizione è l'unico segnale affidabile su tutte le 621
pagine verificate). Tre difetti IMPARENTATI scoperti verificando la correzione dal vivo, non
a occhio:
1. un capolettera decorativo a inizio di ogni sezione alfabetica (23 pagine) — stesso rischio
   di fondersi col termine vero della riga dopo, tolto per essere una riga isolata di una
   sola lettera;
2. i termini che vanno a capo PRIMA della virgola che apre la definizione — creavano una voce
   fantasma col nome sbagliato (l'ultima parola della traduzione inglese invece del vero
   termine italiano: "ABERRAZIONE AMBIENTALE" spariva a favore di una voce "ABERRATION" con la
   definizione giusta ma il nome sbagliato). Corretto ammettendo l'"a capo" dentro alle classi
   di caratteri del termine/traduzione (pigro come prima, si ferma alla prima virgola vera);
3. un trattino SENZA spazi dentro al termine o alla traduzione stessa ("MID-INTEGRITY",
   "THEETIE-WEETIE") che la correzione (2) da sola non copriva ancora, fermando l'abbinamento
   a metà parola esattamente come prima.

Una quarta ipotesi (ammettere anche le parentesi, per voci come "AMMINISTRAZIONE (ADMIN)") è
stata provata e tolta di nuovo verificando i conteggi: recuperava 9 voci ma ne rompeva 12
altre (un riferimento bibliografico a fine voce precedente che va a capo da solo, "...III)",
è anch'esso maiuscolo+parentesi a inizio riga — l'abbinamento successivo partiva da lì invece
che dalla vera voce dopo). Il costo superava il beneficio, tolta — resta un'imperfezione nota,
come il trattino di traduzione più raro già documentato nel giro 23.

**2408 → 2624 voci italiane.** Verificato con un campione casuale di voci comuni fra la
versione vecchia e la nuova (nessuna regressione sul contenuto già corretto) e con una
ricerca mirata sulle stesse voci citate dall'utente e trovate durante la correzione:
"ABERRAZIONE AMBIENTALE" e "CASO THEETIE-WEETIE"/"THEETIE-WEETIE" ora esistono come voci
separate, col nome giusto. Il dizionario inglese (`-en`, fonte HTML senza pagine stampate)
non ha questo difetto — non toccato.

Verificato dal vivo: scheda ANGLAIS selezionata di default all'apertura (2541 entrées);
lettera "X" cliccata mostra "3/2541 entrées" (X, X 1, X 2), cambio scheda verso ITALIEN
azzera la lettera (2408/2408 — verificato PRIMA della correzione dell'estrazione, poi
2624/2624 dopo); ricerca "aberrazione ambientale" trova la voce giusta con definizione
leggibile su fondo chiaro vero; ricerca "theetie-weetie" trova le due voci separate.

`tsc --noEmit` pulito, `npm run lint` invariato (324 warning), `npx vitest run` 652/652 verdi.

File toccati — SOLO SERENITY: [`src/serenity/DizionarioModal.tsx`](../src/serenity/DizionarioModal.tsx)
(scheda di default, ricerca per lettera, temi), `public/dizionario/dizionario-it.json`
(dato statico rigenerato — script `estrai_pdf_v2.py`, fuori dal deposito, non nel build).

## Giro — 2026-09-03 (25) — le ABBREVIAZIONI (codici di citazione), una quarta fonte

**« Ho visto che non hai messo le ABBREVIAZIONI. Sono importanti per capire le definizioni,
aggiungile come nel libro, alla fine. Ho anche un dizionario inglese PDF con le
abbreviazioni ».** I codici che chiudono ogni definizione ("(HCOB 23 Ago 65)") non erano
spiegati da nessuna parte nel dizionario — il libro stampato ha una lista a sé,
"Abbreviazioni", subito dopo il corpo A-Z. Trovata nel PDF italiano già in uso (pagine 635-
640) e in un SECONDO pdf inglese fornito apposta per questo ("1. Tech Dictionary 1975.pdf",
587 pagine, non usato altrove — l'inglese del dizionario principale resta l'HTML "fair use"
di sempre, questo pdf serve SOLO per la sua sezione "Abbreviations", pagine 498-500).

**Estrazione (`estrai_abbrev.py`, fuori dal deposito) — una regex diversa dal dizionario
principale**: lì il termine è sempre tutto maiuscolo, qui il codice quasi mai ("Abil", "Cl.",
"Dn 55!") — l'ancora diventa "riga che inizia con un codice corto (< 30 caratteri) seguito
subito da virgola", non più "riga tutta maiuscola". Due voci (una per lista) si spezzavano
per lo stesso motivo del titolo corrente del giro 24: la TRADUZIONE italiana tra parentesi
va a capo prima della propria virgola interna ("Congresso di\nanatomia dello spirito,
dell'uomo)"), creando un falso codice a sé — riconosciuto in generale (una parentesi aperta
mai richiusa nell'espansione, seguita da una voce che comincia in minuscolo, è la sua stessa
continuazione) invece che voce per voce. **133 voci italiane, 129 inglesi.** Restano alcuni
artefatti noti del SECONDO pdf inglese, non corretti (invenzione di testo non presente nella
fonte): un difetto di codifica del font di quel pdf storpia certe sequenze di lettere
("XDN" → "M)N", "Lect" → "kt" in due voci) — 6 voci su 129, isolate, documentate nel codice.

**Nel pannello**: le abbreviazioni si aggiungono in CODA a ciascuna lista (`abbreviazione:
true` le distingue — font mono, come i numeri/codici altrove in SERENITY), con una riga-
titolo "ABBREVIAZIONI" prima della prima (solo in vista non filtrata — sparisce filtrando per
lettera o testo, il confine non serve più). Restano dentro la STESSA ricerca delle voci vere
apposta: leggere una citazione e poter cercare subito il suo codice nello stesso posto è il
punto stesso di averle.

**Bug trovato dal vivo**: alcuni codici coincidono col nome di un termine VERO già nel
dizionario ("HCOB" è sia un'abbreviazione sia una voce del corpo inglese) — due oggetti
diversi con la stessa `key` React (`v.termine`), che si confondevano a vicenda nella
riconciliazione appena la lista filtrata cambiava: cercando "hcob" il contatore diceva
"2 / 2670" ma la lista ne disegnava 14, righe duplicate e sparse. Corretto con un id che
include anche `abbreviazione` (`${abbreviazione?'a':'v'}:${termine}`), usato sia per la `key`
sia per lo stato "voce espansa" (stesso rischio lì).

Verificato dal vivo: 2670/2670 (inglese, 2541+129) e 2757/2757 (italiano, 2624+133) entrate;
ricerca "hcob" ora corretta (2/2670, due righe distinte, espandibili indipendentemente — il
termine vero E l'abbreviazione); scorrendo senza filtri, il confine "ABRÉVIATIONS" (lingua
d'interfaccia FR in quel momento) appare subito dopo l'ultima voce vera di ciascuna lista.

`tsc --noEmit` pulito, `npm run lint` invariato (324 warning), `npx vitest run` 652/652 verdi.

File toccati — SOLO SERENITY: [`src/serenity/DizionarioModal.tsx`](../src/serenity/DizionarioModal.tsx)
(caricamento e fusione delle abbreviazioni, id univoco), `public/dizionario/abbreviazioni-it.json`,
`public/dizionario/abbreviazioni-en.json` (nuovi, dati statici — script `estrai_abbrev.py`,
fuori dal deposito, non nel build).
