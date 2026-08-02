import React, { useEffect, useState, useRef } from 'react';
import { useI18n } from '../i18n.tsx';
import { useUiStore } from '../store/uiStore';
import { useMetric } from '../store/metricsStore';
import { chargeStateById } from '../lib/chargeState';
import { floatOffset, type FnMode } from '../engine/FloatGenerator';

interface QuantumSphereProps {
  needleOffsetProp: number;
  /** Deviazione dell'ago delle LATTINE (Theta-Meter), [-1, 1]. `null` = meter non collegato:
   *  in quel caso l'ago non si disegna affatto, invece di mostrarne uno fermo che sembrerebbe vero. */
  thetaOffset?: number | null;
  /** L'ago dell'EEG si disegna? Senza MUSE non ha sorgente: lasciarlo fermo a SET lo farebbe
   *  passare per un ago vero che non reagisce, invece che per un ago che non c'è. Stessa regola
   *  già applicata a quello delle boîtes, che sparisce senza meter. */
  showEegNeedle?: boolean;
  /** BERSAGLIO durante le prove d'inizio seduta: dove l'ago DEVE arrivare (offset del
   *  quadrante). Senza, « un terzo di quadrante » era un'ampiezza da stimare a occhio; con il
   *  segno lì disegnato la prova si legge da sé. `null` = nessuna prova in corso. */
  targetOffset?: number | null;
  asIsnessState: 'persist' | 'as-is' | 'fn' | 'ep';
  onClick: () => void;
  tZone?: string; rhoG?: number; vProc?: number; eta?: number;
  isFnActive?: boolean; mass?: number; asIsnessConfidence?: number;
  sessionState?: 'idle' | 'running' | 'paused' | 'ended';
  museConnection?: 'disconnected' | 'searching' | 'connected';
  signalQuality?: number; needleReactionKey?: string; epValidated?: boolean;
  // PHASE-B: isLightTheme prop removed — read from uiStore.
  speedValue?: number;
  taValue?: number;
  /** Show colored bands (red/orange/yellow/green) on the dial. Default true. */
  showColorBands?: boolean;
  /** Show the orange/yellow trail behind the needle. Default true. */
  showTrail?: boolean;
  /** True on a genuine active release (stableReleaseState==='active'). Drives the
   *  charge-state (effect/cause/liberation) colour + label shown on the dial so
   *  the needle view matches the sphere. */
  releaseActive?: boolean;
  /** Style du Floating Needle (engine/FloatGenerator). Défaut 'normal'. */
  fnMode?: FnMode;
  /** ── QUALE AGO, quando ci sono ENTRAMBI gli strumenti ────────────────────────────────────
   *  Si mostra un ago solo (due confondono), ma quale lo sceglie l'AUDITOR: i due misurano cose
   *  diverse — su 89 item ne hanno letto uno solo insieme, κ = −0,09 — e finché non si sa quale
   *  segua la carica del preclear, sceglierlo al suo posto sarebbe chiudere di nascosto una
   *  questione aperta. Il selettore sta sotto il perno, dove si guarda già.
   *  `bothInstruments` false → niente selettore: con uno strumento solo non c'è scelta. */
  bothInstruments?: boolean;
  pickedNeedle?: 'eeg' | 'theta';
  onPickNeedle?: (k: 'eeg' | 'theta') => void;
  /** APERÇU F/N : force le float (pour régler le style sans MUSE). Défaut false. */
}

// ─── Geometry ────────────────────────────────────────────────────────────────
const VW = 1600;
const VH = 850;
const PX = VW / 2;
const PY = VH - 60;

const R_OUT  = 680;
const R_IN   = 600;
const R_COLOR = 640;
const R_MID  = (R_OUT + R_IN) / 2;

// Arc réduit : 75% de 180° = 135° total → ±67.5° de la verticale
const SWEEP  = 67.5;

const SET_OFFSET = -0.35; // Spec §18 NEURAL CORE: "SET_OFFSET = -0.35 (fin zone RISE)"

function deg2rad(d: number) { return d * Math.PI / 180; }
function off2ang(offset: number): number { return 90 - offset * SWEEP; }

/** Colore dell'ago delle lattine — ambra, distinto da tutti gli stati di carica dell'ago EEG
 *  (che vanno sui verdi/ciano/violetti), così i due non si confondono mai a colpo d'occhio. */
const THETA_NEEDLE_COLOR = '#f59e0b';
function pt(angleDeg: number, r: number) {
  const a = deg2rad(angleDeg);
  return { x: PX + r * Math.cos(a), y: PY - r * Math.sin(a) };
}

function arcPath(r: number, fromOff: number, toOff: number): string {
  const p1 = pt(off2ang(fromOff), r);
  const p2 = pt(off2ang(toOff), r);
  const large = Math.abs(off2ang(fromOff) - off2ang(toOff)) > 180 ? 1 : 0;
  return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
}

