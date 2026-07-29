import { describe, it, expect } from 'vitest';
import { ThetaNeedle } from '../thetaNeedle';
import { THETA_NEEDLE_SCALE, THETA_TOTAL_TA_STEP, THETA_OFFSCALE, THETA_RECENTRE,
         NEEDLE_REST_OFFSET, THETA_OFFSCALE_HOLD_SAMPLES, THETA_TA_CONFIRM_SAMPLES } from '../tuning';

/** Deviazione dell'ago RISPETTO A SET — è questa la grandezza che conta. L'ago in equilibrio
 *  riposa a SET (−0,35 su questo quadrante), non al centro: misurare l'offset assoluto
 *  legherebbe i test alla posizione di riposo invece che al comportamento. */
const dev = (offset: number) => offset - NEEDLE_REST_OFFSET;

/** Unità grezze che producono una data deviazione sul quadrante. I test si esprimono COSÌ e non
 *  con numeri fissi: la scala è una manopola da tarare in seduta, e ritararla non deve rompere
 *  test che descrivono il COMPORTAMENTO. (È già successo: cambiata la scala, tre test caduti.) */
const perOffset = (off: number) => off / THETA_NEEDLE_SCALE;

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

/** Scende GRADUALMENTE da `da` a `a`. La resistenza non fa mai salti istantanei, e un salto
 *  farebbe scattare il rilevatore di movimento corporeo — che è lì apposta per non contare gli
 *  strappi. Passi piccoli, tanti campioni ciascuno: è così che si comporta una vera discesa. */
const scendi = (n: ThetaNeedle, da: number, a: number, passi = 60) => {
  for (let i = 1; i <= passi; i++) tieni(n, da + (a - da) * (i / passi), 60);
};

