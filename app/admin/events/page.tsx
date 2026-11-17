import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Jornadas · Wingsuit Performance' };

export default async function EventsPage() {
  const s = await requireRole('admin', 'judge');
  const supabase = await createClient();
  const { data: events } = await supabase.from('events').select('id, name, date, dz, mode, published').order('date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  const { data: counts } = await supabase.from('event_jump_counts').select('event_id, jumps');
  const count = new Map((counts ?? []).map((c) => [c.event_id as string, c.jumps as number]));

  return (
    <main>
      <p><Link href="/admin">← Administración</Link></p>
      <div className="row spread">
        <h1>Jornadas</h1>
        {s.role === 'admin' && <Link className="button" href="/admin/events/new">Nueva jornada</Link>}
      </div>
      {!events?.length ? <p className="sub">Todavía no hay jornadas.</p> : (
        <table>
          <thead><tr><th>Jornada</th><th>Fecha</th><th>Modo</th><th className="num">Saltos</th><th>Estado</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/admin/events/${e.id}`}>{e.name}</Link>{e.dz && <span className="sub"> · {e.dz}</span>}</td>
                <td>{e.date ?? '–'}</td>
                <td>{e.mode === 'competition' ? 'Competencia' : 'Libre'}</td>
                <td className="num">{count.get(e.id) ?? 0}</td>
                <td>{e.published ? 'Publicada' : 'Sin publicar'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
