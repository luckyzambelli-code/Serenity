import React from 'react';
import { LAYER } from "../ui/layers";

/**
 * CONN-106/107: Aurora background — slow-drifting blurred colour blobs over a
 * base gradient, plus a fine film-grain overlay. Purpose: give the frosted-glass
 * panels something to refract → a real sense of transparency, futuristic but calm.
 * Pointer-transparent, sits behind all content. Motion is gentle (24–44s) and
 * freezes under prefers-reduced-motion.
 *
 *  - variant="dark"  : deep navy base, cyan/violet/blue/teal blobs (dark theme).
 *  - variant="light" : "Cool Slate" — cool light slate-blue base with blue/indigo/
 *                      cyan blobs at a touch higher opacity → more depth, still readable.
 *
 * Rendered only when no custom wallpaper is set (App gates it).
 */
export function AuroraBackground({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const light = variant === 'light';
  const base = light
    ? 'linear-gradient(160deg, #e9f0f8 0%, #dde7f3 60%, #d6e1f0 100%)'
    : 'radial-gradient(ellipse at center, #0a1430 0%, #040a1c 55%, #000510 100%)';

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: LAYER.background, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: base }} />

      <div className={`sm-aur sm-aur1 ${light ? 'lt' : ''}`} />
      <div className={`sm-aur sm-aur2 ${light ? 'lt' : ''}`} />
      <div className={`sm-aur sm-aur3 ${light ? 'lt' : ''}`} />
      <div className={`sm-aur sm-aur4 ${light ? 'lt' : ''}`} />

      {/* Film grain — kills banding, adds a frosted texture. Lighter blend on light. */}
      <div style={{
        position: 'absolute', inset: 0, opacity: light ? 0.03 : 0.045,
        mixBlendMode: light ? 'multiply' : 'overlay',
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
      }} />

      <style>{`
        .sm-aur { position:absolute; border-radius:50%; filter:blur(90px); will-change:transform; }
        .sm-aur.lt { filter:blur(100px); }
        /* dark palette */
        .sm-aur1 { width:640px; height:640px; left:-80px;  top:-120px;  background:rgba(34,211,238,0.20);
                   animation: smAurA 30s ease-in-out infinite; }
        .sm-aur2 { width:560px; height:560px; right:-60px; top:60px;     background:rgba(124,58,237,0.20);
                   animation: smAurB 38s ease-in-out infinite; }
        .sm-aur3 { width:620px; height:520px; left:30%;   bottom:-160px; background:rgba(30,90,200,0.22);
                   animation: smAurA 34s ease-in-out infinite reverse; }
        .sm-aur4 { width:420px; height:420px; left:46%;   top:30%;       background:rgba(16,185,129,0.10);
                   animation: smAurB 44s ease-in-out infinite; }
        /* light "Cool Slate" palette — blue/indigo/cyan, a touch more present */
        .sm-aur1.lt { width:660px; height:660px; left:-70px;  top:-150px;  background:rgba(59,130,246,0.16); }
        .sm-aur2.lt { width:560px; height:560px; right:-50px; top:30px;     background:rgba(99,102,241,0.14); }
        .sm-aur3.lt { width:600px; height:520px; left:34%;    bottom:-170px;background:rgba(34,211,238,0.13); }
        .sm-aur4.lt { width:420px; height:420px; left:48%;    top:28%;      background:rgba(96,165,250,0.09); }
        @keyframes smAurA {
          0%   { transform: translate(0,0)        scale(1);    }
          50%  { transform: translate(70px,46px)  scale(1.14); }
          100% { transform: translate(0,0)        scale(1);    }
        }
        @keyframes smAurB {
          0%   { transform: translate(0,0)         scale(1);    }
          50%  { transform: translate(-58px,38px)  scale(1.10); }
          100% { transform: translate(0,0)         scale(1);    }
        }
        @media (prefers-reduced-motion: reduce) {
          .sm-aur { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
