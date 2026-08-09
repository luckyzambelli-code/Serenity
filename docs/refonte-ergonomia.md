# EQUILIBRIUM — Refonte dell'ergonomia

Documento di architettura. **Nessuna modifica al codice esistente**: qui c'è solo il
piano. Versione di riferimento: 2.0.93.

> **Seguito:** [refonte-fasi.md](refonte-fasi.md) — la mappa completa delle fasi
> di auditing e dell'epurazione dello schermo, fase per fase. Riscrive la tappa 1
> del §6: la macchina delle fasi non va inventata, esiste già in
> `spiegazioneCiclo` e va promossa.

---

## 1. Diagnosi — che cosa c'è oggi

### 1.1 Un solo file regge lo schermo

`src/App.tsx` = **7 489 righe**, di cui **~2 260 di JSX in un unico `return`**
(righe 5227 → 7489). Dentro ci sono, mescolati: la barra alta, la sfera, i tre
cicli, la barra dei comandi, la colonna sinistra, la colonna destra, sei modali,
i popup PROCESSUS trascinabili, e la logica di drag con Pointer Capture.

Non esiste un livello « layout » : la disposizione è cablata a mano in flex e
`position:absolute` con `style={{}}` inline. Non c'è nessun punto del codice in
cui si possa leggere *che cosa sta a schermo adesso*.

### 1.2 Tre sistemi di visibilità che non si parlano

| Sistema | Dove | Che cosa governa | Default |
|---|---|---|---|
| `layoutStore.moduleVis` | `store/layoutStore.ts` | 7 moduli: journal, health, cam1, cam2, ri, biometric, mna | **tutti `true`** |
| ~18 `useState` booleani | sparsi in `App.tsx` | showSplash, showCredits, showProcessus, showDiag, showUnderArc, showConnectionModal, museHint, showHistoryModal, showReport, metabolicOpen, showThetaCal, showSexPrompt, cam1Visible, cam2Visible, transcriptVisible, mnaAperto, epWindowOpen, assessOpenSignal… | misto |
| `sidebarDrawer` | `App.tsx:230` | 7 cassetti mutuamente esclusivi | `null` |

Solo il terzo è fatto bene: un enum, un cassetto alla volta. Gli altri due sono
il problema. `moduleVis` parte con **tutto acceso**: al primo avvio l'auditor
vede sette pannelli, due telecamere e una sfera prima ancora di aver collegato
uno strumento.

### 1.3 Manca la nozione di *fase*

Gli unici segnali di contesto sono `sessionState` (`idle|running|paused|ended`)
e `mode` (`contact|null|mirror|tone|free`). Il resto della fase reale — ciclo
armato, AS-IS in attesa, finestra EP aperta, `tonePhase`, MIRROR agganciato — vive
in booleani separati (`cycleArmed`, `asIsPending`, `manualReady`, `mirrorArmed`,
`epWindowOpen`, `tonePhase`, `thetaReadyDone`).

Nessun modulo può quindi decidere da sé se è pertinente **ora**: l'informazione
esiste, ma non è mai stata composta in un valore unico.

### 1.4 Non esiste un livello utente

Il pannello di trim dell'ago (`TrimDrawer`, 200 righe di slider), la calibrazione
TA (`ThetaTaCalibration`), la diagnostica (`showDiag`), il generatore F/N stanno
sullo stesso piano di START e del selettore di metodo. Chi vuole solo condurre una
seduta deve attraversare le manopole di chi la sta tarando.

### 1.5 Sintomi collaterali

- **Z-index a mano**: 9000, 90, 60, 50, 30, 10 — con commenti nel codice che
  raccontano tre bug successivi di sovrapposizione (righe 5344, 5890, 6913). È il
  sintomo classico dell'assenza di un gestore di livelli.
- **Nessun token di stile**: `panelStyle()`, `glassSurface()`, `.sm-glass`,
  `frontTilt()` convivono con centinaia di `rgba(...)` letterali ripetuti e con
  il ternario `isLightTheme ? … : …` scritto ~150 volte.
