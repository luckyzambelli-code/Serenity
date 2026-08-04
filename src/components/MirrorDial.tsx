import React from 'react';
import { pick5 } from '../i18n5';
import { mirrorOffset } from '../engine/MirrorCycle';

/**
 * MirrorDial — la vue MIRROR (méthode de Ron), modèle demandé par l'utilisateur :
 *   a) CONTACT de la charge de l'ITEM → une VALEUR de 1 à 10 (figée au contact) ;
 *   b) la LIGNE JAUNE = le DOUBLE de cette valeur → LA CIBLE À ATTEINDRE ;
 *   c) cible atteinte → OBTENU ; l'auditeur VALIDE et repart avec un autre item.
 * MÊME cadran que AGO + (la QuantumSphere garde ses réactions) : ce composant est l'ARC
 * concentrique qui REMPLACE le ClearDial. Géométrie identique : viewBox 1600×850, pivot 800,790.
 * Échelle PROPORTIONNELLE (pas de milliohms). Rendu only, aucune DSP.
 */
const PX = 800, PY = 790, SWEEP = 67.5;   // identiques à ClearDial / QuantumSphere
const R = 461;                             // rayon de l'arc (juste dans la bande de l'aiguille, R_IN=494)
const off2ang = (o: number) => 90 - o * SWEEP;
const apt = (ang: number, r: number) => { const a = ang * Math.PI / 180; return { x: PX + r * Math.cos(a), y: PY - r * Math.sin(a) }; };
const arc = (o0: number, o1: number, r: number) => {
  const s = apt(off2ang(o0), r), e = apt(off2ang(o1), r);
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 0 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
};

