import type { CSSProperties } from 'react';

/**
 * panel3d — TOKENS centralisés pour la refonte visuelle "perspective restreinte / panneaux
 * de verre flottants" (référence utilisateur). PRÉSENTATION UNIQUEMENT : aucun calcul, aucune
 * logique métier ici. Tout le look (verre, profondeur, inclinaison, ombres, transitions) se
 * règle à UN seul endroit → point 8 du cahier des charges.
 *
 * L'instrument central (aiguille/cadran/TA) N'utilise PAS ces tokens : il reste plat et frontal.
 * Ces surfaces sont réservées aux panneaux PÉRIPHÉRIQUES (Diagnostic, MNA, R&I, biométrie, caméras…).
 */

export type Tilt = 'left' | 'right' | 'center';

export const PANEL3D = {
  radius: 22,           // coins bien arrondis (glassmorphism)
  blurPx: 24,           // FROST fort → verre dépoli (on voit le fond flou à travers)
  faceDeg: 0,           // (héritage perspective — désormais interface PLATE)
  depthPx: 0,
  scenePx: 1050,
  dur: '260ms',
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  glass: {
    // GLASSMORPHISM : verre dépoli translucide qui laisse voir le fond bleu vibrant à travers,
    // bord clair subtil, texte clair. bg = panneaux légers · bgSolid = panneaux denses (+ opaque).
    // GLASS (réf. "Glass Toggle") : verre translucide clair posé sur le charcoal (dark) / le gris
    // (light), bord clair fin + reflet interne haut. La profondeur vient de l'ombre (glassSurface).
    dark:  { bg: 'rgba(255,255,255,0.05)', bgSolid: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.10)', title: 'rgba(255,255,255,0.98)', text: 'rgba(240,243,250,0.92)', glow: 'rgba(255,255,255,0.12)' },
    light: { bg: 'rgba(255,255,255,0.34)', bgSolid: 'rgba(255,255,255,0.50)', border: 'rgba(255,255,255,0.55)', title: 'rgba(28,30,36,0.92)', text: 'rgba(40,42,48,0.86)', glow: 'rgba(255,255,255,0.6)' },
  },
} as const;

/** Ombre de "verre ÉPAIS FLOTTANT" : ombre portée forte (détaché du fond) + glow bleu des
 *  bords + BISEAU d'épaisseur (bord haut clair, bord bas foncé, liseré interne) → le verre a
 *  une épaisseur et flotte, comme la photo. */
/** Ombre de VERRE FLOTTANT (réf. "Glass Toggle") : ombre portée douce + profonde (décollement)
 *  + reflet interne clair en haut (biseau) → le panneau a de l'épaisseur et flotte. Version
 *  claire = ombre plus douce/froide pour ne pas noircir le gris. */
export function glassShadow(isLightTheme: boolean): string {
  return isLightTheme
    ? '0 20px 44px rgba(38,40,48,0.26), 0 4px 12px rgba(38,40,48,0.16), inset 0 1px 0 rgba(255,255,255,0.6)'
    : '0 22px 52px rgba(0,0,0,0.52), 0 4px 14px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.14)';
}

/** Conservé pour compat : renvoie l'ombre de verre sombre. */
export function panelShadow(_depth: number, _glow: string): string {
  return glassShadow(false);
}

/** Style de surface verre RECULÉE en profondeur (translateZ) + très léger angle de face.
 *  Les panneaux vont "vers l'arrière" (plus loin/petits), PAS de pivot latéral. Accéléré GPU.
 *  `solid` = verre plus opaque (lisibilité) ; `depth` = recul (défaut PANEL3D.depthPx). */
export function glassSurface(_side: Tilt = 'center', isLightTheme = false, solid = false, _depth: number = PANEL3D.depthPx): CSSProperties {
  const g = isLightTheme ? PANEL3D.glass.light : PANEL3D.glass.dark;
  void solid;
  // SANS FOND (choix utilisateur) : la zone repose sur le FOND UNIQUE de l'app — plus de fond,
  // ni flou, ni ombre. On garde seulement un liseré arrondi discret pour délimiter.
  return {
    background: 'transparent',
    border: `1px solid ${g.border}`,
    borderRadius: PANEL3D.radius,
    transition: `opacity ${PANEL3D.dur} ${PANEL3D.ease}`,
  };
}

/** NO-OP depuis le passage en interface PLATE (choix utilisateur). Conservé pour ne pas
 *  toucher tous les appels : ne renvoie plus aucune transformation. */
export function frontTilt(_deg = 12): CSSProperties {
  return {};
}

/** NO-OP depuis le passage en interface PLATE : plus de perspective de scène sur les
 *  conteneurs. Conservé pour ne pas toucher tous les appels. */
export function scenePerspective(_originX = '50%', _originY = '42%'): CSSProperties {
  return {};
}
