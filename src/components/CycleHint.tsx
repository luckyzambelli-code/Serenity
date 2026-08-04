import React from 'react';

/**
 * CycleHint — « a che punto sono, e cosa devo fare adesso ».
 *
 * Una riga di titolo e una di istruzione, SEMPRE NELLO STESSO POSTO: sotto i comandi del ciclo
 * in corso, quale che sia il ciclo. È nato per il TONE, dove la procedura ha quattro tempi che
 * nessuno può ricordare a memoria; l'utente ha poi chiesto la stessa cosa per CONTACT, NULL e
 * MIRROR — « cela rends le tout plus simple ».
 *
 * ── PERCHÉ UN COMPONENTE E NON QUATTRO BLOCCHI ─────────────────────────────────────────────
 * Perché « nello stesso posto » vuol dire davvero lo stesso: stessa altezza di riga, stesso
 * corpo, stesso colore. Quattro copie del JSX divergono alla prima modifica, e allora passare
 * da un ciclo all'altro fa saltare il testo — che è esattamente il difetto che si voleva
 * togliere.
 *
 * ── ALTEZZA LIMITATA ───────────────────────────────────────────────────────────────────────
 * `maxHeight` 84 px: sotto c'è la colonna dei selettori, che sta più in alto nell'ordine di
 * impilamento (z-50 contro z-30) e coprirebbe il testo invece di essere spinta giù. 84 px sono
 * il titolo più tre righe — di più non ci sta, e un'istruzione di quattro righe non è
 * un'istruzione: è un manuale, e il manuale sta nel GUIDE.
 *
 * Rendering puro, nessuno stato.
 */
export function CycleHint({ titolo, come, avviso, fatto = false }: {
  /** Il passo: « 2 · POSITIVO O NEGATIVO? ». Numerato quando la procedura ha più tempi. */
  titolo: string;
  /** Che cosa fare adesso, in una riga. Se ne servono due, la seconda va in `avviso`. */
  come: string;
  /** Riga in ambra, per quel che l'auditor deve SAPERE e non fare: una smentita dell'ago, una
   *  proposta da verificare. Assente il più delle volte. */
  avviso?: string | null;
  /** Traguardo raggiunto (AS-IS, EQUILIBRIUM, OTTENUTO): il titolo passa al teal. */
  fatto?: boolean;
}) {
  return (
    <div style={{ width: '100%', marginTop: 2, maxHeight: 84, overflow: 'hidden' }}>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 800, letterSpacing: '0.04em',
                    color: fatto ? '#34d399' : 'rgba(240,246,255,0.95)' }}>
        {titolo}
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.45, marginTop: 2,
                    color: 'rgba(226,238,255,0.72)' }}>
        {come}
      </div>
      {avviso && (
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, marginTop: 3, color: '#fbbf24' }}>
          {avviso}
        </div>
      )}
    </div>
  );
}
