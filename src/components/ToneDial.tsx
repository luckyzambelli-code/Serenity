import React from 'react';
import { pick5 } from '../i18n5';
import { TONE_SCALE_MAX, TONE_STEP } from '../engine/tuning';
import { toneOffset, chargeValue, clampTone, type ToneCharge, type TonePhase, type ToneAgreement } from '../engine/toneScale';

/**
 * ToneDial — la vista TONE SCALE (−40 … +40), la scala del tono di Ron.
 *
 * STESSA GEOMETRIA di MirrorDial e ClearDial (viewBox 1600×850, perno 800,790, sweep 67,5°):
 * l'utente l'ha chiesta « simile al MIRROR, in modo da avere una logica », e la logica è che
 * l'arco concentrico sostituisce il ClearDial senza che l'ago si sposti di un pixel.
 *
 * ── LA FASCIA COLORATA ──────────────────────────────────────────────────────────────────────
 * Sotto i numeri corre una fascia che si SCURISCE allontanandosi dallo zero, uguale nei due
 * versi: al centro non c'è quasi niente, ai ±40 è piena. Serve a leggere l'AMPIEZZA della
 * resistenza senza dover mettere a fuoco la cifra — a colpo d'occhio si vede « quanto in là ».
 * È disegnata a fettine da una divisione (una `<path>` per unità) e non con un gradiente SVG:
 * un gradiente è rettilineo e non segue l'arco, quindi al centro sarebbe sfalsato.
 *
 * ── I COLORI, E PERCHÉ QUESTI ───────────────────────────────────────────────────────────────
 * Stessi significati del MIRROR, per non dover reimparare niente:
 *   AMBRA  = il BERSAGLIO da raggiungere (là era il ×2, qui è l'opposto da mock-uppare);
 *   TEAL   = OTTENUTO;
 *   ROSSO  = la CARICA, cioè la fascia e il segno di dove sta la resistenza. È il colore che
 *            `chargeState` usa già per il contatto della massa (#ff5a5a).
 *
 * Rendering puro: nessuno stato, nessuna DSP, nessuna decisione. Chi valida è l'auditor.
 */
const PX = 800, PY = 790, SWEEP = 67.5;   // identici a ClearDial / MirrorDial / QuantumSphere
const R = 560;                             // raggio dell'arco (dentro la fascia dell'ago)
const off2ang = (o: number) => 90 - o * SWEEP;
const apt = (ang: number, r: number) => { const a = ang * Math.PI / 180; return { x: PX + r * Math.cos(a), y: PY - r * Math.sin(a) }; };
const arcPath = (o0: number, o1: number, r: number) => {
  const s = apt(off2ang(o0), r), e = apt(off2ang(o1), r);
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 0 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
};
/** Da tono a punto sul quadrante, in un colpo solo. */
const tpt = (tone: number, r: number) => apt(off2ang(toneOffset(tone)), r);

const CHARGE = '#ff5a5a';   // chargeState 'contact' — la massa contattata
const AMBER  = '#fbbf24';   // il bersaglio (come il ×2 del MIRROR)
const TEAL   = '#34d399';   // ottenuto (come il MIRROR)

/**
 * Quanto è « piena » la fascia a questo tono: appena visibile al centro, piena al fondo scala.
 *
 * LINEARE, e con un fondo. Alla prima prova la rampa saliva col QUADRATO: sullo schermo la
 * fascia spariva del tutto fino a ±25 e ricompariva di colpo sui bordi — si vedevano due archi
 * rossi staccati, non una salita. Il quadrato è comodo in teoria e illeggibile a occhio.
 */
const BAND_FLOOR = 0.10;
const bandAlpha = (tone: number): number =>
  BAND_FLOOR + (1 - BAND_FLOOR) * (Math.abs(clampTone(tone)) / TONE_SCALE_MAX);

