// Validación contra la 5.ª Copa del Mundo FAI de Wingsuit Flying (Prostějov, 2025), puntuada oficialmente con Skyderby.
// Ver docs/validacion-copa-del-mundo-2025.md. Criterios (CLAUDE.md, etapa 1):
//   - 333 de 333 saltos con el mismo resultado que el oficial, sin redondear y redondeado (5.10.1);
//   - penalidad de carril con el mismo nivel en 17 de los 18 saltos que penalizaron los jueces
//     (330 de 333 en total; los 3 distintos son los casos al límite descritos en el documento).
// Configuración del motor: reglamento sin cambios, elevación del DZ publicada por el evento (214 m),
// punto de referencia asignado a cada salto.
import { beforeAll, describe, expect, test } from 'vitest';
import * as W from '../lib/engine';
import type { ScoreResult, Task, TrackPoint } from '../lib/engine';
import { loadCopa2025, type Copa2025, type CopaJump } from './support/copa2025';
import { legacy } from './support/legacy';

/** La API publica el resultado oficial con 5 decimales. */
const API_PRECISION = 1e-5;

const round5101 = (task: Task, v: number) => (task === 'distance' ? W.roundHalfUp(v, 0) : W.roundHalfUp(v, 1));

/**
 * Dos formas de pasar los puntos de Skyderby al motor:
 *  - 'velD del GPS': usa la velocidad vertical que trae el punto (como al leer un FlySight real);
 *  - 'velD derivada': la deriva de la altura, como hace el motor con archivos sin velD. Es la que
 *    usó la validación del documento (reproduce su rango de salida: −0,41 a +0,35 s, mediana −0,11 s).
 */
const VARIANTS = {
  'velD del GPS': (pts: TrackPoint[]) => pts,
  'velD derivada': (pts: TrackPoint[]) => W.parseTrack(
    'time,lat,lon,hMSL\n' + pts.map((p) => [new Date(p.t * 1000).toISOString(), p.lat, p.lon, p.alt].join(',')).join('\n'),
  ).pts,
} as const;

interface Row { j: CopaJump; s: ScoreResult; pts: TrackPoint[] }

let copa: Copa2025;
const rows: Record<keyof typeof VARIANTS, Row[]> = { 'velD del GPS': [], 'velD derivada': [] };

beforeAll(async () => {
  copa = await loadCopa2025();
  for (const j of copa.jumps) {
    const raw = await copa.points(j.trackId);
    for (const [name, conv] of Object.entries(VARIANTS) as [keyof typeof VARIANTS, (p: TrackPoint[]) => TrackPoint[]][]) {
      const pts = conv(raw);
      rows[name].push({ j, pts, s: W.scoreJump(pts, { elev: copa.elev, top: copa.top, bottom: copa.bottom }, j.ref) });
    }
  }
});

test('datos del evento', () => {
  expect(copa.name).toBe('5th FAI World Cup of Wingsuit Flying');
  expect(copa.elev).toBe(214);
  expect([copa.top, copa.bottom]).toEqual([2500, 1500]); // 2.2
  expect(copa.jumps).toHaveLength(333);
  for (const t of W.TASKS) expect(copa.jumps.filter((j) => j.task === t)).toHaveLength(111);
  expect(copa.jumps.every((j) => j.ref)).toBe(true);
});

