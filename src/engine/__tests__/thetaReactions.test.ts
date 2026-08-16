import { describe, it, expect } from 'vitest';
import { ThetaReactionTracker, classifyAmplitude, type ThetaReaction } from '../thetaReactions';
import { ThetaNeedle } from '../thetaNeedle';
import { NEEDLE_REST_OFFSET, THETA_NEEDLE_SCALE,
         THETA_REACT_FALL, THETA_REACT_TICK, THETA_EPISODE_RELEASE } from '../tuning';

/**
 * Le reazioni sull'ago delle BOÎTES. Senza questo, ASSESSMENT prendeva le letture solo dal
 * classificatore EEG: col meter da solo ogni item risultava NULL mentre l'ago si muoveva sotto
 * gli occhi dell'auditor.
 */

/** Alimenta una serie di deviazioni, un decimo di secondo per campione.
 *  Rende TUTTE le emissioni: l'ago annuncia mentre scende, quindi un solo movimento ne produce
 *  più d'una, salendo di grado. L'ultima di ciascun episodio porta `final: true`. */
const passa = (tr: ThetaReactionTracker, devs: number[], t0 = 10) => {
  const out: ThetaReaction[] = [];
  devs.forEach((d, i) => { const r = tr.push(d, t0 + i * 0.1); if (r) out.push(r); });
  return out;
};

/** I soli VERDETTI (una riga per movimento) — ciò che finisce in archivio. */
const verdetti = (rs: ThetaReaction[]) => rs.filter(r => r.final);

describe('classifyAmplitude', () => {
  it('assegna la reazione secondo la CORSA percorsa', () => {
    expect(classifyAmplitude(1.25)).toBe('reaction_blow_down');
    expect(classifyAmplitude(0.80)).toBe('reaction_long_fall');
    expect(classifyAmplitude(0.50)).toBe('reaction_fall');
    expect(classifyAmplitude(0.32)).toBe('reaction_sf');
    expect(classifyAmplitude(0.18)).toBe('reaction_tick');
  });

  it('IL SEGNO STAMPATO È UN AMPIEZZA, non un traguardo', () => {
    // Il segno sull'arco ricorda all'auditor QUANTO l'ago deve percorrere, non dove deve
    // fermarsi (Claudio, 01/08/2026): « se parte completamente da sinistra, una fall arriverà
    // verso SET ». Le distanze qui sotto sono quindi CORSE, misurate a partire da un ago che
    // riposa a SET — il caso particolare in cui corsa e posizione coincidono.
    // +1e-9: 0,10 − (−0,35) in virgola mobile fa 0,44999999999999996, un capello SOTTO la
    // soglia. È un artefatto dei numeri, non un comportamento da fissare in un test.
    const corsa = (posizione: number) => posizione - NEEDLE_REST_OFFSET + 1e-9;
    // un CAPELLO prima del segno: non è ancora quella reazione
    expect(classifyAmplitude(corsa(-0.06) - 0.02)).not.toBe('reaction_sf');
    expect(classifyAmplitude(corsa( 0.10) - 0.02)).not.toBe('reaction_fall');
    expect(classifyAmplitude(corsa( 0.40) - 0.02)).not.toBe('reaction_long_fall');
    expect(classifyAmplitude(corsa( 0.85) - 0.02)).not.toBe('reaction_blow_down');
    // SUL segno: ci siamo
    expect(classifyAmplitude(corsa(-0.06))).toBe('reaction_sf');
    expect(classifyAmplitude(corsa( 0.10))).toBe('reaction_fall');
    expect(classifyAmplitude(corsa( 0.40))).toBe('reaction_long_fall');
    expect(classifyAmplitude(corsa( 0.85))).toBe('reaction_blow_down');
  });

  it('sotto il tick NON è una lettura: è rumore', () => {
    expect(classifyAmplitude(THETA_REACT_TICK - 0.01)).toBeNull();
    expect(classifyAmplitude(0)).toBeNull();
  });

  it('il verso non conta: una reazione è un ampiezza', () => {
    expect(classifyAmplitude(-0.50)).toBe('reaction_fall');
  });
});

