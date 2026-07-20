import React from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * GlassCollapseToggle — mini interrupteur en VERRE (même matière que le "Glass Toggle" de thème)
 * pour PLIER/DÉPLIER une zone. `on` = zone dépliée (pouce à droite). Remplace le chevron ET la
 * croix de masquage sur les panneaux (R&I, biométrie, santé, journal). PRÉSENTATION SEULE.
 */
export function GlassCollapseToggle({
  on, onToggle, title,
}: {
  on: boolean;
  onToggle: () => void;
  title?: string;
}) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const W = 42, H = 22, THUMB = 26;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={title || (on ? 'Réduire' : 'Développer')}
      title={title || (on ? 'Réduire' : 'Développer')}
      style={{ position: 'relative', width: W, height: H, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }}
    >
      {/* piste creuse */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 999,
        background: isLightTheme ? '#b7b7be' : '#17171b',
        boxShadow: isLightTheme ? 'inset 0 2px 4px rgba(0,0,0,0.18)' : 'inset 0 2px 5px rgba(0,0,0,0.7)',
      }} />
      {/* pouce en verre smerigliato */}
      <div style={{
        position: 'absolute', top: (H - THUMB) / 2, left: on ? W - THUMB + 2 : -2, width: THUMB, height: THUMB, borderRadius: '50%',
        transition: 'left 0.32s cubic-bezier(.34,1.2,.4,1)', overflow: 'hidden',
        background: isLightTheme ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.10)',
        border: `1px solid ${isLightTheme ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.28)'}`,
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        boxShadow: isLightTheme
          ? '0 4px 8px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.7)'
          : '0 6px 12px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.3), inset 0 -5px 9px rgba(0,0,0,0.5)',
      }}>
        <div style={{ position: 'absolute', left: '-30%', top: '8%', width: '150%', height: '70%', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.3), transparent 55%)', transform: 'rotate(-18deg)' }} />
      </div>
    </button>
  );
}
