import React from 'react';
import { cn } from '../lib/utils';
import { EegWaveform } from './EegWaveform';
import { CircularGauge } from './CircularGauge';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { useUiStore } from '../store/uiStore';
import { useNetworkStore } from '../store/networkStore';
import { TOKEN } from '../ui/tokens';

interface HealthPanelProps {
  eegBuffer:            React.RefObject<{ [channel: number]: number[] }>;
  gyroBuffer:           React.RefObject<{ x: number[]; y: number[]; z: number[] }>;
  displayBpm:           number | null;
  signalQuality:        number;
  museConnection:       'disconnected' | 'searching' | 'connected';
  batteryLevel:         number | null;
  sessionState:         'idle' | 'running' | 'paused' | 'ended';
  // PHASE-B: isLightTheme + P2P fields (appMode/isConnected/remoteSignalQuality/
  // remoteMuseConnected) read from stores directly — no longer props.
  onHide:               () => void;
  t:                    (key: string) => string;
  panelStyle:           (extra?: React.CSSProperties) => React.CSSProperties;
  /** ⚠️ SEGNALATO (solo SERENITY): « Santé Système devi cambiarlo. Metti il giro affiancato a
   *  EEG (rendendo più stretto EEG). Il PPG indica solo il numero di BPM senza il cerchio e
   *  mettigli accanto sulla stessa linea il capteur MUSE 2 — renderà meno alta la zona ». Un
   *  cambio di STRUTTURA, non solo di grafica — App.tsx monta questo stesso componente, e
   *  « EQUILIBRIUM detta struttura e taglia, SERENITY solo la grafica » (v.
   *  `docs/serenity-refonte.md`, principio dimensionale) vale anche al contrario: non si
   *  cambia la struttura di App.tsx per un desiderio di SERENITY. Prop opzionale, default
   *  `false` — App.tsx non la passa, non cambia una riga della SUA resa; SERENITY la passa
   *  `true` per la resa compatta descritta sopra. */
  compact?:             boolean;
}

