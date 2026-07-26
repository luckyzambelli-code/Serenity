import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Activity, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { SessionSummary, getSessionsByProfile, saveSession, UserProfile, getSessionPdfAsync, deleteSessionPdfAsync, deleteSession } from '../lib/storage';
import { isServerAvailable, serverGetSessions, serverSaveSessions, serverSessionPdfUrl, serverDeleteSession } from '../lib/serverStorage';
import { useI18n } from '../i18n.tsx';
import { Language } from '../i18n';
import { fmtIm } from '../lib/utils';
import { GlassCollapseToggle } from './GlassCollapseToggle';

interface HistoryModalProps {
  activeProfile: UserProfile | null;
  onClose: () => void;
  lang: Language;
}

// ── PDF blob helper ──────────────────────────────────────────────────────────
async function pdfToBlob(pdf: string): Promise<Blob> {
  if (pdf.startsWith('data:')) return fetch(pdf).then(r => r.blob());
  const b64 = pdf.startsWith('base64:') ? pdf.slice(7) : pdf;
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

export function HistoryModal({ activeProfile, onClose, lang }: HistoryModalProps) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [pdfMap, setPdfMap] = useState<Record<string, boolean>>({});
  const [dateFilter, setDateFilter]       = useState('');
  const [pcFilter, setPcFilter]           = useState('');
  const [auditorFilter, setAuditorFilter] = useState('');
  const [processFilter, setProcessFilter] = useState('');
  const [objectiveFilter, setObjectiveFilter] = useState('');
  const [itemFilter, setItemFilter]       = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [selected, setSelected]           = useState<Set<string>>(new Set());

  // Dynamic autocomplete list
  const allItems = useMemo(() => {
    const items: {text: string; date: number}[] = [];
    sessions.forEach(s => {
      (s.riItems || []).forEach(ri => items.push({ text: ri.item, date: s.date }));
      [s.objective, s.processObjective, s.briefing, s.nextCs].forEach(f => {
        if (f?.trim()) items.push({ text: f.trim(), date: s.date });
      });
    });
    const seen = new Set<string>();
    return items.sort((a,b) => b.date - a.date)
      .filter(i => { if (seen.has(i.text)) return false; seen.add(i.text); return true; });
  }, [sessions]);

  useEffect(() => {
    const profileId = activeProfile?.id || '_default';
    // Load local sessions first (instant display)
    const local = getSessionsByProfile(profileId);
    setSessions(local);
    setSelected(new Set());

    // Then merge with server sessions (Chrome ↔ Electron sync)
    (async () => {
      const serverUp = await isServerAvailable();
      if (!serverUp) return;
      try {
        const serverAll = (await serverGetSessions() || []) as SessionSummary[];
        if (serverAll.length === 0) {
          // Server empty → push local data up
          const { getSessions } = await import('../lib/storage');
          const all = getSessions();
          if (all.length > 0) await serverSaveSessions(all as any[]);
          return;
        }
        // Merge: union by session id, server takes priority
        const merged = new Map<string, SessionSummary>();
        local.forEach(s => merged.set(s.id, s));
        serverAll.forEach(s => merged.set(s.id, s)); // server overwrites local for same id
        const mergedArr = Array.from(merged.values())
          .filter(s => !profileId || profileId === '_default' || s.profileId === profileId || !s.profileId)
          .sort((a, b) => b.date - a.date);
        if (mergedArr.length !== local.length) {
          // New sessions from server — save missing ones to localStorage
          const localIds = new Set(local.map(s => s.id));
          serverAll.forEach(s => {
            if (!localIds.has(s.id)) {
              try { saveSession(s); } catch (_) {}
            }
          });
          setSessions(mergedArr);
          console.log('[History] Merged', mergedArr.length, 'sessions (local:', local.length, '+ server:', serverAll.length, ')');
        }
      } catch (e) {
        console.warn('[History] Server merge failed:', e);
      }
    })();
  }, [activeProfile]);

  const filteredSessions = useMemo(() => sessions.filter(s => {
    const iso = new Date(s.date).toISOString().slice(0, 10);
    const aud = (s.auditorName || activeProfile?.name || '').toLowerCase();
    return (
      (!dateFilter || iso === dateFilter) &&
      (!pcFilter || s.pcName.toLowerCase().includes(pcFilter.toLowerCase())) &&
      (!auditorFilter || aud.includes(auditorFilter.toLowerCase())) &&
      (!processFilter || (s.processObjective || '').toLowerCase().includes(processFilter.toLowerCase())) &&
      (!objectiveFilter || (s.objective || '').toLowerCase().includes(objectiveFilter.toLowerCase())) &&
      (!itemFilter || [s.objective, s.processObjective, s.briefing, s.nextCs, s.pcName,
          ...(s.riItems || []).map(r => r.item)]
        .some(f => (f || '').toLowerCase().includes(itemFilter.toLowerCase())))
    );
  }), [sessions, dateFilter, pcFilter, auditorFilter, processFilter, objectiveFilter, itemFilter, activeProfile]);

  // Check which sessions have stored PDFs — local IndexedDB OR server
  useEffect(() => {
    let mounted = true;
    (async () => {
      const serverUp = await isServerAvailable();
      const map: Record<string, boolean> = {};
      await Promise.all(sessions.map(async s => {
        try {
          // 1. Check local IndexedDB first (fast)
          const local = await getSessionPdfAsync(s.id);
          if (local) { map[s.id] = true; return; }
          // 2. Check server API (shared across Chrome + Electron)
          if (serverUp) {
            const resp = await fetch(serverSessionPdfUrl(s.id), { method: 'HEAD' });
            map[s.id] = resp.ok;
          } else {
            map[s.id] = false;
          }
        } catch { map[s.id] = false; }
      }));
      if (mounted) setPdfMap(map);
    })();
    return () => { mounted = false; };
  }, [sessions]);

  const pdfCount   = Object.values(pdfMap).filter(Boolean).length;
  const allSelected = filteredSessions.length > 0 && filteredSessions.every(s => selected.has(s.id));

  const openPdf = async (s: SessionSummary) => {
    // 1. Try local IndexedDB
    const local = await getSessionPdfAsync(s.id);
    if (local) {
      const url = URL.createObjectURL(await pdfToBlob(local));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    // 2. Try server API (shared between Chrome + Electron)
    const serverUp = await isServerAvailable();
    if (serverUp) {
      const resp = await fetch(serverSessionPdfUrl(s.id));
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
    }
    alert('PDF non disponible.');
  };

  const downloadPdf = async (s: SessionSummary) => {
    // Local IndexedDB first; else the server copy (same fallback as openPdf —
    // this path used to alert "non disponible" even when the server had it).
    const pdf = await getSessionPdfAsync(s.id);
    let blob: Blob | null = pdf ? await pdfToBlob(pdf) : null;
    if (!blob && await isServerAvailable()) {
      const resp = await fetch(serverSessionPdfUrl(s.id));
      if (resp.ok) blob = await resp.blob();
    }
    if (!blob) { alert('PDF non disponible.'); return; }
    const d = new Date(s.date);
    const fn = `${(s.pcName||'PC').replace(/\s+/g,'_')}_${d.toISOString().split('T')[0]}_${d.toTimeString().slice(0,8).replace(/:/g,'-')}.pdf`
      .replace(/[^a-zA-Z0-9._-]/g,'_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fn;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const deleteSessionById = async (id: string) => {
    await deleteSessionPdfAsync(id);
    deleteSession(id);
    // Also remove from server so it doesn't re-appear on next merge
    isServerAvailable().then(up => { if (up) serverDeleteSession(id).catch(() => {}); });
    setSessions(getSessionsByProfile(activeProfile?.id || '_default'));
    setPdfMap(prev => { const n = {...prev}; delete n[id]; return n; });
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // ── Input style helper ───────────────────────────────────────────────────
  const inputCls = "bg-white/10 border border-white/25 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-white/55 focus:bg-white/15 placeholder-white/45";

  return (
    <div className="absolute inset-0 z-50 backdrop-blur-md flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.55)' }}>
      <style>{`
        .nest-dark-modal h2 { color: rgba(240,246,255,0.95) !important; text-shadow: 0 0 12px rgba(255,255,255,0.4); }
        .nest-dark-modal label, .nest-dark-modal .text-slate-500, .nest-dark-modal .text-slate-400 { color: rgba(180,210,235,0.65) !important; }
        .nest-dark-modal .text-slate-600, .nest-dark-modal .text-slate-700, .nest-dark-modal .text-slate-800 { color: rgba(220,240,255,0.92) !important; }
        .nest-dark-modal .text-cyan-700, .nest-dark-modal .text-cyan-800 { color: rgba(240,246,255,0.95) !important; }
        .nest-dark-modal .bg-white\\/50, .nest-dark-modal .bg-white\\/55, .nest-dark-modal .bg-white\\/60, .nest-dark-modal .bg-white\\/40, .nest-dark-modal .bg-white\\/30 { background: rgba(255,255,255,0.06) !important; }
        .nest-dark-modal .bg-slate-100, .nest-dark-modal .bg-slate-200, .nest-dark-modal .bg-slate-50 { background: rgba(255,255,255,0.06) !important; }
        .nest-dark-modal .border-slate-200, .nest-dark-modal .border-slate-300, .nest-dark-modal .border-slate-200\\/60, .nest-dark-modal .border-slate-200\\/40 { border-color: rgba(255,255,255,0.25) !important; }
        .nest-dark-modal .border-white\\/60 { border-color: rgba(255,255,255,0.3) !important; }
        .nest-dark-modal input, .nest-dark-modal textarea { color: rgba(220,240,255,0.92) !important; }
        .nest-dark-modal input::placeholder { color: rgba(180,210,235,0.45) !important; }
        .nest-dark-modal .bg-cyan-50 { background: rgba(255,255,255,0.12) !important; }
        .nest-dark-modal .border-cyan-300 { border-color: rgba(255,255,255,0.55) !important; }
        .nest-dark-modal .bg-cyan-100\\/50 { background: rgba(255,255,255,0.18) !important; }
        .nest-dark-modal .bg-red-50, .nest-dark-modal .bg-red-50\\/30 { background: rgba(239,68,68,0.12) !important; }
        .nest-dark-modal .border-red-200, .nest-dark-modal .border-red-400 { border-color: rgba(239,68,68,0.5) !important; }
        .nest-dark-modal .text-red-600, .nest-dark-modal .text-red-700 { color: #fca5a5 !important; }
        .nest-dark-modal .bg-red-100 { background: rgba(239,68,68,0.20) !important; }
        .nest-dark-modal .bg-slate-600, .nest-dark-modal .bg-slate-700 { background: rgba(255,255,255,0.20) !important; }
      `}</style>
      <div className="nest-dark-modal w-full max-w-6xl h-full max-h-[90vh] flex flex-col relative rounded-2xl"
        style={{
          // Fond ÉCLAIRCI (était rgba(28,28,32,0.60) → trop foncé) : charcoal plus clair + opaque.
          background: 'rgba(44,44,50,0.90)',
          backdropFilter: 'blur(24px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)',
          color: 'rgba(220,240,255,0.92)',
        }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between p-5 border-b border-white/40 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-mono text-cyan-700 tracking-widest uppercase">{t('history')}</h2>
            {activeProfile?.photo
              ? <img src={activeProfile.photo} alt={activeProfile.name} className="w-14 h-14 rounded-full object-cover border-2 border-cyan-400" />
              : <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center border-2 border-slate-300"><span className="text-slate-400 text-base font-mono">U</span></div>
            }
            <span className="text-lg font-mono font-semibold text-slate-700">{activeProfile?.name || t('history_no_profile')}</span>
            <span className="text-sm font-mono font-bold text-cyan-700 border-2 border-cyan-300 px-3 py-1 rounded-md bg-cyan-50">
              {sessions.length} {sessions.length === 1 ? t('history_unit_session') : t('history_unit_sessions')} · {pdfCount} PDF
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-mono font-semibold text-slate-700 cursor-pointer select-none px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors">
              <input type="checkbox" checked={allSelected}
                onChange={e => setSelected(e.target.checked ? new Set(filteredSessions.map(s => s.id)) : new Set())}
                className="accent-red-500 w-5 h-5" />
              {t('history_select_all')}
            </label>
            {selected.size > 0 && (
              <button onClick={async () => {
                if (!confirm((t('history_confirm_delete') as string).replace('{count}', String(selected.size)))) return;
                for (const id of selected) await deleteSessionById(id);
                setSelected(new Set());
              }} className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">
                <Trash2 size={12}/> {selected.size}
              </button>
            )}
            <GlassCollapseToggle on onToggle={onClose} title={t('tip_close') as string} />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 font-mono italic">
              <Activity size={48} className="mb-4 opacity-20"/>
              <p>{t('no_history')}</p>
            </div>
          ) : (
            <>
              {/* Recherche / filtres — clairement visibles */}
              <div className="mb-2 flex items-center gap-2 text-white/70">
                <Search size={14} strokeWidth={2} />
                <span className="text-[11px] font-mono uppercase tracking-widest">{lang === 'it' ? 'Ricerca' : lang === 'es' ? 'Búsqueda' : lang === 'sv' ? 'Sök' : lang === 'en' ? 'Search' : 'Recherche'}</span>
                <span className="text-[10px] font-mono text-white/35">· {filteredSessions.length}/{sessions.length}</span>
              </div>
              <div className="mb-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} className={inputCls}/>
                <input type="text" value={pcFilter} onChange={e=>setPcFilter(e.target.value)} placeholder={t('history_filter_pc') as string} className={inputCls}/>
                <input type="text" value={auditorFilter} onChange={e=>setAuditorFilter(e.target.value)} placeholder={t('history_filter_auditor') as string} className={inputCls}/>
                <input type="text" value={processFilter} onChange={e=>setProcessFilter(e.target.value)} placeholder={t('history_filter_process') as string} className={inputCls}/>
                <input type="text" value={objectiveFilter} onChange={e=>setObjectiveFilter(e.target.value)} placeholder={t('history_filter_objective') as string} className={inputCls}/>
                {/* R&I autocomplete */}
                <div className="relative">
                  <input type="text" value={itemFilter}
                    onChange={e => { setItemFilter(e.target.value); setShowItemDropdown(true); }}
                    onFocus={() => setShowItemDropdown(true)}
                    onBlur={() => setTimeout(() => setShowItemDropdown(false), 150)}
                    placeholder={t('history_filter_item') as string} className={`w-full ${inputCls}`}/>
                  {showItemDropdown && (() => {
                    const filtered = allItems.filter(i => !itemFilter || i.text.toLowerCase().includes(itemFilter.toLowerCase()));
                    if (!filtered.length) return null;
                    return (
                      <div className="absolute z-50 w-full mt-0.5 rounded border border-slate-300 shadow-lg max-h-48 overflow-y-auto" style={{background:'white'}}>
                        {filtered.map((item, i) => (
                          <button key={i} onMouseDown={() => { setItemFilter(item.text); setShowItemDropdown(false); }}
                            className="w-full text-left px-2 py-1.5 text-xs font-mono text-slate-700 hover:bg-cyan-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-2">
                            <span className="truncate flex-1">{item.text}</span>
                            <span className="text-[9px] text-slate-400 flex-none">{new Date(item.date).toLocaleDateString()}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {filteredSessions.length === 0 && (
                <div className="mb-4 text-center text-xs font-mono text-slate-500">{t('history_no_results')}</div>
              )}

              {/* ── Session Cards ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSessions.map(session => {
                  const isExpanded = expandedId === session.id;
                  const totalTa   = (session as any).totalTa as number | undefined;
                  const riItems   = session.riItems || [];
                  // Coherent mass readings (presence vs release). Older sessions
                  // (pre-fix) lack these → the block is simply hidden for them.
                  const massSec = (session as any).massTime as number | undefined;
                  const dissSec = (session as any).dissolutionTime as number | undefined;
                  const hasMass = typeof massSec === 'number' && massSec > 0;
                  // By charge quantity when saved (newer sessions), else time ratio.
                  const pctMass = (session as any).dissolvedPctMass as number | undefined;
                  const dissPct = pctMass != null ? pctMass : (hasMass ? Math.round(((dissSec || 0) / massSec!) * 100) : 0);
                  const fmtMS = (s: number) => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
                  // ZONES AS-IS extras (older sessions may lack them).
                  const peakIm = (session as any).peakIm as number | undefined;
                  const avgRelVel = (session as any).avgReleaseVel as number | undefined;
                  // Compact, all-ASCII (see fmtIm) — keeps the value a single token.
                  const imStr = fmtIm(peakIm);
                  const velStr = fmtIm(avgRelVel && avgRelVel > 0 ? avgRelVel * 1000 : 0);
                  // ZONES AS-IS now shows mass QUANTITY (Σ qL·dt); older sessions
                  // without it fall back to the time durations.
                  const massQ = (session as any).massChargeQ as number | undefined;
                  const dissQ = (session as any).dissChargeQ as number | undefined;
                  const massStr = massQ != null ? fmtIm(massQ) : (hasMass ? fmtMS(massSec!) : '—');
                  const dissStr = dissQ != null ? fmtIm(dissQ) : fmtMS(dissSec || 0);

                  return (
                    <div key={session.id}
                      className={`bg-white/55 border rounded-xl shadow-sm transition-all ${selected.has(session.id) ? 'border-red-400 bg-red-50/30' : 'border-white/60 hover:border-cyan-300'}`}>

                      {/* ── Card header ── */}
                      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-slate-200/60 flex-wrap">
                        <input type="checkbox" checked={selected.has(session.id)}
                          onChange={e => { const n = new Set(selected); e.target.checked ? n.add(session.id) : n.delete(session.id); setSelected(n); }}
                          className="accent-red-500 w-3.5 h-3.5 flex-none"/>
                        <Calendar size={12} className="text-slate-400 flex-none"/>
                        <span className="text-slate-700 font-mono text-xs">{new Date(session.date).toLocaleDateString()}</span>
                        <Clock size={12} className="text-slate-400 flex-none"/>
                        <span className="text-slate-600 font-mono text-xs">{new Date(session.date).toLocaleTimeString()}</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 bg-white/60 rounded text-slate-600 border border-slate-200">
                          {Math.floor(session.duration/60)}m {session.duration%60}s
                        </span>
                        <div className="ml-auto flex items-center gap-1.5 flex-none">
                          {pdfMap[session.id] && (
                            <>
                              <button onClick={() => openPdf(session)}
                                title={t('tip_view_report') as string}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-slate-700 text-slate-100 rounded-lg hover:bg-slate-600 border border-slate-500 shadow-sm transition-colors">
                                👁 View
                              </button>
                              <button onClick={() => downloadPdf(session)}
                                title={t('tip_download_pdf') as string}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-cyan-700 text-white rounded-lg hover:bg-cyan-600 border border-cyan-500 shadow-sm transition-colors">
                                ⬇ PDF
                              </button>
                            </>
                          )}
                          <button onClick={async e => { e.stopPropagation(); if (confirm('Supprimer cette session ?')) await deleteSessionById(session.id); }}
                            title={t('tip_delete') as string}
                            className="flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 border border-red-200 shadow-sm transition-colors">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </div>

                      {/* ── PC + Auditor ── */}
                      <div className="grid grid-cols-2 gap-2 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {session.pcPhoto
                            ? <img src={session.pcPhoto} alt="PC" className="w-8 h-8 rounded-full object-cover border border-slate-300"/>
                            : <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300"><span className="text-slate-400 text-[9px] font-mono">PC</span></div>}
                          <div>
                            <div className="text-[8px] text-slate-500 uppercase">{t('pc_name')}</div>
                            <div className="text-xs font-mono text-green-700 leading-tight">
                              {session.pcName} {session.isSolo && <span className="text-yellow-600 text-[8px]">SOLO</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(session.auditorPhoto || activeProfile?.photo)
                            ? <img src={session.auditorPhoto || activeProfile?.photo} alt="Aud" className="w-8 h-8 rounded-full object-cover border border-slate-300"/>
                            : <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300"><span className="text-slate-400 text-[9px] font-mono">AUD</span></div>}
                          <div>
                            <div className="text-[8px] text-slate-500 uppercase">{t('auditor_label')}</div>
                            <div className="text-xs font-mono text-cyan-700 leading-tight">{session.auditorName || activeProfile?.name || '—'}</div>
                          </div>
                        </div>
                      </div>

                      {/* ── Core stats ── */}
                      <div className="grid grid-cols-4 gap-1 mx-3 mb-2 bg-white/40 p-2 rounded border border-slate-200/60">
                        <div className="flex flex-col items-center text-center">
                          <span className="text-[8px] text-slate-500 uppercase">{t('mass_label')}</span>
                          <span className="text-sm font-mono text-slate-800">{session.mass.toFixed(1)}</span>
                          <span className="text-[8px] text-slate-400">SOL-km</span>
                        </div>
                        <div className="flex flex-col items-center text-center border-l border-slate-200">
                          <span className="text-[8px] text-slate-500 uppercase">F/N</span>
                          <span className="text-sm font-mono text-green-600">{session.fnCount}</span>
                        </div>
                        <div className="flex flex-col items-center text-center border-l border-slate-200">
                          <span className="text-[8px] text-slate-500 uppercase">{t('total_ta_short')}</span>
                          <span className="text-sm font-mono text-amber-600">{totalTa !== undefined ? totalTa.toFixed(1) : '—'}</span>
                        </div>
                        <div className="flex flex-col items-center text-center border-l border-slate-200">
                          <span className="text-[8px] text-slate-500 uppercase">R&amp;I</span>
                          <span className="text-sm font-mono text-purple-600">{riItems.length}</span>
                        </div>
                      </div>

                      {/* ── Mass contacted vs dissolved (coherent) ── */}
                      {hasMass && (
                        <div className="mx-3 mb-2">
                          <div className="flex justify-between text-[9px] font-mono mb-0.5">
                            <span style={{color:'#fb5e3b'}}>Mass {massStr}</span>
                            <span style={{color:'#10b981'}}>Diss. {dissStr} · {dissPct}%</span>
                          </div>
                          <div className="flex h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(251,94,59,0.3)' }}>
                            <div style={{ width: `${dissPct}%`, background: '#10b981' }} title={`${dissPct}% ${t('tip_discharged')}`} />
                          </div>
                        </div>
                      )}

                      {/* ── EP status ── */}
                      {session.epValidated && (
                        <div className="mx-3 mb-2 text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                          ✓ EP Validé
                        </div>
                      )}

                      {/* ── Expand toggle ── */}
                      <button onClick={() => setExpandedId(isExpanded ? null : session.id)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono text-slate-500 hover:text-cyan-600 border-t border-slate-200/60 transition-colors">
                        <span>{t('history_briefing_details')}</span>
                        {isExpanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                      </button>

                      {/* ── Expanded section ── */}
                      {isExpanded && (
                        <div className="px-3 pb-3 flex flex-col gap-2">
                          {/* Briefing fields */}
                          {[
                            { label: t('history_objective_session') as string,  value: session.objective },
                            { label: t('history_objective_process') as string, value: session.processObjective },
                            { label: t('history_physical_state') as string,     value: (session as any).physicalCheck },
                            { label: t('history_rfactor_briefing') as string,   value: session.briefing },
                            { label: t('history_next_cs') as string,            value: session.nextCs },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
                              <div className="text-[11px] font-mono text-slate-700 bg-white/50 rounded px-2 py-1 border border-slate-200/60 min-h-[24px]">
                                {value || <span className="text-slate-400 italic">—</span>}
                              </div>
                            </div>
                          ))}

                          {/* R&I items list */}
                          {riItems.length > 0 && (
                            <div>
                              <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">{t('history_ri_items')} ({riItems.length})</div>
                              <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                                {riItems.map((ri, i) => (
                                  <div key={i} className="flex gap-2 text-[10px] font-mono bg-white/40 rounded px-2 py-0.5 border border-slate-200/40">
                                    <span className="text-slate-400 flex-none">[{ri.time.toFixed(0)}s]</span>
                                    <span className="text-slate-700 flex-1 truncate">{ri.item}</span>
                                    <span className="text-green-600 flex-none">{ri.reaction}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ZONES AS-IS — CONTACT (time + I_m) → DISCHARGE (time + v̄)
                              → AS-IS (% dissolved) */}
                          {hasMass && (
                            <div>
                              <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">ZONES AS-IS</div>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between bg-white/40 rounded border border-slate-200/40 px-2 py-1">
                                  <span className="flex items-center gap-1.5 text-[10px] font-mono" style={{color:'#fb5e3b'}}>
                                    <span className="w-2 h-2 rounded-full inline-block" style={{background:'#fb5e3b'}}/>CONTACT
                                  </span>
                                  <span className="text-[11px] font-mono font-bold" style={{color:'#fb5e3b'}}>{massStr} <span className="opacity-70 font-normal">· I_m {imStr}</span></span>
                                </div>
                                <div className="flex items-center justify-between bg-white/40 rounded border border-slate-200/40 px-2 py-1">
                                  <span className="flex items-center gap-1.5 text-[10px] font-mono" style={{color:'#10b981'}}>
                                    <span className="w-2 h-2 rounded-full inline-block" style={{background:'#10b981'}}/>DISCHARGE
                                  </span>
                                  <span className="text-[11px] font-mono font-bold" style={{color:'#10b981'}}>{dissStr} <span className="opacity-70 font-normal">· v̄ {velStr}</span></span>
                                </div>
                                <div className="flex items-center justify-between bg-white/40 rounded border border-slate-200/40 px-2 py-1">
                                  <span className="flex items-center gap-1.5 text-[10px] font-mono" style={{color:'rgba(240,246,255,0.95)'}}>
                                    <span className="w-2 h-2 rounded-full inline-block" style={{background:'rgba(240,246,255,0.95)'}}/>AS-IS
                                  </span>
                                  <span className="text-[11px] font-mono font-bold" style={{color:'rgba(240,246,255,0.95)'}}>{dissPct}% dissoute</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
