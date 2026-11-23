import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formValuesOf, judgingOf, JUDGING_PROFILES } from '@/lib/events/settings';
import type { EventRow } from '@/lib/data/rows';
import { EventForm } from '../../event-form';
import { DeleteEvent } from './delete-event';
import { RecalcButton } from './recalc-button';
import { History } from '../../../history';
import { StateForm } from '../state-form';

export const metadata = { title: 'Ajustes de la jornada · Wingsuit Performance' };
export const maxDuration = 60;

export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole('admin', 'judge');
  const supabase = await createClient();
  const [{ data: ev }, { data: jumpPilots }, { data: pilots }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>(),
    supabase.from('jumps').select('pilot_id').eq('event_id', id),
    supabase.from('pilots').select('id, name').order('name'),
  ]);
  if (!ev) notFound();
  const jumps = jumpPilots?.length ?? 0;
  // Participants: the chosen list, or else those with jumps.
  const roster = Array.isArray(ev.roster) && ev.roster.length ? (ev.roster as string[]) : [...new Set((jumpPilots ?? []).map((j) => j.pilot_id as string))];
  const J = judgingOf(ev.judging);

  return (
    <main>
      <p><Link className="back" href={`/admin/events/${id}`}>← {ev.name}</Link></p>
      <h1>Ajustes e historial</h1>

      {s.role === 'admin' ? (
        <>
          <EventForm initial={formValuesOf(ev, ev.date ?? '')} jumps={jumps} />
          {jumps > 0 && (
            <>
              <h2>Recalcular</h2>
              <p className="sub">Vuelve a puntuar los {jumps} saltos guardados desde sus tracks con los ajustes actuales. Las decisiones de los jueces se mantienen.</p>
              <RecalcButton id={ev.id} />
            </>
          )}
        </>
      ) : (
        <p>Perfil de juzgamiento: {J.profile === 'custom' ? 'Personalizado' : JUDGING_PROFILES[J.profile].label}. Los ajustes los cambia el organizador.</p>
      )}

      <section className="stack" id="participants">
        <h2>Participantes</h2>
        <p className="sub small">Elegí quiénes vuelan en la jornada. Si no elegís, se toman los que ya tienen saltos. El orden de salida se arma con esta lista.</p>
        <StateForm event={id} op="roster" submit="Guardar participantes" className="stack">
          <div className="row">{(pilots ?? []).map((p) => (
            <label key={p.id} className="chk"><input type="checkbox" name="pilot" value={p.id} defaultChecked={roster.includes(p.id)} /> {p.name}</label>
          ))}</div>
          <label className="field" style={{ maxWidth: 200 }}>Pilotos por pasada<input name="passSize" inputMode="numeric" defaultValue={ev.pass_size ?? 5} autoComplete="off" /></label>
        </StateForm>
      </section>

      {s.role === 'admin' && (
        <>
          <h2>Publicación</h2>
          {ev.published ? (
            <>
              <p>Publicada: se ve sin login en <Link href={`/results/${ev.id}`}>/results/{ev.id}</Link> (se actualiza en menos de un minuto después de cada cambio).</p>
              <StateForm event={ev.id} op="unpublish" submit="Despublicar" />
            </>
          ) : (
            <>
              <p className="sub">Sin publicar: solo la ven jueces y organizadores. Al publicarla, cualquiera ve la clasificación y los resultados (no el historial ni los archivos originales).</p>
              <StateForm event={ev.id} op="publish" submit="Publicar la jornada" />
            </>
          )}
        </>
      )}

      <h2>Historial</h2>
      <History eventId={ev.id} limit={100} />

      {s.role === 'admin' && (
        <>
          <h2>Borrar la jornada</h2>
          {jumps > 0 ? <p className="sub">Tiene saltos cargados: no se puede borrar.</p> : <DeleteEvent id={ev.id} name={ev.name} />}
        </>
      )}
    </main>
  );
}
