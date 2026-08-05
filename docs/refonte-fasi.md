# EQUILIBRIUM — Le fasi e l'epurazione dello schermo

Specifica di riferimento. Nessun codice toccato. È l'ingresso della **tappa 1**
del piano in [refonte-ergonomia.md](refonte-ergonomia.md), e ne sposta la
priorità: la macchina delle fasi non va inventata, va **promossa**.

---

## 0. La scoperta che cambia l'ordine dei lavori

`spiegazioneCiclo` (`App.tsx:4540`) alimenta `CycleHint` con:

```
1 · DAI L'ITEM        →  2 · CHIEDI UN MOCK-UP  →  3 · AS-IS
```

per CONTACT, NULL, MIRROR e TONE, con la riga in ambra quando l'ago smentisce.
Il commento del componente lo dice esattamente: *« a che punto sono, e cosa devo
fare adesso »*.

**La macchina delle fasi esiste, è già tarata in seduta, e governa due righe di
testo.** `derivePhase()` non è codice nuovo: è quel `useMemo` che restituisce un
`SessionPhase` invece di una stringa. Il rischio della tappa 1 crolla, e la fase
arriva già validata dall'uso.

---

## 1. La dottrina — quattro regole, tutte di auditing

Non regole di gusto grafico. Ognuna discende da come si conduce una seduta.

### R1 — L'attenzione dell'auditor è sul preclear, non sullo schermo

È il primo dovere in seduta. Lo schermo va letto **con la coda dell'occhio**,
mai fissato. Ne discende che ogni elemento a schermo deve superare una prova:
*si legge senza staccare lo sguardo dal preclear?* Se no, non ci va.

Corollario duro: **niente che si aggiorni alla periferia mentre l'ago legge.**
Un journal che scorre e una cam che si muove ai lati del campo visivo tirano
l'occhio proprio nell'istante in cui conta.

### R2 — Un solo gesto per fase

In ogni fase esiste **un** comando primario, e la fase lo nomina. Gli altri
comandi o spariscono o si smorzano al 35 %. Un secondo bottone acceso è una
domanda posta all'auditor, e la domanda ruba il tempo di una lettura.

Caso limite già presente nel codice: cambiare metodo con un ciclo armato lo
**chiude** (`vai()` chiama `finalizeCycle(false)`, riga 6935). Mostrare i cinque
metodi durante un ciclo è quindi offrire un errore irreversibile a portata di
clic. Durante un ciclo, il selettore non deve esistere.

### R3 — In alto si legge, in basso si agisce

Regola già scoperta da voi, scritta nel commento della barra comandi (riga 6897)
dopo tre spostamenti. Qui diventa vincolante e vale per **tutti** i moduli: se un
elemento si legge sta sopra la sfera, se si preme sta sotto. Nessuna eccezione,
così non c'è più un quarto spostamento.

### R4 — Allarme, non cruscotto

Un modulo di sorveglianza si mostra **solo quando c'è qualcosa da sorvegliare.**

- `HealthPanel` — sparisce quando la seduta parte; ricompare **da sé** se
  `signalQuality` scende o la batteria è bassa. È l'unico momento in cui serve.
- `BiometricPanel` — solo su artefatto.
- Badge strumenti — a seduta avviata diventano un punto di 6 px; tornano badge
  se uno strumento cade.

Un pannello verde fisso che dice « tutto bene » per un'ora non informa: occupa.

---

## 2. Il colore — un canale, oggi tre significati per lo stesso valore

Verificato nel codice:

| Colore | Significato A | Significato B | Significato C |
|---|---|---|---|
| `#34d399` | traguardo raggiunto (`CycleHint fatto`) | metodo MIRROR (barra comandi) | MUSE indossato / bottone CONNETTI |
| `#ff5a5a` | **carica presente** (`chargeState CONTACT`) | metodo TONE SCALE (barra comandi) | — |

Il rosso è la cosa più importante che l'app possa dire — *c'è carica sul caso* —
e lo stesso rosso è il fondo di un bottone di modo. Il teal dice « obiettivo
raggiunto » e insieme « sei in MIRROR ».

**Regola.** Il colore è riservato allo **stato della carica** (la scala di
`chargeState`: neutro → contact → discharge → as-is) più l'**ambra** per
l'avviso. Tutto il resto dell'interfaccia — metodi, cornici, bottoni, badge,
etichette — è monocromo, e si distingue per posizione e peso tipografico. Il
metodo in corso si dice con la parola, non col colore.

