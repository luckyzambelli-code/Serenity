/**
 * BottoniStoricoProcessus — l'icona STORICO con il contatore, terzo pezzo staccato
 * dall'intestazione di `Serenity.tsx` (dopo `LogoSerenity.tsx`/`ChiAuditaAssetto.tsx`).
 * Puramente presentazionale: legge `getSessionsByProfile` (lo stesso conto di `HistoryModal`),
 * nessuno stato nuovo.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 * ⚠️ PROCESSUS SPOSTATO VIA — segnalato: « il bottone PROCESSUS deve essere accanto al
 * bottone COMANDI per più coerenza ». Il secondo bottone (icona `BookOpen`, apriva il
 * `ProcessusModal` completo) viveva qui accanto a STORICO — tolto da qui, ora in
 * `BarraLaterale.tsx` accanto a COMMANDS (stesso `onClick`/contatore, solo spostati). Il
 * nome del componente resta "…Processus" per non rompere la cronologia sopra, anche se
 * ora mostra solo STORICO — un secondo giro di ridenominazione pura non aggiungerebbe
 * niente che questa nota non dica già.
 */
import { History as HistoryIcon } from 'lucide-react';
import { useI18n } from '../i18n';
import { getSessionsByProfile } from '../lib/storage';

export interface BottoniStoricoProcessusProps {
  auditorId: string | null | undefined;
  onApriStorico: () => void;
}

function Contatore({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span style={{
      position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 999,
      background: 'var(--s-ink)', color: 'var(--s-ground)',
      fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
    }}>{n}</span>
  );
}

export function BottoniStoricoProcessus({ auditorId, onApriStorico }: BottoniStoricoProcessusProps) {
  const { t } = useI18n();
  const numeroSedute = (() => { try { return getSessionsByProfile(auditorId || '_default').length; } catch { return 0; } })();

  return (
    <button className="s-glass s-glass-btn" onClick={onApriStorico} title={t('sidebar_history')} data-help={t('sidebar_history')} style={{
      position: 'relative', cursor: 'pointer', padding: 8, borderRadius: 999,
      background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
    }}>
      <HistoryIcon size={22} strokeWidth={1.8} />
      <Contatore n={numeroSedute} />
    </button>
  );
}
