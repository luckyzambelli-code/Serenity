import React from 'react';
import { LAYER } from "../ui/layers";

/**
 * R1 (robustness): a top-level Error Boundary. Before this, any uncaught error in
 * App's render tree produced a fully BLANK screen — catastrophic mid-session. Now a
 * recoverable panel is shown instead, the error is logged, and the user can reload
 * without losing the on-disk session draft (see R3).
 *
 * Kept dependency-free (no i18n/context) on purpose: the boundary must work even if
 * the thing that failed is a provider/context above it.
 */
interface State { error: Error | null; info: string | null; }
interface Props {
  children: React.ReactNode;
  /** ⚠️ AGGIUNTO — SERENITY non aveva NESSUN error boundary (solo EQUILIBRIUM lo montava in
   *  `src/main.tsx`): un errore di rendering non gestito in `Serenity.tsx` (7000+ righe, 51
   *  effetti, zero test) faceva sparire l'intera interfaccia a schermo bianco, IN SEDUTA, senza
   *  nessun modo di recuperare senza riavviare l'app — lo stesso guasto che questo componente
   *  esiste apposta per evitare in EQUILIBRIUM. Un `brand` invece di due componenti quasi
   *  identici: la sola differenza reale fra le due schermate è il nome mostrato.
   */
  brand?: 'EQUILIBRIUM' | 'SERENITY';
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to the console and to the global crash buffer (R2) if present.
    console.error('[ErrorBoundary] caught render error:', error, info?.componentStack);
    try { (window as any).__smCrashLog?.push({ t: Date.now(), kind: 'render', message: error.message, stack: error.stack, componentStack: info?.componentStack }); } catch (_) {}
    this.setState({ info: info?.componentStack || null });
  }

  private reload = () => { try { location.reload(); } catch (_) {} };

  private copyDetails = () => {
    const { error, info } = this.state;
    const brand = this.props.brand || 'EQUILIBRIUM';
    const text = `${brand} error\n${error?.name}: ${error?.message}\n\n${error?.stack || ''}\n\nComponent stack:${info || ''}`;
    try { navigator.clipboard?.writeText(text); } catch (_) {}
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: LAYER.crash,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
        background: 'radial-gradient(ellipse at center, #07142a 0%, #020617 70%, #01030a 100%)',
        color: '#e2e8f0', fontFamily: 'monospace', padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 'clamp(22px,5vw,40px)', fontWeight: 900, letterSpacing: '0.08em', color: '#22d3ee', textShadow: '0 0 22px rgba(34,211,238,0.45)' }}>
          {this.props.brand || 'EQUILIBRIUM'}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fca5a5' }}>
          Une erreur inattendue s'est produite · Si è verificato un errore imprevisto
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, maxWidth: 620 }}>
          La session en cours est sauvegardée automatiquement. Rechargez l'application pour reprendre.
          <br />La sessione in corso è salvata automaticamente. Ricarica l'app per riprendere.
        </div>
        {this.state.error?.message && (
          <pre style={{
            maxWidth: '80vw', maxHeight: 160, overflow: 'auto', textAlign: 'left',
            fontSize: 11, color: '#93c5fd', background: 'rgba(0,8,20,0.6)',
            border: '1px solid rgba(34,211,238,0.25)', borderRadius: 8, padding: '10px 14px',
          }}>{this.state.error.name}: {this.state.error.message}</pre>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button onClick={this.reload} style={{
            fontSize: 14, fontWeight: 'bold', letterSpacing: '0.04em', color: '#021018',
            background: '#22d3ee', border: 'none', borderRadius: 10, padding: '12px 24px', cursor: 'pointer',
            boxShadow: '0 0 16px rgba(34,211,238,0.4)',
          }}>↻ Recharger / Ricarica</button>
          <button onClick={this.copyDetails} style={{
            fontSize: 13, color: '#cbd5e1', background: 'transparent',
            border: '1px solid rgba(148,163,184,0.4)', borderRadius: 10, padding: '12px 20px', cursor: 'pointer',
          }}>Copier le détail</button>
        </div>
      </div>
    );
  }
}
