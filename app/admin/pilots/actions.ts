'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertRole } from '@/lib/auth/session';
import { actorName, callWrite, type FormState } from '@/lib/admin/write';

const ID = /^p[0-9a-z]{4,40}$/i;

// Organizers and judges register pilots (as on the previous platform, where judges could add them).
export async function savePilot(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin', 'judge'); } catch (e) { return { error: (e as Error).message }; }
  const rawId = String(form.get('id') ?? '');
  const id = ID.test(rawId) ? rawId : null;
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: 'Poné el nombre del piloto.' };
  const pilot = {
    id, name, suit: String(form.get('suit') ?? '').trim(), team: String(form.get('team') ?? '').trim(),
    gender: form.get('gender') === 'F' ? 'F' : '', // 5.1.2: female standings
  };
  const r = await callWrite<string>('save_pilot', { p_pilot: pilot, p_actor: s.userId, p_who: actorName(s) });
  if (r.error) return { error: r.error };
  revalidatePath('/admin/pilots');
  if (id) revalidatePath(`/admin/pilots/${id}`);
  return { saved: true };
}

export async function deletePilot(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin'); } catch (e) { return { error: (e as Error).message }; }
  const id = String(form.get('id') ?? '');
  if (!ID.test(id)) return { error: 'Piloto inválido.' };
  const r = await callWrite('delete_pilot', { p_id: id, p_actor: s.userId, p_who: actorName(s), p_reason: String(form.get('reason') ?? '').trim() || null });
  if (r.error) return { error: r.error };
  revalidatePath('/admin/pilots');
  redirect('/admin/pilots');
}
