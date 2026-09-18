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
  // ⚠️ RIDISEGNATO — segnalato: « il bottone di aggiornamento non piace, perché non usare
  // l'immagine di SERENITY (il medaglione circolare) invece di un'icona a parte? ». Il
  // medaglione stesso ora è il pulsante (bordo ambra + rotazione durante il controllo,
  // v. `sAggiornaSpin` in tokens.css); la scritta "Verifica aggiornamento" compare come
  // invito cliccabile finché non si è ancora controllato, poi lascia il posto allo stato
  // reale (trovato/scaricamento/pronto/errore). `disponibile` è `false` fuori da Electron
  // (preview browser, ParticipantView remoto) — lì il medaglione resta un'immagine ferma.
  const { disponibile, stato, percentuale, verifica } = useAppUpdater();
  const attenzione = stato === 'trovato' || stato === 'scaricamento' || stato === 'pronto';
  const fermo = stato === 'verifica' || stato === 'scaricamento';
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
        'listo — reinicia para instalar', 'klar — starta om för att installare')
    : stato === 'errore'
    ? LC('verifica non riuscita', 'échec de la vérification', 'check failed', 'comprobación fallida', 'kontroll misslyckades')
    : null;
  // ⚠️ SEPARATO DI NUOVO — segnalato: « quando ti dice già aggiornato [...] sembra voler
  // dire che devi aggiornare, non è molto chiaro ». Prima la scritta dentro il bottone
  // CAMBIAVA con lo stato ("Verifica aggiornamento" → "già aggiornato" → ecc.) — dentro una
  // pillola piena che si legge come un comando, "già aggiornato" (un ESITO, non un'azione)
  // suonava ambiguo. Ora il bottone dice SEMPRE "Verifica aggiornamento" — l'azione non
  // cambia mai significato — e l'esito (`testoStato`) compare come testo semplice ACCANTO,
  // mai dentro la pillola: non è più possibile scambiarlo per un'istruzione.
  const etichettaBottone = LC('verifica aggiornamento', 'vérifier la mise à jour', 'check for update', 'buscar actualización', 'sök uppdatering');

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
            {disponibile && (
              // ⚠️ CORRETTO — segnalato: « lo hai fatto bianco, non mi piace, io lo farei
              // fondo nero ma visibile ». Prima era testo nudo sottolineato — su fondo
              // chiaro si perdeva, non si leggeva come un vero bottone. Ora una PILLOLA
              // piena, stessa ricetta già in uso qui accanto per il logo dei crediti
              // (`#2a2a2f` in chiaro, dove serve contrasto vero; in scuro l'intestazione è
              // già scura, un vetro chiaro traslucido resta visibile senza sparire nel
              // fondo). Ambra/`--s-reserve` quando c'è davvero qualcosa da notare o un
              // errore — stesso significato di prima, solo dentro una pillola invece che
              // come semplice colore del testo. Etichetta FISSA — v. la nota su
              // `etichettaBottone`, sopra.
              <button type="button" onClick={verifica} disabled={fermo}
                style={{
                  marginLeft: 6, border: 'none', borderRadius: 999, padding: '2px 9px',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                  letterSpacing: '0.03em', cursor: fermo ? 'default' : 'pointer',
                  background: (stato === 'errore' || attenzione)
                    ? 'var(--s-reserve)'
                    : (isLightTheme ? '#2a2a2f' : 'rgba(255,255,255,0.16)'),
                  color: (stato === 'errore' || attenzione) ? '#2a2a2f' : '#fff',
                }}>
                {etichettaBottone}
              </button>
            )}
            {disponibile && testoStato && (
              <span style={{ marginLeft: 6, color: stato === 'errore' ? 'var(--s-reserve)' : 'var(--s-ink-faint)' }}>
                {testoStato}
              </span>
            )}
          </span>
        )}
      </div>
      {disponibile ? (
        <button type="button" onClick={verifica} disabled={fermo}
          title={testoStato ?? etichettaBottone}
          style={{
            width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, padding: 0,
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 3px rgba(44,47,51,0.35)',
            border: `1px solid ${attenzione ? 'var(--s-reserve)' : 'var(--s-ink-ghost)'}`,
            cursor: fermo ? 'default' : 'pointer',
          }}>
          <img src="/credits/ondes.png" alt="SERENITY" style={{
            width: '100%', height: '100%', objectFit: 'cover',
            animation: stato === 'verifica' ? 'sAggiornaSpin 1.6s linear infinite' : undefined,
          }} />
        </button>
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 3px rgba(44,47,51,0.35)',
          border: '1px solid var(--s-ink-ghost)',
        }}>
          <img src="/credits/ondes.png" alt="SERENITY" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
    </>
  );
}
