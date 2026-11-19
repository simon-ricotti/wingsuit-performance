import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PilotForm } from './pilot-form';

export const metadata = { title: 'Pilotos · Wingsuit Performance' };

export default async function PilotsPage() {
  await requireRole('admin', 'judge');
  const supabase = await createClient();
  const { data: pilots } = await supabase.from('pilots').select('id, name, suit, gender, team').order('name');

  return (
    <main>
      <p><Link className="back" href="/admin">← Administración</Link></p>
      <h1>Pilotos</h1>
      <h2>Agregar</h2>
      <PilotForm initial={{ id: null, name: '', suit: '', gender: '', team: '' }} />
      <h2>Todos ({pilots?.length ?? 0})</h2>
      {!pilots?.length ? <p className="sub">Todavía no hay pilotos.</p> : (
        <table>
          <thead><tr><th>Nombre</th><th>Traje</th><th>Categoría</th><th>Equipo o club</th></tr></thead>
          <tbody>
            {pilots.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/pilots/${p.id}`}>{p.name}</Link></td>
                <td>{p.suit || '–'}</td>
                <td>{p.gender === 'F' ? 'Femenina' : 'General'}</td>
                <td>{p.team || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
