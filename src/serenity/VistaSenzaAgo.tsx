import React from 'react';
import { useMetric } from '../store/metricsStore';
import { useTZone } from '../store/tzoneStore';
import { chargeStateById, type ChargeStateId } from '../lib/chargeState';
import { SWEEP_DEG } from '../engine/dialGeometry';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';

/**
 * VistaSenzaAgo — LA SEDUTA SENZA AGO: SOLO I COLORI DI ZONA E LA VELOCITÀ.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Chiesto direttamente: « vorrei una vista in più dell'arco con l'ago (con bottone slide per
 * scegliere, come per LIGHT/DARK) in cui non mostri l'ago né l'arco, ma solo i colori di
 * CONTACT, DISSOLUTION, AS-IS e la velocità di liberazione — elegante, futurista ma efficiente
 * e molto comprensibile, mantenendo tutte le scritte ed i cicli presenti quando c'è l'arco ».
 * Una SECONDA resa dello STESSO dato di `ClearDial` (`chargePhase`/`cycleKind`/`nullPhase`,
 * lo stesso `metricsStore` e `tzoneStore` — nessuna logica nuova, nessun numero ricalcolato),
 * al posto di `QuantumSphere`+`ClearDial` insieme quando l'auditor sceglie questa vista invece
 * di quella con l'ago (`vistaSenzaAgo`, `Serenity.tsx` — il gemello di `isLightTheme`, stessa
 * tecnica di scelta persistita).
 *
 * ── PERCHÉ NON RIUSA `ClearDial` DIRETTAMENTE ──────────────────────────────────────────────
 * `ClearDial` È un ANELLO SOTTILE pensato per stare CONCENTRICO all'ago (`CYCLE_R=461`,
 * `CYCLE_CORE=10` — un filo, non una banda) — corretto quando l'ago occupa il centro e questo
 * gli gira intorno. Qui l'ago non c'è: la STESSA informazione (le tre zone, il puntino di
 * avanzamento) diventa la protagonista, non un contorno — banda molto più spessa, raggio più
 * grande, un centro libero per la lettura in parole (fase + velocità) invece che vuoto. Stessa
 * geometria (`off2ang`/`SWEEP_DEG`, `engine/dialGeometry.ts` — l'unica fonte per l'angolo, mai
 * duplicata a caso), STESSI colori (`chargeStateById`, `lib/chargeState.ts` — il file che
 * dice esplicitamente « una funzione → un colore, usato dalla sfera E dall'ago, così le due
 * viste non si contraddicono mai »: questa è una TERZA vista, stessa regola), solo una resa
 * diversa — un componente a sé, non una variante con `if` sparsi dentro `ClearDial`.
 *
 * ── LA VELOCITÀ, VISIBILE E NON SOLO SCRITTA ────────────────────────────────────────────────
 * `velRatio` (`metricsStore`, la STESSA fonte di `LetturaVelocita` in `Serenity.tsx` — lo
 * stesso numero, non un secondo calcolo) governa il RITMO dell'impulso della zona attiva: più
 * veloce il rilascio, più veloce l'impulso — leggibile a colpo d'occhio, "efficiente e molto
 * comprensibile" come chiesto, prima ancora di leggere il numero. Il numero resta comunque
 * scritto (stessa parola/freccia di `LetturaVelocita`) per chi vuole la precisione.
 *
 * ── I CICLI CHE NON CI STANNO — MIRROR e TONE ───────────────────────────────────────────────
 * Non toccati: hanno le loro scale (1–10 il raddoppio, −40…+60 il tono), non "CONTACT ·
 * DISSOLUTION · AS-IS" — inventare qui una loro traduzione visiva non è stato chiesto.
 * `Serenity.tsx` monta questo componente SOLO quando né MIRROR né TONE sono armati (lo stesso
 * punto dove monta `ClearDial` oggi); `MirrorDial`/`ToneDial` restano quel che sono, con o
 * senza `vistaSenzaAgo` — non disegnano un ago vero e proprio da nascondere.
 */

const VW = 1600, VH = 850;
const PX = VW / 2, PY = VH - 60;   // STESSO perno di QuantumSphere/ClearDial — mai spostato
const R = 610;                      // banda grande: qui è lei la protagonista, non un contorno
const CORE = 30;                    // spessore della banda — molto più di ClearDial (10): non un filo
const GAP = 0.045;