export function MirrorDial({
  armed, valueR, contactQ, dischargeQ, locked, reached, isLightTheme = false, lang = 'it',
}: {
  /** Valore 1–10 dell'item, RELATIVO all'ambiente (fissato al contatto). */
  armed: boolean; valueR: number; contactQ: number; dischargeQ: number; locked: boolean; reached: boolean;
  isLightTheme?: boolean; lang?: string;
}) {
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);

  const valR = valueR;                              // (a) valore 1–10 (RELATIVO), fissato al contatto
  const doubleR = 2 * valR;                         // (b) le DOUBLE = la cible
  const progress = locked && contactQ > 1e-6 ? Math.min(1, dischargeQ / (2 * contactQ)) : 0;
  const pct = Math.round(progress * 100);

  const ink = isLightTheme ? '#0f172a' : 'rgba(240,246,255,0.95)';
  const dim = isLightTheme ? 'rgba(15,23,42,0.5)' : 'rgba(200,214,234,0.55)';
  const teal = '#34d399';
  const amber = '#fbbf24';

  const PROG_R = 372;                              // anneau de progression vers la cible
  const progEndOff = -1 + progress * 2;

  return (
    <svg viewBox="0 0 1600 850" width="100%" height="100%" style={{ display: 'block', fontFamily: 'var(--font-sans)' }}>
      <defs>
        <filter id="md-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={reached ? teal : amber} floodOpacity="0.8" />
        </filter>
      </defs>

      {/* piste de l'échelle 1–10 (= la quantité de charge de l'item) */}
      <path d={arc(-1, 1, R)} fill="none" stroke={isLightTheme ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.12)'} strokeWidth={10} strokeLinecap="round" />

      {/* graduations 1–10 + doubles (2n). BOLD+teal jusqu'à la VALEUR de l'item. */}
      {Array.from({ length: 10 }, (_, i) => i + 1).map((k) => {
        const off = mirrorOffset(k);
        const hit = armed && locked && k <= valR;
        const t1 = apt(off2ang(off), R + 12), t2 = apt(off2ang(off), R - 12);
        const pn = apt(off2ang(off), R + 46), pd = apt(off2ang(off), R - 44);
        const col = hit ? teal : ink;
        const w = hit ? 700 : 400;
        return (
          <g key={k}>
            <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={isLightTheme ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.35)'} strokeWidth={2} />
            <text x={pn.x.toFixed(1)} y={pn.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={28} fontWeight={w} fill={col}>{k}</text>
            <text x={pd.x.toFixed(1)} y={pd.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={26} fontWeight={w} fill={col}>({k * 2})</text>
          </g>
        );
      })}

      {/* ══ UNA RIGA SOLA — LA VALEUR ET SON DOUBLE SONT AU MÊME ENDROIT ══════════════════
          ⚠️ ERREUR CORRIGÉE (signalée en séance : « on a eu 6 et tu demandes 12, mais tu mets
          la ligne jaune à 20 »).

          Le cadran porte DEUX rangées au MÊME angle : dehors la valeur k (1…10), dedans son
          double (2k) entre parenthèses. Le double de l'item se lit donc à la position de
          l'item — PAS à la position « doubleR » sur la rangée du dessus.

          L'ancien code plaçait la ligne à `mirrorOffset(min(10, doubleR))`, c'est-à-dire qu'il
          lisait le double comme s'il était une valeur de la rangée du DESSUS. Avec un item à 6,
          le double 12 dépassait 10, était rogné à 10 — et la ligne tombait sur la graduation
          dont l'étiquette intérieure dit justement (20). D'où le 20 lu à l'écran.

          Une seule ligne, donc, à la position de l'item, avec les deux chiffres : la valeur
          au-dessus de l'arc, le double à atteindre en dessous. Il n'y a jamais eu deux endroits
          à regarder — il y en avait un, et on en dessinait deux. */}
      {armed && locked && valR > 0.05 && (() => {
        const off = mirrorOffset(valR);
        const a = apt(off2ang(off), R + 30), b = apt(off2ang(off), R - 136);
        const vp = apt(off2ang(off), R + 88);
        const lp = apt(off2ang(off), R - 164);
        return (
          <g filter="url(#md-glow)">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={amber} strokeWidth={4} />
            {/* la VALEUR de l'item, dehors */}
            <text x={vp.x.toFixed(1)} y={vp.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={22} fontWeight={700} fill={ink}>{valR.toFixed(1)}</text>
            {/* le DOUBLE à atteindre, dedans — le vrai chiffre, jamais rogné */}
            <text x={lp.x.toFixed(1)} y={lp.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={20} fontWeight={700} fill={amber}>×2 = {doubleR.toFixed(1)}</text>
          </g>
        );
      })()}

      {/* anneau de PROGRESSION vers la cible (0→100%) */}
      <path d={arc(-1, 1, PROG_R)} fill="none" stroke={isLightTheme ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)'} strokeWidth={14} strokeLinecap="round" />
      {armed && locked && progress > 0.001 && (
        <path d={arc(-1, progEndOff, PROG_R)} fill="none" stroke={teal} strokeWidth={14} strokeLinecap="round"
          opacity={reached ? 1 : 0.92} filter={reached ? 'url(#md-glow)' : undefined} />
      )}

      {/* lecture chiffrée */}
      {armed && !locked && (
        <text x={PX} y={PY - 258} textAnchor="middle" dominantBaseline="middle"
          fontSize={22} fontWeight={700} fill={dim} className="animate-pulse">
          {L('contatto della carica…', 'contact de la charge…', 'contacting the charge…', 'contacto de la carga…', 'kontakt med laddningen…')}
        </text>
      )}
      {armed && locked && (
        <text x={PX} y={PY - 258} textAnchor="middle" dominantBaseline="middle"
          fontSize={26} fontWeight={700} fill={reached ? teal : ink}>
          {valR.toFixed(1)}
          <tspan dx="18">→</tspan>
          <tspan dx="18">×2</tspan>
          {/* il DOPPIO vero, non rognato a 20: se l'item vale 6 il doppio è 12, e 12 va scritto. */}
          <tspan dx="26">{doubleR.toFixed(1)}</tspan>
        </text>
      )}
      {armed && locked && !reached && (
        <text x={PX} y={PY - 228} textAnchor="middle" dominantBaseline="middle"
          fontSize={15} fontWeight={400} fill={dim}>
          {L('valore item → doppio · smaltito', 'valeur item → double · déchargé', 'item value → double · discharged', 'valor ítem → doble · descargado', 'itemvärde → dubbel · urladdat')} {pct}%
        </text>
      )}

      {/* (c) CIBLE ATTEINTE → OBTENU */}
      {armed && reached && (
        <text x={PX} y={PY - 150} textAnchor="middle" fontSize={40} fontWeight={800} letterSpacing="8" fill={teal} filter="url(#md-glow)" className="animate-pulse">
          {L('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT')}
        </text>
      )}
    </svg>
  );
}
