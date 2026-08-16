# Da provare quando arriva il MUSE

Cose modificate che **il compilatore non può garantire**: vanno guardate con gli occhi, in
sessione. Si spunta man mano; quando una riga è verificata si cancella.

Il Muse 2 è in sostituzione (partito ~fine luglio 2026, ~2 settimane).

---

## Refactor di App.tsx

Il file si valida solo indossando il casco: `tsc`, ESLint e i 109 test coprono la forma, non il
comportamento. Ogni estrazione è in un commit separato, quindi una singola voce si può annullare
da sola senza toccare le altre.

- [ ] **La colonna della SCALA DEL TONO** (`components/ToneColumn.tsx`) — verticale, a destra
      dell'arco, in vista TONE. Compare solo con uno strumento collegato, quindi NON si è
      potuta guardare:
  - [ ] le tredici etichette non si accavallano (guardate su pagina di prova, non in app);
  - [ ] la scala ADATTATA (2.0.117, non più lineare) mette un tono normale a metà colonna e non
        più in basso: da confermare col meter, che è la cosa che l'ha fatta scoprire;
  - [ ] **IL TA RIPORTATO ALLE DUE LATTINE** (2.0.124–125) — col meter, provando le due
        configurazioni:
    - [ ] a DUE lattine sotto il numero c'è « TA · 2 lattine » e il valore non è corretto;
    - [ ] a UNA lattina senza scarto misurato il TA CALA di una divisione (4 → 3) e la riga
          passa all'ambra: « TA · 1 lattina − 1 divisione »;
    - [ ] misurando lo scarto nel pannello TRIM, la riga diventa « TA · 1 lattina → 2 » e il
          margine sparisce (una misura batte la prudenza);
    - [ ] **la SCALA DEL TONO segue il TA corretto**: passando da due lattine a una, il tono
          NON deve saltare di una divisione — è il difetto che questa versione toglie;
  - [ ] **l'ANCORAGGIO al ciclo** (2.0.120) — il tono non si legge più in assoluto: alla
        localizzazione si fissa la partenza e da lì si conta la salita. Col meter:
    - [ ] stringendo le lattine il cursore SALE (resistenza giù = tono su) e riscende lasciando;
    - [ ] la salita è proporzionata — tutta l'escursione del TA vale 80 divisioni;
    - [ ] col MUSE ANCHE collegato compare la marca tratteggiata « EEG »: da guardare se sale
          INSIEME al cursore. È il dato che questa versione esiste per raccogliere;
  - [ ] aprendo DIAGNOSTIC i suoi dati NON coprono più la colonna;
  - [ ] il PANNELLO DI FONDO della colonna (2.0.118) stacca le scritte dai tratti dell'arco
        senza nasconderlo: si deve vedere l'arco attraverso, e leggere i nomi sopra;
  - [ ] **il bottone del ciclo al TRAGUARDO** (2.0.118) — senza strumenti non si vede mai,
        perché `asIsPending` viene dall'EEG: col MUSE, in CONTACT il bottone deve passare da
        « MOCK-UP » a « AS-IS CONFERMATO » in verde, e premendolo VALIDA (non chiude e basta);
  - [ ] in NULL, arrivati al EQUILIBRIUM, i due esiti (VGI's / senza) compaiono ACCANTO al
        bottone del ciclo, e non più in fondo accanto alla % di dissoluzione.
  - [ ] i nomi sono LEGGIBILI da seduti (corpo 12–14, colonna larga 260) e quelli lunghi
        vanno a capo su due righe senza uscire dal bordo — `spezza` è provata, la resa no;
  - [ ] i nomi sono nella LINGUA della seduta, e cambiano cambiando lingua;
  - [ ] il cursore porta « ≈ valore » e il NOME del livello (Collera, Apatia…);
  - [ ] **ago a destra = colonna che sale**: è la corrispondenza su cui poggia tutto il disegno
        (provata in `tonePosition`, ma da vedere in movimento);
  - [ ] la barretta della carica MUSE, a sinistra dell'asta, non si confonde col tono;
  - [ ] il segmento ambra fra tono di partenza e tono attuale dice il verso.

- [ ] **Il ciclo TONE coi comandi di Ron** (`App.tsx`, v2.0.115) — provato a schermo senza
      strumenti; col meter va riguardato, perché con la misura i tempi 2 e 3 arrivano con una
      proposta e il comportamento cambia:
  - [ ] i due comandi si leggono a voce senza inciampi (sono la frase, non un riassunto);
  - [ ] **RIDÀ IL COMANDO** conta bene le passate, e il numero finisce nel journal (`· ×7`);
  - [ ] **NON REAGISCE PIÙ — VALIDA** chiude il ciclo e scrive la riga;
  - [ ] con METER: l'ago finisce **al centro** o **in cima**? È la domanda aperta con Ron —
        la vecchia procedura prevedeva il centro, il comando nuovo dice +40. Va OSSERVATO.

- [ ] **« L'ITEM È STATO DETTO »** (`App.tsx`, v2.0.115) — l'uscita a mano dalla fase d'attesa
      della voce, nei quattro cicli:
  - [ ] con la trascrizione FUNZIONANTE il bottone non serve (l'item arriva da sé): verificare
        che premerlo comunque non rompa nulla;
  - [ ] il chip ambra « dì l'item… » si SPEGNE premendolo — se resta acceso, la parola detta
        dopo si prende il posto dell'item a ciclo avviato;
  - [ ] chiuso il ciclo, il seguente torna a CHIEDERE l'item (non deve saltare il tempo 1).

- [ ] **Il badge del MUSE con le due percentuali** (`App.tsx`) — batteria e integrità stanno
      ora affiancate nel badge in alto, ognuna con la sua icona (pila · onda). Si vedono SOLO a
      casco collegato, quindi non si sono potute guardare:
  - [ ] le due icone si distinguono a colpo d'occhio e il badge non va a capo;
  - [ ] l'integrità passa all'**ambra** sotto il 60% (`INTEGRITA_SOGLIA`) e resta smorzata sopra;
  - [ ] i due numeri restano allineati mentre cambiano (`tabular-nums`).

- [ ] **⚠️ IL CASO « SOLO THETA-METER »** (`App.tsx`, 2.0.116) — meter collegato e MUSE no. È
      la configurazione dell'utente in attesa del Muse nuovo, ed era ROTTA: `eegModulesHidden`
      nascondeva l'INTERO blocco del ciclo (pista, campo item, bottone che arma, istruzione),
      e i gesti manuali non c'erano perché stavano solo nel ramo « nessuno strumento ». Da
      provare col meter attaccato e il MUSE spento:
  - [ ] in CONTACT e NULL si vedono pista, campo dell'item, bottone e istruzione;
  - [ ] i gesti compatti compaiono sotto l'istruzione (DICHIARA AS-IS / i tre esiti NULL) e
        CHIUDONO il ciclo — senza, `asIsPending` non scatta mai e il ciclo resta armato;
  - [ ] col MUSE ANCHE collegato quei gesti SPARISCONO (il ciclo torna automatico);
  - [ ] senza alcuno strumento restano al centro, grandi, come prima.

- [ ] **Il ciclo TONE a DUE tempi** (2.0.116) — segno e ampiezza sono usciti, la meta è +40
      per tutte le resistenze. Col meter attaccato:
  - [ ] la barra d'avanzamento sull'arco sale verso il +40 e non più verso lo zero
        (`raiseProgress`), e il segno del bersaglio è a destra dell'arco;
  - [ ] il testimone « AGO IN CIMA » si accende arrivando in cima (`reachedTop`), e NON a zero;
  - [ ] il journal scrive `TONE <partenza> → +40 · ×n · TONO 40 RAGGIUNTO`.

- [ ] **I comandi manuali senza strumenti** (`App.tsx`) — provati a schermo nel dev server, ma
      col MUSE addosso vanno riguardati in seduta vera:
  - [ ] CONTACT: DAI L'ITEM → DICHIARA AS-IS chiude il ciclo (contatore +1, journal);
  - [ ] NULL: DAI L'ITEM → i tre esiti (EQUILIBRIUM con/senza VGI, NON RICARICA) scrivono la
        riga giusta nel rapporto e nel corpus;
  - [ ] MIRROR: DAI L'ITEM → OTTENUTO valida;
  - [ ] con MUSE collegato i comandi manuali NON compaiono (il centro torna a essere l'ago), e
        i cicli avanzano da sé come prima — cioè che non ho rotto il caso con strumenti.

- [ ] **Le fasi del ciclo** (`engine/sessionPhase.ts`, tappa 1 della refonte) — la derivazione
      che alimenta `CycleHint` è uscita da `App.tsx` senza cambiare una condizione. 34 test
      coprono la scala, ma il testo a schermo si vede solo in seduta: **senza strumento la
      seduta non parte**, quindi il compilatore e i test sono tutto ciò che si è potuto fare.
      Da guardare, per ciascun ciclo, che la scritta sia quella di prima e cambi quando deve:
  - [ ] CONTACT — `1 · DAI L'ITEM` → `2 · CHIEDI UN MOCK-UP` → `3 · AS-IS`, e la riga d'avviso
        (« la carica si sta dissolvendo » / « sembra NULL ») compare come prima;
  - [ ] NULL — item → mock-up → `3 · LA CARICA SALE` → `EQUILIBRIUM`;
  - [ ] MIRROR — item → `2 · DÌ L'ITEM` premendo col campo vuoto → contatto → doppio →
        `OTTENUTO`;
  - [ ] TONE — i quattro tempi, e la smentita dell'ago nella riga in ambra;
  - [ ] LIBERO — resta la prima riga, come prima;
  - [ ] con la **finestra EP aperta** il testo NON cambia (è il solo punto in cui la nuova
        precedenza avrebbe potuto cambiare qualcosa: per questo il testo usa
        `deriveCyclePhase` e non `derivePhase`).

- [ ] **Vista partecipante** (`components/ParticipantView.tsx`, commit `f5b4ada`) — è la parte
      cambiata di più. Da provare in **sessione remota vera** (Mac auditor + telefono preclear):
  - [ ] la camera dell'auditore si vede sul telefono;
  - [ ] il badge MUSE si connette dal telefono (e **non** appare in modalità satellite, quando il
        MUSE è appaiato al Mac);
  - [ ] la batteria si aggiorna;
  - [ ] il bottone **DISCONNETTI dell'intestazione** riporta alla schermata iniziale pulita;
  - [ ] il bottone **DISCONNETTI del pannello EOS** fa la stessa identica cosa — i due gestori
        erano duplicati e ora sono uno solo, quindi vanno provati **entrambi**;
  - [ ] dopo la disconnessione, una sessione **locale** successiva parte pulita (niente sessione
        fantasma nello storico: era il difetto #7/#8 segnalato da Roger).

- [ ] **Modale EP manuale** (`components/EpManualModal.tsx`) — aprire la finestra EP, compilare
      tipo di reazione / realizzazione / VGI / VVGI / nota, e verificare che:
  - [ ] i due interruttori VGI e VVGI commutino (i setter sono in forma funzionale);
  - [ ] **ANNULLA** chiuda senza validare;
  - [ ] **VALIDA** scriva la riga nel journal con tutti i campi compilati, e che l'EP risulti
        validato nel rapporto finale.

- [ ] **Tema chiaro** (`ui/lightThemeCss.ts`) — cento righe di CSS spostate: passare al tema
      chiaro e controllare che **tutta** l'interfaccia si schiarisca come prima (era un unico
      blocco, se si fosse rotto si vedrebbe subito e ovunque).

- [ ] **Media di ripiego sul relay** (`hooks/useMediaRelayFallback.ts`, commit `f5b4ada`) — si
      attiva solo quando WebRTC fallisce, quindi serve una rete che lo forzi (5G sul telefono,
      Mac su WiFi):
  - [ ] i fotogrammi JPEG arrivano (video a scatti ma presente);
  - [ ] l'audio si sente;
  - [ ] alla disconnessione non restano AudioContext o `<video>` appesi.

---

## THETA-METER (e-meter USB)

### Da provare per prime (2.0.121)

- [ ] **CON TUTTI E DUE gli strumenti l'ago è quello del METER** — `cicloInCorso ? 'eeg'` stava
      prima della scelta, e bastava armare un ciclo perché tornasse al MUSE (segnalato).
      Da guardare: coi due collegati, armando CONTACT, l'ago RESTA quello del meter e le
      reazioni arrivano etichettate METER e MUSE;
- [ ] **la prova della stretta prende anche una stretta LENTA** — si congelava solo sulla
      VELOCITÀ (`THETA_MIN_RATE`), e una stretta graduale veniva inseguita fino a scarto zero:
      la prova diceva che non era successo niente. Ora c'è anche la DISTANZA
      (`THETA_TEST_START_DEV`). Da provare stringendo piano, e poi di scatto;
- [ ] **la prova resta in memoria per QUEL preclear** — farla, chiudere, riaprire: sulla scheda
      in AUDITOR & PC deve dire « oggi », il numero di prove, e (se provate tutte e due le
      configurazioni) lo scarto del SOLO;
- [ ] **senza prova del giorno, una divisione in meno sul tono** — da verificare che il numero
      sulla colonna sia effettivamente 1 più basso finché la stretta non è stata fatta.


Protocollo decodificato e coperto da 15 test; il **driver WebHID non è mai girato** contro il
dispositivo dentro EQUILIBRIUM — finora solo dalla pagina di scoperta.

- [ ] con **Theta-Meter chiuso**, il meter si aggancia da solo (VID/PID univoci: nessun
      selettore da mostrare, come per il Muse);
- [ ] arrivano ~60 letture/s e il numero **scende stringendo** le lattine;
- [ ] i report scartati restano a **zero** (se salgono, l'intestazione `01 02` non è costante
      come credo e il formato va rivisto);
- [ ] l'autorizzazione **sopravvive al riavvio** dell'app (`setDevicePermissionHandler`);
- [ ] se Theta-Meter è aperto, compare il messaggio che dice di chiuderlo — e non un errore
      di sistema incomprensibile.

### L'aggancio all'interfaccia (v1.0.386) — provabile SUBITO, senza Muse

- [ ] il bottone **COLLEGA IL METER** (in alto a destra, sotto TONE ARM) apre e aggancia;
- [ ] compare un **secondo ago AMBRA** sul quadrante, sotto quello EEG;
- [ ] stringendo le lattine l'ago ambra **CADE a destra**, e torna lasciando;
- [ ] tenendo la stretta a lungo l'ago **rientra da solo** verso il riposo (è il braccio che
      insegue, come la manopola di un meter vero) e il **Total TA sale**;
- [ ] l'app resta **fluida** (le letture arrivano a 60/s ma si pubblicano a 50 Hz);
- [ ] chiudendo l'app e riaprendola il meter si **riaggancia senza richiedere il permesso**.

**Tarature che quasi certamente serviranno**, tutte in `engine/tuning.ts`:
- `THETA_NEEDLE_SCALE` — ampiezza delle reazioni. Reazioni minuscole → ALZARLO; ago che sbatte
  ai bordi → ABBASSARLO. È la prima da toccare.
- `THETA_ARM_ALPHA` — quanto è lento il braccio. Se le reazioni si spengono troppo in fretta,
  ABBASSARLO.
- `THETA_TOTAL_TA_STEP` — quanto grezzo vale un decimo di divisione. Da confrontare col Total TA
  che mostra Theta-Meter sulla stessa stretta.

### ✅ Fatto e verificato (29/07/2026)

- [x] protocollo HID decodificato e letto dentro EQUILIBRIUM;
- [x] scala del TA tarata con l'artefatto — **usando i valori che mostra il meter vero**
      (2,034 · 3,056 · 4,068 · 5,041), non quelli incisi;
- [x] **il TA dei due strumenti coincide**;
- [x] l'ago combacia col Theta-Meter a **sensibilità 10**;
- [x] i due programmi convivono, quadranti affiancati.

### Da fare a ogni seduta (non è taratura, è procedura)

- [ ] **prova della stretta** → fissa la sensibilità (un terzo di quadrante);
- [ ] **test del respiro** → verifica che il preclear reagisca.

### Da verificare, non ancora saputo

- [ ] **il legame grezzo → ohm è lineare?** L'ho assunto, non è provato. Si misurano tre
      resistenze note al posto delle lattine e si guarda con `linearityError()` se la terza
      cade sulla retta. Se non ci cade, il legame è probabilmente reciproco (frequenza) e la
      taratura a due punti non basta. Finché non è verificato: **valori relativi sì, ohm
      assoluti no**.

---

## CAN METER

⚠️ **Forse non serve più**: l'utente possiede già un e-meter USB funzionante (vedi sopra).
La sonda sul jack audio nasceva dal fatto che il Muse non misura resistenza — problema che il
Theta-Meter risolve da sé. Da riprendere solo se quella strada si rivelasse insufficiente.

Tutta la catena hardware è **mai girata**: `lib/canMeterAudio.ts` non ha mai visto una scheda
audio vera. Procedura completa in [can-meter-montaggio.md](can-meter-montaggio.md).

- [ ] verifiche col tester (montaggio §5) — **prima** di collegare al computer;
- [ ] taratura a due punti: i valori letti tornano entro il 2-3 % delle resistenze campione;
- [ ] **test del respiro profondo**, 5 volte: la resistenza scende e risale 1-3 s dopo.
      Se non si vede, fermarsi qui;
- [ ] sweep di frequenza (40 · 100 · 300 · 990 Hz) per confermare la scelta dei due toni;
- [ ] **poi** il Muse in parallelo: l'ago EEG segue le lattine? E soprattutto le **anticipa**?

---

## ✅ SERENITY — le fasi 1, 2 e 3, provate in seduta (16/08/2026, 2.0.139 · 3.0.0)

Le tre modifiche che questa macchina non poteva far girare da sola sono state percorse col
MUSE e col meter veri, e **tornano tutte**. Restano scritte perché dicono cosa fu il rischio,
e cosa andrà riprovato se un giorno una di quelle parti si tocca di nuovo.

- ✅ **`trackCycle`** (fase 1) — un ciclo CONTACT intero col MUSE: fasi, comm lag, offerta
      « AS-IS? », falso AS-IS, FSM del NULL. Era un centinaio di righe spostate e mai eseguite.
- ✅ **`useMuseConnection`** (fase 2) — connettere, disconnettere, **annullare la ricerca**
      (il ramo che leggeva uno stato congelato), perdere la cuffia e riprenderla con l'ago che
      riparte, cioè il ricablaggio dei flussi.
- ✅ **il silenzio del classificatore** (2.0.138) — la prova delle lattine rifatta IN SEDUTA non
      scrive più reazioni false, né alla stretta né al rilascio; una reazione vera subito dopo
      si vede ancora. `THETA_TEST_MUTE_AFTER_S = 2 s` è quindi **confermato sul campo**.
- ✅ **archivio unico** (fase 3) — SERENITY legge gli stessi profili di EQUILIBRIUM.

⚠️ Da rifare queste stesse prove se si tocca `session/useContactNullCycle.trackCycle`,
`hooks/useMuseConnection`, o il silenzio in `hooks/useThetaMeter` — sono le tre parti che
nessuna prova a tavolino raggiunge.

## Da provare col METER — SERENITY (fasi 4 e 5)

**Il quadrante.** L'ago di SERENITY prende gli angoli da `engine/dialGeometry`, gli STESSI di
`QuantumSphere` (12 test, valori invariati: 67,5° e SET a −0,35). La sola prova che conta è
vedere i due aghi fare la stessa cosa.

- [ ] **stretta delle lattine**: l'ago cade dello STESSO tanto nelle due applicazioni;
- [ ] **F/N**: compare in tutte e due — in SERENITY come alone di quiete dietro l'arco;
- [ ] **blow-down**: arriva allo stesso punto del quadrante;
- [ ] **il TA sotto l'ago** in SERENITY è lo stesso numero che EQUILIBRIUM mostra in cima;
- [ ] **senza meter** il quadrante resta, spento, con l'ago a SET — non deve sparire.

⚠️ `QuantumSphere` importa adesso apertura dell'arco e riposo da `dialGeometry` invece di
tenerne una copia. I numeri sono identici, ma è l'ago di EQUILIBRIUM: se qualcosa si muovesse
diversamente da prima, si torna a `serenity-3.0.2`.

**I profili.** La creazione (ritratto ridotto a 320 px, sesso, salvataggio, spinta al server)
sta in `lib/profiloEdit`, condivisa: `ProfileRoster` di EQUILIBRIUM ci passa adesso anche lui.

- [ ] **creare un auditor in EQUILIBRIUM** con foto e sesso: si salva e si ritrova come prima;
- [ ] **crearne uno in SERENITY**: compare in EQUILIBRIUM, con ritratto e sesso;
- [ ] **una foto grande da file**: si riduce e NON fa fallire il salvataggio;
- [ ] lo stato delle lattine appare sotto ogni preclear al momento di sceglierlo.

---

## Da provare col METER — il quadrante di SERENITY è ORA QuantumSphere vero (fase 5, 2/2)

Segnalato: « l'arco dell'ago lo vorrei esattamente come in equilibrium ». Non un secondo
disegno degli stessi angoli — LO STESSO COMPONENTE (`components/QuantumSphere.tsx`), con un
nuovo prop `forceLightTheme` che lo rende leggibile sul fondo chiaro di SERENITY senza toccare
il tema di EQUILIBRIUM (la preferenza è condivisa in localStorage).

- [ ] **fianco a fianco**: la stessa seduta, la stessa reazione, guardata nelle due
      applicazioni — l'arco, le bande, la scia, le scritte SF/FALL devono essere IDENTICHE;
- [ ] **F/N**: la resa sul quadrante è quella di sempre (il quadrante ora è lo stesso identico
      codice, quindi qui il rischio è basso, ma va guardato);
- [ ] **cambiare tema in EQUILIBRIUM** (chiaro/scuro) e riaprire SERENITY: deve restare chiara
      SEMPRE — `forceLightTheme` non deve MAI lasciar trapelare il tema scuro.

## Modificare ed eliminare auditor e preclear — anche questo da EQUILIBRIUM

Segnalato: « on ne peut pas éditer les auditeurs et PC existants ». `lib/profiloEdit` ha ora
anche `eliminaAuditor`/`eliminaPreclear`, e SERENITY mostra « modifica » sotto ogni profilo
(non solo su hover — segnalato che mancava del tutto, quindi doveva essere ben visibile).

- [ ] **modificare un auditor creato in EQUILIBRIUM, da SERENITY**: la foto e il sesso nuovi
      si vedono anche riaprendo EQUILIBRIUM;
- [ ] **eliminare un preclear da SERENITY**: sparisce anche da EQUILIBRIUM, le sue sedute
      passate RESTANO nell'archivio (non si toccano — verificato a schermo che la logica c'è,
      da controllare che il rapporto di una vecchia seduta si apra ancora col nome giusto).

---

## Tarature in attesa di numeri veri

- [ ] **MIRROR retrospezione** — servono i numeri di `MIRROR contact:` dal journal per tarare
      `MIRROR_RATIO_FULL`, `MIRROR_LOOKBACK_S`, `MIRROR_CONTACT_RISE_RATIO`;
- [ ] **`MOTION_ARTIFACT_RMS`** (=30) — se in seduta spariscono letture vere, va **alzato**;
- [ ] **profili del generatore F/N** — da tarare sui video;
- ✅ **`THETA_TEST_MUTE_AFTER_S`** (=2 s) — confermato in seduta il 16/08/2026: copre il
      rilascio delle lattine e non mangia la reazione vera che segue.

---

## Deciso di non toccare

- **`genuineFall`** è già inerte per le F/N ad alta carica (qL ≳ 0,66). Lasciato com'è perché
  tocca l'equilibrio dell'ago che hai tarato a mano.
