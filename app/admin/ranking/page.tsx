// Historic ranking (viewRanking in the previous platform): each pilot's best mark per task across events.
import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_CFG, TASKS, type JumpRecord } from '@/lib/engine';
import { TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { loadAllResults } from '@/lib/standings/load';
import { fmt, fmtTask } from '@/lib/standings/views';

export const metadata = { title: 'Ranking histórico · Wingsuit Performance' };

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const onlyStd = all !== '1';
  await requireRole('admin', 'judge');
  const { results, name } = await loadAllResults(await createClient());
  const std = (cfg: unknown) => { const c = { ...DEFAULT_CFG, ...(cfg as object) }; return Math.abs(c.top - 2500) < 1 && Math.abs(c.bottom - 1500) < 1; };
  const jumps = results.filter((r) => !onlyStd || std(r.ev.cfg))
    .flatMap((r) => r.jumps.filter((j) => j.ok && (j._pen ?? 0) < 100).map((j) => ({ j, ev: r.ev })));

  return (
    <main className="wide">
      <p><Link className="back" href="/admin">← Administración</Link></p>
      <h1>Ranking histórico</h1>
      <p className="sub">Mejor marca de cada piloto en cada tarea, entre todas las jornadas guardadas.</p>
      <nav className="seg" aria-label="Saltos que cuentan">
        <Link href="?" aria-current={onlyStd ? 'page' : undefined}>Solo ventana FAI 2500–1500 m</Link>
        <Link href="?all=1" aria-current={onlyStd ? undefined : 'page'}>Todas las ventanas</Link>
      </nav>
      {!jumps.length ? <p className="sub">Todavía no hay saltos que cuenten para el ranking.</p> : (
        <div className="grid">
          {TASKS.map((t) => {
            const best = new Map<string, { j: JumpRecord; ev: (typeof jumps)[number]['ev'] }>();
            for (const x of jumps) if (x.j.task === t && (!best.has(x.j.pilotId) || x.j._result! > best.get(x.j.pilotId)!.j._result!)) best.set(x.j.pilotId, x);
            const rows = [...best.values()].sort((a, b) => b.j._result! - a.j._result!);
            return (
              <section key={t}>
                <h2>{TASK_LABEL[t]} ({TASK_UNIT[t]})</h2>
                <table className="standings">
                  <tbody>{rows.map((x, i) => (
                    <tr key={x.j.pilotId}><td className="rank">{i + 1}</td><td className="l"><b>{name(x.j.pilotId)}</b></td>
                      <td className="total">{fmtTask(t, x.j._result)}</td>
                      <td className="l small"><Link href={`/admin/events/${x.ev.id}`}>{x.ev.name}</Link>{x.ev.date ? <span className="muted"> {x.ev.date}</span> : null}</td></tr>
                  ))}</tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}

      <h2>Ganadores por jornada</h2>
      <div className="scroll-x">
        <table className="standings">
          <thead><tr><th className="l">Jornada</th><th className="l">Fecha</th><th className="l">1.º</th><th className="l">2.º</th><th className="l">3.º</th></tr></thead>
          <tbody>{results.map(({ ev, st }) => {
            const pod = (n: number) => st.rows.filter((x) => x.jumps && x.rank === n).map((x) => `${name(x.pilotId)} ${fmt(x.totalRounded, 1)}`).join(', ') || '–';
            return <tr key={ev.id}><td className="l"><Link href={`/admin/events/${ev.id}`}>{ev.name}</Link></td><td className="l">{ev.date ?? ''}</td><td className="l">{pod(1)}</td><td className="l">{pod(2)}</td><td className="l">{pod(3)}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </main>
  );
}
