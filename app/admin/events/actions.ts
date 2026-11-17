'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertRole } from '@/lib/auth/session';
import { actorName, callWrite, type FormState } from '@/lib/admin/write';
import { parseEventSettings, SettingsError } from '@/lib/events/settings';

const ID = /^e[0-9a-z]{4,40}$/i;

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
  const r = await callWrite<string>('save_event', { p_event: { ...settings, id }, p_actor: s.userId, p_who: actorName(s) });
  if (r.error) return { error: r.error };
  revalidatePath('/admin/events');
  if (!id) redirect(`/admin/events/${r.data}`);
  revalidatePath(`/admin/events/${id}`);
  return { saved: true };
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
