'use client';
// Extra analysis of one loose track (like baseline.ws): speeds, glide and altitude over time, and the polar
// (horizontal vs vertical speed). Not scoring: horizontal speed is the engine's ~1 s ground speed, glide = horizontal / vertical.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as engine from '@/lib/engine';
import type { ScoreResult, TrackPoint } from '@/lib/engine';

const KMH = 3.6;
const fmt = (n: number, d = 0) => engine.es(+n.toFixed(d));

interface Row { s: number; alt: number; h: number; v: number; tot: number; glide: number | null }
type Colors = Record<'fg' | 'muted' | 'line' | 'accent' | 'lane' | 'brand' | 'surface', string>;

function colors(): Colors {
  const cs = getComputedStyle(document.documentElement), v = (k: string) => cs.getPropertyValue(k).trim();
  return { fg: v('--fg'), muted: v('--muted'), line: v('--line'), accent: v('--accent'), lane: v('--lane'), brand: v('--brand'), surface: v('--bg') };
}

/** Canvas sized to its CSS box at the device pixel ratio. */
function prep(cv: HTMLCanvasElement) {
  const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * r); cv.height = Math.round(h * r);
  const c = cv.getContext('2d')!;
  c.setTransform(r, 0, 0, r, 0, 0);
  c.clearRect(0, 0, w, h);
  c.font = '12px system-ui, sans-serif';
  return { c, w, h };
}

const SERIES = [
  { k: 'h', label: 'Horizontal', color: 'lane' },
  { k: 'v', label: 'Vertical', color: 'brand' },
  { k: 'tot', label: 'Total', color: 'fg' },
] as const;

