import React from 'react';
import { Camera, Play, Pause, Square, User, Image as ImageIcon, ImagePlus, ChevronRight} from 'lucide-react';
import { ModeSelector } from './ModeSelector';
import { GlassThemeToggle } from './GlassThemeToggle';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import type { Language } from '../i18n';
import { type ModuleVisibility, DEFAULT_MODULES } from '../store/layoutStore';
import { useProfileStore } from '../store/profileStore';
import { useNetworkStore } from '../store/networkStore';
import { useUiStore } from '../store/uiStore';
import { useLayoutStore } from '../store/layoutStore';
import { importWallpaper } from '../lib/wallpaperImport';
import { TOKEN } from '../ui/tokens';
import { LAYER } from "../ui/layers";

export type DrawerKey = 'link' | 'auditor' | 'pc' | 'trim' | 'session' | 'lang' | 'config';

interface SidebarDrawerProps {
  drawer:                DrawerKey;
  onClose:               () => void;
  // PHASE-B: theme + wallpaper read from uiStore; layout fields from layoutStore.
  // Only action callbacks remain props.
  t:                     (key: string) => string;

  /* LINK — actions only (P2P state from networkStore) */
  sessionState:          'idle' | 'running' | 'paused' | 'ended';
  onModeChange:          (mode: 'local' | 'auditor' | 'participant') => void;
  onOpenConnectionModal: () => void;
  /** LOCAL non-solo: enter the phone-satellite host flow (PC uses its phone as
   *  close-up camera + microphone, joining by scanning the QR). */
  onUsePhoneSatellite:   () => void;
  /** True while a phone-satellite session is active. The network role is
   *  'auditor' under the hood, but the UI must keep showing LOCAL (it's a
   *  co-located session), so the mode selector stays on Local. */
  satellite:             boolean;
  /** Pair the Muse directly to this Mac (used in satellite — the headset is
   *  worn by the PC but read locally for an instant needle). */
  onConnectMuse:         () => void;
  museConnection:        'disconnected' | 'searching' | 'connected';

  /* AUDITOR / PC — actions only (profile state from profileStore) */
  onOpenProfile:    () => void;
  capturePcPhoto:   () => void;

  /* TRIM */
  needleTrim:    number;
  /** Sensibilità dell'ago delle LATTINE, −10..+10. Sta QUI e non nel pannello di taratura
   *  perché il TRIM è laterale: regolare guardando l'ago è impossibile se il pannello lo copre. */
  thetaSensTrim?: number;
  setThetaSensTrim?: (v: number) => void;
  thetaConnected?: boolean;
  /** Il MUSE è collegato? Le sue manopole compaiono solo allora: mescolate a quelle delle
   *  boîtes senza etichetta, non si capiva quale muovesse quale ago. */
  museConnected?: boolean;
  /** Configurazione degli elettrodi: due boîtes o boîte solo (SOLO AUDITING). */
  thetaConfig?: 'two-cans' | 'solo-can';
  setThetaConfig?: (c: 'two-cans' | 'solo-can') => void;
  /** Aggiunge un punto alla scala del TA leggendo il valore sul Theta-Meter. */
  thetaAddPoint?: (ta: number) => void;
  /** Il TA che leggiamo NOI in questo istante, per il confronto affiancato. */
  thetaTaNow?: number | null;
  /** Apre l'E-meter Tester (taratura con l'artefatto fisico). */
  onOpenThetaTester?: () => void;
  setNeedleTrim: React.Dispatch<React.SetStateAction<number>>;
  needleInertia?:    number;
  setNeedleInertia?: React.Dispatch<React.SetStateAction<number>>;

  /* SESSION */
  onStart:  () => void;
  onPause:  () => void;
  onResume: () => void;
  onEnd:    () => void;

  /* LANG */
  lang:    Language;
  setLang: (lang: Language) => void;
}

export function SidebarDrawer(props: SidebarDrawerProps) {
  const { drawer, onClose, t } = props;
  const isLightTheme = useUiStore(s => s.isLightTheme);

  // STYLE B (thème sombre) : les panneaux qui s'ouvrent sont en VERRE SOMBRE frosté + encre
  // claire/cyan → élégants et lisibles sur le noir. Le thème clair garde son verre clair.
  const drawerBg     = isLightTheme ? 'rgba(226,226,232,0.72)' : 'rgba(26,26,30,0.72)';
  const drawerBorder = isLightTheme ? '1px solid rgba(100,180,255,0.20)' : '1px solid rgba(255,255,255,0.14)';
  const titleColor   = isLightTheme ? '#1e293b' : '#eef4ff';
  const labelColor   = isLightTheme ? '#64748b' : 'rgba(200,214,234,0.62)';
  const inputBg      = isLightTheme ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.06)';
  const inputBorder  = isLightTheme ? '1px solid rgba(100,180,255,0.20)' : '1px solid rgba(255,255,255,0.18)';
  const textColor    = isLightTheme ? '#1e293b' : 'rgba(224,238,255,0.90)';

  const theme = { titleColor, labelColor, inputBg, inputBorder, textColor };

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        width: 280, minWidth: 0, flexShrink: 1, background: drawerBg, borderRight: drawerBorder,
        backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
        boxShadow: isLightTheme ? '6px 0 26px rgba(38,40,48,0.22), inset 0 1px 0 rgba(255,255,255,0.5)' : '6px 0 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)',
        zIndex: LAYER.drawer, padding: 16, gap: 14, overflowY: 'auto' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ borderBottom: `1px solid ${labelColor}33`, paddingBottom: 8 }}
      >
        <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.25em', color: titleColor, textTransform: 'uppercase' }}>
          {drawer === 'link'    && t('drawer_neural_link')}
          {drawer === 'auditor' && t('drawer_auditor')}
          {drawer === 'pc'      && t('drawer_pc')}
          {drawer === 'trim'    && t('drawer_needle_trim')}
          {drawer === 'session' && t('drawer_session_control')}
          {drawer === 'lang'    && t('drawer_language')}
          {drawer === 'config'  && 'Interface'}
        </span>
        {/* Fermeture du panneau en MINI TOGGLE (cohérence graphique) : on = panneau ouvert. */}
        <GlassCollapseToggle on onToggle={onClose} title={t('tip_close')} />
      </div>

      {/* CONN-99: the SESSIONE hub is now just mode + connection + the big
          "GESTION DES PROFILS" button. Auditor/PC identity (select + create) is
          handled entirely in the Profile Management roster — no more duplicated
          inline editors here. */}
      {drawer === 'link'    && <LinkDrawer {...props} theme={theme} />}
      {drawer === 'auditor' && <AuditorDrawer {...props} theme={theme} />}
      {drawer === 'pc'      && <PcDrawer {...props} theme={theme} />}
      {drawer === 'trim'    && <TrimDrawer {...props} theme={theme} />}
      {drawer === 'session' && <SessionDrawer {...props} theme={theme} />}
      {drawer === 'lang'    && <LangDrawer {...props} theme={theme} />}
      {drawer === 'config'  && <ConfigDrawer {...props} theme={theme} />}
    </div>
  );
}

