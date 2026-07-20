import React from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * GlassIconOrb — pastille RONDE en VERRE smerigliato (même matière que le pouce du toggle
 * DARK/LIGHT, lune/soleil) : l'icône se pose EN RELIEF dessus, avec reflet courbe et ombre
 * profonde. Utilisée pour les commandes principales de la barre de gauche (Config, Séance,
 * Start, Trim, Process, Historique, Langue) → plus lisibles et cohérentes graphiquement.
 *
 * PRÉSENTATION SEULE.
 */
export function GlassIconOrb({
  children, size = 52, active = false,
}: {
  children: React.ReactNode;
  size?: number;
  active?: boolean;
}) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  return (
    <div style={{
      position: 'relative', width: size, height: size, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      background: isLightTheme
        ? (active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)')
        : (active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'),
      border: isLightTheme
        ? `1px solid rgba(255,255,255,${active ? 0.9 : 0.7})`
        : `1px solid rgba(255,255,255,${active ? 0.42 : 0.20})`,
      backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)',
      boxShadow: isLightTheme
        ? '0 6px 14px rgba(0,0,0,0.18), inset 0 3px 7px rgba(255,255,255,0.7), inset 0 -5px 10px rgba(0,0,0,0.10)'
        : `0 9px 18px rgba(0,0,0,0.55), inset 0 3px 8px rgba(255,255,255,${active ? 0.36 : 0.26}), inset 0 -7px 12px rgba(0,0,0,0.5)`,
      transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* reflets courbes du verre (comme le pouce du toggle) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(60% 55% at 32% 24%, rgba(255,255,255,0.30), rgba(255,255,255,0) 60%)' }} />
      <div style={{ position: 'absolute', left: '-30%', top: '8%', width: '150%', height: '70%', borderRadius: '50%', pointerEvents: 'none', background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)', transform: 'rotate(-18deg)' }} />
      <div style={{ position: 'relative', lineHeight: 0 }}>{children}</div>
    </div>
  );
}
