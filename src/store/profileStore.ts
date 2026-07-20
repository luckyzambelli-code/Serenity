import { create } from 'zustand';
import type { UserProfile } from '../lib/storage';

/**
 * profileStore — cross-cutting profile / session-cosmetic state.
 *
 * Phase B step 2: pull these fields out of App.tsx's local useState bag so
 * any consumer (SidebarDrawer, ProfileModal, AIAssistant context,
 * PostSessionReport, …) can read them with selector granularity instead of
 * receiving 6+ props.
 *
 *   • activeProfile     — currently selected UserProfile (or null)
 *   • auditorName       — the auditor's display name
 *   • pcName            — the preclear's display name
 *   • pcPhoto           — the captured PC photo (data URL)
 *   • pcPreview         — temp preview before pcPhoto is committed
 *   • isSoloSession     — solo mode flag (auditor === PC)
 *   • sessionCount      — how many sessions the active profile has (cached)
 *
 * NOT persisted by this store — the canonical persistence layer is still
 * `localStorage["nest_profiles"]` (managed by `lib/storage.ts`). This store
 * is just an in-memory mirror that React subscribes to; App.tsx writes
 * through both on boot and on profile changes.
 *
 * Setter signature is the React-style `SetStateAction<T>` so call sites that
 * use `setX(prev => ...)` keep working (same robust pattern as uiStore).
 */

type SetStateAction<T> = T | ((prev: T) => T);
function applyAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (p: T) => T)(current) : action;
}

interface ProfileState {
  activeProfile: UserProfile | null;
  auditorName:   string;
  pcName:        string;
  pcPhoto:       string | undefined;
  pcPreview:     string | undefined;
  pcSex:         'm' | 'f' | undefined;   // drives the Tone-Arm clear baseline (m→3, f→2)
  isSoloSession: boolean;
  sessionCount:  number;

  setActiveProfile: (p: SetStateAction<UserProfile | null>)       => void;
  setAuditorName:   (n: SetStateAction<string>)                   => void;
  setPcName:        (n: SetStateAction<string>)                   => void;
  setPcPhoto:       (p: SetStateAction<string | undefined>)       => void;
  setPcPreview:     (p: SetStateAction<string | undefined>)       => void;
  setPcSex:         (s: SetStateAction<'m' | 'f' | undefined>)    => void;
  setIsSoloSession: (b: SetStateAction<boolean>)                  => void;
  setSessionCount:  (n: SetStateAction<number>)                   => void;
}

export const useProfileStore = create<ProfileState>()((set) => ({
  activeProfile: null,
  auditorName:   '',
  pcName:        '',
  pcPhoto:       undefined,
  pcSex:         undefined,
  pcPreview:     undefined,
  isSoloSession: false,
  sessionCount:  0,

  setActiveProfile: (p) => set((s) => ({ activeProfile: applyAction(p, s.activeProfile) })),
  setAuditorName:   (n) => set((s) => ({ auditorName:   applyAction(n, s.auditorName) })),
  setPcName:        (n) => set((s) => ({ pcName:        applyAction(n, s.pcName) })),
  setPcPhoto:       (p) => set((s) => ({ pcPhoto:       applyAction(p, s.pcPhoto) })),
  setPcPreview:     (p) => set((s) => ({ pcPreview:     applyAction(p, s.pcPreview) })),
  setPcSex:         (x) => set((s) => ({ pcSex:         applyAction(x, s.pcSex) })),
  setIsSoloSession: (b) => set((s) => ({ isSoloSession: applyAction(b, s.isSoloSession) })),
  setSessionCount:  (n) => set((s) => ({ sessionCount:  applyAction(n, s.sessionCount) })),
}));