- **La barra dei comandi è già stata spostata tre volte** (commento riga 6897).
  Non perché il posto fosse sbagliato, ma perché non c'era una regola su dove le
  cose vanno.

### 1.6 Il seme buono, già nel codice

`src/engine/sessionMode.ts` fa **esattamente** ciò che serve, ma per una cosa
sola: una tabella dichiarativa (`MODE_SPEC`) da cui *discendono* quadrante, ago e
comandi, invece di tre scelte che l'auditor deve tenere coerenti a mente.

> « Da ciascuno DISCENDE il quadrante, l'ago e i comandi. »

**Tutta la refonte è la generalizzazione di quella riga**: dalla fase discende
l'intera interfaccia, e non solo i comandi del metodo.

---

## 2. I tre principi

1. **Una cosa alla volta.** Lo schermo mostra il minimo per compiere l'azione in
   corso. Ciò che non serve *adesso* non è nascosto dietro un toggle: non è a
   schermo.
2. **I moduli seguono la fase, non l'utente.** L'auditor non gestisce
   l'interfaccia, la conduce. L'apparire e lo sparire sono la conseguenza di dove
   si trova nel lavoro.
3. **Tre livelli, non un interruttore.** `ESSENZIALE` / `STANDARD` / `ESPERTO`.
   L'esperto non « sblocca funzioni nascoste » : ottiene tutto sott'occhio in una
   volta, che è il modo di lavorare di chi tara lo strumento.

E una regola di rispetto: **l'automatismo cede sempre alla mano.** Se l'auditor
apre o chiude un modulo, quella decisione vince finché la fase non cambia.

---

## 3. Architettura proposta

```
┌─────────────────────────────────────────────────────────────────┐
│  SEGNALI ESISTENTI (nessuno nuovo)                              │
│  sessionState · mode · cycleArmed · asIsPending · manualReady   │
│  mirrorArmed · tonePhase · epWindowOpen · instruments · theta   │
└───────────────────────────┬─────────────────────────────────────┘
                            │  selettore puro, zero stato nuovo
                            ▼
                  ┌───────────────────┐
                  │  useSessionPhase  │   → SessionPhase
                  └─────────┬─────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────┐
│ moduleRegistry│  │  uiModeStore    │  │  layerScale  │
│  (dati)       │  │ level + override│  │  (z-index)   │
└───────┬───────┘  └────────┬────────┘  └──────┬───────┘
        └───────────┬───────┘                  │
                    ▼                          │
          ┌──────────────────┐                 │
          │  useVisibleSet   │  ← la sola      │
          │  (fase+livello   │    fonte di     │
          │   +override)     │    verità       │
          └────────┬─────────┘                 │
                   ▼                           ▼
          ┌────────────────────────────────────────┐
          │  <Stage>  — slot: rail/left/center/     │
          │            right/dock/overlay          │
          └────────────────────────────────────────┘
```

### 3.1 `engine/sessionPhase.ts` — la fase, derivata

TypeScript puro, come `sessionMode.ts`. **Non introduce stato**: compone segnali
che già esistono.

```ts
export type SessionPhase =
  | 'boot'          // splash, nessuno strumento
  | 'instruments'   // si scelgono e collegano MUSE / boîtes
  | 'preflight'     // ThetaReadyCheck, MetabolicCheck, baseline
  | 'ready'         // strumenti a posto, seduta non partita
  | 'idle_running'  // seduta in corso, nessun ciclo armato
  | 'cycle_armed'   // item dato, ciclo in corso
  | 'asis_pending'  // AS-IS da validare
  | 'ep_window'     // finestra EP aperta
  | 'tone_locate' | 'tone_confirm'   // i tempi di TONE SCALE
  | 'mirror_armed'
  | 'paused'
  | 'debrief';      // fine seduta, rapporto
```

