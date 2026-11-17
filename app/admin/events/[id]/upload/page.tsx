import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { EventRow } from '@/lib/data/rows';
import { UploadForm } from './upload-form';

export const metadata = { title: 'Cargar salto · Wingsuit Performance' };
export const maxDuration = 60;

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole('admin', 'judge');
  const supabase = await createClient();
  const { data: ev } = await supabase.from('events').select('id, name, cfg, lane, refs, sep_check, units, mode, rounds, tiebreak').eq('id', id).maybeSingle<EventRow>();
  if (!ev) notFound();
  const [{ data: pilots }, { data: jumps }] = await Promise.all([
    supabase.from('pilots').select('id, name').order('name'),
    supabase.from('jumps').select('pilot_id, task, round, void').eq('event_id', id),
  ]);
  return (
    <main>
      <p><Link href={`/admin/events/${id}`}>← {ev.name}</Link></p>
      <h1>Cargar salto</h1>
      <UploadForm
        event={ev}
        pilots={(pilots ?? []) as { id: string; name: string }[]}
        existing={(jumps ?? []).map((j) => ({ pilotId: j.pilot_id, task: j.task, round: j.round, void: !!j.void }))}
      />
    </main>
  );
}
