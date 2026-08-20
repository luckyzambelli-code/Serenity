/**
 * serenityModuleStore — quali moduli SERENITY mostra, persistito per conto suo.
 *
 * ── PERCHÉ NON `store/layoutStore.ts` ────────────────────────────────────────────────────────
 * `useLayoutStore` è la STESSA istanza che EQUILIBRIUM usa per i suoi sette moduli — stesso
 * `localStorage` (`nest_layout_preferences`), stesso archivio unico del progetto. Riusarla qui
 * spegnerebbe la CAM 2 di EQUILIBRIUM quando l'auditor spegne quella di SERENITY, o viceversa:
 * due applicazioni con un solo interruttore per moduli che, di fatto, non sono nemmeno gli
 * stessi (SERENITY oggi ha solo le due camere — vedi sotto). Un archivio a parte
 * (`ser_module_vis`) evita l'accoppiamento senza duplicare NESSUNA logica: è lo stesso identico
 * schema di stato, solo un'istanza propria.
 *
 * ── SETTE CHIAVI REALI, ORA ──────────────────────────────────────────────────────────────────
 * `mna` è stato il primo dei quattro rimasti a diventare reale (`PannelloMna.tsx`); segnalato
 * di nuovo: « integra anche il journal de session, Santé Système, Assessement, integrità
 * biometrica » — gli ultimi quattro hanno ORA anche loro il proprio cassetto/zona
 * (`Serenity.tsx`: il bottone "salute sistema" + `HealthPanel`, il bottone del giornale +
 * la sua lista, `ZonaAssessment`, `LetturaIntegrita`). La STRUTTURA dei sette moduli di
 * EQUILIBRIUM ora corrisponde per intero — nessuna voce spenta e non toccabile rimasta.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SerenityModuleVis {
  cam1: boolean;
  cam2: boolean;
  mna: boolean;
  journal: boolean;
  health: boolean;
  ri: boolean;
  biometric: boolean;
}

export const SERENITY_MODULES_DEFAULT: SerenityModuleVis = {
  cam1: true, cam2: true, mna: true, journal: true, health: true, ri: true, biometric: true,
};

type SetStateAction<T> = T | ((prev: T) => T);
function applica<T>(azione: SetStateAction<T>, attuale: T): T {
  return typeof azione === 'function' ? (azione as (p: T) => T)(attuale) : azione;
}

interface SerenityModuleState {
  moduleVis: SerenityModuleVis;
  setModuleVis: (v: SetStateAction<SerenityModuleVis>) => void;
}

export const useSerenityModuleStore = create<SerenityModuleState>()(
  persist(
    set => ({
      moduleVis: SERENITY_MODULES_DEFAULT,
      setModuleVis: v => set(s => ({ moduleVis: applica(v, s.moduleVis) })),
    }),
    { name: 'ser_module_vis', storage: createJSONStorage(() => localStorage) },
  ),
);
