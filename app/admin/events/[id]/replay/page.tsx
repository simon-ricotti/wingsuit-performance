import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { rowToJump, type EventRow, type JumpRow } from '@/lib/data/rows';
import { TASKS, type PackedTrack, type RefPoint, type Task } from '@/lib/engine';
import { eventConfig, roundLabel, TASK_LABEL } from '@/lib/jumps/score';
import { eventStandings } from '@/lib/standings/views';
import { ReplayView, type ReplayItem } from './replay-view';

export const metadata = { title: 'Replay · Wingsuit Performance' };

// Colors of the previous platform, one per pilot of the pass.
const COLORS = ['#d9480f', '#0b7f86', '#6f42c1', '#2f6fde', '#c2255c', '#5c7c00', '#a15c00', '#0f7a52', '#7a4b2a', '#495867'];

export default async function ReplayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ slot?: string }> }) {
  const [{ id }, { slot }] = await Promise.all([params, searchParams]);
  await requireRole('admin', 'judge');
  const supabase = await createClient();
  const [{ data: ev }, { data: rows }, { data: pilots }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>(),
    supabase.from('jumps').select('*').eq('event_id', id).returns<JumpRow[]>(),
    supabase.from('pilots').select('id, name'),
  ]);
  if (!ev) notFound();
  // Results as a % of the round's best need every jump of the event (5.10.2).
  const { jumps } = eventStandings(ev, (rows ?? []).map((r) => rowToJump(r)));
  const ok = jumps.filter((j) => j.ok);
  const slots = [...new Set(ok.map((j) => `${j.task}|${j.round}`))]
    .sort((a, b) => +a.split('|')[1] - +b.split('|')[1] || TASKS.indexOf(a.split('|')[0] as Task) - TASKS.indexOf(b.split('|')[0] as Task));
  const current = slot && slots.includes(slot) ? slot : slots[0];
  const back = <p><Link className="back" href={`/admin/events/${id}`}>← {ev.name}</Link></p>;
  if (!current) return <main>{back}<h1>Replay</h1><p className="sub">Cuando haya saltos cargados vas a poder reproducir la tanda acá.</p></main>;

  const [task, round] = current.split('|');
  const inSlot = ok.filter((j) => j.task === task && String(j.round) === round);
  const { data: tracks } = await supabase.from('tracks').select('pilot_id, packed').eq('event_id', id).eq('task', task).eq('round', +round);
  const packed = new Map((tracks ?? []).map((t) => [t.pilot_id as string, t.packed as PackedTrack]));
  const refs = (ev.refs ?? []) as RefPoint[];
  const name = (pid: string) => (pilots ?? []).find((p) => p.id === pid)?.name ?? 'Piloto borrado';
  const items: ReplayItem[] = inSlot.filter((j) => packed.has(j.pilotId)).map((j, i) => ({
    jump: j, packed: packed.get(j.pilotId)!, name: name(j.pilotId), color: COLORS[i % COLORS.length],
    ref: ev.lane && j.refIdx != null ? refs[j.refIdx as number] ?? null : null,
  }));

  return (
    <main className="wide">
      {back}
      <h1>Replay</h1>
      <nav className="seg" aria-label="Tanda">
        {slots.map((s) => {
          const [t, r] = s.split('|');
          return <Link key={s} href={`?slot=${encodeURIComponent(s)}`} aria-current={s === current ? 'page' : undefined}>{TASK_LABEL[t as Task]} {roundLabel(+r)}</Link>;
        })}
      </nav>
      <ReplayView key={current} items={items} task={task as Task} cfg={eventConfig(ev)} altFt={ev.units === 'ft'} />
    </main>
  );
}
