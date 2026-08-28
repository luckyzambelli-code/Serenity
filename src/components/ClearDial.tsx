import React, { useRef, useEffect } from 'react';
import { useMetric } from '../store/metricsStore';
import { useTZone } from '../store/tzoneStore';
import { chargeStateById, type ChargeStateId } from '../lib/chargeState';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';

/**
 * ClearDial — a thin SECOND ARC concentric with the needle quadrant (user request).
 * It overlays the QuantumSphere using the SAME coordinate system (viewBox 1600×850,
 * pivot 800,790, ±67.5° SWEEP), drawn just INSIDE the needle band (R_IN=600) and
 * THINNER, with small gaps at the junctions. CONTACT (left) · DISSOLUTION (centre) ·
 * AS-IS (right), same colours. NO box/wedge behind the readout — the centre text is just
 * OUTLINED (paint-order: stroke) for legibility; a transparent hit-area validates. The
 * AS-IS arc is a CLOSED OUTLINE band while "to verify", and FILLS solid once confirmed.
 */
const PX = 800, PY = 790;          // pivot — identical to QuantumSphere
const SWEEP = 67.5;                // ±67.5° = 135° span — identical to the needle arc
const CYCLE_R = 461;               // centreline, just inside the needle band (R_IN=494)
const CYCLE_CORE = 10;             // nucleo SOLIDE fin de la couleur (comme la scie de l'aiguille+)
const GAP = 0.05;                  // small gap (offset units) at the INTERNAL segment junctions

const ORDER: Record<ChargeStateId, number> = { neutral: -1, contact: 0, discharge: 1, asis: 2 };
const PHASES: ChargeStateId[] = ['contact', 'discharge', 'asis'];
const SEG: Record<string, [number, number]> = { contact: [-1, -1 / 3], discharge: [-1 / 3, 1 / 3], asis: [1 / 3, 1] };

const off2ang = (off: number) => 90 - off * SWEEP;        // -1 → 157.5° (left) … +1 → 22.5° (right)
const apt = (ang: number, r: number) => { const a = ang * Math.PI / 180; return { x: PX + r * Math.cos(a), y: PY - r * Math.sin(a) }; };
const aseg = (o0: number, o1: number, r: number) => {
  const s = apt(off2ang(o0), r), e = apt(off2ang(o1), r);
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 0 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
};
const segMid = (id: ChargeStateId) => { const s = SEG[id]; return s ? (s[0] + s[1]) / 2 : 0; };
// closed hollow band (two borders + end caps) — used for the AS-IS "to verify" outline.
const band = (o0: number, o1: number, rIn: number, rOut: number) => {
  const a0 = off2ang(o0), a1 = off2ang(o1);
  const p1o = apt(a0, rOut), p2o = apt(a1, rOut), p2i = apt(a1, rIn), p1i = apt(a0, rIn);
  return `M ${p1o.x.toFixed(1)} ${p1o.y.toFixed(1)} A ${rOut} ${rOut} 0 0 1 ${p2o.x.toFixed(1)} ${p2o.y.toFixed(1)} L ${p2i.x.toFixed(1)} ${p2i.y.toFixed(1)} A ${rIn} ${rIn} 0 0 0 ${p1i.x.toFixed(1)} ${p1i.y.toFixed(1)} Z`;
};

// Phase colours in the LIGHT theme (dark, readable on a light flat background); the DARK
// theme keeps the bright chargeState colours.
const LIGHT_PHASE: Record<string, string> = { contact: '#b3402a', discharge: '#157a4a', asis: '#0e7490' };

// ── CYCLE NULL (miroir) : NULL → RISE → EQUILIBRIUM ───────────────────────────
// Le dial doit suivre le CYCLE CHOISI (demande utilisateur). Mêmes 3 segments, autres étiquettes
// et couleurs : NULL = gris (rien ne lit), RISE = ambre (le mock-up crée de la masse),
// EQUILIBRIUM = blanc-cyan brillant (#d6ffff — même couleur d'aboutissement que l'AS-IS).
export type NullDialId = 'neutral' | 'null' | 'rise' | 'clear_read';
const NULL_PHASES: NullDialId[] = ['null', 'rise', 'clear_read'];
const NULL_ORDER: Record<string, number> = { neutral: -1, null: 0, rise: 1, clear_read: 2 };
const NULL_SEG: Record<string, [number, number]> = { null: [-1, -1 / 3], rise: [-1 / 3, 1 / 3], clear_read: [1 / 3, 1] };
const NULL_LABEL: Record<string, string> = { null: 'NULL', rise: 'RISE', clear_read: 'EQUILIBRIUM' };
const NULL_DARK: Record<string, string> = { null: '#94a3b8', rise: '#fbbf24', clear_read: '#d6ffff' };
const NULL_LIGHT: Record<string, string> = { null: '#64748b', rise: '#b45309', clear_read: '#0e7490' };

