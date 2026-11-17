import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { DeletePilot, PilotForm } from '../pilot-form';
import { History } from '../../history';
import { loadAllResults } from '@/lib/standings/load';
import { fmt } from '@/lib/standings/views';
import { roundLabel, TASK_LABEL } from '@/lib/jumps/score';
import type { Task } from '@/lib/engine';

export const metadata = { title: 'Piloto · Wingsuit Performance' };

export default async function PilotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole('admin', 'judge');
  const supabase = await createClient();
  const { data: p } = await supabase.from('pilots').select('id, name, suit, gender, team').eq('id', id).maybeSingle();
  if (!p) notFound();
  const { count } = await supabase.from('jumps').select('pilot_id', { count: 'exact', head: true }).eq('pilot_id', id);
  const jumps = count ?? 0;
  const mine = jumps ? (await loadAllResults(supabase)).results.flatMap(({ ev, jumps: js }) => js.filter((j) => j.pilotId === id).map((j) => ({ j, ev })))
    .sort((a, b) => ((b.j.tExit as number) ?? 0) - ((a.j.tExit as number) ?? 0)) : [];

  return (
    <main>
      <p><Link href="/admin/pilots">← Pilotos</Link></p>
      <h1>{p.name}</h1>
      <p className="sub">{jumps} saltos cargados</p>
      <PilotForm initial={{ id: p.id, name: p.name, suit: p.suit, gender: p.gender === 'F' ? 'F' : '', team: p.team }} />
      <h2>Saltos</h2>
      {!mine.length ? <p className="sub">Sin saltos guardados.</p> : (
        <div className="scroll-x">
          <table className="standings">
            <thead><tr><th className="l">Jornada</th><th className="l">Tarea</th><th>Tiempo s</th><th>Distancia m</th><th>Velocidad km/h</th><th>Puntos</th></tr></thead>
            <tbody>{mine.map(({ j, ev }) => (
              <tr key={`${ev.id}-${j.task}-${j.round}`}>
                <td className="l"><Link href={`/admin/events/${ev.id}/jumps/${j.pilotId}-${j.task}-${j.round}`}>{ev.name}</Link>{ev.date ? <span className="muted small"> {ev.date}</span> : null}</td>
                <td className="l">{TASK_LABEL[j.task as Task]} {roundLabel(+j.round)}</td>
                <td>{fmt(j.time as number, 1)}</td><td>{fmt(j.distance as number, 0)}</td><td>{fmt(j.speed as number, 1)}</td>
                <td>{j.void ? 'anulado' : `${fmt(j._points, 1)} %`}{j._pen ? <span className="pen"> −{j._pen}%</span> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <h2>Historial de la ficha</h2>
      <History pilotId={p.id} />
      {s.role === 'admin' && (
        <>
          <h2>Borrar el piloto</h2>
          {jumps > 0 ? <p className="sub">Tiene saltos cargados: no se puede borrar.</p> : <DeletePilot id={p.id} name={p.name} />}
        </>
      )}
    </main>
  );
}
