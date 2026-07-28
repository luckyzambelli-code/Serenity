# CAN METER — cablaggio e taratura

Sonda di **resistenza cutanea** (le « lattine ») su ingresso audio, per dare a EQUILIBRIUM
un **TA in ohm veri** accanto all'EEG del Muse.

Misura a **due toni** con rivelazione sincrona (lock-in): la parte cutanea — quella che porta
il segnale del sudore, cioè quello che legge un e-meter — si ricava dalla **differenza** fra
la frequenza bassa e quella alta.

> 🔧 **Per costruirlo**, segui [can-meter-montaggio.md](can-meter-montaggio.md): la procedura
> passo passo, nell'ordine giusto. Questo documento è il riferimento — lo schema, i valori e il
> *perché* di ogni scelta.

> ⚠️ **Sedute a batteria.** Fai le sedute con il computer **scollegato dal caricabatterie**.
> Le correnti in gioco sono ~10 µA, cento volte sotto la soglia di percezione e meno di quanto
> faccia passare un e-meter vero. Ma a batteria non esiste proprio nessun percorso verso la rete,
> e costa zero.

---

## 1. Materiale

| Pezzo | Note |
|---|---|
| 1 × dongle audio USB con **ingresso di LINEA** | *non* ingresso microfono — vedi §5 |
| 1 × jack 3,5 mm **TRRS 4 poli** saldabile | ⚠️ a 3 poli non funziona |
| 1 × R_ref, metal film 1 % 0,25 W | valore da scegliere: §2 |
| 1 × C di blocco, 1 µF (film o ceramico) | ⚠️ obbligatorio: §4 |
| 2 × resistenze campione 1 % (es. 100 kΩ e 1 MΩ) | solo per la calibrazione, §6 |
| 1 m cavo microfonico schermato OFC | schermo a massa **da un lato solo** (jack) |
| 2 × lattine inox | §7 |
| 2 × clip coccodrillo silicone + guaina termorestringente | |

---

## 2. Scegliere R_ref — PRIMA di saldare

La sensibilità del partitore è massima quando **R_ref è dello stesso ordine della persona**.

1. Impugna le due lattine come le impugnerai in seduta — presa leggera, mani asciutte.
2. Misura con un tester la resistenza fra le due lattine.
3. Scegli R_ref del valore **più vicino** a quello letto.

Valori tipici mano-mano: da qualche decina di kΩ (mani umide, lattine grandi) fino a
oltre 1 MΩ (mani asciutte, lattine piccole). **Non indovinare**: un assortimento
10k · 22k · 47k · 100k · 220k · 470k costa meno di una scelta sbagliata.

---

## 3. Schema

```
   DONGLE USB (jack TRRS 4 poli)
   ┌──────────────────────────────────────────────────────────────┐
   │                                                              │
   │  TIP ────────[ R_ref ]────────┬──────────────→  LATTINA 1    │
   │  (uscita, canale L)           │                              │
   │                             nodo A                           │
   │                               │                              │
   │  SLEEVE ←────────[ C 1µF ]────┘                (persona)     │
   │  (ingresso)                                                  │
   │                                                              │
   │  RING2 ───────────────────────────────────────→  LATTINA 2   │
   │  (massa)                                                     │
   │                                                              │
   │  RING1 ── non collegato (canale R)                           │
   └──────────────────────────────────────────────────────────────┘
```

**Piedinatura TRRS, standard CTIA:**

| Contatto | Segnale | Uso qui |
|---|---|---|
| **Tip** | uscita L | → R_ref → Lattina 1 |
| **Ring 1** | uscita R | non collegato |
| **Ring 2** | **massa** | → **Lattina 2** |
| **Sleeve** | ingresso | → C 1 µF → **nodo A** |

### I due punti in cui è facile sbagliare

1. **La Lattina 2 va a MASSA**, non all'ingresso. Se il ritorno non va a massa il circuito
   non si chiude, non passa corrente, e non esiste nessun partitore: leggeresti quasi zero.

2. **L'ingresso preleva sul nodo A** — il punto fra R_ref e la Lattina 1 — non dall'altro
   capo della persona. La tensione sul nodo A *è* la tensione ai capi della persona, ed è
   quella che entra nella formula.

### Schermatura

Lo schermo del cavo va a **massa (Ring 2)**, e **solo lì**. Collegato ai due capi crea un
anello di massa che ti riempie la misura di ronzio.

### Opzione: R_ref divisa in due (consigliata)

Al posto di una R_ref, due resistenze da metà valore, **una in serie a ciascuna lattina**.
Limita la corrente simmetricamente sui due lati. Nella formula R_ref resta la **somma** delle due.

---

## 4. Il condensatore non è opzionale

Gli ingressi audio con supporto microfono forniscono una **tensione continua di polarizzazione**
(2–3 V) per alimentare i microfoni electret. Senza il condensatore in serie quella continua:

- passa attraverso la persona;
- **polarizza gli elettrodi**, producendo la deriva lenta che è il tormento dei meter in continua —
  cioè proprio il difetto che stiamo evitando misurando in alternata.

A 1 µF la sua impedenza alle frequenze usate è trascurabile e non falsa la misura.

---

## 5. Perché l'ingresso di LINEA e non il microfono

