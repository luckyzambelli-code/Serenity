/**
 * BottoniStoricoProcessus — le due icone Storico/Processus con il contatore, terzo pezzo
 * staccato dall'intestazione di `Serenity.tsx` (dopo `LogoSerenity.tsx`/`ChiAuditaAssetto.tsx`).
 * Puramente presentazionale: legge `getSessionsByProfile` (lo stesso conto di `HistoryModal`)
 * e la lunghezza di `processusPdfs`, nessuno stato nuovo.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { History as HistoryIcon, BookOpen } from 'lucide-react';
import { useI18n } from '../i18n';
import { getSessionsByProfile } from '../lib/storage';

export interface BottoniStoricoProcessusProps {
  auditorId: string | null | undefined;
  processusCount: number;
  onApriStorico: () => void;
  onApriProcessus: () => void;
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

export function BottoniStoricoProcessus({ auditorId, processusCount, onApriStorico, onApriProcessus }: BottoniStoricoProcessusProps) {
  const { t } = useI18n();
  const numeroSedute = (() => { try { return getSessionsByProfile(auditorId || '_default').length; } catch { return 0; } })();

  return (
    <>
      <button className="s-glass s-glass-btn" onClick={onApriStorico} title={t('sidebar_history')} data-help={t('sidebar_history')} style={{
        position: 'relative', cursor: 'pointer', padding: 8, borderRadius: 999,
        background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
      }}>
        <HistoryIcon size={22} strokeWidth={1.8} />
        <Contatore n={numeroSedute} />
      </button>
      <button className="s-glass s-glass-btn" onClick={onApriProcessus} title={t('processus_modal_title')} data-help={t('processus_modal_title')} style={{
        position: 'relative', cursor: 'pointer', padding: 8, borderRadius: 999,
        background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
      }}>
        <BookOpen size={22} strokeWidth={1.8} />
        <Contatore n={processusCount} />
      </button>
    </>
  );
}
