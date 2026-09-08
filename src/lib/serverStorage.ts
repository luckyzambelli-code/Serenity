/**
 * serverStorage.ts
 *
 * Thin client over the local REST API at http://127.0.0.1:7893/api/
 * Works in BOTH Electron and Chrome mode because both connect to the same server.
 * Data is stored on disk → survives restarts, shared across modes.
 *
 * Falls back to localStorage / IndexedDB when the server is unreachable.
 */

// FIX SEC-1: il token che prova « sono l'app locale » — v. la nota grande su
// `LOCAL_AUTH_TOKEN` in `server-core.cjs`. Ogni fetch qui sotto lo porta, `/health` incluso
// (è in `LOCAL_ONLY_PREFIXES`: senza il token riceverebbe 403 anche da un'app locale vera).
import { localAuthHeaders } from './localAuth';

// CONN-85: the API base MUST follow the origin the app was served from, not a
// hardcoded localhost. Electron loads from http://127.0.0.1:7893 (same origin →
// works), but a REMOTE Chrome (preclear's phone, a friend's browser) is served
// through the Cloudflare tunnel: there, `127.0.0.1` is THAT device's own machine
// (no server), and an http://127.0.0.1 call from an https tunnel page is blocked
// as mixed content. So the remote client never reached the server and its history
// silently diverged into localStorage. Using the page origin sends /api through
// the SAME tunnel, which proxies to the auditor's real server → shared history.
const API = (() => {
  try {
    const loc = typeof window !== 'undefined' ? window.location : null;
    const origin = loc?.origin || '';
    // Served via the Cloudflare tunnel (https) → a same-origin /api call is
    // proxied to the auditor's real server. This is the remote Chrome case.
    if (origin.startsWith('https')) return `${origin}/api`;
    // Served directly by our own Node server (Electron, or a same-Mac browser):
    // the page port is 7893 → same-origin /api hits that server.
    if (loc?.port === '7893') return `${origin}/api`;
  } catch { /* fall through */ }
  // Vite dev (:5173) or anything unexpected → the local Electron server.
  return 'http://127.0.0.1:7893/api';
})();

let _serverAvailable: boolean | null = null; // null = not checked yet
let _serverCheckedAt = 0;
const RETRY_AFTER_MS = 10_000; // retry a failed check after 10 s (avoids permanent false)

/** Check if the local server's API is reachable. Caches `true` for the session;
 *  caches `false` for only RETRY_AFTER_MS ms before re-probing (startup race fix). */
export async function isServerAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_serverAvailable === true) return true;
  if (_serverAvailable === false && (now - _serverCheckedAt) < RETRY_AFTER_MS) return false;
  // null OR (false + TTL expired) → probe
  try {
    const res = await fetch(`${API}/health`, {
      headers: await localAuthHeaders(),
      signal: AbortSignal.timeout(1500),
    });
    _serverAvailable = res.ok;
  } catch {
    _serverAvailable = false;
  }
  _serverCheckedAt = Date.now();
  return _serverAvailable;
}

// ── Generic helpers ──────────────────────────────────────────────────────────

async function apiGet<T>(route: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${route}`, { headers: await localAuthHeaders() });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function apiPost(route: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await localAuthHeaders() },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function apiDelete(route: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}${route}`, { method: 'DELETE', headers: await localAuthHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Profiles ─────────────────────────────────────────────────────────────────

export async function serverGetProfiles(): Promise<unknown[] | null> {
  return apiGet('/profiles');
}

export async function serverSaveProfiles(profiles: unknown[]): Promise<boolean> {
  return apiPost('/profiles', profiles);
}

// CONN-102: preclear (PC) registry — shared between Electron & Chrome.
export async function serverGetPcProfiles(): Promise<unknown[] | null> {
  return apiGet('/pc-profiles');
}
export async function serverSavePcProfiles(pcs: unknown[]): Promise<boolean> {
  return apiPost('/pc-profiles', pcs);
}
export async function serverGetTombstones(): Promise<Record<string, number> | null> {
  return apiGet('/tombstones');
}
export async function serverDeleteProfile(id: string): Promise<boolean> {
  return apiDelete(`/profiles/${encodeURIComponent(id)}`);
}
export async function serverDeletePcProfile(id: string): Promise<boolean> {
  return apiDelete(`/pc-profiles/${encodeURIComponent(id)}`);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function serverGetSessions(): Promise<unknown[] | null> {
  return apiGet('/sessions');
}

export async function serverSaveSessions(sessions: unknown[]): Promise<boolean> {
  return apiPost('/sessions', sessions);
}

export async function serverDeleteSession(sessionId: string): Promise<boolean> {
  return apiDelete(`/sessions/${encodeURIComponent(sessionId)}`);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function serverGetSettings(): Promise<Record<string, unknown> | null> {
  return apiGet('/settings');
}

export async function serverSaveSettings(settings: Record<string, unknown>): Promise<boolean> {
  return apiPost('/settings', settings);
}

// ── Processus files ───────────────────────────────────────────────────────────

export interface ProcessusMeta {
  id: string;
  name: string;
  tag: string;
}

export async function serverGetProcessusList(): Promise<ProcessusMeta[]> {
  const list = await apiGet<ProcessusMeta[]>('/processus');
  return list ?? [];
}

/** Convert ArrayBuffer to base64 safely — works for any file size. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192; // process 8 KB at a time to avoid stack overflow
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload a processus file.
 * `blobUrl` is a blob: URL (from URL.createObjectURL) or a server URL.
 */
export async function serverSaveProcessus(
  id: string, name: string, tag: string, blobUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    return apiPost('/processus', { id, name, tag, base64: b64 });
  } catch (e) {
    console.error('[serverStorage] serverSaveProcessus failed:', e);
    return false;
  }
}

/** Returns a URL pointing to the file served from the local API (cacheable, shareable). */
export function serverProcessusUrl(id: string): string {
  return `${API}/processus/${encodeURIComponent(id)}`;
}

export async function serverDeleteProcessus(id: string): Promise<boolean> {
  return apiDelete(`/processus/${encodeURIComponent(id)}`);
}

// ── Session PDFs ─────────────────────────────────────────────────────────────

export async function serverSaveSessionPdf(
  sessionId: string, filename: string, base64: string
): Promise<boolean> {
  return apiPost('/session-pdfs', { sessionId, filename, base64 });
}

export function serverSessionPdfUrl(sessionId: string): string {
  return `${API}/session-pdfs/${encodeURIComponent(sessionId)}`;
}
