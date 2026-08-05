import React from 'react';
import { useUiStore } from '../store/uiStore';
import { LAYER } from "../ui/layers";

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
        <div data-bg className="absolute inset-0" style={{ zIndex: LAYER.background, overflow: 'hidden' }}>
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
        <div className="absolute inset-0" style={{ zIndex: LAYER.background, overflow: 'hidden' }}>
          {/* ── IL CHIARO È PIATTO, E NON PER GUSTO ────────────────────────────────────────
              Il commento in App.tsx lo diceva già — « LIGHT theme = a CLEAN FLAT background
              (no wallpaper image) so everything stays legible » — ma qui l'immagine si
              dipingeva lo stesso, e il tema chiaro era di fatto illeggibile: i pannelli sono
              trasparenti, l'inchiostro è scuro, e sotto ci finiva una foto scura.
              L'immagine importata resta, e si vede nel tema scuro. Nel chiaro no: uno sfondo
              non vale la leggibilità di quel che ci sta sopra.
              Schiarito anche il grigio (era #d2d2d7→#9a9aa0): il bordo scendeva troppo, e
              l'inchiostro dei pannelli ci si perdeva agli angoli. */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 50% 18%, #ececed 0%, #e0e0e4 48%, #d2d2d8 78%, #c8c8ce 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(140% 130% at 50% 30%, transparent 72%, rgba(60,60,68,0.08) 100%)' }} />
        </div>
      )}
    </>
  );
}
