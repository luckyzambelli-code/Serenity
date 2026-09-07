/**
 * AssistenteIA — l'icona `Brain` e il popover che monta `AIAssistant` (condiviso con App.tsx),
 * nono pezzo staccato dall'intestazione di `Serenity.tsx`.
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * `AIAssistant` stesso NON si tocca — è montato TALE E QUALE (legge già `useUiStore` da sé, si
 * adatta al tema di SERENITY senza bisogno di passarglielo). Questo file monta solo l'icona/il
 * popover che lo contiene, e costruisce `sessionContext` dagli stessi valori che
 * `Serenity.tsx` già aveva pronti — nessun calcolo nuovo.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { Brain } from 'lucide-react';
import { AIAssistant } from '../components/AIAssistant';
import { metricsStore } from '../store/metricsStore';
import type { LogEntry } from '../components/TranscriptLog';

export interface AssistenteIAProps {
  attivo: boolean;
  onToggle: () => void;
  lang: string;
  avvioSolo: boolean | null | undefined;
  nomeAuditor: string;
  nomePreclear: string;
  tempo: number;
  meterC: boolean;
  totalTaTheta: number;
  needleReaction: string;
  journalLogs: LogEntry[];
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function AssistenteIA({
  attivo, onToggle, lang, avvioSolo, nomeAuditor, nomePreclear, tempo,
  meterC, totalTaTheta, needleReaction, journalLogs, LC,
}: AssistenteIAProps) {
  return (
    <div style={{ position: 'relative' }}>
      <button className="s-glass s-glass-btn" onClick={onToggle}
        title={LC('assistente IA (Gemini)', 'assistant IA (Gemini)', 'AI assistant (Gemini)',
          'asistente IA (Gemini)', 'AI-assistent (Gemini)')} style={{
        cursor: 'pointer', padding: 8, borderRadius: 999,
        background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
      }}>
        <Brain size={32} strokeWidth={1.6} />
      </button>
      {attivo && (
        <div className="s-glass s-glass-lift" style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40,
          borderRadius: 12, background: 'var(--s-disc)', padding: 8,
        }}>
          <AIAssistant
            lang={lang}
            sessionContext={{
              pcName: avvioSolo ? nomeAuditor : nomePreclear,
              auditorName: nomeAuditor,
              sessionTime: tempo,
              totalTa: meterC ? totalTaTheta : metricsStore.get().totalTa,
              qL: metricsStore.get().qL,
              eta: metricsStore.get().eta,
              needleReaction,
              recentLogs: journalLogs.slice(-15).map(l => ({ time: l.time, speaker: l.speaker ?? '', text: l.text })),
            }}
          />
        </div>
      )}
    </div>
  );
}
