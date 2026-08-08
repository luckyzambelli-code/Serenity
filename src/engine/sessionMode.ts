/**
 * IL MODO DI SEDUTA — quale metodo si sta usando, e cosa ne discende.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * L'interfaccia aveva SEI comandi in TRE posti: AGO / AGO + / MIRROR / TONE (cosa si guarda),
 * MUSE / METER (quale ago), CONTACT / NULL (cosa si fa). Due file cambiavano la VESTE e una il
 * METODO, e da nessuna parte era scritto quale fosse quale. In seduta l'auditor si trovava a
 * chiedersi « quale vista? quale ago? quale bottone? » invece dell'unica domanda che conta:
 * CHE COSA STO FACENDO ADESSO.
 *
 * Qui i cinque metodi stanno sullo stesso piano — che è quel che sono. Da ciascuno DISCENDE il
 * quadrante, l'ago e i comandi: non sono più tre scelte indipendenti che l'auditor deve tenere
 * coerenti a mente.
 *
 * ── COSA NON È UN MODO ──────────────────────────────────────────────────────────────────────
 * « AGO » e « AGO + » non erano metodi: erano la SCIA accesa o spenta. Sono diventati una
 * levetta a parte, perché mescolare una preferenza di visualizzazione con la scelta del metodo
 * era proprio l'origine della confusione.
 *
 * Puro TS, nessun React: la tabella è un dato, non un componente.
 */

import type { ReadSrc } from './instantRead';

export type SessionMode = 'contact' | 'null' | 'mirror' | 'tone' | 'free';

/** L'ordine in cui compaiono nel selettore: i due cicli, i due metodi di Ron, poi il libero. */
export const SESSION_MODES: readonly SessionMode[] = ['contact', 'null', 'mirror', 'tone', 'free'] as const;

export interface ModeSpec {
  /** L'ago che il METODO impone, o null se la scelta resta all'auditor. */
  needle: ReadSrc | null;
  /**
   * Il ciclo AVANZA DA SÉ solo con la carica EEG.
   *
   * ⚠️ Non vuol più dire « va nascosto senza MUSE ». Lo voleva dire, ed era un errore mio: davo
   * per scontato che la sorgente di un ciclo fosse l'ago. Non lo è — senza strumenti restano la
   * PERCEZIONE DEL PRECLEAR e l'OBNOSI DELL'AUDITOR, che sono gli indicatori originali (il meter
   * è venuto dopo, e Ron audita senza). Quel che manca senza EEG non è il ciclo: è
   * l'AUTOMATISMO, cioè la macchina a stati che lo fa avanzare da sola. Senza, lo fa avanzare
   * l'auditor — come si è sempre fatto.
   *
   * Governa dunque l'automatismo, non la disponibilità.
   */
  needsEeg: boolean;
  /** Ha un ciclo che si arma dando l'item? */
  arms: boolean;
}

/**
 * Cosa discende da ciascun modo.
 *
 * L'AGO IMPOSTO non è una novità di questa tabella: era già così nel codice, sparso in tre
 * condizioni diverse. CONTACT, NULL e MIRROR girano su `qL`, cioè sull'EEG — mostrare l'ago
 * delle boîtes mentre si segue uno di questi cicli vorrebbe dire guardare uno strumento che al
 * ciclo non partecipa. TONE è il contrario: la resistenza la misura il METER, e il MUSE serve a
 * certificare l'istante (vedi ToneLocator). Solo in LIBERO la scelta è davvero libera.
 */
export const MODE_SPEC: Record<SessionMode, ModeSpec> = {
  contact: { needle: 'eeg',   needsEeg: true,  arms: true  },
  null:    { needle: 'eeg',   needsEeg: true,  arms: true  },
  mirror:  { needle: 'eeg',   needsEeg: true,  arms: true  },
  tone:    { needle: 'theta', needsEeg: false, arms: false },
  free:    { needle: null,    needsEeg: false, arms: false },
};

/**
 * I modi utilizzabili con gli strumenti collegati.
 *
 * Senza MUSE i tre cicli che vivono di carica EEG non hanno sorgente: lasciarli sceglibili
 * vorrebbe dire armare un ciclo che non può né avanzare né concludersi, con l'auditor che
 * aspetta un AS-IS che non può arrivare. Stessa regola già applicata ai bottoni CONTACT/NULL.
 *
 * LIBERO resta sempre: un ago da guardare c'è comunque, qualunque sia lo strumento.
 *
 * ── SENZA ALCUNO STRUMENTO: TUTTI E QUATTRO I CICLI, E NIENTE LIBERO ────────────────────────
 * Sembra il contrario della regola qui sopra, e non lo è. La regola dice « niente cicli senza
 * SORGENTE », e io avevo dato per scontato che la sorgente fosse l'ago. Non lo è: senza
 * strumenti restano la PERCEZIONE DEL PRECLEAR e l'OBNOSI DELL'AUDITOR, che sono gli indicatori
 * originali — il meter è venuto dopo, e Ron audita senza. Quel che manca non è il ciclo: è
 * l'INDICAZIONE DI CARICA, cioè il numero che accompagna il ciclo. Il ciclo lo fa avanzare
 * l'auditor, che è come si faceva prima che esistesse un ago.
 *
 * LIBERO invece cade, ed è l'unico che cade: vuol dire « solo l'ago, nessun ciclo », e senza
 * ago non resta niente da guardare. Un modo che non mostra nulla e non fa nulla.
 */
export const availableModes = (hasEeg: boolean, hasTheta: boolean): SessionMode[] =>
  hasEeg || hasTheta
    ? [...SESSION_MODES]
    // Senza NIENTE cade il solo LIBERO: vuol dire « solo l'ago », e senza ago non mostra nulla.
    : SESSION_MODES.filter(m => m !== 'free');

/**
 * Il ciclo avanza DA SOLO, o lo fa avanzare l'auditor?
 *
 * È la sola cosa che gli strumenti decidono davvero. Con la carica EEG la macchina a stati porta
 * il ciclo dal contatto all'AS-IS senza che nessuno prema nulla; senza, ogni tempo lo dichiara
 * l'auditor guardando il preclear. Il ciclo è lo stesso — cambia chi lo spinge.
 */
export const cycleIsAutomatic = (mode: SessionMode, hasEeg: boolean): boolean =>
  MODE_SPEC[mode].arms && MODE_SPEC[mode].needsEeg && hasEeg;

/**
 * Il modo su cui ripiegare quando quello scelto non è più utilizzabile.
 *
 * Ora scatta in un caso solo: si era in LIBERO e l'ultimo strumento se n'è andato. Gli altri
 * quattro restano sempre disponibili, quindi non c'è più da ripiegare per loro.
 */
export const fallbackMode = (hasEeg: boolean, hasTheta: boolean): SessionMode =>
  hasEeg ? 'contact' : hasTheta ? 'tone' : 'contact';
