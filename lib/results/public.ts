// Data for the public results pages (stage 7), read on the server with the secret key: only published
// events and only the columns the results need. The API itself shows nothing to the public (RLS).
import 'server-only';
import { createAdminClient } from '../supabase/admin';
import type { EventRow, JumpRow } from '../data/rows';
import type { PilotInfo } from '../standings/views';

const EVENT_COLS = 'id, name, date, dz, mode, rounds, team_size, units, lane, sep_check, refs, cfg, judging, validated, tiebreak, team_pick, published';
// Everything standings and penalties use (5.10, effectivePenalties); no notes, uploader or file data.
const JUMP_COLS = 'event_id, pilot_id, task, round, ok, time, distance, speed, t_exit, lane_pen, lane_outside, lane_dev, lane_decision, pen_manual, sep_violation, sep_apply, sep_min, exit_pen, flag_decision, void';

export async function publishedEvents() {
  const { data } = await createAdminClient().from('events').select('id, name, date, dz').eq('published', true).order('date', { ascending: false, nullsFirst: false });
  return data ?? [];
}

export async function publishedEvent(id: string) {
  const admin = createAdminClient();
  const { data: ev } = await admin.from('events').select(EVENT_COLS).eq('id', id).eq('published', true).maybeSingle<EventRow>();
  if (!ev) return null;
  const { data: rows } = await admin.from('jumps').select(JUMP_COLS).eq('event_id', id).returns<JumpRow[]>();
  const jumps = (rows ?? []).map((r) => ({ ...r, extra: {} }) as JumpRow);
  const ids = [...new Set(jumps.map((j) => j.pilot_id))];
  const { data: pilots } = await admin.from('pilots').select('id, name, gender, team').in('id', ids.length ? ids : ['-']);
  return { ev, jumps, pilots: (pilots ?? []) as (PilotInfo & { id: string })[] };
}

/**
 * Every published event scored within itself (public ranking): same columns as the results pages.
 * shortcut: reads all published jumps on each regeneration (at most once a minute); a summary table if it grows a lot.
 */
export async function publishedResults() {
  const admin = createAdminClient();
  const { data: events } = await admin.from('events').select(EVENT_COLS).eq('published', true).order('date', { ascending: false, nullsFirst: false }).returns<EventRow[]>();
  const ids = (events ?? []).map((e) => e.id);
  const rows: JumpRow[] = [];
  for (let from = 0; ids.length; from += 1000) {
    const { data } = await admin.from('jumps').select(JUMP_COLS).in('event_id', ids).order('event_id').order('pilot_id').order('task').order('round').range(from, from + 999).returns<JumpRow[]>();
    rows.push(...(data ?? []).map((r) => ({ ...r, extra: {} }) as JumpRow));
    if (!data || data.length < 1000) break;
  }
  const pids = [...new Set(rows.map((r) => r.pilot_id))];
  const { data: pilots } = await admin.from('pilots').select('id, name').in('id', pids.length ? pids : ['-']);
  const names = new Map((pilots ?? []).map((p) => [p.id as string, p.name as string]));
  return { events: events ?? [], rows, name: (pid: string) => names.get(pid) ?? '' };
}
