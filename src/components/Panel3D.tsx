import React, { useState } from 'react';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { PANEL3D, glassSurface, type Tilt } from '../ui/panel3d';
import { useI18n } from '../i18n';

/**
 * Panel3D — WRAPPER de présentation réutilisable pour la refonte "verre en perspective".
 * Il ENVELOPPE le contenu d'un panneau existant SANS toucher sa logique : on lui passe le
 * panneau tel quel en `children`. Il apporte uniquement : la surface verre inclinée (tokens
 * panel3d), l'en-tête, et le chrome commun — replier/déplier, réinitialiser, masquer.
 *
 * Aucune logique métier ici. `onHide` se branche sur le système `moduleVis` DÉJÀ en place ;
 * `onReset` (optionnel) restaure l'état par défaut du panneau côté appelant.
 */
export function Panel3D({
  title, children, side = 'center', isLightTheme = false,
  onHide, onReset, defaultCollapsed = false, accent, style, bodyStyle,
}: {
  title: string;
  children?: React.ReactNode;
  side?: Tilt;
  isLightTheme?: boolean;
  onHide?: () => void;
  onReset?: () => void;
  defaultCollapsed?: boolean;
  accent?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const g = isLightTheme ? PANEL3D.glass.light : PANEL3D.glass.dark;
  const iconBtn: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: g.title, opacity: 0.65, lineHeight: 1, padding: '0 4px',
    transition: `opacity ${PANEL3D.dur} ${PANEL3D.ease}`,
  };

  return (
    <div style={{ ...glassSurface(side, isLightTheme), padding: '10px 12px', color: g.text, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 8 }}>
        <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent || g.title }}>
          {title}
        </span>
        {onReset && (
          <button onClick={onReset} title={t('tip_reset') as string} style={{ ...iconBtn, fontSize: 12 }}>⤾</button>
        )}
        <GlassCollapseToggle on={!collapsed} onToggle={() => setCollapsed(c => !c)} />
        {void onHide}
      </div>
      {!collapsed && <div style={bodyStyle}>{children}</div>}
    </div>
  );
}
