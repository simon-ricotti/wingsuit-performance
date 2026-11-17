// Paridad con el motor viejo: misma entrada → exactamente la misma salida (toStrictEqual, sin tolerancias).
// Cubre la lectura de cada formato, el puntaje con y sin punto de referencia, el track compacto,
// la separación entre competidores y la clasificación con datos al azar.
import { beforeAll, describe, expect, test } from 'vitest';
import * as W from '../lib/engine';
import type { JumpRecord, TrackPoint } from '../lib/engine';
import { legacy } from './support/legacy';
import { FIXTURES, loadAllFixtures, type FixtureName } from './support/fixtures';

let files: Record<FixtureName, string>;
beforeAll(async () => { files = await loadAllFixtures(); });

const minAlt = (pts: TrackPoint[]) => pts.reduce((m, p) => Math.min(m, p.alt), Infinity);

/** Puntos de referencia alrededor de la salida, a distintas distancias y rumbos, para forzar los cuatro niveles de carril. */
function refsAround(score: W.ScoreResult) {
  if (!score.ok) return [null];
  const lat0 = score.exitLat!, lon0 = score.exitLon!;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const bot = score.pBot!;
  const out: (W.RefPoint | null)[] = [null, { lat: bot.lat, lon: bot.lon }];
  for (const [dist, deg] of [[4000, 0], [3000, 45], [2500, 100], [5000, 200], [1500, 300], [3500, 170]]) {
    const r = deg * Math.PI / 180;
    out.push({ lat: lat0 + Math.cos(r) * dist / ky, lon: lon0 + Math.sin(r) * dist / kx });
  }
  out.push({ lat: NaN, lon: 0 }, { lat: lat0, lon: lon0 });
  return out;
}

const laneOutsides: number[] = [];

function sweepRefs(score: W.ScoreResult): W.RefPoint[] {
  const lat0 = score.exitLat!, lon0 = score.exitLon!;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const dx = (score.pBot!.lon - lon0) * kx, dy = (score.pBot!.lat - lat0) * ky;
  const out: W.RefPoint[] = [];
  for (let deg = -40; deg <= 40; deg += 0.25) {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    out.push({ lat: lat0 + (dx * s + dy * c) * 1.3 / ky, lon: lon0 + (dx * c - dy * s) * 1.3 / kx });
  }
  return out;
}

