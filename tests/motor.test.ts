// Casos conocidos del motor: los tracks de prueba de Skyderby, el redondeo y la clasificación
// (lo que probaba legacy/src/test.js) y la jornada de ejemplo que arma legacy/src/build.js.
import { beforeAll, describe, expect, test } from 'vitest';
import * as W from '../lib/engine';
import type { JumpRecord, TrackPoint } from '../lib/engine';
import { legacy } from './support/legacy';
import { loadAllFixtures, type FixtureName } from './support/fixtures';

let files: Record<FixtureName, string>;
beforeAll(async () => { files = await loadAllFixtures(); });

const minAlt = (pts: TrackPoint[]) => pts.reduce((m, p) => Math.min(m, p.alt), Infinity);

describe('tracks de prueba de Skyderby', () => {
  test('Ravenna, ventana 3000–2000 m sobre el nivel del mar: igual a Skyderby', () => {
    const tr = W.parseTrack(files['13-31-51_Ravenna.CSV'], 'Ravenna');
    expect(tr.device).toBe('FlySight');
    const s = W.scoreJump(tr.pts, { elev: 0, top: 3000, bottom: 2000 });
    expect(s.ok).toBe(true);
    // Skyderby: tiempo 92,16 s, distancia 3410,8 m, velocidad 133,2 km/h
    expect(s.time!).toBeCloseTo(92.16, 1);
    expect(W.roundHalfUp(s.distance!, 1)).toBe(3410.8);
    expect(W.roundHalfUp(s.speed!, 1)).toBe(133.2);
  });

  test('Csaba, sin lugar (suelo = altura mínima registrada, como Skyderby): igual a Skyderby', () => {
    const tr = W.parseTrack(files['2014-Csaba-Round-1.CSV'], 'Csaba');
    const s = W.scoreJump(tr.pts, { elev: minAlt(tr.pts), top: 3000, bottom: 2000 });
    // Skyderby: tiempo 38,5 s, distancia 2110 m, velocidad 197,4 km/h (valores redondeados por Skyderby)
    expect(W.roundHalfUp(s.time!, 1)).toBe(38.5);
    expect(Math.abs(s.distance! - 2110)).toBeLessThan(1);
    expect(Math.abs(s.speed! - 197.4)).toBeLessThan(0.15);
  });

  // Valores de la versión vieja (salida de `node legacy/src/test.js`), ventana 2500–1500 m sobre la altura mínima.
  test.each([
    ['flysight.csv', 'FlySight', 32.75, 1080.5, 118.8, 10, 'exit_high'],
    ['fs2-track.csv', 'FlySight 2', 82.51, 3673.3, 160.3, 5, 'sep,exit_high'],
    ['distance_2645.csv', 'FlySight', 66.61, 1962.5, 106.1, 5, 'exit_high'],
    ['distance_2454.csv', 'FlySight', 61.83, 1965.1, 114.4, 5, 'exit_high'],
    ['distance_3107.csv', 'FlySight', 57.41, 2269.0, 142.3, 5, 'exit_high'],
    ['cyber_eye.csv', 'FlySight (sin encabezado)', 63.37, 2476.5, 140.7, 5, 'exit_high'],
    ['flysight2_2762_noisy_climb.csv', 'FlySight 2', 46.19, 2304.6, 179.6, 5, 'sep,exit_high'],
  ] as const)('%s', (name, device, time, distance, speed, hz, flags) => {
    const tr = W.parseTrack(files[name], name);
    expect(tr.device).toBe(device);
    const s = W.scoreJump(tr.pts, { elev: minAlt(tr.pts) });
    expect(s.ok).toBe(true);
    expect(s.time!.toFixed(2)).toBe(time.toFixed(2));
    expect(s.distance!.toFixed(1)).toBe(distance.toFixed(1));
    expect(s.speed!.toFixed(1)).toBe(speed.toFixed(1));
    expect(s.hz).toBe(hz);
    expect(s.flags.map((f) => f.code).join(',')).toBe(flags);
    // Re-puntuar desde el track compacto da lo mismo
    const s2 = W.scoreJump(W.unpackTrack(W.packTrack(W.trimTrack(tr.pts, s))), { elev: minAlt(tr.pts) });
    expect(s2.time!.toFixed(2)).toBe(time.toFixed(2));
    expect(s2.distance!.toFixed(1)).toBe(distance.toFixed(1));
    expect(s2.speed!.toFixed(1)).toBe(speed.toFixed(1));
  });

  test('GPX con salida por debajo de la ventana: error explicado', () => {
    const tr = W.parseTrack(files['one_track.gpx'], 'one_track.gpx');
    expect(tr.device).toBe('GPX');
    const s = W.scoreJump(tr.pts, { elev: minAlt(tr.pts) });
    expect(s.ok).toBe(false);
    expect(s.error).toBe('La salida (2113 m AGL) fue por debajo del límite superior de la ventana (2500 m).');
  });
});

