import Peer, { DataConnection, MediaConnection } from 'peerjs';

export type Role = 'auditor' | 'participant';
export type P2PStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

// CONN-84 (#3): the remote voice sounded "distant" (worse than WhatsApp) because
// getUserMedia used bare { audio: true } — no VoIP processing. These constraints
// enable echo cancellation, noise suppression and (crucially) auto-gain, which
// boosts a quiet/far speaker to a normal level. mono @ 48 kHz is what WebRTC's
// Opus encoder wants anyway.
export const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl:  true,
  channelCount:     1,
};

// ── ICE servers ───────────────────────────────────────────────────────────────
// FIX CONN-2: previous comment said "TURN not needed" because remote DATA
// goes through the SSE relay — true, but the VIDEO/AUDIO MediaConnection
// (peer.call) still travels via real WebRTC and needs ICE traversal.
// For ~30-50% of remote participants (cellular / symmetric NAT / corporate
// firewall) plain STUN fails: a TURN relay is the only path through.
//
// We bundle OpenRelay's free TURN service (managed by Metered Video). They
// publish multiple endpoints (3478/443, UDP/TCP/TLS) to maximise the chance
// that at least one survives restrictive firewalls. No registration / cost.
// Fall-back ordering: STUN first (cheap), TURN second (more expensive,
// browsers only pin TURN when STUN-bound candidates can't connect).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // FIX CONN-24: multiple free TURN providers as fallback.
  // OpenRelay (metered.ca) used to be reliable but their free tier has been
  // rate-limited / partly disabled. We layer several providers so the browser
  // has options when one is unreachable. They all use the same public,
  // unauthenticated credentials documented in their respective READMEs.
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username:   'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: [
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turns:global.relay.metered.ca:443?transport=tcp',
    ],
    username:   'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    // ExpressTURN — alternate free service.
    urls: [
      'turn:relay1.expressturn.com:3478',
      'turn:relay1.expressturn.com:3480',
    ],
    username:   'ef9SXSHRC59HFKBM3F',
    credential: 'YOpoCAtCqB9aZsuw',
  },
];

// Connection timeout: if PeerJS open/error hasn't fired after this delay, reject.
const INIT_TIMEOUT_MS = 15_000;
// CONN-84 (#1): settle window between destroying a Peer and creating the next
// one, so the old signaling WebSocket finishes closing (role-switch reliability).
const PEER_SETTLE_MS = 350;
// Data-connection open timeout
const CONN_TIMEOUT_MS = 20_000;
// Max buffered packets while disconnected (prevents unbounded memory usage)
const MAX_BUFFER_SIZE = 600;
// Heartbeat: participant pings every 3 s; watchdogs declare dead after N s.
// CONN-53: tightened so a hard quit (Chrome closed, app killed — no graceful
// BYE) is detected in ~6-8 s instead of 10-15 s, while still leaving margin for
// transient 5G latency spikes on the relay path. A clean close is instant via
// the BYE message + WS/DataChannel close events.
const PING_INTERVAL_MS       = 3_000;
const PONG_TIMEOUT_MS        = 6_000;  // LAN WebRTC: fast path
const PONG_TIMEOUT_RELAY_MS  = 18_000; // Relay/tunnel: 2 hops, RTT spikes
// Auditor watchdog: if no PING received for N s → dead
const PING_WATCHDOG_MS       = 8_000;  // LAN
const PING_WATCHDOG_RELAY_MS = 24_000; // Relay
// SSE: number of consecutive onerror events before declaring fatal disconnect.
// EventSource has built-in auto-reconnect — transient errors are normal and should not
// CONN-17: SSE removed in favour of WebSocket relay. SSE_ERROR_THRESHOLD
// (previously 4) is no longer needed because the WS onclose event is
// authoritative — we don't have to count transient errors.

// ── Signaling server config ───────────────────────────────────────────────────
// Default: self-hosted server embedded in server.cjs (LAN mode).
// Falls back to 0.peerjs.com cloud server if no custom host is set.
export interface SignalingConfig {
  host: string;
  port: number;
  path: string;
  secure: boolean;
  /** FIX H1: per-server-startup PeerJS auth key. Included in every connection link.
   *  Prevents external actors from using the signaling server for their own sessions. */
  peerKey?: string;
}

