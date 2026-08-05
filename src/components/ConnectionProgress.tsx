import React, { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Wifi } from 'lucide-react';
import { useI18n } from '../i18n.tsx';
import { LAYER } from "../ui/layers";

type Phase = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface ConnectionProgressProps {
  phase: Phase;
  detail?: string;
  role: 'auditor' | 'participant' | 'local';
  /** CONN-54: authoritative "we are connected" flag. Once true the overlay
   *  flashes success and hides, regardless of any later `connecting` churn from
   *  the media/heartbeat layer (which previously left it stuck on screen). */
  isConnected: boolean;
  onClose: () => void;
}

/**
 * CONN-48: a startup window that reports the connection state with an animated
 * progress bar. Shown while the P2P link is being established (connecting),
 * flashes a success tick when connected, and surfaces errors with a retry hint.
 */
export function ConnectionProgress({ phase, detail, role, isConnected, onClose }: ConnectionProgressProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIX CONN-51/54: the dismiss effect depends ONLY on `phase`/`isConnected`,
  // never on a per-render value. The auditor view re-renders constantly (needle,
  // EEG…); an effect tied to an unstable dep used to reset the hide-timer forever
  // → the "connected" overlay stayed up and blocked the UI. `flashedRef` ensures
  // the success state is shown at most ONCE per connection, and is reset when the
  // link drops so the next connect flashes again.
  const flashedRef = useRef(false);

  useEffect(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (isConnected) {
      if (!flashedRef.current) {
        flashedRef.current = true;
        setVisible(true);
        hideTimer.current = setTimeout(() => { setVisible(false); }, 1100);
      } else {
        setVisible(false); // already flashed — ignore later 'connecting' churn
      }
    } else {
      flashedRef.current = false;
      setVisible(phase === 'connecting' || phase === 'error');
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // Depend on phase + isConnected ONLY — not on onClose (see ref above).
  }, [phase, isConnected]);

  if (!visible || role === 'local') return null;

  const isErr = phase === 'error' && !isConnected;
  const isDone = isConnected;
  const accent = isErr ? '#f87171' : isDone ? '#4ade80' : '#22d3ee';

  // discrete steps so the user sees where the handshake is
  const steps = [
    t('conn_step_signaling') as string,
    t('conn_step_peer') as string,
    t('conn_step_media') as string,
  ];
  const activeStep = isDone ? 3 : isErr ? -1 : (detail && /relay|media|stream/i.test(detail) ? 2 : detail && /peer|auditor|préclair|preclear/i.test(detail) ? 1 : 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: LAYER.session,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(2,6,23,0.72)', backdropFilter: 'blur(6px)',
      // FIX CONN-51: never trap the user — once connected the overlay is purely
      // a transient flash, so let clicks pass through to the app underneath.
      pointerEvents: isDone ? 'none' : 'auto',
    }}>
      <div style={{
        width: 'min(90vw, 420px)', padding: '28px 26px', borderRadius: 16,
        background: 'rgba(8,15,30,0.96)', border: `1px solid ${accent}55`,
        boxShadow: `0 12px 60px rgba(0,0,0,0.6), 0 0 40px ${accent}22`,
        color: '#e2e8f0', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          {isDone
            ? <CheckCircle2 size={44} strokeWidth={1.6} style={{ color: accent }} />
            : isErr
              ? <AlertTriangle size={44} strokeWidth={1.6} style={{ color: accent }} />
              : <Loader2 size={44} strokeWidth={1.6} style={{ color: accent }} className="animate-spin" />}
        </div>

        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.04em', color: accent, marginBottom: 6 }}>
          {isDone ? t('conn_progress_connected')
            : isErr ? t('conn_progress_error')
            : t('conn_progress_connecting')}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 18, minHeight: 16, fontFamily: 'monospace' }}>
          {detail || ' '}
        </div>

        {/* Progress bar */}
        <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' }}>
          {isErr ? (
            <div style={{ position: 'absolute', inset: 0, background: accent, opacity: 0.5 }} />
          ) : isDone ? (
            <div style={{ position: 'absolute', inset: 0, background: accent }} />
          ) : (
            // indeterminate sliding bar
            <div style={{
              position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 6,
              background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
              animation: 'connSlide 1.1s ease-in-out infinite',
            }} />
          )}
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 6 }}>
          {steps.map((label, i) => {
            const done = activeStep > i;
            const active = activeStep === i;
            const col = isErr ? '#64748b' : done ? '#4ade80' : active ? accent : '#475569';
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%', background: col,
                  boxShadow: active ? `0 0 8px ${col}` : 'none',
                  animation: active && !isErr && !isDone ? 'pulse 1.2s infinite' : 'none',
                }} />
                <span style={{ fontSize: 9, color: col, letterSpacing: '0.03em' }}>{label}</span>
              </div>
            );
          })}
        </div>

        {(isErr) && (
          <button onClick={onClose} style={{
            marginTop: 20, padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.45)',
            color: '#fca5a5', fontSize: 12, fontWeight: 700,
          }}>
            {t('conn_progress_close')}
          </button>
        )}

        <div style={{ marginTop: isErr ? 12 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10, color: '#475569' }}>
          <Wifi size={12} /> {role === 'auditor' ? t('mode_auditor') : t('mode_participant')}
        </div>
      </div>

      <style>{`@keyframes connSlide { 0% { left: -40%; } 100% { left: 100%; } }`}</style>
    </div>
  );
}
