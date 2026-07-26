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

export type CreditLine = { label: string; value: string };

/** Libellés + noms, dans l'ordre d'affichage. `lang` = langue choisie dans l'interface. */
export const creditLines = (lang: string): CreditLine[] => [
  { label: pick5(lang, 'Funzionalità', 'Fonctionnalités', 'Features', 'Funcionalidades', 'Funktioner'),
    value: 'Lafayette Ron Hubbard' },
  { label: pick5(lang, 'Sviluppo', 'Développement', 'Development', 'Desarrollo', 'Utveckling'),
    value: 'Claudio Zambelli' },
  { label: pick5(lang, 'Test', 'Test', 'Testing', 'Pruebas', 'Test'),
    value: 'Roger Martin' },
];

/** Ligne de copyright, présentée à part (en capitales, sous un filet). */
export const creditCopyright = (lang: string): CreditLine => ({
  label: pick5(lang, 'COPYRIGHT', 'COPYRIGHT', 'COPYRIGHT', 'COPYRIGHT', 'COPYRIGHT'),
  value: 'LRH',
});
