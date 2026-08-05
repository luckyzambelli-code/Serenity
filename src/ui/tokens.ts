/**
 * tokens — I COLORI DEL TEMA, per nome invece che per valore.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * `isLightTheme ? '…' : '…'` era scritto 199 volte su 21 file. Il difetto non è la ripetizione:
 * è che ogni ritocco al tema chiaro voleva 199 letture, e bastava dimenticarne una perché una
 * zona restasse scura in mezzo al chiaro. È già successo, ed è per questo che `lightThemeCss.ts`
 * esiste — cento righe di CSS scritte per rincorrere i punti sfuggiti.
 *
 * ── COSA C'È QUI, E COSA NO ─────────────────────────────────────────────────────────────────
 * Qui stanno le variabili CSS (definite in `index.css`), non i valori. Il componente scrive
 * `background: TOKEN.wellBg` e il tema lo risolve il CSS — quindi cambiare tema NON rimonta
 * nulla in React: cambia un attributo sul div principale e il browser ridipinge.
 *
 * Ci sono i dodici valori che si ripetevano tre volte o più E che hanno un nome sensato. La
 * coda lunga (un colore usato una volta sola in un punto solo) resta dov'è: darle un nome
 * inventato la renderebbe più difficile da leggere, non meno.
 *
 * ── NESSUN COLORE È STATO SCELTO ────────────────────────────────────────────────────────────
 * I valori sono esattamente quelli che erano nel codice, spostati. La REGOLA DEL COLORE — un
 * significato per valore, il rosso riservato alla carica — è un'altra cosa e viene dopo:
 * oggi `#ff5a5a` vuol dire « carica presente » E « metodo TONE », e `#34d399` vuol dire
 * « traguardo raggiunto » E « metodo MIRROR » E « MUSE indossato ».
 *
 * @see docs/refonte-fasi.md §2 — la regola del colore.
 */

/**
 * Le variabili, pronte da mettere in un `style`. Sono stringhe `var(--…)`: funzionano in
 * qualunque proprietà CSS, e il fallback vive in `index.css` su `:root` (tema scuro).
 */
export const TOKEN = {
  /** L'INCASSO — la pista in cui siedono i mini-interruttori e i badge (MUSE, THETA, metodi). */
  wellBg:      'var(--sm-well-bg)',
  /** L'ombra interna che dà la profondità all'incasso. Va SEMPRE insieme a `wellBg`. */
  wellShadow:  'var(--sm-well-shadow)',
  /** L'inchiostro leggibile sull'incasso. */
  ink:         'var(--sm-ink)',
  /** L'ombra dei pannelli di vetro. */
  panelShadow: 'var(--sm-panel-shadow)',
  /** L'AVVISO — quel che l'auditor deve SAPERE e non fare. Ambra al buio, rosso al chiaro. */
  warn:        'var(--sm-warn)',
  warnBg:      'var(--sm-warn-bg)',
  warnEdge:    'var(--sm-warn-edge)',
  /** Il separatore fra le zone. */
  sep:         'var(--sm-sep)',
  /** La pastiglia — i piccoli contenitori. */
  chipBg:      'var(--sm-chip-bg)',
  chipEdge:    'var(--sm-chip-edge)',
  /** L'inchiostro d'accento: titoli e valori in evidenza. */
  accentInk:   'var(--sm-accent-ink)',
} as const;

export type TokenName = keyof typeof TOKEN;
