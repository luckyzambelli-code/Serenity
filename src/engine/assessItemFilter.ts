import { ITEM_MIN_CHARS, ITEM_MAX_WORDS, ITEM_FILLERS } from './tuning';

/**
 * L'ASSESSMENT cattura ciò che l'auditor dice a voce. Ma l'auditor parla anche FUORI dagli item
 * ("ok", "bene", un commento): senza filtro ogni frase diventava un item con la sua lettura, e il
 * report si riempiva di rumore.
 *
 * Questa funzione decide COSA è un item. È volutamente PRUDENTE: nel dubbio l'item passa, perché
 * perdere un item vero è molto peggio che tenere una riga di troppo.
 *
 * Manopole in `engine/tuning.ts` (ITEM_MIN_CHARS, ITEM_MAX_WORDS, ITEM_FILLERS).
 */

/** minuscolo, senza accenti e senza punteggiatura ai bordi — per confrontare gli intercalari. */
export function normalizeItem(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // via gli accenti
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')                   // via la punteggiatura
    .replace(/\s+/g, ' ')
    .trim();
}

export function isAssessableItem(text: string): boolean {
  const raw = (text ?? '').trim();
  if (raw.length < ITEM_MIN_CHARS) return false;

  const norm = normalizeItem(raw);
  if (!norm) return false;                    // solo punteggiatura
  if (ITEM_FILLERS.has(norm)) return false;   // intercalare puro ("ok", "bene", "d'accord"…)

  const words = norm.split(' ');
  // Un item resta corto. Una frase lunga è un commento — MA se finisce con « ? » è comunque una
  // domanda d'auditing, quindi la si tiene.
  if (words.length > ITEM_MAX_WORDS && !raw.endsWith('?')) return false;

  return true;
}
