import React, { useMemo, useRef, useState } from 'react';
import { pick5 } from '../i18n5';
import { loadHistory as loadCanTests, daysSince as canDaysSince, scaleFor, soloRatio } from '../engine/canTest';
import { UserRound, Eye, Plus, Pencil, Star, X, Camera, Upload, Trash2, Check } from 'lucide-react';
import {
  UserProfile, getProfiles, getSessions, getSessionsByProfile, saveProfile, deleteProfile,
  getPcProfiles, savePcProfile, deletePcProfile } from '../lib/storage';
import { useProfileStore } from '../store/profileStore';
import { useUiStore } from '../store/uiStore';
import {
  isServerAvailable, serverSaveProfiles, serverSavePcProfiles,
  serverDeleteProfile, serverDeletePcProfile } from '../lib/serverStorage';
import { LAYER } from '../ui/layers';

/**
 * CONN-99 — PROFILE MANAGEMENT (single, self-contained).
 *
 * The one place to SELECT and CREATE both AUDITORS and PRECLEARS. Creation is
 * INLINE here (name + photo via camera or upload) — the old separate
 * "Manage Profile" modal is no longer needed. Opened from the SESSIONE hub.
 *   • tap an AUDITOR  → activates that profile
 *   • tap a PRECLEAR  → pre-loads that preclear (name+photo) for the session
 *   • + NEW           → inline form (auditor OR preclear)
 */
interface ProfileRosterProps {
  onActivate: (p: UserProfile) => void;
  lang: string;
}

type EditKind = 'auditor' | 'pc';
interface EditState { kind: EditKind; id?: string; name: string; photo?: string; sex?: 'm' | 'f'; }

