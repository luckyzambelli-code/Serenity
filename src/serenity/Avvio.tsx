/**
 * L'AVVIO — quattro domande, in cerchi.
 *
 * ── PERCHÉ NON È UNA PROCEDURA GUIDATA ──────────────────────────────────────────────────────
 * Una procedura guidata mette una domanda per schermata, con avanti e indietro in fondo: si
 * legge, si clicca, si aspetta la successiva. Qui le risposte SONO i cerchi, e non c'è nessun
 * « avanti »: si tocca la risposta e la domanda dopo prende il posto. Un gesto per domanda,
 * quattro gesti per aprire una seduta.
 *
 * ── COSA STA QUI E COSA NO ──────────────────────────────────────────────────────────────────
 * Qui c'è solo il disegno. L'ordine delle domande, cosa si scorda quando si torna indietro, e
 * cosa vuol dire una frase detta a voce stanno in `flussoAvvio.ts`, che si prova senza aprire
 * niente. I profili si leggono da `lib/storage`, lo stesso di EQUILIBRIUM — e sono gli stessi
 * profili, che è la verifica scritta per questa fase.
 *
 * ── E ADESSO LE CINQUE LINGUE ────────────────────────────────────────────────────────────────
 * « Mi raccomando, le 5 lingue »: ogni scritta passa da `useI18n()`/`t()`, lo STESSO dizionario
 * di EQUILIBRIUM (`src/i18n.tsx`, chiavi `ser_*`) — non un secondo sistema di traduzione che
 * potrebbe divergere. La lingua della SEDUTA è quella dell'auditor: appena se ne sceglie uno
 * ESISTENTE, `preferences.lang` del suo profilo diventa la lingua di schermo, esattamente come
 * fa `App.tsx` quando carica un profilo. Prima di quella scelta — o mentre lo si sta creando —
 * un piccolo selettore in alto lascia cambiare lingua a mano.
 *
 * @see docs/serenity-refonte.md — fase 4.
 */

import { useEffect, useRef, useState } from 'react';
import { User, Users, Plus, Wifi, Eye, Wrench, CircleUser, Settings, Trash2 } from 'lucide-react';
import {
  AVVIO_VUOTO, passoCorrente, restano, rispondi, indietro,
  MODO_AUTO, MODO_AUTO_MS, type Avvio as StatoAvvio, type PassoId,
} from './flussoAvvio';
import { getProfiles, getPcProfiles, type UserProfile, type PcProfile } from '../lib/storage';
import { loadHistory, daysSince, testedToday } from '../engine/canTest';
import { PannelloProfilo, type Tipo } from './PannelloProfilo';
import { PannelloConfig } from './PannelloConfig';
import type { DatiProfilo } from '../lib/profiloEdit';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import { SelettoreLingua, SelettoreTema, linguaValida } from './Impostazioni';
import { leggiConfigurazioni, eliminaConfigurazione, type ConfigurazioneSalvata } from './configurazioniStore';

/**
 * Un cerchio che si può toccare.
 *
 * ⚠️ LE INIZIALI SOLO PER LE PERSONE. Su una scelta come « con un preclear » davano « CU », che
 * si legge come le iniziali di qualcuno — e nella schermata PRIMA i cerchi erano davvero
 * persone. Una scelta non ha un ritratto: il suo cerchio resta vuoto, e a dire cosa sia è
 * l'etichetta sotto. È coerente col resto: il cerchio si coglie per posizione e dimensione,
 * non si legge.
 *
 * ── E « MODIFICA », SEMPRE VISIBILE ─────────────────────────────────────────────────────────
 * Segnalato: « on ne peut pas éditer les auditeurs et PC existants ». Non è dietro un passaggio
 * del mouse: EQUILIBRIUM tiene la matita SEMPRE a vista sulla scheda, e nasconderla dietro un
 * hover l'avrebbe resa introvabile allo stesso modo — è per quello che mancava. Il gesto è un
 * bottone SEPARATO da quello che sceglie: toccare il cerchio sceglie la persona, « modifica »
 * apre il suo profilo.
 *
 * ── E « ICONA », PER LE SCELTE CHE NON SONO PERSONE ─────────────────────────────────────────
 * Segnalato due volte: prima « da solo »/« con un preclear » restavano vuoti, poi tutti gli
 * altri cerchi senza foto — « nuovo », « qui »/« a distanza », « normale »/« esperto ». Un
 * cerchio vuoto tocca lo stesso, ma non dice nulla finché non si legge la scritta sotto —
 * mentre una sagoma dice la forma della scelta ancora prima della parola.
 *
 * ⚠️ LE ICONE NON SI INVENTANO QUI: si riprendono da dove EQUILIBRIUM la stessa scelta la
 * disegna già — stessa funzione, stessa forma, solo lo spessore del tratto (1.4, non il default
 * di lucide) e il colore (`--s-ink-soft`, mai un accento saturo) cambiano per la lingua visiva
 * di SERENITY. Da dove viene ciascuna, sotto ai punti in cui si usano: `+` da
 * `ProfileRoster.tsx` (« nuovo auditor/preclear »), Wifi/Eye da `ModeSelector.tsx` (local/
 * auditor — lo stesso `appMode` di `qui`/`a distanza`), chiave inglese/persona da
 * `Sidebar.tsx` (lo stesso interruttore esperto/normale). `icona` resta comunque generico:
 * una forma, non un colore in più.
 */
