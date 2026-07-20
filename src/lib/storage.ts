export interface UserProfile {
  id: string;
  name: string;
  photo?: string;
  sex?: 'm' | 'f';        // SOLO: the auditor is the PC → drives the Tone-Arm baseline (m→3, f→2)
  preferences: {
    lang: string;
    soloMode: boolean;
  };
  createdAt: number;
  updatedAt?: number;   // CONN-103: last-write-wins sync timestamp
  sessionHistory?: SessionSummary[];
}

export interface SessionSummary {
  id: string;
  profileId: string;
  date: number;
  duration: number;
  pcName: string;
  isSolo: boolean;
  mass: number;
  fnCount: number;
  maxEta: number;
  epValidated: boolean;
  pcPhoto?: string;
  auditorPhoto?: string;
  auditorName?: string;
  // Optional textual notes filled during the session
  objective?: string;
  processObjective?: string;
  physicalCheck?: string;
  briefing?: string;
  nextCs?: string;
  riItems?: {time: number; item: string; reaction: string}[];
  // Coherent "mass contacted vs dissolved" — cumulative seconds (presence vs
  // release). Replaces the legacy 4-zone T-zone distribution in the report.
  massTime?: number;
  dissolutionTime?: number;
}

const PROFILES_KEY = 'nest_profiles';
const SESSIONS_KEY = 'nest_sessions';
const ACTIVE_PROFILE_KEY = 'nest_active_profile';
const SESSIONS_PDFS_KEY = 'nest_session_pdfs';

export const getProfiles = (): UserProfile[] => {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
  } catch {
    return [];
  }
};

export const saveProfile = (profile: UserProfile, stampNow = true) => {
  // CONN-103: stamp updatedAt on every local edit so LWW sync can keep the
  // newest version. Pass stampNow=false when importing a server copy (keep its ts).
  if (stampNow) profile.updatedAt = Date.now();
  const profiles = getProfiles();
  const index = profiles.findIndex(p => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); }
  catch (e) { console.error('[storage] saveProfile quota error:', e); }   // CONN-104
};

export const deleteProfile = (id: string) => {
  const profiles = getProfiles().filter(p => p.id !== id);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  
  // Also delete associated sessions
  const sessions = getSessions().filter(s => s.profileId !== id);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  
  if (getActiveProfileId() === id) {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
  }
};

// ── CONN-99: PRECLEAR registry ───────────────────────────────────────────────
// PCs used to be derived only from session history. To let the user create &
// manage preclears directly (with name + photo) in the Profile Management, we
// keep a small registry of preclear profiles in localStorage.
export interface PcProfile { id: string; name: string; photo?: string; sex?: 'm' | 'f'; createdAt: number; updatedAt?: number; }
const PC_PROFILES_KEY = 'nest_pc_profiles';

export const getPcProfiles = (): PcProfile[] => {
  try { return JSON.parse(localStorage.getItem(PC_PROFILES_KEY) || '[]'); } catch { return []; }
};
export const savePcProfile = (pc: PcProfile, stampNow = true) => {
  if (stampNow) pc.updatedAt = Date.now();   // CONN-103: LWW timestamp
  const list = getPcProfiles().filter(p => p.id !== pc.id);
  list.push(pc);
  try { localStorage.setItem(PC_PROFILES_KEY, JSON.stringify(list)); }
  catch (e) { console.error('[storage] savePcProfile quota error:', e); }   // CONN-104
};
export const deletePcProfile = (id: string) => {
  localStorage.setItem(PC_PROFILES_KEY, JSON.stringify(getPcProfiles().filter(p => p.id !== id)));
};
// CONN-103: bulk overwrite helpers used by the LWW sync to apply a merged set.
export const writeProfiles = (profiles: UserProfile[]) => localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
export const writePcProfiles = (pcs: PcProfile[]) => localStorage.setItem(PC_PROFILES_KEY, JSON.stringify(pcs));

// QUOTA FIX: every session summary used to embed `auditorPhoto` — the active
// profile's photo, ~1 MB of base64 — duplicated in EACH session. A handful of
// sessions blew the ~5 MB localStorage quota → saveSession failed silently →
// the History badge stopped growing (and "X PDF" looked wrong). The photo is
// redundant: History falls back to `activeProfile.photo`, and the PDF gets it
// from a prop. So we strip it (and any oversized pcPhoto) from EVERY local
// write. Server keeps its own copies; History merges those only for display.
const PHOTO_MAX = 60_000; // keep small per-session PC snapshots, drop big ones
function stripSessionPhotos(s: SessionSummary): SessionSummary {
  const out: SessionSummary = { ...s };
  delete out.auditorPhoto; // always redundant with the profile photo
  if (out.pcPhoto && out.pcPhoto.length > PHOTO_MAX) delete out.pcPhoto;
  return out;
}
const lean = (sessions: SessionSummary[]) => sessions.map(stripSessionPhotos);

