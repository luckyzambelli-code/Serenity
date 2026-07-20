/**
 * Bundled background images shipped with the app. Files live in public/wallpapers/
 * → served at /wallpapers/* in dev and in the packaged app.
 * `url` and `thumb` both point at the small static JPEG preview (durability fix —
 * see below). `_ext` only records the original source format, for reference.
 *
 * 2026-06: re-curated + recompressed set (gifsicle --lossy / sips). Sources kept in
 * the repo under public/wallpapers/ so they can no longer be lost on a folder reorg.
 */
export interface BundledWallpaper {
  id: string;
  name: string;
  url: string;
  thumb: string;
}

// DURABILITY FIX: the full-size files (/wallpapers/{id}.jpg|gif) kept VANISHING
// from the bundle (only the thumbnails reliably persist), so the background went
// blank ("di nuovo i fondi non sono più attivi"). The background is decorative —
// blurred, ~0.55 opacity, behind the starfield + overlays — so the small
// thumbnail is more than enough. We now point BOTH the gallery tile AND the
// applied background at the thumbnail, which always exists. (GIFs lose animation,
// but the full GIFs were among the vanishing files anyway.)
const W = (id: string, name: string, _ext: 'jpg' | 'gif'): BundledWallpaper => ({
  id,
  name,
  url: `/wallpapers/thumb-${id}.jpg`,
  thumb: `/wallpapers/thumb-${id}.jpg`,
});

export const BUNDLED_WALLPAPERS: BundledWallpaper[] = [
  // ── Static (JPG) ──
  W('galaxy',   'Galaxy',     'jpg'),
  W('cosmos',   'Cosmos',     'jpg'),
  W('universe', 'Universe',   'jpg'),
  W('infinity', 'Infinity',   'jpg'),
  W('mind',     'Mind',       'jpg'),
  W('static',   'Static',     'jpg'),
  W('zero',     'Zero',       'jpg'),
  W('quantum',  'Quantum',    'jpg'),
  // ── Animated (GIF) ──
  W('gravitation',   'Gravitation',   'gif'),
  W('supernova',     'Supernova',     'gif'),
  W('neutrino',      'Neutrino',      'gif'),
  W('secret-energy', 'Secret Energy', 'gif'),
  W('white-hole',    'White Hole',    'gif'),
  W('mind-flow',     'Mind · Flow',   'gif'),
];
