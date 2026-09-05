/**
 * PannelloMna — l'MNA (Modulazione Neuro-Acustica), in SERENITY.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Assente dalla matrice, e non per un caso: `useChargeEngine` scriveva già `primeIm`/`primeFd`/
 * `primeZone`/`primeDelta`/`primePStar` — il motore (`engine/PrimeFreqTracker.ts`, `worker`)
 * gira comunque, semplicemente nessuna interfaccia li leggeva. Stessa forma della CAMM e
 * dell'arco dei cicli: la logica c'era, il controllo no.
 *
 * ── UN ATTREZZO, NON UN MODO ────────────────────────────────────────────────────────────────
 * In App.tsx l'MNA « sta qui ma non è un modo »: si apre SENZA lasciare il ciclo in corso — si
 * può fare un SONIFY mentre un CONTACT gira. Per questo NON è un pannello a tutta pagina come
 * `PannelloEp`/`PannelloConfig` (che SOSTITUISCONO la seduta): è un galleggiante, come le
 * camere — la seduta resta sotto, visibile.
 *
 * ── STESSA MACCHINA A QUATTRO FASI, GRAFICA PROPRIA ────────────────────────────────────────
 * CAPTURE → SONIFY → CLEAN → HARMONICS: ogni pressione esegue l'azione della fase CORRENTE
 * (`handleAzione`, copiato da `MnaPanel.handlePrimeAction` — stessa sequenza, stessi guardrail
 * `canAdvance`). `onCapture` blocca sul PICCO di I_m della finestra recente
 * (`primeFreqTracker.peak()`, l'auditor/PC possono reagire in ritardo); `onAudio` inoltra al PC
 * remoto via `networkManager` (`MNA_AUDIO`) — la sonificazione punta al SUO cervello, l'auditor
 * la sente solo in locale per controllo. Nessuno dei due si reinventa.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useState } from 'react';
import { primeFreqAudio } from '../lib/primeFreqAudio';
import type { PrimePhase, Zone as PrimeZone } from '../lib/primeFreqEngine';
import type { MnaSession } from '../hooks/useMnaModule';
import { useI18n } from '../i18n';

export function PannelloMna({
  primePhase, setPrimePhase, primePhaseRef,
  primeIm, primeFd, primeZone, primeDelta, primePStar,
  primeCopies, setPrimeCopies, primeCaptured,
  mnaSessionRef, onCapture, onAudio, onChiudi,
}: {
  primePhase: PrimePhase;
  setPrimePhase: (p: PrimePhase) => void;
  primePhaseRef: React.MutableRefObject<PrimePhase>;
  primeIm: number; primeFd: number; primeZone: PrimeZone; primeDelta: number; primePStar: number;
  primeCopies: Array<{ p: number; freq: number }>;
  setPrimeCopies: (v: Array<{ p: number; freq: number }>) => void;
  primeCaptured: boolean;
  mnaSessionRef: React.MutableRefObject<MnaSession>;
  onCapture: () => void;
  onAudio: (payload: { action: 'sonify' | 'clean' | 'harmonics' | 'stop'; fd?: number; delta?: number; zone?: PrimeZone; pStar?: number }) => void;
  onChiudi: () => void;
}) {
  const { t } = useI18n();

  /**
   * ⚠️ AGGIUNTO — segnalato: « il MNA quando appare, fallo apparire "chiuso", con il bottone
   * per aprirlo. Questo permette di avere una più grande spazio per l'arco ».
   *
   * ── CHIUSO DI DEFAULT, QUI — E NON PER `MnaPanel.tsx` (EQUILIBRIUM) ─────────────────────
   * `MnaPanel.tsx` (src/components/, EQUILIBRIUM) ha già un `collapsed` ma APERTO di default,
   * per una ragione opposta e già decisa lì: in EQUILIBRIUM il pannello compare SOLO quando lo
   * si chiede esplicitamente (un click su MNA), quindi aprirlo già pieno non ruba spazio non
   * richiesto. Qui in SERENITY invece — v. `Serenity.tsx`, `aperta && moduleVis.mna` — il
   * pannello resta a schermo per tutta la durata del modulo attivo, ancorato in basso SOPRA
   * l'arco: pieno, copre la parte bassa del quadrante anche quando non lo si sta usando in
   * quel momento. Richiesta esplicita e diversa da quella di EQUILIBRIUM: qui parte chiuso.
   */
  const [collapsed, setCollapsed] = useState(true);

  // ── LA STESSA SEQUENZA DI MnaPanel.tsx, non una nuova ─────────────────────────────────────
  const handleAzione = () => {
    primeFreqAudio.init();
    if (primePhase === 'CAPTURE') {
      onCapture();
      setPrimePhase('SONIFY'); primePhaseRef.current = 'SONIFY';
      mnaSessionRef.current.cycles += 1;
      mnaSessionRef.current.phaseLog.push({ phase: 'SONIFY', t: Date.now() });
    } else if (primePhase === 'SONIFY') {
      primeFreqAudio.startSonify(primeFd);
      onAudio({ action: 'sonify', fd: primeFd });
      setPrimePhase('CLEAN'); primePhaseRef.current = 'CLEAN';
      mnaSessionRef.current.phaseLog.push({ phase: 'CLEAN', t: Date.now() });
    } else if (primePhase === 'CLEAN') {
      primeFreqAudio.startClean(primeDelta, primeZone);
      onAudio({ action: 'clean', delta: primeDelta, zone: primeZone });
      setPrimePhase('HARMONICS'); primePhaseRef.current = 'HARMONICS';
      mnaSessionRef.current.phaseLog.push({ phase: 'HARMONICS', t: Date.now() });
    } else if (primePhase === 'HARMONICS') {
      setPrimeCopies([]);
      primeFreqAudio.startHarmonics(primePStar);
      onAudio({ action: 'harmonics', pStar: primePStar });
    }
  };

  const handleStop = () => {
    primeFreqAudio.killAll();
    onAudio({ action: 'stop' });
    setPrimePhase('CAPTURE'); primePhaseRef.current = 'CAPTURE';
    setPrimeCopies([]);
    mnaSessionRef.current.phaseLog.push({ phase: 'CAPTURE', t: Date.now() });
  };

  const canAdvance =
    primePhase === 'CAPTURE'   ? primeCaptured :
    primePhase === 'SONIFY'    ? true :
    primePhase === 'CLEAN'     ? true :
    primePhase === 'HARMONICS' ? primeCopies.length === 0 : false;

  const etichettaFase: Record<PrimePhase, string> = {
    IDLE: '', CAPTURE: t('mna_phase_capture') as string, SONIFY: t('mna_phase_sonify') as string,
    CLEAN: t('mna_phase_clean') as string, HARMONICS: t('mna_phase_harmonics') as string,
  };
  const testoBottone =
    primePhase === 'CAPTURE'   ? (primeFd > 0 ? `${etichettaFase.CAPTURE} · ${primeFd.toFixed(1)} Hz` : etichettaFase.CAPTURE) :
    etichettaFase[primePhase] || null;

  const campo = (etichetta: string, valore: string, visibile = true) => (
    <div style={{ display: 'grid', gap: 2, opacity: visibile ? 1 : 0, transition: 'opacity var(--s-slow) var(--s-ease)', minWidth: 56 }}>
      <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
        {etichetta}
      </span>
      <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-lg)', fontWeight: 600, color: 'var(--s-ink)', fontVariantNumeric: 'tabular-nums' }}>
        {valore}
      </span>
    </div>
  );

  const avvicinamento = Math.max(0, Math.min(1, 1 - primeDelta / 1.5));

  return (
    // ⚠️ Segnalato: « la zone ARC doit avoir le même fond que le fond général... et les zones
    // également, juste un petit liseré très fin de séparation ». `--s-zone-bg`/`--s-zone-border`
    // (v. `tokens.css`): trasparente per davvero in chiaro con un bordo sottile.
    // ⚠️ Segnalato ANCORA: « MNA con un fondo proprio » — il colpevole era `className="s-glass
    // s-glass-lift"`: sfoca (`backdrop-filter`) quel che sta dietro anche a `background`
    // trasparente, che si legge come "una lastra a sé". Santé non porta questa classe — via
    // anche qui, resta solo lo stile in linea con i token della zona.
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 6,
      background: 'var(--s-zone-bg)', border: '1px solid var(--s-zone-border)', borderRadius: 18,
      /* ⚠️ RIDOTTO — segnalato: « in MIRROR quando c'è l'MNA i numeri di quanto carica si
         vedono solo a metà e si deve scrolling, riduci la zona MNA in altezza ». In MIRROR
         `gruppoAlto` cresce (ciclo armato, 3fr) e la tastiera manuale del valore occupa già
         parte di `gruppoBasso`: il pannello, nel suo involucro a `flex:'0 0 auto'` (v.
         `Serenity.tsx`, mai ridotto sotto la sua `minHeight`), restava alto quanto sempre.
         `12px 18px` → `8px 14px` sul contenitore, e i due `marginTop` fra le righe sotto
         (10→6) tolgono qualche pixel in più: pochi, ma è esattamente lo spazio che mancava. */
      padding: '8px 14px', pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.14em', color: 'var(--s-ink-soft)' }}>
          {t('mna_title')}
        </span>
        {primePhase === 'CAPTURE' && (primeZone === 'COMPOSITE' || primeZone === 'MASSIVE') && (
          <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-reserve)' }}>⚡ {t('mna_mass_detected')}</span>
        )}
        {primePhase === 'CLEAN' && primeZone === 'PRIME' && (
          <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-still)' }}>✦ {t('mna_prime_zone')}</span>
        )}
        <span style={{ flex: 1 }} />
        {/* ⚠️ AGGIUNTO — il chevron che apre/chiude, PRIMA della ✕: si chiude il modulo (via
            `onChiudi`, sopra) o si ripiega la sua vista (qui) sono due gesti diversi, come già
            per `PannelloMeter`/`Avvio` altrove in SERENITY — la ✕ resta l'unica che fa
            sparire il pannello del tutto. */}
        {/* Nessun `title` tradotto: il chevron (▾ chiuso · ▴ aperto) è la stessa convenzione
            già usata altrove in SERENITY (v. l'indicatore "configura il meter" in
            `Serenity.tsx`) — non serve una nuova voce di dizionario per un simbolo che si
            legge da solo. */}
        <button className="s-glass s-glass-btn" onClick={() => setCollapsed(c => !c)}
          style={{
            cursor: 'pointer', borderRadius: 999, padding: '4px 10px', background: 'var(--s-disc)',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
          }}>
          {collapsed ? '▾' : '▴'}
        </button>
        <button className="s-glass s-glass-btn" onClick={onChiudi} style={{
          cursor: 'pointer', borderRadius: 999, padding: '4px 10px', background: 'var(--s-disc)',
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
        }}>
          ✕
        </button>
      </div>

      {/* ⚠️ AGGIUNTO — tutto il corpo (letture + bottone d'azione + barra di avvicinamento)
          resta sotto `!collapsed`: chiuso, del pannello rimane solo la barra del titolo appena
          sopra — l'ingombro che chiedeva di lasciare più spazio all'arco. */}
      {!collapsed && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, marginTop: 6 }}>
            {campo(t('mna_im') as string, primeCaptured ? primeIm.toFixed(0) : '—')}
            {campo(t('mna_zone') as string, primeCaptured ? primeZone : '', primeCaptured)}
            {campo(t('mna_fd') as string, primeCaptured ? `${primeFd.toFixed(1)} Hz` : '—')}
            {campo(t('mna_delta') as string, `${primeDelta.toFixed(2)} Hz`, primePhase === 'CLEAN')}
            {campo(t('mna_pstar') as string, String(primePStar), primePhase === 'SONIFY' || primePhase === 'HARMONICS')}
            {campo(t('mna_copies') as string, String(primeCopies.length), primePhase === 'HARMONICS')}

            <span style={{ flex: 1 }} />

            {(primePhase === 'SONIFY' || primePhase === 'CLEAN' || primePhase === 'HARMONICS') && (
              <button className="s-glass s-glass-btn" onClick={handleStop} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.08em', color: 'var(--s-reserve)',
              }}>
                {t('mna_btn_stop')}
              </button>
            )}

            {testoBottone && (
              <button
                onClick={canAdvance ? handleAzione : undefined}
                style={{
                  border: 'none', cursor: canAdvance ? 'pointer' : 'default', borderRadius: 999,
                  padding: '9px 20px', minWidth: 160,
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.04em',
                  background: canAdvance ? 'var(--s-ink)' : 'var(--s-disc-sunk)',
                  color: canAdvance ? 'var(--s-ground-warm)' : 'var(--s-ink-soft)',
                  opacity: canAdvance || primePhase === 'HARMONICS' ? 1 : 0.6,
                  transition: 'background var(--s-slow) var(--s-ease), color var(--s-slow) var(--s-ease)',
                }}>
                {testoBottone}
              </button>
            )}
          </div>

          {(primePhase === 'SONIFY' || primePhase === 'CLEAN' || primePhase === 'HARMONICS') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.08em', color: 'var(--s-ink-faint)', textTransform: 'uppercase' }}>
                → PRIME {primePStar}
              </span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--s-disc-sunk)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round(avvicinamento * 100)}%`, height: '100%', borderRadius: 3,
                  background: 'var(--s-ink)', transition: 'width var(--s-slow) var(--s-ease)',
                }} />
              </div>
              <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
                Δ {primeDelta.toFixed(2)} · {Math.round(avvicinamento * 100)}%
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
