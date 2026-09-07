import React from 'react';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import { compareReady, soloTaOffset } from '../engine/canTest';
import { SQUEEZE_TARGET_OFFSET, BREATH_MIN_OFFSET } from '../engine/thetaSetup';
import { LAYER } from "../ui/layers";

/**
 * ThetaReadyCheck — « PRONTO PER LA SEDUTA » quando si audita con le sole BOÎTES.
 *
 * Sorella di MetabolicCheck, non un suo modo: quella è costruita attorno alla timeline del
 * respiro guidato del Muse (baseline, inspira/espira, valutazione metabolica dall'EEG). Qui
 * non c'è EEG, e le due prove sono quelle del meter — infilarle in quella timeline avrebbe
 * significato attraversarla di condizioni per due percorsi che non hanno nulla in comune.
 *
 * ── LE DUE PROVE, nell'ordine della procedura ──────────────────────────────────────────────
 *   1. STRETTA — stringendo le boîtes l'ago deve cadere di UN TERZO di quadrante. È questa che
 *      fissa la sensibilità: senza, tutto il resto si legge su una scala sbagliata.
 *   2. RESPIRO — poi, respirando a fondo e RILASCIANDO, si deve ottenere almeno una **FALL**.
 *      Non un accenno: una fall vera. Se non arriva, **il metabolismo del preclear non è a
 *      posto** ed è inutile cominciare — è precisamente ciò che questa schermata accerta.
 *
 * Si può procedere lo stesso: la decisione resta dell'auditor, che magari sa perché quel
 * preclear oggi non reagisce. Ma glielo si dice, invece di lasciarlo partire alla cieca.
 *
 * ── PERCHÉ A COLONNA E NON A TUTTO SCHERMO ─────────────────────────────────────────────────
 * Le due prove si giudicano GUARDANDO L'AGO: « un terzo di quadrante » e « almeno una fall »
 * sono ampiezze sul quadrante vero, con la sua scala. Un velo a tutto schermo lo copriva, e il
 * test diventava impossibile — segnalato in seduta. Sta quindi in una colonna a sinistra, senza
 * oscurare il resto: il quadrante resta scoperto e a grandezza piena.
 */

export interface ThetaReadyCheckProps {
  /** Sensibilità già misurata in QUESTA seduta (la stretta è stata fatta). */
  scaleMeasured: boolean;
  /** Esito dell'ultimo respiro: null = non fatto, false = sotto la fall. */
  breathOk: boolean | null;
  /** Esito dell'ultima stretta: la caduta corrisponde al terzo di quadrante? */
  squeezeOk: boolean | null;
  /** Quale prova è in corso. */
  testing: null | 'squeeze' | 'breath';
  /** Deviazione di picco della prova in corso, in unità di quadrante — si vede salire. */
  peakOffset: number;
  startSqueezeTest: () => void;
  startBreathTest: () => void;
  /** La MANOPOLA della sensibilità, −10..+10. Sta qui perché è QUI che serve: la stretta esiste
   *  proprio per tarare l'ago, e se non dà un terzo di quadrante si corregge sul posto invece di
   *  dover chiudere, aprire un altro pannello e tornare. */
  sensTrim: number;
  setSensTrim: (v: number) => void;
  /** Come sono tenute le boîtes. Va scelto PRIMA delle prove: la geometria degli elettrodi
   *  cambia la resistenza, quindi la sensibilità misurata con due boîtes non vale per una
   *  boîte sola — si tarerebbe su una configurazione e si auditerebbe su un'altra. */
  config: 'two-cans' | 'solo-can';
  setConfig: (c: 'two-cans' | 'solo-can') => void;
  /** Lo scarto fra una lattina e due è stato misurato? Se sì, l'invito non serve più. */
  soloOffsetMisurato?: boolean;
  /**
   * LA PROVA DOPPIA — i due TA letti, uno per configurazione.
   *
   * Il ciclo è: due lattine → si legge il TA · una lattina → si legge il TA · si confronta.
   * Finché ne manca uno non c'è niente da confrontare e il riquadro non compare.
   */
  taTwo?: number | null;
  taSolo?: number | null;
  /** Applica la differenza misurata: da qui in poi il TA a una lattina si riporta a due. */
  onApplySoloOffset?: (offset: number) => void;
  /** L'apparecchio trasmette ma non è del modello che sappiamo leggere. */
  unknownFormat?: boolean;
  /** I suoi report grezzi, da copiare e mandare per farne scrivere la decodifica. */
  rawSamples?: string[];
  /** Aperto senza errori, ma non arriva NEMMENO un report — buono o scartato. Diverso da
   *  `unknownFormat`: qui non c'è nulla da decodificare, il dato non arriva proprio. */
  noSignal?: boolean;
  /** Che dispositivo si è agganciato (nome · VID:PID · collection HID) — v. `noSignal`. */
  deviceInfo?: string | null;
  onProceed: () => void;
  onCancel: () => void;
}