Tre motivi, tutti pratici:

- **Livello.** L'uscita dà ~1 V, un ingresso microfono si aspetta millivolt: satura subito.
  Un ingresso di linea accetta un volt senza problemi.
- **Guadagno automatico (AGC).** Se il sistema regola il guadagno da solo, ti cambia la scala
  sotto i piedi mentre misuri: qualunque misura di ampiezza diventa carta straccia.
  **Verifica che sia disattivato.**
- **Rilevamento del jack.** Il Mac sente l'impedenza per capire se hai inserito cuffie o un
  headset, e può non abilitare l'ingresso. Il dongle USB salta tutta questa logica.

---

## 6. Calibrazione a due punti

Non conosciamo né l'ampiezza reale d'uscita né il guadagno d'ingresso: solo il loro **prodotto**,
che chiamiamo **K**. E R_ref ha la sua tolleranza. Due misure con resistenze note danno entrambi.

**Procedura** (una volta sola, e da rifare se cambi dongle o volume):

1. Scollega le lattine. Metti **R1 nota** (es. 100 kΩ) al loro posto, fra il nodo A e la massa.
2. Avvia la misura, annota il valore grezzo `m1`.
3. Sostituisci con **R2 nota** (es. 1 MΩ), annota `m2`.
4. Il modulo risolve in forma chiusa:

```
r     = m1 / m2
R_ref = R1·R2·(1 − r) / (r·R2 − R1)
K     = m1·(R_ref + R1) / R1
```

Da lì in avanti, ad ogni campione:

```
R_pc = R_ref · m / (K − m)
```

Usa **due valori ben distanti** (rapporto 10× almeno) e possibilmente a cavallo della
resistenza attesa della persona: la calibrazione è più stabile.

---

## 7. Le lattine

- **Inox.** Non il rame: si ossida, e l'ossido di rame è un semiconduttore che aggiunge una
  resistenza di contatto instabile. I **bicchieri termici in acciaio** da bar o campeggio sono
  la soluzione migliore per pochi euro: già lisci, senza bordi taglienti, alimentari.
- **Misura**: la mano deve avvolgere comodamente, dita che quasi si toccano senza sovrapporsi.
  Indicativamente 6–7 cm di diametro per una mano adulta.
- ⚠️ Se usi barattoli di latta veri, **il bordo tagliato è affilato**: lima e copri con guaina.
- **Collegamento stabile**: forellino + vite con capocapo e dado. La clip a coccodrillo sul bordo
  va per il prototipo, ma slitta — e un contatto intermittente produce lo stesso segnale di una reazione.
- **Pulizia**: alcol dopo l'uso. Il residuo salino del sudore cambia la conduttività della superficie
  e produce deriva fra una seduta e l'altra.

### Le lattine fissano la scala

> Superficie più grande = meno ohm. **Cambi le lattine e cambiano tutti i numeri.**

Una volta scelte, quelle restano: stessa persona, stesse lattine, sempre. Ed è anche il motivo
per cui la « resistenza totale » della scala di Ron non può essere una costante universale —
dipende dagli elettrodi. Domanda ancora aperta con lui.

---

## 8. Le due frequenze

| | Valore | Perché |
|---|---|---|
| **f basso** | ~40 Hz | Vicino al comportamento in continua: **vede la pelle**, dove vive il sudore |
| **f alto** | ~990 Hz | Lo strato corneo si comporta da condensatore e a questa frequenza è cortocircuitato: **vede quasi solo il percorso profondo** |

La **differenza** fra i due isola la componente cutanea, ripulita dal percorso profondo che di
elettrodermico non porta niente. È una separazione che un e-meter in continua **non può fare**.

Vincoli rispettati nella scelta:

- entrambe con **numero intero di cicli** nella finestra di media → i due lock-in sono ortogonali
  e non si contaminano a vicenda;
- **990 non è un'armonica di 40** (40 × 24,75) → la distorsione dell'uscita a 40 Hz non finisce
  nel canale alto;
- nessuna delle due è multiplo di **50 Hz né di 60 Hz** → fuori dalle armoniche di rete.

Il modulo **aggancia le frequenze ai bin** in base alla frequenza di campionamento reale della
scheda, quindi i valori effettivi possono scostarsi di qualche Hz da 40 / 990. È voluto.

---

## 9. Primo collaudo, in ordine

1. **Continuità e calibrazione a vuoto**: senza persona, con le resistenze campione. Se i valori
   letti non tornano entro il 2–3 %, non proseguire: c'è un errore di cablaggio.
2. **Test del respiro profondo**, solo lattine, senza Muse. Un'inspirazione brusca produce una
   risposta elettrodermica **1–3 secondi dopo** in praticamente chiunque: è il controllo clinico
   standard che un canale EDA funzioni. Ripetilo 5 volte a un minuto di distanza.
   **Se questo non si vede, non c'è motivo di andare avanti.**
3. **Sweep di frequenza**: ripeti il test a 40 · 100 · 300 · 990 Hz e guarda dove la risposta è
   più ampia. Conferma (o smentisce) la scelta delle due frequenze sulla *tua* pelle.
4. **Poi il Muse in parallelo**, e da lì si misura tutto il resto: se l'ago EEG segue le lattine,
   e soprattutto **se le anticipa**.
