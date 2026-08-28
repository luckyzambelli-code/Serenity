/**
 * sessionReport — LA SEDUTA CHIUSA, DIRETTA IN HISTORY, SENZA UNO SCHERMO IN MEZZO.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Chiesto direttamente: « vorrei che il Report post session non ci sia più in Serenity, solo
 * il PDF in History ». In App.tsx, `PostSessionReport` fa DUE cose insieme: (1) una schermata
 * interattiva che copre tutto al termine della seduta, (2) al suo stesso montaggio — non a un
 * clic dell'auditor, un `useEffect` con guardia `hasSaved` — SALVA la seduta
 * (`onSaveSession`) e genera + salva un PDF (`generateTextPdf`, poi `saveSessionPdfAsync`).
 * SERENITY vuole SOLO la (2): la seduta deve finire nell'archivio con il suo PDF, senza mai
 * fermarsi su uno schermo che la ricapitola.
 *
 * ── LE TABELLE PER-CICLO, ORA DENTRO — segnalato di nuovo: « ed i moduli restanti, li fai? ».
 * Il giro precedente le aveva dichiarate aperte perché sembrava servisse un ELENCO di ogni
 * ciclo (non solo l'ultimo) che SERENITY non teneva. Rileggendo i motori condivisi si è
 * trovato che quell'elenco esiste GIÀ: `auditingCyclesRef`/`mirrorCyclesRef`/`toneCyclesRef`
 * sono dichiarati DENTRO `useContactNullCycle`/`useMirrorCycle`/`useToneCycle` stessi (gli
 * STESSI motori condivisi che SERENITY monta) e restituiti dal hook — `cycles.auditingCyclesRef`
 * eccetera erano già lì, semplicemente non ancora letti qui. Le sezioni CONTACT/NULL/TONE
 * SCALE/MIRROR sotto sono la stessa tabella di `generateTextPdf` (App.tsx), stessi colori,
 * stessa selezione di campi — quella parte NON era un porting da inventare, era da COLLEGARE.
 * Resta un solo pezzo diverso: ASSESSMENT. Lì App.tsx tiene `assessCyclesRef` nel proprio
 * corpo (non in un hook condiviso) — SERENITY non ha quell'elenco per-ciclo, ma ha
 * `assessItems` (il suo stesso `gruppo` numerato, già usato da `ZonaAssessment` per « ×N »):
 * raggruppato per `gruppo` produce la STESSA forma (`{n, tStartSec, tEndSec, items}`), quindi
 * la sezione ASSESSMENT si scrive con questi dati, non un elenco inventato.
 *
 * ── LA CONTA DEGLI F/N — STESSA LOGICA, STESSA FONTE ───────────────────────────────────────
 * `sessionRecorder.reactions`/`.chart` sono lo stesso singleton condiviso di App.tsx, già
 * riempiti da `useChargeEngine`/`useMuseConnection` (montati anche qui) — mancava solo chi
 * pubblica il PDF e chi conta gli episodi F/N, ricopiata parola per parola da
 * `PostSessionReport.tsx` (fusione delle micro-interruzioni sotto 1s in un solo episodio).
 *
 * ── IL GRAFICO Q_L E L'MNA — AGGIUNTI (28/08/2026) ─────────────────────────────────────────
 * Segnalato: « ajoute aussi le Graphique Q_L et MNA ». Erano dichiarati apertamente assenti,
 * per un presunto ostacolo che rileggendo `PostSessionReport.tsx` (App.tsx) non si è
 * confermato: NON sono un'immagine di un `<AreaChart>` di recharts catturata — sono disegnati
 * con le primitive `jsPDF` (rettangoli/linee/testo), esattamente come le altre tabelle di
 * questo file. Portati parola per parola, stessa fonte dati (`sessionRecorder.chart` per il
 * grafico, `mnaSessionRef.current`/`MnaSession` — identico per forma — per l'MNA).
 *
 * @see docs/serenity-refonte.md
 */

import { jsPDF } from 'jspdf';
import { sessionRecorder } from '../engine/SessionRecorder';
import { fmtIm } from '../lib/utils';
import type { SessionSummary } from '../lib/storage';
import type { ArmedCycle } from '../session/useContactNullCycle';
import type { MirrorRecord } from '../session/useMirrorCycle';
import type { ToneCycleRecord } from '../session/useToneCycle';

export interface AssessCycleInput {
  n: number;
  tStartSec: number;
  tEndSec: number;
  items: Array<{ item: string; reaction: string; time: number; beforeMs?: number }>;
}

/** Una riga del `journal.logs` di Serenity.tsx — STESSO `LogEntry` di `TranscriptLog.tsx`
 *  (App.tsx), con un campo in più: `reaction`, già calcolata dal chiamante con
 *  `computeInstantRead` (la stessa lettura che il pannello Journal a schermo mostra
 *  "sulla parola" — v. la nota accanto al suo `.map` in Serenity.tsx). `sessionReport.ts`
 *  non ricalcola nulla: stampa quel che gli arriva, come per le tabelle per-ciclo. */
export interface JournalLineInput {
  time: number;
  speaker?: 'Aud' | 'PC' | 'SYS' | 'NEEDLE';
  text: string;
  tone?: { label: 'calm' | 'neutral' | 'tense' | 'stressed'; pitch: number; energy: number };
  reaction?: string;
}

