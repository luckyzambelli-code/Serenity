import React from 'react';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { useUiStore } from '../store/uiStore';
import { glassSurface } from '../ui/panel3d';

interface BiometricPanelProps {
  smoothPct:      number;
  museConnection: 'disconnected' | 'searching' | 'connected';
  sessionState:   'idle' | 'running' | 'paused' | 'ended';
  // PHASE-B: isLightTheme prop removed — read from uiStore directly.
  onHide:         () => void;
  t:              (key: string) => string;
  panelStyle:     (extra?: React.CSSProperties) => React.CSSProperties;
}

export function BiometricPanel({
  smoothPct, museConnection, sessionState, onHide, t, panelStyle,
}: BiometricPanelProps) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const pct       = museConnection === 'connected' ? smoothPct : 0;
  const isOff     = !(sessionState === 'running' || museConnection === 'connected');
  const tier      = pct >= 80 ? 'optimal' : pct >= 60 ? 'good' : pct >= 35 ? 'low' : 'critical';
  const tierColor = tier === 'optimal' ? '#22c55e'
                  : tier === 'good'    ? '#4ade80'
                  : tier === 'low'     ? '#a3e635'
                  : '#65a30d';
  // STYLE B (thème sombre) : barre + % en BLANC. Le thème clair garde la couleur de palier.
  const barColor  = isLightTheme ? tierColor : 'rgba(255,255,255,0.9)';
  const pctDisplay = Math.round(pct);
  // REDESIGN Fase 3 — collassabile: chiuso di default (header con la % resta visibile),
  // la barra si mostra all'espansione. Meno densità nella colonna destra.
  const [collapsed, setCollapsed] = React.useState(true);

  return (
    <div
      className="shrink-0 px-3 py-2"
      style={{
        ...glassSurface('right', isLightTheme, true), marginTop: 4,
        boxShadow: !collapsed ? (isLightTheme ? '0 16px 34px rgba(38,40,48,0.20), inset 0 1px 0 rgba(255,255,255,0.5)' : '0 16px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)') : undefined,
      }}
    >
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: barColor, boxShadow: 'none',
              animation: museConnection === 'connected' ? 'pulseDot 1.5s ease-in-out infinite' : 'none',
            }} />
            <span className={`text-xs uppercase tracking-wider ${collapsed ? (isLightTheme ? 'text-slate-400' : 'text-white/35') : (isLightTheme ? 'text-slate-700' : 'text-white/80')}`}>
              {t('biometric_integrity')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: barColor }}>
              {museConnection === 'connected' ? `${pctDisplay}%` : '—'}
            </span>
            <GlassCollapseToggle on={!collapsed} onToggle={() => setCollapsed(c => !c)} />
            {void onHide}
          </div>
        </div>

        {!collapsed && (<>
        {/* Bar */}
        <div
          className="relative h-4 overflow-hidden"
          style={{
            borderRadius: 6, // arrondi très léger (cohérence)
            background: isLightTheme ? 'rgba(200,220,240,0.6)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isLightTheme ? `${tierColor}33` : 'rgba(255,255,255,0.20)'}`,
          }}
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${pct}%`, borderRadius: 6,
              background: isLightTheme
                ? `linear-gradient(90deg, ${tierColor}80 0%, ${tierColor}cc 100%)`
                : 'linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.9) 100%)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[9px] font-mono font-bold" style={{ color: '#ffffff', mixBlendMode: 'difference' }}>
              {museConnection === 'connected' ? `${pctDisplay}%` : '— — —'}
            </span>
          </div>
        </div>

        {isOff && (
          <div className="mt-1 text-[7px] font-mono uppercase tracking-[0.25em] text-center animate-pulse" style={{ color: '#facc15' }}>
            ◌ {t('status_awaiting_muse')}
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}
