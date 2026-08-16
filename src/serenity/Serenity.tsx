/**
 * SERENITY — il guscio.
 *
 * ── CHE COS'È, E CHE COSA NON È ─────────────────────────────────────────────────────────────
 * Fase 3 della refonte: la SECONDA applicazione esiste, si apre, e gira sullo STESSO MOTORE.
 * Non è ancora un'interfaccia di seduta — non c'è l'ago, non ci sono i cicli, non c'è il
 * giornale a schermo. Quelli arrivano nelle fasi 5, 6 e 8.
 *
 * Quel che questo guscio deve DIMOSTRARE, e dimostra:
 *   • che una seconda superficie può montarsi su `src/engine` e `src/session` senza copiarne
 *     una riga — l'orologio qui sotto è `runtime/SessionClock`, lo stesso che conta i secondi
 *     in EQUILIBRIUM, e il giornale è `session/useSessionJournal`, non un secondo giornale;
 *   • che l'archivio è UNO SOLO: i profili elencati qui sono quelli di EQUILIBRIUM, letti
 *     dallo stesso `lib/storage`. Se ne compare uno, le due applicazioni guardano lo stesso
 *     armadio — che è la verifica scritta nel piano per questa fase.
 *
 * ⚠️ ZERO LOGICA DI AUDITING. Nessuna soglia, nessuna reazione, nessuna decisione. Se un giorno
 * una regola di auditing comparisse in questo file, sarebbe la prova che la refonte ha fallito:
 * vorrebbe dire che la stessa regola vive in due posti e che i due potranno divergere.
 *
 * @see docs/serenity-refonte.md
 */

import { useEffect, useRef, useState } from 'react';
import { sessionClock } from '../runtime/SessionClock';
import { useThetaMeter } from '../hooks/useThetaMeter';
import { SET_OFFSET } from '../engine/dialGeometry';
import { THETA_LABEL_AFTER_MS } from '../engine/tuning';
import { QuantumSphere } from '../components/QuantumSphere';
import { useSessionJournal } from '../session/useSessionJournal';
import { getProfiles, getPcProfiles } from '../lib/storage';
import { Avvio } from './Avvio';
import { AVVIO_VUOTO, type Avvio as StatoAvvio } from './flussoAvvio';
import { useI18n } from '../i18n';
import { useUiStore } from '../store/uiStore';
import { SelettoreLingua, SelettoreTema } from './Impostazioni';
import { useRemoteSession } from '../hooks/useRemoteSession';
import { Connessione } from './Connessione';