Effetto atteso: quando la sfera diventa rossa, è l'**unica** cosa rossa a
schermo. È così che l'ago si legge con la coda dell'occhio.

---

## 3. Le fasi, per intero

`SessionPhase` = fasi trasversali + fasi di ciclo. Tutte derivate da segnali
esistenti; nessuno stato nuovo.

### 3.1 Trasversali

| Fase | Condizione (segnali attuali) |
|---|---|
| `boot` | `showSplash` |
| `instruments` | nessuno strumento in `instruments` |
| `preflight` | `ThetaReadyCheck` o `MetabolicCheck` aperti (`!thetaReadyDone`, `metabolicOpen`) |
| `ready` | strumenti ok, `sessionState === 'idle'` |
| `paused` | `sessionState === 'paused'` |
| `ep_window` | `epWindowOpen` — **priorità assoluta**, scavalca ogni fase di ciclo |
| `debrief` | `sessionState === 'ended'` o `showReport` |

### 3.2 CONTACT — `chargeState` : neutral → contact → discharge → asis

| Fase | Condizione | Gesto unico |
|---|---|---|
| `contact.item` | `!cycleArmed` | **DAI L'ITEM** (premi) |
| `contact.mockup` | `cycleArmed && !asIsPending` | chiedi il mock-up, poi **nulla** |
| `contact.asis` | `asIsPending` | **VALIDA** — l'app propone, l'auditor decide |

La dissoluzione non è un tempo della procedura: è ciò che l'app *misura* mentre
il tempo 2 dura. Va nella riga d'avviso, mai in un bottone. (Correzione già
scritta nel vostro commento riga 4552.)

### 3.3 NULL — `NullStateId` : neutral → null → rise → clear_read

| Fase | Condizione | Gesto unico |
|---|---|---|
| `null.item` | non armato | dai l'item |
| `null.mockup` | `phase === 'null'` | chiedi il mock-up (a voce) · a schermo: **DICHIARA: NON RICARICA** |
| `null.rise` | `phase === 'rise'` | nulla — guarda salire |
| `null.equilibrium` | `phase === 'clear_read'` | **VALIDA con i VGI's** |
| `null.norecharging` | `declared === true` | **RI-ARMA** con un altro item |

`null.norecharging` è il risultato diagnostico più prezioso del ciclo, e **oggi
non è raggiungibile**: il comando che lo dichiara non esiste nell'interfaccia
(§7.3). Va aggiunto in `null.mockup`, che è l'unica fase in cui ha senso.

Il cronometro visibile in `null.mockup` va **etichettato come indicativo** — il
codice lo dice già (*« il tempo non è imposto: ogni preclear ha il suo »*), ma
un numero che sale, a schermo, mette fretta comunque. Proposta: niente cifre,
solo un arco che avanza senza fine dichiarata.

### 3.4 MIRROR — metodo del raddoppio

| Fase | Condizione | Gesto unico |
|---|---|---|
| `mirror.item` | `!armed` | dai l'item |
| `mirror.contact` | `armed && !locked` | **AGGANCIA** (il valore 1–10 si fissa) |
| `mirror.doubling` | `locked && !reached` | nulla — la linea gialla è la meta |
| `mirror.reached` | `reached` | **VALIDA** e riparti |

In `mirror.doubling` lo schermo deve contenere **tre cose e basta**: il valore
fissato, la linea del doppio, la barra che sale. `peakAgeS` (« la carica era già
lì quando hai premuto ») va detto in ambra: è un'onestà dello strumento verso
l'auditor, e non va sepolta.

### 3.5 TONE SCALE — `TonePhase` : locate → sign → magnitude → mockup → done

| Fase | Gesto unico | Nota |
|---|---|---|
| `tone.locate` | **LOCALIZZA** | il MUSE dice *quando*, il meter *quanto* |
| `tone.sign` | positivo **o** negativo — due bottoni, nient'altro a schermo |
| `tone.magnitude` | 10 · 20 · 30 · 40 — quattro bottoni, nient'altro |
| `tone.mockup` | mock-uppa l'opposto | la meta è **lo zero**, non l'opposto |
| `tone.done` | **VALIDA** | se l'assessment smentisce la misura, si scrive |

