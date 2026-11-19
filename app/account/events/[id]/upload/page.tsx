// A pilot uploads their own jump (stage 6): same form and server action as the judges, pilot fixed.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EventRow } from '@/lib/data/rows';
import { UploadForm } from '@/app/admin/events/[id]/upload/upload-form';

export const metadata = { title: 'Cargar mi salto · Wingsuit Performance' };
export const maxDuration = 60;

export default async function PilotUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole('admin', 'judge', 'pilot');
  const admin = createAdminClient();
  const [{ data: ev }, { data: pilot }, { data: jumps }] = await Promise.all([
    admin.from('events').select('id, name, cfg, lane, refs, sep_check, units, mode, rounds, tiebreak, pilot_uploads').eq('id', id).maybeSingle<EventRow>(),
    admin.from('pilots').select('id, name').eq('id', s.pilotId ?? '-').maybeSingle(),
    admin.from('jumps').select('task, round, void').eq('event_id', id).eq('pilot_id', s.pilotId ?? '-'),
  ]);
  if (!ev || !ev.pilot_uploads) notFound();
  return (
    <main>
      <p><Link className="back" href="/account">← Mis saltos</Link></p>
      <h1>Cargar mi salto</h1>
      <p className="sub">{ev.name}</p>
      {!pilot ? <p>Tu usuario todavía no está vinculado a una ficha de piloto. Pedíselo al organizador.</p> : (
        <UploadForm event={ev} pilots={[pilot]} ownPilot={pilot} doneHref="/account"
          existing={(jumps ?? []).map((j) => ({ pilotId: pilot.id, task: j.task, round: j.round, void: !!j.void }))} />
      )}
    </main>
  );
}
