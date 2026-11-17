import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { EventRow } from '@/lib/data/rows';
import { TASK_LABEL } from '@/lib/jumps/score';
import { passPlan, taskOrder } from '@/lib/standings/order';
import { StateForm } from '../state-form';
import { PrintButton } from '../report/print-button';

export const metadata = { title: 'Orden de salida · Wingsuit Performance' };

const when = (ms: number) => new Date(ms).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rounds?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireRole('admin', 'judge');
  const supabase = await createClient();
  const [{ data: ev }, { data: pilots }, { data: jumpPilots }, { data: others }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>(),
    supabase.from('pilots').select('id, name').order('name'),
    supabase.from('jumps').select('pilot_id').eq('event_id', id),
    supabase.from('events').select('id, name, date').neq('id', id).order('date', { ascending: false, nullsFirst: false }),
  ]);
  if (!ev) notFound();
  const name = (pid: string) => (pilots ?? []).find((p) => p.id === pid)?.name ?? 'Piloto borrado';
  // Participants: the chosen list, or else those with jumps.
  const roster = Array.isArray(ev.roster) && ev.roster.length ? (ev.roster as string[]) : [...new Set((jumpPilots ?? []).map((j) => j.pilot_id as string))];
  const order = (ev.exit_order ?? {}) as Record<string, { ids: string[]; how: string; at: number; by?: string }>;
  const tasks = taskOrder(ev.task_order), passSize = ev.pass_size ?? 5;
  const flown = Math.max(0, ...Object.keys(order).map(Number));
  const rounds = ev.mode === 'competition' ? ev.rounds : Math.max(3, flown, Math.min(20, +(sp.rounds ?? 0) || 0));

  return (
    <main className="wide">
      <p className="noprint"><Link href={`/admin/events/${id}`}>← {ev.name}</Link></p>
      <h1>Orden de salida: {ev.name}</h1>

      <section className="stack noprint">
        <h2>Participantes</h2>
        <p className="sub small">Elegí quiénes vuelan en la jornada. Si no elegís, se toman los que ya tienen saltos.</p>
        <StateForm event={id} op="roster" submit="Guardar participantes" className="stack">
          <div className="row">{(pilots ?? []).map((p) => (
            <label key={p.id} className="chk"><input type="checkbox" name="pilot" value={p.id} defaultChecked={roster.includes(p.id)} /> {p.name}</label>
          ))}</div>
          <label className="field" style={{ maxWidth: 200 }}>Pilotos por pasada<input name="passSize" inputMode="numeric" defaultValue={passSize} autoComplete="off" /></label>
        </StateForm>
      </section>

      <section className="stack">
        <h2>Orden de las tareas</h2>
        <p>{tasks.map((t, i) => `${i + 1}. ${TASK_LABEL[t]}`).join(', ')} {ev.task_order ? <span className="sub small">(sorteado)</span> : <span className="pill warn">Sin sortear</span>}</p>
        <div className="noprint"><StateForm event={id} op="task-order-draw" submit={ev.task_order ? 'Volver a sortear' : 'Sortear'} busy="Sorteando…" /></div>
        <p className="sub small">FAI 5.4.8: el orden de las tareas lo sortea el Juez Principal en la reunión de competidores.</p>
      </section>

      {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
        const o = order[r];
        return (
          <section key={r} className="stack order-round">
            <h2>Ronda {r}</h2>
            <p className="sub small">{r === 1
              ? 'FAI 5.5.2: orden inverso a la clasificación de la última competencia; los que no participaron saltan primero, en orden sorteado.'
              : `FAI 5.5.3: orden inverso a la clasificación de esta jornada después de la ronda ${r - 1}${r > 2 ? ' (recalcularlo después de la ronda 2 es opcional)' : ''}.`}</p>
            <div className="row noprint">
              <StateForm event={id} op="order-make" hidden={{ round: r }} submit={o ? 'Rehacer' : 'Armar orden'} busy="Armando…">
                {r === 1 && (
                  <select name="source" aria-label="Cómo armar el orden de la ronda 1" defaultValue={others?.[0]?.id ?? ''}>
                    <option value="">Sorteo</option>
                    {(others ?? []).map((e) => <option key={e.id} value={e.id}>Inverso de {e.name}{e.date ? ` (${e.date})` : ''}</option>)}
                  </select>
                )}
              </StateForm>
              {o && <StateForm event={id} op="order-clear" hidden={{ round: r }} submit="Borrar" />}
            </div>
            {o && (
              <>
                <p className="small">{o.how}{o.by ? `, ${o.by}` : ''}, {when(o.at)}</p>
                <div className="plan">
                  {passPlan(o.ids, passSize, tasks).map((tk, k) => (
                    <div key={tk.task}>
                      <h3>{k + 1}. {TASK_LABEL[tk.task]}</h3>
                      {tk.passes.map((p, i) => <div key={i} className="pass"><b>Pasada {i + 1}</b><ol>{p.map((pid) => <li key={pid}>{name(pid)}</li>)}</ol></div>)}
                    </div>
                  ))}
                </div>
                <p className="sub small">Entre tareas rotan las pasadas y el orden dentro de cada pasada (FAI 5.5.6).</p>
              </>
            )}
          </section>
        );
      })}
      <div className="row noprint">
        {ev.mode !== 'competition' && <Link href={`?rounds=${rounds + 1}`}>Agregar una ronda</Link>}
        <PrintButton label="Imprimir el orden de salida" />
      </div>
    </main>
  );
}
