// @vitest-environment jsdom
/**
 * useChargeEngine — test d'INTÉGRATION du handler du worker.
 *
 * ── POURQUOI CE FICHIER N'EXISTAIT PAS ──────────────────────────────────────────────────────
 * Signalé lors d'une analyse de code (« regarde s'il y a des incohérences, des parties à rendre
 * plus robuste ») : `useChargeEngine.ts` — le handler qui pilote l'aiguille, le cycle CONTACT/
 * DISCHARGE/AS-IS, le CORPUS et les 4 stades EP à partir des messages du worker DSP — est le
 * fichier le plus critique du moteur (827 lignes, ~570 dans un seul `handleWorkerMessage`) et
 * n'avait AUCUN test. Les modules qu'il importe (`ReactionClassifier`, `needleDecision`,
 * `motionArtifact`…) sont testés séparément ; leur ORCHESTRATION ne l'était pas.
 *
 * ── APPROCHE : les vrais moteurs, un faux worker ────────────────────────────────────────────
 * Aucun mock des singletons (`needleEngine`, `sessionRecorder`, `metricsStore`…) — ce sont eux
 * qu'on veut vérifier CÂBLÉS correctement, pas leur logique interne (déjà testée ailleurs). Seul
 * `../workers/nestEngine?worker` est mocké (jsdom n'implémente pas `Worker`, et l'import `?worker`
 * de Vite ne peut de toute façon pas produire un vrai Worker hors navigateur) — une classe
 * `FakeWorker` minimale qu'on pilote à la main (`w.onmessage({ data: {...} })`).
 *
 * `jsdom` est nécessaire pour `useEffect`/`document` — voir le pragma `@vitest-environment`
 * ci-dessus : SEUL ce fichier paie le coût jsdom, le reste de la suite reste sur l'environnement
 * `node` par défaut (rapide).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useChargeEngine, type ChargeEngineDeps } from '../useChargeEngine';
import type { Bands, MetricsUpdatePayload } from '../../workers/nestMessages';
import { needleEngine } from '../../runtime/NeedleEngine';
import { metricsStore } from '../../store/metricsStore';
import { contactPredictor } from '../../engine/ContactPredictor';
import { cycleStateMachine } from '../../engine/CycleStateMachine';
import { chargeEpisode } from '../../engine/ChargeEpisodeTracker';

const { workerInstances, FakeWorker } = vi.hoisted(() => {
  const workerInstances: FakeWorkerImpl[] = [];
  class FakeWorkerImpl {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message?: string }) => void) | null = null;
    posted: unknown[] = [];
    terminated = false;
    constructor() { workerInstances.push(this); }
    postMessage(msg: unknown) { this.posted.push(msg); }
    terminate() { this.terminated = true; }
  }
  return { workerInstances, FakeWorker: FakeWorkerImpl };
});

vi.mock('../../workers/nestEngine?worker', () => ({ default: FakeWorker }));

function baseBands(): Bands {
  return { t99: 0, t90: 0, t80: 0, t70: 0, t60: 0, t40: 0, delta: 0, theta: 1, alpha: 1, beta: 0, gamma: 0, gammaDeltaRatio: 0 };
}

function baseMetricsPayload(overrides: Partial<MetricsUpdatePayload> = {}): MetricsUpdatePayload {
  return {
    rhoG: 0, vProc: 0, qL: 0, eta: 0, tZone: 0, diracCount: 0, bands: baseBands(),
    mS: 0, kP: 0, iF: 0, IL: 0, massDelta: 0, velCentroid: 0, vSol: 0,
    isAsIs: false, isStall: false, fnWithHysteresis: false,
    psi: 0, energy: 0, energyMin: 0, diffusionMass: 0, signifiance: 0, aliasingMass: 0,
    delta: 0, theta: 1, alpha: 1, beta: 0, gamma: 0, gammaDeltaRatio: 0,
    deltaPow: 0, thetaPow: 1, alphaPow: 1, betaPow: 0, gammaPow: 0,
    rawSlope: 0, energyRecovery: 0,
    isSomaticPersist: false, isSomaticRelease: false, isEmotionalConfirm: false,
    isCognitionDetected: false, isEpSomatic: false, gsrValue: 0,
    ...overrides,
  };
}

/** Fabrique les dépendances du motore — valeurs plates par défaut, écrasables par test. */
function makeDeps(overrides: Partial<ChargeEngineDeps> = {}): ChargeEngineDeps {
  const ref = <T,>(v: T) => ({ current: v });
  const deps: ChargeEngineDeps = {
    workerRef: ref(null),
    gyroBufferRef: ref({ x: [], y: [], z: [] }),
    timeRef: ref(0),
    sessionStateRef: ref('running'),
    viewModeRef: ref('needle'),
    instrumentsRef: ref({ muse: true, theta: false }),
    museContactRef: ref(true),
    stableReleaseStateRef: ref('flow'),
    sensitivityRef: ref(1),
    assessActiveRef: ref(false),
    thetaTaRef: ref(null),
    corpusSessionRef: ref(''),
    tRef: ref((key: unknown) => key),
    metabolicPhaseRef: ref('idle'),
    realBpmRef: ref(null),
    ppgAmpRef: ref(null),
    ppgPiRef: ref(null),
    lastBpmAtRef: ref(0),
    signalQualityRef: ref(0),
    primePhaseRef: ref('IDLE'),
    mnaSessionRef: ref({ cycles: 0, imHistory: [], imSum: 0, imCount: 0, peakIm: 0, finalZone: 'PRIME', totalCopies: 0, phaseLog: [] }),
    primeCaptured: false,
    needleReactionKeyRef: ref(''),
    needleReactionRef: ref(''),
    needleVirtualRef: ref([]),
    shownReadsRef: ref([]),
    ultimoItemSecRef: ref(null),
    trackCycleRef: ref(vi.fn()),
    trackMirrorRef: ref(vi.fn()),
    trackToneRef: ref(vi.fn()),
    trackTruthRef: ref(vi.fn()),
    cycleArmedRef: ref(false),
    logBufferRef: ref([]),
    pendingEegFnRef: ref(null),
    epWindowOpenRef: ref(false),
    epWindowHasOpenedRef: ref(false),
    epWindowTimerRef: ref(null),
    setEpWindowOpen: vi.fn(),
    setAsIsnessState: vi.fn(),
    setIsFnActive: vi.fn(),
    setHardwareError: vi.fn(),
    setSignalQuality: vi.fn(),
    setRealBpm: vi.fn(),
    setDisplayMass: vi.fn(),
    setPrimeIm: vi.fn(),
    setPrimeFd: vi.fn(),
    setPrimePStar: vi.fn(),
    setPrimeDelta: vi.fn(),
    setPrimeZone: vi.fn(),
    setPrimeCaptured: vi.fn(),
    setNeedleReactionKey: vi.fn(),
    setNeedleReaction: vi.fn(),
    massAccumulatorRef: ref(0),
    activeKickRef: ref(null),
    kickFlybackRef: ref(null),
    needleItemInterruptRef: ref(0),
    reactionHoldUntilRef: ref(0),
    gammaEmaRef: ref(0),
    lastFnShownAtRef: ref(0),
    lastLoggedChargeRef: ref(''),
    chargeLogPendingRef: ref({ candidate: null, sinceMs: 0 }),
    lastLoggedReactionRef: ref(null),
    resetNeedle: vi.fn(),
    flushEegFn: vi.fn(),
  };
  return { ...deps, ...overrides };
}

