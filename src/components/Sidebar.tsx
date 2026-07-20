import React from 'react';
import {
  Play, Pause, Square, History, Eye, Sliders,
  Languages, UserRound, Loader2, Headphones } from 'lucide-react';
import { BookOpen, Settings } from 'lucide-react';
import { SideBtn } from './SideBtn';
import { GlassIconOrb } from './GlassIconOrb';
import type { DrawerKey } from './SidebarDrawer';
import { useUiStore } from '../store/uiStore';
import { useProfileStore } from '../store/profileStore';
import { useNetworkStore } from '../store/networkStore';

interface SidebarProps {
  // PHASE-B: isLightTheme + activeProfile + sessionCount removed — read from stores.
  appMode:        'local' | 'auditor' | 'participant';
  sidebarDrawer:  DrawerKey | null;
  setSidebarDrawer: React.Dispatch<React.SetStateAction<DrawerKey | null>>;
  processusCount: number;
  lang:           string;
  museConnection: 'disconnected' | 'searching' | 'connected';
  /** Co-located satellite participant (phone): the Muse is on the auditor's Mac,
   *  so hide the phone's MUSE button. */
  pcCoLocated?:   boolean;
  sessionState:   'idle' | 'running' | 'paused' | 'ended';
  // CONN-74: open-state of the PROCESS / HISTORY modals so their icons toggle
  // and show an active state like every other rail button.
  processusOpen?: boolean;
  historyOpen?:   boolean;
  onShowProcessus:() => void;
  onShowHistory:  () => void;
  onConnectMuse:  () => void;
  onStart:        () => void;
  onPause:        () => void;
  onResume:       () => void;
  onEnd:          () => void;
  t:              (key: string) => string;
}

