import React from 'react';
import { useUiStore } from '../store/uiStore';
import { TOKEN } from '../ui/tokens';

/**
 * GlassLabeledToggle — interrupteur en VERRE avec libellé (même matière que le "Glass Toggle"
 * de thème). Pilule creuse + libellé + pouce en verre smerigliato qui glisse. `on` = pouce à
 * droite. Monochrome. Sert pour EP, AIGUILLE/AIGUILLE+, START du cycle, etc.
 * PRÉSENTATION SEULE — déclenche juste `onToggle`.
 */
export function GlassLabeledToggle({
  on, onToggle, label, title, width = 110,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  title?: string;
  width?: number;
}) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const W = width, H = 30, THUMB = 26;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={title || label}
      title={title || label}
      style={{ position: 'relative', width: W, height: H, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }}
    >
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 999, display: 'flex', alignItems: 'center',
        justifyContent: on ? 'flex-start' : 'flex-end',
        background: TOKEN.wellBg,
        boxShadow: TOKEN.wellShadow,
      }}>
        <span style={{
          margin: on ? '0 0 0 15px' : '0 15px 0 0', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          color: TOKEN.ink, whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>
      <div style={{
        position: 'absolute', top: (H - THUMB) / 2, left: on ? W - THUMB + 2 : -2, width: THUMB, height: THUMB, borderRadius: '50%',
        overflow: 'hidden', transition: 'left 0.32s cubic-bezier(.34,1.2,.4,1)',
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
