// Everything the acta and the CSV need for an event: settings, scored jumps and names.
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToJump, type EventRow, type JumpRow, type ReviewRow } from '../data/rows';
import { TASKS, type Task } from '../engine';
import { eventStandings, type PilotInfo } from './views';

export async function loadEventResults(supabase: SupabaseClient, id: string) {
  const [{ data: ev }, { data: rows }, { data: reviews }, { data: pilots }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle<EventRow>(),
    supabase.from('jumps').select('*').eq('event_id', id).returns<JumpRow[]>(),
    supabase.from('reviews').select('pilot_id, task, round, reviewer_name, legacy_uid, at').eq('event_id', id).order('at').returns<ReviewRow[]>(),
    supabase.from('pilots').select('id, name, gender, team'),
  ]);
  if (!ev) return null;
  const byId = new Map((pilots ?? []).map((p) => [p.id as string, p as PilotInfo]));
  const { st, jumps } = eventStandings(ev, (rows ?? []).map((r) => rowToJump(r, reviews ?? [])));
  // Detail order: round, task, then best points first.
  jumps.sort((a, b) => +a.round - +b.round || TASKS.indexOf(a.task as Task) - TASKS.indexOf(b.task as Task) || (b._points ?? 0) - (a._points ?? 0));
  return { ev, st, jumps, pilot: (pid: string) => byId.get(pid), name: (pid: string) => byId.get(pid)?.name ?? 'Piloto borrado' };
}

/** File name from the event name: "Copa AVA, fecha 3" → "copa-ava-fecha-3". */
export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'jornada';