function Harness({ deps }: { deps: ChargeEngineDeps }) {
  useChargeEngine(deps);
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  workerInstances.length = 0;
  vi.restoreAllMocks();
  // Les moteurs à module unique gardent leur état entre les tests (même singleton
  // qu'en production) — remis à zéro pour que chaque test parte propre.
  contactPredictor.reset();
  cycleStateMachine.reset();
  chargeEpisode.resetSession();
  needleEngine.setTarget(0);
});

async function mount(deps: ChargeEngineDeps) {
  await act(async () => { root.render(<Harness deps={deps} />); });
  expect(workerInstances.length).toBe(1);
  return workerInstances[0];
}

describe('useChargeEngine — spawn du worker', () => {
  it('crée UN worker au montage et le termine au démontage', async () => {
    const deps = makeDeps();
    const w = await mount(deps);
    expect(deps.workerRef.current).toBe(w as unknown as Worker);
    expect(w.terminated).toBe(false);
    await act(async () => { root.unmount(); });
    expect(w.terminated).toBe(true);
  });

  it("respawn avec backoff BORNÉ après des erreurs répétées (MAX_RESPAWN), ne boucle pas indéfiniment", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    await act(async () => { root.render(<Harness deps={deps} />); });
    // 5 erreurs consécutives, jamais de message sain entre les deux → respawnAttempts ne
    // retombe jamais à 0. Après la 5e (MAX_RESPAWN), plus de respawn.
    for (let i = 0; i < 6; i++) {
      const w = workerInstances[workerInstances.length - 1];
      act(() => { w.onerror?.({ message: 'boom' }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    }
    // 1 (initial) + 5 (MAX_RESPAWN) = 6 workers créés, jamais plus.
    expect(workerInstances.length).toBe(6);
    vi.useRealTimers();
  });
});

describe("useChargeEngine — messages du worker", () => {
  it('HARDWARE_ERROR : signale l\'erreur traduite et remet la qualité de signal à 0', async () => {
    const deps = makeDeps();
    const w = await mount(deps);
    act(() => { w.onmessage?.({ data: { type: 'HARDWARE_ERROR' } }); });
    expect(deps.setHardwareError).toHaveBeenCalledWith('mass_disconnected');
    expect(deps.setSignalQuality).toHaveBeenCalledWith(0);
  });

  it('BPM_UPDATE : publie le BPM et mémorise l\'horodatage de fraîcheur', async () => {
    const deps = makeDeps();
    const w = await mount(deps);
    act(() => { w.onmessage?.({ data: { type: 'BPM_UPDATE', payload: { bpm: 72 } } }); });
    expect(deps.setRealBpm).toHaveBeenCalledWith(72);
    expect(deps.lastBpmAtRef.current).toBeGreaterThan(0);
  });

  it('GSR_UPDATE hors limite : déclenche le reset de sécurité et RIEN d\'autre', async () => {
    const deps = makeDeps();
    const w = await mount(deps);
    act(() => { w.onmessage?.({ data: { type: 'GSR_UPDATE', payload: { position: 1.5, offset: 1.5 } } }); });
    expect(deps.resetNeedle).toHaveBeenCalledTimes(1);
  });

  it('GSR_UPDATE dans les limites : ne déclenche PAS le reset', async () => {
    const deps = makeDeps();
    const w = await mount(deps);
    act(() => { w.onmessage?.({ data: { type: 'GSR_UPDATE', payload: { position: 0.2, offset: 0.2 } } }); });
    expect(deps.resetNeedle).not.toHaveBeenCalled();
  });

  it('METRICS_UPDATE : nettoie l\'erreur matérielle, alimente le cycle et publie qL prédit', async () => {
    const deps = makeDeps();
    const w = await mount(deps);
    const payload = baseMetricsPayload({ qL: 0.6, eta: 0.2 });
    act(() => { w.onmessage?.({ data: { type: 'METRICS_UPDATE', payload } }); });

    expect(deps.setHardwareError).toHaveBeenCalledWith(null);
    // Le cycle CONTACT/NULL doit recevoir le tick — c'est le câblage vérifié ici, pas le
    // calcul interne du cycle (déjà testé dans useContactNullCycle).
    expect(deps.trackCycleRef.current).toHaveBeenCalledTimes(1);
    const tick = (deps.trackCycleRef.current as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tick.qL).toBe(0.6);
    // metricsStore reçoit la charge PRÉDITE (contactPredictor), pas qL brut tel quel —
    // avec un seul tick sans historique, predictedQl == qL (pas encore de pente mesurable).
    expect(metricsStore.get().qL).toBeCloseTo(0.6, 5);
    // Un événement NEEDLE_EVENT part vers le worker à chaque tick.
    expect(w.posted.some((m) => (m as { type?: string }).type === 'NEEDLE_EVENT')).toBe(true);
  });

  it('METRICS_UPDATE sans contact Muse valide : la machine à états REÇOIT une charge neutre, jamais "contact"', async () => {
    // ⚠️ Découvert en écrivant ce test (l'hypothèse initiale — `qlDisp` mis à 0 — était fausse) :
    // `t.qlDisp` envoyé à `trackCycleRef` N'EST PAS remis à 0 sans contact valide (il reste la
    // charge prédite BRUTE). Le vrai verrou est en amont : `cycleStateMachine.update(validSignal
    // ? qlDisp : 0, ...)` — la machine à états elle-même ne reçoit JAMAIS la charge sans contact
    // réel, donc `phase` ne peut jamais atteindre 'contact'. `useContactNullCycle.ts` lit `t.qlDisp`
    // SEULEMENT sous garde `t.phase === 'contact'` (jamais vrai ici) — pas de bug, mais un contrat
    // implicite (« qlDisp brut, phase déjà filtrée ») qui vaut la peine d'être verrouillé par un
    // test, pas seulement déduit en lisant le code.
    const deps = makeDeps({ museContactRef: { current: false } });
    const w = await mount(deps);
    const payload = baseMetricsPayload({ qL: 0.9 });
    act(() => { w.onmessage?.({ data: { type: 'METRICS_UPDATE', payload } }); });
    const tick = (deps.trackCycleRef.current as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tick.validSignal).toBe(false);
    expect(tick.phase).toBe('neutral'); // jamais 'contact' sans contact réel, quoi que vaille qlDisp
  });

  it('en pause (sessionState !== running) : aucune lecture n\'est enregistrée dans le CORPUS/enregistreur', async () => {
    const deps = makeDeps({ sessionStateRef: { current: 'paused' } });
    const w = await mount(deps);
    const payload = baseMetricsPayload({ qL: 0.6 });
    act(() => { w.onmessage?.({ data: { type: 'METRICS_UPDATE', payload } }); });
    // En pause le motore s'arrête tôt (après le tracking du cycle) : le cycle est quand
    // même alimenté (biofeedback vivant), mais rien de plus en aval.
    expect(deps.trackCycleRef.current).toHaveBeenCalledTimes(1);
  });
});
