/**
 * L'ingresso di SERENITY. Deliberatamente nudo: tutto ciò che l'applicazione sa fare sta in
 * `Serenity.tsx`, e tutto ciò che sa DI AUDITING sta in `src/engine` e `src/session`, condivisi
 * con EQUILIBRIUM. Se un giorno questo file crescesse, sarebbe il segno che sta ricomparendo un
 * secondo controllore di sessione.
 *
 * `I18nProvider` è qui per una ragione sola: il quadrante (`QuantumSphere`, fase 5) è LO STESSO
 * componente di EQUILIBRIUM e chiama `useI18n()` per le scritte SF / FALL / LONG FALL — senza
 * il provider genererebbe un errore, non un'etichetta vuota.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import './tailwind-compat.css';
import './historyLight.css';
import './modalCloseButtons.css';
import './readyCheckLight.css';
import './healthPanelButtons.css';
import { I18nProvider } from '../i18n';
import Serenity from './Serenity';

createRoot(document.getElementById('serenity')!).render(
  <StrictMode>
    <I18nProvider><Serenity /></I18nProvider>
  </StrictMode>
);
