// Historic ranking (viewRanking in the previous platform): each pilot's best mark per task across events.
import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { loadAllResults } from '@/lib/standings/load';
import { fmt } from '@/lib/standings/views';
import { faiWindow, marksOf, RankingTables } from '@/app/ranking/ranking-tables';

export const metadata = { title: 'Ranking histórico · Wingsuit Performance' };

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const onlyStd = all !== '1';
  await requireRole('admin', 'judge');
  const { results, name } = await loadAllResults(await createClient());
  const marks = marksOf(results.filter((r) => !onlyStd || faiWindow(r.ev.cfg)));

  return (
    <main className="wide">
      <p><Link className="back" href="/admin">← Administración</Link></p>
      <h1>Ranking histórico</h1>
      <p className="sub">Récords y mejor marca de cada piloto en cada tarea, entre todas las jornadas guardadas, publicadas o no. El <Link href="/ranking">ranking público</Link> cuenta solo las publicadas.</p>
      <nav className="seg" aria-label="Saltos que cuentan">
        <Link href="?" aria-current={onlyStd ? 'page' : undefined}>Solo ventana FAI 2500–1500 m</Link>
        <Link href="?all=1" aria-current={onlyStd ? undefined : 'page'}>Todas las ventanas</Link>
      </nav>
      <RankingTables marks={marks} name={name} href={(id) => `/admin/events/${id}`} />

      <h2>Ganadores por jornada</h2>
      <div className="scroll-x">
        <table className="standings">
          <thead><tr><th className="l">Jornada</th><th className="l">Fecha</th><th className="l">1.º</th><th className="l">2.º</th><th className="l">3.º</th></tr></thead>
          <tbody>{results.map(({ ev, st }) => {
            const pod = (n: number) => st.rows.filter((x) => x.jumps && x.rank === n).map((x) => `${name(x.pilotId)} ${fmt(x.totalRounded, 1)}`).join(', ') || '–';
            return <tr key={ev.id}><td className="l"><Link href={`/admin/events/${ev.id}`}>{ev.name}</Link></td><td className="l">{ev.date ?? ''}</td><td className="l">{pod(1)}</td><td className="l">{pod(2)}</td><td className="l">{pod(3)}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </main>
  );
}