Una sola funzione `derivePhase(signals): SessionPhase`, con precedenza esplicita
e testabile (`__tests__/sessionPhase.test.ts`), sul modello di quanto già fatto
per le traduzioni.

### 3.2 `ui/moduleRegistry.ts` — i moduli come dati

Oggi i moduli sono JSX cablato. Diventano un descrittore. Un modulo nuovo si
aggiunge scrivendo una riga, non cercando il punto giusto in 2 260 righe di JSX.

```ts
export interface ModuleSpec {
  id: ModuleId;
  slot: 'left' | 'right' | 'center' | 'dock' | 'overlay' | 'rail';
  level: 'essential' | 'standard' | 'expert';
  /** Fasi in cui il modulo si apre DA SÉ. */
  autoIn: SessionPhase[];
  /** Fasi in cui sparisce anche se aperto (a meno di pin). */
  hideIn?: SessionPhase[];
  /** Strumenti senza i quali non ha sorgente — come `needsEeg` in MODE_SPEC. */
  requires?: { muse?: boolean; theta?: boolean; camera?: boolean };
  /** Metodi in cui è pertinente. Vuoto = tutti. */
  modes?: SessionMode[];
  /** Se l'auditor lo chiude, resta chiuso fino al cambio di fase? */
  sticky?: boolean;
}
```

Estratto della tabella (il resto nella stessa forma):

| id | slot | livello | autoIn | requires |
|---|---|---|---|---|
| `health` | left | standard | `instruments`, `preflight` | muse |
| `journal` | left | standard | `idle_running`, `cycle_armed` | — |
| `assessment` | right | essential | `cycle_armed`, `asis_pending` | — |
| `cam1/cam2` | right | standard | `idle_running` | camera |
| `biometric` | right | expert | — | muse |
| `mna` | dock | expert | — | muse |
| `commandBar` | dock | essential | tutte le `*_running` | — |
| `cycleStatus` | center | essential | `cycle_armed`, `asis_pending` | — |
| `trim` | overlay | expert | — | — |
| `thetaCal` | overlay | expert | — | theta |
| `diagnostics` | overlay | expert | — | — |

Si legge in dieci secondi *che cosa appare quando* — cosa oggi impossibile.

### 3.3 `store/uiModeStore.ts` — livello e deroghe

Sostituisce e assorbe `layoutStore.moduleVis`. Persistito.

```ts
interface UiModeState {
  level: 'essential' | 'standard' | 'expert';   // persistito
  pinned:  Set<ModuleId>;   // aperto a mano → resta finché la fase non cambia
  muted:   Set<ModuleId>;   // chiuso a mano → resta chiuso
  lastPhase: SessionPhase;  // al cambio di fase, pinned/muted si svuotano
}
```

Il calcolo della visibilità è **una funzione pura**, quindi verificabile:

```
visibile(m) =
     livelloAmmette(m.level, level)
  && strumentiPresenti(m.requires)
  && modoPertinente(m.modes, mode)
  && ( pinned.has(m.id)                      // la mano vince
       || ( m.autoIn.includes(phase)
            && !m.hideIn?.includes(phase)
            && !muted.has(m.id) ) )
```

In `expert`, `autoIn` è ignorato: tutto ciò che il livello e gli strumenti
ammettono è a schermo. È la modalità di taratura.

### 3.4 `components/stage/` — gli slot

```
<Stage>
  <Rail/>            ← la sidebar attuale (già buona: enum, uno alla volta)
  <StageTop/>        ← identità + badge strumenti (già buono)
  <StageLeft/>       ← slot 'left'   — journal, health
  <StageCenter/>     ← la sfera + il ciclo in corso — MAI vuota
  <StageRight/>      ← slot 'right'  — assessment, cam, biometric
  <StageDock/>       ← slot 'dock'   — barra comandi, MNA
  <LayerHost/>       ← slot 'overlay' — modali, hint, PROCESSUS
</Stage>
```

