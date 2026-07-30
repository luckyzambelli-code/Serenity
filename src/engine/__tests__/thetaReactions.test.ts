import { describe, it, expect } from 'vitest';
import { ThetaReactionTracker, classifyAmplitude } from '../thetaReactions';
import { THETA_REACT_FALL, THETA_REACT_TICK, THETA_EPISODE_RELEASE } from '../tuning';

/**
 * Le reazioni sull'ago delle BOÎTES. Senza questo, ASSESSMENT prendeva le letture solo dal
 * classificatore EEG: col meter da solo ogni item risultava NULL mentre l'ago si muoveva sotto
 * gli occhi dell'auditor.
 */

/** Alimenta una serie di deviazioni, un decimo di secondo per campione. */
const passa = (tr: ThetaReactionTracker, devs: number[], t0 = 10) => {
  const out = [];
  devs.forEach((d, i) => { const r = tr.push(d, t0 + i * 0.1); if (r) out.push(r); });
  return out;
};

describe('classifyAmplitude', () => {
  it('assegna la reazione secondo l ampiezza del quadrante', () => {
    expect(classifyAmplitude(0.95)).toBe('reaction_blow_down');
    expect(classifyAmplitude(0.70)).toBe('reaction_long_fall');
    expect(classifyAmplitude(0.50)).toBe('reaction_fall');
    expect(classifyAmplitude(0.25)).toBe('reaction_sf');
    expect(classifyAmplitude(0.10)).toBe('reaction_tick');
  });

  it('sotto il tick NON è una lettura: è rumore', () => {
    expect(classifyAmplitude(0.03)).toBeNull();
    expect(classifyAmplitude(0)).toBeNull();
  });

  it('il verso non conta: una reazione è un ampiezza', () => {
    expect(classifyAmplitude(-0.50)).toBe('reaction_fall');
  });
});

describe('ThetaReactionTracker', () => {
  it('emette UNA sola reazione per movimento, non una per campione', () => {
    const tr = new ThetaReactionTracker();
    // sale, culmina, rientra
    const r = passa(tr, [0, 0.1, 0.3, 0.5, 0.3, 0.1, 0]);
    expect(r).toHaveLength(1);
    expect(r[0].key).toBe('reaction_fall');
  });

  it('la reazione è quella del PICCO, non dell ultimo campione', () => {
    const tr = new ThetaReactionTracker();
    const [r] = passa(tr, [0, 0.5, 0.95, 0.5, 0]);
    expect(r.key).toBe('reaction_blow_down');
    expect(r.peak).toBeCloseTo(0.95, 6);
  });

  it('si data a quando il movimento È PARTITO, non a quando rientra', () => {
    // Una caduta appartiene a quando comincia: è così che il read istantaneo la ritrova
    // accanto al suo item, invece di attribuirla a quello successivo.
    const tr = new ThetaReactionTracker();
    const [r] = passa(tr, [0, 0.5, 0.5, 0.5, 0], 100);
    expect(r.startedAtSec).toBeCloseTo(100.1, 6);
    expect(r.durationSec).toBeGreaterThan(0);
  });

  it('NON emette nulla finché l ago non è rientrato', () => {
    const tr = new ThetaReactionTracker();
    expect(passa(tr, [0, 0.5, 0.6, 0.55])).toHaveLength(0);
    expect(tr.inEpisode).toBe(true);
  });

  it('il MOVIMENTO CORPOREO abbandona l episodio invece di chiuderlo', () => {
    // Una stretta delle boîtes produce una deviazione ampia che NON è carica: chiuderla la
    // scriverebbe nel journal come un blowdown.
    const tr = new ThetaReactionTracker();
    tr.push(0.5, 10);
    tr.push(0.95, 10.1, true);        // movimento corporeo
    expect(tr.inEpisode).toBe(false);
    expect(tr.push(0, 10.2)).toBeNull();
  });

  it('due movimenti separati danno DUE reazioni', () => {
    const tr = new ThetaReactionTracker();
    const r = passa(tr, [0, 0.5, 0, 0, 0.25, 0]);
    expect(r.map(x => x.key)).toEqual(['reaction_fall', 'reaction_sf']);
  });

  it('la soglia di RIENTRO è sotto quella di apertura: nessuno sfarfallio', () => {
    // Chiudere alla stessa soglia con cui si apre darebbe una raffica di letture per una sola
    // caduta, ogni volta che l'ago oscilla sul confine.
    expect(THETA_EPISODE_RELEASE).toBeLessThan(THETA_REACT_TICK);
    const tr = new ThetaReactionTracker();
    // oscilla appena sopra il tick: UN solo episodio, non uno per oscillazione
    const r = passa(tr, [0, 0.08, 0.06, 0.09, 0.07, THETA_REACT_FALL, 0]);
    expect(r).toHaveLength(1);
  });

  it('reset chiude ogni episodio in corso', () => {
    const tr = new ThetaReactionTracker();
    tr.push(0.5, 10);
    tr.reset();
    expect(tr.inEpisode).toBe(false);
  });
});
