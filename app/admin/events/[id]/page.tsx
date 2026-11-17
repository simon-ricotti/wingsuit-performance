import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { rowToJump, type EventRow, type JumpRow, type ReviewRow } from '@/lib/data/rows';
import { TASKS, type JumpRecord, type Task } from '@/lib/engine';
import { TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { TaskValidation, type Slot } from './task-validation';
import { StateForm } from './state-form';
import { topTies } from '@/lib/standings/order';
import { roundLabel } from '@/lib/jumps/score';
import { eventStandings, femaleRows, fmt, fmtTask, jumpStatus, roundsShown, taskRows, teamRows, type PilotInfo } from '@/lib/standings/views';

export const metadata = { title: 'Clasificación · Wingsuit Performance' };

const jid = (j: { pilotId: string; task: string; round: number | string }) => `${j.pilotId}-${j.task}-${j.round}`;

export default async function StandingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ id }, { view = 'general' }] = await Promise.all([params, searchParams]);
  await requireRole('admin', 'judge');
  const supabase = await createClient();
  const [{ data: ev }, { data: rows }, { data: reviews }, { data: pilots }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>(),
    supabase.from('jumps').select('*').eq('event_id', id).returns<JumpRow[]>(),
    supabase.from('reviews').select('pilot_id, task, round, reviewer_name, legacy_uid, at').eq('event_id', id).returns<ReviewRow[]>(),
    supabase.from('pilots').select('id, name, gender, team'),
  ]);
  if (!ev) notFound();

  const byId = new Map((pilots ?? []).map((p) => [p.id as string, p as PilotInfo]));
  const pilot = (pid: string) => byId.get(pid);
  const name = (pid: string) => pilot(pid)?.name ?? pid;
  const { st, jumps } = eventStandings(ev, (rows ?? []).map((r) => rowToJump(r, reviews ?? [])));
  const rounds = roundsShown(ev, st);
  const tasks = TASKS.filter((t) => rounds[t].length);
  const female = femaleRows(st, pilot);
  const teams = teamRows(ev, st, pilot);
  const views: [string, string][] = [['general', 'General'], ...(female.length ? [['female', 'Femenina'] as [string, string]] : []),
    ...(teams.length ? [['team', 'Equipos'] as [string, string]] : []), ...tasks.map((t) => [t, TASK_LABEL[t]] as [string, string])];
  const current = views.some(([v]) => v === view) ? view : 'general';
  const tb = ev.tiebreak as { task?: Task; by?: string } | null, tbTask = tb?.task;
  const ties = topTies(st);
  const validated = (ev.validated ?? {}) as Record<string, { by?: string }>;
  const bySlot = new Map<string, JumpRecord[]>();
  for (const j of jumps) bySlot.set(`${j.task}|${j.round}`, [...(bySlot.get(`${j.task}|${j.round}`) ?? []), j]);
  const slots: Slot[] = [...bySlot.entries()]
    .sort(([a], [b]) => +a.split('|')[1] - +b.split('|')[1] || TASKS.indexOf(a.split('|')[0] as Task) - TASKS.indexOf(b.split('|')[0] as Task))
    .map(([key, list]) => {
      const live = list.filter((j) => !j.void), [t, n] = key.split('|');
      return { key, label: `${TASK_LABEL[t as Task]} ${roundLabel(+n)}`, live: live.length, voided: list.length - live.length,
        done: live.filter((j) => jumpStatus(ev, j).code === 'ok').length, validatedBy: validated[key] ? validated[key].by ?? '' : null };
    });

  const cell = (j: JumpRecord | undefined, t: Task) => {
    if (!j) return <span className="muted">·</span>;
    const s = jumpStatus(ev, j);
    return (
      <Link className={'cell' + (j._isBest ? ' best' : '')} href={`/admin/events/${id}/jumps/${jid(j)}`} title={s.label}>
        <span><b>{j.ok ? fmtTask(t, j._result) : '0'}</b><i className={`st st-${s.code}`} aria-hidden="true" /><span className="sr-only">{s.label}</span></span>
        <small>{j._pen ? <span className="pen">−{j._pen}% · </span> : null}{fmt(j._points, 1)}%</small>
      </Link>
    );
  };

  return (
    <main className="wide">
      <p><Link href="/admin/events">← Jornadas</Link></p>
      <h1>{ev.name}</h1>
      <p className="sub">{[ev.date, ev.dz].filter(Boolean).join(', ')}{ev.published ? '' : ' (sin publicar)'}</p>
      <nav className="row">
        <Link className="button" href={`/admin/events/${id}/upload`}>Cargar salto</Link>
        <Link href={`/admin/events/${id}/replay`}>Replay</Link>
        <Link href={`/admin/events/${id}/order`}>Orden de salida</Link>
        <Link href={`/admin/events/${id}/report`}>Acta y exportar</Link>
        <Link href={`/admin/events/${id}/settings`}>Ajustes e historial</Link>
      </nav>

      {!st.rows.some((r) => r.jumps) ? (
        <p className="sub">Todavía no hay saltos en esta jornada. Tocá <b>Cargar salto</b> para subir el primer archivo.</p>
      ) : (
        <>
          <nav className="seg" aria-label="Clasificación">
            {views.map(([v, label]) => <Link key={v} href={`?view=${v}`} aria-current={v === current ? 'page' : undefined}>{label}</Link>)}
          </nav>

          {current === 'general' && (
            <>
              <div className="scroll-x">
                <table className="standings">
                  <thead>
                    <tr><th rowSpan={2}>#</th><th rowSpan={2} className="l">Piloto</th>
                      {tasks.map((t) => <th key={t} className="grp" colSpan={rounds[t].length + 1}>{TASK_LABEL[t]} ({TASK_UNIT[t]})</th>)}
                      <th rowSpan={2} className="g0">Total</th></tr>
                    <tr>{tasks.flatMap((t) => [...rounds[t].map((n, i) => <th key={`${t}${n}`} className={i ? '' : 'g0'}>R{n}</th>), <th key={`${t}p`}>Pts</th>])}</tr>
                  </thead>
                  <tbody>
                    {st.rows.filter((r) => r.jumps).map((r) => (
                      <tr key={r.pilotId}>
                        <td className="rank">{r.rank}</td>
                        <td className="l"><b>{name(r.pilotId)}</b>{pilot(r.pilotId)?.team ? <span className="small muted"> {pilot(r.pilotId)!.team}</span> : null}
                          {r.tb != null && tbTask ? <span className="pill small" title="Salto de desempate"> D {fmtTask(tbTask, r.tb)}</span> : null}</td>
                        {tasks.flatMap((t) => [
                          ...rounds[t].map((n, i) => <td key={`${t}${n}`} className={i ? '' : 'g0'}>{cell(r.tasks[t]?.cells[n], t)}</td>),
                          <td key={`${t}p`} className="avg">{fmt(r.tasks[t]?.points ?? 0, 1)}</td>,
                        ])}
                        <td className="total g0">{fmt(r.totalRounded, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="sub small">Cada resultado vale un porcentaje del mejor de su ronda; por tarea se promedian las rondas voladas y el total es la suma de las tres tareas (FAI 5.10). El mejor de cada ronda está resaltado. Tocá un resultado para ver el detalle.</p>
              {ev.mode === 'competition' && (
                <div className="row">
                  {Array.from({ length: ev.rounds }, (_, i) => i + 1).map((n) => {
                    const full = TASKS.every((t) => st.rounds[t].includes(n));
                    return <span key={n} className={'pill' + (full ? ' good' : '')}>Ronda {n} {full ? 'completa' : 'incompleta'}</span>;
                  })}
                  <span className="small muted">Una ronda es válida cuando tiene las tres tareas (FAI 5.4.3).</span>
                </div>
              )}
              {(ties.length > 0 || tbTask) && (
                <section className="stack">
                  <h2>Desempate</h2>
                  {ties.map((g) => <p key={g.rank}>Empate en el puesto {g.rank} entre {g.rows.map((r) => name(r.pilotId)).join(' y ')} ({fmt(g.rows[0].totalRounded, 1)} puntos).</p>)}
                  {tbTask ? (
                    <>
                      <p>Tarea de desempate sorteada: <b>{TASK_LABEL[tbTask]}</b>{tb?.by ? ` (sorteó ${tb.by})` : ''}. Cargá cada salto de desempate en <b>Cargar salto</b>, ronda “Salto de desempate”.</p>
                      {st.tiebreak.length > 0 && <p className="small">{st.tiebreak.map((j) => `${name(j.pilotId)}: ${fmtTask(j.task, j._result)} ${TASK_UNIT[j.task as Task]}`).join(', ')}</p>}
                      {ties.length > 0 && st.tiebreak.length > 0 && <p className="sub small">Si el empate sigue después del salto de desempate, los pilotos comparten el puesto (FAI 5.10.6.2).</p>}
                      <StateForm event={id} op="tiebreak-clear" submit="Quitar el desempate" />
                    </>
                  ) : (
                    <>
                      <p className="sub small">FAI 5.10.6: un empate en los tres primeros puestos se define con un salto de desempate. La tarea la sortea el Juez Principal.</p>
                      <StateForm event={id} op="tiebreak-draw" submit="Sortear la tarea de desempate" busy="Sorteando…" />
                    </>
                  )}
                </section>
              )}
              <TaskValidation event={id} slots={slots} />
            </>
          )}

          {current === 'female' && (
            <>
              <div className="scroll-x">
                <table className="standings">
                  <thead><tr><th>#</th><th className="l">Piloto</th>{TASKS.map((t) => <th key={t}>{TASK_LABEL[t]}</th>)}<th>Total</th><th className="l">General</th></tr></thead>
                  <tbody>{female.map((r) => (
                    <tr key={r.pilotId}><td className="rank">{r._rank}</td><td className="l"><b>{name(r.pilotId)}</b></td>
                      {TASKS.map((t) => <td key={t}>{fmt(r.tasks[t]?.points ?? 0, 1)}</td>)}
                      <td className="total">{fmt(r.totalRounded, 1)}</td><td className="l muted">{r.rank}.º</td></tr>
                  ))}</tbody>
                </table>
              </div>
              {female.length < 4 && <p className="note warn small">La clasificación femenina tiene {female.length} participante{female.length === 1 ? '' : 's'}. Con menos de cuatro no es válida para entregar medallas (FAI 5.1.2).</p>}
              <p className="sub small">Mismos puntajes que la general, ordenados solo entre las pilotos de la categoría (FAI 5.1.1, 5.1.4 y 5.10.9).</p>
            </>
          )}

          {current === 'team' && (
            <>
              <div className="scroll-x">
                <table className="standings">
                  <thead><tr><th>#</th><th className="l">Equipo</th><th className="l">Integrantes</th><th>Total</th></tr></thead>
                  <tbody>{teams.map((t) => (
                    <tr key={t.name}>
                      <td className="rank">{t._rank || ''}</td>
                      <td className="l"><b>{t.name}</b>{t.state === 'short' && <span className="pill warn"> {t.members.length} de {ev.team_size}</span>}</td>
                      <td className="l small">{(t.state === 'pick' ? t.all : t.members).map((r) => `${name(r.pilotId)} ${fmt(r.totalRounded, 1)}`).join(', ')}</td>
                      <td className="total">{t.state === 'pick' ? <span className="pill warn">Falta nominar</span> : fmt(t.totalRounded, 1)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {teams.filter((t) => t._rank).length < 4 && <p className="note warn small">La clasificación por equipos tiene {teams.filter((t) => t._rank).length} participantes. Con menos de cuatro no es válida para entregar medallas (FAI 5.1.2).</p>}
              {teams.filter((t) => t.state === 'pick').map((t) => {
                const cur = ((ev.team_pick ?? {}) as Record<string, string[]>)[t.name] ?? [];
                return (
                  <section key={t.name} className="stack">
                    <h2>Nominar {ev.team_size} integrantes de {t.name}</h2>
                    <p className="sub small">El equipo tiene {t.all.length} pilotos en la jornada. El reglamento pide nominar {ev.team_size} (FAI 8.4.2).</p>
                    <StateForm event={id} op="team-pick" hidden={{ team: t.name }} submit="Guardar nominación">
                      {t.all.map((r) => <label key={r.pilotId} className="chk"><input type="checkbox" name="pilot" value={r.pilotId} defaultChecked={cur.includes(r.pilotId)} /> {name(r.pilotId)}</label>)}
                    </StateForm>
                  </section>
                );
              })}
              <p className="sub small">Puntaje del equipo: suma del total de cada integrante (FAI 5.10.10). Integrantes por equipo: {ev.team_size} (FAI 8.4; se cambia en los ajustes).</p>
            </>
          )}

          {(TASKS as readonly string[]).includes(current) && (() => {
            const t = current as Task, list = taskRows(st, t);
            return (
              <div className="scroll-x">
                <table className="standings">
                  <thead><tr><th>#</th><th className="l">Piloto</th>{st.rounds[t].map((n) => <th key={n}>R{n}</th>)}<th>Puntos</th></tr></thead>
                  <tbody>{list.map((r) => (
                    <tr key={r.pilotId}><td className="rank">{r._rank}</td><td className="l"><b>{name(r.pilotId)}</b></td>
                      {st.rounds[t].map((n) => <td key={n}>{cell(r.tasks[t]!.cells[n], t)}</td>)}
                      <td className="total">{fmt(r.tasks[t]!.points, 1)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            );
          })()}
        </>
      )}
    </main>
  );
}
