import { useEffect } from 'react';
import { useProfileStore } from '../store/profileStore';
import { useI18n } from '../i18n.tsx';
import { Language } from '../i18n';
import {
  getProfiles, getActiveProfileId, setActiveProfileId, saveProfile, saveSession,
  getSessions, getSessionsByProfile, migrateSessionPdfsToIndexedDb, getAllProcessusFiles,
  getPcProfiles, writeProfiles, writePcProfiles, writeSessions, SessionSummary,
  cleanupSessionPhotos,
} from '../lib/storage';
import {
  isServerAvailable, serverGetSettings, serverSaveSettings, serverGetProfiles,
  serverSaveProfiles, serverGetSessions, serverSaveSessions, serverGetProcessusList,
  serverProcessusUrl, serverGetPcProfiles, serverSavePcProfiles, serverGetTombstones,
} from '../lib/serverStorage';

interface ProcessusItem { name: string; url: string; tag: string; _id?: string }

/**
 * CONN-73 (refactor): boot/sync side-effects extracted from App.tsx.
 * Loads the active profile (local + server reconciliation), mirrors profile
 * changes to the server, and performs the one-time startup storage sync
 * (PROCESSUS files, profiles, bidirectional session merge). Reads/writes the
 * profileStore + i18n directly; the only App-owned dependency is setProcessusPdfs.
 */
