/**
 * ColonnaSaluteAssessment — la colonna destra: Santé Système + Assessment, staccata da
 * `Serenity.tsx`.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Terzo pezzo della scomposizione (dopo `ZonaCamere.tsx` e `GiornaleSeduta.tsx` — v.
 * `docs/serenity-refonte.md` per la cronologia completa). Riceve valori e callback già pronti
 * da chi lo monta — nessuna logica spostata, solo il disegno della colonna. `HealthPanel` è
 * montato TALE E QUALE ad `App.tsx` (stesso componente condiviso, `eegBuffer`/`gyroBuffer` sono
 * la STESSA coppia di ref che `useMuseConnection` riempie); `ZonaAssessment` è già un
 * componente a sé (fase precedente della refonte) — questo file monta solo la CORNICE che li
 * tiene insieme, la stessa cornice che stava dentro `Serenity.tsx`.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { useI18n } from '../i18n';
import { HealthPanel } from '../components/HealthPanel';
import { ZonaAssessment, type AssessItemSerenity } from './ZonaAssessment';

export interface ColonnaSaluteAssessmentProps {
  /** `rightColOpen` — l'intera colonna non si monta se falsa. */
  aperta: boolean;
  larghezza: number;
  /** `camStackH` — lo spazio che le camere occupano sopra, per non finirci sotto. */
  paddingSopra: number;
  mostraSalute: boolean;
  mostraAssessment: boolean;
  eegBuffer: React.RefObject<{ [channel: number]: number[] }>;
  gyroBuffer: React.RefObject<{ x: number[]; y: number[]; z: number[] }>;
  realBpm: number | null;
  signalQuality: number;
  museConnection: 'disconnected' | 'searching' | 'connected';
  batteryLevel: number | null;
  sessionRunning: boolean;
  onNascondiSalute: () => void;
  assessAttivo: boolean;
  onToggleAssess: () => void;
  assessItems: AssessItemSerenity[];
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
  dueAghi: boolean;
  onIndica: (id: string, indica: boolean) => void;
  onAggiungiItem: (testo: string, quandoSec?: number) => void;
  cercaLettura: (testo: string) => { tSec: number; frase: string; read?: string; readMuse?: string; readMeter?: string } | null;
}

export function ColonnaSaluteAssessment({
  aperta, larghezza, paddingSopra, mostraSalute, mostraAssessment,
  eegBuffer, gyroBuffer, realBpm, signalQuality, museConnection, batteryLevel, sessionRunning,
  onNascondiSalute, assessAttivo, onToggleAssess, assessItems, LC, dueAghi,
  onIndica, onAggiungiItem, cercaLettura,
}: ColonnaSaluteAssessmentProps) {
  const { t } = useI18n();

  if (!aperta) return null;

  return (
    <div style={{
      width: larghezza, maxWidth: 560, flexShrink: 0, paddingTop: paddingSopra,
      display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto',
    }}>
      {mostraSalute && (
        <div className="ser-health-wrap" style={{ borderRadius: 18 }}>
          <HealthPanel
            eegBuffer={eegBuffer}
            gyroBuffer={gyroBuffer}
            displayBpm={realBpm}
            signalQuality={signalQuality}
            museConnection={museConnection}
            batteryLevel={batteryLevel}
            sessionState={sessionRunning ? 'running' : 'idle'}
            onHide={onNascondiSalute}
            t={k => t(k as Parameters<typeof t>[0])}
            // Solo SERENITY la chiede — v. la nota su `compact` in `HealthPanel.tsx`.
            compact
            // `--s-instrument-bg`, non `--s-zone-bg` (trasparente in entrambi i temi): uno
            // strumento resta uno strumento a prescindere dal tema attorno, a differenza di
            // `ZonaAssessment`/Giornale/`PannelloMna`, che il colore lo seguono da sé.
            panelStyle={extra => ({
              background: 'var(--s-instrument-bg)',
              border: '1px solid var(--s-zone-border)',
              ...extra,
            })}
          />
        </div>
      )}
      {mostraAssessment && (
        <div style={{ maxHeight: '70%', minHeight: 280, flexShrink: 0, display: 'flex', pointerEvents: 'auto' }}>
          <ZonaAssessment
            attivo={assessAttivo}
            onToggle={onToggleAssess}
            items={assessItems}
            LC={LC}
            dueAghi={dueAghi}
            onIndica={onIndica}
            onAggiungiItem={onAggiungiItem}
            cercaLettura={cercaLettura}
          />
        </div>
      )}
    </div>
  );
}
