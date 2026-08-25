import React from 'react';

/**
 * SuggerimentoCiclo — IL COMANDO DA DIRE, IL "COME", L'AVVISO.
 *
 * ── PERCHÉ ESISTE, E PERCHÉ IN UN FILE A SÉ ─────────────────────────────────────────────────
 * Segnalato: « quando un ciclo è aperto le scritte siano più grandi... DEVONO ESSERE BEN
 * VISIBILI ». Nato dentro `Serenity.tsx` (non condiviso con App.tsx, libero di crescere) come
 * la citazione esatta da leggere a voce durante un ciclo — il testo che l'auditor guarda più
 * spesso mentre conduce.
 *
 * Estratto in un file a sé quando segnalato di nuovo: « le indicazioni, e non solo gli step
 * dei cicli, devono stare a sinistra dell'ago — niente più dei cicli riprodotto in alto a
 * sinistra ». Prima viveva SOLO nella barra comandi in alto (tre chiamate, una per metodo);
 * ora vive SOLO dentro `PistaCiclo` (l'unico posto rimasto per tutto ciò che riguarda il
 * ciclo). `Serenity.tsx` lo importava per montarlo lì — spostarlo qui evita un giro
 * `Serenity.tsx → PistaCiclo.tsx → (di nuovo) Serenity.tsx`, un'importazione circolare che
 * il bundler non accetterebbe.
 *
 * `comando` (la citazione, `--s-fs-lg`) / "come" (spiegazione, `--s-fs-base`) / `avviso`
 * (ambra, `--s-fs-base`) — nessuna logica qui: il TESTO lo decide `spiegazioneCiclo` in
 * `Serenity.tsx`, questo componente lo mostra soltanto.
 */
export function SuggerimentoCiclo({ comando, come, avviso, fatto = false }: {
  comando?: string | null; come: string; avviso?: string | null; fatto?: boolean;
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420 }}>
      {comando && (
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-lg)', lineHeight: 1.35,
                      color: fatto ? 'var(--s-still)' : 'var(--s-ink-soft)' }}>
          {comando}
        </span>
      )}
      <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', lineHeight: 1.4,
                    color: fatto ? 'var(--s-still)' : 'var(--s-ink-faint)' }}>
        {come}
      </span>
      {avviso && (
        <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
                      color: 'var(--s-reserve)' }}>
          {avviso}
        </span>
      )}
    </span>
  );
}
