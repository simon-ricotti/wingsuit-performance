// Puntaje de un salto y separación entre competidores.
import type { LaneResult, RefPoint, ScoreConfig, ScoreConfigInput, ScoreResult, Separation, TrackPoint } from './types';
import { crossDown, findDeploy, findExit, idxAtTime, pointAtTime } from './geometry';
import { DEFAULT_CFG, RAD, es, projector, roundHalfUp, vincenty } from './util';

function resolveConfig(cfgIn?: ScoreConfigInput | null): ScoreConfig {
  const cfg = {} as ScoreConfig;
  for (const k in DEFAULT_CFG) {
    const key = k as keyof ScoreConfig;
    cfg[key] = (cfgIn && cfgIn[key] != null) ? +cfgIn[key]! : DEFAULT_CFG[key];
  }
  return cfg;
}

export function scoreJump(pts: readonly TrackPoint[], cfgIn?: ScoreConfigInput | null, ref?: RefPoint | null): ScoreResult {
  const cfg = resolveConfig(cfgIn);
  const res: ScoreResult = { ok: false, flags: [], cfg };
  const ex = findExit(pts, cfg.valVs);
  if (!ex) { res.error = 'No encontré la salida del avión en el archivo (la velocidad vertical nunca llega a ' + cfg.valVs + ' m/s).'; return res; }
  res.tExit = ex.t; res.exitAgl = ex.alt - cfg.elev;
  res.exitLat = ex.lat; res.exitLon = ex.lon;
  // 2.2 Validation Window: empieza 9 s después de llegar por primera vez a 10 m/s
  res.tVal = ex.t + cfg.valDelay;
  const pVal = pointAtTime(pts, res.tVal);

  // 2.2 Competition Window: del primer cruce de 2500 m al primer cruce de 1500 m sobre la elevación del DZ
  const topMsl = cfg.top + cfg.elev, botMsl = cfg.bottom + cfg.elev;
  if (ex.alt <= topMsl) { res.error = 'La salida (' + Math.round(res.exitAgl) + ' m AGL) fue por debajo del límite superior de la ventana (' + cfg.top + ' m).'; return res; }
  const cTop = crossDown(pts, ex.i, topMsl);
  if (!cTop) { res.error = 'El salto no cruza el límite superior de la ventana (' + cfg.top + ' m AGL).'; return res; }
  const cBot = crossDown(pts, cTop.i, botMsl);
  if (!cBot) { res.error = 'El salto no cruza el límite inferior de la ventana (' + cfg.bottom + ' m AGL).'; return res; }
  const p1 = cTop.p, p2 = cBot.p;
  res.tTop = p1.t; res.tBot = p2.t;
  res.pTop = { lat: p1.lat, lon: p1.lon }; res.pBot = { lat: p2.lat, lon: p2.lon };
  // 2.2 Time / Distance / Speed
  res.time = p2.t - p1.t;
  res.distance = vincenty(p1.lat, p1.lon, p2.lat, p2.lon);
  res.speed = res.time > 0 ? res.distance / res.time * 3.6 : 0;
  res.ok = true;

  // Ventana de validación: desde tVal hasta 20 m debajo de la ventana (2.2)
  const cEnd = crossDown(pts, cBot.i, botMsl - cfg.valBelow);
  const tValEnd = cEnd ? cEnd.p.t : p2.t;
  let i0 = idxAtTime(pts, res.tVal), i1 = idxAtTime(pts, tValEnd);
  if (i0 < 0) i0 = 0;
  if (i1 < 0) i1 = pts.length - 1;
  let sepMax: number | null = null, maxGap = 0;
  const dts: number[] = [];
  for (let i = i0; i <= i1; i++) {
    const sep = pts[i].sep;
    if (sep != null && (sepMax == null || sep > sepMax)) sepMax = sep;
    if (i > i0) { const d = pts[i].t - pts[i - 1].t; dts.push(d); if (d > maxGap) maxGap = d; }
  }
  dts.sort((a, b) => a - b);
  const med = dts.length ? dts[dts.length >> 1] : 0;
  res.hz = med > 0 ? roundHalfUp(1 / med, 1) : 0;
  res.maxGap = roundHalfUp(maxGap, 2);
  res.sepMax = sepMax == null ? null : roundHalfUp(sepMax, 1);
  if (sepMax == null) res.flags.push({ code: 'sin_sep', level: 'info', text: 'Sin validación de precisión: el archivo no informa exactitud del GPS.' });
  // 5.7.4: SEP de 10 m o más en la validación = re-salto
  else if (sepMax >= cfg.sepLimit) res.flags.push({ code: 'sep', level: 'warn', text: 'SEP máximo ' + es(res.sepMax) + ' m en la ventana de validación (límite ' + cfg.sepLimit + ' m). En competencia corresponde re-salto (5.7.4).' });
  // 3.1.1: al menos 5 Hz
  if (res.hz < cfg.minHz - 0.05) res.flags.push({ code: 'hz', level: 'warn', text: 'El GPS registró a ' + es(res.hz) + ' Hz; FAI exige al menos ' + cfg.minHz + ' Hz (3.1.1).' });
  else if (maxGap > 1) res.flags.push({ code: 'gap', level: 'warn', text: 'Hay un hueco de ' + es(res.maxGap) + ' s sin datos dentro de la ventana de validación.' });
  // 5.4.6 y 5.4.5: altura de salida
  if (res.exitAgl < cfg.exitMin) res.flags.push({ code: 'exit_low', level: 'warn', text: 'Salida a ' + Math.round(res.exitAgl) + ' m AGL, por debajo del mínimo de ' + cfg.exitMin + ' m (5.4.6).' });
  if (res.exitAgl > cfg.exitMax) res.flags.push({ code: 'exit_high', level: 'warn', text: 'Salida a ' + Math.round(res.exitAgl) + ' m AGL, por encima del máximo de ' + cfg.exitMax + ' m (5.4.5).' });

  for (let gi = ex.i; gi > 0 && ex.t - pts[gi].t < 12; gi--) {
    if (pts[gi].t - pts[gi - 1].t > 1) { res.flags.push({ code: 'exit_gap', level: 'warn', text: 'El GPS no grabó de forma continua justo antes de la salida: el inicio de la validación y del carril puede estar corrido.' }); break; }
  }
  res.tDeploy = findDeploy(pts, cBot.i);

  // Carril designado (2.2, 5.6.2): 600 m centrado en la recta desde el inicio de la validación al punto de referencia
  res.lane = null;
  if (ref && isFinite(ref.lat) && isFinite(ref.lon) && pVal) {
    const pr = projector(pVal.lat, pVal.lon);
    const r = pr(ref.lat, ref.lon), len = Math.sqrt(r[0] * r[0] + r[1] * r[1]);
    if (len > 1) {
      const ux = r[0] / len, uy = r[1] / len;
      let dev = 0, devT = res.tVal, side = 0;
      const check = (p: { lat: number; lon: number; t: number }) => {
        const q = pr(p.lat, p.lon), c = q[0] * uy - q[1] * ux;
        if (Math.abs(c) > dev) { dev = Math.abs(c); devT = p.t; side = c > 0 ? 1 : -1; }
      };
      let ib = idxAtTime(pts, p2.t);
      if (ib < 0) ib = pts.length;
      for (let n = i0; n < ib; n++) check(pts[n]);
      check(p2);
      // 5.6.2: se mide en ángulo recto al borde del carril (300 m del eje)
      const outside = Math.max(0, dev - cfg.laneWidth / 2);
      let pen = 0;
      if (outside > 300) pen = 50; //        5.6.2.3
      else if (outside >= 150) pen = 20; //  5.6.2.2
      else if (outside > 0) pen = 10; //     5.6.2.1
      const lane: LaneResult = {
        dev: roundHalfUp(dev, 1), outside: roundHalfUp(outside, 1), penalty: pen, t: devT, side,
        start: { lat: pVal.lat, lon: pVal.lon }, bearing: (Math.atan2(ux, uy) / RAD + 360) % 360, length: len,
      };
      res.lane = lane;
    }
  }
  return res;
}

