/**
 * LIGHT_THEME_CSS — les surcharges du THÈME CLAIR pour toute l'interface.
 *
 * Cent lignes de CSS pur qui vivaient au milieu du JSX de App.tsx. Déplacées telles quelles :
 * la feuille reste injectée conditionnellement (`{isLightTheme && <style>…}`), rien n'a changé
 * dans son application — seulement l'endroit où le texte est écrit.
 */
export const LIGHT_THEME_CSS = `
/* ─── BASE TEXT ─── */
[data-theme="light"] body, [data-theme="light"] * { color: #0f172a; }
[data-theme="light"] .text-white { color: #0f172a !important; }
[data-theme="light"] .text-white\\/90 { color: #1e293b !important; }
[data-theme="light"] .text-white\\/80 { color: #1e293b !important; }
[data-theme="light"] .text-white\\/70 { color: #334155 !important; }
[data-theme="light"] .text-white\\/60 { color: #475569 !important; }
[data-theme="light"] .text-white\\/50 { color: #475569 !important; }
[data-theme="light"] .text-white\\/40 { color: #64748b !important; }
[data-theme="light"] .text-white\\/30 { color: #94a3b8 !important; }
[data-theme="light"] .text-white\\/20 { color: #94a3b8 !important; }
[data-theme="light"] .text-slate-100 { color: #0f172a !important; }
[data-theme="light"] .text-slate-200 { color: #1e293b !important; }
[data-theme="light"] .text-slate-300 { color: #334155 !important; }
[data-theme="light"] .text-slate-400 { color: #475569 !important; }
[data-theme="light"] .text-slate-500 { color: #64748b !important; }
[data-theme="light"] .text-slate-600 { color: #475569 !important; }
[data-theme="light"] .text-slate-700 { color: #334155 !important; }
[data-theme="light"] .text-slate-800 { color: #1e293b !important; }

/* ─── CYAN/COLOR TEXT → MONOCHROME SLATE (glass light) ─── */
[data-theme="light"] .text-cyan-200 { color: #475569 !important; }
[data-theme="light"] .text-cyan-300 { color: #334155 !important; }
[data-theme="light"] .text-cyan-400 { color: #1e293b !important; }
[data-theme="light"] .text-cyan-500 { color: #1e293b !important; }
[data-theme="light"] .text-cyan-400\\/80 { color: #334155cc !important; }
[data-theme="light"] .text-cyan-400\\/70 { color: #334155bb !important; }
[data-theme="light"] .text-cyan-400\\/60 { color: #0369a1aa !important; }
[data-theme="light"] .text-emerald-300, [data-theme="light"] .text-emerald-400, [data-theme="light"] .text-green-400 { color: #059669 !important; }
[data-theme="light"] .text-yellow-400, [data-theme="light"] .text-amber-400 { color: #b45309 !important; }
[data-theme="light"] .text-red-400, [data-theme="light"] .text-red-500 { color: #b91c1c !important; }
[data-theme="light"] .text-pink-400 { color: #be185d !important; }
[data-theme="light"] .text-orange-400 { color: #c2410c !important; }

/* ─── BORDERS ─── */
[data-theme="light"] .border-white\\/5,
[data-theme="light"] .border-white\\/10,
[data-theme="light"] .border-white\\/15 { border-color: rgba(100,180,255,0.25) !important; }
[data-theme="light"] .border-white\\/20,
[data-theme="light"] .border-white\\/25 { border-color: rgba(100,180,255,0.35) !important; }
[data-theme="light"] .border-white\\/30,
[data-theme="light"] .border-white\\/40 { border-color: rgba(100,180,255,0.45) !important; }
[data-theme="light"] .border-cyan-300,
[data-theme="light"] .border-cyan-400,
[data-theme="light"] .border-cyan-500 { border-color: rgba(2,132,199,0.55) !important; }
[data-theme="light"] .border-cyan-500\\/40,
[data-theme="light"] .border-cyan-500\\/30 { border-color: rgba(2,132,199,0.40) !important; }
[data-theme="light"] .border-cyan-500\\/20 { border-color: rgba(2,132,199,0.25) !important; }

/* ─── BACKGROUNDS ─── */
[data-theme="light"] .bg-white\\/5  { background: rgba(255,255,255,0.55) !important; }
[data-theme="light"] .bg-white\\/10 { background: rgba(255,255,255,0.70) !important; }
[data-theme="light"] .bg-white\\/15 { background: rgba(255,255,255,0.75) !important; }
[data-theme="light"] .bg-white\\/20 { background: rgba(255,255,255,0.85) !important; }
[data-theme="light"] .bg-black\\/20,
[data-theme="light"] .bg-black\\/30,
[data-theme="light"] .bg-black\\/40,
[data-theme="light"] .bg-black\\/50 { background: rgba(255,255,255,0.55) !important; }
[data-theme="light"] .bg-cyan-500\\/10 { background: rgba(2,132,199,0.10) !important; }
[data-theme="light"] .bg-cyan-500\\/20 { background: rgba(2,132,199,0.18) !important; }
[data-theme="light"] .bg-cyan-500\\/30 { background: rgba(2,132,199,0.25) !important; }
[data-theme="light"] .bg-emerald-500\\/40 { background: rgba(5,150,105,0.30) !important; }

/* ─── INPUTS / BUTTONS ─── */
[data-theme="light"] select,
[data-theme="light"] input[type="text"],
[data-theme="light"] input[type="number"],
[data-theme="light"] input[type="search"],
[data-theme="light"] textarea {
  color: #0f172a !important;
  background: rgba(255,255,255,0.85) !important;
  border-color: rgba(100,180,255,0.45) !important;
}
[data-theme="light"] input::placeholder,
[data-theme="light"] textarea::placeholder { color: #94a3b8 !important; }
[data-theme="light"] button { color: inherit; }

/* ─── PANELS UNIFORMISÉS ─── */
[data-theme="light"] .glass-panel,
[data-theme="light"] [data-light-panel] {
  background: rgba(255,255,255,0.78) !important;
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border: 1px solid rgba(100,180,255,0.32) !important;
  box-shadow: 0 4px 18px rgba(0,80,160,0.10) !important;
  color: #0f172a !important;
}

/* ─── CUSTOM SCROLLBAR ─── */
[data-theme="light"] .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,120,220,0.3); }
[data-theme="light"] .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,80,160,0.05); }

/* ─── GLOW / SHADOWS ─── */
[data-theme="light"] .drop-shadow-md { filter: drop-shadow(0 1px 2px rgba(0,80,160,0.15)) !important; }
[data-theme="light"] [style*="text-shadow"] { text-shadow: none !important; }
`;
