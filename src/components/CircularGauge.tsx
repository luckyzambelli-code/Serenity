import React from 'react';
import { motion } from 'framer-motion';

/**
 * CircularGauge — anneau de progression circulaire rendu EN PERSPECTIVE (comme la référence) :
 * le PLAN de l'anneau est incliné en 3D (rotateX) → il apparaît comme une ellipse vue de biais,
 * tandis que le NOMBRE central reste DROIT face au lecteur (comme « 58 / PERCENT » sur la photo).
 *
 *  • track #2B2B2B + arc blanc #FFFFFF (bouts arrondis), départ 12 h, sens horaire ;
 *  • numéros d'échelle fins/faibles, sur le plan incliné (donc en perspective, suivant l'anneau) ;
 *  • nombre central Inter ExtraBold très grand + libellé (majuscules, fin, espacé, ~80%).
 *
 * SVG + Framer Motion. PRÉSENTATION SEULE : on affiche la valeur reçue (BPM), aucun calcul.
 */
export function CircularGauge({
  value,
  label = 'BPM',
  max = 200,
  tickStep = 20,
  tiltDeg = 54,
}: {
  value: number | null;
  label?: string;
  max?: number;
  tickStep?: number;
  tiltDeg?: number;
}) {
  const has = value != null && isFinite(value);
  const v = has ? Math.max(0, Math.min(max, value as number)) : 0;
  const frac = max > 0 ? v / max : 0;

  const CENTER = 100;
  const R = 74;
  const SW = 9;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - frac);

  const labels: number[] = [];
  for (let n = 0; n < max; n += tickStep) labels.push(n);

  return (
    <div className="relative w-full h-full" style={{ perspective: 620 }}>
      {/* ── PLAN DE L'ANNEAU (incliné en perspective) ── */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ transform: `rotateX(${tiltDeg}deg)`, transformOrigin: '50% 50%' }}
      >
        {/* Track */}
        <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="#2B2B2B" strokeWidth={SW} />

        {/* Arc de progression (12 h, horaire, bouts arrondis) */}
        {has && (
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r={R}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={C}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            initial={false}
            animate={{ strokeDashoffset: offset }}
            transition={{ type: 'spring', stiffness: 110, damping: 20 }}
          />
        )}

        {/* Numéros d'échelle (sur le plan incliné → en perspective, suivant la courbure) */}
        {labels.map((n) => {
          const deg = (n / max) * 360;
          return (
            <g key={n} transform={`rotate(${deg} ${CENTER} ${CENTER})`}>
              <text
                x={CENTER}
                y={CENTER - (R + 13)}
                fill="rgba(255,255,255,0.38)"
                fontSize="8"
                fontWeight="300"
                fontFamily="'Inter', system-ui, sans-serif"
                textAnchor="middle"
              >
                {n}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── TEXTE CENTRAL (droit, face au lecteur) ── */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Fond neutre derrière/autour du nombre → masque la partie de l'anneau qui passe
              derrière, le chiffre reste lisible. Fond dégradé vers transparent (soft). */}
          <radialGradient id="cg-num-bg" cx="50%" cy="48%" r="58%">
            <stop offset="0%" stopColor="#26262b" stopOpacity="0.95"/>
            <stop offset="62%" stopColor="#26262b" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#26262b" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <ellipse cx={CENTER} cy={94} rx={56} ry={46} fill="url(#cg-num-bg)" />
        <text
          x={CENTER}
          y={90}
          fill="#FFFFFF"
          fontSize="50"
          fontWeight="800"
          fontFamily="'Inter', system-ui, Arial, sans-serif"
          textAnchor="middle"
          letterSpacing="-1"
        >
          {has ? Math.round(v) : '--'}
        </text>
        <text
          x={CENTER}
          y={110}
          fill="rgba(255,255,255,0.8)"
          fontSize="11"
          fontWeight="300"
          fontFamily="'Inter', system-ui, Arial, sans-serif"
          letterSpacing="4"
          textAnchor="middle"
        >
          {label.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}
