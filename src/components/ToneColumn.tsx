import React from 'react';
import { useUiStore } from '../store/uiStore';
import { TONE_LEVELS, levelAt, exactLevelName, levelName } from '../engine/toneLevels';
import { pick5 } from '../i18n5';
import { TOKEN } from '../ui/tokens';
import { TONE_SCALE_MAX } from '../engine/tuning';

/**
 * ToneColumn — LA SCALA DEL TONO, in verticale, accanto all'ago.
 *
 * ── PERCHÉ VERTICALE, E PERCHÉ ACCANTO ──────────────────────────────────────────────────────
 * Il preclear è abituato a leggere la scala dal basso verso l'alto, e il metodo consiste nel
 * SALIRE. Un arco orizzontale non lo dice.
 *
 * Ma l'arco non si tocca, e non è un compromesso: sono DUE MESTIERI.
 *   • L'ARCO è la REAZIONE — che cosa sta succedendo adesso (caduta, F/N, blowdown). Lo legge
 *     l'auditor, ed è la forma su cui ha imparato.
 *   • LA COLONNA è la POSIZIONE — dove sta il caso sulla scala. La legge il preclear.
 * È la divisione che Ron descrive: l'ago è l'istante, il tono è lo stato.
 *
 * ── I DUE SI MUOVONO INSIEME, E SI PUÒ DIMOSTRARE ───────────────────────────────────────────
 * `impedanceMeter.ts`: tono = 40 − 80·(R/R_totale). Resistenza che SCENDE = tono che SALE. E una
 * caduta dell'ago È resistenza che scende. Quindi l'ago che va a destra e la colonna che sale
 * sono lo STESSO evento visto in due modi — non due strumenti che dicono cose diverse. La
 * colonna sta a destra apposta: comincia dove l'arco finisce, all'estremo della liberazione.
 *
 * ── ADATTATA, NON LINEARE — ED È IL PUNTO ───────────────────────────────────────────────────
 * L'asse ERA lineare in tono. La scala di Ron però non è distribuita: fra 0 e 9 ci stanno
 * quaranta livelli — tutta la vita quotidiana — e fra 9 e 40 tre. Lineare, quella banda cadeva
 * in un decimo dell'altezza, illeggibile, e un tono normale si posava appena sopra la metà con
 * un vuoto enorme sopra: da cui « ci si ritrova sempre in basso » (segnalato).
 *
 * Ogni intervallo fra due etichette scritte occupa la stessa altezza (`tonePosition`, in
 * `toneLevels.ts`, dove si prova). Si perde la proporzione e si tiene il verso — il « quanto »
 * è dell'ago, che resta lineare; la colonna dice DOVE SI È e SE SI SALE.
 *
 * I nomi degli altri livelli restano fuori: li dice il cursore, per esteso.
 *
 * ── LA LENTE — SOLO POCHI NODI ALLA VOLTA, NON PIÙ TUTTI E TREDICI ─────────────────────────
 * Segnalato ancora: « la scala a sinistra è un poco confusa, deve essere come una lente di
 * ingrandimento... si focalizza sui Toni sopra e sotto quello raggiunto, non si deve vedere
 * tutta la scala, ma solo qualche tono sopra e sotto ». Fino a qui la colonna disegnava
 * SEMPRE tutti e tredici i `TONE_LABELS`, dallo zero al fondo scala in un colpo solo — utile
 * per la proporzione (vedi sopra), ma dodici nomi su tredici non contano nulla nel momento in
 * cui si guarda, ed erano comunque a schermo. `useFinestra` (sotto) ritaglia una manciata di
 * nodi attorno al segmento in cui cade il tono ATTUALE e li rimappa sull'intera altezza — la
 * stessa idea di `tonePosition` (ogni intervallo pesa uguale), applicata a una fetta stretta
 * invece che all'intera scala, che insegue il tono invece di restare un poster fisso.
 *
 * ── SI LEGGE, QUINDI È GRANDE ───────────────────────────────────────────────────────────────
 * I nomi erano a corpo 9 su una colonna larga 190: leggibili col naso sullo schermo, non da
 * seduti (segnalato). Adesso la colonna è larga 260 e i nomi stanno a 13; quelli lunghi
 * (« Serenity of Beingness », « Approval from Bodies ») vanno A CAPO invece di rimpicciolirsi
 * o di uscire dal bordo — meglio due righe che una riga illeggibile.
 *
 * ── E SONO NELLA LINGUA DELLA SEDUTA ────────────────────────────────────────────────────────
 * I nomi dei livelli si traducono come tutto il resto (`levelName`): il preclear legge la sua
 * posizione sulla scala, e leggerla in una lingua che non parla non serve a niente.
 *
 * ── IL « ≈ » NON È UN VEZZO ─────────────────────────────────────────────────────────────────
 * Il significato ASSOLUTO del tono dipende da R_totale, che è ancora una domanda aperta con Ron
 * e comunque dipende dagli elettrodi. Il quadrante lo dice già col `≈`; una colonna grande
 * INVITA a leggerla come assoluta, quindi qui l'avvertenza conta di più, non di meno.
 *
 * Rendering puro: nessuno stato, nessuna decisione.
 */

