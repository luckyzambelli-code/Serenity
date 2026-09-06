import React from 'react';
import { Power, Headphones, Mic } from 'lucide-react';
import { MetabolicCheck } from './MetabolicCheck';
import { useI18n } from '../i18n';
import { useNetworkStore } from '../store/networkStore';
import type { MetabAssessment } from '../engine/MetabolicBaseline';
import { LAYER } from "../ui/layers";

/**
 * ParticipantView — ce que voit le PRÉCLAIR quand il est connecté à l'auditeur : caméra de
 * l'auditeur, état du MUSE, batterie, et l'écran « prêt pour la séance » en MIROIR (piloté par
 * l'auditeur via READINESS — le préclair n'a AUCUN bouton Démarrer : c'est l'auditeur qui décide).
 *
 * Sorti de App.tsx où il était un `return` anticipé de 268 lignes. Deux choses ont changé, rien
 * d'autre :
 *   · les valeurs déjà présentes dans les stores (flux distant, repli vidéo) et l'i18n sont LUES
 *     directement ici au lieu d'être passées en props — c'est la convention posée en Phase B ;
 *   · les DEUX gestionnaires de déconnexion (bandeau EOS et bouton d'en-tête) étaient identiques
 *     ligne pour ligne : ils deviennent une seule callback `onLeaveSession`.
 */
export interface ParticipantViewProps {
  /** Niveau de batterie du MUSE, ou null si inconnu. */
  batteryLevel: number | null;
  /** État « prêt pour la séance » renvoyé par l'auditeur, ou null hors de cette phase. */
  pcReadiness: { phase: string; inhale: boolean; assessment: MetabAssessment | null } | null;
  museConnection: 'disconnected' | 'searching' | 'connected';
  museContact: boolean;
  /** SATELLITE : le MUSE est appairé au Mac de l'auditeur, pas au téléphone. */
  pcCoLocated: boolean;
  sessionState: 'idle' | 'running' | 'paused' | 'ended';
  /** Cible du flux WebRTC de l'auditeur. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onConnectMuse: () => void;
  /** Quitter la séance et revenir à l'écran initial, en repartant d'un état propre. */
  onLeaveSession: () => void;
}