Ogni slot è un `<SlotHost slot="left">` che interroga `useVisibleSet()` e monta
i moduli. Le colonne vuote **non lasciano un buco**: `flex` le fa collassare, il
centro si riprende lo spazio. È qui che si vede l'« écran dégagé » : quando in
`cycle_armed` sparisce tutto tranne la sfera, la barra del ciclo e l'assessment,
l'ago occupa il doppio dello spazio di oggi.

### 3.5 `ui/layers.ts` — la fine degli z-index a mano

```ts
export const LAYER = {
  background:   0,
  stage:       10,
  panel:       20,
  rail:        30,
  dock:        50,
  topbar:      60,
  floating:    90,   // PROCESSUS trascinabili
  modal:      100,
  hint:       200,   // museHint, cue contestuali
  splash:     900,
} as const;
```

Un solo file da leggere quando qualcosa passa sopra qualcos'altro. Sostituisce i
sei valori sparsi e i tre commenti-cicatrice.

### 3.6 `ui/tokens.ts` — un posto per i colori

I ~150 ternari `isLightTheme ? … : …` diventano variabili CSS su
`[data-theme]`, già presente su `App.tsx:5318`. I componenti leggono
`var(--panel-bg)`, non ricalcolano il tema.

---

## 4. Il comportamento, fase per fase

Ciò che l'auditor vede davvero. **Il centro non è mai vuoto**: c'è sempre una sola
cosa evidente da fare.

| Fase | Centro | Left | Right | Dock |
|---|---|---|---|---|
| `boot` | logo + « Collega uno strumento » | — | — | — |
| `instruments` | i due badge, grandi, al centro | health | — | — |
| `preflight` | il test in corso, uno alla volta | health | — | — |
| `ready` | l'ago fermo + **START** che pulsa | health | — | — |
| `idle_running` | l'ago vivo | journal | cam | selettore metodo |
| `cycle_armed` | ago + barra ciclo + item | journal | assessment | metodo + MNA |
| `asis_pending` | ago + **il gesto di validazione**, in evidenza | — | assessment | ridotto |
| `ep_window` | la finestra EP, sola | — | — | — |
| `tone_*` | il quadrante TONE + il tempo in corso | — | assessment | metodo |
| `debrief` | il rapporto | — | — | — |

Il passaggio `idle_running → cycle_armed → asis_pending` è quello che oggi fa
accavallare tre pannelli sulla stessa fascia. Qui è una transizione dichiarata.

### La transizione

`framer-motion` è già una dipendenza. Un `<AnimatePresence>` per slot, con
`layout`: i moduli entrano ed escono in 180 ms con opacità + 8 px di
scorrimento. Mai uno scatto. Deve essere una **conseguenza percepita**, non un
riassetto.

---

## 5. Il modo esperto

Non un menu di funzioni nascoste: un **cambio di regime**.

- `ESSENZIALE` — sfera, ciclo, comandi. Chi conduce e basta.
- `STANDARD` — + journal, health, assessment, cam. Il default.
- `ESPERTO` — tutto ciò che gli strumenti ammettono, `autoIn` disattivato, più:
  trim ago, calibrazione TA, generatore F/N, diagnostica, corpus, MNA.

Un solo commutatore a tre stati in cima al drawer `config`, e una scorciatoia
(`⌘E`). Un badge discreto nella barra alta quando si è in `ESPERTO`, perché è uno
stato in cui si può sregolare l'ago senza accorgersene.

I *layout salvati* di `layoutStore` sopravvivono, ma cambiano senso: non più
« quali pannelli », bensì **preset di livello + deroghe**, cioè un modo di
lavorare che si richiama.

---

## 6. Piano di attuazione — sei tappe, ognuna spedibile

Ogni tappa lascia l'app funzionante e produce un DMG. Nessun « big bang ».