/**
 * Altezza utile della colonna, in unità del suo viewBox.
 *
 * ⚠️ PIÙ BASSA di prima (era 620): aprendo DIAGNOSTIC i suoi dati finivano SOPRA la colonna
 * (segnalato). Accorciandola si guadagna due volte — non si accavalla più, e siccome il
 * viewBox si accorcia con lei i caratteri restano grandi invece di rimpicciolirsi per stare
 * dentro un riquadro più corto.
 */
const H = 400, W = 260;
const TOP = 26, BOT = TOP + H;

/**
 * Il nome, spezzato in righe che ci stiano.
 *
 * Si taglia sulle PAROLE e mai dentro una parola: « Serenity of Beingness » diventa due righe,
 * « Approval from Bodies » pure. Il limite è in caratteri e non in pixel perché il testo è SVG
 * e misurarlo davvero vorrebbe dire disegnarlo prima — a corpo 13 su 190 unità di larghezza
 * utile ci stanno circa 18 caratteri.
 */
const MAX_CAR = 18;
export function spezza(nome: string, max = MAX_CAR): string[] {
  if (nome.length <= max) return [nome];
  const righe: string[] = [];
  let riga = '';
  for (const parola of nome.split(' ')) {
    if (!riga) { riga = parola; continue; }
    if ((riga + ' ' + parola).length <= max) riga += ' ' + parola;
    else { righe.push(riga); riga = parola; }
  }
  if (riga) righe.push(riga);
  return righe;
}

/**
 * ⚠️ LA LENTE — segnalato: « la scala a sinistra è un poco confusa, deve essere come una lente
 * di ingrandimento... si focalizza sui Toni sopra e sotto quello raggiunto, non si deve vedere
 * tutta la scala, ma solo qualche tono sopra e sotto ». Prima la colonna mostrava SEMPRE i
 * tredici `TONE_LABELS`, dallo zero al fondo scala, in un colpo solo — l'intera scala di Ron
 * compressa nella stessa altezza, indipendentemente da dove si è: a colpo d'occhio, dodici
 * nomi che non contano nulla in questo momento e uno solo che conta.
 *
 * Qui si RITAGLIA una finestra di pochi nodi (`RAGGIO` per lato) attorno al segmento in cui
 * cade il tono attuale, e SI RIMAPPA quella finestra sola sull'intera altezza `H` — la stessa
 * idea di `tonePosition` (ogni intervallo pesa uguale), applicata a una fetta invece che
 * all'intera scala. Il risultato si ricalcola ad ogni tono nuovo: la colonna "insegue" la
 * lettura invece di restare un poster fisso con un cursore che ci scorre sopra.
 *
 * ⚠️ CORRETTO SUBITO DOPO — segnalato: « hai troppi pochi toni. Passi da 9 a 20, devi mettere
 * un certo numero di toni che si seguono, come scala espansa, al fine di aiutare l'auditor per
 * indicare al PC magari il tono successivo da raggiungere ». Vero — i tredici `TONE_LABELS`
 * sono scelti apposta per NON accavallarsi (v. `toneLevels.ts`), quindi restano radi anche
 * nella loro stessa scala intera: fra 9 e 20 non c'è NIENTE, nemmeno nei 62 nomi completi di
 * Ron (`TONE_LEVELS`) — è la scala stessa a non avere un nome lì, non una scelta di questo
 * file. Ma l'auditor non ha bisogno di un NOME per dare un traguardo intermedio al PC — gli
 * basta un NUMERO (« portalo a undici »). `TONI_RIFERIMENTO` (sotto) unisce i 62 nomi di Ron a
 * un intero per ogni unità SENZA un nome già vicino (entro mezzo punto) — dove Ron è fitto
 * (0…9, decine di nomi) restano i nomi suoi, intatti; dove Ron è rado (9…40) la lente si
 * riempie da sola di numeri interi consecutivi, una scala espansa vera, mai un salto più largo
 * di un'unità.
 *
 * Non tocca `tonePosition` (in `toneLevels.ts`, puro, provato, usato anche altrove) — resta
 * la fonte della VERITÀ sulla posizione assoluta; qui si legge solo l'elenco completo dei
 * livelli per costruire la finestra locale.
 */
