'use server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export interface LoginState { sent?: string; error?: string }

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Revisá el mail.' };
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  if (error) return { error: error.status === 429 ? 'Se mandaron demasiados mails. Probá en unos minutos.' : 'No pude mandar el mail. Probá de nuevo.' };
  return { sent: email };
}
