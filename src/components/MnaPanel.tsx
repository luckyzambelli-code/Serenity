import React from 'react';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { glassSurface } from '../ui/panel3d';
import { primeFreqAudio } from '../lib/primeFreqAudio';
import {
  ZONE_COLORS,
  type Zone as PrimeZone,
  type PrimePhase,
} from '../lib/primeFreqEngine';
import type { MnaSession } from '../hooks/useMnaModule';
import { useUiStore } from '../store/uiStore';
import { fmtIm } from '../lib/utils';

interface MnaPanelProps {
  primePhase:     PrimePhase;
  setPrimePhase:  (p: PrimePhase) => void;
  primePhaseRef:  React.MutableRefObject<PrimePhase>;
  primeIm:        number;
  primeFd:        number;
  primeZone:      PrimeZone;
  primeDelta:     number;
  primePStar:     number;
  primeCopies:    Array<{ p: number; freq: number }>;
  setPrimeCopies: (v: Array<{ p: number; freq: number }>) => void;
  primeCaptured:  boolean;
  mnaSessionRef:  React.MutableRefObject<MnaSession>;
  /** Lock onto the PEAK I_m of the recent window (auditor/PC delay compensation).
   *  Called the moment CAPTURE is pressed, before sonifying. */
  onCapture:      () => void;
  /** Relay the neuro-acoustic audio action to the PARTICIPANT (PC) so the binaural
   *  tone plays in the PC's own headphones (the sonification targets the PC). */
  onAudio?:       (payload: { action: 'sonify' | 'clean' | 'harmonics' | 'stop'; fd?: number; delta?: number; zone?: PrimeZone; pStar?: number }) => void;
  // PHASE-B: isLightTheme prop removed — read from uiStore directly.
  onHide:         () => void;
  t:              (key: string) => string;
}