export function ToneDial({
  tone, hasMeter, approx, proposed, validated, phase, agreement, toneAtStart,
  isLightTheme = false, lang = 'it',
}: {
  /** Tono MISURATO adesso, −40..+40. Ignorato quando `hasMeter` è falso. */
  tone: number;
  /** C'è uno strumento che misura la resistenza? Senza, la vista funziona lo stesso: è la
   *  situazione di Ron, che lavora off-meter — ma allora NON si disegna un ago misurato. */
  hasMeter: boolean;
  /** Il tono viene dal TA e non da ohm veri → si scrive « ≈ ». Vedi `toneFromTa`. */
  approx?: boolean;
  /** Quel che la misura PROPONE (null senza meter, o troppo vicino allo zero). */
  proposed: ToneCharge | null;
  /** Quel che l'auditor ha VALIDATO. È questo che comanda il bersaglio. */
  validated: ToneCharge | null;
  phase: TonePhase;
  /** Misura e validazione vanno d'accordo? null = non c'era misura da verificare. */
  agreement: ToneAgreement | null;
  /** Tono all'inizio del mock-up — serve alla barra di avanzamento. */
  toneAtStart: number | null;
  isLightTheme?: boolean; lang?: string;
}) {
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);

  const ink = isLightTheme ? '#0f172a' : 'rgba(240,246,255,0.95)';
  const dim = isLightTheme ? 'rgba(15,23,42,0.5)' : 'rgba(200,214,234,0.55)';
  const hair = isLightTheme ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.35)';

  const chargeTone = validated ? chargeValue(validated) : null;
  const targetTone = chargeTone !== null ? -chargeTone : null;
  const inMockup = phase === 'mockup' || phase === 'done';
  const done = phase === 'done';

  // Avanzamento verso lo zero: solo se c'è davvero qualcosa da misurare. Senza meter la barra
  // NON compare — non si disegna un progresso che nessuno sta misurando.
  const progress = (inMockup && hasMeter && toneAtStart !== null && Math.abs(toneAtStart) > 1e-9)
    ? Math.max(0, Math.min(1, (Math.abs(toneAtStart) - Math.abs(clampTone(tone))) / Math.abs(toneAtStart)))
    : 0;

  const BAND_R = 512;                      // la fascia: SOTTO i numeri, sopra l'anello di avanzamento
  const PROG_R = 452;                      // stesso raggio del MIRROR, così le due viste si somigliano

  return (
    <svg viewBox="0 0 1600 850" width="100%" height="100%" style={{ display: 'block', fontFamily: 'var(--font-sans)' }}>
      <defs>
        <filter id="td-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={done ? TEAL : AMBER} floodOpacity="0.8" />
        </filter>
      </defs>

      {/* pista della scala */}
      <path d={arcPath(-1, 1, R)} fill="none" stroke={isLightTheme ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.12)'} strokeWidth={10} strokeLinecap="round" />

      {/* ── LA FASCIA: una fettina per divisione, sempre più carica verso i due fondi scala ── */}
      {Array.from({ length: 2 * TONE_SCALE_MAX }, (_, i) => {
        const t0 = -TONE_SCALE_MAX + i, t1 = t0 + 1;
        // l'alfa si prende a METÀ fettina: agli estremi la fettina è « piena », al centro nulla
        const a = bandAlpha((t0 + t1) / 2);
        return (
          <path key={i} d={arcPath(toneOffset(t0), toneOffset(t1), BAND_R)} fill="none"
            stroke={CHARGE} strokeWidth={22} opacity={(isLightTheme ? 0.6 : 0.8) * a} />
        );
      })}

      {/* graduazioni ogni 10 + numeri firmati. Lo ZERO è più marcato: è la meta. */}
      {Array.from({ length: 2 * TONE_SCALE_MAX / TONE_STEP + 1 }, (_, i) => -TONE_SCALE_MAX + i * TONE_STEP).map((k) => {
        const zero = k === 0;
        const t1 = tpt(k, R + 12), t2 = tpt(k, R - 12);
        const np = tpt(k, R + 46);
        return (
          <g key={k}>
            <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y}
              stroke={zero ? ink : hair} strokeWidth={zero ? 4 : 2} />
            {/* i numeri restano in INCHIOSTRO PIENO come nel MIRROR: in grigio, sopra lo sfondo
                animato, a un metro dallo schermo non si leggevano. */}
            <text x={np.x.toFixed(1)} y={np.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={zero ? 30 : 26} fontWeight={zero ? 700 : 400} fill={ink}>
              {k > 0 ? `+${k}` : k}
            </text>
          </g>
        );
      })}

      {/* AGO MISURATO — dove la resistenza si trova ADESSO. Solo col meter: senza, non c'è
          niente da misurare e disegnarlo sarebbe una bugia. */}
      {hasMeter && (() => {
        const a = tpt(tone, R + 26), b = tpt(tone, R - 26);
        const lp = tpt(tone, R + 88);
        return (
          <g>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ink} strokeWidth={4} />
            <text x={lp.x.toFixed(1)} y={lp.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={22} fontWeight={700} fill={ink}>
              {approx ? '≈' : ''}{clampTone(tone) > 0 ? '+' : ''}{clampTone(tone).toFixed(0)}
            </text>
          </g>
        );
      })()}

      {/* CARICA VALIDATA — il tratto dallo zero fin dove l'auditor ha detto che sta. */}
      {chargeTone !== null && (
        <path d={arcPath(toneOffset(Math.min(0, chargeTone)), toneOffset(Math.max(0, chargeTone)), R - 34)}
          fill="none" stroke={CHARGE} strokeWidth={7} strokeLinecap="round" />
      )}

      {/* BERSAGLIO — l'OPPOSTO da mock-uppare. Ambra e con la stanghetta lunga, come il ×2 del
          MIRROR: è la stessa idea (« porta la cosa fin lì »), quindi lo stesso segno. */}
      {inMockup && targetTone !== null && (() => {
        const a = tpt(targetTone, R + 30), b = tpt(targetTone, R - 136);
        const lp = tpt(targetTone, R - 164);
        return (
          <g filter="url(#td-glow)">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={done ? TEAL : AMBER} strokeWidth={4} />
            <text x={lp.x.toFixed(1)} y={lp.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={20} fontWeight={700} fill={done ? TEAL : AMBER}>
              {targetTone > 0 ? `+${targetTone}` : targetTone}
            </text>
          </g>
        );
      })()}

      {/* anello di AVANZAMENTO verso lo zero — solo quando c'è una misura che avanza */}
      <path d={arcPath(-1, 1, PROG_R)} fill="none" stroke={isLightTheme ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)'} strokeWidth={14} strokeLinecap="round" />
      {inMockup && progress > 0.001 && (
        <path d={arcPath(-1, -1 + progress * 2, PROG_R)} fill="none" stroke={done ? TEAL : AMBER} strokeWidth={14}
          strokeLinecap="round" opacity={0.92} filter={done ? 'url(#td-glow)' : undefined} />
      )}

      {/* ── RIGA DI STATO, sopra il perno ── */}
      {phase === 'locate' && (
        <text x={PX} y={PY - 258} textAnchor="middle" dominantBaseline="middle"
          fontSize={22} fontWeight={700} fill={dim} className="animate-pulse">
          {hasMeter
            ? L('localizza la resistenza…', 'localise la résistance…', 'locating resistance…', 'localiza la resistencia…', 'lokalisera motståndet…')
            : L('senza meter: si assessa', 'sans mètre : on assesse', 'off-meter: assess it', 'sin medidor: se assessa', 'utan mätare: assessa')}
        </text>
      )}

      {(phase === 'sign' || phase === 'magnitude') && proposed && (
        <text x={PX} y={PY - 258} textAnchor="middle" dominantBaseline="middle"
          fontSize={22} fontWeight={700} fill={dim}>
          {L('l\'ago propone', 'l\'aiguille propose', 'the needle proposes', 'la aguja propone', 'nålen föreslår')}
          <tspan dx="14" fill={CHARGE}>{chargeValue(proposed) > 0 ? '+' : ''}{chargeValue(proposed)}</tspan>
          <tspan dx="14" fontSize={15} fontWeight={400}>
            {L('· verifica', '· vérifie', '· verify', '· verifica', '· verifiera')}
          </tspan>
        </text>
      )}

      {(phase === 'sign' || phase === 'magnitude') && !proposed && (
        <text x={PX} y={PY - 258} textAnchor="middle" dominantBaseline="middle"
          fontSize={22} fontWeight={700} fill={dim}>
          {L('assessa: segno, poi ampiezza', 'assesse : signe, puis ampleur', 'assess: sign, then magnitude', 'assessa: signo, luego amplitud', 'assessa: tecken, sedan storlek')}
        </text>
      )}

      {inMockup && chargeTone !== null && (
        <text x={PX} y={PY - 258} textAnchor="middle" dominantBaseline="middle"
          fontSize={26} fontWeight={700} fill={done ? TEAL : ink}>
          <tspan fill={CHARGE}>{chargeTone > 0 ? '+' : ''}{chargeTone}</tspan>
          <tspan dx="18">→</tspan>
          <tspan dx="18" fill={done ? TEAL : AMBER}>{targetTone! > 0 ? '+' : ''}{targetTone}</tspan>
        </text>
      )}

      {inMockup && !done && hasMeter && (
        <text x={PX} y={PY - 228} textAnchor="middle" dominantBaseline="middle"
          fontSize={15} fontWeight={400} fill={dim}>
          {L('verso lo zero', 'vers le zéro', 'toward zero', 'hacia el cero', 'mot noll')} {Math.round(progress * 100)}%
        </text>
      )}

      {/* la MISURA ha smentito la validazione: si scrive, non si nasconde. È il dato più
          interessante che questa vista possa dare. */}
      {inMockup && agreement && agreement !== 'confirmed' && (
        <text x={PX} y={PY - 200} textAnchor="middle" dominantBaseline="middle"
          fontSize={14} fontWeight={700} fill={AMBER}>
          {L('l\'ago diceva altro', 'l\'aiguille disait autre chose', 'the needle said otherwise', 'la aguja decía otra cosa', 'nålen sa något annat')}
        </text>
      )}

      {done && (
        <text x={PX} y={PY - 150} textAnchor="middle" fontSize={40} fontWeight={800} letterSpacing="8"
          fill={TEAL} filter="url(#td-glow)" className="animate-pulse">
          AS-IS
        </text>
      )}
    </svg>
  );
}