describe.each(Object.keys(VARIANTS) as (keyof typeof VARIANTS)[])('%s', (variant) => {
  const R = () => rows[variant];

  test('333 de 333 saltos idénticos al resultado oficial', () => {
    const distintos = R().filter(({ j, s }) => !s.ok || Math.abs(s[j.task]! - j.official) >= API_PRECISION)
      .map(({ j, s }) => `${j.competitor} ${j.task} ${j.round}: ${s.ok ? s[j.task] : s.error} vs ${j.official}`);
    expect(distintos).toEqual([]);
    const redondeoDistinto = R().filter(({ j, s }) => round5101(j.task, s[j.task]!) !== round5101(j.task, j.official));
    expect(redondeoDistinto).toHaveLength(0);
  });

  test('instante de salida a menos de 0,5 s del oficial', () => {
    const d = R().map(({ j, s }) => s.tExit! - j.exitedAt!).sort((a, b) => a - b);
    expect(d[0]).toBeGreaterThan(-0.5);
    expect(d[d.length - 1]).toBeLessThan(0.5);
    expect(Math.abs(d[d.length >> 1])).toBeLessThan(0.15);
  });

  test('penalidad de carril: 17 de 18 penalizados y 330 de 333 en total', () => {
    const level = (r: Row) => r.s.lane?.penalty ?? 0;
    const penalizados = R().filter(({ j }) => j.penaltySize > 0);
    expect(penalizados).toHaveLength(18);
    // Todas las penalidades del evento son de carril (5.6.2.x)
    expect(penalizados.every(({ j }) => /^5\.6\.2\.[123] lane violation/.test(j.penaltyReason ?? ''))).toBe(true);
    expect(penalizados.filter((r) => level(r) === r.j.penaltySize)).toHaveLength(17);
    const distintos = R().filter((r) => level(r) !== r.j.penaltySize)
      .map((r) => `${r.j.competitor} ${r.j.task} ${r.j.round}: juez ${r.j.penaltySize} %, motor ${level(r)} % (${r.s.lane?.outside} m)`)
      .sort();
    // Los tres casos al límite del documento
    expect(distintos).toHaveLength(3);
    expect(distintos[0]).toMatch(/^Jörg Kleine speed 1: juez 0 %, motor 10 %/);
    expect(distintos[1]).toMatch(/^Jörg Kleine time 1: juez 20 %, motor 10 %/);
    expect(distintos[2]).toMatch(/^Liam Brands time 3: juez 0 %, motor 10 %/);
  });

  test('metros fuera del carril cerca de los que anotó el juez', () => {
    for (const { j, s } of R()) {
      const m = /lane violation ([\d.]+)m/.exec(j.penaltyReason ?? '');
      if (!m) continue;
      const juez = +m[1];
      // El juez midió sobre el mapa en algunos saltos; el caso más lejano es Luca Sala (116,3 vs ~100 m).
      // Jörg Kleine, tiempo 1: el inicio del carril mueve ~34 m por segundo (ver documento).
      const tol = j.competitor === 'Jörg Kleine' && j.task === 'time' ? 20 : 17;
      expect(Math.abs(s.lane!.outside - juez), `${j.competitor} ${j.task} ${j.round}`).toBeLessThan(tol);
    }
  });

  test('el motor viejo da exactamente lo mismo en los 333 saltos', () => {
    for (const { j, s, pts } of R()) {
      expect(s, `${j.competitor} ${j.task} ${j.round}`).toStrictEqual(
        legacy.scoreJump(pts, { elev: copa.elev, top: copa.top, bottom: copa.bottom }, j.ref),
      );
    }
  });
});

test('clasificación oficial: mismos puntos y puestos en las dos categorías (5.10)', () => {
  // Con el resultado del motor y la penalidad que fijaron los jueces, cada categoría del scoreboard
  // (el % se calcula dentro de la categoría) da el mismo total y el mismo puesto que Skyderby.
  // Nota: Skyderby muestra la distancia truncada (3914,78 → "3914") pero puntúa con el valor redondeado,
  // igual que 5.10.1; si se truncara, Enzo Dezulueta daría 248,8 en vez de 248,9.
  expect(copa.groups.map((g) => [g.category, g.rows.length])).toEqual([['Female', 2], ['Male', 35]]);
  for (const g of copa.groups) {
    const ids = new Set(g.rows.map((r) => r.competitor));
    const jumps = rows['velD del GPS'].filter(({ j }) => ids.has(j.competitor)).map(({ j, s }) => ({
      pilotId: j.competitor, task: j.task, round: j.round, ok: s.ok, time: s.time, distance: s.distance, speed: s.speed,
      tExit: s.tExit, laneDecision: j.penaltySize,
    }));
    const st = W.standings(structuredClone(jumps));
    expect(st).toStrictEqual(legacy.standings(structuredClone(jumps)));
    const ours = st.rows.map((r) => [r.pilotId, r.rank, r.totalRounded]);
    const official = g.rows.map((r) => [r.competitor, r.rank, r.totalPoints]);
    expect(ours, g.category).toEqual(official);
  }
});
