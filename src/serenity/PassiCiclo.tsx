/**
 * PassiCiclo — I PASSI DEL METODO, uno via l'altro, a prova di stupido.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « le scritte dei cicli sono confuse, devono essere strutturate in modo più
 * chiaro, evidenziate le steps, a prova di stupido ». Vero: a ciclo armato SERENITY diceva SOLO
 * "a che punto si è ADESSO" (un badge, una scritta) — l'auditor doveva ricordare a memoria
 * QUANTI passi mancano e QUALI sono già stati fatti. Qui i passi del METODO in corso stanno
 * tutti a schermo insieme, in fila: quello fatto ha un segno di spunta, quello in corso è
 * acceso, quelli che restano sono spenti — la stessa lettura di uno stepper di pagamento,
 * niente da imparare.
 *
 * ── ZERO LOGICA QUI DENTRO ──────────────────────────────────────────────────────────────────
 * Riceve la SEQUENZA di passi già scritta (etichette) e l'INDICE di quello attuale — non decide
 * lui quando si passa al passo dopo. Quella decisione resta ai motori dei cicli
 * (`useContactNullCycle`/`useMirrorCycle`/`useToneCycle`) e a `engine/sessionPhase.ts`'s
 * `deriveCyclePhase`, mai duplicata qui.
 *
 * @see docs/serenity-refonte.md
 */

export interface PassoCiclo {
  chiave: string;
  etichetta: string;
}

export function PassiCiclo({ passi, indiceAttuale, hue }: {
  passi: PassoCiclo[];
  /** -1 = nessun passo ancora raggiunto (non dovrebbe capitare, un ciclo armato è già al
   *  passo 0), 0..n-1 = indice del passo IN CORSO. I passi PRIMA sono fatti, quelli DOPO
   *  devono ancora arrivare. */
  indiceAttuale: number;
  /** Il colore del metodo — lo stesso della sua pillola d'armamento (CONTACT verde, NULL
   *  azzurro, MIRROR ambra…), così lo stepper si legge come lo stesso oggetto della scelta
   *  fatta prima, non un widget nuovo. */
  hue: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {passi.map((p, i) => {
        const fatto = i < indiceAttuale;
        const attuale = i === indiceAttuale;
        return (
          <div key={p.chiave} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                className={attuale ? 's-glass' : undefined}
                style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
                  background: fatto ? hue : attuale ? 'var(--s-disc)' : 'var(--s-disc-sunk)',
                  color: fatto ? 'var(--s-ground-warm)' : attuale ? 'var(--s-ink)' : 'var(--s-ink-faint)',
                  border: attuale ? `1.5px solid ${hue}` : 'none',
                  boxShadow: attuale ? undefined : 'none',
                  transition: 'background var(--s-slow) var(--s-ease), border-color var(--s-slow) var(--s-ease)',
                }}
              >
                {fatto ? '✓' : i + 1}
              </span>
              <span style={{
                fontFamily: 'var(--s-sans)', fontSize: 12, letterSpacing: '0.02em',
                fontWeight: attuale ? 700 : 500, whiteSpace: 'nowrap',
                color: attuale ? 'var(--s-ink)' : fatto ? 'var(--s-ink-soft)' : 'var(--s-ink-faint)',
                transition: 'color var(--s-slow) var(--s-ease)',
              }}>
                {p.etichetta}
              </span>
            </div>
            {i < passi.length - 1 && (
              <span style={{
                width: 18, height: 1, margin: '0 8px', flexShrink: 0,
                background: fatto ? hue : 'var(--s-ink-ghost)',
                transition: 'background var(--s-slow) var(--s-ease)',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
