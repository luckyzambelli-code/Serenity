import React from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * Full-screen decorative background.
 *
 * REFONTE (look "photo") : le fond dark est désormais un DÉGRADÉ BLEUTÉ LUMINEUX qui donne de
 * la PROFONDEUR — halo bleu doux en haut-gauche (source de lumière), base bleu-nuit, plancher
 * sombre en bas. Il a remplacé l'ancien HUD sci-fi (starfield + galaxie + grille + circuit +
 * hex + scanlines) qui chargeait l'écran et gênait la lecture des panneaux de verre.
 *
 * Lit `isLightTheme` et `wallpaperUrl` depuis le `uiStore`. Aucune logique métier.
 */
export function AppBackground() {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const wallpaperUrl = useUiStore(s => s.wallpaperUrl);
  return (
    <>
      {!isLightTheme ? (
        <div data-bg className="absolute inset-0" style={{ zIndex: 0, overflow: 'hidden' }}>
          {/* GLASS DARK — charcoal QUASI UNIFORME (réf. "Glass Toggle"). Dégradé TRÈS doux :
              les bords (barre d'icônes / haut) ne s'assombrissent presque plus → plus de
              « bloc » bleu-noir distinct autour du centre. Fond commun homogène. */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 120% at 50% 22%, #2e2e33 0%, #2a2a2f 55%, #262629 100%)' }} />
          {/* pas d'assombrissement des bords → uniformité (le périmètre = le centre) */}
          {wallpaperUrl && (
            <img src={wallpaperUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.42 }} />
          )}
        </div>
      ) : (
        <div className="absolute inset-0" style={{ zIndex: 0, overflow: 'hidden' }}>
          {/* GLASS LIGHT — gris doux avec source de lumière en haut (réf. "Glass Toggle" · Light). */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 50% 18%, #d2d2d7 0%, #bcbcc2 48%, #a6a6ac 78%, #9a9aa0 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(140% 130% at 50% 30%, transparent 68%, rgba(60,60,68,0.14) 100%)' }} />
          {wallpaperUrl && (
            <img src={wallpaperUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }} />
          )}
        </div>
      )}
    </>
  );
}
