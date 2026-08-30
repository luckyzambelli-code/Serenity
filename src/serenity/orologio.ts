/** mm:ss — l'unico formato di tempo che serve in seduta.
 *
 * ── PERCHÉ QUESTO FILE A SÉ ──────────────────────────────────────────────────────────────────
 * Era definita due volte, parola per parola, in `Serenity.tsx` e in `ZonaAssessment.tsx` —
 * una duplicazione trovata in una review di ottimizzazione. `ZonaAssessment.tsx` è un
 * componente figlio di `Serenity.tsx`: importarla direttamente da lì avrebbe creato un giro
 * circolare (lo stesso problema già incontrato con `SuggerimentoCiclo.tsx`, risolto allo
 * stesso modo — un file a sé, senza dipendere da chi la usa).
 */
export const orologio = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};
