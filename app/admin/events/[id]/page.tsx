import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formValuesOf, judgingOf, JUDGING_PROFILES } from '@/lib/events/settings';
import type { EventRow } from '@/lib/data/rows';
import { EventForm } from '../event-form';
import { DeleteEvent } from './delete-event';
import { History } from '../../history';

export const metadata = { title: 'Jornada · Wingsuit Performance' };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole('admin', 'judge');
  const supabase = await createClient();
  const { data: ev } = await supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>();
  if (!ev) notFound();
  const { count } = await supabase.from('jumps').select('event_id', { count: 'exact', head: true }).eq('event_id', id);
  const jumps = count ?? 0;
  const values = formValuesOf(ev, ev.date ?? '');

  return (
    <main>
      <p><Link href="/admin/events">← Jornadas</Link></p>
      <h1>{ev.name}</h1>
      <p className="sub">{[ev.date, ev.dz].filter(Boolean).join(' · ')} · {jumps} saltos · {ev.published ? 'publicada' : 'sin publicar'}</p>

      {s.role === 'admin' ? (
        <EventForm initial={values} scoringLocked={jumps > 0} />
      ) : (
        <p>Perfil de juzgamiento: {judgingOf(ev.judging).profile === 'custom' ? 'Personalizado' : JUDGING_PROFILES[judgingOf(ev.judging).profile as 'arg' | 'fai'].label}.
          Los ajustes los cambia el organizador.</p>
      )}

      <h2>Historial</h2>
      <History eventId={ev.id} />

      {s.role === 'admin' && (
        <>
          <h2>Borrar la jornada</h2>
          {jumps > 0
            ? <p className="sub">Tiene saltos cargados: no se puede borrar.</p>
            : <DeleteEvent id={ev.id} name={ev.name} />}
        </>
      )}
    </main>
  );
}
