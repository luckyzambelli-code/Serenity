# Il ciclo TRUTH — resoconto di integrazione

> Scritto in risposta a due materiali ricevuti nello stesso messaggio: la spiegazione di Ron
> del suo protocollo sperimentale, e un documento tecnico (autoattribuito a "SERENITY", cioè
> scritto da un'IA) intitolato *« Le Cycle TRUTH et l'Intégration du Protocole de Ron »*, che
> propone un'architettura completa. Questo file valuta quell'architettura contro il codice
> REALE di EQUILIBRIUM/SERENITY — cosa ne resta in piedi, cosa va corretto, cosa manca prima
> di poter scrivere una riga di `useTruthCycle.ts`.

## 1. Cosa chiede Ron, in una frase

Localizzare un R/I (con un processo Scientology qualunque), poi chiedere ripetutamente
*« What about this is the truth? »* finché non emerge un ULTERIORE R/I; a quel punto chiedere
*« Return to present time! »*. Il punto chiave, che Ron sottolinea esplicitamente: quel che
sembrava una "caduta" dell'ago era in realtà un ACCORDO — la verità del PC che affiora, non
una scarica di carica nel senso di CONTACT/NULL. Vuole due interfacce: una professionale
(per l'auditor) e una "basic/solo" minimale — una luce che lampeggia e un rintocco, niente
altro.

## 2. Cosa propone il documento tecnico

Il documento separa esplicitamente MATEMATICA (deterministica, testabile) da
INTERPRETAZIONE (soggetta al protocollo), e costruisce sopra:

- **Un vettore di stato** `X(t) = [S(t), Ṡ(t), S̈(t), R_TA(t), HRV(t), C(t)]` — il segnale, la
  sua velocità e accelerazione, la resistenza TA, la variabilità cardiaca, e la coerenza.
- **Rilevamento booleano di candidati**: `D(t)` (drop), `P(t)` (pattern), `Q(t)` (qualità) —
  tre flag indipendenti che, combinati, propongono "qui potrebbe essere successo qualcosa".
- **Tre livelli**: Fisico (il segnale misurato) → Procedurale (cosa sta facendo l'auditor in
  quel momento — è nella domanda giusta?) → Semantico (cosa ha DETTO il PC).
- **Il ritardo individuale di Ron**, `Δt_Ron`, come funzione dinamica — non una costante fissa,
  ma qualcosa che si adatta a lui nel tempo.
- **Una FSM a sei stati**: `S0 IDLE → S1 RI_LOCATED → S2 QUESTIONING → S3 CANDIDATE →
  S4 TRUTH_EVENT → S5 RETURN_PRESENT`.
- **Un punteggio di fiducia** `C(t) = w1·D + w2·P + w3·R_TA + w4·Coh` che decide quando un
  candidato diventa un evento.
- **Due rese della STESSA macchina**: professionale (tutti i numeri, tutta la FSM visibile)
  e "basic/solo" (una luce, un rintocco — nessun numero).
- **Un piano di validazione alla cieca**: (A) la procedura vera, (B) le stesse marche
  temporali ma mescolate, (C) periodi scelti a caso, (D) una divisione train/test — per
  dimostrare che il rilevatore trova qualcosa di reale, non rumore che si adatta a sé stesso.
- **La conclusione del documento stesso**: *« il protocollo di Ron ⊂ il motore
  EQUILIBRIUM/SERENITY »* — non un algoritmo sostitutivo — e un avvertimento esplicito: MAI
  scrivere nel codice "TRUTH = caduta del segnale"; il codice rileva un evento fisiologico,
  è il PROTOCOLLO a interpretarlo.

## 3. Valutazione — cosa regge, cosa no, contro il codice reale

**Quel che regge, e bene.** La separazione a tre livelli (fisico/procedurale/semantico) non è
un'invenzione teorica: è ESATTAMENTE come CONTACT/NULL/MIRROR/TONE sono già costruiti in
questo codice. Ogni ciclo vive nel proprio `src/session/useXCycle.ts`, e nessuno dei quattro
duplica il calcolo del segnale — tutti leggono dagli stessi ingressi condivisi (`d.qL`,
`d.diracCount`, `d.hasMuse`, `d.hasTheta`, `computeInstantRead` in `engine/instantRead.ts` per
la classificazione F/N/Fall/Tick). Il livello FISICO, in questo codice, è già un livello a
parte — TRUTH non avrebbe bisogno di inventarlo, solo di aggiungersi come QUINTO consumatore.
La conclusione del documento (« ⊂ il motore, non un sostituto ») è quindi non solo condivisibile
in teoria: è come ogni altro ciclo qui è già scritto.

**Quel che è rischioso, e va corretto prima di scrivere codice.**

1. **Il punteggio di fiducia `C(t)` con pesi fissi è il tipo di numero che questo progetto ha
   già imparato a non fidarsi ciecamente.** Questa stessa sessione ha tarato (e ritarato tre
   volte) `TONE_MUSE_ESCURSIONE`/`TONE_HOLD_S` in `engine/tuning.ts` — ogni volta dichiarando
   esplicitamente nel codice « stima non verificata, serve dato reale ». `w1..w4` per TRUTH
   meritano lo stesso trattamento: costanti nominate in `tuning.ts`, mai nel corpo della
   funzione, e mai presentate come "calibrate" finché non lo sono davvero.
2. **Il rilevamento booleano `D(t)` (drop) rischia di ESSERE precisamente la trappola che il
   documento stesso vieta** — "TRUTH = caduta del segnale" — se D viene definito ingenuamente
   come "il segnale è sceso". Il documento la evita SULLA CARTA separando i livelli, ma la
   separazione vale solo se il codice la rispetta per davvero: il livello fisico può
   proporre CANDIDATI (com'è nella FSM, `S3 CANDIDATE`), mai un EVENTO da solo. Un evento
   `S4 TRUTH_EVENT` deve richiedere ANCHE la conferma procedurale (l'auditor ha davvero appena
   chiesto *"What about this is the truth?"* — lo sa già `faseCiclo`, lo stesso meccanismo che
   PistaCiclo usa per sapere in che passo si è) E quella semantica (cosa ha detto il PC — lo
   sa già il `journal`, con la stessa `computeInstantRead` "sulla parola" appena estesa al PDF
   di History in questo giro). Se manca uno dei tre, resta un candidato, non un evento — punto
   fermo, non negoziabile nell'implementazione.
3. **Non fondere `Δt_Ron` con "Ron's Lag".** Il nome coincide con un concetto DIVERSO già nel
   codice: `ContactPredictor.ts` (v. `predictive_meter_ronslag` nella memoria) compensa il
   ritardo di REAZIONE del sistema — quanto l'ago è indietro rispetto alla carica vera, un
   problema di latenza del SEGNALE. Il `Δt_Ron` del documento è il ritardo INDIVIDUALE di
   risposta di Ron a una domanda — un problema di TEMPISTICA UMANA, per calibrare la finestra
   della FSM (quanto aspettare dopo *"What about this is the truth?"* prima di considerare il
   silenzio come "niente qui"). Stessa persona nel nome, due meccanismi che non devono
   toccarsi: se finiscono nello stesso file o nella stessa variabile, un domani sarà
   impossibile tarare l'uno senza rompere l'altro. Nome proposto per il secondo:
   `truthResponseLagMs` (o simile), MAI `ronsLag`.
4. **Il "basic/solo" non è una vista nuova da inventare da zero.** Il principio dimensionale
   di questo stesso progetto (`docs/serenity-refonte.md`, la regola del 16/08/2026) dice già
   come si fa: EQUILIBRIUM/SERENITY-professionale detta struttura e funzione, una resa più
   semplice cambia SOLO la grafica. Questo codice ha già un precedente diretto: le sessioni
   SOLO nascondono la trascrizione parlata (`TranscriptLog.tsx`, `hideSpeech`) ma la
   REGISTRANO comunque — la vista è più povera, il motore sottostante è lo stesso, identico.
   "Basic/solo" per TRUTH è la stessa mossa: una luce e un rintocco quando `S4 TRUTH_EVENT`
   scatta, montati SOPRA la stessa FSM, non una seconda macchina a sé.
5. **I test di validazione alla cieca (A/B/C/D) hanno già un posto dove vivere: il CORPUS.**
   L'archivio JSON Lines per l'IA (`equilibrium_corpus_ai` nella memoria) esiste apposta per
   analisi offline delle sedute — due marche temporali separate, già pensato per verificare la
   falsificabilità dell'AS-IS. I quattro test proposti dal documento (procedura vera / marche
   temporali mescolate / periodi casuali / train-test) sono esattamente il tipo di analisi che
   si fa CONTRO quell'archivio, non in seduta dal vivo — nessuna nuova infrastruttura di
   raccolta dati da costruire, solo uno script offline che legge il CORPUS già scritto.

## 4. Come si innesta — l'architettura concreta

**Un quinto ciclo, non un sesto motore.** `src/session/useTruthCycle.ts`, stessa forma di
`useToneCycle.ts`: legge `d.qL`, `d.diracCount`, `d.hasMuse`, `d.hasTheta`,
`d.auditingQuestion`/`setAuditingQuestion` (l'item, qui il "cosa" della verità), `d.logLength`/
`d.log` (per scrivere nel Journal), `computeInstantRead` per la classificazione istantanea.
Nessuno di questi si tocca — sono gli stessi ingressi che CONTACT/NULL/MIRROR/TONE già usano,
la garanzia stessa che il documento chiede ("nessuna pipeline di segnale duplicata").

**La FSM mappa direttamente sul pattern `faseCiclo` già esistente.** `tone.tonePhase`
('raise'→'done') è già lo stesso genere di piccola macchina a stati che `S0..S5` propone —
TRUTH userebbe la stessa idea con più stati, esposta a `Serenity.tsx`/`App.tsx` esattamente
come `faseCiclo` deriva OGGI lo step visibile in `PistaCiclo` da `tonePhase`/`toneAtStart`/
`itemNamed`. Non serve una nuova infrastruttura di "fase" — serve un nuovo VALORE per quella
che già esiste.

**I tre livelli, tre responsabilità separate nel codice, non tre file separati:**

| Livello | Dove vive | Cosa fa | Cosa NON fa |
|---|---|---|---|
| Fisico | dentro `useTruthCycle.ts`, come gli altri | calcola `D`/`P`/`Q`/`C(t)` dal segnale | non decide mai da solo che è successo un TRUTH_EVENT |
| Procedurale | `faseCiclo`/`sessionPhase.ts` | sa se l'auditor è nella domanda giusta, in che ripetizione | non legge il contenuto di cosa dice il PC |
| Semantico | `journal`/`computeInstantRead` | legge cosa il PC ha detto, l'accordo/la scoperta nella parola | non tocca il segnale grezzo |

Un evento `S4 TRUTH_EVENT` si scrive nel Journal solo quando tutti e tre concordano — la
stessa disciplina che questa sessione ha appena applicato al PDF di History: **il dato arriva
già interpretato da chi lo raccoglie, il livello che lo mostra non ricalcola nulla da capo.**

**La doppia interfaccia**: `ToneDial`/`ToneColumn` insegnano già come farla. Un
`TruthIndicator.tsx` "professionale" (la FSM visibile, i numeri, come ToneDial mostra
`hasMeter`) e un secondo, minimo, per la resa basic/solo — una luce e un suono, montato in
`VistaSenzaAgo`-stile (sostituisce, non affianca, quando la modalità è scelta) — entrambi
alimentati dallo STESSO `useTruthCycle`, mai due motori.

## 5. Cosa NON fare — la lista nera

- Non scrivere MAI, in nessun punto del codice, un confronto diretto tipo
  `if (qL_drop) truth = true`. Il segnale propone un CANDIDATO (`S3`), non un evento.
- Non calibrare `w1..w4`/le soglie di `D`/`P`/`Q` a occhio e dichiararle definitive — stessa
  regola già rispettata (a fatica, tre volte) per TONE questa sessione: si scrivono come
  stima esplicita, in `tuning.ts`, mai nascoste dentro la formula.
- Non chiamare la variabile di ritardo individuale `ronsLag`/`RONS_LAG` — quel nome esiste
  già, per un'altra cosa (`ContactPredictor.ts`).
- Non costruire una seconda pipeline di lettura EEG/TA per TRUTH — usa `d.qL`/`taCorretto`
  come tutti gli altri quattro cicli.
- Non presentare la resa "basic/solo" come un prodotto diverso: è la STESSA FSM, vista con
  meno dettaglio — se un domani la FSM cambia, la vista basic non deve avere una sua copia
  della logica da tenere sincronizzata a mano.

## 6. Piano a fasi

1. **Motore, senza interfaccia.** `useTruthCycle.ts` con la FSM S0–S5, il vettore di stato
   e `C(t)` scritti ma con pesi placeholder dichiarati non tarati; nessun bottone in UI —
   solo test unitari (nello stile di `src/session/*.test.ts` già esistenti per gli altri
   cicli) contro dati sintetici.
2. **Validazione offline contro il CORPUS.** Lo script A/B/C/D del documento, eseguito contro
   sedute reali già archiviate — PRIMA di mostrare qualunque cosa a schermo. Se il rilevatore
   non supera (B)/(C)/(D) (si accende anche su rumore/ordine mescolato), i pesi/soglie si
   ritarano qui, non in produzione.
3. **Interfaccia professionale**, in EQUILIBRIUM (dove nascono sempre le funzioni, per
   principio dimensionale) — un quinto metodo accanto a CONTACT/NULL/MIRROR/TONE, stessa
   esclusività reciproca già scritta nei bottoni del piede di pagina.
4. **Porting in SERENITY**, grafica nuova, stessa funzione — stesso schema di questa intera
   sessione (`useTruthCycle` non si tocca, solo il disegno).
5. **Resa basic/solo**, ultima — dopo che la (3) esiste ed è verificata dal vivo, non prima:
   semplificare qualcosa che non esiste ancora ripeterebbe l'errore già corretto una volta
   questa sessione (« mai una versione "semplificata" inventata senza richiesta esplicita »,
   la stessa regola di `[[serenity_reproduce_equilibrium_logic]]`).

## 7. Cosa serve da Ron prima di cominciare la fase 1

- **Sedute reali già registrate** (anche solo audio + note scritte a mano, se non ancora nel
  CORPUS) in cui applica il protocollo — senza dati veri la fase 2 (validazione) non può
  nemmeno cominciare, e senza di lei nessun peso è credibile.
- **Una definizione operativa di "further R/I"** distinta da "fall/accordo" — il documento la
  dà solo in termini di segnale (drop pattern); serve anche come Ron stesso la riconosce
  ASCOLTANDO, per costruire il livello semantico (`Q(t)`/coerenza) su un criterio che
  corrisponda al suo giudizio, non solo al grafico.
- **Quanto deve durare, in pratica, `Δt_Ron`** — un ordine di grandezza (secondi? decine di
  secondi?) per non partire da zero nella taratura della finestra di attesa post-domanda.

---

*Questo documento non modifica codice. È la base per aprire, quando Ron confermerà i tre punti
sopra, un giro dedicato a `useTruthCycle.ts` — a partire dalla fase 1, motore senza interfaccia.*