describe('redondeo y clasificación (5.10)', () => {
  test('medios hacia arriba (2.1, 5.10.1)', () => {
    expect(W.roundHalfUp(23.5, 0)).toBe(24);
    expect(W.roundHalfUp(1.005, 2)).toBe(1.01);
    expect(W.roundHalfUp(92.15, 1)).toBe(92.2);
  });

  const J = (p: string, task: string, round: number, v: number, extra?: Partial<JumpRecord>): JumpRecord => ({
    pilotId: p, task, round, ok: true, time: 0, distance: 0, speed: 0, [task]: v,
    tExit: round * 10 + ['time', 'distance', 'speed'].indexOf(task), ...extra,
  });

  test('porcentaje del mejor, promedio por tarea, segunda vez fuera >300 m = cero', () => {
    const st = W.standings([
      J('a', 'time', 1, 80), J('b', 'time', 1, 60), J('a', 'distance', 1, 4000), J('b', 'distance', 1, 4400.4),
      J('a', 'speed', 1, 250, { lanePen: 50, laneOutside: 320 }), J('b', 'speed', 1, 200),
      J('a', 'time', 2, 70, { lanePen: 50, laneOutside: 400 }), J('b', 'time', 2, 70),
    ], ['a', 'b', 'c']);
    const summary = st.rows.map((r) => [r.rank, r.pilotId, r.totalRounded,
      Object.fromEntries(Object.entries(r.tasks).map(([k, v]) => [k, +v!.points.toFixed(2)]))]);
    expect(summary).toEqual([
      [1, 'b', 287.5, { time: 87.5, distance: 100, speed: 100 }],
      [2, 'a', 203.4, { time: 50, distance: 90.91, speed: 62.5 }],
      [3, 'c', 0, { time: 0, distance: 0, speed: 0 }],
    ]);
    expect(st.rounds).toEqual({ time: [1, 2], distance: [1], speed: [1] });
  });

  test('empate: desempate en ronda 0 y puesto compartido (5.10.6)', () => {
    const base = () => [J('a', 'time', 1, 80), J('b', 'time', 1, 80), J('c', 'time', 1, 40)];
    const sinDesempate = W.standings(base(), null);
    expect(sinDesempate.rows.map((r) => [r.pilotId, r.rank])).toEqual([['a', 1], ['b', 1], ['c', 3]]);
    const conDesempate = W.standings([...base(), J('a', 'time', 0, 70), J('b', 'time', 0, 75)], null, { tiebreak: { task: 'time' } });
    expect(conDesempate.rows.map((r) => [r.pilotId, r.rank, r.tb])).toEqual([['b', 1, 75], ['a', 2, 70], ['c', 3, null]]);
    expect(conDesempate.tiebreak).toHaveLength(2);
  });

  test('decisiones del juez: manual manda, anulado no cuenta, separación y salida suman hasta 100 %', () => {
    const js = [
      J('a', 'time', 1, 100, { lanePen: 20, laneOutside: 160, penManual: '5' }),
      J('b', 'time', 1, 100, { lanePen: 20, laneOutside: 160, laneDecision: '10' }),
      J('c', 'time', 1, 100, { sepViolation: true, sepMin: 120, sepApply: false, exitPen: 50 }),
      J('d', 'time', 1, 100, { sepViolation: true, sepMin: 120, lanePen: 10, laneOutside: 5 }),
      J('e', 'time', 1, 100, { void: true }),
    ];
    W.effectivePenalties(js);
    expect(js.map((j) => j._pen)).toEqual([5, 10, 50, 100, 0]);
    expect(js[4]._penWhy).toBe('Anulado por re-salto');
    expect(js.map((j) => W.finalResult(j, 'time'))).toEqual([95, 90, 50, 0, 100]);
  });
});

