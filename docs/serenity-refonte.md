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

⚠️ **Cosa manca ancora**: solo CONTACT (non NULL), nessun CORPUS (`writeCycleCorpus`/
`markFnAsIs` restano no-op — `corpusSessionRef` resta sempre vuoto), nessun lag di Ron
(`onLagMeasured` no-op), nessun assessment automatico da voce (`ensureAssessmentOn` no-op —
l'item si scrive, non si detta ancora), nessun pannello MNA, MIRROR o TONE. Ognuno di questi è
un passo a parte, quando servirà. EQUILIBRIUM 2.0.153, SERENITY 3.0.16.

Verifica di ogni fase: la stessa seduta, condotta nelle due applicazioni, deve dare lo
stesso giornale, lo stesso rapporto, gli stessi test verdi.

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