export const writeSessions  = (sessions: SessionSummary[]) => {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(lean(sessions))); }
  catch (e) { console.warn('[storage] writeSessions: localStorage full', e); }
};

/** One-time boot cleanup: rewrite nest_sessions WITHOUT the heavy photos to
 *  reclaim quota that older builds already filled (self-healing). */
export const cleanupSessionPhotos = (): void => {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return;
    const sessions = JSON.parse(raw) as SessionSummary[];
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    const cleaned = lean(sessions);
    if (JSON.stringify(cleaned).length < raw.length) {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(cleaned));
      console.log('[storage] cleaned session photos — reclaimed', raw.length - JSON.stringify(cleaned).length, 'bytes');
    }
  } catch (_) { /* best-effort */ }
};

export const getActiveProfileId = (): string | null => {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
};

export const setActiveProfileId = (id: string) => {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
};

export const getSessions = (): SessionSummary[] => {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
  } catch {
    return [];
  }
};

export const getSessionsByProfile = (profileId: string): SessionSummary[] => {
  // CONN-111: sessions now live in the global `nest_sessions` store (no longer
  // duplicated inside each profile). We still merge any legacy `sessionHistory`
  // from older profile data so nothing already saved disappears. Dedup by id.
  const profile = getProfiles().find(p => p.id === profileId);
  const legacy = (profile && profile.sessionHistory) ? profile.sessionHistory : [];
  const fromGlobal = getSessions().filter(s => s.profileId === profileId);
  const byId = new Map<string, SessionSummary>();
  [...legacy, ...fromGlobal].forEach(s => { if (s && s.id != null) byId.set(s.id, s); });
  return Array.from(byId.values()).sort((a, b) => b.date - a.date);
};

export const saveSession = (session: SessionSummary) => {
  // Require a valid profileId
  if (!session.profileId) {
    throw new Error('Session must have a valid profileId');
  }
  const sessionToSave = { ...session };

  // CONN-111 FIX: previously the FULL session was ALSO pushed into the profile's
  // `sessionHistory` and written back to `nest_profiles`. Profiles already carry
  // base64 photos, so every saved session grew `nest_profiles` until it blew the
  // ~5 MB localStorage quota → QuotaExceededError → the save threw and the session
  // was LOST (and the app crashed). Sessions live in `nest_sessions` (+ the server),
  // and getSessionsByProfile() reads both, so we no longer duplicate them inside
  // profiles. Writes are wrapped so a full quota never crashes the app.
  const sessions = getSessions();
  sessions.push(sessionToSave);
  try {
    // QUOTA FIX: strip the redundant ~1 MB auditorPhoto (+ oversized pcPhoto)
    // from every session so nest_sessions stays small and the write succeeds.
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(lean(sessions)));
  } catch (e) {
    console.warn('[storage] saveSession: localStorage full — session kept for server sync only', e);
  }
};

export const deleteSession = (sessionId: string) => {
  // Remove from global sessions
  const sessions = getSessions().filter(s => s.id !== sessionId);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));

  // Remove from each profile history
  const profiles = getProfiles();
  let changed = false;
  for (let i = 0; i < profiles.length; i++) {
    if (!profiles[i].sessionHistory) continue;
    const nextHistory = profiles[i].sessionHistory!.filter(s => s.id !== sessionId);
    if (nextHistory.length !== profiles[i].sessionHistory!.length) {
      profiles[i].sessionHistory = nextHistory;
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }
};

export const updateSessionNextCs = (sessionId: string, nextCs: string) => {
  // Update global sessions
  const sessions = getSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex >= 0) {
    sessions[sessionIndex] = { ...sessions[sessionIndex], nextCs };
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }

  // Update profile-embedded histories
  const profiles = getProfiles();
  let hasProfileUpdate = false;
  for (let i = 0; i < profiles.length; i++) {
    if (!profiles[i].sessionHistory) continue;
    const idx = profiles[i].sessionHistory!.findIndex(s => s.id === sessionId);
    if (idx >= 0) {
      profiles[i].sessionHistory![idx] = { ...profiles[i].sessionHistory![idx], nextCs };
      hasProfileUpdate = true;
    }
  }
  if (hasProfileUpdate) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }
};

