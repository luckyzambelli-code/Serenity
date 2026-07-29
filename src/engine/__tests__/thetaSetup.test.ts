import { describe, it, expect } from 'vitest';
import {
  scaleFromSqueeze, breathIsValid, offsetFromReference, taWithSetup, defaultSetup,
  SQUEEZE_TARGET_OFFSET, BREATH_MIN_OFFSET, type ThetaSetup,
} from '../thetaSetup';

/**
 * L'assetto è distinto dalla scala del TA: quella si tara UNA VOLTA con l'artefatto e vale per
 * chiunque. Qui c'è invece ciò che dipende da COME si audita — due lattine o lattina solo — e
 * la sensibilità dell'ago, che la procedura standard permette di MISURARE col test del respiro.
 */

// La SENSIBILITÀ si fissa con la PROVA DELLA STRETTA (un terzo di quadrante) — è la manopola
// di sensibilità del Theta-Meter. Il RESPIRO viene dopo, ed è una VERIFICA che la persona
// reagisca: l'ago deve cadere almeno un minimo. Sono due prove distinte, non la stessa.
describe('sensibilità dalla PROVA DELLA STRETTA', () => {
  it('una stretta vale un TERZO di quadrante', () => {
    const dev = 450_000;
    const scala = scaleFromSqueeze(dev)!;
    expect(dev * scala).toBeCloseTo(SQUEEZE_TARGET_OFFSET, 9);
    // Un terzo di QUADRANTE: l'asse va da −1 a +1, quindi è largo 2 e un terzo vale 2/3.
    // Preso per 1/3 l'ago si muoveva METÀ del Theta-Meter (segnalato in seduta).
    expect(SQUEEZE_TARGET_OFFSET).toBeCloseTo(2 / 3, 9);
  });

  it('più ampia è la stretta, MINORE la sensibilità necessaria', () => {
    expect(scaleFromSqueeze(900_000)!).toBeLessThan(scaleFromSqueeze(300_000)!);
  });

  it('il verso non conta: si misura l ampiezza', () => {
    expect(scaleFromSqueeze(-450_000)).toBe(scaleFromSqueeze(450_000));
  });

  it('RIFIUTA una misura nulla o assurda invece di rovinare la sensibilità', () => {
    // Meglio tenere quella che c'è: azzerarla bloccherebbe l'ago, o lo manderebbe fuori scala.
    expect(scaleFromSqueeze(0)).toBeNull();
    expect(scaleFromSqueeze(0.5)).toBeNull();
    expect(scaleFromSqueeze(NaN)).toBeNull();
  });
});

describe('test del respiro — verifica, non taratura', () => {
  it('una caduta sufficiente passa', () => {
    const scala = scaleFromSqueeze(450_000)!;      // stretta = 1/3 di quadrante
    expect(breathIsValid(450_000, scala)).toBe(true);
  });

  it('una caduta troppo piccola NON passa: la persona non reagisce, o il contatto è cattivo', () => {
    const scala = scaleFromSqueeze(450_000)!;
    expect(breathIsValid(450_000 * (BREATH_MIN_OFFSET / SQUEEZE_TARGET_OFFSET) * 0.5, scala)).toBe(false);
  });

  it('la soglia del respiro è MOLTO sotto quella della stretta', () => {
    // Il respiro non deve dare un terzo di quadrante: deve solo dare qualcosa.
    expect(BREATH_MIN_OFFSET).toBeLessThan(SQUEEZE_TARGET_OFFSET / 2);
  });
});

// ⚠️ La SENSIBILITÀ è della SEDUTA, non di tutti: dipende da come QUEL preclear tiene le
// lattine, e le due prove vanno rifatte prima di ogni seduta. Non deve quindi sopravvivere al
// riavvio — applicata a un altro preclear darebbe letture false senza che nulla lo segnali.
describe('la sensibilità NON sopravvive al riavvio', () => {
  it('un assetto nuovo parte da « non misurata »', () => {
    expect(defaultSetup(1e-6).scaleMeasured).toBe(false);
  });

  it('la SCALA DEL TA invece resta: quella si tara una volta e vale per chiunque', () => {
    // (verificato in thetaTaScale.test.ts — qui si fissa solo la distinzione)
    expect(defaultSetup(1e-6).offsets).toEqual({ 'two-cans': 0, 'solo-can': 0 });
  });
});

describe('correzione per configurazione, dal confronto col meter vero', () => {
  const base: ThetaSetup = {
    config: 'solo-can',
    offsets: { 'two-cans': 0, 'solo-can': -0.404 },
    needleScale: 1e-6,
    scaleMeasured: true,
  };

  it('lo scarto misurato in seduta: noi 6,2 · meter vero 5,796', () => {
    // Caso reale, lattina solo. La correzione e' NEGATIVA: leggevamo troppo alto.
    const off = offsetFromReference(5.796, 6.2);
    expect(off).toBeCloseTo(-0.404, 9);
    expect(taWithSetup(6.2, { ...base, offsets: { 'two-cans': 0, 'solo-can': off } }))
      .toBeCloseTo(5.796, 9);
  });

  it('ogni configurazione ha la SUA correzione', () => {
    // Cambiando configurazione cambia la geometria degli elettrodi, quindi la resistenza:
    // una correzione sola per entrambe sarebbe sbagliata in una delle due.
    const s: ThetaSetup = { ...base, offsets: { 'two-cans': 0.1, 'solo-can': -0.404 } };
    expect(taWithSetup(6.2, { ...s, config: 'two-cans' })).toBeCloseTo(6.3, 9);
    expect(taWithSetup(6.2, { ...s, config: 'solo-can' })).toBeCloseTo(5.796, 9);
  });

  it('senza misura la correzione è nulla, non inventata', () => {
    const d = defaultSetup(1e-6);
    expect(taWithSetup(3.4, d)).toBe(3.4);
    expect(taWithSetup(3.4, { ...d, config: 'solo-can' })).toBe(3.4);
  });
});
