import { LAYER } from '../ui/layers';

/**
 * QuitConfirmDialog — « uscire con una seduta aperta ».
 *
 * Chiudere il programma buttava via la seduta senza dire niente. Ora si chiede, e le tre
 * risposte sono TUTTE esplicite: nessun bottone « OK » che non dice cosa farà. « Salva ed esci »
 * chiude la seduta come farebbe il pulsante di fine — rapporto, salvataggio, archivio — e solo
 * DOPO esce (con la rete di sicurezza dell'`onSaveAndQuit` composito, rimasta in `App.tsx` perché
 * tocca `quitAfterSaveRef`/`handleEnd`/`quitNow` insieme, troppo intrecciata per guadagnarci
 * separandola — stesso principio di `InstrumentHintPanel`/`InstrumentBadges`).
 */
export function QuitConfirmDialog({
  open, onClose, onSaveAndQuit, onDiscardAndQuit, t,
}: {
  open: boolean;
  onClose: () => void;
  onSaveAndQuit: () => void;
  onDiscardAndQuit: () => void;
  t: (key: string) => string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: LAYER.dialog, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
      <div style={{ maxWidth: 460, background: '#0b1626', border: '1px solid rgba(251,191,36,0.35)',
                    borderRadius: 16, padding: '24px 26px', boxShadow: '0 12px 44px rgba(0,0,0,0.6)' }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700,
                      color: 'rgba(240,246,255,0.95)', marginBottom: 8 }}>
          {t('quit_title')}
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.55,
                      color: 'rgba(226,238,255,0.7)', marginBottom: 20 }}>
          {t('quit_body')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <button type="button"
            onClick={onSaveAndQuit}
            style={{ height: 40, borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(52,211,153,0.5)',
                     background: 'rgba(52,211,153,0.14)', color: '#6ee7b7',
                     fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600 }}>
            {t('quit_save')}
          </button>
          <button type="button"
            onClick={onDiscardAndQuit}
            style={{ height: 36, borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(248,113,113,0.45)',
                     background: 'rgba(248,113,113,0.10)', color: '#fca5a5',
                     fontFamily: 'var(--font-sans)', fontSize: 12 }}>
            {t('quit_discard')}
          </button>
          <button type="button"
            onClick={onClose}
            style={{ height: 36, borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.18)',
                     background: 'rgba(255,255,255,0.05)', color: 'rgba(240,246,255,0.85)',
                     fontFamily: 'var(--font-sans)', fontSize: 12 }}>
            {t('quit_stay')}
          </button>
        </div>
      </div>
    </div>
  );
}
