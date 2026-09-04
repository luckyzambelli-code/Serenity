// @vitest-environment jsdom
/**
 * useMuseConnection — le casque, de la recherche à la reconnexion silencieuse.
 *
 * ── PÉRIMÈTRE ────────────────────────────────────────────────────────────────────────────────
 * Signalé lors de l'analyse de code : ce hook (550 lignes, protocole Bluetooth complet — jeton
 * d'annulation, ré-câblage des flux, reconnexion silencieuse à 6 tentatives) n'avait AUCUN test.
 * Le commentaire en tête du fichier prévenait déjà : « NE SI PUÒ PROVARE SENZA LA CUFFIA » — vrai
 * pour un test manuel, pas pour un test automatisé : `MuseClient` (de `muse-js`) est mocké ici
 * par un `FakeMuseClient` pilotable à la main, sur le même principe que le `FakeWorker` de
 * `useChargeEngine.test.tsx`. `networkManager` (singleton réel, importé directement par le hook —
 * pas injecté) N'EST PAS mocké : `.send()` sur une instance jamais connectée va dans son buffer
 * sans effet de bord (vérifié dans `networkManager.test.ts`) — juste vidé entre deux tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMuseConnection, type MuseConnectionDeps } from '../useMuseConnection';
import { networkManager } from '../../lib/networkManager';

// `act()` importé directement de 'react' (pas de @testing-library/react ici) a besoin de ce
// drapeau pour savoir qu'il tourne dans un environnement de test — sans lui, il émet
// l'avertissement « environment not configured » et NE FLUSHE PAS toujours correctement les
// effets/promesses imbriquées : les premiers tests (les plus simples) passaient quand même,
// les suivants (états asynchrones enchaînés) échouaient en cascade dès le 3e test du fichier.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── FakeMuseClient — un Subject minimal (subscribe/next, + .value pour connectionStatus,
// qui muse-js expose comme un BehaviorSubject) et un client pilotable à la main. ──────────────
// ⚠️ `connect`/`start` délèguent à `connectImpl.current`/`startImpl.current` (des CHAMPS DE
// CLASSE — propriétés D'INSTANCE, jamais sur `.prototype` : réassigner `FakeMuseClient.
// prototype.connect` n'aurait rien changé, chaque nouvelle instance écrase avec SON PROPRE
// champ). Le délégué, lui, est une closure sur une variable PARTAGÉE, hors classe — le
// réassigner avant `handleConnectMuse()` change le comportement du PROCHAIN client construit.
const { FakeMuseClient, lastClient, connectImpl, startImpl } = vi.hoisted(() => {
  const lastClient: { current: unknown } = { current: null };
  const connectImpl: { current: (server?: unknown) => Promise<void> } = { current: async () => {} };
  const startImpl: { current: () => Promise<void> } = { current: async () => {} };
  class FakeSubject<T> {
    private subs: Array<(v: T) => void> = [];
    value: T;
    constructor(initial: T) { this.value = initial; }
    subscribe(cb: (v: T) => void) {
      this.subs.push(cb);
      return { unsubscribe: () => { this.subs = this.subs.filter((s) => s !== cb); } };
    }
    next(v: T) { this.value = v; this.subs.slice().forEach((cb) => cb(v)); }
  }
  class FakeMuseClientImpl {
    enablePpg = false;
    enableAux = false;
    deviceName = 'Muse-TEST';
    // `client.gatt.device` = l'appareil Bluetooth ; `device.gatt.connect()` = SON propre
    // serveur GATT (différent de `client.gatt`, le wrapper de muse-js) — la reconnexion
    // silencieuse rouvre CELUI-LÀ. `deviceGattConnect` exposé pour le piloter depuis les tests.
    deviceGattConnect = vi.fn(async () => ({}));
    gatt = { device: { gatt: { connect: () => (this as unknown as FakeMuseClientImpl).deviceGattConnect() } } };
    eegReadings = new FakeSubject<{ electrode: number; samples: number[] }>({ electrode: -1, samples: [] });
    ppgReadings = new FakeSubject<{ ppgChannel: number; samples: number[] }>({ ppgChannel: -1, samples: [] });
    accelerometerData = new FakeSubject<{ samples: { x: number; y: number; z: number }[] }>({ samples: [] });
    gyroscopeData = new FakeSubject<{ samples: { x: number; y: number; z: number }[] }>({ samples: [] });
    telemetryData = new FakeSubject<{ batteryLevel: number }>({ batteryLevel: 0 });
    connectionStatus = new FakeSubject<boolean>(true);
    connect = vi.fn((server?: unknown) => connectImpl.current(server));
    start = vi.fn(() => startImpl.current());
    disconnect = vi.fn();
    constructor() { lastClient.current = this; }
  }
  return { FakeMuseClient: FakeMuseClientImpl, lastClient, connectImpl, startImpl };
});
type FakeMuseClientT = InstanceType<typeof FakeMuseClient>;

vi.mock('muse-js', () => ({ MuseClient: FakeMuseClient }));

function makeDeps(overrides: Partial<MuseConnectionDeps> = {}): MuseConnectionDeps {
  const deps: MuseConnectionDeps = {
    eegBuffer: { current: { 0: [], 1: [], 2: [], 3: [] } },
    gyroBuffer: { current: { x: [], y: [], z: [] } },
    eegBatchRef: { current: [] },
    ppgBatchRef: { current: [] },
    gyroBatchRef: { current: [] },
    postToWorker: vi.fn(),
    appMode: () => 'local',
    satelliteMode: () => false,
    sessionRunning: () => false,
    nowSec: () => 0,
    uiTime: () => 0,
    addLog: vi.fn(),
    tr: (key: string) => key,
    setBatteryLevel: vi.fn(),
    pauseOnLoss: vi.fn(),
  };
  return { ...deps, ...overrides };
}

function Harness({ deps, out }: { deps: MuseConnectionDeps; out: { current: ReturnType<typeof useMuseConnection> | null } }) {
  out.current = useMuseConnection(deps);
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  lastClient.current = null;
  connectImpl.current = async () => {};
  startImpl.current = async () => {};
  // jsdom n'expose pas `navigator.bluetooth` — la présence seule suffit au hook (il ne
  // l'utilise que comme garde `if (!navigator.bluetooth)`), la valeur importe peu ici.
  Object.defineProperty(navigator, 'bluetooth', { value: {}, configurable: true });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  networkManager.clearBuffer();
  networkManager.disconnect();
  Reflect.deleteProperty(navigator, 'bluetooth');
});

async function mount(deps: MuseConnectionDeps) {
  const out: { current: ReturnType<typeof useMuseConnection> | null } = { current: null };
  await act(async () => { root.render(<Harness deps={deps} out={out} />); });
  return out;
}

describe('useMuseConnection — pas de Bluetooth disponible', () => {
  it('échoue proprement, sans jamais toucher à MuseClient', async () => {
    Reflect.deleteProperty(navigator, 'bluetooth');
    const deps = makeDeps();
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    expect(out.current!.museConnection).toBe('disconnected');
    expect(lastClient.current).toBeNull();
  });
});

describe('useMuseConnection — connexion', () => {
  it('connexion réussie : recherche → connecté, souscrit à tous les flux', async () => {
    const deps = makeDeps();
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    expect(out.current!.museConnection).toBe('connected');
    expect(out.current!.museEverConnected).toBe(true);
    const client = lastClient.current as FakeMuseClientT;
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.start).toHaveBeenCalledTimes(1);
  });

  it("un appel PENDANT la recherche annule (jeton bumpé, client déconnecté, pas d'état 'connected')", async () => {
    const deps = makeDeps();
    let resolveConnect: () => void = () => {};
    // connect() qui ne se résout JAMAIS tant qu'on ne le décide pas → le hook reste en 'searching'.
    connectImpl.current = () => new Promise<void>((res) => { resolveConnect = res; });
    const out = await mount(deps);
    // ⚠️ `act()` SYNCHRONE ici, pas `await act(async () => ...)` — on ne veut capturer QUE la
    // partie synchrone de `handleConnectMuse()` (le `setMuseConnection('searching')` avant son
    // premier `await`), pas attendre toute la promesse (qui reste VOLONTAIREMENT en suspens).
    // Un `act()` async imbriqué dans un autre encore ouvert corrompait le suivi interne de React
    // — les 9 tests APRÈS celui-ci échouaient tous avec `out.current` resté `null`.
    let firstPromise: Promise<boolean> | undefined;
    act(() => { firstPromise = out.current!.handleConnectMuse(); });
    expect(out.current!.museConnection).toBe('searching');
    await act(async () => { await out.current!.handleConnectMuse(); }); // annulation explicite
    expect(out.current!.museConnection).toBe('disconnected');
    const client = lastClient.current as FakeMuseClientT;
    expect(client.disconnect).toHaveBeenCalled();
    resolveConnect();
    await act(async () => { await firstPromise; });
  });

  it('déconnexion explicite depuis "connected" : arrête le client et les souscriptions', async () => {
    const deps = makeDeps();
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    const client = lastClient.current as FakeMuseClientT;
    await act(async () => { await out.current!.handleConnectMuse(); });
    expect(out.current!.museConnection).toBe('disconnected');
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('timeout de connexion (> MUSE_CONNECT_TIMEOUT_MS) → repasse à "disconnected", jamais bloqué', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    connectImpl.current = () => new Promise<void>(() => {}); // ne se résout jamais
    const out = await mount(deps);
    // Même précaution que le test précédent : ne PAS envelopper l'appel entier (qui reste
    // en suspens jusqu'au timeout) dans un `act()` async pendant qu'un autre `act()` avance
    // les timers — appel direct, un seul `act()` actif à la fois.
    const call = out.current!.handleConnectMuse();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_100); });
    await act(async () => { await call; });
    expect(out.current!.museConnection).toBe('disconnected');
  });
});

describe('useMuseConnection — routage des données (mode local)', () => {
  it("EEG électrode 1 → au worker + mémorisé dans eegBuffer, et l'horodatage 'vivant' avance", async () => {
    const deps = makeDeps({ appMode: () => 'local' });
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    const client = lastClient.current as FakeMuseClientT;
    act(() => { client.eegReadings.next({ electrode: 1, samples: [1, 2, 3] }); });
    expect(deps.postToWorker).toHaveBeenCalledWith({ type: 'RAW_EEG', payload: [1, 2, 3] });
    expect(deps.eegBuffer.current[1]).toEqual([1, 2, 3]);
    expect(out.current!.lastLocalEegAtRef.current).toBeGreaterThan(0);
  });

  it("mode 'participant' : l'EEG local part dans eegBatchRef (pour l'auditeur), PAS au worker", async () => {
    const deps = makeDeps({ appMode: () => 'participant' });
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    const client = lastClient.current as FakeMuseClientT;
    act(() => { client.eegReadings.next({ electrode: 1, samples: [5, 6] }); });
    expect(deps.postToWorker).not.toHaveBeenCalled();
    expect(deps.eegBatchRef.current).toHaveLength(1);
    expect(deps.eegBatchRef.current[0].s).toEqual([5, 6]);
  });

  it('télémétrie : met à jour le niveau de batterie', async () => {
    const deps = makeDeps();
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    const client = lastClient.current as FakeMuseClientT;
    act(() => { client.telemetryData.next({ batteryLevel: 73 }); });
    expect(deps.setBatteryLevel).toHaveBeenCalledWith(73);
  });
});

describe('useMuseConnection — reconnexion silencieuse', () => {
  it("perte du signal GATT : passe à 'searching' (jamais 'connected' menteur) et journalise", async () => {
    const deps = makeDeps();
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    const client = lastClient.current as FakeMuseClientT;
    act(() => { client.connectionStatus.next(false); });
    expect(out.current!.museConnection).toBe('searching');
    expect(deps.addLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'highlight' }));
  });

  it('reconnexion réussie du premier coup : revient à "connected", ré-câble les flux', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    const client = lastClient.current as FakeMuseClientT;
    act(() => { client.connectionStatus.next(false); });
    expect(out.current!.museConnection).toBe('searching');
    // Premier essai après ATTEMPT_INTERVAL (5s de grâce), gatt.connect()/connect()/start()
    // réussissent tous par défaut (mocks résolus) → reconnecté.
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(client.deviceGattConnect).toHaveBeenCalledTimes(1);
    expect(out.current!.museConnection).toBe('connected');
  });

  it("échec DÉFINITIF après le nombre BORNÉ de tentatives : 'disconnected' + pauseOnLoss(), jamais de boucle infinie", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const out = await mount(deps);
    await act(async () => { await out.current!.handleConnectMuse(); });
    const client = lastClient.current as FakeMuseClientT;
    client.deviceGattConnect.mockRejectedValue(new Error('device gone'));
    act(() => { client.connectionStatus.next(false); });
    // 1er essai à 5s, puis jusqu'à 5 de plus (MAX_ATTEMPTS=6) toutes les 5s + la marge du timeout GATT.
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 5100 + 5000); });
    expect(out.current!.museConnection).toBe('disconnected');
    expect(deps.pauseOnLoss).toHaveBeenCalledTimes(1);
    // Bornée : pas plus de 6 tentatives, quel que soit le temps qu'on avance encore après.
    const attemptsAtGiveUp = client.deviceGattConnect.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(client.deviceGattConnect.mock.calls.length).toBe(attemptsAtGiveUp);
  });
});
