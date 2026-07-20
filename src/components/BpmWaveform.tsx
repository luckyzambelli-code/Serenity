import React, { useEffect, useRef } from 'react';

interface BpmWaveformProps {
  bpm: number | null;
  isRunning: boolean;
}

export function BpmWaveform({ bpm, isRunning }: BpmWaveformProps) {
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

      ctx.fillStyle = 'rgba(0,8,24,0.4)';
      ctx.fillRect(0, 0, W, H);

      const y0 = H / 2;
      const period = bpm ? 60 / bpm : 1;
      const now = performance.now() / 1000;

      ctx.beginPath();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.6;

      for (let x = 0; x < W; x++) {
        const t = ((x / W) * 3 + now * 0.3) % period;
        const phase = t / period;
        let y = y0;
        if (phase < 0.04) y = y0 - (H * 0.38) * Math.sin((phase / 0.04) * Math.PI);
        else if (phase < 0.08) y = y0 + (H * 0.12) * Math.sin(((phase - 0.04) / 0.04) * Math.PI);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // BPM value
      if (bpm) {
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(bpm)}`, W - 6, H / 2 + 8);
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(248,113,113,0.6)';
        ctx.fillText('BPM', W - 6, H / 2 + 20);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = 'rgba(248,113,113,0.3)';
        ctx.font = '9px monospace';
        ctx.fillText('BPM', 4, H / 2 + 4);
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [isRunning, bpm]);

  return <canvas ref={canvasRef} width={500} height={90} className="w-full h-full" style={{ display: 'block' }} />;
}
