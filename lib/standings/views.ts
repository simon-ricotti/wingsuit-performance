// Standings views on top of the engine's standings (5.10): overall, per task, female and teams.
// Ports tabTable/classView/teamTable and jumpStatus/pendingDecisions from legacy/src/app.js.
import { roundHalfUp, standings, TASKS, type JumpRecord, type StandingRow, type Standings, type Task } from '../engine';
import { judgingOf } from '../events/settings';
import type { EventRow } from '../data/rows';

export type Ranked<T> = T & { _rank: number };

/** Shared rank for equal keys (5.10.6.3). */
export function reRank<T>(rows: T[], key: (r: T) => string | number): Ranked<T>[] {
  const out = rows as Ranked<T>[];
  out.forEach((r, i) => { const p = out[i - 1]; r._rank = p && key(p) === key(r) ? p._rank : i + 1; });
  return out;
}

/** Standings of an event; jumps are copied (the engine adds `_` fields). */
export function eventStandings(ev: Pick<EventRow, 'tiebreak'>, jumps: JumpRecord[]): { st: Standings; jumps: JumpRecord[] } {
  const copy = jumps.map((j) => ({ ...j }));
  return { st: standings(copy, null, { tiebreak: ev.tiebreak as { task?: string } | null }), jumps: copy };
}

/** Rounds shown per task: the flown ones plus, in competition, every scheduled round. */
export function roundsShown(ev: Pick<EventRow, 'mode' | 'rounds'>, st: Standings): Record<Task, number[]> {
  const out = {} as Record<Task, number[]>;
  for (const t of TASKS) {
    const r = new Set(st.rounds[t]);
    if (ev.mode === 'competition') for (let i = 1; i <= ev.rounds; i++) r.add(i);
    out[t] = [...r].sort((a, b) => a - b);
  }
  return out;
}

export interface PilotInfo { name: string; gender: string; team: string }

/** 5.1.4, 5.10.9: same points as overall, ranked among female pilots only. */
export const femaleRows = (st: Standings, pilot: (id: string) => PilotInfo | undefined) =>
  reRank(st.rows.filter((r) => r.jumps && pilot(r.pilotId)?.gender === 'F'), (r) => `${r.totalRounded}|${r.tb}`);

/** Per-task ranking by task points. */
export const taskRows = (st: Standings, t: Task) =>
  reRank(st.rows.filter((r) => r.tasks[t]).sort((a, b) => b.tasks[t]!.points - a.tasks[t]!.points), (r) => roundHalfUp(r.tasks[t]!.points, 1));

export interface TeamRow { name: string; all: StandingRow[]; members: StandingRow[]; state: 'ok' | 'short' | 'pick'; total: number; totalRounded: number }

/** 5.10.10: team score = sum of its members' totals; with more pilots than the team size, members are nominated (8.4.2). */
export function teamRows(ev: Pick<EventRow, 'team_size' | 'team_pick'>, st: Standings, pilot: (id: string) => PilotInfo | undefined): Ranked<TeamRow>[] {
  const teams: Record<string, StandingRow[]> = {};
  const pick = (ev.team_pick ?? {}) as Record<string, string[]>;
  const size = ev.team_size || 3;
  for (const row of st.rows) {
    const t = (pilot(row.pilotId)?.team ?? '').trim();
    if (row.jumps && t) (teams[t] ??= []).push(row);
  }
  const rows: TeamRow[] = Object.entries(teams).map(([name, all]) => {
    let members = all, state: TeamRow['state'] = 'ok';
    if (all.length > size) {
      const ids = (pick[name] ?? []).filter((id) => all.some((r) => r.pilotId === id));
      if (ids.length === size) members = all.filter((r) => ids.includes(r.pilotId)); else { members = []; state = 'pick'; }
    } else if (all.length < size) state = 'short';
    const total = members.reduce((s, r) => s + r.total, 0);
    return { name, all, members, state, total, totalRounded: roundHalfUp(total, 1) };
  }).sort((a, b) => +(a.state === 'pick') - +(b.state === 'pick') || b.totalRounded - a.totalRounded);
  // Teams waiting for nomination have no rank.
  const ranked = reRank(rows.filter((t) => t.state !== 'pick'), (t) => t.totalRounded);
  return [...ranked, ...rows.filter((t) => t.state === 'pick').map((t) => ({ ...t, _rank: 0 }))];
}

// ---------- judging status of a jump ----------
const laneEdge = (j: JumpRecord) => j.laneDev != null && [300, 450, 600].some((th) => Math.abs((j.laneDev as number) - th) < 15);

/** Decisions the judge still has to make on a jump. */
export function pendingDecisions(ev: Pick<EventRow, 'judging' | 'lane'>, j: JumpRecord): string[] {
  const J = judgingOf(ev.judging), out: string[] = [];
  const flags = (j.flags as { code: string }[]) ?? [];
  const gps = flags.some((f) => ['sep', 'hz', 'gap'].includes(f.code));
  const exit = flags.some((f) => f.code === 'exit_low' || f.code === 'exit_high');
  if (((J.gpsRule === 'rejump' && gps) || (J.exitRule === 'rejump' && exit)) && !j.flagDecision) out.push('validar el salto o conceder re-salto');
  if (ev.lane && laneEdge(j) && (j.laneDecision == null || j.laneDecision === '')) out.push('confirmar la penalidad de carril, que está al límite');
  if (j.sepViolation && j.sepApply == null) out.push('decidir si se aplica el cero por separación');
  return out;
}

export type JumpStatus = { code: 'void' | 'decide' | 'ok' | 'pending'; label: string };

export function jumpStatus(ev: Pick<EventRow, 'judging' | 'lane'>, j: JumpRecord): JumpStatus {
  if (j.void) return { code: 'void', label: 'Anulado por re-salto' };
  if (pendingDecisions(ev, j).length) return { code: 'decide', label: 'Falta una decisión del juez' };
  const n = ((j.reviews as unknown[]) ?? []).length, need = judgingOf(ev.judging).reviews;
  if (n >= need) return { code: 'ok', label: 'Revisado' };
  return { code: 'pending', label: n ? `Revisado por ${n} de ${need}` : 'Sin revisar' };
}

/** Number with decimal comma, rounded half up (fmt in the previous platform). */
export const fmt = (n: number | null | undefined, d = 0) => (n == null || !isFinite(n) ? '–' : roundHalfUp(n, d).toFixed(d).replace('.', ','));
export const fmtTask = (task: string, v: number | null | undefined) => fmt(v, task === 'distance' ? 0 : 1);
