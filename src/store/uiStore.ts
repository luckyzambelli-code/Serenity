import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { FnMode } from '../engine/FloatGenerator';
import { isPersistableWallpaper } from '../lib/wallpaperImport';

/**
 * uiStore — cross-cutting UI preferences (theme, wallpaper).
 *
 * Phase B step 1: replace `isLightTheme` prop-drilling (used in 30+ sites)
 * and `wallpaperUrl` prop-drilling with a tiny Zustand store. Components
 * can now subscribe with selector granularity:
 *
 *   const isLightTheme = useUiStore(s => s.isLightTheme);
 *
 * The theme preference is persisted to localStorage so the user's choice
 * survives reloads. The wallpaper URL is volatile by design — it's a blob:
 * URL that wouldn't survive a reload anyway, so we exclude it from the
 * persisted slice.
 *
 * Why Zustand rather than another React Context here:
 *   • Selector subscription = only the components that read the field
 *     re-render when it changes (Context re-renders the whole subtree).
 *   • No <Provider> wrapping — works in any leaf component.
 *   • TypeScript inference works out-of-the-box.
 *   • 1.5 KB minified.
 */

/**
 * React-style setter type — accepts either a direct value OR a functional
 * updater `(prev) => next`. This lets the store be a drop-in replacement
 * for `React.Dispatch<React.SetStateAction<...>>` at call sites that still
 * expect the useState signature (notably the SidebarDrawer toggle).
 *
 * Without this, calling `setLightTheme(v => !v)` would store the FUNCTION
 * itself as the value (a truthy object) — the bug that broke theme toggling.
 */
type SetStateAction<T> = T | ((prev: T) => T);

interface UiState {
  /** Light vs dark theme. Persisted. */
  isLightTheme: boolean;
  /** Active wallpaper (blob:/data:/http: URL). Volatile — not persisted. */
  wallpaperUrl: string;
  /** CONN-98: profiles roster (auditors + PCs) overlay open. Volatile. */
  showRoster: boolean;
  /** Panneau de calibration TA (vs meter réel) ouvert. Volatile. */
  /** Glass: opacity of the overlay/panel UI (0.45–1). 1 = solid. Persisted. */
  uiAlpha: number;
  /** STYLE du Floating Needle (5 modes, cf. engine/FloatGenerator). Volatile. */
  fnMode: FnMode;
  /** APERÇU F/N : force le float (mode courant) sur le cadran pour le régler sans MUSE. Volatile. */

  // ── Actions ─────────────────────────────────────────────────────────────
  setLightTheme:   (value: SetStateAction<boolean>) => void;
  toggleTheme:     () => void;
  setWallpaperUrl: (url:   SetStateAction<string>)  => void;
  setShowRoster:   (value: SetStateAction<boolean>) => void;
  setUiAlpha:      (value: SetStateAction<number>)  => void;
  setFnMode:       (value: SetStateAction<FnMode>)  => void;
}

/** Apply a SetStateAction against the current value. */
function applyAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (p: T) => T)(current) : action;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isLightTheme: false,
      // IL FONDO O È QUELLO DELL'APP O È IL TUO. I quattordici fondi in dotazione sono stati
      // tolti: erano una galleria da scegliere ogni volta, e nessuno di essi diceva niente
      // all'auditor. Resta il fondo predefinito ('') — e l'immagine che ciascuno importa, che
      // ora si conserva davvero (vedi lib/wallpaperImport).
      wallpaperUrl: '',
      showRoster: false,
      uiAlpha: 1,
      fnMode: 'normal',

      setLightTheme:   (value) => set((s) => ({ isLightTheme: applyAction(value, s.isLightTheme) })),
      toggleTheme:     ()      => set((s) => ({ isLightTheme: !s.isLightTheme })),
      setWallpaperUrl: (url)   => set((s) => ({ wallpaperUrl: applyAction(url,   s.wallpaperUrl) })),
      setShowRoster:   (value) => set((s) => ({ showRoster:   applyAction(value, s.showRoster) })),
      setUiAlpha:      (value) => set((s) => ({ uiAlpha: Math.max(0.45, Math.min(1, applyAction(value, s.uiAlpha))) })),
      setFnMode:       (value) => set((s) => ({ fnMode:    applyAction(value, s.fnMode) })),
    }),
    {
      name: 'nest_ui_preferences',
      storage: createJSONStorage(() => localStorage),
      // Si conserva SOLO ciò che sopravvive al riavvio: un `data:` (l'immagine importata,
      // già ridotta) o il vuoto. Un `blob:` muore con la pagina e i `/wallpapers/*` non
      // esistono più — scriverli vorrebbe dire promettere uno sfondo che al riavvio non c'è.
      partialize: (state) => ({
        isLightTheme: state.isLightTheme,
        uiAlpha: state.uiAlpha,
        wallpaperUrl: isPersistableWallpaper(state.wallpaperUrl) ? state.wallpaperUrl : '',
      }),
      // v4: tolti i fondi in dotazione. Chi ne aveva scelto uno ricade sul predefinito.
      version: 4,
      migrate: (persisted, _fromVersion) => {
        const safe = persisted as Partial<UiState> | undefined;
        return {
          isLightTheme: typeof safe?.isLightTheme === 'boolean' ? safe!.isLightTheme : false,
          wallpaperUrl: isPersistableWallpaper(safe?.wallpaperUrl) ? safe!.wallpaperUrl : '',
          uiAlpha: typeof safe?.uiAlpha === 'number' ? safe!.uiAlpha : 1,
        } as UiState;
      },
      // Merge persisted over defaults for ALL persisted keys (the old merge only
      // restored isLightTheme → it silently dropped uiAlpha and wallpaperUrl).
      merge: (persisted, current) => {
        const safe = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          isLightTheme: typeof safe.isLightTheme === 'boolean' ? safe.isLightTheme : current.isLightTheme,
          uiAlpha: typeof safe.uiAlpha === 'number' ? safe.uiAlpha : current.uiAlpha,
          wallpaperUrl: isPersistableWallpaper(safe.wallpaperUrl) ? safe.wallpaperUrl : current.wallpaperUrl,
        };
      },
      // Final safety net — after rehydration, if the in-memory state ended up
      // non-boolean (e.g. residual from a tab that never reloaded), snap to
      // dark mode so the toggle remains operable.
      onRehydrateStorage: () => (state) => {
        if (state && typeof state.isLightTheme !== 'boolean') {
          state.isLightTheme = false;
        }
      },
    },
  ),
);
