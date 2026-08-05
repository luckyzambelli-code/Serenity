import { describe, it, expect } from 'vitest';
import {
  scaleToFit, isPersistableWallpaper, WALLPAPER_MAX_SIDE,
} from '../wallpaperImport';

describe('la riduzione dell immagine', () => {
  it('non ingrandisce mai: un immagine già piccola resta com è', () => {
    expect(scaleToFit(800, 600)).toEqual({ w: 800, h: 600 });
  });

  it('porta il lato lungo al massimo, orizzontale', () => {
    const r = scaleToFit(4000, 3000);
    expect(r.w).toBe(WALLPAPER_MAX_SIDE);
    expect(r.h).toBe(1440);
  });

  it('e anche verticale — è il lato LUNGO che comanda', () => {
    const r = scaleToFit(3000, 4000);
    expect(r.h).toBe(WALLPAPER_MAX_SIDE);
    expect(r.w).toBe(1440);
  });

  it('conserva le proporzioni', () => {
    const r = scaleToFit(5120, 2160);
    expect(r.w / r.h).toBeCloseTo(5120 / 2160, 2);
  });

  it('il quadrato resta quadrato', () => {
    const r = scaleToFit(3000, 3000);
    expect(r).toEqual({ w: WALLPAPER_MAX_SIDE, h: WALLPAPER_MAX_SIDE });
  });
});

describe('quali sfondi si possono conservare', () => {
  it('il vuoto: è il fondo predefinito', () => {
    expect(isPersistableWallpaper('')).toBe(true);
  });

  it('un data: — è testo, sopravvive al riavvio', () => {
    expect(isPersistableWallpaper('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('MAI un blob: — muore con la pagina, e conservarlo prometterebbe uno sfondo inesistente', () => {
    expect(isPersistableWallpaper('blob:http://localhost/abc-123')).toBe(false);
  });

  it('MAI i vecchi fondi in dotazione: quei file non esistono più', () => {
    expect(isPersistableWallpaper('/wallpapers/thumb-galaxy.jpg')).toBe(false);
  });

  it('né qualcosa che non sia una stringa', () => {
    expect(isPersistableWallpaper(undefined)).toBe(false);
    expect(isPersistableWallpaper(null)).toBe(false);
    expect(isPersistableWallpaper(42)).toBe(false);
  });
});