export function ParticipantView({
  batteryLevel, pcReadiness, museConnection, museContact, pcCoLocated,
  sessionState, videoRef, onConnectMuse, onLeaveSession,
}: ParticipantViewProps) {
  const { t, lang } = useI18n();
  const remoteStream = useNetworkStore(s => s.remoteStream);
  const videoFallbackActive = useNetworkStore(s => s.videoFallbackActive);
  const remoteVideoFrame = useNetworkStore(s => s.remoteVideoFrame);

  const bat = batteryLevel;
  const batColor = bat === null ? '#64748b' : bat > 50 ? 'rgba(240,246,255,0.95)' : bat > 20 ? '#facc15' : '#f87171';

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020617', display: 'flex', flexDirection: 'column', color: '#fff' }}>

      {/* SÉANCE À DISTANCE : écran « Prêt pour la séance » COMPLET côté préclair (titre, badge
          MUSE, baseline, respiration, readouts) EN MODE MIROIR — piloté par l'auditeur via le
          message P2P READINESS. AUCUN bouton Démarrer/Refaire/Passer : c'est l'auditeur qui
          décide. Le préclair connecte SON MUSE directement depuis le badge de cet écran (donc
          plus de deadlock : l'overlay ne cache plus un bouton de connexion séparé). */}
      {pcReadiness && (
        <MetabolicCheck
          mirror
          lang={lang}
          mirrorPhase={pcReadiness.phase as any}
          mirrorInhale={pcReadiness.inhale}
          mirrorAssessment={pcReadiness.assessment}
          museConnected={museConnection === 'connected'}
          museWorn={museContact}
          museOnMac={pcCoLocated}
          museConnecting={museConnection === 'searching'}
          onConnectMuse={onConnectMuse}
          onProceed={() => {}}
          onCancel={() => {}}
          onPhase={() => {}}
        />
      )}

      {/* CONN-77: EOS overlay — when the auditor ends the session the synced
          sessionState becomes 'ended'; show the preclear a clear "End of
          Session" banner so they know recording has stopped. */}
      {sessionState === 'ended' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: LAYER.session,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(8px)' }}>
          <div style={{
            fontSize: 'clamp(28px, 9vw, 64px)', fontWeight: 900, letterSpacing: '0.12em',
            color: '#eaf3ff', textShadow: '0 0 24px rgba(34,211,238,0.5)' }}>EOS</div>
          <div style={{ fontSize: 'clamp(13px, 3.4vw, 20px)', fontWeight: 700, color: 'rgba(235,244,255,0.92)', letterSpacing: '0.06em', textAlign: 'center', padding: '0 20px' }}>
            {t('eos_end_of_session')}
          </div>
          {/* #9 (Roger): the preclear was stuck on EOS until the auditor quit.
              Give them their own button to leave the session and return to the
              initial screen — same clean reset as the disconnect button. */}
          <button
            onClick={onLeaveSession}
            style={{
              marginTop: 18, display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 15, fontWeight: 'bold', letterSpacing: '0.04em', color: '#fff',
              background: 'rgba(220,38,38,0.85)', border: '1px solid rgba(248,113,113,0.7)',
              borderRadius: 10, padding: '12px 24px', cursor: 'pointer',
              boxShadow: '0 0 16px rgba(220,38,38,0.4)' }}>
            <Power size={18} strokeWidth={2.2} />
            {t('conn_disconnect')}
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(0,8,20,0.8)', borderBottom: '1px solid rgba(0,230,255,0.15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(240,246,255,0.95)', boxShadow: '0 0 8px rgba(240,246,255,0.95)' }} />
          <span style={{ fontSize: 14, fontWeight: 'bold', color: 'rgba(240,246,255,0.95)', letterSpacing: '0.1em' }}>{t('conn_badge_preclear_ok')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* FIX CONN-7: clickable Muse connect button (was just a label).
              The participant on the Galaxy is the PRECLEAR — they wear the
              Muse — but the simplified participant view had no UI to actually
              connect it. Tapping launches the Web Bluetooth picker on the
              participant's device.
              SATELLITE (co-located, pcCoLocated) : le MUSE est accouplé au MAC (design).
              On CACHE donc ce bouton sur le téléphone (sinon il tenterait un appairage
              Bluetooth qui VOLE le MUSE au Mac) et on affiche juste un rappel. */}
          {pcCoLocated ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', color: 'rgba(200,214,234,0.75)' }}>
              <Headphones size={15} strokeWidth={1.8} />
              🎧 {lang === 'fr' ? 'MUSE sur le Mac' : lang === 'it' ? 'MUSE sul Mac' : lang === 'es' ? 'MUSE en el Mac' : lang === 'sv' ? 'MUSE på datorn' : 'MUSE on the Mac'}
            </span>
          ) : (
          <button
            onClick={() => {
              if (museConnection === 'connected') return; // already connected
              onConnectMuse();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 6,
              background: museConnection === 'connected' ? 'rgba(34,197,94,0.15)'
                        : museConnection === 'searching' ? 'rgba(251,191,36,0.15)'
                        : 'rgba(0,230,255,0.10)',
              border: `1px solid ${
                museConnection === 'connected' ? 'rgba(34,197,94,0.4)'
                : museConnection === 'searching' ? 'rgba(251,191,36,0.4)'
                : 'rgba(0,230,255,0.30)'}`,
              color: museConnection === 'connected' ? 'rgba(240,246,255,0.95)'
                   : museConnection === 'searching' ? '#fbbf24'
                   : 'rgba(235,244,255,0.92)',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
              cursor: museConnection === 'connected' ? 'default' : 'pointer',
              transition: 'all 0.2s',
              // FIX CONN-36: pulse the button when the MUSE is not connected
              // so the preclear knows they must pair their headset.
              animation: museConnection === 'disconnected' ? 'pulse 1.5s infinite' : 'none' }}
          >
            {/* FIX CONN-34: MUSE (Headphones) icon instead of the brain emoji. */}
            <Headphones size={15} strokeWidth={1.8} />
            {museConnection === 'connected' ? t('connected')
                : museConnection === 'searching' ? `${t('searching') || 'searching'}…`
                : `${t('connect_muse') || 'Connect Muse'}`}
          </button>
          )}
          {/* Battery */}
          {bat !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 32, height: 12, border: `1.5px solid ${batColor}`, borderRadius: 3, padding: 1, position: 'relative' }}>
                <div style={{ height: '100%', width: `${bat}%`, background: batColor, borderRadius: 2 }} />
                <div style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 3, height: 6, background: batColor, borderRadius: '0 2px 2px 0' }} />
              </div>
              <span style={{ fontSize: 10, color: batColor, fontFamily: 'monospace' }}>{bat.toFixed(0)}%</span>
            </div>
          )}
          <button
            onClick={onLeaveSession}
            /* FIX CONN-42: bigger + red disconnect button. */
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 'bold', letterSpacing: '0.04em', color: '#fff', background: 'rgba(220,38,38,0.85)', border: '1px solid rgba(248,113,113,0.7)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', boxShadow: '0 0 14px rgba(220,38,38,0.4)' }}>
            <Power size={16} strokeWidth={2.2} />
            {t('conn_disconnect')}
          </button>
        </div>
      </div>

      {/* CONN-83: the preclear no longer needs to do ANYTHING to be transcribed
          — the auditor captions the preclear's voice from the WebRTC audio on
          its side. Passive reassurance only (no tap, no Android limitations). */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', padding: '6px 16px', flexShrink: 0,
        background: 'rgba(255,255,255,0.10)', borderBottom: '1px solid rgba(255,255,255,0.22)',
        color: 'rgba(240,246,255,0.95)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
        <Mic size={13} strokeWidth={2} />
        {t('pc_mic_active')}
      </div>

      {/* ── Caméra auditeur ── */}
      {/* CONN-33: in fallback mode show the relayed JPEG frames; otherwise
          the live WebRTC <video>.
          FIX CONN-47: do NOT stretch full-screen (objectFit contain keeps the
          aspect). Larger contained panel (user request: bigger auditor video) —
          capped at min(98vw, 1100px) / 86vh, centred on black. The relayed JPEG
          path is lower-res so it may soften at this size, but never distorts. */}
      <div style={{ flex: 1, position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {videoFallbackActive && remoteVideoFrame ? (
          <div style={{ position: 'relative', maxWidth: 'min(98vw, 1100px)', maxHeight: '86vh' }}>
            <img
              src={remoteVideoFrame}
              alt=""
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '3px 8px', fontSize: 9, color: '#fbbf24', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
              📷 {t('cam1')} · RELAY
            </div>
          </div>
        ) : remoteStream ? (
          <div style={{ position: 'relative', maxWidth: 'min(98vw, 1100px)', maxHeight: '86vh' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '3px 8px', fontSize: 9, color: 'rgba(235,244,255,0.92)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
              📷 {t('cam1')}
            </div>
          </div>
        ) : (
          // ⚠️ CORRETTO — segnalato dal vivo, due volte: « appare sempre in attesa del flusso
          // video dell'auditor, [ma] non vogliamo un flusso video dell'auditor » (vero per il
          // satellite: l'auditor non manda MAI il proprio video in quel caso — "in attesa" era
          // falso, il video non stava per arrivare). Poi: « IN SEDUTA deve essere in grande, il
          // resto sotto in piccolo, ma senza parlare del microfono, poiché quello trasmette » —
          // la prima versione diceva "(camera/microfono nella stessa stanza)", implicando che
          // ANCHE il microfono fosse solo locale/passivo come la camera — falso: la sua
          // trascrizione VIAGGIA fino all'auditor (v. `pc_mic_active`, il banner sotto
          // l'header). "IN SEDUTA" ora è il titolo grande (`conn_satellite_headline`), il
          // dettaglio resta SOLO sul video, senza più nominare il microfono.
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontSize: 40 }}>{pcCoLocated ? '📱' : '👁'}</div>
            {pcCoLocated ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(240,246,255,0.95)' }}>
                  {t('conn_satellite_headline')}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t('conn_satellite_no_video')}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t('conn_waiting_video')}</div>
                <div style={{ fontSize: 10, color: '#334155' }}>{t('conn_video_hint')}</div>
              </>
            )}
          </div>
        )}

        {/* FIX CONN-41: MUSE connect button overlaid ON the video, centred,
            so the preclear can't miss it. Disappears once the headset pairs.
            Satellite: hidden — the Muse is paired on the auditor's Mac. */}
        {museConnection !== 'connected' && !pcCoLocated && (
          <button
            onClick={() => { if (museConnection !== 'searching') onConnectMuse(); }}
            style={{
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '16px 24px', borderRadius: 14, cursor: 'pointer',
              background: museConnection === 'searching' ? 'rgba(251,191,36,0.92)' : 'rgba(6,182,212,0.92)',
              border: '2px solid rgba(255,255,255,0.85)',
              color: '#021018', fontSize: 17, fontWeight: 800, letterSpacing: '0.03em',
              boxShadow: '0 6px 30px rgba(0,0,0,0.55)',
              animation: museConnection === 'disconnected' ? 'pulse 1.4s infinite' : 'none' }}
          >
            <Headphones size={24} strokeWidth={2.2} />
            {museConnection === 'searching'
              ? `${t('searching') || 'Recherche'}…`
              : `${t('connect_muse') || 'Connectez votre MUSE'}`}
          </button>
        )}
      </div>

      {/* FIX CONN-36: prominent reminder banner when the preclear hasn't
          connected their MUSE — no EEG flows until they do. Tapping it
          launches the BLE picker. Satellite: hidden (Muse is on the Mac). */}
      {museConnection !== 'connected' && !pcCoLocated && (
        <button
          onClick={() => { if (museConnection !== 'searching') onConnectMuse(); }}
          style={{
            padding: '14px 16px', border: 'none', cursor: 'pointer',
            background: 'rgba(251,191,36,0.18)',
            borderTop: '1px solid rgba(251,191,36,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            color: '#fbbf24', fontSize: 15, fontWeight: 'bold', letterSpacing: '0.04em',
            animation: museConnection === 'disconnected' ? 'pulse 1.5s infinite' : 'none',
            flexShrink: 0 }}
        >
          <Headphones size={20} strokeWidth={1.8} />
          {museConnection === 'searching'
            ? `${t('searching') || 'Recherche'}…`
            : `⚠ ${t('connect_muse') || 'Connectez votre MUSE'}`}
        </button>
      )}

      {/* ── Barre de statut bas ── */}
      <div style={{ padding: '8px 16px', background: 'rgba(0,8,20,0.8)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: '#475569', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Headphones size={14} strokeWidth={1.8} /> EEG · PPG · {t('conn_preclear_ok_detail')}
        </span>
      </div>
    </div>
  );
}
