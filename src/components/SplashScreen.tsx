import React, { useEffect, useRef, useState } from 'react';
import { creditLines, creditCopyright } from '../credits';
import { useI18n } from '../i18n';
import { LAYER } from "../ui/layers";

interface SplashScreenProps { onDismiss: () => void; }

export function SplashScreen({ onDismiss }: SplashScreenProps) {
  const [visible, setVisible]   = useState(true);  // opaque from first frame → blocks interface
  const [closing, setClosing]   = useState(false);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const animRef      = useRef<number>(0);
  const t0           = useRef(Date.now());
  const bodyImgRef   = useRef<HTMLImageElement | null>(null);
  const logoImgRef   = useRef<HTMLImageElement | null>(null);
  // Stable ref so timers are never reset by App re-renders
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
  // La boucle de dessin est montée UNE fois : la langue passe par une ref pour que les
  // crédits suivent la langue choisie sans jamais relancer l'animation.
  const { lang } = useI18n();
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  useEffect(() => {
    const img = new Image();
    img.src = '/body-wireframe.png';
    img.onload = () => { bodyImgRef.current = img; };
    const logo = new Image();
    logo.src = '/logo-alt-scientology.png';
    logo.onload = () => { logoImgRef.current = logo; };
  }, []);

  // Timer set ONCE at mount — stable regardless of App re-renders
  // Splash duration: 3 s of animation + 0.8 s of dismiss transition.
  useEffect(() => {
    const b = setTimeout(() => setClosing(true), 3000);
    const c = setTimeout(() => onDismissRef.current(), 3800);
    return () => { clearTimeout(b); clearTimeout(c); };
  }, []);  

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // ── Particle network ────────────────────────────────────────────────────────
    type Pt = { x: number; y: number; vx: number; vy: number; r: number };
    const nodes: Pt[] = Array.from({ length: 38 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00018,
      r: 1.5 + Math.random() * 1.5,
    }));
    let bpm = 68;

    // ── Brain neural sphere ──────────────────────────────────────────────────────
    const drawBrain = (cx: number, cy: number, r: number, t2: number) => {
      ctx.save();
      const pulse = 0.92 + 0.08 * Math.sin(t2 * 3.2);
      for (let gi = 3; gi >= 1; gi--) {
        const gr2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse * (1 + gi * 0.25));
        gr2.addColorStop(0, `rgba(255,255,255,${0.08 / gi})`);
        gr2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath(); ctx.arc(cx, cy, r * pulse * (1 + gi * 0.25), 0, Math.PI * 2);
        ctx.fillStyle = gr2; ctx.fill();
      }
      const sf = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r * pulse);
      sf.addColorStop(0, 'rgba(255,255,255,0.35)');
      sf.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.beginPath(); ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = sf; ctx.fill();
      for (let li = 0; li < 5; li++) {
        const ang = t2 * 0.6 + li * (Math.PI / 5);
        const cosA = Math.cos(ang);
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(cosA) * r * pulse, r * pulse, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${cosA > 0 ? cosA * 0.35 : Math.abs(cosA) * 0.08})`;
        ctx.lineWidth = 0.7; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.5; ctx.shadowColor = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 10;
      ctx.stroke(); ctx.shadowBlur = 0;
      for (let ni = 0; ni < 8; ni++) {
        const na = t2 * (0.4 + ni * 0.07) + ni * 0.8;
        const nx = cx + Math.cos(na) * r * 0.5 * pulse;
        const ny = cy + Math.sin(na) * r * 0.4 * pulse;
        ctx.beginPath(); ctx.arc(nx, ny, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 5;
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.5; ctx.stroke();
      }
      ctx.restore();
    };

    // ── Main draw loop ────────────────────────────────────────────────────────────
    const draw = () => {
      const now = Date.now();
      const t   = (now - t0.current) / 1000;
      const W   = canvas.width;
      const H   = canvas.height;
      const cx  = W / 2;
      const cy  = H / 2;

      bpm = 68 + Math.sin(t * 0.24) * 5;

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > 1) n.vx *= -1;
        if (n.y < 0 || n.y > 1) n.vy *= -1;
      });

      ctx.clearRect(0, 0, W, H);

      // Fond CHARCOAL (même famille que l'app maintenant) — plus de bleu-nuit.
      const bg = ctx.createRadialGradient(cx, cy * 0.6, 0, cx, cy, Math.max(W, H));
      bg.addColorStop(0,   '#2e2e33');
      bg.addColorStop(0.45, '#232328');
      bg.addColorStop(1,   '#161619');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.lineWidth = 0.4;
      for (let x = 0; x < W; x += 44) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.stroke();
      }
      for (let y = 0; y < H; y += 44) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.stroke();
      }

      // Floor perspective
      ctx.save();
      for (let fi = 0; fi < 8; fi++) {
        const fy = H * 0.85 + fi * H * 0.02;
        ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy);
        ctx.strokeStyle = `rgba(255,255,255,${0.03 + fi * 0.005})`;
        ctx.lineWidth = 0.4; ctx.stroke();
      }
      for (let pi = 0; pi <= 10; pi++) {
        const px2 = (pi / 10) * W;
        ctx.beginPath(); ctx.moveTo(px2, H * 0.85); ctx.lineTo(cx, H * 0.55);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.stroke();
      }
      ctx.restore();

      // Particle network
      ctx.save();
      const LINK_DIST = 0.18;
      nodes.forEach((a, i) => {
        nodes.slice(i + 1).forEach(b => {
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            ctx.beginPath();
            ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H);
            ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / LINK_DIST) * 0.10})`;
            ctx.lineWidth = 0.5; ctx.stroke();
          }
        });
        ctx.beginPath(); ctx.arc(a.x * W, a.y * H, a.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      });
      ctx.restore();

      // Figure dimensions
      const figH   = Math.min(H * 0.72, 500);
      const figTop = cy - figH * 0.40;
      const scanY  = figTop + (0.5 + 0.5 * Math.sin(t * 0.9)) * figH;

      // Body image
      const imgW = figH * 0.52;
      const imgX = cx - imgW / 2;
      if (bodyImgRef.current) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.35)'; ctx.shadowBlur = 18;
        ctx.globalAlpha = 0.92;
        ctx.drawImage(bodyImgRef.current, imgX, figTop, imgW, figH);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Scan line
      {
        const hw = imgW * 0.52;
        const scanGrad = ctx.createLinearGradient(cx - hw - 10, 0, cx + hw + 10, 0);
        scanGrad.addColorStop(0,   'rgba(255,255,255,0)');
        scanGrad.addColorStop(0.2, 'rgba(255,255,255,0.5)');
        scanGrad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
        scanGrad.addColorStop(0.8, 'rgba(255,255,255,0.5)');
        scanGrad.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.beginPath(); ctx.moveTo(cx - hw - 10, scanY); ctx.lineTo(cx + hw + 10, scanY);
        ctx.strokeStyle = scanGrad; ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 14;
        ctx.stroke(); ctx.shadowBlur = 0;
        const fillGrad = ctx.createLinearGradient(0, scanY, 0, scanY + 20);
        fillGrad.addColorStop(0, 'rgba(255,255,255,0.09)');
        fillGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fillGrad; ctx.fillRect(cx - hw, scanY, hw * 2, 20);
      }

      // Brain sphere
      const headCY = figTop + figH * 0.163;
      const brainR = figH * 0.063;
      drawBrain(cx, headCY, brainR, t);

      // Neural lines
      ctx.save();
      const neuralTargets = [
        { dx: -0.38, dy: -0.15, label: 'EEG δ' },
        { dx: -0.32, dy:  0.10, label: 'EEG θ' },
        { dx: -0.28, dy:  0.35, label: 'CARDIAC' },
        { dx:  0.38, dy: -0.15, label: 'EEG α' },
        { dx:  0.32, dy:  0.10, label: 'EEG β' },
        { dx:  0.28, dy:  0.35, label: 'GSR' },
        { dx:  0.00, dy: -0.30, label: 'γ GAMMA' },
      ];
      neuralTargets.forEach((nt, ni) => {
        const tx2 = cx + nt.dx * figH;
        const ty2 = headCY + nt.dy * figH;
        const pulse2 = 0.5 + 0.5 * Math.sin(t * 1.4 + ni * 0.9);
        const cpx = (cx + tx2) / 2 + (Math.random() < 0.5 ? -1 : 1) * figH * 0.05;
        const cpy = (headCY + ty2) / 2;
        ctx.beginPath();
        ctx.moveTo(cx, headCY);
        ctx.quadraticCurveTo(cpx, cpy, tx2, ty2);
        ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.20 * pulse2})`;
        ctx.lineWidth = 0.7; ctx.stroke();
        ctx.beginPath(); ctx.arc(tx2, ty2, 3 + pulse2 * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * pulse2})`;
        ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 8;
        ctx.fill(); ctx.shadowBlur = 0;
        // (Node text labels EEG δ/θ/α/β, γ GAMMA, GSR, CARDIAC removed — the scattered
        //  greek/abbrev text read as cryptic "captcha". The glowing nodes + neural
        //  lines stay for the visual.)
        void nt.label;
      });
      ctx.restore();

      // ── Central indicator ─────────────────────────────────────────────────────
      // ⚠️ Non solo « sotto la figura »: i CREDITI sono ancorati al fondo della finestra, e
      // l'indicatore alla figura. Su una finestra bassa i due si incontravano — verificato a
      // 1280×720, dove « READINESS SIGNAL » finiva sopra la prima riga dei crediti. Si alza
      // quindi tutto il blocco quel tanto che basta, senza toccare le finestre alte.
      const creditsH = 13 * (creditLines(langRef.current).length + 1) + 10;
      const indY   = Math.min(figTop + figH * 1.04, H - creditsH - 44);
      const isOnline = t > 0.5;
      const indPulse = 0.7 + 0.3 * Math.sin(t * 4.5);
      for (let gi = 3; gi >= 1; gi--) {
        ctx.beginPath(); ctx.arc(cx, indY, (8 + gi * 6) * indPulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.05 / gi})`; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, indY, 7 * indPulse, 0, Math.PI * 2);
      ctx.fillStyle = isOnline ? `rgba(255,255,255,${0.85 * indPulse})` : 'rgba(255,255,255,0.6)';
      ctx.shadowColor = isOnline ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '600 9px monospace';
      ctx.fillStyle = isOnline ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'center';
      ctx.fillText(`READINESS SIGNAL : ${isOnline ? 'ONLINE' : 'INITIALIZING'}`, cx + 18, indY + 4);

      // ── Title — logo on TOP, STATIC METER underneath, SAME WIDTH (harmonized) ──
      // The logo (Alternative Scientology) is centred at the top; the cyan
      // "STATIC METER" wordmark sits directly below it, scaled so its tracked
      // width matches the logo's width for a clean, balanced lockup.
      ctx.save();
      const titleW = Math.min(W * 0.24, 300);                      // shared width
      const logoAR = logoImgRef.current ? (logoImgRef.current.width / logoImgRef.current.height) : 3.2;
      const logoW  = titleW;
      const logoH  = logoW / logoAR;
      const label  = 'EQUILIBRIUM';
      const trackEm = 0.16;

      // Pick a font size so the tracked label width ≈ titleW.
      ctx.font = '700 100px monospace';
      const track100 = 100 * trackEm;
      let w100 = 0; for (const ch of label) w100 += ctx.measureText(ch).width + track100;
      w100 -= track100;
      const tFont = Math.min(Math.round((titleW / w100) * 100), Math.round(H * 0.05));

      // Vertical lockup, centred in the space above the figure.
      const gapLT  = Math.round(logoH * 0.16);                     // logo→text gap
      const blockH = logoH + gapLT + tFont;
      const blockTop = Math.max(16, figTop - 22 - blockH);
      const logoY  = blockTop;
      const textBaseline = blockTop + logoH + gapLT + tFont * 0.82;

      // Logo — centred, cyan glow. The artwork is a blue infinity (left) + a thin,
      // dark "ALTERNATIVE SCIENTOLOGY" wordmark (right). On this dark splash the dark
      // text is invisible, so we keep the blue infinity AS-IS and whiten ONLY the
      // text half (brightness(0)+invert → white) so the lettering reads on the dark bg.
      if (logoImgRef.current) {
        const img = logoImgRef.current;
        // ⚠️ MISURATO sul PNG (4020 px di larghezza), non stimato: i pixel BLU dell'infinito
        // vanno da 3,4 % a 41,4 %, quelli scuri del testo da 43,1 % a 98,5 %. Il taglio era a
        // 0,35 — dentro l'infinito — e la sua coda destra finiva nella metà sbiancata: si vedeva
        // un pezzo di simbolo BIANCO (segnalato dall'utente). 0,42 cade nel vuoto fra i due.
        const split = 0.42;
        const sxSplit = img.width * split;
        const dSplitW = logoW * split;
        const lx = cx - logoW / 2;
        ctx.shadowColor = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 18;
        ctx.globalAlpha = 0.95;
        // left half: blue infinity, drawn as-is (keeps the 3D blue gradient)
        ctx.drawImage(img, 0, 0, sxSplit, img.height, lx, logoY, dSplitW, logoH);
        // right half: the wordmark, whitened for legibility on the dark background
        ctx.save();
        ctx.filter = 'brightness(0) invert(1)';
        ctx.drawImage(img, sxSplit, 0, img.width - sxSplit, img.height, lx + dSplitW, logoY, logoW - dSplitW, logoH);
        ctx.restore();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }

      // "STATIC METER" — centred under the logo, width-matched, letter-spaced
      ctx.font = `700 ${tFont}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef4ff';
      const track = tFont * trackEm;
      let totW = 0; for (const ch of label) totW += ctx.measureText(ch).width + track;
      totW -= track;
      const drawTitle = () => {
        let c = cx - totW / 2;
        for (const ch of label) { ctx.fillText(ch, c, textBaseline); c += ctx.measureText(ch).width + track; }
      };
      // dual glow to match the topbar wordmark
      ctx.shadowColor = 'rgba(255,255,255,0.30)'; ctx.shadowBlur = 30; drawTitle();
      ctx.shadowColor = 'rgba(255,255,255,0.60)'; ctx.shadowBlur = 12; drawTitle();
      ctx.shadowBlur = 0;

      // (Subtitle line under the wordmark removed — read as cryptic "captcha" text.)
      ctx.restore();

      // ── Loading bar ────────────────────────────────────────────────────────────
      const progress = Math.min(1, t / 3.0); // matches the 3 s splash duration
      const barW = Math.min(figH * 0.9, W * 0.5);
      const barX = cx - barW / 2;
      const barY = indY + 22;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      rr(ctx, barX, barY, barW, 2, 1); ctx.fill();
      const bGrad = ctx.createLinearGradient(barX, 0, barX + barW * progress, 0);
      bGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
      bGrad.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = bGrad;
      rr(ctx, barX, barY, barW * progress, 2, 1); ctx.fill();
      ctx.beginPath(); ctx.arc(barX + barW * progress, barY + 1, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 8;
      ctx.fill(); ctx.shadowBlur = 0;
      const msgs = ['INITIALIZING NEURAL ENGINE…','CALIBRATING EEG CHANNELS…','ESTABLISHING RELAY…','LOADING BIOFEEDBACK CORE…'];
      ctx.font = '400 8px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.textAlign = 'center';
      ctx.fillText(msgs[Math.min(Math.floor(progress * msgs.length), msgs.length - 1)], cx, barY + 14);

      // ── CRÉDITS ────────────────────────────────────────────────────────────────
      // Mêmes textes que la fenêtre ouverte par le logo (source unique : credits.ts).
      // Ils apparaissent en fondu pour ne pas « sauter » à l'écran.
      {
        const fade = Math.min(1, Math.max(0, (t - 0.6) / 0.8));
        if (fade > 0) {
          ctx.save();
          ctx.textAlign = 'center';
          const lines = creditLines(langRef.current);
          const cr    = creditCopyright(langRef.current);
          const LH    = 13;                                  // interligne
          // Calés en bas, MAIS jamais au-dessus du message de chargement : sur une fenêtre
          // basse le bloc remontait jusqu'à toucher « LOADING… ». Le plancher gagne.
          let y = Math.max(H - 24 - LH * lines.length, barY + 28);
          for (const l of lines) {
            ctx.font = '400 8px monospace';
            ctx.fillStyle = `rgba(255,255,255,${0.30 * fade})`;
            const lab = `${l.label.toUpperCase()}  ·  `;
            const labW = ctx.measureText(lab).width;
            ctx.font = '600 9px monospace';
            const valW = ctx.measureText(l.value).width;
            const x0 = cx - (labW + valW) / 2;               // libellé + nom centrés ensemble
            ctx.textAlign = 'left';
            ctx.font = '400 8px monospace';
            ctx.fillStyle = `rgba(255,255,255,${0.30 * fade})`;
            ctx.fillText(lab, x0, y);
            ctx.font = '600 9px monospace';
            ctx.fillStyle = `rgba(255,255,255,${0.62 * fade})`;
            ctx.fillText(l.value, x0 + labW, y);
            y += LH;
          }
          ctx.textAlign = 'center';
          ctx.font = '600 8px monospace';
          ctx.fillStyle = `rgba(255,255,255,${0.42 * fade})`;
          ctx.fillText(`${cr.label}  ${cr.value}`, cx, y + 3);
          ctx.restore();
        }
      }

      // keep bpm referenced (silences unused-var without changing visuals)
      void bpm;

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <div
      onClick={() => onDismissRef.current()}
      style={{
        position: 'fixed', inset: 0, zIndex: LAYER.splash, cursor: 'pointer',
        background: '#161619',
        transition: closing
          ? 'opacity 0.80s ease-in, transform 0.80s cubic-bezier(0.55,0,1,0.8), filter 0.80s ease-in'
          : 'opacity 0.35s ease-in',
        opacity:         visible && !closing ? 1 : 0,
        transform:       closing ? 'scale(0.04)' : 'scale(1)',
        filter:          closing ? 'blur(14px) brightness(2.5)' : 'none',
        transformOrigin: '50% 50%',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
