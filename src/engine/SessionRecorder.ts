/**
 * SessionRecorder — the session's data sinks (chart history, reaction/metrics/qL
 * histories, needle-offset trail, CSV lines), extracted from App.tsx
 * (SessionEngine slice 3). Pure TS, no React.
 *
 * Each buffer keeps the EXACT cap it had inline in the worker handler, now in
 * one place (so the CSV-header-preservation fix and every length cap live
 * together and are testable). The arrays are public so the few external readers
 * (the reaction classifier needs the live offset trail; the report takes a
 * snapshot; R&I lookup reads the reaction history) keep working unchanged.
 */

// Exact original header (13 columns) — preserved on every CSV trim.
const CSV_HEADER = 'Timestamp,Type,Data1,Data2,Data3,Data4,Data5,Data6,Data7,Data8,Data9,Data10,Data11,Data12';

export interface ReactionEntry { time: number; reaction: string; charge?: string }
export interface MetricsEntry  { time: number; qL: number; eta: number; vSol: number; IL: number; fnRaw: boolean }
export interface TimeQl        { time: number; qL: number }
export interface OffsetEntry   { time: number; offset: number }

export class SessionRecorder {
  /** Full-resolution chart points (2 Hz). `any` to mirror the original shape. */
  chart: any[] = [];
  /** Needle reaction log (+ charge state) — feeds R&I + report. */
  reactions: ReactionEntry[] = [];
  /** Raw post-hoc metrics for R&I analysis. */
  metrics: MetricsEntry[] = [];
  /** GSR-based R&I: raw qL sampled each METRICS_UPDATE. */
  qlSamples: TimeQl[] = [];
  /** Rendered needle-offset trail (100 ms) — read live by the classifier. */
  needleOffsets: OffsetEntry[] = [];
  /** CSV export lines (header + rows). */
  csv: string[] = [CSV_HEADER];

  // ── Capped pushes (each cap identical to the original inline logic) ───────

  /** PERF cap: pushed ~22 Hz → keep ≤10000 (trim oldest down to 8000). */
  pushReaction(e: ReactionEntry): void {
    this.reactions.push(e);
    if (this.reactions.length > 10000) this.reactions.splice(0, this.reactions.length - 8000);
  }

  /** Cap ~10000 (~3 min @60Hz) — keep the newest 8000. */
  pushMetrics(e: MetricsEntry): void {
    this.metrics.push(e);
    if (this.metrics.length > 10000) this.metrics = this.metrics.slice(-8000);
  }

  /** Keep ~60 s @ ~25 Hz. */
  pushQl(e: TimeQl): void {
    this.qlSamples.push(e);
    if (this.qlSamples.length > 1500) this.qlSamples.splice(0, this.qlSamples.length - 1500);
  }

  /** Keep ~last 600 samples (~the R&I window). */
  pushNeedleOffset(e: OffsetEntry): void {
    this.needleOffsets.push(e);
    if (this.needleOffsets.length > 600) this.needleOffsets.splice(0, this.needleOffsets.length - 600);
  }

  /** 2 Hz chart sink. Decimate (keep every 2nd) past 7200 so the whole session
   *  SHAPE survives without unbounded growth. */
  pushChart(point: any): void {
    this.chart.push(point);
    if (this.chart.length > 7200) this.chart = this.chart.filter((_, i) => i % 2 === 0);
  }

  /** CSV row. Trim from index 1 past 20000 so the HEADER (index 0) is kept. */
  pushCsv(line: string): void {
    this.csv.push(line);
    if (this.csv.length > 20000) this.csv.splice(1, 5000);
  }

  /** Session start — clear every buffer (CSV keeps just the header). */
  reset(): void {
    this.chart = [];
    this.reactions = [];
    this.metrics = [];
    this.qlSamples = [];
    this.needleOffsets = [];
    this.csv = [CSV_HEADER];
  }
}

/** Singleton — one session pipeline per app instance. */
export const sessionRecorder = new SessionRecorder();
