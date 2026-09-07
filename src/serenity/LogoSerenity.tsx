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
import { useI18n } from '../i18n';

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
