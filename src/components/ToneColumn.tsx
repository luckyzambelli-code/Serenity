import React from 'react';
import { useUiStore } from '../store/uiStore';
import { TONE_LABELS, levelAt, exactLevelName, tonePosition, levelName } from '../engine/toneLevels';
import { pick5 } from '../i18n5';
import { TOKEN } from '../ui/tokens';

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
 * Ora ogni intervallo fra due etichette scritte occupa la stessa altezza (`tonePosition`, dove
 * si prova). Si perde la proporzione e si tiene il verso — il « quanto » è dell'ago, che resta
 * lineare; la colonna dice DOVE SI È e SE SI SALE.
 *
 * I nomi degli altri livelli restano fuori: li dice il cursore, per esteso.
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

/** Tono → y nel viewBox. +40 in alto, −40 in basso. La mappatura vive in `toneLevels`
 *  (`tonePosition`), dove si prova: qui si converte soltanto in coordinate. */
const y = (tone: number): number => BOT - tonePosition(tone) * H;

export function ToneColumn({ tone, toneEeg, hasMeter, charge, chargeFrom, lang }: {
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

  const inchiostro = isLightTheme ? '#1a1a1f' : 'rgba(240,246,255,0.98)';
  // ⚠️ MOLTO PIÙ CONTRASTATE DI PRIMA (erano 0,42 e 0,38). La colonna passa SOPRA l'arco, e
  // sopra un arco chiaro un grigio al 40% non si legge: le etichette c'erano e non si
  // vedevano (segnalato). Il pannello di fondo qui sotto fa il resto del lavoro.
  const tenue      = isLightTheme ? 'rgba(26,26,31,0.78)' : 'rgba(240,246,255,0.80)';
  const tacca      = isLightTheme ? 'rgba(26,26,31,0.45)' : 'rgba(226,238,255,0.42)';

  const yOra = y(tone);
  const liv  = levelAt(tone);
  const nomeLiv = levelName(liv.name, lang);
  // Il percorso del ciclo: da dove si è partiti a dove si è adesso. Se sale, è il lavoro che
  // sta funzionando; se scende, l'auditor lo deve vedere subito.
  const yDa   = chargeFrom != null ? y(chargeFrom) : null;
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

      {/* LO ZERO — la sola tacca marcata. Le nove tacche dei multipli di dieci non si
          disegnano più: con la colonna adattata cadono dove capita rispetto alle etichette,
          e due griglie sovrapposte con passi diversi si leggono peggio di una. Lo zero resta
          perché è il confine, e si vede a colpo d'occhio dov'è. */}
      <line x1={44} y1={y(0)} x2={64} y2={y(0)} stroke={inchiostro} strokeWidth={2.2} />

      {/* LE ETICHETTE RADE — le tredici scelte, col nome del livello nella lingua in corso.
          Il nome va SOTTO il numero e non di fianco: di fianco, a corpo leggibile, i nomi
          lunghi uscivano dalla colonna. Sotto, ognuno ha la sua riga (o due). */}
      {TONE_LABELS.map(t => {
        const en = exactLevelName(t);
        const nome = en ? levelName(en, lang) : undefined;
        const yy = y(t);
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
      {toneEeg != null && Math.abs(y(toneEeg) - yOra) > 3 && (
        <g>
          <line x1={40} y1={y(toneEeg)} x2={62} y2={y(toneEeg)}
                stroke={inchiostro} strokeWidth={1.6} opacity={0.5} strokeDasharray="3 3" />
          <text x={30} y={y(toneEeg) - 4} textAnchor="end" fill={inchiostro}
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
