import { describe, it, expect } from 'vitest';
import { ThetaNeedle } from '../thetaNeedle';
import { THETA_NEEDLE_SCALE, THETA_TOTAL_TA_STEP } from '../tuning';

/**
 * Il modello è quello del meter vero: il TA è la parte LENTA della resistenza (la manopola),
 * l'ago è lo scarto RAPIDO da essa. Questi test fissano il comportamento che ci si aspetta da
 * un ago fisico — soprattutto il VERSO, che è l'unica cosa che non si può sbagliare a metà.
 */

/** Alimenta n letture uguali. */
const tieni = (n: ThetaNeedle, raw: number, volte: number) => {
  let ultimo = n.push(raw);
  for (let i = 1; i < volte; i++) ultimo = n.push(raw);
  return ultimo;
};

const RIPOSO = 9_000_000;   // grezzo tipico osservato sul meter dell'utente

describe('ThetaNeedle', () => {
  it('il braccio parte DOVE si trova la persona, non da zero', () => {
    const n = new ThetaNeedle();
    const s = n.push(RIPOSO);
    // Partire da zero manderebbe l'ago a fondo scala per i primi secondi: sembrerebbe una
    // reazione violenta che non è avvenuta.
    expect(s.arm).toBe(RIPOSO);
    expect(s.offset).toBe(0);
  });

  // ── IL VERSO: la cosa che non si può sbagliare ────────────────────────────────────────────
  it('la resistenza che SCENDE fa CADERE l ago (a destra)', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    // Stringere le lattine abbassa la resistenza → il grezzo scende (verificato sul meter).
    const s = n.push(RIPOSO - 300_000);
    expect(s.offset).toBeGreaterThan(0);      // positivo = destra = caduta
  });

  it('la resistenza che SALE porta l ago a sinistra', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    expect(n.push(RIPOSO + 300_000).offset).toBeLessThan(0);
  });

  it('l ampiezza della deviazione segue la scala dichiarata', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    const scarto = 150_000;
    expect(n.push(RIPOSO - scarto).offset).toBeCloseTo(scarto * THETA_NEEDLE_SCALE, 6);
  });

  it('l offset non sfora mai il quadrante', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    expect(n.push(0).offset).toBeLessThanOrEqual(1);
    expect(n.push(16_777_215).offset).toBeGreaterThanOrEqual(-1);
  });

  // ── IL BRACCIO ────────────────────────────────────────────────────────────────────────────
  it('il braccio insegue LENTAMENTE: una reazione breve non se la mangia', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    // Una caduta che dura un paio di secondi (120 letture a 60/s) deve restare BEN visibile.
    const s = tieni(n, RIPOSO - 300_000, 120);
    expect(s.offset).toBeGreaterThan(0.5);
  });

  it('ma su una carica PROLUNGATA il braccio finisce per raggiungerla', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    const s = tieni(n, RIPOSO - 300_000, 40_000);   // ~11 minuti a 60/s
    expect(Math.abs(s.offset)).toBeLessThan(0.2);   // l'ago è tornato verso il riposo
    expect(s.arm).toBeLessThan(RIPOSO);             // …perché il braccio è sceso
  });

  it('FUORI SCALA subito, poi il braccio RIPORTA l ago dentro il quadrante', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    // Deviazione enorme: 900.000 grezzi = 3 volte il quadrante.
    expect(n.push(RIPOSO - 900_000).offScale).toBe(true);
    const s = tieni(n, RIPOSO - 900_000, 200);
    // L'inseguimento veloce dura SOLO finché si è fuori scala: appena l'ago rientra, il braccio
    // torna lento. Quindi non recupera tutto — riporta l'ago nel quadrante e si ferma lì.
    expect(s.offScale).toBe(false);
    expect(Math.abs(s.arm - (RIPOSO - 900_000))).toBeLessThan(900_000);
  });

  it('il recupero è MOLTO più rapido fuori scala che dentro', () => {
    const dentro = new ThetaNeedle(); dentro.push(RIPOSO);
    const fuori  = new ThetaNeedle(); fuori.push(RIPOSO);
    tieni(dentro, RIPOSO - 100_000, 200);     // deviazione moderata → braccio lento
    tieni(fuori,  RIPOSO - 900_000, 200);     // deviazione enorme  → braccio veloce
    const frazioneDentro = (RIPOSO - dentro.arm) / 100_000;
    const frazioneFuori  = (RIPOSO - fuori.arm)  / 900_000;
    expect(frazioneFuori).toBeGreaterThan(frazioneDentro * 3);
    expect(dentro.offScale).toBe(false);
  });

  // ── TOTAL TA ──────────────────────────────────────────────────────────────────────────────
  it('conta le DISCESE del braccio, non le risalite', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    tieni(n, RIPOSO - 2_000_000, 60_000);        // discesa lunga → il braccio scende
    const dopoDiscesa = n.totalTa;
    expect(dopoDiscesa).toBeGreaterThan(0);

    tieni(n, RIPOSO, 60_000);                    // risale allo stesso punto
    expect(n.totalTa).toBe(dopoDiscesa);         // la risalita NON si conta
  });

  it('un ago che oscilla NON gonfia il totale', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    const prima = n.totalTa;
    for (let i = 0; i < 200; i++) {              // oscillazione stretta attorno al riposo
      tieni(n, RIPOSO + 20_000, 30);
      tieni(n, RIPOSO - 20_000, 30);
    }
    expect(n.totalTa).toBe(prima);
  });

  it('il totale è in decimi di divisione', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    tieni(n, RIPOSO - THETA_TOTAL_TA_STEP * 30, 80_000);
    expect(n.totalTa).toBeGreaterThan(0);
    expect(Math.round(n.totalTa * 10)).toBeCloseTo(n.totalTa * 10, 6);   // multiplo di 0,1
  });

  it('resetTotal azzera il conteggio senza perdere l aggancio al preclear', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    tieni(n, RIPOSO - 2_000_000, 60_000);
    const braccio = n.arm;
    n.resetTotal();
    expect(n.totalTa).toBe(0);
    expect(n.arm).toBe(braccio);      // il braccio resta dov'era: nessun salto dell'ago
  });

  it('reset riporta tutto allo stato iniziale', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    n.reset();
    expect(n.arm).toBe(0);
    expect(n.totalTa).toBe(0);
    expect(n.push(RIPOSO).arm).toBe(RIPOSO);    // riaggancia da capo
  });
});
