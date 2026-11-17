import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formValuesOf, judgingOf, JUDGING_PROFILES } from '@/lib/events/settings';
import type { EventRow, JumpRow } from '@/lib/data/rows';
import { es, TASKS } from '@/lib/engine';
import { roundLabel, TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { EventForm } from '../event-form';
import { DeleteEvent } from './delete-event';
import { RecalcButton } from './recalc-button';
import { History } from '../../history';

export const metadata = { title: 'Jornada · Wingsuit Performance' };
export const maxDuration = 60;

type JumpListRow = Pick<JumpRow, 'pilot_id' | 'task' | 'round' | 'ok' | 'time' | 'distance' | 'speed' | 'lane_pen' | 'lane_outside' | 'sep_violation' | 'void' | 'flags' | 'uploaded_by' | 'file_name'>;

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole('admin', 'judge');
  const supabase = await createClient();
  const { data: ev } = await supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>();
  if (!ev) notFound();
  // Only the columns the list shows: tracks and decisions are not read here.
  const [{ data: jumpRows }, { data: pilots }] = await Promise.all([
    supabase.from('jumps').select('pilot_id, task, round, ok, time, distance, speed, lane_pen, lane_outside, sep_violation, void, flags, uploaded_by, file_name').eq('event_id', id).returns<JumpListRow[]>(),
    supabase.from('pilots').select('id, name'),
  ]);
  const jumps = (jumpRows ?? []).sort((a, b) => a.round - b.round || TASKS.indexOf(a.task as never) - TASKS.indexOf(b.task as never));
  const name = new Map((pilots ?? []).map((p) => [p.id as string, p.name as string]));
  const pilotName = (pid: string) => name.get(pid) ?? pid;
  const values = formValuesOf(ev, ev.date ?? '');
  const result = (j: JumpListRow) => {
    if (j.void) return 'anulado';
    if (!j.ok) return 'sin resultado';
    const v = j[j.task as 'time' | 'distance' | 'speed'];
    return `${es(+v.toFixed(j.task === 'distance' ? 0 : 1))} ${TASK_UNIT[j.task as keyof typeof TASK_UNIT]}`;
  };
  const notes = (j: JumpListRow) => [
    j.lane_pen ? `carril −${j.lane_pen} %` : '',
    j.sep_violation ? 'separación' : '',
    ...((j.flags as { code: string; level: string }[]) ?? []).filter((f) => f.level === 'warn')
      .map((f) => ({ exit_low: 'salida baja', exit_high: 'salida alta', exit_gap: 'hueco antes de la salida', sep: 'SEP alto', hz: 'pocos Hz', gap: 'huecos', error: 'error' } as Record<string, string>)[f.code] ?? f.code),
  ].filter(Boolean).join(', ');

  return (
    <main>
      <p><Link href="/admin/events">← Jornadas</Link></p>
      <h1>{ev.name}</h1>
      <p className="sub">{[ev.date, ev.dz].filter(Boolean).join(' · ')} · {jumps.length} saltos · {ev.published ? 'publicada' : 'sin publicar'}</p>
      <div className="row"><Link className="button" href={`/admin/events/${id}/upload`}>Cargar salto</Link></div>

      <h2>Saltos</h2>
      {!jumps.length ? <p className="sub">Todavía no hay saltos cargados.</p> : (
        <table>
          <thead><tr><th>Tarea</th><th>Ronda</th><th>Piloto</th><th className="num">Resultado</th><th>Avisos</th><th>Cargado por</th></tr></thead>
          <tbody>
            {jumps.map((j) => (
              <tr key={`${j.pilot_id}-${j.task}-${j.round}`}>
                <td>{TASK_LABEL[j.task as keyof typeof TASK_LABEL]}</td>
                <td>{roundLabel(j.round)}</td>
                <td>{pilotName(j.pilot_id)}</td>
                <td className="num">{result(j)}</td>
                <td className="small">{notes(j) || '–'}</td>
                <td className="small">{j.uploaded_by || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="sub small">La clasificación con porcentajes y puestos llega con las pantallas (etapa 4).</p>

      {s.role === 'admin' ? (
        <>
          <h2>Ajustes</h2>
          <EventForm initial={values} jumps={jumps.length} />
          {jumps.length > 0 && (
            <>
              <h2>Recalcular</h2>
              <p className="sub">Vuelve a puntuar los {jumps.length} saltos guardados desde sus tracks con los ajustes actuales. Las decisiones de los jueces se mantienen.</p>
              <RecalcButton id={ev.id} />
            </>
          )}
        </>
      ) : (
        <p>Perfil de juzgamiento: {judgingOf(ev.judging).profile === 'custom' ? 'Personalizado' : JUDGING_PROFILES[judgingOf(ev.judging).profile as 'arg' | 'fai'].label}.
          Los ajustes los cambia el organizador.</p>
      )}

      <h2>Historial</h2>
      <History eventId={ev.id} />

      {s.role === 'admin' && (
        <>
          <h2>Borrar la jornada</h2>
          {jumps.length > 0
            ? <p className="sub">Tiene saltos cargados: no se puede borrar.</p>
            : <DeleteEvent id={ev.id} name={ev.name} />}
        </>
      )}
    </main>
  );
}
