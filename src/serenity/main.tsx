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
import { VistaPartecipante } from './VistaPartecipante';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { installCrashGuard } from '../lib/crashGuard';

// ⚠️ AGGIUNTI — mancavano DEL TUTTO, segnalati nella revisione completa del codice di SERENITY:
// `src/main.tsx` (EQUILIBRIUM) li monta entrambi da sempre, questo file no. Senza
// `ErrorBoundary`, un errore di rendering non gestito in `Serenity.tsx` (7000+ righe, 51 effetti,
// nessun test) o in `VistaPartecipante.tsx` faceva sparire l'intera interfaccia a schermo bianco
// — in seduta, senza nessun modo di recuperare senza riavviare l'app. Senza `installCrashGuard`,
// nemmeno gli errori FUORI dal render di React (una promise non gestita, un callback asincrono)
// finivano da qualche parte — sparivano in silenzio invece di finire nel registro che
// `ErrorBoundary` stessa legge per il bottone "Copia il dettaglio".
installCrashGuard();

/**
 * ⚠️ RISCRITTO — segnalato dal vivo, con insistenza crescente: « non deve più esserci
 * EQUILIBRIUM sul telefonino — d'ora in poi solo SERENITY deve esistere ». Fino a qui, un
 * telefono che apriva il link/QR di `Connessione` (fase 7) veniva rimandato a `index.html`
 * (EQUILIBRIUM) con `window.location.href` — corretto un giro fa per il sintomo immediato
 * (« CHI AUDISCE? » invece della seduta), ma restava una dipendenza vera: il codice che il
 * telefono eseguiva era, letteralmente, quello di EQUILIBRIUM (`ParticipantView.tsx`,
 * `App.tsx`), non una copia — la SOLA implementazione esistente di quella schermata.
 *
 * `VistaPartecipante.tsx` (fase 9) È quell'implementazione dentro SERENITY: stesso protocollo
 * via dati, stessa logica di connessione/trascrizione/stato-seduta (`useParticipantSession.ts`,
 * il suo hook gemello — verificato riga per riga contro `App.tsx`), disegnata con la grafica di
 * SERENITY. Il frammento dell'URL (`#peerId:relayToken:peerKey[:sat[:lang]]`) non arriva mai al
 * server (resta solo nel browser che l'ha caricato) — la distinzione « è un invito o una visita
 * normale » resta possibile SOLO qui, lato client, prima ancora di decidere quale albero React
 * montare: esattamente come già faceva il rimando a EQUILIBRIUM, solo che ora la mano non passa
 * più a un'altra applicazione — resta dentro SERENITY dall'inizio alla fine.
 */
const framm = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '';
// ⚠️ `linkCompleto` (host#frammento), non SOLO il frammento — `parseConnectionLink` pretende
// SEMPRE la parte host prima del `#` (è così che distingue un LAN da un tunnel remoto).
// `VistaPartecipante` deve ricevere lo STESSO formato completo che poi passerà di nuovo a
// `parseConnectionLink` dentro `useParticipantSession.connetti()` — non il solo frammento.
const linkCompleto = framm ? `${window.location.host}#${framm}` : '';
const invito = framm ? parseConnectionLink(linkCompleto) : null;

const linguaInvito = invito?.lang && ['en', 'fr', 'it', 'es', 'sv'].includes(invito.lang)
  ? (invito.lang as 'en' | 'fr' | 'it' | 'es' | 'sv') : undefined;

createRoot(document.getElementById('serenity')!).render(
  <StrictMode>
    <ErrorBoundary brand="SERENITY">
      <I18nProvider>
        {invito?.peerId
          ? <VistaPartecipante linkIniziale={linkCompleto} linguaInvito={linguaInvito} />
          : <Serenity />}
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>
);
