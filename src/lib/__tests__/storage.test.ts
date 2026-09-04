// @vitest-environment jsdom
/**
 * storage.ts — profils, sessions, PDFs (localStorage + IndexedDB), brouillon de séance.
 *
 * ── PÉRIMÈTRE ────────────────────────────────────────────────────────────────────────────────
 * Signalé lors de l'analyse de code : `storage.ts` (la couche de persistance — profils,
 * sessions, PDFs, brouillon de crash-recovery) n'avait AUCUN test, malgré des correctifs de
 * quota déjà documentés dans le code lui-même (CONN-104, la note « QUOTA FIX » sur les photos).
 *
 * `jsdom` (pour `localStorage`/`window`) + `fake-indexeddb` (jsdom n'implémente pas IndexedDB) —
 * une fabrique IDB FRAÎCHE à chaque test (`new IDBFactory()`) pour ne jamais laisser une base
 * d'un test polluer le suivant, les noms de base (`nest_pdfs_db`, `nest_processus_db`) étant des
 * constantes fixes du module.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as storage from '../storage';
import type { UserProfile, SessionSummary } from '../storage';

beforeEach(() => {
  localStorage.clear();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1', name: 'Claudio', preferences: { lang: 'it', soloMode: false },
    createdAt: Date.now(), ...overrides,
  };
}

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 's1', profileId: 'p1', date: Date.now(), duration: 600, pcName: 'Test PC',
    isSolo: false, mass: 0, fnCount: 0, maxEta: 0, epValidated: false, ...overrides,
  };
}

describe('profils', () => {
  it('save + get : round-trip', () => {
    storage.saveProfile(makeProfile());
    expect(storage.getProfiles()).toHaveLength(1);
    expect(storage.getProfiles()[0].id).toBe('p1');
  });

  it('save avec le même id → MISE À JOUR, pas duplication', () => {
    storage.saveProfile(makeProfile({ name: 'Claudio' }));
    storage.saveProfile(makeProfile({ name: 'Claudio Z.' }));
    const all = storage.getProfiles();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Claudio Z.');
  });

  it('saveProfile tamponne updatedAt par défaut (CONN-103, last-write-wins)', () => {
    const before = Date.now();
    storage.saveProfile(makeProfile());
    expect(storage.getProfiles()[0].updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('stampNow=false NE touche PAS updatedAt (import depuis le serveur)', () => {
    storage.saveProfile(makeProfile({ updatedAt: 42 }), false);
    expect(storage.getProfiles()[0].updatedAt).toBe(42);
  });

  it('deleteProfile retire le profil, ses sessions, et l\'id actif si c\'était lui', () => {
    storage.saveProfile(makeProfile());
    storage.saveSession(makeSession());
    storage.setActiveProfileId('p1');
    storage.deleteProfile('p1');
    expect(storage.getProfiles()).toHaveLength(0);
    expect(storage.getSessions()).toHaveLength(0);
    expect(storage.getActiveProfileId()).toBeNull();
  });

  it('getProfiles sur un localStorage corrompu → [] (jamais une exception)', () => {
    localStorage.setItem('nest_profiles', '{not json');
    expect(storage.getProfiles()).toEqual([]);
  });
});

describe('profils PC (préclairs)', () => {
  it('save + get + delete', () => {
    storage.savePcProfile({ id: 'pc1', name: 'Alberto', createdAt: Date.now() });
    expect(storage.getPcProfiles()).toHaveLength(1);
    storage.deletePcProfile('pc1');
    expect(storage.getPcProfiles()).toHaveLength(0);
  });
});

describe('sessions', () => {
  it('saveSession EXIGE un profileId valide', () => {
    expect(() => storage.saveSession(makeSession({ profileId: '' }))).toThrow();
  });

  it('save + get round-trip', () => {
    storage.saveSession(makeSession());
    expect(storage.getSessions()).toHaveLength(1);
  });

  it('saveSession retire TOUJOURS auditorPhoto (redondant avec le profil) — QUOTA FIX', () => {
    storage.saveSession(makeSession({ auditorPhoto: 'data:image/png;base64,AAAA' }));
    expect(storage.getSessions()[0].auditorPhoto).toBeUndefined();
  });

  it('saveSession retire pcPhoto SEULEMENT si trop grande (> PHOTO_MAX)', () => {
    const small = 'x'.repeat(1000);
    const big = 'x'.repeat(70_000);
    storage.saveSession(makeSession({ id: 's-small', pcPhoto: small }));
    storage.saveSession(makeSession({ id: 's-big', pcPhoto: big }));
    const sessions = storage.getSessions();
    expect(sessions.find(s => s.id === 's-small')!.pcPhoto).toBe(small);
    expect(sessions.find(s => s.id === 's-big')!.pcPhoto).toBeUndefined();
  });

  it('deleteSession retire la session ET la purge des historiques hérités des profils', () => {
    storage.saveProfile(makeProfile({ sessionHistory: [makeSession()] }));
    storage.saveSession(makeSession());
    storage.deleteSession('s1');
    expect(storage.getSessions()).toHaveLength(0);
    expect(storage.getProfiles()[0].sessionHistory).toHaveLength(0);
  });

  it('updateSessionNextCs met à jour la session globale ET l\'historique hérité du profil', () => {
    storage.saveProfile(makeProfile({ sessionHistory: [makeSession()] }));
    storage.saveSession(makeSession());
    storage.updateSessionNextCs('s1', 'Next CS text');
    expect(storage.getSessions()[0].nextCs).toBe('Next CS text');
    expect(storage.getProfiles()[0].sessionHistory![0].nextCs).toBe('Next CS text');
  });

  it('getSessionsByProfile fusionne global + historique hérité, dédupliqué par id, trié par date décroissante', () => {
    storage.saveProfile(makeProfile({ sessionHistory: [makeSession({ id: 's-legacy', date: 100 })] }));
    storage.saveSession(makeSession({ id: 's-new', date: 300 }));
    // 's1' dupliqué exprès (même id dans les deux sources) : ne doit compter qu'une fois.
    storage.saveProfile({ ...makeProfile(), sessionHistory: [makeSession({ id: 's-legacy', date: 100 })] });
    const list = storage.getSessionsByProfile('p1');
    expect(list.map(s => s.id)).toEqual(['s-new', 's-legacy']); // décroissant par date
  });

  it('cleanupSessionPhotos réduit la taille stockée quand des photos lourdes traînent', () => {
    const raw = JSON.stringify([{ ...makeSession(), auditorPhoto: 'x'.repeat(50_000) }]);
    localStorage.setItem('nest_sessions', raw);
    storage.cleanupSessionPhotos();
    const after = localStorage.getItem('nest_sessions')!;
    expect(after.length).toBeLessThan(raw.length);
    expect(JSON.parse(after)[0].auditorPhoto).toBeUndefined();
  });

  it('cleanupSessionPhotos sans rien à nettoyer ne lève pas et laisse le store intact', () => {
    storage.saveSession(makeSession());
    const before = localStorage.getItem('nest_sessions');
    expect(() => storage.cleanupSessionPhotos()).not.toThrow();
    expect(localStorage.getItem('nest_sessions')).toBe(before);
  });
});

describe('PDF de session — variante synchrone (localStorage)', () => {
  it('save + get + delete round-trip', () => {
    storage.saveSessionPdf('s1', 'data:application/pdf;base64,AAAA');
    expect(storage.getSessionPdf('s1')).toBe('data:application/pdf;base64,AAAA');
    storage.deleteSessionPdf('s1');
    expect(storage.getSessionPdf('s1')).toBeNull();
  });

  it('getSessionPdf sur un id absent → null', () => {
    expect(storage.getSessionPdf('inconnu')).toBeNull();
  });
});

describe('PDF de session — variante asynchrone (IndexedDB, avec repli localStorage)', () => {
  it('save + get + delete round-trip via IndexedDB', async () => {
    await storage.saveSessionPdfAsync('s1', 'data:application/pdf;base64,BBBB');
    expect(await storage.getSessionPdfAsync('s1')).toBe('data:application/pdf;base64,BBBB');
    await storage.deleteSessionPdfAsync('s1');
    expect(await storage.getSessionPdfAsync('s1')).toBeNull();
  });

  it('getSessionPdfAsync sur un id absent → null', async () => {
    expect(await storage.getSessionPdfAsync('inconnu')).toBeNull();
  });

  it('migrateSessionPdfsToIndexedDb déplace les PDFs hérités puis efface la clé legacy', async () => {
    storage.saveSessionPdf('legacy1', 'data:application/pdf;base64,CCCC');
    await storage.migrateSessionPdfsToIndexedDb();
    expect(localStorage.getItem('nest_session_pdfs')).toBeNull();
    expect(await storage.getSessionPdfAsync('legacy1')).toBe('data:application/pdf;base64,CCCC');
  });

  it('migrateSessionPdfsToIndexedDb sans rien à migrer ne lève pas', async () => {
    await expect(storage.migrateSessionPdfsToIndexedDb()).resolves.not.toThrow();
  });
});

describe('fichiers de processus — IndexedDB', () => {
  it('save + liste + delete round-trip', async () => {
    const data = new TextEncoder().encode('%PDF-1.4 fake').buffer;
    await storage.saveProcessusFile('proc1', 'Assessment.pdf', 'assessment', data);
    const all = await storage.getAllProcessusFiles();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'proc1', name: 'Assessment.pdf', tag: 'assessment' });
    await storage.deleteProcessusFile('proc1');
    expect(await storage.getAllProcessusFiles()).toHaveLength(0);
  });

  it('liste vide quand rien n\'a jamais été sauvé', async () => {
    expect(await storage.getAllProcessusFiles()).toEqual([]);
  });
});

describe('brouillon de séance (crash recovery)', () => {
  const draft: storage.SessionDraft = {
    v: 1, savedAt: Date.now(), startTime: Date.now(), elapsed: 42, appMode: 'normal',
    auditorName: 'A', pcName: 'B', totalTa: 3.2, logs: [],
    sessionObjective: '', sessionProcessObjective: '', sessionPhysicalCheck: '', sessionBriefing: '',
  };

  it('save (IndexedDB, fire-and-forget) puis load round-trip', async () => {
    storage.saveSessionDraft(draft);
    // saveSessionDraft ne retourne pas de promesse (fire-and-forget) — on laisse le micro-tick
    // s'écouler avant de lire, comme le ferait l'app réelle au prochain rendu.
    await new Promise(r => setTimeout(r, 0));
    const loaded = await storage.loadSessionDraftAsync();
    expect(loaded).toMatchObject({ elapsed: 42, auditorName: 'A', pcName: 'B' });
  });

  it('load sans brouillon existant → null', async () => {
    expect(await storage.loadSessionDraftAsync()).toBeNull();
  });

  it('clearSessionDraft efface le brouillon (localStorage ET IndexedDB)', async () => {
    storage.saveSessionDraft(draft);
    await new Promise(r => setTimeout(r, 0));
    storage.clearSessionDraft();
    await new Promise(r => setTimeout(r, 0));
    expect(await storage.loadSessionDraftAsync()).toBeNull();
  });

  it('un brouillon hérité (v ancien ou absent) est ignoré, pas planté', async () => {
    localStorage.setItem('nest_session_draft', JSON.stringify({ v: 0, foo: 'bar' }));
    // Pas de base IndexedDB créée → repli localStorage → le champ `v` invalide le fait rejeter.
    expect(await storage.loadSessionDraftAsync()).toBeNull();
  });
});
