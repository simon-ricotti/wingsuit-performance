'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertRole } from '@/lib/auth/session';
import { actorName, callWrite, type FormState } from '@/lib/admin/write';
import { parseEventSettings, refsLockError, SettingsError, type EventSettings } from '@/lib/events/settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadEvent, rescorePayload } from '@/lib/jumps/server';
import type { EventRow } from '@/lib/data/rows';

const ID = /^e[0-9a-z]{4,40}$/i;

// Same JSON value regardless of key order (jsonb does not keep it).
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

const SCORING = ['cfg', 'lane', 'sep_check', 'refs'] as const;
const scoringChanged = (ev: EventRow, next: EventSettings) => SCORING.some((k) => canon(ev[k]) !== canon(next[k]));

export async function saveEvent(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin'); } catch (e) { return { error: (e as Error).message }; }
  const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const id = fields.id && ID.test(fields.id) ? fields.id : null;
  let settings;
  try { settings = parseEventSettings(fields); } catch (e) {
    if (e instanceof SettingsError) return { error: e.message };
    throw e;
  }
  // New scoring settings on an event with jumps: rescore every jump and save both together.
  let scores = null;
  if (id) {
    const ev = await loadEvent(id);
    const lock = ev ? refsLockError((ev.refs ?? []) as { name: string; lat: number; lon: number }[], (settings.refs ?? []) as { lat: number; lon: number }[]) : null;
    if (lock) {
      const { count } = await createAdminClient().from('jumps').select('event_id', { count: 'exact', head: true }).eq('event_id', id);
      if (count) return { error: lock };
    }
    if (ev && scoringChanged(ev, settings)) {
      const p = await rescorePayload({ ...ev, ...settings, id });
      if (p.total > 0) scores = p.scores;
    }
  }
  const r = await callWrite<string>('save_event', { p_event: { ...settings, id }, p_actor: s.userId, p_who: actorName(s), p_scores: scores });
  if (r.error) return { error: r.error };
  revalidatePath('/admin/events');
  if (!id) redirect(`/admin/events/${r.data}`);
  revalidatePath(`/admin/events/${id}`, 'layout');
  return { saved: true, rescored: scores?.length };
}

export async function deleteEvent(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin'); } catch (e) { return { error: (e as Error).message }; }
  const id = String(form.get('id') ?? '');
  if (!ID.test(id)) return { error: 'Jornada inválida.' };
  const r = await callWrite('delete_event', { p_id: id, p_actor: s.userId, p_who: actorName(s), p_reason: String(form.get('reason') ?? '').trim() || null });
  if (r.error) return { error: r.error };
  revalidatePath('/admin/events');
  redirect('/admin/events');
}

/** Rescores every jump of the event from its track with the current settings (Recalcular). */
export async function recalcEvent(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin'); } catch (e) { return { error: (e as Error).message }; }
  const id = String(form.get('id') ?? '');
  if (!ID.test(id)) return { error: 'Jornada inválida.' };
  const ev = await loadEvent(id);
  if (!ev) return { error: 'La jornada no existe.' };
  const p = await rescorePayload(ev);
  if (!p.total) return { error: 'La jornada no tiene saltos.' };
  const r = await callWrite<number>('apply_scores', {
    p_event: id, p_scores: p.scores, p_actor: s.userId, p_who: actorName(s),
    p_text: `Se recalcularon ${p.done} saltos con los ajustes de la jornada`,
  });
  if (r.error) return { error: r.error };
  revalidatePath(`/admin/events/${id}`, 'layout');
  return { saved: true, rescored: p.done };
}
