// Standings views (female, teams, per task) and judging status, as the previous platform shows them.
import { expect, test } from 'vitest';
import type { JumpRecord } from '../lib/engine';
import { eventStandings, femaleRows, jumpStatus, taskRows, teamRows, type PilotInfo } from '../lib/standings/views';
import { passPlan, reverseOrder, topTies } from '../lib/standings/order';

const P: Record<string, PilotInfo> = {
  a: { name: 'A', gender: 'F', team: 'Rosario' }, b: { name: 'B', gender: '', team: 'Rosario' }, c: { name: 'C', gender: 'F', team: 'Rosario' },
  d: { name: 'D', gender: 'F', team: 'Córdoba' }, e: { name: 'E', gender: '', team: '' },
};
const J = (p: string, task: string, v: number): JumpRecord => ({ pilotId: p, task, round: 1, ok: true, time: 0, distance: 0, speed: 0, [task]: v, tExit: 1 });

test('female and team views rank on the same points, with shared ranks and nomination', () => {
  const { st } = eventStandings({ tiebreak: null }, [J('a', 'time', 80), J('b', 'time', 90), J('c', 'time', 80), J('d', 'time', 60), J('e', 'time', 100)]);
  expect(femaleRows(st, (id) => P[id]).map((r) => [r.pilotId, r._rank])).toEqual([['a', 1], ['c', 1], ['d', 3]]);
  expect(taskRows(st, 'time').map((r) => r._rank)).toEqual([1, 2, 3, 3, 5]);
  const two = teamRows({ team_size: 2, team_pick: {} }, st, (id) => P[id]);
  expect(two.map((t) => [t.name, t.state, t._rank])).toEqual([['Córdoba', 'short', 1], ['Rosario', 'pick', 0]]);
  const picked = teamRows({ team_size: 2, team_pick: { Rosario: ['a', 'b'] } }, st, (id) => P[id]);
  expect(picked.map((t) => [t.name, t.state, t._rank, t.totalRounded])).toEqual([['Rosario', 'ok', 1, 170], ['Córdoba', 'short', 2, 60]]);
});

test('judging status: void, pending decision, reviews needed by the profile', () => {
  const ev = { judging: { profile: 'fai' }, lane: true };
  expect(jumpStatus(ev, { ...J('a', 'time', 1), void: true }).code).toBe('void');
  expect(jumpStatus(ev, { ...J('a', 'time', 1), flags: [{ code: 'hz' }] }).code).toBe('decide');
  expect(jumpStatus(ev, { ...J('a', 'time', 1), laneDev: 305 }).code).toBe('decide');
  expect(jumpStatus(ev, { ...J('a', 'time', 1), sepViolation: true }).code).toBe('decide');
  expect(jumpStatus(ev, { ...J('a', 'time', 1), reviews: [{}] }).label).toBe('Revisado por 1 de 2');
  expect(jumpStatus({ judging: { profile: 'arg' }, lane: true }, { ...J('a', 'time', 1), reviews: [{}] }).code).toBe('ok');
});

test('exit order: passes rotate between tasks (5.5.6) and reverse order puts pilots without a result first (5.5.2)', () => {
  // passPlan of the previous platform: chunk, then rotate passes and the order within each pass by the task index.
  const plan = passPlan(['a', 'b', 'c', 'd', 'e'], 2, ['speed', 'time', 'distance']);
  expect(plan).toEqual([
    { task: 'speed', passes: [['a', 'b'], ['c', 'd'], ['e']] },
    { task: 'time', passes: [['d', 'c'], ['e'], ['b', 'a']] },
    { task: 'distance', passes: [['e'], ['a', 'b'], ['c', 'd']] },
  ]);
  const { st } = eventStandings({ tiebreak: null }, [J('a', 'time', 90), J('b', 'time', 80), J('c', 'time', 70)]);
  const r = reverseOrder(st.rows, ['a', 'b', 'c', 'x', 'y'], () => 0);
  expect(r.order.slice(2)).toEqual(['c', 'b', 'a']);
  expect(r.order.slice(0, 2).sort()).toEqual(['x', 'y']);
  expect(r.unranked).toBe(2);
  expect(topTies(eventStandings({ tiebreak: null }, [J('a', 'time', 80), J('b', 'time', 80), J('c', 'time', 70)]).st).map((g) => [g.rank, g.rows.length])).toEqual([[1, 2]]);
});