describe('jornada de ejemplo (la que trae la versión vieja, legacy/src/build.js)', () => {
  const DEMO = [
    ['Piloto A', 'fs2-track.csv'], ['Piloto B', 'cyber_eye.csv'], ['Piloto C', 'distance_3107.csv'],
    ['Piloto D', 'flysight2_2762_noisy_climb.csv'], ['Piloto E', '13-31-51_Ravenna.CSV'],
  ] as const;

  // Misma construcción que build.js, con el motor que se le pase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildDemo(E: any) {
    return DEMO.map(([name, f]) => {
      const tr = E.parseTrack(files[f], f);
      let ground = f.includes('Ravenna') ? 0 : Infinity;
      if (ground) tr.pts.forEach((p: TrackPoint) => { if (p.alt < ground) ground = p.alt; });
      tr.pts.forEach((p: TrackPoint) => { p.alt -= ground; });
      const sc = E.scoreJump(tr.pts, { elev: 0 });
      if (!sc.ok) throw new Error(f + ': ' + sc.error);
      const pts = E.trimTrack(tr.pts, sc), out: TrackPoint[] = [];
      let last = -1;
      pts.forEach((p: TrackPoint) => { if (p.t - last >= 0.19) { out.push(p); last = p.t; } });
      return { name, device: tr.device, file: 'track de prueba', track: E.packTrack(out) };
    });
  }

  test('los tracks compactos son byte a byte iguales', () => {
    expect(JSON.stringify(buildDemo(W))).toBe(JSON.stringify(buildDemo(legacy)));
  });

  test('misma clasificación (3 rondas por tarea con los 5 pilotos)', () => {
    const demo = buildDemo(W);
    const jumps: JumpRecord[] = [];
    // Cada piloto vuela su track en cada tarea y ronda, con un carril que lo penaliza distinto según la ronda.
    demo.forEach((d, i) => {
      const pts = W.unpackTrack(d.track);
      W.TASKS.forEach((task, ti) => {
        for (let round = 1; round <= 3; round++) {
          const sc = W.scoreJump(pts, { elev: 0 });
          const ang = ((i * 37 + ti * 11 + round * 23) % 60 - 30) * Math.PI / 180;
          const dx = (sc.pBot!.lon - sc.exitLon!) * 111320 * Math.cos(sc.exitLat! * Math.PI / 180), dy = (sc.pBot!.lat - sc.exitLat!) * 110540;
          const ref = { lat: sc.exitLat! + (dx * Math.sin(ang) + dy * Math.cos(ang)) / 110540, lon: sc.exitLon! + (dx * Math.cos(ang) - dy * Math.sin(ang)) / (111320 * Math.cos(sc.exitLat! * Math.PI / 180)) };
          const a = W.scoreJump(pts, { elev: 0 }, ref);
          expect(a).toStrictEqual(legacy.scoreJump(pts, { elev: 0 }, ref));
          jumps.push({
            pilotId: d.name, task, round, ok: a.ok, time: a.time, distance: a.distance, speed: a.speed,
            tExit: a.tExit! + round * 86400 + ti * 3600, lanePen: a.lane?.penalty ?? null, laneOutside: a.lane?.outside ?? null,
          });
        }
      });
    });
    const sa = W.standings(structuredClone(jumps), DEMO.map((d) => d[0]));
    const sb = legacy.standings(structuredClone(jumps), DEMO.map((d) => d[0]));
    expect(sa).toStrictEqual(sb);
    expect(sa.rows.map((r) => r.totalRounded)).toEqual(sb.rows.map((r: { totalRounded: number }) => r.totalRounded));
  });
});
