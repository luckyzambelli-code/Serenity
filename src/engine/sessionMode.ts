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
  /** Il modo si regge sulla carica EEG? Senza MUSE non ha sorgente e va nascosto. */
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
 */
export const availableModes = (hasEeg: boolean): SessionMode[] =>
  SESSION_MODES.filter(m => hasEeg || !MODE_SPEC[m].needsEeg);

/**
 * Il modo su cui ripiegare quando quello scelto non è più utilizzabile — staccando il MUSE a
 * metà seduta, per esempio. Si va su TONE se il meter c'è, altrimenti su LIBERO: mai su un modo
 * che non ha sorgente, e mai lasciando l'interfaccia su una scelta impossibile.
 */
export const fallbackMode = (hasEeg: boolean, hasTheta: boolean): SessionMode =>
  hasEeg ? 'contact' : hasTheta ? 'tone' : 'free';
