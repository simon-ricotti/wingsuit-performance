// Records and each pilot's best mark per task across events (public /ranking and /admin/ranking).
import Link from 'next/link';
import { DEFAULT_CFG, TASKS, type JumpRecord } from '@/lib/engine';
import type { EventRow } from '@/lib/data/rows';
import { TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { fmtTask } from '@/lib/standings/views';

type Ev = Pick<EventRow, 'id' | 'name' | 'date' | 'mode' | 'cfg'>;
export interface Mark { j: JumpRecord; ev: Ev }

/** FAI window 2500–1500 m (2.2): only marks flown in the same window are comparable. */
export const faiWindow = (cfg: unknown) => {
  const c = { ...DEFAULT_CFG, ...(cfg as object) };
  return Math.abs(c.top - 2500) < 1 && Math.abs(c.bottom - 1500) < 1;
};

/** Jumps that count: scored, not void and not zeroed; result with penalties (5.10.1). */
export function marksOf(results: { ev: Ev; jumps: JumpRecord[] }[]): Mark[] {
  return results.flatMap((r) => r.jumps.filter((j) => j.ok && !j.void && (j._pen ?? 0) < 100 && (j._result ?? 0) > 0).map((j) => ({ j, ev: r.ev })));
}

/** Each pilot's best mark per task, best first (the first one is the record). */
export function bestByTask(marks: Mark[]) {
  return TASKS.map((t) => {
    const byPilot = new Map<string, Mark>();
    for (const m of marks) if (m.j.task === t && (!byPilot.has(m.j.pilotId) || m.j._result! > byPilot.get(m.j.pilotId)!.j._result!)) byPilot.set(m.j.pilotId, m);
    return { t, rows: [...byPilot.values()].sort((a, b) => b.j._result! - a.j._result!) };
  });
}

const kind = (ev: Ev) => (ev.mode === 'competition' ? 'Competencia' : 'Entrenamiento');

export function RankingTables({ marks, name, href }: { marks: Mark[]; name: (pid: string) => string; href: (evId: string) => string }) {
  if (!marks.length) return <p className="sub">Todavía no hay saltos que cuenten para el ranking.</p>;
  const best = bestByTask(marks);
  const where = (m: Mark) => <><Link href={href(m.ev.id)}>{m.ev.name}</Link>{m.ev.date ? <span className="muted"> {m.ev.date}</span> : null}</>;

  return (
    <>
      <h2>Récords</h2>
      <div className="kpis records">
        {best.filter((b) => b.rows.length).map(({ t, rows: [r] }) => (
          <div key={t} className="kpi main">
            <div className="k">{TASK_LABEL[t]}</div>
            <div className="v">{fmtTask(t, r.j._result)} {TASK_UNIT[t]}</div>
            <div className="small"><b>{name(r.j.pilotId)}</b></div>
            <div className="small muted">{kind(r.ev)}: {where(r)}</div>
          </div>
        ))}
      </div>

      <h2>Mejor marca de cada piloto</h2>
      <div className="grid ranking-grid">
        {best.map(({ t, rows }) => (
          <section key={t}>
            <h3>{TASK_LABEL[t]} ({TASK_UNIT[t]})</h3>
            {!rows.length ? <p className="sub small">Sin saltos de esta tarea.</p> : (
              <div className="scroll-x"><table className="standings">
                <tbody>{rows.map((m, i) => (
                  <tr key={m.j.pilotId}>
                    <td className="rank">{i + 1}</td>
                    <td className="l"><b>{name(m.j.pilotId)}</b><br /><span className="small muted">{kind(m.ev)}</span></td>
                    <td className="total">{fmtTask(t, m.j._result)}</td>
                    <td className="l small ev">{where(m)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