export function MnaPanel({
  primePhase, setPrimePhase, primePhaseRef,
  primeIm, primeFd, primeZone, primeDelta, primePStar,
  primeCopies, setPrimeCopies, primeCaptured,
  mnaSessionRef, onCapture, onAudio, onHide, t,
}: MnaPanelProps) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  // REDESIGN Fase 3 — MNA collassabile: chiuso di default (solo barra titolo), si espande
  // al click. Non ingombra più il fondo del quadrante; il modulo resta a un click.
  // ⚠️ APERTO, non ripiegato. Prima il pannello nasceva chiuso perché stava SEMPRE a schermo e
  // un modulo aperto per difetto avrebbe occupato la fascia bassa tutta la seduta. Adesso
  // compare solo quando si preme MNA sulla barra: se l'hai chiesto, deve aprirsi — dover poi
  // cliccare anche il chevron dentro era un secondo gesto per la stessa intenzione (segnalato).
  // Il chevron resta, per ripiegarlo senza chiuderlo.
  const [collapsed, setCollapsed] = React.useState(false);
  // MONOCHROME (choix utilisateur) : plus de couleurs de phase, tout en blanc/gris.
  // NB : phC est concaténé avec un alpha hex (`${phC}44`) → il DOIT rester un hex 6 chiffres.
  const phaseColors: Record<PrimePhase, string> = {
    IDLE: '#8a94a3', CAPTURE: '#eef2f8', SONIFY: '#eef2f8',
    CLEAN: '#eef2f8', HARMONICS: '#eef2f8',
  };
  const phC = phaseColors[primePhase];
  void ZONE_COLORS;
  const znC = '#eef2f8';

  // Each button press performs the action NAMED by its own phase (so pressing
  // CAPTURE only captures — it does NOT make a sound; the sound starts at SONIFY,
  // CLEAN purifies, and the prime copies follow). This matches the auditor's
  // mental model: «CAPTURE = freeze, SONIFY = suono, CLEAN = purifica, poi le
  // copie».
  const handlePrimeAction = () => {
    primeFreqAudio.init();
    if (primePhase === 'CAPTURE') {
      // CAPTURE: lock onto the PEAK I_m of the recent ~3 s window (compensates the
      // auditor/PC reaction delay), then freeze. NO audio here.
      onCapture();
      setPrimePhase('SONIFY'); primePhaseRef.current = 'SONIFY';
      mnaSessionRef.current.cycles += 1;
      mnaSessionRef.current.phaseLog.push({ phase: 'SONIFY', t: Date.now() });
    } else if (primePhase === 'SONIFY') {
      // SONIFY: now emit the captured frequency as a binaural beat.
      primeFreqAudio.startSonify(primeFd);
      onAudio?.({ action: 'sonify', fd: primeFd });
      setPrimePhase('CLEAN'); primePhaseRef.current = 'CLEAN';
      mnaSessionRef.current.phaseLog.push({ phase: 'CLEAN', t: Date.now() });
    } else if (primePhase === 'CLEAN') {
      // CLEAN: purify toward the nearest prime (Δ beat shrinks to silence as it
      // reaches PRIME).
      primeFreqAudio.startClean(primeDelta, primeZone);
      onAudio?.({ action: 'clean', delta: primeDelta, zone: primeZone });
      setPrimePhase('HARMONICS'); primePhaseRef.current = 'HARMONICS';
      mnaSessionRef.current.phaseLog.push({ phase: 'HARMONICS', t: Date.now() });
    } else if (primePhase === 'HARMONICS') {
      // HARMONICS: 4th explicit step — generate the prime harmonic copies.
      setPrimeCopies([]);
      primeFreqAudio.startHarmonics(primePStar);
      onAudio?.({ action: 'harmonics', pStar: primePStar });
    }
  };

  const handleStop = () => {
    primeFreqAudio.killAll();
    onAudio?.({ action: 'stop' });
    setPrimePhase('CAPTURE'); primePhaseRef.current = 'CAPTURE';
    setPrimeCopies([]);
    mnaSessionRef.current.phaseLog.push({ phase: 'CAPTURE', t: Date.now() });
  };

  const canAdvance =
    primePhase === 'CAPTURE'   ? primeCaptured :
    primePhase === 'SONIFY'    ? true :
    primePhase === 'CLEAN'     ? true :
    // HARMONICS is the 4th explicit step: clickable until the copies start,
    // then inert (only the red STOP remains).
    primePhase === 'HARMONICS' ? primeCopies.length === 0 : false;

  const phaseLabelKey: Record<PrimePhase, string> = {
    IDLE: '', CAPTURE: t('mna_phase_capture'),
    SONIFY: t('mna_phase_sonify'),
    CLEAN: t('mna_phase_clean'),
    HARMONICS: t('mna_phase_harmonics'),
  };

  // The single big pulsing button shows the CURRENT phase activity (and the
  // captured frequency in CAPTURE) and advances the cycle when clicked.
  const btnLabel =
    primePhase === 'CAPTURE'   ? (primeFd > 0 ? `${t('mna_phase_capture')} · ${primeFd.toFixed(1)} Hz` : t('mna_phase_capture')) :
    primePhase === 'SONIFY'    ? t('mna_phase_sonify') :
    primePhase === 'CLEAN'     ? t('mna_phase_clean') :
    primePhase === 'HARMONICS' ? t('mna_phase_harmonics') : null;


  return (
    <div
      className="sm-glass absolute pointer-events-auto overflow-hidden"
      style={{
        // REFONTE — surface VERRE lisible (tokens panel3d) ; on garde la position, le liseré
        // teinté par la phase (sémantique) et le padding. Barre du bas = élément le plus PROCHE
        // → depth 0 (pas de recul, sinon elle rétrécirait et laisserait des trous latéraux).
        ...glassSurface('center', isLightTheme, true, 0),
        border: `1px solid ${phC}44`,
        // ⚠️ 46 px dal fondo e non 2%: sotto c'è ora la BARRA DEI COMANDI (modo + MNA), che ha
        // preso questo posto. Il MNA le sta SOPRA — è l'attrezzo che si apre dalla barra, non
        // un pannello che ci finisce sotto.
        left: 10, right: 10, bottom: 46, minHeight: collapsed ? undefined : 72, zIndex: 42,
        padding: collapsed ? '6px 16px' : '8px 16px 10px 16px',
      }}
    >
      {/* ── Row 1 : title + phase + alert ── */}
      <div className="flex items-center gap-3 pb-1">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0.5 13,3.5 13,10.5 7,13.5 1,10.5 1,3.5" stroke={phC} strokeWidth="1.2" fill={`${phC}18`} />
          <circle cx="7" cy="7" r="2" fill={phC} opacity="0.8">
            <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
        <span className={`text-xs font-mono uppercase tracking-wider ${isLightTheme ? 'text-sky-700' : 'text-white/70'}`}>
          {t('mna_title')}
        </span>

        {/* Phase badge */}
        <span key={primePhase}
          className="text-[9px] font-mono font-bold px-2 py-0.5 rounded text-center"
          style={{
            background: `${phC}22`, color: phC, border: `1px solid ${phC}55`,
            boxShadow: `0 0 6px ${phC}44`, minWidth: 118, display: 'inline-block',
            animation: 'mnaSoftIn 0.45s ease',
          }}>
          ● {phaseLabelKey[primePhase]}
        </span>

        {primePhase === 'CAPTURE' && (primeZone === 'COMPOSITE' || primeZone === 'MASSIVE') && (
          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded animate-pulse"
            style={{ background: '#eef2f822', color: '#eef2f8', border: '1px solid #eef2f855' }}>
            ⚡ {t('mna_mass_detected')}
          </span>
        )}
        {primePhase === 'CLEAN' && primeZone === 'PRIME' && (
          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded animate-pulse"
            style={{ background: '#eef2f822', color: '#eef2f8', border: '1px solid #eef2f855' }}>
            ✦ {t('mna_prime_zone')}
          </span>
        )}
        {primePhase === 'IDLE' && (
          <span className="text-[9px] font-mono opacity-50" style={{ color: phC }}>{t('mna_fn_end')}</span>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <GlassCollapseToggle on={!collapsed} onToggle={() => setCollapsed(c => !c)} />
        </div>
        {void onHide}
      </div>

      {/* Contenuto completo — visibile solo da ESPANSO (Fase 3, progressive disclosure). */}
      {!collapsed && (<>
      {/* ── Row 2 : big indicators + action buttons ── */}
      <div className="flex items-center gap-3" style={{ minHeight: 44 }}>

        {/* I_m — CONN-105: FIXED width (was minWidth → grew/shrank with the value,
            shifting the whole row). Sized to the widest value ("12345" / "1.5M"). */}
        <div className="flex flex-col items-start" style={{ width: 84, flex: '0 0 84px' }}>
          <span className="text-[11px] font-mono tracking-widest opacity-70" style={{ color: phC }}>{t('mna_im')}</span>
          <span className="font-mono font-black tabular-nums leading-none"
            style={{ fontSize: 28, color: phC, textShadow: `0 0 20px ${phC}88`, width: 84, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {primeCaptured ? fmtIm(primeIm) : '  —'}
          </span>
        </div>

        <div style={{ width: 1, height: 36, background: `${phC}30`, flex: '0 0 1px' }} />

        {/* ZONE — CONN-105: FIXED width sized to the longest zone label (COMPOSITE). */}
        <div className="flex flex-col items-start" style={{ width: 124, flex: '0 0 124px' }}>
          <span className="text-[11px] font-mono tracking-widest opacity-70" style={{ color: znC }}>{t('mna_zone')}</span>
          <span key={primeZone} className="font-mono font-black leading-none"
            style={{
              fontSize: 22, color: znC, textShadow: `0 0 14px ${znC}88`, width: 124, display: 'inline-block',
              whiteSpace: 'nowrap', overflow: 'hidden',
              animation: 'mnaSoftIn 0.55s ease', transition: 'color 0.55s ease, text-shadow 0.55s ease',
            }}>
            {primeCaptured ? primeZone : ''}
          </span>
        </div>

        {/* f_d — CONN-105: FIXED width. */}
        <div className="flex flex-col items-start" style={{ width: 84, flex: '0 0 84px' }}>
          <span className="text-[11px] font-mono tracking-widest opacity-70" style={{ color: phC }}>{t('mna_fd')}</span>
          <span className="font-mono font-bold tabular-nums leading-none"
            style={{ fontSize: 22, color: isLightTheme ? '#1e293b' : 'rgba(200,225,255,0.9)', width: 84, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {primeCaptured ? `${primeFd.toFixed(1)}` : ' —'}
            <span style={{ fontSize: 11, marginLeft: 2, opacity: 0.6 }}>Hz</span>
          </span>
        </div>

        {/* Δ — CONN-105: FIXED width. */}
        <div className="flex flex-col items-start" style={{ width: 78, flex: '0 0 78px', opacity: primePhase === 'CLEAN' ? 1 : 0, transition: 'opacity 0.3s ease' }}>
          <span className="text-[11px] font-mono tracking-widest opacity-70" style={{ color: '#eef2f8' }}>{t('mna_delta')}</span>
          <span className="font-mono font-bold tabular-nums leading-none"
            style={{ fontSize: 22, color: '#eef2f8', textShadow: '0 0 14px #eef2f888', width: 78, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {primeDelta.toFixed(2)}<span style={{ fontSize: 11, marginLeft: 2, opacity: 0.6 }}>Hz</span>
          </span>
        </div>

        {/* p* — CONN-105: FIXED width. */}
        <div className="flex flex-col items-start" style={{ width: 56, flex: '0 0 56px', opacity: (primePhase === 'SONIFY' || primePhase === 'HARMONICS') ? 1 : 0, transition: 'opacity 0.3s ease' }}>
          <span className="text-[11px] font-mono tracking-widest opacity-70" style={{ color: phC }}>{t('mna_pstar')}</span>
          <span className="font-mono font-bold tabular-nums leading-none"
            style={{ fontSize: 22, color: phC, width: 56, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {primePStar}
          </span>
        </div>

        {/* COPIES — CONN-105: FIXED width. */}
        <div className="flex flex-col items-start ml-2" style={{ width: 56, flex: '0 0 56px', opacity: primePhase === 'HARMONICS' ? 1 : 0, transition: 'opacity 0.3s ease' }}>
          <span className="text-[11px] font-mono tracking-widest opacity-70" style={{ color: '#eef2f8' }}>{t('mna_copies')}</span>
          <span className="font-mono font-black tabular-nums leading-none"
            style={{ fontSize: 28, color: '#eef2f8', textShadow: '0 0 20px #eef2f888', minWidth: 56, display: 'inline-block' }}>
            {primeCopies.length}
          </span>
          <div className="flex gap-1 mt-0.5" style={{ minHeight: 12 }}>
            {primeCopies.slice(-6).map((c, i) => (
              <span key={i} className="text-[8px] font-mono opacity-60" style={{ color: '#eef2f8' }}>p{c.p}</span>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* (∅ I_m average removed — user request, here and in the PDF report.) */}

        {/* STOP button */}
        {(primePhase === 'SONIFY' || primePhase === 'CLEAN' || primePhase === 'HARMONICS') && (
          <button onClick={handleStop}
            className="glass-btn font-bold"
            style={{ padding: '8px 16px', fontSize: 11, letterSpacing: '0.15em' }}>
            {t('mna_btn_stop')}
          </button>
        )}

        {/* Context action button — BIG, label = current phase. Each phase is an
            explicit step: CAPTURE → SONIFY → CLEAN → HARMONIQUES (4 presses).
            HARMONIQUES is clickable to generate the prime copies; once they are
            running the button stays visible (same phase colour) but inert — the
            red STOP is then the only remaining action. */}
        {btnLabel && (() => {
          const isFinal = primePhase === 'HARMONICS';
          const looksActive = canAdvance || isFinal; // coloured & visible at HARMONICS too
          return (
          <button
            onClick={canAdvance ? handlePrimeAction : undefined}
            className="glass-btn font-black"
            style={{
              padding: '9px 18px', fontSize: 14, letterSpacing: '0.08em',
              minWidth: 180, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: canAdvance ? 'pointer' : 'default',
              opacity: looksActive ? 1 : 0.55,
              animation: canAdvance ? 'mnaBtnPulse 1.6s ease-in-out infinite' : 'none',
            }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{canAdvance ? '▶' : (isFinal ? '✦' : '▶')}</span>
            <span>{btnLabel}</span>
          </button>
          );
        })()}
      </div>

      {/* ── Approach-to-PRIME bar (after capture): fills as the detected
            frequency closes on its nearest prime (Δ → 0). */}
      {(primePhase === 'SONIFY' || primePhase === 'CLEAN' || primePhase === 'HARMONICS') && (() => {
        const approach = Math.max(0, Math.min(1, 1 - primeDelta / 1.5)); // 1 = on prime
        const pct = Math.round(approach * 100);
        return (
          <div className="flex items-center gap-2 mt-1" style={{ paddingTop: 2 }}>
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: znC, opacity: 0.8 }}>
              → PRIME {primePStar}
            </span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', border: `1px solid ${znC}44` }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 4,
                background: `linear-gradient(90deg, ${znC}66, ${znC})`,
                boxShadow: `0 0 10px ${znC}aa`,
                transition: 'width 0.25s ease',
              }} />
            </div>
            <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: znC, minWidth: 64, textAlign: 'right' }}>
              Δ {primeDelta.toFixed(2)} · {pct}%
            </span>
          </div>
        );
      })()}
      </>)}

      <style>{`
        @keyframes mna-pulse  { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        @keyframes mnaSoftIn  { 0%{opacity:0;transform:translateY(-5px);} 100%{opacity:1;transform:translateY(0);} }
        @keyframes mnaBtnPulse { 0%,100%{transform:scale(1);filter:brightness(1);} 50%{transform:scale(1.04);filter:brightness(1.25);} }
      `}</style>
    </div>
  );
}
