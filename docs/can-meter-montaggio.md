# CAN METER — procedura di montaggio

Guida passo passo per costruire il connettore delle lattine.
Lo schema e il *perché* di ogni scelta stanno in [can-meter-cablaggio.md](can-meter-cablaggio.md);
qui c'è solo cosa fare, nell'ordine giusto.

**Tempo**: un paio d'ore senza fretta. **Difficoltà**: quattro saldature.

> **L'ordine conta.** Si misura la mano *prima* di scegliere la resistenza, si identificano i
> contatti del jack *prima* di saldare, e si collauda col tester *prima* di attaccare al
> computer. Saltare un passo significa quasi sempre rifare il pezzo.

---

## Materiale

### Elettronica

| Pezzo | Specifica | Note |
|---|---|---|
| Jack 3,5 mm | **TRRS 4 poli**, saldabile, corpo metallico | ⚠️ a 3 poli non funziona |
| Assortimento resistenze | metal film **1 %**, 1/4 W: 10k · 22k · 47k · 100k · 220k · 470k | il valore si sceglie al passo 2 |
| 2 resistenze campione | **1 %**: 100 kΩ e 1 MΩ | per la taratura |
| 1 condensatore | **1 µF film / MKT**, 50 V o più | ⚠️ **non elettrolitico**: è polarizzato e noi lavoriamo in alternata |
| Cavo microfonico schermato | 1 m, **2 conduttori + schermo** | OFC va benissimo |
| 2 clip a coccodrillo | con guaina in silicone | |
| Guaina termorestringente | assortita, incluso un pezzo largo | |
| Dongle audio USB | con **ingresso di LINEA** | vedi cablaggio §5 |

### Lattine

Due **bicchieri termici in acciaio inox** da bar o campeggio, ~6-7 cm di diametro.
Già lisci, senza bordi taglienti, pochi euro. (Barattoli di latta veri: vedi cablaggio §7,
il bordo va limato.)

### Attrezzi

- Saldatore e stagno
- **Tester (multimetro)** — non è opzionale: serve in tre passi diversi
- Spellafili o taglierino
- Accendino o pistola ad aria calda per la guaina
- *Solo se fai il collegamento a vite*: trapano con punta da 3 mm, vite M3 con dado e capocorda ad anello

---

## Passo 1 — Identifica i quattro contatti del jack

**Prima di saldare qualunque cosa.** Le sigle stampate sui connettori sono spesso assenti o
sbagliate: l'unico modo affidabile è il tester.

1. Svita il cilindro di plastica del jack e sfilalo: restano lo spinotto e i quattro reofori.
2. Metti il tester in **continuità** (il simbolo del suono).
3. Tieni una punta su una sezione metallica dello spinotto, e con l'altra tocca i reofori a uno
   a uno. Quello che fa **bip** è il suo.
4. Ripeti per tutte e quattro le sezioni.

Le sezioni, partendo dalla punta:

```
     ┌──┬───┬───┬────────────
     │T │ R1│ R2│  Sleeve       ← il manicotto è il più vicino al cavo
     └──┴───┴───┴────────────
```

| Sezione | Nome | A cosa serve qui |
|---|---|---|
| Punta | **Tip** | uscita → resistenza |
| 1° anello | Ring 1 | **non collegato** |
| 2° anello | **Ring 2** | **massa** → lattina 2 |
| Manicotto | **Sleeve** | ingresso ← condensatore |

**Segnati quale reoforo è quale** con un pennarello o un pezzetto di nastro. Da qui in poi non
si torna indietro.

> ⚠️ **Sleeve = ingresso, Ring 2 = massa.** Se li scambi, mandi il segnale dentro l'ingresso e
> misuri il nulla. È l'errore più comune.

---

## Passo 2 — Misura la tua mano e scegli la resistenza

**Prima di saldare la resistenza**, perché il valore dipende da te.

1. Impugna le due lattine come le impugnerai in seduta: **presa leggera**, mani asciutte, rilassato.
2. Tester in **ohm**, una punta per lattina (o fatti aiutare, o appoggia le punte sotto le dita).
3. Aspetta **una decina di secondi**: il valore scende e poi si assesta. Prendi quello assestato.

Ti verrà un numero fra qualche decina di kΩ e oltre 1 MΩ. Ora:

> **Scegli la resistenza dell'assortimento più vicina al valore letto.**

Questa è R_ref. Se hai letto 180 kΩ, prendi la 220k. Se hai letto 60 kΩ, prendi la 47k.
Non serve precisione: la taratura a due punti sistemerà il resto.

Segnati il valore misurato: servirà a capire se qualcosa cambia in futuro.

---

## Passo 3 — Prepara il cavo

1. Spella **3 cm** di guaina esterna dal lato jack. Trovi due conduttori isolati e una calza di
   schermo (fili sottili intrecciati attorno).
2. Attorciglia la calza in un unico filo e stagnalo: diventa un terzo conduttore.
3. Dall'altro lato, spella **25 cm** di guaina esterna: i due conduttori restano liberi e vanno
   ciascuno verso la sua lattina.
4. Da quel lato **taglia via la calza dello schermo** a filo della guaina e copri il moncone con
   un pezzetto di termorestringente.

> Lo schermo va a massa **solo dal lato jack**. Collegato ai due capi crea un anello di massa che
> riempie la misura di ronzio.

Dai un nome ai due conduttori — di solito uno è bianco e uno rosso:
- **conduttore A** → nodo A → lattina 1
- **conduttore B** → massa → lattina 2

---

## Passo 4 — Salda

