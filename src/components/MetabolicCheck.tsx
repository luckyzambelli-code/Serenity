import React, { useEffect, useRef, useState } from 'react';
import { Headphones } from 'lucide-react';
import { metabolicBaseline, type Rating, type MetabAssessment } from '../engine/MetabolicBaseline';

/**
 * MetabolicCheck — pre-session readiness overlay (advisory). Runs a short passive
 * baseline, then a guided deep-breath test, then shows a traffic light: is the PC
 * settled, well-contacted, with a plausible heart rate and reactive autonomics?
 * The auditor can always start anyway (advisory, per user choice).
 *
 * Drives the phase timeline; the engine is FED by App's METRICS_UPDATE (it reads
 * the live phase via onPhase). The component only reads metabolicBaseline.assess().
 */
type Phase = 'baseline' | 'breath' | 'result';
const BASELINE_MS = 4000;   // préparation (« pose-toi ») avant la respiration guidée : 4 s
const BREATH_HALF = 4000;          // 4 s inhale / 4 s exhale
const BREATH_MS   = BREATH_HALF * 4; // two full cycles

const STR = {
  en: { title: 'Ready for session', sub: 'Physiological check before you begin.',
    muse_on: 'MUSE 2 connected', muse_off: 'MUSE 2 disconnected', muse_not_worn: 'MUSE 2 not worn', wear_muse: 'Put the MUSE on to begin', muse_on_mac: 'MUSE 2 on the Mac', muse_tap: 'connect', muse_busy: 'connecting…', sec_left: 's left', wait_muse: 'Connect the MUSE to begin',
    baseline: 'Settle — soft eyes, breathe normally', breath: 'Deep slow breathing — follow the circle', inhale: 'Inhale', exhale: 'Let it go',
    result: 'Readiness', contact: 'Contact', calm: 'Calm', heart: 'Heart', reactivity: 'Reactivity', reactivity_hint: 'response to the breath',
    go: 'Ready', nogo: 'Not ready', start: 'Start session', redo: 'Redo', skip: 'Skip',
    na: 'n/a', good: 'good', ok: 'ok', poor: 'poor',
    r_contact: 'Electrode contact is poor — reseat the headset',
    r_nobpm: 'No clear pulse (forehead PPG is weak) — heart not assessed' },
  fr: { title: 'Prêt pour la séance', sub: 'Contrôle physiologique avant de commencer.',
    muse_on: 'MUSE 2 connecté', muse_off: 'MUSE 2 déconnecté', muse_not_worn: 'MUSE 2 non porté', wear_muse: 'Portez le MUSE pour commencer', muse_on_mac: 'MUSE 2 sur le Mac', muse_tap: 'connecter', muse_busy: 'connexion…', sec_left: 's restantes', wait_muse: 'Connectez le MUSE pour commencer',
    baseline: 'Posez-vous — regard doux, respiration normale', breath: 'Respiration lente et profonde — suivez le cercle', inhale: 'Inspirez', exhale: 'Laissez aller',
    result: 'État de préparation', contact: 'Contact', calm: 'Calme', heart: 'Cœur', reactivity: 'Réactivité', reactivity_hint: 'réponse à la respiration',
    go: 'Prêt', nogo: 'Pas prêt', start: 'Démarrer la séance', redo: 'Refaire', skip: 'Passer',
    na: 'n/d', good: 'bon', ok: 'ok', poor: 'faible',
    r_contact: 'Contact des électrodes faible — repositionnez le casque',
    r_nobpm: 'Pas de pouls net (PPG frontal faible) — cœur non évalué' },
  it: { title: 'Pronto per la session', sub: 'Controllo fisiologico prima di iniziare.',
    muse_on: 'MUSE 2 connesso', muse_off: 'MUSE 2 disconnesso', muse_not_worn: 'MUSE 2 non indossato', wear_muse: 'Indossa il MUSE per iniziare', muse_on_mac: 'MUSE 2 sul Mac', muse_tap: 'connetti', muse_busy: 'connessione…', sec_left: 's rimanenti', wait_muse: 'Connetti il MUSE per iniziare',
    baseline: 'Rilassati — occhi morbidi, respira normalmente', breath: 'Respiro lento e profondo — segui il cerchio', inhale: 'Inspira', exhale: 'Lascia andare',
    result: 'Prontezza', contact: 'Contatto', calm: 'Calma', heart: 'Cuore', reactivity: 'Reattività', reactivity_hint: 'risposta al respiro',
    go: 'Pronto', nogo: 'Non pronto', start: 'Inizia sessione', redo: 'Rifai', skip: 'Salta',
    na: 'n/d', good: 'buono', ok: 'ok', poor: 'scarso',
    r_contact: 'Contatto degli elettrodi scarso — risistema la fascia',
    r_nobpm: 'Nessun battito chiaro (PPG frontale debole) — cuore non valutato' },
  es: { title: 'Listo para la sesión', sub: 'Comprobación fisiológica antes de empezar.',
    muse_on: 'MUSE 2 conectado', muse_off: 'MUSE 2 desconectado', muse_not_worn: 'MUSE 2 no puesto', wear_muse: 'Ponte el MUSE para empezar', muse_on_mac: 'MUSE 2 en el Mac', muse_tap: 'conectar', muse_busy: 'conectando…', sec_left: 's restantes', wait_muse: 'Conecta el MUSE para empezar',
    baseline: 'Relájate — mirada suave, respira normal', breath: 'Respiración lenta y profunda — sigue el círculo', inhale: 'Inspira', exhale: 'Suéltalo',
    result: 'Preparación', contact: 'Contacto', calm: 'Calma', heart: 'Corazón', reactivity: 'Reactividad', reactivity_hint: 'respuesta a la respiración',
    go: 'Listo', nogo: 'No listo', start: 'Iniciar sesión', redo: 'Repetir', skip: 'Omitir',
    na: 'n/d', good: 'bueno', ok: 'ok', poor: 'bajo',
    r_contact: 'Contacto de electrodos bajo — recoloca la diadema',
    r_nobpm: 'Sin pulso claro (PPG frontal débil) — corazón no evaluado' },
  sv: { title: 'Redo för session', sub: 'Fysiologisk kontroll innan du börjar.',
    muse_on: 'MUSE 2 ansluten', muse_off: 'MUSE 2 frånkopplad', muse_not_worn: 'MUSE 2 bärs inte', wear_muse: 'Ta på MUSE för att börja', muse_on_mac: 'MUSE 2 på datorn', muse_tap: 'anslut', muse_busy: 'ansluter…', sec_left: 's kvar', wait_muse: 'Anslut MUSE för att börja',
    baseline: 'Landa — mjuk blick, andas normalt', breath: 'Djup långsam andning — följ cirkeln', inhale: 'Andas in', exhale: 'Släpp taget',
    result: 'Beredskap', contact: 'Kontakt', calm: 'Lugn', heart: 'Hjärta', reactivity: 'Reaktivitet', reactivity_hint: 'respons på andningen',
    go: 'Redo', nogo: 'Ej redo', start: 'Starta session', redo: 'Gör om', skip: 'Hoppa över',
    na: 'ej', good: 'bra', ok: 'ok', poor: 'svag',
    r_contact: 'Elektrodkontakten är svag — justera headsetet',
    r_nobpm: 'Ingen tydlig puls (svag pann-PPG) — hjärtat ej bedömt' },
} as const;