export interface SerenityReportInput {
  id: string;
  profileId: string;
  date: number;
  duration: number;
  auditorName: string;
  pcName: string;
  auditorPhoto?: string;
  pcPhoto?: string;
  isSolo: boolean;
  noInstruments: boolean;
  mass: number;
  totalTa: number;
  epValidated: boolean;
  epReactionType?: string;
  epRealization?: string;
  epAuditorNote?: string;
  epVgi?: boolean;
  epVvgi?: boolean;
  epDurationMin?: string;
  deltaStar?: number;
  deltaStarN?: number;
  deltaTrend?: number;
  deltaBaseline?: number;
  deltaAdaptive?: number;
  auditingCycles?: ArmedCycle[];
  mirrorCycles?: MirrorRecord[];
  toneCycles?: ToneCycleRecord[];
  assessCycles?: AssessCycleInput[];
  /** Segnalato: « Fai apparire il journal nel PDF di HISTORI con tutto il trascritto, le
   *  reazioni ed il tono ». Tutte le righe di `journal.logs` (non solo Aud/PC — "tutto" —
   *  v. `JournalLineInput`). */
  journal?: JournalLineInput[];
  cansTest?: {
    hasMeter: boolean; done: boolean; config: 'two-cans' | 'solo-can'; soloOffset: number; taMargin: number;
  };
  /** ── MNA — stessa forma di `MnaSession` (`hooks/useMnaModule.ts`), la fotografia di fine
   *  seduta del pannello MNA a schermo. Facoltativo: assente/vuoto per chi non ha mai aperto
   *  il modulo in quella seduta — la sezione, sotto, non si stampa in quel caso (v. la stessa
   *  guardia già usata da `PostSessionReport.tsx`, `mnaData.cycles > 0 || imHistory.length`). */
  mnaData?: {
    cycles: number;
    imHistory: number[];
    peakIm: number;
    finalZone: string;
    totalCopies: number;
    phaseLog: Array<{ phase: string; t: number }>;
  };
}

/** Stessa fusione di App.tsx: micro-interruzioni sotto 1s restano nello STESSO episodio F/N —
 *  altrimenti un ago che tentenna per un decimo di secondo conterebbe come due F/N invece di
 *  uno. */
function contaFn(reactions: { time: number; reaction: string }[]): number {
  let cnt = 0, inFn = false, lastEnd = -Infinity;
  for (const r of reactions) {
    const isFn = typeof r.reaction === 'string' && r.reaction.startsWith('F/N');
    if (isFn) { if (!inFn && (r.time - lastEnd >= 1.0)) cnt++; inFn = true; }
    else { if (inFn) lastEnd = r.time; inFn = false; }
  }
  return cnt;
}

/** Il MASSIMO di `eta` visto in seduta — stessa lettura di App.tsx (`Math.max(...history.map(h
 *  => h.eta))`), dalla STESSA fonte (`sessionRecorder.chart`, già pieno). */
function maxEtaDaChart(): number {
  const chart = sessionRecorder.chart;
  if (!chart.length) return 0;
  let m = 0;
  for (const p of chart) if (typeof p?.eta === 'number' && p.eta > m) m = p.eta;
  return m;
}

/** L'oggetto che `saveSession` archivia — la STESSA forma di `onSaveSession` in App.tsx, coi
 *  soli campi che SERENITY misura davvero (gli altri restano `undefined`, non inventati). */
export function costruisciRiepilogo(input: SerenityReportInput): SessionSummary {
  return {
    id: input.id,
    profileId: input.profileId,
    date: input.date,
    duration: input.duration,
    pcName: input.pcName,
    isSolo: input.isSolo,
    mass: input.mass,
    fnCount: contaFn(sessionRecorder.reactions),
    maxEta: maxEtaDaChart(),
    epValidated: input.epValidated,
    pcPhoto: input.pcPhoto,
    auditorPhoto: input.auditorPhoto,
    auditorName: input.auditorName,
    noInstruments: input.noInstruments,
  };
}

const ACCENT: [number, number, number] = [34, 150, 200];
const INK: [number, number, number] = [28, 38, 56];
/** Toglie gli accenti — jsPDF/helvetica è Latin-1, non ha i glifi di certi segni tipografici;
 *  stessa scelta di App.tsx (`ascii`, in `generateTextPdf`). */
// ⚠️ TROVATO — segnalato: « change la police de caractère dans le PDF pour SYS et AIG, elle
// est trop espacée ». Non era il font (già lo stesso `courier` del transcript): le righe AGO
// portano nel loro testo « → » (freccia) e « ◎ » (il pallino di apertura del R&I), fuori dal
// set Latin-1/WinAnsi dei font standard di jsPDF (Helvetica/Courier) — un glifo mancante
// corrompe il calcolo della crenatura per l'INTERA riga, non solo per quel carattere: da qui
// lo spaziamento largo fra ogni lettera (visibile solo sulle righe AGO, le uniche a contenere
// questi due simboli). `ascii()` toglieva già gli accenti (NFD) ma non questi due simboli —
// esteso qui, non solo per le righe AGO: qualunque testo passi da questa funzione ne beneficia.
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/→/g, '->').replace(/◎/g, '*').replace(/○/g, 'o').replace(/✓/g, 'v');
const durata = (sec: number) => `${Math.floor(sec / 60)}m ${String(Math.max(0, Math.round(sec)) % 60).padStart(2, '0')}s`;

/**
 * Il PDF per History — STESSO linguaggio visivo di `generateTextPdf` (App.tsx): banner
 * colorato, pannelli con barra d'accento, riquadri-metrica, e ora anche le stesse tabelle
 * per-ciclo (CONTACT/NULL/TONE SCALE/MIRROR/ASSESSMENT) — vedi la nota in testa al file.
 */