/** Tutti i 62 nomi di Ron più un intero per ogni unità che ne resta priva — calcolato una sola
 *  volta (non dipende da `tone`, ricalcolarlo ad ogni render sarebbe lavoro sprecato). */
const TONI_RIFERIMENTO: readonly number[] = (() => {
  const nominati = TONE_LEVELS.map(l => l.tone);
  const punti = new Set<number>(nominati);
  for (let i = -TONE_SCALE_MAX; i <= TONE_SCALE_MAX; i++) {
    if (!nominati.some(n => Math.abs(n - i) < 0.5)) punti.add(i);
  }
  return Array.from(punti).sort((a, b) => a - b);
})();
const RAGGIO = 4;
function useFinestra(tone: number) {
  const nodi = TONI_RIFERIMENTO;                           // −40 … +40, già ascendente
  let segIdx = nodi.length - 1;
  for (let i = 1; i < nodi.length; i++) {
    if (tone <= nodi[i]) { segIdx = i; break; }
  }
  const loIdx = Math.max(0, segIdx - 1 - RAGGIO);
  const hiIdx = Math.min(nodi.length - 1, segIdx + RAGGIO);
  const finestra = nodi.slice(loIdx, hiIdx + 1);           // solo i nodi nella lente, ascendente

  const yFinestra = (t: number): number => {
    const tc = Math.max(finestra[0], Math.min(finestra[finestra.length - 1], t));
    const passo = 1 / (finestra.length - 1 || 1);
    for (let i = 1; i < finestra.length; i++) {
      if (tc <= finestra[i]) {
        const q = (tc - finestra[i - 1]) / (finestra[i] - finestra[i - 1]);
        return BOT - ((i - 1) * passo + q * passo) * H;
      }
    }
    return TOP;
  };
  // Fuori dalla lente: non ha senso disegnarlo (sparirebbe schiacciato a un bordo, o peggio
  // suggerirebbe una posizione che non è la sua). I chiamanti controllano `dentro` prima di
  // disegnare qualunque elemento che non sia il tono attuale (sempre dentro, per costruzione).
  const dentro = (t: number): boolean => t >= finestra[0] - 1e-9 && t <= finestra[finestra.length - 1] + 1e-9;

  return { finestra, yFinestra, dentro };
}

