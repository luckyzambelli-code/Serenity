/**
 * L'AVVIO DI SERENITY — chi audita, chi si audita, dove, e con quanta strumentazione.
 *
 * ── PERCHÉ È UNA MACCHINA, E NON QUATTRO SCHERMATE ──────────────────────────────────────────
 * Quattro domande in fila sembrano quattro schermate, e in EQUILIBRIUM lo erano: un pannello
 * per volta, ognuno con la sua logica di « posso andare avanti? ». Il risultato è che l'ordine
 * delle domande vive dentro il disegno, e cambiarlo vuol dire rifare il disegno.
 *
 * Qui l'ordine è UN DATO. La macchina sa quali domande restano, quale viene adesso, e cosa
 * cambia se una risposta ne rende un'altra inutile — chi audita da solo non ha un preclear da
 * scegliere. Il disegno chiede « che domanda è questa » e mostra dei cerchi.
 *
 * ── PERCHÉ È PURA ───────────────────────────────────────────────────────────────────────────
 * Niente React, niente `localStorage`, niente lettura di profili: entra una risposta, esce lo
 * stato dopo. Così si prova per intero senza aprire l'applicazione — e le due strade per
 * rispondere, IL DITO E LA VOCE, si provano allo stesso modo, perché sono la stessa funzione.
 *
 * ⚠️ NON È LOGICA DI AUDITING. Non decide niente di una seduta: raccoglie quattro scelte che
 * l'auditor farebbe comunque. Il sesso del preclear, che sì tocca l'auditing (è il TA di clear),
 * NON si decide qui: si legge dal profilo, che è quello condiviso con EQUILIBRIUM.
 *
 * @see docs/serenity-refonte.md — fase 4.
 */

/** Le domande, nell'ordine in cui si fanno. */
export type PassoId = 'auditor' | 'chi' | 'preclear' | 'dove' | 'modo' | 'pronto';

export interface Avvio {
  /** `null` finché non si è scelto. `'nuovo'` = va creato. */
  auditorId: string | null;
  solo: boolean | null;
  pcId: string | null;
  distanza: boolean | null;
  esperto: boolean | null;
}

export const AVVIO_VUOTO: Avvio = {
  auditorId: null, solo: null, pcId: null, distanza: null, esperto: null,
};

/**
 * QUAL È LA DOMANDA ADESSO.
 *
 * ⚠️ « Preclear » si SALTA quando si audita da soli, e non perché sarebbe scomodo chiederlo:
 * in SOLO l'auditor È il preclear, e offrirgli di sceglierne un altro sarebbe offrire uno stato
 * che non esiste. È il motivo per cui questa funzione guarda `solo` e non un contatore di passi.
 */
export function passoCorrente(a: Avvio): PassoId {
  if (a.auditorId === null) return 'auditor';
  if (a.solo === null) return 'chi';
  if (!a.solo && a.pcId === null) return 'preclear';
  // ⚠️ E NEMMENO « QUI O A DISTANZA » ESISTE IN SOLO. Segnalato in seduta: chiedeva se auditor
  // e preclear fossero nella stessa stanza a chi audita SÉ STESSO. La distanza è una proprietà
  // del legame fra due persone — senza la seconda, non c'è niente da mettere lontano. È la
  // stessa ragione per cui si salta il preclear, e me l'ero scordata qui.
  if (!a.solo && a.distanza === null) return 'dove';
  if (a.esperto === null) return 'modo';
  return 'pronto';
}

export const pronto = (a: Avvio): boolean => passoCorrente(a) === 'pronto';

/**
 * QUANTE DOMANDE RESTANO — serve al disegno per dire « ci siamo quasi » senza una barra.
 *
 * ⚠️ FINCHÉ NON SI SA SE È IN SOLO, SI CONTA IL CAMMINO PIÙ LUNGO. Contando solo le domande
 * CERTE il numero poteva SALIRE: 3 all'inizio, e 3 di nuovo dopo aver scelto « con un preclear »
 * che ne aggiunge due. Un conto alla rovescia che sale è peggio di nessun conto — chi lo legge
 * smette di fidarsene. Così invece scende e basta: 5, 4, poi 1 (solo) oppure 3 (preclear).
 */
export function restano(a: Avvio): number {
  let n = 0;
  if (a.auditorId === null) n++;
  if (a.esperto === null) n++;
  if (a.solo === null) {
    n += 1     // « da solo o con un preclear »
       + 2;    // e le due che quella risposta può ancora aprire
  } else if (!a.solo) {
    // Con un preclear, le due domande esistono davvero.
    if (a.pcId === null) n++;
    if (a.distanza === null) n++;
  }
  // In SOLO non si aggiunge nulla: né il preclear né la distanza sono domande.
  return n;
}

/**
 * UNA RISPOSTA ENTRA.
 *
 * Rende SEMPRE un oggetto nuovo: chi tiene il precedente lo ritrova intero, ed è così che
 * « torna indietro » qui sotto può funzionare senza copie difensive.
 */
