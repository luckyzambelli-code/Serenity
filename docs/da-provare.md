# Da provare quando arriva il MUSE

Cose modificate che **il compilatore non può garantire**: vanno guardate con gli occhi, in
sessione. Si spunta man mano; quando una riga è verificata si cancella.

Il Muse 2 è in sostituzione (partito ~fine luglio 2026, ~2 settimane).

---

## Refactor di App.tsx

Il file si valida solo indossando il casco: `tsc`, ESLint e i 109 test coprono la forma, non il
comportamento. Ogni estrazione è in un commit separato, quindi una singola voce si può annullare
da sola senza toccare le altre.

- [ ] **Il badge del MUSE con le due percentuali** (`App.tsx`) — batteria e integrità stanno
      ora affiancate nel badge in alto, ognuna con la sua icona (pila · onda). Si vedono SOLO a
      casco collegato, quindi non si sono potute guardare:
  - [ ] le due icone si distinguono a colpo d'occhio e il badge non va a capo;
  - [ ] l'integrità passa all'**ambra** sotto il 60% (`INTEGRITA_SOGLIA`) e resta smorzata sopra;
  - [ ] i due numeri restano allineati mentre cambiano (`tabular-nums`).

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

## Tarature in attesa di numeri veri

- [ ] **MIRROR retrospezione** — servono i numeri di `MIRROR contact:` dal journal per tarare
      `MIRROR_RATIO_FULL`, `MIRROR_LOOKBACK_S`, `MIRROR_CONTACT_RISE_RATIO`;
- [ ] **`MOTION_ARTIFACT_RMS`** (=30) — se in seduta spariscono letture vere, va **alzato**;
- [ ] **profili del generatore F/N** — da tarare sui video.

---

## Deciso di non toccare

- **`genuineFall`** è già inerte per le F/N ad alta carica (qL ≳ 0,66). Lasciato com'è perché
  tocca l'equilibrio dell'ago che hai tarato a mano.