// ── CYCLE TRUTH (SERENITY) : ACCORD → VÉRITÉ → TEMPS PRÉSENT ──────────────────
// ⚠️ TROVATO — segnalato: « dans TRUTH tu as laissé NULL RISE EQUILIBRIUM, cela n'est pas
// bon ». `ClearDial` non aveva mai un ramo per TRUTH (un metodo che non esiste in
// EQUILIBRIUM, dove questo componente è nato): quando armato, il ternario di montaggio in
// `Serenity.tsx` non trovava nessuna condizione vera per lui e cadeva nel ramo di DEFAULT —
// lo stesso `<ClearDial>` del ciclo NULL, con le SUE etichette, mai pensate per TRUTH.
// Terzo `cycleKind`, stesso schema di 'null': tre segmenti, ID/etichette/colori propri.
// Le tre tappe collassano la FSM di `useTruthCycle.ts` (idle→ri_located→questioning⇄
// candidate→truth_event→return_present) come già fa `sessionPhase.ts` per il testo — la
// STESSA ragione: candidate/questioning oscillano avanti e indietro per costruzione
// (v. `truthCandSinceRef`/`truthDismissSinceRef`), farli corrispondere a DUE tappe diverse
// dell'arco avrebbe fatto vedere all'arco la STESSA regressione appena corretta nel testo.
// ACCORD = R/I localizzato, non ancora chiesto; VÉRITÉ = tutto il tempo attivo (chiedere/
// candidato/verità confermata, un solo blocco); TEMPS PRÉSENT = tornato al presente.
// A differenza di NULL/CONTACT, le etichette sono TRADOTTE (richiesto esplicitamente) — non
// termini tecnici fissi come "F/N"/"NEEDLE LIGHT": `truthLabelOf` prende `lang`, sotto.
export type TruthDialId = 'neutral' | 'accord' | 'verite' | 'temps_present';
const TRUTH_PHASES: TruthDialId[] = ['accord', 'verite', 'temps_present'];
const TRUTH_ORDER: Record<string, number> = { neutral: -1, accord: 0, verite: 1, temps_present: 2 };
const TRUTH_SEG: Record<string, [number, number]> = { accord: [-1, -1 / 3], verite: [-1 / 3, 1 / 3], temps_present: [1 / 3, 1] };
const TRUTH_DARK: Record<string, string> = { accord: '#f9a8d4', verite: '#f472b6', temps_present: '#fff0f7' };
const TRUTH_LIGHT: Record<string, string> = { accord: '#9d174d', verite: '#be185d', temps_present: '#831843' };
const truthLabelOf = (id: string, lang: string): string => pick5(lang,
  id === 'accord' ? 'ACCORDO' : id === 'verite' ? 'VERITÀ' : id === 'temps_present' ? 'TEMPO PRESENTE' : id,
  id === 'accord' ? 'ACCORD' : id === 'verite' ? 'VÉRITÉ' : id === 'temps_present' ? 'TEMPS PRÉSENT' : id,
  id === 'accord' ? 'AGREEMENT' : id === 'verite' ? 'TRUTH' : id === 'temps_present' ? 'PRESENT TIME' : id,
  id === 'accord' ? 'ACUERDO' : id === 'verite' ? 'VERDAD' : id === 'temps_present' ? 'TIEMPO PRESENTE' : id,
  id === 'accord' ? 'ÖVERENSKOMMELSE' : id === 'verite' ? 'SANNING' : id === 'temps_present' ? 'NUTID' : id);

