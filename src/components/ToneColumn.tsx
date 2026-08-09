import React from 'react';
import { useUiStore } from '../store/uiStore';
import { TONE_LABELS, TONE_DECADES, levelAt, exactLevelName, tonePosition } from '../engine/toneLevels';
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
 * ── LINEARE, E IL NOME COME TESTO ───────────────────────────────────────────────────────────
 * L'asse è lineare in tono, perché è l'unico modo di restare fedele all'ago. Ma la scala è
 * fitta in basso e rada in alto: fra 0 e 4 ci sono venticinque livelli. Scrivere i nomi alla
 * loro posizione li accavallerebbe tutti in un centimetro. Quindi: sulla colonna solo le
 * diciotto etichette rade, e il nome del livello in cui si è come TESTO accanto al cursore —
 * sempre leggibile, qualunque sia l'affollamento.
 *
 * ── IL « ≈ » NON È UN VEZZO ─────────────────────────────────────────────────────────────────
 * Il significato ASSOLUTO del tono dipende da R_totale, che è ancora una domanda aperta con Ron
 * e comunque dipende dagli elettrodi. Il quadrante lo dice già col `≈`; una colonna grande
 * INVITA a leggerla come assoluta, quindi qui l'avvertenza conta di più, non di meno.
 *
 * Rendering puro: nessuno stato, nessuna decisione.
 */

/** Altezza utile della colonna, in unità del suo viewBox. */
const H = 620, W = 190;
const TOP = 24, BOT = TOP + H;

/** Tono → y nel viewBox. +40 in alto, −40 in basso. La mappatura vive in `toneLevels`
 *  (`tonePosition`), dove si prova: qui si converte soltanto in coordinate. */
const y = (tone: number): number => BOT - tonePosition(tone) * H;

export function ToneColumn({ tone, hasMeter, charge, chargeFrom }: {
  /** Il tono in questo istante, −40…+40. */
  tone: number;
  /** C'è il meter? Senza, il numero non si mostra: resterebbe una cifra senza misura. */
  hasMeter: boolean;
  /** Carica EEG in corso (0..1), se il MUSE c'è: disegna DA DOVE si è partiti a ORA. */
  charge?: number | null;
  /** Il tono di PARTENZA del ciclo — il segmento fra i due dice se si sta salendo o scendendo. */
  chargeFrom?: number | null;
}) {
  const isLightTheme = useUiStore(s => s.isLightTheme);

  const inchiostro = isLightTheme ? '#1a1a1f' : 'rgba(240,246,255,0.96)';
  const tenue      = isLightTheme ? 'rgba(58,58,64,0.42)' : 'rgba(226,238,255,0.38)';
  const tacca      = isLightTheme ? 'rgba(58,58,64,0.30)' : 'rgba(226,238,255,0.26)';

  const yOra = y(tone);
  const liv  = levelAt(tone);
  // Il percorso del ciclo: da dove si è partiti a dove si è adesso. Se sale, è il lavoro che
  // sta funzionando; se scende, l'auditor lo deve vedere subito.
  const yDa   = chargeFrom != null ? y(chargeFrom) : null;
  const sale  = yDa != null && yOra < yDa;

  return (
    <svg viewBox={`0 0 ${W} ${BOT + 26}`} width="100%" height="100%"
         style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      {/* L'asta */}
      <line x1={54} y1={TOP} x2={54} y2={BOT} stroke={tacca} strokeWidth={1.5} />

      {/* GLI OTTO SEGMENTI — un multiplo di dieci per tacca, nove tacche. */}
      {TONE_DECADES.map(d => (
        <line key={`d${d}`} x1={46} y1={y(d)} x2={62} y2={y(d)}
              stroke={d === 0 ? inchiostro : tacca} strokeWidth={d === 0 ? 2 : 1.4} />
      ))}

      {/* LE ETICHETTE RADE — le diciotto scelte, col nome del livello. */}
      {TONE_LABELS.map(t => {
        const nome = exactLevelName(t);
        const yy = y(t);
        return (
          <g key={`l${t}`}>
            <line x1={54} y1={yy} x2={64} y2={yy} stroke={tacca} strokeWidth={1} />
            <text x={68} y={yy + 3} fill={tenue}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.02em' }}>
              <tspan style={{ fontWeight: 700 }}>{t > 0 ? `+${t}` : `${t}`}</tspan>
              {nome ? <tspan dx={5} style={{ opacity: 0.85 }}>{nome}</tspan> : null}
            </text>
          </g>
        );
      })}

      {/* IL PERCORSO DEL CICLO — da dove si è partiti a ora. Ambra come ogni « valore in
          gioco » dell'app; è l'unico colore che la colonna si permette. */}
      {yDa != null && Math.abs(yDa - yOra) > 1 && (
        <>
          <line x1={54} y1={yDa} x2={54} y2={yOra} stroke={TOKEN.warn} strokeWidth={4}
                strokeLinecap="round" opacity={0.55} />
          <line x1={44} y1={yDa} x2={64} y2={yDa} stroke={TOKEN.warn} strokeWidth={1.4} opacity={0.7} />
        </>
      )}

      {/* IL CURSORE — dove si è adesso, col nome del livello per esteso. */}
      <g>
        <polygon points={`38,${yOra - 6} 52,${yOra} 38,${yOra + 6}`} fill={inchiostro} />
        <line x1={38} y1={yOra} x2={64} y2={yOra} stroke={inchiostro} strokeWidth={2} />
        <text x={68} y={yOra - 6} fill={inchiostro}
              style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 800 }}>
          {hasMeter ? `≈ ${tone > 0 ? '+' : ''}${tone.toFixed(1)}` : '—'}
        </text>
        <text x={68} y={yOra + 8} fill={inchiostro}
              style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700, opacity: 0.9 }}>
          {liv.name}
        </text>
      </g>

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
      <text x={54} y={TOP - 10} textAnchor="middle" fill={tenue}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 8, letterSpacing: '0.18em' }}>
        {sale ? '▲' : ''}
      </text>
    </svg>
  );
}