describe('ThetaReactionTracker', () => {
  it('un VERDETTO solo per movimento, non uno per campione', () => {
    const tr = new ThetaReactionTracker();
    // sale, culmina, rientra
    // Una caduta sola: sale, culmina, rientra. Un verdetto, non uno per campione.
    const v = verdetti(passa(tr, [0, 0, 0.3, 0.5, 0.3, 0, 0]));
    expect(v).toHaveLength(1);
    expect(v[0].key).toBe('reaction_fall');
  });

  it('ANNUNCIA MENTRE L AGO SCENDE, salendo di grado', () => {
    // È così che si legge un meter: la lettura cresce sotto gli occhi. Aspettare la fine
    // dell'oscillazione voleva dire scriverla un secondo dopo averla vista.
    // Alimentato a 60/s come l'apparecchio vero: una caduta lenta che attraversa i segni.
    const tr = new ThetaReactionTracker();
    const r: ThetaReaction[] = [];
    let t = 0;
    const rampa = (da: number, a: number, sec: number) => {
      const n = Math.round(sec * 60);
      for (let i = 1; i <= n; i++) { t += 1 / 60; const x = tr.push(da + (a - da) * (i / n), t); if (x) r.push(x); }
    };
    rampa(0, 0.85, 1.2);      // scende piano fino a LONG FALL
    rampa(0.85, 0.40, 0.4);   // rientra → verdetto
    const gradi = r.filter(x => !x.final).map(x => x.key);
    expect(gradi[0]).toBe('reaction_tick');
    expect(gradi).toContain('reaction_sf');
    expect(gradi).toContain('reaction_fall');
    expect(gradi[gradi.length - 1]).toBe('reaction_long_fall');
    expect(new Set(r.map(x => x.id)).size).toBe(1);       // un solo episodio
    expect(r[r.length - 1].final).toBe(true);
  });

  it('MAI al ribasso: il rientro non riscrive la lettura', () => {
    const tr = new ThetaReactionTracker();
    const r: ThetaReaction[] = [];
    let t = 0;
    const rampa = (da: number, a: number, sec: number) => {
      const n = Math.round(sec * 60);
      for (let i = 1; i <= n; i++) { t += 1 / 60; const x = tr.push(da + (a - da) * (i / n), t); if (x) r.push(x); }
    };
    rampa(0, 0.80, 0.8);
    rampa(0.80, 0.60, 0.6);   // rientra attraversando FALL: non deve riscrivere « fall »
    const dopo = r.filter(x => !x.final).map(x => x.key);
    expect(dopo[dopo.length - 1]).toBe('reaction_long_fall');
  });

  it('un CAMPIONE isolato oltre la soglia NON è una reazione', () => {
    // È il rumore: annunciarlo scriveva reazioni che l'auditor non vedeva.
    const tr = new ThetaReactionTracker();
    const r: ThetaReaction[] = [];
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      const x = tr.push(i === 60 ? 0.9 : 0, t);   // un solo campione, poi più niente
      if (x) r.push(x);
    }
    expect(r).toHaveLength(0);
  });

  it('la reazione è quella del PICCO, non dell ultimo campione', () => {
    const tr = new ThetaReactionTracker();
    const [r] = verdetti(passa(tr, [0, 0.5, 1.25, 0.5, 0]));
    expect(r.key).toBe('reaction_blow_down');
    // `peak` è la CORSA, non la posizione: l'ago è arrivato a 1,25 partendo da una base che
    // nel frattempo era salita di un soffio, quindi ha percorso poco MENO di 1,25.
    expect(r.peak).toBeLessThan(1.25);
    expect(r.peak).toBeGreaterThan(1.10);
  });

  it('si data a quando il movimento È PARTITO, non a quando supera la soglia', () => {
    // Una caduta appartiene a quando comincia: è così che l'instant read la ritrova accanto al
    // suo item. Si data all'ULTIMO istante in cui l'ago era ancora fermo (qui t=100), non a
    // quello in cui ha superato la soglia di lettura (t=100,1): su una caduta lenta quel
    // percorso vale mezzo secondo, e mezzo secondo fa cadere la lettura fuori dalla parola.
    const tr = new ThetaReactionTracker();
    const [r] = verdetti(passa(tr, [0, 0.5, 0.5, 0.5, 0], 100));
    expect(r.startedAtSec).toBeCloseTo(100, 6);
    expect(r.durationSec).toBeGreaterThan(0);
  });

  it('finché l ago è in corsa annuncia, ma NON dà il verdetto', () => {
    const tr = new ThetaReactionTracker();
    const r = passa(tr, [0, 0.5, 0.6, 0.55]);
    expect(r.length).toBeGreaterThan(0);        // la lettura c'è subito
    expect(verdetti(r)).toHaveLength(0);        // ma l'oscillazione non è finita
    expect(tr.inEpisode).toBe(true);
  });

  it('il MOVIMENTO CORPOREO non acceca il classificatore', () => {
    // Prima l'agitazione abbandonava l'episodio. Sembrava prudente, ma resta alta TRE SECONDI
    // dopo ogni stretta: in seduta si perdevano così anche gli item veri che seguivano. Ora si
    // legge lo stesso, e la lettura sbagliata si RITIRA quando l'agitazione compare (in App).
    const tr = new ThetaReactionTracker();
    let t = 0;
    const out: ThetaReaction[] = [];
    for (let i = 0; i < 30; i++) { t += 1/60; const r = tr.push(0.5 * (i/30), t, true); if (r) out.push(r); }
    for (let i = 0; i < 30; i++) { t += 1/60; const r = tr.push(0.5, t, true); if (r) out.push(r); }
    expect(out.length).toBeGreaterThan(0);          // la lettura ESCE, anche con agitazione
  });

  it('due movimenti separati danno DUE reazioni', () => {
    const tr = new ThetaReactionTracker();
    // Ogni movimento TIENE qualche decimo di secondo: un campione isolato è rumore, non una
    // reazione, e non deve aprire nulla.
    const v = verdetti(passa(tr, [0, 0.5, 0.5, 0, 0, 0.32, 0.32, 0]));
    expect(v.map(x => x.key)).toEqual(['reaction_fall', 'reaction_sf']);
    expect(v[0].id).not.toBe(v[1].id);
  });

  it('la soglia di RIENTRO è sotto quella di apertura: nessuno sfarfallio', () => {
    // Chiudere alla stessa soglia con cui si apre darebbe una raffica di letture per una sola
    // caduta, ogni volta che l'ago oscilla sul confine.
    expect(THETA_EPISODE_RELEASE).toBeLessThan(THETA_REACT_TICK);
    const tr = new ThetaReactionTracker();
    // Alimentato a 60/s: un tremolio appena sopra il tick, poi una caduta vera che TIENE.
    const r: ThetaReaction[] = [];
    let t = 0;
    const tieni = (v: number, sec: number) => {
      for (let i = 0; i < Math.round(sec * 60); i++) { t += 1 / 60; const x = tr.push(v, t); if (x) r.push(x); }
    };
    // Sei attraversamenti della soglia del tick, avanti e indietro di un capello. Se aprire e
    // chiudere avessero la stessa soglia, sarebbero sei letture: una per oscillazione.
    for (let i = 0; i < 6; i++) { tieni(THETA_REACT_TICK + 0.005, 0.15); tieni(THETA_REACT_TICK - 0.005, 0.15); }
    expect(verdetti(r).length).toBeLessThanOrEqual(2);
    const dopoTremolio = verdetti(r).length;
    tieni(THETA_REACT_FALL + 0.05, 0.4);                                    // caduta vera
    tieni(0.05, 0.4);                                                       // rientro
    expect(verdetti(r)).toHaveLength(dopoTremolio + 1);                     // UNA lettura in più
  });

  it('reset chiude ogni episodio in corso', () => {
    const tr = new ThetaReactionTracker();
    tr.push(0.5, 10);
    tr.reset();
    expect(tr.inEpisode).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// RIENTRO PARZIALE — l'ago vero non torna a SET in fretta: il suo riposo è il braccio, che
// inseguendo la resistenza rientra in decine di secondi. Aspettarlo faceva arrivare la lettura
// quando l'item era passato da tempo, e ASSESSMENT diceva NULL con l'ago appena caduto.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaReactionTracker — chiusura al rientro parziale', () => {
  it('legge la caduta appena l\'ago comincia a rientrare, senza attendere SET', () => {
    const tr = new ThetaReactionTracker();
    let out: ThetaReaction | null = null;
    // Caduta a 0,6 (una « fall ») in mezzo secondo.
    for (let i = 1; i <= 30; i++) { const r = tr.push(0.6 * (i / 30), i / 60); if (r?.final) out = r; }
    expect(out).toBeNull();          // annuncia, ma il verdetto non c'è ancora
    // Rientro del 40 % del picco: 0,6 → 0,36. L'ago è ancora LONTANO da SET.
    for (let i = 1; i <= 20; i++) { const r = tr.push(0.6 - 0.24 * (i / 20), 0.5 + i / 60); if (r?.final) out = r; }
    expect(out).not.toBeNull();
    expect(out!.key).toBe('reaction_fall');
    expect(out!.peak).toBeCloseTo(0.6, 2);
  });

  it('NON riconta la stessa caduta durante il lungo rientro del braccio', () => {
    const tr = new ThetaReactionTracker();
    let letture = 0;
    let t = 0;
    const passo = (da: number, a: number, sec: number) => {
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 1; i <= n; i++) { t += 1 / 60; if (tr.push(da + (a - da) * (i / n), t)?.final) letture++; }
    };
    passo(0, 0.6, 0.5);      // caduta
    passo(0.6, 0.36, 0.3);   // rientro parziale → UNA lettura
    passo(0.36, 0.10, 12);   // il braccio rientra piano piano
    expect(letture).toBe(1);
  });

  it('un movimento NUOVO più ampio si legge anche senza rientro completo', () => {
    const tr = new ThetaReactionTracker();
    let ultima = null;
    let t = 0;
    const passo = (da: number, a: number, sec: number) => {
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 1; i <= n; i++) { t += 1 / 60; const r = tr.push(da + (a - da) * (i / n), t); if (r?.final) ultima = r; }
    };
    passo(0, 0.50, 0.5);       // fall
    passo(0.50, 0.28, 0.3);    // rientro parziale → lettura « fall »
    expect(ultima!.key).toBe('reaction_fall');
    passo(0.28, 1.25, 0.8);    // riparte e va MOLTO più giù
    passo(1.25, 0.70, 0.4);    // rientra → seconda lettura, più forte
    expect(ultima!.key).toBe('reaction_blow_down');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// L'AMPIEZZA È UNA CORSA, NON UNA POSIZIONE
//
// « Il segno stampato sul quadrante è solo per ricordare all'auditor l'ampiezza, non che l'ago
// deve fermarsi lì. Se parte completamente da sinistra, vuol dire che una fall arriverà verso
// SET » — Claudio, 01/08/2026.
//
// Prima si classificava su |deviazione da SET|, cioè su DOVE l'ago era arrivato. Due errori,
// entrambi misurati nella seduta del 01/08:
//   • 0,176 di movimento a −0,08→0,09 = « Tick », e 0,192 a 0,23→0,42 = « SF »: stessa corsa,
//     due gradi di distanza, decisi dalla manopola;
//   • col valore assoluto, un ago posato a sinistra che cade VERSO SET fa DIMINUIRE quel
//     numero: la caduta era invisibile.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaReactionTracker — l ampiezza è la CORSA, non la posizione', () => {
  /** Porta l'ago da dov'è a `a` in `sec` secondi, a 60 campioni/s. */
  const verso = (tr: ThetaReactionTracker, st: { t: number; da: number },
                 a: number, sec: number, out: ThetaReaction[]) => {
    const n = Math.max(1, Math.round(sec * 60));
    const d0 = st.da;
    for (let i = 1; i <= n; i++) {
      st.t += 1 / 60;
      const r = tr.push(d0 + (a - d0) * (i / n), st.t);
      if (r) out.push(r);
    }
    st.da = a;
  };

  /** Una caduta di `corsa` che PARTE da `partenza`, dopo che l'ago si è posato lì. */
  const cadutaDa = (partenza: number, corsa: number) => {
    const tr = new ThetaReactionTracker();
    const st = { t: 0, da: 0 };
    const out: ThetaReaction[] = [];
    verso(tr, st, partenza, 4, out);              // ci arriva PIANO: è il braccio, non una lettura
    verso(tr, st, partenza, 4, out);              // e ci si posa: la base lo raggiunge
    const prima = out.length;
    verso(tr, st, partenza + corsa, 0.5, out);    // LA CADUTA
    verso(tr, st, partenza + corsa * 0.4, 0.5, out); // rientro → verdetto
    return out.slice(prima).filter(r => r.final);
  };

  it('la STESSA corsa dà la STESSA lettura, ovunque sia posato l ago', () => {
    const basso = cadutaDa(0.00, 0.35);
    const alto  = cadutaDa(0.50, 0.35);
    expect(basso).toHaveLength(1);
    expect(alto).toHaveLength(1);
    expect(alto[0].key).toBe(basso[0].key);
    expect(alto[0].peak).toBeCloseTo(basso[0].peak, 2);
  });

  it('una caduta che PARTE A SINISTRA di SET e arriva verso SET si legge', () => {
    // Il caso che il valore assoluto cancellava: da −0,30 a +0,05 sono 0,35 di caduta netta,
    // ma |dev| va 0,30 → 0 → 0,05, cioè SCENDE. Prima non usciva niente.
    const v = cadutaDa(-0.30, 0.35);
    expect(v).toHaveLength(1);
    expect(v[0].peak).toBeCloseTo(0.35, 1);
  });

  it('e vale la stessa lettura di quella partita da SET', () => {
    expect(cadutaDa(-0.30, 0.35)[0].key).toBe(cadutaDa(0, 0.35)[0].key);
  });

  it('un ago posato LONTANO che si muove appena NON è una long fall', () => {
    // L'errore vero e proprio: parcheggiato a 0,70, un movimento di 0,10 dava « Long Fall »
    // perché 0,80 supera il segno. Adesso è quello che è: un tick.
    const v = cadutaDa(0.70, 0.10);
    expect(v).toHaveLength(1);
    expect(v[0].key).toBe('reaction_tick');
  });

  it('ma il BLOW DOWN resta una posizione: corsa lunga E bordo raggiunto', () => {
    // È l'unica reazione che non è un'ampiezza: l'ago finisce contro il bordo destro e
    // obbliga a scendere con la manopola. Stessa regola del classificatore MUSE.
    const alBordo = cadutaDa(0.50, 0.80);      // arriva a 1,30 — oltre il bordo
    expect(alBordo[0].key).toBe('reaction_blow_down');
    const stessaCorsa = cadutaDa(0.00, 0.80);  // stessa corsa, ma resta a metà quadrante
    expect(stessaCorsa[0].key).toBe('reaction_long_fall');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA CATENA INTERA — è qui che le reazioni sparivano
// L'ago vero (ThetaNeedle) produce la deviazione, il classificatore la legge. Presi da soli i
// due moduli funzionavano; messi insieme, il rilevatore di agitazione scartava le cadute e non
// usciva NIENTE. Questa prova percorre la catena come in seduta.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaNeedle → ThetaReactionTracker (catena reale)', () => {
  const RIPOSO = 9_000_000;

  /** Fa girare la catena come nel hook: grezzo → ago → deviazione → classificatore. */
  const seduta = (grezzi: number[]) => {
    const ago = new ThetaNeedle();
    const tr = new ThetaReactionTracker();
    const out: { key: string; peak: number }[] = [];
    grezzi.forEach((g, i) => {
      const st = ago.push(g);
      const r = tr.push(st.offset - NEEDLE_REST_OFFSET, i / 60, st.bodyMotion);
      if (r?.final) out.push({ key: r.key, peak: r.peak });
    });
    return out;
  };

  it('una caduta vera produce UNA lettura', () => {
    const g: number[] = [];
    for (let i = 0; i < 60; i++) g.push(RIPOSO);                       // riposo
    const giu = RIPOSO - 0.6 / THETA_NEEDLE_SCALE;
    for (let i = 1; i <= 90; i++) g.push(RIPOSO + (giu - RIPOSO) * (i / 90));   // caduta
    for (let i = 1; i <= 120; i++) g.push(giu + (RIPOSO - giu) * (i / 120) * 0.5); // rientro
    const letture = seduta(g);
    expect(letture.length).toBeGreaterThanOrEqual(1);
    expect(['reaction_fall', 'reaction_long_fall', 'reaction_blow_down']).toContain(letture[0].key);
  });

  it('l\'ago fermo non produce niente', () => {
    const g = Array.from({ length: 600 }, () => RIPOSO);
    expect(seduta(g)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// « VEDO E NON INDICHI » — i casi in cui l'auditor vedeva e l'app taceva
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaReactionTracker — nessuna reazione visibile va persa', () => {
  /** Alimenta a 60/s da `da` a `a` in `sec` secondi, e poi TIENE. */
  const muovi = (tr: ThetaReactionTracker, stato: { t: number; ultimo: number },
                 a: number, sec: number, out: string[]) => {
    const n = Math.max(1, Math.round(sec * 60));
    const da = stato.ultimo;
    for (let i = 1; i <= n; i++) {
      stato.t += 1 / 60;
      const r = tr.push(da + (a - da) * (i / n), stato.t);
      if (r?.final) out.push(r.key);
    }
    stato.ultimo = a;
  };

  it('una caduta che RESTA GIÙ si legge lo stesso', () => {
    // Il braccio la riporta su in decine di secondi: aspettare il rientro voleva dire non
    // scrivere mai niente, mentre l'auditor aveva visto una caduta netta.
    const tr = new ThetaReactionTracker();
    const st = { t: 0, ultimo: 0 };
    const out: string[] = [];
    muovi(tr, st, 0.8, 0.6, out);      // cade
    muovi(tr, st, 0.79, 2, out);       // e resta lì
    expect(out).toEqual(['reaction_long_fall']);
  });

  it('un secondo movimento durante il lungo rientro NON si perde', () => {
    // Prima si pretendeva un movimento più ampio del precedente finché l'ago non era tornato
    // a riposo: per decine di secondi ogni nuova reazione era invisibile all'app.
    const tr = new ThetaReactionTracker();
    const st = { t: 0, ultimo: 0 };
    const out: string[] = [];
    muovi(tr, st, 0.9, 0.6, out);      // long fall
    muovi(tr, st, 0.5, 0.5, out);      // rientro parziale — il braccio insegue piano
    muovi(tr, st, 0.85, 0.5, out);     // RIPARTE: si vede benissimo, ed è più PICCOLA della prima
    muovi(tr, st, 0.5, 0.5, out);
    expect(out).toHaveLength(2);
  });

  it('ma la coda di UNA caduta non si sdoppia', () => {
    const tr = new ThetaReactionTracker();
    const st = { t: 0, ultimo: 0 };
    const out: string[] = [];
    muovi(tr, st, 0.8, 0.6, out);      // cade
    muovi(tr, st, 0.05, 3, out);       // rientra piano, senza ripartire
    expect(out).toEqual(['reaction_long_fall']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// « LA SCRITTA DICE UNA COSA E L'AGO NE FA UN'ALTRA »
// Il verdetto usava il PICCO grezzo — anche un guizzo di pochi millisecondi mai confermato,
// quindi mai mostrato. Alla chiusura quel grado compariva di colpo mentre l'ago era già
// rientrato. Il verdetto deve essere il grado più alto REALMENTE MOSTRATO.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaReactionTracker — niente si scrive senza essere stato visto', () => {
  const rampa = (tr: ThetaReactionTracker, st: { t: number; da: number },
                 a: number, sec: number, out: ThetaReaction[]) => {
    const n = Math.max(1, Math.round(sec * 60));
    const da = st.da;
    for (let i = 1; i <= n; i++) {
      st.t += 1 / 60;
      const r = tr.push(da + (a - da) * (i / n), st.t);
      if (r) out.push(r);
    }
    st.da = a;
  };

  it('un guizzo NON confermato non entra nel verdetto', () => {
    const tr = new ThetaReactionTracker();
    const st = { t: 0, da: 0 };
    const out: ThetaReaction[] = [];
    rampa(tr, st, 0.60, 0.5, out);     // fall
    rampa(tr, st, 0.60, 0.25, out);    // …e TIENE: così la fall è davvero confermata
    rampa(tr, st, 1.30, 0.03, out);    // guizzo fino al bordo: 30 ms, non si vede
    rampa(tr, st, 0.60, 0.03, out);    // e via
    rampa(tr, st, 0.20, 0.5, out);     // rientra → verdetto
    const v = out.filter(r => r.final);
    expect(v).toHaveLength(1);
    expect(v[0].key).toBe('reaction_fall');          // NON blow_down
    expect(v[0].peak).toBeGreaterThan(0.9);          // la corsa grezza resta, per l'archivio
  });

  it('il verdetto è SEMPRE uno dei gradi già mostrati', () => {
    const tr = new ThetaReactionTracker();
    const st = { t: 0, da: 0 };
    const out: ThetaReaction[] = [];
    rampa(tr, st, 0.85, 1.0, out);
    rampa(tr, st, 0.30, 0.6, out);
    const mostrati = out.filter(r => !r.final).map(r => r.key);
    const v = out.find(r => r.final)!;
    expect(mostrati).toContain(v.key);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// L'AGO PARCHEGGIATO LONTANO DA SET
// Misurato in seduta (31/07/2026): movimenti di 0,29–0,34 e NESSUNA lettura per quaranta
// secondi. Il braccio insegue in venti secondi, quindi dopo una caduta l'ago resta lontano da
// SET — e la base da cui misuravo restava inchiodata al punto dell'ultima lettura.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaReactionTracker — la base segue l ago, non SET', () => {
  const alimenta = (tr: ThetaReactionTracker, st: { t: number }, v: number, sec: number,
                    out: ThetaReaction[]) => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      st.t += 1 / 60;
      const r = tr.push(v, st.t);
      if (r) out.push(r);
    }
  };
  const rampa = (tr: ThetaReactionTracker, st: { t: number }, da: number, a: number, sec: number,
                 out: ThetaReaction[]) => {
    const n = Math.round(sec * 60);
    for (let i = 1; i <= n; i++) {
      st.t += 1 / 60;
      const r = tr.push(da + (a - da) * (i / n), st.t);
      if (r) out.push(r);
    }
  };

  it('un ago rimasto lontano da SET continua a farsi leggere', () => {
    const tr = new ThetaReactionTracker();
    const st = { t: 0 };
    const out: ThetaReaction[] = [];
    rampa(tr, st, 0, 0.60, 0.6, out);        // una caduta
    rampa(tr, st, 0.60, 0.30, 0.5, out);     // rientra a metà — il braccio è indietro
    alimenta(tr, st, 0.30, 4, out);          // e resta lì: la base deve raggiungerlo
    const prima = out.length;
    rampa(tr, st, 0.30, 0.62, 0.5, out);     // NUOVO movimento, visibile: 0,32 di scarto
    rampa(tr, st, 0.62, 0.30, 0.4, out);
    expect(out.length).toBeGreaterThan(prima);          // si è fatto leggere
    expect(verdetti(out).length).toBeGreaterThanOrEqual(2);
  });

  it('ma l assestamento lento NON è una lettura', () => {
    // L'ago che scivola via piano piano è il braccio che lavora, non una reazione.
    const tr = new ThetaReactionTracker();
    const st = { t: 0 };
    const out: ThetaReaction[] = [];
    rampa(tr, st, 0, 0.5, 20, out);          // mezzo quadrante in VENTI secondi
    expect(verdetti(out)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// UNA LETTURA È VELOCE — la deriva no
// Abbassata la soglia al livello del rumore, la DERIVA ha cominciato a superarla e a scriversi
// come « Tick »: scritte che l'auditor non trovava sull'ago (segnalato in seduta, 01/08/2026).
// L'ampiezza da sola non distingue i due casi; la velocità sì.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaReactionTracker — velocità, non solo ampiezza', () => {
  const percorri = (tr: ThetaReactionTracker, da: number, a: number, sec: number,
                    st: { t: number }, out: ThetaReaction[]) => {
    const n = Math.max(1, Math.round(sec * 60));
    for (let i = 1; i <= n; i++) {
      st.t += 1 / 60;
      const r = tr.push(da + (a - da) * (i / n), st.t);
      if (r) out.push(r);
    }
  };

  it('la DERIVA misurata in seduta NON è una lettura', () => {
    // 0,25 di quadrante in 4 secondi = 0,06 al secondo: è il braccio che rientra.
    const tr = new ThetaReactionTracker();
    const st = { t: 0 };
    const out: ThetaReaction[] = [];
    percorri(tr, 0, 0.25, 4, st, out);
    percorri(tr, 0.25, 0.25, 2, st, out);
    expect(verdetti(out)).toHaveLength(0);
  });

  it('la stessa ampiezza, ma VELOCE, è una lettura', () => {
    // 0,25 in mezzo secondo = 0,5 al secondo. Stessa distanza, dieci volte più in fretta.
    const tr = new ThetaReactionTracker();
    const st = { t: 0 };
    const out: ThetaReaction[] = [];
    percorri(tr, 0, 0, 1, st, out);
    percorri(tr, 0, 0.25, 0.5, st, out);
    percorri(tr, 0.25, 0, 0.6, st, out);
    expect(verdetti(out).length).toBeGreaterThanOrEqual(1);
  });

  it('una long fall LENTA resta una lettura', () => {
    // 0,70 in 2,5 s = 0,28 al secondo: sotto la fall tipica, ben sopra la deriva.
    const tr = new ThetaReactionTracker();
    const st = { t: 0 };
    const out: ThetaReaction[] = [];
    percorri(tr, 0, 0, 1, st, out);
    percorri(tr, 0, 0.70, 2.5, st, out);
    percorri(tr, 0.70, 0.35, 0.8, st, out);
    expect(verdetti(out).length).toBeGreaterThanOrEqual(1);
  });
});

describe('la prova delle lattine NON è una reazione', () => {
  /**
   * ⚠️ Segnalato in seduta: « scrivi delle reazioni del METER che non ci sono ».
   *
   * La stretta delle lattine fa cadere l'ago di un terzo di quadrante — è il suo SCOPO. Ma il
   * classificatore vede solo un'ampiezza, e quella caduta la chiamava LONG FALL: finiva nel
   * giornale, nell'archivio, e fra le LETTURE su cui ASSESSMENT giudica l'item in corso.
   * Finché le prove si facevano prima della seduta non si vedeva; da quando la prova si può
   * RIFARE IN SEDUTA quelle righe entrano davvero — ed è la mano dell'auditor, non il preclear.
   */
  it('mentre la prova è in corso non esce niente', () => {
    const tr = new ThetaReactionTracker();
    passa(tr, [0, 0, 0], 10);
    tr.muteUntil(14);
    // una stretta intera, andata e ritorno, dentro il silenzio
    const durante = passa(tr, [0.2, 0.6, 1.0, 1.3, 0.9, 0.4, 0.05], 11);
    expect(durante).toHaveLength(0);
  });

  /**
   * ⚠️ ED È QUI CHE IL PRIMO TENTATIVO SBAGLIAVA. Azzerare al momento della prova non basta:
   * quando si MOLLANO le lattine l'ago rientra, e quel rientro è una corsa ampia quanto la
   * stretta — cioè una SECONDA reazione falsa, emessa DOPO la fine della prova. Il silenzio
   * deve durare oltre.
   */
  it('e nemmeno il RIENTRO quando si mollano le lattine, se il silenzio dura oltre', () => {
    const tr = new ThetaReactionTracker();
    passa(tr, [0, 0, 0], 10);
    tr.muteUntil(16);                                  // la prova finisce a 14, il silenzio a 16
    passa(tr, [0.2, 0.6, 1.0, 1.3], 11);               // stretta
    const rientro = passa(tr, [1.0, 0.6, 0.2, 0.02], 14.2);   // si mollano le lattine
    expect(rientro).toHaveLength(0);
  });

  it('un silenzio TROPPO CORTO lascia passare il rientro — è la ragione della costante', () => {
    // Il contro-esempio: senza margine dopo la prova, il rientro diventa una reazione.
    const tr = new ThetaReactionTracker();
    passa(tr, [0, 0, 0], 10);
    tr.muteUntil(14);
    passa(tr, [0.2, 0.6, 1.0, 1.3], 11);
    const rientro = passa(tr, [1.3, 1.3, 1.3, 0.9, 0.5, 0.1, 0, 0], 14.1);
    expect(rientro.length).toBeGreaterThan(0);
  });

  it('finito il silenzio il classificatore RIPARTE: la reazione vera si vede', () => {
    // Il test di riarmo: tacere non deve lasciare il motore muto per il resto della seduta.
    const tr = new ThetaReactionTracker();
    tr.muteUntil(14);
    passa(tr, [0.5, 1.0, 0.5], 11);
    const vera = passa(tr, [0, 0, 0, 0.3, 0.6, THETA_REACT_FALL + 0.1,
                            0.3, 0.05, 0, 0], 20);
    expect(verdetti(vera).length).toBeGreaterThanOrEqual(1);
  });

  it('`reset` NON toglie il silenzio, `resetAll` sì — se no si annullerebbe da sé', () => {
    // `muteUntil` chiama `reset`: se `reset` togliesse il silenzio, non ci sarebbe mai silenzio.
    const tr = new ThetaReactionTracker();
    tr.muteUntil(20);
    expect(tr.isMuted(15)).toBe(true);
    tr.reset();
    expect(tr.isMuted(15)).toBe(true);
    tr.resetAll();
    expect(tr.isMuted(15)).toBe(false);
  });
});