// ============================================================================
// Theme helper
// ============================================================================
interface DrawerTheme {
  titleColor:  string;
  labelColor:  string;
  inputBg:     string;
  inputBorder: string;
  textColor:   string;
}
type SubProps = SidebarDrawerProps & { theme: DrawerTheme };

// Labeled separator between the hub sections (Auditor / PC).
function HubDivider({ label, color, sep }: { label: string; color: string; sep: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
      <div style={{ flex: 1, height: 1, background: `${sep}33` }} />
      <span style={{ fontSize: 9, fontWeight: 'bold', letterSpacing: '0.2em', color, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: `${sep}33` }} />
    </div>
  );
}

// ============================================================================
// LINK
// ============================================================================
function LinkDrawer({
  sessionState, onModeChange, onOpenConnectionModal, onUsePhoneSatellite, satellite,
  onConnectMuse, museConnection, t, theme }: SubProps) {
  // PHASE-B step 3: P2P state read directly from networkStore.
  const modeInitKey    = useNetworkStore(s => s.modeInitKey);
  const appMode        = useNetworkStore(s => s.appMode);
  // During a phone-satellite session the real network role is 'auditor', but
  // conceptually it's a LOCAL co-located session — keep the selector on Local.
  const displayMode    = satellite ? 'local' : appMode;
  const isConnected    = useNetworkStore(s => s.isConnected);
  const connectionLink = useNetworkStore(s => s.connectionLink);
  const setShowRoster  = useUiStore(s => s.setShowRoster);
  const isSoloSession    = useProfileStore(s => s.isSoloSession);
  const setIsSoloSession = useProfileStore(s => s.setIsSoloSession);
  const { labelColor } = theme;
  return (
    <>
      {/* CONN-98: open the ROSTER (auditors + PCs) — it's where a session starts. */}
      {/* Apre una SCHERMATA, e lo deve dire: centrato e senza segni sembrava un'intestazione,
          e non si capiva che si potesse cliccare (segnalato in seduta). Freccia a destra come
          si fa dappertutto per « questo porta altrove ». */}
      <button
        onClick={() => setShowRoster(true)}
        style={{
          width: '100%', padding: '11px 12px', borderRadius: 8, marginBottom: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.20), rgba(255,255,255,0.08))',
          border: '1px solid rgba(255,255,255,0.40)', color: 'rgba(240,246,255,0.95)',
          fontSize: 11, fontWeight: 'bold', letterSpacing: '0.08em', cursor: 'pointer' }}
      >
        <span>◈ {t('roster_title') || 'GESTION DES PROFILS'}</span>
        <ChevronRight size={15} strokeWidth={2.2} style={{ opacity: 0.8, flexShrink: 0 }} />
      </button>
      <div style={{ fontSize: 9, color: labelColor, lineHeight: 1.5 }}>
        {t('conn_select_mode')}
      </div>
      <ModeSelector
        key={`mode-selector-${modeInitKey}`}
        currentMode={displayMode}
        onModeChange={onModeChange}
        disabled={sessionState === 'running' || sessionState === 'paused'}
      />

      {/* CONN-99: SOLO toggle (local only) — kept here since identity now lives
          in the roster; SOLO is a session mode, not an identity. */}
      {appMode === 'local' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '9px 11px',
          borderRadius: 8, cursor: 'pointer', fontSize: 12, color: isSoloSession ? '#fbbf24' : labelColor,
          background: isSoloSession ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${isSoloSession ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.10)'}` }}>
          <input type="checkbox" checked={isSoloSession}
            disabled={sessionState === 'running' || sessionState === 'paused'}
            onChange={e => setIsSoloSession(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#fbbf24', cursor: 'pointer' }} />
          <span style={{ fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>
            {t('solo')} mode
          </span>
        </label>
      )}

      {/* Phone-satellite — LOCAL non-solo only. Lives here in the SESSION/mode
          zone (per user request) instead of the top bar. Routes into the host
          flow so the PC joins by scanning the QR with their phone. */}
      {appMode === 'local' && !isSoloSession && (
        <button
          onClick={onUsePhoneSatellite}
          disabled={sessionState === 'running' || sessionState === 'paused'}
          title={t('sat_subtitle')}
          style={{
            width: '100%', marginTop: 8, padding: '11px 12px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(139,92,246,0.10) 100%)',
            border: '1px solid rgba(139,92,246,0.45)', color: '#c4b5fd',
            fontSize: 12, fontWeight: 'bold', letterSpacing: '0.04em',
            cursor: (sessionState === 'running' || sessionState === 'paused') ? 'not-allowed' : 'pointer',
            opacity: (sessionState === 'running' || sessionState === 'paused') ? 0.5 : 1,
            textAlign: 'left', lineHeight: 1.3 }}
        >
          📱 {t('sat_btn')}
        </button>
      )}

      {/* Phone-satellite ACTIVE — host networking runs under the hood but this
          stays a LOCAL session. Show the QR window + a clean way back to Local. */}
      {satellite && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <button
            onClick={onOpenConnectionModal}
            style={{
              width: '100%', padding: '13px', borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(139,92,246,0.12) 100%)',
              border: '1px solid rgba(139,92,246,0.45)', color: '#c4b5fd',
              fontSize: 12, fontWeight: 'bold', letterSpacing: '0.06em', cursor: 'pointer' }}
          >
            📱 {t('sat_title')}
          </button>
          <div style={{
            padding: '8px 10px', borderRadius: 6,
            background: isConnected ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
            <div style={{ fontSize: 9, color: isConnected ? '#86efac' : labelColor }}>
              {isConnected ? t('conn_preclear_connected_status') : t('conn_auditor_preclear_waiting')}
            </div>
          </div>
          {/* Muse is paired DIRECTLY to this Mac in satellite (instant needle). */}
          <button
            onClick={() => { if (museConnection !== 'searching') onConnectMuse(); }}
            style={{
              width: '100%', padding: '11px', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: museConnection === 'connected' ? 'rgba(34,197,94,0.15)'
                        : museConnection === 'searching' ? 'rgba(251,191,36,0.15)'
                        : 'rgba(255,255,255,0.06)',
              border: `1px solid ${museConnection === 'connected' ? 'rgba(34,197,94,0.45)'
                        : museConnection === 'searching' ? 'rgba(251,191,36,0.45)'
                        : 'rgba(255,255,255,0.22)'}`,
              color: museConnection === 'connected' ? '#4ade80'
                   : museConnection === 'searching' ? '#fbbf24' : 'rgba(235,244,255,0.92)',
              fontSize: 12, fontWeight: 'bold', letterSpacing: '0.06em', cursor: 'pointer' }}
          >
            🎧 {museConnection === 'connected' ? 'MUSE ✓'
              : museConnection === 'searching' ? `${t('searching') || '…'}…`
              : (t('connect_muse') || 'Connect MUSE')}
          </button>
          <button
            onClick={() => onModeChange('local')}
            disabled={sessionState === 'running' || sessionState === 'paused'}
            style={{
              width: '100%', padding: '9px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
              color: labelColor, fontSize: 11, fontWeight: 'bold', letterSpacing: '0.06em',
              cursor: (sessionState === 'running' || sessionState === 'paused') ? 'not-allowed' : 'pointer',
              opacity: (sessionState === 'running' || sessionState === 'paused') ? 0.5 : 1 }}
          >
            ← {t('mode_local')}
          </button>
        </div>
      )}

      {appMode === 'auditor' && !satellite && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <button
            onClick={onOpenConnectionModal}
            style={{
              width: '100%', padding: '13px', borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.07) 100%)',
              border: '1px solid rgba(255,255,255,0.30)', color: 'rgba(235,244,255,0.92)',
              fontSize: 12, fontWeight: 'bold', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            📡  {t('conn_open_window')}
          </button>
          <div
            style={{
              padding: '8px 10px',
              background: isConnected ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6 }}
          >
            <div style={{ fontSize: 9, color: isConnected ? '#86efac' : labelColor }}>
              {isConnected ? t('conn_preclear_connected_status') : t('conn_auditor_preclear_waiting')}
            </div>
            {connectionLink && (
              <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: '#64748b', wordBreak: 'break-all' }}>
                {connectionLink}
              </div>
            )}
          </div>
          {/* PERCHÉ NON C'È IL METER — a distanza il badge delle boîtes sparisce, e finora
              spariva SENZA dirlo: chi non sa perché lo cerca, o peggio lo collega dal pannello
              di taratura e crede di leggere il preclear. Le lattine non viaggiano. */}
          <div style={{
            padding: '8px 10px', borderRadius: 6,
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.22)' }}>
            <div style={{ fontSize: 9, lineHeight: 1.55, color: 'rgba(245,158,11,0.85)' }}>
              {t('remote_no_meter')}
            </div>
          </div>
        </div>
      )}

      {appMode === 'participant' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <button
            onClick={onOpenConnectionModal}
            style={{
              width: '100%', padding: '13px', borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(139,92,246,0.12) 100%)',
              border: '1px solid rgba(139,92,246,0.45)', color: '#c4b5fd',
              fontSize: 12, fontWeight: 'bold', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            🔗  {isConnected ? t('conn_see_connection') : t('conn_paste_auditor_link')}
          </button>
          <div
            style={{
              padding: '8px 10px',
              background: isConnected ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6 }}
          >
            <div style={{ fontSize: 9, color: isConnected ? '#86efac' : labelColor }}>
              {isConnected ? t('conn_badge_preclear_ok') : t('conn_badge_preclear_waiting')}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// AUDITOR
// ============================================================================
function AuditorDrawer({ sessionState, onOpenProfile, t, theme }: SubProps) {
  // PHASE-B step 2: profile fields read directly from profileStore.
  const activeProfile    = useProfileStore(s => s.activeProfile);
  const auditorName      = useProfileStore(s => s.auditorName);
  const setAuditorName   = useProfileStore(s => s.setAuditorName);
  const isSoloSession    = useProfileStore(s => s.isSoloSession);
  const setIsSoloSession = useProfileStore(s => s.setIsSoloSession);
  const auditorAppMode   = useNetworkStore(s => s.appMode);
  const { titleColor, labelColor, inputBg, inputBorder, textColor } = theme;
  return (
    <>
      <div className="flex items-center gap-3">
        {activeProfile?.photo
          ? <img src={activeProfile.photo} className="object-cover rounded-full border-2" style={{ width: 56, height: 56, borderColor: titleColor }} />
          : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: inputBg, border: inputBorder, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={24} style={{ color: labelColor }} />
            </div>
          )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: labelColor, letterSpacing: '0.15em' }}>AUDITOR NAME</div>
          <input
            type="text" placeholder={t('auditor_name') as string} value={auditorName}
            onChange={e => setAuditorName(e.target.value)}
            style={{ width: '100%', background: inputBg, border: inputBorder, borderRadius: 4, color: textColor, fontSize: 11, padding: '4px 8px', outline: 'none', fontFamily: 'monospace', marginTop: 4 }}
          />
        </div>
      </div>

      {/* CONN-92: SOLO is a LOCAL-only mode (auditor == preclear). In a remote
          session there is always a separate preclear, so the toggle is hidden. */}
      {auditorAppMode === 'local' && (
      <label
        className="flex items-center gap-3 cursor-pointer p-3 rounded-lg transition-all"
        style={{
          fontSize: 14,
          color: isSoloSession ? '#fbbf24' : labelColor,
          background: isSoloSession ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${isSoloSession ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.10)'}`,
          boxShadow: isSoloSession ? '0 0 12px rgba(251,191,36,0.20)' : 'none' }}
      >
        <input
          type="checkbox" checked={isSoloSession}
          disabled={sessionState === 'running' || sessionState === 'paused'}
          onChange={e => setIsSoloSession(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: '#fbbf24', cursor: 'pointer' }}
        />
        <span style={{ fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 13 }}>
          {t('solo')} mode
        </span>
        {isSoloSession && (
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.85, fontStyle: 'italic' }}>
            ◉ {(t('active') as string) || 'active'}
          </span>
        )}
      </label>
      )}

      {/* AUDITOR & PC — si APRE, quindi lo deve DIRE. Prima era una scritta piatta in inglese:
          non si capiva che fosse un pulsante, e nelle altre lingue restava in inglese. */}
      <button
        onClick={onOpenProfile}
        style={{ background: inputBg, border: inputBorder, borderRadius: 6, color: titleColor,
                 fontSize: 10, padding: '9px 10px', cursor: 'pointer', letterSpacing: '0.1em',
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
      >
        <span>{t('roster_open') as string}</span>
        <ChevronRight size={14} strokeWidth={2} style={{ opacity: 0.75, flexShrink: 0 }} />
      </button>
    </>
  );
}

// ============================================================================
// PC
// ============================================================================
function PcDrawer({ capturePcPhoto, t, theme }: SubProps) {
  // PHASE-B step 2: profile fields read directly from profileStore.
  const pcPreview     = useProfileStore(s => s.pcPreview);
  const pcPhoto       = useProfileStore(s => s.pcPhoto);
  const pcName        = useProfileStore(s => s.pcName);
  const setPcName     = useProfileStore(s => s.setPcName);
  const isSoloSession = useProfileStore(s => s.isSoloSession);
  const { titleColor, labelColor, inputBg, inputBorder, textColor } = theme;
  return (
    <>
      <div className="flex items-center gap-3">
        {(pcPreview || pcPhoto)
          ? <img src={pcPreview || pcPhoto} className="object-cover rounded-full border-2" style={{ width: 56, height: 56, borderColor: '#22c55e' }} />
          : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: inputBg, border: inputBorder, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={22} style={{ color: labelColor }} />
            </div>
          )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: labelColor, letterSpacing: '0.15em' }}>PC NAME</div>
          <input
            type="text" placeholder={t('pc_name') as string} value={pcName}
            onChange={e => !isSoloSession && setPcName(e.target.value)} disabled={isSoloSession}
            style={{ width: '100%', background: inputBg, border: inputBorder, borderRadius: 4, color: textColor, fontSize: 11, padding: '4px 8px', outline: 'none', fontFamily: 'monospace', marginTop: 4, opacity: isSoloSession ? 0.4 : 1 }}
          />
        </div>
      </div>

      {!isSoloSession && (
        <button
          onClick={capturePcPhoto}
          style={{ background: inputBg, border: inputBorder, borderRadius: 6, color: titleColor, fontSize: 10, padding: '8px', cursor: 'pointer', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Camera size={14} strokeWidth={1.5} /> Capture Photo
        </button>
      )}

      {isSoloSession && (
        <div style={{ fontSize: 9, color: '#fbbf24', fontStyle: 'italic', textAlign: 'center', padding: 8, background: 'rgba(251,191,36,0.08)', borderRadius: 6 }}>
          Solo mode active — PC fields disabled
        </div>
      )}
    </>
  );
}

// ============================================================================
// TRIM
// ============================================================================
function TrimDrawer({ needleTrim, setNeedleTrim, needleInertia, setNeedleInertia,
                     thetaSensTrim = 0, setThetaSensTrim, thetaConnected = false, museConnected = false,
                     thetaConfig = 'two-cans', setThetaConfig, thetaAddPoint,
                     thetaTaNow = null, onOpenThetaTester,
                     t, theme }: SubProps) {
  const { titleColor, labelColor, inputBg, inputBorder } = theme;
  /** Il TA che il Theta-Meter mostra ADESSO, digitato per il confronto affiancato. */
  const [rifTa, setRifTa] = React.useState('');
  const inertia = needleInertia ?? 90;
  return (
    <>
      {/* ── MUSE ─────────────────────────────────────────────────────────────────────────
          Compare SOLO col Muse collegato, e dice a chiare lettere che è la sensibilità del
          SUO ago: mescolata a quella delle boîtes senza etichetta, non si capiva quale
          manopola muovesse quale ago. */}
      {museConnected && (<>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
                    color: titleColor, textTransform: 'uppercase', marginBottom: 2 }}>
        MUSE
      </div>
      <div style={{ fontSize: 9, color: labelColor, lineHeight: 1.5 }}>
        {t('trim_centering') as string}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 9, color: labelColor, letterSpacing: '0.15em' }}>{(t('trim_sensitivity') || 'SENSIBILITÀ').toUpperCase()}</span>
        <span
          style={{
            fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 4,
            color: titleColor,
            background: `${titleColor}26` }}
        >
          {needleTrim > 0 ? '+' : ''}{needleTrim} {needleTrim <= -5 ? 'LOW' : needleTrim <= 0 ? 'CENTER' : 'HIGH'}
        </span>
      </div>
      <input
        type="range" min={-10} max={10} step={1} value={needleTrim}
        onChange={e => setNeedleTrim(parseFloat(e.target.value))}
        className="glass-range" style={{ width: '100%' }}
      />
      <div className="flex justify-between" style={{ fontSize: 8, color: labelColor }}>
        <span>-10</span><span>0</span><span>+10</span>
      </div>
      {/* CONN-89: ±5 now INCREMENT/DECREMENT (clamped to ±10) instead of jumping
          to an absolute value — pressing +5 twice reaches +10. The middle button
          re-centers to 0. */}
      <div className="flex gap-2" style={{ marginTop: 8 }}>
        <button
          onClick={() => setNeedleTrim(p => Math.max(-10, p - 5))}
          style={{ flex: 1, background: inputBg, border: inputBorder, borderRadius: 4, color: titleColor, fontSize: 10, padding: '6px', cursor: 'pointer' }}
        >−5</button>
        <button
          onClick={() => setNeedleTrim(0)}
          style={{ flex: 1, background: inputBg, border: inputBorder, borderRadius: 4, color: titleColor, fontSize: 10, padding: '6px', cursor: 'pointer' }}
        >0</button>
        <button
          onClick={() => setNeedleTrim(p => Math.min(10, p + 5))}
          style={{ flex: 1, background: inputBg, border: inputBorder, borderRadius: 4, color: titleColor, fontSize: 10, padding: '6px', cursor: 'pointer' }}
        >+5</button>
      </div>

      {/* CONN-91: INERTIA — needle mechanical feel (spring k + damping d).
          Low = light/snappy, high = heavy/mechanical. */}
      {setNeedleInertia && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${inputBorder ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.18)'}` }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 9, color: labelColor, letterSpacing: '0.15em' }}>{(t('trim_inertia') || 'INERZIA').toUpperCase()}</span>
            <span style={{ fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 4, color: titleColor, background: `${titleColor}26` }}>
              {Math.round(inertia)}
            </span>
          </div>
          <input
            type="range" min={0} max={100} step={1} value={inertia}
            onChange={e => setNeedleInertia(parseFloat(e.target.value))}
            className="glass-range" style={{ width: '100%', marginTop: 4 }}
          />
          <div className="flex justify-between" style={{ fontSize: 8, color: labelColor }}>
            <span>0</span><span>50</span><span>100</span>
          </div>
        </div>
      )}
      </>)}

      {/* ── BOÎTES ───────────────────────────────────────────────────────────────────────
          Intestazione grande e separata: mescolate al MUSE senza stacco, non si capiva
          quale manopola muovesse quale ago. */}
      {thetaConnected && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(245,158,11,0.28)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.16em',
                        color: '#f59e0b', textTransform: 'uppercase', marginBottom: 10 }}>
            {t('theta_cans')}
          </div>
      {/* ── SENSIBILITÉ DES BOÎTES (Theta-Meter) ────────────────────────────────────────────
          Ici et pas dans la fenêtre d'étalonnage : celle-ci COUVRE le cadran, et on règle une
          sensibilité en REGARDANT l'aiguille. Le tiroir, lui, est latéral.
          À refaire à chaque séance : la sensibilité dépend de la façon dont CE préclair tient
          les boîtes (l'épreuve de la pression donne le point de départ, ceci l'affine). */}
          {setThetaSensTrim && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 9, color: labelColor, letterSpacing: '0.15em' }}>
              {(t('theta_needle_sens') || '').toUpperCase()}
            </span>
            <span style={{ fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 4,
                           color: '#f59e0b', background: 'rgba(245,158,11,0.15)' }}>
              {thetaSensTrim > 0 ? '+' : ''}{thetaSensTrim}
            </span>
          </div>
          <input
            type="range" min={-10} max={10} step={1} value={thetaSensTrim}
            onChange={e => setThetaSensTrim(parseFloat(e.target.value))}
            className="glass-range" style={{ width: '100%' }}
          />
          <div className="flex justify-between" style={{ fontSize: 8, color: labelColor }}>
            <span>−10</span><span>0</span><span>+10</span>
          </div>

          {/* ── COME SONO TENUTE LE BOÎTES ────────────────────────────────────────────────
              Due boîtes, una per mano — oppure, in SOLO AUDITING, una boîte sola fatta di due
              mezze boîtes. Cambia la geometria degli elettrodi, quindi la resistenza: lo stesso
              preclear legge un TA diverso nelle due configurazioni. */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, color: labelColor, letterSpacing: '0.15em', marginBottom: 6 }}>
              {(t('theta_how_held') || '').toUpperCase()}
            </div>
            <div className="flex gap-2">
              {(['two-cans', 'solo-can'] as const).map(c => (
                <button key={c} onClick={() => setThetaConfig?.(c)}
                  style={{ flex: 1, padding: '7px 4px', borderRadius: 6, fontSize: 10, cursor: 'pointer',
                           background: thetaConfig === c ? 'rgba(245,158,11,0.18)' : inputBg,
                           border: thetaConfig === c ? '1px solid rgba(245,158,11,0.6)' : inputBorder,
                           color: thetaConfig === c ? '#f59e0b' : titleColor }}>
                  {t(c === 'two-cans' ? 'theta_two_cans' : 'theta_solo_can')}
                </button>
              ))}
            </div>
          </div>

          {/* ── AFFINARE LA SCALA CONFRONTANDOSI COL THETA-METER ──────────────────────────
              I due programmi leggono il dispositivo insieme: si guardano i quadranti affiancati
              e si scrive il TA che mostra il meter. Non è una correzione costante — AGGIUNGE un
              punto alla scala, quindi corregge la forma proprio dove serve. */}
          <div style={{ marginTop: 12 }}>
            {/* « Affinare la scala » da solo non diceva DI COSA: e' la scala del TA. */}
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          color: titleColor, marginBottom: 4 }}>
              TA — {t('theta_refine')}
            </div>
            <div style={{ fontSize: 9, color: labelColor, lineHeight: 1.5, marginBottom: 6 }}>
              {t('theta_refine_hint')}
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 10, color: labelColor, whiteSpace: 'nowrap' }}>
                {t('theta_we_read')}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
                {thetaTaNow !== null ? thetaTaNow.toFixed(2) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
              <input value={rifTa} onChange={e => setRifTa(e.target.value)} placeholder="5.80"
                inputMode="decimal"
                style={{ width: 62, height: 26, borderRadius: 5, padding: '0 7px',
                         fontFamily: 'monospace', fontSize: 12, textAlign: 'right',
                         background: inputBg, border: inputBorder, color: titleColor, outline: 'none' }} />
              <button
                disabled={!Number.isFinite(parseFloat(rifTa))}
                onClick={() => { thetaAddPoint?.(parseFloat(rifTa)); setRifTa(''); }}
                style={{ flex: 1, padding: '6px', borderRadius: 5, fontSize: 10, cursor: 'pointer',
                         opacity: Number.isFinite(parseFloat(rifTa)) ? 1 : 0.4,
                         background: inputBg, border: inputBorder, color: titleColor }}>
                {t('theta_ref_apply')}
              </button>
            </div>
          </div>

          {/* L'artefatto è uno strumento da laboratorio: dietro un bottone, per non mettere
              quattro campi numerici senza contesto davanti a chi non sa cosa sia. */}
          {onOpenThetaTester && (
            <>
              <button onClick={onOpenThetaTester} className="glass-btn"
                style={{ width: '100%', marginTop: 12, padding: '8px', fontSize: 10,
                         letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                🎚 {t('theta_tester')}
              </button>
              {/* Chi non ha l'artefatto non deve nemmeno aprirlo: la taratura di fabbrica
                  e' gia' dentro, e si affina qui sopra col Theta-Meter affiancato. */}
              <div style={{ fontSize: 9, color: labelColor, lineHeight: 1.5, marginTop: 4 }}>
                {t('theta_tester_hint')}
              </div>
            </>
          )}

          </div>
          )}
        </div>
      )}

    </>
  );
}