export function rispondi(a: Avvio, passo: PassoId, valore: string | boolean): Avvio {
  switch (passo) {
    case 'auditor':
      return { ...a, auditorId: String(valore) };
    case 'chi': {
      const solo = valore === true || valore === 'solo';
      // ⚠️ Passando a SOLO si SCORDA il preclear scelto prima. Se restasse, tornando indietro
      // due volte si finirebbe in seduta SOLO con un preclear appeso — e il rapporto direbbe
      // due persone dove ce n'è una.
      //
      // E la distanza si DECIDE: in SOLO si è per forza dove si è, quindi `false` — chi legge
      // trova sempre un valore, non un « non chiesto » da interpretare. Tornando invece a
      // « con un preclear » la si rimette a null, o la domanda resterebbe saltata per sempre.
      return solo
        ? { ...a, solo: true, pcId: null, distanza: false }
        : { ...a, solo: false, distanza: null };
    }
    case 'preclear':
      return { ...a, pcId: String(valore) };
    case 'dove':
      return { ...a, distanza: valore === true || valore === 'distanza' };
    case 'modo':
      return { ...a, esperto: valore === true || valore === 'esperto' };
    case 'pronto':
      return a;
  }
}

/** TORNA INDIETRO di una domanda: si cancella l'ultima risposta data, non la corrente. */
export function indietro(a: Avvio): Avvio {
  if (a.esperto !== null) return { ...a, esperto: null };
  // In SOLO la distanza non è mai stata CHIESTA (vale `false` perché è ovvia): tornare indietro
  // non deve svuotarla, o comparirebbe una domanda che non era stata fatta. Si risale a « chi ».
  if (!a.solo && a.distanza !== null) return { ...a, distanza: null };
  if (!a.solo && a.pcId !== null) return { ...a, pcId: null };
  if (a.solo !== null) return { ...a, solo: null, pcId: null, distanza: null };
  if (a.auditorId !== null) return { ...a, auditorId: null };
  return a;
}

// ── LA VOCE ─────────────────────────────────────────────────────────────────────────────────
// Le stesse quattro domande, dette invece che toccate. Non è una comodità: all'avvio l'auditor
// ha spesso le mani occupate — le lattine, la cuffia, il preclear che si sistema.
//
// ⚠️ Si riconoscono solo le domande a DUE VIE. « Quale auditor » e « quale preclear » sono
// nomi di persone, e un nome capito male sceglierebbe LA PERSONA SBAGLIATA e le attribuirebbe
// la seduta. Un errore che si scopre a rapporto fatto, cioè troppo tardi: quelli si toccano.

/** Le parole che valgono per una scelta, nelle cinque lingue. Tutte minuscole e senza accenti:
 *  il confronto passa da `normalizza`. */
const VOCABOLARIO: Record<string, string[]> = {
  solo:     ['solo', 'seul', 'alone', 'ensam', 'da solo', 'tout seul'],
  preclear: ['preclear', 'pc', 'con un preclear', 'avec un preclear', 'with a preclear'],
  qui:      ['qui', 'ici', 'here', 'aqui', 'har', 'locale', 'local', 'sul posto'],
  distanza: ['distanza', 'a distanza', 'distance', 'a distance', 'remote', 'distancia', 'distans'],
  normale:  ['normale', 'normal'],
  esperto:  ['esperto', 'expert', 'experto'],
};

/** Toglie accenti, punteggiatura e maiuscole: « À distance, » e « a distanza » vanno confrontati. */
export const normalizza = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * CHE COSA HA DETTO — per la domanda che è in corso.
 *
 * Rende `null` se non si capisce, e `null` è la risposta giusta: chiedere di nuovo costa un
 * secondo, indovinare costa una seduta attribuita alla persona sbagliata.
 */
export function ascolta(passo: PassoId, detto: string): string | null {
  const t = normalizza(detto);
  if (!t) return null;
  const cerca = (chiave: string) =>
    VOCABOLARIO[chiave].some(p => t === p || t.includes(p));

  switch (passo) {
    case 'chi': {
      // ⚠️ Si guarda se ha detto ENTRAMBE le cose. « non sono solo, c'è un preclear » contiene
      // « solo »: prendendo la prima che combacia si aprirebbe una seduta SOLO su una frase che
      // diceva il contrario.
      const s = cerca('solo'), p = cerca('preclear');
      if (s === p) return null;   // tutte e due, o nessuna delle due → non si è capito
      return s ? 'solo' : 'preclear';
    }
    case 'dove': {
      const q = cerca('qui'), d = cerca('distanza');
      if (q === d) return null;
      return q ? 'qui' : 'distanza';
    }
    case 'modo': {
      const n = cerca('normale'), e = cerca('esperto');
      if (n === e) return null;
      return n ? 'normale' : 'esperto';
    }
    default:
      // 'auditor' e 'preclear' sono nomi di persone: non si scelgono a orecchio.
      return null;
  }
}

/**
 * IL MODO SI PRENDE DA SÉ DOPO DIECI SECONDI, e prende NORMALE.
 *
 * È l'unica domanda che si risponde da sola, e la ragione è che ha una risposta giusta per
 * quasi tutti: chi vuole EXPERT lo sa e lo tocca. Le altre tre no — chi è il preclear e dove si
 * audita non hanno un valore prudente da indovinare, e sbagliarli falsa la seduta.
 */
export const MODO_AUTO_MS = 10_000;
export const MODO_AUTO = 'normale' as const;