Infila **subito** i pezzi di termorestringente sui fili, *prima* di saldare: dopo non passano più.
È l'errore che fanno tutti almeno una volta.

Ci sono solo quattro punti:

```
   Tip ────[ R_ref ]────┬──── conduttore A ────→ lattina 1
                        │
                     nodo A
                        │
   Sleeve ───[ C 1µF ]──┘

   Ring 2 ──┬─────────── conduttore B ────→ lattina 2
            └─── schermo del cavo

   Ring 1 ── niente
```

Nell'ordine:

1. **Tip** → un capo di R_ref.
2. **Sleeve** → un capo del condensatore. (Il condensatore film non ha polarità: qualsiasi verso.)
3. Unisci in un solo punto — il **nodo A** — l'altro capo di R_ref, l'altro capo del condensatore
   e il **conduttore A**. Tre fili in una saldatura sola.
4. **Ring 2** → **conduttore B** + **schermo** insieme.

Poi:
- Copri il nodo A con termorestringente: è il punto più esposto a corti.
- Copri l'intero blocco resistenza+condensatore con un pezzo largo, così diventa un cilindretto
  rigido e i componenti non si piegano.
- Rimetti il cilindro di plastica del jack.
- Salda le due clip a coccodrillo in fondo ai due conduttori, e copri con termorestringente.

### Variante consigliata: R_ref sostituibile

Se prevedi di provare valori diversi, al posto di saldare R_ref salda **due pin femmina** (o una
morsettiera a vite da due): la resistenza si infila e si cambia senza saldatore. Cinque minuti in
più adesso, molti risparmiati dopo.

---

## Passo 5 — Collauda col tester, PRIMA di attaccare al computer

Cinque verifiche. Se una fallisce, non proseguire: cerca l'errore.

| # | Fra | Deve leggere | Se no |
|---|---|---|---|
| 1 | Tip ↔ lattina 1 | **il valore di R_ref** (±5 %) | R_ref saldata male o nel punto sbagliato |
| 2 | Ring 2 ↔ lattina 2 | **~0 Ω** | conduttore B interrotto |
| 3 | Sleeve ↔ lattina 1 | **circuito aperto** (∞) | il condensatore è in corto o è del tipo sbagliato |
| 4 | Tip ↔ Ring 2 | **aperto**, o R_ref se le lattine si toccano | c'è un corto: non attaccare al computer |
| 5 | Ring 1 ↔ tutto il resto | **aperto** | filo vagante |

La verifica 3 sembra un guasto ma è la conferma che il condensatore c'è: **blocca la continua**,
quindi in ohm il tester legge infinito. È esattamente quello che deve fare.

---

## Passo 6 — Le lattine

**Opzione veloce** (per il primo collaudo): aggancia le clip a coccodrillo al bordo del bicchiere.
Zero attrezzi.

**Opzione stabile** (per le sedute vere):
1. Fai un foro da 3 mm a circa 1 cm dal bordo.
2. Vite M3 dall'interno, capocorda ad anello all'esterno, dado stretto bene.
3. Aggancia la clip al capocorda — o saldaci direttamente il filo.

La clip sul bordo nudo **slitta**, e un contatto intermittente produce esattamente lo stesso
segnale di una reazione. Per provare va bene; per lavorarci no.

---

## Passo 7 — Prima accensione

1. **Scollega il Mac dal caricabatterie.** A batteria non esiste nessun percorso verso la rete.
2. Inserisci il dongle USB, poi il jack nel dongle.
3. Nelle impostazioni audio del sistema: seleziona il dongle come ingresso, **abbassa il volume
   d'uscita** (si alza dopo, poco per volta) e **verifica che il guadagno automatico sia spento**.
4. Prima ancora della persona, fai la **taratura a due punti**: aggancia le due clip ai capi della
   resistenza da **100 kΩ**, avvia la misura, poi ripeti con quella da **1 MΩ**.
   Le clip servono anche a questo: non serve nessun connettore in più.
5. Se i valori letti non tornano entro il 2-3 %, **fermati**: c'è un errore di cablaggio, e andare
   avanti significa solo raccogliere numeri sbagliati.

---

## Passo 8 — La prova che decide

Impugna le lattine e fai un **respiro profondo e brusco**.

Se la catena funziona, **1-3 secondi dopo** vedi la resistenza scendere e poi risalire lentamente.
È il controllo clinico standard per verificare che un canale elettrodermico sia vivo: funziona
praticamente su chiunque.

Ripetilo **cinque volte**, a un minuto di distanza l'una dall'altra. Se la risposta c'è ed è
ripetibile, il meter funziona e si può passare al Muse.

Se non c'è, il problema è a monte e non ha senso andare oltre. In quel caso, nell'ordine:
il guadagno automatico è davvero spento? Il volume d'uscita è abbastanza alto? Le mani sono
troppo asciutte? Prova a scendere di frequenza (vedi cablaggio §8).

---

## Errori più comuni, in ordine di frequenza

1. **Sleeve e Ring 2 scambiati** → non misura niente. Ricontrolla col tester (passo 1).
2. **La lattina 2 non va a massa** ma all'ingresso → il circuito non si chiude, corrente quasi
   nulla, lettura quasi zero.
3. **Guadagno automatico attivo** → i numeri ballano senza motivo e la taratura non regge.
4. **Termorestringente dimenticata prima di saldare** → si ricomincia.
5. **Condensatore elettrolitico** al posto del film → polarizzato, distorce, e in alternata non
   fa il suo mestiere.
6. **Schermo collegato ai due capi** → ronzio.