/** mm:ss — l'unico formato di tempo che serve in seduta. */
const orologio = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export default function Serenity() {
  const { t, lang } = useI18n();
  // ⚠️ STESSA PREFERENZA DI EQUILIBRIUM — non uno stato di SERENITY. Segnalato: « toutes les
  // fonctionnalités de EQUILIBRIUM ». `isLightTheme` è la stessa chiave che governa
  // `GlassThemeToggle`, stesso `localStorage`: cambiarla qui la cambia anche di là.
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const journal = useSessionJournal('SERENITY');
  const [aperta, setAperta] = useState(false);
  const [tempo, setTempo] = useState(0);
  /** Le quattro risposte dell'avvio. `null` = le domande non sono ancora state fatte. */
  const [avvio, setAvvio] = useState<StatoAvvio | null>(null);
  /** Si è passati OLTRE la schermata di connessione? Un flag a parte, non `remote.isConnected`
   *  direttamente: un blip di rete a metà seduta non deve risbattere l'auditor sulla schermata
   *  del link — la connessione può cadere e riprendersi, la seduta resta aperta lo stesso. */
  const [collegato, setCollegato] = useState(false);
  const remote = useRemoteSession({
    lang,
    onTrascrizione: testo => journal.addLog({ speaker: 'PC', text: testo, time: sessionClock.now() }),
  });

  // L'orologio è QUELLO DI EQUILIBRIUM: `sessionClock` è un modulo unico, e conta i secondi
  // fuori da React perché il ridisegno non deve poter far perdere un secondo di seduta.
  useEffect(() => sessionClock.subscribe(() => setTempo(sessionClock.now())), []);

  /**
   * ── IL METER, LO STESSO ─────────────────────────────────────────────────────────────────
   * `useThetaMeter` è il modulo che EQUILIBRIUM usa da sempre: driver WebHID, modello
   * dell'ago, TA, reazioni, F/N. Qui non si aggiunge NIENTE — si legge e si disegna.
   *
   * ── E L'ETICHETTA DELLA REAZIONE, con lo STESSO ciclo di vita ────────────────────────────
   * `thetaReactionKey` è la copia esatta di come App.tsx alimenta il quadrante: si accende al
   * verdetto e resta finché l'ago sta ancora scendendo; al verdetto FINALE (`r.final`) si tiene
   * ancora `THETA_LABEL_AFTER_MS` — il tempo di leggerla — poi si spegne. Stessa costante,
   * stesso comportamento: è QuantumSphere stesso a leggere questa chiave e a colorarsi.
   */
  const [thetaReactionKey, setThetaReactionKey] = useState('');
  const spegniRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theta = useThetaMeter({
    nowSec: () => sessionClock.now(),
    onReaction: r => {
      setThetaReactionKey(r.key);
      if (spegniRef.current) { clearTimeout(spegniRef.current); spegniRef.current = null; }
      if (r.final) spegniRef.current = setTimeout(() => setThetaReactionKey(''), THETA_LABEL_AFTER_MS);
    },
  });
  useEffect(() => () => { if (spegniRef.current) clearTimeout(spegniRef.current); }, []);
  const meterC = theta.status === 'connected';

  // I profili vengono dallo stesso armadio di EQUILIBRIUM — è la verifica di questa fase.
  const nome = (lista: Array<{ id: string; name: string }>, id: string | null | undefined) =>
    id === 'nuovo' ? 'nuovo' : (lista.find(p => p.id === id)?.name ?? '—');
  const nomeAuditor = nome(
    (() => { try { return getProfiles(); } catch { return []; } })(), avvio?.auditorId);
  const nomePreclear = nome(
    (() => { try { return getPcProfiles(); } catch { return []; } })(), avvio?.pcId);

  const apri = () => {
    sessionClock.reset(); sessionClock.start();
    journal.resetJournal(t('ser_session_opened'));
    // Il device del preclear si arma DA QUESTO pacchetto, non da un pulsante che lui preme —
    // stesso protocollo di App.tsx (`SESSION_STATE`).
    if (avvio?.distanza) remote.impostaStatoSeduta('running');
    setAperta(true);
  };
  const chiudi = () => {
    sessionClock.end();
    journal.addLog({ speaker: 'SYS', text: t('ser_session_closed'), time: sessionClock.now() });
    if (avvio?.distanza) remote.impostaStatoSeduta('ended');
    setAperta(false);
  };
  /** Si ricomincia dalle domande. Solo a seduta chiusa: cambiare preclear a metà seduta
   *  vorrebbe dire attribuire a una persona quel che ha fatto un'altra. Una seduta a distanza
   *  si chiude anche sulla rete — altrimenti il link resterebbe aperto per il PROSSIMO preclear
   *  scelto qui, che non è più chi era dall'altra parte. */
  const ricomincia = () => {
    if (avvio?.distanza) remote.disconnetti();
    setCollegato(false);
    setAvvio(null);
  };

  // ── LE QUATTRO DOMANDE, PRIMA DI TUTTO ────────────────────────────────────────────────
  // Non è una schermata di benvenuto che si può saltare: senza sapere chi audita e chi si
  // audita, una seduta non si può nemmeno archiviare — finirebbe senza nome.
  if (!avvio) {
    return (
      <main style={{ height: '100%', padding: '38px 44px' }}>
        <Avvio onPronto={setAvvio} />
      </main>
    );
  }

  // ── LA CONNESSIONE, PRIMA DELLA SEDUTA ────────────────────────────────────────────────────
  // Risposto « a distanza » a `dove`: non si entra nel campo finché il preclear non si è unito.
  // Non è un'attesa forzata — è la stessa ragione per cui EQUILIBRIUM tiene `ConnectionModal`
  // aperto finché isConnected non è vero: cominciare la seduta prima vorrebbe dire un ago che
  // aspetta dati che ancora non arrivano.
  if (avvio.distanza && !collegato) {
    return (
      <main style={{ height: '100%' }}>
        <Connessione
          remote={remote}
          onAnnulla={ricomincia}
          onPronti={() => setCollegato(true)}
        />
      </main>
    );
  }

  return (
    <main style={{
      height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto',
      padding: '38px 44px', gap: 24,
    }}>
      {/* ── L'INTESTAZIONE, che non è una barra ───────────────────────────────────────────
          Nessun fondo, nessuna linea di separazione: il nome sta posato sulla stessa
          superficie di tutto il resto. Una barra è già un pannello. */}
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 21, letterSpacing: '0.14em' }}>
          SERENITY
        </span>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-ink-faint)' }}>
          {__SERENITY_VERSION__}
        </span>
        <span style={{ flex: 1 }} />
        {/* ⚠️ SEGNALATO: « la langue doit pouvoir être changée en cours de route » — non solo
            alle quattro domande d'avvio. Stessi due selettori di `Avvio.tsx`, condivisi da
            `Impostazioni.tsx`: qui restano visibili per tutta la seduta, non solo prima. */}
        <SelettoreTema />
        <SelettoreLingua />
        {/* Chi audita, chi si audita, e dove — detto in una riga sola e in grigio: sono cose
            che si controllano una volta all'inizio, non che si guardano in seduta. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {nomeAuditor}{avvio.solo ? ` · ${t('ser_alone_tag')}` : ` · ${nomePreclear}`}
          {avvio.distanza ? ` · ${t('ser_remote_tag')}` : ''}{avvio.esperto ? ` · ${t('ser_expert_tag')}` : ''}
        </span>
        {/* Lo stato della RETE, detto a parole — non un badge colorato che chiama l'occhio: un
            blip di connessione non è un allarme, è un'informazione da controllare se serve. */}
        {avvio.distanza && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
            color: remote.isConnected ? 'var(--s-still)' : 'var(--s-reserve)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: remote.isConnected ? 'var(--s-still)' : 'var(--s-reserve)',
            }} />
            {remote.isConnected ? t('conn_badge_auditor_ok') : t('conn_badge_auditor_waiting')}
            {remote.isConnected && remote.remoteBatteryLevel !== null && ` · ${remote.remoteBatteryLevel}%`}
            {/* "MUSE ✓" non tradotto: stesso simbolo universale che usa il badge di App.tsx,
                non una frase — un segno di spunta non ha bisogno delle cinque lingue. */}
            {remote.isConnected && (remote.remoteMuseConnected ? ' · MUSE ✓' : ` · ${t('conn_muse_preclear_disconnected')}`)}
          </span>
        )}
      </header>

      {/* ── IL CAMPO ──────────────────────────────────────────────────────────────────────
          Lo strumento occupa lo spazio, come in EQUILIBRIUM — non è un modulo fra gli altri,
          è QUELLO su cui gli altri si dispongono. I quattro cerchi che diventeranno i moduli
          (fase 6+) restano ai bordi: compaiono quando servono, e per ora sono spenti. */}
      <section style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 0,
      }}>
        {/*
          ── LE STESSE DIMENSIONI, NON SOLO GLI STESSI COLORI ────────────────────────────
          Segnalato più volte di seguito: prima « stesso disegno, stessa grafica » (i colori),
          poi « lo schermo dell'arco è piccolo, devi avere le stesse dimensioni che in
          Equilibrium », infine « aiguilles avec light… le fond de l'arc doit pouvoir être
          blanc perle aussi ». Giusto: in EQUILIBRIUM il quadrante non è un cerchio fra i
          moduli — è `w-full h-full` del suo spazio. Qui niente `Cerchio`: la proporzione vera
          (1600×850) riempie lo spazio disponibile con `aspect-ratio`, esattamente come
          `w-full h-full` fa in EQUILIBRIUM — nessuna taglia inventata, quella che il momento
          concede.

          ── E IL TEMA NON È PIÙ FISSATO ────────────────────────────────────────────────────
          Nessun `forceTheme`: `QuantumSphere` legge la STESSA preferenza condivisa
          (`isLightTheme`, sopra) che governa `SelettoreTema`, senza bisogno di passargliela —
          è la sua lettura di sempre. Il PANNELLO che lo contiene segue la stessa preferenza:
            • SCURO  → il gradiente radiale autentico di EQUILIBRIUM (`AppBackground.tsx`),
              perché i colori chiari dell'ago in tema scuro sarebbero bianco su niente;
            • CHIARO → bianco perla, la superficie STESSA di SERENITY: in tema chiaro l'ago
              disegna già in inchiostro scuro (« STYLE B » del componente), leggibile sulla
              pagina senza bisogno di un pannello a parte — « le fond… blanc perle » è
              letteralmente questo, non un chiaro inventato apposta.
        */}
        <div style={{
          width: 'min(100%, 1400px)', aspectRatio: '1600 / 850', maxHeight: 'calc(100% - 44px)',
          borderRadius: 18, overflow: 'hidden',
          background: isLightTheme
            ? 'var(--s-ground)'
            : 'radial-gradient(130% 120% at 50% 22%, #2e2e33 0%, #2a2a2f 55%, #262629 100%)',
          boxShadow: isLightTheme ? 'var(--s-shadow)' : 'var(--s-shadow-lift)',
          transition: 'background var(--s-calm) var(--s-ease), box-shadow var(--s-calm) var(--s-ease)',
        }}>
          <QuantumSphere
            needleOffsetProp={SET_OFFSET}
            thetaOffset={meterC ? theta.offset : null}
            showEegNeedle={false}
            targetOffset={null}
            needleReactionKey={thetaReactionKey}
            asIsnessState="persist"
            onClick={theta.resetToSet}
            showTrail
            sessionState={aperta ? 'running' : 'idle'}
          />
        </div>
        {/* L'orologio resta sulla superficie di SERENITY, fuori dal pannello scuro: si
            guarda una volta ogni tanto, lo strumento in continuazione. */}
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.06em',
          color: aperta ? 'var(--s-ink-soft)' : 'var(--s-ink-ghost)',
          transition: 'color var(--s-slow) var(--s-ease)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {orologio(tempo)}
        </span>

        {/* ⚠️ I QUATTRO CERCHI SATELLITE (assessment, cycle hint, …) SONO STATI TOLTI DA QUI,
            non solo spenti. Erano posizionati per orbitare un cerchio centrale da 380 px; con
            lo strumento che ora occupa quasi tutta la larghezza, quelle stesse coordinate
            fisse li avrebbero messi ADDOSSO al pannello scuro invece che intorno. Tornano
            nella fase 6, quando avranno un vero contenuto e si potrà decidere dove stanno
            DAVVERO — accanto a un ingombro reale, non a una stima. */}
      </section>

      {/* ── IL GESTO ──────────────────────────────────────────────────────────────────────
          Uno solo. Il guscio sa fare una cosa: aprire e chiudere una seduta sull'orologio
          vero. Tutto il resto delle fasi si appende a questo. */}
      <footer style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={aperta ? chiudi : apri} style={{
          border: 'none', cursor: 'pointer',
          background: 'var(--s-disc)', color: 'var(--s-ink)',
          boxShadow: 'var(--s-shadow)',
          borderRadius: 999, padding: '11px 28px',
          fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
          fontFamily: 'var(--s-sans)',
          transition: `box-shadow var(--s-slow) var(--s-ease)`,
        }}>
          {aperta ? t('ser_close_session') : t('ser_open_session')}
        </button>
        {/* Il giornale NON si mostra: scorrere alla periferia tira l'occhio proprio mentre
            l'ago legge. Qui si dice solo che sta scrivendo, e quante righe ha. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {t('ser_journal')} · {journal.logs.length} {t(journal.logs.length === 1 ? 'ser_line' : 'ser_lines')}
        </span>
        {/* Lo stato del meter si dice a parole e in grigio: è una cosa che si controlla
            all'inizio, non che si sorveglia in seduta. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {t(meterC ? 'ser_meter_connected' : theta.unavailable ? 'ser_meter_unavailable' : 'ser_meter_disconnected')}
        </span>
        <span style={{ flex: 1 }} />
        {!aperta && (
          <button onClick={ricomincia} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
          }}>
            ← {t('ser_change_people')}
          </button>
        )}
      </footer>
    </main>
  );
}
