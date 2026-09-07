/**
 * IndicatoriRemoti — « A DISTANZA »: il tunnel verso il PC e il SUO MUSE, due dispositivi, due
 * indicatori — ottavo pezzo staccato dall'intestazione di `Serenity.tsx`.
 *
 * ── PERCHÉ, DUE INDICATORI E NON UNO ─────────────────────────────────────────────────────────
 * Segnalato dal vivo: « bisogna capire che sono cose diverse ». Il divisore + l'etichetta "A
 * DISTANZA" dicono che questa zona parla del PRECLEAR, non dell'auditor — e "MUSE" qui diventa
 * "MUSE (preclear)": la stessa parola di STRUMENTI (la pillola dell'auditor, poco prima)
 * avrebbe potuto leggersi come una ripetizione invece che come un dispositivo diverso, su una
 * persona diversa, in un luogo diverso.
 *
 * Puramente presentazionale — legge `remote` (lo stesso oggetto che `useRemoteSession()`
 * restituisce a `Serenity.tsx`), nessuno stato proprio.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { Wifi, Headphones } from 'lucide-react';
import { useI18n } from '../i18n';
import { IndicatoreConnessione } from './IndicatoreConnessione';
import type { useRemoteSession } from '../hooks/useRemoteSession';

export interface IndicatoriRemotiProps {
  remote: ReturnType<typeof useRemoteSession>;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function IndicatoriRemoti({ remote, LC }: IndicatoriRemotiProps) {
  const { t } = useI18n();

  return (
    <>
      <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--s-ink-ghost)' }}>
        {LC('a distanza', 'à distance', 'remote', 'a distancia', 'på distans')}
      </span>
      <IndicatoreConnessione
        icona={<Wifi size={26} strokeWidth={1.8} />}
        etichetta={t('drawer_pc')}
        stato={
          remote.isConnected ? 'connesso'
            : remote.errore ? 'errore'
            : remote.tunnelLoading ? 'cercando' : 'in-attesa'
        }
        dettaglio={
          remote.isConnected ? t('conn_badge_auditor_ok')
            : remote.errore ? remote.errore
            : t(remote.tunnelLoading ? 'conn_internet_loading' : 'conn_badge_auditor_waiting')
        }
      />
      <IndicatoreConnessione
        icona={<Headphones size={26} strokeWidth={1.8} />}
        etichetta={LC('MUSE (preclear)', 'MUSE (préclair)', 'MUSE (preclear)', 'MUSE (preclear)', 'MUSE (preclear)')}
        stato={
          !remote.isConnected ? 'in-attesa'
            : remote.remoteMuseConnected ? 'connesso' : 'errore'
        }
        dettaglio={
          remote.isConnected
            ? (remote.remoteMuseConnected
                ? (remote.remoteBatteryLevel !== null ? `${remote.remoteBatteryLevel}%` : '✓')
                : t('conn_muse_preclear_disconnected'))
            : null
        }
      />
    </>
  );
}
