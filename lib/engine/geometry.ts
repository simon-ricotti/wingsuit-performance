// Geometría del salto sobre la serie de puntos: búsqueda por tiempo, interpolación, salida,
// cruces de altura, velocidad horizontal y apertura estimada.
import type { InterpPoint, TrackPoint } from './types';
import { projector } from './util';

/** Primer índice con pts[i].t >= t, o -1 si t es posterior al último punto. */
export function idxAtTime(pts: readonly TrackPoint[], t: number): number {
  let lo = 0, hi = pts.length - 1;
  if (t <= pts[0].t) return 0;
  if (t > pts[hi].t) return -1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].t < t) lo = mid + 1; else hi = mid; }
  return lo;
}

export function lerpPoint(a: InterpPoint, b: InterpPoint, f: number): InterpPoint {
  return {
    t: a.t + (b.t - a.t) * f, lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f, alt: a.alt + (b.alt - a.alt) * f,
    vD: a.vD + (b.vD - a.vD) * f,
  };
}

export function pointAtTime(pts: readonly TrackPoint[], t: number): InterpPoint | null {
  const i = idxAtTime(pts, t);
  if (i < 0) return null;
  if (i === 0) return t < pts[0].t ? null : lerpPoint(pts[0], pts[0], 0);
  const a = pts[i - 1], b = pts[i];
  return lerpPoint(a, b, (t - a.t) / (b.t - a.t));
}

export interface ExitPoint {
  i: number;
  t: number;
  alt: number;
  lat: number;
  lon: number;
}

/**
 * Salida: primer instante en que la velocidad vertical llega a 10 m/s y se sostiene 3 s.
 * Es el inicio de la cuenta de 9 s de la ventana de validación (2.2).
 */
export function findExit(pts: readonly TrackPoint[], vsIn?: number): ExitPoint | null {
  const vs = vsIn || 10;
  let iMax = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].sep != null && pts[i].sep! > 60) continue;
    if (pts[i].alt > pts[iMax].alt) iMax = i;
  }
  function scan(from: number, hold: number): number {
    for (let i = Math.max(1, from); i < pts.length; i++) {
      if (pts[i].vD < vs) continue;
      let ok = true, j = i, span = 0;
      while (j < pts.length && pts[j].t - pts[i].t <= hold) {
        if (pts[j].vD < vs) { ok = false; break; }
        span = pts[j].t - pts[i].t; j++;
      }
      if (ok && span >= hold * 0.8) return i;
    }
    return -1;
  }
  const from = idxAtTime(pts, pts[iMax].t - 60);
  let idx = scan(from < 0 ? 0 : from, 3);
  if (idx < 0) idx = scan(0, 3);
  if (idx < 0) idx = scan(0, 1);
  if (idx < 0) return null;
  const a = pts[idx - 1], b = pts[idx];
  let f = 1;
  if (a.vD < vs && b.vD > a.vD) f = (vs - a.vD) / (b.vD - a.vD);
  const p = lerpPoint(a, b, f);
  return { i: idx, t: p.t, alt: p.alt, lat: p.lat, lon: p.lon };
}

/** Primer cruce descendente de una altura (m MSL), interpolado. 2.2: la ventana empieza y termina en el primer cruce. */
export function crossDown(pts: readonly TrackPoint[], from: number, altMsl: number): { i: number; p: InterpPoint } | null {
  for (let i = Math.max(1, from); i < pts.length; i++) {
    if (pts[i].alt <= altMsl) {
      const a = pts[i - 1], b = pts[i];
      if (a.alt <= altMsl) return { i, p: lerpPoint(b, b, 0) };
      return { i, p: lerpPoint(a, b, (a.alt - altMsl) / (a.alt - b.alt)) };
    }
  }
  return null;
}

/** Velocidad horizontal (m/s) de cada punto, con una ventana de ~1 s. */
export function groundSpeeds(pts: readonly TrackPoint[]): number[] {
  const gs = new Array<number>(pts.length);
  let lo = 0, hi = 0;
  for (let j = 0; j < pts.length; j++) {
    while (pts[j].t - pts[lo].t > 0.6) lo++;
    while (hi < pts.length - 1 && pts[hi + 1].t - pts[j].t <= 0.6) hi++;
    let a = lo, b = hi;
    if (a === b) { a = Math.max(0, j - 1); b = Math.min(pts.length - 1, j + 1); }
    const dt = pts[b].t - pts[a].t;
    if (dt <= 0) { gs[j] = 0; continue; }
    const pr = projector(pts[j].lat, pts[j].lon);
    const pa = pr(pts[a].lat, pts[a].lon), pb = pr(pts[b].lat, pts[b].lon);
    gs[j] = Math.sqrt((pb[0] - pa[0]) * (pb[0] - pa[0]) + (pb[1] - pa[1]) * (pb[1] - pa[1])) / dt;
  }
  return gs;
}

/** Apertura (estimada): la velocidad total cae por debajo de 25 m/s durante 1 s. */
export function findDeploy(pts: readonly TrackPoint[], fromIdx: number): number | null {
  const gs = groundSpeeds(pts);
  for (let i = fromIdx; i < pts.length; i++) {
    const sp = Math.sqrt(gs[i] * gs[i] + pts[i].vD * pts[i].vD);
    if (sp >= 25) continue;
    let ok = true, j = i;
    while (j < pts.length && pts[j].t - pts[i].t <= 1) {
      if (Math.sqrt(gs[j] * gs[j] + pts[j].vD * pts[j].vD) >= 25) { ok = false; break; }
      j++;
    }
    if (ok) return Math.max(pts[fromIdx].t, pts[i].t - 2);
  }
  return null;
}
