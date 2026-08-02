/**
 * CRÉDITS — une seule source pour les DEUX endroits où ils apparaissent :
 *   · le clic sur le logo Alternative Scientology (barre du haut) ;
 *   · l'animation d'ouverture (SplashScreen).
 * Les tenir ici empêche les deux affichages de diverger.
 *
 * Les NOMS sont des noms propres : ils ne se traduisent JAMAIS. Seuls les LIBELLÉS
 * (Fonctionnalités / Développement / Test / COPYRIGHT) suivent la langue choisie.
 */
import { pick5 } from './i18n5';

export type CreditLine = {
  label: string;
  value: string;
  /** Portrait, affiché en ROND. Fichier à déposer dans `public/credits/`.
   *  Si le fichier est absent, l'affichage retombe sur les INITIALES : jamais d'image cassée. */
  photo?: string;
};

/** Libellés + noms, dans l'ordre d'affichage. `lang` = langue choisie dans l'interface. */
export const creditLines = (lang: string): CreditLine[] => [
  { label: pick5(lang, 'Funzionalità', 'Fonctionnalités', 'Features', 'Funcionalidades', 'Funktioner'),
    value: 'Lafayette Ron Hubbard', photo: '/credits/ron.png' },
  { label: pick5(lang, 'Sviluppo', 'Développement', 'Development', 'Desarrollo', 'Utveckling'),
    value: 'Claudio Zambelli', photo: '/credits/claudio.jpg' },
  { label: pick5(lang, 'Test', 'Test', 'Testing', 'Pruebas', 'Test'),
    value: 'Senior CS Roger Martin', photo: '/credits/roger.jpg' },
];

/** Initiales d'un nom — repli quand le portrait n'est pas (encore) là. */
export const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();

/** Ligne de copyright, présentée à part (en capitales, sous un filet). */
export const creditCopyright = (lang: string): CreditLine => ({
  label: pick5(lang, 'COPYRIGHT', 'COPYRIGHT', 'COPYRIGHT', 'COPYRIGHT', 'COPYRIGHT'),
  value: 'LRH 2026',
});
