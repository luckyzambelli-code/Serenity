import { describe, it, expect } from 'vitest';
import { SESSION_MODES, MODE_SPEC, availableModes, fallbackMode } from '../sessionMode';

describe('i modi di seduta', () => {
  it('sono cinque, e i cicli vengono prima dei metodi di Ron', () => {
    expect([...SESSION_MODES]).toEqual(['contact', 'null', 'mirror', 'tone', 'free']);
  });

  it('ognuno ha la sua riga: nessun modo senza specifica', () => {
    for (const m of SESSION_MODES) expect(MODE_SPEC[m]).toBeDefined();
  });
});

describe('quale ago impone ciascun modo', () => {
  it('i tre che girano sulla carica EEG impongono il MUSE', () => {
    expect(MODE_SPEC.contact.needle).toBe('eeg');
    expect(MODE_SPEC.null.needle).toBe('eeg');
    expect(MODE_SPEC.mirror.needle).toBe('eeg');
  });

  it('TONE impone il METER: è lui che misura la resistenza', () => {
    expect(MODE_SPEC.tone.needle).toBe('theta');
  });

  it('solo in LIBERO la scelta resta all auditor', () => {
    expect(MODE_SPEC.free.needle).toBeNull();
    const conScelta = SESSION_MODES.filter(m => MODE_SPEC[m].needle === null);
    expect(conScelta).toEqual(['free']);
  });
});

describe('quali modi si possono usare con quel che è collegato', () => {
  it('col MUSE ci sono tutti', () => {
    expect(availableModes(true)).toEqual([...SESSION_MODES]);
  });

  it('senza MUSE spariscono i tre che vivono di carica EEG', () => {
    expect(availableModes(false)).toEqual(['tone', 'free']);
  });

  it('LIBERO non sparisce mai: un ago da guardare c è comunque', () => {
    expect(availableModes(true)).toContain('free');
    expect(availableModes(false)).toContain('free');
  });

  it('un modo che arma un ciclo ha sempre bisogno dell EEG', () => {
    for (const m of SESSION_MODES) {
      if (MODE_SPEC[m].arms) expect(MODE_SPEC[m].needsEeg).toBe(true);
    }
  });
});

describe('il ripiego quando uno strumento se ne va', () => {
  it('col MUSE si torna a CONTACT', () => {
    expect(fallbackMode(true, true)).toBe('contact');
    expect(fallbackMode(true, false)).toBe('contact');
  });

  it('senza MUSE ma col meter si va su TONE', () => {
    expect(fallbackMode(false, true)).toBe('tone');
  });

  it('senza niente si va su LIBERO', () => {
    expect(fallbackMode(false, false)).toBe('free');
  });

  it('il ripiego è SEMPRE un modo disponibile — mai una scelta impossibile', () => {
    for (const hasEeg of [true, false]) {
      for (const hasTheta of [true, false]) {
        expect(availableModes(hasEeg)).toContain(fallbackMode(hasEeg, hasTheta));
      }
    }
  });
});
