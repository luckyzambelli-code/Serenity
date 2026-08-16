/**
 * L'ingresso di SERENITY. Deliberatamente nudo: tutto ciò che l'applicazione sa fare sta in
 * `Serenity.tsx`, e tutto ciò che sa DI AUDITING sta in `src/engine` e `src/session`, condivisi
 * con EQUILIBRIUM. Se un giorno questo file crescesse, sarebbe il segno che sta ricomparendo un
 * secondo controllore di sessione.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import Serenity from './Serenity';

createRoot(document.getElementById('serenity')!).render(
  <StrictMode><Serenity /></StrictMode>
);
