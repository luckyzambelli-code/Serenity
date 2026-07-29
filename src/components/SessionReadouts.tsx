import React from 'react';
import { useMetric } from '../store/metricsStore';
import { useI18n } from '../i18n';

// CONN-122 (perf, stage 3): tiny memoized readouts that each subscribe to ONE
// metric from the external metricsStore. They re-render ~10 Hz (they must, to show
// the number) but App does NOT — only these few <span>s update.

export const ToneArmReadout = React.memo(function ToneArmReadout({ isLightTheme }: { isLightTheme: boolean }) {
  const toneArm = useMetric(m => m.toneArm);
  return (
    <span className="text-4xl font-light tabular-nums font-mono"
      style={{ color: isLightTheme ? '#0f172a' : 'rgba(224,242,248,0.92)' }}>
      {Math.min(6.0, Math.max(2.0, toneArm)).toFixed(2)}
    </span>
  );
});

export const TotalTaReadout = React.memo(function TotalTaReadout(
  { isLightTheme, label, override, bodyMotion = false }:
  { isLightTheme: boolean; label: string;
    /** Total TA delle BOÎTES, quando il meter è collegato: è una resistenza MISURATA e
     *  prevale su quella ricostruita dall'EEG. Un solo numero a schermo, come chiesto —
     *  ma la SORGENTE deve cambiare, o si mostrerebbe in silenzio il totale dell'EEG,
     *  che è un'altra grandezza e non coincide col Theta-Meter. */
    override?: number | null;
    /** Il conteggio è sospeso perché la persona si muove: va detto, o sembra rotto. */
    bodyMotion?: boolean }) {
  const eeg = useMetric(m => m.totalTa);
  const totalTa = override ?? eeg;
  // Two lines (label over value), right-aligned — keeps the top-right column tidy
  // now that the live T-ZONES sit just below.
  return (
    <span className="flex flex-col items-end mt-0.5 leading-tight"
      style={{ color: isLightTheme ? '#64748b' : 'rgba(148,163,184,0.60)' }}>
      <span className="text-[11px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-sans)' }}>{label}</span>
      <span className="text-base tabular-nums font-mono">{totalTa.toFixed(2)}</span>
      {bodyMotion && (
        <span className="text-[9px] uppercase tracking-wider" style={{ color: '#fbbf24' }}>
          {'\u2014'} motion
        </span>
      )}
    </span>
  );
});

// RELEASE-SPEED ratio (velRatio = smoothVProc / personal baseline). Moved here from
// the dial corner (it sat over the needle) → under the Tone-Arm column on the right.
// ≥1× = releasing at/above the PC's own norm (green) · <1× = below norm (cyan).
export const SpeedReadout = React.memo(function SpeedReadout({ isLightTheme, label }: { isLightTheme: boolean; label: string }) {
  const velRatio = useMetric(m => m.velRatio);
  const { t } = useI18n();
  // ÉTAT EXPLICITE (plus clair que « Cause / Effet ») : la vitesse de libération COURANTE
  // comparée à la NORME personnelle du PC (velRatio = vitesse / baseline auto-calibrée).
  //   ≥ 1.15× → RAPIDE ↑ (libère au-dessus de sa norme)
  //   0.85–1.15× → NORMAL (à sa norme)
  //   < 0.85× → LENT ↓ (en dessous de sa norme)
  // Monochrome (cohérent avec l'interface) : la FORCE se lit à la LUMINOSITÉ + la flèche.
  const st = velRatio >= 1.15 ? 'fast' : velRatio < 0.85 ? 'slow' : 'norm';
  const word = t((st === 'fast' ? 'rel_fast' : st === 'slow' ? 'rel_slow' : 'rel_norm') as any) as string;
  const arrow = st === 'fast' ? '↑' : st === 'slow' ? '↓' : '';
  const numCol = isLightTheme
    ? (st === 'fast' ? '#0f172a' : st === 'slow' ? '#94a3b8' : '#64748b')
    : (st === 'fast' ? 'rgba(240,246,255,0.95)' : st === 'slow' ? 'rgba(165,178,208,0.5)' : 'rgba(200,214,234,0.72)');
  return (
    <span className="flex flex-col items-end mt-0.5 leading-tight"
      style={{ color: isLightTheme ? '#94a3b8' : 'rgba(148,163,194,0.55)' }}>
      <span className="text-[9px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-sans)' }}>{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[13px] tabular-nums font-mono" style={{ color: numCol }}>{velRatio.toFixed(2)}×</span>
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: numCol, fontFamily: 'var(--font-sans)' }}>{word}{arrow}</span>
      </span>
    </span>
  );
});
