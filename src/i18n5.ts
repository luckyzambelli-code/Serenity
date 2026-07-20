import { useI18n } from './i18n';

/**
 * TRADUZIONE A 5 LINGUE — punto unico.
 *
 * Perché esiste: lo stesso helper era riscritto a mano in 6 componenti diversi (App, MirrorDial,
 * PostSessionReport, CycleStatusBar, TaCalibrationPanel, ProfileRoster), con firme leggermente
 * diverse. Ogni stringa nuova finiva in un helper locale invece che nel dizionario — ed è il
 * motivo per cui continuavano a comparire scritte non tradotte.
 *
 * ORDINE FISSO DEGLI ARGOMENTI: (it, fr, en, es, sv). L'inglese è il fallback.
 *
 * NOTA: i TERMINI D'AUDITING restano in INGLESE in tutte le lingue — CONTACT, NULL, RISE,
 * CLEAR READ, AS-IS, F/N, VGI's, MOCK-UP, recharging, ASSESSMENT, MIRROR. Non tradurli.
 */
export type Lang5 = string;

/** Versione pura: utile quando la lingua arriva come prop (componenti senza contesto). */
export function pick5(lang: Lang5, it: string, fr: string, en: string, es: string, sv: string): string {
  return lang === 'it' ? it
       : lang === 'fr' ? fr
       : lang === 'es' ? es
       : lang === 'sv' ? sv
       : en;
}

/** Versione hook: legge la lingua dal contesto i18n. */
export function useL5() {
  const { lang } = useI18n();
  return (it: string, fr: string, en: string, es: string, sv: string) =>
    pick5(lang as string, it, fr, en, es, sv);
}
