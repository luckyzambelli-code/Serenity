import { create } from 'zustand';

/**
 * networkStore — cross-cutting P2P / connection state.
 *
 * Phase B step 3: pull these fields out of App.tsx's local useState bag so
 * the components that visualize remote-peer state (HealthPanel,
 * topbar P2P badge, SidebarDrawer LINK section, ConnectionModal) can read
 * them with selector granularity instead of receiving them as props.
 *
 *   Local connection state:
 *     • appMode               — 'local' | 'auditor' | 'participant'
 *     • modeInitKey           — increment to force ModeSelector re-init
 *     • isConnected           — true when the P2P channel is up
 *     • peerId                — our PeerJS id (from networkManager.init)
 *     • connectionLink        — the URL the auditor shares with the PC
 *     • participantLink       — the link pasted by the participant
 *
 *   Remote peer-reported state (auditor side):
 *     • remoteStream          — incoming MediaStream (video+audio) for the
 *                               participant's full-screen overlay
 *     • remoteBatteryLevel    — participant's Muse battery %
 *     • remoteMuseConnected   — participant's Muse connectivity
 *     • remoteSignalQuality   — participant's EEG signal quality 0-100
 *
 * Setters use the React-style `SetStateAction<T>` so call sites with the
 * functional updater pattern work without surprises.
 */

type SetStateAction<T> = T | ((prev: T) => T);
function applyAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (p: T) => T)(current) : action;
}

export type AppMode = 'local' | 'auditor' | 'participant';

interface NetworkState {
  // Local connection
  appMode:         AppMode;
  modeInitKey:     number;
  isConnected:     boolean;
  peerId:          string;
  connectionLink:  string;
  participantLink: string;

  // Remote peer state
  remoteStream:         MediaStream | null;
  remoteBatteryLevel:   number | null;
  remoteMuseConnected:  boolean;
  remoteSignalQuality:  number;

  // FIX CONN-4/8: surfaces auto-reconnect state to the UI so the user sees
  // "reconnecting…" while EventSource is silently retrying or the participant
  // is mid-back-off. Set from App.tsx in scheduleReconnect / onConnectionEstablished.
  isReconnecting:       boolean;

  // FIX CONN-33: WebSocket video fallback. When WebRTC media can't establish
  // (5G / symmetric NAT / no TURN), the peer's camera is relayed as JPEG
  // frames over the WS. `videoFallbackActive` flips the UI to show the latest
  // frame (`remoteVideoFrame`) instead of the (black) WebRTC <video>.
  videoFallbackActive:  boolean;
  remoteVideoFrame:     string | null;

  // Actions
  setAppMode:             (m: SetStateAction<AppMode>)               => void;
  setModeInitKey:         (n: SetStateAction<number>)                => void;
  setIsConnected:         (b: SetStateAction<boolean>)               => void;
  setPeerId:              (s: SetStateAction<string>)                => void;
  setConnectionLink:      (s: SetStateAction<string>)                => void;
  setParticipantLink:     (s: SetStateAction<string>)                => void;
  setRemoteStream:        (s: SetStateAction<MediaStream | null>)    => void;
  setRemoteBatteryLevel:  (n: SetStateAction<number | null>)         => void;
  setRemoteMuseConnected: (b: SetStateAction<boolean>)               => void;
  setRemoteSignalQuality: (n: SetStateAction<number>)                => void;
  setIsReconnecting:      (b: SetStateAction<boolean>)               => void;
  setVideoFallbackActive: (b: SetStateAction<boolean>)               => void;
  setRemoteVideoFrame:    (s: SetStateAction<string | null>)         => void;
}

export const useNetworkStore = create<NetworkState>()((set) => ({
  appMode:             'local',
  modeInitKey:         0,
  isConnected:         false,
  peerId:              '',
  connectionLink:      '',
  participantLink:     '',
  remoteStream:        null,
  remoteBatteryLevel:  null,
  remoteMuseConnected: false,
  remoteSignalQuality: 0,
  isReconnecting:      false,
  videoFallbackActive: false,
  remoteVideoFrame:    null,

  setAppMode:             (m) => set((s) => ({ appMode:             applyAction(m, s.appMode) })),
  setModeInitKey:         (n) => set((s) => ({ modeInitKey:         applyAction(n, s.modeInitKey) })),
  setIsConnected:         (b) => set((s) => ({ isConnected:         applyAction(b, s.isConnected) })),
  setPeerId:              (v) => set((s) => ({ peerId:              applyAction(v, s.peerId) })),
  setConnectionLink:      (v) => set((s) => ({ connectionLink:      applyAction(v, s.connectionLink) })),
  setParticipantLink:     (v) => set((s) => ({ participantLink:     applyAction(v, s.participantLink) })),
  setRemoteStream:        (v) => set((s) => ({ remoteStream:        applyAction(v, s.remoteStream) })),
  setRemoteBatteryLevel:  (v) => set((s) => ({ remoteBatteryLevel:  applyAction(v, s.remoteBatteryLevel) })),
  setRemoteMuseConnected: (v) => set((s) => ({ remoteMuseConnected: applyAction(v, s.remoteMuseConnected) })),
  setRemoteSignalQuality: (v) => set((s) => ({ remoteSignalQuality: applyAction(v, s.remoteSignalQuality) })),
  setIsReconnecting:      (v) => set((s) => ({ isReconnecting:      applyAction(v, s.isReconnecting) })),
  setVideoFallbackActive: (v) => set((s) => ({ videoFallbackActive: applyAction(v, s.videoFallbackActive) })),
  setRemoteVideoFrame:    (v) => set((s) => ({ remoteVideoFrame:    applyAction(v, s.remoteVideoFrame) })),
}));
