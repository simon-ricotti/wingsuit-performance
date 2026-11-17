// Track compacto: recorte alrededor del salto y codificación por deltas para guardar y re-puntuar.
import type { PackedTrack, ScoreResult, TrackPoint } from './types';

/** Recorta desde 15 s antes de la salida hasta 8 s después de la apertura (o 30 s después de la ventana). */
export function trimTrack(pts: readonly TrackPoint[], score: ScoreResult): TrackPoint[] {
  const t0 = (score.tExit || pts[0].t) - 15;
  const t1 = score.ok ? (score.tDeploy != null ? score.tDeploy + 8 : score.tBot! + 30) : pts[pts.length - 1].t;
  const out: TrackPoint[] = [];
  for (let i = 0; i < pts.length; i++) if (pts[i].t >= t0 && pts[i].t <= t1) out.push(pts[i]);
  return out;
}

const PACK_KEYS = ['t', 'la', 'lo', 'al', 'vd', 'se'] as const;
type PackKey = typeof PACK_KEYS[number];

export function packTrack(pts: readonly TrackPoint[]): PackedTrack {
  const t0 = pts[0].t;
  const cols: Record<PackKey, number[] | null> = { t: [], la: [], lo: [], al: [], vd: [], se: [] };
  let pt = 0, pla = 0, plo = 0, pal = 0, hasSep = false;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = Math.round((p.t - t0) * 1000), la = Math.round(p.lat * 1e7), lo = Math.round(p.lon * 1e7), al = Math.round(p.alt * 100);
    cols.t!.push(t - pt); cols.la!.push(la - pla); cols.lo!.push(lo - plo); cols.al!.push(al - pal);
    cols.vd!.push(Math.round(p.vD * 100));
    if (p.sep != null) hasSep = true;
    cols.se!.push(p.sep == null ? -1 : Math.min(9999, Math.round(p.sep * 10)));
    pt = t; pla = la; plo = lo; pal = al;
  }
  if (!hasSep) cols.se = null;
  const join = (k: PackKey) => (cols[k] ? cols[k]!.join(',') : null);
  return {
    v: 1, t0, n: pts.length,
    t: join('t')!, la: join('la')!, lo: join('lo')!, al: join('al')!, vd: join('vd')!, se: join('se'),
  };
}

export function unpackTrack(o: PackedTrack): TrackPoint[] {
  const c = {} as Record<PackKey, number[] | null>;
  PACK_KEYS.forEach((k) => { c[k] = o[k] ? String(o[k]).split(',').map(Number) : null; });
  const pts: TrackPoint[] = [];
  let t = 0, la = 0, lo = 0, al = 0;
  const ct = c.t!, cla = c.la!, clo = c.lo!, cal = c.al!, cvd = c.vd!, cse = c.se;
  for (let i = 0; i < ct.length; i++) {
    t += ct[i]; la += cla[i]; lo += clo[i]; al += cal[i];
    pts.push({
      t: o.t0 + t / 1000, lat: la / 1e7, lon: lo / 1e7, alt: al / 100, vD: cvd[i] / 100,
      sep: cse && cse[i] >= 0 ? cse[i] / 10 : null,
    });
  }
  return pts;
}
