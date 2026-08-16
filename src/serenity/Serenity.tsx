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
import { Ago } from './Ago';
import { useSessionJournal } from '../session/useSessionJournal';
import { getProfiles, getPcProfiles } from '../lib/storage';
import { Cerchio } from './Cerchio';
import { Avvio } from './Avvio';
import { AVVIO_VUOTO, type Avvio as StatoAvvio } from './flussoAvvio';

/** mm:ss — l'unico formato di tempo che serve in seduta. */
const orologio = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export default function Serenity() {
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
   */
  const [vivo, setVivo] = useState(false);
  const spegniRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theta = useThetaMeter({
    nowSec: () => sessionClock.now(),
    // L'ago « vivo » è l'unico momento in cui il colore compare. Si accende all'inizio del
    // movimento e si spegne poco DOPO che è rientrato: sparire nell'istante del rientro
    // toglierebbe la conferma proprio a chi ha alzato gli occhi un attimo tardi.
    onReaction: r => {
      setVivo(true);
      if (spegniRef.current) { clearTimeout(spegniRef.current); spegniRef.current = null; }
      if (r.final) spegniRef.current = setTimeout(() => setVivo(false), 1200);
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
    journal.resetJournal('seduta aperta');
    setAperta(true);
  };
  const chiudi = () => {
    sessionClock.end();
    journal.addLog({ speaker: 'SYS', text: 'seduta chiusa', time: sessionClock.now() });
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
          {nomeAuditor}{avvio.solo ? ' · da solo' : ` · ${nomePreclear}`}
          {avvio.distanza ? ' · a distanza' : ''}{avvio.esperto ? ' · esperto' : ''}
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
          <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
            <Ago
              offset={meterC ? theta.offset : SET_OFFSET}
              vivo={meterC && vivo}
              fn={meterC && theta.fn.fn}
              ta={meterC ? theta.ta : null}
              larghezza={250}
            />
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
          {aperta ? 'chiudi' : 'apri una seduta'}
        </button>
        {/* Il giornale NON si mostra: scorrere alla periferia tira l'occhio proprio mentre
            l'ago legge. Qui si dice solo che sta scrivendo, e quante righe ha. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          giornale · {journal.logs.length} {journal.logs.length === 1 ? 'riga' : 'righe'}
        </span>
        {/* Lo stato del meter si dice a parole e in grigio: è una cosa che si controlla
            all'inizio, non che si sorveglia in seduta. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {meterC ? 'meter collegato' : theta.unavailable ? 'meter non disponibile qui' : 'meter scollegato'}
        </span>
        <span style={{ flex: 1 }} />
        {!aperta && (
          <button onClick={ricomincia} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
          }}>
            ← cambia auditor o preclear
          </button>
        )}
      </footer>
    </main>
  );
}