TONE è il caso che dimostra la dottrina: quattro tempi che nessuno ricorda a
memoria (è per questo che `CycleHint` è nato). In `tone.sign` non c'è alcun
motivo perché siano a schermo il journal, le cam, la barra dei metodi e i
quattro campi meta. Due bottoni, l'ago, la domanda.

### 3.6 FREE

Solo l'ago, l'assessment e il journal. Nessuna barra di ciclo, nessun quadrante
di validazione. È la fase più epurata e serve da riferimento: se `free` si legge
bene, le altre devono avvicinarsi.

### 3.7 Priorità di derivazione

```
ep_window > debrief > paused > preflight > boot
          > <ciclo>.<fase> > ready > instruments
```

`ep_window` scavalca tutto: la finestra EP è il momento in cui il preclear ha una
realizzazione, ed è l'unico momento della seduta in cui lo schermo non deve
proporre **niente** all'infuori di quella.

---

## 4. La mappa dei moduli, fase per fase

Livello `STANDARD`. In `ESSENZIALE` cadono anche le colonne segnate ○.
In `ESPERTO` la tabella non si applica: tutto ciò che gli strumenti ammettono è a
schermo.

| Fase | Centro | Sinistra | Destra | Basso | Alto |
|---|---|---|---|---|---|
| `boot` | logo | — | — | — | — |
| `instruments` | i due strumenti, grandi | — | — | — | ridotto |
| `preflight` | il test in corso, uno alla volta | health | — | — | ridotto |
| `ready` | ago fermo + **START** + i 4 campi meta | health | — | scelta metodo | pieno |
| `contact.item` | ago + campo item | journal ○ | assessment | — | punto |
| `contact.mockup` | **ago solo** + avviso | journal *congelato* ○ | assessment | — | punto |
| `contact.asis` | ago + **VALIDA** | — | assessment | — | punto |
| `null.mockup` | ago + arco senza cifre | — | assessment | **DICHIARA: NON RICARICA** | punto |
| `null.rise` | **ago solo** | — | — | — | punto |
| `null.equilibrium` | ago + **VALIDA (VGI's)** | — | assessment | — | punto |
| `null.norecharging` | **ago spento** + NO RECHARGING (clic → lista) | — | assessment | ri-arma | punto |
| `mirror.contact` | quadrante + **AGGANCIA** | — | assessment | — | punto |
| `mirror.doubling` | valore · doppio · barra | — | — | — | punto |
| `mirror.reached` | **OTTENUTO** + VALIDA | — | assessment | — | punto |
| `tone.locate` | quadrante −40/+40 + **LOCALIZZA** | — | assessment | — | punto |
| `tone.sign` | **due bottoni** | — | — | — | punto |
| `tone.magnitude` | **quattro bottoni** | — | — | — | punto |
| `tone.mockup` | quadrante + meta = zero | — | assessment | — | punto |
| `tone.done` | **VALIDA** + smentita se c'è | — | assessment | — | punto |
| `free` | ago | journal ○ | assessment | scelta metodo | pieno |
| `ep_window` | **la finestra EP, sola** | — | — | — | — |
| `paused` | « in pausa » + RIPRENDI | — | — | — | pieno |
| `debrief` | il rapporto | — | — | — | pieno |

Fuori tabella, **sempre disponibili a richiesta** dalla barra icone (rail):
processus, storico, profili, config, lingua. Sono navigazione, non moduli di
seduta: non appaiono da sé e non spariscono.

Regole trasversali:

- **`health` e `biometric` non compaiono in tabella durante i cicli**: sono in R4
  (allarme). Entrano da soli su degrado, ed escono da soli.
- **`cam1`/`cam2` spariscono da `*.mockup` in poi** — *in seduta locale*. Nei
  momenti di lettura fine il movimento in periferia è rumore. Tornano a ciclo
  chiuso. **In `appMode === 'auditor'` la regola si rovescia**: la cam del
  preclear sale accanto all'ago e non sparisce mai (§7.2).
- **`MNA` resta fuori dalle fasi**: è un attrezzo, non un metodo — lo dice il
  vostro commento riga 6907. Si apre a mano, dentro qualunque ciclo, e non si
  chiude al cambio di fase.
- **I 4 campi meta** (Objectif / Processus / État physique / R-Factor) sono dati
  di **inizio seduta**: vivono in `ready`, non per un'ora a schermo. In seduta
  restano leggibili in una riga sola, e si riaprono da un clic.

---

## 5. Che cosa sparisce, in concreto

Conteggio a schermo oggi, in `contact.mockup` con un ciclo armato — cioè nel
momento di lettura più fine della seduta:

| Zona | Elementi |
|---|---|
| Barra alta | logo 44 px, titolo, versione, badge MUSE, badge THETA, badge P2P, ingresso IA |
| Banda meta | 4 campi di testo |
| Sinistra | journal (scorre), health (4 zone) |
| Centro | sfera, ago, barra ciclo, hint, ClearDial, TA readout, toggle diagnostica, arco |
| Destra | cam1, cam2, assessment, biometric |
| Basso | 5 metodi + MNA |
| Rail | 8 icone |

**≈ 28 elementi**, di cui almeno cinque animati.

Dopo: **ago · avviso · barra ciclo · item · assessment · TA** — sei, di cui uno
animato. L'ago guadagna all'incirca il doppio dell'area.

---

## 6. La prova, e come si misura

Tre criteri verificabili, non impressioni:

1. **Prova della coda dell'occhio.** In `contact.mockup`, guardando il preclear e
   non lo schermo, l'auditor sa dire se la carica sta salendo o scendendo. Oggi,
   con quattro cose rosse a schermo, no.
2. **Prova del gesto unico.** In ogni fase c'è un solo comando premibile. Si
   verifica contando: `document.querySelectorAll('button:not([disabled])')` nella
   zona di seduta deve dare **1** nelle fasi di azione, **0** in
   `contact.mockup`, `null.rise`, `mirror.doubling`.
3. **Prova del rosso unico.** In una fase qualunque, il rosso `#ff5a5a` compare
   in **un solo** punto: la carica.

---

## 7. Le decisioni

### 7.1 — Journal durante `*.mockup` : **CONGELATO** ✔ deciso

Resta a schermo e resta leggibile, ma **non scorre**: nessuna riga nuova entra
finché la fase dura. L'auditor a volte rilegge l'item, e togliergli il contesto
sarebbe epurare oltre l'utile. Le righe arrivate durante il congelamento entrano
tutte insieme all'uscita dalla fase, senza animazione di scorrimento.

Implementazione prevista: `TranscriptLog` riceve `frozen`; bufferizza e non
riesegue l'auto-scroll. Nessun dato perso.

### 7.2 — Le cam in seduta remota : **accanto all'ago** ✔ deciso

In locale il preclear è nella stanza: le cam sono ridondanti e seguono la tabella
del §4 (via da `*.mockup` in poi).

In `appMode === 'auditor'`, la cam del preclear **non è un modulo laterale**: sale
alla stessa altezza dell'ago, accanto ad esso, e **non sparisce in nessuna fase
di ciclo**. Non è un'eccezione a R1, è R1 applicata: a distanza il volto del
preclear *è* il preclear, ed è lì che l'attenzione deve stare.

Conseguenza sulla tabella del §4: in modo auditor remoto, la colonna « Centro »
si legge « ago + cam preclear », e la cam esce dalla colonna « Destra » in tutte
le righe.

### 7.3 — `null.norecharging` : la domanda era mal posta

**Il comando non esiste.** `declareNoRecharging()`
(`engine/NullCycleStateMachine.ts:66`), documentato come « c'est l'AUDITEUR qui le
déclare », **non è chiamato da nessuna parte in `src/`**.

Meccanicamente: `noRecharge` parte a `false`, solo `declareNoRecharging()` lo
mette a `true`, `update()` può solo rimetterlo a `false` → **`noRecharging` è
sempre `false`**. Le righe `PostSessionReport.tsx:981`, `:1778` e `:1795` che
scrivono « NO RECHARGING » nel rapporto e nel PDF sono **codice morto**.

Il motore sa fare la diagnosi; l'auditor non ha il bottone per dichiararla.

**Che cos'è.** Un item che non legge è « null », ma il null è ambiguo: null
perché pulito, o null perché *niente legge* (contatto, lattine posate, fascia
storta, preclear non presente). Il mock-up scioglie l'ambiguità — se l'ago sale
la catena funziona e il null era genuino; se non sale, il null non vale nulla.
È l'unico momento in cui l'app può dire **« fermati, stai auditando sopra un ago
che non legge »**, e invalida all'indietro tutti i null raccolti fin lì.

**Come deve apparire — B con C.** ✔ deciso

L'invasività non è un problema: è **l'auditor** a dichiararlo, mai la macchina.
Non è l'app che interrompe la seduta, è l'auditor che registra una conclusione a
cui è già arrivato.

**(B) L'ago si dichiara inaffidabile.** Non un pannello: il verdetto riguarda
l'ago, quindi lo dice l'ago. Un quadrante che si spegne si legge con la coda
dell'occhio (R1); un pannello obbliga a guardare lo schermo.

*Distinzione critica.* Lo stato « non ricarica » **non deve somigliare al
neutro**. Neutro (`chargeState.neutral`, `#cbd5e6`) vuol dire *l'ago legge e non
trova nulla* — che è un'informazione valida. « Non ricarica » vuol dire *l'ago
non legge*, che è l'opposto: l'assenza di informazione. Se i due stati si
somigliano, l'errore che il ciclo esiste per prevenire torna dalla finestra.

Quindi lo stato B deve dire « strumento spento », non « strumento calmo »:

- l'ago **si ferma del tutto** al centro — non oscilla più, nemmeno sul rumore;
- il quadrante perde l'anello e ogni alone, e passa a un grigio più freddo e più
  scuro del neutro;
- sotto, la parola **NO RECHARGING**, che è anche il bersaglio del clic per (C).

**(C) La lista, a un clic.** Un pannello al centro con cosa controllare, in
ordine di probabilità: contatto degli elettrodi e posizione della fascia ·
lattine posate o mani asciutte · strumento collegato · **presenza del preclear**.
Viola R1, ma solo su richiesta esplicita dell'auditor — che è il caso in cui R1
non si applica, perché in quel momento sta guardando lo strumento apposta.

**Il comando che manca.** « DICHIARA: NON RICARICA », presente **solo** in
`null.mockup`. Diventa il comando unico di quella fase (R2): l'azione dell'auditor
lì è verbale — chiedere il mock-up — e a schermo non c'è altro da premere.

*Vincolo, dal vostro codice.* Il bottone è presente **da subito e sempre allo
stesso peso**: non compare dopo N secondi, non si accende gradualmente, non porta
un contatore. Il commento della FSM è esplicito — « PAS de délai au bout duquel
l'app décrète » — e un bottone che diventa più visibile col tempo *è* l'app che
decreta, solo in modo più educato. L'auditor decide quando, senza che nulla lo
solleciti.

**La contraddizione va mostrata, non risolta.** Se l'ago sale **dopo** la
dichiarazione, `update()` conserva il verdetto (`if (!this.declared)`), e il
commento dice perché: « plutôt que d'effacer sa décision en douce ». A schermo:
il quadrante **torna vivo** e passa a `rise`, ma l'etichetta NO RECHARGING
**resta**, in ambra, smentita. Le due cose convivono, ed è l'auditor a scegliere
che farne. L'app non cancella mai un giudizio umano di nascosto.

**Codice morto da riattivare.** Una volta esistente il comando, i rami
`PostSessionReport.tsx:981`, `:1778` e `:1795` tornano raggiungibili senza
modifiche — sono già scritti e attendono solo un `noRecharging === true`.

**Da provare col MUSE addosso** (riga da aggiungere a `docs/da-provare.md` quando
la funzione sarà costruita): dichiarare in `null.mockup` e verificare che il
verdetto sopravviva a una salita tardiva, che finisca nel rapporto e nel PDF, e
che si azzeri al ri-armamento del ciclo.

---

## 8. Conseguenza sul piano

La tappa 1 di [refonte-ergonomia.md](refonte-ergonomia.md) si riscrive così:

> **Tappa 1 — promuovere `spiegazioneCiclo`.** Estrarre da `App.tsx:4540` la
> derivazione della fase in `engine/sessionPhase.ts`, che restituisce un
> `SessionPhase`. `CycleHint` continua a ricevere il suo testo, ora *derivato
> dalla fase* invece che calcolato in parallelo. Nessun cambiamento visibile.
> Test sui casi limite: precedenza di `ep_window`, `null.norecharging` sticky,
> passaggio di metodo che chiude il ciclo.

Un solo file nuovo, una funzione spostata, zero rischio a schermo — e da lì in
poi ogni modulo può chiedere « in che fase siamo ».