describe('lectura de archivos', () => {
  test.each(FIXTURES)('%s', (name) => {
    let a: unknown, b: unknown, ea: string | null = null, eb: string | null = null;
    try { a = W.parseTrack(files[name], name); } catch (e) { ea = (e as Error).message; }
    try { b = legacy.parseTrack(files[name], name); } catch (e) { eb = (e as Error).message; }
    expect(ea).toBe(eb);
    expect(a).toStrictEqual(b);
  });

  // Formatos que no están entre los fixtures: se arman a partir de un track real.
  test('GPX, KML, CSV genérico con ; y sin velD, Deep and Steep, FlySight 2 sin $COL, BOM, errores', () => {
    const pts = W.parseTrack(files['flysight.csv']).pts.slice(0, 3000);
    const iso = (t: number) => new Date(t * 1000).toISOString();
    const variants: Record<string, string> = {
      gpx: '<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>' +
        pts.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.alt}</ele><time>${iso(p.t)}</time></trkpt>`).join('') +
        '</trkseg></trk></gpx>',
      kml: '<?xml version="1.0"?><kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><gx:Track>' +
        pts.map((p) => `<when>${iso(p.t)}</when>`).join('') + pts.map((p) => `<gx:coord>${p.lon} ${p.lat} ${p.alt}</gx:coord>`).join('') +
        '</gx:Track></Document></kml>',
      csvPuntoYComa: 'Timestamp;Latitude;Longitude;Altitude (m)\n' + pts.map((p) => [p.t * 1000, p.lat, p.lon, p.alt].join(';')).join('\n'),
      deepSteep: '﻿time,lat,lon,hMSL,velN,velE,velD,hAcc,vAcc,sAcc,headAcc\n' +
        pts.map((p) => [iso(p.t), p.lat, p.lon, p.alt, 0, 0, p.vD, 1.5, 2.5, 0.3, 1].join(',')).join('\r\n'),
      flysight2SinCol: '$FLYS,1\n' + pts.map((p) => '$GNSS,' + [iso(p.t), p.lat, p.lon, p.alt, 0, 0, p.vD, 2, 3, 0.4, 12].join(',')).join('\n'),
      sinEncabezado: pts.map((p) => [iso(p.t), p.lat, p.lon, p.alt, 0, 0, p.vD, 2, 3, 0.4, 12].join(',')).join('\n'),
      desordenadoYDuplicado: 'time,lat,lon,alt\n' + pts.slice().reverse().concat(pts.slice(0, 50)).map((p) => [p.t, p.lat, p.lon, p.alt].join(',')).join('\n'),
      irreconocible: 'hola,mundo\n1,2\n',
      pocosPuntos: 'time,lat,lon,alt\n' + pts.slice(0, 10).map((p) => [p.t, p.lat, p.lon, p.alt].join(',')).join('\n'),
    };
    for (const [name, text] of Object.entries(variants)) {
      let a: unknown, b: unknown, ea: string | null = null, eb: string | null = null;
      try { a = W.parseTrack(text, name); } catch (e) { ea = (e as Error).message; }
      try { b = legacy.parseTrack(text, name); } catch (e) { eb = (e as Error).message; }
      expect(ea, name).toBe(eb);
      expect(a, name).toStrictEqual(b);
    }
  });

  test('parseTime', () => {
    // parseTime no se exportaba en la versión vieja: su paridad queda cubierta por los formatos de arriba.
    expect(W.parseTime('1714557600250')).toBe(1714557600.25);
    expect(W.parseTime('2024-05-01 10:00:00')).toBe(1714557600);
    expect(W.parseTime('2024-05-01T13:00:00.250+03:00')).toBe(1714557600.25);
    expect(W.parseTime('1714557600')).toBe(1714557600);
    expect(W.parseTime('x')).toBeNaN();
    expect(W.parseTime('')).toBeNaN();
  });
});

describe('puntaje del salto', () => {
  test.each(FIXTURES)('%s: scoreJump, groundSpeeds, findExit y pointAtTime', (name) => {
    let pts: TrackPoint[];
    try { pts = W.parseTrack(files[name], name).pts; } catch { return; }
    const ground = name.includes('Ravenna') ? 0 : minAlt(pts);
    const configs: W.ScoreConfigInput[] = [
      { elev: ground },
      { elev: ground, top: 3000, bottom: 2000 },
      { elev: String(ground), valDelay: '11', laneWidth: 400, sepLimit: 3, minHz: 12 },
      { elev: ground + 1500 },
      { elev: ground - 2000, exitMin: 7000 },
      {},
      { elev: ground, valVs: 60 },
    ];
    for (const cfg of configs) {
      const base = W.scoreJump(pts, cfg);
      expect(base, JSON.stringify(cfg)).toStrictEqual(legacy.scoreJump(pts, cfg));
      for (const ref of refsAround(base)) {
        expect(W.scoreJump(pts, cfg, ref), JSON.stringify({ cfg, ref })).toStrictEqual(legacy.scoreJump(pts, cfg, ref));
      }
    }
    // Barrido fino de rumbos alrededor de la recta salida → fin de ventana: el desvío varía en forma
    // continua y pasa por los bordes de cada nivel de penalidad (0, 150 y 300 m fuera del carril).
    const base = W.scoreJump(pts, configs[0]);
    if (base.ok) {
      for (const ref of sweepRefs(base)) {
        const a = W.scoreJump(pts, configs[0], ref);
        expect(a, JSON.stringify(ref)).toStrictEqual(legacy.scoreJump(pts, configs[0], ref));
        if (a.lane) laneOutsides.push(a.lane.outside);
      }
    }
    expect(W.groundSpeeds(pts)).toStrictEqual(legacy.groundSpeeds(pts));
    expect(W.findExit(pts)).toStrictEqual(legacy.findExit(pts));
    for (const f of [-0.5, 0, 0.13, 0.5, 0.77, 1, 1.5]) {
      const t = pts[0].t + (pts[pts.length - 1].t - pts[0].t) * f;
      expect(W.pointAtTime(pts, t)).toStrictEqual(legacy.pointAtTime(pts, t));
    }
  });

  test('el barrido de carril cubrió los bordes de cada nivel de penalidad', () => {
    const near = (x: number, lo: number, hi: number) => laneOutsides.some((o) => o > lo && o < hi);
    expect(near(0, -1, 0.0001), 'dentro del carril').toBe(true);
    expect(near(0, 0, 10), 'apenas fuera').toBe(true);
    expect(near(0, 135, 150), 'justo debajo de 150 m').toBe(true);
    expect(near(0, 150, 165), 'justo encima de 150 m').toBe(true);
    expect(near(0, 285, 300), 'justo debajo de 300 m').toBe(true);
    expect(near(0, 300, 315), 'justo encima de 300 m').toBe(true);
  });

  test.each(FIXTURES)('%s: track compacto (trim, pack, unpack y re-puntaje)', (name) => {
    let pts: TrackPoint[];
    try { pts = W.parseTrack(files[name], name).pts; } catch { return; }
    const cfg = { elev: name.includes('Ravenna') ? 0 : minAlt(pts) };
    const sc = W.scoreJump(pts, cfg);
    const trimmed = W.trimTrack(pts, sc);
    expect(trimmed).toStrictEqual(legacy.trimTrack(pts, sc));
    const packed = W.packTrack(trimmed);
    expect(JSON.stringify(packed)).toBe(JSON.stringify(legacy.packTrack(trimmed))); // mismos bytes: mismas huellas
    const back = W.unpackTrack(packed);
    expect(back).toStrictEqual(legacy.unpackTrack(packed));
    expect(W.scoreJump(back, cfg)).toStrictEqual(legacy.scoreJump(back, cfg));
  });

  test('separación entre competidores (5.6.3)', () => {
    const pts = W.parseTrack(files['flysight.csv']).pts;
    const cfg = { elev: minAlt(pts) };
    const sA = W.scoreJump(pts, cfg);
    for (const [dLat, dLon, dAlt, dt] of [[0.001, 0, 0, 0], [0, 0.0005, 30, 0.4], [0.0003, -0.0002, -10, 2], [0.02, 0.02, 0, 0], [0, 0, 0, 500]]) {
      const other = pts.map((p) => ({ ...p, lat: p.lat + dLat, lon: p.lon + dLon, alt: p.alt + dAlt, t: p.t + dt }));
      const sB = W.scoreJump(other, cfg);
      expect(W.minSeparation(pts, sA, other, sB)).toStrictEqual(legacy.minSeparation(pts, sA, other, sB));
    }
  });

  test('utilidades: vincenty, projector, roundHalfUp', () => {
    const pairs = [[-33.0, -61.0, -33.02, -60.97], [49.44, 17.13, 49.47, 17.17], [0, 0, 0, 0], [10, 10, 10, 10.0000001], [-89, 0, 89, 179]];
    for (const [a, b, c, d] of pairs) {
      expect(W.vincenty(a, b, c, d)).toBe(legacy.vincenty(a, b, c, d));
      expect(W.projector(a, b)(c, d)).toStrictEqual(legacy.projector(a, b)(c, d));
    }
    for (const [x, d] of [[23.5, 0], [1.005, 2], [92.15, 1], [-2.5, 0], [0.05, 1], [99.95, 1], [3410.45, 0], [1e-10, 3]]) {
      expect(W.roundHalfUp(x, d)).toBe(legacy.roundHalfUp(x, d));
    }
    expect(W.DEFAULT_CFG).toStrictEqual(legacy.DEFAULT_CFG);
    expect([...W.TASKS]).toStrictEqual(legacy.TASKS);
  });
});

// ---------- clasificación con datos al azar ----------
function prng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function randomEvent(seed: number): { jumps: JumpRecord[]; pilots: string[]; tiebreak: { task: string } | null } {
  const rnd = prng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const nPilots = 2 + Math.floor(rnd() * 9);
  const pilots = Array.from({ length: nPilots }, (_, i) => 'p' + i);
  const rounds = 1 + Math.floor(rnd() * 3);
  const jumps: JumpRecord[] = [];
  let tExit = 1000;
  for (let r = 1; r <= rounds; r++) {
    for (const task of ['time', 'distance', 'speed']) {
      for (const p of pilots) {
        if (rnd() < 0.1) continue; // no saltó
        const j: JumpRecord = {
          pilotId: p, task, round: rnd() < 0.2 ? String(r) : r, ok: rnd() > 0.05, tExit: (tExit += 1 + rnd() * 50),
          time: 60 + Math.round(rnd() * 400) / 10, distance: 2000 + rnd() * 2000, speed: 150 + Math.round(rnd() * 1200) / 10,
        };
        // Empates forzados para probar puestos compartidos
        if (rnd() < 0.15) { j.time = 80; j.distance = 3000; j.speed = 200; }
        if (rnd() < 0.25) { j.lanePen = pick([10, 20, 50]); j.laneOutside = Math.round(rnd() * 5000) / 10; }
        if (rnd() < 0.1) j.laneDecision = pick(['', '0', 10, '20', 50, null]);
        if (rnd() < 0.05) j.penManual = pick(['', '30', 0, 100, null]);
        if (rnd() < 0.05) { j.sepViolation = true; j.sepMin = 120; if (rnd() < 0.5) j.sepApply = false; }
        if (rnd() < 0.05) j.exitPen = pick([50, '100', '', 0]);
        if (rnd() < 0.04) j.void = true;
        if (rnd() < 0.02) j.task = 'otra';
        jumps.push(j);
      }
    }
  }
  let tiebreak: { task: string } | null = null;
  if (rnd() < 0.5) {
    tiebreak = { task: pick(['time', 'distance', 'speed']) };
    for (const p of pilots.slice(0, 3)) jumps.push({ pilotId: p, task: tiebreak.task, round: 0, ok: true, tExit: (tExit += 10), time: 70 + rnd() * 10, distance: 3000 + rnd() * 100, speed: 220 });
  }
  if (rnd() < 0.3) jumps.push({ pilotId: 'fuera-de-lista', task: 'time', round: 1, ok: true, time: 81, tExit: 1 });
  return { jumps, pilots: rnd() < 0.8 ? pilots.concat(['sin-saltos']) : [], tiebreak };
}

describe('clasificación', () => {
  test('500 jornadas al azar dan exactamente lo mismo', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const ev = randomEvent(seed);
      const a = structuredClone(ev.jumps), b = structuredClone(ev.jumps);
      const sa = W.standings(a, ev.pilots.length ? ev.pilots : null, { tiebreak: ev.tiebreak });
      const sb = legacy.standings(b, ev.pilots.length ? ev.pilots : null, { tiebreak: ev.tiebreak });
      expect(sa, 'semilla ' + seed).toStrictEqual(sb);
      expect(a, 'semilla ' + seed).toStrictEqual(b); // mismas marcas _pen, _result, _points...
    }
  });

  test('effectivePenalties y finalResult', () => {
    for (let seed = 1000; seed < 1100; seed++) {
      const ev = randomEvent(seed);
      const a = structuredClone(ev.jumps), b = structuredClone(ev.jumps);
      W.effectivePenalties(a); legacy.effectivePenalties(b);
      expect(a).toStrictEqual(b);
      a.forEach((j, i) => { for (const t of W.TASKS) expect(W.finalResult(j, t)).toBe(legacy.finalResult(b[i], t)); });
    }
  });
});
