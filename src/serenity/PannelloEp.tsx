/**
 * PannelloEp — la validazione manuale dell'EP, in SERENITY.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * EQUILIBRIUM ha due componenti per l'EP: `EpValidationModal` (una finestra automatica a
 * conto alla rovescia) ed `EpManualModal` (la scheda che l'auditor apre da sé). La prima non è
 * mai raggiungibile in EQUILIBRIUM — `setShowEpValidation(true)` non viene chiamato da nessuna
 * parte del codice, è născuta morta — quindi qui non ha un equivalente: non si riproduce un
 * pezzo che l'originale stesso non usa. La seconda È il flusso vero, ed è questa che SERENITY
 * riprende.
 *
 * ── STESSO STATO, STESSA DECISIONE, GRAFICA PROPRIA ─────────────────────────────────────────
 * Ogni campo arriva da `hooks/useEpValidation` — lo STESSO hook di EQUILIBRIUM, non un secondo
 * stato. Validare fa esattamente le stesse quattro cose che fa in App.tsx: segna `epValidated`,
 * chiude il pannello, porta `asIsnessState` a `'ep'`, e scrive nel giornale una riga con la
 * reazione, la realizzazione del preclear, VGI/VVGI e la nota — nello stesso ordine.
 *
 * A tutta pagina, non una finestra sopra la seduta: stesso principio di `PannelloProfilo` e
 * `Connessione` — SERENITY non impila pannelli.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useI18n } from '../i18n';
import type { useEpValidation } from '../hooks/useEpValidation';

const REAZIONI = ['F/N (Floating)', 'LF Blow Down', 'Long Fall', 'Fall', 'SF'];

export function PannelloEp({ ep, onValidato }: {
  ep: ReturnType<typeof useEpValidation>;
  /** L'auditor ha validato — chi chiama sa già chiudere il pannello (via `ep.epManualOpen`). */
  onValidato: () => void;
}) {
  const { t } = useI18n();

  const valida = () => {
    ep.setEpValidated(true);
    ep.setEpManualOpen(false);
    ep.setEpWindowOpen(false);
    ep.setAsIsnessState('ep');
    onValidato();
  };

  const pillola = (attiva: boolean): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 20px',
    fontFamily: 'var(--s-sans)', fontSize: 13.5, letterSpacing: '0.06em',
    background: attiva ? 'var(--s-ink)' : 'var(--s-disc)',
    color: attiva ? 'var(--s-ground-warm)' : 'var(--s-ink-soft)',
    boxShadow: attiva ? 'none' : 'var(--s-shadow)',
    transition: 'background var(--s-slow) var(--s-ease), color var(--s-slow) var(--s-ease)',
  });
  const campo: React.CSSProperties = {
    border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
    outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink)',
    padding: '6px 4px', width: '100%',
  };
  const etichetta: React.CSSProperties = {
    fontFamily: 'var(--s-sans)', fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--s-ink-faint)', marginBottom: 6, display: 'block',
  };

  return (
    <section style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto',
                      alignItems: 'center', gap: 24, justifyItems: 'center', padding: '38px 44px' }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400, fontSize: 28,
                   color: 'var(--s-ink)' }}>
        {t('ep_modal_title')}
      </h1>

      <div style={{ display: 'grid', gap: 22, width: 'min(100%, 420px)' }}>
        <div>
          <label style={etichetta}>{t('ep_needle_reaction')}</label>
          <select value={ep.epReactionType} onChange={e => ep.setEpReactionType(e.target.value)}
            style={{ ...campo, cursor: 'pointer' }}>
            {REAZIONI.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label style={etichetta}>{t('ep_pc_realization')}</label>
          <textarea
            value={ep.epRealization} onChange={e => ep.setEpRealization(e.target.value)}
            placeholder={t('ep_realization_placeholder') as string}
            rows={3}
            style={{ ...campo, resize: 'none', fontFamily: 'var(--s-serif)', lineHeight: 1.6 }}
          />
        </div>

        {/* VGI/VVGI — a vicenda esclusiva, come in App.tsx: VVGI è il preclear troppo
            contento, indicatori ancora migliori di VGI. */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { ep.setEpVgi(v => !v); ep.setEpVvgi(false); }}
                  className="s-glass s-glass-btn"
                  style={pillola(ep.epVgi)}>
            {ep.epVgi ? '✓ VGI' : 'VGI'}
          </button>
          <button onClick={() => { ep.setEpVvgi(v => !v); ep.setEpVgi(false); }}
                  className="s-glass s-glass-btn"
                  style={pillola(ep.epVvgi)}>
            {ep.epVvgi ? '✓ VVGI' : 'VVGI'}
          </button>
        </div>

        <div>
          <label style={etichetta}>{t('ep_auditor_note_label')}</label>
          <input value={ep.epAuditorNote} onChange={e => ep.setEpAuditorNote(e.target.value)}
                 placeholder={t('ep_observations') as string} style={campo} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <button onClick={() => ep.setEpManualOpen(false)} style={{
          border: 'none', background: 'none', cursor: 'pointer',
          fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-faint)',
        }}>
          ← {t('cancel')}
        </button>
        <button onClick={valida} className="s-glass s-glass-btn" style={pillola(true)}>
          {t('ep_validate_btn')}
        </button>
      </div>
    </section>
  );
}