describe('ThetaNeedle', () => {
  it('il braccio parte DOVE si trova la persona, non da zero', () => {
    const n = new ThetaNeedle();
    const s = n.push(RIPOSO);
    // Partire da zero manderebbe l'ago a fondo scala per i primi secondi: sembrerebbe una
    // reazione violenta che non è avvenuta.
    expect(s.arm).toBe(RIPOSO);
    expect(s.offset).toBe(NEEDLE_REST_OFFSET);   // a riposo l'ago sta su SET, non al centro
  });

  // ── IL VERSO: la cosa che non si può sbagliare ────────────────────────────────────────────
  it('la resistenza che SCENDE fa CADERE l ago (a destra)', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    // Stringere le lattine abbassa la resistenza → il grezzo scende (verificato sul meter).
    const s = n.push(RIPOSO - 300_000);
    expect(dev(s.offset)).toBeGreaterThan(0);      // si allontana da SET verso destra = caduta
  });

  it('la resistenza che SALE porta l ago a sinistra', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    expect(dev(n.push(RIPOSO + 300_000).offset)).toBeLessThan(0);
  });

  it('l ampiezza della deviazione segue la scala dichiarata', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    const scarto = 150_000;
    expect(dev(n.push(RIPOSO - scarto).offset)).toBeCloseTo(scarto * THETA_NEEDLE_SCALE, 6);
  });

  it('DOPO una reazione l ago torna su SET, non al centro', () => {
    // Segnalato in seduta: « l'ago quando si preme non torna su set ». Riposava a 0.
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    tieni(n, RIPOSO - perOffset(0.5), 60);        // reazione
    const s = tieni(n, RIPOSO, 60);               // rilascio
    expect(s.offset).toBeCloseTo(NEEDLE_REST_OFFSET, 1);
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
    const s = tieni(n, RIPOSO - perOffset(0.7), 120);
    expect(dev(s.offset)).toBeGreaterThan(0.5);
  });

  it('ma su una carica PROLUNGATA il braccio finisce per raggiungerla', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    const s = tieni(n, RIPOSO - perOffset(0.7), 40_000);   // ~11 minuti a 60/s
    expect(Math.abs(dev(s.offset))).toBeLessThan(0.2);   // l'ago è tornato su SET
    expect(s.arm).toBeLessThan(RIPOSO);             // …perché il braccio è sceso
  });

  // ── IL DIFETTO SEGNALATO IN SEDUTA: « l'ago sbatte e non rientra da solo » ────────────────
  // La soglia di fuori scala stava SOPRA il bordo del quadrante (1.3 su un asse che arriva a 1):
  // l'inseguimento veloce si fermava mentre l'ago era ANCORA fuori, quindi restava incollato al
  // bordo e da lì rientrava solo al passo lento — in pratica mai. Serve un'isteresi.
  it('si dichiara « fuori scala » quando l ago è DAVVERO al bordo, non prima', () => {
    // Due errori opposti, entrambi commessi:
    //  · soglia OLTRE il bordo (1,3 su un asse che arriva a 1) → l'ago restava incollato fuori;
    //  · soglia troppo BASSA rispetto alla corsa da SET → si diceva « fuori range » con l'ago
    //    ancora in zona LONG FALL, e il ricentraggio gli tagliava la corsa.
    // L'invariante giusto: alla soglia, l'ago è appena dentro il bordo visibile.
    const doveArriva = NEEDLE_REST_OFFSET + THETA_OFFSCALE;
    expect(doveArriva).toBeLessThanOrEqual(1);
    expect(doveArriva).toBeGreaterThan(0.9);
    expect(THETA_RECENTRE).toBeLessThan(THETA_OFFSCALE);
  });

  it('SBATTE e poi il braccio lo RIPORTA ben dentro, non solo al bordo', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    const enorme = RIPOSO - perOffset(3);            // tre volte il quadrante
    expect(n.push(enorme).offScale).toBe(true);
    const s = tieni(n, enorme, 600);                 // 10 secondi a 60/s
    expect(s.offScale).toBe(false);                  // ha smesso di ricentrare…
    expect(Math.abs(dev(s.offset))).toBeLessThanOrEqual(THETA_RECENTRE + 1e-9);  // …perché è DENTRO
  });

  it('ISTERESI: non smette di ricentrare appena rientra di un soffio', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    // Il ricentraggio parte solo dopo che il fuori scala ha RETTO — vedi il test qui sotto.
    tieni(n, RIPOSO - perOffset(3), THETA_OFFSCALE_HOLD_SAMPLES + 5);
    // deviazione appena sotto la soglia di scatto: il ricentraggio deve PROSEGUIRE,
    // altrimenti l'ago resterebbe a ridosso del bordo.
    n.push(RIPOSO - perOffset(THETA_OFFSCALE - 0.05));
    expect(n.offScale).toBe(false);        // non è più oltre la soglia…
    // …ma il braccio insegue ancora in fretta: lo si vede dal recupero.
    const prima = n.arm;
    tieni(n, RIPOSO - perOffset(THETA_OFFSCALE - 0.05), 60);
    expect(prima - n.arm).toBeGreaterThan(0);
  });

  // ── IL BLOWDOWN DEVE RESTARE VISIBILE ────────────────────────────────────────────────────
  // Segnalato in seduta: sul Theta-Meter l'ago va in blowdown e ci RESTA, da noi rientrava
  // subito perché il braccio si metteva a ricentrare all'istante.
  it('l ago resta GIU per qualche secondo prima che il braccio lo riporti', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    const giu = RIPOSO - perOffset(3);
    // Poco dopo l'inizio: fuori scala e il braccio NON si è ancora mosso apprezzabilmente.
    const deviazione = RIPOSO - giu;
    tieni(n, giu, Math.floor(THETA_OFFSCALE_HOLD_SAMPLES / 2));
    expect(n.offScale).toBe(true);
    // Il braccio lento si muove comunque un poco: il punto è che ha recuperato POCO.
    expect((RIPOSO - n.arm) / deviazione).toBeLessThan(0.1);
    // Molto dopo, il ricentraggio è partito e ne ha recuperata una fetta ben maggiore.
    tieni(n, giu, THETA_OFFSCALE_HOLD_SAMPLES + 400);
    expect((RIPOSO - n.arm) / deviazione).toBeGreaterThan(0.4);
  });

  it('il recupero è MOLTO più rapido mentre ricentra', () => {
    const dentro = new ThetaNeedle(); dentro.push(RIPOSO);
    const fuori  = new ThetaNeedle(); fuori.push(RIPOSO);
    const dev1 = perOffset(0.3), dev2 = perOffset(3);
    tieni(dentro, RIPOSO - dev1, 200);               // dentro il quadrante → braccio lento
    tieni(fuori,  RIPOSO - dev2, 200);               // fuori → braccio veloce
    expect((RIPOSO - fuori.arm) / dev2).toBeGreaterThan((RIPOSO - dentro.arm) / dev1 * 3);
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

  // ── RIFIUTO DEL MOVIMENTO CORPOREO ───────────────────────────────────────────────────────
  // Segnalato in seduta: stringendo e lasciando le lattine più volte il Theta-Meter NON conta
  // TA (riconosce il movimento corporeo), mentre noi arrivavamo a 4,5 divisioni.
  it('STRINGERE e lasciare le lattine NON conta come TA', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    n.setTaConverter((raw: number) => raw / 1_000_000);   // scala fittizia ma monotona
    for (let i = 0; i < 8; i++) {
      tieni(n, RIPOSO - 2_000_000, 40);   // stretta: forte ma BREVE (0,7 s)
      tieni(n, RIPOSO, 40);               // rilascio
    }
    // Stringere ripetutamente ABBASSA davvero la resistenza media, quindi il braccio scende
    // davvero: a distinguerlo dalla carica non basta aspettare, serve riconoscere
    // l'AGITAZIONE — l'ago spazza invece di scendere e restare.
    expect(n.bodyMotion).toBe(true);
    expect(n.totalTa).toBe(0);
  });

  it('e lo DICE, invece di lasciare il totale fermo senza spiegazione', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    expect(n.bodyMotion).toBe(false);              // a riposo, nessuna agitazione
    for (let i = 0; i < 4; i++) {
      tieni(n, RIPOSO - 2_000_000, 40);
      tieni(n, RIPOSO, 40);
    }
    expect(n.bodyMotion).toBe(true);
  });

  it('una discesa SOSTENUTA invece si conta', () => {
    const n = new ThetaNeedle();
    n.push(RIPOSO);
    n.setTaConverter((raw: number) => raw / 1_000_000);
    // Stessa ampiezza della stretta, ma che RESTA: è un blowdown vero. Si scende in modo
    // GRADUALE, come avviene davvero, per non far scattare il rilevatore di agitazione.
    scendi(n, RIPOSO, RIPOSO - 2_000_000);
    tieni(n, RIPOSO - 2_000_000, THETA_TA_CONFIRM_SAMPLES + 20_000);
    expect(n.totalTa).toBeGreaterThan(0);
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

  // ── IL TOTALE SI CONTA IN DIVISIONI DI TA QUANDO L'APPARECCHIO È TARATO ──────────────────
  // Il Theta-Meter è marcatamente NON LINEARE (scarto dalla retta 0,25 TA sui punti misurati
  // dall'utente): lo stesso numero di grezzi vale MOLTO più TA vicino a 2 che vicino a 5.
  // Contare in grezzi darebbe un totale sbagliato in modo diverso secondo dove sta il preclear.
  describe('Total TA con apparecchio tarato', () => {
    /** Scala volutamente NON lineare, come quella vera: il passo raddoppia. */
    const scala = (raw: number) => {
      const p = [[941_759, 2], [2_217_756, 3], [3_935_104, 4], [6_721_229, 5]];
      if (raw <= p[0][0]) return 2;
      for (let i = 1; i < p.length; i++) {
        if (raw <= p[i][0]) {
          const [r0, t0] = p[i - 1], [r1, t1] = p[i];
          return t0 + ((raw - r0) / (r1 - r0)) * (t1 - t0);
        }
      }
      return 5;
    };

    it('una discesa di UNA divisione conta 1.0, ovunque sulla scala', () => {
      // In BASSO (fra TA 3 e 2) e in ALTO (fra TA 5 e 4) la stessa divisione corrisponde a
      // numeri di grezzi molto diversi — ma il totale dev'essere lo stesso.
      // Si scende GRADUALMENTE, come avviene davvero: un salto istantaneo farebbe scattare il
      // rilevatore di movimento corporeo, che è lì apposta per non contare gli strappi.
      const basso = new ThetaNeedle(); basso.setTaConverter(scala);
      basso.push(2_217_756);                       // TA 3
      scendi(basso, 2_217_756, 941_759);           // scende a TA 2
      tieni(basso, 941_759, 200_000);

      const alto = new ThetaNeedle(); alto.setTaConverter(scala);
      alto.push(6_721_229);                        // TA 5
      scendi(alto, 6_721_229, 3_935_104);          // scende a TA 4
      tieni(alto, 3_935_104, 200_000);

      // È QUESTO il punto: lo stesso salto di TA vale UGUALE in fondo e in cima alla scala,
      // benché corrisponda a un numero di grezzi molto diverso. Contando in grezzi, il totale
      // in alto sarebbe stato piu' del doppio di quello in basso.
      expect(basso.totalTa).toBeCloseTo(alto.totalTa, 6);
      // …e vale circa una divisione. Il totale avanza a scatti di 0,1 e il braccio si avvicina
      // asintoticamente senza mai arrivarci: l'ultimo scatto resta indietro, quindi 0,9.
      expect(basso.totalTa).toBeGreaterThanOrEqual(0.9);
      expect(basso.totalTa).toBeLessThanOrEqual(1.0);
    });

    it('contando in GREZZI lo stesso salto varrebbe il doppio in cima — ecco perché no', () => {
      // Contro-prova senza scala: le stesse due discese, di UNA divisione ciascuna, danno
      // totali molto diversi. È il difetto che la conversione in divisioni elimina.
      const basso = new ThetaNeedle();
      basso.push(2_217_756); scendi(basso, 2_217_756, 941_759); tieni(basso, 941_759, 200_000);
      const alto = new ThetaNeedle();
      alto.push(6_721_229);  scendi(alto, 6_721_229, 3_935_104); tieni(alto, 3_935_104, 200_000);
      expect(alto.totalTa).toBeGreaterThan(basso.totalTa * 1.8);
    });

    it('agganciare una scala AZZERA il totale invece di mescolare le unità', () => {
      const n = new ThetaNeedle();
      n.push(6_721_229);
      tieni(n, 3_935_104, 100_000);                // accumula in unità GREZZE
      expect(n.totalTa).toBeGreaterThan(0);
      n.setTaConverter(scala);
      // Metà in grezzi e metà in divisioni sarebbe un numero senza significato.
      expect(n.totalTa).toBe(0);
    });
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