export function ToneColumn({ tone, toneEeg, hasMeter, charge, chargeFrom, lang, margin = 0 }: {
  /** Il tono in questo istante, −40…+40. Col meter viene dal TA; senza, lo dichiara l'auditor. */
  tone: number;
  /**
   * IL SECONDO SGUARDO — lo stesso tono letto sulla carica EEG. `null` senza MUSE.
   *
   * Non è un secondo cursore in concorrenza: è l'altra misura dello stesso movimento. Se sale
   * insieme al primo, la salita è confermata da due strumenti indipendenti; se resta indietro,
   * è un'informazione — e sapere che i due non concordano vale più di un numero solo.
   */
  toneEeg?: number | null;
  /**
   * ⚠️ IL MARGINE NON SI SCRIVE PIÙ QUI. Stava sotto la colonna; l'utente l'ha voluto sotto il
   * TONE ARM — « è lì che è interessante » — cioè accanto al numero che corregge, e insieme al
   * bottone che permette di rifare la prova. Resta il parametro perché il tono che arriva È
   * già col margine tolto: chi legge questo componente deve sapere perché.
   */
  margin?: number;
  /** La lingua della seduta: i nomi dei livelli si traducono come tutto il resto. */
  lang: string;
  /** C'è il meter? Senza, il numero non si mostra: resterebbe una cifra senza misura. */
  hasMeter: boolean;
  /** Carica EEG in corso (0..1), se il MUSE c'è: disegna DA DOVE si è partiti a ORA. */
  charge?: number | null;
  /** Il tono di PARTENZA del ciclo — il segmento fra i due dice se si sta salendo o scendendo. */
  chargeFrom?: number | null;
}) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv);

  const inchiostro = isLightTheme ? '#1a1a1f' : 'rgba(240,246,255,0.98)';
  // ⚠️ MOLTO PIÙ CONTRASTATE DI PRIMA (erano 0,42 e 0,38). La colonna passa SOPRA l'arco, e
  // sopra un arco chiaro un grigio al 40% non si legge: le etichette c'erano e non si
  // vedevano (segnalato). Il pannello di fondo qui sotto fa il resto del lavoro.
  const tenue      = isLightTheme ? 'rgba(26,26,31,0.78)' : 'rgba(240,246,255,0.80)';
  const tacca      = isLightTheme ? 'rgba(26,26,31,0.45)' : 'rgba(226,238,255,0.42)';

  const { finestra, yFinestra, dentro } = useFinestra(tone);
  const yOra = yFinestra(tone);
  const liv  = levelAt(tone);
  const nomeLiv = levelName(liv.name, lang);
  // Il percorso del ciclo: da dove si è partiti a dove si è adesso. Se sale, è il lavoro che
  // sta funzionando; se scende, l'auditor lo deve vedere subito.
  // ⚠️ `dentro(chargeFrom)` — la lente segue il tono ATTUALE: il punto di partenza di un ciclo
  // lungo può restare ben fuori dalla finestra di oggi. Fuori lente, niente percorso disegnato
  // (non un segmento troncato che punterebbe a un bordo arbitrario) — resta comunque nel
  // Giornale e nel numero del ciclo, solo non su QUESTA colonna ritagliata.
  const yDa   = (chargeFrom != null && dentro(chargeFrom)) ? yFinestra(chargeFrom) : null;
  const sale  = yDa != null && yOra < yDa;

  return (
    <svg viewBox={`0 0 ${W} ${BOT + 28}`} width="100%" height="100%"
         style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      {/* ── IL PANNELLO DI FONDO ────────────────────────────────────────────────────────
          La colonna sta SOPRA l'arco, e va bene così (richiesta utente) — ma sopra i tratti
          dell'arco le scritte si perdevano. Un fondo appena velato le stacca senza nascondere
          l'arco: si vede attraverso, e il testo si legge. */}
      <rect x={30} y={TOP - 20} width={W - 32} height={H + 42} rx={14}
            fill={isLightTheme ? 'rgba(238,240,244,0.72)' : 'rgba(11,15,20,0.72)'}
            stroke={isLightTheme ? 'rgba(26,26,31,0.12)' : 'rgba(226,238,255,0.14)'} strokeWidth={1} />
      {/* L'asta */}
      <line x1={54} y1={TOP} x2={54} y2={BOT} stroke={tacca} strokeWidth={1.5} />

      {/* LO ZERO — la sola tacca marcata, e solo se la lente lo inquadra: con la finestra
          ritagliata attorno al tono attuale, lo zero può restare fuori (si è saliti oltre 9,
          o si è scesi sotto −10) — disegnarlo comunque, fuori scala, direbbe una posizione
          falsa. */}
      {dentro(0) && (
        <line x1={44} y1={yFinestra(0)} x2={64} y2={yFinestra(0)} stroke={inchiostro} strokeWidth={2.2} />
      )}

      {/* ── LA LENTE — v. `useFinestra`, in testa al file, per il perché. Solo i nodi DENTRO la
          finestra attorno al tono attuale, rimappati per occupare l'intera altezza — non più i
          tredici fissi dell'intera scala. */}
      {finestra.map(t => {
        const en = exactLevelName(t);
        const nome = en ? levelName(en, lang) : undefined;
        const yy = yFinestra(t);
        const righe = nome ? spezza(nome) : [];
        return (
          <g key={`l${t}`}>
            <line x1={54} y1={yy} x2={66} y2={yy} stroke={tacca} strokeWidth={1.2} />
            <text x={72} y={yy + 5} fill={tenue}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 800,
                           letterSpacing: '0.01em' }}>
              {t > 0 ? `+${t}` : `${t}`}
            </text>
            {/* IL NOME SI CENTRA SULLA TACCA. Partiva DALLA tacca e scendeva: i nomi a due
                righe (« Serenità dell'essere », « Non potersi nascondere ») finivano addosso
                all'etichetta sotto. Centrato, un nome di due righe occupa ±12 su 33 unità di
                passo e non tocca né sopra né sotto. */}
            {righe.map((r, i) => (
              <text key={i} x={116} y={yy + 4 - (righe.length - 1) * 6 + i * 12.5} fill={tenue}
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 13, opacity: 0.92 }}>
                {r}
              </text>
            ))}
          </g>
        );
      })}

      {/* IL PERCORSO DEL CICLO — da dove si è partiti a ora. Ambra come ogni « valore in
          gioco » dell'app; è l'unico colore che la colonna si permette. */}
      {yDa != null && Math.abs(yDa - yOra) > 1 && (
        <>
          <line x1={54} y1={yDa} x2={54} y2={yOra} stroke={TOKEN.warn} strokeWidth={4}
                strokeLinecap="round" opacity={0.55} />
          <line x1={44} y1={yDa} x2={66} y2={yDa} stroke={TOKEN.warn} strokeWidth={1.6} opacity={0.7} />
        </>
      )}

      {/* ── IL SECONDO SGUARDO (EEG) ────────────────────────────────────────────────────
          Una marca sottile a sinistra dell'asta, senza scritte: si guarda se sale INSIEME al
          cursore, non che numero fa. Solo col MUSE, e solo se dice qualcosa di diverso — a un
          decimo di divisione dal cursore sarebbe una riga sopra l'altra. */}
      {toneEeg != null && dentro(toneEeg) && Math.abs(yFinestra(toneEeg) - yOra) > 3 && (
        <g>
          <line x1={40} y1={yFinestra(toneEeg)} x2={62} y2={yFinestra(toneEeg)}
                stroke={inchiostro} strokeWidth={1.6} opacity={0.5} strokeDasharray="3 3" />
          <text x={30} y={yFinestra(toneEeg) - 4} textAnchor="end" fill={inchiostro}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, opacity: 0.55 }}>
            EEG
          </text>
        </g>
      )}

      {/* IL CURSORE — dove si è adesso, col nome del livello per esteso. È la sola scritta che
          il preclear cerca davvero: sta più grande di tutto il resto, e va a capo se serve.

          ⚠️ HA UN FONDO PIENO. Senza, le sue due righe si mescolavano alle etichette fisse che
          gli passano dietro e non si leggeva né l'uno né le altre. Il fondo è il colore della
          scena: copre, non oscura. */}
      {(() => {
        const righeC = spezza(nomeLiv);
        const alt = 26 + righeC.length * 17;
        return (
          <g>
            <rect x={68} y={yOra - alt / 2} width={W - 70} height={alt} rx={6}
                  fill={isLightTheme ? '#eef0f4' : '#0b0f14'} opacity={0.92} />
            <polygon points={`36,${yOra - 7} 52,${yOra} 36,${yOra + 7}`} fill={inchiostro} />
            <line x1={36} y1={yOra} x2={66} y2={yOra} stroke={inchiostro} strokeWidth={2} />
            <text x={74} y={yOra - alt / 2 + 19} fill={inchiostro}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 20, fontWeight: 800 }}>
              {/* Il « ≈ » dice « misurato, ma non in ohm veri ». Senza meter il numero non è
                  misurato affatto: è quel che l'auditor ha dichiarato, e si scrive netto. */}
              {hasMeter ? `≈ ${tone > 0 ? '+' : ''}${tone.toFixed(1)}`
                        : `${tone > 0 ? '+' : ''}${tone.toFixed(0)}`}
            </text>
            {righeC.map((r, i) => (
              <text key={i} x={74} y={yOra - alt / 2 + 38 + i * 17} fill={inchiostro}
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, opacity: 0.95 }}>
                {r}
              </text>
            ))}
          </g>
        );
      })()}

      {/* LA CARICA DEL MUSE — una barretta a sinistra dell'asta: quanta ce n'è adesso.
          Non è un tono: è l'altra sorgente, e sta separata apposta. */}
      {charge != null && (
        <>
          <rect x={18} y={TOP} width={7} height={H} rx={3.5} fill={tacca} opacity={0.35} />
          <rect x={18} y={BOT - Math.max(0, Math.min(1, charge)) * H} width={7}
                height={Math.max(0, Math.min(1, charge)) * H} rx={3.5} fill={TOKEN.warn} opacity={0.75} />
        </>
      )}

      {/* Il verso, detto una volta: si SALE. */}
      <text x={54} y={TOP - 11} textAnchor="middle" fill={tenue}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 13, letterSpacing: '0.18em' }}>
        {sale ? '▲' : ''}
      </text>
    </svg>
  );
}
