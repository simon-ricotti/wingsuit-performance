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
