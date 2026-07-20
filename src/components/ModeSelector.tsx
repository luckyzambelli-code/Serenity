import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Eye } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../i18n';

type Mode = 'local' | 'auditor' | 'participant';
interface ModeSelectorProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
  disabled?: boolean;
}

const TICK_COUNT = 14;

const PersonIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);

const MODE_IDS: Mode[] = ['local', 'auditor', 'participant'];
const MODE_ICONS: React.ReactNode[] = [
  <Wifi size={13} />,
  <Eye size={13} />,
  <PersonIcon size={13} />,
];

// FIX CONN-31: distinct accent colour per mode so the active role reads at a
// glance. Matches the ConnectionModal palette: auditor = cyan, preclear =
// violet, local = neutral slate.
const MODE_COLORS: Record<Mode, { rgb: string; hex: string; glow: string }> = {
  local:       { rgb: '148, 163, 184', hex: '#94a3b8', glow: 'rgba(148,163,184,0.55)' }, // slate
  auditor:     { rgb: '6, 182, 212',   hex: '#22d3ee', glow: 'rgba(6,182,212,0.85)'   }, // cyan
  participant: { rgb: '139, 92, 246',  hex: '#c4b5fd', glow: 'rgba(139,92,246,0.85)'  }, // violet
};

export const ModeSelector: React.FC<ModeSelectorProps> = ({ currentMode, onModeChange, disabled = false }) => {
  const { t } = useI18n();
  const railRef = useRef<HTMLDivElement>(null);
  const [pillX, setPillX] = useState(0);
  const [pillW, setPillW] = useState(0);

  const activeIdx = MODE_IDS.indexOf(currentMode);
  const activeColor = MODE_COLORS[currentMode];

  // Labels translated at render time
  const modeLabels: Record<Mode, string> = {
    local:       t('mode_local') as string,
    auditor:     t('mode_auditor') as string,
    participant: t('mode_participant') as string,
  };

  useEffect(() => {
    const compute = () => {
      if (!railRef.current) return;
      const w = railRef.current.offsetWidth;
      const slot = w / MODE_IDS.length;
      setPillW(slot);
      setPillX(activeIdx * slot);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [activeIdx]);

  const handleModeChange = (mode: Mode) => {
    if (!disabled && mode !== currentMode) { onModeChange(mode); playSwitchSound(); }
  };

  const playSwitchSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
  };

  return (
    <div className={cn(disabled && 'opacity-50 cursor-not-allowed')}
      style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* ── HARDWARE RAIL ── */}
      <div ref={railRef} style={{
        position: 'relative', height: 22,
        background: 'linear-gradient(180deg, #000508 0%, #010b1c 100%)',
        border: `1px solid rgba(${activeColor.rgb}, 0.40)`, borderRadius: 3,
        boxShadow: `inset 0 2px 6px rgba(0,0,0,0.95), 0 0 10px rgba(${activeColor.rgb}, 0.15)`,
        transition: 'border-color 0.3s, box-shadow 0.3s',
        overflow: 'hidden',
      }}>
        {/* Ticks */}
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', padding:'0 4px', pointerEvents:'none' }}>
          {Array.from({ length: TICK_COUNT }).map((_, i) => (
            <div key={i} style={{ flex:1, height: i % 7 === 0 ? 10 : i % 3 === 0 ? 6 : 4, borderLeft:'1px solid rgba(255,255,255,0.15)' }} />
          ))}
        </div>

        {/* Gliding pill */}
        <motion.div
          animate={{ x: pillX }}
          transition={{ type:'spring', stiffness:500, damping:40, mass:0.6 }}
          style={{
            position:'absolute', top: 2, bottom: 2,
            width: pillW || '33.33%', borderRadius: 2,
            background: `linear-gradient(180deg, rgba(${activeColor.rgb}, 0.95) 0%, rgba(${activeColor.rgb}, 0.70) 100%)`,
            boxShadow: `0 0 14px ${activeColor.glow}, 0 0 4px rgba(255,255,255,0.85)`,
          }}
        />

        {/* Invisible click zones */}
        <div style={{ position:'absolute', inset:0, display:'flex' }}>
          {MODE_IDS.map(mode => (
            <button key={mode} onClick={() => handleModeChange(mode)} disabled={disabled}
              style={{ flex:1, background:'transparent', border:'none', cursor: disabled ? 'not-allowed' : 'pointer' }} />
          ))}
        </div>
      </div>

      {/* ── ICON + LABEL ROW ── */}
      <div style={{ display:'flex' }}>
        {MODE_IDS.map((mode, i) => {
          const isActive = mode === currentMode;
          const c = MODE_COLORS[mode];
          return (
            <button key={mode} onClick={() => handleModeChange(mode)} disabled={disabled}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: 'transparent', border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer', padding: '2px 4px',
              }}>
              <span style={{
                color: isActive ? c.hex : 'rgba(255,255,255,0.25)',
                filter: isActive ? `drop-shadow(0 0 6px ${c.glow})` : 'none',
                transition: 'color 0.2s, filter 0.2s', display: 'flex',
              }}>{MODE_ICONS[i]}</span>
              <span style={{
                fontFamily: 'monospace', fontSize: 8, fontWeight: 'bold',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: isActive ? c.hex : 'rgba(255,255,255,0.28)',
                textShadow: isActive ? `0 0 8px ${c.glow}` : 'none',
                transition: 'color 0.2s, text-shadow 0.2s',
                whiteSpace: 'nowrap',
              }}>{modeLabels[mode]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
