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
 * ── QUEL CHE RESTA FUORI, DI PROPOSITO ─────────────────────────────────────────────────────
 * Il grafico Q_L (un `<AreaChart>` di recharts, catturato come immagine) e il pannello MNA —
 * due pezzi visivi, non tabellari, che richiedono la loro stessa macchina di cattura: restano
 * dichiarati aperti, non finti con un disegno inventato qui.
 *
 * @see docs/serenity-refonte.md
 */

import { jsPDF } from 'jspdf';
import { sessionRecorder } from '../engine/SessionRecorder';
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
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
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
    const speakerColor = (sp?: string): [number, number, number] =>
      sp === 'Aud' ? [21, 94, 160] : sp === 'PC' ? [168, 88, 20] :
      sp === 'NEEDLE' ? [180, 120, 20] : [140, 140, 140];
    const speakerLabel = (sp?: string) =>
      sp === 'Aud' ? 'AUD' : sp === 'PC' ? 'PC' : sp === 'NEEDLE' ? 'AGO' : 'SYS';
    for (const l of input.journal) {
      ensureSpace(8);
      const col = speakerColor(l.speaker);
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

  // ── QUEL CHE MANCA ANCORA — dichiarato nel PDF stesso, non solo nel changelog: onesto
  // anche per chi legge il PDF senza aver letto docs/serenity-refonte.md.
  ensureSpace(20);
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); setRGB([150, 158, 170]);
  pdf.text(ascii(LC(
    'Il grafico Q_L e il pannello MNA non sono ancora in questo rapporto.',
    'Le graphique Q_L et le panneau MNA ne sont pas encore dans ce rapport.',
    'The Q_L chart and the MNA panel are not in this report yet.',
    'El gráfico Q_L y el panel MNA aún no están en este informe.',
    'Q_L-diagrammet och MNA-panelen finns inte i denna rapport än.')),
    14, pageH - 12);

  return pdf.output('datauristring');
}