// ============================================================================
// SESSION
// ============================================================================
function SessionDrawer({ sessionState, onStart, onPause, onResume, onEnd, t, theme }: SubProps) {
  const { labelColor, textColor } = theme;
  return (
    <>
      <div style={{ fontSize: 9, color: labelColor, lineHeight: 1.5 }}>
        État actuel : <span style={{ color: textColor, fontWeight: 'bold' }}>{sessionState}</span>
      </div>
      {sessionState === 'idle' || sessionState === 'ended' ? (
        <button
          onClick={onStart}
          style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.50)', borderRadius: 6, color: '#4ade80', fontSize: 11, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 'bold', letterSpacing: '0.1em' }}
        >
          <Play size={16} strokeWidth={1.5} /> {t('start_session')}
        </button>
      ) : (
        <>
          {sessionState === 'running' ? (
            <button
              onClick={onPause}
              style={{ background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.50)', borderRadius: 6, color: '#facc15', fontSize: 11, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 'bold', letterSpacing: '0.1em' }}
            >
              <Pause size={16} strokeWidth={1.5} /> {t('pause')}
            </button>
          ) : (
            <button
              onClick={onResume}
              style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.50)', borderRadius: 6, color: '#4ade80', fontSize: 11, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 'bold', letterSpacing: '0.1em' }}
            >
              <Play size={16} strokeWidth={1.5} /> {t('resume')}
            </button>
          )}
          <button
            onClick={onEnd}
            style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.50)', borderRadius: 6, color: '#f87171', fontSize: 11, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 'bold', letterSpacing: '0.1em' }}
          >
            <Square size={16} strokeWidth={1.5} /> {t('end_session')}
          </button>
        </>
      )}
    </>
  );
}

