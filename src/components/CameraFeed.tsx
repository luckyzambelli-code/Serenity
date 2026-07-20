import React, { useEffect, useRef, useState } from 'react';
import { attachAudioBoost } from '../lib/audioBoost';
import { useTranslation } from '../i18n';
import { GlassCollapseToggle } from './GlassCollapseToggle';

interface CameraFeedProps {
  title: string;
  isVisible: boolean;
  onToggle: () => void;
  onDisable?: () => void;
  placeholderImage?: string;
  bpm?: number;
  massStatus?: string;
  hideOverlay?: boolean;
  lang?: 'en' | 'fr' | 'it' | 'es' | 'sv';
  /** Pass a live MediaStream to display instead of local camera */
  externalStream?: MediaStream | null;
  /** CONN-33: when WebRTC failed, a relayed JPEG data-URL to show instead. */
  fallbackFrame?: string | null;
  /** Phone-satellite: force-mute the remote audio playback (co-located → the
   *  auditor hears the PC directly; playing it would cause Larsen). The stream
   *  is still consumed elsewhere for transcription. */
  forceMuted?: boolean;
}

export function CameraFeed({ title, isVisible, onToggle, onDisable, bpm, massStatus, hideOverlay, lang = 'en', externalStream, fallbackFrame, forceMuted = false }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  // FIX CONN-28: attach the external stream via a CALLBACK REF instead of a
  // useEffect+useRef pair. CameraFeed renders TWO different <video> elements
  // (collapsed vs expanded branch); with the effect approach, toggling
  // isVisible mounted a fresh element whose srcObject was never set → black
  // panel even though the MediaStream was alive. A callback ref fires exactly
  // when the element mounts, so the stream is guaranteed to be attached the
  // moment the node exists, regardless of which branch rendered it.
  const attachExternal = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el || externalStream === undefined) return;
    // IMPERATIVE mute: React's `muted` JSX prop is unreliable on media elements
    // (it sets the attribute, not the property). In satellite we MUST hard-mute
    // the PC's audio playback or the Mac speakers feed the room → Larsen.
    el.muted = forceMuted;
    if (el.srcObject !== externalStream) el.srcObject = externalStream ?? null;
    if (externalStream) {
      el.play().catch(() => {
        requestAnimationFrame(() => { el.play().catch(() => {}); });
      });
    }
  };

  // When the external stream IDENTITY changes (e.g. after a reconnect produces
  // a new MediaStream) re-attach to the currently-mounted element.
  useEffect(() => {
    if (externalStream === undefined) return;
    attachExternal(videoRef.current);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalStream]);

  // Keep the imperative mute in sync if forceMuted toggles on a mounted element
  // (e.g. entering/leaving satellite without remounting the tile).
  useEffect(() => {
    if (externalStream !== undefined && videoRef.current) {
      videoRef.current.muted = forceMuted;
    }
  }, [forceMuted, externalStream]);

  // CONN-109 (#4): boost the PC's voice (heard by the auditor) above 1.0 via
  // a WebAudio GainNode — the element's own volume caps at 1.0 (too quiet).
  // SATELLITE: this WebAudio graph plays to ctx.destination INDEPENDENTLY of the
  // <video> muted state — it was the real Larsen source (the Mac replayed the
  // PC's voice into the room). Skip it entirely when forceMuted (co-located: the
  // auditor hears the PC directly; Whisper still transcribes from the track).
  useEffect(() => {
    if (!externalStream || forceMuted) return;
    const cleanup = attachAudioBoost(videoRef.current as HTMLMediaElement, externalStream, 4.0);
    return cleanup;
  }, [externalStream, forceMuted]);

  // Local camera setup (only when no external stream)
  useEffect(() => {
    if (externalStream !== undefined) return; // handled by callback ref above
    let activeStream: MediaStream | null = null;
    async function setupCamera() {
      if (isVisible) {
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) videoRef.current.srcObject = activeStream;
          setError(null);
        } catch {
          setError(t('camera_offline'));
        }
      }
    }
    setupCamera();
    return () => { activeStream?.getTracks().forEach(t => t.stop()); };
    // 't' (traduction) est volontairement EXCLU des dépendances : l'ajouter RELANCERAIT la
    // caméra à chaque changement de langue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, externalStream]);

  if (!isVisible) {
    return (
      <div className="flex flex-col h-full items-center justify-center cursor-pointer relative overflow-hidden" onClick={onToggle}>
        {!error && (fallbackFrame ? (
          <img src={fallbackFrame} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        ) : (
          <video
            ref={attachExternal}
            autoPlay
            playsInline
            muted={!externalStream || forceMuted} // unmute remote audio (muted in satellite → anti-Larsen)
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
        ))}
        <div className="relative z-10 rotate-[-90deg] whitespace-nowrap text-[9px] font-mono text-white/70 tracking-widest bg-black/40 px-1 rounded">{title}</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl">
      {error ? (
        <div className="w-full h-full flex items-center justify-center bg-slate-900/80">
          <div className="text-white/60 text-xs">{error}</div>
        </div>
      ) : fallbackFrame ? (
        // CONN-33: WebRTC failed → show relayed JPEG frames.
        <img src={fallbackFrame} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <video
          ref={attachExternal}
          autoPlay
          playsInline
          muted={!externalStream || forceMuted} // unmute remote audio so auditor hears participant (muted in satellite → anti-Larsen)
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {/* Title — top left */}
      <div className="absolute top-1.5 left-2 z-10 flex items-center gap-1.5">
        <span className="text-xs font-mono text-white/70 tracking-wider uppercase">
          {title}
        </span>
        {/* Remote indicator */}
        {externalStream && (
          <span className="text-[8px] bg-green-500/80 text-white px-1 rounded font-bold">LIVE</span>
        )}
        {/* Réduire/afficher la caméra en MINI TOGGLE (remplace la croix). */}
        <GlassCollapseToggle on={isVisible} onToggle={() => onToggle && onToggle()} />
        {void onDisable}
      </div>

      {/* Status overlay */}
      {!hideOverlay && (
        <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-0.5">
          <div className="text-[10px] font-mono font-bold text-white">
            {massStatus || t('status_searching_mass')}
          </div>
          {bpm && (
            <div className="text-[10px] font-mono text-green-300 font-bold">
              ♥ {bpm.toFixed(0)} BPM
            </div>
          )}
        </div>
      )}
    </div>
  );
}