function Scelta({ etichetta, sotto, foto, persona, icona, onClick, onModifica, dimensione = 116 }: {
  etichetta: string; sotto?: string; foto?: string; persona?: boolean;
  icona?: React.ReactNode;
  onClick: () => void; onModifica?: () => void; dimensione?: number;
}) {
  const { t } = useI18n();
  const [sopra, setSopra] = useState(false);
  const iniziali = etichetta.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
  return (
    <div
      onMouseEnter={() => setSopra(true)}
      onMouseLeave={() => setSopra(false)}
      style={{ display: 'grid', justifyItems: 'center', gap: 8, fontFamily: 'var(--s-sans)' }}>
      <button
        onClick={onClick}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer',
          display: 'grid', justifyItems: 'center', gap: 12,
        }}>
        <div style={{
          width: dimensione, height: dimensione, borderRadius: '50%',
          display: 'grid', placeItems: 'center', overflow: 'hidden',
          background: 'var(--s-disc)',
          boxShadow: sopra ? 'var(--s-shadow-lift)' : 'var(--s-shadow)',
          transform: sopra ? 'translateY(-2px)' : 'none',
          transition: 'box-shadow var(--s-slow) var(--s-ease), transform var(--s-slow) var(--s-ease)',
        }}>
          {foto
            ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : persona
              ? <span style={{ fontFamily: 'var(--s-serif)', fontSize: dimensione * 0.3,
                               color: 'var(--s-ink-soft)' }}>{iniziali}</span>
              : icona
                ? <span style={{
                    color: 'var(--s-ink-soft)', display: 'flex',
                    width: dimensione * 0.4, height: dimensione * 0.4,
                  }}>{icona}</span>
                : null}
        </div>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)' }}>{etichetta}</span>
          {sotto && <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>{sotto}</span>}
        </div>
      </button>
      {onModifica && (
        <button onClick={onModifica} style={{
          border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px',
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.04em',
          color: 'var(--s-ink-faint)',
        }}>
          {t('ser_modify')}
        </button>
      )}
    </div>
  );
}


