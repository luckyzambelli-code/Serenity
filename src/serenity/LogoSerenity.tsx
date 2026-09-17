/**
 * LogoSerenity — il logo, il nome SERENITY con BASIC/EXPERT e la versione, il medaglione — il
 * primo pezzo staccato dall'intestazione di `Serenity.tsx`.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * L'intestazione (`<header>`) è 666 righe — troppo grande per staccarla in un colpo solo con la
 * stessa attenzione riservata a `ZonaCamere.tsx`/`GiornaleSeduta.tsx`/
 * `ColonnaSaluteAssessment.tsx` (v. `docs/serenity-refonte.md`). Si scompone quindi PIÙ A FONDO,
 * un pezzo alla volta: questo è il primo, il più semplice — puramente presentazionale, nessuno
 * stato centrale della seduta viene toccato (a differenza del popover "assetto" più avanti
 * nell'intestazione, che scrive `avvio` direttamente — quello resta un giro a sé).
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAppUpdater } from '../hooks/useAppUpdater';

export interface LogoSerenityProps {
  onApriCrediti: () => void;
  isLightTheme: boolean;
  /** L'avvio esiste già (le quattro domande sono finite) — dire BASIC/EXPERT prima sarebbe
   *  un'informazione inventata. */
  mostraLivello: boolean;
  /** `avvio?.esperto` — tri-stato: `undefined`/`null`/`false` si legge come BASIC. */
  esperto: boolean | null | undefined;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function LogoSerenity({ onApriCrediti, isLightTheme, mostraLivello, esperto, LC }: LogoSerenityProps) {
  const { t } = useI18n();
  // ⚠️ AGGIUNTO — segnalato: « non sarebbe bello includere un pulsante VERIFICARE
  // AGGIORNAMENTO? ». V. `useAppUpdater.ts` per il perché (il controllo automatico partiva
  // una sola volta all'avvio, senza riscontro visibile). `disponibile` è `false` fuori da
  // Electron (preview browser, ParticipantView remoto) — lì il pulsante non compare
  // affatto, invece di comparire per poi non fare nulla.
  const { disponibile, stato, percentuale, verifica } = useAppUpdater();
  const testoStato = stato === 'verifica'
    ? LC('verifica…', 'vérification…', 'checking…', 'comprobando…', 'kontrollerar…')
    : stato === 'aggiornato'
    ? LC('già aggiornato', 'déjà à jour', 'up to date', 'ya actualizado', 'redan uppdaterad')
    : stato === 'trovato'
    ? LC('nuova versione trovata', 'nouvelle version trouvée', 'new version found', 'nueva versión encontrada', 'ny version hittad')
    : stato === 'scaricamento'
    ? `${LC('scaricamento', 'téléchargement', 'downloading', 'descargando', 'laddar ner')} ${Math.round(percentuale)}%`
    : stato === 'pronto'
    ? LC('pronto — riavvia per installare', 'prêt — redémarrez pour installer', 'ready — restart to install',
        'listo — reinicia para instalar', 'klar — starta om för att installera')
    : stato === 'errore'
    ? LC('verifica non riuscita', 'échec de la vérification', 'check failed', 'comprobación fallida', 'kontroll misslyckades')
    : null;

  return (
    <>
      <button type="button" onClick={onApriCrediti} title={t('tip_credits')} style={{
        border: 'none', padding: isLightTheme ? '5px 12px' : 0, borderRadius: 12,
        background: isLightTheme ? '#2a2a2f' : 'transparent',
        boxShadow: isLightTheme ? '0 2px 8px rgba(38,40,48,0.22)' : 'none',
        cursor: 'pointer', lineHeight: 0, flexShrink: 0,
      }}>
        <img src="/logo-alt-scientology.png" alt="Alt. Scientology" style={{
          height: isLightTheme ? 74 : 86, width: 'auto',
          filter: isLightTheme ? 'none' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.45)) brightness(1.05)',
        }} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-xl)', letterSpacing: '0.14em' }}>
          SERENITY
        </span>
        {mostraLivello && (
          <span style={{
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
            letterSpacing: '0.12em', color: 'var(--s-ink-faint)',
          }}>
            {esperto === true ? 'EXPERT' : LC('BASIC', 'BASIQUE', 'BASIC', 'BÁSICO', 'BASIC')}
            {' · '}{__SERENITY_VERSION__}
            {disponibile && (() => {
              // ⚠️ RIDISEGNATO — segnalato: « il bottone di aggiornamento è poco visibile ».
              // Prima: un'icona nuda di 11px, grigio tenue, senza sfondo, dentro il testo
              // della versione — niente la faceva leggere come un vero bottone cliccabile,
              // a differenza di TUTTI gli altri bottoni-icona dell'intestazione (cuffie,
              // quadrante, ingranaggio, guida…), che usano tutti `.s-glass .s-glass-btn` —
              // il cerchio "vetro" con sfondo/bordo/rilievo che dice "cliccami" in SERENITY.
              // Stessa ricetta qui, solo più piccola (22px non i ~36px standard) per stare
              // accanto alla versione. In più: quando c'è davvero qualcosa da notare
              // (trovato/scaricamento/pronto), il cerchio passa al colore "attenzione"
              // (`--s-reserve`, l'ambra già usata per la barra INT quando la carica è
              // bassa) — non solo un bottone più visibile, un vero avviso passivo.
              const attenzione = stato === 'trovato' || stato === 'scaricamento' || stato === 'pronto';
              const fermo = stato === 'verifica' || stato === 'scaricamento';
              return (
                <button type="button" onClick={verifica} disabled={fermo}
                  className="s-glass s-glass-btn"
                  title={LC('verifica aggiornamento', 'vérifier la mise à jour', 'check for update',
                    'buscar actualización', 'sök uppdatering')}
                  style={{
                    marginLeft: 6, width: 22, height: 22, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    verticalAlign: -6, cursor: fermo ? 'default' : 'pointer',
                    border: `1px solid ${attenzione ? 'var(--s-reserve)' : 'var(--s-ink-ghost)'}`,
                    background: attenzione ? 'color-mix(in srgb, var(--s-reserve) 16%, var(--s-disc))' : 'var(--s-disc)',
                    color: attenzione ? 'var(--s-reserve)' : 'var(--s-ink-faint)',
                  }}>
                  <RefreshCw size={12} strokeWidth={2}
                    style={stato === 'verifica' ? { animation: 'sAggiornaSpin 0.9s linear infinite' } : undefined} />
                </button>
              );
            })()}
            {testoStato && (
              <span style={{ marginLeft: 5, color: stato === 'errore' ? 'var(--s-reserve)' : 'var(--s-ink-faint)' }}>
                — {testoStato}
              </span>
            )}
          </span>
        )}
      </div>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 3px rgba(44,47,51,0.35)',
        border: '1px solid var(--s-ink-ghost)',
      }}>
        <img src="/credits/ondes.png" alt="SERENITY" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    </>
  );
}
