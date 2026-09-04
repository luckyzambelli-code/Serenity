import { LAYER } from '../ui/layers';
import type { SessionDraft } from '../lib/storage';

/** Traduzioni locali — piccolo dizionario a sé, come nell'originale: questo dialogo compare
 *  PRIMA che `useI18n()` abbia scelto la lingua della sessione (crash-recovery all'avvio), quindi
 *  non passa dal dizionario principale. */
const RL: Record<string, { title: string; body: string; lines: string; resume: string; discard: string }> = {
  fr: { title: '⚠ Session interrompue', body: 'Une session non terminée a été retrouvée (journal, R&I, Total TA).', lines: 'lignes', resume: '↻ Reprendre', discard: 'Ignorer' },
  it: { title: '⚠ Sessione interrotta', body: 'È stata trovata una sessione non conclusa (journal, R&I, Total TA).', lines: 'righe', resume: '↻ Riprendi', discard: 'Ignora' },
  es: { title: '⚠ Sesión interrumpida', body: 'Se encontró una sesión sin terminar (registro, R&I, Total TA).', lines: 'líneas', resume: '↻ Reanudar', discard: 'Ignorar' },
  en: { title: '⚠ Interrupted session', body: 'An unfinished session was found (journal, R&I, Total TA).', lines: 'lines', resume: '↻ Resume', discard: 'Discard' },
  sv: { title: '⚠ Avbruten session', body: 'En oavslutad session hittades (journal, R&I, Total TA).', lines: 'rader', resume: '↻ Återuppta', discard: 'Ignorera' },
};

/**
 * SessionRecoveryDialog — R3: crash-recovery prompt per una seduta interrotta.
 *
 * Secondo pezzo della fase 2 (v. `PcSexPromptDialog`, primo pezzo). Presentazionale puro:
 * `draft` arriva già pronto da `App.tsx` (`recoverableDraft`), `onResume`/`onDiscard` restano
 * le funzioni originali (`recoverDraft`/`discardDraft`), passate senza modifiche.
 */
export function SessionRecoveryDialog({ draft, lang, onResume, onDiscard }: {
  draft: SessionDraft | null;
  lang: string;
  onResume: (draft: SessionDraft) => void;
  onDiscard: () => void;
}) {
  if (!draft) return null;
  const r = RL[lang] || RL.en;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: LAYER.confirm, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(8px)' }}>
      <div style={{ maxWidth: 480, background: '#0b1626', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 16, padding: '26px 28px', color: '#e2e8f0', textAlign: 'center', boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#eaf3ff', letterSpacing: '0.04em', marginBottom: 10 }}>{r.title}</div>
        <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>{r.body}</div>
        <div style={{ fontSize: 12, color: 'rgba(235,244,255,0.92)', margin: '12px 0 18px' }}>
          {(draft.logs?.length ?? 0)} {r.lines} · Total TA {Number(draft.totalTa || 0).toFixed(2)} · {new Date(draft.savedAt).toLocaleString()}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => onResume(draft)}
            style={{ fontSize: 14, fontWeight: 'bold', letterSpacing: '0.03em', color: '#021018', background: '#eaf3ff', border: 'none', borderRadius: 10, padding: '12px 22px', cursor: 'pointer' }}>
            {r.resume}
          </button>
          <button onClick={onDiscard}
            style={{ fontSize: 13, color: '#cbd5e1', background: 'transparent', border: '1px solid rgba(148,163,184,0.4)', borderRadius: 10, padding: '12px 20px', cursor: 'pointer' }}>
            {r.discard}
          </button>
        </div>
      </div>
    </div>
  );
}
