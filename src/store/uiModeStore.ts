import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ModuleId, UiLevel } from '../ui/moduleRegistry';
import type { SessionPhase } from '../engine/sessionPhase';

/**
 * uiModeStore — IL LIVELLO, e le deroghe dell'auditor.
 *
 * Destinato a sostituire `layoutStore.moduleVis`, che oggi tiene sette interruttori tutti accesi
 * per difetto. Qui non ci sono interruttori per modulo: c'è un LIVELLO — che è la domanda vera
 * (« quanto vuoi vedere? ») invece di sette domande separate a cui nessuno ha voglia di
 * rispondere — più le deroghe prese al volo in seduta.
 *
 * ── PERCHÉ `pinned` E `muted` SI SVUOTANO AL CAMBIO DI FASE ─────────────────────────────────
 * Perché sono decisioni di UN momento del lavoro. « Adesso voglio vedere il journal » vale
 * adesso; portarselo dietro fino alla fine della seduta rifarebbe il difetto che si sta
 * togliendo — una schermata che si riempie e non si svuota più. Il livello invece si conserva:
 * quello è un modo di lavorare, non un gesto.
 *
 * Non è ancora collegato: `layoutStore` continua a governare. Vedi `ui/visibleSet.ts`.
 */

interface UiModeState {
  /** Persistito: è un modo di lavorare. */
  level: UiLevel;
  /** Volatili: valgono per la fase in corso. */
  pinned: Set<ModuleId>;
  muted:  Set<ModuleId>;
  /** L'ultima fase vista — serve solo a sapere QUANDO svuotare le deroghe. */
  lastPhase: SessionPhase | null;

  setLevel:  (l: UiLevel) => void;
  /** L'auditor apre un modulo: vince sull'automatismo. */
  pin:       (id: ModuleId) => void;
  /** L'auditor chiude un modulo: resta chiuso. */
  mute:      (id: ModuleId) => void;
  /** Torna alla decisione automatica per quel modulo. */
  clear:     (id: ModuleId) => void;
  /** Da chiamare a ogni tick con la fase corrente: svuota le deroghe quando cambia. */
  syncPhase: (p: SessionPhase) => void;
}

export const useUiModeStore = create<UiModeState>()(
  persist(
    (set) => ({
      level: 'normal',
      pinned: new Set<ModuleId>(),
      muted:  new Set<ModuleId>(),
      lastPhase: null,

      setLevel: (l) => set({ level: l }),

      pin:  (id) => set((s) => {
        const pinned = new Set(s.pinned); pinned.add(id);
        const muted  = new Set(s.muted);  muted.delete(id);
        return { pinned, muted };
      }),
      mute: (id) => set((s) => {
        const muted  = new Set(s.muted);  muted.add(id);
        const pinned = new Set(s.pinned); pinned.delete(id);
        return { pinned, muted };
      }),
      clear: (id) => set((s) => {
        const pinned = new Set(s.pinned); pinned.delete(id);
        const muted  = new Set(s.muted);  muted.delete(id);
        return { pinned, muted };
      }),

      syncPhase: (p) => set((s) => {
        if (s.lastPhase === p) return s;
        // Fase nuova → deroghe azzerate. Allocare due Set vuoti a ogni cambio di fase è
        // trascurabile: una fase cambia qualche volta al minuto, non a ogni tick.
        return { lastPhase: p, pinned: new Set<ModuleId>(), muted: new Set<ModuleId>() };
      }),
    }),
    {
      name: 'nest_ui_mode',
      storage: createJSONStorage(() => localStorage),
      // Solo il livello: `pinned`/`muted` sono deroghe del momento, e `lastPhase` non
      // significa niente al riavvio (i Set non sono nemmeno serializzabili in JSON).
      partialize: (s) => ({ level: s.level }),
      version: 1,
      merge: (persisted, current) => {
        const safe = (persisted ?? {}) as Partial<UiModeState>;
        // 'essential'/'standard' erano i livelli della prima stesura a tre: ricadono su
        // 'normal', che è ciò che entrambi volevano dire.
        const ok = safe.level === 'normal' || safe.level === 'expert';
        return { ...current, level: ok ? safe.level! : current.level };
      },
    },
  ),
);
