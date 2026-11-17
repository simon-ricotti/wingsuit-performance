import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { DeletePilot, PilotForm } from '../pilot-form';
import { History } from '../../history';

export const metadata = { title: 'Piloto · Wingsuit Performance' };

export default async function PilotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole('admin', 'judge');
  const supabase = await createClient();
  const { data: p } = await supabase.from('pilots').select('id, name, suit, gender, team').eq('id', id).maybeSingle();
  if (!p) notFound();
  const { count } = await supabase.from('jumps').select('pilot_id', { count: 'exact', head: true }).eq('pilot_id', id);
  const jumps = count ?? 0;

  return (
    <main>
      <p><Link href="/admin/pilots">← Pilotos</Link></p>
      <h1>{p.name}</h1>
      <p className="sub">{jumps} saltos cargados</p>
      <PilotForm initial={{ id: p.id, name: p.name, suit: p.suit, gender: p.gender === 'F' ? 'F' : '', team: p.team }} />
      <h2>Historial</h2>
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
