// Validation against the 5th FAI Wingsuit Flying World Cup (Prostějov, 2025), officially scored with Skyderby.
// See docs/world-cup-2025-validation.md. Criteria (CLAUDE.md, stage 1):
//   - 333 of 333 jumps with the same result as the official one, unrounded and rounded (5.10.1);
//   - lane penalty at the same level in 17 of the 18 jumps the judges penalized
//     (330 of 333 overall; the 3 that differ are the borderline cases described in the document).
// Engine config: unchanged rules, DZ elevation published by the event (214 m),
// reference point assigned to each jump.
import { beforeAll, describe, expect, test } from 'vitest';
import * as W from '../lib/engine';
import type { ScoreResult, Task, TrackPoint } from '../lib/engine';
import { loadWorldCup2025, type WorldCup2025, type WorldCupJump } from './support/world-cup-2025';
import { legacy } from './support/legacy';

/** The API publishes the official result with 5 decimals. */
const API_PRECISION = 1e-5;

const round5101 = (task: Task, v: number) => (task === 'distance' ? W.roundHalfUp(v, 0) : W.roundHalfUp(v, 1));

/**
 * Two ways of feeding Skyderby points to the engine:
 *  - 'GPS velD': uses the vertical speed the point carries (as when reading a real FlySight);
 *  - 'derived velD': derives it from altitude, as the engine does for files without velD. This is what
 *    the document's validation used (it reproduces its exit range: −0.41 to +0.35 s, median −0.11 s).
 */
const VARIANTS = {
  'GPS velD': (pts: TrackPoint[]) => pts,
  'derived velD': (pts: TrackPoint[]) => W.parseTrack(
    'time,lat,lon,hMSL\n' + pts.map((p) => [new Date(p.t * 1000).toISOString(), p.lat, p.lon, p.alt].join(',')).join('\n'),
  ).pts,
} as const;

interface Row { j: WorldCupJump; s: ScoreResult; pts: TrackPoint[] }

let wc: WorldCup2025;
const rows: Record<keyof typeof VARIANTS, Row[]> = { 'GPS velD': [], 'derived velD': [] };

beforeAll(async () => {
  wc = await loadWorldCup2025();
  for (const j of wc.jumps) {
    const raw = await wc.points(j.trackId);
    for (const [name, conv] of Object.entries(VARIANTS) as [keyof typeof VARIANTS, (p: TrackPoint[]) => TrackPoint[]][]) {
      const pts = conv(raw);
      rows[name].push({ j, pts, s: W.scoreJump(pts, { elev: wc.elev, top: wc.top, bottom: wc.bottom }, j.ref) });
    }
  }
});

test('event data', () => {
  expect(wc.name).toBe('5th FAI World Cup of Wingsuit Flying');
  expect(wc.elev).toBe(214);
  expect([wc.top, wc.bottom]).toEqual([2500, 1500]); // 2.2
  expect(wc.jumps).toHaveLength(333);
  for (const t of W.TASKS) expect(wc.jumps.filter((j) => j.task === t)).toHaveLength(111);
  expect(wc.jumps.every((j) => j.ref)).toBe(true);
});

describe.each(Object.keys(VARIANTS) as (keyof typeof VARIANTS)[])('%s', (variant) => {
  const R = () => rows[variant];

  test('333 of 333 jumps identical to the official result', () => {
    const different = R().filter(({ j, s }) => !s.ok || Math.abs(s[j.task]! - j.official) >= API_PRECISION)
      .map(({ j, s }) => `${j.competitor} ${j.task} ${j.round}: ${s.ok ? s[j.task] : s.error} vs ${j.official}`);
    expect(different).toEqual([]);
    const roundedDifferent = R().filter(({ j, s }) => round5101(j.task, s[j.task]!) !== round5101(j.task, j.official));
    expect(roundedDifferent).toHaveLength(0);
  });

  test('exit instant within 0.5 s of the official one', () => {
    const d = R().map(({ j, s }) => s.tExit! - j.exitedAt!).sort((a, b) => a - b);
    expect(d[0]).toBeGreaterThan(-0.5);
    expect(d[d.length - 1]).toBeLessThan(0.5);
    expect(Math.abs(d[d.length >> 1])).toBeLessThan(0.15);
  });

  test('lane penalty: 17 of 18 penalized and 330 of 333 overall', () => {
    const level = (r: Row) => r.s.lane?.penalty ?? 0;
    const penalized = R().filter(({ j }) => j.penaltySize > 0);
    expect(penalized).toHaveLength(18);
    // Every penalty in the event is a lane penalty (5.6.2.x)
    expect(penalized.every(({ j }) => /^5\.6\.2\.[123] lane violation/.test(j.penaltyReason ?? ''))).toBe(true);
    expect(penalized.filter((r) => level(r) === r.j.penaltySize)).toHaveLength(17);
    const different = R().filter((r) => level(r) !== r.j.penaltySize)
      .map((r) => `${r.j.competitor} ${r.j.task} ${r.j.round}: judge ${r.j.penaltySize} %, engine ${level(r)} % (${r.s.lane?.outside} m)`)
      .sort();
    // The three borderline cases from the document
    expect(different).toHaveLength(3);
    expect(different[0]).toMatch(/^Jörg Kleine speed 1: judge 0 %, engine 10 %/);
    expect(different[1]).toMatch(/^Jörg Kleine time 1: judge 20 %, engine 10 %/);
    expect(different[2]).toMatch(/^Liam Brands time 3: judge 0 %, engine 10 %/);
  });

  test('metres outside the lane close to what the judge recorded', () => {
    for (const { j, s } of R()) {
      const m = /lane violation ([\d.]+)m/.exec(j.penaltyReason ?? '');
      if (!m) continue;
      const judge = +m[1];
      // The judge measured on the map for some jumps; the furthest case is Luca Sala (116.3 vs ~100 m).
      // Jörg Kleine, time 1: the lane start moves ~34 m per second (see document).
      const tol = j.competitor === 'Jörg Kleine' && j.task === 'time' ? 20 : 17;
      expect(Math.abs(s.lane!.outside - judge), `${j.competitor} ${j.task} ${j.round}`).toBeLessThan(tol);
    }
  });

  test('the legacy engine gives exactly the same on all 333 jumps', () => {
    for (const { j, s, pts } of R()) {
      expect(s, `${j.competitor} ${j.task} ${j.round}`).toStrictEqual(
        legacy.scoreJump(pts, { elev: wc.elev, top: wc.top, bottom: wc.bottom }, j.ref),
      );
    }
  });
});

test('official standings: same points and ranks in both categories (5.10)', () => {
  // With the engine result and the penalty set by the judges, each scoreboard category
  // (the % is computed within the category) gives the same total and rank as Skyderby.
  // Note: Skyderby displays distance truncated (3914.78 → "3914") but scores with the rounded value,
  // as in 5.10.1; truncating would give Enzo Dezulueta 248.8 instead of 248.9.
  expect(wc.groups.map((g) => [g.category, g.rows.length])).toEqual([['Female', 2], ['Male', 35]]);
  for (const g of wc.groups) {
    const ids = new Set(g.rows.map((r) => r.competitor));
    const jumps = rows['GPS velD'].filter(({ j }) => ids.has(j.competitor)).map(({ j, s }) => ({
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
