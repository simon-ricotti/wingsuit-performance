// Home: the latest published event and the records, with the way into tracks and the rules.
// Static, regenerated at most once a minute (same data as /results and /ranking).
import Link from 'next/link';
import { rowToJump } from '@/lib/data/rows';
import { TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { publishedResults } from '@/lib/results/public';
import { eventStandings, fmt, fmtTask } from '@/lib/standings/views';
import { bestByTask, faiWindow, marksOf } from './ranking/ranking-tables';

export const revalidate = 60;

export default async function Home() {
  const { events, rows, name } = await publishedResults();
  const results = events.map((ev) => ({ ev, ...eventStandings(ev, rows.filter((r) => r.event_id === ev.id).map((r) => rowToJump(r))) }));
  // A competition's podium says more than a training's (in free mode not every task is flown).
  const last = results.find((r) => r.ev.mode === 'competition') ?? results[0];
  const podium = last ? last.st.rows.filter((r) => r.jumps).slice(0, 3) : [];
  const pilots = last ? last.st.rows.filter((r) => r.jumps).length : 0;
  const records = bestByTask(marksOf(results.filter((r) => faiWindow(r.ev.cfg)))).filter((b) => b.rows.length);

  return (
    <main className="wide">
      <h1>Wingsuit Performance</h1>
      <p className="sub">Puntaje FAI de tiempo, distancia y velocidad · DZ AVA, Alvear (Rosario).</p>

      {last && (
        <div className="home-grid">
          <section className="card stack">
            <h2>{last.ev.mode === 'competition' ? 'Última competencia' : 'Última jornada'}</h2>
            <div>
              <Link href={`/results/${last.ev.id}`}><b>{last.ev.name}</b></Link>
              <p className="sub small">{[last.ev.date, `${pilots} pilotos`].filter(Boolean).join(' · ')}</p>
            </div>
            <ol className="podium">
              {podium.map((r) => <li key={r.pilotId}><span>{name(r.pilotId)}</span><b>{fmt(r.totalRounded, 1)}</b></li>)}
            </ol>
            <Link className="button" href={`/results/${last.ev.id}`}>Ver resultados</Link>
          </section>
          {records.length > 0 && (
            <section className="card stack">
              <h2>Récords</h2>
              <ul className="podium">
                {records.map(({ t, rows: [m] }) => (
                  <li key={t}><span>{TASK_LABEL[t]}</span><b>{fmtTask(t, m.j._result)} {TASK_UNIT[t]}</b><span className="small muted">{name(m.j.pilotId)}</span></li>
                ))}
              </ul>
              <Link className="button secondary" href="/ranking">Ver el ranking</Link>
            </section>
          )}
        </div>
      )}

      <ul className="menu home-links">
        {!last && <li><Link href="/results">Resultados<span className="small muted">Las jornadas publicadas, con su clasificación.</span></Link></li>}
        <li><Link href="/tracks">Ver mis tracks<span className="small muted">Subí tu GPS y mirá el vuelo, las métricas y el replay.</span></Link></li>
        <li><Link href="/scoring">Reglamento<span className="small muted">Cómo se puntúa y las reglas para jueces.</span></Link></li>
        <li><Link href="/help">Ayuda<span className="small muted">Cómo usar la plataforma: organizador, juez y piloto.</span></Link></li>
      </ul>
    </main>
  );
}