export function HealthPanel({
  eegBuffer, gyroBuffer, displayBpm, signalQuality, museConnection,
  batteryLevel, sessionState, onHide, t, panelStyle, compact = false,
}: HealthPanelProps) {
  const isLightTheme         = useUiStore(s => s.isLightTheme);
  const appMode              = useNetworkStore(s => s.appMode);
  const isConnected          = useNetworkStore(s => s.isConnected);
  const remoteSignalQuality  = useNetworkStore(s => s.remoteSignalQuality);
  const remoteMuseConnected  = useNetworkStore(s => s.remoteMuseConnected);
  const remoteBatteryLevel   = useNetworkStore(s => s.remoteBatteryLevel);

  // Zones : EEG (courbe), puis GYRO / PPG / CAPTEURS / BATTERIE — ces 4 dernières sont
  // rendues EN PERSPECTIVE (anneaux inclinés), la batterie exactement comme la référence.
  const panels: { key: string; label: string }[] = [
    { key: 'eeg',     label: 'EEG' },
    { key: 'gyro',    label: 'GYRO' },
    { key: 'ppg',     label: 'PPG' },
    { key: 'signal',  label: t('muse_2_captors') as string },
  ];

  const isRemote = appMode === 'auditor' && isConnected;
  const q        = isRemote ? remoteSignalQuality : signalQuality;
  const active   = isRemote ? remoteMuseConnected : museConnection === 'connected';

  // FIX CONN-27: fall through to the remote peer's state when in auditor mode
  // (local Muse never connected on the auditor side).
  const effectiveMuse: 'disconnected' | 'searching' | 'connected' =
    isRemote ? (remoteMuseConnected ? 'connected' : 'disconnected') : museConnection;
  const effectiveBattery = isRemote ? remoteBatteryLevel : batteryLevel;
  const qColor   = 'rgba(255,255,255,0.85)';
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div
      className="shrink-0 rounded-xl overflow-hidden flex flex-col"
      style={{
        ...panelStyle(),
        boxShadow: !collapsed ? (TOKEN.panelShadow) : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/10 shrink-0">
        <span className={`text-xs uppercase tracking-wider truncate ${collapsed ? (isLightTheme ? 'text-slate-400' : 'text-white/35') : (isLightTheme ? 'text-slate-700' : 'text-white/80')}`}>
          {t('system_health_sensors')}
        </span>

        {/* Signal quality indicator (monochrome) */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          title={t(isRemote ? 'tip_signal_remote' : 'tip_signal_local')}
        >
          {isRemote && (
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>PC</span>
          )}
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            active ? 'bg-white'
              : (!isRemote && museConnection === 'searching') ? 'bg-white/60 animate-pulse'
              : 'bg-white/25',
          )} />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={qColor} strokeWidth="2.2" strokeLinecap="round" opacity={active ? 1 : 0.3}>
            <path d="M2 12 a10 10 0 0 1 20 0"/>
            <path d="M5.5 12 a6.5 6.5 0 0 1 13 0"/>
            <path d="M9 12 a3 3 0 0 1 6 0"/>
            <circle cx="12" cy="12" r="1" fill="currentColor"/>
          </svg>
          <span
            className="text-[12px] font-mono font-black tabular-nums leading-none"
            style={{ color: qColor, opacity: active ? 1 : 0, transition: 'opacity 0.4s' }}
          >
            {active ? `${Math.round(q)}%` : ''}
          </span>
        </div>

        <div className="ml-1">
          <GlassCollapseToggle on={!collapsed} onToggle={() => setCollapsed(c => !c)} />
        </div>
        {void onHide}
      </div>

      {/* sub-zones */}
      {!collapsed && (compact ? (
        /* ── RESA COMPATTA, SOLO SERENITY — v. la nota su `compact` sopra. GYRO affiancato a
           EEG (che si restringe per fargli posto, `flex:2`/`flex:1`) invece di stargli sotto;
           PPG diventa un numero solo (niente `CircularGauge`, il cerchio) sulla STESSA riga
           di MUSE 2/batteria invece di una zona a sé (100px risparmiati). */
        <div className="flex flex-col gap-2">
          <div className="flex gap-2" style={{ minHeight: 72 }}>
            <div className="relative overflow-hidden" style={{ flex: 2, minHeight: 72 }}>
              <span className="absolute left-2 top-1 z-10 text-[10px] tracking-widest uppercase font-bold text-white/70">EEG</span>
              <div className="absolute inset-0 pt-5 pb-1 px-1.5">
                <EegWaveform dataBuffer={eegBuffer} isRunning={sessionState === 'running'} />
              </div>
            </div>
            <div className="relative overflow-hidden" style={{ flex: 1, minHeight: 72 }}>
              <span className="absolute left-2 top-1 z-10 text-[10px] tracking-widest uppercase font-bold text-white/70">GYRO</span>
              <GyroRadar gyroBuffer={gyroBuffer} />
            </div>
          </div>
          <div className="px-1.5">
            <MuseSensorLine connected={effectiveMuse === 'connected'} batteryLevel={effectiveBattery} bpm={displayBpm} />
          </div>
          <div className="px-1.5">
            <ElectrodeGrid eegBuffer={eegBuffer} connected={effectiveMuse === 'connected'} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {panels.map(({ key, label }) => (
            <SubPanel
              key={key}
              panelKey={key}
              label={label}
              eegBuffer={eegBuffer}
              gyroBuffer={gyroBuffer}
              displayBpm={displayBpm}
              museConnection={effectiveMuse}
              batteryLevel={effectiveBattery}
              sessionState={sessionState}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-panel
// ---------------------------------------------------------------------------
interface SubPanelProps {
  panelKey:       string;
  label:          string;
  eegBuffer:      React.RefObject<{ [channel: number]: number[] }>;
  gyroBuffer:     React.RefObject<{ x: number[]; y: number[]; z: number[] }>;
  displayBpm:     number | null;
  museConnection: 'disconnected' | 'searching' | 'connected';
  batteryLevel:   number | null;
  sessionState:   'idle' | 'running' | 'paused' | 'ended';
}

// Hauteurs des zones.
const ZONE_H: Record<string, number> = { eeg: 84, gyro: 70, ppg: 100, signal: 96 };

function SubPanel({ panelKey, label, eegBuffer, gyroBuffer, displayBpm, museConnection, batteryLevel, sessionState }: SubPanelProps) {
  return (
    <div className="relative overflow-hidden" style={{ minHeight: ZONE_H[panelKey] ?? 90 }}>
      {/* GYRO/PPG : titre descendu et centré verticalement AVEC la figure (gain de place) ;
          les autres zones gardent le titre en haut. */}
      <div className={cn(
        "absolute left-2 z-10 flex items-center pointer-events-none",
        (panelKey === 'gyro' || panelKey === 'ppg') ? "top-1/2 -translate-y-1/2" : "top-1 right-2 justify-between"
      )}>
        <span className="text-[10px] tracking-widest uppercase font-bold text-white/70">{label}</span>
      </div>

      {panelKey === 'eeg' && (
        <div className="absolute inset-0 pt-5 pb-1 px-1.5">
          <EegWaveform dataBuffer={eegBuffer} isRunning={sessionState === 'running'} />
        </div>
      )}

      {panelKey === 'gyro' && <GyroRadar gyroBuffer={gyroBuffer} />}

      {panelKey === 'ppg' && (
        <div className="absolute inset-0 pt-1 pb-0.5 flex items-center justify-center">
          <CircularGauge value={displayBpm} label="BPM" max={200} tickStep={20} tiltDeg={67} />
        </div>
      )}

      {panelKey === 'signal' && (
        <ElectrodeRing
          eegBuffer={eegBuffer}
          museConnection={museConnection}
          batteryLevel={batteryLevel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gyro — radar incliné EN PERSPECTIVE (rotateX 3D)
// ---------------------------------------------------------------------------
function GyroRadar({ gyroBuffer }: { gyroBuffer: React.RefObject<{ x: number[]; y: number[]; z: number[] }> }) {
  const gx = gyroBuffer.current?.x.slice(-1)[0] ?? 0;
  const gy = gyroBuffer.current?.y.slice(-1)[0] ?? 0;
  const gz = gyroBuffer.current?.z.slice(-1)[0] ?? 0;
  const max = Math.max(Math.abs(gx), Math.abs(gy), Math.abs(gz), 40);
  const cx = 50, cy = 50, r = 48, labelOffset = 6;

  const points = [
    { val: gx, label: 'X', angle: -90 },
    { val: gy, label: 'Y', angle:  30 },
    { val: gz, label: 'Z', angle: 150 },
  ];
  const dataPts = points.map(p => {
    const rad = (p.angle * Math.PI) / 180;
    const len = (Math.abs(p.val) / max) * r;
    return { ...p, x: cx + Math.cos(rad) * len, y: cy + Math.sin(rad) * len };
  });

  return (
    <div className="absolute inset-0 pt-1 pb-1 flex items-center justify-center" style={{ perspective: 260 }}>
      <svg viewBox="0 0 100 100" className="w-full h-full"
        style={{ transform: 'rotateX(58deg)', transformOrigin: 'center 55%' }}>
        {[0.33, 0.66, 1].map((f, i) => (
          <polygon key={i}
            points={points.map(p => {
              const rad = (p.angle * Math.PI) / 180;
              return `${cx + Math.cos(rad) * r * f},${cy + Math.sin(rad) * r * f}`;
            }).join(' ')}
            fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6"
          />
        ))}
        {points.map(p => {
          const rad = (p.angle * Math.PI) / 180;
          return (
            <line key={p.label}
              x1={cx} y1={cy}
              x2={cx + Math.cos(rad) * r} y2={cy + Math.sin(rad) * r}
              stroke="rgba(255,255,255,0.22)" strokeWidth="0.6"
            />
          );
        })}
        <polygon
          points={dataPts.map(p => `${p.x},${p.y}`).join(' ')}
          fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4"
        />
        {dataPts.map(p => (
          <circle key={p.label} cx={p.x} cy={p.y} r="2.4" fill="#ffffff" />
        ))}
        {points.map(p => {
          const rad = (p.angle * Math.PI) / 180;
          return (
            <text key={p.label}
              x={cx + Math.cos(rad) * (r + labelOffset)}
              y={cy + Math.sin(rad) * (r + labelOffset) + 2}
              fill="rgba(255,255,255,0.7)" fontSize="7" fontFamily="monospace" fontWeight="bold"
              textAnchor="middle"
            >
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capteurs — grille HORIZONTALE (comme avant), monochrome
// ---------------------------------------------------------------------------
function ElectrodeRing({
  eegBuffer, museConnection, batteryLevel,
}: {
  eegBuffer: React.RefObject<{ [channel: number]: number[] }>;
  museConnection: 'disconnected' | 'searching' | 'connected';
  batteryLevel: number | null;
}) {
  const connected = museConnection === 'connected';
  return (
    <div className="absolute inset-0 pt-5 pb-1 px-1.5 flex flex-col justify-center gap-1.5">
      <MuseSensorLine connected={connected} batteryLevel={batteryLevel} />
      <ElectrodeGrid eegBuffer={eegBuffer} connected={connected} />
    </div>
  );
}

// ── LA RIGA « MUSE 2 » — segnalata: « mettigli accanto sulla stessa linea il capteur MUSE 2 »
// (v. la nota su `compact`). Era la prima riga di `ElectrodeRing`, mai una funzione a sé —
// estratta per essere riusata TALE E QUALE dalla resa compatta di SERENITY (con `bpm` in più
// sulla stessa riga) SENZA duplicare il disegno dell'icona/batteria: la resa di App.tsx (via
// `ElectrodeRing`, sopra) non cambia di un pixel, chiama solo la stessa funzione.
function MuseSensorLine({
  connected, batteryLevel, bpm,
}: {
  connected: boolean;
  batteryLevel: number | null;
  /** Presente SOLO nella resa compatta di SERENITY — il numero del PPG, senza il suo cerchio
   *  (`CircularGauge`), sulla stessa riga del sensore MUSE 2. `undefined` = non disegnarlo
   *  affatto (il caso di App.tsx, dove il PPG resta la sua zona a sé con l'anello). */
  bpm?: number | null;
}) {
  return (
    <div className="flex items-center justify-between text-[10px] font-mono">
      {bpm !== undefined && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] tracking-widest uppercase font-bold text-white/60">PPG</span>
          <span className="text-[13px] font-mono font-black tabular-nums" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {bpm != null && isFinite(bpm) ? Math.round(bpm) : '—'}
          </span>
          <span className="text-white/50">BPM</span>
        </div>
      )}
      <div className="flex items-center gap-1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke={connected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.28)'} strokeWidth="2.2">
          <path d="M6 7l12 10-6 5V2l6 5L6 17"/>
        </svg>
        <span style={{ color: connected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.32)' }}>MUSE 2</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="relative" style={{ width: 26, height: 12 }}>
          <div style={{
            position: 'absolute', inset: 0,
            border: `1.5px solid rgba(255,255,255,${batteryLevel !== null ? 0.6 : 0.28})`,
            borderRadius: 2, background: 'rgba(0,0,0,0.4)', overflow: 'hidden',
          }}>
            <div style={{ height: '100%', width: `${batteryLevel || 0}%`, background: 'rgba(255,255,255,0.82)' }} />
          </div>
          <div style={{ position: 'absolute', right: -2, top: 4, bottom: 4, width: 1.5, background: `rgba(255,255,255,${batteryLevel !== null ? 0.6 : 0.28})`, borderRadius: 1 }} />
        </div>
        <span className="text-[12px] font-mono font-black tabular-nums" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {batteryLevel !== null ? `${batteryLevel.toFixed(0)}%` : ''}
        </span>
      </div>
    </div>
  );
}

// ── LA GRIGLIA ELETTRODI — stessa estrazione, stessa ragione: SOLO i quattro cerchi TP9/AF7/
// AF8/TP10, senza la riga MUSE 2 sopra (quella è `MuseSensorLine`, ora indipendente). App.tsx
// (via `ElectrodeRing`) le monta insieme, una sotto l'altra — SERENITY compatto le monta
// separate, con altro in mezzo (EEG/GYRO affiancati, sopra).
function ElectrodeGrid({
  eegBuffer, connected,
}: {
  eegBuffer: React.RefObject<{ [channel: number]: number[] }>;
  connected: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {['TP9', 'AF7', 'AF8', 'TP10'].map((ch, i) => {
        const s   = eegBuffer.current?.[i] ?? [];
        const rms = s.length
          ? Math.sqrt(s.slice(-64).reduce((a: number, v: number) => a + v * v, 0) / Math.min(64, s.length))
          : 0;
        const qv  = rms < 5 ? 0 : rms > 500 ? 20 : Math.min(100, (rms / 200) * 100);
        const ok  = connected && qv > 40;
        // MONOCHROME : la qualité se lit par la LUMINOSITÉ (opacité), pas par la couleur.
        const op  = !connected ? 0.25 : 0.4 + (qv / 100) * 0.55;
        const col = `rgba(255,255,255,${op.toFixed(3)})`;
        return (
          <div key={ch} className="flex flex-col items-center gap-0.5">
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              border: `1.5px solid ${col}`,
              background: ok ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="10" height="6" viewBox="0 0 12 8" fill="none">
                <path d="M0 4 L2 4 L3 1 L5 7 L7 1 L9 7 L10 4 L12 4"
                  stroke={col} strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[8px] font-mono font-bold" style={{ color: col }}>{ch}</span>
          </div>
        );
      })}
    </div>
  );
}