export function FlightAnalysis({ pts, sc, elev }: { pts: TrackPoint[]; sc: ScoreResult; elev: number }) {
  // From exit to 2 s after the (estimated) deployment.
  const { data, win, deploy } = useMemo(() => {
    const t0 = sc.tExit!, tDep = sc.tDeploy ?? null, t1 = (tDep ?? sc.tBot! + 10) + 2;
    const gs = engine.groundSpeeds(pts);
    const data: Row[] = [];
    pts.forEach((p, i) => {
      if (p.t < t0 || p.t > t1) return;
      const h = gs[i], v = p.vD;
      data.push({ s: p.t - t0, alt: p.alt - elev, h, v, tot: Math.hypot(h, v), glide: v > 2 ? h / v : null });
    });
    return { data, win: [sc.tTop! - t0, sc.tBot! - t0] as const, deploy: tDep != null ? tDep - t0 : null };
  }, [pts, sc, elev]);

  const [idx, setIdx] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null), tc = useRef<HTMLCanvasElement>(null), pc = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const inWin = (r: Row) => r.s >= win[0] && r.s <= win[1];
  const maxTot = Math.max(...data.map((r) => r.tot)) * KMH * 1.05;
  const maxAlt = Math.max(...data.map((r) => r.alt)) * 1.05;
  const winGlides = data.filter(inWin).map((r) => r.glide ?? 0);
  const freefall = data.filter((r) => deploy == null || r.s <= deploy);
  const depRow = deploy != null ? data.find((r) => r.s >= deploy) : null;

  // Time chart: three panels on the same time axis, the FAI window shaded.
  const L = 44, R = 10;
  const tMax = data.length ? data[data.length - 1].s : 1;
  const X = (s: number, w: number) => L + (s / tMax) * (w - L - R);
  useEffect(() => {
    const cv = tc.current;
    if (!cv || !width || !data.length) return;
    const K = colors(), { c, w, h } = prep(cv);
    const gap = 26, top = 18, usable = h - top - 2 * gap - 22;
    const panels = [
      { y: top, h: usable * 0.45, max: maxTot, label: 'Velocidad (km/h)', lines: SERIES.map((s) => ({ get: (r: Row) => r[s.k] * KMH, color: K[s.color] })) },
      { y: 0, h: usable * 0.25, max: 4, label: 'Planeo', lines: [{ get: (r: Row) => r.glide, color: K.fg }] },
      { y: 0, h: usable * 0.3, max: maxAlt, label: 'Altura (m sobre el DZ)', lines: [{ get: (r: Row) => r.alt, color: K.muted }] },
    ];
    panels[1].y = panels[0].y + panels[0].h + gap;
    panels[2].y = panels[1].y + panels[1].h + gap;
    const bottom = panels[2].y + panels[2].h;
    // Window band and deployment line across every panel.
    c.globalAlpha = 0.14; c.fillStyle = K.accent;
    c.fillRect(X(win[0], w), top, X(win[1], w) - X(win[0], w), bottom - top);
    c.globalAlpha = 1;
    if (deploy != null) {
      c.strokeStyle = K.muted; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(deploy, w), top); c.lineTo(X(deploy, w), bottom); c.stroke(); c.setLineDash([]);
      c.fillStyle = K.muted; c.textAlign = 'right'; c.fillText('apertura', X(deploy, w) - 4, bottom - 4);
    }
    for (const p of panels) {
      const Y = (v: number) => p.y + p.h - (Math.min(v, p.max) / p.max) * p.h;
      c.strokeStyle = K.line; c.lineWidth = 1; c.fillStyle = K.muted; c.textAlign = 'right';
      for (let k = 0; k <= 2; k++) {
        const v = (p.max * k) / 2, y = Y(v);
        c.beginPath(); c.moveTo(L, y); c.lineTo(w - R, y); c.stroke();
        c.fillText(fmt(v, p.max < 10 ? 1 : 0), L - 6, y + 4);
      }
      c.textAlign = 'left'; c.fillStyle = K.fg; c.fillText(p.label, L, p.y - 6);
      for (const ln of p.lines) {
        c.strokeStyle = ln.color; c.lineWidth = 2; c.beginPath();
        let on = false;
        for (const r of data) {
          const v = ln.get(r);
          if (v == null) { on = false; continue; }
          if (on) c.lineTo(X(r.s, w), Y(v)); else { c.moveTo(X(r.s, w), Y(v)); on = true; }
        }
        c.stroke();
      }
    }
    // Time axis (s from exit).
    c.fillStyle = K.muted; c.textAlign = 'center';
    const step = tMax > 80 ? 20 : 10;
    for (let s = 0; s <= tMax; s += step) c.fillText(`${s} s`, X(s, w), h - 4);
    if (idx != null) {
      const x = X(data[idx].s, w);
      c.strokeStyle = K.fg; c.lineWidth = 1; c.beginPath(); c.moveTo(x, top); c.lineTo(x, bottom); c.stroke();
    }
  }, [width, data, idx, win, deploy, maxTot, maxAlt, tMax]);

  // Polar: horizontal vs vertical speed at the same scale, so glide lines keep their angle; the window highlighted.
  const PT = 26, PL = 44, PB = 24;
  const polarScale = (w: number, h: number) => {
    const mh = Math.max(...data.map((r) => r.h)) * KMH * 1.08, mv = Math.max(...data.map((r) => r.v)) * KMH * 1.08;
    return Math.min((w - PL - R) / mh, (h - PT - PB) / mv);
  };
  useEffect(() => {
    const cv = pc.current;
    if (!cv || !width || !data.length) return;
    const K = colors(), { c, w, h } = prep(cv), k = polarScale(w, h);
    const PX = (v: number) => PL + v * KMH * k, PY = (v: number) => PT + v * KMH * k;
    const xMax = (w - PL - R) / k, yMax = (h - PT - PB) / k;
    c.strokeStyle = K.line; c.fillStyle = K.muted; c.lineWidth = 1;
    for (let v = 0; v <= xMax; v += 50) { c.beginPath(); c.moveTo(PL + v * k, PT); c.lineTo(PL + v * k, h - PB); c.stroke(); c.textAlign = 'center'; c.fillText(String(v), PL + v * k, h - 8); }
    for (let v = 0; v <= yMax; v += 50) { c.beginPath(); c.moveTo(PL, PT + v * k); c.lineTo(w - R, PT + v * k); c.stroke(); c.textAlign = 'right'; c.fillText(String(v), PL - 6, PT + v * k + 4); }
    c.textAlign = 'left'; c.fillStyle = K.fg;
    c.fillText('Vertical (km/h) ↓  ·  Horizontal (km/h) →', PL, 14);
    // Glide 1:1, 2:1 and 3:1 from the origin.
    c.setLineDash([5, 5]); c.strokeStyle = K.muted;
    for (const g of [1, 2, 3]) {
      const end = Math.min(xMax, yMax * g);
      c.beginPath(); c.moveTo(PL, PT); c.lineTo(PL + end * k, PT + (end / g) * k); c.stroke();
      c.fillStyle = K.muted; c.fillText(`${g}:1`, PL + end * k - 26, PT + (end / g) * k - 6);
    }
    c.setLineDash([]);
    // Track: thin outside the window, thick in it.
    for (let i = 1; i < data.length; i++) {
      const a = data[i - 1], b = data[i], w8 = inWin(b);
      c.strokeStyle = w8 ? K.accent : K.muted; c.lineWidth = w8 ? 3 : 1.5;
      c.beginPath(); c.moveTo(PX(a.h), PY(a.v)); c.lineTo(PX(b.h), PY(b.v)); c.stroke();
    }
    if (idx != null) {
      const r = data[idx];
      c.fillStyle = K.fg; c.strokeStyle = K.surface; c.lineWidth = 2;
      c.beginPath(); c.arc(PX(r.h), PY(r.v), 6, 0, 2 * Math.PI); c.fill(); c.stroke();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, data, idx, win]);

  if (!data.length) return <p className="sub small">No hay datos entre la salida y la apertura.</p>;

  const nearestTime = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect(), s = ((e.clientX - rect.left - L) / (rect.width - L - R)) * tMax;
    let best = 0;
    data.forEach((r, i) => { if (Math.abs(r.s - s) < Math.abs(data[best].s - s)) best = i; });
    setIdx(best);
  };
  const nearestPolar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect(), k = polarScale(rect.width, rect.height);
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = 0, bd = Infinity;
    data.forEach((r, i) => { const d = (PL + r.h * KMH * k - x) ** 2 + (PT + r.v * KMH * k - y) ** 2; if (d < bd) { bd = d; best = i; } });
    setIdx(best);
  };
  const keys = (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setIdx((i) => Math.max(0, Math.min(data.length - 1, (i ?? 0) + d)));
  };
  const r = idx != null ? data[idx] : null;

  return (
    <div className="stack" ref={box}>
      <div className="kpis">
        <div className="kpi"><div className="k">Salida</div><div className="v">{fmt(sc.exitAgl ?? 0)} m</div></div>
        <div className="kpi"><div className="k">Apertura (estimada)</div><div className="v">{depRow ? `${fmt(depRow.alt)} m` : '—'}</div></div>
        <div className="kpi"><div className="k">Caída libre</div><div className="v">{deploy != null ? `${fmt(deploy)} s` : '—'}</div></div>
        <div className="kpi"><div className="k">Horizontal máx.</div><div className="v">{fmt(Math.max(...freefall.map((x) => x.h)) * KMH)} km/h</div></div>
        <div className="kpi"><div className="k">Vertical máx.</div><div className="v">{fmt(Math.max(...freefall.map((x) => x.v)) * KMH)} km/h</div></div>
        <div className="kpi"><div className="k">Mejor planeo en la ventana</div><div className="v">{winGlides.length ? fmt(Math.max(...winGlides), 2) : '—'}</div></div>
        <div className="kpi"><div className="k">GPS</div><div className="v">{fmt(sc.hz ?? 0, 1)} Hz</div></div>
      </div>

      <dl className="readout" aria-live="off">
        <div><dt>Tiempo</dt><dd>{r ? `${fmt(r.s, 1)} s` : '—'}</dd></div>
        <div><dt>Altura</dt><dd>{r ? `${fmt(r.alt)} m` : '—'}</dd></div>
        {SERIES.map((s) => (
          <div key={s.k}><dt><i style={{ background: `var(--${s.color})` }} aria-hidden="true" />{s.label}</dt><dd>{r ? `${fmt(r[s.k] * KMH)} km/h` : '—'}</dd></div>
        ))}
        <div><dt>Planeo</dt><dd>{r?.glide != null ? fmt(r.glide, 2) : '—'}</dd></div>
      </dl>

      <div className="flight-charts">
        <canvas ref={tc} className="fa-time" tabIndex={0} role="img" onPointerMove={nearestTime} onPointerDown={nearestTime} onKeyDown={keys}
          aria-label="Velocidad, planeo y altura desde la salida. Con las flechas se recorre el salto." />
        <canvas ref={pc} className="fa-polar" tabIndex={0} role="img" onPointerMove={nearestPolar} onPointerDown={nearestPolar} onKeyDown={keys}
          aria-label="Curva polar: velocidad horizontal contra vertical, con las líneas de planeo 1:1, 2:1 y 3:1." />
      </div>
      <p className="sub small" style={{ margin: 0 }}>
        En naranja, la ventana FAI. Pasá el dedo o el mouse por cualquiera de los dos gráficos (o usá las flechas) para ver los valores en ese momento.
        En la polar, cada punto es un instante: más a la derecha, más rápido hacia adelante; más abajo, más rápido hacia abajo; sobre las líneas punteadas, el planeo.
        La velocidad horizontal sale de las posiciones del GPS (promedio de ~1 s) y es sobre el suelo: con viento cambia aunque vueles igual.
      </p>
    </div>
  );
}
