// Public list of published events (stage 7). Static, regenerated at most once a minute.
import Link from 'next/link';
import { createPublicClient } from '@/lib/supabase/public';

export const revalidate = 60;
export const metadata = { title: 'Resultados · Wingsuit Performance', description: 'Resultados de las jornadas de Wingsuit Performance, puntuadas con el reglamento FAI 2026.' };

export default async function ResultsPage() {
  const { data: events } = await createPublicClient().from('events').select('id, name, date, dz').order('date', { ascending: false, nullsFirst: false });
  return (
    <main>
      <p><Link href="/">← Inicio</Link></p>
      <h1>Resultados</h1>
      <p className="sub">Jornadas de Wingsuit Performance puntuadas con el reglamento FAI 2026. <Link href="/scoring">Cómo se puntúa</Link>.</p>
      {!events?.length ? <p className="sub">Todavía no hay jornadas publicadas.</p> : (
        <ul className="menu">{events.map((e) => (
          <li key={e.id}><Link href={`/results/${e.id}`}>{e.name}</Link>{e.date ? <span className="muted small"> {e.date}{e.dz ? `, ${e.dz}` : ''}</span> : null}</li>
        ))}</ul>
      )}
    </main>
  );
}
