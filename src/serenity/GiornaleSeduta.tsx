/**
 * GiornaleSeduta — il pannello del Giornale, staccato da `Serenity.tsx`.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Continuazione della scomposizione di `Serenity.tsx` (v. `ZonaCamere.tsx` per la prima e
 * `docs/serenity-refonte.md` per la cronologia completa) — un dominio alla volta. Questo è il
 * secondo: il pannello che elenca le righe Aud/PC della seduta, col tono di voce e la reazione
 * misurata quando c'è. Riceve `logs` già letti da `journal.logs` (il giornale VERO resta
 * `session/useSessionJournal`, condiviso da tutta la seduta — decine di punti in `Serenity.tsx`
 * ci scrivono, questo componente si limita a MOSTRARE), e i due ref (`shownReadsRef`/
 * `agoEegRef`) da cui legge la reazione istantanea — la stessa fonte già usata altrove nel file
 * per lo stesso calcolo (`aggiungiItemManuale`/`cercaLetturaPerParola`), non una seconda.
 *
 * ⚠️ Filtro e ordine invariati rispetto a prima dell'estrazione — v. la cronologia completa
 * delle segnalazioni che li hanno formati (« nel journal non appare il testo », « poi appaiono
 * troppe informazioni »…) in `docs/serenity-refonte.md`.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import type { RefObject } from 'react';
import { useI18n } from '../i18n';
import type { LogEntry } from '../components/TranscriptLog';
import { computeInstantRead, READ_NON_MISURATO, type ReadSrc } from '../engine/instantRead';

export interface GiornaleSedutaProps {
  aperta: boolean;
  /** `moduleVis.journal` — il pannello non si monta affatto se falso, insieme ad `aperta`. */
  visibile: boolean;
  onChiudi: () => void;
  logs: LogEntry[];
  /** Un ago (EEG o Theta) è disponibile — senza nessuno dei due, nessuna reazione da mostrare. */
  museOk: boolean;
  meterC: boolean;
  shownReadsRef: RefObject<Array<{ time: number; reaction: string; src?: ReadSrc; episodeId?: number }>>;
  /** true = leggi la finestra EEG, false = Theta — stessa scelta di sorgente usata altrove. */
  agoEegRef: RefObject<boolean>;
}

export function GiornaleSeduta({
  aperta, visibile, onChiudi, logs, museOk, meterC, shownReadsRef, agoEegRef,
}: GiornaleSedutaProps) {
  const { t } = useI18n();

  if (!aperta || !visibile) return null;

  return (
    <div style={{
      width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--s-zone-bg)', border: '1px solid var(--s-zone-border)',
      borderRadius: 18, padding: '10px 16px 14px', pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--s-ink-faint)',
        }}>
          {t('ser_journal')}
        </span>
        <button onClick={onChiudi} style={{
          border: 'none', background: 'none', cursor: 'pointer',
          color: 'var(--s-ink-faint)', fontSize: 'var(--s-fs-lg)', lineHeight: 1, padding: 2,
        }}>×</button>
      </div>
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[...logs]
          .filter(l => l.speaker === 'Aud' || l.speaker === 'PC')
          .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
          .reverse()
          .map((log, i) => {
            const reazione = museOk || meterC
              ? computeInstantRead(shownReadsRef.current, log.time ?? 0, -Infinity, Infinity,
                  agoEegRef.current ? 'eeg' : 'theta').read
              : undefined;
            const reazioneUtile = reazione && reazione !== 'NULL' && reazione !== READ_NON_MISURATO
              ? reazione : null;
            return (
              <div key={i} style={{ display: 'flex', gap: 8, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', lineHeight: 1.4 }}>
                <span style={{ color: 'var(--s-ink-faint)', width: 38, flexShrink: 0 }}>
                  {(log.time || 0).toFixed(1)}s
                </span>
                <span style={{ color: 'var(--s-ink-faint)' }}>
                  <b>{log.speaker === 'Aud' ? 'AUD' : 'PC'}: </b>
                  {log.text}
                  {log.tone && (
                    <span style={{
                      marginLeft: 6, fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)',
                      padding: '1px 6px', borderRadius: 999, background: 'var(--s-disc-sunk)',
                      color: 'var(--s-ink-faint)',
                    }}>
                      {(t(`tone_${log.tone.label}` as never) as string || '').toUpperCase()}
                    </span>
                  )}
                  {reazioneUtile && (
                    <span style={{
                      marginLeft: 6, fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)',
                      fontWeight: 700, color: 'var(--s-still)',
                    }}>
                      → {reazioneUtile}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