// ============================================================================
// LANG
// ============================================================================
function LangDrawer({ lang, setLang, theme }: SubProps) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const { titleColor, labelColor, inputBg, inputBorder, textColor } = theme;
  return (
    <>
      <div style={{ fontSize: 9, color: labelColor, lineHeight: 1.5 }}>
        Sélectionner la langue de l'interface.
      </div>
      {([
        ['en', 'English'],
        ['fr', 'Français'],
        ['it', 'Italiano'],
        ['es', 'Español'],
        ['sv', 'Svenska'],
      ] as const).map(([code, name]) => {
        const active = lang === code;
        return (
          <button
            key={code} onClick={() => setLang(code as Language)}
            style={{
              background: active ? (isLightTheme ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.12)') : inputBg,
              border: active ? `1px solid ${titleColor}` : inputBorder,
              borderRadius: 6, color: active ? titleColor : textColor, fontSize: 11, padding: '8px 12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', letterSpacing: '0.05em' }}
          >
            <span>{name}</span>
            <span style={{ fontSize: 9, opacity: 0.6 }}>{(code || '').toUpperCase()}</span>
          </button>
        );
      })}
    </>
  );
}

// ============================================================================
// CONFIG
// ============================================================================
function ConfigDrawer({ t, theme, lang }: SubProps) {
  // PHASE-B step 4: theme + wallpaper from uiStore; layout state from layoutStore.
  const isLightTheme    = useUiStore(s => s.isLightTheme);
  const wallpaperUrl    = useUiStore(s => s.wallpaperUrl);
  const setWallpaperUrl = useUiStore(s => s.setWallpaperUrl);
  const uiAlpha         = useUiStore(s => s.uiAlpha);
  const setUiAlpha      = useUiStore(s => s.setUiAlpha);

  const moduleVis        = useLayoutStore(s => s.moduleVis);
  const setModuleVis     = useLayoutStore(s => s.setModuleVis);
  const newLayoutName    = useLayoutStore(s => s.newLayoutName);
  const setNewLayoutName = useLayoutStore(s => s.setNewLayoutName);
  const savedLayouts     = useLayoutStore(s => s.savedLayouts);
  const saveLayout       = useLayoutStore(s => s.saveLayout);
  const loadLayout       = useLayoutStore(s => s.loadLayout);
  const deleteLayout     = useLayoutStore(s => s.deleteLayout);

  const { titleColor, labelColor, inputBg, inputBorder, textColor } = theme;
  const wallpaperInputId = 'config-wallpaper-input';
  // L'importazione passa per una riduzione (canvas): non è istantanea e può fallire.
  const [wpInCorso, setWpInCorso] = React.useState(false);
  const [wpErrore,  setWpErrore]  = React.useState<'lettura' | 'troppo-grande' | null>(null);

  const moduleList: Array<{ key: keyof ModuleVisibility; tKey: string; icon: string }> = [
    { key: 'journal',   tKey: 'config_mod_journal',   icon: '📋' },
    { key: 'health',    tKey: 'config_mod_health',    icon: '💚' },
    { key: 'cam2',      tKey: 'config_mod_cam2',      icon: '📷' },
    { key: 'cam1',      tKey: 'config_mod_cam1',      icon: '📷' },
    { key: 'ri',        tKey: 'config_mod_ri',        icon: '✔' },
    { key: 'biometric', tKey: 'config_mod_biometric', icon: '📊' },
    { key: 'mna',       tKey: 'config_mod_mna',       icon: '🎵' },
  ];

  return (
    <>
      {/* NORMAL / EXPERT è passato nella BARRA DELLE ICONE, sopra START: non è una preferenza
          d'aspetto ma il modo di lavorare, e la scelta precede la seduta (richiesta utente).
          Tenerlo anche qui sarebbe un secondo interruttore per la stessa cosa. */}

      {/* Appearance */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: labelColor, textTransform: 'uppercase', marginBottom: 6 }}>
        {t('config_appearance')}
      </div>

      {/* Sélecteur de thème en VERRE (réf. "Glass Toggle") — remplace l'ancien switch. */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 10px' }}>
        <GlassThemeToggle />
      </div>

      {/* Glass: interface transparency (overlays + panels, not the needle) */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: textColor, fontFamily: 'monospace', fontWeight: 600 }}>
            {t('config_transparency')}
          </span>
          <span style={{ fontSize: 11, color: labelColor, fontFamily: 'monospace' }}>{Math.round(uiAlpha * 100)}%</span>
        </div>
        <input
          type="range" min={45} max={100} step={1}
          value={Math.round(uiAlpha * 100)}
          onChange={e => setUiAlpha(Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: titleColor, cursor: 'pointer' }}
        />
      </div>

      {/* Wallpaper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 14, color: textColor, fontFamily: 'monospace', fontWeight: 600, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ImageIcon size={16} strokeWidth={1.8} color={labelColor} /> {t('wallpaper')}
        </span>
      </div>
      <input
        id={wallpaperInputId} type="file" accept="image/*"
        style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = '';   // così si può riscegliere LO STESSO file dopo un errore
          setWpErrore(null);
          setWpInCorso(true);
          const { dataUrl, errore } = await importWallpaper(file);
          setWpInCorso(false);
          if (!dataUrl) { setWpErrore(errore ?? 'lettura'); return; }
          setWallpaperUrl(dataUrl);
        }}
      />

      {/* ── DUE SOLI FONDI: quello dell'app, e IL TUO ──────────────────────────────────────
          I quattordici in dotazione sono spariti. Erano una galleria da attraversare, e
          nessuno di essi diceva niente all'auditor: il fondo non è un'informazione, è la
          superficie su cui se ne leggono altre. Chi vuole il proprio lo importa — e adesso
          l'immagine RESTA anche dopo il riavvio (prima era un blob:, moriva con la pagina). */}
      {(() => {
        const tile = (active: boolean): React.CSSProperties => ({
          position: 'relative', height: 46, borderRadius: 8, cursor: 'pointer', overflow: 'hidden',
          border: `2px solid ${active ? labelColor : (isLightTheme ? 'rgba(70,130,200,0.30)' : 'rgba(255,255,255,0.18)')}`,
          boxShadow: active ? `0 0 10px ${labelColor}66` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center' });
        const etichettaDefault = lang === 'fr' ? 'DÉFAUT' : lang === 'it' ? 'DEFAULT'
                               : lang === 'es' ? 'DEFECTO' : lang === 'sv' ? 'STANDARD' : 'DEFAULT';
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            <div onClick={() => setWallpaperUrl('')} style={{
              ...tile(!wallpaperUrl),
              background: isLightTheme
                ? 'linear-gradient(135deg,#dde1e8,#c9ced8)'
                : 'linear-gradient(135deg,#2e2e33,#1e1e22)' }} title={t('tip_interface')}>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: isLightTheme ? '#1e293b' : 'rgba(240,246,255,0.85)', letterSpacing: '0.05em' }}>
                {etichettaDefault}
              </span>
            </div>
            {/* L'immagine importata, se c'è: si vede quale è in uso senza aprire nulla. */}
            <label htmlFor={wallpaperInputId} style={{ ...tile(!!wallpaperUrl) }} title={t('wallpaper_import')}>
              {wallpaperUrl
                ? <img src={wallpaperUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <ImagePlus size={18} strokeWidth={1.8} color={labelColor} />}
            </label>
          </div>
        );
      })()}

      {/* L'esito dell'importazione: un fondo che non si carica non deve sparire in silenzio. */}
      {(wpInCorso || wpErrore) && (
        <div style={{
          marginTop: 6, fontSize: 10, fontFamily: 'monospace', lineHeight: 1.4,
          color: wpErrore ? TOKEN.warn : labelColor }}>
          {wpInCorso ? '…' : wpErrore === 'troppo-grande' ? t('wallpaper_too_big') : t('wallpaper_unreadable')}
        </div>
      )}

      {/* Il bottone d'importazione, per esteso — la mattonella sopra fa lo stesso. */}
      <label
        htmlFor={wallpaperInputId}
        style={{
          marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
          fontSize: 12, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.04em',
          background: isLightTheme ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.10)',
          border: `1px solid ${labelColor}55`, color: labelColor }}
      >
        <ImagePlus size={16} strokeWidth={1.8} /> {t('wallpaper_import')}
      </label>

      <div style={{ height: 1, background: `${labelColor}33`, margin: '8px 0 6px' }} />

      {/* Modules */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: labelColor, textTransform: 'uppercase', marginBottom: 4 }}>
        {t('config_modules')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {moduleList.map(({ key, tKey, icon }) => {
          const on = moduleVis[key];
          return (
            <button
              key={key}
              onClick={() => setModuleVis(v => ({ ...v, [key]: !v[key] }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                // FOND NOIR (matière mini-toggle) en sombre → le pouce blanc redevient visible
                // (avant : blanc sur blanc). Le clair garde son fond doux.
                background: isLightTheme
                  ? (on ? 'rgba(6,182,212,0.12)' : 'rgba(0,0,0,0.04)')
                  : '#17171b',
                border: isLightTheme ? 'none' : `1px solid rgba(255,255,255,${on ? 0.18 : 0.08})`,
                boxShadow: isLightTheme ? 'none' : 'inset 0 1px 3px rgba(0,0,0,0.6)',
                transition: 'background 0.2s' }}
            >
              <div style={{
                width: 28, height: 16, borderRadius: 8, flexShrink: 0,
                background: on ? (isLightTheme ? '#0284c7' : 'rgba(255,255,255,0.38)') : (isLightTheme ? '#cbd5e1' : 'rgba(255,255,255,0.12)'),
                position: 'relative', transition: 'background 0.2s' }}>
                <div style={{
                  position: 'absolute', top: 2, left: on ? 14 : 2,
                  width: 12, height: 12, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: 11, color: on ? textColor : labelColor, fontFamily: 'monospace' }}>
                {icon} {t(tKey)}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          onClick={() => setModuleVis({ ...DEFAULT_MODULES })}
          style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${labelColor}44`, background: 'transparent', cursor: 'pointer', fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em', color: labelColor }}
        >
          {t('config_all_on')}
        </button>
        <button
          onClick={() => setModuleVis({ journal: false, health: false, cam1: false, cam2: false, ri: false, biometric: false, mna: false })}
          style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${labelColor}44`, background: 'transparent', cursor: 'pointer', fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em', color: labelColor }}
        >
          {t('config_all_off')}
        </button>
      </div>


      <div style={{ height: 1, background: `${labelColor}33`, margin: '8px 0 6px' }} />

      {/* Layouts */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: labelColor, textTransform: 'uppercase', marginBottom: 4 }}>
        {t('config_save_layout')}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text" placeholder={t('config_layout_name')} value={newLayoutName}
          onChange={e => setNewLayoutName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveLayout(newLayoutName)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 10, background: inputBg, border: inputBorder, color: textColor, fontFamily: 'monospace', outline: 'none' }}
        />
        <button
          onClick={() => saveLayout(newLayoutName)}
          disabled={!newLayoutName.trim()}
          style={{
            padding: '6px 10px', borderRadius: 6, border: 'none', cursor: newLayoutName.trim() ? 'pointer' : 'not-allowed',
            background: isLightTheme ? '#0284c7' : 'rgba(240,246,255,0.95)',
            color: '#fff', fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
            opacity: newLayoutName.trim() ? 1 : 0.4 }}
        >
          ✚
        </button>
      </div>

      {savedLayouts.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: labelColor, textTransform: 'uppercase', marginTop: 6 }}>
            {t('config_layouts')} ({savedLayouts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {savedLayouts.map(layout => (
              <div
                key={layout.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', borderRadius: 8,
                  background: isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${labelColor}22` }}
              >
                <button
                  onClick={() => loadLayout(layout)}
                  style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: textColor, fontFamily: 'monospace' }}
                >
                  {layout.name}
                </button>
                <span style={{ fontSize: 8, color: labelColor, opacity: 0.6 }}>
                  {new Date(layout.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => deleteLayout(layout.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 12, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
