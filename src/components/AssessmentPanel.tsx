import React from 'react';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { useUiStore } from '../store/uiStore';
import { glassSurface } from '../ui/panel3d';

/**
 * AssessmentPanel — le module ASSESSMENT (ex « R&I Validation »). L'auditeur donne les items à voix
 * haute via le bouton ASSESSMENT ; les mots s'inscrivent AUTOMATIQUEMENT ici avec leur READ et
 * RESTENT toute la séance (demande utilisateur). PLUS de zone de saisie manuelle (« + »). Lecture
 * seule. « NULL » = aucune réaction. La liste sous l'arc, elle, est éphémère (disparaît 5 s après).
 */
interface AssessmentItem { id: string; time: number; item: string; reaction: string; beforeMs?: number; }
interface AssessmentPanelProps {
  items:    AssessmentItem[];
  onHide:   () => void;
  t:        (key: string) => string;
  readMeta: (reaction: string) => { short: string; color: string; border: string };
}

export function AssessmentPanel({ items, onHide, t, readMeta }: AssessmentPanelProps) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  // Collassabile: chiuso di default (solo header), si espande a richiesta.
  const [collapsed, setCollapsed] = React.useState(true);

  return (
    <div
      className={`p-2 flex flex-col gap-1.5 ${collapsed ? '' : 'flex-[2] min-h-[220px]'}`}
      style={{
        ...glassSurface('right', isLightTheme, true),
        boxShadow: !collapsed ? (isLightTheme ? '0 16px 34px rgba(38,40,48,0.20), inset 0 1px 0 rgba(255,255,255,0.5)' : '0 16px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)') : undefined,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b pb-1"
        style={{ borderColor: isLightTheme ? 'rgba(60,64,72,0.18)' : 'rgba(255,255,255,0.10)' }}
      >
        <span className={`text-xs uppercase tracking-wider ${collapsed ? (isLightTheme ? 'text-slate-400' : 'text-white/35') : (isLightTheme ? 'text-slate-700' : 'text-white/80')}`}>
          ASSESSMENT{items.length > 0 ? ` · ${items.length}` : ''}
        </span>
        <GlassCollapseToggle on={!collapsed} onToggle={() => setCollapsed(c => !c)} />
        {void onHide}
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-0">
          {items.length === 0 && (
            <span className="text-[11px] italic py-1" style={{ color: isLightTheme ? '#94a3b8' : 'rgba(255,255,255,0.4)' }}>
              {t('assessment_empty')}
            </span>
          )}
          {[...items].reverse().map((a) => {   // DERNIÈRE parole prononcée = EN HAUT (demande user)
            const m = readMeta(a.reaction);
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded"
                style={{
                  background:  isLightTheme ? 'rgba(226,232,240,0.7)' : 'rgba(255,255,255,0.05)',
                  border:      `1px solid ${m.border}`,
                }}
              >
                <span className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-[10px] shrink-0" style={{ color: isLightTheme ? '#94a3b8' : 'rgba(255,255,255,0.4)' }}>
                    [{a.time.toFixed(0)}s]
                  </span>
                  <span className="text-[13px] font-mono truncate" style={{ color: isLightTheme ? '#0f172a' : 'rgba(255,255,255,0.92)' }}>
                    {a.item}
                  </span>
                </span>
                <span className="text-[13px] font-mono font-bold shrink-0 flex items-baseline gap-1" style={{ color: m.color }}>
                  {m.short}
                  {a.reaction !== 'NULL' && a.reaction !== '⏳' && a.beforeMs ? (
                    <span className="text-[10px] font-normal" style={{ color: isLightTheme ? '#64748b' : 'rgba(255,255,255,0.5)' }}>−{a.beforeMs}ms</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