| # | Tappa | Tocca | Rischio |
|---|---|---|---|
| 1 | ✔ **fatta** (2.0.94) — `sessionPhase.ts` + 34 test; la derivazione esce da `spiegazioneCiclo` senza cambiare una condizione | +2 file | nullo |
| 2 | ✔ **fatta** (2.0.95) — `layers.ts` (30 siti) + `tokens.ts` (46 siti). Vedi §6.1 | 20 file, poca logica | basso |
| 3 | ✔ **fatta** (2.0.96) — `moduleRegistry.ts` + `uiModeStore` + `visibleSet.ts`, 26 test. `layoutStore` continua a governare. Vedi §6.2 | +3 file | nullo |
| 4 | `<Stage>` e gli `<SlotHost>` — si estraggono dal JSX di `App.tsx` i moduli, **uno alla volta**, a parità di aspetto | `App.tsx` cala di ~1 200 righe | medio |
| 5 | Si dà la mano a `useVisibleSet`: l'automatismo si accende. Si toglie `moduleVis` | store | medio |
| 6 | ✔ **in parte** (2.0.108) — NORMAL/EXPERT c'è e governa trim · calibrazione TA · diagnostica · integrità. Restano le transizioni e i vuoti del centro | UI | basso |

La tappa 4 è la sola delicata: è lì che si smonta il `return` da 2 260 righe. Va
fatta modulo per modulo, con l'app aperta a fianco, e non in una volta.

### 6.1 Tappa 2 — quel che è stato fatto, e quel che resta

**`ui/layers.ts`** — tutti i 30 valori arbitrari di z-index, inline e in classi
Tailwind `z-[…]`, passano per un nome. **Nessun ordine è stato cambiato**: i
valori sono identici, e cambiare l'ordine sarebbe cambiare il comportamento in un
lavoro che si dichiara meccanico. Il guadagno è che le tre collisioni sono ora
scritte nel file invece di dover essere scoperte in seduta — `session` (9000) ha
cinque inquilini, `dock` (50) e `sphereChrome` (40) ne hanno due ciascuno. Le
classi Tailwind della scala standard (`z-10`…`z-50`) restano: sono già coerenti.

**`ui/tokens.ts` + `index.css`** — 11 token, 46 siti convertiti. Sono le coppie
che tornavano tre volte o più E che hanno un nome sensato: l'incasso dei
mini-interruttori e la sua ombra, l'inchiostro, l'ombra dei pannelli, l'avviso
(fondo/bordo/testo), il separatore, la pastiglia (fondo/bordo), l'accento.

Il tema scuro sta su `:root` e non su `[data-theme="dark"]`, e non è un dettaglio:
splash, crediti, calibrazione TA, scelta dello strumento e avanzamento connessione
sono dichiarati **fuori** dal div che porta `data-theme`. Con i valori scuri come
predefiniti continuano a ricevere quel che ricevono oggi, e il tema chiaro resta
un'eccezione localizzata.

**Verifica.** Le 22 variabili (11 × 2 temi) sono state lette con
`getComputedStyle` a schermo e corrispondono al carattere ai letterali di prima;
la pista del badge MUSE calcola `rgb(23,23,27)` al buio e `rgb(183,183,190)` al
chiaro. Confronto a schermo nei due temi: identico. `tsc` e ESLint puliti (294
avvisi, gli stessi di prima), 438 test.

**Resta la coda lunga: 165 ternari** su 23 file, ognuno usato una o due volte in
un punto solo. Non vanno convertiti per simmetria: dare un nome inventato a un
colore usato una volta lo rende più difficile da leggere, non meno. Spariranno da
soli quando la **regola del colore** (`refonte-fasi.md` §2) ridurrà la tavolozza —
ed è lì che il lavoro ha senso, non qui.

**Quel che questa tappa NON risolveva** — il tema chiaro illeggibile — è stato
corretto subito dopo, su richiesta. Vedi §6.3.

### 6.2 Tappa 3 — il registro dei moduli

Tre file, 26 test, **nessun effetto a schermo**: `layoutStore.moduleVis` continua
a governare. La tabella si calcola in parallelo e si prova.

