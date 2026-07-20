import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * layoutStore — module visibility + saved layouts.
 *
 * Phase B step 4: replaces the `useLayoutManager` hook with a Zustand
 * store. Same data, same actions, same persistence — but consumers can
 * read with selector granularity and no prop drilling.
 *
 *   • moduleVis      — which panels are visible (persisted)
 *   • savedLayouts   — user-defined named visibility presets (persisted)
 *   • newLayoutName  — UI-only text-input draft (NOT persisted)
 *
 * Persisted under `nest_layout_preferences`. The legacy keys
 * `nest_module_vis` and `nest_layouts` are migrated on first boot of v2
 * so users don't lose their saved layouts.
 *
 * Setter signatures use React-style `SetStateAction<T>` so the existing
 * call sites that did `setModuleVis(v => ({ ...v, journal: false }))`
 * keep working without modification.
 */

// ── Types (re-exported for back-compat with the legacy hook) ───────────────
export interface ModuleVisibility {
  journal:   boolean;
  health:    boolean;
  cam1:      boolean;
  cam2:      boolean;
  ri:        boolean;
  biometric: boolean;
  mna:       boolean;
}

export interface SavedLayout {
  id:        string;
  name:      string;
  modules:   ModuleVisibility;
  createdAt: number;
}

export const DEFAULT_MODULES: ModuleVisibility = {
  journal: true, health: true, cam1: true, cam2: true,
  ri: true, biometric: true, mna: true,
};

// ── Setter helpers ─────────────────────────────────────────────────────────
type SetStateAction<T> = T | ((prev: T) => T);
function applyAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (p: T) => T)(current) : action;
}

// ── Store ──────────────────────────────────────────────────────────────────
interface LayoutState {
  moduleVis:     ModuleVisibility;
  savedLayouts:  SavedLayout[];
  newLayoutName: string;

  // Setters with React-style updater support
  setModuleVis:     (v: SetStateAction<ModuleVisibility>) => void;
  setNewLayoutName: (n: SetStateAction<string>)           => void;

  // Higher-level actions (same API as the legacy hook)
  saveLayout:   (name: string) => void;
  loadLayout:   (layout: SavedLayout) => void;
  deleteLayout: (id: string) => void;
  resetModules: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      moduleVis:     DEFAULT_MODULES,
      savedLayouts:  [],
      newLayoutName: '',

      setModuleVis:     (v) => set((s) => ({ moduleVis:     applyAction(v, s.moduleVis) })),
      setNewLayoutName: (n) => set((s) => ({ newLayoutName: applyAction(n, s.newLayoutName) })),

      saveLayout: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((s) => {
          const layout: SavedLayout = {
            id:        Date.now().toString(),
            name:      trimmed,
            modules:   { ...s.moduleVis },
            createdAt: Date.now(),
          };
          return {
            savedLayouts:  [...s.savedLayouts, layout],
            newLayoutName: '',
          };
        });
      },

      loadLayout: (layout) =>
        set(() => ({ moduleVis: { ...DEFAULT_MODULES, ...layout.modules } })),

      deleteLayout: (id) =>
        set((s) => ({ savedLayouts: s.savedLayouts.filter((l) => l.id !== id) })),

      resetModules: () => set({ moduleVis: DEFAULT_MODULES }),
    }),
    {
      name:    'nest_layout_preferences',
      storage: createJSONStorage(() => localStorage),
      // Persist moduleVis + savedLayouts only. `newLayoutName` is a UI draft
      // that has no value to keep across reloads.
      partialize: (state) => ({
        moduleVis:    state.moduleVis,
        savedLayouts: state.savedLayouts,
      }),
      version: 1,
      // One-shot migration from the legacy hook's separate localStorage keys
      // (`nest_module_vis` and `nest_layouts`). Runs only when the
      // `nest_layout_preferences` key doesn't yet exist for this user.
      migrate: (persisted, _from) => {
        const safe = persisted as Partial<LayoutState> | undefined;
        let moduleVis    = safe?.moduleVis    ?? DEFAULT_MODULES;
        let savedLayouts = safe?.savedLayouts ?? [];
        try {
          // Pick up legacy data only if we have no persisted state of our own.
          if (!safe?.moduleVis) {
            const legacy = localStorage.getItem('nest_module_vis');
            if (legacy) moduleVis = { ...DEFAULT_MODULES, ...JSON.parse(legacy) };
          }
          if (!safe?.savedLayouts) {
            const legacy = localStorage.getItem('nest_layouts');
            if (legacy) savedLayouts = JSON.parse(legacy);
          }
        } catch { /* ignore — fall back to defaults */ }
        return { moduleVis, savedLayouts } as LayoutState;
      },
      // Belt & braces: coerce anything weird that survived from a buggy
      // prior version (mirrors the pattern used by uiStore).
      merge: (persisted, current) => {
        const safe = persisted as Partial<LayoutState> | undefined;
        return {
          ...current,
          moduleVis:    typeof safe?.moduleVis === 'object'  && safe?.moduleVis    ? { ...DEFAULT_MODULES, ...safe.moduleVis } : current.moduleVis,
          savedLayouts: Array.isArray(safe?.savedLayouts) ? safe!.savedLayouts : current.savedLayouts,
        };
      },
    },
  ),
);