export const ClearDial = React.memo(function ClearDial({ armed = true, asIsPending = false, manualReady = false, asIsFalse = false, asIsIO = 0, onValidate, deltaStar = 0, deltaStarN = 0, isLightTheme = false, cycleKind = 'charge', nullPhase = 'neutral', truthDialPhase = 'neutral', lang = 'it' }: {
  armed?: boolean; asIsPending?: boolean; asIsFalse?: boolean; asIsIO?: number; onValidate?: () => void; deltaStar?: number; deltaStarN?: number;
  manualReady?: boolean;
  isLightTheme?: boolean;
  /** Le dial suit le CYCLE CHOISI : 'charge' (CONTACT→DISCHARGE→AS-IS), 'null' (NULL→RISE→
   *  EQUILIBRIUM) ou 'truth' (ACCORD→VÉRITÉ→TEMPS PRÉSENT, propre à SERENITY). */
  cycleKind?: 'charge' | 'null' | 'truth';
  nullPhase?: NullDialId;
  truthDialPhase?: TruthDialId;
  /** Langue des étiquettes TRUTH — les seules traduites (v. la note ci-dessus). Ignoré pour
   *  'charge'/'null', qui restent des termes fixes comme partout ailleurs. */
  lang?: string;
}) {
  const { t } = useI18n();
  const phase = useMetric(m => m.chargePhase);
  const reContact = useMetric(m => m.reContact);
  const toneArm = useMetric(m => m.toneArm);
  const { cyclePeakQ } = useTZone();
  const qLNow = useMetric(m => m.qL);
  const pct = cyclePeakQ > 0.001 ? Math.round(Math.max(0, Math.min(1, (cyclePeakQ - Math.max(0, qLNow)) / cyclePeakQ)) * 100) : 0;

  const pending = asIsPending && armed;
  // AS-IS PROBABILE éliminé (choix utilisateur) : validation seulement sur l'AS-IS CONFIRMÉ.
  void manualReady;
  const manualOk = false;
  // ── Le dial suit le CYCLE CHOISI (charge, null ou truth) ──
  const isNullCycle = cycleKind === 'null';
  const isTruthCycle = cycleKind === 'truth';
  const validatable = pending && !isNullCycle && !isTruthCycle; // null/truth ont leur propre fin
  const effPhase: ChargeStateId = validatable ? 'asis' : (armed ? phase : 'neutral');
  // Phase colour — bright chargeState in DARK, dark variant in LIGHT (readable on light bg).
  const phaseColorOf = (id: ChargeStateId): string => isLightTheme ? (LIGHT_PHASE[id] ?? '#475569') : chargeStateById(id).color;
  // Vue UNIFIÉE : mêmes 3 segments, jeu d'ids/étiquettes/couleurs selon le cycle.
  const IDS: string[] = isNullCycle ? (NULL_PHASES as string[]) : isTruthCycle ? (TRUTH_PHASES as string[]) : (PHASES as string[]);
  const SEG_OF: Record<string, [number, number]> = isNullCycle ? NULL_SEG : isTruthCycle ? TRUTH_SEG : SEG;
  const ORDER_OF: Record<string, number> = isNullCycle ? NULL_ORDER : isTruthCycle ? TRUTH_ORDER : (ORDER as Record<string, number>);
  const colorOf = (id: string): string => isNullCycle
    ? ((isLightTheme ? NULL_LIGHT[id] : NULL_DARK[id]) ?? '#64748b')
    : isTruthCycle
    ? ((isLightTheme ? TRUTH_LIGHT[id] : TRUTH_DARK[id]) ?? '#64748b')
    : phaseColorOf(id as ChargeStateId);
  const labelOf = (id: string): string => isNullCycle
    ? (NULL_LABEL[id] ?? id)
    : isTruthCycle
    ? truthLabelOf(id, lang)
    : (t(chargeStateById(id as ChargeStateId).labelKey as any) as string);
  const effId: string = isNullCycle ? (armed ? nullPhase : 'neutral') : isTruthCycle ? (armed ? truthDialPhase : 'neutral') : effPhase;
  const phaseCol = armed && effId !== 'neutral' ? colorOf(effId) : (isLightTheme ? '#94a3b8' : '#64748b');
  const cur = armed ? (ORDER_OF[effId] ?? -1) : -1;
  // progress dot position + pulse:
  //  • DISSOLUTION → scrolls through the segment with the blow-down (pct);
  //  • AS-IS confirmed (clean auto) → jumps to the ARC END (finish line) and PULSES;
  //  • AS-IS? (manual) / "to verify" → sits IN the AS-IS arc at the estimated blow-down, NO pulse;
  //  • CONTACT → segment centre.
  //  • Cycle NULL → centre du segment ; EQUILIBRIUM pulse (il attend TA validation avec les VGI's).
  const frac = Math.min(1, Math.max(0, pct / 100));
  let dotOff = SEG_OF[effId] ? (SEG_OF[effId][0] + SEG_OF[effId][1]) / 2 : 0;
  let dotPulse = false;
  if (isNullCycle) {
    if (effId === 'clear_read') dotPulse = true;
  } else if (isTruthCycle) {
    if (effId === 'temps_present') dotPulse = true;
  } else if (effPhase === 'discharge') { const [a, b] = SEG.discharge; dotOff = a + (b - a) * frac; }
  else if (effPhase === 'asis') {
    if (pending && !asIsFalse) { dotOff = 1; dotPulse = true; }
    else { const [a, b] = SEG.asis; dotOff = a + (b - a) * frac; }
  }
  const mk = apt(off2ang(dotOff), CYCLE_R);
  // ── theme-aware readout/validate colours ──
  const asisCol = phaseColorOf('asis');
  // STYLE B (thème sombre) : cyan → BLANC/gris (monochrome). Le thème clair est inchangé.
  const MANUAL_COL = isLightTheme ? '#2563eb' : 'rgba(202,224,248,0.92)';
  const amberCol = isLightTheme ? '#b45309' : '#fbbf24';
  const glowFlood = isLightTheme ? '#ffffff' : '#04101c';
  const glowOpacity = isLightTheme ? 0.9 : 0.95;

  const taSlowRef = useRef(toneArm);
  useEffect(() => { taSlowRef.current = taSlowRef.current * 0.9 + toneArm * 0.1; });

  // READOUT layout box (no visible background now — just the hit-area + text positions).

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg viewBox="0 0 1600 850" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          {/* Soft GLOW behind the text → legible without a hard edge. Dark halo on the DARK
              theme, white halo on the LIGHT theme. */}
          <filter id="cd-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={glowFlood} floodOpacity={glowOpacity} />
          </filter>
          {/* ALONE couleur (comme la SCIE de l'aiguille PLUS) : les segments RESPLENDISSENT dans
              LEUR couleur — double flou (large + serré) mergé sous la source. */}
          <filter id="cd-seg-glow" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="11" result="b1"/>
            <feGaussianBlur stdDeviation="4" result="b2"/>
            <feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Chemins des ÉTIQUETTES : suivent la COURBE de chaque segment (pour un texte incurvé). */}
          {IDS.map((id) => (
            <path key={`lp-${id}`} id={`cd-lbl-${id}`} d={aseg(SEG_OF[id][0], SEG_OF[id][1], CYCLE_R - 46)} fill="none" />
          ))}
        </defs>
        {/* CYCLE ARC group — concentric & just inside the needle band, thinner. Dims when
            no cycle is armed. NO opaque wedge. */}
        <g opacity={armed ? 1 : 0.4} style={{ transition: 'opacity .4s' }}>
          {/* SOLCO SCAVATO : canal sombre EN CREUX derrière les zones (profondeur / relief).
              Arête haute éclairée + arête basse assombrie = le canal a de l'épaisseur (perspective). */}
          <path d={band(-1, 1, CYCLE_R - CYCLE_CORE / 2 - 7, CYCLE_R + CYCLE_CORE / 2 + 7)} fill="rgba(0,0,0,0.42)" />
          <path d={aseg(-1, 1, CYCLE_R + CYCLE_CORE / 2 + 7)} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
          <path d={aseg(-1, 1, CYCLE_R - CYCLE_CORE / 2 - 7)} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="2" />
          {IDS.map((id) => {
            const [o0, o1] = SEG_OF[id];
            // gaps at the INTERNAL junctions only (not the arc extremities) → clean segments
            const do0 = o0 <= -0.999 ? o0 : o0 + GAP;
            const do1 = o1 >= 0.999 ? o1 : o1 - GAP;
            const active = cur === ORDER_OF[id], done = cur > ORDER_OF[id];
            // AS-IS : plus d'état « à confirmer » (bande CREUSE à bords JAUNES). L'AS-IS se dessine
            // toujours comme les autres phases — arc PLEIN dans sa couleur — donc uniquement l'AS-IS
            // CONFIRMÉ (choix utilisateur). Le ramo générique ci-dessous s'en charge.
            return <path key={id} d={aseg(do0, do1, CYCLE_R)} stroke={colorOf(id)} strokeWidth={CYCLE_CORE}
              fill="none" strokeLinecap="round" opacity={active ? 0.95 : done ? 0.5 : 0.2}
              filter={active || done ? 'url(#cd-seg-glow)' : undefined} />;
          })}
          {/* arc labels — SUIVENT LA COURBE de leur segment (textPath). */}
          {IDS.map((id) => {
            const reHit = !isNullCycle && id === 'contact' && reContact && armed;
            return <text key={id} fill="rgba(255,255,255,0.9)" filter="url(#cd-glow)"
              fontSize="26" fontWeight="normal" className={reHit ? 'animate-pulse' : undefined}
              opacity={reHit ? 1 : cur === ORDER_OF[id] ? 0.95 : 0.5}>
              <textPath href={`#cd-lbl-${id}`} startOffset="50%" textAnchor="middle" style={{ letterSpacing: '0.12em' }}>
                {labelOf(id)}
              </textPath>
            </text>;
          })}
          {/* progress dot on the cycle arc */}
          {armed && effId !== 'neutral' && <circle cx={mk.x.toFixed(1)} cy={mk.y.toFixed(1)} r="13" fill={phaseCol} className={dotPulse ? 'animate-pulse' : undefined} />}
        </g>

        {/* Dial CENTRE is intentionally EMPTY now: the Tone Arm value lives in the top-right
            TONE ARM readout, and comm lag / % diss / AS-IS? moved to the top CycleStatusBar.
            The arc, progress dot and CONTACT/DISSOLUTION/AS-IS zone labels above are the only
            things drawn here. */}
      </svg>
    </div>
  );
});
