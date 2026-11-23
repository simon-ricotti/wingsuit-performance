'use client';
// Overlay when a replay reaches the end: confetti and the winner (the board shows "Gana …" once everyone is done).
// Tap or Escape closes it; with reduced motion, only the card.
import { useEffect, useRef } from 'react';

const COLORS = ['#c45bb7', '#f0b354', '#3ddc84', '#2f6fde', '#ff7a3d', '#ffffff'];

export function Celebration({ text, color, onClose }: { text: string; color: string; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    const done = setTimeout(onClose, 7000);
    const c = cv.current, ctx = c?.getContext('2d');
    let raf = 0;
    if (c && ctx && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const w = (c.width = c.clientWidth), h = (c.height = c.clientHeight);
      const bits = Array.from({ length: 160 }, () => ({
        x: Math.random() * w, y: -20 - Math.random() * h, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, s: 6 + Math.random() * 6, c: COLORS[Math.floor(Math.random() * COLORS.length)],
      }));
      const draw = () => {
        ctx.clearRect(0, 0, w, h);
        for (const b of bits) {
          b.x += b.vx; b.y += b.vy; b.r += b.vr;
          if (b.y > h + 20) { b.y = -20; b.x = Math.random() * w; }
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
        }
        raf = requestAnimationFrame(draw);
      };
      draw();
    }
    return () => { window.removeEventListener('keydown', key); clearTimeout(done); cancelAnimationFrame(raf); };
  }, [onClose]);

  return (
    <div className="celebrate" role="dialog" aria-label={text} onClick={onClose}>
      <canvas ref={cv} aria-hidden="true" />
      <div className="celebrate-card" style={{ '--c': color } as React.CSSProperties}>
        <span aria-hidden="true">🏆</span>
        <strong>{text}</strong>
        <small>Tocá para cerrar</small>
      </div>
    </div>
  );
}