type ChargeId = ChargeStateId;
const ORDER: Record<ChargeId, number> = { neutral: -1, contact: 0, discharge: 1, asis: 2 };
const PHASES: ChargeId[] = ['contact', 'discharge', 'asis'];
const SEG: Record<string, [number, number]> = { contact: [-1, -1 / 3], discharge: [-1 / 3, 1 / 3], asis: [1 / 3, 1] };

type NullId = 'null' | 'rise' | 'clear_read';
const NULL_IDS: NullId[] = ['null', 'rise', 'clear_read'];
const NULL_ORDER: Record<string, number> = { neutral: -1, null: 0, rise: 1, clear_read: 2 };
const NULL_SEG: Record<string, [number, number]> = { null: [-1, -1 / 3], rise: [-1 / 3, 1 / 3], clear_read: [1 / 3, 1] };
const NULL_LABEL: Record<string, string> = { null: 'NULL', rise: 'RISE', clear_read: 'EQUILIBRIUM' };
const NULL_DARK: Record<string, string> = { null: '#94a3b8', rise: '#fbbf24', clear_read: '#d6ffff' };
const NULL_LIGHT: Record<string, string> = { null: '#64748b', rise: '#b45309', clear_read: '#0e7490' };
// STESSI valori di `ClearDial.tsx`'s `LIGHT_PHASE` — non esportati da lì (componente condiviso
// con EQUILIBRIUM, si preferisce non toccarlo per questa sola aggiunta SOLO-SERENITY):
// duplicati qui UNA volta, con la fonte scritta sopra ogni riga che li usa.
const LIGHT_PHASE: Record<string, string> = { contact: '#b3402a', discharge: '#157a4a', asis: '#0e7490' };

const off2ang = (off: number) => 90 - off * SWEEP_DEG;
const apt = (ang: number, r: number) => { const a = ang * Math.PI / 180; return { x: PX + r * Math.cos(a), y: PY - r * Math.sin(a) }; };
const aseg = (o0: number, o1: number, r: number) => {
  const s = apt(off2ang(o0), r), e = apt(off2ang(o1), r);
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 0 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
};
const band = (o0: number, o1: number, rIn: number, rOut: number) => {
  const a0 = off2ang(o0), a1 = off2ang(o1);
  const p1o = apt(a0, rOut), p2o = apt(a1, rOut), p2i = apt(a1, rIn), p1i = apt(a0, rIn);
  return `M ${p1o.x.toFixed(1)} ${p1o.y.toFixed(1)} A ${rOut} ${rOut} 0 0 1 ${p2o.x.toFixed(1)} ${p2o.y.toFixed(1)} L ${p2i.x.toFixed(1)} ${p2i.y.toFixed(1)} A ${rIn} ${rIn} 0 0 0 ${p1i.x.toFixed(1)} ${p1i.y.toFixed(1)} Z`;
};