const CLOUD_SIGNALING: SignalingConfig = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomId(): string {
  // 16 cryptographically random bytes → 32-char hex string
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Parse "192.168.1.42:7893" or "abc123.loca.lt" into a SignalingConfig */
export function parseSignalingUrl(input: string): SignalingConfig {
  input = input.trim().replace(/^https?:\/\//, '');
  const [hostPart, portPart] = input.split(':');
  // If host is a raw IPv4 or a .local/.lan hostname, treat it as LAN (plain HTTP, no relay).
  // FIX M1: .local and .lan domains are mDNS/Bonjour names on the LAN — they must NOT
  // be treated as remote tunnel domains. Only true external domain names use the relay path.
  const isIp    = /^\d+\.\d+\.\d+\.\d+$/.test(hostPart);
  const isLocal = /\.(local|lan)$/i.test(hostPart) || hostPart === 'localhost';
  const secure  = !isIp && !isLocal;
  return {
    host: hostPart,
    port: portPart ? parseInt(portPart, 10) : (secure ? 443 : 7893),
    path: '/peerjs',
    secure,
  };
}

/**
 * Parse the combined connection link shared by the auditor.
 * Format (new):  "serverAddress#peerId:relayToken:peerKey"
 * Format (old):  "serverAddress#peerId"  (backward-compatible — no auth)
 * Examples:
 *   "192.168.0.106:7893#abc123xyz"                    → LAN, no auth
 *   "abc.trycloudflare.com#abc123:relaytoken:peerkey" → remote, with auth
 *
 * ⚠️ AGGIUNTO `lang` (5° segmento) — segnalato dal vivo: « quando ci si connette come PC locale
 * col telefono, deve apparire la lingua scelta dall'auditor, non l'inglese di default ». Il
 * pacchetto `LANG` esistente (v. `useRemoteSession`/`App.tsx`) arriva SOLO dopo che la
 * connessione P2P è stabilita — ma la schermata "MODALITÀ PRECLEAR"/"link rilevato dal QR" si
 * vede PRIMA di quel momento (l'auditor vuole un gesto esplicito dell'utente prima di chiedere
 * fotocamera/microfono — v. `autoJoinDoneRef` in App.tsx). L'unico modo di conoscere la lingua
 * PRIMA di connettersi è scriverla nel link stesso, che è già disponibile al caricamento.
 */
export function parseConnectionLink(link: string): {
  config:       SignalingConfig;
  peerId:       string;
  relayToken?:  string; // FIX C1: per-link relay auth token
  satellite?:   boolean; // phone-satellite (co-located): send-only AV, no Muse
  lang?:        string; // lingua della seduta, PRIMA ancora di connettersi
} | null {
  const trimmed = link.trim().replace(/^https?:\/\//, '');
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx === -1) return null;
  const serverPart = trimmed.slice(0, hashIdx);
  const credPart   = trimmed.slice(hashIdx + 1);
  if (!serverPart || !credPart) return null;

  // credPart format: "peerId" | "peerId:relayToken" | "peerId:relayToken:peerKey"
  //                  | "peerId:relayToken:peerKey:sat"        (satellite marker)
  //                  | "peerId:relayToken:peerKey:sat:lang"   (+ lingua della seduta)
  const parts      = credPart.split(':');
  const peerId     = parts[0];
  const relayToken = parts[1] || undefined;
  const peerKey    = parts[2] || undefined;
  const satellite  = parts[3] === 'sat';
  const lang       = parts[4] || undefined;

  if (!peerId) return null;

  const config = parseSignalingUrl(serverPart);
  if (peerKey) config.peerKey = peerKey;

  return { config, peerId, relayToken, satellite, lang };
}

// ── NetworkManager ───────────────────────────────────────────────────────────

// ⚠️ Esportata anche come classe (non solo il singleton `networkManager` sotto) — cambio
// innocuo, nessun comportamento tocco: serve solo a poter istanziare copie PULITE nei test
// (`new NetworkManager()`), invece di dover azzerare a mano lo stato del singleton condiviso
// fra un test e l'altro.
export class NetworkManager {
  private peer: Peer | null = null;
  // CONN-84 (#1): timestamp of the last Peer teardown, to settle before re-init.
  private _peerDestroyedAt = 0;
  private dataConnection: DataConnection | null = null;
  private mediaConnection: MediaConnection | null = null;
  private localStream: MediaStream | null = null;
  // Robust reconnection: the participant remembers WHO it called so it can
  // RE-establish the media (video/audio) call after a signaling reconnect.
  // PeerJS auto-reconnects the signaling + the data channel re-opens, but the
  // media call is NOT re-created automatically → the auditor lost video forever
  // after a network blip / Muse drop. We re-call on peer 'open' (reconnect) and
  // when the media connection closes while still connected.
  private _participantAuditorId: string | null = null;
  private _mediaRecallTimer: ReturnType<typeof setTimeout> | null = null;
  // Phone-satellite (co-located): the host (Mac) must NOT send its own camera/mic
  // to the phone — the auditor is right there in the room. Answering with an
  // EMPTY stream saves bandwidth AND removes one half of the acoustic feedback
  // (Larsen) loop. We still RECEIVE the phone's mic+cam normally.
  private _suppressOutgoingMedia = false;
  private _status: P2PStatus = 'idle';
  private _signalingConfig: SignalingConfig = CLOUD_SIGNALING;

  // ── Outgoing buffer: packets queued while DataChannel is closed ──────────
  // High-priority packets (SESSION_STATE, SIGNAL_QUALITY) are never dropped.
  // EEG/PPG packets beyond MAX_BUFFER_SIZE are discarded (oldest dropped).
  private _outBuffer: unknown[] = [];

  // ── Heartbeat state ───────────────────────────────────────────────────────
  private _role: Role | null             = null;
  private _pingTimerId:     ReturnType<typeof setInterval> | null = null;
  private _pongWatchdogId:  ReturnType<typeof setTimeout>  | null = null;
  private _pingWatchdogId:  ReturnType<typeof setInterval> | null = null;
  private _lastPingReceivedAt = 0;

  // ── Relay state (remote connections — no TURN needed) ─────────────────────
  // FIX CONN-17: switched from SSE+POST to WebSocket. Cloudflare quick tunnel
  // was killing the SSE stream every ~5 s regardless of keepalive (likely an
  // edge buffering / idle policy unique to anonymous tunnels). PeerJS already
  // uses WS through the same tunnel and stays connected indefinitely, so WS
  // is the proven transport.
  private _relayWs:          WebSocket | null   = null;
  private _relayRoomId:      string | null      = null;
  private _relayRole:        'auditor' | 'preclear' | null = null;
  private _relayConnected    = false;
  /** FIX C1: per-link auth token appended to all relay WS connect URLs. */
  private _relayToken:       string | null      = null;
  /** FIX CONN-8: debounce timer for peer_disconnected events. The server uses
   *  a "kick-old" strategy — if the same role re-connects (EventSource auto-
   *  reconnect after a transient blip), the old SSE slot is closed and
   *  peer_disconnected is emitted to the other party. Immediately after, the
   *  new SSE arrives and peer_connected is emitted. Treating the disconnect
   *  as definitive within those few seconds produced a 5-8 s yo-yo log
   *  ("P2P lost" → "P2P established") every reconnect cycle. We now wait up
   *  to 3 s before declaring a peer_disconnected as final. */
  private _pendingDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // ── CONN-33: WebSocket video fallback ─────────────────────────────────────
  // When WebRTC media (peer.call) can't establish — typically symmetric NAT on
  // mobile/5G with no reachable TURN — we relay the camera as compressed JPEG
  // frames over the SAME WebSocket that carries the EEG data (proven to work on
  // any network through the tunnel). Lower quality (~6 fps) but universal: no
  // TURN, no per-user accounts.
  private _videoFallbackActive = false;
  /** Timer that watches ICE: if media never reaches 'connected', go fallback. */
  private _iceWatchdog: ReturnType<typeof setTimeout> | null = null;

  // Callbacks — set by the consumer (App.tsx)
  public onDataReceived:          (data: unknown) => void = () => {};
  public onStreamReceived:        (stream: MediaStream) => void = () => {};
  public onConnectionEstablished: () => void = () => {};
  public onConnectionClosed:      () => void = () => {};
  public onStatusChange:          (status: P2PStatus, detail?: string) => void = () => {};
  public onError:                 (msg: string) => void = () => {};
  /** CONN-33: a JPEG data-URL frame arrived from the peer (fallback mode). */
  public onVideoFrame:            (dataUrl: string) => void = () => {};
  /** CONN-33: WebRTC media failed — the app should start sending JPEG frames. */
  public onVideoFallbackNeeded:   () => void = () => {};

  /** CONN-33: send one compressed camera frame over the relay WS. */
  sendVideoFrame(dataUrl: string): void {
    if (this._relayConnected) this._relaySend({ type: 'VIDEO_FRAME', data: dataUrl });
  }

  /** CONN-39: a base64 PCM16 audio chunk arrived from the peer (fallback mode). */
  public onAudioChunk: (b64: string, sampleRate: number) => void = () => {};

  /** CONN-39: send one base64-encoded PCM16 audio chunk over the relay WS. */
  sendAudioChunk(b64: string, sampleRate: number): void {
    if (this._relayConnected) this._relaySend({ type: 'AUDIO_CHUNK', data: b64, sr: sampleRate });
  }

  isVideoFallbackActive(): boolean { return this._videoFallbackActive; }

  /** CONN-46: round-trip latency in ms, measured from PING→PONG (participant
   *  side). Fired on every PONG so the UI can show a live latency badge. */
  public onLatency: (rttMs: number) => void = () => {};
  public lastRttMs = 0;
  private _reportRtt(ts: unknown): void {
    if (typeof ts !== 'number') return;
    const rtt = Date.now() - ts;
    if (rtt < 0 || rtt > 60_000) return; // ignore clock glitches
    this.lastRttMs = rtt;
    this.onLatency(rtt);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Configure the signaling server before calling init().
   * Call with null to revert to cloud (0.peerjs.com).
   */
  setSignalingServer(config: SignalingConfig | null): void {
    this._signalingConfig = config ?? CLOUD_SIGNALING;
    console.log(`[NetworkManager] Signaling server: ${this._signalingConfig.host}:${this._signalingConfig.port}${this._signalingConfig.path}`);
  }

  getSignalingConfig(): SignalingConfig {
    return { ...this._signalingConfig };
  }

  isUsingLocalServer(): boolean {
    return this._signalingConfig.host !== CLOUD_SIGNALING.host;
  }

  /** FIX C1: set the per-link relay auth token (generated by auditor, parsed from link by participant). */
  setRelayToken(token: string | null): void {
    this._relayToken = token;
  }

  /** Phone-satellite: when true, the host answers incoming peer.calls with an
   *  empty MediaStream (no outgoing camera/mic to the phone). */
  setSuppressOutgoingMedia(on: boolean): void {
    this._suppressOutgoingMedia = on;
  }

  /**
   * @param skipMediaRelease  Pass `true` during auto-reconnect to keep the
   *   existing local MediaStream alive. getUserMedia is NOT re-requested, so
   *   the browser never shows a new permission prompt and the video feed stays
   *   intact. Only pass `false` (default) when starting fresh from scratch.
   */
  async init(role: Role, peerId?: string, skipMediaRelease = false): Promise<string> {
    this._role = role;
    this._stopHeartbeat();
    this._stopRelay();

    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
      this._peerDestroyedAt = Date.now();
    }
    if (!skipMediaRelease && this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    this._setStatus('connecting');

    // NOTE: In relay mode, participant STILL needs a PeerJS Peer for the
    // WebRTC media channel (video/audio). Data goes through HTTP relay;
    // video goes through WebRTC MediaConnection via the PeerJS signaling server.
    // (The early-return that skipped Peer init has been removed.)

    const sig = this._signalingConfig;
    console.log(`[NetworkManager] init(${role}) via ${sig.host}:${sig.port}${sig.path}`);

    // CONN-84 (#1): switching role (PC↔Auditor) without a page refresh used to
    // fail to generate a new code. PeerJS's destroy() (here or in disconnect())
    // closes the signaling WebSocket asynchronously; creating the next Peer
    // immediately races that teardown and the new peer never reaches 'open'.
    // Wait out the remainder of a short settle window so the fresh peer registers.
    const sinceDestroy = Date.now() - this._peerDestroyedAt;
    if (this._peerDestroyedAt && sinceDestroy < PEER_SETTLE_MS) {
      await new Promise<void>(r => setTimeout(r, PEER_SETTLE_MS - sinceDestroy));
    }

    this.peer = new Peer(peerId || randomId(), {
      host:   sig.host,
      port:   sig.port,
      secure: sig.secure,
      path:   sig.path,
      // FIX H1: include auth key so the server middleware can validate it.
      // Defaults to 'peerjs' (the PeerJS default) when no key is set — this keeps
      // backward-compat for cloud server (0.peerjs.com) and local dev without a key.
      key:    sig.peerKey ?? 'peerjs',
      debug:  0,
      // FIX CONN-29: revert CONN-18's `iceTransportPolicy: 'relay'`.
      // Forcing relay-only meant ALL media had to traverse the free OpenRelay
      // TURN servers — which are rate-limited / frequently unreachable. When
      // TURN failed there was NO fallback, so peer.call's 'stream' event fired
      // (the MediaStream has tracks) but no frames ever arrived → permanently
      // black video. 'all' lets ICE try host → srflx (STUN) → relay (TURN) in
      // priority order: same-network peers connect directly, different-network
      // peers still fall back to TURN. Strictly better than relay-only.
      config: {
        iceServers: ICE_SERVERS,
        iceTransportPolicy: 'all',
      },
    });

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        // FIX: destroy the partially-initialised peer so it doesn't linger
        try { this.peer?.destroy(); } catch (_) {}
        this.peer = null;
        reject(new Error('Timeout: PeerJS signaling server unreachable (>15 s)'));
        this._setStatus('error', 'Signaling timeout');
      }, INIT_TIMEOUT_MS);

      this.peer!.on('open', (id) => {
        clearTimeout(timer);
        this._setStatus('idle');
        console.log(`[NetworkManager] Peer ready — id: ${id} role: ${role}`);
        // Auditor: start relay SSE listener so a remote Preclear can connect
        // (LAN Preclear will use WebRTC DataChannel — relay sits idle in that case)
        if (role === 'auditor') {
          this._startRelaySSE(id, 'auditor');
        }
        // Robust reconnection: 'open' re-fires after PeerJS .reconnect() succeeds.
        // On the FIRST open _participantAuditorId is still null (set later by
        // connectToAuditor → initial call), so this is a no-op then; on a RECONNECT
        // it re-establishes the media call so the auditor's video comes back.
        if (this._participantAuditorId) this._recallMedia('signaling reconnected');
        resolve(id);
      });

      this.peer!.on('error', (err) => {
        clearTimeout(timer);
        const msg = (err as Error).message || String(err);
        console.error('[NetworkManager] Peer error:', msg);
        this._setStatus('error', msg);
        this.onError(msg);
        reject(err);
      });

      this.peer!.on('disconnected', () => {
        console.warn('[NetworkManager] Disconnected from signaling server — attempting reconnect…');
        this._setStatus('disconnected', 'Signaling disconnected');
        // PeerJS auto-reconnects with .reconnect()
        try { this.peer?.reconnect(); } catch (_) {}
      });

      if (role === 'auditor') {
        this.peer!.on('connection', (conn) => {
          console.log('[NetworkManager] Incoming data connection from participant');
          // FIX: guard against a second incoming connection while one is already active.
          // Without this, a second participant overwrites this.dataConnection without
          // closing the first — the first's 'close' event would later null out the new one.
          if (this.dataConnection?.open) {
            console.warn('[NetworkManager] Already have an active connection — rejecting new one');
            try { conn.close(); } catch (_) {}
            return;
          }
          this._setupDataConnection(conn);
        });

        this.peer!.on('call', async (call) => {
          console.log('[NetworkManager] media: incoming peer.call from participant');
          // FIX: guard against a second simultaneous media call
          if (this.mediaConnection) {
            try { this.mediaConnection.close(); } catch (_) {}
            this.mediaConnection = null;
          }
          // Satellite: answer RECEIVE-ONLY — the host sends no AV to the phone but
          // MUST still receive the phone's mic+cam (the PC's voice → Whisper → 'PC'
          // transcript). PeerJS's canonical receive-only is call.answer() with NO
          // argument. Answering with an EMPTY MediaStream instead can negotiate the
          // audio m-line as inactive and KILL reception → no PC audio reaches the
          // Mac, so the native STT (Mac mic) becomes the only source and everything
          // is mislabeled 'Auditor' (the bug the user observed).
          if (this._suppressOutgoingMedia) {
            console.log('[NetworkManager] media: satellite — answering RECEIVE-ONLY (no outgoing AV, still receives phone)');
            call.answer();
          } else {
            const stream = await this._getLocalStream();
            const tracks = stream.getTracks();
            console.log(`[NetworkManager] media: auditor answering with ${tracks.length} track(s):`,
              tracks.map(t => `${t.kind}:${t.label || '?'}`).join(', '));
            call.answer(stream);
          }
          this._setupMediaConnection(call);
        });
      }
    });
  }

  async connectToAuditor(auditorId: string): Promise<void> {
    // Remember the target so we can re-establish the media call on reconnect.
    this._participantAuditorId = auditorId;
    // ── Remote mode: use SSE relay through Cloudflare tunnel ─────────────────
    if (this._isRemoteMode()) {
      this._setStatus('connecting', `Relay → ${auditorId}…`);
      return new Promise<void>((resolve, reject) => {
        // FIX C3: track whether this promise has already been settled so the
        // onConnected callback (fired by a late peer_connected SSE event) cannot
        // call resolve() / peer.call() after the timeout has already rejected.
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          // FIX C2: stop the relay on timeout so the SSE EventSource doesn't
          // keep running in the background. Without this, a late peer_connected
          // event could set _relayConnected=true after the promise was rejected,
          // leaving NetworkManager in an inconsistent zombie state.
          this._stopRelay();
          reject(new Error('Timeout: relay connection (>20 s) — verify the tunnel link is active'));
          this._setStatus('error', 'Relay timeout');
        }, CONN_TIMEOUT_MS);

        this._startRelaySSE(auditorId, 'preclear', () => {
          // FIX C3: guard against late delivery after timeout already fired
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
          // Initiate WebRTC media connection for video/audio through PeerJS signaling.
          this._getLocalStream()
            .then(stream => {
              const tracks = stream.getTracks();
              console.log(`[NetworkManager] media: getLocalStream returned ${tracks.length} track(s):`,
                tracks.map(t => `${t.kind}:${t.label || '?'}`).join(', '));
              // FIX M2: skip peer.call() if the stream has no tracks (getUserMedia
              // failed silently and returned an empty MediaStream).
              if (!this.peer) {
                console.warn('[NetworkManager] media: no PeerJS peer — cannot call'); return;
              }
              if (tracks.length === 0) {
                console.warn('[NetworkManager] media: empty stream — skipping peer.call'); return;
              }
              console.log(`[NetworkManager] media: peer.call(${auditorId}) initiating…`);
              const mediaConn = this.peer.call(auditorId, stream);
              if (mediaConn) {
                console.log('[NetworkManager] media: MediaConnection created, attaching handlers');
                this._setupMediaConnection(mediaConn);
              } else {
                console.warn('[NetworkManager] media: peer.call returned null/undefined');
              }
            })
            .catch(err => {
              console.warn('[NetworkManager] media: getLocalStream failed:', err);
            });
        });
      });
    }

    // ── LAN mode: existing WebRTC DataChannel path ────────────────────────────
    if (!this.peer) throw new Error('Peer not initialised — call init() first');

    this._setStatus('connecting', `Connexion vers ${auditorId}…`);

    // FIX: use let + a 'rejected' flag so the timeout callback can guard
    // against a late-arriving 'open' event after rejection.
    let rejected = false;
    let dataConn: DataConnection;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        rejected = true;
        // FIX: close the still-connecting DataConnection on timeout so it
        // can't fire 'open' later and set unexpected state.
        try { dataConn?.close(); } catch (_) {}
        reject(new Error(`Timeout: could not reach auditor (${auditorId}) — check the link and network connection`));
        this._setStatus('error', 'Connection timeout');
      }, CONN_TIMEOUT_MS);

      // Data channel
      dataConn = this.peer!.connect(auditorId, {
        reliable: true,
        serialization: 'json',
      });

      dataConn.on('open', () => {
        // FIX: if the promise was already rejected (timeout fired), discard
        // this late 'open' event and close the connection.
        if (rejected) {
          try { dataConn.close(); } catch (_) {}
          return;
        }
        clearTimeout(timer);
        this._setupDataConnection(dataConn);
        resolve();
      });

      dataConn.on('error', (err) => {
        if (rejected) return; // already handled
        clearTimeout(timer);
        const msg = (err as Error).message || String(err);
        this._setStatus('error', msg);
        this.onError(msg);
        reject(err);
      });

      // Media channel (video + audio) — non-blocking, best-effort.
      // Runs concurrently; does NOT block the data-channel promise.
      this._getLocalStream()
        .then(stream => {
          // FIX M2: do not call peer.call() with an empty stream (getUserMedia
          // failed silently). An empty stream makes the auditor's cam widget appear
          // connected but shows only black video with no indication of the real cause.
          if (rejected || !this.peer || stream.getTracks().length === 0) return;
          const mediaConn = this.peer.call(auditorId, stream);
          if (mediaConn) this._setupMediaConnection(mediaConn);
        })
        .catch(err => {
          console.warn('[NetworkManager] Caméra/micro indisponible — données seules:', err);
        });
    });
  }

  /**
   * Send data to the remote peer.
   * If the DataChannel is currently closed (temporary disconnection), the
   * packet is queued in `_outBuffer` and will be flushed automatically once
   * the channel re-opens.
   *
   * `highPriority` packets (SESSION_STATE, SIGNAL_QUALITY, MUSE_STATUS,
   * BATTERY) bypass the size cap so they are never silently dropped.
   * Regular EEG/PPG packets are dropped (oldest first) when the buffer
   * exceeds MAX_BUFFER_SIZE to avoid unbounded memory growth.
   */
  send(data: unknown, highPriority = false): boolean {
    // ⚠️ CORRETTO — trovato leggendo il codice dopo una riga diagnostica mandata all'inizio di
    // una connessione che non arrivava MAI, qualunque fosse il suo `type` (scartando quindi
    // l'ipotesi della deduplica per tipo, corretta ma non la causa vera qui): `_relaySend`
    // scarta il pacchetto IN SILENZIO se `this._relayWs` non è ancora `OPEN` (il suo stesso
    // `if (!ws || ws.readyState !== WebSocket.OPEN) return;`) — ma questo `send()` restituiva
    // `true` LO STESSO, senza controllare l'esito vero, e quindi senza mai passare al
    // fallback del buffer qui sotto. `_relayConnected` (impostato quando l'handshake di più
    // alto livello si conclude) e "il websocket `_relayWs` è aperto per scrivere" possono
    // essere due istanti leggermente diversi — un messaggio mandato esattamente in quella
    // finestra spariva per sempre, mai bufferizzato, mai riprovato. Ora `_relaySend` riferisce
    // il proprio esito vero, e solo un invio VERAMENTE riuscito salta il fallback.
    if (this._relayConnected && this._relaySend(data)) {
      return true;
    }
    // WebRTC DataChannel (LAN mode)
    if (this.dataConnection?.open) {
      this.dataConnection.send(data);
      return true;
    }
    // Buffer the packet for retry on reconnect.
    if (highPriority) {
      // C3: high-priority packets are deduplicated by type.
      // Keeping 300 stale BATTERY values is pointless — only the latest matters.
      const type = (data as any)?.type as string | undefined;
      if (type) {
        const idx = this._outBuffer.findIndex((p) => (p as any)?.type === type);
        if (idx !== -1) this._outBuffer.splice(idx, 1); // replace old entry
      }
    } else if (this._outBuffer.length >= MAX_BUFFER_SIZE) {
      // EEG/PPG: evict oldest entry (ring-buffer style)
      this._outBuffer.shift();
    }
    this._outBuffer.push(data);
    return false;
  }

  /** Returns the number of packets currently waiting in the outgoing buffer. */
  getBufferSize(): number {
    return this._outBuffer.length;
  }

  /** Discard the outgoing buffer (e.g. after a clean disconnect). */
  clearBuffer(): void {
    this._outBuffer = [];
  }

  isConnected(): boolean {
    return this._relayConnected || (this.dataConnection?.open ?? false);
  }

  getPeerId(): string | null {
    return this.peer?.id ?? null;
  }

  getStatus(): P2PStatus {
    return this._status;
  }

  disconnect(): void {
    this.notifyLeaving();
    this._teardown();
    this._setStatus('idle');
  }

  /**
   * CONN-53: best-effort graceful "BYE" so the peer detects the disconnect
   * instantly instead of waiting for the heartbeat watchdog. Safe to call from
   * a `pagehide`/`beforeunload` handler — sends are synchronous and best-effort.
   */
  notifyLeaving(): void {
    try {
      if (this._relayConnected) {
        this._relaySend({ type: 'BYE' });
      } else if (this.dataConnection && (this.dataConnection as any).open) {
        this.dataConnection.send({ type: 'BYE' });
      }
    } catch (_) { /* socket already closing — peer falls back to watchdog */ }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _getLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: VOICE_AUDIO_CONSTRAINTS });
    } catch {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: VOICE_AUDIO_CONSTRAINTS });
      } catch {
        this.localStream = new MediaStream();
      }
    }
    return this.localStream;
  }

  private _setupDataConnection(conn: DataConnection) {
    this.dataConnection = conn;

    // FIX: guard so onConnectionClosed fires AT MOST ONCE per connection.
    // PeerJS can fire both 'error' and then 'close' — without this flag the
    // app would see two disconnect events for the same connection.
    let closedFired = false;
    const fireClose = () => {
      if (closedFired) return;
      closedFired = true;
      this._stopHeartbeat(); // Bug 7: stop heartbeat when channel closes
      if (this.dataConnection === conn) this.dataConnection = null;
      this._setStatus('disconnected', 'Data channel closed');
      this.onConnectionClosed();
    };

    conn.on('data', (data) => {
      // Intercept heartbeat frames — never pass them to the application layer
      const msgType = (data as any)?.type;
      if (msgType === 'PING') {
        this._lastPingReceivedAt = Date.now();
        try { conn.send({ type: 'PONG', ts: (data as any).ts }); } catch (_) {}
        return;
      }
      if (msgType === 'PONG') {
        // Participant: a PONG arrived → reset the dead-connection watchdog
        this._resetPongWatchdog();
        this._reportRtt((data as any).ts); // CONN-46: measure RTT
        return;
      }
      if (msgType === 'BYE') {
        // CONN-53: peer left gracefully → close immediately, no watchdog wait.
        this._stopHeartbeat();
        this.onConnectionClosed();
        return;
      }
      this.onDataReceived(data);
    });

    conn.on('open', () => {
      this._setStatus('connected');
      this._startHeartbeat(conn); // Bug 7: start PING/PONG heartbeat
      if (this._outBuffer.length > 0) {
        // C2: purge stale EEG/PPG data — only keep control packets (highPriority
        // types). Replaying seconds-old EEG bursts causes a spike artifact on the
        // needle. Control packets (SESSION_STATE, SIGNAL_QUALITY, BATTERY,
        // MUSE_STATUS) are small, timestamped by context, and must be delivered.
        // ⚠️ AGGIUNTI 'TRANSCRIPT'/'DIAG' — segnalato dal vivo: una riga diagnostica mandata
        // nel primissimo istante della connessione finiva bufferizzata (canale non ancora
        // aperto in quel preciso momento) ma questo elenco la scartava per sempre al primo
        // (e unico) svuotamento del buffer, invece di spedirla insieme agli altri pacchetti
        // di controllo. Non cambia nulla per il flusso normale (la trascrizione in corso non
        // passa mai da qui: il canale è già aperto da tempo quando arriva).
        const CONTROL_TYPES = new Set(['SESSION_STATE', 'SIGNAL_QUALITY', 'BATTERY', 'MUSE_STATUS', 'TRANSCRIPT', 'DIAG']);
        const toFlush = this._outBuffer.filter((p) => {
          const t = (p as any)?.type as string | undefined;
          return t !== undefined && CONTROL_TYPES.has(t);
        });
        this._outBuffer = [];
        if (toFlush.length > 0) {
          console.log(`[NetworkManager] Flushing ${toFlush.length} control packet(s) (EEG/PPG purged to avoid spike)…`);
          for (const pkt of toFlush) {
            try { conn.send(pkt); } catch (_) { break; }
          }
        }
      }
      this.onConnectionEstablished();
    });

    conn.on('close', () => fireClose());

    conn.on('error', (err) => {
      const msg = (err as Error).message || String(err);
      console.error('[NetworkManager] DataConnection error:', msg);
      this.onError(msg);
      fireClose();   // treat an error as an implicit close so the app reacts
    });

    // If connection was already open when we hooked up (auditor side), fire immediately
    if ((conn as any).open) {
      this._setStatus('connected');
      this._startHeartbeat(conn);
      this.onConnectionEstablished();
    }
  }

  private _setupMediaConnection(conn: MediaConnection) {
    this.mediaConnection = conn;

    conn.on('stream', (remoteStream) => {
      const tracks = remoteStream.getTracks();
      console.log(`[NetworkManager] media: REMOTE stream received with ${tracks.length} track(s):`,
        tracks.map(t => `${t.kind}:${t.label || '?'} (muted=${t.muted}, enabled=${t.enabled})`).join(', '));
      this.onStreamReceived(remoteStream);
    });

    // FIX CONN-29/33: watch the underlying ICE connection state. PeerJS
    // exposes the RTCPeerConnection on `conn.peerConnection`. If ICE reaches
    // 'connected'/'completed' the WebRTC video works (best quality). If it
    // 'failed' — or never connects within the watchdog window (symmetric NAT /
    // unreachable TURN, typical on 5G) — we switch to the WebSocket JPEG
    // fallback so video still works on any network.
    const pc = (conn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
    const triggerFallback = (reason: string) => {
      if (this._videoFallbackActive) return;
      this._videoFallbackActive = true;
      if (this._iceWatchdog) { clearTimeout(this._iceWatchdog); this._iceWatchdog = null; }
      console.warn(`[NetworkManager] media: WebRTC video unavailable (${reason}) — switching to WebSocket frame fallback`);
      this.onVideoFallbackNeeded();
    };
    if (pc) {
      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        console.log(`[NetworkManager] media: ICE state → ${st}`);
        if (st === 'connected' || st === 'completed') {
          // WebRTC works — cancel the fallback watchdog.
          if (this._iceWatchdog) { clearTimeout(this._iceWatchdog); this._iceWatchdog = null; }
        } else if (st === 'failed') {
          triggerFallback('ICE failed');
        }
      };
      pc.onconnectionstatechange = () => {
        console.log(`[NetworkManager] media: PC state → ${pc.connectionState}`);
      };
    }
    // Watchdog: if media hasn't connected within 8 s, go fallback. Covers the
    // case where ICE stalls at 'checking' forever instead of reaching 'failed'.
    if (this._iceWatchdog) clearTimeout(this._iceWatchdog);
    this._iceWatchdog = setTimeout(() => {
      const st = pc?.iceConnectionState;
      if (st !== 'connected' && st !== 'completed') {
        triggerFallback(`ICE stuck at '${st ?? 'unknown'}' after 8s`);
      }
    }, 8000);

    conn.on('close',  () => {
      console.log('[NetworkManager] media: MediaConnection closed');
      if (this.mediaConnection === conn) this.mediaConnection = null;
      // If the media drops but signaling is still alive, try to re-establish it
      // (participant side only). Covers a media-only failure where PeerJS never
      // emits 'disconnected'.
      this._recallMedia('media closed');
    });
    conn.on('error',  (err) => console.warn('[NetworkManager] media: MediaConnection error:', err));
  }

  /**
   * Robust reconnection (participant): RE-establish the WebRTC media (video/audio)
   * call to the auditor after a signaling reconnect or a media drop. PeerJS
   * auto-reconnects the signaling and the data channel re-opens on its own, but
   * the media call is one-shot — without this the auditor lost the PC's video for
   * good after a network blip (typically coinciding with a Muse drop). Debounced
   * + idempotent so multiple triggers collapse into a single re-call.
   */
  private _recallMedia(reason: string): void {
    const peer = this.peer as unknown as { destroyed?: boolean; disconnected?: boolean } | null;
    if (!peer || peer.destroyed || peer.disconnected) return;
    if (!this._participantAuditorId) return;        // only the participant calls out
    if (this._suppressOutgoingMedia) return;        // satellite host sends no AV
    if (this.mediaConnection && (this.mediaConnection as unknown as { open?: boolean }).open) return; // alive
    if (this._mediaRecallTimer) return;             // a re-call is already pending
    this._mediaRecallTimer = setTimeout(async () => {
      this._mediaRecallTimer = null;
      try {
        const p = this.peer as unknown as { destroyed?: boolean; disconnected?: boolean } | null;
        if (!this.peer || !p || p.destroyed || p.disconnected) return;
        if (!this._participantAuditorId) return;
        if (this.mediaConnection && (this.mediaConnection as unknown as { open?: boolean }).open) return;
        const stream = await this._getLocalStream();
        if (stream.getTracks().length === 0) return;
        if (this.mediaConnection) { try { this.mediaConnection.close(); } catch (_) {} this.mediaConnection = null; }
        console.log(`[NetworkManager] media: RE-calling auditor ${this._participantAuditorId} (${reason})`);
        const conn = this.peer.call(this._participantAuditorId, stream);
        if (conn) this._setupMediaConnection(conn);
      } catch (err) {
        console.warn('[NetworkManager] media: re-call failed:', err);
      }
    }, 1200);
  }

  private _teardown() {
    this._stopHeartbeat();
    this._stopRelay();
    // CONN-33: reset video fallback state for the next connection.
    this._videoFallbackActive = false;
    // Robust reconnection: forget the call target + cancel any pending re-call so
    // we never re-establish media after an intentional disconnect.
    this._participantAuditorId = null;
    if (this._mediaRecallTimer) { clearTimeout(this._mediaRecallTimer); this._mediaRecallTimer = null; }
    if (this._iceWatchdog) { clearTimeout(this._iceWatchdog); this._iceWatchdog = null; }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    // FIX: wrap all close/destroy calls in try/catch — PeerJS can throw
    // on already-closed/destroyed objects in some edge cases.
    if (this.dataConnection)  { try { this.dataConnection.close();  } catch (_) {} this.dataConnection  = null; }
    if (this.mediaConnection) { try { this.mediaConnection.close(); } catch (_) {} this.mediaConnection = null; }
    if (this.peer)            { try { this.peer.destroy();           } catch (_) {} this.peer            = null; this._peerDestroyedAt = Date.now(); }
    // On intentional teardown, discard any pending buffer to avoid replaying
    // stale data into a future session.
    this._outBuffer = [];
  }

  // ── Heartbeat helpers ───────────────────────────────────────────────────────

  /**
   * Start the appropriate heartbeat for the current role.
   *
   * PARTICIPANT: sends a PING every PING_INTERVAL_MS and arms a PONG watchdog.
   *   If no PONG arrives within PONG_TIMEOUT_MS the channel is declared dead
   *   and closed, triggering the normal onConnectionClosed flow.
   *
   * AUDITOR: watches incoming PINGs. If none arrive for PING_WATCHDOG_MS (15 s)
   *   the channel is declared dead.
   */
  private _startHeartbeat(conn: DataConnection) {
    this._stopHeartbeat();
    if (this._role === 'participant') {
      // Send PING periodically; arm watchdog only after first PING is sent
      this._pingTimerId = setInterval(() => {
        if (conn.open) {
          try { conn.send({ type: 'PING', ts: Date.now() }); } catch (_) {}
          this._resetPongWatchdog();
        }
      }, PING_INTERVAL_MS);
    } else if (this._role === 'auditor') {
      this._lastPingReceivedAt = Date.now(); // seed so first check doesn't fire immediately
      this._pingWatchdogId = setInterval(() => {
        if (Date.now() - this._lastPingReceivedAt > PING_WATCHDOG_MS) {
          console.warn('[NetworkManager] PING watchdog: no PING for 15 s — declaring connection dead');
          this._stopHeartbeat();
          try { conn.close(); } catch (_) {}
        }
      }, PING_INTERVAL_MS);
    }
  }

  /** Reset (or arm) the pong-timeout watchdog on the participant side. */
  private _resetPongWatchdog() {
    if (this._pongWatchdogId) clearTimeout(this._pongWatchdogId);
    // Relay path has 2 HTTP hops (POST + SSE), so RTT can be 2-5 s.
    // Use a much longer timeout than the direct WebRTC path.
    const timeout = this._relayConnected ? PONG_TIMEOUT_RELAY_MS : PONG_TIMEOUT_MS;
    this._pongWatchdogId = setTimeout(() => {
      this._pongWatchdogId = null;
      if (this._relayConnected) {
        // Relay mode: dataConnection is null — close via relay teardown
        console.warn(`[NetworkManager] PONG timeout: no PONG for ${PONG_TIMEOUT_RELAY_MS / 1000} s (relay) — declaring connection dead`);
        this._relayConnected = false;
        this._stopHeartbeat();
        this._stopRelay();
        this._setStatus('disconnected', 'Relay PONG timeout');
        this.onConnectionClosed();
      } else {
        // WebRTC mode: close the DataChannel, which triggers the normal fireClose() flow
        console.warn(`[NetworkManager] PONG timeout: no PONG for ${PONG_TIMEOUT_MS / 1000} s — declaring connection dead`);
        if (this.dataConnection) { try { this.dataConnection.close(); } catch (_) {} }
      }
    }, timeout);
  }

  /** Stop all heartbeat timers. Safe to call multiple times. */
  private _stopHeartbeat() {
    if (this._pingTimerId)    { clearInterval(this._pingTimerId);    this._pingTimerId    = null; }
    if (this._pongWatchdogId) { clearTimeout(this._pongWatchdogId);  this._pongWatchdogId = null; }
    if (this._pingWatchdogId) { clearInterval(this._pingWatchdogId); this._pingWatchdogId = null; }
  }

  // ── Relay helpers ───────────────────────────────────────────────────────────

  /** True when the signaling config points to a tunnel (HTTPS domain). */
  private _isRemoteMode(): boolean {
    return this._signalingConfig.secure;
  }

  /** HTTP origin for relay API calls, derived from current signaling config. */
  private _relayOrigin(): string {
    const s = this._signalingConfig;
    return s.secure
      ? `https://${s.host}`
      : `http://${s.host}:${s.port}`;
  }

  /** Send a message over the relay WebSocket (CONN-17). */
  // ⚠️ CORRETTO — restituiva `void`: chi chiamava (`send()`, sopra) non poteva sapere se
  // l'invio fosse davvero riuscito o scartato in silenzio (websocket non ancora aperto),
  // quindi trattava OGNI chiamata come un successo — anche quella scartata. Ora un booleano
  // vero, letto da `send()` per decidere se ripiegare sul buffer invece di dare per perso
  // silenziosamente un pacchetto.
  private _relaySend(data: unknown): boolean {
    const ws = this._relayWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(data)); return true; } catch (_) { return false; /* socket dying */ }
  }

  /** Stop and clean up the relay WebSocket (CONN-17). */
  private _stopRelay(): void {
    if (this._relayWs) {
      try { this._relayWs.close(); } catch (_) {}
      this._relayWs = null;
    }
    // FIX CONN-8: clear any pending peer_disconnected debounce timer.
    if (this._pendingDisconnectTimer) {
      clearTimeout(this._pendingDisconnectTimer);
      this._pendingDisconnectTimer = null;
    }
    this._relayConnected = false;
    this._relayRoomId    = null;
    this._relayRole      = null;
  }

  /** Called when the relay handshake completes (both parties connected). */
  private _onRelayConnected(): void {
    if (this._relayConnected) return; // guard against duplicate peer_connected events
    this._relayConnected = true;
    this._setStatus('connected');

    // Flush buffered control packets (same logic as DataChannel path)
    if (this._outBuffer.length > 0) {
      // v. la nota gemella nel flush del DataChannel LAN, sopra: stessa aggiunta, stessa ragione.
      const CONTROL_TYPES = new Set(['SESSION_STATE', 'SIGNAL_QUALITY', 'BATTERY', 'MUSE_STATUS', 'TRANSCRIPT', 'DIAG']);
      const toFlush = this._outBuffer.filter(p => {
        const t = (p as any)?.type as string | undefined;
        return t !== undefined && CONTROL_TYPES.has(t);
      });
      this._outBuffer = [];
      for (const pkt of toFlush) this._relaySend(pkt);
    }

    // Reuse existing heartbeat timers — just swap the send path
    this._stopHeartbeat();
    if (this._role === 'participant') {
      this._resetPongWatchdog();
      this._pingTimerId = setInterval(() => {
        if (this._relayConnected) this._relaySend({ type: 'PING', ts: Date.now() });
      }, PING_INTERVAL_MS);
    } else if (this._role === 'auditor') {
      this._lastPingReceivedAt = Date.now();
      // Relay path: give PING_WATCHDOG_RELAY_MS (45 s) so SSE auto-reconnect can
      // recover from transient tunnel drops without prematurely declaring dead.
      this._pingWatchdogId = setInterval(() => {
        if (Date.now() - this._lastPingReceivedAt > PING_WATCHDOG_RELAY_MS) {
          console.warn(`[NetworkManager] Relay PING watchdog: no PING for ${PING_WATCHDOG_RELAY_MS / 1000} s — declaring dead`);
          this._stopHeartbeat();
          this._relayConnected = false;
          this._setStatus('disconnected', 'Relay ping timeout');
          this.onConnectionClosed();
        }
      }, PING_INTERVAL_MS);
    }

    this.onConnectionEstablished();
  }

  /**
   * Open an SSE subscription on the relay server.
   * roomId   = auditor's peer ID (used as room identifier on the server).
   * role     = 'auditor' | 'preclear'
   * onConnected = called once when `peer_connected` fires (Preclear side timeout clearance).
   */
  /**
   * Open a WebSocket connection to the relay server (CONN-17).
   *
   * WebSocket is now the primary transport for both control packets
   * (peer_connected / peer_disconnected / PING / PONG) and application data
   * (RAW_EEG, RAW_PPG, SESSION_STATE, etc.). The previous SSE+POST approach
   * was being killed every ~5 s by Cloudflare quick tunnels — WS through the
   * same tunnel stays alive indefinitely (PeerJS uses WS and is unaffected).
   *
   * Renamed from `_startRelaySSE` — the call sites stay the same since the
   * shape of the API (onConnected callback, single roomId+role) is unchanged.
   */
  private _startRelaySSE(roomId: string, role: 'auditor' | 'preclear', onConnected?: () => void): void {
    this._stopRelay();
    this._relayRoomId = roomId;
    this._relayRole   = role;

    // Build the WS URL: wss://host/api/relay-ws/{roomId}?role=...&t=...
    const sig = this._signalingConfig;
    const proto = sig.secure ? 'wss' : 'ws';
    const tokenSuffix = this._relayToken ? `&t=${encodeURIComponent(this._relayToken)}` : '';
    const port = sig.secure ? '' : `:${sig.port}`;
    const url  = `${proto}://${sig.host}${port}/api/relay-ws/${encodeURIComponent(roomId)}?role=${role}${tokenSuffix}`;

    console.log(`[NetworkManager] opening relay WS → ${url}`);
    const ws = new WebSocket(url);
    this._relayWs = ws;

    ws.onopen = () => {
      console.log('[NetworkManager] relay WS opened');
      // The server will send peer_connected once the other party is present.
      // The peer_connected handler below triggers _onRelayConnected().
    };

    ws.onmessage = (e: MessageEvent) => {
      let data: any;
      try { data = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }

      if (data.type === 'peer_connected') {
        // FIX CONN-8: if a peer_disconnected was pending, the new WS just
        // arrived in time — cancel the pending teardown.
        if (this._pendingDisconnectTimer) {
          clearTimeout(this._pendingDisconnectTimer);
          this._pendingDisconnectTimer = null;
          console.log('[NetworkManager] peer_connected within debounce window — cancelling pending disconnect');
        }
        this._onRelayConnected();
        onConnected?.();
        return;
      }
      if (data.type === 'peer_disconnected') {
        if (!this._relayConnected) return;
        if (this._pendingDisconnectTimer) clearTimeout(this._pendingDisconnectTimer);
        this._pendingDisconnectTimer = setTimeout(() => {
          this._pendingDisconnectTimer = null;
          if (!this._relayConnected) return;
          console.warn('[NetworkManager] peer_disconnected debounce window elapsed — declaring connection lost');
          this._relayConnected = false;
          this._stopHeartbeat();
          if (this._role === 'participant') this._stopRelay();
          this._setStatus('disconnected', 'Relay peer disconnected');
          this.onConnectionClosed();
        }, 3000);
        return;
      }
      // Heartbeat frames
      if (data.type === 'PING') {
        this._lastPingReceivedAt = Date.now();
        this._relaySend({ type: 'PONG', ts: data.ts });
        return;
      }
      if (data.type === 'PONG') {
        this._resetPongWatchdog();
        this._reportRtt(data.ts); // CONN-46: measure relay RTT
        return;
      }
      if (data.type === 'BYE') {
        // CONN-53: peer left gracefully → close immediately, no watchdog wait.
        if (!this._relayConnected) return;
        this._relayConnected = false;
        this._stopHeartbeat();
        if (this._role === 'participant') this._stopRelay();
        this._setStatus('disconnected', 'Peer left');
        this.onConnectionClosed();
        return;
      }
      // CONN-33: video fallback frame — route to its own callback, never to
      // the EEG/worker data path. The frame is a JPEG data-URL string.
      if (data.type === 'VIDEO_FRAME') {
        if (typeof data.data === 'string') this.onVideoFrame(data.data);
        return;
      }
      // CONN-39: audio fallback chunk — route to its own callback (Web Audio
      // playback), never to the EEG/worker data path.
      if (data.type === 'AUDIO_CHUNK') {
        if (typeof data.data === 'string') {
          this.onAudioChunk(data.data, typeof data.sr === 'number' ? data.sr : 16000);
        }
        return;
      }
      // Application data → pass to consumer (App.tsx)
      this.onDataReceived(data);
    };

    ws.onerror = (ev) => {
      console.error('[NetworkManager] relay WS error', ev);
    };

    ws.onclose = (ev) => {
      console.log(`[NetworkManager] relay WS closed (code=${ev.code} reason="${ev.reason}")`);
      if (this._relayWs !== ws) return; // stale (we already opened a newer one)
      if (!this._relayConnected) return; // close while still trying to set up
      this._relayConnected = false;
      this._stopHeartbeat();
      this._setStatus('disconnected', 'Relay WS closed');
      this.onConnectionClosed();
    };
  }

  private _setStatus(status: P2PStatus, detail?: string) {
    this._status = status;
    this.onStatusChange(status, detail);
    if (detail) console.log(`[NetworkManager] Status: ${status} — ${detail}`);
  }
}

export const networkManager = new NetworkManager();