function bandPath(fromOff: number, toOff: number, rIn: number, rOut: number): string {
  const a1 = off2ang(fromOff), a2 = off2ang(toOff);
  const p1o = pt(a1, rOut), p2o = pt(a2, rOut);
  const p2i = pt(a2, rIn),  p1i = pt(a1, rIn);
  const large = Math.abs(a1 - a2) > 180 ? 1 : 0;
  return [
    `M ${p1o.x.toFixed(1)} ${p1o.y.toFixed(1)}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${p2o.x.toFixed(1)} ${p2o.y.toFixed(1)}`,
    `L ${p2i.x.toFixed(1)} ${p2i.y.toFixed(1)}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${p1i.x.toFixed(1)} ${p1i.y.toFixed(1)}`,
    'Z',
  ].join(' ');
}

function reactionKeyToOffset(key: string): number {
  if (key === 'reaction_blow_down') return 0.90;
  if (key === 'reaction_long_fall') return 0.68;
  if (key === 'reaction_fall')      return 0.42;
  if (key === 'reaction_sf')        return 0.20;
  if (key === 'reaction_tick')      return 0.07;
  if (key === 'reaction_dirty')     return 0.30;
  if (key === 'reaction_stuck')     return 0.55;
  return SET_OFFSET;
}

export function QuantumSphere({
  needleOffsetProp, thetaOffset = null, targetOffset = null, showEegNeedle = true,
  asIsnessState, onClick,
  asIsnessConfidence = 0,
  sessionState = 'idle', museConnection = 'disconnected',
  needleReactionKey, epValidated = false,
  speedValue = 0, taValue = 2.0,
  showColorBands = true,
  showTrail = true,
  releaseActive = false,
  bothInstruments = false, pickedNeedle = 'theta', onPickNeedle,
  fnMode = 'normal' }: QuantumSphereProps) {
  const { t } = useI18n();
  const isLightTheme = useUiStore(s => s.isLightTheme);
  // APERÇU inclus dans isFN → le float (mouvement + couleur/épaisseur F/N) s'active aussi en aperçu,
  // pour régler le style sans MUSE. Un vrai F/N vient de needleReactionKey='reaction_fn'.
  const isFN = (needleReactionKey || '').includes('reaction_fn');

  // Charge state (CONTACT / DISCHARGE / AS-IS / neutral) — same source as the
  // sphere halo, so the dial rim colour MATCHES the sphere (user request). Read
  // the live mass (qL) + AS-IS flag from the metricsStore so it updates without
  // an App re-render.
  const phase = useMetric(m => m.chargePhase); // cycle FSM phase (single source)
  const cs   = chargeStateById(phase);
  // STYLE B : au REPOS (neutral) l'arc n'est PAS teinté → il reste BLANC (arcStroke). La
  // couleur n'apparaît que sur une vraie réaction (contact/discharge/asis), pas à vide.
  const stateColor: string | null = cs.id === 'neutral' ? null : cs.color;

  // ── Theme colors ────────────────────────────────────────────────────────────
  // STYLE B (thème sombre) = MONOCHROME : instrument BLANC / gris sur fond noir (comme la
  // référence). On différencie par l'OPACITÉ, pas par la teinte. Le thème clair reste inchangé.
  const arcBg       = isLightTheme ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.07)';
  const arcStroke   = isLightTheme ? 'rgba(30,41,59,0.7)'     : 'rgba(255,255,255,0.88)';
  const arcStrokeIn = isLightTheme ? 'rgba(30,41,59,0.4)'     : 'rgba(255,255,255,0.32)';
  const tickColor   = isLightTheme ? 'rgba(30,41,59,0.7)'     : 'rgba(255,255,255,0.55)';
  const labelColor  = isLightTheme ? '#1e293b'                 : 'rgba(255,255,255,0.85)';
  // ZONE markers (RISE / SET) — monochrome : blanc plus discret (opacité) pour rester des
  // repères d'échelle distincts des réactions, sans introduire de couleur.
  const zoneColor   = isLightTheme ? '#b45309'                 : 'rgba(255,255,255,0.62)';
  const setColor    = isLightTheme ? 'rgba(30,41,59,0.8)'     : 'rgba(255,255,255,0.55)';
  const needleColor = isFN
    ? (isLightTheme ? '#0e7490' : '#ffffff')
    : (isLightTheme ? '#1e40af' : 'rgba(238,246,255,0.96)');
  const hubFill     = isLightTheme ? '#e2e8f0' : 'rgba(6,9,14,0.95)';
  const hubStroke   = isLightTheme ? 'rgba(30,41,59,0.4)'     : 'rgba(255,255,255,0.65)';
  const reactionColor = isFN
    ? (isLightTheme ? '#0e7490' : '#ffffff')
    : (isLightTheme ? '#1e293b' : 'rgba(238,246,255,0.92)');

  // ── State ───────────────────────────────────────────────────────────────────
  const [needleOffset, setNeedleOffset] = useState(needleOffsetProp || SET_OFFSET);
  const [displayReaction, setDisplayReaction] = useState('');

  // Trail: stores last N positions for a fading arc
  const [trailOpacity, setTrailOpacity] = useState(0);
  const [trailFrom, setTrailFrom]       = useState(SET_OFFSET);
  const [trailTo, setTrailTo]           = useState(SET_OFFSET);
  const trailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spring physics
  const springRef  = useRef({ pos: SET_OFFSET, vel: 0, target: SET_OFFSET });
  const targetRef  = useRef(SET_OFFSET);
  const [renderOffset, setRenderOffset] = useState(SET_OFFSET);
  const rafRef     = useRef<number>(0);
  // F/N FLOAT (déf. HCOB) : pendant un F/N, on PILOTE l'aiguille avec un va-et-vient LISSE et
  // SYMÉTRIQUE (même vitesse à gauche qu'à droite = sinus pur) autour de SET, qui NE tombe JAMAIS
  // à droite (reste à gauche de la zone Fall). Rendu explicite pour que l'auditeur voie le float.
  const isFnRef    = useRef(isFN);
  const fnStartRef = useRef(0);
  const fnModeRef  = useRef<FnMode>(fnMode);
  useEffect(() => {
    isFnRef.current = isFN;
    fnModeRef.current = fnMode;
    if (isFN) fnStartRef.current = Date.now(); // (re)démarre la phase du float
    // Un changement de MODE en cours de float redémarre aussi la phase (transition propre).
  }, [isFN, fnMode]);

  useEffect(() => {
    if (needleOffsetProp !== undefined && needleOffsetProp !== null) {
      setNeedleOffset(needleOffsetProp);
      springRef.current.target = needleOffsetProp;
    }
  }, [needleOffsetProp]);

  useEffect(() => {
    if (sessionState !== 'running') { setNeedleOffset(SET_OFFSET); return; }
    if (isFN) { setNeedleOffset(SET_OFFSET); return; }
    const key = needleReactionKey || '';
    if (key === 'reaction_blow_down') {
      // Spec §20 : 0.80 → 0.92 → 0.84
      setNeedleOffset(0.80);
      const t1 = setTimeout(() => setNeedleOffset(0.92), 600);
      const t2 = setTimeout(() => setNeedleOffset(0.84), 1800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else if (key === 'reaction_fall') {
      setNeedleOffset(0.42);
      const t1 = setTimeout(() => setNeedleOffset(0.38), 600);
      const t2 = setTimeout(() => setNeedleOffset(0.40), 1800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else if (key === 'reaction_tick') {
      setNeedleOffset(0.07);
      const t1 = setTimeout(() => setNeedleOffset(0.068), 150);
      const t2 = setTimeout(() => setNeedleOffset(0.069), 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else if (key === 'reaction_stuck') {
      setNeedleOffset(0.55);
      const t1 = setTimeout(() => setNeedleOffset(0.58), 1200);
      const t2 = setTimeout(() => setNeedleOffset(0.56), 3600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    setNeedleOffset(reactionKeyToOffset(key));
  }, [needleReactionKey, sessionState, isFN]);

  // (Ancien F/N sweep en state supprimé : le float est désormais piloté directement dans la
  //  boucle RAF ci-dessus — sinus symétrique autour de SET, sans state ni intervalle 40 ms.)

  // Display reaction label — CONN-95: show the ACTUAL reaction (Fall / Long Fall
  // / LF Blow Down / SF / F/N), not just "F/N". This was the reason the dial only
  // ever read F/N regardless of what the needle did.
  useEffect(() => {
    if (sessionState !== 'running' || !needleReactionKey) { setDisplayReaction(''); return; }
    const LBL: Record<string, string> = {
      reaction_fn: 'F/N', reaction_blow_down: 'LF BD', reaction_long_fall: 'L FALL',
      reaction_fall: 'FALL', reaction_sf: 'SF', reaction_stuck: 'STUCK', reaction_dirty: 'DN' };
    const lbl = LBL[needleReactionKey] ?? '';
    if (!lbl) { setDisplayReaction(''); return; }
    setDisplayReaction(lbl);
    // F/N : PAS d'auto-effacement. Le libellé « F/N » reste affiché TANT QUE l'aiguille flotte
    // (needleReactionKey reste 'reaction_fn', maintenu ≥ 3 s par le hold côté App, et PLUS
    // longtemps tant que le PC flotte). Il ne disparaît qu'au CHANGEMENT de réaction (fin du
    // float → App committe 'none'/autre → cet effet se relance et efface). Les autres réactions
    // (Fall, Blow Down…) sont des « kicks » transitoires → auto-effacement après 2.4 s.
    if (needleReactionKey === 'reaction_fn') return;
    const id = setTimeout(() => setDisplayReaction(''), 2400);
    return () => clearTimeout(id);
  }, [needleReactionKey, sessionState]);

  // Spring animation — spec §19 : stiffness=60, damping=8, mass=2.5
  // Amortissement critique = 2·√(60·2.5) = 2·√150 ≈ 24.5
  // On dépasse le critique (damping=26) → overdamped = ZÉRO oscillation, retour propre sans déborder en RISE
  useEffect(() => {
    const stiffness = 60;
    const damping   = 26;   // > critique (24.5) → overdamped
    const mass      = 2.5;
    const tick = () => {
      const s = springRef.current;
      // ── FLOAT F/N (déf. HCOB) ── pendant un F/N, l'aiguille FLOTTE : va-et-vient LISSE et
      // SYMÉTRIQUE (sinus pur → même vitesse à gauche qu'à droite) autour de SET, d'une ampleur
      // « as small as one inch … as large as dial wide » — le float PEUT entrer dans la zone Fall.
      // « does not fall/drop to the right » = ne SORT JAMAIS du cadran par la droite (ni gauche) :
      // on ne cape donc PAS avant le Fall, on clampe seulement aux BORDS du cadran.
      if (isFnRef.current) {
        // 5 modes (engine/FloatGenerator) d'après la vidéo de réf étiquetée : normal / persistent /
        // spring / instant / tone_arm. Remplace l'ancien sinus unique (A=0.55). Clamp inclus.
        const e = (Date.now() - fnStartRef.current) / 1000;
        const pos = floatOffset(fnModeRef.current, e);
        s.pos = pos; s.vel = 0; s.target = pos;
        setRenderOffset(pos);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = 1 / 60;
      const force = stiffness * (s.target - s.pos) - damping * s.vel;
      s.vel += (force / mass) * dt;
      s.pos += s.vel * dt;
      // Clamp doux : évite que l'aiguille sorte complètement de l'arc
      if (s.pos < -1.0) { s.pos = -1.0; s.vel = 0; }
      if (s.pos >  1.0) { s.pos =  1.0; s.vel = 0; }
      setRenderOffset(s.pos);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Trail: update when renderOffset changes ─────────────────────────────────
  const prevOffsetRef = useRef(SET_OFFSET);
  useEffect(() => {
    const diff = Math.abs(renderOffset - prevOffsetRef.current);
    if (diff > 0.004) {
      setTrailFrom(SET_OFFSET);
      setTrailTo(renderOffset);
      setTrailOpacity(0.85);
      if (trailTimerRef.current) clearTimeout(trailTimerRef.current);
      trailTimerRef.current = setTimeout(() => setTrailOpacity(0), 1400);
    }
    prevOffsetRef.current = renderOffset;
  }, [renderOffset]);

  // ── SCIA DELL'AGO DELLE BOÎTES ───────────────────────────────────────────────────────
  // L'ago dell'EEG lascia una scia colorata che dice a colpo d'occhio QUANTO è andato giù;
  // quello del meter era una linea nuda, e nella vista completa sembrava non reagire.
  // Stessa scia, stessa scala di colore: quello che si vede muoversi si legge allo stesso modo.
  const [thetaTrailTo, setThetaTrailTo]   = useState(SET_OFFSET);
  const [thetaTrailOp, setThetaTrailOp]   = useState(0);
  const thetaTrailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thetaPrevRef    = useRef(SET_OFFSET);
  useEffect(() => {
    if (thetaOffset === null || thetaOffset === undefined) return;
    if (Math.abs(thetaOffset - thetaPrevRef.current) > 0.004) {
      setThetaTrailTo(thetaOffset);
      setThetaTrailOp(0.85);
      if (thetaTrailTimer.current) clearTimeout(thetaTrailTimer.current);
      thetaTrailTimer.current = setTimeout(() => setThetaTrailOp(0), 1400);
    }
    thetaPrevRef.current = thetaOffset;
  }, [thetaOffset]);
  const thetaTrailInt   = Math.max(0, Math.min(1, (thetaTrailTo - SET_OFFSET) / (1.0 - SET_OFFSET)));
  const thetaTrailColor = `rgb(${Math.round(thetaTrailInt * 255)},`
                        + `${Math.max(0, Math.round(230 - thetaTrailInt * 200))},`
                        + `${Math.max(0, Math.round(255 - thetaTrailInt * 255))})`;

  // ── Trail color / intensity tied to needle position ───────────────────────
  // offset: SET_OFFSET(~-0.2) → 0 normal zone → 0.45 FALL → 0.72 LONG FALL → 1.0 BLOW DOWN
  const trailIntensity = Math.max(0, Math.min(1, (renderOffset - SET_OFFSET) / (1.0 - SET_OFFSET)));
  // Color: cyan (0%) → yellow (50%) → orange-red (80%) → deep red (100%)
  const trailR = Math.round(0   + trailIntensity * 255);
  const trailG = Math.round(230 - trailIntensity * 200);
  const trailB = Math.round(255 - trailIntensity * 255);
  const trailColor = `rgb(${trailR},${Math.max(0,trailG)},${Math.max(0,trailB)})`;
  // CHARGE-STATE TRAIL: during a reaction with mass/liberation present, paint the
  // needle trail in the charge-state tone (effect/cause/liberation), shading from
  // a LIGHTER (at SET) to a DARKER (at the needle tip) hue of the SAME colour.
  // Neutral (no mass) keeps the default position-based colour.
  const useChargeTrail = cs.id !== 'neutral';
  const trailStroke = useChargeTrail ? 'url(#sm-charge-trail)' : trailColor;
  // Width: 14 (SET) → 28 (LONG FALL) → 36 (BLOW DOWN)
  const trailWidth = 14 + trailIntensity * 22;
  // Glow spread: increases with intensity
  const trailBlur = 6 + trailIntensity * 14;

  // ── Needle geometry ─────────────────────────────────────────────────────────
  const currentOffset = renderOffset;
  const needleAngle   = off2ang(currentOffset);
  const tipR          = R_IN - 8;
  const tip           = pt(needleAngle, tipR);
  const arrowSize     = 12;
  const arrowRad      = deg2rad(needleAngle);
  const dx = Math.cos(arrowRad), dy = -Math.sin(arrowRad);
  const px2 = -dy, py2 = dx;
  const arrowTip = { x: tip.x + dx * arrowSize, y: tip.y + dy * arrowSize };
  const arrowL   = { x: tip.x - px2 * 5,        y: tip.y - py2 * 5 };
  const arrowR   = { x: tip.x + px2 * 5,        y: tip.y + py2 * 5 };

  const handleSphereClick = () => {
    setRenderOffset(SET_OFFSET);
    targetRef.current = SET_OFFSET;
    springRef.current = { pos: SET_OFFSET, vel: 0, target: SET_OFFSET };
    setNeedleOffset(SET_OFFSET);
    // …e si AVVISA il chiamante. Senza questa riga il clic rimetteva a posto solo la molla
    // LOCALE di questo componente: il motore dell'ago non veniva azzerato e l'ago delle boîtes
    // restava dov'era. Funzionava solo la barra spaziatrice, che chiama App direttamente.
    onClick();
  };

  // Trail arc: two paths (glow + core) computed inline


  return (
    <div className="w-full h-full flex items-center justify-center relative rounded-xl"
      style={{ background: 'transparent', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%"
        style={{ display: 'block' }} onClick={handleSphereClick}>
        <defs>
          <filter id="gs" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="gst" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="7" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="needle_glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feFlood floodColor="#eaf3ff" floodOpacity="0.5" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Trail glow filter — rebuilt each frame with dynamic color */}
          <filter id="trail_glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={trailBlur} result="blur"/>
            <feFlood floodColor={trailColor} floodOpacity="0.80" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Arc background ── */}
        <path d={bandPath(-1.0, 1.0, R_IN, R_OUT)} fill={arcBg}/>

        {/* ── Zone color bands (togglable via showColorBands) ── */}
        {showColorBands && (!isLightTheme ? (
          <>
            <path d={bandPath(-1.0, SET_OFFSET, R_IN, R_COLOR)} fill="rgba(255,255,255,0.035)"/>
            <path d={bandPath(SET_OFFSET, 0.13, R_IN, R_COLOR)} fill="rgba(255,255,255,0.075)"/>
            <path d={bandPath(0.13, 0.45, R_IN, R_COLOR)}       fill="rgba(255,255,255,0.055)"/>
            <path d={bandPath(0.45, 0.72, R_IN, R_COLOR)}       fill="rgba(255,255,255,0.045)"/>
            <path d={bandPath(0.72, 1.0,  R_IN, R_COLOR)}       fill="rgba(255,255,255,0.05)"/>
          </>
        ) : (
          <>
            <path d={bandPath(SET_OFFSET, 0.13, R_IN, R_COLOR)} fill="#22c55e" opacity="0.95"/>
            <path d={bandPath(0.13, 0.45, R_IN, R_COLOR)}       fill="#eab308" opacity="0.95"/>
            <path d={bandPath(0.45, 0.72, R_IN, R_COLOR)}       fill="#f97316" opacity="0.95"/>
            <path d={bandPath(0.72, 1.0,  R_IN, R_COLOR)}       fill="#ef4444" opacity="0.95"/>
          </>
        ))}

        {/* ── Arc borders / RÉACTION ── */}
        {/* Redesign verre : quand une réaction est active, le rebord devient un CANAL INCAVÉ
            RÉTROÉCLAIRÉ — halo coloré (couleur de charge) diffus DERRIÈRE, rainure sombre
            (incavo), puis une LIGNE BLANCHE lumineuse au centre. Au repos : simple rebord blanc.
            (Présentation seule — stateColor vient de la charge, aucun calcul modifié.) */}
        {stateColor ? (
          <>
            {/* leggero ALONE rétroéclairé (couleur de charge, diffus) */}
            <path d={arcPath(R_OUT, -1, 1)} fill="none" stroke={stateColor} strokeWidth="12"
              strokeLinecap="round" opacity={0.32} filter={!isLightTheme ? 'url(#gs)' : undefined}/>
            {/* RAINURE sombre (solco / incavo) */}
            <path d={arcPath(R_OUT, -1, 1)} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="7.5" strokeLinecap="round"/>
            {/* LIGNE LUMINEUSE de la COULEUR DE CHARGE, posée dans le solco */}
            <path d={arcPath(R_OUT, -1, 1)} fill="none" stroke={stateColor} strokeWidth="3.2" strokeLinecap="round"
              filter={!isLightTheme ? 'url(#gst)' : undefined}/>
          </>
        ) : (
          <path d={arcPath(R_OUT, -1, 1)} fill="none" stroke={arcStroke} strokeWidth="2"/>
        )}
        <path d={arcPath(R_IN,  -1, 1)} fill="none" stroke={arcStrokeIn} strokeWidth="1.5"/>
        {/* (Charge dicitura is shown under "release speed" in App, not on the arc.) */}

        {/* ── End caps / arc-limit lines ──
            ROGER-FIX (#5): "lignes de fin d'arc pour valider la sortie d'écran".
            The needle clamps at ±1.0 (off the visible dial). Draw a bold, extended
            limit line at each arc end so it is unmistakable when the needle has
            reached the edge — cyan at the RISE end, red at the FALL/blow end. */}
        {([-1, 1] as const).map(side => {
          const a = off2ang(side);
          const p1 = pt(a, R_IN - 24), p2 = pt(a, R_OUT + 40);
          // ROGER-FIX (#5 v2): the needle exiting RIGHT = release/blow-down
          // (LF Blow Down) = LIBERATION → green; exiting LEFT = the TA rising =
          // ADDING MASS → red.
          // STYLE B (thème sombre) : extrémités en BLANC (monochrome). Thème clair : vert/rouge.
          const limitColor = side === 1
            ? (isLightTheme ? '#16a34a' : 'rgba(255,255,255,0.90)')   // right = liberation
            : (isLightTheme ? '#dc2626' : 'rgba(255,255,255,0.90)');  // left  = adding mass
          return (
            <line key={side} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={limitColor} strokeWidth="3.5" strokeLinecap="round"
              opacity={0.9} filter={!isLightTheme ? 'url(#gs)' : undefined}/>
          );
        })}

        {/* ── Tick marks ── */}
        {Array.from({ length: 49 }).map((_, i) => {
          const off = -1 + (i / 48) * 2;
          const a   = off2ang(off);
          const isMajor = i % 4 === 0;
          const p1 = pt(a, R_IN);
          const p2 = pt(a, isMajor ? R_IN - 14 : R_IN - 6);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={tickColor} strokeWidth={isMajor ? 1.8 : 0.9}/>;
        })}

        {/* ── Zone labels ── CURVED along the arc (textPath) so each word bends with the
            dial instead of sitting as a straight tilted line. The invisible label arc is
            drawn wider than the label range so end words aren't clipped; each label's
            startOffset is derived from its needle offset. LFBD sits NEAR the right edge but
            INSIDE it (the NEEDLE — not the label — pegs to the edge on a blow down); RISE is
            a zone marker centred between SET and the left edge. */}
        <defs>
          <path id="sm-label-arc" d={arcPath(R_MID, -1.15, 1.20)} fill="none" />
        </defs>
        {[
          { off: -0.68,       text: 'RISE',      size: 22, zone: true },
          { off: SET_OFFSET,  text: 'SET',       size: 24, zone: true },
          { off: -0.06,       text: 'SF',        size: 24 },
          { off:  0.10,       text: 'FALL',      size: 24 },
          { off:  0.40,       text: 'LONG FALL', size: 20 },
          { off:  0.85,       text: 'LFBD',      size: 18 },
        ].map(({ off, text, size, zone }) => {
          const pct = ((off2ang(-1.15) - off2ang(off)) / (off2ang(-1.15) - off2ang(1.20)) * 100).toFixed(1);
          // REDESIGN Fase 5 — scala QUIETA: le label sono riferimenti, non protagoniste.
          // Peso normale + opacità ridotta (zone RISE/SET un filo più visibili) → l'ago e le
          // letture dominano; la scala non compete più con lo strumento.
          return (
            <text key={text} textAnchor="middle" fill={zone ? zoneColor : labelColor} fontSize={size}
              fontFamily="monospace" fontWeight="normal" opacity={zone ? 0.72 : 0.5}>
              <textPath href="#sm-label-arc" startOffset={`${pct}%`} dominantBaseline="central">{text}</textPath>
            </text>
          );
        })}

        {/* F/N indicator + reaction label REMOVED — needle reactions (F/N, SF, FALL…) are
            now shown ONCE, in the top data-stack (App). Keeping them here too duplicated
            them and clashed with the ClearDial readout once the dial became transparent. */}

        {/* ── SET dashed line ── */}
        {(() => {
          const a = off2ang(SET_OFFSET);
          const p1 = pt(a, R_IN - 18), p2 = pt(a, R_OUT + 16);
          return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={setColor} strokeWidth="2.5" strokeDasharray="5 4"/>;
        })()}

        {/* ── LIGHT TRAIL on arc — progressive color + width ── */}
        {showTrail && !isLightTheme && trailOpacity > 0 && Math.abs(trailTo - trailFrom) > 0.01 && (
          <>
            {/* Charge-state gradient (light at SET → dark at the needle tip),
                aligned to the trail so it follows the swing direction. */}
            {useChargeTrail && (() => {
              const ps = pt(off2ang(trailFrom), R_MID);
              const pe = pt(off2ang(trailTo), R_MID);
              return (
                <defs>
                  <linearGradient id="sm-charge-trail" gradientUnits="userSpaceOnUse"
                    x1={ps.x} y1={ps.y} x2={pe.x} y2={pe.y}>
                    <stop offset="0%"   stopColor={cs.core.c1}/>
                    <stop offset="55%"  stopColor={cs.core.c2}/>
                    <stop offset="100%" stopColor={cs.core.c4}/>
                  </linearGradient>
                </defs>
              );
            })()}
            {/* Outer wide soft glow */}
            <path
              d={arcPath(R_MID + 2, Math.min(trailFrom, trailTo), Math.max(trailFrom, trailTo))}
              fill="none" stroke={trailStroke}
              strokeWidth={trailWidth * 1.8}
              strokeLinecap="round"
              opacity={trailOpacity * 0.35}
              filter="url(#trail_glow)"
              style={{ transition: 'opacity 1.4s ease-out', pointerEvents: 'none' }}
            />
            {/* Inner sharp bright core */}
            <path
              d={arcPath(R_MID + 2, Math.min(trailFrom, trailTo), Math.max(trailFrom, trailTo))}
              fill="none" stroke={trailStroke}
              strokeWidth={trailWidth * 0.45}
              strokeLinecap="round"
              opacity={trailOpacity * 0.95}
              filter="url(#trail_glow)"
              style={{ transition: 'opacity 1.4s ease-out', pointerEvents: 'none' }}
            />
          </>
        )}

        {/* ── BERSAGLIO DELLE PROVE ─────────────────────────────────────────────────────────
            Dove l'ago deve arrivare con una stretta LEGGERA. Disegnato attraverso tutta la
            corona, così si vede senza cercarlo, con la sua etichetta. */}
        {targetOffset !== null && targetOffset !== undefined && (() => {
          const a = off2ang(Math.max(-1, Math.min(1, targetOffset)));
          const p1 = pt(a, R_IN - 30), p2 = pt(a, R_OUT + 16), lbl = pt(a, R_OUT + 44);
          return (
            <g>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="#34d399" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 7"
                opacity={0.9}/>
              <circle cx={p2.x} cy={p2.y} r={9} fill="#34d399" opacity={0.9}/>
              <text x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="middle"
                fill="#34d399" fontSize="30" fontWeight="700"
                style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.08em' }}>
                1/3
              </text>
            </g>
          );
        })()}

        {/* ── AIGUILLE DES LATTINE (Theta-Meter) ────────────────────────────────────────────
            L'aiguille du VRAI meter, à côté de celle déduite de l'EEG, pour voir l'écart entre
            les deux. Dessinée AVANT (donc DESSOUS) et plus fine : c'est la comparaison qui
            compte, l'aiguille EEG doit rester lisible par-dessus. Absente si le meter n'est
            pas branché — `null`, pas 0, sinon on afficherait une aiguille au repos qui n'existe
            pas et qu'on croirait vraie. */}
        {/* La scia delle boîtes: sotto il suo ago, con la stessa scala di colore dell'EEG. */}
        {showTrail && !isLightTheme && thetaTrailOp > 0 && Math.abs(thetaTrailTo - SET_OFFSET) > 0.01 && (
          <>
            <path d={arcPath(R_MID + 2, Math.min(SET_OFFSET, thetaTrailTo), Math.max(SET_OFFSET, thetaTrailTo))}
              fill="none" stroke={thetaTrailColor} strokeWidth={trailWidth * 1.8} strokeLinecap="round"
              opacity={thetaTrailOp * 0.30} filter="url(#trail_glow)"
              style={{ transition: 'opacity 1.4s ease-out', pointerEvents: 'none' }}/>
            <path d={arcPath(R_MID + 2, Math.min(SET_OFFSET, thetaTrailTo), Math.max(SET_OFFSET, thetaTrailTo))}
              fill="none" stroke={thetaTrailColor} strokeWidth={trailWidth * 0.45} strokeLinecap="round"
              opacity={thetaTrailOp * 0.9} filter="url(#trail_glow)"
              style={{ transition: 'opacity 1.4s ease-out', pointerEvents: 'none' }}/>
          </>
        )}

        {thetaOffset !== null && thetaOffset !== undefined && (() => {
          const a = off2ang(Math.max(-1, Math.min(1, thetaOffset)));
          const t = pt(a, tipR);
          // Punta a FRECCIA come quella dell'ago EEG, ma nel colore delle boîtes: due aghi
          // fatti diversamente si leggerebbero come due cose diverse, e invece sono due
          // misure della stessa grandezza.
          const rad = deg2rad(a);
          const dxT = Math.cos(rad), dyT = -Math.sin(rad);
          const pxT = -dyT, pyT = dxT;
          const aTip = { x: t.x + dxT * arrowSize, y: t.y + dyT * arrowSize };
          const aL   = { x: t.x - pxT * 5,         y: t.y - pyT * 5 };
          const aR   = { x: t.x + pxT * 5,         y: t.y + pyT * 5 };
          return (
            <g opacity={0.8} style={{ transition: 'none' }}>
              <line x1={PX} y1={PY} x2={t.x} y2={t.y}
                stroke={THETA_NEEDLE_COLOR} strokeWidth="3" strokeLinecap="round"/>
              <polygon points={`${aTip.x},${aTip.y} ${aL.x},${aL.y} ${aR.x},${aR.y}`}
                fill={THETA_NEEDLE_COLOR}/>
            </g>
          );
        })()}

        {/* ── NEEDLE ── */}
        {showEegNeedle && (<>
        <line x1={PX} y1={PY} x2={tip.x} y2={tip.y}
          stroke={needleColor} strokeWidth={isFN ? 2.5 : 2} strokeLinecap="round"
          filter={!isLightTheme ? 'url(#needle_glow)' : isFN ? 'url(#gst)' : 'url(#gs)'}
          style={{ transition: 'none' }}/>
        <polygon
          points={`${arrowTip.x},${arrowTip.y} ${arrowL.x},${arrowL.y} ${arrowR.x},${arrowR.y}`}
          fill={needleColor}
          filter={!isLightTheme ? 'url(#needle_glow)' : isFN ? 'url(#gst)' : 'url(#gs)'}/>
        </>)}

        {/* ── Pivot hub ── */}
        <circle cx={PX} cy={PY} r={14} fill={hubFill} stroke={hubStroke} strokeWidth="1.5"/>
        <circle cx={PX} cy={PY} r={5}  fill={isLightTheme ? '#475569' : 'rgba(255,255,255,0.95)'}/>

        {/* ── QUALE AGO ────────────────────────────────────────────────────────────────────
            Un ago solo, ma QUALE si sceglie a mano. I due strumenti misurano cose diverse —
            su 89 item hanno letto lo stesso item una volta (κ = −0,09) — e non c'è ancora
            niente che dica quale abbia ragione: sceglierlo al posto dell'auditor sarebbe
            decidere di nascosto una questione aperta.
            Compare SOLO con entrambi collegati: con uno solo non c'è nulla da scegliere. */}
        {onPickNeedle && showEegNeedle !== undefined && bothInstruments && (() => {
          const W = 96, H = 30, GAP = 8, Y = PY + 18;
          const opts: { k: 'eeg' | 'theta'; lbl: string; col: string }[] = [
            { k: 'eeg',   lbl: 'MUSE',  col: '#8ab4ff' },
            { k: 'theta', lbl: 'METER', col: '#fbbf24' },
          ];
          return (
            <g>
              {opts.map((o, i) => {
                const x = PX + (i === 0 ? -W - GAP / 2 : GAP / 2);
                const on = pickedNeedle === o.k;
                return (
                  <g key={o.k} style={{ cursor: 'pointer' }}
                     onClick={e => { e.stopPropagation(); onPickNeedle(o.k); }}>
                    <rect x={x} y={Y} width={W} height={H} rx={9}
                          fill={on ? o.col : 'rgba(0,0,0,0.35)'}
                          fillOpacity={on ? 0.18 : 1}
                          stroke={on ? o.col : 'rgba(255,255,255,0.22)'} strokeWidth={on ? 2 : 1}/>
                    <text x={x + W / 2} y={Y + H / 2 + 6} textAnchor="middle"
                          fill={on ? o.col : 'rgba(226,238,255,0.55)'}
                          fontSize="16" fontFamily="var(--font-sans)" fontWeight={on ? 700 : 500}
                          letterSpacing="1.5" style={{ pointerEvents: 'none' }}>
                      {o.lbl}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* Reaction label REMOVED (see note above) — reactions are shown in the top data-stack. */}

        {/* ── EP Validated ── */}
        {epValidated && (
          <text x={PX} y={460} textAnchor="middle"
            fill="#4ade80" fontSize="13" fontFamily="monospace" fontWeight="bold" filter="url(#gs)">
            EP VALIDATED
          </text>
        )}
      </svg>
    </div>
  );
}
