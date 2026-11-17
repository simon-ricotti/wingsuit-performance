'use server';
import { revalidatePath } from 'next/cache';
import { assertRole, type AppRole } from '@/lib/auth/session';
import { actorName, callWrite, type FormState } from '@/lib/admin/write';
import { ROLES } from '@/lib/auth/roles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function setUserAccess(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin'); } catch (e) { return { error: (e as Error).message }; }
  const user = String(form.get('user') ?? '');
  const role = String(form.get('role') ?? '') as AppRole;
  const pilot = String(form.get('pilot') ?? '') || null;
  if (!UUID.test(user) || !ROLES.includes(role)) return { error: 'Datos inválidos.' };
  const r = await callWrite('set_user_access', {
    p_user: user, p_role: role, p_pilot: pilot, p_display_name: String(form.get('displayName') ?? ''),
    p_actor: s.userId, p_who: actorName(s),
  });
  if (r.error) return { error: r.error };
  revalidatePath('/admin/users');
  return { saved: true };
}