export function ProfileRoster({ onActivate, lang }: ProfileRosterProps) {
  const activeProfile = useProfileStore(s => s.activeProfile);
  const setPcName     = useProfileStore(s => s.setPcName);
  const setPcPhoto    = useProfileStore(s => s.setPcPhoto);
  const setPcSex      = useProfileStore(s => s.setPcSex);
  const pcName        = useProfileStore(s => s.pcName);
  const setShowRoster = useUiStore(s => s.setShowRoster);

  const [tick, setTick] = useState(0);                 // force re-read after save/delete
  const [edit, setEdit] = useState<EditState | null>(null);
  const [camOn, setCamOn] = useState(false);
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef   = useRef<HTMLInputElement | null>(null);

  const refresh = () => setTick(t => t + 1);

  // 'tick' est un DÉCLENCHEUR volontaire : on le bump pour re-lire le stockage.
  // Le retirer casserait le rafraîchissement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const auditors = useMemo(() => getProfiles(), [tick]);
  const countFor = useMemo(() => {
    const m = new Map<string, number>();
    auditors.forEach(p => { try { m.set(p.id, getSessionsByProfile(p.id).length); } catch { m.set(p.id, 0); } });
    return m;
  }, [auditors]);

  // PCs = registry (creatable) + session-derived (read-only), deduped by name.
  const { regPcs, derivedPcs } = useMemo(() => {
    const reg = getPcProfiles();
    const regNames = new Set(reg.map(p => p.name.trim().toLowerCase()));
    const map = new Map<string, { name: string; photo?: string; count: number; last: number }>();
    try {
      getSessions().forEach(s => {
        const name = (s.pcName || '').trim(); if (!name) return;
        const e = map.get(name) || { name, photo: undefined, count: 0, last: 0 };
        e.count += 1; if ((s.date || 0) >= e.last) { e.last = s.date || 0; if (s.pcPhoto) e.photo = s.pcPhoto; }
        map.set(name, e);
      });
    } catch { /* ignore */ }
    const derived = Array.from(map.values()).filter(e => !regNames.has(e.name.toLowerCase())).sort((a, b) => b.last - a.last);
    return { regPcs: reg, derivedPcs: derived };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const fmtDate = (ts: number) => ts ? new Date(ts).toLocaleDateString(lang || 'fr', { day: '2-digit', month: 'short' }) : '—';
  // CINQUE lingue, come tutto il resto del programma. L'helper di prima ne conosceva TRE e
  // ripiegava sul FRANCESE: in inglese, spagnolo e svedese metà dei bottoni di questo pannello
  // restavano in francese (« ENREGISTRER » segnalato dall'utente). L'ordine è quello di pick5.
  const L = (it: string, fr: string, en: string, es: string, sv: string) =>
    pick5(lang as string, it, fr, en, es, sv);

  // ── camera / photo ─────────────────────────────────────────────────────────
  const stopCam = () => {
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setCamOn(false);
  };
  const startCam = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = st; setCamOn(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = st; videoRef.current.play().catch(() => {}); } });
    } catch { alert(L('Camera non disponibile', 'Caméra indisponible', 'Camera unavailable', 'Cámara no disponible', 'Kameran är inte tillgänglig')); }
  };
  const capture = () => {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement('canvas'); const sz = 320;
    c.width = sz; c.height = sz;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const s = Math.min(v.videoWidth, v.videoHeight) || sz;
    ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, sz, sz);
    setEdit(e => e ? { ...e, photo: c.toDataURL('image/jpeg', 0.85) } : e);
    stopCam();
  };
  // CONN-104: downscale the imported image to a 320px square JPEG before storing.
  // A raw full-res photo as base64 can be several MB and blow the localStorage
  // quota → the profile save then FAILS and the edit silently reverts ("I find
  // back what was there before"). Downscaling keeps it ~20–40 KB and syncs fine.
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); const sz = 320; c.width = sz; c.height = sz;
          const ctx = c.getContext('2d'); if (!ctx) { setEdit(p => p ? { ...p, photo: String(r.result) } : p); return; }
          const s = Math.min(img.width, img.height) || sz;
          ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, sz, sz);
          setEdit(p => p ? { ...p, photo: c.toDataURL('image/jpeg', 0.85) } : p);
        } catch { setEdit(p => p ? { ...p, photo: String(r.result) } : p); }
      };
      img.onerror = () => setEdit(p => p ? { ...p, photo: String(r.result) } : p);
      img.src = String(r.result);
    };
    r.readAsDataURL(f);
  };

  // ── save / delete ────────────────────────────────────────────────────────────
  const closeEdit = () => { stopCam(); setEdit(null); };
  // CONN-102: push to the server immediately so the other client (Electron ↔
  // Chrome) sees the create/edit within seconds (and on its next 25 s poll).
  const pushServer = (obj: any, kind: EditKind) => {
    (async () => { try { if (await isServerAvailable()) { kind === 'auditor' ? await serverSaveProfiles([obj]) : await serverSavePcProfiles([obj]); } } catch (_) {} })();
  };
  const saveEdit = () => {
    if (!edit || !edit.name.trim()) return;
    if (edit.kind === 'auditor') {
      const existing = edit.id ? auditors.find(p => p.id === edit.id) : null;
      const prof = {
        id: edit.id || Date.now().toString(),
        name: edit.name.trim(),
        photo: edit.photo,
        sex: edit.sex,   // SOLO: drives the Tone-Arm baseline when the auditor is the PC
        preferences: existing?.preferences || { lang: (lang || 'fr'), soloMode: false },
        createdAt: existing?.createdAt || Date.now() };
      saveProfile(prof); pushServer(prof, 'auditor');
      // If this auditor is the active one in a solo session, refresh the live baseline.
      if (edit.id && activeProfile?.id === edit.id && activeProfile?.preferences?.soloMode) setPcSex(edit.sex);
    } else {
      const pc = { id: edit.id || ('pc_' + Date.now()), name: edit.name.trim(), photo: edit.photo, sex: edit.sex, createdAt: Date.now() };
      savePcProfile(pc); pushServer(pc, 'pc');
      setPcName(pc.name); if (pc.photo) setPcPhoto(pc.photo); setPcSex(pc.sex);
    }
    closeEdit(); refresh();
  };
  const removeAuditor = (id: string) => { if (confirm(L('Eliminare questo auditor?', 'Supprimer cet auditeur ?', 'Delete this auditor?', '¿Eliminar este auditor?', 'Ta bort denna auditör?'))) { deleteProfile(id); serverDeleteProfile(id).catch(() => {}); refresh(); } };
  const removePc = (id: string) => { if (confirm(L('Eliminare questo preclear?', 'Supprimer ce préclair ?', 'Delete this preclear?', '¿Eliminar este preclear?', 'Ta bort denna preclear?'))) { deletePcProfile(id); serverDeletePcProfile(id).catch(() => {}); refresh(); } };

  // ── styles ────────────────────────────────────────────────────────────────
  // MONOCHROME : plus de bleu (auditeur) ni d'ambre (PC) → tout en verre charcoal + encre
  // blanche, comme le reste de l'interface. La distinction auditeur/PC reste par l'icône
  // et le libellé, pas par la couleur. AMBER conservé comme jeton = blanc froid.
  const AMBER = 'rgba(240,246,255,0.92)';
  const cardBase: React.CSSProperties = {
    position: 'relative', display: 'flex', borderRadius: 16, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
    backdropFilter: 'blur(20px) saturate(1.15)', WebkitBackdropFilter: 'blur(20px) saturate(1.15)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
    cursor: 'pointer', minHeight: 150 };
  const phCol = (_pc: boolean): React.CSSProperties => ({
    width: 112, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))' });
  const avatar = (_pc: boolean): React.CSSProperties => ({
    width: 80, height: 80, borderRadius: '50%', marginBottom: 12, objectFit: 'cover',
    border: '2px solid rgba(255,255,255,0.5)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
    background: 'radial-gradient(circle at 50% 30%, #3a3a41, #1e1e22)',
    display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const Row = ({ l, v }: { l: string; v: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.10)', paddingBottom: 4, marginTop: 4 }}>
      <span style={{ color: 'rgba(200,214,234,0.55)' }}>{l}</span><span style={{ color: 'rgba(240,246,255,0.9)', fontFamily: 'monospace' }}>{v}</span>
    </div>
  );
  const addCard = (_kind: EditKind): React.CSSProperties => ({
    ...cardBase, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.22)',
    background: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
    color: 'rgba(226,238,255,0.7)' });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: LAYER.session, padding: '30px 52px',
      background: 'radial-gradient(1200px 800px at 50% 28%, #34343a 0%, #202024 58%, #161619 100%)',
      display: 'flex', flexDirection: 'column' }}>

      <div style={{ textAlign: 'center', position: 'relative', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 22, letterSpacing: '0.28em', color: '#eef4ff', textShadow: 'none' }}>
          {L('AUDITOR & PC', 'AUDITEURS & PC', 'AUDITORS & PCs', 'AUDITORES & PC', 'AUDITÖRER & PC')}
        </h1>
        <p style={{ fontSize: 11, letterSpacing: '0.34em', color: 'rgba(200,214,234,0.6)', marginTop: 6 }}>
          {L('GESTIONE · SCEGLI O CREA', 'GESTION · CHOISIR OU CRÉER', 'MANAGE · SELECT OR CREATE', 'GESTIÓN · ELEGIR O CREAR', 'HANTERA · VÄLJ ELLER SKAPA')}
        </p>
        <button onClick={() => setShowRoster(false)} title={pick5(lang, 'Chiudi', 'Fermer', 'Close', 'Cerrar', 'Stäng')} style={{ position: 'absolute', right: 0, top: -4, width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.06)', color: 'rgba(240,246,255,0.85)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
      </div>

      <div style={{ flex: 1, marginTop: 20, borderRadius: 20, padding: 24, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 10px 34px rgba(0,0,0,0.45)' }}>

        {/* AUDITORS */}
        <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.26em', color: 'rgba(226,238,255,0.72)', marginBottom: 12 }}>◈ {L('AUDITOR', 'AUDITEURS', 'AUDITORS', 'AUDITORES', 'AUDITÖRER')} · {auditors.length}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 20 }}>
          {auditors.map(p => {
            const active = activeProfile?.id === p.id;
            return (
              <div key={p.id} onClick={() => onActivate(p)} style={{ ...cardBase, borderColor: active ? 'rgba(255,255,255,0.85)' : (cardBase.border as string), boxShadow: active ? '0 0 24px rgba(255,255,255,0.12), inset 0 0 24px rgba(255,255,255,0.06)' : cardBase.boxShadow }}>
                <div style={phCol(false)}>{p.photo ? <img src={p.photo} alt="" style={avatar(false)} /> : <div style={avatar(false)}><Eye size={28} style={{ color: 'rgba(240,246,255,0.85)' }} /></div>}</div>
                <div style={{ flex: 1, padding: '13px 15px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.14em', color: 'rgba(226,238,255,0.72)' }}>{p.preferences?.soloMode ? 'AUDITEUR · SOLO' : 'AUDITEUR'}</span>
                    {active
                      ? <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#1a1a1f', background: 'rgba(240,246,255,0.92)', padding: '4px 12px', borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>✓ {L('ATTIVO', 'ACTIF', 'ACTIVE', 'ACTIVO', 'AKTIV')}</span>
                      : <span style={{ fontSize: 14, color: 'rgba(200,214,234,0.5)' }}>○</span>}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(240,246,255,0.95)', marginTop: 5 }}>{p.name || '—'}</div>
                  <div style={{ marginTop: 7 }}>
                    <Row l={L('Sessioni', 'Séances', 'Sessions', 'Sesiones', 'Sessioner')} v={String(countFor.get(p.id) ?? 0)} />
                    <Row l="Langue" v={(p.preferences?.lang || '—').toUpperCase()} />
                  </div>
                  <div style={{ position: 'absolute', right: 10, bottom: 8, display: 'flex', gap: 6 }}>
                    <button onClick={(e) => { e.stopPropagation(); setEdit({ kind: 'auditor', id: p.id, name: p.name, photo: p.photo, sex: p.sex }); }} title={pick5(lang, 'Modifica', 'Modifier', 'Edit', 'Editar', 'Redigera')} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.06)', color: 'rgba(240,246,255,0.8)', cursor: 'pointer' }}><Pencil size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); removeAuditor(p.id); }} title={pick5(lang, 'Elimina', 'Supprimer', 'Delete', 'Eliminar', 'Ta bort')} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.04)', color: 'rgba(240,246,255,0.6)', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                  {active && <Star size={12} style={{ position: 'absolute', right: 78, bottom: 13, color: 'rgba(255,255,255,0.85)' }} />}
                </div>
              </div>
            );
          })}
          <div onClick={() => setEdit({ kind: 'auditor', name: '' })} style={addCard('auditor')}>
            <Plus size={36} strokeWidth={1.4} /><div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.16em', marginTop: 6 }}>{L('NUOVO AUDITOR', 'NOUVEL AUDITEUR', 'NEW AUDITOR', 'NUEVO AUDITOR', 'NY AUDITÖR')}</div>
          </div>
        </div>

        {/* PRECLEARS */}
        <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.26em', color: AMBER, margin: '26px 0 12px' }}>◈ {L('PRECLEAR', 'PRÉCLAIRS', 'PRECLEARS', 'PRECLEARS', 'PRECLEARS')} · {regPcs.length + derivedPcs.length}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 20 }}>
          {regPcs.map(pc => {
            const sel = (pcName || '').trim().toLowerCase() === pc.name.trim().toLowerCase();
            return (
              <div key={pc.id} onClick={() => { setPcName(pc.name); if (pc.photo) setPcPhoto(pc.photo); setPcSex(pc.sex); refresh(); }} style={{ ...cardBase, borderColor: sel ? 'rgba(255,255,255,0.85)' : (cardBase.border as string), boxShadow: sel ? '0 0 24px rgba(255,255,255,0.12), inset 0 0 24px rgba(255,255,255,0.06)' : cardBase.boxShadow }}>
                <div style={phCol(true)}>{pc.photo ? <img src={pc.photo} alt="" style={avatar(true)} /> : <div style={avatar(true)}><UserRound size={28} style={{ color: 'rgba(240,246,255,0.85)' }} /></div>}</div>
                <div style={{ flex: 1, padding: '13px 15px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.14em', color: AMBER }}>{L('PRECLEAR', 'PRÉCLAIR', 'PRECLEAR', 'PRECLEAR', 'PRECLEAR')}</span>
                    {sel
                      ? <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#1a1a1f', background: AMBER, padding: '4px 12px', borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>✓ {L('SCELTO', 'CHOISI', 'CHOSEN', 'ELEGIDO', 'VALD')}</span>
                      : <span style={{ fontSize: 14, color: 'rgba(200,214,234,0.5)' }}>○</span>}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(240,246,255,0.95)', marginTop: 5 }}>{pc.name}</div>
                  <div style={{ marginTop: 7 }}>
                    <Row l={L('Creato', 'Créé', 'Created', 'Creado', 'Skapad')} v={fmtDate(pc.createdAt)} />
                    {/* ── LA PROVA DELLE LATTINE ──────────────────────────────────────────
                        « Che fa fede sono le DUE LATTINE »: la prova della stretta si tiene
                        per PERSONA, e qui la si ritrova. Senza, si riparte ogni volta da zero
                        senza sapere che « zero » era diverso l'ultima volta. */}
                    {(() => {
                      const h = loadCanTests(pc.name);
                      const g = canDaysSince(h, Date.now(), 'two-cans');
                      const r = soloRatio(h);
                      const due = scaleFor(h, 'two-cans');
                      return <>
                        <Row l={L('Prova lattine', 'Test boîtes', 'Cans test', 'Prueba latas', 'Burktest')}
                             v={g === null
                                 ? L('mai fatta', 'jamais faite', 'never done', 'nunca hecha', 'aldrig gjord')
                                 : g === 0 ? L('oggi', "aujourd'hui", 'today', 'hoy', 'idag')
                                 : `${g} ${L('giorni fa', 'jours', 'days ago', 'días', 'dagar sedan')}`}
                        />
                        {h.tests.length > 0 && (
                          <Row l={L('Prove', 'Essais', 'Tests', 'Pruebas', 'Test')}
                               v={`${h.tests.length}${due ? ` · ${due.toExponential(1)}` : ''}`} />
                        )}
                        {r !== null && (
                          <Row l={L('Solo (1 lattina)', 'Solo (1 boîte)', 'Solo (1 can)', 'Solo (1 lata)', 'Solo (1 burk)')}
                               v={`×${r.toFixed(2)}`} />
                        )}
                      </>;
                    })()}
                  </div>
                  <div style={{ position: 'absolute', right: 10, bottom: 8, display: 'flex', gap: 6 }}>
                    <button onClick={(e) => { e.stopPropagation(); setEdit({ kind: 'pc', id: pc.id, name: pc.name, photo: pc.photo, sex: pc.sex }); }} title={pick5(lang, 'Modifica', 'Modifier', 'Edit', 'Editar', 'Redigera')} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.06)', color: 'rgba(240,246,255,0.8)', cursor: 'pointer' }}><Pencil size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); removePc(pc.id); }} title={pick5(lang, 'Elimina', 'Supprimer', 'Delete', 'Eliminar', 'Ta bort')} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.04)', color: 'rgba(240,246,255,0.6)', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {derivedPcs.map(pc => {
            const sel = (pcName || '').trim().toLowerCase() === pc.name.toLowerCase();
            return (
              <div key={'d_' + pc.name} onClick={() => { setPcName(pc.name); if (pc.photo) setPcPhoto(pc.photo); setPcSex(undefined); refresh(); }} style={{ ...cardBase, opacity: 0.92, borderColor: sel ? 'rgba(255,255,255,0.85)' : (cardBase.border as string) }}>
                <div style={phCol(true)}>{pc.photo ? <img src={pc.photo} alt="" style={avatar(true)} /> : <div style={avatar(true)}><UserRound size={28} style={{ color: 'rgba(240,246,255,0.85)' }} /></div>}</div>
                <div style={{ flex: 1, padding: '13px 15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.14em', color: AMBER }}>{L('PRECLEAR · STORICO', 'PRÉCLAIR · HISTO', 'PRECLEAR · HISTORY', 'PRECLEAR · HISTORIAL', 'PRECLEAR · HISTORIK')}</span>
                    {sel
                      ? <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#1a1a1f', background: AMBER, padding: '4px 12px', borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>✓ {L('SCELTO', 'CHOISI', 'CHOSEN', 'ELEGIDO', 'VALD')}</span>
                      : <span style={{ fontSize: 14, color: 'rgba(200,214,234,0.5)' }}>○</span>}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(240,246,255,0.95)', marginTop: 5 }}>{pc.name}</div>
                  <div style={{ marginTop: 7 }}><Row l={L('Sessioni', 'Séances', 'Sessions', 'Sesiones', 'Sessioner')} v={String(pc.count)} /><Row l={L('Ultima', 'Dernière', 'Last', 'Última', 'Senaste')} v={fmtDate(pc.last)} /></div>
                  {/* ── PERCHÉ QUESTA SCHEDA NON SI MODIFICAVA ─────────────────────────────────
                      Non è un profilo: è l'OMBRA delle sedute — nome, foto e conteggio dedotti
                      da `getSessions()`. Non c'era un record da modificare, quindi mancavano
                      matita e cestino, e sembrava un profilo bloccato (segnalato).

                      La matita ora lo REGISTRA: apre la scheda già compilata col nome e la foto,
                      e salvando nasce un profilo vero. Da quel momento la scheda « HISTO »
                      sparisce da sé — i dedotti sono deduplicati contro i registrati — e al suo
                      posto c'è il profilo, con matita E cestino come tutti gli altri. Un gesto,
                      e si sbloccano entrambe le cose.

                      Nessun cestino qui: cancellare l'ombra vorrebbe dire cancellare le sedute
                      che la proiettano, e quelle si eliminano una per una dallo STORICO, dove si
                      vede che cosa si sta perdendo. */}
                  {/* NEL FLUSSO, non in assoluto: questa scheda ha DUE righe (Sessioni, Ultima)
                      invece di una, e un bottone ancorato in basso a destra ci finiva sopra —
                      visto a schermo. Così scende sotto il testo qualunque sia il numero di righe. */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEdit({ kind: 'pc', name: pc.name, photo: pc.photo }); }}
                      title={pick5(lang,
                        'Registra questo preclear — poi si modifica e si elimina come gli altri',
                        'Enregistrer ce préclair — ensuite il se modifie et se supprime comme les autres',
                        'Register this preclear — then it edits and deletes like the others',
                        'Registrar este preclear — luego se modifica y elimina como los demás',
                        'Registrera denna preclear — sedan ändras och tas den bort som de andra')}
                      style={{ height: 26, padding: '0 9px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 5,
                               border: `1px solid ${AMBER}66`, background: `${AMBER}1f`, color: AMBER, cursor: 'pointer',
                               fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em' }}>
                      <Pencil size={12} /> {L('REGISTRA', 'ENREGISTRER', 'REGISTER', 'REGISTRAR', 'REGISTRERA')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <div onClick={() => setEdit({ kind: 'pc', name: '' })} style={addCard('pc')}>
            <Plus size={36} strokeWidth={1.4} /><div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.16em', marginTop: 6 }}>{L('NUOVO PRECLEAR', 'NOUVEAU PRÉCLAIR', 'NEW PRECLEAR', 'NUEVO PRECLEAR', 'NY PRECLEAR')}</div>
          </div>
        </div>
      </div>

      {/* ── inline create/edit overlay ── */}
      {edit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: LAYER.sessionTop, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 420, borderRadius: 18, padding: 26, background: 'linear-gradient(160deg, rgba(40,40,46,0.96), rgba(26,26,30,0.94))', border: '1.5px solid rgba(255,255,255,0.18)', boxShadow: '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.16em', color: 'rgba(240,246,255,0.92)', marginBottom: 18 }}>
              {edit.id ? L('MODIFICA', 'MODIFIER', 'EDIT', 'MODIFICAR', 'ÄNDRA') : L('NUOVO', 'NOUVEAU', 'NEW', 'NUEVO', 'NY')} · {edit.kind === 'pc' ? L('PRECLEAR', 'PRÉCLAIR', 'PRECLEAR', 'PRECLEAR', 'PRECLEAR') : 'AUDITEUR'}
            </div>
            {/* photo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 140, height: 140, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.5)', background: '#26262b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {camOn
                  ? <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : edit.photo ? <img src={edit.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (edit.kind === 'pc' ? <UserRound size={50} style={{ color: 'rgba(200,214,234,0.5)' }} /> : <Eye size={50} style={{ color: 'rgba(200,214,234,0.5)' }} />)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* CONN-101: Import is the primary, prominent way to add a photo. */}
                <button onClick={() => fileRef.current?.click()} style={{ ...btn('#e6ecf5'), padding: '10px 18px', fontSize: 13 }}>
                  <Upload size={16} /> {L('Importa foto', 'Importer une photo', 'Import photo', 'Importar foto', 'Importera foto')}
                </button>
                {camOn
                  ? <button onClick={capture} style={btn('#e6ecf5')}><Check size={15} /> {L('Cattura', 'Capturer', 'Capture', 'Capturar', 'Ta bild')}</button>
                  : <button onClick={startCam} style={btn('#94a3b8')}><Camera size={15} /> {L('Camera', 'Caméra', 'Camera', 'Cámara', 'Kamera')}</button>}
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              </div>
            </div>
            {/* name */}
            <input autoFocus value={edit.name} onChange={e => setEdit(p => p ? { ...p, name: e.target.value } : p)}
              placeholder={L('Nome', 'Nom', 'Name', 'Nombre', 'Namn')} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
              style={{ width: '100%', marginTop: 18, padding: '11px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(240,246,255,0.95)', fontSize: 15, outline: 'none' }} />
            {/* SEX — drives the Tone-Arm clear baseline (man = 3, woman = 2). For the PC
                always; for the AUDITOR it is used in SOLO sessions (auditor = preclear). */}
            {(
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,214,234,0.6)', marginBottom: 7 }}>
                  {edit.kind === 'auditor'
                    ? L('Sesso · base TA (solo)', 'Sexe · base TA (solo)', 'Sex · TA baseline (solo)', 'Sexo · base TA (solo)', 'Kön · TA-bas (solo)')
                    : L('Sesso · base TA del clear', 'Sexe · base TA du clear', 'Sex · TA clear baseline', 'Sexo · base TA del clear', 'Kön · TA-bas för clear')}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['m', L('Uomo', 'Homme', 'Man', 'Hombre', 'Man'), '3'], ['f', L('Donna', 'Femme', 'Woman', 'Mujer', 'Kvinna'), '2']] as const).map(([val, lbl, ta]) => {
                    const on = edit.sex === val;
                    return (
                      <button key={val} onClick={() => setEdit(p => p ? { ...p, sex: val } : p)}
                        style={{ flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          border: `1px solid ${on ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)'}`,
                          background: on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
                          color: on ? 'rgba(240,246,255,0.95)' : 'rgba(200,214,234,0.6)' }}>
                        {lbl} <span style={{ fontSize: 11, opacity: 0.7, fontFamily: 'monospace' }}>· TA {ta}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeEdit} style={{ ...btn('#94a3b8'), flex: 1, justifyContent: 'center' }}>{L('Annulla', 'Annuler', 'Cancel', 'Cancelar', 'Avbryt')}</button>
              <button onClick={saveEdit} disabled={!edit.name.trim()} style={{ ...btn('#e6ecf5'), flex: 1, justifyContent: 'center', opacity: edit.name.trim() ? 1 : 0.4 }}>{L('Salva', 'Enregistrer', 'Save', 'Guardar', 'Spara')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
    border: `1px solid ${color}66`, background: `${color}1f`, color, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' };
}
