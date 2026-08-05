/**
 * wallpaperImport — l'immagine di sfondo scelta dall'utente, ridotta e resa DUREVOLE.
 *
 * ── PERCHÉ NON `createObjectURL` ────────────────────────────────────────────────────────────
 * Un `blob:` vive quanto la pagina. Alla chiusura dell'app muore, e al riavvio lo sfondo
 * tornava quello di fabbrica: chi voleva la propria immagine doveva reimportarla ogni volta.
 * Il codice lo sapeva — `partialize` sostituiva d'ufficio il blob con un fondo in dotazione —
 * ma sapere che si perde non è tenerlo.
 *
 * Un `data:` invece è testo: sta in localStorage insieme al resto delle preferenze e sopravvive
 * a tutto. Il prezzo è la dimensione, ed è per questo che l'immagine si RIDUCE prima.
 *
 * ── PERCHÉ SI RIDUCE ────────────────────────────────────────────────────────────────────────
 * localStorage dà circa 5 MB; una foto da telefono ne pesa 4-8 da sola e farebbe fallire il
 * salvataggio di TUTTE le preferenze, tema compreso. Lo sfondo è decorativo — sfocato, dietro i
 * pannelli, al 42% di opacità: 1920 px di lato lungo e qualità 0,82 sono più che sufficienti e
 * stanno abbondantemente sotto il limite.
 *
 * Nessun React: si prova da solo.
 */

/** Lato lungo massimo dell'immagine conservata. Oltre non si vedrebbe la differenza. */
export const WALLPAPER_MAX_SIDE = 1920;
/** Qualità JPEG. Sotto 0,75 la banda del cielo comincia a scalinare. */
export const WALLPAPER_QUALITY = 0.82;
/** Tetto di sicurezza: oltre questo non si scrive, per non far fallire TUTTE le preferenze. */
export const WALLPAPER_MAX_BYTES = 3_000_000;

export interface WallpaperImportResult {
  /** L'immagine pronta da usare e da persistere, o `null` se non si è potuta leggere. */
  dataUrl: string | null;
  /** Perché non si è potuta usare — da mostrare all'utente, mai da inghiottire. */
  errore?: 'lettura' | 'troppo-grande';
}

/** Le due dimensioni finali, a proporzioni invariate. */
export function scaleToFit(w: number, h: number, maxSide = WALLPAPER_MAX_SIDE): { w: number; h: number } {
  const lato = Math.max(w, h);
  if (lato <= maxSide) return { w, h };
  const k = maxSide / lato;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/**
 * Legge il file scelto e ne restituisce un `data:` ridotto.
 *
 * Non solleva mai: uno sfondo che non si carica non deve poter fermare l'app, e chi chiama deve
 * poter dire all'utente che cosa è andato storto invece di lasciarlo davanti a un fondo immutato
 * e senza spiegazione.
 */
export async function importWallpaper(file: File): Promise<WallpaperImportResult> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file)
      : await caricaConImg(file);
  } catch {
    return { dataUrl: null, errore: 'lettura' };
  }

  const { w, h } = scaleToFit(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: null, errore: 'lettura' };
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', WALLPAPER_QUALITY);
  // `length` di una stringa base64 è una stima onesta del peso in byte del salvataggio.
  if (dataUrl.length > WALLPAPER_MAX_BYTES) return { dataUrl: null, errore: 'troppo-grande' };
  return { dataUrl };
}

/** Ripiego per i browser senza `createImageBitmap`. */
function caricaConImg(file: File): Promise<HTMLImageElement> {
  return new Promise((risolvi, rifiuta) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); risolvi(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rifiuta(new Error('immagine illeggibile')); };
    img.src = url;
  });
}

/**
 * Uno sfondo è CONSERVABILE solo se è un `data:` (o il vuoto = fondo predefinito).
 * I `blob:` muoiono con la pagina; i `/wallpapers/*` non esistono più — erano i fondi in
 * dotazione, tolti perché il fondo o è quello dell'app o è il TUO.
 */
export const isPersistableWallpaper = (url: unknown): url is string =>
  typeof url === 'string' && (url === '' || url.startsWith('data:'));