export function ThetaReadyCheck({
  scaleMeasured, breathOk, squeezeOk, testing, peakOffset,
  startSqueezeTest, startBreathTest, sensTrim, setSensTrim, config, setConfig, onProceed, onCancel,
  soloOffsetMisurato = false, taTwo = null, taSolo = null, onApplySoloOffset,
  unknownFormat = false, rawSamples = [], noSignal = false, deviceInfo = null,
}: ThetaReadyCheckProps) {
  const { t, lang } = useI18n();
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);

  const prove = [
    {
      k: 'squeeze' as const,
      titolo: t('theta_squeeze') as string,
      spiega: t('theta_squeeze_hint') as string,
      soglia: SQUEEZE_TARGET_OFFSET,
      fatto: scaleMeasured && squeezeOk !== false,
      fallito: squeezeOk === false,
      start: startSqueezeTest,
      // Il respiro non si può giudicare finché la sensibilità non è fissata: si leggerebbe
      // un'ampiezza su una scala che non è ancora quella giusta.
      pronto: true,
    },
    {
      k: 'breath' as const,
      titolo: t('theta_breath') as string,
      spiega: t('theta_breath_hint') as string,
      soglia: BREATH_MIN_OFFSET,
      fatto: breathOk === true,
      fallito: breathOk === false,
      start: startBreathTest,
      pronto: scaleMeasured,
    },
  ];

  const tuttoFatto = scaleMeasured && breathOk === true;

  return (
    <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: LAYER.session,
                  width: 'min(420px, 34vw)', overflowY: 'auto',
                  // NIENTE velo sul resto: il quadrante deve restare visibile e leggibile.
                  // ⚠️ `var(--tr-bg, ...)` — il fallback qui È il colore di sempre: senza
                  // questo token (il caso di App.tsx, che non lo definisce) lo sfondo resta
                  // ESATTAMENTE questo blu-nero, zero cambiamento. SERENITY lo punta al proprio
                  // nero vero (v. `tokens.css`) — segnalato: « il fondo sembra nero, diverso
                  // sia da DARK che LIGHT », due tinte di "nero" diverse affiancate.
                  background: 'var(--tr-bg, linear-gradient(100deg, rgba(2,6,23,0.97) 0%, rgba(2,6,23,0.93) 100%))',
                  backdropFilter: 'blur(10px)',
                  borderRight: '1px solid rgba(245,158,11,0.3)',
                  boxShadow: '18px 0 50px rgba(0,0,0,0.5)',
                  padding: '24px 22px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: '#f59e0b', marginBottom: 6 }}>
            {t('theta_cans') as string}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 19, fontWeight: 700,
                        letterSpacing: '0.04em', color: 'rgba(240,246,255,0.95)' }}>
            {t('ready_for_session') as string}
          </div>
          {/* Si dice esplicitamente dove guardare: il giudizio si fa sull'ago, non qui. */}
          <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                        color: '#f59e0b' }}>
            {t('theta_watch_needle') as string}
          </div>
        </div>

        {/* ── MODELLO SCONOSCIUTO ────────────────────────────────────────────────────────
            Esistono più modelli di Theta-Meter, e il formato dei dati non è lo stesso su tutti.
            Se l'apparecchio trasmette e non capiamo niente, lo si DICE — insieme ai byte veri,
            pronti da copiare: è con quelli che si scrive la decodifica di QUEL modello. Senza
            questo riquadro, chi ha un altro modello vede solo un ago immobile e non sa perché. */}
        {unknownFormat && (
          <div style={{ border: '1px solid rgba(248,113,113,0.5)', borderRadius: 10,
                        background: 'rgba(127,29,29,0.22)', padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                          color: '#fca5a5', marginBottom: 6 }}>
              {t('theta_unknown_model') as string}
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                          color: 'rgba(240,246,255,0.8)', marginBottom: 8 }}>
              {t('theta_unknown_model_hint') as string}
            </div>
            <pre style={{ margin: 0, maxHeight: 96, overflow: 'auto', fontSize: 10,
                          fontFamily: 'ui-monospace, monospace', color: 'rgba(240,246,255,0.7)',
                          background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '6px 8px' }}>
              {rawSamples.join('\n') || '—'}
            </pre>
            <button type="button"
              onClick={() => { try { navigator.clipboard.writeText(rawSamples.join('\n')); } catch (_) { /* niente appunti: restano leggibili sopra */ } }}
              style={{ marginTop: 8, width: '100%', height: 30, borderRadius: 8, cursor: 'pointer',
                       border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)',
                       color: '#fca5a5', fontFamily: 'var(--font-sans)', fontSize: 11 }}>
              {t('theta_copy_raw') as string}
            </button>
          </div>
        )}

        {/* ── NESSUN SEGNALE — segnalato: « collegato al Meter, ma non legge nulla », su
            Windows. Diverso da MODELLO SCONOSCIUTO qui sopra: lì l'apparecchio TRASMETTE e i
            report arrivano scartati (`rawSamples` non è mai vuoto) — qui il dispositivo si è
            aperto senza errori ma non manda MAI un report, buono o scartato. Senza questo
            riquadro l'auditor vedeva solo un ago fermo, indistinguibile da "sto ancora
            provando" — nessun modo di capire che il problema è più a monte (un altro
            programma tiene il device aperto, o WebHID ha scelto l'interfaccia sbagliata su
            un dispositivo composito — v. `thetaMeterHid.ts`). `deviceInfo` mostra ESATTAMENTE
            cosa WebHID ha agganciato (nome, VID:PID, e le sue collection HID) — la stessa
            informazione che serve per capire perché, non solo che qualcosa non va. */}
        {noSignal && (
          <div style={{ border: '1px solid rgba(248,113,113,0.5)', borderRadius: 10,
                        background: 'rgba(127,29,29,0.22)', padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                          color: '#fca5a5', marginBottom: 6 }}>
              {t('theta_no_signal') as string}
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                          color: 'rgba(240,246,255,0.8)', marginBottom: 8 }}>
              {t('theta_no_signal_hint') as string}
            </div>
            <pre style={{ margin: 0, maxHeight: 96, overflow: 'auto', fontSize: 10,
                          fontFamily: 'ui-monospace, monospace', color: 'rgba(240,246,255,0.7)',
                          background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '6px 8px',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {deviceInfo || '—'}
            </pre>
            <button type="button"
              onClick={() => { try { navigator.clipboard.writeText(deviceInfo || ''); } catch (_) { /* niente appunti: resta leggibile sopra */ } }}
              style={{ marginTop: 8, width: '100%', height: 30, borderRadius: 8, cursor: 'pointer',
                       border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)',
                       color: '#fca5a5', fontFamily: 'var(--font-sans)', fontSize: 11 }}>
              {t('theta_copy_raw') as string}
            </button>
          </div>
        )}

        {/* PRIMA di tutto: come sono tenute. La sensibilità misurata con due boîtes non vale
            per una boîte sola, quindi sceglierlo dopo le prove significherebbe tararsi su una
            configurazione e auditare su un'altra. */}
        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.14em',
                        textTransform: 'uppercase', color: 'rgba(226,238,255,0.45)', marginBottom: 6 }}>
            {t('theta_how_held') as string}
          </div>
          {/* ── PERCHÉ LA DOMANDA ─────────────────────────────────────────────────────────
              La si faceva senza dire a che serve, e sembrava una formalità da sbrigare. Non
              lo è: con DUE lattine la corrente attraversa il corpo da una mano all'altra e la
              resistenza che si misura è quella del preclear; con UNA sola il circuito si
              chiude altrimenti e la resistenza è più alta. Lo stesso preclear, nello stesso
              istante, dà due TA diversi. Il riferimento sono le due — e a una lattina, senza
              lo scarto misurato, il programma toglie una divisione e lo scrive. */}
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                        color: 'rgba(226,238,255,0.62)', marginBottom: 8 }}>
            {L('Con DUE lattine la corrente passa da una mano all\'altra: la resistenza è quella del preclear, ed è il riferimento. Con UNA sola il circuito si chiude altrimenti e la resistenza è più alta — lo stesso preclear dà un TA diverso. Se lo scarto non è stato misurato, il programma toglie una divisione al TA e lo scrive accanto al numero.',
               'Avec DEUX boîtes le courant passe d\'une main à l\'autre : la résistance est celle du préclair, et c\'est la référence. Avec UNE seule le circuit se ferme autrement et la résistance est plus haute — le même préclair donne un TA différent. Si l\'écart n\'a pas été mesuré, le programme retire une division au TA et l\'écrit à côté du nombre.',
               'With TWO cans the current runs from hand to hand: the resistance is the preclear\'s, and that is the reference. With ONE the circuit closes otherwise and the resistance is higher — the same preclear gives a different TA. If the offset has not been measured, the program takes one division off the TA and says so beside the number.',
               'Con DOS latas la corriente pasa de una mano a otra: la resistencia es la del preclear, y es la referencia. Con UNA sola el circuito se cierra de otro modo y la resistencia es más alta — el mismo preclear da un TA distinto. Si no se ha medido la diferencia, el programa quita una división al TA y lo escribe junto al número.',
               'Med TVÅ burkar går strömmen från hand till hand: motståndet är preclearens, och det är referensen. Med EN sluts kretsen annorlunda och motståndet är högre — samma preclear ger ett annat TA. Om skillnaden inte mätts drar programmet av ett delstreck från TA och skriver det bredvid siffran.')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['two-cans', 'solo-can'] as const).map(c => (
              <button key={c} type="button" onClick={() => setConfig(c)}
                style={{ flex: 1, height: 36, borderRadius: 9, cursor: 'pointer',
                         fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                         letterSpacing: '0.05em',
                         background: config === c ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                         border: `1px solid ${config === c ? 'rgba(245,158,11,0.65)' : 'rgba(255,255,255,0.16)'}`,
                         color: config === c ? '#f59e0b' : 'rgba(226,238,255,0.65)' }}>
                {t(c === 'two-cans' ? 'theta_two_cans' : 'theta_solo_can') as string}
              </button>
            ))}
          </div>

          {/* ── SCELTA « UNA LATTINA » → L'INVITO A FARE PRIMA QUELLA A DUE ─────────────
              Sceglierla e passare oltre vuol dire lavorare tutta la seduta con un TA che non
              è il riferimento, e con una divisione tolta d'ufficio. L'invito lo dice QUI, nel
              momento in cui la scelta si fa, e porta il gesto con sé: un bottone che rimette
              DUE lattine, si fa la stretta, e poi si torna a una.
              Scompare da sé quando lo scarto è stato misurato — allora non c'è più niente da
              invitare a fare. */}
          {/* ── LA PROVA DOPPIA, IL CONFRONTO ────────────────────────────────────────────
              Fatte tutte e due le strette — con due lattine e con una — qui si vedono i due
              TA e la loro DIFFERENZA. È il dato che mancava: la prova della stretta tara la
              SENSIBILITÀ dell'ago, ma la correzione che serve al TA è di quanto lo stesso
              preclear legge diverso con una lattina invece che con due, e quella non si
              deduce da una prova sola (segnalato: « si deve avere la schermata comparativa
              della differenza »).
              Applicandola, da lì in poi il TA a una lattina si riporta alle due e il margine
              di una divisione non serve più. */}
          {(() => {
            const cfr = { taTwo, taSolo };
            if (!compareReady(cfr)) return null;
            const off = soloTaOffset(cfr);
            return (
              <div style={{ marginTop: 10, padding: '11px 13px', borderRadius: 10,
                            background: off === null ? 'rgba(248,113,113,0.10)' : 'rgba(52,211,153,0.10)',
                            border: `1px solid ${off === null ? 'rgba(248,113,113,0.5)' : 'rgba(52,211,153,0.5)'}` }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.14em',
                              textTransform: 'uppercase', color: 'rgba(226,238,255,0.5)', marginBottom: 7 }}>
                  {L('Confronto delle due prove', 'Comparaison des deux tests', 'The two tests compared', 'Comparación de las dos pruebas', 'De två testen jämförda')}
                </div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap',
                              fontFamily: 'monospace', fontSize: 14, color: 'rgba(240,246,255,0.95)' }}>
                  <span><span style={{ fontSize: 10, opacity: 0.6 }}>2 · </span>{taTwo!.toFixed(2)}</span>
                  <span><span style={{ fontSize: 10, opacity: 0.6 }}>1 · </span>{taSolo!.toFixed(2)}</span>
                  <span style={{ color: off === null ? '#f87171' : '#34d399', fontWeight: 700 }}>
                    {off === null ? '—' : `${off > 0 ? '+' : ''}${off.toFixed(2)}`}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5, marginTop: 7,
                              color: off === null ? 'rgba(248,113,113,0.9)' : 'rgba(226,238,255,0.7)' }}>
                  {off === null
                    ? L('Lo scarto è troppo grande per essere una differenza di configurazione: è una lettura presa male. Rifai le due prove.',
                        'L\'écart est trop grand pour être une différence de configuration : c\'est une lecture mal prise. Refais les deux tests.',
                        'The gap is too large to be a configuration difference: it is a badly taken reading. Redo both tests.',
                        'La diferencia es demasiado grande para ser de configuración: es una lectura mal tomada. Rehaz las dos pruebas.',
                        'Skillnaden är för stor för att vara en konfigurationsskillnad: avläsningen är dåligt tagen. Gör om båda testen.')
                    : L('È di quanto QUESTO preclear legge diverso con una lattina. Applicandolo, in solo il TA si riporta alle due lattine e non si toglie più nessuna divisione.',
                        'C\'est de combien CE préclair lit différemment avec une seule boîte. En l\'appliquant, en solo le TA revient aux deux boîtes et plus aucune division n\'est retirée.',
                        'It is how much THIS preclear reads differently with one can. Applied, in solo the TA comes back to two cans and no division is taken off.',
                        'Es cuánto lee distinto ESTE preclear con una lata. Aplicándolo, en solo el TA vuelve a dos latas y no se quita ninguna división.',
                        'Det är hur mycket DENNA preclear läser annorlunda med en burk. Tillämpat återförs TA i solo till två burkar och inget delstreck dras av.')}
                </div>
                {off !== null && !soloOffsetMisurato && (
                  <button type="button" onClick={() => onApplySoloOffset?.(off)}
                    style={{ marginTop: 9, height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                             fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                             background: 'rgba(52,211,153,0.2)', border: '1px solid rgba(52,211,153,0.7)',
                             color: '#34d399' }}>
                    {L('Usa questa differenza', 'Utilise cet écart', 'Use this offset', 'Usa esta diferencia', 'Använd denna skillnad')}
                  </button>
                )}
                {soloOffsetMisurato && (
                  <div style={{ marginTop: 7, fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700, color: '#34d399' }}>
                    ✓ {L('applicata', 'appliqué', 'applied', 'aplicada', 'tillämpad')}
                  </div>
                )}
              </div>
            );
          })()}

          {config === 'solo-can' && !soloOffsetMisurato && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10,
                          background: 'rgba(245,158,11,0.10)',
                          border: '1px solid rgba(245,158,11,0.45)' }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                            color: 'rgba(251,191,36,0.95)' }}>
                {L('Per misurare il TA come si deve, fai la stretta con DUE lattine: è il riferimento. Poi torna a una e riprendi. Se non la fai, il TA di questa seduta avrà UNA DIVISIONE IN MENO — e sarà scritto accanto al numero.',
                   'Pour mesurer le TA correctement, fais la pression avec DEUX boîtes : c\'est la référence. Reviens ensuite à une seule et reprends. Si tu ne le fais pas, le TA de cette séance aura UNE DIVISION EN MOINS — et ce sera écrit à côté du nombre.',
                   'To measure the TA properly, do the squeeze with TWO cans: that is the reference. Then go back to one and carry on. If you skip it, this session\'s TA will be ONE DIVISION LOWER — and it will say so beside the number.',
                   'Para medir el TA como se debe, haz la presión con DOS latas: es la referencia. Luego vuelve a una y sigue. Si no lo haces, el TA de esta sesión tendrá UNA DIVISIÓN MENOS — y se escribirá junto al número.',
                   'För att mäta TA rätt, gör trycket med TVÅ burkar: det är referensen. Gå sedan tillbaka till en och fortsätt. Om du hoppar över det får denna sessions TA ETT DELSTRECK MINDRE — och det skrivs bredvid siffran.')}
              </div>
              <button type="button" onClick={() => setConfig('two-cans')}
                style={{ marginTop: 8, height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                         fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                         background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.7)',
                         color: '#f59e0b' }}>
                {L('Passa a DUE lattine e fai la prova', 'Passe à DEUX boîtes et fais le test',
                   'Switch to TWO cans and run the test', 'Pasa a DOS latas y haz la prueba',
                   'Byt till TVÅ burkar och gör testet')}
              </button>
            </div>
          )}
        </div>

        {prove.map(p => (
          <div key={p.k}
            style={{ padding: '14px 16px', borderRadius: 12,
                     background: 'rgba(255,255,255,0.04)',
                     border: `1px solid ${p.fatto ? 'rgba(52,211,153,0.5)'
                                        : p.fallito ? 'rgba(248,113,113,0.5)'
                                        : 'rgba(255,255,255,0.12)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 18, width: 22,
                             color: p.fatto ? '#34d399' : p.fallito ? '#f87171' : 'rgba(226,238,255,0.35)' }}>
                {p.fatto ? '✓' : p.fallito ? '✕' : '·'}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
                             color: 'rgba(240,246,255,0.92)' }}>
                {p.titolo}
              </span>
              <button type="button" onClick={p.start} disabled={testing !== null || !p.pronto}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                         letterSpacing: '0.08em', textTransform: 'uppercase',
                         padding: '7px 14px', borderRadius: 8,
                         cursor: testing === null && p.pronto ? 'pointer' : 'default',
                         opacity: p.pronto ? 1 : 0.35,
                         // Una volta riuscita, « rifai » va in GRIGIO: in arancione sembrava un
                         // avviso, e contraddiceva il segno di spunta verde a sinistra —
                         // segnalato in seduta come fonte di errori di lettura.
                         background: testing === p.k ? 'rgba(52,211,153,0.2)'
                                   : p.fatto ? 'rgba(255,255,255,0.06)' : 'rgba(245,158,11,0.16)',
                         border: `1px solid ${testing === p.k ? 'rgba(52,211,153,0.6)'
                                   : p.fatto ? 'rgba(255,255,255,0.2)' : 'rgba(245,158,11,0.5)'}`,
                         color: testing === p.k ? '#34d399'
                              : p.fatto ? 'rgba(226,238,255,0.6)' : '#f59e0b' }}>
                {testing === p.k ? (t('theta_test_running') as string)
                  : p.fatto ? (t('theta_cal_again') as string)
                  : (t('theta_cal_record') as string)}
              </button>
            </div>

            {/* VERDETTO esplicito: « corrisponde » o « non corrisponde ». Il segno di spunta
                da solo non bastava a dirlo, e il colore del bottone diceva il contrario. */}
            {testing !== p.k && (p.fatto || p.fallito) && (
              <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                            letterSpacing: '0.06em', color: p.fatto ? '#34d399' : '#f87171' }}>
                {(p.fatto ? t('theta_matches') : t('theta_matches_not')) as string}
              </div>
            )}

            <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                          color: 'rgba(226,238,255,0.5)' }}>
              {p.spiega}
            </div>

            {/* LA MANOPOLA, sotto la stretta: è la prova che TARA la sensibilità, quindi se la
                caduta non arriva a un terzo di quadrante si corregge qui, guardando l'ago, senza
                andare a cercarla altrove. La stretta la fissa da sola; questo è il ritocco. */}
            {p.k === 'squeeze' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.12em',
                               textTransform: 'uppercase', color: 'rgba(226,238,255,0.45)' }}>
                  {t('theta_sensitivity') as string}
                </span>
                {([-1, 1] as const).map(v => (
                  <button key={v} type="button" onClick={() => setSensTrim(sensTrim + v)}
                    /* Erano 28×24 e non si vedevano: qui si regola guardando l'ago, quindi il
                       bersaglio dev'essere grande abbastanza da colpirlo senza guardarlo. */
                    style={{ width: 46, height: 38, borderRadius: 9, cursor: 'pointer',
                             fontFamily: 'monospace', fontSize: 22, fontWeight: 700, lineHeight: 1,
                             background: 'rgba(245,158,11,0.14)',
                             border: '1px solid rgba(245,158,11,0.5)', color: '#f59e0b' }}>
                    {v > 0 ? '+' : '−'}
                  </button>
                ))}
                <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
                               color: 'rgba(240,246,255,0.9)', minWidth: 30, textAlign: 'right' }}>
                  {sensTrim > 0 ? '+' : ''}{sensTrim}
                </span>
              </div>
            )}

            {/* Barra dell'ampiezza raggiunta, durante la prova: si VEDE se si sta arrivando
                alla soglia, invece di scoprirlo solo alla fine. */}
            {testing === p.k && (
              <div style={{ marginTop: 10, height: 6, borderRadius: 3, position: 'relative',
                            background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (peakOffset / p.soglia) * 100)}%`,
                              background: peakOffset >= p.soglia ? '#34d399' : '#f59e0b',
                              transition: 'width 0.1s linear' }} />
              </div>
            )}
          </div>
        ))}

        {/* Il respiro senza fall NON blocca: la decisione resta dell'auditor, che magari sa
            perché quel preclear oggi non reagisce. Ma glielo si dice. */}
        {breathOk === false && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: '#f87171' }}>
            {t('theta_breath_failed') as string}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, height: 40, borderRadius: 10, cursor: 'pointer',
                     fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '0.1em',
                     textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)',
                     border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(226,238,255,0.6)' }}>
            {t('cancel') as string}
          </button>
          <button type="button" onClick={onProceed}
            style={{ flex: 2, height: 40, borderRadius: 10, cursor: 'pointer',
                     fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                     letterSpacing: '0.1em', textTransform: 'uppercase',
                     background: tuttoFatto ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)',
                     border: `1px solid ${tuttoFatto ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.22)'}`,
                     color: tuttoFatto ? '#34d399' : 'rgba(226,238,255,0.75)' }}>
            {tuttoFatto ? (t('start') as string) : (t('theta_proceed_anyway') as string)}
          </button>
        </div>
      </div>
    </div>
  );
}
