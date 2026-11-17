'use server';
import { revalidatePath } from 'next/cache';
import { assertRole } from '@/lib/auth/session';
import { actorName, callWrite, type FormState } from '@/lib/admin/write';
import { createAdminClient } from '@/lib/supabase/admin';
import { rowToJump, type EventRow, type JumpRow, type ReviewRow } from '@/lib/data/rows';
import { roundLabel, TASK_LABEL } from '@/lib/jumps/score';
import { jumpStatus } from '@/lib/standings/views';

/** 5.4.2: a task of a round is validated when all its jumps are reviewed; until then results are provisional. */
export async function setTaskValidation(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin', 'judge'); } catch (e) { return { error: (e as Error).message }; }
  const eventId = String(form.get('event') ?? ''), slot = String(form.get('slot') ?? ''), validate = form.get('validate') === '1';
  const m = /^(time|distance|speed)\|(\d{1,3})$/.exec(slot);
  if (!m || !/^e[0-9a-z]{4,40}$/i.test(eventId)) return { error: 'Tarea inválida.' };
  const [, task, round] = m;
  if (validate) {
    const admin = createAdminClient();
    const [{ data: ev }, { data: rows }, { data: reviews }] = await Promise.all([
      admin.from('events').select('judging, lane').eq('id', eventId).maybeSingle<Pick<EventRow, 'judging' | 'lane'>>(),
      admin.from('jumps').select('*').eq('event_id', eventId).eq('task', task).eq('round', +round).returns<JumpRow[]>(),
      admin.from('reviews').select('pilot_id, task, round, reviewer_name, legacy_uid, at').eq('event_id', eventId).eq('task', task).eq('round', +round).returns<ReviewRow[]>(),
    ]);
    const live = (rows ?? []).map((r) => rowToJump(r, reviews ?? [])).filter((j) => !j.void);
    if (!ev || !live.length || live.some((j) => jumpStatus(ev, j).code !== 'ok')) return { error: 'Faltan saltos por revisar en esta tarea.' };
  }
  const label = `${TASK_LABEL[task as keyof typeof TASK_LABEL]} ${roundLabel(+round)}`;
  const r = await callWrite('set_task_validation', {
    p_event: eventId, p_slot: slot, p_validate: validate, p_text: `${validate ? 'Se validó' : 'Se reabrió'} la tarea ${label}`,
    p_actor: s.userId, p_who: actorName(s),
  });
  if (r.error) return { error: r.error };
  revalidatePath(`/admin/events/${eventId}`, 'layout');
  return { saved: true };
}