const RATE_COLOR: Record<Rating, string> = { good: '#34d399', ok: '#fbbf24', poor: '#fb5e3b', na: '#64748b' };
// Traffic-light dot only — no "wait" text (user request: only contact/calm/heart/reactivity
// tells the story); intermediate level shows an amber dot beside the result label.
const LEVEL_COLOR = { go: '#34d399', wait: '#fbbf24', nogo: '#fb5e3b' } as const;

export function MetabolicCheck({ lang, museConnected = true, museWorn = false, museConnecting = false, museOnMac = false, onConnectMuse, onProceed, onCancel, onPhase, onCue,
  mirror = false, mirrorPhase, mirrorInhale, mirrorAssessment = null }: {
  lang: string;
  museConnected?: boolean;
  /** PORTÉ sur la tête (contact réel des électrodes), pas seulement appairé. La préparation
   *  EXIGE le casque PORTÉ : connecté mais posé sur la table ne doit RIEN débloquer. */
  museWorn?: boolean;
  museConnecting?: boolean;           // headset search in progress → badge shows "connecting…"
  /** SATELLITE (côté préclair/téléphone) : le MUSE est sur le MAC de l'auditeur, pas sur ce
   *  téléphone. On NE réclame donc PAS un MUSE local (sinon badge « déconnecté » + écran
   *  d'attente à tort) → badge « MUSE sur le Mac » et gating considéré comme connecté. */
  museOnMac?: boolean;
  onConnectMuse?: () => void;         // tap the DISCONNECTED badge to start connecting the Muse
  /** Called with the final assessment (or null if cancelled mid-way) so the App
   *  can store it for the post-session report. */
  onProceed: (a: MetabAssessment | null) => void;
  onCancel: (a: MetabAssessment | null) => void;
  onPhase: (p: Phase) => void;
  /** SÉANCE À DISTANCE (auditeur) : diffuse au préclair phase + inspir/expir + l'évaluation. */
  onCue?: (phase: Phase, inhale: boolean, a: MetabAssessment) => void;
  /** MODE MIROIR (côté PRÉCLAIR) : écran « Prêt pour la séance » complet, EN LECTURE SEULE,
   *  piloté par l'auditeur (phase/inspir/évaluation reçus). Pas de timeline propre, PAS de
   *  boutons Démarrer/Refaire/Passer (c'est l'auditeur qui décide). */
  mirror?: boolean;
  mirrorPhase?: Phase;
  mirrorInhale?: boolean;
  mirrorAssessment?: MetabAssessment | null;
}) {
  const L = (STR as any)[lang] ?? STR.en;
  // SATELLITE : le MUSE est sur le Mac → pour ce téléphone il compte comme « connecté »
  // (sinon on bloquerait sur l'écran d'attente et le badge dirait « déconnecté »).
  const linked = museConnected || museOnMac;          // appairé / présent
  // PRÊT = appairé ET PORTÉ. En satellite (MUSE sur le Mac) ce téléphone ne peut pas juger du
  // contact → on s'en remet à l'appairage. Sinon : connecté mais PAS porté ne débloque RIEN.
  const effConnected = museOnMac ? linked : (linked && museWorn);
  const linkedNotWorn = linked && !museOnMac && !museWorn;   // appairé mais pas sur la tête
  const [phase, setPhase] = useState<Phase>('baseline');
  const [inhale, setInhale] = useState(true);
  const [, force] = useState(0);              // 250 ms tick to refresh the live readout
  const [runId, setRunId] = useState(0);      // bump = restart the timeline (Redo)
  const startedAtRef = useRef(Date.now());    // anchor for the seconds countdown
  const onPhaseRef = useRef(onPhase); onPhaseRef.current = onPhase;
  const onCueRef = useRef(onCue); onCueRef.current = onCue;

  // MODE MIROIR : la phase / inspir viennent de l'auditeur (props), pas de la timeline locale.
  useEffect(() => {
    if (!mirror) return;
    setPhase(mirrorPhase ?? 'baseline');
    setInhale(!!mirrorInhale);
  }, [mirror, mirrorPhase, mirrorInhale]);

  // ── live readout tick (always running so the badge / countdown refresh) ──────
  useEffect(() => {
    const tick = setInterval(() => force(n => n + 1), 250);
    return () => clearInterval(tick);
  }, [runId]);

  // ── phase timeline ──────────────────────────────────────────────────────────
  // GATE MUSE : on NE lance PAS la baseline → respiration tant que le MUSE n'est pas
  // connecté ET PORTÉ. Sans casque sur la tête, aucune donnée physio n'a de sens ; on
  // reste en attente. Dès qu'il est porté, le compte à rebours démarre proprement.
  // DÉPENDANCE CRITIQUE : `effConnected` (et donc museWorn/museOnMac), PAS seulement
  // museConnected — sinon, casque mis APRÈS l'ouverture, l'effet ne rejouait pas, aucun
  // timer n'était posé et le compte à rebours restait bloqué (bug « se bloque à 1 »).
  useEffect(() => {
    if (mirror) return;   // miroir : la timeline est celle de l'auditeur, pas la nôtre
    startedAtRef.current = Date.now();
    setPhase('baseline'); onPhaseRef.current('baseline');
    if (!effConnected) return;   // hold on baseline; breathing never starts without the MUSE
    const t1 = setTimeout(() => { setPhase('breath'); onPhaseRef.current('breath'); }, BASELINE_MS);
    const t2 = setTimeout(() => { setPhase('result'); onPhaseRef.current('result'); }, BASELINE_MS + BREATH_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [runId, effConnected, mirror, onPhaseRef]);

  // ── breathing pacer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (mirror) return;   // miroir : l'état inspir/expir vient de l'auditeur
    if (phase !== 'breath') return;
    setInhale(true);
    const iv = setInterval(() => setInhale(v => !v), BREATH_HALF);
    return () => clearInterval(iv);
  }, [phase, mirror]);

  // MIROIR : l'évaluation vient de l'auditeur (le préclair ne calcule rien localement) ;
  // sinon (auditeur) on lit metabolicBaseline.assess() comme d'habitude.
  const a = mirror ? (mirrorAssessment ?? metabolicBaseline.assess()) : metabolicBaseline.assess();
  const rate = (r: Rating) => ({ label: L[r], color: RATE_COLOR[r] });

  // Diffuse au préclair phase + inspir + évaluation à chaque changement (auditeur uniquement).
  const aRef = useRef(a); aRef.current = a;
  useEffect(() => { if (!mirror) onCueRef.current?.(phase, inhale, aRef.current); }, [phase, inhale, mirror]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: 460, maxWidth: '92vw', borderRadius: 18, padding: '28px 30px',
        background: 'linear-gradient(160deg, rgba(40,40,46,0.96), rgba(26,26,30,0.94))', backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
        border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10)', color: 'rgba(240,246,255,0.95)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.02em' }}>{L.title}</div>
          {/* MUSE 2 connection badge — mirrors the headset state. When DISCONNECTED it
              becomes a button: tap it to start connecting the Muse without leaving the
              readiness check. Amber pulse = connecting in progress. */}
          {(() => {
            // MINI TOGGLE monochrome (même matière que le badge MUSE du haut) : piste sombre
            // en creux + pouce en verre (cuffie). Pouce plein = connecté. Cliquable si déconnecté.
            // On ne propose « connecter » que si le casque n'est PAS appairé. Appairé mais pas
            // porté → rien à connecter : il faut le METTRE sur la tête.
            const canConnect = !linked && !museConnecting && !!onConnectMuse;
            // ROUGE si le MUSE n'est PAS connecté, VERT s'il l'est (demande utilisateur — mêmes
            // libellés). Ambre pendant la connexion.
            const connCol = effConnected ? '#34d399' : museConnecting ? '#fbbf24' : '#ef4444';
            const connBg  = effConnected ? 'rgba(52,211,153,0.16)' : museConnecting ? 'rgba(251,191,36,0.16)' : 'rgba(239,68,68,0.18)';
            return (
              <button type="button" disabled={!canConnect} onClick={canConnect ? onConnectMuse : undefined}
                title={canConnect ? L.muse_tap : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 12px 3px 3px', borderRadius: 999,
                  background: connBg, boxShadow: `inset 0 2px 6px rgba(0,0,0,0.45), 0 0 12px ${connCol}44`,
                  border: `1px solid ${connCol}`,
                  cursor: canConnect ? 'pointer' : 'default', font: 'inherit' }}>
                <span className={museConnecting ? 'animate-pulse' : undefined}
                  style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: connCol,
                    border: '1px solid rgba(255,255,255,0.3)',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.35)' }}>
                  <Headphones size={13} style={{ color: '#101418' }} />
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: connCol }}>
                  {museOnMac ? L.muse_on_mac : linkedNotWorn ? L.muse_not_worn : museConnected ? L.muse_on : museConnecting ? L.muse_busy : L.muse_off}
                </span>
                {canConnect && (
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(240,246,255,0.7)' }}>· ↻ {L.muse_tap}</span>
                )}
              </button>
            );
          })()}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.4, color: 'rgba(220,228,240,0.7)', marginTop: 6, marginBottom: 20 }}>{L.sub}</div>

        {/* ── BASELINE ─────────────────────────────────────────────────────── */}
        {phase === 'baseline' && (() => {
          // MUSE pas connecté OU pas PORTÉ → on n'a PAS démarré le compte à rebours (la
          // respiration ne commence jamais sans casque SUR LA TÊTE — demande utilisateur).
          // (En satellite le MUSE est sur le Mac → effConnected vrai → pas d'écran d'attente.)
          if (!effConnected) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 24px' }}>
                <div style={{ width: 130, height: 130, borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Headphones size={44} style={{ color: 'rgba(240,246,255,0.55)' }} className={museConnecting ? 'animate-pulse' : undefined} />
                </div>
                <div style={{ marginTop: 18, fontSize: 13, textAlign: 'center', color: 'rgba(230,236,245,0.85)' }}>{linkedNotWorn ? L.wear_muse : L.wait_muse}</div>
              </div>
            );
          }
          // MIROIR (préclair) : pas de timeline locale → on n'affiche pas de compte à rebours
          // (il serait faux). On montre juste l'état « pose-toi » + le contact courant.
          if (mirror) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 24px' }}>
                <div style={{ width: 130, height: 130, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(255,255,255,0.10) inset' }}>
                  <span style={{ fontSize: 30, color: 'rgba(240,246,255,0.9)' }}>•</span>
                </div>
                <div style={{ marginTop: 18, fontSize: 13, color: 'rgba(230,236,245,0.85)' }}>{L.baseline}</div>
                <div style={{ marginTop: 6, fontSize: 11, fontFamily: 'monospace', color: 'rgba(200,214,234,0.6)' }}>{L.contact}: {a.contactVal}%</div>
              </div>
            );
          }
          // Seconds REMAINING until the breath phase — much clearer than a raw sample
          // counter ("what is 47?"). Always strictly positive while we're in baseline.
          const elapsed = Date.now() - startedAtRef.current;
          const remaining = Math.max(1, Math.ceil((BASELINE_MS - elapsed) / 1000));
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 24px' }}>
              <div style={{ width: 130, height: 130, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(255,255,255,0.10) inset' }}>
                <span style={{ fontSize: 36, fontFamily: 'monospace', fontWeight: 300, color: 'rgba(240,246,255,0.95)', lineHeight: 1 }}>{remaining}</span>
                <span style={{ marginTop: 4, fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.06em', color: 'rgba(220,228,240,0.6)', textTransform: 'uppercase' }}>{L.sec_left}</span>
              </div>
              <div style={{ marginTop: 18, fontSize: 13, color: 'rgba(230,236,245,0.85)' }}>{L.baseline}</div>
              <div style={{ marginTop: 6, fontSize: 11, fontFamily: 'monospace', color: 'rgba(200,214,234,0.6)' }}>{L.contact}: {a.contactVal}%</div>
            </div>
          );
        })()}

        {/* ── BREATH PACER ─────────────────────────────────────────────────── */}
        {phase === 'breath' && (() => {
          const elapsed = Date.now() - startedAtRef.current - BASELINE_MS;
          const remaining = Math.max(1, Math.ceil((BREATH_MS - elapsed) / 1000));
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 20px' }}>
              <div style={{ width: 170, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 150, height: 150, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.16), rgba(255,255,255,0.03))',
                  border: '2px solid rgba(255,255,255,0.6)', transform: `scale(${inhale ? 1 : 0.55})`,
                  transition: `transform ${BREATH_HALF}ms ease-in-out`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(240,246,255,0.95)' }}>{inhale ? L.inhale : L.exhale}</span>
                </div>
              </div>
              <div style={{ marginTop: 14, fontSize: 13, color: 'rgba(230,236,245,0.85)' }}>{L.breath}</div>
              <div style={{ marginTop: 4, fontSize: 11, fontFamily: 'monospace', color: 'rgba(200,214,234,0.55)' }}>{remaining}{L.sec_left}</div>
            </div>
          );
        })()}

        {/* ── RESULT ───────────────────────────────────────────────────────── */}
        {phase === 'result' && (
          <div>
            {/* No intermediate ("wait") label — only the dot. Result word shown only
                for the unambiguous extremes: go ("Pronto") / nogo ("Non pronto"). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: LEVEL_COLOR[a.level],
                boxShadow: `0 0 22px ${LEVEL_COLOR[a.level]}aa`, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(200,214,234,0.6)' }}>{L.result}</div>
                {(a.level === 'go' || a.level === 'nogo') ? (
                  <div style={{ fontSize: 22, fontWeight: 800, color: LEVEL_COLOR[a.level] }}>{L[a.level]}</div>
                ) : (
                  <div style={{ fontSize: 13, color: 'rgba(220,228,240,0.7)', marginTop: 2 }}>—</div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {([['contact', a.contact, `${a.contactVal}%`, ''], ['calm', a.calm, '', ''], ['heart', a.heart, a.bpmVal != null ? `${a.bpmVal}` : '—', ''], ['reactivity', a.reactivity, '', L.reactivity_hint]] as const).map(([k, r, val, hint]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 11px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${rate(r).color}44` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'rgba(230,236,245,0.85)' }}>{L[k]}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {val && <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(200,214,234,0.6)' }}>{val}</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, color: rate(r).color }}>{rate(r).label}</span>
                    </span>
                  </div>
                  {hint && <span style={{ fontSize: 9.5, color: 'rgba(200,214,234,0.55)' }}>{hint}</span>}
                </div>
              ))}
            </div>
            {/* Only HARD reasons (contact / no-pulse) — the others are advisory and the
                chips themselves carry the message; we don't add words like "attendi". */}
            {a.reasons.filter(r => ['metab_reason_contact', 'metab_reason_nobpm'].includes(r)).length > 0 && (
              <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {a.reasons.filter(r => ['metab_reason_contact', 'metab_reason_nobpm'].includes(r)).map(rk => (
                  <li key={rk} style={{ fontSize: 11, color: 'rgba(220,228,240,0.7)', display: 'flex', gap: 7 }}>
                    <span style={{ color: '#fbbf24' }}>›</span>{L['r_' + rk.replace('metab_reason_', '')] ?? rk}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── BUTTONS ── MIROIR : AUCUN bouton côté préclair — Démarrer/Refaire/Passer, c'est
             l'AUDITEUR qui décide. Le préclair voit l'écran complet mais ne peut pas lancer. */}
        {!mirror && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {phase === 'result' ? (
            <>
              <button onClick={() => onProceed(a)} style={btn('#e6ecf5', true)}>{L.start}</button>
              <button onClick={() => setRunId(n => n + 1)} style={btn('#cfd8e3', false)}>{L.redo}</button>
              <button onClick={() => onCancel(a)} style={btn('#94a3b8', false)}>{L.skip}</button>
            </>
          ) : (
            // Skipping mid-baseline/breath → assessment isn't complete, pass null.
            <button onClick={() => onCancel(null)} style={btn('#94a3b8', false)}>{L.skip}</button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// Boutons au FORMAT MINI TOGGLE : pilule en verre smerigliato (même matière que les
// toggles / le pouce). `filled` = action principale (Démarrer) → verre plus marqué.
// Monochrome (la couleur reçue est ignorée, on garde la cohérence graphique).
function btn(_color: string, filled: boolean): React.CSSProperties {
  return {
    flex: 1, height: 40, borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    color: 'rgba(240,246,255,0.95)',
    background: filled ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
    border: `1px solid rgba(255,255,255,${filled ? 0.34 : 0.20})`,
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    boxShadow: filled
      ? '0 6px 14px rgba(0,0,0,0.42), inset 0 2px 4px rgba(255,255,255,0.35), inset 0 -5px 9px rgba(0,0,0,0.35)'
      : 'inset 0 1px 0 rgba(255,255,255,0.15)',
  };
}
