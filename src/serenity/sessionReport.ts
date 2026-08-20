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
 * ── PERCHÉ NON È UN PORTING RIGA PER RIGA ──────────────────────────────────────────────────
 * `generateTextPdf` di App.tsx è ~800 righe: banner, pannelli per OGNI famiglia di ciclo
 * (CONTACT/NULL/MIRROR/TONE/ASSESSMENT, ciascuno con la sua tabella), il grafico Q_L, MNA,
 * Next C/S. SERENITY non tiene ancora quegli ARRAY per-ciclo (`auditingCycles`/`mirrorCycles`/
 * `toneCycles`/`assessCycles` di App.tsx — un ELENCO di ogni ciclo con esito, non solo
 * l'ultimo): costruirlo a specchio è un giro a sé, dichiarato aperto qui sotto e nel
 * changelog. Questo file copre quel che SERENITY misura GIÀ per intero — data/durata/nomi,
 * massa, TA totale, F/N, EP — con lo STESSO linguaggio visivo del PDF di App.tsx (banner
 * colorato, pannelli con barra d'accento, riquadri-metrica), non un disegno reinventato.
 *
 * ── LA CONTA DEGLI F/N — STESSA LOGICA, STESSA FONTE ───────────────────────────────────────
 * `sessionRecorder.reactions`/`.chart` sono lo stesso singleton condiviso di App.tsx, già
 * riempiti da `useChargeEngine`/`useMuseConnection` (montati anche qui) — mancava solo chi
 * pubblica il PDF e chi conta gli episodi F/N, ricopiata parola per parola da
 * `PostSessionReport.tsx` (fusione delle micro-interruzioni sotto 1s in un solo episodio).
 *
 * @see docs/serenity-refonte.md
 */

import { jsPDF } from 'jspdf';
import { sessionRecorder } from '../engine/SessionRecorder';
import type { SessionSummary } from '../lib/storage';

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

/**
 * Il PDF leggero per History — STESSO linguaggio visivo di `generateTextPdf` (App.tsx):
 * banner colorato, pannelli con barra d'accento, riquadri-metrica. Copre le sezioni che
 * SERENITY misura per intero; le tabelle per-ciclo (CONTACT/NULL/MIRROR/TONE/ASSESSMENT, una
 * riga per ciclo) restano un giro a sé — vedi la nota in testa al file.
 */
export async function generaPdf(
  input: SerenityReportInput,
  t: (key: string) => string,
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string,
): Promise<string> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  let y = 12;
  const setRGB = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
  const panelHeader = (title: string, accent: [number, number, number] = ACCENT) => {
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
  pdf.text(`- ${ascii(t('report_duration'))} : ${Math.floor(input.duration / 60)}m ${input.duration % 60}s`, 20, y); y += 6;
  pdf.text(`- ${ascii(t('report_auditor'))} : ${ascii(input.auditorName || 'N/A')}`, 20, y); y += 6;
  if (!input.isSolo) { pdf.text(`- ${ascii(t('report_preclear'))} : ${ascii(input.pcName || 'N/A')}`, 20, y); y += 6; }
  pdf.text(`- ${ascii(LC('strumenti', 'instruments', 'instruments', 'instrumentos', 'instrument'))} : ${
    ascii(input.noInstruments
      ? LC('nessuno', 'aucun', 'none', 'ninguno', 'inga')
      : LC('vedi indicatori', 'voir indicateurs', 'see indicators', 'ver indicadores', 'se indikatorer'))}`, 20, y);
  y += 12;

  // ── LE METRICHE ───────────────────────────────────────────────────────────────────────
  panelHeader(t('report_summary_section'));
  const tileW = (pageW - 28 - 3 * 4) / 4;
  metricTile(14, y, tileW, LC('massa', 'masse', 'mass', 'masa', 'massa'), `${Math.round(input.mass)}%`, ACCENT);
  metricTile(14 + tileW + 4, y, tileW, t('total_ta'), input.totalTa.toFixed(2), [86, 156, 214]);
  metricTile(14 + 2 * (tileW + 4), y, tileW, 'F/N', String(contaFn(sessionRecorder.reactions)), [52, 211, 153]);
  metricTile(14 + 3 * (tileW + 4), y, tileW,
    LC('EP', 'EP', 'EP', 'EP', 'EP'), input.epValidated ? '✓' : '-',
    input.epValidated ? [52, 211, 153] : [148, 163, 184]);
  y += 15 + 8;
  if (input.deltaStar !== undefined && input.deltaStarN && input.deltaStarN > 0) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); setRGB([100, 110, 125]);
    pdf.text(ascii(`${LC('ritardo di Ron', 'retard de Ron', 'Ron\'s Lag', 'retraso de Ron', 'Rons fördröjning')} (n=${input.deltaStarN}) : ${input.deltaStar.toFixed(2)}s`), 20, y);
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

  // ── QUEL CHE MANCA ANCORA — dichiarato nel PDF stesso, non solo nel changelog: onesto
  // anche per chi legge il PDF senza aver letto docs/serenity-refonte.md. */
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); setRGB([150, 158, 170]);
  pdf.text(ascii(LC(
    'Le tabelle dettagliate per ciclo (CONTACT/NULL/MIRROR/TONE/ASSESSMENT) non sono ancora in questo rapporto.',
    'Les tableaux détaillés par cycle (CONTACT/NULL/MIRROR/TONE/ASSESSMENT) ne sont pas encore dans ce rapport.',
    'Detailed per-cycle tables (CONTACT/NULL/MIRROR/TONE/ASSESSMENT) are not in this report yet.',
    'Las tablas detalladas por ciclo (CONTACT/NULL/MIRROR/TONE/ASSESSMENT) aun no estan en este informe.',
    'Detaljerade tabeller per cykel (CONTACT/NULL/MIRROR/TONE/ASSESSMENT) finns inte i denna rapport an.')),
    14, 285);

  return pdf.output('datauristring');
}
