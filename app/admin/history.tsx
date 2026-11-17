// Audit log entries (most recent first). Read with the user's session: RLS lets only staff see them.
import { createClient } from '@/lib/supabase/server';

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

export async function History({ eventId, pilotId, limit = 30 }: { eventId?: string; pilotId?: string; limit?: number }) {
  const supabase = await createClient();
  let q = supabase.from('audit_log').select('id, at, who, text').order('at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (eventId) q = q.eq('event_id', eventId);
  if (pilotId) q = q.contains('data', { pilot: pilotId });
  const { data } = await q;
  if (!data?.length) return <p className="sub">Todavía no hay cambios registrados.</p>;
  return (
    <ul className="log">
      {data.map((l) => <li key={l.id}><span className="sub">{when(l.at)} · {l.who || 'sin nombre'}</span> {l.text}</li>)}
    </ul>
  );
}
