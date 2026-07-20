import React, { useEffect, useRef, useState } from 'react';
import { taAccumulator, type TaCalibration } from '../engine/TaAccumulator';
import { calibFeatures, type CalibFeatureSet } from '../engine/CalibFeatures';
import { GlassCollapseToggle } from './GlassCollapseToggle';

/**
 * TaCalibrationPanel — calibre le TA d'Equilibrium (reconstruit depuis l'EEG) pour qu'il
 * COÏNCIDE avec un meter réel (GSR). Deux outils, comme demandé :
 *   1) SLIDERS live : baseline (repos) / GAIN (pente) / SPAN (amplitude) — on règle à l'œil en
 *      comparant les deux instruments côte à côte (même Mac). Sauvegarde automatique.
 *   2) CAPTURE de paires + FIT auto : à plusieurs niveaux de charge on saisit « le meter lit X »,
 *      le panneau capture le mS courant, puis un grid-search trouve GAIN/SPAN (baseline = lecture
 *      au repos) qui minimisent l'écart, et les applique.
 * PRÉSENTATION + calibration UI only : ne touche à aucun calcul DSP.
 */
// `feat` = snapshot des bandes brutes + BPM au moment de la capture (Option B : chasse d'un
// prédicteur du TA machine-invariant via des RATIOS calculés offline). Optionnel → rétro-compatible
// avec les anciens exports qui n'ont que ms/meterTa.
type Pair = { ms: number; meterTa: number; feat?: CalibFeatureSet };

// Grid-search : baseline = TA meter de la capture au plus petit |mS| (le repos). Puis on cherche
// gain/span qui minimisent Σ(taForMs − meterTa)². Simple, robuste, suffisant pour 2 paramètres.
function fitCalibration(pairs: Pair[]): TaCalibration | null {
  if (pairs.length < 2) return null;
  const rest = pairs.reduce((a, b) => (Math.abs(b.ms) < Math.abs(a.ms) ? b : a));
  const baseline = rest.meterTa;
  let best: TaCalibration | null = null;
  let bestErr = Infinity;
  for (let gain = 0.1; gain <= 2.0001; gain += 0.05) {
    for (let span = 0.3; span <= 4.0001; span += 0.1) {
      let err = 0;
      // Utilise la MÊME formule que le moteur (compression log du mS) pour rester cohérent.
      for (const p of pairs) err += (taAccumulator.taForMs(p.ms, { baseline, gain, span }) - p.meterTa) ** 2;
      if (err < bestErr) { bestErr = err; best = { baseline, gain: Math.round(gain * 100) / 100, span: Math.round(span * 100) / 100 }; }
    }
  }
  return best;
}

