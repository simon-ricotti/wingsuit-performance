// Exit order (5.5) and ties for the podium (5.10.6). Ports passPlan, reverseOrderFrom and topTies
// from legacy/src/app.js. Draws use crypto randomness on the server.
import { TASKS, type Standings, type StandingRow, type Task } from '../engine';

export function shuffle<T>(arr: readonly T[], rnd: (n: number) => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const k = rnd(i + 1); [a[i], a[k]] = [a[k], a[i]]; }
  return a;
}
const rotate = <T,>(arr: readonly T[], k: number): T[] => {
  if (!arr.length) return arr.slice();
  k = ((k % arr.length) + arr.length) % arr.length;
  return arr.slice(k).concat(arr.slice(0, k));
};
const chunk = <T,>(arr: readonly T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/** The event's task order: the drawn one (5.4.8) or the default. */
export const taskOrder = (raw: unknown): Task[] => (Array.isArray(raw) && raw.length === 3 ? (raw as Task[]) : [...TASKS]);

/** Passes of a round per task: between tasks the passes and the order within each pass rotate (5.5.6). */
export function passPlan(ids: string[], passSize: number, order: Task[]) {
  const passes = chunk(ids, Math.max(1, passSize));
  return order.map((task, k) => ({ task, passes: rotate(passes, k).map((p) => rotate(p, k)) }));
}

/** Reverse of a standings (5.5.2, 5.5.3): those without a result jump first, in drawn order. */
export function reverseOrder(rows: StandingRow[], ids: string[], rnd: (n: number) => number) {
  const ranked = rows.filter((r) => r.jumps).map((r) => r.pilotId).filter((id) => ids.includes(id)).reverse();
  const unranked = shuffle(ids.filter((id) => !ranked.includes(id)), rnd);
  return { order: unranked.concat(ranked), unranked: unranked.length };
}

/** Ties within the first three places (5.10.6). */
export function topTies(st: Standings): { rank: number; rows: StandingRow[] }[] {
  const groups = new Map<number, StandingRow[]>();
  for (const r of st.rows) if (r.jumps && r.rank <= 3) groups.set(r.rank, [...(groups.get(r.rank) ?? []), r]);
  return [...groups].filter(([, rows]) => rows.length > 1).map(([rank, rows]) => ({ rank, rows }));
}

// ---------- reference points of each exit ----------
/** Exit order of a round, as stored in events.exit_order; `refs` holds the organizer's changes to the assigned points. */
export interface RoundOrder { ids: string[]; how: string; at: number; by?: string; refs?: Partial<Record<Task, Record<string, number>>> }

/**
 * Reference point of each pilot in each task of a round (5.5.5): position N in their pass goes to point N, cycling when
 * there are more exits than points (as the jump run map draws it). Passes and the order within them rotate between
 * tasks (5.5.6), so each pilot goes through different points. The organizer's changes win.
 */
export function assignedRefs(o: RoundOrder | undefined, passSize: number, order: Task[], nRefs: number): Partial<Record<Task, Record<string, number>>> {
  const out: Partial<Record<Task, Record<string, number>>> = {};
  if (!o || !nRefs) return out;
  for (const { task, passes } of passPlan(o.ids, passSize, order)) {
    const m: Record<string, number> = {};
    for (const p of passes) p.forEach((pid, i) => { const v = o.refs?.[task]?.[pid]; m[pid] = v != null && v >= 0 && v < nRefs ? v : i % nRefs; });
    out[task] = m;
  }
  return out;
}

/** Point assigned to one jump by the exit order, or null when the round has no order. */
export function plannedRef(exitOrder: unknown, passSize: number | null | undefined, taskOrderRaw: unknown, nRefs: number, pilotId: string, task: Task, round: number): number | null {
  const o = (exitOrder as Record<string, RoundOrder> | null)?.[round];
  return assignedRefs(o, passSize ?? 5, taskOrder(taskOrderRaw), nRefs)[task]?.[pilotId] ?? null;
}

