import { LAYER } from '../ui/layers';

/**
 * PcSexPromptDialog — se il PC non è indicato all'avvio, si chiede il sesso per la baseline TA
 * (uomo 3.0 / donna 2.0), poi si prosegue con le tappe di avvio (`proceedStart`, che resta in
 * `App.tsx` — tocca `pcSex`/altro stato oltre a questo dialogo).
 *
 * Primo pezzo della fase 2 (modali già isolate concettualmente ma ancora scritte inline —
 * v. fine fase 1 nel giro 33 di `docs/serenity-refonte.md`). Presentazionale puro, come i pezzi
 * della fase 1: qui il "poco stato" della fase 2 non c'è nemmeno — è rimasto in `App.tsx`
 * (`pcSex`) esattamente come negli altri dialoghi.
 */
export function PcSexPromptDialog({ open, onPick, t }: {
  open: boolean;
  onPick: (sex: 'm' | 'f') => void;
  t: (key: string) => string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: LAYER.gate, background: 'rgba(0,0,0,0.6)' }}>
      <div style={{ maxWidth: 440, background: '#0b1626', border: '1px solid rgba(34,211,238,0.30)', borderRadius: 16, padding: '26px 28px', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.55)' }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.85)', marginBottom: 18 }}>
          {t('ta_sex_title')}
        </div>
        <div className="flex gap-3 justify-center">
          {([['m', t('sex_man'), '3.0'], ['f', t('sex_woman'), '2.0']] as const).map(([sx, lbl, ta]) => (
            <button key={sx}
              onClick={() => onPick(sx)}
              style={{ minWidth: 130, padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.45)',
                color: '#9ff6ff', fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500 }}>
              {lbl}<span style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, opacity: 0.7, marginTop: 4 }}>TA {ta}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
