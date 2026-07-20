import React, { useEffect, useRef } from 'react';

interface EegWaveformProps {
  dataBuffer: React.MutableRefObject<{ [channel: number]: number[] }>;
  isRunning: boolean;
}

// STYLE B monochrome : ondes + noms en BLANC. Les 4 bandes se distinguent par la LUMINOSITÉ.
const CHANNELS = [
  { label: 'Delta', color: 'rgba(255,255,255,0.92)', fill: 'rgba(255,255,255,0.06)' },
  { label: 'Theta', color: 'rgba(255,255,255,0.80)', fill: 'rgba(255,255,255,0.05)' },
  { label: 'Alpha', color: 'rgba(255,255,255,0.68)', fill: 'rgba(255,255,255,0.05)' },
  { label: 'Beta',  color: 'rgba(255,255,255,0.58)', fill: 'rgba(255,255,255,0.04)' },
];

export function EegWaveform({ dataBuffer, isRunning }: EegWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isRunning) return;
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const rowH = H / 4;
      const labelW = 34;

      for (let ch = 0; ch < 4; ch++) {
        const { label, color, fill } = CHANNELS[ch];
        const samples = (dataBuffer.current[ch] || []).slice(-256);
        const y0 = ch * rowH + rowH / 2;

        ctx.fillStyle = 'rgba(0,8,24,0.4)';
        ctx.fillRect(labelW, ch * rowH + 1, W - labelW, rowH - 2);

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(labelW, y0); ctx.lineTo(W, y0); ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(label, 2, y0 + 4);

        if (samples.length < 2) continue;

        const max = Math.max(...samples.map(Math.abs), 1);
        const amp = Math.min((rowH / 2) * 0.85, (rowH / 2) * 0.85 * (200 / max));

        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
          const x = labelW + (i / (samples.length - 1)) * (W - labelW);
          const y = y0 - (samples[i] / max) * amp;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineTo(W, y0); ctx.lineTo(labelW, y0); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = color; ctx.lineWidth = 1.4;
        for (let i = 0; i < samples.length; i++) {
          const x = labelW + (i / (samples.length - 1)) * (W - labelW);
          const y = y0 - (samples[i] / max) * amp;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [isRunning, dataBuffer]);

  return <canvas ref={canvasRef} width={500} height={120} className="w-full h-full" style={{ display: 'block' }} />;
}
