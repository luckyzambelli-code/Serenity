import React from 'react';

/**
 * LA DOMANDA AL PRECLEAR — « questo item aveva carica? »
 *
 * Perché esiste. Misurato il 02/08/2026 su 89 item con MUSE e METER insieme: i due aghi hanno
 * letto lo STESSO item **una volta** (solo MUSE 31, solo METER 6, nessuno 51 — κ di Cohen
 * −0,09, cioè indipendenti). Nessuno dei due può quindi validare l'altro. Il preclear sì: lui
 * sa se un item lo ha smosso, e il suo giudizio non viene da nessuno dei due strumenti.
 *
 * Perché è QUI e non dentro il pannello ASSESSMENT: quel pannello si può richiudere, e una
 * domanda che si può non vedere produce risposte mancanti proprio sugli item in cui il preclear
 * era assorbito — cioè quelli carichi. Sta in basso, fisso, e non copre il quadrante: il
 * preclear deve continuare a vedere l'ago mentre risponde.
 *
 * ⚠️ La cecità è sul VERDETTO, non sull'ago. Il quadrante si muove sotto i suoi occhi, quindi
 * il giudizio è tirato verso l'ago MOSTRATO — il che rende più forte, non più debole, un
 * risultato a favore dell'altro. Va detto leggendo i numeri, non nascosto.
 */
export function PcChargePrompt({
  parola, onCarico, onNiente, titolo, siLbl, noLbl, nota,
}: {
  /** L'item appena dato. Si mostra: il preclear deve sapere su COSA sta rispondendo — fra
   *  l'item e la domanda passano un paio di secondi, e in assessment gli item si somigliano. */
  parola: string;
  onCarico: () => void;
  onNiente: () => void;
  titolo: string;
  siLbl: string;
  noLbl: string;
  nota: string;
}) {
  const bottone = (accento: string): React.CSSProperties => ({
    minWidth: 132, height: 44, borderRadius: 11, cursor: 'pointer',
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    border: `1px solid ${accento}`, background: 'rgba(0,0,0,0.5)', color: accento,
  });

  return (
    <div
      role="dialog"
      aria-label={titolo}
      style={{
        position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 9990,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '14px 22px 16px', borderRadius: 16,
        border: '1px solid rgba(251,191,36,0.5)',
        background: 'linear-gradient(160deg, rgba(38,34,24,0.97), rgba(22,20,16,0.97))',
        boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.16em',
                       textTransform: 'uppercase', color: 'rgba(251,191,36,0.85)' }}>
          {titolo}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600,
                       color: 'rgba(245,240,230,0.96)', maxWidth: 320,
                       overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          « {parola} »
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {/* L'ordine è « carica » a sinistra perché è la risposta che richiede di riconoscere
            qualcosa; il tasto sta sotto l'indice sinistro con le mani sulle lattine. */}
        <button type="button" onClick={onCarico} style={bottone('#fbbf24')}>{siLbl}</button>
        <button type="button" onClick={onNiente} style={bottone('rgba(226,238,255,0.65)')}>{noLbl}</button>
      </div>

      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
                     color: 'rgba(226,238,255,0.42)' }}>
        {nota}
      </span>
    </div>
  );
}