export function Avvio({ onPronto, onRichiama }: {
  onPronto: (a: StatoAvvio) => void;
  /** Richiamata una configurazione salvata: le quattro domande NON si fanno — l'avvio parte già
   *  risposto, e la scelta strumenti (che qui non vive: è del pannello dopo, in `Serenity.tsx`)
   *  viaggia insieme nello stesso oggetto. */
  onRichiama?: (cfg: ConfigurazioneSalvata) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const [stato, setStato] = useState<StatoAvvio>(AVVIO_VUOTO);
  const passo = passoCorrente(stato);
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);

  /**
   * ── LE CONFIGURAZIONI REGISTRATE — segnalato: « alla sessione successiva l'Auditor deve
   * poter richiamare una configurazione salvata... evitando di ripetere ogni passaggio
   * iniziale ». Si leggono una volta sola: create qui dentro l'avvio, un `onRichiama` fa
   * ripartire tutto da zero (nuovo `Avvio` montato) — non serve rileggerle a ogni render.
   */
  const [configurazioni, setConfigurazioni] = useState<ConfigurazioneSalvata[]>(() => leggiConfigurazioni());
  const nomeProfilo = (lista: Array<{ id: string; name: string }>, id: string | null) =>
    id === null ? '' : (lista.find(p => p.id === id)?.name ?? '—');

  // I profili sono quelli di EQUILIBRIUM, dallo stesso armadio. Si rileggono dopo ogni
  // creazione: il profilo appena fatto dev'essere lì fra gli altri, non in un elenco a parte.
  const leggi = () => {
    try { return { a: getProfiles(), p: getPcProfiles() }; } catch { return { a: [] as UserProfile[], p: [] as PcProfile[] }; }
  };
  const [liste, setListe] = useState(leggi);
  /**
   * SI STA CREANDO O MODIFICANDO un profilo? È uno stato del DISEGNO, non del flusso: la
   * macchina delle domande non deve sapere che esiste un modo di crearne o cambiarne uno.
   * `esistente` assente = si crea; presente = si modifica QUELLO.
   */
  const [pannello, setPannello] = useState<{ tipo: Tipo; esistente?: DatiProfilo } | null>(null);
  /** CONFIG — segnalato assente: « inserisci CONFIG all'inizio del flusso di SERENITY ». Una
   *  deviazione come `pannello`, non un passo delle quattro domande: si può aprire da qualunque
   *  punto dell'avvio e si torna esattamente dov'era. */
  const [configAperto, setConfigAperto] = useState(false);

  const dai = (v: string | boolean) => setStato(s => rispondi(s, passoCorrente(s), v));

  /**
   * SCEGLIERE L'AUDITOR SCEGLIE ANCHE LA LINGUA — se il suo profilo ne ha una. È lo stesso
   * momento in cui `App.tsx` lo fa quando carica un profilo (`setLang(p.preferences.lang)`):
   * la lingua è un dato DELL'AUDITOR, non dell'applicazione.
   */
  const scegliAuditor = (p: UserProfile) => {
    const l = linguaValida(p.preferences?.lang);
    if (l) setLang(l);
    dai(p.id);
  };

  /**
   * LA PROVA DELLE LATTINE DI QUESTO PRECLEAR.
   *
   * ⚠️ Si mostra QUI, quando lo si sceglie, e non altrove: è il momento in cui si decide se
   * farla. « Che fa fede sono le due lattine » — senza una prova di oggi si toglie una
   * divisione dalla scala del tono, e chi sceglie il preclear deve poterlo sapere prima, non
   * scoprirlo a rapporto fatto.
   */
  const lattine = (nome: string): string => {
    try {
      const h = loadHistory(nome);
      if (!h.tests.length) return t('ser_cans_never');
      if (testedToday(h, Date.now())) return t('ser_cans_today');
      const g = daysSince(h, Date.now());
      return g === 1 ? t('ser_cans_yesterday') : t('ser_cans_days_ago').replace('{n}', String(g));
    } catch { return ''; }
  };

  useEffect(() => { if (passo === 'pronto') onPronto(stato); }, [passo, stato, onPronto]);

  /**
   * IL MODO SI PRENDE DA SÉ DOPO DIECI SECONDI.
   *
   * ⚠️ È L'UNICA domanda che lo fa, e la ragione è che ha una risposta giusta per quasi tutti:
   * chi vuole EXPERT lo sa e lo tocca. Le altre tre non hanno un valore prudente da indovinare
   * — chi è il preclear e dove si audita, sbagliati, falsano la seduta.
   */
  const [rimasti, setRimasti] = useState(MODO_AUTO_MS);
  const statoRef = useRef(stato); statoRef.current = stato;
  useEffect(() => {
    if (passo !== 'modo') { setRimasti(MODO_AUTO_MS); return; }
    const t0 = Date.now();
    const id = setInterval(() => {
      const r = MODO_AUTO_MS - (Date.now() - t0);
      setRimasti(Math.max(0, r));
      if (r <= 0) {
        clearInterval(id);
        setStato(s => rispondi(s, 'modo', MODO_AUTO));
      }
    }, 100);
    return () => clearInterval(id);
  }, [passo]);

  const opzioni = () => {
    switch (passo) {
      case 'auditor':
        return <>
          {liste.a.map(p => (
            <Scelta key={p.id} etichetta={p.name} foto={p.photo} persona onClick={() => scegliAuditor(p)}
                    onModifica={() => setPannello({ tipo: 'auditor',
                      esistente: { id: p.id, nome: p.name, foto: p.photo, sesso: p.sex } })} />
          ))}
          <Scelta etichetta={t('ser_new')} sotto={t('ser_new_sub')} dimensione={96}
                  icona={<Plus strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => setPannello({ tipo: 'auditor' })} />
        </>;
      case 'chi':
        {/* ⚠️ Segnalato: « SOLO è scritto due volte ». `ser_solo_sub` valeva LETTERALMENTE
            "SOLO" (la stessa parola dell'etichetta sopra, mai stata una sottotitolo vero) —
            la si leggeva due volte sulla stessa scelta. `ser_with_pc`, la scelta gemella, non
            ha mai avuto un `sotto`: tolto anche qui, per la stessa ragione simmetrica invece
            di inventare un sottotitolo che prima non c'era. */}
        return <>
          <Scelta etichetta={t('ser_solo')}
                  icona={<User strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => dai('solo')} />
          <Scelta etichetta={t('ser_with_pc')}
                  icona={<Users strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => dai('preclear')} />
        </>;
      case 'preclear':
        return <>
          {liste.p.map(p => (
            <Scelta key={p.id} etichetta={p.name} foto={p.photo} persona
                    sotto={lattine(p.name)} onClick={() => dai(p.id)}
                    onModifica={() => setPannello({ tipo: 'preclear',
                      esistente: { id: p.id, nome: p.name, foto: p.photo, sesso: p.sex } })} />
          ))}
          <Scelta etichetta={t('ser_new')} sotto={t('ser_new_sub')} dimensione={96}
                  icona={<Plus strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => setPannello({ tipo: 'preclear' })} />
        </>;
      case 'dove':
        // Wifi/Eye: le stesse icone di `ModeSelector.tsx` per 'local'/'auditor' — la
        // domanda « qui o a distanza » è esattamente quella scelta, solo binaria (SERENITY
        // non prende mai il ruolo 'participant').
        return <>
          <Scelta etichetta={t('ser_here')} sotto={t('ser_here_sub')}
                  icona={<Wifi strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => dai('qui')} />
          <Scelta etichetta={t('ser_remote')} sotto={t('ser_remote_sub')}
                  icona={<Eye strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => dai('distanza')} />
        </>;
      case 'modo':
        // Chiave inglese/persona: le stesse icone del selettore ESPERTO/NORMALE di
        // `Sidebar.tsx` — « chiave = si tara, persona = si conduce ».
        return <>
          <Scelta etichetta={t('ser_normal')} sotto={t('ser_normal_sub')}
                  icona={<CircleUser strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => dai('normale')} />
          <Scelta etichetta={t('ser_expert')} sotto={t('ser_expert_sub')}
                  icona={<Wrench strokeWidth={1.4} style={{ width: '100%', height: '100%' }} />}
                  onClick={() => dai('esperto')} />
        </>;
      default:
        return null;
    }
  };

  const quante = restano(stato);
  const DOMANDA: Record<PassoId, string> = {
    auditor: t('ser_q_auditor'), chi: t('ser_q_chi'), preclear: t('ser_q_preclear'),
    dove: t('ser_q_dove'), modo: t('ser_q_modo'), pronto: '',
  };

  // Creare o modificare un profilo NON è un passo del flusso: è una deviazione.
  //   • CREARE: il profilo appena fatto è la risposta alla domanda in corso — si sceglie da sé,
  //     esattamente come premere il suo cerchio. Non farlo vorrebbe dire crearlo e poi
  //     ritrovarsi comunque davanti alla lista per sceglierlo un'altra volta.
  //   • MODIFICARE: NON sceglie nessuno. Si può star guardando la lista per scegliere qualcun
  //     altro, e aver toccato « modifica » solo per correggere una foto — scegliere al posto
  //     dell'auditor sarebbe decidere una cosa che lui non ha deciso.
  if (configAperto) {
    return <PannelloConfig onChiudi={() => setConfigAperto(false)} />;
  }

  if (pannello) {
    return (
      <PannelloProfilo
        tipo={pannello.tipo}
        esistente={pannello.esistente}
        onAnnulla={() => setPannello(null)}
        onEliminato={() => { setListe(leggi()); setPannello(null); }}
        onFatto={id => {
          setListe(leggi());
          const eraNuovo = !pannello.esistente;
          setPannello(null);
          if (eraNuovo) dai(id);
        }}
      />
    );
  }

  return (
    <section style={{
      height: '100%', display: 'grid', gridTemplateRows: 'auto auto auto 1fr auto',
      alignItems: 'center', gap: 28,
    }}>
      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 20 }}>
        <SelettoreTema />
        <SelettoreLingua />
        <button className="s-glass s-glass-btn" onClick={() => setConfigAperto(true)} title={t('config') as string} style={{
          cursor: 'pointer', padding: 8, borderRadius: 999, background: 'var(--s-disc)',
          display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <Settings size={32} strokeWidth={1.6} />
        </button>
      </div>

      {/* ── LE CONFIGURAZIONI REGISTRATE — solo alla primissima domanda ──────────────────────
          Segnalato: richiamarne una deve « evitare di ripetere ogni passaggio iniziale ». Se ce
          n'è almeno una, questa striscia sta SOPRA la domanda: chi la vede può saltare le
          quattro domande con un solo tocco, invece di doverle attraversare per scoprire che
          esiste una scorciatoia in fondo. */}
      {passo === 'auditor' && configurazioni.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--s-fs-sm)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
            {LC('configurazioni salvate', 'configurations enregistrées', 'saved configurations', 'configuraciones guardadas', 'sparade konfigurationer')}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
            {configurazioni.map(cfg => {
              const chi = cfg.avvio.solo
                ? t('ser_solo') as string
                : nomeProfilo(liste.p, cfg.avvio.pcId);
              const strumento = cfg.strumenti.none
                ? (t('no_instruments_mode') as string)
                : [cfg.strumenti.muse && 'MUSE', cfg.strumenti.theta && (t('theta_cans') as string)].filter(Boolean).join(' + ');
              return (
                <span key={cfg.id} className="s-glass" style={{
                  display: 'flex', alignItems: 'center', gap: 8, borderRadius: 999,
                  padding: '6px 6px 6px 14px', background: 'var(--s-disc)',
                }}>
                  <button className="s-glass-btn" onClick={() => onRichiama?.(cfg)} style={{
                    border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 999,
                    fontFamily: 'var(--s-sans)', color: 'var(--s-ink)',
                  }}>
                    <span style={{ fontSize: 'var(--s-fs-base)', fontWeight: 600 }}>{cfg.nome}</span>
                    {/* ⚠️ `· cfg.lingua.toUpperCase()`, in coda — segnalato: « nella
                        configurazione registrata deve apparire... anche la lingua scelta ».
                        Auditor/PC/strumenti c'erano già; la lingua no, perché non veniva
                        nemmeno salvata (v. `salvaConfigurazione`/`richiamaConfigurazione` in
                        `Serenity.tsx`). Facoltativa (`cfg.lingua &&`): le configurazioni
                        salvate prima di questo giro non ce l'hanno, e non devono mostrare un
                        "· undefined" al posto della lingua che non hanno mai registrato. */}
                    <span style={{ fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-faint)', marginLeft: 6 }}>
                      {nomeProfilo(liste.a, cfg.avvio.auditorId)}{chi ? ` · ${chi}` : ''}{strumento ? ` · ${strumento}` : ''}{cfg.lingua ? ` · ${cfg.lingua.toUpperCase()}` : ''}
                    </span>
                  </button>
                  {/* ⚠️ Segnalato: « vorrei una ICONA accanto a ogni saved per sopprimerla » — la
                      "×" di testo funzionava già (`eliminaConfigurazione` è collegata da
                      sempre), ma non era un'icona vera. Stessa icona di `HistoryModal.tsx`
                      (App.tsx) per lo stesso gesto — eliminare una riga salvata. */}
                  <button className="s-glass-btn" onClick={() => { eliminaConfigurazione(cfg.id); setConfigurazioni(leggiConfigurazioni()); }}
                    title={t('ser_delete') as string} style={{
                    border: 'none', background: 'none', cursor: 'pointer', padding: 6, borderRadius: 999,
                    display: 'flex', color: 'var(--s-ink-ghost)', lineHeight: 1,
                  }}>
                    <Trash2 size={16} strokeWidth={1.8} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ) : <div />}

      {/* La domanda, e basta. Nessun titolo di sezione, nessun numero di passo: sapere di
          essere « al 3 di 4 » non serve a rispondere. */}
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
        <h1 style={{
          margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400,
          fontSize: 'var(--s-fs-hero)', letterSpacing: '-0.01em', color: 'var(--s-ink)',
        }}>
          {DOMANDA[passo]}
        </h1>
        {/* Quante ne restano, detto a parole. Una barra di avanzamento sarebbe un pannello. */}
        <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
          {quante > 1 ? t('ser_questions_left').replace('{n}', String(quante))
            : quante === 1 ? t('ser_last_question') : ''}
        </span>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 46,
        justifyContent: 'center', alignItems: 'flex-start',
      }}>
        {opzioni()}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, minHeight: 30 }}>
        {passo !== 'auditor' && (
          <button className="s-glass s-glass-btn" onClick={() => setStato(indietro)} style={{
            cursor: 'pointer', borderRadius: 999, padding: '6px 14px', background: 'var(--s-disc)',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
          }}>
            ← {t('ser_back')}
          </button>
        )}
        {passo === 'modo' && (
          // Il tempo che passa si vede, così la scelta automatica non arriva a sorpresa —
          // ma si dice a parole, non con una barra che si riempie alla periferia dell'occhio.
          <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
            {t('ser_auto_normal').replace('{n}', String(Math.ceil(rimasti / 1000)))}
          </span>
        )}
      </div>
    </section>
  );
}
