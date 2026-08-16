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
| 6 | R-Factor, processo, cicli, giornale, assessment | ⏳ da fare |
| 7 | Seduta a distanza | ⏳ da fare |
| 8 | Fine seduta e rapporto | ⏳ da fare |

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