export function useAppInitializer(opts: { setProcessusPdfs: (v: ProcessusItem[]) => void }) {
  const { setProcessusPdfs } = opts;
  const activeProfile    = useProfileStore(s => s.activeProfile);
  const setActiveProfile = useProfileStore(s => s.setActiveProfile);
  const setAuditorName   = useProfileStore(s => s.setAuditorName);
  const setIsSoloSession = useProfileStore(s => s.setIsSoloSession);
  const setSessionCount  = useProfileStore(s => s.setSessionCount);
  const { setLang } = useI18n();

  // Initialize Profile
  // FIX SYNC #3: also try to read the active-profile id from the server's
  // settings KV so Chrome and Electron land on the same profile at boot.
  // Local localStorage is used as fallback / first-paint.
  useEffect(() => {
    const profiles = getProfiles();
    const localActiveId = getActiveProfileId();
    if (profiles.length === 0) return;

    // First paint: use local id (fast, sync)
    const localProfile = profiles.find(p => p.id === localActiveId) || profiles[0];
    setActiveProfile(localProfile);
    setAuditorName(localProfile.name);
    setLang(localProfile.preferences.lang as Language);
    setIsSoloSession(localProfile.preferences.soloMode);

    // Then check server async; if it has a different activeProfileId that
    // matches a known profile, switch to it.
    (async () => {
      try {
        const up = await isServerAvailable();
        if (!up) return;
        const settings = await serverGetSettings();
        const remoteId = settings?.activeProfileId as string | undefined;
        if (!remoteId || remoteId === localProfile.id) return;
        const remoteProfile = profiles.find(p => p.id === remoteId);
        if (remoteProfile) {
          setActiveProfile(remoteProfile);
          setAuditorName(remoteProfile.name);
          setLang(remoteProfile.preferences.lang as Language);
          setIsSoloSession(remoteProfile.preferences.soloMode);
          setActiveProfileId(remoteProfile.id);
          console.log('[Profile] Switched to server-side active profile:', remoteProfile.id);
        }
      } catch (e) {
        console.warn('[Profile] Server active-profile fetch failed:', e);
      }
    })();
  }, []);

  // FIX SYNC #3: whenever the active profile changes, mirror the id to the
  // server's settings KV so the other client picks it up on its next boot.
  useEffect(() => {
    if (!activeProfile) return;
    (async () => {
      try {
        const up = await isServerAvailable();
        if (!up) return;
        const current = await serverGetSettings();
        if (current?.activeProfileId === activeProfile.id) return;
        await serverSaveSettings({ ...(current || {}), activeProfileId: activeProfile.id });
      } catch (e) {
        console.warn('[Profile] Server active-profile push failed:', e);
      }
    })();
  }, [activeProfile?.id]);

  // (moduleVis persistence moved to useLayoutManager hook)

  // Migrate any legacy PDF entries from localStorage into IndexedDB on startup
  useEffect(() => {
    (async () => {
      // QUOTA FIX: reclaim localStorage by stripping the redundant ~1 MB
      // auditorPhoto baked into every old session (blew the quota → the History
      // badge stopped growing). Self-healing, runs once at boot.
      try { cleanupSessionPhotos(); } catch (_) {}
      // Migrate legacy session PDFs from localStorage → IndexedDB (one-time)
      try { await migrateSessionPdfsToIndexedDb(); } catch (_) {}

      const serverUp = await isServerAvailable();
      console.log('[Storage] Server API available:', serverUp);

      // ── Load PROCESSUS files ──────────────────────────────────────────────
      if (serverUp) {
        try {
          const list = await serverGetProcessusList();
          if (list.length > 0) {
            setProcessusPdfs(list.map(f => ({
              name: f.name,
              tag:  f.tag,
              url:  serverProcessusUrl(f.id),
              _id:  f.id,
            })));
            console.log('[Processus] Loaded', list.length, 'file(s) from server');
          }
        } catch (e) {
          console.warn('[Processus] Server load failed:', e);
        }
      } else {
        // Fallback: IndexedDB
        try {
          const stored = await getAllProcessusFiles();
          if (stored.length > 0) {
            setProcessusPdfs(stored.map(f => ({ name: f.name, url: f.url, tag: f.tag, _id: f.id } as any)));
          }
        } catch (e) {
          console.warn('[Processus] IndexedDB load failed:', e);
        }
      }

      // ── Sync profiles + sessions: bidirectional merge on startup ───────────
      if (serverUp) {
        try {
          const [serverProfiles, serverSessions] = await Promise.all([
            serverGetProfiles(),
            serverGetSessions(),
          ]);

          const localProfiles = getProfiles();
          const localSessions = getSessions();

          // --- Profiles merge ---
          if (!serverProfiles || (serverProfiles as any[]).length === 0) {
            if (localProfiles.length > 0) {
              await serverSaveProfiles(localProfiles as any[]);
              console.log('[Storage] Profiles pushed to server:', localProfiles.length);
            }
          } else {
            // Merge: local wins for existing IDs, server adds new ones
            const merged = new Map<string, any>();
            (serverProfiles as any[]).forEach((p: any) => merged.set(p.id, p));
            localProfiles.forEach(p => merged.set(p.id, p)); // local overrides server
            const mergedArr = Array.from(merged.values());
            if (mergedArr.length > localProfiles.length) {
              // Server had profiles we don't have locally — save them
              mergedArr.forEach((p: any) => {
                if (!localProfiles.find(lp => lp.id === p.id)) {
                  try { saveProfile(p, false); } catch (_) {} // CONN-103: keep server ts
                }
              });
              console.log('[Storage] Merged', mergedArr.length, 'profiles from server');
            }
          }

          // FIX SYNC #2 — retry pending push from a previous run (closed offline)
          if (localStorage.getItem('nest_sessions_pending_push')) {
            try {
              await Promise.all([
                serverSaveSessions(localSessions as any[]),
                serverSaveProfiles(localProfiles as any[]),
              ]);
              localStorage.removeItem('nest_sessions_pending_push');
              console.log('[Storage] Pending push flushed successfully');
            } catch (e) {
              console.warn('[Storage] Pending push retry failed — will try again later:', e);
            }
          }

          // --- Sessions merge (FIX SYNC #1: truly bidirectional) ---
          // Previously this branch only pulled server→local when the server
          // already had sessions, so any local-only sessions stayed stranded
          // (e.g. created in Chrome while Electron was the one syncing). Now
          // we merge by id (last-writer-wins via Map) and push the union back.
          {
            const serverArr = (serverSessions as SessionSummary[]) || [];
            const merged   = new Map<string, SessionSummary>();
            serverArr.forEach(s => merged.set(s.id, s));
            localSessions.forEach(s => merged.set(s.id, s)); // local wins on conflict
            const mergedArr = Array.from(merged.values());

            const localIds  = new Set(localSessions.map(s => s.id));
            const serverIds = new Set(serverArr.map(s => s.id));
            const newToLocal  = mergedArr.filter(s => !localIds.has(s.id));
            const newToServer = mergedArr.filter(s => !serverIds.has(s.id));

            // Pull server-only sessions into local storage
            if (newToLocal.length > 0) {
              newToLocal.forEach(s => { try { saveSession(s); } catch (_) {} });
              console.log('[Storage] Imported', newToLocal.length, 'session(s) from server');
              const updatedSessions = getSessionsByProfile(activeProfile?.id || '_default');
              setSessionCount(updatedSessions.length);
            }
            // Push local-only sessions to the server
            if (newToServer.length > 0) {
              await serverSaveSessions(mergedArr as any[]);
              console.log('[Storage] Pushed', newToServer.length, 'local-only session(s) to server');
            }
          }
        } catch (e) {
          console.warn('[Storage] Sync failed:', e);
        }
      }
    })();
  }, []);

  // CONN-103: ROBUST periodic sync — LAST-WRITE-WINS by `updatedAt`, with
  // tombstones for deletes. For each entity (profiles, PCs, sessions) we merge
  // local + server keeping the NEWER copy per id (so a stale push/pull can never
  // clobber a fresh edit), drop tombstoned ids, write the merged set locally, and
  // push only the records where local is newer / local-only. Convergent + safe.
  useEffect(() => {
    let stopped = false;

    type Rec = { id: string; updatedAt?: number };
    const lww = <T extends Rec>(local: T[], server: T[], entity: string, tombs: Record<string, number>) => {
      const byId = new Map<string, T>();
      local.forEach(r => { if (r && r.id != null) byId.set(r.id, r); });
      const toPush: T[] = [];
      const serverIds = new Set(server.map(s => s.id));
      server.forEach(s => {
        if (!s || s.id == null) return;
        const l = byId.get(s.id);
        if (!l || (s.updatedAt || 0) > (l.updatedAt || 0)) byId.set(s.id, s);       // server newer → take it
        else if ((l.updatedAt || 0) > (s.updatedAt || 0)) toPush.push(l);            // local newer → push it
      });
      local.forEach(l => { if (l && l.id != null && !serverIds.has(l.id)) toPush.push(l); }); // local-only → push
      const deleted = (r: T) => { const d = tombs[`${entity}:${r.id}`] || 0; return d && d >= (r.updatedAt || 0); };
      return {
        merged: Array.from(byId.values()).filter(r => !deleted(r)),
        toPush: toPush.filter(r => !deleted(r)),
      };
    };

    const sync = async () => {
      try {
        if (stopped || !(await isServerAvailable())) return;
        const tombs = (await serverGetTombstones()) || {};

        const sp = await serverGetProfiles();
        if (sp && !stopped) {
          const { merged, toPush } = lww(getProfiles() as any[], sp as any[], 'profiles', tombs);
          writeProfiles(merged as any[]);
          if (toPush.length) { try { await serverSaveProfiles(toPush as any[]); } catch (_) {} }
        }
        const spc = await serverGetPcProfiles();
        if (spc && !stopped) {
          const { merged, toPush } = lww(getPcProfiles() as any[], spc as any[], 'pc-profiles', tombs);
          writePcProfiles(merged as any[]);
          if (toPush.length) { try { await serverSavePcProfiles(toPush as any[]); } catch (_) {} }
        }
        const ss = await serverGetSessions();
        if (ss && !stopped) {
          const { merged, toPush } = lww(getSessions() as any[], ss as any[], 'sessions', tombs);
          writeSessions(merged as any[]);
          if (toPush.length) { try { await serverSaveSessions(toPush as any[]); } catch (_) {} }
          const pid = useProfileStore.getState().activeProfile?.id || '_default';
          setSessionCount(getSessionsByProfile(pid).length);
        }
      } catch (_) { /* offline / transient — retry next tick */ }
    };
    sync();
    const id = setInterval(sync, 15_000);
    return () => { stopped = true; clearInterval(id); };
  }, []);
}
