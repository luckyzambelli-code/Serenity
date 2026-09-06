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
import { parseConnectionLink } from '../lib/networkManager';
import Serenity from './Serenity';

/**
 * ⚠️ AGGIUNTO — segnalato dal vivo: aprendo il link/QR di `Connessione` (fase 7) sul telefono
 * del PC, compariva « CHI AUDISCE? » — la PRIMA domanda di SERENITY — invece della sessione in
 * corso. Causa trovata leggendo `server-core.cjs`: da un giro passato (« fai in modo che
 * 127.0.0.1:7893 sia SERENITY »), la radice del tunnel serve QUESTA pagina quando gira
 * Serenity.app — non più `index.html` (EQUILIBRIUM) come `Connessione.tsx` dava per scontato
 * nel suo commento (« il preclear ritrova lo stesso ParticipantView già collaudato »),
 * mai aggiornato dopo quel giro). SERENITY stessa non ha (e non deve avere — « nessun ramo
 * PC/satellite da gestire », la sua stessa regola) alcuna logica che riconosca un link
 * d'invito: senza questo controllo, un telefono che lo apre monta semplicemente l'interfaccia
 * dell'AUDITOR, che quel telefono non è.
 *
 * Il server NON può instradare lui stesso in base a questo — il frammento dell'URL (`#...`)
 * non viaggia mai fino a lui, resta solo nel browser che l'ha caricato: la distinzione « è un
 * invito o una visita normale » si può fare SOLO qui, lato client, prima ancora di montare
 * Serenity. Il controllo è lo stesso di `App.tsx` (`autoJoinDoneRef`) — `parseConnectionLink`
 * riconosce un invito valido — così le due applicazioni restano d'accordo su cosa sia un link:
 * se lo È, si passa semplicemente la mano a EQUILIBRIUM con una navigazione vera
 * (`window.location.href`, non un `import()`): stessa origine, stesso tunnel, il frammento
 * resta attaccato all'URL perché fa parte della STESSA assegnazione. Nessuna duplicazione di
 * `ParticipantView`, esattamente come voleva il commento originale di `Connessione.tsx`.
 */
const framm = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '';
const invito = framm ? parseConnectionLink(`${window.location.host}#${framm}`) : null;
if (invito?.peerId) {
  window.location.href = '/index.html' + window.location.hash;
} else {
  createRoot(document.getElementById('serenity')!).render(
    <StrictMode>
      <I18nProvider><Serenity /></I18nProvider>
    </StrictMode>
  );
}