export function VistaSenzaAgo({ armed = true, cycleKind = 'charge', nullPhase = 'neutral', isLightTheme = false }: {
  armed?: boolean;
  /** Il ciclo SCELTO — v. `ClearDial`, la stessa prop, lo stesso significato. */
  cycleKind?: 'charge' | 'null';
  nullPhase?: NullId | 'neutral';
  isLightTheme?: boolean;
}) {
  const { t, lang } = useI18n();
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);
  const phase = useMetric(m => m.chargePhase);
  const velRatio = useMetric(m => m.velRatio);
  const { cyclePeakQ } = useTZone();
  const qLNow = useMetric(m => m.qL);
  const pct = cyclePeakQ > 0.001 ? Math.max(0, Math.min(1, (cyclePeakQ - Math.max(0, qLNow)) / cyclePeakQ)) : 0;

  const isNull = cycleKind === 'null';
  const IDS: string[] = isNull ? (NULL_IDS as string[]) : (PHASES as string[]);
  const SEG_OF: Record<string, [number, number]> = isNull ? NULL_SEG : SEG;
  const ORDER_OF: Record<string, number> = isNull ? NULL_ORDER : (ORDER as Record<string, number>);
  const colorOf = (id: string): string => isNull
    ? ((isLightTheme ? NULL_LIGHT[id] : NULL_DARK[id]) ?? '#64748b')
    : (isLightTheme ? (LIGHT_PHASE[id] ?? '#475569') : chargeStateById(id as ChargeId).color);
  const labelOf = (id: string): string => isNull
    ? (NULL_LABEL[id] ?? id)
    : (t(chargeStateById(id as ChargeId).labelKey as never) as string);
  const effId: string = isNull ? (armed ? nullPhase : 'neutral') : (armed ? phase : 'neutral');
  const cur = armed ? (ORDER_OF[effId] ?? -1) : -1;

  // Lo stesso puntino di avanzamento di `ClearDial` — STESSA lettura del dato, non un secondo
  // calcolo: scorre nella DISSOLUTION col blow-down (pct), salta a fine banda e pulsa
  // sull'AS-IS confermato, sta al centro delle altre zone.
  let dotOff = SEG_OF[effId] ? (SEG_OF[effId][0] + SEG_OF[effId][1]) / 2 : 0;
  let dotPulse = false;
  if (!isNull && effId === 'discharge') { const [a, b] = SEG.discharge; dotOff = a + (b - a) * pct; }
  else if (!isNull && effId === 'asis') { dotOff = 1; dotPulse = true; }
  else if (isNull && effId === 'clear_read') dotPulse = true;
  const dot = apt(off2ang(dotOff), R);

  // ── LA VELOCITÀ, A RITMO — segnalato: « la velocità di liberazione », « molto comprensibile ».
  // `velRatio` guida la DURATA dell'impulso della zona attiva: più veloce il rilascio, più
  // veloce l'impulso — si legge prima di leggere il numero. Limiti [0.5s, 2.2s]: sotto 0.5s
  // un lampeggio smette di leggersi come "ritmo" e diventa solo rumore; sopra 2.2s pare fermo.
  const pulseS = Math.max(0.5, Math.min(2.2, 1.3 / Math.max(0.25, velRatio)));
  const stVel = velRatio >= 1.15 ? 'fast' : velRatio < 0.85 ? 'slow' : 'norm';
  const wordVel = t(stVel === 'fast' ? 'rel_fast' : stVel === 'slow' ? 'rel_slow' : 'rel_norm') as string;
  const arrowVel = stVel === 'fast' ? '↑' : stVel === 'slow' ? '↓' : '';

  const dimCol = isLightTheme ? '#94a3b8' : '#64748b';
  const activeCol = armed && effId !== 'neutral' ? colorOf(effId) : dimCol;
  const textCol = isLightTheme ? '#0f172a' : 'rgba(240,246,255,0.95)';
  const textFaint = isLightTheme ? '#64748b' : 'rgba(200,214,234,0.6)';

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <style>{`
        @keyframes vsaPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <filter id="vsa-seg-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="14" result="b1" />
            <feGaussianBlur stdDeviation="5" result="b2" />
            <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="vsa-text-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={isLightTheme ? '#ffffff' : '#04101c'} floodOpacity="0.9" />
          </filter>
          {IDS.map(id => (
            <path key={`vsa-lp-${id}`} id={`vsa-lbl-${id}`} d={aseg(SEG_OF[id][0], SEG_OF[id][1], R - 74)} fill="none" />
          ))}
        </defs>
        {/* ⚠️ SEGNALATO — CONTRASTO IN LIGHT: le tre zone a riposo (nessun ciclo armato) erano
            quasi invisibili in tema chiaro. Due cause, la STESSA famiglia di bug già trovata
            altrove in questa stessa sessione (`readyCheckLight.css`, `PannelloMeter.tsx`):
            un'opacità frazionaria sfuma verso lo SFONDO SOTTOSTANTE, non verso un grigio
            fisso — su nero (dark) un residuo del genere resta un alone colorato visibile, su
            bianco (light) si perde quasi del tutto. Qui la cosa raddoppiava: l'intero gruppo
            scendeva a 0.45 quando NON armato, E ogni segmento (nessuno "attivo"/"fatto" a
            riposo) scendeva GIÀ a 0.22 per conto suo — 0.45×0.22 ≈ 0.10, decimo di opacità.
            Tolta la dimenticanza del gruppo (ridondante: `cur=-1` a riposo fa già scendere
            OGNI segmento alla sua opacità "quieta" da solo, un secondo livello sopra non
            aggiungeva nulla se non lo sbiadire eccessivo) — resta un solo livello di
            attenuazione, e quel livello ora è più alto in LIGHT (0.4) che in DARK (0.22): la
            stessa percentuale sfuma diversamente su fondi opposti, va tarata per ciascuno,
            non condivisa alla cieca. */}
        <g>
          {/* IL CANALE — lo stesso rilievo scavato di `ClearDial`, in scala maggiore: dà
              profondità alla banda invece di lasciarla piatta. */}
          <path d={band(-1, 1, R - CORE / 2 - 10, R + CORE / 2 + 10)} fill={isLightTheme ? 'rgba(15,23,42,0.06)' : 'rgba(0,0,0,0.38)'} />
          <path d={aseg(-1, 1, R + CORE / 2 + 10)} fill="none" stroke={isLightTheme ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.14)'} strokeWidth="2.5" />
          <path d={aseg(-1, 1, R - CORE / 2 - 10)} fill="none" stroke={isLightTheme ? 'rgba(15,23,42,0.18)' : 'rgba(0,0,0,0.5)'} strokeWidth="2.5" />
          {IDS.map(id => {
            const [o0, o1] = SEG_OF[id];
            const do0 = o0 <= -0.999 ? o0 : o0 + GAP;
            const do1 = o1 >= 0.999 ? o1 : o1 - GAP;
            const active = cur === ORDER_OF[id], done = cur > ORDER_OF[id];
            const dimOp = isLightTheme ? 0.4 : 0.22;
            const doneOp = isLightTheme ? 0.75 : 0.55;
            return (
              <path key={id} d={aseg(do0, do1, R)} stroke={colorOf(id)} strokeWidth={CORE}
                fill="none" strokeLinecap="round"
                opacity={active ? 1 : done ? doneOp : dimOp}
                style={active ? { animation: `vsaPulse ${pulseS}s ease-in-out infinite` } : undefined}
                filter={active || done ? 'url(#vsa-seg-glow)' : undefined} />
            );
          })}
          {IDS.map(id => (
            <text key={`t-${id}`} fill={textCol} filter="url(#vsa-text-glow)"
              fontSize="30" fontWeight={cur === ORDER_OF[id] ? 800 : 500}
              opacity={cur === ORDER_OF[id] ? 1 : (isLightTheme ? 0.65 : 0.5)}>
              <textPath href={`#vsa-lbl-${id}`} startOffset="50%" textAnchor="middle" style={{ letterSpacing: '0.14em' }}>
                {labelOf(id)}
              </textPath>
            </text>
          ))}
          {armed && effId !== 'neutral' && (
            <circle cx={dot.x.toFixed(1)} cy={dot.y.toFixed(1)} r="15" fill={activeCol}
              filter="url(#vsa-seg-glow)"
              style={dotPulse ? { animation: `vsaPulse ${pulseS}s ease-in-out infinite` } : undefined} />
          )}
        </g>
      </svg>
      {/* ── IL CENTRO — libero dall'ago, ora la fase in parole grandi + la velocità a ritmo E
          in cifre. Stessa fonte di `LetturaFase`/`LetturaVelocita` (`Serenity.tsx`) — lo
          stesso `metricsStore`, non un secondo lettore: qui solo perché quel componente resta
          locale a `Serenity.tsx` e questo file non può importarlo senza un giro circolare. */}
      <div style={{
        position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        fontFamily: 'var(--s-sans)', textAlign: 'center', pointerEvents: 'none',
      }}>
        <span style={{
          fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-hero)', fontWeight: 700,
          color: armed && effId !== 'neutral' ? activeCol : textFaint,
          letterSpacing: '0.02em',
        }}>
          {armed && effId !== 'neutral' ? labelOf(effId) : L('in attesa', 'en attente', 'waiting', 'en espera', 'väntar')}
        </span>
        {armed && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: textFaint, fontVariantNumeric: 'tabular-nums' }}>
              {L('velocità', 'vitesse', 'speed', 'velocidad', 'hastighet')} {velRatio.toFixed(2)}× {wordVel}{arrowVel}
            </span>
            {/* ── LA VELOCITÀ, ANCHE COME BARRA — segnalato: « la vitesse deve essere una barra
                slide ». Il numero da solo si legge, ma va CERCATO; una barra si vede — una
                pista a tre zone (lento/normale/veloce, gli stessi limiti di `stVel` sopra,
                nessuna soglia reinventata qui). Il colore riusa i DUE segnali che già hanno
                questo significato altrove in SERENITY (`tokens.css`, « i tre segnali »):
                `--s-alive` ("qualcosa sta accadendo sull'ago") per veloce, `--s-reserve` ("non
                sostenibile") per lento — non due tinte nuove, gli stessi due segnali usati per
                il loro significato vero.
                ⚠️ SEGNALATO DI NUOVO: « falla più luminosa, come per l'arco, ma con una barra
                di progressione non una pallina ». Il cursore tondo diceva UN punto; una barra
                RIEMPITA dice un PERCORSO — quanta strada la velocità ha già fatto verso il suo
                estremo, la stessa lettura "a colpo d'occhio" della banda di zona sopra. Stesso
                trattamento luminoso dei segmenti dell'arco: colore PIENO (non più un 35%
                stemperato) e un `boxShadow` che imita il filtro `vsa-seg-glow` (due sfocature,
                stretta+larga) — un `<div>` HTML non può usare un filtro SVG, il bagliore si
                ottiene impilando più ombre. */}
            <div style={{ position: 'relative', width: 200, height: 10 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 999, overflow: 'hidden',
                display: 'flex', background: 'var(--s-disc-sunk)',
              }}>
                <div style={{ flex: '0.85', background: `color-mix(in srgb, var(--s-reserve) ${isLightTheme ? 22 : 16}%, transparent)` }} />
                <div style={{ flex: '0.30', background: `color-mix(in srgb, var(--s-ink-faint) ${isLightTheme ? 18 : 14}%, transparent)` }} />
                <div style={{ flex: '0.85', background: `color-mix(in srgb, var(--s-alive) ${isLightTheme ? 22 : 16}%, transparent)` }} />
              </div>
              {(() => {
                const fillCol = stVel === 'fast' ? 'var(--s-alive)' : stVel === 'slow' ? 'var(--s-reserve)' : textCol;
                const fillPct = Math.max(2, Math.min(100, ((velRatio - 0.4) / (1.8 - 0.4)) * 100));
                return (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0, width: `${fillPct}%`,
                    borderRadius: 999, background: fillCol,
                    boxShadow: `0 0 3px ${fillCol}, 0 0 10px ${fillCol}, 0 0 18px color-mix(in srgb, ${fillCol} 70%, transparent)`,
                    transition: 'width 0.3s ease',
                  }} />
                );
              })()}
            </div>
            {/* ── LA DISSOLUZIONE (CONTACT), STESSA BARRA — segnalato: « la percentuale di
                dissoluzione in contact mettila sotto la velocità con lo stesso design di
                barra di progressione ». `pct` (sopra) è la STESSA percentuale che già muove
                il puntino sulla banda DISSOLUTION — non un secondo calcolo, solo una seconda
                resa dello stesso numero, come lo era la barra della velocità rispetto alla
                sua cifra. Una sola pista (non tre zone: qui non c'è "lento/normale/veloce",
                solo "quanto manca") che si riempie da sinistra, stesso colore pieno + bagliore
                impilato della barra sopra.
                ⚠️ SOLO CONTACT — la NULL avrebbe bisogno di una "ricarica" concettualmente
                opposta (quanto la resistenza è RISALITA dopo il mock-up, non quanto è caduta
                da un picco) e nessuna metrica del genere esiste ancora nel codice
                (`tzoneStore.cycleDissolved` misura solo una discesa da un picco): riusarla
                per NULL con lo stesso segno avrebbe detto l'opposto di quel che chiede
                l'etichetta. Lasciata fuori finché non c'è un numero vero da mostrarle. */}
            {!isNull && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: textFaint, fontVariantNumeric: 'tabular-nums' }}>
                  {L('dissoluzione', 'dissolution', 'dissolution', 'disolución', 'upplösning')} {Math.round(pct * 100)}%
                </span>
                <div style={{ position: 'relative', width: 200, height: 10 }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 999, overflow: 'hidden',
                    background: 'var(--s-disc-sunk)',
                  }} />
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0,
                    width: `${Math.max(2, Math.min(100, pct * 100))}%`,
                    borderRadius: 999, background: 'var(--s-still)',
                    boxShadow: '0 0 3px var(--s-still), 0 0 10px var(--s-still), 0 0 18px color-mix(in srgb, var(--s-still) 70%, transparent)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
