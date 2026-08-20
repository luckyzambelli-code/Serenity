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