export function TaCalibrationPanel({ lang = 'it', onClose }: { lang?: string; onClose: () => void }) {
  const L = (it: string, fr: string, en: string) => (lang === 'it' ? it : lang === 'fr' ? fr : en);

  // Valeurs de calibration (sliders) — initialisées depuis l'accumulateur, sauvées à chaque change.
  const [cal, setCal] = useState<TaCalibration>(() => taAccumulator.getCalibration());
  // Lectures LIVE (mS + TA + fraîcheur) — l'accumulateur n'est pas réactif → on le sonde à ~7 Hz.
  // isLive = le mS a été mis à jour < 800 ms (session en cours + EEG qui scorre). Sinon FIGÉ.
  const [live, setLive] = useState({ ms: 0, ta: taAccumulator.toneArm, isLive: false, pi: 0 });
  const [meterInput, setMeterInput] = useState('');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [label, setLabel] = useState(''); // note libre (ex. « PC Mario · Mac studio ») exportée
  const [note, setNote] = useState('');   // feedback éphémère (import OK / erreur)
  const meterRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => setLive({ ms: taAccumulator.lastMs, ta: taAccumulator.toneArm,
      isLive: Date.now() - taAccumulator.lastMsAt < 800, pi: calibFeatures.ppgPI }), 140);
    return () => clearInterval(id);
  }, []);

  const apply = (next: Partial<TaCalibration>) => {
    const merged = { ...cal, ...next };
    setCal(merged);
    taAccumulator.setCalibration(next); // persiste
  };

  const capture = () => {
    const v = parseFloat(meterInput.replace(',', '.'));
    if (!isFinite(v) || v <= 0) return;
    // GARDE : refuse la capture si le mS est FIGÉ (pas de session / EEG). Sinon on enregistrait
    // 17× le même mS (données inutilisables, cf. exports Lise/Maurizio).
    if (!(Date.now() - taAccumulator.lastMsAt < 800)) {
      setNote(L('mS FERMO — avvia la sessione (MUSE che scorre) prima di catturare',
                'mS FIGÉ — démarre la séance (MUSE qui scorre) avant de capturer',
                'mS FROZEN — start the session (MUSE streaming) before capturing'));
      setTimeout(() => setNote(''), 3500);
      return;
    }
    // Option B : on enregistre AUSSI les bandes brutes + BPM à cet instant → pour chasser offline
    // un prédicteur du TA (ratios machine-invariants), l'mS s'étant révélé non transférable.
    setPairs(p => [...p, { ms: taAccumulator.lastMs, meterTa: v, feat: calibFeatures.snapshot() }]);
    setMeterInput('');
    meterRef.current?.focus();
  };

  const runFit = () => {
    const fitted = fitCalibration(pairs);
    if (fitted) { setCal(fitted); taAccumulator.setCalibration(fitted); }
  };

  const resetDefaults = () => { const d = { baseline: 2.0, gain: 0.6, span: 2.1 }; setCal(d); taAccumulator.setCalibration(d); };

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3500); };

  // EXPORT : télécharge un JSON { calibration, pairs, label } → à déplacer sur un autre Mac/PC.
  const exportCalib = () => {
    const data = { kind: 'equilibrium-ta-calibration', version: 1, exportedAt: new Date().toISOString(), label: label.trim(), calibration: cal, pairs };
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (label.trim() || 'ta-calib').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
      a.href = url; a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { flash(L('Errore export', 'Erreur export', 'Export error')); }
  };

  // IMPORT : lit un JSON exporté, applique la calibration (persistée) et recharge les paires.
  const importCalib = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(String(r.result));
        const c = d?.calibration ?? d; // accepte aussi un JSON { baseline, gain, span } nu
        if (typeof c?.baseline !== 'number' || typeof c?.gain !== 'number' || typeof c?.span !== 'number') { flash(L('File non valido', 'Fichier invalide', 'Invalid file')); return; }
        const clean = { baseline: c.baseline, gain: c.gain, span: c.span };
        setCal(clean); taAccumulator.setCalibration(clean);
        if (Array.isArray(d?.pairs)) setPairs(d.pairs.filter((p: any) => typeof p?.ms === 'number' && typeof p?.meterTa === 'number'));
        if (typeof d?.label === 'string') setLabel(d.label);
        flash(L('Calibrazione importata ✓', 'Calibrage importé ✓', 'Calibration imported ✓'));
      } catch { flash(L('File non valido', 'Fichier invalide', 'Invalid file')); }
    };
    r.readAsText(file);
  };

  const ink = 'rgba(240,246,255,0.92)';
  const dim = 'rgba(200,214,234,0.62)';
  const glassRow: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px' };

  const Slider = ({ label, keyName, min, max, step, val }: { label: string; keyName: keyof TaCalibration; min: number; max: number; step: number; val: number }) => (
    <div style={{ ...glassRow, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: dim }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: 'monospace', color: ink }}>{val.toFixed(2)}</span>
      </div>
      <input type="range" className="glass-range" min={min} max={max} step={step} value={val}
        onChange={e => apply({ [keyName]: parseFloat(e.target.value) } as Partial<TaCalibration>)} style={{ width: '100%' }} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 20 }}>
      <div style={{ width: 460, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', borderRadius: 18, padding: '22px 24px', color: ink,
        background: 'linear-gradient(160deg, rgba(40,40,46,0.96), rgba(26,26,30,0.94))', backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
        border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{L('Calibrazione TA', 'Calibrage TA', 'TA calibration')}</span>
          <GlassCollapseToggle on onToggle={onClose} title={L('Chiudi', 'Fermer', 'Close')} />
        </div>

        {/* Live readouts */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <div style={{ ...glassRow, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: dim }}>TA Equilibrium</div>
            <div style={{ fontSize: 30, fontWeight: 300, fontFamily: 'monospace', lineHeight: 1.1 }}>{live.ta.toFixed(1)}</div>
          </div>
          <div style={{ ...glassRow, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: dim }}>mS ({L('carica', 'charge', 'charge')})</div>
            <div style={{ fontSize: 30, fontWeight: 300, fontFamily: 'monospace', lineHeight: 1.1, color: live.isLive ? ink : '#fbbf24' }}>{live.ms.toFixed(2)}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: live.isLive ? '#6ee7b7' : '#fbbf24' }}>{live.isLive ? 'LIVE' : L('FERMO', 'FIGÉ', 'FROZEN')}</div>
          </div>
          {/* PPG — INDICE DE PERFUSION (AC/DC) : la voie AUTONOMIQUE, la seule qui partage le
              système du meter. Affiché LIVE pour voir s'il est vivant et s'il BOUGE pendant la
              capture (s'il reste plat, le site frontal ne donne rien et c'est déjà une réponse). */}
          <div style={{ ...glassRow, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: dim }}>PPG · PI</div>
            <div style={{ fontSize: 30, fontWeight: 300, fontFamily: 'monospace', lineHeight: 1.1, color: live.pi > 0 ? ink : '#fbbf24' }}>{live.pi > 0 ? live.pi.toFixed(3) : '—'}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: live.pi > 0 ? '#6ee7b7' : '#fbbf24' }}>{live.pi > 0 ? 'AC/DC' : L('NESSUN POLSO', 'PAS DE POULS', 'NO PULSE')}</div>
          </div>
        </div>

        {/* Sliders */}
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: dim, margin: '14px 0 2px' }}>{L('Regolazione live', 'Réglage live', 'Live tuning')}</div>
        <Slider label={L('Baseline (riposo)', 'Baseline (repos)', 'Baseline (rest)')} keyName="baseline" min={1.5} max={4} step={0.05} val={cal.baseline} />
        <Slider label={L('GAIN (pendenza)', 'GAIN (pente)', 'GAIN (slope)')} keyName="gain" min={0.1} max={2} step={0.02} val={cal.gain} />
        <Slider label={L('SPAN (ampiezza)', 'SPAN (amplitude)', 'SPAN (range)')} keyName="span" min={0.3} max={4} step={0.05} val={cal.span} />

        {/* Capture + fit */}
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: dim, margin: '16px 0 6px' }}>{L('Cattura coppie + fit', 'Capture + fit', 'Capture + fit')}</div>
        <div style={{ fontSize: 11, lineHeight: 1.4, color: dim, marginBottom: 8 }}>
          {L('Solo con mS LIVE (sessione avviata, MUSE che scorre). A vari livelli di carica: scrivi quanto segna il meter e premi Cattura. Poi Calcola.',
             'Uniquement avec mS LIVE (séance démarrée, MUSE qui scorre). À plusieurs niveaux de charge : saisis ce que lit le meter et Capture. Puis Calcule.',
             'Only with LIVE mS (session started, MUSE streaming). At several charge levels: type the meter reading and Capture. Then Fit.')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={meterRef} value={meterInput} onChange={e => setMeterInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') capture(); }}
            placeholder={L('Meter TA (es. 3.2)', 'Meter TA (ex. 3.2)', 'Meter TA (e.g. 3.2)')} inputMode="decimal"
            style={{ flex: 1, padding: '9px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: ink, fontSize: 13, outline: 'none' }} />
          <button onClick={capture} disabled={!live.isLive} className="glass-btn" style={{ padding: '0 14px', fontSize: 12, opacity: live.isLive ? 1 : 0.4 }}>{L('Cattura', 'Capturer', 'Capture')}</button>
        </div>

        {pairs.length > 0 && (
          <div style={{ ...glassRow, marginTop: 8, padding: '8px 12px' }}>
            {pairs.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: 'monospace', padding: '2px 0', color: ink }}>
                <span>mS {p.ms.toFixed(2)} → meter {p.meterTa.toFixed(1)}{p.feat ? <span style={{ color: dim }}> · δθαβγ✓</span> : null}</span>
                <button onClick={() => setPairs(a => a.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: dim, cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={runFit} disabled={pairs.length < 2} className="glass-btn" style={{ flex: 1, opacity: pairs.length < 2 ? 0.4 : 1 }}>{L('Calcola (fit)', 'Calculer (fit)', 'Fit')}</button>
          <button onClick={() => setPairs([])} className="glass-btn" style={{ padding: '0 14px' }}>{L('Svuota', 'Vider', 'Clear')}</button>
          <button onClick={resetDefaults} className="glass-btn" style={{ padding: '0 14px' }}>{L('Default', 'Défaut', 'Default')}</button>
        </div>

        {/* Export / Import — pour tester sur plusieurs Mac/PC puis figer la calibration finale */}
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: dim, margin: '16px 0 6px' }}>{L('Esporta / Importa', 'Export / Import', 'Export / Import')}</div>
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder={L('Etichetta (es. PC Mario · Mac1)', 'Libellé (ex. PC Mario · Mac1)', 'Label (e.g. PC Mario · Mac1)')}
          style={{ width: '100%', padding: '9px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: ink, fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={exportCalib} className="glass-btn" style={{ flex: 1 }}>⬇ {L('Esporta', 'Exporter', 'Export')}</button>
          <button onClick={() => fileRef.current?.click()} className="glass-btn" style={{ flex: 1 }}>⬆ {L('Importa', 'Importer', 'Import')}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) importCalib(f); e.currentTarget.value = ''; }} />
        </div>
        {note && <div style={{ fontSize: 11, color: 'rgba(240,246,255,0.85)', marginTop: 6, textAlign: 'center' }}>{note}</div>}

        <div style={{ fontSize: 10.5, lineHeight: 1.45, color: dim, marginTop: 14 }}>
          {L('Nota: il MUSE misura EEG (testa), il meter GSR (mani) — la calibrazione fa combaciare al meglio, non è identica. Indossa il MUSE e tieni le lattine insieme, sullo stesso Mac.',
             'Note : le MUSE mesure l\'EEG (tête), le meter le GSR (mains) — le calibrage rapproche au mieux, sans être identique. Porte le MUSE et tiens les cans en même temps, sur le même Mac.',
             'Note: MUSE reads EEG (head), the meter GSR (hands) — calibration is a best-fit, not identical. Wear the MUSE and hold the cans together, on the same Mac.')}
        </div>
      </div>
    </div>
  );
}
