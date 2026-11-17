// Pilot's own page (stage 6): their jumps across events and the events open for uploading.
// Reads with the secret key after the session check, always filtered by the pilot linked to the user.
import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { rowToJump, type EventRow, type JumpRow, type ReviewRow } from '@/lib/data/rows';
import type { Task } from '@/lib/engine';
import { roundLabel, TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { eventStandings, fmt, fmtTask, jumpStatus } from '@/lib/standings/views';

export const metadata = { title: 'Mis saltos · Wingsuit Performance' };

export default async function AccountPage() {
  const s = await requireRole('admin', 'judge', 'pilot');
  const head = (
    <>
      <h1>Mis saltos</h1>
      <p className="sub">{s.displayName || s.email}{s.role !== 'pilot' && <> · <Link href="/admin">Administración</Link></>}</p>
    </>
  );
  if (!s.pilotId) {
    return <main>{head}<p>Tu usuario todavía no está vinculado a una ficha de piloto. Pedíselo al organizador: lo hace desde “Usuarios y roles”.</p>
      <form action="/auth/logout" method="post"><button type="submit">Salir</button></form></main>;
  }

  const admin = createAdminClient();
  const [{ data: pilot }, { data: mine }, { data: open }] = await Promise.all([
    admin.from('pilots').select('name').eq('id', s.pilotId).maybeSingle(),
    admin.from('jumps').select('event_id').eq('pilot_id', s.pilotId),
    admin.from('events').select('id, name, date, dz').eq('pilot_uploads', true).order('date', { ascending: false, nullsFirst: false }),
  ]);
  // Points are a % of each round's best, so they need every jump of the pilot's events (5.10.2).
  const eventIds = [...new Set((mine ?? []).map((j) => j.event_id as string))];
  const [{ data: events }, { data: rows }, { data: reviews }] = eventIds.length ? await Promise.all([
    admin.from('events').select('*').in('id', eventIds).returns<EventRow[]>(),
    admin.from('jumps').select('*').in('event_id', eventIds).returns<JumpRow[]>(),
    admin.from('reviews').select('event_id, pilot_id, task, round, reviewer_name, legacy_uid, at').in('event_id', eventIds).eq('pilot_id', s.pilotId).returns<(ReviewRow & { event_id: string })[]>(),
  ]) : [{ data: [] as EventRow[] }, { data: [] as JumpRow[] }, { data: [] as (ReviewRow & { event_id: string })[] }];

  const list = (events ?? []).sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))).flatMap((ev) => {
    const evRows = (rows ?? []).filter((r) => r.event_id === ev.id);
    const evReviews = (reviews ?? []).filter((r) => r.event_id === ev.id);
    const { jumps } = eventStandings(ev, evRows.map((r) => rowToJump(r, evReviews)));
    return jumps.filter((j) => j.pilotId === s.pilotId).sort((a, b) => +a.round - +b.round).map((j) => ({ ev, j, status: jumpStatus(ev, j) }));
  });

  return (
    <main className="wide">
      {head}
      <p>Piloto: <b>{pilot?.name}</b></p>

      <h2>Cargar un salto</h2>
      {!open?.length ? <p className="sub">No hay jornadas abiertas para que los pilotos carguen sus saltos. Los carga un juez.</p> : (
        <ul className="menu">{open.map((e) => (
          <li key={e.id}><Link href={`/account/events/${e.id}/upload`}>{e.name}</Link>{e.date ? <span className="muted small"> {e.date}{e.dz ? `, ${e.dz}` : ''}</span> : null}</li>
        ))}</ul>
      )}

      <h2>Mis saltos</h2>
      {!list.length ? <p className="sub">Todavía no tenés saltos guardados.</p> : (
        <div className="scroll-x">
          <table className="standings">
            <thead><tr><th className="l">Jornada</th><th className="l">Tarea</th><th>Resultado</th><th>Puntos</th><th className="l">Estado</th></tr></thead>
            <tbody>{list.map(({ ev, j, status }) => (
              <tr key={`${ev.id}-${j.task}-${j.round}`}>
                <td className="l">{ev.name}{ev.date ? <span className="muted small"> {ev.date}</span> : null}</td>
                <td className="l">{TASK_LABEL[j.task as Task]} {roundLabel(+j.round)}</td>
                <td>{j.void ? 'anulado' : `${fmtTask(j.task, j._result)} ${TASK_UNIT[j.task as Task]}`}</td>
                <td>{fmt(j._points ?? 0, 1)} %{j._pen ? <span className="pen"> −{j._pen}%</span> : null}</td>
                <td className="l small">{status.label}{j._penWhy ? <span className="muted"> · {j._penWhy}</span> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="sub small">Los resultados son provisorios hasta que los jueces revisan los saltos y validan cada tarea.</p>
      <form action="/auth/logout" method="post"><button type="submit">Salir</button></form>
    </main>
  );
}
