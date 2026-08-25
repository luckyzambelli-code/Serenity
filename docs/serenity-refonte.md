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
