import { LAYER } from '../ui/layers';

/**
 * ParticipantWaitingBanner — banner « in attesa del preclear », modalità partecipante.
 *
 * Compare quando questo PC è in modalità `participant` ma non ancora connesso: cliccabile,
 * riapre la `ConnectionModal`. Presentazionale puro — ultimo pezzo piccolo della fase 1 prima
 * di passare alla fase 2 (modali già isolate ma ancora inline).
 */
export function ParticipantWaitingBanner({ onOpen, t }: {
  onOpen: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
        zIndex: LAYER.gate, display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
        background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)',
        backdropFilter: 'blur(8px)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
      <span style={{ fontSize: 18 }}>🔗</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#fbbf24', letterSpacing: '0.05em' }}>
          {t('conn_preclear_title')} — {t('conn_badge_preclear_waiting')}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
          {t('conn_preclear_subtitle')} →
        </div>
      </div>
    </div>
  );
}