export const saveSessionPdf = (sessionId: string, dataUri: string) => {
  try {
    const map = JSON.parse(localStorage.getItem(SESSIONS_PDFS_KEY) || '{}');
    map[sessionId] = dataUri;
    localStorage.setItem(SESSIONS_PDFS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to save session PDF', e);
  }
};

export const getSessionPdf = (sessionId: string): string | null => {
  try {
    const map = JSON.parse(localStorage.getItem(SESSIONS_PDFS_KEY) || '{}');
    return map[sessionId] || null;
  } catch (e) {
    return null;
  }
};

export const deleteSessionPdf = (sessionId: string) => {
  try {
    const map = JSON.parse(localStorage.getItem(SESSIONS_PDFS_KEY) || '{}');
    if (map[sessionId]) {
      delete map[sessionId];
      localStorage.setItem(SESSIONS_PDFS_KEY, JSON.stringify(map));
    }
  } catch (e) {
    console.error('Failed to delete session PDF', e);
  }
};

// IndexedDB-backed async PDF helpers (preferred for larger blobs)
const DB_NAME = 'nest_pdfs_db';
const DB_STORE = 'pdfs';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      try {
        req.result.createObjectStore(DB_STORE);
      } catch (e) {}
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveSessionPdfAsync = async (sessionId: string, dataUri: string): Promise<void> => {
  try {
    const db = await openDb();
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const req = store.put(dataUri, sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    // fallback to localStorage map
    try {
      const map = JSON.parse(localStorage.getItem(SESSIONS_PDFS_KEY) || '{}');
      map[sessionId] = dataUri;
      localStorage.setItem(SESSIONS_PDFS_KEY, JSON.stringify(map));
    } catch (err) {
      console.error('Failed to save session PDF (async)', err);
    }
  }
};

export const getSessionPdfAsync = async (sessionId: string): Promise<string | null> => {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(sessionId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    try {
      const map = JSON.parse(localStorage.getItem(SESSIONS_PDFS_KEY) || '{}');
      return map[sessionId] || null;
    } catch (err) {
      return null;
    }
  }
};

export const deleteSessionPdfAsync = async (sessionId: string): Promise<void> => {
  try {
    const db = await openDb();
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const req = store.delete(sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    try {
      const map = JSON.parse(localStorage.getItem(SESSIONS_PDFS_KEY) || '{}');
      if (map[sessionId]) {
        delete map[sessionId];
        localStorage.setItem(SESSIONS_PDFS_KEY, JSON.stringify(map));
      }
    } catch (err) {
      console.error('Failed to delete session PDF (async)', err);
    }
  }
};

// ── PROCESSUS FILES — IndexedDB persistence ──────────────────────────────────
// Stores PDF binary content so files survive app restarts.

const PROCESSUS_DB_NAME = 'nest_processus_db';
const PROCESSUS_STORE   = 'files';
const PROCESSUS_META_STORE = 'meta'; // name + tag per id

function openProcessusDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(PROCESSUS_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROCESSUS_STORE))   db.createObjectStore(PROCESSUS_STORE);
      if (!db.objectStoreNames.contains(PROCESSUS_META_STORE)) db.createObjectStore(PROCESSUS_META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

export const saveProcessusFile = async (
  id: string, name: string, tag: string, data: ArrayBuffer
): Promise<void> => {
  const db = await openProcessusDb();
  await Promise.all([
    new Promise<void>((res, rej) => {
      const tx = db.transaction(PROCESSUS_STORE, 'readwrite');
      const r  = tx.objectStore(PROCESSUS_STORE).put(data, id);
      r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    }),
    new Promise<void>((res, rej) => {
      const tx = db.transaction(PROCESSUS_META_STORE, 'readwrite');
      const r  = tx.objectStore(PROCESSUS_META_STORE).put({ name, tag }, id);
      r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    }),
  ]);
};

export const getAllProcessusFiles = async (): Promise<{id: string; name: string; tag: string; url: string}[]> => {
  try {
    const db = await openProcessusDb();
    // Get all keys from meta store
    const metas = await new Promise<{id: string; name: string; tag: string}[]>((resolve, reject) => {
      const tx = db.transaction(PROCESSUS_META_STORE, 'readonly');
      const store = tx.objectStore(PROCESSUS_META_STORE);
      const results: {id: string; name: string; tag: string}[] = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          results.push({ id: cursor.key as string, ...(cursor.value as {name: string; tag: string}) });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });

    // Build blob URLs for each file
    const out: {id: string; name: string; tag: string; url: string}[] = [];
    for (const meta of metas) {
      const data = await new Promise<ArrayBuffer | null>((resolve) => {
        const tx = db.transaction(PROCESSUS_STORE, 'readonly');
        const r = tx.objectStore(PROCESSUS_STORE).get(meta.id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror   = () => resolve(null);
      });
      if (data) {
        const blob = new Blob([data], { type: 'application/pdf' });
        out.push({ id: meta.id, name: meta.name, tag: meta.tag, url: URL.createObjectURL(blob) });
      }
    }
    return out;
  } catch (e) {
    console.error('[Processus] Failed to load from IndexedDB:', e);
    return [];
  }
};

export const deleteProcessusFile = async (id: string): Promise<void> => {
  try {
    const db = await openProcessusDb();
    await Promise.all([
      new Promise<void>((res) => {
        const tx = db.transaction(PROCESSUS_STORE, 'readwrite');
        tx.objectStore(PROCESSUS_STORE).delete(id);
        tx.oncomplete = () => res();
      }),
      new Promise<void>((res) => {
        const tx = db.transaction(PROCESSUS_META_STORE, 'readwrite');
        tx.objectStore(PROCESSUS_META_STORE).delete(id);
        tx.oncomplete = () => res();
      }),
    ]);
  } catch (e) {
    console.error('[Processus] Failed to delete from IndexedDB:', e);
  }
};

// ── Migrate any existing PDFs stored in localStorage map into IndexedDB, then remove legacy entries.
export const migrateSessionPdfsToIndexedDb = async (): Promise<void> => {
  try {
    const raw = localStorage.getItem(SESSIONS_PDFS_KEY);
    if (!raw) return;
    const map = JSON.parse(raw || '{}');
    const keys = Object.keys(map || {});
    if (keys.length === 0) {
      localStorage.removeItem(SESSIONS_PDFS_KEY);
      return;
    }

    for (const k of keys) {
      try {
        await saveSessionPdfAsync(k, map[k]);
      } catch (e) {
        console.warn('Failed to migrate PDF for', k, e);
      }
    }

    // Remove legacy storage
    localStorage.removeItem(SESSIONS_PDFS_KEY);
  } catch (e) {
    console.warn('PDF migration aborted', e);
  }
};

// ── R3: in-progress session DRAFT (crash recovery) ──────────────────────────
// A running session is snapshotted every ~10 s so a crash / accidental close
// does not lose the irreplaceable human content (transcript, R&I, Total TA,
// briefing notes). NOT the high-rate EEG chart (too big for localStorage) — the
// goal is "never lose your notes", not a perfect resume. Cleared on FIN / save.
const SESSION_DRAFT_KEY = 'nest_session_draft';

export interface SessionDraft {
  v: 1;
  savedAt: number;          // ms — to show age and expire stale drafts
  startTime: number | null; // session start (ms)
  elapsed: number;          // session-relative seconds at snapshot time
  appMode: string;
  auditorName: string;
  pcName: string;
  totalTa: number;
  logs: unknown[];
  /** Legacy : l'ancien module R&I (saisie manuelle) a été remplacé par l'ASSESSMENT. Les
   *  brouillons ANCIENS peuvent encore en contenir — on les tolère, on n'en écrit plus. */
  riItems?: unknown[];
  sessionObjective: string;
  sessionProcessObjective: string;
  sessionPhysicalCheck: string;
  sessionBriefing: string;
}

// The draft now lives in IndexedDB (reusing the PDF store with a reserved key):
// a long transcript snapshotted every 10 s could hit the localStorage quota —
// already exhausted once by photos (CONN-104) — and a failed autosave during a
// live session is exactly what this feature exists to prevent. localStorage
// remains as fallback (IDB unavailable) and as legacy source for old drafts.
const DRAFT_IDB_KEY = '__session_draft__';

export function saveSessionDraft(d: SessionDraft): void {
  const json = JSON.stringify(d);
  openDb()
    .then(db => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const req = tx.objectStore(DB_STORE).put(json, DRAFT_IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }))
    .catch(() => {
      try { localStorage.setItem(SESSION_DRAFT_KEY, json); }
      catch (_e) { /* quota or serialisation — autosave is best-effort */ }
    });
}

export async function loadSessionDraftAsync(): Promise<SessionDraft | null> {
  const parse = (s: string | null): SessionDraft | null => {
    if (!s) return null;
    try {
      const d = JSON.parse(s) as SessionDraft;
      return (d && d.v === 1) ? d : null;
    } catch { return null; }
  };
  try {
    const db = await openDb();
    const fromIdb = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(DRAFT_IDB_KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error);
    });
    if (fromIdb) return parse(fromIdb);
  } catch { /* IDB unavailable — fall through to localStorage */ }
  // Legacy / fallback: drafts written by older builds (or IDB-less contexts).
  try { return parse(localStorage.getItem(SESSION_DRAFT_KEY)); } catch { return null; }
}

export function clearSessionDraft(): void {
  try { localStorage.removeItem(SESSION_DRAFT_KEY); } catch { /* ignore */ }
  openDb()
    .then(db => { db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(DRAFT_IDB_KEY); })
    .catch(() => { /* ignore */ });
}