- **`ui/moduleRegistry.ts`** — 13 moduli, ognuno una riga: slot, livello, le fasi
  in cui si apre da sé, gli strumenti che pretende, i metodi che lo riguardano.
- **`ui/visibleSet.ts`** — la regola in una funzione pura.
- **`store/uiModeStore.ts`** — livello + deroghe (`pinned`/`muted`), svuotate al
  cambio di fase.

**Una correzione alla specifica, trovata scrivendola.** Era previsto che ogni
modulo avesse due liste: `autoIn` (dove si apre) e `hideIn` (dove sparisce).
Scritte entrambe, `hideIn` si è rivelato aria — se una fase non è in `autoIn` il
modulo è già chiuso — e le due liste potevano contraddirsi sulla stessa fase.
Cosa puntualmente successa alla prima stesura, colta dal test di coerenza:
`assessment` si apriva e si chiudeva in `null.rise`. Resta `autoIn`: **dove non è
scritto, è chiuso.** Una tabella che si legge in dieci secondi è tutto il punto;
due liste che si smentiscono no.

### 6.3 Fuori piano — richieste dirette (2.0.96)

Tre cose chieste in corsa, che cambiano lo schermo e quindi non appartenevano a
una tappa « meccanica ».

**I fondi in dotazione, tolti.** Quattordici immagini da attraversare, e nessuna
diceva niente all'auditor: il fondo non è un'informazione, è la superficie su cui
se ne leggono altre. Restano il fondo dell'app e **il tuo**. L'immagine importata
ora si conserva davvero: era un `blob:`, moriva con la pagina e andava reimportata
a ogni avvio — adesso è ridotta a 1920 px e salvata come `data:`
(`lib/wallpaperImport.ts`, 10 test).

**Il tema chiaro, leggibile.** `AppBackground` dipingeva l'immagine anche in
chiaro, sotto pannelli trasparenti con inchiostro scuro. Il commento in `App.tsx`
diceva già il contrario da tempo — « *LIGHT theme = a CLEAN FLAT background so
everything stays legible* » — ma il codice faceva altro. Ora il chiaro è piatto,
il grigio è stato schiarito (`#d2d2d7→#9a9aa0` diventa `#ececed→#c8c8ce`), e il
logo — che ha il testo **bianco**, cioè è disegnato per fondo scuro e spariva —
riceve la sua pastiglia scura invece di essere filtrato, che ne avrebbe sporcato
il blu.

**L'integrità biometrica nel badge del MUSE.** Non è solo spazio guadagnato:
« il MUSE mi sta dando dati buoni? » è **una** domanda, e si leggeva in due punti
opposti dello schermo — il badge in alto per lo stato, un pannello in basso a
destra per la qualità. La qualità è la qualità di **quel casco**: appartiene allo
stesso oggetto. Il numero **non è verde** (il verde lì accanto vuol già dire
« indossato », e nell'app « traguardo raggiunto »): inchiostro normale, **ambra**
sotto la soglia — `INTEGRITA_SOGLIA` in `engine/tuning.ts`, che è 60 perché è la
soglia che `BiometricPanel` usa da sempre. Il pannello non sparisce: conserva la
barra, cioè l'andamento, e passa a spento per difetto in attesa del modo ESPERTO.

---

## 7. Ciò che questo piano **non** cambia

- Il motore: `NeedleEngine`, `SessionRuntime`, i cicli, `tuning.ts`. Intatti.
- Il rapporto di fine seduta, il corpus, la rete P2P, il satellite.
- La sidebar e i suoi cassetti: sono già l'unica parte costruita col principio
  giusto, e servono da modello al resto.
- `sessionMode.ts`: non viene rimpiazzato, viene **esteso** — è l'origine
  dell'idea.

---

## 8. La prova

Il piano è riuscito se, ad app avviata senza strumenti collegati, lo schermo
mostra **una cosa sola**: che cosa collegare. E se, con un ciclo armato,
l'auditor non ha davanti nulla che non riguardi quel ciclo.

Oggi, in entrambi i casi, ha sette pannelli.
