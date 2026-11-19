// Public ranking across events (competitions and trainings): records and each pilot's best mark per task.
// Static, regenerated at most once a minute; only published events count.
import Link from 'next/link';
import { rowToJump } from '@/lib/data/rows';
import { publishedResults } from '@/lib/results/public';
import { eventStandings } from '@/lib/standings/views';
import { faiWindow, marksOf, RankingTables } from './ranking-tables';

export const revalidate = 60;
export const metadata = { title: 'Ranking · Wingsuit Performance', description: 'Récords y mejores marcas de Wingsuit Performance en Argentina, en competencias y entrenamientos.' };

export default async function RankingPage() {
  const { events, rows, name } = await publishedResults();
  // Each jump is scored within its own event (penalties, 5.10.1), then compared across events.
  const results = events.filter((ev) => faiWindow(ev.cfg))
    .map((ev) => ({ ev, jumps: eventStandings(ev, rows.filter((r) => r.event_id === ev.id).map((r) => rowToJump(r))).jumps }));
  return (
    <main className="wide">
      <h1>Ranking</h1>
      <p className="sub">Récords y mejor marca de cada piloto en cada tarea, entre todas las jornadas publicadas, de competencia y de entrenamiento.
        Cuentan los saltos con la ventana FAI de 2500 a 1500 m, con sus penalidades (FAI 5.10.1). <Link href="/results">Ver las jornadas</Link>.</p>
      <RankingTables marks={marksOf(results)} name={name} href={(id) => `/results/${id}`} />
    </main>
  );
}