/** Distancia mínima entre dos saltos sincronizados por hora GPS, de la validación a la apertura (5.6.3). */
export function minSeparation(ptsA: readonly TrackPoint[], sA: ScoreResult, ptsB: readonly TrackPoint[], sB: ScoreResult): Separation | null {
  if (!sA.ok || !sB.ok) return null;
  const t0 = Math.max(sA.tVal!, sB.tVal!);
  const t1 = Math.min(sA.tDeploy || sA.tBot!, sB.tDeploy || sB.tBot!);
  if (t1 - t0 < 1) return null;
  let best: Separation | null = null;
  for (let t = t0; t <= t1; t += 0.1) {
    const a = pointAtTime(ptsA, t), b = pointAtTime(ptsB, t);
    if (!a || !b) continue;
    const q = projector(a.lat, a.lon)(b.lat, b.lon);
    const h = Math.sqrt(q[0] * q[0] + q[1] * q[1]), dz = a.alt - b.alt;
    const d3 = Math.sqrt(h * h + dz * dz);
    if (!best || d3 < best.d3) best = { d3, h, dz: Math.abs(dz), t };
  }
  if (best) { best.d3 = roundHalfUp(best.d3, 0); best.h = roundHalfUp(best.h, 0); best.dz = roundHalfUp(best.dz, 0); }
  return best;
}
