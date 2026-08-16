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
 * @see docs/refonte-fasi.md
 */

import { useEffect, useRef, useState } from 'react';
import { sessionClock } from '../runtime/SessionClock';
import { useThetaMeter } from '../hooks/useThetaMeter';
import { SET_OFFSET } from '../engine/dialGeometry';
import { THETA_LABEL_AFTER_MS } from '../engine/tuning';
import { QuantumSphere } from '../components/QuantumSphere';
import { useSessionJournal } from '../session/useSessionJournal';
import { getProfiles, getPcProfiles } from '../lib/storage';
import { Cerchio } from './Cerchio';
import { Avvio } from './Avvio';
import { AVVIO_VUOTO, type Avvio as StatoAvvio } from './flussoAvvio';
import { useI18n } from '../i18n';

/** mm:ss — l'unico formato di tempo che serve in seduta. */
const orologio = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export default function Serenity() {
  const { t } = useI18n();
  const journal = useSessionJournal('SERENITY');
  const [aperta, setAperta] = useState(false);
  const [tempo, setTempo] = useState(0);
  /** Le quattro risposte dell'avvio. `null` = le domande non sono ancora state fatte. */
  const [avvio, setAvvio] = useState<StatoAvvio | null>(null);

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
    setAperta(true);
  };
  const chiudi = () => {
    sessionClock.end();
    journal.addLog({ speaker: 'SYS', text: t('ser_session_closed'), time: sessionClock.now() });
    setAperta(false);
  };
  /** Si ricomincia dalle domande. Solo a seduta chiusa: cambiare preclear a metà seduta
   *  vorrebbe dire attribuire a una persona quel che ha fatto un'altra. */
  const ricomincia = () => setAvvio(null);

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
        {/* Chi audita, chi si audita, e dove — detto in una riga sola e in grigio: sono cose
            che si controllano una volta all'inizio, non che si guardano in seduta. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {nomeAuditor}{avvio.solo ? ` · ${t('ser_alone_tag')}` : ` · ${nomePreclear}`}
          {avvio.distanza ? ` · ${t('ser_remote_tag')}` : ''}{avvio.esperto ? ` · ${t('ser_expert_tag')}` : ''}
        </span>
      </header>

      {/* ── IL CAMPO ──────────────────────────────────────────────────────────────────────
          Un cerchio grande al centro — è il posto dell'ago, e resta vuoto finché l'ago non
          arriva (fase 5). Intorno, i cerchi che diventeranno i moduli: compaiono quando
          servono e si ritirano quando non servono più, ed è per questo che non hanno una
          griglia. Qui sono spenti: il guscio non ha ancora nulla da dire. */}
      <section style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
        {/* IL METER AL CENTRO. Il cerchio grande è il suo posto: l'ago sta lì, e tutto il
            resto della seduta gli gira intorno. Senza meter il quadrante resta comunque —
            spento, all'ago di riposo — perché uno strumento che sparisce quando si stacca
            fa credere di averlo perso invece che scollegato. */}
        <Cerchio dimensione={340} viva={aperta}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
            {/* ── IL QUADRANTE È LO STESSO DI EQUILIBRIUM ─────────────────────────────────
                Non un secondo disegno degli stessi angoli: LO STESSO COMPONENTE, con
                `forceLightTheme` perché SERENITY è sempre a fondo chiaro senza toccare la
                preferenza di tema (condivisa con EQUILIBRIUM in localStorage).

                `thetaOffset={null}` quando il meter è scollegato: l'ago allora NON SI
                DISEGNA, invece di restare fermo su SET a sembrare vero — è la stessa regola
                che EQUILIBRIUM applica già (vedi il commento sul prop in QuantumSphere). */}
            <div style={{ width: 250, height: 250 }}>
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
                forceLightTheme
              />
            </div>
            {/* L'orologio scende sotto l'ago e si fa piccolo: il tempo di seduta si guarda
                una volta ogni tanto, l'ago in continuazione. */}
            <span style={{
              fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.06em',
              color: aperta ? 'var(--s-ink-soft)' : 'var(--s-ink-ghost)',
              transition: 'color var(--s-slow) var(--s-ease)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {orologio(tempo)}
            </span>
          </div>
        </Cerchio>

        <Cerchio dimensione={78} x={-250} y={-96} ritardo={0}   spenta />
        <Cerchio dimensione={62} x={252}  y={-124} ritardo={180} spenta />
        <Cerchio dimensione={92} x={228}  y={112}  ritardo={360} spenta />
        <Cerchio dimensione={54} x={-232} y={132}  ritardo={540} spenta />
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
