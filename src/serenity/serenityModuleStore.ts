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
 * ── PERCHÉ SOLO TRE CHIAVI REALI ─────────────────────────────────────────────────────────────
 * `journal`, `health`, `ri`, `biometric` non hanno ancora un pannello in SERENITY (fase 6 in
 * corso — vedi le note "NON C'È ANCORA" in `Serenity.tsx`). Un interruttore che non accende
 * niente sarebbe un controllo bugiardo. `PannelloConfig.tsx` li mostra comunque, spenti e non
 * toccabili — la STRUTTURA dei sette moduli di EQUILIBRIUM resta leggibile, e ognuno prende vita
 * qui il giorno in cui il suo pannello esiste, senza dover ridisegnare la lista. `mna` è il
 * primo dei cinque a diventare reale — `PannelloMna.tsx`.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SerenityModuleVis {
  cam1: boolean;
  cam2: boolean;
  mna: boolean;
}

export const SERENITY_MODULES_DEFAULT: SerenityModuleVis = { cam1: true, cam2: true, mna: true };

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
