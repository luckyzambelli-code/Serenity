import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useI18n } from '../i18n';

/**
 * GlassThemeToggle — sélecteur de thème en VERRE (recréation fidèle de la réf. "Glass Toggle") :
 * une pilule (piste) + un POUCE en verre smerigliato translucide qui glisse à droite (Dark ·
 * lune) ou à gauche (Light · soleil), avec reflet courbe et ombre profonde.
 *
 * PRÉSENTATION SEULE : ne fait que basculer `isLightTheme` (état UI existant). Aucun calcul,
 * aucune logique métier.
 */
export function GlassThemeToggle() {
  const isLightTheme  = useUiStore(s => s.isLightTheme);
  const setLightTheme = useUiStore(s => s.setLightTheme);
  const { t } = useI18n();
  const dark = !isLightTheme;
  // L'infobulle annonce CE QUE FAIT le clic (basculer vers l'autre thème), pas l'état courant.
  const tip = t(dark ? 'tip_theme_light' : 'tip_theme_dark') as string;

  const W = 150, H = 52, THUMB = 62;
  const thumbCommon: React.CSSProperties = {
    position: 'absolute', top: (H - THUMB) / 2, width: THUMB, height: THUMB, borderRadius: '50%',
    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'left 0.4s cubic-bezier(.34,1.2,.4,1), right 0.4s cubic-bezier(.34,1.2,.4,1)',
    backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)',
  };

  return (
    <button
      type="button"
      onClick={() => setLightTheme(v => !v)}
      aria-label={tip}
      title={tip}
      style={{ position: 'relative', width: W, height: H, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }}
    >
      {/* Piste (creuse) */}
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 999, display: 'flex', alignItems: 'center',
          justifyContent: dark ? 'flex-start' : 'flex-end',
          background: dark ? '#17171b' : '#a6a6ac',
          boxShadow: dark
            ? 'inset 0 3px 8px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,255,255,0.05)'
            : 'inset 0 3px 7px rgba(0,0,0,0.2), inset 0 -1px 0 rgba(255,255,255,0.45)',
        }}
      >
        <span style={{
          margin: dark ? '0 0 0 24px' : '0 24px 0 0', fontSize: 15, fontWeight: 500,
          fontFamily: "'Inter', system-ui, sans-serif",
          color: dark ? '#8d9199' : '#f3f3f5',
        }}>
          {dark ? 'Dark' : 'Light'}
        </span>
      </div>

      {/* Pouce en verre smerigliato (glisse gauche/droite) */}
      <div
        style={{
          ...thumbCommon,
          left: dark ? W - THUMB + 6 : -6,
          background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.28)',
          border: dark ? '1px solid rgba(255,255,255,0.16)' : '1px solid rgba(255,255,255,0.5)',
          boxShadow: dark
            ? '0 14px 26px rgba(0,0,0,0.6), inset 0 3px 8px rgba(255,255,255,0.28), inset 0 -8px 14px rgba(0,0,0,0.5)'
            : '0 14px 22px rgba(0,0,0,0.24), inset 0 3px 9px rgba(255,255,255,0.6), inset 0 -8px 14px rgba(0,0,0,0.14)',
        }}
      >
        {/* reflets courbes du verre */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 55% at 32% 24%, rgba(255,255,255,0.32), rgba(255,255,255,0) 60%)' }} />
        <div style={{ position: 'absolute', left: '-30%', top: '8%', width: '150%', height: '70%', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.24), rgba(255,255,255,0) 55%)', transform: 'rotate(-18deg)' }} />
        {dark
          ? <Moon size={26} strokeWidth={1.6} fill="#fff" style={{ color: '#fff', position: 'relative', filter: 'drop-shadow(0 0 9px rgba(255,255,255,0.55))' }} />
          : <Sun size={26} strokeWidth={1.8} style={{ color: '#fff', position: 'relative', filter: 'drop-shadow(0 0 7px rgba(255,255,255,0.7))' }} />}
      </div>
    </button>
  );
}
