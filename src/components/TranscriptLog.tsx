import React, { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { useI18n } from '../i18n.tsx';
import { useUiStore } from '../store/uiStore';
import { GlassCollapseToggle } from './GlassCollapseToggle';

export interface LogEntry {
  time: number;
  speaker?: 'Aud' | 'PC' | 'SYS' | 'NEEDLE';
  text: string;
  type?: 'normal' | 'highlight' | 'success';
  tone?: { label: 'calm' | 'neutral' | 'tense' | 'stressed'; pitch: number; energy: number };
}

interface TranscriptLogProps {
  logs: LogEntry[];
  isVisible: boolean;
  onToggle: () => void;
  onDisable?: () => void;
  /** SOLO sessions: hide the spoken (Aud/PC) lines from the LIVE view — the solo
   *  auditor doesn't need to read their own words back. The speech is still kept
   *  in `logs` so it reaches the post-session report + History PDF. NEEDLE / SYS
   *  lines stay visible. */
  hideSpeech?: boolean;
  // PHASE-B: isLightTheme prop removed — read from uiStore.
}

export function TranscriptLog({ logs, isVisible, onToggle, onDisable, hideSpeech }: TranscriptLogProps) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  // FIX L-06: only auto-scroll to the top (newest entry, list is reversed) if
  // the user is already near the top — otherwise leave the scroll position alone
  // so they can read older entries without being yanked back every tick.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isVisible) return;
    const NEAR_TOP_PX = 50;
    if (el.scrollTop <= NEAR_TOP_PX) {
      el.scrollTop = 0;
    }
  }, [logs, isVisible]);

  if (!isVisible) {
    // Réduit au MINIMUM comme les autres zones : juste l'en-tête + le mini glass-toggle (visible).
    return (
      <div className="flex items-center justify-between p-2 border-b border-white/10">
        <span className={`text-xs uppercase tracking-wider truncate ${isLightTheme ? 'text-slate-400' : 'text-white/35'}`}>
          {t('session_transcript')}
        </span>
        <GlassCollapseToggle on={false} onToggle={() => onToggle && onToggle()} />
      </div>
    );
  }

  const reversedLogs = (hideSpeech
    ? logs.filter(l => l.speaker !== 'Aud' && l.speaker !== 'PC')
    : [...logs]).reverse();

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex items-center justify-between p-2 border-b border-white/10">
        <span className={`text-xs font-mono uppercase tracking-wider ${isLightTheme ? 'text-sky-700' : 'text-white/70'}`}>
          {t('session_transcript')}
        </span>
        {/* Chevron → mini glass-toggle (repli/dépli). Croix de masquage retirée. */}
        <GlassCollapseToggle on={isVisible} onToggle={() => onToggle && onToggle()} />
        {void onDisable}
      </div>
      {/* FIX L-05: collapsed nested scroll containers — single scroll surface */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-1">
          {reversedLogs.map((log, i) => (
              <div key={i} className={cn(
                "flex items-start gap-2 py-1 border-b border-white/5 last:border-0",
                log.speaker === 'NEEDLE' && "opacity-70"
              )}>
                <span className="text-[10px] text-white/35 mt-0.5 w-10 shrink-0 leading-tight">
                  {`${(log.time || 0).toFixed(1)}s`}
                </span>
                <div className={cn(
                  "flex-1",
                  // Transcript NORMAL (pas d'italique) · TOUT en BLANC sauf les infos SYSTÈME.
                  (log.type === 'highlight' || log.type === 'success') && "font-bold",
                  log.speaker === 'SYS' ? "text-white/45" : "text-white/90"
                )}>
                  {log.speaker && log.speaker !== 'NEEDLE' && (
                    <span className={cn(
                      "mr-1 font-bold",
                      log.speaker === 'SYS' ? "text-white/45" : "text-white/90",
                    )}>
                      {log.speaker === 'Aud' ? 'AUD' : log.speaker === 'PC' ? 'PC' : (log.speaker || '').toUpperCase()}:
                    </span>
                  )}
                  {log.text}
                  {log.tone && (
                    <span className="ml-1.5 text-[8px] px-1 py-0.5 rounded bg-white/10 text-white/70">
                      {(t(`tone_${log.tone.label}` as any) || '').toUpperCase()} {log.tone.pitch > 0 ? `${log.tone.pitch}Hz` : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