export async function generaPdf(
  input: SerenityReportInput,
  t: (key: string) => string,
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string,
): Promise<string> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  let y = 12;
  const ensureSpace = (required = 12) => {
    if (y > pageH - required) { pdf.addPage(); y = 12; }
  };
  const setRGB = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
  const panelHeader = (title: string, accent: [number, number, number] = ACCENT) => {
    ensureSpace(18);
    const x = 14, w = pageW - 28, h = 8.5;
    pdf.setFillColor(accent[0], accent[1], accent[2]);
    pdf.roundedRect(x, y, 1.8, h, 0.6, 0.6, 'F');
    pdf.setFillColor(243, 246, 250);
    pdf.roundedRect(x + 2.6, y, w - 2.6, h, 1.4, 1.4, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setRGB(INK);
    pdf.text(ascii(title), x + 5.5, y + h - 2.7);
    y += h + 4;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setRGB(INK);
  };
  const tint = (c: [number, number, number], k = 0.12): [number, number, number] =>
    [Math.round(c[0] * k + 255 * (1 - k)), Math.round(c[1] * k + 255 * (1 - k)), Math.round(c[2] * k + 255 * (1 - k))];
  const metricTile = (x: number, ty: number, w: number, label: string, value: string, accent: [number, number, number]) => {
    const h = 15; const bg = tint(accent, 0.12);
    pdf.setFillColor(bg[0], bg[1], bg[2]);
    pdf.roundedRect(x, ty, w, h, 1.4, 1.4, 'F');
    pdf.setDrawColor(accent[0], accent[1], accent[2]); pdf.setLineWidth(0.2);
    pdf.roundedRect(x, ty, w, h, 1.4, 1.4, 'S');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); setRGB([120, 130, 145]);
    pdf.text(ascii(label.toUpperCase()), x + w / 2, ty + 4.6, { align: 'center' as const });
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); setRGB(accent);
    pdf.text(ascii(value), x + w / 2, ty + 11, { align: 'center' as const });
  };

  // ── BANNER ────────────────────────────────────────────────────────────────────────────
  pdf.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  pdf.roundedRect(14, y, pageW - 28, 16, 2.2, 2.2, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
  pdf.text(ascii(t('report_title')), pageW / 2, y + 7, { align: 'center' as const });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  pdf.text('SERENITY', pageW / 2, y + 12.5, { align: 'center' as const });
  y += 16 + 6;
  setRGB(INK);

  // ── INFORMAZIONI GENERALI ────────────────────────────────────────────────────────────
  panelHeader(t('report_info_section'));
  const d = new Date(input.date);
  pdf.setFontSize(10);
  pdf.text(`- ${ascii(t('report_date'))} : ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`, 20, y); y += 6;
  pdf.text(`- ${ascii(t('report_duration'))} : ${durata(input.duration)}`, 20, y); y += 6;
  pdf.text(`- ${ascii(t('report_auditor'))} : ${ascii(input.auditorName || 'N/A')}`, 20, y); y += 6;
  if (!input.isSolo) { pdf.text(`- ${ascii(t('report_preclear'))} : ${ascii(input.pcName || 'N/A')}`, 20, y); y += 6; }
  pdf.text(`- ${ascii(LC('strumenti', 'instruments', 'instruments', 'instrumentos', 'instrument'))} : ${
    ascii(input.noInstruments
      ? LC('nessuno', 'aucun', 'none', 'ninguno', 'inga')
      : LC('vedi indicatori', 'voir indicateurs', 'see indicators', 'ver indicadores', 'se indikatorer'))}`, 20, y);
  y += 12;

  // ── LE METRICHE ───────────────────────────────────────────────────────────────────────
  // ⚠️ Segnalato: « nel report togli la percentuale della massa ». Erano quattro caselle
  // (massa/Total TA/F-N/EP) — tolta la prima, le altre tre si allargano per riempire la
  // stessa riga (`tileW` ricalcolata su 3 colonne, non più 4) invece di lasciare un vuoto.
  panelHeader(t('report_summary_section'));
  const tileW = (pageW - 28 - 2 * 4) / 3;
  metricTile(14, y, tileW, t('total_ta'), input.totalTa.toFixed(2), [86, 156, 214]);
  metricTile(14 + tileW + 4, y, tileW, 'F/N', String(contaFn(sessionRecorder.reactions)), [52, 211, 153]);
  metricTile(14 + 2 * (tileW + 4), y, tileW,
    LC('EP', 'EP', 'EP', 'EP', 'EP'), input.epValidated ? '✓' : '-',
    input.epValidated ? [52, 211, 153] : [148, 163, 184]);
  y += 15 + 8;
  if (input.deltaStar !== undefined && input.deltaStarN && input.deltaStarN > 0) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); setRGB([100, 110, 125]);
    const trendTxt = input.deltaStarN >= 2 && input.deltaTrend !== undefined && Math.abs(input.deltaTrend) > 2
      ? `, ${input.deltaTrend < 0 ? 'v' : '^'}${Math.abs(Math.round(input.deltaTrend))} ms/s` : '';
    pdf.text(ascii(`${LC('ritardo di Ron', 'retard de Ron', 'Ron\'s Lag', 'retraso de Ron', 'Rons fördröjning')} (n=${input.deltaStarN}${trendTxt}) : ${input.deltaStar.toFixed(2)}s`), 20, y);
    y += 8;
  }

  // ── EP, SE VALIDATO ───────────────────────────────────────────────────────────────────
  if (input.epValidated) {
    panelHeader(LC('punto d\'esame (EP)', 'point d\'examen (EP)', 'examination point (EP)', 'punto de examen (EP)', 'undersökningspunkt (EP)'), [52, 211, 153]);
    pdf.setFontSize(10);
    if (input.epReactionType) { pdf.text(`- ${ascii(t('ep_reaction_label'))} : ${ascii(input.epReactionType)}`, 20, y); y += 6; }
    if (input.epRealization) { pdf.text(`- PC : "${ascii(input.epRealization)}"`, 20, y); y += 6; }
    if (input.epVgi || input.epVvgi) { pdf.text(`- ${input.epVvgi ? 'VVGI' : 'VGI'}`, 20, y); y += 6; }
    if (input.epAuditorNote) { pdf.text(`- ${ascii(t('ep_note_label'))} : ${ascii(input.epAuditorNote)}`, 20, y); y += 6; }
    y += 6;
  }

  // ── LA PROVA DELLE LATTINE — prima dei cicli, perché è la loro condizione ────────────
  if (input.cansTest?.hasMeter) {
    ensureSpace(16);
    panelHeader(LC('test delle lattine', 'test des boîtes', 'cans test', 'prueba de latas', 'burktest'));
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setRGB([40, 40, 40]);
    const cfg = input.cansTest.config === 'two-cans'
      ? LC('2 lattine', '2 boîtes', '2 cans', '2 latas', '2 burkar')
      : LC('1 lattina', '1 boîte', '1 can', '1 lata', '1 burk');
    pdf.text(`${LC('configurazione', 'configuration', 'configuration', 'configuración', 'konfiguration')} : ${cfg}`, 20, y); y += 5;
    pdf.text(`${LC('stretta con 2 lattine, oggi', 'pression 2 boîtes, aujourd\'hui', 'squeeze with 2 cans, today', 'presión 2 latas, hoy', 'tryck 2 burkar, idag')} : `
      + (input.cansTest.done ? LC('sì', 'oui', 'yes', 'sí', 'ja') : LC('no', 'non', 'no', 'no', 'nej')), 20, y); y += 5;
    pdf.text(`${LC('scarto 1 lattina -> 2', 'écart 1 boîte -> 2', 'offset 1 can -> 2', 'diferencia 1 lata -> 2', 'skillnad 1 burk -> 2')} : `
      + (input.cansTest.soloOffset !== 0 ? input.cansTest.soloOffset.toFixed(2)
         : LC('non misurato', 'non mesuré', 'not measured', 'no medido', 'ej mätt')), 20, y); y += 5;
    y += 3;
  }

  // ── CICLI DI AUDITING - CONTACT ────────────────────────────────────────────────────
  const chargeCycles = (input.auditingCycles ?? []).filter(c => c.kind !== 'null');
  const nullCycles = (input.auditingCycles ?? []).filter(c => c.kind === 'null');
  if (chargeCycles.length > 0) {
    ensureSpace(14 + chargeCycles.length * 5);
    const doneN = chargeCycles.filter(c => c.completed).length;
    panelHeader(LC('cicli di auditing - contact', 'cycles d\'audition - contact', 'auditing cycles - contact', 'ciclos de auditación - contact', 'auditingcykler - contact'));
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setRGB([120, 120, 120]);
    const lagTxt = input.deltaStarN && input.deltaStarN > 0 ? `${ascii(t('reaction_time'))} ${input.deltaStar} ms (${input.deltaStarN}) - ` : '';
    pdf.text(`${lagTxt}${doneN}/${chargeCycles.length} AS-IS`, pageW - 15, y, { align: 'right' as const });
    y += 6;
    for (const c of chargeCycles) {
      ensureSpace(6);
      const lbl = c.phaseReached === 'asis' ? 'AS-IS' : c.phaseReached === 'discharge' ? 'DISSOLUTION' : c.phaseReached === 'contact' ? 'CONTACT' : '-';
      const col: [number, number, number] = c.completed ? [34, 150, 200] : c.phaseReached === 'discharge' ? [16, 185, 129] : c.phaseReached === 'contact' ? [251, 94, 59] : [120, 120, 120];
      const dur = c.tEndSec - c.tStartSec;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setRGB([40, 40, 40]);
      const q = pdf.splitTextToSize(ascii(c.question) || '-', pageW - 110)[0] || '-';
      pdf.text(`${c.n ? `#${c.n} ` : ''}${q}`, 20, y);
      pdf.setFont('helvetica', 'bold'); setRGB(col);
      pdf.text(`${c.completed ? '* ' : ''}${lbl}`, pageW - 48, y, { align: 'right' as const });
      if (c.phaseReached === 'asis' && typeof c.taAtAsIs === 'number') {
        pdf.setFont('helvetica', 'normal'); setRGB([90, 90, 90]);
        pdf.text(`TA ${c.taAtAsIs.toFixed(1)}`, pageW - 74, y, { align: 'right' as const });
      }
      pdf.setFont('helvetica', 'normal'); setRGB([110, 110, 110]);
      pdf.text(durata(dur), pageW - 20, y, { align: 'right' as const });
      y += 5;
    }
    setRGB([40, 40, 40]); y += 4;
  }

  // ── CICLI DI AUDITING - NULL ──────────────────────────────────────────────────────
  if (nullCycles.length > 0) {
    ensureSpace(14 + nullCycles.length * 5);
    const clearN = nullCycles.filter(c => c.clearRead).length;
    const noRechN = nullCycles.filter(c => c.noRecharging).length;
    panelHeader(LC('cicli di auditing - null', 'cycles d\'audition - null', 'auditing cycles - null', 'ciclos de auditación - null', 'auditingcykler - null'));
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setRGB([120, 120, 120]);
    const nr = noRechN > 0 ? ` - ${noRechN} no recharging` : '';
    pdf.text(`${clearN}/${nullCycles.length} EQUILIBRIUM${nr}`, pageW - 15, y, { align: 'right' as const });
    y += 6;
    for (const c of nullCycles) {
      ensureSpace(6);
      const lbl = c.clearRead ? 'EQUILIBRIUM' : c.noRecharging ? 'NO RECHARGING' : 'NULL';
      const col: [number, number, number] = c.clearRead ? [34, 150, 200] : c.noRecharging ? [186, 117, 23] : [120, 120, 120];
      const dur = c.tEndSec - c.tStartSec;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setRGB([40, 40, 40]);
      const q = pdf.splitTextToSize(ascii(c.question) || '-', pageW - 110)[0] || '-';
      pdf.text(`${c.n ? `#${c.n} ` : ''}${q}`, 20, y);
      pdf.setFont('helvetica', 'bold'); setRGB(col);
      pdf.text(`${c.clearRead ? '* ' : ''}${lbl}`, pageW - 48, y, { align: 'right' as const });
      if (c.clearRead) {
        pdf.setFont('helvetica', 'normal'); setRGB([90, 90, 90]);
        pdf.text(c.vgi ? 'VGIs' : 'no VGIs', pageW - 74, y, { align: 'right' as const });
      }
      pdf.setFont('helvetica', 'normal'); setRGB([110, 110, 110]);
      pdf.text(durata(dur), pageW - 20, y, { align: 'right' as const });
      y += 5;
    }
    setRGB([40, 40, 40]); y += 4;
  }

  // ── CICLI DI AUDITING - TONE SCALE ────────────────────────────────────────────────
  const toneCycles = input.toneCycles ?? [];
  if (toneCycles.length > 0) {
    ensureSpace(14 + toneCycles.length * 5);
    const asIsN = toneCycles.filter(c => c.asIs).length;
    const passate = toneCycles.reduce((a, c) => a + (c.repeats || 0), 0);
    panelHeader(LC('cicli di auditing - tone scale', 'cycles d\'audition - tone scale', 'auditing cycles - tone scale', 'ciclos de auditación - tone scale', 'auditingcykler - tone scale'));
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setRGB([120, 120, 120]);
    pdf.text(`${asIsN}/${toneCycles.length} ${LC('al tono 40', 'au ton 40', 'at tone 40', 'al tono 40', 'vid ton 40')}`, pageW - 15, y, { align: 'right' as const });
    y += 6;
    const sgn = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
    for (const c of toneCycles) {
      ensureSpace(6);
      const dur = c.tEndSec - c.tStartSec;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setRGB([40, 40, 40]);
      const q = pdf.splitTextToSize(ascii(c.question) || '-', pageW - 135)[0] || '-';
      pdf.text(`#${c.n} ${q}`, 20, y);
      setRGB([90, 90, 90]);
      const misura = c.located !== null ? sgn(c.located) : '?';
      pdf.text(`${misura} -> +40${c.repeats > 0 ? `  x${c.repeats}` : ''}`, pageW - 62, y, { align: 'right' as const });
      pdf.setFont('helvetica', 'bold');
      if (c.asIs) { setRGB([16, 150, 110]); pdf.text('* TON 40', pageW - 34, y, { align: 'right' as const }); }
      else { setRGB([120, 120, 120]); pdf.text('-', pageW - 34, y, { align: 'right' as const }); }
      pdf.setFont('helvetica', 'normal'); setRGB([110, 110, 110]);
      pdf.text(durata(dur), pageW - 20, y, { align: 'right' as const });
      y += 5;
    }
    if (passate > 0) {
      ensureSpace(6);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); setRGB([110, 110, 110]);
      pdf.text(`${LC('comandi dati', 'commandes données', 'commands given', 'comandos dados', 'givna kommandon')} : ${passate}`, 20, y);
      y += 5;
    }
    setRGB([40, 40, 40]); y += 4;
  }

  // ── CICLI DI AUDITING - MIRROR ────────────────────────────────────────────────────
  const mirrorCycles = input.mirrorCycles ?? [];
  if (mirrorCycles.length > 0) {
    ensureSpace(14 + mirrorCycles.length * 5);
    const fnN = mirrorCycles.filter(c => c.erased).length;
    panelHeader(LC('cicli di auditing - mirror', 'cycles d\'audition - mirror', 'auditing cycles - mirror', 'ciclos de auditación - mirror', 'auditingcykler - mirror'));
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setRGB([120, 120, 120]);
    pdf.text(`${fnN}/${mirrorCycles.length} F/N (${LC('cancellato al doppio', 'effacé au double', 'erased at the double', 'borrado al doble', 'raderad vid dubbeln')})`, pageW - 15, y, { align: 'right' as const });
    y += 6;
    for (const c of mirrorCycles) {
      ensureSpace(6);
      const dur = c.tEndSec - c.tStartSec;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setRGB([40, 40, 40]);
      const q = pdf.splitTextToSize(ascii(c.question) || '-', pageW - 125)[0] || '-';
      pdf.text(`#${c.n} ${q}`, 20, y);
      setRGB([90, 90, 90]);
      pdf.text(`READ ${c.readInst.toFixed(1)} / x2 ${c.readDouble.toFixed(1)}`, pageW - 66, y, { align: 'right' as const });
      pdf.setFont('helvetica', 'bold');
      if (c.erased) { setRGB([16, 150, 110]); pdf.text('* F/N', pageW - 40, y, { align: 'right' as const }); }
      else { setRGB([120, 120, 120]); pdf.text('no F/N', pageW - 40, y, { align: 'right' as const }); }
      pdf.setFont('helvetica', 'normal'); setRGB([110, 110, 110]);
      pdf.text(durata(dur), pageW - 20, y, { align: 'right' as const });
      y += 5;
    }
    { ensureSpace(6);
      const sumV = mirrorCycles.reduce((s, c) => s + c.readInst, 0);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); setRGB([16, 150, 110]);
      pdf.text(`${LC('totale seduta : somma', 'total séance : somme', 'session total : sum', 'total sesión : suma', 'sessionstotal : summa')} ${sumV.toFixed(1)}  ->  ${LC('doppio', 'double', 'double', 'doble', 'dubbel')} ${(2 * sumV).toFixed(1)}`, 20, y);
      y += 5;
    }
    setRGB([40, 40, 40]); y += 4;
  }

  // ── ASSESSMENT — un pannello per ciclo, come App.tsx. `assessCycles` qui viene dal
  // raggruppamento per `gruppo` di `assessItems` (vedi la nota in testa al file), non da un
  // elenco separato: la STESSA forma, una fonte diversa perché SERENITY non tiene
  // `assessCyclesRef` (che in App.tsx non è nemmeno in un hook condiviso).
  const assessCycles = (input.assessCycles ?? []).filter(c => c.items.length > 0);
  if (assessCycles.length > 0) {
    const shortRead = (r: string): string =>
      r === 'LF Blow Down' ? 'LF BD' : r === 'Long Fall' ? 'LONG FALL' : r === 'Fall' ? 'FALL' :
      r === 'SF' ? 'SF' : r === 'Dirty Needle' ? 'DN' : r === 'F/N (Floating)' || r === 'F/N' ? 'F/N' :
      r === 'Tick' ? 'tick' : (r === 'NULL' || r === '-' || !r) ? 'NULL' : r;
    const readColor = (r: string): [number, number, number] =>
      r === 'F/N (Floating)' || r === 'F/N' ? [16, 150, 110] :
      (r === 'Fall' || r === 'Long Fall' || r === 'LF Blow Down' || r === 'SF') ? [200, 90, 40] : [120, 120, 120];
    for (const cyc of assessCycles) {
      ensureSpace(14 + cyc.items.length * 5);
      panelHeader(`ASSESSMENT #${cyc.n}`);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setRGB([120, 120, 120]);
      const dur = cyc.tEndSec - cyc.tStartSec;
      pdf.text(`${cyc.items.length} ${LC('item', 'items', 'items', 'ítems', 'objekt')} - ${durata(dur)}`, pageW - 15, y, { align: 'right' as const });
      y += 6;
      for (const it of cyc.items) {
        ensureSpace(6);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setRGB([40, 40, 40]);
        const q = pdf.splitTextToSize(ascii(it.item) || '-', pageW - 70)[0] || '-';
        pdf.text(q, 20, y);
        const sr = shortRead(it.reaction);
        const strong = sr === 'LF BD' || sr === 'LONG FALL' || sr === 'FALL' || sr === 'SF';
        const col = readColor(it.reaction);
        if (sr !== 'NULL' && it.beforeMs) {
          pdf.setFont('helvetica', 'normal'); setRGB([120, 120, 120]);
          pdf.text(`-${it.beforeMs}ms`, pageW - 40, y, { align: 'right' as const });
        }
        pdf.setFont('helvetica', strong ? 'bold' : 'normal'); setRGB(col);
        pdf.text(sr, pageW - 20, y, { align: 'right' as const });
        y += 5;
      }
      setRGB([40, 40, 40]); y += 4;
    }
  }

  // ── IL GRAFICO Q_L — segnalato: « ajoute aussi le Graphique Q_L et MNA », dichiarato
  // apertamente assente in testa a questo file da quando il PDF esiste. Portato TALE E QUALE
  // da `PostSessionReport.tsx` (App.tsx) — disegnato a primitive `jsPDF` (rettangoli/linee/
  // testo), NON un'immagine catturata da un `<AreaChart>`: nessuna "macchina di cattura" in
  // più da costruire, la nota precedente presumeva un ostacolo che la lettura del sorgente
  // vero non conferma. `sessionRecorder.chart` è LO STESSO singleton già letto altrove in
  // questo file (`maxEtaDaChart`) — non un secondo calcolo. Salta senza strumenti, come in
  // App.tsx: senza un ago non c'è una lettura Q_L da disegnare.
  if (!input.noInstruments) {
    const chart = sessionRecorder.chart;
    ensureSpace(46);
    y += 2;
    panelHeader(t('report_ql_chart'));
    const graphX = 18, graphY = y, graphW = pageW - 36, graphH = 34;
    const maxTime = chart.length > 0 ? (chart[chart.length - 1]?.time || 0) : 0;
    pdf.setFillColor(248, 250, 252);
    pdf.rect(graphX, graphY, graphW, graphH, 'F');
    pdf.setDrawColor(205, 214, 223);
    pdf.rect(graphX, graphY, graphW, graphH);
    pdf.setDrawColor(226, 232, 240);
    for (let gy = 1; gy <= 3; gy++) {
      const yy = graphY + (graphH * gy) / 4;
      pdf.line(graphX, yy, graphX + graphW, yy);
    }
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const tx = graphX + (graphW * i) / tickCount;
      const sec = Math.round((maxTime * i) / tickCount);
      pdf.setDrawColor(210, 218, 226);
      pdf.line(tx, graphY, tx, graphY + graphH);
      setRGB([100, 116, 139]);
      pdf.text(`${sec}s`, tx - 3, graphY + graphH + 4);
    }
    pdf.setDrawColor(234, 179, 8);
    const thresholdY = graphY + graphH * (1 - 0.7);
    pdf.line(graphX, thresholdY, graphX + graphW, thresholdY);
    setRGB([202, 138, 4]);
    pdf.text('F/N 0.7', graphX + graphW - 18, thresholdY - 1);
    if (chart.length > 1) {
      pdf.setDrawColor(34, 197, 94);
      for (let i = 1; i < chart.length; i++) {
        const prev = Math.max(0, Math.min(1, chart[i - 1]?.qL ?? 0));
        const curr = Math.max(0, Math.min(1, chart[i]?.qL ?? 0));
        const x1 = graphX + ((i - 1) / (chart.length - 1)) * graphW;
        const x2 = graphX + (i / (chart.length - 1)) * graphW;
        const y1 = graphY + (1 - prev) * graphH;
        const y2 = graphY + (1 - curr) * graphH;
        pdf.line(x1, y1, x2, y2);
      }
    }
    y += graphH + 9;
    setRGB(INK); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  }

  // ── MNA (MODULAZIONE NEURO-ACUSTICA) — stessa richiesta di sopra. `input.mnaData` è la
  // fotografia di `mnaSessionRef.current` (Serenity.tsx) — LO STESSO oggetto che il pannello
  // MNA a schermo legge (`hooks/useMnaModule.ts`), non un secondo calcolo. Si stampa solo se
  // il modulo è stato davvero usato in questa seduta (stessa guardia di App.tsx).
  const mnaData = input.mnaData;
  if (mnaData && (mnaData.cycles > 0 || mnaData.imHistory.length > 0)) {
    ensureSpace(40);
    y += 2;
    panelHeader(t('mna_report_title'), [86, 207, 225]);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setRGB([40, 40, 40]);
    const mnaMetrics: Array<[string, string, [number, number, number]]> = [
      [t('mna_report_cycles'), String(mnaData.cycles), [86, 207, 225]],
      [t('mna_report_peak_im'), fmtIm(mnaData.peakIm), [232, 193, 112]],
      [t('mna_report_zone'), mnaData.finalZone || '-', [255, 155, 61]],
      [t('mna_report_copies'), String(mnaData.totalCopies), [167, 139, 250]],
    ];
    ensureSpace(16);
    {
      const gap = 3, x0 = 18, tw = (pageW - 36 - gap * 3) / 4;
      mnaMetrics.forEach(([label, value, accent], i) => metricTile(x0 + i * (tw + gap), y, tw, label, value, accent));
      y += 16;
    }
    if (mnaData.phaseLog.length > 1) {
      y += 2;
      const phaseRgb: Record<string, [number, number, number]> = {
        CAPTURE: [86, 207, 225], SONIFY: [232, 193, 112], CLEAN: [255, 155, 61], HARMONICS: [167, 139, 250],
      };
      const log = mnaData.phaseLog;
      const durSec = log.map((e, i) => (log[i + 1] ? Math.max(0, (log[i + 1].t - e.t) / 1000) : 0));
      const cyc: Array<Array<{ phase: string; dur: number }>> = [];
      log.forEach((e, i) => {
        if (e.phase === 'CAPTURE' || cyc.length === 0) cyc.push([]);
        cyc[cyc.length - 1].push({ phase: e.phase, dur: durSec[i] });
      });
      ensureSpace(8 + cyc.length * 8 + 8);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setRGB([60, 80, 120]);
      pdf.text(`>${t('report_mna_phases_log')} :`, 20, y);
      y += 5;
      const labelW = 8, barX = 22 + labelW, barW = pageW - 44 - labelW, barH = 5.5;
      for (let ci = 0; ci < cyc.length; ci++) {
        const segs = cyc[ci];
        const total = segs.reduce((a, b) => a + b.dur, 0) || 1;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); setRGB([86, 150, 180]);
        pdf.text(`#${ci + 1}`, 22, y + barH / 2 + 1.2);
        pdf.setFillColor(235, 235, 235); pdf.rect(barX, y, barW, barH, 'F');
        let cx = barX;
        for (const seg of segs) {
          if (seg.dur <= 0) continue;
          const segW = (seg.dur / total) * barW;
          const c = phaseRgb[seg.phase] || [71, 85, 105];
          pdf.setFillColor(c[0], c[1], c[2]); pdf.rect(cx, y, segW, barH, 'F');
          if (segW > 12) {
            setRGB([255, 255, 255]); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5);
            pdf.text(`${Math.round(seg.dur)}s`, cx + segW / 2, y + barH / 2 + 1.3, { align: 'center' as const });
          }
          cx += segW;
        }
        pdf.setDrawColor(205, 205, 205); pdf.rect(barX, y, barW, barH);
        y += barH + 2.5;
      }
      pdf.setFontSize(6.8);
      let lx = barX;
      for (const ph of Object.keys(phaseRgb)) {
        const c = phaseRgb[ph];
        pdf.setFont('helvetica', 'bold');
        const itemW = 3.5 + pdf.getTextWidth(ph) + 6;
        if (lx + itemW > pageW - 20) { lx = barX; y += 4.5; }
        pdf.setFillColor(c[0], c[1], c[2]); pdf.rect(lx, y - 2, 2.4, 2.4, 'F');
        setRGB([60, 60, 60]);
        pdf.text(ph, lx + 3.5, y);
        lx += itemW;
      }
      pdf.setFont('helvetica', 'normal'); setRGB([40, 40, 40]);
      y += 4;
    }
    y += 4;
    setRGB(INK); pdf.setFontSize(10);
  }

  // ── JOURNAL — segnalato: « Fai apparire il journal nel PDF di HISTORI con tutto il
  // trascritto, le reazioni ed il tono ». Stesso linguaggio visivo della sezione transcript
  // di `generateTextPdf` (App.tsx/PostSessionReport.tsx): monospazio compatto, colore per
  // chi parla, tono in un piccolo tag, reazione se c'è — solo che qui la reazione arriva
  // GIÀ calcolata dal chiamante (`computeInstantRead`, la stessa fonte del pannello Journal
  // a schermo di Serenity.tsx): questa sezione stampa, non ricalcola.
  if (input.journal && input.journal.length > 0) {
    ensureSpace(18);
    panelHeader(LC('giornale', 'journal', 'journal', 'diario', 'journal'));
    const tsX = 16, bodyX = 32, lineH = 3.8, maxW = pageW - bodyX - 14;
    // ⚠️ CORRETTO — segnalato: « les indications de l'aiguille doivent être traduites,
    // notamment en français tu écrit AGO pour aiguille [...] écrit normalement mais avec une
    // couleur qui correspond à CONTACT/DISSOLUTION/AS-IS (gris pour AS-IS) ». Due difetti
    // distinti, corretti insieme: (1) 'AGO' era un letterale italiano fisso, scritto anche nei
    // PDF in francese/inglese/spagnolo/svedese — ora `LC()`, come ogni altra scritta del
    // rapporto. (2) TUTTE le righe AGO (NEEDLE) portavano lo STESSO ambra piatto — nessuna
    // lettura si distingueva da un'altra. `l.reaction` (quando presente — la lettura calcolata
    // al momento, la stessa di `computeInstantRead`) sceglie ora uno dei TRE colori delle zone
    // di carica dell'app (`chargeState.ts`, `LIGHT_PHASE`: contact/discharge/asis) — le stesse
    // usate dall'arco e da `VistaSenzaAgo`, adattate a un fondo bianco. AS-IS→GRIGIO, come
    // chiesto esplicitamente (il suo colore vero, quasi bianco a schermo scuro / verde-acqua a
    // schermo chiaro, sarebbe stato illeggibile o fuorviante su carta). SYS diventa NERO vero
    // (era un grigio chiaro, "SYS NOIR" richiesto esplicitamente).
    const NEEDLE_CONTACT: [number, number, number] = [179, 64, 42];      // #b3402a — LIGHT_PHASE.contact
    const NEEDLE_DISSOLUTION: [number, number, number] = [21, 122, 74];  // #157a4a — LIGHT_PHASE.discharge
    const NEEDLE_ASIS: [number, number, number] = [120, 120, 120];       // grigio, richiesto esplicitamente
    const needleColor = (r?: string): [number, number, number] =>
      r === 'F/N (Floating)' || r === 'F/N' ? NEEDLE_DISSOLUTION :
      (r === 'Fall' || r === 'Long Fall' || r === 'LF Blow Down' || r === 'SF' || r === 'Dirty Needle') ? NEEDLE_CONTACT :
      NEEDLE_ASIS;
    const speakerColor = (sp?: string, reaction?: string): [number, number, number] =>
      sp === 'Aud' ? [21, 94, 160] : sp === 'PC' ? [168, 88, 20] :
      sp === 'NEEDLE' ? needleColor(reaction) : [0, 0, 0];
    const speakerLabel = (sp?: string) =>
      sp === 'Aud' ? 'AUD' : sp === 'PC' ? 'PC'
      : sp === 'NEEDLE' ? LC('AGO', 'AIG', 'NDL', 'AGU', 'NÅL') : 'SYS';
    for (const l of input.journal) {
      ensureSpace(8);
      const col = speakerColor(l.speaker, l.reaction);
      pdf.setFont('courier', 'bold'); pdf.setFontSize(7.2); setRGB([14, 116, 144]);
      pdf.text(`[${(l.time ?? 0).toFixed(1)}s]`, tsX, y);
      pdf.setFont('courier', l.speaker === 'Aud' ? 'bold' : 'normal'); setRGB(col);
      let line = `${speakerLabel(l.speaker)}: ${ascii(String(l.text || '')).replace(/\s+/g, ' ').trim()}`;
      if (l.tone) line += `  [${ascii(t(`tone_${l.tone.label}`)).toUpperCase()}]`;
      const split = pdf.splitTextToSize(line || '-', maxW);
      for (let j = 0; j < split.length; j++) {
        ensureSpace(6);
        pdf.text(split[j], bodyX, y);
        y += lineH;
      }
      if (l.reaction) {
        ensureSpace(6);
        pdf.setFont('courier', 'bold'); setRGB([168, 85, 247]);
        pdf.text(`-> ${ascii(l.reaction)}`, bodyX, y);
        y += lineH;
      }
    }
    y += 4; setRGB(INK); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  }

  return pdf.output('datauristring');
}
