// Public results of a published event (stage 7): overall, per task, female and teams.
// Static and served from the CDN, regenerated at most once a minute; only published events are visible (RLS).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publishedEvent } from '@/lib/results/public';
import { rowToJump } from '@/lib/data/rows';
import { TASKS, type Task } from '@/lib/engine';
import { cfgLine } from '@/lib/events/settings';
import { roundLabel, TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { eventStandings, femaleRows, fmt, fmtTask, roundsShown, teamRows, type PilotInfo } from '@/lib/standings/views';

export const revalidate = 60;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await publishedEvent(id);
  return { title: data ? `${data.ev.name} · Resultados · Wingsuit Performance` : 'Resultados · Wingsuit Performance' };
}

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await publishedEvent(id);
  if (!data) notFound();
  const { ev, jumps: rows, pilots } = data;
  const byId = new Map(pilots.map((p) => [p.id, p as PilotInfo]));
  const pilot = (pid: string) => byId.get(pid);
  const name = (pid: string) => byId.get(pid)?.name ?? '';
  const { st, jumps } = eventStandings(ev, rows.map((r) => rowToJump(r)));
  const rounds = roundsShown(ev, st), tasks = TASKS.filter((t) => rounds[t].length);
  const validated = (ev.validated ?? {}) as Record<string, unknown>;
  const provisional = [...new Set(jumps.map((j) => `${j.task}|${j.round}`))].filter((k) => !validated[k]);
  const female = femaleRows(st, pilot), teams = teamRows(ev, st, pilot).filter((t) => t._rank);
  const tbTask = (ev.tiebreak as { task?: Task } | null)?.task;

  return (
    <main className="wide">
      <p><Link href="/results">← Resultados</Link></p>
      <div className="row spread">
        <div>
          <h1>{ev.name}</h1>
          <p className="sub">{[ev.date, ev.dz].filter(Boolean).join(', ')}. {cfgLine(ev)}</p>
        </div>
        {jumps.length > 0 && <span className={'pill ' + (provisional.length ? 'warn' : 'good')}>{provisional.length ? 'Resultados provisorios' : 'Resultados oficiales'}</span>}
      </div>
      {provisional.length > 0 && <p className="sub small">Tareas sin validar por los jueces: {provisional.map((k) => `${TASK_LABEL[k.split('|')[0] as Task]} ${roundLabel(+k.split('|')[1])}`).join(', ')}.</p>}

      {!st.rows.some((r) => r.jumps) ? <p className="sub">Todavía no hay saltos.</p> : (
        <>
          <div className="scroll-x">
            <table className="standings">
              <thead>
                <tr><th rowSpan={2}>#</th><th rowSpan={2} className="l">Piloto</th>
                  {tasks.map((t) => <th key={t} className="grp" colSpan={rounds[t].length + 1}>{TASK_LABEL[t]} ({TASK_UNIT[t]})</th>)}
                  <th rowSpan={2} className="g0">Total</th></tr>
                <tr>{tasks.flatMap((t) => [...rounds[t].map((n, i) => <th key={`${t}${n}`} className={i ? '' : 'g0'}>R{n}</th>), <th key={`${t}p`}>Pts</th>])}</tr>
              </thead>
              <tbody>{st.rows.filter((r) => r.jumps).map((r) => (
                <tr key={r.pilotId}>
                  <td className="rank">{r.rank}</td>
                  <td className="l"><b>{name(r.pilotId)}</b>{pilot(r.pilotId)?.team ? <span className="small muted"> {pilot(r.pilotId)!.team}</span> : null}
                    {r.tb != null && tbTask ? <span className="pill small" title="Salto de desempate (FAI 5.10.6)"> D {fmtTask(tbTask, r.tb)}</span> : null}</td>
                  {tasks.flatMap((t) => [
                    ...rounds[t].map((n, i) => {
                      const j = r.tasks[t]?.cells[n];
                      return (
                        <td key={`${t}${n}`} className={i ? '' : 'g0'}>{j ? (
                          <span className={'cell' + (j._isBest ? ' best' : '')}>
                            <b>{j.void ? 'anulado' : j.ok ? fmtTask(t, j._result) : '0'}</b>
                            <small>{j._pen ? <span className="pen">−{j._pen}% · </span> : null}{fmt(j._points, 1)}%</small>
                          </span>
                        ) : <span className="muted">·</span>}</td>
                      );
                    }),
                    <td key={`${t}p`} className="avg">{fmt(r.tasks[t]?.points ?? 0, 1)}</td>,
                  ])}
                  <td className="total g0">{fmt(r.totalRounded, 1)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="sub small">Cada resultado vale un porcentaje del mejor de su ronda; por tarea se promedian las rondas voladas y el total es la suma de las tres tareas (FAI 5.10). <Link href="/scoring">Cómo se puntúa</Link>.</p>

          {female.length > 0 && (
            <>
              <h2>Clasificación femenina</h2>
              <table className="standings"><tbody>{female.map((x) => (
                <tr key={x.pilotId}><td className="rank">{x._rank}</td><td className="l">{name(x.pilotId)}</td><td className="total">{fmt(x.totalRounded, 1)}</td></tr>
              ))}</tbody></table>
              {female.length < 4 && <p className="sub small">Con menos de cuatro participantes no entrega medallas (FAI 5.1.2).</p>}
            </>
          )}
          {teams.length > 0 && (
            <>
              <h2>Clasificación por equipos</h2>
              <table className="standings"><tbody>{teams.map((t) => (
                <tr key={t.name}><td className="rank">{t._rank}</td><td className="l">{t.name} <span className="muted">({t.members.map((m) => name(m.pilotId)).join(', ')})</span></td><td className="total">{fmt(t.totalRounded, 1)}</td></tr>
              ))}</tbody></table>
              {teams.length < 4 && <p className="sub small">Con menos de cuatro equipos no entrega medallas (FAI 5.1.2).</p>}
            </>
          )}
        </>
      )}
    </main>
  );
}
