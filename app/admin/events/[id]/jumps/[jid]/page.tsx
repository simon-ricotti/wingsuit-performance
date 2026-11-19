import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { rowToJump, type EventRow, type JumpRow, type ReviewRow } from '@/lib/data/rows';
import type { PackedTrack, RefPoint } from '@/lib/engine';
import { judgingOf } from '@/lib/events/settings';
import { eventConfig, roundName, TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { eventStandings, fmt, fmtTask, jumpStatus, pendingDecisions } from '@/lib/standings/views';
import { JumpResult } from '../../../../jumps/jump-result';
import { ReviewCharts } from './review-charts';
import { DecisionsForm, DeleteJump, SignForms, VerifyFile, type DecisionValues } from './review-forms';

export const metadata = { title: 'Revisión del salto · Wingsuit Performance' };

const when = (ms: number) => new Date(ms).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

export default async function JumpPage({ params }: { params: Promise<{ id: string; jid: string }> }) {
  const { id, jid } = await params;
  const m = /^(p[0-9a-z]{4,40})-(time|distance|speed)-(\d{1,3})$/i.exec(jid);
  if (!m) notFound();
  const [, pilotId, task, r] = m, round = +r;
  await requireRole('admin', 'judge');
  const supabase = await createClient();
  const [{ data: ev }, { data: rows }, { data: reviews }, { data: pilots }, { data: tr }, { data: file }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>(),
    // All jumps of the event: the result is a percentage of the round's best (5.10.2).
    supabase.from('jumps').select('*').eq('event_id', id).returns<JumpRow[]>(),
    supabase.from('reviews').select('pilot_id, task, round, reviewer_name, legacy_uid, at').eq('event_id', id).order('at').returns<ReviewRow[]>(),
    supabase.from('pilots').select('id, name'),
    supabase.from('tracks').select('packed').eq('event_id', id).eq('pilot_id', pilotId).eq('task', task).eq('round', round).maybeSingle(),
    supabase.from('files').select('size').eq('event_id', id).eq('pilot_id', pilotId).eq('task', task).eq('round', round).maybeSingle(),
  ]);
  if (!ev) notFound();
  const { jumps } = eventStandings(ev, (rows ?? []).map((x) => rowToJump(x, reviews ?? [])));
  const j = jumps.find((x) => x.pilotId === pilotId && x.task === task && +x.round === round);
  if (!j) notFound();

  const name = (pid: string) => (pilots ?? []).find((p) => p.id === pid)?.name ?? 'Piloto borrado';
  const J = judgingOf(ev.judging), cfg = eventConfig(ev), status = jumpStatus(ev, j), pending = pendingDecisions(ev, j);
  const refs = (ev.refs ?? []) as RefPoint[];
  const refPoint = ev.lane && j.refIdx != null ? refs[j.refIdx as number] ?? null : null;
  const revs = (j.reviews as { name: string; at: number }[]) ?? [];
  const flagged = ((j.flags as { code: string }[]) ?? []).some((f) => ['sep', 'hz', 'gap', 'exit_low', 'exit_high'].includes(f.code));
  const laneEdge = j.laneDev != null && [300, 450, 600].some((th) => Math.abs((j.laneDev as number) - th) < 15);
  const str = (v: unknown) => (v == null ? '' : String(v));
  const decisions: DecisionValues = {
    flagged, flag: str(j.flagDecision),
    flagLabel: J.gpsRule === 'rejump' || J.exitRule === 'rejump' ? 'Pendiente' : 'Solo aviso, según el perfil',
    lane: { show: j.laneDev != null, value: str(j.laneDecision), shift: str(j.laneShift ?? 0).replace('.', ','),
      refs: ev.lane ? refs.map((r) => (r as RefPoint & { name?: string }).name ?? '') : [], refIdx: str(j.refIdx),
      label: `Carril: propuesta ${j.lanePen} % (${fmt(j.laneOutside as number, 0)} m afuera)${laneEdge ? ', al límite' : ''}` },
    sep: { show: !!j.sepViolation, value: j.sepApply == null ? '' : j.sepApply ? 'yes' : 'no', label: `Separación: ${fmt(j.sepMin as number, 0)} m de ${name(String(j.sepWith))}` },
    exit: { show: J.door !== 'none', value: str(j.exitPen ?? 0), label: `Salida, según ${J.door === 'fd' ? 'el Flight Director' : 'el cronómetro y el video'}` },
    manual: str(j.penManual), notes: str(j.notes),
  };

  return (
    <main className="wide">
      <p><Link className="back" href={`/admin/events/${id}`}>← {ev.name}</Link></p>
      <div className="row spread">
        <h1>{name(pilotId)}: {TASK_LABEL[task as keyof typeof TASK_LABEL]}, {roundName(round)}</h1>
        <span className={'pill' + (status.code === 'ok' ? ' good' : status.code === 'pending' ? '' : ' warn')}>{status.label}</span>
      </div>

      <JumpResult jump={j} units={ev.units} exitMin={cfg.exitMin} exitMax={cfg.exitMax} pilotName={name} />
      <p className="sub">Resultado: <b>{j.void ? 'anulado' : `${fmtTask(task, j._result)} ${TASK_UNIT[task as keyof typeof TASK_UNIT]}`}</b>
        {!j.void && ` (${fmt(j._points, 1)} % del mejor de la ronda)`}{j._pen ? ` con penalidad de ${j._pen} %. ${j._penWhy}` : ''}</p>

      <ReviewCharts eventId={id} jid={jid} jump={j} cfg={cfg} refPoint={refPoint} track={(tr?.packed as PackedTrack) ?? null} laneShift={+(j.laneShift ?? 0) || 0} />

      {pending.length > 0 && <p className="note warn">Para revisar este salto falta: {pending.join('; ')}.</p>}

      <h2>Decisiones del juez</h2>
      <DecisionsForm event={id} jump={jid} v={decisions} />

      <h2>Revisión</h2>
      <p className="sub">Este perfil pide {J.reviews > 1 ? `${J.reviews} revisiones de jueces distintos` : 'una revisión'} para dar el salto por revisado. Firmás con tu usuario.</p>
      {revs.length > 0 && <ul>{revs.map((x, i) => <li key={i}>{x.name}, {when(x.at)}</li>)}</ul>}
      <SignForms event={id} jump={jid} canSign={!pending.length && !j.void} hasReviews={revs.length > 0} />

      <h2>Archivo original</h2>
      <p>{str(j.fileName) || '–'}{file?.size ? `, ${fmt(file.size / 1024, 0)} KB` : ''}{j.uploadedAt ? `, cargado el ${when(j.uploadedAt as number)}` : ''}{j.uploadedBy ? ` por ${j.uploadedBy}` : ''}{j.device ? ` (${j.device})` : ''}</p>
      {j.fileHash ? <p className="small">Huella SHA-256: <span className="mono">{String(j.fileHash)}</span></p>
        : <p className="sub small">Este salto se cargó antes de que la plataforma guardara la huella del archivo.</p>}
      <div className="row">{file && <a className="button secondary" href={`/admin/events/${id}/jumps/${jid}/original`} download>Descargar el original</a>}</div>
      {j.fileHash ? <VerifyFile hash={String(j.fileHash)} /> : null}

      <p><Link href={`/admin/events/${id}/replay?slot=${encodeURIComponent(`${task}|${round}`)}`}>Ver el replay de la tanda</Link></p>

      <h2>Borrar</h2>
      <DeleteJump event={id} jump={jid} />
    </main>
  );
}
