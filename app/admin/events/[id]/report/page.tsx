import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { TASKS, type Task } from '@/lib/engine';
import { cfgLine, judgingLabel, judgingOf, profileDiffs } from '@/lib/events/settings';
import { roundLabel, TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { loadEventResults } from '@/lib/standings/load';
import { femaleRows, fmt, fmtTask, jumpStatus, teamRows } from '@/lib/standings/views';
import { PrintButton } from './print-button';
import { BackupButton } from './backup-button';

export const metadata = { title: 'Acta · Wingsuit Performance' };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole('admin', 'judge');
  const r = await loadEventResults(await createClient(), id);
  if (!r) notFound();
  const { ev, st, jumps, name, pilot } = r;
  const validated = (ev.validated ?? {}) as Record<string, unknown>;
  const provisional = [...new Set(jumps.map((j) => `${j.task}|${j.round}`))].filter((k) => !validated[k]);
  const diffs = profileDiffs(ev);
  const female = femaleRows(st, pilot);
  const teams = teamRows(ev, st, pilot).filter((t) => t._rank);
  const tbTask = (ev.tiebreak as { task?: Task } | null)?.task;
  const label = (k: string) => `${TASK_LABEL[k.split('|')[0] as Task]} ${roundLabel(+k.split('|')[1])}`;
  const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

  return (
    <main className="wide acta">
      <p className="noprint"><Link href={`/admin/events/${id}`}>← {ev.name}</Link></p>
      <div className="noprint stack">
        <div className="row">
          <PrintButton />
          <a className="button" href={`/admin/events/${id}/export/csv`} download>Descargar planilla (CSV)</a>
          <BackupButton id={id} />
        </div>
        <p className="sub small">La planilla abre en Excel o Google Sheets. La copia completa incluye la jornada, los saltos, los tracks, los archivos originales y el historial; sirve de respaldo y para volver a importarla.</p>
      </div>

      {!jumps.length ? <p className="sub">Todavía no hay saltos para el acta.</p> : (
        <>
          <div className="row spread">
            <div>
              <h1>Acta de resultados: {ev.name}</h1>
              <p className="small">{[ev.date, ev.dz].filter(Boolean).join(', ')}. {cfgLine(ev)}</p>
            </div>
            <span className={'pill ' + (provisional.length ? 'warn' : 'good')}>{provisional.length ? 'Provisoria' : 'Oficial: todas las tareas validadas'}</span>
          </div>
          <p className="small"><b>Reglamento:</b> FAI ISC Wingsuit Flying 2026, Performance. <b>Perfil:</b> {judgingLabel(judgingOf(ev.judging))}.{' '}
            {diffs.length ? <><b>Diferencias:</b> {diffs.join('; ')}.</> : 'Sin diferencias con el reglamento FAI.'}</p>
          {provisional.length > 0 && <p className="small"><b>Tareas sin validar:</b> {provisional.map(label).join(', ')}.</p>}

          <table className="standings acta-t">
            <thead><tr><th>#</th><th className="l">Piloto</th>{TASKS.map((t) => <th key={t}>{TASK_LABEL[t]}</th>)}<th>Total</th></tr></thead>
            <tbody>{st.rows.filter((x) => x.jumps).map((x) => (
              <tr key={x.pilotId}><td className="rank">{x.rank}</td><td className="l">{name(x.pilotId)}</td>
                {TASKS.map((t) => <td key={t}>{fmt(x.tasks[t]?.points ?? 0, 1)}</td>)}<td className="total">{fmt(x.totalRounded, 1)}</td></tr>
            ))}</tbody>
          </table>

          {female.length > 0 && (
            <>
              <h2>Clasificación femenina{female.length < 4 && <span className="pill warn"> menos de 4: sin medallas (5.1.2)</span>}</h2>
              <table className="standings acta-t"><tbody>{female.map((x) => (
                <tr key={x.pilotId}><td className="rank">{x._rank}</td><td className="l">{name(x.pilotId)}</td><td className="total">{fmt(x.totalRounded, 1)}</td></tr>
              ))}</tbody></table>
            </>
          )}
          {teams.length > 0 && (
            <>
              <h2>Clasificación por equipos{teams.length < 4 && <span className="pill warn"> menos de 4: sin medallas (5.1.2)</span>}</h2>
              <table className="standings acta-t"><tbody>{teams.map((t) => (
                <tr key={t.name}><td className="rank">{t._rank}</td><td className="l">{t.name} <span className="muted">({t.members.map((m) => name(m.pilotId)).join(', ')})</span></td><td className="total">{fmt(t.totalRounded, 1)}</td></tr>
              ))}</tbody></table>
            </>
          )}
          {tbTask && <p className="small"><b>Desempate (FAI 5.10.6):</b> tarea sorteada {TASK_LABEL[tbTask].toLowerCase()}.{' '}
            {st.tiebreak.map((j) => `${name(j.pilotId)} ${fmtTask(j.task, j._result)} ${TASK_UNIT[j.task as Task]}`).join(', ')}</p>}

          <h2>Detalle por salto</h2>
          <table className="standings acta-t small">
            <thead><tr><th className="l">Piloto</th><th className="l">Tarea</th><th>Resultado</th><th>Pen.</th><th>Pts</th><th className="l">Estado</th><th className="l">Huella del archivo</th></tr></thead>
            <tbody>{jumps.map((j) => {
              const revs = ((j.reviews as { name: string }[]) ?? []).map((x) => x.name);
              return (
                <tr key={`${j.pilotId}-${j.task}-${j.round}`}>
                  <td className="l">{name(j.pilotId)}</td><td className="l">{label(`${j.task}|${j.round}`)}</td>
                  <td>{j.void ? 'anulado' : `${fmtTask(j.task, j._result)} ${TASK_UNIT[j.task as Task]}`}</td>
                  <td>{j._pen ? `${j._pen}%` : ''}</td><td>{fmt(j._points ?? 0, 1)}</td>
                  <td className="l wrap">{jumpStatus(ev, j).label}{revs.length ? ` (${revs.join(', ')})` : ''}{j._penWhy ? <><br /><span className="muted">{j._penWhy}</span></> : null}</td>
                  <td className="l mono">{j.fileHash ? `${String(j.fileHash).slice(0, 16)}…` : '—'}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <p className="small muted">La huella es el SHA-256 del archivo del GPS tal como se cargó. Cualquiera puede verificar que un archivo es el mismo comparando su huella en el detalle del salto. Generada el {now} por {s.displayName || s.email}.</p>
          <div className="firmas"><div>Juez</div><div>Juez</div><div>Director del evento</div></div>
        </>
      )}
    </main>
  );
}