export function Sidebar({
  appMode, sidebarDrawer, setSidebarDrawer,
  processusCount, lang, museConnection, pcCoLocated = false, sessionState,
  processusOpen, historyOpen,
  onShowProcessus, onShowHistory, onConnectMuse,
  onStart, onPause, onResume, onEnd, t }: SidebarProps) {
  const isLightTheme  = useUiStore(s => s.isLightTheme);
  const activeProfile = useProfileStore(s => s.activeProfile);
  const sessionCount  = useProfileStore(s => s.sessionCount);
  const isConnected   = useNetworkStore(s => s.isConnected);
  // CONN-74: PC identity + solo/auditor mode for the sidebar icons.
  const isSoloSession = useProfileStore(s => s.isSoloSession);
  const pcName        = useProfileStore(s => s.pcName);
  const pcPhoto       = useProfileStore(s => s.pcPhoto);

  // FIX CONN-35: when the auditor is connected to a preclear but the session
  // hasn't started, blink the START button in cyan to cue "begin the session".
  // MUSE is connected AND the session hasn't started → pulse the START button to
  // cue "headset paired, press START to begin". Independent of P2P / appMode.
  const readyToStart = museConnection === 'connected' && sessionState === 'idle';
  // legacy: keep the P2P-ready signal alive for any future use without warnings.
  void isConnected;
  const lineColor   = isLightTheme ? 'rgba(15,23,42,0.75)' : 'rgba(224,238,255,0.82)';
  // MONOCHROME glass : accent = BLANC vif (dark) / SLATE foncé (light) — pas de teal.
  const accentColor = isLightTheme ? '#334155' : '#f0f6ff';
  const sepColor    = isLightTheme ? 'rgba(100,180,255,0.20)' : 'rgba(255,255,255,0.14)';

  const toggleDrawer = (key: DrawerKey) =>
    setSidebarDrawer(d => (d === key ? null : key));

  const isConnecting = museConnection === 'searching' && sessionState !== 'running';

  return (
    <aside
      className="sm-glass flex flex-col items-center py-3 shrink-0 relative"
      style={{
        width: 92, flexShrink: 0,
        // SANS FOND : la barre d'icônes repose sur le FOND UNIQUE de l'app (juste un séparateur).
        background: 'transparent',
        borderRight: `1px solid ${sepColor}`,
        boxShadow: 'none',
        zIndex: 30,
        // Icônes agrandies → défilement de sécurité si la hauteur d'écran est courte.
        overflowY: 'auto', overflowX: 'hidden' }}
    >
      {/* CONFIG — icône en RELIEF sur pastille ronde en verre (comme le pouce lune/soleil). */}
      <button
        onClick={() => toggleDrawer('config')}
        title="Settings"
        style={{
          width: 84, height: 84, borderRadius: 14, border: 'none',
          background: 'transparent',
          cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginBottom: 2 }}
      >
        <GlassIconOrb active={sidebarDrawer === 'config'}>
          <Settings size={34} strokeWidth={1.4}
            style={{ color: sidebarDrawer === 'config' ? accentColor : lineColor }} />
        </GlassIconOrb>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
          color: sidebarDrawer === 'config' ? accentColor : lineColor, textTransform: 'uppercase' }}>
          {t('config')}
        </span>
      </button>

      <div style={{ height: 1, width: '70%', background: sepColor, margin: '4px 0' }} />

      {/* CONN-93: SESSIONE hub — a single TALL button (≈2 icons high) that
          replaces MODE + AUDITEUR + PC. Top: identity photo/icon + "SESSIONE" +
          the active mode in its colour. Bottom: the auditor and/or PC name, so
          you read mode + who-is-who at a glance. Opens the unified hub drawer. */}
      {(() => {
        const modeColor = appMode === 'auditor' ? 'rgba(240,246,255,0.92)' : appMode === 'participant' ? 'rgba(210,220,235,0.78)' : '#94a3b8';
        const modeLabel = appMode === 'auditor' ? (isSoloSession ? 'SOLO' : 'AUDITOR')
                        : appMode === 'participant' ? 'PRECLEAR'
                        : (isSoloSession ? 'SOLO' : 'LOCAL');
        const active = appMode !== 'local' || sidebarDrawer === 'link';
        const aud = (activeProfile?.name || '').trim();
        const pc  = (pcName || '').trim();
        const idStyle: React.CSSProperties = { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.22)' };
        return (
          <button
            className={`smbtn${active ? ' is-active' : ''}`}
            onClick={() => toggleDrawer('link')}
            title="Sessione"
            style={{ height: 'auto', minHeight: 168, paddingTop: 9, paddingBottom: 10, justifyContent: 'flex-start', gap: 2 }}
          >
            <div className="smbtn-icon" style={{ color: modeColor }}>
              {(() => {
                // CONN-102: show BOTH identities — auditor + PC — as a twin avatar
                // (overlapping). Participant view shows only the PC; SOLO shows only
                // the auditor (preclear == auditor).
                const dual = (border: string): React.CSSProperties => ({ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${border}`, background: '#26262b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 });
                if (appMode === 'participant') {
                  return pcPhoto ? <img src={pcPhoto} alt="" style={idStyle} /> : <UserRound size={28} strokeWidth={1.4} />;
                }
                const auditorAv = activeProfile?.photo
                  ? <img src={activeProfile.photo} alt="" style={dual('rgba(255,255,255,0.5)')} />
                  : <div style={dual('rgba(255,255,255,0.5)')}><Eye size={15} strokeWidth={1.6} style={{ color: 'rgba(240,246,255,0.85)' }} /></div>;
                if (isSoloSession) return auditorAv;
                const pcAv = pcPhoto
                  ? <img src={pcPhoto} alt="" style={{ ...dual('rgba(255,255,255,0.35)'), marginLeft: -9 }} />
                  : <div style={{ ...dual('rgba(255,255,255,0.35)'), marginLeft: -9 }}><UserRound size={15} strokeWidth={1.6} style={{ color: 'rgba(240,246,255,0.7)' }} /></div>;
                return <div style={{ display: 'flex', alignItems: 'center' }}>{auditorAv}{pcAv}</div>;
              })()}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', color: modeColor }}>{
              lang === 'fr' ? 'SÉANCE' :
              lang === 'it' ? 'SESSIONE' :
              lang === 'es' ? 'SESIÓN' :
              lang === 'sv' ? 'SESSION' :
              'SESSION'
            }</span>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: modeColor, opacity: 0.9 }}>{modeLabel}</span>
            <div style={{ width: '82%', height: 1, background: `${sepColor}`, margin: '3px 0' }} />
            {(appMode === 'local' || appMode === 'auditor') && (
              <span style={{ fontSize: 10, fontWeight: 700, color: lineColor, maxWidth: 76, lineHeight: 1.15, wordBreak: 'break-word', textAlign: 'center' }}>
                A: {aud || '—'}
              </span>
            )}
            {((appMode === 'local' && !isSoloSession) || appMode === 'participant') && (
              <span style={{ fontSize: 10, fontWeight: 700, color: lineColor, maxWidth: 76, lineHeight: 1.15, wordBreak: 'break-word', textAlign: 'center' }}>
                PC: {pc || '—'}
              </span>
            )}
          </button>
        );
      })()}

      {/* SESSION (Start / Pause / Resume / Stop) — CONN-97: placed right under the
          SESSIONE hub (and before PROCESSUS) for a more logical flow. */}
      <SideBtn
        label={
          sessionState === 'running' ? 'Pause'
            : sessionState === 'paused'  ? 'Resume'
            : isConnecting               ? 'STOP'
            :                              'Start'
        }
        active={sessionState === 'running'}
        pulsing={isConnecting || readyToStart}
        customColor={
          sessionState === 'running' ? '#facc15'
            : sessionState === 'paused'  ? '#4ade80'
            : isConnecting               ? '#ef4444'
            : readyToStart               ? '#e6ecf5'
            :                              undefined
        }
        icon={
          sessionState === 'running'
            ? <Pause size={34} strokeWidth={1.4} />
            : isConnecting
              ? <Loader2 size={34} strokeWidth={1.4} className="animate-spin" />
              : <Play size={34} strokeWidth={1.4} />
        }
        onClick={() => {
          if (museConnection === 'searching') onConnectMuse();
          else if (sessionState === 'running')   onPause();
          else if (sessionState === 'paused')    onResume();
          else                                    onStart();
        }}
      />
      {(sessionState === 'running' || sessionState === 'paused') && (
        <SideBtn
          label="FIN"
          active={false}
          customColor="#f87171"
          icon={<Square size={34} strokeWidth={1.4} />}
          onClick={onEnd}
        />
      )}

      {/* TRIM */}
      <SideBtn
        label={t('sidebar_trim')}
        active={sidebarDrawer === 'trim'}
        icon={<Sliders size={34} strokeWidth={1.4} />}
        onClick={() => toggleDrawer('trim')}
      />

      {/* FIX CONN-20: MUSE button only visible in PARTICIPANT mode.
          In local/auditor mode the button only added noise (the auditor
          on Mac has no Muse, and in local mode the START button already
          triggers Muse pairing). Showing it only when the user is the
          Préclair makes the role-specific UI cleaner.
          SATELLITE: co-located → the Muse is on the auditor's Mac, so the phone
          must NOT show a MUSE button. */}
      {appMode === 'participant' && !pcCoLocated && (
        <SideBtn
          label="MUSE"
          active={museConnection === 'connected'}
          pulsing={museConnection === 'searching'}
          customColor={
            museConnection === 'connected' ? '#4ade80'
            : museConnection === 'searching' ? '#facc15'
            : undefined
          }
          icon={<Headphones size={34} strokeWidth={1.4} />}
          onClick={onConnectMuse}
        />
      )}

      <div style={{ height: 1, width: '70%', background: sepColor, margin: '4px 0' }} />

      {/* PROCESSUS */}
      <SideBtn
        label={t('sidebar_process')}
        active={processusOpen}
        badge={processusCount || undefined}
        icon={<BookOpen size={34} strokeWidth={1.4} />}
        onClick={onShowProcessus}
      />

      <div style={{ height: 1, width: '70%', background: sepColor, margin: '4px 0' }} />

      {/* HISTORY */}
      <SideBtn
        label={t('sidebar_history')}
        active={historyOpen}
        badge={sessionCount || undefined}
        icon={<History size={34} strokeWidth={1.4} />}
        onClick={onShowHistory}
      />

      {/* LANG */}
      <SideBtn
        label={(lang || '').toUpperCase()}
        active={sidebarDrawer === 'lang'}
        icon={<Languages size={34} strokeWidth={1.4} />}
        onClick={() => toggleDrawer('lang')}
      />

      {/* Spacer */}
      <div style={{ flex: 1, minHeight: 8 }} />
    </aside>
  );
}
