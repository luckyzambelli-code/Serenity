import React from 'react';
import { LAYER } from "../ui/layers";

/**
 * BreathPacer — overlay de RESPIRATION côté PRÉCLAIR (participant) en séance À DISTANCE.
 *
 * Miroir du pacer de MetabolicCheck : l'auditeur (Mac) pilote la timeline et diffuse la
 * phase + l'état inspir/expir via le message P2P `READINESS`. Ici on AFFICHE seulement le
 * repère « Inspirez / Laissez aller » pour que le préclair suive la respiration au début de
 * séance. Aucune logique/moteur : présentation pure pilotée par les props.
 */
const B = {
  en: { title: 'Breathing', settle: 'Settle — soft eyes, breathe normally', breath: 'Deep slow breathing — follow the circle', inhale: 'Inhale', exhale: 'Let it go', ready: 'Ready' },
  fr: { title: 'Respiration', settle: 'Posez-vous — regard doux, respiration normale', breath: 'Respiration lente et profonde — suivez le cercle', inhale: 'Inspirez', exhale: 'Laissez aller', ready: 'Prêt' },
  it: { title: 'Respiro', settle: 'Rilassati — occhi morbidi, respira normalmente', breath: 'Respiro lento e profondo — segui il cerchio', inhale: 'Inspira', exhale: 'Lascia andare', ready: 'Pronto' },
  es: { title: 'Respiración', settle: 'Relájate — mirada suave, respira normal', breath: 'Respiración lenta y profunda — sigue el círculo', inhale: 'Inspira', exhale: 'Suéltalo', ready: 'Listo' },
  sv: { title: 'Andning', settle: 'Landa — mjuk blick, andas normalt', breath: 'Djup långsam andning — följ cirkeln', inhale: 'Andas in', exhale: 'Släpp taget', ready: 'Redo' },
} as const;

export function BreathPacer({ lang, phase, inhale }: { lang: string; phase: string; inhale: boolean; }) {
  const L = (B as any)[lang] ?? B.en;
  const breathing = phase === 'breath';
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: LAYER.pacer,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
      background: 'rgba(0,0,0,0.86)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 'clamp(12px, 3.4vw, 18px)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(200,214,234,0.6)' }}>
        {L.title}
      </div>
      <div style={{ width: 'min(58vw, 260px)', height: 'min(58vw, 260px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.16), rgba(255,255,255,0.03))',
          border: '2px solid rgba(255,255,255,0.6)',
          transform: `scale(${breathing ? (inhale ? 1 : 0.55) : 0.8})`,
          transition: 'transform 4000ms ease-in-out',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 'clamp(18px, 5.5vw, 32px)', fontWeight: 700, color: 'rgba(240,246,255,0.95)', textAlign: 'center' }}>
            {breathing ? (inhale ? L.inhale : L.exhale) : (phase === 'result' ? L.ready : '•')}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 'clamp(12px, 3.4vw, 17px)', color: 'rgba(230,236,245,0.85)', textAlign: 'center', padding: '0 24px', maxWidth: 460 }}>
        {breathing ? L.breath : L.settle}
      </div>
    </div>
  );
}
