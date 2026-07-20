import React from 'react';
import { useUiStore } from '../store/uiStore';
import { GlassIconOrb } from './GlassIconOrb';

interface SideBtnProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  badge?: number | string;
  // PHASE-B: isLightTheme prop removed — read from uiStore.
  /** For custom button colors (pause, end, etc.) */
  customColor?: string;
  /** Animated "connecting" state */
  pulsing?: boolean;
}

/**
 * Glass / 3D sidebar button — inspired by the reference CSS the user pasted.
 *
 * Single global <style> block (idempotent — browsers de-dupe identical
 * `<style>` tags), so the button receives real :hover and :active states
 * (which inline styles cannot do).
 *
 * Variants:
 *   • base                → frosted-glass with subtle bevel
 *   • .is-active          → cyan-tinted glow (selected/open drawer state)
 *   • .theme-light        → softened palette for the light theme
 *   • :hover (non-active) → lifted card with cyan border accent
 *   • :active (clicking)  → pressed/inset
 */
const SIDEBTN_CSS = `
.smbtn {
  --smbtn-accent: 0, 230, 255;
  width: 84px; height: 84px;
  border-radius: 14px; padding: 6px 4px;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer; position: relative;
  overflow: visible;                 /* laisse respirer l'ombre de la pastille ronde */
  isolation: isolate;
  transition: all 0.2s cubic-bezier(0.25,0.8,0.25,1);
  box-shadow: none;
}
.smbtn:disabled { cursor: not-allowed; opacity: 0.35; }

/* ── Specular highlight (the "glass light") ─────────────────────────────────
   Two layered overlays simulate a real glass surface catching ambient light:

   ::before — a soft diagonal sheen across the top half. It's wider than the
              button, slightly rotated, so it reads as a curved reflection
              when combined with the rounded corners.

   ::after  — a narrow, brighter "edge highlight" along the very top, like a
              chamfered glass bevel catching light.
*/
.smbtn::before {
  content: '';
  position: absolute;
  inset: -20% -10% auto -10%;        /* spills past the top/sides */
  height: 70%;                        /* covers ~upper-half */
  background: transparent;            /* boutons transparents : plus de reflet de verre */
  border-radius: 50% / 32%;
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.3s ease, transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform: translate3d(0, 0, 0);
  opacity: 0.85;
}

.smbtn::after {
  content: '';
  position: absolute;
  top: 1px; left: 8%; right: 8%; height: 1px;
  background: transparent;            /* PLAT : plus d'arête éclairée */
  pointer-events: none;
  z-index: 0;
  opacity: 0.9;
}

/* Lift the actual button content above the highlight layers */
.smbtn > * { position: relative; z-index: 1; }

/* On hover, slide the sheen across — sells the "real glass" illusion */
.smbtn:not(:disabled):hover::before {
  opacity: 1;
  transform: translate3d(8%, -4%, 0);
}

/* Hover — soulèvement verre */
.smbtn:not(:disabled):hover {
  background: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.24);
  transform: translateY(-2px);
  box-shadow: 0 12px 22px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.22);
}

/* Pressed — enfoncé */
.smbtn:not(:disabled):active {
  transform: translateY(0);
  background: rgba(255,255,255,0.06);
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
}

/* Sélectionné (drawer ouvert) — léger halo de tuile ; la pastille ronde (orb) porte l'état actif. */
.smbtn.is-active {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.16);
  box-shadow: none;
}

/* Icon wrapper */
.smbtn-icon {
  filter: none;
  line-height: 0;
}

/* Light-theme palette adjustments */
.smbtn.theme-light {
  --smbtn-accent: 2, 132, 199;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.smbtn.theme-light:not(:disabled):hover {
  background: rgba(15, 25, 50, 0.09);
  border-color: rgba(2, 132, 199, 0.45);
  box-shadow:
    0 10px 20px rgba(0, 50, 100, 0.20),
    0 0 8px rgba(2, 132, 199, 0.25),
    inset 0 1px 0 rgba(255,255,255,0.70);
}
.smbtn.theme-light:not(:disabled):active {
  box-shadow:
    0 2px 4px rgba(0, 50, 100, 0.15),
    inset 0 2px 6px rgba(0, 50, 100, 0.30),
    inset 0 0 4px rgba(2, 132, 199, 0.15);
}
.smbtn.theme-light.is-active {
  background: rgba(2, 132, 199, 0.10);
  border-color: rgba(2, 132, 199, 0.45);
}

/* Soften the specular highlight on light theme — pure white sheen is too
   harsh on a light background; we use a cool-white tint instead. */
.smbtn.theme-light::before {
  background: linear-gradient(135deg,
    rgba(220, 240, 255, 0.55)  0%,
    rgba(220, 240, 255, 0.20) 35%,
    rgba(220, 240, 255, 0.00) 55%);
  opacity: 0.7;
}
.smbtn.theme-light::after {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.00) 0%,
    rgba(255,255,255,0.80) 50%,
    rgba(255,255,255,0.00) 100%);
}

/* Pulsing dot for "connecting" feedback */
@keyframes smbtn-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
}
.smbtn-pulsing { animation: smbtn-pulse 1.2s ease-in-out infinite; }
`;

// Mark a global flag so the style is injected once per session.
let cssInjected = false;
function ensureCss(): void {
  if (cssInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.dataset.smbtn = '1';
  el.textContent = SIDEBTN_CSS;
  document.head.appendChild(el);
  cssInjected = true;
}

export const SideBtn: React.FC<SideBtnProps> = ({
  label, icon, active, disabled, onClick, badge, customColor, pulsing,
}) => {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  ensureCss();

  const accentColor = customColor
    ?? (isLightTheme ? '#334155' : '#f0f6ff');
  // STYLE B (thème sombre) : encre CLAIRE par défaut (lisible sur le verre sombre). Thème
  // clair : encre sombre.
  const textColor = customColor
    ?? (active ? accentColor : (isLightTheme ? 'rgba(15,23,42,0.82)' : 'rgba(224,238,255,0.82)'));

  // Custom accent color (pause/end buttons) overrides the CSS variable via inline style.
  const customAccentRgb = customColor ? hexToRgb(customColor) : null;
  const inlineStyle: React.CSSProperties = customAccentRgb
    ? { ['--smbtn-accent' as any]: customAccentRgb }
    : {};

  const classes = [
    'smbtn',
    isLightTheme ? 'theme-light' : '',
    active ? 'is-active' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={classes}
      style={inlineStyle}
    >
      <div
        className={`smbtn-icon${pulsing ? ' smbtn-pulsing' : ''}`}
        style={{
          color: textColor,
          filter: active ? `drop-shadow(0 0 7px ${accentColor})` : undefined,
        }}
      >
        {/* Icône EN RELIEF sur une pastille ronde en verre (comme le pouce lune/soleil). */}
        <GlassIconOrb active={active}>{icon}</GlassIconOrb>
      </div>
      <span
        className={pulsing ? 'smbtn-pulsing' : undefined}
        style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
          color: textColor, textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {badge !== undefined && badge !== 0 && (
        <span
          style={{
            position: 'absolute', top: 6, right: 8,
            fontSize: 8, fontWeight: 'bold',
            color: accentColor,
            background: isLightTheme ? 'rgba(255,255,255,0.95)' : 'rgba(26,26,30,0.9)',
            borderRadius: 8, padding: '0 4px',
            border: `1px solid ${accentColor}`,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

/** Tiny helper — converts "#rrggbb" to the "r, g, b" string used by the CSS var. */
function hexToRgb(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
